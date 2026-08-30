// POST /api/rdv/reserver-abonnement
//
// POSER UNE SÉANCE SUR SON ABONNEMENT. C'est le dernier maillon du module :
// `peutReserverSurAbonnement` existait depuis le premier jour, vérifiée sous
// toutes les coutures, et PERSONNE NE L'APPELAIT. Une cliente pouvait acheter
// trente-six séances sans avoir aucun moyen d'en poser une seule.
//
// ⚠️ POURQUOI UNE ROUTE, ALORS QUE LE TUNNEL ORDINAIRE ÉCRIT DIRECTEMENT EN
// BASE. Parce que celui-ci accorde un DROIT, et qu'un droit ne se décide pas
// dans le navigateur :
//
//   • le solde vit dans `abonnements` et se compte sur `rdv_reservations`,
//     deux tables fermées à l'anonyme. Le client ne peut donc pas prouver
//     lui-même qu'il lui reste une séance ;
//   • sans contrôle serveur, il suffirait d'envoyer l'identifiant d'un contrat
//     pour s'offrir des séances au nom de quelqu'un d'autre ;
//   • et l'écran a pu rester ouvert vingt minutes. Le solde se revérifie AU
//     MOMENT DE L'ÉCRITURE, jamais sur ce que la page croyait savoir.
//
// ⚠️ L'IDENTITÉ DOIT ÊTRE PROUVÉE (décision du 03/08). Le cookie ne suffit pas :
// il se posait en saisissant simplement un email dans le tunnel, donc saisir
// celui d'une autre cliente consommerait SON abonnement.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteProuvee } from '@/lib/yopper-auth'
import { peutReserverSurAbonnement, seancesConsommees, datesConsommees } from '@/lib/abonnements'
import { creerReservationRdv } from '@/lib/rdv-creation-server'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

