// Harnais de mutation du pilotage (19/10) : `npm run mutations:pilotage`.
//
// Chaque mutation casse UNE règle du pilotage ; `verif:pilotage` doit rougir.
// Écrite, mesurée, puis restaurée par `ecrireSur`, et la restauration est
// vérifiée avant de continuer. Jamais de `git checkout`.

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:pilotage'

const CALCUL = 'lib/pilotage.js'
const SERVEUR = 'lib/pilotage-server.js'
const JOURNAL = 'lib/journal-technique.js'
const EMAIL = 'lib/pilotage-email.js'

const MUTATIONS = [
  { nom: '🔴 la démo revient dans les chiffres', fichier: CALCUL,
    de: 'export const estDemo = (c) => c?.billing_exempt === true', vers: 'export const estDemo = (c) => false' },
  { nom: 'le paiement jamais finalisé compte comme une commande', fichier: CALCUL,
    de: "['paiement_en_attente', 'annulee_paiement_ko']", vers: "['annulee_paiement_ko']" },
  { nom: 'encodée et app inversées', fichier: CALCUL,
    de: "export const commandeEncodee = (c) => c?.origine === 'commercant'", vers: "export const commandeEncodee = (c) => c?.origine === 'en_ligne'" },
  { nom: 'les RDV encodés lus sur la mauvaise source', fichier: CALCUL,
    de: "export const rdvEncode = (r) => r?.source === 'commercant'", vers: "export const rdvEncode = (r) => r?.source === 'yopper'" },
  { nom: '🔴 le jour de Greenwich au lieu de celui de Bruxelles', fichier: CALCUL,
    de: '  return jourBruxelles(d)\n}', vers: '  return d.toISOString().slice(0, 10)\n}' },
  { nom: 'la comparaison glisse d’un jour de la semaine', fichier: CALCUL,
    de: 'memeJourSemainePassee: arr(s[jourCivilPlus(hier, -7)] || 0)', vers: 'memeJourSemainePassee: arr(s[jourCivilPlus(hier, -6)] || 0)' },
  { nom: 'les sept jours comptent aujourd’hui, inachevé', fichier: CALCUL,
    de: 'const septJours = [1, 2, 3, 4, 5, 6, 7].map', vers: 'const septJours = [0, 1, 2, 3, 4, 5, 6].map' },
  { nom: '🔴 le volume oublie la récompense et les remboursements', fichier: CALCUL,
    de: '(l.__rdv ? valeurRdv(l) : valeurCommande(l))', vers: '(l.__rdv ? valeurRdv(l) : Number(l.total || 0))' },
  { nom: 'le revenu compte une fiche suspendue', fichier: CALCUL,
    de: "l.formule !== 'exister' && l.statutFiche !== 'suspendu'", vers: "l.formule !== 'exister'" },
  { nom: 'à démarcher : même ceux qui paient ou essaient Vendre', fichier: CALCUL,
    de: ".filter(l => l.formule !== 'vendre' && !l.essai && l.signaux30 > 0)", vers: '.filter(l => l.signaux30 > 0)' },
  { nom: '⚠️ un journal tout neuf accuse les tâches', fichier: CALCUL,
    de: "else if (!journalDepuis || t - new Date(journalDepuis).getTime() < tolerance) etat = 'attente'",
    vers: "else if (!journalDepuis) etat = 'attente'" },
  { nom: 'la marge d’un passage quotidien devient 4 jours', fichier: CALCUL,
    de: 'export const TOLERANCE_HEURES = { jour: 26,', vers: 'export const TOLERANCE_HEURES = { jour: 96,' },
  { nom: '🔴 une source illisible s’affiche zéro', fichier: CALCUL,
    de: "return { ...t, indisponible: indisponible(sources[t.cle]) || (t.cle === 'volume' && indisponible('rdvs')) }",
    vers: 'return { ...t, indisponible: false }' },
  { nom: '🔴 une colonne personnelle entre dans la lecture', fichier: SERVEUR,
    de: "commercants: 'id, nom, plan,", vers: "commercants: 'id, nom, email, plan," },
  { nom: '🔴 le chemin d’une erreur garde ses paramètres', fichier: JOURNAL,
    de: 'return p.split(/[?#]/)[0].slice(0, 200)', vers: 'return p.slice(0, 200)' },
  { nom: '🔴 le journal fait échouer la tâche qui écrit', fichier: JOURNAL,
    de: "console.warn('[journal-technique] écriture impossible', e?.message)\n    return false",
    vers: 'throw e' },
  { nom: '🔴 un nom de commerce non échappé dans l’email', fichier: EMAIL,
    de: '${echapperHtml(l.nom)} : ${l.signaux30}', vers: '${l.nom} : ${l.signaux30}' },
  { nom: '🔴 la route admin sans double authentification', fichier: 'app/api/admin/pilotage/route.js',
    de: "    if (!(await adminVerifie(request, user))) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })\n",
    vers: '' },
  { nom: 'le cron de 7h00 sans contrôle d’heure', fichier: 'app/api/cron/pilotage-matin/route.js',
    de: "  if (horsDeSonHeure(request, '/api/cron/pilotage-matin')) return NextResponse.json({ ok: true, ignore: 'pas_son_heure' })\n",
    vers: '' },
  { nom: 'l’heure du pilotage passe à 8 h', fichier: 'lib/heure-cron.js',
    de: "'/api/cron/pilotage-matin':        { heure: 7 },", vers: "'/api/cron/pilotage-matin':        { heure: 8 }," },
  { nom: '🔴 l’hiver oublié dans la planification', fichier: 'vercel.json',
    de: '"schedule": "0 5,6 * * *"', vers: '"schedule": "0 5 * * *"' },
  { nom: '🔴 la relance de facturation ne note plus son passage', fichier: 'app/api/cron/billing-relances/route.js',
    de: "  await noterPassageCron('/api/cron/billing-relances')\n", vers: '' },
  { nom: '🔴 les erreurs d’écran sans quota', fichier: 'app/api/erreur-ecran/route.js',
    de: 'if (quota.success) {', vers: 'if (true) {' },
  { nom: 'la démo affichée par défaut dans le tableau', fichier: 'app/admin/SectionPilotage.js',
    de: 'const [demo, setDemo] = useState(false)', vers: 'const [demo, setDemo] = useState(true)' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/en échec/.test(sortie)
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
  const n = original.split(m.de).length - 1
  if (n !== 1) {
    manquees.push(`${m.nom} — ANCRE ${n === 0 ? 'INTROUVABLE' : `PRÉSENTE ${n} FOIS`}`)
    console.log(`  ? ancre ${n === 0 ? 'introuvable' : 'non unique'} : ${m.nom}`)
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
if (manquees.length) {
  console.log('\nÀ reprendre :')
  for (const m of manquees) console.log(`  - ${m}`)
  process.exit(1)
}
