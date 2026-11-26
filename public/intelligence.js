import { performance, parseGameTime, outcome } from './stats.js';
import { createFamilyDownload } from './family-export.js';

export function periodWars(wars=[],days=30,now=Date.now()) {
  return wars.filter(w=>w?.state==='warEnded' && parseGameTime(w.endTime)>=now-days*86400000 && parseGameTime(w.endTime)<=now);
}
export function fairPerformance(wars,{townHall='all',matchup='all'}={}) {
  const scoped=wars.map(w=>({...w,clan:{...w.clan,members:(w.clan?.members || []).filter(m=>townHall==='all' || (m.townhallLevel ?? m.townHallLevel)===Number(townHall)).map(m=>{
    const th=m.townhallLevel ?? m.townHallLevel;
    return {...m,attacks:(m.attacks || []).filter(a=>{
      if(matchup==='all')return true;
      const target=w.opponent?.members?.find(t=>t.tag===a.defenderTag);const targetTH=target?.townhallLevel ?? target?.townHallLevel;
      return Number.isFinite(targetTH) && (matchup==='same'?targetTH===th:matchup==='up'?targetTH>th:targetTH<th);
    })};
  })}}));
  return performance(scoped,{completedOnly:true}).filter(p=>matchup==='all' || p.attacks>0)
    .sort((a,b)=>b.averageStars-a.averageStars || b.averageDamage-a.averageDamage || b.attacks-a.attacks || a.name.localeCompare(b.name,'pt-BR'));
}
export function raidParticipation(raid,members=[]) {
  const rows=new Map((raid?.members || []).map(m=>[m.tag,{...m,recorded:true}]));
  for(const m of members)if(!rows.has(m.tag))rows.set(m.tag,{tag:m.tag,name:m.name,recorded:false});
  return [...rows.values()].sort((a,b)=>(b.capitalResourcesLooted || 0)-(a.capitalResourcesLooted || 0) || a.name.localeCompare(b.name,'pt-BR'));
}
export function familyTotals(clans,now=Date.now()) {
  const fresh=clans.filter(c=>c.capturedAt && now-c.capturedAt<=30*60000);
  const wars=fresh.filter(c=>c.war?.state==='inWar' && c.warCapturedAt && now-c.warCapturedAt<=30*60000);
  return {fresh:fresh.length,members:fresh.reduce((n,c)=>n+(c.members || 0),0),vacancies:fresh.reduce((n,c)=>n+Math.max(0,50-(c.members || 0)),0),wars:wars.length,pending:wars.reduce((n,c)=>n+(c.war.pending || 0),0)};
}

export function familyLeagueView(clan,now=Date.now()) {
  const season=clan?.leagueSeason;const rounds=season?.rounds || [];
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit'}).format(now).slice(0,7);
  const recent=clan?.capturedAt && clan?.warCapturedAt && clan.capturedAt<=now+60000 && clan.warCapturedAt<=now+60000 && now-clan.capturedAt<=30*60000 && now-clan.warCapturedAt<=30*60000;
  const active=season?.season===month && clan?.war?.kind==='cwl' && ['inWar','preparation'].includes(clan.war.state) ? rounds.find(r=>r.round===clan.war.round && r.state===clan.war.state) : null;
  const shown=active || rounds.at(-1) || null;
  const limited=clan?.health==='api_http_403' || clan?.health==='cwl_partial' || (clan?.health && clan.health!=='ok') || !recent;
  const status=clan?.health==='api_http_403'?'GUERRA PRIVADA':clan?.health==='cwl_partial'?'LIGA PARCIAL':!recent || clan?.health!=='ok'?'DADOS ANTIGOS':
    active?.state==='inWar'?'EM GUERRA':active?.state==='preparation'?'PREPARAÇÃO':season?.season===month && shown?.state==='warEnded'?'RODADA ENCERRADA':shown?'ÚLTIMA LIGA OBSERVADA':'SEM RODADAS CONFIRMADAS';
  return {season:season?.season || null,rounds,shown,status,limited:Boolean(limited),active:Boolean(active && !limited)};
}

