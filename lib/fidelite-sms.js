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

// ⚠️ PAS D'EMOJI DANS UN SMS. Le 🟣 est arrivé chez Alex sous la forme d'un
// point d'interrogation (05/08) : l'opérateur transcode en alphabet GSM, qui
// ne connaît pas les emojis. Les accents français, eux, passent. Un message
// qui se termine par « ? » à la place de la signature fait douter de
// l'expéditeur, sur le canal où l'on se méfie le plus des liens.
const SIGNATURE = 'Yoppaa'

// Un SMS de fidélité n'est jamais urgent. Celui d'Alex est parti à 3h du
// matin, réveillé par le cron des rendez-vous honorés : il n'y a aucune raison
// d'écrire à quelqu'un la nuit pour lui dire qu'il a gagné 55 centimes.
// Hors plage, on n'envoie pas ET on ne consomme pas de crédit.
// ⚠️ formatToParts, PAS format. En français, `format()` sur une heure seule
// rend « 08 h » : le Number valait NaN, la comparaison était fausse, et AUCUN
// SMS ne serait plus jamais parti. Attrapé par le banc avant le déploiement,
// jamais par le build.
export function heureDecente(maintenant = new Date()) {
  const parts = new Intl.DateTimeFormat('fr-BE', {
    timeZone: 'Europe/Brussels', hour: '2-digit', hour12: false,
  }).formatToParts(maintenant)
  const h = Number(parts.find(p => p.type === 'hour')?.value)
  if (!Number.isFinite(h)) return false
  return h >= 8 && h < 21
}

// Le Yopper a-t-il un compte ? Alors il a déjà sa carte dans l'application, et
// lui envoyer un SMS payé par le commerçant ne lui apprend rien.
async function aUnCompte(supabase, email) {
  if (!email) return false
  const { data } = await supabase
    .from('clients').select('auth_user_id')
    .eq('email', String(email).toLowerCase())
    .maybeSingle()
  return !!data?.auth_user_id
}

// Envoie un SMS en consommant un crédit. Retourne { ok, raison? }.
async function envoyerAvecCredit(supabase, commercant, telephone, contenu) {
  if (!commercant?.fidelite_sms_actif) return { ok: false, raison: 'sms_desactives' }
  if (!telephone) return { ok: false, raison: 'sans_telephone' }
  if (!heureDecente()) return { ok: false, raison: 'heure_indue' }

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
export async function smsCarteCreee(supabase, commercant, carte, clientEmail = null) {
  if (!carte || carte.sms_creation_envoye) return { ok: false, raison: 'deja_envoye' }
  // Ce SMS existe pour donner un accès à qui n'en a pas. Quelqu'un qui a un
  // compte a déjà sa carte dans l'onglet Profil : le lui envoyer quand même,
  // c'est dépenser un crédit du commerçant pour lui apprendre ce qu'il sait.
  if (await aUnCompte(supabase, clientEmail)) return { ok: false, raison: 'a_un_compte' }
  const contenu = `${SIGNATURE} - ${commercant.nom} : ta carte de fidélité est ouverte. Suis tes points ici : ${BASE}/carte/${carte.token}`
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
//
// Celui-ci part MÊME si le Yopper a un compte, contrairement au précédent : la
// notification web n'arrive pas partout (Chrome sur iPhone ne la supporte pas),
// et rater l'annonce d'une récompense, c'est rater une visite en boutique.
export async function smsRecompenseDebloquee(supabase, commercant, carte) {
  if (!carte) return { ok: false, raison: 'sans_carte' }
  const contenu = `${SIGNATURE} - ${commercant.nom} : bravo, ta récompense est débloquée. ${libelleRecompense(commercant)}. À présenter lors de ton prochain passage : ${BASE}/carte/${carte.token}`
  return envoyerAvecCredit(supabase, commercant, carte.telephone, contenu)
}
