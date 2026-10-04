// POST /api/rdv/place-prise — une place vient d'être reprise depuis l'agenda :
// la liste d'attente de cette séance l'apprend (LA-02, 04/10).
//
// 🔴 SEUL LE TUNNEL EN LIGNE PRÉVENAIT LA FILE. `placePrise` vit dans
// `creerReservationRdv`, et trois chemins reprennent une place sans passer par
// lui : la saisie au comptoir et le déplacement, qui écrivent depuis le
// navigateur du commerce, et la remise en confirmé. Une place libérée avait
// lancé la chaîne de notifications ; la commerçante la reprenait au comptoir ;
// les notifications partaient quand même, vers un cours de nouveau complet, et
// la personne servie restait dans la file.
//
// ⚠️ ON NE CROIT QUE LA BASE : l'écran envoie des identifiants, la route relit
// chaque rendez-vous (séance, client) et ne garde que ceux du commerce gardé.
//
// Body : { rdv_ids: [uuid, ...] }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe } from '@/lib/equipe-server'
import { placePrise } from '@/lib/attente-rdv-server'

// Une série répétée au comptoir pose au plus une séance par semaine sur l'horizon.
const MAX_IDS = 60

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const ids = [...new Set((Array.isArray(corps?.rdv_ids) ? corps.rdv_ids : []).map(String).filter(Boolean))].slice(0, MAX_IDS)
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'rdv_ids requis.' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LA GARDE PORTE SUR LE PREMIER, LE COMMERCE BORNE LES AUTRES : un
    // identifiant d'un autre commerce glissé dans la liste est ignoré.
    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_reservations', ids[0], 'agenda')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: premier, error: errP } = await supabase
      .from('rdv_reservations').select('commercant_id').eq('id', ids[0]).maybeSingle()
    if (errP || !premier?.commercant_id) return NextResponse.json({ ok: false, error: 'Rendez-vous introuvable.' }, { status: 404 })

    const { data: rdvs, error: errR } = await supabase
      .from('rdv_reservations')
      .select('id, prestation_id, date_rdv, heure_debut, client_id, client_email')
      .in('id', ids)
      .eq('commercant_id', premier.commercant_id)
      .eq('statut', 'confirme')
      .is('deleted_at', null)
    if (errR) return NextResponse.json({ ok: false, error: 'Lecture des rendez-vous impossible.' }, { status: 500 })

    let servis = 0, annules = 0, echecs = 0
    for (const r of rdvs || []) {
      const suite = await placePrise(supabase, {
        prestationId: r.prestation_id,
        dateRdv: r.date_rdv,
        heureDebut: String(r.heure_debut || '').slice(0, 5),
        clientId: r.client_id || null,
        clientEmail: r.client_email || null,
      })
      if (!suite?.ok) { echecs++; console.error('[rdv/place-prise] file non mise à jour', r.id, suite?.error); continue }
      servis += Number(suite.servis) || 0
      annules += Number(suite.annules) || 0
    }
    return NextResponse.json({ ok: echecs === 0, servis, annules, echecs })
  } catch (e) {
    console.error('[rdv/place-prise]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
