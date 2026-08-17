// Les chiffres du commerçant.
//
// CE QUE CE MODULE N'EST PAS. Un tableau de bord d'agence, avec douze courbes
// et des taux à deux décimales. Un commerçant regarde ses chiffres entre deux
// clients, debout derrière son comptoir. S'il lui faut plus de dix secondes
// pour savoir si sa semaine est bonne, il ne reviendra pas.
//
// TROIS QUESTIONS, DANS CET ORDRE :
//   1. combien j'ai vendu, et est-ce que ça monte ou ça descend ;
//   2. qu'est-ce qui part, et qu'est-ce qui ne part pas ;
//   3. combien de gens me suivent, et ce qu'ils pensent de moi.
//
// ⚠️ UN COMMERCE QUI DÉMARRE EST À ZÉRO PARTOUT. C'est la situation NORMALE
// des premières semaines, pas un échec. Un écran qui affiche « 0 € · -100 % »
// en rouge à quelqu'un qui vient de s'inscrire le fait fuir. D'où les états
// vides écrits en toutes lettres, et l'évolution qui se tait quand elle n'a
// rien de fiable à dire.

import { partiesBruxelles } from './timezone'

// Les deux fenêtres qu'on compare : la période demandée, et celle qui la
// précède immédiatement. Comparer à « il y a un an » n'a aucun sens pour une
// application qui n'existe pas depuis un an.
export function fenetres(jours = 30, maintenant = new Date()) {
  const fin = new Date(maintenant)
  const debut = new Date(maintenant.getTime() - jours * 24 * 3600 * 1000)
  const debutPrecedent = new Date(debut.getTime() - jours * 24 * 3600 * 1000)
  return { debut, fin, debutPrecedent, jours }
}

// ⚠️ CES VALEURS VIENNENT DE LA CONTRAINTE CHECK EN BASE, pas d'une intuition.
// Premier jet écrit de mémoire : « payee », « recuperee », « livree »,
// « expediee ». AUCUNE n'existe. Le chiffre d'affaires n'aurait compté que les
// commandes déjà retirées, ignorant tout ce qui était payé et en préparation,
// et le commerçant aurait vu un montant très inférieur à la réalité.
// Le banc était vert, parce qu'il testait les mêmes valeurs inventées.
//
// Les huit statuts réels (MIGRATION_COMMANDES_STATUT_CHECK.sql) :
//   paiement_en_attente · en_attente · en_preparation · pret · recupere
//   non_retire · annulee_client_refund · annulee_paiement_ko
export const STATUTS_COMMANDE = [
  'paiement_en_attente', 'en_attente', 'en_preparation', 'pret', 'recupere',
  'non_retire', 'annulee_client_refund', 'annulee_paiement_ko',
]

// Une commande compte-t-elle dans le chiffre d'affaires ?
//
// L'argent est encaissé dès `en_attente` : c'est l'état d'une commande dont le
// paiement Stripe a réussi et que le commerçant n'a pas encore prise en main.
// L'exclure amputerait le chiffre de toutes les commandes du jour.
//
// Les annulées non, évidemment. Mais les NON RETIRÉES non plus : la commande a
// beau avoir été payée, la marchandise est restée sur l'étagère, et un
// commerçant qui verrait ce montant dans son chiffre d'affaires se croirait
// plus riche qu'il ne l'est. Elles ont leur propre compteur.
const STATUTS_ENCAISSES = ['en_attente', 'en_preparation', 'pret', 'recupere']

export function commandeEncaissee(commande = {}) {
  return STATUTS_ENCAISSES.includes(String(commande.statut || ''))
}

export function arrondi(n) {
  return Math.round(Number(n || 0) * 100) / 100
}

// Statuts de rendez-vous qui comptent comme une affaire faite.
// `no_show` en est volontairement absent : le client n'est pas venu, la
// prestation n'a pas eu lieu. `annule_*` non plus, évidemment.
const STATUTS_RDV_ENCAISSES = ['confirme', 'honore']

export function rdvHonore(rdv = {}) {
  return STATUTS_RDV_ENCAISSES.includes(String(rdv.statut || ''))
}

