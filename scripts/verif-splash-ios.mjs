// Banc des ÉCRANS DE LANCEMENT iOS.
//
// Ce banc ne vérifie pas que le dégradé est joli : ça, ça se regarde. Il tient
// la seule chose qui puisse se casser en silence, et qui se cassera :
//
//   ⚠️ L'IMAGE NATIVE ET L'ÉCRAN ANIMÉ DOIVENT PORTER LE MÊME FOND.
//
// L'image `apple-touch-startup-image` est peinte par iOS AVANT que la page
// n'existe ; `SplashScreen` (app/commander/page.js) est peint juste après.
// L'un cède la place à l'autre. S'ils divergent d'une seule couleur, le
// lancement se met à clignoter, et RIEN dans le code ne le dira : ni le lint,
// ni le build, ni un rendu React. Deux fichiers, deux vies séparées, aucun
// lien mécanique entre eux. C'est exactement la forme du défaut qui a fait
// vivre un faux taux Stripe dans quatre fichiers.
//
// Le banc tient donc trois promesses :
//   1. la géométrie du dégradé CSS est calculée juste (fonction EXÉCUTÉE) ;
//   2. chaque écran déclaré a bien son image, aux bonnes dimensions (le PNG
//      est OUVERT, on ne se contente pas de voir un nom de fichier) ;
//   3. le fond du générateur est celui du composant, arrêt par arrêt.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  FOND, ligneDegrade, svgSplash, nomFichier, requeteMedia, table,
} from './generer-splash-ios.mjs'
import { SPLASH_IOS } from '../lib/splash-ios.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const presque = (a, b, tol = 0.01) => Math.abs(a - b) <= tol

// ══════════════════════════════════════════════════════════════════
// 1. LA GÉOMÉTRIE DU DÉGRADÉ, FONCTION EXÉCUTÉE
// ══════════════════════════════════════════════════════════════════
// Les trois angles droits de CSS ont une réponse connue d'avance, sans passer
// par le code : c'est ce qui rend ces mesures utiles. Un `linear-gradient` de
// CSS n'est pas un `<linearGradient>` de SVG, et recopier naïvement 0,0 → 1,1
// donnerait un dégradé qui pivote avec la forme de l'écran, donc des couleurs
// différentes sur chaque iPhone.
{
  const bas = ligneDegrade(100, 200, 180)   // « vers le bas »
  verifier('180° descend droit, du haut vers le bas',
    presque(bas.x1, 50) && presque(bas.y1, 0) && presque(bas.x2, 50) && presque(bas.y2, 200),
    JSON.stringify(bas))

  const droite = ligneDegrade(100, 200, 90) // « vers la droite »
  verifier('90° traverse droit, de gauche à droite',
    presque(droite.x1, 0) && presque(droite.y1, 100) && presque(droite.x2, 100) && presque(droite.y2, 100),
    JSON.stringify(droite))

  const haut = ligneDegrade(100, 200, 0)    // « vers le haut »
  verifier('0° monte, et ne descend pas',
    presque(haut.y1, 200) && presque(haut.y2, 0), JSON.stringify(haut))

  // 160° : vers le bas, en tirant légèrement à droite. Le sens compte autant
  // que l'axe, car un dégradé inversé reste un dégradé « juste » à l'œil nu
  // sur une capture, et faux au lancement.
  const l = ligneDegrade(1179, 2556, FOND.angle)
  verifier('160° part du haut-gauche et finit en bas-droite',
    l.y2 > l.y1 && l.x2 > l.x1, JSON.stringify(l))
  verifier('et la ligne reste centrée sur la boîte',
    presque((l.x1 + l.x2) / 2, 1179 / 2) && presque((l.y1 + l.y2) / 2, 2556 / 2))
}

