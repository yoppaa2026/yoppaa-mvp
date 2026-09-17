// POST /api/rdv/empreinte-demander
//
// LE RESTAURATEUR DEMANDE SA CARTE À UN CLIENT QUI A RÉSERVÉ PAR TÉLÉPHONE.
//
// Personne ne dicte son numéro de carte au téléphone, et le noter sur un papier
// est interdit. La table de huit du samedi soir, la plus chère à perdre,
// n'était donc jamais garantie. Ce lien la fait passer de « sans empreinte » à
// « garantie », sans que le restaurateur touche à quoi que ce soit de bancaire.
//
// ⚠️ LA TABLE N'ATTEND PAS, C'EST LE LIEN QUI EXPIRE. Le restaurateur au
// téléphone confirme la réservation ; il ne dit pas « je vous confirme si vous
// cliquez ». Rien ne se libère tout seul.
//
// 🔴 LE JETON EN CLAIR NE VA QU'AU CLIENT. La base ne garde qu'un SHA-256 :
// une fuite de la base ne doit pas rendre les liens utilisables.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes, createHash } from 'node:crypto'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { empreinteRequise, montantEmpreinte, echeanceLien, raisonDemandeImpossible, compteEncaisse } from '@/lib/empreinte-table'
import { envoyerAvecCredit } from '@/lib/fidelite-sms'
import { emailDemandeEmpreinte, envoyerAuYopper } from '@/lib/resend'
import { euros, eurosNus } from '@/lib/montants'
import { chezLeCommerce } from '@/lib/nom-commerce'

const MESSAGES = {
  deja_garantie: 'Cette table est déjà garantie : sa carte est enregistrée.',
  deja_debitee: 'Cette table a déjà été facturée.',
  pas_confirmee: 'Cette réservation n’est pas confirmée : il n’y a pas de table à garantir.',
  date_illisible: 'La date de cette réservation est illisible.',
  service_commence: 'Le service a commencé : demander une carte maintenant ne protège plus rien.',
}

// 🔴 ON NE COMPTE QUE CE QUI EST PARTI (demande d'Alex, 16/09 : « un numéro dans
// le DB avec le nombre de relances, pour qu'ils aient un repère »). Appelée
// APRÈS l'envoi, jamais avant : compter une tentative ferait croire le client
// prévenu, exactement le défaut corrigé le même jour sur la trace d'envoi.
//
// ⚠️ ET UN COMPTEUR QUI N'A PAS PU S'ÉCRIRE NE FAIT PAS ÉCHOUER L'ENVOI : le
// SMS est parti, le client a son lien. On le dit dans le journal, et la réponse
// rend le compte qu'on croit juste.
async function compterEnvoi(supabase, rdv) {
  const envois = (Number(rdv?.empreinte_demande_envois) || 0) + 1
  const { error } = await supabase
    .from('rdv_reservations')
    .update({ empreinte_demande_envois: envois })
    .eq('id', rdv.id)
  if (error) console.error('[empreinte-demander] compteur non incrémenté', { rdvId: rdv.id, message: error.message })
  return envois
}

