// LA COMMANDE ENCODÉE À LA MAIN PAR LE COMMERÇANT (Alex, 10/10, « version express »).
//
// 🔴 POURQUOI. Une pizzeria a quitté son système de commande en ligne parce
// qu'il refusait les commandes du téléphone : deux carnets, et jamais la vraie
// image de la soirée. Alex, le 24/09 : « ils sont quasi tous multicanaux ».
// Sans ces commandes, un créneau « à moitié vide » dans Yoppaa est peut-être
// plein par téléphone, et la cuisine déborde.
//
// CE QUI EST DÉCIDÉ (tableau, 10/10) :
//   - retrait ET livraison ;
//   - créneau plein, stock insuffisant : on PRÉVIENT, puis on laisse encoder
//     d'un second geste (le commerçant connaît son four) ;
//   - le patron, et les membres de l'équipe qui ont la case « Commandes » ;
//   - le nom seul est obligatoire ; téléphone et e-mail facultatifs ;
//   - « payé » (espèces ou terminal) ou « à payer au retrait » ;
//   - l'e-mail au client est une CONFIRMATION, jamais une campagne, et il
//     ne part que si le commerçant le demande.
//
// ⚠️ CE MODULE EST PUR : il ne lit pas la base. La route serveur
// (`/api/equipe/commande/creer`) relit tout, puis lui demande quoi accepter,
// quoi signaler, et quoi écrire.

import { refusDuJour, delaiEnJours, joursIndisponibles, premierJourPossible, jourEnClair } from './delai-commande.js'
import { circuitsDeLArticle, circuitDuJour, etatStock } from './stock-article.js'
import { jourSemaineDe } from './creneaux.js'
import { estFermeExceptionnellement, estOuvertCeJour } from './ouverture.js'
import { jourPlus } from './statut-commerce.js'

export const ORIGINE_EN_LIGNE = 'en_ligne'
export const ORIGINE_COMMERCANT = 'commercant'

// Comment le client a payé, ou va payer. `a_payer` n'écrit aucune colonne
// d'encaissement : la question sera posée à la remise, comme pour toute
// commande sur place.
export const PAIEMENTS_ENCODEE = ['a_payer', 'especes', 'terminal']
export const LIBELLES_PAIEMENT_ENCODEE = {
  a_payer: 'À payer au retrait',
  especes: 'Payé en espèces',
  terminal: 'Payé au terminal',
}

export const MODES_ENCODEE = ['retrait', 'livraison']

const texte = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

/**
 * Le client, tel que le commerçant l'a noté au téléphone.
 * Rend { ok: true, client } ou { ok: false, error }.
 */
export function clientEncode({ nom, telephone, email } = {}) {
  const n = texte(nom, 120)
  if (n.length < 2) return { ok: false, error: 'Indique au moins le nom du client.' }
  const t = texte(telephone, 30)
  if (t && t.replace(/\D/g, '').length < 8) return { ok: false, error: 'Ce numéro de téléphone semble incomplet.' }
  const e = texte(email, 254).toLowerCase()
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Cette adresse e-mail ne semble pas valide.' }
  return { ok: true, client: { client_nom: n, client_telephone: t || null, client_email: e || null } }
}

/**
 * Les colonnes d'encaissement d'une commande encodée.
 * ⚠️ `paye_en_ligne` RESTE FAUX, TOUJOURS : il répond à « doit-il encore
 * payer EN LIGNE », et Stripe n'a rien vu. Le mettre à vrai ferait compter la
 * vente comme un paiement par carte dans la comptabilité, et une annulation
 * chercherait à la rembourser sur une carte qui n'existe pas.
 */
