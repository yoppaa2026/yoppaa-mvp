// La position du Yopper, demandée UNE fois.
//
// LE BUG (Alex, 07/08) : l'application redemandait l'autorisation à chaque
// ouverture. C'est le genre de détail qui fait désinstaller : on a l'impression
// que l'app n'écoute pas, et à la troisième fois on refuse par réflexe.
//
// La cause : `getCurrentPosition` était appelé au montage, sans condition. Tant
// que l'autorisation n'est pas franchement accordée, le navigateur repose la
// question à chaque appel, et un refus par lassitude est définitif.
//
// LA RÈGLE ICI. On ne dérange qu'une seule fois :
//   • autorisation déjà accordée  → on lit la position, sans aucune fenêtre ;
//   • autorisation refusée        → on ne demande plus JAMAIS, il l'a dit ;
//   • jamais demandée             → on demande, une fois, et on s'en souvient ;
//   • déjà demandée sans réponse  → on ne relance pas tout seul, le bouton
//                                   « Utiliser ma position » reste là pour ça.
//
// La dernière position connue est gardée : au démarrage suivant, la commune
// s'affiche tout de suite, même hors ligne.

const CLE_POSITION = 'yoppaa_geo_position'
const CLE_DEMANDE = 'yoppaa_geo_demande'
// ⚠️ CES DEUX-CI VIVENT DANS LA **SESSION**, PAS DANS LE NAVIGATEUR, et c'est
// toute la correction du 22/08. Voir `decisionGeoloc` plus bas.
const CLE_DEMANDE_SESSION = 'yoppaa_geo_demande_session'
const CLE_LECTURE_SESSION = 'yoppaa_geo_lecture_session'

function lireSession(cle) {
  try { return sessionStorage.getItem(cle) === '1' } catch { return false }
}
function ecrireSession(cle) {
  try { sessionStorage.setItem(cle, '1') } catch { /* navigation privée saturée : sans gravité */ }
}

/** La fenêtre d'autorisation a déjà été ouverte DANS CETTE SESSION. */
export function demandeFaiteDansCetteSession() { return lireSession(CLE_DEMANDE_SESSION) }
export function marquerDemandeDeCetteSession() { ecrireSession(CLE_DEMANDE_SESSION) }

/**
 * Une position a été lue AVEC SUCCÈS dans cette session : l'autorisation est
 * donc vivante ici et maintenant, quoi qu'en dise l'API Permissions. Relire ne
 * peut plus ouvrir aucune fenêtre.
 */
export function lectureReussieDansCetteSession() { return lireSession(CLE_LECTURE_SESSION) }
export function marquerLectureDeCetteSession() { ecrireSession(CLE_LECTURE_SESSION) }

// Une position vieille de plus de douze heures ne sert plus à situer quelqu'un,
// mais elle reste bonne pour afficher quelque chose pendant que la vraie
// arrive : on la renvoie en la marquant « périmée ».
export const DUREE_FRAICHE = 12 * 3600 * 1000

export function lirePositionMemorisee(maintenant = Date.now()) {
  try {
    const brut = localStorage.getItem(CLE_POSITION)
    if (!brut) return null
    const p = JSON.parse(brut)
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) return null
    return { lat: p.lat, lng: p.lng, rue: p.rue || null, fraiche: (maintenant - (p.le || 0)) < DUREE_FRAICHE }
  } catch {
    return null
  }
}

export function memoriserPosition({ lat, lng, rue = null }, maintenant = Date.now()) {
  try {
    localStorage.setItem(CLE_POSITION, JSON.stringify({ lat, lng, rue, le: maintenant }))
  } catch { /* stockage plein ou navigation privée : sans gravité */ }
}

export function marquerDemandee() {
  try { localStorage.setItem(CLE_DEMANDE, '1') } catch { /* sans gravité */ }
}

export function dejaDemandee() {
  try { return localStorage.getItem(CLE_DEMANDE) === '1' } catch { return false }
}

