// Journal des transactions Yoppaa : agrégation et fabrication du CSV.
// Le cœur fiscal (régime, choix du taux, ventilation) vit dans lib/tva.js.
//
// ⚠️ CE N'EST PAS UN JOURNAL DE CAISSE CERTIFIÉ. Yoppaa n'est pas un système
// de caisse enregistrée au sens de la réglementation belge (pas de module de
// contrôle). Ce document sert au comptable et au rapprochement bancaire ; il
// ne dispense pas un établissement soumis au SCE de sa caisse certifiée.
// Cette mention est reprise en tête du fichier exporté, sciemment.

import {
  arrondi, ventiler, cleTaux, libelleTaux,
  regimeDepuisModeRetrait, tauxPourArticle, TAUX_NON_RENSEIGNE,
} from './tva'

export { arrondi, ventiler }

// Les statuts qui ne représentent AUCUN chiffre d'affaires : rien n'a été
// vendu, ou la vente a été défaite.
const STATUTS_EXCLUS = ['paiement_en_attente', 'annulee_client_refund', 'annulee_paiement_ko', 'annulee']

export function estComptabilisable(statut) {
  return !STATUTS_EXCLUS.includes(String(statut || ''))
}

// Construit les lignes normalisées à partir des commandes et des rendez-vous.
// Chaque ligne porte déjà sa ventilation : le journal comme le détail s'en
// déduisent, sans recalculer deux fois selon deux logiques.
//
// `articlesParId` sert de filet pour les commandes antérieures au figement des
// taux : on retombe alors sur le taux actuel de l'article, et l'en-tête du
// fichier le signale honnêtement.
export function construireLignes({ commandes = [], rdvs = [], tauxDefaut = null, articlesParId = {} }) {
  const lignes = []

  for (const c of commandes) {
    if (!estComptabilisable(c.statut)) continue

    const regime = c.regime_tva || regimeDepuisModeRetrait(c.mode_retrait)

    // Ventilation par taux : une même commande peut mélanger du 6 % et du 21 %.
    const parTaux = {}
    let ttcArticles = 0
    for (const la of (c.commande_articles || [])) {
      const ttc = arrondi((Number(la.prix_unitaire) || 0) * (Number(la.quantite) || 0))
      ttcArticles += ttc
      // Le taux figé à la vente fait toujours foi.
      const taux = la.tva_taux != null
        ? la.tva_taux
        : tauxPourArticle({ article: articlesParId[la.article_id], regime, tauxDefautCommerce: tauxDefaut })
      const cle = cleTaux(taux)
      parTaux[cle] = arrondi((parTaux[cle] || 0) + ttc)
    }

    // Les frais de livraison suivent le taux par défaut du commerce : ils sont
    // l'accessoire de la vente, pas un article du catalogue.
    const fraisLivraison = arrondi(c.frais_livraison)
    if (fraisLivraison > 0) {
      const cle = cleTaux(tauxDefaut)
      parTaux[cle] = arrondi((parTaux[cle] || 0) + fraisLivraison)
    }

    // Garde-fou : si le détail des lignes ne reconstitue pas le total (options,
    // remise, deal), on rattache l'écart au taux dominant plutôt que de le
    // perdre. Le chiffre d'affaires du journal doit égaler l'encaissement.
    const total = arrondi(c.total)
    const ecart = arrondi(total - ttcArticles - fraisLivraison)
    if (Math.abs(ecart) >= 0.01) {
      const cles = Object.keys(parTaux)
      const dominant = cles.length > 0
        ? cles.sort((a, b) => parTaux[b] - parTaux[a])[0]
        : cleTaux(tauxDefaut)
      parTaux[dominant] = arrondi((parTaux[dominant] || 0) + ecart)
    }

    const parBon = arrondi(c.bon_cadeau_montant)
    lignes.push({
      date: (c.date_commande || c.created_at || '').slice(0, 10),
      type: 'Commande',
      canal: canalCommande(c),
      regime,
      reference: c.numero_commande || String(c.id).slice(0, 8),
      total,
      parTaux,
      enLigne: c.paye_en_ligne ? arrondi(total - parBon) : 0,
      comptoir: c.paye_en_ligne ? 0 : arrondi(total - parBon),
      bonCadeau: parBon,
      fraisStripe: arrondi(c.stripe_frais),
      netStripe: c.stripe_net == null ? null : arrondi(c.stripe_net),
      statut: c.statut,
    })
  }

  for (const r of rdvs) {
    // Seul l'acompte transite par Yoppaa : le solde se règle chez le
    // commerçant, il n'a rien à faire dans un journal des transactions Yoppaa.
    const acompte = arrondi(r.acompte_montant)
    if (!r.acompte_paye || acompte <= 0) continue
    const cle = cleTaux(r.tva_taux != null ? r.tva_taux : tauxDefaut)
    lignes.push({
      date: (r.date_rdv || '').slice(0, 10),
      type: 'Acompte RDV',
      canal: 'Rendez-vous',
      regime: 'emporter',
      reference: r.numero_rdv || String(r.id).slice(0, 8),
      total: acompte,
      parTaux: { [cle]: acompte },
      enLigne: r.acompte_paye_en_ligne ? acompte : 0,
      comptoir: r.acompte_paye_en_ligne ? 0 : acompte,
      bonCadeau: 0,
      fraisStripe: arrondi(r.stripe_frais),
      netStripe: r.stripe_net == null ? null : arrondi(r.stripe_net),
      statut: r.statut,
    })
  }

  return lignes.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

function canalCommande(c) {
  const m = String(c.mode_retrait || '')
  if (m.includes('livraison')) return 'Livraison'
  if (m.includes('expedition')) return 'Expédition'
  if (m.includes('boutique')) return 'Retrait boutique'
  return 'Click & Collect'
}

// Regroupe les lignes par journée : c'est le rapport de caisse quotidien.
export function journalParJour(lignes) {
  const jours = new Map()
  for (const l of lignes) {
    if (!jours.has(l.date)) {
      jours.set(l.date, {
        date: l.date, nb: 0, total: 0, parTaux: {},
        enLigne: 0, comptoir: 0, bonCadeau: 0, fraisStripe: 0, netStripe: 0,
      })
    }
    const j = jours.get(l.date)
    j.nb += 1
    j.total = arrondi(j.total + l.total)
    j.enLigne = arrondi(j.enLigne + l.enLigne)
    j.comptoir = arrondi(j.comptoir + l.comptoir)
    j.bonCadeau = arrondi(j.bonCadeau + l.bonCadeau)
    j.fraisStripe = arrondi(j.fraisStripe + (l.fraisStripe || 0))
    j.netStripe = arrondi(j.netStripe + (l.netStripe ?? 0))
    for (const [cle, ttc] of Object.entries(l.parTaux)) {
      j.parTaux[cle] = arrondi((j.parTaux[cle] || 0) + ttc)
    }
  }
  return [...jours.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

// Toutes les clés de taux réellement rencontrées : les colonnes du fichier
// s'adaptent au commerce plutôt que d'imposer une grille figée. Le marqueur
// « non renseigné » est toujours rejeté en fin de tableau.
export function tauxRencontres(lignes) {
  const s = new Set()
  for (const l of lignes) for (const c of Object.keys(l.parTaux)) s.add(c)
  const cles = [...s]
  const nr = cles.filter(c => c === TAUX_NON_RENSEIGNE)
  const nombres = cles.filter(c => c !== TAUX_NON_RENSEIGNE).map(Number).sort((a, b) => a - b)
  return [...nombres, ...nr]
}

// ─── Fabrication du CSV ──────────────────────────────────────────────────────
// Séparateur point-virgule et virgule décimale : c'est ce qu'attend Excel en
// version belge ou française. Un BOM UTF-8 en tête, sans quoi Excel massacre
// les accents à l'ouverture.

const BOM = '﻿'

function nombre(n) {
  return (Number(n) || 0).toFixed(2).replace('.', ',')
}
function champ(v) {
  const s = String(v ?? '')
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function ligneCsv(cells) {
  return cells.map(champ).join(';')
}

function entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants }) {
  const l = [
    ligneCsv([`Export comptable Yoppaa - ${commercant?.nom || ''}`]),
    ligneCsv([`Periode du ${du} au ${au}`]),
    ligneCsv([`Numero d entreprise ${commercant?.bce || ''}`]),
    ligneCsv(['Document d aide a la comptabilite. Yoppaa n est pas un systeme de caisse enregistree certifie (SCE) : ce fichier ne remplace pas une caisse certifiee.']),
    ligneCsv(['En cas de doute sur un taux applicable, consultez votre comptable ou le SPF Finances.']),
  ]
  if (!assujetti) l.push(ligneCsv(['Commerce non assujetti a la TVA : aucune ventilation n est calculee.']))
  if (avertissementTaux) l.push(ligneCsv(['Certaines transactions anterieures a la mise en place des taux utilisent le taux actuel de l article.']))
  if (tauxManquants) l.push(ligneCsv(['ATTENTION : des articles n ont aucun taux renseigne. Leur montant figure dans la colonne "Taux non renseigne" et n est pas ventile.']))
  l.push('')
  return l
}

function colonnesTaux(taux) {
  return taux.flatMap(t => [`Base ${libelleTaux(t)}`, `TVA ${libelleTaux(t)}`])
}

export function csvJournal({ lignes, commercant, du, au, assujetti = true, avertissementTaux = false }) {
  const jours = journalParJour(lignes)
  const taux = assujetti ? tauxRencontres(lignes) : []
  const tauxManquants = taux.includes(TAUX_NON_RENSEIGNE)
  const out = entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants })

  out.push(ligneCsv([
    'Date', 'Nb transactions', 'CA TTC', ...colonnesTaux(taux),
    'Encaisse en ligne', 'Encaisse au comptoir', 'Paye par bon cadeau', 'Frais Stripe', 'Net Stripe',
  ]))

  const totaux = { nb: 0, total: 0, enLigne: 0, comptoir: 0, bonCadeau: 0, frais: 0, net: 0, base: {}, tva: {} }
  for (const j of jours) {
    const cells = [j.date, j.nb, nombre(j.total)]
    for (const t of taux) {
      const { base, tva } = ventiler(j.parTaux[t] || 0, t === TAUX_NON_RENSEIGNE ? null : t)
      cells.push(nombre(base), nombre(tva))
      totaux.base[t] = arrondi((totaux.base[t] || 0) + base)
      totaux.tva[t] = arrondi((totaux.tva[t] || 0) + tva)
    }
    cells.push(nombre(j.enLigne), nombre(j.comptoir), nombre(j.bonCadeau), nombre(j.fraisStripe), nombre(j.netStripe))
    out.push(ligneCsv(cells))
    totaux.nb += j.nb
    totaux.total = arrondi(totaux.total + j.total)
    totaux.enLigne = arrondi(totaux.enLigne + j.enLigne)
    totaux.comptoir = arrondi(totaux.comptoir + j.comptoir)
    totaux.bonCadeau = arrondi(totaux.bonCadeau + j.bonCadeau)
    totaux.frais = arrondi(totaux.frais + j.fraisStripe)
    totaux.net = arrondi(totaux.net + j.netStripe)
  }

  const fin = ['TOTAL', totaux.nb, nombre(totaux.total)]
  for (const t of taux) fin.push(nombre(totaux.base[t] || 0), nombre(totaux.tva[t] || 0))
  fin.push(nombre(totaux.enLigne), nombre(totaux.comptoir), nombre(totaux.bonCadeau), nombre(totaux.frais), nombre(totaux.net))
  out.push('')
  out.push(ligneCsv(fin))

  return BOM + out.join('\r\n')
}

