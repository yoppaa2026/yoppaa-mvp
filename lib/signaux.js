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
