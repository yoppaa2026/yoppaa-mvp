// POST /api/stripe/billing/checkout
//
// Crée une Stripe Checkout Session pour upgrader un commerçant vers
// Communiquer ou Vendre. Renvoie l'URL Stripe à laquelle rediriger.
//
// Body attendu : { commercantId: string, targetPlan: 'communiquer' | 'vendre' }
// Retour 200    : { url: string, session_id: string }
// Retour 4xx    : { error: string, code?: string }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCheckoutSession } from '@/lib/stripe-billing'
import { gardeCommercant } from '@/lib/api-auth'

// 🔴 LA GARDE VIENT DU POINT CENTRAL (22/09), comme sa jumelle du portail.
// Les deux routes de l'abonnement portaient chacune sa copie de l'adresse
// admin et sa propre vérification de propriété, écrites avant `api-auth.js`.
// Elles sont l'aller et le retour du même geste : on les ramène ensemble,
// sinon la seconde reste seule et devient celle qu'on oublie.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Config Supabase admin manquante')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req) {
  try {
    const supabase = getSupabaseAdmin()
    const body = await req.json()
    const { commercantId, targetPlan } = body || {}

    // Validation des inputs
    if (!commercantId || typeof commercantId !== 'string') {
      return NextResponse.json({ error: 'commercantId requis' }, { status: 400 })
    }
    if (!['communiquer', 'vendre'].includes(targetPlan)) {
      return NextResponse.json({
        error: 'targetPlan invalide (attendu communiquer ou vendre)',
      }, { status: 400 })
    }

    // ⚠️ LA GARDE D'ABORD, LA FICHE ENSUITE. L'administrateur y passe : il
    // ouvre la souscription d'un commerçant pour le dépanner au téléphone.
    const garde = await gardeCommercant(req, supabase, commercantId)
    if (!garde.ok) {
      return NextResponse.json({ error: garde.error }, { status: garde.status })
    }

    // Charger le commerçant
    const { data: commercant, error: errFetch } = await supabase
      .from('commercants')
      .select('*')
      .eq('id', commercantId)
      .maybeSingle()

    if (errFetch) {
      console.error('[checkout] erreur fetch commercant', errFetch)
      return NextResponse.json({ error: 'Erreur lecture commerçant' }, { status: 500 })
    }
    if (!commercant) {
      return NextResponse.json({ error: 'Commerçant introuvable' }, { status: 404 })
    }

    // Bloquer si subscription active existante : il doit passer par le portail
    //
    // ⚠️ CE MESSAGE EST LU PAR LE COMMERÇANT : il vouvoyait, parlait de « plan »
    // là où les écrans disent « formule », et nommait « portail client » un
    // bouton qui s'appelle « Gérer ma carte et mes factures ». Trois mots que
    // personne ne reconnaît sur son propre écran.
    if (commercant.subscription_status && ['active', 'trialing', 'past_due'].includes(commercant.subscription_status)) {
      return NextResponse.json({
        error: 'Tu as déjà un abonnement en cours : change de formule ou résilie depuis « Mon compte ».',
        code: 'already_subscribed',
      }, { status: 409 })
    }

    // Construire les URLs de retour
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'
    const returnUrl = `${appUrl}/dashboard/abonnement`
    const cancelUrl = `${appUrl}/dashboard/abonnement`

    // Créer la session Stripe
    const session = await createCheckoutSession({
      commercant,
      targetPlan,
      returnUrl,
      cancelUrl,
      trialDays: 30,
      supabaseAdmin: supabase,
    })

    return NextResponse.json({ url: session.url, session_id: session.id })

  } catch (e) {
    console.error('[api/stripe/billing/checkout]', e)
    return NextResponse.json({
      error: e?.message || 'Erreur lors de la création de la session de paiement',
    }, { status: 500 })
  }
}
