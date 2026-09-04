// L'HEURE DE CHEZ NOUS, LUE UNE SEULE FOIS POUR TOUT LE MONDE.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE PIÈGE DU FUSEAU, ET IL NOUS A DÉJÀ MORDUS DEUX FOIS.
//
// Les heures réglées par un commerçant sont celles de sa pendule, en heure
// belge. `new Date()`, lui, compte en temps universel. Les comparer directement
// se trompe d'UNE heure en hiver et de DEUX en été.
//
// Et `toISOString()` ne sauve rien, il rend Greenwich : à 23 h chez nous, il
// annonce déjà le lendemain.
//
// ✅ LE REMÈDE : on demande l'heure locale à `Intl`, avec le fuseau nommé. Lui
// seul connaît les changements d'heure, et il n'y a rien à maintenir.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ POURQUOI CE FICHIER EXISTE. Ces primitives vivaient dans
// `lib/anti-gaspi.js`. Le module des délais de commande en a besoin aussi, et
// deux copies du fuseau auraient divergé au premier changement d'heure — c'est
// le défaut qu'on corrige depuis deux jours, sous toutes ses formes. Une seule
// source, deux lecteurs.

export const FUSEAU = 'Europe/Brussels'

// ⚠️ Construits UNE fois : `Intl.DateTimeFormat` est coûteux, et ces fonctions
// sont appelées pour chaque offre et chaque article de chaque écran.
const HEURE_LOCALE = new Intl.DateTimeFormat('fr-BE', {
  timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false,
})
const JOUR_LOCAL = new Intl.DateTimeFormat('fr-CA', {
  timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
})
const NOM_DU_JOUR = new Intl.DateTimeFormat('fr-BE', {
  timeZone: FUSEAU, weekday: 'long',
})

/**
 * ⚠️ MINUIT PEUT SE DIRE « 24 ». Selon la version d'ICU, `hour: '2-digit'` en
 * `hour12: false` rend « 24 » à minuit plutôt que « 00 ». Non gardé, minuit
 * vaudrait 1440 et tomberait hors de toutes les fenêtres.
 *
 * ⚠️ ELLE EST EXPORTÉE UNIQUEMENT POUR ÊTRE MESURABLE. Le Node de cette machine
 * rend « 00 », donc aucun test passant par `minutesLocales` ne peut faire
 * rougir cette garde : la mutation qui la retirait restait verte. Une garde
 * qu'on ne peut pas mesurer est une garde que le prochain supprimera en la
 * croyant morte.
 */
export function heureNormalisee(h) {
  return h === 24 ? 0 : h
}

/** Combien de minutes se sont écoulées depuis minuit, EN HEURE BELGE. */
export function minutesLocales(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  const parts = HEURE_LOCALE.formatToParts(d)
  const valeur = (type) => Number(parts.find(p => p.type === type)?.value ?? NaN)
  const h = valeur('hour')
  const min = valeur('minute')
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  return heureNormalisee(h) * 60 + min
}

/**
 * Le jour civil BELGE de cet instant, en « AAAA-MM-JJ ».
 *
 * 🔴 `toISOString().slice(0, 10)` REND LE JOUR DE GREENWICH. Entre 22 h et
 * minuit chez nous, il annonce déjà le lendemain, et une commande datée par lui
 * tombe le mauvais jour. Ce défaut a coûté trois occasions à ce projet.
 */
export function jourCivil(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  // `fr-CA` rend nativement « AAAA-MM-JJ », sans recomposition à la main.
  return JOUR_LOCAL.format(d)
}

/** « lundi », « jeudi »… tel qu'on le dirait, en heure belge. */
export function nomDuJour(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  return NOM_DU_JOUR.format(d)
}
