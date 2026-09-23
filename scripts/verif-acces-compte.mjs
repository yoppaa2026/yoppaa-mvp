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
  const succesEmail = bloc.slice(bloc.indexOf('updateUser({ email'), bloc.indexOf('async function demanderCode'))
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
