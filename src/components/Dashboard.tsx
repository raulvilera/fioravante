import React, { useState, useMemo, useRef, useEffect } from 'react';

// ── Dropdown customizado com lista colorida (azul/branco alternados) ─────────
interface AlunoDropdownProps {
  value: string;
  onChange: (nome: string) => void;
  alunos: { ra: string; nome: string }[];
  disabled?: boolean;
}
const AlunoDropdown: React.FC<AlunoDropdownProps> = ({ value, onChange, alunos, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm disabled:opacity-50 cursor-pointer flex items-center justify-between gap-2"
      >
        <span className={value ? 'text-black uppercase' : 'text-gray-400'}>{value || 'Selecione o Aluno...'}</span>
        <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && (
        <div className="absolute z-[200] w-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
          <div
            onClick={() => { onChange(''); setOpen(false); }}
            className="px-5 py-2.5 text-xs font-bold text-gray-400 italic cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-100"
          >
            Selecione o Aluno...
          </div>
          <div className="max-h-56 overflow-y-auto">
            {alunos.map((s, idx) => (
              <div
                key={s.ra}
                onClick={() => { onChange(s.nome); setOpen(false); }}
                className={`px-5 py-2.5 text-xs font-black uppercase cursor-pointer transition-colors
                  ${value === s.nome
                    ? 'bg-blue-600 text-white'
                    : idx % 2 === 0
                      ? 'bg-white text-gray-900 hover:bg-blue-100'
                      : 'bg-blue-50 text-gray-900 hover:bg-blue-100'
                  }`}
              >
                {s.nome}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
import type { Incident, User, Student, ManagementReferral, Resolucao68Data, NivelResolucao68, HipoteseAfastamento, AfastamentoPreventivo } from '../types';
import { generateIncidentPDF, generateRelatorioCircunstanciado } from '../services/pdfService';
import {
  CATEGORIAS_GESTAO, CATEGORIA_AFASTAMENTO, CATEGORIA_ESTUDO_DIRIGIDO, NIVEIS, LISTA_INTERVENCOES,
  HIPOTESES_AFASTAMENTO, MAX_DIAS_AFASTAMENTO, ENC_REDE_PROTETIVA, ENC_ESTUDO_DIRIGIDO,
  situacaoAfastamento, ultimoDiaLetivo, proximoDiaLetivo, formatBR, isCategoriaRestritiva, hasIntervencao,
} from '../data/resolucao68';
import StatusBadge from './StatusBadge';
import { supabase } from '../services/supabaseClient';
import { STUDENTS_DB } from '../data/studentsData';
import { normalizeClassName } from '../utils/formatters';
import { getProfessorNameFromEmail } from '../data/professorsData';

interface DashboardProps {
  user: User;
  incidents: Incident[];
  students: Student[];
  classes: string[];
  onSave: (incident: Incident) => void;
  onDelete: (id: string) => void;
  onLogout: () => void;
  onOpenSearch: () => void;
  onUpdateIncident?: (incident: Incident) => void;
  onSyncStudents?: () => Promise<void>;
  onImportIncidents?: () => Promise<void>;
  onLoadFullStudentHistory?: (ra: string) => Promise<Incident[]>;
  onLoadArchivedIncidents?: (filters?: { studentName?: string; classRoom?: string }) => Promise<Incident[]>;
  onToggleView?: () => void;
  viewMode?: 'gestor' | 'professor';
}

const Dashboard: React.FC<DashboardProps> = ({ user, incidents, students, classes, onSave, onDelete, onLogout, onOpenSearch, onUpdateIncident, onSyncStudents, onImportIncidents, onLoadFullStudentHistory, onLoadArchivedIncidents, onToggleView, viewMode }) => {
  const [classRoom, setClassRoom] = useState('');
  const [studentName, setStudentName] = useState('');
  const [professorName, setProfessorName] = useState('');
  const [classification, setClassification] = useState('');
  const [description, setDescription] = useState('');

  // ── Resolução SEDUC nº 68/2026 — campos do novo registro ─────────────────
  const [nivel, setNivel] = useState<NivelResolucao68 | ''>('');
  const [dataCiencia, setDataCiencia] = useState('');
  const [convivaRegistrado, setConvivaRegistrado] = useState(false);
  const [convivaProtocolo, setConvivaProtocolo] = useState('');
  const [afHipotese, setAfHipotese] = useState<HipoteseAfastamento | ''>('');
  const [afMotivacao, setAfMotivacao] = useState('');
  const [afDias, setAfDias] = useState(1);
  const [afFamilia, setAfFamilia] = useState(false);
  const [afURE, setAfURE] = useState(false);
  const [afRede, setAfRede] = useState(false);
  const [afPlano, setAfPlano] = useState('');

  // Nome automático do gestor
  useEffect(() => {
    if (user?.email) setProfessorName(getProfessorNameFromEmail(user.email));
  }, [user?.email]);

  // Header fixo — altura dinâmica
  const headerRef = useRef<HTMLElement>(null);
  const [headerHeight, setHeaderHeight] = useState(60);
  useEffect(() => {
    const update = () => { if (headerRef.current) setHeaderHeight(headerRef.current.offsetHeight); };
    update();
    const ro = new ResizeObserver(update);
    if (headerRef.current) ro.observe(headerRef.current);
    return () => ro.disconnect();
  }, []);


  // ── Toast e Confirm internos ──────────────────────────────────────────────
  const [dgToast, setDgToast] = useState<{ msg: string; type: 'success'|'error'|'info'|'warning'; id: number }|null>(null);
  const dgShowToast = (msg: string, type: 'success'|'error'|'info'|'warning' = 'info', dur = 4000) => {
    const id = Date.now(); setDgToast({ msg, type, id });
    setTimeout(() => setDgToast(t => t?.id === id ? null : t), dur);
  };
  const [dgConfirm, setDgConfirm] = useState<{ msg: string; onOk: () => void }|null>(null);
  const dgAskConfirm = (msg: string, onOk: () => void) => setDgConfirm({ msg, onOk });

  const [registerDate, setRegisterDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');

  const regDateRef = useRef<HTMLInputElement>(null!);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Incident | null>(null);
  const [newStatus, setNewStatus] = useState<Incident['status']>('Pendente');
  const [feedback, setFeedback] = useState('');
  // Dados da Res. 68 em edição no modal de atualização
  const [r68Edit, setR68Edit] = useState<Resolucao68Data>({});
  const upR68 = (patch: Partial<Resolucao68Data>) => setR68Edit(p => ({ ...p, ...patch }));
  const upAf = (patch: Partial<AfastamentoPreventivo>) =>
    setR68Edit(p => (p.afastamento ? { ...p, afastamento: { ...p.afastamento, ...patch } } : p));

  // ── Estados dos Encaminhamentos da Gestão ───────────────────────────────
  // Cada item da lista pode ser marcado e ter uma descrição associada
  // Intervenções pedagógicas do Art. 7º da Res. SEDUC 68/2026 (ver src/data/resolucao68.ts)
  const LISTA_ENCAMINHAMENTOS_GESTAO: { label: string; popUp: boolean; grupo?: string }[] =
    LISTA_INTERVENCOES.map(i => ({ label: i.label, popUp: true, grupo: i.grupo }));
  const [selectedMgmtReferrals, setSelectedMgmtReferrals] = useState<string[]>([]);
  const [mgmtReferralDescriptions, setMgmtReferralDescriptions] = useState<Record<string, string>>({});
  const [showMgmtReferralModal, setShowMgmtReferralModal] = useState<string | null>(null); // nome do encaminhamento aberto
  const [mgmtReferralModalText, setMgmtReferralModalText] = useState('');
  // ─────────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'registros' | 'estatisticas'>('registros');

  // Estados para Gerenciamento de Professores
  const [showProfessorsModal, setShowProfessorsModal] = useState(false);
  const [professorsList, setProfessorsList] = useState<{ email: string, nome: string }[]>([]);
  const [newProfEmail, setNewProfEmail] = useState('');
  const [newProfNome, setNewProfNome] = useState('');
  const [isManagingProfs, setIsManagingProfs] = useState(false);

  // Estados para Busca no Histórico Permanente
  const [showPermanentSearch, setShowPermanentSearch] = useState(false);
  const [permanentSearchTerm, setPermanentSearchTerm] = useState('');
  const [selectedStudentForHistory, setSelectedStudentForHistory] = useState<Student | null>(null);
  const [studentHistory, setStudentHistory] = useState<Incident[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Estados para o Arquivo Histórico (registros anteriores a 30 dias)
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archiveSearchName, setArchiveSearchName] = useState('');
  const [archiveSearchClass, setArchiveSearchClass] = useState('');
  const [archivedIncidents, setArchivedIncidents] = useState<Incident[]>([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [archiveSearched, setArchiveSearched] = useState(false);

  const ra = useMemo(() => {
    const s = students.find(st => st.nome === studentName && st.turma === classRoom);
    return s ? s.ra : '---';
  }, [studentName, classRoom, students]);

  const fetchStudentHistory = async (student: Student) => {
    setIsLoadingHistory(true);
    setSelectedStudentForHistory(student);
    try {
      // Usa a prop especializada que busca o histórico COMPLETO do aluno (sem filtro de data)
      if (onLoadFullStudentHistory) {
        const data = await onLoadFullStudentHistory(student.ra);
        setStudentHistory(data);
      } else {
        // Fallback: busca direta (sem filtro de data)
        const { data, error } = await supabase
          .from('incidents')
          .select('*')
          .eq('ra', student.ra)
          .order('created_at', { ascending: false });

        if (!error && data) {
          setStudentHistory(data.map(i => ({
            id: i.id,
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
            lastViewedAt: i.last_viewed_at,
            professorReferrals: i.professor_referrals || undefined,
            managementReferrals: i.management_referrals || undefined,
            resolucao68: i.resolucao68 || undefined
          })));
        }
      }
    } catch (e) {
      console.error("Erro ao buscar histórico:", e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleArchiveSearch = async () => {
    if (!onLoadArchivedIncidents) return;
    setIsLoadingArchive(true);
    setArchiveSearched(true);
    try {
      const results = await onLoadArchivedIncidents({
        studentName: archiveSearchName.trim() || undefined,
        classRoom: archiveSearchClass.trim() || undefined,
      });
      setArchivedIncidents(results);
    } catch (e) {
      console.error("Erro ao buscar arquivo histórico:", e);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!permanentSearchTerm) return [];
    return students.filter(s =>
      s.nome.toUpperCase().startsWith(permanentSearchTerm.toUpperCase())
    ).slice(0, 10); // Limitar a 10 resultados para performance e UI
  }, [students, permanentSearchTerm]);

  const triggerPicker = (ref: React.RefObject<HTMLInputElement>) => {
    if (ref.current) {
      try {
        if ((ref.current as any).showPicker) {
          (ref.current as any).showPicker();
        } else {
          ref.current.focus();
        }
      } catch (_err) {
        ref.current.focus();
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName || !description || !classRoom || !classification || !professorName) {
      dgShowToast("Preencha todos os campos obrigatórios.", "warning"); return;
    }
    if (!nivel) {
      dgShowToast("Classifique o nível da situação (Art. 5º da Res. SEDUC 68/2026).", "warning"); return;
    }
    const isAfastamento = classification === CATEGORIA_AFASTAMENTO;
    if (isAfastamento) {
      if (nivel !== 'III') {
        dgShowToast("O afastamento preventivo só cabe em situações de Nível III (Art. 5º, III).", "warning"); return;
      }
      if (!afHipotese) {
        dgShowToast("Indique a hipótese que fundamenta o afastamento (Art. 11, §1º).", "warning"); return;
      }
      if (afMotivacao.trim().length < 20) {
        dgShowToast("Descreva a motivação expressa, com elementos objetivos. É vedado afastar com base em receios genéricos (Art. 5º, §3º e Art. 28, I).", "warning", 7000); return;
      }
      if (afDias < 1 || afDias > MAX_DIAS_AFASTAMENTO) {
        dgShowToast(`O prazo inicial é de no máximo ${MAX_DIAS_AFASTAMENTO} dias letivos (Art. 11, §5º).`, "warning"); return;
      }
      if (!afPlano.trim()) {
        dgShowToast("Informe o plano de estudos que garante a continuidade pedagógica (Art. 11, §3º).", "warning"); return;
      }
      if (!afFamilia || !afURE) {
        dgShowToast("O afastamento deve ser comunicado imediatamente à família e à URE (Art. 12).", "warning", 6000); return;
      }
    }

    setIsSaving(true);
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const formattedDate = registerDate.split('-').reverse().join('/');
    const uniqueId = crypto.randomUUID();

    const newInc: Incident = {
      id: uniqueId,
      classRoom,
      studentName: studentName.toUpperCase(),
      professorName: professorName.toUpperCase(),
      ra,
      date: formattedDate,
      time: timeStr,
      registerDate: formattedDate,
      returnDate: isAfastamento ? formatBR(proximoDiaLetivo(ultimoDiaLetivo(registerDate, afDias))) : undefined,
      discipline: 'N/A',
      irregularities: '',
      description: description.toUpperCase(),
      severity: nivel === 'III' ? 'Alta' : nivel === 'II' ? 'Média' : 'Baixa',
      status: 'Pendente',
      category: classification,
      source: 'gestao',
      authorEmail: user.email,
      escola: 'fioravante',
      resolucao68: {
        nivel,
        dataCiencia: dataCiencia || registerDate,
        conviva: { registrado: convivaRegistrado, protocolo: convivaProtocolo.trim() || undefined },
        ...(isAfastamento && afHipotese ? {
          afastamento: {
            hipotese: afHipotese,
            motivacao: afMotivacao.trim().toUpperCase(),
            inicio: registerDate,
            diasLetivos: afDias,
            comunicacaoFamilia: afFamilia,
            comunicacaoURE: afURE,
            comunicacaoRede: afRede,
            planoEstudos: afPlano.trim().toUpperCase(),
          },
        } : {}),
      },
    };

    onSave(newInc);
    setStudentName('');
    setDescription('');
    setNivel(''); setDataCiencia(''); setConvivaRegistrado(false); setConvivaProtocolo('');
    setAfHipotese(''); setAfMotivacao(''); setAfDias(1); setAfFamilia(false); setAfURE(false); setAfRede(false); setAfPlano('');
    setIsSaving(false);
  };

  const openUpdateModal = (inc: Incident) => {
    setIsUpdatingStatus(inc);
    setNewStatus(inc.status);
    setFeedback(inc.managementFeedback || '');
    setR68Edit(inc.resolucao68 ? JSON.parse(JSON.stringify(inc.resolucao68)) : {});
    // Pré-preencher encaminhamentos se já existirem
    if (inc.managementReferrals && inc.managementReferrals.length > 0) {
      setSelectedMgmtReferrals(inc.managementReferrals.map(r => r.type));
      const descs: Record<string, string> = {};
      inc.managementReferrals.forEach(r => { descs[r.type] = r.description; });
      setMgmtReferralDescriptions(descs);
    } else {
      setSelectedMgmtReferrals([]);
      setMgmtReferralDescriptions({});
    }
  };

  const handleUpdateStatus = () => {
    if (!isUpdatingStatus || !onUpdateIncident) return;

    // Monta lista de encaminhamentos com descrições
    const managementReferrals: ManagementReferral[] = selectedMgmtReferrals.map(type => ({
      type,
      description: (mgmtReferralDescriptions[type] || '').toUpperCase(),
    }));

    const pr = r68Edit.afastamento?.prorrogacao;
    if (pr) {
      if (!pr.dataConselho || pr.fundamentacao.trim().length < 20) {
        dgShowToast("A prorrogação exige reavaliação fundamentada e apreciação do Conselho de Escola (Art. 11, §§6º e 7º).", "warning", 6000); return;
      }
      if (pr.diasLetivos < 1 || pr.diasLetivos > MAX_DIAS_AFASTAMENTO) {
        dgShowToast(`A prorrogação é limitada a igual período: até ${MAX_DIAS_AFASTAMENTO} dias letivos (Art. 11, §6º).`, "warning"); return;
      }
      if (!pr.familiaComunicada) {
        dgShowToast("A prorrogação deve ser comunicada formalmente à família (Art. 11, §7º).", "warning"); return;
      }
    }

    const updated: Incident = {
      ...isUpdatingStatus,
      status: newStatus,
      resolucao68: Object.keys(r68Edit).length > 0 ? r68Edit : undefined,
      managementFeedback: feedback.toUpperCase(),
      managementFeedbackAt: new Date().toISOString(),
      managementReferrals: managementReferrals.length > 0 ? managementReferrals : undefined,
      lastViewedAt: new Date().toISOString()
    };

    onUpdateIncident(updated);
    setIsUpdatingStatus(null);
  };

  // Abre pop-up de descrição para um encaminhamento da gestão
  const handleMgmtReferralClick = (tipo: string) => {
    if (selectedMgmtReferrals.includes(tipo)) {
      // Já selecionado → abre para editar
      setMgmtReferralModalText(mgmtReferralDescriptions[tipo] || '');
      setShowMgmtReferralModal(tipo);
    } else {
      // Novo → abre pop-up para descrever
      setMgmtReferralModalText('');
      setShowMgmtReferralModal(tipo);
    }
  };

  // Clique direto em item sem pop-up (toggle simples)
  const handleMgmtReferralToggle = (tipo: string) => {
    if (selectedMgmtReferrals.includes(tipo)) {
      handleRemoveMgmtReferral(tipo);
    } else {
      setSelectedMgmtReferrals(prev => [...prev, tipo]);
    }
  };

  const handleConfirmMgmtReferral = () => {
    if (!showMgmtReferralModal) return;
    const tipo = showMgmtReferralModal;
    if (!selectedMgmtReferrals.includes(tipo)) {
      setSelectedMgmtReferrals(prev => [...prev, tipo]);
    }
    setMgmtReferralDescriptions(prev => ({ ...prev, [tipo]: mgmtReferralModalText.trim().toUpperCase() }));
    setShowMgmtReferralModal(null);
  };

  const handleRemoveMgmtReferral = (tipo: string) => {
    setSelectedMgmtReferrals(prev => prev.filter(t => t !== tipo));
    setMgmtReferralDescriptions(prev => { const n = { ...prev }; delete n[tipo]; return n; });
  };

  const fetchProfessors = async () => {
    setIsManagingProfs(true);
    const { data } = await supabase.from('authorized_professors').select('email, nome').eq('escola', 'fioravante').order('nome');
    if (data) setProfessorsList(data);
    setIsManagingProfs(false);
  };

  const handleAddProfessor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfEmail || !newProfNome) return;

    setIsManagingProfs(true);
    const { error } = await supabase.from('authorized_professors').insert([
      { email: newProfEmail.toLowerCase().trim(), nome: newProfNome.toUpperCase().trim(), escola: 'fioravante', role: 'professor' }
    ]);

    if (error) {
      dgShowToast("Erro ao adicionar professor: " + error.message, "error"); return;
    } else {
      setNewProfEmail('');
      setNewProfNome('');
      await fetchProfessors();
    }
    setIsManagingProfs(false);
  };

  const handleRemoveProfessor = async (email: string) => {
    dgAskConfirm(`Deseja remover o acesso de ${email}?`, async () => {
      setIsManagingProfs(true);
      const { error } = await supabase.from('authorized_professors').delete().eq('email', email).eq('escola', 'fioravante');
      if (error) {
        dgShowToast("Erro ao remover professor.", "error");
      } else {
        await fetchProfessors();
        dgShowToast("Professor removido com sucesso.", "success");
      }
      setIsManagingProfs(false);
    });
  };

  const handleCleanupDatabase = async () => {
    dgAskConfirm("Esta ação removerá permanentemente alunos de turmas obsoletas. Deseja prosseguir?", async () => {
      setIsSaving(true);
    try {
      const { data: allStudents, error: fetchError } = await supabase
        .from('students')
        .select('id, turma, nome');

      if (fetchError) throw fetchError;

      const allowedClasses = new Set(STUDENTS_DB.map(s => normalizeClassName(s.turma)));
      const studentsToRemove = allStudents.filter(s => {
        const normalized = normalizeClassName(s.turma);
        return !allowedClasses.has(normalized);
      });

      if (studentsToRemove.length === 0) {
        dgShowToast("Nenhum dado obsoleto encontrado. O banco de dados já está limpo!", "info");
        setIsSaving(false);
        return;
      }

      const idsToRemove = studentsToRemove.map(s => s.id);
      
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .in('id', idsToRemove);

      if (deleteError) throw deleteError;

      dgShowToast(`Sucesso! ${idsToRemove.length} registros removidos.`, "success");
      
      if (onSyncStudents) await onSyncStudents();

    } catch (error: any) {
      console.error("Erro na limpeza:", error);
      dgShowToast("Erro ao realizar limpeza. Verifique as permissões.", "error");
    } finally {
      setIsSaving(false);
    }
    }); // fim dgAskConfirm
  };

  const history = useMemo(() => {
    const term = searchTerm.toLowerCase();

    // Mapeia cada opção do filtro para todos os valores equivalentes no banco
    const statusMap: Record<string, string[]> = {
      'Todos': [],
      'Visualizada': ['visualizada'],
      'Pendente': ['pendente'],
      'Em Andamento': ['em andamento', 'em análise', 'em analise'],
      'Resolvida': ['resolvida', 'resolvido'],
    };

    return incidents.filter(i => {
      const matchesSearch =
        (i.studentName || "").toLowerCase().includes(term) ||
        (i.classRoom || "").toLowerCase().includes(term) ||
        (i.professorName || "").toLowerCase().includes(term);

      const statusNorm = (i.status || '').toLowerCase().trim();
      const matchesStatus =
        statusFilter === 'Todos' ||
        (statusMap[statusFilter] || []).includes(statusNorm);

      return matchesSearch && matchesStatus;
    });
  }, [incidents, searchTerm, statusFilter]);

  // Lógica de Estatísticas
  const stats = useMemo(() => {
    const classCount: Record<string, number> = {};
    const studentCount: Record<string, { count: number, turma: string }> = {};
    const typeCount: Record<string, number> = {};
    const profCount: Record<string, number> = {};
    const managerCount: Record<string, number> = {};

    incidents.forEach(inc => {
      // Top Turmas
      if (inc.classRoom) {
        classCount[inc.classRoom] = (classCount[inc.classRoom] || 0) + 1;
      }

      // Top Alunos
      if (inc.studentName) {
        if (!studentCount[inc.studentName]) {
          studentCount[inc.studentName] = { count: 0, turma: inc.classRoom || 'N/A' };
        }
        studentCount[inc.studentName].count++;
      }

      // Top Tipos
      if (inc.category) {
        typeCount[inc.category] = (typeCount[inc.category] || 0) + 1;
      }

      // Top Professores (Apenas registros de professores)
      if (inc.source === 'professor' && inc.professorName) {
        profCount[inc.professorName] = (profCount[inc.professorName] || 0) + 1;
      }

      // Top Gestores (Apenas registros de gestão)
      if (inc.source === 'gestao' && inc.professorName) {
        managerCount[inc.professorName] = (managerCount[inc.professorName] || 0) + 1;
      }
    });

    const topClasses = Object.entries(classCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topStudents = Object.entries(studentCount)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5);

    const topTypes = Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1]);

    const topProfs = Object.entries(profCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const topManagers = Object.entries(managerCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { topClasses, topStudents, topTypes, topProfs, topManagers };
  }, [incidents]);

  // ── Resolução SEDUC 68/2026: histórico do aluno selecionado no formulário ──
  const historicoAluno = useMemo(() => {
    if (!studentName || !classRoom) return { total: 0, estudosDirigidos: 0, comIntervencao: 0 };
    const doAluno = incidents.filter(i => i.studentName === studentName.toUpperCase() && i.classRoom === classRoom);
    return {
      total: doAluno.length,
      estudosDirigidos: doAluno.filter(i => i.category === CATEGORIA_ESTUDO_DIRIGIDO || hasIntervencao(i, ENC_ESTUDO_DIRIGIDO)).length,
      comIntervencao: doAluno.filter(i => (i.managementReferrals || []).length > 0).length,
    };
  }, [incidents, studentName, classRoom]);

  // Afastamentos preventivos ainda não encerrados (Art. 11)
  const afastamentosEmCurso = useMemo(() =>
    incidents
      .filter(i => i.resolucao68?.afastamento)
      .map(i => ({ inc: i, sit: situacaoAfastamento(i.resolucao68!.afastamento!) }))
      .filter(x => !x.sit.encerrado)
      .sort((a, b) => a.sit.fim.localeCompare(b.sit.fim)),
  [incidents]);

  // Indicadores de monitoramento (Art. 9º, §4º)
  const indicadores = useMemo(() => {
    const porAluno: Record<string, number> = {};
    const porIntervencao: Record<string, number> = {};
    const porNivel: Record<string, number> = { I: 0, II: 0, III: 0, '—': 0 };
    let resolvidas = 0, rede = 0, estudos = 0, afast = 0, afastVencidos = 0, conviva = 0, totalIntervencoes = 0;

    incidents.forEach(i => {
      const chave = `${i.studentName}|${i.classRoom}`;
      porAluno[chave] = (porAluno[chave] || 0) + 1;
      if (['resolvida', 'resolvido'].includes((i.status || '').toLowerCase())) resolvidas++;
      (i.managementReferrals || []).forEach(r => {
        const especial = LISTA_INTERVENCOES.find(l => l.label === r.type)?.grupo === 'especial';
        if (especial) return;
        porIntervencao[r.type] = (porIntervencao[r.type] || 0) + 1;
        totalIntervencoes++;
      });
      if (hasIntervencao(i, ENC_REDE_PROTETIVA)) rede++;
      if (i.category === CATEGORIA_ESTUDO_DIRIGIDO || hasIntervencao(i, ENC_ESTUDO_DIRIGIDO)) estudos++;
      if (i.resolucao68?.afastamento) {
        afast++;
        if (situacaoAfastamento(i.resolucao68.afastamento).vencido) afastVencidos++;
      }
      if (i.resolucao68?.conviva?.registrado) conviva++;
      porNivel[i.resolucao68?.nivel || '—']++;
    });

    const alunos = Object.keys(porAluno).length;
    const reincidentes = Object.values(porAluno).filter(c => c >= 2).length;
    return {
      total: incidents.length, alunos, reincidentes, resolvidas, rede, estudos, afast, afastVencidos, conviva,
      totalIntervencoes, porNivel,
      porIntervencao: Object.entries(porIntervencao).sort((a, b) => b[1] - a[1]),
    };
  }, [incidents]);

  // Guia de respostas institucionais conforme a gradação do Art. 5º
  const pedagogicalGuide: Record<string, string[]> = {
    [NIVEIS.I.titulo]: [
      'Acolhimento e escuta dos envolvidos (Art. 7º, I)',
      'Orientação individual e retomada dos combinados (Art. 7º, II)',
      'Mediação de conflitos / práticas restaurativas com adesão voluntária (Art. 7º, VI)',
      'Registro na Plataforma Conviva conforme o Protocolo 179 (Art. 9º)',
    ],
    [NIVEIS.II.titulo]: [
      'Plano individual de acompanhamento e repactuação de compromisso (Art. 7º, III)',
      'Articulação com a família e adulto de referência (Art. 7º, IV e V)',
      'Estudo dirigido sob supervisão da gestão — nunca como castigo (Arts. 7º, IX e 8º)',
      'Se reiterado: registrar, comunicar à família e avaliar efetividade (Art. 7º, §5º)',
    ],
    [NIVEIS.III.titulo]: [
      'Afastamento preventivo: motivado, máx. 5 dias letivos, com plano de estudos (Art. 11)',
      'Comunicação imediata à família, à URE e, se preciso, à rede protetiva (Art. 12)',
      'Prorrogação só com reavaliação da Direção e apreciação do Conselho de Escola (Art. 11, §§6º-7º)',
      'Transferência cautelar: relatório circunstanciado, Conselho, contraditório e URE (Arts. 14-18)',
    ],
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950 font-sans pb-12 overflow-x-hidden" style={{ paddingTop: headerHeight }}>
      <header ref={headerRef} className="bg-gradient-to-r from-black to-blue-900 text-white px-4 sm:px-8 py-3 flex flex-col sm:flex-row justify-between items-center border-b border-white/10 fixed top-0 left-0 right-0 z-[50] shadow-xl gap-2 sm:gap-0">
        <div className="flex flex-col items-center sm:items-start">
          <h1 className="text-xs sm:text-sm font-black uppercase tracking-widest text-blue-400 text-center sm:text-left">GESTÃO E.E. FIORAVANTE IERVOLINO 2026</h1>
          <p className="text-[8px] sm:text-[9px] font-bold text-white/40 uppercase">Painel de Controle Administrativo</p>
        </div>
        <div className="flex gap-4 sm:gap-6 items-center flex-wrap justify-end">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] font-black uppercase">{user.email}</span>
            <span className="text-[8px] font-bold text-orange-500 uppercase">Nível: Administrador</span>
          </div>
          {onToggleView && (
            <button
              onClick={onToggleView}
              className="bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase shadow-lg transition-all active:scale-95 flex items-center gap-1.5 whitespace-nowrap"
              title={`Alternar para área ${viewMode === 'gestor' ? 'do professor' : 'da gestão'}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              {viewMode === 'gestor' ? 'Ver como Professor' : 'Ver como Gestão'}
            </button>
          )}
          <button onClick={onLogout} className="bg-white hover:bg-red-50 text-[#002b5c] px-4 sm:px-5 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase shadow-lg transition-all active:scale-95">Sair</button>
          <button
            onClick={() => { setShowProfessorsModal(true); fetchProfessors(); }}
            className="bg-teal-500 hover:bg-teal-600 text-white px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase shadow-lg transition-all active:scale-95 flex items-center gap-2"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
            Professores
          </button>
          {onSyncStudents && (
            <button
              onClick={onSyncStudents}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase shadow-lg transition-all active:scale-95 flex items-center gap-2"
              title="Sincronizar alunos do Google Sheets para o Supabase"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sincronizar Alunos
            </button>
          )}
          {onImportIncidents && (
            <button
              onClick={onImportIncidents}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase shadow-lg transition-all active:scale-95 flex items-center gap-2"
              title="Importar ocorrências históricas do Google Sheets para o Supabase"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar Histórico
            </button>
          )}
          {onLoadArchivedIncidents && (
            <button
              onClick={() => { setShowArchiveModal(true); setArchiveSearched(false); setArchivedIncidents([]); }}
              className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 sm:py-2 rounded-xl text-[9px] sm:text-[10px] font-black uppercase shadow-lg transition-all active:scale-95 flex items-center gap-2"
              title="Consultar registros históricos"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12" />
              </svg>
              Arquivo Histórico
            </button>
          )}
        </div>
      </header>

      {/* Navegação de Abas Principal */}
      <nav className="max-w-[1700px] mx-auto mt-6 px-4 sm:px-6 flex gap-4">
        <button
          onClick={() => setActiveTab('registros')}
          className={`flex-1 sm:flex-none px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all shadow-lg ${activeTab === 'registros' ? 'bg-teal-500 text-white border-b-4 border-teal-700' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
        >
          📄 Registros e Lançamentos
        </button>
        <button
          onClick={() => setActiveTab('estatisticas')}
          className={`flex-1 sm:flex-none px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all shadow-lg ${activeTab === 'estatisticas' ? 'bg-orange-500 text-white border-b-4 border-orange-700 animate-pulse' : 'bg-white/10 text-white/40 hover:bg-white/20'}`}
        >
          📊 Dashboard Analytics
        </button>
      </nav>

      <main className="max-w-[1700px] mx-auto mt-6 sm:mt-8 px-4 sm:px-6 space-y-8 sm:space-y-10">
        {activeTab === 'registros' && (
          <>
            {/* ── Afastamentos preventivos em curso (Res. SEDUC 68/2026, Art. 11) ── */}
            {afastamentosEmCurso.length > 0 && (
              <div className="bg-white rounded-[28px] shadow-2xl overflow-hidden border-2 border-red-300">
                <div className="bg-gradient-to-r from-red-900 to-red-700 px-6 py-3 text-white">
                  <h2 className="text-[10px] sm:text-xs font-black uppercase tracking-widest">⏱ Afastamentos preventivos em curso</h2>
                  <p className="text-[9px] font-bold text-red-100">Ao fim do prazo, sem deliberação fundamentada, o estudante deve retornar com plano de acompanhamento (Art. 11, §8º).</p>
                </div>
                <div className="divide-y divide-gray-100">
                  {afastamentosEmCurso.map(({ inc, sit }) => (
                    <div key={inc.id} className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-black text-[#002b5c] uppercase">{inc.studentName} <span className="text-blue-600">· {inc.classRoom}</span></p>
                        <p className="text-[9px] font-bold text-gray-500 uppercase">
                          Até {formatBR(sit.fim)} · retorno previsto {formatBR(sit.retornoPrevisto)}
                          {inc.resolucao68?.afastamento?.prorrogacao && ' · prorrogado'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${sit.vencido ? 'bg-red-600 text-white animate-pulse' : 'bg-orange-100 text-orange-700'}`}>
                          {sit.vencido ? 'Prazo vencido — registrar retorno ou prorrogação' : 'Em curso'}
                        </span>
                        <button onClick={() => openUpdateModal(inc)} className="px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-[9px] font-black uppercase">Atualizar</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-[32px] shadow-2xl overflow-hidden border border-white/10">
              <div className="bg-gradient-to-r from-black to-[#002b5c] py-3 text-center border-b border-blue-900/30">
                <h2 className="text-white font-black text-[10px] sm:text-xs uppercase tracking-widest">EFETUAR NOVO REGISTRO ADMINISTRATIVO</h2>
              </div>

              <div className="p-6 sm:p-10 bg-gradient-to-br from-blue-800 via-blue-900 to-blue-950">
                <form onSubmit={handleSave} className="space-y-6 sm:space-y-8">
                  <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-end">
                    <div className="flex flex-col gap-2 w-full lg:w-48">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">TURMA / SÉRIE</label>
                      <select
                        value={classRoom}
                        onChange={e => { setClassRoom(e.target.value); setStudentName(''); }}
                        className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer w-full"
                      >
                        <option value="">Selecione...</option>
                        {classes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-2 w-full lg:flex-1">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">NOME DO ALUNO</label>
                      <AlunoDropdown
                        value={studentName}
                        onChange={setStudentName}
                        alunos={students.filter(s => s.turma === classRoom)}
                        disabled={!classRoom}
                      />
                    </div>
                    <div className="flex flex-col gap-2 w-full lg:w-64">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">REGISTRO DO ALUNO (RA)</label>
                      <div className="h-12 sm:h-14 flex items-center px-6 bg-white/20 rounded-2xl font-black text-white text-xs border border-white/20 shadow-inner backdrop-blur-sm w-full">
                        {ra}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-end">
                    <div className="flex flex-col gap-2 w-full lg:flex-1">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">RESPONSÁVEL PELO REGISTRO</label>
                      <input
                        type="text"
                        value={professorName}
                        onChange={e => setProfessorName(e.target.value)}
                        placeholder="Nome do Gestor ou Professor"
                        className="h-12 sm:h-14 border-2 border-emerald-300 rounded-2xl px-5 text-xs font-bold !text-black bg-emerald-50 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-500 outline-none shadow-sm uppercase w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-2 w-full lg:w-80">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">CATEGORIA DA MEDIDA</label>
                      <select
                        value={classification}
                        onChange={e => {
                          setClassification(e.target.value);
                          if (e.target.value === CATEGORIA_AFASTAMENTO) setNivel('III');
                        }}
                        className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer w-full"
                      >
                        <option value="">Selecione...</option>
                        {CATEGORIAS_GESTAO.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2 cursor-pointer" onClick={() => triggerPicker(regDateRef)}>
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1 cursor-pointer">DATA DO REGISTRO</label>
                      <input
                        ref={regDateRef}
                        type="date"
                        value={registerDate}
                        onChange={e => setRegisterDate(e.target.value)}
                        className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer w-full"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">DATA DE CIÊNCIA PELA ESCOLA <span className="normal-case font-bold text-white/50">(Art. 9º, §3º)</span></label>
                      <input
                        type="date"
                        value={dataCiencia || registerDate}
                        onChange={e => setDataCiencia(e.target.value)}
                        className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm w-full cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* ── Resolução SEDUC 68/2026: gradação e registro ── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">NÍVEL DA SITUAÇÃO <span className="normal-case font-bold text-white/50">(Art. 5º — Res. SEDUC 68/2026)</span></label>
                      <select
                        value={nivel}
                        onChange={e => setNivel(e.target.value as NivelResolucao68 | '')}
                        disabled={classification === CATEGORIA_AFASTAMENTO}
                        className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm w-full cursor-pointer disabled:opacity-80"
                      >
                        <option value="">Selecione...</option>
                        {(Object.keys(NIVEIS) as NivelResolucao68[]).map(n => <option key={n} value={n}>{NIVEIS[n].titulo}</option>)}
                      </select>
                      {nivel && <p className="text-[9px] text-white/60 font-bold ml-1">{NIVEIS[nivel].descricao}</p>}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">PLATAFORMA CONVIVA <span className="normal-case font-bold text-white/50">(Art. 9º)</span></label>
                      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <label className="flex items-start gap-2 text-[10px] font-bold text-white uppercase cursor-pointer items-center whitespace-nowrap">
                          <input type="checkbox" checked={convivaRegistrado} onChange={e => setConvivaRegistrado(e.target.checked)} className="w-4 h-4" />
                          Registrado no Conviva
                        </label>
                        <input
                          type="text"
                          value={convivaProtocolo}
                          onChange={e => setConvivaProtocolo(e.target.value)}
                          placeholder="Nº / protocolo (opcional)"
                          disabled={!convivaRegistrado}
                          className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm w-full disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>

                  {classification === CATEGORIA_ESTUDO_DIRIGIDO && (
                    <div className="p-4 rounded-2xl bg-white/10 border border-white/20 text-[10px] font-bold text-white space-y-1">
                      <p>📘 Estratégia pedagógica intermediária (Arts. 7º, IX e 8º): o estudante realiza atividades orientadas em outro espaço, <u>sob supervisão de integrante da equipe gestora</u>, sem prejuízo de carga horária, avaliações e conteúdos. É vedado usá-la como castigo ou segregação.</p>
                      {historicoAluno.estudosDirigidos > 0 && (
                        <p className="text-orange-300">⚠ Este estudante já teve {historicoAluno.estudosDirigidos} estudo(s) dirigido(s) nos registros recentes. Estratégia reiterada deve ser registrada, comunicada à família e integrada ao plano individual de acompanhamento (Art. 7º, §5º).</p>
                      )}
                    </div>
                  )}

                  {classification === CATEGORIA_AFASTAMENTO && (
                    <div className="p-5 sm:p-6 rounded-[28px] bg-red-950/40 border-2 border-red-400/60 space-y-5">
                      <div>
                        <h3 className="text-[11px] font-black text-red-200 uppercase tracking-widest">Afastamento preventivo temporário — Arts. 11 e 12</h3>
                        <p className="text-[9px] font-bold text-white/70 mt-1">Medida cautelar, excepcional e protetiva — não é punição. Preserva a matrícula e o acompanhamento pedagógico. Vedado com base em receios genéricos, percepções não documentadas ou pressão informal (Art. 5º, §3º).</p>
                      </div>

                      {classRoom.toUpperCase().startsWith('AEE') && (
                        <p className="p-3 rounded-xl bg-yellow-100 text-yellow-900 text-[10px] font-bold">⚠ Estudante da Educação Especial: antes de propor o afastamento, documente as adaptações razoáveis, os apoios especializados e as estratégias inclusivas adotadas, salvo risco imediato fundamentado (Art. 31).</p>
                      )}

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">HIPÓTESE (Art. 11, §1º)</label>
                        <select value={afHipotese} onChange={e => setAfHipotese(e.target.value as HipoteseAfastamento | '')} className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm w-full cursor-pointer">
                          <option value="">Selecione...</option>
                          {(Object.keys(HIPOTESES_AFASTAMENTO) as HipoteseAfastamento[]).map(h => <option key={h} value={h}>{HIPOTESES_AFASTAMENTO[h]}</option>)}
                        </select>
                        {afHipotese === 'recorrencia_grave' && historicoAluno.comIntervencao === 0 && (
                          <p className="text-[9px] font-bold text-orange-300 ml-1">⚠ Não há intervenções da gestão nos registros recentes deste estudante. Esta hipótese exige registro documental de estratégias anteriores e de sua insuficiência (Art. 3º, XIV). Consulte o Histórico Permanente.</p>
                        )}
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">MOTIVAÇÃO EXPRESSA E ELEMENTOS OBJETIVOS DO RISCO</label>
                        <textarea rows={3} value={afMotivacao} onChange={e => setAfMotivacao(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-red-400 outline-none shadow-sm uppercase placeholder:text-gray-300" placeholder="Fatos concretos e documentados que demonstram o risco..." />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">DIAS LETIVOS (MÁX. {MAX_DIAS_AFASTAMENTO} — Art. 11, §5º)</label>
                          <input type="number" min={1} max={MAX_DIAS_AFASTAMENTO} value={afDias}
                            onChange={e => setAfDias(Math.min(MAX_DIAS_AFASTAMENTO, Math.max(1, Number(e.target.value) || 1)))}
                            className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm w-full" />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">PERÍODO (A PARTIR DA DATA DO REGISTRO)</label>
                          <div className="h-12 sm:h-14 flex items-center px-5 bg-white/20 rounded-2xl font-black text-white text-[11px] border border-white/20">
                            {formatBR(ultimoDiaLetivo(registerDate, 1))} a {formatBR(ultimoDiaLetivo(registerDate, afDias))} · retorno {formatBR(proximoDiaLetivo(ultimoDiaLetivo(registerDate, afDias)))}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">PLANO DE ESTUDOS DURANTE O AFASTAMENTO (Art. 11, §3º)</label>
                        <textarea rows={2} value={afPlano} onChange={e => setAfPlano(e.target.value)} className="w-full p-4 border border-gray-200 rounded-2xl text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-red-400 outline-none shadow-sm uppercase placeholder:text-gray-300" placeholder="Atividades orientadas, plataformas, entrega e acompanhamento..." />
                      </div>

                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">COMUNICAÇÃO IMEDIATA (Art. 12)</label>
                        <label className="flex items-start gap-2 text-[10px] font-bold text-white uppercase cursor-pointer"><input type="checkbox" checked={afFamilia} onChange={e => setAfFamilia(e.target.checked)} className="w-4 h-4 mt-0.5" /> Família / responsáveis comunicados formalmente (com canais de manifestação — Art. 12, §§1º e 3º)</label>
                        <label className="flex items-start gap-2 text-[10px] font-bold text-white uppercase cursor-pointer"><input type="checkbox" checked={afURE} onChange={e => setAfURE(e.target.checked)} className="w-4 h-4 mt-0.5" /> URE comunicada</label>
                        <label className="flex items-start gap-2 text-[10px] font-bold text-white uppercase cursor-pointer"><input type="checkbox" checked={afRede} onChange={e => setAfRede(e.target.checked)} className="w-4 h-4 mt-0.5" /> Rede protetiva / órgãos competentes comunicados (quando a situação exigir)</label>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1">DESCRIÇÃO</label>
                    <textarea
                      rows={5}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      className="w-full p-6 border border-gray-200 rounded-[28px] text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm uppercase placeholder:text-gray-300"
                      placeholder="Relatório detalhado da ocorrência e medidas tomadas..."
                    ></textarea>
                  </div>

                  <div className="flex justify-center pt-4">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="w-full sm:w-auto px-10 sm:px-20 py-5 sm:py-6 bg-gradient-to-r from-[#001a35] to-[#0040a0] hover:scale-[1.02] text-white font-black text-[10px] sm:text-xs uppercase tracking-[0.25em] rounded-2xl shadow-xl transition-all border-b-8 border-blue-900 active:translate-y-1 active:border-b-0"
                    >
                      {isSaving ? 'PROCESSANDO...' : 'FINALIZAR E SALVAR REGISTRO'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <section className="bg-white rounded-[32px] shadow-2xl overflow-hidden border border-gray-100">
              <div className="px-6 sm:px-10 py-6 bg-gradient-to-r from-black to-blue-900 text-white flex flex-col gap-4">

                {/* ── Linha 1: título + busca + busca permanente ── */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                  <div className="flex flex-col items-center md:items-start w-full md:w-auto">
                    <h3 className="text-[11px] sm:text-[13px] font-black uppercase tracking-widest text-center w-full md:text-left">PAINEL DE REGISTROS</h3>
                    <button
                      onClick={() => setShowPermanentSearch(true)}
                      className="text-[9px] text-teal-400 font-black uppercase text-center md:text-left hover:underline flex items-center gap-1 group"
                    >
                      Ir para Histórico Permanente
                      <svg className="w-2.5 h-2.5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        placeholder="Filtrar recentes..."
                        className="w-full pl-10 pr-6 py-2 rounded-xl bg-white/10 border border-white/20 text-[9px] sm:text-[10px] text-white outline-none"
                      />
                      <svg className="w-4 h-4 absolute left-3 top-2.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <button
                      onClick={onOpenSearch}
                      className="bg-teal-500 hover:bg-teal-600 text-white p-2.5 rounded-xl transition-all shadow-lg flex items-center gap-2 flex-shrink-0"
                      title="Busca Profunda na Planilha"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                      <span className="text-[10px] font-black uppercase hidden sm:inline">Busca Permanente</span>
                    </button>
                  </div>
                </div>

                {/* ── Linha 2: filtro por ação (pills sempre visíveis) ── */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase text-white/50 tracking-widest">Filtrar por ação:</span>
                    <span className="text-[8px] font-black text-teal-400 uppercase tracking-widest">
                      {history.length} {history.length === 1 ? 'registro' : 'registros'}
                      {statusFilter !== 'Todos' && ` · ${statusFilter}`}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Todos',        icon: '✦', statuses: [] },
                      { label: 'Visualizada',  icon: '👁', statuses: ['visualizada'] },
                      { label: 'Pendente',     icon: '⏳', statuses: ['pendente'] },
                      { label: 'Em Andamento', icon: '🔄', statuses: ['em andamento', 'em análise', 'em analise'] },
                      { label: 'Resolvida',    icon: '✅', statuses: ['resolvida', 'resolvido'] },
                    ].map(({ label, icon, statuses }) => {
                      const count = label === 'Todos'
                        ? incidents.length
                        : incidents.filter(i => statuses.includes((i.status || '').toLowerCase().trim())).length;
                      return (
                        <button
                          key={label}
                          onClick={() => setStatusFilter(label)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-black uppercase transition-all border ${
                            statusFilter === label
                              ? 'bg-teal-500 border-teal-400 text-white shadow-lg scale-105'
                              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
                          }`}
                        >
                          <span>{icon}</span>
                          <span>{label}</span>
                          <span className={`ml-1 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                            statusFilter === label ? 'bg-white/30 text-white' : 'bg-white/20 text-white/70'
                          }`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>

              <div className="overflow-x-auto overflow-y-auto max-h-[600px] custom-scrollbar bg-gray-50/30">

                {/* ── CARDS MOBILE (< sm) ───────────────────────────────── */}
                <div className="sm:hidden flex flex-col gap-[12px] bg-gray-100/80 p-3">
                  {history.length > 0 ? history.map(inc => (
                    <div key={inc.id} className="p-4 space-y-2 rounded-2xl shadow-[0_4px_8px_rgba(0,0,0,0.18),0_1px_2px_rgba(0,0,0,0.10)] hover:shadow-[0_6px_16px_rgba(0,0,0,0.22)] transition-shadow border border-blue-100" style={{ background: 'linear-gradient(to bottom, #ffffff 60%, #dbeafe 100%)' }}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-gray-500">{inc.date}</span>
                          <span className="bg-blue-100 text-blue-800 text-[9px] font-black px-2 py-0.5 rounded-full">{inc.classRoom}</span>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <StatusBadge status={inc.status} size="small" />
                          {inc.lastViewedAt && <span className="text-[7px] font-bold text-teal-600 uppercase">Visualizado</span>}
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-[#002b5c] uppercase">{inc.studentName}</p>
                        <p className="text-[9px] font-bold text-gray-400">RA: {inc.ra}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${isCategoriaRestritiva(inc.category) ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{inc.category}</span>
                        {inc.resolucao68?.nivel && <span className="px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-gray-800 text-white">Nível {inc.resolucao68.nivel}</span>}
                        <span className="text-[9px] font-bold text-gray-500 uppercase">{inc.professorName}</span>
                      </div>
                      <p className="text-[9px] text-gray-600 italic leading-snug">{inc.description}</p>
                      {inc.managementFeedback && (
                        <div className="p-2 bg-teal-50 border-l-2 border-teal-500 text-teal-800 font-bold text-[8px]">DEVOLUTIVA: {inc.managementFeedback}</div>
                      )}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => generateIncidentPDF(inc, 'view')} className="flex-1 py-2 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          Ver
                        </button>
                        <button onClick={() => generateIncidentPDF(inc, 'download')} className="flex-1 py-2 bg-green-50 text-green-600 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          PDF
                        </button>
                        <button onClick={() => openUpdateModal(inc)} className="flex-1 py-2 bg-teal-50 text-teal-600 rounded-xl text-[9px] font-black uppercase flex items-center justify-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Editar
                        </button>
                        <button onClick={() => onDelete(inc.id)} className="py-2 px-3 bg-red-50 text-red-600 rounded-xl flex items-center justify-center">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  )) : (
                    <div className="p-20 text-center text-gray-300 font-black uppercase text-xs tracking-widest">Nenhum registro recente encontrado</div>
                  )}
                </div>

                {/* ── TABELA DESKTOP (≥ sm) ─────────────────────────────── */}
                <table className="hidden sm:table w-full text-left text-[10px] min-w-[1200px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#f8fafc] border-b border-gray-200" style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.12)' }}>
                      <th className="p-4 font-black uppercase">Data</th>
                      <th className="p-4 font-black uppercase">Status</th>
                      <th className="p-4 font-black uppercase">Aluno</th>
                      <th className="p-4 font-black uppercase">Turma</th>
                      <th className="p-4 text-center font-black uppercase">Documento Ação</th>
                      <th className="p-4 font-black uppercase">Tipo</th>
                      <th className="p-4 text-center font-black uppercase">Remover</th>
                      <th className="p-4 font-black uppercase">Responsável</th>
                      <th className="p-4 font-black uppercase">Relato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {history.length > 0 ? history.map(inc => (
                      <tr key={inc.id} className="hover:bg-blue-50/40 transition-all">
                        <td className="p-4 font-black text-gray-500">{inc.date}</td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={inc.status} size="small" />
                            {inc.lastViewedAt && <span className="text-[7px] font-bold text-teal-600 uppercase">Visualizado</span>}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="font-black text-[#002b5c] uppercase">{inc.studentName}</span>
                            <span className="text-[8px] font-bold text-gray-400">RA: {inc.ra}</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-blue-600">{inc.classRoom}</td>
                        <td className="p-4">
                          <div className="flex justify-center gap-3">
                            <button onClick={() => generateIncidentPDF(inc, 'view')} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-all shadow-sm" title="Visualizar Documento">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </button>
                            <button onClick={() => generateIncidentPDF(inc, 'download')} className="p-3 bg-green-50 text-green-600 rounded-2xl hover:bg-green-100 transition-all shadow-sm" title="Baixar Documento">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </button>
                            <button onClick={() => openUpdateModal(inc)} className="p-3 bg-teal-50 text-teal-600 rounded-2xl hover:bg-teal-100 transition-all shadow-sm" title="Atualizar Status / Devolutiva">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                          </div>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${isCategoriaRestritiva(inc.category) ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{inc.category}</span>
                          {inc.resolucao68?.nivel && <span className="ml-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase bg-gray-800 text-white">Nível {inc.resolucao68.nivel}</span>}
                        </td>
                        <td className="p-4 text-center">
                          <button onClick={() => onDelete(inc.id)} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm" title="Excluir registro">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                        <td className="p-4 font-black text-[#002b5c] uppercase truncate max-w-[150px]">{inc.professorName}</td>
                        <td className="p-4 max-sm truncate text-gray-600 italic">
                          <div>{inc.description}</div>
                          {inc.managementFeedback && (
                            <div className="mt-2 p-2 bg-teal-50 border-l-2 border-teal-500 text-teal-800 font-bold text-[8px]">DEVOLUTIVA: {inc.managementFeedback}</div>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={9} className="p-20 text-center text-gray-300 font-black uppercase text-xs tracking-widest">Nenhum registro recente encontrado</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {activeTab === 'estatisticas' && (
          <div className="animate-fade-in space-y-8 pb-10">
            {/* ── Indicadores de monitoramento — Res. SEDUC 68/2026, Art. 9º, §4º ── */}
            {(() => {
              const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;
              const tiles: { label: string; valor: string; detalhe: string; cor: string }[] = [
                { label: 'Reincidência', valor: `${pct(indicadores.reincidentes, indicadores.alunos)}%`, detalhe: `${indicadores.reincidentes} de ${indicadores.alunos} estudantes com 2+ registros`, cor: 'border-orange-500' },
                { label: 'Situações resolvidas', valor: `${indicadores.resolvidas}`, detalhe: `${pct(indicadores.resolvidas, indicadores.total)}% de ${indicadores.total} registros`, cor: 'border-teal-500' },
                { label: 'Intervenções pedagógicas', valor: `${indicadores.totalIntervencoes}`, detalhe: `${indicadores.porIntervencao.length} tipos diferentes`, cor: 'border-blue-500' },
                { label: 'Articulações c/ rede protetiva', valor: `${indicadores.rede}`, detalhe: 'Encaminhamentos à Rede Protetiva', cor: 'border-purple-500' },
                { label: 'Estudos dirigidos', valor: `${indicadores.estudos}`, detalhe: 'Art. 7º, IX', cor: 'border-indigo-500' },
                { label: 'Afastamentos preventivos', valor: `${indicadores.afast}`, detalhe: indicadores.afastVencidos > 0 ? `${indicadores.afastVencidos} com prazo vencido` : 'Nenhum prazo vencido', cor: 'border-red-500' },
                { label: 'Registrados no Conviva', valor: `${pct(indicadores.conviva, indicadores.total)}%`, detalhe: `${indicadores.conviva} de ${indicadores.total} registros`, cor: 'border-green-600' },
                { label: 'Por nível (I / II / III)', valor: `${indicadores.porNivel.I} / ${indicadores.porNivel.II} / ${indicadores.porNivel.III}`, detalhe: `${indicadores.porNivel['—']} sem classificação`, cor: 'border-gray-700' },
              ];
              return (
                <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10">
                  <div className="bg-gradient-to-r from-black to-blue-900 p-6 text-center border-b-4 border-teal-500">
                    <h3 className="text-white font-black text-xs uppercase tracking-widest">📈 Indicadores de Convivência — Res. SEDUC 68/2026</h3>
                    <p className="text-teal-400 text-[9px] font-bold mt-1 uppercase">Art. 9º, §4º · base: registros carregados (últimos 30 dias)</p>
                  </div>
                  <div className="p-6 sm:p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {tiles.map(t => (
                      <div key={t.label} className={`p-4 bg-gray-50 rounded-2xl border-l-8 ${t.cor}`}>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{t.label}</p>
                        <p className="text-2xl font-black text-[#002b5c] mt-1">{t.valor}</p>
                        <p className="text-[9px] font-bold text-gray-500 uppercase mt-1">{t.detalhe}</p>
                      </div>
                    ))}
                  </div>
                  {indicadores.porIntervencao.length > 0 && (
                    <div className="px-6 sm:px-8 pb-8 space-y-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Número e tipo de intervenções adotadas</p>
                      {indicadores.porIntervencao.map(([tipo, n]) => (
                        <div key={tipo} className="flex items-center gap-3">
                          <span className="text-[9px] font-black text-[#002b5c] uppercase w-48 sm:w-80 truncate" title={tipo}>{tipo}</span>
                          <div className="flex-1 bg-gray-200 h-2 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full" style={{ width: `${pct(n, indicadores.porIntervencao[0][1])}%` }} />
                          </div>
                          <span className="text-[10px] font-black text-blue-600 w-6 text-right">{n}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Dashboard Estatístico */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Card Top Turmas */}
              <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10 flex flex-col">
                <div className="bg-gradient-to-r from-black to-blue-900 p-6 text-center border-b-4 border-teal-500">
                  <h3 className="text-white font-black text-xs uppercase tracking-widest">🏆 Turmas c/ mais Ocorrências</h3>
                </div>
                <div className="p-8 flex-1 flex flex-col gap-4">
                  {stats.topClasses.length > 0 ? stats.topClasses.map(([turma, count]: [string, number], _idx: number) => (
                    <div key={turma} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-l-8 border-teal-500">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-[#002b5c]">{_idx + 1}º - {turma}</span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase">Ambiente Escolar</span>
                      </div>
                      <span className="bg-teal-100 text-teal-600 px-4 py-2 rounded-xl font-black text-[12px]">{count}</span>
                    </div>
                  )) : (
                    <p className="text-center text-gray-300 font-bold uppercase text-[10px] py-10">Dados insuficientes</p>
                  )}
                </div>
              </div>

              {/* Card Top Alunos */}
              <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10 flex flex-col">
                <div className="bg-gradient-to-r from-black to-blue-900 p-6 text-center border-b-4 border-orange-500">
                  <h3 className="text-white font-black text-xs uppercase tracking-widest">👤 Alunos em Foco</h3>
                </div>
                <div className="p-8 flex-1 flex flex-col gap-4">
                  {stats.topStudents.length > 0 ? stats.topStudents.map(([nome, data]: [string, {count: number, turma: string}], _idx: number) => (
                    <div key={nome} className="flex items-start justify-between p-4 bg-gray-50 rounded-2xl border-l-8 border-orange-500">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-[#002b5c] uppercase truncate max-w-[150px]">{nome}</span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase">Turma: {data.turma}</span>
                      </div>
                      <span className="bg-orange-100 text-orange-600 px-4 py-2 rounded-xl font-black text-[12px]">{data.count}</span>
                    </div>
                  )) : (
                    <p className="text-center text-gray-300 font-bold uppercase text-[10px] py-10">Dados insuficientes</p>
                  )}
                </div>
              </div>

              {/* Tipos de Ocorrência */}
              <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10 flex flex-col">
                <div className="bg-gradient-to-r from-black to-blue-900 p-6 text-center border-b-4 border-blue-500">
                  <h3 className="text-white font-black text-xs uppercase tracking-widest">📝 Tipos mais Comuns</h3>
                </div>
                <div className="p-8 flex-1 flex flex-col gap-4">
                  {stats.topTypes.length > 0 ? stats.topTypes.map(([type, count]) => {
                    const barColor = type.includes('DISCIPLINAR') ? 'bg-red-500' :
                      type.includes('PEDAGÓGICA') ? 'bg-blue-500' :
                        'bg-teal-500';
                    const textColor = type.includes('DISCIPLINAR') ? 'text-red-600' :
                      type.includes('PEDAGÓGICA') ? 'text-blue-600' :
                        'text-teal-600';

                    return (
                      <div key={type} className="flex flex-col gap-2 p-4 bg-gray-50 rounded-2xl">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] font-black text-[#002b5c] uppercase">{type}</span>
                          <span className={`text-[10px] font-black ${textColor}`}>{count} unidades</span>
                        </div>
                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                          <div
                            className={`${barColor} h-full transition-all duration-1000`}
                            style={{ width: `${incidents.length > 0 ? Math.min(100, (count / incidents.length) * 100) : 0}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  }) : (
                    <p className="text-center text-gray-300 font-bold uppercase text-[10px] py-10">Nenhum dado cadastrado</p>
                  )}
                </div>
              </div>
            </div>

            {/* Segunda Linha de Estatísticas: Professores e Gestores */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Card Top Professores */}
              <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10 flex flex-col">
                <div className="bg-gradient-to-r from-black to-blue-900 p-6 text-center border-b-4 border-teal-400">
                  <h3 className="text-white font-black text-xs uppercase tracking-widest">👨‍🏫 Professores: Maior Volume</h3>
                </div>
                <div className="p-8 flex-1 flex flex-col gap-4">
                  {stats.topProfs.length > 0 ? stats.topProfs.map(([nome, count], idx) => (
                    <div key={nome} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-l-8 border-teal-400">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-[#002b5c] border-b border-gray-100 pb-1">{idx + 1}º - {nome}</span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase mt-1">Registros de Aula</span>
                      </div>
                      <div className="flex flex-col items-center bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                        <span className="text-teal-600 font-black text-[14px] leading-tight">{count}</span>
                        <span className="text-[7px] font-black text-gray-400 uppercase">Ocorrências</span>
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center py-10 opacity-30">
                      <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      <p className="text-center text-gray-500 font-bold uppercase text-[9px] tracking-widest">Nenhum registro de professor</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Top Gestores */}
              <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10 flex flex-col">
                <div className="bg-gradient-to-r from-black to-blue-900 p-6 text-center border-b-4 border-orange-400">
                  <h3 className="text-white font-black text-xs uppercase tracking-widest">💼 Gestores: Maior Volume</h3>
                </div>
                <div className="p-8 flex-1 flex flex-col gap-4">
                  {stats.topManagers.length > 0 ? stats.topManagers.map(([nome, count], idx) => (
                    <div key={nome} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border-l-8 border-orange-400">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-[#002b5c] border-b border-gray-100 pb-1">{idx + 1}º - {nome}</span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase mt-1">Registros Administrativos</span>
                      </div>
                      <div className="flex flex-col items-center bg-white px-4 py-2 rounded-xl shadow-sm border border-gray-100">
                        <span className="text-orange-600 font-black text-[14px] leading-tight">{count}</span>
                        <span className="text-[7px] font-black text-gray-400 uppercase">Ocorrências</span>
                      </div>
                    </div>
                  )) : (
                    <div className="flex flex-col items-center justify-center py-10 opacity-30">
                      <svg className="w-12 h-12 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                      <p className="text-center text-gray-500 font-bold uppercase text-[9px] tracking-widest">Nenhum registro de gestão</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Guia de Medidas Pedagógicas */}
            <div className="bg-white rounded-[40px] shadow-2xl overflow-hidden border border-white/10">
              <div className="bg-gradient-to-r from-black to-blue-900 p-8 text-center border-b-4 border-teal-500">
                <h2 className="text-white font-black text-sm uppercase tracking-widest">📚 Guia de Respostas Institucionais</h2>
                <p className="text-teal-400 text-[10px] font-bold mt-2 uppercase">Gradação do Art. 5º da Resolução SEDUC nº 68/2026 e Protocolo 179</p>
              </div>
              <div className="p-10 grid grid-cols-1 md:grid-cols-3 gap-10">
                {Object.entries(pedagogicalGuide).map(([type, measures]) => (
                  <div key={type} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${type.startsWith('Nível III') ? 'bg-red-500' : type.startsWith('Nível II') ? 'bg-orange-500' : 'bg-teal-500'} animate-pulse`}></div>
                      <h4 className="text-[12px] font-black text-[#002b5c] uppercase tracking-tighter">{type}</h4>
                    </div>
                    <ul className="space-y-4">
                      {measures.map((m, i) => (
                        <li key={i} className="flex gap-4 items-start group">
                          <span className="text-orange-500 font-black text-xs">0{i + 1}</span>
                          <p className="text-[11px] font-bold text-gray-600 uppercase leading-relaxed group-hover:text-black transition-colors">{m}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="bg-gray-50 p-6 text-center border-t border-gray-100 italic text-[10px] font-bold text-gray-400 uppercase">
                * As intervenções não são respostas automáticas: definem-se pela análise contextualizada (Art. 7º, §1º). É vedado o caráter exclusivamente punitivo, a exposição pública do estudante e o uso de afastamento ou transferência como castigo (Arts. 1º, §1º e 28).
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Modal de Atualização de Status e Devolutiva */}
      {isUpdatingStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in shadow-2xl">
          <div className="bg-white w-full max-w-xl rounded-[32px] overflow-hidden flex flex-col border border-white/20 max-h-[92vh]">
            <div className="bg-gradient-to-r from-black to-blue-900 p-6 text-center border-b-4 border-teal-500 shrink-0">
              <h3 className="text-white font-black text-xs uppercase tracking-[0.2em]">Sinalizar Estágio da Ocorrência</h3>
              <p className="text-teal-400 text-[9px] font-bold mt-1 uppercase">{isUpdatingStatus.studentName}</p>
            </div>

            <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">

              {/* Status */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Status da Ocorrência</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black"
                >
                  <option value="Pendente">🟡 PENDENTE</option>
                  <option value="Visualizada">🔵 VISUALIZADA</option>
                  <option value="Em Andamento">🟠 EM ANDAMENTO</option>
                  <option value="Resolvida">🟢 RESOLVIDA</option>
                </select>
              </div>

              {/* ── RESOLUÇÃO SEDUC 68/2026 ─────────────────────────────── */}
              <div className="space-y-4 p-4 rounded-2xl border-2 border-blue-100 bg-blue-50/40">
                <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Registro e gradação — Res. SEDUC 68/2026</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Nível (Art. 5º)</label>
                    <select value={r68Edit.nivel || ''} onChange={e => upR68({ nivel: (e.target.value || undefined) as NivelResolucao68 | undefined })} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black">
                      <option value="">Não classificado</option>
                      {(Object.keys(NIVEIS) as NivelResolucao68[]).map(n => <option key={n} value={n}>{NIVEIS[n].titulo}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Data de ciência (Art. 9º, §3º)</label>
                    <input type="date" value={r68Edit.dataCiencia || ''} onChange={e => upR68({ dataCiencia: e.target.value || undefined })} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Família comunicada em</label>
                    <input type="date" value={r68Edit.familiaComunicadaEm || ''} onChange={e => upR68({ familiaComunicadaEm: e.target.value || undefined })} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Plataforma Conviva (Art. 9º)</label>
                    <div className="flex gap-2 items-center">
                      <label className="flex items-start gap-2 text-[10px] font-bold text-gray-700 uppercase cursor-pointer items-center whitespace-nowrap">
                        <input type="checkbox" checked={!!r68Edit.conviva?.registrado} onChange={e => upR68({ conviva: { ...r68Edit.conviva, registrado: e.target.checked } })} className="w-4 h-4" />
                        Registrado
                      </label>
                      <input type="text" placeholder="Nº / protocolo" value={r68Edit.conviva?.protocolo || ''} disabled={!r68Edit.conviva?.registrado}
                        onChange={e => upR68({ conviva: { registrado: true, protocolo: e.target.value || undefined } })} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black disabled:opacity-50" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Manifestação do estudante (Art. 3º, V)</label>
                  <textarea rows={2} value={r68Edit.manifestacaoEstudante || ''} onChange={e => upR68({ manifestacaoEstudante: e.target.value.toUpperCase() || undefined })}
                    placeholder="Versão do estudante sobre os fatos, colhida em ambiente adequado..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black uppercase" />
                </div>

                {r68Edit.afastamento && (() => {
                  const af = r68Edit.afastamento;
                  const sit = situacaoAfastamento(af);
                  return (
                    <div className="space-y-3 p-4 rounded-2xl border-2 border-red-200 bg-red-50">
                      <p className="text-[10px] font-black text-red-800 uppercase tracking-widest">Afastamento preventivo temporário</p>
                      <p className="text-[10px] font-bold text-gray-700">{HIPOTESES_AFASTAMENTO[af.hipotese]}</p>
                      <p className="text-[10px] font-bold text-gray-700 uppercase">
                        Início {formatBR(af.inicio)} · {af.diasLetivos} dia(s) letivo(s){af.prorrogacao ? ` + ${af.prorrogacao.diasLetivos} de prorrogação` : ''} · até {formatBR(sit.fim)} · retorno previsto {formatBR(sit.retornoPrevisto)}
                      </p>
                      {sit.vencido && <p className="text-[10px] font-black text-red-700 uppercase">⚠ Prazo encerrado: registre o retorno ou uma prorrogação deliberada (Art. 11, §8º).</p>}

                      {!af.prorrogacao ? (
                        <button type="button" onClick={() => upAf({ prorrogacao: { dataConselho: '', diasLetivos: 1, fundamentacao: '', familiaComunicada: false } })}
                          className="text-[9px] font-black text-red-700 uppercase underline">+ Registrar prorrogação (Conselho de Escola)</button>
                      ) : (
                        <div className="space-y-2 p-3 bg-white rounded-xl border border-red-200">
                          <p className="text-[9px] font-black text-red-800 uppercase">Prorrogação — Art. 11, §§6º e 7º</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Data da apreciação pelo Conselho</label>
                              <input type="date" value={af.prorrogacao.dataConselho} onChange={e => upAf({ prorrogacao: { ...af.prorrogacao!, dataConselho: e.target.value } })} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Dias letivos (máx. {MAX_DIAS_AFASTAMENTO})</label>
                              <input type="number" min={1} max={MAX_DIAS_AFASTAMENTO} value={af.prorrogacao.diasLetivos}
                                onChange={e => upAf({ prorrogacao: { ...af.prorrogacao!, diasLetivos: Math.min(MAX_DIAS_AFASTAMENTO, Math.max(1, Number(e.target.value) || 1)) } })} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black" />
                            </div>
                          </div>
                          <textarea rows={2} value={af.prorrogacao.fundamentacao} onChange={e => upAf({ prorrogacao: { ...af.prorrogacao!, fundamentacao: e.target.value.toUpperCase() } })}
                            placeholder="Reavaliação formal e fundamentada da Direção..." className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black uppercase" />
                          <label className="flex items-start gap-2 text-[10px] font-bold text-gray-700 uppercase cursor-pointer">
                            <input type="checkbox" checked={af.prorrogacao.familiaComunicada} onChange={e => upAf({ prorrogacao: { ...af.prorrogacao!, familiaComunicada: e.target.checked } })} className="w-4 h-4 mt-0.5" />
                            Família comunicada formalmente da prorrogação
                          </label>
                          <button type="button" onClick={() => upAf({ prorrogacao: undefined })} className="text-[9px] font-black text-gray-500 uppercase underline">Remover prorrogação</button>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Retorno às atividades presenciais em</label>
                        <input type="date" value={af.retornoEm || ''} onChange={e => upAf({ retornoEm: e.target.value || undefined })} className="w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-black outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black" />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── ENCAMINHAMENTOS DA GESTÃO ───────────────────────────── */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">
                  Intervenções / Encaminhamentos da Gestão (Art. 7º)
                </label>
                <p className="text-[9px] text-gray-400 ml-2 -mt-2">Clique em cada encaminhamento para descrever a intervenção realizada</p>

                <div className="flex flex-col gap-2">
                  {[
                    ...LISTA_ENCAMINHAMENTOS_GESTAO.filter(l => l.grupo !== 'especial'),
                    // Encaminhamentos antigos (anteriores à Res. 68) continuam visíveis para não serem perdidos
                    ...selectedMgmtReferrals
                      .filter(t => !LISTA_ENCAMINHAMENTOS_GESTAO.some(l => l.label === t))
                      .map(t => ({ label: t, popUp: true, grupo: undefined as string | undefined })),
                    ...LISTA_ENCAMINHAMENTOS_GESTAO.filter(l => l.grupo === 'especial'),
                  ].map(({ label: tipo, popUp, grupo }, idx, arr) => {
                    const marcado = selectedMgmtReferrals.includes(tipo);
                    const showSeparator = grupo === 'especial' && (idx === 0 || arr[idx - 1].grupo !== 'especial');
                    const isEspecial = grupo === 'especial';
                    const iconMap: Record<string, string> = { 'Incidente': '⚠️', 'Acidente': '🚨', 'Agressão': '👊' };
                    const colorMap: Record<string, string> = {
                      'Incidente': marcado ? 'border-yellow-400 bg-yellow-50' : 'border-yellow-200 bg-yellow-50/40',
                      'Acidente':  marcado ? 'border-red-400 bg-red-50'       : 'border-red-200 bg-red-50/40',
                      'Agressão':  marcado ? 'border-purple-500 bg-purple-50' : 'border-purple-200 bg-purple-50/40',
                    };
                    const textColorMap: Record<string, string> = {
                      'Incidente': marcado ? 'text-yellow-800' : 'text-yellow-700',
                      'Acidente':  marcado ? 'text-red-800'    : 'text-red-700',
                      'Agressão':  marcado ? 'text-purple-900' : 'text-purple-700',
                    };
                    return (
                      <React.Fragment key={tipo}>
                        {showSeparator && (
                          <div className="flex items-center gap-2 mt-2 mb-1">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-[8px] font-black uppercase tracking-widest text-gray-400">Ocorrências Especiais</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                        )}
                        <div className={`rounded-xl border-2 transition-all ${isEspecial ? colorMap[tipo] : (marcado ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-gray-50')}`}>
                          <div className="flex items-center gap-3 px-4 py-3">
                            <button
                              type="button"
                              onClick={() => popUp ? handleMgmtReferralClick(tipo) : handleMgmtReferralToggle(tipo)}
                              className={`flex-1 text-left text-[10px] font-bold uppercase transition-all ${isEspecial ? textColorMap[tipo] : (marcado ? 'text-purple-800' : 'text-gray-600 hover:text-gray-900')}`}
                            >
                              <span className={`inline-block w-4 h-4 rounded border-2 mr-2 align-middle transition-all ${marcado ? 'bg-gray-700 border-gray-700' : 'border-gray-400'}`}>
                                {marcado && <svg viewBox="0 0 12 12" fill="none" className="w-full h-full p-0.5"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                              </span>
                              {isEspecial && iconMap[tipo] && <span className="mr-1">{iconMap[tipo]}</span>}
                              {tipo}
                              {popUp && <span className="ml-2 text-[8px] text-gray-400 normal-case font-normal">(descrição)</span>}
                            </button>
                            {marcado && (
                              <div className="flex gap-1 shrink-0">
                                {popUp && (
                                  <>
                                    <button type="button" onClick={() => handleMgmtReferralClick(tipo)} className="text-[9px] font-black text-purple-600 hover:text-purple-800 uppercase underline">editar</button>
                                    <span className="text-gray-300">|</span>
                                  </>
                                )}
                                <button type="button" onClick={() => handleRemoveMgmtReferral(tipo)} className="text-[9px] font-black text-red-400 hover:text-red-600 uppercase underline">remover</button>
                              </div>
                            )}
                          </div>
                          {marcado && mgmtReferralDescriptions[tipo] && (
                            <div className="px-4 pb-3 -mt-1">
                              <p className="text-[9px] font-black text-purple-500 uppercase tracking-wide mb-0.5">Descrição:</p>
                              <p className="text-[10px] text-purple-800 bg-white rounded-lg border border-purple-200 px-3 py-2 leading-relaxed">{mgmtReferralDescriptions[tipo]}</p>
                            </div>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
              {/* ── FIM ENCAMINHAMENTOS ─────────────────────────────────── */}

              {/* Justificativa / Devolutiva */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">Observações Adicionais / Devolutiva</label>
                <textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={3}
                  placeholder="Observações adicionais sobre o encaminhamento..."
                  className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black uppercase"
                ></textarea>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setIsUpdatingStatus(null)}
                  className="flex-1 py-4 bg-gray-100 text-gray-500 font-black text-[10px] uppercase rounded-2xl hover:bg-gray-200 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateStatus}
                  className="flex-1 py-4 bg-teal-500 text-white font-black text-[10px] uppercase rounded-2xl hover:bg-teal-600 transition-all shadow-md active:scale-95"
                >
                  Salvar Encaminhamentos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── POP-UP DESCRIÇÃO DO ENCAMINHAMENTO DA GESTÃO ─────────────────── */}
      {showMgmtReferralModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-purple-900 to-purple-700 p-6 text-white">
              <h3 className="font-black text-xs uppercase tracking-widest">Encaminhamento Gestão</h3>
              <p className="text-purple-200 text-[9px] font-bold mt-1 uppercase leading-relaxed">{showMgmtReferralModal}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Descrição da Intervenção Realizada</label>
                <textarea
                  rows={5}
                  value={mgmtReferralModalText}
                  onChange={e => setMgmtReferralModalText(e.target.value)}
                  className="w-full p-4 bg-gray-50 border-2 border-purple-200 rounded-2xl text-xs font-bold text-black outline-none focus:ring-2 focus:ring-purple-400"
                  placeholder="Descreva detalhadamente a intervenção realizada pela equipe gestora..."
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleConfirmMgmtReferral}
                  className="flex-1 py-3 bg-purple-600 text-white font-black text-[10px] uppercase rounded-xl hover:bg-purple-700 transition-all"
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setShowMgmtReferralModal(null)}
                  className="flex-1 py-3 bg-gray-100 text-gray-600 font-black text-[10px] uppercase rounded-xl hover:bg-gray-200 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Busca no Histórico Permanente */}
      {showPermanentSearch && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in shadow-2xl">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] overflow-hidden flex flex-col border border-white/20">
            <div className="bg-[#002b5c] p-6 text-center shrink-0 border-b-4 border-orange-500">
              <h3 className="text-white font-black text-xs uppercase tracking-[0.2em]">Busca Criteriosa no Histórico Permanente</h3>
              <p className="text-orange-400 text-[9px] font-bold mt-1 uppercase">Localizar Aluno e Registros</p>
            </div>

            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex flex-col gap-6">
                {/* Campo de Busca */}
                <div className="relative group">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-4 mb-2">Digite as iniciais do aluno</label>
                  <div className="relative">
                    <input
                      autoFocus
                      type="text"
                      value={permanentSearchTerm}
                      onChange={(e) => {
                        setPermanentSearchTerm(e.target.value.toUpperCase());
                        setSelectedStudentForHistory(null);
                        setStudentHistory([]);
                      }}
                      placeholder="(CARREGARÁ APENAS INICIAIS CORRESPONDENTES)"
                      className="w-full h-16 pl-14 pr-6 bg-gray-50 border-2 border-gray-100 rounded-3xl text-sm font-black outline-none focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 transition-all text-black uppercase tracking-wider"
                    />
                    <svg className="w-6 h-6 absolute left-5 top-5 text-gray-300 group-focus-within:text-orange-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* Resultados da Busca (Alunos) */}
                {permanentSearchTerm && !selectedStudentForHistory && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                    {filteredStudents.length > 0 ? filteredStudents.map((s, idx) => (
                      <button
                        key={s.ra}
                        onClick={() => fetchStudentHistory(s)}
                        className={`flex flex-col items-start p-4 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-orange-50 border border-gray-100 hover:border-orange-200 rounded-2xl transition-all group`}
                      >
                        <span className="text-[11px] font-black text-[#002b5c] group-hover:text-orange-600 transition-colors">{s.nome}</span>
                        <div className="flex gap-3 mt-1">
                          <span className="text-[9px] font-bold text-gray-400 uppercase">Turma: {s.turma}</span>
                          <span className="text-[9px] font-bold text-gray-400 uppercase">RA: {s.ra}</span>
                        </div>
                      </button>
                    )) : (
                      <div className="col-span-full py-10 text-center">
                        <p className="text-gray-300 font-black uppercase text-[10px] tracking-[0.2em]">Nenhum aluno encontrado com estas iniciais</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Histórico do Aluno Selecionado */}
                {selectedStudentForHistory && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="p-6 bg-orange-50 border border-orange-100 rounded-[32px] flex flex-col md:flex-row justify-between items-center gap-4">
                      <div>
                        <h4 className="text-orange-800 font-black text-xs uppercase tracking-wider">{selectedStudentForHistory.nome}</h4>
                        <p className="text-orange-600/60 text-[9px] font-bold uppercase">RA: {selectedStudentForHistory.ra} | TURMA: {selectedStudentForHistory.turma}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <button
                          onClick={() => generateRelatorioCircunstanciado(selectedStudentForHistory, studentHistory, { responsavel: professorName, acao: 'view' })}
                          disabled={studentHistory.length === 0}
                          className="px-4 py-2 bg-[#002b5c] text-white rounded-xl text-[9px] font-black uppercase hover:shadow-lg disabled:opacity-40"
                          title="Relatório circunstanciado — Art. 15 da Res. SEDUC 68/2026"
                        >
                          📄 Relatório Circunstanciado
                        </button>
                        <button
                          onClick={() => setSelectedStudentForHistory(null)}
                          className="text-[9px] font-black text-orange-600 uppercase hover:underline"
                        >
                          Trocar Aluno
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h5 className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Histórico Acadêmico/Disciplinar</h5>
                      {isLoadingHistory ? (
                        <div className="py-20 flex flex-col items-center justify-center">
                          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      ) : studentHistory.length > 0 ? (
                        <div className="space-y-4">
                          {studentHistory.map(inc => (
                            <div key={inc.id} className="p-6 bg-white border border-gray-100 rounded-[28px] shadow-sm hover:shadow-md transition-all flex flex-col gap-3">
                              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-black text-gray-500">{inc.date}</span>
                                  <StatusBadge status={inc.status} size="small" />
                                </div>
                                <span className="px-3 py-1 bg-gray-100 rounded-lg text-[8px] font-black text-gray-500 uppercase">{inc.category}</span>
                              </div>
                              <p className="text-[10px] font-bold text-gray-600 uppercase italic line-clamp-3">{inc.description}</p>
                              <div className="pt-2 border-t border-gray-50 flex justify-between items-center">
                                <span className="text-[8px] font-bold text-gray-400 uppercase">PROF: {inc.professorName}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => generateIncidentPDF(inc, 'view')} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg></button>
                                  <button onClick={() => generateIncidentPDF(inc, 'download')} className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-14 text-center bg-gray-50 rounded-[32px] border border-dashed border-gray-200">
                          <p className="text-gray-300 font-black uppercase text-[10px] tracking-[0.2em]">Nenhum registro encontrado para este aluno</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center shrink-0">
              <button
                onClick={() => {
                  setShowPermanentSearch(false);
                  setPermanentSearchTerm('');
                  setSelectedStudentForHistory(null);
                }}
                className="px-12 py-4 bg-[#002b5c] text-white font-black text-[10px] uppercase rounded-full hover:shadow-xl transition-all active:scale-95"
              >
                Fechar Histórico
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Arquivo Histórico (registros anteriores a 30 dias) ─────────── */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] overflow-hidden flex flex-col border border-white/20">
            <div className="bg-gradient-to-r from-purple-900 to-purple-700 p-6 text-center shrink-0 border-b-4 border-purple-400">
              <h3 className="text-white font-black text-xs uppercase tracking-[0.2em]">🗄️ Arquivo Histórico</h3>
              <p className="text-purple-300 text-[9px] font-bold mt-1 uppercase">Registros anteriores a 30 dias — dados preservados na nuvem</p>
            </div>

            <div className="p-6 border-b border-gray-100 bg-purple-50/50 shrink-0">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Nome do Aluno</label>
                  <input
                    type="text"
                    value={archiveSearchName}
                    onChange={e => setArchiveSearchName(e.target.value)}
                    placeholder="Ex: JOÃO DA SILVA..."
                    className="w-full h-11 px-4 bg-white border border-gray-200 rounded-2xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-purple-500 transition-all uppercase text-black"
                    onKeyDown={e => e.key === 'Enter' && handleArchiveSearch()}
                  />
                </div>
                <div className="w-full sm:w-44 space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Turma</label>
                  <select
                    value={archiveSearchClass}
                    onChange={e => setArchiveSearchClass(e.target.value)}
                    className="w-full h-11 px-4 bg-white border border-gray-200 rounded-2xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-purple-500 transition-all text-black cursor-pointer"
                  >
                    <option value="">Todas as turmas</option>
                    {classes.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button
                  onClick={handleArchiveSearch}
                  disabled={isLoadingArchive || (!archiveSearchName.trim() && !archiveSearchClass.trim())}
                  className="h-11 px-8 bg-purple-600 text-white font-black text-[10px] uppercase rounded-2xl hover:bg-purple-700 transition-all shadow-md active:scale-95 disabled:opacity-50 shrink-0"
                >
                  {isLoadingArchive ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              <p className="text-[8px] font-bold text-purple-500 uppercase mt-2 ml-1">
                ℹ️ Informe ao menos o nome do aluno ou a turma para pesquisar. Máx. 200 registros por consulta.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              {isLoadingArchive ? (
                <div className="py-20 flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Consultando arquivo histórico...</p>
                </div>
              ) : archiveSearched && archivedIncidents.length === 0 ? (
                <div className="py-20 text-center bg-gray-50 rounded-[32px] border border-dashed border-gray-200">
                  <p className="text-gray-300 font-black uppercase text-[10px] tracking-[0.2em]">Nenhum registro histórico encontrado</p>
                  <p className="text-gray-300 text-[9px] mt-1">Tente outro nome ou turma</p>
                </div>
              ) : !archiveSearched ? (
                <div className="py-20 text-center">
                  <div className="text-6xl mb-4">🗄️</div>
                  <p className="text-gray-400 font-black uppercase text-[10px] tracking-[0.2em]">Use os filtros acima para consultar</p>
                  <p className="text-gray-300 text-[9px] mt-2">Todos os registros antigos estão preservados na nuvem</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest ml-2">{archivedIncidents.length} registro(s) encontrado(s)</p>
                  {archivedIncidents.map(inc => (
                    <div key={inc.id} className="p-5 bg-white border border-purple-100 rounded-[28px] shadow-sm hover:shadow-md transition-all flex flex-col gap-3">
                      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-[11px] font-black text-purple-700 uppercase">{inc.studentName}</span>
                          <span className="text-[9px] font-bold text-gray-400 uppercase">{inc.classRoom}</span>
                          <span className="text-[9px] font-bold text-gray-400">{inc.date}</span>
                          <StatusBadge status={inc.status} size="small" />
                        </div>
                        <span className="px-3 py-1 bg-purple-50 rounded-lg text-[8px] font-black text-purple-500 uppercase">{inc.category}</span>
                      </div>
                      <p className="text-[10px] font-bold text-gray-600 uppercase italic line-clamp-3">{inc.description}</p>
                      <div className="pt-2 border-t border-gray-50 flex justify-between items-center">
                        <span className="text-[8px] font-bold text-gray-400 uppercase">PROF: {inc.professorName}</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => generateIncidentPDF(inc, 'view')}
                            title="Visualizar documento"
                            className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                          </button>
                          <button
                            onClick={() => generateIncidentPDF(inc, 'download')}
                            title="Baixar documento"
                            className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center shrink-0">
              <button
                onClick={() => { setShowArchiveModal(false); setArchivedIncidents([]); setArchiveSearchName(''); setArchiveSearchClass(''); setArchiveSearched(false); }}
                className="px-12 py-4 bg-purple-700 text-white font-black text-[10px] uppercase rounded-full hover:bg-purple-800 hover:shadow-xl transition-all active:scale-95"
              >
                Fechar Arquivo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gerenciamento de Professores */}
      {showProfessorsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in shadow-2xl">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] overflow-hidden flex flex-col border border-white/20">
            <div className="bg-[#002b5c] p-6 text-center shrink-0 border-b-4 border-teal-500">
              <h3 className="text-white font-black text-xs uppercase tracking-[0.2em]">Gerenciar Professores Autorizados</h3>
              <p className="text-teal-400 text-[9px] font-bold mt-1 uppercase">Controle de Acesso à Plataforma</p>
            </div>

            <div className="p-8 flex-1 overflow-y-auto custom-scrollbar flex flex-col lg:flex-row gap-8">
              {/* Formulário lateral */}
              <div className="lg:w-1/3 space-y-6 shrink-0">
                <form onSubmit={handleAddProfessor} className="p-6 bg-gray-50 rounded-[32px] border border-gray-100 space-y-4">
                  <h4 className="text-[10px] font-black text-[#002b5c] uppercase text-center mb-2">Novo Professor</h4>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-2">E-mail</label>
                    <input
                      required
                      type="email"
                      value={newProfEmail}
                      onChange={e => setNewProfEmail(e.target.value)}
                      placeholder="exemplo@prof.educacao.sp.gov.br"
                      className="w-full h-11 px-4 bg-white border border-gray-200 rounded-2xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all text-black"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-2">Nome Completo</label>
                    <input
                      required
                      type="text"
                      value={newProfNome}
                      onChange={e => setNewProfNome(e.target.value)}
                      placeholder="NOME DO PROFESSOR"
                      className="w-full h-11 px-4 bg-white border border-gray-200 rounded-2xl text-[10px] font-bold outline-none focus:ring-2 focus:ring-teal-500 transition-all uppercase text-black"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isManagingProfs}
                    className="w-full py-4 bg-teal-500 text-white font-black text-[10px] uppercase rounded-2xl hover:bg-teal-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    {isManagingProfs ? 'Salvando...' : 'Adicionar Professor'}
                  </button>
                </form>

                <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl">
                  <p className="text-[8px] font-bold text-orange-700 uppercase leading-relaxed">
                    ⚠️ Somente professores cadastrados nesta lista poderão criar contas ou fazer login no portal.
                  </p>
                </div>
              </div>

              {/* Lista Principal */}
              <div className="flex-1 min-h-[400px] flex flex-col">
                <div className="flex justify-between items-center mb-4 px-2">
                  <p className="text-[10px] font-black text-gray-400 uppercase">{professorsList.length} Professores Cadastrados</p>
                </div>
                <div className="flex-1 bg-gray-50 rounded-[32px] border border-gray-100 overflow-hidden flex flex-col">
                  <div className="overflow-y-auto custom-scrollbar flex-1">
                    <table className="w-full text-left text-[10px]">
                      <thead className="bg-[#f8fafc] border-b text-black sticky top-0">
                        <tr>
                          <th className="p-4 font-black uppercase tracking-widest">Professor</th>
                          <th className="p-4 font-black uppercase tracking-widest text-center">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {professorsList.map(prof => (
                          <tr key={prof.email} className="hover:bg-blue-50/40 transition-all">
                            <td className="p-4">
                              <div className="flex flex-col">
                                <span className="font-black text-[#002b5c] uppercase">{prof.nome}</span>
                                <span className="text-[9px] font-bold text-gray-400 tracking-tight">{prof.email}</span>
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <button
                                onClick={() => handleRemoveProfessor(prof.email)}
                                className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm active:scale-90"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center shrink-0">
              <button
                onClick={() => setShowProfessorsModal(false)}
                className="px-12 py-4 bg-[#002b5c] text-white font-black text-[10px] uppercase rounded-full hover:shadow-xl transition-all active:scale-95"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast Dashboard ─────────────────────────────────────────────── */}
      {dgToast && (
        <div className={`fixed top-5 right-5 z-[9999] flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl max-w-sm transition-all animate-fade-in
          ${dgToast.type === 'success' ? 'bg-emerald-600 text-white' :
            dgToast.type === 'error'   ? 'bg-red-600 text-white' :
            dgToast.type === 'warning' ? 'bg-orange-500 text-white' :
                                         'bg-[#1e3a8a] text-white'}`}>
          <span className="text-lg leading-none">
            {dgToast.type === 'success' ? '✅' : dgToast.type === 'error' ? '❌' : dgToast.type === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide leading-snug">{dgToast.msg}</span>
          <button onClick={() => setDgToast(null)} className="ml-auto text-white/60 hover:text-white text-xs font-black">✕</button>
        </div>
      )}

      {/* ── Confirm Dashboard ────────────────────────────────────────────── */}
      {dgConfirm && (
        <div className="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 space-y-6">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <p className="text-center text-sm font-bold text-gray-800 uppercase tracking-wide">{dgConfirm.msg}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { dgConfirm.onOk(); setDgConfirm(null); }} className="flex-1 py-3 bg-red-600 text-white font-black text-[10px] uppercase rounded-xl hover:bg-red-700 transition-all">Confirmar</button>
              <button onClick={() => setDgConfirm(null)} className="flex-1 py-3 bg-gray-100 text-gray-600 font-black text-[10px] uppercase rounded-xl hover:bg-gray-200 transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
};

export default Dashboard;
