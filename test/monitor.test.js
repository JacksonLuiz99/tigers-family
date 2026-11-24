import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { detectEvents, pendingAttacks, orientWar, gameTime, warResult } from '../worker/events.js';
import { synchronize, readState, loadWar, sendAlert, loadExtras } from '../worker/monitor.js';
import { route } from '../worker/index.js';

const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const now=Date.parse('2026-11-17T15:00:00Z');
const tag='#R0UPVVVY';
const member=(t,name)=>({tag:t,name,donations:10,donationsReceived:4,trophies:5000,townHallLevel:19,mapPosition:1,attacks:[]});
function clan() {return {tag,name:'Clã de teste',members:2,memberList:[member('#AAA','Ana'),member('#BBB','Beto')]};}
function war(state='inWar',kind='regular') {return {state,kind,teamSize:1,startTime:'20261116T210000.000Z',endTime:'20261117T210000.000Z',clan:{tag,name:'Casa',stars:3,destructionPercentage:100,members:[member('#AAA','Ana')]},opponent:{tag:'#OTHER',name:'Outro',stars:2,destructionPercentage:99,members:[]}};}
function database() {
  const sql=new DatabaseSync(':memory:');sql.exec('PRAGMA foreign_keys=ON');
  sql.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0002_management.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0005_family_results.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0006_detailed_wars.sql',import.meta.url),'utf8'));
  function stmt(query,args=[]) {
    return {bind(...values){return stmt(query,values);},async first(){return sql.prepare(query).get(...args) || null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:Number(r.changes)}};}};
  }
  return {prepare:query=>stmt(query),async batch(statements){sql.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}},close:()=>sql.close()};
}
function mockApi(getClan=clan,getWar=()=>({state:'notInWar'})) {
  globalThis.fetch=async url=>{
    if(url.endsWith('/currentwar/leaguegroup'))return Response.json({}, {status:404});
    if(url.endsWith('/currentwar'))return Response.json(getWar());
    return Response.json(getClan());
  };
}

