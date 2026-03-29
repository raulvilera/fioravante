import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import ProfessorView, { SearchModal } from './components/ProfessorView';
import ResetPassword from './components/ResetPassword';
import { Incident, User, Student } from './types';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import { saveToGoogleSheets, loadStudentsFromSheets, importStudentsFromSheetsToSupabase } from './services/sheetsService';
import { getRoleFromLocalDB, PROFESSORS_DB } from './data/professorsData';
import { STUDENTS_DB } from './data/studentsData';
import { normalizeClassName } from './utils/formatters';

// ✅ Lista hardcoded de gestores — funciona mesmo se professorsData.ts
// tiver problema de import ou build. Fonte de verdade absoluta.
// E-mails de gestão EXCLUSIVA (sem visão de professor)
const GESTAO_EMAILS_HARDCODED = [
  'gestao@escola.com',
];

// E-mails com acesso DUPLO (gestor + professor, podem alternar entre as duas visões)
const DUAL_ACCESS_EMAILS = [
  'vilera@prof.educacao.sp.gov.br',
  'patriciavilera@gmail.com',
  'patriciavilera@gmai.com',
  'sueli.silva9@educacao.sp.gov.br',
  'marciacoelho@prof.educacao.sp.gov.br',
];

type View = 'login' | 'dashboard' | 'resetPassword' | 'unauthorized';
type ViewMode = 'gestor' | 'professor';

