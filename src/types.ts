export interface Student {
  id?: string;
  nome: string;
  ra: string;
  turma: string;
}

export interface ClassRoom {
  id: string;
  name: string;
}

// Encaminhamento feito pelo professor (múltipla seleção)
export interface ProfessorReferral {
  type: 'orientacao_individual' | 'encaminhamento_gestao' | 'busca_ativa';
  description?: string; // apenas orientacao_individual usa descrição
}

export interface ManagementReferral {
  type: string;
  description: string;
}

export interface Incident {
  id: string;
  professorName?: string;
  classRoom?: string;
  studentName: string;
  ra?: string;
  date: string;
  time?: string;
  registerDate?: string;
  returnDate?: string;
  discipline?: string;
  irregularities?: string;
  description: string;
  severity: 'Baixa' | 'Média' | 'Alta' | 'Crítica';
  aiAnalysis?: string;
  status: 'Pendente' | 'Em Análise' | 'Resolvido' | 'Visualizada' | 'Em Andamento' | 'Resolvida';
  category?: string;
  source: 'professor' | 'gestao';
  pdfUrl?: string;
  authorEmail?: string;
  managementFeedback?: string;
  managementFeedbackAt?: string;      // quando a gestão salvou a devolutiva
  managementFeedbackReadAt?: string;  // quando o professor visualizou
  lastViewedAt?: string;
  isPendingSync?: boolean;
  escola?: string;

  // ── Encaminhamentos do Professor (múltiplos) ──────────────────────────
  professorReferrals?: ProfessorReferral[];

  // ── Legado (mantido para compatibilidade com registros antigos) ───────
  referralType?: 'orientacao_individual' | 'encaminhamento_gestao' | 'busca_ativa' | null;
  referralDescription?: string;

  // ── Encaminhamentos da Gestão ─────────────────────────────────────────
  managementReferrals?: ManagementReferral[];
}

export type View = 'login' | 'dashboard';

export interface User {
  email: string;
  role: 'gestor' | 'professor';
}
