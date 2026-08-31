// POST /api/rdv/reserver
//
// RÉSERVER UN RENDEZ-VOUS QUAND IL N'Y A RIEN À ENCAISSER EN LIGNE.
//
// 🔴 DEUX DÉFAUTS EN UN, ET C'EST POUR ÇA QUE CETTE ROUTE EXISTE.
//
// 1. LE CAS LE PLUS FAVORABLE AU CLIENT ÉTAIT LE SEUL QU'ON REFUSAIT. Un bon
//    cadeau qui couvre toute la prestation ne laisse rien à encaisser, Stripe
//    refuse un paiement sous 0,50 €, et le tunnel renvoyait donc le porteur du
//    bon au comptoir. « Ton bon cadeau couvre déjà tout : réserve sans le bon. »
//
// 2. 🔴 ET SANS PAIEMENT, LE RENDEZ-VOUS S'INSÉRAIT DEPUIS LE NAVIGATEUR. Aucune
//    garde serveur : ni le forfait du commerçant, ni son interrupteur d'agenda,
//    ni l'appartenance de la prestation à ce commerce, ni le prix, ni l'acompte.
//    Une requête écrite à la main posait un rendez-vous payant chez quelqu'un
//    qui n'a pas l'agenda dans sa formule. C'est ce trou-là que la route ferme,
//    et c'est pour ça qu'elle passe avant le confort.
//
// ⚠️ LE REMÈDE EXISTAIT DÉJÀ, À CÔTÉ. `create-commande` porte
// `couvertSansPaiement` depuis la boutique : dû à zéro, commande confirmée
// directement, bon débité tout de suite, et LE CALCUL FAIT PAR LE SERVEUR.
// Personne ne l'avait jamais porté au rendez-vous. Sixième frère non traité de
// cette famille.
//
// ⚠️ « RIEN À PAYER » EST CALCULÉ ICI, JAMAIS REÇU DE L'ÉCRAN. Sinon il
// suffirait d'appeler cette route pour esquiver l'acompte du commerçant : on
// recharge le bon et la récompense en base, on reventile, et si l'acompte
// encaissable subsiste, on REFUSE et on renvoie vers Stripe.
//
// ⚠️ CE QUE CETTE ROUTE NE FAIT PAS : les produits. Un panier accompagné d'un
// rendez-vous passe par `create-rdv-commande`, qui sait réserver du stock et
// porte désormais le même chemin « rien à payer ». Deux tunnels, une seule
// règle, écrite dans `ventilerTunnelRdv`.

