import { findClan } from '../public/clans.js';
import { isPlayerTag } from './family.js';

export class ContactInputError extends Error {}
function validClan(tag){if(!findClan(tag))throw new ContactInputError('Clã desconhecido.');return tag;}
function validPlayer(tag){if(!isPlayerTag(tag))throw new ContactInputError('Tag do jogador inválida.');return tag;}
export function normalizePhone(value) {
  if(typeof value!=='string' || !/^\+?[0-9 ()-]+$/.test(value.trim()))throw new ContactInputError('Informe o telefone com código do país.');
  const phone=value.replace(/\D/g,'');
  if(!/^[1-9][0-9]{7,14}$/.test(phone))throw new ContactInputError('Telefone inválido. Use o código do país e até 15 dígitos.');
  return phone;
}
export async function listContacts(env,clanTag) {
  validClan(clanTag);
  const rows=await env.DB.prepare('SELECT player_tag AS playerTag,phone,updated_at AS updatedAt FROM player_contacts WHERE clan_tag=? ORDER BY player_tag').bind(clanTag).all();
  return {clanTag,contacts:rows.results};
}
export async function saveContact(env,input,now=Date.now()) {
  const clanTag=validClan(input?.clanTag);const playerTag=validPlayer(input?.playerTag);
  if(input?.phone===null) {
    await env.DB.prepare('DELETE FROM player_contacts WHERE clan_tag=? AND player_tag=?').bind(clanTag,playerTag).run();
    return {clanTag,playerTag,removed:true};
  }
  const phone=normalizePhone(input.phone);
  const existing=await env.DB.prepare('SELECT 1 AS found FROM player_contacts WHERE clan_tag=? AND player_tag=?').bind(clanTag,playerTag).first();
  if(!existing){const count=await env.DB.prepare('SELECT COUNT(*) AS count FROM player_contacts WHERE clan_tag=?').bind(clanTag).first();if(count.count>=100)throw new ContactInputError('Limite de 100 contatos por clã atingido.');}
  await env.DB.prepare('INSERT INTO player_contacts(clan_tag,player_tag,phone,updated_at) VALUES (?,?,?,?) ON CONFLICT(clan_tag,player_tag) DO UPDATE SET phone=excluded.phone,updated_at=excluded.updated_at').bind(clanTag,playerTag,phone,now).run();
  return {clanTag,playerTag,updatedAt:now};
}
