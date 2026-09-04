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
const { doitRestaurer, construireRappelAuth } = await import('../lib/session-permanente.js')

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
  // ⚠️ ANCRÉE SUR LE GESTE, PAS SUR LA LIGNE EXACTE. Elle exigeait la forme
  // courte `perdue => setSessionPerdue(perdue)` mot pour mot, et le 30/08 le
  // rappel a gagné une seconde ligne (relire la marque « déjà connecté ici ») :
  // la garde rougissait sur du code juste. Ce qui compte est que le résultat du
  // branchement pilote bien le bandeau.
  verifie('et son résultat pilote le bandeau',
    /brancherSessionPermanente\(perdue => \{?\s*setSessionPerdue\(perdue\)/.test(src))

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
  // ⚠️ ON ISOLE LA FONCTION AVANT DE MESURER. Ces mots vivent ailleurs dans un
  // fichier de 4 500 lignes, et une garde qui les y trouve ne prouve rien.
  //
  // ⚠️ ET AUCUNE EXPRESSION N'EST ANCRÉE SUR UN SAUT DE LIGNE. Le dépôt est
  // stocké en LF, mais le disque peut porter du CRLF là où git n'a pas encore
  // normalisé : une expression qui traverse une fin de ligne ne vaut alors que
  // sur une machine. Ce piège-là ne dit rien : il rend une garde muette, dans
  // le sens qui arrange, sans le moindre message.
  const debut = src.indexOf('async function chargerCommercants')
  const finFinally = src.indexOf('setCommercesEnChargement(false)', debut)
  const relatif = src.slice(finFinally).search(/\r?\n {2}\}\r?\n/)
  const bloc = src.slice(debut, relatif > 0 ? finFinally + relatif : finFinally)
  verifie('la fonction de chargement est bien isolée pour la mesure',
    debut > 0 && relatif > 0 && bloc.length > 400 && bloc.length < 4500,
    `${bloc.length} caractères (le fichier en fait plus de 200 000)`)

  verifie('et il abandonne réellement la requête',
    /abandon\.abort\(\)/.test(bloc) && /\.abortSignal\(abandon\.signal\)/.test(bloc))

  // 🔴 ET L'ABANDON NE SUFFIT PAS : C'ÉTAIT LE DÉFAUT DU 31/08.
  //
  // Un `abortSignal` ne connaît que le `fetch`. Or supabase-js résout le jeton
  // AVANT d'émettre la requête : `await getAccessToken()` précède le `fetch`.
  // Quand cette résolution se bloque, la requête n'est jamais partie, il n'y a
  // rien à abandonner, et la porte de sortie du 25/08 se trouvait du mauvais
  // côté du mur. Le délai doit garder TOUTE l'opération, donc REJETER.
  verifie('🔴 le délai rend la main même si la requête n’est jamais partie',
    /rejeter\(/.test(bloc) && /DELAI_MAX_COMMERCES_MS\)/.test(bloc),
    'le minuteur abandonne sans jamais rejeter : il ne couvre que la phase HTTP')
  verifie('🔴 et l’échéance court bien CONTRE la requête',
    /await Promise\.race\(\[/.test(bloc) && /echeance,\s*\]/.test(bloc),
    'l’échéance existe mais personne ne l’attend')
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

// ═══ 5) LE RETOUR PAR UN LIEN D'EMAIL (30/08) ═════════════════════════════
//
// 🔴 CE QU'ALEX A VU. Il annule un rendez-vous depuis le lien reçu par email.
// iOS ouvre ce lien dans le NAVIGATEUR, pas dans l'application installée. Il
// annule, clique « Retour à Yoppaa », et se retrouve dans une application qui ne
// le reconnaît pas et lui redemande sa position.
//
// Deux choses à corriger, et une troisième à NE PAS promettre.
{
  const { libelleAccesPerdu, messageHorsApp, estDansLApp } = await import('../lib/retour-app.js')

  // 🔴 « SESSION EXPIRÉE » MENTAIT ET INQUIÉTAIT. Sur un navigateur où le Yopper
  // ne s'est jamais connecté, il n'y a pas d'expiration : il y a une absence.
  const expire = libelleAccesPerdu({ dejaConnecte: true })
  const jamais = libelleAccesPerdu({ dejaConnecte: false })
  verifie('une session qui a existé peut être dite « expirée »',
    /expirée/i.test(expire.titre), expire.titre)
  verifie('et on propose de SE RECONNECTER', /Reconnecte-toi/.test(expire.texte), expire.texte)
  verifie('une session qui n’a JAMAIS existé ne parle pas d’expiration',
    !/expir/i.test(jamais.titre) && !/expir/i.test(jamais.texte), `${jamais.titre} / ${jamais.texte}`)
  // ⚠️ « CONNECTE-TOI », PAS « RECONNECTE-TOI » : le préfixe suppose une
  // première fois qui n'a pas eu lieu sur cet appareil.
  verifie('elle dit « connecte-toi », sans le RE',
    /Connecte-toi/.test(jamais.texte) && !/Reconnecte/.test(jamais.texte), jamais.texte)
  verifie('et son bouton suit', jamais.bouton === 'Se connecter', jamais.bouton)
  // ⚠️ DANS LES DEUX CAS ON RASSURE : rien n'est perdu, c'est l'accès qui manque.
  verifie('les deux disent que rien n’est perdu',
    /Rien n’est perdu/.test(expire.texte) && /Rien n’est perdu/.test(jamais.texte))
  // Le défaut par défaut est le PRUDENT : sans preuve, on ne parle pas d'une
  // expiration qu'on n'a pas constatée.
  verifie('sans argument, on ne parle pas d’expiration',
    !/expir/i.test(libelleAccesPerdu().titre))

  // ⚠️ LA MARQUE QUI PORTE CETTE DISTINCTION, et elle ne s'efface JAMAIS : un
  // Yopper qui se déconnecte puis revient ne redevient pas un inconnu.
  const srcSession = readFileSync(new URL('../lib/session-permanente.js', import.meta.url), 'utf8')
  verifie('la marque « déjà connecté ici » se pose avec la session',
    /ecrire\(CLE_DEJA_CONNECTE, '1'\)/.test(srcSession))
  verifie('et rien ne l’efface',
    !/effacer\(CLE_DEJA_CONNECTE\)/.test(srcSession))
  // ⚠️ ET L'ÉCRAN LA LIT. Sans ça, les deux textes ci-dessus existeraient sans
  // que personne ne les affiche : une règle sans appelant.
  const srcEcran = readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8')
  verifie('le bandeau lit la règle au lieu d’écrire sa phrase',
    /libelleAccesPerdu\(\{ dejaConnecte: dejaVenuIci \}\)/.test(srcEcran))
  verifie('et il ne code plus « Session expirée » en dur',
    !/^\s+Session expirée$/m.test(srcEcran))
  verifie('la marque est relue au moment de la perte',
    /if \(perdue\) setDejaVenuIci\(dejaConnecteIci\(\)\)/.test(srcEcran))

  // ⚠️ ON DIT OÙ ON EST, ON NE PROMET PAS D'OUVRIR L'APPLICATION. Une page web
  // n'a aucun moyen de lancer une application installée sur iOS : un bouton qui
  // ne ferait rien serait pire que pas de bouton.
  verifie('hors de l’application, on explique où on est',
    /navigateur/.test(messageHorsApp(false) || ''), messageHorsApp(false) || '(rien)')
  verifie('et on dit le geste : ouvrir Yoppaa depuis l’écran d’accueil',
    /écran d’accueil/.test(messageHorsApp(false) || ''))
  // ⚠️ RIEN QUAND ON EST DÉJÀ DANS L'APPLICATION, et rien quand ON NE SAIT PAS :
  // « on ne sait pas » n'est pas « tu es dans un navigateur », et une phrase qui
  // apparaît puis disparaît est un défaut à elle seule.
  verifie('dans l’application, on se tait', messageHorsApp(true) === null)
  verifie('et tant qu’on ne sait pas, on se tait aussi', messageHorsApp(null) === null)
  // Au banc, il n'y a pas de `window` : la détection doit rendre « on ne sait
  // pas » plutôt que de jeter.
  verifie('la détection ne plante pas hors navigateur', estDansLApp() === null)

  // 🔴 IPHONE N'A QUE `navigator.standalone`, ET C'EST TOUT LE SUJET. Safari n'a
  // jamais implémenté `display-mode: standalone` pour les applications ajoutées
  // à l'écran d'accueil : une détection qui ne regarde que `matchMedia` répond
  // « tu es dans un navigateur » à quelqu'un qui est DANS l'application, et lui
  // affiche une phrase fausse.
  //
  // ⚠️ ON SIMULE LES DEUX SIGNAUX SÉPARÉMENT, sans quoi la garde ne mesure
  // jamais l'un des deux : mesuré MUET une première fois, le banc ne faisait
  // qu'appeler la fonction hors navigateur, où elle rend `null` quoi qu'il
  // arrive. Une garde qui ne peut pas rougir ne garde rien.
  const fenetreOrigine = globalThis.window
  try {
    globalThis.window = { navigator: { standalone: true }, matchMedia: () => ({ matches: false }) }
    verifie('🔴 sur iPhone, `navigator.standalone` suffit à dire « dans l’app »',
      estDansLApp() === true)
    globalThis.window = { navigator: {}, matchMedia: (q) => ({ matches: q === '(display-mode: standalone)' }) }
    verifie('sur Android, `display-mode: standalone` suffit aussi', estDansLApp() === true)
    globalThis.window = { navigator: { standalone: false }, matchMedia: () => ({ matches: false }) }
    verifie('et dans un onglet ordinaire, la réponse est non', estDansLApp() === false)
    // Un navigateur sans `matchMedia` ne doit pas faire échouer la réservation.
    globalThis.window = { navigator: {} }
    verifie('un navigateur sans matchMedia rend « non », pas une exception',
      estDansLApp() === false)
  } finally {
    if (fenetreOrigine === undefined) delete globalThis.window
    else globalThis.window = fenetreOrigine
  }

  // ⚠️ ET LES DEUX ÉCRANS DE RETOUR L'AFFICHENT. Ils sont frères : la commande
  // et le rendez-vous s'annulent tous les deux par un lien d'email, et corriger
  // un seul des deux, c'est le motif qui revient le plus souvent ici.
  //
  // ⚠️ ON COMPTE, ON NE CHERCHE PAS. La première écriture testait la PRÉSENCE de
  // `<NoteHorsApp/>` : chaque écran en porte DEUX (succès et erreur), et en
  // retirer un laissait la garde verte. Mesuré par mutation. On exige donc
  // qu'AUCUN « Retour à Yoppaa » ne reste sans sa phrase.
  for (const f of ['app/commander/cancel/page.js', 'app/commander/rdv/cancel/page.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    const nom = f.split('/').slice(-2).join('/')
    const retours = (src.match(/Retour à Yoppaa/g) || []).length
    const notes = (src.match(/<NoteHorsApp\/>/g) || []).length
    verifie(`${nom} importe la phrase`, /import NoteHorsApp/.test(src))
    verifie(`${nom} a bien des retours à couvrir`, retours > 0, `${retours} retour(s)`)
    verifie(`${nom} : aucun « Retour à Yoppaa » sans sa phrase`,
      notes === retours, `${notes} phrase(s) pour ${retours} retour(s)`)
  }
}

// ═══ LE RAPPEL D'AUTH NE DOIT JAMAIS ATTENDRE L'AUTH ══════════════════════
//
// 🔴 LE DÉFAUT DU 31/08, ET IL FERMAIT L'APPLICATION ENTIÈRE.
//
// Le rappel était `async` et faisait `await restaurerSession()`, qui appelle
// `supabase.auth.setSession()`. Or `_notifyAllSubscribers` ATTEND ce rappel en
// tenant le verrou d'auth. Notre appel repartait dans `_acquireLock`, tombait
// dans la branche ré-entrante, et y attendait l'opération qui nous attendait.
// Cette branche n'a AUCUN délai : le verrou restait pris pour toujours, et
// chaque `.from(...)` résolvant son jeton avant d'émettre sa requête, plus rien
// ne partait.
//
// ⚠️ LA RÈGLE N'EST PAS « PAS D'`await` ICI », C'EST « LE RAPPEL D'AUTH NE
// RAPPELLE JAMAIS L'AUTH ». Et ce qui la PROUVE n'est pas la forme du code,
// c'est qu'il RENDE LA MAIN avant que la restauration ne parte.
{
  const attendreUnTour = () => new Promise(r => setTimeout(r, 0))

  // ── La garde qui compte : rendre la main AVANT d'agir ──────────────────
  let restaurationPartie = false
  let differee = null
  const rappel = construireRappelAuth({
    restaurer: async () => { restaurationPartie = true; return true },
    voulue: () => false,
    memoriser: () => {},
    differer: (faire) => { differee = faire },
    surSessionPerdue: () => {},
  })
  const rendu = rappel('SIGNED_OUT', null)

  verifie('🔴 le rappel rend la main AVANT que la restauration ne parte',
    restaurationPartie === false,
    'la restauration est partie pendant le rappel : le verrou se referme sur lui-même')
  verifie('🔴 le rappel ne rend AUCUNE promesse que la bibliothèque attendrait',
    rendu === undefined || typeof rendu?.then !== 'function',
    `le rappel rend « ${typeof rendu} »`)
  verifie('et il a bien confié la restauration à plus tard',
    typeof differee === 'function')

  // ── Et une fois différée, elle fait bien son travail ───────────────────
  const dits = []
  const rejoue = (resultat) => {
    dits.length = 0
    let f = null
    construireRappelAuth({
      restaurer: () => (resultat instanceof Error ? Promise.reject(resultat) : Promise.resolve(resultat)),
      voulue: () => false,
      memoriser: () => {},
      differer: (faire) => { f = faire },
      surSessionPerdue: (perdue) => dits.push(perdue),
    })('SIGNED_OUT', null)
    f?.()
    return attendreUnTour()
  }
  await rejoue(true)
  egale('une restauration réussie n’annonce AUCUNE perte', dits.join(','), 'false')
  await rejoue(false)
  egale('une restauration ratée annonce la perte', dits.join(','), 'true')
  await rejoue(new Error('boum'))
  egale('🔴 une restauration qui LÈVE annonce la perte, elle ne se tait pas',
    dits.join(','), 'true')

  // ── Une déconnexion voulue ne déclenche rien du tout ───────────────────
  let differeeVoulue = null
  const ditsVoulue = []
  construireRappelAuth({
    restaurer: async () => { throw new Error('jamais appelée') },
    voulue: () => true,
    memoriser: () => {},
    differer: (faire) => { differeeVoulue = faire },
    surSessionPerdue: (perdue) => ditsVoulue.push(perdue),
  })('SIGNED_OUT', null)
  verifie('une déconnexion voulue ne diffère rien', differeeVoulue === null)
  egale('et elle n’annonce aucune perte', ditsVoulue.join(','), 'false')

  // ── Les évènements heureux mémorisent et rassurent ─────────────────────
  for (const evt of ['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED']) {
    const memorisees = []
    const ditsOk = []
    construireRappelAuth({
      restaurer: async () => true, voulue: () => false,
      memoriser: (s) => memorisees.push(s),
      differer: () => { throw new Error('rien à différer ici') },
      surSessionPerdue: (perdue) => ditsOk.push(perdue),
    })(evt, { access_token: 'a' })
    egale(`${evt} mémorise la session`, memorisees.length, 1)
    egale(`${evt} n’annonce aucune perte`, ditsOk.join(','), 'false')
  }
}

// ⚠️ ET LA RÈGLE VAUT POUR TOUS LES RAPPELS D'AUTH DU DÉPÔT, PAS SEULEMENT
// CELUI-LÀ. On COMPTE les fautifs et on exige ZÉRO : chercher « est-ce que
// quelqu'un fait bien » laisserait passer le prochain.
{
  const { readdirSync } = await import('node:fs')
  const racine = new URL('../', import.meta.url)
  const fichiers = []
  const parcourir = (rel) => {
    for (const e of readdirSync(new URL(rel, racine), { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      if (e.isDirectory()) parcourir(`${rel}${e.name}/`)
      else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) fichiers.push(`${rel}${e.name}`)
    }
  }
  parcourir('app/'); parcourir('lib/')

  const appelants = fichiers.filter(f =>
    readFileSync(new URL(f, racine), 'utf8').includes('onAuthStateChange'))
  verifie('des rappels d’authentification existent bien à surveiller',
    appelants.length >= 3, `${appelants.length} fichier(s)`)

  const fautifs = appelants.filter(f => {
    const src = readFileSync(new URL(f, racine), 'utf8')
    // Un rappel `async` rend une promesse que la bibliothèque attend.
    return /onAuthStateChange\(\s*async/.test(src)
  })
  egale('🔴 aucun rappel onAuthStateChange n’est `async`', fautifs.join(' · '), '')

  // Et celui de la session passe bien par la fabrique mesurée ci-dessus.
  const srcSession = readFileSync(new URL('lib/session-permanente.js', racine), 'utf8')
  verifie('le rappel de la session vient de la fabrique',
    /onAuthStateChange\(\s*\n?\s*construireRappelAuth\(/.test(srcSession))
}

// ═══════════════════════════════════════════════════════════════════════════
// CE QUI RESTE À L'ÉCRAN QUAND LA PERSONNE PART (01/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CE QU'ALEX A VU EN PRODUCTION : après s'être déconnecté, son profil
// affichait « Se connecter » en haut, et « MES BONS 291,00 € » juste en
// dessous, avec les CODES en clair. Un code de bon est un instrument au
// porteur : la personne suivante qui prend le téléphone pouvait le dépenser.
//
// 🔴 ET CE N'ÉTAIT PAS LA PREMIÈRE FOIS. Le même défaut avait été corrigé le
// 12/08 pour les rendez-vous, les cartes de fidélité et la commune. Les bons
// sont arrivés le 28/08, les abonnements avant, et personne ne les a ajoutés :
// **une liste tenue à la main finit toujours par mentir**.
//
// ⚠️ CETTE GARDE NE SURVEILLE DONC PAS UNE LISTE, ELLE APPLIQUE UNE RÈGLE :
// tout état qui porte de la donnée personnelle passe par `viderEtatPersonnel`,
// ou figure ci-dessous AVEC SA RAISON. Aucun ne reste sans décision.
{
  const racine2 = new URL('../', import.meta.url)
  const src = readFileSync(new URL('app/commander/page.js', racine2), 'utf8')

  // Ce qui porte un nom de donnée personnelle. Volontairement LARGE : mieux
  // vaut une garde qui réclame une raison écrite qu'une garde qui laisse
  // passer.
  const PERSONNEL = /bons|commande|rdv|favori|carte|fid|client|commune|abonnement|avis|pickup/i

  // ⚠️ CHAQUE EXCLUSION PORTE SA RAISON, comme les routes publiques assumées.
  const HORS_PERIMETRE = {
    avis: 'avis PUBLICS d\'un commerce, affichés à tout le monde et rendus par un sous-composant, pas par le profil',
    setAvis: 'le setter du précédent',
    avisSessionRef: 'garde-fou anti-boucle, ne porte aucune donnée',
    editProfilSignal: 'compteur qui déclenche l\'ouverture du formulaire, pas une donnée',
    showConfirmCommune: 'ouverture d\'une modale, pas une donnée',
    sousOngletCmd: 'onglet choisi, remis à sa place par le rendu invité',
    commercantsProches: 'commerces PUBLICS autour de la position, aucun lien avec le compte',
    avisCommercant: 'avis publics d\'une fiche',
    commandeEnCours: 'panier en cours de saisie, jamais chargé depuis le compte',
  }

  const etats = [...src.matchAll(/const \[(\w+), (set\w+)\] = useState/g)]
    .map(m => ({ etat: m[1], setter: m[2] }))
  verifie('les états de l\'écran Yopper se lisent', etats.length > 30, `${etats.length} trouvés`)

  // Le corps de `viderEtatPersonnel`, découpé, jamais cherché dans tout le
  // fichier : un `setMesBons([])` écrit ailleurs ne compte pas.
  const iVider = src.indexOf('const viderEtatPersonnel = () => {')
  verifie('🔴 la remise à zéro existe et porte un nom', iVider > 0)
  const corpsVider = src.slice(iVider, src.indexOf('\n  }', iVider))

  const suspects = etats.filter(e => PERSONNEL.test(e.etat) && !HORS_PERIMETRE[e.etat])
  verifie('des états personnels sont bien détectés', suspects.length >= 8, `${suspects.length}`)
  for (const s of suspects) {
    verifie(`🔴 « ${s.etat} » est effacé quand la personne part`,
      corpsVider.includes(`${s.setter}(`), 'absent de viderEtatPersonnel')
  }

  // ⚠️ ET LES DEUX SORTIES PASSENT PAR LÀ. La déconnexion ET la suppression de
  // compte : c'est leur divergence qui a laissé le défaut vivre.
  const nbAppels = (src.match(/viderEtatPersonnel\(\)/g) || []).length
  verifie('🔴 la déconnexion ET la suppression de compte l\'appellent',
    nbAppels >= 2, `${nbAppels} appel(s)`)
  verifie('la suppression de compte l\'appelle',
    /onSupprime=\{\(\) => \{[\s\S]{0,600}viderEtatPersonnel\(\)/.test(src))
  verifie('la déconnexion l\'appelle',
    /marquerDeconnexionVoulue\(\)[\s\S]{0,900}viderEtatPersonnel\(\)/.test(src))
}

console.log(`\nSession + position : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
