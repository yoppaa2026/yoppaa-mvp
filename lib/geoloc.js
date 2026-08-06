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

// Faut-il ouvrir la fenêtre du navigateur ? `etat` vient de l'API Permissions
// ('granted' | 'denied' | 'prompt'), ou vaut null quand elle n'existe pas
// (Safari l'a longtemps ignorée).
//
// Renvoie 'lire' (on peut lire sans déranger), 'demander' (on ouvre la fenêtre)
// ou 'jamais' (on se tait).
export function decisionGeoloc({ etat = null, dejaDemande = false } = {}) {
  if (etat === 'granted') return 'lire'
  if (etat === 'denied') return 'jamais'
  // 'prompt' ou API absente : on ne demande que si on ne l'a jamais fait. Le
  // bouton « Utiliser ma position » reste le chemin volontaire pour revenir
  // dessus, et lui ne passe jamais par ici.
  return dejaDemande ? 'jamais' : 'demander'
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
