// HARNAIS DE MUTATION — LA CARTE QU'ON LIT À TABLE
//
// Chaque mutation casse une chose précise, et le banc qu'elle nomme doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:carte-table

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:carte-table'

const MUTATIONS = [
  // ─── CE QUE LA CARTE MONTRE ──────────────────────────────────────────────
  { nom: '🔴 le lunch désactivé aujourd hui reste sur la carte',
    fichier: 'lib/carte-table.js', de: '  return !reglage || reglage.actif !== false', vers: '  return true' },
  { nom: '🔴 un article sans prix sort à 0,00 €',
    fichier: 'lib/carte-table.js', de: '  const prix = saisi ? Number(brut) : NaN', vers: '  const prix = Number(brut)' },
  { nom: '⚠️ les photos coupées au catalogue reviennent à table',
    fichier: 'lib/carte-table.js', de: '    photo: photos ? (a.photo_url || null) : null,', vers: '    photo: a.photo_url || null,' },
  { nom: '🔴 l ordre voulu par le commerçant est ignoré',
    fichier: 'lib/carte-table.js', de: '    commercant?.ordre_categories,', vers: '    null,' },
  { nom: '⚠️ le parent se répète sur chaque sous-catégorie',
    fichier: 'lib/carte-table.js', de: '      parent: parent && parent !== parentPrecedent ? parent : null,', vers: '      parent,' },

  // ─── LA PAGE ─────────────────────────────────────────────────────────────
  { nom: '🔴 la page lit avec la clé de service',
    fichier: 'app/menu/[slug]/page.js', de: '    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,', vers: '    process.env.SUPABASE_SERVICE_ROLE_KEY,' },
  { nom: '🔴 une fiche non publiée a une carte',
    fichier: 'app/menu/[slug]/page.js', de: '  if (!commercant || !fichePubliee(commercant)) return null', vers: '  if (!commercant) return null' },
  { nom: '🔴 une panne se déguise en « introuvable »',
    fichier: 'app/menu/[slug]/page.js', de: '  if (error) throw new Error(', vers: '  if (false) throw new Error(' },
  { nom: '🔴 une panne sur les articles rend une carte vide',
    fichier: 'app/menu/[slug]/page.js', de: '  if (articles.error) throw new Error(', vers: '  if (false) throw new Error(' },
  { nom: '🔴 le jour se lit à Greenwich',
    fichier: 'app/menu/[slug]/page.js', de: '  const jour = nomDuJour(new Date())', vers: "  const jour = new Date().toISOString().slice(0, 10)" },
  { nom: '⚠️ les prix s affichent quelle que soit la formule',
    fichier: 'app/menu/[slug]/page.js', de: "    prixAffiches: canDo(planEffectif(commercant), 'prix_affiches'),", vers: '    prixAffiches: true,' },
  { nom: '🔴 la mention des allergènes disparaît',
    fichier: 'app/menu/[slug]/page.js', de: '{total > 0 && sertAManger(commercant.type) && (', vers: '{false && (' },
  { nom: '🔴 l ordre des catégories n est plus lu',
    fichier: 'app/menu/[slug]/page.js', de: "created_at, ordre_categories, photos_catalogue_actif'", vers: "created_at, photos_catalogue_actif'" },

  // ─── LE QR ET LE CARTON ──────────────────────────────────────────────────
  { nom: '🔴 le lien de la carte n est plus encodé',
    fichier: 'lib/lien-fiche.js', de: '  return `${BASE_YOPPAA}/menu/${encodeURIComponent(s)}`', vers: '  return `${BASE_YOPPAA}/menu/${s}`' },
  { nom: '🔴 le QR des tables mène à la fiche',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '  const url = lienCarte(slug)', vers: '  const url = lienFiche(slug)' },
  { nom: '🔴 le type n est plus lu, le bloc disparaît chez tous les restaurants',
    fichier: 'app/dashboard/ConfigDashboard.js', de: "created_at, categorie, type').eq('id', commercantId)", vers: "created_at, categorie').eq('id', commercantId)" },
  { nom: '⚠️ le bloc des tables s affiche chez un coiffeur',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '{sertAManger(typeCommerce) && (', vers: '{true && (' },
  { nom: '🔴 un carton déborde sur celui du dessous',
    fichier: 'lib/affiche-kit.js', de: '  const w = Math.min(caseW - marge * 2, (caseH - marge * 2) / ratio)', vers: '  const w = caseW - marge * 2' },
  { nom: '🔴 le carton porte l accroche de la vitrine',
    fichier: 'lib/affiche-kit.js', de: 'construireAffiche({ qrDataUrl, nomCommerce, clair, textes: TEXTES_CARTE_TABLE })', vers: 'construireAffiche({ qrDataUrl, nomCommerce, clair })' },
  { nom: '🔴 l affiche de vitrine perd son accroche', banc: 'verif:kit',
    fichier: 'lib/affiche-kit.js', de: "clair = true, textes = TEXTES_AFFICHE } = {})", vers: "clair = true, textes = TEXTES_CARTE_TABLE } = {})" },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const bancs = [...new Set([BANC, ...MUTATIONS.map(m => m.banc).filter(Boolean)])]
for (const b of bancs) {
  const depart = lancer(b)
  if (depart.rouge) {
    console.log(`🔴 ${b} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${bancs.join(', ')}.\n`)

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
  const res = lancer(m.banc || BANC)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉE VERTE`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = bancs.some(b => lancer(b).rouge)
if (finalRouge) console.log('🔴 UN BANC EST ROUGE APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
