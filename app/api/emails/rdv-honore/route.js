// POST /api/emails/rdv-honore
//
// Quand le commercant marque un RDV comme 'honore', envoie 2 emails au Yopper
// SI rdv_fidelite_actif = true sur le commercant :
//   1. emailFideliteProgression (a chaque progres)
//   2. emailFideliteRecompenseDebloquee (si seuil atteint, distinct)
//
// Lit la progression depuis rdv_fidelite_progression (table maj par trigger).
//
// Body : { rdv_id: UUID }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeSurLigne, refus } from '@/lib/api-auth'
import { envoyerAuCommercant, emailFideliteProgression, emailFideliteRecompenseDebloquee } from '@/lib/resend'

export async function POST(request) {
  try {
    const { rdv_id } = await request.json()
    if (!rdv_id) return NextResponse.json({ ok: false, error: 'rdv_id requis' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // ⚠️ GARDE D'AUTORISATION, POSÉE LE 21/08. Cette route n'en avait AUCUNE :
    // ni jeton, ni cookie, ni secret. Elle prenait un identifiant dans le corps
    // de la requête, chargeait la ligne avec la CLÉ DE SERVICE — qui ignore la
    // RLS — et faisait partir l'email. Le client qui possède le numéro de sa
    // propre commande pouvait donc déclencher n'importe lequel de ces envois,
    // vers le commerçant comme vers lui-même, autant de fois qu'il voulait.
    // La règle vit dans lib/api-auth.js, pour les dix routes à la fois.
    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: rdv } = await supabase
      .from('rdv_reservations')
      .select(`
        id, client_email, client_prenom, client_id,
        commercant:commercants(id, nom, slug, rdv_fidelite_actif, rdv_fidelite_seuil, rdv_fidelite_pourcent)
      `)
      .eq('id', rdv_id)
      .single()

    if (!rdv?.client_email || !rdv.commercant?.rdv_fidelite_actif) {
      return NextResponse.json({ ok: true, skipped: 'no_fidelite' })
    }

    const seuil = rdv.commercant.rdv_fidelite_seuil || 10
    const pourcent = rdv.commercant.rdv_fidelite_pourcent || 10

    // 🔴 DEUX DÉFAUTS EMPILÉS ICI, TROUVÉS LE 27/08 PAR L'AUDIT DES COLONNES.
    //
    // 1. LA COLONNE N'EXISTAIT PAS. On demandait `nb_rdv_total` ; la table
    //    porte `compteur`. Toute la requête échouait, `prog` valait null, et
    //    `nbRdvActuels` retombait sur 0. L'email annonçait donc
    //    « Ta fidélité progresse — 0/10 » à quelqu'un qui venait d'honorer son
    //    cinquième rendez-vous. Et l'erreur n'était même pas lue.
    //
    // 2. 🔴 ET L'EMAIL DE RÉCOMPENSE N'EST JAMAIS PARTI. Il se déclenchait sur
    //    `nbRdvActuels === seuil`, une égalité qui ne pouvait pas se produire.
    //    ⚠️ ET CORRIGER LE SEUL NOM DE COLONNE NE L'AURAIT PAS RÉPARÉ : le
    //    déclencheur `incrementer_fidelite_rdv` REMET `compteur` À ZÉRO au
    //    moment exact où il pose la récompense. Au dixième rendez-vous,
    //    `compteur` vaut donc 0, jamais 10. On aurait remplacé un mensonge par
    //    un autre, et l'email serait resté muet.
    //
    // La bonne lecture est celle que le déclencheur écrit vraiment :
    //   • `recompense_dispo` passe à true au déblocage ;
    //   • `compteur` retombe à 0 dans le même geste.
    // Donc « débloquée À CE rendez-vous » se lit `recompense_dispo && compteur
    // === 0`. Au rendez-vous suivant, `compteur` vaut 1 : l'email ne repart
    // pas, même si la récompense n'a pas encore été utilisée.
    //
    // ⚠️ Aucune horloge là-dedans, et c'est voulu : comparer
    // `derniere_recompense_le` à `now()` marcherait au banc et dériverait en
    // production au premier envoi différé.
    let nbRdvActuels = 0
    let recompenseDebloquee = false
    if (rdv.client_id) {
      const { data: prog, error: errProg } = await supabase
        .from('rdv_fidelite_progression')
        .select('compteur, recompense_dispo')
        .eq('client_id', rdv.client_id)
        .eq('commercant_id', rdv.commercant.id)
        .maybeSingle()
      // ⚠️ ON LIT L'ERREUR. C'est son absence qui a caché le défaut pendant des
      // mois : la requête échouait, `prog` valait null, et le zéro passait pour
      // une progression légitime.
      if (errProg) {
        console.error('[emails/rdv-honore] progression illisible', errProg)
        return NextResponse.json(
          { ok: false, error: `progression illisible : ${errProg.message || errProg.code}` },
          { status: 500 }
        )
      }
      const compteur = Number(prog?.compteur) || 0
      recompenseDebloquee = prog?.recompense_dispo === true && compteur === 0
      // ⚠️ AU DÉBLOCAGE, ON AFFICHE LE SEUIL, PAS LE ZÉRO. Le client vient de
      // compléter sa carte : lui écrire « 0/10 » à cette seconde précise serait
      // le plus mauvais moment de tout le programme.
      nbRdvActuels = recompenseDebloquee ? seuil : compteur
    }

    // 1) Email progression (toujours envoye)
    try {
      const html = emailFideliteProgression({
        yopper_prenom:       rdv.client_prenom || 'Yopper',
        commercant_nom:      rdv.commercant.nom,
        commercant_slug:     rdv.commercant.slug,
        points_actuels:      nbRdvActuels,
        seuil,
        pourcent_recompense: pourcent,
      })
      await envoyerAuCommercant({
        to: rdv.client_email,
        subject: `Ta fidélité chez ${rdv.commercant.nom} progresse — ${nbRdvActuels}/${seuil} ⭐`,
        html,
      })
    } catch (e) {
      console.error('[emails/rdv-honore] envoi progression KO', e?.message)
    }

    // 2) Email recompense debloquee (seulement si seuil pile atteint a CE rdv)
    if (nbRdvActuels === seuil) {
      try {
        const html = emailFideliteRecompenseDebloquee({
          yopper_prenom:       rdv.client_prenom || 'Yopper',
          commercant_nom:      rdv.commercant.nom,
          commercant_slug:     rdv.commercant.slug,
          pourcent_recompense: pourcent,
          code_promo:          null,  // a generer en STRIPE-10 + module fidelite complet
        })
        await envoyerAuCommercant({
          to: rdv.client_email,
          subject: `🎉 Tu as débloqué une réduction de ${pourcent}% chez ${rdv.commercant.nom}`,
          html,
        })
      } catch (e) {
        console.error('[emails/rdv-honore] envoi recompense KO', e?.message)
      }
    }

    return NextResponse.json({ ok: true, nb_rdv_actuels: nbRdvActuels, seuil, recompense_debloquee: nbRdvActuels === seuil })
  } catch (e) {
    console.error('[api/emails/rdv-honore]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
