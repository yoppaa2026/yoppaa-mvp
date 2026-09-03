// lib/bons-cadeaux-server.js
//
// Helpers SERVEUR (service_role) du module Bons cadeaux.
// Idempotence structurelle : le mouvement est inséré AVANT de toucher le
// solde, protégé par les index uniques partiels (bon_id, commande_id) par
// source. Un webhook Stripe rejoué ne débite jamais deux fois (23505 absorbé),
// une annulation ne re-crédite jamais deux fois. Même pattern que la fidélité.

import { bonExpire, libelleBon, normaliserCodeBon, BONS_MAX_PAR_COMMANDE } from '@/lib/bons-cadeaux'
import { regimeBon, USAGE_MULTIPLE } from '@/lib/bons-tva'

// Charge et valide un bon pour une utilisation chez un commerçant donné.
// Retourne { ok, bon } ou { ok: false, error } avec un message user-facing.
// ⚠️ `categorie` NOMME LE BON DANS LES DEUX REFUS : ils remontent tels quels
// jusqu'à l'écran du client, ce ne sont pas des messages internes.
export async function chargerBonValide(supabase, { code, commercant_id, categorie = null }) {
  const { data: bon, error } = await supabase
    .from('bons_cadeaux')
    .select('id, commercant_id, code, montant_initial, solde, statut, expires_at, beneficiaire_prenom, acheteur_prenom')
    .eq('code', code)
    .maybeSingle()
  if (error) return { ok: false, error: 'Vérification impossible, réessaie dans un instant.' }
  if (!bon || bon.commercant_id !== commercant_id) {
    // Même message que le code inconnu : ne pas confirmer l'existence d'un
    // bon d'un autre commerce (le code = de l'argent).
    return { ok: false, error: 'Code inconnu chez ce commerçant.' }
  }
  if (bon.statut !== 'actif') return { ok: false, error: 'Ce bon n\'est pas (encore) actif.' }
  if (bonExpire(bon)) return { ok: false, error: `Ce ${libelleBon(categorie)} a expiré.` }
  if (Number(bon.solde) <= 0) return { ok: false, error: `Ce ${libelleBon(categorie)} est déjà entièrement utilisé.` }
  return { ok: true, bon }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUSIEURS BONS SUR UNE MÊME COMMANDE (01/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CES DEUX BOUCLES VIVENT ICI, ET NULLE PART AILLEURS. Cinq endroits
// débitent ou recréditent un bon : `create-commande`, le webhook Stripe,
// l'annulation d'une commande, celle d'un rendez-vous et le no-show. Cinq
// boucles écrites à la main auraient divergé à la première correction — c'est
// le motif qui a produit le plus de défauts sur ce projet.
//
// ✅ ET L'IDEMPOTENCE TIENT SANS RIEN CHANGER EN BASE : les index uniques
// portent sur la PAIRE `(bon_id, commande_id)` et `(bon_id, rdv_id)`, pas sur
// la commande seule. Trois bons sur une même commande font donc trois lignes
// distinctes, et un webhook rejoué ne double toujours rien. Vérifié dans
// `MIGRATION_BONS_CADEAUX.sql` avant d'écrire une seule ligne : si l'index
// avait porté sur la commande seule, le deuxième bon aurait été pris pour un
// rejeu et JAMAIS débité, en silence.
//
// ⚠️ `bons_utilises` FAIT FOI, et il n'y a pas de repli sur `bon_cadeau_id` :
// la migration du 01/09 a rempli toutes les lignes existantes, et son contrôle
// l'a prouvé. Un repli ici recréerait deux sources de vérité.

/**
 * Charge et valide TOUS les codes reçus par une route de paiement.
 *
 * 🔴 CETTE VALIDATION VIT ICI DEPUIS QUE LE RENDEZ-VOUS CUMULE AUSSI (01/09).
 * Elle n'existait que dans `create-commande`. La recopier dans les trois routes
 * de réservation aurait fait quatre copies d'une règle d'argent, et la première
 * correction n'en aurait touché qu'une : c'est exactement ce qui s'est produit
 * le 30/08 avec `rendreAvantages`, écrit deux fois, corrigé trois fois d'un
 * seul côté.
 *
 * ⚠️ ELLE ACCEPTE L'ANCIENNE FORME AU SINGULIER. Les écrans et le serveur ne se
 * déploient pas à la seconde près : une requête déjà partie avec
 * `bon_cadeau_code` ne doit pas se voir refuser sa réservation.
 *
 * @returns {{ok: true, bons: Array}} ou {{ok: false, error: string, status: number}}
 */
export async function chargerBonsValides(supabase, { codes = [], codeUnique = null, commercant_id, categorie = null } = {}) {
  const recus = Array.isArray(codes) && codes.length > 0
    ? codes
    : (codeUnique ? [codeUnique] : [])
  if (recus.length === 0) return { ok: true, bons: [] }

  if (recus.length > BONS_MAX_PAR_COMMANDE) {
    return { ok: false, status: 400, error: `Cinq ${libelleBon(categorie, { pluriel: true })} au maximum par commande.` }
  }

  // ⚠️ LES DOUBLONS SONT REFUSÉS, PAS DÉDUPLIQUÉS EN SILENCE. Le même code
  // envoyé deux fois compterait son solde deux fois : c'est une erreur à dire,
  // pas à rattraper sans le signaler.
  const normalises = []
  for (const brut of recus) {
    const code = normaliserCodeBon(brut)
    if (!code) return { ok: false, status: 400, error: `Code de ${libelleBon(categorie)} invalide.` }
    if (normalises.includes(code)) {
      return { ok: false, status: 400, error: `Le même ${libelleBon(categorie)} est proposé deux fois.` }
    }
    normalises.push(code)
  }

  // 🔴 CHAQUE BON EST REVALIDÉ CÔTÉ SERVEUR : l'écran propose, le serveur
  // décide. Un seul code invalide fait échouer toute la réservation, plutôt que
  // d'en appliquer trois sur quatre sans le dire.
  const bons = []
  for (const code of normalises) {
    const res = await chargerBonValide(supabase, { code, commercant_id, categorie })
    if (!res.ok) return { ok: false, status: 400, error: res.error, bon_refuse: true }
    bons.push(res.bon)
  }
  return { ok: true, bons }
}

// Détaille ce qui a échoué au lieu de rendre un simple faux : un appelant qui
// ne sait pas QUEL bon n'a pas été débité ne peut ni le rejouer, ni le dire.
function boucler(nom, resultats) {
  const echecs = resultats.filter(r => !r.ok)
  return { ok: echecs.length === 0, nom, resultats, echecs }
}

/**
 * Débite tous les bons d'une commande ou d'un rendez-vous.
 * @param {Array<{id, montant}>} bonsUtilises La colonne `bons_utilises`.
 */
export async function debiterBons(supabase, bonsUtilises, refs) {
  const liste = Array.isArray(bonsUtilises) ? bonsUtilises : []
  const resultats = []
  for (const l of liste) {
    // ⚠️ UNE LIGNE BANCALE EST UN ÉCHEC NOMMÉ, jamais un tour de boucle sauté
    // en silence : c'est de l'argent qui ne serait pas débité.
    if (!l?.id || !(Number(l.montant) > 0)) {
      resultats.push({ ok: false, error: 'ligne de bon invalide', id: l?.id ?? null })
      continue
    }
    const r = await debiterBon(supabase, l.id, l.montant, refs)
    resultats.push({ ...r, id: l.id, montant: Number(l.montant) })
  }
  return boucler('debiterBons', resultats)
}

/**
 * Recrédite tous les bons d'une commande ou d'un rendez-vous annulés.
 *
 * 🔴 C'EST CETTE BOUCLE QUI JUSTIFIAIT TOUTE LA MIGRATION. Sans la liste, une
 * annulation n'aurait rendu QUE le premier bon : les autres auraient été
 * débités et jamais rendus. C'est le défaut du 29/08, « bon jamais recrédité ».
 */
export async function recrediterBons(supabase, bonsUtilises, refs = {}) {
  const liste = Array.isArray(bonsUtilises) ? bonsUtilises : []
  const resultats = []
  for (const l of liste) {
    if (!l?.id || !(Number(l.montant) > 0)) {
      resultats.push({ ok: false, error: 'ligne de bon invalide', id: l?.id ?? null })
      continue
    }
    const r = await recrediterBon(supabase, l.id, l.montant, refs)
    resultats.push({ ...r, id: l.id, montant: Number(l.montant) })
  }
  return boucler('recrediterBons', resultats)
}

// Débite `montant` (> 0) du bon.
// refs : { source: 'commande'|'comptoir'|'rdv', commande_id?, rdv_id? }
//
// ⚠️ UNE SEULE CIBLE À LA FOIS, et la base le fait respecter depuis le 28/08
// (contrainte `bons_cadeaux_mouvements_une_cible`). Un mouvement qui
// désignerait à la fois une commande et un rendez-vous rendrait impossible de
// savoir lequel a réellement consommé l'argent.
//
// Retourne { ok, deja_debite } — deja_debite=true si le mouvement existait (rejeu).
export async function debiterBon(supabase, bonId, montant, refs) {
  const m = Math.round(Number(montant) * 100) / 100
  if (!(m > 0)) return { ok: false, error: 'montant invalide' }

  const { error: errMvt } = await supabase.from('bons_cadeaux_mouvements').insert({
    bon_id: bonId,
    montant: -m,
    source: refs.source,
    commande_id: refs.commande_id || null,
    rdv_id: refs.rdv_id || null,
  })
  if (errMvt) {
    if (errMvt.code === '23505') return { ok: true, deja_debite: true }
    return { ok: false, error: errMvt.message }
  }

  const { data: bon } = await supabase.from('bons_cadeaux').select('solde').eq('id', bonId).single()
  const nouveauSolde = Math.max(0, Math.round((Number(bon?.solde || 0) - m) * 100) / 100)
  const { error: errUp } = await supabase
    .from('bons_cadeaux')
    .update({ solde: nouveauSolde, updated_at: new Date().toISOString() })
    .eq('id', bonId)
  if (errUp) return { ok: false, error: errUp.message }
  return { ok: true, deja_debite: false, solde: nouveauSolde }
}

// Re-crédite le bon après annulation ou remboursement.
// refs : { commande_id? , rdv_id? } — une seule des deux.
// Idempotent via les index uniques partiels source='annulation'.
//
// ⚠️ LA SIGNATURE A CHANGÉ LE 28/08 : le quatrième argument était l'identifiant
// NU de la commande, il est désormais un objet, le rendez-vous pouvant lui
// aussi porter un bon. Les DEUX appelants ont été relus et corrigés dans le
// même commit (`/api/commande/cancel` et le webhook Stripe) : un identifiant
// passé nu se serait retrouvé ignoré, et le bon jamais recrédité, EN SILENCE.
export async function recrediterBon(supabase, bonId, montant, refs = {}) {
  const m = Math.round(Number(montant) * 100) / 100
  if (!(m > 0)) return { ok: true, rien: true }
  // Garde de contrat : un appelant resté à l'ancienne forme est une ERREUR
  // visible, jamais un re-crédit silencieusement orphelin.
  if (typeof refs === 'string') {
    return { ok: false, error: 'recrediterBon attend { commande_id } ou { rdv_id }' }
  }

  const { error: errMvt } = await supabase.from('bons_cadeaux_mouvements').insert({
    bon_id: bonId,
    montant: m,
    source: 'annulation',
    commande_id: refs.commande_id || null,
    rdv_id: refs.rdv_id || null,
  })
  if (errMvt) {
    if (errMvt.code === '23505') return { ok: true, deja_recredite: true }
    return { ok: false, error: errMvt.message }
  }

  const { data: bon } = await supabase.from('bons_cadeaux').select('solde, montant_initial').eq('id', bonId).single()
  const plafond = Number(bon?.montant_initial || m)
  const nouveauSolde = Math.min(plafond, Math.round((Number(bon?.solde || 0) + m) * 100) / 100)
  const { error: errUp } = await supabase
    .from('bons_cadeaux')
    .update({ solde: nouveauSolde, updated_at: new Date().toISOString() })
    .eq('id', bonId)
  if (errUp) return { ok: false, error: errUp.message }
  return { ok: true, solde: nouveauSolde }
}

// ─── LE RÉGIME DE TVA À APPLIQUER À UN BON, DÉDUIT DU COMMERCE ──────────────
//
// 🔴 ÉCRIT LE 03/09, PARCE QUE LA VENTE D'UN BON N'ÉCRIVAIT RIEN. Le régime se
// décide au moment de la vente et se fige sur le bon : la règle vit dans
// `lib/bons-tva.js`, cette fonction ne fait que lui apporter la matière.
//
// ⚠️ ON LIT LE CATALOGUE, PAS UN RÉGLAGE. Le régime n'est pas une préférence,
// c'est un fait : un commerce qui ne vend qu'à un seul taux émet des bons à
// usage unique, que son gérant le sache ou non. `bons_tva_regime` ne sert qu'à
// corriger une déduction fausse.
//
// ⚠️ ET UNE LECTURE QUI ÉCHOUE NE DOIT PAS BLOQUER UNE VENTE. Sans catalogue
// lisible, on retombe sur les usages multiples, c'est-à-dire sur ce que le
// journal a toujours fait : la TVA à l'utilisation. Aucune régression possible.
export async function regimeBonPourCommerce(supabase, commercant) {
  const id = commercant?.id
  if (!id) return { regime: USAGE_MULTIPLE, taux: null }
  try {
    const [{ data: articles }, { data: prestations }] = await Promise.all([
      supabase.from('articles').select('tva_taux').eq('commercant_id', id),
      supabase.from('prestations').select('tva_taux').eq('commercant_id', id),
    ])
    return regimeBon({
      tauxDefaut: commercant.tva_taux_defaut,
      tauxArticles: (articles || []).map(a => a?.tva_taux),
      tauxPrestations: (prestations || []).map(p => p?.tva_taux),
      regimeChoisi: commercant.bons_tva_regime,
    })
  } catch (e) {
    console.error('[bons-cadeaux] regime TVA illisible, repli usages multiples', e?.message, { id })
    return { regime: USAGE_MULTIPLE, taux: null }
  }
}
