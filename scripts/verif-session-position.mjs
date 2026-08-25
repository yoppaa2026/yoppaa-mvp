// BANC : la connexion permanente et la position qui se rafraîchit.
//
// ⚠️ CE BANC EXÉCUTE LES DEUX RÈGLES DE DÉCISION. `decisionGeoloc` et
// `doitRestaurer` sont pures et se lancent ici pour de vrai. Le reste
// (l'écoute des évènements, le branchement des écrans) demande un navigateur :
// il est vérifié au source, EN DÉCOUPANT LA SECTION, jamais en cherchant un mot
// dans tout le fichier.
//
//   npm run verif:session

import { readFileSync } from 'node:fs'
import { decisionGeoloc } from '../lib/geoloc.js'

// ⚠️ `lib/session-permanente` importe le client Supabase, qui exige son URL AU
// CHARGEMENT DU MODULE. On lui en donne une fausse, et on charge ensuite : le
// client n'est jamais appelé ici, seule la règle pure `doitRestaurer` l'est.
//
// C'est un aménagement DU BANC, pas du code livré. L'inverse — rendre l'import
// paresseux en production pour arranger le banc — reviendrait à modifier ce
// qu'on mesure pour pouvoir le mesurer.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'banc'
const { doitRestaurer } = await import('../lib/session-permanente.js')

