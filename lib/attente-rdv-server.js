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
import { brusselsInstant, jourBruxelles, creneauDejaCommence } from '@/lib/timezone'
import { normaliserEmail } from '@/lib/email-normalise'
import { horizonRdv } from '@/lib/rdv-slots'
import { fichePubliee } from '@/lib/statut-commercant'
import { relectureAutorisee } from '@/lib/relecture-serveur'
import { chezLeCommerce } from '@/lib/nom-commerce'
import { fermetureQuiBloque } from '@/lib/fermetures-rdv'
import {
  STATUT_EN_ATTENTE, STATUT_PREVENU, STATUT_SERVI, PORTEE_SEANCE, PORTEE_FENETRE,
  lignePourInscription, peutAttendre, plafondDe, jourPlus, attenteOuverte, porteeDe,
  compterMemeCible, dejaDansLaFile, fileConcernee, chaineDePushs, dejaPrevenueEnCours, compterAttentes, fileDeLaSeance,
  attenteVivante, jourLisible, attentesFermeesPar,
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
    dejaInscrit: dejaDansLaFile(lignes, cible, clientId, jour),
  }
}

// ─── ÉCRITURE ──────────────────────────────────────────────────────────────

/**
 * Inscrit un Yopper dans la file. La portée n'est JAMAIS lue dans la requête :
 * elle se déduit de la capacité de la prestation, relue en base.
 */
