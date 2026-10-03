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

  // ─── LE LIEU : CELUI DE LA PLAGE QUI ACCUEILLE L'HEURE ──────────────────
  { nom: '🔴 le client designe de nouveau son lieu : la plage d un autre jour',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "  const lieuRetenu = champs?.source === 'commercant' ? lieuId : (plageRetenue?.lieu_id || null)",
    vers: "  const lieuRetenu = lieuId || plageRetenue?.lieu_id || null",
    garde: 'le lieu envoyé par un client ne compte plus' },

  { nom: '🔴 la plage validee ne donne plus son lieu',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "  const lieuRetenu = champs?.source === 'commercant' ? lieuId : (plageRetenue?.lieu_id || null)",
    vers: "  const lieuRetenu = champs?.source === 'commercant' ? lieuId : null",
    garde: 'le lieu de la plage validée l’emporte sur l’heure' },

  { nom: '⚠️ le commercant perd le lieu qu il a choisi',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "  const lieuRetenu = champs?.source === 'commercant' ? lieuId : (plageRetenue?.lieu_id || null)",
    vers: "  const lieuRetenu = champs?.source === 'commercant' ? null : (plageRetenue?.lieu_id || null)",
    garde: 'le lieu choisi par le commerçant reste le sien' },

  { nom: '🔴 lieu_id quitte le select des plages : undefined partout, en silence',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "      .select('id, jour_semaine, date_specifique, heure_debut, heure_fin, pause_debut, pause_fin, actif, praticien_id, lieu_id')",
    vers: "      .select('id, jour_semaine, date_specifique, heure_debut, heure_fin, pause_debut, pause_fin, actif, praticien_id')",
    garde: 'le lieu de la plage validée l’emporte sur l’heure' },

  { nom: '🔴 la plage se cherche de nouveau parmi tous les jours',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    // ⚠️ REPOINTÉE LE 03/10 : les plages du jour sont calculées une fois, pour
    // le lieu ET pour les fermetures.
    de: '    const plagesDuJour = creneauxDuJour(creneauxCom || [], { dateStr: dateRdv, jour: jourRdv })',
    vers: '    const plagesDuJour = creneauxCom || []',
    garde: 'le lieu de la plage validée l’emporte sur l’heure' },

  { nom: '🔴 la plage ignore les liaisons : un soin prend la salle du cours',
    banc: 'verif:slots', fichier: SLOTS,
    de: '  const regle = Array.isArray(liaisons) && liaisons.length > 0 ? liaisons : null',
    vers: '  const regle = null',
    garde: 'un soin posé à l’heure d’un cours commun garde la plage ouverte' },

  { nom: '⚠️ un commerce sans liaison : le cours n a plus de lieu',
    banc: 'verif:slots', fichier: SLOTS,
    de: '  const regle = Array.isArray(liaisons) && liaisons.length > 0 ? liaisons : null',
    vers: '  const regle = liaisons',
    garde: 'sans aucune liaison, un cours trouve quand même sa plage' },

  { nom: '⚠️ la praticienne choisie ne passe plus d abord',
    banc: 'verif:slots', fichier: SLOTS,
    de: "  const rang = c => (praticienId && String(c.praticien_id ?? '') === String(praticienId) ? 0",
    vers: "  const rang = c => (false ? 0",
    garde: 'un soin chez Carole se tient dans SA salle' },

  { nom: '⚠️ la plage la plus courte ne departage plus',
    banc: 'verif:slots', fichier: SLOTS,
    de: '  return [...candidates].sort((a, b) => rang(a) - rang(b) || duree(a) - duree(b))[0] || null',
    vers: '  return [...candidates].sort((a, b) => rang(a) - rang(b))[0] || null',
    garde: 'à égalité, la plage la plus courte' },

  { nom: '🔴 le deplacement par l equipe regrave le lieu a l heure',
    banc: 'verif:equipe', fichier: 'lib/rdv-deplacement-server.js',
    de: '  const lieu = await champsLieuPour(db, commerce.data, { jour: date, heure, lieuId: plage?.lieu_id || null })',
    vers: '  const lieu = await champsLieuPour(db, commerce.data, { jour: date, heure })',
    garde: 'déplacé sur la plage du mardi, le cours prend la salle de CETTE plage' },

  { nom: '🔴 la creation par l equipe grave le lieu a l heure',
    banc: 'verif:equipe', fichier: 'app/api/equipe/rdv/creer/route.js',
    de: '      lieuId: plage?.lieu_id || null,',
    vers: '      lieuId: null,',
    garde: 'créer grave le lieu de la plage qui accueille l’heure' },

  { nom: '🔴 le deplacement par le patron regrave le lieu a l heure',
    banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '      const lieu = await champsLieuPour(supabase, commercant, { jour: date, heure, lieuId: plage?.lieu_id || null })',
    vers: '      const lieu = await champsLieuPour(supabase, commercant, { jour: date, heure })',
    garde: 'il regrave le lieu de la plage qui accueille la nouvelle heure' },

  { nom: '🔴 les semaines repetees reprennent le lieu de l heure',
    banc: 'verif:logique', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '          ...(await champsLieuPour(supabase, commercant, { jour: d, heure, lieuId: lieuDeLaPlage(d) })),',
    vers: '          ...(await champsLieuPour(supabase, commercant, { jour: d, heure })),',
    garde: 'la création par le commerçant grave le lieu de la plage, semaine par semaine' },

  { nom: '🔴 l ecran envoie de nouveau un lieu',
    banc: 'verif:logique', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '            praticien_id: praticienChoisi?.id || null,  // null = Sans préférence',
    vers: '            praticien_id: praticienChoisi?.id || null, lieu_id: null,',
    garde: 'sauf si la plage désigne elle-même un emplacement, que le SERVEUR lit lui-même' },

  // ─── LES FERMETURES, AU SERVEUR ET À L'ÉCRAN ────────────────────────────
  { nom: '🔴 le serveur ne lit plus les fermetures du commerce',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: '    if (fermetureQuiBloque(fermetures, { dateStr: dateRdv, praticienId: champs?.praticien_id || null })) {',
    vers: '    if (false) {',
    garde: 'un jour de congé refuse la réservation, et n’écrit rien' },

  { nom: '🔴 une lecture des fermetures en panne laisse passer',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "    if (errFermetures) return { ok: false, code: 'ecriture_impossible', error: errFermetures }",
    vers: "    if (false) return { ok: false, code: 'ecriture_impossible', error: errFermetures }",
    garde: 'une lecture des fermetures en échec refuse, sans écrire' },

  { nom: '🔴 sans preference, le cours de l absente se reserve de nouveau',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "    if (!plageRetenue && plageQuiAccueille(plagesDuJour, pourCetteHeure)) return { ok: false, code: 'jour_ferme' }",
    vers: "    if (false) return { ok: false, code: 'jour_ferme' }",
    garde: 'sans préférence, le cours d’une professeure absente est refusé' },

  { nom: '⚠️ la plage d une absente donne encore son lieu',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: '    plageRetenue = plageQuiAccueille(plagesOuvertes(plagesDuJour, fermetures, dateRdv), pourCetteHeure)',
    vers: '    plageRetenue = plageQuiAccueille(plagesDuJour, pourCetteHeure)',
    garde: 'sans préférence, le cours d’une professeure absente est refusé' },

  { nom: '⚠️ le dernier jour d une fermeture se rouvre',
    banc: 'verif:slots', fichier: 'lib/fermetures-rdv.js',
    de: '  return debut <= dateStr && dateStr <= fin',
    vers: '  return debut <= dateStr && dateStr < fin',
    garde: 'et son dernier, bornes comprises' },

  { nom: '🔴 l absence d une praticienne ne ferme plus son rendez-vous',
    banc: 'verif:slots', fichier: 'lib/fermetures-rdv.js',
    de: '    if (praticienId != null && String(f.praticien_id) === String(praticienId)) return f',
    vers: '    if (false) return f',
    garde: 'l’absence d’une praticienne ferme le rendez-vous qu’on lui destine' },

  { nom: '🔴 la plage d une absente reste dans la grille',
    banc: 'verif:slots', fichier: 'lib/fermetures-rdv.js',
    de: '  return (creneauxJour || []).filter(c => c?.praticien_id == null || !absents.has(String(c.praticien_id)))',
    vers: '  return creneauxJour || []',
    garde: 'la plage d’une praticienne absente sort de la grille' },

  { nom: '⚠️ une fermeture du commerce laisse des plages ouvertes',
    banc: 'verif:slots', fichier: 'lib/fermetures-rdv.js',
    de: '  if (ferme.some(f => f.praticien_id == null)) return []',
    vers: '  if (false) return []',
    garde: 'une fermeture du commerce vide la journée' },

  { nom: '🔴 un jour ferme apres paiement se rejoue au lieu de se rembourser',
    banc: 'verif:tunnel-rdv', fichier: 'lib/refus-reservation.js',
    de: "  'couverts_invalides', 'groupe_trop_grand', 'creneau_passe', 'jour_ferme',",
    vers: "  'couverts_invalides', 'groupe_trop_grand', 'creneau_passe',",
    garde: 'un jour fermé après paiement se rembourse' },

  { nom: '🔴 la reservation gratuite retombe dans Reessaie sur un refus de regle',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/reserver/route.js',
    de: '      if (estRefusDeRegle(res.code)) {',
    vers: '      if (false) {',
    garde: 'la réservation sans paiement dit tout refus de règle' },

  { nom: '🔴 la seance d abonnement rend de nouveau ecriture_impossible',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/reserver-abonnement/route.js',
    de: '    if (estRefusDeRegle(res.code)) {',
    vers: '    if (false) {',
    garde: 'la séance d’abonnement aussi' },

  { nom: '🔴 la fiche propose encore le cours de l absente',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '        creneaux: plagesOuvertes(creneauxFiltres, fermetures, dateStr),',
    vers: '        creneaux: creneauxFiltres,',
    garde: 'la fiche retire de sa grille les plages d’une praticienne absente' },
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
