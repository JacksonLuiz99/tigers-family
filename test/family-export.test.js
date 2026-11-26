import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFamilyExport, createFamilyDownload } from '../public/family-export.js';
import { CLANS } from '../public/clans.js';

const at='2026-11-26T15:00:00.000Z',now=Date.parse(at),tag=CLANS[0].tag;
const family={clans:[{tag,label:CLANS[0].label,members:45,league:'Cristal I',capturedAt:now,warCapturedAt:now,health:'ok',leagueSeason:{season:'2026-11',rounds:[{round:1,opponent:'=Rival',stars:30,enemyStars:28,result:'Vitória',state:'warEnded'}]} }],privateContact:'DO-NOT-EXPORT'};
const results={from:now-365*86400000,to:now,clans:[{tag,wars:1,wins:1,losses:0,ties:0,scoreStars:30,attackStars:40,detailedWars:1,firstWar:now-86400000,lastWar:now-86400000}],secret:'DO-NOT-EXPORT'};
test('planilha da família tem 16 clãs, cobertura explícita e somente campos selecionados',()=>{
  const bundle=buildFamilyExport(family,results,at);
  assert.deepEqual(bundle.sheets.map(s=>s.sheet),['Resumo','Clãs','Guerras 365 dias','Liga','Rodadas da Liga']);
  assert.equal(bundle.sheets[1].rows.length,16);assert.equal(bundle.sheets[2].rows.length,16);
  assert.equal(bundle.sheets[2].rows[0][2],1);assert.equal(bundle.sheets[2].rows[1][2],null);
  assert.equal(bundle.sheets[4].rows.length,1);
  const file=createFamilyDownload(family,results,at);assert.equal(file.rows,49);assert.ok(file.filename.endsWith('.xlsx'));
  const data=new TextDecoder().decode(file.content);assert.ok(data.includes('Rodadas da Liga'));assert.ok(!data.includes('DO-NOT-EXPORT'));
  assert.ok(data.includes('=Rival'));assert.ok(!data.includes('<f>'));
});
test('exportação exige as duas consultas da família',()=>{
  assert.throws(()=>buildFamilyExport({},results,at),/disponíveis/);
  assert.throws(()=>buildFamilyExport(family,{},at),/disponíveis/);
});
