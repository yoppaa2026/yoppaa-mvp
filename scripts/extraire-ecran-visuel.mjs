// Extrait l'écran d'un visuel de store, et rien d'autre.
//
//   node scripts/extraire-ecran-visuel.mjs
//
// 🔴 POURQUOI CE SCRIPT EXISTE, ET POURQUOI IL N'EST PAS `preparer-captures-
// landing.mjs`. Celui-là part de `captures-brutes/`, c'est-à-dire de captures
// d'écran nues. Ici, la source est tout autre : ce sont les HUIT VISUELS
// composés pour les stores (`yoppaa-android-01..08.png`), fabriqués par
// `/brand-kit/captures` le 18/09. Chacun porte un titre, un sous-titre, les
// dots de la marque et un fond violet plein, autour d'un téléphone.
//
// Alex, le 22/09 : « tu peux reprendre uniquement les captures et les passer en
// WebP ». C'est exactement ce que fait ce script : il jette l'habillage et ne
// garde que l'écran.
//
// ⚠️ POURQUOI ON NE POSE PAS LES PNG TELS QUELS. Les huit pèsent 6,4 Mo, contre
// 170 Ko pour les sept captures actuelles de la landing : trente-sept fois
// plus. Sur la page qui sert à recruter les commerçants, ça se paie en vitesse
// de chargement, donc en référencement et en conversion. Et l'habillage ferait
// DEUX titres, puisque chaque bloc de `lib/captures-landing.js` porte déjà le
// sien.
//
// ⚠️ LE CADRE SE MESURE, IL NE SE DEVINE PAS. Les huit visuels sortent du même
// gabarit, donc le téléphone est au même endroit ; mais l'écrire en dur ici
// voudrait dire qu'un gabarit retouché déplacerait le cadrage sans que
// personne ne le voie. On cherche donc les bords à partir de la couleur du
// fond, et on IMPRIME ce qu'on a trouvé : si une mesure s'écarte des autres,
// elle se voit dans la sortie.

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const racine = process.cwd()
const DOSSIER = join(racine, 'public', 'captures')
// ⚠️ 760, PAS 900, ET C'EST UNE QUESTION DE COHÉRENCE. Les visuels des stores
// portent un téléphone large de 760 px : `withoutEnlargement` les laisse donc à
// 760 quoi qu'on demande. Une capture brute réduite à 900 serait la seule plus
// large de la série, et ça se verrait dans la colonne.
const LARGEUR = 760
const QUALITE = 82           // la même que `preparer-captures-landing.mjs`
const TOLERANCE = 12         // écart admis sur chaque canal pour « c'est le fond »

// ⚠️ LE NOM DE SORTIE DIT CE QU'ON VOIT, pas le rang du fichier source.
// `yoppaa-android-03` ne dit rien à personne dans six mois ; `yopper-creneaux`
// se relit. Les quatre premiers REMPLACENT des captures déjà branchées sur la
// landing, les quatre autres sont nouveaux.
const SORTIES = {
  'yoppaa-android-01.png': 'yopper-liste',        // remplace : l'accueil, Mettet
  'yoppaa-android-02.png': 'yopper-carte',        // nouveau  : la carte de Chez Momo
  'yoppaa-android-03.png': 'yopper-creneaux',     // nouveau  : les créneaux du salon
  'yoppaa-android-04.png': 'yopper-invendus',     // nouveau  : Rien ne se perd
  'yoppaa-android-05.png': 'yopper-fidelite',     // nouveau  : la cagnotte
  'yoppaa-android-06.png': 'yopper-bon-cadeau',   // remplace : l'achat d'un bon
  'yoppaa-android-07.png': 'yopper-variantes',    // remplace : la robe et ses tailles
  'yoppaa-android-08.png': 'yopper-livraison',    // nouveau  : la livraison à domicile
}

const proche = (a, b) =>
  Math.abs(a[0] - b[0]) <= TOLERANCE &&
  Math.abs(a[1] - b[1]) <= TOLERANCE &&
  Math.abs(a[2] - b[2]) <= TOLERANCE

