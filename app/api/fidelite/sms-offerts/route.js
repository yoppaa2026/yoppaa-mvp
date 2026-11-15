// POST /api/fidelite/sms-offerts
//
// Les 25 SMS de bienvenue, donnés UNE SEULE FOIS par commerce, à la première
// activation du programme de fidélité.
//
// 🔴 POURQUOI UNE ROUTE (audit du 15/11). Le cadeau était écrit par l'écran
// (`fidelite_sms_credits: 25` dans la mise à jour du commerce), donc :
//   • le solde de SMS s'écrivait depuis le navigateur : un commerçant pouvait
//     s'offrir des milliers de SMS depuis la console, et Brevo les facture à
//     Yoppaa ;
//   • « une seule fois » n'était tenu par rien : désactiver puis réactiver la
//     fidélité avec un solde à zéro redonnait 25 SMS, sans fin.
// Le verrou SQL ferme désormais le solde au navigateur
// (`MIGRATION_VERROU_CREDITS_SMS_15_11.sql`), et le cadeau passe par
// `offrir_sms_bienvenue`, qui ne donne rien si `fidelite_sms_offerts_at` est
// déjà rempli. Deux clics simultanés ne donnent donc pas 50 SMS.
//
// ⚠️ LA GARDE DE FORFAIT EST CELLE DE LA CRÉATION D'UNE CARTE (`fidelite`) :
// offrir des SMS à un commerce qui ne peut pas ouvrir de carte n'a pas d'objet.
//
// Réponse : { ok: true, offerts: 25, solde } quand le cadeau part,
//           { ok: true, offerts: 0 } quand il a déjà été donné.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeCommercant } from '@/lib/api-auth'
import { verdictForfait } from '@/lib/garde-forfait'
import { SMS_BIENVENUE, etatCadeauSms } from '@/lib/packs-sms'

export async function POST(request) {
  try {
    const { commercant_id } = await request.json().catch(() => ({}))
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commerçant inconnu' }, { status: 400 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const garde = await gardeCommercant(request, admin, commercant_id)
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })

    const { data: com } = await admin
      .from('commercants')
      // ⚠️ `plan`, `essai_plan` ET `created_at` : la garde de forfait en dépend.
      .select('id, fidelite_actif, fidelite_sms_offerts_at, plan, essai_plan, created_at')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })

    const verdict = verdictForfait(com, 'fidelite')
    const etat = etatCadeauSms(com, verdict)
    if (etat === 'refus_forfait') {
      return NextResponse.json(
        { ok: false, error: verdict.message, code: verdict.code, plan_requis: verdict.plan_requis },
        { status: verdict.statut }
      )
    }
    // Le cadeau suit l'activation : jamais avant que le programme soit allumé.
    if (etat === 'inactif') {
      return NextResponse.json({ ok: false, error: 'Active d’abord ton programme de fidélité.', code: 'fidelite_inactive' }, { status: 409 })
    }
    if (etat === 'deja') return NextResponse.json({ ok: true, offerts: 0 })

    const { data: solde, error } = await admin.rpc('offrir_sms_bienvenue', {
      p_commercant_id: commercant_id,
      p_nb: SMS_BIENVENUE,
    })
    if (error) {
      console.error('[fidelite/sms-offerts] RPC KO', error.message)
      return NextResponse.json({ ok: false, error: 'Les SMS offerts n’ont pas pu être ajoutés. Réessaie plus tard.' }, { status: 500 })
    }
    // -1 : un autre appel est passé juste avant (ou le cadeau était déjà donné).
    if (solde === -1) return NextResponse.json({ ok: true, offerts: 0 })
    return NextResponse.json({ ok: true, offerts: SMS_BIENVENUE, solde })
  } catch (e) {
    console.error('[fidelite/sms-offerts]', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