// Ce que vaut un rendez-vous.
//
// ⚠️ DÉCISION D'ALEX, 09/08 : au tableau de bord, un rendez-vous compte pour
// son PRIX COMPLET, pas pour son acompte. La première version ne comptait que
// l'acompte encaissé en ligne — 8,75 € sur une coupe à 35 € — et le commerçant
// avait l'impression que ses rendez-vous ne comptaient pas du tout.
//
// La ventilation entre ce que Stripe a réellement versé et ce qui se règle au
// comptoir reste entière : elle vit dans l'onglet Comptabilité, dont c'est le
// métier. Ici, le commerçant veut savoir ce qu'il a vendu.
//
// Sans prix estimé (prestation « sur devis »), on se rabat sur l'acompte :
// c'est le seul montant connu, et il vaut mieux que zéro.
export function valeurRdv(rdv = {}) {
  const prix = Number(rdv.prix_estime || 0)
  if (prix > 0) return prix
  return Number(rdv.acompte_montant || 0)
}

// Ce qui a été encaissé EN LIGNE sur un rendez-vous : l'acompte, rien d'autre.
// Sert à la ligne de détail, jamais au total affiché.
export function acompteRdv(rdv = {}) {
  return Number(rdv.acompte_montant || 0)
}

// Un abonnement compte quand il a été PAYÉ, et pour son prix.
//
// ⚠️ IL NE COMPTAIT NULLE PART (Alex, 17/08). La vente d'un abonnement n'écrit
// que dans `abonnements`, jamais une commande : ni le chiffre d'affaires ni la
// Comptabilité ne la voyaient. Une professeure de yoga qui vend surtout des
// abonnements voyait donc un tableau de bord à zéro.
//
// ⚠️ ET IL NE COMPTE QU'UNE FOIS. Les séances posées sur un abonnement portent
// `prix_estime: 0` précisément pour ça : sans quoi un contrat de trente-six
// séances entrerait trente-sept fois dans le chiffre d'affaires.
export function abonnementEncaisse(a = {}) {
  return !!a && !!a.paye && Number(a.prix || 0) > 0
}

// Le chiffre d'affaires, décomposé.
//
// Renvoie un OBJET et non un nombre : l'écran montre le total, puis la part
// des produits, celle des prestations et celle des abonnements. Un salon qui
// vend trois shampoings par mois et vingt coupes doit voir lequel des deux le
// fait vivre.
export function chiffreAffaires(commandes = [], rdvs = [], abonnements = []) {
  const produits = commandes
    .filter(commandeEncaissee)
    .reduce((somme, c) => somme + Number(c.total || 0), 0)
  const honores = rdvs.filter(rdvHonore)
  const prestations = honores.reduce((somme, r) => somme + valeurRdv(r), 0)
  const acomptes = honores.reduce((somme, r) => somme + acompteRdv(r), 0)

  const abos = (abonnements || []).filter(abonnementEncaisse)
  const montantAbos = abos.reduce((somme, a) => somme + Number(a.prix || 0), 0)
  // Un abonnement vendu en ligne passe par Stripe ; inscrit à la main, il est
  // encaissé au comptoir. La distinction sert au rapprochement bancaire.
  const abosEnLigne = abos
    .filter(a => String(a.mode_paiement || '') === 'en_ligne')
    .reduce((somme, a) => somme + Number(a.prix || 0), 0)

  return {
    total: arrondi(produits + prestations + montantAbos),
    produits: arrondi(produits),
    prestations: arrondi(prestations),
    abonnements: arrondi(montantAbos),
    // Ce que Stripe a versé : le rapprochement avec la Comptabilité se fait
    // sur ce chiffre-là, pas sur le total.
    encaisse_en_ligne: arrondi(produits + acomptes + abosEnLigne),
    au_comptoir: arrondi(prestations - acomptes + (montantAbos - abosEnLigne)),
    nb_rdv: honores.length,
    nb_abonnements: abos.length,
  }
}

export function panierMoyen(commandes = []) {
  const payees = commandes.filter(commandeEncaissee)
  if (payees.length === 0) return 0
  const total = payees.reduce((s, c) => s + Number(c.total || 0), 0)
  return arrondi(total / payees.length)
}

// L'évolution entre deux périodes.
//
// ⚠️ ELLE SE TAIT PLUTÔT QUE DE MENTIR. Passer de 1 à 3 commandes n'est pas
// « +200 % », c'est deux commandes de plus, et l'annoncer en pourcentage donne
// une fausse impression de tendance. En dessous de cinq unités sur la période
// précédente, on renvoie null et l'écran n'affiche rien.
export const SEUIL_EVOLUTION = 5

export function evolution(actuel, precedent) {
  const a = Number(actuel || 0)
  const p = Number(precedent || 0)
  if (p < SEUIL_EVOLUTION) return null
  const pct = Math.round(((a - p) / p) * 100)
  return { pct, sens: pct > 0 ? 'hausse' : pct < 0 ? 'baisse' : 'stable' }
}

