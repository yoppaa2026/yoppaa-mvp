// Prépare les captures du produit pour la landing.
//
//   1. Dépose tes captures dans `captures-brutes/`. N'importe quels noms.
//   2. `node scripts/preparer-captures-landing.mjs`
//
// Chaque image est réduite à 900 px de large et convertie en WebP dans
// `public/captures/`, en gardant son nom.
//
// ⚠️ POURQUOI RÉDUIRE, ALORS QU'ON POURRAIT POSER LE PNG TEL QUEL.
// Une capture pleine page pèse 1 à 3 Mo et fait 2500 px de large. Sur la
// landing, c'est-à-dire l'outil de recrutement, ça se paie deux fois : la page
// devient lente sur un téléphone en 4G, et l'image réduite à 300 px de large
// devient un carré gris illisible.
//
// ⚠️ LE RECADRAGE, LUI, NE S'AUTOMATISE PAS. Il dépend de ce qu'on veut
// montrer, et personne ne peut le deviner depuis un fichier. Il se décide en
// regardant l'image, puis se règle ici, en POURCENTAGES de la source — jamais
// en pixels, parce que ces captures viennent d'écrans de tailles différentes.
// Une entrée dans CADRAGES ne sert qu'à ça ; sans entrée, l'image passe
// entière.

import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import sharp from 'sharp'

const racine = process.cwd()
const SOURCE = join(racine, 'captures-brutes')
const CIBLE = join(racine, 'public', 'captures')
const LARGEUR = 900

// Nom du fichier déposé → nom de sortie et cadrage, en POURCENTAGES de la
// source. Les captures arrivent avec des noms d'horodatage : c'est ici qu'on
// leur donne un sens, après les avoir REGARDÉES. Sans entrée, une image est
// simplement réduite et convertie sous son propre nom.
//
// ⚠️ CE QUI SORT DU CADRE EST AUSSI IMPORTANT QUE CE QUI Y ENTRE. Ces captures
// viennent d'un vrai commerce de test : l'adresse du siège, le téléphone et
// l'email y figurent. Ce sont de vraies coordonnées, et la landing est
// publique. Les cadrages ci-dessous les excluent.
const CADRAGES = {
  // L'étape 2 : « Identité » et les vingt-deux métiers en tuiles. On coupe
  // AVANT la localisation : l'adresse du siège et le numéro de téléphone n'ont
  // rien à faire sur une page publique.
  '2026-08-26_15h10_45': {
    sortie: 'signup-metiers',
    haut: 25.5, bas: 37, gauche: 12, droite: 12,
  },
  // L'étape 5 : le bloc « Où tu en es », le score à 100 et son bilan. On coupe
  // au-dessus du bloc de vérification d'entreprise, qui montre des champs vides
  // marqués « À compléter » juste à côté d'un « Ta fiche est complète ».
  '2026-08-26_15h12_49': {
    sortie: 'signup-complete',
    haut: 61.5, bas: 8, gauche: 8, droite: 8,
  },
  // Le tableau de bord sur un vrai iPhone : le bandeau d'essai en entier, son
  // bouton, et la barre d'onglets. On coupe la barre d'état d'iOS en haut
  // (l'heure et la batterie d'Alex n'apprennent rien à personne), et surtout on
  // coupe AVANT « 0 article · 0 catégorie ».
  //
  // ⚠️ LES ZÉROS D'UN COMMERCE DE TEST NE SE MONTRENT PAS. « 0 article »,
  // « 0 € de chiffre du jour », « Aucune commande ici » sont honnêtes et vrais,
  // et diraient à un commerçant qui hésite exactement le contraire de ce qu'on
  // lui promet. Ce n'est pas un mensonge de les couper : ce sont les compteurs
  // d'un commerce fictif créé il y a une heure, ils ne racontent rien du
  // produit.
  'IMG_4319': {
    sortie: 'dashboard-essai',
    haut: 6.6, bas: 58.5, gauche: 0, droite: 0,
  },

  // ─── 13/09 : les écrans côté Yopper ──────────────────────────────────────
  //
  // ⚠️ UNE CAPTURE D'ÉCRAN ENTIER NE SE LIT PAS SUR UNE LANDING. Un téléphone
  // fait 1179 px de large pour 2556 de haut ; ramené à la largeur d'une colonne,
  // le texte tombe sous la barre des dix pixels. CHAQUE CADRAGE ICI PREND UN
  // BLOC, PAS UN ÉCRAN : c'est ce qui garde le texte lisible.
  //
  // ⚠️ ET CHACUN COUPE QUELQUE CHOSE DE PRÉCIS. L'en-tête de l'application
  // porte la pastille de localisation, c'est-à-dire l'adresse d'Alex ; le
  // bandeau du profil porte son nom, son email et son numéro ; le bloc des bons
  // porte des codes utilisables. Ce ne sont pas des détails de cadrage, ce sont
  // les trois raisons de cadrer.

  // La liste d'accueil : le premier écran de tout Yopper, et le seul qui
  // n'était NULLE PART sur la landing. On garde « Rien ne se perd », le compte
  // de commerces et deux fiches entières. On coupe AU-DESSUS des filtres :
  // c'est là que se trouve la pastille de localisation.
  'IMG_4644': {
    sortie: 'yopper-liste',
    haut: 22, bas: 33, gauche: 0, droite: 0,
  },
  // Les options d'un article : « choisis-en un », le marqueur OBLIGATOIRE, et
  // une sauce à supplément. C'est la question que pose toute friterie avant de
  // signer, et aucune maquette ne la montrait.
  'IMG_4656': {
    sortie: 'yopper-options',
    haut: 31.5, bas: 3.5, gauche: 0, droite: 0,
  },
  // Une fiche produit de boutique : la photo, puis taille ET couleur. Le détail
  // non alimentaire n'existait sur la landing que sous forme de mot.
  'IMG_4658': {
    sortie: 'yopper-variantes',
    haut: 39.5, bas: 0.2, gauche: 0, droite: 0,
  },
  // Le bon cadeau : montants, « je l'offre » ou « pour moi ». Un module entier
  // dont la landing parlait sans jamais le montrer. Le formulaire est vide, il
  // ne porte aucune coordonnée.
  'IMG_4652': {
    sortie: 'yopper-bon-cadeau',
    haut: 14, bas: 40, gauche: 0, droite: 0,
  },

  // 🔴 CE QUI A ÉTÉ ÉCARTÉ, ET POURQUOI ON NE LE REPRENDRA PAS PLUS TARD.
  // L'écran du profil (IMG_4665) montre le temps économisé, et c'est l'argument
  // le plus touchant de toute l'application. Il ne partira pas en ligne :
  // « 17 h 29 », « 195 commandes » et « 4407 € » sont les compteurs d'un compte
  // de TEST, gonflés par des mois d'essais. Les montrer promettrait un usage
  // que personne n'a encore. C'est le même défaut que les zéros d'un commerce
  // fictif, pris par l'autre bout : dans les deux cas, le compteur d'un compte
  // de démonstration ne raconte rien du produit.
  // Il redeviendra publiable le jour où un vrai Yopper aura de vrais chiffres.
}

