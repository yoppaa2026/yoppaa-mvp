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

// Chiffre d'affaires d'une liste de commandes et de rendez-vous.
//
// Pour un rendez-vous, on compte ce qui a RÉELLEMENT été encaissé en ligne,
// c'est-à-dire l'acompte. Le solde est réglé au comptoir et Yoppaa n'en sait
// rien : l'annoncer serait inventer un chiffre.
// Statuts de rendez-vous où l'acompte a bien été encaissé et conservé.
// `no_show` en est volontairement absent : l'acompte reste souvent acquis au
// commerçant, mais pas toujours, et compter un rendez-vous manqué comme du
// chiffre d'affaires demanderait de connaître sa politique. On préfère un
// chiffre légèrement prudent à un chiffre optimiste.
const STATUTS_RDV_ENCAISSES = ['confirme', 'honore']

export function chiffreAffaires(commandes = [], rdvs = []) {
  const cmd = commandes
    .filter(commandeEncaissee)
    .reduce((somme, c) => somme + Number(c.total || 0), 0)
  const rdv = rdvs
    .filter(r => STATUTS_RDV_ENCAISSES.includes(String(r.statut || '')) && Number(r.acompte_montant || 0) > 0)
    .reduce((somme, r) => somme + Number(r.acompte_montant || 0), 0)
  return arrondi(cmd + rdv)
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