// Ce qui se vend. `lignes` vient de commande_articles, avec le nom repris au
// moment de la commande : un article renommé ou supprimé doit rester lisible
// dans l'historique.
export function topArticles(lignes = [], combien = 5) {
  const par = new Map()
  for (const l of lignes) {
    const nom = String(l.nom || l.article_nom || '').trim()
    if (!nom) continue
    const e = par.get(nom) || { nom, quantite: 0, montant: 0 }
    e.quantite += Number(l.quantite || 0)
    e.montant = arrondi(e.montant + Number(l.prix_unitaire || 0) * Number(l.quantite || 0))
    par.set(nom, e)
  }
  return [...par.values()]
    .sort((a, b) => b.quantite - a.quantite || b.montant - a.montant)
    .slice(0, combien)
}

// Ce qui se réserve. Les rendez-vous ne portent qu'un `prestation_id` : le nom
// est résolu par l'appelant, qui a la liste des prestations. Une prestation
// supprimée depuis reste comptée, sous un libellé neutre plutôt que disparaître
// du total.
export function topPrestations(rdvs = [], nomsParId = {}, combien = 5) {
  const par = new Map()
  for (const r of rdvs) {
    if (!rdvHonore(r)) continue
    const id = String(r.prestation_id || '')
    const nom = nomsParId[id] || 'Prestation supprimée'
    const e = par.get(nom) || { nom, quantite: 0, montant: 0 }
    e.quantite += 1
    e.montant = arrondi(e.montant + valeurRdv(r))
    par.set(nom, e)
  }
  return [...par.values()]
    .sort((a, b) => b.quantite - a.quantite || b.montant - a.montant)
    .slice(0, combien)
}

// ─── LE TEMPS ────────────────────────────────────────────────────────────────
//
// ⚠️ TOUT SE COMPTE EN HEURE BELGE. Une commande passée à 00h30 est horodatée
// 22h30 UTC la veille en hiver : sur l'heure brute, elle changerait de jour et
// les heures de pointe seraient décalées d'une à deux heures selon la saison.

// La courbe jour par jour : un point par journée de la période, y compris les
// journées vides. Sans elles, deux ventes espacées de trois semaines
// donneraient une courbe de deux points collés, et l'effet d'une offre du jour
// deviendrait illisible.
export function serieJournaliere(commandes = [], rdvs = [], { debut, jours = 30 } = {}) {
  if (!debut) return []
  const depart = partiesBruxelles(debut)
  if (!depart) return []
  const cases = new Map()
  const base = new Date(`${depart.jour}T12:00:00Z`)
  for (let i = 0; i < jours; i++) {
    const j = new Date(base.getTime() + i * 24 * 3600 * 1000).toISOString().slice(0, 10)
    cases.set(j, { jour: j, montant: 0, ventes: 0 })
  }
  const poser = (quand, montant) => {
    const p = partiesBruxelles(quand)
    if (!p) return
    const c = cases.get(p.jour)
    if (!c) return
    c.montant = arrondi(c.montant + montant)
    c.ventes += 1
  }
  for (const c of commandes) {
    if (!commandeEncaissee(c)) continue
    poser(c.created_at, Number(c.total || 0))
  }
  for (const r of rdvs) {
    if (!rdvHonore(r)) continue
    poser(r.created_at, valeurRdv(r))
  }
  return [...cases.values()]
}

// Les jours de la semaine, du lundi au dimanche. `getUTCDay()` rend 0 pour le
// dimanche : on réordonne, une semaine belge ne commence pas un dimanche.
export const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

// Quand les gens commandent et réservent. On compte le moment de la DEMANDE,
// pas celui du retrait ni celui du rendez-vous : ces deux-là sont déjà dans
// l'agenda, et c'est le moment de la demande qui dit quand publier une offre.
//
// ⚠️ Le pic ne se prononce qu'à partir d'un volume qui veut dire quelque
// chose. Sur quatre commandes, « ton heure de pointe est 14h » ne décrit rien
// d'autre que le hasard.
export const MIN_POUR_POINTE = 10

