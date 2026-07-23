'use client'
// Sélecteur du type de commerce (signup + Profil dashboard) : chips de la
// catégorie, 2 métiers max (le 1er tapé = métier principal, badge de la carte),
// + chip « Autre… » qui ouvre un champ libre pour les métiers hors liste
// (normalisables ensuite à la validation KYB, jamais bloquant à l'onboarding).
// Valeur = chaîne stockée en base ("Boulangerie & Pâtisserie").

import { useState } from 'react'
import { typesPourCategorie, splitTypes, joinTypes, nettoyerTypeLibre, MAX_TYPES_COMMERCE } from '@/lib/types-commerce'

const C = { main: '#6B35C4', ink: '#1A0840', muted: '#6B7280', pale: '#EDE0FF', hairline: '#E5E0F0' }

export default function SelecteurTypes({ categorie, value, onChange }) {
  const liste = typesPourCategorie(categorie)
  const selection = splitTypes(value)
  const libre = selection.find(t => !liste.includes(t)) || ''
  const [autreOuvert, setAutreOuvert] = useState(!!libre)
  // État local du champ libre : permet de taper espaces/tirets sans que le
  // trim de joinTypes ne mange la frappe (la valeur stockée reste nettoyée).
  const [autreVal, setAutreVal] = useState(libre)

  const plein = selection.length >= MAX_TYPES_COMMERCE

  function toggle(t) {
    if (selection.includes(t)) {
      onChange(joinTypes(selection.filter(x => x !== t)))
    } else if (!plein) {
      onChange(joinTypes([...selection, t]))
    }
  }

  function setLibre(val) {
    const propre = nettoyerTypeLibre(val)
    setAutreVal(propre)
    const sansLibre = selection.filter(t => liste.includes(t))
    // Le champ libre occupe un des 2 emplacements
    onChange(joinTypes(propre ? [...sansLibre.slice(0, MAX_TYPES_COMMERCE - 1), propre] : sansLibre))
  }

  function toggleAutre() {
    if (autreOuvert) { setLibre(''); setAutreOuvert(false) }
    else setAutreOuvert(true)
  }

  const chipSt = (actif, desactive) => ({
    padding: '7px 13px', borderRadius: 100, cursor: desactive ? 'default' : 'pointer',
    border: actif ? `1.5px solid ${C.main}` : `1.5px solid ${C.hairline}`,
    background: actif ? C.main : '#fff', color: actif ? '#fff' : desactive ? '#B8B3C7' : C.ink,
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
  })

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {liste.map(t => {
          const actif = selection.includes(t)
          const desactive = !actif && plein
          return (
            <button key={t} type="button" onClick={() => toggle(t)} style={chipSt(actif, desactive)}>
              {t}
            </button>
          )
        })}
        <button type="button" onClick={toggleAutre} style={{ ...chipSt(autreOuvert && !!libre, !autreOuvert && plein), borderStyle: autreOuvert ? 'solid' : 'dashed' }}>
          Autre…
        </button>
      </div>
      {autreOuvert && (
        <input type="text" value={autreVal} onChange={e => setLibre(e.target.value)}
          placeholder="Ton métier (ex : Savonnerie artisanale)" autoFocus={!libre}
          style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${C.hairline}`, fontSize: 13.5, fontFamily: 'inherit', color: C.ink, outline: 'none' }}/>
      )}
      <p style={{ fontSize: 11, color: C.muted, margin: '7px 0 0' }}>
        {selection.length === 0
          ? `Choisis ton métier (${MAX_TYPES_COMMERCE} maximum, ex : Boulangerie + Pâtisserie).`
          : selection.length === 1
          ? 'Tu peux en ajouter un second si ton commerce couvre deux métiers.'
          : 'Deux métiers maximum. Le premier est ton métier principal.'}
      </p>
    </div>
  )
}
