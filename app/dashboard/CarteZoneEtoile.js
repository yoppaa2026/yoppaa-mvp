'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import {
  contourEtoile, pointA, distanceMetres,
  NB_POIGNEES, PAS_DEGRES, RAYON_MIN_M, RAYON_MAX_M,
} from '@/lib/zone-etoile'

// LA CARTE OÙ LE COMMERÇANT DESSINE SA ZONE (chantier zone, 05/10).
//
// Douze poignées autour du commerce, une tous les 30°. Il en tire une : elle
// glisse le long de SA direction, et le contour suit. Ce contour est tracé par
// `contourEtoile`, la même fonction que celle qui décide côté serveur : ce
// qu'il voit est exactement ce qui sera appliqué.
//
// ⚠️ LA SEULE CARTE DE YOPPAA (décision du 25/09). Elle ne vit que dans ce
// réglage, ouvert quelques fois par commerce : les tuiles OpenStreetMap
// restent dans l'usage « normal » qu'autorise leur politique. Le tunnel client
// n'a pas de carte, il reçoit une phrase.
//
// ⚠️ LEAFLET EST CHARGÉ À LA DEMANDE, dans le navigateur seulement : il lit
// `window` dès son import, et le rendu serveur n'en a pas.

const TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export default function CarteZoneEtoile({ centre, rayons, onChange, couleur = '#6D28D9', hauteur = 380 }) {
  const conteneur = useRef(null)
  const carte = useRef(null)            // { L, map, contour, poignees }
  const rayonsCourants = useRef(rayons)
  const auChangement = useRef(onChange)
  const recadrer = useRef(true)
  rayonsCourants.current = rayons
  auChangement.current = onChange

  function dessiner(r, sauf = -1) {
    const c = carte.current
    if (!c || !Array.isArray(r)) return
    c.contour.setLatLngs(contourEtoile(centre, r).map(p => [p.lat, p.lng]))
    c.poignees.forEach((m, i) => {
      if (i === sauf) return
      const p = pointA(centre, i * PAS_DEGRES, r[i])
      m.setLatLng([p.lat, p.lng])
    })
  }

  // La carte se construit une fois par centre.
  useEffect(() => {
    let annule = false
    import('leaflet').then(mod => {
      if (annule || !conteneur.current) return
      const L = mod.default || mod
      const map = L.map(conteneur.current, { scrollWheelZoom: false })
      L.tileLayer(TUILES, {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map)

      const pastille = (taille, fond, bord) => L.divIcon({
        className: '',
        html: `<div style="width:${taille}px;height:${taille}px;border-radius:50%;background:${fond};border:3px solid ${bord};box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
        iconSize: [taille, taille],
        iconAnchor: [taille / 2, taille / 2],
      })

      L.marker([centre.lat, centre.lng], { icon: pastille(16, couleur, '#fff'), interactive: false, keyboard: false }).addTo(map)
      const contour = L.polygon([], { color: couleur, weight: 2, fillColor: couleur, fillOpacity: 0.12 }).addTo(map)

      const poignees = []
      for (let i = 0; i < NB_POIGNEES; i++) {
        const m = L.marker([centre.lat, centre.lng], {
          icon: pastille(22, '#fff', couleur),
          draggable: true,
          autoPan: true,
          title: 'Tire pour agrandir ou réduire la zone dans cette direction',
        }).addTo(map)
        // Pendant qu'il tire : la distance au commerce, bornée, et le contour
        // suit. La poignée elle-même reste sous son doigt.
        m.on('drag', () => {
          const p = m.getLatLng()
          const d = Math.round(distanceMetres(centre, { lat: p.lat, lng: p.lng }))
          const suivant = [...rayonsCourants.current]
          suivant[i] = Math.min(RAYON_MAX_M, Math.max(RAYON_MIN_M, d))
          rayonsCourants.current = suivant
          dessiner(suivant, i)
        })
        // Quand il lâche : la poignée se replace sur SA direction, et le
        // réglage remonte au formulaire (une fois, pas à chaque mouvement).
        m.on('dragend', () => {
          recadrer.current = false
          dessiner(rayonsCourants.current)
          auChangement.current?.(rayonsCourants.current)
        })
        poignees.push(m)
      }

      carte.current = { L, map, contour, poignees }
      dessiner(rayonsCourants.current)
      map.fitBounds(contour.getBounds(), { padding: [24, 24] })
    })
    return () => {
      annule = true
      carte.current?.map?.remove()
      carte.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centre.lat, centre.lng])

  // Un changement venu du formulaire (le curseur général) : on redessine, et
  // on recadre. Après une poignée lâchée, pas de recadrage : la carte ne doit
  // pas bouger sous le doigt.
  useEffect(() => {
    if (!carte.current || !Array.isArray(rayons)) return
    dessiner(rayons)
    if (recadrer.current) carte.current.map.fitBounds(carte.current.contour.getBounds(), { padding: [24, 24] })
    recadrer.current = true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rayons])

  return (
    <div
      ref={conteneur}
      role="application"
      aria-label="Carte de la zone de livraison : tire les points pour régler la distance dans chaque direction"
      style={{ width: '100%', height: hauteur, borderRadius: 12, overflow: 'hidden', zIndex: 0, position: 'relative' }}
    />
  )
}
