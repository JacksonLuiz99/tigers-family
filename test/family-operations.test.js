import test from 'node:test';
import assert from 'node:assert/strict';
import { familyWarStatus, prioritizeFamilyWars } from '../public/family-operations.js';

test('visão da família não declara pendências sem coleta confirmada',()=>{
  const payload={clanTag:'#R0UPVVVY',current:{clan:{tag:'#R0UPVVVY'},war:{state:'inWar'}},health:{code:'api_http_403'}};
  const result=familyWarStatus(payload);
  assert.equal(result.kind,'unavailable');assert.match(result.label,/restringe/);
  assert.equal(familyWarStatus({...payload,current:{...payload.current,war:{state:'preparation'}},health:{code:'ok'}}).kind,'preparation');
});
test('visão conta somente ataques confirmados e distingue guerra concluída',()=>{
  const now=Date.parse('2026-11-26T15:00:00Z');
  const tag='#R0UPVVVY';
  const payload={clanTag:tag,configured:true,health:{code:'ok'},current:{capturedAt:now,warCapturedAt:now,clan:{tag,name:'Tigers'},war:{state:'inWar',kind:'regular',teamSize:1,endTime:'20261126T170000.000Z',clan:{tag,members:[{tag:'#98Q9LLG2P',name:'Ana',mapPosition:1,attacks:[{}]}]},opponent:{name:'Rival'}}}};
  const pending=familyWarStatus(payload,{now});assert.equal(pending.kind,'pending');assert.equal(pending.attacks,1);
  payload.current.war.clan.members[0].attacks=[{},{}];assert.equal(familyWarStatus(payload,{now}).kind,'complete');
  assert.equal(familyWarStatus(payload,{now:now+11*60000}).kind,'unavailable');
});
test('prioridade põe prazo próximo primeiro e remove pendência quando a coleta envelhece',()=>{
  const now=Date.parse('2026-11-27T12:00:00Z');
  const active=(tag,minutes)=>({clanTag:tag,configured:true,health:{code:'ok'},current:{capturedAt:now,warCapturedAt:now,clan:{tag,name:'Tigers'},war:{state:'inWar',kind:'regular',teamSize:1,endTime:new Date(now+minutes*60000).toISOString().slice(0,19).replace(/[-:]/g,'')+'.000Z',clan:{tag,members:[{tag:'#98Q9LLG2P',name:'Ana',mapPosition:1,attacks:[{stars:2}]}]},opponent:{name:'Rival'}}}});
  const rows=[{clan:{tag:'#R0UPVVVY',label:'TOW 4'},payload:active('#R0UPVVVY',120)},{clan:{tag:'#28L88PQ2',label:'TOW 1'},payload:active('#28L88PQ2',60)},{clan:{tag:'#QC9RY8GJ',label:'TOW 3'},status:{kind:'unavailable',label:'Sem coleta'}}];
  const ranked=prioritizeFamilyWars(rows,{now});assert.deepEqual(ranked.map(r=>r.clan.label),['TOW 1','TOW 4','TOW 3']);
  assert.equal(ranked[0].status.endAt,now+60*60000);
  const later=prioritizeFamilyWars(rows,{now:now+11*60000});
  assert.equal(later.find(r=>r.clan.label==='TOW 4').status.kind,'unavailable');
});
