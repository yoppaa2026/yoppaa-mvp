// DANS QUEL MONDE VIT UN COMPTE STRIPE, ET COMMENT ON LE SAIT.
//
// Stripe a deux mondes etanches, test et live. Le mode appartient a la
// PLATEFORME, jamais au commercant : la cle `STRIPE_SECRET_KEY` commence par
// `sk_test_` ou `sk_live_`, et TOUS les comptes connectes suivent. Il est
// impossible d avoir un commercant en live pendant qu un autre reste en test.
//
// 🔴 CE QUI SE PASSE LE JOUR DE LA BASCULE. Les `stripe_account_id` crees en
// test pointent vers des comptes qui N EXISTENT PAS dans le monde live. Pire
// que casse : INVISIBLE. Le tableau de bord affiche « Continuer l onboarding »
// sur un compte introuvable, et `create-account-link` saute la creation parce
// que l identifiant est deja la. Le commercant ne peut donc PLUS JAMAIS se
// connecter, quoi qu il fasse, et rien a l ecran ne lui dit pourquoi.
//
// 🔴 POURQUOI ON NE LIT PAS LE MESSAGE D ERREUR DE STRIPE. Ce serait le reflexe,
// et c est le piege du 16/09 : une garde ecrite de memoire ne verifie que ma
// memoire. Le code exact que Stripe renvoie sur un compte d un autre monde ne
// peut se prouver qu en le provoquant, en live, avec de vrais comptes. Alors on
// ne devine rien : ON ECRIT LE MONDE A LA NAISSANCE DU COMPTE, et on compare
// deux mots. C est certain, et ca se mesure au banc.
//
// ⚠️ ON NE REPOND JAMAIS « live » PAR DEFAUT. Une cle absente n est pas une cle
// de production : c est une ABSENCE D INFORMATION. `isStripeTestMode()` de
// `stripe-billing.js` rend `false` sans cle, donc « live », et choisirait les
// tarifs de production sur une installation qui n a pas de Stripe du tout.
// Ici, pas de cle veut dire `null`, et `null` ne permet AUCUN verdict.

export const MODE_TEST = 'test'
export const MODE_LIVE = 'live'

// Les colonnes qu il faut avoir selectionnees pour juger. Les oublier fait
// echouer le verdict EN SILENCE : `undefined` n est pas `null`, et une colonne
// absente d un select est le defaut le plus frequent du depot (6 fois).
export const COLONNES_MODE = 'stripe_account_id, stripe_account_mode'

// Le monde d une cle, lu sur son prefixe. `null` quand on ne sait pas, et on ne
// pretend pas savoir.
export function modeDeLaCle(cle) {
  if (typeof cle !== 'string') return null
  if (cle.startsWith('sk_test_')) return MODE_TEST
  if (cle.startsWith('sk_live_')) return MODE_LIVE
  return null
}

// Le monde de la plateforme, maintenant. Prend la cle en argument pour rester
// mesurable au banc ; sans argument, lit l environnement.
export function modePlateforme(cle = process.env.STRIPE_SECRET_KEY) {
  return modeDeLaCle(cle)
}

// Les quatre verdicts possibles sur le compte connecte d un commercant.
//
// ⚠️ « INCONNU » EXISTE EXPRES, ET C EST LE PLUS IMPORTANT DES QUATRE. Un
// compte cree avant qu on note son monde n a pas de `stripe_account_mode`. On
// ne peut donc RIEN affirmer a son sujet. Le confondre avec « ok » endort ;
// le confondre avec « perdu » detacherait un compte qui marche. Alors il a son
// propre nom, il se compte, et il se regarde.
export const VERDICT = {
  AUCUN:   'aucun',    // pas de compte connecte : parcours normal, rien a dire
  OK:      'ok',       // meme monde que la plateforme
  PERDU:   'perdu',    // autre monde : le compte est inatteignable, c est certain
  INCONNU: 'inconnu',  // monde du compte non note : on ne tranche pas
}

// Le verdict sur un commercant. `mode` est le monde de la plateforme.
export function verdictCompte(commercant, mode = modePlateforme()) {
  const id = commercant?.stripe_account_id
  if (!id) return VERDICT.AUCUN

  const ne = commercant?.stripe_account_mode
  // Pas de monde note, ou pas de monde de plateforme : deux absences
  // differentes, meme conclusion. On ne sait pas, et on le dit.
  if (ne !== MODE_TEST && ne !== MODE_LIVE) return VERDICT.INCONNU
  if (mode !== MODE_TEST && mode !== MODE_LIVE) return VERDICT.INCONNU

  return ne === mode ? VERDICT.OK : VERDICT.PERDU
}

// Raccourci lisible pour le seul cas qui autorise a agir.
export function comptePerdu(commercant, mode = modePlateforme()) {
  return verdictCompte(commercant, mode) === VERDICT.PERDU
}

// Ce qu on ecrit en base quand on remet le parcours a zero.
//
// 🔴 ON NE JETTE JAMAIS L ANCIEN IDENTIFIANT. Ce detachement se declenche tout
// seul, a chaque visite du tableau de bord. Si un jour quelqu un remet la cle
// de test en production par erreur, il effacerait les liens vers les VRAIS
// comptes, un commercant apres l autre, sans un mot. L ancien identifiant part
// dans `stripe_account_id_precedent` : le parcours repart propre, et rien n est
// perdu. Une bascule se rattrape ; un identifiant efface, non.
export function detachementCompte(commercant) {
  return {
    stripe_account_id: null,
    stripe_account_id_precedent: commercant?.stripe_account_id ?? null,
    stripe_account_mode: null,
    stripe_account_charges_enabled: false,
    stripe_account_details_submitted: false,
    stripe_account_payouts_enabled: false,
  }
}

// Ce qu on ecrit a la NAISSANCE d un compte. C est l unique endroit qui remplit
// `stripe_account_mode`, et sans lui tout le reste de ce module est aveugle.
export function naissanceCompte(accountId, mode = modePlateforme()) {
  return {
    stripe_account_id: accountId,
    stripe_account_mode: mode,
  }
}

// Le message rendu au commercant. En francais, sans identifiant technique, et
// il dit CE QUI MARCHE ENCORE : sinon le commercant croit avoir tout perdu.
export function messageCompte(verdict) {
  if (verdict === VERDICT.PERDU) {
    return 'Ton compte de paiement doit etre reconnecte : Yoppaa est passe en '
      + 'mode reel. Clique sur « Connecter Stripe » pour le refaire, ca prend '
      + 'cinq minutes avec ta carte d identite et ton IBAN. Ta fiche, tes '
      + 'articles et tes clients ne bougent pas.'
  }
  if (verdict === VERDICT.INCONNU) {
    return 'Ton compte de paiement n a pas pu etre verifie. Si le parcours '
      + 'Stripe refuse de s ouvrir, previens Yoppaa : on le remet en route.'
  }
  return null
}
