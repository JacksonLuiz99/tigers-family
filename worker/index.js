import { pushRoute, PushInputError, enqueuePush, deliverPush, collectPrimaryPush } from './push.js';
import { saveChannel } from './channels.js';
import { managementOverview, playerEvolution, clanManagement, saveManualWar, saveGoals, ValidationError } from './management.js';
import { readState, synchronize } from './monitor.js';
import { publicLinks } from '../public/stats.js';
import { CLANS, DEFAULT_CLAN, findClan } from '../public/clans.js';
import { familyDashboard, familyOverview, synchronizeFamily, recordPrimarySummary, locatePlayer, isPlayerTag } from './family.js';
import { familyResults } from './results.js';
import { detailedRanking } from './detailed-wars.js';
import { listContacts, saveContact, ContactInputError } from './contacts.js';
import { playerHistory, PlayerHistoryInputError } from './player-history.js';

const json = (data,status=200,headers={}) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});

async function authorized(request, token) {
  if (!token || token.length < 32) return false;
  const provided = request.headers.get('Authorization') || '';
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [a,b]=await Promise.all([digest(provided),digest(`Bearer ${token}`)]);
  return a.reduce((n,v,i)=>n|(v^b[i]),0) === 0;
}

export async function route(request,env) {
  const url=new URL(request.url);
  const path=url.pathname;
  if (!path.startsWith('/api/')) {
    const response=await env.ASSETS.fetch(request);
    const headers=new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://*.workers.dev; img-src 'self' https://api-assets.clashofclans.com; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    return new Response(response.body,{status:response.status,headers});
  }
  const origin=request.headers.get('Origin');
  const headers={Vary:'Origin'};
  if (origin && [env.PUBLIC_ORIGIN,env.LEGACY_PUBLIC_ORIGIN].includes(origin)) headers['Access-Control-Allow-Origin']=origin;
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
  if(path.startsWith('/api/push/')){
    try{const result=await pushRoute(request,env,url);return json(result,result.status || 200,headers);}
    catch(error){return json({error:error instanceof PushInputError?error.message:'Não foi possível atualizar as notificações. Tente novamente.'},error instanceof PushInputError?400:503,headers);}
  }
  if(path==='/api/leadership-contacts') {
    if(!['GET','POST'].includes(request.method))return json({error:'method_not_allowed'},405,headers);
    if(!await authorized(request,env.LEADERSHIP_TOKEN))return json({error:'Chave de liderança inválida.'},401,headers);
    if(!env.DB)return json({error:'Banco indisponível.'},503,headers);
    try {
      if(request.method==='GET')return json(await listContacts(env,url.searchParams.get('clan')),200,headers);
      if(!(request.headers.get('Content-Type') || '').startsWith('application/json'))return json({error:'Envie um formulário válido.'},415,headers);
      if(Number(request.headers.get('Content-Length') || 0)>4096)return json({error:'Registro muito grande.'},413,headers);
      const reader=request.body?.getReader();if(!reader)return json({error:'Corpo obrigatório.'},400,headers);
      const chunks=[];let size=0;
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return json({error:'Registro muito grande.'},413,headers);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Formulário inválido.'},400,headers);}
      return json(await saveContact(env,input),200,headers);
    } catch(error){return json({error:error instanceof ContactInputError?error.message:'Não foi possível consultar ou salvar contatos.'},error instanceof ContactInputError?400:503,headers);}
  }
  if(path==='/api/leadership-player-history') {
    if(request.method!=='GET')return json({error:'method_not_allowed'},405,headers);
    if(!await authorized(request,env.LEADERSHIP_TOKEN))return json({error:'Chave de liderança inválida.'},401,headers);
    if(!env.DB)return json({error:'Banco indisponível.'},503,headers);
    try{return json(await playerHistory(env,url.searchParams.get('player'),url.searchParams.get('from') || '',url.searchParams.get('to') || ''),200,headers);}
    catch(error){return json({error:error instanceof PlayerHistoryInputError?error.message:'Histórico indisponível.'},error instanceof PlayerHistoryInputError?400:503,headers);}
  }
  if (['/api/management','/api/player-evolution','/api/clan-management','/api/leadership','/api/manual-wars','/api/goals'].includes(path)) {
    try {
      if(path==='/api/management' && request.method==='GET')return json(await managementOverview(env),200,headers);
      if(path==='/api/player-evolution' && request.method==='GET')return json(await playerEvolution(env,url.searchParams.get('player')),200,headers);
      if(path==='/api/clan-management' && request.method==='GET'){
        const clan=findClan(url.searchParams.get('clan'));if(!clan)return json({error:'unknown_clan'},400,headers);
        return json(await clanManagement(env,clan.tag),200,headers);
      }
      if(request.method!=='POST')return json({error:'method_not_allowed'},405,headers);
      if(!await authorized(request,env.LEADERSHIP_TOKEN))return json({error:'Chave de liderança inválida.'},401,headers);
      if(path==='/api/leadership')return json({ok:true},200,headers);
      if(!['/api/manual-wars','/api/goals'].includes(path))return json({error:'method_not_allowed'},405,headers);
      if(!(request.headers.get('Content-Type') || '').startsWith('application/json'))return json({error:'Envie um formulário válido.'},415,headers);
      const reader=request.body?.getReader();if(!reader)return json({error:'Corpo obrigatório.'},400,headers);
      const chunks=[];let size=0;
      for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();return json({error:'Registro muito grande.'},413,headers);}chunks.push(value);}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}
      let input;try{input=JSON.parse(new TextDecoder().decode(bytes));}catch{return json({error:'Formulário inválido.'},400,headers);}
      let result;try{result=path==='/api/manual-wars'?await saveManualWar(env,input):await saveGoals(env,input);}catch(e){
        if(e instanceof ValidationError)return json({error:e.message},400,headers);throw e;
      }
      return json(result,result.status || 200,headers);
    }catch(error){return json({error:error instanceof ValidationError?error.message:'Não foi possível consultar ou salvar os dados. Tente novamente.'},error instanceof ValidationError?400:503,headers);}
  }
  if (path === '/api/sync' && request.method === 'POST') {
    if (!await authorized(request,env.ADMIN_TOKEN)) return json({error:'unauthorized'},401,headers);
    const result=await synchronize(env);
    await recordPrimarySummary(env);
    return json(result,result.ok?200:result.code==='sync_busy'?409:503,headers);
  }
  if(path === '/api/family' && request.method === 'GET') {
    try {return json(await familyOverview(env),200,headers);} catch {return json({error:'family_unavailable'},503,headers);}
  }
  if(path === '/api/family-results') {
    if(request.method !== 'GET') return json({error:'method_not_allowed'},405,headers);
    try {return json(await familyResults(env.DB),200,headers);} catch {return json({error:'results_unavailable'},503,headers);}
  }
  if(path === '/api/detailed-ranking') {
    if(request.method !== 'GET') return json({error:'method_not_allowed'},405,headers);
    if(!env.DB) return json({error:'database_unavailable'},503,headers);
    try {
      const result=await detailedRanking(env.DB,url.searchParams.get('clan'),url.searchParams.get('from') || '',url.searchParams.get('to') || '');
      return json(result,result.error ? 400 : 200,headers);
    } catch {return json({error:'ranking_unavailable'},503,headers);}
  }
  if (path === '/api/alert-channels') {
    if (request.method !== 'POST') return json({error:'method_not_allowed'},405,headers);
    if (!await authorized(request,env.LEADERSHIP_TOKEN)) return json({error:'Chave de liderança inválida.'},401,headers);
    if (Number(request.headers.get('Content-Length') || 0) > 4096) return json({error:'Registro muito grande.'},413,headers);
    let input;try {input=await request.json();} catch {return json({error:'Formulário inválido.'},400,headers);}
    try {return json(await saveChannel(env,input?.clan,input?.webhook),200,headers);}
    catch (error) {return json({error: error.message === 'invalid_webhook' ? 'Endereço de webhook inválido.' : 'Clã desconhecido.'},400,headers);}
  }
  if (path === '/api/player-locate') {
    if (request.method !== 'GET') return json({error:'method_not_allowed'},405,headers);
    const player=url.searchParams.get('player');
    if (!isPlayerTag(player)) return json({error:'invalid_player'},400,headers);
    try {return json(await locatePlayer(env,player),200,headers);} catch {return json({error:'unavailable'},503,headers);}
  }
  if (path !== '/api/dashboard') return json({error:'not_found'},404,headers);
  if (request.method !== 'GET') return json({error:'method_not_allowed'},405,headers);
  const selected=findClan(url.searchParams.get('clan') || env.CLAN_TAG || DEFAULT_CLAN);
  if (!selected) return json({error:'unknown_clan'},400,headers);
  if (!env.DB) return json({configured:false,clanTag:selected.tag,clans:CLANS,health:{code:'missing_database'}},503,headers);
  try {
    if (selected.tag !== (env.CLAN_TAG || DEFAULT_CLAN)) return json(await familyDashboard(env,selected.tag),200,headers);
    const [current,health,events,wars,snapshot,delivery,extras,timeline]=await Promise.all([
      readState(env.DB,'current'),readState(env.DB,'health'),
      env.DB.prepare('SELECT id,type,message,created_at FROM events ORDER BY created_at DESC LIMIT 30').all(),
      env.DB.prepare('SELECT payload FROM wars ORDER BY end_at DESC LIMIT 20').all(),
      env.DB.prepare('SELECT payload,created_at FROM snapshots WHERE created_at <= ? ORDER BY created_at DESC LIMIT 1').bind(Date.now()-86400000).first(),
      env.DB.prepare('SELECT channel, MAX(sent_at) AS last_sent, SUM(CASE WHEN sent_at IS NULL AND next_try>0 THEN 1 ELSE 0 END) AS retrying FROM deliveries GROUP BY channel').all(),
      readState(env.DB,'extras'),readState(env.DB,'timeline')
    ]);
    const configured=Boolean(env.CLASH_API_TOKEN);
    const payload={configured,clanTag:env.CLAN_TAG,clans:CLANS,monitoringMode:'automatic',collectionIntervalMinutes:5,timeline:timeline || [],current,health:health || {code:configured?'awaiting_first_sync':'missing_clash_token'},
      events:events.results,wars:wars.results.map(w=>JSON.parse(w.payload)),
      baseline:snapshot ? {clan:JSON.parse(snapshot.payload),capturedAt:snapshot.created_at} : null,
      channels:{discord:Boolean(env.DISCORD_WEBHOOK_URL)},
      delivery:delivery.results, extras, links:publicLinks(env)};
    // Um único documento público pode ser cacheado no painel; não há rotas públicas de escrita.
    return json(payload,200,headers);
  } catch {
    return json({configured:false,clanTag:selected.tag,clans:CLANS,health:{code:'database_not_ready'}},503,headers);
  }
}

export default {
  fetch: route,
  scheduled(controller,env,ctx) {
    const now=controller.scheduledTime || Date.now();
    ctx.waitUntil(controller.cron === '* * * * *' ? synchronizeFamily(env,now).then(async payload=>{try{await enqueuePush(env,payload,now);await deliverPush(env,now);}catch{/* A coleta e os canais atuais permanecem independentes do push. */}return payload;}) : synchronize(env,now).then(async result=>{await recordPrimarySummary(env,now);try{await collectPrimaryPush(env,now);}catch{/* O push não interrompe a coleta principal. */}return result;}));
  }
};
