// HARNAIS DE MUTATION — L'ÉCRAN DE TRAVAIL DES COMMANDES (11/10)
//
// Chaque mutation casse UNE garde de la vue en colonnes ; `verif:bord` doit
// rougir. Une mutation qui reste verte désigne une garde aveugle.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-vue-commandes.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:bord'
const REGLE = 'lib/vue-commandes.js'
const VUE = 'app/dashboard/VueCommandes.js'
const BORD = 'app/dashboard/page.js'

const MUTATIONS = [
  { nom: '🔴 une livraison prête reçoit « Remettre au client » (elle sauterait son départ en livraison)', fichier: REGLE,
    de: "  if (c.statut === 'pret' && (c.mode_retrait === 'livraison' || c.mode_retrait === 'expedition')) return null", vers: '' },
  { nom: '⚠️ une commande prête est dite « en retard »', fichier: REGLE,
    de: "  if (jour > aujourdhui || c.statut === 'pret') return false", vers: '  if (jour > aujourdhui) return false' },
  { nom: '🔴 « À préparer » compte aussi les prêtes', fichier: REGLE,
    de: "  const actives = (Array.isArray(commandes) ? commandes : []).filter(c => c?.statut === 'en_attente' || c?.statut === 'en_preparation')",
    vers: "  const actives = (Array.isArray(commandes) ? commandes : []).filter(c => ['en_attente', 'en_preparation', 'pret'].includes(c?.statut))" },
  { nom: '⚠️ la semaine d export commence le dimanche', fichier: REGLE,
    de: '  const debut = jourPlus(jour, -((jds + 6) % 7))', vers: '  const debut = jourPlus(jour, -jds)' },
  { nom: '🔴 le PDF garde les paiements échoués (jamais devenus des commandes)', fichier: 'lib/export-commandes-pdf.js',
    de: "    .filter(c => c && c.statut !== 'annulee_paiement_ko')", vers: '    .filter(c => c)' },
  { nom: '🔴 le PDF compte les annulées dans le chiffre et la production', fichier: 'lib/export-commandes-pdf.js',
    de: '    if (annulee) continue', vers: '    void annulee' },
  { nom: '⚠️ le PDF imprime des emoji illisibles (plus de filtre des caractères)', fichier: 'lib/export-commandes-pdf.js',
    de: '    .filter(ch => ch.charCodeAt(0) <= 0xFF || EN_PLUS.has(ch)).join(\'\')', vers: ".join('')" },
  { nom: '⚠️ les commandes du PDF ne sont plus séparées par un filet', fichier: 'lib/export-commandes-pdf.js',
    de: '      pdf.setDrawColor(...FILET); pdf.setLineWidth(0.25); pdf.line(MARGE, y, L - MARGE, y)', vers: '      void FILET' },
  { nom: '🔴 l export passe à côté du PDF', fichier: VUE,
    de: '      const blob = await pdfCommandes(donnees, { commerceNom, periode })', vers: "      const blob = new Blob([JSON.stringify(donnees)])" },
  { nom: '🔴 les colonnes ne sont plus triées par heure', fichier: REGLE,
    de: '  return COLONNES.map(col => ({ ...col, commandes: trierParHeure(liste.filter(c => c?.statut === col.statut)) }))',
    vers: '  return COLONNES.map(col => ({ ...col, commandes: liste.filter(c => c?.statut === col.statut) }))' },
  { nom: '🔴 « Encoder une commande » disparaît de la barre fixe', fichier: BORD,
    de: "                  {commercant?.categorie === 'alimentaire' && (creneauxRetrait.length > 0 || creneauxLivraison.length > 0) && (",
    vers: "                  {false && (creneauxRetrait.length > 0 || creneauxLivraison.length > 0) && (" },
  { nom: '🔴 la carte compacte avance par un autre chemin que `changerStatut` (plus d étiquette)', fichier: BORD,
    de: '                    onAvancer={(c, statut) => changerStatut(c.id, statut)}', vers: '                    onAvancer={(c, statut) => changerStatutLivraison(c.id, statut)}' },
  { nom: '🔴 la carte complète perd « Annuler et rembourser »', fichier: BORD,
    de: '                onAnnulerCommerce={annulerParLeCommerce}\n                onExpedier={setCommandeAExpedier}\n                onProduitsRemis={produitsRemis}\n                onRetourArriere={annulerRemise}\n                filtreCourant={filtreStatut}\n                modeHistorique={false}',
    vers: '                onExpedier={setCommandeAExpedier}\n                onProduitsRemis={produitsRemis}\n                onRetourArriere={annulerRemise}\n                filtreCourant={filtreStatut}\n                modeHistorique={false}' },
  { nom: '⚠️ la carte complète passe DEVANT les confirmations', fichier: BORD,
    de: "zIndex: 9990, padding: '1rem' }}>", vers: "zIndex: 10000, padding: '1rem' }}>" },
  { nom: '🔴 fermer un créneau sans confirmation', fichier: VUE,
    de: '    if (ok) onBasculer(r.creneau.id, bloque)', vers: '    onBasculer(r.creneau.id, bloque)' },
  { nom: '🔴 la carte compacte avance deux étapes (clic sans garde « envoi »)', fichier: VUE,
    de: '    try { await onAvancer(commande, action.statut) } finally { setEnvoi(false) }', vers: '    onAvancer(commande, action.statut); setEnvoi(false)' },
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
