// BANC : LE KIT MÉDIA — l'affiche de vitrine, le logo et la sortie de la page.
//
// ⚠️ CE BANC EXISTE PARCE QUE MON ŒIL S'EST TROMPÉ TROIS FOIS D'AFFILÉE sur les
// proportions du logo, dans une maquette où la police de marque ne pouvait pas
// se charger. Un logo ne se juge pas sur une capture d'écran : il se compare à
// sa spec, chiffre par chiffre.
//
//   npm run verif:kit

import { readFileSync } from 'node:fs'
import { LOGO, proportionsLogo, pointsLogo, largeurPoints } from '../lib/logo.js'
import { verdictJauge } from '../lib/jauge-page.js'
import { policesEmbarquees, feuilleEnSvg, _oublierPolices } from '../lib/export-feuille.js'
import { getPrixPlan } from '../lib/plans.js'
import { accrocheKit, METIER_LIBRE_MAX } from '../lib/kit-accroche.js'
import { couperEnDeux, BADGES_AFFICHE, TEXTES_AFFICHE, TEXTES_CARTE_TABLE, MESSAGE_MAX, nettoyerMessage, textesAffiche, paletteAffiche } from '../lib/affiche-kit.js'
import { tailleBadge, BADGE_APP_STORE, BADGE_GOOGLE_PLAY } from '../lib/stores.js'
import { sansProse } from './lire-code.mjs'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// ⚠️ POUR CHERCHER CE QUI NE DOIT PAS EXISTER, ON LIT LE CODE SANS SA PROSE.
// Sixième fois en trois jours que je cherche un mot et le trouve dans MON
// PROPRE COMMENTAIRE : celui qui explique pourquoi `document.write` a été
// retiré contient forcément `document.write`. Retirer le commentaire serait
// perdre l'explication ; on dépouille le texte, une fois pour toutes.
// ⚠️ LE DÉPOUILLEUR EST PARTAGÉ (`scripts/lire-code.mjs`) : il vivait recopié
// dans huit bancs, et le défaut du 29/08 aurait dû être corrigé huit fois.
const lireCode = (chemin) => sansProse(lire(chemin))

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, Math.abs(obtenu - attendu) < 1e-9, `${obtenu} au lieu de ${attendu}`)

// ═══ 1) LES PROPORTIONS DU LOGO, EXÉCUTÉES ════════════════════════════════
//
// ⚠️ SPEC DU 12/06, ET ELLE NE SE NÉGOCIE PAS : c'est le seul endroit du projet
// où un chiffre faux ne se voit ni au lint, ni au build, ni à l'écran — il se
// voit sur une affiche imprimée, chez un commerçant, trop tard.
{
  const L = proportionsLogo(110)
  egal('le gros point vaut 0,254 du corps', L.dotBase, 110 * 0.254)
  egal('le petit point vaut 0,55 du gros', L.dotMini, 110 * 0.254 * 0.55)
  egal('l\'écart entre points vaut 0,55 du gros', L.dotGap, 110 * 0.254 * 0.55)
  egal('le décalage vaut 0,4 du gros', L.dotOffset, 110 * 0.254 * 0.4)
  egal('l\'écart wordmark → points vaut 0,28', L.wordmarkToDots, 110 * 0.28)
  egal('l\'écart points → slogan vaut 0,25', L.dotsToSlogan, 110 * 0.25)
  egal('le slogan vaut 0,236 du corps', L.sloganSize, 110 * 0.236)
  egal('le tracking vaut -0,05', L.tracking, 110 * -0.05)

  // ⚠️ CINQ POINTS, ET LE DÉCALAGE PORTE SUR LES TROIS DU MILIEU. C'est LUI qui
  // creuse le sourire : posé sur les deux petits seulement, le grand point
  // central reste aligné en haut et la courbe s'aplatit. Je l'ai fait, et il a
  // fallu qu'Alex me le dise.
  const P = pointsLogo(110)
  verifie('le logo a cinq points', P.length === 5, String(P.length))
  verifie('🔴 les points 2, 3 et 4 sont décalés',
    P[1].decalage > 0 && P[2].decalage > 0 && P[3].decalage > 0,
    P.map(p => p.decalage).join(' · '))
  verifie('🔴 les points 1 et 5 ne le sont pas',
    P[0].decalage === 0 && P[4].decalage === 0)
  // Le rythme gros / petit / gros / petit / gros.
  verifie('le rythme alterne gros et petit',
    P[0].diametre === P[2].diametre && P[2].diametre === P[4].diametre
    && P[1].diametre === P[3].diametre && P[1].diametre < P[0].diametre)
  // ⚠️ LA COURBE EST SYMÉTRIQUE, et c'est ce qui fait le sourire : les CENTRES
  // descendent jusqu'au point du milieu, puis remontent. Une garde sur les
  // seuls décalages ne le dirait pas, les diamètres différant.
  const centres = P.map(p => p.decalage + p.diametre / 2)
  verifie('🔴 la courbe descend puis remonte',
    centres[0] < centres[1] && centres[1] < centres[2]
    && centres[2] > centres[3] && centres[3] > centres[4],
    centres.map(c => c.toFixed(2)).join(' · '))
  verifie('et elle est symétrique',
    Math.abs(centres[0] - centres[4]) < 1e-9 && Math.abs(centres[1] - centres[3]) < 1e-9)

  egal('la rangée mesure la somme des points plus quatre écarts',
    largeurPoints(110), P.reduce((l, p) => l + p.diametre, 0) + L.dotGap * 4)

  // Tout est proportionnel : doubler le corps double chaque mesure.
  const D = proportionsLogo(220)
  verifie('tout suit le corps du wordmark',
    D.dotBase === L.dotBase * 2 && D.wordmarkToDots === L.wordmarkToDots * 2)
  verifie('le slogan est celui de la marque', LOGO.slogan === 'Ton quartier dans ta poche')
  verifie('et il ne porte pas de ponctuation finale', !/[.!?]$/.test(LOGO.slogan))
}