export function csvDetail({ lignes, commercant, du, au, assujetti = true, avertissementTaux = false }) {
  const taux = assujetti ? tauxRencontres(lignes) : []
  const tauxManquants = taux.includes(TAUX_NON_RENSEIGNE)
  const out = entete({ commercant, du, au, assujetti, avertissementTaux, tauxManquants })

  out.push(ligneCsv([
    'Date', 'Type', 'Canal', 'Regime', 'Reference', 'Statut', 'Montant TTC', ...colonnesTaux(taux),
    'Encaisse en ligne', 'Encaisse au comptoir', 'Paye par bon cadeau', 'Frais Stripe', 'Net Stripe',
  ]))

  for (const l of lignes) {
    const cells = [l.date, l.type, l.canal, l.regime === 'sur_place' ? 'Sur place' : 'A emporter', l.reference, l.statut, nombre(l.total)]
    for (const t of taux) {
      const { base, tva } = ventiler(l.parTaux[t] || 0, t === TAUX_NON_RENSEIGNE ? null : t)
      cells.push(nombre(base), nombre(tva))
    }
    cells.push(nombre(l.enLigne), nombre(l.comptoir), nombre(l.bonCadeau), nombre(l.fraisStripe), l.netStripe == null ? '' : nombre(l.netStripe))
    out.push(ligneCsv(cells))
  }

  return BOM + out.join('\r\n')
}