export function champsPaiementEncodee({ paiement, total, maintenant = new Date() } = {}) {
  if (!PAIEMENTS_ENCODEE.includes(paiement)) {
    return { ok: false, error: 'Dis si le client a déjà payé (espèces ou terminal) ou s’il paiera au retrait.' }
  }
  const base = { paye_en_ligne: false }
  if (paiement === 'a_payer') return { ok: true, champs: { ...base, encaisse_mode: null, encaisse_montant: null, encaisse_le: null } }
  const montant = Math.round(Number(total) * 100) / 100
  if (!(montant >= 0)) return { ok: false, error: 'Montant invalide.' }
  return {
    ok: true,
    champs: { ...base, encaisse_mode: paiement, encaisse_montant: montant, encaisse_le: maintenant.toISOString() },
  }
}

// Les avertissements : ce que le commerçant doit LIRE avant de confirmer.
// Aucun n'interdit ; chacun dit le fait, en une phrase.
export const AVERTISSEMENTS = {
  creneau_plein: 'Ce créneau est déjà plein.',
  creneau_bloque: 'Tu as fermé ce créneau aux commandes en ligne pour ce jour.',
  creneau_commence: 'Ce créneau a déjà commencé.',
  delai_depasse: 'Le délai de commande que tu as réglé pour ce créneau est dépassé.',
  // Le message de l'article dit tout (son nom, la raison, le premier jour).
  article: '',
  stock: 'Le stock ne suffit pas.',
  hors_zone: 'Cette adresse est en dehors de ta zone de livraison.',
  adresse_non_situee: 'Cette adresse n’a pas été trouvée dans la liste officielle : elle n’aura pas de position sur ta tournée.',
  minimum_livraison: 'La commande n’atteint pas ton minimum de livraison.',
  jour_ferme: 'Tu as noté une fermeture ce jour-là.',
  // Le message de `messageHorsHoraires` dit tout (le jour, les heures).
  hors_horaires: '',
  hors_calendrier: 'Ce jour est au-delà de ton calendrier de commande en ligne.',
}

/**
 * Un avertissement, avec son détail éventuel (ex. « Il en reste 2 »).
 * ⚠️ UN CODE PEUT VISER UN ARTICLE (`stock:<id>`) : deux articles courts sont
 * deux avertissements distincts, et confirmer l'un ne confirme pas l'autre.
 * Le texte, lui, vient de la famille (`stock`).
 */
export function avertissement(code, detail = null) {
  const famille = String(code).split(':')[0]
  const base = AVERTISSEMENTS[famille] ?? AVERTISSEMENTS[code] ?? 'À vérifier.'
  return { code, message: [base, detail].filter(Boolean).join(' ') || 'À vérifier.' }
}

/**
 * Faut-il demander confirmation avant d'écrire ?
 * ⚠️ LA CONFIRMATION EST DONNÉE PAR L'ÉCRAN EN CONNAISSANCE DE CAUSE : elle
 * renvoie la liste des codes qu'il a montrés. Un avertissement apparu entre
 * les deux clics (le créneau s'est rempli entre-temps) redemande la
 * confirmation, au lieu de passer sous un « oui » donné à autre chose.
 */
export function confirmationRequise(avertissements = [], codesConfirmes = []) {
  const vus = new Set(Array.isArray(codesConfirmes) ? codesConfirmes : [])
  return (avertissements || []).some(a => !vus.has(a.code))
}

/**
 * Le créneau est-il TERMINÉ (son heure de fin passée) ?
 * 🔴 LA FENÊTRE MONTRAIT LES CRÉNEAUX DE 7 H À 15 H (trouvé par Alex, 10/10) :
 * le commerçant doit voir le nécessaire. Un créneau TERMINÉ disparaît ; celui
 * qui est EN COURS reste, c'est le client qui passe dans dix minutes.
 * Une fin avant le début (créneau qui passe minuit) finit le lendemain.
 * `instant` reçoit (dateStr, heure) et rend l'instant réel (`brusselsInstant`).
 */