export async function inscrire(supabase, { prestationId, clientId, authUserId = null, email = null, dateRdv, heureDebut, duree }) {
  if (!clientId) return { ok: false, error: 'identite_requise' }

  const { data: prestation, error: errP } = await supabase
    .from('rdv_prestations')
    .select('id, nom, commercant_id, capacite, attente_max, actif, deleted_at, par_couverts')
    .eq('id', prestationId)
    .single()
  if (errP || !prestation) return { ok: false, error: 'prestation_introuvable' }
  if (prestation.actif === false || prestation.deleted_at) {
    return { ok: false, error: 'prestation_inactive' }
  }

  // ⚠️ ET LA FICHE DU COMMERÇANT, QUI N'ÉTAIT PAS REGARDÉE (16/09).
  // Une file d'attente chez un commerce non publié ne bloque rien et ne facture
  // rien : ce n'est pas pour ça qu'on la ferme. C'est pour la SUITE. Le jour où
  // une place se libère, ce module envoie « une place s'est libérée chez X » et
  // le Yopper arrive sur une page qui n'existe pour personne. On ne met pas
  // quelqu'un dans une file qui ne mène nulle part.
  //
  // ⚠️ UNE LECTURE QUI ÉCHOUE N'EST PAS UNE FICHE FERMÉE : sans ce test, un
  // incident réseau refuserait l'inscription en annonçant un commerce fermé.
  const { data: commerce, error: errC } = await supabase
    .from('commercants')
    .select('id, statut_publication, rdv_horizon_jours')
    .eq('id', prestation.commercant_id)
    .maybeSingle()
  if (errC) return { ok: false, error: 'lecture_ko' }
  // ⚠️ Sauf une fiche réservée à la vérification, pour un compte de la liste
  // (relecteurs des stores) : voir `lib/relecture-serveur.js`.
  if (!fichePubliee(commerce) && !(await relectureAutorisee(supabase, commerce, async () => authUserId))) return { ok: false, error: 'commerce_ferme' }

  // ⚠️ UNE FILE FERMÉE SE DIT AVANT LA DEMANDE (LA-10, 03/10) : une table n'a ni
  // séance ni fenêtre valable, et répondait « cette demande n'est pas valable ».
  // Après la fiche : un commerce fermé reste la première nouvelle.
  if (!attenteOuverte(prestation)) return { ok: false, error: 'fermee' }

  const jour = jourBruxelles()
  const ligne = lignePourInscription({ prestation, jourISO: jour, dateRdv, heureDebut, duree })
  if (!ligne) return { ok: false, error: 'demande_invalide' }

  if (ligne.portee === PORTEE_SEANCE) {
    const verdict = await seanceAttendable(supabase, { prestation, commerce, ligne, clientId, email })
    if (!verdict.ok) return { ok: false, error: verdict.raison }
  }

  // 🔴 UNE FENÊTRE EXPIRÉE NE VERROUILLE PLUS À VIE (LA-08, 03/10). L'index
  // d'unicité garde UNE fenêtre par personne et par prestation tant qu'elle
  // n'est pas servie, expirée comprise : « les 7 prochains jours » passés sans
  // désistement refusaient toute nouvelle inscription, pour toujours, et son
  // espace ne montrait même plus l'ancienne. On efface l'expirée de CETTE
  // personne sur CETTE prestation : elle repart en fin de file, comme toute
  // nouvelle demande.
  // ⚠️ UNE PURGE EN ÉCHEC REFUSE : l'index refuserait l'insertion juste après.
  if (ligne.portee === PORTEE_FENETRE) {
    const { error: errPurge } = await supabase
      .from('rdv_attente')
      .delete()
      .eq('client_id', clientId)
      .eq('prestation_id', prestation.id)
      .eq('portee', PORTEE_FENETRE)
      .neq('statut', STATUT_SERVI)
      .lt('date_fin', jour)
    if (errPurge) return { ok: false, error: 'lecture_ko' }
  }

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
 * 🔴 LA SÉANCE ATTENDUE EST RELUE AVANT D'INSCRIRE (LA-05, 03/10). Rien ne
 * vérifiait qu'elle existe à cette heure, qu'elle est complète, qu'elle n'a pas
 * commencé, qu'elle est dans l'horizon de la fiche, ni que la personne n'y a pas
 * déjà sa place. On pouvait attendre un cours qui n'a pas lieu, ou le sien.
 *
 * ⚠️ « EXISTE ET COMPLÈTE » SE JUGE AVEC LES RÈGLES DE LA RÉSERVATION, sans
 * écrire : plage, liaisons, fermetures, places. Une deuxième copie de ces
 * règles finirait par dire autre chose que la première. L'import est
 * DYNAMIQUE parce que le module de création importe déjà celui-ci.
 *
 * Rend { ok: true } ou { ok: false, raison }.
 */
export async function seanceAttendable(supabase, { prestation, commerce, ligne, clientId, email = null, maintenant = Date.now() }) {
  const dateRdv = ligne?.date_rdv
  const heure = String(ligne?.heure_debut || '').slice(0, 5)
  if (creneauDejaCommence(dateRdv, heure, maintenant)) return { ok: false, raison: 'seance_passee' }
  const limite = jourPlus(jourBruxelles(new Date(maintenant)), horizonRdv(commerce))
  if (limite && dateRdv > limite) return { ok: false, raison: 'demande_invalide' }

  // ⚠️ PAR LA FICHE ET PAR L'ADRESSE : une séance prise sur un abonnement ou
  // après un acompte ne porte pas toujours `client_id`.
  const { data: inscrits, error } = await supabase
    .from('rdv_reservations')
    .select('client_id, client_email')
    .eq('prestation_id', prestation.id)
    .eq('date_rdv', dateRdv)
    .eq('heure_debut', heure)
    .in('statut', ['confirme', 'honore'])
    .is('deleted_at', null)
  if (error) return { ok: false, raison: 'lecture_ko' }
  const adresse = normaliserEmail(email)
  const dejaLa = (inscrits || []).some(r => (clientId && String(r.client_id) === String(clientId))
    || (adresse && normaliserEmail(r.client_email) === adresse))
  if (dejaLa) return { ok: false, raison: 'deja_reserve' }

  // Une table se juge avec son nombre de personnes, que la file ne connaît pas
  // (LA-10, lot suivant) : seul un COURS se rejoue ici.
  if (prestation.par_couverts === true) return { ok: true }
  const { creerReservationRdv } = await import('./rdv-creation-server')
  const essai = await creerReservationRdv(supabase, {
    commercantId: prestation.commercant_id, prestationId: prestation.id,
    dateRdv, heureDebut: heure, champs: {}, simulation: true,
  })
  if (essai.ok) return { ok: false, raison: 'places_libres' }
  if (essai.code === 'place_prise') return { ok: true }
  if (essai.code === 'ecriture_impossible') return { ok: false, raison: 'lecture_ko' }
  return { ok: false, raison: 'seance_introuvable' }
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
 * 🔴 APPELÉ PAR L'ANNULATION DU CLIENT (06/09), PAR CELLE D'UNE PLACE DE COURS
 * PAR LE COMMERCE ET PAR LA RÉSILIATION D'UN ABONNEMENT (Alex, 04/10 : « c'est
 * une place de libre »), et par un bouton. Un rendez-vous INDIVIDUEL annulé par
 * le commerce ne prévient pas : il annule souvent parce qu'il ne sera pas là.
 * Un cours ENTIER annulé non plus : aucune place ne se libère.
 */
export async function prevenirLaFile(supabase, { prestationId, dateRdv, heureDebut }) {
  try {
    if (!prestationId || !dateRdv || !heureDebut) {
      return { ok: false, error: 'place_incomplete', prevenus: 0, file: 0 }
    }

    const { data: prestation, error: errP } = await supabase
      .from('rdv_prestations')
      .select('id, nom, commercant_id, actif, deleted_at, commercant:commercants(nom, slug, statut_publication)')
      .eq('id', prestationId)
      .single()
    if (errP || !prestation) return { ok: false, error: 'prestation_introuvable', prevenus: 0, file: 0 }

    // 🔴 UN COURS RETIRÉ OU UN JOUR FERMÉ NE SE PROPOSE PAS (LA-07, 03/10).
    // Rien ne le vérifiait : une annulation sur un cours que la commerçante
    // venait de désactiver, ou pendant ses congés, envoyait « une place s'est
    // libérée » vers une séance que personne ne pouvait réserver. Ce n'est pas
    // une panne : rien à signaler, personne à prévenir.
    if (prestation.actif === false || prestation.deleted_at) return { ok: true, prevenus: 0, file: 0, raison: 'prestation_retiree' }
    const { data: fermetures, error: errF } = await supabase
      .from('rdv_fermetures')
      // ⚠️ ET LA SÉANCE FERMÉE (04/10) : un cours annulé ne libère aucune place.
      .select('date_debut, date_fin, praticien_id, prestation_id, heure_debut')
      .eq('commercant_id', prestation.commercant_id)
      .is('deleted_at', null)
    if (errF) return { ok: false, error: 'lecture_ko', prevenus: 0, file: 0 }
    if (fermetureQuiBloque(fermetures, { dateStr: dateRdv, praticienId: null, prestationId, heure: heureDebut })) return { ok: true, prevenus: 0, file: 0, raison: 'jour_ferme' }

    // 🔴 LA FICHE EST RELUE AU MOMENT DE PRÉVENIR (relevé du 03/10). Elle
    // n'était contrôlée qu'à l'inscription : un commerce dépublié entre-temps
    // aurait envoyé « une place s'est libérée chez X » vers une page qui
    // n'existe plus pour personne.
    // ⚠️ `fichePubliee` STRICTE, comme tout envoi : une fiche réservée à la
    // vérification ne prévient personne. Ce n'est pas une panne, la route qui
    // appelle n'a donc rien à signaler.
    if (!fichePubliee(prestation.commercant)) return { ok: true, prevenus: 0, file: 0, raison: 'commerce_ferme' }

    const lignes = await chargerFile(supabase, prestationId)
    if (lignes === null) return { ok: false, error: 'lecture_ko', prevenus: 0, file: 0 }

    const jour = jourBruxelles()
    const place = { prestation_id: prestationId, date_rdv: dateRdv, heure_debut: heureDebut }
    // 🔴 UNE CHAÎNE EN COURS N'EST PAS RELANCÉE (LA-03, 03/10). Une deuxième
    // annulation, ou le bouton de la commerçante pressé deux fois, repartait de
    // zéro : chacun recevait un second push, et les anciens identifiants de
    // pushs programmés étaient écrasés, donc plus annulables. Une personne déjà
    // prévenue dont la priorité court encore n'est pas reprévenue.
    const maintenantMs = Date.now()
    const file = fileConcernee(lignes.filter(l => attenteVivante(l, jour)), place)
      .filter(l => !dejaPrevenueEnCours(l, maintenantMs))
    if (file.length === 0) return { ok: true, prevenus: 0, file: 0 }

    // 🔴 ON NE PROGRAMME RIEN APRÈS LE DÉBUT DU CRÉNEAU. Un push qui arrive
    // pendant la séance, pour une place qui n'existe plus, apprend au Yopper à
    // ignorer les suivants.
    const debut = brusselsInstant(dateRdv, heureDebut)
    const debutMs = debut && !isNaN(debut.getTime()) ? debut.getTime() : null
    const chaine = chaineDePushs(file, { maintenantMs, debutMs })

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
        contents: `${prestation.nom || 'Un créneau'} ${chezLeCommerce(nomCommerce)}, le ${jourLisible(dateRdv)} à ${heure}. Tu es prévenu avant les autres.`,
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
 * 🔴 QUI ATTEND CETTE SÉANCE : prénom et téléphone, dans l'ordre (Alex, 04/10).
 * Seulement sur demande de la commerçante, pour UNE séance : on ne charge pas
 * les contacts de toute la file pour afficher un nombre.
 * ⚠️ RIEN D'AUTRE NE SORT : ni l'adresse email, ni le nom de famille. La
 * personne en est prévenue à l'inscription (`BlocAttente`).
 * Rend { ok, personnes } ou { ok: false, error }.
 */
export async function personnesDeLaSeance(supabase, { prestationId, dateRdv, heureDebut }) {
  const heure = String(heureDebut || '').slice(0, 5)
  if (!prestationId || !dateRdv || heure.length !== 5) return { ok: false, error: 'demande_invalide' }
  const lignes = await chargerFile(supabase, prestationId)
  if (lignes === null) return { ok: false, error: 'lecture_ko' }
  const file = fileDeLaSeance(lignes, { prestationId, dateRdv, heure }, jourBruxelles())
  if (file.length === 0) return { ok: true, personnes: [] }
  const ids = [...new Set(file.map(l => l.client_id).filter(Boolean))]
  const { data: fiches, error } = await supabase
    .from('clients')
    .select('id, prenom, telephone')
    .in('id', ids)
  if (error) return { ok: false, error: 'lecture_ko' }
  const parId = new Map((fiches || []).map(f => [String(f.id), f]))
  return {
    ok: true,
    personnes: file.map((l, i) => {
      const fiche = parId.get(String(l.client_id)) || {}
      return {
        rang: i + 1,
        prenom: fiche.prenom || null,
        telephone: fiche.telephone || null,
        prevenu: l.statut === STATUT_PREVENU,
      }
    }),
  }
}

/**
 * Ce que la commerçante voit de sa file : des nombres par séance et par
 * prestation (voir `compterAttentes`). `null` si la lecture échoue : l'agenda
 * n'affiche alors rien plutôt que « personne n'attend ».
 */
export async function attentesDuCommerce(supabase, commercantId) {
  if (!commercantId) return null
  const { data, error } = await supabase
    .from('rdv_attente')
    .select('prestation_id, portee, date_rdv, heure_debut, date_debut, date_fin, statut')
    .eq('commercant_id', commercantId)
    .neq('statut', STATUT_SERVI)
  if (error) {
    console.error('[attente] attentesDuCommerce KO', error.message)
    return null
  }
  return compterAttentes(data || [], jourBruxelles())
}

/**
 * 🔴 LA COMMERÇANTE PRÉVIENT LA FILE D'UN BOUTON. Depuis le 04/10, la place de
 * cours qu'elle libère prévient déjà seule : le bouton reste pour une place
 * ouverte autrement (capacité augmentée, prévenus qui n'ont pas répondu).
 *
 * ⚠️ ON VÉRIFIE QU'IL Y A BIEN UNE PLACE, sur un cours qui n'a pas commencé :
 * sinon « une place s'est libérée » partirait vers un cours complet, ou passé.
 * ⚠️ SEULEMENT UN COURS : un rendez-vous individuel libéré par le client
 * prévient déjà sa file tout seul, et une table n'a pas de file.
 */
export async function prevenirSurDemande(supabase, { prestationId, dateRdv, heureDebut, maintenant = Date.now() }) {
  const heure = String(heureDebut || '').slice(0, 5)
  if (!prestationId || !dateRdv || heure.length !== 5) return { ok: false, error: 'demande_invalide' }
  if (creneauDejaCommence(dateRdv, heure, maintenant)) return { ok: false, error: 'seance_passee' }
  const { data: prestation, error: errP } = await supabase
    .from('rdv_prestations')
    .select('id, capacite, par_couverts')
    .eq('id', prestationId)
    .maybeSingle()
  if (errP || !prestation) return { ok: false, error: 'prestation_introuvable' }
  if (prestation.par_couverts === true || porteeDe(prestation) !== PORTEE_SEANCE) return { ok: false, error: 'pas_un_cours' }
  const { data: inscrits, error: errI } = await supabase
    .from('rdv_reservations')
    .select('id, statut')
    .eq('prestation_id', prestationId)
    .eq('date_rdv', dateRdv)
    .eq('heure_debut', heure)
    .in('statut', ['confirme', 'honore'])
    .is('deleted_at', null)
  if (errI) return { ok: false, error: 'lecture_ko' }
  if ((inscrits || []).length >= Number(prestation.capacite)) return { ok: false, error: 'complet' }
  return prevenirLaFile(supabase, { prestationId, dateRdv, heureDebut: heure })
}

/**
 * Un cours prend des places : chaque séance À VENIR où quelqu'un attend est
 * prévenue (Audit 1 I7, 04/10). La règle d'Alex du 04/10, « c'est une place de
 * libre », vaut aussi pour une place AJOUTÉE : passer un cours de 8 à 12 places
 * laissait les personnes en file attendre une place qui existait déjà.
 * ⚠️ `prevenirSurDemande` revérifie, séance par séance, qu'une place est
 * vraiment libre : une séance encore complète ne prévient personne.
 */
export async function prevenirLesSeancesDuCours(supabase, prestationId, { maintenant = Date.now() } = {}) {
  if (!prestationId) return { ok: false, error: 'demande_invalide', prevenus: 0, seances: 0 }
  const lignes = await chargerFile(supabase, prestationId)
  if (lignes === null) return { ok: false, error: 'lecture_ko', prevenus: 0, seances: 0 }
  const auj = jourBruxelles()
  const seances = new Map()
  for (const l of lignes) {
    if (l.portee !== PORTEE_SEANCE || String(l.date_rdv || '') < auj) continue
    const heure = String(l.heure_debut || '').slice(0, 5)
    if (heure.length !== 5) continue
    seances.set(`${l.date_rdv}|${heure}`, { dateRdv: l.date_rdv, heureDebut: heure })
  }
  let prevenus = 0
  for (const s of seances.values()) {
    const r = await prevenirSurDemande(supabase, { prestationId, ...s, maintenant })
    if (r?.ok) prevenus += Number(r.prevenus) || 0
  }
  return { ok: true, prevenus, seances: seances.size }
}

/**
 * La place a été prise : on sort celui qui l'a eue, et on annule les
 * notifications encore programmées pour ce créneau. Les autres RESTENT dans la
 * file : une deuxième place peut se libérer, et les sortir ferait de la file
 * une liste à usage unique.
 */
export async function placePrise(supabase, { prestationId, dateRdv, heureDebut, clientId, clientEmail = null }) {
  try {
    if (!prestationId || !dateRdv || !heureDebut) return { ok: true, servis: 0, annules: 0 }

    const lignes = await chargerFile(supabase, prestationId)
    if (lignes === null) return { ok: false, error: 'lecture_ko', servis: 0, annules: 0 }

    const place = { prestation_id: prestationId, date_rdv: dateRdv, heure_debut: heureDebut }
    const concernees = fileConcernee(lignes, place)

    // 🔴 LA PERSONNE SERVIE N'ÉTAIT RECONNUE QUE PAR UN SEUL CHEMIN (LA-01,
    // 03/10). Seule la réservation gratuite passait `client_id` : une séance
    // prise sur un abonnement, après un acompte ou avec une empreinte arrivait
    // sans lui. La personne servie restait dans la file, reprenait une place au
    // rang suivant, et recevait un push pour son propre cours. On la retrouve
    // par son adresse, comme `identiteYopper`, et SEULEMENT si quelqu'un
    // attend : dans le cas courant, où la file est vide, ça ne coûte rien.
    let qui = clientId || null
    if (!qui && clientEmail && concernees.length > 0) {
      const { data: fiche } = await supabase
        .from('clients').select('id')
        .eq('email', normaliserEmail(clientEmail))
        .maybeSingle()
      qui = fiche?.id || null
    }

    let servis = 0, annules = 0
    for (const ligne of concernees) {
      const estLui = qui && String(ligne.client_id) === String(qui)

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

// ─── UNE FERMETURE VIDE LES FILES QU'ELLE REND SANS OBJET (04/10) ───────────
//
// 🔴 UN COURS ANNULÉ GARDAIT SA LISTE D'ATTENTE JUSQU'À LA DATE, et une chaîne
// de notifications déjà programmée partait quand même. Les lignes visées (la
// règle vit dans `attentesFermeesPar`) perdent leur notification programmée,
// la personne apprend que la séance n'aura pas lieu, et la ligne disparaît :
// une attente n'est pas un contrat, elle n'a pas à survivre à sa séance.
// ⚠️ AU MIEUX POUR LES NOTIFICATIONS : une personne injoignable n'empêche pas
// de vider la file.
export async function fermerLesFiles(supabase, fermeture, { prevenir = true } = {}) {
  try {
    if (!fermeture?.commercant_id) return { ok: true, retires: 0, prevenus: 0 }
    const { data, error } = await supabase
      .from('rdv_attente').select(COLONNES_ATTENTE)
      .eq('commercant_id', fermeture.commercant_id)
      .neq('statut', STATUT_SERVI)
    if (error) return { ok: false, error: 'lecture_ko', retires: 0, prevenus: 0 }
    const visees = attentesFermeesPar(data || [], fermeture)
    if (visees.length === 0) return { ok: true, retires: 0, prevenus: 0 }

    const idsPrestations = [...new Set(visees.map(l => l.prestation_id).filter(Boolean))]
    const [{ data: prestations }, { data: commerce }] = await Promise.all([
      supabase.from('rdv_prestations').select('id, nom').in('id', idsPrestations),
      supabase.from('commercants').select('nom, slug').eq('id', fermeture.commercant_id).maybeSingle(),
    ])

    let prevenus = 0
    for (const l of visees) {
      if (l.push_id) {
        const r = await annulerPush(l.push_id)
        if (!r?.ok) console.warn('[attente] notification programmée non annulée', l.id, r?.error)
      }
      if (!prevenir || !l.client_id) continue
      const nom = (prestations || []).find(p => String(p.id) === String(l.prestation_id))?.nom || 'Ta séance'
      // ⚠️ AUCUN ACCORD : « séance » porte le genre, le nom du cours non.
      const envoi = await envoyerPushParExternalId(l.client_id, {
        headings: `${nom} : séance annulée`,
        contents: `La séance du ${jourLisible(l.date_rdv)} à ${String(l.heure_debut || '').slice(0, 5)} ${chezLeCommerce(commerce?.nom)} n’aura pas lieu. Tu n’es plus sur sa liste d’attente.`,
        url: commerce?.slug ? `/commander/rdv/${commerce.slug}` : '/commander',
        data: { kind: 'attente_seance_annulee', prestation_id: l.prestation_id },
      })
      if (envoi?.ok) prevenus++
    }

    const { error: errD } = await supabase.from('rdv_attente').delete().in('id', visees.map(l => l.id))
    if (errD) return { ok: false, error: 'suppression_ko', retires: 0, prevenus }
    return { ok: true, retires: visees.length, prevenus }
  } catch (e) {
    return { ok: false, error: e?.message || String(e), retires: 0, prevenus: 0 }
  }
}
