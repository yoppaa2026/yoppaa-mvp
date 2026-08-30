'use client'
// LA CONNEXION NE TOMBE QUE SI LE YOPPER LA COUPE LUI-MÊME.
//
// ⚠️ DEMANDE D'ALEX, 22/08 : « déconnexion uniquement si l'utilisateur le fait
// lui-même ». Ce n'est PAS un réglage de durée. Le jeton de rafraîchissement
// Supabase vit déjà très longtemps : ce qui tuait la session, c'est une course,
// pas une expiration.
//
// LA COURSE, ÉTABLIE LE 11/08 ET SEULEMENT À MOITIÉ REFERMÉE. Au retour de
// l'arrière-plan sur iPhone, deux mécanismes renouvellent le jeton en même
// temps. Ce jeton est à USAGE UNIQUE : le premier le consomme et en reçoit un
// neuf, le second reçoit « Invalid Refresh Token: Already Used ». La
// bibliothèque juge l'erreur définitive, EFFACE la session du stockage et émet
// `SIGNED_OUT`. Redémarrer l'application n'y change rien.
//
// `lib/fetch-yopper.js` a sérialisé LES NÔTRES de renouvellements. Mais le
// renouvellement interne d'`auth-js`, déclenché par son propre écouteur de
// visibilité, ne passe pas par nous et reste hors de portée.
//
// ⚠️ D'OÙ LE PRINCIPE ICI, QUI N'EST PAS D'EMPÊCHER LA COURSE MAIS DE SURVIVRE
// À SON RÉSULTAT. Dans la course, l'un des deux appels RÉUSSIT et son succès
// émet `TOKEN_REFRESHED` avec le jeton neuf. On garde une copie de ce couple.
// Quand la session est ensuite effacée sans que personne ne l'ait demandé, on
// la repose avec la copie. Le Yopper ne voit rien.
//
// ⚠️ CE FICHIER N'AJOUTE AUCUNE EXPOSITION. Le jeton de rafraîchissement est
// DÉJÀ dans le `localStorage` : c'est là que `persistSession: true` le range.
// On y garde une seconde copie, sous une autre clé, dans le même stockage et
// sur la même origine. Rien de nouveau ne devient lisible par personne.
//
// ⚠️ CE QUE ÇA IMPLIQUE, ET QUI EST UN CHOIX ASSUMÉ D'ALEX : sur un téléphone
// prêté ou perdu, la session reste ouverte jusqu'à une déconnexion explicite.

import { supabase } from '@/lib/supabase'

const CLE_COPIE = 'yoppaa_session_copie'
const CLE_VOLONTAIRE = 'yoppaa_deconnexion_voulue'
// ⚠️ CETTE MARQUE NE S'EFFACE JAMAIS, ET C'EST TOUT SON INTÉRÊT. Elle répond à
// une seule question : « une session a-t-elle DÉJÀ existé sur ce navigateur ? »
// Sans elle, le bandeau annonçait « SESSION EXPIRÉE » à quelqu'un qui ne s'était
// jamais connecté ici : ce n'est pas une expiration, c'est une absence, et lui
// dire qu'il a perdu quelque chose est faux ET inquiétant.
//
// ⚠️ ELLE SURVIT À LA DÉCONNEXION VOLONTAIRE, sinon quelqu'un qui se déconnecte
// puis revient serait traité comme un inconnu.
const CLE_DEJA_CONNECTE = 'yoppaa_deja_connecte'

// Au-delà, on arrête d'insister : si trois restaurations d'affilée échouent, le
// jeton est mort pour de bon et s'entêter ferait une boucle invisible.
const TENTATIVES_MAX = 3
let tentatives = 0

function ecrire(cle, valeur) {
  try { localStorage.setItem(cle, valeur) } catch { /* stockage plein : sans gravité */ }
}
function effacer(cle) {
  try { localStorage.removeItem(cle) } catch { /* sans gravité */ }
}

/** Garde le couple de jetons de la session courante. */
export function memoriserSession(session) {
  if (!session?.access_token || !session?.refresh_token) return
  ecrire(CLE_COPIE, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  }))
  // Une session vivante annule un ancien départ volontaire : sans ça, la
  // reconnexion suivante serait traitée comme une déconnexion voulue et la
  // restauration ne se ferait plus jamais.
  effacer(CLE_VOLONTAIRE)
  // Une session a existé ici : le bandeau pourra parler d'expiration sans
  // mentir. C'est le SEUL endroit qui pose cette marque, et rien ne l'efface.
  ecrire(CLE_DEJA_CONNECTE, '1')
  tentatives = 0
}

