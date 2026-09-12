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

// Les services publics ont été retirés du produit (Alex, 09/08) : le Good
// Morning ne sert plus que des commerçants, la règle d'éligibilité qui les
// filtrait n'a plus d'objet.

// Les codes postaux d'une commune, sous une forme comparable.
export function codesPostauxDe(commune) {
  return new Set(commune?.codes_postaux || [])
}

// ─── QUI REÇOIT LE GOOD MORNING D'UNE COMMUNE ──────────────────────────────
//
// 🔴 LE DÉFAUT MESURÉ LE 12/09 : sur 23 Yoppers, 18 avaient CHOISI leur
// commune, et UN SEUL recevait le Good Morning. Le cron ne ciblait que
// `clients.code_postal`, une colonne posée AU PASSAGE par la route des tags
// OneSignal, en best-effort. Celui qui avait répondu « je suis à Mettet » sans
// jamais activer les notifications restait donc invisible : l'application
// savait où il habitait, et le cron l'ignorait.
//
// ⚠️ DEUX SOURCES DE VÉRITÉ, DONC DEUX LECTURES. On ne choisit pas l'une contre
// l'autre et on n'invente surtout pas le code postal manquant : une commune en
// compte plusieurs, et deviner lequel serait écrire à la place du Yopper.
//
// ⚠️ DEUX REQUÊTES PLUTÔT QU'UN `.or()` CONCATÉNÉ. Coller des valeurs dans un
// filtre PostgREST, c'est la forme même de l'injection, et ce projet en a déjà
// un exemple qu'il surveille. Deux lectures franches, puis une fusion, ne
// coûtent rien et ne se relisent pas avec inquiétude.
//
// Le dédoublonnage est indispensable : quelqu'un peut porter À LA FOIS un code
// postal de la commune et l'avoir choisie. Sans lui, il recevrait deux fois.
export function fusionnerIds(...listes) {
  const vus = new Set()
  for (const liste of listes) {
    for (const ligne of liste || []) {
      const id = ligne?.id
      if (id) vus.add(id)
    }
  }
  return [...vus]
}
