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

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  estAppNative, pluginNatif, initialiserPushNatif, demanderPushNatif,
  etatPushNatif, taguerNatif, retirerTagNatif,
} from '../lib/push-natif.js'

const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const codeDe = (chemin) => sansProse(lire(chemin))

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
}

console.log(`\nPush natif et enveloppe : ${ok} vérifications`)
if (echecs.length) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
