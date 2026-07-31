// lib/bons-cadeaux.js
//
// Helpers PURS du module Bons cadeaux (partagés front + serveur).
// Décisions Alex 31/07 : montant libre, validité 12 mois par défaut
// (réglable par commerçant), solde utilisable en plusieurs fois,
// en ligne (tunnel) ET au comptoir.

export const BON_MONTANT_MIN = 5
export const BON_MONTANT_MAX = 250

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) : le code se lit
// au téléphone et se recopie au comptoir sans hésitation.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

// Code façon 'BC-7K2M-9XQ4' : lisible, dictable, ~1 000 milliards de
// combinaisons (l'API de vérification est rate-limitée en plus).
export function genererCodeBon() {
  let bloc = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
  return `BC-${bloc()}-${bloc()}`
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
