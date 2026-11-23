import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyPodium, brasiliaMonth } from '../public/stats.js';

const now = Date.parse('2026-11-23T15:00:00Z');
function war(end, members) {
  return { state: 'warEnded', kind: 'regular', attacksPerMember: 2, startTime: `${end}-start`, endTime: end, teamSize: members.length,
    clan: { tag: '#R0UPVVVY', stars: 10, members: members.map((m, i) => ({ tag: m.tag, name: m.name, mapPosition: i + 1, attacks: m.attacks })) },
    opponent: { tag: '#OPP', name: 'Rival', stars: 8, members: members.map((m, i) => ({ tag: `#O${i}`, name: `O${i}`, mapPosition: i + 1 })) } };
}
const ana = { tag: '#A', name: 'Ana', attacks: [{ stars: 3, destructionPercentage: 100, defenderTag: '#O0' }, { stars: 3, destructionPercentage: 100, defenderTag: '#O1' }] };
const beto = { tag: '#B', name: 'Beto', attacks: [{ stars: 2, destructionPercentage: 80, defenderTag: '#O0' }, { stars: 1, destructionPercentage: 50, defenderTag: '#O1' }] };
const caio = { tag: '#C', name: 'Caio', attacks: [] };

test('mês em Brasília: 23:30 de 30/11 em Brasília já é dezembro em UTC', () => {
  assert.equal(brasiliaMonth(Date.parse('2026-12-01T02:30:00Z')), '2026-11');
  assert.equal(brasiliaMonth(Date.parse('2026-12-01T03:30:00Z')), '2026-12');
});

test('pódio do mês soma guerras do mês com o mesmo critério e ignora outros meses', () => {
  const wars = [
    war('20261110T120000.000Z', [ana, beto, caio]),
    war('20261118T120000.000Z', [ana, beto, caio]),
    war('20261020T120000.000Z', [{ ...ana, attacks: [{ stars: 0, defenderTag: '#O0' }] }]),
  ];
  const result = monthlyPodium(wars, now);
  assert.equal(result.month, '2026-11');
  assert.equal(result.wars, 2);
  assert.equal(result.players[0].name, 'Ana');
  assert.equal(result.players[0].stars, 12);
  assert.equal(result.players[1].name, 'Beto');
});

test('quem usou menos de 50% dos ataques do mês não entra no pódio', () => {
  const result = monthlyPodium([war('20261110T120000.000Z', [ana, beto, caio])], now);
  assert.equal(result.considered, 3);
  assert.ok(!result.players.some(p => p.name === 'Caio'));
  assert.equal(result.eligible, 2);
});

test('avisa quando o limite de guerras guardadas pode ter cortado o mês', () => {
  const many = Array.from({ length: 20 }, (_, i) => war(`202611${String(i + 1).padStart(2, '0')}T120000.000Z`, [ana]));
  assert.equal(monthlyPodium(many, now).truncated, true);
  assert.equal(monthlyPodium(many.slice(5), now).truncated, false);
});

test('sem guerras do mês retorna pódio vazio', () => {
  const result = monthlyPodium([war('20261020T120000.000Z', [ana])], now);
  assert.equal(result.players.length, 0);
  assert.equal(result.wars, 0);
});