export function initIntelligence({getData,switchClan,escape:esc,num,date,apiBase}) {
  const $=id=>document.getElementById(id);
  const empty=text=>`<p class="empty">${esc(text)}</p>`;
  const table=(headers,rows)=>`<div class="table-wrap"><table class="responsive-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(cells=>`<tr>${cells.map((c,i)=>`<td data-label="${esc(headers[i])}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const metric=(label,value)=>`<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;
  let familyBusy=false;let lastFamily=0;let familyResults=[];let familyNames=new Map();let familyClans=[];
  function renderFamilyLeague() {
    const now=Date.now();const filter=$('family-league-filter').value;
    const rows=familyClans.map(c=>({clan:c,view:familyLeagueView(c,now)})).filter(({view})=>filter==='all' || (filter==='active'?view.active:view.limited));
    $('family-league-note').textContent=`${rows.length} de ${familyClans.length} clãs exibidos. Rodadas e placares vêm das guerras efetivamente acompanhadas; a consulta da Liga pode ser parcial. Coletas antigas ou guerra privada não confirmam a situação atual. Horários em Cuiabá.`;
    $('family-league-table').innerHTML=rows.length?table(['Clã','Temporada','Rodada','Adversário','Placar','Situação dos dados','Coleta'],rows.map(({clan:c,view:v})=>[
      `<button class="text-button" data-observe="${esc(c.tag)}">${esc(c.label)}</button>`,esc(v.season || '—'),
      v.shown?`<span>${num(v.shown.round)}</span><details class="league-round-list"><summary>Ver ${v.rounds.length} rodada${v.rounds.length===1?'':'s'}</summary><ul>${v.rounds.map(r=>`<li>Rodada ${num(r.round)} · ${esc(r.opponent)} · ${r.stars==null?'—':num(r.stars)} × ${r.enemyStars==null?'—':num(r.enemyStars)} ★ · ${esc(r.result || ({inWar:'Em guerra',preparation:'Preparação'})[r.state] || 'Aguardando')}</li>`).join('')}</ul></details>`:'—',
      esc(v.shown?.opponent || '—'),v.shown?.stars!=null && v.shown?.enemyStars!=null?`${num(v.shown.stars)} × ${num(v.shown.enemyStars)} ★`:'—',esc(v.status),c.warCapturedAt?date(c.warCapturedAt):'—'
    ])):empty('Nenhum clã corresponde a este filtro.');
  }
  function renderFamilyResults() {
    const sort=$('family-results-sort').value;
    const rows=[...familyResults].sort((a,b)=>{
      if(!a.wars && b.wars)return 1;if(a.wars && !b.wars)return -1;
      return (sort==='score'?b.scoreStars-a.scoreStars:b.wins-a.wins) || b.wins-a.wins || b.scoreStars-a.scoreStars || (familyNames.get(a.tag) || a.tag).localeCompare(familyNames.get(b.tag) || b.tag,'pt-BR');
    });
    $('family-results-table').innerHTML=table(['Clã','Guerras','Vitórias','Derrotas','Empates','Estrelas no placar','Estrelas dos ataques','Resultados disponíveis'],rows.map(c=>[
      esc(familyNames.get(c.tag) || c.tag),c.wars?num(c.wars):'—',c.wars?num(c.wins):'—',c.wars?num(c.losses):'—',c.wars?num(c.ties):'—',c.wars?num(c.scoreStars):'—',
      c.detailedWars?`${num(c.attackStars)} <small>(${num(c.detailedWars)} guerra${c.detailedWars===1?'':'s'} detalhada${c.detailedWars===1?'':'s'})</small>`:'—',
      c.firstWar?`${date(c.firstWar)} a ${date(c.lastWar)}`:'Sem resultado registrado'
    ]));
  }
  async function refreshFamilyResults() {
    try {
      const response=await fetch(`${apiBase()}/api/family-results`,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw new Error();
      const payload=await response.json();
      const found=new Map((payload.clans || []).map(c=>[c.tag,c]));
      familyResults=[...familyNames.keys()].map(tag=>found.get(tag) || {tag,wars:0,wins:0,losses:0,ties:0,scoreStars:0,attackStars:null,detailedWars:0,firstWar:null,lastWar:null});
      $('family-results-note').textContent='Resultados dos últimos 365 dias disponíveis no monitor. A primeira e a última guerra registrada aparecem por clã; o intervalo entre elas pode conter lacunas por guerra privada ou falha de coleta. Estrelas dos ataques incluem apenas guerras com detalhes individuais e podem superar as estrelas do placar. Guerras manuais não entram.';
      renderFamilyResults();
    } catch {$('family-results-note').textContent='O comparativo de guerras está indisponível agora. Tente atualizar a família em alguns minutos.';$('family-results-table').replaceChildren();}
  }
  async function refreshFamily(force=false) {
    if(familyBusy || (!force && Date.now()-lastFamily<60000))return;
    familyBusy=true;$('family-refresh').disabled=true;
    try {
      const response=await fetch(`${apiBase()}/api/family`,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error();
      const payload=await response.json();dispatchEvent(new CustomEvent('tow:family',{detail:payload}));familyClans=payload.clans;familyNames=new Map(payload.clans.map(c=>[c.tag,c.label]));const now=Date.now();const totals=familyTotals(payload.clans,now);
      $('family-metrics').innerHTML=metric('Membros · coletas recentes',num(totals.members))+metric('Vagas · coletas recentes',num(totals.vacancies))+metric('Guerras em andamento',num(totals.wars))+metric('Ataques pendentes',num(totals.pending));
      $('family-note').textContent=`${totals.fresh}/${payload.clans.length} clãs com coleta nos últimos 30 min. Ciclo automático de aproximadamente 15 min; TOW 4 a cada 5 min. Totais excluem coletas antigas. Guerras privadas podem não estar disponíveis.`;
      $('family-grid').innerHTML=payload.clans.map(c=>{
        const stale=!c.capturedAt || now-c.capturedAt>30*60000;const warFresh=c.warCapturedAt && now-c.warCapturedAt<=30*60000;
        const state=stale?'COLETA PENDENTE':!warFresh?'GUERRA INDISPONÍVEL':({inWar:'EM GUERRA',preparation:'PREPARAÇÃO',warEnded:'ENCERRADA'})[c.war?.state] || 'SEM GUERRA ATIVA';
        return `<article class="panel family-card"><div class="panel-head"><h3>${esc(c.label)}</h3><span class="tag ${!stale && warFresh && c.war?.state==='inWar'?'good':''}">${esc(state)}</span></div><p>${esc(c.name)}</p><span>${esc(c.tag)}</span><dl><div><dt>Tropa</dt><dd>${num(c.members)}/50</dd></div><div><dt>Liga</dt><dd>${esc(c.league || '—')}</dd></div><div><dt>Troféus</dt><dd>${num(c.trophies)}</dd></div></dl>${c.war && warFresh?`<p>Contra ${esc(c.war.opponent)} · ${num(c.war.stars)} × ${num(c.war.enemyStars)} ★${c.war.state==='inWar'?` · ${num(c.war.pending)} ataques pendentes`:''}</p>`:''}<p class="coverage">${c.capturedAt?`Coleta: ${date(c.capturedAt)}`:'Aguardando primeira coleta automática.'}</p><button class="outline-button" data-observe="${esc(c.tag)}">Observar ${esc(c.label)}</button></article>`;
      }).join('');renderFamilyLeague();lastFamily=now;await refreshFamilyResults();
    } catch {dispatchEvent(new CustomEvent('tow:family-error'));$('family-note').textContent='A visão da família está temporariamente indisponível. Tente atualizar novamente.';}
    finally {familyBusy=false;$('family-refresh').disabled=false;}
  }
  $('family-refresh').addEventListener('click',()=>refreshFamily(true));
  $('family-download').addEventListener('click',async()=>{
    const button=$('family-download');button.disabled=true;$('family-download-status').textContent='Preparando a planilha da família…';
    try{
      const [familyResponse,resultsResponse]=await Promise.all([
        fetch(`${apiBase()}/api/family`,{signal:AbortSignal.timeout(20000)}),
        fetch(`${apiBase()}/api/family-results`,{signal:AbortSignal.timeout(20000)})
      ]);
      if(!familyResponse.ok || !resultsResponse.ok)throw new Error('Não foi possível consultar todos os dados. Tente novamente.');
      const [family,results]=await Promise.all([familyResponse.json(),resultsResponse.json()]);
      const file=createFamilyDownload(family,results);const url=URL.createObjectURL(new Blob([file.content],{type:file.mime}));
      const link=document.createElement('a');link.href=url;link.download=file.filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      $('family-download-status').textContent=`Planilha preparada com ${file.rows} linhas de dados dos clãs acompanhados.`;
    }catch(error){$('family-download-status').textContent=error.message;}
    finally{button.disabled=false;}
  });
  $('family-results-sort').addEventListener('change',renderFamilyResults);
  $('family-league-filter').addEventListener('change',renderFamilyLeague);
  $('family-league-table').addEventListener('click',e=>{const b=e.target.closest('[data-observe]');if(b)switchClan(b.dataset.observe);});
  $('family-grid').addEventListener('click',e=>{const b=e.target.closest('[data-observe]');if(b)switchClan(b.dataset.observe);});
  function renderAnalysis() {
    const data=getData();const days=Number($('analysis-period').value);const now=Date.now();
    const wars=periodWars(data?.wars,days,now);const players=fairPerformance(wars,{townHall:$('analysis-th').value,matchup:$('analysis-matchup').value});
    $('analysis-coverage').textContent=`${wars.length} guerras encerradas com detalhes no recorte de ${days} dias. Histórico detalhado limitado aos últimos 20 confrontos guardados. Média por ataque; o volume da amostra aparece ao lado. O filtro de alvo exclui ataques sem CV conhecido.`;
    $('analysis-table').innerHTML=players.length?table(['Guerreiro','CV','Ataques no filtro','Média ★','Triplos','Destruição média'],players.map(p=>[`<button class="text-button" data-warrior="${esc(p.tag)}">${esc(p.name)}</button>`,num(p.townHall),num(p.attacks),num(p.averageStars,2),`${num(p.tripleRate,1)}%`,`${num(p.averageDamage,1)}%`])):empty('Ainda não há ataques registrados para este período e estes filtros.');
    const current=performance(periodWars(data?.wars,7,now),{completedOnly:true});const prior=new Map(performance(periodWars(data?.wars,14,now).filter(w=>parseGameTime(w.endTime)<now-7*86400000),{completedOnly:true}).map(p=>[p.tag,p]));
    $('weekly-comparison').innerHTML=current.length?table(['Últimos 7 dias','Ataques','Média ★ atual','Média ★ 7 dias anteriores'],current.slice(0,10).map(p=>[esc(p.name),num(p.attacks),num(p.averageStars,2),prior.has(p.tag)?`${num(prior.get(p.tag).averageStars,2)} (${prior.get(p.tag).attacks} ataques)`:'Sem amostra'])):empty('A comparação semanal aparecerá conforme as guerras terminarem.');
    const points=(data?.timeline || []).filter(p=>p.capturedAt>=now-days*86400000).sort((a,b)=>b.capturedAt-a.capturedAt);
    $('evolution-table').innerHTML=points.length?table(['Dia (UTC)','Membros','Troféus','Capital','Doações da temporada'],points.map(p=>[esc(p.day),num(p.members),num(p.trophies),num(p.capitalPoints),num(p.donations)])):empty('A série diária começa na primeira coleta após esta atualização.');
    const cwl=[...(data?.wars || []),data?.current?.war].filter(w=>w?.kind==='cwl');const unique=new Map(cwl.map(w=>[`${w.endTime}:${w.opponent?.tag}`,w]));
    const rounds=[...unique.values()].sort((a,b)=>(parseGameTime(a.startTime)||0)-(parseGameTime(b.startTime)||0));
    $('cwl-rounds').innerHTML=rounds.length?rounds.map(w=>`<details class="cwl-round"><summary>${w.round?`Rodada ${w.round}`:'Confronto acompanhado'} · ${esc(w.season || '')} · ${esc(w.opponent?.name)} · ${esc(outcome(w))} · ${num(w.clan?.stars)} × ${num(w.opponent?.stars)} ★</summary><p>${date(parseGameTime(w.startTime))} · ${num(w.teamSize)} jogadores escalados</p>${table(['Escalado','CV','Ataques','Estrelas'],(w.clan?.members || []).sort((a,b)=>a.mapPosition-b.mapPosition).map(m=>[esc(m.name),num(m.townhallLevel ?? m.townHallLevel),num(m.attacks?.length || 0),num((m.attacks || []).reduce((n,a)=>n+(a.stars || 0),0))]))}</details>`).join(''):empty('Nenhuma rodada de Liga acompanhada ainda. A central será preenchida durante a próxima CWL disponível na API.');
  }
  function renderRaid() {
    const data=getData();const items=data?.extras?.raids?.items || [];const value=$('raid-period').value;
    $('raid-period').replaceChildren(...items.map(r=>{const o=document.createElement('option');o.value=r.startTime;o.textContent=`${date(parseGameTime(r.startTime))} · ${r.state==='ended'?'Encerrado':'Em andamento'}`;return o;}));
    if(items.some(r=>r.startTime===value))$('raid-period').value=value;
    const raid=items.find(r=>r.startTime===$('raid-period').value);const members=data?.current?.clan?.memberList || [];
    $('raid-participation').innerHTML=raid?table(['Guerreiro','Ataques','Limite + bônus','Ouro saqueado','Participação'],raidParticipation(raid,members).map(m=>[`<button class="text-button" data-warrior="${esc(m.tag)}">${esc(m.name)}</button>`,m.recorded?num(m.attacks):'—',m.recorded?`${num(m.attackLimit)} + ${num(m.bonusAttackLimit)}`:'—',m.recorded?num(m.capitalResourcesLooted):'—',m.recorded?'Registrada':'Não consta neste fim de semana'])):empty('Sem participação de Capital disponível nesta coleta.');
  }
  function openWarrior(tag) {
    const data=getData();const member=data?.current?.clan?.memberList?.find(m=>m.tag===tag);const p=performance(data?.wars || [],{completedOnly:true}).find(p=>p.tag===tag);
    const current=performance([data?.current?.war]).find(p=>p.tag===tag);const person=member || p || current;if(!person)return;
    $('warrior-title').textContent=person.name;$('warrior-identity').textContent=`${tag} · CV ${num(member?.townHallLevel ?? p?.townHall ?? current?.townHall)} · ${data.current.clan.name}`;
    $('warrior-metrics').innerHTML=metric('Troféus atuais',num(member?.trophies))+metric('Doações da temporada',num(member?.donations))+metric('Ataques em guerras encerradas',num(p?.attacks))+metric('Média ★ em guerras encerradas',num(p?.averageStars,2));
    $('warrior-game').href=`https://link.clashofclans.com/pt?action=OpenPlayerProfile&tag=${encodeURIComponent(tag.slice(1))}`;
    $('warrior-history').innerHTML=p?table(['Alvo','CV do alvo','Estrelas','Destruição'],p.hits.map(h=>[esc(h.targetName),num(h.targetTH),num(h.stars),`${num(h.destructionPercentage,1)}%`])):empty('Sem ataques detalhados em guerras encerradas para este guerreiro.');
    const raids=(data?.extras?.raids?.items || []).flatMap(r=>(r.members || []).filter(m=>m.tag===tag).map(m=>[date(parseGameTime(r.startTime)),num(m.attacks),num(m.capitalResourcesLooted)]));
    $('warrior-raids').innerHTML=raids.length?table(['Fim de semana','Ataques','Ouro saqueado'],raids):empty('Nenhuma participação de Capital disponível para este guerreiro.');
    dispatchEvent(new CustomEvent('tow:warrior',{detail:tag}));$('warrior-dialog').showModal();
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-warrior]');if(b)openWarrior(b.dataset.warrior);});
  $('warrior-close').addEventListener('click',()=>$('warrior-dialog').close());
  for(const id of ['analysis-period','analysis-th','analysis-matchup'])$(id).addEventListener('change',renderAnalysis);
  $('raid-period').addEventListener('change',renderRaid);
  refreshFamily();setInterval(()=>{if(!document.hidden)refreshFamily();},60000);
  return {refresh:()=>refreshFamily(true),render(){renderAnalysis();renderRaid();},clear(){$('warrior-dialog').close();renderAnalysis();renderRaid();}};
}