// ═══ 2) 🔴 LES DEUX RENDUS PARTAGENT LEURS MESURES ════════════════════════
//
// ⚠️ LE COMPOSANT ET L'AFFICHE NE PEUVENT PLUS DIVERGER. Le canvas recopiait
// les mêmes nombres de son côté : le jour où l'un bouge, l'autre ment, et
// personne ne s'en aperçoit puisque les deux ne sont jamais côte à côte.
{
  const composant = lire('app/components/YoppaaLogo.js')
  // ⚠️ L'AFFICHE EST DANS SON MODULE DEPUIS LE 23/08 : ces gardes lisaient
  // `ConfigDashboard`, où le canvas vivait. Repointées quand l'affiche a
  // déménagé pour servir aussi la page du kit.
  const affiche = lire('lib/affiche-kit.js')

  verifie('🔴 le composant lit les proportions partagées',
    /from '@\/lib\/logo'/.test(composant) && /proportionsLogo\(size\)/.test(composant))
  verifie('🔴 l\'affiche aussi',
    /from '\.\/logo'/.test(affiche) && /proportionsLogo\(WM\)/.test(affiche))
  verifie('et les deux posent leurs points par la même fonction',
    /pointsLogo\(/.test(composant) && /pointsLogo\(WM\)/.test(affiche))

  // ⚠️ AUCUN DES DEUX NE REDÉCLARE LES RATIOS. Une garde qui vérifierait juste
  // l'import laisserait passer une recopie posée juste à côté.
  for (const [nom, src] of [['le composant', composant], ['l\'affiche', affiche]]) {
    verifie(`${nom} ne recalcule pas 0,254 dans son coin`,
      !/\*\s*0\.254/.test(src), 'un ratio recopié divergera')
  }

  // ⚠️ EN CANVAS, `fillText` POSE LA BASELINE, pas le bas de la boîte de ligne.
  // Sans mesurer la descendante, l'écart wordmark/points dépend de la police
  // réellement chargée et change d'un poste à l'autre.
  verifie('🔴 l\'affiche mesure la descendante au lieu de la deviner',
    /fontBoundingBoxDescent/.test(affiche), 'l\'écart varierait selon la police chargée')
}

// ═══ 3) 🔴 L'AFFICHE : APLATS, LARGEUR TENUE, ET UNE SEULE VERSION ════════
//
// ⚠️ Alex, 22/08 : « Le fond doit être uni, pas de dégradé, cela pose problème
// à l'impression. » Il y en avait CINQ : le fond, un halo radial derrière le
// QR, deux filets et le texte de l'accroche lui-même.
//
// ⚠️ ET ELLE EST DESSINÉE UNE SEULE FOIS, dans `lib/affiche-kit.js`. Alex la
// voulait aussi dans la page du kit (23/08) : la recopier là-bas aurait donné
// deux visuels destinés au même mur, qui divergeraient au premier réglage.
{
  const bloc = lire('lib/affiche-kit.js')
  const dash = lire('app/dashboard/ConfigDashboard.js')
  const kit = lire('app/kit/[slug]/KitClient.js')
  verifie('l\'affiche vit dans son module', bloc.length > 1500, String(bloc.length))

  verifie('🔴 aucun dégradé linéaire dans l\'affiche', !/createLinearGradient/.test(bloc))
  verifie('🔴 aucun dégradé radial non plus', !/createRadialGradient/.test(bloc))
  verifie('🔴 et aucune ombre portée', !/shadowBlur|shadowColor/.test(bloc))
  verifie('le fond est un aplat', /ctx\.fillStyle = P\.fond/.test(bloc))

  // ⚠️ LE QR RESTE NOIR SUR BLANC quel que soit le fond : c'est la seule façon
  // de garantir qu'un téléphone le lise du premier coup.
  verifie('🔴 le QR garde son cadre blanc', /ctx\.fillStyle = '#FFFFFF'; cadre\(\); ctx\.fill\(\)/.test(bloc))

  // ⚠️ 🔴 LE QR ÉTAIT DÉCENTRÉ DE 32 PIXELS, et c'est de l'arithmétique pure :
  // le cadre mesure `QR + 32` et était posé à `PAD`, donc 56 px de marge à
  // gauche contre 24 à droite. Alex l'a vu sur son PNG.
  verifie('🔴 le cadre du QR est centré sur la largeur',
    /const qrX = Math\.round\(\(W - qrSz\) \/ 2\)/.test(bloc),
    'il repartait de la marge et débordait à droite')

  // ⚠️ 🔴 AUCUN TEXTE NE DOIT POUVOIR DÉBORDER. `fillText` ne replie ni ne
  // rétrécit : il déborde, et le canvas coupe. « TOUS LES COMMERCES DE TA
  // COMMUNE » en 54 px sortait « US LES COMMERCES DE TA COMMU », rognée DES
  // DEUX CÔTÉS parce qu'elle est centrée.
  verifie('🔴 une taille de texte se calcule pour tenir dans la page',
    /const taillePourTenir = \(texte, taille, poids/.test(bloc))
  verifie('et elle se mesure sur la largeur utile',
    /const LARGEUR_UTILE = W - PAD \* 2/.test(bloc))

  // ⚠️ ET SUR TOUS LES TEXTES, pas seulement celui qu'Alex a vu déborder. Le
  // nom du commerce était le plus exposé : « La Boulangerie du Coin de la Rue »
  // aurait été tronquée sur l'affiche collée en vitrine.
  for (const [quoi, motif] of [
    // ⚠️ REPOINTÉE LE 14/10 : le nom est passé en GRAND (84 px au plus, Alex),
    // sur une ligne ou deux ; chaque ligne reste contrainte à la largeur.
    ['le nom du commerce', /taillePourTenir\(lignesNom\[0\], NOM_MAX, 800/],
    ['chaque ligne du nom coupé en deux', /deux\.map\(l => taillePourTenir\(l, NOM_MAX, 800/],
    // ⚠️ ANCRES REPOINTÉES LE 29/09 : les textes sont devenus un PARAMÈTRE
    // (`textes`), pour que le carton de table réutilise le même dessin. La
    // garde mesure toujours la même chose : chaque texte tient dans la page.
    ['la première ligne de l\'accroche', /taillePourTenir\(textes\.accroche, 54, 900\)/],
    ['la seconde ligne', /taillePourTenir\(textes\.accrocheSuite, 54, 900\)/],
    ['le slogan', /taillePourTenir\(LOGO\.slogan/],
    ['le pied', /taillePourTenir\(textes\.pied, 28, 600\)/],
  ]) {
    verifie(`${quoi} est contraint à la largeur`, motif.test(bloc), 'il déborderait en silence')
  }
  // ⚠️ LES DEUX LIGNES DE L'ACCROCHE PARTAGENT UNE SEULE TAILLE : réglées
  // séparément, une même phrase sortirait en deux corps différents.
  verifie('les deux lignes de l\'accroche gardent le même corps',
    /Math\.min\(\s*taillePourTenir\(textes\.accroche/.test(bloc))
  // 🔴 ET L'AFFICHE DE VITRINE GARDE SON ACCROCHE (29/09). Les textes sont un
  // paramètre : sans cette valeur par défaut, l'affiche sortirait sans phrase,
  // puisque ses deux appelants ne passent rien.
  verifie('🔴 l\'affiche de vitrine dit, par défaut, l\'accroche d\'Alex',
    /construireAffiche\(\{ qrDataUrl, nomCommerce = '', clair = true, textes = TEXTES_AFFICHE \}/.test(bloc))
  verifie('et ce sont bien ces textes-là qui sont dessinés',
    /ctx\.fillText\(textes\.accroche, W \/ 2, yAccroche1\)/.test(bloc)
    && /ctx\.fillText\(textes\.accrocheSuite, W \/ 2, yAccroche2\)/.test(bloc)
    && /ctx\.fillText\(textes\.pied, W \/ 2, yPied\)/.test(bloc))
  verifie('aucun texte d\'affiche n\'est plus lu en dur dans le dessin',
    !/fillText\(TEXTES_AFFICHE\./.test(bloc) && !/taillePourTenir\(TEXTES_AFFICHE\./.test(bloc))
  // ⚠️ ET LA TAILLE CALCULÉE EST RÉELLEMENT UTILISÉE. Mesuré : en remettant un
  // corps fixe sur l'accroche, les gardes ci-dessus restaient vertes — le
  // calcul était toujours écrit, son résultat n'allait simplement plus nulle
  // part. C'est « l'appel existe, son résultat ne sert pas ».
  verifie('🔴 et l\'accroche est vraiment dessinée à cette taille',
    /900 \${tailleAccroche}px/.test(bloc), 'la taille serait calculée puis jetée')
  verifie('aucun corps fixe ne subsiste sur les textes de l\'affiche',
    !/ctx\.font = '\d00 \d+px "DM Sans"/.test(bloc),
    'un corps écrit en dur ne s\'adapte à aucun texte')

  // ══ ✅ LE NOM EN GRAND, LE LOGO RÉDUIT, LES BADGES DESSOUS (Alex, 14/10) ══
  //
  // Sur le carton de table ET l'affiche de vitrine (un seul dessin, choix
  // d'Alex au tableau). On EXÉCUTE la coupe du nom, on ne cherche pas un mot.
  {
    const egalJson = (nom, a, b) => verifie(nom, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a))
    egalJson('un nom d’un mot ne se coupe pas', couperEnDeux('Bistrologue'), ['Bistrologue'])
    egalJson('🔴 un long nom se coupe en deux moitiés équilibrées',
      couperEnDeux('La Boulangerie du Coin de la Rue'), ['La Boulangerie', 'du Coin de la Rue'])
    egalJson('la coupe vise le milieu, pas le premier espace',
      couperEnDeux('Chez Marco et Fils Traiteur'), ['Chez Marco et', 'Fils Traiteur'])
    egalJson('les espaces en trop ne créent pas de ligne vide', couperEnDeux('  Chez   Marco  '), ['Chez', 'Marco'])
    egalJson('un nom vide reste une ligne vide, sans planter', couperEnDeux(''), [''])
    verifie('🔴 le logo est réduit : il signe, il ne titre plus', /const WM = 72\b/.test(bloc))
    verifie('🔴 le nom est dessiné à SA taille, sur ses lignes',
      /ctx\.font = police\(800, tailleNom\)/.test(bloc) && /lignesNom\.forEach\(\(ligne, i\) => ctx\.fillText\(ligne, W \/ 2, yNoms\[i\]\)\)/.test(bloc))
    verifie('🔴 et il passe sur deux lignes plutôt que de rapetisser',
      /if \(tailleNom < NOM_MINI_UNE_LIGNE\)/.test(bloc) && /const NOM_MAX = 84\b/.test(bloc))
    // Les badges : les fichiers OFFICIELS de lib/stores.js, jamais redessinés.
    verifie('🔴 les badges sont ceux de lib/stores.js',
      BADGES_AFFICHE.length === 2 && BADGES_AFFICHE[0].src === '/store/badge-app-store-fr.svg' && BADGES_AFFICHE[1].src === '/store/badge-google-play-fr.png',
      BADGES_AFFICHE.map(b => b.src).join(', '))
    // ⚠️ REPOINTÉE LE 14/10 : le rapport « 46 / 68 » corrigeait la marge du
    // badge Google à l'œil, et Alex a vu que les deux n'avaient pas la même
    // hauteur. On aligne désormais la partie OPAQUE, mesurée pixel par pixel.
    for (const h of [46, 92]) {
      const [a, g] = BADGES_AFFICHE.map(b => tailleBadge(b, h))
      verifie(`🔴 à ${h} px, les deux badges ont la même hauteur VISIBLE`, a.hauteur === h && g.hauteur === h, `${a.hauteur} / ${g.hauteur}`)
    }
    const g = BADGE_GOOGLE_PLAY.visible
    verifie('la partie opaque du badge Google est celle mesurée (y 29, 192 px sur 250)',
      g.y === 29 && g.hauteur === 192, JSON.stringify(g))
    verifie('et elle est centrée : la même marge en haut et en bas',
      g.y === BADGE_GOOGLE_PLAY.hauteur - g.y - g.hauteur)
    verifie('le badge Apple n’a pas de marge à rogner',
      BADGE_APP_STORE.visible.y === 0 && BADGE_APP_STORE.visible.hauteur === BADGE_APP_STORE.hauteur)
    verifie('🔴 les badges sont réellement dessinés, sous l’accroche, rognés à leur partie visible',
      /ctx\.drawImage\(b\.img,\s*0, b\.badge\.visible\.y \* k, b\.img\.naturalWidth, b\.badge\.visible\.hauteur \* k,\s*bx, yBadges, b\.w, HAUTEUR_BADGES\)/.test(bloc)
      && /const yBadges\s+= yAccroche2 \+/.test(bloc))
    verifie('🔴 et la rangée tient dans la largeur utile',
      BADGES_AFFICHE.reduce((w, b) => w + tailleBadge(b, 92).largeur, 0) + 14 < 820)
    const landing = lireCode('app/components/LandingReveal.js')
    verifie('🔴 la landing aligne aussi la partie visible (même règle)',
      /const t = tailleBadge\(b, 46\)/.test(landing) && /objectFit: 'cover'/.test(landing) && !/hauteur: 68/.test(landing))
    verifie('🔴 un badge absent ne laisse pas un trou au milieu du papier',
      /const badges = imagesBadges\.every\(Boolean\)/.test(bloc) && /const yPied\s+= badges \?/.test(bloc))
  }

  // Deux fonds, et le clair doit exister : c'est celui qu'on imprime chez soi.
  verifie('deux palettes de fond existent', /export function paletteAffiche\(clair\)/.test(bloc))
  verifie('dont une blanche', /fond: '#FFFFFF'/.test(bloc))
  verifie('et une violette unie', /fond: '#201044'/.test(bloc))
  // ⚠️ LE PDF SUIT LE FOND CHOISI. Il peignait sa page en violet EN DUR : un
  // PDF blanc sortait cerné de violet, sans aucun moyen de l'enlever.
  verifie('🔴 le fond du PDF suit celui de l\'affiche',
    /export function fondPdf\(clair\)/.test(bloc) && /clair \? \[255, 255, 255\]/.test(bloc))
  // Le nom du fichier dit le fond : deux téléchargements ne s'écrasent pas.
  verifie('🔴 le nom du fichier porte le fond',
    /clair \? 'blanc' : 'violet'/.test(bloc))

  // ⚠️ 🔴 LES DEUX ÉCRANS DESSINENT LA MÊME AFFICHE, ET NE LA REDESSINENT PAS.
  // La page du kit ne proposait qu'un QR nu : un carré noir et blanc sans logo,
  // sans nom de commerce et sans accroche, collé tel quel en vitrine.
  // ⚠️ REPOINTÉE LE 24/10 : le tableau de bord passe aussi le message du
  // commerçant (Alex : message pré-rempli et modifiable sous l'accroche).
  verifie('🔴 le tableau de bord passe par le module partagé',
    /telechargerAffichePng\(\{ qrDataUrl, nomCommerce, clair, slug, message \}\)/.test(dash))
  verifie('🔴 la page du kit aussi',
    /from '@\/lib\/affiche-kit'/.test(kit) && /telechargerAffichePng\(commun\)/.test(kit))
  verifie('🔴 et le kit propose bien l\'AFFICHE, plus le QR nu',
    !/Télécharger le QR/.test(kit) && /Ton affiche de vitrine/.test(kit),
    'le commerçant collerait un carré noir et blanc en vitrine')
  // ⚠️ REPOINTÉE LE 24/10 : « que du fond blanc » (Alex). Le kit proposait
  // les deux fonds ; il ne garde que le blanc, sans bouton pour en changer.
  verifie('🔴 le kit ne sort que le fond blanc',
    /const fondClair = true/.test(kit) && !/setFondClair/.test(kit) && !/Fond violet/.test(kit))
  // ⚠️ RÉORIENTÉE LE 12/10 : les PDF viennent de la liste du module (A4, deux
  // A5, huit petites), plus de boutons écrits un par un.
  verifie('et les formats : le PNG, puis chaque PDF de la liste', /telecharger\('png'\)/.test(kit)
    && /\{FORMATS_AFFICHE\.map\(f => \(/.test(kit) && /onClick=\{\(\) => telecharger\(f\)\}/.test(kit))
  // ⚠️ UN ÉCHEC SE DIT : un bouton qui ne fait rien laisse cliquer trois fois.
  //
  // ⚠️ ANCRÉE SUR L'AFFICHAGE, PAS SUR LE NOM. Écrite `/erreurTelechargement/`,
  // elle trouvait l'état et son setter : neutraliser le rendu du message la
  // laissait verte. Mesuré par mutation. C'est la même famille que « l'appel
  // existe, son résultat ne sert pas ».
  verifie('un téléchargement raté est annoncé',
    /\{erreurTelechargement && \(/.test(kit), 'le message serait calculé puis jamais rendu')
  verifie('et le message est bien celui qu\'on lit', /Téléchargement impossible/.test(kit))

  // ⚠️ AUCUN DES DEUX N'A GARDÉ SA COPIE DU CANVAS.
  for (const [nom, src] of [['le tableau de bord', dash], ['la page du kit', kit]]) {
    verifie(`${nom} ne dessine plus l'affiche lui-même`,
      !/buildCompositeCanvas/.test(src), 'une seconde affiche divergerait')
  }
}

// ═══ 4) 🔴 PLUS AUCUNE DATE SUR L'AFFICHE ═════════════════════════════════
//
// ⚠️ Une affiche imprimée en septembre et encore collée en décembre disait
// « ON ARRIVE LE 1ER OCTOBRE ». Personne ne serait allé la décoller.
{
  const dash = lire('app/dashboard/ConfigDashboard.js')
  const affiche = lire('lib/affiche-kit.js')
  const i = affiche.indexOf('export const TEXTES_AFFICHE = ')
  const bloc = i === -1 ? '' : affiche.slice(i, affiche.indexOf('}', i) + 1)
  verifie('les textes de l\'affiche se découpent', bloc.length > 80, String(bloc.length))
  verifie('🔴 l\'affiche ne dérive plus la date d\'ouverture',
    !/libelleLancement/.test(bloc), 'une affiche datée devient fausse toute seule')
  verifie('🔴 et n\'écrit aucun mois en dur',
    !/janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i.test(bloc))
  verifie('l\'accroche est celle qu\'Alex a choisie',
    /TOUS LES COMMERCES DE TA COMMUNE/.test(bloc) && /DANS UNE SEULE APP/.test(bloc))

  // ⚠️ 🔴 ET LA DESTINATION DU QR NE DÉPEND PLUS D'AUCUNE DATE (Alex, 23/08 :
  // « ceux qui recevront ou imprimeront le QR seront actifs, donc ça doit
  // diriger directement vers la fiche dès maintenant »).
  //
  // Il basculait sur le 1er octobre : page d'inscription avant, fiche après.
  // Or l'ouverture SILENCIEUSE est le 1er septembre — un mois pendant lequel
  // les fiches auraient pris des commandes pendant que les QR collés en vitrine
  // envoyaient encore s'inscrire. Et un QR est IMPRIMÉ : une destination qui
  // change toute seule est une promesse qu'on ne peut plus tenir.
  // 🔴 ANCRE REPOINTÉE LE 05/09, ET LA GARDE ÉTAIT FAUSSE. Elle citait la chaîne
  // écrite à la main : elle a rougi le jour où ces deux adresses sont passées par
  // `lienFiche`, c'est-à-dire une AMÉLIORATION. Elle mesurait une FORMULATION,
  // pas le fait — la destination est la fiche, et elle ne dépend d'aucune date.
  //
  // ⚠️ ET LES DEUX PASSENT MAINTENANT PAR LA MÊME SOURCE, ce qui vaut mieux que
  // deux chaînes identiques : le QR est IMPRIMÉ, et `lienFiche` encode le slug,
  // ce que la version écrite à la main dans le tableau de bord ne faisait pas.
  verifie('🔴 le QR du tableau de bord mène toujours à la fiche',
    /const url = lienFiche\(slug\)/.test(dash),
    'la destination redeviendrait dépendante du calendrier')
  const kitPage = lire('app/kit/[slug]/page.js')
  verifie('🔴 et le lien de la page kit aussi, son frère',
    /const lien = lienFiche\(slug\)/.test(kitPage),
    'un QR vers la fiche et un lien vers l\'inscription, sur la même page')
  // ⚠️ ET AUCUNE DES DEUX NE RECOMPOSE L'ADRESSE À CÔTÉ. Sans ça, un ternaire
  // posé juste après suffirait à rendre la garde ci-dessus décorative.
  verifie('🔴 et aucune des deux ne recompose l’adresse à la main',
    !/yoppaa\.app\/commander\/\$\{/.test(dash) && !/yoppaa\.app\/commander\/\$\{/.test(kitPage),
    'une seconde fabrique de la même adresse, et le QR imprimé peut diverger')
  // ⚠️ AUCUN DES DEUX NE DOIT REPASSER PAR `avantLancement` POUR SA
  // DESTINATION. Une garde sur la seule forme de l'URL laisserait revenir un
  // ternaire posé juste à côté.
  verifie('la page kit ne fait plus dépendre sa destination du lancement',
    !/avantLancement\(\)\s*\n?\s*\?/.test(lireCode('app/kit/[slug]/page.js')))

  // ⚠️ ET LE TABLEAU DE BORD N'ANNONCE PLUS DE BASCULE. Il promettait « le jour
  // du lancement, il ouvrira ta page » : le commerçant aurait attendu un
  // changement qui n'arrivera jamais.
  verifie('🔴 le tableau de bord n\'annonce plus de bascule de destination',
    !/Avant le \{libelleLancement\(\)\}/.test(dash),
    'il ferait attendre un changement qui n\'aura pas lieu')
  verifie('et il dit ce que le QR fait vraiment',
    /Il ne changera jamais de destination/.test(dash))
}

// ═══ 5) 🔴 PNG ET PDF, PLUS D'IMPRESSION DIRECTE ══════════════════════════
//
// ⚠️ Alex, 22/08 : « uniquement un PNG et PDF à télécharger, le print ne
// fonctionne pas ». L'impression ouvrait un onglet peint par `document.write`,
// dont le rendu dépendait des réglages du poste.
{
  const dash = lireCode('app/dashboard/ConfigDashboard.js')
  verifie('🔴 la fabrique de page d\'impression a disparu', !/buildPrintHTML/.test(dash))
  verifie('🔴 et la fonction d\'impression aussi', !/function printQR/.test(dash))
  // ⚠️ ANCRÉE SUR L'APPEL, PAS SUR LE MOT : `window.print` apparaît légitimement
  // ailleurs dans l'application (page légale imprimable).
  const i = dash.indexOf('function QRCodeSection')
  const j = dash.indexOf('Onglet AVIS')
  const section = i === -1 || j === -1 ? dash : dash.slice(i, j)
  verifie('🔴 la section n\'imprime plus rien elle-même', !/window\.print\(\)/.test(section))
  verifie('et elle n\'écrit plus de HTML à la volée', !/document\.write/.test(section))

  verifie('le PNG se télécharge', /async function downloadPNG\(clair\)/.test(dash))
  // ⚠️ RÉORIENTÉE LE 12/10 : un bouton par format de `FORMATS_AFFICHE`.
  verifie('le PDF aussi, dans chaque format de la liste',
    /\{FORMATS_AFFICHE\.map\(f => \(/.test(dash) && /downloadPDF\(f, fondClair\)/.test(dash))
  // ⚠️ LE NOM DE FICHIER EST DÉSORMAIS COMPOSÉ AU MÊME ENDROIT POUR LES DEUX
  // FORMATS. La garde comptait deux occurrences dans le tableau de bord — une
  // par téléchargement — parce que le PNG et le PDF le composaient chacun de
  // leur côté ; l'une pouvait perdre la mention du fond sans que l'autre le
  // dise. `nomFichierAffiche` supprime le problème plutôt que de le surveiller.
  const moduleAffiche = lire('lib/affiche-kit.js')
  verifie('🔴 le nom de fichier se compose à un seul endroit',
    /export function nomFichierAffiche\(slug, clair, extension/.test(moduleAffiche))
  // ⚠️ ON COMPTE LES APPELS, PAS LA DÉCLARATION : la première écriture en
  // trouvait trois, dont la signature de la fonction elle-même. L'extension
  // littérale ne peut apparaître que dans un appel.
  verifie('et les deux téléchargements y passent',
    (moduleAffiche.match(/nomFichierAffiche\(slug, clair, '/g) || []).length === 2,
    String((moduleAffiche.match(/nomFichierAffiche\(slug, clair, '/g) || []).length))
}

// ═══ 6) UNE SEULE ENTRÉE DANS LE PROFIL ═══════════════════════════════════
//
// ⚠️ Alex, 22/08 : « il ne doit apparaître qu'une seule fois dans le profil ».
// Il y avait une section « QR Code » qui fabriquait l'affiche, ET un bloc
// « Mon kit de démarrage » juste en dessous qui renvoyait vers une page portant
// le même QR : le commerçant ne savait pas laquelle faisait foi.
{
  const dash = lire('app/dashboard/ConfigDashboard.js')
  verifie('la section porte un seul titre', (dash.match(/>Mon kit média</g) || []).length === 1)
  verifie('🔴 l\'ancien second titre a disparu', !/>Mon kit de démarrage</.test(dash))
  verifie('et l\'ancien titre « QR Code » aussi', !/>QR Code</.test(dash))
  // ⚠️ L'APERÇU MONTRE LE MÊME FOND QUE LE FICHIER, sinon il ment sur ce qui
  // sortira de l'imprimante.
  // ⚠️ REPOINTÉE LE 24/10 : l'aperçu EST la vraie affiche, dessinée par le
  // module avec le même fond et le même message que le fichier. Il suivait le
  // fond à la main, et il lui manquait les badges des stores.
  verifie('🔴 l\'aperçu est la vraie affiche, avec le message du fichier',
    /construireAffiche\(\{ qrDataUrl, nomCommerce, clair: fondClair, textes: textesAffiche\(message\) \}\)/.test(dash)
    && /src=\{apercuAffiche\}/.test(dash))
  // ⚠️ REPOINTÉE LE 24/10 : il utilisait le composant du logo pour ne plus
  // le redessiner (TROIS points au lieu de cinq). Désormais il ne redessine
  // RIEN : ni logo, ni accroche, ni QR à la main.
  verifie('🔴 l\'aperçu n\'est plus redessiné à la main',
    !/TXT_QR/.test(lireCode('app/dashboard/ConfigDashboard.js')) && !/alt="Ton QR code"/.test(dash))
  verifie('🔴 que du fond blanc dans le tableau de bord (Alex, 24/10)',
    /const fondClair = true/.test(dash) && !/setFondClair/.test(dash) && !/>Fond de l&rsquo;affiche</.test(dash))
}

// ═══ 7) LA SORTIE DE LA PAGE KIT ══════════════════════════════════════════
//
// ⚠️ Alex, 22/08 : « quand tu ouvres le kit il n'y a pas de bouton (croix) pour
// quitter cette page ». Elle s'ouvre dans un onglet neuf, donc sans historique.
{
  const kit = lire('app/kit/[slug]/KitClient.js')
  verifie('la croix existe', /function CroixSortie/.test(kit))
  verifie('🔴 et elle est posée dans la page', /<CroixSortie\/>/.test(kit))
  // ⚠️ `window.close()` n'aboutit QUE sur un onglet ouvert par script. Sans
  // repli, le bouton ne ferait rien, ce qui est pire que pas de bouton.
  verifie('🔴 elle a un repli quand la fenêtre ne peut pas se fermer',
    /window\.location\.href = '\/dashboard'/.test(kit))
  verifie('et elle ne ferme que ce qu\'elle a le droit de fermer', /window\.opener/.test(kit))
  verifie('elle se nomme pour les lecteurs d\'écran', /aria-label="Fermer le kit"/.test(kit))

  // Les messages à partager ne portent plus de date : collés sur une page
  // Facebook, ils y restent des mois.
  //
  // 🔴 CETTE GARDE LISAIT LE FICHIER BRUT, ET ELLE A ROUGI SUR UN COMMENTAIRE
  // (05/09). En ajoutant un quatrième message, j'ai écrit au-dessus de lui
  // pourquoi il ne doit porter ni date ni chiffre, en citant « le 1er octobre »
  // et « il en reste 3 » comme contre-exemples. La garde a lu ma PROSE et a
  // conclu qu'un message nommait un mois.
  //
  // ⚠️ UNE GARDE QUI LIT LES COMMENTAIRES NE MESURE PAS LE CODE. C'est le
  // symétrique exact du dépouilleur : là-bas un commentaire rendait le banc
  // AVEUGLE, ici il le rend MENTEUR. On dépouille, comme partout ailleurs.
  const kitCode = lireCode('app/kit/[slug]/KitClient.js')
  const i = kitCode.indexOf('const TEXTES = [')
  const bloc = i === -1 ? '' : kitCode.slice(i, kitCode.indexOf(']', i))
  verifie('les messages se découpent', bloc.length > 200, String(bloc.length))
  verifie('🔴 aucun message ne parle d\'une date', !/\$\{ouverture\}|libelleLancement/.test(bloc))
  verifie('et aucun ne nomme un mois', !/octobre|septembre|novembre/i.test(bloc))
  // ⚠️ QUATRE DEPUIS LE 05/09 : « Pour tes restes du soir » rejoint les trois
  // d'origine. C'est le seul qui vise un moment de la journée.
  verifie('il en reste quatre', (bloc.match(/cle: '/g) || []).length === 4,
    `${(bloc.match(/cle: '/g) || []).length} trouvé(s)`)
  // 🔴 ET AUCUN N'ANNONCE UN CHIFFRE. « Il en reste 3 » ou « jusqu'à 18 h »
  // devient faux dans l'heure, sur une publication qui reste des mois.
  verifie('🔴 aucun message n\'annonce une quantité, un prix ou une heure',
    !/\d+\s*(€|h\b|%)|il en reste \d|jusqu.à \d/.test(bloc))

  // ⚠️ JAMAIS « AUCUNE COMMISSION » SANS SON SUJET. Yoppaa ne prend pas de
  // commission sur les ventes ; ça ne dit rien des frais du prestataire de
  // paiement, et la phrase ne doit pas promettre à sa place.
  const commissions = bloc.match(/[^.]*commission[^.]*/gi) || []
  for (const phrase of commissions) {
    verifie('« commission » est toujours attribuée à Yoppaa',
      /Yoppaa ne prend aucune commission/.test(phrase), phrase.trim())
  }
}

// ════════════════════════════════════════════════════════════════════
// LA JAUGE DES PAGES IMPRIMABLES — exécutée, pas relue.
//
// ⚠️ POURQUOI ELLE MÉRITE UN BANC. C'est un INSTRUMENT DE MESURE, et un
// instrument qui se trompe de verdict est pire que pas d'instrument : il donne
// une confiance fausse. Le harnais de mutation l'a fait la veille en prenant
// des rouges pour des plantages. Ici, le mauvais verdict s'imprime sur du
// papier plastifié qu'on ne peut plus corriger.
{
  const cas = [
    // [entrée, état attendu, ce qu'on vérifie]
    [null, null, 'rien de mesuré ne rend AUCUN verdict'],
    [undefined, null, 'undefined non plus'],
    ['', null, 'la chaîne vide non plus'],
    ['abc', null, 'ni une valeur illisible'],
    [11.4, 'deborde', 'le débordement mesuré chez Alex'],
    [0.1, 'deborde', 'un dixième de millimètre déborde quand même'],
    [0, 'juste', 'pile à ras bord : ça tient, mais sans marge'],
    [-1, 'juste', 'un millimètre de marge est trop juste'],
    [-3, 'ok', 'le seuil bas est atteint, donc bon à tirer'],
    [-10, 'ok', 'dix millimètres de marge, la bonne zone'],
    [-18, 'ok', 'le seuil haut est encore acceptable'],
    [-18.1, 'vide', 'au-delà, il y a de la place à reprendre'],
  ]
  for (const [entree, attendu, quoi] of cas) {
    const v = verdictJauge(entree)
    verifie(`🔴 ${quoi}`, (v === null ? null : v.etat) === attendu,
      `verdictJauge(${JSON.stringify(entree)}) rend ${v === null ? 'null' : v.etat}, attendu ${attendu}`)
  }

  // ⚠️ LE PIÈGE DU ZÉRO, SEPTIÈME FOIS DANS CE PROJET. `Number(null)` vaut 0 et
  // EST fini : une garde écrite `if (!mm)` prendrait « pas encore mesuré » pour
  // « 0 mm, ça tient pile ». Les deux entrées doivent rendre des choses
  // DIFFÉRENTES, et c'est ce qu'on mesure ici, pas la forme de la garde.
  verifie('🔴 « pas mesuré » et « 0 mm » ne rendent PAS la même chose',
    verdictJauge(null) === null && verdictJauge(0) !== null,
    `null → ${verdictJauge(null)}, 0 → ${JSON.stringify(verdictJauge(0)?.etat)}`)

  // ⚠️ LA GARDE QUI COMPTE VRAIMENT : LE SENS NE S'INVERSE JAMAIS. Un signe
  // retourné dans le hook, et la jauge annoncerait « tient dans la page » sur
  // une page dont le bas est coupé. C'est le seul défaut de ce fichier qui
  // coûte du papier.
  for (const trop of [0.1, 1, 11.4, 40]) {
    const t = verdictJauge(trop).texte
    verifie('🔴 ce qui déborde ne dit JAMAIS que ça tient',
      /DÉBORDE/.test(t) && !/[Tt]ient/.test(t), `${trop} → « ${t} »`)
  }
  for (const reste of [0, -1, -10, -30]) {
    const t = verdictJauge(reste).texte
    verifie('🔴 ce qui tient ne dit JAMAIS que ça déborde',
      /[Tt]ient/.test(t) && !/DÉBORDE/.test(t), `${reste} → « ${t} »`)
  }

  // Le nombre annoncé est celui qu'on a mesuré : c'est lui qu'Alex me redonne
  // pour que je sache combien couper. ⚠️ ET IL S'ÉCRIT À LA VIRGULE, comme
  // tout le reste depuis le 28/08 : « 11.4 mm » est une notation anglaise.
  verifie('🔴 le débordement annonce le millimétrage exact, à la virgule',
    verdictJauge(11.4).texte.includes('11,4 mm'), verdictJauge(11.4).texte)
  verifie('🔴 la marge aussi', verdictJauge(-4.2).texte.includes('4,2 mm'), verdictJauge(-4.2).texte)

  // ⚠️ PAS DE TIRET CADRATIN EN FRANÇAIS, règle du projet. Le texte de la
  // jauge en portait un depuis sa création.
  for (const n of [11.4, 0, -1, -10, -30]) {
    verifie('aucun tiret cadratin dans la jauge', !/—/.test(verdictJauge(n).texte), verdictJauge(n).texte)
  }
}

// ⚠️ LA MESURE N'A DE SENS QUE SI LA FEUILLE COUPE VRAIMENT. Sans
// `overflow:hidden`, la page s'étire, `scrollHeight` égale `clientHeight`, la
// jauge lit 0 pour l'éternité et affiche un vert PERMANENT et FAUX. Le défaut
// serait invisible : la jauge marcherait, elle serait juste devenue aveugle.
{
  const page = lire('app/brand-kit/commercant/page.js')
  verifie('🔴 la feuille coupe ce qui dépasse, sinon la jauge est aveugle',
    /width: '210mm', height: '297mm', overflow: 'hidden'/.test(page))
  verifie('🔴 le verdict vient du module, il n\'est pas recopié dans l\'écran',
    /import \{ verdictJauge.*\} from '@\/lib\/jauge-page'/.test(page))
  verifie('et l\'écran ne redéfinit aucun seuil de son côté',
    !/const MARGE_(MINI|MAXI)/.test(lireCode('app/brand-kit/commercant/page.js')))
  // Les trois repères : sans le corps et le pied, la marge ne se mesure pas.
  for (const repere of ['rectoCorps', 'rectoPied', 'versoCorps', 'versoPied']) {
    verifie(`le repère ${repere} est posé dans la page`,
      new RegExp(`ref=\\{${repere}\\}`).test(page))
  }
  // ⚠️ LE VERSO A SA PROPRE MARGE HAUTE (29/08) : il débordait de 11,4 mm.
  // Si `padVerso` disparaît, le raccourcissement part avec lui, en silence.
  verifie('🔴 le verso garde sa marge haute resserrée',
    /const padVerso = \{ padding: '13mm 17mm 0' \}/.test(page))
  verifie('et le verso l\'utilise vraiment', /ref=\{versoCorps\} style=\{padVerso\}/.test(page))
}

// ════════════════════════════════════════════════════════════════════
// L'EXPORT SVG / PNG — la partie qui DÉCIDE, exécutée avec un faux document.
//
// ⚠️ CE QUI EST EN JEU. `next/font` sert Plus Jakarta Sans depuis
// `/_next/static/media/*.woff2`. Un fichier exporté qui pointerait vers cette
// adresse s'ouvrirait AILLEURS dans une police de substitution plus large :
// c'est LE défaut qui a coûté trois allers-retours sur ce kit, et il serait
// SILENCIEUX. Le fichier s'ouvrirait, il serait juste faux, et on ne le verrait
// que chez l'imprimeur.
//
// Le rendu, lui, est du navigateur et n'est pas testable ici. Mais la décision
// « j'embarque ou je refuse » est du JavaScript pur : on l'exécute.
{
  const octetsFonte = new Uint8Array([0x77, 0x4F, 0x46, 0x32, 1, 2, 3, 4]).buffer

  // Une règle @font-face telle que le navigateur l'expose.
  //
  // ⚠️ `type: 0` DÉLIBÉRÉMENT. `CSSRule.type` est déprécié et ne rend pas 5
  // partout : la première version reconnaissait la règle à ce nombre, et c'est
  // l'un des deux suspects du refus vu par Alex en production. On reconnaît
  // désormais la règle à son `cssText`, et le banc l'exige.
  const regle = (proprietes) => ({
    type: 0,
    cssText: '@font-face { ... }',
    style: { getPropertyValue: (p) => proprietes[p] || '' },
  })
  // Une règle groupante, `@layer` ou `@media` : elle porte ses enfants dans
  // son propre `cssRules` et n'est pas elle-même un `@font-face`.
  const groupe = (enfants) => ({ type: 0, cssText: '@layer base { ... }', cssRules: enfants })

  const FAMILLE = '__Plus_Jakarta_Sans_abc123'
  const regleJakarta = regle({
    'font-family': `'${FAMILLE}'`,
    src: "url(/_next/static/media/jakarta.p.woff2) format('woff2')",
    'font-weight': '800',
    'font-style': 'normal',
    'unicode-range': 'U+0000-00FF',
  })

  const monter = ({ regles, reponse }) => {
    globalThis.document = { styleSheets: [{ cssRules: regles }] }
    globalThis.fetch = async () => reponse
    globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64')
    globalThis.location = { href: 'https://www.yoppaa.app/brand-kit/commercant' }
  }
  const demonter = () => {
    delete globalThis.document
    delete globalThis.fetch
    delete globalThis.btoa
    delete globalThis.location
  }
  const okFonte = { ok: true, arrayBuffer: async () => octetsFonte }

  // ══ 1. LE CAS NORMAL : la police part DANS le fichier ══
  _oublierPolices()
  monter({ regles: [regleJakarta], reponse: okFonte })
  const { css } = await policesEmbarquees(`${FAMILLE}, system-ui, sans-serif`)
  verifie('🔴 la police est embarquée en base64 dans le fichier',
    typeof css === 'string' && css.includes('data:font/woff2;base64,'), String(css).slice(0, 80))
  verifie('🔴 et l\'adresse locale a DISPARU du CSS produit',
    typeof css === 'string' && !css.includes('/_next/static/media/'), String(css).slice(0, 120))
  verifie('la graisse est conservée', /font-weight:800/.test(css || ''))
  verifie('la plage de caractères aussi', /unicode-range:U\+0000-00FF/.test(css || ''))

  // ══ 2. 🔴 LES DEUX SUSPECTS DU REFUS VU EN PRODUCTION LE 29/08 ══
  //
  // La jauge était verte, la page parfaite, et l'export refusait. Je ne peux
  // pas ouvrir un navigateur d'ici : je durcis les deux hypothèses, et je les
  // mets au banc pour qu'elles ne reviennent jamais.
  //
  // ⚠️ SUSPECT 1 : LA RÈGLE EST RANGÉE DANS UN `@layer`. Tailwind v4 en pose,
  // et une boucle sur les seules règles de tête ne la voit JAMAIS. Le défaut
  // est muet : la feuille est bien lue, elle a l'air vide.
  _oublierPolices()
  monter({ regles: [groupe([regleJakarta])], reponse: okFonte })
  const enCouche = await policesEmbarquees(`${FAMILLE}, sans-serif`)
  verifie('🔴 une @font-face rangée dans un @layer est TROUVÉE',
    typeof enCouche.css === 'string' && enCouche.css.includes('data:font/woff2'), enCouche.diag)

  // Et deux crans plus bas, un `@media` dans un `@layer`.
  _oublierPolices()
  monter({ regles: [groupe([groupe([regleJakarta])])], reponse: okFonte })
  const deuxCrans = await policesEmbarquees(`${FAMILLE}, sans-serif`)
  verifie('🔴 même imbriquée deux fois', typeof deuxCrans.css === 'string', deuxCrans.diag)

  // ⚠️ SUSPECT 2 : LE NOM DE FAMILLE. `next/font` l'engendre à chaque build
  // (`__Plus_Jakarta_Sans_<hash>`), et s'accrocher dessus casse sans prévenir.
  // Quand la famille n'est pas reconnue, on prend TOUTES les fontes : une de
  // trop coûte quelques kilo-octets, refuser coûte le fichier.
  _oublierPolices()
  monter({ regles: [regle({ 'font-family': "'UneAutre'", src: "url(/f.woff2)" })], reponse: okFonte })
  const repli = await policesEmbarquees(`${FAMILLE}, sans-serif`)
  verifie('🔴 famille non reconnue : on embarque tout au lieu de refuser',
    typeof repli.css === 'string' && repli.css.includes('data:font/woff2'), repli.diag)
  verifie('et le diagnostic le DIT, au lieu de le faire en douce',
    /famille demandée n’a pas été reconnue/.test(repli.diag), repli.diag)

  // ══ 2 bis. 🔴 LE VRAI COUPABLE, TROUVÉ PAR LE DIAGNOSTIC (29/08) ══
  //
  // Alex en production : « 17 règles @font-face trouvées, aucune lisible
  // (HTTP 404, HTTP 404, HTTP 404) ». La collecte marchait, c'était l'ADRESSE.
  //
  // 🔴 UNE ADRESSE RELATIVE SE RÉSOUT CONTRE SA FEUILLE DE STYLE, PAS CONTRE
  // LA PAGE. Le CSS de `next/font` vit dans `/_next/static/css/` et écrit
  // `../media/x.woff2`. Résolu contre `/brand-kit/commercant`, ça donnait
  // `/media/x.woff2` : 404 à tous les coups. Et c'est le genre de faute qui ne
  // se voit JAMAIS en relisant, parce que les deux lignes se ressemblent.
  {
    const demandees = []
    globalThis.document = {
      styleSheets: [{
        cssRules: [{
          type: 0,
          cssText: '@font-face { ... }',
          parentStyleSheet: { href: 'https://www.yoppaa.app/_next/static/css/a1b2.css' },
          style: {
            getPropertyValue: (p) => ({
              'font-family': `'${FAMILLE}'`,
              src: 'url(../media/jakarta.p.woff2) format("woff2")',
              'font-weight': '800',
            })[p] || '',
          },
        }],
      }],
    }
    globalThis.location = { href: 'https://www.yoppaa.app/brand-kit/commercant' }
    globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64')
    globalThis.fetch = async (u) => {
      demandees.push(String(u))
      // Le serveur ne sert la fonte QU'À sa vraie adresse.
      return String(u) === 'https://www.yoppaa.app/_next/static/media/jakarta.p.woff2'
        ? { ok: true, arrayBuffer: async () => octetsFonte }
        : { ok: false, status: 404, arrayBuffer: async () => octetsFonte }
    }
    _oublierPolices()
    const relatif = await policesEmbarquees(`${FAMILLE}, sans-serif`)
    verifie('🔴 UNE ADRESSE RELATIVE EST RÉSOLUE CONTRE SA FEUILLE DE STYLE',
      typeof relatif.css === 'string' && relatif.css.includes('data:font/woff2'),
      `${relatif.diag} — demandé : ${demandees.join(' puis ')}`)
    verifie('🔴 et la première adresse essayée est la bonne, pas celle de la page',
      demandees[0] === 'https://www.yoppaa.app/_next/static/media/jakarta.p.woff2',
      demandees[0])

    // ⚠️ ET LA PAGE RESTE UN SECOND ESSAI : une feuille posée en ligne n'a pas
    // de `href`, il faut bien une base.
    const vues = []
    globalThis.document.styleSheets[0].cssRules[0].parentStyleSheet = { href: null }
    globalThis.fetch = async (u) => {
      vues.push(String(u))
      return { ok: true, arrayBuffer: async () => octetsFonte }
    }
    _oublierPolices()
    const enLigne = await policesEmbarquees(`${FAMILLE}, sans-serif`)
    verifie('une feuille sans href retombe sur l’adresse de la page',
      typeof enLigne.css === 'string' && vues.length > 0, vues.join(' '))

    // Le refus nomme l'adresse qu'il a essayée : sans elle, on devine encore.
    globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => octetsFonte })
    _oublierPolices()
    const rate = await policesEmbarquees(`${FAMILLE}, sans-serif`)
    verifie('🔴 le refus nomme l’adresse essayée, pas seulement le code',
      rate.css === null && /woff2/.test(rate.diag), rate.diag)
  }

  // ══ 3. LES CAS OÙ IL FAUT VRAIMENT REFUSER ══
  //
  // ⚠️ `null` VEUT DIRE SANS OBJET, PAS « VIDE ». Rendre une chaîne vide
  // laisserait l'export continuer et produire un fichier en police de
  // substitution : le pire résultat possible, parce qu'il a l'air normal.
  const refus = [
    ['aucune @font-face nulle part', { regles: [], reponse: okFonte }, `${FAMILLE}, sans-serif`],
    ['il n’y a que des règles groupantes vides', { regles: [groupe([])], reponse: okFonte }, `${FAMILLE}, sans-serif`],
    // 🔴 LA FAMILLE « await NON LU » : `fetch` NE REJETTE PAS sur un code HTTP.
    // Sans lecture de `res.ok`, la fonte serait faite de la page d'erreur.
    ['la fonte répond 404', { regles: [regleJakarta], reponse: { ok: false, status: 404, arrayBuffer: async () => octetsFonte } },
      `${FAMILLE}, sans-serif`],
  ]
  for (const [quoi, montage, famille] of refus) {
    _oublierPolices()
    monter(montage)
    const r = await policesEmbarquees(famille)
    verifie(`🔴 refus quand ${quoi}`, r.css === null, `rendu ${String(r.css).slice(0, 40)}`)
    // ⚠️ ET LE REFUS DIT CE QU'IL A VU. Un « ça n'a pas marché » sans chiffres
    // oblige à deviner, et c'est un aller-retour de perdu à chaque fois.
    verifie('et il chiffre ce qu’il a vu', typeof r.diag === 'string' && /\d/.test(r.diag), r.diag)
  }

  // ══ 4. UNE FEUILLE D'UN AUTRE DOMAINE NE FAIT PAS PLANTER ══
  // `cssRules` lève sur une feuille cross-origin : on passe, on ne casse pas.
  _oublierPolices()
  globalThis.document = {
    styleSheets: [
      { get cssRules() { throw new Error('SecurityError') } },
      { cssRules: [regleJakarta] },
    ],
  }
  globalThis.fetch = async () => okFonte
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64')
  globalThis.location = { href: 'https://www.yoppaa.app/brand-kit/commercant' }
  let survecu = null
  try { survecu = (await policesEmbarquees(`${FAMILLE}, sans-serif`)).css } catch { survecu = 'PLANTAGE' }
  verifie('🔴 une feuille d\'un autre domaine est ignorée, pas fatale',
    typeof survecu === 'string' && survecu.includes('@font-face'), String(survecu).slice(0, 60))

  // ══ 4. L'EXPORT REFUSE PLUTÔT QUE DE MENTIR ══
  //
  // 🔴 LA VÉRIFICATION LA PLUS IMPORTANTE DU LOT. Sans police embarquée,
  // `feuilleEnSvg` doit LEVER. S'il rendait un SVG quand même, le fichier
  // s'ouvrirait dans une autre police sans que rien ne l'ait signalé.
  _oublierPolices()
  monter({ regles: [], reponse: okFonte })
  globalThis.getComputedStyle = () => ({ fontFamily: `${FAMILLE}, sans-serif` })
  globalThis.XMLSerializer = class { serializeToString() { return '<div></div>' } }
  const faussNoeud = { cloneNode: () => ({ setAttribute() {}, style: {} }) }
  let aLeve = false
  let messageRefus = ''
  try { await feuilleEnSvg(faussNoeud, 210, 297) } catch (e) { aLeve = true; messageRefus = e.message }
  verifie('🔴 SANS POLICE EMBARQUÉE, L\'EXPORT LÈVE au lieu de produire un fichier faux', aLeve)
  verifie('et il dit pourquoi, en nommant la police',
    /police/i.test(messageRefus), messageRefus)

  // Et avec la police, il produit bien un SVG aux bonnes dimensions.
  //
  // ⚠️ SOUS `try`, ET C'EST UNE LEÇON DE HARNAIS. Écrit sans, une mutation qui
  // casse la collecte des fontes faisait LEVER cette ligne, et le banc mourait
  // au lieu de rougir : « le banc a PLANTÉ », donc une NON-mesure. Une mutation
  // doit changer le RÉSULTAT, jamais la TERMINAISON.
  _oublierPolices()
  monter({ regles: [regleJakarta], reponse: okFonte })
  let svg = ''
  try { svg = await feuilleEnSvg(faussNoeud, 210, 297) } catch (e) { svg = `LEVÉ : ${e.message}` }
  verifie('avec la police, le SVG est produit', /^<svg /.test(svg), svg.slice(0, 90))
  verifie('🔴 il fait bien un A4 en millimètres', /width="210mm" height="297mm"/.test(svg))
  verifie('🔴 et la fonte voyage DEDANS', svg.includes('data:font/woff2;base64,'))
  verifie('il porte un fond blanc explicite', /<rect width="100%" height="100%" fill="#ffffff"\/>/.test(svg))

  demonter()
  delete globalThis.getComputedStyle
  delete globalThis.XMLSerializer
  _oublierPolices()
}

// ════════════════════════════════════════════════════════════════════
// LE DÉPOUILLEUR LUI-MÊME, EXÉCUTÉ SUR LE PIÈGE.
//
// ⚠️ ET C'EST UNE LEÇON SUR LES GARDES. Ce défaut était d'abord surveillé
// INDIRECTEMENT : une mutation cassait `sansProse`, un fichier réel se faisait
// amputer, et les gardes qui le lisaient rougissaient. Puis j'ai réécrit ce
// fichier, le motif piégeux en est sorti, et la garde est devenue VERTE SANS
// RIEN SURVEILLER. Une garde qui dépend du hasard du contenu d'un autre
// fichier n'est pas une garde. On mesure la RÈGLE, sur une entrée à nous.
{
  const PIEGE = [
    '// sert /_next/static/media/*.woff2',
    'const GARDE_A_NE_PAS_PERDRE = 1',
    "} catch { /* rien à faire */ }",
    'const GARDE_APRES = 2',
  ].join('\n')

  const depouille = sansProse(PIEGE)
  verifie('🔴 LE CODE ENTRE LE FAUX BLOC ET SA FAUSSE FERMETURE SURVIT',
    depouille.includes('GARDE_A_NE_PAS_PERDRE'), JSON.stringify(depouille).slice(0, 120))
  verifie('🔴 et ce qui suit aussi', depouille.includes('GARDE_APRES'))
  verifie('la prose, elle, a bien disparu', !depouille.includes('sert /_next'))
  verifie('le vrai commentaire de bloc aussi', !depouille.includes('rien à faire'))

  // 🔴 LE PIÈGE CI-DESSUS NE MESURAIT PLUS L'ÉTAPE 1 DEPUIS LE 25/09. Son
  // « /* » est COLLÉ à une lettre (`media/*`) : l'étape 0, ajoutée ce jour-là
  // pour `accept="image/*"`, le désarme AVANT l'étape 1. Casser l'étape 1
  // laissait donc ce banc vert (trouvé le 29/09 par `mutations-jauge-kit`).
  // Ce second piège a son « /* » après une ESPACE : seule l'étape 1 le désarme.
  const PIEGE_ESPACE = [
    '// ce commentaire cite /* sans jamais le fermer',
    'const GARDE_ESPACE = 1',
    "} catch { /* rien à faire */ }",
    'const GARDE_ESPACE_APRES = 2',
  ].join('\n')
  const depouilleEspace = sansProse(PIEGE_ESPACE)
  verifie('🔴 un « /* » précédé d’une espace dans un commentaire n’avale rien',
    depouilleEspace.includes('GARDE_ESPACE = 1') && depouilleEspace.includes('GARDE_ESPACE_APRES'),
    JSON.stringify(depouilleEspace).slice(0, 120))

  // Le cas normal ne doit pas régresser : un vrai bloc part en entier.
  const normal = sansProse('const a = 1\n/* un vrai bloc\n   sur deux lignes */\nconst b = 2')
  verifie('un vrai bloc est bien retiré', !normal.includes('deux lignes'))
  verifie('et le code autour reste', normal.includes('const a = 1') && normal.includes('const b = 2'))

  // ⚠️ ET L'AUTRE SENS : les commentaires JSX ne doivent pas avaler la page.
  // C'est ce qui est arrivé en inversant l'ordre, le 29/08 : `ConfigDashboard`
  // est tombé de 644 000 à 112 000 caractères.
  const jsx = sansProse('{/* un commentaire JSX */}\nconst MILIEU = 1\n{/* un autre */}\nconst FIN = 2')
  verifie('🔴 deux commentaires JSX n’avalent pas ce qui les sépare',
    jsx.includes('MILIEU') && jsx.includes('FIN'), JSON.stringify(jsx).slice(0, 120))
}

// Les décisions de l'export qui ne s'exécutent pas ici (elles demandent un vrai
// navigateur) mais qui se perdraient en silence si on les retirait.
{
  const ex = lireCode('lib/export-feuille.js')
  // ⚠️ UN `blob:` TEINTE LA TOILE dans certains navigateurs, et `toBlob` lève
  // alors une erreur de sécurité : le PNG ne sortirait jamais.
  verifie('🔴 le PNG passe par une adresse data: et non blob:',
    /img\.src = 'data:image\/svg\+xml/.test(ex) && !/img\.src = URL\.createObjectURL/.test(ex))
  // ⚠️ Une toile naît TRANSPARENTE : sans ce fond, le PNG serait à trous.
  verifie('🔴 le PNG reçoit un fond blanc explicite',
    /fillStyle = '#ffffff'[\s\S]{0,60}fillRect\(0, 0, l, h\)/.test(ex))
  // ⚠️ `String.fromCharCode(...tableau)` fait déborder la pile sur une vraie
  // fonte : le défaut n'apparaît QUE sur les gros fichiers.
  verifie('🔴 le base64 se fait par tranches, pas d\'un seul coup',
    /const TRANCHE = 8192/.test(ex) && /subarray\(i, i \+ TRANCHE\)/.test(ex))
  // ⚠️ ANCRÉE SUR LA RÈGLE, PAS SUR LA FORME DE LA LIGNE. Écrite
  // `if (!rep.ok) continue`, elle a rougi dès que la ligne a gagné un
  // diagnostic : une garde qui recopie un format rougit sur une amélioration
  // légitime, et on finit par la desserrer au lieu de l'écouter.
  verifie('🔴 la réponse du fetch de la fonte est LUE', /if \(essai\.ok\)/.test(ex))
  // ⚠️ ET L'ADRESSE SE RÉSOUT CONTRE LA FEUILLE DE STYLE, pas contre la page :
  // le défaut aux dix-sept 404 du 29/08. Exécuté plus haut ; ici on garde la
  // ligne elle-même, parce qu'elle est indistinguable de la fausse à la
  // relecture.
  verifie('🔴 la base de résolution est la feuille de style',
    /r\.parentStyleSheet\?\.href \|\| location\.href/.test(ex))
  verifie('300 dpi, la résolution d\'un imprimeur', /DPI_IMPRESSION = 300/.test(ex))

  // ══ LE PDF RECTO/VERSO ══
  //
  // ⚠️ SES DEUX DÉFAUTS POSSIBLES NE SE VOIENT QU'UNE FOIS LA PILE IMPRIMÉE :
  // une première page blanche, et des faces inversées. Aucun des deux ne
  // rougirait à l'écran.
  //
  // 🔴 `jsPDF` CRÉE DÉJÀ UNE PAGE À LA CONSTRUCTION. Un `addPage()` avant la
  // première image donne un PDF dont la page 1 est vide et le recto en page 2.
  verifie('🔴 la page n’est ajoutée qu’À PARTIR DE LA DEUXIÈME',
    /if \(i > 0\) doc\.addPage\(/.test(ex))
  verifie('le PDF est en millimètres, au format de la feuille',
    /new jsPDF\(\{ unit: 'mm', format: \[largeurMm, hauteurMm\], orientation: 'portrait' \}\)/.test(ex))
  // ⚠️ `jspdf` pèse plusieurs centaines de kilo-octets : importé au sommet, il
  // partirait dans le bundle de tous ceux qui ne cliqueront jamais.
  verifie('jspdf est chargé à la demande, pas au sommet du fichier',
    /await import\('jspdf'\)/.test(ex) && !/^import .*jspdf/m.test(ex))
  // ⚠️ UNE SEULE RASTÉRISATION SERT LE PNG ET LE PDF : deux chemins de dessin
  // finiraient par diverger, et le PDF ne ressemblerait plus au PNG.
  verifie('🔴 le PNG et le PDF passent par la MÊME toile',
    /function svgEnToile/.test(ex)
    && /svgEnPng[\s\S]{0,200}await svgEnToile/.test(ex)
    && /feuillesEnPdf[\s\S]{0,900}await svgEnToile/.test(ex))

  // ══ LES TROIS FORMULES SUR LE PAPIER ══
  //
  // 🔴 UN TARIF RECOPIÉ SUR UN PAPIER PLASTIFIÉ NE SE CORRIGE PLUS. Les prix
  // sont paramétrables par variable d'environnement dans `lib/plans.js` : les
  // écrire en dur ici donnerait deux sources de vérité, et c'est celle qu'on ne
  // peut pas mettre à jour qui se retrouverait chez le commerçant.
  {
    const kit = lireCode('app/brand-kit/commercant/page.js')
    verifie('🔴 les tarifs viennent de lib/plans.js, ils ne sont pas recopiés',
      /getPrixPlan\('communiquer'\)\.mensuel/.test(kit) && /getPrixPlan\('vendre'\)\.mensuel/.test(kit))
    verifie('🔴 et aucun montant d’abonnement n’est écrit en dur',
      !/19[.,]90|49[.,]90/.test(kit), (kit.match(/19[.,]90|49[.,]90/g) || []).join(' '))
    // ⚠️ ANCRÉES SUR LE BLOC, PAS SUR LA MISE EN FORME. Écrites pour la version
    // où les trois formules étaient empilées, elles ont rougi dès qu'on les a
    // mises en un seul paragraphe. Une garde qui recopie un format rougit sur
    // une amélioration légitime, et on finit par la desserrer au lieu de
    // l'écouter. On mesure : les deux prix et le HTVA voyagent ENSEMBLE.
    // ⚠️ REPOINTÉE LE 14/10 : les trois formules ont quitté le socle du recto
    // pour leur propre bloc au verso (kit par segment, base commune).
    const i = kit.indexOf("{ nom: 'Exister', prix: 'Gratuit'")
    const socle = i === -1 ? '' : kit.slice(i, i + 900)
    verifie('le bloc des formules existe', socle.length > 200, String(socle.length))
    // ⚠️ HTVA DANS LE MÊME BLOC QUE LES PRIX. On s'adresse à des professionnels :
    // un prix TTC sous-entendu serait un piège, et le papier engage.
    verifie('🔴 les deux tarifs et le HTVA sont dans le même bloc',
      /getPrixPlan\('communiquer'\)[\s\S]*getPrixPlan\('vendre'\)[\s\S]*HTVA/.test(socle))
    // Les trois formules portent leurs vrais noms, ceux de lib/plans.js.
    for (const nom of ['Exister', 'Communiquer', 'Vendre']) {
      verifie(`la formule ${nom} est nommée`, socle.includes(nom))
    }
    // ⚠️ « GRATUIT À VIE » EST UN ENGAGEMENT : il doit rester vrai dans le code.
    verifie('🔴 « gratuit à vie » correspond bien au plan Exister de lib/plans.js',
      getPrixPlan('exister').mensuel === 0, String(getPrixPlan('exister').mensuel))
  }

  // ══ 🔴 AUCUN APLAT PÂLE SUR CE QUI S'IMPRIME (29/08, vu par Alex) ══
  //
  // Les fonds en violet très clair (`T.bg` #F8F6FF, `T.pale` #EDE0FF)
  // RESSORTAIENT BLEU CIEL à l'impression. Une teinte quasi imperceptible ne se
  // restitue pas : l'imprimante la rend avec des points cyan, et le pâle vire
  // au bleu. Le défaut ne se voit NULLE PART à l'écran, et coûte une feuille.
  //
  // ✅ LA RÈGLE : sur une page destinée au papier, un fond est BLANC ou
  // FRANCHEMENT FONCÉ. Jamais entre les deux. Les blocs clairs tiennent par
  // leur bordure, et le bandeau du verso est passé au violet foncé, comme le
  // socle du recto auquel il répond.
  {
    const kit = lireCode('app/brand-kit/commercant/page.js')
    for (const teinte of ['T.bg', 'T.pale']) {
      verifie(`🔴 aucun fond en ${teinte} : il ressortirait bleu à l’impression`,
        !new RegExp(`background: ${teinte.replace('.', '\\.')}\\b`).test(kit))
    }
    // ⚠️ La bordure, elle, reste permise : un filet de 1,2pt ne montre pas de
    // dominante. C'est l'APLAT qui trahit, pas le trait.
    // ⚠️ REPOINTÉE LE 14/10 : les cartes de signaux (bord `T.light`) sont
    // parties ; les blocs clairs de la v2 sont le bloc « l'abonnement n'enferme
    // personne » et le ticket à remplir, tenus par un filet.
    // ⚠️ REPOINTÉE UNE 2e FOIS LE 14/10 (version tunnel) : les blocs clairs
    // sont les trois atouts du recto et les cartes de formules ; les autres
    // aplats sont franchement foncés.
    verifie('les blocs clairs tiennent par leur bordure',
      /border: `0\.9pt solid \$\{FILET\}`, borderRadius: '3\.5mm'/.test(kit) && /solid \$\{f\.vedette \? T\.main : FILET\}`/.test(kit))
    // Le bandeau du verso est foncé, et son logo est passé en conséquence :
    // un logo sombre sur fond sombre serait invisible, et ne se verrait qu'au
    // tirage puisque le composant ne lève pas.
    verifie('🔴 le bandeau du verso est foncé', /ref=\{versoPied\}[^\n]*background: T\.panel/.test(kit))
    verifie('🔴 et son logo est en mode dark, sinon il disparaît dessus',
      /<YoppaaLogo size=\{22\} mode="dark"\/>/.test(kit))
  }

  // ══ 🔥 LE KIT PAR SEGMENT, SUR LA BASE DE LA LANDING V2 (14/10) ══
  //
  // Décision d'Alex : une base commune + un recto par segment. Et les erreurs
  // relevées sur l'ancien papier ne doivent pas revenir : un papier plastifié
  // ne se corrige plus.
  {
    const kit = lireCode('app/brand-kit/commercant/page.js')
    for (const cle of ['alimentaire', 'restaurant', 'services', 'detail']) {
      verifie(`le segment « ${cle} » a son recto`, new RegExp(`cle: '${cle}',`).test(kit))
    }
    verifie('🔴 le QR porte le segment de la feuille',
      /useQr\(urlQr\(`kit-\$\{seg\.cle\}`\)\)/.test(kit) && /#commercants`/.test(kit))
    verifie('🔴 plus de « place de marché » (formule abandonnée)',
      !/place de march|places de march/i.test(kit))
    verifie('🔴 aucune date de fin de gratuité imprimée, ni sur l’A4 ni sur la carte',
      !/8 janvier|9 janvier|jusqu&rsquo;au|Gratuit jusqu/.test(kit))
    verifie('🔴 les jours offerts viennent de la règle, partout où ils sont dits',
      (kit.match(/\{ESSAI_JOURS_MINIMUM\} jours offerts/g) || []).length >= 3)
    verifie('🔴 plus de délai inventé (« cinq minutes »)', !/cinq minutes/.test(kit))
    verifie('🔴 le Good Morning se dit avec sa cadence : chaque semaine en Exister',
      /'Ta place chaque semaine dans le Good Morning Yoppers'/.test(kit)
      && /'Ta place chaque matin dans le Good Morning Yoppers'/.test(kit))
    verifie('🔴 aucun compte d’habitants inventé', !/\d+ habitants? (ont|aimeraient)/.test(kit))
    // 🔴 Alex, 14/10 : « le ticket à compléter sur un flyer plastifié, pas
    // utile et pas pertinent ». Un papier plastifié ne se REMPLIT pas.
    verifie('aucun champ à remplir au stylo sur un papier plastifié',
      !/LigneAVide|à remplir|_{4,}/.test(kit))
    // ✅ Le tunnel : le recto fait REGARDER, le verso fait AGIR.
    verifie('🔴 le QR du verso mène à l’inscription, celui du recto à la landing',
      /useQr\(urlInscription\(`kit-\$\{seg\.cle\}`\)\)/.test(kit) && /<Qr src=\{qrInscription\}/.test(kit) && /<Qr src=\{qr\} taille="28mm"\/>/.test(kit))
    verifie('le verso se termine par UN appel à l’action',
      /Prêt&nbsp;\? Inscris-toi\./.test(kit))
    verifie('l’accroche est celle de la landing, sur la feuille et la carte',
      (kit.match(/Remplis ton commerce,<br\/>pas leurs poches\.|Remplis ton<br\/>commerce, pas<br\/>leurs poches\./g) || []).length === 2 && !/Reprends tes clients/.test(kit))
    verifie('🔴 le verso dit que le téléphone s’ajoute dans Yoppaa (pensé pour le commerçant)',
      /Une commande, un rendez-vous ou une table pris au téléphone/.test(kit))
    verifie('trois atouts par métier, pas une liste',
      (kit.match(/atouts: \[/g) || []).length === 4)
    verifie('le téléphone vient de lib/contact, comme WhatsApp sur la landing',
      /from '@\/lib\/contact'/.test(kit) && /tel: TELEPHONE_AFFICHE/.test(kit))
    // (Version tunnel : le drapeau choisit le texte de l'étape 2.)
    verifie('l’encodage offert suit son drapeau', /\{ENCODAGE_OFFERT && \(|ENCODAGE_OFFERT\s*\?/.test(kit) && !/encode ta carte[^']*Gratuitement/.test(kit.replace(/ENCODAGE_OFFERT\s*\?[\s\S]{0,400}/, '')))
    for (const marque of ['Uber', 'Deliveroo', 'Takeaway', 'Just Eat', 'TheFork', 'Planity', 'Salonkee', 'Treatwell', 'Fritzy', 'Zenchef']) {
      verifie(`le kit ne nomme pas ${marque}`, !new RegExp(marque, 'i').test(kit))
    }
  }

  // ══ ✅ LA FEUILLE GÉNÉRALISTE, LE MÉTIER EN OPTION (Alex, 14/10, option 1) ══
  //
  // « Tu tiens une friterie ? » vexait la sandwicherie et la boulangerie, qui
  // ont presque les mêmes besoins ; « chaque pull » laissait le fleuriste
  // dehors. Et « on n'a jamais tous les métiers » : une feuille par métier en
  // oublierait toujours un. D'où une pastille GÉNÉRALISTE par segment, et un
  // métier TAPÉ librement dans l'atelier pour une tournée ciblée.
  {
    // On EXÉCUTE la règle de la pastille, on ne cherche pas un mot.
    const base = { verbe: 'Tu travailles', pastille: 'sur rendez-vous' }
    for (const [vide, nom] of [['', 'une chaîne vide'], ['   \t ', 'des espaces'], [null, 'null'], [undefined, 'rien']]) {
      const a = accrocheKit(base, vide)
      verifie(`🔴 sans métier tapé (${nom}), la pastille généraliste reste`,
        a.verbe === 'Tu travailles' && a.pastille === 'sur rendez-vous', JSON.stringify(a))
    }
    const tape = accrocheKit(base, '  une   poissonnerie ')
    verifie('🔴 un métier tapé remplace la pastille, avec « Tu tiens »',
      tape.verbe === 'Tu tiens' && tape.pastille === 'une poissonnerie', JSON.stringify(tape))
    const long = accrocheKit(base, 'x'.repeat(200))
    verifie('un métier trop long est coupé à la longueur permise',
      long.pastille.length === METIER_LIBRE_MAX, String(long.pastille.length))
    verifie('la pastille de base n’est pas modifiée par l’appel', base.pastille === 'sur rendez-vous')

    const kit = lireCode('app/brand-kit/commercant/page.js')
    const accroches = [...kit.matchAll(/accroche: \{ verbe: '([^']+)', pastille: '([^']+)' \}/g)].map(m => `${m[1]} ${m[2]}`)
    verifie('🔴 les quatre pastilles validées par Alex, dans l’ordre des segments',
      JSON.stringify(accroches) === JSON.stringify(['Tu tiens un commerce de bouche', 'Tu tiens un restaurant', 'Tu travailles sur rendez-vous', 'Tu tiens une boutique']),
      accroches.join(' | '))
    // 🔴 Le texte commun ne nomme AUCUN métier en exemple. Ancré sur le bloc
    // des segments : la carte, les formules et l'atelier ne comptent pas.
    const i = kit.indexOf('const SEGMENTS = [')
    const j = kit.indexOf('const BANDE')
    const segments = i === -1 || j <= i ? '' : kit.slice(i, j)
    verifie('le bloc des segments est trouvé', segments.length > 2000, String(segments.length))
    const vexants = segments.match(/friter|frites?\b|cornet|sandwich|boulang|boucher|traiteur|snack|food truck|pizzer|brasser|tavern|coiffeu|barb|institut|garage|fleur|librair|épicer|\bpulls?\b|un salon\b/gi) || []
    verifie('🔴 aucun métier pris en exemple dans le texte d’un segment', vexants.length === 0, vexants.join(', '))
    verifie('🔴 la pastille affiche l’accroche calculée, plus un métier figé',
      /\{accroche\.verbe\}\{' '\}/.test(kit) && /\{accroche\.pastille\}<\/span>&nbsp;\?/.test(kit) && !/seg\.metier|seg\.pour/.test(kit))
    verifie('🔴 le métier se tape dans l’atelier, et passe par la règle',
      /accrocheKit\(seg\.accroche, metierLibre\)/.test(kit) && /onChange=\{e => setMetierLibre\(e\.target\.value\)\}/.test(kit))
    verifie('🔴 la jauge du recto remesure quand la pastille change',
      /useAjustement\(recto, rectoCorps, rectoPied, `\$\{seg\.cle\}\|\$\{accroche\.pastille\}`\)/.test(kit))
    // ✅ Alex, 14/10 : « ils doivent savoir qu'il y a une différence ».
    verifie('🔴 le QR du recto dit qu’il fait découvrir',
      /<Qr src=\{qr\} taille="28mm"\/>[\s\S]{0,400}Scanne pour découvrir/.test(kit) && !/Scanne et regarde/.test(kit))
    verifie('🔴 le QR du verso dit qu’il fait s’inscrire',
      /<Qr src=\{qrInscription\} taille="26mm"\/>[\s\S]{0,400}Scanne pour t&rsquo;inscrire/.test(kit))
    verifie('le QR de la carte (vers la landing) dit aussi qu’il fait découvrir',
      /<Qr src=\{qrCarte\} taille="22mm"\/>[\s\S]{0,700}Scanne pour découvrir/.test(kit))
  }

  // ══ 🔴 LES DÉMOS DES RELECTEURS N'ONT NI KIT NI INVITATION PUBLICS (14/10) ══
  //
  // Check de lancement : `/?ref=chez-momo` affichait « Chez Momo t'invite à
  // rejoindre Yoppaa », et `/kit/chez-momo` son nom, à n'importe qui, alors
  // que la fiche n'est visible que des comptes de relecture. ⚠️ Les autres
  // états restent servis : préinscrits et commerces en préparation partagent
  // leur lien AVANT d'être publiés (règle du 03/10).
  {
    const resolve = lireCode('lib/kit-resolve.js')
    verifie('🔴 ?ref= lit l’état de publication de la fiche',
      /\.select\('nom, statut_publication'\)/.test(resolve))
    verifie('🔴 et n’invite pas au nom d’une démo des relecteurs',
      /if \(com && ficheEnRelecture\(com\)\) return null/.test(resolve))
    verifie('⚠️ mais sert toujours les commerces en préparation (pas de fichePubliee)',
      !/fichePubliee/.test(resolve))
    const pageKit = lireCode('app/kit/[slug]/page.js')
    verifie('🔴 /kit/ lit l’état de publication de la fiche',
      /categorie, statut_publication'\)\.eq\('slug', slug\)/.test(pageKit))
    verifie('🔴 et ne montre pas le kit d’une démo des relecteurs',
      /if \(com && ficheEnRelecture\(com\)\) return null/.test(pageKit) && !/fichePubliee/.test(pageKit))
  }

  // ══ ✅ GOOGLE PLAY EN LIGNE, LE BOUTON « TÉLÉCHARGER » RÉPARÉ (15/10) ══
  {
    const S = await import('../lib/stores.js')
    verifie('🔴 le lien Google Play est celui de l’identifiant Capacitor',
      S.GOOGLE_PLAY_URL === 'https://play.google.com/store/apps/details?id=app.yoppaa.client', String(S.GOOGLE_PLAY_URL))
    verifie('l’app compte comme publiée', S.appPubliee() === true)
    verifie('🔴 le lien App Store est celui de la fiche belge (id 6813182627)',
      S.APP_STORE_URL === 'https://apps.apple.com/be/app/yoppaa/id6813182627', String(S.APP_STORE_URL))
    // La phrase sous les badges, dans TOUTES les combinaisons (pas seulement celle du jour).
    verifie('🔴 les deux en ligne : plus de « Bientôt »', S.noteStores() === null && S.noteStores({ apple: 'a', google: 'g' }) === null)
    verifie('🔴 une seule en ligne : la phrase nomme celle qui manque',
      S.noteStores({ apple: null, google: 'g' }) === 'Bientôt disponible sur l’App Store.'
        && S.noteStores({ apple: 'a', google: null }) === 'Bientôt disponible sur Google Play.')
    verifie('aucune en ligne : les deux', S.noteStores({ apple: null, google: null }) === 'Bientôt disponible sur l’App Store et Google Play.')
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36'
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
    const pc = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
    verifie('🔴 un Android part sur Google Play', S.cibleTelechargement(android) === S.GOOGLE_PLAY_URL)
    verifie('🔴 un iPhone part sur l’App Store, ou sur la landing tant qu’il n’est pas publié',
      S.cibleTelechargement(iphone) === (S.APP_STORE_URL || S.REPLI_TELECHARGEMENT))
    verifie('un PC part sur la section des habitants, et ses badges', S.cibleTelechargement(pc) === '/#preinscription')
    verifie('sans navigateur reconnu, le repli', S.cibleTelechargement('') === '/#preinscription' && S.cibleTelechargement(null) === '/#preinscription')
    const dl = lireCode('app/download/page.js')
    verifie('🔴 la page /download existe et redirige par la règle',
      /redirect\(cibleTelechargement\(ua\)\)/.test(dl) && /\(await headers\(\)\)\.get\('user-agent'\)/.test(dl))
    verifie('🔴 le bouton « Télécharger Yoppaa » y mène, en relatif',
      /<a href="\/download"/.test(lireCode('app/commander/[slug]/page.js')) && !/yoppaa\.app\/download/.test(lireCode('app/commander/[slug]/page.js')))
    verifie('la section des habitants porte bien l’ancre du repli', /<section id="preinscription"/.test(lireCode('app/components/LandingReveal.js')))
    verifie('🔴 la landing lit la phrase des badges dans la règle',
      /\{noteStores\(\) && <p className="lp-stores-note">\{noteStores\(\)\}<\/p>\}/.test(lireCode('app/components/LandingReveal.js')))
  }

  const page = lire('app/brand-kit/commercant/page.js')
  // 🔴 L'ORDRE DES FACES. Inversé, il ne se voit qu'une fois la pile sortie.
  verifie('🔴 le PDF assemble le recto PUIS le verso',
    // ⚠️ REPOINTÉE LE 14/10 : le PDF porte maintenant le segment dans son nom
    // (quatre rectos), l'ordre des faces reste le même.
    /<TelechargementCombine pages=\{\[recto, verso\]\}( nom=\{`[^`]+`\})?\/>/.test(page))
  verifie('le bouton combiné existe et dit ce qu’il produit',
    /PDF recto\/verso · les 2 pages A4/.test(page))
  verifie('🔴 les boutons sont masqués à l\'impression',
    /\.atelier, \.jauge, \.notice, \.outils \{ display:none !important \}/.test(page))
  // Les quatre supports ont leurs boutons : les deux A4 et les deux cartes.
  verifie('les quatre supports sont exportables',
    (page.match(/<Telechargements /g) || []).length === 4,
    String((page.match(/<Telechargements /g) || []).length))
  // ⚠️ ON N'EXPORTE PAS UN SECOND DESSIN. Si un canvas redessinait la page,
  // les deux versions divergeraient dès la première correction de texte.
  verifie('🔴 l\'export sérialise la page, il ne la redessine pas',
    /feuilleEnSvg\(cible\.current/.test(page))
  // ⚠️ L'erreur se VOIT. Un bouton qui échoue en silence fait recommencer
  // trois fois avant qu'on comprenne.
  verifie('🔴 un export raté affiche sa raison', /setErreur\(e\?\.message/.test(page))
}

// ═══ ✅ LE MESSAGE SOUS L'ACCROCHE (Alex, 24/10) ════════════════════════════
//
// Accroche fixe, message pré-rempli et modifiable dessous, en violet pour
// trancher sur l'accroche presque noire ; le QR rapetisse pour lui faire
// place. Le carton de table n'a pas de message.
{
  const bloc = lire('lib/affiche-kit.js')
  const dash = lire('app/dashboard/ConfigDashboard.js')

  verifie('le message par défaut est celui d\'Alex',
    TEXTES_AFFICHE.message === 'Découvre, commande, réserve et suis les actus de tes commerces.')
  verifie('🔴 l\'accroche, elle, ne bouge pas',
    TEXTES_AFFICHE.accroche === 'TOUS LES COMMERCES DE TA COMMUNE' && TEXTES_AFFICHE.accrocheSuite === 'DANS UNE SEULE APP')
  verifie('🔴 le carton de table n\'a pas de message', !('message' in TEXTES_CARTE_TABLE))

  // Le nettoyage, exécuté.
  verifie('le message par défaut tient sous la limite', nettoyerMessage(TEXTES_AFFICHE.message) === TEXTES_AFFICHE.message)
  verifie('les espaces sont resserrés', nettoyerMessage('  Viens   nous voir  ') === 'Viens nous voir')
  verifie('vide reste vide', nettoyerMessage('') === '' && nettoyerMessage(null) === '' && nettoyerMessage(undefined) === '')
  const long = 'mot '.repeat(40)
  const coupe = nettoyerMessage(long)
  verifie('🔴 un message trop long est coupé sous la limite', coupe.length <= MESSAGE_MAX, String(coupe.length))
  verifie('et coupé à un mot, pas au milieu', /^(mot )*mot$/.test(coupe), coupe)
  verifie('🔴 sans message choisi, l\'affiche garde celui par défaut', textesAffiche(undefined) === TEXTES_AFFICHE)
  verifie('🔴 un message vidé ne dessine aucun message', textesAffiche('').message === '')
  verifie('un message adapté remplace celui par défaut', textesAffiche(' Bienvenue ! ').message === 'Bienvenue !')

  // Le dessin.
  verifie('🔴 le message est réellement dessiné',
    /lignesMessage\.forEach\(\(ligne, i\) => ctx\.fillText\(ligne, W \/ 2, yMessages\[i\]\)\)/.test(bloc))
  verifie('🔴 et contraint à la largeur', /taillePourTenir\(texteMessage, MESSAGE_TAILLE, 700\)/.test(bloc))
  verifie('🔴 en violet sur blanc, pour trancher sur l\'accroche presque noire',
    /ctx\.fillStyle = P\.message/.test(bloc) && paletteAffiche(true).message === '#6B35C4'
    && paletteAffiche(true).message !== paletteAffiche(true).accroche)
  verifie('🔴 le QR rapetisse seulement quand il y a un message',
    /const QR  = texteMessage \? 740 : 820/.test(bloc))
  verifie('🔴 et la largeur de l\'affiche ne dépend plus du QR', /const W   = 820 \+ PAD \* 2/.test(bloc))
  verifie('🔴 les badges descendent sous le message', /const yBadges\s+= yAccroche2 \+ 36 \+ hauteurMessage/.test(bloc))
  verifie('🔴 les deux téléchargements dessinent le message reçu',
    (bloc.match(/construireAffiche\(\{ qrDataUrl, nomCommerce, clair, textes: textesAffiche\(message\) \}\)/g) || []).length === 2)

  // L'écran.
  verifie('🔴 le PDF du tableau de bord emporte le message aussi',
    /telechargerAffichePdf\(\{ qrDataUrl, nomCommerce, clair, slug, format, message \}\)/.test(dash))
  verifie('le message part pré-rempli', /useState\(TEXTES_AFFICHE\.message\)/.test(dash))
  verifie('la saisie est bornée', /id="message-affiche" value=\{message\} maxLength=\{MESSAGE_MAX\}/.test(dash))
  verifie('et on peut revenir au message d\'origine', /onClick=\{\(\) => setMessage\(TEXTES_AFFICHE\.message\)\}/.test(dash))
}

console.log(`\nKit média : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
