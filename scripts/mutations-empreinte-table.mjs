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
// ⚠️ DEUX BANCS DEPUIS LE 16/09. Les règles du lien et de l'empreinte vivent
// dans `verif:empreinte`, mais celles qui décident des ISSUES d'un rendez-vous
// (déclarer une absence, proposer un changement d'adresse) sont mesurées par
// `verif:logique`. Une mutation dont le banc n'est pas lancé reste verte : elle
// ne mesurerait rien, et le dirait comme un succès.
const BANC = 'verif:empreinte && npm run verif:logique'

const REGLE = 'lib/empreinte-table.js'
const RESERVER = 'app/api/rdv/reserver/route.js'
const FICHE = 'app/commander/rdv/[slug]/page.js'
const PAIEMENTS = 'app/dashboard/TabPaiements.js'
// Le lien « confirme ta table » : ce que le jeton ouvre, et ce que le client
// lit avant de sortir sa carte (16/09).
const MODULE = 'lib/empreinte-lien-serveur.js'
const DETAILS = 'app/api/rdv/empreinte-details/route.js'
const PAGE = 'app/empreinte/[jeton]/page.js'
const DEMANDE = 'app/api/rdv/empreinte-demander/route.js'
// « Ce compte encaisse-t-il ? » : l'écran de réglage le demandait plus
// largement que la règle, et l'inscription Stripe en cours passait entre les deux.
const CONFIG = 'app/dashboard/ConfigDashboard.js'
const DASH = 'app/dashboard/page.js'
// La règle des couverts et les colonnes qu'elle déclare lire.
const COUVERTS = 'lib/cours-collectifs.js'
const EMPREINTE = 'app/api/stripe/checkout/create-rdv-empreinte/route.js'
// Le gabarit de l'email de confirmation : il ne disait pas le montant garanti,
// et promettait le remboursement d'un acompte qui n'existe pas.
const MAIL = 'lib/resend.js'
// La porte unique des SMS : elle normalise le numero et rend le credit.
const SMS = 'lib/fidelite-sms.js'

