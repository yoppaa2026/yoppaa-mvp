// REVENIR DANS L'APP APRÈS UN PAIEMENT TERMINÉ DANS LE NAVIGATEUR (02/10).
//
// 🔴 LE DÉFAUT QU'ALEX A VU. Dans l'app des stores, le Yopper paie par
// Bancontact. Stripe Checkout s'ouvre bien DANS l'app, mais la page de la
// banque est sur un autre domaine : Capacitor l'envoie dans Safari (Chrome sur
// Android). Le paiement se termine là-bas, et Stripe ramène le Yopper sur notre
// page de confirmation… dans le navigateur. L'app, elle, reste figée sur la
// page Stripe. Le Yopper a payé, et l'app ne le sait pas.
//
// ⚠️ ON NE RETIRE PAS BANCONTACT (décision d'Alex du 02/10). On répare le
// RETOUR : quand le paiement est parti DE L'APP, Stripe ramène sur
// `/retour-app/…` au lieu de la page directe.
//   • dans l'app (carte, tout reste dans la WebView) : le serveur renvoie
//     aussitôt vers la page habituelle, rien ne change pour le Yopper ;
//   • dans le navigateur (Bancontact) : une page dit « Revenir dans Yoppaa »,
//     et ce bouton ouvre l'app SUR la confirmation (`yoppaa://`).
//
// ⚠️ « PARTI DE L'APP » SE LIT DANS LE USER-AGENT. La nouvelle app ajoute la
// marque `YoppaaApp` à celui de sa WebView (`appendUserAgent`,
// capacitor.config.ts), et la WebView l'envoie avec chaque requête, `fetch`
// compris. L'ancienne app ne l'a pas : pour elle, rien ne change, et c'est
// voulu, puisqu'elle ne sait pas ouvrir `yoppaa://`.
//
// Fichier PUR : il s'exécute au banc, sans serveur et sans navigateur.

import { cheminInterne } from './chemin-interne.js'

export const MARQUE_APP = 'YoppaaApp'
export const PREFIXE_RETOUR = '/retour-app'
// 🔴 L'HÔTE DU LIEN EST FIGÉ, ET L'APP LE VÉRIFIE. Le code natif n'ouvre que
// `yoppaa://www.yoppaa.app/…` : n'importe quelle page web peut déclencher un
// lien `yoppaa://`, il ne doit mener que chez nous.
export const SCHEMA_APP = 'yoppaa://www.yoppaa.app'

// La requête vient-elle de la nouvelle app ?
export function estUaApp(ua) {
  return typeof ua === 'string' && /(^|\s)YoppaaApp(\/|\s|$)/.test(ua)
}

// L'adresse de retour à donner à Stripe.
//
// ⚠️ `{CHECKOUT_SESSION_ID}` DOIT RESTER ÉCRIT TEL QUEL : Stripe le remplace
// dans la chaîne. On ne code donc RIEN, on préfixe le chemin.
export function urlDeRetour(base, chemin, depuisApp) {
  return depuisApp ? `${base}${PREFIXE_RETOUR}${chemin}` : `${base}${chemin}`
}

// La page d'origine, reconstruite depuis `/retour-app/<segments>?<recherche>`,
// ou `null` si elle n'est pas un chemin de Yoppaa.
//
// `segments` : le tableau du segment attrapant de Next (`[...chemin]`).
// `recherche` : l'objet `searchParams` de Next (valeurs texte ou tableaux).
export function cheminDepuisRetour(segments, recherche = {}) {
  if (!Array.isArray(segments) || segments.length === 0) return null
  // ⚠️ DÉCODÉ PUIS RECODÉ : selon le chemin parcouru, un segment peut arriver
  // déjà décodé ou encore codé. Le recoder deux fois changerait « %27 » en
  // « %2527 », et la fiche ne se trouverait plus.
  const net = segments.map((s) => {
    if (typeof s !== 'string') return null
    try { return decodeURIComponent(s) } catch { return null }
  })
  if (net.some((s) => s === null || s === '' || s === '.' || s === '..' || s.includes('/'))) return null
  const chemin = '/' + net.map((s) => encodeURIComponent(s)).join('/')
  const params = new URLSearchParams()
  for (const [cle, valeur] of Object.entries(recherche || {})) {
    for (const v of [].concat(valeur)) if (typeof v === 'string') params.append(cle, v)
  }
  const texte = params.toString()
  // ⚠️ LA MÊME PORTE QUE `?next=` : un chemin interne, et rien d'autre.
  return cheminInterne(texte ? `${chemin}?${texte}` : chemin, null)
}

// Le lien qui rouvre l'app sur ce chemin.
export function lienVersApp(chemin) {
  const sur = cheminInterne(chemin, null)
  return sur ? `${SCHEMA_APP}${sur}` : null
}

// Ce que dit la page : 'ok', 'annule', ou `null` quand on ne sait pas.
// Les cinq tunnels écrivent leur résultat sous des noms différents.
export function etatRetour(recherche = {}) {
  const valeurs = ['paiement', 'abonnement', 'bon', 'empreinte', 'etat']
    .map((cle) => [].concat(recherche?.[cle] ?? [])[0])
  if (valeurs.includes('ok')) return 'ok'
  if (valeurs.includes('annule')) return 'annule'
  return null
}
