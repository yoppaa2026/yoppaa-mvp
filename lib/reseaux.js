// lib/reseaux.js
//
// Les comptes publics de Yoppaa. Un seul endroit, parce qu'une adresse de
// réseau social se retrouve vite recopiée dans un pied de page, un email, un
// visuel et un balisage, et qu'une seule d'entre elles finit par pointer dans
// le vide sans que personne ne s'en aperçoive.
//
// ⚠️ Ces adresses partent AUSSI dans le `sameAs` du balisage Google : c'est ce
// qui lui permet de relier la page Facebook à l'entreprise et d'afficher les
// deux comme une seule entité. Une adresse fausse ici casse ce lien en silence.
//
// Fichier PUR : importable côté client comme côté serveur.

export const FACEBOOK_URL = 'https://www.facebook.com/yoppaaapp/'

// Les profils publics, dans l'ordre où on les affiche. Ajouter Instagram ou
// LinkedIn ici les fera apparaître partout d'un coup, balisage compris.
export const RESEAUX = [
  { nom: 'Facebook', url: FACEBOOK_URL },
]

// Les adresses seules, pour le `sameAs` de schema.org.
export const RESEAUX_URLS = RESEAUX.map(r => r.url)
