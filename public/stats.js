export function parseGameTime(value) {
  if (!value) return null;
  const n = Date.parse(value.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, '$1-$2-$3T$4:$5:$6'));
  return Number.isFinite(n) ? n : null;
}

export function performance(wars, { completedOnly = false } = {}) {
  const seen = new Set(); const players = new Map();
  for (const war of wars.filter(Boolean)) {
    if (!['inWar', 'warEnded'].includes(war.state) || (completedOnly && war.state !== 'warEnded')) continue;
    const key = `${war.startTime}:${war.endTime}:${war.opponent?.tag}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const limit = war.attacksPerMember ?? (war.kind === 'cwl' ? 1 : 2);
    const opponents = new Map((war.opponent?.members || []).map(m => [m.tag, m]));
    for (const m of war.clan?.members || []) {
      const p = players.get(m.tag) || { tag: m.tag, name: m.name, townHall: m.townhallLevel ?? m.townHallLevel, wars: 0, attacks: 0, expected: 0, stars: 0, triples: 0, damage: 0, seconds: 0, timed: 0, position: m.mapPosition, hits: [] };
      p.name = m.name; p.wars++; p.expected += limit;
      for (const a of m.attacks || []) {
        p.attacks++; p.stars += a.stars || 0; p.triples += a.stars === 3 ? 1 : 0; p.damage += a.destructionPercentage || 0;
        if (Number.isFinite(a.duration)) { p.seconds += a.duration; p.timed++; }
        const target = opponents.get(a.defenderTag);
        p.hits.push({ ...a, targetName: target?.name || a.defenderTag, targetPosition: target?.mapPosition, targetTH: target?.townhallLevel ?? target?.townHallLevel });
      }
      players.set(m.tag, p);
    }
  }
  return [...players.values()].map(p => ({ ...p, averageStars: p.attacks ? p.stars / p.attacks : 0, averageDamage: p.attacks ? p.damage / p.attacks : 0, tripleRate: p.attacks ? 100*p.triples/p.attacks : 0, participation: p.expected ? 100*p.attacks/p.expected : 0, averageDuration: p.timed ? p.seconds/p.timed : null }))
    .sort((a,b) => b.stars-a.stars || b.triples-a.triples || b.averageDamage-a.averageDamage || b.attacks-a.attacks || a.name.localeCompare(b.name, 'pt-BR'));
}

export function outcome(war) {
  if (war.result) return ({win:'Vitória',lose:'Derrota',tie:'Empate'})[war.result] || 'Encerrada';
  if (war.state !== 'warEnded') return ({inWar:'Em guerra',preparation:'Preparação'})[war.state] || 'Sem resultado';
  const diff = (war.clan.stars-war.opponent.stars) || (war.clan.destructionPercentage-war.opponent.destructionPercentage);
  return diff > 0 ? 'Vitória' : diff < 0 ? 'Derrota' : 'Empate';
}

// Mantém a ordem do ranking; identifica empates antes do desempate alfabético.
export function podiumHighlights(players) {
  const eligible = players.filter(p => p.attacks > 0);
  const equal = (a,b) => a.stars === b.stars && a.triples === b.triples && a.averageDamage === b.averageDamage && a.attacks === b.attacks;
  return eligible.slice(0,3).map((player,index) => ({ ...player,slot:index+1,tiedWith:eligible.filter(other=>other.tag!==player.tag && equal(player,other)).length }));
}

export function mergedHistory(observed = [], log = []) {
  const map = new Map();
  for (const war of log) {
    if (!war.clan || !war.opponent) continue;
    const key = `${war.endTime}:${war.opponent.tag || war.opponent.name}`;
    map.set(key, { ...war, state: 'warEnded', source: 'api', kind: war.kind || (war.attacksPerMember === 1 ? 'cwl' : 'regular') });
  }
  for (const war of observed) {
    if (!war?.clan || !war.opponent) continue;
    const key = `${war.endTime}:${war.opponent.tag || war.opponent.name}`;
    map.set(key, { ...war, source: 'monitor' });
  }
  return [...map.values()].sort((a,b) => (parseGameTime(b.endTime) || 0)-(parseGameTime(a.endTime) || 0));
}

export function publicLinks(env) {
  const discord = env.DISCORD_PUBLIC_URL || '';
  return {
    discord: /^https:\/\/(?:discord\.gg\/[A-Za-z0-9-]+|discord\.com\/(?:invite\/[A-Za-z0-9-]+|channels\/\d+\/\d+))$/.test(discord) ? discord : null
  };
}

// Mês calendário em horário de Brasília (AAAA-MM).
export function brasiliaMonth(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(ms).slice(0, 7);
}

// Pódio do mês: mesmo critério do pódio da guerra, aplicado às guerras encerradas do mês.
// Só entra quem usou pelo menos `minParticipation`% dos ataques disponíveis no mês.
// `truncated` indica que a lista pode ter começado no meio do mês (limite de guerras guardadas).
export function monthlyPodium(wars = [], nowMs = Date.now(), { minParticipation = 50, storeLimit = 20 } = {}) {
  const month = brasiliaMonth(nowMs);
  const known = wars.filter(w => w && Number.isFinite(parseGameTime(w.endTime)));
  const inMonth = known.filter(w => brasiliaMonth(parseGameTime(w.endTime)) === month);
  const players = performance(inMonth, { completedOnly: true });
  const eligible = players.filter(p => p.participation >= minParticipation);
  const oldest = known.length ? Math.min(...known.map(w => parseGameTime(w.endTime))) : null;
  return {
    month,
    wars: inMonth.length,
    players: podiumHighlights(eligible),
    eligible: eligible.length,
    considered: players.length,
    truncated: known.length >= storeLimit && oldest !== null && brasiliaMonth(oldest) === month
  };
}
