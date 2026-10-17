// ─── CE QUI SUIT UNE RÉSERVATION SANS PAIEMENT, CÔTÉ SERVEUR (17/10) ─────────
//
// 🔴 AUDIT DU 17/10, AVANT CENTRE RESPIRE (Audit 2 I13, ouvert depuis le
// 03/10). Une réservation gratuite, une séance d'abonnement, un rendez-vous
// que des bons paient entièrement : le serveur créait le rendez-vous, puis
// c'était le NAVIGATEUR qui demandait l'email de confirmation et le rappel
// d'une heure. Un onglet fermé pendant l'attente, un téléphone qui passe en
// veille, une 4G qui coupe : la réservation existe, et ni le client ni le
// commerçant n'en reçoivent un mot. Un invité n'a alors AUCUN lien pour
// annuler en ligne.
//
// Le serveur s'en charge maintenant, APRÈS avoir répondu (`after`) : le client
// n'attend pas l'envoi d'un email pour voir son écran de confirmation.
//
// ⚠️ LA ROUTE D'EMAIL EST APPELÉE TELLE QUELLE, sans passer par le réseau :
// c'est le même code, avec ses gardes et ses bancs, et aucun appel HTTP vers
// soi-même que la protection du site d'essai bloquerait. Sans jeton dans la
// requête, elle envoie une simple confirmation (jamais un déplacement).
// ⚠️ LE RAPPEL EST IDEMPOTENT (`programmerRappelRdv` saute un rappel déjà posé).

import { after } from 'next/server'
import { programmerRappelRdv } from '@/lib/rappels'
import { POST as envoyerConfirmationRdv } from '@/app/api/emails/rdv-confirme/route'

export function confirmerApresReponse(db, rdvId) {
  if (!db || !rdvId) return
  after(async () => {
    try {
      await programmerRappelRdv(rdvId, db)
    } catch (e) {
      console.error('[apres-reservation] rappel KO', { rdvId, error: e?.message || String(e) })
    }
    try {
      const res = await envoyerConfirmationRdv(new Request('https://yoppaa.app/api/emails/rdv-confirme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rdv_id: rdvId }),
      }))
      if (!res?.ok) console.error('[apres-reservation] email KO', { rdvId, status: res?.status })
    } catch (e) {
      console.error('[apres-reservation] email KO', { rdvId, error: e?.message || String(e) })
    }
  })
}
