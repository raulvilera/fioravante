// ============================================================
// GOOGLE APPS SCRIPT — EE FIORAVANTE IERVOLINO
// Planilha formato:
// Linha 1: nome da turma (cols A, E, I... a cada 4 colunas)
// Linha 2: vazia
// Linha 3: cabeçalho (Nº chamada | Nome | RA | vazia)
// Linha 4+: dados dos alunos
// ============================================================

const SPREADSHEET_ID = '1I2e7NexDqkZZ6Pc6fEQ6QTJCdY2xGgo_SicORFv4zGI';

function doGet(e) {
  const params = e ? e.parameter : {};
  const sheetName = params.sheetName || '';

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (sheetName === 'BANCODEDADOSGERAL') {
      const sheet = ss.getSheetByName('BANCODEDADOSGERAL');
      if (!sheet) return jsonError('Aba BANCODEDADOSGERAL não encontrada');

      const data = sheet.getDataRange().getValues();
      const students = [];
      const turmasAceitas = new Set();

      // Linha 0 (row 1): nomes das turmas a cada 4 colunas
      // Linha 2 (row 3): cabeçalho
      // Linha 3+ (row 4+): dados
      const turmaRow  = data[0];
      const totalCols = turmaRow.length;

      for (let col = 0; col < totalCols; col += 4) {
        const turmaNome = turmaRow[col] ? String(turmaRow[col]).trim() : '';
        if (!turmaNome) continue;

        // Dados a partir do índice 3 (linha 4 da planilha)
        for (let row = 3; row < data.length; row++) {
          // col+0 = Nº chamada, col+1 = Nome, col+2 = RA
          const nome = data[row][col + 1] ? String(data[row][col + 1]).trim() : '';
          const ra   = data[row][col + 2] ? String(data[row][col + 2]).trim() : '';

          if (!nome || nome.toUpperCase() === 'NOME DO ALUNO') continue;
          if (!ra   || ra.toUpperCase()   === 'RA')            continue;

          students.push({ nome: nome.toUpperCase(), ra, turma: turmaNome });
          turmasAceitas.add(turmaNome);
        }
      }

      return jsonSuccess({
        students,
        debug: { turmasAceitas: Array.from(turmasAceitas), total: students.length }
      });
    }

    // ── Aba OCORRENCIASDOSPROFESSORES ─────────────────────────
    if (sheetName === 'OCORRENCIASDOSPROFESSORES') {
      const sheet = ss.getSheetByName('OCORRENCIASDOSPROFESSORES');
      if (!sheet) return jsonError('Aba não encontrada');
      const data = sheet.getDataRange().getValues();
      const rows = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0]) continue;
        rows.push({
          date: String(row[0]||''), professor_name: String(row[1]||''),
          class_room: String(row[2]||''), student_name: String(row[3]||''),
          ra: String(row[4]||''), discipline: String(row[5]||''),
          irregularities: String(row[6]||''), description: String(row[7]||''),
          referral: String(row[8]||''), time: String(row[9]||''),
          pdf_url: String(row[10]||''),
        });
      }
      return jsonSuccess({ rows });
    }

    // ── Aba BANCODEALUNOS ─────────────────────────────────────
    if (sheetName === 'BANCODEALUNOS') {
      const sheet = ss.getSheetByName('BANCODEALUNOS');
      if (!sheet) return jsonError('Aba não encontrada');
      const data = sheet.getDataRange().getValues();
      const rows = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row[0]) continue;
        rows.push({
          date: String(row[0]||''), student_name: String(row[1]||''),
          class_room: String(row[2]||''), professor_name: String(row[3]||''),
          ra: String(row[4]||''), category: String(row[5]||''),
          description: String(row[6]||''), referral: String(row[7]||''),
          register_date: String(row[8]||''), return_date: String(row[9]||''),
          pdf_url: String(row[10]||''),
        });
      }
      return jsonSuccess({ rows });
    }

    return jsonError('sheetName inválido: ' + sheetName);

  } catch (err) {
    return jsonError('Erro interno: ' + err.toString());
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const { spreadsheetId, sheetName, values } = payload;
    const ss = SpreadsheetApp.openById(spreadsheetId || SPREADSHEET_ID);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return jsonError('Aba não encontrada: ' + sheetName);
    sheet.appendRow(values);
    return jsonSuccess({ message: 'Linha inserida com sucesso' });
  } catch (err) {
    return jsonError('Erro no POST: ' + err.toString());
  }
}

function jsonSuccess(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, ...data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonError(message) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
