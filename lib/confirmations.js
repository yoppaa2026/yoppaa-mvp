// ─── Les questions qu'on pose avant d'agir, partout dans le tableau de bord ──
//
// ⚠️ CE QU'ON REMPLACE. Vingt-cinq `window.confirm()` vivaient dans le tableau
// de bord. Le défaut trouvé par Alex le 15/08 sur l'annulation d'un rendez-vous
// n'était donc pas isolé : DEUX autres portaient exactement le même mal, celui
// où le sens n'est pas dans le bouton mais dans une légende à côté.
//
//   « OK = supprimer uniquement les 3 créneaux libres »
//   « OK = remplacer · Annuler = abandonner »
//
// Un bouton qui s'appelle « OK » ne dit rien de ce qu'il déclenche, et sur un
// geste destructif ça se paie. Ici, chaque bouton PORTE SA PHRASE.

// La forme la plus courante : une question, un geste, et la sortie sans effet.
//
// ⚠️ LA SORTIE SANS EFFET EXISTE TOUJOURS, ET TOUJOURS EN DERNIER. Une fenêtre
// sans issue force la main, et c'est exactement ce qu'un commerçant pressé
// finira par cliquer au hasard.
export function confirmationSimple({ titre, message = '', details = null, action, ton = 'danger', retour = 'Ne rien faire' }) {
  return {
    titre,
    message,
    details,
    actions: [
      { valeur: 'oui', ton, label: action },
      { valeur: 'non', ton: 'neutre', label: retour },
    ],
  }
}

// Quand il y a VRAIMENT deux gestes possibles, on les nomme tous les deux.
// C'est le cas qui produisait les « OK = ceci · Annuler = cela ».
export function confirmationDeuxGestes({ titre, message = '', details = null, premier, second, tonPremier = 'danger', tonSecond = 'principal' }) {
  return {
    titre,
    message,
    details,
    actions: [
      { valeur: 'premier', ton: tonPremier, label: premier },
      { valeur: 'second', ton: tonSecond, label: second },
      { valeur: 'non', ton: 'neutre', label: 'Ne rien faire' },
    ],
  }
}

// ⚠️ CE QUI NE DOIT PAS ÊTRE CONFIRMÉ, ET C'EST AUSSI IMPORTANT QUE LE RESTE.
// Un geste fréquent et réversible ne se fait pas confirmer : douze fenêtres par
// jour deviennent un réflexe, et le jour où la fenêtre compte vraiment, plus
// personne ne la lit. La liste est courte et se justifie une par une.
export const GESTES_SANS_CONFIRMATION = [
  'honore',            // fin normale d'un rendez-vous, plusieurs fois par jour
  'activer_article',   // une bascule se rebascule
  'reordonner_photo',  // se refait dans l'autre sens
  'enregistrer',       // la barre d'enregistrement joue déjà ce rôle
]

// Vrai quand la question mérite d'être posée. Détruire, notifier un client ou
// perdre de la saisie : oui. Basculer un interrupteur : non.
export function meriteConfirmation(geste) {
  return !GESTES_SANS_CONFIRMATION.includes(geste)
}
