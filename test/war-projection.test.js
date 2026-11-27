import test from 'node:test';
import assert from 'node:assert/strict';
import { warProjection } from '../public/war-projection.js';

const now=Date.parse('2026-11-26T16:00:00Z'),clan='#R0UPVVVY';
function payload(){
  const tags=['#98Q9LLG2P','#QC9RY8GJ','#28L88PQ2','#202YP22U9','#222RQ2C22'];
  const opponent=tags.map((tag,i)=>({tag,name:`Alvo ${i+1}`,mapPosition:i+1}));
  return {clanTag:clan,configured:true,health:{code:'ok'},current:{capturedAt:now,warCapturedAt:now,clan:{tag:clan,name:'Tigers'},war:{state:'inWar',kind:'regular',teamSize:5,endTime:'20261126T180000.000Z',clan:{tag:clan,members:tags.map((tag,i)=>({tag,name:`Jogador ${i+1}`,mapPosition:i+1,attacks:[]}))},opponent:{name:'Rival',members:opponent}}}};
}
test('projeção espera amostra mínima e conta bases únicas, não ataques repetidos',()=>{
  const p=payload(),members=p.current.war.clan.members,targets=p.current.war.opponent.members;
  assert.equal(warProjection(p,{now}).kind,'insufficient');
  members[0].attacks=[{stars:3,defenderTag:targets[0].tag}];
  members[1].attacks=[{stars:3,defenderTag:targets[0].tag}];
  members[2].attacks=[{stars:3,defenderTag:targets[1].tag}];
  members[3].attacks=[{stars:2,defenderTag:targets[2].tag}];
  const result=warProjection(p,{now});assert.equal(result.kind,'estimate');assert.equal(result.triples,3);
  assert.equal(result.basesMissing,3);assert.equal(result.remaining,6);assert.equal(result.neededRate,50);
  assert.match(result.message,/Se todos os 6 ataques restantes forem realizados/);
  assert.match(result.message,/repetidos no mesmo alvo/);
});
test('projeção não usa guerra privada, coleta antiga ou ataques incompletos',()=>{
  const p=payload();p.health.code='api_http_403';assert.equal(warProjection(p,{now}).kind,'unavailable');
  p.health.code='ok';assert.equal(warProjection(p,{now:now+11*60000}).kind,'unavailable');
  p.current.war.clan.members[0].attacks=[{defenderTag:p.current.war.opponent.members[0].tag}];
  assert.equal(warProjection(p,{now}).kind,'unavailable');
});
