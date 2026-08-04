// GET / POST /api/cron/stripe-frais
//
// Complète les frais Stripe manquants sur les commandes et les rendez-vous
// payés en ligne.
//
// POURQUOI UN RATTRAPAGE. Au moment exact du paiement, la transaction de solde
// qui porte les frais n'est pas toujours constituée côté Stripe. Le webhook
// préfère alors ne rien écrire plutôt qu'un zéro, qui ressemblerait à une
// transaction sans frais et fausserait le journal comptable sans que personne
// ne s'en aperçoive. Ce passage nocturne ramasse ce qui manque.
//
// Il sert aussi de reprise de l'historique : toutes les transactions
// antérieures à la mise en place de cette mesure seront complétées au fil des
// nuits, par lots, sans script à lancer à la main.
//
// Sécurité : Bearer CRON_SECRET, même schéma que les autres crons.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { recupererFraisStripe, ventilerFrais } from '@/lib/stripe-frais'

// Chaque ligne coûte un appel API à Stripe : on borne pour ne pas dépasser la
// durée d'exécution, le reliquat passe la nuit suivante.
const LOT = 120

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

function autorise(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.warn('[cron/stripe-frais] CRON_SECRET absente, endpoint NON protégé')
    return true
  }
  return (req.headers.get('authorization') || '') === `Bearer ${secret}`
}

async function handle(req) {
  if (!autorise(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = admin()
  const stats = { commandes: 0, rdvs: 0, indisponibles: 0, sans_compte: 0 }

  // Les comptes Stripe des commerçants, en une fois : le paiement vit sur le
  // compte du commerçant, sans lui aucune lecture n'est possible.
  const { data: commercants } = await supabase
    .from('commercants')
    .select('id, stripe_account_id')
  const compteParCommercant = Object.fromEntries(
    (commercants || []).map(c => [c.id, c.stripe_account_id])
  )

  // ⚠️ TUNNEL UNIQUE. Un rendez-vous et une commande peuvent partager UN SEUL
  // paiement. Écrire les frais complets sur les deux ferait apparaître deux
  // fois la même dépense dans l'export comptable. Quand la ligne est liée à
  // l'autre objet, on ventile au prorata, exactement comme le fait le webhook.
  const { data: commandes } = await supabase
    .from('commandes')
    .select('id, commercant_id, stripe_payment_intent_id, total, rdv_reservation_id')
    .eq('paye_en_ligne', true)
    .is('stripe_frais', null)
    .not('stripe_payment_intent_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LOT)

  for (const c of (commandes || [])) {
    const compte = compteParCommercant[c.commercant_id]
    if (!compte) { stats.sans_compte++; continue }
    const frais = await recupererFraisStripe(c.stripe_payment_intent_id, compte)
    if (!frais) { stats.indisponibles++; continue }
    let part = { frais: frais.frais, net: frais.net }
    if (c.rdv_reservation_id) {
      const { data: rdvLie } = await supabase
        .from('rdv_reservations').select('acompte_montant').eq('id', c.rdv_reservation_id).maybeSingle()
      const parts = ventilerFrais(frais.frais, rdvLie?.acompte_montant, c.total)
      if (parts) part = parts.commande
    }
    await supabase.from('commandes')
      .update({ stripe_frais: part.frais, stripe_net: part.net })
      .eq('id', c.id)
    stats.commandes++
  }

  const { data: rdvs } = await supabase
    .from('rdv_reservations')
    .select('id, commercant_id, stripe_payment_intent_id, acompte_montant, commande_id')
    .eq('acompte_paye_en_ligne', true)
    .is('stripe_frais', null)
    .not('stripe_payment_intent_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LOT)

  for (const r of (rdvs || [])) {
    const compte = compteParCommercant[r.commercant_id]
    if (!compte) { stats.sans_compte++; continue }
    const frais = await recupererFraisStripe(r.stripe_payment_intent_id, compte)
    if (!frais) { stats.indisponibles++; continue }
    let part = { frais: frais.frais, net: frais.net }
    if (r.commande_id) {
      const { data: cmdLiee } = await supabase
        .from('commandes').select('total').eq('id', r.commande_id).maybeSingle()
      const parts = ventilerFrais(frais.frais, r.acompte_montant, cmdLiee?.total)
      if (parts) part = parts.rdv
    }
    await supabase.from('rdv_reservations')
      .update({ stripe_frais: part.frais, stripe_net: part.net })
      .eq('id', r.id)
    stats.rdvs++
  }

  const reste = (commandes?.length === LOT) || (rdvs?.length === LOT)
  return NextResponse.json({
    status: 'ok',
    stats,
    note: reste
      ? 'Lot plein : le reliquat sera traité la nuit prochaine.'
      : 'Tout ce qui était lisible a été complété.',
  })
}

export async function GET(req) { return handle(req) }
export async function POST(req) { return handle(req) }
