// POST /api/equipe/poste
// Body : { commercant_id }
//
// CE QUE LE POSTE ÉQUIPE AFFICHE, SELON LES CASES DE LA PERSONNE (29/09).
//
// 🔴 CHAQUE PARTIE N'EST LUE QUE SI SA CASE EST OUVERTE (`garde.permis`), et
// jamais avec `*` (`lib/equipe-poste.js`). Un livreur ne reçoit pas l'agenda ;
// un serveur sans « Commandes » ne reçoit pas les commandes. Ce que l'écran
// n'a pas reçu, il ne peut pas l'afficher, même bricolé.
//
// ⚠️ LECTURE SEULE À CETTE ÉTAPE. Les gestes (créer, déplacer, marquer venu,
// changer un statut) viennent à l'étape 3, chacun par sa route.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe } from '@/lib/equipe-server'
import { CLES_DROITS } from '@/lib/equipe'
import { jourBruxelles } from '@/lib/timezone'
import {
  COLONNES_RDV_EQUIPE, COLONNES_CRENEAU_RDV_EQUIPE, COLONNES_PRATICIEN_EQUIPE, COLONNES_COMMANDE_EQUIPE, COLONNES_PRESTATION_SAISIE,
  COLONNES_COMMERCE_POSTE, fenetres, livraisonPourLeLivreur, livraisonDuJour, trierLivraisons,
} from '@/lib/equipe-poste'
import { STATUTS_COMMANDE_EN_COURS } from '@/lib/statuts-commande'

export const dynamic = 'force-dynamic'

// ⚠️ Une lecture ratée lève : un agenda vide sur une panne ferait croire au
// personnel qu'il n'y a personne ce soir.
const verifier = (quoi, { data, error }) => {
  if (error) throw new Error(`${quoi} : ${error.message}`)
  return data || []
}

export async function POST(request) {
  try {
    const { commercant_id } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, ['agenda', 'commandes', 'livraisons', 'comptoir'])
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    const { permis } = garde

    const { data: commerce, error: errC } = await admin.from('commercants').select(COLONNES_COMMERCE_POSTE).eq('id', commercant_id).maybeSingle()
    if (errC) throw new Error(`lecture du commerce : ${errC.message}`)
    if (!commerce) return NextResponse.json({ ok: false, error: 'commerce introuvable' }, { status: 404 })

    const aujourdhui = jourBruxelles()
    const f = fenetres(aujourdhui, { horizonCommande: commerce.horizon_commande })
    const reponse = { ok: true, aujourdhui, commerce, role: garde.role, prenom: garde.membre?.prenom || null, droits: {} }
    for (const cle of CLES_DROITS) reponse.droits[cle] = permis[cle] === true

    if (permis.agenda) {
      const [rdvs, creneaux, praticiens, prestations] = await Promise.all([
        admin.from('rdv_reservations').select(COLONNES_RDV_EQUIPE)
          .eq('commercant_id', commercant_id).is('deleted_at', null).gte('date_rdv', f.agenda.debut).lte('date_rdv', f.agenda.fin)
          .order('date_rdv').order('heure_debut').limit(3000),
        admin.from('rdv_creneaux').select(COLONNES_CRENEAU_RDV_EQUIPE)
          .eq('commercant_id', commercant_id).eq('actif', true).is('deleted_at', null),
        admin.from('rdv_praticiens').select(COLONNES_PRATICIEN_EQUIPE)
          .eq('commercant_id', commercant_id).is('deleted_at', null).order('ordre'),
        // La fenêtre de saisie (étape 3b) : même liste, même filtre, même ordre
        // que le tableau de bord.
        admin.from('rdv_prestations').select(COLONNES_PRESTATION_SAISIE)
          .eq('commercant_id', commercant_id).eq('actif', true).is('deleted_at', null)
          .order('ordre', { ascending: true }).order('created_at', { ascending: true }),
      ])
      reponse.agenda = {
        rdvs: verifier('lecture de l’agenda', rdvs),
        creneaux: verifier('lecture des créneaux', creneaux),
        praticiens: verifier('lecture de l’équipe de l’agenda', praticiens),
        prestations: verifier('lecture des prestations', prestations),
      }
    }

    if (permis.commandes || permis.livraisons) {
      // ⚠️ `paiement_en_attente` EXCLUE : une commande pas encore payée n'existe
      // pas pour le comptoir (même règle que le tableau de bord). Et les
      // commandes encore ouvertes d'un jour passé reviennent, pour qu'aucune
      // ne soit oubliée au fond d'un tiroir.
      const lues = verifier('lecture des commandes', await admin.from('commandes').select(COLONNES_COMMANDE_EQUIPE)
        .eq('commercant_id', commercant_id).neq('statut', 'paiement_en_attente')
        .or(`and(date_commande.gte.${f.commandes.debut},date_commande.lte.${f.commandes.fin}),statut.in.(${STATUTS_COMMANDE_EN_COURS.join(',')})`)
        .order('date_commande', { ascending: true, nullsFirst: false }).order('created_at').limit(1000))

      if (permis.commandes) reponse.commandes = lues
      // 🔴 LE LIVREUR NE REÇOIT QUE SA VUE RÉDUITE, jamais les lignes complètes.
      if (permis.livraisons) reponse.livraisons = trierLivraisons(lues.filter(c => livraisonDuJour(c, aujourdhui)).map(livraisonPourLeLivreur))
    }

    return NextResponse.json(reponse)
  } catch (e) {
    console.error('[equipe/poste] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
