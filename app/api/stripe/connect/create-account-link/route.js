// POST /api/stripe/connect/create-account-link
//
// Crée (ou récupère) un compte Connect Express pour un commerçant + génère un
// Account Link Stripe-hosted pour le faire onboarder.
//
// Flow attendu :
//   1. Commerçant clique "Connecter Stripe" dans son dashboard config RDV
//   2. FE POST sur cette route avec commercant_id
//   3. Backend : si pas de stripe_account_id sur le commerçant, on crée un account Express
//   4. Backend : on génère un account_link (URL one-shot Stripe-hosted)
//   5. FE redirect le commerçant vers cette URL
//   6. Commerçant fait son onboarding (IBAN, ID, adresse — 5 min)
//   7. Stripe redirect vers return_url (= dashboard config Yoppaa)
//   8. À l'arrivée, FE POST sur /api/stripe/connect/refresh-status pour update les flags
//      OU webhook account.updated nous notifie automatiquement
//
// Auth : commerçant connecté (auth Supabase) + ownership check sur commercant_id.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, requireStripe, STRIPE_CONFIG } from '@/lib/stripe'
import { verdictForfait } from '@/lib/garde-forfait'
import { comptePerdu, detachementCompte, naissanceCompte } from '@/lib/stripe-mode'

export async function POST(request) {
  try {
    requireStripe()

    const { commercant_id } = await request.json()
    if (!commercant_id) {
      return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    }

    // Auth : token JWT du commerçant connecté
    const authHeader = request.headers.get('authorization') || ''
    const accessToken = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) {
      return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })
    }

    // Ownership : le user doit être le commerçant (auth_user_id match)
    const { data: commercant, error: errC } = await supabase
      .from('commercants')
      // ⚠️ `plan`, `essai_plan` ET `created_at` : sans ces trois colonnes la
      // garde de forfait ci-dessous se trompe EN SILENCE (voir COLONNES_GARDE).
      // ⚠️ `stripe_account_mode` : sans elle, `comptePerdu` ne peut rien juger
      // et rend « inconnu » pour tout le monde, donc ne detache jamais rien.
      .select('id, nom, email, slug, stripe_account_id, stripe_account_mode, auth_user_id, plan, essai_plan, created_at')
      .eq('id', commercant_id)
      .single()

    if (errC || !commercant) {
      return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    }
    if (commercant.auth_user_id !== user.id) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // 0. LE COMPTE EST-IL ENCORE ATTEIGNABLE ?
    //
    // 🔴 SANS CE BLOC, UN COMMERÇANT EST COINCÉ POUR TOUJOURS APRÈS LA BASCULE.
    // Son `stripe_account_id` de test est renseigné, donc la création plus bas
    // est sautée, et `accountLinks.create` part sur un compte qui n'existe pas
    // dans le monde live. Stripe refuse, et son message anglais remonte tel quel
    // au commerçant. Il clique, ça échoue, il reclique, ça échoue encore.
    //
    // ⚠️ LE VERDICT EST CERTAIN, IL NE S'INTERPRÈTE PAS : on compare le monde
    // noté à la naissance du compte et celui de la clé actuelle. Deux mots. Un
    // compte dont le monde n'a jamais été noté rend « inconnu », et « inconnu »
    // ne détache rien.
    let accountId = commercant.stripe_account_id
    const perdu = comptePerdu(commercant)
    if (perdu) {
      console.warn('[stripe/connect] compte d un autre mode, on repart a zero', {
        commercant_id: commercant.id,
        ne_en: commercant.stripe_account_mode,
      })
      // ⚠️ SI LE DÉTACHEMENT ÉCHOUE, ON S'ARRÊTE. Continuer créerait un second
      // compte Stripe pendant que la fiche pointe toujours vers le premier :
      // deux comptes, un seul lien, et l'argent du bon sur le mauvais.
      const { error: errDetach } = await supabase
        .from('commercants')
        .update(detachementCompte(commercant))
        .eq('id', commercant_id)
      if (errDetach) {
        console.error('[stripe/connect] detachement impossible', { commercant_id, msg: errDetach.message })
        return NextResponse.json({
          ok: false,
          error: 'Ton compte de paiement doit etre reconnecte, et Yoppaa n a pas pu '
            + 'preparer l operation. Previens-nous, on s en occupe.',
        }, { status: 500 })
      }
      accountId = null
    }

    // 1. Crée le compte Connect Express si pas encore lié
    if (!accountId) {
      // 🔴 LA GARDE DE FORFAIT EST ICI, ET NULLE PART AILLEURS DANS CETTE
      // ROUTE. C'est le point le plus délicat des cinq gardes serveur.
      //
      // ⚠️ ELLE PORTE SUR LA CRÉATION D'UN COMPTE, JAMAIS SUR L'ACCÈS À UN
      // COMPTE EXISTANT. Posée au début de la route, elle empêcherait un
      // commerçant redescendu en Exister de regénérer son lien Stripe : il ne
      // pourrait plus **rembourser** un client, ni atteindre l'argent qu'il a
      // déjà encaissé. On lui interdirait l'accès à son propre compte
      // bancaire pour cause de forfait. Ce serait indéfendable, et c'est
      // exactement le piège signalé le 26/08.
      //
      // Encaisser en ligne demande Vendre. Ouvrir un compte pour la première
      // fois, c'est donc créer une capacité qu'il n'a pas encore : là, on
      // ferme. Après, jamais.
      //
      // ⚠️ ET UN COMPTE PERDU À LA BASCULE N'EST PAS UNE PREMIÈRE FOIS. Le
      // commerçant avait déjà son compte ; c'est NOUS qui l'avons rendu
      // inatteignable en changeant le mode de la plateforme. Lui opposer son
      // forfait à cet instant reviendrait à lui faire payer notre bascule. Il
      // retrouve ce qu'il avait, rien de plus : les gardes de paiement, elles,
      // continuent de vérifier le forfait à chaque encaissement.
      const verdict = perdu ? { ok: true } : verdictForfait(commercant, 'paiement_ligne')
      if (!verdict.ok) {
        return NextResponse.json(
          { ok: false, error: verdict.message, code: verdict.code, plan_requis: verdict.plan_requis },
          { status: verdict.statut }
        )
      }
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'BE',
        email: commercant.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'company',  // ou 'individual' selon le commerçant — on laisse choisir pendant l'onboarding
        business_profile: {
          name: commercant.nom,
          url: `${STRIPE_CONFIG.appUrl}/commander/rdv/${commercant.slug || commercant.id}`,
          product_description: 'Réservations de rendez-vous et commandes click & collect via Yoppaa',
        },
        metadata: {
          yoppaa_commercant_id: commercant.id,
        },
      })
      accountId = account.id
      // 🔴 C'EST ICI, ET NULLE PART AILLEURS, QUE LE MONDE DU COMPTE EST NOTÉ.
      // Sans cette écriture, `comptePerdu` rend « inconnu » à vie et la
      // détection ci-dessus ne se déclenche jamais : muette, donc inutile.
      //
      // ⚠️ ON LIT LE RÉSULTAT. Un `await` dont on ignore l'erreur est un espoir,
      // pas une action : ici, le compte existerait chez Stripe sans être relié
      // au commerçant, et personne ne le saurait.
      const { error: errLien } = await supabase
        .from('commercants')
        .update(naissanceCompte(accountId))
        .eq('id', commercant_id)
      if (errLien) {
        console.error('[stripe/connect] compte cree chez Stripe mais NON RELIE', {
          commercant_id, account_id: accountId, msg: errLien.message,
        })
        return NextResponse.json({
          ok: false,
          error: 'Ton compte de paiement a ete cree, mais Yoppaa n a pas pu l enregistrer. '
            + 'Ne recommence pas : previens-nous, on le rattache.',
        }, { status: 500 })
      }
    }

    // 2. Génère l'Account Link (URL one-shot Stripe-hosted)
    // refresh_url : Stripe redirige ici si le lien expire (max 5 min). On regénère un nouveau lien.
    // return_url  : Stripe redirige ici quand le commerçant finit son onboarding (success ou abandon).
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${STRIPE_CONFIG.appUrl}/dashboard?stripe=refresh`,
      return_url:  `${STRIPE_CONFIG.appUrl}/dashboard?stripe=connected`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ ok: true, url: link.url, account_id: accountId })

  } catch (e) {
    console.error('[stripe/connect/create-account-link]', e)
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: e?.status || 500 }
    )
  }
}
