// BANC DES NOTIFICATIONS DANS L'APPLICATION NATIVE (16/09).
//
// 🔴 CE QUI SE CASSE ICI NE SE VOIT PAS. Le plugin OneSignal natif s'expose
// sous `window.OneSignal`, EXACTEMENT le même nom que le SDK web
// (`<clobbers target="OneSignal" />`). Dans l'app publiée sur les stores, le
// code écrit pour le navigateur croirait donc parler au web alors qu'il parle
// au natif : aucune exception, aucun journal, et simplement personne ne
// recevrait jamais une notification.
//
// ⚠️ ET LE PIÈGE JUMEAU : `OneSignalDeferred` n'existe pas dans l'app. Une
// fonction empilée dans cette file y resterait pour toujours, sans un mot.
//
// Le module est PUR — on lui passe la fenêtre — donc il s'exécute ici, sans
// navigateur et sans téléphone.

import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { sansProse } from './lire-code.mjs'
import {
  estAppNative, pluginNatif, initialiserPushNatif, demanderPushNatif,
  etatPushNatif, taguerNatif, retirerTagNatif,
  cheminDeNotification, cheminDeClic, brancherClicNatif,
} from '../lib/push-natif.js'
import { envoyerPush, CANAL_ANDROID_PERSONNEL } from '../lib/onesignal.js'
import {
  geolocNative, positionDisponible, lirePosition, etatAutorisation, codeErreurPosition,
} from '../lib/geoloc.js'
import {
  MARQUE_APP, estUaApp, urlDeRetour, cheminDepuisRetour, lienVersApp, etatRetour,
} from '../lib/retour-vers-app.js'

const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const codeDe = (chemin) => sansProse(lire(chemin))
// ⚠️ ON INTERROGE LE DÉPÔT, PAS SEULEMENT LES TEXTES. Un workflow peut être
// parfaitement écrit et demander un fichier qui n'existe pas : c'est ce qui
// s'est produit le 17/09 avec `pod install` sur un projet passé à SPM.
const existe = (chemin) => {
  try { readFileSync(new URL(`../${chemin}`, import.meta.url)); return true }
  catch { return false }
}

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

// Un faux plugin natif, avec les signatures LUES DANS LES TYPES INSTALLÉS
// (onesignal-cordova-plugin 5.5.7) : `initialize(appId)`, `login(id)`,
// `Notifications.hasPermission()`, `requestPermission(fallbackToSettings)`,
// `User.addTags(obj)`, `User.removeTag(cle)`.
const fenetreNative = (options = {}) => {
  const journal = []
  const os = {
    initialize: (id) => journal.push(['initialize', id]),
    login: (id) => journal.push(['login', id]),
    Notifications: {
      hasPermission: () => options.autorise === true,
      requestPermission: async (fallback) => {
        journal.push(['requestPermission', fallback])
        if (options.jette) throw new Error('boom')
        return options.accorde !== false
      },
      // Signature lue dans les types installés : `addEventListener('click', fn)`.
      addEventListener: (nom, fn) => {
        if (options.ecouteJette) throw new Error('ecoute')
        journal.push(['addEventListener', nom])
        ;(journal.ecouteurs ||= []).push(fn)
      },
    },
    User: {
      addTags: (t) => journal.push(['addTags', JSON.stringify(t)]),
      removeTag: (k) => journal.push(['removeTag', k]),
    },
  }
  return { fenetre: { Capacitor: { isNativePlatform: () => true }, OneSignal: os }, journal }
}

// ═══ 1) RECONNAÎTRE L'APPLICATION, ET ELLE SEULE ═══════════════════════════
{
  const { fenetre } = fenetreNative()
  verifie('🔴 dans l’app, la plateforme est reconnue', estAppNative(fenetre) === true)
  verifie('un navigateur ordinaire n’est pas l’app', estAppNative({}) === false)
  verifie('une fenêtre absente non plus', estAppNative(undefined) === false)
  verifie('⚠️ un `Capacitor` présent mais web ne compte pas',
    estAppNative({ Capacitor: { isNativePlatform: () => false } }) === false)
  // ⚠️ UN ACCÈS QUI JETTE N'EST PAS UNE APPLICATION NATIVE : dans le doute, on
  // reste sur le chemin web, qui fonctionne partout.
  verifie('🔴 un accès qui lève ne fait pas basculer en natif',
    estAppNative({ get Capacitor() { throw new Error('bloqué') } }) === false)

  // 🔴 LE CŒUR DU PIÈGE : le SDK WEB porte le même nom. On distingue par ce que
  // l'objet SAIT FAIRE, jamais par son nom.
  const webDeguise = { Capacitor: { isNativePlatform: () => true }, OneSignal: { init: () => {} } }
  verifie('🔴 le SDK web n’est jamais pris pour le plugin natif', pluginNatif(webDeguise) === null)
  verifie('le plugin natif, lui, est reconnu', pluginNatif(fenetre) !== null)
  verifie('hors de l’app, aucun plugin n’est rendu',
    pluginNatif({ OneSignal: { initialize: () => {} } }) === null)
}

// ═══ 1 bis) LE VRAI PLUGIN, RANGÉ COMME CORDOVA LE RANGE (03/10) ═══════════
//
// 🔴 LE DÉFAUT QU'ALEX A TROUVÉ SUR LE BUILD 1.0.1 (3). Tout ce banc simulait
// un `window.OneSignal` à la forme qu'on CROYAIT : les méthodes directement
// dessus. Or le plugin 5.5.7 est un MODULE, et Cordova pose sous
// `window.OneSignal` l'objet de ses EXPORTS (`{ default, LogLevel, … }`).
// `pluginNatif` ne trouvait donc jamais rien : aucune notification native n'a
// jamais pu marcher, et le banc était vert.
//
// ✅ ON NE SIMULE PLUS LE PLUGIN, ON LE CHARGE. Le fichier est celui que
// `plugin.xml` désigne et que `cap sync` copie dans l'app ; on le range comme
// `cordova.js` le fait (`modulemapper`, stratégie « clobbers » : la cible
// reçoit les exports tels quels). Seul `cordova.exec`, le pont vers le natif,
// est imité. Une montée de version du plugin qui changerait encore sa forme
// rougira ICI, avant un build.
{
  const racinePlugin = new URL('../node_modules/onesignal-cordova-plugin/', import.meta.url)
  const pluginXml = readFileSync(new URL('plugin.xml', racinePlugin), 'utf8')
  const declaration = pluginXml.match(/<js-module src="([^"]+)"[^>]*>\s*<clobbers target="([^"]+)"/)
  verifie('⚠️ plugin.xml désigne bien un fichier et une cible (sinon la suite ne lit rien)', !!declaration)
  egal('🔴 Cordova range le plugin sous le nom que le code lit', declaration?.[2], 'OneSignal')

  const appels = []
  let clicNatif = null
  const fenetreAvant = globalThis.window
  try {
    globalThis.window = {
      cordova: {
        exec: (ok, ko, service, action, args) => {
          appels.push(`${service}.${action}(${JSON.stringify(args || [])})`)
          if (action === 'requestPermission') ok(true)
          if (action === 'addNotificationClickListener') clicNatif = ok
        },
      },
    }
    const exiger = createRequire(import.meta.url)
    const fichier = fileURLToPath(new URL(declaration?.[1] || 'dist/index.cjs', racinePlugin))
    delete exiger.cache[fichier]
    const exportsDuModule = exiger(fichier)
    const fenetre = globalThis.window
    // Ce que fait `cordova.js`, ni plus ni moins.
    fenetre[declaration?.[2] || 'OneSignal'] = exportsDuModule
    fenetre.Capacitor = { isNativePlatform: () => true }

    verifie('🔴 le VRAI plugin, rangé par Cordova, est trouvé', pluginNatif(fenetre) !== null)
    const init = initialiserPushNatif(fenetre, 'app-banc', 'yopper-1')
    verifie('🔴 l’initialisation part vers le natif',
      init.ok === true && appels.includes('OneSignalPush.init(["app-banc"])'), appels.join(' · '))
    verifie('🔴 et le Yopper est identifié', appels.includes('OneSignalPush.login(["yopper-1"])'))
    const demande = await demanderPushNatif(fenetre)
    verifie('🔴 « Activer » pose VRAIMENT la question du téléphone',
      demande.ok === true && appels.includes('OneSignalPush.requestPermission([true])'), JSON.stringify(demande))
    verifie('les étiquettes partent vers le natif',
      taguerNatif(fenetre, { code_postal: '5640' }) === true
      && appels.includes('OneSignalPush.addTags([{"code_postal":"5640"}])'))
    const ouverts = []
    delete fenetre.__yoppaaClicNatif
    const branche = brancherClicNatif(fenetre, (c) => ouverts.push(c))
    verifie('🔴 l’écoute du toucher est enregistrée auprès du natif',
      branche.ok === true && typeof clicNatif === 'function')
    // Le natif rappelle avec la forme que le plugin attend, et c'est LUI qui
    // la transforme avant de nous la passer.
    clicNatif?.({ notification: { notificationId: 'n1', additionalData: { chemin: '/commander?onglet=commandes' } }, result: {} })
    egal('🔴 et le toucher ouvre la page, à travers le vrai plugin', ouverts.join(), '/commander?onglet=commandes')
  } finally {
    if (fenetreAvant === undefined) delete globalThis.window
    else globalThis.window = fenetreAvant
  }

  // ⚠️ LES AUTRES FORMES RESTENT RECONNUES, et le SDK web reste écarté, quelle
  // que soit la forme sous laquelle il se présenterait.
  const natif = { initialize: () => {} }
  const cap = { isNativePlatform: () => true }
  verifie('la forme posée par le plugin lui-même (`plugins`) est reconnue',
    pluginNatif({ Capacitor: cap, plugins: { OneSignal: natif } }) === natif)
  verifie('l’ancienne forme directe aussi', pluginNatif({ Capacitor: cap, OneSignal: natif }) === natif)
  verifie('🔴 le SDK web n’est jamais pris, même sous `default`',
    pluginNatif({ Capacitor: cap, OneSignal: { default: { init: () => {} } } }) === null)
}

// ═══ 2) L'INITIALISATION ═══════════════════════════════════════════════════
{
  const { fenetre, journal } = fenetreNative()
  const res = initialiserPushNatif(fenetre, 'app-123', 'yopper-42')
  verifie('🔴 l’initialisation réussit dans l’app', res.ok === true)
  egal('avec l’identifiant d’application', journal[0].join(':'), 'initialize:app-123')
  egal('⚠️ et le Yopper est identifié pour les push individuels',
    journal[1].join(':'), 'login:yopper-42')

  // ⚠️ SANS IDENTITÉ, ON INITIALISE QUAND MÊME : un visiteur non connecté doit
  // pouvoir recevoir les notifications de sa commune avant d'avoir un compte.
  const b = fenetreNative()
  verifie('🔴 un visiteur sans compte est quand même abonné',
    initialiserPushNatif(b.fenetre, 'app-123', null).ok === true)
  egal('et personne n’est identifié à tort', b.journal.length, 1)

  // ⚠️ CHAQUE REFUS PORTE UN NOM : « ok: false » sans raison est indébogable.
  egal('hors de l’app, on le dit', initialiserPushNatif({}, 'app-123').raison, 'pas_natif')
  egal('sans identifiant d’application, on le dit aussi',
    initialiserPushNatif(fenetreNative().fenetre, '').raison, 'app_id_absent')
}

