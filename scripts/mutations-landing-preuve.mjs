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
  {
    nom: '🔴 LE DEFAUT D ORIGINE : la carte a passages repromet un montant fixe en euros',
    fichier: LANDING,
    de: "t: '9 passages sur 10 · encore 1 et tu reçois -10 %', gagne: false },",
    vers: "t: '9/10 passages, le 11e te fait gagner 5 €', gagne: false },",
    garde: 'aucune carte à passages ne promet un montant en euros',
  },
  {
    nom: '🔴 la carte a passages n annonce plus aucun pourcentage',
    fichier: LANDING,
    de: "t: '9 passages sur 10 · encore 1 et tu reçois -10 %', gagne: false },",
    vers: "t: '9 passages sur 10 · encore 1 et ta carte est pleine', gagne: false },",
    garde: 'CHAQUE carte à passages annonce son pourcentage',
  },
  {
    nom: '🔴 la mecanique a cagnotte disparait de la page',
    fichier: LANDING,
    de: "t: 'Ta cagnotte : 4,00 € · encore 6,00 € et tu reçois 10,00 € offerts', gagne: false },",
    vers: "t: '4 passages sur 10 · encore 6 et tu reçois -10 %', gagne: false },",
    garde: 'la mécanique à cagnotte est montrée en cours aussi',
  },
  {
    nom: '🔴 le passage qui declenche est decale d un cran',
    fichier: LANDING,
    de: "t: '-50 % débloqués · ta nouvelle carte : 2 passages sur 10', gagne: true },",
    vers: "t: '-50 % au 11e passage · ta nouvelle carte : 2 passages sur 10', gagne: true },",
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
  {
    nom: '🔴 un nom de test dans une maquette, hors de la cle enseigne:',
    fichier: LANDING,
    de: "{ n: 'Maison Léa', i: 'M',",
    vers: "{ n: 'Maison Témoin', i: 'M',",
    garde: 'rien de ce que la page affiche ne se dit de test',
  },

  // ─── 5. L ACCORD ENTRE CE QUI EST DIT ET CE QUI EST MONTRE ───────────────
  //
  // 🔴 TROUVE PAR ALEX EN PRODUCTION, A L OEIL NU, le 22/09 : « et ca, ce ne
  // sont pas des maquettes... il y a UNE image en dessous. » Le retrait des deux
  // captures de l inscription avait laisse leur chapeau au PLURIEL au-dessus
  // d une seule figure, et le banc etait vert a 93 verifications dessus.
  {
    nom: '🔴 LE DEFAUT D ALEX : le bloc commercant reannonce plusieurs images pour une seule',
    fichier: LANDING,
    de: "            <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 'clamp(24px, 5vw, 48px)' }}>",
    vers: "            <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column', gap: 'clamp(24px, 5vw, 48px)' }}>\n              <p>Ce sont les écrans que tu verras, tels quels.</p>",
    garde: 'la série commerçant n’annonce pas plusieurs images pour une seule',
  },

  // ⚠️ ET LE SYMETRIQUE, parce qu une garde qui ne surveille qu un sens laisse
  // passer l autre : neuf captures annoncees au singulier.
  {
    nom: '🔴 le bloc Yopper annonce une seule image pour ses neuf captures',
    fichier: LANDING,
    de: 'Ce sont des captures de l&rsquo;application, prises telles quelles.',
    vers: 'C&rsquo;est l&rsquo;écran que tu verras, tel quel.',
    garde: 'la série Yopper n’annonce pas une seule image pour',
  },

  // 🔴 ET LE CADRAGE DE LA GARDE ELLE-MEME. Si les deux reperes qui bornent le
  // chapeau s ecartent, la garde ne mesure plus le chapeau mais la moitie de la
  // page, et elle le fait EN SILENCE. C est le defaut de la tranche ouverte,
  // deja rencontre dans ce depot.
  {
    nom: '🔴 le repere de fin disparait : la garde d accord ne mesure plus rien',
    fichier: LANDING,
    de: '{CAPTURES_COMMERCANT.map(c =>',
    vers: '{CAPTURES_COMMERCANT .map(c =>',
    garde: 'le chapeau de la série commerçant est cadré',
  },

  // ─── 4. LE DOUBLON LUI-MEME ──────────────────────────────────────────────
  {
    nom: '🔴 un dessin revient doubler la capture du rendez-vous',
    fichier: LANDING,
    de: 'function MockFidelite() {',
    vers: 'function MockRdv() { return null }\nfunction MockFidelite() {',
    garde: 'aucune maquette ne redouble la capture du rendez-vous',
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
