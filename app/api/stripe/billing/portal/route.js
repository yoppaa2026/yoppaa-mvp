// POST /api/stripe/billing/portal
//
// Crée une Stripe Customer Portal Session pour qu'un commerçant gère son
// abonnement (changer CB, switch plan, résilier, télécharger ses factures).
//
// Body attendu : { commercantId: string }
// Header requis : Authorization: Bearer <supabase_access_token>
// Retour 200    : { url: string }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createCustomerPortalSession } from '@/lib/stripe-billing'
import { gardeCommercant } from '@/lib/api-auth'

// 🔴 LA GARDE VIENT DU POINT CENTRAL (22/09). Cette route portait sa PROPRE
// copie de l'adresse admin et sa propre vérification de propriété, écrites
// avant `lib/api-auth.js`. Deux défauts dans le même paragraphe : une
// vingt-neuvième copie de l'adresse à retrouver le jour où elle change, et une
// garde qui devait réapprendre seule tout ce que l'autre avait déjà appris.
//
// ⚠️ ET C'EST LE FRÈRE DE CELUI DU 22/09, trouvé en cherchant où le commerçant
// saisit sa carte. Cinq routes avaient été ramenées au point central ce
// jour-là ; celle-ci n'était pas dans la liste, et c'est justement LA route de
// l'argent. Un relevé qui s'arrête aux routes qu'on a sous les yeux laisse
// toujours la sixième.
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Config Supabase admin manquante')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { commercantId } = body || {}
    if (!commercantId || typeof commercantId !== 'string') {
      return NextResponse.json({ error: 'commercantId requis' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // ⚠️ L'ADMINISTRATEUR PASSE, C'EST SON MÉTIER : il ouvre le portail d'un
    // commerçant pour le dépanner au téléphone. `gardeCommercant` le sait déjà.
    const garde = await gardeCommercant(req, supabase, commercantId)
    if (!garde.ok) {
      return NextResponse.json({ error: garde.error }, { status: garde.status })
    }

    // ⚠️ LA FICHE EST RELUE APRÈS LA GARDE, et seulement ce dont Stripe a
    // besoin. La garde a déjà refusé si elle n'existe pas.
    const { data: commercant, error: errFetch } = await supabase
      .from('commercants')
      .select('id, stripe_customer_id, nom')
      .eq('id', commercantId)
      .maybeSingle()
    if (errFetch || !commercant) {
      return NextResponse.json({ error: 'Commerçant introuvable' }, { status: 404 })
    }

    if (!commercant.stripe_customer_id) {
      // ⚠️ CE MESSAGE EST LU PAR LE COMMERÇANT, dans un toast : il vouvoyait
      // alors que tout le reste du produit tutoie, et il parlait de « plan »
      // quand les écrans disent « formule ». Il dit maintenant ce qui manque
      // ET le geste, parce qu'il tombe précisément sur qui cherchait où mettre
      // sa carte avant d'avoir pris quoi que ce soit.
      return NextResponse.json({
        error: 'Tu n’as pas encore d’abonnement : choisis d’abord ta formule.',
      }, { status: 409 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'
    const returnUrl = `${appUrl}/dashboard/abonnement`

    const session = await createCustomerPortalSession({ commercant, returnUrl })

    return NextResponse.json({ url: session.url })

  } catch (e) {
    console.error('[api/stripe/billing/portal]', e)
    return NextResponse.json({
      error: e?.message || 'Erreur lors de la création de la session portail',
    }, { status: 500 })
  }
}
