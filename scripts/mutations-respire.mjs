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
const BANCS = ['verif:respire', 'verif:abonnements']
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