const App = () => {
  const [view, setView] = useState<View>('login');
  const [user, setUser] = useState<User | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado para controlar visualização (gestor/professor) para usuários com acesso dual
  const [viewMode, setViewMode] = useState<ViewMode>('gestor');

  const [searchModalOpen, setSearchModalOpen] = useState(false);

  // Ref que trava o user após o onLogin ser chamado.
  // Impede que qualquer evento assíncrono posterior (onAuthStateChange, TOKEN_REFRESHED)
  // sobrescreva o role já definido corretamente pelo fluxo de login.
  const lockedUserRef = React.useRef<User | null>(null);

  // Flag que indica que o Login.tsx está processando — onAuthStateChange deve ignorar
  // eventos SIGNED_IN durante esse período para não interferir com o fluxo de login.
  const loginInProgressRef = React.useRef<boolean>(false);

  useEffect(() => {
    let authListener: any = null;

    const initApp = async () => {
      // 1. Carregar cache de incidentes — filtra SOMENTE registros da escola Fioravante
      // Registros com escola='fioravante' são aceitos.
      // Registros SEM campo escola são aceitos apenas se o authorEmail pertence ao Fioravante.
      // Registros de outras escolas (escola='lkm' etc.) são sempre removidos.
      const cached = localStorage.getItem('fioravante_incidents_cache');
      if (cached) {
        try {
          const all = JSON.parse(cached);
          const fioravanteEmails = new Set(
            PROFESSORS_DB.map((p: any) => p.email.toLowerCase().trim())
          );
          const fioravanteOnly = all.filter((inc: any) => {
            if (inc.escola === 'fioravante') return true;
            if (inc.escola && inc.escola !== 'fioravante') return false;
            // sem campo escola: aceita só se authorEmail é do Fioravante
            if (inc.authorEmail) {
              return fioravanteEmails.has(inc.authorEmail.toLowerCase().trim());
            }
            // sem escola e sem authorEmail: descarta para não exibir lixo
            return false;
          });
          if (fioravanteOnly.length !== all.length) {
            console.log(`🧹 [CACHE] Removidos ${all.length - fioravanteOnly.length} registros de outras escolas do cache.`);
            localStorage.setItem('fioravante_incidents_cache', JSON.stringify(fioravanteOnly));
          }
          setIncidents(fioravanteOnly);
        } catch {
          localStorage.removeItem('fioravante_incidents_cache');
        }
      }

      if (isSupabaseConfigured && supabase) {
        try {
          // O link de recuperação pode chegar como hash (#) ou query string (?).
          // Supabase v2 envia: ?token_hash=...&type=recovery
          // Supabase v1 enviava: #access_token=...&type=recovery
          const _hash = window.location.hash;
          const _search = window.location.search;

          let isDuringRecovery =
            _hash.includes('type=recovery') ||
            _hash.includes('access_token=') ||
            _search.includes('type=recovery') ||
            _search.includes('token_hash=');

          if (isDuringRecovery) {
            console.log('🔑 [APP] MODO RECUPERAÇÃO ATIVADO - Bloqueando redirecionamentos');
            setView('resetPassword');
          }

            // Função auxiliar para buscar role com timeout e fallback
            const fetchRoleSafe = async (email: string) => {
              const normalizedEmail = email.toLowerCase().trim();

              // ✅ PRIORIDADE MÁXIMA: E-mails de gestão exclusiva NUNCA consultam o banco.
              if (GESTAO_EMAILS_HARDCODED.includes(normalizedEmail)) {
                console.log('🛡️ [APP] Gestão Exclusiva — role fixo gestor:', normalizedEmail);
                return 'gestor';
              }

              // ✅ E-mail com acesso dual sempre entra como gestor no contexto do App
              if (DUAL_ACCESS_EMAILS.includes(normalizedEmail)) {
                console.log('🔄 [APP] Acesso dual — role gestor:', normalizedEmail);
                return 'gestor';
              }

              // CORREÇÃO DEFINITIVA: busca SEMPRE pelo email exato.
              // Nunca adicionar variantes de domínio — isso causava vilera@professor
              // retornar o role de vilera@prof (gestor) por colisão na query.
              const query = supabase
                .from('authorized_professors')
                .select('role')
                .eq('email', normalizedEmail)
                .eq('escola', 'fioravante')
                .maybeSingle();

              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('TIMEOUT_DB')), 4000)
              );

              try {
                const result: any = await Promise.race([query, timeoutPromise]);
                const dbRole = result.data?.role || null;
                if (dbRole) return dbRole;
                return getRoleFromLocalDB(normalizedEmail);
              } catch (e) {
                console.warn('⚠️ [APP] Fallback local ativado para:', normalizedEmail);
                return getRoleFromLocalDB(normalizedEmail);
              }
            };

          // 3. Monitor de autenticação
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[APP] Auth Event: ${event}`);

            if (event === 'PASSWORD_RECOVERY') {
              isDuringRecovery = true;
              setView('resetPassword');
              return;
            }

            // Evita processamento desnecessário do evento inicial
            if (event === 'INITIAL_SESSION') return;

            // ✅ Se o Login.tsx está processando, ignorar eventos SIGNED_IN/TOKEN_REFRESHED
            // para não interferir com o fluxo de login que já determina o role corretamente.
            if (loginInProgressRef.current && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
              console.log('⏸️ [APP] onAuthStateChange ignorado — login em progresso');
              return;
            }

            if (session?.user) {
              if (isDuringRecovery) {
                setView('resetPassword');
                return;
              }

              const sessionEmail = session.user.email!.toLowerCase();

              // ✅ TRAVA DEFINITIVA: se já existe um user definido (pelo onLogin ou
              // por uma sessão anterior), não sobrescrever em nenhuma hipótese.
              // O role correto já foi determinado — TOKEN_REFRESHED e SIGNED_IN
              // não devem mudar isso.
              if (lockedUserRef.current?.email === sessionEmail) {
                console.log('🔒 [APP] onAuthStateChange bloqueado — user travado:', sessionEmail);
                setView('dashboard');
                return;
              }

              // Só chega aqui se não há user definido (ex: reload da página com sessão ativa)
              // ✅ BLINDAGEM: gestão exclusiva define 'gestor' diretamente
              if (GESTAO_EMAILS_HARDCODED.includes(sessionEmail) || DUAL_ACCESS_EMAILS.includes(sessionEmail)) {
                console.log('🛡️ [APP] onAuthStateChange — role fixo gestor:', sessionEmail);
                setUser(prev => {
                  if (prev?.email === sessionEmail && prev?.role === 'gestor') return prev;
                  return { email: sessionEmail, role: 'gestor' };
                });
                setView('dashboard');
                return;
              }

              const role = await fetchRoleSafe(sessionEmail);

              if (role) {
                setUser(prev => {
                  if (prev?.email === sessionEmail && prev?.role === role) return prev;
                  return { email: sessionEmail, role: role as any };
                });
                setView('dashboard');
              } else {
                console.error('❌ [APP] Usuário não autorizado:', sessionEmail);
                await supabase.auth.signOut();
                setUser(null);
                setView('login');
              }
            } else if (event === 'SIGNED_OUT') {
              isDuringRecovery = false;
              setUser(null);
              setView('login');
            }
          });

          authListener = subscription;

          // 4. Verificação inicial da sessão
          if (!isDuringRecovery) {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              const sessionEmail = session.user.email!.toLowerCase();

              // ✅ Mesma blindagem: gestão exclusiva e dual access nunca consultam o banco
              if (GESTAO_EMAILS_HARDCODED.includes(sessionEmail) || DUAL_ACCESS_EMAILS.includes(sessionEmail)) {
                console.log('🛡️ [APP] getSession — role fixo gestor:', sessionEmail);
                setUser(prev => {
                  if (prev?.email === sessionEmail && prev?.role === 'gestor') return prev;
                  return { email: sessionEmail, role: 'gestor' };
                });
                setView('dashboard');
              } else {
                const role = await fetchRoleSafe(sessionEmail);
                if (role) {
                  setUser(prev => {
                    if (prev?.email === sessionEmail && prev?.role === role) return prev;
                    return { email: sessionEmail, role: role as any };
                  });
                  setView('dashboard');
                } else {
                  setUser({ email: sessionEmail, role: 'professor' });
                  setView('unauthorized');
                }
              }
            }
          }
        } catch (e) {
          console.warn("Erro ao inicializar auth:", e);
        }
      }

      // 5. Iniciar sincronização de pendentes em background (não bloqueia o loading)
      if (navigator.onLine) {
        syncPendingRecords().catch(() => {});
      }

      setLoading(false);
    };

    const failsafeTimeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    initApp();

    return () => {
      if (authListener) authListener.unsubscribe();
      clearTimeout(failsafeTimeout);
    };
  }, []); // Sem dependência de [view] para evitar loop

  useEffect(() => {
    const loadStudentsData = async (forceSync = false) => {
      let finalStudents: Student[] = [];
      let loadedFromSupabase = false;

      // 1. Tentar carregar do Supabase primeiro (Fonte Primária) - COM PAGINAÇÃO
      if (isSupabaseConfigured && supabase && !forceSync) {
        try {
          let allData: any[] = [];
          let errorOccurred = false;
          let from = 0;
          const PAGE_SIZE = 1000;
          let hasMore = true;

          while (hasMore) {
            const { data, error } = await supabase
              .from('students')
              .select('*')
              .order('nome')
              .range(from, from + PAGE_SIZE - 1);

            if (error) {
              console.error('⚠️ Supabase Error fetching students:', error);
              errorOccurred = true;
              break;
            }

            if (data && data.length > 0) {
              allData = [...allData, ...data];
              if (data.length < PAGE_SIZE) {
                hasMore = false;
              } else {
                from += PAGE_SIZE;
              }
            } else {
              hasMore = false;
            }
          }

          if (!errorOccurred && allData.length > 0) {
            finalStudents = allData.map(s => ({
              id: s.id,
              nome: s.nome,
              ra: s.ra,
              turma: normalizeClassName(s.turma)
            }));
            loadedFromSupabase = true;
            console.log(`✅ Supabase: Total de ${finalStudents.length} alunos carregados (Paginado)`);
          }
        } catch (e) {
          console.warn('⚠️ Supabase: Falha ao carregar alunos:', e);
        }
      }

      // 2. Se falhar Supabase ou for Sincronização Forçada, carregar do Google Sheets
      if (!loadedFromSupabase || forceSync) {
        try {
          const sheetsStudents = await loadStudentsFromSheets();
          if (sheetsStudents.length > 0) {
            finalStudents = sheetsStudents.map(s => ({
              ...s,
              turma: normalizeClassName(s.turma)
            }));
            console.log(`✅ Google Sheets: Carregados ${sheetsStudents.length} alunos`);

            // Sincronizar com Supabase se houver conexão E usuário logado (Permitindo para todos os perfis)
            const { data: { session } } = await supabase.auth.getSession();

            if (isSupabaseConfigured && supabase && session) {
              try {
                // Apaga APENAS registros de sincronizações automáticas anteriores (prefixo 'synced-')
                await supabase.from('students').delete().like('id', 'synced-%');

                // Deduplica por RA antes de inserir (evita erro ON CONFLICT duplicado no mesmo lote)
                const seen = new Set<string>();
                const uniqueStudents = sheetsStudents.filter(s => {
                  if (seen.has(s.ra)) return false;
                  seen.add(s.ra);
                  return true;
                });

                // Inserir em lotes para evitar problemas de payload grande
                const CHUNK_SIZE = 500;
                for (let i = 0; i < uniqueStudents.length; i += CHUNK_SIZE) {
                  const chunk = uniqueStudents.slice(i, i + CHUNK_SIZE);
                  const studentsToInsert = chunk.map((s, index) => ({
                    id: `synced-${Date.now()}-${i + index}`,
                    nome: s.nome,
                    ra: s.ra,
                    turma: normalizeClassName(s.turma)
                  }));

                  const { error } = await supabase.from('students').insert(studentsToInsert);
                  if (error) {
                    console.error(`❌ Erro ao sincronizar lote ${i / CHUNK_SIZE}:`, error.message);
                  }
                }
                console.log('✅ Supabase: Sincronização concluída (registros manuais preservados)');
              } catch (syncError) {
                console.warn('⚠️ Supabase: Erro crítico na sincronização:', syncError);
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ Google Sheets: Falha ao carregar');
        }
      }

      // 4. Último fallback: Dados locais
      if (finalStudents.length === 0) {
        finalStudents = STUDENTS_DB;
        console.log(`⚠️ Local: Usando ${STUDENTS_DB.length} alunos (studentsData.ts)`);
      } else {
        // Mescla alunos do banco local para turmas que não vieram do Supabase/Sheets
        // Normaliza as turmas carregadas para comparação robusta
        const turmasCarregadas = new Set(finalStudents.map(s => normalizeClassName(s.turma)));
        const alunosFaltando = STUDENTS_DB.filter(s => !turmasCarregadas.has(normalizeClassName(s.turma)));
        if (alunosFaltando.length > 0) {
          console.log(`⚠️ Mesclando ${alunosFaltando.length} alunos de turmas faltantes do banco local`);
          // Adiciona os alunos faltando com a turma já normalizada
          finalStudents = [...finalStudents, ...alunosFaltando.map(s => ({ ...s, turma: normalizeClassName(s.turma) }))];
        }
      }

      // Garante que TODOS os estudantes na lista final tenham a turma normalizada
      finalStudents = finalStudents.map(s => ({ ...s, turma: normalizeClassName(s.turma) }));

      setStudents(finalStudents);

      // Gerar lista de turmas dinamicamente — inclui turmas da planilha mesmo sem alunos
      const fromStudents = finalStudents.map(s => normalizeClassName(s.turma));
      const fromSheetsRaw: string[] = (window as any).__allDetectedClasses || [];
      const fromSheets = fromSheetsRaw.map(t => normalizeClassName(t));
      const fromLocalDB = STUDENTS_DB.map(s => normalizeClassName(s.turma));

      const uniqueClasses = Array.from(new Set([...fromStudents, ...fromSheets, ...fromLocalDB]))
        .filter(t => {
          if (!t || t === '---') return false;
          const low = t.toLowerCase();
          return !low.includes('desconsidera') && !low.includes('desconsidere');
        });

      const sortedClasses = uniqueClasses.sort((a, b) => {
        const getOrder = (s: string) => {
          const norm = s.toUpperCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Z0-9]/g, '');

          if (norm.includes('6ANO')) return 1;
          if (norm.includes('7ANO')) return 2;
          if (norm.includes('8ANO')) return 3;
          if (norm.includes('9ANO')) return 4;
          if (norm.includes('1SERIE')) return 5;
          if (norm.includes('2SERIE')) return 6;
          if (norm.includes('3SERIE')) return 7;
          return 99;
        };

        const orderA = getOrder(a);
        const orderB = getOrder(b);

        if (orderA !== orderB) return orderA - orderB;

        // Para turmas da mesma série, ordena por letra (A, B, C...)
        return a.localeCompare(b, 'pt-BR', { numeric: true });
      });

      setClasses(sortedClasses);
    };

    loadStudentsData();
    (window as any).refreshStudents = (sync = false) => loadStudentsData(sync);
  }, [user]);

  const handleSyncStudents = async () => {
    setLoading(true);
    try {
      const result = await importStudentsFromSheetsToSupabase();
      if (result.success) {
        alert(
          `✅ Sincronização concluída!\n\n` +
          `• Total na planilha: ${result.total} alunos\n` +
          `• Inseridos no Supabase: ${result.inserted}\n` +
          `• Duplicatas ignoradas: ${result.skipped}` +
          (result.errors.length ? `\n\n⚠️ Avisos:\n${result.errors.join('\n')}` : '')
        );
        // Recarrega a lista de alunos do Supabase após a importação
        const loadFn = (window as any).refreshStudents;
        if (loadFn) await loadFn(false);
      } else {
        alert(
          `❌ Falha na sincronização.\n\n` +
          (result.errors.length ? result.errors.join('\n') : 'Erro desconhecido.')
        );
      }
    } catch (err) {
      alert(`Erro inesperado ao sincronizar alunos:\n${String(err)}`);
    } finally {
      setLoading(false);
    }
  };


  // ── Importar ocorrências históricas do Google Sheets ──────────────────────
  const importIncidentsFromSheets = async () => {
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby_8NW9IrcpLvhEyNqwtp1G6s5MfInqrnYOKxCLj8cpxXqdufx7AiHDSJ9UMoT0mekHpw/exec';

    const makeId = (prefix: string, date: string, name: string, idx: number) =>
      `imported-${prefix}-${(date || '').replace(/\//g, '')}-${(name || '').slice(0, 8).replace(/\s/g, '')}-${idx}`;

    // Script retorna objetos com campos nomeados em data.rows
    const fetchSheetRows = async (sheetName: string): Promise<any[]> => {
      const url = `${GOOGLE_SCRIPT_URL}?sheetName=${encodeURIComponent(sheetName)}&escola=fioravante`;
      const response = await fetch(url, { method: 'GET', cache: 'no-cache' });
      if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
      const data = await response.json();
      if (data.success && Array.isArray(data.rows)) return data.rows;
      throw new Error(data.error || `Resposta inválida para ${sheetName}`);
    };

    const rows: any[] = [];
    let totalProfessor = 0, totalGestao = 0;
    const errors: string[] = [];

    try {
      const profRows = await fetchSheetRows('OCORRENCIASDOSPROFESSORES');
      totalProfessor = profRows.length;
      profRows.forEach((r, idx) => rows.push({
        id: makeId('prof', r.date, r.student_name, idx),
        escola: 'fioravante',
        date: r.date || '',
        professor_name: (r.professor_name || '').toUpperCase(),
        class_room: r.class_room || '',
        student_name: (r.student_name || '').toUpperCase(),
        ra: r.ra || '',
        discipline: (r.discipline || '').toUpperCase(),
        irregularities: (r.irregularities || '').toUpperCase(),
        description: (r.description || '').toUpperCase(),
        time: r.time || '',
        pdf_url: r.pdf_url || null,
        source: 'professor', status: 'Resolvida', severity: 'Baixa',
        category: 'OCORRÊNCIA', author_email: '',
      }));
    } catch (err) { errors.push(`Erro ao ler OCORRENCIASDOSPROFESSORES: ${String(err)}`); }

    try {
      const gestaoRows = await fetchSheetRows('BANCODEALUNOS');
      totalGestao = gestaoRows.length;
      gestaoRows.forEach((r, idx) => rows.push({
        id: makeId('gest', r.date, r.student_name, idx),
        escola: 'fioravante',
        date: r.date || '',
        student_name: (r.student_name || '').toUpperCase(),
        class_room: r.class_room || '',
        professor_name: (r.professor_name || '').toUpperCase(),
        ra: r.ra || '',
        category: (r.category || 'OCORRÊNCIA').toUpperCase(),
        description: (r.description || '').toUpperCase(),
        register_date: r.register_date || r.date || '',
        return_date: r.return_date || '',
        pdf_url: r.pdf_url || null,
        source: 'gestao', status: 'Resolvida', severity: 'Baixa',
        discipline: '', irregularities: '', time: '', author_email: '',
      }));
    } catch (err) { errors.push(`Erro ao ler BANCODEALUNOS: ${String(err)}`); }

    if (rows.length === 0) return { success: false, totalProfessor, totalGestao, inserted: 0, errors };

    let inserted = 0;
    const CHUNK_SIZE = 200;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const { error } = await supabase.from('incidents').upsert(rows.slice(i, i + CHUNK_SIZE), { onConflict: 'id' });
      if (error) errors.push(`Erro no lote ${Math.floor(i / CHUNK_SIZE) + 1}: ${error.message}`);
      else inserted += rows.slice(i, i + CHUNK_SIZE).length;
    }

    return { success: inserted > 0, totalProfessor, totalGestao, inserted, errors };
  };

  const handleImportIncidents = async () => {
    setLoading(true);
    try {
      const result = await importIncidentsFromSheets();
      if (result.success) {
        alert(
          `✅ Importação concluída!\n\n` +
          `• Ocorrências de professores: ${result.totalProfessor}\n` +
          `• Ocorrências da gestão: ${result.totalGestao}\n` +
          `• Inseridas no Supabase: ${result.inserted}` +
          (result.errors.length ? `\n\n⚠️ Avisos:\n${result.errors.join('\n')}` : '')
        );
        await loadCloudIncidents();
      } else {
        alert(`❌ Falha na importação.\n\n` + (result.errors.length ? result.errors.join('\n') : 'Erro desconhecido.'));
      }
    } catch (err) {
      alert(`Erro inesperado:\n${String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadCloudIncidents();
  }, [user]);

  // Mapeia um registro bruto do Supabase para o tipo Incident
  const mapSupabaseToIncident = (i: any): Incident => ({
    id: i.id,
    escola: i.escola,
    studentName: i.student_name,
    ra: i.ra,
    classRoom: i.class_room,
    professorName: i.professor_name,
    discipline: i.discipline,
    date: i.date,
    time: i.time,
    registerDate: i.register_date,
    returnDate: i.return_date,
    description: i.description,
    irregularities: i.irregularities,
    category: i.category,
    severity: i.severity as any,
    status: i.status as any,
    source: i.source as any,
    pdfUrl: i.pdf_url,
    authorEmail: i.author_email,
    managementFeedback: i.management_feedback,
    managementFeedbackAt: i.management_feedback_at,
    managementFeedbackReadAt: i.management_feedback_read_at,
    lastViewedAt: i.last_viewed_at
  });

  const loadCloudIncidents = async () => {
    if (!isSupabaseConfigured || !supabase) return;
    try {
      // ── Filtro de 30 dias: apenas registros recentes são carregados na inicialização.
      // Os registros anteriores permanecem intactos na nuvem e podem ser consultados
      // a qualquer momento pelo Histórico Permanente por Aluno.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffISO = thirtyDaysAgo.toISOString();

      console.log(`📅 [LOAD] Carregando registros a partir de: ${cutoffISO}`);

      const { data: incData, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('escola', 'fioravante')
        .gte('created_at', cutoffISO)
        .order('created_at', { ascending: false });

      if (!error && incData) {
        const mapped: Incident[] = incData.map(mapSupabaseToIncident);
        setIncidents(mapped);
        localStorage.setItem('fioravante_incidents_cache', JSON.stringify(mapped));
        console.log(`✅ [LOAD] ${mapped.length} registros dos últimos 30 dias carregados.`);
      }
    } catch (e) { console.warn("Sincronização offline."); }
  };

  // Busca o histórico COMPLETO de um aluno específico (todos os registros, sem limite de data)
  const loadFullStudentHistory = async (ra: string): Promise<Incident[]> => {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      const { data, error } = await supabase
        .from('incidents')
        .select('*')
        .eq('escola', 'fioravante')
        .eq('ra', ra)
        .order('created_at', { ascending: false });
      if (!error && data) return data.map(mapSupabaseToIncident);
    } catch (e) { console.warn("Erro ao buscar histórico completo:", e); }
    return [];
  };

  // Busca registros anteriores a 30 dias para consulta/impressão (sem alterar o estado principal)
  const loadArchivedIncidents = async (filters?: { studentName?: string; classRoom?: string; dateFrom?: string; dateTo?: string }): Promise<Incident[]> => {
    if (!isSupabaseConfigured || !supabase) return [];
    try {
      // Busca TODOS os registros — sem filtro de data — para garantir que
      // registros antigos (com created_at nulo ou inconsistente) sejam encontrados
      let query = supabase
        .from('incidents')
        .select('*')
        .eq('escola', 'fioravante')
        .order('created_at', { ascending: false })
        .limit(500);

      if (filters?.studentName) {
        query = query.ilike('student_name', `%${filters.studentName}%`);
      }
      if (filters?.classRoom) {
        query = query.eq('class_room', filters.classRoom);
      }

      const { data, error } = await query;
      if (!error && data) return data.map(mapSupabaseToIncident);
    } catch (e) { console.warn("Erro ao buscar arquivo histórico:", e); }
    return [];
  };

  const syncPendingRecords = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!navigator.onLine || !isSupabaseConfigured || !supabase || !session) return;

    const cached = localStorage.getItem('fioravante_incidents_cache');
    if (!cached) return;

    const currentIncidents: Incident[] = JSON.parse(cached);
    const pending = currentIncidents.filter(i => i.isPendingSync);

    if (pending.length === 0) return;

    console.log(`🔄 [SYNC] Tentando sincronizar ${pending.length} registros pendentes...`);
    let syncedIds: string[] = [];

    for (const item of pending) {
      try {
        // Tenta salvar no Supabase
        const { error } = await supabase.from('incidents').insert({
          id: item.id,
          escola: 'fioravante',
          student_name: item.studentName,
          ra: item.ra,
          class_room: item.classRoom,
          professor_name: item.professorName,
          discipline: item.discipline,
          date: item.date,
          time: item.time,
          register_date: item.registerDate,
          return_date: item.returnDate,
          description: item.description,
          irregularities: item.irregularities,
          category: item.category,
          severity: item.severity,
          status: item.status,
          source: item.source,
          pdf_url: item.pdfUrl,
          author_email: item.authorEmail
        });

        if (!error) {
          syncedIds.push(item.id);
          // Tenta salvar no Google Sheets também
          try { await saveToGoogleSheets(item); } catch (e) { console.warn("Erro ao sincronizar com Sheets durante background sync"); }
        }
      } catch (e) {
        console.error("Erro na sincronização de fundo:", e);
      }
    }

    if (syncedIds.length > 0) {
      const updatedList = currentIncidents.map(inc =>
        syncedIds.includes(inc.id) ? { ...inc, isPendingSync: false } : inc
      );
      setIncidents(updatedList);
      localStorage.setItem('fioravante_incidents_cache', JSON.stringify(updatedList));
      console.log(`✅ [SYNC] ${syncedIds.length} registros sincronizados com sucesso.`);
    }
  };

  // Listener para voltar a ficar online
  useEffect(() => {
    window.addEventListener('online', syncPendingRecords);
    return () => window.removeEventListener('online', syncPendingRecords);
  }, []);

  const handleSaveIncident = async (newIncident: Incident | Incident[]) => {
    if (!user) return;
    const items = (Array.isArray(newIncident) ? newIncident : [newIncident]).map(i => ({
      ...i, authorEmail: user.email
    }));

    // Atualização otimista
    const updatedList = [...items, ...incidents];
    setIncidents(updatedList);
    localStorage.setItem('fioravante_incidents_cache', JSON.stringify(updatedList));

    let hasError = false;

    // Importação dinâmica para evitar circular dependency ou carregar desnecessariamente
    const { uploadPDFToStorage } = await import('./services/pdfService');

    for (let item of items) {
      try {
        // 1. Verificar se precisa gerar PDF (se ainda não tem pdfUrl)
        if (!item.pdfUrl) {
          console.log(`📄 Gerando PDF para: ${item.studentName}`);
          const uploadedUrl = await uploadPDFToStorage(item);
          if (uploadedUrl) {
            item.pdfUrl = uploadedUrl;
            // Atualizar no cache também
            const cacheUpdate = updatedList.map(inc => inc.id === item.id ? { ...inc, pdfUrl: uploadedUrl } : inc);
            setIncidents(cacheUpdate);
            localStorage.setItem('fioravante_incidents_cache', JSON.stringify(cacheUpdate));
          }
        }

        // 2. Salvar no Google Sheets
        await saveToGoogleSheets(item);

        // 3. Salvar no Supabase
        if (isSupabaseConfigured && supabase) {
          const { error } = await supabase.from('incidents').insert({
            id: item.id,
            escola: 'fioravante',
            student_name: item.studentName,
            ra: item.ra,
            class_room: item.classRoom,
            professor_name: item.professorName,
            discipline: item.discipline,
            date: item.date,
            time: item.time,
            register_date: item.registerDate,
            return_date: item.returnDate,
            description: item.description,
            irregularities: item.irregularities,
            category: item.category,
            severity: item.severity,
            status: item.status,
            source: item.source,
            pdf_url: item.pdfUrl,
            author_email: item.authorEmail
          });

          if (error) {
            console.error("❌ [SUPABASE] Erro ao salvar incidente:", error.message);
            hasError = true;
          }
        }
      } catch (err) {
        console.error("❌ [ERROR] Falha na persistência:", err);
        hasError = true;
        // Marcar individualmente como pendente no cache se falhar
        const currentCache = JSON.parse(localStorage.getItem('fioravante_incidents_cache') || '[]');
        const updatedCache = currentCache.map((inc: Incident) =>
          inc.id === item.id ? { ...inc, isPendingSync: true } : inc
        );
        setIncidents(updatedCache);
        localStorage.setItem('fioravante_incidents_cache', JSON.stringify(updatedCache));
      }
    }

    if (hasError) {
      alert("⚠️ REGISTRO SALVO LOCALMENTE: No momento não há conexão estável. Seu registro foi guardado e será enviado automaticamente para a plataforma assim que a internet voltar.");
    }
  };

  const handleDeleteIncident = async (id: string) => {
    const inc = incidents.find(i => i.id === id);
    if (!inc || !user) return;

    if (inc.authorEmail && inc.authorEmail !== user.email && user.role !== 'gestor') {
      alert("ACESSO NEGADO: Você só pode excluir seus próprios registros.");
      return;
    }

    if (!window.confirm("CONFIRMAR EXCLUSÃO PERMANENTE?")) return;

    // Backup para rollback em caso de erro
    const previousIncidents = [...incidents];

    // Filtro otimista na UI
    const filtered = incidents.filter(i => i.id !== id);
    setIncidents(filtered);
    localStorage.setItem('fioravante_incidents_cache', JSON.stringify(filtered));

    if (isSupabaseConfigured && supabase) {
      try {
        console.log(`🗑️ [DELETE] Tentando excluir incidente: ${id}`);
        const { error } = await supabase.from('incidents').delete().eq('id', id);

        if (error) {
          console.error('❌ [DELETE] Erro ao excluir do banco:', error);
          // Rollback em caso de erro de permissão ou rede
          setIncidents(previousIncidents);
          localStorage.setItem('fioravante_incidents_cache', JSON.stringify(previousIncidents));

          if (error.message.includes('permission denied')) {
            alert("ERRO DE PERMISSÃO: O banco de dados não permitiu a exclusão. Verifique se você é o autor ou se tem nível de Gestor.");
          } else {
            alert(`Ocorreu um erro ao excluir do servidor: ${error.message}`);
          }
        } else {
          console.log('✅ [DELETE] Excluído com sucesso do banco de dados');
        }
      } catch (err) {
        console.error('❌ [DELETE] Erro inesperado:', err);
        setIncidents(previousIncidents);
        localStorage.setItem('fioravante_incidents_cache', JSON.stringify(previousIncidents));
        alert("Erro de conexão ao tentar excluir. O registro foi restaurado.");
      }
    }
  };

  const handleUpdateIncident = async (updated: Incident) => {
    if (!user) return;

    // Atualização local
    const newIncidents = incidents.map(i => i.id === updated.id ? updated : i);
    setIncidents(newIncidents);
    localStorage.setItem('fioravante_incidents_cache', JSON.stringify(newIncidents));

    if (isSupabaseConfigured && supabase) {
      try {
        const { error } = await supabase
          .from('incidents')
          .update({
            status: updated.status,
            management_feedback: updated.managementFeedback,
            last_viewed_at: updated.lastViewedAt
          })
          .eq('id', updated.id);

        if (error) {
          console.error('❌ [UPDATE] Erro ao atualizar no banco:', error);
          alert(`Erro ao salvar atualização: ${error.message}`);
        } else {
          console.log('✅ [UPDATE] Atualizado com sucesso no banco');
        }
      } catch (err) {
        console.error('❌ [UPDATE] Erro inesperado:', err);
      }
    }
  };

  const handleLogout = async () => {
    lockedUserRef.current = null; // Libera a trava ao sair
    if (isSupabaseConfigured && supabase) await supabase.auth.signOut();
    setUser(null);
    setView('login');
  };

  if (loading) {
    return (
      <div className="h-screen w-full bg-blue-900 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-white text-[10px] font-black uppercase tracking-[0.3em]">Portal Fioravante 2026...</p>
      </div>
    );
  }

  if (view === 'login') return <Login onLogin={u => {
    loginInProgressRef.current = true; // Bloqueia onAuthStateChange durante transição
    lockedUserRef.current = u;
    setUser(u);
    setView('dashboard');
    // Libera após 3s — tempo suficiente para eventos do Supabase passarem
    setTimeout(() => { loginInProgressRef.current = false; }, 3000);
  }} />;

  if (view === 'resetPassword') {
    return (
      <ResetPassword
        onComplete={async () => {
          // Após resetar senha, fazer logout e voltar para login
          if (isSupabaseConfigured && supabase) {
            await supabase.auth.signOut();
          }
          // Limpar hash da URL
          window.history.replaceState(null, '', window.location.pathname);
          setView('login');
        }}
        onCancel={async () => {
          // Cancelar reset, fazer logout e voltar para login
          if (isSupabaseConfigured && supabase) {
            await supabase.auth.signOut();
          }
          window.history.replaceState(null, '', window.location.pathname);
          setView('login');
        }}
      />
    );
  }

  const normalizedUserEmailForDual = (user?.email || "").toLowerCase().trim();
  // hasDualAccess: apenas e-mails explicitamente em DUAL_ACCESS_EMAILS
  // vilera@prof → duplo | vilera@professor → só professor | gestao@ → só gestão
  const hasDualAccess = DUAL_ACCESS_EMAILS.includes(normalizedUserEmailForDual);

  const handleToggleView = () => {
    setViewMode(prev => prev === 'gestor' ? 'professor' : 'gestor');
  };

  // Deve ser declarado antes de commonProps
  const normalizedUserEmail = user?.email?.toLowerCase().trim() || '';
  const isExclusiveManagement = GESTAO_EMAILS_HARDCODED.includes(normalizedUserEmail);

  // Filtragem de ocorrências por perfil:
  // Gestão: vê TODAS as ocorrências
  // Professor: vê APENAS as próprias (author_email === email logado)
  // Registros sem authorEmail: NÃO aparecem para professores (apenas para gestão)
  const incidentsForProfessor = incidents.filter(inc => {
    if (!inc.authorEmail || inc.authorEmail.trim() === '') {
      return false; // Registros sem autor não aparecem para professor
    }
    return inc.authorEmail.toLowerCase().trim() === (user?.email || '').toLowerCase().trim();
  });

  const commonProps = {
    user: user!,
    incidents: incidents,           // Gestão sempre recebe todos
    students: students,
    classes: classes,
    onSave: handleSaveIncident,
    onDelete: handleDeleteIncident,
    onUpdateIncident: handleUpdateIncident,
    onLogout: handleLogout,
    onOpenSearch: () => setSearchModalOpen(true),
    onSyncStudents: handleSyncStudents,
    onImportIncidents: handleImportIncidents,
    onLoadFullStudentHistory: loadFullStudentHistory,
    onLoadArchivedIncidents: loadArchivedIncidents,
    onToggleView: hasDualAccess ? handleToggleView : undefined,
    viewMode: viewMode,
  };

  // Props para a visão do professor — ocorrências filtradas + role forçado como professor
  const professorProps = {
    ...commonProps,
    user: { ...user!, role: 'professor' as const },
    incidents: incidentsForProfessor,
  };

  // Lógica de qual view renderizar:
  // 1. Gestão exclusiva (gestao@escola.com) → sempre Dashboard
  // 2. Acesso dual (gestor com email de professor) → alterna via viewMode
  // 3. Professor puro → ProfessorView
  // 4. Não autorizado → tela de erro
  const renderMainView = () => {
    if (view === 'unauthorized') {
      return (
        <div className="h-screen w-full flex flex-col items-center justify-center text-white p-6 text-center">
          <h1 className="text-2xl font-black mb-4 uppercase">Acesso Não Autorizado</h1>
          <p className="text-gray-400 mb-8 max-w-md uppercase text-[10px] tracking-widest leading-loose">
            Seu e-mail ({user?.email}) está autenticado, mas não consta na lista de professores autorizados da E.E. Fioravante Iervolino.
          </p>
          <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full font-black text-xs uppercase transition-all"> Sair da Conta </button>
        </div>
      );
    }
    if (isExclusiveManagement) return <Dashboard {...commonProps} />;
    if (hasDualAccess) {
      return viewMode === 'gestor'
        ? <Dashboard {...commonProps} />
        : <ProfessorView {...professorProps} />;
    }
    if (user?.role === 'gestor') return <Dashboard {...commonProps} />;
    return <ProfessorView {...professorProps} />;
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950">
      {renderMainView()}

      {/* ── Modal Busca Permanente (Dashboard) ─────────────────────────── */}
      {searchModalOpen && (
        <SearchModal
          incidents={incidents}
          students={students}
          classes={classes}
          onClose={() => setSearchModalOpen(false)}
        />
      )}

      {/* Marcador de Versão e Depuração Administrativa */}
      <div className="fixed bottom-2 left-2 text-[8px] font-black text-gray-500/30 uppercase pointer-events-none select-none z-[100] flex gap-4">
        <span>Build Version: 1.15.5</span>
        <span>User: {user?.email || 'OFFLINE'}</span>
        <span>Role: {user?.role || 'NONE'}</span>
        <span>Management: {isExclusiveManagement ? 'EXCLUSIVE' : 'NORMAL'}</span>
      </div>
    </div>
  );
};

export default App;

