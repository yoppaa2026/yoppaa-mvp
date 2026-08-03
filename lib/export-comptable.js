// Calculs de l'export comptable. Isolés du transport HTTP pour rester
// testables et réutilisables (journal quotidien, détail, futur PDF).
//
// ⚠️ CE N'EST PAS UN JOURNAL DE CAISSE CERTIFIÉ. Yoppaa n'est pas un système
// de caisse enregistrée au sens de la réglementation belge (pas de module de
// contrôle). Ce document sert au comptable et au rapprochement bancaire ; il
// ne dispense pas un établissement soumis au SCE de sa caisse certifiée.
// Cette mention est reprise en tête du fichier exporté, sciemment.

// Un montant TTC et un taux donnent la base hors taxe et la TVA. On arrondit
// au centime À CHAQUE LIGNE, comme le fait une facture : arrondir seulement à
// la fin ferait diverger le total de la somme des lignes, et un comptable le
// verrait tout de suite.
export function ventiler(ttc, taux) {
  const montant = Number(ttc) || 0
  const t = Number(taux) || 0
  if (t <= 0) return { base: arrondi(montant), tva: 0 }
  const base = arrondi(montant / (1 + t / 100))
  return { base, tva: arrondi(montant - base) }
}

export function arrondi(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

// Les statuts qui ne représentent AUCUN chiffre d'affaires : rien n'a été
// vendu, ou la vente a été défaite.
const STATUTS_EXCLUS = ['paiement_en_attente', 'annulee_client_refund', 'annulee_paiement_ko', 'annulee']

export function estComptabilisable(statut) {
  return !STATUTS_EXCLUS.includes(String(statut || ''))
}

// Construit les lignes normalisées à partir des commandes et des rendez-vous.
// Chaque ligne porte déjà sa ventilation de TVA : le journal comme le détail
// s'en déduisent, sans recalculer deux fois selon deux logiques.
export function construireLignes({ commandes = [], rdvs = [], tauxDefaut = 21, tauxParArticle = {} }) {
  const lignes = []

  for (const c of commandes) {
    if (!estComptabilisable(c.statut)) continue

    // Ventilation par taux : une commande peut mélanger du 6 % et du 21 %.
    const parTaux = {}
    let ttcArticles = 0
    for (const la of (c.commande_articles || [])) {
      const ttc = arrondi((Number(la.prix_unitaire) || 0) * (Number(la.quantite) || 0))
      ttcArticles += ttc
      // Le taux figé à la vente fait foi. Pour les commandes antérieures à la
      // migration il est absent : on retombe sur le taux actuel de l'article,
      // et l'en-tête du fichier le signale.
      const taux = la.tva_taux ?? tauxParArticle[la.article_id] ?? tauxDefaut
      parTaux[taux] = arrondi((parTaux[taux] || 0) + ttc)
    }

    // Les frais de livraison suivent le taux par défaut du commerce : ils sont
    // l'accessoire de la vente, pas un article du catalogue.
    const fraisLivraison = arrondi(c.frais_livraison)
    if (fraisLivraison > 0) parTaux[tauxDefaut] = arrondi((parTaux[tauxDefaut] || 0) + fraisLivraison)

    // Garde-fou : si le détail des lignes ne reconstitue pas le total (options,
    // remise, deal), on rattache l'écart au taux dominant plutôt que de le
    // perdre. Le chiffre d'affaires du journal doit égaler l'encaissement.
    const total = arrondi(c.total)
    const ecart = arrondi(total - ttcArticles - fraisLivraison)
    if (Math.abs(ecart) >= 0.01) {
      const dominant = Object.keys(parTaux).sort((a, b) => parTaux[b] - parTaux[a])[0] ?? tauxDefaut
      parTaux[dominant] = arrondi((parTaux[dominant] || 0) + ecart)
    }

    const parBon = arrondi(c.bon_cadeau_montant)
    const enLigne = c.paye_en_ligne ? arrondi(total - parBon) : 0
    lignes.push({
      date: (c.date_commande || c.created_at || '').slice(0, 10),
      type: 'Commande',
      canal: canalCommande(c),
      reference: c.numero_commande || String(c.id).slice(0, 8),
      total,
      parTaux,
      enLigne,
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
    const taux = r.tva_taux ?? tauxDefaut
    lignes.push({
      date: (r.date_rdv || '').slice(0, 10),
      type: 'Acompte RDV',
      canal: 'Rendez-vous',
      reference: r.numero_rdv || String(r.id).slice(0, 8),
      total: acompte,
      parTaux: { [taux]: acompte },
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
    for (const [taux, ttc] of Object.entries(l.parTaux)) {
      j.parTaux[taux] = arrondi((j.parTaux[taux] || 0) + ttc)
    }
  }
  return [...jours.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

// Tous les taux réellement rencontrés sur la période : les colonnes du fichier
// s'adaptent au commerce plutôt que d'imposer une grille figée.
export function tauxRencontres(lignes) {
  const s = new Set()
  for (const l of lignes) for (const t of Object.keys(l.parTaux)) s.add(Number(t))
  return [...s].sort((a, b) => a - b)
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

function entete({ commercant, du, au, assujetti, avertissementTaux }) {
  const l = [
    ligneCsv([`Export comptable Yoppaa - ${commercant?.nom || ''}`]),
    ligneCsv([`Periode du ${du} au ${au}`]),
    ligneCsv([`Numero d entreprise ${commercant?.bce || ''}`]),
    ligneCsv(['Document d aide a la comptabilite. Yoppaa n est pas un systeme de caisse enregistree certifie (SCE) : ce fichier ne remplace pas une caisse certifiee.']),
  ]
  if (!assujetti) l.push(ligneCsv(['Commerce non assujetti a la TVA : aucune ventilation n est calculee.']))
  if (avertissementTaux) l.push(ligneCsv(['Certaines transactions anterieures a la mise en place des taux utilisent le taux actuel de l article.']))
  l.push('')
  return l
}

export function csvJournal({ lignes, commercant, du, au, assujetti = true, avertissementTaux = false }) {
  const jours = journalParJour(lignes)
  const taux = assujetti ? tauxRencontres(lignes) : []
  const out = entete({ commercant, du, au, assujetti, avertissementTaux })

  const cols = ['Date', 'Nb transactions', 'CA TTC']
  for (const t of taux) cols.push(`Base ${t}%`, `TVA ${t}%`)
  cols.push('Encaisse en ligne', 'Encaisse au comptoir', 'Paye par bon cadeau', 'Frais Stripe', 'Net Stripe')
  out.push(ligneCsv(cols))

  const totaux = { nb: 0, total: 0, enLigne: 0, comptoir: 0, bonCadeau: 0, frais: 0, net: 0, base: {}, tva: {} }
  for (const j of jours) {
    const cells = [j.date, j.nb, nombre(j.total)]
    for (const t of taux) {
      const { base, tva } = ventiler(j.parTaux[t] || 0, t)
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
  const out = entete({ commercant, du, au, assujetti, avertissementTaux })

  const cols = ['Date', 'Type', 'Canal', 'Reference', 'Statut', 'Montant TTC']
  for (const t of taux) cols.push(`Base ${t}%`, `TVA ${t}%`)
  cols.push('Encaisse en ligne', 'Encaisse au comptoir', 'Paye par bon cadeau', 'Frais Stripe', 'Net Stripe')
  out.push(ligneCsv(cols))

  for (const l of lignes) {
    const cells = [l.date, l.type, l.canal, l.reference, l.statut, nombre(l.total)]
    for (const t of taux) {
      const { base, tva } = ventiler(l.parTaux[t] || 0, t)
      cells.push(nombre(base), nombre(tva))
    }
    cells.push(nombre(l.enLigne), nombre(l.comptoir), nombre(l.bonCadeau), nombre(l.fraisStripe), l.netStripe == null ? '' : nombre(l.netStripe))
    out.push(ligneCsv(cells))
  }

  return BOM + out.join('\r\n')
}
