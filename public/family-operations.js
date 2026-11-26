import { pendingMessage } from './whatsapp.js';

export function familyWarStatus(payload,{now=Date.now()}={}) {
  try {
    const summary=pendingMessage(payload,{now});
    return {kind:'pending',label:`${summary.players} jogador(es) · ${summary.attacks} ataque(s) pendente(s)`,players:summary.players,attacks:summary.attacks,capturedAt:summary.capturedAt};
  } catch(error) {
    if(error.message.startsWith('Missão cumprida:'))return {kind:'complete',label:'Todos os ataques usados'};
    if(payload?.current?.war?.state==='preparation' && payload?.health?.code==='ok')return {kind:'preparation',label:'Em preparação'};
    return {kind:'unavailable',label:error.message};
  }
}
