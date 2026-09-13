// Ce que la landing MONTRE du produit.
//
// La landing est le premier outil de recrutement du projet : c'est là qu'un
// commerçant décide s'il nous rappelle, et là qu'un habitant décide s'il
// installe. Elle montre le produit de deux façons, et ces deux façons ne font
// pas le même travail :
//
//   • des MAQUETTES dessinées en JSX. Elles ne pèsent rien, restent nettes à
//     toutes les tailles, suivent la charte toutes seules, et surtout elles
//     simplifient : on y lit un geste, pas un écran.
//   • des CAPTURES du vrai produit. Elles pèsent, elles figent, et c'est le
//     prix de la seule chose qu'un dessin ne peut pas faire : prouver.
//
// 🔴 LE DÉFAUT QUE CE BANC EXISTE POUR FERMER : UNE MAQUETTE QUI MENT.
// Le 13/09, `MockRdv` montrait encore la prise de rendez-vous d'avant le module
// d'agenda : pas d'indicateur d'étapes, « Avec qui » en pastilles de texte, les
// créneaux pris affichés barrés, le jour en titre au lieu d'un carrousel. Rien
// ne cassait, aucun banc ne rougissait, et la landing racontait un produit qui
// n'existait plus depuis des semaines. C'est ce que produit, à terme, toute
// maquette dessinée d'après le CODE plutôt que d'après l'ÉCRAN.
//
//   npm run verif:vitrine

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { CAPTURES_YOPPER, CAPTURES_COMMERCANT } from '../lib/captures-landing.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