export function creneauTermine(creneau, { dateStr, maintenant = new Date(), instant } = {}) {
  if (!creneau?.heure_fin || typeof instant !== 'function') return false
  const fin = instant(dateStr, creneau.heure_fin)
  if (!fin || isNaN(fin.getTime())) return false
  const debut = creneau.heure_debut ? instant(dateStr, creneau.heure_debut) : null
  const finReelle = debut && !isNaN(debut.getTime()) && fin.getTime() <= debut.getTime()
    ? new Date(fin.getTime() + 24 * 3600 * 1000) : fin
  return maintenant.getTime() >= finReelle.getTime()
}

/**
 * L'article peut-il se retirer CE JOUR-LÀ ? `null` s'il le peut.
 *
 * 🔴 LA COMMANDE ENCODÉE IGNORAIT LES RÈGLES DE L'ARTICLE (trouvé par Alex,
 * 10/10) : une tarte à J+2 s'encodait pour demain sans un mot, un pain vendu
 * le week-end seulement s'annonçait « dès lundi ». LA RÈGLE DE LA FICHE
 * (`refusDuJour` : délai, jours de vente, circuits, ensemble) et SON premier
 * jour (`premierJourPossible`), mais on PRÉVIENT au lieu de refuser : le
 * commerçant a peut-être une tarte d'avance (« prévenir puis laisser »).
 *
 * @param article  { id, nom, delai_minutes, vente_jour, commande_active, stock_mode }
 * @param indispo  les jours de la semaine où il ne se vend pas (`joursIndisponibles`)
 * @returns { raison, premier, message, court } | null
 */
export function articleHorsJour({ article, indispo = [], commercant, jour, aujourdhui }) {
  if (!article) return null
  const regle = {
    delaiJours: delaiEnJours({ delai_minutes: article.delai_minutes }),
    indispo, circuits: circuitsDeLArticle(article, commercant),
  }
  const refus = refusDuJour({ ...regle, jour, aujourdhui })
  if (!refus) return null
  const nom = `« ${article.nom || 'Cet article'} »`
  const premier = premierJourPossible({ regle, aujourdhui })
  const ensuite = premier ? ` Le premier jour possible : ${jourEnClair(premier, aujourdhui)}.` : ''
  const des = premier ? ` · dès ${jourEnClair(premier, aujourdhui)}` : ''
  if (refus.raison === 'jour') {
    return { raison: 'jour', premier, message: `${nom} ne se vend pas le ${jourSemaineDe(jour)}.${ensuite}`, court: `Pas le ${jourSemaineDe(jour)}${des}` }
  }
  if (refus.raison === 'aujourdhui_seulement') {
    return { raison: 'aujourdhui_seulement', premier, message: `${nom} se vend le jour même seulement : il ne se commande pas pour un autre jour.`, court: 'Le jour même seulement' }
  }
  const n = refus.jours ?? regle.delaiJours
  return {
    raison: 'delai', premier,
    message: `${nom} se commande ${n} jour${n > 1 ? 's' : ''} à l’avance.${ensuite}`,
    court: `Trop tôt${des}`,
  }
}

/**
 * Ce que la tuile de la grille dit pour le jour choisi : la règle du jour
 * (`articleHorsJour`), sinon le stock restant, par LA fonction de la fiche
 * (`etatStock`, circuits compris).
 * `dejaCommande` à `null` = la lecture du vendu a échoué : on ne dit rien du
 * stock plutôt que d'annoncer un stock plein.
 * @returns { hors, gere, dispo } — `dispo` vaut Infinity sans limite
 */
export function etatTuile({ article, stocksArticle = {}, dejaCommande, commercant, jour, aujourdhui }) {
  const hors = articleHorsJour({ article, indispo: joursIndisponibles(stocksArticle), commercant, jour, aujourdhui })
  if (hors || dejaCommande === null || dejaCommande === undefined) return { hors, gere: false, dispo: Infinity }
  const etat = etatStock({
    article, entreeJour: stocksArticle[jourSemaineDe(jour)] || null, dejaCommande, jour,
    circuit: circuitDuJour({ commercant, jour, aujourdhui }),
  })
  return { hors: null, gere: !!etat.gere, dispo: etat.dispo }
}

