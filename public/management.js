import { CLANS, findClan } from './clans.js';
import { csvFile } from './exports.js';
import { pendingMessage, individualMessage } from './whatsapp.js';
import { previewContactCsv } from './contact-import.js';
import { familyWarStatus } from './family-operations.js';
export function possibleTransfers(moves) {
  const matches=move=>moves.filter(other=>other.playerTag===move.playerTag && other.clanTag!==move.clanTag && other.kind!==move.kind && Math.abs(other.detectedAt-move.detectedAt)<=48*3600000);
  return moves.map(move=>{
    const candidates=matches(move);const unique=candidates.length===1 && matches(candidates[0]).length===1;
    return {...move,possibleTransfer:unique?{from:move.kind==='leave'?move.clanTag:candidates[0].clanTag,to:move.kind==='join'?move.clanTag:candidates[0].clanTag}:null};
  });
}
export function recruitmentMatch(clan,{townHall=null,trophies=null}={}) {
  if(!clan.capturedAt)return 'Sem coleta';
  if(Date.now()-clan.capturedAt>30*60000)return 'Confira os requisitos no jogo · coleta antiga';
  if(clan.type==='closed')return 'Clã fechado';
  if(clan.members>=50)return 'Sem vagas';
  if((townHall!=null && clan.requiredTH!=null && townHall<clan.requiredTH)||(trophies!=null && clan.requiredTrophies!=null && trophies<clan.requiredTrophies))return 'Abaixo dos requisitos informados';
  return townHall==null && trophies==null?'Confira os requisitos':'Requisitos informados atendidos';
}
export function goalProgress(goals,members,raid,now=Date.now()) {
  if(!goals)return {active:false,rows:[]};
  const active=now>=Date.parse(goals.startDate+'T00:00:00Z')&&now<=Date.parse(goals.endDate+'T23:59:59.999Z');
  const raids=new Map((raid?.members || []).map(m=>[m.tag,m]));
  const raidWithin=raid && (()=>{const value=raid.startTime?.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/,'$1-$2-$3T$4:$5:$6');const start=Date.parse(value);return start>=Date.parse(goals.startDate+'T00:00:00Z')&&start<=Date.parse(goals.endDate+'T23:59:59.999Z');})();
  return {active,raidWithin:Boolean(raidWithin),rows:members.map(m=>{const r=raidWithin?raids.get(m.tag):null;return {...m,donationPercent:goals.donationTarget?Math.min(100,100*(m.donations || 0)/goals.donationTarget):null,raidAttacks:r?.attacks ?? null,raidPercent:r && goals.raidTarget?Math.min(100,100*r.attacks/goals.raidTarget):null};})};
}

