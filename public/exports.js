import { performance, mergedHistory, parseGameTime, outcome } from './stats.js';

export const REPORTS = Object.freeze([
  {id:'members',title:'Membros e doações',sheet:'Membros'},
  {id:'wars',title:'Histórico de guerras',sheet:'Guerras'},
  {id:'currentRanking',title:'Ranking da guerra atual',sheet:'Ranking atual'},
  {id:'historicalRanking',title:'Ranking das guerras encerradas',sheet:'Ranking histórico'},
  {id:'attacks',title:'Ataques registrados',sheet:'Ataques'},
  {id:'capital',title:'Participação na Capital',sheet:'Capital'}
]);
const roles={leader:'Líder',coLeader:'Colíder',admin:'Ancião',member:'Membro'};
const iso=value=>value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : '';
const round=value=>Number.isFinite(value) ? Math.round(value*100)/100 : null;
const identity=clan=>[clan.name,clan.tag];
function uniqueWars(payload) {
  const all=[payload.current?.war,...(payload.wars || [])].filter(w=>w?.clan?.tag===payload.clanTag);
  const seen=new Set();return all.filter(w=>{const key=`${w.startTime}:${w.endTime}:${w.opponent?.tag}`;if(seen.has(key))return false;seen.add(key);return true;});
}
function notesFor(payload) {
  const notes=[
    'Exportação dos dados disponíveis no painel para este clã na data indicada.',
    'Estrelas individuais somam os ataques; ataques repetidos podem superar as estrelas novas do placar.',
    'Ranking: total de estrelas, triplos, destruição média, ataques e ordem alfabética nos empates.',
    'Resumos antigos sem detalhes individuais não entram nos rankings nem no registro de ataques.',
    'Membros e doações representam a coleta atual, não um histórico ilimitado de temporadas.'
  ];
  if(payload.monitoringMode==='on_demand')notes.push('Este clã é consultado no painel. O histórico individual cobre apenas os confrontos observados nessas consultas.');
  if(payload.health?.code && payload.health.code!=='ok')notes.push('A coleta tem pendências. Consulte a data da última coleta válida; alguns dados podem estar desatualizados.');
  if(payload.extras?.warLog?.error)notes.push('A consulta de histórico antigo apresentou falha; a exportação preserva os registros já disponíveis.');
  if(payload.extras?.raids?.error)notes.push('A consulta de ataques da Capital apresentou falha; a exportação preserva os registros já disponíveis.');
  return notes;
}
export function buildExport(payload, exportedAt = new Date().toISOString()) {
  const clan=payload?.current?.clan;
  if(!clan || clan.tag!==payload.clanTag)throw new Error('Selecione um clã com dados carregados antes de baixar.');
  const meta={schemaVersion:1,clan:{name:clan.name,tag:clan.tag,level:clan.clanLevel ?? null,members:clan.members ?? clan.memberList?.length ?? null,trophies:clan.clanPoints ?? null,warWins:clan.warWins ?? null,warLosses:clan.warLosses ?? null,warTies:clan.warTies ?? null,warLeague:clan.warLeague?.name || '',capitalLevel:clan.clanCapital?.capitalHallLevel ?? null,capitalPoints:clan.clanCapitalPoints ?? null,capitalLeague:clan.capitalLeague?.name || '',description:clan.description || ''},exportedAt:iso(exportedAt),capturedAt:iso(payload.current.capturedAt),warCapturedAt:iso(payload.current.warCapturedAt),monitoringMode:payload.monitoringMode || 'automatic',notes:notesFor(payload)};
  const base=[...identity(clan),meta.capturedAt];const prefix=['Clã','Tag do clã','Coleta do clã (UTC)'];
  const memberHeaders=[...prefix,'Jogador','Tag do jogador','Cargo','CV','Troféus','Doações','Recebidas','Variação de doações em 24h','Referência de 24h (UTC)'];
  const previous=new Map((payload.baseline?.clan?.tag===clan.tag ? payload.baseline.clan.memberList || [] : []).map(m=>[m.tag,m]));
  const memberRows=[...(clan.memberList || [])].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(m=>{
    const old=previous.get(m.tag);const delta=old?(m.donations || 0)-(old.donations || 0):null;
    return [...base,m.name,m.tag,roles[m.role] || m.role,m.townHallLevel ?? null,m.trophies ?? null,m.donations ?? null,m.donationsReceived ?? null,delta===null?null:delta<0?'Contador reiniciado':delta,old?iso(payload.baseline.capturedAt):''];
  });
  const detailed=uniqueWars(payload);
  const history=mergedHistory(detailed,(payload.extras?.warLog?.items || []).filter(w=>!w.clan?.tag || w.clan.tag===clan.tag));
  const warHeaders=[...prefix,'Adversário','Tag do adversário','Modalidade','Estado / resultado','Participantes','Estrelas do clã','Estrelas adversárias','Destruição do clã (%)','Destruição adversária (%)','Início (UTC)','Término (UTC)','Origem','Detalhes individuais disponíveis'];
  const warRows=history.map(w=>[...base,w.opponent.name,w.opponent.tag || '',w.kind==='cwl'?'Liga':'Guerra comum',outcome(w),w.teamSize ?? null,w.clan.stars ?? null,w.opponent.stars ?? null,w.clan.destructionPercentage ?? null,w.opponent.destructionPercentage ?? null,iso(parseGameTime(w.startTime)),iso(parseGameTime(w.endTime)),w.source==='api'?'Resumo da API':'Monitor',Boolean(w.clan.members?.length)?'Sim':'Não']);
  const rankingHeaders=[...prefix,'Posição de exibição','Jogador','Tag do jogador','CV','Guerras observadas','Ataques usados','Ataques disponíveis no total','Estrelas dos ataques','Triplos','Média de estrelas','Destruição média (%)','Taxa de triplos (%)','Participação (%)','Duração média (s)'];
  const rankRows=players=>players.map((p,i)=>[...base,i+1,p.name,p.tag,p.townHall ?? null,p.wars,p.attacks,p.expected,p.stars,p.triples,round(p.averageStars),round(p.averageDamage),round(p.tripleRate),round(p.participation),round(p.averageDuration)]);
  const attackHeaders=[...prefix,'Adversário da guerra','Modalidade','Término da guerra (UTC)','Atacante','Tag do atacante','CV do atacante','Posição do atacante','Defensor','Tag do defensor','CV do defensor','Posição do defensor','Estrelas','Destruição (%)','Duração (s)','Ordem do ataque'];
  const attackRows=[];
  for(const w of detailed){const targets=new Map((w.opponent?.members || []).map(m=>[m.tag,m]));for(const m of w.clan?.members || [])for(const a of m.attacks || []){
    const target=targets.get(a.defenderTag);
    attackRows.push([...base,w.opponent.name,w.kind==='cwl'?'Liga':'Guerra comum',iso(parseGameTime(w.endTime)),m.name,m.tag,m.townhallLevel ?? m.townHallLevel ?? null,m.mapPosition ?? null,target?.name || '',a.defenderTag,target?.townhallLevel ?? target?.townHallLevel ?? null,target?.mapPosition ?? null,a.stars ?? null,a.destructionPercentage ?? null,a.duration ?? null,a.order ?? null]);
  }}
  const capitalHeaders=[...prefix,'Início do fim de semana (UTC)','Término do fim de semana (UTC)','Jogador','Tag do jogador','Ataques usados','Limite de ataques','Ataques bônus','Ouro saqueado','Coleta da Capital (UTC)'];
  const capitalRows=(payload.extras?.raids?.items || []).flatMap(r=>(r.members || []).map(m=>[...base,iso(parseGameTime(r.startTime)),iso(parseGameTime(r.endTime)),m.name,m.tag,m.attacks ?? null,m.attackLimit ?? null,m.bonusAttackLimit ?? null,m.capitalResourcesLooted ?? null,iso(payload.extras.raids.updatedAt)]));
  const tables={
    members:{headers:memberHeaders,rows:memberRows},wars:{headers:warHeaders,rows:warRows},
    currentRanking:{headers:rankingHeaders,rows:rankRows(performance(payload.current.war?.clan?.tag===clan.tag?[payload.current.war]:[]))},
    historicalRanking:{headers:rankingHeaders,rows:rankRows(performance(detailed,{completedOnly:true}))},
    attacks:{headers:attackHeaders,rows:attackRows},capital:{headers:capitalHeaders,rows:capitalRows}
  };
  // Seleção explícita: não inclui configurações de canais, credenciais ou dados de outros clãs.
  return {meta,tables};
}
function selectedTables(bundle,report) {
  if(report==='all')return REPORTS.map(r=>({...r,...bundle.tables[r.id]}));
  const found=REPORTS.find(r=>r.id===report);if(!found)throw new Error('Relatório inválido.');
  return [{...found,...bundle.tables[report]}];
}
export function csvCell(value) {
  if(value==null)return '""';
  let text=typeof value==='number'?String(value).replace('.',','):String(value);
  if(typeof value==='string' && (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function csvFile(table) {
  return '\uFEFF'+[table.headers,...table.rows].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
function xml(value) {
  const clean=Array.from(String(value ?? ''),char=>{const code=char.codePointAt(0);return code>=0xd800 && code<=0xdfff?'\ufffd':char;}).join('').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu,'');
  return clean.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
}
function column(index) {let out='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;}
function worksheet(table) {
  const rows=[table.headers,...table.rows];
  const cols=table.headers.map((header,i)=>{const width=Math.max(String(header).length,...table.rows.map(row=>String(row[i] ?? '').length));return `<col min="${i+1}" max="${i+1}" width="${Math.min(45,Math.max(13,width+2))}" customWidth="1"/>`;}).join('');
  const body=rows.map((row,r)=>`<row r="${r+1}"${r===0?' ht="30" customHeight="1"':''}>${row.map((value,c)=>{
    const ref=`${column(c)}${r+1}`;
    if(r>0 && typeof value==='number' && Number.isFinite(value))return `<c r="${ref}" s="${Number.isInteger(value)?0:2}"><v>${value}</v></c>`;
    return `<c r="${ref}" t="inlineStr" s="${r===0?1:0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const end=`${column(table.headers.length-1)}${rows.length}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${end}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${cols}</cols><sheetData>${body}</sheetData><autoFilter ref="A1:${end}"/></worksheet>`;
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
export function crc32(bytes) {let crc=0xffffffff;for(const value of bytes)crc=crcTable[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function zipStore(files) {
  const encoder=new TextEncoder();const chunks=[];const entries=[];let offset=0;
  for(const file of files){const name=encoder.encode(file.name);const bytes=encoder.encode(file.content);const crc=crc32(bytes);const header=new Uint8Array(30+name.length);const view=new DataView(header.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x0800,true);view.setUint16(8,0,true);view.setUint16(12,0x21,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);header.set(name,30);
    chunks.push(header,bytes);entries.push({name,crc,size:bytes.length,offset});offset+=header.length+bytes.length;
  }
  const centralStart=offset;
  for(const entry of entries){const header=new Uint8Array(46+entry.name.length);const view=new DataView(header.buffer);
    view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);view.setUint16(6,20,true);view.setUint16(8,0x0800,true);view.setUint16(14,0x21,true);view.setUint32(16,entry.crc,true);view.setUint32(20,entry.size,true);view.setUint32(24,entry.size,true);view.setUint16(28,entry.name.length,true);view.setUint32(42,entry.offset,true);header.set(entry.name,46);chunks.push(header);offset+=header.length;
  }
  const end=new Uint8Array(22);const view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,offset-centralStart,true);view.setUint32(16,centralStart,true);chunks.push(end);
  const result=new Uint8Array(offset+end.length);let cursor=0;for(const chunk of chunks){result.set(chunk,cursor);cursor+=chunk.length;}return result;
}
export function xlsxFile(bundle,report='all') {
  const reports=selectedTables(bundle,report);
  const overview={sheet:'Resumo',headers:['Campo','Valor'],rows:[['Clã',bundle.meta.clan.name],['Tag',bundle.meta.clan.tag],['Nível do clã',bundle.meta.clan.level],['Membros',bundle.meta.clan.members],['Troféus',bundle.meta.clan.trophies],['Vitórias',bundle.meta.clan.warWins],['Derrotas',bundle.meta.clan.warLosses],['Empates',bundle.meta.clan.warTies],['Liga de guerra',bundle.meta.clan.warLeague],['Capital nível',bundle.meta.clan.capitalLevel],['Troféus da Capital',bundle.meta.clan.capitalPoints],['Liga da Capital',bundle.meta.clan.capitalLeague],['Descrição do clã',bundle.meta.clan.description],['Coleta do clã (UTC)',bundle.meta.capturedAt],['Coleta da guerra (UTC)',bundle.meta.warCapturedAt],['Exportado em (UTC)',bundle.meta.exportedAt],['Modo',bundle.meta.monitoringMode],...reports.map(r=>[r.title+' · registros',r.rows.length]),...bundle.meta.notes.map(note=>['Observação',note])]};
  return xlsxWorkbook([overview,...reports]);
}
export function xlsxWorkbook(sheets) {
  const files=[
    {name:'[Content_Types].xml',content:`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`},
    {name:'_rels/.rels',content:'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:'xl/workbook.xml',content:`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.sheet)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',content:`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
    {name:'xl/styles.xml',content:'<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFAD4C0B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
    ...sheets.map((table,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,content:worksheet(table)}))
  ];return zipStore(files);
}
export function createDownload(payload,format,report='all',exportedAt=new Date().toISOString()) {
  const bundle=buildExport(payload,exportedAt);const tables=selectedTables(bundle,report);
  const slug=bundle.meta.clan.name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase() || 'cla';
  const stamp=bundle.meta.exportedAt.replace(/[:.]/g,'-');const base=`tigers-${slug}-${bundle.meta.clan.tag.slice(1)}-${report}-${stamp}`;
  if(format==='xlsx')return {filename:base+'.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',content:xlsxFile(bundle,report),rows:tables.reduce((n,t)=>n+t.rows.length,0)};
  if(format==='csv'){if(report==='all')throw new Error('Escolha um relatório para baixar em CSV.');return {filename:base+'.csv',mime:'text/csv;charset=utf-8',content:csvFile(tables[0]),rows:tables[0].rows.length};}
  if(format==='json')return {filename:base+'.json',mime:'application/json;charset=utf-8',content:JSON.stringify({meta:bundle.meta,reports:Object.fromEntries(tables.map(t=>[t.id,{columns:t.headers,records:t.rows.map(row=>Object.fromEntries(t.headers.map((h,i)=>[h,row[i] ?? null])))}]))},null,2),rows:tables.reduce((n,t)=>n+t.rows.length,0)};
  throw new Error('Formato de download inválido.');
}
