// HARNAIS DE MUTATION — « TON ACCÈS » (23/09)
//
// 🔴 CE QU ON MESURE. Le commercant peut desormais changer son email de
// connexion et son mot de passe lui-meme. Les deux gestes touchent a son
// identite, et les deux ont une forme fausse qui MARCHE A L ESSAI :
//
//   • `updateUser({ password })` sans `nonce` passe quand la session a moins
//     de 24 heures. En essai on vient de se connecter, donc ca marche. Chez un
//     commercant connecte depuis une semaine, ca refuse ; et sur une tablette
//     restee ouverte au comptoir, n importe qui prend le compte.
//   • `updateUser({ email })` REUSSIT sans rien changer : avec `Secure email
//     change`, la bascule attend DEUX confirmations. Un ecran qui annonce
//     « c est change » ment a tous les coups.
//
// Chacune des mutations ci-dessous remet une de ces formes fausses. Si le banc
// reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-acces-compte.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:acces-compte'
const MODULE = 'app/dashboard/ConfigDashboard.js'

const TRAD = 'lib/messages-auth.js'
const SQL_EMAIL = 'migrations/MIGRATION_SYNC_EMAIL_COMMERCANT.sql'
const SQL_REVOKE = 'migrations/MIGRATION_REVOQUER_ANON_COMMERCANTS_SIGNALEMENTS.sql'
const BILLING = 'lib/stripe-billing.js'
const FACTURATION = 'app/api/dashboard/facturation/route.js'
const PORTAIL = 'app/api/stripe/billing/portal/route.js'
const SQL_SUIVI = 'migrations/MIGRATION_SYNC_EMAIL_COMMERCANT_SUIVI_SEUL.sql'
const RETOUR_EMAIL = 'app/auth/email-change/page.js'
const LOGIN = 'app/login/page.js'

