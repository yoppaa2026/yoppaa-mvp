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

import { existsSync, readdirSync, readFileSync, openSync, readSync, closeSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  FOND, ligneDegrade, svgSplash, nomFichier, requeteMedia, table,
} from './generer-splash-ios.mjs'
import { SPLASH_IOS } from '../lib/splash-ios.js'
import { ENCRE, svgIcone } from './generer-icones.mjs'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const presque = (a, b, tol = 0.01) => Math.abs(a - b) <= tol

// ────────── LIRE LES DIMENSIONS D'UN PNG SANS AUCUNE DÉPENDANCE ──────────
// Le banc tournait sur `sharp`, qui n'est déclaré NULLE PART dans le
// package.json : il n'existe que parce que Next l'installe pour lui-même. Un
// banc de vérification ne peut pas reposer sur une dépendance de hasard.
//
// L'en-tête PNG suffit et se lit en 24 octets : signature (8), longueur du
// premier bloc (4), type `IHDR` (4), largeur et hauteur en gros-boutiste.
// On OUVRE donc bien le fichier, ce qui est tout l'intérêt de la garde.
const SIGNATURE_PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
function dimensionsPng(chemin) {
  const fd = openSync(chemin, 'r')
  try {
    const tete = Buffer.alloc(24)
    const lus = readSync(fd, tete, 0, 24, 0)
    if (lus < 24) return null
    if (!tete.subarray(0, 8).equals(SIGNATURE_PNG)) return null
    if (tete.subarray(12, 16).toString('latin1') !== 'IHDR') return null
    return { largeur: tete.readUInt32BE(16), hauteur: tete.readUInt32BE(20) }
  } finally { closeSync(fd) }
}

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
  // ⚠️ `fileURLToPath`, JAMAIS `url.pathname`. Sous Windows `pathname` vaut
  // `/C:/Users/…` et retirer la barre de tête donne un chemin correct ; sous
  // Linux il vaut `/home/runner/…` et la même opération le rend RELATIF. Le
  // banc passait chez moi et déclarait les 19 images absentes sur la CI.
  const dossier = fileURLToPath(new URL('../public/splash/', import.meta.url))
  const chemin = (n) => join(dossier, n)

  verifier('la table déclare au moins les iPhone en service', table.length >= 12, `${table.length} écrans`)

  const attendus = new Set()
  for (const e of table) {
    const nom = nomFichier(e.largeur, e.hauteur)
    attendus.add(nom)
    const p = chemin(nom)
    if (!existsSync(p)) { verifier(`${nom} existe`, false, 'fichier absent'); continue }
    const meta = dimensionsPng(p)
    verifier(`${nom} est bien un PNG lisible`, Boolean(meta), 'en-tête illisible')
    if (meta) {
      verifier(`${nom} fait bien ${e.largeur}×${e.hauteur}`,
        meta.largeur === e.largeur && meta.hauteur === e.hauteur,
        `${meta.largeur}×${meta.hauteur}`)
    }
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
  verifier('appleWebApp reste capable',
    /appleWebApp:\s*\{[^}]*capable:\s*true/s.test(layout))

  // ⚠️ ET SURTOUT LA BALISE HISTORIQUE, ÉCRITE À LA MAIN.
  //
  // Cette garde est née d'un banc vert sur un défaut bien réel. Elle regardait
  // `appleWebApp: { capable: true }`, le trouvait, et concluait. Or Next
  // n'émet à partir de là QUE le nom standardisé `mobile-web-app-capable`,
  // alors que Safari conditionne les écrans de lancement au nom HISTORIQUE
  // `apple-mobile-web-app-capable`. Résultat : 19 images servies, valides,
  // et purement ignorées par iOS. Flash blanc intact.
  //
  // Vérifier la source d'une intention ne dit RIEN de ce qui sort. Ici on ne
  // peut pas relire le HTML produit (le banc de la CI ne construit pas), donc
  // on exige la balise explicite, celle dont on a vérifié à la main qu'elle
  // apparaît bien dans le document servi.
  verifier('la balise apple-mobile-web-app-capable est écrite explicitement',
    /name="apple-mobile-web-app-capable"\s+content="yes"/.test(layout),
    'sans elle, iOS ignore les 19 images et le flash blanc revient')
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
  // ⚠️ LE FOND DE L'ICÔNE ET CELUI DU MANIFESTE SONT LA MÊME COULEUR.
  // Android peint l'icône, centrée, sur `background_color`. Tant que l'icône
  // portait un dégradé plus clair que ce fond, un CARRÉ ARRONDI se détachait
  // au lancement, et on lisait deux écrans au lieu d'un enchaînement. Les deux
  // valeurs vivent dans deux fichiers sans lien mécanique : les séparer fait
  // revenir le carré en silence.
  verifier("le fond de l'icône est celui du manifeste, sinon le carré revient",
    ENCRE.toUpperCase() === manifeste.background_color.toUpperCase(),
    `icône ${ENCRE}, manifeste ${manifeste.background_color}`)
  verifier("l'icône générée est bien un APLAT, sans dégradé",
    !/linearGradient|radialGradient/.test(svgIcone(512)),
    'un dégradé plus clair que le fond redessine le carré')

  const teinte = layout.match(/themeColor:\s*["'](#[0-9A-Fa-f]{6})["']/)
  verifier('le layout déclare une teinte de thème', Boolean(teinte))
  verifier('et le manifeste annonce la MÊME teinte que le layout',
    Boolean(teinte) && manifeste.theme_color.toUpperCase() === teinte[1].toUpperCase(),
    `manifeste ${manifeste.theme_color}, layout ${teinte ? teinte[1] : '?'}`)
}

// ══════════════════════════════════════════════════════════════════
// 7. LE PREMIER JET DE LA PAGE EST DÉJÀ LE SPLASH
// ══════════════════════════════════════════════════════════════════
// L'image native peut être parfaite, si la page peint l'accueil EN CLAIR avant
// de monter le splash, le lancement montre deux arrivées de suite : le dégradé
// natif, un éclair d'app claire, puis l'animation. Alex l'a vu le 19/08 et l'a
// décrit comme « deux animations ».
//
// La cause tenait dans une seule valeur : `useState(false)`. La contrainte qui
// l'avait dictée (serveur et client d'accord, sinon mismatch d'hydration) est
// tout aussi bien servie par `true`. C'est le sens de la comparaison qui doit
// suivre, et c'est là que ça se recassera.
{
  const page = lire('app/commander/page.js')
  const i = page.indexOf('const [showSplash, setShowSplash]')
  verifier('la page déclare toujours showSplash', i > -1)
  if (i > -1) {
    const decl = page.slice(i, i + 200)
    verifier('le splash est monté DÈS LE PREMIER RENDU, serveur compris',
      /useState\(true\)/.test(decl),
      'à false, la page peint l’accueil en clair entre l’image native et le splash')
    // ⚠️ On INTERDIT le piège plutôt que d'exiger la formule juste : c'est
    // exactement `useState(false)` qui a produit le défaut.
    verifier('et surtout PAS à false', !/useState\(false\)/.test(decl))

    // La fenêtre englobe le commentaire qui explique la règle : la restreindre
    // ferait rougir la garde dès qu'on documente le pourquoi.
    const effet = page.slice(i, i + 2200)
    verifier("l'effet MASQUE le splash déjà vu, il ne le montre pas",
      /if \(sessionStorage\.getItem\('yoppaa_splash_seen'\)\) setShowSplash\(false\)/.test(effet),
      'la comparaison inversée ramènerait l’éclair clair')
    verifier('la condition n’est pas niée',
      !/if \(!sessionStorage\.getItem\('yoppaa_splash_seen'\)\) setShowSplash\(true\)/.test(effet))
  }

  // La sortie du splash : opaque d'abord, effacée ensuite. Une dissolution qui
  // part de 0 % laisse lire l'accueil À TRAVERS le wordmark pendant toute sa
  // durée. C'est ce qu'Alex a vu sur Android.
  const sortie = page.match(/@keyframes splash-out \{([^}]*\})*[^}]*\}/)
  verifier('la sortie du splash est toujours définie', Boolean(sortie))
  if (sortie) {
    verifier('le fond du splash reste OPAQUE avant de s’effacer',
      /0%,\s*\d+%\s*\{\s*opacity:\s*1/.test(sortie[0]),
      'sans palier, on lit l’accueil à travers le splash pendant toute la dissolution')
  }
  // Et la durée de l'animation doit rester celle du démontage, sinon le splash
  // saute ou bloque le doigt après être devenu invisible.
  const duree = page.match(/'splash-out ([\d.]+)s/)
  const demontage = page.match(/setTimeout\(\(\) => onDone\(\),\s*(\d+)\)/)
  const debutSortie = page.match(/setPhase\(4\), (\d+)\)/)
  verifier('la durée de sortie et le démontage sont lisibles',
    Boolean(duree && demontage && debutSortie))
  if (duree && demontage && debutSortie) {
    verifier('le splash est démonté quand son effacement se termine',
      Number(demontage[1]) === Number(debutSortie[1]) + Number(duree[1]) * 1000,
      `sortie à ${debutSortie[1]} ms + ${duree[1]} s ≠ démontage à ${demontage[1]} ms`)
  }
}

