// QUI PREND DES RÉSERVATIONS, ET SOUS QUEL NOM.
//
// Deux métiers, un seul moteur. Un salon prend des RENDEZ-VOUS ; un restaurant
// réserve des TABLES. Derrière, c'est le même agenda, les mêmes plages, les
// mêmes acomptes, la même liste d'attente. Devant, ce ne sont pas les mêmes
// mots, et un restaurateur qui lit « prendre rendez-vous » sur sa fiche
// comprend tout de suite que l'outil n'a pas été pensé pour lui.
//
// 🔴 LA MATRICE AVAIT DÉJÀ TRANCHÉ, ET PERSONNE NE LA LISAIT. `lib/plans.js`
// porte `reservation_table: true` dans VENDRE depuis longtemps, listée dans
// `FEATURES_ALIMENTAIRE_ONLY` aux côtés de `commande`, `livraison` et
// `anti_gaspi`. Elle n'était lue nulle part : un drapeau écrit, jamais branché.
// La décision de modèle n'était pas à prendre, elle était à honorer.
//
// ⚠️ UN SEUL INTERRUPTEUR, `rdv_actif`, ET C'EST VOULU. La colonne existe déjà
// sur tout le parc. En créer une seconde pour la même chose donnerait deux
// vérités à tenir, et un jour l'une dirait oui pendant que l'autre dirait non.
// C'est la CATÉGORIE qui décide du vocabulaire, pas un second drapeau.

import { peut, isAlimentaire } from './plans'

// La fonction de forfait qui porte la réservation, selon le métier.
export function fonctionReservation(commercant) {
  return isAlimentaire(commercant) ? 'reservation_table' : 'rdv'
}

// Ce commerce a-t-il DROIT à la réservation ? (forfait + catégorie)
export function peutReserver(commercant, maintenant = new Date()) {
  return peut(commercant, fonctionReservation(commercant), maintenant)
}

// L'a-t-il ALLUMÉE ? C'est ce que la fiche publique doit regarder.
//
// ⚠️ LES DEUX CONDITIONS. Le droit sans l'interrupteur afficherait une
// réservation chez quelqu'un qui n'a jamais ouvert une seule plage ;
// l'interrupteur sans le droit la laisserait allumée après un changement de
// forfait, et le client réserverait dans le vide.
export function reservationActive(commercant, maintenant = new Date()) {
  return commercant?.rdv_actif === true && peutReserver(commercant, maintenant)
}

