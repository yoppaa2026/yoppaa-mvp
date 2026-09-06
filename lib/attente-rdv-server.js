// Liste d'attente des rendez-vous, côté serveur : la base et les notifications.
//
// ⚠️ AUCUNE RÈGLE ICI. Tout ce qui décide (qui est concerné, dans quel ordre,
// jusqu'à quand) vit dans `lib/attente-rdv.js`, qui s'exécute sans base et que
// le banc mesure ligne à ligne. Ce fichier ne fait que charger, appeler la
// règle, et écrire. C'est ce qui empêche la règle d'exister en deux
// exemplaires, dont un seul apprendrait les cours collectifs.
//
// 🔴 TOUT PASSE PAR LA CLÉ DE SERVICE, ET C'EST LA CONCEPTION. Un Yopper n'est
// pas un utilisateur Supabase Auth : la base n'a aucun `auth.uid()` pour
// reconnaître le propriétaire d'une ligne. `rdv_attente` n'a donc AUCUNE
// policy et aucun droit pour `anon` ni `authenticated`. L'identité se prouve
// par le cookie signé, dans la route qui appelle ces fonctions.

import { envoyerPushParExternalId, annulerPush } from '@/lib/onesignal'
import { brusselsInstant, jourBruxelles } from '@/lib/timezone'
import {
  STATUT_EN_ATTENTE, STATUT_PREVENU, STATUT_SERVI,
  lignePourInscription, peutAttendre, plafondDe,
  compterMemeCible, dejaDansLaFile, fileConcernee, chaineDePushs,
  attenteVivante, jourLisible,
} from '@/lib/attente-rdv'

// ⚠️ UNE SEULE LISTE DE COLONNES, NOMMÉE. Le défaut le plus fréquent de ce
// projet est une colonne absente d'un `select` : elle ne lève AUCUNE erreur,
// la valeur vaut `undefined`, et la règle se trompe en silence. Une liste
// unique, c'est un seul endroit à corriger et un seul endroit à mesurer.
export const COLONNES_ATTENTE = `
  id, commercant_id, prestation_id, client_id, portee,
  date_rdv, heure_debut, date_debut, date_fin,
  statut, push_id, prevenu_le, priorite_jusqu, created_at
`

// ─── LECTURE ───────────────────────────────────────────────────────────────

// Toute la file d'une prestation, servis exclus. Le filtrage fin (la portée,
// les bornes de dates, l'ordre) se fait ensuite PAR LE MODULE, jamais par une
// deuxième requête qui réécrirait la règle en SQL.
async function chargerFile(supabase, prestationId) {
  const { data, error } = await supabase
    .from('rdv_attente')
    .select(COLONNES_ATTENTE)
    .eq('prestation_id', prestationId)
    .neq('statut', STATUT_SERVI)
  if (error) {
    console.error('[attente] lecture de la file KO', error.message)
    return null
  }
  return data || []
}

/**
 * Ce que le Yopper attend, tout commerces confondus. Les lignes expirées ne
 * remontent pas : une fenêtre finie le mois dernier n'a rien à dire.
 */
export async function mesAttentes(supabase, clientIds) {
  const ids = (clientIds || []).filter(Boolean)
  if (ids.length === 0) return []
  const { data, error } = await supabase
    .from('rdv_attente')
    .select(`${COLONNES_ATTENTE}, prestation:rdv_prestations(nom), commercant:commercants(nom, slug)`)
    .in('client_id', ids)
    .neq('statut', STATUT_SERVI)
    .order('created_at', { ascending: true })
  if (error) {
    console.error('[attente] mesAttentes KO', error.message)
    return []
  }
  const jour = jourBruxelles()
  return (data || []).filter(l => attenteVivante(l, jour))
}

/**
 * Combien de personnes attendent déjà la même chose, et le Yopper en fait-il
 * partie. Sert à l'écran (« 2 places sur 3 ») comme au refus.
 */
export async function etatDeLaFile(supabase, { prestation, cible, clientId }) {
  const lignes = await chargerFile(supabase, prestation?.id)
  if (lignes === null) return null
  const jour = jourBruxelles()
  return {
    deja: compterMemeCible(lignes, cible, jour),
    plafond: plafondDe(prestation),
    dejaInscrit: dejaDansLaFile(lignes, cible, clientId),
  }
}

// ─── ÉCRITURE ──────────────────────────────────────────────────────────────

/**
 * Inscrit un Yopper dans la file. La portée n'est JAMAIS lue dans la requête :
 * elle se déduit de la capacité de la prestation, relue en base.
 */
