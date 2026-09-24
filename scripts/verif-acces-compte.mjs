// Banc de « TON ACCÈS » : changer son email de connexion et son mot de passe.
//
// Ce qui peut se casser ici ne se voit ni au lint, ni au build, ni à l'écran :
//
//   🔴 L'ÉCRAN ANNONCE UN CHANGEMENT QUI N'A PAS EU LIEU.
//
// `Secure email change` est activé sur ce projet : `updateUser({ email })` ne
// change RIEN tant que les deux liens ne sont pas cliqués. Un écran qui dit
// « ton email est changé » à la seconde où la requête réussit ment à tous les
// coups, et le commerçant s'en aperçoit à la connexion suivante, c'est-à-dire
// quand il ne peut plus entrer.
//
//   🔴 LE MOT DE PASSE CHANGE SANS QUE PERSONNE N'AIT PROUVÉ SON IDENTITÉ.
//
// `updateUser({ password })` sans `nonce` passe quand la session a moins de
// 24 heures. Un écran qui oublierait le nonce marcherait donc parfaitement à
// l'essai, et laisserait n'importe qui prendre le compte depuis une tablette
// restée ouverte au comptoir. C'est un défaut qui ne se voit QUE dans le code.
//
//   ⚠️ ET LES REFUS REVIENNENT EN ANGLAIS.
//
// « Password is known to be weak and easy to guess » n'aide personne. La
// traduction est un module, donc le banc l'EXÉCUTE sur chaque cas connu au lieu
// de chercher un mot dans un écran.

import { readFileSync } from 'node:fs'
import {
  messageAuth, emailPlausible, memeEmail, mdpAssezLong, longueurMdp, MDP_MIN,
} from '../lib/messages-auth.js'
// ⚠️ IMPORTÉE POUR ÊTRE EXÉCUTÉE, pas pour être lue. Les cas mesurés plus bas
// sortent tous avant le moindre appel réseau.
import { synchroniserEmailCustomer } from '../lib/stripe-billing.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

// Retire les commentaires avant de chercher dedans.
// ⚠️ Des gardes de ce projet sont déjà nées MUETTES parce qu'elles trouvaient
// leur mot-clé dans le commentaire qui expliquait justement la règle.
function sansCommentaires(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
}

