// LA CRÉATION D'UNE RÉSERVATION, ÉCRITE UNE SEULE FOIS.
//
// 🔴 POURQUOI CE MODULE EXISTE. Quatre endroits créaient un rendez-vous, et
// chacun rebâtissait le même payload à sa façon : le webhook Stripe, la route
// d'abonnement, la modale du tableau de bord, et l'écran du tunnel qui écrivait
// DEPUIS LE NAVIGATEUR. Trois choses s'y recopiaient à l'identique, et les
// trois coûtent cher le jour où elles divergent :
//
//   • LE LIEU GRAVÉ, sans lequel la confirmation annonce le siège social, donc
//     le DOMICILE d'une commerçante inscrite chez elle mais qui donne cours en
//     salle ;
//   • LA CAPACITÉ GRAVÉE, que la contrainte d'exclusion lit pour savoir si elle
//     doit s'appliquer : une contrainte ne peut pas interroger une table
//     voisine ;
//   • LA PREMIÈRE PLACE LIBRE, jamais « inscrits + 1 ». Quand quelqu'un annule,
//     sa place se libère AU MILIEU : sur un cours où 1, 2 et 4 sont prises, la
//     suivante est la 3. Compter aurait redonné une place déjà occupée, l'index
//     unique aurait rejeté l'insertion, et le client aurait lu « ce créneau
//     vient d'être pris » devant un cours à moitié vide.
//
// ⚠️ ET LE MODULE VA CHERCHER SES COLONNES LUI-MÊME. Les appelants lui
// passaient jusqu'ici un commerçant et une prestation déjà chargés, donc
// chargés avec le `select` de CHACUN. C'est la porte ouverte au défaut le plus
// fréquent de ce projet : la colonne absente d'un select, qui ne lève aucune
// erreur et laisse un repli bien conçu finir le travail en silence. Ici, un
// seul endroit sait de quoi le payload a besoin.
//
// ⚠️ LA PLACE SE CALCULE AU MOMENT DE L'ÉCRITURE, jamais avant. Entre le clic
// du client et l'arrivée d'un webhook Stripe, d'autres personnes ont pu
// s'inscrire : une place figée dans des métadonnées serait périmée, et l'index
// unique la rejetterait après que le client a payé.

import { capacitePrestation, premierePlaceLibre } from './cours-collectifs'
import { champsLieuPour } from './lieu-fige'
import { debiterBons } from './bons-cadeaux-server'
import { consommerRecompense } from './fidelite-recompense-server'

// Les statuts qui OCCUPENT une place. Un rendez-vous annulé libère la sienne.
const STATUTS_OCCUPENT = ['confirme', 'honore']

// Les colonnes dont le lieu gravé a besoin. Nommées ici, à côté de leur seul
// usage, pour qu'un ajout ne s'oublie pas dans trois `select` différents.
const COLONNES_LIEU = 'id, nom, adresse, latitude, longitude, siege_social_est_lieu_activite'

/**
 * Crée une réservation, avec son lieu, sa capacité et sa place.
 *
 * @param db            client Supabase (service_role côté serveur)
 * @param rdvId         identifiant imposé, ou null pour laisser la base décider
 * @param commercantId  le commerce
 * @param prestationId  la prestation ; sa capacité et son taux de TVA sont lus ici
 * @param dateRdv       'AAAA-MM-JJ'
 * @param heureDebut    'HH:MM'
 * @param lieuId        emplacement EXPLICITE de la plage, prioritaire sur l'heure
 * @param champs        tout le reste du payload, propre à l'appelant
 *
 * Rend { ok: true, rdv, payload } ou { ok: false, code, ... }.
 * Codes de refus : 'prestation_introuvable', 'prestation_hors_commerce',
 * 'place_prise', 'ecriture_impossible'.
 */
