// Banc du chantier BUREAU.
//
// Ce banc n'existe pas pour vérifier que c'est joli sur un grand écran : ça, ça
// se regarde. Il existe pour verrouiller LA RÈGLE qui gouverne tout le
// chantier, et qui se perdra sûrement d'ici quelques semaines si rien ne la
// tient :
//
//   ⚠️ L'APPLICATION EST NÉE MOBILE ET LE RESTE. Le bureau s'AJOUTE par-dessus,
//   uniquement en `min-width`, et ne réécrit JAMAIS le rendu du téléphone.
//
// Ce n'est pas une préférence : Apple refuse les PWA emballées (règle 4.2),
// donc il y aura un shell natif, et ce shell affichera la branche mobile.
// Si le bureau la modifiait, chaque fonctionnalité future serait à écrire deux
// fois et chaque correctif à appliquer deux fois. C'est exactement le genre de
// divergence qui a fait perdre ses photos à une des deux fiches commerçant.

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import {
  SEUIL_BUREAU, SEUIL_LARGE, LARGEUR_CONTENU, LARGEUR_CONTENU_BUREAU,
  LARGEUR_CHAMP, LARGEUR_TEXTE_LONG,
} from '../lib/responsive.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// Les écrans du Yopper. Le tableau de bord a sa propre coquille, déjà prête
// pour le bureau depuis longtemps (barre latérale à 1100 px).
const ECRANS_CLIENT = [
  'app/commander/page.js',
  'app/commander/[slug]/page.js',
  'app/commander/rdv/[slug]/page.js',
  'app/commander/morning/page.js',
  'app/commander/cancel/page.js',
  'app/commander/rdv/cancel/page.js',
  'app/classement/page.js',
  'app/login/page.js',
]

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES SEUILS — un seul endroit, sinon ils divergent
// ═══════════════════════════════════════════════════════════════════════════
egal('le seuil bureau est 1024', SEUIL_BUREAU, 1024)
verifier('le seuil large vient après le seuil bureau', SEUIL_LARGE > SEUIL_BUREAU)
verifier('la largeur de contenu est celle du mobile pour l\'instant', LARGEUR_CONTENU === 760)
// Un champ d'une ligne doit rester plus étroit qu'un pavé de texte : au-delà
// d'environ 560 px, l'œil perd le début de la ligne en arrivant à la fin.
verifier('un champ court est plus étroit qu\'un texte long', LARGEUR_CHAMP < LARGEUR_TEXTE_LONG)
verifier('les deux tiennent dans la colonne actuelle', LARGEUR_TEXTE_LONG <= LARGEUR_CONTENU)

const css = lire('app/globals.css')
const socle = css.slice(css.indexOf('SOCLE BUREAU'))
verifier('le socle bureau existe dans la feuille globale', socle.length > 500)

// ⚠️ LA RÈGLE, VÉRIFIÉE : aucune media query du socle ne doit s'appliquer sous
// le seuil. Une seule `max-width` glissée ici, et le rendu du téléphone se met
// à dépendre du travail bureau.
const requetes = [...socle.matchAll(/@media\s*\(([^)]*)\)/g)].map(m => m[1].trim())
verifier('le socle contient bien des media queries', requetes.length >= 2)
for (const r of requetes) {
  const minw = /min-width:\s*(\d+)px/.exec(r)
  const estCapacite = /hover:|pointer:|prefers-/.test(r)
  verifier(`« ${r} » ne touche pas au mobile`,
    estCapacite || (minw && Number(minw[1]) >= SEUIL_BUREAU))
}
// ⚠️ C'est la CONDITION des media queries qu'on interdit, pas la propriété.
// La première version de ce test refusait la chaîne « max-width: » n'importe
// où, et il est passé au rouge dès que la phase 2 a plafonné la largeur de la
// colonne. Un plafond de largeur est légitime ; une media query `max-width`
// dans le socle bureau ne l'est pas, parce qu'elle ferait dépendre le rendu du
// téléphone du travail PC.
verifier('aucune media query max-width dans le socle bureau',
  !requetes.some(r => /max-width/.test(r)))
