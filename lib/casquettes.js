// UNE CONNEXION, PLUSIEURS CASQUETTES (29/09, proposition A validée par Alex).
//
// Chez Supabase, une adresse email = UN compte de connexion. Une même personne
// peut pourtant être Yopper, patron d'un commerce, membre d'une équipe, ou
// l'admin. Chaque casquette a SES données.
//
// 🔴 CE QUI SE PASSAIT AVANT (diagnostic du 29/09) :
//   • « Supprimer mon compte » côté Yopper effaçait les données Yopper, PUIS
//     tentait d'effacer la connexion. Pour un patron, la base refuse
//     (`commercants.auth_user_id` : no action) : suppression À MOITIÉ faite,
//     message d'erreur. Deux comptes y étaient exposés ce jour-là, et l'admin
//     aussi (`kyb_valide_par` : no action).
//   • Supprimer un commerce depuis l'admin effaçait la connexion de son
//     patron, même s'il était aussi Yopper : son profil restait en base,
//     orphelin (`clients.auth_user_id` : set null), et il perdait son accès
//     sans le savoir.
//
// ✅ LA RÈGLE : supprimer une casquette n'efface que SES données. La connexion
// n'est effacée que quand il ne reste AUCUNE autre casquette. Et le compte de
// l'admin ne l'est jamais.
//
// ⚠️ FONCTION PURE : `lib/casquettes-server.js` lit la base, ceci décide.

import { estAdresseAdmin } from './admin-identite.js'

// Les mots de chaque casquette, selon à qui l'on parle : « ton » au Yopper qui
// supprime son profil, « son » à l'admin qui supprime un commerce.
export const CASQUETTES = {
  yopper: { toi: 'ton profil Yopper', admin: 'son profil Yopper' },
  commerce: { toi: 'ton commerce', admin: 'un autre de ses commerces' },
  equipe: { toi: 'ton accès à l’équipe d’un commerce', admin: 'son accès à l’équipe d’un commerce' },
  admin: { toi: 'l’administration de Yoppaa', admin: 'l’administration de Yoppaa' },
}

/**
 * Les casquettes d'une connexion, lues depuis ce qui lui est rattaché.
 *
 * @param {object} o
 * @param {object} o.user                 { id, email }
 * @param {object[]} [o.commerces]        commerces dont il est le patron
 * @param {object[]} [o.profilsYopper]    lignes `clients` rattachées
 * @param {object[]} [o.equipes]          lignes `equipe_membres` actives
 */
export function casquettesDe({ user, commerces = [], profilsYopper = [], equipes = [] }) {
  const liste = []
  if ((profilsYopper || []).length) liste.push('yopper')
  if ((commerces || []).length) liste.push('commerce')
  if ((equipes || []).length) liste.push('equipe')
  if (estAdresseAdmin(user?.email)) liste.push('admin')
  return liste
}

/**
 * Ce qui reste quand on retire une casquette.
 *
 * @param {string[]} casquettes  la liste de `casquettesDe`
 * @param {string} quiPart       la casquette qu'on supprime
 */
export function casquettesRestantes(casquettes = [], quiPart) {
  return (casquettes || []).filter(c => c !== quiPart)
}

/**
 * La connexion peut-elle être effacée ?
 *
 * 🔴 JAMAIS CELLE DE L'ADMIN, même si c'est l'admin lui-même qui supprime
 * son profil Yopper : sans elle, l'administration n'a plus de porte.
 */
export function connexionEffacable(casquettes = [], quiPart) {
  if ((casquettes || []).includes('admin')) return false
  return casquettesRestantes(casquettes, quiPart).length === 0
}

/** La phrase qui dit pourquoi la connexion reste, ou `null`. */
/**
 * @param {'toi'|'admin'} [pour]  à qui l'on parle
 */
export function raisonDeGarder(casquettes = [], quiPart, pour = 'toi') {
  const restantes = casquettesRestantes(casquettes, quiPart)
  if (!restantes.length) return null
  const noms = restantes.map(c => CASQUETTES[c]?.[pour] || c)
  // « à X, à Y et à Z » : en français, le « à » se répète.
  const avecA = noms.map(n => `à ${n}`)
  const liste = avecA.length > 1 ? `${avecA.slice(0, -1).join(', ')} et ${avecA[avecA.length - 1]}` : avecA[0]
  return pour === 'admin'
    ? `Son compte de connexion est conservé : il sert aussi ${liste}.`
    : `Ton compte de connexion reste actif : il sert aussi ${liste}.`
}

/**
 * Quelles préinscriptions effacer avec un profil Yopper.
 *
 * ⚠️ UN PATRON GARDE SA PRÉINSCRIPTION DE COMMERÇANT : c'est d'elle que vivent
 * sa page de kit et ses parrainages. Quelqu'un qui n'a pas (ou plus) de
 * commerce, lui, voit TOUTES ses préinscriptions effacées : ce sont ses
 * données, et rien ne justifie de les garder.
 *
 * @returns {string[]|null} les types à effacer, ou `null` pour « tous »
 */
export function preinscriptionsAEffacer(casquettes = []) {
  return (casquettes || []).includes('commerce') ? ['yopper'] : null
}