let faits = 0
const soucis = []

for (const [source, sortie] of Object.entries(SORTIES)) {
  const chemin = join(DOSSIER, source)
  if (!readdirSync(DOSSIER).includes(source)) {
    soucis.push(`${source} — ABSENT de public/captures/`)
    continue
  }

  const { data, info } = await sharp(chemin).raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info
  const px = (x, y) => [data[(y * W + x) * C], data[(y * W + x) * C + 1], data[(y * W + x) * C + 2]]

  // La couleur du fond, prise dans un coin où rien n'est dessiné.
  const fond = px(4, 4)

  // 🔴 ON BALAIE PLUSIEURS LIGNES, ET C'EST LE SCRIPT QUI ME L'A APPRIS. Ma
  // première version lisait UNE ligne basse, et deux visuels sur huit sortaient
  // avec un cadre différent des six autres : sur l'accueil, cette ligne tombe
  // sur la barre de navigation du bas, dont le fond est presque aussi sombre
  // que celui du visuel. Le téléphone y paraissait large de 549 px au lieu de
  // 760. Une mesure prise à un seul endroit n'est pas une mesure.
  //
  // On prend donc l'extension MAXIMALE sur une trentaine de lignes réparties
  // dans la moitié basse : il suffit qu'une seule tombe sur du contenu clair
  // pour que les vrais bords apparaissent.
  let gauche = W
  let droite = -1
  for (let n = 0; n < 30; n++) {
    const y = Math.round(H * 0.45 + (H * 0.53) * (n / 29))
    let g = 0
    let d = W - 1
    while (g < W && proche(px(g, y), fond)) g++
    while (d > 0 && proche(px(d, y), fond)) d--
    if (g < W && d > g) { if (g < gauche) gauche = g; if (d > droite) droite = d }
  }

  // Le haut du téléphone : on descend en cherchant la première ligne qui est
  // PLEINE, c'est-à-dire occupée sur presque toute la largeur du cadre.
  //
  // 🔴 ET C'EST LA DEUXIÈME FOIS QUE CETTE MESURE ME PREND. Ma version
  // précédente gardait la première ligne non vide trouvée sur quinze colonnes.
  // Sur le visuel dont le titre tient sur DEUX lignes, les cinq points de la
  // marque descendent plus bas que le seuil de départ : ils étaient pris pour
  // le haut du téléphone, et la capture sortait avec 55 px de fond sombre et
  // des points TRONQUÉS par le bord. Trouvé en ouvrant l'image, pas en lisant
  // le code : une mesure ne se vérifie qu'en regardant ce qu'elle a produit.
  //
  // Les points sont un petit groupe centré ; le cadre du téléphone, lui, court
  // d'un bord à l'autre. C'est cette différence qu'on mesure, et elle ne dépend
  // d'aucune hauteur écrite en dur.
  const COLONNES = 24
  const PLEINE = 0.8
  let haut = 360
  while (haut < H) {
    let occupees = 0
    for (let n = 0; n < COLONNES; n++) {
      const x = Math.round(gauche + (droite - gauche) * (n / (COLONNES - 1)))
      if (!proche(px(x, haut), fond)) occupees++
    }
    if (occupees >= COLONNES * PLEINE) break
    haut++
  }

  const larg = droite - gauche + 1
  const haut_ = H - haut

  // ⚠️ UNE MESURE ABSURDE NE PRODUIT PAS UN FICHIER. Un gabarit retouché, un
  // fond en dégradé, une image d'une autre taille : mieux vaut s'arrêter que
  // d'écrire une image coupée de travers que personne ne regardera avant la
  // mise en ligne.
  if (larg < W * 0.4 || haut_ < H * 0.4) {
    soucis.push(`${source} — cadre improbable : ${larg}×${haut_} dans ${W}×${H}`)
    continue
  }

  await sharp(chemin)
    .extract({ left: gauche, top: haut, width: larg, height: haut_ })
    .resize({ width: LARGEUR, withoutEnlargement: true })
    .webp({ quality: QUALITE })
    .toFile(join(DOSSIER, `${sortie}.webp`))

  const meta = await sharp(join(DOSSIER, `${sortie}.webp`)).metadata()
  const ko = Math.round((await sharp(join(DOSSIER, `${sortie}.webp`)).toBuffer()).length / 1024)
  console.log(
    `${source}  →  ${sortie}.webp`.padEnd(52) +
    `cadre ${gauche},${haut} ${larg}×${haut_}`.padEnd(30) +
    `sortie ${meta.width}×${meta.height}, ${ko} Ko`,
  )
  faits++
}

