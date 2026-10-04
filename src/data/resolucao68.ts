import type { Incident, NivelResolucao68, HipoteseAfastamento, AfastamentoPreventivo } from '../types';

/**
 * Parâmetros da Resolução SEDUC nº 68, de 19/06/2026 — tratamento pedagógico
 * da indisciplina, afastamento preventivo temporário e transferência cautelar.
 */

export const CATEGORIA_ESTUDO_DIRIGIDO = 'ENCAMINHAMENTO PEDAGÓGICO (ESTUDO DIRIGIDO)';
export const CATEGORIA_AFASTAMENTO = 'AFASTAMENTO PREVENTIVO TEMPORÁRIO';
// Categoria antiga (registros anteriores à resolução): mantida só para exibição
export const CATEGORIA_LEGADO_MEDIDA = 'MEDIDA EDUCATIVA';

export const CATEGORIAS_GESTAO = [
  'OCORRÊNCIA DISCIPLINAR',
  'OCORRÊNCIA PEDAGÓGICA',
  CATEGORIA_ESTUDO_DIRIGIDO,
  CATEGORIA_AFASTAMENTO,
];

export const isCategoriaRestritiva = (cat?: string) =>
  cat === CATEGORIA_AFASTAMENTO || cat === CATEGORIA_LEGADO_MEDIDA;

// ── Gradação das respostas institucionais (Art. 5º) ──────────────────────────
export const NIVEIS: Record<NivelResolucao68, { titulo: string; descricao: string }> = {
  I: {
    titulo: 'Nível I — Situação ordinária',
    descricao: 'Indisciplina ou conflito cotidiano: intervenções pedagógicas e fluxos do Protocolo 179.',
  },
  II: {
    titulo: 'Nível II — Recorrente ou complexa, sem risco imediato',
    descricao: 'Intensificar acompanhamento, articular com a família, repactuar combinados, plano individual, mediação e, se necessário, estudo dirigido.',
  },
  III: {
    titulo: 'Nível III — Risco, grave ruptura ou esgotamento',
    descricao: 'Avaliar afastamento preventivo temporário e, excepcionalmente, transferência cautelar (Caps. IV e V).',
  },
};

// ── Intervenções pedagógicas (Art. 7º) usadas como encaminhamentos da gestão ─
// Os rótulos antigos foram mantidos para não quebrar registros existentes.
export const ENC_REDE_PROTETIVA = 'Encaminhamento à Rede Protetiva';
export const ENC_ESTUDO_DIRIGIDO = 'Encaminhamento pedagógico (estudo dirigido)';

export const LISTA_INTERVENCOES: { label: string; pdf: string; artigo: string; grupo?: 'especial' }[] = [
  { label: 'Acolhimento e escuta dos envolvidos',                                pdf: 'Acolhimento e escuta',                artigo: 'Art. 7º, I' },
  { label: 'Orientação individual com o estudante',                             pdf: 'Orientação individual / combinados',  artigo: 'Art. 7º, II' },
  { label: 'Repactuação de compromisso / plano individual de acompanhamento',   pdf: 'Plano individual de acompanhamento',  artigo: 'Art. 7º, III' },
  { label: 'Convocação dos responsáveis para uma reunião presencial',           pdf: 'Reunião com os responsáveis',         artigo: 'Art. 7º, IV' },
  { label: 'Necessidade de acompanhamento e diálogo em casa sobre o ocorrido',  pdf: 'Diálogo em casa sobre o ocorrido',    artigo: 'Art. 7º, IV' },
  { label: 'Acompanhamento por adulto de referência',                           pdf: 'Adulto de referência',                artigo: 'Art. 7º, V' },
  { label: 'Mediação de conflito realizada pela equipe gestora/POC',            pdf: 'Mediação de conflito',                artigo: 'Art. 7º, VI' },
  { label: 'Práticas restaurativas (adesão voluntária)',                        pdf: 'Práticas restaurativas',              artigo: 'Art. 7º, VI' },
  { label: 'Ações de reparação e recomposição das relações',                    pdf: 'Reparação / recomposição',            artigo: 'Art. 7º, VII' },
  { label: ENC_REDE_PROTETIVA,                                                  pdf: 'Rede Protetiva',                      artigo: 'Art. 7º, VIII' },
  { label: ENC_ESTUDO_DIRIGIDO,                                                 pdf: 'Estudo dirigido',                     artigo: 'Art. 7º, IX' },
  { label: 'Orientação ao professor',                                           pdf: 'Orientação ao professor',             artigo: 'Art. 7º, X' },
  { label: 'Busca ativa',                                                       pdf: 'Busca ativa',                         artigo: 'Art. 7º, X' },
  { label: 'Outros',                                                            pdf: 'Outros',                              artigo: 'Art. 7º, X' },
  { label: 'Incidente',  pdf: 'Incidente', artigo: '', grupo: 'especial' },
  { label: 'Acidente',   pdf: 'Acidente',  artigo: '', grupo: 'especial' },
  { label: 'Agressão',   pdf: 'Agressão',  artigo: '', grupo: 'especial' },
];

