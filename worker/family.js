import { recordRoster } from './management.js';
import { clash, readState, stateStatement, loadWar, loadExtras } from './monitor.js';
import { detectEvents, warId, gameTime } from './events.js';
import { findClan, CLANS } from '../public/clans.js';
import { publicLinks } from '../public/stats.js';
import { recordWarResults, backfillAnnualResults } from './results.js';
import { recordDetailedWars } from './detailed-wars.js';

const CACHE_MS = 300000;
function responseFor(env, tag, saved, now = Date.now()) {
  return {
    configured:Boolean(env.CLASH_API_TOKEN), clanTag:tag, clans:CLANS, monitoringMode:'automatic', collectionIntervalMinutes:15,
    current:saved?.current || null, health:saved?.health || {code:'awaiting_first_sync'},
    wars:saved?.wars || [], events:saved?.events || [], extras:saved?.extras || null,
    timeline:saved?.timeline || [], coverageStartedAt:saved?.coverageStartedAt || saved?.current?.capturedAt || null,
    baseline:saved?.snapshots?.filter(s => s.capturedAt <= now-86400000).sort((a,b)=>b.capturedAt-a.capturedAt)[0] || null,
    channels:{discord:false},delivery:[],links:publicLinks(env)
  };
}

// Coleta isolada por clã; os avisos continuam exclusivos do clã original.
export async function familyDashboard(env, tag, now = Date.now()) {
  if (!findClan(tag)) throw new Error('unknown_clan');
  const key = `family:${tag}`; const leaseKey = `family:${tag}`;
  let saved = await readState(env.DB,key);
  if (saved?.managementVersion === 1 && saved?.attemptedAt && now-saved.attemptedAt < CACHE_MS) return responseFor(env,tag,saved,now);
  if (!env.CLASH_API_TOKEN) return {...responseFor(env,tag,saved,now),health:{code:'missing_clash_token'}};
  await env.DB.prepare('INSERT OR IGNORE INTO leases(id,until_ms) VALUES (?,0)').bind(leaseKey).run();
  const lease = await env.DB.prepare('UPDATE leases SET until_ms=? WHERE id=? AND until_ms < ?').bind(now+180000,leaseKey,now).run();
  if (!lease.meta.changes) return responseFor(env,tag,saved,now);
  try {
    // Outra requisição pode ter concluído a coleta entre a leitura inicial e a trava.
    saved = await readState(env.DB,key);
    if (saved?.managementVersion === 1 && saved?.attemptedAt && now-saved.attemptedAt < CACHE_MS) return responseFor(env,tag,saved,now);
    const scoped = {...env,CLAN_TAG:tag};
    const [clanResult,warResult,extraResult] = await Promise.allSettled([
      clash(scoped,`/clans/${encodeURIComponent(tag)}`),loadWar(scoped,now),loadExtras(scoped,now,saved?.extras)
    ]);
    if (clanResult.status === 'rejected') throw clanResult.reason;
    const clan = clanResult.value;
    if (clan.tag !== tag || !Array.isArray(clan.memberList)) throw new Error('invalid_clan_response');
    const previous = saved?.current;
    const warning = warResult.status === 'fulfilled' ? warResult.value.warning : warResult.reason.message;
    const war = warResult.status === 'fulfilled' ? warResult.value.war : previous?.war || null;
    const current = {clan,war,capturedAt:now,warCapturedAt:warning ? previous?.warCapturedAt || null : now};
    const events = new Map((saved?.events || []).map(e=>[e.id,e]));
    for (const event of detectEvents(previous,warning?{...current,war:null}:current,now)) {
      events.set(event.id,{id:event.id,type:event.type,message:event.message,created_at:event.createdAt});
    }
    const wars = new Map((saved?.wars || []).map(w=>[warId(w),w]));
    if (!warning) for (const observed of warResult.value.observedWars || (war?[war]:[])) wars.set(warId(observed),observed);
    const snapshots = (saved?.snapshots || []).filter(s=>s.capturedAt >= now-26*3600000);
    if (!snapshots.some(s=>Math.floor(s.capturedAt/3600000)===Math.floor(now/3600000))) snapshots.push({clan,capturedAt:now});
    const detailsBackfilled=saved?.detailsBackfilled === true;
    saved = {
      managementVersion:1,coverageStartedAt:saved?.coverageStartedAt || previous?.capturedAt || now,
      detailsBackfilled,
      timeline:dailyTimeline(saved?.timeline,clan,now),
      attemptedAt:now,current,health:{lastAttempt:now,lastSuccess:now,code:warning || 'ok'},
      events:[...events.values()].sort((a,b)=>b.created_at-a.created_at).slice(0,30),
      wars:[...wars.values()].sort((a,b)=>(gameTime(b.endTime)||0)-(gameTime(a.endTime)||0)).slice(0,20),
      extras:extraResult.status === 'fulfilled' ? extraResult.value : saved?.extras || null,
      snapshots:snapshots.slice(-26)
    };
    await stateStatement(env.DB,key,saved).run();
    await stateStatement(env.DB,`summary:${tag}`,clanSummary(tag,saved)).run();
    try { await recordWarResults(env.DB,tag,[...(warResult.status==='fulfilled' ? warResult.value.observedWars || [] : []),...(saved.extras?.attemptedAt===now ? saved.extras?.warLog?.items || [] : [])],now); } catch { /* O comparativo não interrompe a coleta. */ }
    try {
      await recordDetailedWars(env.DB,tag,detailsBackfilled ? (warResult.status==='fulfilled' ? warResult.value.observedWars || [war] : []) : saved.wars,now);
      if(!detailsBackfilled){saved.detailsBackfilled=true;await stateStatement(env.DB,key,saved).run();}
    } catch { /* O histórico detalhado não interrompe a coleta. */ }
    if(!saved.annualBackfilled) try {await backfillAnnualResults(env.DB,tag,now);saved.annualBackfilled=true;await stateStatement(env.DB,key,saved).run();} catch { /* A próxima coleta tentará novamente. */ }
    if(saved.current?.capturedAt===now) await recordRoster(env,saved.current.clan,now);
    return responseFor(env,tag,saved,now);
  } catch (error) {
    const code = /^(api_[a-z0-9_]+|invalid_clan_response)$/.test(error.message) ? error.message : 'sync_failed';
    saved = {...saved,managementVersion:1,attemptedAt:now,health:{...saved?.health,lastAttempt:now,code}};
    await stateStatement(env.DB,key,saved).run();
    await stateStatement(env.DB,`summary:${tag}`,clanSummary(tag,saved)).run();
    if(saved.current?.capturedAt===now) await recordRoster(env,saved.current.clan,now);
    return responseFor(env,tag,saved,now);
  } finally {
    await env.DB.prepare('UPDATE leases SET until_ms=0 WHERE id=?').bind(leaseKey).run();
  }
}

