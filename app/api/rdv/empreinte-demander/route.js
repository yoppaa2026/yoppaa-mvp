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
import { empreinteRequise, montantEmpreinte, echeanceLien, raisonDemandeImpossible } from '@/lib/empreinte-table'
import { envoyerAvecCredit } from '@/lib/fidelite-sms'
import { emailDemandeEmpreinte, envoyerAuYopper } from '@/lib/resend'
import { euros } from '@/lib/montants'

const MESSAGES = {
  deja_garantie: 'Cette table est déjà garantie : sa carte est enregistrée.',
  deja_debitee: 'Cette table a déjà été facturée.',
  pas_confirmee: 'Cette réservation n’est pas confirmée : il n’y a pas de table à garantir.',
  date_illisible: 'La date de cette réservation est illisible.',
  service_commence: 'Le service a commencé : demander une carte maintenant ne protège plus rien.',
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

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, statut, date_rdv, heure_debut, couverts, numero_rdv, numero_prefixe,
        client_prenom, client_nom, client_email, client_telephone,
        empreinte_statut, commercant_id, prestation_id,
        prestation:rdv_prestations(id, nom, par_couverts, couverts_min, couverts_max),
        commercant:commercants(id, nom, slug, categorie, stripe_account_id, stripe_account_charges_enabled,
          rdv_empreinte_actif, rdv_empreinte_seuil_couverts, rdv_empreinte_par_personne,
          rdv_delai_annulation_heures, fidelite_sms_actif)
      `)
      .eq('id', rdv_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!rdv) return NextResponse.json({ ok: false, error: 'Réservation introuvable.' }, { status: 404 })

    const raison = raisonDemandeImpossible(rdv, new Date())
    if (raison) {
      return NextResponse.json({ ok: false, code: raison, error: MESSAGES[raison] || 'Demande impossible.' }, { status: 409 })
    }

    const commercant = rdv.commercant
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
    const quand = `${rdv.date_rdv} à ${String(rdv.heure_debut).slice(0, 5)}`

    if (canal === 'sms') {
      if (!rdv.client_telephone) {
        return NextResponse.json({ ok: false, error: 'Ce client n’a pas de numéro : envoie le lien par email.' }, { status: 400 })
      }
      // ⚠️ PAS D'ACCENT NI D'EMOJI DANS UN SMS : un caractère hors GSM-7 le fait
      // basculer en UCS-2, donc 70 caractères au lieu de 160, donc le double de
      // crédits sur des SMS que le commerçant paie.
      const contenu = `Yoppaa - ${commercant.nom} : confirme ta table du ${quand} en enregistrant ta carte. Rien n est debite si tu viens. ${lien}`
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
          brevo_ko: 'L’envoi du SMS a échoué. Réessaie, ou envoie le lien par email.',
        }[res.raison] || 'Le SMS n’a pas pu partir.'
        // ⚠️ LE LIEN RESTE VALABLE : il est posé, le restaurateur peut le
        // renvoyer autrement. On ne l'efface pas pour un échec d'envoi.
        return NextResponse.json({ ok: false, code: res.raison, error: pourquoi }, { status: 502 })
      }
      return NextResponse.json({ ok: true, canal, expire_le: echeance.toISOString(), montant })
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
        subject: `Confirme ta table chez ${commercant.nom}`,
        html,
      })
    } catch (e) {
      console.error('[empreinte-demander] email KO', { rdvId: rdv.id, message: e?.message })
      return NextResponse.json({ ok: false, error: 'L’email n’a pas pu partir. Réessaie, ou envoie le lien par SMS.' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, canal, expire_le: echeance.toISOString(), montant })
  } catch (e) {
    console.error('[empreinte-demander] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || 'erreur serveur' }, { status: 500 })
  }
}
