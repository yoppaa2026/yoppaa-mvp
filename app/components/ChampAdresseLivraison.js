'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { filtrerRues } from '@/lib/best-adresse'
import { useRuesBest } from './useRuesBest'

// LA SAISIE D'UNE ADRESSE DE LIVRAISON, DANS LE RÉFÉRENTIEL OFFICIEL.
//
// POURQUOI (chantier zone, 05/10). Pour décider si un commerce livre chez le
// client, il faut savoir OÙ il habite, et pas seulement le code postal qu'il
// déclare (audit I1). L'ancien champ demandait des suggestions à Nominatim
// depuis le navigateur, à chaque frappe : usage interdit par leur politique, et
// rien ne garantissait que l'adresse existe.
//
// Trois temps, dans l'ordre où l'on écrit une adresse belge à l'envers :
//   1. le CODE POSTAL : l'écran reçoit en une fois la liste de ses rues ;
//   2. la RUE, choisie dans cette liste (filtrée sur place pendant qu'on tape) ;
//   3. le NUMÉRO, vérifié auprès du serveur : la maison existe, ou pas.
//
// Décision d'Alex (05/10, règle B) : une maison absente du référentiel ne se
// livre pas. L'écran le dit tout de suite, propose le retrait et d'appeler le
// commerce, au lieu de laisser le client le découvrir au paiement.
//
// ⚠️ L'ÉCRAN INFORME, LE SERVEUR DÉCIDE : `create-commande` refait la recherche
// et ne lit jamais la position envoyée par le navigateur.
//
// `valeur` : { code_postal, rue_id, rue_nom, numero, situee, ville }
//   situee : true (maison trouvée), false (introuvable), null (pas encore vérifiée)
// `onChange(patch)` : ce qui change, à fusionner par l'appelant.

const MAX_SUGGESTIONS = 8

