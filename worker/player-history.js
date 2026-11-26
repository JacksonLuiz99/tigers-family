import { historyRange } from './detailed-wars.js';
import { playerEvolution } from './management.js';
import { findClan } from '../public/clans.js';

export class PlayerHistoryInputError extends Error {}
const PLAYER_TAG=/^#[0289PYLQGRJCUV]{3,14}$/;
const DAY=86400000;
export async function playerHistory(env,tag,from='',to='',now=Date.now()) {
  if(!PLAYER_TAG.test(tag || ''))throw new PlayerHistoryInputError('Tag do jogador inválida.');
  const range=historyRange(from,to,now);if(!range)throw new PlayerHistoryInputError('Escolha um período válido dentro dos últimos 270 dias.');
  const [warsResult,movesResult,evolution]=await Promise.all([
    env.DB.prepare(`SELECT d.clan_tag AS clanTag,d.end_at AS endAt,d.payload
      FROM detailed_wars d,json_each(d.payload,'$.clan.members') member
      WHERE json_extract(member.value,'$.tag')=? AND d.end_at>=? AND d.end_at<?
      ORDER BY d.end_at DESC LIMIT 251`).bind(tag,range.start,range.end).all(),
    env.DB.prepare('SELECT clan_tag AS clanTag,name,kind,detected_at AS detectedAt FROM roster_moves WHERE player_tag=? AND detected_at>=? AND detected_at<? ORDER BY detected_at DESC LIMIT 101').bind(tag,Math.max(range.start,now-90*DAY),range.end).all(),
    playerEvolution(env,tag,now)
  ]);
  const wars=warsResult.results.slice(0,250).map(row=>{
    const war=JSON.parse(row.payload),member=war.clan.members.find(m=>m.tag===tag);
    const attacks=(member.attacks || []).filter(a=>Number.isInteger(a.stars)&&a.stars>=0&&a.stars<=3);
    return {clanTag:row.clanTag,endAt:row.endAt,kind:war.kind || 'regular',opponent:war.opponent?.name || 'Adversário',name:member.name,
      used:attacks.length,available:war.attacksPerMember ?? (war.kind==='cwl'?1:2),stars:attacks.reduce((n,a)=>n+a.stars,0),triples:attacks.filter(a=>a.stars===3).length};
  }).filter(w=>findClan(w.clanTag));
  return {playerTag:tag,from:range.start,to:range.end-1,wars,moves:movesResult.results.filter(m=>findClan(m.clanTag)),points:evolution.points.filter(p=>p.capturedAt>=range.start&&p.capturedAt<range.end),
    coverage:{warsDays:270,movesDays:90,pointsDays:32,warsTruncated:warsResult.results.length>250,movesTruncated:movesResult.results.length>100}};
}
