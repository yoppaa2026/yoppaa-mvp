// HARNAIS DE MUTATION — TOUTE LECTURE DES POLICIES RAMÈNE LEUR TYPE (15/09).
//
// 🔴 CE QU'ON MESURE : que `verif:policies` rougisse quand le lecteur SQL
// cesse de retirer la prose, de juger chaque sous-requête à part, ou de voir le
// catalogue brut ; et quand une lecture sans type revient dans un contrôle, ou
// quand une archive grossit ou maigrit sans que son nombre suive.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES (`npm run verif:ancres`).
//
//   node scripts/mutations-lecture-policies.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:policies'

const LECTEUR = 'scripts/lire-sql.mjs'
const JOURNAL = 'migrations/MIGRATION_JOURNAL_ADMIN_DROITS.sql'

const MUTATIONS = [
  // ─── LE LECTEUR : CE QU'IL RETIRE ───────────────────────────────────────
  { nom: '🔴 le contenu des chaînes redevient du code',
    fichier: LECTEUR,
    de: `      morceaux.push("'" + blanc(src.slice(i + 1, j)) + "'")`,
    vers: '      morceaux.push(src.slice(i, j + 1))' },

  { nom: '🔴 les commentaires de ligne redeviennent du code',
    fichier: LECTEUR,
    de: "    if (c === '-' && d === '-') {",
    vers: '    if (false) {' },

  { nom: '🔴 les commentaires de bloc ne s imbriquent plus',
    fichier: LECTEUR,
    de: "        if (src[j] === '/' && src[j + 1] === '*') { niveau++; j += 2 }",
    vers: '        if (false) { niveau++; j += 2 }' },

  { nom: "🔴 l antislash d une chaîne E'…' n échappe plus",
    fichier: LECTEUR,
    de: "        if (avecAntislash && src[j] === '\\\\') { j += 2; continue }",
    vers: '        if (false) { j += 2; continue }' },

  // ─── LE LECTEUR : OÙ IL JUGE ────────────────────────────────────────────
  { nom: '🔴 la lecture se juge sur la requête entière, plus sur sa sous-requête',
    fichier: LECTEUR,
    de: '      const d = prof[pos]',
    vers: '      const d = 0' },

  { nom: '🔴 les branches d UNION ne se séparent plus',
    fichier: LECTEUR,
    de: '        if (o.index < pos) debutBranche = o.index + o[0].length',
    vers: '        if (false) debutBranche = o.index + o[0].length' },

  { nom: '🔴 un nom qui contient le mot vaut la colonne',
    fichier: LECTEUR,
    de: '(?<![\\\\w$])${mot}(?![\\\\w$])',
    vers: '${mot}' },

  { nom: '🔴 le catalogue brut pg_policy n est plus lu',
    fichier: LECTEUR,
    de: "  { nom: 'pg_policy', type: 'polpermissive' },",
    vers: '' },

  { nom: '🔴 SELECT * ne montre plus le type',
    fichier: LECTEUR,
    de: '        typeNomme: motEntier(cat.type).test(branche) || ETOILE.test(branche),',
    vers: '        typeNomme: motEntier(cat.type).test(branche),' },

  { nom: '🔴 count(*) passe pour un SELECT *',
    fichier: LECTEUR,
    de: 'const ETOILE = /(?:\\bSELECT\\s+(?:DISTINCT\\s+)?|,\\s*)(?:[A-Za-z_][\\w$]*\\.)?\\*/i',
    vers: 'const ETOILE = /\\*/' },

  { nom: '🔴 une chaîne jamais fermée se tait',
    fichier: LECTEUR,
    de: '        nonFerme ??= `chaîne jamais fermée, ouverte ligne ${ligneDe(src, i)}`',
    vers: '        void 0' },

  { nom: '🔴 une parenthèse jamais fermée se tait',
    fichier: LECTEUR,
    de: '  if (p !== 0) desequilibre ??= `${p} parenthèse(s) jamais fermée(s)`',
    vers: '  void p' },

  // ─── LE DÉPÔT ───────────────────────────────────────────────────────────
  { nom: '🔴 le contrôle du journal relit ses policies sans leur type',
    fichier: JOURNAL,
    de: "       (SELECT COALESCE(string_agg(policyname::text || ' = ' || permissive::text || ' ' || cmd::text, ' | ' ORDER BY policyname::text), 'AUCUNE')",
    vers: "       (SELECT COALESCE(string_agg(policyname::text || ' = ' || cmd::text || ' ' || cmd::text, ' | ' ORDER BY policyname::text), 'AUCUNE')" },

  { nom: '🔴 « au moins une policy permet de LIRE » recompte les RESTRICTIVE',
    fichier: 'migrations/CONTROLE_JOURNAL_IMPERSONATIONS.sql',
    de: "          AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL'))::text,",
    vers: "          AND cmd IN ('SELECT', 'ALL'))::text," },

  { nom: '🔴 le contrôle de base cherche de nouveau « aucune policy » sans type',
    fichier: 'migrations/CONTROLE_SECURITE_BASE.sql',
    de: 'WHERE t.rls AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = t.oid AND pol.polpermissive)',
    vers: 'WHERE t.rls AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = t.oid)' },

  { nom: '🔴 une archive gagne une lecture sans type',
    fichier: 'migrations/MIGRATION_RDV_INSERTION_PUBLIQUE.sql',
    de: "(select permissive from pg_policies where schemaname='public'",
    vers: "(select cmd from pg_policies where schemaname='public'" },

  { nom: '⚠️ une archive corrigée garde son ancien nombre',
    fichier: 'migrations/MIGRATION_PRE_INSCRIPTIONS.sql',
    de: "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'pre_inscriptions';",
    vers: "SELECT policyname, permissive, cmd FROM pg_policies WHERE tablename = 'pre_inscriptions';" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ROUGE N'EST PAS PLANTÉ : un banc qui explose ne mesure rien.
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
  const f = chemin(m.fichier)
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
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
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