export default function ChampAdresseLivraison({ valeur, onChange, style, couleurs = {}, telephoneCommerce = null, pourCommercant = false }) {
  const C = {
    hairline: couleurs.hairline || '#E7E3F5',
    deep: couleurs.deep || '#2D0F6B',
    muted: couleurs.muted || '#6B7280',
    ok: couleurs.ok || '#059669',
    erreur: couleurs.erreur || '#DC2626',
  }
  const cp = valeur?.code_postal || ''
  // Les rues du code postal : une requête par code postal (hook partagé).
  const rues = useRuesBest(cp)
  const [texteRue, setTexteRue] = useState(valeur?.rue_nom || '')
  const [ouvert, setOuvert] = useState(false)
  const [verif, setVerif] = useState('repos')   // repos | cherche | erreur
  const minuteur = useRef(null)

  // Une adresse mémorisée arrive APRÈS le premier rendu (lue dans le stockage
  // du navigateur) : le texte de la rue doit la suivre.
  useEffect(() => {
    if (valeur?.rue_id && valeur?.rue_nom) setTexteRue(valeur.rue_nom)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur?.rue_id])

  // 2. Les suggestions : la même règle que le champ des commerçants.
  const suggestions = useMemo(
    () => (rues.etat === 'ok' ? filtrerRues(rues.liste, texteRue, MAX_SUGGESTIONS) : []),
    [texteRue, rues],
  )

  // 3. Le numéro, vérifié quand la frappe s'arrête. Aussi au retour d'une
  // adresse mémorisée : `situee` vaut alors null, on revérifie.
  const rueId = valeur?.rue_id || null
  const numero = (valeur?.numero || '').trim()
  useEffect(() => {
    clearTimeout(minuteur.current)
    if (!rueId || !numero || !/^\d{4}$/.test(cp)) return
    if (valeur?.situee === true || valeur?.situee === false) return
    setVerif('cherche')
    minuteur.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/adresse/situer?rue=${encodeURIComponent(rueId)}&cp=${cp}&numero=${encodeURIComponent(numero)}`)
        const d = await res.json()
        if (!res.ok || !d?.ok) { setVerif('erreur'); return }
        setVerif('repos')
        onChange(d.trouvee
          ? { situee: true, ville: d.localite || valeur?.ville || '', lat: d.lat, lng: d.lng, estimee: !!d.estimee }
          : { situee: false, lat: null, lng: null, estimee: false })
      } catch { setVerif('erreur') }
    }, 450)
    return () => clearTimeout(minuteur.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rueId, numero, cp, valeur?.situee])

  function choisirRue(r) {
    setTexteRue(r.nom)
    setOuvert(false)
    onChange({ rue_id: r.id, rue_nom: r.nom, ville: r.localite || '', situee: null, lat: null, lng: null })
  }

  const etiquette = { fontSize: '0.78rem', fontWeight: 700, margin: '2px 0 0' }
  const cpComplet = /^\d{4}$/.test(cp)

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={cp}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 4)
            if (v !== cp) {
              setTexteRue('')
              onChange({ code_postal: v, rue_id: null, rue_nom: '', ville: '', situee: null, lat: null, lng: null })
            }
          }}
          inputMode="numeric" placeholder="Code postal" autoComplete="postal-code"
          style={{ ...style, flex: '0 0 40%' }}
        />
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            value={texteRue}
            disabled={!cpComplet}
            onChange={e => {
              setTexteRue(e.target.value)
              setOuvert(true)
              if (rueId) onChange({ rue_id: null, rue_nom: '', situee: null, lat: null, lng: null })
            }}
            onFocus={() => setOuvert(true)}
            placeholder={cpComplet ? 'Rue' : 'Rue (code postal d’abord)'}
            autoComplete="off"
            style={{ ...style, width: '100%' }}
          />
          {ouvert && suggestions.length > 0 && !rueId && (
            <div role="listbox" style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${C.hairline}`, borderRadius: 12, marginTop: 4, boxShadow: '0 8px 24px rgba(22,6,54,0.12)', zIndex: 10, maxHeight: 260, overflowY: 'auto' }}>
              {suggestions.map(r => (
                <button key={r.id} type="button" role="option" aria-selected="false" onClick={() => choisirRue(r)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', borderBottom: `1px solid ${C.hairline}`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 13, color: C.deep }}>
                  {r.nom}
                  {r.localite && <span style={{ color: C.muted }}> · {r.localite}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <input
        value={valeur?.numero || ''}
        disabled={!rueId}
        onChange={e => onChange({ numero: e.target.value.slice(0, 12), situee: null, lat: null, lng: null })}
        placeholder={rueId ? 'Numéro' : 'Numéro (rue d’abord)'}
        autoComplete="off"
        style={style}
      />

      {cpComplet && rues.etat === 'charge' && (
        <p style={{ ...etiquette, color: C.muted }}>Recherche des rues…</p>
      )}
      {cpComplet && rues.etat === 'ok' && rues.liste.length === 0 && (
        <p style={{ ...etiquette, color: C.erreur }}>Aucune rue connue pour ce code postal. La livraison ne couvre que la Wallonie.</p>
      )}
      {cpComplet && rues.etat === 'erreur' && (
        <p style={{ ...etiquette, color: C.erreur }}>La recherche d&rsquo;adresse ne répond pas. Réessaie dans un instant.</p>
      )}
      {cpComplet && rues.etat === 'ok' && !rueId && texteRue.trim().length >= 3 && suggestions.length === 0 && (
        <p style={{ ...etiquette, color: C.erreur }}>Aucune rue de ce nom dans ce code postal. Vérifie l&rsquo;orthographe ou le code postal.</p>
      )}
      {rueId && numero && verif === 'cherche' && valeur?.situee == null && (
        <p style={{ ...etiquette, color: C.muted }}>Vérification de l&rsquo;adresse…</p>
      )}
      {verif === 'erreur' && (
        <p style={{ ...etiquette, color: C.erreur }}>La vérification de l&rsquo;adresse ne répond pas. Réessaie dans un instant.</p>
      )}
      {valeur?.situee === true && (
        <p style={{ ...etiquette, color: C.ok, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          Adresse trouvée{valeur?.ville ? ` · ${valeur.ville}` : ''}
        </p>
      )}
      {/* ⚠️ LE COMMERÇANT QUI ENCODE (10/10) n'est pas refusé : il connaît son
          client, la commande se livre, elle n'aura juste pas de place sur la
          tournée. Il ne lit pas « appelle le commerce ». */}
      {valeur?.situee === false && pourCommercant && (
        <p style={{ ...etiquette, color: C.erreur }}>
          Adresse absente de la liste officielle : note-la en entier juste en dessous. Elle sera livrée, mais sans position sur ta tournée.
        </p>
      )}
      {valeur?.situee === false && !pourCommercant && (
        <p style={{ ...etiquette, color: C.erreur }}>
          Cette adresse n&rsquo;est pas dans la liste officielle des adresses, la livraison n&rsquo;est donc pas possible.
          Choisis le retrait{telephoneCommerce ? <>, ou appelle le commerce au <a href={`tel:${telephoneCommerce}`} style={{ color: C.erreur }}>{telephoneCommerce}</a></> : ', ou appelle le commerce'}.
        </p>
      )}
    </>
  )
}
