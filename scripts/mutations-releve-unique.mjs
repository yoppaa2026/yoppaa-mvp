// HARNAIS DE MUTATION — UN RELEVÉ À LA FOIS (12/11, après la panne de production)
//
// Chaque mutation casse UNE garantie ; `verif:garde` doit rougir.
// Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-releve-unique.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:garde'
const REGLE = 'lib/releve-unique.js'
const BORD = 'app/dashboard/page.js'

const MUTATIONS = [
  // ─── la règle ───────────────────────────────────────────────────────────
  { nom: '🔴 la garde ne garde plus rien (deux lectures en même temps)', fichier: REGLE,
    de: '    if (enCours) return Promise.resolve({ saute: true })', vers: '' },
  { nom: '🔴 un abandon ne libère pas la garde (écran figé pour toujours)', fichier: REGLE,
    de: '      if (enCours === jeton) enCours = null', vers: '      if (enCours === jeton && !r.abandon) enCours = null' },
  { nom: '🔴 l abandon ne coupe pas la lecture', fichier: REGLE,
    de: '      minuterie = setTimeout(() => { controle.abort(); resoudre({ ok: false, abandon: true }) }, abandonMs)', vers: '      minuterie = setTimeout(() => { resoudre({ ok: false, abandon: true }) }, abandonMs)' },
  { nom: '🔴 une lecture qui plante fait planter le relevé', fichier: REGLE,
    de: "      .then((r) => ({ ok: !(r && r.echec), abandon: false }), () => ({ ok: false, abandon: false }))", vers: "      .then((r) => ({ ok: !(r && r.echec), abandon: false }))" },
  { nom: '🔴 un échec n est pas compté', fichier: REGLE,
    de: '      .then((r) => ({ ok: !(r && r.echec), abandon: false })', vers: '      .then((r) => ({ ok: true, abandon: false })' },
  { nom: '🔴 abandon à 60 s au lieu de 20', fichier: REGLE,
    de: 'export const ABANDON_MS = 20 * 1000', vers: 'export const ABANDON_MS = 60 * 1000' },
  { nom: '🔴 une lecture rapide ne ramène plus à 5 s', fichier: REGLE,
    de: '  if (!peine) return base', vers: '  if (!peine) return Number(actuel) || base' },
  { nom: '🔴 une lecture lente n espace plus', fichier: REGLE,
    de: ' || (Number(r.duree) || 0) > lentMs', vers: '' },
  { nom: '🔴 l espacement n a plus de plafond', fichier: REGLE,
    de: '  return Math.min(max, Math.max(base, Number(actuel) || base) * 2)', vers: '  return Math.max(base, Number(actuel) || base) * 2' },
  { nom: '🔴 le tour suivant part sans attendre la réponse', fichier: REGLE,
    de: '  async function boucle() {', vers: '  async function boucle() { programmer();' },
  { nom: '🔴 arrêter le relevé ne l arrête pas', fichier: REGLE,
    de: '  return () => { arrete = true; clearTimeout(minuterie) }', vers: '  return () => {}' },
  { nom: '🔴 un écran caché relit quand même', fichier: REGLE,
    de: '  return () => (ecranRegarde() ? tour() : Promise.resolve({ saute: true }))', vers: '  return () => tour()' },
  // ─── le tableau de bord ─────────────────────────────────────────────────
  { nom: '🔴 le relevé des 5 s revient au setInterval qui empile', fichier: BORD,
    de: '    pollingRef.current = repeterEspace(tour, { base: RELEVE_RECENT_MS })', vers: '    { const t = setInterval(tour, RELEVE_RECENT_MS); pollingRef.current = () => clearInterval(t) }' },
  { nom: '🔴 un tour abandonné pose quand même ses commandes', fichier: BORD,
    de: '      const { data: recentes, error } = await lireCommandesRecentes(commercant.id, signal)\n      if (signal.aborted) return { echec: true }', vers: '      const { data: recentes, error } = await lireCommandesRecentes(commercant.id, signal)' },
  { nom: '🔴 une lecture en erreur ne fait pas espacer', fichier: BORD,
    de: '      if (error) echec = true', vers: '' },
  { nom: '🔴 la relecture complète repart à chaque focus, même en cours', fichier: BORD,
    de: "      if (document.visibilityState === 'visible') relire()", vers: "      if (document.visibilityState === 'visible') Promise.all([chargerCommandes(cid), chargerRdvs(cid)])" },
  // ─── les frères ─────────────────────────────────────────────────────────
  { nom: '🔴 le poste équipe relit écran caché', fichier: 'app/equipe/PosteEquipe.js',
    de: '    const id = setInterval(siEcranRegarde(tour), RAFRAICHIR_MS)', vers: '    const id = setInterval(tour, RAFRAICHIR_MS)' },
  { nom: '🔴 le réglage des étiquettes empile de nouveau', fichier: 'app/dashboard/ReglageEtiquettes.js',
    de: '    const tour = unSeulALaFois(() => relire())', vers: '    const tour = () => relire()' },
  { nom: '🔴 la fiche publique empile de nouveau', fichier: 'app/commander/[slug]/page.js',
    de: '    const tour = unSeulALaFois(() => Promise.all([chargerCommandesJour(), rafraichirArticlesEtStocks()]))', vers: '    const tour = () => Promise.all([chargerCommandesJour(), rafraichirArticlesEtStocks()])' },
  { nom: '🔴 un setInterval(async) réapparaît ailleurs', fichier: 'app/dashboard/BandeauFicheAPublier.js',
    de: '    const t = setInterval(siEcranRegarde(tour), RELECTURE_MS)', vers: '    const t = setInterval(async () => { await lire() }, RELECTURE_MS)' },
  { nom: '🔴 retour de Stripe : une lecture par seconde, sans attendre', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '    const timer = setInterval(() => { if (!ecranRegarde()) return; tentatives++; lecture() }, 1000)', vers: '    const timer = setInterval(() => { tentatives++; lecture() }, 1000)' },
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
