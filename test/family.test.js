import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { familyDashboard, scheduledClan, synchronizeFamily, familyOverview, dailyTimeline, clanSummary, recordPrimarySummary } from '../worker/family.js';
import { readState, stateStatement } from '../worker/monitor.js';
import { route } from '../worker/index.js';
import { CLANS, DEFAULT_CLAN, preferredClan, findClan } from '../public/clans.js';

const originalFetch = globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const now = Date.parse('2026-11-18T16:00:00Z');
const a = '#29P0V8VCG';const b = '#28L88PQ2';
function database() {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0002_management.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0005_family_results.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0006_detailed_wars.sql',import.meta.url),'utf8'));
  const statement=(query,args=[])=>({bind(...values){return statement(query,values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}});
  return {prepare:q=>statement(q),async batch(statements){for(const s of statements)await s.run();},close:()=>sql.close()};
}
function mockFamilyApi(warState='inWar') {
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,method:options?.method || 'GET'});
    const tag=decodeURIComponent(new URL(url).pathname.split('/')[3]);
    if(url.endsWith('/currentwar/leaguegroup'))return Response.json({},{status:404});
    if(url.endsWith('/currentwar'))return Response.json({state:warState,startTime:warState==='warEnded'?'20261116T120000.000Z':'20261118T120000.000Z',endTime:warState==='warEnded'?'20261117T140000.000Z':'20261119T120000.000Z',teamSize:1,
      clan:{tag,name:findClan(tag)?.name,stars:3,destructionPercentage:100,members:[{tag:tag+'A',name:'Guerreiro '+tag,mapPosition:1,attacks:[{stars:3,destructionPercentage:100}]}]},
      opponent:{tag:'#ENEMY',name:'Oponente',stars:2,destructionPercentage:80,members:[]}});
    if(url.endsWith('/warlog'))return Response.json({items:[{result:'win',endTime:'20261117T120000.000Z',clan:{tag,stars:3},opponent:{tag:'#ENEMY',stars:2}}]});
    if(url.endsWith('/capitalraidseasons'))return Response.json({items:[]});
    return Response.json({tag,name:findClan(tag)?.name,members:1,memberList:[{tag:tag+'A',name:'Guerreiro '+tag,donations:20}]});
  };
  return calls;
}
function env(DB){return {DB,CLAN_TAG:DEFAULT_CLAN,CLASH_API_TOKEN:'test-secret',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/secret'};}

test('catálogo contém os 16 clãs e valida preferências antigas e novas',()=>{
  assert.equal(CLANS.length,16);assert.equal(new Set(CLANS.map(c=>c.tag)).size,16);assert.equal(preferredClan(a.toLowerCase()),a);
  assert.equal(findClan('#2GY9JPQY2').name,'TOW FORMATION');
  assert.equal(preferredClan('#qc9ry8gj'),'#QC9RY8GJ');
  assert.equal(findClan('#2LUJ0V08L').name,'TOW-eVolution™');
  assert.equal(findClan('#28L88PQ2').label,'TOW 1');
  assert.equal(findClan('#28L88PQ2').name,'TIGERS OF WAR');
  for(const tag of ['#2Y0P809CU','#2YJLQRLYL','#992PPYP9','#222RQ2C22','#2P0Y8JRUL','#92RJJJ0Y']) assert.equal(preferredClan(tag),tag);
  assert.equal(preferredClan('#2qlgru29u'),'#2QLGRU29U');
  assert.equal(preferredClan('javascript:alert(1)'),DEFAULT_CLAN);
  assert.equal(preferredClan('#UNKNOWN'),DEFAULT_CLAN);assert.equal(findClan(null),null);
});
test('dois clãs mantêm guerra, membros e histórico separados',async()=>{
  const DB=database();mockFamilyApi();const one=await familyDashboard(env(DB),a,now);const two=await familyDashboard(env(DB),b,now);
  assert.equal(one.current.clan.tag,a);assert.equal(two.current.clan.tag,b);
  assert.equal(one.current.war.clan.tag,a);assert.equal(two.wars[0].clan.tag,b);
  assert.equal(one.extras.warLog.items[0].clan.tag,a);assert.equal(two.extras.warLog.items[0].clan.tag,b);
  assert.ok(!JSON.stringify(one).includes('Guerreiro '+b));DB.close();
});
test('comparativo anual registra resultados disponíveis de clãs diferentes sem misturar dados',async()=>{
  const DB=database();mockFamilyApi();await familyDashboard(env(DB),a,now);await familyDashboard(env(DB),b,now);
  const response=await route(new Request('https://worker.test/api/family-results'),env(DB));
  assert.equal(response.status,200);const payload=await response.json();
  assert.equal(payload.clans.length,2);
  assert.deepEqual(payload.clans.map(c=>c.tag).sort(),[a,b].sort());
  assert.ok(payload.clans.every(c=>c.wins===1 && c.wars===1 && c.scoreStars===3 && c.detailedWars===0));
  DB.close();
});
test('coleta de outro clã guarda ataques encerrados para consulta por período',async()=>{
  const DB=database();mockFamilyApi('warEnded');await familyDashboard(env(DB),a,now);
  const response=await route(new Request('https://worker.test/api/detailed-ranking?clan='+encodeURIComponent(a)+'&from=2026-11-17&to=2026-11-17'),env(DB));
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.wars,1);assert.equal(result.players[0].stars,3);
  assert.equal(result.players[0].name,'Guerreiro '+a);DB.close();
});
test('novos clãs não alteram dados nem fila de notificações do clã original',async()=>{
  const DB=database();const primary={clan:{tag:DEFAULT_CLAN},capturedAt:1};await stateStatement(DB,'current',primary).run();const calls=mockFamilyApi();
  const result=await familyDashboard(env(DB),a,now);assert.deepEqual(await readState(DB,'current'),primary);
  assert.deepEqual(result.channels,{discord:false});assert.equal(result.monitoringMode,'automatic');assert.equal(result.collectionIntervalMinutes,15);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM deliveries').first()).n,0);
  assert.equal((await DB.prepare("SELECT until_ms FROM leases WHERE id='sync'").first()).until_ms,0);
  assert.ok(calls.every(c=>c.method==='GET' && !c.url.includes('telegram') && !c.url.includes('discord')));DB.close();
});
test('cache evita nova consulta por cinco minutos, isoladamente por clã',async()=>{
  const DB=database();const calls=mockFamilyApi();await familyDashboard(env(DB),a,now);const count=calls.length;
  await familyDashboard(env(DB),a,now+60000);assert.equal(calls.length,count);
  await familyDashboard(env(DB),b,now+60000);assert.ok(calls.length>count);
  const before=calls.length;await familyDashboard(env(DB),a,now+300001);assert.equal(calls.length-before,2);DB.close();
});
test('falha de rede mantém último dado do clã correto e informa a falha',async()=>{
  const DB=database();mockFamilyApi();await familyDashboard(env(DB),a,now);
  globalThis.fetch=async()=>Response.json({},{status:503});
  const result=await familyDashboard(env(DB),a,now+300001);
  assert.equal(result.current.clan.tag,a);assert.equal(result.current.capturedAt,now);assert.equal(result.health.code,'api_http_503');DB.close();
});
test('rota recusa tag fora da família sem consultar a API',async()=>{
  const DB=database();const calls=mockFamilyApi();const r=await route(new Request('https://worker.test/api/dashboard?clan=%23UNKNOWN'),env(DB));
  assert.equal(r.status,400);assert.equal(calls.length,0);DB.close();
});
test('rota do clã selecionado não revela os segredos dos canais existentes',async()=>{
  const DB=database();mockFamilyApi();const r=await route(new Request('https://worker.test/api/dashboard?clan='+encodeURIComponent(a)),env(DB));
  assert.equal(r.status,200);const body=await r.text();const data=JSON.parse(body);
  assert.equal(data.clanTag,a);assert.equal(data.current.clan.tag,a);assert.ok(!body.includes('secret'));assert.ok(!body.includes('-123'));DB.close();
});
test('trava de um clã não impede consultar outro',async()=>{
  const DB=database();mockFamilyApi();await DB.prepare('INSERT INTO leases(id,until_ms) VALUES (?,?)').bind('family:'+a,now+10000).run();
  const locked=await familyDashboard(env(DB),a,now);assert.equal(locked.current,null);
  const other=await familyDashboard(env(DB),b,now);assert.equal(other.current.clan.tag,b);DB.close();
});
test('a referência de doações de 24h pertence ao clã selecionado',async()=>{
  const DB=database();mockFamilyApi();await familyDashboard(env(DB),a,now);
  const later=await familyDashboard(env(DB),a,now+86400000);
  assert.equal(later.baseline.clan.tag,a);assert.equal(later.baseline.capturedAt,now);DB.close();
});

test('agendamento cobre os 15 outros clãs em 15 minutos sem incluir o principal',()=>{
  const tags=Array.from({length:15},(_,i)=>scheduledClan(now+i*60000,DEFAULT_CLAN));
  assert.equal(new Set(tags).size,15);assert.ok(!tags.includes(DEFAULT_CLAN));
  assert.equal(scheduledClan(now,DEFAULT_CLAN),scheduledClan(now+15*60000,DEFAULT_CLAN));
});
test('coleta agendada funciona sem visitantes e publica resumo sem lista de membros',async()=>{
  const DB=database();const calls=mockFamilyApi();const result=await synchronizeFamily(env(DB),now);
  assert.equal(result.current.clan.tag,scheduledClan(now,DEFAULT_CLAN));assert.ok(calls.length>0);
  const overview=await familyOverview(env(DB),now);assert.equal(overview.clans.length,16);
  const summary=overview.clans.find(c=>c.tag===result.clanTag);assert.equal(summary.members,1);assert.equal(summary.war.pending,1);
  assert.ok(!JSON.stringify(overview).includes('secret'));assert.ok(!JSON.stringify(overview).includes('memberList'));DB.close();
});
test('série diária preserva a última coleta de cada dia e limita retenção',()=>{
  let points=[];for(let i=0;i<40;i++)points=dailyTimeline(points,{members:i,clanPoints:i*100,memberList:[]},now+i*86400000);
  assert.ok(points.length<=32);assert.equal(points.at(-1).members,39);
  points=dailyTimeline(points,{members:50,memberList:[]},now+39*86400000+1000);
  assert.equal(points.at(-1).members,50);assert.equal(new Set(points.map(p=>p.day)).size,points.length);
});
test('visão da família só lê resumos e não consulta a API do jogo',async()=>{
  const DB=database();const calls=mockFamilyApi();await familyDashboard(env(DB),a,now);const before=calls.length;
  const r=await route(new Request('https://worker.test/api/family'),env(DB));assert.equal(r.status,200);
  assert.equal((await r.json()).clans.length,16);assert.equal(calls.length,before);DB.close();
});
test('resumo do principal e série diária usam dados existentes sem enviar avisos',async()=>{
  const DB=database();const calls=mockFamilyApi();await stateStatement(DB,'current',{clan:{tag:DEFAULT_CLAN,members:48,memberList:[]},capturedAt:now}).run();
  await recordPrimarySummary(env(DB),now);assert.equal(calls.length,0);
  assert.equal((await familyOverview(env(DB),now)).clans.find(c=>c.tag===DEFAULT_CLAN).members,48);
  assert.equal((await readState(DB,'timeline'))[0].members,48);DB.close();
});

test('resumo público da família inclui metas por clã sem consultar a API do jogo',async()=>{
  const DB=database();const calls=mockFamilyApi();const goals={clanTag:a,startDate:'2026-11-18',endDate:'2026-11-19',donationTarget:500,raidTarget:6};
  await DB.prepare('INSERT INTO clan_goals(clan_tag,revision,updated_at,payload) VALUES (?,1,?,?)').bind(a,now,JSON.stringify(goals)).run();
  const overview=await familyOverview(env(DB),now);assert.deepEqual(overview.clans.find(c=>c.tag===a).goals,goals);assert.equal(overview.clans.find(c=>c.tag===b).goals,null);assert.equal(calls.length,0);DB.close();
});

test('falha de sincronização do principal também atualiza a saúde no resumo público',async()=>{
  const DB=database();const current={clan:{tag:DEFAULT_CLAN,name:'Principal',members:0,memberList:[]},war:null,capturedAt:Date.now()-60000,warCapturedAt:Date.now()-60000};
  await stateStatement(DB,'current',current).run();await stateStatement(DB,'health',{code:'ok',lastSuccess:current.capturedAt,lastAttempt:current.capturedAt}).run();
  globalThis.fetch=async()=>Response.json({},{status:503});const config={...env(DB),ADMIN_TOKEN:'a'.repeat(40)};
  const response=await route(new Request('https://worker.test/api/sync',{method:'POST',headers:{Authorization:'Bearer '+config.ADMIN_TOKEN}}),config);
  assert.equal(response.status,503);const summary=(await familyOverview(config)).clans.find(c=>c.tag===DEFAULT_CLAN);
  assert.equal(summary.health,'api_http_503');assert.ok(summary.lastAttempt>summary.capturedAt);DB.close();
});