// ── Hipóteses do afastamento preventivo temporário (Art. 11, §1º) ────────────
export const HIPOTESES_AFASTAMENTO: Record<HipoteseAfastamento, string> = {
  risco_outros: 'Permanência imediata representa risco concreto à integridade de outros membros da comunidade escolar (Art. 11, §1º, I)',
  risco_proprio: 'Estudante em risco no ambiente escolar — retaliações, ameaças, intimidações ou vulnerabilidade (Art. 11, §1º, II)',
  recorrencia_grave: 'Recorrência grave com esgotamento ou insuficiência das estratégias anteriores (Art. 11, §1º, III)',
};

export const MAX_DIAS_AFASTAMENTO = 5;

// ── Datas ────────────────────────────────────────────────────────────────────
const parseISO = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const formatBR = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');

const isDiaLetivo = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

/** Último dia letivo de um período de `dias` dias letivos começando em `inicio` (sábados e domingos não contam). */
export const ultimoDiaLetivo = (inicio: string, dias: number): string => {
  const d = parseISO(inicio);
  while (!isDiaLetivo(d)) d.setDate(d.getDate() + 1);
  let contados = 1;
  while (contados < dias) {
    d.setDate(d.getDate() + 1);
    if (isDiaLetivo(d)) contados++;
  }
  return toISO(d);
};

/** Próximo dia letivo após `iso`. */
export const proximoDiaLetivo = (iso: string): string => {
  const d = parseISO(iso);
  do { d.setDate(d.getDate() + 1); } while (!isDiaLetivo(d));
  return toISO(d);
};

export interface SituacaoAfastamento {
  fim: string;            // último dia letivo do afastamento (com prorrogação, se houver)
  retornoPrevisto: string;
  encerrado: boolean;
  vencido: boolean;       // prazo terminou e não houve registro de retorno
}

export const situacaoAfastamento = (a: AfastamentoPreventivo, hojeISO = toISO(new Date())): SituacaoAfastamento => {
  const total = a.diasLetivos + (a.prorrogacao?.diasLetivos || 0);
  const fim = ultimoDiaLetivo(a.inicio, Math.max(1, total));
  const encerrado = !!a.retornoEm;
  return { fim, retornoPrevisto: proximoDiaLetivo(fim), encerrado, vencido: !encerrado && hojeISO > fim };
};

/** Data do registro em AAAA-MM-DD a partir do formato DD/MM/AAAA usado nos registros. */
export const incidentISODate = (inc: Incident): string => {
  const raw = inc.registerDate || inc.date || '';
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : raw;
};

export const hasIntervencao = (inc: Incident, label: string) =>
  (inc.managementReferrals || []).some(r => r.type === label);
