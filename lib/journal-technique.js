// LE JOURNAL TECHNIQUE (pilotage, 19/10).
//
// Ce que Vercel sait et que l'admin ne voyait pas : une tâche automatique qui
// n'a pas tourné, une page qui plante chez un client. Les deux n'étaient
// écrits que dans les journaux de Vercel, qu'on ne relit que quand quelqu'un se
// plaint. Le pilotage les lit désormais dans `journal_technique`
// (MIGRATION_PILOTAGE_19_10.sql), clé de service seulement.
//
// 🔴 ÉCRIRE ICI NE DOIT JAMAIS FAIRE ÉCHOUER CE QUI ÉCRIT. Une relance de
// facturation qui tomberait parce que son journal est indisponible serait
// pire que pas de journal du tout. Chaque fonction avale ses propres erreurs
// et rend `false`, y compris si la table n'existe pas encore.
//
// ⚠️ RIEN DE PERSONNEL. Le chemin d'une erreur d'écran est gardé SANS ses
// paramètres : une adresse peut porter un jeton, un email, un numéro de
// commande. Le message est tronqué, la pile n'est pas gardée (elle reste dans
// les journaux de Vercel).

import { clientAdmin } from './api-auth'

export const GENRES_JOURNAL = ['cron', 'erreur_ecran']
export const JOURS_DE_JOURNAL = 90

// Le chemin d'une page, sans ce qui suit « ? » ni « # ». Pur.
export function cheminSansParametres(chemin) {
  const brut = String(chemin || '').trim()
  if (!brut) return ''
  let p = brut
  try {
    // Une adresse complète : on n'en garde que le chemin.
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname
  } catch { /* adresse illisible : on retombe sur le texte coupé ci-dessous */ }
  return p.split(/[?#]/)[0].slice(0, 200)
}

// La ligne à écrire, ou null si elle n'a rien à faire au journal. Pur.
export function ligneJournal(genre, nom, detail = null) {
  if (!GENRES_JOURNAL.includes(genre)) return null
  const n = String(nom || '').trim().slice(0, 200)
  if (!n) return null
  const d = detail == null ? null : String(detail).slice(0, 500)
  return { genre, nom: n, detail: d }
}

async function ecrire(ligne, db) {
  if (!ligne) return false
  try {
    const client = db || clientAdmin()
    const { error } = await client.from('journal_technique').insert(ligne)
    if (error) {
      console.warn('[journal-technique] écriture refusée', error.message)
      return false
    }
    return true
  } catch (e) {
    console.warn('[journal-technique] écriture impossible', e?.message)
    return false
  }
}

// Une tâche automatique a travaillé (à son heure, ou forcée).
export async function noterPassageCron(chemin, detail = null, db = null) {
  return ecrire(ligneJournal('cron', chemin, detail), db)
}

// Une page a planté chez quelqu'un.
export async function noterErreurEcran({ chemin, message, ou } = {}, db = null) {
  const page = cheminSansParametres(chemin) || '(page inconnue)'
  const texte = [ou ? `[${String(ou).slice(0, 20)}]` : '', String(message || '').slice(0, 300)]
    .filter(Boolean).join(' ')
  return ecrire(ligneJournal('erreur_ecran', page, texte || null), db)
}

// Efface ce qui a plus de 90 jours. Rend le nombre de lignes effacées, ou null.
export async function purgerJournal(db = null, maintenant = new Date()) {
  try {
    const client = db || clientAdmin()
    const limite = new Date(maintenant.getTime() - JOURS_DE_JOURNAL * 24 * 3600 * 1000).toISOString()
    const { data, error } = await client.from('journal_technique').delete().lt('cree_le', limite).select('id')
    if (error) return null
    return (data || []).length
  } catch {
    return null
  }
}