// ═══════════════════════════════════════════════════════════════════════════
// LES CAPTURES BRUTES DE TÉLÉPHONE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ ELLES N'ONT PAS D'HABILLAGE À RETIRER, mais elles ont autre chose : la
// barre de statut du téléphone en haut (l'heure, le réseau, la batterie) et la
// barre de geste en bas. Les huit visuels des stores, eux, commencent
// directement à l'en-tête de l'application. Sans cette coupe, une capture
// brute posée à côté des autres afficherait « 10:43 » et un niveau de batterie
// au milieu d'une page de vente.
//
// ⚠️ ET ON NE COUPE PAS UN NOMBRE DE PIXELS ÉCRIT EN DUR : la hauteur de ces
// barres change d'un modèle à l'autre. On descend tant que la couleur est celle
// de la barre de statut, on remonte tant qu'elle est noire.
const BRUTES = {
  // La personnalisation d'un tacos chez Chez Momo : le choix de sauce marqué
  // obligatoire, et les suppléments payants. Elle remplace la capture du même
  // écran prise en août, restée au format cadrage quand les huit autres sont
  // passées en écran entier.
  'ad1e51da-073b-47de-8263-6f01945c2879.jpeg': 'yopper-options',
}

const presentes = readdirSync(DOSSIER)

for (const [source, sortie] of Object.entries(BRUTES)) {
  if (!presentes.includes(source)) {
    soucis.push(`${source} — ABSENT de public/captures/`)
    continue
  }
  const chemin = join(DOSSIER, source)
  const { data, info } = await sharp(chemin).raw().toBuffer({ resolveWithObject: true })
  const { width: W, height: H, channels: C } = info
  const px = (x, y) => [data[(y * W + x) * C], data[(y * W + x) * C + 1], data[(y * W + x) * C + 2]]

  // La barre de statut : sa couleur est celle du tout premier pixel.
  const barre = px(4, 2)
  let haut = 0
  while (haut < H && proche(px(4, haut), barre)) haut++

  // La barre de geste : du noir franc, en bas.
  const noir = [0, 0, 0]
  let bas = H - 1
  while (bas > 0 && proche(px(4, bas), noir)) bas--

  const hauteur = bas - haut + 1
  if (hauteur < H * 0.5) {
    soucis.push(`${source} — coupe improbable : il resterait ${hauteur} px sur ${H}`)
    continue
  }

  await sharp(chemin)
    .extract({ left: 0, top: haut, width: W, height: hauteur })
    .resize({ width: LARGEUR, withoutEnlargement: true })
    .webp({ quality: QUALITE })
    .toFile(join(DOSSIER, `${sortie}.webp`))

  const meta = await sharp(join(DOSSIER, `${sortie}.webp`)).metadata()
  const ko = Math.round((await sharp(join(DOSSIER, `${sortie}.webp`)).toBuffer()).length / 1024)
  console.log(
    `${source.slice(0, 18)}…  →  ${sortie}.webp`.padEnd(52) +
    `coupe ${haut} en haut, ${H - 1 - bas} en bas`.padEnd(30) +
    `sortie ${meta.width}×${meta.height}, ${ko} Ko`,
  )
  faits++
}

console.log(`\n${faits}/${Object.keys(SORTIES).length + Object.keys(BRUTES).length} écrans extraits.`)
if (soucis.length) {
  console.log('\nÀ REGARDER :')
  soucis.forEach(s => console.log('   • ' + s))
  process.exit(1)
}
