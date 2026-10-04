// POST /api/rdv/reconfirmer — remettre en confirmé un rendez-vous annulé par le
// commerce, ou noté absent (Annul-I2, 04/10).
//
// 🔴 C'ÉTAIT UNE ÉCRITURE DEPUIS LE NAVIGATEUR, SANS REGARDER L'ARGENT. Après
// une annulation, l'acompte était remboursé, les bons et la récompense rendus,
// les produits annulés : « confirmé » par-dessus donnait un rendez-vous gratuit,
// et le client, qui avait reçu « annulé », n'en savait rien. Une place reprise
// entre-temps donnait une erreur brute de la base.
//
// ⚠️ LA RÈGLE (quand oui, quand non) VIT DANS `lib/rdv-reconfirmation`, exécutée
// au banc. Ici on relit l'état réel en base, on l'applique, on écrit sous
// verrou, et on prévient la personne.
//
// Body : { rdv_id }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { refusRemiseEnConfirme } from '@/lib/rdv-reconfirmation'
import { fermetureQuiBloque, estFermetureDeSeance } from '@/lib/fermetures-rdv'
import { programmerRappelRdv } from '@/lib/rappels'
import { creneauDejaCommence } from '@/lib/timezone'
import { envoyerAuYopper, emailRdvRetabli } from '@/lib/resend'
import { envoyerPushParExternalId } from '@/lib/onesignal'
import { normaliserEmail } from '@/lib/email-normalise'
import { motsReservation } from '@/lib/reservation-metier'
import { jourLisible } from '@/lib/attente-rdv'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json().catch(() => ({}))
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis.' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ MÊME GARDE QUE L'ANNULATION : le patron, l'admin, ou l'équipe « Agenda ».
    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_reservations', rdv_id, 'agenda')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    // ⚠️ CHAQUE COLONNE LUE PLUS BAS EST ICI. Absente du select, elle vaudrait
    // `undefined`, donc « rien n'a bougé », et le rendez-vous reviendrait gratuit.
    const { data: rdv, error: errR } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, commercant_id, prestation_id, praticien_id, date_rdv, heure_debut,
        stripe_refund_amount, commande_id, abonnement_id, fidelite_recompense_id, empreinte_debit_at,
        client_id, client_email, client_prenom,
        commercant:commercants(nom, slug, categorie),
        prestation:rdv_prestations(nom)
      `)
      .eq('id', rdv_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (errR) return NextResponse.json({ ok: false, error: 'Lecture du rendez-vous impossible.' }, { status: 500 })
    if (!rdv) return NextResponse.json({ ok: false, error: 'Rendez-vous introuvable.' }, { status: 404 })
    if (rdv.statut === 'confirme') return NextResponse.json({ ok: true, deja: true })

    // ─── L'état réel, relu en base ─────────────────────────────────────────
    // 🔴 UNE LECTURE RATÉE REFUSE, ELLE NE LAISSE PAS PASSER : « je n'ai pas pu
    // voir si l'argent a bougé » n'est pas « l'argent n'a pas bougé ».
    const lectures = await Promise.all([
      supabase.from('bons_cadeaux_mouvements').select('montant').eq('rdv_id', rdv.id).eq('source', 'annulation'),
      rdv.fidelite_recompense_id
        ? supabase.from('fidelite_recompenses').select('utilisee_at').eq('id', rdv.fidelite_recompense_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      rdv.commande_id
        ? supabase.from('commandes').select('statut').eq('id', rdv.commande_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      rdv.abonnement_id
        ? supabase.from('abonnements').select('statut').eq('id', rdv.abonnement_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase.from('rdv_fermetures')
        .select('date_debut, date_fin, praticien_id, prestation_id, heure_debut')
        .eq('commercant_id', rdv.commercant_id)
        .lte('date_debut', rdv.date_rdv).gte('date_fin', rdv.date_rdv),
    ])
    const echec = lectures.find(l => l?.error)
    if (echec) {
      console.error('[rdv/reconfirmer] lecture de l’état KO', echec.error)
      return NextResponse.json({ ok: false, error: 'Impossible de vérifier ce qui a été rendu à cette personne. Réessaie dans un instant.' }, { status: 500 })
    }
    const [mvts, recompense, commande, abonnement, fermetures] = lectures.map(l => l.data)
    const fermeture = fermetureQuiBloque(fermetures || [], {
      dateStr: rdv.date_rdv,
      praticienId: rdv.praticien_id || null,
      prestationId: rdv.prestation_id,
      heure: String(rdv.heure_debut || '').slice(0, 5),
    })

    const refusMotif = refusRemiseEnConfirme({
      statut: rdv.statut,
      rembourse: rdv.stripe_refund_amount,
      bonsRendus: (mvts || []).reduce((s, m) => s + (Number(m.montant) || 0), 0),
      recompenseRendue: !!rdv.fidelite_recompense_id && !!recompense && !recompense.utilisee_at,
      produitsAnnules: commande?.statut === 'annulee_client_refund',
      absenceFacturee: !!rdv.empreinte_debit_at,
      abonnementResilie: abonnement?.statut === 'resilie',
      fermeture: fermeture ? (estFermetureDeSeance(fermeture) ? 'seance' : 'jour') : null,
    })
    if (refusMotif) return NextResponse.json({ ok: false, code: refusMotif.code, error: refusMotif.message }, { status: 409 })

    // ─── L'écriture, sous verrou ───────────────────────────────────────────
    // ⚠️ `.eq('statut', rdv.statut)` : un seul gagnant si deux écrans cliquent.
    // 🔴 ET LA PLACE A PU ÊTRE REPRISE : l'index de place (23505) ou la
    // contrainte de chevauchement (23P01) refusent, et on le dit en français.
    const { data: ecrit, error: errU } = await supabase
      .from('rdv_reservations')
      .update({ statut: 'confirme', motif_annulation: null })
      .eq('id', rdv.id).eq('statut', rdv.statut)
      .select('id')
    if (errU) {
      if (errU.code === '23505' || errU.code === '23P01') {
        return NextResponse.json({ ok: false, code: 'place_reprise', error: 'Cette place a été reprise entre-temps : ce rendez-vous ne peut pas revenir à cette heure. Crée-lui un nouveau rendez-vous à un autre moment.' }, { status: 409 })
      }
      console.error('[rdv/reconfirmer] UPDATE KO', errU)
      return NextResponse.json({ ok: false, error: 'Le rendez-vous n’a pas pu être remis en confirmé.' }, { status: 500 })
    }
    if (!ecrit || ecrit.length === 0) return NextResponse.json({ ok: true, deja: true })

    // Le rappel de la veille, que l'annulation avait retiré. AU MIEUX.
    const passe = creneauDejaCommence(rdv.date_rdv, String(rdv.heure_debut || '').slice(0, 5))
    if (!passe) {
      const rappel = await programmerRappelRdv(rdv.id, supabase)
      if (!rappel?.ok) console.warn('[rdv/reconfirmer] rappel non reprogrammé', rappel?.error)
    }

    // ─── La personne l'apprend, par email et par notification ──────────────
    // ⚠️ AU MIEUX : un message raté ne défait pas la remise en confirmé, et
    // l'écran dit ce qui est parti.
    let email = 'sans_email'
    if (rdv.client_email) {
      const html = emailRdvRetabli({
        yopper_prenom: rdv.client_prenom || '',
        commercant_nom: rdv.commercant?.nom || 'Le commerce',
        commercant_slug: rdv.commercant?.slug || null,
        commercant_categorie: rdv.commercant?.categorie || null,
        prestation_nom: rdv.prestation?.nom || '',
        date_rdv: rdv.date_rdv,
        heure_debut: rdv.heure_debut,
        passe,
      })
      const mots = motsReservation(rdv.commercant)
      const envoi = await envoyerAuYopper({
        to: rdv.client_email,
        subject: passe
          ? `${rdv.commercant?.nom || 'Ton commerce'} : oublie notre message précédent`
          : `${mots.laSienne.charAt(0).toUpperCase()}${mots.laSienne.slice(1)} chez ${rdv.commercant?.nom || 'ton commerce'} est ${mots.participeMaintenu}`,
        html,
      })
      email = envoi?.ok ? 'envoye' : 'echec'
      if (!envoi?.ok) console.error('[rdv/reconfirmer] email KO', envoi?.error)
    }

    let notifie = false
    if (!passe) {
      try {
        let pourQui = rdv.client_id || null
        if (!pourQui && rdv.client_email) {
          const { data: fiche } = await supabase
            .from('clients').select('id')
            .eq('email', normaliserEmail(rdv.client_email))
            .maybeSingle()
          pourQui = fiche?.id || null
        }
        if (pourQui) {
          const mots = motsReservation(rdv.commercant)
          const envoi = await envoyerPushParExternalId(pourQui, {
            headings: `${mots.laSienne.charAt(0).toUpperCase()}${mots.laSienne.slice(1)} est ${mots.participeMaintenu}`,
            contents: `Le ${jourLisible(rdv.date_rdv)} à ${String(rdv.heure_debut || '').slice(0, 5)}, chez ${rdv.commercant?.nom || 'ton commerce'}. Oublie le message d’annulation.`,
            url: '/commander?onglet=commandes&tab=rdvs',
            data: { kind: 'rdv_retabli', rdv_id: rdv.id },
          })
          notifie = Boolean(envoi?.ok)
        }
      } catch (e) {
        console.warn('[rdv/reconfirmer] notification KO', e?.message)
      }
    }

    await journaliserGeste(supabase, verdict, { action: 'rdv_retabli', cible_type: 'rdv', cible_id: rdv.id, details: { depuis: rdv.statut } })

    return NextResponse.json({ ok: true, email, notifie })
  } catch (e) {
    console.error('[rdv/reconfirmer]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
