// @ts-nocheck
// CRM Comercial — SGO Âncora
// REGRAS DE NEGÓCIO (funções puras, sem tela). Mesma lógica do protótipo crm-comercial.html.
// Podem rodar no front (React) e também no back-end para validar antes de gravar.
import type {
  Alerta, CalculoComissao, ComissaoPessoa, EtapaId, LancamentoComissao, Oportunidade, Papel, RegrasComissao, TipoContrato, TipoVenda, ValoresLidos,
} from './types';
import { ETAPAS, NEGOCIACAO, PAPEIS, PROX_PADRAO, PRAZO_APROVADO, SEGUIMENTO, SERV_RECORRENTE, SLA, TIPOS_VENDA, ANEXO_OBRIGATORIO_NO_ENVIO,
  FERIADOS_FIXOS, FERIADOS_EXTRA, CONTAR_CARNAVAL, COMISSAO_PADRAO, CONTRATO_POR_SERVICO } from './config';

/* ============================== DATAS ============================== */
// ATENÇÃO: usar a data LOCAL (America/Sao_Paulo). Não usar toISOString() para "hoje",
// porque depois das 21h ela já devolve o dia seguinte (UTC).
export const hojeISO = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

/** Soma dias a uma data ISO */
export const addDias = (n: number, base: string = hojeISO()): string => { const d = parse(base); d.setDate(d.getDate() + n); return hojeISO(d); };
/** Dias entre hoje e a data (negativo = passado) */
export const diasAte = (iso: string, hoje: string = hojeISO()): number => Math.round((parse(iso).getTime() - parse(hoje).getTime()) / 864e5);

/* ============================== DIAS ÚTEIS ============================== */
function pascoa(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, mes - 1, dia);
}
const cacheFeriados: Record<number, Set<string>> = {};
/** Feriados do ano: nacionais fixos + Sexta-feira Santa + Corpus Christi (+ Carnaval) + extras */
export function feriadosDoAno(y: number): Set<string> {
  if (cacheFeriados[y]) return cacheFeriados[y];
  const p = pascoa(y), mv = (n: number) => { const d = new Date(p); d.setDate(d.getDate() + n); return hojeISO(d); };
  const s = new Set(FERIADOS_FIXOS.map(md => `${y}-${md}`).concat(FERIADOS_EXTRA.filter(f => f.startsWith(`${y}-`))));
  s.add(mv(-2)); s.add(mv(60));
  if (CONTAR_CARNAVAL) { s.add(mv(-48)); s.add(mv(-47)); }
  return (cacheFeriados[y] = s);
}
export const diaUtil = (iso: string) => { const d = parse(iso), w = d.getDay(); return w !== 0 && w !== 6 && !feriadosDoAno(d.getFullYear()).has(iso); };
/** Soma n dias úteis (o próprio dia não conta). Ex.: sexta + 1 = segunda */
export function addUteis(n: number, base: string = hojeISO()): string {
  const steps = Math.max(0, Math.min(Number(n) || 0, 3660));
  let iso = /^\d{4}-\d{2}-\d{2}$/.test(base) ? base : hojeISO();
  let c = 0;
  let guard = 0;
  while (c < steps && guard < 8000) {
    iso = addDias(1, iso);
    guard++;
    if (diaUtil(iso)) c++;
  }
  return iso;
}
/** Dias úteis depois de `de` até `ate` (inclusive) */
export function uteisEntre(de: string, ate: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate) || de >= ate) return 0;
  let c = 0, iso = de, guard = 0;
  while (iso < ate && guard < 8000) {
    iso = addDias(1, iso);
    guard++;
    if (diaUtil(iso)) c++;
  }
  return c;
}
/** Data limite da etapa (montar = 2, montado = 1, enviado = 3 dias úteis a partir de `desde`) */
export const limiteEtapa = (o: Oportunidade) => addUteis(SLA[o.etapa as 'montar' | 'montado' | 'enviado'], o.desde);

