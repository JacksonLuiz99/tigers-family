import { CLANS, DEFAULT_CLAN, findClan } from './clans.js';
import { parseGameTime } from './stats.js';

const minute=60000;
const time=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(value);
export const messageName=value=>Array.from(String(value ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069*_~`]/g,' ').replace(/\s+/g,' ').trim()).slice(0,100).join('');
const tagPattern=/^#[0289PYLQGRJCUV]{3,14}$/;
function recent(at,now,window){return Number.isFinite(at)&&at>0&&at<=now+minute&&now-at<=window;}
export function pendingMessage(payload,{now=Date.now(),includeTags=false}={}) {
  const known=findClan(payload?.clanTag);const current=payload?.current;const war=current?.war;
  if(!known || current?.clan?.tag!==known.tag)throw new Error('A guerra deste clã ainda não está disponível para preparar a mensagem.');
  if(payload.configured===false)throw new Error('O monitor deste clã não está configurado. Aguarde a conexão antes de preparar a mensagem.');
  if(payload.health?.code!=='ok')throw new Error(payload.health?.code==='api_http_403'?'A API restringe a guerra deste clã. Não é possível confirmar quem tem ataques pendentes.':'A consulta da guerra tem pendências. Atualize os dados antes de preparar a mensagem.');
  if(war?.clan?.tag!==known.tag)throw new Error('Não há uma guerra ativa disponível para preparar a mensagem deste clã.');
  const window=(known.tag===DEFAULT_CLAN?10:30)*minute;
  if(!recent(current.capturedAt,now,window)||!recent(current.warCapturedAt,now,window))throw new Error('A coleta está antiga. Atualize os dados antes de cobrar os ataques.');
  if(war.state!=='inWar'||war.source==='manual')throw new Error('A cobrança só fica disponível durante uma guerra em andamento confirmada pela API.');
  const end=parseGameTime(war.endTime);
  if(!Number.isFinite(end)||end<=now)throw new Error('O horário de término já passou ou não foi confirmado. Aguarde uma nova coleta.');
  const limit=war.attacksPerMember ?? (war.kind==='cwl'?1:2);const members=war.clan.members;
  if(![1,2].includes(limit)||!Number.isInteger(war.teamSize)||war.teamSize<1||war.teamSize>50||!Array.isArray(members)||members.length!==war.teamSize)throw new Error('A escalação está incompleta. Atualize a guerra para preparar uma lista confiável.');
  const tags=new Set();const positions=new Set();
  const pending=[];
  for(const m of members){
    const used=m.attacks?.length || 0;
    if(!tagPattern.test(m.tag || '')||!messageName(m.name)||!Number.isInteger(m.mapPosition)||m.mapPosition<1||m.mapPosition>war.teamSize||tags.has(m.tag)||positions.has(m.mapPosition)||(m.attacks!=null&&!Array.isArray(m.attacks))||used>limit)throw new Error('Os dados individuais da guerra estão incompletos. Atualize antes de preparar a mensagem.');
    tags.add(m.tag);positions.add(m.mapPosition);
    if(used<limit)pending.push({tag:m.tag,name:messageName(m.name),position:m.mapPosition,remaining:limit-used});
  }
  pending.sort((a,b)=>a.position-b.position);
  if(!pending.length)throw new Error('Missão cumprida: todos os ataques desta guerra já foram utilizados.');
  const total=pending.reduce((n,m)=>n+m.remaining,0);const remainingMinutes=Math.ceil((end-now)/minute);
  const remaining=`${Math.floor(remainingMinutes/60)}h${String(remainingMinutes%60).padStart(2,'0')}`;
  const score=[war.clan.stars,war.opponent?.stars].every(n=>Number.isInteger(n)&&n>=0)?` (${war.clan.stars}★ × ${war.opponent.stars}★)`:'';
  const text=[
    `🔥 *ATAQUES PENDENTES · ${messageName(current.clan.name || known.name)}${war.kind==='cwl'?' · CWL':''}*`,
    `*${total} ataque${total===1?'':'s'}* · ${pending.length} guerreiro${pending.length===1?'':'s'}`,
    '',...pending.map(m=>`• #${m.position} ${m.name}${includeTags?` (${m.tag})`:''} — ${m.remaining}`),
    '',`⚔️ Contra ${messageName(war.opponent?.name || 'Adversário')}${score}`,
    `⏳ Faltam ${remaining} · término ${time(end)} (Brasília)`,
    `📌 Coleta: ${time(current.warCapturedAt)} (Brasília)`
  ].join('\n');
  return {text,clanTag:known.tag,players:pending.length,pendingList:pending,attacks:total,endAt:end,capturedAt:current.warCapturedAt,generatedAt:now};
}
export const whatsappUrl=text=>'https://wa.me/?text='+encodeURIComponent(text);
export function individualMessage(payload,playerTag,{now=Date.now()}={}) {
  const summary=pendingMessage(payload,{now});
  const player=summary.pendingList.find(p=>p.tag===playerTag);
  if(!player)throw new Error('Este jogador não tem ataque pendente confirmado nesta guerra. Atualize a consulta.');
  const war=payload.current.war;const remainingMinutes=Math.ceil((summary.endAt-now)/minute);
  const remaining=`${Math.floor(remainingMinutes/60)}h${String(remainingMinutes%60).padStart(2,'0')}`;
  const text=[`⚔️ *ATAQUE PENDENTE · ${messageName(payload.current.clan.name)}*`,
    `Oi, ${player.name}! Você ainda tem ${player.remaining} ataque${player.remaining===1?'':'s'} nesta guerra${war.kind==='cwl'?' de Liga':''}.`,
    `Adversário: ${messageName(war.opponent?.name || 'não informado')}.`,
    `⏳ Faltam ${remaining} · término ${time(summary.endAt)} (Brasília).`,
    `📌 Dados conferidos em ${time(summary.capturedAt)} (Brasília).`].join('\n');
  return {text,player,endAt:summary.endAt,capturedAt:summary.capturedAt};
}

