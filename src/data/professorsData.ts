// Mapeamento de e-mails institucionais para nomes de professores
// EE FIORAVANTE IERVOLINO — uso exclusivo desta escola

export interface ProfessorData {
    email: string;
    nome: string;
}

/**
 * E-mails de gestão com perfil fixo que não necessitam de verificação no banco de dados.
 */
export const FIXED_GESTAO_EMAILS = [
    'gestao@escola.com',
    'vilera@prof.educacao.sp.gov.br',
    'vilera@professor.educacao.sp.gov.br',
    'marcia.coelho@educacao.sp.gov.br',
    'marcia.coelho@servidor.educacao.sp.gov.br',
    'patricia.alexandre1@educacao.sp.gov.br',
    'patricia.alexandre1@servidor.educacao.sp.gov.br',
    'sueli.silva9@educacao.sp.gov.br',
    'sueli.silva9@servidor.educacao.sp.gov.br',
    'patriciavilera@gmail.com',
];

/**
 * E-mails com acesso dual (gestor + professor)
 */
export const DUAL_ACCESS_EMAILS = [
    'vilera@prof.educacao.sp.gov.br',
    'vilera@professor.educacao.sp.gov.br',
    'marcia.coelho@educacao.sp.gov.br',
    'marcia.coelho@servidor.educacao.sp.gov.br',
    'patricia.alexandre1@educacao.sp.gov.br',
    'patricia.alexandre1@servidor.educacao.sp.gov.br',
    'sueli.silva9@educacao.sp.gov.br',
    'sueli.silva9@servidor.educacao.sp.gov.br',
    'patriciavilera@gmail.com',
];

export const PROFESSORS_DB: ProfessorData[] = [
    // ── Gestão Fioravante ─────────────────────────────────────────────────────
    { email: 'gestao@escola.com',                              nome: 'GESTÃO ESCOLAR' },
    { email: 'vilera@prof.educacao.sp.gov.br',                 nome: 'RAUL VILERA - GESTÃO' },
    { email: 'vilera@professor.educacao.sp.gov.br',            nome: 'RAUL VILERA - GESTÃO' },
    { email: 'marcia.coelho@educacao.sp.gov.br',               nome: 'MARCIA REGINA PEREIRA COELHO - GESTÃO' },
    { email: 'marcia.coelho@servidor.educacao.sp.gov.br',      nome: 'MARCIA REGINA PEREIRA COELHO - GESTÃO' },
    { email: 'patricia.alexandre1@educacao.sp.gov.br',         nome: 'PATRICIA DE OLIVEIRA ALEXANDRE VILERA - GESTÃO' },
    { email: 'patricia.alexandre1@servidor.educacao.sp.gov.br',nome: 'PATRICIA DE OLIVEIRA ALEXANDRE VILERA - GESTÃO' },
    { email: 'sueli.silva9@educacao.sp.gov.br',                nome: 'SUELI CORREIA DA SILVA - GESTÃO' },
    { email: 'patriciavilera@gmail.com',                        nome: 'PATRICIA VILERA - GESTÃO' },
    { email: 'sueli.silva9@servidor.educacao.sp.gov.br',       nome: 'SUELI CORREIA DA SILVA - GESTÃO' },

    // ── Professores Fioravante ────────────────────────────────────────────────
    { email: 'alexandreos@prof.educacao.sp.gov.br',            nome: 'ALEXANDRE OLIVEIRA DOS SANTOS' },
    { email: 'anapolito@prof.educacao.sp.gov.br',              nome: 'ANA CAROLINA POLITO PINHEIRO' },
    { email: 'anasantos51@prof.educacao.sp.gov.br',            nome: 'ANA PAULA DE SANTANA SANTOS' },
    { email: 'anielisilva@prof.educacao.sp.gov.br',            nome: 'ANIELI SOFIA RODRIGUES DA SILVA' },
    { email: 'brunanicole@prof.educacao.sp.gov.br',            nome: 'BRUNA NICOLE FERREIRA SANTOS' },
    { email: 'camilacostamonteiro@prof.educacao.sp.gov.br',    nome: 'CAMILA COSTA MONTEIRO ROSSI' },
    { email: 'carolinamduarte@prof.educacao.sp.gov.br',        nome: 'CAROLINA MARIA DUARTE' },
    { email: 'cintiabernadete@prof.educacao.sp.gov.br',        nome: 'CINTIA BERNADETE FERRAZ MATAVELLI' },
    { email: 'clarinetesilva@prof.educacao.sp.gov.br',         nome: 'CLARINETE HELENA ALVES DA SILVA' },
    { email: 'denisesalvatierra@prof.educacao.sp.gov.br',      nome: 'DENISE SALVATIERRA ROMAO' },
    { email: 'edvaniabarros@prof.educacao.sp.gov.br',          nome: 'EDVANIA BEZERRA BARROS' },
    { email: 'ellenmeire@prof.educacao.sp.gov.br',             nome: 'ELLEN MEIRE MARIANO DE SOUSA' },
    { email: 'giselesalviato@prof.educacao.sp.gov.br',         nome: 'GISELE SALVIATO CARNEIRO SINCIC' },
    { email: 'gcabrera@prof.educacao.sp.gov.br',               nome: 'GISLENE CABRERA' },
    { email: 'iaravlima@prof.educacao.sp.gov.br',              nome: 'IARA VIEIRA LIMA' },
    { email: 'itamaras@prof.educacao.sp.gov.br',               nome: 'ITAMARA SANTANA DE OLIVEIRA' },
    { email: 'janeteg@prof.educacao.sp.gov.br',                nome: 'JANETE GALDINO DOS SANTOS SOUZA' },
    { email: 'jocelma@prof.educacao.sp.gov.br',                nome: 'JOCELMA FERREIRA DOS SANTOS' },
    { email: 'joycemarilia@prof.educacao.sp.gov.br',           nome: 'JOYCE MARILIA DA SILVA DIAS' },
    { email: 'julio.amorim@educacao.sp.gov.br',                nome: 'JULIO CESAR DE SOUSA AMORIM' },
    { email: 'kelly.alves1@educacao.sp.gov.br',                nome: 'KELLY MOURA BEZERRA ALVES' },
    { email: 'lainechagas@prof.educacao.sp.gov.br',            nome: 'LAINE SÁ DE SOUZA CHAGAS' },
    { email: 'luciane.proenca@educacao.sp.gov.br',             nome: 'LUCIANE MARIA DA SILVA PROENCA' },
    { email: 'luizvieiragomes@prof.educacao.sp.gov.br',        nome: 'LUIZ VIEIRA GOMES' },
    { email: 'marciasaturnino@prof.educacao.sp.gov.br',        nome: 'MARCIA BETIZ SATURNINO' },
    { email: 'marciacoelho@prof.educacao.sp.gov.br',           nome: 'MARCIA REGINA PEREIRA COELHO' },
    { email: 'marciagomez@prof.educacao.sp.gov.br',            nome: 'MARCIA RITA GOMEZ MALERBA' },
    { email: 'isagomes@prof.educacao.sp.gov.br',               nome: 'MARIA ISABEL GOMES SANTANA FERNANDES' },
    { email: 'marianaventura@prof.educacao.sp.gov.br',         nome: 'MARIANA CAROLINA BOA VENTURA' },
    { email: 'marineide.sacramento@educacao.sp.gov.br',        nome: 'MARINEIDE DE OLIVEIRA MENDES SACRAMENTO' },
    { email: 'marineide.sacramento@servidor.educacao.sp.gov.br', nome: 'MARINEIDE DE OLIVEIRA MENDES SACRAMENTO' },
    { email: 'patricia.alexandre1@educacao.sp.gov.br',         nome: 'PATRICIA DE OLIVEIRA ALEXANDRE VILERA' },
    { email: 'rosirenel@prof.educacao.sp.gov.br',              nome: 'ROSIRENE LEME BERALDI GOTTARDI' },
    { email: 'silmara.lima01@educacao.sp.gov.br',              nome: 'SILMARA APARECIDA DE LIMA' },
    { email: 'sueli.silva9@educacao.sp.gov.br',                nome: 'SUELI CORREIA DA SILVA' },
    { email: 'vagner.gallego@educacao.sp.gov.br',              nome: 'VAGNER DA SILVA GALLEGO' },
    { email: 'vanessacatiane@prof.educacao.sp.gov.br',         nome: 'VANESSA CATIANE DA SILVA PORTO' },
    { email: 'vanessardantas@prof.educacao.sp.gov.br',         nome: 'VANESSA RODRIGUES DANTAS' },
];

