// POST /api/yopper/mes-bons
//
// Les bons cadeaux du Yopper connecté.
//
// ⚠️ CE PAN DU MODULE N'EXISTAIT PAS. Un bon cadeau acheté n'était visible que
// par le lien reçu par email : perdre l'email, c'était perdre le bon. La page
// publique `/cadeau/<token>` existait pourtant, bien faite, mais ORPHELINE,
// aucun écran de l'application n'y menait.
//
// LE RATTACHEMENT SE FAIT PAR L'ADRESSE EMAIL, sans nouvelle colonne, donc il
// vaut rétroactivement pour les bons déjà vendus :
//   • bon OFFERT   → `beneficiaire_email` est l'adresse du destinataire ;
//   • bon POUR SOI → `beneficiaire_email` vaut NULL, c'est `acheteur_email`
//     qui porte l'adresse, et `destinataire_mode` qui le dit.
// Les deux colonnes sont écrites en minuscules et sans espaces par la route
// d'achat : la comparaison est donc fiable, sans surprise de casse.
//
// ⚠️ SÉCURITÉ, ET C'EST TOUT LE SUJET DE CETTE ROUTE. L'adresse vient de
// `identiteProuvee`, donc d'un compte Supabase dont l'email a été VÉRIFIÉ, et
// JAMAIS d'un paramètre. Lire une adresse envoyée par l'appelant reviendrait à
// offrir les bons de n'importe qui à quiconque en tape l'adresse. La table
// `bons_cadeaux` n'a aucune lecture publique : le service_role reste ici.
//
// Body : { action, ...params }
//   - 'list' : {}                    → { bons: [...] } tous ses bons dépensables
//   - 'une'  : { commercant_id }     → { bons: [...] } ceux dépensables ICI

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteProuvee } from '@/lib/yopper-auth'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Champs SÛRS : ce sont SES bons, le code et le jeton lui appartiennent.
// ⚠️ `acheteur_email` et `beneficiaire_email` NE SORTENT PAS : le prénom du
// donateur suffit à dire de qui vient le cadeau, l'adresse d'un tiers n'a
// rien à faire dans une réponse d'API.
const CHAMPS = 'id, commercant_id, code, token, montant_initial, solde, statut, expires_at, destinataire_mode, acheteur_prenom, beneficiaire_prenom, message, created_at'
const CHAMPS_COMMERCANT = 'id, nom, slug, logo_url, categorie, type'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(request) {
  try {
    const id = await identiteProuvee(request)
    // 200 plutôt que 401 : ne pas être connecté n'est pas une erreur, c'est un
    // état que la fiche doit pouvoir raconter. Un 401 se perdrait dans un
    // catch silencieux et l'écran n'afficherait rien, sans dire pourquoi.
    if (!id?.email) return NextResponse.json({ ok: true, connecte: false, bons: [] })
    const email = String(id.email).toLowerCase()

    const body = await request.json().catch(() => ({}))
    const action = body?.action || 'list'
    const supabase = admin()

    let commercantId = null
    if (action === 'une') {
      commercantId = body?.commercant_id
      if (!commercantId || !RE_UUID.test(String(commercantId))) {
        return NextResponse.json({ ok: false, error: 'commercant_id invalide' }, { status: 400 })
      }
    }

    // ⚠️ DEUX REQUÊTES, ET C'EST UN CHOIX DE SÉCURITÉ. Un `.or()` construit sa
    // chaîne de filtre par concaténation : une adresse à partie locale entre
    // guillemets peut légalement contenir une virgule ou une parenthèse, et
    // l'adresse se serait alors mêlée à la SYNTAXE du filtre. Les valeurs d'un
    // `.eq()` sont encodées par la bibliothèque, jamais interprétées.
    const base = () => {
      let q = supabase
        .from('bons_cadeaux')
        .select(`${CHAMPS}, commercant:commercants(${CHAMPS_COMMERCANT})`)
        .eq('statut', 'actif')
        .gt('solde', 0)
        .limit(50)
      if (commercantId) q = q.eq('commercant_id', commercantId)
      return q
    }

    const [offerts, pourSoi] = await Promise.all([
      base().eq('beneficiaire_email', email),
      // Un bon acheté pour soi-même a une colonne bénéficiaire NULLE : sans
      // cette seconde branche il n'apparaîtrait jamais chez son porteur.
      base().eq('destinataire_mode', 'moi').eq('acheteur_email', email),
    ])
    if (offerts.error) throw new Error(offerts.error.message)
    if (pourSoi.error) throw new Error(pourSoi.error.message)

    // Fusion par identifiant : les deux ensembles sont disjoints en théorie,
    // on ne parie pas dessus.
    const parId = new Map()
    for (const b of [...(offerts.data || []), ...(pourSoi.data || [])]) parId.set(b.id, b)
    const data = [...parId.values()]

    // ⚠️ L'EXPIRATION SE FILTRE ICI, PAS EN BASE. `expires_at` peut être NULL
    // (aucune limite), et un `.gte()` sur une colonne nulle EXCLUT la ligne :
    // un bon sans date d'expiration aurait silencieusement disparu de l'écran
    // de son porteur. NULL n'est ni égal ni différent, la leçon du 23/08.
    const maintenant = Date.now()
    const bons = (data || [])
      .filter(b => !b.expires_at || new Date(b.expires_at).getTime() >= maintenant)
      // Le plus proche de l'expiration en premier : on dépense d'abord ce qui
      // va mourir. Un bon qui expire, c'est de l'argent perdu pour le Yopper
      // et une visite perdue pour le commerçant. Les bons sans date passent
      // en dernier, ils ne sont pas pressés.
      .sort((a, b) => {
        const ta = a.expires_at ? new Date(a.expires_at).getTime() : Infinity
        const tb = b.expires_at ? new Date(b.expires_at).getTime() : Infinity
        return ta - tb
      })

    return NextResponse.json({ ok: true, connecte: true, bons })
  } catch (e) {
    console.error('[yopper/mes-bons] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
