import { jsPDF } from "jspdf";
import type { Incident, Student } from "../types";
import {
  LISTA_INTERVENCOES, HIPOTESES_AFASTAMENTO, NIVEIS, situacaoAfastamento, formatBR, incidentISODate,
  ENC_REDE_PROTETIVA, ENC_ESTUDO_DIRIGIDO, CATEGORIA_ESTUDO_DIRIGIDO,
} from "../data/resolucao68";
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

  // Afastamento preventivo temporário — conteúdo mínimo da comunicação à família (Art. 12, §1º)
  const afItems: Array<{ bold: boolean; text: string }> = [];
  const af = inc.resolucao68?.afastamento;
  if (af) {
    const sit = situacaoAfastamento(af);
    afItems.push({ bold: true, text: "Afastamento preventivo temporário (Res. SEDUC 68/2026, Arts. 11 e 12):" });
    afItems.push({ bold: false, text: `Motivo: ${af.motivacao}` });
    afItems.push({ bold: false, text:
      `Medida cautelar, excepcional e temporária, que não constitui punição: de ${formatBR(af.inicio)} a ${formatBR(sit.fim)} ` +
      `(${af.diasLetivos + (af.prorrogacao?.diasLetivos || 0)} dia(s) letivo(s)), com retorno previsto em ${formatBR(sit.retornoPrevisto)}. A matrícula fica preservada.` });
    afItems.push({ bold: false, text: `Continuidade das atividades pedagógicas: ${af.planoEstudos}` });
    afItems.push({ bold: false, text:
      "Próximos procedimentos: acompanhamento pela equipe gestora e pela URE e retorno com plano de acompanhamento, " +
      "salvo deliberação fundamentada do Conselho de Escola." });
    afItems.push({ bold: false, text:
      "Manifestação: o(a) estudante e a família podem se manifestar sobre a medida, por escrito ou pessoalmente, junto à Direção da escola." });
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
  if (afItems.length > 0) {
    extraH += 6;
    for (const it of afItems) extraH += doc.splitTextToSize(it.text, CW - 8).length * LH;
  }
  const boxHIdeal = Math.max(30, sDesc.length * LH + extraH + 10);

  // ── Calcular espaço disponível abaixo da caixa ────────────────────────
  // Espaço fixo mínimo necessário abaixo da caixa:
  const OPTS = LISTA_INTERVENCOES.filter(o => o.grupo !== "especial");
  const OPTS_COUNT  = Math.ceil(OPTS.length / 2);   // duas colunas
  const cbSpacingNormal = 5.5;
  const checkboxesH = 5 + OPTS_COUNT * cbSpacingNormal;
  const institucH   = 3 + 4 * LH + 4 + LH;   // texto final + "Contamos..."
  const signaturesH = 22;                      // assinaturas mínimas
  const gapBoxCb    = 6;                       // espaço entre caixa e checkboxes
  const fixedBelowH = gapBoxCb + checkboxesH + institucH + signaturesH;

  // Espaço total disponível para a caixa
  const availableForBox = PH - 12 - y - fixedBelowH;

  // Se a descrição cabe na página, usa o espaço disponível
  // Se não cabe, usa o tamanho ideal e adiciona nova página se necessário
  const needsNewPage = boxHIdeal > availableForBox;
  const finalBoxH = needsNewPage ? boxHIdeal : Math.max(availableForBox, 30);

  // Sem compressão — sempre usa fonte e espaçamento normal
  const needsCompression = false;
  const scaleLH = LH;
  const boxFontSize = 9;

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

  // Afastamento preventivo temporário
  if (afItems.length > 0 && bY < innerMaxY) {
    bY += 3;
    doc.setDrawColor(160, 160, 160); doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(ML + 3, bY, ML + CW - 3, bY);
    doc.setLineDashPattern([], 0);
    bY += 4;
    for (const it of afItems) {
      if (bY >= innerMaxY) break;
      doc.setFont("helvetica", it.bold ? "bold" : "normal");
      doc.setFontSize(it.bold ? boxFontSize : boxFontSize - 0.2);
      doc.setTextColor(it.bold ? 140 : 0, 0, 0);
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

  // ── Se a caixa de descrição ultrapassou a página, adiciona nova página ─
  if (needsNewPage) {
    doc.addPage();
    // Borda na nova página
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4);
    doc.rect(8, 8, PW - 16, PH - 16);
    y = 20; // Reset y para o topo da nova página
  }

  // ── Encaminhamentos (checkboxes) ──────────────────────────────────────
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  doc.text("Encaminhamentos:", ML, y);
  y += 5;

  const mgmtSet   = new Set((inc.managementReferrals || []).map(r => r.type.toLowerCase()));
  const profTypes = profRefs.map(r => r.type);

  // Comprimir espaçamento dos checkboxes se necessário
  const spaceLeft = PH - 12 - y;
  const neededBelow = OPTS_COUNT * cbSpacingNormal + institucH + signaturesH;
  const cbSpacing = spaceLeft < neededBelow
    ? Math.max(4.2, cbSpacingNormal * (spaceLeft / neededBelow))
    : cbSpacingNormal;

  doc.setFont("helvetica", "normal"); doc.setFontSize(9);

  const colW = CW / 2;
  const yStart = y;
  for (let idx = 0; idx < OPTS.length; idx++) {
    const optItem = OPTS[idx];
    const ol = optItem.label.toLowerCase();
    const colX = ML + (idx < OPTS_COUNT ? 0 : colW);
    y = yStart + (idx % OPTS_COUNT) * cbSpacing;
    const checked =
      mgmtSet.has(ol) ||
      (inc.category === CATEGORIA_ESTUDO_DIRIGIDO && optItem.label === ENC_ESTUDO_DIRIGIDO) ||
      (profTypes.includes("orientacao_individual") && ol.startsWith("orientação individual")) ||
      (profTypes.includes("encaminhamento_gestao") && ol.includes("mediação de conflito"))   ||
      (profTypes.includes("busca_ativa")           && ol === "busca ativa")                  ||
      (inc.referralType === "orientacao_individual" && ol.startsWith("orientação individual")) ||
      (inc.referralType === "encaminhamento_gestao" && ol.includes("mediação de conflito"))   ||
      (inc.referralType === "busca_ativa"           && ol === "busca ativa");

    const bx = colX + 2, by = y - 3.2, bs = 3.4;
    doc.setDrawColor(60, 60, 60); doc.setLineWidth(0.3);
    doc.rect(bx, by, bs, bs);
    if (checked) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(0, 100, 0);
      doc.text("X", bx + 0.6, by + 2.9);
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    doc.text(optItem.pdf, colX + 8, y);
  }
  y = yStart + OPTS_COUNT * cbSpacing;

  // ── Texto institucional ───────────────────────────────────────────────
  y += 3;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(0, 0, 0);
  const final1 =
    "Reforçamos que a escola é um espaço de convivência democrática. Atitudes que divergem do " +
    "Regimento Escolar são tratadas como oportunidades de aprendizado e correção de rota. " +
    "O respeito mútuo e o cumprimento das normas são essenciais para que o direito à educação " +
    "de todos seja preservado. Fica assegurada ao(à) estudante e à família a oportunidade de " +
    "manifestação junto à Direção da escola (Res. SEDUC nº 68/2026).";
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

// ─────────────────────────────────────────────────────────────────────────────
// Relatório circunstanciado — Res. SEDUC nº 68/2026, Art. 15
// Reúne o histórico do estudante em ordem cronológica e deixa em branco os
// campos que dependem de análise da Direção (risco, justificativa, proposta).
// ─────────────────────────────────────────────────────────────────────────────
export const generateRelatorioCircunstanciado = async (
  student: Student,
  incidents: Incident[],
  opts: { responsavel?: string; acao?: "view" | "download" } = {}
): Promise<void> => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const ML = 18;
  const CW = PW - 2 * ML;
  const LH = 4.6;
  let y = 13;

  const ensure = (h: number) => {
    if (y + h > PH - 15) { doc.addPage(); y = 18; }
  };
  const para = (text: string, o: { bold?: boolean; italic?: boolean; size?: number; indent?: number; gray?: boolean } = {}) => {
    doc.setFont("helvetica", o.bold ? "bold" : o.italic ? "italic" : "normal");
    doc.setFontSize(o.size ?? 9.3);
    if (o.gray) doc.setTextColor(90, 90, 90); else doc.setTextColor(0, 0, 0);
    const indent = o.indent ?? 0;
    for (const line of doc.splitTextToSize(text, CW - indent) as string[]) {
      ensure(LH);
      doc.text(line, ML + indent, y);
      y += LH;
    }
  };
  const secao = (titulo: string) => {
    y += 3;
    ensure(12);
    doc.setFillColor(228, 235, 245);
    doc.rect(ML, y - 4, CW, 6, "F");
    para(titulo, { bold: true });
    y += 1.5;
  };
  const linhasEmBranco = (n: number) => {
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.2);
    for (let i = 0; i < n; i++) { ensure(7); y += 6; doc.line(ML, y, ML + CW, y); }
    y += 4;
  };

  // ── Cabeçalho ─────────────────────────────────────────────────────────
  try {
    const logo = await loadImage(LOGO_URL);
    doc.addImage(logo.data, "PNG", 14, 10, 20, (logo.h / logo.w) * 20);
  } catch { /* brasão é opcional */ }
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(0, 0, 0);
  for (const l of [
    "GOVERNO DO ESTADO DE SÃO PAULO",
    "SECRETARIA DE ESTADO DA EDUCAÇÃO",
    "UNIDADE REGIONAL DE ENSINO GUARULHOS NORTE",
    "E.E. FIORAVANTE IERVOLINO – UA: 46.293 – CIE 037515",
  ]) { doc.text(l, PW / 2 + 7, y, { align: "center" }); y += 3.8; }
  y += 6;
  doc.setLineWidth(0.3); doc.line(ML, y, PW - ML, y); y += 7;
  doc.setFontSize(12);
  doc.text("RELATÓRIO CIRCUNSTANCIADO", PW / 2, y, { align: "center" }); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
  doc.text("Resolução SEDUC nº 68/2026, Art. 15 — DOCUMENTO RESERVADO", PW / 2, y, { align: "center" }); y += 6;

  const ordenados = [...incidents].sort((a, b) => incidentISODate(a).localeCompare(incidentISODate(b)));
  const hoje = new Date().toLocaleDateString("pt-BR");

  // I — Identificação da unidade escolar e da equipe responsável
  secao("I – Identificação da unidade escolar e da equipe responsável");
  para("E.E. Fioravante Iervolino – URE Guarulhos Norte.");
  para(`Responsável pela elaboração: ${opts.responsavel || "________________________________"}    Data: ${hoje}`);

  // II — Identificação do estudante
  secao("II – Identificação do estudante");
  para(`Nome: ${student.nome}    RA: ${student.ra}    Turma: ${student.turma}`);
  para("Informações pessoais preservadas: uso restrito à instrução do procedimento.", { italic: true, gray: true, size: 8.5 });

  // III — Descrição objetiva e cronológica dos fatos
  secao("III – Descrição objetiva e cronológica dos fatos");
  if (ordenados.length === 0) para("Nenhum registro localizado.");
  for (const inc of ordenados) {
    const r = inc.resolucao68;
    const cab = [
      inc.registerDate || inc.date,
      inc.category || "REGISTRO",
      r?.nivel ? `Nível ${r.nivel}` : "",
      `Registrado por: ${inc.professorName || "---"}`,
    ].filter(Boolean).join(" — ");
    para(cab, { bold: true });
    if (r?.dataCiencia) para(`Ciência pela escola em ${formatBR(r.dataCiencia)}.`, { indent: 4, gray: true, size: 8.5 });
    if (inc.irregularities && inc.irregularities !== "NENHUMA") para(`Irregularidades: ${inc.irregularities}`, { indent: 4 });
    para(inc.description || "", { indent: 4 });
    if (r?.manifestacaoEstudante) para(`Manifestação do estudante: ${r.manifestacaoEstudante}`, { indent: 4, italic: true });
    y += 1.5;
  }

  // IV — Análise da situação atual de risco
  secao("IV – Análise da situação atual de risco");
  const afastamentos = ordenados.filter(i => i.resolucao68?.afastamento);
  for (const inc of afastamentos) {
    const af = inc.resolucao68!.afastamento!;
    para(`${formatBR(af.inicio)} – ${HIPOTESES_AFASTAMENTO[af.hipotese]}`, { bold: true });
    para(af.motivacao, { indent: 4 });
  }
  para("Análise da Direção sobre o risco atual ao estudante, à comunidade escolar ou à convivência:", { gray: true, size: 8.5 });
  linhasEmBranco(3);

  // V — Registros na Plataforma Conviva
  secao("V – Registros realizados na Plataforma Conviva");
  const conviva = ordenados.filter(i => i.resolucao68?.conviva?.registrado);
  if (conviva.length === 0) para("Nenhum registro no Conviva informado no sistema.");
  for (const inc of conviva) {
    para(`${inc.registerDate || inc.date} – ${inc.category || "registro"}${inc.resolucao68?.conviva?.protocolo ? ` – protocolo ${inc.resolucao68.conviva.protocolo}` : ""}`, { indent: 4 });
  }
  const semConviva = ordenados.length - conviva.length;
  if (semConviva > 0) para(`${semConviva} registro(s) sem indicação de lançamento no Conviva.`, { gray: true, size: 8.5 });

  // VI — Medidas adotadas
  secao("VI – Medidas pedagógicas, restaurativas, mediadoras, protetivas e protocolares adotadas");
  let medidas = 0;
  for (const inc of ordenados) {
    if (inc.category === CATEGORIA_ESTUDO_DIRIGIDO && !(inc.managementReferrals || []).some(r => r.type === ENC_ESTUDO_DIRIGIDO)) {
      medidas++;
      para(`${inc.registerDate || inc.date} – ${ENC_ESTUDO_DIRIGIDO} (Art. 7º, IX)`, { indent: 4 });
    }
    for (const mr of inc.managementReferrals || []) {
      const info = LISTA_INTERVENCOES.find(l => l.label === mr.type);
      if (info?.grupo === "especial") continue;
      medidas++;
      para(`${inc.registerDate || inc.date} – ${mr.type}${info?.artigo ? ` (${info.artigo})` : ""}`, { indent: 4 });
      if (mr.description) para(mr.description, { indent: 8, gray: true, size: 8.5 });
    }
    const af = inc.resolucao68?.afastamento;
    if (af) {
      medidas++;
      const sit = situacaoAfastamento(af);
      para(`${formatBR(af.inicio)} – Afastamento preventivo temporário até ${formatBR(sit.fim)}${af.prorrogacao ? ` (prorrogado, Conselho em ${formatBR(af.prorrogacao.dataConselho)})` : ""}${af.retornoEm ? `; retorno em ${formatBR(af.retornoEm)}` : ""}`, { indent: 4 });
      para(`Plano de estudos: ${af.planoEstudos}`, { indent: 8, gray: true, size: 8.5 });
    }
  }
  if (medidas === 0) para("Nenhuma intervenção da gestão registrada no sistema.");

  // VII — Comunicações à família
  secao("VII – Comunicações realizadas à família ou aos responsáveis legais");
  let comunicacoes = 0;
  for (const inc of ordenados) {
    const r = inc.resolucao68;
    if (r?.familiaComunicadaEm) { comunicacoes++; para(`${formatBR(r.familiaComunicadaEm)} – comunicação referente ao registro de ${inc.registerDate || inc.date}`, { indent: 4 }); }
    if (r?.afastamento?.comunicacaoFamilia) { comunicacoes++; para(`${formatBR(r.afastamento.inicio)} – comunicação formal do afastamento preventivo`, { indent: 4 }); }
    if (r?.afastamento?.prorrogacao?.familiaComunicada) { comunicacoes++; para(`${formatBR(r.afastamento.prorrogacao.dataConselho)} – comunicação da prorrogação do afastamento`, { indent: 4 }); }
    for (const mr of inc.managementReferrals || []) {
      if (/respons[aá]veis|em casa/i.test(mr.type)) { comunicacoes++; para(`${inc.registerDate || inc.date} – ${mr.type}`, { indent: 4 }); }
    }
  }
  if (comunicacoes === 0) para("Nenhuma comunicação à família registrada no sistema.");

  // VIII — Reuniões, orientações, pactuações e planos
  secao("VIII – Registros de reuniões, orientações, pactuações e planos de acompanhamento");
  const devolutivas = ordenados.filter(i => i.managementFeedback);
  if (devolutivas.length === 0) para("Sem devolutivas registradas.");
  for (const inc of devolutivas) para(`${inc.registerDate || inc.date} – ${inc.managementFeedback}`, { indent: 4 });

  // IX — Rede protetiva
  secao("IX – Encaminhamentos à rede protetiva ou aos demais órgãos competentes");
  const rede = ordenados.filter(i =>
    (i.managementReferrals || []).some(r => r.type === ENC_REDE_PROTETIVA) || i.resolucao68?.afastamento?.comunicacaoRede);
  if (rede.length === 0) para("Nenhum encaminhamento à rede protetiva registrado.");
  for (const inc of rede) {
    const mr = (inc.managementReferrals || []).find(r => r.type === ENC_REDE_PROTETIVA);
    para(`${inc.registerDate || inc.date}${mr?.description ? ` – ${mr.description}` : " – comunicação à rede protetiva"}`, { indent: 4 });
  }

  // X a XII — preenchimento pela Direção
  secao("X – Justificativa técnica para a eventual transferência cautelar");
  linhasEmBranco(4);
  secao("XI – Proposta preliminar de continuidade do acompanhamento pedagógico e protetivo");
  linhasEmBranco(4);
  secao("XII – Matrícula decorrente de decisão judicial");
  para("(   ) Não      (   ) Sim – anexar cópia da ordem judicial ou documentos disponíveis (Art. 23).");

  y += 4;
  para(
    "Conforme o Art. 15, §1º, este relatório evita juízos morais, expressões estigmatizantes, exposição indevida " +
    "da vida privada do estudante e informações não verificadas. Documento de caráter reservado (Art. 18, §1º).",
    { italic: true, gray: true, size: 8 }
  );
  para(`Níveis de referência: ${Object.values(NIVEIS).map(n => n.titulo).join("; ")}.`, { italic: true, gray: true, size: 7.5 });

  // Assinatura
  ensure(25);
  y += 18;
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
  doc.line(PW / 2 - 45, y, PW / 2 + 45, y);
  y += 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
  doc.text("Direção da Unidade Escolar", PW / 2, y, { align: "center" });

  if (opts.acao === "download") {
    doc.save(`RELATORIO_CIRCUNSTANCIADO_${student.nome.replace(/\s+/g, "_")}.pdf`);
  } else {
    window.open(doc.output("bloburl"), "_blank");
  }
};
