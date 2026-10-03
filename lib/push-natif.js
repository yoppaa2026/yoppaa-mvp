// LES NOTIFICATIONS QUAND YOPPAA TOURNE DANS L'APPLICATION NATIVE.
//
// 🔴 LE PIÈGE QUI A MOTIVÉ CE MODULE (16/09). Le plugin OneSignal natif
// s'expose sous `window.OneSignal` — EXACTEMENT le même nom que le SDK web
// (`<clobbers target="OneSignal" />` dans son `plugin.xml`). Dans
// l'application, le code existant aurait donc cru parler au SDK web alors qu'il
// parlait au plugin natif, avec des méthodes qui ne se recouvrent pas :
//
//   • web    : `OneSignal.init({ appId })`   · `Notifications.permission`
//   • natif  : `OneSignal.initialize(appId)` · `Notifications.hasPermission()`
//
// Résultat : aucune erreur visible, aucune exception, et simplement personne
// n'aurait jamais reçu une notification dans l'app publiée sur les stores.
//
// ⚠️ LES SIGNATURES CI-DESSOUS SONT LUES DANS LES TYPES INSTALLÉS
// (`node_modules/onesignal-cordova-plugin/dist/index.d.ts`, v5.5.7), jamais
// écrites de mémoire. Une API écrite de mémoire ne vérifie que ma mémoire, et
// ça s'est déjà payé deux fois ce mois-ci sur les appels Stripe.
//
// ⚠️ ET ON NE CHARGE PAS LE SDK WEB DANS L'APP. Les deux se disputeraient le
// même global et le même abonnement.
//
// Fichier PUR : on lui passe la fenêtre, il ne va la chercher nulle part. Il
// s'exécute donc au banc, sans navigateur et sans téléphone.

import { cheminInterne } from './chemin-interne.js'

const ORIGINE_APP = 'https://www.yoppaa.app'

// Vrai seulement dans l'application installée depuis un store, jamais dans un
// navigateur ni dans la PWA.
export function estAppNative(fenetre) {
  try {
    return fenetre?.Capacitor?.isNativePlatform?.() === true
  } catch {
    // ⚠️ UN ACCÈS QUI JETTE N'EST PAS UNE APPLICATION NATIVE. Dans le doute on
    // reste sur le chemin web, qui fonctionne partout.
    return false
  }
}

// Le plugin natif, ou `null` si l'on n'est pas dans l'app.
//
// ⚠️ ON NE REND JAMAIS `window.OneSignal` SANS AVOIR VÉRIFIÉ LA PLATEFORME :
// hors de l'app, ce même nom désigne le SDK web, dont les méthodes diffèrent.
//
// 🔴 LE DÉFAUT DU 03/10, TROUVÉ PAR ALEX SUR LE BUILD 1.0.1 (3) : « L'activation
// n'a pas abouti », à l'onboarding comme dans le profil. Cette fonction
// cherchait `window.OneSignal.initialize`. Or la version 5.5.7 du plugin est un
// MODULE : Cordova pose sous `window.OneSignal` l'objet de ses exports
// (`{ default, LogLevel, OneSignalPlugin, … }`), et l'instance utile vit dans
// `window.OneSignal.default`. Le plugin la pose aussi lui-même sous
// `window.plugins.OneSignal`. Résultat : `null`, donc « pas natif », donc
// AUCUNE notification native n'a jamais pu fonctionner, dans aucun build, sans
// une erreur visible. Le banc ne pouvait pas le voir : il fabriquait un
// `window.OneSignal` à la forme qu'on CROYAIT, au lieu de charger le vrai
// fichier du plugin. Il le charge maintenant.
//
// ⚠️ LES TROIS FORMES, DANS CET ORDRE : celle que le plugin pose lui-même
// (`plugins`, qu'aucun SDK web n'utilise), celle du module (`default`), puis
// l'ancienne forme directe, au cas où une version future reviendrait en
// arrière.
export function pluginNatif(fenetre) {
  if (!estAppNative(fenetre)) return null
  try {
    const candidats = [fenetre?.plugins?.OneSignal, fenetre?.OneSignal?.default, fenetre?.OneSignal]
    // ⚠️ `initialize` EST LA SIGNATURE DU NATIF. Sa présence distingue le
    // plugin du SDK web, qui n'expose que `init`. Deux SDK, un seul nom : on
    // vérifie ce que l'objet SAIT FAIRE, pas comment il s'appelle.
    return candidats.find((os) => typeof os?.initialize === 'function') || null
  } catch {
    return null
  }
}

// Rend `{ ok, raison }`. Jamais d'exception : une notification qui ne part pas
// ne doit pas emporter l'écran avec elle.
export function initialiserPushNatif(fenetre, appId, externalId) {
  const os = pluginNatif(fenetre)
  if (!os) return { ok: false, raison: 'pas_natif' }
  if (!appId) return { ok: false, raison: 'app_id_absent' }
  try {
    os.initialize(appId)
    // ⚠️ L'IDENTITÉ EST FACULTATIVE ET NE DOIT PAS BLOQUER L'INITIALISATION :
    // un visiteur non connecté doit pouvoir recevoir les notifications de sa
    // commune avant même d'avoir un compte.
    if (externalId) os.login(String(externalId))
    return { ok: true, raison: null }
  } catch (e) {
    return { ok: false, raison: e?.message || 'init_ko' }
  }
}

