import { jsPDF } from "jspdf";
import type { Incident } from "../types";
import { supabase, isSupabaseConfigured } from "./supabaseClient";

// ── Brasão do Estado de São Paulo (Supabase Storage) ─────────────────────────
const LOGO_URL =
  "https://zvuxzrfbmmbhuhwaofrn.supabase.co/storage/v1/object/public/incident-pdfs/assets/brasao-sp.png";

const loadImage = (url: string): Promise<{ data: string; w: number; h: number }> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      c.getContext("2d")!.drawImage(img, 0, 0);
      res({ data: c.toDataURL("image/png"), w: img.width, h: img.height });
    };
    img.onerror = () => rej(new Error("Erro ao carregar imagem"));
    img.src = url;
  });

// ─────────────────────────────────────────────────────────────────────────────
// buildPDF — gera o comunicado em UMA ÚNICA PÁGINA A4
// Adapta espaçamentos automaticamente para caber tudo na página
// ─────────────────────────────────────────────────────────────────────────────
const buildPDF = async (inc: Incident): Promise<jsPDF> => {
  const doc  = new jsPDF({ unit: "mm", format: "a4" });
  const PW   = doc.internal.pageSize.getWidth();   // 210
  const PH   = doc.internal.pageSize.getHeight();  // 297
  const ML   = 18;
  const MR   = 18;
  const CW   = PW - ML - MR;  // 174mm
  const LH   = 4.8;

  // ── Borda externa ─────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(8, 8, PW - 16, PH - 16);

  // ── Logo ──────────────────────────────────────────────────────────────
  let logoH = 26;
  try {
    const logo = await loadImage(LOGO_URL);
    const logoW = 26;
    logoH = (logo.h / logo.w) * logoW;
    doc.addImage(logo.data, "PNG", 12, 11, logoW, logoH);
  } catch (_) {}

  // ── Cabeçalho ─────────────────────────────────────────────────────────
  const TX = PW / 2 + 7;
  let y = 13;
  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("GOVERNO DO ESTADO DE SÃO PAULO",              TX, y, { align: "center" }); y += 3.8;
  doc.text("SECRETARIA DE ESTADO DA EDUCAÇÃO",            TX, y, { align: "center" }); y += 3.8;
  doc.text("UNIDADE REGIONAL DE ENSINO GUARULHOS NORTE",  TX, y, { align: "center" }); y += 3.8;
  doc.text("E.E. FIORAVANTE IERVOLINO – UA: 46.293 – CIE 037515", TX, y, { align: "center" }); y += 3.8;
  doc.setFontSize(7.8);
  doc.text("Rua: Joracy de Camargo, 98 – Jd. Paraventi – Guarulhos – CEP. 07121-280", TX, y, { align: "center" }); y += 3.5;
  doc.text("Telefone: 2408-7297 e 2408-3658", TX, y, { align: "center" });

  const sepY = Math.max(11 + logoH + 3, y + 5);
  doc.setLineWidth(0.3);
  doc.line(ML, sepY, PW - MR, sepY);

  // ── Título ────────────────────────────────────────────────────────────
  y = sepY + 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.text("Comunicado de Acompanhamento Pedagógico e Disciplinar", ML, y);

  // ── Texto de abertura ─────────────────────────────────────────────────
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Prezados responsáveis,", ML, y);

  y += 6;
  const intro =
    "Visando o desenvolvimento integral do(a) aluno(a)  acima citado  e a manutenção de um " +
    "ambiente de aprendizagem saudável, informamos que hoje houve a necessidade de uma " +
    "intervenção junto ao(à) aluno(a) devido ao seguinte registro:";
  const sIntro = doc.splitTextToSize(intro, CW);
  doc.text(sIntro, ML, y);
  y += sIntro.length * LH + 3;

  // ── Identificação ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Aluno(a): ", ML, y);
  doc.setFont("helvetica", "normal");
  doc.text(
    `${inc.studentName.toUpperCase()}    Turma: ${inc.classRoom || ""}    RA: ${inc.ra || "---"}`,
    ML + 16, y
  );

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Professor(a): ", ML, y);
  doc.setFont("helvetica", "normal");
  const profTxt = `${inc.professorName || "---"}    Data: ${inc.date}` +
    (inc.discipline && inc.discipline !== "N/A" ? `    Disciplina: ${inc.discipline}` : "");
  doc.text(profTxt, ML + 22, y);

  if (inc.irregularities && inc.irregularities !== "NENHUMA") {
    y += 5;
    doc.setFont("helvetica", "bold");
    doc.text("Irregularidades: ", ML, y);
    doc.setFont("helvetica", "normal");
    doc.text(inc.irregularities, ML + 26, y);
  }

  // ── Rótulo da caixa ───────────────────────────────────────────────────
  y += 7;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
  doc.text("Relato do(a) Professor(a) / Encaminhamento:", ML, y);
  y += 2;

  // ── Preparar conteúdo da caixa ────────────────────────────────────────
  const descTxt = (inc.description || "").toUpperCase();
  const sDesc   = doc.splitTextToSize(descTxt, CW - 6);

  const profRefs = inc.professorReferrals || [];
  const orientacaoRef = profRefs.find(r => r.type === "orientacao_individual")
    || (inc.referralType === "orientacao_individual"
        ? { type: "orientacao_individual", description: inc.referralDescription || "" }
        : null);
  const orientacaoDesc = orientacaoRef?.description || "";
  const sOrientacao = orientacaoDesc
    ? doc.splitTextToSize(orientacaoDesc.toUpperCase(), CW - 6)
    : [];

  const encItems: Array<{ bold: boolean; text: string }> = [];
  const profRefsWithoutOrientacao = profRefs.filter(r => r.type !== "orientacao_individual");
  if (profRefsWithoutOrientacao.length > 0) {
    encItems.push({ bold: true, text: "Encaminhamentos (Professor):" });
    for (const ref of profRefsWithoutOrientacao) {
      const lbl =
        ref.type === "encaminhamento_gestao" ? "Encaminhamento para a Equipe Gestora" :
        ref.type === "busca_ativa"           ? "Busca Ativa" :
        ref.type === "incidente"             ? "Incidente" :
        ref.type === "acidente"              ? "Acidente" :
        ref.type === "agressao"              ? "Agressão" :
        ref.type;
      encItems.push({ bold: false, text: lbl });
      if (ref.description) {
        const sRef = doc.splitTextToSize(ref.description.toUpperCase(), CW - 12);
        sRef.forEach((line: string) => encItems.push({ bold: false, text: `  ${line}` }));
      }
    }
  } else if (inc.referralType && inc.referralType !== "orientacao_individual") {
    const lblMap: Record<string, string> = {
      encaminhamento_gestao: "Encaminhamento para a Equipe Gestora",
      busca_ativa:           "Busca Ativa",
    };
    encItems.push({ bold: true,  text: "Encaminhamentos (Professor):" });
    encItems.push({ bold: false, text: lblMap[inc.referralType] || inc.referralType });
  }

  const gestaoItems: Array<{ bold: boolean; text: string }> = [];
  const hasMgmtContent =
    (inc.managementReferrals && inc.managementReferrals.length > 0) ||
    !!inc.managementFeedback;

  if (hasMgmtContent) {
    gestaoItems.push({ bold: true, text: "Encaminhamentos (Gestão):" });
    if (inc.managementReferrals && inc.managementReferrals.length > 0) {
      for (const mr of inc.managementReferrals) {
        gestaoItems.push({ bold: false, text: mr.type });
      }
    }
  }

  const feedbackTxt = inc.managementFeedback ? inc.managementFeedback.toUpperCase() : "";
  const sFeedback   = feedbackTxt ? doc.splitTextToSize(feedbackTxt, CW - 6) : [];

  // ── Calcular altura TOTAL necessária para a caixa ─────────────────────
  let extraH = 0;
  if (sOrientacao.length > 0) { extraH += LH + 4; extraH += sOrientacao.length * LH + 3; }
  if (encItems.length > 0) {
    extraH += 4;
    for (const it of encItems) extraH += doc.splitTextToSize(it.text, CW - 8).length * LH;
  }
  if (gestaoItems.length > 0) {
    extraH += 6;
    for (const it of gestaoItems) extraH += doc.splitTextToSize(it.text, CW - 8).length * LH;
  }
  if (sFeedback.length > 0) { extraH += LH + 6; extraH += sFeedback.length * LH + 3; }
  const boxHIdeal = Math.max(30, sDesc.length * LH + extraH + 10);

  // ── Calcular espaço disponível abaixo da caixa ────────────────────────
  // Espaço fixo mínimo necessário abaixo da caixa:
  const OPTS_COUNT  = 9;
  const cbSpacingNormal = 5.5;
  const checkboxesH = 5 + OPTS_COUNT * cbSpacingNormal;
  const institucH   = 3 + 3 * LH + 4 + LH;   // texto final + "Contamos..."
  const signaturesH = 22;                      // assinaturas mínimas
  const gapBoxCb    = 6;                       // espaço entre caixa e checkboxes
  const fixedBelowH = gapBoxCb + checkboxesH + institucH + signaturesH;

  // Espaço total disponível para a caixa
  const availableForBox = PH - 12 - y - fixedBelowH;

  // Usar a menor entre ideal e disponível (nunca menor que 30mm)
  const finalBoxH = Math.min(boxHIdeal, Math.max(availableForBox, 30));

  // Se a caixa precisou ser comprimida, ajustar espaçamento interno
  const needsCompression = boxHIdeal > availableForBox;
  const scaleLH = needsCompression
    ? Math.max(3.5, (finalBoxH - 10) / Math.max(boxHIdeal - 10, 1) * LH)
    : LH;
  const boxFontSize = needsCompression ? Math.max(7, 9 * (scaleLH / LH)) : 9;

  // ── Desenhar caixa ────────────────────────────────────────────────────
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
  doc.rect(ML, y, CW, finalBoxH);

  const innerMaxY = y + finalBoxH - 3;
  let bY = y + 5;

  doc.setFont("helvetica", "normal"); doc.setFontSize(boxFontSize); doc.setTextColor(0, 0, 0);
  const sDescFinal = doc.splitTextToSize(descTxt, CW - 6);
  doc.text(sDescFinal, ML + 3, bY);
  bY += sDescFinal.length * scaleLH;

  // Orientação individual
  if (sOrientacao.length > 0 && bY + scaleLH + 4 < innerMaxY) {
    bY += 3;
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(ML + 3, bY, ML + CW - 3, bY);
    doc.setLineDashPattern([], 0);
    bY += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(boxFontSize - 0.2); doc.setTextColor(30, 100, 30);
    doc.text("Orientação Individual com o Estudante:", ML + 3, bY);
    bY += scaleLH + 1;
    doc.setFont("helvetica", "normal"); doc.setFontSize(boxFontSize - 0.2); doc.setTextColor(0, 0, 0);
    const sOrFinal = doc.splitTextToSize(orientacaoDesc.toUpperCase(), CW - 6);
    if (bY + sOrFinal.length * scaleLH < innerMaxY) {
      doc.text(sOrFinal, ML + 3, bY);
      bY += sOrFinal.length * scaleLH;
    }
  }

  // Encaminhamentos do professor
  if (encItems.length > 0 && bY < innerMaxY) {
    bY += 4;
    for (const it of encItems) {
      if (bY >= innerMaxY) break;
      doc.setFont("helvetica", it.bold ? "bold" : "normal");
      doc.setFontSize(it.bold ? boxFontSize : boxFontSize - 0.2);
      doc.setTextColor(0, 0, 0);
      const s = doc.splitTextToSize(it.text, CW - 8);
      doc.text(s, ML + 3, bY);
      bY += s.length * scaleLH;
    }
  }

  // Encaminhamentos da gestão
  if (gestaoItems.length > 0 && bY < innerMaxY) {
    bY += 3;
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(ML + 3, bY, ML + CW - 3, bY);
    doc.setLineDashPattern([], 0);
    bY += 4;
    for (const it of gestaoItems) {
      if (bY >= innerMaxY) break;
      doc.setFont("helvetica", it.bold ? "bold" : "normal");
      doc.setFontSize(it.bold ? boxFontSize : boxFontSize - 0.2);
      doc.setTextColor(it.bold ? 0 : 40, it.bold ? 0 : 40, it.bold ? 0 : 40);
      const s = doc.splitTextToSize(it.text, CW - 8);
      doc.text(s, ML + 3, bY);
      bY += s.length * scaleLH;
    }
    doc.setTextColor(0, 0, 0);
  }

  // Retorno da Gestão
  if (sFeedback.length > 0 && bY < innerMaxY) {
    bY += 3;
    doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(ML + 3, bY, ML + CW - 3, bY);
    doc.setLineDashPattern([], 0);
    bY += 4;
    doc.setFont("helvetica", "bold"); doc.setFontSize(boxFontSize - 0.2); doc.setTextColor(0, 60, 130);
    doc.text("Retorno da Gestão:", ML + 3, bY);
    bY += scaleLH + 1;
    doc.setFont("helvetica", "normal"); doc.setFontSize(boxFontSize - 0.2); doc.setTextColor(0, 60, 130);
    const sFbFinal = doc.splitTextToSize(feedbackTxt, CW - 6);
    if (bY + sFbFinal.length * scaleLH < innerMaxY) {
      doc.text(sFbFinal, ML + 3, bY);
    }
    doc.setTextColor(0, 0, 0);
  }

  y += finalBoxH + gapBoxCb;

  // ── Encaminhamentos (checkboxes) ──────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Encaminhamentos:", ML, y);
  y += 5;

  const mgmtSet   = new Set((inc.managementReferrals || []).map(r => r.type.toLowerCase()));
  const profTypes = profRefs.map(r => r.type);

  const OPTS = [
    "Orientação individual com o estudante",
    "Mediação de conflito realizada pela equipe gestora/POC",
    "Necessidade de acompanhamento e diálogo em casa sobre o ocorrido",
    "Convocação dos responsáveis para uma reunião presencial",
    "Recorrência / medidas educativas",
    "Orientação ao professor",
    "Encaminhamento à Rede Protetiva",
    "Busca ativa",
    "Outros",
  ];

  // Comprimir espaçamento dos checkboxes se necessário
  const spaceLeft = PH - 12 - y;
  const neededBelow = OPTS.length * cbSpacingNormal + institucH + signaturesH;
  const cbSpacing = spaceLeft < neededBelow
    ? Math.max(4.2, cbSpacingNormal * (spaceLeft / neededBelow))
    : cbSpacingNormal;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9);

  for (const opt of OPTS) {
    const ol = opt.toLowerCase();
    const checked =
      mgmtSet.has(ol) ||
      (profTypes.includes("orientacao_individual") && ol.startsWith("orientação individual")) ||
      (profTypes.includes("encaminhamento_gestao") && ol.includes("mediação de conflito"))   ||
      (profTypes.includes("busca_ativa")           && ol === "busca ativa")                  ||
      (inc.referralType === "orientacao_individual" && ol.startsWith("orientação individual")) ||
      (inc.referralType === "encaminhamento_gestao" && ol.includes("mediação de conflito"))   ||
      (inc.referralType === "busca_ativa"           && ol === "busca ativa");

    const bx = ML + 4, by = y - 3.2, bs = 3.4;
    doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.3);
    doc.rect(bx, by, bs, bs);
    if (checked) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(0, 100, 0);
      doc.text("X", bx + 0.6, by + 2.9);
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    doc.text(opt, ML + 10, y);
    y += cbSpacing;
  }

  // ── Texto institucional ───────────────────────────────────────────────
  y += 3;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  const final1 =
    "Reforçamos que a escola é um espaço de convivência democrática. Atitudes que divergem do " +
    "Regimento Escolar são tratadas como oportunidades de aprendizado e correção de rota. " +
    "O respeito mútuo e o cumprimento das normas são essenciais para que o direito à educação " +
    "de todos seja preservado";
  const sF1 = doc.splitTextToSize(final1, CW);
  doc.text(sF1, ML, y, { align: "justify", maxWidth: CW });
  y += sF1.length * LH + 4;
  doc.text("Contamos com seu apoio para reforçar esses valores junto ao(à) estudante.", ML, y);

  // ── Assinaturas — sempre dentro da página ─────────────────────────────
  const remaining = PH - 12 - y;
  const gap1 = Math.max(8, remaining * 0.42);
  y += gap1;

  const sigW = 65;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
  doc.line(ML, y, ML + sigW, y);
  doc.line(PW - MR - sigW, y, PW - MR, y);
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("Assinatura do responsável",  ML + sigW / 2,      y, { align: "center" });
  doc.text("Assinatura do responsável",  PW - MR - sigW / 2, y, { align: "center" });

  const gap2 = Math.max(7, (PH - 12 - y) * 0.55);
  y += gap2;
  doc.line(PW / 2 - 43, y, PW / 2 + 43, y);
  y += 4;
  doc.text("Assinatura  da Direção/ Coordenação", PW / 2, y, { align: "center" });

  return doc;
};

