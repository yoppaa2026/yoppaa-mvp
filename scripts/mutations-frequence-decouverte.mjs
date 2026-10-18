// HARNAIS DE MUTATION — DÉCOUVERTE, FRÉQUENCE, FORMULES AFFICHÉES (18/10).
//
// Casse une à une les règles du lot et exige que `verif:frequence` (ou un banc
// voisin : slots, abonnements, tunnel-rdv) rougisse.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-frequence-decouverte.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:frequence', 'verif:slots', 'verif:abonnements', 'verif:tunnel-rdv']
const FREQ = 'lib/frequence-creneau.js'
const DEPL = 'lib/deplacement-rdv.js'
const SLOTS = 'lib/rdv-slots.js'
const FERM = 'lib/fermetures-rdv.js'
const ABO = 'lib/abonnements.js'
const PRIX = 'lib/prix-prestation-server.js'
const CREA = 'lib/rdv-creation-server.js'
const POSTE = 'lib/equipe-poste.js'
const ATT = 'lib/attente-rdv-server.js'
const COPIE = 'lib/catalogue-copie.js'
const R_RES = 'app/api/rdv/reserver/route.js'
const R_ACO = 'app/api/stripe/checkout/create-rdv-acompte/route.js'
const R_CMD = 'app/api/stripe/checkout/create-rdv-commande/route.js'
const WH = 'app/api/stripe/webhook/route.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const MODALE = 'app/dashboard/ModalNouveauRdv.js'
const PAGE = 'app/dashboard/page.js'
const FICHE = 'app/commander/rdv/[slug]/page.js'
const BLOC = 'app/commander/rdv/[slug]/BlocAbonnements.js'
const SQL = 'migrations/MIGRATION_DECOUVERTE_FREQUENCE_FORMULES_18_10.sql'