export async function inscrire(supabase, { prestationId, clientId, dateRdv, heureDebut, duree }) {
  if (!clientId) return { ok: false, error: 'identite_requise' }

  const { data: prestation, error: errP } = await supabase
    .from('rdv_prestations')
    .select('id, nom, commercant_id, capacite, attente_max, actif, deleted_at')
    .eq('id', prestationId)
    .single()
  if (errP || !prestation) return { ok: false, error: 'prestation_introuvable' }
  if (prestation.actif === false || prestation.deleted_at) {
    return { ok: false, error: 'prestation_inactive' }
  }

  const jour = jourBruxelles()
  const ligne = lignePourInscription({ prestation, jourISO: jour, dateRdv, heureDebut, duree })
  if (!ligne) return { ok: false, error: 'demande_invalide' }

  const etat = await etatDeLaFile(supabase, { prestation, cible: ligne, clientId })
  if (etat === null) return { ok: false, error: 'lecture_ko' }

  const permis = peutAttendre({
    prestation,
    dejaEnAttente: etat.deja,
    dejaInscrit: etat.dejaInscrit,
  })
  if (!permis.ok) return { ok: false, error: permis.raison, ...etat }

  const { data, error } = await supabase
    .from('rdv_attente')
    .insert({ ...ligne, client_id: clientId, statut: STATUT_EN_ATTENTE })
    .select(COLONNES_ATTENTE)
    .single()
  if (error) {
    // ⚠️ L'INDEX D'UNICITÉ EST LE VRAI ARBITRE. Deux clics à la même seconde
    // passent tous les deux le comptage ci-dessus ; c'est la base qui refuse
    // le second, et ce refus-là n'est pas une erreur à montrer.
    if (String(error.code) === '23505') return { ok: false, error: 'deja_inscrit' }
    console.error('[attente] insertion KO', error.message)
    return { ok: false, error: 'insertion_ko' }
  }
  return { ok: true, ligne: data, rang: etat.deja + 1, plafond: etat.plafond }
}

/**
 * Se désinscrire EFFACE la ligne. On ne garde pas une donnée personnelle pour
 * le plaisir d'un statut, et un push trois jours après qu'on a trouvé ailleurs
 * est du spam.
 */
export async function retirer(supabase, { id, clientIds }) {
  const ids = (clientIds || []).filter(Boolean)
  if (!id || ids.length === 0) return { ok: false, error: 'identite_requise' }

  // ⚠️ LE `in('client_id')` EST LA GARDE D'AUTORISATION. Sans lui, un
  // identifiant de ligne suffirait à sortir n'importe qui de n'importe quelle
  // file : la table n'a pas de RLS pour rattraper le coup, c'est ici que ça se
  // joue. On relit la ligne pour annuler son push avant de l'effacer.
  const { data: ligne } = await supabase
    .from('rdv_attente')
    .select('id, push_id')
    .eq('id', id)
    .in('client_id', ids)
    .maybeSingle()
  if (!ligne) return { ok: false, error: 'introuvable' }

  if (ligne.push_id) {
    const res = await annulerPush(ligne.push_id)
    if (!res?.ok) console.warn('[attente] annulation du push programmé KO', res?.error)
  }

  const { error } = await supabase.from('rdv_attente').delete().eq('id', id).in('client_id', ids)
  if (error) {
    console.error('[attente] suppression KO', error.message)
    return { ok: false, error: 'suppression_ko' }
  }
  return { ok: true }
}

// ─── LE DÉSISTEMENT ────────────────────────────────────────────────────────

/**
 * Une place vient de se libérer : prévenir la file, dans l'ordre d'arrivée.
 *
 * 🔴 APPELÉ PAR L'ANNULATION DU CLIENT, ET PAR UN BOUTON POUR CELLE DU
 * COMMERÇANT (décision d'Alex, 06/09). Quand le client annule, la place est
 * vraiment libre. Quand le commerçant annule, c'est très souvent parce qu'il
 * n'est pas là : pousser enverrait quelqu'un vers un créneau qu'il
 * n'honorera pas. Lui seul sait pourquoi il annule.
 */
