// Dépôt d'un avis, côté serveur.
//
// POURQUOI CETTE ROUTE. La table `avis` acceptait l'insertion de n'importe qui,
// avec n'importe quel `client_id` : on pouvait signer un avis du nom d'un
// autre, ou noter un commerce où l'on n'a jamais mis les pieds. Aucune policy
// SQL ne pouvait l'empêcher, faute d'identité Supabase Auth pour un Yopper.
//
// Ce que le serveur vérifie, et que la base ne savait pas faire :
//   • l'auteur est celui du cookie, jamais celui annoncé par le navigateur ;
//   • il a une commande RÉCUPÉRÉE ou un rendez-vous HONORÉ chez ce commerce
//     (règle anti-troll : pas d'avis sans relation commerciale prouvée) ;
//   • il n'a pas déjà noté cette commande ;
//   • le débit est limité.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { lireIdentiteYopper } from '@/lib/yopper-session'
import { globalLimiter, checkLimit, clientIp } from '@/lib/ratelimit'

export async function POST(request) {
  try {
    const limite = await checkLimit(globalLimiter, clientIp(request))
    if (!limite.success) {
      return NextResponse.json({ ok: false, error: 'Trop de requêtes, réessaie dans un instant.' }, { status: 429 })
    }

    const identite = await lireIdentiteYopper()
    if (!identite?.client_id) {
      return NextResponse.json({ ok: false, error: 'Connecte-toi pour laisser un avis.' }, { status: 401 })
    }

    const { commercant_id, note, commentaire, commande_id, rdv_reservation_id } =
      await request.json().catch(() => ({}))

    const noteNum = Number(note)
    if (!commercant_id || !Number.isInteger(noteNum) || noteNum < 1 || noteNum > 5) {
      return NextResponse.json({ ok: false, error: 'Note invalide.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ── Relation commerciale prouvée ────────────────────────────────────────
    // On ne se fie pas au commande_id envoyé : on vérifie qu'il appartient
    // bien à cet email ET à ce commerce, et qu'il a été récupéré.
    let relationOk = false
    if (commande_id) {
      const { data: cmd } = await supabase
        .from('commandes')
        .select('id, client_email, commercant_id, recupere_at')
        .eq('id', commande_id)
        .maybeSingle()
      relationOk = !!cmd
        && cmd.commercant_id === commercant_id
        && !!cmd.recupere_at
        && String(cmd.client_email || '').toLowerCase() === String(identite.email || '').toLowerCase()
    }
    if (!relationOk && rdv_reservation_id) {
      const { data: rdv } = await supabase
        .from('rdv_reservations')
        .select('id, client_email, commercant_id, statut')
        .eq('id', rdv_reservation_id)
        .maybeSingle()
      relationOk = !!rdv
        && rdv.commercant_id === commercant_id
        && String(rdv.client_email || '').toLowerCase() === String(identite.email || '').toLowerCase()
    }
    if (!relationOk) {
      return NextResponse.json({
        ok: false,
        error: 'Un avis se laisse après une commande récupérée ou un rendez-vous honoré chez ce commerce.',
      }, { status: 403 })
    }

    // ── Pas deux avis pour la même commande ─────────────────────────────────
    if (commande_id) {
      const { data: deja } = await supabase
        .from('avis').select('id').eq('commande_id', commande_id).maybeSingle()
      if (deja) {
        return NextResponse.json({ ok: false, error: 'Tu as déjà donné ton avis sur cette commande.' }, { status: 409 })
      }
    }

    const { error } = await supabase.from('avis').insert({
      commercant_id,
      client_id: identite.client_id,   // l'auteur vient du cookie, pas du navigateur
      note: noteNum,
      commentaire: (commentaire || '').trim().slice(0, 1000) || null,
      commande_id: commande_id || null,
      rdv_reservation_id: rdv_reservation_id || null,
    })
    if (error) {
      console.error('[yopper/avis] insert KO', error)
      return NextResponse.json({ ok: false, error: 'Enregistrement impossible.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[yopper/avis]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
