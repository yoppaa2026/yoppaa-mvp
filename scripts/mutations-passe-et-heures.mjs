// Harnais de mutation : LE PASSÉ, LES HEURES LIBRES DE LA SAISIE, LES QUATRE
// PORTES SERVEUR ET L'EMAIL D'UNE TABLE (10/09/2026 tard).
//
// Alex : « y a moyen de déplacer un rendez-vous dans le passé, ça ne doit pas
// être possible », puis « il ne doit pas sortir de la modale pour voir les
// dispos à un autre créneau », puis la capture de son email de déplacement.
//
// Chaque mutation remet un défaut plausible ; le banc désigné doit rougir.
// ⚠️ Aucune ancre ne contient de saut de ligne. Restauration par CONTENU,
// vérifiée. Jamais `git checkout`. Une mutation change le RÉSULTAT, jamais la
// TERMINAISON : un banc qui plante n'a rien mesuré.
import { ecrireSur } from './harnais-mutation.mjs'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const MODULE = 'lib/deplacement-rdv.js'

const MUTATIONS = [
  // ─── LA RÈGLE DU PASSÉ ──────────────────────────────────────────────────
  { nom: '🔴 la règle ne refuse plus le passé', banc: 'verif:slots',
    de: '  if (maintenant != null) {',
    vers: '  if (false) {' },
  { nom: '🔴 le quart d’heure en cours se ferme', banc: 'verif:slots',
    de: '  return Math.floor(minutes / QUART_D_HEURE) * QUART_D_HEURE',
    vers: '  return minutes' },
  { nom: '🔴 un jour passé se rouvre', banc: 'verif:slots',
    de: '  if (dateStr < aujourdhui) return Infinity',
    vers: '  if (dateStr < aujourdhui) return 0' },
  { nom: '🔴 « déjà passé » ne voit plus rien', banc: 'verif:slots',
    de: '  return debut < borne',
    vers: '  return false' },
  { nom: '⚠️ le refus ne nomme plus le plus tôt possible', banc: 'verif:slots',
    de: 'le plus tôt possible est ${heureDeMinutes(borne)}.',
    vers: 'le plus tôt possible est bientôt.' },

  // ─── LA BOUCLE DES HEURES LIBRES ────────────────────────────────────────
  { nom: '🔴 les heures partent d’une heure déjà passée', banc: 'verif:slots',
    de: '      if (m < borne) continue',
    vers: '      void borne' },
  { nom: '🔴 un service après minuit ne propose plus rien', banc: 'verif:slots',
    de: '    const finUtile = Math.min(finApresMinuit(debut, fin), 24 * 60)',
    vers: '    const finUtile = fin' },
  { nom: '🔴 la question de l’appelant est ignorée', banc: 'verif:slots',
    de: '      if (!accepte(h)) continue',
    vers: '      void accepte' },

  // ─── UN COURS COMPLET ───────────────────────────────────────────────────
  { nom: '🔴 une annulation garde sa place', banc: 'verif:slots', fichier: 'lib/cours-collectifs.js',
    de: "      && ['confirme', 'honore'].includes(r.statut)",
    vers: '      && true' },
  { nom: '🔴 l’inscrit déplacé se prend sa propre place', banc: 'verif:slots', fichier: 'lib/cours-collectifs.js',
    de: '      && (exclureId == null || String(r.id) !== String(exclureId)))',
    vers: '      && true)' },

  // ─── LA FENÊTRE DE DÉPLACEMENT ──────────────────────────────────────────
  { nom: '🔴 le déplacement ne donne plus l’heure qu’il est', banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '    maintenant,',
    vers: '' },
  { nom: '🔴 l’heure ne se relit plus au clic', banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '    const verdictAuClic = creneauAcceptable({ ...contexte, heureDebut: heure, maintenant: new Date() })',
    vers: '    const verdictAuClic = { ok: true }' },
  { nom: '🔴 les créneaux libres repartent de minuit', banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '      depuis: premiereMinuteOuverte(date, maintenant),',
    vers: '      depuis: 0,' },
  { nom: '🔴 un cours complet se propose au déplacement', banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '        if (estCours && !coursAPlace({ id: rdv?.prestation_id, capacite }, rdvsExistants, { dateStr: date, heure: h, exclureId: rdv?.id })) return false',
    vers: '' },
  { nom: '⚠️ un rendez-vous d’hier repart de sa propre date', banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '    return rdv?.date_rdv && rdv.date_rdv >= auj ? rdv.date_rdv : auj',
    vers: '    return rdv?.date_rdv || auj' },
  { nom: '⚠️ le refus de la base redevient une erreur brute', banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: "        if (String(errMaj.message || '').includes('RDV_DEPLACE_DANS_LE_PASSE')) {",
    vers: '        if (false) {' },
  { nom: '⚠️ l’heure n’avance plus, fenêtre ouverte', banc: 'verif:slots', fichier: 'app/dashboard/ModalDeplacerRdv.js',
    de: '    const t = setInterval(() => setMaintenant(new Date()), 30000)',
    vers: '    const t = null' },

  // ─── LA SAISIE AU TÉLÉPHONE ─────────────────────────────────────────────
  { nom: '🔴 l’email part pour un rendez-vous déjà passé', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '      if (rdvId && (email.trim() || null) && !passeAuClic) {',
    vers: '      if (rdvId && (email.trim() || null)) {' },
  { nom: '🔴 le passé ne se relit plus au clic', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '      const passeAuClic = dejaPasse({ dateStr, heure, maintenant: new Date() })',
    vers: '      const passeAuClic = passe' },
  { nom: '✅ la saisie refuse de noter après coup (contre la décision d’Alex)', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '        heureDebut: heure,',
    vers: '        heureDebut: heure, maintenant: new Date(),' },
  { nom: '⚠️ l’écran ne sait plus ce qui est passé', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '  const passe = heureValide && dejaPasse({ dateStr: date, heure, maintenant })',
    vers: '  const passe = false' },
  { nom: '⚠️ le bouton confirme un rendez-vous passé', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: "passe ? 'Noter après coup ✓' : ",
    vers: '' },
  { nom: '🔴 les heures libres de la saisie repartent de minuit', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: 'creneauxJour, dureeMinutes: dureeMin, depuis,',
    vers: 'creneauxJour, dureeMinutes: dureeMin, depuis: 0,' },
  { nom: '🔴 un cours complet se propose à la saisie', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '        if (capacitePrestation(presta) > 1) return coursAPlace(presta, rdvsExistants, { dateStr: date, heure: h })',
    vers: '' },
  { nom: '⚠️ la salle d’hier répond pour aujourd’hui', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: "  const salleConnue = salle.etat === 'ok' && salle.date === date",
    vers: "  const salleConnue = salle.etat === 'ok'" },
  { nom: '⚠️ une date ou une heure vidée s’enregistre', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '  const formValide = !!(prestationId && presta && dateValide && heureValide && (',
    vers: '  const formValide = !!(prestationId && presta && (' },
  { nom: '🔴 les places se lisent à l’heure de la case de départ', banc: 'verif:slots', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: ".eq('heure_debut', heure)",
    vers: ".eq('heure_debut', heureInit)" },
  { nom: '🔴 une heure sans table libre se propose à la saisie', banc: 'verif:table', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '          return !!t.format && !t.forcer',
    vers: '          return true' },
  { nom: '🔴 sans inventaire, une salle pleine se propose', banc: 'verif:table', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '          return occupes + groupe <= capacitePrestation(presta)',
    vers: '          return true' },
  { nom: '⚠️ « aucune heure libre » s’affirme sans avoir regardé', banc: 'verif:table', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: 'if (!aRegarde) return null',
    vers: '' },

  // ─── LA BASE ────────────────────────────────────────────────────────────
  { nom: '🔴 la base refuse aussi une clôture', banc: 'verif:slots', fichier: 'migrations/MIGRATION_RDV_PAS_DEPLACE_DANS_LE_PASSE.sql',
    de: '  IF NEW.date_rdv IS NOT DISTINCT FROM OLD.date_rdv',
    vers: '  IF FALSE AND NEW.date_rdv IS NOT DISTINCT FROM OLD.date_rdv' },
  { nom: '🔴 la base refuse aussi la création après paiement', banc: 'verif:slots', fichier: 'migrations/MIGRATION_RDV_PAS_DEPLACE_DANS_LE_PASSE.sql',
    de: '  BEFORE UPDATE OF date_rdv, heure_debut ON public.rdv_reservations',
    vers: '  BEFORE INSERT OR UPDATE OF date_rdv, heure_debut ON public.rdv_reservations' },

  // ─── LES QUATRE PORTES SERVEUR ──────────────────────────────────────────
  { nom: '🔴 « commencé » laisse passer l’heure pile et l’illisible', banc: 'verif:tunnel-rdv', fichier: 'lib/timezone.js',
    de: '  return isNaN(instant.getTime()) || !Number.isFinite(reference) || instant.getTime() <= reference',
    vers: '  return !isNaN(instant.getTime()) && instant.getTime() < reference' },
  { nom: '🔴 l’alarme de la veille est toujours promise', banc: 'verif:tunnel-rdv', fichier: 'lib/timezone.js',
    de: '  return !isNaN(instant.getTime()) && Number.isFinite(reference) && instant.getTime() - 24 * 3600 * 1000 > reference',
    vers: '  return !isNaN(instant.getTime())' },
  { nom: '🔴 l’acompte en ligne accepte un créneau passé', banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '    if (creneauDejaCommence(date_rdv, String(heure_debut))) {',
    vers: '    if (false) {' },
  { nom: '🔴 le rendez-vous avec produits accepte un créneau passé', banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    if (creneauDejaCommence(date_rdv, String(heure_debut))) {',
    vers: '    if (false) {' },
  { nom: '🔴 la séance sur abonnement accepte un créneau passé', banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/reserver-abonnement/route.js',
    de: '  if (creneauDejaCommence(dateRdv, heure)) {',
    vers: '  if (false) {' },
  { nom: '⚠️ la fiche ne comprend plus le refus de l’abonnement', banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "            } else if (j?.error === 'creneau_passe') {",
    vers: '            } else if (false) {' },
  { nom: '⚠️ la fiche affiche « Erreur paiement » au lieu de renvoyer choisir', banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: 'if (!j.ok && j.creneau_refuse) {',
    vers: 'if (false) {' },

  // ─── L'EMAIL ET LE CALENDRIER D'UNE TABLE ───────────────────────────────
  { nom: '🔴 « même table, même prix » revient sur une table', banc: 'verif:table', fichier: 'lib/resend.js',
    de: "              ? 'même nombre de personnes, même référence'",
    vers: "              ? 'même table, même prix, même référence'" },
  { nom: '🔴 l’alarme est promise à moins de 24 heures', banc: 'verif:table', fichier: 'lib/resend.js',
    de: "}${rappel_24h ? ' Rappel automatique 24h avant.' : ''}</p>",
    vers: '} Rappel automatique 24h avant.</p>' },
  { nom: '🔴 la table se redit par son format', banc: 'verif:table', fichier: 'lib/resend.js',
    de: "${echapperHtml(objetReservation({ prestation_nom, table, couverts })) || '—'}",
    vers: "${echapperHtml(prestation_nom) || '—'}" },
  { nom: '🔴 « Avec » revient devant une salle', banc: 'verif:table', fichier: 'lib/resend.js',
    de: ';">${mots.praticienLigne}</td>',
    vers: ';">Avec</td>' },
  { nom: '⚠️ « même prix » sur ce qui n’en a pas', banc: 'verif:table', fichier: 'lib/resend.js',
    de: "${prix_estime != null ? ', même prix' : ''}",
    vers: ', même prix' },
  { nom: '🔴 le restaurateur ne lit plus le groupe', banc: 'verif:table', fichier: 'lib/resend.js',
    de: '  const quoi = objet && objet !== prestation_nom && prestation_nom ? `${objet} · ${prestation_nom}` : (prestation_nom || objet)',
    vers: '  const quoi = prestation_nom' },
  { nom: '⚠️ « 1 personnes »', banc: 'verif:table', fichier: 'lib/reservation-metier.js',
    de: "  if (table && Number.isFinite(n) && n >= 1) return `${n} personne${n > 1 ? 's' : ''}`",
    vers: '  if (table && Number.isFinite(n) && n >= 1) return `${n} personnes`' },
  { nom: '🔴 la salle redevient « Avec »', banc: 'verif:table', fichier: 'lib/reservation-metier.js',
    de: "  praticienLigne: 'Salle',",
    vers: "  praticienLigne: 'Avec'," },
  { nom: '🔴 le calendrier redit « RDV Table de 6 personnes »', banc: 'verif:table', fichier: 'lib/ical.js',
    de: '    ? `Table pour ${groupe} chez ${commercant_nom}`',
    vers: '    ? `RDV ${prestation_nom} chez ${commercant_nom}`' },
  { nom: '⚠️ le calendrier redit « Avec : Salle principale »', banc: 'verif:table', fichier: 'lib/ical.js',
    de: "    praticien_nom ? `${table ? 'Salle' : 'Avec'} : ${praticien_nom}` : null,",
    vers: '    praticien_nom ? `Avec : ${praticien_nom}` : null,' },
  { nom: '⚠️ l’alarme redit « RDV demain »', banc: 'verif:table', fichier: 'lib/ical.js',
    de: "${table ? 'Rappel — ta table demain chez' : 'Rappel — RDV demain chez'}",
    vers: 'Rappel — RDV demain chez' },
  { nom: '🔴 la route promet toujours l’alarme', banc: 'verif:table', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '          rappel_24h: rappel24h,',
    vers: '          rappel_24h: true,' },
  { nom: '🔴 la route ne charge plus le nombre de personnes', banc: 'verif:table', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '        couverts,',
    vers: '' },
  { nom: '🔴 la route ne sait plus ce qu’est une table', banc: 'verif:table', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: 'prestation:rdv_prestations(nom, duree_minutes, par_couverts),',
    vers: 'prestation:rdv_prestations(nom, duree_minutes),' },
  { nom: '🔴 la route cesse de passer les produits', banc: 'verif:table', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '          produits,',
    vers: '' },
  { nom: '🔴 le webhook oublie la catégorie au gabarit', banc: 'verif:table', fichier: 'app/api/stripe/webhook/route.js',
    de: '      commercant_categorie:    categorie,',
    vers: '' },
  { nom: '🔴 le webhook ne charge plus la catégorie', banc: 'verif:table', fichier: 'app/api/stripe/webhook/route.js',
    de: 'infos_pratiques, categorie),',
    vers: 'infos_pratiques),' },
  { nom: '🔴 le webhook promet toujours l’alarme', banc: 'verif:table', fichier: 'app/api/stripe/webhook/route.js',
    de: '      rappel_24h: rappelVeillePossible(rdv.date_rdv, rdv.heure_debut),',
    vers: '      rappel_24h: true,' },
  { nom: '⚠️ le webhook redit « Ton RDV » à un restaurant', banc: 'verif:table', fichier: 'app/api/stripe/webhook/route.js',
    de: '      subject: `${mots.sujetChez} ${rdv.commercant.nom} est ${mots.participeConfirme}`,',
    vers: '      subject: `Ton RDV chez ${rdv.commercant.nom} est confirmé`,' },
]

const lancer = (banc) => {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-600) }
  }
}

