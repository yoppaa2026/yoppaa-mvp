// HARNAIS DE MUTATION — HONORER CE QUI EXISTE (17/10).
//
// Casse une par une les règles posées après l'audit du 17/10 (ce qu'un
// commerçant doit encore pouvoir honorer quand il perd Vendre, et ce qu'il ne
// doit plus pouvoir créer), et exige que `verif:honorer` rougisse.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-honorer.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:honorer']
const MODULE = 'lib/honorer.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const PAGE = 'app/dashboard/page.js'
const AGENDA = 'app/dashboard/AgendaRdv.js'
const TRACES = 'app/dashboard/useTracesAHonorer.js'
const EXPORT = 'app/api/dashboard/export-comptable/route.js'
const RECAP = 'app/api/cron/recap-jour-8h/route.js'
const ENC_CMD = 'app/api/equipe/commande/creer/route.js'
const ENC_RDV = 'app/api/equipe/rdv/creer/route.js'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  { nom: '🔴 zéro compte comme une trace',
    de: '    if (v === true || (Number.isFinite(v) && v > 0)) ouvertes.add(feature)',
    vers: '    if (v === true || Number.isFinite(v)) ouvertes.add(feature)' },
  { nom: '🔴 une fonction déjà à lui passe « à honorer »',
    de: '    if (aLui(feature)) continue',
    vers: '' },
  { nom: '🔴 l export s ouvre sans forfait ni ligne',
    de: '  return forfaitLePermet === true || (Number.isFinite(nbLignes) && nbLignes > 0)',
    vers: '  return true' },
  { nom: '🔴 l export redevient réservé au forfait',
    de: '  return forfaitLePermet === true || (Number.isFinite(nbLignes) && nbLignes > 0)',
    vers: '  return forfaitLePermet === true' },
  { nom: '🔴 le récap se tait sur les commandes déjà prises',
    de: '  return forfaitOuvert === true || nbCommandes > 0 || nbTables > 0',
    vers: '  return forfaitOuvert === true' },
  { nom: '🔴 le récap écrit « Aucune commande » à tout le monde',
    de: '  return forfaitOuvert === true || nbCommandes > 0 || nbTables > 0',
    vers: '  return true' },
  // ─── LES ONGLETS ────────────────────────────────────────────────────────
  { nom: '🔴 changerOnglet refuse un onglet à honorer', fichier: BORD,
    de: '    if (cible && cible.etat !== FONCTION_INCLUSE && cible.etat !== FONCTION_EN_ESSAI && !cible.honore) {',
    vers: '    if (cible && cible.etat !== FONCTION_INCLUSE && cible.etat !== FONCTION_EN_ESSAI) {' },
  { nom: '🔴 la page hors formule recouvre un onglet à honorer', fichier: BORD,
    de: '        if (cible.etat === FONCTION_INCLUSE || cible.etat === FONCTION_EN_ESSAI || cible.honore) return null',
    vers: '        if (cible.etat === FONCTION_INCLUSE || cible.etat === FONCTION_EN_ESSAI) return null' },
  { nom: '🔴 les bons vendus redeviennent inatteignables', fichier: BORD,
    de: "      {tab === 'bons' && (peut(commercant, 'bons_cadeaux') || aHonorer.has('bons_cadeaux')) &&",
    vers: "      {tab === 'bons' && peut(commercant, 'bons_cadeaux') &&" },
  { nom: '🔴 le compte Stripe redevient inatteignable', fichier: BORD,
    de: "      {tab === 'paiements' && (peutPaiements || aHonorer.has('paiement_ligne')) && <TabPaiements",
    vers: "      {tab === 'paiements' && peutPaiements && <TabPaiements" },
  { nom: '🔴 l export des mois passés redevient inatteignable', fichier: BORD,
    de: "      {tab === 'comptabilite' && (peut(commercant, 'export_comptable') || aHonorer.has('export_comptable')) && <TabComptabilite",
    vers: "      {tab === 'comptabilite' && peut(commercant, 'export_comptable') && <TabComptabilite" },
  { nom: '🔴 les cartes de fidélité redeviennent inatteignables', fichier: BORD,
    de: "      {tab === 'fidelite' && (peut(commercant, 'fidelite') || aHonorer.has('fidelite')) &&",
    vers: "      {tab === 'fidelite' && peut(commercant, 'fidelite') &&" },
  { nom: '🔴 les cartes de séances redeviennent inatteignables', fichier: BORD,
    de: "  const modeHonorerAbonnements = !peut(commercant, 'rdv') && honorerAbonnements",
    vers: '  const modeHonorerAbonnements = false' },
  { nom: '🔴 les bons rouverts se revendent', fichier: BORD,
    de: "      {tab === 'bons' && (peut(commercant, 'bons_cadeaux') || aHonorer.has('bons_cadeaux')) && <TabBonsCadeaux commercantId={commercantId} commercant={commercant} toast={showToast} onSaved={rechargerCommercant} surModifications={declarerModifications} modeHonorer={!peut(commercant, 'bons_cadeaux')} />}",
    vers: "      {tab === 'bons' && (peut(commercant, 'bons_cadeaux') || aHonorer.has('bons_cadeaux')) && <TabBonsCadeaux commercantId={commercantId} commercant={commercant} toast={showToast} onSaved={rechargerCommercant} surModifications={declarerModifications} modeHonorer={false} />}" },
  { nom: '🔴 la fidélité rouverte ouvre de nouvelles cartes', fichier: BORD,
    de: '              {modeHonorer',
    vers: '              {false' },
  { nom: '🔴 les cartes de séances rouvertes inscrivent encore', fichier: BORD,
    de: '            {!modeHonorer && (',
    vers: '            {true && (' },
  { nom: '🔴 un onglet à honorer reste gris et cadenassé', fichier: BORD,
    de: '          const ferme = t.etat === FONCTION_FERMEE && !t.honore',
    vers: '          const ferme = t.etat === FONCTION_FERMEE' },
  { nom: '🔴 on compte aussi les fonctions qu il a', fichier: BORD,
    de: "    .filter(f => f !== 'commande' && etatDe(f) !== null && !aLuiFonction(f))",
    vers: "    .filter(f => f !== 'commande' && etatDe(f) !== null)" },
  // ─── LES TRACES ─────────────────────────────────────────────────────────
  { nom: '🔴 un bon épuisé rouvre l onglet', fichier: TRACES,
    de: ".eq('commercant_id', id).eq('statut', 'actif').gt('solde', 0)),",
    vers: ".eq('commercant_id', id)," },
  { nom: '🔴 une commande terminée compte comme en cours', fichier: TRACES,
    de: ".eq('commercant_id', id).not('statut', 'in', FILTRE_STATUTS_TERMINES)),",
    vers: ".eq('commercant_id', id))," },
  // ─── LE TABLEAU DE BORD ─────────────────────────────────────────────────
  { nom: '🔴 le salon perd ses commandes à honorer', fichier: PAGE,
    de: "    || canDo(forfaitEnVigueur, 'commande') || aHonorerBord.has('commande')",
    vers: "    || canDo(forfaitEnVigueur, 'commande')" },
  { nom: '🔴 le raccourci des bons disparaît', fichier: PAGE,
    de: "    ((canDo(planEffectif(commercant), 'bons_cadeaux') && commercant.bons_cadeaux_actif) || aHonorerBord.has('bons_cadeaux')) && {",
    vers: "    canDo(planEffectif(commercant), 'bons_cadeaux') && commercant.bons_cadeaux_actif && {" },
  { nom: '🔴 le patron encode hors formule', fichier: PAGE,
    de: "{commercant?.categorie === 'alimentaire' && canDo(planEffectif(commercant), 'commande') && (creneauxRetrait.length > 0",
    vers: "{commercant?.categorie === 'alimentaire' && (creneauxRetrait.length > 0" },
  { nom: '🔴 le patron pose des rendez-vous hors formule', fichier: PAGE,
    de: 'onNouveauRdv={peutReserver(commercant) ? (date, heure, prestationId = null) => setNouveauRdvSlot({ date, heure, prestationId }) : null}',
    vers: 'onNouveauRdv={(date, heure, prestationId = null) => setNouveauRdvSlot({ date, heure, prestationId })}' },
  { nom: '🔴 une case libre reste cliquable sans geste', fichier: AGENDA,
    de: "const peutCreer = !!onNouveauRdv && state === 'libre'",
    vers: "const peutCreer = state === 'libre'" },
  // ─── LE SERVEUR ─────────────────────────────────────────────────────────
  { nom: '🔴 l export ne demande plus rien', fichier: EXPORT,
    de: '    if (!exportComptableAutorise({ forfaitLePermet, nbLignes: lignes.length })) {',
    vers: '    if (false) {' },
  { nom: '🔴 le récap se coupe encore hors formule', fichier: RECAP,
    de: '      if (!estVitrine && !commerceACommandes) {',
    vers: '      if (!estVitrine && !estAlim) {' },
  { nom: '🔴 le récap envoie sans rien à honorer', fichier: RECAP,
    de: '          if (!recapDuJourAEnvoyer({ forfaitOuvert: estAlim, nbCommandes: cmdsFlat.length, nbTables: (tablesFlat || []).length })) {',
    vers: '          if (false) {' },
  { nom: '🔴 la section tables s écrit vide hors formule', fichier: RECAP,
    de: '            tablesFlat = prises.length > 0 ? prises : null',
    vers: '            tablesFlat = prises' },
  { nom: '🔴 la route d encodage oublie la formule', fichier: ENC_CMD,
    de: "    const forfait = verdictForfait(commercant, 'commande')",
    vers: "    const forfait = { ok: true }" },
  { nom: '🔴 la route de rendez-vous oublie la formule', fichier: ENC_RDV,
    de: '    const forfait = verdictForfait(commerce.data, fonctionReservation(commerce.data))',
    vers: '    const forfait = { ok: true }' },
  { nom: '🔴 la route de rendez-vous ne charge plus l essai', fichier: ENC_RDV,
    de: "select('id, horaires_detail, rdv_acompte_global, categorie, plan, essai_plan, created_at')",
    vers: "select('id, horaires_detail, rdv_acompte_global, categorie, plan')" },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ».
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
if (finalRouge) console.log('🔴 BANCS ROUGES APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
