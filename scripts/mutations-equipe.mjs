// HARNAIS DE MUTATION — L'ÉQUIPE D'UN COMMERCE
//
// Chaque mutation ouvre une porte précise, et le banc qu'elle nomme doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:equipe

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:equipe'

const MUTATIONS = [
  // ─── LES RÈGLES ──────────────────────────────────────────────────────────
  { nom: '🔴 la chaîne "false" coche une case',
    fichier: 'lib/equipe.js', de: 'droits[colonneDroit(cle)] = entree?.[cle] === true || entree?.[colonneDroit(cle)] === true', vers: 'droits[colonneDroit(cle)] = !!entree?.[cle] || !!entree?.[colonneDroit(cle)]' },
  { nom: '🔴 « argent » sans « agenda » passe',
    fichier: 'lib/equipe.js', de: '  if (d.droit_argent && !d.droit_agenda) {', vers: '  if (false) {' },
  { nom: '🔴 un droit inconnu répond au lieu de lever',
    fichier: 'lib/equipe.js', de: "  if (!CLES_DROITS.includes(cle)) throw new Error(`droit d'équipe inconnu : ${cle}`)", vers: '' },
  { nom: '🔴 le forfait n est plus vérifié',
    fichier: 'lib/equipe.js', de: "  return canDo(planEffectif(commercant, maintenant), 'equipe')", vers: '  return true' },
  { nom: '🔴 un commerce non validé a une équipe',
    fichier: 'lib/equipe.js', de: "  if (!['valide', 'actif'].includes(commercant.statut)) return false", vers: '' },
  { nom: '🔴 le patron s invite lui-même',
    fichier: 'lib/equipe.js', de: "  if (emailPatron && adresse === adresseNormalisee(emailPatron)) return", vers: "  if (false) return" },
  { nom: '🔴 le plafond ne compte plus les invitations en attente',
    fichier: 'lib/equipe.js', de: "  const enPlace = (membres || []).filter(m => m.statut !== 'retire')", vers: "  const enPlace = (membres || []).filter(m => m.statut === 'actif')" },
  { nom: '⚠️ le plafond change sans décision d Alex',
    fichier: 'lib/equipe.js', de: 'export const EQUIPE_MAX = 10', vers: 'export const EQUIPE_MAX = 5' },
  { nom: '🔴 le plafond saute',
    fichier: 'lib/equipe.js', de: '  if (enPlace.length >= EQUIPE_MAX) return', vers: '  if (enPlace.length > EQUIPE_MAX) return' },
  { nom: '🔴 la date de fin ne coupe plus l accès',
    fichier: 'lib/equipe.js', de: '  if (membre.expire_le && new Date(membre.expire_le).getTime() <= maintenant.getTime()) return false', vers: '' },
  { nom: '🔴 un membre agit dans un autre commerce',
    fichier: 'lib/equipe.js', de: '  if (!commercant || membre.commercant_id !== commercant.id) return false', vers: '  if (!commercant) return false' },
  { nom: '🔴 un autre compte accepte l invitation',
    fichier: 'lib/equipe.js', de: '  if (adresseNormalisee(user.email) !== adresseNormalisee(membre.email)) {', vers: '  if (false) {' },
  { nom: '🔴 une invitation expirée s accepte',
    fichier: 'lib/equipe.js', de: '  if (!invitationOuverte(membre, maintenant)) return', vers: '  if (!membre.invitation_expire_le) return' },

  // ─── LE SERVEUR ──────────────────────────────────────────────────────────
  { nom: '🔴 la garde du membre oublie le commerce',
    fichier: 'lib/equipe-server.js', de: ".eq('commercant_id', commercantId).eq('auth_user_id', user.id).eq('statut', 'actif')", vers: ".eq('auth_user_id', user.id).eq('statut', 'actif')" },
  // ⚠️ ANCRE REPOINTÉE À L'ÉTAPE 2 : la garde juge désormais une liste de cases.
  { nom: '🔴 la garde du membre oublie ses cases',
    fichier: 'lib/equipe-server.js', de: '  for (const d of demandes) permis[d] = peutAgir({ membre, commercant, droit: d })', vers: '  for (const d of demandes) permis[d] = !!membre' },
  { nom: '🔴 une seule case ouvre tout le poste',
    fichier: 'lib/equipe-server.js', de: '  if (!Object.values(permis).some(Boolean)) return { ok: false, status: 403', vers: '  if (false) return { ok: false, status: 403' },

  // ─── ÉTAPE 2 : LE POSTE ──────────────────────────────────────────────────
  { nom: '🔴 l agenda part sans sa case',
    fichier: 'app/api/equipe/poste/route.js', de: '    if (permis.agenda) {', vers: '    if (true) {' },
  { nom: '🔴 les commandes complètes partent sans leur case',
    fichier: 'app/api/equipe/poste/route.js', de: '      if (permis.commandes) reponse.commandes = lues', vers: '      reponse.commandes = lues' },
  { nom: '🔴 le livreur reçoit les commandes complètes',
    fichier: 'app/api/equipe/poste/route.js', de: '      if (permis.livraisons) reponse.livraisons = trierLivraisons(lues.filter(c => livraisonDuJour(c, aujourdhui)).map(livraisonPourLeLivreur))', vers: '      if (permis.livraisons) reponse.livraisons = lues.filter(c => livraisonDuJour(c, aujourdhui))' },
  { nom: '🔴 une commande pas encore payée arrive au comptoir',
    fichier: 'app/api/equipe/poste/route.js', de: ".eq('commercant_id', commercant_id).neq('statut', 'paiement_en_attente')", vers: ".eq('commercant_id', commercant_id)" },
  { nom: '🔴 l agenda d un autre commerce',
    fichier: 'app/api/equipe/poste/route.js', de: ".eq('commercant_id', commercant_id).is('deleted_at', null).gte('date_rdv', f.agenda.debut)", vers: ".is('deleted_at', null).gte('date_rdv', f.agenda.debut)" },
  { nom: '🔴 le jeton d annulation part vers l équipe',
    fichier: 'lib/equipe-poste.js', de: "  'commande_id', 'motif_annulation',", vers: "  'commande_id', 'motif_annulation', 'annulation_token'," },
  { nom: '🔴 une colonne inexistante casse la lecture des commandes',
    fichier: 'lib/equipe-poste.js', de: "  'creneau_id', 'creneau_livraison_id', 'client_nom',", vers: "  'creneau_id', 'creneau_livraison_id', 'client_prenom', 'client_nom'," },
  { nom: '⚠️ le reste à payer d un rendez-vous ne se calcule plus',
    fichier: 'lib/equipe-poste.js', de: "  'prix_estime', 'acompte_montant',", vers: "  'acompte_montant'," },
  { nom: '🔴 le livreur voit le total d une commande payée',
    fichier: 'lib/equipe-poste.js', de: '    a_encaisser: reste > 0 ? reste : null,', vers: '    a_encaisser: reste > 0 ? reste : null, total: c.total,' },
  { nom: '🔴 le livreur voit le prix de chaque ligne',
    fichier: 'lib/equipe-poste.js', de: '    options: libelleOptions(l.options) || null,', vers: '    options: libelleOptions(l.options) || null, prix_unitaire: l.prix_unitaire,' },
  { nom: '🔴 le livreur ne voit plus ce qu il doit donner',
    fichier: 'lib/equipe-poste.js', de: '  const lignes = (c.commande_articles || []).map(l => ({', vers: '  const lignes = [].map(l => ({' },
  { nom: '🔴 le livreur voit toujours un montant à encaisser',
    fichier: 'lib/equipe-poste.js', de: '    a_encaisser: reste > 0 ? reste : null,', vers: '    a_encaisser: c.total,' },
  { nom: '🔴 les livraisons des autres jours arrivent',
    fichier: 'lib/equipe-poste.js', de: "  if (c.mode_retrait !== 'livraison' || c.date_commande !== aujourdhui) return false", vers: "  if (c.mode_retrait !== 'livraison') return false" },
  // ⚠️ REPOINTÉE À L'ÉTAPE 3b : créer est permis, mais avec la case Agenda.
  { nom: '🔴 le Poste propose de créer sans la case Agenda',
    fichier: 'app/equipe/PosteEquipe.js', de: 'onNouveauRdv={etat.droits?.agenda ? (date, heure)', vers: 'onNouveauRdv={true ? (date, heure)' },
  { nom: '⚠️ le tableau de bord réécrit un libellé à la main',
    fichier: 'app/dashboard/page.js', de: "{ label: LIBELLES_STATUT_COMMANDE.pret,", vers: "{ label: 'Prête'," },
  { nom: '⚠️ une livraison livrée redevient « Récupérée »',
    fichier: 'lib/statuts-commande.js', de: "    if (statut_livraison === 'livree' || statut === 'recupere') return 'Livrée'", vers: '' },
  { nom: '🔴 un membre gère l équipe',
    fichier: 'lib/equipe-server.js', de: '  if (!patron && !(await adminVerifie(request, user))) return { ok: false, status: 403', vers: '  if (false) return { ok: false, status: 403' },
  { nom: '🔴 les routes lisent l empreinte du jeton',
    fichier: 'lib/equipe-server.js', de: "export const COLONNES_MEMBRE = 'id, commercant_id,", vers: "export const COLONNES_MEMBRE = 'id, invitation_jeton_hash, commercant_id," },
  { nom: '⚠️ une lecture ratée répond « personne »',
    fichier: 'lib/equipe-server.js', de: "  if (error) throw new Error(`lecture de l'équipe : ${error.message}`)", vers: '' },

  // ─── LES ROUTES ──────────────────────────────────────────────────────────
  { nom: '🔴 le jeton est gardé en clair',
    fichier: 'app/api/equipe/inviter/route.js', de: 'invitation_jeton_hash: empreinteJeton(jeton),', vers: 'invitation_jeton_hash: jeton,' },
  { nom: '🔴 l invitation oublie l adresse du patron',
    fichier: 'app/api/equipe/inviter/route.js', de: 'emailPatron: commercant.email, maintenant,', vers: 'emailPatron: null, maintenant,' },
  { nom: '🔴 modifier touche l équipe d un autre commerce',
    fichier: 'app/api/equipe/modifier/route.js', de: ".eq('id', membre_id).eq('commercant_id', commercant_id).neq('statut', 'retire').select(COLONNES_MEMBRE).maybeSingle()", vers: ".eq('id', membre_id).neq('statut', 'retire').select(COLONNES_MEMBRE).maybeSingle()" },
  { nom: '🔴 retirer touche l équipe d un autre commerce',
    fichier: 'app/api/equipe/retirer/route.js', de: ".eq('id', membre_id).eq('commercant_id', commercant_id).neq('statut', 'retire')", vers: ".eq('id', membre_id).neq('statut', 'retire')" },
  { nom: '🔴 retirer laisse vivre le lien d invitation',
    fichier: 'app/api/equipe/retirer/route.js', de: "retire_le: maintenant, updated_at: maintenant, invitation_jeton_hash: null, invitation_expire_le: null", vers: "retire_le: maintenant, updated_at: maintenant" },
  { nom: '🔴 rejoindre sans vérifier la règle',
    fichier: 'app/api/equipe/rejoindre/route.js', de: '    if (refus) return NextResponse.json({ ok: false, error: refus }, { status: 409 })', vers: '' },
  { nom: '🔴 une invitation s accepte deux fois',
    fichier: 'app/api/equipe/rejoindre/route.js', de: ".eq('id', membre.id).eq('statut', 'invite').eq('invitation_jeton_hash', empreinte)", vers: ".eq('id', membre.id)" },
  { nom: '🔴 l invitation sans session livre l adresse entière',
    fichier: 'app/api/equipe/invitation/route.js', de: '      adresse: adresseMasquee(membre.email),', vers: '      adresse: membre.email,' },
  { nom: '🔴 « mes équipes » montre un accès terminé',
    fichier: 'app/api/equipe/mes-equipes/route.js', de: 'membreEnActivite(m, maintenant) && commerceAUneEquipe(c, maintenant)', vers: 'commerceAUneEquipe(c, maintenant)' },

  // ─── LE RETOUR APRÈS CONNEXION ───────────────────────────────────────────
  { nom: '🔴 « //site » redevient une adresse interne',
    fichier: 'lib/chemin-interne.js', de: "  if (s.startsWith('//') || s.startsWith('/\\\\')) return defaut", vers: "  if (s.startsWith('/\\\\')) return defaut" },
  { nom: '🔴 la barre oblique inverse de tête passe',
    fichier: 'lib/chemin-interne.js', de: "  if (s.startsWith('//') || s.startsWith('/\\\\')) return defaut", vers: "  if (s.startsWith('//')) return defaut" },
  { nom: '🔴 un caractère de contrôle passe',
    fichier: 'lib/chemin-interne.js', de: '    if (n < 32 || n === 127) return defaut', vers: '    if (false) return defaut' },
  { nom: '🔴 la page de session suit n importe quelle adresse',
    fichier: 'app/auth/session/page.js', de: "    const next = cheminInterne(searchParams.get('next'), '/dashboard')", vers: "    const next = searchParams.get('next') || '/dashboard'" },
  { nom: '🔴 la page de connexion suit n importe quelle adresse',
    fichier: 'app/login/page.js', de: "  const nextPath = cheminInterne(searchParams?.get('next'), '/dashboard')", vers: "  const nextPath = searchParams?.get('next') || '/dashboard'" },

  // ─── ÉTAPE 3 : LES GESTES ────────────────────────────────────────────────
  { nom: '🔴 un reste à payer s encaisse sans dire comment',
    fichier: 'lib/encaissement.js', de: '  if (!CHOIX_ENCAISSEMENT.includes(choix)) {', vers: '  if (false) {' },
  { nom: '🔴 le montant encaissé n est plus le reste',
    fichier: 'lib/encaissement.js', de: '      encaisse_montant: rien ? 0 : Math.round(Number(reste) * 100) / 100,', vers: '      encaisse_montant: 0,' },
  { nom: '🔴 une commande saute des étapes',
    fichier: 'lib/statuts-commande.js', de: '  if (!commande?.statut || STATUT_SUIVANT[commande.statut] !== vers) return false', vers: '  if (!commande?.statut) return false' },
  { nom: '🔴 une livraison se remet au comptoir',
    fichier: 'lib/statuts-commande.js', de: "  if (commande.statut === 'pret' && ['livraison', 'expedition'].includes(commande.mode_retrait)) return false", vers: '' },
  { nom: '⚠️ le bouton du Poste ne dit plus la même chose que le tableau de bord',
    fichier: 'lib/statuts-commande.js', de: "pret: 'Remettre au client' }", vers: "pret: 'Remettre' }" },
  { nom: '🔴 une réservation s honore deux fois',
    fichier: 'app/api/equipe/rdv/venu/route.js', de: ".eq('id', rdv_id).eq('statut', 'confirme')", vers: ".eq('id', rdv_id)" },
  { nom: '🔴 « venu » s ouvre avec la case Commandes',
    fichier: 'app/api/equipe/rdv/venu/route.js', de: "'rdv_reservations', rdv_id, 'agenda')", vers: "'rdv_reservations', rdv_id, 'commandes')" },
  { nom: '🔴 une commande avance deux fois',
    fichier: 'app/api/equipe/commande/statut/route.js', de: ".eq('id', commande_id).eq('statut', c.statut)", vers: ".eq('id', commande_id)" },
  { nom: '🔴 le serveur ne revérifie plus la transition',
    fichier: 'app/api/equipe/commande/statut/route.js', de: '    if (!transitionPermise(c, statut)) {', vers: '    if (false) {' },
  { nom: '🔴 « absent » s ouvre sans la case Argent',
    fichier: 'app/api/rdv/no-show/route.js', de: "'rdv_reservations', rdv_id, 'argent')", vers: "'rdv_reservations', rdv_id, 'agenda')" },
  { nom: '🔴 annuler s ouvre avec la case Comptoir',
    fichier: 'app/api/rdv/annuler-commercant/route.js', de: "'rdv_reservations', rdv_id, 'agenda')", vers: "'rdv_reservations', rdv_id, 'comptoir')" },
  { nom: '⚠️ le patron aussi part au journal de l équipe',
    fichier: 'lib/equipe-server.js', de: "  if (!garde?.ok || garde.role !== 'membre') return true", vers: '  if (!garde?.ok) return true' },
  { nom: '⚠️ les produits remis ne vont plus au journal',
    fichier: 'app/api/commande/produits-remis/route.js', de: "    await journaliserGeste(supabase, verdict, { action: 'produits_remis', cible_type: 'commande', cible_id: commandeId })", vers: '' },
  // ⚠️ RÉORIENTÉE LE 30/09 : le déplacement existe au Poste ; « plutôt le
  // déplacer » doit l'ouvrir, sinon ce choix ne fait rien.
  { nom: '🔴 « plutôt le déplacer » tombe dans le vide',
    fichier: 'app/equipe/PosteEquipe.js', de: "      if (choix === 'deplacer') { setRdvOuvert(null); setADeplacer(rdv); return }", vers: '' },
  // ─── LE DÉPLACEMENT (30/09, étape 3b) ───────────────────────────────────
  { nom: '🔴 le créneau n est plus revérifié au serveur',
    fichier: 'lib/rdv-deplacement-server.js', de: "  if (!verdict.ok) return { ok: false, code: verdict.raison || 'creneau', message: verdict.message }", vers: '' },
  { nom: '🔴 le serveur juge le passé à l heure de Greenwich',
    fichier: 'lib/rdv-deplacement-server.js', de: '    maintenant: penduleBelge(instant),', vers: '    maintenant: instant,' },
  { nom: '🔴 la pendule belge rend l heure de la machine',
    fichier: 'lib/heure-belge.js', de: '  const minutes = minutesLocales(instant)', vers: '  const minutes = instant.getHours() * 60 + instant.getMinutes()' },
  { nom: '🔴 une réservation honorée se déplace',
    fichier: 'lib/rdv-deplacement-server.js', de: "  if (rdv.statut !== 'confirme') return refus('pas_a_venir')", vers: '' },
  { nom: '🔴 la réservation d un autre commerce se déplace',
    fichier: 'lib/rdv-deplacement-server.js', de: "  if (!rdv || rdv.deleted_at || String(rdv.commercant_id) !== String(commercantId)) return refus('introuvable')", vers: "  if (!rdv || rdv.deleted_at) return refus('introuvable')" },
  { nom: '🔴 l écriture écrase un déplacement fait entre-temps',
    fichier: 'lib/rdv-deplacement-server.js', de: "    .eq('date_rdv', rdv.date_rdv).eq('heure_debut', rdv.heure_debut)", vers: '' },
  { nom: '🔴 zéro ligne écrite passe pour un succès',
    fichier: 'lib/rdv-deplacement-server.js', de: "  if (!ecrites || ecrites.length === 0) return refus('deja_modifiee')", vers: '' },
  { nom: '🔴 la place d un cours devient « inscrits + 1 »',
    fichier: 'lib/rdv-deplacement-server.js', de: '      const libre = premierePlaceLibre({ capacite }, prises)', vers: '      const libre = prises.length < capacite ? prises.length + 1 : null' },
  { nom: '🔴 la place d un cours se compte sur tous les cours de l heure',
    fichier: 'lib/rdv-deplacement-server.js', de: "    if (estCours) requete = requete.eq('prestation_id', rdv.prestation_id)", vers: '' },
  { nom: '🔴 la salle changée n arrête plus l écriture',
    fichier: 'lib/rdv-deplacement-server.js', de: "    if (!salleCommeVue({ salleEnTables, choix, cadenceDepassee: cadence?.depasse === true, vu })) return refus('salle_changee')", vers: '' },
  { nom: '🔴 une autre table que celle montrée passe',
    fichier: 'lib/rdv-deplacement-server.js', de: "    && String(choix.format?.id ?? '') === String(table.format_id ?? '')", vers: '' },
  { nom: '🔴 une cuisine devenue pleine passe',
    fichier: 'lib/rdv-deplacement-server.js', de: '  return tableOk && (cadenceDepassee === true) === (vu?.cadence_depassee === true)', vers: '  return tableOk' },
  { nom: '🔴 l adresse du client sort du serveur',
    fichier: 'lib/rdv-deplacement-server.js', de: '    client_a_email: !!rdv.client_email,', vers: '    client_a_email: !!rdv.client_email, client_email: rdv.client_email,' },
  { nom: '🔴 la fin ne suit plus la durée figée',
    fichier: 'lib/rdv-deplacement-server.js', de: '  const dureeMinutes = Number(rdv.duree_minutes) || Number(presta?.duree_minutes) || 0', vers: '  const dureeMinutes = 30' },
  { nom: '🔴 déplacer se passe de la case Agenda',
    fichier: 'app/api/equipe/rdv/deplacer/route.js', de: "gardeLigneEquipe(request, admin, 'rdv_reservations', rdv_id, 'agenda')", vers: "gardeLigneEquipe(request, admin, 'rdv_reservations', rdv_id, 'livraisons')" },
  { nom: '⚠️ le déplacement ne va plus au journal',
    fichier: 'app/api/equipe/rdv/deplacer/route.js', de: "      action: 'rdv_deplace', cible_type: 'rdv', cible_id: rdv_id,", vers: "      action: 'rdv_cree', cible_type: 'rdv', cible_id: rdv_id," },
  { nom: '🔴 le rappel refuse le membre',
    fichier: 'app/api/rdv/replanifier-rappel/route.js', de: "    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_reservations', rdv_id, 'agenda')", vers: "    const verdict = await gardeLigneEquipe(request, supabase, 'rdv_reservations', rdv_id, 'argent')" },
  { nom: '🔴 l email « déplacé » accepte n importe qui',
    fichier: 'app/api/emails/rdv-confirme/route.js', de: '    const deplace = deplaceDemande === true && (verdictPro.ok || verdictEquipe.ok)', vers: '    const deplace = deplaceDemande === true' },
  { nom: '🔴 la confirmation du client paie une lecture d équipe',
    fichier: 'app/api/emails/rdv-confirme/route.js', de: '    const verdictEquipe = deplaceDemande === true && !verdictPro.ok', vers: '    const verdictEquipe = !verdictPro.ok' },
  { nom: '🔴 la fenêtre du Poste écrit elle-même',
    fichier: 'app/dashboard/ModalDeplacerRdv.js', de: '      if (serveur) return await deplacerParLeServeur()', vers: '' },
  { nom: '🔴 la fenêtre n envoie pas ce qu elle a montré',
    fichier: 'app/dashboard/ModalDeplacerRdv.js', de: '        cadence_depassee: cadenceDepassee,', vers: '        cadence_depassee: false,' },
  { nom: '🔴 au Poste, le rappel ne suit plus',
    fichier: 'app/dashboard/ModalDeplacerRdv.js', de: "    const rappel = prevenirClient('/api/rdv/replanifier-rappel', { rdv_id: rdv.id }, 'le rappel du client')", vers: '    const rappel = Promise.resolve({ ok: true })' },
  { nom: '🔴 l email part même case décochée',
    fichier: 'app/dashboard/ModalDeplacerRdv.js', de: '    const emailParti = prevenir && r.client_a_email === true', vers: '    const emailParti = r.client_a_email === true' },
  { nom: '🔴 la fenêtre de déplacement s ouvre sans la case Agenda',
    fichier: 'app/equipe/PosteEquipe.js', de: '      {aDeplacer && etat.agenda && etat.droits?.agenda && (', vers: '      {aDeplacer && etat.agenda && (' },
  { nom: '⚠️ le client sans adresse n est plus signalé',
    fichier: 'app/equipe/PosteEquipe.js', de: "    else if (!clientAEmail) dire(`Réservation déplacée au ${quand}. Pas d’email pour ce client : préviens-le${rdv.client_telephone ? ` au ${rdv.client_telephone}` : ''}.`, 'erreur')", vers: '' },
  { nom: '🔴 « absent » proposé sans la case Argent',
    fichier: 'app/equipe/PosteEquipe.js', de: 'const absentPossible = enAttente && droits.argent && noShowPossible(rdv, new Date())', vers: 'const absentPossible = enAttente && noShowPossible(rdv, new Date())' },
  { nom: '🔴 l email d annulation perd une information',
    fichier: 'app/equipe/PosteEquipe.js', de: '        nb_bons: j.nb_bons,', vers: '' },

  // ─── ÉTAPE 3b : CRÉER ────────────────────────────────────────────────────
  { nom: '🔴 le serveur ne revérifie plus le créneau',
    fichier: 'app/api/equipe/rdv/creer/route.js', de: '    if (!verdict.ok) return NextResponse.json({ ok: false, error: verdict.message }, { status: 409 })', vers: '' },
  { nom: '🔴 le prix vient de l écran',
    fichier: 'app/api/equipe/rdv/creer/route.js', de: '        prix_estime: prix,', vers: '        prix_estime: Number(corps.prix) || prix,' },
  { nom: '🔴 créer s ouvre avec la case Comptoir',
    fichier: 'app/api/equipe/rdv/creer/route.js', de: "const garde = await gardeEquipe(request, admin, commercant_id, 'agenda')", vers: "const garde = await gardeEquipe(request, admin, commercant_id, 'comptoir')" },
  { nom: '🔴 le créneau se juge sur les réservations de tous les commerces',
    fichier: 'app/api/equipe/rdv/creer/route.js', de: ".eq('commercant_id', commercant_id).eq('date_rdv', date)", vers: ".eq('date_rdv', date)" },
  { nom: '🔴 les couverts ne sont plus bornés',
    fichier: 'app/api/equipe/rdv/creer/route.js', de: '    if (couverts === null) {', vers: '    if (false) {' },
  { nom: '🔴 la salle se lit sans la case Agenda',
    fichier: 'app/api/equipe/rdv/salle/route.js', de: "const garde = await gardeEquipe(request, admin, commercant_id, 'agenda')", vers: "const garde = await gardeEquipe(request, admin, commercant_id, ['agenda', 'comptoir'])" },
  { nom: '🔴 la fenêtre écrit elle-même dans le Poste',
    fichier: 'app/dashboard/ModalNouveauRdv.js', de: '      if (serveur) {', vers: '      if (false) {' },
  { nom: '🔴 le Poste propose les abonnements',
    fichier: 'app/dashboard/ModalNouveauRdv.js', de: '    if (serveur || !prestationId || prestationId === UNE_TABLE) { setAbonnes([]); return }', vers: '    if (!prestationId || prestationId === UNE_TABLE) { setAbonnes([]); return }' },
  { nom: '⚠️ les prestations du Poste divergent du tableau de bord',
    fichier: 'lib/equipe-poste.js', de: '${COLONNES_COUVERTS}, duree_paliers, quantite, jointure_de, jointure_tables`', vers: '${COLONNES_COUVERTS}, duree_paliers, quantite`' },
  { nom: '🔴 la fenêtre s ouvre sans la case Agenda',
    fichier: 'app/equipe/PosteEquipe.js', de: '{saisie && etat.agenda && etat.droits?.agenda && (', vers: '{saisie && etat.agenda && (' },

  // ─── L'EMAIL, LA BASE, L'ÉCRAN ───────────────────────────────────────────
  { nom: '🔴 la mention de bas de page redevient brute',
    fichier: 'lib/resend.js', de: '  const commercantNom = commercantNomBrut ? echapperHtml(commercantNomBrut) : \'\'', vers: '  const commercantNom = commercantNomBrut || \'\'' },
  { nom: '🔴 la migration ouvre une règle d accès',
    fichier: 'migrations/MIGRATION_EQUIPE_MEMBRES.sql', de: 'ALTER TABLE public.equipe_journal ENABLE ROW LEVEL SECURITY;', vers: 'ALTER TABLE public.equipe_journal ENABLE ROW LEVEL SECURITY; CREATE POLICY equipe_lit ON public.equipe_membres FOR SELECT TO authenticated USING (true);' },
  { nom: '🔴 l onglet entre dans la barre sans le Poste équipe',
    fichier: 'lib/equipe.js', de: 'export const EQUIPE_DANS_LA_BARRE = false', vers: 'export const EQUIPE_DANS_LA_BARRE = true' },
  { nom: '⚠️ ?config=equipe retombe sur l accueil',
    fichier: 'app/dashboard/page.js', de: "    'equipe']", vers: "    ]" },
  { nom: '🔴 la matrice ouvre l équipe à Exister',
    fichier: 'lib/plans.js', de: "    equipe:                  false,   // l'équipe (personnel, livreurs) : Vendre", vers: "    equipe:                  true,   // l'équipe (personnel, livreurs) : Vendre" },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const depart = lancer(BANC)
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log(`Banc vert au départ : ${BANC}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ Les fichiers peuvent être en CRLF : la cible suit la fin de ligne du fichier.
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const de = m.de.split('\n').join(eol)
  const vers = m.vers.split('\n').join(eol)
  if (!original.includes(de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(de, vers))
  const res = lancer(m.banc || BANC)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉE VERTE`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = lancer(BANC).rouge
if (finalRouge) console.log(`🔴 ${BANC} EST ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
