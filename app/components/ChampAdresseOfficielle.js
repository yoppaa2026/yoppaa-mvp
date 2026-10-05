'use client'
import { useEffect, useMemo, useState } from 'react'
import { filtrerRues, composerAdresseOfficielle } from '@/lib/best-adresse'
import { useRuesBest } from './useRuesBest'

// L'ADRESSE D'UN COMMERCE, DANS LE RÉFÉRENTIEL OFFICIEL (chantier zone, 05/10).
//
// Remplace `ChampAdresse`, qui demandait des suggestions à Nominatim depuis le
// navigateur à chaque frappe (usage interdit par leur politique ; Alex :
// « il faut supprimer Nominatim »). Sert à l'inscription (siège social) et à
// l'éditeur des lieux d'activité.
//
// Code postal → rue choisie dans la liste → numéro, puis « Utiliser cette
// adresse ». Décisions d'Alex (05/10) :
//   • A : le NUMÉRO EST FACULTATIF. Un food truck s'installe « Place du
//     Marché » : sans numéro (ou numéro inconnu du référentiel), la position
//     est le CENTRE DE LA RUE, et l'écran le dit ;
//   • B : `libreHorsWallonie` (le siège social) : un code postal hors du
//     référentiel wallon permet une saisie libre, SANS position. Le siège ne
//     sert qu'à valider le dossier.
//
// Même contrat de sortie que l'ancien champ : `onChoisir({ adresse, latitude,
// longitude })`, plus `approximative` (centre de la rue). Rien n'est envoyé
// avant le geste « Utiliser cette adresse » : l'inscription enregistre à
// chaque choix, une frappe ne doit pas déclencher une sauvegarde.

const MAX_SUGGESTIONS = 8

