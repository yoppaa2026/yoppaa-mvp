// POST /api/fidelite/mes-cartes
//
// Cartes de fidélité du Yopper connecté. LE GSM = LA CARTE : le rattachement
// se fait par les numéros de téléphone que le Yopper a UTILISÉS dans ses
// commandes (et celui de sa fiche client), jamais par saisie libre d'un
// numéro (sinon n'importe qui pourrait espionner les cartes d'autrui).
//
// Sécurité : identité depuis le cookie HTTP-only yoppaa_yopper (même pattern
// que /api/yopper/commandes), service_role côté serveur, la table
// fidelite_cartes n'étant pas lisible par anon.
//
// Body : { action, ...params }
//   - 'list' : {} → { cartes: [...] } toutes les cartes du Yopper
//   - 'une'  : { commercant_id } → { carte } la carte chez CE commerçant
//              (jauge de la fiche commerçant)

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
// ⚠️ LA RÈGLE DES NUMÉROS PROUVÉS A QUITTÉ CE FICHIER LE 24/08. Le tunnel de
// commande en a besoin lui aussi pour proposer une récompense de fidélité : la
// recopier aurait donné deux règles de sécurité qui divergent au premier
// durcissement. Elle vit désormais dans lib/yopper-telephones.js, avec toute
// l'explication de la faille qu'elle ferme.
import { telephonesProuves } from '@/lib/yopper-telephones'
import { identiteProuvee } from '@/lib/yopper-auth'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// ⚠️ CETTE ROUTE A ÉTÉ MUETTE PENDANT DEUX JOURS. Elle décodait encore le
// cookie de l'ANCIEN format, non signé, resté en place après le durcissement du
// 03/08 : le décodage échouait, l'identité valait null, et la fiche affichait
// éternellement le teaser du programme au lieu de la jauge du Yopper. Le même
// oubli avait touché /api/rdv/mes-rdvs. Toute lecture de cookie Yopper passe
// désormais par lib/yopper-auth, sans exception.
//
// Preuve EXIGÉE : la carte se rattache aux téléphones tirés des commandes de
// l'email. Avec une identité seulement déclarée, saisir l'adresse d'un tiers au
// checkout suffirait à lire ses passages et sa cagnotte.
async function yopperCourant(request) {
  const id = await identiteProuvee(request)
  if (!id?.email) return null
  return { email: String(id.email).toLowerCase(), client_id: id.client_id || null }
}

// Champs SÛRS exposés au Yopper (jamais le token d'une carte d'autrui : ici ce
// sont SES cartes, le token permet le lien de partage vers /carte/[token])
const CHAMPS_CARTE = 'id, commercant_id, telephone, passages, cagnotte, recompenses_disponibles, token, updated_at'
const CHAMPS_COMMERCANT = 'id, nom, slug, logo_url, categorie, type, fidelite_actif, fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_recompense_type, fidelite_recompense_valeur, fidelite_recompense_libelle'

export async function POST(request) {
  try {
    const yopper = await yopperCourant(request)
    // 200 plutôt que 401 : ne pas être connecté n'est pas une erreur, c'est un
    // état que la fiche doit pouvoir raconter (« connecte-toi pour voir où en
    // est ta carte »). Un 401 se serait perdu dans un catch silencieux.
    if (!yopper) return NextResponse.json({ ok: true, connecte: false, cartes: [], carte: null })

    const body = await request.json().catch(() => ({}))
    const action = body?.action || 'list'
    const supabase = admin()

    const tels = await telephonesProuves(supabase, yopper.email)
    if (tels.length === 0) return NextResponse.json({ ok: true, connecte: true, cartes: [], carte: null })

    if (action === 'une') {
      const commercantId = body?.commercant_id
      if (!commercantId || !RE_UUID.test(String(commercantId))) {
        return NextResponse.json({ ok: false, error: 'commercant_id invalide' }, { status: 400 })
      }
      // ⚠️ 🔴 UN YOPPER PEUT AVOIR DEUX CARTES CHEZ LE MÊME COMMERÇANT, et ce
      // n'est pas un cas d'école : la clé est le NUMÉRO DE GSM. Quiconque a
      // changé d'opérateur, ou commandé une fois avec le numéro du bureau,
      // en a deux.
      //
      // ⚠️ LE `.limit(1)` SUR `updated_at` PRENAIT LA PLUS RÉCEMMENT TOUCHÉE,
      // pas la plus utile. Un passage crédité sur le nouveau numéro faisait
      // DISPARAÎTRE de l'écran la carte pleine de l'ancien : la récompense
      // existait toujours en base, mais son porteur ne la voyait plus et ne
      // pouvait plus la dépenser en ligne.
      //
      // On trie donc d'abord sur la récompense disponible. Une carte qui a
      // quelque chose à donner passe devant une carte qui vient de bouger.
      const { data: trouvees, error } = await supabase
        .from('fidelite_cartes')
        .select(`${CHAMPS_CARTE}, commercant:commercants(${CHAMPS_COMMERCANT})`)
        .eq('commercant_id', commercantId)
        .in('telephone', tels)
        .order('recompenses_disponibles', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(10)
      if (error) throw new Error(error.message)
      const liste = trouvees || []
      // ⚠️ ET ON DIT QU'IL Y EN A PLUSIEURS. Cacher les autres derrière un
      // seul chiffre laisserait le Yopper compter des passages qui ne
      // s'additionnent pas, sans jamais comprendre pourquoi.
      return NextResponse.json({
        ok: true,
        connecte: true,
        carte: liste[0] || null,
        cartes_ce_commerce: liste.length,
      })
    }

    // list : toutes les cartes, chez des commerçants à la fidélité active
    const { data: cartes, error } = await supabase
      .from('fidelite_cartes')
      .select(`${CHAMPS_CARTE}, commercant:commercants(${CHAMPS_COMMERCANT})`)
      .in('telephone', tels)
      .order('updated_at', { ascending: false })
      .limit(50)
    if (error) throw new Error(error.message)
    const actives = (cartes || []).filter(c => c.commercant?.fidelite_actif)
    return NextResponse.json({ ok: true, connecte: true, cartes: actives })
  } catch (e) {
    console.error('[fidelite/mes-cartes] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur serveur' }, { status: 500 })
  }
}
