// POST /api/rdv/fermeture-file — une fermeture vient d'être posée : les files
// d'attente qu'elle rend sans objet se vident (oubli relevé le 04/10).
//
// 🔴 UN COURS ANNULÉ GARDAIT SA LISTE D'ATTENTE JUSQU'À LA DATE, et une chaîne
// de notifications « une place s'est libérée » déjà programmée partait quand
// même. Même chose pour un jour fermé. Les fermetures s'écrivent depuis
// l'écran du commerce ; cette route passe derrière, côté serveur.
//
// ⚠️ ON NE CROIT QUE LA BASE : l'écran n'envoie que l'identifiant de la
// fermeture. Dates, cours et heure sont relus ici, et la règle (quelles
// attentes tombent) vit dans `attentesFermeesPar`, exécutée au banc.
//
// Body : { fermeture_id }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe } from '@/lib/equipe-server'
import { fermerLesFiles } from '@/lib/attente-rdv-server'

export async function POST(request) {
  try {
    const { fermeture_id } = await request.json().catch(() => ({}))
    if (!fermeture_id) return NextResponse.json({ ok: false, error: 'fermeture_id requis.' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_fermetures', fermeture_id, 'agenda')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: fermeture, error } = await supabase
      .from('rdv_fermetures')
      .select('id, commercant_id, praticien_id, date_debut, date_fin, prestation_id, heure_debut, deleted_at')
      .eq('id', fermeture_id)
      .maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: 'Lecture de la fermeture impossible.' }, { status: 500 })
    if (!fermeture || fermeture.deleted_at) return NextResponse.json({ ok: true, retires: 0, prevenus: 0 })

    const res = await fermerLesFiles(supabase, fermeture)
    if (!res.ok) {
      console.error('[rdv/fermeture-file] file non vidée', res.error)
      return NextResponse.json({ ok: false, error: 'La liste d’attente n’a pas pu être vidée.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, retires: res.retires, prevenus: res.prevenus })
  } catch (e) {
    console.error('[rdv/fermeture-file]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
