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
// ⚠️ Ajouté le 26/08. Le compte s'écrit `yoppaa.app`, avec un POINT : c'est le
// genre de détail qui se recopie de travers une fois sur deux, et un profil
// social qui pointe dans le vide décrédibilise plus qu'il ne sert.
export const INSTAGRAM_URL = 'https://www.instagram.com/yoppaa.app/'

// Les profils publics, dans l'ordre où on les affiche. Ce fichier a été écrit
// pour ce moment-là : ajouter une ligne ici suffit à faire apparaître le
// réseau dans le pied de la landing, dans la section réseaux ET dans le
// `sameAs` du balisage Google, sans toucher à quoi que ce soit d'autre.
export const RESEAUX = [
  { nom: 'Facebook', url: FACEBOOK_URL },
  { nom: 'Instagram', url: INSTAGRAM_URL },
]

// Les adresses seules, pour le `sameAs` de schema.org.
export const RESEAUX_URLS = RESEAUX.map(r => r.url)
