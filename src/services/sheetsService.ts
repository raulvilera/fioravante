import type { Incident, Student } from '../types';
import { normalizeClassName } from '../utils/formatters';
import { ALLOWED_CLASSES } from '../data/studentsData';
import { supabase } from './supabaseClient';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyZwPftxQz4_Xi__K1_LKTeQFcN0kPmGQ9kOo-xLu6G2Go2BBExa5pc1FLogx9_oPLU4w/exec';

/** Set para lookup O(1) das turmas oficiais */
const ALLOWED_CLASSES_SET = new Set(ALLOWED_CLASSES);

export const loadStudentsFromSheets = async (): Promise<Student[]> => {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=BANCODEDADOSGERAL&escola=fioravante`, {
      method: 'GET',
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    const data = await response.json();

    if (data.success && Array.isArray(data.students)) {
      const alunosFiltrados: Student[] = data.students.filter((s: Student) =>
        ALLOWED_CLASSES_SET.has(normalizeClassName(s.turma || ''))
      );

      const turmasAceitas: string[] = (data.debug?.turmasAceitas || [])
        .map((t: string) => normalizeClassName(t))
        .filter((t: string) => ALLOWED_CLASSES_SET.has(t));
      (window as any).__allDetectedClasses = turmasAceitas;

      return alunosFiltrados;
    }
    throw new Error('Formato inválido');
  } catch (error) {
    console.error('Erro ao carregar alunos:', error);
    return [];
  }
};

// ── Resultado da importação ─────────────────────────────────────────────────
export interface ImportResult {
  success: boolean;
  total: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

/**
 * Importa todos os alunos da aba BANCODEDADOSGERAL da planilha Google Sheets
 * e persiste na tabela `students` do Supabase (escola = 'fioravante').
 */
export const importStudentsFromSheetsToSupabase = async (): Promise<ImportResult> => {
  const result: ImportResult = {
    success: false,
    total: 0,
    inserted: 0,
    skipped: 0,
    errors: [],
  };

  // 1. Verificar sessão
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    result.errors.push('Usuário não autenticado — faça login antes de sincronizar.');
    return result;
  }

  // 2. Buscar alunos do Google Sheets
  console.log('📥 Buscando alunos do Google Sheets...');
  let sheetsStudents: Student[] = [];
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=BANCODEDADOSGERAL&escola=fioravante`, {
      method: 'GET',
      cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.students)) {
      throw new Error('Resposta da planilha inválida');
    }
    sheetsStudents = data.students.map((s: Student) => ({
      ...s,
      turma: normalizeClassName(s.turma || ''),
    }));
    console.log(`✅ Google Sheets: ${sheetsStudents.length} alunos encontrados`);
  } catch (err) {
    result.errors.push(`Falha ao acessar Google Sheets: ${String(err)}`);
    return result;
  }

  result.total = sheetsStudents.length;
  if (sheetsStudents.length === 0) {
    result.errors.push('Nenhum aluno retornado pela planilha.');
    return result;
  }

  // 3. Apagar registros synced anteriores
  console.log('🗑️ Removendo sincronizações antigas do Supabase...');
  const { error: deleteError } = await supabase
    .from('students')
    .delete()
    .like('id', 'synced-%')
    .eq('escola', 'fioravante');

  if (deleteError) {
    result.errors.push(`Aviso: falha ao limpar registros antigos — ${deleteError.message}`);
  }

  // 4. Deduplica por RA
  const seen = new Set<string>();
  const unique = sheetsStudents.filter(s => {
    const key = (s.ra || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  result.skipped = sheetsStudents.length - unique.length;
  console.log(`📋 ${unique.length} alunos únicos (${result.skipped} duplicatas ignoradas)`);

  // 5. Inserir em lotes de 500
  const CHUNK_SIZE = 500;
  const timestamp = Date.now();

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((s, idx) => ({
      id: `synced-${timestamp}-${i + idx}`,
      nome: s.nome?.toUpperCase().trim() || '(SEM NOME)',
      ra: (s.ra || '').trim(),
      turma: s.turma,
      escola: 'fioravante',
    }));

    const { error } = await supabase.from('students').insert(rows);
    if (error) {
      const msg = `Erro no lote ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`;
      console.error('❌', msg);
      result.errors.push(msg);
    } else {
      result.inserted += chunk.length;
      console.log(`✅ Lote ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} alunos inseridos`);
    }
  }

  result.success = result.inserted > 0;
  console.log(`🎉 Importação concluída: ${result.inserted}/${result.total} alunos no Supabase`);
  return result;
};

/** Monta string legível dos encaminhamentos do professor */
const formatProfReferrals = (incident: Incident): string => {
  const refs = incident.professorReferrals || [];
  if (refs.length > 0) {
    return refs.map(r => {
      const label =
        r.type === 'orientacao_individual' ? 'Orientação Individual' :
        r.type === 'encaminhamento_gestao' ? 'Enc. Equipe Gestora' :
        r.type === 'busca_ativa'           ? 'Busca Ativa' : r.type;
      return r.description ? `${label}: ${r.description}` : label;
    }).join(' | ');
  }
  if (incident.referralType === 'orientacao_individual') {
    return incident.referralDescription
      ? `Orientação Individual: ${incident.referralDescription}`
      : 'Orientação Individual';
  }
  if (incident.referralType === 'encaminhamento_gestao') return 'Enc. Equipe Gestora';
  if (incident.referralType === 'busca_ativa')           return 'Busca Ativa';
  return '---';
};

export const saveToGoogleSheets = async (incident: Incident) => {
  try {
    const isGestao = incident.source === 'gestao';

    const SHEET_REGISTROS_ID = '1I2e7NexDqkZZ6Pc6fEQ6QTJCdY2xGgo_SicORFv4zGI';
    const sheetName = isGestao ? 'BANCODEALUNOS' : 'OCORRENCIASDOSPROFESSORES';

    const pdfLinkFormula = incident.pdfUrl
      ? `=HYPERLINK("${incident.pdfUrl}"; "📄 ABRIR PDF")`
      : '---';

    const encaminhamentosProf = formatProfReferrals(incident);

    const valuesProfessor = [
      incident.date,
      incident.professorName?.toUpperCase() || '---',
      incident.classRoom || '---',
      incident.studentName.toUpperCase(),
      incident.ra || '---',
      incident.discipline?.toUpperCase() || 'N/A',
      incident.irregularities?.toUpperCase() || 'NENHUMA',
      incident.description.toUpperCase(),
      encaminhamentosProf,
      incident.time || '---',
      pdfLinkFormula,
    ];

    const valuesGestao = [
      incident.date,
      incident.studentName.toUpperCase(),
      incident.classRoom || '---',
      incident.professorName?.toUpperCase() || 'GESTAO',
      incident.ra || '---',
      incident.category || 'OCORRÊNCIA',
      incident.description.toUpperCase(),
      encaminhamentosProf,
      incident.registerDate || incident.date,
      incident.returnDate || 'N/A',
      pdfLinkFormula,
    ];

    const payload = {
      spreadsheetId: SHEET_REGISTROS_ID,
      sheetName,
      escola: 'fioravante',
      values: isGestao ? valuesGestao : valuesProfessor,
    };

    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    return true;
  } catch (error) {
    console.error('Erro ao sincronizar com Google Sheets:', error);
    return false;
  }
};
