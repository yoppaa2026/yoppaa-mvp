// POST /api/fiche/demander-publication
// Body : { commercant_id }
//
// LE COMMERÇANT DEMANDE LA MISE EN LIGNE DE SA FICHE (28/09).
//
// Il ne la publie pas : ça reste le clic d'Alex, et le verrou en base
// (`commercants_colonnes_reservees`) l'interdit de toute façon. Il signale
// seulement que sa fiche est prête, et Alex en est prévenu par email.
//
// 🔴 LA FICHE EST RECALCULÉE ICI. Le bouton du tableau de bord ne s'allume que
// sur une fiche complète, mais un bouton se contourne : c'est le serveur qui
// décide si la demande est recevable.
//
// ⚠️ UNE SEULE ALERTE PAR DEMANDE. Un second clic ne renvoie pas d'email à
// Alex : la demande est déjà dans sa liste.

import { NextResponse } from 'next/server'
import { gardeCommercant, clientAdmin } from '@/lib/api-auth'
import { bilanDeLaFiche } from '@/lib/fiche-complete-server'
import { ficheAPublier, phraseManquants } from '@/lib/fiche-complete'
import { envoyerAuAdmin, emailDemandePublicationAdmin } from '@/lib/resend'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeCommercant(request, admin, commercant_id)
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })

    const { commercant, bilan } = await bilanDeLaFiche(admin, commercant_id)
    if (!commercant) return NextResponse.json({ ok: false, error: 'commerce introuvable' }, { status: 404 })

    if (!ficheAPublier(commercant)) {
      return NextResponse.json({ ok: false, error: 'ta fiche n’attend pas de mise en ligne' }, { status: 409 })
    }
    if (!bilan.complet) {
      return NextResponse.json({
        ok: false,
        error: `il te manque encore ${phraseManquants(bilan.manquants)}`,
        manquants: bilan.manquants.map(m => m.cle),
      }, { status: 409 })
    }
    if (commercant.publication_demandee_at) {
      return NextResponse.json({ ok: true, deja: true, demandee_le: commercant.publication_demandee_at })
    }

    const maintenant = new Date().toISOString()
    // ⚠️ `.is(..., null)` : si deux clics arrivent ensemble, un seul écrit, et
    // donc une seule alerte part.
    const { data: ecrit, error: errMaj } = await admin
      .from('commercants')
      .update({ publication_demandee_at: maintenant })
      .eq('id', commercant_id)
      .is('publication_demandee_at', null)
      .select('id')
    if (errMaj) return NextResponse.json({ ok: false, error: `demande non enregistrée : ${errMaj.message}` }, { status: 500 })
    if (!ecrit || ecrit.length === 0) return NextResponse.json({ ok: true, deja: true })

    const alerte = await envoyerAuAdmin({
      subject: `Fiche à publier : ${commercant.nom}`,
      html: emailDemandePublicationAdmin({ nom: commercant.nom, commercant_id }),
    })
    // La demande est enregistrée et visible dans l'admin : un email perdu ne
    // l'annule pas, mais il se lit dans les journaux.
    if (!alerte?.ok) console.error('[fiche/demander-publication] alerte admin non envoyée', alerte?.error)

    return NextResponse.json({ ok: true, demandee_le: maintenant })
  } catch (e) {
    console.error('[fiche/demander-publication] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