/**
 * Normaliza o e-mail institucional para o formato base para comparação
 */
const normalizeInstitutionalEmail = (email: string): string => {
    const [user, domain] = email.toLowerCase().trim().split('@');
    const institutionalDomains = [
        'prof.educacao.sp.gov.br',
        'professor.educacao.sp.gov.br',
        'servidor.educacao.sp.gov.br',
        'educacao.sp.gov.br',
    ];
    if (institutionalDomains.includes(domain)) {
        return `${user}@prof.educacao.sp.gov.br`;
    }
    return email.toLowerCase().trim();
};

export const normalizeEmail = (email: string): string => normalizeInstitutionalEmail(email);

/**
 * Verifica se o e-mail está registrado no sistema Fioravante
 */
export const isProfessorRegistered = (email: string): boolean => {
    const normalizedTarget = normalizeInstitutionalEmail(email);
    return PROFESSORS_DB.some(p => normalizeInstitutionalEmail(p.email) === normalizedTarget);
};

/**
 * Verifica se o e-mail é de gestão
 */
export const isGestaoEmail = (email: string): boolean => {
    return FIXED_GESTAO_EMAILS.includes(email.toLowerCase().trim());
};

/**
 * Verifica se é e-mail institucional válido
 */
export const isInstitutionalEmail = (email: string): boolean => {
    const lower = email.toLowerCase().trim();
    return lower.endsWith('@prof.educacao.sp.gov.br') ||
        lower.endsWith('@professor.educacao.sp.gov.br') ||
        lower.endsWith('@servidor.educacao.sp.gov.br') ||
        lower.endsWith('@educacao.sp.gov.br');
};

/**
 * Retorna o role do e-mail a partir da lista local Fioravante.
 * Compatível com o padrão usado no App.tsx.
 */
export const getRoleFromLocalDB = (email: string): 'gestor' | 'professor' | null => {
    const lower = email.toLowerCase().trim();
    if (FIXED_GESTAO_EMAILS.includes(lower)) return 'gestor';
    const normalizedTarget = normalizeInstitutionalEmail(lower);
    const found = PROFESSORS_DB.find(p => normalizeInstitutionalEmail(p.email) === normalizedTarget);
    if (found) return 'professor';
    // Email institucional válido mas não cadastrado localmente → assume professor
    if (isInstitutionalEmail(lower)) return 'professor';
    return null;
};
export const getProfessorNameFromEmail = (email: string): string => {
    const normalizedTarget = normalizeInstitutionalEmail(email);
    const professor = PROFESSORS_DB.find(p => normalizeInstitutionalEmail(p.email) === normalizedTarget);
    if (professor) return professor.nome;
    const emailUsername = email.split('@')[0];
    const nameParts = emailUsername.split(/[._-]/);
    return nameParts.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ').toUpperCase();
};
