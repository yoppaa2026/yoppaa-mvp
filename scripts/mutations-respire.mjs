// HARNAIS DE MUTATION — LE LOT « AVANT CENTRE RESPIRE » (17/10).
//
// Casse une à une les cinq corrections du lot et exige que `verif:respire`
// (ou `verif:abonnements` pour la série) rougisse.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-respire.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
// (23/10) + verif:logique : l'état de paiement d'une séance s'y exécute.
const BANCS = ['verif:respire', 'verif:abonnements', 'verif:logique']
const FICHE = 'app/commander/rdv/[slug]/page.js'
const ABO = 'lib/abonnements.js'
const FERM = 'lib/fermetures-rdv.js'
const ATT = 'lib/attente-rdv-server.js'
const BORD = 'app/dashboard/ConfigDashboard.js'
const MODALE = 'app/dashboard/ModalNouveauRdv.js'
const PAGE = 'app/dashboard/page.js'
const R_ABO = 'app/api/rdv/reserver-abonnement/route.js'
const R_RES = 'app/api/rdv/reserver/route.js'
const R_CMD = 'app/api/stripe/checkout/create-rdv-commande/route.js'
const APRES = 'lib/rdv-apres-reservation-server.js'
const YOP = 'app/api/yopper/abonnements/route.js'

