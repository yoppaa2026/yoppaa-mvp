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
// 🔴 LA FILE D'ATTENTE EST PRÉVENUE pour chaque séance libérée (décision
// d'Alex du 04/10 : « c'est une place de libre »). La cliente part, le cours a
// toujours lieu : la place est réellement libre, ce n'est pas le commerce qui
// s'absente. Elle ne l'était pas depuis le 06/09.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { annulerLesSeancesDuContrat } from '@/lib/abonnement-resiliation-server'
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

    // 🔴 « RECOMMENCE » NE RECOMMENÇAIT RIEN (04/10). Une résiliation dont les
    // séances n'avaient pas pu être annulées disait « recommence », et le
    // second clic tombait ici sur « déjà résilié » : les séances restaient.
    // Un contrat déjà résilié repasse donc par les séances (l'annulation ne
    // touche que les confirmées à venir, un second passage n'en trouve aucune).
    const dejaResilie = contrat.statut === 'resilie'
    if (!dejaResilie) {
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
    }

    // 🔴 LES SÉANCES, LEURS RAPPELS ET LEURS FILES : la règle commune vit dans
    // `lib/abonnement-resiliation-server` depuis que « Rembourser » résilie
    // aussi (Abo-I1, 04/10). Deux copies auraient divergé.
    const seances = await annulerLesSeancesDuContrat(supabase, abonnement_id)
    if (!seances.ok) {
      // ⚠️ LE CONTRAT EST RÉSILIÉ MAIS SES SÉANCES TIENNENT : on le DIT, pour
      // que la commerçante relance au lieu de croire les places libérées.
      return NextResponse.json({ ok: false, partiel: true, error: seances.etape === 'lecture'
        ? 'L’abonnement est résilié, mais ses séances n’ont pas pu être lues : recommence pour les annuler.'
        : 'L’abonnement est résilié, mais ses séances n’ont pas pu être annulées : recommence.' }, { status: 500 })
    }
    const annulees = seances.annulees
    const filePrevenue = seances.filePrevenue
    if (dejaResilie && annulees.length === 0) return NextResponse.json({ ok: true, deja: true, seances_annulees: 0 })

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

    return NextResponse.json({ ok: true, seances_annulees: annulees.length, email, file_prevenue: filePrevenue })
  } catch (e) {
    console.error('[resilier-abonnement]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
