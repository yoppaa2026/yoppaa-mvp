// POST /api/rdv/resilier-abonnement   { abonnement_id }
//
// 🔴 LA RÉSILIATION S'ÉCRIVAIT DEPUIS LE NAVIGATEUR (Abo-I2, audit du 03/10).
// Le tableau de bord passait le contrat en « résilié », puis annulait les
// séances « à partir d'aujourd'hui », et affichait « places libérées » sans
// avoir lu la réponse. Quatre défauts à la fois :
//
//   • la cliente n'était prévenue de rien, ses séances disparaissaient ;
//   • les rappels push de ces séances partaient quand même la veille ;
//   • la séance de 9 h, déjà donnée à 11 h, passait en annulée et sortait du
//     chiffre d'affaires du jour ;
//   • un échec d'écriture s'affichait comme une réussite.
//
// ⚠️ AUCUN REMBOURSEMENT ICI, ET C'EST VOULU : une résiliation peut être un
// arrêt maladie, un départ, un litige. Le montant rendu est une décision de la
// commerçante, et l'écran le lui dit. L'email de la cliente la renvoie vers
// elle, sans rien promettre.
// ⚠️ LA FILE D'ATTENTE N'EST PAS PRÉVENUE : même règle que toute annulation
// décidée par le commerce (décision d'Alex, 06/09). À rediscuter si besoin.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { annulerPush } from '@/lib/onesignal'
import { creneauDejaCommence } from '@/lib/timezone'
import { seancesAnnuleesParResiliation } from '@/lib/abonnements'
import { seanceLisible } from '@/lib/attente-rdv'
import { emailAbonnementResilie, envoyerAuYopper } from '@/lib/resend'
import { lienFicheRdv } from '@/lib/lien-fiche'

export async function POST(request) {
  try {
    const { abonnement_id } = await request.json().catch(() => ({}))
    if (!abonnement_id) return NextResponse.json({ ok: false, error: 'abonnement_id requis.' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LA CASE ARGENT : résilier un contrat payé est une décision d'argent,
    // pas un geste d'agenda. Le patron et l'admin passent toujours.
    const verdict = await gardeLigneEquipe(request, supabase, 'abonnements', abonnement_id, 'argent')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: contrat, error: errC } = await supabase
      .from('abonnements')
      .select('id, statut, client_prenom, client_email, formule:abonnement_formules(libelle), commercant:commercants(nom, slug)')
      .eq('id', abonnement_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (errC) return NextResponse.json({ ok: false, error: 'Lecture du contrat impossible.' }, { status: 500 })
    if (!contrat) return NextResponse.json({ ok: false, error: 'Abonnement introuvable.' }, { status: 404 })
    if (contrat.statut === 'resilie') return NextResponse.json({ ok: true, deja: true, seances_annulees: 0 })

    // ⚠️ UN SEUL GAGNANT : le passage en « résilié » n'aboutit que sur un
    // contrat encore actif. Deux clics, ou deux onglets, ne font qu'une
    // résiliation et qu'un email.
    const { data: bascule, error: errU } = await supabase
      .from('abonnements')
      .update({ statut: 'resilie' })
      .eq('id', abonnement_id)
      .eq('statut', contrat.statut)
      .select('id')
    if (errU) return NextResponse.json({ ok: false, error: 'La résiliation n’a pas pu être enregistrée.' }, { status: 500 })
    if (!bascule || bascule.length === 0) return NextResponse.json({ ok: true, deja: true, seances_annulees: 0 })

    // Les séances à venir, et seulement celles qui n'ont pas commencé.
    const { data: seances, error: errS } = await supabase
      .from('rdv_reservations')
      .select('id, date_rdv, heure_debut, statut, deleted_at, rappel_push_id')
      .eq('abonnement_id', abonnement_id)
      .eq('statut', 'confirme')
      .is('deleted_at', null)
      .order('date_rdv', { ascending: true })
      .order('heure_debut', { ascending: true })
    if (errS) {
      // ⚠️ LE CONTRAT EST RÉSILIÉ MAIS SES SÉANCES TIENNENT : on le DIT, pour
      // que la commerçante relance au lieu de croire les places libérées.
      return NextResponse.json({ ok: false, partiel: true, error: 'L’abonnement est résilié, mais ses séances n’ont pas pu être lues : recommence pour les annuler.' }, { status: 500 })
    }
    const maintenant = Date.now()
    const aAnnuler = seancesAnnuleesParResiliation(seances, {
      dejaCommencee: (d, h) => creneauDejaCommence(d, h, maintenant),
    })

    let annulees = []
    if (aAnnuler.length > 0) {
      const { data: faites, error: errA } = await supabase
        .from('rdv_reservations')
        .update({ statut: 'annule_commercant', motif_annulation: 'resiliation' })
        .in('id', aAnnuler.map(s => s.id))
        .eq('statut', 'confirme')
        .select('id')
      if (errA) {
        return NextResponse.json({ ok: false, partiel: true, error: 'L’abonnement est résilié, mais ses séances n’ont pas pu être annulées : recommence.' }, { status: 500 })
      }
      const ids = new Set((faites || []).map(f => f.id))
      annulees = aAnnuler.filter(s => ids.has(s.id))
      // Les rappels de la veille ne partent plus pour des séances annulées.
      for (const s of annulees) {
        if (s.rappel_push_id) {
          const r = await annulerPush(s.rappel_push_id)
          if (!r?.ok) console.warn('[resilier-abonnement] rappel non annulé', s.id, r?.error)
        }
      }
    }

    // ⚠️ L'EMAIL DIT CE QUI EST RÉELLEMENT ANNULÉ, ligne par ligne.
    let email = 'sans_email'
    if (contrat.client_email) {
      const html = emailAbonnementResilie({
        yopper_prenom: contrat.client_prenom,
        commercant_nom: contrat.commercant?.nom || 'Le commerce',
        formule: contrat.formule?.libelle || null,
        seances: annulees.map(s => seanceLisible(s.date_rdv, s.heure_debut)).filter(Boolean),
        fiche_url: contrat.commercant?.slug ? lienFicheRdv(contrat.commercant.slug) : null,
      })
      const envoi = await envoyerAuYopper({ to: contrat.client_email, subject: `Ton abonnement chez ${contrat.commercant?.nom || 'ton commerce'} est résilié`, html })
      email = envoi?.ok ? 'envoye' : 'echec'
      if (!envoi?.ok) console.error('[resilier-abonnement] email KO', envoi?.error)
    }

    await journaliserGeste(supabase, verdict, {
      action: 'abonnement_resilie', cible_type: 'abonnement', cible_id: abonnement_id,
      details: { seances_annulees: annulees.length },
    })

    return NextResponse.json({ ok: true, seances_annulees: annulees.length, email })
  } catch (e) {
    console.error('[resilier-abonnement]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
