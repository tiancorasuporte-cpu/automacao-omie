import type { FacilitiesFechamentoExcelInput } from "@/lib/facilities-excel";
import { formatDurationHours } from "@/lib/facilities-domain";

const NAVY: [number, number, number] = [29, 24, 19];
const ACC: [number, number, number] = [254, 215, 6];
const INK: [number, number, number] = [125, 99, 0];
const MUT: [number, number, number] = [102, 97, 90];

function clean(s: string | number) {
  return String(s)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/–/g, "-");
}

function formatDateBr(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

async function loadLogoDataUrl() {
  try {
    const res = await fetch("/ancora-postos-logo.jpeg");
    if (!res.ok) return undefined;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
    return `data:image/jpeg;base64,${btoa(bin)}`;
  } catch {
    return undefined;
  }
}

export async function buildFacilitiesFechamentoPdf(input: FacilitiesFechamentoExcelInput) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const W = 297;
  const M = 12;
  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, "JPEG", M, 8, 18, 17.7);
    } catch {
      /* ignore */
    }
  }

  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("GRUPO ÂNCORA · FACILITIES", M + 22, 14);
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.text(clean(`Fechamento — ${input.monthLabel}`), M + 22, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUT);
  doc.text(`Competência ${input.monthKey}`, W - M, 14, { align: "right" });
  const money = (n: number) =>
    `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  doc.text(
    `Horas: ${formatDurationHours(input.horasPagar)} · pgto ${money(input.pagamento ?? 0)} · desc. ${money(input.desconto ?? 0)} · ${input.trocas} lanç. · ${input.permutas} permuta(s)` +
      ((input.almoco ?? 0) > 0 ? ` · almoço ${money(input.almoco ?? 0)}` : "") +
      ((input.ferias ?? 0) > 0
        ? ` · férias ${input.feriasDias ?? 0}d / ${formatDurationHours(input.feriasHoras ?? 0)}`
        : ""),
    W - M,
    21,
    { align: "right" },
  );
  doc.setFillColor(...ACC);
  doc.rect(M, 26, W - 2 * M, 1.4, "F");

  let y = 32;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Pagamento por colaborador", M, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 32, 44] },
    head: [["#", "Colaborador", "Empresa", "Escala", "Cob.", "Horas", "HE", "Almoço", "Pagamento"]],
    body:
      input.bySubstituto.length > 0
        ? input.bySubstituto.map((row, i) => [
            String(i + 1),
            clean(row.nome),
            clean(row.empresa),
            clean(row.escala),
            String(row.trocas),
            formatDurationHours(row.horas),
            (row.horasExtra ?? 0) > 0 ? formatDurationHours(row.horasExtra ?? 0) : "—",
            (row.almoco ?? 0) > 0 ? money(row.almoco ?? 0) : "—",
            money(row.pagamento ?? 0),
          ])
        : [["—", "Sem horas a pagar neste mês.", "", "", "", "", "", "", ""]],
  });
  y =
    (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  if (y > 170) {
    doc.addPage();
    y = 16;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Desconto por ausente", M, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 32, 44] },
    head: [["Ausente", "Empresa", "Lanç.", "Horas", "Desconto"]],
    body:
      (input.byAusente ?? []).length > 0
        ? (input.byAusente ?? []).map((row) => [
            clean(row.nome),
            clean(row.empresa),
            String(row.lancamentos),
            formatDurationHours(row.horas),
            money(row.desconto),
          ])
        : [["Nenhum desconto neste mês.", "", "", "", ""]],
  });
  y =
    (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  if (y > 170) {
    doc.addPage();
    y = 16;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Por posto de serviço", M, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 32, 44] },
    head: [["Posto", "Lanç.", "Horas", "HE", "Pagamento", "Desconto", "Almoço"]],
    body:
      input.byPosto.length > 0
        ? input.byPosto.map((row) => [
            clean(row.nome),
            String(row.trocas),
            formatDurationHours(row.horas),
            (row.horasExtra ?? 0) > 0 ? formatDurationHours(row.horasExtra ?? 0) : "—",
            money(row.pagamento ?? 0),
            money(row.desconto ?? 0),
            (row.almoco ?? 0) > 0 ? money(row.almoco ?? 0) : "—",
          ])
        : [["Sem lançamentos neste mês.", "", "", "", "", "", ""]],
  });
  y =
    (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  if ((input.byMotivo ?? []).length > 0) {
    if (y > 170) {
      doc.addPage();
      y = 16;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text("Por motivo", M, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: "striped",
      headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 32, 44] },
      head: [["Motivo", "Lanç.", "Horas", "Pagamento", "Desconto"]],
      body: (input.byMotivo ?? []).map((row) => [
        clean(row.motivoLabel),
        String(row.trocas),
        formatDurationHours(row.horas),
        money(row.pagamento ?? 0),
        money(row.desconto ?? 0),
      ]),
    });
  }

  doc.addPage();
  y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Lançamentos (detalhado)", M, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 6.5 },
    styles: { fontSize: 6, cellPadding: 1, textColor: [20, 32, 44], overflow: "linebreak" },
    head: [
      [
        "Data",
        "Posto",
        "Ausente",
        "Substituto",
        "Motivo",
        "Período",
        "Horas",
        "HE",
        "Tarifa",
        "Pagamento",
        "Desc.?",
        "Desconto",
        "Almoço",
        "Atest.",
        "Obs.",
        "Por",
      ],
    ],
    body:
      input.lancamentos.length > 0
        ? input.lancamentos.map((row) => [
            formatDateBr(row.data),
            clean(row.postoNome),
            clean(row.ausenteNome || "—"),
            clean(row.substitutoNome),
            clean(row.motivoLabel),
            clean(row.periodoLabel || "—"),
            formatDurationHours(row.horas),
            (row.horasExtra ?? 0) > 0
              ? `${formatDurationHours(row.horasExtra ?? 0)}${row.periodoExtraLabel ? `/${row.periodoExtraLabel}` : ""}`
              : "—",
            `${money(row.tarifaHora ?? 0)}${(row.tarifaDesconto ?? 0) > 0 ? ` / D ${money(row.tarifaDesconto ?? 0)}` : ""}`,
            money(row.valorPagamento ?? 0),
            row.aplicaDesconto ? "Sim" : "Não",
            money(row.valorDesconto ?? 0),
            row.pagaAlmoco && Number(row.valorAlmoco ?? 0) > 0
              ? money(Number(row.valorAlmoco))
              : "—",
            row.hasAtestado ? "Sim" : "Não",
            clean(row.observacao?.trim() || "—"),
            clean(row.registradoPor || "—"),
          ])
        : [
            [
              "—",
              "Nenhum lançamento neste mês.",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
            ],
          ],
  });

  doc.addPage();
  y = 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Férias — dias e horas", M, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 8 },
    styles: { fontSize: 8, cellPadding: 1.4, textColor: [20, 32, 44] },
    head: [["Cobertura", "Empresa", "Períodos", "Dias", "Horas", "Próprias"]],
    body:
      (input.byCoberturaFerias ?? []).length > 0
        ? (input.byCoberturaFerias ?? []).map((row) => [
            clean(row.nome),
            clean(row.empresa),
            String(row.ferias),
            String(row.dias),
            formatDurationHours(row.horas),
            String(row.propria),
          ])
        : [["—", "Sem férias neste mês.", "", "", "", ""]],
  });
  y =
    (doc as InstanceType<typeof jsPDF> & { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.2, textColor: [20, 32, 44], overflow: "linebreak" },
    head: [
      [
        "Início",
        "Fim",
        "Dias",
        "Em férias",
        "Cobertura",
        "Posto",
        "Horas",
        "Própria",
        "Observação",
      ],
    ],
    body:
      (input.feriasLancamentos ?? []).length > 0
        ? (input.feriasLancamentos ?? []).map((row) => [
            formatDateBr(row.dataInicio),
            formatDateBr(row.dataFim),
            String(row.dias),
            clean(row.colaboradorNome),
            clean(row.coberturaNome),
            clean(row.postoNome),
            formatDurationHours(row.horas),
            row.coberturaPropria ? "Sim" : "Não",
            clean(row.observacao?.trim() || "—"),
          ])
        : [["—", "Sem períodos de férias.", "", "", "", "", "", "", ""]],
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text("Grupo Âncora · Facilities", M, 200);
    doc.text(`Página ${i}/${pageCount}`, W - M, 200, { align: "right" });
  }

  return doc;
}

export async function downloadFacilitiesFechamentoPdf(input: FacilitiesFechamentoExcelInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const doc = await buildFacilitiesFechamentoPdf(input);
  const safeMonth = input.monthKey.replaceAll("-", "");
  const name = `Facilities-Fechamento-${safeMonth}.pdf`;
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
