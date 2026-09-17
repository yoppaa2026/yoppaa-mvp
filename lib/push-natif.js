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
export function pluginNatif(fenetre) {
  if (!estAppNative(fenetre)) return null
  const os = fenetre?.OneSignal
  // ⚠️ `initialize` EST LA SIGNATURE DU NATIF. Sa présence distingue le plugin
  // du SDK web, qui n'expose que `init`. Deux SDK, un seul nom : on vérifie ce
  // que l'objet SAIT FAIRE, pas comment il s'appelle.
  return typeof os?.initialize === 'function' ? os : null
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
