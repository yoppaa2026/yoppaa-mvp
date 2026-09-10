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

import { capacitePrestation, premierePlaceLibre, rangLibre, estParCouverts, couvertsValides, occupationDe, dureeSelonCouverts, estCoursCollectif } from './cours-collectifs'
import { enModeInventaire, formatLibrePour, dureeDuGroupe, estJointure } from './inventaire-salle'
import { champsLieuPour } from './lieu-fige'
import { debiterBons } from './bons-cadeaux-server'
import { consommerRecompense } from './fidelite-recompense-server'
import { placePrise } from './attente-rdv-server'
import { prestationAutoriseeSurCreneaux, praticienAutorisePourPrestation, jourSemaineDate, timeToMinutes, minutesToTime } from './rdv-slots'

// Les statuts qui OCCUPENT une place. Un rendez-vous annulé libère la sienne.
const STATUTS_OCCUPENT = ['confirme', 'honore']

// Les colonnes dont le lieu gravé a besoin. Nommées ici, à côté de leur seul
// usage, pour qu'un ajout ne s'oublie pas dans trois `select` différents.
const COLONNES_LIEU = 'id, nom, adresse, latitude, longitude, siege_social_est_lieu_activite'

// 🔴 LES COLONNES D'UNE PRESTATION QUI DÉCIDE, NOMMÉES UNE SEULE FOIS (09/09).
//
// Alex, sur un rendez-vous fraîchement posé : « y a un problème sur le temps
// bloqué, 60 min alors que la table est sur 90 ».
//
// En mode inventaire, le serveur CHOISIT la table : `prestationRetenue` n'est
// plus celle qu'on a chargée au début, c'est une ligne venue de la liste des
// formats. J'avais écrit pour cette liste un select minimal — id, nom, bornes,
// quantité — en croyant qu'elle ne servait qu'à compter. Elle sert à DÉCIDER, et
// quatre colonnes manquaient à l'appel :
//   • `duree_minutes` : `dureeSelonCouverts` retombait sur son défaut, 60
//     minutes, et la table de 90 se libérait une demi-heure trop tôt ;
//   • `duree_paliers` : les grandes tablées perdaient leur temps supplémentaire ;
//   • `tva_taux` : le rendez-vous naissait sans taux, donc faux en comptabilité ;
//   • `capacite` : la capacité gravée et le rang de place étaient calculés sur
//     un objet qui n'en portait pas.
//
// ⚠️ DEUX SELECTS POUR LA MÊME CHOSE FINISSENT TOUJOURS PAR DIVERGER. La liste
// vit ici, les deux requêtes la lisent, et une garde vérifie qu'aucune ne
// s'écarte. C'est la huitième fois que la colonne absente d'un select frappe ce
// projet, et la première où je l'ai introduite moi-même en resserrant une
// requête « qui ne sert qu'à compter ».
//
// 🔴 `jointure_de` ET `jointure_tables` (lot 3, 11/09) : sans elles, une
// réservation posée sur deux tables de quatre jointes ne compterait que pour
// elle-même, et ses deux tables paraîtraient libres. La jointure serait aussi
// proposée comme une table de plus. Le serveur vendrait la même table deux fois.
const COLONNES_PRESTATION_DECIDE =
  'id, nom, capacite, tva_taux, duree_minutes, commercant_id, par_couverts, couverts_min, couverts_max, duree_paliers, quantite, actif, jointure_de, jointure_tables'

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
 * 'prestation_hors_creneau', 'praticien_hors_commerce',
 * 'praticien_hors_prestation', 'place_prise', 'ecriture_impossible'.
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
    // 🔴 LA JAUGE DE LA SALLE NE S'EST JAMAIS EXÉCUTÉE (trouvé le 09/09 au soir,
    // en branchant les durées). Tout le bloc des couverts, cent trente lignes
    // plus bas, est gardé par `estParCouverts(prestation)` — et `par_couverts`
    // ne figurait pas dans ce select. `prestation.par_couverts` valait donc
    // `undefined`, la garde rendait faux, et deux choses en découlaient :
    //   • chaque réservation de table s'écrivait à UN couvert, quelle que soit
    //     la table, donc l'agenda du restaurateur mentait sur sa propre salle ;
    //   • le contrôle de capacité ne tournait pas, et une requête forgée pouvait
    //     poser cinquante couverts dans une salle de vingt.
    // Le module livré ce matin était neutralisé par une liste de colonnes.
    //
    // ⚠️ C'EST LE MOTIF DE LA COLONNE ABSENTE D'UN SELECT, la septième fois sur
    // ce projet, et le premier cas où il désarme une garde de sécurité au lieu
    // de vider un affichage. Supabase ne dit rien : la colonne manquante n'est
    // pas une erreur, c'est un `undefined`.
    .select(COLONNES_PRESTATION_DECIDE)
    .eq('id', prestationId)
    .maybeSingle()
  if (!prestation) return { ok: false, code: 'prestation_introuvable' }
  if (String(prestation.commercant_id) !== String(commercantId)) {
    return { ok: false, code: 'prestation_hors_commerce' }
  }

  // ─── COMBIEN ILS SONT, ET COMBIEN DE TEMPS ILS RESTENT (10/09) ────────────
  //
  // 🔴 DÉCIDÉ UNE FOIS, AVANT TOUS LES CONTRÔLES, ET ÉCRIT TEL QUEL. Le contrôle
  // du créneau, la jauge de la salle et l'écriture lisaient chacun leur durée :
  // la table demandée pour les deux premiers, la table retenue pour le dernier.
  // Dès que le serveur montait d'un format, un couple était contrôlé sur
  // quatre-vingt-dix minutes et enregistré sur cent vingt, sur une fenêtre que
  // personne n'avait regardée. Vérifier une valeur puis en écrire une autre,
  // c'est ne rien vérifier du tout.
  //
  // 🔴 LA DURÉE EST CELLE DU GROUPE, PAS CELLE DE LA TABLE. Un couple installé
  // sur une table de quatre, parce que les tables de deux sont prises, mange en
  // quatre-vingt-dix minutes, pas en deux heures. C'est ce que font OpenTable
  // et Zenchef, qui règlent la durée d'un repas par taille de groupe ; c'est
  // surtout ce que la fiche a ANNONCÉ au client, qui calcule la sienne sur ce
  // même format de référence.
  //
  // ⚠️ LE SERVEUR CHOISIT SA RÉFÉRENCE LUI-MÊME, dans la salle, et ne la reçoit
  // pas : un format désigné par une requête forgée ne décide pas de la durée.
  let couvertsRetenus = 1
  let formatsTable = null
  let dureeRetenue = dureeSelonCouverts(prestation, couvertsRetenus)
  if (estParCouverts(prestation)) {
    couvertsRetenus = couvertsValides(prestation, champs?.couverts)
    if (couvertsRetenus === null) return { ok: false, code: 'couverts_invalides' }

    // 🔴 UNE SALLE EST UNE SALLE, PAS UNE PAR FORMAT DE TABLE (09/09 au soir).
    // Tous les formats de table du commerce, lus avec les colonnes qui décident.
    const { data: formats } = await db
      .from('rdv_prestations')
      .select(COLONNES_PRESTATION_DECIDE)
      .eq('commercant_id', commercantId)
      .eq('par_couverts', true)
      .is('deleted_at', null)
    formatsTable = formats || []
    // ⚠️ UNE JOINTURE N'EXISTE QUE DANS UNE SALLE INVENTORIÉE (lot 3). En
    // couverts, rien ne dit quelles tables sont libres, et la jauge se
    // mesurerait sur la capacité de la jointure au lieu de celle de la salle. La
    // fiche ne la propose jamais dans ce cas : seule une requête écrite à la main
    // l'enverrait ici.
    if (estJointure(prestation) && !enModeInventaire(formatsTable)) {
      return { ok: false, code: 'prestation_introuvable' }
    }
    // ⚠️ `dureeDuGroupe`, LA MÊME QUE LA SAISIE AU TÉLÉPHONE (10/09 au soir) :
    // chacun calculait la sienne, et un couple durait deux heures au téléphone
    // et une heure et demie en ligne, sur la même table.
    dureeRetenue = dureeDuGroupe({ prestation, formats: formatsTable, couverts: couvertsRetenus })
  }

  // ⚠️ CE CRÉNEAU ACCEPTE-T-IL CETTE PRESTATION ? (07/09) La fiche filtre déjà
  // les horaires proposés, mais un écran ne décide de rien : sans cette garde,
  // une requête forgée réserve un cours de yoga le mardi à 13h alors qu'il
  // n'existe que le lundi à 10h, et le commerçant devrait l'assurer.
  //
  // 🔴 EXEMPTÉE POUR LA SAISIE DU COMMERÇANT. Son agenda est le sien : il a
  // toujours pu y poser un rendez-vous hors de ses horaires, typiquement pour
  // un client qui appelle. Lui refuser ici transformerait une correction en
  // régression sur le geste qu'il fait le plus souvent.
  if (champs?.source !== 'commercant') {
    const { data: creneauxCom } = await db
      .from('rdv_creneaux')
      .select('id, jour_semaine, date_specifique, heure_debut, heure_fin, pause_debut, pause_fin, actif')
      .eq('commercant_id', commercantId)
      .is('deleted_at', null)

    // ⚠️ BORNÉ AUX CRÉNEAUX DE CE COMMERCE. La table de liaison ne porte pas de
    // `commercant_id`, et la clé de service traverse la RLS : sans ce `in`, on
    // chargerait les liaisons de TOUT le parc à chaque réservation, et la
    // requête grossirait avec le nombre de commerces sans que rien ne le dise.
    //
    // 🔴 ET BORNÉ AUX PLAGES VIVANTES (08/09). `creneauxDuJour` écarte bien les
    // plages éteintes pour CHOISIR, mais les liaisons, elles, partaient
    // complètes : une prestation nommée sur une plage désactivée restait
    // « nommée » aux yeux de la règle. La fiche publique, qui ne charge que les
    // plages actives, la proposait pendant que le serveur la refusait.
    // L'écran calcule, le serveur décide, et les deux doivent lire la même
    // chose.
    const idsCreneaux = (creneauxCom || []).filter(c => c.actif !== false).map(c => c.id)
    const { data: liaisons } = idsCreneaux.length > 0
      ? await db.from('rdv_creneau_prestations').select('creneau_id, prestation_id').in('creneau_id', idsCreneaux)
      : { data: [] }
    const reference = new Date(`${dateRdv}T12:00:00`)
    const autorise = prestationAutoriseeSurCreneaux({
      creneaux: creneauxCom || [],
      // ⚠️ `null` et `[]` ne disent PAS la même chose. Une lecture en échec rend
      // `null` : on ne juge pas, on laisse passer comme avant. Un tableau vide
      // veut dire « ce commerce n'a rien réglé », ce qui laisse passer aussi.
      liaisons: liaisons || null,
      prestationId,
      dateStr: dateRdv,
      jour: isNaN(reference.getTime()) ? null : jourSemaineDate(reference),
      debutMin: timeToMinutes(heure),
      // ⚠️ LA DURÉE SE RECALCULE ICI, elle ne se reçoit pas. Une table de huit
      // occupe la salle plus longtemps qu'une table de deux : laisser l'écran
      // annoncer sa durée reviendrait à laisser un client réserver huit couverts
      // en bloquant quatre-vingt-dix minutes, et libérer la table sur le papier
      // pendant que le groupe est encore attablé.
      finMin: timeToMinutes(heure) + dureeRetenue,
      // 🔴 « PAS DE PLAGE, PAS DE DISPO » POUR UN COURS (Alex, 08/09). La règle
      // vient d'ici comme le reste : l'écran ne le propose plus, mais un écran
      // ne décide de rien.
      // ⚠️ `estCoursCollectif`, PAS `capacite > 1` : une table a une capacité
      // d'inventaire, pas une heure fixe. Le serveur refusait sinon exactement
      // ce que l'écran corrigé vient de proposer.
      estCours: estCoursCollectif(prestation),
    })
    if (!autorise) return { ok: false, code: 'prestation_hors_creneau' }
  }

  // ─── LE PRATICIEN EST-IL DE CETTE MAISON, ET FAIT-IL CE MÉTIER ? ──────────
  //
  // 🔴 IL N'ÉTAIT VÉRIFIÉ NULLE PART (08/09). `praticien_id` arrivait du corps
  // de la requête et partait en base tel quel. Deux conséquences, et la seconde
  // n'est pas un confort d'écran :
  //
  //   • un client pouvait être inscrit chez une praticienne qui ne fait pas
  //     cette prestation, ce que la fiche ne propose jamais ;
  //   • et surtout, RIEN N'EXIGEAIT QUE LE PRATICIEN SOIT DE CE COMMERCE. La
  //     base porte une contrainte d'exclusion sur le praticien et l'horaire
  //     (23P01, gérée plus bas) : poser un rendez-vous avec l'identifiant
  //     d'une praticienne d'un AUTRE commerce fermait son agenda à cette
  //     heure-là, depuis un formulaire public.
  //
  // ⚠️ L'APPARTENANCE SE VÉRIFIE POUR TOUT LE MONDE, LE MÉTIER SEULEMENT POUR
  // UN CLIENT. Le commerçant reste libre de faire assurer un soin par qui il
  // veut chez lui, comme il reste libre de poser un rendez-vous hors horaires.
  // Mais personne, lui compris, n'écrit le praticien d'une autre maison.
  if (champs?.praticien_id) {
    const { data: prat } = await db
      .from('rdv_praticiens')
      .select('id, actif, deleted_at')
      .eq('id', champs.praticien_id)
      .eq('commercant_id', commercantId)
      .maybeSingle()
    if (!prat || prat.actif === false || prat.deleted_at) {
      return { ok: false, code: 'praticien_hors_commerce' }
    }

    if (champs?.source !== 'commercant') {
      const { data: liensPrat } = await db
        .from('rdv_prestation_praticiens')
        .select('prestation_id, praticien_id')
        .eq('prestation_id', prestationId)
      // ⚠️ `null` OUVRE. Une lecture en échec ne doit pas fermer un agenda que
      // personne ne saurait rouvrir : même arbitrage que pour les plages.
      if (!praticienAutorisePourPrestation(champs.praticien_id, prestationId, liensPrat || null)) {
        return { ok: false, code: 'praticien_hors_prestation' }
      }
    }
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
  //
  // ⚠️ SAUF POUR UNE TABLE, qui cherche son rang plus bas, parmi TOUTES les
  // réservations de l'heure et une fois la table retenue (voir `rangLibre`).
  const capacite = capacitePrestation(prestation)
  let placeNo = 1
  if (capacite > 1 && !estParCouverts(prestation)) {
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

  // ─── LA SALLE SE COMPTE EN COUVERTS, ET LE SERVEUR LA COMPTE (09/09) ──────
  //
  // 🔴 L'INDEX UNIQUE NE PROTÈGE PAS CETTE JAUGE-LÀ. `rdv_no_double_book` porte
  // sur le numéro de place : il empêche deux tables de prendre le même rang à
  // la même heure, pas dix tables de quatre d'entrer dans une salle de vingt.
  // Sans ce contrôle, une requête forgée réserve cinquante couverts, et le
  // restaurateur découvre sa salle en double le soir même.
  //
  // ⚠️ ON COMPTE LES CHEVAUCHEMENTS, PAS L'ÉGALITÉ D'HEURE. Une table à 20h00
  // et une à 20h30 occupent la salle en même temps ; ne compter que les heures
  // identiques laisserait passer un service entier décalé d'une demi-heure.
  // ⚠️ LE FORMAT QUI SERA ÉCRIT, qui n'est pas forcément celui qu'on a reçu. En
  // mode inventaire, le serveur choisit la table ; partout ailleurs, il garde
  // celle qu'on lui a désignée, et cette ligne ne fait rien.
  //
  // ⚠️ `couvertsRetenus`, `formatsTable` et `dureeRetenue` sont décidés tout en
  // haut, avant le contrôle du créneau : ce bloc les lit, il ne les refait pas.
  let prestationRetenue = prestation
  if (estParCouverts(prestation)) {
    // 🔴 UNE SALLE EST UNE SALLE, PAS UNE PAR FORMAT DE TABLE (09/09 au soir).
    // La requête filtrait sur `prestation_id`, ce qui est juste pour un COURS :
    // le yoga de 10h et le pilates de 10h ont chacun leur capacité. Mais deux
    // formats de table partagent la MÊME salle. Dès que Le Bistrologue crée
    // « Table de 2 » à côté de « Table de 4 », chacune se voyait accorder
    // quarante couverts, et il pouvait en accepter quatre-vingts dans une salle
    // qui en tient quarante. La jauge existait, elle comptait la mauvaise chose.
    //
    // ⚠️ ON NE FILTRE PLUS PAR PRESTATION POUR UNE TABLE, et seulement pour une
    // table : le cas du cours ne change pas d'une ligne. La lecture des formats,
    // plus haut, restreint aux prestations en mode table du commerce.
    const idsSalle = (formatsTable || []).map(f => f.id)
    // ⚠️ FILET : si la liste revient vide, on retombe sur la prestation seule
    // plutôt que sur AUCUN filtre. Un `in()` vide ne rendrait rien, la salle
    // paraîtrait libre, et la jauge s'effacerait exactement comme elle vient de
    // le faire pendant deux jours.
    const { data: autour } = await db
      .from('rdv_reservations')
      .select('prestation_id, heure_debut, heure_fin, couverts')
      .eq('commercant_id', commercantId)
      .eq('date_rdv', dateRdv)
      .in('prestation_id', idsSalle.length > 0 ? idsSalle : [prestation.id])
      .in('statut', STATUTS_OCCUPENT)
      .is('deleted_at', null)

    const debutMin = timeToMinutes(heure)

    // ─── LOT 2a : LA SALLE SE COMPTE EN TABLES DÈS QUE L'INVENTAIRE EST LÀ ───
    //
    // 🔴 UNE JAUGE EN COUVERTS LAISSE PASSER CE QU'ELLE NE PEUT PAS ASSEOIR. Six
    // places libres réparties sur trois tables de deux ne font pas une table de
    // six, et c'est pourtant ce que l'ancien calcul autorisait.
    //
    // ⚠️ LE MODE SE DÉCIDE SUR LA SALLE ENTIÈRE, pas sur la prestation reçue :
    // tant qu'un seul format n'a pas sa quantité, on compte comme avant. C'est
    // ce que l'écran du commerçant lui annonce, et les deux doivent dire la
    // même chose.
    if (enModeInventaire(formatsTable)) {
      // 🔴 LA RÈGLE DU PLUS PETIT ÉCART ENTRE EN SERVICE (lot 2b). Le client ne
      // désigne plus sa table, il dit combien ils sont : le serveur peut donc
      // donner la plus petite qui convient, et garder les grandes pour les
      // grands groupes. Sans cette règle, un couple prend la table de six à 19h
      // et le groupe de six s'entend dire non à 20h.
      //
      // ⚠️ LE FORMAT REÇU N'EST QU'UNE PROPOSITION D'ÉCRAN. Il sert au prix et à
      // la durée annoncés, et `formatLibrePour` commence de toute façon par lui
      // puisque c'est le plus petit candidat. Si ses exemplaires sont pris, on
      // monte d'un cran plutôt que de refuser une salle qui a de la place.
      //
      // ⚠️ SUR LA DURÉE DU GROUPE, `dureeRetenue`, décidée tout en haut : c'est
      // elle qui s'écrira, c'est donc elle qu'on contrôle.
      const choix = formatLibrePour({
        formats: formatsTable,
        couverts: couvertsRetenus,
        reservations: autour || [],
        debutMin,
        finMin: debutMin + dureeRetenue,
      })
      if (!choix.format) {
        // ⚠️ DEUX REFUS, DEUX RAISONS. « Trop grand » n'est pas « complet » : le
        // premier appelle un coup de téléphone, le second un autre horaire. Les
        // confondre enverrait le groupe de douze chercher un créneau qui
        // n'existera jamais.
        return choix.raison === 'aucune_table_a_cette_taille'
          ? { ok: false, code: 'groupe_trop_grand', couverts: couvertsRetenus }
          : { ok: false, code: 'salle_complete', restants: 0 }
      }
      prestationRetenue = choix.format
    } else {
      const finMin = debutMin + dureeRetenue
      const occupes = occupationDe(prestation, (autour || []).filter(r =>
        debutMin < timeToMinutes(r.heure_fin) && finMin > timeToMinutes(r.heure_debut)))
      if (occupes + couvertsRetenus > capacite) {
        return { ok: false, code: 'salle_complete', restants: Math.max(0, capacite - occupes) }
      }
    }

    // 🔴 LE RANG D'UNE TABLE SE CHERCHE PARMI TOUTES LES RÉSERVATIONS DE L'HEURE
    // (Alex, 10/09 : « pourquoi ça bloque après deux résas ? »).
    //
    // L'index `rdv_no_double_book` ne connaît pas la prestation. Le rang était
    // calculé à l'intérieur du format retenu : la table de quatre prenait le 1,
    // déjà pris à 19h par une table de deux, et la base refusait l'insertion
    // que la salle venait d'accepter. Le client lisait « ce créneau vient
    // d'être pris » devant une salle aux trois quarts vide.
    //
    // ⚠️ SANS FILTRE DE FORMAT NI DE PRATICIEN, et c'est voulu : un rang libre
    // parmi toutes les réservations de l'heure l'est forcément pour la clé de
    // l'index, quel que soit le praticien. Et sans plafond : ce n'est pas le
    // rang qui dit « complet » pour une table, c'est l'inventaire, juste avant.
    const { data: memeHeure } = await db
      .from('rdv_reservations')
      .select('place_no')
      .eq('commercant_id', commercantId)
      .eq('date_rdv', dateRdv)
      .eq('heure_debut', heure)
      .in('statut', STATUTS_OCCUPENT)
      .is('deleted_at', null)
    placeNo = rangLibre((memeHeure || []).map(r => r.place_no))
  }

  // ⚠️ CE QUE LE MODULE DÉCIDE PASSE APRÈS `champs`, et donc l'emporte. Un
  // appelant qui recopierait sa propre capacité ou son propre lieu recréerait
  // exactement la divergence que ce module existe pour tuer.
  const payload = {
    ...champs,
    ...(rdvId ? { id: rdvId } : {}),
    ...lieu,
    commercant_id: commercantId,
    prestation_id: prestationRetenue.id,
    date_rdv: dateRdv,
    heure_debut: heure,
    // TVA figée à la réservation, comme le lieu et pour la même raison : le
    // taux de la prestation peut changer, le rendez-vous déjà pris ne doit pas
    // bouger dans les exports comptables.
    tva_taux: prestationRetenue.tva_taux ?? null,
    // ⚠️ LA CAPACITÉ GRAVÉE SUIT LA TABLE RETENUE : la contrainte d exclusion
    // la lit pour savoir si elle s applique, et une capacite empruntee a un
    // autre format la ferait garder la mauvaise porte.
    capacite_creneau: capacitePrestation(prestationRetenue),
    place_no: placeNo,
    // ⚠️ APRÈS `champs`, DONC IL L'EMPORTE. Un appelant qui recopierait son
    // propre nombre de couverts contournerait la validation qu'on vient de
    // faire, et c'est exactement ce que ce module existe pour empêcher.
    couverts: couvertsRetenus,
    // 🔴 ET LA DURÉE AVEC, POUR LA MÊME RAISON. Elle arrivait de l'écran, dans
    // `champs`, pendant que les gardes ci-dessus en calculaient une autre : une
    // table de huit pouvait être contrôlée sur cent cinquante minutes et
    // ENREGISTRÉE sur quatre-vingt-dix. L'agenda du restaurateur libérait alors
    // une table encore occupée, et la garde qui venait de dire oui n'y était
    // pour rien. Vérifier une valeur puis en écrire une autre, c'est ne rien
    // vérifier du tout.
    //
    // 🔴 ET C'EST `dureeRetenue`, CELLE QUE LA SALLE VIENT DE CONTRÔLER (10/09).
    // Recalculée ici sur la table retenue, elle en différait dès que le serveur
    // montait d'un format : le même défaut, par la porte d'à côté.
    duree_minutes: dureeRetenue,
    heure_fin: minutesToTime(timeToMinutes(heure) + dureeRetenue),
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

  // ─── LA PLACE EST PRISE : LA FILE D'ATTENTE LE SAIT ──────────────────────
  // ⚠️ ICI ET PAS CHEZ LES APPELANTS. Quatre chemins créent un rendez-vous (la
  // réservation directe, le retour de paiement, l'abonnement, la saisie au
  // comptoir) : posé chez chacun, ce geste serait oublié par le cinquième, et
  // l'oubli serait MUET. Des notifications continueraient de partir vers un
  // créneau déjà pris.
  //
  // ⚠️ NON BLOQUANT : le rendez-vous existe et le client a peut-être payé. Une
  // erreur ici ne doit ni rendre la réservation, ni faire rejouer un webhook.
  // Dans le cas courant, où personne n'attend, ça ne coûte qu'une lecture.
  const suite = await placePrise(db, {
    prestationId,
    dateRdv,
    heureDebut: heure,
    clientId: champs?.client_id || null,
  })
  if (!suite.ok) console.error('[rdv/creation] file d’attente non mise à jour', suite.error)

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