// Le seuil écrit dans la feuille doit être CELUI du module, pas un jumeau.
verifier('la feuille utilise le seuil du module',
  socle.includes(`min-width: ${SEUIL_BUREAU}px`))

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE FOCUS CLAVIER — il n'existait nulle part
// ═══════════════════════════════════════════════════════════════════════════
verifier('l\'anneau de focus existe', /:focus-visible/.test(css))
// `:focus-visible` et non `:focus` : le second afficherait l'anneau après un
// simple clic à la souris, ce qui donne l'air d'un bug.
verifier('l\'anneau ne s\'affiche pas après un clic',
  !/[^-]:focus\s*\{/.test(socle))
for (const balise of ['a', 'button', 'input', 'textarea', 'select', '[role="button"]']) {
  verifier(`le focus couvre ${balise}`, socle.includes(balise))
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE SURVOL — et le piège du téléphone
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ Sans la garde `(hover: hover)`, un téléphone applique l'état de survol au
// premier effleurement et le garde COLLÉ jusqu'au tap suivant : le bouton reste
// assombri sans raison. C'est le défaut classique du survol non gardé.
// Les commentaires sont retirés : ils ont le droit d'expliquer POURQUOI on
// n'utilise pas `transform`, c'est même leur travail. Seul le CSS appliqué
// compte, exactement comme sur le banc de la fiche.
// On part du `@media` lui-même, pas du titre de section : le commentaire qui
// précède a le droit d'expliquer POURQUOI on n'utilise pas `transform`, c'est
// même son travail. Seul le CSS réellement appliqué est jugé.
const blocSurvol = socle.slice(socle.indexOf('@media (hover'), socle.indexOf('3. Les défilements'))
verifier('le survol est gardé par la capacité du pointeur',
  /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)/.test(blocSurvol))
verifier('le survol donne bien un retour visuel', /:hover\s*\{[^}]*filter/.test(blocSurvol))
// ⚠️ `transform` ferait de chaque bouton un bloc conteneur pour ses
// descendants en `position: fixed`. La règle est globale : elle doit rester
// sans effet de bord.
verifier('le survol n\'utilise ni transform ni will-change',
  !/transform|will-change/.test(blocSurvol))
verifier('les boutons désactivés ne réagissent pas', /button:not\(:disabled\)/.test(blocSurvol))

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES DÉFILEMENTS HORIZONTAUX — du contenu qu'on ne pouvait pas atteindre
// ═══════════════════════════════════════════════════════════════════════════
// Sept carrousels côté client, et les sept masquaient leur barre. Au doigt
// c'est juste ; à la souris il n'y avait ni barre, ni flèche, ni indice qu'il
// restait des photos ou des produits à droite.
//
// LE TEST QUI COMPTE : tout NOUVEAU carrousel doit être atteignable. Un
// `scrollbarWidth: 'none'` sans marqueur, et le contenu redevient invisible
// sur PC sans que personne ne s'en aperçoive.
const CLASSES_CONNUES = ['cat-bar', 'jours-wrap', 'filtres-wrap', 'cats', 'day-scroll']
let carrousels = 0
for (const chemin of [...ECRANS_CLIENT, 'app/components/GalerieCommerce.js']) {
  let src
  try { src = lire(chemin) } catch { continue }
  for (const ligne of src.split('\n')) {
    if (!/scrollbarWidth:\s*'none'/.test(ligne)) continue
    carrousels++
    const marque = ligne.includes('data-scroll-x')
      || CLASSES_CONNUES.some(c => ligne.includes(`className="${c}"`))
    verifier(`${chemin} : un carrousel reste atteignable à la souris`, marque,
      ligne.trim().slice(0, 90))
  }
}
verifier('tous les carrousels connus sont passés en revue', carrousels >= 5, `${carrousels} trouvés`)
// La barre revient sur PC, et seulement sur PC.
const blocDefile = socle.slice(socle.indexOf('3. Les défilements'))
verifier('la barre est rendue au-delà du seuil', /scrollbar-width:\s*thin\s*!important/.test(blocDefile))
// ⚠️ `!important` est indispensable : `scrollbarWidth: 'none'` est écrit en
// style EN LIGNE dans cinq de ces endroits, et rien d'autre ne peut le battre.
verifier('le style en ligne est bien surchargé', /!important/.test(blocDefile))
verifier('les navigateurs WebKit sont couverts', /::-webkit-scrollbar/.test(blocDefile))
verifier('le marqueur partagé est reconnu', /\[data-scroll-x\]/.test(blocDefile))

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA HAUTEUR D'ÉCRAN — dvh et jamais vh
// ═══════════════════════════════════════════════════════════════════════════
// `100vh` ignore la barre d'adresse mobile et le clavier : l'écran déborde
// d'une centaine de pixels, et le bouton du bas passe sous la ligne de flottaison.
for (const chemin of ECRANS_CLIENT) {
  let src
  try { src = lire(chemin) } catch { continue }
  verifier(`${chemin} : hauteur en dvh, pas en vh`, !/\b100vh\b/.test(src))
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE TABLEAU DE BORD — des champs qui ne s'étirent plus à l'infini
// ═══════════════════════════════════════════════════════════════════════════
const dash = lire('app/dashboard/ConfigDashboard.js')
verifier('les champs du tableau de bord ont un plafond', /maxWidth: LARGEUR_CHAMP/.test(dash))
verifier('les textes longs ont le leur', /maxWidth: LARGEUR_TEXTE_LONG/.test(dash))
// Le plafond vient du module partagé, pas d'un nombre écrit à la main : c'est
// tout l'intérêt d'avoir un seul endroit.
verifier('les plafonds viennent du module partagé',
  /from '@\/lib\/responsive'/.test(dash))
// La coquille du tableau de bord était déjà prête pour le bureau : on ne la
// casse pas en passant.
const dashShell = lire('app/dashboard/page.js')
verifier('la barre latérale du tableau de bord tient toujours',
  /@media \(min-width: 1100px\)[\s\S]{0,120}\.sidebar \{ display: flex !important; \}/.test(dashShell))

// ═══════════════════════════════════════════════════════════════════════════
// 7. PHASE 2 — LA MISE EN PAGE
// ═══════════════════════════════════════════════════════════════════════════
// On ne juge que le CSS RÉELLEMENT APPLIQUÉ : on démarre au `@media` et on
// retire les commentaires. Sans ça, la phrase qui explique pourquoi `.cat-bar`
// est exclue de l'étalement suffisait à faire croire qu'elle y était incluse.
const brut2 = socle.slice(socle.indexOf('SOCLE BUREAU — phase 2'))
const phase2 = brut2.slice(brut2.indexOf('@media')).replace(/\/\*[\s\S]*?\*\//g, '')
verifier('la phase 2 existe', phase2.length > 500)

// La colonne s'élargit, et la largeur vient du module partagé.
verifier('la colonne s\'élargit sur grand écran',
  new RegExp(`\\.page-wrap\\s*\\{[^}]*max-width:\\s*${LARGEUR_CONTENU_BUREAU}px`).test(phase2))
// ⚠️ `!important` n'est pas de la paresse : chaque page porte son propre bloc
// <style> rendu DANS le corps, donc APRÈS la feuille globale. À spécificité
// égale, c'est la page qui gagne, et la règle bureau serait sans effet.
verifier('la largeur bureau bat le style de la page',
  /\.page-wrap\s*\{[^}]*max-width:[^;]*!important/.test(phase2))

// La navigation remonte, sans que le HTML change : `order: -1` suffit, et le
// balisage reste identique pour le futur shell natif.
verifier('la navigation remonte en tête', /\.navbar\s*\{[^}]*order:\s*-1/.test(phase2))
verifier('elle reste visible au défilement', /\.navbar\s*\{[^}]*position:\s*sticky/.test(phase2))
verifier('les onglets ne s\'étirent plus sur toute la largeur',
  /\.navbar-tabs\s*>\s*button\s*\{[^}]*flex:\s*0 0 auto\s*!important/.test(phase2))

// Deux colonnes dans 1200 px donneraient des cartes de 600 px, trop larges
// pour leur contenu.
verifier('les commerces passent à trois colonnes',
  /\.commerces-grid\s*\{[^}]*repeat\(3, 1fr\)\s*!important/.test(phase2))
verifier('les articles aussi',
  /\.articles-grid\s*\{[^}]*repeat\(3, 1fr\)\s*!important/.test(phase2))

// Les carrousels n'ont plus rien à cacher : la place existe.
verifier('les carrousels s\'étalent au lieu de défiler',
  /\.cats, \.day-scroll, \[data-scroll-x\]\s*\{[^}]*flex-wrap:\s*wrap\s*!important/.test(phase2))
// ⚠️ DÉCISION VOLONTAIRE : `.cat-bar` est la barre de catégories COLLANTE de la
// boutique. La faire passer sur trois lignes repousserait le catalogue hors de
// l'écran. Elle garde sa barre de défilement de la phase 1.
const reglesQuiEtalent = /\.cats, \.day-scroll, \[data-scroll-x\]/.exec(phase2)
verifier('la barre de catégories collante n\'est pas étalée',
  !!reglesQuiEtalent && !/\.cat-bar[^{]*\{[^}]*flex-wrap/.test(phase2))

// ── Le bandeau de haut de fiche ────────────────────────────────────────────
// ⚠️ Les deux fiches avaient des hauteurs de bandeau DIFFÉRENTES à chaque
// palier : 220/280 pour les rendez-vous, 240/300/340 pour la boutique. Elles
// sont censées se répondre au pixel près. Sur PC, une seule hauteur pour les
// deux, et c'est celle-ci qui fait autorité.
verifier('les deux fiches ont le même bandeau sur PC',
  /\.fiche-hero\s*\{[^}]*height:\s*360px\s*!important/.test(phase2))
// 1,5 rem était calibré pour un écran de 390 px : au milieu de 1200 px, le nom
// du commerce paraissait minuscule.
verifier('le nom du commerce est agrandi sur PC',
  /\.banniere-nom\s*\{[^}]*font-size:\s*2\.6rem\s*!important/.test(phase2))
verifier('le nom reste dans le tiers haut du bandeau',
  /\.banniere-commerce\s*\{[^}]*padding-top:\s*(\d+)px/.test(phase2)
  && Number(/\.banniere-commerce\s*\{[^}]*padding-top:\s*(\d+)px/.exec(phase2)[1]) < 360 / 3)

// ═══════════════════════════════════════════════════════════════════════════
// 8. AUCUN CADRE NE DOIT REMPLACER L'APPLICATION SUR PC
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA DÉCOUVERTE DU 09/08, ET LE PIÈGE LE PLUS SOURNOIS DE CE CHANTIER.
//
// Tout `/commander` était enveloppé, dès 1024 px, dans un `MobileFrame` : une
// IFRAME DE 393 PX à l'intérieur d'un faux iPhone dessiné en CSS. Un visiteur
// sur ordinateur ne voyait donc jamais l'application, il voyait la maquette
// d'un téléphone.
//
// Conséquence directe : à l'intérieur de l'iframe, la fenêtre fait 393 px, donc
// **TOUTE règle `min-width: 1024px` est inerte**. Les phases 1 et 2 étaient
// écrites, testées, vertes au banc… et parfaitement invisibles. Un cadre
// remis un jour par mégarde annulerait tout le chantier SANS FAIRE ROUGIR UNE
// SEULE VÉRIFICATION, puisque le CSS, lui, serait toujours là.
//
// D'où ce test, qui ne regarde pas le CSS mais l'ARBRE DES PAGES.
verifier('le cadre téléphone n\'existe plus',
  !existsSync(new URL('../app/components/MobileFrame.js', import.meta.url)))

function fichiersJs(dossier) {
  const base = new URL(`../${dossier}/`, import.meta.url)
  let entrees
  try { entrees = readdirSync(base) } catch { return [] }
  const sortie = []
  for (const e of entrees) {
    const chemin = `${dossier}/${e}`
    const abs = new URL(`../${chemin}`, import.meta.url)
    if (statSync(abs).isDirectory()) sortie.push(...fichiersJs(chemin))
    else if (/\.(js|jsx|tsx)$/.test(e)) sortie.push(chemin)
  }
  return sortie
}

for (const chemin of fichiersJs('app/commander')) {
  const src = lire(chemin)
  verifier(`${chemin} n'enferme pas l'application dans une iframe`, !/<iframe/.test(src), chemin)
  verifier(`${chemin} n'importe aucun cadre d'appareil`, !/MobileFrame|DeviceFrame|PhoneFrame/.test(src.replace(/\/\/.*$/gm, '')))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Socle bureau vert.')
