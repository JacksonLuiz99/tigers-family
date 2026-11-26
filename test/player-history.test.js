import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { playerHistory } from '../worker/player-history.js';
import { route } from '../worker/index.js';

const now=Date.parse('2026-11-26T15:00:00Z'),tag='#98Q9LLG2P',clan='#R0UPVVVY',token='a'.repeat(40);
function database(){const sql=new DatabaseSync(':memory:');for(const file of ['0001_init.sql','0002_management.sql','0006_detailed_wars.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const statement=(q,args=[])=>({bind(...values){return statement(q,values);},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return sql.prepare(q).run(...args);}});
  return {prepare:q=>statement(q),close:()=>sql.close()};}
test('histórico reúne guerras, movimentos e coletas do jogador sem misturar outro atacante',async()=>{
  const DB=database(),end=now-86400000;
  const war={kind:'regular',opponent:{name:'Rival'},clan:{members:[{tag,name:'Ana',attacks:[{stars:3},{stars:2}]},{tag:'#QC9RY8GJ',name:'Beto',attacks:[{stars:1}]}]}};
  await DB.prepare('INSERT INTO detailed_wars(id,clan_tag,end_at,payload) VALUES (?,?,?,?)').bind('w1',clan,end,JSON.stringify(war)).run();
  await DB.prepare('INSERT INTO roster_moves(id,clan_tag,player_tag,name,kind,detected_at) VALUES (?,?,?,?,?,?)').bind('m1',clan,tag,'Ana','join',now-2*86400000).run();
  await DB.prepare('INSERT INTO roster_days(clan_tag,day,captured_at,payload) VALUES (?,?,?,?)').bind(clan,'2026-11-26',now,JSON.stringify([{tag,name:'Ana',townHallLevel:17}])).run();
  const result=await playerHistory({DB},tag,'','',now);
  assert.equal(result.wars.length,1);assert.deepEqual([result.wars[0].stars,result.wars[0].triples,result.wars[0].used],[5,1,2]);
  assert.equal(result.moves[0].kind,'join');assert.equal(result.points[0].townHallLevel,17);
  assert.deepEqual((await playerHistory({DB},'#QC9RY8GJ','','',now)).wars.map(w=>w.stars),[1]);DB.close();
});
test('rota do histórico exige liderança e valida tag e período',async()=>{
  const DB=database(),env={DB,LEADERSHIP_TOKEN:token};
  const req=(path,auth=true)=>new Request('https://test'+path,{headers:auth?{Authorization:'Bearer '+token}:{}});
  const path='/api/leadership-player-history?player='+encodeURIComponent(tag);
  assert.equal((await route(req(path,false),env)).status,401);
  const ok=await route(req(path),env);assert.equal(ok.status,200);assert.equal(ok.headers.get('Cache-Control'),'no-store');
  assert.equal((await route(req('/api/leadership-player-history?player=%23INVALID'),env)).status,400);
  assert.equal((await route(req(path+'&from=2020-01-01'),env)).status,400);DB.close();
});