test('primeira coleta é referência; não anuncia entradas antigas',()=>{
  assert.equal(detectEvents(null,{clan:clan(),war:war(),capturedAt:now},now).length,0);
});
test('entradas e saídas comparadas por tag, e não por nome',()=>{
  const a={clan:clan(),capturedAt:now};const b=structuredClone(a);b.capturedAt++;
  b.clan.memberList[0].name='Outro nome';
  assert.equal(detectEvents(a,b,now).length,0);
  b.clan.memberList[1]=member('#CCC','Cris');
  assert.deepEqual(detectEvents(a,b,now).map(e=>e.type),['member_join','member_leave']);
});
test('lembretes respeitam janela e não anunciam 6h quando falta meia hora',()=>{
  const state={clan:clan(),war:war(),capturedAt:now};
  const reminder=detectEvents(state,state,now);
  assert.equal(reminder.length,1);assert.equal(reminder[0].type,'war_reminder');
  assert.equal(reminder[0].expiresAt,gameTime(state.war.endTime));
  assert.equal(detectEvents(state,state,gameTime(state.war.endTime)-1800000).length,0);
});
test('Liga usa um ataque por membro e normaliza lado oponente',()=>{
  const w=war('inWar','cwl');assert.equal(pendingAttacks(w)[0].remaining,1);
  const reversed={...w,clan:w.opponent,opponent:w.clan};
  assert.equal(orientWar(reversed,tag).clan.tag,tag);
  assert.equal(orientWar(reversed,'#NONE'),null);
});
test('resultado usa destruição no desempate',()=>{
  const w=war('warEnded');w.opponent.stars=3;assert.equal(warResult(w),'Vitória');
  w.opponent.destructionPercentage=100;assert.equal(warResult(w),'Empate');
});
test('sincronização grava referência e eventos sem duplicar no D1',async()=>{
  const DB=database();let current=clan();mockApi(()=>current);
  const env={DB,CLAN_TAG:tag,CLASH_API_TOKEN:'test'};
  assert.equal((await synchronize(env,now)).ok,true);
  current=clan();current.memberList.push(member('#CCC','Cris'));
  assert.equal((await synchronize(env,now+300000)).events,1);
  assert.equal((await synchronize(env,now+600000)).events,0);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n,1);
  assert.equal((await readState(DB,'current')).clan.memberList.length,3);
  DB.close();
});
test('coleta principal guarda resultado encerrado para o comparativo anual',async()=>{
  const DB=database();mockApi(clan,()=>war('warEnded'));
  const env={DB,CLAN_TAG:tag,CLASH_API_TOKEN:'test'};
  assert.equal((await synchronize(env,now+86400000)).ok,true);
  const response=await route(new Request('https://api.test/api/family-results'),env);
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.clans.find(c=>c.tag===tag)?.wins,1);
  const ranking=await route(new Request('https://api.test/api/detailed-ranking?clan='+encodeURIComponent(tag)),env);
  assert.equal(ranking.status,200);
  assert.equal((await ranking.json()).wars,1);
  DB.close();
});
test('API indisponível mantém última coleta e registra código sem segredo',async()=>{
  const DB=database();mockApi();const env={DB,CLAN_TAG:tag,CLASH_API_TOKEN:'secret'};
  await synchronize(env,now);
  globalThis.fetch=async()=>Response.json({token:'secret'},{status:403});
  const r=await synchronize(env,now+300000);assert.equal(r.code,'api_http_403');
  assert.equal((await readState(DB,'current')).capturedAt,now);
  assert.equal((await readState(DB,'health')).lastSuccess,now);
  DB.close();
});
test('falha de guerra preserva estado e não gera lembrete com dados antigos',async()=>{
  const DB=database();mockApi(clan,()=>war());const env={DB,CLAN_TAG:tag,CLASH_API_TOKEN:'test'};
  await synchronize(env,now-300000);
  globalThis.fetch=async url=>url.endsWith('/currentwar')||url.endsWith('/leaguegroup')?Response.json({}, {status:403}):Response.json(clan());
  const result=await synchronize(env,now);assert.equal(result.warning,'api_http_403');
  assert.equal((await readState(DB,'current')).warCapturedAt,now-300000);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n,0);DB.close();
});
test('lease impede duas coletas simultâneas',async()=>{
  const DB=database();await DB.prepare("UPDATE leases SET until_ms=? WHERE id='sync'").bind(now+1000).run();
  const r=await synchronize({DB,CLASH_API_TOKEN:'test'},now);assert.equal(r.code,'sync_busy');DB.close();
});
test('rota pública não vaza credenciais; sincronização exige autenticação',async()=>{
  const DB=database();const env={DB,CLAN_TAG:tag,CLASH_API_TOKEN:'test-secret',ADMIN_TOKEN:'x'.repeat(32),DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/secret',PUBLIC_ORIGIN:'https://panel.vercel.app'};
  const response=await route(new Request('https://api.test/api/dashboard',{headers:{Origin:'https://panel.vercel.app'}}),env);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://panel.vercel.app');
  const body=await response.text();assert.ok(!body.includes('secret'));assert.ok(!body.includes('-999'));
  const denied=await route(new Request('https://api.test/api/sync',{method:'POST'}),env);assert.equal(denied.status,401);
  const get=await route(new Request('https://api.test/api/sync'),env);assert.equal(get.status,404);DB.close();
});
test('Discord desativa menções e não inclui segredo no erro',async()=>{
  let body;globalThis.fetch=async(url,options)=>{body=JSON.parse(options.body);return Response.json({},{status:429});};
  await assert.rejects(sendAlert({DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/secret'},'discord','@everyone entrou'),{message:'channel_http_429'});
  assert.deepEqual(body.allowed_mentions,{parse:[]});
});
test('entrega confirmada em um canal não se repete quando o outro falha',async()=>{
  const DB=database();let current=clan();const sent={discord:0};
  const env={DB,CLAN_TAG:tag,CLASH_API_TOKEN:'test',DISCORD_WEBHOOK_URL:'https://discord.com/api/webhooks/123/test'};
  const api=async url=>url.endsWith('/leaguegroup')?Response.json({},{status:404}):url.endsWith('/currentwar')?Response.json({state:'notInWar'}):Response.json(current);
  globalThis.fetch=async(url,options)=>{
    if(url.includes('discord.com')){sent.discord++;return Response.json({},{status:sent.discord===1?500:200});}
    return api(url,options);
  };
  await synchronize(env,now);current=clan();current.memberList.push(member('#CCC','Cris'));
  await synchronize(env,now+300000);await synchronize(env,now+600000);
  assert.deepEqual(sent,{discord:2});DB.close();
});
test('guerra da Liga é encontrada mesmo com o clã no segundo lado',async()=>{
  const reversed=war();[reversed.clan,reversed.opponent]=[reversed.opponent,reversed.clan];
  globalThis.fetch=async url=>url.endsWith('/currentwar')?Response.json({state:'notInWar'}):url.endsWith('/leaguegroup')?Response.json({rounds:[{warTags:['#WAR']}] }):Response.json(reversed);
  const result=await loadWar({CLAN_TAG:tag,CLASH_API_TOKEN:'test'},now);
  assert.equal(result.war.kind,'cwl');assert.equal(result.war.clan.tag,tag);
});

test('próxima rodada em preparação não esconde resultado da rodada anterior',async()=>{
  const DB=database();const env={DB,CLAN_TAG:tag,CLASH_API_TOKEN:'test'};
  mockApi();await synchronize(env,now-300000);
  const ended=war('warEnded','cwl');ended.endTime='20261117T145900.000Z';
  const next=war('preparation','cwl');next.startTime='20261118T145900.000Z';next.endTime='20261119T145900.000Z';
  globalThis.fetch=async url=>{
    if(url.endsWith('/currentwar'))return Response.json({state:'notInWar'});
    if(url.endsWith('/leaguegroup'))return Response.json({rounds:[{warTags:['#END']},{warTags:['#NEXT']}]});
    if(url.endsWith('%23END'))return Response.json(ended);
    if(url.endsWith('%23NEXT'))return Response.json(next);
    return Response.json(clan());
  };
  await synchronize(env,now);
  assert.equal((await readState(DB,'current')).war.state,'preparation');
  const events=await DB.prepare('SELECT type FROM events').all();assert.deepEqual(events.results.map(e=>e.type),['war_end']);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM wars').first()).n,2);
  await synchronize(env,now+300000);
  assert.equal((await DB.prepare('SELECT COUNT(*) AS n FROM events').first()).n,1);DB.close();
});

test('dados complementares respeitam cache e mantêm último histórico em falhas',async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;return Response.json({},{status:500});};
  const cached={attemptedAt:now-1000,warLog:{items:[{result:'win'}],updatedAt:now-1000,error:null}};
  assert.equal(await loadExtras({CLAN_TAG:tag},now,cached),cached);assert.equal(calls,0);
  const result=await loadExtras({CLAN_TAG:tag},now+3600000,cached);
  assert.equal(calls,2);assert.equal(result.warLog.items[0].result,'win');assert.equal(result.warLog.error,'api_http_500');
});

test('Capital armazena resumo útil sem duplicar registros extensos de ataques',async()=>{
  globalThis.fetch=async url=>Response.json({items:url.endsWith('/capitalraidseasons')?[{capitalTotalLoot:123,members:[{tag:'#A',name:'Ana',attacks:6,capitalResourcesLooted:123}],attackLog:[{sensitive:'not-needed'}]}]:[]});
  const result=await loadExtras({CLAN_TAG:tag},now,null);
  assert.equal(result.raids.items[0].capitalTotalLoot,123);assert.equal(result.raids.items[0].members[0].attacks,6);
  assert.ok(!('attackLog' in result.raids.items[0]));
});

test('mudança de domínio aceita somente as duas origens explícitas durante a transição',async()=>{
  const config={PUBLIC_ORIGIN:'https://family.example',LEGACY_PUBLIC_ORIGIN:'https://old-family.example'};
  for(const [origin,allowed] of [['https://family.example',true],['https://old-family.example',true],['https://family.example.attacker.test',false],['https://another.example',false]]){
    const response=await route(new Request('https://worker.test/api/unknown',{method:'OPTIONS',headers:{Origin:origin}}),config);
    assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),allowed?origin:null);assert.equal(response.headers.get('Vary'),'Origin');
  }
});
