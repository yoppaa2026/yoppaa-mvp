// POST /api/rdv/modifier-abonnement
//   { abonnement_id, client_prenom, client_nom, client_telephone, client_email, seances_en_plus, date_fin }
//
// 🔴 UN CONTRAT NE SE MODIFIAIT PAS (Abo-I3, audit du 03/10). Une faute dans
// l'email, une séance offerte, une prolongation après une blessure : il
// fallait résilier et réinscrire, et le solde repartait de zéro.
//
// ✅ DÉCISIONS D'ALEX (04/10) : identité, séances EN PLUS, date de fin. Le
// prix et le cours restent figés, le plafond hebdomadaire reste. L'email se
// corrige avec un avertissement, et un email part à la nouvelle adresse.
//
// ⚠️ LES SÉANCES À VENIR SUIVENT LA NOUVELLE ADRESSE. L'email est la clé qui
// relie une réservation à son Yopper : sans ça, la personne connectée avec la
// bonne adresse ne verrait ni son abonnement ni ses séances déjà posées.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { verdictModificationAbonnement, messageRefusModification, PHRASE_CONNEXION_ABONNEMENT } from '@/lib/abonnements'
import { jourBruxelles } from '@/lib/timezone'
import { emailAbonnementNouvelleAdresse, envoyerAuYopper } from '@/lib/resend'

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const { abonnement_id } = corps
    if (!abonnement_id) return NextResponse.json({ ok: false, error: 'abonnement_id requis.' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ LA CASE ARGENT : offrir des séances ou prolonger un contrat payé est
    // une décision d'argent, comme le résilier ou le rembourser.
    const verdict = await gardeLigneEquipe(request, supabase, 'abonnements', abonnement_id, 'argent')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: contrat, error: errC } = await supabase
      .from('abonnements')
      .select('id, statut, date_debut, date_fin, seances_total, client_prenom, client_email, formule:abonnement_formules(libelle), commercant:commercants(nom, slug)')
      .eq('id', abonnement_id)
      .is('deleted_at', null)
      .maybeSingle()
    if (errC) return NextResponse.json({ ok: false, error: 'Lecture du contrat impossible.' }, { status: 500 })

    // La dernière séance confirmée : une date de fin ne passe jamais avant.
    const { data: derniere, error: errD } = await supabase
      .from('rdv_reservations')
      .select('date_rdv')
      .eq('abonnement_id', abonnement_id)
      .eq('statut', 'confirme')
      .is('deleted_at', null)
      .order('date_rdv', { ascending: false })
      .limit(1)
    if (errD) return NextResponse.json({ ok: false, error: 'Les séances du contrat n’ont pas pu être lues.' }, { status: 500 })

    const regle = verdictModificationAbonnement(contrat, corps, { derniereSeance: derniere?.[0]?.date_rdv ?? null })
    if (!regle.ok) {
      return NextResponse.json({ ok: false, code: regle.code, error: messageRefusModification(regle.code, regle) }, { status: regle.code === 'introuvable' ? 404 : 400 })
    }

    // ⚠️ SUR LE CONTRAT LU : une résiliation passée entre-temps gagne.
    const { data: ecrit, error: errU } = await supabase
      .from('abonnements')
      .update(regle.maj)
      .eq('id', abonnement_id)
      .eq('statut', contrat.statut)
      .select('id')
    if (errU) return NextResponse.json({ ok: false, error: 'La modification n’a pas pu être enregistrée.' }, { status: 500 })
    if (!ecrit || ecrit.length === 0) return NextResponse.json({ ok: false, error: 'Le contrat a changé pendant ta saisie. Recharge, puis recommence.' }, { status: 409 })

    // Les séances à venir suivent l'identité du contrat, l'adresse en tête.
    // ⚠️ L'IDENTITÉ SEULE : ni la date ni l'heure d'une séance ne bougent ici.
    let seancesSuivent = 0
    const identiteSeances = {
      client_prenom: regle.maj.client_prenom,
      client_nom: regle.maj.client_nom,
      client_telephone: regle.maj.client_telephone,
      client_email: regle.maj.client_email,
    }
    const { data: suivies, error: errS } = await supabase
      .from('rdv_reservations')
      .update(identiteSeances)
      .eq('abonnement_id', abonnement_id)
      .eq('statut', 'confirme')
      .gte('date_rdv', jourBruxelles())
      .is('deleted_at', null)
      .select('id')
    if (errS) console.error('[modifier-abonnement] séances à venir non mises à jour', errS.message)
    else seancesSuivent = (suivies || []).length

    // 🔴 LA NOUVELLE ADRESSE EST PRÉVENUE : c'est elle qui ouvre l'abonnement.
    let email = 'inchange'
    if (regle.emailChange && regle.nouvelEmail) {
      const slug = contrat.commercant?.slug
      const html = emailAbonnementNouvelleAdresse({
        yopper_prenom: regle.maj.client_prenom,
        commercant_nom: contrat.commercant?.nom || 'Le commerce',
        formule: contrat.formule?.libelle || null,
        connexion: PHRASE_CONNEXION_ABONNEMENT,
        // Le bouton ouvre la connexion et ramène sur la fiche, comme l'email d'achat (Abo-I7).
        connexion_url: slug
          ? `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'}/commander/auth?redirect=${encodeURIComponent(`/commander/rdv/${slug}`)}`
          : null,
      })
      const envoi = await envoyerAuYopper({ to: regle.nouvelEmail, subject: `Ton abonnement chez ${contrat.commercant?.nom || 'ton commerce'} est relié à cette adresse`, html })
      email = envoi?.ok ? 'envoye' : 'echec'
      if (!envoi?.ok) console.error('[modifier-abonnement] email KO', envoi?.error)
    }

    await journaliserGeste(supabase, verdict, {
      action: 'abonnement_modifie', cible_type: 'abonnement', cible_id: abonnement_id,
      details: { seances_en_plus: regle.seancesEnPlus, date_fin: regle.maj.date_fin, email_change: regle.emailChange },
    })

    return NextResponse.json({ ok: true, seances_en_plus: regle.seancesEnPlus, email, seances_suivent: seancesSuivent, partiel: !!errS })
  } catch (e) {
    console.error('[modifier-abonnement]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
