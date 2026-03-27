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
import type { Incident, User, Student, ManagementReferral } from '../types';
import { generateIncidentPDF } from '../services/pdfService';
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
  const [returnDate, setReturnDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('Todos');

  const regDateRef = useRef<HTMLInputElement>(null!);
  const retDateRef = useRef<HTMLInputElement>(null!);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Incident | null>(null);
  const [newStatus, setNewStatus] = useState<Incident['status']>('Pendente');
  const [feedback, setFeedback] = useState('');

  // ── Estados dos Encaminhamentos da Gestão ───────────────────────────────
  // Cada item da lista pode ser marcado e ter uma descrição associada
  const LISTA_ENCAMINHAMENTOS_GESTAO: { label: string; popUp: boolean; grupo?: string }[] = [
    { label: 'Orientação individual com o estudante',                           popUp: true },
    { label: 'Mediação de conflito realizada pela equipe gestora/POC',          popUp: true },
    { label: 'Necessidade de acompanhamento e diálogo em casa sobre o ocorrido',popUp: true },
    { label: 'Convocação dos responsáveis para uma reunião presencial',         popUp: true },
    { label: 'Recorrência / medidas educativas',                                popUp: true },
    { label: 'Orientação ao professor',                                         popUp: true },
    { label: 'Encaminhamento à Rede Protetiva',                                 popUp: true },
    { label: 'Busca ativa',                                                     popUp: true },
    { label: 'Outros',                                                          popUp: true },
    // ── Ocorrências especiais ────────────────────────────────────────────────
    { label: 'Incidente',  popUp: true, grupo: 'especial' },
    { label: 'Acidente',   popUp: true, grupo: 'especial' },
    { label: 'Agressão',   popUp: true, grupo: 'especial' },
  ];
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
            lastViewedAt: i.last_viewed_at
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
      return;
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
      returnDate: classification === 'MEDIDA EDUCATIVA' && returnDate ? returnDate.split('-').reverse().join('/') : undefined,
      discipline: 'N/A',
      irregularities: '',
      description: description.toUpperCase(),
      severity: 'Média',
      status: 'Pendente',
      category: classification,
      source: 'gestao',
      authorEmail: user.email,
      escola: 'fioravante',
    };

    onSave(newInc);
    setStudentName('');
    setDescription('');
    setReturnDate('');
    setIsSaving(false);
  };

  const openUpdateModal = (inc: Incident) => {
    setIsUpdatingStatus(inc);
    setNewStatus(inc.status);
    setFeedback(inc.managementFeedback || '');
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

    const updated: Incident = {
      ...isUpdatingStatus,
      status: newStatus,
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

  const pedagogicalGuide = {
    'OCORRÊNCIA DISCIPLINAR': [
      'Advertência verbal ou escrita',
      'Convocação dos pais ou responsáveis para mediação',
      'Encaminhamento para o Conselho de Escola',
      'Suspensão temporária (casos graves)'
    ],
    'OCORRÊNCIA PEDAGÓGICA': [
      'Reforço escolar ou recuperação paralela',
      'Acompanhamento psicopedagógico',
      'Adaptação de atividades curriculares',
      'Criação de plano de estudo individualizado'
    ],
    'MEDIDA EDUCATIVA': [
      'Monitoria voluntária por período determinado',
      'Escrita de reflexão crítica sobre o ocorrido',
      'Serviço de apoio à organização da biblioteca/escola',
      'Apresentação de trabalho sobre cidadania'
    ]
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
                        onChange={e => setClassification(e.target.value)}
                        className="h-12 sm:h-14 border border-gray-200 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm cursor-pointer w-full"
                      >
                        <option value="">Selecione...</option>
                        <option value="OCORRÊNCIA DISCIPLINAR">OCORRÊNCIA DISCIPLINAR</option>
                        <option value="OCORRÊNCIA PEDAGÓGICA">OCORRÊNCIA PEDAGÓGICA</option>
                        <option value="MEDIDA EDUCATIVA">MEDIDA EDUCATIVA</option>
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

                    {classification === 'MEDIDA EDUCATIVA' && (
                      <div className="flex flex-col gap-2 cursor-pointer animate-fade-in" onClick={() => triggerPicker(retDateRef)}>
                        <label className="text-[10px] font-black text-white uppercase tracking-widest ml-1 cursor-pointer">DATA DE RETORNO (PÓS-MEDIDA)</label>
                        <input
                          ref={retDateRef}
                          type="date"
                          value={returnDate}
                          onChange={e => setReturnDate(e.target.value)}
                          className="h-12 sm:h-14 border border-orange-300 rounded-2xl px-5 text-xs font-bold !text-black bg-white focus:ring-2 focus:ring-orange-500 outline-none shadow-sm cursor-pointer w-full"
                        />
                      </div>
                    )}
                  </div>

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
                        <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase ${inc.category === 'MEDIDA EDUCATIVA' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{inc.category}</span>
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
                          <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${inc.category === 'MEDIDA EDUCATIVA' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{inc.category}</span>
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
                <h2 className="text-white font-black text-sm uppercase tracking-widest">📚 Guia Estratégico de Medidas Pedagógicas</h2>
                <p className="text-teal-400 text-[10px] font-bold mt-2 uppercase">Ações sugeridas conforme o Regimento Escolar e tipo de ocorrência</p>
              </div>
              <div className="p-10 grid grid-cols-1 md:grid-cols-3 gap-10">
                {Object.entries(pedagogicalGuide).map(([type, measures]) => (
                  <div key={type} className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${type.includes('DISCIPLINAR') ? 'bg-red-500' : type.includes('PEDAGÓGICA') ? 'bg-blue-500' : 'bg-teal-500'} animate-pulse`}></div>
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
                * Estas medidas são sugestões e devem ser validadas pela coordenação de acordo com a gravidade e reincidência do caso.
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

              {/* ── ENCAMINHAMENTOS DA GESTÃO ───────────────────────────── */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-2">
                  Encaminhamentos da Gestão
                </label>
                <p className="text-[9px] text-gray-400 ml-2 -mt-2">Clique em cada encaminhamento para descrever a intervenção realizada</p>

                <div className="flex flex-col gap-2">
                  {LISTA_ENCAMINHAMENTOS_GESTAO.map(({ label: tipo, popUp, grupo }, idx, arr) => {
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
                      <button
                        onClick={() => setSelectedStudentForHistory(null)}
                        className="text-[9px] font-black text-orange-600 uppercase hover:underline"
                      >
                        Trocar Aluno
                      </button>
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
