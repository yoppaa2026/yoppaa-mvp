// LA PLAGE DE RETRAIT D'UN ARTICLE (19/10).
//
// Demande de la boulangerie Aux Délices des 7 Abbayes : ses sandwichs ne se
// retirent que jusqu'à 15 h, son pain jusqu'à la fin des créneaux (17 h 30).
// Les créneaux restent ceux du commerce ; un article peut dire « retrait de …
// à … », les deux bornes facultatives (`articles.retrait_des`,
// `articles.retrait_jusqua`, MIGRATION_PLAGE_RETRAIT_ARTICLE_19_10.sql).
//
// ✅ DÉCISIONS D'ALEX (tableau, 19/10) :
//   • le RETRAIT est borné, pas le moment où l'on commande ;
//   • le réglage vit sur l'ARTICLE, applicable à une catégorie d'un coup ;
//   • panier mixte : on ne propose que les créneaux COMMUNS ; s'il n'y en a
//     aucun, le second article est refusé à l'ajout, et le message nomme les
//     deux (même règle que les délais, décision du 10/09).
//
// ⚠️ L'APP EST EN SERVICE (Alex, 19/10 : « pas de raté possible »). Une plage
// VIDE ne change rien : chaque fonction rend exactement l'ancien comportement
// quand aucune borne n'est réglée. C'est la propriété que le banc vérifie en
// premier.
//
// ⚠️ UN CRÉNEAU DOIT TENIR ENTIER DANS LA PLAGE. Avec « jusqu'à 15 h », le
// créneau de 14 h 30 à 15 h passe, celui de 14 h 45 à 15 h 15 non : le client
// pourrait arriver à 15 h 10, quand il n'y a plus de sandwich.
//
// ⚠️ L'OFFRE DE FIN DE JOURNÉE GARDE SA FENÊTRE. Comme pour le délai (règle du
// 04/09) : l'invendu est déjà fait, sa propre fenêtre dit quand il se retire.
//
// 🔴 CE MODULE EXPLIQUE ET FILTRE ; LE SERVEUR REFUSE. `create-commande` refait
// le calcul sur les articles lus en base, jamais sur ce qu'envoie le navigateur.
//
// Fichier PUR : aucune dépendance au navigateur ni à la base.

import { minutesDeLHeure, libelleHeure } from './heure-belge.js'
import { porteUneFenetre } from './anti-gaspi.js'