export async function POST(request) {
  try {
    const { rdv_id, canal } = await request.json()
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis.' }, { status: 400 })
    if (!['email', 'sms'].includes(canal)) {
      return NextResponse.json({ ok: false, error: 'canal inconnu.' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LA MÊME GARDE QUE LE DÉBIT : elle prouve que celui qui appelle est le
    // commerçant de CETTE ligne.
    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    // 🔴 L'ERREUR DE LECTURE ÉTAIT JETÉE (16/09, SMS et email qui « ne partent
    // plus »). Une seule colonne invisible pour PostgREST fait échouer TOUTE la
    // requête, pas seulement la colonne : `rdv` vaut alors `null` et la route
    // répondait « réservation introuvable » sur une réservation qui existe. Le
    // restaurateur cherchait une table disparue, la cause était ailleurs.
    //
    // ⚠️ ET C'EST LE CAS JUSTE APRÈS UNE MIGRATION : PostgREST garde son schéma
    // en cache, et une colonne ajoutée n'est lisible qu'après son rechargement.
    const { data: rdv, error: erreurLecture } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, date_rdv, heure_debut, couverts, numero_rdv, numero_prefixe,
        client_prenom, client_nom, client_email, client_telephone,
        empreinte_statut, empreinte_demande_envois, commercant_id, prestation_id,
        prestation:rdv_prestations(id, nom, par_couverts, couverts_min, couverts_max),
        commercant:commercants(id, nom, slug, categorie, stripe_account_id, stripe_account_charges_enabled,
          rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne,
          rdv_delai_annulation_heures, fidelite_sms_actif)
      `)
      .eq('id', rdv_id)
      .is('deleted_at', null)
      .maybeSingle()

    // ⚠️ « ILLISIBLE » ET « INTROUVABLE » SONT DEUX RÉPONSES DIFFÉRENTES : la
    // première se réessaie, la seconde jamais.
    if (erreurLecture) {
      console.error('[empreinte-demander] lecture KO', { rdvId: rdv_id, message: erreurLecture.message })
      return NextResponse.json({
        ok: false, code: 'lecture',
        error: `Cette réservation n’a pas pu être lue (${erreurLecture.message}). Réessaie dans un instant.`,
      }, { status: 503 })
    }
    if (!rdv) return NextResponse.json({ ok: false, error: 'Réservation introuvable.' }, { status: 404 })

    const raison = raisonDemandeImpossible(rdv, new Date())
    if (raison) {
      return NextResponse.json({ ok: false, code: raison, error: MESSAGES[raison] || 'Demande impossible.' }, { status: 409 })
    }

    const commercant = rdv.commercant
    // 🔴 LA VRAIE CAUSE, NOMMÉE (16/09). Le message ci-dessous envoyait le
    // restaurateur vérifier son réglage et son nombre de couverts, tous deux
    // parfaits, quand c'est son compte Stripe qui n'encaisse pas encore. Il
    // cherchait là où il n'y avait rien à trouver.
    if (!compteEncaisse(commercant)) {
      return NextResponse.json({
        ok: false, code: 'stripe_absent',
        error: 'Ton compte Stripe n’encaisse pas encore : termine son inscription dans Paiements, sinon aucune carte ne peut être enregistrée.',
      }, { status: 400 })
    }
    // 🔴 LA MÊME RÈGLE QUE SUR LA FICHE PUBLIQUE, rejouée ici : sans elle, un
    // restaurateur réclamerait une carte pour un couple, ou pour une table
    // alors qu'il a éteint l'empreinte.
    if (!empreinteRequise(commercant, rdv.prestation, rdv.couverts)) {
      return NextResponse.json({
        ok: false,
        error: 'Cette table ne demande pas d’empreinte : vérifie ton réglage et le nombre de personnes.',
      }, { status: 400 })
    }
    const montant = montantEmpreinte(commercant, rdv.prestation, rdv.couverts)
    if (!(montant > 0)) {
      return NextResponse.json({ ok: false, error: 'Le montant garanti serait nul.' }, { status: 400 })
    }

    // ⚠️ LE JETON EST TIRÉ AU SORT PAR LE SERVEUR, jamais dérivé de
    // l'identifiant de la réservation : un jeton devinable est un jeton public.
    const jeton = randomBytes(24).toString('base64url')
    const hash = createHash('sha256').update(jeton).digest('hex')
    // 🔴 L'ÉCHÉANCE S'ARRÊTE AU PLUS TÔT DE SEPT JOURS ET DU MOMENT OÙ LA TABLE
    // N'EST PLUS ANNULABLE SANS FRAIS. Au-delà, le client donnerait sa carte
    // alors qu'il ne peut déjà plus annuler sans être débité, sans que rien ne
    // le lui ait dit.
    const echeance = echeanceLien(rdv, commercant, new Date())
    if (echeance <= new Date()) {
      return NextResponse.json({
        ok: false,
        error: 'Le délai d’annulation est déjà passé : un lien envoyé maintenant piégerait ton client.',
      }, { status: 409 })
    }

    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.yoppaa.app'
    const lien = `${base}/empreinte/${jeton}`

    // ⚠️ ON ENVOIE AVANT D'ÉCRIRE ? NON, L'INVERSE : un lien parti sans jeton en
    // base est un lien mort chez le client. On pose d'abord, on envoie ensuite,
    // et un envoi raté laisse un lien valable que le restaurateur peut
    // redemander.
    const { error: erreurPose } = await supabase.from('rdv_reservations').update({
      empreinte_demande_jeton_hash: hash,
      empreinte_demande_at: new Date().toISOString(),
      empreinte_demande_expire_at: echeance.toISOString(),
      empreinte_demande_canal: canal,
    }).eq('id', rdv.id)
    if (erreurPose) {
      console.error('[empreinte-demander] pose du lien KO', { rdvId: rdv.id, message: erreurPose.message })
      return NextResponse.json({ ok: false, error: 'Le lien n’a pas pu être préparé. Réessaie dans un instant.' }, { status: 500 })
    }

    const prenom = rdv.client_prenom || ''
    const heure = String(rdv.heure_debut || '').slice(0, 5)
    // 🔴 « TA TABLE DU 2026-09-19 » (16/09). L'email et le SMS servaient la date
    // brute de la base à un client. Midi et jamais minuit : le motif du dépôt,
    // pour qu'un fuseau en retard ne recule pas la table d'un jour.
    const jour = new Date(`${rdv.date_rdv}T12:00:00`)
    const quand = isNaN(jour.getTime())
      ? String(rdv.date_rdv || '')
      : `${jour.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })} à ${heure}`

    if (canal === 'sms') {
      if (!rdv.client_telephone) {
        return NextResponse.json({ ok: false, error: 'Ce client n’a pas de numéro : envoie le lien par email.' }, { status: 400 })
      }
      // ⚠️ UNE DATE EN CHIFFRES, ET C'EST LE SEUL SACRIFICE QUI RESTE : « août »
      // ferait sortir le message de l'alphabet GSM-7 (`û` n'y est pas), et une
      // date longue le rallongerait d'un segment pour rien.
      const [, mois, jourDuMois] = String(rdv.date_rdv || '').split('-')
      const quandSms = jourDuMois && mois ? `${jourDuMois}/${mois} à ${heure}` : `${rdv.date_rdv} à ${heure}`
      // 🔴 LE MESSAGE S'ÉCRIT EN FRANÇAIS CORRECT (16/09, demande d'Alex :
      // « il manque les apostrophes »). Il le peut désormais parce que
      // `envoyerAvecCredit` met le message COMPLET en GSM-7 avant de l'envoyer :
      // l'apostrophe droite et `à é è ù` y sont admis, la typographique `’` et
      // `ê ç û` sont traduits. Écrire proprement ne coûte plus un segment.
      //
      // ⚠️ `eurosNus` ET JAMAIS `euros()` : celui-ci pose une espace insécable,
      // que la traduction rendrait en espace ordinaire — autant ne pas la poser.
      const contenu = `Yoppaa - ${commercant.nom} : confirme ta table du ${quandSms} en enregistrant ta carte. Rien n'est débité si tu viens, ${eurosNus(montant)} EUR seulement en cas d'absence ou d'annulation tardive. ${lien}`
      // ⚠️ SANS L'INTERRUPTEUR DE FIDÉLITÉ (ce n'est pas de la fidélité) ET
      // JUSQU'À 23 H : une réservation prise en plein service du soir doit
      // pouvoir partir.
      const res = await envoyerAvecCredit(supabase, commercant, rdv.client_telephone, contenu,
        { exigerFidelite: false, plageHoraire: { min: 8, max: 23 } })
      if (!res.ok) {
        const pourquoi = {
          plus_de_credits: 'Tu n’as plus de crédits SMS. Recharge, ou envoie le lien par email.',
          heure_indue: 'Il est trop tard pour un SMS. Envoie le lien par email.',
          sans_telephone: 'Ce client n’a pas de numéro.',
          // 🔴 LA CAUSE LA PLUS FRÉQUENTE, ET ELLE N'AVAIT PAS DE MESSAGE
          // (16/09) : un numéro qui n'est pas un numéro belge valable. Sans
          // cette ligne, le restaurateur lisait « le SMS n'a pas pu partir »
          // et n'avait aucune idée de ce qu'il devait corriger.
          telephone_invalide: 'Ce numéro n’est pas un numéro belge valable. Corrige-le, ou envoie le lien par email.',
          brevo_ko: 'L’envoi du SMS a échoué. Réessaie, ou envoie le lien par email.',
        }[res.raison] || 'Le SMS n’a pas pu partir.'
        // ⚠️ LE LIEN RESTE VALABLE : il est posé, le restaurateur peut le
        // renvoyer autrement. On ne l'efface pas pour un échec d'envoi.
        //
        // 🔴 MAIS ON N'ANNONCE PLUS QU'IL EST PARTI (16/09, essai F2 bis
        // d'Alex : numéro erroné, le SMS ne part pas, et l'agenda affiche
        // pourtant « Relancer par SMS »). L'agenda lit `empreinte_demande_at`
        // pour dire « lien déjà envoyé, pas encore confirmé » : posé avant
        // l'envoi, ce champ devient un MENSONGE dès que l'envoi échoue, et le
        // restaurateur croit son client prévenu. On efface la trace de l'ENVOI,
        // jamais le jeton ni l'échéance.
        await supabase.from('rdv_reservations').update({ empreinte_demande_at: null, empreinte_demande_canal: null }).eq('id', rdv.id)
        return NextResponse.json({ ok: false, code: res.raison, error: pourquoi }, { status: 502 })
      }
      const envois = await compterEnvoi(supabase, rdv)
      return NextResponse.json({ ok: true, canal, expire_le: echeance.toISOString(), montant, envois })
    }

    if (!rdv.client_email) {
      return NextResponse.json({ ok: false, error: 'Ce client n’a pas d’adresse email : envoie le lien par SMS.' }, { status: 400 })
    }
    try {
      const html = emailDemandeEmpreinte({
        prenom,
        commercantNom: commercant.nom,
        quand,
        couverts: rdv.couverts,
        montant: euros(montant),
        lien,
        expireLe: echeance,
      })
      await envoyerAuYopper({
        to: rdv.client_email,
        subject: `Confirme ta table ${chezLeCommerce(commercant.nom)}`,
        html,
      })
    } catch (e) {
      console.error('[empreinte-demander] email KO', { rdvId: rdv.id, message: e?.message })
      // ⚠️ LE MÊME FRÈRE QUE CÔTÉ SMS : un email qui n'est pas parti ne doit pas
      // s'afficher comme « lien déjà envoyé par email, pas encore confirmé ».
      await supabase.from('rdv_reservations').update({ empreinte_demande_at: null, empreinte_demande_canal: null }).eq('id', rdv.id)
      return NextResponse.json({ ok: false, error: 'L’email n’a pas pu partir. Réessaie, ou envoie le lien par SMS.' }, { status: 502 })
    }

    const envois = await compterEnvoi(supabase, rdv)
    return NextResponse.json({ ok: true, canal, expire_le: echeance.toISOString(), montant, envois })
  } catch (e) {
    console.error('[empreinte-demander] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || 'erreur serveur' }, { status: 500 })
  }
}
