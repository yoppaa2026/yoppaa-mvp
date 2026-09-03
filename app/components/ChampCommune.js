'use client'
// LE CHOIX DE LA COMMUNE — la liste reste, un champ la rétrécit.
//
// 🔴 CE QU'IL REMPLACE. Une liste déroulante `<select>` contenant toute la
// Wallonie, soit 260 entrées. Sur un téléphone, une liste de 260 entrées ne se
// parcourt pas : elle se subit. Et c'était le tout premier geste demandé à un
// Yopper qui venait de se connecter.
//
// ⚠️ LA LISTE N'EST PAS REMPLACÉE, ELLE EST FILTRÉE (Alex, 03/09). Tant que
// rien n'est tapé, elles sont toutes là : celui qui préfère dérouler déroule.
// Le champ est un raccourci par-dessus, jamais un péage.
//
// ⚠️ LE CHAMP EST UNE RECHERCHE, PAS LA VALEUR. C'est le piège de ce genre
// d'écran : on croit que ce qui est écrit est ce qui sera enregistré. Ici non,
// et l'écran doit donc TOUJOURS montrer ce qui est réellement retenu, même
// quand la recherche en cours ne l'affiche plus. D'où la ligne du bas, qui ne
// disparaît jamais une fois qu'une commune est choisie.
//
// La règle de correspondance vit dans `lib/recherche-commune.js`, où elle est
// mesurable au banc. Ici, il n'y a que la mise en forme.

import { useState, useMemo } from 'react'
import { filtrerCommunes } from '@/lib/recherche-commune'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  pale: '#EDE0FF', hairline: '#F0EBF8', muted: '#6B7280', bgPage: '#F5F3FA',
}

function IconLoupe({ size = 16, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
    </svg>
  )
}

export default function ChampCommune({ communes = [], valeurId = null, onChoisir }) {
  const [requete, setRequete] = useState('')

  const resultats = useMemo(() => filtrerCommunes(communes, requete), [communes, requete])
  const retenue = useMemo(() => communes.find(c => c?.id === valeurId) || null, [communes, valeurId])
  const cherche = requete.trim() !== ''

  return (
    <div>
      <label htmlFor="champ-commune" style={{ fontSize: 11, fontWeight: 700, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
        Commune
      </label>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${T.hairline}`, background: '#fff', boxSizing: 'border-box', marginBottom: 8 }}>
        <IconLoupe color={cherche ? T.main : T.muted}/>
        <input
          id="champ-commune"
          value={requete}
          onChange={e => setRequete(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Cherche ta commune ou ton code postal"
          style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 15, fontFamily: 'inherit', color: T.ink, background: 'transparent', padding: 0 }}
        />
        {cherche && (
          <button type="button" onClick={() => setRequete('')} aria-label="Effacer la recherche"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%', border: 'none', background: T.bgPage, color: T.muted, cursor: 'pointer', padding: 0, flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      <div style={{ border: `1px solid ${T.hairline}`, borderRadius: 12, overflow: 'hidden', maxHeight: 260, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {resultats.length === 0 ? (
          <p style={{ fontSize: 13, color: T.muted, margin: 0, padding: '14px', lineHeight: 1.5 }}>
            Aucune commune ne correspond. Essaie autrement, ou avec ton code postal.
          </p>
        ) : resultats.map(c => {
          const active = c.id === valeurId
          return (
            <button key={c.id} type="button" onClick={() => onChoisir?.(c)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '11px 14px', border: 'none', borderBottom: `1px solid ${T.hairline}`, background: active ? T.pale : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              <span style={{ width: 16, flexShrink: 0, display: 'inline-flex' }}>
                {active && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12l5 5L20 7"/>
                  </svg>
                )}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 800 : 700, color: active ? T.main : T.ink }}>{c.nom}</span>
              {c.province && (
                <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{c.province}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ⚠️ ON DIT COMBIEN IL EN RESTE. Sans ce compte, celui qui a tapé trois
          lettres ne sait pas s'il regarde tout ou seulement le haut d'une liste
          qui continue sous son pouce. */}
      {cherche && resultats.length > 0 && (
        <p style={{ fontSize: 12, color: T.muted, margin: '8px 2px 0', lineHeight: 1.5 }}>
          {resultats.length === 1 ? '1 commune correspond' : `${resultats.length} communes correspondent`}
        </p>
      )}

      {/* Ce qui est RETENU, toujours visible, même quand la recherche en cours
          ne l'affiche plus. */}
      {retenue && (
        <p style={{ fontSize: 12.5, color: T.deep, margin: '8px 2px 0', lineHeight: 1.5 }}>
          Commune retenue : <strong>{retenue.nom}</strong>
          {retenue.province ? ` (${retenue.province})` : ''}
        </p>
      )}
    </div>
  )
}
