// Ce que les habitants demandent à un commerçant, et comment on le lui dit.
//
// L'OBJECTIF, décidé avec Alex le 05/08. Un commerçant peut être sur Yoppaa
// gratuitement même s'il a déjà un logiciel de rendez-vous. Ce sont les signaux
// qui font le travail : quand douze habitants de sa commune ont voulu réserver
// chez lui, il conclut tout seul. Un commercial qui dit « passe chez nous » se
// fait éconduire ; ses propres clients, non.
//
// TROIS RÈGLES QUI DÉCIDENT DE LA RÉUSSITE.
//
// 1. On ne parle QUE quand le nombre parle. Un email annonçant « 1 personne a
//    demandé » affaiblit l'argument au lieu de le servir. En dessous du seuil,
//    silence.
//
// 2. C'est un FAIT, jamais une offre. « 12 personnes veulent que tu passes à
//    Vendre » est de la vente, et le commerçant se braque. « 12 habitants ont
//    voulu prendre rendez-vous chez toi ce mois-ci, dont 4 après 21h » est une
//    information sur son commerce, et il en tire lui-même la conclusion.
//
// 3. Le soir et le week-end portent l'argument. Ces demandes sont arrivées
//    quand sa boutique était fermée et que personne ne pouvait l'appeler : ce
//    ne sont pas des rendez-vous qu'il a déjà, ce sont des rendez-vous qu'il a
//    perdus. C'est ce qui répond à « j'ai déjà un système ».
//
// ⚠️ RGPD : ce module ne manipule QUE des nombres. Le commerçant ne doit jamais
// savoir QUI a demandé, c'est la promesse faite sur la page d'accueil.

import { canDo, isVitrine } from './plans'

// Comment chaque envie se dit au commerçant. Le libellé parle de SON commerce,
// jamais d'une fonctionnalité Yoppaa.
export const LIBELLE_ENVIE = {
  commande: {
    court: 'Commander en ligne',
    phrase: (n) => `${n} ${n > 1 ? 'habitants ont voulu' : 'habitant a voulu'} commander chez toi`,
  },
  rdv: {
    court: 'Prendre rendez-vous',
    phrase: (n) => `${n} ${n > 1 ? 'habitants ont voulu' : 'habitant a voulu'} prendre rendez-vous chez toi`,
  },
  livraison: {
    court: 'Être livré',
    phrase: (n) => `${n} ${n > 1 ? 'habitants ont voulu' : 'habitant a voulu'} se faire livrer par toi`,
  },
  prix: {
    court: 'Voir les prix',
    phrase: (n) => `${n} ${n > 1 ? 'habitants ont cherché' : 'habitant a cherché'} tes prix`,
  },
  deals: {
    court: 'Suivre les bons plans',
    phrase: (n) => `${n} ${n > 1 ? 'habitants veulent' : 'habitant veut'} suivre tes bonnes affaires`,
  },
  // ⚠️ AJOUTÉ LE 26/08 À LA DEMANDE D'ALEX. C'est le seul signal qui parle
  // d'une habitude plutôt que d'un service : celui qui le pose revient déjà,
  // et il dit qu'il aimerait que ça compte. Pour un commerçant, c'est
  // l'information la plus difficile à obtenir autrement, parce que personne ne
  // demande une carte de fidélité au comptoir.
  fidelite: {
    court: 'Avoir une carte de fidélité',
    phrase: (n) => `${n} ${n > 1 ? 'habitants aimeraient' : 'habitant aimerait'} une carte de fidélité chez toi`,
  },
}

// ⚠️ LA LISTE FAIT AUTORITÉ, ET ELLE EST DÉRIVÉE DES LIBELLÉS. Le serveur
// acceptait n'importe quelle chaîne de 40 caractères comme type de signal :
// n'importe quel appelant pouvait donc inventer des catégories et polluer les
// statistiques que le commerçant lit pour décider. Recopier la liste ailleurs
// aurait garanti qu'un jour l'une des deux oublie un type.
export const TYPES_ENVIE = Object.keys(LIBELLE_ENVIE)

export function envieConnue(type) {
  return TYPES_ENVIE.includes(String(type || ''))
}

export function libelleEnvie(type) {
  return LIBELLE_ENVIE[type] || { court: type, phrase: (n) => `${n} demande${n > 1 ? 's' : ''}` }
}

