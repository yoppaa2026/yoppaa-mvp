// Banc du VISUEL PARTAGÉ SUR LES RÉSEAUX.
//
// 🔴 CE QU'IL GARDE : qu'un visuel publié sur Instagram RAMÈNE chez Yoppaa. Un
// lien dans une légende Instagram n'est pas cliquable : l'adresse écrite sur
// l'image est la seule chose qui puisse faire revenir quelqu'un. Un visuel sans
// adresse est une belle image qui travaille pour Meta.
//
// 🔴 ET QUE RIEN NE DÉBORDE. `fillText` ne replie ni ne rétrécit : il déborde,
// et le canvas coupe EN SILENCE. Le fichier est produit, il est correct, il est
// juste tronqué, et le commerçant le découvre publié.
//
// ⚠️ TOUT S'EXÉCUTE. `contenuVisuel`, `replierTexte` et `taillePourTenir` sont
// des fonctions pures : on les appelle avec des cas précis et on regarde ce
// qu'elles rendent. Les gardes de code ne servent qu'au tracé, qui exige un
// navigateur.

import {
  FORMATS, FORMAT_CARRE, FORMAT_PAYSAGE,
  TYPE_INVENDU, TYPE_DEAL, TYPE_ACTU,
  habitDe, contenuVisuel, replierTexte, taillePourTenir,
  pointsDuVisuel, largeurDesPoints, adresseLisible, nomFichierVisuel,
  accrocheVisuelle, resumeVisuel, sansEmoji,
  POINTS_SUR_CLAIR, POINTS_SUR_SOMBRE,
} from '../lib/visuel-partage.js'
import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// Une mesure de largeur factice mais RÉALISTE : la largeur d'un caractère est
// proportionnelle au corps. Suffisant pour juger un repli, et indépendant de la
// police réellement installée sur la machine du banc.
const LARGEUR_CAR = 0.52
const mesurer = (taille) => (texte) => String(texte || '').length * taille * LARGEUR_CAR
const mesurerA = (texte, taille) => String(texte || '').length * taille * LARGEUR_CAR

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES DEUX FORMATS
// ═══════════════════════════════════════════════════════════════════════════
{
  egal('le carré fait 1080', [FORMATS[FORMAT_CARRE].largeur, FORMATS[FORMAT_CARRE].hauteur], [1080, 1080])
  egal('le paysage fait 1200 sur 630', [FORMATS[FORMAT_PAYSAGE].largeur, FORMATS[FORMAT_PAYSAGE].hauteur], [1200, 630])

  // 🔴 DEUX BARÈMES, PAS UN SEUL MIS À L'ÉCHELLE. Le paysage n'a que 630 de haut
  // contre 1080 : réutiliser les tailles du carré fait sortir le titre du cadre,
  // et le canvas le coupe sans rien dire. C'est le débordement vu par Alex.
  const C = FORMATS[FORMAT_CARRE], P = FORMATS[FORMAT_PAYSAGE]
  verifier('🔴 le paysage a ses PROPRES tailles, plus petites',
    P.titre < C.titre && P.prix < C.prix && P.adresse < C.adresse && P.marge < C.marge)
  // ⚠️ ET MOINS DE LIGNES : trois lignes de titre ne tiennent pas dans 630 de
  // haut une fois le prix et le pied posés.
  verifier('🔴 et il accepte moins de lignes de titre', P.titreLignes < C.titreLignes)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LES TROIS HABITS
// ═══════════════════════════════════════════════════════════════════════════
{
  // ⚠️ L'HABIT VIENT DU TYPE. Alex a fait corriger la confusion entre un invendu
  // et un deal le 04/09 dans l'application : elle ne doit pas revenir par les
  // visuels.
  const i = habitDe(TYPE_INVENDU), d = habitDe(TYPE_DEAL), a = habitDe(TYPE_ACTU)
  egal('l’invendu porte « Rien ne se perd »', i.badge, 'RIEN NE SE PERD')
  egal('le deal porte « Deal du jour »', d.badge, 'DEAL DU JOUR')
  egal('l’actualité porte « Nouveauté »', a.badge, 'NOUVEAUTÉ')
  verifier('🔴 les trois fonds sont différents', i.fond !== d.fond && d.fond !== a.fond && i.fond !== a.fond)
  // ⚠️ SEUL L'INVENDU PORTE LA MARQUE SUR SON BADGE : c'est la signature de la
  // rubrique, pas un ornement.
  verifier('🔴 la marque anti-gaspi ne coiffe QUE l’invendu',
    i.marqueSurBadge === true && d.marqueSurBadge === false && a.marqueSurBadge === false)
  // ⚠️ UN TYPE INCONNU NE CASSE PAS LE DESSIN : il reçoit l'habit d'une
  // actualité plutôt qu'un objet vide qui ferait tomber le tracé.
  egal('un type inconnu retombe sur l’actualité', habitDe('n’importe quoi').badge, 'NOUVEAUTÉ')
  egal('et un type absent aussi', habitDe(null).badge, 'NOUVEAUTÉ')
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES CINQ POINTS DU LOGO
// ═══════════════════════════════════════════════════════════════════════════
{
  // 🔴 J'EN AVAIS DESSINÉ TROIS SUR LES MAQUETTES, ALEX L'A VU. Le logo en a
  // CINQ : grand, mini, grand, mini, grand.
  const pts = pointsDuVisuel(20, true)
  egal('🔴 il y a CINQ points, pas trois', pts.length, 5)
  verifier('🔴 grand, mini, grand, mini, grand',
    pts[0].diametre > pts[1].diametre && pts[2].diametre > pts[1].diametre
    && pts[2].diametre > pts[3].diametre && pts[4].diametre > pts[3].diametre)
  verifier('les trois grands ont le même diamètre',
    Math.abs(pts[0].diametre - pts[2].diametre) < 0.01 && Math.abs(pts[2].diametre - pts[4].diametre) < 0.01)
  verifier('le mini vaut 0,55 du grand',
    Math.abs(pts[1].diametre / pts[0].diametre - 0.55) < 0.01)

  // 🔴 LE DÉCALAGE PORTE SUR LES POINTS 2, 3 ET 4, jamais sur les seuls petits.
  // Le module du logo le dit : « appliqué aux deux petits points seulement, la
  // ligne s'aplatit et le logo n'est plus le logo ». C'est lui qui creuse le
  // sourire.
  verifier('🔴 le décalage porte sur les points 2, 3 ET 4',
    pts[0].decalage === 0 && pts[4].decalage === 0
    && pts[1].decalage > 0 && pts[2].decalage > 0 && pts[3].decalage > 0)
  verifier('et le point du milieu descend AUTANT que les petits',
    Math.abs(pts[2].decalage - pts[1].decalage) < 0.01)

  // ⚠️ LES POINTS NE SE CHEVAUCHENT PAS : chacun commence après le précédent.
  verifier('les points ne se chevauchent pas',
    pts.every((p, i) => i === 0 || p.x >= pts[i - 1].x + pts[i - 1].diametre - 0.01))
  verifier('la largeur totale couvre les cinq', largeurDesPoints(20) > 20 * 4)

  // ⚠️ DEUX PALETTES, SELON LE FOND. Le premier point est l'encre sur clair et
  // le blanc sur sombre : le même code le rendrait invisible d'un côté.
  egal('sur clair, le premier point est l’encre', pointsDuVisuel(20, true)[0].couleur, POINTS_SUR_CLAIR[0])
  egal('sur sombre, il est blanc', pointsDuVisuel(20, false)[0].couleur, POINTS_SUR_SOMBRE[0])
  verifier('🔴 les deux palettes diffèrent', POINTS_SUR_CLAIR[0] !== POINTS_SUR_SOMBRE[0])
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LE REPLI DU TEXTE, LE DÉFAUT QU'ALEX A VU
// ═══════════════════════════════════════════════════════════════════════════
{
  const titre = 'Assortiment de pâtisseries du jour'
  const lignes = replierTexte(mesurer(82), titre, 936, 3)
  verifier('🔴 un titre long se replie au lieu de déborder', lignes.length > 1)
  verifier('🔴 et aucune ligne ne dépasse la largeur',
    lignes.every(l => mesurer(82)(l) <= 936),
    lignes.map(l => Math.round(mesurer(82)(l))).join(' / '))
  egal('le texte n’est pas altéré', lignes.join(' '), titre)

  // ⚠️ ON S'ARRÊTE AU PLAFOND, on ne rend pas quatre lignes quand trois sont
  // demandées : la quatrième est déjà hors du cadre.
  const long = 'un deux trois quatre cinq six sept huit neuf dix onze douze'
  egal('🔴 le nombre de lignes est plafonné', replierTexte(mesurer(82), long, 200, 2).length, 2)
  egal('et le plafond vaut ce qu’on demande', replierTexte(mesurer(82), long, 200, 4).length, 4)
  // 🔴 UN PLAFOND ABSURDE NE REND PAS TOUT LE TEXTE. À zéro, l'arrêt ne serait
  // jamais atteint et la fonction rendrait une ligne par mot, hors du cadre.
  egal('🔴 un plafond à zéro rend UNE ligne, pas douze', replierTexte(mesurer(82), long, 200, 0).length, 1)
  egal('un plafond absent aussi', replierTexte(mesurer(82), long, 200, undefined).length, 3)
  egal('un plafond qui n’est pas un nombre aussi', replierTexte(mesurer(82), long, 200, 'trois').length, 1)

  // ⚠️ UN MOT PLUS LARGE QUE LA LIGNE NE FAIT PAS BOUCLE INFINIE. Un nom de
  // produit sans espace existe, et il ne doit pas figer l'écran.
  verifier('un mot trop long ne boucle pas',
    replierTexte(mesurer(82), 'Anticonstitutionnellementement', 50, 3).length >= 1)
  egal('un texte vide ne rend aucune ligne', replierTexte(mesurer(82), '', 900, 3), [])
  egal('un texte absent non plus', replierTexte(mesurer(82), null, 900, 3), [])

  // 🔴 ON REPLIE D'ABORD, ON RÉDUIT ENSUITE. `lib/affiche-kit.js` réduisait
  // jusqu'à tenir sur UNE ligne : « Assortiment de pâtisseries du jour » serait
  // descendu à trente pixels, et le titre n'aurait plus été un titre.
  const t = taillePourTenir(mesurerA, titre, 936, 82, 46, 3)
  verifier('🔴 la taille reste grande quand le repli suffit', t >= 46 && t <= 82, String(t))
  verifier('et à cette taille, le titre tient en trois lignes',
    replierTexte(mesurer(t), titre, 936, 4).length <= 3)
  // ⚠️ ON NE DESCEND JAMAIS SOUS LE PLANCHER, même si le texte est démesuré :
  // en dessous, mieux vaut couper que rendre le titre illisible.
  verifier('🔴 le plancher de taille est respecté',
    taillePourTenir(mesurerA, 'un texte volontairement interminable qui ne tiendra jamais nulle part quoi qu on fasse', 200, 82, 46, 2) >= 46)
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CE QUE LA CARTE DIT, ET CE QU'ELLE TAIT
// ═══════════════════════════════════════════════════════════════════════════
{
  const base = {
    type: TYPE_INVENDU, enseigne: 'Boulangerie Dupont', titre: 'Pâtisseries du jour',
    prix: 4.5, prixBarre: 9, tempsRestant: "jusqu'à 18 h 30", quantite: 'il en reste 3',
    lien: 'https://www.yoppaa.app/commander/boulangerie-dupont',
  }
  const c = contenuVisuel(base)
  egal('la remise se calcule, elle ne se saisit pas', c.remise, '-50 %')
  egal('l’adresse est lisible', c.adresse, 'yoppaa.app/commander/boulangerie-dupont')
  egal('l’invendu porte ses deux pastilles', c.pastilles.length, 2)

  // 🔴 SANS TITRE NI ENSEIGNE, IL N'Y A PAS DE CARTE. En dessiner une vide
  // enverrait le commerçant publier un rectangle violet.
  egal('🔴 sans titre, aucune carte', contenuVisuel({ ...base, titre: '' }), null)
  egal('🔴 sans enseigne, aucune carte', contenuVisuel({ ...base, enseigne: '  ' }), null)
  egal('et sans rien du tout non plus', contenuVisuel({}), null)

  // ⚠️ CHAQUE ÉLÉMENT DISPARAÎT SI LA DONNÉE MANQUE. Un prix absent ne laisse
  // pas un blanc, il n'existe pas.
  const sansPrix = contenuVisuel({ ...base, prix: null, prixBarre: null })
  egal('un prix absent ne laisse pas un blanc', [sansPrix.prix, sansPrix.prixBarre, sansPrix.remise], [null, null, null])

  // 🔴 UN PRIX BARRÉ QUI NE DÉPASSE PAS LE PRIX N'EN EST PAS UN : l'afficher
  // ferait passer une hausse pour une remise.
  const faussement = contenuVisuel({ ...base, prix: 9, prixBarre: 4.5 })
  egal('🔴 un prix barré plus bas que le prix est écarté', [faussement.prixBarre, faussement.remise], [null, null])
  const egaux = contenuVisuel({ ...base, prix: 9, prixBarre: 9 })
  egal('et un prix barré égal aussi', egaux.prixBarre, null)
  // ⚠️ LE PIÈGE DU ZÉRO : `Number(null)` vaut 0, et un prix de zéro euro n'est
  // pas un prix. Huitième fois dans ce projet.
  egal('🔴 un prix à zéro n’est pas un prix', contenuVisuel({ ...base, prix: 0 }).prix, null)

  // 🔴 LES PASTILLES SONT RÉSERVÉES À L'INVENDU. Un deal dure la semaine et n'a
  // pas d'heure de fin ; lui en coller ferait des deux le même objet.
  const deal = contenuVisuel({ ...base, type: TYPE_DEAL })
  egal('🔴 un deal ne porte AUCUNE pastille de temps ni de stock', deal.pastilles.length, 0)
  const actu = contenuVisuel({ ...base, type: TYPE_ACTU })
  egal('une actualité non plus', actu.pastilles.length, 0)

  // ⚠️ LA DESCRIPTION N'EXISTE QUE SUR UNE ACTUALITÉ : sur un invendu, elle
  // prendrait la place de ce qui fait sortir de chez soi.
  const avecDesc = { ...base, description: 'Un soin doux et ressourçant.' }
  egal('la description ne vit que sur une actualité',
    [contenuVisuel({ ...avecDesc, type: TYPE_ACTU }).description !== null,
     contenuVisuel({ ...avecDesc, type: TYPE_INVENDU }).description], [true, null])
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 bis. LE TITRE D'UNE AFFICHE N'EST PAS UNE PHRASE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 ALEX, 05/09, SUR CAPTURE. Le titre du visuel était la version COURTE du
// post : « Une nouveauté au Centre Respire : le Reiki arrive chez nous ! Séance
// d'1h à 50€. ✨ ». Ce n'est pas un titre, c'est un post écrit en très gros.
{
  // ⚠️ ON COUPE À LA PONCTUATION FORTE, là où la phrase se casse en deux, et
  // JAMAIS au milieu d'un mot.
  egal('🔴 le titre s’arrête à la première ponctuation forte',
    accrocheVisuelle('Une nouveauté au Centre Respire : le Reiki arrive chez nous !'),
    'Une nouveauté au Centre Respire')
  egal('un point fait le même office',
    accrocheVisuelle('Séance de Reiki. Une heure rien que pour vous.'), 'Séance de Reiki')
  // ⚠️ UN TITRE DÉJÀ COURT N'EST PAS TOUCHÉ, MÊME S'IL CONTIENT UNE PONCTUATION.
  //
  // 🔴 SANS CE CAS, LA GARDE NE MESURAIT RIEN : sur un titre court SANS
  // ponctuation, le raccourci et le chemin long donnent le même résultat, et le
  // harnais l'a montré en cassant le raccourci sans faire rougir le banc.
  // C'est ici que les deux chemins divergent.
  egal('un titre court passe intact', accrocheVisuelle('Séance de Reiki'), 'Séance de Reiki')
  egal('🔴 et un titre court GARDE sa ponctuation interne',
    accrocheVisuelle('Reiki : le soin doux'), 'Reiki : le soin doux')
  egal('la ponctuation finale disparaît', accrocheVisuelle('Nos lunchs à emporter !'), 'Nos lunchs à emporter')

  // 🔴 ET AUCUNE ELLIPSE SUR UN TITRE. « Une nouveauté au Centre Res… » ne veut
  // plus rien dire : un titre a le droit d'être un fragment, pas d'être coupé.
  const sansPonctuation = accrocheVisuelle('Assortiment de pâtisseries et de viennoiseries maison du jour préparées ce matin')
  verifier('🔴 aucune ellipse sur un titre', !/…|\.\.\./.test(sansPonctuation), sansPonctuation)
  verifier('et il garde des mots entiers',
    sansPonctuation.split(/\s+/).every(m => 'Assortiment de pâtisseries et de viennoiseries maison du jour préparées ce matin'.includes(m)))
  verifier('🔴 le nombre de mots est plafonné',
    sansPonctuation.split(/\s+/).length <= 7, sansPonctuation)

  // ⚠️ SUR UNE AFFICHE, UN EMOJI DÉTONNE : rendu en couleurs par le système au
  // milieu d'une typographie choisie, la carte cesse d'avoir l'air dessinée.
  egal('🔴 les emojis sortent du titre', accrocheVisuelle('Séance de Reiki ✨'), 'Séance de Reiki')
  egal('et du sous-titre', resumeVisuel('Un moment de détente 🙏 profonde'), 'Un moment de détente profonde')
  egal('sansEmoji ne mange pas le texte', sansEmoji('Pâtisseries à 4,50 €'), 'Pâtisseries à 4,50 €')

  // ⚠️ ICI L'ELLIPSE EST HONNÊTE : une description est de la prose, et les
  // points de suspension disent qu'elle continue. Mais on coupe à un mot entier.
  const longue = 'Une séance d’une heure pour vous offrir un moment de détente profonde et de reconnexion à vous-même, dans un cadre apaisant et chaleureux.'
  const resume = resumeVisuel(longue)
  verifier('🔴 la description est ramenée à sa place', resume.length <= 122, String(resume.length))
  verifier('elle porte une ellipse, elle', /…$/.test(resume), resume)
  // 🔴 CETTE GARDE TESTAIT LA MAUVAISE PROPRIÉTÉ, et le harnais l'a dit : elle
  // vérifiait que le résumé est un PRÉFIXE de l'original. Une coupe en plein
  // milieu d'un mot est aussi un préfixe : « un moment de déten » passait.
  // Ce qui compte est que le DERNIER MOT soit un mot entier de l'original.
  {
    const mots = resume.replace(/…$/, '').trim().split(/\s+/)
    const dernierMot = mots[mots.length - 1]
    verifier('🔴 et elle ne coupe pas un mot',
      longue.split(/\s+/).includes(dernierMot), `finit par « ${dernierMot} »`)
  }
  egal('une description courte n’est pas touchée',
    resumeVisuel('Un soin doux.'), 'Un soin doux.')

  // ⚠️ LE FILET S'APPLIQUE À TOUS LES APPELANTS, pas seulement au générateur :
  // un invendu apporte le titre de son article, qui vient du catalogue.
  const c = contenuVisuel({
    type: TYPE_ACTU, enseigne: 'Centre Respire',
    titre: 'Une nouveauté au Centre Respire : le Reiki arrive chez nous ! ✨',
    description: 'x'.repeat(400), lien: 'https://www.yoppaa.app/commander/x',
  })
  egal('🔴 la carte applique le filet au titre', c.titre, 'Une nouveauté au Centre Respire')
  verifier('🔴 et à la description', c.description.length <= 122, String(c.description.length))
  // ⚠️ ET SANS TITRE UTILISABLE, IL N'Y A TOUJOURS PAS DE CARTE : un titre fait
  // uniquement d'emojis ne devient pas un titre vide qu'on dessinerait quand même.
  egal('🔴 un titre fait d’emojis ne fait pas une carte',
    contenuVisuel({ type: TYPE_ACTU, enseigne: 'X', titre: '✨🙏', lien: 'https://x.be' }), null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. L'ADRESSE, LA SEULE CHOSE QUI RAMÈNE
// ═══════════════════════════════════════════════════════════════════════════
{
  // ⚠️ SANS « https:// » NI « www. » : personne ne les recopie, et ils mangent
  // la largeur dont l'adresse a besoin pour rester lisible.
  egal('le protocole disparaît', adresseLisible('https://www.yoppaa.app/commander/x'), 'yoppaa.app/commander/x')
  egal('le http aussi', adresseLisible('http://yoppaa.app/commander/x'), 'yoppaa.app/commander/x')
  egal('la barre finale aussi', adresseLisible('https://www.yoppaa.app/commander/x/'), 'yoppaa.app/commander/x')
  // 🔴 SANS LIEN, PAS D'ADRESSE INVENTÉE. Une carte sans adresse est une belle
  // image qui travaille pour Facebook : la garde du dessin doit pouvoir le voir.
  egal('🔴 sans lien, aucune adresse', adresseLisible(null), null)
  egal('un lien vide non plus', adresseLisible('   '), null)
  egal('et la carte le dit', contenuVisuel({ type: TYPE_ACTU, enseigne: 'X', titre: 'Y', lien: null }).adresse, null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LE NOM DU FICHIER
// ═══════════════════════════════════════════════════════════════════════════
{
  // ⚠️ IL DIT CE QU'IL CONTIENT : trois visuels téléchargés dans la journée
  // doivent se distinguer sans qu'on les ouvre.
  egal('le fichier se nomme', nomFichierVisuel(TYPE_INVENDU, FORMAT_CARRE, 'le-fournil'),
    'yoppaa-invendu-carre-le-fournil.png')
  egal('sans slug, il reste valable', nomFichierVisuel(TYPE_DEAL, FORMAT_PAYSAGE, null),
    'yoppaa-deal-paysage.png')
  verifier('aucun caractère interdit ne survit',
    !/[^a-z0-9.-]/.test(nomFichierVisuel(TYPE_ACTU, FORMAT_CARRE, 'Chez l’Ami & Co')))
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LE TRACÉ ET LE PARTAGE
// ═══════════════════════════════════════════════════════════════════════════
{
  const TRACE = sansProse(readFileSync(new URL('../lib/visuel-partage-canvas.js', import.meta.url), 'utf8'))
  const BOUTON = sansProse(readFileSync(new URL('../app/components/PartageVisuel.js', import.meta.url), 'utf8'))
  const GENE = sansProse(readFileSync(new URL('../app/dashboard/TabGenerateur.js', import.meta.url), 'utf8'))

  // 🔴 LA POLICE DOIT ÊTRE CHARGÉE AVANT DE DESSINER. `fillText` ne l'attend
  // pas : appelé trop tôt, il trace en Arial sans prévenir, et le visuel part
  // sur Facebook dans la mauvaise typographie.
  // ⚠️ LA GARDE EXIGE LA CONDITION, PAS SEULEMENT L'APPEL, et c'est le harnais
  // qui l'a dit : remplacer le test par `if (false)` laissait
  // `await document.fonts.ready` intact dans le fichier, donc la garde verte.
  // Quatrième fois aujourd'hui qu'une garde survit parce que le MOT survit à la
  // mutation. On vise la condition ET l'appel, dans cet ordre.
  verifier('🔴 on attend les polices avant de tracer',
    /if \(document\.fonts && document\.fonts\.ready\) await document\.fonts\.ready/.test(TRACE))

  // 🔴 AUCUNE IMAGE DISTANTE, décision d'Alex : ni photo, ni logo. Dessiner une
  // ressource externe SALIT le canvas et l'export échoue.
  verifier('🔴 le tracé ne charge AUCUNE image distante',
    !/new Image\(|drawImage|\.src\s*=/.test(TRACE))

  // ⚠️ ON DEMANDE À `canShare` AVANT D'APPELER `share` : un navigateur peut
  // connaître le partage sans accepter les FICHIERS, et l'appel lèverait.
  verifier('🔴 on vérifie que le fichier est partageable',
    /navigator\.canShare\(\{ files: \[fichier\] \}\)/.test(TRACE))
  // ⚠️ UN REFUS N'EST PAS UNE PANNE : télécharger un fichier que le commerçant
  // vient de refuser serait le contraire de ce qu'il a demandé.
  verifier('🔴 une annulation ne déclenche pas le téléchargement',
    /if \(e && e\.name === 'AbortError'\) return 'annule'/.test(TRACE))

  // ⚠️ LE MODULE DE TRACÉ EST CHARGÉ À LA DEMANDE : il ne sert qu'ici et ne
  // tourne que dans un navigateur.
  verifier('le tracé est chargé à la demande',
    /import\('@\/lib\/visuel-partage-canvas'\)/.test(BOUTON))
  // 🔴 UN BOUTON QUI NE PEUT RIEN FAIRE NE S'AFFICHE PAS. Sans titre ni
  // enseigne, il n'y a pas de carte : le proposer quand même serait un bouton
  // mort, ce qui est pire que pas de bouton.
  verifier('🔴 le bouton disparaît quand il n’y a pas de carte',
    /if \(!contenuVisuel\(annonce \|\| \{\}\)\) return null/.test(BOUTON))
  // ⚠️ L'APERÇU EST LA CONDITION D'USAGE : un commerçant ne partage pas une
  // image qu'il n'a pas vue. Demande d'Alex du 05/09.
  verifier('🔴 l’aperçu se dessine avant tout partage',
    /visuelEnApercu\(annonce, format\)/.test(BOUTON))
  // ⚠️ ET IL SE REDESSINE quand on change de proposition ou de format.
  verifier('et il se redessine au changement',
    /const cle = JSON\.stringify\(annonce \|\| null\) \+ format/.test(BOUTON))
  // 🔴 LE BOUTON NE PROMET PAS DE PUBLIER. Facebook interdit le texte
  // pré-rempli, Instagram n'a aucun partage web : « Publier sur Facebook » se
  // paierait à la première tentative.
  verifier('🔴 le bouton dit « Partager », jamais « Publier »',
    /Partager le visuel/.test(BOUTON) && !/Publier sur/.test(BOUTON))

  // ⚠️ DEUX BOUTONS, ET CE N'EST PAS UNE REDONDANCE (Alex, 05/09). Le partage
  // sert à celui qui publie depuis son téléphone, le téléchargement à celui qui
  // prépare sur ordinateur ou veut garder le fichier.
  verifier('🔴 le téléchargement existe à côté du partage',
    /onClick=\{telecharger\}/.test(BOUTON) && /telechargerVisuel\(\{ annonce, format, slug \}\)/.test(BOUTON))
  // ⚠️ LES DEUX BOUTONS DISENT « LE VISUEL », pas « l'image » d'un côté : deux
  // mots pour un seul objet font hésiter, et le commerçant se demande si le
  // fichier téléchargé est bien celui qu'il voit à l'écran.
  verifier('🔴 les deux boutons nomment le même objet',
    /Partager le visuel/.test(BOUTON) && /Télécharger le visuel/.test(BOUTON)
    && !/l&apos;image|l'image/.test(BOUTON))
  // ⚠️ ET IL DIT CE QUI S'EST PASSÉ, y compris quand rien ne s'est passé : un
  // bouton muet qui ne fait rien est pire que pas de bouton.
  // ⚠️ LA GARDE NE CITE PLUS LE MESSAGE, elle exige la BRANCHE. Écrite avec le
  // texte exact, elle a rougi dès que j'ai changé « Image » en « Visuel » :
  // elle mesurait une formulation, pas un comportement.
  verifier('🔴 et il annonce son résultat, même négatif',
    /if \(fait\) toast\?\.\(/.test(BOUTON) && /else toast\?\.\(/.test(BOUTON))
  // ⚠️ L'APERÇU EST GRAND : c'est ce que le commerçant va publier, le montrer en
  // vignette lui demandait de deviner.
  verifier('🔴 l’aperçu est assez grand pour être jugé',
    /maxWidth: format === FORMAT_CARRE \? 420 : 560/.test(BOUTON))

  // ⚠️ LE GÉNÉRATEUR COMPOSE AVEC LA VERSION COURTE : quatre phrases sur une
  // image ne se lisent pas.
  verifier('🔴 le générateur porte l’aperçu', /<PartageVisuel/.test(GENE))
  verifier('et il compose une NOUVEAUTÉ, pas un invendu',
    /type: TYPE_ACTU,/.test(GENE))
  // 🔴 IL PREND L'ACCROCHE, PAS LA VERSION COURTE. C'est tout le défaut vu par
  // Alex : la version courte est une phrase entière, avec deux points, un prix
  // et un emoji. Le repli reste, parce qu'un modèle peut ne pas suivre la
  // consigne, mais il vient APRÈS.
  verifier('🔴 le titre du visuel est l’accroche, pas le post',
    /titre: v\.accroche \|\| v\.court/.test(GENE))
  verifier('et le sous-titre passe avant le texte long',
    /description: v\.soustitre \|\| v\.court/.test(GENE))

  // ═══ DEUX NIVEAUX, PUIS LE VISUEL (Alex, 05/09) ══════════════════════════
  //
  // 🔴 LE COMMERÇANT DOIT VOIR CE QU'IL COPIE. Les hashtags et le lien
  // flottaient sous les deux versions sans qu'on sache lesquels partaient avec
  // quoi : il découvrait le contenu de son presse-papiers une fois publié.
  verifier('🔴 les deux versions sont nommées',
    /Version standard/.test(GENE) && /Version courte/.test(GENE))
  verifier('et chacune a son propre bouton de copie',
    /Copier la version standard/.test(GENE) && /Copier la version courte/.test(GENE))
  // 🔴 LA COURTE PORTE LE LIEN ELLE AUSSI. Rien n'empêche de la coller sur
  // Facebook : sans signature, ce post-là ne ramènerait personne, et c'est
  // exactement le trou qu'on vient de boucher.
  egal('🔴 les DEUX copies portent la signature',
    (GENE.match(/copier\(postAvecSignature\(/g) || []).length, 2)
  // ⚠️ ET LA ROUTE DOIT LES DEMANDER, sinon le repli sert à tous les coups et
  // le titre redevient un post.
  const ROUTE = sansProse(readFileSync(new URL('../app/api/ia/generer-post/route.js', import.meta.url), 'utf8'))
  verifier('🔴 le prompt demande une accroche faite pour une affiche',
    /"accroche" : 2 à 5 MOTS, le titre de l'affiche/.test(ROUTE))
  verifier('et un sous-titre d’une phrase',
    /"soustitre" : UNE phrase de 12 mots maximum/.test(ROUTE))
  verifier('et la route les fait suivre à l’écran',
    /accroche: String\(v\.accroche \|\| ''\)\.trim\(\)/.test(ROUTE)
    && /soustitre: String\(v\.soustitre \|\| ''\)\.trim\(\)/.test(ROUTE))
  // ⚠️ ET IL PASSE LE LIEN : sans lui, le visuel ne ramène nulle part, ce qu'on
  // vient justement de corriger dans le texte.
  verifier('🔴 le lien est passé au visuel', /lien,\s*\}\}/.test(GENE))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Visuel de partage vert.')
