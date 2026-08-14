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
  bordsDefilement, pasDefilement, PAS_MINIMUM,
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

// ═══════════════════════════════════════════════════════════════════════════
// LES FLÈCHES DE DÉFILEMENT DU TABLEAU DE BORD
// ═══════════════════════════════════════════════════════════════════════════
// Le tableau de bord est né sur téléphone : ses barres d'onglets, ses jours,
// ses filtres et ses raccourcis défilent au doigt et masquent leur barre pour
// rester propres. À la souris, il ne restait NI barre, NI flèche, NI le moindre
// indice qu'il y avait huit onglets de plus à droite.
//
// ⚠️ CE QUI SE TESTE VRAIMENT ICI, c'est la décision d'ALLUMER une flèche. Une
// flèche éteinte au mauvais moment cache du contenu ; une flèche allumée dans
// le vide fait cliquer sur rien. On EXÉCUTE donc la fonction avec de vraies
// mesures de navigateur et on lit ce qu'elle rend.

// Bande plus large que sa fenêtre, au tout début : rien à gauche, tout à droite.
egal('au départ, seule la flèche droite est allumée',
  bordsDefilement({ scrollLeft: 0, scrollWidth: 900, clientWidth: 400 }),
  { gauche: false, droite: true })
// Au milieu, les deux.
egal('au milieu, les deux flèches sont allumées',
  bordsDefilement({ scrollLeft: 250, scrollWidth: 900, clientWidth: 400 }),
  { gauche: true, droite: true })
// Arrivé au bout, plus rien à droite.
egal('au bout, la flèche droite s\'éteint',
  bordsDefilement({ scrollLeft: 500, scrollWidth: 900, clientWidth: 400 }),
  { gauche: true, droite: false })
// Bande qui tient entièrement : aucune flèche, sinon on cliquerait dans le vide.
egal('une bande entièrement visible n\'affiche aucune flèche',
  bordsDefilement({ scrollLeft: 0, scrollWidth: 380, clientWidth: 400 }),
  { gauche: false, droite: false })

// ⚠️ LE PIXEL FRACTIONNAIRE, et il se serait vu tous les jours. Les navigateurs
// rendent des largeurs à la virgule : arrivé au bout, le reste ne vaut pas 0
// mais 0,4 px. Sans tolérance, la flèche droite resterait allumée en permanence
// sur une bande pourtant terminée.
egal('un reste de 0,4 pixel n\'allume pas la flèche',
  bordsDefilement({ scrollLeft: 499.6, scrollWidth: 900, clientWidth: 400 }),
  { gauche: true, droite: false })
egal('un scrollLeft de 0,5 pixel n\'allume pas la flèche gauche',
  bordsDefilement({ scrollLeft: 0.5, scrollWidth: 900, clientWidth: 400 }).gauche, false)
// Un vrai reste, lui, doit bien allumer.
egal('un reste de 40 pixels allume encore la flèche',
  bordsDefilement({ scrollLeft: 460, scrollWidth: 900, clientWidth: 400 }).droite, true)
// Appelée sans rien (premier rendu, avant montage) : aucune flèche, pas d'erreur.
egal('sans mesure, aucune flèche', bordsDefilement(), { gauche: false, droite: false })

// Le pas : franc, mais jamais plus large que la fenêtre, sinon on saute
// par-dessus des éléments et le commerçant croit en avoir perdu.
egal('le pas vaut 70 % de la largeur visible', pasDefilement(1000), 700)
verifier('le pas ne dépasse jamais la fenêtre', pasDefilement(1000) < 1000)
egal('sur une bande étroite, un plancher évite l\'immobilité', pasDefilement(50), PAS_MINIMUM)
egal('un pas imposé est respecté', pasDefilement(1000, 240), 240)

// ⚠️ LA RÈGLE DU CHANTIER : les flèches S'AJOUTENT sur PC, elles ne réécrivent
// pas le mobile. Sur téléphone elles n'existent pas du tout.
const socleFleches = socle.slice(socle.indexOf('les flèches de défilement'))
verifier('la flèche n\'existe pas par défaut',
  /\.bande-fleche\s*\{[^}]*display:\s*none/.test(socleFleches))
verifier('elle n\'apparaît qu\'au-delà du seuil bureau',
  new RegExp(`@media \\(min-width: ${SEUIL_BUREAU}px\\) and \\(hover: hover\\) and \\(pointer: fine\\)`).test(socleFleches))
// Sur une tablette tactile large, une flèche serait un piège : on la viserait
// au doigt. D'où la double condition, et pas seulement la largeur.
verifier('le pointeur fin est exigé, pas seulement la largeur',
  /pointer: fine/.test(socleFleches))
