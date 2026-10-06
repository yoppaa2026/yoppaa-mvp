// Le logo provisoire en IMAGE (PNG 512 px), pour le navigateur.
//
// ⚠️ DÉPLACÉ DE L'INSCRIPTION LE 06/10. L'étape « Visuels » de l'inscription
// a quitté le parcours (décision d'Alex : « alléger le signup ») ; elle était
// le SEUL endroit où l'on prêtait un logo au commerçant qui n'en a pas. Le
// service vit désormais au Profil du tableau de bord, et le tracé reste dans
// `lib/logo-provisoire.js` (un SVG, testable au banc).

import { logoProvisoireSvg } from './logo-provisoire.js'

// Le SVG dessiné sur un canevas, puis rendu en PNG. Une data URI plutôt qu'un
// blob object URL : pas d'URL à révoquer, donc pas de fuite si la génération
// échoue en cours de route.
export async function logoProvisoirePng({ nom, type, choix = null }) {
  const svg = logoProvisoireSvg({ nom, type, taille: 512, symbole: choix?.symbole, teinte: choix?.teinte })
  const image = new Image()
  image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('SVG illisible'))
  })
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 512
  canvas.getContext('2d').drawImage(image, 0, 0, 512, 512)
  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png', 0.95))
}
