// POST /api/bons-cadeaux/confirmation
//
// Ce qu'il faut afficher à quelqu'un qui revient de Stripe après avoir acheté
// un bon. La clé est la SESSION STRIPE, jamais l'identifiant du bon : elle est
// écrite sur la ligne au moment du checkout, elle n'est connue que de la
// personne qui vient de payer, et elle ne désigne aucune ressource devinable.
//
// Service_role : `bons_cadeaux` n'a aucune lecture publique, et c'est voulu
// puisqu'un code de bon vaut de l'argent.
//
// Body : { session_id }
// → { ok: true, bon: { ... } } ou { ok: false, error }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { confirmationDepuisBon } from '@/lib/bons-cadeaux'
import { bonsLimiter, checkLimit, clientIp } from '@/lib/ratelimit'

export async function POST(request) {
  try {
    const rl = await checkLimit(bonsLimiter, clientIp(request),
      { cle: 'bon-confirmation', max: 20, fenetreMs: 60_000 })
    if (!rl.success) {
      return NextResponse.json({ ok: false, error: 'Trop de tentatives, réessaie dans une minute.' }, { status: 429 })
    }

    const { session_id: sessionId } = await request.json().catch(() => ({}))
    // Les identifiants de session Stripe s'écrivent `cs_test_…` / `cs_live_…`.
    // On refuse tout le reste plutôt que d'interroger la base avec n'importe
    // quelle chaîne venue de la barre d'adresse.
    if (!sessionId || typeof sessionId !== 'string' || !/^cs_[A-Za-z0-9_]{10,}$/.test(sessionId)) {
      return NextResponse.json({ ok: false, error: 'Référence de paiement invalide.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: bon, error } = await supabase
      .from('bons_cadeaux')
      // ⚠️ AUCUNE ADRESSE EMAIL NE SORT D'ICI, ni celle de l'acheteur ni celle
      // du bénéficiaire. L'écran n'en a pas besoin : le prénom suffit à dire à
      // qui le cadeau est parti, et il a été tapé par l'acheteur lui-même.
      .select('code, token, montant_initial, solde, statut, expires_at, destinataire_mode, beneficiaire_prenom, commercant:commercants(nom, slug, categorie)')
      .eq('stripe_session_id', sessionId)
      .maybeSingle()

    if (error) {
      console.error('[bons-cadeaux/confirmation] lecture KO', error)
      return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
    }
    if (!bon) {
      return NextResponse.json({ ok: false, error: 'Aucun bon ne correspond à ce paiement.' }, { status: 404 })
    }

    // La décision vit dans `lib/bons-cadeaux.js`, pure et donc mesurable : quel
    // achat a le droit de s'annoncer réussi, et si le code sort du serveur.
    const vue = confirmationDepuisBon(bon)
    if (!vue.ok) {
      return NextResponse.json({ ok: false, error: 'Ce bon n\'est plus valable.' }, { status: 409 })
    }

    return NextResponse.json({ ok: true, bon: vue.bon })
  } catch (e) {
    console.error('[bons-cadeaux/confirmation]', e)
    return NextResponse.json({ ok: false, error: 'Confirmation indisponible, réessaie.' }, { status: 500 })
  }
}
