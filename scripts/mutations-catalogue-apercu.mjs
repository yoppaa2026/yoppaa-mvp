// HARNAIS DE MUTATION — LIRE UN ARTICLE SANS L OUVRIR, ET RESTER OU L ON ETAIT
//
// 🔴 CE QU ON MESURE (Alex, 25/09, capture a l appui). « Quand un article
// contient un groupe, une variante, cela doit se voir depuis sa vignette » et
// « quand on fait un refresh d une page dans le tableau de bord, il faut
// rester sur cette meme page ».
//
// ⚠️ LE PIRE CAS N EST PAS UNE LIGNE MANQUANTE : c est une ligne qui ANNONCE
// un contenu que l article n a pas, ou un nombre de combinaisons calcule qui
// ne correspond pas a ce que le commercant verra en ouvrant.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-catalogue-apercu.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:apercu'

const APERCU = 'lib/catalogue-apercu.js'
const URL_ONGLET = 'lib/onglet-url.js'
const ECRAN = 'app/dashboard/ConfigDashboard.js'

const MUTATIONS = [
  // ─── CE QU UNE VIGNETTE DONNE A LIRE ─────────────────────────────────────
  //
  // ⚠️ « 2 groupes » NE DIT PAS si le client aura deux choix ou vingt.
  { nom: '⚠️ la vignette ne compte plus les options, seulement les groupes',
    fichier: APERCU,
    de: '  const partOptions = options === 1 ? \'1 option\' : `${options} options`',
    vers: "  const partOptions = 'options'" },

  { nom: '⚠️ un groupe vide s annonce comme un groupe rempli',
    fichier: APERCU,
    de: '  if (options === 0) return `${partNoms} · aucune option`',
    vers: '  if (false) return partNoms' },

  // 🔴 LE DEFAUT DU 25/09, RELEVE PAR ALEX SUR CAPTURE : « il faut que le nom
  // du groupe soit affiche, pas le nombre de groupes, il faut toujours cliquer
  // pour savoir lequel ». Une vignette qui dit « 1 groupe » oblige a ouvrir
  // l article — exactement ce qu elle devait eviter.
  { nom: '🔴 la vignette redit le nombre de groupes au lieu de leur nom',
    fichier: APERCU,
    de: '  const partNoms = reste > 0 ? `${montres} +${reste}` : montres',
    vers: '  const partNoms = noms.length === 1 ? `1 groupe` : `${noms.length} groupes`' },

  // ⚠️ AU-DELA DE DEUX NOMS, ca deborde de la vignette sur un telephone.
  { nom: '⚠️ tous les noms sont ecrits, la vignette deborde',
    fichier: APERCU,
    de: '  const montres = noms.slice(0, NOMS_MONTRES).join(\', \')',
    vers: "  const montres = noms.join(', ')" },

  // ⚠️ UN GROUPE SANS NOM NE LAISSE PAS UN BLANC en tete de phrase.
  { nom: '⚠️ un groupe sans nom laisse un blanc',
    fichier: APERCU,
    de: "  const noms = liste.map(g => String(g?.nom || '').trim() || 'Sans nom')",
    vers: "  const noms = liste.map(g => String(g?.nom || '').trim())" },

  // 🔴 UN ARTICLE SANS GROUPE NE DOIT RIEN ANNONCER : une vignette qui promet
  // un contenu inexistant est pire qu une vignette muette.
  { nom: '🔴 un article sans groupe annonce quand meme quelque chose',
    fichier: APERCU,
    de: '  if (liste.length === 0) return null',
    vers: '  if (false) return null' },

  // 🔴 ON NE PROMET PAS UN NOMBRE DE COMBINAISONS : il se deduirait des axes
  // mais le commercant a pu en supprimer, et un chiffre calcule qui ne
  // correspond pas a ce qu il voit en ouvrant est pire que rien.
  { nom: '🔴 la vignette promet un nombre de combinaisons calcule',
    fichier: APERCU,
    de: "  return axes.join(' · ')",
    vers: "  return `${axes.join(' · ')} · 6 combinaisons`" },

  { nom: '⚠️ une matrice commencee et vide ne se voit plus',
    fichier: APERCU,
    de: "  if (axes.length === 0) return 'Variantes à compléter'",
    vers: '  if (axes.length === 0) return null' },

  { nom: '🔴 un article sans variantes affiche quand meme des axes',
    fichier: APERCU,
    de: '  if (!article || article.gere_variantes !== true) return null',
    vers: '  if (!article) return null' },

  // 🔴 « RIEN » EST UNE INFORMATION sur l ecran de personnalisation : c est
  // meme celle qu on vient y chercher.
  { nom: '🔴 l absence d options n est plus marquee comme telle',
    fichier: APERCU,
    de: "  return o ? { texte: o, vide: false } : { texte: 'Pas d’options', vide: true }",
    vers: "  return { texte: o || 'Pas d’options', vide: false }" },

  // ─── RESTER OU L ON ETAIT ────────────────────────────────────────────────
  //
  // 🔴 UN `?sous=` QUI NE VEUT PLUS RIEN DIRE LA OU ON ARRIVE : l onglet
  // Rendez-vous chercherait a ouvrir « personnalisation », qui n existe pas
  // chez lui, et n afficherait rien du tout.
  // ⚠️ ELLE VISE `sousOngletValide`, PAS `lireSousOnglet`. Premiere version :
  // la cible etait dans `lireSousOnglet`, qui rend le defaut avant meme de
  // lire quand il n y a pas de navigateur — sous Node, la regle n etait donc
  // jamais exercee et la mutation restait verte. La regle a ete sortie pour
  // etre mesurable.
  { nom: '🔴 un sous-onglet inconnu de l ecran est accepte',
    fichier: URL_ONGLET,
    de: '  return valides.includes(valeur) ? valeur : defaut',
    vers: '  return valeur' },

  // 🔴 PARCOURIR TROIS SOUS-ONGLETS N EST PAS UNE NAVIGATION : les empiler
  // obligerait a appuyer trois fois sur « Precedent » pour sortir d un ecran
  // qu on n a jamais quitte.
  { nom: '🔴 chaque sous-onglet empile une entree d historique',
    fichier: URL_ONGLET,
    de: "  window.history.replaceState(null, '', url.toString())",
    vers: "  window.history.pushState(null, '', url.toString())" },

  // 🔴 SANS CE GARDE-FOU, le premier rendu ecrase le sous-onglet demande par
  // l adresse, et recharger ne sert toujours a rien.
  { nom: '🔴 le premier rendu ecrase l adresse avant de l avoir lue',
    fichier: URL_ONGLET,
    de: '    if (!pret.current) return',
    vers: '    if (false) return' },

  { nom: '⚠️ le bouton Precedent n est plus ecoute',
    fichier: URL_ONGLET,
    de: "    window.addEventListener('popstate', auRetour)",
    vers: "    void auRetour; window.addEventListener('yoppaa-jamais', auRetour)" },

  { nom: '⚠️ une ecriture identique reveille l historique pour rien',
    fichier: URL_ONGLET,
    de: '  if (url.toString() === window.location.href) return',
    vers: '  if (false) return' },

  // ─── L ECRAN ─────────────────────────────────────────────────────────────
  //
  // 🔴 SUR LA LISTE DE TOUS LES JOURS, une pastille « pas d options » sur
  // chaque article serait du bruit : ce n est pas la question qu on y pose.
  { nom: '🔴 la carte d article affiche une pastille vide',
    fichier: ECRAN,
    de: '              if (ap.vide) return null',
    vers: '              if (false) return null' },

  // 🔴 DEUX NIVEAUX, DEUX CLES : une seule, et l ecran imbrique ecraserait
  // celui qui le contient a chaque rendu.
  { nom: '🔴 les deux niveaux de sous-onglets partagent la meme cle',
    fichier: ECRAN,
    de: "    ['articles', 'categories', 'personnalisation'], 'articles', CLE_SOUS_ONGLET_2,",
    vers: "    ['articles', 'categories', 'personnalisation'], 'articles'," },

  { nom: '🔴 un ecran retombe sur un etat qui ne survit pas au rechargement',
    fichier: ECRAN,
    de: "  const [sousOnglet, setSousOnglet] = useSousOnglet(['produits', 'abonnements'], 'produits')",
    vers: "  const [sousOnglet, setSousOnglet] = useState('produits')" },
]

const lancer = (banc = BANC) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const BANCS = [...new Set(MUTATIONS.map((m) => m.banc || BANC))]
for (const banc of BANCS) {
  const depart = lancer(banc)
  if (depart.rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}.\n`)

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = BANCS.some((banc) => lancer(banc).rouge)
if (finalRouge) console.log(`🔴 UN BANC EST ROUGE APRÈS RESTAURATION (${BANCS.join(', ')}).`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
