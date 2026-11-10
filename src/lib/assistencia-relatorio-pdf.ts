import { APP_NAME } from "@/lib/brand";
import { osStageName, osTipoBadgeLabel, osTipoLabel } from "@/lib/assistencia-domain";

const NAVY: [number, number, number] = [29, 24, 19];
const ACC: [number, number, number] = [254, 215, 6];
const INK: [number, number, number] = [125, 99, 0];
const MUT: [number, number, number] = [102, 97, 90];

export type AssistRelatorioPdfRow = {
  num: string;
  clientName: string;
  clientCity: string | null;
  tipo: string;
  subtipo: string | null;
  stage: number;
  servico: string;
  quoteNumero: string | null;
  agDate: string | null;
  periodo: string | null;
  hora: string | null;
  teamName: string | null;
  tecnicoNome: string | null;
  reportDate: string;
  ciAt: string | null;
  coAt: string | null;
  resolucao: string | null;
  items: Array<{ qtd: number; nome: string; usado: number | null; devolvido: number | null }>;
  /** data URLs (jpeg/png) das fotos do relatório/check-out */
  fotos: string[];
};

export type AssistRelatorioPdfInput = {
  title?: string;
  generatedAt: string;
  filtersLabel: string;
  rows: AssistRelatorioPdfRow[];
};

function clean(s: string | number) {
  return String(s)
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/–/g, "-");
}

function formatDateBr(value: string | null | undefined) {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function formatDateTimeBr(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR");
}

function responsavel(row: AssistRelatorioPdfRow) {
  const team = (row.teamName ?? "").trim();
  const tec = (row.tecnicoNome ?? "").trim();
  if (team && tec && team.toLowerCase() !== tec.toLowerCase()) return `${team} · ${tec}`;
  return team || tec || "—";
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

function imageFormat(dataUrl: string): "JPEG" | "PNG" | null {
  if (/^data:image\/png;/i.test(dataUrl)) return "PNG";
  if (/^data:image\/(jpeg|jpg);/i.test(dataUrl)) return "JPEG";
  return null;
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

/** Reduz data URL para caber melhor no PDF (evita estouro de memória). */
async function shrinkPhotoForPdf(dataUrl: string, maxSide = 960): Promise<string> {
  if (typeof document === "undefined") return dataUrl;
  const size = await loadImageSize(dataUrl);
  if (!size) return dataUrl;
  if (Math.max(size.w, size.h) <= maxSide && dataUrl.length < 900_000) return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("img"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return dataUrl;
  }
}

async function drawPhotoGrid(
  doc: import("jspdf").jsPDF,
  fotos: string[],
  startY: number,
  opts?: { margin?: number; cols?: number; maxH?: number },
) {
  const usable = fotos.filter((f) => typeof f === "string" && f.startsWith("data:image/")).slice(0, 12);
  if (!usable.length) return startY;

  const M = opts?.margin ?? 14;
  const cols = opts?.cols ?? 2;
  const maxH = opts?.maxH ?? 58;
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const gap = 4;
  const cellW = (W - 2 * M - gap * (cols - 1)) / cols;
  let y = startY;
  let col = 0;
  let rowMaxH = 0;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  if (y > H - 40) {
    doc.addPage();
    y = 18;
  }
  doc.text(`Fotos (${usable.length})`, M, y);
  y += 6;

  for (let i = 0; i < usable.length; i++) {
    const raw = usable[i]!;
    const dataUrl = await shrinkPhotoForPdf(raw);
    const format = imageFormat(dataUrl) ?? "JPEG";
    const size = (await loadImageSize(dataUrl)) ?? { w: 4, h: 3 };
    const ratio = size.w / Math.max(size.h, 1);
    let drawW = cellW;
    let drawH = drawW / ratio;
    if (drawH > maxH) {
      drawH = maxH;
      drawW = drawH * ratio;
    }

    if (col === 0 && y + drawH > H - 16) {
      doc.addPage();
      y = 18;
      rowMaxH = 0;
    }

    const x = M + col * (cellW + gap) + Math.max(0, (cellW - drawW) / 2);
    try {
      doc.addImage(dataUrl, format, x, y, drawW, drawH);
      doc.setDrawColor(220);
      doc.rect(x, y, drawW, drawH);
    } catch {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...MUT);
      doc.text(`(foto ${i + 1} indisponível)`, x, y + 6);
    }

    rowMaxH = Math.max(rowMaxH, drawH);
    col += 1;
    if (col >= cols || i === usable.length - 1) {
      y += rowMaxH + gap;
      col = 0;
      rowMaxH = 0;
    }
  }

  return y;
}

function drawHeader(
  doc: import("jspdf").jsPDF,
  opts: {
    title: string;
    subtitle: string;
    rightTop: string;
    rightBottom: string;
    logo?: string;
  },
) {
  const W = doc.internal.pageSize.getWidth();
  const M = 12;
  if (opts.logo) {
    try {
      doc.addImage(opts.logo, "JPEG", M, 8, 18, 17.7);
    } catch {
      /* ignore */
    }
  }
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`${APP_NAME.toUpperCase()} · ASSISTÊNCIA`, M + 22, 14);
  doc.setTextColor(...NAVY);
  doc.setFontSize(14);
  doc.text(clean(opts.title), M + 22, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUT);
  doc.text(clean(opts.rightTop), W - M, 14, { align: "right" });
  doc.text(clean(opts.rightBottom), W - M, 21, { align: "right" });
  doc.setFillColor(...ACC);
  doc.rect(M, 26, W - 2 * M, 1.4, "F");
  doc.setFontSize(8);
  doc.text(clean(opts.subtitle), M, 32);
}

function drawFooter(doc: import("jspdf").jsPDF) {
  const pageCount = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...MUT);
    doc.text(`${APP_NAME} · Relatório de OS`, 12, H - 8);
    doc.text(`Página ${i}/${pageCount}`, W - 12, H - 8, { align: "right" });
  }
}

