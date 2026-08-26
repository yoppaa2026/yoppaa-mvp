// LE FORFAIT SE VÉRIFIE SUR LE SERVEUR, OU IL NE SE VÉRIFIE PAS.
//
// 🔴 CINQ ROUTES DU CŒUR TRANSACTIONNEL NE REGARDAIENT PAS LE FORFAIT. Un
// commerçant en Exister pouvait créer une commande payante, brancher Stripe,
// ouvrir des cartes de fidélité et poser des rendez-vous : rien ne l'en
// empêchait côté serveur, seuls les écrans ne les lui montraient pas. Or
// **une garde d'écran n'est jamais une réponse** : un `fetch` bien formé
// depuis la console suffit à passer à côté.
//
// ⚠️ ET LA VRAIE DIFFICULTÉ N'EST PAS DE FERMER, C'EST DE SAVOIR OÙ.
//
// LA RÈGLE, EN UNE PHRASE : **la garde porte sur la CRÉATION, jamais sur la
// CONSOMMATION.**
//
// Ce que ça veut dire concrètement, et pourquoi c'est vital :
//
//   • Un commerçant qui redescend en Exister le 10 janvier a peut-être vendu
//     trente bons cadeaux et rempli deux cents cartes de fidélité en décembre.
//     Ses clients ont PAYÉ. Lui interdire d'HONORER ce qu'il a vendu, ce n'est
//     pas appliquer un forfait, c'est faire porter la sanction à des gens qui
//     n'ont rien décidé. On lui interdit d'en vendre de NOUVEAUX. Point.
//
//   • ⚠️ ET LE PIÈGE LE PLUS COÛTEUX EST STRIPE. Une garde posée bêtement sur
//     `stripe/connect` empêcherait de regénérer le lien d'un compte EXISTANT :
//     le commerçant ne pourrait plus **rembourser** un client, ni accéder à
//     l'argent déjà encaissé. On garde donc la CRÉATION d'un compte, jamais
//     l'accès à un compte déjà là.
//
// ⚠️ ON LIT LE FORFAIT EFFECTIF, PAS LA COLONNE `plan`. Depuis le 26/08 un
// commerçant peut être EN ESSAI d'un forfait supérieur. Une garde serveur qui
// lirait `commercant.plan` refuserait ce que son propre tableau de bord vient
// de lui ouvrir : il verrait l'écran, cliquerait, et se ferait jeter par le
// serveur sans comprendre. `planEffectif` a besoin de `created_at` et
// `essai_plan` dans le select — le banc vérifie chaque appelant.
//
// ⚠️ ET ON NE CHANGE PAS LA PORTÉE EN PASSANT PAR ICI. `peut()` applique la
// CATÉGORIE, et la matrice réserve `commande` à l'alimentaire alors que toute
// l'application l'accorde aussi au DÉTAIL. Une garde qui appliquerait la
// catégorie ici couperait la boutique de tous les commerces de détail en
// Vendre. C'est passé à deux doigts le 26/08. Ces gardes travaillent donc au
// FORFAIT SEUL, comme les écrans qu'elles doublent.

import { canDo, planEffectif, resolvePlan, PLANS, PLAN_LABEL } from './plans'

// Le premier forfait qui ouvre cette fonction, pour le dire au commerçant.
// ⚠️ ON NOMME LE FORFAIT MANQUANT : un refus qui dit seulement « non » envoie
// le commerçant au téléphone, et il a raison d'appeler.
export function premierPlanQuiOuvre(feature) {
  for (const plan of PLANS) {
    if (canDo(plan, feature)) return plan
  }
  return null
}

function nomDuPlan(plan) {
  return PLAN_LABEL[plan] || resolvePlan(plan) || plan
}

// Le verdict, sous une forme qu'une route rend telle quelle.
//
// `{ ok: true }` — la route continue.
// `{ ok: false, statut, code, message, plan_requis }` — la route s'arrête.
//
// ⚠️ `403`, ET PAS `401`. Le commerçant est bien authentifié : ce n'est pas
// une session invalide, c'est un droit qu'il n'a pas. Confondre les deux ferait
// déconnecter l'écran, et il recommencerait en boucle.
export function verdictForfait(commercant, feature, maintenant = new Date()) {
  // ⚠️ PAS DE COMMERÇANT = PAS DE VERDICT. On ne laisse pas passer « au cas
  // où » : une ligne introuvable est déjà traitée en amont par un 404, et si
  // elle ne l'était pas, ouvrir serait le pire des deux choix.
  if (!commercant) {
    return { ok: false, statut: 403, code: 'commercant_inconnu', message: 'Commerçant introuvable.', plan_requis: null }
  }

  const effectif = planEffectif(commercant, maintenant)
  if (canDo(effectif, feature)) return { ok: true }

  const requis = premierPlanQuiOuvre(feature)
  return {
    ok: false,
    statut: 403,
    code: 'forfait_insuffisant',
    plan_requis: requis,
    message: requis
      ? `Cette fonction fait partie de la formule ${nomDuPlan(requis)}. Tu peux l’essayer ou y passer depuis ton tableau de bord.`
      : 'Cette fonction n’est pas disponible pour ton commerce.',
  }
}

// Raccourci : rend `true` quand c'est ouvert.
export function forfaitOuvre(commercant, feature, maintenant = new Date()) {
  return verdictForfait(commercant, feature, maintenant).ok === true
}

// ⚠️ LES COLONNES SANS LESQUELLES CETTE GARDE MENT. `planEffectif` lit le
// forfait choisi, le forfait en essai et la date d'inscription : il en manque
// une et la garde se trompe EN SILENCE, sans lever d'erreur.
//
//   • `plan` absent      → tout le monde retombe en Exister, et la boutique
//                          ferme pour des commerçants qui paient.
//   • `created_at` absent → `degustationEnCours` rend false, l'essai s'éteint,
//                          et un commerçant en dégustation se fait refuser ce
//                          que son écran vient de lui ouvrir.
//   • `essai_plan` absent → même effet, sans le moindre message d'erreur.
//
// Exporté pour que le banc puisse vérifier chaque `select` appelant plutôt que
// de recopier la liste à la main.
export const COLONNES_GARDE = ['plan', 'essai_plan', 'created_at']
