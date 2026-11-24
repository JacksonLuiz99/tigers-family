import test from 'node:test';
import assert from 'node:assert/strict';
import { performance, mergedHistory, publicLinks, outcome, podiumHighlights, attackStars } from '../public/stats.js';
test('distribuição conta ataques por estrelas sem usar o placar',()=>{
  assert.deepEqual(attackStars(war()).counts,[0,0,1,2]);
  assert.equal(attackStars(war()).total,3);
  assert.deepEqual(attackStars(null).percentages,[0,0,0,0]);
});
const war = (state = 'inWar') => ({ state, kind:'regular', startTime:'20261118T010000.000Z',endTime:'20261119T010000.000Z',teamSize:2,
  clan:{tag:'#HOME',stars:5,destructionPercentage:95,members:[
    {tag:'#A',name:'Ana',townhallLevel:19,mapPosition:1,attacks:[{stars:3,destructionPercentage:100,duration:120,defenderTag:'#X'},{stars:3,destructionPercentage:100,duration:130,defenderTag:'#Y'}]},
    {tag:'#B',name:'Beto',townhallLevel:18,mapPosition:2,attacks:[{stars:2,destructionPercentage:90,duration:150,defenderTag:'#Y'}]}
  ]},opponent:{tag:'#AWAY',name:'Adversário',stars:4,destructionPercentage:80,members:[{tag:'#X',name:'Alvo',townhallLevel:19,mapPosition:1}]}});
test('ranking conta estrelas dos ataques sem confundir com placar do clã',()=>{
  const result=performance([war()]);assert.equal(result[0].stars,6);assert.equal(result[0].triples,2);
  assert.equal(result[0].averageStars,3);assert.equal(result[0].participation,100);assert.equal(result[1].participation,50);
  assert.equal(result[0].hits[0].targetName,'Alvo');assert.equal(result[0].hits[0].targetTH,19);
});
test('ranking não duplica guerra atual também presente no histórico',()=>{
  const result=performance([war(),war()]);assert.equal(result[0].attacks,2);assert.equal(result[0].wars,1);
});
test('histórico de desempenho ignora preparação, resumo e guerra ainda em andamento',()=>{
  const summary={...war('warEnded'),clan:{stars:5}};
  assert.equal(performance([war(),war('preparation'),summary],{completedOnly:true}).length,0);
  assert.equal(performance([war('warEnded')],{completedOnly:true}).length,2);
});
test('participante sem ataque não ganha destaque fictício nem divisão por zero',()=>{
  const w=war();w.clan.members[0].attacks=[];
  const player=performance([w]).find(p=>p.tag==='#A');assert.equal(player.averageDamage,0);assert.equal(player.tripleRate,0);assert.equal(player.averageDuration,null);
});
test('Liga tem um ataque por jogador quando limite não foi informado',()=>{
  const w=war();w.kind='cwl';w.clan.members[0].attacks=w.clan.members[0].attacks.slice(0,1);
  assert.equal(performance([w])[0].expected,1);
});
test('histórico unifica resumo da API e dados detalhados sem repetir resultado',()=>{
  const w=war('warEnded');const summary={...w,result:'win',clan:{stars:5},opponent:{tag:'#AWAY',stars:4}};
  const merged=mergedHistory([w],[summary]);assert.equal(merged.length,1);assert.equal(merged[0].source,'monitor');assert.equal(merged[0].clan.members.length,2);assert.equal(outcome(merged[0]),'Vitória');
});
test('links públicos aceitam convite e recusam webhook e scripts',()=>{
  assert.equal(publicLinks({DISCORD_PUBLIC_URL:'https://discord.gg/EmJeAWjBg'}).discord,'https://discord.gg/EmJeAWjBg');
  assert.equal(publicLinks({DISCORD_PUBLIC_URL:'https://discord.com/api/webhooks/123/secret'}).discord,null);
  assert.equal(publicLinks({DISCORD_PUBLIC_URL:'javascript:alert(1)'}).discord,null);
});

test('pódio destaca até três guerreiros com ataques e não preenche vagas fictícias',()=>{
  const players=performance([war()]);players.push({tag:'#C',name:'Cris',attacks:0,stars:0});
  const podium=podiumHighlights(players);assert.equal(podium.length,2);assert.equal(podium[0].tag,'#A');assert.equal(podium[1].tag,'#B');
  assert.equal(podiumHighlights([{tag:'#C',attacks:0}]).length,0);
});
test('pódio identifica empate inclusive com guerreiros além dos três exibidos',()=>{
  const players=['A','B','C','D'].map(tag=>({tag,name:tag,attacks:2,stars:6,triples:2,averageDamage:100}));
  const podium=podiumHighlights(players);
  assert.equal(podium.length,3);assert.deepEqual(podium.map(p=>p.slot),[1,2,3]);
  assert.ok(podium.every(p=>p.tiedWith===3));assert.ok(!('tiedWith' in players[0]));
});
test('pódio não declara empate quando a destruição média difere',()=>{
  const players=[{tag:'#A',attacks:2,stars:5,triples:1,averageDamage:99},{tag:'#B',attacks:2,stars:5,triples:1,averageDamage:98}];
  assert.ok(podiumHighlights(players).every(p=>p.tiedWith===0));
});