/**
 * Une session a-t-elle déjà existé sur ce navigateur ?
 *
 * ⚠️ LA QUESTION N'EST PAS « EST-IL CONNECTÉ » mais « l'a-t-il déjà été ICI ».
 * C'est ce qui distingue une expiration d'une absence, et donc « reconnecte-toi,
 * rien n'est perdu » de « connecte-toi sur ce navigateur ». Le lien d'email
 * s'ouvre dans le navigateur du téléphone, jamais dans l'application installée :
 * ce cas-là n'est pas rare, c'est le cas NORMAL.
 */
export function dejaConnecteIci() {
  try { return localStorage.getItem(CLE_DEJA_CONNECTE) === '1' } catch { return false }
}

export function lireCopieSession() {
  try {
    const brut = localStorage.getItem(CLE_COPIE)
    if (!brut) return null
    const c = JSON.parse(brut)
    return (c?.access_token && c?.refresh_token) ? c : null
  } catch {
    return null
  }
}

/**
 * ⚠️ À APPELER AVANT `supabase.auth.signOut()`, TOUJOURS. C'est la seule chose
 * qui distingue « il s'en va » de « la session est tombée toute seule ». Sans
 * ce marqueur, la restauration reconnecterait quelqu'un qui vient de cliquer
 * sur « Se déconnecter », ce qui est exactement le contraire du but.
 */
export function marquerDeconnexionVoulue() {
  ecrire(CLE_VOLONTAIRE, '1')
  effacer(CLE_COPIE)
}

export function deconnexionEtaitVoulue() {
  try { return localStorage.getItem(CLE_VOLONTAIRE) === '1' } catch { return false }
}

/**
 * FAUT-IL REPOSER LA SESSION ? Fonction PURE, sortie du reste exprès : c'est la
 * seule règle qui compte ici, et une règle qui vit dans un `if` au milieu d'un
 * appel réseau ne s'exécute jamais au banc.
 *
 * ⚠️ L'ORDRE DES TROIS REFUS N'EST PAS INDIFFÉRENT. « Il est parti de
 * lui-même » passe AVANT tout le reste : reconnecter quelqu'un qui vient de
 * cliquer sur « Se déconnecter » serait le contraire exact du but, et ce serait
 * pire que le défaut qu'on répare.
 */
export function doitRestaurer({ deconnexionVoulue = false, tentativesFaites = 0, aUneCopie = false } = {}) {
  if (deconnexionVoulue) return false
  if (!aUneCopie) return false
  return tentativesFaites < TENTATIVES_MAX
}

/**
 * Repose la session effacée par une course perdue.
 * @returns {Promise<boolean>} true si la session est revenue.
 */
export async function restaurerSession() {
  const copie = lireCopieSession()
  if (!doitRestaurer({
    deconnexionVoulue: deconnexionEtaitVoulue(),
    tentativesFaites: tentatives,
    aUneCopie: !!copie,
  })) return false

  tentatives++
  try {
    const { data, error } = await supabase.auth.setSession(copie)
    if (error || !data?.session) {
      // Un jeton refusé ne redeviendra pas valable : on jette la copie plutôt
      // que de la représenter à chaque écran.
      if (tentatives >= TENTATIVES_MAX) effacer(CLE_COPIE)
      return false
    }
    memoriserSession(data.session)
    return true
  } catch {
    return false
  }
}

/**
 * Branche la mémoire et la restauration sur les évènements d'authentification.
 * Rend la fonction de désabonnement.
 *
 * @param {(perdue: boolean) => void} surSessionPerdue prévenu UNIQUEMENT quand
 *        la restauration a échoué. Tant qu'elle réussit, l'écran n'a rien à
 *        afficher : il ne s'est rien passé pour le Yopper.
 */
export function brancherSessionPermanente(surSessionPerdue) {
  supabase.auth.getSession()
    .then(({ data }) => { if (data?.session) memoriserSession(data.session) })
    .catch(() => {})

  const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      if (session) memoriserSession(session)
      surSessionPerdue?.(false)
      return
    }
    if (event === 'SIGNED_OUT') {
      if (deconnexionEtaitVoulue()) { surSessionPerdue?.(false); return }
      const revenue = await restaurerSession()
      surSessionPerdue?.(!revenue)
    }
  })

  return () => { try { sub?.subscription?.unsubscribe() } catch { /* déjà parti */ } }
}