export function initWhatsApp({getSelectedClan,apiBase}) {
  const $=id=>document.getElementById(id);const dialog=$('whatsapp-dialog');let payload=null;let controller=null;let sequence=0;let message=null;
  const setActions=enabled=>{$('whatsapp-copy').disabled=!enabled;$('whatsapp-open').setAttribute('aria-disabled',String(!enabled));if(!enabled)$('whatsapp-open').removeAttribute('href');};
  function prepare(){
    if(!payload)return false;
    try {message=pendingMessage(payload,{includeTags:$('whatsapp-tags').checked});$('whatsapp-preview').value=message.text;$('whatsapp-open').href=whatsappUrl(message.text);$('whatsapp-context').textContent=`${payload.current.clan.name} · ${message.attacks} ataque${message.attacks===1?'':'s'} pendente${message.attacks===1?'':'s'} de ${message.players} guerreiro${message.players===1?'':'s'} · Coleta: ${time(message.capturedAt)} (Brasília).`;$('whatsapp-error').textContent='';$('whatsapp-preview').closest('label').hidden=false;$('whatsapp-copy').closest('footer').hidden=false;setActions(true);return true;}
    catch(error){message=null;$('whatsapp-status').textContent='';$('whatsapp-preview').value='';$('whatsapp-error').textContent=error.message;$('whatsapp-preview').closest('label').hidden=true;$('whatsapp-copy').closest('footer').hidden=true;setActions(false);return false;}
  }
  async function load(){
    controller?.abort();controller=new AbortController();const requestController=controller;const active=++sequence;const tag=$('whatsapp-clan').value;payload=null;message=null;setActions(false);$('whatsapp-preview').value='';$('whatsapp-status').textContent='';$('whatsapp-error').textContent='';$('whatsapp-context').textContent='Consultando a guerra do clã escolhido…';$('whatsapp-refresh').disabled=true;
    const timer=setTimeout(()=>requestController.abort(),25000);
    try {const response=await fetch(`${apiBase()}/api/dashboard?clan=${encodeURIComponent(tag)}`,{signal:requestController.signal});if(!response.ok)throw new Error('Não foi possível consultar a guerra. Tente atualizar novamente.');const result=await response.json();if(active!==sequence||!dialog.open)return;if(result.clanTag!==tag)throw new Error('A consulta não corresponde ao clã escolhido. Atualize novamente.');payload=result;$('whatsapp-context').textContent=`${findClan(tag)?.label || tag} · ${tag}`;prepare();}
    catch(error){if(active===sequence&&dialog.open){$('whatsapp-context').textContent=`${findClan(tag)?.label || tag} · ${tag}`;$('whatsapp-error').textContent=error.name==='AbortError'?'A consulta demorou demais. Tente atualizar novamente.':error.message;}}
    finally{clearTimeout(timer);if(active===sequence)$('whatsapp-refresh').disabled=false;}
  }
  function open(tag){const clan=findClan(tag || getSelectedClan());if(!clan)return;$('whatsapp-clan').value=clan.tag;$('whatsapp-tags').checked=false;if(!dialog.open)dialog.showModal();load();}
  function close(){dialog.close();}
  $('whatsapp-clan').replaceChildren(...CLANS.map(c=>{const option=document.createElement('option');option.value=c.tag;option.textContent=`${c.label} · ${c.tag}`;return option;}));
  document.addEventListener('click',e=>{const button=e.target.closest('[data-whatsapp-clan]');if(button)open(button.dataset.whatsappClan);});
  $('open-whatsapp').addEventListener('click',()=>open());$('whatsapp-clan').addEventListener('change',load);$('whatsapp-refresh').addEventListener('click',load);$('whatsapp-close').addEventListener('click',close);
  dialog.addEventListener('close',()=>{controller?.abort();sequence++;payload=null;message=null;$('whatsapp-preview').value='';$('whatsapp-status').textContent='';setActions(false);});
  $('whatsapp-tags').addEventListener('change',()=>{$('whatsapp-status').textContent='';prepare();});
  $('whatsapp-copy').addEventListener('click',async()=>{
    if(!prepare())return;const text=message.text;const active=sequence;
    try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(text);if(active===sequence&&dialog.open)$('whatsapp-status').textContent='Mensagem copiada. Cole no grupo do WhatsApp e confirme o envio.';}
    catch{if(active===sequence&&dialog.open){$('whatsapp-preview').focus();$('whatsapp-preview').select();$('whatsapp-status').textContent='O navegador não permitiu copiar automaticamente. O texto foi selecionado: copie e cole no WhatsApp.';}}
  });
  $('whatsapp-open').addEventListener('click',e=>{if(!prepare())e.preventDefault();});
  setInterval(()=>{if(dialog.open&&payload){try{pendingMessage(payload);}catch{prepare();}}},15000);
  return {open,close};
}
