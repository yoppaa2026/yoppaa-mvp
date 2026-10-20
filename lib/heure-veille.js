// L'HEURE LIMITE DE LA VEILLE (20/10).
//
// Demande de la boulangerie Aux Délices des 7 Abbayes : elle passe sa commande
// chez son fournisseur à 18 h. Une commande « sur commande » pour demain,
// passée après 18 h, ne peut plus être servie.
//
// ✅ DÉCISIONS D'ALEX (tableau, 20/10) :
//   • une HEURE LIMITE LA VEILLE, pas J+2 (J+2 refuserait toutes les
//     commandes pour demain, même passées à 10 h) ;
//   • elle ne touche que le circuit « sur commande, pour un autre jour » (B) :
//     le jour même (A) ne change pas ;
//   • UN réglage pour tout le commerce (`commercants.commande_veille_avant`,
//     MIGRATION_HEURE_LIMITE_VEILLE_20_10.sql), à côté de l'horizon.
//
// La règle : passé l'heure limite, le plancher de B recule d'un jour. Avant
// 18 h, le croissant se commande pour demain ; après 18 h, pour après-demain.
// La tarte à J+2 passe de même à J+3.
//
// ⚠️ L'APP EST EN SERVICE (Alex, 19/10 : « pas de raté possible »). Une heure
// VIDE ne change rien : `limiteDeLaVeille` rend `null`, et les circuits gardent
// exactement leur forme d'avant (`{ aujourdhui, surCommande }`, sans champ en
// plus). Minuit vaut aussi « pas de limite » : c'est la règle d'avant.
//
// ⚠️ À L'HEURE MURALE DE BRUXELLES (`minutesBruxelles`), jamais à celle du
// serveur : Vercel tourne en temps universel, et 18 h y tomberait à 19 h ou
// 20 h.
//
// 🔴 CE MODULE CALCULE ; LE SERVEUR REFUSE. `create-commande` refait le compte
// avec sa propre horloge.
//
// Fichier PUR : aucune dépendance au navigateur ni à la base.

import { minutesDeLHeure, libelleHeure } from './heure-belge.js'
import { minutesBruxelles } from './timezone.js'

// « 18:00:00 » → « 18:00 » ; vide, illisible ou minuit → null (aucune limite).
export function heureLimite(valeur) {
  const m = minutesDeLHeure(valeur)
  if (m === null || m === 0) return null
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * L'heure limite du commerce et où l'on en est : `{ limite, apresLimite }`,
 * ou `null` quand le commerce n'en a pas réglé.
 * `apresLimite` : vrai À PARTIR de l'heure limite (18 h pile est trop tard,
 * comme au comptoir : « avant 18 h »).
 */
export function limiteDeLaVeille(commercant, maintenant = new Date()) {
  const limite = heureLimite(commercant?.commande_veille_avant)
  if (!limite) return null
  const m = minutesBruxelles(maintenant)
  return { limite, apresLimite: m !== null && m >= minutesDeLHeure(limite) }
}

/**
 * Le délai de B dit en clair, avec l'heure limite quand il y en a une.
 *   (1, null)     → « 1 jour à l'avance »           (la phrase d'avant)
 *   (1, '18:00')  → « la veille avant 18 h »
 *   (2, '18:00')  → « 2 jours à l'avance, avant 18 h »
 * ⚠️ L'apostrophe droite des messages d'avant est gardée : sans limite, rien
 * ne change, pas même un caractère.
 */
export function delaiEnClair(jours, limite = null) {
  const n = Math.max(0, Number(jours) || 0)
  const h = heureLimite(limite)
  if (h && n === 1) return `la veille avant ${libelleHeure(h)}`
  const duree = `${n} jour${n > 1 ? 's' : ''} à l'avance`
  return h ? `${duree}, avant ${libelleHeure(h)}` : duree
}

/**
 * La phrase de la fiche, près du choix du jour. `null` sans limite, ou quand
 * aucun article ne se prend sur commande (elle ne concernerait rien).
 * ⚠️ UNE PHRASE PRÈS DU CALENDRIER, PAS SUR CHAQUE BAGUETTE (règle du 04/09 :
 * une mention sur chaque article devient du décor).
 * @param demain  au moins un article sur commande se prend pour demain
 *                (délai d'un jour) : la phrase peut parler de « demain ».
 */
export function phraseLimiteFiche({ limite = null, apresLimite = false, surCommande = false, demain = false } = {}) {
  const h = heureLimite(limite)
  if (!h || !surCommande) return null
  const heure = libelleHeure(h)
  if (apresLimite) {
    return demain
      ? `Il est plus de ${heure} : trop tard pour demain. Les commandes à l’avance se décalent d’un jour.`
      : `Il est plus de ${heure} : les commandes à l’avance se décalent d’un jour.`
  }
  return demain
    ? `Pour demain, commande avant ${heure}.`
    : `Les commandes à l’avance se prennent jusqu’à ${heure}.`
}

// La saisie du commerçant : `null` si elle est valable, sinon la phrase.
export function refusDeSaisieLimite(valeur) {
  if (valeur === null || valeur === undefined || String(valeur).trim() === '') return null
  if (minutesDeLHeure(valeur) === null) return 'L’heure limite n’est pas lisible.'
  return null
}
