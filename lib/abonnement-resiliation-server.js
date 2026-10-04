// lib/abonnement-resiliation-server.js — CE QU'UNE RÉSILIATION FAIT AUX SÉANCES
//
// 🔴 DEUX ROUTES RÉSILIENT DEPUIS LE 04/10 (Abo-I1) : « Résilier », et
// « Rembourser », qui résilie toujours (décision d'Alex). Les deux doivent
// annuler EXACTEMENT les mêmes séances, couper les mêmes rappels et prévenir
// les mêmes files. Deux copies auraient divergé au premier correctif : la
// règle vit ici, une fois.
//
// Le passage du contrat en « résilié » reste dans chaque route : c'est lui qui
// désigne le seul gagnant (deux clics, deux onglets), et chacune le pose sur
// ce qu'elle a lu.

import { annulerPush } from './onesignal'
import { creneauDejaCommence } from './timezone'
import { seancesAnnuleesParResiliation } from './abonnements'
import { prevenirLaFile } from './attente-rdv-server'

// Rend { ok, annulees, filePrevenue } ; en échec, { ok: false, etape } avec
// l'étape qui a cassé, pour que la route dise ce qui tient encore.
export async function annulerLesSeancesDuContrat(supabase, abonnementId) {
  // Les séances à venir, et seulement celles qui n'ont pas commencé.
  const { data: seances, error: errS } = await supabase
    .from('rdv_reservations')
    .select('id, prestation_id, date_rdv, heure_debut, statut, deleted_at, rappel_push_id')
    .eq('abonnement_id', abonnementId)
    .eq('statut', 'confirme')
    .is('deleted_at', null)
    .order('date_rdv', { ascending: true })
    .order('heure_debut', { ascending: true })
  if (errS) return { ok: false, etape: 'lecture', annulees: [], filePrevenue: 0 }

  const maintenant = Date.now()
  const aAnnuler = seancesAnnuleesParResiliation(seances, {
    dejaCommencee: (d, h) => creneauDejaCommence(d, h, maintenant),
  })

  let annulees = []
  if (aAnnuler.length > 0) {
    const { data: faites, error: errA } = await supabase
      .from('rdv_reservations')
      .update({ statut: 'annule_commercant', motif_annulation: 'resiliation' })
      .in('id', aAnnuler.map(s => s.id))
      .eq('statut', 'confirme')
      .select('id')
    if (errA) return { ok: false, etape: 'annulation', annulees: [], filePrevenue: 0 }
    const ids = new Set((faites || []).map(f => f.id))
    annulees = aAnnuler.filter(s => ids.has(s.id))
    // Les rappels de la veille ne partent plus pour des séances annulées.
    for (const s of annulees) {
      if (s.rappel_push_id) {
        const r = await annulerPush(s.rappel_push_id)
        if (!r?.ok) console.warn('[resiliation] rappel non annulé', s.id, r?.error)
      }
    }
  }

  // Chaque séance libérée prévient sa file. `prevenirLaFile` relit le cours,
  // les fermetures et la fiche, et ne programme rien après le début.
  // ⚠️ AU MIEUX : une file non prévenue ne défait pas la résiliation.
  let filePrevenue = 0
  for (const s of annulees) {
    if (!s.prestation_id) continue
    const file = await prevenirLaFile(supabase, {
      prestationId: s.prestation_id,
      dateRdv: s.date_rdv,
      heureDebut: String(s.heure_debut || '').slice(0, 5),
    })
    if (!file?.ok) console.error('[resiliation] liste d’attente non prévenue', s.id, file?.error)
    else filePrevenue += Number(file.prevenus) || 0
  }

  return { ok: true, annulees, filePrevenue }
}