/**
 * Les jours du calendrier, aujourd'hui compris, sans les jours de fermeture :
 * ceux de la fiche (`longueur` vient de `calendrierDuCommerce`).
 * « Aujourd'hui » n'y est que si `aujourdhuiOuvert` : la fiche ne le propose
 * plus une fois ses créneaux passés.
 */
export function joursDuCalendrier({ aujourdhui, longueur, fermetures = [], aujourdhuiOuvert = true, horairesDetail = null }) {
  const jours = []
  for (let i = 0; i < Math.max(1, Number(longueur) || 0); i++) {
    const j = jourPlus(aujourdhui, i)
    if (!j || estFermeExceptionnellement(fermetures, j)) continue
    // 🔴 (11/10) un jour fermé dans les horaires ne s'affiche pas (retrait :
    // l'appelant ne passe `horairesDetail` que pour lui).
    if (horairesDetail && !estOuvertCeJour(horairesDetail, jourSemaineDe(j))) continue
    if (i === 0 && !aujourdhuiOuvert) continue
    jours.push(j)
  }
  return jours
}

/**
 * Ce jour est-il AU-DELÀ du calendrier ? (Un jour de fermeture a son propre
 * avertissement, `jour_ferme`.) L'exception « Autre date » d'Alex (10/10) :
 * permise, mais le commerçant le lit avant de confirmer.
 */
export function horsCalendrier({ jour, aujourdhui, longueur }) {
  const dernier = jourPlus(aujourdhui, Math.max(1, Number(longueur) || 0) - 1)
  return !!dernier && /^\d{4}-\d{2}-\d{2}$/.test(String(jour || '')) && jour > dernier
}

/**
 * Le moment du créneau par rapport à maintenant, pour une commande encodée.
 * `verdict` est celui de `creneauCommandable` (lib/creneaux.js).
 *   - un autre jour de semaine que le créneau : REFUS (erreur de saisie) ;
 *   - une date passée : REFUS (on n'encode pas hier) ;
 *   - un créneau terminé (`termine`, de `creneauTermine`) : REFUS (l'écran
 *     ne le montre plus ; un onglet resté ouvert ne le fait pas revenir) ;
 *   - créneau commencé ou délai dépassé, aujourd'hui : AVERTISSEMENT (le
 *     client du téléphone passe dans dix minutes, c'est le cas normal).
 */
export function jugementMoment({ verdict, dateCommande, aujourdhui, termine = false }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateCommande || ''))) return { refus: 'Date invalide.' }
  if (dateCommande < aujourdhui) return { refus: 'Cette date est passée.' }
  if (termine) return { refus: 'Ce créneau est terminé. Choisis-en un autre.' }
  if (!verdict || verdict.ok) return { refus: null, avertissement: null }
  if (verdict.raison === 'jour') return { refus: 'Ce créneau n’existe pas ce jour-là de la semaine.' }
  if (verdict.raison === 'introuvable') return { refus: 'Créneau introuvable.' }
  if (verdict.raison === 'passe') return { refus: null, avertissement: avertissement('creneau_commence') }
  if (verdict.raison === 'cutoff') return { refus: null, avertissement: avertissement('delai_depasse') }
  return { refus: null, avertissement: null }
}

/**
 * Le nombre de commandes ARRIVÉES EN LIGNE, celui qui fait sonner le tableau
 * de bord (« Nouvelle commande ! »).
 * ⚠️ Une commande encodée par le commerçant ne sonne pas : il vient de la
 * saisir. Une commande en attente de paiement non plus : le client n'a pas
 * encore payé (même exclusion que l'interrogation toutes les 5 secondes, que
 * le premier chargement oubliait).
 */
export function nombreArriveesEnLigne(commandes) {
  return (commandes || []).filter(c => c && c.origine !== ORIGINE_COMMERCANT && c.statut !== 'paiement_en_attente').length
}
