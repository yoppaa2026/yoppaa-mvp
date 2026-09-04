// COMBIEN DE TEMPS À L'AVANCE FAUT-IL COMMANDER ÇA ?
//
// Une tarte se prépare en 48 h, un sandwich en une heure, une baguette est déjà
// sur l'étagère. Jusqu'ici Yoppaa ne savait dire qu'une seule chose pour tout
// le monde : la clôture du créneau, réglée une fois pour l'ensemble du panier.
// Un boulanger qui vend les trois n'avait donc le choix qu'entre refuser les
// sandwichs de midi et promettre des tartes impossibles.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ HORIZON ET DÉLAI SONT DEUX BORNES OPPOSÉES, ET UN SEUL MOT LES DÉSIGNAIT.
//
//   • L'HORIZON est un PLAFOND : jusqu'où en avant peut-on réserver.
//     « Je prends les commandes pour aujourd'hui et demain, pas au-delà. »
//   • LE DÉLAI est un PLANCHER : combien de temps me faut-il, au minimum.
//     « Ma tarte, il me faut 48 h. »
//
// Les confondre donne un commerce qui refuse tout : un horizon de deux jours
// et un délai de 48 h ne laissent qu'un instant commandable, et souvent aucun.
// C'est la raison pour laquelle le premier brief était infaisable.
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CE MODULE NE PROTÈGE RIEN, IL EXPLIQUE.
//
// Tout ce qui est écrit ici sert à ce que le Yopper comprenne avant de payer.
// Le refus réel appartient au serveur, dans `create-commande` : un onglet resté
// ouvert, un panier restauré au retour de Stripe ou une requête fabriquée ne
// passent jamais par ces lignes. Une garde d'écran n'est jamais une réponse.
//
// ⚠️ ET DEUX CALCULS, PAS UN. L'alimentaire retire sur des CRÉNEAUX ; le détail
// et la vitrine n'en ont aucun et retirent sur un JOUR. Une seule fonction pour
// les deux aurait rendu `null` en boutique et fait disparaître la mention.

import { creneauCommandable, jourSemaineDe } from './creneaux.js'
import { prochainJourOuvert, ouvertLe, limiteRetraitCeJour } from './ouverture.js'
import { jourPlus } from './statut-commerce.js'
import { jourCivil, minutesLocales, libelleHeure } from './heure-belge.js'
import { porteUneFenetre, minutesAvantFermeture } from './anti-gaspi.js'

// Au-delà, un commerce fermé deux semaines est en congés : lui annoncer une
// date dans trois semaines n'aiderait personne. Même valeur que
// `prochainJourOuvert`, et pour la même raison.
const HORIZON_RECHERCHE = 14

// ─── CE QU'UNE LIGNE DE PANIER DOIT PORTER ──────────────────────────────────
//
// { nom, delai_minutes, quantite, offre? }
//
// `offre` n'est présent que sur un invendu de fin de journée, et il porte sa
// fenêtre : { heure_debut, heure_fin }. C'est LA PRÉSENCE DE LA FENÊTRE qui
// fait l'offre, exactement comme en base : aucun drapeau à côté, qui pourrait
// dire le contraire des heures.
//
// 🔴 LE LOT ET LE DUO SONT UN PIÈGE À NE PAS OUBLIER AU CÂBLAGE.
// `ajouterDealAuPanier` construit sa ligne À LA MAIN, champ par champ, au lieu
// d'étaler l'article. Un lot « 3 tartes + 1 » perdrait donc les 48 h de la
// tarte et se vendrait pour le jour même. La ligne d'un deal doit recopier
// `delai_minutes` depuis son article ; ce module ne peut pas le deviner, il ne
// voit que ce qu'on lui donne.

/**
 * Le délai propre à une ligne, en minutes. Toute absence vaut zéro.
 *
 * ⚠️ L'OFFRE DE FIN DE JOURNÉE ANNULE LE DÉLAI DE SON ARTICLE, et c'est le
 * cas qu'Alex a construit en avocat du diable. Un boulanger met 48 h sur ses
 * tartes parce qu'il les PRODUIT à la demande. Celle qui reste à 17 h est déjà
 * faite : elle est sur le comptoir, personne n'a rien à préparer. Lui
 * appliquer les 48 h rendrait l'anti-gaspi inutilisable exactement là où il
 * sert le plus.
 *
 * ⚠️ ZÉRO ET L'ABSENCE SE RESSEMBLENT ICI, mais pas ailleurs : `Number(null)`
 * vaut 0, et zéro est justement la bonne réponse pour un article sans délai.
 * On garde quand même NaN et les négatifs, qu'un import maladroit produirait.
 */
