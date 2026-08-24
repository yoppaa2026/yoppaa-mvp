// POST /api/accompagnement/souhaits
//
// Le commerçant coche du matériel ou de l'accompagnement à l'ÉTAPE 5 DE
// L'INSCRIPTION. Il ne paie pas encore : sa fiche n'est pas validée, le
// matériel ne partirait pas et la prestation n'aurait pas lieu. On enregistre
// donc un SOUHAIT, qu'il retrouvera pré-coché dans son tableau de bord et
// qu'il paiera quand sa fiche sera publiée.
//
// ⚠️ ARBITRAGE D'ALEX, 24/08 (option B) : « pour rester cohérent par rapport à
// la validation ». Sa règle « toujours le paiement avant la prestation ou la
// commande » reste tenue, puisqu'aucune prestation n'a lieu et qu'aucun colis
// ne part. L'option A (paiement dès l'inscription) aurait obligé à rembourser
// un kit déjà payé chaque fois qu'un KYB est rejeté.
//
// ⚠️ POURQUOI CETTE ROUTE EXISTE, ALORS QUE LE NAVIGATEUR ÉCRIVAIT DÉJÀ.
// L'inscription faisait `success_packs.insert({ montant_ht: 199 })` DEPUIS LE
// NAVIGATEUR, avec le prix EN DUR. Trois défauts d'un coup :
//   1) le montant venait du client, et RLS protège la LIGNE, jamais la VALEUR
//      (même leçon que la carte de fidélité, corrigée le matin même) ;
//   2) le prix était figé à 199 et ne suivait plus le catalogue ;
//   3) SEUL le Success Pack était enregistré. Un commerçant qui cochait le Kit
//      Pro voyait 469 €, un total, la mention « Paiement sécurisé par Stripe »,
//      et RIEN n'était gardé nulle part.
//
// Body : { commercant_id, produits: ['success_pack', 'kit_pro', …] }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { produitParType } from '@/lib/produits-boutique'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

// Statut d'un choix fait à l'inscription : rien n'est engagé, rien n'est dû.
// Il se distingue de 'paiement_en_attente' (un Checkout a été ouvert) et de
// 'paye'. La table ne porte AUCUNE contrainte CHECK sur `type` ni sur
// `statut` : vérifié dans pg_constraint le 24/08, aucune ligne rendue.
export const STATUT_SOUHAIT = 'souhaite'

export async function POST(request) {
  try {
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const { commercant_id, produits } = await request.json()
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    // ⚠️ ON NE FAIT CONFIANCE QU'AU CATALOGUE SERVEUR. Un type inconnu est
    // ignoré, et le montant vient d'ici, jamais du corps de la requête.
    const choisis = [...new Set(Array.isArray(produits) ? produits : [])]
      .map(t => produitParType(t))
      .filter(Boolean)

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: com } = await admin
      .from('commercants')
      .select('id, auth_user_id')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (com.auth_user_id !== user.id && user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // ⚠️ LA SOUMISSION SE REJOUE. Un commerçant rejeté au KYB corrige et
    // renvoie sa fiche : sans ce nettoyage il accumulerait un souhait de plus
    // à chaque tentative, et son tableau de bord lui proposerait trois Kits
    // Pro. On n'efface QUE les souhaits, jamais une ligne payée ou en cours
    // de paiement, qui elles racontent de l'argent.
    const { error: errDel } = await admin
      .from('success_packs')
      .delete()
      .eq('commercant_id', com.id)
      .eq('statut', STATUT_SOUHAIT)
    if (errDel) {
      console.error('[accompagnement/souhaits] nettoyage KO', errDel.message)
      return NextResponse.json({ ok: false, error: 'Enregistrement impossible, réessaie.' }, { status: 500 })
    }

    if (choisis.length === 0) return NextResponse.json({ ok: true, souhaits: 0 })

    const { data: lignes, error: errIns } = await admin
      .from('success_packs')
      .insert(choisis.map(p => ({
        commercant_id: com.id,
        type: p.type,
        statut: STATUT_SOUHAIT,
        montant_ht: p.prix,
        notes: 'Choisi à l\'inscription, à payer depuis le tableau de bord une fois la fiche validée',
      })))
      .select('id')
    if (errIns) {
      console.error('[accompagnement/souhaits] insert KO', errIns.message)
      return NextResponse.json({ ok: false, error: 'Enregistrement impossible, réessaie.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, souhaits: lignes?.length || 0 })
  } catch (e) {
    console.error('[accompagnement/souhaits]', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