// 🔴 `sansProse`, ET CE N'EST PAS UNE PRÉCAUTION DE STYLE. Ce banc cherche dans
// la landing des libellés que les commentaires de la landing CITENT pour
// expliquer pourquoi ils comptent. Lu avec ses commentaires, le fichier répond
// « présent » même si l'écran les a perdus. C'est le quatrième faux vert de ce
// type dans le projet, et le seul moyen de ne pas le refaire est de dépouiller
// avant de chercher.
const LANDING = sansProse(readFileSync(new URL('../app/components/LandingReveal.js', import.meta.url), 'utf8'))
const CADRAGES = sansProse(readFileSync(new URL('./preparer-captures-landing.mjs', import.meta.url), 'utf8'))

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES MAQUETTES SONT RANGÉES, ET AUCUNE N'EST ORPHELINE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ SEPT TÉLÉPHONES ALIGNÉS NE SE REGARDENT PAS. Les maquettes se sont
// ajoutées module par module jusqu'à faire un mur qui passait à la ligne tout
// seul. Chaque rangée porte une idée, et c'est le titre qui la porte : une
// rangée sans titre redevient une file d'attente.
{
  const rangees = [...LANDING.matchAll(/<RangeeMaquettes\s+titre="([^"]+)"/g)].map(m => m[1])
  verifier('les maquettes sont réparties en au moins deux rangées',
    rangees.length >= 2, `${rangees.length} rangée(s)`)
  verifier('chaque rangée porte un titre non vide',
    rangees.every(t => t.trim().length >= 8), rangees.join(' | '))

  // ⚠️ ON COMPTE LES MAQUETTES POSÉES, PAS CELLES DÉFINIES. Une maquette
  // écrite mais jamais placée dans une rangée est un écran que personne ne
  // verra, et rien ne le signale.
  const posees = [...LANDING.matchAll(/<(Mock[A-Za-z]+)\s*\/>/g)].map(m => m[1])
  const definies = [...LANDING.matchAll(/^function (Mock[A-Za-z]+)\(/gm)].map(m => m[1])
  const orphelines = definies.filter(d => !posees.includes(d))
  verifier('aucune maquette définie ne reste hors de la page',
    orphelines.length === 0, orphelines.join(', '))

  // Les deux rangées doivent être NON VIDES : un titre seul ne montre rien.
  const blocs = LANDING.split('<RangeeMaquettes').slice(1)
  verifier('chaque rangée contient au moins deux téléphones',
    blocs.every(b => (b.split('</RangeeMaquettes>')[0].match(/<PhoneFrame/g) || []).length >= 2),
    blocs.map(b => (b.split('</RangeeMaquettes>')[0].match(/<PhoneFrame/g) || []).length).join(', '))
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LA PRISE DE RENDEZ-VOUS DIT CE QUE LE PRODUIT FAIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Les quatre gardes qui suivent figent les quatre écarts mesurés le 13/09 en
// comparant la maquette à une capture de l'écran réel.
{
  const mock = LANDING.split('function MockRdv()')[1]?.split('\nfunction ')[0] || ''
  verifier('la maquette du rendez-vous existe', mock.length > 200)

  // L'indicateur d'étapes : c'est lui qui dit « c'est court », et c'est la
  // première chose qu'un client cherche avant de s'engager dans un tunnel.
  verifier('le rendez-vous affiche son indicateur d’étapes',
    /fait: true/.test(mock) && /actif: true/.test(mock))

  // ⚠️ « AVEC QUI » EST UNE LISTE DE PERSONNES, PAS UNE LISTE DE MOTS. L'écran
  // réel montre une pastille d'initiale par personne ; la version précédente
  // n'affichait que des noms dans des pilules, ce qui ne ressemblait à rien de
  // ce que le client voit.
  verifier('on choisit la personne sur une tuile à initiale',
    /borderRadius: '50%'/.test(mock) && /Sans préférence/.test(mock))

  // 🔴 LES CRÉNEAUX PRIS NE S'AFFICHENT PAS. Le produit montre ce qui reste ;
  // les barrer donnerait l'impression d'un agenda plein, c'est-à-dire l'inverse
  // exact de ce que la landing doit faire comprendre.
  verifier('aucun créneau n’est montré barré',
    !/lineThrough|line-through/.test(mock))

  // ⚠️ LE TROU DE MIDI. Entre 11:00 et 13:00 le salon mange, et cette absence
  // vient de la capture. Une grille « complétée » à la main redeviendrait un
  // dessin : c'est le détail qui prouve que la maquette a été relevée sur un
  // écran, pas imaginée.
  verifier('la grille garde le trou de midi de la capture',
    /'11:00', '13:00'/.test(mock))

  // Le compte de créneaux libres : l'écran le donne, et c'est lui qui dit
  // « il reste de la place » sans faire compter le lecteur.
  verifier('le nombre de créneaux libres est annoncé',
    /\d+ libres/.test(mock))
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES CAPTURES SONT AFFICHÉES, DES DEUX CÔTÉS, SUR LE BON FOND
// ═══════════════════════════════════════════════════════════════════════════
{
  verifier('la série commerçant est affichée',
    /CAPTURES_COMMERCANT\.map/.test(LANDING))
  verifier('la série Yopper est affichée',
    /CAPTURES_YOPPER\.map/.test(LANDING))

  // 🔴 UN TITRE BLANC SUR FOND CLAIR NE SE VOIT PAS, ET RIEN NE LE DIT. Les
  // deux séries passent par le même composant : celle du côté Yopper est posée
  // sur le fond clair de la page et doit le déclarer, sinon sa légende
  // disparaît purement et simplement.
  const blocYopper = LANDING.split('CAPTURES_YOPPER.map')[1]?.slice(0, 220) || ''
  verifier('la série Yopper déclare son fond clair',
    /fondClair/.test(blocYopper), blocYopper.slice(0, 90))

  verifier('les deux séries sont non vides',
    CAPTURES_YOPPER.length > 0 && CAPTURES_COMMERCANT.length > 0)

  // Chaque capture doit dire ce qu'elle montre, sinon la légende ne sert à
  // rien : un titre sans phrase laisse le lecteur deviner ce qu'il regarde.
  for (const c of [...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT]) {
    verifier(`« ${c.cle} » porte un titre et une légende`,
      typeof c.titre === 'string' && c.titre.trim().length >= 10 &&
      typeof c.legende === 'string' && c.legende.trim().length >= 40, c.titre)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES COMPTEURS D'UN COMPTE DE TEST NE PARTENT PAS EN LIGNE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CETTE GARDE PROTÈGE UNE DÉCISION, PAS UN FICHIER. L'écran du profil montre
// le temps économisé, et c'est l'argument le plus touchant de l'application :
// il reviendra sur la table, et il sera tentant de le publier « puisqu'il est
// beau ». Ses chiffres sont ceux d'un compte de test, gonflés par des mois
// d'essais : les montrer promet un usage que personne n'a encore.
//
// C'est la même règle que les zéros d'un commerce de démonstration, prise par
// l'autre bout. Le jour où un vrai Yopper aura de vrais chiffres, on refera la
// capture, et cette garde tombera avec une phrase d'explication.
{
  verifier('aucun cadrage ne vise l’écran du profil de test',
    !/IMG_4665/.test(CADRAGES))
  verifier('aucune capture du temps économisé n’est déclarée',
    ![...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT].some(c => /active|profil|temps/i.test(c.fichier)),
    [...CAPTURES_YOPPER, ...CAPTURES_COMMERCANT].map(c => c.fichier).join(', '))

  // ⚠️ ET LE CADRAGE RESTE UNE DÉCISION HUMAINE. Le script ignore toute image
  // sans entrée dans CADRAGES : c'est ce refus qui empêche une capture non
  // regardée, portant une adresse ou un code de bon, d'atterrir en ligne.
  verifier('une image sans cadrage décidé reste ignorée',
    /if \(!c\) \{/.test(CADRAGES) && /continue/.test(CADRAGES))
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. LA FICHE DE COMMANDE ET LES CARTES DE FIDÉLITÉ DISENT LE PRODUIT
// ═══════════════════════════════════════════════════════════════════════════
//
// Les deux maquettes les plus anciennes de la landing, refaites le 13/09 après
// qu'Alex les a pointées comme « trop éloignées de la vraie app ».
{
  const fiche = LANDING.split('function MockFiche()')[1]?.split('\nfunction ')[0] || ''
  verifier('la fiche existe encore', fiche.length > 400)

  // Les quatre éléments que l'ancienne n'avait pas, et que l'écran a.
  verifier('la fiche montre ses deux étapes',
    /Produits/.test(fiche) && /Créneau/.test(fiche))
  verifier('la fiche a ses onglets de catégories',
    /Viennoiserie/.test(fiche) && /Pâtisserie/.test(fiche))
  verifier('chaque article porte une vignette',
    /<VignetteArticle/.test(fiche))
  verifier('la disponibilité est dite sur l’article',
    /Disponible/.test(fiche))

  // 🔴 UNE VIGNETTE PORTE UNE ICÔNE, PAS UN APLAT NU (Alex, 13/09). Un carré de
  // couleur seul se lit comme une photo qui n'a pas chargé ; l'icône dit que
  // la photo du commerçant viendra là. Sans cette garde, la prochaine retouche
  // « simplifierait » en retirant le dessin, et personne ne le verrait.
  // 🔴 LE DÉCOUPAGE SE FAIT SUR `\nfunction `, PAS SUR UN COMMENTAIRE. La
  // première version bornait la fonction au commentaire suivant : comme
  // `sansProse` venait de les supprimer tous, la borne n'existait plus et la
  // garde lisait TOUT LE RESTE DU FICHIER, où un `<rect>` se trouve forcément.
  // Elle est restée verte pendant qu'on retirait l'icône. Trouvée par mutation,
  // jamais par relecture.
  const vignette = LANDING.split('function VignetteArticle(')[1]?.split('\nfunction ')[0] || ''
  verifier('la vignette est bien isolée', vignette.length > 100 && vignette.length < 1200,
    `${vignette.length} caractères découpés`)
  verifier('la vignette dessine une icône de photo',
    /<svg/.test(vignette) && /<rect/.test(vignette))

  // ⚠️ ET SES COULEURS D'INVENDUS VIENNENT DU MODULE. Une recopie de la valeur
  // crème tiendrait jusqu'à la première retouche du module, puis la landing
  // montrerait un écran qui n'existe plus.
  verifier('le bloc des invendus prend ses couleurs dans le module',
    /FOND_ANTI_GASPI/.test(fiche) && /BORD_ANTI_GASPI/.test(fiche))
  verifier('et ne recopie aucune couleur d’invendus en dur',
    !/#FBF8F2|#E6DECF/i.test(fiche))

  const fid = LANDING.split('function MockFidelite()')[1]?.split('\nfunction ')[0] || ''
  verifier('les cartes de fidélité existent encore', fid.length > 400)

  // 🔴 C'EST LA LISTE QUI DÉMONTRE LA PHRASE. Le libellé dit « sans carton à
  // perdre » : plusieurs commerces visibles d'un coup le prouvent, une carte
  // unique ne fait que l'illustrer. Repasser à une seule carte reviendrait à
  // reprendre l'écran précédent.
  // 🔴 LE MOTIF EST ANCRÉ SUR L'ACCOLADE, ET C'EST TOUTE LA DIFFÉRENCE. La
  // première version cherchait `n: '…'` et comptait des PROPRIÉTÉS CSS :
  // `flexDirection: 'column'`, `textAlign: 'center'`, `position: 'absolute'`
  // se terminent tous par un `n`. La garde annonçait dix commerces là où il y
  // en avait quatre, et restait verte quand on en retirait deux.
  const enseignesFid = (fid.match(/\{ n: '/g) || []).length
  verifier('plusieurs commerces sont montrés à la fois',
    enseignesFid >= 3, `${enseignesFid} carte(s)`)
  verifier('au moins une récompense est déjà débloquée',
    /gagne: true/.test(fid))
  verifier('le pointage au comptoir est expliqué',
    /numéro de GSM suffit au comptoir/.test(fid))
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE GOOD MORNING YOPPERS EST UNE ÉDITION, PAS UN FIL D'ACTUALITÉ
// ═══════════════════════════════════════════════════════════════════════════
//
// L'ancienne maquette montrait un bandeau violet et trois cartes empilées :
// n'importe quelle application fait ça. Le vrai écran est une carte qui s'ouvre
// par-dessus l'application, DATÉE, NUMÉROTÉE, rattachée à une commune, avec deux
// onglets qui comptent ce qu'il y a dedans et un pied qui donne rendez-vous au
// lendemain. C'est cette forme de journal qui explique pourquoi on l'ouvre, et
// aucun de ces éléments n'était là.
{
  const gmy = LANDING.split('function MockMorning()')[1]?.split('\nfunction ')[0] || ''
  verifier('l’édition du matin existe', gmy.length > 400)

  verifier('elle est datée', /DIMANCHE/.test(gmy) && /13 septembre/.test(gmy))
  verifier('elle porte un numéro d’édition', /N°/.test(gmy))
  verifier('elle nomme la commune', /Mettet/.test(gmy))
  verifier('ses deux onglets comptent ce qu’ils contiennent',
    /t: 'Deals', n: \d/.test(gmy) && /t: 'Actus', n: \d/.test(gmy))

  // ⚠️ ALEX A DEMANDÉ QU'ELLE MONTRE UN DEAL, et ses captures n'en avaient
  // aucun ce matin-là : l'écran affichait « Pas de deals à Mettet ce matin ».
  // Une maquette qui montrerait l'état vide raconterait l'inverse du libellé.
  verifier('un deal y est montré, pas un état vide',
    /Deal/.test(gmy) && !/Pas de deals/.test(gmy))
  // Le prix barré et le stock, ensemble : c'est le couple qui fait l'offre.
  verifier('le deal dit son prix, son prix barré et ce qu’il en reste',
    /lineThrough|line-through/.test(gmy) && /restants/.test(gmy))

  // 🔴 LE PIED EST CE QUI FAIT REVENIR. Sans le rendez-vous du lendemain, une
  // édition quotidienne n'est plus qu'une page de plus.
  verifier('le pied donne rendez-vous au lendemain',
    /Rendez-vous/.test(gmy) && /07h30/.test(gmy))
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA LANDING N'AFFICHE AUCUNE ENSEIGNE DE DÉMONSTRATION
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 TROIS Y ÉTAIENT, EN PRODUCTION, ET C'EST ALEX QUI LES A VUES. « La mie de
// test » affichait le mot TEST sur la page qui recrute les commerçants. Les
// deux autres désignent des commerces qui existent vraiment en base : leur
// prêter une fausse offre du soir ou une fausse carte de fidélité sur une page
// publique, c'est écrire à leur place.
//
// ⚠️ LA GARDE VISE LES PAGES PUBLIQUES, PAS LE CODE ENTIER. Ces mêmes noms
// vivent dans des commentaires de `lib/` qui racontent des cas vécus, et ils y
// sont utiles : c'est l'AFFICHAGE qui est en cause, pas la mention.
{
  const DEMOS = ['Kebabistro', 'La mie de test', 'La Boutique Témoin', 'Ciseaux et Soins', 'Centre Respire']
  for (const nom of DEMOS) {
    verifier(`la landing n’affiche pas l’enseigne « ${nom} »`, !LANDING.includes(nom))
  }
  // ⚠️ ET LA RÈGLE AU-DELÀ DE CES CINQ NOMS : une enseigne inventée ne dit
  // jamais qu'elle est un essai. Sans ce filet, la prochaine maquette écrite
  // en vitesse repasserait sous la liste ci-dessus.
  const enseignes = [...LANDING.matchAll(/enseigne: '([^']+)'/g)].map(m => m[1])
  verifier('aucune enseigne de maquette ne se dit de test',
    enseignes.every(e => !/\b(test|témoin|demo|démo)\b/i.test(e)), enseignes.join(', '))
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LE CALCULATEUR LIT LA MATRICE, ET DIT LA VÉRITÉ QUAND ELLE NOUS DESSERT
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 LA GARDE LA PLUS IMPORTANTE DE CE BANC. La formule d'un poste est DÉDUITE
// de `PLAN_FEATURES` et jamais recopiée : le jour où une capacité change de
// palier, le calculateur suit tout seul. Une table de correspondance écrite en
// dur continuerait d'annoncer l'ancien prix sans que rien ne casse, et c'est
// exactement le défaut qu'Alex a vu à la main : la fidélité est dans
// COMMUNIQUER à 19,90 €, et le calculateur répondait 49,90 € à un commerçant
// qui ne paie que ça.
{
  const calc = LANDING.split('function CalculateurCommission()')[1]?.split('\nfunction ')[0] || ''
  const res = LANDING.split('function ResultatCalcul(')[1]?.split('\nfunction ')[0] || ''
  verifier('le calculateur est écrit', calc.length > 1000)
  verifier('il est monté sur la landing', /<CalculateurCommission\/>/.test(LANDING))

  verifier('la formule d’un poste est déduite de la matrice',
    /PLANS\.find\(p => canDo\(p, capacite\)\)/.test(LANDING))
  verifier('aucun poste ne code sa formule en dur',
    !/formule: '(exister|communiquer|vendre)'/.test(LANDING))
  verifier('chaque poste déclare la capacité qui le couvre',
    (LANDING.match(/capacite: '/g) || []).length >= 10)
  verifier('les prix viennent de getPrixPlan',
    /getPrixPlan\(formule\)/.test(calc))

  // ⚠️ LES TROIS MODES, dont celui des abonnements qu'Alex a demandé.
  for (const m of ['pct', 'fix', 'abo']) {
    verifier(`le mode « ${m} » existe`, new RegExp(`'${m}'`).test(calc))
  }

  // 🔴 ET LE VERDICT QUI NOUS DONNE TORT. Un calculateur qui ne peut jamais
  // conclure contre son auteur se repère en trois secondes, et il emporte le
  // reste de la page. À petit volume, la commission gagne : on le dit, et on
  // renvoie vers la formule gratuite.
  verifier('le résultat prévoit le cas où la commission coûte moins cher',
    /ecart <= 0/.test(res))
  verifier('et renvoie alors vers la formule gratuite',
    /gratuite à vie/.test(res))

  // ⚠️ « LA COMMISSION YOPPAA », JAMAIS LA FORMULE NUE.
  verifier('la commission est toujours nommée avec son sujet',
    /la commission Yoppaa sur tes ventes/.test(calc))
  verifier('ce que Yoppaa ne fait pas est dit dans le mode abonnements',
    /ta caisse, ton stock ou les plannings/.test(calc))

  // ⚠️ ON NE NOMME AUCUNE PLATEFORME : publicité comparative, et le commerçant
  // qu'on recrute est souvent déjà leur client.
  //
  // 🔴 LA ZONE TESTÉE PART DE `POSTES_CALCUL`, PAS DU CORPS DE LA FONCTION. La
  // première version ne regardait que l'intérieur de `CalculateurCommission` :
  // les noms de postes sont déclarés AU-DESSUS, une marque glissée dans l'un
  // d'eux passait sans rien faire rougir. Trouvé par mutation, comme le
  // découpage de la vignette : borner trop court est aussi faux que ne pas
  // border du tout.
  const zoneCalc = LANDING.split('const POSTES_CALCUL')[1]?.split('function RangeeMaquettes')[0] || ''
  verifier('la zone du calculateur est bien cadrée',
    zoneCalc.length > 3000 && zoneCalc.length < 40000, `${zoneCalc.length} caractères`)
  for (const marque of ['Uber', 'Deliveroo', 'Takeaway', 'TheFork', 'Planity', 'Salonkee', 'Fidelybox']) {
    verifier(`le calculateur ne nomme pas ${marque}`, !new RegExp(marque, 'i').test(zoneCalc))
  }

  // La newsletter n'est pas ouverte : le calculateur ne la vend pas.
  verifier('aucun poste ne s’appuie sur la newsletter, qui n’est pas ouverte',
    !/capacite: 'newsletter_ciblee'/.test(LANDING))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Vitrine de la landing verte.')
