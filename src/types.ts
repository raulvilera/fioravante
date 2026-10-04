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

// ── Resolução SEDUC nº 68/2026 ─────────────────────────────────────────────
export type NivelResolucao68 = 'I' | 'II' | 'III';

export type HipoteseAfastamento = 'risco_outros' | 'risco_proprio' | 'recorrencia_grave';

// Afastamento preventivo temporário (Arts. 11 e 12)
export interface AfastamentoPreventivo {
  hipotese: HipoteseAfastamento;
  motivacao: string;          // motivação expressa (Art. 28, I)
  inicio: string;             // AAAA-MM-DD
  diasLetivos: number;        // prazo inicial máx. 5 dias letivos (Art. 11, §5º)
  comunicacaoFamilia: boolean;
  comunicacaoURE: boolean;
  comunicacaoRede: boolean;
  planoEstudos: string;       // continuidade pedagógica (Art. 11, §3º)
  prorrogacao?: {             // Art. 11, §§6º e 7º
    dataConselho: string;
    diasLetivos: number;
    fundamentacao: string;
    familiaComunicada: boolean;
  };
  retornoEm?: string;         // retorno às atividades presenciais (Art. 11, §8º)
}

export interface Resolucao68Data {
  nivel?: NivelResolucao68;              // gradação (Art. 5º)
  dataCiencia?: string;                  // data em que a escola tomou conhecimento (Art. 9º, §3º)
  conviva?: { registrado: boolean; protocolo?: string }; // Plataforma Conviva (Art. 9º)
  manifestacaoEstudante?: string;        // oportunidade de manifestação (Art. 3º, V)
  familiaComunicadaEm?: string;          // articulação com a família (Art. 7º, IV)
  afastamento?: AfastamentoPreventivo;
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

  // ── Resolução SEDUC nº 68/2026 ────────────────────────────────────────
  resolucao68?: Resolucao68Data;
}

export type View = 'login' | 'dashboard';

export interface User {
  email: string;
  role: 'gestor' | 'professor';
}
