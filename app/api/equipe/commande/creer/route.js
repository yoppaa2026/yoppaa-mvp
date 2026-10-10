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
import { construireLignesCommande, verifierStockDisponible, SELECT_ARTICLES, SELECT_DEALS } from '@/lib/lignes-commande'
import { commandeDeborde, capaciteDuCreneau, creneauCommandable } from '@/lib/creneaux'
import { occupationDuCreneau } from '@/lib/occupation-creneau-server'
import { preleverStockVariantes } from '@/lib/stock-variantes-server'
import { brusselsInstant, jourBruxelles } from '@/lib/timezone'
import { estFermeExceptionnellement } from '@/lib/ouverture'
import { zoneCouverte, fraisLivraison, minimumAtteint } from '@/lib/livraison'
import { zoneValide, dansEtoile, centreDeLaZone } from '@/lib/zone-etoile'
import { situerMaison } from '@/lib/best-adresse-serveur'
import { composerAdresseLivraison, NOTE_MAX } from '@/lib/adresse-livraison'
import { tauxFraisLivraison, REGIME_EMPORTER } from '@/lib/tva'
import { envoyerEmailsCommande } from '@/lib/commande-notifs'
import { eurosNus } from '@/lib/montants'
import {
  ORIGINE_COMMERCANT, MODES_ENCODEE, clientEncode, champsPaiementEncodee,
  avertissement, confirmationRequise, jugementMoment, creneauTermine,
} from '@/lib/commande-encodee'

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
      .select('id, nom, categorie, tva_taux_defaut, mode_capacite, plan, essai_plan, created_at')
      .eq('id', commercant_id)
      .maybeSingle()
    if (errC || !commercant) return non('Commerce introuvable.', 404)
    // Les créneaux et la livraison n'existent qu'en alimentaire : le détail n'a
    // aucune heure promise (CATEGORIES_SANS_CRENEAU).
    if (commercant.categorie !== 'alimentaire') return non('La commande encodée est réservée aux commerces alimentaires.')

    const avertissements = []

    // ── Le moment : date et créneau ───────────────────────────────────────
    const table = estLivraison ? 'livraison_creneaux' : 'creneaux'
    const { data: creneau, error: errCr } = await admin
      .from(table)
      .select('id, heure_debut, heure_fin, jour_semaine, actif, commercant_id, max_commandes, capacite_temps, mode_capacite, cutoff_heures')
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

    const { data: fermetures, error: errF } = await admin
      .from('fermetures_exceptionnelles').select('date_debut, date_fin').eq('commercant_id', commercant.id)
    if (errF) return non('Impossible de vérifier les fermetures. Réessaie.', 500)
    if (estFermeExceptionnellement(fermetures || [], date_commande)) avertissements.push(avertissement('jour_ferme'))

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
    ] = await Promise.all([
      admin.from('articles').select(SELECT_ARTICLES).in('id', articleIds),
      admin.from('article_options_valeurs').select('id, nom, prix_supplement, groupe_id, article_options_groupes!inner(article_id, nom)'),
      admin.from('article_variantes').select('id, article_id, axe1_valeur, axe2_valeur, prix, stock, actif').in('article_id', articleIds),
      admin.from('yoppaa_deals').select(SELECT_DEALS).eq('commercant_id', commercant.id).eq('actif', true),
    ])
    if (eA || eO || eV || eD) return non('Impossible de lire le catalogue. Réessaie.', 500)
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

    // ── Le stock : la même règle, mais un refus devient un avertissement ──
    const verifStock = await verifierStockDisponible({
      supabase: admin, lignes, commercantId: commercant.id, dateCommande: date_commande, commercant,
    })
    if (!verifStock.ok) {
      if (verifStock.status >= 500) return non(verifStock.error, verifStock.status)
      avertissements.push(avertissement(`stock:${verifStock.article_id || 'circuit'}`, verifStock.error))
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
