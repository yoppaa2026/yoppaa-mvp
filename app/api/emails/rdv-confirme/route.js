// POST /api/emails/rdv-confirme
//
// Envoie 2 emails apres confirmation d'un RDV :
//   1. emailRdvConfirme  → au Yopper (avec iCal joint)
//   2. emailNouveauRdvCommercant → au commercant si notif_mode='chaque'
//
// Appele par :
//   • Frontend /commander/rdv/[slug] apres insert direct RDV (sans acompte)
//   • Frontend /dashboard ModalNouveauRdv apres insert RDV manuel
//   (Le webhook Stripe envoie les emails directement, pas via cette route)
//
// Body : { rdv_id: UUID }
// Non-bloquant : si email fail, on log mais on retourne ok=true
// (la creation du RDV est deja faite, l'email est un nice-to-have).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne } from '@/lib/api-auth'
import { envoyerAuCommercant, emailRdvConfirme, emailNouveauRdvCommercant } from '@/lib/resend'
import { generateRdvIcs, icsToBase64Attachment } from '@/lib/ical'
import { referenceRdv } from '@/lib/numero-commande'
import { adresseRendezVous } from '@/lib/lieu-fige'
import { chargerProduitsDuRdv } from '@/lib/rdv-produits-server'

export async function POST(request) {
  try {
    // `deplace` : le rendez-vous existait déjà et vient d'être décalé par le
    // commerçant. Mêmes informations, mais annoncées comme un CHANGEMENT.
    const { rdv_id, deplace: deplaceDemande = false, ancienne_date: ancienneDateDemandee = null, ancienne_heure: ancienneHeureDemandee = null } = await request.json()
    if (!rdv_id) {
      return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })
    }

    // Service role pour bypass RLS (la route est publique car appelee post-insert anonyme)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ GARDE PARTIELLE, ET C'EST DÉLIBÉRÉ. Cette route est la seule des huit
    // que le CLIENT appelle, juste après avoir réservé, et le plus souvent SANS
    // COMPTE : exiger un jeton couperait la confirmation de tout rendez-vous
    // pris sans s'inscrire. Ce qu'il possède, c'est l'identifiant du
    // rendez-vous, un UUID que seul celui qui vient de le créer connaît.
    //
    // ⚠️ MAIS DÉPLACER UN RENDEZ-VOUS N'APPARTIENT QU'AU COMMERÇANT. Ces trois
    // champs venaient du corps de la requête sans aucune preuve : n'importe qui
    // pouvait faire annoncer AUX DEUX PARTIES un changement d'horaire qui n'a
    // jamais eu lieu, dans un email signé par notre domaine. Sans preuve, ils
    // sont désormais ignorés, et le message redevient une simple confirmation.
    const verdictPro = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const deplace = deplaceDemande === true && verdictPro.ok
    const ancienne_date = deplace ? ancienneDateDemandee : null
    const ancienne_heure = deplace ? ancienneHeureDemandee : null

    // Fetch RDV + jointures
    const { data: rdv, error: errRdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, numero_rdv, numero_prefixe, date_rdv, heure_debut, heure_fin, duree_minutes,
        prix_estime, acompte_paye, acompte_paye_en_ligne, acompte_montant, fidelite_remise, bon_cadeau_montant, bons_utilises,
        client_email, client_prenom, client_nom, client_telephone, notes_client,
        annulation_token, lieu_id, lieu_libelle, lieu_adresse, commande_id,
        commercant:commercants(id, nom, slug, adresse, telephone, email, rdv_delai_annulation_heures, notif_mode, infos_pratiques, categorie),
        prestation:rdv_prestations(nom, duree_minutes),
        praticien:rdv_praticiens(prenom, nom, couleur_hex)
      `)
      .eq('id', rdv_id)
      .single()

    if (errRdv || !rdv) {
      console.error('[emails/rdv-confirme] RDV introuvable', { rdv_id, errRdv })
      return NextResponse.json({ ok: false, error: 'RDV introuvable' }, { status: 404 })
    }

    // 🔴 LES PRODUITS DU TUNNEL UNIQUE (Alex, 01/09). Cette route ne les
    // chargeait PAS : son email annonçait le rendez-vous et se taisait sur le
    // shampoing acheté avec. Le webhook Stripe, lui, le faisait depuis
    // toujours — et c'est précisément ce chemin-ci qui sert quand des bons
    // couvrent tout, puisqu'alors il n'y a aucun paiement Stripe.
    const produits = await chargerProduitsDuRdv(supabase, rdv.commande_id)

    // 1) Email Yopper avec iCal joint
    if (rdv.client_email) {
      try {
        const ics = generateRdvIcs({
          id: rdv.id,
          date_rdv: rdv.date_rdv,
          heure_debut: rdv.heure_debut,
          heure_fin: rdv.heure_fin,
          prestation_nom: rdv.prestation?.nom || 'Prestation',
          commercant_nom: rdv.commercant?.nom || '',
          commercant_adresse: adresseRendezVous(rdv),
          commercant_telephone: rdv.commercant?.telephone,
          commercant_email: rdv.commercant?.email,
          // ATTENDEE : sans lui, iOS ne propose pas le calendrier.
          client_email: rdv.client_email,
          client_nom: [rdv.client_prenom, rdv.client_nom].filter(Boolean).join(' '),
          prix_estime: rdv.prix_estime,
          rappel_24h: true,
          status: 'CONFIRMED',
          method: 'REQUEST',
          // ⚠️ SANS SEQUENCE QUI AUGMENTE, LE CALENDRIER DU CLIENT IGNORE LA
          // MISE À JOUR. Apple, Google et Outlook reconnaissent l'événement à
          // son UID, ici l'identifiant du rendez-vous, et n'acceptent de le
          // déplacer que si le numéro de séquence a grandi. À séquence égale,
          // le fichier est reçu, ouvert, et sans effet : le client garde
          // l'ancienne heure dans son agenda et vient à ce moment-là.
          //
          // ⚠️ ET UN SIMPLE 1 NE SUFFIT PAS : un rendez-vous déplacé DEUX fois
          // repartirait à 1, et le deuxième déplacement serait perdu. Les
          // minutes écoulées depuis 1970 sont le compteur le plus simple qui
          // grandisse tout seul, et il reste très loin du plafond de la norme
          // (2 147 483 647, atteint vers l'an 6053).
          sequence: deplace ? Math.floor(Date.now() / 60000) : 0,
        })
        const attachment = icsToBase64Attachment(ics, `rdv-${rdv.id}.ics`)

        const html = emailRdvConfirme({
          yopper_prenom:           rdv.client_prenom || 'Yopper',
          commercant_nom:          rdv.commercant?.nom || '',
          commercant_adresse:      adresseRendezVous(rdv),
          commercant_slug:         rdv.commercant?.slug || '',
          commercant_categorie:    rdv.commercant?.categorie || null,
          prestation_nom:          rdv.prestation?.nom || '',
          date_rdv:                rdv.date_rdv,
          heure_debut:             rdv.heure_debut,
          heure_fin:               rdv.heure_fin,
          duree_minutes:           rdv.duree_minutes,
          prix_estime:             rdv.prix_estime,
          // La MÊME référence qu'à l'écran et qu'à l'agenda du commerçant.
          numero_rdv:              referenceRdv(rdv),
          acompte_paye:            !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
          acompte_montant:         rdv.acompte_montant,
          // ⚠️ SANS ELLE, LE SOLDE ANNONCÉ IGNORE LA RÉCOMPENSE et le comptoir
          // réclame le tarif plein. Le gabarit la retranche via `soldeRdv`.
          fidelite_remise:         rdv.fidelite_remise || 0,
      bon_cadeau_montant:      rdv.bon_cadeau_montant || 0,
      nb_bons:                 (rdv.bons_utilises || []).length,
          delai_annulation_heures: rdv.commercant?.rdv_delai_annulation_heures || 24,
          annulation_token:        rdv.annulation_token,
          praticien_prenom:        rdv.praticien?.prenom || null,
          praticien_nom:           rdv.praticien?.nom || null,
          praticien_couleur:       rdv.praticien?.couleur_hex || null,
          infos_pratiques:         rdv.commercant?.infos_pratiques || null,
          deplace,
          ancienne_date,
          ancienne_heure,
          produits,
        })

        await envoyerAuCommercant({   // helper reutilise, accepte n'importe quel 'to'
          to: rdv.client_email,
          subject: deplace
            ? `Ton RDV chez ${rdv.commercant?.nom || 'le commerçant'} a été déplacé`
            : `Ton RDV chez ${rdv.commercant?.nom || 'le commerçant'} est confirmé`,
          html,
          attachments: [attachment],
        })
      } catch (e) {
        console.error('[emails/rdv-confirme] envoi Yopper KO', e)
      }
    }

    // 2) Email Commercant si notif_mode='chaque'
    //
    // ⚠️ SAUF SUR UN DÉPLACEMENT. C'est LUI qui vient de décaler ce
    // rendez-vous depuis son tableau de bord : lui annoncer « nouveau RDV »
    // pour un rendez-vous qu'il connaît déjà lui ferait croire qu'il en a deux.
    // Même raisonnement que la création manuelle, qui ne s'auto-notifie pas.
    if (!deplace && rdv.commercant?.notif_mode === 'chaque' && rdv.commercant?.email) {
      try {
        const html = emailNouveauRdvCommercant({
          nom_commercant:  rdv.commercant.nom,
          commercant_categorie: rdv.commercant?.categorie || null,
          yopper_prenom:   rdv.client_prenom,
          yopper_nom:      rdv.client_nom,
          yopper_email:    rdv.client_email,
          yopper_telephone:rdv.client_telephone,
          prestation_nom:  rdv.prestation?.nom,
          date_rdv:        rdv.date_rdv,
          heure_debut:     rdv.heure_debut,
          heure_fin:       rdv.heure_fin,
          duree_minutes:   rdv.duree_minutes,
          prix_estime:     rdv.prix_estime,
          acompte_paye:    !!(rdv.acompte_paye_en_ligne && rdv.acompte_montant),
          // Le commercant voit ce qui a fait baisser son acompte (27/08).
          fidelite_remise: rdv.fidelite_remise || 0,
          bon_cadeau_montant: rdv.bon_cadeau_montant || 0,
          acompte_montant: rdv.acompte_montant,
          notes_client:    rdv.notes_client,
        })

        await envoyerAuCommercant({
          to: rdv.commercant.email,
          subject: `Nouveau RDV — ${rdv.client_prenom || 'Yopper'} ${formatDateCourte(rdv.date_rdv)} à ${rdv.heure_debut?.slice(0,5)}`,
          html,
        })
      } catch (e) {
        console.error('[emails/rdv-confirme] envoi Commercant KO', e)
      }
    }

    return NextResponse.json({ ok: true })

  } catch (e) {
    console.error('[emails/rdv-confirme] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

// Format date court pour subject email : '13 juin'
function formatDateCourte(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })
}