const MUTATIONS = [
  // ═══ LE COMPORTEMENT : LA TRADUCTION DES REFUS ═════════════════════════
  //
  // 🔴 LE PIEGE DEJA PAYE SUR LA TABLE DES RETOURS STRIPE. `'constructor' in
  // PAR_CODE` est VRAI par heritage : l ecran afficherait alors
  // « function Object() { [native code] } » a un commercant.
  { nom: '🔴 l acces au dictionnaire repasse par l heritage',
    fichier: TRAD,
    de: 'if (code && Object.hasOwn(PAR_CODE, code)) return PAR_CODE[code]',
    vers: 'if (code && (code in PAR_CODE)) return PAR_CODE[code]',
    garde: 'le code « constructor » ne fait pas sortir un objet du prototype' },

  // 🔴 LE CODE DOIT PASSER AVANT LE TEXTE. Un aiguillage sur le message anglais
  // est juste aujourd hui et faux a la prochaine version de GoTrue.
  { nom: '🔴 le code cesse d etre consulte, seul le texte anglais decide',
    fichier: TRAD,
    de: 'if (code && Object.hasOwn(PAR_CODE, code)) return PAR_CODE[code]',
    vers: 'if (false && Object.hasOwn(PAR_CODE, code)) return PAR_CODE[code]',
    garde: 'un code connu l’emporte sur un message trompeur' },

  { nom: '⚠️ le repli cesse de dire le code HTTP, donc la trace est perdue',
    fichier: TRAD,
    de: "const n = Number.isFinite(Number(statut)) && Number(statut) > 0 ? ` (erreur ${statut})` : ''",
    vers: "const n = ''",
    garde: 'un refus inconnu rend une phrase française avec le code HTTP' },

  // ⚠️ SANS ERREUR, ON NE FAIT PAS SURGIR UN MESSAGE. Rendre une phrase sur une
  // reussite ferait clignoter un refus apres un succes.
  { nom: '⚠️ une absence d erreur rend quand meme une phrase',
    fichier: TRAD,
    de: 'if (!erreur) return null',
    vers: 'if (!erreur) return repli(0)',
    garde: 'aucune erreur rend null, jamais une phrase' },

  // 🔴 LA LONGUEUR SE COMPTE EN CARACTERES REELS. `.length` compte les unites
  // UTF-16 : un mot de passe de cinq emoji passerait pour dix caracteres, et
  // l ecran accepterait ce que le serveur refuse.
  { nom: '🔴 la longueur se remet a compter en unites UTF-16',
    fichier: TRAD,
    de: 'return Array.from(mdp).length',
    vers: 'return mdp.length',
    garde: 'un emoji compte pour un caractère' },

  { nom: '🔴 le minimum retombe a l ancienne valeur de Supabase',
    fichier: TRAD,
    de: 'export const MDP_MIN = 10',
    vers: 'export const MDP_MIN = 6',
    garde: 'le minimum du mot de passe est celui réglé chez Supabase le 12/09' },

  // 🔴 « DEJA TON ADRESSE » SE JUGE SANS LA CASSE, sinon l ecran laisse demander
  // un changement qui n en est pas un.
  { nom: '🔴 la comparaison des adresses redevient sensible a la casse',
    fichier: TRAD,
    de: "return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()",
    vers: "return String(a || '').trim() === String(b || '').trim()",
    garde: 'la même adresse en majuscules est reconnue' },

  { nom: '⚠️ une adresse sans point de domaine redevient plausible',
    fichier: TRAD,
    de: 'return /^[^@]+@[^@.]+(\\.[^@.]+)+$/.test(v)',
    vers: 'return /^[^@]+@[^@]+$/.test(v)',
    garde: 'une adresse sans point de domaine est refusée' },

  // ═══ L ECRAN : CE QUI TOUCHE A L IDENTITE ══════════════════════════════
  //
  // 🔴 LA MUTATION LA PLUS IMPORTANTE DU LOT. Sans nonce, le mot de passe
  // change sans preuve d identite des que la session a moins de 24 heures,
  // c est-a-dire exactement le cas de la tablette du comptoir.
  { nom: '🔴 le mot de passe change SANS preuve d identite',
    de: 'await supabase.auth.updateUser({ password: mdp, nonce })',
    vers: 'await supabase.auth.updateUser({ password: mdp })',
    garde: 'le changement de mot de passe passe un nonce à Supabase' },

  { nom: '🔴 plus aucun code n est envoye par email',
    de: 'await supabase.auth.reauthenticate()',
    vers: 'await supabase.auth.getUser()',
    garde: 'et le nonce vient de reauthenticate(), pas d’ailleurs' },

  // 🔴 LA SECONDE MUTATION MAJEURE. L ecran annonce une bascule que les deux
  // confirmations n ont pas encore faite : le commercant s en apercoit a la
  // connexion suivante, quand il ne peut plus entrer.
  { nom: '🔴 l ecran annonce un changement d email qui n a pas eu lieu',
    de: "toast('Deux emails de confirmation sont partis.', 'success')",
    vers: "toast('Ton adresse email est bien changée.', 'success')",
    garde: 'la réussite de la demande d’email n’annonce pas un changement' },

  { nom: '🔴 l ecran promet que le changement est immediat',
    de: 'Tant que les deux ne sont pas confirmées, rien ne change.',
    vers: 'Le changement est immédiat.',
    garde: 'et l’écran dit que rien ne change avant les deux confirmations' },

  // ⚠️ UN NONCE NE SERT QU UNE FOIS. Le laisser affiche invite a recommencer
  // avec un code consomme, et le refus passe pour un mot de passe rejete.
  { nom: '⚠️ le code deja consomme reste affiche apres la reussite',
    de: "setEtapeMdp('repos'); setCode(''); setMdp(''); setMdpBis('')",
    vers: "setEtapeMdp('repos'); setMdp(''); setMdpBis('')",
    garde: 'le code est vidé après un changement réussi' },

  { nom: '🔴 les deux saisies du mot de passe ne sont plus comparees',
    de: "if (mdp !== mdpBis) { toast('Les deux mots de passe ne sont pas identiques.', 'error'); return }",
    vers: "if (false) { toast('Les deux mots de passe ne sont pas identiques.', 'error'); return }",
    garde: 'les deux saisies du mot de passe sont comparées' },

  // 🔴 UN ESPACE FINAL FAIT PARTIE DU MOT DE PASSE. Comparer apres `trim`
  // laisserait enregistrer autre chose que ce qui a ete tape.
  { nom: '🔴 la comparaison rogne les espaces, donc accepte deux saisies differentes',
    de: 'if (mdp !== mdpBis)',
    vers: 'if (mdp.trim() !== mdpBis.trim())',
    garde: 'et elles sont comparées brutes, sans trim' },

  // 🔴 LE DEFAUT QUI A COUTE SON ACCES ADMIN A ALEX, LE 24/09. L ecran affichait
  // un dossier et la demande portait sur LA SESSION.
  { nom: '🔴 le bloc cesse de verifier que la session est celle du dossier',
    de: 'idSession === commercant.auth_user_id',
    vers: 'true',
    garde: 'le bloc vérifie que la session est bien celle du dossier affiché' },

  { nom: '🔴 deux absences font une egalite, et le bloc s affiche sans rien savoir',
    de: '!!idSession && !!commercant?.auth_user_id && idSession === commercant.auth_user_id',
    vers: 'idSession === commercant?.auth_user_id',
    garde: 'et il exige les deux identités, pas seulement leur égalité' },

  { nom: '🔴 les gestes restent affiches sur le dossier d un autre',
    de: 'if (memeCompte === false) {',
    vers: 'if (false) {',
    garde: 'quand ce n’est pas le même compte, les deux gestes disparaissent' },

  // ⚠️ AU PREMIER RENDU L ETAT VAUT `null` : un test negatif afficherait
  // l avertissement a tout le monde, une seconde, a chaque ouverture.
  { nom: '⚠️ « pas encore su » est confondu avec « pas le meme compte »',
    de: 'if (memeCompte === false) {',
    vers: 'if (!memeCompte) {',
    garde: 'et l’état « pas encore su » n’est pas confondu avec « pas le même »' },

  // 🔴 LE DEFAUT QU ALEX A VU EN PRODUCTION LE 23/09 : sans adresse de retour,
  // le gabarit compose `{{ .RedirectTo }}&token_hash=` avec un Site URL sans
  // `?`, et les deux liens menent a un 404.
  { nom: '🔴 la demande d email ne passe plus d adresse de retour',
    de: "      { emailRedirectTo: `${window.location.origin}/auth/email-change?next=/dashboard` },",
    vers: '      undefined,',
    garde: 'la demande de changement d’email passe une adresse de retour' },

  { nom: '🔴 le retour tombe sur l ecran de connexion au lieu du changement',
    de: '/auth/email-change?next=/dashboard`',
    vers: '/auth/confirm?next=/dashboard`',
    garde: 'et cette adresse mène à la page du changement d’email' },

  // ⚠️ LE `?` FAIT TOUT : le gabarit colle un `&` juste derriere.
  { nom: '🔴 l adresse de retour perd son « ? », et le « & » du gabarit tombe a faux',
    de: '/auth/email-change?next=/dashboard`',
    vers: '/auth/email-change`',
    garde: 'et elle porte un « ? », sans quoi le « & » du gabarit tombe à faux' },

  { nom: '⚠️ l ecran cesse de verifier la forme de l adresse',
    de: 'if (!emailPlausible(cible)) {',
    vers: 'if (false) {',
    garde: 'l’écran refuse une adresse qui n’en est pas une avant d’appeler Supabase' },

  { nom: '⚠️ l ecran laisse demander un changement vers la meme adresse',
    de: 'if (memeEmail(cible, emailActuel)) {',
    vers: 'if (false) {',
    garde: 'l’écran refuse de demander un changement vers la même adresse' },

  { nom: '⚠️ l ecran cesse de verifier la longueur avant d appeler Supabase',
    de: 'if (!mdpAssezLong(mdp)) {',
    vers: 'if (false) {',
    garde: 'l’écran vérifie la longueur avant d’appeler Supabase' },

  // ⚠️ LE NOMBRE RECOPIE. Le jour ou la console Supabase change le reglage,
  // l ecran annonce l ancien et fait taper deux fois.
  { nom: '⚠️ le minimum est recopie en dur dans l ecran',
    de: 'Au moins {MDP_MIN} caractères.',
    vers: 'Au moins 10 caractères.',
    garde: 'le minimum affiché vient du module, pas d’un nombre recopié' },

  { nom: '🔴 un mot de passe s affiche en clair a l ecran',
    de: 'type="password" autoComplete="new-password" placeholder="Retape-le"',
    vers: 'type="text" autoComplete="new-password" placeholder="Retape-le"',
    garde: 'les deux champs de mot de passe sont masqués' },

  // ⚠️ `replace` NE TOUCHE QUE LA PREMIERE OCCURRENCE, et c est exactement ce
  // qu on veut : le compte passe de trois a deux, donc la garde qui COMPTE
  // rougit. Une ancre a cheval sur deux lignes serait plus precise et
  // interdite ici : elle casse a la premiere reindentation.
  { nom: '⚠️ un refus arrive en anglais chez le commercant',
    de: "toast(messageAuth(error), 'error')",
    vers: "toast(error.message, 'error')",
    garde: 'les refus passent par la traduction française' },

  // 🔴 CE QUI A FAILLI FAIRE UN ECRAN BLANC, et que `verif:undef` n a pas vu
  // parce que `no-undef` est eteint sur ce depot.
  { nom: '🔴 `Ligne` redevient inatteignable depuis le bloc « Ton acces »',
    de: 'function Ligne({ quoi, valeur, fort = false }) {',
    vers: 'function LigneDeCarte({ quoi, valeur, fort = false }) {',
    garde: '`Ligne` est déclarée au niveau module, donc atteignable par les deux blocs' },

  { nom: '🔴 le bloc « Ton acces » perd le canal des messages',
    de: '<BlocAcces commercant={commercant} toast={toast} />',
    vers: '<BlocAcces commercant={commercant} />',
    garde: 'et le bloc « Ton accès » est bien branché dans l’onglet' },

  // ═══ LES DEUX MIGRATIONS ═══════════════════════════════════════════════
  { nom: '🔴 le trigger d email se declenche AVANT, donc sur une verite non acquise',
    fichier: SQL_EMAIL,
    de: 'AFTER UPDATE OF email ON auth.users',
    vers: 'BEFORE UPDATE OF email ON auth.users',
    garde: 'le trigger d’email se déclenche APRÈS, et seulement sur l’email' },

  { nom: '⚠️ le trigger tourne a chaque ecriture sur auth.users',
    fichier: SQL_EMAIL,
    de: 'WHEN (OLD.email IS DISTINCT FROM NEW.email)',
    vers: 'WHEN (true)',
    garde: 'et seulement quand l’email a vraiment changé' },

  // 🔴 UNE EXCEPTION NON CAPTUREE DANS UN TRIGGER SUR `auth.users` FAIT
  // ECHOUER L AUTHENTIFICATION ELLE-MEME.
  { nom: '🔴 le trigger peut faire echouer une connexion',
    fichier: SQL_EMAIL,
    de: 'EXCEPTION WHEN OTHERS THEN',
    vers: 'EXCEPTION WHEN no_data_found THEN',
    garde: 'elle ne peut pas faire échouer une authentification' },

  { nom: '🔴 la fonction SECURITY DEFINER perd son search_path fige',
    fichier: SQL_EMAIL,
    de: "SET search_path TO 'public'",
    vers: "SET statement_timeout TO '5s'",
    garde: 'la fonction est SECURITY DEFINER avec un search_path figé' },

  { nom: '⚠️ le droit d execution n est plus donne au role qui declenche',
    fichier: SQL_EMAIL,
    de: 'GRANT EXECUTE ON FUNCTION public.sync_email_commercant() TO supabase_auth_admin;',
    vers: 'GRANT EXECUTE ON FUNCTION public.sync_email_commercant() TO postgres;',
    garde: 'le droit d’exécution est donné explicitement' },

  // 🔴 LA MUTATION QUI FERMERAIT LE TABLEAU DE BORD A TOUT LE MONDE.
  { nom: '🔴 le REVOKE emporte `authenticated` avec `anon`',
    fichier: SQL_REVOKE,
    de: 'REVOKE ALL PRIVILEGES ON TABLE public.commercants  FROM anon;',
    vers: 'REVOKE ALL PRIVILEGES ON TABLE public.commercants  FROM authenticated;',
    garde: 'elle ne touche ni authenticated ni service_role' },

  { nom: '🔴 la migration confirme meme si les fiches publiques sont eteintes',
    fichier: SQL_REVOKE,
    de: "IF vue LIKE 'ECHEC%' THEN",
    vers: 'IF false THEN',
    garde: 'et elle s’annule si la vue publique ne répond plus' },

  { nom: '⚠️ la preuve se fait en postgres, donc elle ne prouve rien',
    fichier: SQL_REVOKE,
    de: 'SET LOCAL ROLE anon;',
    vers: 'SET LOCAL ROLE postgres;',
    garde: 'elle essaie pour de vrai, dans la peau d’anon' },

  // ═══ 23/09 : STRIPE GARDE SA PROPRE COPIE DE L EMAIL ═══════════════════
  //
  // 🔴 TROUVE SUR UNE QUESTION D ALEX. Le Customer etait cree avec l email et
  // plus rien ne remontait ; `customers.update` poussait le nom et l adresse en
  // laissant l email derriere. Frere exact du defaut du 22/09, meme document.
  { nom: '⚠️ la synchro redemande le Customer alors qu elle l a deja en main',
    fichier: BILLING,
    de: 'let customer = customerConnu',
    vers: 'let customer = null',
    garde: 'un email identique est reconnu, et rien n’est poussé' },

  { nom: '🔴 la comparaison des emails redevient sensible a la casse',
    fichier: BILLING,
    de: "if (memeEmail(customer.email, commercant.email)) return 'à jour'",
    vers: "if (customer.email === commercant.email) return 'à jour'",
    garde: 'un email identique est reconnu, et rien n’est poussé' },

  { nom: '⚠️ un Customer supprime chez Stripe est traite comme vivant',
    fichier: BILLING,
    de: "if (!customer || customer.deleted) return 'sans objet'",
    vers: "if (!customer) return 'sans objet'",
    garde: 'un Customer supprimé chez Stripe ne fait rien' },

  // 🔴 ELLE EST BRANCHEE SUR LE CHEMIN D UN PAIEMENT : annoncer « a jour »
  // quand Stripe n a pas repondu recreerait le silence qu on vient de fermer.
  { nom: '🔴 un echec Stripe passe pour une reussite',
    fichier: BILLING,
    de: "    return 'en retard'",
    vers: "    return 'à jour'",
    garde: 'Stripe injoignable ne fait pas échouer l’appelant, il rend « en retard »' },

  { nom: '🔴 le passage oblige des achats cesse de rattraper l email',
    fichier: BILLING,
    de: 'await synchroniserEmailCustomer(commercant, customer)',
    vers: 'await Promise.resolve()',
    garde: 'le passage obligé des achats rattrape l’email au retour du Customer' },

  { nom: '🔴 la route de facturation reoublie l email, comme le 22/09',
    fichier: FACTURATION,
    de: 'email: commercant.email || undefined,',
    vers: 'phone: commercant.telephone || undefined,',
    garde: 'la route de facturation pousse enfin l’email chez Stripe' },

  // 🔴 `null` N EST PAS `undefined` CHEZ STRIPE : le premier EFFACE le champ.
  { nom: '🔴 la route de facturation efface l email du Customer',
    fichier: FACTURATION,
    de: 'email: commercant.email || undefined,',
    vers: 'email: commercant.email || null,',
    garde: 'et elle ne risque pas d’effacer l’email chez Stripe' },

  { nom: '🔴 le portail s ouvre sans pousser l email',
    fichier: PORTAIL,
    de: 'await synchroniserEmailCustomer(commercant)',
    vers: 'await Promise.resolve()',
    garde: 'le portail pousse l’email avant de s’ouvrir' },

  // 🔴 LE DEFAUT LE PLUS FREQUENT DE CE DEPOT, ET LE PLUS MUET : sans la
  // colonne, `commercant.email` vaut `undefined`, la synchro rend « sans
  // objet », et personne ne le saurait jamais.
  { nom: '🔴 la colonne email disparait du select du portail',
    fichier: PORTAIL,
    de: ".select('id, stripe_customer_id, nom, email')",
    vers: ".select('id, stripe_customer_id, nom')",
    garde: 'et la colonne email est bien dans son select' },

  { nom: '⚠️ l ecran ne previent plus que le compte Stripe ne suit pas',
    de: 'Ton compte Stripe garde sa propre adresse.',
    vers: 'Tout est synchronise.',
    garde: 'l’écran dit que le compte Stripe garde sa propre adresse' },

  { nom: '⚠️ l avertissement Stripe s affiche meme a qui n encaisse pas',
    de: 'commercant?.stripe_account_id && (',
    vers: 'true && (',
    garde: 'et cette phrase ne s’affiche qu’à qui a un compte Stripe' },

  // ═══ 24/09 : L ECRAN DE CONNEXION ACCUSAIT LE MOT DE PASSE ═════════════
  //
  // 🔴 `if (err) setError('Email ou mot de passe incorrect')` ecrasait TOUTES
  // les causes. Alex a cherche une heure du mauvais cote : son adresse
  // n existait plus, et l ecran parlait de son mot de passe.
  { nom: '🔴 l ecran de connexion accuse de nouveau le mot de passe, quelle que soit la cause',
    fichier: LOGIN,
    de: "setError(messageAuth(err) || 'Email ou mot de passe incorrect.')",
    vers: "setError('Email ou mot de passe incorrect')",
    garde: 'l’écran de connexion traduit le vrai refus' },

  { nom: '⚠️ un refus sans message traduisible laisse l ecran muet',
    fichier: LOGIN,
    de: "messageAuth(err) || 'Email ou mot de passe incorrect.'",
    vers: 'messageAuth(err)',
    garde: 'et il garde un message même si la traduction rend null' },

  // 🔴 LE FLOU EST LA PROTECTION : dire qu une adresse est inconnue laisse
  // dresser la liste des comptes, une adresse apres l autre.
  { nom: '🔴 le refus revele que l adresse existe',
    fichier: TRAD,
    de: "invalid_credentials:         'Email ou mot de passe incorrect.',",
    vers: "invalid_credentials:         'Cette adresse est inconnue.',",
    garde: 'un refus d’identifiants ne dit pas lequel des deux est faux' },

  { nom: '⚠️ l ecran ne nomme plus la porte de secours',
    fichier: LOGIN,
    de: 'Passe par <strong style={{ color: \'#fff\' }}>Lien magique</strong>',
    vers: 'Essaie encore',
    garde: 'l’écran nomme le lien magique comme porte de secours' },

  // ⚠️ AFFICHEE D EMBLEE, elle invite a contourner le mot de passe ; sous le
  // lien magique, elle n a aucun sens.
  { nom: '⚠️ la sortie s affiche avant meme un refus',
    fichier: LOGIN,
    de: "{error && mode === 'password' && (",
    vers: '{true && (',
    garde: 'la sortie ne s’affiche qu’après un refus, en mode mot de passe' },

  // ═══ 23/09 : OU ATTERRISSENT LES DEUX LIENS ════════════════════════════
  //
  // 🔴 LES DEUX LIENS MENAIENT A UN 404, vu par Alex en essayant. Le gabarit
  // Supabase etait casse, ET la page d arrivee etait celle de la CONNEXION :
  // elle aurait dit « lien invalide » au premier des deux clics, alors que tout
  // s etait bien passe.
  { nom: '🔴 la page accepte n importe quel lien d authentification',
    fichier: RETOUR_EMAIL,
    de: "if (!token_hash || type !== 'email_change') {",
    vers: 'if (!token_hash) {',
    garde: 'elle refuse un lien qui n’est pas un changement d’adresse' },

  // 🔴 DEUX TENTATIVES DE DEVINER, DEUX MESSAGES FAUX EN PRODUCTION (23 et
  // 24/09). `verifyOtp` rend un utilisateur au PREMIER des deux clics mais ne
  // remplit pas `new_email` : aucune deduction ne peut fabriquer cette
  // information. L ecran ne l affirme donc plus.
  { nom: '🔴 l ecran recommence a annoncer que l adresse est changee',
    fichier: RETOUR_EMAIL,
    de: '            <p style={{ ...titre, color: T.vert }}>C’est confirmé de ce côté</p>',
    vers: '            <p style={{ ...titre, color: T.vert }}>Ton adresse est changée</p>',
    garde: 'l’écran n’annonce JAMAIS que l’adresse est changée' },

  { nom: '🔴 un etat deduit d une absence revient dans le code',
    fichier: RETOUR_EMAIL,
    de: "      setEtat('confirme')",
    vers: "      setEtat(data?.user ? 'fait' : 'confirme')",
    garde: 'et il ne reste aucun état déduit d’une absence' },

  { nom: '⚠️ l ecran ne rappelle plus qu il faut les DEUX liens',
    fichier: RETOUR_EMAIL,
    de: 'liens</strong> cliqués',
    vers: 'liens</strong> envoyés',
    garde: 'il rappelle que les DEUX liens sont nécessaires' },

  { nom: '⚠️ l ecran ne dit plus ou lire l adresse qui fait foi',
    fichier: RETOUR_EMAIL,
    de: 'l’adresse réellement en cours',
    vers: 'ton ancienne adresse',
    garde: 'et il renvoie vers la ligne qui fait foi' },

  { nom: '⚠️ un lien deja clique passe pour une panne',
    fichier: RETOUR_EMAIL,
    de: 'déjà servi',
    vers: 'peut-etre casse',
    garde: 'un lien déjà servi est expliqué, pas présenté comme une panne' },

  // 🔴 CE QUE FAIT `/auth/session`, ET QUI EST FAUX ICI.
  { nom: '🔴 la page renvoie vers « lien invalide » comme l ecran de connexion',
    fichier: RETOUR_EMAIL,
    de: "        setDetail(messageAuth(error))",
    vers: "        window.location.href = '/login?error=lien-invalide'",
    garde: 'et elle ne renvoie jamais vers « lien invalide »' },

  // ═══ 23/09 : LE TRIGGER PROPAGE, IL N IMPOSE PAS ═══════════════════════
  //
  // 🔴 MONTRE EN VRAI PAR LE CONTROLE D01, le soir meme de la migration.
  // « Chez Momo » se connecte avec le compte d Alex et recoit sur une boite
  // interne : la premiere version ecrasait ce choix au premier changement
  // d email, sur toutes les fiches du compte, en silence.
  { nom: '🔴 le trigger reecrit l adresse de TOUS les dossiers du compte',
    fichier: SQL_SUIVI,
    de: 'AND lower(email) = lower(OLD.email)',
    vers: 'AND true',
    garde: 'le trigger ne touche que les dossiers qui SUIVAIENT l’ancienne adresse' },

  { nom: '⚠️ le trigger se met a remplir les dossiers sans adresse',
    fichier: SQL_SUIVI,
    de: 'AND lower(email) = lower(OLD.email)',
    vers: 'AND (lower(email) = lower(OLD.email) OR email IS NULL)',
    garde: 'et il ne remplit pas un dossier sans adresse' },

  // ⚠️ RECOLLER L ANCIENNE MIGRATION REMETTRAIT L ANCIENNE FONCTION. Son
  // en-tete est la seule chose qui le dise.
  { nom: '⚠️ l ancienne migration ne previent plus qu elle ne doit pas etre recollee',
    fichier: SQL_EMAIL,
    de: 'NE PAS RECOLLER CE',
    vers: 'ON PEUT RECOLLER CE',
    garde: 'et l’ancienne migration prévient qu’elle ne doit plus être collée seule' },
]

