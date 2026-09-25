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

// 🔴 QUAND IL N'Y A RIEN À DÉCIDER, UN SEUL BOUTON (Alex, 08/09, capture à
// l'appui). La fenêtre « Rien ne peut être copié sur ces jours » proposait
// « J'ai compris » ET « Ne rien faire » : deux boutons pour le même effet,
// c'est-à-dire aucun. Le commerçant cherche la différence, il n'y en a pas.
//
// ⚠️ CE N'EST PAS UNE FENÊTRE SANS ISSUE : son unique bouton EST la sortie.
// La règle du « toujours une sortie sans effet » vaut pour une QUESTION ; ici,
// on annonce, on ne demande rien.
export function confirmationInfo({ titre, message = '', details = null, action = 'J’ai compris' }) {
  return {
    titre,
    message,
    details,
    actions: [
      { valeur: 'oui', ton: 'principal', label: action },
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

// ─── COMBIEN DE TEMPS ON LAISSE UN MESSAGE À L'ÉCRAN ────────────────────────
//
// 🔴 POURQUOI (Alex, 25/09) : « le message court de la copie d'article
// s'affiche une demi-seconde, impossible à lire ». Le minuteur était le vrai
// coupable — voir plus bas — mais la durée fixe en était complice : trois
// secondes suffisent pour « Article ajouté », pas pour une phrase de soixante-
// dix caractères qui nomme une copie et ce qui ne l'a pas suivie.
//
// ⚠️ UN MESSAGE SE LIT À LA VITESSE OÙ ON LIT. On part du plancher qui va bien
// aux messages courts, et on ajoute du temps par caractère. Le plafond existe
// parce qu'un message qui reste huit secondes devient un meuble : s'il faut
// plus que ça, ce n'est plus un message éphémère, c'est une fenêtre.
//
// ⚠️ ET ÇA NE REMPLACE PAS L'ANNULATION DU MINUTEUR PRÉCÉDENT. Sans elle,
// allonger la durée ne ferait qu'agrandir la fenêtre pendant laquelle un
// ancien minuteur peut effacer le message courant.
export const TOAST_MINIMUM = 3000
export const TOAST_MAXIMUM = 8000

export function dureeLecture(message) {
  const texte = String(message ?? '')
  // ~60 ms par caractère : un rythme de lecture tranquille, celui de quelqu'un
  // qui travaille en même temps et lit du coin de l'œil.
  const calcule = TOAST_MINIMUM + texte.length * 60
  return Math.min(TOAST_MAXIMUM, Math.max(TOAST_MINIMUM, calcule))
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
