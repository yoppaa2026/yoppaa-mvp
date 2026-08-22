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

// L'état de l'autorisation, quand le navigateur sait le dire.
export async function etatAutorisation() {
  try {
    if (!navigator?.permissions?.query) return null
    const res = await navigator.permissions.query({ name: 'geolocation' })
    return res?.state || null
  } catch {
    return null
  }
}