import { NextResponse } from 'next/server'
import { libelleBon } from '@/lib/bons-cadeaux'
import { createClient } from '@supabase/supabase-js'
import { ordersLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { identiteProuvee } from '@/lib/yopper-auth'
import { verdictForfait } from '@/lib/garde-forfait'
import { appliquerRecompenseAvantBon } from '@/lib/fidelite-recompense'
import { chargerRecompensePourYopper } from '@/lib/fidelite-recompense-server'
import { chargerBonValide } from '@/lib/bons-cadeaux-server'
import { normaliserCodeBon } from '@/lib/bons-cadeaux'
import { ventilerTunnelRdv } from '@/lib/tunnel-rdv-montants'
import { creerReservationRdv, appliquerAvantagesRdv } from '@/lib/rdv-creation-server'
import { normaliserEmail } from '@/lib/email-normalise'
import { creneauxDuJour } from '@/lib/ouverture'
import { jourSemaineDe } from '@/lib/creneaux'
import { brusselsInstant } from '@/lib/timezone'
import { timeToMinutes, minutesToTime } from '@/lib/rdv-slots'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const HEURE = /^\d{2}:\d{2}(:\d{2})?$/

// Le minimum encaissable de Stripe. En dessous, il n'y a pas de paiement en
// ligne possible : c'est la frontière exacte entre ce tunnel-ci et l'autre.
const MINIMUM_STRIPE = 0.5

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(request) {
  try {
    const limite = await checkLimit(ordersLimiter, clientIp(request))
    if (!limite.success) {
      return NextResponse.json({ ok: false, error: 'Trop de tentatives, réessaie dans un instant.' }, { status: 429 })
    }

    let body = {}
    try { body = await request.json() } catch { /* traité par les validations */ }
    const {
      commercant_id, prestation_id, praticien_id = null,
      date_rdv, heure_debut,
      client_email, client_prenom, client_nom, client_telephone,
      notes_client = null, rgpd_marketing = false,
      lieu_id = null,
      // ⚠️ DÉSIGNÉS PAR LE CLIENT, DONC REVÉRIFIÉS INTÉGRALEMENT plus bas. Un
      // identifiant envoyé n'autorise rien, un code envoyé n'autorise rien.
      fidelite_recompense_id = null,
      bon_cadeau_code = null,
    } = body || {}

    if (!commercant_id || !prestation_id || !DATE.test(String(date_rdv)) || !HEURE.test(String(heure_debut))) {
      return NextResponse.json({ ok: false, error: 'Données du rendez-vous incomplètes.' }, { status: 400 })
    }
    if (!client_email || !client_prenom || !client_nom || !client_telephone) {
      return NextResponse.json({ ok: false, error: 'Coordonnées incomplètes.' }, { status: 400 })
    }
    const heure = String(heure_debut).slice(0, 5)
    const email = normaliserEmail(client_email)

    const db = admin()

    // ⚠️ `plan`, `essai_plan` ET `created_at` : la garde de forfait en dépend, et
    // une colonne absente d'un select la rendrait muette sans lever d'erreur.
    const [{ data: commercant }, { data: prestation }] = await Promise.all([
      db.from('commercants')
        .select('id, nom, slug, categorie, rdv_actif, rdv_acompte_en_ligne_actif, rdv_acompte_global, stripe_account_id, stripe_account_charges_enabled, horaires_detail, plan, essai_plan, created_at')
        .eq('id', commercant_id).maybeSingle(),
      db.from('rdv_prestations')
        .select('id, nom, prix, acompte_pourcent, duree_minutes, commercant_id')
        .eq('id', prestation_id).maybeSingle(),
    ])

    if (!commercant) return NextResponse.json({ ok: false, error: 'Commerçant introuvable.' }, { status: 404 })

    // 🔴 LE FORFAIT, QUI N'ÉTAIT VÉRIFIÉ NULLE PART SUR CE CHEMIN. L'insertion
    // depuis le navigateur ne demandait rien du tout : un rendez-vous se posait
    // chez un commerçant qui n'a pas l'agenda dans sa formule.
    //
    // ⚠️ `rdv` SEUL, et pas `paiement_ligne` comme dans le tunnel d'acompte :
    // ici, par construction, il n'y a rien à encaisser. Exiger la fonction de
    // paiement fermerait la réservation gratuite chez qui ne l'a pas.
    const verdict = verdictForfait(commercant, 'rdv')
    if (!verdict.ok) {
      return NextResponse.json(
        { ok: false, error: 'Ce commerçant ne prend pas encore de rendez-vous en ligne.', code: verdict.code },
        { status: verdict.statut }
      )
    }
    // ⚠️ ET L'INTERRUPTEUR, séparément du forfait : l'avoir dans sa formule ne
    // veut pas dire l'avoir allumé.
    if (!commercant.rdv_actif) {
      return NextResponse.json({ ok: false, error: 'Ce commerçant ne prend pas encore de rendez-vous en ligne.' }, { status: 400 })
    }
    if (!prestation || String(prestation.commercant_id) !== String(commercant.id)) {
      return NextResponse.json({ ok: false, error: 'Prestation introuvable.' }, { status: 404 })
    }

    // ─── LE CRÉNEAU EXISTE-T-IL VRAIMENT ? ─────────────────────────────────
    //
    // ⚠️ L'HEURE MURALE BELGE, jamais l'horloge du serveur : Vercel tourne en
    // temps universel, et `toISOString()` rendrait la veille entre minuit et
    // deux heures du matin. Un rendez-vous d'hier matin serait accepté.
    const dureeMinutes = Number(prestation.duree_minutes) || 60
    const debutMin = timeToMinutes(heure)
    const finMin = debutMin + dureeMinutes
    const heureFin = minutesToTime(finMin)

    const instant = brusselsInstant(date_rdv, heure)
    if (isNaN(instant.getTime()) || instant.getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: 'Ce créneau est déjà passé. Choisis-en un autre.', creneau_refuse: true }, { status: 409 })
    }

    // Le commerce est-il ouvert, et le rendez-vous tient-il ENTIÈREMENT dans une
    // de ses plages ? Un salon qui ferme le midi a deux plages, pas une.
    // ⚠️ SANS HORAIRES DU TOUT, ON N'INTERDIT RIEN : un commerçant qui n'a pas
    // rempli sa fiche ne doit pas voir ses réservations bloquées par notre
    // prudence. Même arbitrage que `estOuvertCeJour`.
    const jourSem = jourSemaineDe(date_rdv)
    const horaires = commercant.horaires_detail || null
    if (horaires && Object.keys(horaires).length > 0 && horaires.always_open !== true) {
      const plages = creneauxDuJour(horaires[jourSem])
      if (horaires[jourSem] !== undefined && horaires[jourSem] !== null) {
        if (plages.length === 0) {
          return NextResponse.json({ ok: false, error: `${commercant.nom} est fermé ce jour-là. Choisis un autre jour.`, creneau_refuse: true }, { status: 409 })
        }
        const tient = plages.some(([d, f]) => debutMin >= timeToMinutes(d) && finMin <= timeToMinutes(f))
        if (!tient) {
          return NextResponse.json({ ok: false, error: 'Ce créneau tombe en dehors des heures d\'ouverture. Choisis-en un autre.', creneau_refuse: true }, { status: 409 })
        }
      }
    }

    // La pause du praticien concerné. ⚠️ Un créneau sans praticien vaut pour
    // tout le salon ; celui d'une collègue ne concerne pas ce rendez-vous, et
    // c'est le défaut du 05/08 : la pause de Carole faisait refuser un
    // rendez-vous chez sa collègue.
    const { data: creneauxJour } = await db
      .from('rdv_creneaux')
      .select('praticien_id, jour_semaine, date_specifique, pause_debut, pause_fin, actif, deleted_at')
      .eq('commercant_id', commercant.id)
      .eq('actif', true)
      .is('deleted_at', null)
    const enPause = (creneauxJour || []).some(c => {
      if (!c.pause_debut || !c.pause_fin) return false
      const bonJour = c.date_specifique === date_rdv || (!c.date_specifique && c.jour_semaine === jourSem)
      if (!bonJour) return false
      if (c.praticien_id && praticien_id && String(c.praticien_id) !== String(praticien_id)) return false
      // Bornes exclusives des deux côtés : une pause qui finit à 13h00 laisse le
      // rendez-vous de 13h00 parfaitement libre.
      return debutMin < timeToMinutes(c.pause_fin) && finMin > timeToMinutes(c.pause_debut)
    })
    if (enPause) {
      return NextResponse.json({ ok: false, error: 'Ce créneau tombe pendant une pause. Choisis-en un autre.', creneau_refuse: true }, { status: 409 })
    }

    // ─── LES AVANTAGES, RECHARGÉS EN BASE ──────────────────────────────────
    //
    // ⚠️ MÊME RÈGLE QUE LES DEUX TUNNELS DE PAIEMENT : identité PROUVÉE par le
    // jeton pour la récompense, jamais `client_email` qui est envoyé par le
    // client et ne prouve rien. Le bon, lui, est revalidé contre le commerçant,
    // le statut, l'expiration et le solde.
    let recompense = null
    if (fidelite_recompense_id) {
      const identite = await identiteProuvee(request)
      if (!identite?.email) {
        return NextResponse.json({
          ok: false,
          error: 'Connecte-toi pour utiliser ta récompense fidélité.',
          recompense_refusee: 'non_connecte',
        }, { status: 401 })
      }
      const resRec = await chargerRecompensePourYopper(db, {
        email: identite.email, commercantId: commercant.id, recompenseId: fidelite_recompense_id,
      })
      if (!resRec.ok) {
        return NextResponse.json({ ok: false, error: 'Récompense inutilisable.', recompense_refusee: resRec.raison }, { status: 400 })
      }
      recompense = resRec.recompense
    }

    let bonCadeau = null
    if (bon_cadeau_code) {
      const codeBon = normaliserCodeBon(bon_cadeau_code)
      if (!codeBon) return NextResponse.json({ ok: false, error: `Code de ${libelleBon(commercant.categorie)} invalide.` }, { status: 400 })
      const resBon = await chargerBonValide(db, { code: codeBon, commercant_id: commercant.id, categorie: commercant.categorie })
      if (!resBon.ok) return NextResponse.json({ ok: false, error: resBon.error, bon_refuse: true }, { status: 400 })
      bonCadeau = resBon.bon
    }

    // ─── LA VENTILATION, LA MÊME QUE PARTOUT ───────────────────────────────
    //
    // ⚠️ SANS PRODUITS ICI : ce tunnel n'en porte pas. La récompense et le bon
    // se posent donc entièrement sur la prestation, et l'acompte se calcule sur
    // le NET, règle F22.
    const prixBase = prestation.prix != null ? Number(prestation.prix) : null
    const acomptePct = prestation.acompte_pourcent || commercant.rdv_acompte_global || 0
    const acompteEnLigne = !!(commercant.rdv_acompte_en_ligne_actif && commercant.stripe_account_charges_enabled)
    const remiseRecompenseEUR = (recompense && prixBase != null)
      ? appliquerRecompenseAvantBon(recompense, prixBase).remiseRecompense
      : 0

    const vent = ventilerTunnelRdv({
      prixPrestation: prixBase,
      acomptePourcent: acomptePct,
      acompteEnLigne,
      totalProduits: 0,
      remiseRecompense: remiseRecompenseEUR,
      soldeBon: bonCadeau ? Number(bonCadeau.solde) : 0,
    })

    // 🔴 LA GARDE QUI FAIT TENIR TOUT LE RESTE. Si un acompte encaissable
    // subsiste, cette route N'EST PAS le bon chemin : le commerçant a demandé un
    // acompte, et l'accepter ici le lui ferait perdre en silence. On refuse, et
    // on nomme le chemin à prendre.
    //
    // ⚠️ LE SERVEUR RECALCULE, IL NE CROIT PAS L'ÉCRAN. Le bon et la récompense
    // viennent d'être rechargés en base : c'est ce solde-là qui décide, pas
    // celui que le navigateur annonçait il y a vingt minutes.
    if (vent.acompte >= MINIMUM_STRIPE) {
      return NextResponse.json({
        ok: false,
        error: 'Ce rendez-vous demande un acompte : il doit passer par le paiement en ligne.',
        paiement_requis: true,
        acompte: vent.acompte,
      }, { status: 409 })
    }

    // ─── LA FICHE CLIENT ───────────────────────────────────────────────────
    //
    // ⚠️ RÉSOLUE ICI, PAS REÇUE. L'écran envoyait jusqu'à présent le `client_id`
    // qu'il avait obtenu : un identifiant de fiche fourni par l'appelant, donc
    // rattachable à n'importe qui. On le retrouve par l'email, comme le fait
    // `/api/yopper/client`, et on ne touche pas à une fiche existante.
    let clientId = null
    {
      const { data: fiche } = await db.from('clients').select('id').eq('email', email).maybeSingle()
      if (fiche) clientId = fiche.id
      else {
        const { data: cree } = await db.from('clients')
          .insert({ email, prenom: client_prenom, nom: client_nom, telephone: client_telephone })
          .select('id').single()
        clientId = cree?.id || null
      }
    }

    // ─── LA RÉSERVATION ────────────────────────────────────────────────────
    //
    // Le lieu gravé, la capacité gravée et la première place libre viennent du
    // module : ce sont exactement les trois choses qui se recopiaient à quatre
    // endroits.
    const res = await creerReservationRdv(db, {
      commercantId: commercant.id,
      prestationId: prestation.id,
      dateRdv: date_rdv,
      heureDebut: heure,
      lieuId: lieu_id,
      champs: {
        client_id: clientId,
        praticien_id: praticien_id || null,
        client_email: email,
        client_prenom,
        client_nom,
        client_telephone,
        heure_fin: heureFin,
        duree_minutes: dureeMinutes,
        // ⚠️ LE TARIF RESTE LE BRUT, et la remise voyage à côté : une remise ne
        // réécrit pas un tarif, et tous les calculs de solde la retranchent.
        prix_estime: prixBase,
        // ⚠️ `null` ET NON `0` quand il n'y a pas d'acompte : l'écran de
        // confirmation teste la présence de ce champ, et « 0,00 € payé en
        // ligne » se lit comme une erreur de caisse.
        acompte_montant: vent.acompte > 0 ? vent.acompte : null,
        // ⚠️ CE QUI ÉTAIT DÛ, à côté de ce qui a été encaissé. Le bon se déduit
        // de l'acompte dû euro pour euro : sans ce nombre figé, un no-show ne
        // saurait plus quelle part du bon tenait lieu de garantie.
        acompte_du: vent.acompteDu,
        acompte_paye: false,
        statut: 'confirme',
        source: 'yopper',
        notes_client: (typeof notes_client === 'string' && notes_client.trim()) ? notes_client.trim() : null,
        rgpd_marketing: !!rgpd_marketing,
        // ⚠️ LES DEUX AVANTAGES SONT FIGÉS SUR LE RENDEZ-VOUS, comme le fait le
        // webhook. Sans eux, le rendez-vous naîtrait au tarif plein : le
        // comptoir réclamerait la différence, l'annulation ne saurait pas quoi
        // rendre, et le journal comptable compterait un argent jamais versé.
        ...(recompense ? {
          fidelite_recompense_id: recompense.id,
          fidelite_remise: vent.recompenseSurPresta,
        } : {}),
        ...(bonCadeau && vent.bonSurPresta > 0 ? {
          bon_cadeau_id: bonCadeau.id,
          bon_cadeau_montant: vent.bonSurPresta,
        } : {}),
      },
    })

    if (!res.ok) {
      if (res.code === 'place_prise') {
        return NextResponse.json({ ok: false, error: 'place_prise', collectif: !!res.collectif }, { status: 409 })
      }
      if (res.code === 'prestation_hors_commerce' || res.code === 'prestation_introuvable') {
        return NextResponse.json({ ok: false, error: 'Prestation introuvable.' }, { status: 404 })
      }
      console.error('[rdv/reserver] insert KO', res.error)
      return NextResponse.json({ ok: false, error: 'Ta réservation n\'a pas pu être enregistrée. Réessaie.' }, { status: 500 })
    }

    // ⚠️ APRÈS L'INSERT, JAMAIS AVANT : les deux mouvements DÉSIGNENT le
    // rendez-vous. Et une insertion qui échoue ne doit pas avoir brûlé la
    // récompense d'un rendez-vous qui n'existe pas.
    const bilan = await appliquerAvantagesRdv(db, {
      rdvId: res.rdv.id,
      recompenseId: recompense?.id || null,
      bonCadeauId: (bonCadeau && vent.bonSurPresta > 0) ? bonCadeau.id : null,
      bonMontant: vent.bonSurPresta,
    })

    return NextResponse.json({
      ok: true,
      rdv: {
        ...res.rdv,
        commercant_id: commercant.id,
        prestation_id: prestation.id,
        praticien_id: praticien_id || null,
        date_rdv,
        heure_debut: heure,
        heure_fin: heureFin,
        duree_minutes: dureeMinutes,
        prix_estime: prixBase,
        acompte_montant: vent.acompte > 0 ? vent.acompte : null,
        acompte_du: vent.acompteDu,
        acompte_paye: false,
        statut: 'confirme',
        client_email: email,
        client_prenom,
        client_nom,
        client_telephone,
        fidelite_remise: recompense ? vent.recompenseSurPresta : 0,
        bon_cadeau_montant: vent.bonSurPresta,
        lieu_libelle: res.payload.lieu_libelle ?? null,
        lieu_adresse: res.payload.lieu_adresse ?? null,
      },
      // Ce que l'écran de confirmation doit pouvoir dire : ce qui a été
      // réellement déduit, et sur quoi il reste à payer au comptoir.
      avantages: {
        recompense: bilan.recompense ? vent.recompenseSurPresta : 0,
        bon: bilan.bon ? vent.bonSurPresta : 0,
        solde_sur_place: vent.soldeSurPlace,
      },
    })

  } catch (e) {
    console.error('[rdv/reserver] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
