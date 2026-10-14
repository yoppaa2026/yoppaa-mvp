// HARNAIS DE MUTATION — CE QUE LA PAGE D'ACCUEIL PROUVE (22/09)
//
// 🔴 POURQUOI CE HARNAIS EXISTE. Alex, le 22/09, sur les neuf captures :
// « certaines font doublons avec celles de la section d'avant. Ton avis apres
// analyse ? » L'analyse a trouve trois defauts, et AUCUN n'etait attrapable par
// le banc de la vitrine, pourtant vert a 79 verifications :
//
//   1. 🔴 `MockFidelite` vendait une mecanique SUPPRIMEE le 16/09. Elle
//      annoncait « 9/10 passages, le 11e te fait gagner 5 € », alors que
//      `lib/fidelite.js` ecrit « Le montant fixe en euros n'existe plus.
//      C'etait lui, le defaut. » Le banc comptait les cartes et cherchait la
//      phrase du GSM : il ne regardait jamais CE QUE LA CARTE PROMET.
//   2. 🔴 `MockRdv` doublait la capture `yopper_creneaux` : le meme ecran,
//      dessine a cote de sa propre preuve. Et le dessin etait DATE (« AUJ » sur
//      le dimanche 13, « Creneaux lundi 14 sep ») : neuf jours plus tard, la
//      page d'accueil proposait des creneaux passes.
//   3. 🔴 La garde des enseignes de demonstration etait VERTE EN NE REGARDANT
//      PRESQUE RIEN : elle cherchait `enseigne: '...'`, soit DEUX noms sur la
//      vingtaine que les maquettes affichent, et ne lisait pas du tout les
//      textes des captures. Dix pour cent de couverture, vert franc.
//
// ⚠️ CE HARNAIS VA PLUS LOIN QUE ROUGE / VERT. Une mutation peut faire rougir
// un banc par ACCIDENT, via une autre garde que celle qu'on croit mesurer : il
// verifie donc que la garde ATTENDUE, nommee mutation par mutation, figure
// dans les echecs. C'est la difference entre « le banc a reagi » et « cette
// garde-la protege ».
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-landing-preuve.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:vitrine'

const LANDING = 'app/components/LandingReveal.js'
const CAPTURES = 'lib/captures-landing.js'
const RAPPELS = 'lib/rappels.js'
const FIDELITE = 'lib/fidelite.js'