const HEURE = /^\d{2}:\d{2}(:\d{2})?$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request) {
  const yopper = await identiteProuvee(request)
  if (!yopper?.email) {
    return NextResponse.json({ ok: false, error: 'non_authentifie' }, { status: 401 })
  }

  let corps = {}
  try { corps = await request.json() } catch { /* corps vide traité plus bas */ }
  const {
    abonnement_id: abonnementId,
    date_rdv: dateRdv,
    heure_debut: heureDebut,
    notes_client: notes = null,
    lieu_id: lieuId = null,
  } = corps || {}

  if (!abonnementId || !DATE.test(String(dateRdv)) || !HEURE.test(String(heureDebut))) {
    return NextResponse.json({ ok: false, error: 'requete_incomplete' }, { status: 400 })
  }
  const heure = String(heureDebut).slice(0, 5)

  const db = admin()

  // ⚠️ LE CONTRAT ENTIER, PAS UNE COLONNE. Une colonne absente d'un select vaut
  // `undefined`, ne lève aucune erreur, et le repli bien conçu qui vit derrière
  // finit le travail en silence : sans `seances_par_semaine`, le plafond
  // retomberait à 1 et refuserait une cliente qui a payé deux séances par
  // semaine. C'est le défaut le plus fréquent de ce projet.
  const { data: contrat, error: errContrat } = await db
    .from('abonnements')
    .select('id, commercant_id, prestation_id, formule_id, client_email, client_prenom, client_nom, client_telephone, statut, mode, date_debut, date_fin, seances_total, seances_par_semaine, deleted_at')
    .eq('id', abonnementId)
    .maybeSingle()

  if (errContrat) {
    console.error('[rdv/reserver-abonnement] lecture contrat', errContrat)
    return NextResponse.json({ ok: false, error: 'lecture_impossible' }, { status: 500 })
  }

  // ⚠️ « PAS À TOI » ET « N'EXISTE PAS » RENDENT LA MÊME RÉPONSE. Distinguer
  // les deux permettrait de savoir quels identifiants de contrats existent.
  if (!contrat || contrat.deleted_at
      || String(contrat.client_email || '').trim().toLowerCase() !== yopper.email) {
    return NextResponse.json({ ok: false, error: 'abonnement_introuvable' }, { status: 404 })
  }

  // ⚠️ LA PRESTATION VIENT DU CONTRAT, JAMAIS DE LA REQUÊTE. Si le client
  // choisissait le cours, un abonnement de yoga paierait la séance de pilates,
  // c'est-à-dire une gratuité que le commerçant n'a jamais vendue.
  //
  // Le repli sur la formule couvre les contrats vendus en ligne avant le
  // 16/08 : leur colonne est vide, celle de leur formule ne l'a jamais été.
  let prestationId = contrat.prestation_id
  if (!prestationId && contrat.formule_id) {
    const { data: formule } = await db
      .from('abonnement_formules').select('prestation_id').eq('id', contrat.formule_id).maybeSingle()
    prestationId = formule?.prestation_id || null
  }
  if (!prestationId) {
    return NextResponse.json({ ok: false, error: 'abonnement_sans_cours' }, { status: 409 })
  }

  // ⚠️ SEULE LA DURÉE EST LUE ICI : elle sert à calculer l'heure de fin AVANT
  // l'insertion. La capacité, le taux de TVA et l'appartenance au commerce sont
  // relus par `creerReservationRdv`, qui refuse une prestation d'un autre
  // commerce. Un seul endroit sait de quoi le payload a besoin.
  const { data: prestation } = await db
    .from('rdv_prestations')
    .select('id, duree_minutes, commercant_id')
    .eq('id', prestationId)
    .maybeSingle()
  if (!prestation || String(prestation.commercant_id) !== String(contrat.commercant_id)) {
    return NextResponse.json({ ok: false, error: 'cours_introuvable' }, { status: 409 })
  }

  // ─── LE DROIT, REVÉRIFIÉ ICI ET MAINTENANT ────────────────────────────────
  //
  // Le décompte SE COMPTE, il ne se décrémente pas : un compteur stocké dérive
  // au premier accident, et plus personne ne sait ensuite quel chiffre est bon.
  const { data: posees } = await db
    .from('rdv_reservations')
    .select('id, abonnement_id, statut, date_rdv')
    .eq('abonnement_id', contrat.id)

  const verdict = peutReserverSurAbonnement(contrat, {
    date: dateRdv,
    seancesUtilisees: seancesConsommees(posees || [], { abonnementId: contrat.id }),
    datesDejaPrises: datesConsommees(posees || [], { abonnementId: contrat.id }),
  })
  // ⚠️ ON REND LA RAISON, jamais un refus muet : « ton abonnement a expiré » et
  // « tu as déjà ta séance cette semaine » n'appellent pas la même réaction, et
  // l'écran ne doit pas avoir à deviner laquelle afficher.
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, error: 'refus', raison: verdict.raison, plafond: verdict.plafond ?? null },
      { status: 409 },
    )
  }

  // ─── LA SÉANCE ────────────────────────────────────────────────────────────
  const duree = Number(prestation.duree_minutes) || 60
  const [h, m] = heure.split(':').map(Number)
  const finMin = h * 60 + m + duree
  const heureFin = `${String(Math.floor(finMin / 60) % 24).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`

  // ⚠️ LE LIEU GRAVÉ, LA CAPACITÉ GRAVÉE ET LA PREMIÈRE PLACE LIBRE VIENNENT DU
  // MODULE, comme pour le webhook Stripe et le tunnel sans paiement. La place
  // est la PREMIÈRE LIBRE, pas « inscrits + 1 » : quand quelqu'un annule, sa
  // place se libère AU MILIEU.
  const res = await creerReservationRdv(db, {
    commercantId: contrat.commercant_id,
    prestationId: prestation.id,
    dateRdv,
    heureDebut: heure,
    lieuId,
    champs: {
      abonnement_id: contrat.id,
      client_email: yopper.email,
      client_prenom: contrat.client_prenom || yopper.prenom || '',
      client_nom: contrat.client_nom || yopper.nom || null,
      client_telephone: contrat.client_telephone || null,
      heure_fin: heureFin,
      duree_minutes: duree,
      // ⚠️ ZÉRO PARCE QUE C'EST DÉJÀ PAYÉ, et le prix vit sur le CONTRAT.
      // Compter le tarif plein ici multiplierait le chiffre d'affaires du
      // commerçant par trente-six. Côté cliente, `libellePrixSeance` sait déjà
      // qu'une séance d'abonnement ne s'affiche pas « 0 € » mais « comprise
      // dans ton abonnement ».
      prix_estime: 0,
      acompte_montant: null,
      acompte_paye: false,
      statut: 'confirme',
      notes_client: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
    },
  })

  if (!res.ok) {
    if (res.code === 'place_prise') {
      return NextResponse.json(
        { ok: false, error: 'place_prise', collectif: !!res.collectif },
        { status: 409 },
      )
    }
    if (res.code === 'prestation_hors_commerce' || res.code === 'prestation_introuvable') {
      return NextResponse.json({ ok: false, error: 'cours_introuvable' }, { status: 409 })
    }
    console.error('[rdv/reserver-abonnement] insert', res.error)
    return NextResponse.json({ ok: false, error: 'ecriture_impossible' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    rdv: {
      ...res.rdv,
      date_rdv: dateRdv,
      heure_debut: heure,
      heure_fin: heureFin,
      prestation_id: prestation.id,
      abonnement_id: contrat.id,
      prix_estime: 0,
    },
  })
}
