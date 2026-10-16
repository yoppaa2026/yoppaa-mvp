// HARNAIS DE MUTATION — LA CLÔTURE DES CRÉNEAUX EN MINUTES (16/10).
//
// ✅ ALEX, 16/10 (tableau, rendez-vous d'Aux Délices des 7 Abbayes) : la
// clôture se règle en minutes, avec « Appliquer à tous les créneaux ». Ce
// harnais casse la règle, sa lecture et ses écrans un par un, et exige qu'un
// banc rougisse à chaque fois.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-cloture-minutes.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:fidelite', 'verif:slots', 'verif:livraison', 'verif:logique', 'verif:delai']
const MODULE = 'lib/creneaux.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const COMMANDE = 'app/api/stripe/checkout/create-commande/route.js'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  { nom: '🔴 la clôture ne compte plus (verif:fidelite « une heure avant : trop tard »)',
    de: '  const marge = minutes * 60 * 1000',
    vers: '  const marge = 0' },

  { nom: '🔴 les minutes se comptent comme des secondes (verif:fidelite)',
    de: '  const marge = minutes * 60 * 1000',
    vers: '  const marge = minutes * 1000' },

  { nom: '🔴 la clôture relit l’ancienne colonne en heures (verif:fidelite)',
    de: '  const m = Number(creneau?.cutoff_minutes)',
    vers: '  const m = Number(creneau?.cutoff_heures)' },

  // ─── CE QUE LE COMMERÇANT LIT ───────────────────────────────────────────
  { nom: '🔴 « la veille » redevient faux au-delà d’un jour (verif:slots « renvoie à la veille »)',
    de: "  return joursAvant === 1 ? `la veille à ${heure}` : `${joursAvant} jours avant à ${heure}`",
    vers: '  return `la veille à ${heure}`' },

  { nom: '🔴 « 1 h 30 » devient « 90 min » (verif:slots « la durée se dit comme on la lit »)',
    de: '  if (m < 60) return `${m} min`',
    vers: '  if (m < 600) return `${m} min`' },

  { nom: '🔴 zéro se lit « fermées 0 min avant » (verif:slots « se lit en clair »)',
    de: '  if (m === 0) {',
    vers: '  if (false) {' },

  { nom: '🔴 le choix ne descend plus sous l’heure (verif:slots « jusqu’à 10 minutes »)',
    de: 'export const CLOTURES_PROPOSEES = [0, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 360, 720, 1440]',
    vers: 'export const CLOTURES_PROPOSEES = [0, 60, 120, 180, 240, 360, 720, 1440]' },

  // ─── LE SERVEUR ─────────────────────────────────────────────────────────
  // ⚠️ Les deux lectures (tournée, retrait) portent la MÊME liste de colonnes :
  // la mutation casse la première, la tournée de livraison.
  { nom: '🔴 le serveur ne lit plus la clôture d’une tournée (verif:livraison « C5 livraison »)',
    fichier: COMMANDE,
    de: "mode_capacite, cutoff_minutes')",
    vers: "mode_capacite')" },

  { nom: '🔴 le refus redit des heures brutes (verif:livraison « le refus du serveur dit la clôture »)',
    fichier: COMMANDE,
    de: 'au moins ${libelleDuree(etatCreneau.minutes)} à l',
    vers: 'au moins ${etatCreneau.minutes} h à l' },

  // ─── LE TABLEAU DE BORD ─────────────────────────────────────────────────
  { nom: '🔴 le réglage d’un créneau écrit l’ancienne colonne (verif:logique « régler la clôture »)',
    fichier: BORD,
    de: "    const { error } = await supabase.from('creneaux').update({ cutoff_minutes: n }).eq('id', id)",
    vers: "    const { error } = await supabase.from('creneaux').update({ cutoff_heures: n }).eq('id', id)" },

  { nom: '🔴 « appliquer à tous » ne touche que le créneau du jour (verif:slots « TOUS les créneaux »)',
    fichier: BORD,
    de: ".update({ cutoff_minutes: clotureCommune }).eq('commercant_id', commercantId)",
    vers: ".update({ cutoff_minutes: clotureCommune }).eq('jour_semaine', jourActif)" },

  { nom: '🔴 la copie perd à nouveau la clôture (verif:slots « une copie garde sa clôture »)',
    fichier: BORD,
    de: '            cutoff_minutes: minutesDeCloture(c),',
    vers: '            cutoff_minutes: 0,' },

  { nom: '🔴 la tournée de livraison écrit l’ancienne colonne (verif:slots « la limite d’une tournée »)',
    fichier: BORD,
    de: "    const { error } = await supabase.from('livraison_creneaux').update({ cutoff_minutes: n }).eq('id', id)",
    vers: "    const { error } = await supabase.from('livraison_creneaux').update({ cutoff_heures: n }).eq('id', id)" },

  { nom: '🔴 la phrase d’une tournée oublie « le départ » (verif:slots « elle se lit en clair »)',
    fichier: BORD,
    de: '{phraseCloture(c.heure_debut, minutesDeCloture(c), { livraison: true })}',
    vers: '{phraseCloture(c.heure_debut, minutesDeCloture(c))}' },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ».
    const plante = !/vérifications|Tout passe/.test(sortie)
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