// Les mots de ce métier-là.
//
// ⚠️ UN SEUL ENDROIT, comme `libelleBon` pour les bons cadeaux. Un libellé
// recopié dans quinze écrans finit toujours par diverger dans trois d'entre
// eux, et ce sont ceux-là que le commerçant remarque.
// 🔴 ET C'EST LE MOT « PRESTATION » QUI TRAHISSAIT LE PLUS. Alex, devant la
// fiche d'un restaurant : « c'est un peu le bordel dans les intitulés,
// praticiens, assigner un praticien à une table à une presta ». Un restaurateur
// ne vend pas une PRESTATION à un PRATICIEN sur un CRÉNEAU : il ouvre un
// SERVICE, dans une SALLE, avec des TABLES. Les colonnes gardent leurs noms,
// l'écran change les siens.
//
// ⚠️ UN PRATICIEN DEVIENT UNE SALLE, IL NE DISPARAÎT PAS. Masquer la notion
// aurait coûté au restaurateur ce qui lui sert le plus : distinguer sa terrasse
// de sa salle du fond, et leur donner des services différents. C'est le même
// champ, sous le nom de son métier.
const MOTS_TABLE = {
  action: 'Réserver une table',
  pastille: 'Réserver',
  nom: 'réservation',
  nomPluriel: 'réservations',
  onglet: 'Réservations',
  ongletCourt: 'Tables',
  laSienne: 'ta réservation',
  // « tu as UNE réservation demain » : l'article indéfini, pas le possessif.
  uneSienne: 'une réservation',
  // ⚠️ « MA », PAS « TA ». Une case de consentement parle à la première
  // personne : « J'accepte que mes coordonnées soient transmises pour le
  // traitement de MA réservation. » Réutiliser `laSienne` aurait donné un
  // texte juridique qui change de personne au milieu de la phrase.
  laMienne: 'ma réservation',
  quandLaPrendre: 'Quand veux-tu venir ?',
  aucune: 'Aucune réservation',
  // Le catalogue : ce que le client choisit.
  prestation: 'table',
  prestations: 'Tables',
  prestationUne: 'une table',
  choisir: 'Choisis ta table',
  ajouter: 'Ajouter une table',
  prestationAucune: 'Aucune table',
  prestationAide: 'Crée tes formats de table (ex : « Table de 4 · 90 min ») pour que tes clients réservent en ligne.',
  prestationNouvelle: 'Nouvelle table',
  prestationModifier: 'Modifier la table',
  // Qui exécute : la salle, pas la personne.
  praticien: 'salle',
  praticiens: 'Salles',
  praticienUn: 'une salle',
  tousPraticiens: 'Toutes les salles',
  praticienAucun: 'Aucune salle',
  praticienAide: 'Ajoute tes espaces (ex : Salle, Terrasse) pour leur ouvrir des services différents. Une seule salle ? Crées-en une, et tu n’auras plus à y penser.',
  praticienNouveau: 'Nouvelle salle',
  praticienModifier: 'Modifier la salle',
  praticienActifLabel: 'Salle active (visible côté client)',
  praticienCreer: 'Créer la salle',
  praticiensAutorises: 'Salles où cette table se trouve',
  praticiensAutorisesAide: 'Coche les salles qui possèdent cette table. Aucune cochée = elle peut être placée partout.',
  // Quand : le service, pas le créneau.
  creneaux: 'Services',
  creneauUn: 'un service',
  ajouterCreneau: 'Ajouter un service',
  creneauxTitre: 'Services en salle',
  creneauAucun: 'Aucun service ce jour',
  creneauNouveau: 'Nouveau service',
  creneauModifier: 'Modifier le service',
  creneauCommun: 'Toutes les salles (service commun)',
  // Les phrases du tunnel.
  sansDate: 'Pas encore de service ouvert pour cette table. Contacte le restaurant pour connaitre les prochains.',
  confirmer: 'Confirmer ma réservation',
  traitement: 'Traitement de ma réservation',
  // ⚠️ L'ACCORD, ET IL ÉTAIT DÉJÀ ÉCRIT SANS ÊTRE APPLIQUÉ. Le commentaire de
  // `ecran-retrait` disait noir sur blanc « commande, table et réservation sont
  // FÉMININS (Yoppée), rendez-vous et article sont MASCULINS (Yoppé) » : la
  // règle était posée, la table n'en avait jamais vu la couleur.
  yoppe: 'Ta réservation est Yoppée ! 🟣',
  yoppeSousTitre: 'Ta table est réservée.',
  yoppeSousTitreProduits: 'Ta table est réservée et tes produits sont mis de côté.',
  yoppeEtapeUn: 'Ta table est **confirmée**, tu reçois l’email et le fichier pour ton calendrier.',
  yoppeLeJour: 'On te les remet **le jour de ta réservation**. Rien à repayer sur place.',
  // ─── Les emails et les notifications ──────────────────────────────────────
  // ⚠️ CE SONT LES SEULS TEXTES QUE LE CLIENT GARDE. Un écran se referme, un
  // email reste dans sa boîte et se relit la veille du repas.
  // ⚠️ LES PARTICIPES SÉPARÉMENT, et c'est ce qui évite le bricolage. Composer
  // une phrase puis y remplacer un mot par `.replace` casse au premier texte
  // qui change ; le participe est une donnée du métier, il se range avec les
  // autres.
  participeConfirme: 'confirmée',
  participeDeplace: 'déplacée',
  participeAnnule: 'annulée',
  participeMaintenu: 'maintenue',
  participeHonore: 'honorée',
  participeRetire: 'retirée',
  participeMarque: 'marquée',
  participePresent: 'présente',
  pronomSujet: 'elle',
  emailConfirme: 'Ta réservation est confirmée',
  emailDeplace: 'Ta réservation a été déplacée',
  emailAnnule: 'Ta réservation a été annulée',
  emailLieuChange: 'Ta réservation change d’endroit',
  emailNoShow: 'Ta réservation a été marquée non honorée',
  emailRappelDemain: 'Rappel — ta table demain',
  sujetAnnule: 'Ta réservation chez',
  sujetRappel: 'Rappel — ta table demain chez',
  ctaVoir: 'Voir ma réservation',
  ctaVoirTout: 'Voir mes réservations',
  ctaReprendre: 'Reprendre une table',
  numeroLabel: 'Réservation',
  laReservationDe: 'la réservation',
  prestationLigne: 'Table',
  // 🔴 « AVEC SALLE PRINCIPALE » (email d'Alex, 10/09 tard) : une salle n'est
  // pas quelqu'un avec qui l'on vient.
  praticienLigne: 'Salle',
  sujetChez: 'Ta réservation chez',
  sujetNouveau: 'Nouvelle réservation',
  // Ce que le commerçant pose lui-même, au téléphone ou au comptoir.
  manuelTitre: 'Nouvelle réservation',
  manuelConfirmer: 'Confirmer la réservation',
  // Les fermetures et les plages, dans ses mots.
  fermetureResume: 'Congés, jours fériés, autre. Bloque les réservations côté client.',
  fermetureAide: 'Note tes prochains congés ou jours de fermeture ici. Tes clients ne pourront pas réserver de table sur ces dates.',
  servicesCommuns: 'Communs (toutes salles)',
  servicesInvisibles: 'Les services créés ici resteront invisibles pour tes clients tant que ce jour n’est pas ouvert.',
  horizonAide: 'Au-delà, l’agenda ne propose plus rien. Deux mois suffisent à une salle ; monte si tu prends des groupes très à l’avance.',
  servicesVideAide: 'Ajoute un service pour ouvrir ta salle ce jour-là. Un service peut valoir pour toutes tes salles, ou n’en concerner qu’une.',
  descriptionExemple: 'Près de la fenêtre, banquette confortable',
  astuceIA: 'Astuce : note ce que comprend cette table en vrac (nombre de personnes, emplacement, vue…) puis clique sur Rédiger avec l’IA.',
  // ⚠️ UNE TABLE N'A PLUS DE CHAMP DE PRIX (10/09 au soir) : cette phrase ne se
  // lit plus que sous une prestation d'un restaurant qui n'est PAS une table.
  // « Ta table s'affichera » y aurait été faux.
  prixSurDemande: 'Laisse vide si le tarif se fixe de vive voix : la fiche affichera « Prix sur demande ».',
  prestationActive: 'Table active (visible côté client)',
  // L'agenda du commerçant.
  agendaLegende: 'Chaque couleur, une salle',
  agendaAjouter: 'Tap sur une case blanche pour ajouter une réservation',
  agendaOccupe: 'couvert',
  agendaOccupes: 'couverts',
  agendaTousLa: 'Ils sont venus',
  agendaInscrire: 'Ajouter des couverts',
  agendaComplet: 'Ce service est complet. Annule une réservation pour libérer des couverts.',
  blocSansNom: 'Table',
  // Ce que le commerçant reçoit.
  alerteNouvelle: 'Nouvelle réservation 🟣',
  alerteNouvelleTitre: 'Nouvelle réservation reçue',
  alerteSansObjet: 'Nouvelle réservation',
  recapAucun: 'Aucune table réservée aujourd’hui.',
  recapSingulier: 'table',
  recapPluriel: 'tables',
  recapLesTiennes: 'tes tables',
  sujetRecapAucun: 'Aucune table réservée',
  // Le fil du Yopper, et les libellés courts.
  avecLaSienne: 'avec ta réservation',
  prochaineFois: 'ta prochaine réservation',
  prochainesFois: 'tes prochaines réservations',
  avant: 'avant ta réservation',
  reglages: 'Comment régler tes réservations de table',
}

