import type { Incident, Student } from '../types';
import { normalizeClassName } from '../utils/formatters';
import { ALLOWED_CLASSES } from '../data/studentsData';
import { supabase } from './supabaseClient';

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzPcQPGLeEhzpM5Dk1Pv3Rxgkf8nCY4LN-Ou3eGzkx30QxfHuzUdMghd-CVwtR66b19wQ/exec';

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

export interface ImportResult {
  success: boolean;
  total: number;
  inserted: number;
  skipped: number;
  errors: string[];
}

export const importStudentsFromSheetsToSupabase = async (): Promise<ImportResult> => {
  const result: ImportResult = { success: false, total: 0, inserted: 0, skipped: 0, errors: [] };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    result.errors.push('Usuário não autenticado.');
    return result;
  }

  // 1. Buscar alunos do Google Sheets
  console.log('📥 Buscando alunos do Google Sheets...');
  let sheetsStudents: Student[] = [];
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?sheetName=BANCODEDADOSGERAL&escola=fioravante`, {
      method: 'GET', cache: 'no-cache',
    });
    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
    const data = await response.json();
    if (!data.success || !Array.isArray(data.students)) throw new Error('Resposta da planilha inválida');
    sheetsStudents = data.students.map((s: Student) => ({
      ...s,
      turma: normalizeClassName(s.turma || ''),
    }));
    console.log(`✅ Google Sheets: ${sheetsStudents.length} alunos`);
  } catch (err) {
    result.errors.push(`Falha ao acessar Google Sheets: ${String(err)}`);
    return result;
  }

  result.total = sheetsStudents.length;
  if (sheetsStudents.length === 0) {
    result.errors.push('Nenhum aluno retornado pela planilha.');
    return result;
  }

  // 2. Deduplica por RA
  const seen = new Set<string>();
  const unique = sheetsStudents.filter(s => {
    const key = (s.ra || '').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  result.skipped = sheetsStudents.length - unique.length;

  // 3. Usar RA como parte do id para garantir unicidade e permitir upsert seguro
  const CHUNK_SIZE = 500;

  for (let i = 0; i < unique.length; i += CHUNK_SIZE) {
    const chunk = unique.slice(i, i + CHUNK_SIZE);
    const rows = chunk.map((s) => ({
      id: `synced-ra-${(s.ra || '').trim()}`,
      nome: s.nome?.toUpperCase().trim() || '(SEM NOME)',
      ra: (s.ra || '').trim(),
      turma: s.turma,
      escola: 'fioravante',
    }));

    const { error } = await supabase.from('students').upsert(rows, { onConflict: 'id' });
    if (error) {
      const msg = `Erro no lote ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`;
      console.error('❌', msg);
      result.errors.push(msg);
    } else {
      result.inserted += chunk.length;
      console.log(`✅ Lote ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.length} alunos`);
    }
  }

  result.success = result.inserted > 0;
  console.log(`🎉 Concluído: ${result.inserted}/${result.total} alunos no Supabase`);
  return result;
};

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
    const pdfLinkFormula = incident.pdfUrl ? `=HYPERLINK("${incident.pdfUrl}"; "📄 ABRIR PDF")` : '---';
    const encaminhamentosProf = formatProfReferrals(incident);

    const valuesProfessor = [
      incident.date, incident.professorName?.toUpperCase() || '---',
      incident.classRoom || '---', incident.studentName.toUpperCase(),
      incident.ra || '---', incident.discipline?.toUpperCase() || 'N/A',
      incident.irregularities?.toUpperCase() || 'NENHUMA',
      incident.description.toUpperCase(), encaminhamentosProf,
      incident.time || '---', pdfLinkFormula,
    ];

    const valuesGestao = [
      incident.date, incident.studentName.toUpperCase(),
      incident.classRoom || '---', incident.professorName?.toUpperCase() || 'GESTAO',
      incident.ra || '---', incident.category || 'OCORRÊNCIA',
      incident.description.toUpperCase(), encaminhamentosProf,
      incident.registerDate || incident.date, incident.returnDate || 'N/A',
      pdfLinkFormula,
    ];

    await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST', mode: 'no-cors', cache: 'no-cache',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        spreadsheetId: SHEET_REGISTROS_ID,
        sheetName,
        escola: 'fioravante',
        values: isGestao ? valuesGestao : valuesProfessor,
      }),
    });
    return true;
  } catch (error) {
    console.error('Erro ao sincronizar com Google Sheets:', error);
    return false;
  }
};
