// UNE ACTU PAR SEMAINE DANS LE GOOD MORNING, POUR EXISTER (17/10).
//
// ✅ Règle d'Alex (01/07, anti-cannibalisation de Communiquer) : le palier
// Exister publie UNE actu par semaine calendaire (lundi-dimanche), et elle
// paraît dans le Good Morning Yoppers (Exister n'a pas de page d'actus sur sa
// fiche). Le 17/10, Alex : « l'onglet Actu est grisé alors qu'il doit pouvoir
// publier dans le GMY 1× par semaine ».
//
// 🔴 LA RÈGLE N'ÉTAIT TENUE QUE PAR L'ÉCRAN. Le cron du matin l'écrivait en
// toutes lettres (« déjà validé côté saveActu, pas ici »), et l'envoi aux
// favoris ne la regardait pas. Une écriture directe passait les deux. Elle vit
// désormais ICI, et l'écran, l'envoi aux favoris et le cron l'appliquent.
//
// ⚠️ EN CAS DE DOUBLON, LA PREMIÈRE CRÉÉE PASSE (`created_at`, puis `id`) :
// une règle déterministe, la même partout, qui ne dépend pas de l'ordre de
// lecture.
//
// ⚠️ MODULE PUR.

import { jourCivilPlus } from './timezone.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/

// Le lundi de la semaine d'un jour 'YYYY-MM-DD' (semaine belge, lundi-dimanche).
export function lundiDeLaSemaine(jour) {
  const j = String(jour || '').slice(0, 10)
  if (!DATE.test(j)) return null
  const dow = new Date(`${j}T12:00:00Z`).getUTCDay() // 0 = dimanche
  return jourCivilPlus(j, dow === 0 ? -6 : 1 - dow)
}
export function memeSemaine(a, b) {
  const la = lundiDeLaSemaine(a)
  return Boolean(la) && la === lundiDeLaSemaine(b)
}

const avant = (x, y) => {
  const cx = String(x.created_at || ''), cy = String(y.created_at || '')
  if (cx !== cy) return cx < cy
  return String(x.id) < String(y.id)
}

/**
 * L'actu GMY qui empêche `actu` de passer cette semaine, ou null.
 * @param actu    { id, date_debut, created_at? } — la candidate (id absent = nouvelle)
 * @param autres  les actus GMY du MÊME commerce { id, date_debut, created_at, titre? }
 * Une nouvelle actu (sans id ni created_at) cède devant toute autre de la semaine.
 */
export function conflitSemaineGmy(actu, autres = []) {
  if (!actu) return null
  const neuve = !actu.id
  return (Array.isArray(autres) ? autres : []).find(a => a && a.id !== actu.id
    && memeSemaine(a.date_debut, actu.date_debut)
    && (neuve || avant(a, actu))) || null
}

/**
 * Les actus GMY retenues : tout pour qui n'a pas la limite, une par semaine et
 * par commerce pour qui l'a (`limite(commercantId)` → true pour Exister).
 * @param candidates  les actus à diffuser { id, commercant_id, date_debut, created_at }
 * @param toutesGmy   TOUTES les actus GMY de ces commerces (pour voir la semaine entière)
 */
export function actusGmyRetenues(candidates = [], toutesGmy = [], limite = () => false) {
  return (Array.isArray(candidates) ? candidates : []).filter(a => {
    if (!limite(a.commercant_id)) return true
    const siennes = (toutesGmy || []).filter(x => x.commercant_id === a.commercant_id)
    return !conflitSemaineGmy(a, siennes)
  })
}

// ⚠️ SANS DATE DE FIN, UNE ACTU N'ENTRE JAMAIS DANS LE GOOD MORNING : le cron
// ne retient que les actus dont la fenêtre couvre le jour. L'écran l'exige.
export function erreurActuGmy({ inclus_gmy, date_debut, date_fin } = {}) {
  if (!inclus_gmy) return null
  if (!DATE.test(String(date_fin || ''))) return 'Indique jusqu’à quand ton actu reste en ligne : sans date de fin, elle n’entre pas dans le Good Morning.'
  if (DATE.test(String(date_debut || '')) && date_fin < date_debut) return 'La date de fin doit être le même jour ou après la date de début.'
  return null
}
