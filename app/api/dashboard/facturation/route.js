// POST /api/dashboard/facturation → les coordonnées qui apparaîtront sur les
//                                    factures Yoppaa, et leur envoi chez Stripe.
//
// ⚠️ DÉCISION D'ALEX, 22/09 : LA BASE EST MAÎTRESSE, ELLE POUSSE VERS STRIPE.
// Le commerçant corrige ici, et c'est Yoppaa qui va le dire à Stripe. L'inverse
// (laisser le portail Stripe être la source) aurait fait sortir le commerçant
// du produit et laissé deux vérités se contredire sans arbitre.
//
// 🔴 CE QUE CETTE ROUTE RÉPARE. `stripe.customers.update` n'existait NULLE PART
// dans le dépôt : le Customer était créé une fois, avec les données du moment,
// et plus rien ne remontait. Un commerçant qui corrigeait son adresse gardait
// donc l'ancienne sur ses factures, pour toujours, sans le savoir — la base
// était à jour, l'écran confirmait, seule la facture restait fausse. Sur une
// facture belge, c'est un problème de conformité, pas de confort.
//
// ⚠️ ET SI STRIPE REFUSE, ON GARDE QUAND MÊME L'ÉCRITURE EN BASE. La base est
// maîtresse : annuler la correction du commerçant parce qu'un service tiers ne
// répond pas, ce serait lui faire perdre sa saisie pour un problème qui n'est
// pas le sien. On écrit, on tente, et on DIT que la synchronisation a échoué.
// Un silence ici recréerait exactement le défaut qu'on vient de corriger.
//
// AUCUNE DONNÉE D'UN AUTRE COMMERÇANT N'EST LISIBLE : la propriété de la fiche
// est vérifiée par le jeton, jamais par l'identifiant envoyé.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStripe } from '@/lib/stripe'
import { validerBCE } from '@/lib/kyb'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Le commerçant est-il bien propriétaire de cette fiche ? Même schéma que
// `/api/dashboard/signaux`, dont on ne s'écarte pas : la colonne s'appelle
// `auth_user_id`, et c'est le JETON qui décide, jamais le corps de la requête.
async function commercantDuProprietaire(supabase, request, commercantId) {
  const jeton = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!jeton || !commercantId) return null
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${jeton}` } } }
  )
  const { data: { user } = {} } = await authClient.auth.getUser()
  if (!user) return null
  const { data: c } = await supabase
    .from('commercants')
    .select('id, auth_user_id, nom, adresse, telephone, email, bce, tva_numero, tva_assujetti, stripe_customer_id')
    .eq('id', commercantId)
    .maybeSingle()
  if (!c || c.auth_user_id !== user.id) return null
  return c
}

// 🔴 LE NUMÉRO DE TVA SE NORMALISE AVANT D'ÊTRE JUGÉ. Un commerçant tape
// « BE 0123.456.789 » ou « be0123456789 » : ce sont le même numéro, et refuser
// l'un des deux serait lui reprocher une mise en forme. La contrainte en base
// n'accepte qu'une seule écriture, c'est donc ici qu'on y ramène.
//
// ⚠️ ON REND `null` POUR UN CHAMP VIDE, ET C'EST UN ÉTAT LÉGITIME : un commerce
// en franchise de TVA n'a pas de numéro à donner. Le confondre avec une erreur
// de saisie l'empêcherait d'enregistrer le reste.
export function normaliserTva(brut) {
  if (brut === null || brut === undefined) return { ok: true, valeur: null }
  const net = String(brut).trim()
  if (net === '') return { ok: true, valeur: null }
  const chiffres = net.replace(/[^0-9]/g, '')
  if (chiffres.length !== 10) {
    return { ok: false, erreur: 'Un numéro de TVA belge compte dix chiffres, après le « BE ».' }
  }
  // ⚠️ LE MÊME CONTRÔLE QUE LE NUMÉRO D'ENTREPRISE, et ce n'est pas un hasard :
  // en Belgique ce sont les mêmes chiffres, avec la même clé de contrôle
  // modulo 97. Un numéro qui ne la passe pas n'existe pas, et Billit l'enverrait
  // quand même : la facture reviendrait rejetée, longtemps après.
  const { valide } = validerBCE(chiffres)
  if (!valide) {
    return { ok: false, erreur: 'Ce numéro de TVA ne passe pas le contrôle officiel. Vérifie les chiffres.' }
  }
  return { ok: true, valeur: `BE${chiffres}` }
}

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const { commercantId, nom, adresse, tvaNumero, tvaAssujetti } = corps || {}

    const supabase = admin()
    const commercant = await commercantDuProprietaire(supabase, request, commercantId)
    if (!commercant) {
      return NextResponse.json({ error: 'Fiche introuvable ou accès refusé.' }, { status: 403 })
    }

    // ⚠️ UNE RAISON SOCIALE VIDE N'EST PAS UNE CORRECTION, C'EST UNE PERTE.
    // Elle part sur la facture et sert à identifier l'entreprise.
    const nomNet = typeof nom === 'string' ? nom.trim() : ''
    if (!nomNet) {
      return NextResponse.json({ error: 'La raison sociale ne peut pas être vide : elle figure sur tes factures.' }, { status: 400 })
    }
    const adresseNette = typeof adresse === 'string' ? adresse.trim() : ''
    if (!adresseNette) {
      return NextResponse.json({ error: 'L’adresse du siège social ne peut pas être vide : elle figure sur tes factures.' }, { status: 400 })
    }

    const tva = normaliserTva(tvaNumero)
    if (!tva.ok) return NextResponse.json({ error: tva.erreur }, { status: 400 })

    // 🔴 ASSUJETTI SANS NUMÉRO, C'EST UNE FACTURE QUI PARTIRA INCOMPLÈTE.
    // On ne bloque pas : un commerçant peut vouloir enregistrer son adresse
    // avant d'avoir son numéro sous les yeux. Mais on le DIT, et l'écran le
    // répète tant que ce n'est pas comblé.
    const assujetti = tvaAssujetti !== false
    const incomplet = assujetti && !tva.valeur

    const { error: errEcriture } = await supabase
      .from('commercants')
      .update({
        nom: nomNet,
        adresse: adresseNette,
        tva_numero: tva.valeur,
        tva_assujetti: assujetti,
      })
      .eq('id', commercantId)

    if (errEcriture) {
      return NextResponse.json({ error: `Enregistrement impossible : ${errEcriture.message}` }, { status: 500 })
    }

    // ─── LA MOITIÉ QUI MANQUAIT : POUSSER CHEZ STRIPE ───────────────────────
    //
    // ⚠️ PAS DE CUSTOMER, PAS D'ERREUR. Un commerçant sans abonnement n'a pas
    // encore de Customer Stripe : il n'y a rien à mettre à jour, et ce n'est
    // pas un échec. Son Customer sera créé plus tard, avec les bonnes données,
    // par `getOrCreateStripeCustomer`.
    let stripeSynchro = 'sans objet'
    if (commercant.stripe_customer_id) {
      try {
        const stripe = requireStripe()
        await stripe.customers.update(commercant.stripe_customer_id, {
          name: nomNet,
          address: { line1: adresseNette, country: 'BE' },
          metadata: {
            yoppaa_commercant_id: String(commercantId),
            ...(commercant.bce ? { yoppaa_bce: commercant.bce } : {}),
            ...(tva.valeur ? { yoppaa_tva: tva.valeur } : {}),
          },
        })
        stripeSynchro = 'à jour'
      } catch (e) {
        // 🔴 ON LE DIT, ON N'ANNULE PAS. La base est maîtresse : sa correction
        // est enregistrée et vaut. Ce qui est en retard, c'est Stripe, et le
        // taire recréerait le défaut qu'on vient de corriger.
        console.error('[facturation] Stripe non mis à jour', e?.message || e)
        stripeSynchro = 'en retard'
      }
    }

    return NextResponse.json({ ok: true, stripeSynchro, incomplet, tvaNumero: tva.valeur })
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Erreur inconnue' }, { status: 500 })
  }
}