const pct = (v, total) => Math.max(0, Math.round((Number(v) || 0) / 100 * total))
const ko = (o) => `${Math.round(o / 1024)} ko`

if (!existsSync(SOURCE)) {
  mkdirSync(SOURCE, { recursive: true })
  console.log('Dossier créé : captures-brutes/  — dépose tes images dedans.')
  process.exit(0)
}
mkdirSync(CIBLE, { recursive: true })

const fichiers = readdirSync(SOURCE)
  .filter(f => ['.png', '.jpg', '.jpeg', '.webp'].includes(extname(f).toLowerCase()))

if (fichiers.length === 0) {
  console.log('Aucune image dans captures-brutes/. Dépose tes captures et relance.')
  process.exit(0)
}

console.log('\nCAPTURES DE LA LANDING\n')
for (const f of fichiers) {
  const nom = basename(f, extname(f))
  const image = sharp(join(SOURCE, f))
  const { width, height } = await image.metadata()
  if (!width || !height) { console.log(`  ✕ ${f} — illisible`); continue }

  const c = CADRAGES[nom]
  // ⚠️ SANS CADRAGE DÉCIDÉ, ON NE PUBLIE PAS. Une capture non regardée peut
  // porter une adresse, un téléphone, un email. Elle attend qu'on l'ait
  // ouverte et nommée, plutôt que d'atterrir en ligne par défaut.
  if (!c) { console.log(`  ⏭️  ${f} — pas de cadrage décidé, ignorée`); continue }

  const gauche = pct(c.gauche, width)
  const haut = pct(c.haut, height)
  const l = width - gauche - pct(c.droite, width)
  const h = height - haut - pct(c.bas, height)
  if (l <= 0 || h <= 0) { console.log(`  ✕ ${f} — cadrage impossible`); continue }

  const info = await image
    .extract({ left: gauche, top: haut, width: l, height: h })
    .resize({ width: LARGEUR, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(join(CIBLE, `${c.sortie}.webp`))

  // ⚠️ ON DIT LE POIDS, PARCE QUE C'EST LUI QUI SE PAIE. Au-delà de 150 ko une
  // image se sent sur un téléphone en 4G, et la landing en aura plusieurs. Si
  // ça dépasse, c'est que le cadre est trop large : resserrer plutôt que
  // baisser la qualité, une capture floue ne convainc personne.
  const alerte = info.size > 150 * 1024 ? '   ⚠️ resserre le cadre' : ''
  console.log(`  ✅ ${c.sortie}.webp   ${width}×${height} → ${info.width}×${info.height}, ${ko(info.size)}${alerte}`)
}
console.log('\nRendues dans public/captures/.\n')