// ═══ 1. LA TRADUCTION DES REFUS, EXÉCUTÉE ════════════════════════════════
{
  // Chaque code que GoTrue peut rendre sur ces deux parcours, et la chose que
  // le commerçant doit comprendre en le lisant.
  const CAS = [
    ['weak_password',              /facile à deviner|fuites connues/i],
    ['same_password',              /déjà ton mot de passe/i],
    ['email_exists',               /déjà utilisée/i],
    ['email_address_invalid',      /ne ressemble pas/i],
    ['over_email_send_rate_limit', /Patiente/i],
    ['over_request_rate_limit',    /Patiente/i],
    ['otp_expired',                /plus valable/i],
    ['reauthentication_needed',    /code envoyé par email/i],
    ['reauthentication_not_valid', /ne correspond pas/i],
    ['session_expired',            /Reconnecte-toi/i],
    ['user_not_found',             /introuvable/i],
    ['validation_failed',          /manque|format/i],
  ]
  for (const [code, attendu] of CAS) {
    const phrase = messageAuth({ code, message: 'anything in english' })
    verifier(`le refus « ${code} » est dit en français`, attendu.test(phrase || ''),
      `rendu : ${phrase}`)
    // ⚠️ AUCUNE PHRASE NE DOIT LAISSER PASSER L'ANGLAIS DE GOTRUE.
    verifier(`et « ${code} » ne recopie pas le message anglais`,
      !/anything in english/i.test(phrase || ''), phrase)
  }

  // 🔴 LE CODE PASSE AVANT LE TEXTE. Si l'aiguillage lisait le message d'abord,
  // il resterait juste aujourd'hui et faux à la prochaine version de GoTrue.
  verifier('un code connu l\'emporte sur un message trompeur',
    /déjà utilisée/i.test(messageAuth({ code: 'email_exists', message: 'password should be at least 10 characters' }) || ''),
    'le message anglais a pris le pas sur le code')

  // Les refus sans code, encore rendus par d'anciennes versions.
  const PAR_TEXTE = [
    ['New password should be different from the old password.', /déjà ton mot de passe/i],
    ['Password should be at least 10 characters.',              new RegExp(`${MDP_MIN} caractères`)],
    ['Password is known to be weak and easy to guess',          /facile à deviner/i],
    ['A user with this email address has already been registered', /déjà utilisée/i],
    ['Token has expired or is invalid',                          /ne correspond pas|plus valable/i],
    ['For security purposes, you can only request this after 39 seconds', /Patiente/i],
    ['captcha protection: request disallowed',                   /anti-robot/i],
  ]
  for (const [texte, attendu] of PAR_TEXTE) {
    const phrase = messageAuth({ message: texte })
    verifier(`le refus « ${texte.slice(0, 32)}… » est traduit`, attendu.test(phrase || ''),
      `rendu : ${phrase}`)
  }

  // 🔴 LE PIÈGE DE L'ACCÈS DIRECT, DÉJÀ PAYÉ SUR LA TABLE DES RETOURS STRIPE.
  // `PAR_CODE['constructor']` rendrait une fonction, et l'écran afficherait
  // « function Object() { [native code] } » à un commerçant.
  for (const vicieux of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const phrase = messageAuth({ code: vicieux, status: 400 })
    verifier(`le code « ${vicieux} » ne fait pas sortir un objet du prototype`,
      typeof phrase === 'string' && /Réessaie/.test(phrase), String(phrase).slice(0, 60))
  }

  // Le repli dit ce qu'on ne sait pas, et donne la sortie.
  const inconnu = messageAuth({ code: 'jamais_vu', status: 500 })
  verifier('un refus inconnu rend une phrase française avec le code HTTP',
    /erreur 500/.test(inconnu) && /hello@yoppaa\.app/.test(inconnu), inconnu)
  verifier('un 429 sans code est compris comme une limitation de débit',
    /Patiente/i.test(messageAuth({ status: 429 }) || ''), messageAuth({ status: 429 }))
  verifier('un refus sans rien dedans rend quand même une phrase',
    typeof messageAuth({}) === 'string' && messageAuth({}).length > 20)
  // ⚠️ PAS D'ERREUR, PAS DE MESSAGE : `null`, pour que l'écran ne fasse pas
  // surgir un toast sur une réussite.
  verifier('aucune erreur rend null, jamais une phrase', messageAuth(null) === null)
  verifier('un refus sans statut ne parle pas d\'une « erreur undefined »',
    !/undefined|NaN/.test(messageAuth({ code: 'jamais_vu' })), messageAuth({ code: 'jamais_vu' }))
}

// ═══ 2. LES RÈGLES DE SAISIE, EXÉCUTÉES ══════════════════════════════════
{
  verifier('le minimum du mot de passe est celui réglé chez Supabase le 12/09', MDP_MIN === 10,
    `MDP_MIN vaut ${MDP_MIN}, la console impose 10`)
  verifier('neuf caractères sont refusés', !mdpAssezLong('123456789'))
  verifier('dix caractères passent', mdpAssezLong('1234567890'))
  // 🔴 LA LONGUEUR SE COMPTE EN CARACTÈRES, PAS EN UNITÉS UTF-16. Un mot de
  // passe d'emoji ferait croire à l'écran qu'il est deux fois plus long, et le
  // serveur refuserait ce que l'écran a accepté.
  verifier('un emoji compte pour un caractère', longueurMdp('🟣🟣🟣🟣🟣') === 5,
    `compté ${longueurMdp('🟣🟣🟣🟣🟣')}`)
  verifier('cinq emoji ne suffisent donc pas', !mdpAssezLong('🟣🟣🟣🟣🟣'))
  verifier('les accents ne changent pas le compte', longueurMdp('éàüîç') === 5)
  verifier('un mot de passe absent ne casse rien', longueurMdp(null) === 0 && !mdpAssezLong(undefined))

  verifier('une adresse plausible passe', emailPlausible('alex@yoppaa.app'))
  verifier('une adresse sans point de domaine est refusée', !emailPlausible('alex@yoppaa'))
  verifier('une adresse sans arobase est refusée', !emailPlausible('alex.yoppaa.app'))
  verifier('une adresse avec un espace est refusée', !emailPlausible('alex @yoppaa.app'))
  verifier('une adresse vide est refusée', !emailPlausible('') && !emailPlausible(null))

  // 🔴 « DÉJÀ TON ADRESSE » SE JUGE SANS LA CASSE. Sinon l'écran laisse
  // demander un changement qui n'en est pas un, et Supabase répond un refus
  // que personne ne comprend.
  verifier('la même adresse en majuscules est reconnue', memeEmail('Alex@Yoppaa.app', 'alex@yoppaa.app'))
  verifier('les espaces autour ne créent pas deux adresses', memeEmail('  alex@yoppaa.app ', 'alex@yoppaa.app'))
  verifier('deux adresses différentes restent différentes', !memeEmail('alex@yoppaa.app', 'contact@yoppaa.app'))
}

