import { parseGameTime, outcome } from '../public/stats.js';
import { CLANS } from '../public/clans.js';

export function warResultRow(clanTag, war) {
  if (!CLANS.some(c => c.tag === clanTag) || !war?.clan || !war?.opponent || war.clan.tag !== clanTag) return null;
  if (war.state && war.state !== 'warEnded') return null;
  const endAt = parseGameTime(war.endTime);
  const score = war.clan.stars;
  const opponent = war.opponent.tag || war.opponent.name;
  if (!Number.isFinite(endAt) || !Number.isInteger(score) || score < 0 || !opponent) return null;
  const result = outcome({...war,state:'warEnded'});
  if (!['Vitória','Derrota','Empate'].includes(result)) return null;
  const members = war.clan.members;
  const detailed = Array.isArray(members) && members.length === war.teamSize && members.every(m => m.attacks == null || Array.isArray(m.attacks));
  const attackStars = detailed ? members.reduce((total,m) => total + (m.attacks || []).reduce((sum,a) => sum + (Number.isInteger(a.stars) && a.stars >= 0 && a.stars <= 3 ? a.stars : 0),0),0) : null;
  return {id:`${clanTag}:${war.endTime}:${opponent}`,clanTag,endAt,outcome:result,scoreStars:score,attackStars,detailed:Number(detailed)};
}

export async function recordWarResults(db, clanTag, wars, now = Date.now()) {
  const rows = new Map();
  for (const war of wars || []) {
    const row = warResultRow(clanTag,war);
    if (row && row.endAt >= now - 366*86400000 && row.endAt <= now) {
      const previous = rows.get(row.id);
      if (!previous || row.detailed >= previous.detailed) rows.set(row.id,row);
    }
  }
  for (const row of rows.values()) await db.prepare(`INSERT INTO family_war_results(id,clan_tag,end_at,outcome,score_stars,attack_stars,detailed)
    VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET outcome=excluded.outcome,score_stars=excluded.score_stars,
    attack_stars=CASE WHEN excluded.detailed=1 THEN excluded.attack_stars ELSE family_war_results.attack_stars END,
    detailed=MAX(family_war_results.detailed,excluded.detailed)
    WHERE family_war_results.outcome<>excluded.outcome OR family_war_results.score_stars<>excluded.score_stars
      OR (excluded.detailed=1 AND (family_war_results.detailed=0 OR family_war_results.attack_stars<>excluded.attack_stars))`).bind(row.id,row.clanTag,row.endAt,row.outcome,row.scoreStars,row.attackStars,row.detailed).run();
  await db.prepare('DELETE FROM family_war_results WHERE end_at < ?').bind(now-366*86400000).run();
}

export async function familyResults(db, now = Date.now()) {
  const from = now - 365*86400000;
  const result = await db.prepare(`SELECT clan_tag AS tag,COUNT(*) AS wars,
    SUM(CASE WHEN outcome='Vitória' THEN 1 ELSE 0 END) AS wins,
    SUM(CASE WHEN outcome='Derrota' THEN 1 ELSE 0 END) AS losses,
    SUM(CASE WHEN outcome='Empate' THEN 1 ELSE 0 END) AS ties,
    SUM(score_stars) AS scoreStars,SUM(attack_stars) AS attackStars,
    SUM(detailed) AS detailedWars,MIN(end_at) AS firstWar,MAX(end_at) AS lastWar
    FROM family_war_results WHERE end_at >= ? AND end_at <= ? GROUP BY clan_tag`).bind(from,now).all();
  return {from,to:now,clans:result.results};
}

export async function backfillAnnualResults(db, clanTag, now = Date.now()) {
  const rows=await db.prepare('SELECT payload FROM detailed_wars WHERE clan_tag=? AND end_at>=? ORDER BY end_at DESC').bind(clanTag,now-366*86400000).all();
  await recordWarResults(db,clanTag,rows.results.map(row=>JSON.parse(row.payload)),now);
}
