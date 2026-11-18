// @ts-nocheck
// CRM Comercial — SGO Âncora
// Converte o arquivo anexado (PDF, Word .docx ou Excel) em TEXTO, para depois usar extrairValores() de regras.ts.
// Dependências (npm):  pdfjs-dist@3.11.174   jszip@3.10.1   xlsx@0.18.5
//   npm i pdfjs-dist@3.11.174 jszip xlsx
// Pode rodar no navegador (como no protótipo) ou no back-end. Formatos .doc antigo e PDF escaneado (imagem) não são lidos:
// nesse caso o arquivo é anexado normalmente e o usuário preenche os valores à mão.
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';

// Worker do pdf.js (Vite). Em outro bundler, ajuste o caminho do worker.
// @ts-ignore
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';
(pdfjsLib as any).GlobalWorkerOptions.workerSrc = workerSrc;

export const extensao = (nome: string) => (nome.split('.').pop() || '').toLowerCase();
export const FORMATOS_LIDOS = ['pdf', 'docx', 'xlsx', 'xls', 'csv'];

export async function textoDoArquivo(file: File): Promise<string> {
  const e = extensao(file.name), buf = await file.arrayBuffer();

  if (e === 'pdf') {
    const pdf = await (pdfjsLib as any).getDocument({ data: buf }).promise;
    const linhas: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const c = await (await pdf.getPage(p)).getTextContent();
      // agrupa os pedaços de texto pela altura (y) para remontar as linhas da página
      const g: Record<number, any[]> = {};
      c.items.forEach((it: any) => { const y = Math.round(it.transform[5] / 3); (g[y] = g[y] || []).push(it); });
      Object.keys(g).map(Number).sort((a, b) => b - a).forEach(y =>
        linhas.push(g[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim()));
    }
    return linhas.filter(Boolean).join('\n');
  }

  if (e === 'docx') {
    const z = await JSZip.loadAsync(buf);
    const x = await z.file('word/document.xml')!.async('string');
    const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    // cada parágrafo vira uma linha; células de tabela são separadas por espaço
    return x.replace(/<w:tab\/>/g, ' ').replace(/<\/w:(p|tc)>/g, m => (m === '</w:p>' ? '\n' : ' ')).replace(/<[^>]+>/g, '')
      .split('\n').map(l => dec(l).replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
  }

  if (['xlsx', 'xls', 'csv'].includes(e)) {
    const wb = XLSX.read(buf, { type: 'array' });
    return wb.SheetNames.map(n => XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: ' ', blankrows: false })).join('\n');
  }

  throw new Error(`formato .${e} não é lido automaticamente`);
}
