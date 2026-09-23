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
import { gardeCommercant } from '@/lib/api-auth'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// 🔴 LA GARDE VIENT DU POINT CENTRAL, ELLE N'EST PLUS RECOPIÉE (22/09).
// Première version : une vérification écrite ici, `auth_user_id !== user.id`,
// sur le modèle de `/api/dashboard/signaux`. Alex l'a essayée depuis son MODE
// ADMIN, sur la fiche d'un commerçant, et a lu « Fiche introuvable ou accès
// refusé ». Ce n'était pas un défaut : la garde faisait exactement ce qu'on lui
// avait écrit. Elle ignorait simplement que l'administrateur existe.
//
// ⚠️ ET `lib/api-auth.js` PORTAIT DÉJÀ LA RÉPONSE, avec son intention écrite :
// « l'administrateur Yoppaa passe : il ouvre des dossiers qui ne sont pas les
// siens, c'est son métier ». Recopier une vérification au lieu d'appeler celle
// qui existe, c'est se priver de ce qu'elle a appris.
//
// ⚠️ ET ÇA ÉVITE UNE VINGT-NEUVIÈME COPIE DE L'ADRESSE ADMIN. Le dépôt en
// compte vingt-huit dans le code et trois en base : la constante vit dans
// `api-auth`, et c'est le seul endroit où elle doit vivre.
//
// 🔴 TROIS AUTRES ROUTES DU TABLEAU DE BORD ONT LE MÊME DÉFAUT : `signaux`,
// `statistiques` et `export-comptable` refusent aussi l'admin. C'est noté ;
// ici on répare celle qu'Alex a vue.
async function chargerFiche(supabase, request, commercantId) {
  const garde = await gardeCommercant(request, supabase, commercantId)
  if (!garde.ok) return null
  const { data: c } = await supabase
    .from('commercants')
    .select('id, auth_user_id, nom, adresse, telephone, email, bce, tva_numero, tva_assujetti, stripe_customer_id')
    .eq('id', commercantId)
    .maybeSingle()
  return c || null
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
    const commercant = await chargerFiche(supabase, request, commercantId)
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
          // 🔴 L'EMAIL AVAIT ÉTÉ OUBLIÉ ICI (trouvé le 23/09, sur une question
          // d'Alex). Cette route a été écrite le 22/09 pour réparer une adresse
          // postale qui restait fausse sur les factures ; elle a poussé le nom
          // et l'adresse, et laissé l'email derrière. Tant que personne ne
          // pouvait changer son email, ça ne se voyait pas. Depuis qu'il le
          // peut, c'est le même défaut, sur le même document.
          // ⚠️ `undefined` ET PAS `null` : Stripe ignore un champ absent, mais
          // `null` EFFACERAIT l'email du Customer.
          email: commercant.email || undefined,
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