// ⚠️ CRÉER UN COMPTE EST UN MOMENT LÉGITIME POUR REDEMANDER.
//
// Le drapeau « déjà demandée » vit dans le NAVIGATEUR, pas dans le compte. Un
// Yopper qui créait un compte sur un navigateur ayant déjà croisé Yoppaa ne
// voyait donc JAMAIS la fenêtre de position : le drapeau était posé depuis une
// visite précédente, et `decisionGeoloc` répondait « jamais ». Il fallait aller
// cliquer sur la pastille d'adresse pour l'ouvrir à la main.
//
// C'est le contraire de ce qu'on veut : le moment où quelqu'un s'engage est
// justement celui où la position lui sert le plus, puisque c'est elle qui fait
// apparaître les commerces autour de lui.
//
// ⚠️ Cela ne contourne PAS un refus : si l'autorisation est 'denied',
// `decisionGeoloc` répond toujours « jamais », et le navigateur ne rouvrirait
// rien de toute façon. On ne réarme que la première demande, pas l'insistance.
export function oublierDemande() {
  try { localStorage.removeItem(CLE_DEMANDE) } catch { /* sans gravité */ }
}

// Faut-il ouvrir la fenêtre du navigateur ? `etat` vient de l'API Permissions
// ('granted' | 'denied' | 'prompt'), ou vaut null quand elle n'existe pas
// (Safari ne l'expose pas pour la géolocalisation).
//
// Renvoie 'lire' (on peut lire sans déranger), 'demander' (on ouvre la fenêtre)
// ou 'jamais' (on se tait).
//
// ⚠️ 22/08 — LA POSITION ÉTAIT GELÉE POUR TOUJOURS SUR IPHONE, et la cause
// tenait à cette seule ligne :
//
//     return dejaDemande ? 'jamais' : 'demander'
//
// Sur iPhone, `etat` vaut TOUJOURS null : Safari n'expose pas l'API Permissions
// pour la géolocalisation. Après la toute première acceptation, `dejaDemande`
// vaut 1 pour la vie du navigateur, donc la réponse était « jamais » à chaque
// ouverture ET à chaque retour au premier plan. Le Yopper se déplaçait, la rue
// affichée restait celle de son premier jour. Rien ne le disait.
//
// ⚠️ LE CORRECTIF DU 07/08 GARDAIT « POUR TOUJOURS » LÀ OÙ « UNE FOIS PAR
// SESSION » SUFFISAIT. Le défaut qu'il réglait était réel : `getCurrentPosition`
// était appelé À CHAQUE MONTAGE du composant, donc à chaque navigation interne,
// et la fenêtre se rouvrait dix fois dans la même visite. Une mémoire de
// SESSION éteint ce défaut aussi bien qu'une mémoire permanente, sans geler la
// position entre deux visites.
//
// La règle devient, dans cet ordre :
//   • autorisation accordée (quand le navigateur sait le dire)  → on lit ;
//   • autorisation refusée                                      → on se tait ;
//   • on a DÉJÀ LU avec succès dans cette session               → on relit,
//     aucune fenêtre ne peut s'ouvrir puisqu'elle vient de ne pas s'ouvrir ;
//   • on a DÉJÀ POSÉ la question dans cette session             → on se tait,
//     c'est exactement le défaut du 07/08 ;
//   • on ne l'a jamais posée                                    → on demande ;
//   • on l'a posée un autre jour ET il avait fini par accepter  → on redemande
//     une fois, aujourd'hui. Sans ça, un iPhone reste gelé à vie.
//   • sinon (posée un autre jour, jamais acceptée)              → on se tait.
export function decisionGeoloc({
  etat = null,
  dejaDemande = false,
  lectureReussieSession = false,
  demandeFaiteSession = false,
  positionDejaObtenue = false,
} = {}) {
  if (etat === 'granted') return 'lire'
  if (etat === 'denied') return 'jamais'
  if (lectureReussieSession) return 'lire'
  if (demandeFaiteSession) return 'jamais'
  if (!dejaDemande) return 'demander'
  // ⚠️ `positionDejaObtenue` est la SEULE preuve qu'on ait d'une acceptation
  // passée quand l'API Permissions se tait. Sans elle, on ne redemande pas :
  // quelqu'un qui a ignoré ou fermé la fenêtre ne doit pas la revoir.
  return positionDejaObtenue ? 'demander' : 'jamais'
}

