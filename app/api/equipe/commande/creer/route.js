// POST /api/equipe/commande/creer
// Body : { commercant_id, mode: 'retrait'|'livraison', date_commande, creneau_id,
//          articles: [{ id, quantite, variante_id?, options? }],
//          client: { nom, telephone?, email? }, envoyer_confirmation,
//          paiement: 'a_payer'|'especes'|'terminal', note?,
//          livraison?: { best_rue_id, code_postal, numero, complement, adresse, note },
//          confirmes?: [codes d'avertissement montrés et acceptés] }
//
// LA COMMANDE ENCODÉE À LA MAIN (Alex, 10/10, « version express »). Le
// téléphone sonne, le commerçant encode en trois gestes : le créneau, les
// articles, le nom. La commande remplit LES MÊMES créneaux et LE MÊME stock que
// les commandes en ligne : c'est tout son intérêt, il voit sa vraie soirée.
//
// 🔴 CE N'EST PAS `create-commande`, ET C'EST VOULU. Cette route-là est faite
// pour le client : e-mail obligatoire, fiche publiée, heure limite, au plus
// deux commandes sur place, paiement Stripe. Ici, le commerçant SAIT ce qu'il
// fait : on le PRÉVIENT (créneau plein, stock court, délai dépassé, hors zone),
// et il confirme d'un second geste (décision d'Alex). Les règles sont pourtant
// LES MÊMES FONCTIONS : `construireLignesCommande` (prix, TVA),
// `occupationDuCreneau` + `commandeDeborde` (capacité), `verifierStockDisponible`
// (stock et circuits), `creneauCommandable` (moment), `fraisLivraison`.
//
// ⚠️ QUI : le patron, l'admin vérifié, et les membres avec la case
// « Commandes » (`gardeEquipe`). Le commerce vient de la garde, jamais du corps.
//
// ⚠️ L'ARGENT : `paye_en_ligne` reste FAUX (Stripe n'a rien vu, aucun frais) ;
// « payé » écrit l'encaissement tout de suite (espèces ou terminal), « à payer
// au retrait » le laisse vide et la question sera posée à la remise.
//
// ⚠️ LE STOCK : pas de réservation de cinq minutes, la commande est confirmée
// à l'instant. Elle consomme le stock par ses lignes, comme toute commande
// confirmée (`verifierStockDisponible` les compte).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe, journaliserGeste } from '@/lib/equipe-server'
import { verdictForfait } from '@/lib/garde-forfait'
import { construireLignesCommande, verifierStockDisponible, SELECT_ARTICLES, SELECT_DEALS, SELECT_OPTIONS_VALEURS, SELECT_GROUPES_OPTIONS, lirePrixTaille } from '@/lib/lignes-commande'
import { commandeDeborde, capaciteDuCreneau, creneauCommandable } from '@/lib/creneaux'
import { occupationDuCreneau } from '@/lib/occupation-creneau-server'
import { preleverStockVariantes } from '@/lib/stock-variantes-server'
import { brusselsInstant, jourBruxelles } from '@/lib/timezone'
import { estFermeExceptionnellement, creneauRetraitHorsHoraires, messageHorsHoraires } from '@/lib/ouverture'
import { COLONNES_EXCEPTIONS, exceptionsPour } from '@/lib/horaires-du-jour'
import { zoneCouverte, fraisLivraison, minimumAtteint } from '@/lib/livraison'
import { zoneValide, dansEtoile, centreDeLaZone } from '@/lib/zone-etoile'
import { situerMaison } from '@/lib/best-adresse-serveur'
import { composerAdresseLivraison, NOTE_MAX } from '@/lib/adresse-livraison'
import { tauxFraisLivraison, REGIME_EMPORTER } from '@/lib/tva'
import { envoyerEmailsCommande } from '@/lib/commande-notifs'
import { eurosNus } from '@/lib/montants'
import {
  ORIGINE_COMMERCANT, MODES_ENCODEE, clientEncode, champsPaiementEncodee,
  avertissement, confirmationRequise, jugementMoment, creneauTermine, articleHorsJour, horsCalendrier,
} from '@/lib/commande-encodee'
import { calendrierDuCommerce } from '@/lib/calendrier-commande-server'
import { joursIndisponibles } from '@/lib/delai-commande'

