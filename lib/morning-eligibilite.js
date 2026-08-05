// Qui entre dans l'édition du jour du Good Morning Yoppers.
//
// POURQUOI CE FICHIER EXISTE. Le badge « Nouveau » du bandeau s'allumait dès
// que le Yopper n'avait pas ouvert sa page du jour, sans jamais regarder s'il y
// avait quelque chose à lire (signalé par Alex, 05/08). Il promettait donc du
// contenu qui n'existait pas, et un badge qui ment deux fois ne se regarde plus
// jamais.
//
// Pour savoir s'il y a du contenu, il faut appliquer EXACTEMENT les mêmes
// règles que la page Morning. Les recopier ailleurs, c'était garantir qu'elles
// divergent au premier changement de formule : elles vivent donc ici, et les
// deux écrans les importent.

import { canDo } from '@/lib/plans'

// Codes postaux belges : 4 chiffres, extraits d'une adresse libre.
export function extraireCodePostal(adresse) {
  if (!adresse) return null
  const m = String(adresse).match(/\b(\d{4})\b/)
  return m ? m[1] : null
}

// Deals : commerçant publié, formule qui ouvre les deals ET le Morning, dans
// l'une des communes affichées.
export function commercantEligibleDeal(c, codesPostaux) {
  if (!c) return false
  if (c.statut_publication !== 'publie') return false
  if (!canDo(c.plan, 'deals') || !canDo(c.plan, 'morning')) return false
  const cp = extraireCodePostal(c.adresse)
  return !!cp && codesPostaux.has(cp)
}

// Actus : commerçant publié, formule qui ouvre l'actu GMY, même commune.
export function commercantEligibleActu(c, codesPostaux) {
  if (!c) return false
  if (c.statut_publication !== 'publie') return false
  if (!canDo(c.plan, 'actu_gmy')) return false
  const cp = extraireCodePostal(c.adresse)
  return !!cp && codesPostaux.has(cp)
}

// Services publics : jamais les nationaux (112, CEGENO), trop génériques pour
// une édition locale ; et au moins un code postal en commun.
export function servicePublicEligible(s, codesPostaux) {
  if (!s) return false
  if (s.national === true) return false
  if (!Array.isArray(s.codes_postaux) || s.codes_postaux.length === 0) return false
  return s.codes_postaux.some(cp => codesPostaux.has(cp))
}

// Les codes postaux d'une commune, sous une forme comparable.
export function codesPostauxDe(commune) {
  return new Set(commune?.codes_postaux || [])
}