// Filtre facultatif : `node scripts/mutations-passe-et-heures.mjs verif:slots`
const seul = process.argv[2] || null
const LISTE = seul ? MUTATIONS.filter(m => m.banc === seul) : MUTATIONS
const BANCS = [...new Set(LISTE.map(m => m.banc))]

for (const b of BANCS) {
  const depart = lancer(b)
  if (depart.rouge) {
    console.log(`🔴 ${b} EST DEJA ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au depart : ${BANCS.join(', ')}.\n`)

let attrapees = 0
const manquees = []

for (const m of LISTE) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ! ${m.nom} — texte introuvable`)
    continue
  }
  ecrireSur(f, original.split(m.de).join(m.vers))
  const r = lancer(m.banc)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log('RESTAURATION RATEE, on arrete tout.')
    process.exit(2)
  }
  if (r.rouge && !r.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else {
    manquees.push(m.nom + (r.plante ? ' (le banc a PLANTÉ, il n a rien mesuré)' : ''))
    console.log(`  ✕ NON attrapée : ${m.nom}${r.plante ? ' (PLANTAGE)' : ''}`)
  }
}

console.log(`\n${attrapees}/${LISTE.length} mutations attrapées.`)
for (const b of BANCS) {
  if (lancer(b).rouge) { console.log(`🔴 ${b} ROUGE APRES RESTAURATION.`); process.exit(2) }
}
console.log('Bancs verts après restauration. Dépôt intact.')
if (manquees.length) { console.log('\nMANQUÉES :'); manquees.forEach(m => console.log('  - ' + m)); process.exit(1) }