verifier('aucune max-width ne se glisse dans la section',
  !/max-width/.test(socleFleches))
// Une flèche éteinte qui répond quand même est pire que pas de flèche du tout.
verifier('la flèche éteinte cesse d\'être cliquable',
  /\[data-active="non"\][^}]*pointer-events:\s*none/.test(socleFleches))
// ⚠️ `filter`, JAMAIS `transform` : un élément transformé devient le bloc
// conteneur de ses descendants en `position: fixed`. Leçon du 09/08.
verifier('le survol n\'utilise pas transform',
  !/\.bande-fleche:hover\s*\{[^}]*transform/.test(socleFleches))
verifier('le clavier garde un contour visible',
  /\.bande-fleche:focus-visible/.test(socleFleches))

// ⚠️ LA PISTE NE PORTE PAS `data-scroll-x` : cet attribut déclenche
// `flex-wrap: wrap` au-delà de 1024 px, et la barre d'onglets partirait sur
// trois lignes. Les flèches n'auraient alors plus rien à faire défiler.
const composantBande = lire('app/components/BandeDefilante.js')
verifier('la piste ne porte pas data-scroll-x', !/data-scroll-x/.test(composantBande.replace(/\/\/.*$/gm, '')))
// Et le composant doit APPELER la logique, pas la recopier : deux formules qui
// divergent, ce sont deux comportements pour une seule flèche.
verifier('le composant appelle bordsDefilement', /bordsDefilement\(el\)/.test(composantBande))
verifier('le composant appelle pasDefilement', /pasDefilement\(el\.clientWidth, pas\)/.test(composantBande))
verifier('la flèche annonce son état au DOM', /data-active=\{bords\.(gauche|droite) \? 'oui' : 'non'\}/.test(composantBande))
// Une flèche éteinte ne doit pas non plus se ramasser au clavier.
verifier('la flèche éteinte sort du parcours clavier', /tabIndex=\{bords\.(gauche|droite) \? 0 : -1\}/.test(composantBande))

// ⚠️ LE TEST QUI COMPTE POUR LA SUITE : plus aucune bande du tableau de bord ne
// doit défiler sans flèche. Une barre ajoutée demain avec `overflowX: 'auto'`
// et sans enveloppe redeviendrait invisible sur PC sans que personne ne le voie.
const ECRANS_DASHBOARD = ['app/dashboard/page.js', 'app/dashboard/ConfigDashboard.js', 'app/dashboard/AgendaRdv.js']
let bandes = 0
for (const chemin of ECRANS_DASHBOARD) {
  const src = lire(chemin)
  const lignes = src.split('\n')
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i]
    // On vise les bandes HORIZONTALES seulement : une zone qui défile aussi en
    // vertical (la grille de l'agenda, un tableau) a sa propre navigation.
    if (!/overflowX:\s*'auto'/.test(ligne)) continue
    if (/overflowY/.test(ligne)) continue
    bandes++
    // ⚠️ ON REGARDE LA LIGNE ET CELLE D'AVANT. La première version exigeait
    // l'enveloppe sur la MÊME ligne que le style : une bande écrite sur deux
    // lignes, ce qui est le cas dès qu'elle porte quelques propriétés, la
    // faisait rougir alors qu'elle était parfaitement enveloppée. Le test
    // verrouillait la mise en forme du code au lieu de la règle.
    const voisinage = (lignes[i - 1] || '') + ligne
    verifier(`${chemin} : une bande reste atteignable à la souris`,
      /<BandeDefilante/.test(voisinage), ligne.trim().slice(0, 80))
  }
}
verifier('toutes les bandes du tableau de bord sont passées en revue', bandes >= 6, `${bandes} trouvées`)