export function dailyTimeline(previous = [], clan, now) {
  const day = new Date(now).toISOString().slice(0,10);
  const point = {day,capturedAt:now,members:clan.members,trophies:clan.clanPoints,capitalPoints:clan.clanCapitalPoints,
    donations:(clan.memberList || []).reduce((n,m)=>n+(m.donations || 0),0)};
  return [...previous.filter(p=>p.day!==day && p.capturedAt>=now-31*86400000),point].slice(-32);
}
export function clanSummary(tag,saved) {
  const clan=saved?.current?.clan;const war=saved?.current?.war;
  const limit=war?.attacksPerMember ?? (war?.kind==='cwl'?1:2);
  return {tag,name:clan?.name || findClan(tag)?.name,members:clan?.members ?? null,league:clan?.warLeague?.name,
    level:clan?.clanLevel,requiredTH:clan?.requiredTownhallLevel,requiredTrophies:clan?.requiredTrophies,requiredLeague:clan?.requiredLeagueTier?.name,type:clan?.type,description:clan?.description,capitalLevel:clan?.clanCapital?.capitalHallLevel,capitalPoints:clan?.clanCapitalPoints,capitalLeague:clan?.capitalLeague?.name,
    donations:clan?.memberList?.reduce((n,m)=>n+(m.donations || 0),0),townHalls:(clan?.memberList || []).reduce((counts,m)=>{const th=m.townHallLevel || 0;counts[th]=(counts[th] || 0)+1;return counts;},{}),
    trophies:clan?.clanPoints,capturedAt:saved?.current?.capturedAt || null,health:saved?.health?.code || 'awaiting_first_sync',lastAttempt:saved?.health?.lastAttempt || null,
    warCapturedAt:saved?.current?.warCapturedAt || null,
    war:war ? {state:war.state,kind:war.kind,opponent:war.opponent?.name,stars:war.clan?.stars,enemyStars:war.opponent?.stars,
      endAt:gameTime(war.endTime),pending:war.state==='inWar'?(war.clan?.members || []).reduce((n,m)=>n+Math.max(0,limit-(m.attacks?.length || 0)),0):0}:null};
}
export function scheduledClan(now,primary) {
  const tags=CLANS.filter(c=>c.tag!==primary);
  return tags[Math.floor(now/60000)%tags.length].tag;
}
export async function synchronizeFamily(env,now=Date.now()) {
  const tag=scheduledClan(now,env.CLAN_TAG || '#R0UPVVVY');
  return familyDashboard(env,tag,now);
}
export async function recordPrimarySummary(env,now=Date.now()) {
  const [current,health,timeline]=await Promise.all([readState(env.DB,'current'),readState(env.DB,'health'),readState(env.DB,'timeline')]);
  if(!current?.clan)return;
  const tag=current.clan.tag;
  const next=dailyTimeline(timeline || [],current.clan,current.capturedAt);
  await recordRoster(env,current.clan,current.capturedAt);
  await env.DB.batch([stateStatement(env.DB,`summary:${tag}`,clanSummary(tag,{current,health})),stateStatement(env.DB,'timeline',next)]);
}
// Procura uma tag nos registros já coletados de todos os clãs. Só lê o banco; não consulta a API do jogo.
const PLAYER_TAG=/^#[0289PYLQGRJCUV]{3,15}$/;
export function isPlayerTag(value){return typeof value==='string' && PLAYER_TAG.test(value);}
export async function locatePlayer(env,playerTag,now=Date.now()){
  const rows=await env.DB.prepare("SELECT key,value FROM state WHERE key='current' OR key LIKE 'family:%'").all();
  const matches=[];
  for(const row of rows.results){
    const saved=JSON.parse(row.value);
    const isPrimary=row.key==='current';
    const clan=isPrimary?saved?.clan:saved?.current?.clan;
    const capturedAt=isPrimary?saved?.capturedAt:saved?.current?.capturedAt;
    const clanTag=isPrimary?env.CLAN_TAG:row.key.slice('family:'.length);
    const member=clan?.memberList?.find(m=>m.tag===playerTag);
    if(member)matches.push({clanTag,clanName:clan.name || findClan(clanTag)?.name || clanTag,role:member.role,townHallLevel:member.townHallLevel ?? null,capturedAt:capturedAt ?? null});
  }
  matches.sort((a,b)=>(b.capturedAt||0)-(a.capturedAt||0));
  return {player:playerTag,checkedAt:now,matches};
}
export async function familyOverview(env,now=Date.now()) {
  const [rows,goalRows]=await Promise.all([
    env.DB.prepare("SELECT value FROM state WHERE key LIKE 'summary:%'").all(),
    env.DB.prepare('SELECT clan_tag,payload FROM clan_goals').all()
  ]);
  const goals=new Map(goalRows.results.map(r=>[r.clan_tag,JSON.parse(r.payload)]));
  const summaries=new Map(rows.results.map(r=>{const s=JSON.parse(r.value);return [s.tag,s];}));
  return {generatedAt:now,intervalMinutes:15,clans:CLANS.map(c=>({...c,...summaries.get(c.tag),goals:goals.get(c.tag) || null}))};
}