export function delaiDeLaLigne(ligne) {
  if (!ligne) return 0
  if (porteUneFenetre(ligne.offre)) return 0
  const brut = Number(ligne.delai_minutes)
  if (!Number.isFinite(brut) || brut <= 0) return 0
  return Math.round(brut)
}

/**
 * Le délai du panier entier, et l'article qui l'impose.
 *
 * ⚠️ LE PLUS CONTRAIGNANT GAGNE. Un panier part en une seule fois, à un seul
 * créneau : la tarte de 48 h emmène la baguette avec elle. Le contraire
 * (découper la commande) a été écarté, il fabriquerait deux retraits pour un
 * paiement et deux numéros pour un client.
 *
 * ⚠️ ET ON NOMME LE COUPABLE. « Cette commande demande 48 h » laisse le Yopper
 * chercher lequel de ses six articles bloque tout ; il ne cherchera pas, il
 * partira. La ligne du sélecteur de créneau dit « la tarte aux pommes ».
 *
 * @returns { minutes, nom } — `nom` est `null` quand rien ne retarde.
 */
export function delaiDuPanier(lignes) {
  const liste = Array.isArray(lignes) ? lignes : Object.values(lignes || {})
  let minutes = 0
  let nom = null
  for (const ligne of liste) {
    const d = delaiDeLaLigne(ligne)
    if (d > minutes) {
      minutes = d
      nom = ligne?.nom || null
    }
  }
  return { minutes, nom }
}

// ─── L'INVENDU NE SE REPORTE PAS ────────────────────────────────────────────
//
// L'offre de fin de journée annule le délai de SON article, elle ne l'annule
// pas pour les autres, et elle ne se reporte pas à demain : sa fenêtre ferme
// ce soir. Un panier qui contient un invendu et une tarte à 48 h n'a donc
// aucun moment de retrait possible.
//
// 🔴 ON REFUSE AVANT LE PAIEMENT, PAS APRÈS. Laisser passer donnerait un
// commerçant avec une commande qu'il ne peut pas honorer et un Yopper débité :
// c'est de l'argent, et un remboursement Stripe pour une règle qu'on connaît
// d'avance est un défaut, pas un imprévu.

/**
 * Pourquoi ce panier ne peut pas partir ensemble. `null` s'il le peut.
 *
 * ⚠️ LE MESSAGE NOMME LES DEUX ARTICLES ET LE GESTE QUI RÉPARE. « Panier
 * incompatible » n'aide personne : le Yopper ne saurait ni quoi retirer, ni
 * pourquoi.
 */
export function refusDeMelange(lignes, { maintenant = new Date() } = {}) {
  const liste = Array.isArray(lignes) ? lignes : Object.values(lignes || {})
  const invendus = liste.filter(l => porteUneFenetre(l?.offre))
  if (invendus.length === 0) return null

  // `delaiDeLaLigne` rend déjà zéro pour un invendu : ce délai est donc bien
  // celui des AUTRES articles, ceux qu'il faut encore préparer.
  const { minutes, nom } = delaiDuPanier(liste)

  for (const inv of invendus) {
    const reste = minutesAvantFermeture(inv.offre, maintenant)
    // ⚠️ UNE FENÊTRE FERMÉE ARRIVE POUR DE BON. Le panier est restauré au
    // retour de Stripe et depuis le cache du navigateur : un invendu ajouté à
    // 17 h 50 peut revenir à l'écran à 18 h 10, quand plus rien ne le vend.
    if (reste === null) {
      return `« ${inv.nom || 'Cette offre'} » est une offre de fin de journée, et sa fenêtre est fermée. Retire-la du panier pour continuer.`
    }
    if (minutes > reste) {
      return `« ${inv.nom || 'L\'offre de fin de journée'} » se retire avant ${libelleHeure(inv.offre?.heure_fin)}, mais « ${nom} » demande ${libelleDuree(minutes)} de préparation. Les deux ne peuvent pas partir dans la même commande.`
    }
  }
  return null
}

/** Le premier instant où la préparation sera finie. */
export function pretA(minutes, maintenant = new Date()) {
  const base = maintenant instanceof Date ? maintenant : new Date(maintenant)
  if (Number.isNaN(base.getTime())) return null
  const m = Number(minutes)
  return new Date(base.getTime() + (Number.isFinite(m) && m > 0 ? m : 0) * 60000)
}