const MUTATIONS = [
  // ─── 1. CE QUE LA CARTE DE FIDELITE PROMET ───────────────────────────────
  // ⚠️ REPOINTEES LE 14/10 : `MockFidelite` est partie avec la landing v2. Le
  // defaut d origine (un montant en euros promis sur des passages) peut revenir
  // dans N IMPORTE QUELLE phrase de la page : la garde lit maintenant tout le
  // texte, et la mutation l y glisse par la grille des formules. Les gardes
  // « chaque carte annonce son pourcentage » et « la cagnotte est montree en
  // cours » mesuraient des cartes dessinees qui n existent plus : leurs
  // mutations sont retirees avec elles.
  {
    nom: '🔴 LE DEFAUT D ORIGINE : la page repromet un montant fixe en euros sur des passages',
    fichier: LANDING,
    de: "'Fidélité automatique : chaque commande et chaque rendez-vous remplit la carte, sans rien faire',",
    vers: "'Fidélité automatique : au dixième passage, 5 € offerts à ton client',",
    garde: 'aucune phrase sur des passages ne promet un montant en euros',
  },
  {
    nom: '🔴 le passage qui declenche est decale d un cran',
    fichier: LANDING,
    de: "'Carte de fidélité digitale : le numéro de GSM de ton client suffit, plus aucune carte perdue',",
    vers: "'Carte de fidélité digitale : la récompense tombe au 11e passage',",
    garde: 'aucune carte ne décale le passage qui déclenche',
  },

  // 🔴 LA GARDE QUI LIT LE CODE, PAS L ECRAN. Si l unite d une mecanique change
  // dans `lib/fidelite.js`, la maquette devient fausse SANS BOUGER D UN
  // CARACTERE. Aucune garde qui ne lit que la landing ne peut attraper ca.
  {
    nom: '🔴 le code rend un montant fixe sur les passages : la page devient fausse sans bouger',
    fichier: FIDELITE,
    de: "  return { type: 'remise_pct', valeur: pourcentPassages(config) }",
    vers: "  return { type: 'remise_montant', valeur: pourcentPassages(config) }",
    garde: 'le code rend un POURCENTAGE sur la mécanique à passages',
  },

  // ─── 2. LA PREUVE DU RENDEZ-VOUS ─────────────────────────────────────────
  {
    nom: '🔴 la capture du rendez-vous disparait de la serie',
    fichier: CAPTURES,
    de: "    cle: 'yopper_creneaux',",
    vers: "    cle: 'yopper_agenda',",
    garde: 'la prise de rendez-vous est montrée par une capture',
  },
  // ⚠️ DEUX REMPLACEMENTS, PARCE QUE LE MOT VIT À DEUX ENDROITS. Mesurée au
  // harnais, la version à un seul remplacement restait VERTE : le mot retiré de
  // l'alt vivait encore dans la légende, et la garde lit les deux. Une
  // mutation qui n'enlève pas vraiment la chose ne mesure pas la garde.
  {
    nom: '🔴 la capture ne nomme plus la prestation, ni dans l alt ni dans la legende',
    fichier: CAPTURES,
    paires: [
      ['salon : la prestation choisie', 'salon : le choix du soin'],
      ['Tu choisis ta prestation', 'Tu choisis ton soin'],
    ],
    garde: 'la capture du rendez-vous nomme « prestation »',
  },

  // 🔴 LE RAPPEL, QUE LA MAQUETTE RETIREE ETAIT SEULE A ANNONCER. Sans cette
  // garde, on pouvait le perdre en retirant le dessin sans que rien ne le dise.
  {
    nom: '🔴 le rappel n est plus annonce nulle part sur la page',
    fichier: CAPTURES,
    de: ' Le rappel arrive une heure avant.',
    vers: '',
    garde: 'la capture annonce toujours le rappel',
  },

  // 🔴 ET LE DELAI LUI-MEME. La page ecrit « une heure avant » ; c est
  // `lib/rappels.js` qui decide vraiment. Le jour ou ce reglage bouge, la page
  // d'accueil promet autre chose que ce que le produit envoie.
  {
    nom: '🔴 le produit passe le rappel a deux heures : la page promet encore une heure',
    fichier: RAPPELS,
    de: 'const RAPPEL_RDV_MIN = 60',
    vers: 'const RAPPEL_RDV_MIN = 120',
    garde: 'et la landing annonce ce délai-là',
  },

  // ─── 3. LES ENSEIGNES DE DEMONSTRATION ───────────────────────────────────
  //
  // 🔴 CES DEUX-LA PASSAIENT SOUS L ANCIENNE GARDE, et c est tout l objet de
  // son elargissement : elle ne lisait qu une cle `enseigne:` de la landing.
  {
    nom: '🔴 une enseigne de demonstration dans la LEGENDE d une capture',
    fichier: CAPTURES,
    de: 'La carte de ton snack, ses vraies heures',
    vers: 'La carte de La Boutique Témoin, ses vraies heures',
    garde: 'la page n’affiche pas l’enseigne « La Boutique Témoin »',
  },
  // ⚠️ REPOINTEE LE 14/10 : plus de maquette, le nom glisse dans la liste
  // des metiers, qui est du texte affiche comme un autre.
  {
    nom: '🔴 un nom de test dans le texte affiche, hors de toute cle enseigne:',
    fichier: LANDING,
    de: "'Friteries', 'Boulangeries',",
    vers: "'Friteries de démo', 'Boulangeries',",
    garde: 'rien de ce que la page affiche ne se dit de test',
  },

  // ─── 6. LA CAPTURE QUI A PRIS LA PLACE D UNE MAQUETTE (22/09) ────────────
  //
  // Alex : « remplace ce visuel par la capture jointe ». La serie commercant
  // vit desormais a DEUX endroits, separes par un `find` sur une cle. Les trois
  // mutations qui suivent mesurent la panne MUETTE de ce montage : un `find`
  // qui ne trouve rien ne casse rien, il EFFACE.
  {
    nom: '🔴 la cle du tableau de bord est mal orthographiee : le visuel disparait en silence',
    fichier: LANDING,
    de: "const CLE_DASHBOARD = 'dashboard_commandes'",
    vers: "const CLE_DASHBOARD = 'dashboard_commande'",
    garde: 'et cette clé existe vraiment dans la liste',
  },
  // ⚠️ REPOINTEES LE 14/10 : les deux series sont devenues UN carrousel, qui
  // commence par le tableau de bord. Memes pannes muettes, nouvelles ancres.
  {
    nom: '🔴 la capture du tableau de bord sort du carrousel',
    fichier: LANDING,
    de: 'const CAPTURES_CARROUSEL = [CAPTURE_DASHBOARD, ...CLES_CARROUSEL',
    vers: 'const CAPTURES_CARROUSEL = [...CLES_CARROUSEL',
    garde: 'la capture du tableau de bord ouvre le carrousel',
  },
  {
    nom: '🔴 le carrousel de preuve n est plus rendu',
    fichier: LANDING,
    de: '{CAPTURES_CARROUSEL.map(c =>',
    vers: '{[].map(c =>',
    garde: 'le carrousel de preuve est affiché',
  },
  {
    nom: '🔴 une cle du carrousel est mal orthographiee : la capture disparait en silence',
    fichier: LANDING,
    de: "'yopper_invendus', 'yopper_fidelite']",
    vers: "'yopper_invendu', 'yopper_fidelite']",
    garde: '🔴 chaque clé du carrousel existe vraiment',
  },

  // ─── 5. L ACCORD ENTRE CE QUI EST DIT ET CE QUI EST MONTRE ───────────────
  //
  // 🔴 TROUVE PAR ALEX EN PRODUCTION, A L OEIL NU, le 22/09 : « et ca, ce ne
  // sont pas des maquettes... il y a UNE image en dessous. » Le retrait des deux
  // captures de l inscription avait laisse leur chapeau au PLURIEL au-dessus
  // d une seule figure, et le banc etait vert a 93 verifications dessus.
  // ⚠️ REPOINTEE LE 14/10 : une seule serie, le carrousel, et elle compte six
  // images. Le sens « plusieurs annoncees pour une seule » n a plus de bloc a
  // une image ou se produire : sa mutation part avec le bloc commercant.
  {
    nom: '🔴 le carrousel annonce une seule image pour ses six captures',
    fichier: LANDING,
    de: 'Ce sont des captures de l&rsquo;application, prises telles quelles.',
    vers: 'C&rsquo;est l&rsquo;écran que tu verras, tel quel.',
    garde: 'la série du carrousel n’annonce pas une seule image pour',
  },

  // 🔴 ET LE CADRAGE DE LA GARDE ELLE-MEME. Si les deux reperes qui bornent le
  // chapeau s ecartent, la garde ne mesure plus le chapeau mais la moitie de la
  // page, et elle le fait EN SILENCE. C est le defaut de la tranche ouverte,
  // deja rencontre dans ce depot.
  {
    nom: '🔴 le repere de fin disparait : la garde d accord ne mesure plus rien',
    fichier: LANDING,
    // ⚠️ ANCRE RECALEE LE 22/09 : la liste rendue ici s appelle CAPTURES_PREUVE
    // depuis que la capture du tableau de bord part ailleurs. L ancienne ancre
    // pointait dans le vide, et le harnais l a dit (« TEXTE INTROUVABLE »).
    // ⚠️ REPOINTEE LE 14/10 sur le carrousel.
    de: '{CAPTURES_CARROUSEL.map(c =>',
    vers: '{CAPTURES_CARROUSEL .map(c =>',
    garde: 'le chapeau de la série du carrousel est cadré',
  },

  // ─── 4. LE DOUBLON LUI-MEME ──────────────────────────────────────────────
  {
    nom: '🔴 un dessin revient doubler la capture du rendez-vous',
    fichier: LANDING,
    // ⚠️ ANCRE RECALEE LE 14/10 : `MockFidelite` est partie.
    de: 'function CompteurJours({ cible }) {',
    vers: 'function MockRdv() { return null }\nfunction CompteurJours({ cible }) {',
    garde: 'aucune maquette ne redouble la capture du rendez-vous',
  },

  // ─── 7. LA LANDING V2 (14/10) ────────────────────────────────────────────
  // 🔴 L ERREUR N° 1 DU BRIEF, LA PLUS GRAVE : « chaque matin, meme en
  // Exister ». En Exister, c est une fois par semaine.
  {
    nom: '🔴 la grille repromet le Good Morning chaque matin en Exister',
    fichier: LANDING,
    de: "'Une place chaque semaine dans le Good Morning Yoppers',",
    vers: "'Une place chaque matin dans le Good Morning Yoppers, même en Exister',",
    garde: '🔴 la page ne promet jamais « chaque matin » à Exister',
  },
  // 🔴 L ERREUR N° 7 : le calculateur prerempli a 14 %.
  {
    nom: '🔴 le pourcentage revient prerempli',
    fichier: LANDING,
    de: "  const [taux, setTaux] = useState('')",
    vers: "  const [taux, setTaux] = useState('14')",
    garde: '🔴 les champs du calcul partent vides',
  },
  // ✅ ALEX, 14/10 : le montant par commande s AJOUTE au pourcentage.
  {
    nom: '🔴 le montant par commande ne s ajoute plus au pourcentage',
    fichier: LANDING,
    de: '    paye = v * p / 100 + n * f',
    vers: '    paye = v * p / 100',
    garde: '🔴 le pourcentage ET le montant par commande s’additionnent',
  },
  // ✅ ALEX, 14/10 : piquer SANS NOMMER.
  {
    nom: '🔴 une pique nomme une plateforme',
    fichier: LANDING,
    de: "t: 'Le commerce local n’a pas besoin d’un péage.' },",
    vers: "t: 'Le commerce local n’a pas besoin de Fritzy.' },",
    garde: 'la page ne nomme pas Fritzy',
  },
]

