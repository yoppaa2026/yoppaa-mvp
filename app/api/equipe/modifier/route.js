// POST /api/equipe/modifier
// Body : { commercant_id, membre_id, droits: {...}, expire_le }
//
// LE PATRON CHANGE LES CASES D'UNE PERSONNE, OU SA DATE DE FIN (29/09).
//
// ⚠️ LE MEMBRE SE CHERCHE DANS LE COMMERCE DU PATRON, jamais par son seul
// identifiant : sinon un patron pourrait modifier l'équipe d'un autre en
// devinant un numéro.
//
// ⚠️ `expire_le: null` RETIRE la date de fin : c'est un choix, pas un oubli.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardePatronEquipe, journaliser, COLONNES_MEMBRE } from '@/lib/equipe-server'
import { droitsDepuis, refusDroits, refusExpiration, membrePourLePatron, commerceAUneEquipe } from '@/lib/equipe'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const { commercant_id, membre_id } = corps
    const admin = clientAdmin()
    const garde = await gardePatronEquipe(request, admin, commercant_id)
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!commerceAUneEquipe(garde.commercant)) return NextResponse.json({ ok: false, error: 'L’équipe fait partie de la formule Vendre.' }, { status: 409 })
    if (!membre_id) return NextResponse.json({ ok: false, error: 'personne inconnue' }, { status: 400 })

    const maintenant = new Date()
    const droits = droitsDepuis(corps.droits)
    const refus = refusDroits(droits) || refusExpiration(corps.expire_le || null, maintenant)
    if (refus) return NextResponse.json({ ok: false, error: refus }, { status: 409 })
    const expireLe = corps.expire_le ? new Date(corps.expire_le).toISOString() : null

    const { data: avant, error: errLu } = await admin.from('equipe_membres').select(COLONNES_MEMBRE)
      .eq('id', membre_id).eq('commercant_id', commercant_id).neq('statut', 'retire').maybeSingle()
    if (errLu) throw new Error(`lecture du membre : ${errLu.message}`)
    if (!avant) return NextResponse.json({ ok: false, error: 'personne introuvable dans ton équipe' }, { status: 404 })

    const { data: apres, error } = await admin.from('equipe_membres')
      .update({ ...droits, expire_le: expireLe, updated_at: maintenant.toISOString() })
      .eq('id', membre_id).eq('commercant_id', commercant_id).neq('statut', 'retire').select(COLONNES_MEMBRE).maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: `modification non enregistrée : ${error.message}` }, { status: 500 })
    if (!apres) return NextResponse.json({ ok: false, error: 'personne introuvable dans ton équipe' }, { status: 404 })

    const garder = (m) => ({ droit_agenda: m.droit_agenda, droit_commandes: m.droit_commandes, droit_livraisons: m.droit_livraisons, droit_argent: m.droit_argent, droit_comptoir: m.droit_comptoir, expire_le: m.expire_le })
    await journaliser(admin, {
      commercant_id, auth_user_id: garde.user.id, action: 'droits_modifies', cible_type: 'membre', cible_id: membre_id,
      details: { avant: garder(avant), apres: garder(apres) },
    })
    return NextResponse.json({ ok: true, membre: membrePourLePatron(apres, maintenant) })
  } catch (e) {
    console.error('[equipe/modifier] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