// ─── LE PREMIER RETRAIT POSSIBLE, CÔTÉ ALIMENTAIRE ──────────────────────────

/**
 * Le premier créneau qui accepte réellement cette commande.
 *
 * ⚠️ DEUX CONDITIONS, ET ON LES A LONGTEMPS CONFONDUES.
 *   • LE DÉLAI DE L'ARTICLE : le créneau doit commencer APRÈS la fin de la
 *     préparation. C'est le plancher.
 *   • LA CLÔTURE DU CRÉNEAU : « commande jusqu'à 2 h avant », réglée par le
 *     commerçant sur la ligne de créneau. C'est une borne indépendante, et
 *     `creneauCommandable` est la SEULE fonction qui la lit — celle-là même
 *     qu'utilise le serveur. Deux calculs auraient divergé.
 *
 * `instantDebut(dateStr, heure)` est injecté : ce module ne sait pas fabriquer
 * un instant belge, et la fiche a déjà cette fonction.
 *
 * `utilisable(creneau, jour)` est facultatif : c'est par lui que l'appelant
 * écarte les créneaux pleins ou fermés, qu'il est le seul à connaître.
 *
 * @param jours [{ jour: 'YYYY-MM-DD', creneaux: [...] }]
 * @returns { jour, creneau, debut } | null
 */
export function premierCreneauPossible({
  minutes = 0,
  maintenant = new Date(),
  jours = [],
  instantDebut,
  utilisable,
} = {}) {
  if (typeof instantDebut !== 'function') return null
  const pret = pretA(minutes, maintenant)
  if (!pret) return null

  // ⚠️ ON TRIE, ON NE FAIT PAS CONFIANCE À L'ORDRE REÇU. « Le premier » n'a de
  // sens que sur une liste ordonnée, et rendre le troisième jour parce qu'il
  // était en tête du tableau ferait mentir toute la phrase affichée.
  const parJour = [...(Array.isArray(jours) ? jours : [])]
    .filter(j => /^\d{4}-\d{2}-\d{2}$/.test(String(j?.jour || '')))
    .sort((a, b) => String(a.jour).localeCompare(String(b.jour)))

  for (const j of parJour) {
    const liste = [...(j.creneaux || [])]
      .sort((a, b) => String(a?.heure_debut || '').localeCompare(String(b?.heure_debut || '')))
    for (const cr of liste) {
      const debut = instantDebut(j.jour, cr?.heure_debut)
      if (!debut || Number.isNaN(debut.getTime())) continue
      if (debut.getTime() < pret.getTime()) continue
      if (!creneauCommandable(cr, { dateStr: j.jour, maintenant, instantDebut }).ok) continue
      if (typeof utilisable === 'function' && !utilisable(cr, j.jour)) continue
      return { jour: j.jour, creneau: cr, debut }
    }
  }
  return null
}

// ─── LE PREMIER RETRAIT POSSIBLE, CÔTÉ BOUTIQUE ─────────────────────────────

/**
 * Le premier JOUR où la boutique peut remettre la commande.
 *
 * Une boutique de détail n'a pas de créneau : le Yopper indique un jour
 * souhaité, le commerçant confirme. Le délai de l'article décale donc le
 * premier jour proposable, rien de plus.
 *
 * ⚠️ LE JOUR OÙ TOMBE LA PRÉPARATION PEUT ÊTRE TROP TARD. Une tarte prête
 * mardi à 19 h dans une boutique qui ferme à 18 h ne se retire pas mardi.
 * `limiteRetraitCeJour` porte déjà cette règle, avec la marge de préparation
 * de la boutique ; on la relit ici plutôt que d'en écrire une seconde version.
 *
 * ⚠️ ET SEULEMENT POUR LE JOUR D'ARRIVÉE. Les jours suivants commencent à
 * minuit, bien après la fin de la préparation : leur opposer l'heure de
 * fermeture reviendrait à refuser un retrait le matin pour une commande prête
 * la veille.
 *
 * @returns 'YYYY-MM-DD' | null
 */
