// « OÙ ME TROUVER » EST-IL REMPLI ? (Alex, 06/10)
//
// 🔴 C'est de là que se mesure la distance des cards, et l'étoile de livraison
// part du lieu PERMANENT. L'adresse d'inscription ne localise JAMAIS le
// commerce. Une seule règle pour tous, sans liste d'exceptions : le commerce
// fixe y met son adresse, le food truck ses emplacements, le centre à
// plusieurs salles ses salles.
//
// Fichier PUR : lu par l'encart du tableau de bord, exécuté par le banc.

import { centreDeLaZone, zoneValide } from './zone-etoile.js'

/** Un lieu qui compte : actif ET situé sur la carte. */
export function lieuSitue(l) {
  return !!l && l.actif !== false && l.latitude != null && l.longitude != null
}

/**
 * Les deux cas que l'encart signale :
 *   • `aucunLieu` : fiche en ligne sans aucun lieu situé (ni adresse ni
 *     distance sur la card) ;
 *   • `etoileSansDepart` : livraison active, étoile dessinée, mais aucun lieu
 *     permanent situé : le serveur refuse toute livraison (`zone_indisponible`).
 */
export function etatOuMeTrouver({ publiee = false, livraisonActive = false, lieux = [], zoneRayons = null } = {}) {
  const situes = (lieux || []).filter(lieuSitue)
  return {
    aucunLieu: publiee && situes.length === 0,
    etoileSansDepart: livraisonActive && zoneValide(zoneRayons) && !centreDeLaZone({ lieux }),
  }
}
