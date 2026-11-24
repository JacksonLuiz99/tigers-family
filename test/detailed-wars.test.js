import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { detailedWarRow, recordDetailedWars, detailedRanking, historyRange } from '../worker/detailed-wars.js';

const tag='#R0UPVVVY';const other='#28L88PQ2';
const now=Date.parse('2026-11-24T16:00:00Z');
const war={state:'warEnded',endTime:'20261119T010000.000Z',startTime:'20261118T010000.000Z',teamSize:1,
  clan:{tag,stars:2,members:[{tag:'#PLAYER',name:'Ana',townhallLevel:18,attacks:[{stars:3,destructionPercentage:100}]}]},
  opponent:{tag:'#ENEMY',stars:1,members:[]}};
function database(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0006_detailed_wars.sql',import.meta.url),'utf8'));
  const statement=(q,args=[])=>({bind(...values){return statement(q,values);},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return sql.prepare(q).run(...args);}});
  return {prepare:q=>statement(q),close:()=>sql.close()};
}
test('histórico detalhado aceita só guerras encerradas com escalação completa do clã',()=>{
  assert.ok(detailedWarRow(tag,war,now));
  assert.equal(detailedWarRow(tag,{...war,state:'inWar'},now),null);
  assert.equal(detailedWarRow(tag,{...war,teamSize:2},now),null);
  assert.equal(detailedWarRow(other,war,now),null);
});
test('período usa dias de Cuiabá e limita a retenção a 270 dias',()=>{
  assert.ok(historyRange('2026-11-18','2026-11-18',now));
  assert.equal(historyRange('2026-02-01','2026-11-18',now),null);
  assert.equal(historyRange('2026-11-31','2026-11-30',now),null);
  assert.equal(historyRange('2026-11-20','2026-11-18',now),null);
});
test('consulta filtra datas, deduplica guerra e devolve só métricas do ranking',async()=>{
  const db=database();await recordDetailedWars(db,tag,[war,war],now);
  await recordDetailedWars(db,other,[{...war,clan:{...war.clan,tag:other}}],now);
  const result=await detailedRanking(db,tag,'2026-11-18','2026-11-18',now);
  assert.equal(result.wars,1);assert.equal(result.players[0].stars,3);
  assert.equal(result.players[0].attacks,1);assert.ok(!('hits' in result.players[0]));
  assert.equal(result.coverage.total,1);
  assert.equal((await detailedRanking(db,tag,'2026-11-19','2026-11-19',now)).wars,0);
  assert.equal((await detailedRanking(db,other,'','',now)).wars,1);
  db.close();
});
