/** Gerador .xlsx Ancora (planilha viva interno + orcamento cliente). */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck — portado do HTML de postos (OOXML + fórmulas).
export type XlsxReport = {
  tipo: "interno" | "cliente";
  titulo: string;
  data: string;
  info: Array<[string, string | number, string?]>;
  blocos: Array<
    | { titulo: string; lista: string[] }
    | { titulo: string; linhas: Array<Array<string | number>>; total: Array<string | number>; soma?: boolean }
  >;
  destaque: Array<[string, string | number]>;
  notas: string[];
};

export const XLSX_ANCORA = (function () {

  const enc = new TextEncoder();
  const CRC = (()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  const crc32 = b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
  function zip(files){ // files: [{name, data:Uint8Array}]
    const parts=[], central=[]; let off=0;
    for(const f of files){
      const nm=enc.encode(f.name), d=f.data, crc=crc32(d);
      const h=new DataView(new ArrayBuffer(30));
      h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(8,0,true);
      h.setUint16(10,0,true);h.setUint16(12,0x21,true);h.setUint32(14,crc,true);h.setUint32(18,d.length,true);h.setUint32(22,d.length,true);
      h.setUint16(26,nm.length,true);h.setUint16(28,0,true);
      parts.push(new Uint8Array(h.buffer),nm,d);
      const c=new DataView(new ArrayBuffer(46));
      c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint16(10,0,true);
      c.setUint16(12,0,true);c.setUint16(14,0x21,true);c.setUint32(16,crc,true);c.setUint32(20,d.length,true);c.setUint32(24,d.length,true);
      c.setUint16(28,nm.length,true);c.setUint32(42,off,true);
      central.push(new Uint8Array(c.buffer),nm);
      off+=30+nm.length+d.length;
    }
    const cs=central.reduce((a,b)=>a+b.length,0);
    const e=new DataView(new ArrayBuffer(22));
    e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,cs,true);e.setUint32(16,off,true);
    const all=[...parts,...central,new Uint8Array(e.buffer)];
    const out=new Uint8Array(all.reduce((a,b)=>a+b.length,0)); let p=0; for(const a of all){out.set(a,p);p+=a.length;} return out;
  }
  const x=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  // estilos: Ã­ndice em cellXfs
  const S={def:0,bold:1,title:2,kicker:3,head:4,cur:5,pct:6,totL:7,totCur:8,destL:9,destCur:10,note:11,lbl:12,destTxt:13,totPct:14,headR:15,txt:16,inCur:17,inPct:18,inNum:19,num:20,hint:21};
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/><numFmt numFmtId="165" formatCode="0.00%"/></numFmts>
<fonts count="8">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="16"/><color rgb="FF1D1813"/><name val="Calibri"/></font>
<font><b/><sz val="9"/><color rgb="FF7D6300"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFED706"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FFFED706"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF66615A"/><name val="Calibri"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1D1813"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDF3C4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFDCD9D2"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="22">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="7" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="5" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="6" fillId="2" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
<xf numFmtId="0" fontId="6" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="165" fontId="1" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="164" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="4" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="7" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

  // R: relatÃ³rio com valores numÃ©ricos. Linhas de bloco: [rÃ³tulo, nÃºmero, pct?]
  function build(R, logoB64){
    const rows=[]; // cada linha: array de cÃ©lulas {v, s, f}
    const C=(v,s,f)=>({v,s,f});
    rows.push([C('GRUPO Ã‚NCORA Â· POSTOS DE SERVIÃ‡O',S.kicker)]);
    rows.push([C(R.titulo+(R.tipo==='interno'?' (uso interno)':''),S.title)]);
    rows.push([C('Emitido em '+R.data,S.note)]);
    rows.push([]);
    R.info.forEach(([k,v,fmt])=>rows.push([C(k,S.lbl),C(v,typeof v==='number'?(fmt==='pct'?S.pct:S.cur):S.txt)]));
    rows.push([]);
    if(R.tipo==='cliente'){rows.push([C('Itens contemplados no valor do posto',S.bold)]);}
    R.blocos.forEach(b=>{
      if(b.lista){
        rows.push([C(b.titulo,S.head),C('',S.head)]);
        b.lista.forEach(i=>rows.push([C('â€¢  '+i,S.lbl),C('',S.lbl)]));
      } else {
        const tres=b.linhas[0].length>2;
        rows.push([C(b.titulo,S.head),C('Valor',S.headR)].concat(tres?[C('% preÃ§o',S.headR)]:[]));
        const ini=rows.length+1;
        b.linhas.forEach(l=>rows.push([C(l[0],S.lbl),C(l[1],S.cur)].concat(l.length>2&&l[2]!==''?[C(l[2],S.pct)]:[])));
        const fim=rows.length;
        const t=b.total;
        rows.push([C(t[0],S.totL),C(t[1],S.totCur,b.soma?`SUM(B${ini}:B${fim})`:null)].concat(tres?[C('',S.totL)]:[]));
      }
      rows.push([]);
    });
    R.destaque.forEach(([k,v])=>rows.push([C(k,S.destL),C(v,typeof v==='number'?S.destCur:S.destTxt)]));
    rows.push([]);
    R.notas.forEach(n=>rows.push([C(n,S.note)]));
    return writeBook(rows, R.tipo==='interno'?'Custo interno':'OrÃ§amento', logoB64);
  }
  function writeBook(rows, sheetName, logoB64){
    const col='ABCD';
    let sd='';
    rows.forEach((r,i)=>{
      const n=i+1; let cs='';
      r.forEach((c,j)=>{
        const ref=col[j]+n;
        if(typeof c.v==='number'){cs+=`<c r="${ref}" s="${c.s}">${c.f?`<f>${x(c.f)}</f>`:''}<v>${c.v}</v></c>`;}
        else cs+=`<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${x(c.v)}</t></is></c>`;
      });
      const ht=i===1?' ht="24" customHeight="1"':'';
      sd+=`<row r="${n}"${ht}>${cs}</row>`;
    });
    const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols><col min="1" max="1" width="52" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="11" customWidth="1"/><col min="4" max="4" width="40" customWidth="1"/></cols>
<sheetData>${sd}</sheetData>
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>
${logoB64?'<drawing r:id="rId1"/>':''}
</worksheet>`;
    const files=[];
    const add=(name,str)=>files.push({name,data:typeof str==='string'?enc.encode(str):str});
    add('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${logoB64?'<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>':''}
</Types>`);
    add('_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    add('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${x(sheetName)}" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
    add('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    add('xl/styles.xml',styles);
    add('xl/worksheets/sheet1.xml',sheet);
    if(logoB64){
      add('xl/worksheets/_rels/sheet1.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`);
      add('xl/drawings/drawing1.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>2</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="640080" cy="631000"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo Ã‚ncora"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="640080" cy="631000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`);
      add('xl/drawings/_rels/drawing1.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.jpeg"/></Relationships>`);
      const bin=atob(logoB64); const u=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
      add('xl/media/logo.jpeg',u);
    }
    return zip(files);
  }
  // Planilha interna "viva": parÃ¢metros editÃ¡veis + cÃ¡lculo todo em fÃ³rmulas
  function buildModelo(M, logoB64){
    const rows=[]; const A={};
    const C=(v,s,f)=>({v,s,f});
    const push=r=>{rows.push(r);return rows.length;};
    const blank=()=>push([]);
    const sec=t=>push([C(t,S.head),C('',S.headR),C('',S.headR),C('',S.head)]);
    const P=(k,lab,v,s,hint)=>{const n=push([C(lab,S.lbl),C(v,s),C('',S.lbl),C(hint||'',S.hint)]);A[k]='$B$'+n;return v;};
    const F=(k,lab,f,v,s)=>{const n=push([C(lab,S.lbl),C(v,s||S.cur,f),C('',S.lbl),C('',S.lbl)]);A[k]='B'+n;return v;};
    const T=(k,lab,f,v,s)=>{const n=push([C(lab,S.totL),C(v,s||S.totCur,f),C('',S.totL),C('',S.totL)]);A[k]='B'+n;return v;};
    const r2=v=>Math.round(v*1e6)/1e6;
    push([C('GRUPO Ã‚NCORA Â· POSTOS DE SERVIÃ‡O',S.kicker)]);
    push([C('Planilha de custo do posto (uso interno)',S.title)]);
    push([C('Emitido em '+M.data+' Â· cÃ©lulas amarelas sÃ£o editÃ¡veis e todo o resto recalcula',S.note)]);
    blank();
    M.info.forEach(([k,v])=>push([C(k,S.lbl),C(v,S.txt)]));
    blank();
    // ---------- ParÃ¢metros ----------
    sec('ParÃ¢metros do posto');
    const Sb=P('S','SalÃ¡rio base do colaborador',M.S,S.inCur);
    const n=P('n','Colaboradores no posto',M.n,S.inNum,'12x36: 2 por turno Â· 24 h: 4 Â· 44h: 1');
    const tu=P('tu','PlantÃµes por dia',M.turnos,S.inNum,'1 = 12 h Â· 2 = 24 h');
    const dias=P('dias','Dias por mÃªs',M.dias,S.inNum);
    const div=P('div','Divisor de horas',M.divisor,S.inNum);
    const gr=P('grat','GratificaÃ§Ã£o (% do salÃ¡rio)',M.grat,S.inPct);
    const pe=P('peric','Periculosidade (% do salÃ¡rio)',M.peric,S.inPct);
    const hn=P('hn','Horas noturnas por mÃªs',M.horasNot,S.inNum,'0 para posto diurno');
    const fn=P('fn','Fator do adicional noturno',M.fatorNot,S.inNum);
    const hi=P('hi','Intervalo indenizado (h por plantÃ£o)',M.intervaloH,S.inNum,'0 para jornada comercial');
    const mh=P('mh','Multiplicador da hora do intervalo',M.multHE,S.inNum);
    const hx=P('hx','Horas extras adicionais (h/mÃªs, total do posto)',M.heH||0,S.inNum,'horas alÃ©m da escala');
    const hp=P('hp','Adicional das horas extras',M.hePct,S.inPct);
    blank(); sec('BenefÃ­cios e insumos (valores unitÃ¡rios)');
    const vr=P('vr','Vale-refeiÃ§Ã£o (R$ por dia)',M.vr,S.inCur,'0 = sem vale-refeiÃ§Ã£o');
    const vt=P('vt','Vale-transporte: tarifa (R$)',M.vtTarifa,S.inCur,'0 = sem vale-transporte');
    const vv=P('vv','Vale-transporte: viagens por plantÃ£o',M.vtViagens,S.inNum);
    const ce=P('ce','Cesta bÃ¡sica (R$ por colaborador)',M.cesta,S.inCur);
    const sa=P('sa','SaÃºde ocupacional (R$ por colaborador)',M.saude,S.inCur);
    const se=P('se','Seguro de vida (R$ por colaborador)',M.seguro,S.inCur);
    const rc=P('rc','Curso de reciclagem (R$ a cada 24 meses)',M.recic,S.inCur);
    const pf=P('pf','PPR fixo (R$ por ano por colaborador)',M.ppr,S.inCur,'usado quando o % abaixo for 0');
    const pp=P('pp','PPR como % do salÃ¡rio (por ano)',M.pprPct,S.inPct);
    const pa=P('pa','PrÃªmio assiduidade (R$ por colaborador)',M.premio,S.inCur);
    const mo=P('mo','Moto (R$ por mÃªs por unidade)',M.moto,S.inCur);
    const mq=P('mq','Quantidade de motos',M.motos,S.inNum);
    const un=P('un','Uniformes / equip. / supervisÃ£o (% do custo)',M.unif,S.inPct);
    blank();
    const real=M.regime==='real';
    let fg,ins,mu,di,dc,df,pc,is,cb,ib,mg,ir,cs,es,sdi,sl,st,si;
    if(real){
      sec('Encargos e preÃ§o â€“ Lucro Real');
      fg=P('fg','FGTS',M.fgts,S.inPct); ins=P('ins','INSS + RAT + Terceiros',M.inss,S.inPct); mu=P('mu','Multa do FGTS',M.multa,S.inPct);
      di=P('di','Despesas indiretas (% do preÃ§o)',M.lrDI,S.inPct); dc=P('dc','Despesa comercial (% do preÃ§o)',M.lrDC,S.inPct); df=P('df','Despesa financeira (% do preÃ§o)',M.lrDF,S.inPct);
      pc=P('pc','PIS + COFINS',M.lrPis,S.inPct); is=P('is','ISS',M.lrIss,S.inPct); cb=P('cb','CBS (reforma tributÃ¡ria)',M.lrCbs,S.inPct); ib=P('ib','IBS (reforma tributÃ¡ria)',M.lrIbs,S.inPct);
      mg=P('mg','Margem esperada (% do preÃ§o)',M.margem,S.inPct); ir=P('ir','IRPJ sobre a margem',M.irpj,S.inPct); cs=P('cs','CSLL sobre a margem',M.csll,S.inPct);
    } else {
      sec('Encargos e preÃ§o â€“ Simples Nacional');
      es=P('es','Encargos sociais (% da remuneraÃ§Ã£o)',M.encS,S.inPct); sdi=P('sdi','Despesas indiretas â€“ X (% do custo)',M.sDI,S.inPct); sl=P('sl','Lucro â€“ Y',M.margem,S.inPct);
      st=P('st','Simples: PIS/COFINS/IRPJ/CSLL/CPP',M.simpTrib,S.inPct); si=P('si','Simples: ISS',M.simpIss,S.inPct);
    }
    const fd=P('fd','Fator de dias de prestaÃ§Ã£o',M.fatorDias,S.inNum,'1 = seg. a dom. Â· 0,7143 = seg. a sex.');
    const dd=P('dd','Dias para o valor diÃ¡rio',M.divDiario,S.inNum);
    const qt=P('qt','Quantidade de postos',M.qtd,S.inNum);
    blank();
    // ---------- RemuneraÃ§Ã£o ----------
    sec('RemuneraÃ§Ã£o');
    const vSal=F('sal','SalÃ¡rios',`${A.S}*${A.n}`,r2(Sb*n));
    const vGr=F('gr','GratificaÃ§Ã£o',`${A.sal}*${A.grat}`,r2(vSal*gr));
    const vPe=F('pe','Periculosidade',`${A.sal}*${A.peric}`,r2(vSal*pe));
    const base=`(${A.sal}+${A.gr}+${A.pe})/${A.n}/${A.div}`; const vBase=(vSal+vGr+vPe)/n/div;
    const vAn=F('an','Adicional noturno',`${A.hn}*${base}*${A.fn}`,r2(hn*vBase*fn));
    const vHe=F('he','Intervalo intrajornada (HE)',`${base}*${A.mh}*${A.hi}*${A.dias}*${A.tu}`,r2(vBase*mh*hi*dias*tu));
    const vHx=F('hx1','Horas extras adicionais',`${base}*(1+${A.hp})*${A.hx}`,r2(vBase*(1+hp)*hx));
    const R=vSal+vGr+vPe+vAn+vHe+vHx;
    const remI=rows.length-5; T('rem','Subtotal remuneraÃ§Ã£o',`SUM(B${remI}:B${rows.length})`,r2(R));
    blank();
    // ---------- Encargos ----------
    let E=0;
    if(real){
      sec('Encargos e provisÃµes');
      const i0=rows.length+1;
      const vFg=F('efg','FGTS',`${A.rem}*${A.fg}`,R*fg);
      const vIn=F('ein','INSS + RAT + Terceiros',`${A.rem}*${A.ins}`,R*ins);
      const vFe=F('efe','FÃ©rias 1/12',`${A.rem}/12`,R/12);
      const vTe=F('ete','1/3 de fÃ©rias',`${A.efe}/3`,R/36);
      const vDe=F('ede','13Âº salÃ¡rio 1/12',`${A.rem}/12`,R/12);
      const vAv=F('eav','Aviso prÃ©vio 1/12',`${A.rem}/12`,R/12);
      const prov=`(${A.efe}+${A.ete}+${A.ede}+${A.eav})`; const vProv=vFe+vTe+vDe+vAv;
      const vFp=F('efp','FGTS sobre provisÃµes',`${prov}*${A.fg}`,vProv*fg);
      const vMu=F('emu','Multa do FGTS',`(${A.efg}+${A.efp})*${A.mu}`,(vFg+vFp)*mu);
      const vIp=F('eip','INSS + RAT + Terceiros sobre provisÃµes',`${prov}*${A.ins}`,vProv*ins);
      E=vFg+vIn+vProv+vFp+vMu+vIp;
      T('enc','Subtotal encargos e provisÃµes',`SUM(B${i0}:B${rows.length})`,r2(E));
    } else {
      sec('Encargos sociais');
      E=R*es; F('es1','Encargos sociais',`${A.rem}*${A.es}`,E);
      T('enc','Subtotal encargos',`${A.es1}`,r2(E));
    }
    blank();
    // ---------- BenefÃ­cios ----------
    sec('BenefÃ­cios e insumos');
    const b0=rows.length+1;
    const bVr=F('bvr','Vale-refeiÃ§Ã£o',`${A.vr}*${A.dias}*${A.tu}`,vr*dias*tu);
    const bVt=F('bvt','Vale-transporte (desconta 6% do salÃ¡rio)',`IF(${A.vt}=0,0,MAX(0,${A.vt}*${A.vv}*${A.dias}*${A.tu}-0.06*${A.sal}))`,vt===0?0:Math.max(0,vt*vv*dias*tu-0.06*vSal));
    const bCe=F('bce','Cesta bÃ¡sica',`${A.ce}*${A.n}`,ce*n);
    const bSa=F('bsa','SaÃºde ocupacional',`${A.sa}*${A.n}`,sa*n);
    const bSe=F('bse','Seguro de vida',`${A.se}*${A.n}`,se*n);
    const bRc=F('brc','Curso de reciclagem',`${A.rc}*${A.n}/24`,rc*n/24);
    const bPp=F('bpp','PPR / PLR',`IF(${A.pp}>0,${A.S}*${A.pp},${A.pf})*${A.n}/12`,(pp>0?Sb*pp:pf)*n/12);
    const bPa=F('bpa','PrÃªmio assiduidade',`${A.pa}*${A.n}`,pa*n);
    const bMo=F('bmo','Moto',`${A.mo}*${A.mq}`,mo*mq);
    const semU=R+E+bVr+bVt+bCe+bSa+bSe+bRc+bPp+bPa+bMo;
    const bUn=F('bun','Uniformes / equip. / supervisÃ£o',`(${A.rem}+${A.enc}+SUM(B${b0}:B${rows.length}))*${A.un}/(1-${A.un})`,semU*un/(1-un));
    const Bt=semU-R-E+bUn;
    T('ben','Subtotal benefÃ­cios e insumos',`SUM(B${b0}:B${rows.length})`,r2(Bt));
    blank();
    const custo=R+E+Bt;
    T('custo','CUSTO TOTAL DO POSTO',`${A.rem}+${A.enc}+${A.ben}`,r2(custo));
    blank();
    // ---------- PreÃ§o ----------
    sec('FormaÃ§Ã£o do preÃ§o');
    let preco, liq;
    if(real){
      const soma=di+dc+df+pc+is+mg; const p=custo/(1-soma);
      F('pp1','PreÃ§o antes de CBS/IBS',`${A.custo}/(1-(${A.di}+${A.dc}+${A.df}+${A.pc}+${A.is}+${A.mg}))`,p);
      F('pdi','Despesas indiretas, comerciais e financeiras',`${A.pp1}*(${A.di}+${A.dc}+${A.df})`,p*(di+dc+df));
      F('ppc','PIS / COFINS',`${A.pp1}*${A.pc}`,p*pc);
      F('pis','ISS',`${A.pp1}*${A.is}`,p*is);
      F('pcb','CBS + IBS',`${A.pp1}*(${A.cb}+${A.ib})`,p*(cb+ib));
      const lucro=p*mg; F('pmg','Margem bruta',`${A.pp1}*${A.mg}`,lucro);
      F('pir','(âˆ’) IRPJ + CSLL sobre a margem',`-${A.pmg}*(${A.ir}+${A.cs})`,-lucro*(ir+cs));
      preco=p*(1+cb+ib);
      T('preco','PreÃ§o mensal (segunda a domingo)',`${A.pp1}+${A.pcb}`,r2(preco));
      liq=lucro*(1-ir-cs);
      F('liq','Margem lÃ­quida (apÃ³s IRPJ e CSLL)',`(${A.pmg}+${A.pir})*${A.fd}`,liq*M.fatorDias);
    } else {
      const T_=st+si; const bdi=(1+sdi)*(1+sl)/(1-T_)-1;
      F('bdi','BDI = (1+X)(1+Y)/(1âˆ’impostos) âˆ’ 1',`(1+${A.sdi})*(1+${A.sl})/(1-(${A.st}+${A.si}))-1`,bdi,S.pct);
      preco=custo*(1+bdi);
      F('sdi1','Despesas indiretas',`${A.custo}*${A.sdi}`,custo*sdi);
      F('sst','Simples (DAS sem ISS)',`${A.custo}*(1+${A.bdi})*${A.st}`,preco*st);
      F('ssi','ISS',`${A.custo}*(1+${A.bdi})*${A.si}`,preco*si);
      liq=custo*(1+sdi)*sl; F('slu','Lucro',`${A.custo}*(1+${A.sdi})*${A.sl}`,liq);
      T('preco','PreÃ§o mensal (segunda a domingo)',`${A.custo}*(1+${A.bdi})`,r2(preco));
      F('liq','Lucro no perÃ­odo',`${A.slu}*${A.fd}`,liq*M.fatorDias);
    }
    blank();
    const mensal=preco*M.fatorDias;
    const dn=rows.length+1;
    push([C('Valor mensal por posto',S.destL),C(r2(mensal),S.destCur,`${A.preco}*${A.fd}`)]); A.mensal='B'+dn;
    push([C('Valor diÃ¡rio',S.destL),C(r2(mensal/M.divDiario),S.destCur,`${A.mensal}/${A.dd}`)]);
    push([C('Valor mensal de todos os postos',S.destL),C(r2(mensal*M.qtd),S.destCur,`${A.mensal}*${A.qt}`)]);
    blank();
    M.notas.forEach(t=>push([C(t,S.note)]));
    return {bytes:writeBook(rows,'Custo interno',logoB64), mensal};
  }
  return {build, buildModelo, S, writeBook};

})() as {
  build: (R: XlsxReport, logoB64?: string) => Uint8Array;
  buildModelo: (M: any, logoB64?: string) => { bytes: Uint8Array; mensal: number };
};