export function momentsDePointe(commandes = [], rdvs = []) {
  const heures = Array.from({ length: 24 }, (_, h) => ({ heure: h, nombre: 0 }))
  const jours = JOURS_SEMAINE.map((nom, i) => ({ jour: i, nom, nombre: 0 }))
  let total = 0
  const poser = (quand) => {
    const p = partiesBruxelles(quand)
    if (!p) return
    heures[p.heure].nombre += 1
    // getUTCDay : 0 = dimanche. Lundi doit tomber en case 0.
    jours[(p.jourSemaine + 6) % 7].nombre += 1
    total += 1
  }
  for (const c of commandes) { if (commandeEncaissee(c)) poser(c.created_at) }
  for (const r of rdvs) { if (rdvHonore(r)) poser(r.created_at) }
  const meilleur = (liste) => liste.reduce((a, b) => (b.nombre > a.nombre ? b : a), liste[0])
  return {
    heures,
    jours,
    total,
    // En dessous du seuil, on renvoie les barres mais aucune conclusion :
    // l'écran affiche alors la répartition sans la commenter.
    pic_heure: total >= MIN_POUR_POINTE ? meilleur(heures) : null,
    pic_jour: total >= MIN_POUR_POINTE ? meilleur(jours) : null,
  }
}

// Les commandes payées que personne n'est venu chercher. C'est le chiffre qui
// fâche, et c'est justement pour ça qu'il doit être là : il se corrige avec un
// rappel, pas en l'ignorant.
export function nonRecuperees(commandes = []) {
  const perdues = commandes.filter(c => String(c.statut || '') === 'non_retire')
  return {
    nombre: perdues.length,
    montant: arrondi(perdues.reduce((s, c) => s + Number(c.total || 0), 0)),
  }
}

// Le taux d'annulation ne retient que les annulations DÉCIDÉES : un client qui
// se désiste, un commerçant qui annule. Un paiement qui n'aboutit jamais
// (`annulee_paiement_ko`) est un panier abandonné, pas une annulation : le
// compter gonflerait le taux d'un chiffre sur lequel personne n'a de prise, et
// une commande jamais payée n'a pas non plus sa place au dénominateur.
export function tauxAnnulation(commandes = [], rdvs = []) {
  const cmdReelles = commandes.filter(c =>
    !['paiement_en_attente', 'annulee_paiement_ko'].includes(String(c.statut || '')))
  const rdvReels = rdvs.filter(r => String(r.statut || '') !== 'reporte')
  const total = cmdReelles.length + rdvReels.length
  if (total === 0) return null
  const annules = cmdReelles.filter(c => String(c.statut || '') === 'annulee_client_refund').length
    + rdvReels.filter(r => ['annule_client', 'annule_commercant'].includes(String(r.statut || ''))).length
  return { pct: Math.round((annules / total) * 100), annules, total }
}

// La note moyenne, arrondie au dixième. Sous trois avis, on ne l'affiche pas :
// une note construite sur un seul avis ne dit rien du commerce, elle dit
// seulement qu'une personne a eu une bonne ou une mauvaise journée.
export const MIN_AVIS_POUR_NOTE = 3

export function noteMoyenne(avis = []) {
  const notes = avis.map(a => Number(a.note)).filter(n => Number.isFinite(n) && n > 0)
  if (notes.length < MIN_AVIS_POUR_NOTE) return null
  const moyenne = notes.reduce((s, n) => s + n, 0) / notes.length
  return { note: Math.round(moyenne * 10) / 10, nombre: notes.length }
}

// L'engagement autour des deals : vu, cliqué, appelé.
export function performanceDeals(deals = []) {
  const vues = deals.reduce((s, d) => s + Number(d.vues || 0), 0)
  const clics = deals.reduce((s, d) => s + Number(d.clics || 0), 0)
  const ctas = deals.reduce((s, d) => s + Number(d.cta_clics || 0), 0)
  return {
    vues, clics, ctas,
    // Le taux ne veut rien dire sous une poignée de vues.
    tauxClic: vues >= 20 ? Math.round((clics / vues) * 100) : null,
  }
}

// La phrase qui accueille un commerçant dont tout est encore à zéro. Elle doit
// être vraie, et elle doit donner le geste suivant.
export function messageVide({ aDesArticles = false, aDesDeals = false, peutVendre = false } = {}) {
  if (!aDesArticles) {
    return 'Tes chiffres arriveront ici dès ta première vente. Commence par remplir ton catalogue : sans lui, personne ne peut rien commander.'
  }
  if (peutVendre && !aDesDeals) {
    return 'Rien encore ce mois-ci. Une offre du jour est le moyen le plus rapide de faire venir quelqu\'un une première fois.'
  }
  return 'Rien encore ce mois-ci. C\'est normal les premières semaines : le bouche-à-oreille met un peu de temps.'
}
