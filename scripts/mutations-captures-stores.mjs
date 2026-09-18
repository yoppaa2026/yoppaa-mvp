// HARNAIS DE MUTATION DES VISUELS DES STORES.
//
// ⚠️ UNE GARDE NON MESURÉE PEUT ÊTRE VERTE ET COMPLICE. Chaque mutation
// ci-dessous casse volontairement une règle ; le banc DOIT rougir. S'il reste
// vert, sa garde ne surveille rien, et on l'apprend ici plutôt qu'en lisant un
// refus d'Apple trois semaines plus tard.
//
// ⚠️ TOUTES LES ANCRES TIENNENT SUR UNE SEULE LIGNE. Une ancre à cheval sur
// deux lignes se casse au premier changement d'indentation, et ne vaut alors
// que sur une machine.
//
// ⚠️ ET UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON. Un banc qui
// explose au lieu de rougir n'est pas une mesure, c'est un accident : le moteur
// distingue les deux.

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:captures'
const MODULE = 'lib/captures-stores.js'
const BRAND = 'app/brand-kit/page.js'

const MUTATIONS = [
  // ─── LES FORMATS QUE LES STORES EXIGENT ────────────────────────────────
  //
  // 🔴 LE DEFAUT REEL, TROUVE LE 18/09 : l ancien script produisait du
  // 1080 x 2340 pour Google, soit un ratio de 0,4615, alors que Google impose
  // au moins 9:16 = 0,5625. Personne ne l avait vu parce que rien ne le
  // mesurait. Cette mutation remet l ancienne valeur.
  { nom: '🔴 le format Android repasse au 1080 x 2340 hors regles de Google',
    de: "  { id: 'android', nom: 'Android', l: 1080, h: 1920, store: 'google',",
    vers: "  { id: 'android', nom: 'Android', l: 1080, h: 2340, store: 'google'," },

  // 🔴 APPLE REFUSE AU PIXEL PRES, et le rejet arrive APRES la soumission :
  // un cycle de revue perdu pour quatre pixels.
  { nom: '🔴 le format principal d Apple devient 1290 x 2800',
    de: "  { id: 'ios69', nom: 'iPhone 6,9\"', l: 1290, h: 2796, store: 'apple',",
    vers: "  { id: 'ios69', nom: 'iPhone 6,9\"', l: 1290, h: 2800, store: 'apple'," },

  // ─── LA DEFORMATION, LE PIEGE PRINCIPAL ────────────────────────────────
  //
  // 🔴 C EST TOUTE LA RAISON D ETRE DE CETTE PAGE. Un etirement de 2,5 % ne se
  // voit pas a l oeil, et 2,5 % est exactement l ecart entre le format des
  // captures d Alex (1080 x 2400) et celui d Apple (1290 x 2796). L ancien
  // script etirait sous ce seuil SANS RIEN DIRE.
  { nom: '🔴 la capture est etiree : la hauteur ne suit plus la largeur',
    de: '    hCible = lCible / ratio',
    vers: '    hCible = lCible / 2' },

  // ⚠️ ET LE PLAFOND DE LARGEUR EST CE QUI DECLENCHE CE CALCUL. Sans lui, une
  // capture tres allongee occuperait toute la largeur et mangerait le titre.
  { nom: '🔴 le plafond de largeur de la capture ne se declenche plus',
    de: '  if (lCible > lMax) {',
    vers: '  if (lCible > lMax * 99) {' },

  // 🔴 LE DEFAUT QUE LE BANC A TROUVE EN NAISSANT. Sans cette ligne, les
  // visuels au titre court laissaient 60 a 120 px de vide sous la capture sur
  // les DEUX formats Apple : le titre tenait sur une ligne, la place restante
  // grandissait, et la largeur restait plafonnee.
  { nom: '🔴 la capture ne descend plus jusqu au bas du cadre',
    de: '  const yCapture = Math.max(hautCapture, H - hCible)',
    vers: '  const yCapture = hautCapture' },

  // ─── CE QU ON COUPE DE LA CAPTURE ──────────────────────────────────────
  //
  // ⚠️ LA BARRE D ETAT EST LA SEULE CHOSE QUI DIT DE QUEL SYSTEME VIENT LA
  // CAPTURE. Les captures d Alex sont Android et servent aux deux stores ;
  // garder son heure et sa batterie serait le seul indice, et le seul detail
  // qui n apprend rien a personne.
  { nom: '🔴 la barre d etat n est plus coupee',
    de: '  const sy = Math.round(image.naturalHeight * (recadrage.haut / 100))',
    vers: '  const sy = 0' },

  // ⚠️ SANS DETOURAGE, LE SURPLUS NE DISPARAIT PAS : IL SE DESSINE AILLEURS,
  // par-dessus le cadre arrondi. Meme lecon que le depassement du 01/09.
  { nom: '🔴 la capture n est plus detouree, le surplus deborde',
    de: '  ctx.clip()',
    vers: '  ctx.save()' },

  // ─── LES TEXTES ────────────────────────────────────────────────────────
  //
  // ⚠️ PAS DE TIRET CADRATIN EN FRANCAIS. Sur un visuel de store il est
  // enorme, et c est la premiere chose qu on voit.
  { nom: '🔴 un tiret cadratin s invite dans un titre',
    de: "titre: 'Rien ne se perd'",
    vers: "titre: 'Rien \u2014 ne se perd'" },

  // ⚠️ UN SEUL CHIFFRE CHEZ YOPPAA, ET C EST 100. Un nombre de commerces
  // vieillit et se dement tout seul, sur une fiche qui reste des mois en ligne.
  { nom: '🔴 un chiffre s invite dans un sous-titre',
    de: "sous: 'Les derniers du jour, avant la fermeture'",
    vers: "sous: 'Les 4 derniers du jour, avant la fermeture'" },

  // ─── LA DIVERGENCE AVEC LE BRAND-KIT ───────────────────────────────────
  //
  // ⚠️ LA PALETTE EST RECOPIEE FAUTE DE POUVOIR IMPORTER UNE PAGE. Le controle
  // qui compare les deux est ce qui empeche la marque de deriver. On mute ici
  // le BRAND-KIT, pas le module : c est le sens qui compte, la garde doit voir
  // partir l un SANS l autre.
  { nom: '🔴 le brand-kit change son violet, le module ne suit pas',
    fichier: BRAND,
    de: "  main:   '#6B35C4',",
    vers: "  main:   '#6B35C5'," },

  { nom: '🔴 le brand-kit change son fond sombre, le module ne suit pas',
    fichier: BRAND,
    de: "  ink:    '#1A0840',",
    vers: "  ink:    '#1A0841'," },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure.
    const plante = !/verifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  // ⚠️ LA RESTAURATION SE VERIFIE PAR LE CONTENU, jamais par un `git checkout`
  // qui emporterait aussi le travail en cours.
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
