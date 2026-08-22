'use client'
import { useState, useRef } from 'react'

// UN CHAMP D'ADRESSE QUI RAPPORTE DES COORDONNÉES.
//
// ⚠️ SANS LATITUDE, UN LIEU S'AFFICHE MAIS NE RAPPROCHE PERSONNE. L'accueil
// trie les commerces par distance et ignore purement et simplement un lieu sans
// coordonnées : une professeure de yoga pouvait déclarer sa seconde salle et
// rester invisible aux habitants de cette commune. C'est ce que ce champ
// répare, en géocodant à la saisie plutôt qu'en espérant le faire plus tard.
//
// Il vivait dans le formulaire d'inscription, où il servait déjà deux fois. Il
// est sorti ici le 13/08 pour que l'éditeur de lieux s'en serve aussi : deux
// champs d'adresse qui géocodent différemment finiraient par diverger, et la
// divergence enverrait un client au mauvais endroit sans que rien ne le dise.
//
// ⚠️ L'appel part DU NAVIGATEUR, directement vers Nominatim. C'est un partage
// de données au sens des déclarations de magasins d'applications, et il est
// déclaré comme tel. Ne pas le déplacer côté serveur sans revoir la page
// /legal, qui décrit ce que le code fait réellement.

const RECHERCHE = 'https://nominatim.openstreetmap.org/search'

export default function ChampAdresse({
  valeur,
  position,
  onTexte,
  onChoisir,
  placeholder,
  style,
  couleurs = {},
}) {
  const [suggestions, setSuggestions] = useState([])
  const [cherche, setCherche] = useState(false)
  const minuteur = useRef(null)

  const C = {
    hairline: couleurs.hairline || '#E7E3F5',
    deep: couleurs.deep || '#2D0F6B',
    muted: couleurs.muted || '#6B7280',
    ok: couleurs.ok || '#10B981',
  }

  function chercher(query) {
    if (!query || query.length < 3) { setSuggestions([]); return }
    setCherche(true)
    // Une frappe par lettre ferait une requête par lettre. Nominatim est un
    // service gratuit et communautaire : on attend que la frappe s'arrête.
    clearTimeout(minuteur.current)
    minuteur.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${RECHERCHE}?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=fr&countrycodes=be&addressdetails=1`,
          { headers: { Accept: 'application/json' } },
        )
        setSuggestions(await res.json() || [])
      } catch { setSuggestions([]) }
      setCherche(false)
    }, 400)
  }

  // Compose une adresse propre « Rue X 12, 5640 Localité » depuis les champs
  // structurés. Le `display_name` brut intercale les hameaux et les lieux-dits,
  // et la troncature perdait la localité et le code postal.
  function choisir(s) {
    const a = s.address || {}
    const rue = a.road || a.pedestrian || a.square || ''
    const num = a.house_number || ''
    const localite = a.village || a.town || a.city || a.municipality || a.hamlet || ''
    const cp = a.postcode || ''
    const adresse = rue
      ? `${rue}${num ? ` ${num}` : ''}${(cp || localite) ? `, ${[cp, localite].filter(Boolean).join(' ')}` : ''}`
      : s.display_name.split(',').slice(0, 3).join(', ')
    setSuggestions([])
    // ⚠️ `rue` ET `ville` S'AJOUTENT AU RETOUR, ils ne le remplacent pas. Le
    // tunnel de commande a trois champs séparés (rue, code postal, ville) et ne
    // peut rien faire d'une chaîne déjà recollée. Les deux appelants existants
    // (inscription, éditeur de lieux) lisent `adresse` et ignorent le reste :
    // ajouter des clés ne casse aucun contrat, en retirer en casserait deux.
    // Voir reference_changement_type_retour.
    onChoisir({
      adresse,
      rue: rue ? `${rue}${num ? ` ${num}` : ''}` : null,
      ville: localite || null,
      latitude: parseFloat(s.lat),
      longitude: parseFloat(s.lon),
      code_postal: cp || null,
    })
  }

  return (
    <>
      <div style={{ position: 'relative' }}>
        <input type="text" value={valeur}
          onChange={e => { onTexte(e.target.value); chercher(e.target.value) }}
          placeholder={placeholder} style={style}/>
        {cherche && (
          <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: C.muted }}>…</span>
        )}
        {suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, marginTop: 4, boxShadow: '0 8px 24px rgba(22,6,54,0.12)', zIndex: 10, maxHeight: 240, overflowY: 'auto' }}>
            {suggestions.map(s => (
              <button key={s.place_id} type="button" onClick={() => choisir(s)}
                style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: C.deep }}>
                {s.display_name}
              </button>
            ))}
          </div>
        )}
      </div>
      {position?.latitude && position?.longitude && (
        <p style={{ fontSize: 11, color: C.ok, fontWeight: 700, margin: '6px 0 0' }}>
          ✓ Position confirmée ({Number(position.latitude).toFixed(4)}, {Number(position.longitude).toFixed(4)})
        </p>
      )}
    </>
  )
}
