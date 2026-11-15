// HARNAIS DE MUTATION — LE SOLDE DE SMS SE PAIE (15/11)
//
// Chaque mutation casse UNE garantie ; `verif:sms-credits` doit rougir.
// Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-sms-credits.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:sms-credits'
const REGLE = 'lib/packs-sms.js'
const ROUTE = 'app/api/fidelite/sms-offerts/route.js'
const ECRAN = 'app/dashboard/ConfigDashboard.js'
const SQL = 'migrations/MIGRATION_VERROU_CREDITS_SMS_15_11.sql'

const MUTATIONS = [
  // ─── la règle du cadeau ─────────────────────────────────────────────────
  { nom: '🔴 le cadeau se redonne à chaque activation', fichier: REGLE,
    de: '  if (com.fidelite_sms_offerts_at) return \'deja\'', vers: '' },
  { nom: '🔴 le cadeau part avant l activation', fichier: REGLE,
    de: "  if (!com || com.fidelite_actif !== true) return 'inactif'", vers: "  if (!com) return 'inactif'" },
  { nom: '🔴 le cadeau ignore la formule', fichier: REGLE,
    de: "  if (!verdict || !verdict.ok) return 'refus_forfait'", vers: '' },
  { nom: '🔴 50 SMS offerts au lieu de 25', fichier: REGLE,
    de: 'export const SMS_BIENVENUE = 25', vers: 'export const SMS_BIENVENUE = 50' },
  // ─── la route ───────────────────────────────────────────────────────────
  { nom: '🔴 la route ne vérifie plus l appelant', fichier: ROUTE,
    de: '    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })', vers: '' },
  { nom: '🔴 la route oublie created_at (garde de forfait fausse en silence)', fichier: ROUTE,
    de: "fidelite_sms_offerts_at, plan, essai_plan, created_at')", vers: "fidelite_sms_offerts_at, plan, essai_plan')" },
  { nom: '🔴 la route écrit le solde à la main', fichier: ROUTE,
    de: "    const { data: solde, error } = await admin.rpc('offrir_sms_bienvenue', {", vers: "    await admin.from('commercants').update({ x: 1 }).eq('id', commercant_id); const { data: solde, error } = await admin.rpc('offrir_sms_bienvenue', {" },
  { nom: '🔴 un appel simultané compte comme un cadeau', fichier: ROUTE,
    de: '    if (solde === -1) return NextResponse.json({ ok: true, offerts: 0 })', vers: '' },
  // ─── l'écran ────────────────────────────────────────────────────────────
  { nom: '🔴 l écran repose les 25 SMS lui-même (le défaut d origine)', fichier: ECRAN,
    de: '    if (activer) patch.fidelite_actif = true', vers: '    if (activer) { patch.fidelite_actif = true; patch.fidelite_sms_credits = 25 }' },
  { nom: '🔴 l écran promet les SMS même quand rien n est donné', fichier: ECRAN,
    de: "      ? (offerts > 0 ? `Fidélité activée, ${offerts} SMS offerts 🟣` : 'Fidélité activée 🟣')", vers: "      ? 'Fidélité activée, 25 SMS offerts 🟣'" },
  { nom: '🔴 l écran ne demande plus le cadeau au serveur', fichier: ECRAN,
    de: "          const r = await fetch('/api/fidelite/sms-offerts', {", vers: "          const r = await fetch('/api/fidelite/autre', {" },
  { nom: '🔴 un autre fichier écrit le solde (pratique)', fichier: 'lib/fidelite-sms.js',
    de: 'export async function smsRecompenseDebloquee(supabase, commercant, carte, nombre = 1) {', vers: 'export async function smsRecompenseDebloquee(supabase, commercant, carte, nombre = 1) { const z = { fidelite_sms_credits: 0 };' },
  // ─── la migration ───────────────────────────────────────────────────────
  { nom: '🔴 la fonction donne à chaque appel', fichier: SQL,
    de: '     AND fidelite_sms_offerts_at IS NULL\n  RETURNING', vers: '  RETURNING' },
  { nom: '🔴 un commerçant peut appeler la fonction', fichier: SQL,
    de: 'REVOKE ALL ON FUNCTION public.offrir_sms_bienvenue(uuid, int) FROM PUBLIC, anon, authenticated;', vers: 'REVOKE ALL ON FUNCTION public.offrir_sms_bienvenue(uuid, int) FROM PUBLIC, anon;' },
  { nom: '🔴 le verrou ne ferme que le solde, pas la date du cadeau', fichier: SQL,
    de: "  IF NEW.fidelite_sms_credits IS DISTINCT FROM OLD.fidelite_sms_credits\n     OR NEW.fidelite_sms_offerts_at IS DISTINCT FROM OLD.fidelite_sms_offerts_at THEN", vers: '  IF NEW.fidelite_sms_credits IS DISTINCT FROM OLD.fidelite_sms_credits THEN' },
  { nom: '🔴 le verrou est réécrit depuis une copie du dépôt', fichier: SQL,
    de: "  SELECT pg_get_functiondef('public.commercants_colonnes_reservees()'::regprocedure) INTO def;\n  IF position('fidelite_sms_credits' IN def) = 0 THEN", vers: "  def := '';\n  IF position('fidelite_sms_credits' IN def) = 0 THEN" },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

if (lancer().rouge) { console.log(`🔴 ${BANC} est ROUGE avant toute mutation. On s'arrête.`); process.exit(2) }
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  const lu = original.replace(/\r\n/g, '\n')
  if (!lu.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, lu.replace(m.de, m.vers))
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
