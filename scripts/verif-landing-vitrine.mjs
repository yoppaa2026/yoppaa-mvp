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

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Vitrine de la landing verte.')
