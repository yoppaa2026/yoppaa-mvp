// POST /api/emails/rdv-honore
//
// Quand le commercant marque un RDV comme 'honore', envoie 2 emails au Yopper
// SI rdv_fidelite_actif = true sur le commercant :
//   1. emailFideliteProgression (a chaque progres)
//   2. emailFideliteRecompenseDebloquee (si seuil atteint, distinct)
//
// Lit la progression depuis rdv_fidelite_progression (table maj par trigger).
//
// Body : { rdv_id: UUID }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailFideliteProgression, emailFideliteRecompenseDebloquee } from '@/lib/resend'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json()
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, client_email, client_prenom, client_id,
        commercant:commercants(id, nom, slug, rdv_fidelite_actif, rdv_fidelite_seuil, rdv_fidelite_pourcent)
      `)
      .eq('id', rdv_id)
      .single()

    if (!rdv?.client_email || !rdv.commercant?.rdv_fidelite_actif) {
      return NextResponse.json({ ok: true, skipped: 'no_fidelite' })
    }

    const seuil = rdv.commercant.rdv_fidelite_seuil || 10
    const pourcent = rdv.commercant.rdv_fidelite_pourcent || 10

    // Cherche la progression actuelle (trigger DB l'a deja incremente)
    let nbRdvActuels = 0
    if (rdv.client_id) {
      const { data: prog } = await supabase
        .from('rdv_fidelite_progression')
        .select('nb_rdv_total')
        .eq('client_id', rdv.client_id)
        .eq('commercant_id', rdv.commercant.id)
        .maybeSingle()
      nbRdvActuels = prog?.nb_rdv_total || 0
    }

    // 1) Email progression (toujours envoye)
    try {
      const html = emailFideliteProgression({
        yopper_prenom:       rdv.client_prenom || 'Yopper',
        commercant_nom:      rdv.commercant.nom,
        commercant_slug:     rdv.commercant.slug,
        points_actuels:      nbRdvActuels,
        seuil,
        pourcent_recompense: pourcent,
      })
      await envoyerAuCommercant({
        to: rdv.client_email,
        subject: `Ta fidélité chez ${rdv.commercant.nom} progresse — ${nbRdvActuels}/${seuil} ⭐`,
        html,
      })
    } catch (e) {
      console.error('[emails/rdv-honore] envoi progression KO', e?.message)
    }

    // 2) Email recompense debloquee (seulement si seuil pile atteint a CE rdv)
    if (nbRdvActuels === seuil) {
      try {
        const html = emailFideliteRecompenseDebloquee({
          yopper_prenom:       rdv.client_prenom || 'Yopper',
          commercant_nom:      rdv.commercant.nom,
          commercant_slug:     rdv.commercant.slug,
          pourcent_recompense: pourcent,
          code_promo:          null,  // a generer en STRIPE-10 + module fidelite complet
        })
        await envoyerAuCommercant({
          to: rdv.client_email,
          subject: `🎉 Tu as débloqué une réduction de ${pourcent}% chez ${rdv.commercant.nom}`,
          html,
        })
      } catch (e) {
        console.error('[emails/rdv-honore] envoi recompense KO', e?.message)
      }
    }

    return NextResponse.json({ ok: true, nb_rdv_actuels: nbRdvActuels, seuil, recompense_debloquee: nbRdvActuels === seuil })
  } catch (e) {
    console.error('[api/emails/rdv-honore]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
