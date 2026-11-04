// POST /api/rdv/prix-commercant
//
// LA PROMO D'UN RENDEZ-VOUS ENCODÉ PAR LE COMMERCE (03/11, Alex au tableau).
// Trois gestes, pour le patron et l'équipe (case « agenda ») :
//   • 'apercu'    { commercant_id, prestation_id, date, heure, client_email, client_telephone }
//                 ce que la fenêtre propose avant d'enregistrer ;
//   • 'appliquer' { rdv_id }  juste après l'enregistrement par le patron :
//                 le serveur pose la promo ou le tarif découverte ;
//   • 'retirer'   { rdv_id }  le commerçant retire la réduction (fenêtre de
//                 déplacement).
//
// 🔴 LE SERVEUR CALCULE, LA FENÊTRE NE DIT QUE OUI OU NON. Le prix barré d'un
// email (« Tu as économisé 6 € ») ne s'invente pas depuis un navigateur : la
// base refuse d'ailleurs que le navigateur écrive `prix_plein` ou
// `promo_deal_id` (MIGRATION_PROMO_RDV_COMMERCANT_04_11.sql).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe, gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { prixPourLeCommerce, COLONNES_PRESTATION_PRIX } from '@/lib/prix-rdv-commercant-server'
import { champsPrixRdv, reductionDuRdv } from '@/lib/prix-rdv-commercant'

export const dynamic = 'force-dynamic'

const COLONNES_RDV = 'id, commercant_id, prestation_id, date_rdv, heure_debut, client_email, client_telephone, abonnement_id, source, statut, prix_estime, prix_plein, promo_deal_id, tarif_decouverte, acompte_paye'

const refus = (status, error) => NextResponse.json({ ok: false, error }, { status })

async function lirePrestation(admin, commercantId, prestationId) {
  const { data, error } = await admin.from('rdv_prestations').select(COLONNES_PRESTATION_PRIX)
    .eq('id', prestationId).eq('commercant_id', commercantId).maybeSingle()
  if (error) throw new Error(`lecture de la prestation : ${error.message}`)
  return data
}

async function acompteDuCommerce(admin, commercantId, presta) {
  if (presta?.acompte_pourcent) return presta.acompte_pourcent
  const { data, error } = await admin.from('commercants').select('rdv_acompte_global').eq('id', commercantId).maybeSingle()
  if (error) throw new Error(`lecture du commerce : ${error.message}`)
  return data?.rdv_acompte_global || 0
}

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const action = corps.action

    if (action === 'apercu') {
      const garde = await gardeEquipe(request, admin, corps.commercant_id, 'agenda')
      if (!garde.ok) return refus(garde.status, garde.error)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(corps.date || ''))) return refus(400, 'Date invalide.')
      const presta = await lirePrestation(admin, corps.commercant_id, corps.prestation_id)
      if (!presta) return refus(404, 'Cette prestation n’est plus disponible.')
      const { plein, reduction } = await prixPourLeCommerce(admin, presta, {
        date: corps.date, heure: corps.heure || null,
        email: String(corps.client_email || '').trim() || null,
        telephone: String(corps.client_telephone || '').trim() || null,
      })
      return NextResponse.json({ ok: true, plein, reduction })
    }

    if (action !== 'appliquer' && action !== 'retirer') return refus(400, 'Geste inconnu.')

    // ⚠️ LE COMMERCE SE DÉDUIT DU RENDEZ-VOUS, jamais du corps de la requête.
    const garde = await gardeLigneEquipe(request, admin, 'rdv_reservations', corps.rdv_id, 'agenda')
    if (!garde.ok) return refus(garde.status, garde.error)
    const { data: rdv, error: errRdv } = await admin.from('rdv_reservations').select(COLONNES_RDV).eq('id', corps.rdv_id).maybeSingle()
    if (errRdv) throw new Error(`lecture du rendez-vous : ${errRdv.message}`)
    if (!rdv) return refus(404, 'Ce rendez-vous n’existe plus.')
    if (rdv.abonnement_id) return refus(409, 'Une séance d’abonnement n’a pas de prix à remiser.')
    const presta = await lirePrestation(admin, rdv.commercant_id, rdv.prestation_id)
    if (!presta) return refus(404, 'Cette prestation n’est plus disponible.')
    const acomptePct = await acompteDuCommerce(admin, rdv.commercant_id, presta)

    let champs
    if (action === 'appliquer') {
      // 🔴 SEULEMENT SUR UN RENDEZ-VOUS ENCODÉ PAR LE COMMERCE, AU PRIX PLEIN :
      // une réservation en ligne a déjà reçu sa promo du serveur, et une
      // réduction déjà posée ne se pose pas deux fois.
      if (rdv.source !== 'commercant') return refus(409, 'Ce rendez-vous a été pris en ligne : son prix est déjà fixé.')
      if (reductionDuRdv(rdv)) return NextResponse.json({ ok: true, inchange: true })
      const { plein, reduction } = await prixPourLeCommerce(admin, presta, {
        date: rdv.date_rdv, heure: rdv.heure_debut, email: rdv.client_email, telephone: rdv.client_telephone,
      })
      if (!reduction) return NextResponse.json({ ok: true, inchange: true })
      champs = champsPrixRdv({ plein, reduction, garder: true, acomptePct, acomptePaye: rdv.acompte_paye === true })
    } else {
      if (!reductionDuRdv(rdv)) return NextResponse.json({ ok: true, inchange: true })
      // Le prix plein : celui gravé avec la promo, sinon (découverte) celui de la prestation.
      const plein = rdv.prix_plein != null ? Number(rdv.prix_plein) : (presta.prix != null ? Number(presta.prix) : null)
      champs = champsPrixRdv({ plein, reduction: null, garder: false, acomptePct, acomptePaye: rdv.acompte_paye === true })
    }

    const { error: errMaj } = await admin.from('rdv_reservations').update(champs).eq('id', rdv.id)
    if (errMaj) throw new Error(`mise à jour du prix : ${errMaj.message}`)
    await journaliserGeste(admin, garde, {
      action: action === 'appliquer' ? 'rdv_promo_appliquee' : 'rdv_promo_retiree', cible_type: 'rdv', cible_id: rdv.id,
      details: { prix_estime: champs.prix_estime, prix_plein: champs.prix_plein },
    })
    return NextResponse.json({ ok: true, prix_estime: champs.prix_estime })
  } catch (e) {
    console.error('[rdv/prix-commercant] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
