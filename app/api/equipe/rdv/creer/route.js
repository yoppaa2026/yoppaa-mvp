// POST /api/equipe/rdv/creer
// Body : { commercant_id, prestation_id, date, heure, couverts,
//          client_prenom, client_nom, client_telephone, client_email, notes_client }
//
// UN MEMBRE DE L'ÉQUIPE POSE UNE RÉSERVATION (29/09, étape 3b). Il le fait
// dans la fenêtre du patron (`ModalNouveauRdv`, qui calcule les heures libres
// avec le même code pour les deux) ; la fenêtre envoie ici au lieu d'écrire.
//
// 🔴 LE SERVEUR REFAIT CE QUE LA FENÊTRE A VÉRIFIÉ, avec les MÊMES fonctions :
//   • la prestation appartient au commerce, les couverts sont dans ses bornes
//     (`couvertsValides`) ;
//   • la durée est celle du groupe (`dureeDuGroupe`, sur la table de
//     référence en inventaire, comme la fenêtre) ;
//   • le créneau accepte la réservation (`creneauAcceptable` : ouverture,
//     pause, chevauchement), sur les réservations RELUES en base ;
//   • le prix et l'acompte viennent de la prestation, jamais de l'écran ;
//   • puis `creerReservationRdv`, la fonction de TOUTES les créations : place,
//     table, salle, lieu, numéro.
//
// ⚠️ CE QUE LE MEMBRE NE FAIT PAS, ET C'EST VOULU : ni séance d'abonnement, ni
// série sur plusieurs semaines. Ce sont des gestes de contrat, ils restent au
// patron.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe, journaliserGeste } from '@/lib/equipe-server'
import { creneauAcceptable, creneauxDuJour } from '@/lib/deplacement-rdv'
import { capacitePrestation, estParCouverts, bornesCouverts, couvertsValides, COLONNES_COUVERTS } from '@/lib/cours-collectifs'
import { enModeInventaire, formatPourAffichage, dureeDuGroupe } from '@/lib/inventaire-salle'
import { creerReservationRdv } from '@/lib/rdv-creation-server'
import { COLONNES_PRESTATION_SANS_COUVERTS, COLONNES_CRENEAU_RDV_EQUIPE } from '@/lib/equipe-poste'

export const dynamic = 'force-dynamic'

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
// Le jour d'une date civile : posée à midi en temps universel, elle ne glisse pas.
const jourDe = (dateStr) => JOURS[new Date(`${dateStr}T12:00:00Z`).getUTCDay()]
const texte = (v, max) => String(v ?? '').trim().slice(0, max)

