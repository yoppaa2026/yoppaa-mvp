// LE MENU LU, CÔTÉ SERVEUR SEULEMENT (13/10).
//
// 🔴 POURQUOI UNE EMPREINTE. Une correction relit les pages (décision
// d'Alex) et ne compte pas dans le quota. Sans lien avec une vraie lecture,
// « corriger » deviendrait une lecture GRATUITE de n'importe quel menu, en
// boucle. La lecture note donc dans le journal un identifiant ET l'empreinte
// de ses pages ; une correction n'est acceptée que pour cette lecture, avec
// ces mêmes pages, le jour même, et dix fois au plus.
//
// ⚠️ `node:crypto` : ce module ne doit jamais être importé par un écran.

import { createHash, randomUUID } from 'node:crypto'

/** L'empreinte des pages envoyées (type et contenu, dans l'ordre). */
export function empreinteDocuments(documents = []) {
  const h = createHash('sha256')
  for (const d of documents) { h.update(String(d?.type || '')); h.update('\n'); h.update(String(d?.data || '')); h.update('\n') }
  return h.digest('hex').slice(0, 32)
}

/** Ce que la lecture et ses corrections écrivent dans `occasion`. */
export function occasionDeLecture(lectureId, empreinte) {
  return `lecture:${lectureId}:${empreinte}`
}

export const nouvelleLecture = () => randomUUID()

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
