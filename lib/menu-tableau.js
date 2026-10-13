// UN MENU EN TABLEAU : CSV OU EXCEL (13/10, Alex : « oui csv et excel »).
//
// Un tableau se lit sans erreur de lecture (pas de prix coupé, pas de photo
// floue) et coûte moins qu'une image. Le navigateur le transforme en TEXTE
// (une ligne par rangée, cellules séparées par « | »), puis l'envoie comme
// une page de type `text/csv` ; le serveur le donne à Claude comme du texte.
//
// ⚠️ LE CSV D'EXCEL EN BELGIQUE est souvent en encodage Windows (« é » devient
// illisible en UTF-8) et séparé par des « ; ». On décode d'abord en UTF-8
// strict, puis en Windows-1252 si ça échoue, et on garde le texte tel quel :
// le modèle lit « ; » comme « , ».
//
// ⚠️ MODULE PUR : il n'importe pas la bibliothèque Excel (elle se charge à la
// demande dans l'écran), et le banc l'exécute.

export const TYPE_TABLEAU = 'text/csv'
// Un menu de 300 articles tient en 30 ko ; au-delà, ce n'est plus un menu, et
// le texte coûterait cher en lecture. Borné AUSSI au serveur.
export const TAILLE_MAX_TABLEAU = 200_000
export const LIGNES_MAX_TABLEAU = 2000
export const FEUILLES_MAX = 10

const TYPES_IMAGE = ['image/jpeg', 'image/png', 'image/webp']
const extension = (nom) => (String(nom || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || ''

/**
 * Ce qu'est un fichier choisi : 'image' | 'pdf' | 'csv' | 'excel', ou
 * { refus } avec la phrase à afficher.
 * ⚠️ L'EXTENSION D'ABORD pour les tableaux : Windows annonce souvent un CSV
 * comme `application/vnd.ms-excel`, le même type qu'un vieux .xls.
 */
export function genreDuFichier(f) {
  const ext = extension(f?.name)
  if (ext === 'csv') return 'csv'
  if (ext === 'xlsx') return 'excel'
  if (['xls', 'ods', 'numbers', 'xlsm', 'xlsb'].includes(ext)) {
    return { refus: `« ${f?.name} » : enregistre ce fichier en .xlsx ou en CSV, puis réessaie.` }
  }
  const type = String(f?.type || '')
  if (TYPES_IMAGE.includes(type)) return 'image'
  if (type === 'application/pdf') return 'pdf'
  return { refus: `« ${f?.name || 'fichier'} » : envoie une photo (JPEG, PNG, WebP), un PDF ou un tableau (Excel .xlsx, CSV).` }
}

/** Le texte d'un CSV, quel que soit son encodage (UTF-8, sinon Windows). */
export function decoderCsv(octets) {
  const brut = octets instanceof Uint8Array ? octets : new Uint8Array(octets || [])
  let texte
  try { texte = new TextDecoder('utf-8', { fatal: true }).decode(brut) }
  catch { texte = new TextDecoder('windows-1252').decode(brut) }
  return texte.replace(/^﻿/, '')
}

/** Une cellule d'Excel, en texte : un nombre garde son point, une date son jour. */
function cellule(v) {
  if (v === null || v === undefined) return ''
  // ⚠️ UNE DATE D'EXCEL N'EST PAS UN INSTANT : c'est un jour du calendrier,
  // que la bibliothèque pose à minuit UTC. Ses champs UTC SONT ce jour ; le
  // convertir en heure de Bruxelles n'aurait aucun sens ici.
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ''
    const d2 = (n) => String(n).padStart(2, '0')
    return `${v.getUTCFullYear()}-${d2(v.getUTCMonth() + 1)}-${d2(v.getUTCDate())}`
  }
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  return String(v).replace(/\s+/g, ' ').replace(/\|/g, '/').trim()
}

/**
 * Les feuilles d'un fichier Excel ([{ sheet, data: lignes }]) en texte :
 * « Feuille : Pizzas », puis une ligne par rangée, cellules séparées par
 * « | ». Les rangées vides tombent.
 */
export function feuillesEnTexte(feuilles = []) {
  const morceaux = []
  for (const f of (Array.isArray(feuilles) ? feuilles : []).slice(0, FEUILLES_MAX)) {
    const lignes = (Array.isArray(f?.data) ? f.data : [])
      .map(r => (Array.isArray(r) ? r : []).map(cellule))
      .filter(r => r.some(c => c !== ''))
      .slice(0, LIGNES_MAX_TABLEAU)
      .map(r => r.join(' | ').replace(/(\s\|\s)+$/, ''))
    if (lignes.length === 0) continue
    morceaux.push([`Feuille : ${cellule(f?.sheet) || 'sans nom'}`, ...lignes].join('\n'))
  }
  return morceaux.join('\n\n')
}

/** Un CSV, propre : rangées vides retirées, longueur bornée en lignes. */
export function csvEnTexte(texte) {
  return String(texte || '').split(/\r\n|\n|\r/).filter(l => l.replace(/[;,\s]/g, '') !== '').slice(0, LIGNES_MAX_TABLEAU).join('\n')
}

/** Le texte en base64 (UTF-8), pour voyager comme une page. */
export function texteEnBase64(texte) {
  const octets = new TextEncoder().encode(String(texte || ''))
  let bin = ''
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** Le texte d'une page tableau reçue (base64 UTF-8). */
export function texteDeBase64(data) {
  const bin = atob(String(data || ''))
  const octets = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i)
  return new TextDecoder('utf-8').decode(octets)
}
