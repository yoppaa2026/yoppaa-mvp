'use client'
import { useEffect, useState } from 'react'

// LES LOCALITÉS WALLONNES, DEPUIS LE RÉFÉRENTIEL OFFICIEL (06/10).
//
// Chargées UNE fois par visite (gardées en mémoire du module), puis filtrées
// sur place par `filtrerLocalites` (lib/localiser.js) : ce que le Yopper tape
// ne quitte pas son appareil. Remplace l'appel à Nominatim.
//
// `actif` : on ne charge qu'à l'ouverture du champ, pas à chaque accueil.
// Rend { etat: 'vide' | 'charge' | 'ok' | 'erreur', liste }.

let memoire = null   // la liste, une fois reçue

export function useLocalitesBest(actif) {
  const [etat, setEtat] = useState(() => memoire ? { etat: 'ok', liste: memoire } : { etat: 'vide', liste: [] })

  useEffect(() => {
    if (!actif || memoire) return
    let annule = false
    setEtat({ etat: 'charge', liste: [] })
    fetch('/api/adresse/localites?v=1')
      .then(r => r.json().then(d => ({ ok: r.ok && d?.ok, d })))
      .then(({ ok, d }) => {
        if (annule) return
        if (ok && Array.isArray(d.localites) && d.localites.length > 0) {
          memoire = d.localites
          setEtat({ etat: 'ok', liste: memoire })
        } else {
          setEtat({ etat: 'erreur', liste: [] })
        }
      })
      .catch(() => { if (!annule) setEtat({ etat: 'erreur', liste: [] }) })
    return () => { annule = true }
  }, [actif])

  return memoire ? { etat: 'ok', liste: memoire } : etat
}
