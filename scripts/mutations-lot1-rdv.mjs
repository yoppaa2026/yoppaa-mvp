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
    // ⚠️ ANCRE REPOINTÉE LE 04/10 : `pas_minutes` suit `lieu_id`.
    de: "      .select('id, jour_semaine, date_specifique, heure_debut, heure_fin, pause_debut, pause_fin, actif, praticien_id, lieu_id, pas_minutes')",
    vers: "      .select('id, jour_semaine, date_specifique, heure_debut, heure_fin, pause_debut, pause_fin, actif, praticien_id, pas_minutes')",
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
    // ⚠️ ANCRE REPOINTÉE LE 04/10 : la règle reçoit aussi le cours et l'heure.
    de: '    const fermeture = fermetureQuiBloque(fermetures, { dateStr: dateRdv, praticienId: champs?.praticien_id || null, prestationId, heure })',
    vers: '    const fermeture = null',
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

  // ─── LA LISTE D'ATTENTE : LA-01 ET LA-05 ────────────────────────────────
  { nom: '🔴 la personne servie sans client_id reste dans la file',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: '    if (!qui && clientEmail && concernees.length > 0) {',
    vers: '    if (false) {',
    garde: 'la personne servie par un abonnement sort de la file' },

  { nom: '🔴 la creation ne passe plus l adresse a la file',
    banc: 'verif:attente', fichier: CREATION,
    de: '    clientEmail: champs?.client_email || null,',
    vers: '    clientEmail: null,',
    garde: 'la création passe l’adresse à la file' },

  { nom: '🔴 l inscription ne relit plus la seance',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: '  if (ligne.portee === PORTEE_SEANCE) {',
    vers: '  if (false) {',
    garde: 'un cours où il reste de la place ne s’attend pas' },

  { nom: '🔴 un cours qui n a pas lieu s attend quand meme',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "  if (essai.code === 'place_prise') return { ok: true }",
    vers: "  if (essai.code === 'place_prise' || essai.code === 'prestation_hors_creneau') return { ok: true }",
    garde: 'un cours qui n’a pas lieu à cette heure ne s’attend pas' },

  { nom: '🔴 on attend sa propre place prise sur un abonnement',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: '    || (adresse && normaliserEmail(r.client_email) === adresse))',
    vers: '    || false)',
    garde: 'on n’attend pas sa propre place, même prise sur un abonnement' },

  { nom: '🔴 une seance commencee s attend encore',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "  if (creneauDejaCommence(dateRdv, heure, maintenant)) return { ok: false, raison: 'seance_passee' }",
    vers: "  if (false) return { ok: false, raison: 'seance_passee' }",
    garde: 'une séance commencée ne s’attend plus' },

  { nom: '⚠️ l horizon de la fiche ne borne plus la file',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "  if (limite && dateRdv > limite) return { ok: false, raison: 'demande_invalide' }",
    vers: "  if (false) return { ok: false, raison: 'demande_invalide' }",
    garde: 'au-delà de l’horizon de la fiche' },

  { nom: '🔴 l attente oublie son jour : le bloc reste sous un autre jour',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '    && attenteVisee.date === isoDate(dateChoisie) && attenteVisee.prestationId === prestationChoisie.id',
    vers: '    && true',
    garde: 'et ne vaut que sur ce jour et cette prestation' },

  { nom: '⚠️ le bloc d attente s ouvre sous une seance libre',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "                    && slots.some(s => s.heure === heureAttente && s.pris && s.motif === 'complet') && (",
    vers: '                    && (',
    garde: 'le bloc ne s’ouvre que sous une séance réellement complète' },

  { nom: '🔴 la taille de la liste d attente ne s enregistre plus',
    banc: 'verif:attente', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      ...(form.par_couverts ? {} : { attente_max: Math.max(0, Math.min(50, parseInt(form.attente_max, 10) || 0)) }),',
    vers: '      ...({}),',
    garde: 'la commerçante règle la taille de sa liste d’attente' },

  { nom: '🔴 la fiche juge de nouveau les jours fermes a sa facon',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '    return !!fermetureQuiBloque(fermetures, { dateStr: iso, praticienId: praticienChoisi?.id ?? null })',
    vers: '    return fermetures.some(f => f.praticien_id === null && iso >= f.date_debut && iso <= f.date_fin)',
    garde: 'et juge les jours fermés avec la règle du serveur' },

  // ─── LES EMAILS D'ABONNEMENT ÉCHAPPÉS ──────────────────────────────────
  { nom: '🔴 le nom tape par le client part tel quel chez le commercant',
    banc: 'verif:abonnements', fichier: 'lib/resend.js',
    de: "  const qui = echapperHtml([client_prenom, client_nom].filter(Boolean).join(' ')) || 'Un client'",
    vers: "  const qui = [client_prenom, client_nom].filter(Boolean).join(' ') || 'Un client'",
    garde: 'l’email du commerçant échappe le nom du client' },

  { nom: '🔴 la formule part telle quelle chez le client',
    banc: 'verif:abonnements', fichier: 'lib/resend.js',
    de: "        ${ligne('Formule', echapperHtml(resume?.formule))}",
    vers: "        ${ligne('Formule', resume?.formule)}",
    garde: 'l’email du client échappe aussi la formule' },

  { nom: '🔴 le refus du serveur ne se lit plus a l etape 2',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                    <div role="alert" style={{ background: \'#FEF2F2\', border: \'1.5px solid #FCA5A5\', borderRadius: 12, padding: \'0.875rem 1rem\', marginBottom: 14,',
    vers: '                    <div style={{ background: \'#FEF2F2\', border: \'1.5px solid #FCA5A5\', borderRadius: 12, padding: \'0.875rem 1rem\', marginBottom: 14,',
    garde: 'le refus du serveur s’affiche à l’étape 2' },

  // ─── LE DÉLAI D'ANNULATION DES SERVICES ─────────────────────────────────
  { nom: '🔴 un commerce de services ne voit plus son delai',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      {!(estTable && prestations.some(p => p.par_couverts === true && p.actif !== false)) && (',
    vers: '      {false && (',
    garde: 'un commerce sans tables le voit' },

  { nom: '🔴 Paiements annonce de nouveau 24 h sans lire la colonne',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/TabPaiements.js',
    de: "rdv_acompte_en_ligne_actif, accepte_paiement_cash, rdv_delai_annulation_heures')",
    vers: "rdv_acompte_en_ligne_actif, accepte_paiement_cash')",
    garde: 'Paiements lit le délai avant de l’annoncer' },

  { nom: '🔴 l admin change de nouveau un zero en vingt-quatre',
    banc: 'verif:tunnel-rdv', fichier: 'app/admin/ModalEditCommercant.js',
    de: '        rdv_delai_annulation_heures: vDelai.valeur,',
    vers: '        rdv_delai_annulation_heures: Number(form.rdv_delai_annulation_heures) || 24,',
    garde: 'l’admin ne change plus un zéro en vingt-quatre' },

  // ─── « RÉPÉTER / TOUT LE CONTRAT » ──────────────────────────────────────
  { nom: '🔴 la serie pose de nouveau une seance en plein conge',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: "    if (dateEcartee(curseur, periodesExclues)) { ecartees.push({ date: curseur, raison: 'conge' }); continue }",
    vers: '',
    garde: '« + 4 » depuis le 5 octobre saute le congé d’automne' },

  { nom: '🔴 la serie ignore de nouveau les fermetures',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: "    if (typeof estFermee === 'function' && estFermee(curseur)) { ecartees.push({ date: curseur, raison: 'fermeture' }); continue }",
    vers: '',
    garde: 'un jour où l’agenda est fermé est sauté' },

  { nom: '🔴 la modale ne charge plus les conges de la formule',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: 'formule:abonnement_formules(libelle, periodes_exclues)',
    vers: 'formule:abonnement_formules(libelle)',
    garde: 'la modale charge les congés de la formule' },

  { nom: '🔴 les semaines repetees ne sont plus jugees au clic',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '          return v.ok',
    vers: '          return true',
    garde: 'chaque semaine répétée est jugée au clic' },

  { nom: '🔴 la fenetre se ferme avant de dire ce qui manque',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '      if (nonPosees.length > 0) {',
    vers: '      if (false) {',
    garde: 'la fenêtre reste ouverte pour dire ce qui n’a pas été posé' },

  // ─── L'ABONNEMENT VENDU EN COURS DE PÉRIODE ─────────────────────────────
  { nom: '🔴 une periode entamee se vend de nouveau au prix plein',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: '    : Math.round(prixPlein * restantes.length / toutes.length * 100) / 100',
    vers: '    : prixPlein',
    garde: 'et coûte huit douzièmes, au prorata par défaut' },

  { nom: '🔴 une periode entamee accorde de nouveau toutes ses seances',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: '  const enCours = estDate(aujourdhui) && aujourdhui > formule.date_debut',
    vers: '  const enCours = false',
    garde: 'achetée le 7 octobre, elle accorde les huit semaines restantes' },

  { nom: '🔴 une periode finie se vend encore',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: '    vendable: restantes.length > 0 && prix >= 0.5,',
    vers: '    vendable: true,',
    garde: 'le lendemain de la fin, plus rien ne se vend' },

  { nom: '🔴 la vitrine ignore de nouveau le calendrier',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: '  if (estDate(aujourdhui)) return offreAuJour(formule, { aujourdhui })?.vendable === true',
    vers: '',
    garde: 'le lendemain de la fin, plus rien ne se vend' },

  { nom: '🔴 la route encaisse le prix du catalogue',
    banc: 'verif:abonnements', fichier: 'app/api/stripe/checkout/create-abonnement/route.js',
    de: '    const prixCents = Math.round(Number(offre.prix) * 100)',
    vers: '    const prixCents = Math.round(Number(formule.prix) * 100)',
    garde: 'elle encaisse le prix du jour' },

  { nom: '🔴 le contrat reprend le prix du catalogue',
    banc: 'verif:abonnements', fichier: 'app/api/stripe/webhook/route.js',
    de: '  if (Number.isFinite(prixPaye) && prixPaye > 0) contrat.prix = prixPaye',
    vers: '',
    garde: 'le contrat garde le prix payé, pas celui du catalogue' },

  { nom: '🔴 la fiche annonce de nouveau le compte plein',
    banc: 'verif:abonnements', fichier: 'app/commander/rdv/[slug]/BlocAbonnements.js',
    de: '          const r = resumeFormulePublique(f, { achatLe: jourBruxelles() })',
    vers: '          const r = resumeFormulePublique(f)',
    garde: 'la vitrine de la fiche annonce l’offre du jour' },

  { nom: '🔴 le choix de la commercante ne s enregistre plus',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      prix_en_cours: form.type === 'periode' && form.prix_en_cours === PRIX_EN_COURS_FIXE ? PRIX_EN_COURS_FIXE : PRIX_EN_COURS_PRORATA,",
    vers: '',
    garde: 'la commerçante choisit prorata ou prix fixe' },

  // ─── QUI PEUT PRENDRE UNE FORMULE (trois réponses) ──────────────────────
  { nom: '🔴 plus proposee remet la formule en vente',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "            const choisir = (v) => setForm({ ...form, actif: v !== 'retiree', vente_en_ligne: v === 'en_ligne' })",
    vers: "            const choisir = (v) => setForm({ ...form, actif: v !== 'retiree', vente_en_ligne: v !== 'a_la_main' })",
    garde: 'chaque réponse écrit les deux colonnes ensemble' },

  { nom: '🔴 la combinaison trompeuse s enregistre de nouveau',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      vente_en_ligne: !!form.actif && !!form.vente_en_ligne,',
    vers: '      vente_en_ligne: !!form.vente_en_ligne,',
    garde: 'une formule plus proposée ne s’enregistre jamais « en vente »' },

  { nom: '⚠️ la carte dit de nouveau En vente sur une formule retiree',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                        const etiquette = f.actif === false',
    vers: '                        const etiquette = false',
    garde: 'la carte de la liste dit le même état' },

  // ─── PLUS D'ACOMPTE « SUR PLACE » ───────────────────────────────────────
  { nom: '🔴 la liste annonce de nouveau un acompte qui ne se paie pas en ligne',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                {p.acompte_pourcent > 0 && acompteEnLigneDispo && (',
    vers: '                                {p.acompte_pourcent > 0 && (',
    garde: 'la liste des prestations ne parle d’acompte que s’il se paie en ligne' },

  { nom: '🔴 la carte annonce de nouveau un acompte sur place',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                      {prestationChoisie.acompte_pourcent > 0 && !seanceSurAbo && acompteEnLigneDispo && (',
    vers: '                      {prestationChoisie.acompte_pourcent > 0 && !seanceSurAbo && (',
    garde: 'la carte du rendez-vous non plus' },

  { nom: '🔴 la commercante ne sait plus que son acompte n est pas demande',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '  const acompteEnLigneActif = commercant?.rdv_acompte_en_ligne_actif === true && compteEncaisse(commercant)',
    vers: '  const acompteEnLigneActif = true',
    garde: 'la commerçante sait, en le réglant, si son acompte est vraiment demandé' },

  // ─── LOT 2 · I9 : PRESTATION RETIRÉE, DATE TROP LOINTAINE ──────────────
  { nom: '🔴 une prestation supprimee se reserve encore',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "  if (prestation.deleted_at) return { ok: false, code: 'prestation_introuvable' }",
    vers: "  if (false) return { ok: false, code: 'prestation_introuvable' }",
    garde: 'une prestation supprimée ne se réserve plus, pour personne' },

  { nom: '🔴 deleted_at sort du select : la suppression redevient invisible',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: 'duree_paliers, quantite, actif, deleted_at, jointure_de',
    vers: 'duree_paliers, quantite, actif, jointure_de',
    garde: 'une prestation supprimée ne se réserve plus, pour personne' },

  { nom: '🔴 une prestation desactivee se reserve encore en ligne',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "  if (prestation.actif === false && champs?.source !== 'commercant') {",
    vers: '  if (false) {',
    garde: 'une prestation désactivée ne se réserve plus en ligne' },

  { nom: '⚠️ la commercante ne peut plus poser une prestation desactivee',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "  if (prestation.actif === false && champs?.source !== 'commercant') {",
    vers: '  if (prestation.actif === false) {',
    garde: 'la commerçante, elle, la pose encore dans son agenda' },

  { nom: '🔴 l horizon ne borne plus le serveur',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "    if (limite && dateRdv > limite) return { ok: false, code: 'hors_horizon' }",
    vers: "    if (false) return { ok: false, code: 'hors_horizon' }",
    garde: 'une date au-delà de l’horizon de la fiche est refusée' },

  { nom: '⚠️ l horizon du commerce sort du select : retombe sur 60 jours',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: '    .select(`${COLONNES_LIEU}, rdv_horizon_jours`)',
    vers: '    .select(COLONNES_LIEU)',
    garde: 'l’horizon est celui que la commerçante a réglé' },

  { nom: '🔴 les deux refus se rejouent au lieu de se rembourser',
    banc: 'verif:tunnel-rdv', fichier: 'lib/refus-reservation.js',
    de: "  'prestation_inactive', 'hors_horizon',",
    vers: '',
    garde: 'les deux refus se remboursent après un paiement' },

  // ─── LOT 3 · AUDIT 1 I8 : « INSCRIRE » DEPUIS UN COURS ──────────────────
  { nom: '🔴 inscrire depuis un cours ouvre de nouveau une saisie sans le cours',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/AgendaRdv.js',
    de: '                    onNouveauRdv(jour, heure, coursId)',
    vers: '                    onNouveauRdv(jour, heure)',
    garde: 'le panneau d’un cours passe le cours à la saisie' },

  // ─── LOT 3 · AUDIT 3 I9 : UN ABONNEMENT PAYÉ QUI NE NAÎT PAS ────────────
  { nom: '🔴 une panne d ecriture du contrat repond 200 : rien ne rejoue',
    banc: 'verif:abonnements', fichier: 'app/api/stripe/webhook/route.js',
    de: '    throw new Error(`insert abonnement KO : ${error.message || error.code}`)',
    vers: '    return',
    garde: 'une panne d’écriture du contrat se rejoue' },

  { nom: '🔴 une formule introuvable se tait de nouveau',
    banc: 'verif:abonnements', fichier: 'app/api/stripe/webhook/route.js',
    de: "    await alerterAbonnementPerdu(paymentIntent, 'formule introuvable')",
    vers: '',
    garde: 'et chaque contrat qui ne peut pas naître alerte l’administration' },

  // ─── LOT 3 · AUDIT 2 I10 : LES REFUS D'UNE SÉANCE SUR ABONNEMENT ───────
  { nom: '🔴 une session expiree retombe dans « reessaie »',
    banc: 'verif:abonnements', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "              const m = messageRefusAbonnement(j?.error === 'session_perdue' || res.status === 401 ? 'session_perdue' : j?.error, { nomCommerce: commercant.nom })",
    vers: '              const m = messageRefusAbonnement(j?.error, { nomCommerce: commercant.nom })',
    garde: 'la fiche reconnaît la session perdue' },

  { nom: '⚠️ un cours qui n a pas lieu ne renvoie plus a la grille',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: "      return { texte: 'Ce cours n’a pas lieu à cette heure-là. Choisis un autre horaire.', retourGrille: true }",
    vers: "      return { texte: 'Ce cours n’a pas lieu à cette heure-là. Choisis un autre horaire.', retourGrille: false }",
    garde: 'un cours qui n’a pas lieu renvoie choisir une autre heure' },

  // ─── LOT 3 · ANNUL-I5 : LE REFUS HORS DÉLAI ─────────────────────────────
  { nom: '🔴 le refus hors delai ne donne plus le numero du commerce',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/cancel/route.js',
    de: "      const telephone = commercant?.telephone ? ` au ${commercant.telephone}` : ''",
    vers: "      const telephone = ''",
    garde: 'le refus hors délai dit le jour du rendez-vous et le numéro du commerce' },

  { nom: '⚠️ le refus hors delai repasse par un alert()',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/page.js',
    de: "        informer('Annulation impossible en ligne', a.error)",
    vers: '        alert(`Annulation impossible : ${a.error}`)',
    garde: 'et il s’affiche dans la fenêtre de l’application' },

  // ─── LOT 3 · ANNUL-I4 : LA NOTIFICATION D'ANNULATION DU STUDIO ──────────
  { nom: '🔴 le client annule par le studio ne recoit plus de notification',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '      if (pourQui) {',
    vers: '      if (false) {',
    garde: 'le client annulé par le studio reçoit une notification' },

  { nom: '⚠️ le client sans fiche n est plus retrouve par son adresse',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '      if (!pourQui && rdv.client_email) {',
    vers: '      if (false) {',
    garde: 'retrouvé par son adresse quand le rendez-vous n’a pas de fiche' },

  // ─── LOT 3 · AUDIT 3 I8 : PAS DE VENTE SANS COMPTE QUI ENCAISSE ─────────
  { nom: '🔴 la fiche propose d acheter un abonnement que le serveur refusera',
    banc: 'verif:abonnements', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '              {etape === 1 && formulesAbo.length > 0 && commercant?.stripe_account_charges_enabled === true && (',
    vers: '              {etape === 1 && formulesAbo.length > 0 && (',
    garde: 'la fiche ne propose l’achat que si le compte encaisse' },

  // ─── LOT 3 · AUDIT 2 C1 : UN PAIEMENT QUI NE DÉMARRE PAS ────────────────
  { nom: '🔴 une panne reseau ressort en anglais technique',
    banc: 'verif:tunnel-rdv', fichier: 'lib/refus-reservation.js',
    de: '  if (erreur?.duServeur && phrase) return phrase',
    vers: '  if (phrase) return phrase',
    garde: 'une panne réseau ne sort plus en anglais technique' },

  { nom: '⚠️ la phrase du serveur n est plus reconnue : remplacee par le message generique',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "          if (!j.ok || !j.url) throw Object.assign(new Error(j.error || ''), { duServeur: Boolean(j.error) })",
    vers: "          if (!j.ok || !j.url) throw new Error(j.error || '')",
    garde: 'la fiche n’affiche plus aucun message brut de paiement' },

  // ─── LOT 3 · AUDIT 2 C4 ET ANNUL-C3 : CE QUE PROMET LA CONFIRMATION ────
  { nom: '🔴 le rappel de la veille se promet meme reserve trop tard',
    banc: 'verif:tunnel-rdv', fichier: 'lib/timezone.js',
    de: '  return Number.isFinite(ref) && ref < passage.getTime()',
    vers: '  return Number.isFinite(ref)',
    garde: 'réservé après : il ne partira pas' },

  { nom: '🔴 la fiche ne dit plus a l ecran si le rappel partira',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                            rappelVeille: rappelDeLaVeillePartira(rdvCree?.date_rdv),',
    vers: '',
    garde: 'la fiche dit à l’écran si le rappel partira' },

  { nom: '⚠️ la confirmation promet de nouveau de « reporter »',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                      Tu pourras annuler jusqu&apos;à {delaiAnnulationHeures(commercant)}h {mots.avant}.',
    vers: '                      Tu pourras annuler ou reporter jusqu&apos;à {delaiAnnulationHeures(commercant)}h {mots.avant}.',
    garde: 'et ne promet plus de « reporter »' },

  // ─── LOT 3 · AUDIT 2 C2 : LA PAGE STRIPE ────────────────────────────────
  { nom: '⚠️ la page Stripe repasse au tiret cadratin',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-abonnement/route.js',
    de: '            name: `${formule.libelle} · ${commercant.nom}`,',
    vers: '            name: `${formule.libelle} — ${commercant.nom}`,',
    garde: 'create-abonnement : aucun tiret cadratin sur la page de paiement' },

  { nom: '⚠️ la page Stripe repasse a la date technique',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '            description: `${commercant.nom} · le ${jourLisible(date_rdv) || date_rdv} à ${heure_debut.slice(0,5)} · ${duree_minutes} min`,',
    vers: '            description: `${commercant.nom} · ${date_rdv} à ${heure_debut.slice(0,5)} · ${duree_minutes} min`,',
    garde: 'create-rdv-acompte : aucune date technique sur la page de paiement' },

  // ─── LOT 3 · AUDIT 1 I16 : LES LIENS PROFESSEUR-PRESTATION ──────────────
  { nom: '🔴 une insertion ratee des professeurs se dit « mise a jour »',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      if (errJ) { liensRates = true; console.error('[TabRdvPrestations] junction insert error', errJ) }",
    vers: "      if (errJ) { console.error('[TabRdvPrestations] junction insert error', errJ) }",
    garde: 'et un échec se dit, au lieu de « Prestation mise à jour »' },

  // ─── LOT 3 · AUDIT 1 I13 : « PAIEMENT SUR PLACE » ───────────────────────
  { nom: '⚠️ l option paiement sur place ne previent plus les commerces de rendez-vous',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/TabPaiements.js',
    de: "              {commercant.categorie === 'vitrine' && ' Tes rendez-vous ne sont pas concernés : ils se règlent sur place, sauf l’acompte en ligne que tu demandes plus haut.'}",
    vers: '',
    garde: 'et dit aux commerces de rendez-vous qu’elle ne les concerne pas' },

  // ─── LOT 3 · ANNUL-I1 : LE STUDIO APPREND L'ÉCHEC DU REMBOURSEMENT ─────
  { nom: '🔴 un remboursement rate n alerte plus le studio',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/cancel/route.js',
    de: '    if (refundError && commercant?.email) {',
    vers: '    if (false) {',
    garde: 'la route l’envoie dès que le remboursement échoue' },

  { nom: '⚠️ l alerte de remboursement tait le montant',
    banc: 'verif:tunnel-rdv', fichier: 'lib/resend.js',
    de: "    intro: `<strong>${echapperHtml(client) || 'Un client'}</strong> vient d’annuler son rendez-vous à temps, mais le remboursement automatique de <strong>${euros(Number(montant) || 0)}</strong> a échoué.`,",
    vers: "    intro: `<strong>${echapperHtml(client) || 'Un client'}</strong> vient d’annuler son rendez-vous à temps, mais le remboursement automatique a échoué.`,",
    garde: 'la commerçante lit le montant à rembourser' },

  // ─── LOT 3 · AUDIT 2 I14 : LE RAPPEL DE LA VEILLE ET LE BON ────────────
  { nom: '🔴 le rappel de la veille oublie de nouveau le bon cadeau',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/cron/rdv-reminder-9h/route.js',
    de: '        bon_cadeau_montant,',
    vers: '',
    garde: 'le rappel de la veille charge bon_cadeau_montant' },

  // ─── LOT 3 · AUDIT 1 I6 : UNE PLAGE QUI NE COLLE PAS À SON COURS ───────
  // ⚠️ REPOINTÉES LE 04/10 : la règle a changé (séances bout à bout).
  { nom: '🔴 une plage trop courte pour son cours se tait',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '  if (longueur < duree) return { tropCourte: true, longueur, duree, departs: [], reste: 0, finIdeale: minutesToTime(d + duree) }',
    vers: '  if (false) return { tropCourte: true, longueur, duree, departs: [], reste: 0, finIdeale: minutesToTime(d + duree) }',
    garde: 'une plage plus courte que son cours dit qu’il ne sera jamais proposé' },

  { nom: '🔴 l avertissement compte de nouveau des departs qui se chevauchent',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '  const p = Math.max(Number(pas) > 0 ? Number(pas) : 15, duree)',
    vers: '  const p = Number(pas) > 0 ? Number(pas) : 15',
    garde: 'une plage plus longue que son cours dit sa séance' },

  { nom: '🔴 le formulaire de plage ne previent plus',
    banc: 'verif:slots', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                  if (!e || (!e.tropCourte && e.reste < 15)) return null',
    vers: '                  return null',
    garde: 'l’écran le dit pendant le réglage de la plage' },

  // ─── 04/10 · Q5 : LES SÉANCES D'UN COURS SE SUIVENT BOUT À BOUT ─────────
  { nom: '🔴 la grille propose de nouveau 18:15, 18:30 et 18:45 pour un meme cours',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '    const seancesCours = cadenceDuCours(cr, prestationId, liaisonsCreneaux, { estCours, dureeMinutes })',
    vers: '    const seancesCours = null',
    garde: 'le cours de 60 min sur 18:15-19:45 n’est proposé qu’à 18:15' },

  { nom: '🔴 le serveur accepte de nouveau le cours a 18:30',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '    && departSurLaCadence(cadenceDuCours(c, prestationId, liaisons, { estCours, dureeMinutes: f - d }), d))',
    vers: '    && true)',
    garde: 'le serveur refuse le cours à 18:30' },

  { nom: '🔴 la cadence ignore la duree : les seances se chevauchent',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '  return { origine, pas: Math.max(pasPlage, duree) }',
    vers: '  return { origine, pas: pasPlage }',
    garde: 'le cours de 60 min sur 18:15-19:45 n’est proposé qu’à 18:15' },

  { nom: '🔴 la cadence s impose a une plage qui ne nomme pas ce cours',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '  if (!nomme) return null',
    vers: '',
    garde: 'une plage qui ne nomme pas ce cours ne lui impose rien' },

  { nom: '🔴 la cadence s impose a un rendez-vous individuel',
    banc: 'verif:slots', fichier: 'lib/rdv-slots.js',
    de: '  if (!estCours || !creneau || !prestationId || !Array.isArray(liaisons)) return null',
    vers: '  if (!creneau || !prestationId || !Array.isArray(liaisons)) return null',
    garde: 'un rendez-vous individuel garde toute la grille de sa plage' },

  { nom: '🔴 le pas de la plage quitte le select du serveur',
    banc: 'verif:slots', fichier: CREATION,
    de: "pause_debut, pause_fin, actif, praticien_id, lieu_id, pas_minutes')",
    vers: "pause_debut, pause_fin, actif, praticien_id, lieu_id')",
    garde: 'le serveur lit le pas de la plage' },

  // ─── LOT 3 · AUDIT 1 I15 : SUPPRIMER UNE PLAGE QUI PORTE DES RDV ────────
  { nom: '🔴 la plage d une prof compte les rendez-vous de toutes',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    de: "    return plage.praticien_id == null || String(r.praticien_id ?? '') === String(plage.praticien_id)",
    vers: '    return true',
    garde: 'supprimer une plage dit ce qu’elle porte encore' },

  { nom: '⚠️ la plage compte le rendez-vous qui commence a sa fin',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    de: '    if (!(h >= debut && h < fin)) return false',
    vers: '    if (!(h >= debut && h <= fin)) return false',
    garde: 'supprimer une plage dit ce qu’elle porte encore' },

  { nom: '🔴 supprimer une plage se tait de nouveau sur ses rendez-vous',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '    const poses = rdvsSurLaPlage(avenir || [], c, { aujourdhui: jourBruxelles() })',
    vers: '    const poses = []',
    garde: 'la suppression d’une plage compte ses rendez-vous' },

  // ─── LOT 3 · AUDIT 1 I4 : « DÉJÀ PAYÉ » DIT PAR QUEL MOYEN ──────────────
  { nom: '🔴 deja paye sans moyen s ecrit de nouveau « sur place »',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    if (insc.paye && !insc.mode_paiement) return toast('Dis comment tu as été payé : terminal, espèces ou virement', 'error')",
    vers: '',
    garde: 'un contrat « déjà payé » exige son moyen de paiement' },

  // ─── LOT 3 · AUDIT 3 I4 : UN ABONNEMENT À VENIR ─────────────────────────
  { nom: '🔴 un abonnement achete pour le mois prochain se dit « Termine »',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: '  if (etat.aVenir) {',
    vers: '  if (false) {',
    garde: 'acheté ce matin pour le mois prochain : la carte dit quand il commence' },

  // ─── LOT 3 · LA-07 : NI COURS RETIRÉ, NI JOUR FERMÉ ─────────────────────
  { nom: '🔴 la file est prevenue pour un cours retire',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "    if (prestation.actif === false || prestation.deleted_at) return { ok: true, prevenus: 0, file: 0, raison: 'prestation_retiree' }",
    vers: "    if (false) return { ok: true, prevenus: 0, file: 0, raison: 'prestation_retiree' }",
    garde: 'un cours retiré ne fait prévenir personne' },

  { nom: '🔴 la file est prevenue pendant les conges',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    // ⚠️ ANCRE REPOINTÉE LE 04/10 : la règle reçoit aussi le cours et l'heure.
    de: "    if (fermetureQuiBloque(fermetures, { dateStr: dateRdv, praticienId: null, prestationId, heure: heureDebut })) return { ok: true, prevenus: 0, file: 0, raison: 'jour_ferme' }",
    vers: "    if (false) return { ok: true, prevenus: 0, file: 0, raison: 'jour_ferme' }",
    garde: 'un jour fermé ne fait prévenir personne' },

  // ─── LOT 3 · UNE SÉANCE D'ABONNEMENT EST DÉJÀ PAYÉE ─────────────────────
  { nom: '🔴 l email redit « Prix 0,00 € » a une abonnee',
    banc: 'verif:abonnements', fichier: 'lib/resend.js',
    de: '        ${seance_abonnement',
    vers: '        ${false',
    garde: 'l’email d’une séance d’abonnement dit « compris dans ton abonnement »' },

  { nom: '🔴 la route ne dit plus a l email que c est une seance d abonnement',
    banc: 'verif:abonnements', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '          seance_abonnement:       !!rdv.abonnement_id,',
    vers: '',
    garde: 'la route lit le contrat et le passe à l’email' },

  { nom: '⚠️ le calendrier de l abonnee annonce « Prix : 0,00 € »',
    banc: 'verif:abonnements', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '          prix_estime: rdv.abonnement_id ? null : rdv.prix_estime,',
    vers: '          prix_estime: rdv.prix_estime,',
    garde: 'la route lit le contrat et le passe à l’email' },

  { nom: '🔴 le recap redit « tu regles sur place » a une abonnee',
    banc: 'verif:abonnements', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "                                  ? 'Séance comprise dans ton abonnement : rien à régler, ni maintenant ni sur place.'",
    vers: "                                  ? 'Rien à payer maintenant, tu règles sur place.'",
    garde: 'le récap de la fiche ne dit plus « tu règles sur place »' },

  { nom: '🔴 la confirmation redit « acompte sur place »',
    banc: 'verif:abonnements', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                    {Number(rdvCree.acompte_montant) > 0 && rdvCree._viaStripe && (',
    vers: '                    {Number(rdvCree.acompte_montant) > 0 && (',
    garde: 'l’écran de confirmation ne parle d’acompte que payé en ligne' },

  // ─── LOT 3 · ANNUL-I8 : UNE ANNULATION, UN REMBOURSEMENT, UN EMAIL ─────
  { nom: '🔴 le studio rembourse deux fois sur un double tap',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '          }, { stripeAccount: rdv.commercant.stripe_account_id, idempotencyKey: cleRemboursementRdv(rdv.id) })',
    vers: '          }, { stripeAccount: rdv.commercant.stripe_account_id })',
    garde: 'le studio : un seul remboursement par rendez-vous' },

  { nom: '🔴 le client rembourse deux fois sur un double tap',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/cancel/route.js',
    de: '          idempotencyKey: cleRemboursementRdv(rdv.id),',
    vers: '',
    garde: 'le client : un seul remboursement par rendez-vous' },

  { nom: '🔴 deux annulations du studio ecrivent toutes les deux',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: "      .eq('id', rdv.id).eq('statut', rdv.statut).select('id')",
    vers: "      .eq('id', rdv.id).select('id')",
    garde: 'le studio : le statut ne s’écrit que s’il n’a pas changé' },

  { nom: '🔴 deux annulations du client ecrivent toutes les deux',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/cancel/route.js',
    de: "      .eq('statut', rdv.statut)",
    vers: '',
    garde: 'le client : le statut ne s’écrit que s’il n’a pas changé' },

  { nom: '⚠️ le tableau de bord renvoie l email d une annulation deja faite',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/page.js',
    de: '      if (j.already_canceled) return true',
    vers: '',
    garde: 'le tableau de bord ne renvoie pas l’email' },

  { nom: '⚠️ le Poste renvoie l email d une annulation deja faite',
    banc: 'verif:tunnel-rdv', fichier: 'app/equipe/PosteEquipe.js',
    de: "      if (j.already_canceled) { dire('Cette réservation était déjà annulée'); return }",
    vers: '',
    garde: 'le Poste équipe non plus' },

  // ─── LOT 2 · LES BOUTONS « ENREGISTREMENT… » QUI TRAVAILLENT ───────────
  { nom: '⚠️ un bouton redit « Enregistrement… » sans les points',
    banc: 'verif:logique', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "{saving ? <EnCours /> : (editId ? 'Enregistrer' : 'Créer la fermeture')}",
    vers: "{saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Créer la fermeture')}",
    garde: 'aucun bouton du tableau de bord ne dit « Enregistrement… » sans les points' },

  { nom: '⚠️ les points disparaissent du composant',
    banc: 'verif:logique', fichier: 'app/dashboard/EnCours.js',
    de: '      <DotsAttente couleur="currentColor" taille={5} label={texte} />',
    vers: '',
    garde: 'et ces points sont ceux du logo' },

  // ─── LOT 2 · I12 : LA FILE CÔTÉ COMMERÇANTE ; LA-03 ─────────────────────
  { nom: '🔴 un second declenchement reprevient toute la file',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: '      .filter(l => !dejaPrevenueEnCours(l, maintenantMs))',
    vers: '      .filter(() => true)',
    garde: 'un second déclenchement ne reprévient pas' },

  { nom: '🔴 le bouton previent la file d un cours complet',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "  if ((inscrits || []).length >= Number(prestation.capacite)) return { ok: false, error: 'complet' }",
    vers: "  if (false) return { ok: false, error: 'complet' }",
    garde: 'le bouton refuse sur un cours encore complet' },

  { nom: '⚠️ le bouton previent pendant le cours',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "  if (creneauDejaCommence(dateRdv, heure, maintenant)) return { ok: false, error: 'seance_passee' }",
    vers: "  if (false) return { ok: false, error: 'seance_passee' }",
    garde: 'un cours commencé ne se prévient plus' },

  { nom: '⚠️ le bouton previent un rendez-vous individuel',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "  if (prestation.par_couverts === true || porteeDe(prestation) !== PORTEE_SEANCE) return { ok: false, error: 'pas_un_cours' }",
    vers: "  if (false) return { ok: false, error: 'pas_un_cours' }",
    garde: 'seul un cours collectif se prévient d’un bouton' },

  { nom: '🔴 la commercante recoit l identite de ceux qui attendent',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: ".select('prestation_id, portee, date_rdv, heure_debut, date_debut, date_fin, statut')",
    vers: ".select('prestation_id, portee, date_rdv, heure_debut, date_debut, date_fin, statut, client_id')",
    garde: 'aucun nom ni contact ne sort pour la commerçante' },

  { nom: '⚠️ les attentes expirees se comptent encore',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: '    if (!attenteVivante(l, jourISO)) continue',
    vers: '    void 0',
    garde: 'vivants seulement' },

  { nom: '🔴 prevenir lit le commerce dans le corps de la requete',
    banc: 'verif:attente', fichier: 'app/api/rdv/attente-commerce/route.js',
    de: "      const garde = await gardeLigneEquipe(request, admin, 'rdv_prestations', corps?.prestation_id, 'agenda')",
    vers: "      const garde = await gardeEquipe(request, admin, corps?.commercant_id, 'agenda')",
    garde: 'prévenir lit le commerce DANS la prestation' },

  { nom: '⚠️ le bouton de la file s affiche sur un cours complet',
    banc: 'verif:attente', fichier: 'app/dashboard/AgendaRdv.js',
    de: '                  {onPrevenirFile && avenir && libres > 0 && (',
    vers: '                  {onPrevenirFile && (',
    garde: 'le panneau d’un cours dit combien attendent' },

  // ─── LOT 2 · RÉSILIER UN ABONNEMENT PAR LE SERVEUR ─────────────────────
  { nom: '🔴 la resiliation annule la seance deja donnee le matin',
    banc: 'verif:abonnements', fichier: 'lib/abonnements.js',
    de: "    r && r.statut === 'confirme' && !r.deleted_at && !commencee(r.date_rdv, String(r.heure_debut || '').slice(0, 5)))",
    vers: "    r && r.statut === 'confirme' && !r.deleted_at)",
    garde: 'la résiliation n’annule que les séances qui n’ont pas commencé' },

  { nom: '🔴 deux clics font deux resiliations et deux emails',
    banc: 'verif:abonnements', fichier: 'app/api/rdv/resilier-abonnement/route.js',
    de: "      .eq('statut', contrat.statut)",
    vers: '',
    garde: 'un seul gagnant' },

  { nom: '🔴 un membre sans la case Argent resilie un contrat',
    banc: 'verif:abonnements', fichier: 'app/api/rdv/resilier-abonnement/route.js',
    de: "    const verdict = await gardeLigneEquipe(request, supabase, 'abonnements', abonnement_id, 'argent')",
    vers: "    const verdict = await gardeLigneEquipe(request, supabase, 'abonnements', abonnement_id, 'agenda')",
    garde: 'la route garde le geste derrière la case Argent' },

  { nom: '🔴 les rappels partent encore pour des seances annulees',
    banc: 'verif:abonnements', fichier: 'app/api/rdv/resilier-abonnement/route.js',
    de: '        if (s.rappel_push_id) {',
    vers: '        if (false) {',
    garde: 'leurs rappels de la veille sont coupés' },

  { nom: '🔴 le prenom tape par la cliente part en HTML',
    banc: 'verif:abonnements', fichier: 'lib/resend.js',
    de: "    intro: `${yopper_prenom ? `${echapperHtml(yopper_prenom)}, ton` : 'Ton'} abonnement${formule",
    vers: "    intro: `${yopper_prenom ? `${yopper_prenom}, ton` : 'Ton'} abonnement${formule",
    garde: 'ce qu’elle a tapé ne devient jamais du HTML' },

  { nom: '🔴 le tableau de bord resilie de nouveau lui-meme',
    banc: 'verif:abonnements', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "    const res = await postPro('/api/rdv/resilier-abonnement', { abonnement_id: a.id })",
    vers: "    const res = await supabase.from('abonnements').update({ statut: 'resilie' }).eq('id', a.id)",
    garde: 'le tableau de bord ne résilie plus lui-même' },

  // ─── LOT 2 · « À REMBOURSER » ALORS QUE C'ÉTAIT FAIT ────────────────────
  { nom: '🔴 un acompte rembourse par Yoppaa se redit « a rembourser »',
    banc: 'verif:logique', fichier: 'lib/rdv-paiement.js',
    de: "    if (acomptePaye && statut !== 'no_show' && rdv.stripe_refund_id && rembourse !== null && rembourse > 0) {",
    vers: '    if (false) {',
    garde: 'un acompte déjà remboursé se dit remboursé' },

  { nom: '🔴 un no-show se dit rembourse',
    banc: 'verif:logique', fichier: 'lib/rdv-paiement.js',
    de: "    if (acomptePaye && statut !== 'no_show' && rdv.stripe_refund_id && rembourse !== null && rembourse > 0) {",
    vers: '    if (acomptePaye && rdv.stripe_refund_id && rembourse !== null && rembourse > 0) {',
    garde: 'un no-show ne se dit jamais remboursé' },

  { nom: '⚠️ un remboursement partiel se dit complet',
    banc: 'verif:logique', fichier: 'lib/rdv-paiement.js',
    de: '      const partiel = rembourse < acompte - 0.005',
    vers: '      const partiel = false',
    garde: 'un remboursement partiel dit ce qui a été rendu' },

  // ─── LOT 2 · B2 ET B1 : FERMETURES, AGENDA, COURS ANNULÉ ───────────────
  { nom: '🔴 l absence d une praticienne rattrape les rendez-vous de toutes',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    // ⚠️ ANCRE REPOINTÉE LE 04/10 : la séance fermée a sa propre branche.
    de: '      : (fermeture.praticien_id == null || (r.praticien_id != null && String(r.praticien_id) === String(fermeture.praticien_id)))))',
    vers: '      : true))',
    garde: 'l’absence d’une praticienne ne rattrape que les siens' },

  { nom: '⚠️ une fermeture rattrape aussi les annules et les honores',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    de: "    r && r.statut === 'confirme' && !r.deleted_at",
    vers: '    r && !r.deleted_at',
    garde: 'ni un rendez-vous annulé, ni un rendez-vous déjà honoré' },

  { nom: '🔴 l agenda ne grise plus les fermetures',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/AgendaRdv.js',
    de: "    if (fermetureQuiBloque(fermetures, { dateStr: jour.iso, praticienId: praticienFiltre === 'all' ? null : praticienFiltre })) return 'conge'",
    vers: '    void 0',
    garde: 'l’agenda grise les fermetures' },

  { nom: '⚠️ on peut annuler un cours deja passe',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/AgendaRdv.js',
    de: '            {onAnnulerSeance && seanceOuverte.jourDate && isoDate(seanceOuverte.jourDate) >= isoDate(today) && (() => {',
    vers: '            {onAnnulerSeance && seanceOuverte.jourDate && (() => {',
    garde: 'un cours entier s’annule d’un geste' },

  { nom: '🔴 le tableau de bord ne passe plus les fermetures a l agenda',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/page.js',
    de: '                    fermetures={fermeturesRdv}',
    vers: '',
    garde: 'le tableau de bord charge les fermetures' },

  { nom: '🔴 annuler un cours contourne l annulation unitaire : ni remboursement ni email',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/page.js',
    de: "      const ok = await changerStatutRdv(rdv.id, 'annule_commercant', 'commercant', {",
    vers: "      const ok = await Promise.resolve(rdv.id, 'annule_commercant', 'commercant', {",
    garde: 'chaque inscrite passe par l’annulation unitaire' },

  { nom: '🔴 la fermeture se referme en silence sur des rendez-vous pris',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '    if (restent.length > 0) setApres({ touches: restent })',
    vers: '    if (false) setApres({ touches: restent })',
    garde: 'et propose de les annuler au lieu de se refermer en silence' },

  { nom: '⚠️ la fermeture liste des rendez-vous qu elle ne touche pas',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      .then(({ data }) => { if (vivant) setTouches(rdvsSousLaFermeture(data || [], ferm)) })',
    vers: '      .then(({ data }) => { if (vivant) setTouches(data || []) })',
    garde: 'la fermeture montre les rendez-vous qu’elle rattrape' },

  // ⚠️ REPOINTÉE LE 04/10 (question 1) : le cours se ferme désormais.
  { nom: '🔴 la question d annulation tait ce qui arrive au cours en ligne',
    banc: 'verif:tunnel-rdv', fichier: 'lib/confirmation-rdv.js',
    de: "    details: 'Le cours est aussi fermé à la réservation en ligne. Si c’est toute ta journée qui saute, ajoute plutôt une fermeture dans Paramètres : elle bloque les réservations et te propose d’annuler les rendez-vous déjà pris.',",
    vers: "    details: 'Les places sont libérées.',",
    garde: 'et elle dit que le cours se ferme aussi à la réservation en ligne' },

  // ─── 04/10 · Q1 : FERMER UNE SÉANCE ─────────────────────────────────────
  { nom: '🔴 une seance fermee bloque toute la journee',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    de: '      continue',
    vers: '      return f',
    garde: 'et rien d’autre : une autre heure, un autre cours, la journée' },
  { nom: '🔴 une seance fermee ne bloque plus rien',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    de: '        && hhmm(heure).length === 5 && hhmm(f.heure_debut) === hhmm(heure)) return f',
    vers: '        && false) return f',
    garde: 'un cours annulé bloque CE cours à CETTE heure' },
  { nom: '🔴 l agenda affiche Ferme sur la journee d un cours annule',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    de: '  return (fermetures || []).filter(f => !estFermetureDeSeance(f) && couvre(f, dateStr))',
    vers: '  return (fermetures || []).filter(f => couvre(f, dateStr))',
    garde: 'l’agenda ne lit pas un cours annulé comme une journée fermée' },
  { nom: '⚠️ un cours annule ferme toutes les plages du jour',
    banc: 'verif:tunnel-rdv', fichier: 'lib/fermetures-rdv.js',
    de: '  const ferme = (fermetures || []).filter(f => !estFermetureDeSeance(f) && couvre(f, dateStr))',
    vers: '  const ferme = (fermetures || []).filter(f => couvre(f, dateStr))',
    garde: 'et aucune plage ne se ferme pour lui' },
  { nom: '🔴 le serveur ne lit plus le cours de la fermeture : un cours annule se reserve',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "      .select('date_debut, date_fin, praticien_id, prestation_id, heure_debut')",
    vers: "      .select('date_debut, date_fin, praticien_id')",
    garde: 'un cours annulé se refuse en ligne' },
  { nom: '⚠️ un cours annule se dit « jour ferme »',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "      return { ok: false, code: estFermetureDeSeance(fermeture) ? 'seance_fermee' : 'jour_ferme' }",
    vers: "      return { ok: false, code: 'jour_ferme' }",
    garde: 'un cours annulé se refuse en ligne, avec son propre motif' },
  { nom: '🔴 la saisie au comptoir lit un cours annule comme une journee fermee',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: "      .select('date_debut, date_fin, praticien_id, prestation_id, heure_debut')",
    vers: "      .select('date_debut, date_fin, praticien_id')",
    garde: 'app/dashboard/ModalNouveauRdv.js lit la fermeture d’une séance' },
  { nom: '🔴 l agenda lit un cours annule comme une journee fermee',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/page.js',
    de: "      .select('id, date_debut, date_fin, praticien_id, motif, prestation_id, heure_debut')",
    vers: "      .select('id, date_debut, date_fin, praticien_id, motif')",
    garde: 'app/dashboard/page.js lit la fermeture d’une séance' },
  { nom: '🔴 la fiche propose encore le cours annule',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '        .filter(s => !seanceFermee(fermetures, { dateStr, prestationId: prestationChoisie?.id, heure: s.heure }))',
    vers: '        .filter(Boolean)',
    garde: 'la fiche retire la séance fermée de la grille ET des pastilles' },
  { nom: '🔴 « Annuler ce cours » desinscrit sans fermer',
    banc: 'verif:tunnel-rdv', fichier: 'app/dashboard/page.js',
    de: "    const { error: errFermeture } = await supabase.from('rdv_fermetures').insert({",
    vers: "    const { error: errFermeture } = await Promise.resolve({ error: null }); void ({",
    garde: '« Annuler ce cours » ferme la séance AVANT de désinscrire' },
  { nom: '⚠️ une fermeture du cours ratee se tait',
    banc: 'verif:tunnel-rdv', fichier: 'lib/confirmation-rdv.js',
    de: '  if (!rendezVous && coursFerme === false) {',
    vers: '  if (false) {',
    garde: 'une fermeture du cours ratée se dit' },
  { nom: '⚠️ un cours annule tombe dans le message generique',
    banc: 'verif:tunnel-rdv', fichier: 'lib/refus-reservation.js',
    de: "  if (code === 'seance_fermee') {",
    vers: '  if (false) {',
    garde: 'le refus d’un cours annulé renvoie à la grille' },

  // ─── 04/10 · Q7 : LE CALENDRIER LIT TOUTES SES PAGES ────────────────────
  { nom: '🔴 le calendrier ne lit plus que les 1 000 premieres reservations',
    banc: 'verif:tunnel-rdv', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "      const { data, error } = await toutesLesLignes(() => supabase.rpc('rdv_slots_busy_range', {",
    vers: "      const { data, error } = await (() => supabase.rpc('rdv_slots_busy_range', {",
    garde: 'le calendrier à pastilles lit toutes les réservations' },

  { nom: '🔴 un remboursement rate ne se dit plus',
    banc: 'verif:tunnel-rdv', fichier: 'lib/confirmation-rdv.js',
    de: '  if (remboursementsRates > 0) {',
    vers: '  if (false) {',
    garde: 'et un remboursement raté se dit' },

  { nom: '🔴 l email d annulation des fermetures perd une information',
    banc: 'verif:equipe', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '        nb_bons: j.nb_bons,',
    vers: '',
    garde: 'les fermetures disent la même chose que le tableau de bord' },

  // ─── LOT 2 · B3 : LE PLAFOND SILENCIEUX DES MILLE LIGNES ───────────────
  { nom: '🔴 le lecteur s arrete a la premiere page : mille lignes au plus',
    banc: 'verif:logique', fichier: 'lib/toutes-les-lignes.js',
    de: '    if (lot.length < taille) return { data: lignes, error: null }',
    vers: '    return { data: lignes, error: null }',
    garde: '2 500 réservations se lisent toutes, en trois pages' },

  { nom: '🔴 une page en echec rend la moitie de l agenda comme si c etait tout',
    banc: 'verif:logique', fichier: 'lib/toutes-les-lignes.js',
    de: '    if (error) return { data: null, error }',
    vers: '    if (error) return { data: lignes, error: null }',
    garde: 'une page en échec ne rend PAS la moitié de l’agenda' },

  { nom: '🔴 le releve de l agenda repasse a mille lignes',
    banc: 'verif:logique', fichier: 'app/dashboard/page.js',
    de: '      const { data: rdvsData } = await toutesLesLignes(() => supabase',
    vers: '      const { data: rdvsData } = await (() => supabase',
    garde: 'l’agenda du tableau de bord lit toutes ses réservations' },

  { nom: '⚠️ l ordre de l agenda n est plus total : des pages se chevauchent',
    banc: 'verif:logique', fichier: 'app/dashboard/page.js',
    de: "        .order('id', { ascending: true })),",
    vers: '        ),',
    garde: 'dans un ordre total, pour que les pages ne se chevauchent pas' },

  { nom: '🔴 les soldes des abonnes se calculent sur mille seances',
    banc: 'verif:logique', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      toutesLesLignes(() => supabase.from('rdv_reservations').select('abonnement_id, statut, date_rdv')",
    vers: "      (() => supabase.from('rdv_reservations').select('abonnement_id, statut, date_rdv')",
    garde: 'la liste des abonnés compte toutes leurs séances' },

  { nom: '🔴 le solde a l inscription se calcule sur mille seances',
    banc: 'verif:logique', fichier: 'app/dashboard/ModalNouveauRdv.js',
    de: '        const { data } = await toutesLesLignes(() => supabase',
    vers: '        const { data } = await (() => supabase',
    garde: 'le solde affiché à l’inscription aussi' },

  // ─── LOT 2 · LA-08 ET LA-10 ────────────────────────────────────────────
  { nom: '🔴 une fenetre expiree verrouille de nouveau a vie',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: '  if (ligne.portee === PORTEE_FENETRE) {',
    vers: '  if (false) {',
    garde: 'une fenêtre expirée ne verrouille plus : la réinscription passe' },

  { nom: '🔴 la purge efface les fenetres expirees des autres',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "      .eq('client_id', clientId)",
    vers: "      .neq('client_id', '')",
    garde: 'et seule SA fenêtre expirée s’efface' },

  { nom: '🔴 la purge efface aussi une fenetre encore ouverte',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "      .lt('date_fin', jour)",
    vers: "      .neq('date_fin', '')",
    garde: 'une fenêtre encore ouverte reste « déjà inscrit »' },

  { nom: '⚠️ une attente expiree compte encore comme deja inscrit',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: '    && (jourISO === null || attenteVivante(l, jourISO)))',
    vers: '    && true)',
    garde: 'une attente expirée ne compte plus comme « déjà inscrit »' },

  { nom: '🔴 une table a de nouveau une liste d attente qui echoue apres le clic',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: '  if (prestation?.par_couverts === true) return false',
    vers: '  if (false) return false',
    garde: 'et la règle partagée la dit fermée, même réglée à 3' },

  { nom: '⚠️ une file fermee repond « demande invalide »',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "  if (!attenteOuverte(prestation)) return { ok: false, error: 'fermee' }",
    vers: "  if (false) return { ok: false, error: 'fermee' }",
    garde: 'une table n’a pas de liste d’attente : refus clair' },

  // ─── LA LISTE D'ATTENTE QU'ON TROUVE (Alex, 03/10) ─────────────────────
  { nom: '⚠️ la duree promet de nouveau « cette semaine » pour sept jours',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: "  { cle: 'semaine',   libelle: 'Les 7 prochains jours',  jours: 7  },",
    vers: "  { cle: 'semaine',   libelle: 'Cette semaine',  jours: 7  },",
    garde: 'chaque durée dit la fenêtre qu’elle surveille vraiment' },

  { nom: '🔴 la regle partagee oublie le jour : en attente sur tous les lundis',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: '    if (heure) return a.portee === PORTEE_SEANCE && a.date_rdv === date && memeHeure(a.heure_debut, heure)',
    vers: '    if (heure) return a.portee === PORTEE_SEANCE && memeHeure(a.heure_debut, heure)',
    garde: 'mais pas la même heure un autre jour' },

  { nom: '⚠️ une fenetre passe pour une seance',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: '    if (heure) return a.portee === PORTEE_SEANCE && a.date_rdv === date && memeHeure(a.heure_debut, heure)',
    vers: '    if (false) return a.portee === PORTEE_SEANCE && a.date_rdv === date && memeHeure(a.heure_debut, heure)',
    garde: 'une fenêtre ne passe pas pour une séance' },

  { nom: '🔴 la seance attendue perd son jour de la semaine',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: "  return `${nom} ${jour}${h.length === 5 ? ` à ${h}` : ''}`",
    vers: "  return `${jour}${h.length === 5 ? ` à ${h}` : ''}`",
    garde: 'la séance attendue se lit en clair' },

  // ⚠️ REPOINTÉE LE 04/10 : la promesse dit maintenant ce que le commerce voit.
  { nom: '🔴 le bloc reprend la phrase d avant : le commercant « pour te prevenir »',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: "const PROMESSE = 'On te prévient par notification. Le commerce voit ton prénom et ton téléphone. La place n’est pas gardée : la première personne qui réserve la prend.'",
    vers: "const PROMESSE = 'Ton prénom et ton numéro seront visibles par le commerçant pour te prévenir.'",
    garde: 'la phrase d’avant a disparu' },

  { nom: '🔴 la promesse tait de nouveau que le commerce voit le prenom et le telephone',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: "const PROMESSE = 'On te prévient par notification. Le commerce voit ton prénom et ton téléphone. La place n’est pas gardée : la première personne qui réserve la prend.'",
    vers: "const PROMESSE = 'On te prévient par notification. La place n’est pas gardée : la première personne qui réserve la prend.'",
    garde: 'la promesse tenue est dite avant et après l’inscription' },

  { nom: '🔴 le serveur donne aussi l adresse email au commerce',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: "    .select('id, prenom, telephone')",
    vers: "    .select('id, prenom, telephone, email')",
    garde: 'le serveur ne donne au commerce rien de plus' },

  { nom: '🔴 la commercante ne recoit plus le telephone de qui attend',
    banc: 'verif:attente', fichier: 'lib/attente-rdv-server.js',
    de: '        telephone: fiche.telephone || null,',
    vers: '        telephone: null,',
    garde: 'la commerçante voit qui attend, dans l’ordre, avec prénom et téléphone' },

  { nom: '🔴 les personnes en attente sortent sans garde',
    banc: 'verif:attente', fichier: 'app/api/rdv/attente-commerce/route.js',
    de: "    if (corps?.action === 'liste') {",
    vers: "    if (corps?.action === 'liste') { const res = await personnesDeLaSeance(admin, { prestationId: corps.prestation_id, dateRdv: corps.date_rdv, heureDebut: corps.heure_debut }); return NextResponse.json({ ok: true, personnes: res.personnes })",
    garde: 'les personnes ne sortent que derrière la garde de la case agenda' },

  { nom: '🔴 la liste d une seance perd l ordre d inscription',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: "    .sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')))",
    vers: '    .slice()',
    garde: 'la liste d’une séance suit l’ordre d’inscription' },

  { nom: '⚠️ la liste d une seance compte les attentes servies ou d une autre heure',
    banc: 'verif:attente', fichier: 'lib/attente-rdv.js',
    de: "    .filter(l => l?.portee === PORTEE_SEANCE && attenteVivante(l, jourISO)",
    vers: '    .filter(l => l?.portee === PORTEE_SEANCE',
    garde: 'la liste d’une séance suit l’ordre d’inscription' },

  { nom: '⚠️ l agenda montre la liste de la seance precedente',
    banc: 'verif:attente', fichier: 'app/dashboard/AgendaRdv.js',
    de: '              const vue = fileVue?.cle === cle ? fileVue : null',
    vers: '              const vue = fileVue',
    garde: 'l’agenda ne les charge qu’à la demande' },

  { nom: '⚠️ une fois inscrit, plus rien ne dit que la place n est pas gardee',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: '        <p style={note}>{PROMESSE}</p>',
    vers: '        <p style={note}></p>',
    garde: 'la promesse tenue est dite avant et après l’inscription' },

  { nom: '🔴 la fenetre ne dit plus LISTE D ATTENTE',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: "      <span>Liste d’attente{quoi ? ` · ${quoi}` : ''}</span>",
    vers: '      <span>{quoi}</span>',
    garde: 'la fenêtre dit LISTE D’ATTENTE dans ses trois états' },

  { nom: '🔴 le bloc juge seul, sans le jour : il contredit la grille',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: '      setDeja(attenteSur(j?.attentes, { prestationId, date, heure }))',
    vers: '      setDeja((j?.attentes || []).find(a => a.prestation_id === prestationId) || null)',
    garde: 'le bloc juge avec la règle partagée' },

  // ⚠️ REPOINTÉES LE 04/10 : les notifications sont exigées AVANT l'inscription.
  { nom: '🔴 l inscription ne demande plus les notifications : l alerte ne peut pas arriver',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: "    if (!await exigerNotifications()) { setEtat('pret'); return }",
    vers: '    void 0',
    garde: 'l’inscription exige les notifications AVANT d’écrire' },

  { nom: '🔴 un refus des notifications inscrit quand meme',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: '    if (!res?.ok) { setErreur(phraseNotifsRefusees(res?.raison)); return false }',
    vers: '    if (!res?.ok) { setErreur(phraseNotifsRefusees(res?.raison)); return true }',
    garde: 'l’inscription exige les notifications AVANT d’écrire' },

  { nom: '🔴 autorise mais desabonne passe pour actif : OneSignal n enverra rien',
    banc: 'verif:attente', fichier: 'lib/notifs-attente.js',
    de: "  if (etat.permission === 'granted' && etat.optedIn !== false) return 'actif'",
    vers: "  if (etat.permission === 'granted') return 'actif'",
    garde: 'autorisées mais désabonnées : on redemande' },

  { nom: '🔴 un refus du navigateur se lit comme a demander',
    banc: 'verif:attente', fichier: 'lib/notifs-attente.js',
    de: "  if (etat.permission === 'denied') return 'bloque'",
    vers: '',
    garde: 'refusées dans le navigateur : bloqué' },

  { nom: '🔴 un iPhone hors de l app recoit un bouton qui ne marchera jamais',
    banc: 'verif:attente', fichier: 'lib/notifs-attente.js',
    de: "  if (etat.supporte === false) return 'non_supporte'",
    vers: '',
    garde: 'un navigateur sans notifications (iPhone hors de l’app) renvoie vers l’app' },

  { nom: '⚠️ deja inscrit sans notifications, rien ne le dit',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: "        {(notif === 'a_demander' || notif === 'bloque' || notif === 'non_supporte') && (",
    vers: '        {false && (',
    garde: 'déjà inscrit sans notifications : on le dit' },

  { nom: '🔴 les listes d attente restent a l ecran apres la deconnexion',
    banc: 'verif:session', fichier: 'app/commander/page.js',
    de: '    setClientAttentes([])',
    vers: '    void 0',
    garde: '« clientAttentes » est effacé quand la personne part' },

  { nom: '🔴 le bloc ne previent plus la fiche : la grille ignore l inscription',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: '  const relireEtPrevenir = async () => { await relire(); onChange?.() }',
    vers: '  const relireEtPrevenir = async () => { await relire() }',
    garde: 'et prévient la fiche après une inscription comme après un retrait' },

  { nom: '🔴 le bloc ne dit plus ou retrouver l attente',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/BlocAttente.js',
    de: "const LIEN_MES_ATTENTES = '/commander?onglet=commandes&tab=rdvs'",
    vers: "const LIEN_MES_ATTENTES = '/commander'",
    garde: 'le bloc dit où retrouver l’attente' },

  { nom: '🔴 la fiche ne relit plus les attentes du Yopper',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '  useEffect(() => { if (attenteIci) relireMesAttentes() }, [attenteIci, relireMesAttentes])',
    vers: '  useEffect(() => { }, [attenteIci, relireMesAttentes])',
    garde: 'la fiche relit les attentes du Yopper, avec sa preuve' },

  { nom: '🔴 la grille ne marque plus la seance ou il attend',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                        const dansLaFile = attenteDispo && !!attenteSur(mesAttentes, { prestationId: prestationChoisie.id, date: isoDate(dateChoisie), heure })',
    vers: '                        const dansLaFile = false',
    garde: 'la grille marque la séance où il attend, avec la même règle' },

  { nom: '🔴 la seance complete redevient une case grise muette',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                            {attenteDispo && (',
    vers: '                            {false && (',
    garde: 'la séance complète porte la cloche' },

  { nom: '🔴 plus de legende au-dessus de la grille',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                  {dateChoisie && !slotsLoading && attenteIci',
    vers: '                  {dateChoisie && !slotsLoading && false',
    garde: 'une légende dit qu’une séance complète se touche' },

  { nom: '⚠️ le compteur redit « 0 plus de creneau »',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "                          {nbLibres === 0 ? 'Aucun créneau libre' : `${nbLibres} ${nbLibres > 1 ? 'créneaux libres' : 'créneau libre'}`}",
    vers: "                          {nbLibres} {nbLibres > 1 ? 'créneaux libres' : nbLibres === 1 ? 'créneau libre' : 'plus de créneau'}",
    garde: 'le compteur ne dit plus « 0 plus de créneau »' },

  { nom: '🔴 le bloc d une seance ne previent plus la grille',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                      heure={heureAttente} T={T} onChange={relireMesAttentes} />',
    vers: '                      heure={heureAttente} T={T} />',
    garde: 'les deux blocs préviennent la grille' },

  { nom: '🔴 le bloc solo reapparait sur une file fermee',
    banc: 'verif:attente', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                      {prestationChoisie && !estCoursCollectif(prestationChoisie) && attenteOuverte(prestationChoisie) && (',
    vers: '                      {prestationChoisie && !estCoursCollectif(prestationChoisie) && (',
    garde: 'le bloc solo ne s’affiche pas sur une file fermée' },

  { nom: '🔴 l espace du Yopper cache de nouveau ses listes d attente',
    banc: 'verif:attente', fichier: 'app/commander/page.js',
    de: '                {clientAttentes.length > 0 && (',
    vers: '                {false && (',
    garde: 'la section « Tes listes d’attente » s’affiche' },

  { nom: '🔴 l espace repasse a un fetch nu : personne n est reconnu',
    banc: 'verif:attente', fichier: 'app/commander/page.js',
    de: "      const rep = await fetchYopper('/api/rdv/attente')",
    vers: "      const rep = await fetch('/api/rdv/attente')",
    garde: 'l’espace charge ses attentes avec une identité prouvée' },

  { nom: '⚠️ une session perdue vide ses listes d attente',
    banc: 'verif:attente', fichier: 'app/commander/page.js',
    de: '      if (estSessionPerdue(rep, corps)) { setSessionPerdue(true); return }',
    vers: '      if (false) { setSessionPerdue(true); return }',
    garde: 'une session perdue ne vide pas ses listes d’attente' },

  { nom: '🔴 « ne plus me prevenir » ne rafraichit plus la liste',
    banc: 'verif:attente', fichier: 'app/commander/page.js',
    de: '      await chargerAttentesClient()',
    vers: '      await Promise.resolve()',
    garde: 'on sort de sa liste depuis son espace' },

  // ─── 04/10 · Q4 : LA MÊME PERSONNE DEUX FOIS AU MÊME COURS ──────────────
  { nom: '🔴 la meme adresse reprend une deuxieme place du cours',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "      if (dejaInscrit) return { ok: false, code: 'deja_inscrit' }",
    vers: "      if (false) return { ok: false, code: 'deja_inscrit' }",
    garde: 'la même adresse sur la même séance est refusée en ligne' },

  { nom: '🔴 les places ne portent plus qui les occupe : le doublon passe',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "      .select('place_no, client_id, client_email')",
    vers: "      .select('place_no')",
    garde: 'la même adresse sur la même séance est refusée en ligne' },

  { nom: '⚠️ la meme fiche sous une autre adresse passe',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: '      const dejaInscrit = (dejaLa || []).some(r => (qui && String(r.client_id) === qui)',
    vers: '      const dejaInscrit = (dejaLa || []).some(r => (false)',
    garde: 'et la même fiche aussi, quelle que soit l’adresse saisie' },

  { nom: '⚠️ le comptoir ne peut plus inscrire un enfant sous l adresse du parent',
    banc: 'verif:tunnel-rdv', fichier: CREATION,
    de: "    if (champs?.source !== 'commercant') { // le comptoir inscrit librement",
    vers: '    if (true) {',
    garde: 'au comptoir, la commerçante inscrit une deuxième personne' },

  { nom: '🔴 deja inscrit se rejoue apres paiement au lieu de se rembourser',
    banc: 'verif:tunnel-rdv', fichier: 'lib/refus-reservation.js',
    de: "  'deja_inscrit',",
    vers: '',
    garde: 'et après un paiement, il se rembourse avec sa raison' },

  { nom: '⚠️ deja inscrit tombe dans le message generique « reessaie »',
    banc: 'verif:tunnel-rdv', fichier: 'lib/refus-reservation.js',
    de: "  if (code === 'deja_inscrit') {",
    vers: '  if (false) {',
    garde: 'le refus se dit avant le paiement, sans renvoyer à la grille' },

  { nom: '🔴 l acompte ne passe plus l adresse a sa verification : le doublon est encaisse',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '        client_email: emailEssai,',
    vers: '',
    garde: 'create-rdv-acompte : la vérification avant Stripe reçoit l’adresse' },

  { nom: '🔴 le tunnel avec produits ne passe plus l adresse',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '        client_email: emailEssai,',
    vers: '',
    garde: 'create-rdv-commande : la vérification avant Stripe reçoit l’adresse' },

  { nom: '⚠️ l empreinte ne passe plus l adresse',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-empreinte/route.js',
    de: '        client_email: emailEssai,',
    vers: '',
    garde: 'create-rdv-empreinte : la vérification avant Stripe reçoit l’adresse' },

  { nom: '🔴 le rejeu d un acompte rembourse de nouveau un rendez-vous ne',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/webhook/route.js',
    de: "        .eq('stripe_payment_intent_id', paymentIntent.id).limit(1)",
    vers: "        .eq('id', paymentIntent.id).limit(1)",
    garde: 'le webhook de l’acompte relit le paiement avant de créer' },
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
