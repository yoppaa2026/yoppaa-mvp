// HARNAIS DE MUTATION — REMETTRE UN RENDEZ-VOUS EN CONFIRMÉ (Annul-I2, 04/10)
//
// 🔴 CE QU'ON MESURE : « Remettre en confirmé » s'écrivait depuis le
// navigateur, par-dessus un acompte remboursé, des bons et une récompense
// rendus, des produits annulés. Chaque mutation remet une de ces portes
// ouvertes et nomme la garde qui doit rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-reconfirmer.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const REGLE = 'lib/rdv-reconfirmation.js'
const ROUTE = 'app/api/rdv/reconfirmer/route.js'
const BANC = 'verif:tunnel-rdv'

const MUTATIONS = [
  { nom: '🔴 le tableau de bord réécrit « confirmé » depuis le navigateur',
    banc: BANC, fichier: 'app/dashboard/page.js',
    de: "    if (statut === 'confirme') {",
    vers: '    if (false) {',
    garde: '🔴 « Remettre en confirmé » passe par le serveur' },

  { nom: '🔴 un acompte remboursé ne bloque plus',
    banc: BANC, fichier: REGLE,
    de: '  if (rembourse > 0) {',
    vers: '  if (false) {',
    garde: '🔴 un acompte remboursé le bloque' },

  { nom: '🔴 un bon rendu ne bloque plus',
    banc: BANC, fichier: REGLE,
    de: '  if (bons > 0) {',
    vers: '  if (false) {',
    garde: '🔴 un bon rendu aussi' },

  { nom: '🔴 une récompense rendue ne bloque plus',
    banc: BANC, fichier: REGLE,
    de: '  if (etat.recompenseRendue) {',
    vers: '  if (false) {',
    garde: '🔴 une récompense rendue aussi' },

  { nom: '🔴 des produits annulés ne bloquent plus',
    banc: BANC, fichier: REGLE,
    de: '  if (etat.produitsAnnules) {',
    vers: '  if (false) {',
    garde: '🔴 des produits annulés aussi' },

  { nom: '🔴 une absence facturée ne bloque plus',
    banc: BANC, fichier: REGLE,
    de: '  if (etat.absenceFacturee) {',
    vers: '  if (false) {',
    garde: '🔴 une absence facturée aussi' },

  { nom: '🔴 l’annulation du client se défait du tableau de bord',
    banc: BANC, fichier: REGLE,
    de: "export const STATUTS_RECONFIRMABLES = ['annule_commercant', 'no_show']",
    vers: "export const STATUTS_RECONFIRMABLES = ['annule_commercant', 'no_show', 'annule_client']",
    garde: '🔴 l’annulation du client ne se défait pas d’ici' },

  { nom: '🔴 la route perd sa garde',
    banc: BANC, fichier: ROUTE,
    de: "    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_reservations', rdv_id, 'agenda')",
    vers: '    const verdict = { ok: true }',
    garde: '🔴 la route est gardée comme l’annulation' },

  { nom: '🔴 le select perd le montant remboursé : « rien n’a bougé »',
    banc: BANC, fichier: ROUTE,
    de: '        stripe_refund_amount, commande_id, abonnement_id, fidelite_recompense_id, empreinte_debit_at,',
    vers: '        commande_id, abonnement_id, fidelite_recompense_id, empreinte_debit_at,',
    garde: '🔴 le select charge stripe_refund_amount' },

  { nom: '🔴 une lecture ratée laisse passer',
    banc: BANC, fichier: ROUTE,
    de: '    const echec = lectures.find(l => l?.error)',
    vers: '    const echec = null',
    garde: '🔴 une lecture ratée refuse, elle ne laisse pas passer' },

  { nom: '🔴 la route n’applique plus la règle',
    banc: BANC, fichier: ROUTE,
    de: '    if (refusMotif) return NextResponse.json({ ok: false, code: refusMotif.code, error: refusMotif.message }, { status: 409 })',
    vers: '',
    garde: '🔴 la règle commune décide' },

  { nom: '🔴 deux écrans écrivent tous les deux',
    banc: BANC, fichier: ROUTE,
    de: "      .eq('id', rdv.id).eq('statut', rdv.statut)",
    vers: "      .eq('id', rdv.id)",
    garde: '🔴 un seul gagnant si deux écrans cliquent' },

  { nom: '🔴 la personne n’est plus prévenue',
    banc: BANC, fichier: ROUTE,
    de: '      const html = emailRdvRetabli({',
    vers: '      const html = ({',
    garde: '🔴 la personne est prévenue par email' },

  { nom: '🔴 l’email ne protège plus le prénom',
    banc: BANC, fichier: 'lib/resend.js',
    de: '  const ouvre = (suite) => yopper_prenom ? `<strong>${echapperHtml(yopper_prenom)}</strong>, ${suite}` : cap(suite)',
    vers: '  const ouvre = (suite) => yopper_prenom ? `<strong>${yopper_prenom}</strong>, ${suite}` : cap(suite)',
    garde: '🔴 et il échappe le prénom' },

  { nom: '🔴 le commerce ne sait plus que l’email n’est pas parti',
    banc: BANC, fichier: 'lib/confirmation-rdv.js',
    de: "    if (retours?.email === 'echec') return `${base} L’email pour l’en prévenir n’est pas parti : préviens cette personne toi-même.`",
    vers: '',
    garde: '🔴 le commerce apprend si l’email n’est pas parti' },
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