function saveBlob(doc: import("jspdf").jsPDF, filename: string) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** PDF consolidado (lista filtrada). */
export async function downloadAssistRelatorioPdf(input: AssistRelatorioPdfInput) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const logo = await loadLogoDataUrl();
  const title = input.title ?? "Relatório de OS";

  drawHeader(doc, {
    title,
    subtitle: input.filtersLabel,
    rightTop: input.generatedAt,
    rightBottom: `${input.rows.length} OS`,
    logo,
  });

  autoTable(doc, {
    startY: 36,
    margin: { left: 12, right: 12 },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 7 },
    styles: { fontSize: 7, cellPadding: 1.2, textColor: [20, 32, 44], overflow: "linebreak" },
    head: [["OS", "Cliente", "Tipo", "Data", "Responsável", "Etapa", "Serviço", "Materiais", "Fotos"]],
    body:
      input.rows.length > 0
        ? input.rows.map((row) => [
            clean(row.num),
            clean(row.clientName),
            clean(
              `${osTipoBadgeLabel(row.tipo)}${row.subtipo ? ` · ${row.subtipo}` : ""}`,
            ),
            clean(
              [
                formatDateBr(row.reportDate),
                row.periodo,
                row.hora,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
            clean(responsavel(row)),
            clean(osStageName(row.stage)),
            clean(row.servico || "—"),
            clean(
              row.items.length
                ? row.items.map((i) => `${i.qtd}x ${i.nome}`).join("; ")
                : "—",
            ),
            String(row.fotos?.length ?? 0),
          ])
        : [["—", "Nenhuma OS no filtro.", "", "", "", "", "", "", ""]],
  });

  const withFotos = input.rows.filter((r) => (r.fotos?.length ?? 0) > 0);
  for (const row of withFotos) {
    doc.addPage();
    drawHeader(doc, {
      title: `OS ${row.num} · Fotos`,
      subtitle: `${row.clientName}${row.clientCity ? ` · ${row.clientCity}` : ""}`,
      rightTop: input.generatedAt,
      rightBottom: `${row.fotos.length} foto(s)`,
      logo,
    });
    await drawPhotoGrid(doc, row.fotos, 36, { margin: 12, cols: 3, maxH: 52 });
  }

  drawFooter(doc);
  saveBlob(
    doc,
    `Assistencia-Relatorio-OS-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}

/** PDF detalhado de uma OS. */
export async function downloadAssistOsPdf(row: AssistRelatorioPdfRow) {
  if (typeof document === "undefined") {
    throw new Error("Exportação disponível apenas no navegador.");
  }
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const logo = await loadLogoDataUrl();
  const W = doc.internal.pageSize.getWidth();
  const M = 14;

  drawHeader(doc, {
    title: `OS ${row.num}`,
    subtitle: `${row.clientName}${row.clientCity ? ` · ${row.clientCity}` : ""}`,
    rightTop: new Date().toLocaleString("pt-BR"),
    rightBottom: osStageName(row.stage),
    logo,
  });

  let y = 38;
  const lines: Array<[string, string]> = [
    ["Tipo", `${osTipoLabel(row.tipo)}${row.subtipo ? ` · ${row.subtipo}` : ""}`],
    ["Serviço", row.servico || "—"],
    ["Orçamento", row.quoteNumero || "—"],
    [
      "Agenda",
      [formatDateBr(row.agDate), row.periodo, row.hora].filter(Boolean).join(" · ") || "—",
    ],
    ["Responsável", responsavel(row)],
    ["Check-in", formatDateTimeBr(row.ciAt)],
    ["Check-out", formatDateTimeBr(row.coAt)],
  ];

  doc.setFontSize(10);
  for (const [label, value] of lines) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...MUT);
    doc.text(label, M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...NAVY);
    const wrapped = doc.splitTextToSize(clean(value), W - 2 * M - 32);
    doc.text(wrapped, M + 32, y);
    y += Math.max(6, wrapped.length * 5);
  }

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text("Resolução", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...NAVY);
  const resolucao = clean(row.resolucao || "—");
  const resLines = doc.splitTextToSize(resolucao, W - 2 * M);
  doc.text(resLines, M, y);
  y += resLines.length * 5 + 6;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    theme: "striped",
    headStyles: { fillColor: NAVY, textColor: 255, fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 2, textColor: [20, 32, 44] },
    head: [["Qtd", "Material", "Usado", "Devolvido"]],
    body:
      row.items.length > 0
        ? row.items.map((it) => [
            String(it.qtd),
            clean(it.nome),
            it.usado == null ? "—" : String(it.usado),
            it.devolvido == null ? "—" : String(it.devolvido),
          ])
        : [["—", "Sem materiais", "", ""]],
  });

  const afterTable =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ??
    y + 20;

  if (row.fotos?.length) {
    await drawPhotoGrid(doc, row.fotos, afterTable + 8, {
      margin: M,
      cols: 2,
      maxH: 62,
    });
  }

  drawFooter(doc);
  saveBlob(doc, `OS-${row.num.replace(/\s+/g, "")}.pdf`);
}