// Les chiffres du jour : 2 × 2 sur téléphone, étalés sur une seule ligne dès
// qu'il y a la place. Ils ne défilent pas, ils s'étirent.
verifier('les compteurs du jour s\'étalent sur PC',
  /\.stats-grid\s*\{[^}]*repeat\(auto-fit/.test(socle))

// ═══════════════════════════════════════════════════════════════════════════
// LE TABLEAU DE BORD NE DÉFILE PAS LATÉRALEMENT
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ EN CSS, UN AXE EN `auto` FORCE L'AUTRE À DEVENIR DÉFILABLE. `.scroll-zone`
// portait `overflow-y: auto` sans rien dire de l'horizontal : il suffisait
// qu'un enfant dépasse d'un pixel pour que toute la page glisse. Le commerçant
// voyait ses cartes décalées et une bande vide à droite, sans comprendre ce
// qu'il avait fait. Constaté par Alex le 13/08 sur l'onglet Profil.
const dashSrc = lire('app/dashboard/page.js')
verifier('la zone de défilement bloque l’axe horizontal',
  /\.scroll-zone\s*\{[^}]*overflow-x:\s*hidden/.test(dashSrc))
// ⚠️ MASQUER NE SUFFIT PAS : sans plafond, `overflow-x: hidden` se contenterait
// de COUPER ce qui dépasse, et le bord droit des cartes disparaîtrait sans que
// rien ne le signale. C'est pire que le défilement, qui au moins se voit.
verifier('et le contenu s’adapte au lieu d’être coupé',
  /\.scroll-zone > \*\s*\{[^}]*max-width:\s*100%/.test(dashSrc))
verifier('les champs et les images ne débordent pas non plus',
  /\.scroll-zone :where\(input, textarea, select, img, video, table\)/.test(dashSrc))

// Les cartes de Config, qui sont ce que le commerçant regarde le plus.
const cfgSrc = lire('app/dashboard/ConfigDashboard.js')
// ⚠️ ON JUGE LE CONTENU DES DEUX STYLES, pas la mise en forme du code. La
// première version exigeait les trois propriétés à la suite : un commentaire
// glissé entre deux lignes la faisait rougir, alors que le style était juste.
// Un test qui fige la façon d'écrire interdit d'expliquer le pourquoi.
for (const nom of ['card', 'cardActive']) {
  const debut = cfgSrc.indexOf(`  ${nom}: {`)
  const bloc = debut === -1 ? '' : cfgSrc.slice(debut, cfgSrc.indexOf('\n  },', debut))
  verifier(`le style « ${nom} » ne peut plus pousser la page`,
    /boxSizing: 'border-box'/.test(bloc)
    && /maxWidth: '100%'/.test(bloc)
    && /overflowWrap: 'anywhere'/.test(bloc), bloc ? 'trouvé mais incomplet' : 'style introuvable')
}

// ⚠️ Un mot insécable force la largeur de son conteneur quelles que soient les
// règles au-dessus : une adresse email de quarante-huit caractères suffit.
verifier('un mot insécable ne pousse plus la carte',
  /overflowWrap: 'anywhere'/.test(cfgSrc))

// ⚠️ `nowrap` sans plafond pousse la page hors de l'écran : un libellé comme
// « Primeur (fruits et légumes) » refuse de se couper et élargit la rangée,
// donc la carte, donc la page entière.
const selSrc = lire('app/components/SelecteurTypes.js')
verifier('une pastille de métier ne dépasse plus la largeur disponible',
  /whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis'/.test(selSrc))

// ═══════════════════════════════════════════════════════════════════════════
// AUCUNE BANDE QUI DÉFILE SANS SES FLÈCHES, DANS TOUT LE TABLEAU DE BORD
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ RÈGLE D'ALEX, 15/08 : « quand les onglets sont plus larges que l'écran, le
// commerçant doit être guidé, il ne doit pas deviner. Cette règle s'applique
// partout. »
//
// Elle avait déjà été appliquée le 10/08, puis oubliée deux fois : la barre des
// sous-onglets RDV et celle des signaux étaient restées de simples `flex` où
// les libellés se comprimaient jusqu'à devenir illisibles. Le cinquième onglet
// RDV, Abonnements, a rendu le défaut évident.
//
// Le test ne cherche pas un composant, il cherche UN DÉFAUT : une piste qui
// défile à l'horizontale sans que rien ne le signale. La question posée est
// « à qui appartient ce style ? », et la réponse doit toujours être
// BandeDefilante.
const FICHIERS_BUREAU = ['app/dashboard/page.js', 'app/dashboard/ConfigDashboard.js', 'app/dashboard/AgendaRdv.js']

function pistesSansFleches(src) {
  const nues = []
  for (const m of src.matchAll(/overflowX: *'auto'/g)) {
    // L'élément qui porte le style est celui dont la balise s'ouvre juste
    // avant : on remonte au dernier `<` et on lit son nom.
    const debutBalise = src.lastIndexOf('<', m.index)
    if (debutBalise < 0) { nues.push('style orphelin'); continue }
    const nom = src.slice(debutBalise + 1).match(/^[A-Za-z][\w.]*/)?.[0] || '?'
    if (nom !== 'BandeDefilante') nues.push(`<${nom}> ligne ${src.slice(0, m.index).split('\n').length}`)
  }
  return nues
}

// ⚠️ ON MESURE LA SONDE AVANT DE S'EN SERVIR. Sans ces deux cas, un balayage
// qui ne trouve jamais rien passerait pour une preuve alors qu'il ne prouve
// rien du tout.
verifier('une piste nue est bien repérée',
  pistesSansFleches(`<div style={{ overflowX: 'auto' }}>`).length === 1)
verifier('une piste enveloppée ne l’est pas',
  pistesSansFleches(`<BandeDefilante style={{ overflowX: 'auto' }}>`).length === 0)

for (const chemin of FICHIERS_BUREAU) {
  const nues = pistesSansFleches(lire(chemin))
  verifier(`${chemin} ne laisse aucune bande défiler sans flèches`,
    nues.length === 0, nues.join(' · '))
}

// ─── LE VOILE DE BORD EXISTE AUSSI SUR TÉLÉPHONE ──────────────────────────
// ⚠️ REMARQUE D'ALEX, 15/08 : « il faut un indice visuel sur mobile aussi, car
// on ne sait pas toujours qu'il y a d'autres onglets et le commerçant passera à
// côté. » Les flèches, elles, sont volontairement réservées au bureau : sur
// téléphone c'est le doigt. Mais encore faut-il SAVOIR qu'il y a quelque chose
// à faire glisser.
//
// Le défaut à interdire est donc précis : un voile enfermé dans un
// `@media (min-width: …)` serait invisible là où il sert le plus.
const cssGlobal = lire('app/globals.css')

// Les plages du fichier qui vivent à l'intérieur d'un `@media`.
function plagesMedia(css) {
  const plages = []
  for (const m of css.matchAll(/@media/g)) {
    const ouvre = css.indexOf('{', m.index)
    if (ouvre < 0) continue
    let profondeur = 0
    for (let i = ouvre; i < css.length; i++) {
      if (css[i] === '{') profondeur++
      else if (css[i] === '}') {
        profondeur--
        if (profondeur === 0) { plages.push([ouvre, i]); break }
      }
    }
  }
  return plages
}

function vitHorsMedia(css, selecteur) {
  const idx = css.indexOf(selecteur)
  if (idx < 0) return false
  return !plagesMedia(css).some(([d, f]) => idx > d && idx < f)
}

// ⚠️ ON MESURE LA SONDE AVANT DE S'EN SERVIR, sur les deux réponses possibles.
verifier('la sonde voit une règle libre',
  vitHorsMedia('.a { color: red }', '.a'))
verifier('la sonde voit une règle enfermée dans un média',
  !vitHorsMedia('@media (min-width: 1024px) { .a { color: red } }', '.a'))
verifier('et un média refermé ne piège pas la règle qui suit',
  vitHorsMedia('@media (min-width: 1024px) { .b { color: red } } .a { color: blue }', '.a'))

verifier('le voile de bord droit s’applique à toutes les largeurs',
  vitHorsMedia(cssGlobal, '.bande-defilante[data-droite="oui"]'))
verifier('le voile de bord gauche aussi',
  vitHorsMedia(cssGlobal, '.bande-defilante[data-gauche="oui"]'))
// ⚠️ Le masque, pas un dégradé : ces barres n'ont pas toutes le même fond, et
// un dégradé vers le blanc salirait la moitié d'entre elles.
verifier('le voile masque le contenu plutôt que de peindre un fond',
  /\.bande-defilante\[data-droite="oui"\][^}]*mask-image/.test(cssGlobal))
// ⚠️ Et surtout aucun flou : c'est ce qui avait fait geler le défilement iPhone.
verifier('le voile n’introduit aucun flou',
  !/\.bande-defilante\[data-[^}]*(backdrop-)?filter: *blur/.test(cssGlobal))

// L'état doit remonter sur l'enveloppe, sinon le CSS ci-dessus ne s'allume
// jamais. Les flèches et le voile lisent la MÊME mesure.
const srcBande = lire('app/components/BandeDefilante.js')
verifier('l’enveloppe porte l’état du bord gauche', /data-gauche=\{bords\.gauche/.test(srcBande))
verifier('l’enveloppe porte l’état du bord droit', /data-droite=\{bords\.droite/.test(srcBande))

// Les classes CSS qui déclarent le défilement doivent elles aussi être portées
// par une BandeDefilante : `.jours-wrap` et `.filtres-wrap` du tableau de bord
// défilent sans un seul style en ligne.
const srcBureau = lire('app/dashboard/page.js')
for (const m of srcBureau.matchAll(/\.([a-z-]+) *\{[^}]*overflow-x: *auto/g)) {
  const classe = m[1]
  const utilisee = new RegExp(`<BandeDefilante[^>]*className="${classe}"`).test(srcBureau)
  verifier(`la classe défilante « ${classe} » est portée par une BandeDefilante`, utilisee)
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Socle bureau vert.')