// ══════════════════════════════════════════════════════════════════
// 8. L'ENCHAÎNEMENT DU TOUT PREMIER LANCEMENT
// ══════════════════════════════════════════════════════════════════
// Les 4 écrans d'accueil ont vécu des semaines sans que PERSONNE ne les voie :
// `yoppaa_onboarding_done` était écrit à six endroits et lu à aucun. Un
// drapeau que tout le monde pose et que personne ne consulte ne rougit nulle
// part, ne casse rien, et coûte une fonctionnalité entière.
{
  const page = lire('app/commander/page.js')
  const onb = lire('app/onboarding/page.js')

  verifier("l'accueil LIT le drapeau d'onboarding, il ne fait pas que l'écrire",
    /localStorage\.getItem\('yoppaa_onboarding_done'\)/.test(page),
    'écrit six fois et lu zéro : les 4 écrans restaient invisibles')
  verifier("et il envoie vers /onboarding quand il manque",
    /router\.replace\('\/onboarding'\)/.test(page))
  verifier('le splash ne se joue PAS le jour du premier lancement',
    /yoppaa_onboarding_done'\)\)\s*\{\s*setShowSplash\(false\)/s.test(page),
    'sinon : écran système, puis 2,4 s d’animation, puis 4 écrans')
  verifier("l'onboarding terminé ne se refait pas au bouton Retour",
    /localStorage\.setItem\('yoppaa_onboarding_done', '1'\)\s*\n[^\n]*\n[^\n]*\n[^\n]*\n\s*router\.replace\('\/commander'\)/.test(onb) ||
    /router\.replace\('\/commander'\)/.test(onb))

  // ⚠️ LA PROMESSE QU'ON NE TENAIT PAS. L'écran des notifications annonçait
  // « 1 notif par jour maximum ». Alex a confirmé le 19/08 que c'est FAUX :
  // rien ne plafonne quoi que ce soit. On INTERDIT le retour de toute
  // promesse de fréquence, plutôt que d'exiger une formule précise.
  //
  // ⚠️ ON TESTE CE QUE LE CLIENT LIT, PAS LE FICHIER ENTIER. Première version
  // de cette garde : elle rougissait sur le commentaire ci-dessus, qui CITE la
  // phrase fautive pour expliquer pourquoi elle est partie. Une garde qui
  // interdit d'expliquer un défaut finit par se faire désarmer.
  // ⚠️ ON RETIRE LES BLOCS ENTIERS, PAS LES LIGNES QUI COMMENCENT PAR `//`.
  // Deuxième version de ce filtre. La première ne coupait que les lignes
  // préfixées, or un commentaire JSX `{/* … */}` a des lignes de SUITE qui
  // commencent par du texte ordinaire : elles passaient au travers, et la
  // garde du logo y trouvait « <YoppaaLogo /> » alors que le composant avait
  // disparu du rendu. Mesurée par mutation, elle était muette.
  const onbVisible = onb
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')  // commentaires JSX
    .replace(/\/\*[\s\S]*?\*\//g, '')            // commentaires de bloc
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
  verifier("l'onboarding ne promet AUCUNE fréquence de notification",
    !/notif[^.]{0,40}par jour|par jour[^.]{0,20}maximum|\d+\s*notifs?\s*\/\s*jour/i.test(onbVisible),
    'un chiffre écrit au client est un engagement, et celui-là n’était pas tenu')

  // Le logo : la spec vit dans UN composant, pas recopiée à la main.
  // ⚠️ `onbVisible` ET PAS `onb`, POUR LA MÊME RAISON QUE PLUS HAUT.
  // Première version : le commentaire qui explique la règle cite
  // « <YoppaaLogo /> ». La garde le trouvait LÀ et restait verte alors que le
  // composant avait disparu du rendu. Mesurée par mutation, elle était muette.
  verifier("l'onboarding affiche le logo canonique",
    /<YoppaaLogo/.test(onbVisible))
  verifier('et ne redessine pas les points à la main',
    !/dotPulse 2s/.test(onbVisible),
    'trois points dessinés à la main quand la marque en a cinq')

  // Le fond doit finir sur l'encre, comme le splash, sinon la couture qu'on a
  // supprimée entre l'image native et la page revient un écran plus loin.
  verifier("le fond de l'onboarding finit sur l'encre du splash",
    /\$\{T\.ink\} 100%\)/.test(onb),
    'il finissait sur ${T.main}88, donc la couleur changeait en arrivant')
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Écrans de lancement verts.')
