// LES MOYENS DE PAIEMENT PROPOSÉS PAR STRIPE CHECKOUT, SELON L'ENDROIT (02/10).
//
// 🔴 BANCONTACT EST RETIRÉ DANS L'APP NATIVE, ET SEULEMENT LÀ. Bancontact
// renvoie vers l'app ou le site de la banque. Dans l'app installée depuis un
// store, la page de paiement vit dans la WebView : au retour de la banque,
// l'app restait figée sur un écran mort ALORS QUE LA COMMANDE ÉTAIT PAYÉE
// (constaté le 22/09, gelé pendant la revue de Google). Depuis le 02/10 la
// plateforme encaisse de vrais euros : un client payé et bloqué, c'est un
// client perdu et un commerçant qui ne voit pas sa commande.
//
// ⚠️ C'EST LA VOIE COURTE, DÉCIDÉE PAR ALEX LE 02/10 : la carte (et Apple Pay
// ou Google Pay, qui passent par elle) reste offerte dans l'app, et Bancontact
// reste offert partout ailleurs (navigateur, PWA). La voie longue, ouvrir le
// paiement dans le navigateur du téléphone et revenir dans l'app, demande une
// nouvelle version (`@capacitor/browser`) : quand elle sera publiée, l'app
// pourra reprendre Bancontact ici, en un seul endroit.
//
// ⚠️ LE DRAPEAU VIENT DU NAVIGATEUR, ET C'EST SANS DANGER : il ne décide que
// des boutons de paiement proposés au client lui-même. Un client qui le
// falsifie ne gagne rien d'autre qu'un Bancontact qui bloquerait son app.
// Seul un `true` strict retire Bancontact : une valeur absente ou bizarre
// garde le chemin web, qui fonctionne partout.

export const MOYENS_WEB = ['card', 'bancontact']
export const MOYENS_APP_NATIVE = ['card']

/** Le champ du corps de requête qui dit « je viens de l'app native ». */
export const CHAMP_APP_NATIVE = 'app_native'

/** Vrai seulement si le corps de la requête l'affirme explicitement. */
export function depuisAppNative(corps) {
  return corps?.[CHAMP_APP_NATIVE] === true
}

/** Les moyens à passer à `payment_method_types`. Toujours une copie. */
export function moyensPaiementCheckout(corps) {
  return depuisAppNative(corps) ? [...MOYENS_APP_NATIVE] : [...MOYENS_WEB]
}