// ─── LA POSITION DANS L'APP DES STORES (02/10) ──────────────────────────────
//
// 🔴 CE QU'APPLE NOUS A FAIT VOIR. Dans l'app, `navigator.geolocation` passe par
// WebKit, qui ajoute SA fenêtre à celle du système : « This website will use
// your precise location », en anglais, au nom du SITE et pas de Yoppaa, et
// reposée d'une session à l'autre. Pour un relecteur comme pour un Yopper,
// c'est une application qui se présente comme une page web.
//
// ✅ DANS L'APP, ON PASSE PAR LE MODULE NATIF `@capacitor/geolocation` : une
// seule question, celle du système, au nom de Yoppaa, avec notre phrase de
// l'Info.plist. Partout ailleurs (navigateur, PWA), rien ne change.
//
// ⚠️ ET L'ANCIENNE APP N'A PAS CE MODULE. Le site est servi aux deux binaires
// à la fois : celui qu'on dépose et celui que les gens ont déjà installé. On
// demande donc à Capacitor si le module EXISTE, pas seulement si on est dans
// l'app ; sans lui, on retombe sur le navigateur, comme avant.

// Le module natif, ou `null` (navigateur, PWA, ancienne app sans le module).
//
// ⚠️ LA PREUVE EST DANS `PluginHeaders`, PAS DANS `isPluginAvailable`. Dans le
// pont injecté par l'app, `isPluginAvailable` répond seulement « un objet de ce
// nom existe dans `Plugins` » : un relais web posé par le site y suffirait, et
// l'ancienne app croirait avoir le module. Les en-têtes, eux, ne sont publiés
// QUE par le code natif (`JSExport`, iOS comme Android), pour les modules
// réellement compilés dans le binaire. Trouvé par le banc le 02/10.
export function geolocNative(fenetre) {
  try {
    const cap = fenetre?.Capacitor
    if (cap?.isNativePlatform?.() !== true) return null
    const compile = Array.isArray(cap.PluginHeaders)
      && cap.PluginHeaders.some((h) => h?.name === 'Geolocation')
    if (!compile) return null
    const g = cap.Plugins?.Geolocation
    return typeof g?.getCurrentPosition === 'function' ? g : null
  } catch {
    // ⚠️ UN ACCÈS QUI JETTE N'EST PAS UN MODULE : on reste sur le navigateur.
    return null
  }
}

// Peut-on demander une position ici ?
export function positionDisponible(fenetre) {
  try {
    return !!geolocNative(fenetre) || !!fenetre?.navigator?.geolocation
  } catch {
    return false
  }
}

// Les erreurs du module (« OS-PLUG-GLOC-0003 ») ramenées aux codes du
// navigateur, que les écrans connaissent déjà : 1 refus, 2 indisponible,
// 3 délai.
export function codeErreurPosition(erreur) {
  const n = Number(String(erreur?.code || '').match(/(\d+)$/)?.[1])
  if (n === 3 || n === 8) return 1
  if (n === 10) return 3
  return 2
}

// Le filet de l'app : au-delà du délai demandé PLUS cette marge, on rend la
// main à l'écran. La marge laisse le temps de répondre à la fenêtre du système.
export const MARGE_FENETRE_MS = 15000