const MOTS_RDV = {
  action: 'Prendre rendez-vous',
  pastille: 'Rendez-vous',
  nom: 'rendez-vous',
  nomPluriel: 'rendez-vous',
  onglet: 'Rendez-vous',
  ongletCourt: 'RDV',
  laSienne: 'ton rendez-vous',
  uneSienne: 'un rendez-vous',
  laMienne: 'mon rendez-vous',
  quandLaPrendre: 'Quand veux-tu venir ?',
  aucune: 'Aucun rendez-vous',
  prestation: 'prestation',
  prestations: 'Prestations',
  prestationUne: 'une prestation',
  choisir: 'Choisis ta prestation',
  ajouter: 'Ajouter une prestation',
  prestationAucune: 'Aucune prestation',
  prestationAide: 'Crée ta première prestation (ex : « Coupe femme · 30 min · 35 € ») pour permettre aux clients de réserver chez toi.',
  prestationNouvelle: 'Nouvelle prestation',
  prestationModifier: 'Modifier la prestation',
  praticien: 'praticien',
  praticiens: 'Praticiens',
  praticienUn: 'un praticien',
  tousPraticiens: 'Tous les praticiens',
  praticienAucun: 'Aucun praticien',
  praticienAide: 'Ajoute tes praticiens (ex : Sophie, Pierre) pour permettre aux clients de choisir avec qui ils prennent RDV. Si tu travailles seul, crée juste un praticien.',
  praticienNouveau: 'Nouveau praticien',
  praticienModifier: 'Modifier le praticien',
  praticienActifLabel: 'Praticien actif (visible côté client)',
  praticienCreer: 'Créer le praticien',
  praticiensAutorises: 'Praticiens autorisés',
  praticiensAutorisesAide: 'Coche uniquement les praticiens qui peuvent réaliser cette prestation. Aucun coché = tous les praticiens peuvent la faire.',
  creneaux: 'Créneaux',
  creneauUn: 'un créneau',
  ajouterCreneau: 'Ajouter un créneau',
  creneauxTitre: 'Créneaux RDV',
  creneauAucun: 'Aucun créneau ce jour',
  creneauNouveau: 'Nouveau créneau',
  creneauModifier: 'Modifier le créneau',
  creneauCommun: 'Tous les praticiens (créneau commun)',
  sansDate: 'Pas encore de date en ligne pour ce cours. Contacte le commerce pour connaitre les prochaines.',
  confirmer: 'Confirmer mon RDV',
  traitement: 'Traitement de mon RDV',
  yoppe: 'Ton RDV est Yoppé ! 🟣',
  yoppeSousTitre: 'Ton rendez-vous est réservé.',
  yoppeSousTitreProduits: 'Ton rendez-vous est réservé et tes produits sont mis de côté.',
  yoppeEtapeUn: 'Ton rendez-vous est **confirmé**, tu reçois l’email et le fichier pour ton calendrier.',
  yoppeLeJour: 'On te les remet **le jour de ton rendez-vous**. Rien à repayer sur place.',
  participeConfirme: 'confirmé',
  participeDeplace: 'déplacé',
  participeAnnule: 'annulé',
  participeMaintenu: 'maintenu',
  participeHonore: 'honoré',
  participeRetire: 'retiré',
  participeMarque: 'marqué',
  participePresent: 'présent',
  pronomSujet: 'il',
  emailConfirme: 'Ton RDV est confirmé',
  emailDeplace: 'Ton RDV a été déplacé',
  emailAnnule: 'Ton RDV a été annulé',
  emailLieuChange: 'Ton RDV change d’endroit',
  emailNoShow: 'Ton RDV a été marqué non honoré',
  emailRappelDemain: 'Rappel — RDV demain',
  sujetAnnule: 'Ton RDV chez',
  sujetRappel: 'Rappel — RDV demain chez',
  ctaVoir: 'Voir mon RDV',
  ctaVoirTout: 'Voir mes RDV',
  ctaReprendre: 'Reprendre un RDV',
  numeroLabel: 'Rendez-vous',
  laReservationDe: 'le rendez-vous',
  prestationLigne: 'Prestation',
  praticienLigne: 'Avec',
  sujetChez: 'Ton RDV chez',
  sujetNouveau: 'Nouveau RDV',
  manuelTitre: 'Nouveau RDV manuel',
  manuelConfirmer: 'Confirmer le RDV',
  fermetureResume: 'Congés, jours fériés, formation, autre. Bloque les RDV côté client.',
  fermetureAide: 'Note tes prochains congés ou jours de fermeture ici. Les clients ne pourront pas prendre RDV sur ces dates.',
  servicesCommuns: 'Communs (tous prat.)',
  servicesInvisibles: 'Les créneaux créés ici resteront invisibles pour tes clients tant que ce jour n’est pas ouvert.',
  horizonAide: 'Au-delà, l’agenda ne propose plus rien. Un carnet de dix séances par semaine demande au moins trois mois.',
  servicesVideAide: 'Ajoute un créneau pour ouvrir tes RDV ce jour-là. Tu peux créer des créneaux globaux (tous les praticiens) ou spécifiques à un praticien.',
  descriptionExemple: 'Shampoing, coupe, brushing',
  astuceIA: 'Astuce : note ce que comprend la prestation en vrac (shampoing, massage du cuir chevelu…) puis clique sur Rédiger avec l’IA.',
  prixSurDemande: 'Laisse vide si le tarif se fixe de vive voix : ta prestation s’affichera « Prix sur demande ».',
  prestationActive: 'Prestation active (visible côté client)',
  agendaLegende: 'Chaque couleur, une praticienne',
  agendaAjouter: 'Tap sur une case blanche pour ajouter un RDV',
  agendaOccupe: 'inscrit',
  agendaOccupes: 'inscrits',
  agendaTousLa: 'Tout le monde était là',
  agendaInscrire: 'Inscrire quelqu’un',
  agendaComplet: 'Ce cours est complet. Libère une place en annulant une inscription pour en ajouter une autre.',
  blocSansNom: 'Cours',
  alerteNouvelle: 'Nouveau rendez-vous 🟣',
  alerteNouvelleTitre: 'Nouveau RDV reçu',
  alerteSansObjet: 'Nouveau rendez-vous',
  recapAucun: 'Aucun RDV aujourd’hui.',
  recapSingulier: 'RDV',
  recapPluriel: 'RDV',
  recapLesTiennes: 'tes RDV',
  sujetRecapAucun: 'Aucun RDV',
  avecLaSienne: 'avec ton rendez-vous',
  prochaineFois: 'ton prochain rendez-vous',
  prochainesFois: 'tes prochains rendez-vous',
  avant: 'avant le RDV',
  reglages: 'Comment régler ta prise de rendez-vous',
}

