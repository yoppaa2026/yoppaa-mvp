// HARNAIS DE MUTATION — LA BARRE YOPPER SUR LES FICHES (19/10).
//
// Casse une à une les règles de la barre et exige que `verif:barre` ou
// `verif:logique` rougisse.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-barre-yopper.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:barre', 'verif:logique']
const REGLE = 'lib/barre-yopper.js'
const BARRE = 'app/commander/BarreYopper.js'
const ACCUEIL = 'app/commander/page.js'
const CMD = 'app/commander/[slug]/page.js'
const RDV = 'app/commander/rdv/[slug]/page.js'
const SIG = 'app/commander/SignauxYopper.js'

const MUTATIONS = [
  { nom: '🔴 la barre reste pendant le paiement d une commande', fichier: REGLE,
    de: "  if (type === 'commande') return etape === 4 || (etape === 2 && panierVide)",
    vers: "  if (type === 'commande') return etape >= 2" },
  { nom: '🔴 un panier rempli garde la barre', fichier: REGLE,
    de: "  if (type === 'commande') return etape === 4 || (etape === 2 && panierVide)",
    vers: "  if (type === 'commande') return etape === 4 || etape === 2" },
  { nom: '🔴 la barre reste pendant le tunnel du rendez-vous', fichier: REGLE,
    de: "  if (type === 'rdv') return etape === 1 && panierVide",
    vers: "  if (type === 'rdv') return etape <= 3" },
  { nom: '🔴 la confirmation ne remontre plus la barre', fichier: REGLE,
    de: '  if (confirme) return true',
    vers: '' },
  { nom: '🔴 un onglet hors de l écran principal ne mène nulle part', fichier: BARRE,
    de: '    router.push(`/commander?onglet=${encodeURIComponent(cle)}`)',
    vers: '    void cle' },
  { nom: '🔴 la fiche ne charge plus le style de la barre', fichier: BARRE,
    de: '          flex-shrink: 0;',
    vers: '' },
  { nom: '🔴 le point pulse pour un simple rendez-vous à venir', fichier: ACCUEIL,
    de: '          urgent={(commandesASwiper.length + commandesEnLivraison.length) > 0}/>',
    vers: '          urgent={badgeCommandes > 0}/>' },
  { nom: '🔴 la fiche commande oublie la barre', fichier: CMD,
    de: '        {barreYopper && <BarreYopper/>}',
    vers: '' },
  { nom: '🔴 la fiche commande la garde avec un panier', fichier: CMD,
    de: "  const barreYopper = barreSurLaFiche({ type: 'commande', etape, panierVide: nbArticlesPanier() === 0 })",
    vers: "  const barreYopper = barreSurLaFiche({ type: 'commande', etape, panierVide: true })" },
  { nom: '🔴 la fiche rendez-vous oublie la barre', fichier: RDV,
    de: '        {barreYopper && <BarreYopper/>}',
    vers: '' },
  { nom: '🔴 la confirmation du rendez-vous oublie la barre', fichier: RDV,
    de: '    confirme: (etape === 4 && !!rdvCree) || etape === 5,',
    vers: '    confirme: false,' },
  { nom: '🔴 la bulle se pose sur la barre', fichier: SIG,
    de: '      style={{ position: \'fixed\', left: \'50%\', transform: \'translateX(-50%)\', bottom: `calc(${18 + (Number(auDessus) || 0)}px + env(safe-area-inset-bottom, 0px))`,',
    vers: '      style={{ position: \'fixed\', left: \'50%\', transform: \'translateX(-50%)\', bottom: \'calc(18px + env(safe-area-inset-bottom, 0px))\',' },
  { nom: '🔴 le message de la fiche commande se pose sur la barre', fichier: CMD,
    de: "          position: 'fixed', bottom: barreYopper ? 28 + HAUTEUR_BARRE_YOPPER : 28, left: '50%', transform: 'translateX(-50%)',",
    vers: "          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)'," },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications|verif:barre — \d+ OK/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANCS.join(' + ')} DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Bancs verts au départ.\n')

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) { manquees.push(`${m.nom} — TEXTE INTROUVABLE`); console.log(`  ? introuvable : ${m.nom}`); continue }
  if (original.split(m.de).length !== 2) { manquees.push(`${m.nom} — ANCRE NON UNIQUE`); console.log(`  ? ancre non unique : ${m.nom}`); continue }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) { console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`); process.exit(2) }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }
const finalRouge = lancer().rouge
if (finalRouge) console.log('🔴 BANCS ROUGES APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
