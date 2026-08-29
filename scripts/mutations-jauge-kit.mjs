// HARNAIS DE MUTATION — LA JAUGE DES PAGES IMPRIMABLES (29/08).
//
// ⚠️ POURQUOI CE HARNAIS EXISTE. La jauge est un INSTRUMENT DE MESURE : elle
// décide si un A4 part à l'imprimante. Un instrument qui se trompe de verdict
// est PIRE que pas d'instrument, parce qu'il donne une confiance fausse sur un
// support qu'on ne peut plus corriger. Le harnais de la veille avait fait
// exactement ça en prenant des rouges pour des plantages. On ne se contente
// donc pas d'un banc vert : on casse la jauge, exprès, et on exige le rouge.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout` :
// le dépôt porte du travail non commité, et un checkout l'effacerait.
//
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON. Un banc qui
// PLANTE n'a rien prouvé : il faut qu'il rougisse en le disant.
//
//   node scripts/mutations-jauge-kit.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const MUTATIONS = [
  // ══ LA RÈGLE ══
  { nom: '🔴 LE SENS S’INVERSE : ce qui déborde annoncerait qu’il reste de la place',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: '  if (v > 0) {', vers: '  if (v < 0) {' },

  { nom: '🔴 le piège du zéro revient : « pas mesuré » deviendrait « 0 mm, ça tient »',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: "  if (mm === null || mm === undefined || mm === '') return null\n  const v = Number(mm)\n  if (!Number.isFinite(v)) return null",
    vers: '  const v = Number(mm)\n  if (!Number.isFinite(v)) return null' },

  { nom: '🔴 le seuil bas disparaît : une page à ras bord serait annoncée bonne à tirer',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: 'export const MARGE_MINI = 3', vers: 'export const MARGE_MINI = 0' },

  { nom: '🔴 le seuil haut s’envole : une page à moitié vide passerait pour réussie',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: 'export const MARGE_MAXI = 18', vers: 'export const MARGE_MAXI = 100' },

  { nom: '🔴 le millimétrage s’arrondit : je ne saurais plus combien couper',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: "return { etat: 'deborde', marge: 0, texte: `DÉBORDE DE ${dire(v)}, à raccourcir` }",
    vers: "return { etat: 'deborde', marge: 0, texte: `DÉBORDE DE ${dire(Math.round(v))}, à raccourcir` }" },

  { nom: '🔴 le point décimal anglais revient dans la jauge',
    banc: 'verif:kit', fichier: 'lib/jauge-page.js',
    de: "  const dire = (n) => `${String(n).replace('.', ',')} mm`",
    vers: '  const dire = (n) => `${n} mm`' },

  // ══ CE QUI REND LA MESURE POSSIBLE ══
  //
  // ⚠️ LA MUTATION LA PLUS IMPORTANTE DU LOT. Sans `overflow:hidden`, la page
  // s'étire au lieu de couper, `scrollHeight` égale `clientHeight`, et la
  // jauge affiche un VERT PERMANENT ET FAUX. Rien ne casse, rien n'alerte :
  // l'instrument devient aveugle en gardant l'air de fonctionner.
  { nom: '🔴 LA FEUILLE NE COUPE PLUS : la jauge deviendrait aveugle, et verte pour toujours',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "width: '210mm', height: '297mm', overflow: 'hidden'",
    vers: "width: '210mm', height: '297mm', overflow: 'visible'" },

  { nom: '🔴 un repère de mesure disparaît : la marge ne se calcule plus',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '<div ref={versoPied} style={{ marginTop: \'auto\', background: T.pale,',
    vers: '<div style={{ marginTop: \'auto\', background: T.pale,' },

  { nom: '🔴 l’écran cesse de lire le module et se remet à décider tout seul',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "import { verdictJauge, TEINTES_JAUGE, PX_MM } from '@/lib/jauge-page'\n",
    vers: '' },

  // ══ LE RACCOURCISSEMENT LUI-MÊME ══
  { nom: '🔴 le verso reprend la marge haute du recto et redéborde',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: "const padVerso = { padding: '13mm 17mm 0' }",
    vers: "const padVerso = { padding: '15mm 17mm 0' }" },

  // ══ L'EXPORT SVG / PNG ══
  //
  // ⚠️ LA MUTATION LA PLUS IMPORTANTE DE CE GROUPE. Sans le refus, l'export
  // produirait un fichier d'apparence normale DANS LA MAUVAISE POLICE, et
  // personne ne le verrait avant l'imprimeur.
  { nom: '🔴 L’EXPORT N’EXIGE PLUS LA POLICE : il produirait un fichier faux, sans le dire',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '  if (css === null) {', vers: '  if (false) {' },

  { nom: '🔴 la réponse du fetch de la fonte n’est plus lue : un 404 deviendrait une police',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '      if (!rep.ok) { echecs.push(`HTTP ${rep.status}`); continue }',
    vers: '      if (false) { echecs.push(`HTTP ${rep.status}`); continue }' },

  // ⚠️ LES DEUX SUSPECTS DU REFUS VU EN PRODUCTION LE 29/08, mis au banc pour
  // qu'ils ne reviennent jamais. La jauge était verte, la page parfaite, et
  // l'export refusait : je ne pouvais pas ouvrir un navigateur pour regarder.
  { nom: '🔴 la collecte cesse de descendre dans les @layer : la fonte redevient invisible',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '    if (r.cssRules) reglesDePolice(r.cssRules, sortie)', vers: '' },

  { nom: '🔴 la règle se reconnaît de nouveau à son `type`, déprécié et pas rendu partout',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "    if (/^@font-face/i.test(r.cssText || '')) { sortie.push(r); continue }",
    vers: '    if (r.type === 5) { sortie.push(r); continue }' },

  { nom: '🔴 une famille non reconnue refait échouer l’export au lieu de tout embarquer',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '  const retenues = voulues.length > 0 ? voulues : toutes',
    vers: '  const retenues = voulues' },

  { nom: '🔴 le refus cesse de dire ce qu’il a vu',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "    return { css: null, diag: `aucune règle @font-face dans les ${feuilles.length} feuilles de style`",
    vers: "    return { css: null, diag: `rien à faire`.replace('x', `${feuilles.length}`)" },

  { nom: '🔴 le base64 repasse en un seul coup : la pile déborderait sur une vraie fonte',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: '  const TRANCHE = 8192\n  for (let i = 0; i < octets.length; i += TRANCHE) {\n    binaire += String.fromCharCode.apply(null, octets.subarray(i, i + TRANCHE))\n  }',
    vers: '  binaire = String.fromCharCode.apply(null, octets)' },

  { nom: '🔴 le PNG repasse par un blob: et pourrait teinter la toile',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTexte)",
    vers: '    img.src = URL.createObjectURL(new Blob([svgTexte], { type: \'image/svg+xml\' }))' },

  { nom: '🔴 le PNG perd son fond blanc et sortirait transparent',
    banc: 'verif:kit', fichier: 'lib/export-feuille.js',
    de: "        ctx.fillStyle = '#ffffff'\n        ctx.fillRect(0, 0, l, h)\n", vers: '' },

  { nom: '🔴 une carte de visite perd ses boutons de téléchargement',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '<Telechargements cible={carteQr}', vers: '<Rien cible={carteQr}' },

  { nom: '🔴 les boutons réapparaîtraient sur le papier imprimé',
    banc: 'verif:kit', fichier: 'app/brand-kit/commercant/page.js',
    de: '.atelier, .jauge, .notice, .outils { display:none !important }',
    vers: '.atelier, .jauge, .notice { display:none !important }' },

  // ══ LE DÉPOUILLEUR PARTAGÉ ══
  //
  // 🔴 CELLE-CI PROUVE QUE LE BANC VOIT SA PROPRE CÉCITÉ. Sans la
  // neutralisation, un « /* » écrit dans un commentaire « // » ouvre un faux
  // bloc qui avale 2 000 caractères de vrai code, et toutes les gardes en
  // « ce motif ne doit PAS apparaître » deviennent vraies sans rien prouver.
  { nom: '🔴 LE DÉPOUILLEUR REDEVIENT AVEUGLE et avale du vrai code en silence',
    banc: 'verif:kit', fichier: 'scripts/lire-code.mjs',
    de: "ligne.replace(/\\/\\*|\\*\\//g, '  ')", vers: 'ligne' },
]

