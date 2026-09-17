// LES ICÔNES DE L'APPLICATION, POUR LES DEUX STORES.
//
// 🔴 CAPACITOR POSE SES PROPRES ICÔNES EN GÉNÉRANT LES PROJETS. Sans ce script,
// l'application publiée afficherait LE LOGO DE CAPACITOR sur l'écran d'accueil
// des gens, et sur la fiche du store. Ce n'est pas une finition, c'est la
// première chose que quelqu'un voit de Yoppaa.
//
// ⚠️ LA SOURCE EST `public/icon-512.png`, LA PLUS GRANDE DISPONIBLE (512 px,
// sans transparence). Apple demande 1024 : l'icône iOS est donc AGRANDIE, avec
// le meilleur filtre disponible, et le rendu gagnerait à partir d'une source
// plus grande. C'est écrit à l'écran à chaque exécution plutôt que caché ici.
//
// ⚠️ NI TRANSPARENCE NI COINS ARRONDIS sur les icônes de store : les deux les
// refusent, et les systèmes arrondissent eux-mêmes. On aplatit donc sur un fond
// plein, celui de la marque.
//
//   npm run icones:natives

import sharp from 'sharp'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(RACINE, 'public/icon-512.png')
const FOND = '#1A0840'   // le violet profond de la marque

// Android : les cinq densités, et le nom que le manifeste attend.
const DENSITES_ANDROID = [
  ['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192],
]

// ⚠️ L'ICÔNE ADAPTATIVE D'ANDROID SE FAIT ROGNER. Le système peut la découper
// en cercle, en carré arrondi ou en goutte selon le téléphone : seuls les
// deux tiers centraux sont garantis visibles. Le logo est donc posé à 66 %
// sur un fond plein, sinon il perd ses bords sur la moitié des appareils.
const PART_SURE = 0.66

const lignes = []
const dire = (s) => { lignes.push(s); console.log(s) }

async function surFond(taille) {
  const logo = await sharp(SOURCE)
    .resize(Math.round(taille * 0.86), Math.round(taille * 0.86), { kernel: sharp.kernel.lanczos3, fit: 'contain', background: FOND })
    .toBuffer()
  return sharp({ create: { width: taille, height: taille, channels: 4, background: FOND } })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`🔴 Source introuvable : ${SOURCE}`)
    process.exit(1)
  }
  const meta = await sharp(SOURCE).metadata()
  dire(`Source : ${meta.width}×${meta.height}${meta.hasAlpha ? ' (avec transparence)' : ''}`)
  if (meta.width < 1024) {
    dire(`⚠️ Apple demande 1024 px : l'icône iOS sera AGRANDIE depuis ${meta.width}.`)
    dire('   Une source de 1024 ou plus donnerait un rendu nettement meilleur.')
  }

  // ─── ANDROID ────────────────────────────────────────────────────────────
  for (const [densite, px] of DENSITES_ANDROID) {
    const dossier = join(RACINE, 'android/app/src/main/res', `mipmap-${densite}`)
    mkdirSync(dossier, { recursive: true })
    const carre = await surFond(px)
    await carre.clone().toFile(join(dossier, 'ic_launcher.png'))
    await carre.clone().toFile(join(dossier, 'ic_launcher_round.png'))
    // Le calque avant de l'icône adaptative : le logo, plus petit, sur du vide.
    const av = Math.round(px * PART_SURE)
    await sharp({ create: { width: px, height: px, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp(SOURCE).resize(av, av, { kernel: sharp.kernel.lanczos3 }).toBuffer(), gravity: 'centre' }])
      .png()
      .toFile(join(dossier, 'ic_launcher_foreground.png'))
  }
  dire(`✅ Android : ${DENSITES_ANDROID.length} densités × 3 fichiers`)

  // ─── iOS ────────────────────────────────────────────────────────────────
  // Un seul fichier depuis Xcode 14 : 1024×1024, universel, SANS transparence.
  const cibleIos = join(RACINE, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
  await (await surFond(1024)).toFile(cibleIos)
  dire('✅ iOS : AppIcon 1024×1024, sans transparence')

  // ─── LES FICHES DE STORE ────────────────────────────────────────────────
  const dossierStore = join(RACINE, 'public/store')
  mkdirSync(dossierStore, { recursive: true })

  await (await surFond(512)).toFile(join(dossierStore, 'google-play-icone-512.png'))
  await (await surFond(1024)).toFile(join(dossierStore, 'app-store-icone-1024.png'))
  dire('✅ Icônes de fiche : 512 pour Google, 1024 pour Apple')

  // Le bandeau de Google Play. ⚠️ IL EST ROGNÉ SUR LES CÔTÉS selon l'appareil :
  // rien d'important ne doit toucher les bords, d'où le logo centré et rien
  // d'autre. Le texte y est déconseillé par Google, qui le superpose parfois.
  const logoBandeau = await sharp(SOURCE).resize(320, 320, { kernel: sharp.kernel.lanczos3 }).toBuffer()
  await sharp({ create: { width: 1024, height: 500, channels: 4, background: FOND } })
    .composite([{ input: logoBandeau, gravity: 'centre' }])
    .png()
    .toFile(join(dossierStore, 'google-play-bandeau-1024x500.png'))
  dire('✅ Bandeau Google Play : 1024×500')

  dire('\nTout est dans public/store/ et dans les projets natifs.')
  dire('⚠️ Les CAPTURES D\'ÉCRAN restent à faire : elles montrent l\'app en vrai,')
  dire('   et aucun script ne peut les inventer.')
}

main().catch((e) => { console.error('🔴 Échec :', e?.message || e); process.exit(1) })