const MUTATIONS = [
  // ─── 1. LA SÉRIE ────────────────────────────────────────────────────────
  { nom: '🔴 la série relit l ancienne table seule', fichier: MODALE,
    de: '  const fermeturesSerie = Array.isArray(fermetures) ? fermetures : (fermeturesAgenda || [])',
    vers: '  const fermeturesSerie = fermeturesAgenda || []' },
  { nom: '🔴 la série oublie les horaires adaptés', fichier: MODALE,
    de: '        }) || horsHoraireAdapte({',
    vers: '        }) && horsHoraireAdapte({' },
  { nom: '🔴 la série oublie la séance annulée', fichier: MODALE,
    de: '          prestationId: presta?.id ?? null, heure,',
    vers: '          prestationId: null, heure: null,' },
  // ⚠️ L'ANCRE PORTE LES DEUX PROPS : « fermetures={fermeturesAgendaTout} »
  // seule existe aussi sur l'agenda, plus haut, et la mutation y tombait
  // (manquée au premier passage, 17/10).
  { nom: '🔴 la page ne donne plus les fermetures à la fenêtre', fichier: PAGE,
    de: '                    fermetures={fermeturesAgendaTout} exceptions={exceptionsRdv}',
    vers: '                    exceptions={exceptionsRdv}' },
  // ─── 2. LE COMPTOIR ─────────────────────────────────────────────────────
  { nom: '🔴 le comptoir reprend le compte plein', fichier: ABO,
    de: '  return { seances_total: offre.seances, prix: offre.prix, date_debut: offre.debut }',
    vers: '  return { seances_total: total, prix: prixPlein, date_debut: fenetre?.debut ?? null }' },
  { nom: '🔴 une reprise passe au prorata', fichier: ABO,
    de: "  if (reprise || formule.type === 'carnet') {",
    vers: "  if (formule.type === 'carnet') {" },
  { nom: '🔴 l enregistrement oublie les termes du jour', fichier: BORD,
    de: '      prix: termes.prix,',
    vers: '      prix: Number(formule.prix) || 0,' },
  { nom: '🔴 l aperçu et l enregistrement divergent', fichier: BORD,
    de: '    const termes = termesInscriptionComptoir(formule, { reprise: !!insc.reprise || reprise.reprise, fenetre, aujourdhui })',
    vers: '    const termes = termesInscriptionComptoir(formule, { reprise: reprise.reprise, fenetre, aujourdhui })' },
  // ─── 3. L'EMAIL SERVEUR ─────────────────────────────────────────────────
  { nom: '🔴 la réservation gratuite ne confirme plus', fichier: R_RES,
    de: '    confirmerApresReponse(db, res.rdv.id)',
    vers: '' },
  { nom: '🔴 la séance d abonnement ne confirme plus', fichier: R_ABO,
    de: '  confirmerApresReponse(db, res.rdv?.id)',
    vers: '' },
  { nom: '🔴 le rendez-vous payé par bons ne confirme plus', fichier: R_CMD,
    de: '      confirmerApresReponse(supabase, idRdv)',
    vers: '' },
  { nom: '🔴 le rappel n est plus programmé', fichier: APRES,
    de: '      await programmerRappelRdv(rdvId, db)',
    vers: '      void rdvId' },
  // ─── 4. L'ABSENCE ───────────────────────────────────────────────────────
  { nom: '🔴 l absence ignore les inscrits sans prof', fichier: FERM,
    de: '        || (r.praticien_id == null && seulementChezLAbsente(r, fermeture.praticien_id, plages)))))',
    vers: '        )))' },
  { nom: '🔴 un cours partagé avec une collègue compte comme touché', fichier: FERM,
    de: '    && accueillent.every(p => p.praticien_id != null && String(p.praticien_id) === String(absenteId))',
    vers: '    && accueillent.some(p => p.praticien_id != null && String(p.praticien_id) === String(absenteId))' },
  { nom: '🔴 une plage inactive compte encore', fichier: FERM,
    de: "  const accueillent = plages.filter(p => p && p.actif !== false && !p.deleted_at",
    vers: "  const accueillent = plages.filter(p => p" },
  { nom: '🔴 l écran des absences ne lit plus les plages', fichier: BORD,
    de: '      if (vivant) setTouches(rdvsSousLaFermeture(data || [], ferm, { plages: plages || [] }))',
    vers: '      if (vivant) setTouches(rdvsSousLaFermeture(data || [], ferm))' },
  { nom: '🔴 la file prévient pour un cours sans prof', fichier: ATT,
    de: "    if (seanceSansProfesseur(fermetures, plages || [], { dateStr: dateRdv, heure: heureDebut })) return { ok: true, prevenus: 0, file: 0, raison: 'professeur_absent' }",
    vers: '' },
  { nom: '🔴 la file prévient après une lecture ratée des plages', fichier: ATT,
    de: "    if (errPl) return { ok: false, error: 'lecture_ko', prevenus: 0, file: 0 }",
    vers: '' },
  // ─── 5. LES CONGÉS DE LA FORMULE ────────────────────────────────────────
  { nom: '🔴 un jour de congé se réserve', fichier: ABO,
    de: "  if (dateEcartee(date, periodesExclues)) return { ok: false, raison: 'conge' }",
    vers: '' },
  { nom: '🔴 la route ne transmet plus les congés', fichier: R_ABO,
    de: '    periodesExclues,',
    vers: '' },
  { nom: '🔴 la route réserve malgré une formule illisible', fichier: R_ABO,
    de: "    if (errFormule) return NextResponse.json({ ok: false, error: 'lecture_impossible' }, { status: 500 })",
    vers: '' },
  { nom: '🔴 la fiche ne connaît plus les congés', fichier: YOP,
    de: "      ? db.from('abonnement_formules').select('id, libelle, prestation_id, periodes_exclues').in('id', formuleIds)",
    vers: "      ? db.from('abonnement_formules').select('id, libelle, prestation_id').in('id', formuleIds)" },
  { nom: '🔴 la fiche ne transmet plus les congés au verdict', fichier: ABO,
    de: '    periodesExclues: etat?.periodesExclues || [],',
    vers: '' },
  { nom: '🔴 le refus se tait sur la raison', fichier: ABO,
    de: "      return 'Pas de cours ce jour-là : c’est une période de congé. Choisis une autre date.'",
    vers: "      return 'Cette séance ne peut pas être posée sur ton abonnement.'" },

  // ─── LOT A DES « IMPORTANTS » (23/10) ─────────────────────────────────────
  { nom: '🔴 A1 le calendrier reprend toutes les plages (jours d autres cours « Complet »)', fichier: FICHE,
    de: '    ? genererJoursDispos({ nbJours: horizonRdv(commercant), horairesDetail: commercant.horaires_detail, creneaux: creneauxDuCalendrier, exceptions })',
    vers: '    ? genererJoursDispos({ nbJours: horizonRdv(commercant), horairesDetail: commercant.horaires_detail, creneaux: creneauxFiltres, exceptions })' },
  { nom: '🔴 A2 la file remise à zéro alors qu il reste une place', fichier: ATT,
    de: '      if (!estLui && resteUnePlace) continue', vers: '' },
  { nom: '🔴 A4 le rétablissement garde l ancien rappel (plus jamais de rappel)', fichier: 'app/api/rdv/reconfirmer/route.js',
    de: "      .update({ statut: 'confirme', motif_annulation: null, rappel_push_id: null })",
    vers: "      .update({ statut: 'confirme', motif_annulation: null })" },
  { nom: '🔴 A5 déplacé chez une prof absente (inscrit sans prof)', fichier: 'lib/deplacement-rdv.js',
    de: '    if (praticienId == null && seanceSansProfesseur(fermetures, creneauxJour, { dateStr, heure: String(heureDebut).slice(0, 5) })) {',
    vers: '    if (false) {' },
  { nom: '🔴 A5 le contrat ne refuse plus rien au déplacement', fichier: ABO,
    de: '  if (v.ok) return null', vers: '  return null' },
  { nom: '🔴 A5 le poste équipe ignore le refus du contrat', fichier: 'lib/rdv-deplacement-server.js',
    de: '      if (refusContrat) return { ok: false, code: `abonnement_${refusContrat.raison}`, message: refusContrat.message }', vers: '' },
  { nom: '🔴 A5 la fenêtre de la patronne ignore le refus du contrat', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '          if (refusContrat) { setError(refusContrat.message); setSubmitting(false); return }', vers: '' },
  { nom: '🔴 A6 un abonnement pas réglé redit « déjà payée »', fichier: 'lib/rdv-paiement.js',
    de: "    if (rdv.abonnement?.paye === false && temps !== 'sans_suite') {", vers: '    if (false) {' },
  { nom: '🔴 A7 la route vend hors de la formule', fichier: 'app/api/stripe/checkout/create-abonnement/route.js',
    de: "    for (const feature of ['rdv', 'paiement_ligne']) {", vers: '    for (const feature of []) {' },
  { nom: '🔴 A7 la fiche montre le bouton d achat hors formule', fichier: FICHE,
    de: "          const vendables = canDo(planEffectif(c), 'rdv') && canDo(planEffectif(c), 'paiement_ligne')", vers: '          const vendables = true' },
  { nom: '🔴 A3 une semaine compte sans jour de cours', fichier: ABO,
    de: '    if (!dateEcartee(curseur, periodesExclues) && (!duCours || duCours.some(p => creneauTombeLe(p, curseur)))) {',
    vers: '    if (!dateEcartee(curseur, periodesExclues)) {' },
  { nom: 'A3 des liaisons non lues changent le compte (plus inerte)', fichier: 'lib/abonnement-cours.js',
    de: '  if (!Array.isArray(creneaux) || !Array.isArray(liaisons)) return formule', vers: '  if (!Array.isArray(creneaux)) return formule' },

  // ─── LOT B (23/10) ────────────────────────────────────────────────────────
  { nom: '🔴 B1 un cours surbooké rend encore une place', fichier: 'lib/cours-collectifs.js',
    de: '  if (prises.size >= total) return null', vers: '' },
  { nom: '🔴 B2 le refus du contrat est ignoré au rétablissement', fichier: 'lib/rdv-reconfirmation.js',
    de: '  if (etat.refusAbonnement?.raison) {', vers: '  if (false) {' },
  { nom: '🔴 B3 le rétablissement part à la séquence de l annulation', fichier: 'lib/ical.js',
    de: '  return sequenceAnnulation(maintenant) + 1', vers: '  return sequenceAnnulation(maintenant)' },
  { nom: '🔴 B4 le déplacement promet l envoi case décochée', fichier: 'lib/confirmation-rdv.js',
    de: '    if (retours.emailParti) return', vers: '    if (true) return' },
  { nom: '🔴 B6 l email d annulation tait la séance rendue', fichier: 'lib/resend.js',
    de: "        if (seance_abonnement) lignes.push('Ta séance revient sur ton abonnement.')", vers: '' },
  { nom: '🔴 B5 le récap tait les annulations', fichier: 'lib/resend.js',
    de: '  const blocAnnulations = nbAnnul === 0 ? \'\' : `', vers: '  const blocAnnulations = true ? \'\' : `' },
  { nom: '🔴 B14 un cours passé à 1 place ne prévient plus', fichier: 'lib/cours-collectifs.js',
    de: '  } else if (cAp <= 1 && cAv > 1) {', vers: '  } else if (false) {' },
  { nom: '🔴 B13 la semaine glisse de nouveau depuis le jour même', fichier: 'app/dashboard/AgendaRdv.js',
    de: '    d.setDate(refDate.getDate() - jourIdxLun(refDate))', vers: '' },
  { nom: '🔴 B8 un cours trop long pour sa plage passe', fichier: 'lib/rdv-slots.js',
    de: '    if (!e?.tropCourte) continue', vers: '    continue' },
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
if (finalRouge) console.log('🔴 BANCS ROUGES APRÈS RESTAURATION.')
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