function lancer(banc) {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ DISTINGUER UN BANC QUI ROUGIT D'UN BANC QUI PLANTE. Les bancs ne le
    // disent pas tous avec les mêmes mots : « en échec » ici, « ÉCHEC(S) » là.
    const aRougiProprement = /en échec|ÉCHEC\(S\)/.test(sortie)
    return { rouge: true, plante: !aRougiProprement, extrait: sortie.slice(-260) }
  }
}

for (const banc of [...new Set(MUTATIONS.map(m => m.banc))]) {
  const avant = lancer(banc)
  if (avant.rouge) { console.log(`✕ ${banc} DÉJÀ rouge.`); console.log(avant.extrait); process.exit(1) }
}
console.log('Bancs verts au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ « TEXTE INTROUVABLE » EST UNE NON-MESURE QUI PASSE POUR UNE MESURE.
  // Arrivé trois fois : une espace insécable, une apostrophe typographique.
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  writeFileSync(f, original.replace(m.de, m.vers), 'utf8')
  const res = lancer(m.banc)
  writeFileSync(f, original, 'utf8')
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

let finalRouge = false
for (const banc of [...new Set(MUTATIONS.map(m => m.banc))]) {
  if (lancer(banc).rouge) { finalRouge = true; console.log(`🔴 ${banc} ROUGE APRÈS RESTAURATION.`) }
}
console.log(finalRouge ? '' : '\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