// « 15:00:00 » → « 15:00 » ; tout le reste → null. Une absence n'est pas minuit.
export function heureDePlage(valeur) {
  const m = minutesDeLHeure(valeur)
  if (m === null) return null
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// La plage d'un article : { de, a }, chacun 'HH:MM' ou null.
export function plageDeLArticle(article) {
  return { de: heureDePlage(article?.retrait_des), a: heureDePlage(article?.retrait_jusqua) }
}

export const plageVide = (p) => !p?.de && !p?.a

// Une plage qui ne laisse aucun moment : « de 15 h à 11 h », ou « de 15 h à 15 h ».
export function plageImpossible(p) {
  if (!p?.de || !p?.a) return false
  return minutesDeLHeure(p.de) >= minutesDeLHeure(p.a)
}

// L'intersection de plusieurs plages, et QUI la borne de chaque côté : le
// message doit nommer l'article coupable, pas « ce panier ».
// `entrees` : [{ plage, nom }]
export function plageCommune(entrees = []) {
  let de = null, a = null, nomDe = null, nomA = null
  for (const e of entrees) {
    const p = e?.plage
    if (!p) continue
    if (p.de && (de === null || minutesDeLHeure(p.de) > minutesDeLHeure(de))) { de = p.de; nomDe = e.nom || null }
    if (p.a && (a === null || minutesDeLHeure(p.a) < minutesDeLHeure(a))) { a = p.a; nomA = e.nom || null }
  }
  return { de, a, nomDe, nomA }
}

// La plage d'une LIGNE de panier ou de commande.
// `article` et `second` : les articles du catalogue (le second pour un duo).
// ⚠️ L'INVENDU N'A PAS DE PLAGE (sa fenêtre fait foi). ⚠️ UN DUO N'A QUE LA
// PLAGE COMMUNE À SES DEUX ARTICLES, comme ses circuits et son délai.
export function plageDeLaLigne(ligne, article = null, second = null) {
  if (porteUneFenetre(ligne?.offre)) return { de: null, a: null }
  const source = article || ligne
  const c = plageCommune([
    { plage: plageDeLArticle(source) },
    ...(second ? [{ plage: plageDeLArticle(second) }] : []),
  ])
  return { de: c.de, a: c.a }
}

// Un créneau tient-il entier dans la plage ?
// ⚠️ UNE PLAGE VIDE ACCEPTE TOUT, même un créneau mal écrit : c'est l'ancien
// comportement, et on ne le change pas pour ceux qui n'ont rien réglé.
export function creneauDansPlage(creneau, plage) {
  if (plageVide(plage)) return true
  const debut = minutesDeLHeure(creneau?.heure_debut)
  let fin = minutesDeLHeure(creneau?.heure_fin)
  if (debut === null || fin === null) return false
  // Un créneau qui passe minuit (friterie de 22 h à 1 h) finit le lendemain.
  if (fin <= debut) fin += 1440
  if (plage.de && debut < minutesDeLHeure(plage.de)) return false
  if (plage.a && fin > minutesDeLHeure(plage.a)) return false
  return true
}

// « Retrait jusqu'à 15 h », « Retrait à partir de 11 h », « Retrait de 11 h à
// 15 h ». Rien pour une plage vide.
export function libellePlage(plage) {
  if (plageVide(plage)) return null
  if (plage.de && plage.a) return `Retrait de ${libelleHeure(plage.de)} à ${libelleHeure(plage.a)}`
  if (plage.a) return `Retrait jusqu’à ${libelleHeure(plage.a)}`
  return `Retrait à partir de ${libelleHeure(plage.de)}`
}

// Pourquoi un article ne peut pas rejoindre ce panier. `null` s'il le peut.
// `panier` : [{ plage, nom }] (lignes existantes) ; `candidat` : { plage, nom }.
// ⚠️ LE MESSAGE NOMME LES DEUX ARTICLES ET LE GESTE QUI RÉPARE (décision du
// 10/09) : « panier incompatible » n'aide personne.
export function refusDePlageALAjout(candidat, panier = []) {
  if (!candidat || plageVide(candidat.plage)) {
    // Un article sans plage va avec toute plage possible ; seul un panier déjà
    // impossible (restauré d'un ancien état) bloquerait, et ce n'est pas lui.
    return null
  }
  const lignes = (Array.isArray(panier) ? panier : []).filter(l => !plageVide(l?.plage))
  if (lignes.length === 0) return null
  const tout = plageCommune([...lignes, candidat])
  if (!plageImpossible(tout)) return null
  // Le coupable : la ligne du panier qui borne de l'AUTRE côté que le candidat.
  const autre = tout.nomDe === candidat.nom ? tout.nomA : tout.nomDe
  return `« ${candidat.nom || 'Cet article'} » (${libellePlage(candidat.plage).toLowerCase()}) et « ${autre || 'un article de ton panier'} » n’ont aucun moment de retrait en commun. Fais deux commandes, ou retire l’un des deux.`
}

// La phrase du choix du créneau quand le panier restreint les heures.
// `entrees` : [{ plage, nom }]. Rien si aucune plage.
export function raisonDeLaPlage(entrees = []) {
  const p = plageCommune(entrees)
  if (plageVide(p)) return null
  const noms = [...new Set(entrees.filter(e => !plageVide(e?.plage)).map(e => e.nom).filter(Boolean))]
  const qui = noms.length === 1 ? `« ${noms[0]} »` : 'Certains articles de ton panier'
  const verbe = noms.length === 1 ? 'se retire' : 'se retirent'
  if (p.de && p.a) return `${qui} ${verbe} de ${libelleHeure(p.de)} à ${libelleHeure(p.a)} : seuls ces créneaux sont proposés.`
  if (p.a) return `${qui} ${verbe} jusqu’à ${libelleHeure(p.a)} : seuls ces créneaux sont proposés.`
  return `${qui} ${verbe} à partir de ${libelleHeure(p.de)} : seuls ces créneaux sont proposés.`
}

// Le refus du SERVEUR : ce créneau convient-il à chaque ligne ? `null` si oui.
// `entrees` : [{ plage, nom }], lues en base.
export function refusDePlageAuCreneau(entrees = [], creneau) {
  for (const e of entrees) {
    if (plageVide(e?.plage)) continue
    if (!creneauDansPlage(creneau, e.plage)) {
      return `« ${e.nom || 'Un article'} » : ${libellePlage(e.plage).toLowerCase()}. Choisis un créneau dans cette plage.`
    }
  }
  return null
}

// La saisie du commerçant : `null` si elle est valable, sinon la phrase.
export function refusDeSaisiePlage(de, a) {
  const p = { de: heureDePlage(de), a: heureDePlage(a) }
  if (de && !p.de) return 'L’heure « à partir de » n’est pas lisible.'
  if (a && !p.a) return 'L’heure « jusqu’à » n’est pas lisible.'
  if (plageImpossible(p)) return 'L’heure « à partir de » doit venir avant l’heure « jusqu’à ».'
  return null
}

// La plage réglée tombe-t-elle sur au moins un créneau du commerce ? Sinon
// l'article ne se commanderait JAMAIS, sans qu'aucun écran ne le dise : on
// prévient le commerçant à l'enregistrement.
export function plageSansCreneau(plage, creneaux = []) {
  if (plageVide(plage)) return false
  const actifs = (Array.isArray(creneaux) ? creneaux : []).filter(c => c?.actif !== false)
  if (actifs.length === 0) return false
  return !actifs.some(c => creneauDansPlage(c, plage))
}