// ═══ 3) LA PERMISSION ══════════════════════════════════════════════════════
{
  const accorde = fenetreNative({ accorde: true })
  const r1 = await demanderPushNatif(accorde.fenetre)
  verifie('🔴 la permission accordée est rendue telle quelle', r1.ok === true)
  // ⚠️ `fallbackToSettings` OUVRE LES RÉGLAGES DU TÉLÉPHONE quand l'utilisateur
  // a déjà refusé : sans lui, un refus initial est définitif et le bouton ne
  // fait plus jamais rien.
  egal('⚠️ et les réglages s’ouvrent après un refus précédent',
    accorde.journal.find(l => l[0] === 'requestPermission')?.[1], true)

  const refus = fenetreNative({ accorde: false })
  egal('🔴 un refus se dit refus', (await demanderPushNatif(refus.fenetre)).raison, 'refuse_os')

  // ⚠️ DÉJÀ ACCORDÉE : on ne redemande pas, on ne montre rien.
  const deja = fenetreNative({ autorise: true })
  const r2 = await demanderPushNatif(deja.fenetre)
  verifie('⚠️ une permission déjà accordée ne redemande rien',
    r2.ok === true && r2.raison === 'deja_accorde'
    && !deja.journal.some(l => l[0] === 'requestPermission'))

  // 🔴 UNE EXCEPTION NE DOIT PAS EMPORTER L'ÉCRAN AVEC ELLE.
  const casse = fenetreNative({ jette: true })
  const r3 = await demanderPushNatif(casse.fenetre)
  verifie('🔴 une erreur du plugin ne jette pas, elle se nomme',
    r3.ok === false && r3.raison === 'boom')
  egal('hors de l’app, on le dit', (await demanderPushNatif({})).raison, 'pas_natif')
}

// ═══ 4) L'ÉTAT ET LES ÉTIQUETTES ═══════════════════════════════════════════
{
  verifie('🔴 hors de l’app, l’état natif n’existe pas', etatPushNatif({}) === null)
  verifie('dans l’app, il dit si c’est autorisé',
    etatPushNatif(fenetreNative({ autorise: true }).fenetre)?.autorise === true)
  verifie('et il dit non quand ça ne l’est pas',
    etatPushNatif(fenetreNative({ autorise: false }).fenetre)?.autorise === false)

  const { fenetre, journal } = fenetreNative()
  verifie('les étiquettes partent', taguerNatif(fenetre, { code_postal: '5640' }) === true)
  egal('avec leur contenu', journal[0][1], '{"code_postal":"5640"}')
  verifie('⚠️ un objet vide ou absent ne fait rien', taguerNatif(fenetre, null) === false)
  verifie('hors de l’app non plus', taguerNatif({}, { a: '1' }) === false)
  verifie('une étiquette se retire', retirerTagNatif(fenetre, 'favori:12') === true)
}