// Demande la permission système. `fallbackToSettings` ouvre les réglages du
// téléphone quand l'utilisateur a déjà refusé une fois : sans cela, un refus
// initial est définitif et le bouton ne fait plus rien, à vie.
export async function demanderPushNatif(fenetre) {
  const os = pluginNatif(fenetre)
  if (!os) return { ok: false, raison: 'pas_natif' }
  try {
    if (os.Notifications?.hasPermission?.() === true) return { ok: true, raison: 'deja_accorde' }
    const accorde = await os.Notifications.requestPermission(true)
    return accorde === true ? { ok: true, raison: null } : { ok: false, raison: 'refuse_os' }
  } catch (e) {
    return { ok: false, raison: e?.message || 'prompt_ko' }
  }
}

// L'état, pour l'écran de réglages du Yopper.
export function etatPushNatif(fenetre) {
  const os = pluginNatif(fenetre)
  if (!os) return null
  try {
    return { natif: true, autorise: os.Notifications?.hasPermission?.() === true }
  } catch {
    return { natif: true, autorise: false }
  }
}

// Les étiquettes (commune, favoris) suivent le même chemin que sur le web.
// ⚠️ `addTags` NE REND RIEN (`: void` dans les types installés) : l'attendre
// serait attendre une promesse qui n'existe pas.
export function taguerNatif(fenetre, tags) {
  const os = pluginNatif(fenetre)
  if (!os || !tags || typeof tags !== 'object') return false
  try {
    os.User.addTags(tags)
    return true
  } catch {
    return false
  }
}

export function retirerTagNatif(fenetre, cle) {
  const os = pluginNatif(fenetre)
  if (!os || !cle) return false
  try {
    os.User.removeTag(String(cle))
    return true
  } catch {
    return false
  }
}

// ─── TOUCHER UNE NOTIFICATION OUVRE LA BONNE PAGE (02/10) ───────────────────
//
// 🔴 LE RELEVÉ DU 02/10. Le serveur envoyait `url: '/commander?onglet=…'`, un
// chemin RELATIF. Sur le web, le service worker le complète avec son origine ;
// dans l'app native, OneSignal tente d'ouvrir ce chemin tel quel, dans un
// navigateur, et il ne mène nulle part. Et personne n'écoutait le toucher :
// la notification « ta commande est prête » ouvrait l'app sur la dernière page
// vue, pas sur la commande.
//
// ✅ LE CHEMIN VOYAGE DANS LES DONNÉES (`data.chemin`), le lien web dans
// `web_url` (web seulement), et c'est l'app qui navigue, dans sa propre
// WebView, au toucher.

// Le chemin interne à ouvrir pour une adresse de notification, ou `null`.
// Accepte un chemin (« /commander ») ou une adresse complète de yoppaa.app,
// celle qu'on écrirait à la main dans le tableau de bord OneSignal.
//
// ⚠️ RIEN D'AUTRE NE PASSE, et ce n'est pas du zèle : ce chemin va être ouvert
// dans l'app sans que personne le relise. Même règle que le `?next=` de la
// connexion (`lib/chemin-interne.js`) : « //site », « /\site », « javascript: »
// et les caractères de contrôle retombent sur « rien ».
export function cheminDeNotification(adresse) {
  if (typeof adresse !== 'string') return null
  const s = adresse.startsWith(ORIGINE_APP + '/') ? adresse.slice(ORIGINE_APP.length) : adresse
  return cheminInterne(s, null)
}

// Le chemin à ouvrir pour un toucher reçu du plugin, ou `null`.
//
// ⚠️ LES DONNÉES D'ABORD, l'adresse de lancement ensuite. Nos envois portent
// `data.chemin` ; une notification écrite à la main dans le tableau de bord
// OneSignal porte plutôt une « Launch URL ». Les deux passent par la même
// porte, `cheminDeNotification`.
export function cheminDeClic(evenement) {
  const notif = evenement?.notification
  return cheminDeNotification(notif?.additionalData?.chemin)
    || cheminDeNotification(notif?.launchURL)
}

// Branche l'écoute du toucher, UNE fois par page chargée. Rend `{ ok, raison }`.
//
// ⚠️ UNE FOIS, ET LE DRAPEAU VIT SUR LA FENÊTRE. Le plugin empile chaque
// écouteur ajouté : un composant monté deux fois ouvrirait deux fois la page.
// La fenêtre, elle, repart à neuf à chaque chargement complet, exactement comme
// le côté JavaScript du plugin : le drapeau ne survit donc jamais à l'écouteur.
//
// ⚠️ APRÈS `initialize`, JAMAIS AVANT. Sur Android, le SDK refuse tout appel
// tant que `initWithContext` n'a pas eu lieu : l'appelant initialise d'abord,
// dans le même geste, comme il le fait déjà pour `login`.
export function brancherClicNatif(fenetre, ouvrir) {
  const os = pluginNatif(fenetre)
  if (!os) return { ok: false, raison: 'pas_natif' }
  if (typeof ouvrir !== 'function') return { ok: false, raison: 'ouvrir_absent' }
  if (fenetre.__yoppaaClicNatif === true) return { ok: true, raison: 'deja_branche' }
  try {
    os.Notifications.addEventListener('click', (evenement) => {
      const chemin = cheminDeClic(evenement)
      if (chemin) ouvrir(chemin)
    })
    fenetre.__yoppaaClicNatif = true
    return { ok: true, raison: null }
  } catch (e) {
    return { ok: false, raison: e?.message || 'clic_ko' }
  }
}