// ─── DE L'ENVIE D'UN HABITANT À LA FONCTION QUI Y RÉPOND ────────────────────
//
// Les deux listes se ressemblaient par convention, et rien ne les reliait. Or
// c'est ce lien qui porte tout l'argument : quand le commerçant ouvre une
// fonction qu'il n'a pas, on ne lui vend rien, on lui dit combien de ses
// habitants l'attendent. Sans cette table, il faudrait deviner à chaque écran.
//
// ⚠️ `prix` DONNE `prix_affiches`, ET C'EST TOUT LE PIÈGE. La clé de la
// matrice ne porte pas le même nom que le type de signal, et le raccourci
// `canDo(plan, 'prix')` a déjà mordu le projet une fois : une clé inexistante
// rend `false` sans erreur, donc les prix disparaissaient de toutes les fiches.
// La correspondance s'écrit ici, une fois, et le banc vérifie que chaque valeur
// existe vraiment dans PLAN_FEATURES.
export const ENVIE_VERS_FONCTION = {
  commande:  'commande',
  rdv:       'rdv',
  livraison: 'livraison',
  prix:      'prix_affiches',
  deals:     'deals',
  fidelite:  'fidelite',
}

export function fonctionDeLEnvie(type) {
  return ENVIE_VERS_FONCTION[String(type || '')] || null
}

// ⚠️ DÉRIVÉE, JAMAIS RECOPIÉE. Écrire la table en sens inverse à la main
// garantirait qu'un jour l'une des deux oublie une entrée, exactement ce qui
// est reproché plus haut à une liste de types recopiée.
const FONCTION_VERS_ENVIE = Object.fromEntries(
  Object.entries(ENVIE_VERS_FONCTION).map(([envie, fonction]) => [fonction, envie])
)

export function envieDeLaFonction(feature) {
  return FONCTION_VERS_ENVIE[String(feature || '')] || null
}

// ─── CE QU'UN HABITANT PEUT DEMANDER SUR CETTE FICHE-LÀ ─────────────────────
//
// 🔴 « LES SIGNAUX YOPPER DOIVENT TOUS ÊTRE DANS LE BAS DE LA PAGE DU
// COMMERÇANT, PHRASE SIMPLE, CLAIRE ET EFFICACE » (Alex, 26/08).
//
// ⚠️ AVANT, LA RÈGLE ÉTAIT ÉCRITE DANS LE JSX, EN QUATRE ENDROITS. Un bandeau
// sombre pleine largeur sous les coordonnées, deux autres après le catalogue,
// un quatrième ailleurs : chacun avec sa condition, aucun avec la même, et
// personne pour dire lesquels pouvaient s'afficher ENSEMBLE. Un habitant
// pouvait descendre une fiche en croisant trois panneaux noirs qui lui
// demandaient trois fois de réclamer quelque chose.
//
// La règle vit donc ici, se lit d'un coup d'œil, et se mesure au banc.
//
// ⚠️ ON NE DEMANDE QUE CE QUI MANQUE VRAIMENT. Chaque entrée répond à « ce
// commerce ne le propose pas aujourd'hui », jamais à « son forfait ne le
// contient pas » : un commerçant qui a la fonction dans sa formule et ne l'a
// pas allumée est justement celui qu'un mot de client décide, puisqu'il n'a
// rien de plus à payer.
//
// ⚠️ ET L'ORDRE EST CELUI DE L'ÉVIDENCE POUR L'HABITANT : commander, se faire
// livrer, réserver, voir les prix, être fidélisé, suivre les bons plans.
export function enviesProposables(commercant, { peutCommander = false } = {}) {
  if (!commercant) return []
  // ⚠️ LA MÊME LECTURE QUE PARTOUT AILLEURS : `isVitrine` vit dans `plans.js`
  // et sait seule ce qu'est une vitrine. Une seconde définition recopiée ici
  // dériverait au premier changement de catégorie.
  const vitrine = isVitrine(commercant)
  // ⚠️ ET UN ALIMENTAIRE PEUT PRENDRE RENDEZ-VOUS : un traiteur qui fait des
  // dégustations coche `est_service` sans être une vitrine. La question du
  // rendez-vous se pose donc pour les deux.
  const service = vitrine || commercant.est_service === true
  const sorties = []

  // Commander : jamais chez un prestataire de service, où « commander » ne veut
  // rien dire. Un coiffeur ne vend pas un panier, il vend un créneau.
  if (!peutCommander && !vitrine) sorties.push('commande')
  // Être livré : seulement si commander est DÉJÀ possible. Réclamer la livraison
  // à un commerce où l'on ne peut rien commander n'a aucun sens.
  if (peutCommander && !commercant.livraison_actif) sorties.push('livraison')
  // Prendre rendez-vous : la question des métiers de service.
  if (service && !commercant.rdv_actif) sorties.push('rdv')
  // Voir les prix : quand la fiche n'en montre aucun.
  // ⚠️ `prix_affiches`, jamais `prix` : la clé du signal et celle de la matrice
  // ne portent pas le même nom, et le raccourci a déjà mordu le projet.
  if (!canDo(commercant.plan, 'prix_affiches')) sorties.push('prix')
  // Une carte de fidélité : quand aucun programme ne tourne.
  if (!commercant.fidelite_actif) sorties.push('fidelite')

  return sorties
}

