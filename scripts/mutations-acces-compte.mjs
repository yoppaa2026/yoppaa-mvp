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