// Les refus de `creerReservationRdv`, dits comme le patron les lirait.
const REFUS = {
  prestation_introuvable: 'Cette prestation n’existe plus.',
  prestation_hors_commerce: 'Cette prestation n’appartient pas à ce commerce.',
  couverts_invalides: 'Ce nombre de personnes ne convient pas à cette table.',
  groupe_trop_grand: 'Aucune table n’accueille un groupe de cette taille.',
  salle_complete: 'La salle est complète à cette heure pour ce groupe. Choisis une autre heure.',
  cadence_atteinte: 'La cuisine a déjà trop d’arrivées sur ce quart d’heure.',
  place_prise: 'Cette place vient d’être prise pendant ta saisie. Réessaie.',
}

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const { commercant_id, prestation_id, date, heure } = corps
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'agenda')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return NextResponse.json({ ok: false, error: 'Date invalide.' }, { status: 400 })
    if (!/^\d{2}:\d{2}$/.test(String(heure || ''))) return NextResponse.json({ ok: false, error: 'Heure invalide.' }, { status: 400 })
    const client = {
      client_prenom: texte(corps.client_prenom, 60),
      client_nom: texte(corps.client_nom, 80),
      client_telephone: texte(corps.client_telephone, 30),
      client_email: texte(corps.client_email, 254) || null,
    }
    if (!client.client_prenom || !client.client_nom || !client.client_telephone) {
      return NextResponse.json({ ok: false, error: 'Indique le prénom, le nom et le téléphone du client.' }, { status: 400 })
    }

    // ── Ce que la fenêtre avait sous les yeux, relu en base ─────────────────
    const [commerce, prestations, creneaux, rdvsDuJour] = await Promise.all([
      admin.from('commercants').select('id, horaires_detail, rdv_acompte_global').eq('id', commercant_id).maybeSingle(),
      admin.from('rdv_prestations').select(`${COLONNES_PRESTATION_SANS_COUVERTS}, ${COLONNES_COUVERTS}`)
        .eq('commercant_id', commercant_id).eq('actif', true).is('deleted_at', null),
      admin.from('rdv_creneaux').select(COLONNES_CRENEAU_RDV_EQUIPE)
        .eq('commercant_id', commercant_id).eq('actif', true).is('deleted_at', null),
      admin.from('rdv_reservations').select('id, date_rdv, statut, prestation_id, heure_debut, heure_fin')
        .eq('commercant_id', commercant_id).eq('date_rdv', date).is('deleted_at', null),
    ])
    for (const [quoi, r] of [['commerce', commerce], ['prestations', prestations], ['créneaux', creneaux], ['réservations', rdvsDuJour]]) {
      if (r.error) throw new Error(`lecture des ${quoi} : ${r.error.message}`)
    }
    if (!commerce.data) return NextResponse.json({ ok: false, error: 'commerce introuvable' }, { status: 404 })
    const formats = prestations.data || []
    const presta = formats.find(p => String(p.id) === String(prestation_id))
    if (!presta) return NextResponse.json({ ok: false, error: 'Cette prestation n’est plus disponible.' }, { status: 404 })

    // ── Les couverts et la durée : les règles de la fenêtre ────────────────
    const couverts = estParCouverts(presta)
      ? couvertsValides(presta, corps.couverts === '' || corps.couverts == null ? bornesCouverts(presta).min : corps.couverts)
      : 1
    if (couverts === null) {
      const { min, max } = bornesCouverts(presta)
      return NextResponse.json({ ok: false, error: `Cette table accueille de ${min} à ${max} personnes. Corrige le nombre.` }, { status: 400 })
    }
    const reference = estParCouverts(presta) && enModeInventaire(formats) ? (formatPourAffichage(formats, couverts) || presta) : presta
    const dureeMinutes = dureeDuGroupe({ prestation: reference, formats, couverts })

    const jour = jourDe(date)
    const verdict = creneauAcceptable({
      dateStr: date, heureDebut: heure, dureeMinutes,
      horaireJour: commerce.data?.horaires_detail?.[jour] || null,
      creneauxJour: creneauxDuJour(creneaux.data || [], { dateStr: date, jour }),
      rdvsExistants: rdvsDuJour.data || [],
      capacite: capacitePrestation(presta), prestationId: presta.id, prestations: formats,
    })
    if (!verdict.ok) return NextResponse.json({ ok: false, error: verdict.message }, { status: 409 })

    // ── Le prix et l'acompte : la prestation, comme la fenêtre du patron ───
    const prix = presta.prix != null ? Number(presta.prix) : null
    const acomptePct = presta.acompte_pourcent || commerce.data?.rdv_acompte_global || 0
    const acompte = prix != null && acomptePct > 0 ? Math.round(prix * acomptePct) / 100 : null

    const res = await creerReservationRdv(admin, {
      commercantId: commercant_id, prestationId: presta.id, dateRdv: date, heureDebut: heure,
      champs: {
        ...client,
        client_id: null,
        prix_estime: prix,
        acompte_montant: acompte,
        acompte_du: acompte,
        acompte_paye: false,
        statut: 'confirme',
        notes_client: texte(corps.notes_client, 1000) || null,
        rgpd_marketing: false,
        source: 'commercant',
        couverts,
      },
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: REFUS[res.code] || 'La réservation n’a pas pu être posée. Réessaie.', code: res.code }, { status: 409 })
    }

    await journaliserGeste(admin, garde, {
      action: 'rdv_cree', cible_type: 'rdv', cible_id: res.rdv.id,
      details: { date, heure, prestation: presta.nom || null, couverts },
    })
    return NextResponse.json({ ok: true, rdv_id: res.rdv.id })
  } catch (e) {
    console.error('[equipe/rdv/creer] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
