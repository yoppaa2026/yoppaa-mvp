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

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// ⚠️ POUR CHERCHER CE QUI NE DOIT PAS EXISTER, ON LIT LE CODE SANS SA PROSE.
// Sixième fois en trois jours que je cherche un mot et le trouve dans MON
// PROPRE COMMENTAIRE : celui qui explique pourquoi `document.write` a été
// retiré contient forcément `document.write`. Retirer le commentaire serait
// perdre l'explication ; on dépouille le texte, une fois pour toutes.
const lireCode = (chemin) => lire(chemin)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')

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
    ['le nom du commerce', /taillePourTenir\(nomCommerce, 42, 700\)/],
    ['la première ligne de l\'accroche', /taillePourTenir\(TEXTES_AFFICHE\.accroche, 54, 900\)/],
    ['la seconde ligne', /taillePourTenir\(TEXTES_AFFICHE\.accrocheSuite, 54, 900\)/],
    ['le slogan', /taillePourTenir\(LOGO\.slogan/],
    ['le pied', /taillePourTenir\(TEXTES_AFFICHE\.pied, 28, 600\)/],
  ]) {
    verifie(`${quoi} est contraint à la largeur`, motif.test(bloc), 'il déborderait en silence')
  }
  // ⚠️ LES DEUX LIGNES DE L'ACCROCHE PARTAGENT UNE SEULE TAILLE : réglées
  // séparément, une même phrase sortirait en deux corps différents.
  verifie('les deux lignes de l\'accroche gardent le même corps',
    /Math\.min\(\s*taillePourTenir\(TEXTES_AFFICHE\.accroche/.test(bloc))
  // ⚠️ ET LA TAILLE CALCULÉE EST RÉELLEMENT UTILISÉE. Mesuré : en remettant un
  // corps fixe sur l'accroche, les gardes ci-dessus restaient vertes — le
  // calcul était toujours écrit, son résultat n'allait simplement plus nulle
  // part. C'est « l'appel existe, son résultat ne sert pas ».
  verifie('🔴 et l\'accroche est vraiment dessinée à cette taille',
    /900 \${tailleAccroche}px/.test(bloc), 'la taille serait calculée puis jetée')
  verifie('aucun corps fixe ne subsiste sur les textes de l\'affiche',
    !/ctx\.font = '\d00 \d+px "DM Sans"/.test(bloc),
    'un corps écrit en dur ne s\'adapte à aucun texte')

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
  verifie('🔴 le tableau de bord passe par le module partagé',
    /telechargerAffichePng\(\{ qrDataUrl, nomCommerce, clair, slug \}\)/.test(dash))
  verifie('🔴 la page du kit aussi',
    /from '@\/lib\/affiche-kit'/.test(kit) && /telechargerAffichePng\(commun\)/.test(kit))
  verifie('🔴 et le kit propose bien l\'AFFICHE, plus le QR nu',
    !/Télécharger le QR/.test(kit) && /Ton affiche de vitrine/.test(kit),
    'le commerçant collerait un carré noir et blanc en vitrine')
  verifie('le kit propose les deux fonds', /setFondClair\(o\.clair\)/.test(kit))
  verifie('et les trois formats', /telecharger\('png'\)/.test(kit)
    && /telecharger\('A5'\)/.test(kit) && /telecharger\('A4'\)/.test(kit))
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
  verifie('🔴 le QR du tableau de bord mène toujours à la fiche',
    /const url = slug \? `https:\/\/www\.yoppaa\.app\/commander\/\$\{slug\}` : null/.test(dash),
    'la destination redeviendrait dépendante du calendrier')
  const kitPage = lire('app/kit/[slug]/page.js')
  verifie('🔴 et le lien de la page kit aussi, son frère',
    /const lien = `\$\{BASE\}\/commander\/\$\{encodeURIComponent\(slug\)\}`/.test(kitPage),
    'un QR vers la fiche et un lien vers l\'inscription, sur la même page')
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
  verifie('le PDF aussi, dans les deux formats',
    /downloadPDF\('A5', fondClair\)/.test(dash) && /downloadPDF\('A4', fondClair\)/.test(dash))
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
  verifie('l\'aperçu suit le fond choisi',
    /background: fondClair \? '#FFFFFF' : '#201044'/.test(dash))
  // ⚠️ ET IL UTILISE LE COMPOSANT, il ne redessine plus le logo : cet aperçu en
  // avait sa propre version, avec TROIS points au lieu de cinq.
  verifie('🔴 l\'aperçu affiche le vrai logo',
    /<YoppaaLogo size=\{34\} mode=\{fondClair \? 'light' : 'dark'\} withSlogan\/>/.test(dash))
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
  const i = kit.indexOf('const TEXTES = [')
  const bloc = i === -1 ? '' : kit.slice(i, kit.indexOf(']', i))
  verifie('les messages se découpent', bloc.length > 200, String(bloc.length))
  verifie('🔴 aucun message ne parle d\'une date', !/\$\{ouverture\}|libelleLancement/.test(bloc))
  verifie('et aucun ne nomme un mois', !/octobre|septembre|novembre/i.test(bloc))
  verifie('il en reste trois', (bloc.match(/cle: '/g) || []).length === 3)

  // ⚠️ JAMAIS « AUCUNE COMMISSION » SANS SON SUJET. Yoppaa ne prend pas de
  // commission sur les ventes ; ça ne dit rien des frais du prestataire de
  // paiement, et la phrase ne doit pas promettre à sa place.
  const commissions = bloc.match(/[^.]*commission[^.]*/gi) || []
  for (const phrase of commissions) {
    verifie('« commission » est toujours attribuée à Yoppaa',
      /Yoppaa ne prend aucune commission/.test(phrase), phrase.trim())
  }
}

console.log(`\nKit média : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