export function initManagement({getData,apiBase,escape:esc,num,date,switchClan}) {
  const $=id=>document.getElementById(id);const empty=text=>`<p class="empty">${esc(text)}</p>`;
  const label=tag=>findClan(tag)?.label || tag;
  const options=(selected='')=>CLANS.map(c=>`<option value="${esc(c.tag)}" ${selected===c.tag?'selected':''}>${esc(c.label)}</option>`).join('');
  const table=(headers,rows)=>`<div class="table-wrap"><table class="responsive-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map((cell,i)=>`<td data-label="${esc(headers[i])}">${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  let family=[];let moves=[];let config=null;let clanTag=null;let configVersion=0;let evolutionController=null;let leadershipKey='';let manualId=null;let manualRevision=0;let goalRevision=0;let busy=false;
  let contacts=new Map();let pendingPayload=null;let contactVersion=0;let pendingController=null;let importPreview=null;let importVersion=0;
  let familyWarVersion=0;let familyWarController=null;let familyDetailVersion=0;let familyDetailController=null;let familyDetail=null;
  async function get(path,signal) {const r=await fetch(apiBase()+path,{signal:signal || AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Consulta indisponível. Tente atualizar.');return r.json();}
  async function post(path,payload) {
    const r=await fetch(apiBase()+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${leadershipKey}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    const result=await r.json();if(!r.ok){if(r.status===401)lock();throw new Error(result.error || 'Não foi possível salvar.');}return result;
  }
  function renderRecruitment() {
    const th=$('recruit-th').value===''?null:Number($('recruit-th').value);const trophies=$('recruit-trophies').value===''?null:Number($('recruit-trophies').value);
    const clans=family.filter(c=>!$('recruit-vacancies').checked || (c.members<50 && c.type!=='closed'));
    $('recruit-list').innerHTML=clans.length?clans.map(c=>{
      const stale=!c.capturedAt || Date.now()-c.capturedAt>30*60000;
      return `<article class="panel recruit-card"><div class="panel-head"><h3>${esc(c.label)}</h3><span class="tag">${c.members==null?'SEM COLETA':`${Math.max(0,50-c.members)} VAGAS`}</span></div><p>${esc(c.description || c.name)}</p><p><strong>${esc(recruitmentMatch(c,{townHall:th,trophies}))}</strong></p><dl><div><dt>CV mínimo</dt><dd>${num(c.requiredTH)}</dd></div><div><dt>Troféus mínimos</dt><dd>${num(c.requiredTrophies)}</dd></div><div><dt>Liga exigida</dt><dd>${esc(c.requiredLeague || 'Consultar no jogo')}</dd></div><div><dt>Entrada</dt><dd>${esc(({closed:'Fechado',inviteOnly:'Por convite',open:'Aberto'})[c.type] || 'Consultar no jogo')}</dd></div></dl><p class="coverage">${stale?'Coleta antiga ou pendente. ':''}${c.capturedAt?`Atualizado: ${date(c.capturedAt)}. `:''}A compatibilidade considera apenas os campos informados. Confira a liga e a aprovação da liderança no jogo.</p><div class="recruit-actions"><button class="outline-button" data-operations-clan="${esc(c.tag)}">Observar clã</button><a class="button" href="https://link.clashofclans.com/pt?action=OpenClanProfile&amp;tag=${encodeURIComponent(c.tag.slice(1))}" target="_blank" rel="noopener noreferrer">Abrir no jogo</a></div></article>`;
    }).join(''):empty('Nenhum clã com vagas nesse filtro. Desmarque a opção para ver toda a família.');
  }
  function renderStrength() {
    $('strength-table').innerHTML=family.length?table(['Clã','Tropa','Distribuição por CV','Coleta'],family.map(c=>[esc(c.label),`${num(c.members)}/50`,Object.entries(c.townHalls || {}).sort((a,b)=>Number(b[0])-Number(a[0])).map(([th,count])=>`<span class="th-chip">${Number(th)>0?`CV ${esc(th)}`:'CV não informado'}: <b>${num(count)}</b></span>`).join('') || 'Aguardando nova coleta',date(c.capturedAt)])):empty('Aguardando os resumos da família.');
  }
  function renderComparison() {
    const clans=[$('compare-a').value,$('compare-b').value].map(t=>family.find(c=>c.tag===t));
    if(clans.some(c=>!c)){$('compare-table').innerHTML=empty('Aguardando coleta dos clãs.');return;}
    const fields=[['Membros',c=>`${num(c.members)}/50`],['Vagas',c=>c.members==null?'—':num(50-c.members)],['Nível do clã',c=>num(c.level)],['Liga de guerra',c=>c.league || '—'],['Troféus',c=>num(c.trophies)],['Doações · temporada',c=>num(c.donations)],['Capital nível',c=>num(c.capitalLevel)],['Troféus da Capital',c=>num(c.capitalPoints)],['Liga da Capital',c=>c.capitalLeague || '—'],['CV mínimo',c=>num(c.requiredTH)],['Última coleta',c=>date(c.capturedAt)]];
    $('compare-table').innerHTML=table(['Indicador',...clans.map(c=>c.label)],fields.map(([name,value])=>[esc(name),...clans.map(c=>esc(value(c)))]));
  }
  function renderMoves() {
    let rows=possibleTransfers(moves);const clan=$('moves-clan').value;const kind=$('moves-kind').value;const query=$('moves-search').value.trim().toLocaleLowerCase('pt-BR');
    rows=rows.filter(m=>(clan==='all'||m.clanTag===clan)&&(kind==='all'||(kind==='transfer'?m.possibleTransfer:m.kind===kind))&&`${m.name} ${m.playerTag}`.toLocaleLowerCase('pt-BR').includes(query));
    $('moves-list').innerHTML=rows.length?table(['Guerreiro','Movimento observado','Clã','Possível percurso','Detectado em'],rows.map(m=>[`${esc(m.name)}<br><small>${esc(m.playerTag)}</small>`,m.kind==='join'?'Entrada':'Saída',esc(label(m.clanTag)),m.possibleTransfer?`${esc(label(m.possibleTransfer.from))} para ${esc(label(m.possibleTransfer.to))} · possível transferência`:'Sem vínculo único observado',date(m.detectedAt)])):empty('Nenhum movimento registrado para estes filtros. A primeira coleta é uma referência e não gera entradas antigas.');
  }
  async function refreshMoves() {try{const payload=await get('/api/management');moves=payload.moves;renderMoves();$('moves-status').textContent='Até 500 movimentos recentes, retidos por 90 dias. Possíveis transferências relacionam uma única entrada e saída da mesma tag em clãs diferentes num intervalo de até 48h; não confirmam transferência direta. Horários são de detecção.';}catch(e){$('moves-status').textContent=e.message;}}
  async function loadConfig() {
    const tag=getData()?.clanTag;if(!tag)return;const version=++configVersion;
    try {const payload=await get('/api/clan-management?clan='+encodeURIComponent(tag));if(version!==configVersion||getData()?.clanTag!==tag)return;config=payload;dispatchEvent(new CustomEvent('tow:goals',{detail:{clanTag:tag,goals:config.goals}}));renderGoals();renderManual();}
    catch(e){if(version===configVersion){$('goals-list').innerHTML=empty(e.message);$('manual-list').innerHTML=empty(e.message);}}
  }
  function renderGoals() {
    const data=getData();const goals=config?.goals;if(!data?.current?.clan || !goals){$('goals-list').innerHTML=empty('A liderança ainda não definiu metas para este clã.');return;}
    const result=goalProgress(goals,data.current.clan.memberList || [],data.extras?.raids?.items?.[0]);
    $('goals-note').textContent=`${goals.startDate} a ${goals.endDate} (UTC) · ${result.active?'Em vigor':'Fora da vigência'}. Doações: contador da temporada atual; não soma temporadas. Capital: último fim de semana iniciado na vigência. Ausência de registro não significa zero ataques.`;
    const progress=(value,target,percent)=>target===0?'Sem meta':value==null?'Sem registro':`<span>${num(value)} / ${num(target)}</span><progress max="100" value="${percent}" aria-label="${num(value)} de ${num(target)}"></progress>`;
    $('goals-list').innerHTML=table(['Guerreiro','Doações da temporada','Capital · ataques'],result.rows.map(m=>[esc(m.name),result.active?progress(m.donations,goals.donationTarget,m.donationPercent):'Fora da vigência',result.raidWithin?progress(m.raidAttacks,goals.raidTarget,m.raidPercent):'Sem fim de semana na vigência']));
  }
  function renderManual() {
    const wars=config?.manualWars || [];
    $('manual-list').innerHTML=wars.length?wars.map(w=>`<details class="manual-record"><summary><span class="tag">REGISTRO MANUAL</span> ${esc(w.opponentName)} · ${w.clanStars} × ${w.opponentStars} ★ · ${date(w.endedAt)}</summary><p>${w.teamSize} × ${w.teamSize} · ${w.kind==='cwl'?'Liga':'Guerra comum'} · Destruição: ${num(w.clanDamage,2)}% × ${num(w.opponentDamage,2)}% · ${esc(w.opponentTag)}</p><p class="coverage">Revisão ${w.revision} · Atualizado em ${date(w.updatedAt)}. Informado pela liderança; não validado pela API. Ataques registrados podem ser parciais.</p>${w.attacks.length?table(['Atacante','Alvo','CV atacante / alvo','Estrelas','Destruição'],w.attacks.map(a=>[esc(a.attackerName),esc(a.targetName),`${a.attackerTH} / ${a.targetTH}`,String(a.stars),`${num(a.damage,2)}%`])):empty('Somente o placar foi registrado.')}<button class="outline-button" data-edit-manual="${esc(w.id)}">Editar com chave de liderança</button></details>`).join(''):empty('Nenhuma guerra manual registrada neste clã.');
    $('manual-download').disabled=!wars.length;
  }
  function renderContacts() {
    const rows=[...contacts.values()].sort((a,b)=>a.playerTag.localeCompare(b.playerTag));
    $('contact-list').innerHTML=rows.length?table(['Jogador','Telefone','Ações'],rows.map(c=>[esc(c.playerTag),`•••• ${esc(c.phone.slice(-4))}`,`<button type="button" class="text-button" data-edit-contact="${esc(c.playerTag)}">Editar</button> <button type="button" class="text-button" data-remove-contact="${esc(c.playerTag)}">Excluir</button>`])):empty('Nenhum telefone cadastrado neste clã.');
  }
  function clearImport(){importPreview=null;importVersion++;$('contact-import-file').value='';$('contact-import-preview').replaceChildren();$('contact-import-confirm').disabled=true;$('contact-import-status').textContent='';}
  $('contact-import-file').addEventListener('change',async()=>{
    const version=++importVersion,tag=getData()?.clanTag,key=leadershipKey,file=$('contact-import-file').files[0];importPreview=null;$('contact-import-confirm').disabled=true;$('contact-import-preview').replaceChildren();
    if(!file || !key)return;
    try{
      if(file.size>200000)throw new Error('O CSV deve ter no máximo 200 KB.');
      const preview=previewContactCsv(await file.text(),contacts.keys());
      if(version!==importVersion || key!==leadershipKey || tag!==getData()?.clanTag)return;
      if(contacts.size+preview.valid.filter(row=>row.action==='Cadastrar').length>100)throw new Error('A importação ultrapassaria o limite de 100 contatos deste clã.');
      importPreview={...preview,tag,key,version};
      $('contact-import-preview').innerHTML=preview.valid.length?table(['Tag','Telefone','Ação'],preview.valid.map(row=>[esc(row.playerTag),`•••• ${esc(row.phone.slice(-4))}`,esc(row.action)])):empty('Nenhum contato válido para importar.');
      $('contact-import-status').textContent=`${preview.valid.length} contato(s) pronto(s); ${preview.errors.length} linha(s) ignorada(s). ${preview.errors.slice(0,5).map(e=>`Linha ${e.line}: ${e.reason}`).join(' ')}`;
      $('contact-import-confirm').disabled=!preview.valid.length;
    }catch(error){if(version===importVersion)$('contact-import-status').textContent=error.message;}
  });
  $('contact-import-confirm').addEventListener('click',async()=>{
    const preview=importPreview;if(!preview || !leadershipKey || preview.key!==leadershipKey || preview.tag!==getData()?.clanTag)return;
    $('contact-import-confirm').disabled=true;let saved=0;
    for(const row of preview.valid){
      if(preview!==importPreview || preview.key!==leadershipKey || preview.tag!==getData()?.clanTag)break;
      try{await post('/api/leadership-contacts',{clanTag:preview.tag,playerTag:row.playerTag,phone:row.phone});saved++;}
      catch(error){clearImport();await loadContacts();$('contact-import-status').textContent=`${saved} salvo(s). Importação interrompida: ${error.message} Selecione o arquivo novamente para revisar o restante.`;return;}
      $('contact-import-status').textContent=`Salvando contatos: ${saved}/${preview.valid.length}…`;
    }
    if(preview===importPreview && preview.key===leadershipKey && preview.tag===getData()?.clanTag){clearImport();await loadContacts();$('contact-import-status').textContent=`${saved} contato(s) salvo(s) neste clã.`;}
  });
  function renderPendingContacts() {
    if(!pendingPayload){$('contact-pending-list').replaceChildren();return;}
    try {
      const pending=pendingMessage(pendingPayload).pendingList;
      $('contact-pending-list').innerHTML=table(['Guerreiro','Ataques pendentes','Contato'],pending.map(p=>{
        const phone=contacts.get(p.tag)?.phone;
        const link=phone?`<a class="outline-button" data-contact-player="${esc(p.tag)}" target="_blank" rel="noopener noreferrer" href="https://wa.me/${phone}?text=${encodeURIComponent(individualMessage(pendingPayload,p.tag).text)}">Abrir conversa</a>`:'Cadastre o telefone para abrir a conversa';
        return [`${esc(p.name)} <small>${esc(p.tag)}</small>`,num(p.remaining),link];
      }));
      $('contact-pending-status').textContent=`${pending.length} guerreiro${pending.length===1?'':'s'} com ataque pendente confirmado. Coleta: ${date(pendingPayload.current.warCapturedAt)}. Revise a mensagem e confirme o envio no WhatsApp.`;
    } catch(error){pendingPayload=null;$('contact-pending-list').replaceChildren();$('contact-pending-status').textContent=error.message;}
  }
  async function refreshFamilyWars(){
    familyWarController?.abort();const controller=new AbortController();familyWarController=controller;const version=++familyWarVersion,key=leadershipKey;
    $('family-war-status').textContent='Consultando as guerras dos 16 clãs…';$('family-war-list').replaceChildren();$('family-war-refresh').disabled=true;
    const rows=[];
    for(let start=0;start<CLANS.length;start+=4){
      if(controller.signal.aborted || key!==leadershipKey)break;
      const batch=await Promise.all(CLANS.slice(start,start+4).map(async clan=>{
        try{const response=await fetch(`${apiBase()}/api/dashboard?clan=${encodeURIComponent(clan.tag)}`,{signal:controller.signal});if(!response.ok)throw new Error('Consulta indisponível.');const payload=await response.json();if(payload.clanTag!==clan.tag)throw new Error('Resposta de outro clã.');return {clan,status:familyWarStatus(payload)};}
        catch(error){return {clan,status:{kind:'unavailable',label:error.name==='AbortError'?'Consulta cancelada.':error.message}};}
      }));
      if(version!==familyWarVersion || key!==leadershipKey)break;
      rows.push(...batch);
      $('family-war-status').textContent=`${rows.length} de ${CLANS.length} clãs consultados. Pendências exigem coleta recente e guerra confirmada.`;
      $('family-war-list').innerHTML=table(['Clã','Guerra e ataques','Ação'],rows.map(({clan,status})=>[esc(clan.label),esc(status.label),status.kind==='pending'?`<button type="button" class="outline-button" data-family-war-clan="${esc(clan.tag)}">Ver cobranças</button>`:'—']));
    }
    if(version===familyWarVersion && key===leadershipKey)$('family-war-refresh').disabled=false;
  }
  async function showFamilyWar(tag){
    familyDetailController?.abort();const controller=new AbortController();familyDetailController=controller;const version=++familyDetailVersion,key=leadershipKey;
    familyDetail=null;$('family-war-detail').replaceChildren();$('family-war-detail-status').textContent=`Consultando novamente ${label(tag)}…`;
    try{
      const [dashboard,contactResponse]=await Promise.all([
        fetch(`${apiBase()}/api/dashboard?clan=${encodeURIComponent(tag)}`,{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('Não foi possível consultar a guerra.');return r.json();}),
        fetch(`${apiBase()}/api/leadership-contacts?clan=${encodeURIComponent(tag)}`,{headers:{Authorization:`Bearer ${key}`},signal:controller.signal}).then(async r=>{if(r.status===401)throw new Error('Chave de liderança recusada. Entre novamente.');if(!r.ok)throw new Error('Não foi possível consultar os contatos.');return r.json();})
      ]);
      if(version!==familyDetailVersion || key!==leadershipKey)return;
      if(dashboard.clanTag!==tag || contactResponse.clanTag!==tag)throw new Error('A resposta não corresponde ao clã escolhido.');
      const pending=pendingMessage(dashboard).pendingList;const numbers=new Map(contactResponse.contacts.map(c=>[c.playerTag,c.phone]));
      familyDetail={tag,payload:dashboard,numbers};
      $('family-war-detail-status').textContent=`${label(tag)} · ${pending.length} jogador(es) com ataque pendente confirmado. Revise antes de enviar.`;
      $('family-war-detail').innerHTML=table(['Jogador','Ataques','Contato'],pending.map(player=>{
        const phone=numbers.get(player.tag);
        return [`${esc(player.name)} <small>${esc(player.tag)}</small>`,num(player.remaining),phone?`<a class="outline-button" data-family-contact="${esc(player.tag)}" href="https://wa.me/${phone}?text=${encodeURIComponent(individualMessage(dashboard,player.tag).text)}" target="_blank" rel="noopener noreferrer">Abrir conversa</a>`:'Sem telefone cadastrado'];
      }));
    }catch(error){if(version===familyDetailVersion && key===leadershipKey && !controller.signal.aborted)$('family-war-detail-status').textContent=error.message;}
  }
  $('family-war-refresh').addEventListener('click',refreshFamilyWars);
  $('family-war-list').addEventListener('click',e=>{const button=e.target.closest('[data-family-war-clan]');if(button && leadershipKey)showFamilyWar(button.dataset.familyWarClan);});
  $('family-war-detail').addEventListener('click',e=>{const link=e.target.closest('[data-family-contact]');if(!link)return;
    try{if(!leadershipKey || !familyDetail)throw new Error('Consulte o clã novamente.');const phone=familyDetail.numbers.get(link.dataset.familyContact);if(!phone)throw new Error('Contato não encontrado.');const message=individualMessage(familyDetail.payload,link.dataset.familyContact);link.href=`https://wa.me/${phone}?text=${encodeURIComponent(message.text)}`;}
    catch(error){e.preventDefault();$('family-war-detail-status').textContent=error.message;}
  });
  async function loadContacts() {
    const tag=getData()?.clanTag;const key=leadershipKey;const version=++contactVersion;
    if(!tag || !key)return;
    try {
      const response=await fetch(`${apiBase()}/api/leadership-contacts?clan=${encodeURIComponent(tag)}`,{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(20000)});
      if(response.status===401){if(version===contactVersion)lock();throw new Error('Área bloqueada. Informe a chave novamente.');}
      if(!response.ok)throw new Error('Não foi possível consultar os contatos.');
      const payload=await response.json();if(version!==contactVersion || leadershipKey!==key || getData()?.clanTag!==tag)return;
      contacts=new Map(payload.contacts.map(c=>[c.playerTag,c]));renderContacts();renderPendingContacts();$('contact-status').textContent=`${contacts.size} contato${contacts.size===1?'':'s'} cadastrado${contacts.size===1?'':'s'} neste clã.`;
    } catch(error){if(version===contactVersion && leadershipKey) $('contact-status').textContent=error.message;}
  }
  async function refreshPendingContacts() {
    pendingController?.abort();const controller=new AbortController();pendingController=controller;
    const tag=getData()?.clanTag;const key=leadershipKey;pendingPayload=null;$('contact-pending-list').replaceChildren();$('contact-pending-status').textContent='Consultando ataques pendentes…';
    if(!tag || !key)return;
    try {
      const response=await fetch(`${apiBase()}/api/dashboard?clan=${encodeURIComponent(tag)}`,{signal:controller.signal});if(!response.ok)throw new Error('Não foi possível consultar a guerra.');
      const payload=await response.json();if(controller!==pendingController || leadershipKey!==key || getData()?.clanTag!==tag)return;
      if(payload.clanTag!==tag)throw new Error('A resposta não corresponde ao clã selecionado.');
      pendingMessage(payload);pendingPayload=payload;renderPendingContacts();
    } catch(error){if(controller===pendingController && !controller.signal.aborted)$('contact-pending-status').textContent=error.message;}
  }
  function lock() {leadershipKey='';contacts.clear();pendingPayload=null;contactVersion++;pendingController?.abort();pendingController=null;familyWarVersion++;familyWarController?.abort();familyWarController=null;familyDetailVersion++;familyDetailController?.abort();familyDetailController=null;familyDetail=null;$('family-war-list').replaceChildren();$('family-war-detail').replaceChildren();$('family-war-status').textContent='';$('family-war-detail-status').textContent='';$('family-war-refresh').disabled=false;clearImport();$('contact-form').reset();$('contact-list').replaceChildren();$('contact-pending-list').replaceChildren();$('contact-status').textContent='';$('contact-pending-status').textContent='';$('leadership-tools').hidden=true;$('leadership-password').value='';$('leadership-auth-state').textContent='Área bloqueada.';}
  $('leadership-open').addEventListener('click',()=>{$('leadership-dialog').showModal();$('leadership-error').textContent='';});
  $('leadership-close').addEventListener('click',()=>{lock();$('leadership-dialog').close();});
  $('leadership-dialog').addEventListener('cancel',lock);
  $('leadership-dialog').addEventListener('close',lock);
  $('leadership-lock').addEventListener('click',lock);
  $('leadership-login').addEventListener('submit',async e=>{e.preventDefault();const button=$('leadership-unlock');button.disabled=true;leadershipKey=$('leadership-password').value.trim();$('leadership-password').value='';
    try {await post('/api/leadership',{});$('leadership-tools').hidden=false;$('leadership-auth-state').textContent=`Liberado para ${label(getData()?.clanTag)} nesta janela. Fechar bloqueia novamente.`;$('leadership-error').textContent='';fillGoals();loadContacts();refreshFamilyWars();}
    catch(error){lock();$('leadership-error').textContent=error.message;}finally{button.disabled=false;}
  });
  $('contact-form').addEventListener('submit',async e=>{e.preventDefault();if(!leadershipKey)return;
    const tag=getData()?.clanTag;const playerTag=$('contact-player').value.trim().toUpperCase();const phone=$('contact-phone').value.trim();$('contact-save').disabled=true;
    try {await post('/api/leadership-contacts',{clanTag:tag,playerTag,phone});if(getData()?.clanTag===tag && leadershipKey){clearImport();$('contact-form').reset();await loadContacts();$('contact-status').textContent='Contato salvo neste clã.';}}
    catch(error){$('contact-status').textContent=error.message;}finally{$('contact-save').disabled=false;}
  });
  $('contact-list').addEventListener('click',async e=>{
    const edit=e.target.closest('[data-edit-contact]');if(edit){const c=contacts.get(edit.dataset.editContact);if(c){$('contact-player').value=c.playerTag;$('contact-phone').value='+'+c.phone;$('contact-phone').focus();}return;}
    const remove=e.target.closest('[data-remove-contact]');if(!remove || !leadershipKey)return;
    const tag=getData()?.clanTag;remove.disabled=true;
    try {await post('/api/leadership-contacts',{clanTag:tag,playerTag:remove.dataset.removeContact,phone:null});if(getData()?.clanTag===tag && leadershipKey){clearImport();await loadContacts();$('contact-status').textContent='Contato excluído deste clã.';}}
    catch(error){$('contact-status').textContent=error.message;}finally{remove.disabled=false;}
  });
  $('contact-refresh-pending').addEventListener('click',refreshPendingContacts);
  $('contact-pending-list').addEventListener('click',e=>{const link=e.target.closest('[data-contact-player]');if(!link)return;
    try {const contact=contacts.get(link.dataset.contactPlayer);if(!leadershipKey || !contact || !pendingPayload)throw new Error('Atualize a consulta antes de abrir a conversa.');const message=individualMessage(pendingPayload,link.dataset.contactPlayer);link.href=`https://wa.me/${contact.phone}?text=${encodeURIComponent(message.text)}`;}
    catch(error){e.preventDefault();$('contact-pending-status').textContent=error.message;}
  });
  function fillGoals() {
    const goals=config?.goals;goalRevision=goals?.revision || 0;const today=new Date().toISOString().slice(0,10);
    $('goal-start').value=goals?.startDate || today;$('goal-end').value=goals?.endDate || new Date(Date.now()+7*86400000).toISOString().slice(0,10);$('goal-donations').value=goals?.donationTarget ?? 0;$('goal-raids').value=goals?.raidTarget ?? 0;
  }
  $('goals-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;$('goals-save').disabled=true;
    const tag=getData()?.clanTag;
    try {const goals=await post('/api/goals',{clanTag:tag,revision:goalRevision,startDate:$('goal-start').value,endDate:$('goal-end').value,donationTarget:Number($('goal-donations').value),raidTarget:Number($('goal-raids').value)});if(getData()?.clanTag===tag){configVersion++;config={...config,goals};goalRevision=goals.revision;dispatchEvent(new CustomEvent('tow:goals',{detail:{clanTag:tag,goals}}));renderGoals();$('leadership-error').textContent='Metas salvas.';}}
    catch(error){$('leadership-error').textContent=error.message;}finally{busy=false;$('goals-save').disabled=false;}
  });
  function resetManual() {
    manualId=null;manualRevision=0;$('manual-form').reset();$('manual-ended').value=new Date(Date.now()-60000).toISOString().slice(0,16);$('manual-attacks').replaceChildren();$('manual-edit-state').textContent='Novo registro manual.';
  }
  function attackRow(attack={}) {
    const row=document.createElement('fieldset');row.className='manual-attack';
    const input=(key,title,type='text',min='',max='')=>`<label>${title}<input data-attack="${key}" type="${type}" ${type==='text'?'maxlength="80"':'step="'+(key==='damage'?'0.01':'1')+'"'} ${min!==''?`min="${min}"`:''} ${max!==''?`max="${max}"`:''} ${key==='attackerTag'?'list="warrior-tags"':''} required></label>`;
    row.innerHTML=`<legend>Ataque registrado</legend><div class="form-grid">${input('attackerTag','Tag do atacante')}${input('attackerName','Nome do atacante')}${input('attackerTH','CV do atacante','number',1,30)}${input('targetTag','Tag do alvo')}${input('targetName','Nome do alvo')}${input('targetTH','CV do alvo','number',1,30)}${input('stars','Estrelas','number',0,3)}${input('damage','Destruição (%)','number',0,100)}</div><button type="button" class="text-button" data-remove-attack>Remover este ataque</button>`;
    row.querySelectorAll('[data-attack]').forEach(i=>{i.value=attack[i.dataset.attack] ?? '';});$('manual-attacks').append(row);
  }
  $('manual-attacks').addEventListener('click',e=>{if(e.target.closest('[data-remove-attack]'))e.target.closest('.manual-attack').remove();});
  $('manual-attacks').addEventListener('change',e=>{if(e.target.dataset.attack==='attackerTag'){e.target.value=e.target.value.trim().toUpperCase();const member=getData()?.current?.clan?.memberList?.find(m=>m.tag===e.target.value);if(member){const row=e.target.closest('.manual-attack');row.querySelector('[data-attack="attackerName"]').value=member.name;row.querySelector('[data-attack="attackerTH"]').value=member.townHallLevel;}}});
  $('manual-add-attack').addEventListener('click',()=>{if($('manual-attacks').children.length<100)attackRow();});
  $('manual-new').addEventListener('click',resetManual);
  $('manual-list').addEventListener('click',e=>{const button=e.target.closest('[data-edit-manual]');if(!button)return;const war=config?.manualWars.find(w=>w.id===button.dataset.editManual);if(!war)return;
    resetManual();manualId=war.id;manualRevision=war.revision;$('manual-edit-state').textContent=`Editando ${war.opponentName}, revisão ${war.revision}.`;
    for(const [id,key] of [['manual-opponent','opponentName'],['manual-opponent-tag','opponentTag'],['manual-size','teamSize'],['manual-kind','kind'],['manual-stars','clanStars'],['manual-enemy-stars','opponentStars'],['manual-damage','clanDamage'],['manual-enemy-damage','opponentDamage']])$(id).value=war[key];
    $('manual-ended').value=war.endedAt.slice(0,16);war.attacks.forEach(attackRow);$('leadership-dialog').showModal();
  });
  $('manual-form').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;$('manual-save').disabled=true;
    const tag=getData()?.clanTag;
    try {
      const attacks=[...$('manual-attacks').children].map(row=>Object.fromEntries([...row.querySelectorAll('[data-attack]')].map(i=>[i.dataset.attack,i.type==='number'?Number(i.value):i.dataset.attack.endsWith('Tag')?i.value.trim().toUpperCase():i.value.trim()])));
      const result=await post('/api/manual-wars',{clanTag:tag,id:manualId || undefined,revision:manualRevision,opponentName:$('manual-opponent').value.trim(),opponentTag:$('manual-opponent-tag').value.trim().toUpperCase(),endedAt:$('manual-ended').value+':00Z',teamSize:Number($('manual-size').value),kind:$('manual-kind').value,clanStars:Number($('manual-stars').value),opponentStars:Number($('manual-enemy-stars').value),clanDamage:Number($('manual-damage').value),opponentDamage:Number($('manual-enemy-damage').value),attacks});
      if(getData()?.clanTag===tag){manualId=result.id;manualRevision=result.revision;$('manual-edit-state').textContent=`Registro salvo · revisão ${result.revision}.`;$('leadership-error').textContent='Guerra manual salva e publicada.';await loadConfig();}
    }catch(error){$('leadership-error').textContent=error.message;}finally{busy=false;$('manual-save').disabled=false;}
  });
  $('manual-download').addEventListener('click',()=>{const wars=config?.manualWars || [];if(!wars.length)return;const rows=wars.map(w=>[label(w.clanTag),w.clanTag,w.opponentName,w.opponentTag,w.endedAt,w.teamSize,w.clanStars,w.opponentStars,w.clanDamage,w.opponentDamage,'Manual · liderança',w.revision]);const blob=new Blob([csvFile({headers:['Clã','Tag do clã','Adversário','Tag adversária','Término UTC','Tamanho','Estrelas Tigers','Estrelas adversárias','Destruição Tigers','Destruição adversária','Origem','Revisão'],rows})],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`tigers-guerras-manuais-${config.clanTag.slice(1)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});
  async function loadEvolution(tag) {
    evolutionController?.abort();const controller=new AbortController();evolutionController=controller;$('warrior-evolution').innerHTML=empty('Consultando evolução diária…');
    try {const payload=await get('/api/player-evolution?player='+encodeURIComponent(tag),controller.signal);if(controller!==evolutionController)return;
      $('warrior-evolution').innerHTML=payload.points.length?table(['Coleta','Clã','CV','Troféus','Doações · temporada','Recebidas'],payload.points.map(p=>[date(p.capturedAt),esc(label(p.clanTag)),num(p.townHallLevel),num(p.trophies),num(p.donations),num(p.donationsReceived)])):empty('Sem série diária para este guerreiro. O histórico começa na primeira coleta desta atualização.');
    }catch(error){if(!controller.signal.aborted)$('warrior-evolution').innerHTML=empty(error.message);}
  }
  addEventListener('tow:warrior',e=>loadEvolution(e.detail));
  $('warrior-dialog').addEventListener('close',()=>{evolutionController?.abort();evolutionController=null;});
  addEventListener('tow:family',e=>{family=e.detail.clans;renderRecruitment();renderStrength();renderComparison();});
  for(const id of ['compare-a','compare-b']){$(id).innerHTML=options(id==='compare-a'?CLANS[0].tag:CLANS[5].tag);$(id).addEventListener('change',()=>{const other=id==='compare-a'?'compare-b':'compare-a';if($(id).value===$(other).value)$(other).value=CLANS.find(c=>c.tag!==$(id).value).tag;renderComparison();});}
  $('moves-clan').innerHTML='<option value="all">Toda a família</option>'+options();
  for(const id of ['moves-clan','moves-kind'])$(id).addEventListener('change',renderMoves);$('moves-search').addEventListener('input',renderMoves);
  for(const id of ['recruit-th','recruit-trophies','recruit-vacancies'])$(id).addEventListener('input',renderRecruitment);
  $('recruit-list').addEventListener('click',e=>{const b=e.target.closest('[data-operations-clan]');if(b)switchClan(b.dataset.operationsClan);});
  addEventListener('tow:section',e=>{if(e.detail==='leadership')loadConfig();});
  $('operations-refresh').addEventListener('click',()=>{refreshMoves();loadConfig();});
  resetManual();refreshMoves();setInterval(()=>{if(!document.hidden){refreshMoves();loadConfig();}},120000);
  return {render(){const data=getData();if(clanTag!==data?.clanTag){clanTag=data?.clanTag;config=null;$('goals-note').textContent='';renderGoals();renderManual();resetManual();lock();loadConfig();}else renderGoals();$('operations-clan').textContent=label(clanTag);$('warrior-tags').innerHTML=(data?.current?.clan?.memberList || []).map(m=>`<option value="${esc(m.tag)}">${esc(m.name)}</option>`).join('');},clear(){configVersion++;clanTag=null;config=null;evolutionController?.abort();$('leadership-dialog').close();lock();$('goals-note').textContent='';$('goals-list').innerHTML=empty('Selecione um clã com dados carregados.');$('manual-list').innerHTML=empty('Carregando registros deste clã…');$('manual-download').disabled=true;}};
}
