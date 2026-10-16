// HARNAIS DE MUTATION — L'HORAIRE DU JOUR ET LA LISTE UNIQUE (16/10).
//
// ✅ ALEX, 16/10 (tableau) : UNE liste « Fermetures et horaires
// exceptionnels » pour tout le commerce, qui remplace les horaires de ces
// jours-là partout. Ce harnais casse la règle, ses lecteurs et ses écrans un
// par un, et exige que `verif:horaires` rougisse à chaque fois.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES, vérifié par npm run verif:ancres.
//
//   node scripts/mutations-horaires-du-jour.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANCS = ['verif:horaires']
const MODULE = 'lib/horaires-du-jour.js'
const OUVERTURE = 'lib/ouverture.js'
const TOUCHES = 'lib/fermetures-touches.js'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  { nom: '🔴 un horaire adapté gagne sur une fermeture le même jour',
    de: '  const fermeture = couvrantes.find(estFermetureComplete)',
    vers: '  const fermeture = null' },
  { nom: '🔴 la seconde plage existe sans la première',
    de: '  if (out.length && heureValide(e.plage2_debut) && heureValide(e.plage2_fin)) out.push([hhmm(e.plage2_debut), hhmm(e.plage2_fin)])',
    vers: '  if (heureValide(e.plage2_debut) && heureValide(e.plage2_fin)) out.push([hhmm(e.plage2_debut), hhmm(e.plage2_fin)])' },
  { nom: '🔴 le dernier jour d’une période n’est plus couvert',
    de: "  return debut <= dateStr && dateStr <= (DATE.test(fin) ? fin : debut)",
    vers: "  return debut <= dateStr && dateStr < (DATE.test(fin) ? fin : debut)" },
  { nom: '🔴 une fermeture se lit « ouvert »',
    de: "  if (estFermetureComplete(e)) return { ouvert: false, exceptionnel: true, motif }",
    vers: "  if (estFermetureComplete(e)) return { ouvert: true, exceptionnel: true, motif }" },
  { nom: '🔴 la grille du jour ne remplace plus rien',
    de: '  return { ...reste, [jour]: horaireDuJour(horairesDetail, dateStr, exceptions) }',
    vers: '  return horairesDetail' },
  { nom: '🔴 l’agenda relit les anciennes fermetures « tout le commerce »',
    de: '    .filter(f => f && (f.praticien_id != null || (f.prestation_id != null && f.heure_debut != null)))',
    vers: '    .filter(f => f)' },
  { nom: '🔴 un horaire adapté ferme toute la journée de l’agenda',
    de: '    .filter(estFermetureComplete)',
    vers: '    .filter(Boolean)' },
  { nom: '🔴 une table se juge sur toute sa durée un jour adapté',
    de: '      ? debut >= d && debut <= f',
    vers: '      ? debut >= d && (Number.isFinite(fin) ? fin : debut) <= f' },
  { nom: '🔴 l’annonce garde le passé',
    de: '      return DATE.test(debut) && fin >= aujourdhui && debut <= borne',
    vers: '      return DATE.test(debut) && debut <= borne' },

  // ─── LES HORAIRES (lib/ouverture.js) ────────────────────────────────────
  { nom: '🔴 un horaire adapté redevient une fermeture', fichier: OUVERTURE,
    de: '  return (fermetures || []).some(f => estFermetureComplete(f) && couvreLeJour(f, dateStr))',
    vers: '  return (fermetures || []).some(f => couvreLeJour(f, dateStr))' },
  { nom: '🔴 un lundi ouvert par exception reste fermé', fichier: OUVERTURE,
    de: '  if (h?.exceptionnel) return creneauxDuJour(h).length > 0',
    vers: '  if (false) return creneauxDuJour(h).length > 0' },
  { nom: '🔴 la tournée ignore l’horaire adapté', fichier: OUVERTURE,
    de: '  if (seulementException && !h?.exceptionnel) return null',
    vers: '  if (seulementException) return null' },
  { nom: '🔴 la limite du jour même ignore l’horaire adapté', fichier: OUVERTURE,
    de: '      const limite = limiteRetraitCeJour(horairesPourDate(horairesDetail, jour, fermetures), jourSemaineDe(jour), delaiHeures)',
    vers: '      const limite = limiteRetraitCeJour(horairesDetail, jourSemaineDe(jour), delaiHeures)' },
  { nom: '🔴 la pastille ignore les exceptions', fichier: OUVERTURE,
    de: '  const creneauxAuj = creneauxDuJour(jourDe(0, jour))',
    vers: '  const creneauxAuj = creneauxDuJour(horaires?.[jour])' },
  { nom: '🔴 « Fermé exceptionnellement » redevient « Fermé »', fichier: OUVERTURE,
    de: "  const label = (aujExceptionnel && exceptionAuj?.ouvert === false) ? 'Fermé exceptionnellement' : 'Fermé'",
    vers: "  const label = 'Fermé'" },

  // ─── CE QUE LA FERMETURE RATTRAPE ───────────────────────────────────────
  { nom: '🔴 un horaire adapté rattrape toutes les commandes', fichier: TOUCHES,
    de: '    if (!c.creneau?.heure_debut) return false',
    vers: '    if (!c.creneau?.heure_debut) return true' },
  { nom: '🔴 une commande en attente de paiement est rattrapée', fichier: TOUCHES,
    de: "const VIVANTE = STATUTS_OCCUPENT_CRENEAU.filter(s => s !== 'paiement_en_attente')",
    vers: 'const VIVANTE = STATUTS_OCCUPENT_CRENEAU' },
  { nom: '🔴 une fermeture s’écrit avec ses plages', fichier: TOUCHES,
    de: '  const p1 = plage(plage1_debut, plage1_fin, adaptes)',
    vers: '  const p1 = plage(plage1_debut, plage1_fin, true)' },
  { nom: '🔴 un horaire adapté sans heures passe', fichier: TOUCHES,
    de: "  if (!HEURE.test(hhmm(plage1_debut)) || !HEURE.test(hhmm(plage1_fin))) return 'Indique les heures d’ouverture de ce jour-là.'",
    vers: '' },

  // ─── LES ÉCRANS ET LES SERVEURS ─────────────────────────────────────────
  { nom: '🔴 la liste relit les fermetures sans leurs plages', fichier: 'app/commander/page.js',
    de: "      supabase.from('fermetures_exceptionnelles').select(COLONNES_EXCEPTIONS).in('commercant_id', ids),",
    vers: "      supabase.from('fermetures_exceptionnelles').select('commercant_id, date_debut, date_fin').in('commercant_id', ids)," },
  { nom: '🔴 la fiche compare de nouveau un jour à un instant', fichier: 'app/commander/[slug]/page.js',
    de: ".gte('date_fin', jourCivilPlus(jourLocalISO(new Date()), -1)),",
    vers: ".gte('date_fin', new Date().toISOString())," },
  { nom: '🔴 la fiche n’annonce plus les exceptions', fichier: 'app/commander/[slug]/page.js',
    // ⚠️ RECALÉE LE 16/10 soir : un restaurant dit « Réservations ».
    de: '                <AnnoncesExceptions exceptions={fermetures} table={isAlimentaire(commercant)}/>',
    vers: '' },
  { nom: '🔴 la fiche rendez-vous oublie la liste dans sa grille', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '        horairesDetail: horairesPourDate(commercant.horaires_detail, dateStr, exceptions),',
    vers: '        horairesDetail: commercant.horaires_detail,' },
  { nom: '🔴 l’agenda ignore l’horaire adapté', fichier: 'app/dashboard/AgendaRdv.js',
    de: '    const h = horaireDuJour(horairesDetail, jour.iso, exceptions)',
    vers: '    const h = horairesDetail?.[jour.keyJour]' },
  { nom: '🔴 l’agenda de l’équipe redevient aveugle', fichier: 'app/equipe/PosteEquipe.js',
    de: '            fermetures={etat.agenda.fermetures || []} exceptions={etat.agenda.exceptions || []}',
    vers: '' },
  { nom: '🔴 réserver juge un jour exceptionnel sur la semaine', fichier: 'app/api/rdv/reserver/route.js',
    de: '    if (!jourExceptionnel && horaires && Object.keys(horaires).length > 0 && horaires.always_open !== true) {',
    vers: '    if (horaires && Object.keys(horaires).length > 0 && horaires.always_open !== true) {' },
  { nom: '🔴 la création des rendez-vous lit la liste sans ses plages', fichier: 'lib/rdv-creation-server.js',
    de: "      db.from('fermetures_exceptionnelles').select(COLONNES_EXCEPTIONS).eq('commercant_id', commercantId),",
    vers: "      db.from('fermetures_exceptionnelles').select('date_debut, date_fin').eq('commercant_id', commercantId)," },
  { nom: '🔴 le bouton du haut disparaît', fichier: 'app/dashboard/page.js',
    de: '      action: () => setFermeturesOuvertes(true),',
    vers: '' },
  { nom: '🔴 l’onglet Créneaux reprend son ancienne liste', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        <RappelExceptions commercantId={commercantId} toast={toast} exceptions={fermetures} onChange={fetchAll} />',
    vers: '' },
  { nom: '🔴 l’agenda repose une fermeture « tout le commerce »', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    if (!form.praticien_id) return toast('Choisis la personne absente. Pour fermer tout le commerce, utilise « Fermer ou changer les horaires ».', 'error')",
    vers: '' },
  { nom: '🔴 l’écran ne montre plus ce qui est touché', fichier: 'app/dashboard/FermeturesExceptionnelles.js',
    de: '      setTouchees({ commandes: commandesTouchees(commandes, candidate), rdvs: rdvsTouches(rdv.data || [], candidate) })',
    vers: '      setTouchees({ commandes: [], rdvs: [] })' },
  // ─── CE QU'UNE FERMETURE FERME (16/10 soir) ─────────────────────────────
  { nom: '🔴 des commandes fermées ne ferment plus les commandes',
    de: "  if (geste === 'commandes') return ['tout', 'commandes']",
    vers: "  if (geste === 'commandes') return ['tout']" },
  { nom: '🔴 des commandes fermées ferment l’agenda',
    de: "  if (geste === 'rdv') return ['tout', 'rdv']",
    vers: "  if (geste === 'rdv') return ['tout', 'rdv', 'commandes']" },
  { nom: '🔴 des commandes fermées ferment la porte du magasin',
    de: "  return ['tout']",
    vers: "  return ['tout', 'commandes', 'rdv']" },
  { nom: '🔴 la portée n’est plus lue',
    de: "  return e?.portee === 'commandes' || e?.portee === 'rdv' ? e.portee : 'tout'",
    vers: "  return 'tout'" },
  { nom: '🔴 la fiche ne dit plus quand les commandes reprennent',
    de: '  if (DATE.test(String(aujourdhui || \'\')) && DATE.test(fin) && debut <= aujourdhui && aujourdhui <= fin) {',
    vers: '  if (false) {' },
  { nom: '🔴 des rendez-vous fermés montrent les commandes', fichier: TOUCHES,
    de: "  if (porteeDe(exception) === 'rdv') return []",
    vers: '  if (false) return []' },
  { nom: '🔴 des commandes fermées montrent les rendez-vous', fichier: TOUCHES,
    de: "  if (porteeDe(exception) === 'commandes') return []",
    vers: '  if (false) return []' },
  { nom: '🔴 des horaires adaptés gardent une portée', fichier: TOUCHES,
    de: "    portee: adaptes ? 'tout' : porteeDe({ portee }),",
    vers: '    portee: porteeDe({ portee }),' },
  { nom: '🔴 « Seulement les rendez-vous » n’est plus proposé', fichier: TOUCHES,
    de: "  if (commercant.rdv_actif === true) out.push('rdv')",
    vers: '' },
  { nom: '🔴 la fiche ferme les commandes un jour de rendez-vous fermés', fichier: 'app/commander/[slug]/page.js',
    de: "    const fermeturesData = exceptionsPour(fermeturesLues, 'commandes')",
    vers: '    const fermeturesData = fermeturesLues || []' },
  { nom: '🔴 la barre des créneaux lit les fermetures de l’agenda', fichier: 'app/dashboard/page.js',
    de: "  const exceptionsCommandes = exceptionsPour(exceptionsCommerce, 'commandes')",
    vers: "  const exceptionsCommandes = exceptionsPour(exceptionsCommerce, 'rdv')" },
  { nom: '🔴 le badge des tables tombe un jour de commandes fermées', fichier: 'app/commander/page.js',
    de: "          exceptions: exceptionsPour(exceptionsParCommerce[c.id], 'rdv'),",
    vers: '          exceptions: exceptionsParCommerce[c.id] || [],' },
  { nom: '🔴 la commande en ligne lit les fermetures de l’agenda', fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: "      fermeturesCommercant = exceptionsPour(lues, 'commandes')",
    vers: "      fermeturesCommercant = exceptionsPour(lues, 'rdv')" },
  { nom: '🔴 le serveur des rendez-vous refuse un jour de commandes fermées', fichier: 'lib/rdv-creation-server.js',
    de: "    const exceptionsRdv = exceptionsPour(exceptions, 'rdv')",
    vers: '    const exceptionsRdv = exceptions || []' },
  { nom: '🔴 des commandes fermées vident les files d’attente', fichier: 'app/dashboard/FermeturesExceptionnelles.js',
    de: "    if (ecrite?.id && !form.adaptes && ligne.portee !== 'commandes') {",
    vers: '    if (ecrite?.id && !form.adaptes) {' },
  { nom: '🔴 le bouton de la barre ouvre une fenêtre vide', fichier: 'app/dashboard/page.js',
    de: "                      <button type=\"button\" onClick={() => setFermeturesOuvertes({ date: jourActif, portee: 'commandes' })}",
    vers: '                      <button type="button" onClick={() => setFermeturesOuvertes(true)}' },
  { nom: '🔴 le catalogue reprend un horaire adapté pour une fermeture', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      .then(({ data }) => setFermeturesExcept(exceptionsPour(data, 'commandes').filter(estFermetureComplete)))",
    vers: '      .then(({ data }) => setFermeturesExcept(data || []))' },
  { nom: '🔴 une fermeture de la liste ne vide plus les files', fichier: 'app/api/rdv/fermeture-file/route.js',
    de: '      const resE = await fermerLesFiles(supabase, { ...traduite, commercant_id: exception.commercant_id })',
    vers: '      const resE = { ok: true, retires: 0, prevenus: 0 }' },
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