export async function creerReservationRdv(db, {
  rdvId = null,
  commercantId,
  prestationId,
  dateRdv,
  heureDebut,
  lieuId = null,
  champs = {},
} = {}) {
  const heure = String(heureDebut || '').slice(0, 5)

  // ⚠️ LA PRESTATION APPARTIENT-ELLE À CE COMMERCE ? La question se pose ICI et
  // pour tout le monde : une prestation désignée par un client est une donnée
  // reçue, et croiser deux identifiants sans vérifier leur lien laisse réserver
  // la prestation d'un salon dans l'agenda d'un autre.
  const { data: prestation } = await db
    .from('rdv_prestations')
    .select('id, nom, capacite, tva_taux, duree_minutes, commercant_id')
    .eq('id', prestationId)
    .maybeSingle()
  if (!prestation) return { ok: false, code: 'prestation_introuvable' }
  if (String(prestation.commercant_id) !== String(commercantId)) {
    return { ok: false, code: 'prestation_hors_commerce' }
  }

  const { data: commercant } = await db
    .from('commercants')
    .select(COLONNES_LIEU)
    .eq('id', commercantId)
    .maybeSingle()

  const lieu = await champsLieuPour(db, commercant, { jour: dateRdv, heure, lieuId })

  // La place ne se cherche que sur un cours collectif : pour un rendez-vous
  // individuel, la contrainte d'exclusion suffit et une lecture de plus ne
  // dirait rien de neuf.
  const capacite = capacitePrestation(prestation)
  let placeNo = 1
  if (capacite > 1) {
    const { data: dejaLa } = await db
      .from('rdv_reservations')
      .select('place_no')
      .eq('commercant_id', commercantId)
      .eq('date_rdv', dateRdv)
      .eq('heure_debut', heure)
      .eq('prestation_id', prestation.id)
      .in('statut', STATUTS_OCCUPENT)
      .is('deleted_at', null)
    placeNo = premierePlaceLibre(prestation, (dejaLa || []).map(r => r.place_no)) || 1
  }

  // ⚠️ CE QUE LE MODULE DÉCIDE PASSE APRÈS `champs`, et donc l'emporte. Un
  // appelant qui recopierait sa propre capacité ou son propre lieu recréerait
  // exactement la divergence que ce module existe pour tuer.
  const payload = {
    ...champs,
    ...(rdvId ? { id: rdvId } : {}),
    ...lieu,
    commercant_id: commercantId,
    prestation_id: prestation.id,
    date_rdv: dateRdv,
    heure_debut: heure,
    // TVA figée à la réservation, comme le lieu et pour la même raison : le
    // taux de la prestation peut changer, le rendez-vous déjà pris ne doit pas
    // bouger dans les exports comptables.
    tva_taux: prestation.tva_taux ?? null,
    capacite_creneau: capacite,
    place_no: placeNo,
  }

  const { data: cree, error } = await db
    .from('rdv_reservations')
    .insert(payload)
    .select('id, numero_rdv, numero_prefixe, place_no')
    .single()

  if (error) {
    // Double-booking rattrapé par la base, atomiquement :
    //   23505 = unique_violation    → même heure exacte, ou place déjà prise
    //   23P01 = exclusion_violation → chevauchement sur le praticien
    if (error.code === '23505' || error.code === '23P01') {
      // ⚠️ ON DIT LEQUEL DES DEUX. Sur un cours de douze, « ce créneau vient
      // d'être pris » laisserait croire que le cours est annulé, alors qu'il ne
      // reste simplement plus de place.
      return { ok: false, code: 'place_prise', collectif: capacite > 1 }
    }
    return { ok: false, code: 'ecriture_impossible', error }
  }

  return {
    ok: true,
    payload,
    rdv: {
      id: cree.id,
      numero_rdv: cree.numero_rdv ?? null,
      numero_prefixe: cree.numero_prefixe ?? null,
      place_no: cree.place_no ?? placeNo,
    },
  }
}