const MUTATIONS = [
  // ─── 1. LA RÈGLE DE FRÉQUENCE ───────────────────────────────────────────
  { nom: '🔴 le rang du mois se compte mal', fichier: FREQ,
    de: '    return Math.ceil(jour / 7) === rang',
    vers: '    return Math.floor(jour / 7) === rang' },
  { nom: '🔴 le dernier jour du mois se trompe d une semaine', fichier: FREQ,
    de: '      return jour + 7 > joursDuMois',
    vers: '      return jour + 7 >= joursDuMois' },
  { nom: '🔴 une semaine sur deux tombe aussi avant son départ', fichier: FREQ,
    de: '    return semaines >= 0 && semaines % 2 === 0',
    vers: '    return semaines % 2 === 0' },
  { nom: '🔴 les dates choisies tombent tous les jours', fichier: FREQ,
    de: '    return (creneau.dates_choisies || []).some(d => dateISO(d) === iso)',
    vers: '    return true' },
  { nom: '🔴 un cours mensuel retombe chaque semaine', fichier: FREQ,
    de: "  if (frequence === 'hebdo') return true",
    vers: "  if (frequence === 'hebdo' || frequence === 'mensuel') return true" },
  { nom: '🔴 les dates choisies acceptent un autre jour', fichier: FREQ,
    de: '    .filter(d => jourDeLaDate(d) === jour_semaine)',
    vers: '' },

  // ─── 2. LA RÈGLE COMMUNE, PARTOUT ───────────────────────────────────────
  { nom: '🔴 la règle centrale oublie la fréquence', fichier: DEPL,
    de: '      || (!c.date_specifique && c.jour_semaine === cle && frequenceAccepte(c, dateStr))))',
    vers: '      || (!c.date_specifique && c.jour_semaine === cle)))' },
  { nom: '🔴 le calendrier de la fiche recopie l ancienne règle', fichier: SLOTS,
    de: '    const aCreneau = creneauxDuJour(creneaux, { dateStr: isoDate(d), jour }).length > 0',
    vers: '    const aCreneau = (creneaux || []).some(c => c.actif !== false && c.jour_semaine === jour)' },
  { nom: '🔴 la pause du serveur recopie l ancienne règle', fichier: R_RES,
    de: '      const bonJour = creneauTombeLe(c, date_rdv, jourSem)',
    vers: '      const bonJour = c.date_specifique === date_rdv || (!c.date_specifique && c.jour_semaine === jourSem)' },
  { nom: '🔴 le serveur ne charge plus la fréquence', fichier: CREA,
    de: 'praticien_id, lieu_id, pas_minutes, ${COLONNES_FREQUENCE}`)',
    vers: 'praticien_id, lieu_id, pas_minutes`)' },
  { nom: '🔴 le poste de l équipe ne charge plus la fréquence', fichier: POSTE,
    de: 'pas_minutes, actif, lieu_id, ${COLONNES_FREQUENCE}`',
    vers: 'pas_minutes, actif, lieu_id`' },
  { nom: '🔴 la file d attente ne charge plus la fréquence', fichier: ATT,
    de: "      .select(`praticien_id, jour_semaine, date_specifique, heure_debut, heure_fin, actif, deleted_at, ${COLONNES_FREQUENCE}`)",
    vers: "      .select(`praticien_id, jour_semaine, date_specifique, heure_debut, heure_fin, actif, deleted_at`)" },
  { nom: '🔴 une plage mensuelle sauve la séance d une absente', fichier: FERM,
    de: '    && creneauTombeLe(p, d)',
    vers: "    && creneauTombeLe({ ...p, frequence: 'hebdo' }, d)" },
  { nom: '🔴 passer en mensuel ne compte plus les rendez-vous perdus', fichier: FERM,
    de: '    if (!creneauTombeLe(plage, d)) return false',
    vers: "    if (!creneauTombeLe({ ...plage, frequence: 'hebdo' }, d)) return false" },
  { nom: '🔴 la série pose un cours les semaines sans cours', fichier: ABO,
    de: "    if (typeof aLieu === 'function' && !aLieu(curseur)) { ecartees.push({ date: curseur, raison: 'pas_de_cours' }); continue }",
    vers: '' },
  { nom: '🔴 la série du patron ignore la fréquence', fichier: MODALE,
    de: '        aLieu: plageCeJour(dateChoisie) ? (d) => !!plageCeJour(d) : null,',
    vers: '        aLieu: null,' },
  { nom: '🔴 l éditeur n écrit plus la fréquence', fichier: BORD,
    de: '      ...freq.champs,',
    vers: '' },
  { nom: '🔴 la copie vers un autre jour rend le cours hebdomadaire', fichier: BORD,
    de: "            frequence: c.frequence || 'hebdo',",
    vers: "            frequence: 'hebdo'," },
  { nom: '🔴 changer la fréquence se tait sur les rendez-vous', fichier: BORD,
    de: '      if (perdus.length > 0 && !await confirme(confirmationSimple({',
    vers: '      if (false && !await confirme(confirmationSimple({' },

  // ─── 3. LE TARIF DÉCOUVERTE ─────────────────────────────────────────────
  { nom: '🔴 le serveur oublie le tarif découverte', fichier: PRIX,
    de: '  if (decouverte !== null && decouverte < base.prix) {',
    vers: '  if (false) {' },
  { nom: '🔴 la découverte remplace un deal moins cher', fichier: PRIX,
    de: '  if (decouverte !== null && decouverte < base.prix) {',
    vers: '  if (decouverte !== null) {' },
  { nom: '🔴 une lecture ratée brade le cours', fichier: PRIX,
    de: '  if (error || data !== false) {',
    vers: '  if (error && data !== false) {' },
  { nom: '🔴 un client qui a déjà suivi le cours repaie la découverte', fichier: PRIX,
    de: '  if (error || data !== false) {',
    vers: '  if (error) {' },
  { nom: '🔴 une découverte à 0 € passe', fichier: PRIX,
    de: '  if (!Number.isFinite(prix) || prix <= 0) return null',
    vers: '  if (!Number.isFinite(prix) || prix < 0) return null' },
  { nom: '🔴 la route gratuite ne charge plus le tarif découverte', fichier: R_RES,
    de: '        .select(`id, nom, prix, prix_decouverte, acompte_pourcent',
    vers: '        .select(`id, nom, prix, acompte_pourcent' },
  { nom: '🔴 la route gratuite ne passe plus le client', fichier: R_RES,
    de: '      client: { email, telephone: client_telephone },',
    vers: '      clientIgnore: { email, telephone: client_telephone },' },
  { nom: '🔴 le rendez-vous gratuit perd le drapeau', fichier: R_RES,
    de: '        tarif_decouverte: decouverte === true,',
    vers: '' },
  { nom: '🔴 le drapeau ne voyage plus par l acompte', fichier: R_ACO,
    de: "            ...(decouverte ? { tarif_decouverte: '1' } : {}),",
    vers: '' },
  { nom: '🔴 le drapeau ne voyage plus avec les produits', fichier: R_CMD,
    de: "            ...(decouverte ? { tarif_decouverte: '1' } : {}),",
    vers: '' },
  { nom: '🔴 le webhook oublie le drapeau', fichier: WH,
    de: "      tarif_decouverte: meta.tarif_decouverte === '1',",
    vers: '' },
  { nom: '🔴 la fiche n annonce plus la découverte', fichier: FICHE,
    de: '                            {tarifDecouverteAffiche(p, deals) != null && (',
    vers: '                            {false && (' },
  { nom: '🔴 l éditeur accepte une découverte plus chère', fichier: BORD,
    de: '      if (!(d > 0) || !(d < Number(form.prix))) {',
    vers: '      if (false) {' },
  { nom: '🔴 la copie d une prestation perd sa découverte', fichier: COPIE,
    de: "  'prix_decouverte',",
    vers: '' },
  { nom: '🔴 l agenda ne dit plus « Découverte »', fichier: PAGE,
    de: '        {rdv.tarif_decouverte === true && (',
    vers: '        {false && (' },
  { nom: '🔴 la question « déjà suivi » s ouvre au navigateur', fichier: SQL,
    de: 'REVOKE ALL ON FUNCTION public.rdv_cours_deja_suivi(uuid, text, text) FROM PUBLIC, anon, authenticated;',
    vers: 'REVOKE ALL ON FUNCTION public.rdv_cours_deja_suivi(uuid, text, text) FROM PUBLIC;' },

  // ─── 4. LA FORMULE AFFICHÉE ─────────────────────────────────────────────
  { nom: '🔴 « seulement par toi » s affiche', fichier: ABO,
    de: '  if (!formule || formule.affichee_fiche !== true || formule.vente_en_ligne === true) return false',
    vers: '  if (!formule) return false' },
  { nom: '🔴 une période finie reste affichée', fichier: ABO,
    de: '  return formuleVendableEnLigne({ ...formule, vente_en_ligne: true }, { aujourdhui })',
    vers: '  return true' },
  { nom: '🔴 la fiche charge toutes les formules actives', fichier: FICHE,
    de: "        .or('vente_en_ligne.eq.true,affichee_fiche.eq.true')",
    vers: "        .or('vente_en_ligne.eq.true,actif.eq.true')" },
  { nom: '🔴 une formule affichée s achète en ligne', fichier: BLOC,
    de: '              {f.vente_en_ligne !== true ? (',
    vers: '              {false ? (' },
  { nom: '🔴 la vente en ligne sans compte qui encaisse revient', fichier: BLOC,
    de: '  const formules = toutes.filter(f => f?.vente_en_ligne === true ? venteEnLigne : f?.affichee_fiche === true)',
    vers: '  const formules = toutes' },
  { nom: '🔴 une formule s enregistre affichée ET en vente', fichier: BORD,
    de: '      affichee_fiche: !!form.actif && !form.vente_en_ligne && !!form.affichee_fiche,',
    vers: '      affichee_fiche: !!form.affichee_fiche,' },
]

const lancer = () => {
  try {
    const sortie = execSync(BANCS.map(b => `npm run ${b}`).join(' && '), { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ » : un banc qui a compté a parlé.
    const plante = !/vérifications|verif:frequence — \d+ OK/.test(sortie)
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
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  if (original.split(m.de).length !== 2) {
    manquees.push(`${m.nom} — ANCRE NON UNIQUE`)
    console.log(`  ? ancre non unique : ${m.nom}`)
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
if (finalRouge) console.log('🔴 BANCS ROUGES APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