// ─────────────────────────────────────────────────────────────────────────────
// Exportações públicas
// ─────────────────────────────────────────────────────────────────────────────
export const generateIncidentPDF = async (
  incident: Incident,
  action: "view" | "download" = "download"
): Promise<void> => {
  const doc = await buildPDF(incident);
  if (action === "view") {
    window.open(doc.output("bloburl"), "_blank");
  } else {
    doc.save(`COMUNICADO_FIORAVANTE_${incident.studentName.replace(/\s+/g, "_")}.pdf`);
  }
};

export const uploadPDFToStorage = async (incident: Incident): Promise<string | null> => {
  if (!isSupabaseConfigured || !supabase) return null;
  try {
    const doc      = await buildPDF(incident);
    const pdfBlob  = doc.output("blob");
    const fileName = `fioravante/${incident.id}_${incident.studentName.replace(/\s+/g, "_")}_${Date.now()}.pdf`;

    const { error } = await supabase.storage
      .from("incident-pdfs")
      .upload(fileName, pdfBlob, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: false,
      });

    if (error) { console.error("Erro no upload:", error); return null; }

    const { data } = supabase.storage.from("incident-pdfs").getPublicUrl(fileName);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.error("Erro ao gerar/enviar PDF:", err);
    return null;
  }
};
