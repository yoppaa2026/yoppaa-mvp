// GET /api/bons-cadeaux/config?commercant_id=...
//
// Expose les flags publics du module bons cadeaux d'un commerçant, SANS
// toucher à la vue commercants_public (on ne recrée pas la vue pour deux
// colonnes de config). Consommé par les fiches pour afficher le bouton
// « Offrir un bon cadeau » et le champ code du tunnel.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { canDo, planEffectif } from '@/lib/plans'
import { fichePubliee } from '@/lib/statut-commercant'

export async function GET(request) {
  try {
    const commercant_id = new URL(request.url).searchParams.get('commercant_id')
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    const { data: c } = await supabase
      .from('commercants')
      .select('plan, essai_plan, created_at, statut_publication, bons_cadeaux_actif, bons_cadeaux_validite_mois, stripe_account_charges_enabled')
      .eq('id', commercant_id)
      .maybeSingle()

    // 🔴 LE FORFAIT EFFECTIF (15/09). Un commerçant en essai de Vendre voyait
    // l'onglet des bons, les allumait, et sa fiche n'affichait jamais le
    // bouton : cette route lisait le forfait CHOISI. Trouvé en relisant le
    // règlement du concours, qui promet des bons chez les partenaires.
    const actif = fichePubliee(c) && !!c.bons_cadeaux_actif
      && canDo(planEffectif(c), 'bons_cadeaux') && !!c.stripe_account_charges_enabled

    return NextResponse.json({
      ok: true,
      actif,
      validite_mois: c?.bons_cadeaux_validite_mois || 12,
    })
  } catch (e) {
    console.error('[bons-cadeaux/config]', e)
    return NextResponse.json({ ok: false, error: 'Erreur' }, { status: 500 })
  }
}