// 🔴 LE HARNAIS A FAILLI MENTIR SUR SES PROPRES MESURES. Au premier passage,
// quatorze mutations sont ressorties « rouge sur une AUTRE garde » alors
// qu elles visaient juste : le banc écrit « d'ailleurs » avec une apostrophe
// DROITE, le harnais cherchait « d’ailleurs » avec une apostrophe
// TYPOGRAPHIQUE, et `includes` ne voit pas deux caractères différents comme un
// seul. Une mesure qui déclare l échec d une garde correcte est pire qu une
// mesure absente : elle envoie corriger ce qui marche. On compare donc les noms
// une fois les apostrophes ramenées à la même forme.
const memeGarde = (echec, garde) => {
  const plat = (s) => String(s).replace(/[’‘`´]/g, "'")
  return plat(echec).includes(plat(garde))
}

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    const echecs = [...sortie.matchAll(/• ([^\n—]+)/g)].map(m => m[1].trim())
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, echecs, plante, extrait: sortie.slice(-400) }
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

  // 🔴 ROUGE NE SUFFIT PAS : ROUGE SUR LA BONNE GARDE. Une mutation peut casser
  // une garde VOISINE et passer pour une mesure de celle qu on visait ; la
  // vraie garde reste alors non eprouvee tout en paraissant tenue.
  if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (!res.rouge) { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
  else if (m.garde && !(res.echecs || []).some(e => memeGarde(e, m.garde))) {
    manquees.push(`${m.nom} — rouge sur une AUTRE garde : ${(res.echecs || []).slice(0, 2).join(' / ') || '(aucune nommée)'}`)
    console.log(`  ⚠ mauvaise garde : ${m.nom}`)
  }
  else { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
