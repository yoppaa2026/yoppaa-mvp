// HARNAIS DE MUTATION — L'ADRESSE PUBLIQUE ET LE LIEN QUI RAMÈNE (05/09).
//
// 🔴 CE QU'ON MESURE : qu'un post généré par Yoppaa et publié sur Facebook
// ramène chez Yoppaa. Avant le 05/09 il ne ramenait nulle part, et rien ne
// l'aurait dit : le post était parfaitement rédigé, le commerçant content, et
// l'acquisition nulle. C'est un défaut sans erreur et sans journal, la forme
// exacte que ce projet traque.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-lien-fiche.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:lien'
const MODULE = 'lib/lien-fiche.js'
const ROUTE = 'app/api/ia/generer-post/route.js'
const ECRAN = 'app/dashboard/TabGenerateur.js'

const MUTATIONS = [
  // ─── L'ADRESSE ──────────────────────────────────────────────────────────
  { nom: '🔴 le slug n est plus encode (lien mort au premier espace)',
    de: '  return `${BASE_YOPPAA}/commander/${encodeURIComponent(s)}`',
    vers: '  return `${BASE_YOPPAA}/commander/${s}`' },

  { nom: '🔴 un slug absent fabrique une adresse qui n existe pas',
    de: "  if (!s) return null",
    vers: "  if (false) return null" },

  { nom: '🔴 le domaine cesse d etre le domaine public',
    de: "export const BASE_YOPPAA = 'https://www.yoppaa.app'",
    vers: "export const BASE_YOPPAA = 'http://localhost:3000'" },

  // ─── LA SIGNATURE ───────────────────────────────────────────────────────
  { nom: '🔴 la signature perd l adresse : elle ne ramene plus personne',
    de: '  return `Retrouve ${chez} sur Yoppaa : ${url}`',
    vers: '  return `Retrouve ${chez} sur Yoppaa`' },

  { nom: '🔴 un commerce sans nom publie « Retrouve undefined »',
    de: "  const chez = nomCommerce ? `${nomCommerce}` : 'nous'",
    vers: '  const chez = nomCommerce' },

  { nom: '🔴 une adresse absente signe quand meme, dans le vide',
    de: "  if (!url) return ''",
    vers: "  if (false) return ''" },

  // ─── LE POST COMPLET ────────────────────────────────────────────────────
  { nom: '🔴 le lien se colle DEUX FOIS quand il est deja la',
    de: '  if (corps.includes(url)) return corps',
    vers: '  if (false) return corps' },

  { nom: '🔴 le corps du post est jete au profit de la seule signature',
    de: '  return corps ? `${corps}\\n\\n${signature}` : signature',
    vers: '  return signature' },

  // ─── LA ROUTE ───────────────────────────────────────────────────────────
  { nom: '🔴 la route cesse de rendre le lien : on revient au 04/09',
    fichier: ROUTE,
    de: '      lien: estFichePourLien ? null : lienFiche(com.slug),',
    vers: '      lien: null,' },

  { nom: '🔴 une description de fiche recoit un lien vers Yoppaa dans Yoppaa',
    fichier: ROUTE,
    de: "    const estFichePourLien = surface === 'article' || surface === 'prestation'",
    vers: '    const estFichePourLien = false' },

  { nom: '🔴 le modele reprend le droit d ecrire une adresse de memoire',
    fichier: ROUTE,
    de: '7. N\'écris JAMAIS d\'adresse web, de lien, de "yoppaa.app" ni de "www".',
    vers: '7. Tu peux citer l\'adresse du commerce.' },

  { nom: '🔴 la route ne charge plus le slug',
    fichier: ROUTE,
    de: "      .select('id, nom, type, plan, categorie, adresse, auth_user_id, slug')",
    vers: "      .select('id, nom, type, plan, categorie, adresse, auth_user_id')" },

  // ─── L'ÉCRAN ────────────────────────────────────────────────────────────
  { nom: '🔴 le bouton copie le post SANS le lien',
    fichier: ECRAN,
    de: "copier(postAvecSignature([v.long, v.hashtags?.join(' ')].filter(Boolean).join('\\n\\n'), lien, nomCommerce), `long-${i}`)",
    vers: "copier([v.long, v.hashtags?.join(' ')].filter(Boolean).join('\\n\\n'), `long-${i}`)" },

  { nom: '🔴 la signature ne s affiche plus : il la decouvre publiee',
    fichier: ECRAN,
    de: '                    {signatureYoppaa(lien, nomCommerce)}',
    vers: '                    {null}' },

  { nom: '🔴 l ecran ignore le lien rendu par le serveur',
    fichier: ECRAN,
    de: '      setLien(j.lien || null)',
    vers: '      setLien(null)' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
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
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

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
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
