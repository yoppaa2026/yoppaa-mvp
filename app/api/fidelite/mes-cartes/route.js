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
import { normaliserTelephone } from '@/lib/fidelite'
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

// Numéros de téléphone PROUVÉS du Yopper : ceux qu'il a réellement utilisés
// dans une commande ou un rendez-vous.
//
// ⚠️ ET `clients.telephone` N'EN FAIT PLUS PARTIE, C'ÉTAIT LA FAILLE.
// L'en-tête de ce fichier posait pourtant la règle : « jamais par saisie libre
// d'un numéro, sinon n'importe qui pourrait espionner les cartes d'autrui ».
// Or `clients.telephone` EST une saisie libre : l'action `update-own` le laisse
// écrire ce qu'on veut, sans le moindre contrôle par SMS — aucun flux de
// vérification téléphonique n'existe dans le projet.
//
// L'attaque tenait en deux requêtes. On s'inscrit comme Yopper ordinaire, on
// pose le numéro de GSM de quelqu'un d'autre dans son profil, on demande ses
// cartes : on reçoit sa cagnotte en euros, la liste des commerces qu'il
// fréquente, et le JETON de chaque carte. Ce jeton ouvre `/carte/<token>` sans
// aucune connexion, et il n'expire jamais.
//
// ⚠️ Le contrôle `identiteProuvee` ne protégeait rien ici : l'identité de
// l'attaquant est parfaitement prouvée. C'est le NUMÉRO qui sélectionne les
// lignes, et c'est lui qui était auto-déclaré.
async function telephonesDuYopper(supabase, yopper) {
  const tels = new Set()
  const { data: cmds } = await supabase
    .from('commandes').select('client_telephone')
    .eq('client_email', yopper.email)
    .not('client_telephone', 'is', null)
    .limit(200)
  ;(cmds || []).forEach(c => {
    const t = normaliserTelephone(c.client_telephone)
    if (t) tels.add(t)
  })
  const { data: rdvs } = await supabase
    .from('rdv_reservations').select('client_telephone')
    .ilike('client_email', yopper.email)
    .not('client_telephone', 'is', null)
    .limit(200)
  ;(rdvs || []).forEach(r => {
    const t = normaliserTelephone(r.client_telephone)
    if (t) tels.add(t)
  })
  return [...tels]
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

    const tels = await telephonesDuYopper(supabase, yopper)
    if (tels.length === 0) return NextResponse.json({ ok: true, connecte: true, cartes: [], carte: null })

    if (action === 'une') {
      const commercantId = body?.commercant_id
      if (!commercantId || !RE_UUID.test(String(commercantId))) {
        return NextResponse.json({ ok: false, error: 'commercant_id invalide' }, { status: 400 })
      }
      const { data: carte, error } = await supabase
        .from('fidelite_cartes')
        .select(`${CHAMPS_CARTE}, commercant:commercants(${CHAMPS_COMMERCANT})`)
        .eq('commercant_id', commercantId)
        .in('telephone', tels)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, connecte: true, carte: carte || null })
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