export async function prevenirLaFile(supabase, { prestationId, dateRdv, heureDebut }) {
  try {
    if (!prestationId || !dateRdv || !heureDebut) {
      return { ok: false, error: 'place_incomplete', prevenus: 0, file: 0 }
    }

    const { data: prestation, error: errP } = await supabase
      .from('rdv_prestations')
      .select('id, nom, commercant_id, commercant:commercants(nom, slug)')
      .eq('id', prestationId)
      .single()
    if (errP || !prestation) return { ok: false, error: 'prestation_introuvable', prevenus: 0, file: 0 }

    const lignes = await chargerFile(supabase, prestationId)
    if (lignes === null) return { ok: false, error: 'lecture_ko', prevenus: 0, file: 0 }

    const jour = jourBruxelles()
    const place = { prestation_id: prestationId, date_rdv: dateRdv, heure_debut: heureDebut }
    const file = fileConcernee(lignes.filter(l => attenteVivante(l, jour)), place)
    if (file.length === 0) return { ok: true, prevenus: 0, file: 0 }

    // 🔴 ON NE PROGRAMME RIEN APRÈS LE DÉBUT DU CRÉNEAU. Un push qui arrive
    // pendant la séance, pour une place qui n'existe plus, apprend au Yopper à
    // ignorer les suivants.
    const debut = brusselsInstant(dateRdv, heureDebut)
    const debutMs = debut && !isNaN(debut.getTime()) ? debut.getTime() : null
    const chaine = chaineDePushs(file, { maintenantMs: Date.now(), debutMs })

    const nomCommerce = prestation.commercant?.nom || 'ton commerçant'
    const slug = prestation.commercant?.slug || ''
    const heure = String(heureDebut).slice(0, 5)

    let prevenus = 0
    for (const etape of chaine) {
      const ligne = file.find(l => l.id === etape.id)
      if (!ligne?.client_id) continue

      const res = await envoyerPushParExternalId(ligne.client_id, {
        headings: 'Une place s’est libérée',
        // ⚠️ « TU ES PRÉVENU AVANT LES AUTRES », JAMAIS « TA PLACE EST GARDÉE »
        // (arbitrage d'Alex, 06/09). Le créneau reste réservable par n'importe
        // qui pendant la fenêtre de priorité : promettre une place tenue serait
        // promettre ce que le code ne tient pas.
        contents: `${prestation.nom || 'Un créneau'} chez ${nomCommerce}, le ${jourLisible(dateRdv)} à ${heure}. Tu es prévenu avant les autres.`,
        url: slug ? `/commander/rdv/${slug}` : '/commander',
        data: { kind: 'attente_place', prestation_id: prestationId, date_rdv: dateRdv, heure_debut: heure },
        send_after: etape.sendAfter || undefined,
      })
      if (!res?.ok) {
        console.warn('[attente] push KO', { attente: etape.id, erreur: res?.error })
        continue
      }
      prevenus++

      const { error: errU } = await supabase
        .from('rdv_attente')
        .update({
          statut: STATUT_PREVENU,
          // ⚠️ ON NE GARDE L'IDENTIFIANT QUE DES PUSHS PROGRAMMÉS : eux seuls
          // s'annulent. Celui du premier est déjà parti.
          push_id: etape.sendAfter ? (res.id || null) : null,
          prevenu_le: new Date(etape.envoiMs).toISOString(),
          priorite_jusqu: etape.prioriteJusqu,
        })
        .eq('id', etape.id)
      if (errU) console.error('[attente] marquage prevenu KO', errU.message)
    }

    return { ok: true, prevenus, file: file.length }
  } catch (e) {
    console.error('[attente] prevenirLaFile', e?.message || e)
    return { ok: false, error: e?.message || String(e), prevenus: 0, file: 0 }
  }
}

/**
 * La place a été prise : on sort celui qui l'a eue, et on annule les
 * notifications encore programmées pour ce créneau. Les autres RESTENT dans la
 * file : une deuxième place peut se libérer, et les sortir ferait de la file
 * une liste à usage unique.
 */
export async function placePrise(supabase, { prestationId, dateRdv, heureDebut, clientId }) {
  try {
    if (!prestationId || !dateRdv || !heureDebut) return { ok: true, servis: 0, annules: 0 }

    const lignes = await chargerFile(supabase, prestationId)
    if (lignes === null) return { ok: false, error: 'lecture_ko', servis: 0, annules: 0 }

    const place = { prestation_id: prestationId, date_rdv: dateRdv, heure_debut: heureDebut }
    const concernees = fileConcernee(lignes, place)

    let servis = 0, annules = 0
    for (const ligne of concernees) {
      const estLui = clientId && String(ligne.client_id) === String(clientId)

      if (ligne.push_id) {
        const res = await annulerPush(ligne.push_id)
        if (res?.ok) annules++
        else console.warn('[attente] annulation push KO', res?.error)
      }

      const { error } = await supabase
        .from('rdv_attente')
        .update(estLui
          ? { statut: STATUT_SERVI, push_id: null, priorite_jusqu: null }
          // Les autres retournent simplement en file, sans notification en
          // attente : la place qu'on leur avait annoncée n'existe plus.
          : { statut: STATUT_EN_ATTENTE, push_id: null, priorite_jusqu: null })
        .eq('id', ligne.id)
      if (error) console.error('[attente] mise a jour apres reservation KO', error.message)
      else if (estLui) servis++
    }

    return { ok: true, servis, annules }
  } catch (e) {
    console.error('[attente] placePrise', e?.message || e)
    return { ok: false, error: e?.message || String(e), servis: 0, annules: 0 }
  }
}