// 🔴 ET « PAS DE COMMERÇANT » N'EST PAS « ALIMENTAIRE ». `isAlimentaire` rend
// `true` sur une catégorie absente — c'est son contrat historique, celui du parc
// d'avant les catégories, et toute la matrice de forfaits en dépend. Le
// VOCABULAIRE, lui, ne doit pas en hériter : un écran qui ne sait pas encore
// chez qui il est affichait « Tables » à un salon de coiffure.
//
// ⚠️ LE DÉFAUT EST LE RENDEZ-VOUS, et c'est le bon sens de l'erreur : il couvre
// tous les métiers de service, alors que « table » ne vaut que pour ceux qui en
// ont. Une garde d'accord l'a attrapé en exécutant la fonction sans commerçant.
export function motsReservation(commercant) {
  if (!commercant?.categorie) return MOTS_RDV
  return isAlimentaire(commercant) ? MOTS_TABLE : MOTS_RDV
}

// Raccourci pour les écrans qui n'ont besoin que d'un mot.
export function motReservation(commercant, cle) {
  const mots = motsReservation(commercant)
  return Object.prototype.hasOwnProperty.call(mots, cle) ? mots[cle] : ''
}

// Ce que le client a réservé, dit comme lui le dit.
//
// 🔴 « TABLE : TABLE DE 6 PERSONNES » POUR UN GROUPE DE QUATRE (email d'Alex,
// 10/09 tard). Le client dit combien ils sont, et c'est la salle qui choisit la
// table : le nom du format ne lui dit rien, et il le trompe dès que la salle
// l'a assis plus grand. Une table se dit donc en PERSONNES ; tout le reste
// garde le nom de sa prestation.
// ⚠️ Sans nombre lisible, on garde le nom plutôt que d'inventer « 1 personne ».
export function objetReservation({ prestation_nom = '', table = false, couverts = null } = {}) {
  const n = Math.floor(Number(couverts))
  if (table && Number.isFinite(n) && n >= 1) return `${n} personne${n > 1 ? 's' : ''}`
  return prestation_nom || ''
}

// 🔴 UN RESTAURANT N'A PAS DEUX FICHES, IL EN A UNE.
//
// La catégorie décidait jusqu'ici de QUELLE fiche le client voit : `/commander`
// pour un alimentaire, `/commander/rdv` pour une vitrine. Un restaurant a
// besoin des DEUX : sa carte à emporter ET sa réservation. Sa fiche reste donc
// celle des commandes, et la réservation s'y atteint par un bouton.
//
// ⚠️ Une vitrine, elle, ne change pas d'un pouce : sa fiche EST son agenda.
export function ficheDuCommerce(commercant) {
  if (!commercant?.slug) return '/commander'
  return isAlimentaire(commercant) || commercant.categorie === 'detail'
    ? `/commander/${commercant.slug}`
    : `/commander/rdv/${commercant.slug}`
}

export function pageReservation(commercant) {
  return commercant?.slug ? `/commander/rdv/${commercant.slug}` : '/commander'
}
