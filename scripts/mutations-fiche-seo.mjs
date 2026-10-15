// HARNAIS DE MUTATION — CE QUE GOOGLE LIT D'UNE FICHE (15/10).
//
// 🔴 CE QU'ON MESURE : que la fiche d'un salon reste visible pour Google, et
// qu'un commerce n'y ait qu'UNE page retenue. Le défaut d'origine ne faisait
// aucun bruit : la page s'affichait parfaitement, Google la rangeait sous le
// titre générique du site, et personne ne cherchait « Yoppaa, ton quartier
// dans ta poche » pour trouver son coiffeur.
//
// ⚠️ DEUX BANCS : `verif:fiche-seo` (la règle, exécutée) et `verif:avis`
// (les deux layouts l'appellent, le balisage lit le forfait).
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-fiche-seo.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:fiche-seo', 'verif:avis']
const MODULE = 'lib/fiche-seo.js'
const LAYOUT_RDV = 'app/commander/rdv/[slug]/layout.js'
const LAYOUT_FICHE = 'app/commander/[slug]/layout.js'
const SITEMAP = 'app/sitemap.js'

const MUTATIONS = [
  // ─── LA PAGE RETENUE ────────────────────────────────────────────────────
  { nom: '🔴 un salon est retenu par sa boutique (verif:fiche-seo « un salon : sa fiche rendez-vous »)',
    de: '  return `${BASE_YOPPAA}${ficheDuCommerce(c)}`',
    vers: '  return `${BASE_YOPPAA}/commander/${c.slug}`' },

  { nom: '🔴 chaque page se croit la page retenue (« sa boutique ne l’est pas »)',
    de: '  return !!ici && ici === adresseCanonique(c)',
    vers: '  return !!ici' },

  { nom: '🔴 chaque page se déclare elle-même à Google (« la page de table renvoie Google vers la fiche »)',
    de: '  const url = adresseCanonique(c)',
    vers: '  const url = urlDePage(c, page)' },

  // ─── LES MÉTADONNÉES ────────────────────────────────────────────────────
  { nom: '🔴 la fiche rendez-vous redevient « Commander » (« le titre d’un salon dit le geste »)',
    de: '    titre = `${action} chez ${c.nom}${ou} · Yoppaa`',
    vers: '    titre = `${c.nom}${ou} · Commander sur Yoppaa`' },

  { nom: '🔴 la description par défaut d’un salon parle de commande (« parle de rendez-vous »)',
    de: '    descParDefaut = `Découvre ${c.nom}${ou} sur Yoppaa : infos, horaires et ${action.toLowerCase()} en ligne.`',
    vers: '    descParDefaut = `Découvre ${c.nom}${ou} sur Yoppaa : infos, horaires et commande en ligne sans faire la file.`' },

  { nom: '🔴 une fiche non publiée devient indexable (« jamais indexée »)',
    de: '      robots: { index: false, follow: false },',
    vers: '      robots: { index: true, follow: true },' },

  { nom: '🔴 la description du commerçant n’est plus nettoyée (« nettoyée »)',
    de: '  const desc = (c.description && String(c.description).trim()) || descParDefaut',
    vers: '  const desc = c.description || descParDefaut' },

  // ─── LE BALISAGE ────────────────────────────────────────────────────────
  { nom: '🔴 les deux pages déclarent le commerce (« la boutique d’un salon ne déclare rien »)',
    de: '  if (!c || !estPageCanonique(c, page)) return null',
    vers: '  if (!c) return null' },

  // ─── LES LAYOUTS L'APPELLENT ────────────────────────────────────────────
  { nom: '🔴 la fiche rendez-vous se prend pour la boutique (verif:avis « la fiche rendez-vous pose ses métadonnées »)',
    fichier: LAYOUT_RDV,
    de: '  return metadataFiche(await getCommercantPublic(slug), PAGE_RDV)',
    vers: '  return metadataFiche(await getCommercantPublic(slug), PAGE_BOUTIQUE)' },

  { nom: '🔴 la fiche rendez-vous perd son balisage (verif:avis « pose le balisage »)',
    fichier: LAYOUT_RDV,
    de: '  const jsonLd = jsonLdFiche(c, PAGE_RDV, avis)',
    vers: '  const jsonLd = null' },

  { nom: '🔴 la fiche boutique perd son balisage (verif:avis « la fiche boutique pose le balisage »)',
    fichier: LAYOUT_FICHE,
    de: '  const jsonLd = jsonLdFiche(c, PAGE_BOUTIQUE, avis)',
    vers: '  const jsonLd = null' },

  // ─── LE SITEMAP, /commander, LE ROBOTS ──────────────────────────────────
  { nom: '🔴 le sitemap annonce la boutique d’un salon (« le sitemap annonce la page retenue »)',
    fichier: SITEMAP,
    de: '        url: adresseCanonique(c),',
    vers: '        url: `${BASE_URL}/commander/${c.slug}`,' },

  { nom: '🔴 le sitemap ne lit plus la catégorie (« il lit la catégorie »)',
    fichier: SITEMAP,
    de: ".select('slug, categorie, created_at')",
    vers: ".select('slug, created_at')" },

  { nom: '🔴 /commander reprend le slogan générique (« le titre validé par Alex »)',
    fichier: 'app/commander/layout.js',
    de: "const TITRE = 'Les commerces de ton quartier · Yoppaa'",
    vers: "const TITRE = 'Yoppaa, ton quartier dans ta poche'" },

  { nom: '🔴 l’annulation de rendez-vous rouvre aux robots (« les pages d’annulation sont fermées »)',
    fichier: 'app/robots.js',
    de: "        '/commander/rdv/cancel',",
    vers: '' },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
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
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 BANCS ROUGES APRÈS RESTAURATION.`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