// La phrase à montrer au commerçant pour une fonction donnée, à partir de ses
// propres signaux. Rend null s'il n'y a rien à dire.
//
// ⚠️ SILENCE QUAND LE NOMBRE NE PARLE PAS. C'est la règle 1 de ce module, et
// elle vaut ici plus qu'ailleurs : `rdv` et `deals` ne sont émis par AUCUN
// écran aujourd'hui, leurs compteurs valent donc zéro pour tout le monde.
// Écrire « 0 habitant aimerait » sous une fonction qu'on espère lui vendre
// serait le meilleur moyen de l'en dissuader.
export function phraseEnvieFonction(feature, envies = []) {
  const type = envieDeLaFonction(feature)
  if (!type) return null
  const ligne = (envies || []).find(e => e && e.type === type)
  const n = Math.floor(Number(ligne?.trente_jours) || 0)
  if (n <= 0) return null
  return libelleEnvie(type).phrase(n)
}

// La phrase qui répond à « j'ai déjà un système ». Renvoie null quand il n'y a
// rien de probant à dire : une seule demande en soirée n'est pas un argument,
// c'est une anecdote.
export function phraseHorsOuverture({ soir = 0, weekend = 0 } = {}) {
  if (soir >= 2 && weekend >= 2) {
    return `dont ${soir} après 19h et ${weekend} le week-end, quand ta boutique était fermée`
  }
  if (soir >= 2) return `dont ${soir} après 19h, quand personne ne pouvait t'appeler`
  if (weekend >= 2) return `dont ${weekend} le week-end, quand ta boutique était fermée`
  return null
}

// Le commerçant doit-il être prévenu ?
//
// `stats` : lignes de la vue signaux_envies_stats pour CE commerce.
// `commercant` : porte le seuil, l'interrupteur et la pause.
//
// Renvoie { alerter, types } où `types` ne contient que ce qui a franchi le
// seuil : on ne parle que de ce qui parle.
export function enviesAAlerter(stats = [], commercant = {}, maintenant = new Date()) {
  const seuil = Number(commercant.signaux_seuil_alerte ?? 5)
  if (!commercant.signaux_email_actif) return { alerter: false, types: [] }
  if (seuil <= 0) return { alerter: false, types: [] }
  if (commercant.signaux_email_pause_jusqu && new Date(commercant.signaux_email_pause_jusqu) > maintenant) {
    return { alerter: false, types: [] }
  }
  const types = stats
    .filter(s => Number(s.trente_jours || 0) >= seuil)
    .sort((a, b) => Number(b.trente_jours) - Number(a.trente_jours))
  return { alerter: types.length > 0, types }
}

// Depuis combien de jours n'a-t-on rien envoyé ? Sert au rythme du récapitulatif
// hebdomadaire : on ne réexpédie pas le même message tous les jours.
export function peutEnvoyerEmail(commercant = {}, maintenant = new Date(), joursMin = 7) {
  if (!commercant.signaux_email_le) return true
  const ecoule = (maintenant - new Date(commercant.signaux_email_le)) / (1000 * 3600 * 24)
  return ecoule >= joursMin
}
