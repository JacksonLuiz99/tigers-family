import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { warResultRow, recordWarResults, familyResults, backfillAnnualResults } from '../worker/results.js';
import { recordDetailedWars } from '../worker/detailed-wars.js';

const tag='#R0UPVVVY';
const now=Date.parse('2026-11-24T16:00:00Z');
const war={state:'warEnded',endTime:'20261120T010000.000Z',teamSize:2,
  clan:{tag,stars:5,destructionPercentage:80,members:[{tag:'#A',attacks:[{stars:3},{stars:3}]},{tag:'#B'}]},
  opponent:{tag:'#ENEMY',stars:4,destructionPercentage:70}};
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0005_family_results.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0006_detailed_wars.sql',import.meta.url),'utf8'));
  const statement=(q,args=[])=>({bind(...values){return statement(q,values);},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return sql.prepare(q).run(...args);}});
  return {prepare:q=>statement(q),close:()=>sql.close()};
}
test('resumo anual separa estrelas do placar e dos ataques',()=>{
  const row=warResultRow(tag,war);
  assert.equal(row.scoreStars,5);assert.equal(row.attackStars,6);assert.equal(row.detailed,1);
  assert.equal(warResultRow(tag,{...war,state:'inWar'}),null);
  assert.equal(warResultRow('#UNKNOWN',war),null);
});
test('resumo da API não apaga detalhes já salvos e não duplica a guerra',async()=>{
  const db=database();
  const summary={...war,clan:{tag,stars:5},result:'win'};
  await recordWarResults(db,tag,[war,summary],now);
  await recordWarResults(db,tag,[summary],now);
  const result=await familyResults(db,now);
  assert.equal(result.clans.length,1);assert.equal(result.clans[0].wars,1);
  assert.equal(result.clans[0].wins,1);assert.equal(result.clans[0].detailedWars,1);
  assert.equal(result.clans[0].attackStars,6);db.close();
});
test('guerras mais antigas que um ano não entram no comparativo',async()=>{
  const db=database();
  await recordWarResults(db,tag,[{...war,endTime:'20251001T010000.000Z'},war],now);
  assert.equal((await familyResults(db,now)).clans[0].wars,1);db.close();
});
test('guerras detalhadas existentes alimentam o comparativo anual na primeira coleta',async()=>{
  const db=database();await recordDetailedWars(db,tag,[war],now);
  assert.equal((await familyResults(db,now)).clans.length,0);
  await backfillAnnualResults(db,tag,now);
  assert.equal((await familyResults(db,now)).clans[0].wins,1);db.close();
});
