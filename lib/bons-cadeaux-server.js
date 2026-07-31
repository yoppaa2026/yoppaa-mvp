// lib/bons-cadeaux-server.js
//
// Helpers SERVEUR (service_role) du module Bons cadeaux.
// Idempotence structurelle : le mouvement est inséré AVANT de toucher le
// solde, protégé par les index uniques partiels (bon_id, commande_id) par
// source. Un webhook Stripe rejoué ne débite jamais deux fois (23505 absorbé),
// une annulation ne re-crédite jamais deux fois. Même pattern que la fidélité.

import { bonExpire } from '@/lib/bons-cadeaux'

// Charge et valide un bon pour une utilisation chez un commerçant donné.
// Retourne { ok, bon } ou { ok: false, error } avec un message user-facing.
export async function chargerBonValide(supabase, { code, commercant_id }) {
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
  if (bonExpire(bon)) return { ok: false, error: 'Ce bon cadeau a expiré.' }
  if (Number(bon.solde) <= 0) return { ok: false, error: 'Ce bon cadeau est déjà entièrement utilisé.' }
  return { ok: true, bon }
}

// Débite `montant` (> 0) du bon. refs : { source: 'commande'|'comptoir', commande_id? }
// Retourne { ok, deja_debite } — deja_debite=true si le mouvement existait (rejeu).
export async function debiterBon(supabase, bonId, montant, refs) {
  const m = Math.round(Number(montant) * 100) / 100
  if (!(m > 0)) return { ok: false, error: 'montant invalide' }

  const { error: errMvt } = await supabase.from('bons_cadeaux_mouvements').insert({
    bon_id: bonId,
    montant: -m,
    source: refs.source,
    commande_id: refs.commande_id || null,
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

// Re-crédite le bon après annulation/remboursement d'une commande.
// Idempotent via l'index unique partiel source='annulation'.
export async function recrediterBon(supabase, bonId, montant, commandeId) {
  const m = Math.round(Number(montant) * 100) / 100
  if (!(m > 0)) return { ok: true, rien: true }

  const { error: errMvt } = await supabase.from('bons_cadeaux_mouvements').insert({
    bon_id: bonId,
    montant: m,
    source: 'annulation',
    commande_id: commandeId || null,
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
