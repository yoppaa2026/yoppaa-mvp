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

// ⚠️ RÉGRESSION CORRIGÉE LE 05/08. Cette route décodait encore le cookie à
// l'ancien format, un simple base64 de JSON. Le durcissement du 03/08 a rendu
// le cookie SIGNÉ (`payload.signature`) : le décodage échouait donc à tous les
// coups, la route renvoyait 401, et l'onglet « Commandes et RDV » n'affichait
// plus AUCUN rendez-vous. La route des commandes avait été migrée, celle-ci
// avait été oubliée.
//
// Elle passe désormais par l'identité PROUVÉE, comme les commandes, les favoris
// et les avis : un rendez-vous porte le nom, l'email et le téléphone du client,
// un cookie déclaratif ne suffit pas à y donner accès.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteProuvee } from '@/lib/yopper-auth'
import { adresseRendezVous } from '@/lib/lieu-fige'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET(request) {
  const identite = await identiteProuvee(request)
  if (!identite?.email) {
    return NextResponse.json({ ok: false, error: 'identite_non_prouvee', rdvs: [] }, { status: 401 })
  }
  const email = identite.email

  const supabase = getSupabaseAdmin()
  // ⚠️ `fidelite_remise` ET `bon_cadeau_montant` SONT OBLIGATOIRES ICI, et
  // leur absence ne lève RIEN : `Number(undefined)` n'est pas fini, donc
  // `montantNetRdv` se rabattrait sur le tarif plein en silence. C'est le
  // défaut le plus fréquent de ce projet, et il a valu à Alex de lire « 35€ »
  // sur une coupe entièrement payée par un bon cadeau.
  const { data, error } = await supabase
    .from('rdv_reservations')
    .select(`
      id, statut, date_rdv, heure_debut, heure_fin, prix_estime, numero_rdv,
      commercant_id, prestation_id, praticien_id,
      fidelite_remise, bon_cadeau_montant,
      acompte_paye_en_ligne, acompte_montant, acompte_paye_date,
      annulation_token, client_email,
      abonnement_id,
      lieu_id, lieu_libelle, lieu_adresse,
      commercant:commercants(nom, slug, type, categorie, adresse, rdv_delai_annulation_heures),
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

  // ⚠️ OÙ ALLER, ET PAS SEULEMENT QUAND. L'écran « Mes rendez-vous » ne
  // recevait aucune adresse : le Yopper devait rouvrir la fiche du commerce
  // pour la retrouver, et il y lisait le siège social, donc le DOMICILE d'une
  // commerçante inscrite chez elle mais qui donne cours en salle.
  const enriched = (data || []).map(r => ({
    ...r,
    prestation_nom: r.prestation?.nom || null,
    lieu_affiche: adresseRendezVous(r),
  }))

  return NextResponse.json({ ok: true, count: enriched.length, rdvs: enriched })
}
