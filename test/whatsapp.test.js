import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingMessage, individualMessage, whatsappUrl, messageName } from '../public/whatsapp.js';
const now=Date.parse('2026-11-19T12:00:00Z');const tag='#R0UPVVVY';
function payload(){return {configured:true,clanTag:tag,health:{code:'ok'},current:{capturedAt:now,warCapturedAt:now,clan:{tag,name:'TIGERS OF WAR 4'},war:{state:'inWar',kind:'regular',teamSize:3,endTime:'20261119T133000.000Z',clan:{tag,stars:3,members:[{tag:'#98Q9LLG2P',name:'Ana',mapPosition:2,attacks:[{stars:3}]},{tag:'#QC9RY8GJ',name:'João 🐯',mapPosition:1},{tag:'#28L88PQ2',name:'Beto',mapPosition:3,attacks:[{stars:0},{stars:0}]}]},opponent:{tag:'#202YP22U9',name:'Adversário',stars:2}}}};}
test('mensagem lista os ataques primeiro, ordena por posição e mostra coleta e prazo em Brasília',()=>{
 const result=pendingMessage(payload(),{now});assert.equal(result.attacks,3);assert.equal(result.players,2);assert.ok(result.text.indexOf('#1 João')<result.text.indexOf('#2 Ana'));
 assert.ok(result.text.indexOf('ATAQUES PENDENTES')<result.text.indexOf('Contra'));assert.match(result.text,/\*3 ataques\* · 2 guerreiros/);
 assert.match(result.text,/• #1 João 🐯 — 2\n• #2 Ana — 1/);assert.ok(!result.text.includes('Beto'));assert.ok(!result.text.includes('Cuiabá'));
 assert.match(result.text,/Faltam 1h30 · término 19\/11\/2026, 10:30 \(Brasília\)/);assert.match(result.text,/Coleta: 19\/11\/2026, 09:00 \(Brasília\)/);assert.match(result.text,/TIGERS OF WAR 4/);
});
test('tags são opcionais e CWL exige um ataque por jogador',()=>{
 const input=payload();input.current.war.kind='cwl';input.current.war.attacksPerMember=1;input.current.war.clan.members=input.current.war.clan.members.slice(0,2);input.current.war.teamSize=2;
 const result=pendingMessage(input,{now,includeTags:true});assert.equal(result.attacks,1);assert.equal(result.players,1);assert.match(result.text,/CWL/);assert.match(result.text,/João 🐯 \(#QC9RY8GJ\) — 1/);
 assert.ok(!pendingMessage(payload(),{now}).text.includes('(#QC9RY8GJ)'));
});
test('bloqueia guerras privadas, parciais, fora do prazo ou sem monitor configurado',()=>{
 for(const code of ['api_http_403','cwl_partial','api_network']){const p=payload();p.health.code=code;assert.throws(()=>pendingMessage(p,{now}));}
 for(const state of ['preparation','warEnded']){const p=payload();p.current.war.state=state;assert.throws(()=>pendingMessage(p,{now}));}
 assert.throws(()=>pendingMessage(payload(),{now:now+2*3600000}));
 const p=payload();p.configured=false;assert.throws(()=>pendingMessage(p,{now}));
});
test('rejeita respostas de outro clã e dados antigos nos limites de cada clã',()=>{
 const p=payload();p.current.war.clan.tag='#202YP22U9';assert.throws(()=>pendingMessage(p,{now}));
 assert.throws(()=>pendingMessage(payload(),{now:now+11*60000}));
 const other=payload();other.clanTag='#28L88PQ2';other.current.clan.tag=other.clanTag;other.current.war.clan.tag=other.clanTag;
 assert.equal(pendingMessage(other,{now:now+20*60000}).attacks,3);assert.throws(()=>pendingMessage(other,{now:now+31*60000}));
});
test('não inventa ataques a partir de uma escalação incompleta ou duplicada',()=>{
 const missing=payload();missing.current.war.clan.members.pop();assert.throws(()=>pendingMessage(missing,{now}),/incompleta/);
 const duplicated=payload();duplicated.current.war.clan.members[1].tag=duplicated.current.war.clan.members[0].tag;assert.throws(()=>pendingMessage(duplicated,{now}));
 const invalid=payload();invalid.current.war.clan.members[0].attacks=[{},{},{}];assert.throws(()=>pendingMessage(invalid,{now}));
});
test('sem pendências informa missão cumprida em vez de criar uma cobrança vazia',()=>{
 const p=payload();p.current.war.clan.members.forEach(m=>m.attacks=[{},{}]);assert.throws(()=>pendingMessage(p,{now}),/Missão cumprida/);
});
test('nomes não injetam quebras de linha ou formatação e Unicode é preservado',()=>{
 assert.equal(messageName('*Ana*\n_@todos_\u202e ~teste~'),'Ana @todos teste');
 const p=payload();p.current.war.opponent.name='*Oponente*\nFalso';const text=pendingMessage(p,{now}).text;assert.match(text,/Contra Oponente Falso/);assert.ok(!text.includes('\nFalso'));
});
test('link do WhatsApp codifica texto inteiro sem número ou grupo pré-selecionado',()=>{
 const text=pendingMessage(payload(),{now}).text;const url=new URL(whatsappUrl(text));assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/');assert.equal(url.searchParams.get('text'),text);assert.equal(url.searchParams.has('phone'),false);
});
test('cobrança individual usa somente pendência confirmada e revalida o prazo',()=>{
 const message=individualMessage(payload(),'#QC9RY8GJ',{now});
 assert.equal(message.player.remaining,2);assert.match(message.text,/Oi, João 🐯!/);assert.ok(!message.text.includes('Ana'));
 assert.throws(()=>individualMessage(payload(),'#28L88PQ2',{now}),/não tem ataque pendente/);
 assert.throws(()=>individualMessage(payload(),'#QC9RY8GJ',{now:now+11*60000}),/antiga/);
});
