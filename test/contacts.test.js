import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { route } from '../worker/index.js';
import { normalizePhone } from '../worker/contacts.js';

const tag='#R0UPVVVY';const player='#98Q9LLG2P';const token='a'.repeat(40);
function database(){const sql=new DatabaseSync(':memory:');for(const file of ['0001_init.sql','0002_management.sql','0007_player_contacts.sql'])sql.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const statement=(q,args=[])=>({bind(...values){return statement(q,values);},async first(){return sql.prepare(q).get(...args)||null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return sql.prepare(q).run(...args);}});
  return {prepare:q=>statement(q),close:()=>sql.close()};}
const request=(method,path,body,authorized=true)=>new Request('https://test'+path,{method,headers:{...(authorized?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
test('telefone exige código do país e formato válido',()=>{
 assert.equal(normalizePhone('+55 (65) 99999-9999'),'5565999999999');
 for(const value of ['123','+00123456789','javascript:alert(1)','1234567890123456'])assert.throws(()=>normalizePhone(value));
});
test('contatos só aparecem para liderança e ficam isolados por clã',async()=>{
 const DB=database();const env={DB,LEADERSHIP_TOKEN:token};const path='/api/leadership-contacts';
 assert.equal((await route(request('GET',path+'?clan='+encodeURIComponent(tag),null,false),env)).status,401);
 assert.equal((await route(request('POST',path,{clanTag:tag,playerTag:player,phone:'+55 65 99999-9999'},false),env)).status,401);
 assert.equal((await route(request('POST',path,{clanTag:tag,playerTag:player,phone:'+55 65 99999-9999'}),env)).status,200);
 const own=await route(request('GET',path+'?clan='+encodeURIComponent(tag)),env);assert.equal(own.headers.get('Cache-Control'),'no-store');
 assert.equal((await own.json()).contacts[0].phone,'5565999999999');
 const other=await route(request('GET',path+'?clan=%2328L88PQ2'),env);assert.equal((await other.json()).contacts.length,0);
 assert.equal((await route(request('POST',path,{clanTag:tag,playerTag:player,phone:null}),env)).status,200);
 assert.equal((await (await route(request('GET',path+'?clan='+encodeURIComponent(tag)),env)).json()).contacts.length,0);DB.close();
});
test('rota rejeita tag inválida, JSON grande e não aceita escrita pública',async()=>{
 const DB=database();const env={DB,LEADERSHIP_TOKEN:token};const path='/api/leadership-contacts';
 assert.equal((await route(request('POST',path,{clanTag:tag,playerTag:'#INVALID',phone:'5565999999999'}),env)).status,400);
 assert.equal((await route(request('POST',path,{clanTag:tag,playerTag:player}),env)).status,400);
 assert.equal((await route(request('POST',path,{clanTag:tag,playerTag:player,phone:'1'.repeat(5000)}),env)).status,413);
 assert.equal((await route(request('GET',path+'?clan=%23INVALID'),env)).status,400);DB.close();
});
