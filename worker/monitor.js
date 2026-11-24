import { detectEvents, gameTime, orientWar, warId } from './events.js';
import { recordWarResults } from './results.js';
import { recordDetailedWars } from './detailed-wars.js';

export async function clash(env, path) {
  const base = env.CLASH_API_BASE || 'https://cocproxy.royaleapi.dev/v1';
  if (!['https://cocproxy.royaleapi.dev/v1','https://api.clashofclans.com/v1'].includes(base)) throw new Error('api_configuration');
  let response;
  try {
    response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${env.CLASH_API_TOKEN}` }, signal: AbortSignal.timeout(12000) });
  } catch { throw new Error('api_network'); }
  if (!response.ok) throw new Error(`api_http_${response.status}`);
  return response.json();
}

export async function readState(db, key) {
  const row = await db.prepare('SELECT value FROM state WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : null;
}

export function stateStatement(db, key, value) {
  return db.prepare('INSERT INTO state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(value));
}

export async function loadExtras(env, now, cached) {
  if (cached?.attemptedAt && now-cached.attemptedAt < 3600000) return cached;
  const next = { ...cached, attemptedAt: now };
  const endpoints = [['warLog', 'warlog'], ['raids', 'capitalraidseasons']];
  await Promise.all(endpoints.map(async ([key, endpoint]) => {
    try {
      const data = await clash(env, `/clans/${encodeURIComponent(env.CLAN_TAG)}/${endpoint}`);
      if (!Array.isArray(data.items)) throw new Error('invalid_response');
      let items = data.items.slice(0, key === 'raids' ? 3 : 30);
      if (key === 'raids') items = items.map(r => ({ state:r.state, startTime:r.startTime, endTime:r.endTime, capitalTotalLoot:r.capitalTotalLoot, raidsCompleted:r.raidsCompleted, totalAttacks:r.totalAttacks, enemyDistrictsDestroyed:r.enemyDistrictsDestroyed, offensiveReward:r.offensiveReward, defensiveReward:r.defensiveReward,
        members:(r.members || []).map(m => ({tag:m.tag,name:m.name,attacks:m.attacks,attackLimit:m.attackLimit,bonusAttackLimit:m.bonusAttackLimit,capitalResourcesLooted:m.capitalResourcesLooted})) }));
      next[key] = { items, updatedAt:now, error:null };
    } catch (e) {
      next[key] = { ...cached?.[key], error:/^api_[a-z0-9_]+$/.test(e.message) ? e.message : 'unavailable' };
    }
  }));
  return next;
}

export async function loadWar(env, now) {
  const tag = env.CLAN_TAG; const path = `/clans/${encodeURIComponent(tag)}`;
  let regular = null; let regularError = null;
  try { regular = orientWar(await clash(env,`${path}/currentwar`),tag); }
  catch (e) { regularError = e.message; }
  if (regular && ['preparation','inWar'].includes(regular.state)) return { war: { ...regular, kind: 'regular' }, warning: null };
  let group;
  try { group = await clash(env,`${path}/currentwar/leaguegroup`); }
  catch (e) {
    // 404 é normal fora da Liga; 403 ou indisponibilidade não equivalem a "sem guerra".
    if (e.message === 'api_http_404') {
      if (regularError) throw new Error(regularError);
      return { war: regular ? { ...regular, kind: 'regular' } : null, warning: null };
    }
    if (regularError) throw new Error(regularError);
    return { war: regular ? { ...regular, kind: 'regular' } : null, warning: e.message };
  }
  const rounds = (group.rounds || []).filter(r => r.warTags?.some(t => t !== '#0'));
  // As três últimas rodadas cobrem rodada ativa, próxima preparação e último resultado.
  // A Liga tem no máximo quatro confrontos por rodada (grupos de oito clãs).
  const tags = [...new Set(rounds.slice(-3).flatMap(r => r.warTags).filter(t => t !== '#0'))];
  const responses = await Promise.allSettled(tags.map(t => clash(env,`/clanwarleagues/wars/${encodeURIComponent(t)}`)));
  const wars = responses.map((r,i) => r.status === 'fulfilled' ? orientWar({...r.value,tag:tags[i]},tag) : null).filter(Boolean);
  const rank = w => w.state === 'inWar' ? 0 : w.state === 'preparation' ? 1 : 2;
  wars.sort((a,b) => rank(a)-rank(b) || (rank(a) === 1 ? gameTime(a.startTime)-gameTime(b.startTime) : gameTime(b.endTime)-gameTime(a.endTime)));
  const warning = responses.some(r => r.status === 'rejected') ? 'cwl_partial' : null;
  if (!wars.length && warning) throw new Error('cwl_partial');
  const observedWars = wars.map(w => ({ ...w, kind:'cwl', attacksPerMember:1, season:group.season, round:(group.rounds || []).findIndex(r=>r.warTags?.includes(w.tag))+1 }));
  if (regular) observedWars.push({ ...regular, kind:'regular' });
  return { war: observedWars[0] || null, observedWars, warning };
}

function channels(env) {
  const allowed = (env.ALERT_CHANNELS || 'discord').split(',');
  return [env.DISCORD_WEBHOOK_URL && allowed.includes('discord') ? 'discord' : null].filter(Boolean);
}

export async function sendAlert(env, channel, message) {
  // Limita a mensagem sem HTML/Markdown e impede menções de nomes vindos do jogo.
  const content = message.length > 1800 ? message.slice(0,1740)+'… Consulte a lista completa no painel.' : message;
  let url, body;
  if (channel === 'discord') {
    if (!/^https:\/\/discord\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(env.DISCORD_WEBHOOK_URL || '')) throw new Error('channel_configuration');
    url = env.DISCORD_WEBHOOK_URL+'?wait=true';
    body = { content, allowed_mentions: { parse: [] } };
  } else throw new Error('unknown_channel');
  let response;
  try { response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) }); }
  catch { throw new Error('channel_network'); }
  if (!response.ok) throw new Error(`channel_http_${response.status}`);
}

export async function deliver(env, now) {
  const enabled = channels(env);
  if (!enabled.length) return;
  const slots = enabled.map(()=>'?').join(',');
  const pending = await env.DB.prepare(`SELECT d.*, e.message FROM deliveries d JOIN events e ON e.id=d.event_id
    WHERE d.sent_at IS NULL AND d.channel IN (${slots}) AND d.next_try <= ? AND (e.expires_at IS NULL OR e.expires_at > ?)
    ORDER BY e.created_at ASC LIMIT 4`).bind(...enabled,now,now).all();
  for (const item of pending.results) {
    if (!enabled.includes(item.channel)) continue;
    try {
      await sendAlert(env,item.channel,item.message);
      await env.DB.prepare('UPDATE deliveries SET sent_at=?, attempts=attempts+1, error=NULL WHERE event_id=? AND channel=?').bind(now,item.event_id,item.channel).run();
    } catch (e) {
      const delay = Math.min(3600000,300000*2**Math.min(item.attempts,4));
      // Erros são códigos internos; nunca persistimos URLs, tokens ou corpos de resposta.
      const code = /^channel_[a-z0-9_]+$/.test(e.message) ? e.message : 'channel_failed';
      await env.DB.prepare('UPDATE deliveries SET attempts=attempts+1, next_try=?, error=? WHERE event_id=? AND channel=?').bind(now+delay,code,item.event_id,item.channel).run();
    }
  }
}

export async function synchronize(env, now = Date.now()) {
  if (!env.CLASH_API_TOKEN) return { ok: false, code: 'missing_clash_token' };
  const lease = await env.DB.prepare("UPDATE leases SET until_ms=? WHERE id='sync' AND until_ms < ?").bind(now+240000,now).run();
  if (!lease.meta.changes) return { ok: false, code: 'sync_busy' };
  try {
    const previous = await readState(env.DB,'current');
    const clan = await clash(env,`/clans/${encodeURIComponent(env.CLAN_TAG)}`);
    if (clan.tag !== env.CLAN_TAG || !Array.isArray(clan.memberList)) throw new Error('invalid_clan_response');
    let warState; let warning = null;
    try { warState = await loadWar(env,now); warning=warState.warning; }
    catch (e) { warState={war: previous?.war || null}; warning=e.message; }
    const current = { clan, war: warState.war, capturedAt: now, warCapturedAt: warning ? previous?.warCapturedAt || null : now };
    // Não gera eventos de guerra a partir de dados antigos ou incompletos.
    const detected = detectEvents(previous,warning ? {...current,war:null} : current,now);
    // A preparação da próxima rodada não pode esconder o resultado da anterior.
    const observedWars = warState.observedWars || (current.war ? [current.war] : []);
    if (!warning) for (const observed of observedWars) {
      if (observed.state === 'warEnded' && warId(observed) !== warId(current.war)) {
        detected.push(...detectEvents(previous,{...current,war:observed},now).filter(e=>e.type==='war_end'));
      }
    }
    const writes = [stateStatement(env.DB,'current',current), stateStatement(env.DB,'health',{ lastAttempt:now,lastSuccess:now,code:warning || 'ok' })];
    const allowedTypes=(env.ALERT_TYPES || 'member_join,member_leave,war_start,war_end,war_reminder').split(',');
    for (const event of detected) {
      writes.push(env.DB.prepare('INSERT OR IGNORE INTO events(id,type,message,created_at,expires_at) VALUES (?,?,?,?,?)').bind(event.id,event.type,event.message,event.createdAt,event.expiresAt));
      if (allowedTypes.includes(event.type)) for (const channel of channels(env)) {
        const filter=env[`ALERT_TYPES_${channel.toUpperCase()}`];
        if (filter && !filter.split(',').includes(event.type)) continue;
        writes.push(env.DB.prepare('INSERT OR IGNORE INTO deliveries(event_id,channel) VALUES (?,?)').bind(event.id,channel));
      }
    }
    if (!warning) for (const observed of observedWars) writes.push(env.DB.prepare('INSERT INTO wars(id,updated_at,end_at,payload) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,end_at=excluded.end_at,payload=excluded.payload')
      .bind(warId(observed),now,gameTime(observed.endTime),JSON.stringify(observed)));
    writes.push(env.DB.prepare('INSERT OR IGNORE INTO snapshots(hour,created_at,payload) VALUES (?,?,?)').bind(Math.floor(now/3600000),now,JSON.stringify(clan)));
    writes.push(env.DB.prepare('DELETE FROM snapshots WHERE created_at < ?').bind(now-30*86400000));
    writes.push(env.DB.prepare('DELETE FROM events WHERE created_at < ?').bind(now-90*86400000));
    writes.push(env.DB.prepare('DELETE FROM wars WHERE updated_at < ?').bind(now-180*86400000));
    await env.DB.batch(writes);
    await deliver(env,now);
    // Dados complementares usam cache de uma hora; falhas não interrompem guerra ou avisos.
    try {
      const extras = await loadExtras(env,now,await readState(env.DB,'extras'));
      await stateStatement(env.DB,'extras',extras).run();
      try { await recordWarResults(env.DB,env.CLAN_TAG,[...observedWars,...(extras?.attemptedAt===now ? extras?.warLog?.items || [] : [])],now); } catch { /* O comparativo não interrompe a coleta. */ }
    } catch { /* A coleta principal já foi persistida. */ }
    try {
      const backfilled=await readState(env.DB,'detail_backfill_primary');
      const previousWars=backfilled ? [] : (await env.DB.prepare('SELECT payload FROM wars WHERE end_at>=? ORDER BY end_at DESC LIMIT 250').bind(now-270*86400000).all()).results.map(row=>JSON.parse(row.payload));
      await recordDetailedWars(env.DB,env.CLAN_TAG,[...previousWars,...observedWars],now);
      if(!backfilled)await stateStatement(env.DB,'detail_backfill_primary',true).run();
    } catch { /* O histórico detalhado não interrompe a coleta. */ }
    return { ok: true, warning, events:detected.length };
  } catch (e) {
    const code=/^(api_[a-z0-9_]+|invalid_clan_response)$/.test(e.message) ? e.message : 'sync_failed';
    const health=await readState(env.DB,'health');
    await stateStatement(env.DB,'health',{ ...health,lastAttempt:now,code }).run();
    // Entregas já persistidas continuam sendo tentadas mesmo com a API fora do ar.
    await deliver(env,now);
    return { ok:false, code };
  } finally {
    await env.DB.prepare("UPDATE leases SET until_ms=0 WHERE id='sync'").run();
  }
}
