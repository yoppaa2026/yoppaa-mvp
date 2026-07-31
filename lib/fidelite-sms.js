// lib/fidelite-sms.js
//
// Envoi des SMS de fidélité (B.6 étape 6). Toute la logique de garde est ici :
//   1. le commerçant a activé les SMS (fidelite_sms_actif)
//   2. il lui reste des crédits (décompte ATOMIQUE via RPC, sinon on pourrait
//      envoyer un SMS non facturé = de l'argent perdu par Yoppaa)
//   3. l'envoi Brevo réussit, sinon on REND le crédit
//
// Best-effort : un SMS qui ne part pas ne doit JAMAIS casser la transaction
// métier (crédit de fidélité, création de carte). L'appelant ignore le retour.

import { envoyerSms } from '@/lib/brevo'
import { libelleRecompense } from '@/lib/fidelite'

const BASE = 'https://www.yoppaa.app'

// Envoie un SMS en consommant un crédit. Retourne { ok, raison? }.
async function envoyerAvecCredit(supabase, commercant, telephone, contenu) {
  if (!commercant?.fidelite_sms_actif) return { ok: false, raison: 'sms_desactives' }
  if (!telephone) return { ok: false, raison: 'sans_telephone' }

  const { data: restant, error: errRpc } = await supabase
    .rpc('consommer_sms_credit', { p_commercant_id: commercant.id })
  if (errRpc) {
    console.error('[fidelite-sms] RPC crédit KO', errRpc.message)
    return { ok: false, raison: 'rpc_ko' }
  }
  if (restant === null || restant < 0) return { ok: false, raison: 'plus_de_credits' }

  try {
    await envoyerSms({ to: telephone, contenu })
    return { ok: true, restant }
  } catch (e) {
    console.error('[fidelite-sms] envoi Brevo KO, crédit rendu', e?.message)
    await supabase.rpc('rendre_sms_credit', { p_commercant_id: commercant.id }).catch(() => {})
    return { ok: false, raison: 'brevo_ko' }
  }
}

// SMS 1 : la carte vient d'être créée. C'est LE moment qui fait exister la
// carte pour le client (il ne l'a demandée nulle part), d'où le lien vers sa
// page personnelle. Envoyé une seule fois (flag sms_creation_envoye).
export async function smsCarteCreee(supabase, commercant, carte) {
  if (!carte || carte.sms_creation_envoye) return { ok: false, raison: 'deja_envoye' }
  const contenu = `${commercant.nom} : ta carte de fidélité est ouverte 🟣 Suis tes points ici : ${BASE}/carte/${carte.token}`
  const res = await envoyerAvecCredit(supabase, commercant, carte.telephone, contenu)
  if (res.ok) {
    await supabase.from('fidelite_cartes')
      .update({ sms_creation_envoye: true })
      .eq('id', carte.id)
  }
  return res
}

// SMS 2 : une récompense vient d'être débloquée. Le SMS le plus rentable du
// programme : il fait revenir le client.
export async function smsRecompenseDebloquee(supabase, commercant, carte) {
  if (!carte) return { ok: false, raison: 'sans_carte' }
  const contenu = `${commercant.nom} : bravo, ta récompense est débloquée 🟣 ${libelleRecompense(commercant)}. À présenter lors de ton prochain passage : ${BASE}/carte/${carte.token}`
  return envoyerAvecCredit(supabase, commercant, carte.telephone, contenu)
}