// ─── LES AVANTAGES, APRÈS L'INSERT ET JAMAIS AVANT ──────────────────────────
//
// ⚠️ APRÈS, parce que les deux mouvements DÉSIGNENT le rendez-vous : ils ne
// peuvent pas le précéder. Et parce qu'une insertion qui échoue ne doit pas
// avoir brûlé la récompense d'un rendez-vous qui n'existe pas.
//
// ⚠️ ET UN REJEU NE LES DÉPENSE PAS DEUX FOIS : la récompense s'écrit sous
// `utilisee_at IS NULL`, le bon sous un index unique partiel (bon, rdv).
//
// ⚠️ ON LIT LE RÉSULTAT. Un `await` dont on ignore le retour est un espoir, pas
// une action, et ici l'espoir coûte de l'argent réel : le bon resterait crédité
// alors qu'il vient de payer. C'est la dette nommée le 27/08, et ce module est
// l'endroit où elle se solde pour tous les appelants à la fois.
//
// Non bloquant par construction : le rendez-vous existe et le client a payé, une
// erreur ici ne doit ni faire rejouer un webhook ni rendre une réservation.
/**
 * Les bons d'un rendez-vous qui naît de métadonnées Stripe.
 *
 * 🔴 LE CANAL EST UNIQUE, ET C'EST CE QUI DISTINGUE LE RENDEZ-VOUS DE LA
 * COMMANDE. Une commande existe déjà en base quand le webhook arrive : il y lit
 * `bons_utilises`. Un rendez-vous, lui, N'EXISTE PAS ENCORE. Les métadonnées
 * sont le seul endroit où la liste a pu voyager.
 *
 * ⚠️ CHAQUE LIGNE EST VALIDÉE. Ces valeurs ont fait l'aller-retour par Stripe
 * sous forme de texte : une ligne bancale écrite telle quelle dans la colonne
 * d'argent y resterait pour toujours, et une annulation la relirait.
 *
 * ⚠️ ET LE REPLI SUR LA PAIRE EST INDISPENSABLE : des paiements partis AVANT ce
 * déploiement arriveront APRÈS. Leur session Stripe ne porte que
 * `bon_cadeau_id` et `bon_cadeau_montant`, et sans repli leur bon ne serait
 * jamais débité alors que le client a payé un acompte réduit.
 */
export function lignesBonsDeMeta(meta = {}) {
  const brut = meta?.bons_utilises
  if (typeof brut === 'string' && brut.trim()) {
    try {
      const parse = JSON.parse(brut)
      if (Array.isArray(parse)) {
        const lignes = parse
          .filter(l => typeof l?.id === 'string' && l.id && Number.isFinite(Number(l.montant)) && Number(l.montant) > 0)
          .map(l => ({ id: l.id, montant: Math.round(Number(l.montant) * 100) / 100 }))
        if (lignes.length > 0) return lignes
      }
      console.error('[rdv/creation] bons_utilises illisible dans les métadonnées', { brut })
    } catch {
      console.error('[rdv/creation] bons_utilises non analysable dans les métadonnées', { brut })
    }
  }
  if (meta?.bon_cadeau_id && Number(meta?.bon_cadeau_montant) > 0) {
    return [{ id: String(meta.bon_cadeau_id), montant: Number(meta.bon_cadeau_montant) }]
  }
  return []
}

// 🔴 UNE LISTE DE BONS DEPUIS LE 01/09, ET PLUS UN SEUL. Un rendez-vous peut
// être couvert par cinq bons : ne débiter que le premier aurait laissé les
// autres crédités alors que leur porteur les a dépensés, et le commerçant aurait
// servi une prestation qu'il n'a encaissée qu'en partie.
export async function appliquerAvantagesRdv(db, {
  rdvId,
  recompenseId = null,
  bonsUtilises = [],
} = {}) {
  const bilan = { recompense: false, bon: false }

  if (recompenseId) {
    try {
      const { data: recFid } = await db
        .from('fidelite_recompenses')
        .select('id, carte_id, utilisee_at')
        .eq('id', recompenseId)
        .maybeSingle()
      if (recFid && !recFid.utilisee_at) {
        await consommerRecompense(db, { recompense: recFid, source: 'rdv', rdvId })
        bilan.recompense = true
      }
    } catch (e) {
      console.error('[rdv/creation] consommation récompense KO (non bloquant)', e?.message, { rdvId })
    }
  }

  const lignesBons = Array.isArray(bonsUtilises) ? bonsUtilises : []
  if (lignesBons.length > 0) {
    try {
      const deb = await debiterBons(db, lignesBons, { source: 'rdv', rdv_id: rdvId })
      // ⚠️ ON NOMME CE QUI A ÉCHOUÉ, bon par bon. « Le débit a échoué » sur cinq
      // bons ne dit pas lequel : sans le détail, rien n'est rejouable, et un
      // bon débité sans l'être vraiment est de l'argent introuvable.
      if (!deb?.ok) console.error('[rdv/creation] débit des bons KO', deb?.echecs, { rdvId })
      else bilan.bon = true
    } catch (e) {
      console.error('[rdv/creation] débit des bons KO (non bloquant)', e?.message, { rdvId })
    }
  }

  return bilan
}
