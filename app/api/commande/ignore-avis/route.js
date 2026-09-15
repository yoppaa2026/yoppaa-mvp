// POST /api/commande/ignore-avis
//
// Marque une commande comme "avis ignoré" via avis_ignore_at = NOW(). Permet
// au Yopper de ne plus recevoir la sollicitation d'évaluation sur cette
// commande, y compris depuis un autre appareil (persistence serveur, remplace
// l'ancien localStorage 'yoppaa_avis_proposes' qui ne franchissait pas les
// appareils).
//
// Body attendu : { commande_id: UUID }
//
// Auth : identité PROUVÉE (jeton Supabase). L'email du jeton doit être celui de
// la commande : un Yopper ne masque que les demandes d'avis de SES commandes.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteProuvee } from '@/lib/yopper-auth'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// 🔴 L'IDENTITÉ DÉCLARÉE NE SUFFIT PLUS, ICI NON PLUS (15/09).
//
// Cette route était la dernière à l'accepter, sur un raisonnement écrit le
// 21/08 : « un cookie forgé au nom d'une adresse ne sert à rien sans l'UUID de
// la commande, que seul son auteur possède ». C'était FAUX. Le tableau de bord
// du COMMERÇANT affiche l'email du client et reçoit l'UUID de chaque commande.
// Il lui suffisait de se faire signer un cookie à cette adresse
// (`POST /api/yopper/session` signe ce qu'on lui déclare) pour faire taire la
// demande d'avis sur ses propres commandes, à commencer par celles qui se sont
// mal passées. Un avis vérifié qu'on peut empêcher de naître ne vérifie plus
// rien.
//
// ⚠️ ET EXIGER LA PREUVE NE RETIRE RIEN À PERSONNE : la demande d'avis naît des
// commandes du Yopper, et ces commandes ne se chargent QU'AVEC une identité
// prouvée (`/api/yopper/commandes`). Qui voit la demande a donc un jeton.
//
// ⚠️ LE FILTRE `.eq('client_email', …)` RESTE INDISPENSABLE : c'est lui qui
// borne le jeton à SES commandes. Sans lui, n'importe quel compte masquerait
// les demandes d'avis de tout le monde.
async function getYopperEmail(request) {
  const id = await identiteProuvee(request)
  return id?.email || null
}

export async function POST(req) {
  const email = await getYopperEmail(req)
  if (!email) {
    return NextResponse.json({ ok: false, error: 'session_yopper_manquante' }, { status: 401 })
  }

  let body
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 }) }
  const { commande_id } = body || {}
  if (!commande_id || typeof commande_id !== 'string') {
    return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('commandes')
    .update({ avis_ignore_at: new Date().toISOString() })
    .eq('id', commande_id)
    .eq('client_email', email)   // sécurité : uniquement les siennes
    .select('id, avis_ignore_at')

  if (error) {
    console.error('[api/commande/ignore-avis] update erreur', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: 'commande introuvable ou non autorisée' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, commande: data[0] })
}