export function premierJourBoutique({
  minutes = 0,
  maintenant = new Date(),
  horairesDetail,
  fermetures,
  delaiHeures = 0,
  horizon = HORIZON_RECHERCHE,
} = {}) {
  const pret = pretA(minutes, maintenant)
  if (!pret) return null
  const jour = jourCivil(pret)
  if (!jour) return null

  if (ouvertLe({ horairesDetail, fermetures, dateStr: jour })) {
    const limite = limiteRetraitCeJour(horairesDetail, jourSemaineDe(jour), delaiHeures)
    const arrivee = minutesLocales(pret)
    // Une limite inconnue signifie « horaires non renseignés ». On ne bloque
    // pas la vente d'un commerçant qui n'a pas fini sa fiche : même politique
    // que `joursRetraitBoutique`.
    if (limite === null || arrivee === null || arrivee <= limite) return jour
  }

  const lendemain = jourPlus(jour, 1)
  if (!lendemain) return null
  return prochainJourOuvert({ horairesDetail, fermetures, depuis: lendemain, horizon })
}

// ─── CE QUE L'ÉCRAN ÉCRIT ───────────────────────────────────────────────────
//
// ⚠️ UNE DURÉE NE PÉRIME JAMAIS, UNE HEURE SI. « Commande 1 h à l'avance »
// reste vrai à 9 h comme à 17 h : la carte produit peut donc la porter, y
// compris dans un onglet ouvert depuis ce matin ou dans un cache. « À partir
// de 11 h » devient faux à 11 h 01, et c'est précisément le genre de phrase
// qu'un Yopper croit sur parole.
//
// La conséquence, c'est le partage : LA CARTE PORTE LA DURÉE, le sélecteur de
// créneau porte le moment. Le sélecteur, lui, se redessine à chaque choix.

/** « 30 min », « 1 h », « 1 h 30 », « 2 jours ». `null` s'il n'y a pas de délai. */
export function libelleDuree(minutes) {
  const m = Number(minutes)
  if (!Number.isFinite(m) || m <= 0) return null
  if (m < 60) return `${Math.round(m)} min`
  if (m % 1440 === 0) {
    const j = m / 1440
    return `${j} jour${j > 1 ? 's' : ''}`
  }
  const h = Math.floor(m / 60)
  const min = Math.round(m % 60)
  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, '0')}`
}

/**
 * La mention de la carte produit. `null` quand il n'y a rien à dire.
 *
 * ⚠️ RIEN SUR UN ARTICLE SANS DÉLAI. « Commande 0 min à l'avance » sur chaque
 * baguette transformerait l'information en décor, et plus personne ne la
 * verrait là où elle compte.
 */
export function mentionArticle(minutes) {
  const duree = libelleDuree(minutes)
  return duree ? `Commande ${duree} à l'avance` : null
}

/**
 * « à 17 h », « demain à 10 h », « jeudi à 10 h ».
 *
 * ⚠️ « AUJOURD'HUI À 17 H » A ÉTÉ ÉCARTÉ : personne ne parle comme ça. Quand
 * c'est aujourd'hui, l'heure suffit et se lit plus vite.
 */
export function libelleMoment({ jour, heure, aujourdhui } = {}) {
  const h = libelleHeure(heure)
  if (!jour) return h ? `à ${h}` : ''
  const suffixe = h ? ` à ${h}` : ''
  if (aujourdhui && jour === aujourdhui) return h ? `à ${h}` : ''
  if (aujourdhui && jour === jourPlus(aujourdhui, 1)) return `demain${suffixe}`
  const nom = jourSemaineDe(jour)
  return nom ? `${nom}${suffixe}` : suffixe.trim()
}

/**
 * La ligne du sélecteur de créneau.
 *
 * ⚠️ ELLE NOMME L'ARTICLE, LA DURÉE ET LE MOMENT. Alex : personne ne cherche
 * une information. Un avertissement qui dit seulement « certains articles
 * demandent du temps » oblige le Yopper à rouvrir sa fiche article par
 * article ; il fermera l'onglet avant.
 *
 * ⚠️ ET ELLE DIT L'ÉTAT, PAS NOTRE GESTE. On n'écrit pas « nous avons masqué
 * les créneaux » : le Yopper se moque de ce que fait le programme, il veut
 * savoir quand il peut venir.
 */
export function avertissementDelai({ minutes, nom, moment } = {}) {
  const duree = libelleDuree(minutes)
  if (!duree) return null
  const quoi = nom ? `${nom} demande ${duree} de préparation` : `Cette commande demande ${duree} de préparation`
  if (!moment) return `${quoi}, et aucun créneau ne le permet dans les jours proposés.`
  return `${quoi}. Premier retrait possible ${moment}.`
}
