// ════════════════════════════════════════════════════════════════════
// LE VERDICT DE LA JAUGE DES PAGES IMPRIMABLES.
//
// ⚠️ POURQUOI CETTE LOGIQUE N'EST PAS RESTÉE DANS L'ÉCRAN. Elle décide de ce
// qu'on lit avant d'envoyer un A4 à l'imprimante, et un papier ne se corrige
// plus. Une jauge qui annonce « tient dans la page » alors que le bas est
// coupé est PIRE que pas de jauge du tout : elle donne une confiance fausse.
// Le défaut de la veille était exactement celui-là, dans le harnais de
// mutation. Ici, la règle est une fonction pure, et `verif:kit` l'exécute.
//
// LA CONVENTION DU SIGNE, une bonne fois :
//   mm > 0  →  il MANQUE de la place, la page déborde de `mm`
//   mm <= 0 →  la page tient, et il RESTE `-mm` de blanc en bas
// ════════════════════════════════════════════════════════════════════

// ⚠️ CE SONT DES DÉCISIONS DE MISE EN PAGE, pas des constantes techniques.
// Sous 3 mm, la moindre correction de texte fera déborder à la prochaine
// relecture : la page est juste, il faut le savoir avant d'imprimer en nombre.
// Au-delà de 18 mm, le bandeau du bas décroche visiblement du corps, et la
// page a l'air inachevée : c'est de la place à reprendre, pas un succès.
export const MARGE_MINI = 3
export const MARGE_MAXI = 18

// Rend `null` tant que rien n'a été mesuré, sinon `{ etat, texte, marge }`.
//
// ⚠️ LE PIÈGE DU ZÉRO, ENCORE. `Number(null)` vaut 0 et EST fini : une garde
// écrite `if (!mm)` ou `Number.isFinite(Number(mm))` prendrait « pas encore
// mesuré » pour « 0 mm, ça tient pile ». La garde porte donc sur l'ABSENCE
// elle-même, avant toute conversion.
export function verdictJauge(mm) {
  if (mm === null || mm === undefined || mm === '') return null
  const v = Number(mm)
  if (!Number.isFinite(v)) return null

  // ⚠️ LA VIRGULE, MÊME ICI. C'est du français lu par Alex : « 11.4 mm » est
  // une notation anglaise, et le reste de l'app est passé à la virgule le 28.
  const dire = (n) => `${String(n).replace('.', ',')} mm`

  if (v > 0) {
    return { etat: 'deborde', marge: 0, texte: `DÉBORDE DE ${dire(v)}, à raccourcir` }
  }
  const marge = -v
  if (marge < MARGE_MINI) {
    return { etat: 'juste', marge, texte: `Tient, mais de justesse : ${dire(marge)} de marge` }
  }
  if (marge > MARGE_MAXI) {
    return { etat: 'vide', marge, texte: `Tient, mais ${dire(marge)} de blanc en bas : de la place à reprendre` }
  }
  return { etat: 'ok', marge, texte: `Tient dans la page · ${dire(marge)} de marge` }
}

// Les teintes, séparées du verdict : `deborde` est le seul rouge, parce que
// c'est le seul cas où imprimer produit un déchet.
export const TEINTES_JAUGE = {
  deborde: { color: '#B91C1C', background: '#FEE2E2', bord: '#FECACA' },
  juste: { color: '#B45309', background: '#FFFBEB', bord: '#FDE68A' },
  vide: { color: '#B45309', background: '#FFFBEB', bord: '#FDE68A' },
  ok: { color: '#047857', background: '#ECFDF5', bord: '#A7F3D0' },
}

// px → mm à 96 dpi, la résolution de référence du CSS.
export const PX_MM = 0.2646
