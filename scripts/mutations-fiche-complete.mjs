// HARNAIS DE MUTATION — UNE FICHE N EST MONTREE QUE COMPLETE
//
// 🔴 CE QU ON MESURE (Alex, 28/09) : « je ne peux pas laisser les fiches non
// completees etre publiees ». Chaque mutation casse UNE garde, et le banc
// `verif:fiche-complete` doit rougir.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:fiche-complete

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:fiche-complete'

const REGLE = 'lib/fiche-complete.js'
const SERVEUR = 'lib/fiche-complete-server.js'
const PUBLIER = 'app/api/admin/publier/route.js'
const RELANCER = 'app/api/admin/relancer-fiche/route.js'
const DEMANDER = 'app/api/fiche/demander-publication/route.js'
const VALIDER = 'app/api/admin/valider/route.js'
const LISTE = 'app/api/admin/fiches-a-publier/route.js'
const BANDEAU = 'app/dashboard/BandeauFicheAPublier.js'
const SECTION = 'app/admin/SectionFichesAPublier.js'
const EMAILS = 'lib/resend.js'
const LANDING = 'app/components/LandingReveal.js'

const MUTATIONS = [
  // ─── LA LISTE D ALEX ─────────────────────────────────────────────────────
  { nom: '🔴 deux articles suffisent a publier',
    fichier: REGLE, de: '      atteint: nbCat >= MIN_CATALOGUE,', vers: '      atteint: nbCat >= 2,' },
  { nom: '🔴 une seule photo suffit',
    fichier: REGLE, de: '      atteint: nbPh >= MIN_PHOTOS,', vers: '      atteint: nbPh >= 1,' },
  { nom: '⚠️ un logo fait d espaces passe pour un logo',
    fichier: REGLE, de: "      atteint: !!String(c.logo_url || '').trim(),", vers: '      atteint: !!c.logo_url,' },
  { nom: '⚠️ des espaces comptent dans la presentation',
    fichier: REGLE, de: "      atteint: String(c.description || '').trim().length >= MIN_PRESENTATION,", vers: "      atteint: String(c.description || '').length >= MIN_PRESENTATION," },
  { nom: '⚠️ une semaine sans aucun jour ouvert passe pour des horaires',
    fichier: REGLE, de: '        && Object.values(c.horaires_detail).some(h => h?.ouvert)),', vers: '        && true),' },
  { nom: '⚠️ « encore 1 produits »',
    fichier: REGLE, de: '  const pluriel = n > 1', vers: '  const pluriel = true' },

  // ─── LES CRITERES QUI NE LE CONCERNENT PAS ───────────────────────────────
  //
  // 🔴 UN CRITERE IMPOSSIBLE A REMPLIR BLOQUE LA PUBLICATION A VIE.
  { nom: '🔴 un service en Exister doit fournir des horaires',
    fichier: REGLE, de: "  if (plan === 'exister' && commercant?.categorie === 'vitrine') return false", vers: '  if (false) return false' },
  { nom: '🔴 un commerce qui change d endroit doit fournir des horaires',
    fichier: REGLE, de: '  if (commercant?.siege_social_est_lieu_activite === false) return false', vers: '  if (false) return false' },
  { nom: '🔴 un paiement est exige en Exister, ou rien ne s encaisse',
    fichier: REGLE, de: "  return peut(commercant, 'paiement_ligne', maintenant) || peut(commercant, 'paiement_cash', maintenant)", vers: '  return true' },
  { nom: '🔴 les DEUX moyens de paiement sont exiges au lieu d un sur deux',
    fichier: REGLE, de: '  return stripeOK || cashOK', vers: '  return stripeOK && cashOK' },
  { nom: '⚠️ une boutique qui expedie passe avec le seul paiement sur place',
    fichier: REGLE, de: '  const { stripeOK, cashOK } = modesPaiementOuverts({ commercant, estDetail, modeBoutique })', vers: '  const { stripeOK, cashOK } = modesPaiementOuverts({ commercant, estDetail: false, modeBoutique })' },

  // ─── QUI ATTEND UNE MISE EN LIGNE ────────────────────────────────────────
  { nom: '⚠️ une fiche deja en ligne se fait relancer',
    fichier: REGLE, de: "export const PUBLICATIONS_EN_ATTENTE = ['en_attente', 'suspendu']", vers: "export const PUBLICATIONS_EN_ATTENTE = ['en_attente', 'suspendu', 'publie']" },
  { nom: '🔴 un compte non valide peut demander sa mise en ligne',
    fichier: REGLE, de: '  return STATUTS_ACCES_AUTORISE.includes(commercant?.statut)', vers: '  return true' },
  { nom: '⚠️ la phrase de relance colle ses manques sans « et »',
    fichier: REGLE, de: "  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`", vers: "  return mots.join(', ')" },

  // ─── LE SERVEUR DECIDE ───────────────────────────────────────────────────
  //
  // 🔴 LE DEFAUT MEME QUE CE CHANTIER FERME : une fiche incomplete en ligne.
  { nom: '🔴 Publier ne verifie plus la fiche',
    fichier: PUBLIER, de: '    if (!bilan.complet) {', vers: '    if (false) {' },
  { nom: '🔴 Publier est ouvert a tout compte connecte',
    fichier: PUBLIER, de: "    if (!(await adminVerifie(request, user))) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })", vers: '' },
  { nom: '🔴 Valider publie de nouveau la fiche',
    fichier: VALIDER, de: "      statut_publication: dejaEnLigne ? 'publie' : 'en_attente',", vers: "      statut_publication: 'publie'," },
  { nom: '⚠️ une demande de mise en ligne sur une fiche incomplete est acceptee',
    fichier: DEMANDER, de: '    if (!bilan.complet) {', vers: '    if (false) {' },
  { nom: '⚠️ deux clics simultanes envoient deux alertes',
    fichier: DEMANDER, de: "      .is('publication_demandee_at', null)", vers: "      .eq('id', commercant_id)" },
  { nom: '⚠️ une fiche complete se fait quand meme relancer',
    fichier: RELANCER, de: '    if (bilan.complet) {', vers: '    if (false) {' },
  { nom: '🔴 une relance ratee est comptee comme envoyee',
    fichier: RELANCER, de: '    if (!envoi?.ok) {', vers: '    if (false) {' },
  { nom: '⚠️ la liste melange des comptes non valides',
    fichier: LISTE, de: "      .in('statut', STATUTS_ACCES_AUTORISE)", vers: '' },

  // ─── LE COMMERCANT ET LE SERVEUR COMPTENT LA MEME CHOSE ──────────────────
  { nom: '⚠️ le serveur compte les prestations supprimees',
    fichier: SERVEUR, de: ".eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null), 'prestations'),", vers: ".eq('commercant_id', commercantId).eq('actif', true), 'prestations')," },
  { nom: '🔴 une erreur de comptage passe pour un zero',
    fichier: SERVEUR, de: '  if (error) throw new Error(`comptage des ${quoi} impossible : ${error.message}`)', vers: '  if (false) throw new Error(quoi)' },
  { nom: '⚠️ l encart compte les photos sans image',
    fichier: BANDEAU, de: ".eq('commercant_id', commercant.id).not('url', 'is', null)),", vers: ".eq('commercant_id', commercant.id))," },
  { nom: '⚠️ l encart s affiche sur une fiche deja en ligne',
    fichier: BANDEAU, de: '  if (!concerne) return null', vers: '  if (false) return null' },
  { nom: '⚠️ le bouton Demander s allume sur une fiche incomplete',
    fichier: BANDEAU, de: '<button onClick={demander} disabled={!bilan.complet || envoi}', vers: '<button onClick={demander} disabled={envoi}' },
  { nom: '⚠️ le bouton Publier s affiche sur une fiche incomplete',
    fichier: SECTION, de: '{f.complet && (', vers: '{true && (' },

  // ─── CE QU ON ECRIT ──────────────────────────────────────────────────────
  { nom: '🔴 le nom du commerce entre brut dans la relance',
    fichier: EMAILS, de: 'Bonjour <strong>${echapperHtml(nom)}</strong>, ton espace', vers: 'Bonjour <strong>${nom}</strong>, ton espace' },
  { nom: '⚠️ la relance ne montre plus ce qui est deja fait',
    fichier: EMAILS, de: "        ${k.atteint ? 'Fait' : echapperHtml(k.avancement || 'À faire')}", vers: "        ${echapperHtml(k.avancement || 'À faire')}" },

  // ─── L INSCRIPTION EN 3 ETAPES (Alex, 06/10) ─────────────────────────────
  // ⚠️ Les trois mutations du compteur de la presentation (29/09) sont
  // RETIREES : le compteur a quitte l inscription avec la presentation.
  { nom: '🔴 le dossier part sans les CGU',
    fichier: 'app/signup/page.js', de: '  const peutSoumettre = kybRempli && cguCochees', vers: '  const peutSoumettre = kybRempli' },
  { nom: '🔴 Demande envoyee sur une fiche restee brouillon',
    fichier: 'app/signup/page.js', de: '    if (cErr || !c) {', vers: '    if (false) {' },
  { nom: '🔴 la route accepte une ancienne version des CGU',
    fichier: 'app/api/commercant/accepter-cgu/route.js', de: '    if (version !== CGU_COMMERCANT_VERSION) {', vers: '    if (false) {' },
  { nom: '🔴 n importe qui accepte au nom d un commerce',
    fichier: 'app/api/commercant/accepter-cgu/route.js', de: '    if (!ids.includes(commercant_id)) {', vers: '    if (false) {' },
  { nom: '🔴 les inscrits d avant entrent sans accepter',
    fichier: 'app/dashboard/page.js', de: '  if (commercant && !impersonating && !cguAJour(commercant)) return (', vers: '  if (false) return (' },
  { nom: '🔴 la base laisse le navigateur ecrire l acceptation',
    fichier: 'migrations/MIGRATION_CGU_COMMERCANT.sql', de: '  IF auth.uid() IS NULL THEN', vers: '  IF true THEN' },
  { nom: '🔴 une inscription de l ancien parcours tombe sur une etape qui n existe plus',
    fichier: 'lib/etapes-inscription.js', de: '  return Math.min(n, DERNIERE_ETAPE)', vers: '  return n' },
  { nom: '🔴 la presentation bloque de nouveau l inscription', banc: 'verif:fiche-complete',
    fichier: 'app/signup/page.js', de: '    form.telephone.trim().length >= 8 &&', vers: '    form.telephone.trim().length >= 8 && String(commercant.description || \'\').trim().length >= 20 &&' },
  { nom: '⚠️ le score d inscription reprend son propre seuil',
    fichier: 'lib/score-onboarding.js', de: "      atteint: (commercant.description || '').trim().length >= MIN_PRESENTATION,", vers: "      atteint: (commercant.description || '').trim().length >= 20," },
  { nom: '🔴 le bloc renvoie de nouveau vers une fiche publique inexistante',
    fichier: SECTION, de: '              <button onClick={() => voir(f)} disabled={occupe}', vers: '              <a href={`/commander/${f.slug}`} onClick={() => voir(f)} disabled={occupe}' },

  { nom: '🔴 le titre de la landing promet de nouveau la page en ligne',
    // ⚠️ ANCRE REPOINTEE LE 06/10 : trois etapes, plus cinq.
    fichier: LANDING, de: '                Trois étapes, et ton espace s&rsquo;ouvre.', vers: '                Trois étapes, et ta page part en ligne.' },
  { nom: '🔴 la maquette de la landing remontre cinq etapes',
    fichier: LANDING, de: "          {['Compte', 'L’essentiel', 'Vérification'].map((e, i) => (", vers: "          {['Compte', 'Infos', 'Visuels', 'Horaires', 'Validation'].map((e, i) => (" },
  { nom: '⚠️ l avertissement des papiers disparait de l inscription',
    fichier: 'app/signup/page.js', de: '          Avant de commencer, garde ceci sous la main', vers: '          Bon à savoir' },

  // ─── CHAQUE IMAGE DANS LE DOSSIER DE SON COMMERCE (29/09) ────────────────
  { nom: '🔴 les images retombent a la racine du bucket',
    fichier: 'lib/stockage-images.js', de: '  return `${cid}/${n}`', vers: '  return n' },
  { nom: '⚠️ une image sans commerce se range quand meme',
    fichier: 'lib/stockage-images.js', de: "  if (!cid) throw new Error('image sans commerce : impossible de la ranger')", vers: '  if (false) throw new Error()' },
  { nom: '🔴 un envoi du tableau de bord echappe a la regle',
    fichier: 'app/dashboard/ConfigDashboard.js', de: 'const fileName = cheminImage(commercantId, `cover-${commercantId}-${Date.now()}.jpg`)', vers: 'const fileName = `cover-${commercantId}-${Date.now()}.jpg`' },
  { nom: '⚠️ une suppression vise de nouveau le dernier segment',
    fichier: 'app/dashboard/ConfigDashboard.js', de: '      const objectName = objetDepuisUrl(photo.url)', vers: "      const objectName = (photo.url || '').split('/').pop()" },
  { nom: '⚠️ le chemin relu garde le parametre de l adresse',
    fichier: 'lib/stockage-images.js', de: "  const brut = s.slice(i + marque.length).split('?')[0].split('#')[0]", vers: '  const brut = s.slice(i + marque.length)' },

  // 🔴 LA LANDING PROMETTRAIT DE NOUVEAU UNE MISE EN LIGNE A LA VALIDATION.
  { nom: '🔴 la landing promet encore la mise en ligne des la validation', banc: 'verif:lancement',
    fichier: LANDING, de: 'Ta commune est déjà ouverte et ta page part en ligne dès qu&rsquo;elle est complète.', vers: 'Ta commune est déjà ouverte et ta page part en ligne dès sa validation.' },

  // ─── PAS D ESPACE OUVERT NI DE FICHE EN LIGNE SANS KYB (06/10) ──────────
  { nom: '🔴 la regle laisse passer un KYB en attente',
    fichier: 'lib/statut-commercant.js', de: '  if (commercant?.[COLONNE_KYB] === KYB_VALIDE) return null', vers: "  if (commercant?.[COLONNE_KYB] !== 'rejete') return null" },
  { nom: '🔴 Valider ouvre sans lire le KYB',
    fichier: VALIDER, de: '    const refusIdentite = refusKyb(existant)', vers: '    const refusIdentite = null' },
  { nom: '🔴 Publier met en ligne sans lire le KYB',
    fichier: PUBLIER, de: '    const refusIdentite = refusKyb(identite)', vers: '    const refusIdentite = null' },
  { nom: '🔴 Publier prend une lecture ratee pour un feu vert',
    fichier: PUBLIER, de: "    if (errKyb) return NextResponse.json({ ok: false, error: `vérification du KYB impossible : ${errKyb.message}` }, { status: 500 })", vers: '' },
  { nom: '🔴 la fenetre Modifier publie de nouveau',
    fichier: 'app/admin/ModalEditCommercant.js', de: '    if (form.statut_publication === PUBLICATION_OUVERTE && commercant.statut_publication !== PUBLICATION_OUVERTE) {', vers: '    if (false) {' },
  { nom: '🔴 la base laisse publier sans KYB',
    fichier: 'migrations/MIGRATION_KYB_AVANT_PUBLICATION.sql', de: "    IF NEW.statut_publication = 'publie'", vers: "    IF NEW.statut_publication = 'jamais'" },

  // ─── LA FIN DE LA CARTE, LA DECLARATION SUR L HONNEUR (Alex, 09/10) ─────
  { nom: '🔴 la declaration accepte un numero faux',
    fichier: 'lib/declaration.js', de: '  if (p.length < 2 || n.length < 2 || !c || !v.valide) return null', vers: '  if (p.length < 2 || n.length < 2 || !c) return null' },
  { nom: '🔴 une ancienne declaration vaut la nouvelle',
    fichier: 'lib/declaration.js', de: '  return commercant?.declaration_version === DECLARATION_VERSION', vers: '  return !!commercant?.declaration_version' },
  { nom: '⚠️ l adresse IP gardee est celle du dernier relais',
    fichier: 'lib/declaration.js', de: "  const ip = (lire('x-forwarded-for').split(',')[0] || lire('x-real-ip')).trim().slice(0, 64) || null", vers: "  const ip = (lire('x-forwarded-for').split(',').pop() || lire('x-real-ip')).trim().slice(0, 64) || null" },
  { nom: '🔴 la route enregistre un texte que personne n a lu',
    fichier: 'app/api/commercant/declarer/route.js', de: '    if (!texteServeur || texte !== texteServeur) {', vers: '    if (!texteServeur) {' },
  { nom: '🔴 n importe qui declare au nom d un commerce',
    fichier: 'app/api/commercant/declarer/route.js', de: '    if (!fiche || fiche.auth_user_id !== user.id) {', vers: '    if (!fiche) {' },
  { nom: '🔴 la requete ecrase le numero de la fiche',
    fichier: 'app/api/commercant/declarer/route.js', de: '    const bce = bceFiche.valide ? bceFiche.raw : (bceDemande.valide ? bceDemande.raw : null)', vers: '    const bce = bceDemande.valide ? bceDemande.raw : (bceFiche.valide ? bceFiche.raw : null)' },
  { nom: '🔴 la preuve perd l adresse IP',
    fichier: 'app/api/commercant/declarer/route.js', de: '      ip,', vers: '      ip: null,' },
  { nom: '🔴 les inscrits d avant entrent sans declarer',
    fichier: 'app/dashboard/page.js', de: '  if (commercant && !impersonating && !declarationAJour(commercant)) return (', vers: '  if (false) return (' },
  { nom: '🔴 le dossier part sans la declaration',
    fichier: 'app/signup/page.js', de: '      if (!rDecl.ok || !jDecl?.ok) {', vers: '      if (false) {' },
  { nom: '🔴 le texte declare suit la saisie en cours, pas la fiche',
    fichier: 'app/signup/page.js', de: '    prenom: commercant.representant_legal_prenom,', vers: '    prenom: commercant.representant_legal_prenom_saisi,' },
  { nom: '🔴 la carte d identite redevient obligatoire',
    fichier: 'app/signup/page.js', de: "  if (!commercant.representant_legal_nom) kybManques.push('nom du représentant légal')", vers: "  if (!commercant.representant_legal_nom) kybManques.push('nom du représentant légal'); kybManques.push('carte d’identité')" },
  { nom: '🔴 l admin valide sans declaration',
    fichier: 'app/api/admin/kyb/valider/route.js', de: '    if (avant.declaration_version !== DECLARATION_VERSION) {', vers: '    if (false) {' },
  { nom: '🔴 le journal KYB redevient muet',
    fichier: 'app/api/admin/kyb/rejeter/route.js', de: "      journal: errJournal ? `echec : ${errJournal.message}` : 'ecrit',", vers: "      journal: 'ecrit'," },
  { nom: '🔴 le compte de paiement s ecrit de nouveau avec le jeton du commercant',
    fichier: 'app/api/stripe/connect/create-account-link/route.js', de: '      const { error: errLien } = await admin', vers: '      const { error: errLien } = await supabase' },
  { nom: '🔴 la route d etat ecrit de nouveau avec le jeton du commercant',
    fichier: 'app/api/stripe/connect/refresh-status/route.js', de: '    const { error: errMaj } = await clientAdmin()', vers: '    const { error: errMaj } = await supabase' },
  { nom: '🔴 la suppression d un commerce efface la preuve des CGU',
    fichier: 'app/api/admin/commercants/route.js', de: "      'admin_impersonations', 'admin_validations',", vers: "      'admin_impersonations', 'admin_validations', 'cgu_acceptations'," },
  { nom: '🔴 le verrou oublie l identifiant du compte Stripe',
    fichier: 'migrations/MIGRATION_VERIFICATION_2_VERROUS_FIN_CARTE.sql', de: '  IF NEW.stripe_account_id                IS DISTINCT FROM OLD.stripe_account_id', vers: '  IF false' },
  { nom: '🔴 l admin peut changer le compte de paiement depuis le navigateur',
    fichier: 'migrations/MIGRATION_VERIFICATION_2_VERROUS_FIN_CARTE.sql', de: '  IF NEW.stripe_account_id                IS DISTINCT FROM OLD.stripe_account_id', vers: '  IF public.is_yoppaa_admin() THEN RETURN NEW; END IF; IF NEW.stripe_account_id IS DISTINCT FROM OLD.stripe_account_id' },
  { nom: '🔴 une entreprise verifiee change d identite',
    fichier: 'migrations/MIGRATION_VERIFICATION_2_VERROUS_FIN_CARTE.sql', de: "  IF coalesce(OLD.kyb_statut, '') = 'valide'", vers: "  IF coalesce(OLD.kyb_statut, '') = 'jamais'" },
  { nom: '🔴 le journal des declarations s ouvre au navigateur',
    fichier: 'migrations/MIGRATION_VERIFICATION_1_DECLARATION.sql', de: 'REVOKE ALL ON public.declarations_honneur FROM PUBLIC, anon, authenticated;', vers: 'GRANT SELECT ON public.declarations_honneur TO authenticated;' },
  { nom: '🔴 la preuve disparait avec le compte',
    fichier: 'migrations/MIGRATION_VERIFICATION_1_DECLARATION.sql', de: '  commercant_id       uuid REFERENCES public.commercants(id) ON DELETE SET NULL,', vers: '  commercant_id       uuid REFERENCES public.commercants(id) ON DELETE CASCADE,' },
  { nom: '🔴 une regle d acces aux cartes survit a la migration',
    fichier: 'migrations/MIGRATION_VERIFICATION_2_VERROUS_FIN_CARTE.sql', de: 'DROP POLICY IF EXISTS kyb_select_own_or_admin ON storage.objects;', vers: '' },
  { nom: '🔴 la page admin valide avec le jeton de l ouverture (avant le code)',
    fichier: 'app/admin/page.js', de: "      const res = await fetch('/api/admin/valider', {", vers: "      const jetonOuverture = session.access_token; const res = await fetch('/api/admin/valider', {" },
  { nom: '🔴 la section KYB reprend un jeton garde en memoire',
    fichier: 'app/admin/SectionKYBAValider.js', de: '    const jeton = await jetonActuel()', vers: '    const jeton = window.__jetonGarde' },
  { nom: '🔴 une lecture ratee des fiches renvoie de nouveau a la connexion, sans un mot',
    fichier: 'app/dashboard/page.js', de: '      if (errFiches) {', vers: '      if (false) {' },
  { nom: '🔴 le script supprime sans l identifiant du projet',
    fichier: 'scripts/supprimer-cartes-identite.mjs', de: 'if (projetConfirme !== ref) {', vers: 'if (false) {' },
]

const lancer = (banc = BANC) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const BANCS = [...new Set(MUTATIONS.map((m) => m.banc || BANC))]
for (const banc of BANCS) {
  const depart = lancer(banc)
  if (depart.rouge) {
    console.log(`🔴 ${banc} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
    console.log(depart.extrait)
    process.exit(1)
  }
}
console.log(`Bancs verts au départ : ${BANCS.join(', ')}.\n`)

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
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = BANCS.some((banc) => lancer(banc).rouge)
if (finalRouge) console.log(`🔴 UN BANC EST ROUGE APRÈS RESTAURATION (${BANCS.join(', ')}).`)
else console.log('\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