export const fdata = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
export const fcurta = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
export const brl = (v?: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const iniciais = (n: string) => n.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
export const etapaInfo = (id: EtapaId) => ETAPAS.find(e => e.id === id)!;

/* ============================== TIPO DE VENDA E VALORES ============================== */
export const tipoVenda = (o: Oportunidade): TipoVenda => o.tv || (SERV_RECORRENTE.includes(o.servico) ? 'recorrente' : 'execucao');
export const isRecorrente = (o: Oportunidade) => tipoVenda(o) === 'recorrente';
/** Valor principal: recorrente = valor mensal; execução = valor total */
export const valorPrincipal = (o: Oportunidade) => (isRecorrente(o) ? +o.valor || 0 : +(o.total || 0));
/** Soma do valor total das vendas de execução */
export const somaExecucao = (L: Oportunidade[]) => L.filter(o => !isRecorrente(o)).reduce((a, o) => a + (+(o.total || 0)), 0);
/** Soma do valor mensal das vendas recorrentes */
export const somaRecorrente = (L: Oportunidade[]) => L.filter(isRecorrente).reduce((a, o) => a + (+o.valor || 0), 0);

/* ============================== ALERTAS DO CARD ============================== */
/** Etiqueta colorida do card + se está atrasado (borda vermelha e filtro "Só atrasados") */
export function alerta(o: Oportunidade, hoje: string = hojeISO()): Alerta {
  if (o.etapa === 'montar' || o.etapa === 'montado' || o.etapa === 'enviado') {
    // prazo em DIAS ÚTEIS a partir do dia em que entrou na coluna; a etiqueta mostra a DATA LIMITE
    const lim = limiteEtapa(o);
    const nome = { montar: 'Montagem atrasada', montado: 'Envio atrasado', enviado: 'Agendar 2ª ação · atrasado' }[o.etapa];
    const ate = { montar: 'Montar até ', montado: 'Enviar até ', enviado: 'Agendar 2ª ação até ' }[o.etapa];
    if (hoje > lim) return { cls: 'red', txt: `${nome} ${Math.max(1, uteisEntre(lim, hoje))}d`, late: true, lim };
    if (hoje === lim) return { cls: 'amb', txt: o.etapa === 'enviado' ? 'Agendar 2ª ação hoje' : 'Vence hoje', late: true, lim };
    return { cls: '', txt: ate + fcurta(lim) + (lim === addDias(1, hoje) ? ' (amanhã)' : ''), late: false, lim };
  }
  if (o.etapa === 'acao2' || o.etapa === 'acao3') {
    const a = o.acao;
    if (!a) return { cls: 'red', txt: 'Sem ação agendada', late: true };
    if (a.feita) return { cls: 'amb', txt: 'Ação feita · definir próximo passo', late: true };
    const d = diasAte(a.data, hoje);
    if (d < 0) return { cls: 'red', txt: `Ação atrasada ${-d}d`, late: true };
    if (d === 0) return { cls: 'amb', txt: 'Ação hoje' + (a.hora ? ' ' + a.hora : ''), late: true };
    return { cls: 'blu', txt: 'Agendada ' + fcurta(a.data), late: false };
  }
  if (o.etapa === 'aprovado') {
    const ap = o.aprov, d = ap?.prev ? diasAte(ap.prev, hoje) : null, oq = (ap?.aguardando || 'Assinatura').split(' ')[0];
    if (d === null) return { cls: 'amb', txt: 'Sem previsão', late: true };
    if (d < 0) return { cls: 'red', txt: `${oq} atrasada ${-d}d`, late: true };
    if (d === 0) return { cls: 'amb', txt: `${oq} prevista hoje`, late: true };
    return { cls: 'grn', txt: 'Previsto ' + fcurta(ap!.prev), late: false };
  }
  if (o.etapa === 'final' && o.res) return o.res.st === 'ganho' ? { cls: 'grn', txt: 'Fechado' } : { cls: 'red', txt: 'Não fechado' };
  return { cls: '', txt: '' };
}

/** Ordem dos cards dentro da coluna (exceto Finalizado): atrasados primeiro, depois pela data da ação/etapa */
export const ordenarColuna = (L: Oportunidade[], hoje = hojeISO()) =>
  [...L].sort((a, b) => (Number(!!alerta(b, hoje).late) - Number(!!alerta(a, hoje).late)) || (a.acao?.data || a.desde).localeCompare(b.acao?.data || b.desde));

/* ============================== MOVIMENTAÇÃO (Kanban) ============================== */
export type ModalMovimento = 'montado' | 'envio' | 'agendar2' | 'agendar3' | 'aprovado' | 'final' | 'voltar';
/**
 * Decide o que acontece ao arrastar o card (ou usar "Mover para").
 * Nunca muda a etapa direto: sempre abre um modal que coleta os dados obrigatórios.
 */
/** Cliente já vinculado à Omie (código válido). */
export function temClienteOmie(o: Oportunidade) {
  return Boolean(o.codigoClienteOmie && Number(o.codigoClienteOmie) > 0);
}

export function movimento(o: Oportunidade, destino: EtapaId): { ok: true; modal: ModalMovimento } | { ok: false; erro: string; precisaOmie?: boolean } {
  if (o.etapa === destino) return { ok: false, erro: '' };
  if (o.etapa === 'final') return { ok: false, erro: 'Oportunidade finalizada. Use “Reabrir oportunidade” no card.' };
  const de = ETAPAS.findIndex(e => e.id === o.etapa), para = ETAPAS.findIndex(e => e.id === destino);
  if (para < de) return { ok: true, modal: 'voltar' };          // voltar etapa: pede justificativa
  // Avançar no funil exige cliente na Omie (pode criar a OP sem Omie, mas não segue sem cadastrar).
  if (!temClienteOmie(o)) {
    return {
      ok: false,
      erro: 'Para avançar, cadastre ou vincule o cliente na Omie.',
      precisaOmie: true,
    };
  }
  if (destino === 'montado') return { ok: true, modal: 'montado' };
  if (destino === 'enviado') return { ok: true, modal: 'envio' };
  if ((destino === 'acao2' || destino === 'acao3') && !valorPrincipal(o)) return { ok: false, erro: 'Registre o envio da proposta (com o valor) antes de agendar ações.' };
  if (destino === 'acao2') return { ok: true, modal: 'agendar2' };
  if (destino === 'acao3') return { ok: true, modal: 'agendar3' };
  if (destino === 'aprovado') {
    if (!valorPrincipal(o)) return { ok: false, erro: 'Registre o envio da proposta (com o valor) antes de marcar como aprovado.' };
    return { ok: true, modal: 'aprovado' };
  }
  return { ok: true, modal: 'final' };
}

/** Ao VOLTAR uma etapa: limpa o que não vale mais */
export function aplicarVolta(o: Oportunidade, destino: EtapaId, hoje = hojeISO()): void {
  o.etapa = destino; o.desde = hoje; delete o.aprov;
  if (destino === 'acao2' && o.acao) o.acao.n = 2; else if (destino !== 'acao3') delete o.acao;
}

/* ============================== VALIDAÇÕES DOS MODAIS ============================== */
// Cada função devolve a mensagem de erro (exibida em vermelho no modal) ou '' se estiver ok.

/** Orçamento montado: nº do orçamento OU arquivo anexado */
export const validarMontado = (p: { orc: string; temArquivo: boolean }) =>
  !p.temArquivo && !p.orc.trim() ? 'Informe o nº do orçamento ou anexe o arquivo.' : '';

/** Envio ao cliente (1ª ação) */
export function validarEnvio(o: Oportunidade, p: { temArquivoNovo: boolean; tv: TipoVenda; mensal: number; total: number; obs: string }) {
  if (ANEXO_OBRIGATORIO_NO_ENVIO && !p.temArquivoNovo && !(o.docs || []).length) return 'Anexe o orçamento ou a proposta enviada.';
  if (p.tv === 'recorrente' ? !p.mensal : !p.total) return p.tv === 'recorrente' ? 'Informe o valor mensal do contrato.' : 'Informe o valor total da venda.';
  if (!p.obs.trim()) return 'Escreva uma observação sobre o envio.';
  return '';
}

/** Agendar 2ª/3ª ação. Se a ação anterior ainda não teve resultado, ele é obrigatório. */
export function validarAgendamento(o: Oportunidade, modo: 'mover' | 'reagendar', p: { resultadoAnterior?: string; tipo?: string; data?: string; motivoReagendar?: string }) {
  const pedeResultado = modo === 'mover' && o.acao && !o.acao.feita;
  const reag = modo === 'reagendar' && o.acao && !o.acao.feita;
  if (pedeResultado && !p.resultadoAnterior?.trim()) return 'Descreva o resultado da ação anterior.';
  if (!p.tipo) return 'Escolha a ação.';
  if (!p.data) return 'Informe a data.';
  if (reag && !p.motivoReagendar?.trim()) return 'Informe o motivo do reagendamento.';
  return '';
}
/** Data sugerida para a ação (dias úteis) */
export const dataSugeridaAcao = (n: 2 | 3, hoje = hojeISO()) => addUteis(PROX_PADRAO[n === 2 ? 'acao2' : 'acao3'], hoje);
/** Previsão sugerida para receber a assinatura (dias úteis) */
export const dataSugeridaAprovado = (hoje = hojeISO()) => addUteis(PRAZO_APROVADO, hoje);

/** Registrar resultado da ação: próximo passo = 'acao3' (só na 2ª) | 'final' | 'aguardar' */
export const validarResultado = (p: { resultado: string; proximo?: string }) =>
  !p.resultado.trim() ? 'Descreva o resultado.' : !p.proximo ? 'Escolha o próximo passo.' : '';

/** Cliente aprovou / alterar previsão */
export const validarAprovado = (p: { prev: string; obs: string; soPrevisao: boolean }) =>
  !p.prev ? 'Informe a previsão.' : p.soPrevisao && !p.obs.trim() ? 'Informe o motivo.' : '';

/** Documento obrigatório para FECHAR: contrato (recorrente) ou aceite (execução) */
export const documentoFechamento = (o: Oportunidade) => isRecorrente(o)
  ? { etiqueta: 'Contrato assinado', curto: 'o contrato assinado', dica: 'Contrato de prestação de serviço assinado pelo cliente (assinatura física digitalizada ou digital).' }
  : { etiqueta: 'Aceite do cliente', curto: 'o aceite do cliente', dica: 'Proposta/orçamento com o “de acordo” do cliente, e-mail ou print do WhatsApp aprovando, ou pedido de compra.' };

/** Finalizar */
export function validarFinal(o: Oportunidade, p: { st?: 'ganho' | 'perdido'; temArquivoNovo: boolean; motivo: string; obs: string }) {
  if (!p.st) return 'Escolha Fechado ou Não fechado.';
  const doc = documentoFechamento(o);
  if (p.st === 'ganho' && !p.temArquivoNovo && !(o.docs || []).some(d => d.etiqueta === doc.etiqueta)) return `Para finalizar como Fechado, anexe ${doc.curto}.`;
  if (p.st === 'perdido' && !p.motivo) return 'Informe o motivo de não ter fechado.';
  if (p.st === 'perdido' && p.motivo === 'Outro' && !p.obs.trim()) return 'Para “Outro”, descreva o motivo na observação.';
  return '';
}

/* ============================== EQUIPE E COMISSÃO ============================== */
/** Responsável + auxiliares + apoio técnico */
export function equipe(o: Oportunidade): { nome: string; papel: Papel }[] {
  return [{ nome: o.vendedor, papel: 'responsavel' as Papel }]
    .concat((o.aux || []).filter(n => n !== o.vendedor).map(n => ({ nome: n, papel: 'auxiliar' as Papel })))
    .concat((o.apoio || []).map(n => ({ nome: n, papel: 'apoio' as Papel })));
}

/**
 * Comissão (regras gravadas no fechamento: o.comRegras; se não houver, as vigentes):
 *  - responsável = só a comissão de VENDA
 *  - comissão de EQUIPE = dividida só entre auxiliares e apoio técnico, pelos PESOS (sem participantes, não é paga)
 *  - execução: base = valor total, paga UMA vez, no mês do fechamento
 *  - recorrente: base = valor mensal, paga TODO MÊS enquanto o contrato estiver vigente
 *      (parcelas = prazo em meses; 0 = sem prazo, até registrar o encerramento) + implantação uma vez na 1ª, se configurado
 */
/** Tipo de contrato da oportunidade recorrente (o escolhido, ou o sugerido pelo serviço, ou o 1º da lista) */
export function contratoDe(o: Oportunidade, R: RegrasComissao): TipoContrato {
  const L = R.contratos && R.contratos.length ? R.contratos : COMISSAO_PADRAO.contratos;
  return L.find(t => t.id === o.modalidade) || L.find(t => t.id === CONTRATO_POR_SERVICO[o.servico]) || L[0];
}

export function calcComissao(o: Oportunidade, vigentes: RegrasComissao): CalculoComissao {
  const RG = o.comRegras || vigentes, rec = isRecorrente(o), pesos = RG.pesos || ({} as RegrasComissao['pesos']);
  const tc = rec ? contratoDe(o, RG) : null, unica = !rec || tc!.modo === 'primeira', r = rec ? tc! : RG.execucao;
  const mensal = rec ? +o.valor || 0 : 0, impl = rec && RG.recorrente?.implantacao ? +(o.total || 0) : 0;
  const base = rec ? mensal : +(o.total || 0), parcelas = unica ? 1 : +o.prazo || 0, inicio = rec ? +(RG.recorrente?.inicio || 0) : 0;
  const baseTxt = !rec ? 'valor total da venda'
    : unica ? `${r.venda}% da 1ª parcela de ${brl(mensal)} (${tc!.nome}) · uma vez${impl ? ' + implantação ' + brl(impl) : ''}`
    : `${brl(mensal)}/mês · ${parcelas ? parcelas + ' parcelas (prazo do contrato)' : 'enquanto o contrato estiver vigente'} (${tc!.nome})${impl ? ' + implantação ' + brl(impl) + ' na 1ª' : ''}`;
  const eq = equipe(o), peso = (p: { papel: Papel }) => (p.papel === 'responsavel' ? 0 : +pesos[p.papel] || 0);
  const somaPesos = eq.reduce((a, p) => a + peso(p), 0), fr = (p: { papel: Papel }) => (somaPesos ? peso(p) / somaPesos : 0);
  const pv = +r.venda || 0, pe = +r.equipe || 0, venda = base * pv / 100, pool = base * pe / 100;
  const pessoas: ComissaoPessoa[] = eq.map(p => {
    const resp = p.papel === 'responsavel', v = resp ? venda : 0, e = pool * fr(p);
    return { ...p, venda: v, equipe: e, total: v + e, implVenda: resp ? impl * pv / 100 : 0, implEquipe: impl * pe / 100 * fr(p) };
  });
  return { rec, unica, contrato: tc ? tc.nome : '', impl, parcelas, inicio, base, baseTxt, pVenda: pv, pEquipe: pe, venda, pool, pessoas };
}

/* ---------- meses (AAAA-MM) ---------- */
export const mesDe = (iso: string) => String(iso || '').slice(0, 7);
export const mesAdd = (m: string, n: number) => { const [y, mm] = m.split('-').map(Number), t = y * 12 + (mm - 1) + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
export const mesesEntre = (a: string, b: string) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
export const mesesDoPeriodo = (P: { de: string; ate: string }) => { const out: string[] = []; let m = mesDe(P.de); const fim = mesDe(P.ate); while (m <= fim && out.length < 240) { out.push(m); m = mesAdd(m, 1); } return out; };

/** Nº da parcela do contrato recorrente no mês (0 = não paga nesse mês). Para depois do prazo ou do encerramento. */
export function parcelaNoMes(o: Oportunidade, c: CalculoComissao, mes: string): number {
  const ini = mesAdd(mesDe(o.res!.data), c.inicio), k = mesesEntre(ini, mes);
  if (k < 0 || (c.parcelas && k >= c.parcelas)) return 0;
  if (o.contrato?.fim && mes > mesDe(o.contrato.fim)) return 0;
  return k + 1;
}
export function situacaoContrato(o: Oportunidade, c: CalculoComissao, mes: string) {
  const ini = mesAdd(mesDe(o.res!.data), c.inicio), fim = c.parcelas ? mesAdd(ini, c.parcelas - 1) : '', k = parcelaNoMes(o, c, mes);
  if (o.contrato?.fim && mes > mesDe(o.contrato.fim)) return { ini, fim, k, txt: 'Encerrado em ' + fdata(o.contrato.fim), cls: 'red' as const };
  if (c.unica) return { ini, fim, k, txt: mes === ini ? 'Comissão única neste mês' : 'Comissão única (paga em ' + ini + ')', cls: mes === ini ? 'grn' as const : '' as const };
  if (mes < ini) return { ini, fim, k, txt: 'Começa em ' + mes, cls: '' as const };
  if (fim && mes > fim) return { ini, fim, k, txt: 'Concluído', cls: '' as const };
  return { ini, fim, k, txt: 'Vigente', cls: 'grn' as const };
}

/**
 * Quem vê o quê: Administrador / Financeiro (permissão "Comissões") vê todo mundo;
 * os demais só as oportunidades em que participam e só as PRÓPRIAS comissões (relatórios e comissões).
 * No back-end oficial, aplicar este filtro também no servidor.
 */
export const escopo = (L: Oportunidade[], eu: string, verTudo: boolean) => (verTudo ? L : L.filter(o => equipe(o).some(p => p.nome === eu)));

/** Lançamentos de comissão nos meses informados (pessoa × oportunidade × mês) */
export function lancamentos(L: Oportunidade[], meses: string[], R: RegrasComissao, eu: string, verTudo: boolean): LancamentoComissao[] {
  const out: LancamentoComissao[] = [];
  L.filter(o => o.res?.st === 'ganho' && o.res.data).forEach(o => {
    const c = calcComissao(o, R);
    meses.forEach(mes => {
      let k = 0;
      if (!c.rec) { if (mesDe(o.res!.data) !== mes) return; } else { k = parcelaNoMes(o, c, mes); if (!k) return; }
      c.pessoas.forEach(p => {
        if (!verTudo && p.nome !== eu) return;
        let venda = p.venda, eqp = p.equipe, desc = !c.rec ? 'Venda fechada' : c.unica ? `${c.pVenda}% da 1ª parcela (${c.contrato})` : `Parcela ${k}/${c.parcelas || '—'}`;
        if (c.rec && k === 1 && (p.implVenda || p.implEquipe)) { venda += p.implVenda; eqp += p.implEquipe; desc += ' + implantação'; }
        if (!(venda + eqp)) return;
        out.push({ o, c, p, mes, k, tipo: c.unica || k === 1 ? 'novo' : 'rec', desc, venda, equipe: eqp, total: venda + eqp });
      });
    });
  });
  return out.sort((a, b) => a.mes.localeCompare(b.mes) || a.p.nome.localeCompare(b.p.nome) || a.o.res!.data.localeCompare(b.o.res!.data));
}

/** Soma por pessoa: comissão nova, recorrente e total (tela, Relatórios, Excel e "Pagamento do vendedor") */
export function porPessoa(lin: LancamentoComissao[]) {
  const m: Record<string, { nome: string; papeis: Set<string>; novo: number; rec: number; venda: number; equipe: number; contratos: Set<string | number>; vendas: Set<string | number> }> = {};
  lin.forEach(l => {
    const x = (m[l.p.nome] = m[l.p.nome] || { nome: l.p.nome, papeis: new Set(), novo: 0, rec: 0, venda: 0, equipe: 0, contratos: new Set(), vendas: new Set() });
    x.papeis.add(PAPEIS[l.p.papel]); if (l.tipo === 'novo') x.novo += l.total; else x.rec += l.total;
    x.venda += l.venda; x.equipe += l.equipe; (l.c.rec ? x.contratos : x.vendas).add(l.o.id);
  });
  return Object.values(m).map(x => ({ nome: x.nome, papeis: [...x.papeis].join(', '), novo: x.novo, rec: x.rec, venda: x.venda, equipe: x.equipe, contratos: x.contratos.size, vendas: x.vendas.size, total: x.novo + x.rec }))
    .sort((a, b) => b.total - a.total);
}

/* ============================== FILTROS ============================== */
export interface Filtros { busca?: string; vendedor?: string; servico?: string; tipo?: TipoVenda | ''; soAtrasados?: boolean }
export function filtrar(L: Oportunidade[], f: Filtros, hoje = hojeISO()) {
  const b = (f.busca || '').trim().toLowerCase();
  return L.filter(o => {
    if (f.vendedor && o.vendedor !== f.vendedor && !(o.aux || []).includes(f.vendedor)) return false;   // responsável OU auxiliar
    if (f.servico && o.servico !== f.servico) return false;
    if (f.tipo && tipoVenda(o) !== f.tipo) return false;
    if (b && ![o.cliente, o.cidade, o.cod, o.os, o.contato].join(' ').toLowerCase().includes(b)) return false;
    if (f.soAtrasados && !alerta(o, hoje).late) return false;
    return true;
  });
}
/** Coluna Finalizado: '30' (padrão, últimos 30 dias) | 'ganho' | 'perdido' | 'todos' */
export function filtrarFinalizados(L: Oportunidade[], modo: '30' | 'ganho' | 'perdido' | 'todos', hoje = hojeISO()) {
  return L.filter(o => o.etapa === 'final').filter(o =>
    modo === 'ganho' ? o.res?.st === 'ganho' : modo === 'perdido' ? o.res?.st === 'perdido' : modo === '30' ? !!o.res && diasAte(o.res.data, hoje) >= -30 : true,
  ).sort((a, b) => (b.res?.data || '').localeCompare(a.res?.data || ''));
}

/* ============================== PAINEL (KPIs do topo) ============================== */
export function kpisPainel(L: Oportunidade[], hoje = hojeISO()) {
  const abertos = L.filter(o => o.etapa !== 'final');
  const negociacao = L.filter(o => NEGOCIACAO.includes(o.etapa));
  const aprovados = L.filter(o => o.etapa === 'aprovado');
  const pendencias = L.filter(o => o.etapa !== 'final' && alerta(o, hoje).late);
  const fin30 = L.filter(o => o.etapa === 'final' && o.res && diasAte(o.res.data, hoje) >= -30);
  const g = fin30.filter(o => o.res!.st === 'ganho');
  return {
    abertos: abertos.length, abertosExe: abertos.filter(o => !isRecorrente(o)).length, abertosRec: abertos.filter(isRecorrente).length,
    negociacaoExe: somaExecucao(negociacao), negociacaoRec: somaRecorrente(negociacao),
    fechadoExe30: somaExecucao(g), fechadoRec30: somaRecorrente(g), qtdExe30: g.filter(o => !isRecorrente(o)).length, qtdRec30: g.filter(isRecorrente).length,
    aprovados: aprovados.length, aprovadosExe: somaExecucao(aprovados), aprovadosRec: somaRecorrente(aprovados),
    pendencias: pendencias.length,
    conversao30: fin30.length ? Math.round(g.length / fin30.length * 100) : 0, ganhos30: g.length, finalizados30: fin30.length,
  };
}
/** Soma do cabeçalho da coluna */
export const somaColuna = (L: Oportunidade[]) => ({ exe: somaExecucao(L), rec: somaRecorrente(L) });

/* ============================== RELATÓRIOS (por período) ============================== */
export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/** mes = 'AAAA-MM' ou 'custom' (usa de/ate) */
export function periodo(mes: string, de = '', ate = '') {
  if (mes !== 'custom') {
    const [y, m] = mes.split('-').map(Number), ult = new Date(y, m, 0).getDate();
    return { de: `${mes}-01`, ate: `${mes}-${String(ult).padStart(2, '0')}`, nome: `${MESES[m - 1]}/${y}` };
  }
  return { de: de || '2000-01-01', ate: ate || '2100-12-31', nome: `${fdata(de)} a ${fdata(ate)}` };
}
export const dataCriacao = (o: Oportunidade) => o.criado || o.hist[0]?.data || o.desde;
export const situacaoTxt = (o: Oportunidade) => (o.res ? (o.res.st === 'ganho' ? 'Fechado' : 'Não fechado') : etapaInfo(o.etapa).nome);

/**
 * Relatório comercial do período. Regras:
 *  - "novas" = criadas no período; "fechadas"/"não fechadas" = data do resultado no período
 *  - conversão = fechadas ÷ (fechadas + não fechadas) do período
 *  - "em andamento" = foto de hoje (não depende do período)
 *  - passar L já filtrado por escopo(L, eu, verTudo): quem não é Administrador/Financeiro vê só as oportunidades em que participa
 *  - comissões do período: porPessoa(lancamentos(L, mesesDoPeriodo(P), R, eu, verTudo))
 */
export function relatorio(L: Oportunidade[], P: { de: string; ate: string }, vendedores: string[]) {
  const dentro = (d?: string) => !!d && d >= P.de && d <= P.ate;
  const novas = L.filter(o => dentro(dataCriacao(o)));
  const fech = L.filter(o => o.res?.st === 'ganho' && dentro(o.res.data));
  const perd = L.filter(o => o.res?.st === 'perdido' && dentro(o.res.data));
  const aprov = L.filter(o => o.etapa === 'aprovado');
  const andamento = L.filter(o => o.etapa !== 'final');
  const lista = [...new Set([...novas, ...fech, ...perd])].sort((a, b) => dataCriacao(a).localeCompare(dataCriacao(b)));
  const fin = fech.length + perd.length, conv = fin ? Math.round(fech.length / fin * 100) : 0;
  const tipos = (Object.keys(TIPOS_VENDA) as TipoVenda[]).map(id => {
    const t = TIPOS_VENDA[id], f = (x: Oportunidade[]) => x.filter(o => tipoVenda(o) === id), rec = id === 'recorrente';
    const val = (x: Oportunidade[]) => (rec ? somaRecorrente(x) : somaExecucao(x));
    const fe = f(fech), pe = f(perd), n = fe.length + pe.length;
    return { id, nome: t.nome, rec, novas: f(novas).length, fech: fe.length, perd: pe.length, conv: n ? Math.round(fe.length / n * 100) : 0, valor: val(fe), perdido: val(pe) };
  });
  const vends = vendedores.map(v => {
    const r = (x: Oportunidade[]) => x.filter(o => o.vendedor === v);
    const fe = r(fech), pe = r(perd), n = fe.length + pe.length;
    return { nome: v, novas: r(novas).length, andamento: r(andamento).length, fech: fe.length, perd: pe.length, conv: n ? Math.round(fe.length / n * 100) : 0, exe: somaExecucao(fe), rec: somaRecorrente(fe) };
  });
  const mot: Record<string, number> = {}; perd.forEach(o => { mot[o.res!.motivo] = (mot[o.res!.motivo] || 0) + 1; });
  const motivos = Object.entries(mot).sort((a, b) => b[1] - a[1]);
  return { novas, fech, perd, aprov, andamento, lista, conv, tipos, vends, motivos };
}

/**
 * Aba Comissões — mês de competência (AAAA-MM).
 *  - pessoas: nova + recorrente + total do mês por pessoa · lin: lançamentos do mês
 *  - contratos: carteira de contratos recorrentes (parcela no mês, término, situação)
 *  - previsao: se fecharem as oportunidades em seguimento hoje (execução uma vez · recorrente por mês)
 *  - "Pagamento do vendedor" = lin filtrado por pessoa (novas + recorrentes + total a pagar)
 */
export function comissoesMes(L: Oportunidade[], mes: string, R: RegrasComissao, eu: string, verTudo: boolean) {
  const lin = lancamentos(L, [mes], R, eu, verTudo), pessoas = porPessoa(lin);
  const meu = escopo(L, eu, verTudo);
  const contratos = meu.filter(o => o.res?.st === 'ganho' && isRecorrente(o)).map(o => {
    const c = calcComissao(o, R), s = situacaoContrato(o, c, mes);
    return { o, c, s, mensal: c.pessoas.filter(p => verTudo || p.nome === eu).reduce((a, p) => a + p.total, 0) };
  });
  const prev: Record<string, { exe: number; rec: number }> = {};
  meu.filter(o => SEGUIMENTO.includes(o.etapa)).forEach(o => {
    const c = calcComissao(o, R);
    c.pessoas.forEach(p => { if (!verTudo && p.nome !== eu) return; const x = (prev[p.nome] = prev[p.nome] || { exe: 0, rec: 0 }); if (c.rec && !c.unica) x.rec += p.total; else x.exe += p.total; });
  });
  const soma = (k: 'novo' | 'rec' | 'total') => pessoas.reduce((a, p) => a + p[k], 0);
  return { mes, lin, pessoas, contratos, previsao: Object.entries(prev).filter(([, v]) => v.exe || v.rec), totalNovo: soma('novo'), totalRec: soma('rec'), total: soma('total') };
}

/** Pagamento do vendedor no mês: novas, recorrentes e total a pagar */
export function pagamentoVendedor(L: Oportunidade[], mes: string, R: RegrasComissao, pessoa: string) {
  const lin = lancamentos(L, [mes], R, pessoa, false), novas = lin.filter(l => l.tipo === 'novo'), recorrentes = lin.filter(l => l.tipo === 'rec');
  const tN = novas.reduce((a, l) => a + l.total, 0), tR = recorrentes.reduce((a, l) => a + l.total, 0);
  return { pessoa, mes, novas, recorrentes, totalNovo: tN, totalRec: tR, totalAPagar: tN + tR };
}

/* ============================== LEITURA DE VALORES DO DOCUMENTO ============================== */
/** Converte "1.234,56" / "1234,56" / "1,234.56" / "1234.56" em número */
export function numBR(s: string): number {
  s = s.replace(/[^\d.,]/g, ''); const i = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  if (i < 0 || s.length - i - 1 !== 2) return +s.replace(/[.,]/g, '');
  return +(s.slice(0, i).replace(/[.,]/g, '') + '.' + s.slice(i + 1));
}
const RE_VAL = /(?:R\$\s*)?(\d{1,3}(?:[.,]\d{3})+[.,]\d{2}|\d+[.,]\d{2})(?![\d%])/g;

/**
 * Lê o TEXTO de um orçamento/proposta (PDF, Word ou Excel já convertidos em texto — ver leitor-documento.ts)
 * e encontra: valor mensal, valor total, nº do orçamento, prazo (meses) e validade.
 * Os campos são só SUGERIDOS (ficam amarelos na tela); o usuário confere e pode alterar.
 * Se achar valor mensal, sugere tipo de venda = recorrente.
 */
export function extrairValores(txt: string, hoje = hojeISO()): ValoresLidos {
  const L = txt.split('\n'), r: ValoresLidos = { trecho: {} };
  const vals = (s: string) => [...s.matchAll(RE_VAL)].map(m => numBR(m[1])).filter(v => v > 0);
  const comValor = (i: number) => { let v = vals(L[i]); if (!v.length && L[i + 1]) v = vals(L[i + 1]); return v; };
  const mensais: { v: number; l: string }[] = [], totais: { v: number; l: string; pri: boolean }[] = [];
  L.forEach((l, i) => {
    if (/mensal|mensalidade|por m[eê]s|\/\s*m[eê]s|loca[cç][aã]o|comodato/i.test(l)) { const v = comValor(i); if (v.length) mensais.push({ v: v[v.length - 1], l }); }
    else if (/total/i.test(l)) {
      const v = comValor(i);
      if (v.length) totais.push({ v: v[v.length - 1], l, pri: /total\s*geral|valor\s*total|total\s*(do|da)\s*(or[cç]amento|proposta|pedido)|total\s*a\s*pagar|total\s*final/i.test(l) });
    }
  });
  if (mensais.length) { const m = mensais[mensais.length - 1]; r.mensal = m.v; r.trecho.mensal = m.l; }
  if (totais.length) {
    const pri = totais.filter(t => t.pri), t = pri.length ? pri[pri.length - 1] : totais.reduce((a, b) => (b.v > a.v ? b : a));
    r.total = t.v; r.trecho.total = t.l;
  }
  const orc = txt.match(/ORC[-\s]?\d{4}[-\s]?\d{3,6}/i) || txt.match(/(?:or[cç]amento|proposta(?:\s*comercial)?)\s*(?:n[ºo°.]*)?\s*[:#]?\s*(\d{3,})/i);
  if (orc) r.orc = /^ORC[-\s]?\d/i.test(orc[0]) ? orc[0].toUpperCase().replace(/\s/g, '-') : orc[1];
  const pz = txt.match(/(?:prazo|vig[eê]ncia|contrat)[^\n]{0,60}?\n?[^\n]{0,30}?(\d{1,3})\s*\(?[a-zç ]*\)?\s*meses/i);
  if (pz) r.prazo = +pz[1];
  const vd = txt.match(/validade[^\n]{0,40}?\n?[^\n]{0,20}?(\d{1,3})\s*\(?[a-zç ]*\)?\s*dias/i);
  const vdd = txt.match(/validade[^\n]{0,40}?\n?[^\n]{0,20}?(\d{2})\/(\d{2})\/(\d{4})/i);
  if (vdd) r.validade = `${vdd[3]}-${vdd[2]}-${vdd[1]}`; else if (vd) r.validade = addDias(+vd[1], hoje);
  return r;
}

/** Próximo código sequencial "OP-00032" (no back-end, gerar com sequência do banco para não repetir) */
export const proximoCodigo = (L: Oportunidade[]) => 'OP-' + String(Math.max(0, ...L.map(o => +o.cod.slice(3))) + 1).padStart(5, '0');