export const dynamic = 'force-dynamic'

const non = (error, status = 400, extra = {}) => NextResponse.json({ ok: false, error, ...extra }, { status })

export async function POST(request) {
  try {
    const corps = await request.json().catch(() => ({}))
    const { commercant_id, mode, date_commande, creneau_id } = corps || {}
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')
    if (!garde.ok) return non(garde.error, garde.status)

    if (!MODES_ENCODEE.includes(mode)) return non('Choisis le retrait ou la livraison.')
    const estLivraison = mode === 'livraison'
    if (!creneau_id) return non(estLivraison ? 'Choisis une tournée.' : 'Choisis un créneau.')
    const panier = Array.isArray(corps.articles) ? corps.articles.filter(a => a && a.id) : []
    if (panier.length === 0) return non('Ajoute au moins un article.')

    const c = clientEncode(corps.client || {})
    if (!c.ok) return non(c.error)
    const { client } = c

    // ── Le commerce, relu en base ─────────────────────────────────────────
    const { data: commercant, error: errC } = await admin
      .from('commercants')
      .select('id, nom, categorie, tva_taux_defaut, mode_capacite, plan, essai_plan, created_at, horizon_commande, horaires_detail')
      .eq('id', commercant_id)
      .maybeSingle()
    if (errC || !commercant) return non('Commerce introuvable.', 404)
    // 🔴 ENCODER, C'EST CRÉER (audit du 17/10, décision d'Alex au tableau). La
    // garde d'équipe laisse toujours passer le patron, et rien ne lisait la
    // formule : hors Vendre, il encodait encore des commandes que ses clients
    // ne pouvaient plus passer. Ce qui existe reste à honorer ; le neuf, non.
    const forfait = verdictForfait(commercant, 'commande')
    if (!forfait.ok) return non(forfait.message, forfait.statut, { code: forfait.code, plan_requis: forfait.plan_requis })
    // Les créneaux et la livraison n'existent qu'en alimentaire : le détail n'a
    // aucune heure promise (CATEGORIES_SANS_CRENEAU).
    if (commercant.categorie !== 'alimentaire') return non('La commande encodée est réservée aux commerces alimentaires.')

    const avertissements = []

    // ── Le moment : date et créneau ───────────────────────────────────────
    const table = estLivraison ? 'livraison_creneaux' : 'creneaux'
    const { data: creneau, error: errCr } = await admin
      .from(table)
      .select('id, heure_debut, heure_fin, jour_semaine, actif, commercant_id, max_commandes, capacite_temps, mode_capacite, cutoff_minutes')
      .eq('id', creneau_id)
      .maybeSingle()
    if (errCr) return non('Impossible de lire ce créneau. Réessaie.', 500)
    if (!creneau || creneau.commercant_id !== commercant.id || !creneau.actif) return non('Créneau introuvable ou inactif.')

    const moment = jugementMoment({
      verdict: creneauCommandable(creneau, { dateStr: date_commande, instantDebut: brusselsInstant }),
      dateCommande: date_commande,
      aujourdhui: jourBruxelles(),
      termine: creneauTermine(creneau, { dateStr: date_commande, instant: brusselsInstant }),
    })
    if (moment.refus) return non(moment.refus)
    if (moment.avertissement) avertissements.push(moment.avertissement)

    const { data: fermeturesLues, error: errF } = await admin
      // ⚠️ AVEC LES PLAGES (16/10) : un jour d'horaires adaptés n'est pas fermé.
      .from('fermetures_exceptionnelles').select(COLONNES_EXCEPTIONS).eq('commercant_id', commercant.id)
    if (errF) return non('Impossible de vérifier les fermetures. Réessaie.', 500)
    // ✅ 16/10 soir : seulement ce qui ferme les COMMANDES (pas les rendez-vous).
    const fermetures = exceptionsPour(fermeturesLues, 'commandes')
    if (estFermeExceptionnellement(fermetures || [], date_commande)) avertissements.push(avertissement('jour_ferme'))
    // 🔴 (11/10) LES HORAIRES, POUR LE RETRAIT : la règle de la fiche et du
    // serveur en ligne, en AVERTISSEMENT ici (« Autre date » reste possible).
    // ✅ 16/10 : l'horaire du JOUR, et la tournée un jour d'horaires adaptés.
    {
      const hors = creneauRetraitHorsHoraires({
        creneau, dateStr: date_commande, horairesDetail: commercant.horaires_detail,
        fermetures: fermetures || [], seulementException: estLivraison,
      })
      if (hors) avertissements.push(avertissement('hors_horaires', messageHorsHoraires(hors, date_commande, { pourCommercant: true })))
    }
    // L'exception « Autre date » (Alex, 10/10) : au-delà du calendrier de la
    // fiche, on prévient. Même longueur que la fiche (`calendrierDuCommerce`).
    const calendrier = await calendrierDuCommerce({ supabase: admin, commercant })
    if (!calendrier.ok) return non('Impossible de lire ton calendrier. Réessaie.', 500)
    if (horsCalendrier({ jour: date_commande, aujourdhui: jourBruxelles(), longueur: calendrier.longueur })) {
      avertissements.push(avertissement('hors_calendrier'))
    }

    const colonneBlocage = estLivraison ? 'livraison_creneau_id' : 'creneau_id'
    const { data: blocage, error: errB } = await admin
      .from('creneaux_blocages').select('id')
      .eq('commercant_id', commercant.id).eq(colonneBlocage, creneau.id).eq('date_blocage', date_commande)
      .maybeSingle()
    if (errB) return non('Impossible de vérifier ce créneau. Réessaie.', 500)
    if (blocage) avertissements.push(avertissement('creneau_bloque'))

    // ── Les articles, le prix, la TVA : la règle de toutes les commandes ──
    const articleIds = [...new Set(panier.map(a => a.id))]
    const [
      { data: articlesData, error: eA },
      { data: optionsValeurs, error: eO },
      { data: variantesData, error: eV },
      { data: dealsData, error: eD },
      { data: groupesOptions, error: eG },
    ] = await Promise.all([
      admin.from('articles').select(SELECT_ARTICLES).in('id', articleIds),
      // Les options des articles du panier seulement, et leurs groupes (11/10).
      admin.from('article_options_valeurs').select(SELECT_OPTIONS_VALEURS).in('article_options_groupes.article_id', articleIds),
      admin.from('article_variantes').select('id, article_id, axe1_valeur, axe2_valeur, prix, stock, actif').in('article_id', articleIds),
      admin.from('yoppaa_deals').select(SELECT_DEALS).eq('commercant_id', commercant.id).eq('actif', true),
      admin.from('article_options_groupes').select(SELECT_GROUPES_OPTIONS).in('article_id', articleIds),
    ])
    if (eA || eO || eV || eD || eG) return non('Impossible de lire le catalogue. Réessaie.', 500)
    // (13/10) Les prix des suppléments selon la taille, même règle.
    const { data: prixTaille, error: eP } = await lirePrixTaille(admin, optionsValeurs)
    if (eP) return non('Impossible de lire le catalogue. Réessaie.', 500)
    if (!articlesData || articlesData.length !== articleIds.length) return non('Un ou plusieurs articles sont introuvables.')
    for (const a of articlesData) {
      if (a.commercant_id !== commercant.id) return non(`« ${a.nom} » n’appartient pas à ce commerce.`)
      if (!a.actif) return non(`« ${a.nom} » est désactivé dans ton catalogue.`)
    }
    // ⚠️ AUCUNE OFFRE SÉPARÉE (lot, duo, fin de journée) : la grille encode des
    // articles. Les remises en cours s'appliquent, comme en ligne.
    const panierPropre = panier.map(({ id, quantite, variante_id, options }) => ({ id, quantite, variante_id: variante_id || null, options }))
    const calcul = construireLignesCommande({
      panier: panierPropre, articlesData, optionsValeurs, variantesData, dealsData,
      groupesOptions: groupesOptions || [],
      prixTaille: prixTaille || [],
      commercant, regime: REGIME_EMPORTER, dateCommande: date_commande,
      stockVarianteIndicatif: true,
    })
    if (!calcul.ok) return non(calcul.error, calcul.status)
    const { lignes, totalCents } = calcul
    for (const v of calcul.stocksVariantesCourts || []) {
      avertissements.push(avertissement(`stock:${v.article_id}`, `${v.nom} : il en reste ${v.disponible}.`))
    }

    // ── La livraison : adresse, zone, minimum, frais ──────────────────────
    let fraisLivraisonCents = 0
    let adresseEnregistree = null
    let coords = null
    if (estLivraison) {
      const l = corps.livraison || {}
      const { data: cfg, error: errCfg } = await admin
        .from('livraison_config')
        .select('codes_postaux, frais_fixe, gratuit_des, minimum_commande, actif, zone_rayons_m')
        .eq('commercant_id', commercant.id)
        .maybeSingle()
      if (errCfg) return non('Impossible de lire ta configuration de livraison. Réessaie.', 500)
      if (!cfg) return non('Règle d’abord ta livraison (frais, zone) dans ton tableau de bord.')

      const codePostal = String(l.code_postal || '').trim()
      const maison = l.best_rue_id
        ? await situerMaison(admin, { rueId: l.best_rue_id, codePostal, numero: l.numero })
        : { ok: true, trouvee: false }
      const complement = String(l.complement ?? '').slice(0, 120)
      if (maison.ok && maison.trouvee) {
        coords = { lat: maison.lat, lng: maison.lng }
        adresseEnregistree = composerAdresseLivraison({
          rue: `${maison.rue} ${maison.numero}`, complement, code_postal: codePostal, ville: maison.localite,
        })
      } else {
        // Le commerçant connaît son client : une adresse hors du référentiel se
        // livre quand même, mais elle n'aura pas de place sur la tournée.
        adresseEnregistree = String(l.adresse || '').trim().slice(0, 300)
        if (!adresseEnregistree) return non('Indique l’adresse de livraison.')
        avertissements.push(avertissement('adresse_non_situee'))
      }

      if (zoneValide(cfg.zone_rayons_m)) {
        if (coords) {
          const { data: lieux } = await admin.from('commercant_lieux')
            .select('type, principal, actif, latitude, longitude, adresse')
            .eq('commercant_id', commercant.id).eq('actif', true)
          const verdict = dansEtoile({ centre: centreDeLaZone({ lieux: lieux || [] }), rayons: cfg.zone_rayons_m, point: coords })
          if (verdict && !verdict.dedans) avertissements.push(avertissement('hors_zone'))
        }
      } else if (!zoneCouverte(cfg.codes_postaux, codePostal)) {
        avertissements.push(avertissement('hors_zone'))
      }

      const totalEUR = totalCents / 100
      const mini = minimumAtteint({ total: totalEUR, minimum: cfg.minimum_commande })
      if (!mini.ok) avertissements.push(avertissement('minimum_livraison', `Il manque ${eurosNus(mini.manque)} € (minimum ${eurosNus(mini.seuil)} €).`))
      fraisLivraisonCents = Math.round(fraisLivraison({ total: totalEUR, frais_fixe: cfg.frais_fixe, gratuit_des: cfg.gratuit_des }).montant * 100)
    }

    // ── La capacité : le même compte que la commande en ligne ─────────────
    const tempsCommande = lignes.reduce((s, l) => {
      const art = articlesData.find(a => String(a.id) === String(l.article_id))
      return s + Number(l.quantite || 0) * Number(art?.temps_prepa ?? 1)
    }, 0)
    const { modeTemps, capacite: capaciteReglee } = capaciteDuCreneau(creneau, commercant.mode_capacite)
    if (capaciteReglee !== null) {
      const occupation = await occupationDuCreneau({
        supabase: admin, commercantId: commercant.id, creneauId: creneau.id,
        estLivraison, date: date_commande, modeTemps,
      })
      if (!occupation.ok) return non('Impossible de vérifier ce créneau. Réessaie.', 500)
      if (commandeDeborde(creneau, {
        modeCapaciteDefaut: commercant.mode_capacite,
        existantes: occupation.existantes,
        tempsExistant: occupation.tempsExistant,
        tempsDemande: tempsCommande,
      })) avertissements.push(avertissement('creneau_plein'))
    }

    // ── Chaque article, ce jour-là : ses règles, puis son stock ───────────
    // 🔴 UN AVERTISSEMENT PAR ARTICLE, TOUS EN UNE FOIS (Alex, 10/10). La
    // tarte à J+2 s'encodait sans un mot, et `verifierStockDisponible` s'arrête
    // au PREMIER problème : le commerçant confirmait, puis en découvrait un
    // deuxième, puis un troisième.
    //   1) la règle de la fiche (`articleHorsJour` : délai, jours de vente,
    //      circuits), lue sur l'article EN BASE, avec son premier jour possible ;
    //   2) sinon le stock, par LA fonction de la commande en ligne, article
    //      par article (une panne de lecture reste une erreur).
    const idsPanier = [...new Set(lignes.map(l => String(l.article_id)))]
    const { data: joursOff, error: errOff } = await admin
      .from('article_stock_jour').select('article_id, jour_semaine, stock, actif').in('article_id', idsPanier)
    if (errOff) return non('Impossible de vérifier les jours de vente. Réessaie.', 500)
    const aujourdhui = jourBruxelles()
    const aVerifier = []
    for (const id of idsPanier) {
      const art = articlesData.find(a => String(a.id) === id)
      const entrees = {}
      for (const s of joursOff || []) if (String(s.article_id) === id) entrees[s.jour_semaine] = { stock: s.stock, actif: s.actif }
      const hors = articleHorsJour({ article: art, indispo: joursIndisponibles(entrees), commercant, jour: date_commande, aujourdhui })
      if (hors) avertissements.push(avertissement(`article:${id}`, hors.message))
      else aVerifier.push(id)
    }
    const verifs = await Promise.all(aVerifier.map(id => verifierStockDisponible({
      supabase: admin, lignes: lignes.filter(l => String(l.article_id) === id),
      commercantId: commercant.id, dateCommande: date_commande, commercant,
    }).then(v => ({ id, v }))))
    for (const { id, v } of verifs) {
      if (v.ok) continue
      if (v.status >= 500) return non(v.error, v.status)
      const nomArt = articlesData.find(a => String(a.id) === id)?.nom || 'Cet article'
      avertissements.push(avertissement(`stock:${id}`, Number.isFinite(v.stock_disponible)
        ? `« ${nomArt} » : il en reste ${v.stock_disponible}.`
        : v.error))
    }

    // ── Prévenir avant d'écrire ───────────────────────────────────────────
    if (confirmationRequise(avertissements, corps.confirmes)) {
      return NextResponse.json({ ok: false, a_confirmer: true, avertissements }, { status: 409 })
    }

    const totalEUR = (totalCents + fraisLivraisonCents) / 100
    const paiement = champsPaiementEncodee({ paiement: corps.paiement, total: totalEUR })
    if (!paiement.ok) return non(paiement.error)

    // ── L'écriture ────────────────────────────────────────────────────────
    const fraisLivraisonEUR = fraisLivraisonCents / 100
    const { data: commande, error: errInsert } = await admin
      .from('commandes')
      .insert({
        commercant_id: commercant.id,
        origine: ORIGINE_COMMERCANT,
        creneau_id: estLivraison ? null : creneau.id,
        creneau_livraison_id: estLivraison ? creneau.id : null,
        mode_retrait: estLivraison ? 'livraison' : 'retrait',
        regime_tva: REGIME_EMPORTER,
        tva_taux_livraison: fraisLivraisonEUR > 0 ? tauxFraisLivraison(lignes.map(l => l.tva_taux), commercant.tva_taux_defaut) : null,
        adresse_livraison: estLivraison ? adresseEnregistree : null,
        livraison_lat: coords?.lat ?? null,
        livraison_lng: coords?.lng ?? null,
        note_livraison: estLivraison ? (String(corps.livraison?.note ?? '').trim().slice(0, NOTE_MAX) || null) : null,
        frais_livraison: fraisLivraisonEUR,
        ...client,
        notes_client: String(corps.note ?? '').trim().slice(0, 500) || null,
        // La commande se confirme au téléphone : c'est l'exécution du contrat.
        // Aucun consentement marketing n'est présumé.
        rgpd_commande: true,
        rgpd_marketing: false,
        total: totalEUR,
        statut: 'en_attente',
        date_commande,
        temps_prepa_minutes: tempsCommande,
        ...paiement.champs,
      })
      .select('id, numero_commande, numero_prefixe')
      .single()
    if (errInsert || !commande) {
      console.error('[equipe/commande/creer] insert KO', errInsert?.message)
      return non('La commande n’a pas pu être enregistrée. Réessaie.', 500)
    }

    const { error: errLignes } = await admin.from('commande_articles').insert(lignes.map(l => ({
      commande_id: commande.id,
      article_id: l.article_id,
      article_nom: l.article_nom,
      variante_id: l.variante_id || null,
      deal_id: null,
      quantite: l.quantite,
      // Le stock réellement retiré, figé (MIGRATION_LOTS_STOCK_REEL, 11/10).
      quantite_stock: l.quantite_stock,
      duo_article_id: l.deal_article2_id || null,
      prix_unitaire: l.prix_unitaire,
      options: l.options,
      tva_taux: l.tva_taux,
    })))
    if (errLignes) {
      await admin.from('commandes').delete().eq('id', commande.id)
      console.error('[equipe/commande/creer] insert lignes KO', errLignes.message)
      return non('La commande n’a pas pu être enregistrée. Réessaie.', 500)
    }

    await preleverStockVariantes(admin, lignes, variantesData)

    // L'e-mail au client : une CONFIRMATION, seulement si le commerçant l'a
    // demandée et qu'une adresse existe. Jamais l'e-mail « Nouvelle commande »
    // au commerçant : il vient de la saisir.
    const confirmation = !!corps.envoyer_confirmation && !!client.client_email
    await envoyerEmailsCommande(commande.id, admin, { versClient: confirmation, versCommercant: false })

    await journaliserGeste(admin, garde, {
      action: 'commande_encodee', cible_type: 'commande', cible_id: commande.id,
      details: { date: date_commande, mode, total: totalEUR, paiement: corps.paiement, avertissements: avertissements.map(a => a.code) },
    })

    return NextResponse.json({ ok: true, commande_id: commande.id, numero: commande.numero_commande, prefixe: commande.numero_prefixe, confirmation_envoyee: confirmation })
  } catch (e) {
    console.error('[equipe/commande/creer] erreur', e?.message || e)
    return non('Erreur serveur, réessaie.', 500)
  }
}