// ══════════════════════════════════════════════════════════════════
// 2. CHAQUE ÉCRAN DÉCLARÉ A SON IMAGE, ET L'IMAGE FAIT LA BONNE TAILLE
// ══════════════════════════════════════════════════════════════════
// ⚠️ On OUVRE le PNG. Un fichier nommé `apple-splash-1179x2556.png` mais
// encodé en 828×1792 satisferait n'importe quelle garde qui se contente de
// lire des noms, et iOS l'étirerait sans rien dire.
{
  const dossier = new URL('../public/splash/', import.meta.url)
  const chemin = (n) => join(dossier.pathname.replace(/^\//, ''), n)

  verifier('la table déclare au moins les iPhone en service', table.length >= 12, `${table.length} écrans`)

  const attendus = new Set()
  for (const e of table) {
    const nom = nomFichier(e.largeur, e.hauteur)
    attendus.add(nom)
    const p = chemin(nom)
    if (!existsSync(p)) { verifier(`${nom} existe`, false, 'fichier absent'); continue }
    const meta = await sharp(p).metadata()
    verifier(`${nom} fait bien ${e.largeur}×${e.hauteur}`,
      meta.width === e.largeur && meta.height === e.hauteur,
      `${meta.width}×${meta.height}`)
  }

  // Le sens inverse : une image orpheline est une image que plus aucune balise
  // ne référence, donc du poids déployé pour rien.
  const surDisque = readdirSync(dossier).filter(f => f.startsWith('apple-splash-') && f.endsWith('.png'))
  const orphelines = surDisque.filter(f => !attendus.has(f))
  verifier('aucune image orpheline dans public/splash', orphelines.length === 0, orphelines.join(', '))
}

// ══════════════════════════════════════════════════════════════════
// 3. LE FOND DU GÉNÉRATEUR EST CELUI DU COMPOSANT
// ══════════════════════════════════════════════════════════════════
// La garde qui compte. Si quelqu'un retouche le dégradé de `SplashScreen`
// sans relancer le générateur, le lancement se met à clignoter.
{
  const page = lire('app/commander/page.js')
  // On isole le dégradé du composant SplashScreen, pas n'importe quel dégradé
  // de la page : elle en contient plusieurs, et un homonyme voisin rendrait
  // cette garde muette. On ancre donc sur le bloc du composant.
  const debut = page.indexOf('function SplashScreen(')
  verifier('le composant SplashScreen est toujours là', debut > -1)
  const bloc = debut > -1 ? page.slice(debut, debut + 3000) : ''
  const m = bloc.match(/linear-gradient\((\d+)deg,\s*(#[0-9A-Fa-f]{6})\s*0%,\s*(#[0-9A-Fa-f]{6})\s*50%,\s*(#[0-9A-Fa-f]{6})\s*100%\)/)

  // ⚠️ SANS CETTE LIGNE LA GARDE SERAIT MUETTE : un dégradé réécrit autrement
  // ferait échouer le motif, `m` vaudrait null, et toutes les comparaisons qui
  // suivent seraient sautées en silence. L'absence de motif est un échec, pas
  // une dispense.
  verifier('le fond de SplashScreen est bien un dégradé à 3 arrêts lisible', Boolean(m),
    'motif introuvable dans le composant')

  if (m) {
    const [, angle, c0, c50, c100] = m
    verifier("l'angle de l'image native est celui du composant",
      Number(angle) === FOND.angle, `composant ${angle}°, générateur ${FOND.angle}°`)
    verifier('la couleur de départ est la même',
      c0.toUpperCase() === FOND.arrets[0].couleur.toUpperCase(), `${c0} ≠ ${FOND.arrets[0].couleur}`)
    verifier('la couleur du milieu est la même',
      c50.toUpperCase() === FOND.arrets[1].couleur.toUpperCase(), `${c50} ≠ ${FOND.arrets[1].couleur}`)
    verifier("la couleur d'arrivée est la même",
      c100.toUpperCase() === FOND.arrets[2].couleur.toUpperCase(), `${c100} ≠ ${FOND.arrets[2].couleur}`)
  }

  // Et le SVG produit porte réellement ces couleurs : comparer deux constantes
  // ne prouverait rien sur ce qui est dessiné.
  const svg = svgSplash(1179, 2556)
  for (const a of FOND.arrets) {
    verifier(`le SVG généré contient ${a.couleur}`, svg.includes(a.couleur))
  }
  verifier('le SVG ne dessine AUCUN logo',
    !svg.includes('<circle') && !svg.includes('<text'),
    'le wordmark et les points sont animés par la page, les peindre ferait double emploi')
}

// ══════════════════════════════════════════════════════════════════
// 4. LA TABLE LUE PAR LE LAYOUT EST À JOUR
// ══════════════════════════════════════════════════════════════════
// `lib/splash-ios.js` est généré. Ajouter un écran à la table sans relancer le
// script laisserait un iPhone sans image, sans le moindre signal.
{
  verifier('lib/splash-ios.js couvre exactement la table',
    SPLASH_IOS.length === table.length, `${SPLASH_IOS.length} balises pour ${table.length} écrans`)

  for (const e of table) {
    const media = requeteMedia(e.cssL, e.cssH, e.densite)
    const href = `/splash/${nomFichier(e.largeur, e.hauteur)}`
    const trouvee = SPLASH_IOS.find(s => s.media === media)
    verifier(`${e.cssL}×${e.cssH} @${e.densite} est déclaré`, Boolean(trouvee))
    if (trouvee) verifier(`${e.cssL}×${e.cssH} @${e.densite} pointe la bonne image`, trouvee.href === href, trouvee.href)
  }

  // La requête média doit rester assez précise pour ne pas coiffer un autre
  // appareil : deux iPhone partagent la taille CSS 414×896 et ne se
  // distinguent QUE par la densité.
  for (const s of SPLASH_IOS) {
    verifier('chaque requête média fixe la densité', s.media.includes('-webkit-device-pixel-ratio'), s.media)
    verifier("chaque requête média fixe l'orientation", s.media.includes('orientation: portrait'), s.media)
  }
  verifier('aucune requête média en double', new Set(SPLASH_IOS.map(s => s.media)).size === SPLASH_IOS.length)
}

// ══════════════════════════════════════════════════════════════════
// 5. LE LAYOUT POSE RÉELLEMENT LES BALISES
// ══════════════════════════════════════════════════════════════════
// Des images parfaites que personne ne déclare ne servent à rien : le flash
// blanc resterait, et le dossier public grossirait pour rien.
{
  const layout = lire('app/layout.tsx')
  verifier('le layout importe la table générée', /from ['"]@\/lib\/splash-ios['"]/.test(layout))
  verifier('le layout émet des apple-touch-startup-image',
    layout.includes('apple-touch-startup-image'))
  verifier('et il les émet EN BOUCLE sur la table, pas à la main',
    /SPLASH_IOS\.map/.test(layout),
    '19 balises écrites à la main, ce sont 19 occasions de se tromper en silence')
  verifier('le manifeste reste déclaré pour Android', layout.includes('/manifest.json'))
  // Sans `appleWebApp.capable`, iOS n'ouvre pas la PWA en mode autonome, et
  // sans mode autonome il n'y a PAS d'écran de lancement du tout : les 19
  // images ne seraient jamais peintes.
  verifier('appleWebApp reste capable, sinon aucune image ne sera peinte',
    /appleWebApp:\s*\{[^}]*capable:\s*true/s.test(layout))
}

// ══════════════════════════════════════════════════════════════════
// 6. LE MANIFESTE ANDROID
// ══════════════════════════════════════════════════════════════════
// Android, lui, compose son écran de lancement à partir du manifeste. Les deux
// plateformes doivent raconter la même marque.
{
  const manifeste = JSON.parse(lire('public/manifest.json'))
  verifier('le manifeste porte un fond de lancement', Boolean(manifeste.background_color))
  verifier('ce fond est la couleur de départ du dégradé, comme sur iOS',
    manifeste.background_color.toUpperCase() === '#1A0840',
    `${manifeste.background_color} — l'encre canonique de la marque`)
  const layout = lire('app/layout.tsx')
  const teinte = layout.match(/themeColor:\s*["'](#[0-9A-Fa-f]{6})["']/)
  verifier('le layout déclare une teinte de thème', Boolean(teinte))
  verifier('et le manifeste annonce la MÊME teinte que le layout',
    Boolean(teinte) && manifeste.theme_color.toUpperCase() === teinte[1].toUpperCase(),
    `manifeste ${manifeste.theme_color}, layout ${teinte ? teinte[1] : '?'}`)
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Écrans de lancement verts.')
