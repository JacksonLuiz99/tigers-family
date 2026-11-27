import { pendingMessage } from './whatsapp.js';

export function familyWarStatus(payload,{now=Date.now()}={}) {
  try {
    const summary=pendingMessage(payload,{now});
    return {kind:'pending',label:`${summary.players} jogador(es) · ${summary.attacks} ataque(s) pendente(s)`,players:summary.players,attacks:summary.attacks,capturedAt:summary.capturedAt,endAt:summary.endAt};
  } catch(error) {
    if(error.message.startsWith('Missão cumprida:'))return {kind:'complete',label:'Todos os ataques usados'};
    if(payload?.current?.war?.state==='preparation' && payload?.health?.code==='ok')return {kind:'preparation',label:'Em preparação'};
    return {kind:'unavailable',label:error.message};
  }
}

export function prioritizeFamilyWars(rows,{now=Date.now()}={}) {
  const priority={pending:0,unavailable:1,preparation:2,complete:3};
  return rows.map(row=>({...row,status:row.payload?familyWarStatus(row.payload,{now}):row.status})).sort((a,b)=>
    (priority[a.status.kind]??4)-(priority[b.status.kind]??4) ||
    (a.status.kind==='pending'?(a.status.endAt-b.status.endAt || b.status.attacks-a.status.attacks):0) ||
    a.clan.label.localeCompare(b.clan.label,'pt-BR'));
}
