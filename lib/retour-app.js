// LE RETOUR DEPUIS UN LIEN D'EMAIL, ET CE QU'ON PEUT HONNÊTEMENT EN DIRE.
//
// 🔴 CE QU'ALEX A VU (30/08). Il annule un rendez-vous depuis le lien reçu par
// email. iOS ouvre le lien dans SAFARI, pas dans l'application installée sur son
// écran d'accueil. Il annule, clique « Retour à Yoppaa »… et reste dans Safari,
// devant une application qui ne le reconnaît pas et lui redemande sa position.
//
// ⚠️ CE QU'ON NE PEUT PAS FAIRE, ET IL FAUT LE DIRE PLUTÔT QUE DE BRICOLER.
// Une page web n'a AUCUN moyen d'ouvrir une application installée sur iOS. Pas
// de `window.open` qui marche, pas de schéma d'URL sans application native, pas
// de lien universel sans compte développeur Apple et sans fichier
// `apple-app-site-association`. Un bouton « Ouvre l'application » qui ne ferait
// rien serait pire que pas de bouton du tout.
//
// ⚠️ CE QU'ON PEUT FAIRE : DIRE OÙ ON EST. Le Yopper ne sait pas qu'il est dans
// son navigateur, il croit être dans l'application. C'est ça qui rend l'écran
// incompréhensible : il ne comprend pas pourquoi « son » application a oublié
// qui il est. Une phrase suffit, et elle ne promet rien qu'on ne tienne pas.

// L'application tourne-t-elle en mode autonome (installée sur l'écran
// d'accueil) plutôt que dans un onglet de navigateur ?
//
// ⚠️ `navigator.standalone` EST LE SEUL SIGNAL SUR IPHONE : Safari n'a jamais
// implémenté `display-mode: standalone` pour les applications ajoutées à
// l'écran d'accueil. Regarder uniquement `matchMedia` répondait donc « tu es
// dans un navigateur » à quelqu'un qui était bien dans l'application.
//
// Rend `null` quand la question n'a pas de sens (rendu serveur) : « on ne sait
// pas » n'est pas « non », et afficher un avertissement au rendu serveur le
// ferait clignoter à chaque chargement.
export function estDansLApp() {
  if (typeof window === 'undefined') return null
  try {
    if (window.navigator?.standalone === true) return true
    return !!window.matchMedia?.('(display-mode: standalone)')?.matches
  } catch {
    return null
  }
}

// CE QU'ON DIT À QUELQU'UN QUI EST ARRIVÉ PAR SON NAVIGATEUR.
//
// ⚠️ ON NOMME LA CAUSE, PAS LE SYMPTÔME. « Reconnecte-toi » laisse croire à une
// panne ; « tu es dans ton navigateur » explique pourquoi rien n'est là où il
// l'attend, et le geste qui suit devient évident.
//
// Rend `null` quand on est déjà dans l'application, ou quand on ne sait pas :
// une phrase affichée à tort déplace le problème au lieu de le régler.
export function messageHorsApp(dansLApp = estDansLApp()) {
  if (dansLApp !== false) return null
  return 'Tu es dans ton navigateur : les liens d’email s’y ouvrent toujours. '
    + 'Ouvre Yoppaa depuis ton écran d’accueil pour retrouver tes commandes, '
    + 'tes rendez-vous et ta position.'
}

// ─── « SESSION EXPIRÉE » NE SE DIT QUE SI UNE SESSION A EXISTÉ ──────────────
//
// 🔴 LE BANDEAU MENTAIT, ET IL INQUIÉTAIT POUR RIEN. Sur un navigateur où le
// Yopper ne s'est JAMAIS connecté, il n'y a pas d'expiration : il y a une
// absence. Les deux n'appellent ni la même phrase ni la même réaction, et
// annoncer une expiration à quelqu'un qui n'a jamais eu de session lui fait
// croire qu'il a perdu quelque chose.
//
// Fonction PURE, et c'est voulu : la règle se mesure au banc, pas dans un `if`
// perdu au milieu d'un rendu.
export function libelleAccesPerdu({ dejaConnecte = false } = {}) {
  if (dejaConnecte) {
    return {
      titre: 'Session expirée',
      texte: 'Reconnecte-toi pour retrouver tes commandes et tes rendez-vous. Rien n’est perdu 🟣',
      bouton: 'Se reconnecter',
    }
  }
  // ⚠️ « CONNECTE-TOI », PAS « RECONNECTE-TOI » : le préfixe suppose une
  // première fois qui n'a pas eu lieu sur cet appareil.
  return {
    titre: 'Pas encore connecté ici',
    texte: 'Connecte-toi sur ce navigateur pour retrouver tes commandes et tes rendez-vous. Rien n’est perdu 🟣',
    bouton: 'Se connecter',
  }
}
