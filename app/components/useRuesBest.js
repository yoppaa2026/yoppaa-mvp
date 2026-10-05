'use client'
import { useEffect, useState } from 'react'
import { normaliserRecherche } from '@/lib/best-adresse'

// LES RUES D'UN CODE POSTAL, DEPUIS LE RÉFÉRENTIEL OFFICIEL (chantier zone).
//
// Une seule requête par code postal ; la liste est ensuite filtrée sur place
// (`filtrerRues`). Partagé par les deux champs d'adresse, pour qu'ils ne
// divergent jamais.
//
// Rend { etat: 'vide' | 'charge' | 'ok' | 'erreur', liste }.
// ⚠️ `v=2` DANS L'ADRESSE : la réponse est gardée un jour par le CDN, et la
// version d'avant le 05/10 n'avait pas le centre des rues. Changer l'adresse
// évite de servir l'ancienne forme pendant 24 h.
export function useRuesBest(codePostal) {
  const cp = /^\d{4}$/.test(String(codePostal ?? '')) ? String(codePostal) : null
  const [etat, setEtat] = useState({ cp: null, liste: [], etat: 'vide' })

  useEffect(() => {
    if (!cp) return
    let annule = false
    setEtat({ cp, liste: [], etat: 'charge' })
    fetch(`/api/adresse/rues?cp=${cp}&v=2`)
      .then(r => r.json().then(d => ({ ok: r.ok && d?.ok, d })))
      .then(({ ok, d }) => {
        if (annule) return
        setEtat(ok
          ? { cp, liste: (d.rues || []).map(r => ({ ...r, r: normaliserRecherche(r.nom) })), etat: 'ok' }
          : { cp, liste: [], etat: 'erreur' })
      })
      .catch(() => { if (!annule) setEtat({ cp, liste: [], etat: 'erreur' }) })
    return () => { annule = true }
  }, [cp])

  return cp && etat.cp === cp ? etat : { cp, liste: [], etat: cp ? 'charge' : 'vide' }
}
