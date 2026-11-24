import test from 'node:test';
import assert from 'node:assert/strict';
import { periodWars, fairPerformance, raidParticipation, familyTotals, familyLeagueView } from '../public/intelligence.js';
const now=Date.parse('2026-11-19T12:00:00Z');
const war={state:'warEnded',endTime:'20261118T120000.000Z',startTime:'20261117T120000.000Z',opponent:{tag:'#O',members:[{tag:'#A',townhallLevel:19},{tag:'#B',townhallLevel:18}]},clan:{tag:'#C',members:[{tag:'#P',name:'Ana',townhallLevel:18,attacks:[{defenderTag:'#A',stars:2,destructionPercentage:80},{defenderTag:'#B',stars:3,destructionPercentage:100}]}]}};
test('recortes excluem guerras abertas, antigas e futuras',()=>{
  assert.equal(periodWars([war,{...war,state:'inWar'},{...war,endTime:'20250101T000000.000Z'},{...war,endTime:'20270101T000000.000Z'}],7,now).length,1);
});
test('comparações por CV calculam média só com ataques elegíveis',()=>{
  const same=fairPerformance([war],{townHall:'18',matchup:'same'});assert.equal(same[0].attacks,1);assert.equal(same[0].averageStars,3);
  const up=fairPerformance([war],{matchup:'up'});assert.equal(up[0].averageStars,2);assert.equal(up[0].tripleRate,0);
  assert.equal(fairPerformance([war],{townHall:'19'}).length,0);
});
test('CV desconhecido não é tratado como alvo de nível inferior',()=>{
  assert.equal(fairPerformance([{...war,opponent:{tag:'#O',members:[]}}],{matchup:'down'}).length,0);
});
test('mudança de CV entre guerras usa o CV do ataque de cada confronto',()=>{
  const newer={...war,startTime:'20261118T120000.000Z',endTime:'20261119T120000.000Z',clan:{...war.clan,members:war.clan.members.map(m=>({...m,townhallLevel:19}))}};
  assert.equal(fairPerformance([war,newer],{townHall:'18',matchup:'up'})[0].attacks,1);
  assert.equal(fairPerformance([war,newer],{townHall:'19',matchup:'same'})[0].attacks,1);
});
test('Capital distingue ausência de registro de participação com zero ataques',()=>{
  const rows=raidParticipation({members:[{tag:'#A',name:'Ana',attacks:0}]},[{tag:'#A',name:'Ana'},{tag:'#B',name:'Beto'}]);
  assert.equal(rows.find(m=>m.tag==='#A').recorded,true);assert.equal(rows.find(m=>m.tag==='#B').recorded,false);
});
test('totais excluem clãs antigos e guerras sem atualização recente',()=>{
  const stats=familyTotals([{members:40,capturedAt:now,warCapturedAt:now,war:{state:'inWar',pending:5}},{members:50,capturedAt:now-31*60000,war:{state:'inWar',pending:30}},{members:48,capturedAt:now,warCapturedAt:now-40*60000,war:{state:'inWar',pending:9}}],now);
  assert.deepEqual(stats,{fresh:2,members:88,vacancies:12,wars:1,pending:5});
});
test('visão da Liga não trata guerra privada ou dados antigos como confronto ativo',()=>{
  const round={round:2,state:'inWar',opponent:'Rival',stars:15,enemyStars:12};
  const clan={capturedAt:now,warCapturedAt:now,health:'ok',war:{kind:'cwl',season:'2026-11',round:2,state:'inWar'},leagueSeason:{season:'2026-11',rounds:[round]}};
  assert.equal(familyLeagueView(clan,now).status,'EM GUERRA');
  assert.equal(familyLeagueView({...clan,health:'api_http_403'},now).status,'GUERRA PRIVADA');
  assert.equal(familyLeagueView({...clan,warCapturedAt:now-31*60000},now).status,'DADOS ANTIGOS');
  assert.equal(familyLeagueView({...clan,war:{kind:'regular',state:'inWar'}},now).active,false);
});
