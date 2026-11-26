import test from 'node:test';
import assert from 'node:assert/strict';
import { familyWarStatus } from '../public/family-operations.js';

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