let ok = 0
const echecs = []
function verifie(nom, condition, detail = '') {
  if (condition) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
function egale(nom, recu, attendu) {
  verifie(nom, recu === attendu, `attendu « ${attendu} », reçu « ${recu} »`)
}

// ═══ 1) LA POSITION GELÉE SUR IPHONE ══════════════════════════════════════
//
// ⚠️ LE DÉFAUT DU 22/08, ET C'EST LE CAS QUI COMPTE LE PLUS DE TOUT CE BANC.
// Safari n'expose pas l'API Permissions pour la géolocalisation : `etat` vaut
// TOUJOURS null sur iPhone. Après la première acceptation, `dejaDemande` valait
// 1 pour la vie du navigateur et la décision était « jamais » à chaque
// ouverture. La rue affichée restait celle du premier jour, sans que rien ne le
// dise.
{
  egale('iPhone, a déjà accepté un autre jour → on redemande',
    decisionGeoloc({ etat: null, dejaDemande: true, positionDejaObtenue: true }), 'demander')

  egale('iPhone, a déjà lu dans cette session → on relit sans fenêtre',
    decisionGeoloc({ etat: null, dejaDemande: true, positionDejaObtenue: true, lectureReussieSession: true }), 'lire')

  // ⚠️ NON-RÉGRESSION DU 07/08, et elle est indispensable : c'est ce défaut-là
  // qui avait justifié le garde trop large qu'on vient d'assouplir.
  // `getCurrentPosition` était appelé à CHAQUE MONTAGE du composant, donc la
  // fenêtre se rouvrait à chaque navigation interne. Une fois la question posée
  // dans la session, on ne la repose pas.
  egale('la question a déjà été posée dans cette session → silence',
    decisionGeoloc({ etat: null, dejaDemande: true, positionDejaObtenue: true, demandeFaiteSession: true }), 'jamais')

  egale('jamais rien demandé → on demande',
    decisionGeoloc({ etat: null, dejaDemande: false }), 'demander')

  // ⚠️ Celui qui a ignoré ou fermé la fenêtre un autre jour ne doit pas la
  // revoir : sans position obtenue, aucune preuve d'acceptation.
  egale('a déjà été sollicité un autre jour sans jamais accepter → silence',
    decisionGeoloc({ etat: null, dejaDemande: true, positionDejaObtenue: false }), 'jamais')

  egale('autorisation accordée → on lit',
    decisionGeoloc({ etat: 'granted', dejaDemande: true }), 'lire')

  // ⚠️ UN REFUS RESTE UN REFUS, quoi qu'il arrive par ailleurs. Ce cas croise
  // TOUS les drapeaux favorables : s'il ne rend pas « jamais », on harcèle
  // quelqu'un qui a dit non.
  egale('refus explicite → silence, même avec tous les autres drapeaux',
    decisionGeoloc({ etat: 'denied', dejaDemande: true, positionDejaObtenue: true, lectureReussieSession: true }), 'jamais')

  egale('« prompt » et jamais demandé → on demande',
    decisionGeoloc({ etat: 'prompt', dejaDemande: false }), 'demander')

  egale('aucun argument → on demande (première visite)', decisionGeoloc(), 'demander')

  // La décision ne rend jamais autre chose que ces trois mots.
  const mots = new Set()
  for (const etat of [null, 'granted', 'denied', 'prompt']) {
    for (const a of [true, false]) for (const b of [true, false]) for (const c of [true, false]) for (const d of [true, false]) {
      mots.add(decisionGeoloc({ etat, dejaDemande: a, positionDejaObtenue: b, lectureReussieSession: c, demandeFaiteSession: d }))
    }
  }
  verifie('la décision ne rend que lire/demander/jamais',
    [...mots].every(m => ['lire', 'demander', 'jamais'].includes(m)), [...mots].join(', '))
}

// ═══ 2) LA SESSION QUI NE TOMBE QUE SI LE YOPPER LA COUPE ═════════════════
{
  verifie('session perdue toute seule, copie en main → on restaure',
    doitRestaurer({ deconnexionVoulue: false, tentativesFaites: 0, aUneCopie: true }) === true)

  // ⚠️ LE REFUS QUI PRIME SUR TOUS LES AUTRES. Reconnecter quelqu'un qui vient
  // de cliquer sur « Se déconnecter » serait pire que le défaut qu'on répare.
  verifie('il est parti de lui-même → on ne restaure JAMAIS',
    doitRestaurer({ deconnexionVoulue: true, tentativesFaites: 0, aUneCopie: true }) === false)

  verifie('aucune copie de session → rien à restaurer',
    doitRestaurer({ deconnexionVoulue: false, tentativesFaites: 0, aUneCopie: false }) === false)

  // ⚠️ LE GARDE-FOU CONTRE LA BOUCLE INVISIBLE : un jeton mort représenté à
  // chaque évènement ferait tourner l'application en rond sans rien afficher.
  verifie('après trois tentatives → on arrête d\'insister',
    doitRestaurer({ deconnexionVoulue: false, tentativesFaites: 3, aUneCopie: true }) === false)
  verifie('à la troisième tentative → on essaie encore',
    doitRestaurer({ deconnexionVoulue: false, tentativesFaites: 2, aUneCopie: true }) === true)

  verifie('aucun argument → on ne restaure rien', doitRestaurer() === false)

  // ⚠️ ET LA RÈGLE DOIT ÊTRE CONSULTÉE, PAS SEULEMENT EXISTER. Mesuré par
  // mutation : en neutralisant le `if` de `restaurerSession`, les six
  // vérifications ci-dessus restaient VERTES sur un code qui restaurait la
  // session de quelqu'un venant de se déconnecter. Une fonction pure bien
  // testée ne prouve rien tant que personne ne l'appelle
  // (reference_tests_faussement_verts, forme « l'appel est écrit, le résultat
  // ne sert pas »).
  const mod = readFileSync('lib/session-permanente.js', 'utf8').replace(/\r\n/g, '\n')
  const debut = mod.indexOf('export async function restaurerSession')
  const corps = debut === -1 ? '' : mod.slice(debut, mod.indexOf('\n}', debut))
  verifie('le corps de restaurerSession se découpe', corps.length > 80)
  verifie('restaurerSession consulte bien la règle', /if \(!doitRestaurer\(\{/.test(corps),
    'la règle est contournée')
  verifie('et renvoie false quand la règle refuse', /\}\)\) return false/.test(corps))
}

// ═══ 3) LE BRANCHEMENT, QUI NE S'EXÉCUTE PAS ICI ══════════════════════════
{
  const src = readFileSync('app/commander/page.js', 'utf8').replace(/\r\n/g, '\n')

  // ⚠️ LE BANDEAU NE DOIT PLUS S'ALLUMER SUR UN SIMPLE `SIGNED_OUT`. Il
  // s'affichait au moment exact où la bibliothèque effaçait une session
  // pourtant récupérable. On exige l'ABSENCE de l'ancienne forme, et la
  // présence du branchement qui ne prévient qu'en dernier recours.
  verifie('plus de bandeau allumé directement sur SIGNED_OUT',
    !/if \(event === 'SIGNED_OUT'\) setSessionPerdue\(true\)/.test(src))
  verifie('la session permanente est branchée', /brancherSessionPermanente\(/.test(src))
  verifie('et son résultat pilote le bandeau', /brancherSessionPermanente\(perdue => setSessionPerdue\(perdue\)\)/.test(src))

  // ⚠️ LES DEUX MÉMOIRES DE SESSION SONT CE QUI DÉGÈLE LA POSITION. On ancre
  // sur l'APPEL avec ses parenthèses, jamais sur le nom seul : le nom figure
  // aussi dans les commentaires et dans la ligne d'import.
  verifie('la décision reçoit la lecture réussie de la session',
    /lectureReussieSession: lectureReussieDansCetteSession\(\)/.test(src))
  verifie('la décision reçoit la question déjà posée dans la session',
    /demandeFaiteSession: demandeFaiteDansCetteSession\(\)/.test(src))
  verifie('la décision reçoit la preuve d\'une acceptation passée',
    /positionDejaObtenue: !!memo/.test(src))
  verifie('une lecture réussie est bien mémorisée', /marquerLectureDeCetteSession\(\)/.test(src))
  verifie('une question posée est bien mémorisée', /marquerDemandeDeCetteSession\(\)/.test(src))

  // ⚠️ LA POSITION SE RELIT AU RETOUR AU PREMIER PLAN, et c'est la moitié
  // visible de la demande d'Alex.
  verifie('la position se relit au retour au premier plan',
    /visibilityState === 'visible'\) geolocaliserAuDemarrage\(\)/.test(src))
}

// ═══ 4) AUCUNE DÉCONNEXION N'EST LAISSÉE SANS MARQUEUR ═══════════════════
//
// ⚠️ IL COMPTE, IL NE CHERCHE PAS. Un seul `signOut` oublié et la session de
// cet écran-là se ferait restaurer juste après le départ du Yopper. La règle
// vaut pour les SIX, y compris côté commerçant et admin : le même navigateur
// partage le même stockage de session.
{
  const FICHIERS = [
    'app/commander/page.js', 'app/commander/SupprimerCompte.js',
    'app/dashboard/page.js', 'app/signup/page.js', 'app/admin/page.js',
  ]
  let total = 0, marques = 0
  for (const f of FICHIERS) {
    const lignes = readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n')
    lignes.forEach((ligne, i) => {
      if (!/auth\.signOut\(\)/.test(ligne)) return
      total++
      // La marque doit précéder l'appel, dans les six lignes au-dessus.
      const avant = lignes.slice(Math.max(0, i - 6), i + 1).join('\n')
      if (/marquerDeconnexionVoulue\(\)/.test(avant)) marques++
      else echecs.push(`déconnexion NON marquée — ${f}:${i + 1}`)
    })
  }
  verifie('six déconnexions recensées dans l\'application', total === 6, `trouvé ${total}`)
  verifie('toutes portent le marqueur de départ voulu', marques === total, `${marques}/${total}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 L'ÉCRAN QUI NE FINIT JAMAIS DE CHARGER (26/08, trouvé par Alex)
// ═══════════════════════════════════════════════════════════════════════════
//
// Au retour dans l'application après un moment, elle restait sur « On réveille
// ton quartier · Les commerces arrivent… », définitivement. Deux manques, et
// il fallait les deux pour bloquer :
//   • aucun DÉLAI MAXIMAL : au réveil de l'iPhone la requête reste PENDANTE,
//     donc ni succès ni échec, donc le `finally` n'est jamais atteint ;
//   • aucune RELANCE au retour au premier plan : `chargerCommercants` n'était
//     appelée qu'au montage, quand tout le reste se rafraîchit déjà.
{
  const src = readFileSync('app/commander/page.js', 'utf8')

  verifie('le chargement des commerces a un délai maximal',
    /const DELAI_MAX_COMMERCES_MS = \d+/.test(src))
  // ⚠️ LE DÉLAI DOIT ÊTRE BRANCHÉ, pas seulement déclaré. Une constante non
  // utilisée est exactement le genre de garde verte qui ne protège rien.
  verifie('et il abandonne réellement la requête',
    /setTimeout\(\(\) => abandon\.abort\(\), DELAI_MAX_COMMERCES_MS\)/.test(src)
    && /\.abortSignal\(abandon\.signal\)/.test(src))
  verifie('le drapeau de chargement retombe quoi qu\'il arrive',
    /finally \{\s*\n\s*clearTimeout\(minuteur\)\s*\n\s*setCommercesEnChargement\(false\)/.test(src))

  // ⚠️ ON NOMME L'ÉCOUTEUR, PAS L'ÉVÈNEMENT. `visibilitychange` apparaît
  // quatre fois dans ce fichier : chercher le mot serait vert quoi qu'on
  // retire. C'est la garde muette de la journée, cinquième forme.
  verifie('la liste vide se recharge au retour au premier plan',
    /document\.addEventListener\('visibilitychange', reveiller\)/.test(src))
  // ⚠️ ET `pageshow` AUSSI : une page restaurée depuis le cache du navigateur
  // ne repasse pas toujours par un changement de visibilité. Leçon du bouton
  // mort au retour de Stripe, 24/08.
  verifie('et aussi quand la page est restaurée depuis le cache',
    /window\.addEventListener\('pageshow', reveiller\)/.test(src))
  // ⚠️ SEULEMENT SI LA LISTE EST VIDE : recharger une liste déjà affichée à
  // chaque bascule ferait clignoter l'écran et consommerait du réseau.
  verifie('mais jamais quand la liste est déjà là',
    /if \(commercants\.length > 0\) return/.test(src))
  verifie('et l\'écouteur se retire en partant',
    /removeEventListener\('pageshow', reveiller\)/.test(src))
}

console.log(`\nSession + position : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
