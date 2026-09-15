// HARNAIS DE MUTATION — LA TABLE DE SIX SANS CARTE (15/09, essai E2 d'Alex).
//
// 🔴 CE QU'ON MESURE : qu'une grande table ne se réserve plus sans carte, que
// le client lise ce qu'il accepte avant de la donner, et qu'il retrouve sa
// table au retour de Stripe. Quatre maillons manquaient, et le banc restait
// vert parce que son restaurant d'essai portait une colonne que la fiche
// publique n'a pas.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES (npm run verif:ancres).
//
//   node scripts/mutations-empreinte-table.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:empreinte'

const REGLE = 'lib/empreinte-table.js'
const RESERVER = 'app/api/rdv/reserver/route.js'
const FICHE = 'app/commander/rdv/[slug]/page.js'
const PAIEMENTS = 'app/dashboard/TabPaiements.js'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  { nom: '🔴 la regle relit stripe_account_id, que la fiche publique n a pas (le defaut d origine)',
    fichier: REGLE,
    de: '  if (commercant?.stripe_account_charges_enabled !== true) return false',
    vers: '  if (!commercant?.stripe_account_id || commercant?.stripe_account_charges_enabled !== true) return false' },

  { nom: '🔴 une colonne d encaissement absente passe pour un compte en ordre',
    fichier: REGLE,
    de: '  if (commercant?.stripe_account_charges_enabled !== true) return false',
    vers: '  if (commercant?.stripe_account_charges_enabled === false) return false' },

  // ─── LA PORTE GRATUITE ──────────────────────────────────────────────────
  { nom: '🔴 la route gratuite ne rejoue plus la regle de la carte',
    fichier: RESERVER,
    de: '    if (couvertsTable !== null && empreinteRequise(commercant, prestation, couvertsTable)) {',
    vers: '    if (couvertsTable !== null && false) {' },

  { nom: '🔴 la route gratuite ne charge plus l interrupteur de l empreinte',
    fichier: RESERVER,
    de: 'created_at, rdv_empreinte_actif, rdv_empreinte_seuil_couverts',
    vers: 'created_at, rdv_empreinte_seuil_couverts' },

  { nom: '⚠️ la route gratuite lit le nombre autrement que le module de creation',
    fichier: RESERVER,
    de: '    const couvertsTable = couvertsValides(prestation, couverts)',
    vers: '    const couvertsTable = Number(couverts)' },

  // ─── L'ANNONCE AVANT LE CLIC ────────────────────────────────────────────
  { nom: '🔴 la fiche n annonce plus la carte ni le montant',
    fichier: FICHE,
    de: '                        {montantEmpreinte(commercant, prestationChoisie, couverts) > 0 && (',
    vers: '                        {false && montantEmpreinte(commercant, prestationChoisie, couverts) > 0 && (' },

  { nom: '⚠️ le bouton ne dit plus le geste',
    fichier: FICHE,
    de: "'Enregistrer ma carte et réserver'",
    vers: 'mots.confirmer' },

  { nom: '🔴 la fiche ne part plus vers l empreinte',
    fichier: FICHE,
    de: '      if (empreinteRequise(commercant, prestationChoisie, couverts)) {',
    vers: '      if (false) {' },

  // ─── LE RETOUR DE STRIPE ────────────────────────────────────────────────
  { nom: '🔴 le cliche ne porte plus le montant garanti',
    fichier: FICHE,
    de: '              empreinteMontant: data.montant ?? null,',
    vers: '              montant: data.montant ?? null,' },

  { nom: '🔴 le retour ?empreinte= n est plus lu (le client retombe sur une fiche vierge)',
    fichier: FICHE,
    de: '    if (!paiement && !empreinte) return',
    vers: '    if (!paiement) return' },

  { nom: '🔴 une empreinte s affiche comme un acompte paye',
    fichier: FICHE,
    de: '{rdvCree._viaStripe && !rdvCree._empreinte && (',
    vers: '{rdvCree._viaStripe && (' },

  // ─── LE DÉLAI ANNONCÉ ───────────────────────────────────────────────────
  { nom: '🔴 la fiche annonce de nouveau 24 h a un restaurant, et ecrase le zero',
    fichier: FICHE,
    de: 'jusqu&apos;à {delaiAnnulationHeures(commercant)}h {mots.avant}.',
    vers: 'jusqu&apos;à {commercant.rdv_delai_annulation_heures || 24}h {mots.avant}.' },

  { nom: '🔴 le reglage de l acompte ecrase de nouveau le zero',
    fichier: PAIEMENTS,
    de: '({delaiAnnulationHeures(commercant)}h avant le RDV)',
    vers: '({commercant.rdv_delai_annulation_heures || 24}h avant le RDV)' },
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
