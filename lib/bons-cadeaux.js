// lib/bons-cadeaux.js
//
// Helpers PURS du module Bons cadeaux (partagés front + serveur).
// Décisions Alex 31/07 : montant libre, validité 12 mois par défaut
// (réglable par commerçant), solde utilisable en plusieurs fois,
// en ligne (tunnel) ET au comptoir.

import { euros } from './montants'

export const BON_MONTANT_MIN = 5
export const BON_MONTANT_MAX = 250

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) : le code se lit
// au téléphone et se recopie au comptoir sans hésitation.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

// Code façon 'BC-7K2M-9XQ4' : lisible, dictable, 31^8 ≈ 850 milliards de
// combinaisons (l'API de vérification est rate-limitée en plus).
//
// ⚠️ TIRAGE CRYPTOGRAPHIQUE, PAS Math.random(). Un bon cadeau est un
// instrument au porteur : qui devine un code encaisse l'argent de quelqu'un
// d'autre. Math.random() s'appuie sur xorshift128+, dont l'état interne se
// reconstitue à partir de quelques sorties observées : il suffisait d'acheter
// deux ou trois bons pour commencer à deviner ceux générés juste après, tous
// clients confondus puisque c'est le même processus serveur qui les tire.
// Le nombre de combinaisons ne protège de rien si la suite est prévisible.
//
// Le tirage rejette les octets qui déborderaient : 256 n'est pas un multiple
// de 31, et prendre le reste ferait sortir les huit premiers caractères de
// l'alphabet plus souvent que les autres. Un biais suffit à réduire l'espace
// réellement à couvrir pour qui cherche.
function tirerCaracteres(nombre) {
  const source = globalThis.crypto
  if (!source?.getRandomValues) {
    // Aucun repli sur un générateur faible : mieux vaut refuser d'émettre un
    // bon que d'en émettre un devinable.
    throw new Error('Tirage aléatoire sûr indisponible : bon cadeau non généré.')
  }
  const limite = Math.floor(256 / ALPHABET.length) * ALPHABET.length  // 248
  const sortie = []
  while (sortie.length < nombre) {
    const octets = new Uint8Array(nombre * 2)
    source.getRandomValues(octets)
    for (const o of octets) {
      if (o >= limite) continue                 // rejeté, sinon biais
      sortie.push(ALPHABET[o % ALPHABET.length])
      if (sortie.length === nombre) break
    }
  }
  return sortie.join('')
}

export function genererCodeBon() {
  const c = tirerCaracteres(8)
  return `BC-${c.slice(0, 4)}-${c.slice(4)}`
}

// Normalise la saisie utilisateur ('bc 7k2m 9xq4', 'BC7K2M9XQ4'…) vers le
// format canonique stocké en base. Retourne null si ça ne ressemble pas à un code.
export function normaliserCodeBon(saisie) {
  const brut = String(saisie || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const sans = brut.startsWith('BC') ? brut.slice(2) : brut
  if (!/^[A-Z0-9]{8}$/.test(sans)) return null
  return `BC-${sans.slice(0, 4)}-${sans.slice(4)}`
}

// Remise applicable sur une commande : jamais plus que le solde ni que le dû,
// et si un reste à payer subsiste il doit être >= 0,50 € (minimum Stripe).
// Dans ce cas on plafonne la remise pour laisser exactement 0,50 € à payer
// (le solde résiduel reste sur le bon, utilisable la fois suivante).
export function calculerRemiseBon(solde, totalDu) {
  const s = Math.round(Number(solde) * 100)
  const t = Math.round(Number(totalDu) * 100)
  if (s <= 0 || t <= 0) return 0
  let remise = Math.min(s, t)
  const reste = t - remise
  if (reste > 0 && reste < 50) remise = t - 50
  return Math.max(0, remise) / 100
}

export function bonExpire(bon, now = new Date()) {
  return !!bon?.expires_at && new Date(bon.expires_at) < now
}

// CE QUI RESTE SUR LE BON, ET À QUOI ÇA SERT.
//
// 🔴 LA PHRASE S'ARRÊTAIT À « Il restera 18,10 € sur ton bon. » Un solde dont on
// ignore l'usage est un solde qu'on oublie, et un bon oublié est de l'argent que
// le commerçant a encaissé sans jamais revoir le client. Le dire, c'est
// transformer un reliquat en visite.
//
// ⚠️ ELLE VIVAIT EN DEUX EXEMPLAIRES, un par tunnel, et sous deux formes
// différentes : « Il restera X sur ton bon. » côté rendez-vous, « · il restera
// X sur ton bon » côté boutique. Deux écritures d'une même phrase finissent
// toujours par dire deux choses, et c'est le motif qui revient le plus souvent
// sur ce projet.
//
// ⚠️ ON NOMME LE COMMERCE quand on le connaît : « chez Ciseaux et Soins » dit
// où l'argent est utilisable, ce que « pour une prochaine fois » laisse deviner.
// Un bon cadeau n'est valable QUE chez son commerçant, et rien ne le rappelait.
//
// Rend '' quand il ne reste rien : une phrase sur un solde nul serait du bruit.
export function libelleResteBon(reste, nomCommercant = '') {
  const r = Math.round(Number(reste || 0) * 100) / 100
  if (!Number.isFinite(r) || r <= 0) return ''
  // ⚠️ `euros()` ET PAS UN `toFixed` À LA MAIN : c'est lui qui met la virgule et
  // l'espace INSÉCABLE, sans quoi le « € » se retrouve seul en début de ligne
  // sur un téléphone. Un vingt-et-unième formateur maison serait un défaut, pas
  // un détail.
  const chez = String(nomCommercant || '').trim()
  return chez
    ? `Il restera ${euros(r)} sur ton bon, pour une prochaine fois chez ${chez}.`
    : `Il restera ${euros(r)} sur ton bon, pour une prochaine fois.`
}