// LA porte d'entrée, avec la signature de `navigator.geolocation
// .getCurrentPosition(succes, echec, options)` : les écrans n'ont rien d'autre
// à apprendre. Le succès reçoit `{ coords: { latitude, longitude, accuracy },
// timestamp }`, l'échec `{ code, message }`.
//
// ⚠️ DANS L'APP, ON GARANTIT UNE RÉPONSE, ET UNE SEULE. Les points d'attente
// de l'onboarding ne s'arrêtent qu'à la réponse : un module qui ne répondrait
// jamais (fenêtre du système laissée ouverte) les ferait tourner à vie. Le
// filet rend un échec « délai » ; ce qui arrive APRÈS est ignoré, l'écran
// ayant déjà repris la main.
//
// ⚠️ DANS LE NAVIGATEUR, ON NE TOUCHE À RIEN : l'appel part tel quel, avec ses
// options, comme avant ce module.
//
// `marge` ne sert qu'au banc, qui ne peut pas attendre quinze secondes.
export function lirePosition(fenetre, succes, echec, options = {}, { marge = MARGE_FENETRE_MS } = {}) {
  const natif = geolocNative(fenetre)
  if (!natif) {
    const geo = fenetre?.navigator?.geolocation
    if (!geo) { echec?.({ code: 2, message: 'position_indisponible' }); return }
    geo.getCurrentPosition(succes, echec, options)
    return
  }
  const delai = Number.isFinite(options.timeout) ? options.timeout : 10000
  let fini = false
  let filet = null
  const conclure = (fn, valeur) => {
    if (fini) return
    fini = true
    if (filet) clearTimeout(filet)
    fn?.(valeur)
  }
  filet = setTimeout(() => conclure(echec, { code: 3, message: 'delai' }), delai + marge)
  try {
    natif.getCurrentPosition({
      enableHighAccuracy: options.enableHighAccuracy === true,
      timeout: delai,
      maximumAge: Number.isFinite(options.maximumAge) ? options.maximumAge : 0,
    }).then((p) => {
      const latitude = Number(p?.coords?.latitude)
      const longitude = Number(p?.coords?.longitude)
      // 🔴 UNE POSITION SANS CHIFFRES N'EST PAS UNE POSITION. `Number(null)`
      // vaut 0 : sans ce contrôle, on situerait le Yopper dans le golfe de
      // Guinée, et la liste afficherait des distances de 5 000 km.
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
        || p?.coords?.latitude == null || p?.coords?.longitude == null) {
        conclure(echec, { code: 2, message: 'position_vide' })
        return
      }
      conclure(succes, {
        coords: { latitude, longitude, accuracy: Number(p.coords.accuracy) || null },
        timestamp: Number(p.timestamp) || Date.now(),
      })
    }, (e) => conclure(echec, { code: codeErreurPosition(e), message: e?.message || 'erreur' }))
  } catch (e) {
    conclure(echec, { code: 2, message: e?.message || 'erreur' })
  }
}

// L'état de l'autorisation, quand le navigateur sait le dire.
//
// ⚠️ DANS L'APP, C'EST LE MODULE QUI LE DIT, et il le dit toujours. WebKit, lui,
// ne l'expose pas : sur iPhone, `etat` valait `null` à vie (voir
// `decisionGeoloc`). « prompt-with-rationale » (Android) est une question
// qu'on peut encore poser : c'est « prompt ».
export async function etatAutorisation(fenetre = typeof window !== 'undefined' ? window : undefined) {
  const natif = geolocNative(fenetre)
  if (natif) {
    try {
      const res = await natif.checkPermissions()
      const etat = res?.location
      if (etat === 'prompt-with-rationale') return 'prompt'
      return ['granted', 'denied', 'prompt'].includes(etat) ? etat : null
    } catch {
      // ⚠️ SERVICES DE LOCALISATION COUPÉS : le module jette. « On ne sait
      // pas » n'est pas « refusé », on laisse la règle habituelle décider.
      return null
    }
  }
  try {
    if (!navigator?.permissions?.query) return null
    const res = await navigator.permissions.query({ name: 'geolocation' })
    return res?.state || null
  } catch {
    return null
  }
}
