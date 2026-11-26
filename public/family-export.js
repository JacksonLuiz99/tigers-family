import { CLANS } from './clans.js';
import { familyLeagueView } from './intelligence.js';
import { xlsxWorkbook } from './exports.js';

const iso=value=>value && Number.isFinite(Number(value))?new Date(Number(value)).toISOString():'';
const number=value=>Number.isFinite(value)?value:null;
export function buildFamilyExport(family,results,exportedAt=new Date().toISOString()) {
  if(!Array.isArray(family?.clans) || !Array.isArray(results?.clans) || !Number.isFinite(results?.from) || !Number.isFinite(results?.to))throw new Error('Os dados da família ainda não estão disponíveis para baixar.');
  const now=Date.parse(exportedAt);if(!Number.isFinite(now))throw new Error('Horário de exportação inválido.');
  const clans=new Map(family.clans.filter(c=>CLANS.some(known=>known.tag===c.tag)).map(c=>[c.tag,c]));
  const scores=new Map(results.clans.filter(c=>CLANS.some(known=>known.tag===c.tag)).map(c=>[c.tag,c]));
  const sheets=[
    {sheet:'Resumo',headers:['Campo','Valor'],rows:[
      ['Exportado em (UTC)',new Date(now).toISOString()],['Resultados desde (UTC)',iso(results.from)],['Resultados até (UTC)',iso(results.to)],
      ['Clãs da família',CLANS.length],['Observação','Resultados refletem somente guerras encerradas registradas nos últimos 365 dias. O intervalo pode conter lacunas.'],
      ['Observação','Guerras privadas, coletas incompletas e períodos anteriores ao monitor não são reconstruídos.'],
      ['Observação','Estrelas dos ataques aparecem apenas quando existem detalhes individuais. Podem superar as estrelas novas do placar.'],
      ['Observação','A aba Liga contém rodadas efetivamente acompanhadas. Coletas antigas não confirmam a situação atual.']
    ]},
    {sheet:'Clãs',headers:['Clã','Tag','Membros na coleta','Liga do clã','Coleta do clã (UTC)','Coleta da guerra (UTC)','Situação da coleta'],rows:CLANS.map(known=>{
      const c=clans.get(known.tag);return [known.label,known.tag,number(c?.members),c?.league || '',iso(c?.capturedAt),iso(c?.warCapturedAt),c?.health || 'Sem coleta'];
    })},
    {sheet:'Guerras 365 dias',headers:['Clã','Tag','Guerras registradas','Vitórias','Derrotas','Empates','Estrelas no placar','Estrelas dos ataques','Guerras com detalhes','Primeiro resultado (UTC)','Último resultado (UTC)'],rows:CLANS.map(known=>{
      const r=scores.get(known.tag);return [known.label,known.tag,number(r?.wars),number(r?.wins),number(r?.losses),number(r?.ties),number(r?.scoreStars),r?.detailedWars?number(r.attackStars):null,number(r?.detailedWars),iso(r?.firstWar),iso(r?.lastWar)];
    })},
    {sheet:'Liga',headers:['Clã','Tag','Temporada','Rodadas acompanhadas','Última rodada','Adversário','Estrelas do clã','Estrelas adversárias','Situação dos dados','Coleta da guerra (UTC)'],rows:CLANS.map(known=>{
      const c=clans.get(known.tag),v=familyLeagueView(c,now);return [known.label,known.tag,v.season || '',v.rounds.length,number(v.shown?.round),v.shown?.opponent || '',number(v.shown?.stars),number(v.shown?.enemyStars),v.status,iso(c?.warCapturedAt)];
    })},
    {sheet:'Rodadas da Liga',headers:['Clã','Tag','Temporada','Rodada','Adversário','Estrelas do clã','Estrelas adversárias','Resultado','Estado'],rows:CLANS.flatMap(known=>{
      const c=clans.get(known.tag),season=c?.leagueSeason;return (season?.rounds || []).map(r=>[known.label,known.tag,season.season || '',number(r.round),r.opponent || '',number(r.stars),number(r.enemyStars),r.result || '',r.state || '']);
    })}
  ];
  return {sheets,exportedAt:new Date(now).toISOString()};
}
export function createFamilyDownload(family,results,exportedAt=new Date().toISOString()) {
  const bundle=buildFamilyExport(family,results,exportedAt);
  return {filename:`tigers-familia-${bundle.exportedAt.replace(/[:.]/g,'-')}.xlsx`,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',content:xlsxWorkbook(bundle.sheets),rows:bundle.sheets.slice(1).reduce((n,s)=>n+s.rows.length,0)};
}
