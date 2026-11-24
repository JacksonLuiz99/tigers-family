import { parseGameTime, performance } from '../public/stats.js';
import { findClan } from '../public/clans.js';

const DAY=86400000;
const RETENTION=270*DAY;
const MAX_WARS=250;
export function detailedWarRow(tag,war,now=Date.now()) {
  if(!findClan(tag) || war?.state!=='warEnded' || war.clan?.tag!==tag || !war.opponent || !Array.isArray(war.clan.members) ||
    !Number.isInteger(war.teamSize) || war.teamSize<1 || war.clan.members.length!==war.teamSize ||
    war.clan.members.some(m=>!m?.tag || (m.attacks!=null && !Array.isArray(m.attacks))) ||
    new Set(war.clan.members.map(m=>m.tag)).size!==war.teamSize ||
    (war.opponent.members!=null && !Array.isArray(war.opponent.members))) return null;
  const endAt=parseGameTime(war.endTime);
  if(!Number.isFinite(endAt) || endAt<now-RETENTION || endAt>now) return null;
  const opponent=war.opponent.tag || war.opponent.name;
  if(!opponent) return null;
  return {id:`${tag}:${war.endTime}:${opponent}`,tag,endAt,payload:JSON.stringify(war)};
}

export async function recordDetailedWars(db,tag,wars,now=Date.now()) {
  const rows=new Map();
  for(const war of wars || []) {const row=detailedWarRow(tag,war,now);if(row)rows.set(row.id,row);}
  for(const row of rows.values()) await db.prepare('INSERT INTO detailed_wars(id,clan_tag,end_at,payload) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload WHERE detailed_wars.payload<>excluded.payload')
    .bind(row.id,row.tag,row.endAt,row.payload).run();
  await db.prepare('DELETE FROM detailed_wars WHERE end_at < ?').bind(now-RETENTION).run();
}

function dayStart(value) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year,month,day]=value.split('-').map(Number);
  const check=new Date(Date.UTC(year,month-1,day));
  if(check.toISOString().slice(0,10)!==value) return null;
  return Date.parse(`${value}T00:00:00-04:00`);
}

export function historyRange(from,to,now=Date.now()) {
  const start=from ? dayStart(from) : now-RETENTION;
  const exclusiveEnd=to ? dayStart(to)+DAY : now+1;
  if(!Number.isFinite(start) || !Number.isFinite(exclusiveEnd) || start>now || start>=exclusiveEnd || exclusiveEnd-start>RETENTION+DAY || start<now-RETENTION) return null;
  return {start,end:Math.min(exclusiveEnd,now+1)};
}

export async function detailedRanking(db,tag,from='',to='',now=Date.now()) {
  if(!findClan(tag)) return {error:'unknown_clan'};
  const range=historyRange(from,to,now);
  if(!range) return {error:'invalid_period'};
  const [rows,coverage]=await Promise.all([
    db.prepare('SELECT payload FROM detailed_wars WHERE clan_tag=? AND end_at>=? AND end_at<? ORDER BY end_at DESC LIMIT ?').bind(tag,range.start,range.end,MAX_WARS+1).all(),
    db.prepare('SELECT MIN(end_at) AS earliest,MAX(end_at) AS latest,COUNT(*) AS total FROM detailed_wars WHERE clan_tag=?').bind(tag).first()
  ]);
  const truncated=rows.results.length>MAX_WARS;
  const wars=rows.results.slice(0,MAX_WARS).map(row=>JSON.parse(row.payload));
  const players=performance(wars,{completedOnly:true}).map(({tag,name,townHall,wars,attacks,expected,stars,triples,averageStars,averageDamage})=>
    ({tag,name,townHall,wars,attacks,expected,stars,triples,averageStars,averageDamage}));
  return {tag,from:range.start,to:range.end-1,wars:wars.length,players,
    coverage:{earliest:coverage?.earliest || null,latest:coverage?.latest || null,total:coverage?.total || 0,truncated}};
}
