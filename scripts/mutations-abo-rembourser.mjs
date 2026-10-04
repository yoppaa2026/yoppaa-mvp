// HARNAIS DE MUTATION — RENDRE L'ARGENT D'UN ABONNEMENT (Abo-I1, 04/10)
//
// 🔴 CE QU'ON MESURE : aucune route ne remboursait un contrat ; l'export
// comptait la vente entière d'un argent reparti. Décisions d'Alex : montant
// libre plafonné, part non utilisée proposée, rembourser RÉSILIE toujours,
// comptoir = remboursement NOTÉ, case Argent, email, contrepassation. Chaque
// mutation rouvre une porte et nomme la garde qui doit rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-abo-rembourser.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const REGLE = 'lib/abonnements.js'
const ROUTE = 'app/api/rdv/rembourser-abonnement/route.js'
const EXPORT = 'lib/export-comptable.js'
const ABO = 'verif:abonnements'
const COMPTA = 'verif:comptable'

const MUTATIONS = [
  { nom: '🔴 la part proposée compte comme utilisées les séances que la résiliation rend',
    banc: ABO, fichier: REGLE,
    de: '  const rendues = new Set(seancesAnnuleesParResiliation(siennes, { dejaCommencee }).map(r => r.id))',
    vers: '  const rendues = new Set()',
    garde: '🔴 la part non utilisée rend les séances à venir que la résiliation annule' },

  { nom: '🔴 un contrat impayé se rembourse',
    banc: ABO, fichier: REGLE,
    de: "  if (contrat.paye !== true) return { ok: false, code: 'non_paye' }",
    vers: '',
    garde: '🔴 un contrat non payé ne se rembourse pas' },

  { nom: '🔴 un contrat se rembourse deux fois',
    banc: ABO, fichier: REGLE,
    de: "  if (Number(contrat.rembourse_montant) > 0) return { ok: false, code: 'deja_rembourse' }",
    vers: '',
    garde: '🔴 un contrat déjà remboursé ne se rembourse pas deux fois' },

  { nom: '🔴 on rend plus que le prix payé',
    banc: ABO, fichier: REGLE,
    de: "  if (m > plafond) return { ok: false, code: 'montant_trop_eleve', plafond }",
    vers: '',
    garde: '🔴 jamais plus que le prix payé' },

  { nom: '🔴 un montant nul ou négatif passe (piège du zéro)',
    banc: ABO, fichier: REGLE,
    de: "  if (!Number.isFinite(m) || m <= 0) return { ok: false, code: 'montant_invalide' }",
    vers: "  if (!Number.isFinite(m)) return { ok: false, code: 'montant_invalide' }",
    garde: '🔴 zéro, vide, null ou du texte ne sont pas des montants' },

  { nom: '🔴 le comptoir se rembourse sans dire comment',
    banc: ABO, fichier: REGLE,
    de: "  if (!MOYENS_ENCAISSEMENT.some(x => x.cle === moyen)) return { ok: false, code: 'moyen_requis' }",
    vers: '',
    garde: '🔴 au comptoir sans moyen : refusé' },

  { nom: '⚠️ le navigateur détourne un remboursement en ligne vers le comptoir',
    banc: ABO, fichier: REGLE,
    de: "    return { ok: true, montant: m, moyen: 'en_ligne', enLigne: true }",
    vers: "    return { ok: true, montant: m, moyen: moyen || 'en_ligne', enLigne: true }",
    garde: '⚠️ en ligne, un moyen envoyé par le navigateur ne détourne pas Stripe' },

  { nom: '🔴 deux clics font deux remboursements',
    banc: ABO, fichier: ROUTE,
    de: "      .is('rembourse_montant', null)",
    vers: '',
    garde: '🔴 un seul gagnant : le montant ne s’inscrit que sur un contrat payé jamais remboursé' },

  { nom: '🔴 Stripe rend TOUT le paiement au lieu du montant choisi',
    banc: ABO, fichier: ROUTE,
    de: '          amount: Math.round(regle.montant * 100),',
    vers: '',
    garde: '🔴 Stripe rend le MONTANT choisi' },

  { nom: '🔴 un membre sans la case Argent rend de l’argent',
    banc: ABO, fichier: ROUTE,
    de: "    const verdict = await gardeLigneEquipe(request, supabase, 'abonnements', abonnement_id, 'argent')",
    vers: "    const verdict = await gardeLigneEquipe(request, supabase, 'abonnements', abonnement_id, 'agenda')",
    garde: '🔴 rembourser passe par la case Argent' },

  { nom: '🔴 un refus de Stripe laisse le contrat marqué remboursé',
    banc: ABO, fichier: ROUTE,
    de: '          .update({ rembourse_montant: null, rembourse_le: null, rembourse_moyen: null })',
    vers: '          .update({})',
    garde: '🔴 un refus de Stripe lève le verrou et ne résilie rien' },

  { nom: '🔴 rembourser ne résilie plus les séances',
    banc: ABO, fichier: ROUTE,
    de: '        const seances = await annulerLesSeancesDuContrat(supabase, abonnement_id)',
    vers: '        const seances = { ok: true, annulees: [], filePrevenue: 0 }',
    garde: '🔴 rembourser résilie toujours, par la règle commune des séances' },

  { nom: '⚠️ l’email ne dit plus le montant rendu',
    banc: ABO, fichier: ROUTE,
    de: '        remboursement: { montant: regle.montant, moyen: regle.moyen },',
    vers: '',
    garde: '⚠️ l’email dit le montant et le moyen' },

  { nom: '🔴 l’email confond la carte et le comptoir',
    banc: ABO, fichier: 'lib/resend.js',
    de: "    : remboursement.moyen === 'en_ligne'",
    vers: '    : false',
    garde: '🔴 l’email du remboursement dit le montant et la carte' },

  { nom: '🔴 l’écran envoie sans poser la question de la route',
    banc: ABO, fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    if (!regle.ok) return toast(messageRefusRemboursement(regle.code, regle), 'error')",
    vers: '',
    garde: '🔴 l’écran pose la même question que la route' },

  { nom: '🔴 « recommence » ne termine plus une résiliation à moitié',
    banc: ABO, fichier: 'app/api/rdv/resilier-abonnement/route.js',
    de: '    const dejaResilie = contrat.statut === \'resilie\'',
    vers: '    const dejaResilie = false',
    garde: '🔴 « recommence » termine une résiliation restée à moitié' },

  { nom: '🔴 le webhook réécrit sans comparer et écrase la date du geste',
    banc: ABO, fichier: 'app/api/stripe/webhook/route.js',
    de: '    const memeMontant = Number(abo.rembourse_montant) === montant',
    vers: '    const memeMontant = false',
    garde: '⚠️ le même montant ne réécrit que la trace manquante' },

  { nom: '🔴 une écriture ratée du webhook se tait',
    banc: ABO, fichier: 'app/api/stripe/webhook/route.js',
    de: '      if (errAbo) throw new Error(`remboursement de l’abonnement non écrit : ${errAbo.message}`)',
    vers: '      if (false) throw new Error(`remboursement de l’abonnement non écrit : ${errAbo.message}`)',
    garde: '🔴 une écriture ratée se rejoue au lieu de se taire' },

  { nom: '🔴 le rendu au comptoir sort comme un remboursement sur la carte',
    banc: COMPTA, fichier: EXPORT,
    de: "  const auComptoir = sur === 'comptoir'",
    vers: '  const auComptoir = false',
    garde: '🔴 au comptoir, la contrepassation sort du comptoir et nomme le moyen' },

  { nom: '⚠️ la contrepassation dépasse la vente',
    banc: COMPTA, fichier: EXPORT,
    de: '    const rembourse = Math.min(arrondi(a.rembourse_montant), montant)',
    vers: '    const rembourse = arrondi(a.rembourse_montant)',
    garde: '⚠️ un remboursement ne dépasse jamais la vente' },

  { nom: '🔴 un abonnement remboursé ne se contrepasse plus',
    banc: COMPTA, fichier: EXPORT,
    de: '      remboursements: rembourse > 0',
    vers: '      remboursements: rembourse < 0',
    garde: '🔴 son remboursement sort dans le mois où l’argent repart' },

  { nom: '🔴 l’export d’octobre oublie le contrat vendu en septembre, remboursé en octobre',
    banc: COMPTA, fichier: 'app/api/dashboard/export-comptable/route.js',
    de: '      return (jour >= du && jour <= au) || (jourRemb !== null && jourRemb >= du && jourRemb <= au)',
    vers: '      return jour >= du && jour <= au',
    garde: '🔴 et charge les contrats remboursés pendant la période, vendus avant' },

  { nom: '🔴 les statistiques comptent l’argent reparti',
    banc: COMPTA, fichier: 'lib/statistiques.js',
    de: '  const montantAbos = abos.reduce((somme, a) => somme + valeurAbonnement(a), 0)',
    vers: '  const montantAbos = abos.reduce((somme, a) => somme + Number(a.prix || 0), 0)',
    garde: '⚠️ le chiffre d’affaires des abonnements suit' },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, sortie }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, sortie }
  }
}

const bancs = [...new Set(MUTATIONS.map((m) => m.banc))]
for (const b of bancs) {
  const depart = lancer(b)
  if (depart.rouge) {
    console.log(`🔴 ${b} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.sortie.slice(-400))
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
  ecrireSur(f, original.replace(m.de, () => m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  const nommee = res.sortie.includes(m.garde)
  if (res.rouge && !res.plante && nommee) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (res.rouge) { manquees.push(`${m.nom} — rouge, mais PAS sur « ${m.garde} »`); console.log(`  ✕ AUTRE GARDE : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = bancs.some((b) => lancer(b).rouge)
if (finalRouge) console.log('🔴 UN BANC EST ROUGE APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