export default function ChampAdresseOfficielle({
  valeur,
  position,
  onChoisir,
  style,
  couleurs = {},
  libreHorsWallonie = false,
  // Le geste qui valide le choix. Dans l'éditeur de lieux, le formulaire a
  // déjà son propre « Utiliser cette adresse » : deux boutons au même nom
  // feraient cliquer le mauvais.
  libelleValider = 'Utiliser cette adresse',
}) {
  const C = {
    hairline: couleurs.hairline || '#E7E3F5',
    deep: couleurs.deep || '#2D0F6B',
    muted: couleurs.muted || '#6B7280',
    ok: couleurs.ok || '#059669',
    erreur: couleurs.erreur || '#B91C1C',
    accent: couleurs.accent || '#6D28D9',
  }
  const [edition, setEdition] = useState(!String(valeur || '').trim())
  const [cp, setCp] = useState('')
  const [texteRue, setTexteRue] = useState('')
  const [rue, setRue] = useState(null)            // { id, nom, localite, lat, lng }
  const [numero, setNumero] = useState('')
  const [libre, setLibre] = useState('')
  const [etat, setEtat] = useState('repos')        // repos | cherche | erreur
  const [note, setNote] = useState(null)           // phrase affichée après le choix

  // L'adresse déjà enregistrée peut arriver APRÈS le premier rendu (fiche
  // chargée de la base) : on l'affiche, tant que rien n'a été commencé.
  // Et quand le formulaire appelant se vide (lieu ajouté, champ remis à zéro),
  // le champ repart de zéro lui aussi.
  useEffect(() => {
    if (!String(valeur || '').trim()) {
      setCp(''); setTexteRue(''); setRue(null); setNumero(''); setLibre(''); setNote(null)
      setEdition(true)
      return
    }
    if (!cp && !libre) setEdition(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur])

  const rues = useRuesBest(cp)
  const suggestions = useMemo(
    () => (rues.etat === 'ok' && !rue ? filtrerRues(rues.liste, texteRue, MAX_SUGGESTIONS) : []),
    [rues, texteRue, rue],
  )
  const cpComplet = /^\d{4}$/.test(cp)
  const horsReferentiel = cpComplet && rues.etat === 'ok' && rues.liste.length === 0
  const situee = Number.isFinite(Number(position?.latitude)) && Number.isFinite(Number(position?.longitude))
    && position?.latitude !== null && position?.longitude !== null

  async function utiliser() {
    if (!rue) return
    setEtat('cherche')
    let lat = null, lng = null, approximative = false, num = numero.trim()
    if (num) {
      try {
        const res = await fetch(`/api/adresse/situer?rue=${encodeURIComponent(rue.id)}&cp=${cp}&numero=${encodeURIComponent(num)}`)
        const d = await res.json()
        if (!res.ok || !d?.ok) { setEtat('erreur'); return }
        if (d.trouvee) { lat = d.lat; lng = d.lng; num = d.numero }
      } catch { setEtat('erreur'); return }
    }
    if (lat === null && Number.isFinite(rue.lat) && Number.isFinite(rue.lng)) {
      lat = rue.lat; lng = rue.lng; approximative = true
    }
    const adresse = composerAdresseOfficielle({ rue: rue.nom, numero: num, code_postal: cp, localite: rue.localite })
    setEtat('repos')
    setNote(lat === null
      ? 'Adresse enregistrée, mais sans position sur la carte : cette rue n’en a pas dans la liste officielle.'
      : approximative
        ? (numero.trim() ? 'Ce numéro n’est pas dans la liste officielle : position approximative, au centre de la rue.' : 'Position approximative : le centre de la rue.')
        : null)
    onChoisir?.({ adresse, latitude: lat, longitude: lng, approximative })
    setEdition(false)
  }

  function utiliserLibre() {
    const adresse = libre.trim()
    if (!adresse) return
    setNote('Hors Wallonie : l’adresse est gardée telle quelle, sans position sur la carte.')
    onChoisir?.({ adresse, latitude: null, longitude: null, approximative: false })
    setEdition(false)
  }

  function recommencer() {
    setCp(''); setTexteRue(''); setRue(null); setNumero(''); setLibre(''); setEtat('repos'); setNote(null)
    setEdition(true)
  }

  const petit = { fontSize: 11.5, fontWeight: 600, margin: '6px 0 0', lineHeight: 1.5 }
  const bouton = (actif) => ({
    padding: '9px 14px', borderRadius: 10, border: 'none', fontWeight: 800, fontSize: 13,
    background: actif ? C.accent : '#E5E7EB', color: actif ? '#fff' : C.muted,
    cursor: actif ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif',
  })

  if (!edition) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.deep, display: 'flex', gap: 6, alignItems: 'flex-start', minWidth: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
            <span style={{ overflowWrap: 'anywhere' }}>{valeur}</span>
          </p>
          <button type="button" onClick={recommencer}
            style={{ border: `1.5px solid ${C.hairline}`, background: '#fff', borderRadius: 10, padding: '6px 12px', fontSize: 12.5, fontWeight: 800, color: C.accent, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Changer l&rsquo;adresse
          </button>
        </div>
        <p style={{ ...petit, color: situee ? C.ok : C.muted }}>
          {note || (situee ? 'Position sur la carte : oui.' : 'Pas de position sur la carte pour cette adresse.')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={cp}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4)
            if (v !== cp) { setCp(v); setTexteRue(''); setRue(null); setNumero(''); setLibre('') }
          }}
          inputMode="numeric" placeholder="Code postal" autoComplete="postal-code"
          style={{ ...style, flex: '0 0 38%' }}
        />
        {!horsReferentiel && (
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              value={rue ? rue.nom : texteRue}
              disabled={!cpComplet}
              onChange={e => { setTexteRue(e.target.value); setRue(null) }}
              placeholder={cpComplet ? 'Rue, place…' : 'Rue (code postal d’abord)'}
              autoComplete="off"
              style={{ ...style, width: '100%' }}
            />
            {suggestions.length > 0 && (
              <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, marginTop: 4, boxShadow: '0 8px 24px rgba(22,6,54,0.12)', zIndex: 10, maxHeight: 260, overflowY: 'auto' }}>
                {suggestions.map(r => (
                  <button key={r.id} type="button" role="option" aria-selected="false"
                    onClick={() => { setRue(r); setTexteRue(r.nom) }}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: C.deep }}>
                    {r.nom}{r.localite && <span style={{ color: C.muted }}> · {r.localite}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!horsReferentiel && (
        <input
          value={numero}
          disabled={!rue}
          onChange={e => setNumero(e.target.value.slice(0, 12))}
          placeholder={rue ? 'Numéro (facultatif pour une place)' : 'Numéro (rue d’abord)'}
          autoComplete="off"
          style={{ ...style, marginTop: 8 }}
        />
      )}

      {cpComplet && rues.etat === 'charge' && <p style={{ ...petit, color: C.muted }}>Recherche des rues…</p>}
      {cpComplet && rues.etat === 'erreur' && <p style={{ ...petit, color: C.erreur }}>La recherche d&rsquo;adresse ne répond pas. Réessaie dans un instant.</p>}
      {cpComplet && rues.etat === 'ok' && !horsReferentiel && !rue && texteRue.trim().length >= 3 && suggestions.length === 0 && (
        <p style={{ ...petit, color: C.erreur }}>Aucune rue de ce nom dans ce code postal. Vérifie l&rsquo;orthographe ou le code postal.</p>
      )}

      {horsReferentiel && (libreHorsWallonie ? (
        <>
          <p style={{ ...petit, color: C.muted }}>Ce code postal n&rsquo;est pas en Wallonie : écris l&rsquo;adresse complète. Elle sera gardée telle quelle, sans position sur la carte.</p>
          <input value={libre} onChange={e => setLibre(e.target.value)} placeholder="Rue, numéro, code postal, ville" autoComplete="street-address" style={{ ...style, marginTop: 6 }} />
        </>
      ) : (
        <p style={{ ...petit, color: C.erreur }}>Aucune rue connue pour ce code postal : Yoppaa couvre la Wallonie.</p>
      ))}

      {etat === 'erreur' && <p style={{ ...petit, color: C.erreur }}>La vérification de l&rsquo;adresse ne répond pas. Réessaie dans un instant.</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {horsReferentiel && libreHorsWallonie ? (
          <button type="button" onClick={utiliserLibre} disabled={!libre.trim()} style={bouton(!!libre.trim())}>
            {libelleValider}
          </button>
        ) : (
          <button type="button" onClick={utiliser} disabled={!rue || etat === 'cherche'} style={bouton(!!rue && etat !== 'cherche')}>
            {etat === 'cherche' ? 'Vérification…' : libelleValider}
          </button>
        )}
        {String(valeur || '').trim() && (
          <button type="button" onClick={() => setEdition(false)}
            style={{ padding: '9px 14px', borderRadius: 10, border: `1.5px solid ${C.hairline}`, background: '#fff', color: C.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Annuler
          </button>
        )}
      </div>
    </div>
  )
}
