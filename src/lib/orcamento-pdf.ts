import { APP_NAME, BRAND_LOGO_URL } from "@/lib/brand";

export type OrcamentoPdfItem = {
  descricao: string;
  codigoProduto: number;
  unidade: string | null;
  quantidade: number;
  valorUnitario: number;
};

export type OrcamentoPdfOptions = {
  empresaNome: string;
  clienteNome: string;
  clienteCodigo?: number | null;
  numeroInterno?: string | null;
  criadoPor?: string | null;
  dataPrevisao: string;
  observacao?: string | null;
  items: OrcamentoPdfItem[];
  /** Exibe preço unitário e subtotal de cada item */
  showLineValues: boolean;
  /** Exibe o valor total do orçamento */
  showTotal: boolean;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMoney(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBr(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }
  return iso;
}

function formatQty(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

export function buildOrcamentoPdfHtml(options: OrcamentoPdfOptions) {
  const total = options.items.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
  const showValues = options.showLineValues;
  const showTotal = options.showTotal;
  const logoUrl =
    typeof window !== "undefined" ? new URL(BRAND_LOGO_URL, window.location.origin).toString() : BRAND_LOGO_URL;

  const rows = options.items
    .map((item) => {
      const cells = [
        `<td>
          <div class="desc">${escapeHtml(item.descricao)}</div>
          <div class="meta">#${item.codigoProduto}${item.unidade ? ` · ${escapeHtml(item.unidade)}` : ""}</div>
        </td>`,
        `<td class="num">${formatQty(item.quantidade)}</td>`,
      ];
      if (showValues) {
        cells.push(`<td class="num">${formatMoney(item.valorUnitario)}</td>`);
        cells.push(`<td class="num">${formatMoney(item.quantidade * item.valorUnitario)}</td>`);
      }
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  const headers = ["Produto", "Qtd"];
  if (showValues) headers.push("Unitário", "Subtotal");

  const colCount = headers.length;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Orçamento — ${escapeHtml(options.clienteNome)}</title>
  <style>
    @page { margin: 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #1c1b1f;
      font: 12px/1.45 "Segoe UI", Arial, sans-serif;
    }
    .sheet { max-width: 800px; margin: 0 auto; }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #0b3d5c;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .brand { display: flex; align-items: center; gap: 12px; }
    .brand img { height: 48px; width: auto; }
    .brand h1 { margin: 0; font-size: 18px; color: #0b3d5c; }
    .brand p { margin: 2px 0 0; color: #5f6368; font-size: 11px; }
    .badge {
      border: 1px solid #0b3d5c;
      color: #0b3d5c;
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 18px;
      margin-bottom: 18px;
    }
    .label { color: #5f6368; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th, td {
      border-bottom: 1px solid #dde1e6;
      padding: 8px 6px;
      vertical-align: top;
    }
    th {
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #5f6368;
      background: #f4f6f8;
    }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .desc { font-weight: 600; }
    .meta { color: #5f6368; font-size: 11px; margin-top: 2px; }
    .obs {
      margin-top: 18px;
      padding: 10px 12px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .total-row td {
      border-bottom: none;
      padding-top: 14px;
      font-size: 14px;
      font-weight: 700;
    }
    .footnote {
      margin-top: 28px;
      color: #5f6368;
      font-size: 10px;
    }
    @media print {
      .no-print { display: none !important; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div class="brand">
        <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(APP_NAME)}" />
        <div>
          <h1>${escapeHtml(options.empresaNome || APP_NAME)}</h1>
          <p>Orçamento de produtos</p>
        </div>
      </div>
      <div class="badge">${escapeHtml(options.numeroInterno?.trim() || "Orçamento")}</div>
    </div>

    <div class="meta-grid">
      <div>
        <div class="label">Nº do orçamento</div>
        <div class="value">${escapeHtml(options.numeroInterno?.trim() || "—")}</div>
      </div>
      <div>
        <div class="label">Cliente</div>
        <div class="value">${escapeHtml(options.clienteNome)}</div>
        ${
          options.clienteCodigo
            ? `<div class="meta">Código Omie ${options.clienteCodigo}</div>`
            : ""
        }
      </div>
      <div>
        <div class="label">Previsão</div>
        <div class="value">${escapeHtml(formatDateBr(options.dataPrevisao))}</div>
      </div>
      <div>
        <div class="label">Elaborado por</div>
        <div class="value">${escapeHtml(options.criadoPor?.trim() || "—")}</div>
      </div>
      <div>
        <div class="label">Emitido em</div>
        <div class="value">${escapeHtml(new Date().toLocaleString("pt-BR"))}</div>
      </div>
      <div>
        <div class="label">Itens</div>
        <div class="value">${options.items.length}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          ${headers
            .map((header, index) => `<th class="${index === 0 ? "" : "num"}">${header}</th>`)
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${rows}
        ${
          showTotal
            ? `<tr class="total-row">
                <td colspan="${colCount - 1}" style="text-align:right">Total</td>
                <td class="num">${formatMoney(total)}</td>
              </tr>`
            : ""
        }
      </tbody>
    </table>

    ${
      options.observacao?.trim()
        ? `<div class="obs"><div class="label">Observações</div><div>${escapeHtml(options.observacao.trim())}</div></div>`
        : ""
    }

    <p class="footnote">
      Documento gerado por ${escapeHtml(APP_NAME)}.
      ${!showValues && showTotal ? " Valores unitários ocultos — exibindo apenas o total." : ""}
      ${!showValues && !showTotal ? " Valores ocultos neste documento." : ""}
    </p>
  </div>
</body>
</html>`;
}

export function openOrcamentoPdf(options: OrcamentoPdfOptions) {
  if (!options.items.length) {
    throw new Error("Inclua ao menos um produto para gerar o PDF.");
  }
  if (typeof document === "undefined") {
    throw new Error("Geração de PDF disponível apenas no navegador.");
  }

  const html = buildOrcamentoPdfHtml(options);
  const existing = document.getElementById("orcamento-pdf-frame");
  if (existing) existing.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "orcamento-pdf-frame";
  iframe.setAttribute("title", "Pré-visualização do orçamento");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    iframe.remove();
    throw new Error("Não foi possível preparar a impressão do PDF.");
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  const cleanup = () => {
    setTimeout(() => {
      iframe.remove();
    }, 1000);
  };

  const triggerPrint = () => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      cleanup();
    }
  };

  // Aguarda imagens/estilos carregarem antes de imprimir.
  if (frameDocument.readyState === "complete") {
    setTimeout(triggerPrint, 200);
  } else {
    iframe.addEventListener(
      "load",
      () => {
        setTimeout(triggerPrint, 200);
      },
      { once: true },
    );
  }
}