// ═══ 3. L'ÉCRAN, VISÉ À L'ENDROIT ════════════════════════════════════════
// ⚠️ ON DÉCOUPE `BlocAcces`, ON NE CHERCHE PAS DANS LES 14 000 LIGNES DU
// FICHIER. Une garde qui cherche « nonce » dans tout le tableau de bord le
// trouverait un jour ailleurs et resterait verte pour de mauvaises raisons.
{
  const brut = lire('app/dashboard/ConfigDashboard.js')
  const debut = brut.indexOf('function BlocAcces(')
  const fin = brut.indexOf('function TabMonCompte(')
  verifier('le bloc « Ton accès » existe dans le tableau de bord', debut > 0 && fin > debut)
  const bloc = sansCommentaires(brut.slice(debut, fin > debut ? fin : debut + 12000))

  // 🔴 LE NONCE. Sans lui, le mot de passe change sans preuve d'identité dès
  // que la session a moins de 24 heures, c'est-à-dire tout le temps en essai.
  verifier('le changement de mot de passe passe un nonce à Supabase',
    /updateUser\(\s*\{\s*password:[^}]*nonce/.test(bloc),
    'updateUser({ password }) sans nonce : n\'importe quel écran resté ouvert prend le compte')
  verifier('et le nonce vient de reauthenticate(), pas d\'ailleurs',
    /auth\.reauthenticate\(\)/.test(bloc),
    'aucun appel à reauthenticate : le code envoyé par email ne peut pas exister')

  // 🔴 L'ÉCRAN NE DIT JAMAIS QUE L'EMAIL EST CHANGÉ.
  // ⚠️ LA TRANCHE SE DÉCOUPE SUR LA FONCTION, PAS SUR L'APPEL. Elle partait de
  // `updateUser({ email`, et le jour où cet appel est passé sur trois lignes
  // pour recevoir `emailRedirectTo`, `indexOf` a rendu -1 : la tranche est
  // devenue absurde et la garde a rougi sans qu'aucune régression n'existe.
  // Une ancre posée sur une ligne qu'on va modifier ne mesure rien longtemps.
  const succesEmail = bloc.slice(bloc.indexOf('async function demanderChangementEmail'),
                                 bloc.indexOf('async function demanderCode'))
  verifier('la réussite de la demande d\'email n\'annonce pas un changement',
    !/(email|adresse)[^\n]{0,40}(est|a été)\s+(bien\s+)?(changé|modifié|mis à jour)/i.test(succesEmail),
    'l\'écran annonce un changement que les deux confirmations n\'ont pas encore fait')
  verifier('elle annonce ce qui est vraiment parti : deux emails',
    /Deux emails de confirmation sont partis/.test(succesEmail))
  verifier('et l\'écran dit que rien ne change avant les deux confirmations',
    /Tant que les deux ne sont pas confirmées, rien ne change/.test(bloc))

  // ⚠️ LE CODE EST À USAGE UNIQUE : le laisser à l'écran après une réussite
  // ferait recommencer avec un nonce consommé, et le refus passerait pour un
  // mot de passe rejeté.
  const succesMdp = bloc.slice(bloc.indexOf('updateUser({ password'))
  verifier('le code est vidé après un changement réussi',
    /setCode\(''\)/.test(succesMdp.slice(0, 700)),
    'le nonce déjà utilisé reste affiché')
  verifier('les deux champs de mot de passe sont vidés aussi',
    /setMdp\(''\)/.test(succesMdp.slice(0, 700)) && /setMdpBis\(''\)/.test(succesMdp.slice(0, 700)))

  // Les deux refus qui se voient sans aller-retour.
  // 🔴 LA GARDE QUI A COÛTÉ SON ACCÈS ADMIN À ALEX, LE 24/09.
  // `supabase.auth.updateUser()` agit sur LA SESSION, pas sur le dossier
  // affiché. En mode administrateur, l'écran montrait « Salon Nathalie » et la
  // demande portait sur le compte d'Alex : il a confirmé les deux liens, son
  // adresse est devenue celle qu'il croyait poser sur la fiche, et la console
  // admin lui a fermé la porte. Un commerçant ordinaire n'a qu'un dossier,
  // c'est pourquoi rien ne l'avait signalé.
  verifier('le bloc vérifie que la session est bien celle du dossier affiché',
    /idSession === commercant\.auth_user_id/.test(bloc),
    'depuis un autre compte, le geste changerait l’email de CELUI QUI REGARDE')
  verifier('et il exige les deux identités, pas seulement leur égalité',
    /!!idSession && !!commercant\?\.auth_user_id &&/.test(bloc),
    'deux absences feraient une égalité, et le bloc s’afficherait justement quand on ne sait rien')
  verifier('quand ce n’est pas le même compte, les deux gestes disparaissent',
    /if \(memeCompte === false\)/.test(bloc),
    'les masquer à moitié laisserait le plus dangereux des deux')
  // ⚠️ `=== false` ET PAS `!memeCompte` : au premier rendu l'état vaut `null`,
  // et un test négatif afficherait l'avertissement à tout le monde une seconde.
  verifier('et l’état « pas encore su » n’est pas confondu avec « pas le même »',
    !/if \(!memeCompte\)/.test(bloc))

  // 🔴 LA GARDE QUI MANQUAIT, ET QUI A COÛTÉ UN 404 EN PRODUCTION. Le gabarit
  // Supabase compose `{{ .RedirectTo }}&token_hash=…` : sans `emailRedirectTo`,
  // `.RedirectTo` retombe sur le Site URL, sans `?`, et le lien devient
  // `https://yoppaa.app/&token_hash=…`. Les CINQ autres appels du dépôt en
  // passent un ; celui-ci était le seul à ne pas suivre la convention, et rien
  // ne le vérifiait.
  verifier('la demande de changement d\'email passe une adresse de retour',
    /emailRedirectTo:/.test(bloc),
    'sans elle, le gabarit fabrique un lien vers la racine et les deux liens font 404')
  verifier('et cette adresse mène à la page du changement d\'email',
    /emailRedirectTo:[^\n]*\/auth\/email-change/.test(bloc),
    'le retour tomberait sur l’écran de CONNEXION, qui dit « lien invalide »')
  // ⚠️ LE `?` N'EST PAS DÉCORATIF : le gabarit colle un `&` juste derrière.
  verifier('et elle porte un « ? », sans quoi le « & » du gabarit tombe à faux',
    /\/auth\/email-change\?[a-z]/.test(bloc),
    'c’est exactement ce qui a produit le 404 du 23/09')

  verifier('l\'écran refuse une adresse qui n\'en est pas une avant d\'appeler Supabase',
    /emailPlausible\(/.test(bloc))
  verifier('l\'écran refuse de demander un changement vers la même adresse',
    /memeEmail\(/.test(bloc))
  verifier('l\'écran vérifie la longueur avant d\'appeler Supabase',
    /mdpAssezLong\(/.test(bloc))
  verifier('les deux saisies du mot de passe sont comparées',
    /mdp\s*!==\s*mdpBis/.test(bloc),
    'sans cette comparaison, une faute de frappe enferme le commerçant dehors')
  // 🔴 SANS `trim` SUR LA COMPARAISON : un espace final fait partie du mot de
  // passe. Le retirer enregistrerait autre chose que ce qui a été tapé.
  verifier('et elles sont comparées brutes, sans trim',
    !/mdp\.trim\(\)\s*!==\s*mdpBis\.trim\(\)/.test(bloc))

  // ⚠️ LE MINIMUM VIENT DU MODULE. Un « 10 » recopié dans l'écran mentirait le
  // jour où la console Supabase changerait le réglage.
  // ⚠️ LE FLAG `i` N'EST PAS UN DÉTAIL. Sans lui, cette garde laissait passer
  // « Au moins 10 caractères » avec une majuscule, c'est-à-dire exactement la
  // forme qu'un humain écrirait en recopiant le nombre à la main.
  verifier('le minimum affiché vient du module, pas d\'un nombre recopié',
    /MDP_MIN/.test(bloc) && !/au moins 10 caract/i.test(bloc))
  verifier('le minimum est annoncé avant la saisie, pas après le refus',
    /Au moins \{MDP_MIN\} caractères/.test(bloc))

  // Les champs sensibles.
  verifier('les deux champs de mot de passe sont masqués',
    (bloc.match(/type="password"/g) || []).length === 2,
    `${(bloc.match(/type="password"/g) || []).length} champ(s) masqué(s) au lieu de 2`)
  verifier('le champ du code se remplit tout seul sur téléphone',
    /autoComplete="one-time-code"/.test(bloc))
  verifier('les refus passent par la traduction française',
    (bloc.match(/messageAuth\(error\)/g) || []).length === 3,
    'un refus non traduit arriverait en anglais chez le commerçant')

  // 🔴 CE QUI A FAILLI FAIRE UN ÉCRAN BLANC : `Ligne` vivait DANS
  // `TabMonCompte`, et `verif:undef` est resté vert parce que `no-undef` est
  // éteint sur ce dépôt.
  verifier('`Ligne` est déclarée au niveau module, donc atteignable par les deux blocs',
    /^function Ligne\(/m.test(brut),
    'déclarée dans un composant : le bloc « Ton accès » planterait au premier rendu')
  verifier('et elle n\'est plus redéclarée dans un composant',
    !/const Ligne = \(/.test(brut))

  // L'ancien texte ne doit plus renvoyer vers le support POUR CES DEUX GESTES.
  const compte = brut.slice(brut.indexOf('function TabMonCompte('))
  verifier('« Mon compte » ne renvoie plus au support pour l\'email et le mot de passe',
    !/Pour changer ton email de connexion ou ton mot de passe, écris-nous/.test(compte),
    'l\'ancien paragraphe est resté : le commerçant a deux consignes contradictoires')
  verifier('et le bloc « Ton accès » est bien branché dans l\'onglet',
    /<BlocAcces commercant=\{commercant\} toast=\{toast\} \/>/.test(compte))
}

// ═══ 4. LES DEUX MIGRATIONS, RELUES ══════════════════════════════════════
// ⚠️ UNE GARDE DE TEXTE SUR DU SQL NE PROUVE PAS QUE LA BASE EST DANS CET
// ÉTAT : elle prouve que le fichier qu'Alex collera dit encore ce qu'il doit
// dire. C'est peu, et c'est ce qui empêche une ligne de disparaître d'un
// fichier de 200 lignes sans que personne ne le voie.
{
  const sql = lire('migrations/MIGRATION_SYNC_EMAIL_COMMERCANT.sql')
  verifier('le trigger d\'email se déclenche APRÈS, et seulement sur l\'email',
    /AFTER UPDATE OF email ON auth\.users/.test(sql))
  verifier('et seulement quand l\'email a vraiment changé',
    /WHEN \(OLD\.email IS DISTINCT FROM NEW\.email\)/.test(sql),
    'sans cette condition, la fonction tourne à chaque écriture sur auth.users')
  verifier('la fonction est SECURITY DEFINER avec un search_path figé',
    /SECURITY DEFINER/.test(sql) && /SET search_path TO 'public'/.test(sql))
  verifier('elle ne peut pas faire échouer une authentification',
    /EXCEPTION WHEN OTHERS THEN/.test(sql) && /RAISE WARNING/.test(sql),
    'une exception non capturée dans un trigger sur auth.users bloque la connexion')
  verifier('le droit d\'exécution est donné explicitement',
    /GRANT EXECUTE ON FUNCTION public\.sync_email_commercant\(\) TO supabase_auth_admin/.test(sql))
  verifier('et il est retiré à PUBLIC',
    /REVOKE ALL ON FUNCTION public\.sync_email_commercant\(\) FROM PUBLIC/.test(sql))
  verifier('la migration n\'aligne PAS les divergences existantes toute seule',
    !/UPDATE public\.commercants[\s\S]{0,200}FROM auth\.users/i.test(sql),
    'elle écraserait une adresse choisie par une adresse devinée')

  // 🔴 LE DÉFAUT QUE LE CONTRÔLE D01 A MONTRÉ EN VRAI, LE SOIR MÊME. « Chez
  // Momo » se connecte avec le compte d'Alex et reçoit sur une boîte interne :
  // la première version du trigger aurait écrasé ce choix au premier changement
  // d'email, sur toutes les fiches rattachées au compte, en silence.
  const suivi = lire('migrations/MIGRATION_SYNC_EMAIL_COMMERCANT_SUIVI_SEUL.sql')
  verifier('le trigger ne touche que les dossiers qui SUIVAIENT l\'ancienne adresse',
    /AND lower\(email\) = lower\(OLD\.email\)/.test(suivi),
    'un dossier avec une adresse choisie se ferait écraser au premier changement')
  verifier('et il ne remplit pas un dossier sans adresse',
    !/OR email IS NULL/.test(suivi),
    'écrire dans un dossier vide à l’occasion d’un changement, c’est inventer une décision')
  verifier('le correctif garde la fonction hors d\'état de casser une connexion',
    /EXCEPTION WHEN OTHERS THEN/.test(suivi) && /RAISE WARNING/.test(suivi))
  // ⚠️ LA MIGRATION D'ORIGINE EST DÉJÀ PASSÉE : la recoller remettrait
  // l'ancienne fonction. Son en-tête doit le dire, sinon quelqu'un la rejouera
  // un jour en croyant réparer.
  verifier('et l\'ancienne migration prévient qu\'elle ne doit plus être collée seule',
    /NE PAS RECOLLER CE\s*\n?--\s*FICHIER SEUL/.test(sql),
    'la rejouer réintroduirait l’écrasement, sans que rien ne le dise')

  const rev = lire('migrations/MIGRATION_REVOQUER_ANON_COMMERCANTS_SIGNALEMENTS.sql')
  verifier('la migration des REVOKE refuse d\'agir si une vue en security_invoker en dépend',
    /security_invoker/.test(rev) && /RAISE EXCEPTION/.test(rev))
  verifier('elle ne touche ni authenticated ni service_role',
    !/FROM authenticated/.test(rev) && !/FROM service_role/.test(rev),
    'une seule ligne de trop ici ferme le tableau de bord à tout le monde')
  verifier('elle essaie pour de vrai, dans la peau d\'anon',
    /SET LOCAL ROLE anon/.test(rev),
    'un catalogue dit ce qui est écrit, pas ce qui se passe')
  verifier('et elle s\'annule si la vue publique ne répond plus',
    /IF vue LIKE 'ECHEC%' THEN/.test(rev),
    'sans ce test, une migration qui vient d\'éteindre les fiches publiques le confirme')
}

// ═══ 4 bis. OÙ ATTERRISSENT LES DEUX LIENS ═══════════════════════════════
//
// 🔴 LE DÉFAUT QU'ALEX A VU EN ESSAYANT, LE 23/09 : les deux liens menaient à
// un 404. J'avais construit le geste sans jamais regarder où le commerçant
// retombe. Deux choses manquaient, et la seconde ne se serait vue qu'après
// avoir réparé la première : `/auth/session` est faite pour une CONNEXION, elle
// exige une session et renvoie vers `/login?error=lien-invalide`. Le commerçant
// qui clique le PREMIER des deux liens y aurait lu « lien invalide » alors que
// tout s'était bien passé.
{
  const page = lire('app/auth/email-change/page.js')
  const sansCom = sansCommentaires(page)

  verifier('la page de retour du changement d\'email existe',
    page.length > 500, 'les liens du mail retombent dans le vide')
  verifier('elle vérifie le jeton auprès de Supabase',
    /verifyOtp\(\{ token_hash, type: 'email_change' \}\)/.test(sansCom))

  // 🔴 ELLE N'ACCEPTE QUE SON PROPRE TYPE. Laisser passer `recovery` ou
  // `magiclink` ouvrirait une session de connexion sur un écran qui n'est pas
  // fait pour ça et qui ne le dirait pas.
  verifier('elle refuse un lien qui n\'est pas un changement d\'adresse',
    /type !== 'email_change'/.test(sansCom),
    'un lien de connexion ouvrirait une session sur cet écran, en silence')

  // 🔴 LE DÉFAUT VU EN PRODUCTION LE 23/09 : les DEUX liens annonçaient « ton
  // adresse est changée ». `!!data?.user?.new_email` vaut `false` quand la
  // bascule est finie ET quand Supabase ne renvoie aucun utilisateur, ce qui
  // est le cas au premier clic. Une absence d'information avait été lue comme
  // une preuve.
  verifier('elle traite l’absence d’utilisateur comme un état à part',
    /if \(!user\) \{[\s\S]{0,120}setEtat\('confirme'\)/.test(sansCom),
    'sans ça, le premier des deux clics annonce un changement qui n’a pas eu lieu')
  verifier('elle n’annonce « changée » que sur une preuve positive',
    /if \(user\.new_email\)[\s\S]{0,140}setEtat\('fait'\)/.test(sansCom),
    'l’état « fait » doit venir d’un utilisateur lu, jamais d’un booléen vide')
  // ⚠️ LE SECOURS : au second clic une session s'ouvre, et l'état réel devient
  // lisible. Sans lui, les deux clics retomberaient sur « je ne sais pas ».
  verifier('elle relit l’état auprès de Supabase quand le jeton ne dit rien',
    /await supabase\.auth\.getUser\(\)/.test(sansCom))
  verifier('et dans tous les cas elle dit de continuer avec l’ancienne adresse',
    (page.match(/continue à te connecter avec (l’|ton )ancienne/g) || []).length >= 2,
    'il essaierait la nouvelle et croirait son compte cassé')

  // ⚠️ UN LIEN DÉJÀ CLIQUÉ N'EST PAS UNE PANNE. Le dire autrement inquiète pour
  // rien et fait écrire au support.
  verifier('un lien déjà servi est expliqué, pas présenté comme une panne',
    /déjà servi/.test(page))
  verifier('et elle ne renvoie jamais vers « lien invalide »',
    !/login\?error=lien-invalide/.test(sansCom),
    'c’est ce que fait /auth/session, et c’est faux pour un changement d’email')
}

// ═══ 5. STRIPE GARDE SA PROPRE COPIE DE L'EMAIL ══════════════════════════
//
// 🔴 LE DÉFAUT TROUVÉ LE 23/09, SUR UNE QUESTION D'ALEX : « ça bascule bien
// l'identifiant ET l'adresse des communications ? ». Oui pour Yoppaa, NON pour
// Stripe. Le Customer était créé avec l'email et plus rien ne remontait, et
// `customers.update` poussait le nom et l'adresse en laissant l'email derrière.
// C'est le frère exact du défaut du 22/09, sur le même document : la facture.
{
  const bs = lire('lib/stripe-billing.js')

  // ⚠️ ON EXÉCUTE CE QUI PEUT L'ÊTRE SANS TOUCHER AU RÉSEAU. Les cas ci-dessous
  // sortent tous AVANT le moindre appel à Stripe : ce sont de vraies mesures,
  // pas une lecture de code.
  verifier('sans dossier, la synchro ne fait rien', await synchroniserEmailCustomer(null) === 'sans objet')
  verifier('sans Customer Stripe, la synchro ne fait rien',
    await synchroniserEmailCustomer({ id: 'x', email: 'a@b.be' }) === 'sans objet')
  verifier('sans email au dossier, la synchro ne fait rien',
    await synchroniserEmailCustomer({ id: 'x', stripe_customer_id: 'cus_1' }) === 'sans objet')

  // 🔴 LA MÊME ADRESSE NE DÉCLENCHE AUCUN APPEL. Sans cette comparaison, chaque
  // ouverture de portail et chaque achat écriraient chez Stripe pour rien.
  verifier('un email identique est reconnu, et rien n’est poussé',
    await synchroniserEmailCustomer(
      { id: 'x', stripe_customer_id: 'cus_1', email: 'alex@yoppaa.app' },
      { id: 'cus_1', email: 'ALEX@Yoppaa.app' },
    ) === 'à jour',
    'la casse suffisait à déclencher une écriture inutile')

  verifier('un Customer supprimé chez Stripe ne fait rien',
    await synchroniserEmailCustomer(
      { id: 'x', stripe_customer_id: 'cus_1', email: 'alex@yoppaa.app' },
      { id: 'cus_1', deleted: true, email: 'autre@yoppaa.app' },
    ) === 'sans objet')

  // 🔴 ELLE NE LÈVE JAMAIS : elle est branchée sur le chemin d'un paiement.
  // ⚠️ CE CAS N'EST MESURABLE QUE SANS CLÉ STRIPE, sinon il partirait pour de
  // vrai sur le réseau depuis un banc. On le dit plutôt que de le simuler.
  if (!process.env.STRIPE_SECRET_KEY) {
    const etat = await synchroniserEmailCustomer(
      { id: 'x', stripe_customer_id: 'cus_1', email: 'neuf@yoppaa.app' },
      { id: 'cus_1', email: 'ancien@yoppaa.app' },
    )
    verifier('Stripe injoignable ne fait pas échouer l’appelant, il rend « en retard »',
      etat === 'en retard', `rendu : ${etat}`)
  } else {
    console.log('  ⓘ cas « Stripe injoignable » non mesuré : une clé Stripe est présente, et ce banc ne part pas sur le réseau.')
  }

  // Le branchement, visé à l'endroit.
  const fonction = bs.slice(bs.indexOf('export async function getOrCreateStripeCustomer'),
                            bs.indexOf('export async function createCheckoutSession'))
  verifier('le passage obligé des achats rattrape l’email au retour du Customer',
    /await synchroniserEmailCustomer\(commercant, customer\)/.test(fonction),
    'un commerçant qui change son email puis achète garderait l’ancienne chez Stripe')

  const fact = sansCommentaires(lire('app/api/dashboard/facturation/route.js'))
  verifier('la route de facturation pousse enfin l’email chez Stripe',
    /email: commercant\.email \|\| undefined/.test(fact),
    'le nom et l’adresse remontent, l’email reste en arrière : c’est le défaut du 22/09')
  // ⚠️ `null` EFFACERAIT l'email du Customer ; Stripe ignore `undefined`.
  verifier('et elle ne risque pas d’effacer l’email chez Stripe',
    !/email: commercant\.email \|\| null/.test(fact))

  const portail = lire('app/api/stripe/billing/portal/route.js')
  verifier('le portail pousse l’email avant de s’ouvrir',
    /await synchroniserEmailCustomer\(commercant\)/.test(sansCommentaires(portail)))
  // 🔴 LE DÉFAUT LE PLUS FRÉQUENT DE CE DÉPÔT, ET IL SERAIT MUET ICI :
  // `commercant.email` vaudrait `undefined` et la synchro rendrait « sans
  // objet » sans que rien ne rougisse.
  verifier('et la colonne email est bien dans son select',
    /\.select\('id, stripe_customer_id, nom, email'\)/.test(portail),
    'sans la colonne, la synchro du portail ne fait rien, en silence')

  // La phrase sur le compte Connect, qui lui n'est PAS synchronisé.
  const brutBloc = lire('app/dashboard/ConfigDashboard.js')
  const blocAcces = sansCommentaires(brutBloc.slice(brutBloc.indexOf('function BlocAcces('),
                                                   brutBloc.indexOf('function TabMonCompte(')))
  verifier('l’écran dit que le compte Stripe garde sa propre adresse',
    /Ton compte Stripe garde sa propre adresse/.test(blocAcces),
    'sans cette phrase, il croit que son compte Stripe a suivi')
  verifier('et cette phrase ne s’affiche qu’à qui a un compte Stripe',
    /commercant\?\.stripe_account_id &&/.test(blocAcces),
    'du bruit sur l’écran de celui qui n’encaisse pas encore')
}

console.log(`\nAccès au compte : ${ok} vérifications`)

// ⚠️ LE FORMAT DES ÉCHECS N'EST PAS DÉCORATIF. Le harnais de mutation lit les
// lignes qui commencent par « • » pour savoir QUELLE garde a rougi : une
// mutation qui casse une garde voisine passerait sinon pour une mesure de celle
// qu'on visait. Changer cette ligne rendrait le harnais aveugle sans rien
// casser d'apparent.
if (ko > 0) {
  console.log(`\n✕ ${ko} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
