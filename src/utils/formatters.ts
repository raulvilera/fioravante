/**
 * Normaliza o nome da turma vindo de diferentes fontes (Supabase, Sheets, Local)
 * Para EE Fioravante Iervolino.
 *
 * Formatos aceitos na entrada → saída canônica:
 *   "1ºAno A"  → "1ºAno A"
 *   "1º Ano A" → "1ºAno A"
 *   "1 Ano A"  → "1ºAno A"
 *   "1ºA"      → "1ºAno A"   (formato legado)
 *   "1A"       → "1ºAno A"   (formato legado compacto)
 *   "AEE D TARDE TEA" → "AEE D TARDE TEA"
 */
export const normalizeClassName = (raw: string): string => {
    if (!raw || raw === '---') return '---';

    let s = raw.trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\(DESCONSIDER.*\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    // Turmas AEE — preservar como estão (ex: "AEE D TARDE TEA")
    if (/^AEE/i.test(s)) {
        return s.toUpperCase().trim();
    }

    // Formato novo: "1ºAno A", "1º Ano A", "1 Ano A", "1ANO A"
    const matchNovo = s.match(/^(\d+)\s*[oOaAºª°]?\s*ANO\s*([A-E])$/i);
    if (matchNovo) {
        return `${matchNovo[1]}ºAno ${matchNovo[2].toUpperCase()}`;
    }

    // Formato legado compacto: "1ºA", "1º A", "1A", "1 A"
    // Converte para o formato novo canônico
    const matchLegado = s.match(/^(\d+)\s*[oOaAºª°]?\s*([A-E])$/);
    if (matchLegado) {
        return `${matchLegado[1]}ºAno ${matchLegado[2].toUpperCase()}`;
    }

    return raw.trim();
};
