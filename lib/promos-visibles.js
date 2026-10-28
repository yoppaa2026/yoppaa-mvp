// CE QUE LE CLIENT VOIT D'UNE PROMO, ET QUAND (28/10, lot 1 du module promo).
//
// 🔴 POURQUOI CE FICHIER EXISTE. Alex, 28/10, sur le site d'essai : « les
// promos passent, mais elles ne sont visibles nulle part ». Le PRIX suivait le
// jour choisi (le serveur juge la promo au jour du retrait ou du rendez-vous),
// mais l'AFFICHAGE suivait le jour où l'on regarde la fiche : une promo valable
// demain n'existait pas à l'écran, même en choisissant demain. Rien n'annonçait
// non plus les promos à venir.
//
// ✅ Décisions d'Alex au tableau (28/10) : une section « Promos » avec leur
// MOMENT (« Aujourd'hui », « Demain », « Mercredi », « Du 2 au 5 nov. »),
// sur 14 jours, et une pastille sur chaque article concerné.
//
// ⚠️ Module PUR : ni base, ni horloge cachée. Le jour d'aujourd'hui est
// toujours passé par l'appelant (heure belge), comme dans `lib/deals.js`, dont
// il reprend la fenêtre mot pour mot (`dealActifCeJour`).

import { dealActifCeJour, estRemiseSurProduit, estOffreSeparee, dealViseArticle, dealVisePrestation, TYPE_REMISE, TYPE_PRIX_FIXE } from './deals.js'
import { estRecurrente, libelleRecurrence, libellePlage, prochainsJours } from './recurrence-promo.js'

export const HORIZON_PROMOS_JOURS = 14

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

// Les jours se calculent à midi UTC : aucun changement d'heure ne fait sauter
// ni doubler un jour.
function versDate(iso) {
  return new Date(`${iso}T12:00:00Z`)
}
export function ajouterJoursISO(iso, n) {
  const d = versDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  // Composé à la main : un jour ne se déduit jamais d'un instant en temps
  // universel dans ce projet (garde du banc comptable).
  const deux = (x) => String(x).padStart(2, '0')
  return `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`
}
function ecartJours(de, a) {
  return Math.round((versDate(a) - versDate(de)) / 86400000)
}
function jourDeLaSemaine(iso) {
  return JOURS[versDate(iso).getUTCDay()]
}
// « mercredi », pour « Deal de mercredi ».
export function nomDuJour(iso) {
  return iso ? jourDeLaSemaine(String(iso).slice(0, 10)) : ''
}
function dateCourte(iso) {
  const d = versDate(iso)
  return `${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`
}

// La fenêtre d'un deal, avec les MÊMES deux formats que `dealActifCeJour` :
// une date ponctuelle, ou un intervalle dont on ne garde que les jours.
export function fenetreDuDeal(deal) {
  if (!deal) return null
  if (deal.date_deal) return { debut: String(deal.date_deal).slice(0, 10), fin: String(deal.date_deal).slice(0, 10) }
  if (deal.date_debut && deal.date_fin) {
    return { debut: String(deal.date_debut).slice(0, 10), fin: String(deal.date_fin).slice(0, 10) }
  }
  return null
}

// Une offre de fin de journée (anti-gaspi) a sa propre vitrine, « Avant la
// fermeture » : elle ne se mélange pas aux promos préparées.
function estInvendu(deal) {
  return !!(deal?.heure_debut && deal?.heure_fin)
}

// Quand une promo a lieu, dit comme on le dirait au comptoir.
//   en cours : « Aujourd'hui », « Jusqu'à dimanche », « Jusqu'au 12 nov. »
//   à venir  : « Demain », « Mercredi », « Le 12 nov. », « Du 2 au 5 nov. »,
//              « Dès demain, jusqu'à dimanche »
export function momentDuDeal(deal, aujourdhui) {
  // ✅ (28/10, lot 2) Une promo récurrente se dit par son RYTHME (« Chaque
  // mercredi », « Le 1er samedi du mois »), et sa plage horaire s'ajoute.
  const plage = libellePlage(deal)
  if (estRecurrente(deal)) {
    const rythme = libelleRecurrence(deal)
    if (!rythme || prochainsJours(deal, aujourdhui, { horizon: 366, nombre: 1 }).length === 0) return null
    return plage ? `${rythme} · ${plage}` : rythme
  }
  const dit = momentDesDates(deal, aujourdhui)
  return dit && plage ? `${dit} · ${plage}` : dit
}

function momentDesDates(deal, aujourdhui) {
  const f = fenetreDuDeal(deal)
  if (!f || !aujourdhui || f.fin < aujourdhui) return null
  const avant = ecartJours(aujourdhui, f.debut)
  const duree = ecartJours(f.debut, f.fin)
  const finDite = (ecart) => (ecart <= 6 ? `jusqu'à ${jourDeLaSemaine(f.fin)}` : `jusqu'au ${dateCourte(f.fin)}`)
  if (avant <= 0) {
    if (f.fin === aujourdhui) return "Aujourd'hui"
    return majuscule(finDite(ecartJours(aujourdhui, f.fin)))
  }
  if (duree === 0) {
    if (avant === 1) return 'Demain'
    if (avant <= 6) return majuscule(jourDeLaSemaine(f.debut))
    return `Le ${dateCourte(f.debut)}`
  }
  if (avant === 1) return `Dès demain, ${finDite(ecartJours(aujourdhui, f.fin))}`
  // « Du 5 au 8 nov. » dans le même mois, « Du 30 oct. au 2 nov. » sinon.
  const memeMois = f.debut.slice(0, 7) === f.fin.slice(0, 7)
  const debutDit = memeMois ? String(versDate(f.debut).getUTCDate()) : dateCourte(f.debut)
  return `Du ${debutDit} au ${dateCourte(f.fin)}`
}