// Lance le banc et rend { rouge, plante, echecs }.
// ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
// rougir n'est pas une mesure, c'est un accident.
const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, echecs: [], extrait: sortie.slice(-200) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications passées/.test(sortie)
    const echecs = [...sortie.matchAll(/✕ ([^\n]+)/g)].map(m => m[1].split(' → ')[0].trim())
    return { rouge: true, plante, echecs, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ UNE MUTATION PEUT DEMANDER PLUSIEURS REMPLACEMENTS. Quand la chose à
  // retirer vit à deux endroits, n'en retirer qu'un laisse la garde verte et
  // fait croire qu'elle ne protège pas, alors qu'elle protégeait très bien.
  const paires = m.paires || [[m.de, m.vers]]
  const absente = paires.find(([de]) => !original.includes(de))
  if (absente) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE : ${absente[0].slice(0, 40)}`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, paires.reduce((t, [de, vers]) => t.replace(de, vers), original))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.plante) {
    manquees.push(`${m.nom} — le banc a PLANTÉ`)
    console.log(`  ⚠ plantage : ${m.nom}`)
  } else if (!res.rouge) {
    manquees.push(`${m.nom} — RESTÉ VERT`)
    console.log(`  ✕ MANQUÉE : ${m.nom}`)
  } else if (!res.echecs.some(e => e.startsWith(m.garde))) {
    // 🔴 ROUGE, MAIS PAS POUR LA BONNE RAISON. Sans ce contrôle, une mutation
    // qui casse une garde VOISINE passerait pour une mesure de celle qu'on
    // visait, et la vraie garde resterait non mesurée en paraissant tenue.
    manquees.push(`${m.nom} — rouge sur une AUTRE garde : ${res.echecs.join(' / ') || '(aucune nommée)'}`)
    console.log(`  ⚠ mauvaise garde : ${m.nom}`)
  } else {
    attrapees++
    console.log(`  ✓ attrapée : ${m.nom}`)
  }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées par la garde visée.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
