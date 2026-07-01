// GET /api/rdv/mes-rdvs
//
// Retourne les RDV du Yopper identifié par le cookie yopper (HTTP-only,
// posé par POST /api/yopper/session lors de la connexion Yopper).
//
// Contexte : la policy RLS "Client voit ses RDV" (MIGRATION_RDV.sql:359)
// exige TO authenticated + auth.uid() défini. Or 99% des Yoppers Yoppaa
// ne sont PAS des utilisateurs Supabase Auth (ils sont dans clients, pas
// dans auth.users). Résultat : SELECT rdv_reservations côté client échoue
// silencieusement (0 lignes retournées) → bug "RDV qui disparaissent"
// signalé Alex 30/06 et 01/07.
//
// Solution : route serveur qui bypass RLS via service_role. Auth Yopper
// via cookie HTTP-only Same-Site déjà en place.

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const COOKIE_NAME = 'yoppaa_yopper'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

async function getYopperEmail() {
  const jar = await cookies()
  const raw = jar.get(COOKIE_NAME)?.value
  if (!raw) return null
  try {
    const identity = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    return identity?.email || null
  } catch {
    return null
  }
}

export async function GET() {
  const email = await getYopperEmail()
  if (!email) {
    return NextResponse.json({ ok: false, error: 'session_yopper_manquante', rdvs: [] }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from('rdv_reservations')
    .select(`
      id, statut, date_rdv, heure_debut, heure_fin, prix_estime, numero_rdv,
      commercant_id, prestation_id, praticien_id,
      acompte_paye_en_ligne, acompte_montant, acompte_paye_date,
      annulation_token, client_email,
      commercant:commercants(nom, slug, type, categorie, rdv_delai_annulation_heures),
      prestation:rdv_prestations(nom, duree_minutes),
      praticien:rdv_praticiens(id, prenom, nom, couleur_hex, photo_url)
    `)
    .eq('client_email', email)
    .is('deleted_at', null)
    .in('statut', ['confirme', 'honore', 'annule_client', 'annule_commercant', 'no_show', 'reporte'])
    .order('date_rdv', { ascending: false })

  if (error) {
    console.error('[api/rdv/mes-rdvs] SELECT erreur', error)
    return NextResponse.json({ ok: false, error: error.message, rdvs: [] }, { status: 500 })
  }

  const enriched = (data || []).map(r => ({
    ...r,
    prestation_nom: r.prestation?.nom || null,
  }))

  return NextResponse.json({ ok: true, count: enriched.length, rdvs: enriched })
}
