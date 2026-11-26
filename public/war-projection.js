import { pendingMessage } from './whatsapp.js';
import { attackStars } from './stats.js';

export function warProjection(payload,{now=Date.now()}={}) {
  let summary;
  try{summary=pendingMessage(payload,{now});}
  catch(error){
    const reason=error.message;
    const message=reason.startsWith('Missão cumprida:')?'Todos os ataques já foram utilizados nesta guerra.':
      reason.includes('restringe')?'A API restringe esta guerra; não é possível projetar o ritmo.':
      reason.includes('antiga')?'A coleta está antiga. Atualize os dados para projetar a guerra.':
      reason.includes('escalação') || reason.includes('individuais')?'A escalação ou os ataques estão incompletos. Aguarde uma nova coleta.':
      'A guerra ativa ainda não tem dados confirmados suficientes para uma projeção.';
    return {kind:'unavailable',message};
  }
  const war=payload.current.war,attacks=(war.clan.members || []).flatMap(m=>m.attacks || []);
  if(attacks.some(a=>!Number.isInteger(a.stars)||a.stars<0||a.stars>3))return {kind:'unavailable',message:'Há ataques sem estrelas confirmadas. Aguarde uma nova coleta para projetar a guerra.'};
  const observed=attackStars(war),used=observed.total,remaining=summary.attacks,total=used+remaining;
  const minSample=Math.min(10,Math.max(3,Math.ceil(total*0.4)));
  if(used<minSample)return {kind:'insufficient',used,minimum:minSample,remaining,message:`Amostra inicial: ${used}/${minSample} ataques necessários para estimar o ritmo. Aguarde mais resultados; os ataques pendentes já podem ser consultados separadamente.`};
  const triples=observed.counts[3],rate=triples/used,projected=Math.round(rate*remaining);
  const opponent=war.opponent?.members;
  const targets=Array.isArray(opponent)&&opponent.length===war.teamSize?new Set(opponent.map(m=>m.tag)):null;
  const reliableTargets=targets?.size===war.teamSize && attacks.every(a=>a.stars!==3 || targets.has(a.defenderTag));
  const tripledBases=reliableTargets?new Set(attacks.filter(a=>a.stars===3).map(a=>a.defenderTag)).size:null;
  const basesMissing=tripledBases===null?null:war.teamSize-tripledBases;
  const neededRate=basesMissing===null?null:Math.ceil(100*basesMissing/remaining);
  const headline=`${triples}/${used} ataques deram 3★ (${Math.round(rate*100)}%). Mantido esse ritmo, seriam cerca de ${projected} ataques de 3★ nos ${remaining} restantes.`;
  const detail=basesMissing===null?'Os alvos não estão completos na coleta; não é possível confirmar quantas bases faltam fechar.':basesMissing>remaining?
    `Faltam ${basesMissing} bases sem 3★, mas restam apenas ${remaining} ataques. Não há ataques suficientes para fechar todas as bases nesta guerra.`:
    `Faltam ${basesMissing} base${basesMissing===1?'':'s'} sem 3★. Para alcançar esse mínimo, seriam necessários triplos em pelo menos ${neededRate}% dos ataques restantes. ${projected>=basesMissing?'O ritmo atual alcança esse mínimo numérico.':'O ritmo atual fica abaixo desse mínimo numérico.'} Ataques repetidos no mesmo alvo podem mudar o resultado.`;
  return {kind:'estimate',used,remaining,triples,rate,projected,basesMissing,neededRate,message:`${headline} ${detail} Estimativa, não previsão de vitória.`};
}