// Le jour d'un bouton « Commander pour … » : « aujourd'hui », « demain »,
// « jeudi » dans la semaine, « le 12 nov. » au-delà. Un bouton dit le geste
// ET le jour : « Commander pour ce jour » obligeait à deviner lequel (Alex,
// 28/10 au test).
export function pourQuelJour(iso, aujourdhui) {
  if (!iso || !aujourdhui) return ''
  const ecart = ecartJours(aujourdhui, String(iso).slice(0, 10))
  if (ecart === 0) return "aujourd'hui"
  if (ecart === 1) return 'demain'
  if (ecart > 1 && ecart <= 6) return jourDeLaSemaine(String(iso).slice(0, 10))
  return `le ${dateCourte(String(iso).slice(0, 10))}`
}

// Ce que la promo offre, en quelques mots pour une pastille. Le titre, lui,
// s'affiche à côté dans la section : une pastille reste courte.
export function accrocheDuDeal(deal) {
  if (!deal) return ''
  if (deal.deal_type === TYPE_REMISE && Number(deal.remise_pct) > 0) return `-${Number(deal.remise_pct)} %`
  if (deal.deal_type === TYPE_PRIX_FIXE) return 'Prix promo'
  return 'Offre'
}

// Les promos à montrer dans la section « Promos » : en cours ou qui
// commencent dans les `horizon` jours, triées par date de début. Ni les
// promos éteintes, ni les invendus du soir. `garder(deal)` laisse l'appelant
// écarter ce que sa fiche ne vend pas (les prestations sur une boutique…).
export function promosAVenir(deals = [], aujourdhui, { horizon = HORIZON_PROMOS_JOURS, garder = () => true } = {}) {
  if (!aujourdhui) return []
  const limite = ajouterJoursISO(aujourdhui, horizon)
  return (deals || [])
    .filter(d => d && d.actif !== false && !estInvendu(d) && garder(d))
    .map(d => {
      // ✅ (28/10, lot 2) Une promo récurrente : sa PROCHAINE fois dans
      // l'horizon, comme une promo d'un jour.
      if (!estRecurrente(d)) return { deal: d, fenetre: fenetreDuDeal(d) }
      const prochain = prochainsJours(d, aujourdhui, { horizon, nombre: 1 })[0]
      return { deal: d, fenetre: prochain ? { debut: prochain, fin: prochain } : null }
    })
    .filter(({ fenetre }) => fenetre && fenetre.fin >= aujourdhui && fenetre.debut <= limite)
    .sort((a, b) => (a.fenetre.debut < b.fenetre.debut ? -1 : a.fenetre.debut > b.fenetre.debut ? 1 : 0))
    .map(({ deal, fenetre }) => ({
      deal,
      moment: momentDuDeal(deal, aujourdhui),
      enCours: fenetre.debut <= aujourdhui,
      premierJour: fenetre.debut < aujourdhui ? aujourdhui : fenetre.debut,
    }))
}

// La promo qui vise cet article (ou cette prestation) un AUTRE jour que celui
// choisi, pour la pastille « -20 % mercredi ». Rien si une promo s'applique
// déjà au jour choisi : le prix barré le dit.
function promoAVenirQuiVise(vise, deals, jourChoisi, aujourdhui) {
  const candidats = promosAVenir(deals, aujourdhui).filter(p => vise(p.deal))
  if (candidats.some(p => dealActifCeJour(p.deal, jourChoisi))) return null
  return candidats.find(p => !dealActifCeJour(p.deal, jourChoisi)) || null
}
export function promoAVenirPourArticle(article, deals = [], jourChoisi, aujourdhui) {
  if (!article) return null
  return promoAVenirQuiVise(d => (estRemiseSurProduit(d) || estOffreSeparee(d)) && dealViseArticle(d, article), deals, jourChoisi, aujourdhui)
}
export function promoAVenirPourPrestation(prestation, deals = [], jourChoisi, aujourdhui) {
  if (!prestation) return null
  return promoAVenirQuiVise(d => estRemiseSurProduit(d) && dealVisePrestation(d, prestation), deals, jourChoisi, aujourdhui)
}

// Ce que le client économise sur des lignes qui portent leur prix plein
// (`tracePromo`, lib/lignes-commande.js) : en centimes, jamais négatif.
export function economieDesLignesCents(lignes = []) {
  let cents = 0
  for (const l of lignes || []) {
    const plein = Number(l?.prix_plein)
    const paye = Number(l?.prix_unitaire)
    const q = Number(l?.quantite) || 0
    if (!Number.isFinite(plein) || !Number.isFinite(paye) || plein <= paye || q <= 0) continue
    cents += (Math.round(plein * 100) - Math.round(paye * 100)) * q
  }
  return cents
}