// ═══ 5) L'AIGUILLAGE, DANS L'ÉCRAN ═════════════════════════════════════════
//
// 🔴 CE FICHIER EST ÉCRIT POUR LE NAVIGATEUR de bout en bout : permission
// `Notification`, service worker, geste utilisateur de Safari. Chaque point
// d'entrée doit SORTIR avant, dans l'app.
{
  const src = codeDe('app/components/OneSignalInit.js')
  for (const [nom, motif] of [
    ['le composant d’initialisation', /if \(estAppNative\(window\)\) \{[\s\S]{0,400}initialiserPushNatif\(window, APP_ID, yopperId\)/],
    ['l’activation depuis les réglages', /if \(estAppNative\(window\)\) return demanderPushNatif\(window\)/],
    ['la lecture de l’état', /const natif = etatPushNatif\(window\)/],
  ]) {
    verifie(`🔴 ${nom} passe par le natif`, motif.test(src))
  }
  // 🔴 LE PIÈGE JUMEAU : `OneSignalDeferred` n'existe pas dans l'app, donc une
  // fonction empilée dedans y reste pour toujours, sans un mot.
  const parFile = src.split('\n').filter(l => /pushOneSignal\(async/.test(l)).length
  verifie('au moins deux fonctions passent par la file différée', parFile >= 2, `${parFile} trouvées`)
  for (const fn of ['taggerFavoriOneSignal', 'promptPushOneSignal']) {
    const bloc = src.slice(src.indexOf(`export function ${fn}`), src.indexOf(`export function ${fn}`) + 420)
    verifie(`🔴 ${fn} sort avant la file différée`,
      bloc.indexOf('estAppNative(window)') > 0
      && bloc.indexOf('estAppNative(window)') < bloc.indexOf('pushOneSignal(async'))
  }
  // ⚠️ ET LE SDK WEB N'EST JAMAIS CHARGÉ DANS L'APP : les deux se disputeraient
  // le même global et le même abonnement.
  const iSortie = src.indexOf('if (estAppNative(window)) {')
  const iInitWeb = src.indexOf('await OneSignal.init({')
  verifie('🔴 le SDK web n’est pas initialisé dans l’app', iSortie > 0 && iInitWeb > iSortie)
}

// ═══ 6) L'ENVELOPPE NATIVE ═════════════════════════════════════════════════
{
  // ⚠️ LE CODE DÉPOUILLÉ, PAS LE FICHIER BRUT. La garde « jamais
  // `app.yoppaa.pro` » rougissait sur le COMMENTAIRE qui explique justement
  // pourquoi cet identifiant reste libre. Un faux rouge, donc sans gravité,
  // mais c'est le même piège que le faux vert d'un mot trouvé en commentaire.
  const conf = codeDe('capacitor.config.ts')
  // 🔴 L'IDENTIFIANT EST FIGÉ ET UNIQUE SUR TOUT GOOGLE PLAY.
  verifie('🔴 l’identifiant d’app est celui déposé', /appId: 'app\.yoppaa\.client'/.test(conf))
  verifie('⚠️ et jamais celui du tableau de bord', !/app\.yoppaa\.pro/.test(conf))
  // 🔴 LE PAIEMENT DOIT POUVOIR S'OUVRIR, sinon la commande est créée et jamais
  // payée, le client bloqué sur un écran vide.
  verifie('🔴 Stripe Checkout peut s’ouvrir dans l’app', /'checkout\.stripe\.com'/.test(conf))
  // ⚠️ JAMAIS DE HTTP EN CLAIR : un jeton de session qui voyage en clair ne se
  // rattrape pas, et les deux stores le refusent.
  verifie('🔴 rien ne passe en clair', /cleartext: false/.test(conf) && /allowMixedContent: false/.test(conf))
  verifie('⚠️ le site de production est la source', /url: 'https:\/\/www\.yoppaa\.app'/.test(conf))
  // ⚠️ LE `webDir` NE RECOPIE PLUS 1,2 Mo D'ICÔNES dans chaque paquet.
  verifie('⚠️ le dossier embarqué reste minimal', /webDir: 'capacitor-web'/.test(conf))

  // ─── LE PREMIER ÉCRAN DE L'APP (21/09) ──────────────────────────────────
  //
  // 🔴 DEUX FICHIERS DÉCIDENT DU PREMIER ÉCRAN, ET ILS DIVERGEAIENT. Le
  // manifeste ouvre la PWA sur `/commander` ; `server.url` ouvre l'app des
  // stores sur la RACINE, c'est-à-dire la landing commerçante et ses tarifs
  // mensuels. Personne ne l'avait vu : TestFlight portait « aucun testeur »,
  // et Alex testait la PWA en croyant tester l'app déposée.
  //
  // ⚠️ CE QUE ÇA COÛTAIT : notre note de revue décrit un champ de localisation
  // « en haut à droite de l'écran d'accueil » qui n'existe pas sur la landing.
  // Le relecteur cherche un écran absent et conclut que l'app est incomplète,
  // soit le rejet 2.1 dont on venait de sortir.
  //
  // 🔴 LA GARDE VISE LA RÈGLE, PAS LA LIGNE. Si un jour `server.url` pointe
  // directement sur `/commander`, la redirection devient inutile et cette
  // garde doit cesser d'exiger : ce qui compte est qu'UNE des deux voies mène
  // l'app à l'application. Sinon, elle exigerait pour toujours un correctif
  // devenu du code mort.
  const ouvreLaRacine = !/url: 'https:\/\/www\.yoppaa\.app\/[a-z]/.test(conf)
  const racine = codeDe('app/page.tsx')
  const poses = (racine.match(/<RedirectionAppNative \/>/g) || []).length
  if (ouvreLaRacine) {
    // ⚠️ ON COMPTE LES DEUX BRANCHES. La page rend le teasing OU le reveal :
    // un seul exemplaire laisserait un chemin entier sur la landing, et c'est
    // exactement la moitié qu'on oublierait en relisant vite.
    verifie('🔴 l’app native ne reste pas sur la landing, dans les DEUX branches',
      poses === 2, `${poses} pose(s) de RedirectionAppNative, attendu 2`)

    const comp = codeDe('app/components/RedirectionAppNative.js')
    // ⚠️ LA DÉTECTION DESCEND DU MODULE PARTAGÉ, jamais recopiée : `push-natif`
    // rattrape déjà l'accès qui jette, et deux copies finissent par diverger.
    verifie('⚠️ la détection vient de estAppNative, pas d’une copie',
      /estAppNative/.test(comp) && /from '@\/lib\/push-natif'/.test(comp))
    verifie('🔴 elle envoie sur l’application, pas ailleurs',
      /replace\('\/commander'\)/.test(comp),
      'la cible a changé, ou `push` a remplacé `replace` et le retour arrière ramène sur la landing')
    // 🔴 DANS L'EFFET, JAMAIS PENDANT LE RENDU : lire `window` au rendu rouvre
    // la zone morte du 03/09, que ni le lint ni le build ne voient.
    //
    // 🔴 ET CETTE GARDE EST NÉE COMPLICE, attrapée par son propre harnais le
    // 21/09. Sa première version visait `useEffect` : le mot se trouve d'abord
    // dans l'IMPORT, tout en haut, donc l'index était toujours le plus petit et
    // la garde toujours verte. On vise l'APPEL, `useEffect(`, que l'import ne
    // contient pas. Le piège du mot trouvé ailleurs, une fois de plus.
    //
    // ⚠️ ET ON COMPTE EN PLUS DE VISER : une seconde lecture de la fenêtre,
    // posée ailleurs dans le composant, laisserait l'ordre juste et le défaut
    // entier.
    const lectures = (comp.match(/estAppNative\(window\)/g) || []).length
    verifie('⚠️ la fenêtre n’est lue qu’une fois', lectures === 1,
      `${lectures} lecture(s) de estAppNative(window), attendu 1`)
    verifie('⚠️ la fenêtre est lue dans un effet, pas pendant le rendu',
      comp.indexOf('useEffect(') >= 0
      && comp.indexOf('useEffect(') < comp.indexOf('estAppNative(window)'))
  }
}

// ═══ 7) LES WORKFLOWS QUI FABRIQUENT LES PAQUETS ═══════════════════════════
{
  // 🔴 LE DÉFAUT QUI NE SE VOIT NULLE PART (17/09, dans LES DEUX workflows).
  // `if: ${{ env.X != '' }}` sur une étape dont le `env:` définit X : la
  // condition est évaluée AVANT l'étape, donc X est vide, donc l'étape est
  // TOUJOURS sautée. Android sortait un bundle non signé et Google le refusait
  // sans un mot ; iOS échouait plus loin sur une erreur de signature obscure.
  // Aucun des deux n'apparaissait en échec à l'endroit du problème.
  for (const w of ['paquet-android', 'paquet-ios']) {
    const src = lire(`.github/workflows/${w}.yml`)
    // ⚠️ ON VISE LA FORME EXACTE, pas le mot « env » : `env:` est légitime
    // partout ailleurs, c'est sa lecture dans un `if:` d'étape qui piège.
    const ifs = src.match(/^\s*if:.*$/gm) || []
    const fautifs = ifs.filter((l) => /env\./.test(l))
    verifie(`🔴 ${w} : aucun « if » ne lit un env d’étape`, fautifs.length === 0,
      fautifs.join(' | '))
    // 🔴 ET LA SIGNATURE REFUSE DE SE TAIRE. Un paquet non signé n'a aucun
    // usage : mieux vaut échouer bruyamment que livrer un fichier mort.
    //
    // 🔴 CETTE GARDE A ÉTÉ VERTE ET COMPLICE, le 17/09 au soir, ET C'EST MOI
    // QUI L'AI DÉSARMÉE. Elle cherchait `::error::Le secret` dans le fichier.
    // En ajoutant l'étape de téléversement, j'ai mis un SECOND message de la
    // même forme dans le workflow iOS : retirer celui de la signature ne la
    // faisait alors plus rougir, puisqu'elle trouvait celui du dépôt. La
    // mutation l'a démasquée. C'est le motif du jour, quatrième fois : un mot
    // cherché se trouve ailleurs, et une garde meurt quand on touche à un
    // AUTRE endroit, sans un mot.
    //
    // ⚠️ ON COMPTE DONC, ON NE CHERCHE PLUS : chaque bloc de secrets
    // obligatoires doit porter SON cri. Un bloc ajouté demain sans message
    // fera rougir celle-ci, au lieu de se glisser derrière les autres.
    // ⚠️ LES CHIFFRES COMPTENT DANS LES NOMS : `CLE_ANDROID_B64`,
    // `CERTIFICAT_P12_B64`. Première écriture sans `0-9`, elle trouvait zéro
    // bloc et rougissait sur du code juste. Deuxième fois aujourd'hui qu'une
    // garde neuve accuse le bon code ; c'est le détail affiché qui l'a dit.
    const blocs = (src.match(/for v in [A-Z0-9_ ]+; do/g) || []).length
    const cris = (src.match(/::error::Le secret \$v manque/g) || []).length
    verifie(`🔴 ${w} : CHAQUE bloc de secrets fait échouer le travail`,
      blocs > 0 && cris === blocs && /exit 1/.test(src),
      `blocs=${blocs}, messages=${cris}`)
  }

  const android = lire('.github/workflows/paquet-android.yml')
  // 🔴 `apksigner` NE SIGNE PAS UN BUNDLE : c'est l'outil des APK, et il refuse
  // un .aab. Un bundle se signe avec `jarsigner`.
  //
  // ⚠️ ON VISE LES LIGNES EXÉCUTÉES, PAS LE FICHIER. La première version de
  // cette garde rougissait sur le COMMENTAIRE ci-dessus, qui explique
  // précisément pourquoi cet outil est écarté. Deuxième fois de la semaine :
  // un mot cherché se trouve dans ce qui le proscrit.
  const lignesYml = android.split('\n').filter((l) => !/^\s*#/.test(l))
  verifie('🔴 le bundle est signé avec jarsigner',
    lignesYml.some((l) => /\bjarsigner\b/.test(l)))
  verifie('🔴 et jamais avec apksigner, qui refuse un .aab',
    !lignesYml.some((l) => /\bapksigner\b/.test(l)))
  // ⚠️ ON VÉRIFIE LA SIGNATURE APRÈS L'AVOIR POSÉE : `jarsigner` peut rendre 0
  // sans avoir rien signé, et l'artefact muet ne se découvre qu'au dépôt.
  //
  // 🔴 ET ON LIT SA PHRASE, PAS SON CODE DE SORTIE. Les deux autres façons ont
  // été essayées sur un vrai paquet le 17/09 et sont fausses : `-strict` échoue
  // sur un certificat auto-signé, ce qu'est TOUJOURS une clé Android ; et sans
  // `-strict`, jarsigner rend 0 même sur un jar non signé.
  verifie('⚠️ la signature est vérifiée après coup', /jarsigner -verify /.test(android))
  verifie('🔴 et la vérification lit « jar verified », pas le code de sortie',
    /grep -q "jar verified"/.test(android))
  verifie('🔴 « -strict » ne revient pas : il rejette le cas normal',
    !lignesYml.some((l) => /jarsigner -verify -strict/.test(l)))
  // 🔴 `gradlew` DOIT ÊTRE RENDU EXÉCUTABLE AVANT D'ÊTRE LANCÉ. Le dépôt vit
  // sous Windows, où Git ne conserve pas le bit : le runner Linux répond
  // « Permission denied », code 126, et ne nomme rien. Défaut réel du 17/09.
  //
  // ⚠️ ON VÉRIFIE L'ORDRE, pas la présence : un `chmod` après l'appel ne sert
  // à rien, et une garde qui cherche les deux mots serait verte à l'envers.
  {
    const iChmod = android.indexOf('chmod +x ./gradlew')
    const iLance = android.indexOf('./gradlew bundleRelease')
    verifie('🔴 gradlew est rendu exécutable AVANT d’être lancé',
      iChmod > -1 && iLance > -1 && iChmod < iLance)
  }
  // 🔴 ET LE NUMÉRO DE BUILD AUSSI. Un `sed` qui ne trouve rien ne dit rien :
  // le paquet repartirait avec l'ancien numéro, le premier dépôt passerait, et
  // le second serait refusé pour une cause à chercher très loin de là.
  verifie('🔴 le numéro de build posé est relu',
    /grep -q "versionCode/.test(android) && /Le numero de build n a pas ete pose/.test(android))

  // ─── LE FICHIER D'ESSAI POUR UN TÉLÉPHONE (03/10) ───────────────────────
  //
  // 🔴 Le partage interne de Play Console est refusé tant que l'app n'a jamais
  // été publiée : sans un APK installable, la version Android partait en revue
  // sans avoir tourné une seule fois sur un vrai téléphone.
  {
    const lignesAndroid = lignesYml.join('\n')
    verifie('🔴 la fabrication Android produit aussi un APK d’essai',
      /bundletool\.jar build-apks --bundle="\$AAB"[\s\S]{0,80}--mode=universal/.test(lignesAndroid)
      && /yoppaa-essai\.apk/.test(lignesAndroid))
    // ⚠️ L'OUTIL QUI SIGNE AVEC NOTRE CLÉ EST FIGÉ ET VÉRIFIÉ : un jar remplacé
    // signerait n'importe quoi au nom d'Avcotech.
    verifie('🔴 bundletool est figé à une version et vérifié par son empreinte',
      /BT_VERSION=\d+\.\d+\.\d+/.test(lignesAndroid) && /BT_SHA256=[0-9a-f]{64}/.test(lignesAndroid)
      && /sha256sum -c -/.test(lignesAndroid))
    const iVerif = lignesAndroid.indexOf('sha256sum -c -')
    const iUsage = lignesAndroid.indexOf('java -jar bundletool.jar')
    verifie('🔴 et vérifié AVANT de s’en servir', iVerif > -1 && iUsage > iVerif)
    verifie('⚠️ la clé est effacée quoi qu’il arrive', /trap 'rm -f cle\.jks' EXIT/.test(lignesAndroid))
    verifie('⚠️ l’APK d’essai est récupéré avec le bundle',
      /path: \|\s*\n\s*android\/app\/build\/outputs\/bundle\/release\/\*\.aab\s*\n\s*android\/app\/build\/outputs\/bundle\/release\/yoppaa-essai\.apk/.test(android))
  }

  // ═══ LE WORKFLOW iOS, QUI N'A JAMAIS TOURNÉ (17/09) ═════════════════════
  //
  // 🔴 C'EST EXACTEMENT LA SITUATION DU MATIN. Le workflow Android portait CINQ
  // défauts silencieux, tous découverts en le lançant pour de vrai. Celui d'iOS
  // n'a pas encore été exécuté : ses gardes sont donc la seule chose qui le
  // sépare d'une soirée perdue sur une erreur de signature illisible.
  {
    const ios = lire('.github/workflows/paquet-ios.yml')
    const lignesIos = ios.split('\n').filter((l) => !/^\s*#/.test(l))

    // 🔴 SIGNATURE MANUELLE, OBLIGATOIRE EN CI. Le projet Xcode porte
    // `CODE_SIGN_STYLE = Automatic` : Xcode voudrait alors ouvrir une session
    // Apple pour gérer les certificats, et un runner GitHub n'en a aucune.
    verifie('🔴 iOS archive en signature MANUELLE',
      lignesIos.some((l) => /CODE_SIGN_STYLE=Manual/.test(l)))
    verifie('🔴 et il nomme l’équipe, que xcodebuild ne devine pas',
      /DEVELOPMENT_TEAM="\$TEAM_ID"/.test(ios))

    // ⚠️ L'ÉQUIPE VIENT D'UN SECRET, JAMAIS DU FICHIER. Un Team ID écrit en dur
    // dans un dépôt public dit à qui appartient le compte, et fige une valeur
    // qui change si la société change d'équipe.
    // ⚠️ PREMIÈRE VERSION FAUSSE, corrigée dans la minute : elle interdisait
    // `DEVELOPMENT_TEAM=` suivi d'autre chose qu'un `$`, et rougissait donc sur
    // `DEVELOPMENT_TEAM="$TEAM_ID"`, à cause du guillemet. Une garde qui rougit
    // sur du code juste ne protège de rien : elle vise maintenant le DÉFAUT,
    // un Team ID de dix caractères écrit en clair dans le dépôt.
    verifie('⚠️ le Team ID vient d’un secret, pas du fichier',
      /secrets\.APPLE_TEAM_ID/.test(ios)
      && !lignesIos.some((l) => /DEVELOPMENT_TEAM="?[A-Z0-9]{10}"?/.test(l)))

    // 🔴 L'EXPORT NE DEVINE NI L'ÉQUIPE NI LE PROFIL. Sans `teamID`, un compte à
    // plusieurs équipes échoue ; sans `provisioningProfiles`, le profil importé
    // trois étapes plus haut est copié sur le runner et jamais utilisé.
    verifie('🔴 l’export nomme l’équipe',
      /<key>teamID<\/key>/.test(ios))
    verifie('🔴 l’export reste en signature manuelle',
      /<key>signingStyle<\/key><string>manual<\/string>/.test(ios))
    verifie('🔴 et il associe le bundle à son profil',
      /<key>provisioningProfiles<\/key>/.test(ios)
      && /<key>app\.yoppaa\.client<\/key>/.test(ios))

    // ⚠️ LE `heredoc` DOIT INTERPOLER. Écrit `<<'PLIST'` avec des apostrophes,
    // le shell recopie `${TEAM_ID}` littéralement dans le fichier, et l'export
    // part avec le texte au lieu de la valeur. Le défaut serait invisible à la
    // lecture du workflow.
    verifie('🔴 le gabarit d’export interpole ses variables',
      /cat > export\.plist <<PLIST/.test(ios) && !/cat > export\.plist <<'PLIST'/.test(ios))

    // 🔴 ON RELIT CE QU'ON A PRODUIT, ET ON LIT LA PHRASE. La leçon du paquet
    // Android : une commande de vérification peut rendre 0 sans rien vérifier.
    verifie('🔴 la signature du .ipa est vérifiée après coup',
      lignesIos.some((l) => /codesign -dv/.test(l)))
    verifie('🔴 et la vérification lit l’autorité, pas le code de sortie',
      /grep -q "Authority=Apple Distribution"/.test(ios))
    verifie('🔴 elle vérifie aussi que c’est le bon bundle',
      /grep -q "app\.yoppaa\.client"/.test(ios))

    // ⚠️ ET LES DEUX NOUVEAUX SECRETS FONT ÉCHOUER LE TRAVAIL S'ILS MANQUENT,
    // comme les trois autres. Un paquet signé par défaut n'existe pas : il
    // sortirait inutilisable, et le dépôt le refuserait des heures plus tard.
    verifie('🔴 les secrets d’équipe manquants font échouer le travail',
      /::error::APPLE_TEAM_ID ou PROFIL_NOM manque/.test(ios))

    // ═══ COCOAPODS OU SWIFT PACKAGE MANAGER, IL FAUT CHOISIR ═══════════════
    //
    // 🔴 LES DEUX DÉFAUTS TROUVÉS AU PREMIER VRAI LANCEMENT (17/09 au soir).
    // Le workflow lançait `pod install` et archivait un `App.xcworkspace` :
    // Capacitor 8 est passé à Swift Package Manager, et NI L'UN NI L'AUTRE
    // n'existe dans ce dépôt. GitHub a répondu « No Podfile found », et le
    // second défaut ne se serait révélé qu'après la correction du premier,
    // dix minutes de Mac plus tard.
    //
    // ⚠️ C'EST LA CONFIRMATION DE LA RÈGLE DU MATIN : un workflow qui n'a
    // jamais tourné ne prouve rien, quelle que soit la qualité de sa relecture.
    // J'avais corrigé trois défauts par la lecture ; il en restait deux que
    // seul le lancement pouvait montrer.
    //
    // ⚠️ ON VÉRIFIE AUSSI L'ÉTAT DU DÉPÔT, pas seulement le texte du workflow :
    // le jour où un Podfile réapparaîtrait, c'est le workflow qu'il faudrait
    // changer, et cette garde le dira avant le build.
    const aUnPodfile = existe('ios/App/Podfile')
    const aUnPackageSwift = existe('ios/App/CapApp-SPM/Package.swift')
    verifie('le projet iOS est en Swift Package Manager, pas en CocoaPods',
      aUnPackageSwift && !aUnPodfile,
      `Package.swift=${aUnPackageSwift}, Podfile=${aUnPodfile}`)
    verifie('🔴 le workflow ne lance donc jamais « pod install »',
      !lignesIos.some((l) => /\bpod install\b/.test(l)))
    verifie('🔴 et il archive le PROJET, pas un workspace CocoaPods',
      lignesIos.some((l) => /-project App\.xcodeproj/.test(l))
      && !lignesIos.some((l) => /-workspace App\.xcworkspace/.test(l)))
    // ⚠️ LES PAQUETS SE RÉSOLVENT AVANT L'ARCHIVE, explicitement : sinon Xcode
    // les télécharge au milieu du build, et une coupure réseau échoue dans une
    // étape qui parle de signature.
    verifie('⚠️ les dépendances Swift sont résolues avant l’archive',
      /-resolvePackageDependencies/.test(ios))

    // ═══ LE DÉPÔT CHEZ APPLE, QUI N'A PAS D'AUTRE VOIE ═════════════════════
    //
    // 🔴 ET C'EST LA DISSYMÉTRIE AVEC ANDROID, pas un oubli. Le `.aab` se
    // dépose à la main dans la console Play, depuis n'importe quel navigateur,
    // Windows compris. Un `.ipa`, non : App Store Connect ne prend le fichier
    // que par `altool` ou Transporter, qui font partie de Xcode et n'existent
    // donc que sur macOS. Le paquet Android n'a PAS besoin de cette étape ;
    // celui d'iOS ne peut pas s'en passer.
    const sansComm = lignesIos.join('\n')
    verifie('🔴 le paquet iOS est téléversé depuis le Mac de GitHub',
      /xcrun altool --upload-app/.test(sansComm))

    // ⚠️ L'ARTEFACT EST RÉCUPÉRÉ AVANT LE DÉPÔT, et l'ordre est le fond de
    // l'affaire : un dépôt refusé (numéro de build déjà vu, réseau) ferait
    // sinon perdre un fichier parfaitement bon, et dix minutes de Mac avec.
    {
      const iArtefact = sansComm.indexOf('upload-artifact')
      const iDepot = sansComm.indexOf('altool --upload-app')
      verifie('🔴 le fichier est mis de côté AVANT d’être déposé',
        iArtefact > -1 && iDepot > -1 && iArtefact < iDepot)
    }

    // ⚠️ ON VALIDE AVANT DE DÉPOSER. Un numéro de build brûlé ne se réutilise
    // jamais : autant apprendre d'une validation qu'il manque une icône.
    {
      const iValide = sansComm.indexOf('altool --validate-app')
      const iDepot = sansComm.indexOf('altool --upload-app')
      verifie('🔴 la validation passe AVANT le dépôt',
        iValide > -1 && iDepot > -1 && iValide < iDepot)
    }

    // 🔴 ET ON LIT CE QU'ALTOOL A ÉCRIT, PAS SON CODE DE SORTIE. Troisième fois
    // que ce motif se présente : `jarsigner -verify` rendait 0 sur un bundle
    // non signé, `codesign` peut se taire, et `altool` range ses refus dans
    // « product-errors ». Les DEUX appels doivent être relus, pas seulement le
    // dernier : une validation refusée qu'on n'écoute pas mène droit au dépôt.
    verifie('🔴 la validation et le dépôt sont relus, tous les deux',
      (sansComm.match(/grep -q "product-errors"/g) || []).length === 2)

    // 🔴 `altool` NE PREND PAS DE CHEMIN VERS LA CLÉ, IL LA CHERCHE. Sous ce
    // dossier, et sous ce nom exact. Nommée autrement, elle est introuvable et
    // le message ne dit pas où il regardait.
    verifie('🔴 la clé API porte le nom qu’Apple ira chercher',
      /AuthKey_\$CLE_API_ID\.p8/.test(sansComm)
      && /\.appstoreconnect\/private_keys/.test(sansComm))

    // ⚠️ LES TROIS SECRETS DU DÉPÔT MANQUANTS FONT ÉCHOUER LE TRAVAIL, comme
    // les cinq autres. Sans eux le paquet sortirait, mais ne partirait nulle
    // part, et le travail serait vert.
    verifie('🔴 les secrets du dépôt manquants font échouer le travail',
      /::error::Le secret \$v manque\. Sans les trois, rien ne peut etre televerse/.test(ios))

    // 🔴 ET LA CLÉ PRIVÉE NE VIT QUE DANS UN SECRET. Qui la détient peut
    // déposer une application au nom d'Avcotech.
    verifie('🔴 la clé privée vient d’un secret, jamais du dépôt',
      /secrets\.APPSTORE_CLE_P8_B64/.test(ios)
      && !/BEGIN PRIVATE KEY/.test(ios))

    // 🔴 LA DÉCLARATION D'EXPORT, SANS LAQUELLE CHAQUE DÉPÔT RESTE EN ATTENTE.
    // Absente de l'Info.plist, App Store Connect marque le build « Conformité
    // aux règles d'exportation manquante » et REFUSE de le laisser soumettre
    // tant qu'on n'a pas répondu à la question, à la main, à chaque version.
    // Yoppaa ne fait que du HTTPS, qui est exempté : la réponse est « false ».
    {
      const plist = lire('ios/App/App/Info.plist')
      verifie('🔴 la conformité export est déclarée, sinon chaque dépôt attend',
        /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist))
    }
  }
}

// ═══ 8) CE QUE LE CODE DEMANDE, LES MANIFESTES DOIVENT LE DÉCLARER ════════
//
// 🔴 LE DÉFAUT DU 17/09 À MINUIT, ET C'EST APPLE QUI L'A TROUVÉ, PAS NOUS.
// Le premier dépôt a répondu ITMS-90683 : pas de chaîne d'explication pour la
// position dans l'`Info.plist`. En cherchant les frères, il y en avait DEUX
// autres, dont un côté Android que rien n'aurait jamais signalé : le manifeste
// ne déclarait QUE `INTERNET`, alors que `navigator.geolocation` est appelé
// dans quatre fichiers.
//
// ⚠️ AUCUN PLUGIN NE LES AJOUTE À NOTRE PLACE. La caméra passe par le
// navigateur ; la position passe depuis le 02/10 par `@capacitor/geolocation`,
// dont le manifeste Android ne déclare AUCUNE permission (vérifié dans le
// paquet installé). Rien ne fusionne donc dans ces fichiers, contrairement à
// ce qu'on lit partout : nos déclarations restent la seule source.
//
// ⚠️ LA GARDE PART DU CODE, PAS DES MANIFESTES. Vérifier qu'une clé est
// présente ne dit rien : c'est l'APPEL qui crée l'obligation. Le jour où un
// écran appellera la caméra ou le micro, c'est ici que ça rougira.
{
  // 🔴 ET ON RETIRE LES COMMENTAIRES DES DEUX MANIFESTES AVANT DE LIRE. Ceux
  // que je viens d'y écrire NOMMENT les permissions qu'ils expliquent : une
  // garde qui cherche le mot le trouverait dans sa propre justification, et
  // resterait verte sur un manifeste vidé. C'est le motif déjà vu deux fois
  // cette semaine, un mot cherché se trouve dans ce qui le proscrit.
  const sansXml = (t) => t.replace(/<!--[\s\S]*?-->/g, '')
  const plist = sansXml(lire('ios/App/App/Info.plist'))
  const manif = sansXml(lire('android/app/src/main/AndroidManifest.xml'))

  const fichiersJs = ['app', 'lib'].flatMap((dossier) =>
    readdirSync(new URL(`../${dossier}/`, import.meta.url), { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.js'))
      .map((f) => `${dossier}/${f.split('\\').join('/')}`))
  const toutLeCode = fichiersJs.map((f) => codeDe(f)).join('\n')

  // ⚠️ LA POSITION. Quatre fichiers l'appellent, et sans géolocalisation il
  // n'y a plus AUCUN lieu à montrer : l'écran principal se vide.
  //
  // ⚠️ DEPUIS LE 02/10, LES ÉCRANS PASSENT PAR `lirePosition` (le module natif
  // dans l'app, le navigateur ailleurs) : chercher le seul mot
  // `navigator.geolocation` aurait conclu « personne ne demande la position »,
  // et toute cette section se serait tue. On cherche les deux voies.
  const veutPosition = /navigator\??\.geolocation|lirePosition\(/.test(toutLeCode)
  verifie('⚠️ le code appelle bien la position (sinon cette section ment)',
    veutPosition)
  if (veutPosition) {
    verifie('🔴 iOS explique POURQUOI il demande la position',
      /<key>NSLocationWhenInUseUsageDescription<\/key>/.test(plist))
    // 🔴 LE MODULE NATIF APPORTE SA PROPRE OBLIGATION (03/10, ITMS-90683 sur le
    // build 1.0.1 (3)). `@capacitor/geolocation` contient du code capable de
    // demander la position « toujours ». Nous ne l'appelons jamais, mais Apple
    // analyse le BINAIRE, pas notre usage : sans cette phrase, le dépôt passe
    // pour TestFlight et la SOUMISSION est refusée. C'est le même défaut que le
    // build 1 de septembre, venu cette fois d'une bibliothèque.
    const pkgPosition = JSON.parse(lire('package.json'))
    if (pkgPosition.dependencies?.['@capacitor/geolocation']) {
      verifie('🔴 iOS explique aussi la position « toujours », que le module natif référence',
        /<key>NSLocationAlwaysAndWhenInUseUsageDescription<\/key>/.test(plist))
    }
    verifie('🔴 Android déclare la position, sans quoi le WebView ne l’obtient jamais',
      /android\.permission\.ACCESS_FINE_LOCATION/.test(manif)
      && /android\.permission\.ACCESS_COARSE_LOCATION/.test(manif))
    // ⚠️ ET LE GPS RESTE FACULTATIF. Sans ces deux lignes, Google Play déduit
    // de la permission que l'appareil DOIT avoir un GPS, et masque
    // l'application à ceux qui n'en ont pas. Yoppaa sait vivre sans : on
    // choisit sa commune à la main.
    verifie('🔴 le GPS n’est pas rendu obligatoire à l’installation',
      /location\.gps"\s+android:required="false"/.test(manif)
      && /location\.network"\s+android:required="false"/.test(manif))

    // 🔴 ET CE QUE LE MANIFESTE DEMANDE DOIT ÊTRE DÉCLARÉ AUX STORES.
    //
    // LE TROU DU 18/09, TROUVÉ PAR ALEX EN DEMANDANT « on devait changer
    // quelque chose dans les déclarations Play ? ». `ACCESS_FINE_LOCATION` est
    // entrée au manifeste le 17/09 au soir ; `DOSSIER_STORES.md` ne prévoyait
    // de déclarer que la position « approximative ». **Google RECOUPE
    // automatiquement le manifeste avec le formulaire Sécurité des données**,
    // et la divergence se paie au dépôt, donc APRÈS la revue.
    //
    // ⚠️ RIEN NE REGARDAIT DANS CE SENS-LÀ. La garde ci-dessus part du CODE et
    // s'arrête au MANIFESTE ; il manquait le maillon suivant, du manifeste vers
    // ce qu'on déclare. Vingt-quatre heures sans que personne le voie.
    //
    // ⚠️ ET LA POSITION PRÉCISE EST JUSTIFIÉE, ce n'est pas du zèle : la
    // documentation Android chiffre `ACCESS_COARSE_LOCATION` à environ 3 km²,
    // soit un kilomètre de rayon. La liste d'accueil affiche « 38 m », « 43 m »,
    // « 67 m » et CLASSE par proximité : avec l'approximative seule, ces
    // distances deviennent indiscernables.
    const dossier = lire('DOSSIER_STORES.md')
    if (/ACCESS_FINE_LOCATION/.test(manif)) {
      // ⚠️ ON VISE LA LIGNE DES DONNÉES COLLECTÉES, pas le mot « précise » :
      // le dossier l'emploie plusieurs fois dans l'explication juste en
      // dessous, et une garde qui chercherait le mot se trouverait dans la
      // justification en laissant la déclaration fausse.
      verifie('🔴 le dossier déclare la position PRÉCISE, que le manifeste demande',
        /position approximative ET PRÉCISE/.test(dossier))
    }
  }

  // ─── LES TEXTES DE FICHE ────────────────────────────────────────────────
  //
  // 🔴 UN TEXTE TROP LONG EST REFUSÉ AU COLLAGE, pas à la revue : la console
  // le tronque ou le rejette, et on l'abrège dans l'urgence, mal. Les limites
  // comptent des CARACTÈRES, accents compris.
  //
  // 🔴 ET AUCUN STORE N'INTERPRÈTE LE MARKDOWN. Deux intertitres de la
  // description longue étaient en `**gras**` : les astérisques seraient
  // parties telles quelles dans la fiche publique. Le défaut avait été
  // SIGNALÉ, puis porté de todo en todo pendant des semaines, parce que rien
  // ne le mesurait.
  {
    const dossierFiches = lire('DOSSIER_STORES.md')
    const lignesFiches = dossierFiches.split('\n')
    let champs = 0
    for (let i = 0; i < lignesFiches.length; i++) {
      const entete = /^\*\*(.+?)\*\*\s*\((\d+)\s*caractères max/.exec(lignesFiches[i])
      if (!entete) continue
      const corps = []
      for (let j = i + 1; j < lignesFiches.length; j++) {
        const l = lignesFiches[j]
        if (l.trim() === '') { if (corps.length) break; continue }
        if (!l.startsWith('>')) break
        corps.push(l.replace(/^>\s?/, ''))
      }
      const texte = corps.join('\n').replace(/^`|`$/gm, '').trim()
      // 🔴 UN CHAMP VIDE PASSAIT TOUT SEUL, et ma propre garde est née comme
      // ça : l'entête « Description » d'Apple renvoie au texte de Google Play
      // plutôt que de le dupliquer, donc il n'a pas de bloc `>`. Le parseur en
      // faisait un texte de zéro caractère, qui tient dans n'importe quelle
      // limite et ne contient aucun markdown. DEUX vérifications vertes en
      // n'ayant rien regardé.
      // On ne compte donc que les champs qui portent vraiment un texte, et le
      // total attendu plus bas fait le reste : vider un vrai texte le fait
      // sortir du compte, et la section rougit.
      if (!texte) continue
      champs++
      verifie(`🔴 « ${entete[1]} » tient dans ses ${entete[2]} caractères (${texte.length})`,
        texte.length <= Number(entete[2]))
      // ⚠️ ON NE CHERCHE LE MARKDOWN QUE DANS LE TEXTE FINAL, jamais dans tout
      // le document : les notes qui expliquent de NE PAS en mettre en
      // contiennent, et une garde qui lirait le fichier entier se trouverait
      // dans sa propre consigne. Quatrième fois cette semaine.
      verifie(`🔴 « ${entete[1]} » sans markdown, qu'aucun store n'interprète`,
        !/\*\*/.test(texte))
    }
    // ⚠️ SANS CE COMPTE, un parseur cassé rendrait zéro champ et la section
    // entière serait verte en n'ayant rien regardé.
    verifie('⚠️ les sept textes de fiche sont bien trouvés', champs >= 7, champs + ' trouvés')
  }

  // ⚠️ L'IMAGE. Un `<input type="file" accept="image/*">` propose « Prendre une
  // photo » sur iPhone : sans `NSCameraUsageDescription`, iOS TUE l'app à
  // l'instant où l'utilisateur y touche. Ce n'est pas un avertissement.
  //
  // ⚠️ ANDROID N'A RIEN À DÉCLARER ICI, et c'est la dissymétrie : le WebView
  // passe par l'intent système, qui s'exécute dans l'application Appareil
  // photo. Demander `CAMERA` nous obligerait au contraire à la réclamer à
  // l'utilisateur pour rien.
  const veutImage = /type="file"[^>]*accept="image/.test(toutLeCode)
  verifie('⚠️ le code ouvre bien un choix d’image (sinon cette section ment)',
    veutImage)
  if (veutImage) {
    verifie('🔴 iOS explique POURQUOI il ouvre l’appareil photo',
      /<key>NSCameraUsageDescription<\/key>/.test(plist))
    verifie('🔴 iOS explique POURQUOI il ouvre la photothèque',
      /<key>NSPhotoLibraryUsageDescription<\/key>/.test(plist))
  }

  // 🔴 ET UNE CHAÎNE VIDE OU CREUSE SE FAIT REJETER. Apple refuse « cette app
  // a besoin de votre position » : le texte doit dire à quoi ça sert, dans la
  // langue de l'utilisateur. On exige donc qu'il nomme l'app et qu'il ait la
  // longueur d'une vraie phrase.
  for (const cle of ['NSCameraUsageDescription', 'NSLocationWhenInUseUsageDescription',
    'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSPhotoLibraryUsageDescription']) {
    const m = plist.match(new RegExp(`<key>${cle}</key>\\s*<string>([^<]*)</string>`))
    const texte = m ? m[1] : ''
    verifie(`🔴 ${cle} dit à quoi ça sert`,
      texte.length >= 40 && /Yoppaa/.test(texte), `« ${texte} »`)
  }
}

// ═══ 9) RESTER DANS L'APP (02/10) ══════════════════════════════════════════
//
// 🔴 LE RELEVÉ DU 02/10. Dans l'app des stores, iOS envoie dans SAFARI toute
// nouvelle fenêtre (`target="_blank"`, `window.open`), même vers yoppaa.app
// (`WebViewDelegationHandler.swift`, `createWebViewWith`). Le Yopper quittait
// l'app pour lire les CGU, et rien ne le ramenait.
{
  const profil = codeDe('app/commander/page.js')
  // ⚠️ ON VISE LE BLOC DES TROIS LIENS, pas le mot `_blank` : le profil en
  // porte d'autres, légitimes (suivi du colis chez le transporteur).
  const iLegal = profil.indexOf("{ href: '/legal#cgu-client'")
  const blocLegal = iLegal > 0 ? profil.slice(iLegal, iLegal + 700) : ''
  verifie('⚠️ le bloc des liens légaux est trouvé (sinon la garde ment)', blocLegal.length > 0)
  verifie('🔴 dans l’app, les CGU s’ouvrent sur place, pas dans Safari',
    /target=\{natif \? undefined : '_blank'\}/.test(blocLegal) && !/target="_blank"/.test(blocLegal))
  // ⚠️ `natif` DOIT VENIR DU CROCHET, lu après le montage : lu pendant le rendu,
  // il rouvrirait la zone morte du 03/09 et ferait diverger serveur et téléphone.
  verifie('⚠️ et `natif` vient du crochet partagé, lu après le montage',
    /const natif = useAppNative\(\)/.test(profil) && /from '@\/lib\/use-app-native'/.test(profil))

  // 🔴 ET LA PAGE QUI S'OUVRE SUR PLACE DOIT AVOIR SON RETOUR. L'iPhone n'offre
  // aucun geste « précédent » dans une WebView : sans bouton, le Yopper reste
  // bloqué sur les CGU.
  const legal = codeDe('app/legal/page.js')
  verifie('🔴 la page légale affiche un retour dans l’app',
    /\{natif && \([\s\S]{0,200}onClick=\{retourDepuisLegal\}/.test(legal)
    && /const natif = useAppNative\(\)/.test(legal))
  verifie('⚠️ et ce retour a un point de chute quand il n’y a pas d’historique',
    /window\.history\.length > 1\) window\.history\.back\(\)[\s\S]{0,80}window\.location\.href = '\/commander'/.test(legal))

  // ⚠️ LA RÈGLE, PAS SEULEMENT LE CAS. Un lien écrit en dur vers une page de
  // Yoppaa avec `target="_blank"` ferait sortir de l'app de la même façon.
  const pagesYopper = ['app/commander', 'app/onboarding', 'app/carte', 'app/cadeau', 'app/empreinte']
    .flatMap((dossier) => readdirSync(new URL(`../${dossier}/`, import.meta.url), { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.js'))
      .map((f) => `${dossier}/${f.split('\\').join('/')}`))
  const fautifs = pagesYopper.filter((f) =>
    /<a\b[^>]*\bhref=["'{`]+\/(?!\/)[^>]*\btarget="_blank"/.test(codeDe(f))
    || /<a\b[^>]*\btarget="_blank"[^>]*\bhref=["'{`]+\/(?!\/)/.test(codeDe(f)))
  verifie('🔴 aucun lien interne des pages Yopper ne s’ouvre dans une nouvelle fenêtre',
    fautifs.length === 0, fautifs.join(', '))
  verifie('⚠️ les pages Yopper sont bien lues (sinon la règle ne regarde rien)',
    pagesYopper.length >= 20, `${pagesYopper.length} fichiers`)
}

// ═══ 10) TOUCHER UNE NOTIFICATION OUVRE LA BONNE PAGE (02/10) ══════════════
//
// 🔴 LE SERVEUR ENVOYAIT `url: '/commander?…'`, UN CHEMIN RELATIF, vers le web
// ET vers l'app. Dans l'app, OneSignal tentait de l'ouvrir tel quel dans un
// navigateur ; et personne n'écoutait le toucher. « Ta commande est prête »
// ouvrait l'app sur la dernière page vue.
{
  // ─── Le chemin : seul un chemin interne passe ───
  egal('un chemin interne passe tel quel',
    cheminDeNotification('/commander?onglet=commandes'), '/commander?onglet=commandes')
  egal('une adresse complète de yoppaa.app devient son chemin',
    cheminDeNotification('https://www.yoppaa.app/commander/rdv/salon'), '/commander/rdv/salon')
  for (const [nom, adresse] of [
    ['un autre site', 'https://exemple.com/piege'],
    ['un sous-domaine déguisé', 'https://www.yoppaa.app.exemple.com/piege'],
    ['une adresse sans protocole', '//exemple.com/piege'],
    ['la barre oblique inverse', '/\\exemple.com'],
    ['un script', 'javascript:alert(1)'],
    ['un caractère de contrôle', '/commander\u0000'],
  ]) {
    verifie(`🔴 ${nom} n’est jamais ouvert dans l’app`, cheminDeNotification(adresse) === null, adresse)
  }
  verifie('rien, c’est rien', cheminDeNotification(undefined) === null && cheminDeNotification('') === null)

  // ─── Le toucher : les données d'abord, l'adresse de lancement ensuite ───
  const clic = (additionalData, launchURL) => ({ notification: { additionalData, launchURL } })
  egal('🔴 le chemin des données est celui qu’on ouvre',
    cheminDeClic(clic({ chemin: '/commander/rdv/salon' }, 'https://www.yoppaa.app/autre')), '/commander/rdv/salon')
  egal('⚠️ une notification écrite dans le tableau de bord passe par son adresse',
    cheminDeClic(clic({}, 'https://www.yoppaa.app/commander')), '/commander')
  verifie('🔴 un chemin piégé dans les données n’ouvre rien',
    cheminDeClic(clic({ chemin: 'https://exemple.com' })) === null)
  verifie('un toucher vide n’ouvre rien', cheminDeClic({}) === null && cheminDeClic(undefined) === null)

  // ─── L'écoute : une fois par page, et elle ouvre ce qu'il faut ───
  const ouverts = []
  const { fenetre, journal } = fenetreNative()
  const r1 = brancherClicNatif(fenetre, (c) => ouverts.push(c))
  verifie('🔴 l’écoute du toucher se branche dans l’app', r1.ok === true && r1.raison === null)
  egal('sur l’événement « click »', journal.find((l) => l[0] === 'addEventListener')?.[1], 'click')
  const r2 = brancherClicNatif(fenetre, (c) => ouverts.push(c))
  // ⚠️ LE PLUGIN EMPILE LES ÉCOUTEURS : deux branchements ouvriraient deux fois.
  verifie('⚠️ un second montage ne rebranche rien',
    r2.ok === true && r2.raison === 'deja_branche' && journal.ecouteurs.length === 1)
  journal.ecouteurs[0](clic({ chemin: '/commander?onglet=commandes' }))
  egal('🔴 toucher la notification ouvre SA page', ouverts.join(' | '), '/commander?onglet=commandes')
  journal.ecouteurs[0](clic({ chemin: '//exemple.com' }))
  egal('🔴 et un chemin piégé n’ouvre rien', ouverts.length, 1)
  egal('hors de l’app, rien ne se branche', brancherClicNatif({}, () => {}).raison, 'pas_natif')
  egal('sans fonction pour ouvrir, on le dit', brancherClicNatif(fenetreNative().fenetre).raison, 'ouvrir_absent')
  const casse = brancherClicNatif(fenetreNative({ ecouteJette: true }).fenetre, () => {})
  verifie('⚠️ une écoute qui jette se nomme, sans emporter la page',
    casse.ok === false && casse.raison === 'ecoute')

  // ─── Ce que le serveur envoie, EXÉCUTÉ avec un faux réseau ───
  //
  // ⚠️ ON LIT LA CHARGE RÉELLEMENT ENVOYÉE, pas le texte du module : c'est elle
  // que OneSignal reçoit.
  const envAvant = { id: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID, cle: process.env.ONESIGNAL_REST_API_KEY }
  const fetchAvant = globalThis.fetch
  const charges = []
  try {
    process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID = 'app-banc'
    process.env.ONESIGNAL_REST_API_KEY = 'cle-banc'
    globalThis.fetch = async (_url, init) => {
      charges.push(JSON.parse(init.body))
      return { ok: true, json: async () => ({ id: 'n1', recipients: 1 }) }
    }
    await envoyerPush({ headings: 'Prête', contents: 'Ta commande', url: '/commander?onglet=commandes',
      include_aliases: { external_id: ['c1'] }, data: { kind: 'commande' } })
    await envoyerPush({ headings: 'Actu', contents: 'Sans lien', filters: [{ field: 'tag', key: 'a', relation: '=', value: '1' }] })
  } finally {
    globalThis.fetch = fetchAvant
    if (envAvant.id === undefined) delete process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
    else process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID = envAvant.id
    if (envAvant.cle === undefined) delete process.env.ONESIGNAL_REST_API_KEY
    else process.env.ONESIGNAL_REST_API_KEY = envAvant.cle
  }
  const [avecLien, sansLien] = charges
  verifie('⚠️ les deux envois sont partis (sinon la suite ne lit rien)', charges.length === 2, `${charges.length}`)
  // 🔴 EN ADRESSE COMPLÈTE (03/10). Relative, elle était acceptée par `url` et
  // fait REJETER tout le message par `web_url` : plus rien n'est parti pendant
  // une nuit. La garde du 02/10 exigeait justement la valeur relative, « la
  // même qu'avant » : elle a validé le défaut au lieu de l'empêcher.
  egal('🔴 le lien web part dans `web_url`, en adresse COMPLÈTE', avecLien?.web_url, 'https://www.yoppaa.app/commander?onglet=commandes')
  let adresseValide = false
  try { const u = new URL(avecLien?.web_url); adresseValide = u.protocol === 'https:' && u.host === 'www.yoppaa.app' } catch { /* reste faux */ }
  verifie('🔴 et cette adresse se lit seule, sans origine à deviner', adresseValide, avecLien?.web_url)
  verifie('🔴 et plus jamais dans `url`, qui partait aussi vers l’app',
    avecLien && !('url' in avecLien) && !('app_url' in avecLien))
  egal('🔴 l’app reçoit son chemin dans les données', avecLien?.data?.chemin, '/commander?onglet=commandes')
  egal('⚠️ sans écraser les données de l’appelant', avecLien?.data?.kind, 'commande')
  verifie('un envoi sans lien n’invente ni lien ni données',
    sansLien && !('web_url' in sansLien) && !('data' in sansLien))

  // 🔴 LE BANDEAU ANDROID (03/10, vu par Alex) : sans canal, OneSignal range
  // tout dans « Divers », qui ne fait surgir aucun bandeau. Les envois
  // personnels passent par le canal « Commandes et rendez-vous » (Urgent) ;
  // les annonces ciblées par filtres restent discrètes.
  egal('🔴 un envoi personnel passe par le canal qui affiche un bandeau',
    avecLien?.android_channel_id, CANAL_ANDROID_PERSONNEL)
  verifie('⚠️ et ce canal a la forme d’un identifiant OneSignal (un faux fait refuser le message entier)',
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(CANAL_ANDROID_PERSONNEL))
  verifie('⚠️ une annonce de quartier ou de favoris reste discrète', sansLien && !('android_channel_id' in sansLien))

  // ─── Et quelqu'un écoute, sur TOUTES les pages de l'app ───
  //
  // 🔴 `OneSignalInit` ne vit que sur l'accueil et l'onboarding : après un
  // chargement complet (retour de Stripe, lien d'email, CGU), l'écouteur avait
  // disparu avec la page. Le pont vit dans le gabarit racine.
  const gabarit = codeDe('app/layout.tsx')
  verifie('🔴 le pont natif est posé dans le gabarit racine', /<PontNatif \/>/.test(gabarit))
  const pont = codeDe('app/components/PontNatif.js')
  const iEffet = pont.indexOf('useEffect(')
  const iInit = pont.indexOf('initialiserPushNatif(window, APP_ID, null)')
  const iClic = pont.indexOf('brancherClicNatif(window,')
  verifie('🔴 il initialise AVANT d’écouter (Android refuse sinon)', iInit > 0 && iClic > iInit)
  verifie('⚠️ et il lit la fenêtre dans un effet, pas pendant le rendu', iEffet > 0 && iEffet < iInit)
  verifie('⚠️ une initialisation ratée n’essaie pas d’écouter', /if \(!init\.ok\) return/.test(pont))
  verifie('le toucher ouvre une page neuve', /window\.location\.assign\(chemin\)/.test(pont))
}

// ═══ 11) LA POSITION DANS L'APP PASSE PAR LE MODULE NATIF (02/10) ══════════
//
// 🔴 DANS L'APP, `navigator.geolocation` PASSE PAR WEBKIT, qui ajoute SA
// fenêtre « This website will use your precise location », en anglais, au nom
// du site. On passe par `@capacitor/geolocation` : une seule question, celle
// du système, au nom de Yoppaa.
//
// ⚠️ ET L'ANCIENNE APP N'A PAS LE MODULE : le site est servi aux deux binaires
// à la fois. Sans module, on retombe sur le navigateur.
{
  const attendre = (ms) => new Promise((r) => setTimeout(r, ms))
  // Un faux téléphone. `module` : ce que rend `getCurrentPosition` (une
  // promesse), ou rien pour l'ancienne app.
  const telephone = ({ module, droits = 'granted', droitsJettent = false } = {}) => {
    const journal = []
    const plugins = {}
    // ⚠️ COMME LE VRAI PONT : `PluginHeaders` n'est publié que par le natif,
    // et `isPluginAvailable` ne regarde que les noms posés dans `Plugins`.
    const entetes = []
    if (module) {
      entetes.push({ name: 'Geolocation', methods: [] })
      plugins.Geolocation = {
        getCurrentPosition: (opts) => { journal.push(['natif', JSON.stringify(opts)]); return module() },
        checkPermissions: async () => {
          if (droitsJettent) throw new Error('Location services are not enabled.')
          return { location: droits, coarseLocation: droits }
        },
      }
    }
    return {
      journal,
      fenetre: {
        Capacitor: {
          isNativePlatform: () => true,
          isPluginAvailable: (nom) => Object.prototype.hasOwnProperty.call(plugins, nom),
          Plugins: plugins,
          PluginHeaders: entetes,
        },
        navigator: { geolocation: { getCurrentPosition: (s, e, o) => journal.push(['web', JSON.stringify(o)]) } },
      },
    }
  }
  const lire = (fenetre, options, reglages) => new Promise((resoudre) => {
    const reponses = []
    lirePosition(fenetre,
      (p) => reponses.push(['ok', p]),
      (e) => reponses.push(['ko', e]),
      options, reglages)
    setTimeout(() => resoudre(reponses), 60)
  })

  // ─── Le bon chemin pour chaque binaire ───
  const neuf = telephone({ module: async () => ({ coords: { latitude: 50.32, longitude: 4.65, accuracy: 12 }, timestamp: 1 }) })
  const r1 = await lire(neuf.fenetre, { timeout: 10000, enableHighAccuracy: true })
  verifie('🔴 la nouvelle app passe par le module natif, pas par WebKit',
    neuf.journal.length === 1 && neuf.journal[0][0] === 'natif', JSON.stringify(neuf.journal))
  verifie('🔴 et l’écran reçoit la position, comme du navigateur',
    r1.length === 1 && r1[0][0] === 'ok' && r1[0][1].coords.latitude === 50.32 && r1[0][1].coords.longitude === 4.65)
  verifie('⚠️ les options de l’écran sont transmises au module',
    /"enableHighAccuracy":true/.test(neuf.journal[0][1]) && /"timeout":10000/.test(neuf.journal[0][1]))

  const ancienne = telephone({ module: null })
  await lire(ancienne.fenetre, { timeout: 15000 })
  verifie('🔴 l’ancienne app, sans le module, retombe sur le navigateur',
    ancienne.journal.length === 1 && ancienne.journal[0][0] === 'web')
  verifie('⚠️ l’ancienne app n’a pas de module natif', geolocNative(ancienne.fenetre) === null)
  // ⚠️ ET UN OBJET PRÉSENT N'EST PAS UN MODULE PRÉSENT. Si un jour le site
  // importe `@capacitor/geolocation`, `Plugins.Geolocation` existera aussi dans
  // l'ancienne app, sous forme d'un relais web : c'est Capacitor qui dit si le
  // module NATIF est là.
  const relais = telephone({ module: null })
  relais.fenetre.Capacitor.Plugins.Geolocation = { getCurrentPosition: async () => ({}) }
  verifie('⚠️ un relais web dans l’ancienne app n’est pas pris pour le module',
    geolocNative(relais.fenetre) === null)

  const navigateur = { navigator: { geolocation: { getCurrentPosition: (s, e, o) => navigateur.vu.push(JSON.stringify(o)) } }, vu: [] }
  lirePosition(navigateur, () => {}, () => {}, { timeout: 10000, enableHighAccuracy: false })
  egal('⚠️ dans un navigateur, l’appel part tel quel, avec ses options',
    navigateur.vu.join(), '{"timeout":10000,"enableHighAccuracy":false}')
  verifie('un `Capacitor` web n’est pas l’app',
    geolocNative({ Capacitor: { isNativePlatform: () => false, PluginHeaders: [{ name: 'Geolocation' }], Plugins: { Geolocation: { getCurrentPosition() {} } } } }) === null)
  verifie('⚠️ un accès qui jette n’est pas un module',
    geolocNative({ get Capacitor() { throw new Error('x') } }) === null)

  // ─── Disponible ? ───
  verifie('dans la nouvelle app, la position est disponible', positionDisponible(neuf.fenetre) === true)
  verifie('dans un navigateur avec géolocalisation aussi', positionDisponible(navigateur) === true)
  verifie('⚠️ sans aucune des deux, non', positionDisponible({ navigator: {} }) === false && positionDisponible(undefined) === false)
  const sans = []
  lirePosition({ navigator: {} }, () => sans.push('ok'), (e) => sans.push(e.code))
  egal('⚠️ et lire sans moyen répond « indisponible », sans jeter', sans.join(), '2')

  // ─── Les échecs, ramenés aux codes que les écrans connaissent ───
  const refus = telephone({ module: async () => { const e = new Error('Location permission request was denied.'); e.code = 'OS-PLUG-GLOC-0003'; throw e } })
  const r2 = await lire(refus.fenetre, { timeout: 10000 })
  verifie('🔴 un refus du système arrive en échec « refusé » (1)', r2.length === 1 && r2[0][0] === 'ko' && r2[0][1].code === 1)
  egal('le délai du module devient « délai » (3)', codeErreurPosition({ code: 'OS-PLUG-GLOC-0010' }), 3)
  egal('une restriction (contrôle parental) est un refus', codeErreurPosition({ code: 'OS-PLUG-GLOC-0008' }), 1)
  egal('le reste est « indisponible » (2)', codeErreurPosition({ code: 'OS-PLUG-GLOC-0002' }), 2)

  // 🔴 `Number(null)` VAUT 0 : une position sans chiffres situerait le Yopper
  // dans le golfe de Guinée, à 5 000 km de chaque commerce.
  const vide = telephone({ module: async () => ({ coords: { latitude: null, longitude: null } }) })
  const r3 = await lire(vide.fenetre, { timeout: 10000 })
  verifie('🔴 une position sans chiffres est un échec, pas (0, 0)',
    r3.length === 1 && r3[0][0] === 'ko' && r3[0][1].code === 2, JSON.stringify(r3))

  // ─── UNE réponse, toujours, et une seule ───
  //
  // 🔴 LES POINTS DE L'ONBOARDING NE S'ARRÊTENT QU'À LA RÉPONSE : un module muet
  // (fenêtre du système laissée ouverte) les ferait tourner à vie.
  const muet = telephone({ module: () => new Promise(() => {}) })
  const r4 = await lire(muet.fenetre, { timeout: 5 }, { marge: 5 })
  verifie('🔴 un module muet rend la main par un échec « délai »',
    r4.length === 1 && r4[0][0] === 'ko' && r4[0][1].code === 3, JSON.stringify(r4))
  let tardif = null
  const lent = telephone({ module: () => new Promise((r) => { tardif = r }) })
  const r5 = lire(lent.fenetre, { timeout: 5 }, { marge: 5 })
  await attendre(40)
  tardif({ coords: { latitude: 50, longitude: 4 } })
  const rep5 = await r5
  verifie('⚠️ une réponse arrivée APRÈS le filet est ignorée : l’écran a déjà repris la main',
    rep5.length === 1 && rep5[0][0] === 'ko', JSON.stringify(rep5))
  const rapide = telephone({ module: async () => ({ coords: { latitude: 50, longitude: 4 } }) })
  const r6 = await lire(rapide.fenetre, { timeout: 5 }, { marge: 5 })
  await attendre(30)
  verifie('⚠️ une réponse à temps éteint le filet : pas de second appel',
    r6.length === 1 && r6[0][0] === 'ok', JSON.stringify(r6))

  // ─── L'état de l'autorisation, que WebKit ne disait jamais ───
  egal('🔴 dans l’app, l’état vient du module', await etatAutorisation(telephone({ module: async () => ({}), droits: 'denied' }).fenetre), 'denied')
  egal('⚠️ « prompt-with-rationale » (Android) est une question qu’on peut poser',
    await etatAutorisation(telephone({ module: async () => ({}), droits: 'prompt-with-rationale' }).fenetre), 'prompt')
  verifie('⚠️ services coupés : « on ne sait pas », pas « refusé »',
    (await etatAutorisation(telephone({ module: async () => ({}), droitsJettent: true }).fenetre)) === null)

  // ─── LA RÈGLE : plus aucun écran n'appelle WebKit directement ───
  //
  // ⚠️ ON VISE L'APPEL, PAS LE MOT : `lib/geoloc.js` porte forcément le seul
  // appel au navigateur, c'est sa raison d'être.
  const fichiersApp = ['app', 'lib'].flatMap((dossier) =>
    readdirSync(new URL(`../${dossier}/`, import.meta.url), { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.js'))
      .map((f) => `${dossier}/${f.split('\\').join('/')}`))
  const directs = fichiersApp
    .filter((f) => f !== 'lib/geoloc.js')
    .filter((f) => /\.geolocation\??\.getCurrentPosition\(|\.geolocation\??\.watchPosition\(/.test(codeDe(f)))
  verifie('🔴 aucun écran n’appelle la position du navigateur en direct', directs.length === 0, directs.join(', '))
  const appelants = fichiersApp.filter((f) => /\blirePosition\(window,/.test(codeDe(f)))
  verifie('⚠️ les trois écrans passent par `lirePosition`', appelants.length === 3, appelants.join(', '))
}

// ═══ 12) REVENIR DANS L'APP APRÈS LA BANQUE (02/10) ════════════════════════
//
// 🔴 LE DÉFAUT QU'ALEX A VU. Bancontact dans l'app : la page de la banque est
// sur un autre domaine, Capacitor l'envoie dans Safari, et Stripe ramène le
// Yopper sur notre confirmation… dans Safari. L'app reste figée sur Stripe.
// ⚠️ ON NE RETIRE PAS BANCONTACT (Alex, 02/10) : on répare le RETOUR.
{
  const base = 'https://www.yoppaa.app'
  const uaIphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'

  // ─── La marque : posée par l'app, lue par le serveur, LA MÊME ───
  const conf = codeDe('capacitor.config.ts')
  const marque = conf.match(/appendUserAgent: '([^']+)'/)?.[1]
  egal('🔴 l’app ajoute sa marque au user-agent, celle que le serveur cherche', marque, MARQUE_APP)
  verifie('🔴 la WebView de la nouvelle app est reconnue', estUaApp(`${uaIphone} ${marque}`) === true)
  verifie('🔴 Safari, lui, n’est pas l’app', estUaApp(uaIphone) === false)
  verifie('⚠️ un mot qui CONTIENT la marque n’est pas la marque',
    estUaApp(`${uaIphone} PasYoppaaAppDuTout`) === false && estUaApp(null) === false)

  // ─── L'adresse donnée à Stripe ───
  const cheminOk = '/commander/mozz-art?paiement=ok&commande_id=c1&session_id={CHECKOUT_SESSION_ID}'
  egal('🔴 partie de l’app, la commande revient par /retour-app',
    urlDeRetour(base, cheminOk, true), `${base}/retour-app${cheminOk}`)
  egal('⚠️ partie d’un navigateur, rien ne change', urlDeRetour(base, cheminOk, false), `${base}${cheminOk}`)
  verifie('🔴 `{CHECKOUT_SESSION_ID}` reste écrit tel quel, sinon Stripe ne le remplace pas',
    urlDeRetour(base, cheminOk, true).includes('{CHECKOUT_SESSION_ID}'))

  // ─── La page reconstruit l'adresse d'origine, et rien d'autre ───
  egal('🔴 la page d’origine est reconstruite avec ses paramètres',
    cheminDepuisRetour(['commander', 'mozz-art'], { paiement: 'ok', commande_id: 'c1', session_id: 'cs_live_1' }),
    '/commander/mozz-art?paiement=ok&commande_id=c1&session_id=cs_live_1')
  egal('⚠️ un segment déjà codé n’est pas codé deux fois',
    cheminDepuisRetour(['commander', 'mozz%27art'], {}), "/commander/mozz'art")
  for (const [nom, segments] of [
    ['une remontée « .. »', ['..', 'admin']],
    ['une barre cachée dans un segment', ['commander', 'a%2F%2Fexemple.com']],
    ['un segment vide', ['commander', '']],
    ['un codage cassé', ['commander', '%E0%A4%A']],
    ['aucun segment', []],
  ]) {
    verifie(`🔴 ${nom} ne fabrique aucune adresse`, cheminDepuisRetour(segments, {}) === null, JSON.stringify(segments))
  }
  egal('un paramètre répété garde ses valeurs', cheminDepuisRetour(['commander'], { a: ['1', '2'] }), '/commander?a=1&a=2')

  // ─── Le lien qui rouvre l'app ───
  egal('🔴 le lien rouvre l’app SUR la même page',
    lienVersApp('/commander/mozz-art?paiement=ok'), 'yoppaa://www.yoppaa.app/commander/mozz-art?paiement=ok')
  verifie('🔴 et ne fabrique jamais un lien vers un autre site', lienVersApp('//exemple.com') === null && lienVersApp('https://exemple.com') === null)

  // ─── Ce que dit la page, pour les cinq tunnels ───
  egal('commande payée', etatRetour({ paiement: 'ok' }), 'ok')
  egal('abonnement annulé', etatRetour({ abonnement: 'annule' }), 'annule')
  egal('bon payé', etatRetour({ bon: 'ok' }), 'ok')
  egal('empreinte enregistrée', etatRetour({ empreinte: 'ok' }), 'ok')
  egal('lien d’empreinte annulé', etatRetour({ etat: 'annule' }), 'annule')
  verifie('sans résultat, on ne prétend rien', etatRetour({}) === null && etatRetour(undefined) === null)

  // ─── LA RÈGLE : toute session Stripe d'un Yopper passe par urlDeRetour ───
  //
  // ⚠️ ON PART DES ROUTES, PAS D'UNE LISTE : une huitième route de paiement
  // Yopper écrite demain sans `urlDeRetour` rougira ici. Celles du tableau de
  // bord reviennent sur `/dashboard`, que l'app n'ouvre jamais.
  const routes = readdirSync(new URL('../app/api/', import.meta.url), { recursive: true })
    .filter((f) => typeof f === 'string' && f.endsWith('route.js'))
    .map((f) => `app/api/${f.split('\\').join('/')}`)
  const yopper = routes.filter((f) => {
    const src = codeDe(f)
    return /(success_url|cancel_url):/.test(src) && !/(success_url|cancel_url):\s*`\$\{[^}]+\}\/dashboard/.test(src)
  })
  verifie('⚠️ les routes de paiement Yopper sont bien trouvées (sinon la règle ne regarde rien)',
    yopper.length === 7, `${yopper.length} : ${yopper.join(', ')}`)
  for (const f of yopper) {
    const src = codeDe(f)
    const lignes = src.split('\n').filter((l) => /^\s*(success_url|cancel_url):/.test(l))
    const directs = lignes.filter((l) => !/urlDeRetour\(/.test(l))
    verifie(`🔴 ${f} : chaque retour de Stripe passe par urlDeRetour`,
      lignes.length === 2 && directs.length === 0, directs.join(' | ') || `${lignes.length} ligne(s)`)
    verifie(`🔴 ${f} : et il lui dit si la requête vient de l’app`,
      /const depuisApp = estUaApp\(request\.headers\.get\('user-agent'\)\)/.test(src)
      && lignes.every((l) => /, depuisApp\),\s*$/.test(l)))
  }

  // ─── La page de retour ───
  const page = codeDe('app/retour-app/[...chemin]/page.js')
  const iCible = page.indexOf('const cible = cheminDepuisRetour(chemin, recherche)')
  const iApp = page.indexOf('if (estUaApp(ua)) redirect(cible)')
  const iRendu = page.indexOf('return (')
  verifie('🔴 dans l’app, la page renvoie aussitôt vers la page habituelle',
    iCible > 0 && iApp > iCible && iRendu > iApp)
  verifie('⚠️ une adresse invalide retombe sur l’accueil', /if \(!cible\) redirect\('\/commander'\)/.test(page))
  verifie('🔴 dans le navigateur, le bouton rouvre l’app sur la même page',
    /const lien = lienVersApp\(cible\)/.test(page) && /<a href=\{lien\}/.test(page))
  verifie('⚠️ et la sortie de secours reste dans le navigateur', /<a href=\{cible\}/.test(page))
  verifie('⚠️ `redirect` jette : jamais dans un `try`', !/try\s*\{[\s\S]*redirect\(/.test(page))
}

// ═══ 13) LE NATIF : NOTIFICATIONS iOS, LIENS, BOUTON RETOUR (02/10) ════════
//
// 🔴 TROIS MANQUES DU PREMIER BINAIRE, TOUS SILENCIEUX :
//   • iOS sans `aps-environment` : Apple ne remet AUCUNE notification à l'app ;
//   • aucun schéma `yoppaa://`, aucun lien universel : le bouton « Revenir dans
//     Yoppaa » et les liens d'email ne pouvaient pas ouvrir l'app ;
//   • Android sans gestion du retour : le bouton fermait l'app depuis
//     n'importe quelle page.
{
  const sansXml = (t) => t.replace(/<!--[\s\S]*?-->/g, '')
  const HOTE_ATTENDU = 'www.yoppaa.app'
  // ⚠️ L'HÔTE DES TROIS CÔTÉS EST LE MÊME : le site fabrique le lien, iOS et
  // Android le vérifient. Une seule lettre de différence, et le bouton ne
  // mène plus nulle part, sans erreur.
  egal('le site fabrique ses liens vers www.yoppaa.app',
    lienVersApp('/commander')?.replace(/^yoppaa:\/\//, '').split('/')[0], HOTE_ATTENDU)

  // ─── iOS ───
  verifie('🔴 iOS : le fichier d’autorisations existe', existe('ios/App/App/App.entitlements'))
  const droits = existe('ios/App/App/App.entitlements') ? lire('ios/App/App/App.entitlements') : ''
  verifie('🔴 iOS : les notifications sont autorisées, en production',
    /<key>aps-environment<\/key>\s*<string>production<\/string>/.test(droits))
  verifie('🔴 iOS : les liens universels visent www.yoppaa.app',
    /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>\s*<string>applinks:www\.yoppaa\.app<\/string>/.test(droits))
  const pbx = lire('ios/App/App.xcodeproj/project.pbxproj')
  egal('🔴 iOS : le projet signe AVEC ces autorisations, en Debug et en Release',
    (pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2)
  const plist = sansXml(lire('ios/App/App/Info.plist'))
  verifie('🔴 iOS : le schéma yoppaa:// est déclaré',
    /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>yoppaa<\/string>/.test(plist))
  verifie('⚠️ iOS : l’app peut être réveillée par une notification',
    /<key>UIBackgroundModes<\/key>\s*<array>[\s\S]*?<string>remote-notification<\/string>[\s\S]*?<\/array>/.test(plist))
  verifie('⚠️ iOS : OneSignal n’ouvre plus d’adresse tout seul',
    /<key>OneSignal_suppress_launch_urls<\/key>\s*<true\/>/.test(plist))

  const scene = lire('ios/App/App/SceneDelegate.swift')
  // ⚠️ LES TROIS PORTES D'ENTRÉE : lancement à froid, `yoppaa://`, lien
  // universel. En oublier une, c'est un cas qui ouvre l'accueil au lieu de la
  // page, sans que rien ne rougisse ailleurs.
  verifie('🔴 iOS : le lancement à froid par un lien ouvre la page',
    /connectionOptions\.urlContexts\.first\?\.url \{\s*ouvrirDansLApp\(url\)/.test(scene)
    && /connectionOptions\.userActivities\.first\(where: \{ \$0\.activityType == NSUserActivityTypeBrowsingWeb \}\)/.test(scene))
  verifie('🔴 iOS : le lien yoppaa:// ouvre la page',
    /openURLContexts URLContexts[\s\S]{0,200}if let url = URLContexts\.first\?\.url \{\s*ouvrirDansLApp\(url\)/.test(scene))
  verifie('🔴 iOS : le lien universel ouvre la page',
    /continue userActivity[\s\S]{0,250}userActivity\.webpageURL \{\s*ouvrirDansLApp\(url\)/.test(scene))
  verifie('⚠️ iOS : les relais Capacitor sont toujours appelés',
    (scene.match(/SceneDelegateProxy\.shared\.scene\(/g) || []).length === 3)
  verifie('🔴 iOS : seul www.yoppaa.app s’ouvre, en yoppaa:// ou https',
    new RegExp(`static let hote = "${HOTE_ATTENDU.replace(/\./g, '\\.')}"`).test(scene)
    && /guard morceaux\.host\?\.lowercased\(\) == hote else \{ return nil \}/.test(scene)
    && /schema == "yoppaa" \|\| schema == "https" else \{ return nil \}/.test(scene)
    && /morceaux\.scheme = "https"/.test(scene))
  verifie('⚠️ iOS : ni identifiant ni port dans un lien ouvert',
    /guard morceaux\.user == nil, morceaux\.password == nil, morceaux\.port == nil else \{ return nil \}/.test(scene))
  verifie('🔴 iOS : la page se charge dans la vue de l’app, quelle que soit la page affichée',
    /guard let cible = LienYoppaa\.cible\(url\) else \{ return \}/.test(scene)
    && /_ = vue\.load\(URLRequest\(url: cible\)\)/.test(scene))

  // ─── Android ───
  const manif = sansXml(lire('android/app/src/main/AndroidManifest.xml'))
  verifie('🔴 Android : le schéma yoppaa:// est déclaré, sur www.yoppaa.app seulement',
    /<data android:scheme="yoppaa" android:host="www\.yoppaa\.app" \/>/.test(manif))
  const filtreLiens = manif.match(/<intent-filter android:autoVerify="true">[\s\S]*?<\/intent-filter>/)?.[0] || ''
  verifie('🔴 Android : les liens d’app sont vérifiés (autoVerify) sur www.yoppaa.app',
    /<data android:scheme="https" android:host="www\.yoppaa\.app" \/>/.test(filtreLiens))
  // ⚠️ LA LISTE EXACTE. Le tableau de bord commerçant reste une PWA : un
  // `/dashboard` ici l'ouvrirait dans l'app des Yoppers.
  const prefixes = [...filtreLiens.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => m[1]).sort()
  egal('🔴 Android : les pages Yopper, et elles seules, s’ouvrent dans l’app',
    prefixes.join(' '), ['/cadeau/', '/carte/', '/commander', '/empreinte/', '/retour-app/'].sort().join(' '))
  verifie('⚠️ Android : OneSignal n’ouvre plus d’adresse tout seul',
    /<meta-data android:name="com\.onesignal\.suppressLaunchURLs" android:value="true" \/>/.test(manif))

  const activite = lire('android/app/src/main/java/app/yoppaa/client/MainActivity.java')
  verifie('🔴 Android : un lien reçu app ouverte est ouvert dans la vue',
    /protected void onNewIntent\(Intent intent\) \{\s*super\.onNewIntent\(intent\);[\s\S]{0,200}ouvrirDansLApp\(intent\);/.test(activite))
  verifie('🔴 Android : seul www.yoppaa.app s’ouvre, en yoppaa:// ou https',
    new RegExp(`static final String HOTE = "${HOTE_ATTENDU.replace(/\./g, '\\.')}"`).test(activite)
    && /if \(!HOTE\.equalsIgnoreCase\(hote\)\) return null;/.test(activite)
    && /if \(!"yoppaa"\.equalsIgnoreCase\(schema\) && !"https"\.equalsIgnoreCase\(schema\)\) return null;/.test(activite)
    && /\.scheme\("https"\)\s*\.encodedAuthority\(HOTE\)/.test(activite))
  verifie('⚠️ Android : ni identifiant ni port dans un lien ouvert',
    /if \(lien\.getPort\(\) != -1 \|\| lien\.getUserInfo\(\) != null\) return null;/.test(activite))
  // 🔴 UN LIEN DE CONNEXION NE SERT QU'UNE FOIS. Android redonne la vieille
  // intention quand il recrée l'activité ou la relance depuis les récentes :
  // la rouvrir afficherait « lien invalide » à quelqu'un de connecté.
  verifie('🔴 Android : une activité recréée ne rejoue pas son lien',
    /restauree = savedInstanceState != null;\s*super\.onCreate\(savedInstanceState\);/.test(activite)
    && /if \(lancement && restauree\) return;/.test(activite))
  verifie('🔴 Android : une relance depuis les récentes ne rejoue pas son lien',
    /FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY\) != 0\) return;/.test(activite))
  verifie('🔴 Android : le bouton retour remonte dans l’app avant d’en sortir',
    /if \(vue != null && vue\.canGoBack\(\)\) \{\s*vue\.goBack\(\);\s*\} else \{\s*moveTaskToBack\(true\);/.test(activite))

  // ─── Le module de position est bien DANS les deux projets ───
  //
  // ⚠️ LE WORKFLOW RESYNCHRONISE, MAIS LE DÉPÔT DOIT DÉJÀ ÊTRE JUSTE : un
  // projet ouvert sur un Mac sans `cap sync` partirait sans le module, et le
  // site retomberait en silence sur la fenêtre WebKit.
  const pkg = JSON.parse(lire('package.json'))
  verifie('🔴 le module de position est une dépendance', !!pkg.dependencies?.['@capacitor/geolocation'])
  verifie('🔴 iOS l’embarque', /\.product\(name: "CapacitorGeolocation", package: "CapacitorGeolocation"\)/.test(lire('ios/App/CapApp-SPM/Package.swift')))
  verifie('🔴 Android l’embarque', /implementation project\(':capacitor-geolocation'\)/.test(lire('android/app/capacitor.build.gradle')))

  // ─── Le paquet iOS relit ce qu'il a signé ───
  const ios = lire('.github/workflows/paquet-ios.yml')
  const lignesIos = ios.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n')
  verifie('🔴 le paquet iOS échoue s’il ne porte pas les notifications',
    /codesign -d --entitlements - "\$APP"/.test(lignesIos) && /grep -q "aps-environment" droits\.txt/.test(lignesIos))
  verifie('🔴 et s’il ne porte pas les liens universels', /grep -q "applinks:www\.yoppaa\.app" droits\.txt/.test(lignesIos))
}

// ═══ 14) LES FICHIERS DES LIENS UNIVERSELS ET DES LIENS D'APP (02/10) ══════
//
// 🔴 SANS EUX, LES AUTORISATIONS DU BINAIRE NE SERVENT À RIEN. iOS et Android
// ne font ouvrir l'app par un lien www.yoppaa.app que si le SITE confirme,
// par ces deux fichiers, que l'app est bien la sienne. Un fichier absent, mal
// servi ou qui nomme un autre identifiant : les liens d'email continuent de
// s'ouvrir dans le navigateur, et rien ne le dit.
//
// ⚠️ LE TEAM ID EST ÉCRIT ICI, ET C'EST INÉVITABLE : ce fichier est public par
// nature, Apple va le lire sur le site. La règle du workflow (jamais de Team ID
// en dur) protège la SIGNATURE, pas ce fichier.
{
  const aasaBrut = existe('public/.well-known/apple-app-site-association')
    ? lire('public/.well-known/apple-app-site-association') : ''
  let aasa = null
  try { aasa = JSON.parse(aasaBrut) } catch { /* rougit ci-dessous */ }
  verifie('🔴 le fichier Apple existe et se lit en JSON', aasa !== null)
  const details = aasa?.applinks?.details || []
  egal('⚠️ une seule app est déclarée', details.length, 1)
  const appId = details[0]?.appIDs?.[0] || ''
  verifie('🔴 il nomme NOTRE app : Team ID de 10 caractères, puis app.yoppaa.client',
    /^[A-Z0-9]{10}\.app\.yoppaa\.client$/.test(appId) && details[0]?.appIDs?.length === 1, appId)
  // ⚠️ LA MÊME LISTE QUE LE MANIFESTE ANDROID : une page qui s'ouvre dans l'app
  // sur un téléphone et dans le navigateur sur l'autre serait un défaut qu'on
  // ne verrait qu'en testant les deux.
  const chemins = (details[0]?.components || []).map((c) => c['/']).sort()
  const manif = lire('android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '')
  const filtre = manif.match(/<intent-filter android:autoVerify="true">[\s\S]*?<\/intent-filter>/)?.[0] || ''
  const prefixes = [...filtre.matchAll(/android:pathPrefix="([^"]+)"/g)].map((m) => `${m[1]}*`).sort()
  egal('🔴 iPhone et Android ouvrent EXACTEMENT les mêmes pages dans l’app', chemins.join(' '), prefixes.join(' '))
  verifie('🔴 et jamais le tableau de bord commerçant, qui reste une PWA',
    !chemins.some((c) => /dashboard|admin|login|signup|equipe|pro/.test(c)), chemins.join(' '))
  verifie('⚠️ aucune règle d’exclusion ne traîne (rien n’est ouvert hors de la liste)',
    !(details[0]?.components || []).some((c) => c.exclude))

  // 🔴 SERVI EN JSON, SINON APPLE L'IGNORE : le fichier n'a pas d'extension.
  const nextConf = codeDe('next.config.ts')
  verifie('🔴 le fichier Apple est servi en application/json',
    /source: "\/\.well-known\/apple-app-site-association",\s*headers: \[\{ key: "Content-Type", value: "application\/json" \}\]/.test(nextConf))

  // ─── Android ───
  const alBrut = existe('public/.well-known/assetlinks.json') ? lire('public/.well-known/assetlinks.json') : ''
  let al = null
  try { al = JSON.parse(alBrut) } catch { /* rougit ci-dessous */ }
  verifie('🔴 le fichier Android existe et se lit en JSON', Array.isArray(al) && al.length === 1)
  const cible = al?.[0]?.target || {}
  verifie('🔴 il nomme NOTRE app', cible.namespace === 'android_app' && cible.package_name === 'app.yoppaa.client')
  verifie('🔴 il autorise l’app à ouvrir les liens',
    (al?.[0]?.relation || []).includes('delegate_permission/common.handle_all_urls'))
  const empreintes = cible.sha256_cert_fingerprints || []
  // ⚠️ L'EMPREINTE DE LA CLÉ DE SIGNATURE PLAY, 32 octets : une empreinte
  // tronquée ou celle d'un autre format, et Android refuse la vérification.
  verifie('🔴 l’empreinte a la forme d’un SHA-256 complet',
    empreintes.length === 1 && /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(empreintes[0]), empreintes.join(', '))
}

console.log(`\nPush natif et enveloppe : ${ok} vérifications`)
if (echecs.length) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