const MUTATIONS = [
  // ─── LA RÈGLE ───────────────────────────────────────────────────────────
  // ⚠️ CES DEUX ANCRES ONT SUIVI LA REGLE LE 16/09. Elle vivait dans
  // `empreinteRequise` ; elle a une fonction a elle, `compteEncaisse`, partagee
  // avec l ecran de reglage. Le harnais a dit « TEXTE INTROUVABLE », il n a pas
  // fait semblant de mesurer.
  { nom: '🔴 la regle relit stripe_account_id, que la fiche publique n a pas (le defaut d origine)',
    fichier: REGLE,
    de: '  return commercant?.stripe_account_charges_enabled === true',
    vers: '  return !!commercant?.stripe_account_id && commercant?.stripe_account_charges_enabled === true' },

  { nom: '🔴 une colonne d encaissement absente passe pour un compte en ordre',
    fichier: REGLE,
    de: '  return commercant?.stripe_account_charges_enabled === true',
    vers: '  return commercant?.stripe_account_charges_enabled !== false' },

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

  // ─── CE QUE LE JETON OUVRE (module partagé, executé au banc) ────────────
  { nom: '🔴 le montant du lien ne vient plus du calcul du module',
    fichier: MODULE,
    de: '  const montant = montantEmpreinte(commercant, rdv.prestation, rdv.couverts)',
    vers: '  const montant = Number(rdv.couverts)' },

  { nom: '🔴 un lien perime redevient valable',
    fichier: MODULE,
    de: '  if (!lienValide(rdv, maintenant)) {',
    vers: '  if (false) {' },

  { nom: '🔴 une lecture en erreur repasse pour un jeton inconnu',
    fichier: MODULE,
    de: '  if (error) {',
    vers: '  if (false) {' },

  { nom: '🔴 l affichage charge de nouveau les coordonnees du client',
    fichier: MODULE,
    de: '    .select(avecClient ? `${COLONNES_TABLE}, ${COLONNES_CLIENT}` : COLONNES_TABLE)',
    vers: '    .select(`${COLONNES_TABLE}, ${COLONNES_CLIENT}`)' },

  // ─── LA ROUTE QUI AFFICHE ───────────────────────────────────────────────
  { nom: '🔴 la route qui affiche rend l email du client',
    fichier: DETAILS,
    de: '      commerce: commercant.nom,',
    vers: '      commerce: commercant.nom, client_email: rdv.client_email,' },

  { nom: '🔴 elle recalcule son montant dans son coin (la divergence)',
    fichier: DETAILS,
    de: '      montant,',
    vers: '      montant: montantEmpreinte(commercant, rdv.prestation, rdv.couverts),' },

  // ─── CE QUE LE CLIENT LIT ───────────────────────────────────────────────
  { nom: '🔴 la page n annonce plus le montant garanti',
    fichier: PAGE,
    de: 'Le restaurant ne peut facturer ${euros(details.montant)} que si personne',
    vers: 'Le restaurant ne peut facturer que si personne' },

  { nom: '🔴 le bouton s affiche avant que le montant soit connu',
    fichier: PAGE,
    de: '  if (!details) {',
    vers: '  if (false) {' },

  { nom: '🔴 la page ne demande plus la somme au serveur',
    fichier: PAGE,
    de: "fetch('/api/rdv/empreinte-details', {",
    vers: "fetch('/api/stripe/checkout/empreinte-lien', {" },

  // ─── LE SMS ─────────────────────────────────────────────────────────────
  { nom: '🔴 le SMS ne dit plus le montant garanti',
    fichier: DEMANDE,
    de: "Rien n'est débité si tu viens, ${eurosNus(montant)} EUR seulement en cas d'absence ou d'annulation tardive.",
    vers: "Rien n'est débité si tu viens." },

  { nom: '🔴 le SMS ressert la date brute de la base',
    fichier: DEMANDE,
    de: 'confirme ta table du ${quandSms} en enregistrant',
    vers: 'confirme ta table du ${rdv.date_rdv} en enregistrant' },

  // ─── « CE COMPTE ENCAISSE-T-IL ? » (16/09) ──────────────────────────────
  // Les deux formes de l absence se mesurent SEPAREMENT : la colonne manquante
  // ci-dessus (`undefined`), l inscription commencee ici (`null`).
  { nom: '🔴 une inscription Stripe commencee (null) repasse pour un compte en ordre',
    fichier: REGLE,
    de: '  return commercant?.stripe_account_charges_enabled === true',
    vers: '  return commercant?.stripe_account_charges_enabled !== undefined' },

  { nom: '🔴 l ecran de reglage repose la question plus largement que la regle',
    fichier: CONFIG,
    de: '  const stripePret = compteEncaisse(commercant)',
    vers: '  const stripePret = !!commercant?.stripe_account_id && commercant?.stripe_account_charges_enabled !== false' },

  { nom: '🔴 la confirmation promet de nouveau une protection qui n existe pas',
    fichier: CONFIG,
    de: 'Réglage enregistré, mais aucune carte ne sera demandée tant que ton compte Stripe n’encaisse pas.',
    vers: 'Empreinte enregistrée.' },

  { nom: '🔴 la demande ne nomme plus la vraie cause du refus',
    fichier: DEMANDE,
    de: '    if (!compteEncaisse(commercant)) {',
    vers: '    if (false) {' },

  // ⚠️ ANCRE SUIVIE : la condition visait `peutDemander`, elle vise maintenant
  // la regle complete `raisonLienImpossible`. La mutation reste la meme : on
  // retire la garde du compte Stripe.
  { nom: '⚠️ l agenda propose de nouveau un lien qui ne partirait pas',
    fichier: DASH,
    de: '        {onDemanderEmpreinte && stripePret && !raisonLien && (',
    vers: '        {onDemanderEmpreinte && !raisonLien && (' },

  // ─── LA COLONNE ABSENTE QUI BLOQUAIT TOUTE TABLE (16/09, essai E2) ──────
  { nom: '🔴 la regle ne declare plus `capacite` parmi ses colonnes',
    fichier: COUVERTS,
    de: "export const COLONNES_COUVERTS = 'capacite, par_couverts, couverts_min, couverts_max'",
    vers: "export const COLONNES_COUVERTS = 'par_couverts, couverts_min, couverts_max'" },

  // ⚠️ CES DEUX-CI RECOPIENT LA LISTE A LA MAIN, exactement comme avant : la
  // ligne d import garde le nom, donc une garde qui cherchait le nom seul
  // serait restee VERTE.
  { nom: '🔴 la route de l empreinte recopie sa liste de colonnes a la main',
    fichier: EMPREINTE,
    de: '        `id, nom, duree_minutes, commercant_id, ${COLONNES_COUVERTS}`',
    vers: "        'id, nom, duree_minutes, commercant_id, par_couverts, couverts_min, couverts_max'" },

  // ─── LE LIEN ROUVERT ET L ENVOI RATE (16/09, essais F5 et F2 bis) ───────
  { nom: '🔴 « expire » repasse devant « deja garantie »',
    fichier: MODULE,
    de: "  if (raison === 'deja_garantie') {",
    vers: '  if (false) {' },

  { nom: '🔴 le jeton est de nouveau efface, la ligne devient introuvable',
    fichier: 'app/api/stripe/webhook/route.js',
    de: '      empreinte_debit_erreur: null,',
    vers: '      empreinte_debit_erreur: null, empreinte_demande_jeton_hash: null,' },

  { nom: '🔴 un SMS rate s annonce toujours comme envoye',
    fichier: DEMANDE,
    de: "        await supabase.from('rdv_reservations').update({ empreinte_demande_at: null, empreinte_demande_canal: null }).eq('id', rdv.id)",
    vers: '        // envoi rate, on ne touche a rien' },

  { nom: '⚠️ la demande d empreinte repasse par une fenetre du navigateur',
    fichier: DASH,
    de: "      titre: canal === 'sms' ? 'SMS envoyé' : 'Email envoyé',",
    vers: "      titre: alert('parti') || (canal === 'sms' ? 'SMS envoyé' : 'Email envoyé')," },

  // ─── DEUX ISSUES QUI N ONT PAS DE SENS (16/09, captures d Alex) ─────────
  { nom: '🔴 le no-show redevient possible avant l heure du service',
    fichier: DASH,
    de: "  const actionsVisibles = statut.actions.filter(a => a !== 'no_show' || noShowPossible(rdv, new Date()))",
    vers: '  const actionsVisibles = statut.actions' },

  { nom: '🔴 une absence se declare la veille',
    fichier: 'lib/confirmation-rdv.js',
    de: '  return maintenant >= debut',
    vers: '  return true' },

  { nom: '🔴 annuler une table repropose « je change d adresse »',
    fichier: 'lib/confirmation-rdv.js',
    de: '  const estTable = rdv?.prestation?.par_couverts === true',
    vers: '  const estTable = false' },

  // ─── L ECRAN OFFRAIT UN LIEN QUE LE SERVEUR REFUSAIT (16/09) ────────────
  { nom: '🔴 l ecran ne regarde de nouveau que l heure du service',
    fichier: REGLE,
    de: "  return echeanceLien(rdv, commercant, maintenant) <= maintenant ? 'delai_passe' : null",
    vers: '  return null' },

  { nom: '🔴 le bouton ne suit plus la regle complete',
    fichier: DASH,
    de: '        {onDemanderEmpreinte && stripePret && !raisonLien && (',
    vers: '        {onDemanderEmpreinte && stripePret && (' },

  { nom: '🔴 le bouton disparait sans dire pourquoi',
    fichier: DASH,
    de: '        {onDemanderEmpreinte && messageLienImpossible(raisonLien) && (',
    vers: '        {false && messageLienImpossible(raisonLien) && (' },

  { nom: '🔴 le commercant n arrive plus jusqu a la carte (le delai retombe a 24 h)',
    fichier: DASH,
    de: '              stripePret={compteEncaisse(commercant)} commercant={commercant}',
    vers: '              stripePret={compteEncaisse(commercant)}' },

  // ─── UNE ERREUR DE LECTURE N EST PAS UNE TABLE INTROUVABLE (16/09) ──────
  { nom: '🔴 la demande rejette de nouveau son erreur de lecture',
    fichier: DEMANDE,
    de: '    const { data: rdv, error: erreurLecture } = await supabase',
    vers: '    const { data: rdv } = await supabase; const erreurLecture = null; void supabase' },

  { nom: '🔴 le debit du no-show rejette de nouveau la sienne',
    fichier: 'app/api/rdv/empreinte-debiter/route.js',
    de: '    const { data: rdv, error: erreurLecture } = await supabase',
    vers: '    const { data: rdv } = await supabase; const erreurLecture = null; void supabase' },

  { nom: '🔴 le message reparle de « TA table » au restaurateur',
    fichier: DASH,
    de: '      details: \'Sa table est déjà réservée. S’il ne clique pas, elle le reste, simplement sans garantie.\',',
    vers: '      details: \'Ta table reste réservée tant qu’il n’a pas confirmé.\',' },

  { nom: '🔴 un envoi rate ne dit plus pourquoi',
    fichier: DASH,
    de: "        message: j?.error || 'Le lien n’a pas pu partir. Réessaie dans un instant.',",
    vers: "        message: 'Le lien n’a pas pu partir. Réessaie dans un instant.'," },

  // ─── LE SMS NE PARTAIT NULLE PART (16/09, essai F2) ─────────────────────
  // 🔴 Brevo n accepte que le format international : le numero tape par le
  // restaurateur etait refuse a chaque envoi.
  // ─── COMBIEN DE FOIS LE LIEN EST PARTI (16/09, demande d Alex) ──────────
  { nom: '🔴 la premiere fois ecrit « 1 fois »',
    fichier: REGLE,
    de: '  if (!Number.isFinite(n) || n <= 1) return `Lien envoyé par ${parQuoi}, pas encore confirmé.`',
    vers: '  if (!Number.isFinite(n) || n < 1) return `Lien envoyé par ${parQuoi}, pas encore confirmé.`' },

  { nom: '🔴 un compteur illisible ecrit « NaN fois »',
    fichier: REGLE,
    de: '  const n = Math.floor(Number(envois))',
    vers: '  const n = envois' },

  { nom: '🔴 un envoi rate compte comme une relance',
    fichier: DEMANDE,
    de: '      const envois = await compterEnvoi(supabase, rdv)',
    vers: '      const envois = 1' },

  { nom: '🔴 le compteur ne suit plus l ecran apres une relance',
    fichier: DASH,
    de: '        empreinte_demande_envois: (Number(r.empreinte_demande_envois) || 0) + 1,',
    vers: '        empreinte_demande_envois: r.empreinte_demande_envois,' },

  // ─── LE SMS TIENT EN GSM-7, QUOI QU ON Y METTE (16/09) ──────────────────
  { nom: '🔴 le message n est plus mis en GSM-7 avant l envoi',
    fichier: SMS,
    de: '    await envoyerSms({ to: destinataire, contenu: versGsm7(contenu) })',
    vers: '    await envoyerSms({ to: destinataire, contenu })' },

  { nom: '🔴 l apostrophe typographique n est plus traduite (elle double le cout)',
    fichier: 'lib/gsm7.js',
    de: "  '’': \"'\", '‘': \"'\", '‚': ',', '‛': \"'\",",
    vers: "  '‘': \"'\", '‚': ',', '‛': \"'\"," },

  { nom: '🔴 un accent hors alphabet est garde tel quel',
    fichier: 'lib/gsm7.js',
    de: "    const sansAccent = caractere.normalize('NFD').replace(MARQUES, '')",
    vers: '    const sansAccent = caractere' },

  { nom: '⚠️ un caractere admis est retire alors qu il passait',
    fichier: 'lib/gsm7.js',
    de: '  return BASE.includes(caractere) || EXTENSION.includes(caractere)',
    vers: '  return /[A-Za-z0-9 ]/.test(caractere)' },

  { nom: '🔴 le numero repart au format national chez Brevo',
    fichier: SMS,
    de: '    await envoyerSms({ to: destinataire, contenu: versGsm7(contenu) })',
    vers: '    await envoyerSms({ to: telephone, contenu: versGsm7(contenu) })' },

  { nom: '🔴 un numero invalide coute de nouveau un credit',
    fichier: SMS,
    de: "  if (!destinataire) return { ok: false, raison: 'telephone_invalide' }",
    vers: '  if (!destinataire) { /* on continue */ }' },

  { nom: '⚠️ le restaurateur ne sait plus quoi corriger',
    fichier: DEMANDE,
    de: "          telephone_invalide: 'Ce numéro n’est pas un numéro belge valable. Corrige-le, ou envoie le lien par email.',",
    vers: '' },

  // ─── L EMAIL DE CONFIRMATION (16/09, essai E6) ──────────────────────────
  { nom: '🔴 l email de confirmation ne dit plus le montant garanti',
    fichier: MAIL,
    de: '${garantie > 0 ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Garantie</td>',
    vers: '${false ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Garantie</td>' },

  { nom: '🔴 il repromet le remboursement d un acompte qui n existe pas',
    fichier: MAIL,
    de: "              aAcompte ? 'Ton acompte revient sur ton moyen de paiement en 5 à 10 jours.' : null,",
    vers: "              'Remboursement automatique de l\\'acompte en 5 à 10 jours.'," },

  { nom: '🔴 le bloc d annulation ne redit plus ce qui peut etre facture',
    fichier: MAIL,
    de: '              garantie > 0',
    vers: '              false' },

  { nom: '🔴 le webhook ne charge plus l empreinte pour l email',
    fichier: 'app/api/stripe/webhook/route.js',
    de: '      empreinte_statut, empreinte_montant,',
    vers: '      empreinte_statut,' },

  { nom: '🔴 la route d emails ne passe plus le montant garanti',
    fichier: 'app/api/emails/rdv-confirme/route.js',
    de: "          empreinte_montant:       rdv.empreinte_statut === 'posee' ? Number(rdv.empreinte_montant) || 0 : 0,",
    vers: '          empreinte_montant:       0,' },

  // ⚠️ UNE DEMANDE NON CONFIRMEE NE GARANTIT RIEN : l annoncer serait faux.
  { nom: '⚠️ une empreinte seulement DEMANDEE s annonce comme garantie',
    fichier: 'app/api/stripe/webhook/route.js',
    de: "      empreinte_montant:       rdv.empreinte_statut === 'posee' ? Number(rdv.empreinte_montant) || 0 : 0,",
    vers: '      empreinte_montant:       Number(rdv.empreinte_montant) || 0,' },

  // ─── CE QUE STRIPE ACCEPTE, LU DANS LA BIBLIOTHEQUE INSTALLEE (16/09) ───
  // 🔴 LE PARAMETRE QUI BLOQUAIT TOUT : Stripe refusait l appel entier avec
  // « Received unknown parameter: setup_intent_data[usage] », et deux gardes
  // EXIGEAIENT ce parametre. Elles verifiaient ma memoire, pas l API.
  { nom: '🔴 la fiche reinvente le parametre `usage` que Stripe refuse',
    fichier: EMPREINTE,
    de: '      setup_intent_data: {',
    vers: "      setup_intent_data: { usage: 'off_session'," },

  { nom: '🔴 le lien « confirme ta table » le reinvente aussi',
    fichier: 'app/api/stripe/checkout/empreinte-lien/route.js',
    de: '      setup_intent_data: {',
    vers: "      setup_intent_data: { usage: 'off_session'," },

  // ⚠️ ET LA GARDE NE DOIT PAS SE CROIRE SATISFAITE SANS AVOIR RIEN LU : le
  // piege du tableau vide, ou `every()` rend vrai sur zero element.
  { nom: '⚠️ plus aucune cle a lire dans setup_intent_data',
    fichier: EMPREINTE,
    de: '      setup_intent_data: {',
    vers: '      setup_intent_donnees: {' },

  // ─── UNE TABLE GARANTIE N A QU UN SEUL MESSAGE (16/09) ─────────────────
  { nom: '🔴 le recapitulatif reparle de payer sur place sous une empreinte',
    fichier: FICHE,
    de: '                          ) : montantEmpreinte(commercant, prestationChoisie, couverts) > 0 ? (',
    vers: '                          ) : false ? (' },

  { nom: '🔴 le rappel sous le bouton redonne le delai une seconde fois',
    fichier: FICHE,
    de: '                  {montantEmpreinte(commercant, prestationChoisie, couverts) === 0 && (',
    vers: '                  {true && (' },

  { nom: '🔴 le seul message restant fige le delai au lieu de lire le reglage',
    fichier: FICHE,
    de: '                                  ? `Tu peux annuler ou reporter sans frais jusqu’à ${delaiAnnulationHeures(commercant)} h avant.`',
    vers: '                                  ? `Tu peux annuler ou reporter sans frais jusqu’à 24 h avant.`' },

  { nom: '🔴 la route gratuite recopie sa liste de colonnes a la main',
    fichier: RESERVER,
    de: '        .select(`id, nom, prix, acompte_pourcent, duree_minutes, commercant_id, duree_paliers, ${COLONNES_COUVERTS}`)',
    vers: "        .select('id, nom, prix, acompte_pourcent, duree_minutes, commercant_id, par_couverts, couverts_min, couverts_max, duree_paliers')" },
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
