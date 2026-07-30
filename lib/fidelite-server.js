// lib/fidelite-server.js — crédit fidélité côté serveur (service_role only).
// Partagé entre /api/fidelite/crediter (commandes) et /api/cron/fidelite-rdv
// (RDV honorés de la veille). Idempotent : l'index unique de
// fidelite_mouvements (carte_id + commande_id / rdv_id) absorbe les doublons.

import { normaliserTelephone, appliquerCredit } from '@/lib/fidelite'

// Crédite une carte (créée à la volée si besoin) de façon idempotente.
// commercant = row complète (fidelite_*), credit = { passages? , montant? },
// refs = { source: 'commande'|'rdv', commande_id?, rdv_id? }.
export async function crediterFidelite(supabase, commercant, telephoneBrut, credit, refs) {
  const tel = normaliserTelephone(telephoneBrut)
  if (!tel) return { ok: false, reason: 'telephone_invalide' }

  // Carte existante ou création à la volée (23505 = course, on relit)
  let { data: carte, error: errSel } = await supabase
    .from('fidelite_cartes').select('*')
    .eq('commercant_id', commercant.id).eq('telephone', tel).maybeSingle()
  if (errSel) throw new Error(errSel.message)
  if (!carte) {
    const { data: nouvelle, error: errIns } = await supabase
      .from('fidelite_cartes')
      .insert({ commercant_id: commercant.id, telephone: tel })
      .select().single()
    if (errIns && errIns.code !== '23505') throw new Error(errIns.message)
    if (errIns) {
      const { data: relue } = await supabase.from('fidelite_cartes').select('*')
        .eq('commercant_id', commercant.id).eq('telephone', tel).maybeSingle()
      carte = relue
    } else {
      carte = nouvelle
    }
    if (!carte) return { ok: false, reason: 'carte_introuvable' }
    // SMS de création de carte : branché à l'étape 6 (Brevo)
  }

  // Anti-doublon AVANT le crédit : le mouvement porte la référence unique
  const estCagnotte = commercant.fidelite_mecanique === 'cagnotte'
  const { error: errMvt } = await supabase.from('fidelite_mouvements').insert({
    carte_id: carte.id,
    type: estCagnotte ? 'cagnotte' : 'passage',
    valeur: estCagnotte ? (credit.montant || 0) : 1,
    source: refs.source,
    commande_id: refs.commande_id || null,
    rdv_id: refs.rdv_id || null,
  })
  if (errMvt) {
    if (errMvt.code === '23505') return { ok: true, deja_credite: true }
    throw new Error(errMvt.message)
  }

  const { patch, debloquees } = appliquerCredit(commercant, carte, credit)
  const { error: errUp } = await supabase.from('fidelite_cartes').update(patch).eq('id', carte.id)
  if (errUp) throw new Error(errUp.message)

  if (debloquees > 0) {
    const mvts = Array.from({ length: debloquees }, () => ({
      carte_id: carte.id, type: 'recompense_debloquee', source: 'system',
    }))
    await supabase.from('fidelite_mouvements').insert(mvts)
    // SMS « carte pleine » : branché à l'étape 6 (Brevo)
  }
  return { ok: true, debloquees }
}
