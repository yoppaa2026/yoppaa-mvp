'use client'
// L'IDENTITÉ DU YOPPER DANS SON NAVIGATEUR — écrite en entier, ou pas du tout.
//
// 🔴 LE DÉFAUT QUE CE FICHIER RÈGLE : DEUX PERSONNES MÉLANGÉES À L'ÉCRAN.
//
// Trois endroits écrivaient cette identité, et **aucun ne l'écrivait en
// entier**. Ils posaient l'adresse et l'identifiant sans condition, puis :
//
//     if (client.nom)       localStorage.setItem('yoppaa_nom', client.nom)
//     if (client.telephone) localStorage.setItem('yoppaa_telephone', ...)
//
// Une valeur vide chez le NOUVEAU compte laissait donc en place celle de
// l'ANCIEN. Et `app/commander/auth` allait plus loin, avec un repli explicite :
// `prenomDB || prenomLocal`. Le commentaire disait « sinon ce qui est en
// localStorage » ; au changement de compte, « ce qui est en localStorage »,
// c'est le prénom de quelqu'un d'autre.
//
// Résultat vu par Alex le 03/09 : la bonne adresse, le bon compte, le bon mot
// de passe, mais **le nom, le prénom et le téléphone d'un autre**.
//
// ⚠️ LA RÈGLE : ON ÉCRIT LES CINQ CHAMPS, TOUJOURS, Y COMPRIS EN EFFAÇANT.
// Un champ vide chez le nouveau est une INFORMATION, pas une absence
// d'information : il veut dire « cette personne n'a pas de téléphone chez
// nous », et sûrement pas « garde celui d'avant ».
//
// ⚠️ ET LA SESSION EST LA VÉRITÉ, LE NAVIGATEUR N'EST QU'UN CACHE. Voir
// `hydrateYopper` dans app/commander/page.js : si la session Supabase et ce
// cache ne désignent pas la même personne, c'est le cache qui a tort.

// Les clés de l'identité. ⚠️ Une clé ajoutée ici est effacée partout : c'est le
// but. Le contraire, une clé oubliée dans un seul des effacements, est
// exactement ce qui fabrique un mélange.
export const CLES_IDENTITE = [
  'yoppaa_client_id',
  'yoppaa_email',
  'yoppaa_prenom',
  'yoppaa_nom',
  'yoppaa_telephone',
]

function ecrire(cle, valeur) {
  const v = String(valeur ?? '').trim()
  // ⚠️ EFFACER FAIT PARTIE D'ÉCRIRE. C'est toute la correction.
  if (v === '') localStorage.removeItem(cle)
  else localStorage.setItem(cle, v)
}

/**
 * Pose l'identité complète du Yopper. Les champs absents sont EFFACÉS.
 * Sans `client_id` ni `email`, on n'a personne : on efface tout.
 */
export function poserIdentiteLocale(identite = {}) {
  if (typeof window === 'undefined') return
  try {
    const { client_id, email, prenom, nom, telephone } = identite
    if (!client_id || !email) { effacerIdentiteLocale(); return }
    ecrire('yoppaa_client_id', client_id)
    ecrire('yoppaa_email', String(email).toLowerCase())
    ecrire('yoppaa_prenom', prenom)
    ecrire('yoppaa_nom', nom)
    ecrire('yoppaa_telephone', telephone)
  } catch { /* navigation privée ou quota : l'écran fonctionne sans cache */ }
}

export function lireIdentiteLocale() {
  if (typeof window === 'undefined') return { client_id: null, email: null, prenom: '', nom: '', telephone: '' }
  try {
    return {
      client_id: localStorage.getItem('yoppaa_client_id'),
      email: localStorage.getItem('yoppaa_email'),
      prenom: localStorage.getItem('yoppaa_prenom') || '',
      nom: localStorage.getItem('yoppaa_nom') || '',
      telephone: localStorage.getItem('yoppaa_telephone') || '',
    }
  } catch {
    return { client_id: null, email: null, prenom: '', nom: '', telephone: '' }
  }
}

export function effacerIdentiteLocale() {
  if (typeof window === 'undefined') return
  try { CLES_IDENTITE.forEach(k => localStorage.removeItem(k)) } catch { /* idem */ }
}

/**
 * Ce cache désigne-t-il bien la personne connectée ?
 *
 * ⚠️ UN CACHE VIDE N'EST PAS UN CACHE FAUX : il n'y a rien à jeter, il y a
 * quelque chose à charger. Et sans session, il n'y a rien à comparer : un
 * invité a le droit d'avoir ses coordonnées en mémoire.
 */
export function cacheEtranger(emailSession, emailCache) {
  const s = String(emailSession || '').trim().toLowerCase()
  const c = String(emailCache || '').trim().toLowerCase()
  if (!s || !c) return false
  return s !== c
}
