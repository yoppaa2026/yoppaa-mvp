// HARNAIS DE MUTATION — LOT 1 DU RENDEZ-VOUS, AVANT CENTRE RESPIRE (03/10)
//
// 🔴 CE QU'ON MESURE : les corrections du lot 1 issues de l'audit du 03/10
// (studio de yoga à deux professeurs, plusieurs adresses, acomptes possibles,
// abonnements vendus en cours d'année). Chaque mutation remet une forme fausse
// qui a RÉELLEMENT existé dans le dépôt, et nomme la garde qui doit rougir.
//
// ⚠️ CHAQUE MUTATION PORTE SON BANC : le lot touche le moteur de créneaux, le
// tunnel et la liste d'attente, qui ont chacun le leur.
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE À CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
//
//   node scripts/mutations-lot1-rdv.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const CREATION = 'lib/rdv-creation-server.js'
const SLOTS = 'lib/rdv-slots.js'

const MUTATIONS = [
  // ─── LA SURRÉSERVATION D'UN COURS ───────────────────────────────────────
  { nom: '🔴 un cours plein retombe sur la place 1 : la treizieme entre',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "    if (libre === null) return { ok: false, code: 'place_prise', collectif: true }",
    vers: "    if (false) return { ok: false, code: 'place_prise', collectif: true }",
    garde: 'un cours de douze déjà plein refuse la treizième' },

  { nom: '🔴 une lecture des places en panne laisse deviner une place',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "    if (errPlaces) return { ok: false, code: 'ecriture_impossible', error: errPlaces }",
    vers: "    if (false) return { ok: false, code: 'ecriture_impossible', error: errPlaces }",
    garde: 'une lecture des places en échec refuse au lieu de deviner' },

  { nom: '🔴 le professeur choisi fait de nouveau sortir les inscrites de l autre',
    banc: 'verif:slots', fichier: SLOTS,
    de: '    return avecLesInscritesDuCours(',
    vers: '    return ((retenues) => retenues)(',
    garde: 'Emily choisie, l’inscrite chez Carole au même cours se compte aussi' },

  { nom: '🔴 la base range de nouveau les places par professeur',
    banc: 'verif:tunnel-rdv', fichier: 'migrations/MIGRATION_PLACE_PAR_COURS.sql',
    de: '  ON public.rdv_reservations (commercant_id, prestation_id, date_rdv, heure_debut, place_no)',
    vers: '  ON public.rdv_reservations (commercant_id, prestation_id, praticien_id, date_rdv, heure_debut, place_no)',
    garde: 'la base range les places par COURS, pas par professeur' },

  // ─── L'ACOMPTE ENCAISSÉ SANS PLACE ──────────────────────────────────────
  { nom: '🔴 la verification sans ecriture ecrit quand meme',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: '  if (simulation) return { ok: true, simulation: true, place_no: placeNo }',
    vers: '  if (false) return { ok: true, simulation: true, place_no: placeNo }',
    garde: 'et n’écrit RIEN' },

  { nom: '🔴 l acompte ouvre Stripe meme quand la place n existe plus',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '    if (!essai.ok) {',
    vers: '    if (false) {',
    garde: 'create-rdv-acompte/route.js répond le refus en clair' },

  { nom: '🔴 une panne d ecriture se rembourse au lieu de se rejouer',
    banc: 'verif:tunnel-rdv', fichier: 'lib/refus-reservation.js',
    de: "  'couverts_invalides', 'groupe_trop_grand', 'creneau_passe',",
    vers: "  'couverts_invalides', 'groupe_trop_grand', 'creneau_passe', 'ecriture_impossible',",
    garde: 'une panne d’écriture N’EST PAS un refus de règle' },

  { nom: '🔴 le webhook ne rembourse plus un refus de regle',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/webhook/route.js',
    de: '        await refuserApresPaiement(supabase, { code: resa.code, meta, paymentIntent,',
    vers: '        if (false) await refuserApresPaiement(supabase, { code: resa.code, meta, paymentIntent,',
    garde: 'acompte : un refus de règle se rembourse au lieu de se rejouer' },

  { nom: '🔴 le remboursement perd sa cle d idempotence : un rejeu rembourserait deux fois',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/webhook/route.js',
    de: '}, { ...(options || {}), idempotencyKey: `yoppaa-refus-${paymentIntent.id}` })',
    vers: '}, { ...(options || {}) })',
    garde: 'le remboursement porte une clé d’idempotence' },

  { nom: '🔴 l ecran de retour annonce confirme avant le serveur',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '          _attenteConfirmation: !!sessionId,',
    vers: '          _attenteConfirmation: false,',
    garde: 'au retour de Stripe, l’écran attend avant de dire « confirmé »' },

  { nom: '🔴 l email de refus insere le prenom tel quel',
    banc: 'verif:tunnel-rdv', fichier: 'lib/resend.js',
    de: "    intro: `${prenom ? `${echapperHtml(prenom)}, ta` : 'Ta'} réservation",
    vers: "    intro: `${prenom ? `${prenom}, ta` : 'Ta'} réservation",
    garde: 'ce qui vient de la cliente ou du commerce est échappé' },

  { nom: '⚠️ la page de paiement de l acompte reste ouverte des heures',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,',
    vers: '      // sans expiration',
    garde: 'create-rdv-acompte/route.js : la page de paiement expire en trente minutes' },
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
  ecrireSur(f, original.replace(m.de, m.vers))
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
