'use client'
// Les actualités sur la fiche d'un métier à rendez-vous (26/10).
//
// ⚠️ LE MÊME BANDEAU ET LA MÊME MODALE QUE LA FICHE BOUTIQUE : alertes en
// rouge, actus en violet, cliquables quand elles ont une photo ou un texte
// long. Le Yopper qui arrive du Good Morning doit retrouver ici, à
// l'identique, ce qu'il vient de lire.

import { Calendar } from 'lucide-react'

const T = {
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

export function BandeauActus({ actus = [], onOuvrir, style }) {
  if (!actus.length) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }}>
      {actus.map(a => {
        const isAlerte = a.type === 'alerte'
        const enrichie = !!(a.photo_url || a.contenu_long)
        const bg = isAlerte ? 'linear-gradient(135deg, #7F1D1D, #B91C1C)' : `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`
        const contenuInner = (
          <>
            <span style={{ fontSize: 10, fontWeight: 800, color: isAlerte ? '#FCA5A5' : T.light, textTransform: 'uppercase', letterSpacing: '0.7px', flexShrink: 0, background: 'rgba(255,255,255,0.1)', padding: '3px 9px', borderRadius: 100, border: `1px solid ${isAlerte ? 'rgba(252,165,165,0.4)' : 'rgba(196,160,244,0.4)'}` }}>
              {isAlerte ? 'Alerte' : 'Actualité'}
            </span>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.3 }}>{a.titre}</p>
              {a.contenu && <p style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', lineHeight: 1.4 }}>{a.contenu}</p>}
            </div>
            {enrichie && (
              <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', flexShrink: 0, marginLeft: 4 }}>›</span>
            )}
          </>
        )
        const baseStyle = { background: bg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.25)' : '0 4px 16px rgba(22,6,54,0.15)', width: '100%' }
        return enrichie ? (
          <button key={a.id} onClick={() => onOuvrir?.(a)}
            style={{ ...baseStyle, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            {contenuInner}
          </button>
        ) : (
          <div key={a.id} style={baseStyle}>
            {contenuInner}
          </div>
        )
      })}
    </div>
  )
}

// `lienArticle` : l'adresse de l'article que l'actu désigne, SEULEMENT s'il est
// dans le catalogue chargé (le commerçant a pu le retirer depuis). Sans lui,
// aucun bouton : un bouton qui ne mène à rien est pire que pas de bouton.
export function ModaleActu({ actu, onFermer, article = null, lienArticle = null, onVoirArticle }) {
  if (!actu) return null
  const isAlerte = actu.type === 'alerte'
  const headerBg = isAlerte
    ? 'linear-gradient(135deg, #7F1D1D, #B91C1C)'
    : `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`
  return (
    <div onClick={onFermer}
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeUp 0.2s ease' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: '90svh', display: 'flex', flexDirection: 'column' }}>

        {actu.photo_url ? (
          <div style={{ position: 'relative', width: '100%', paddingTop: '58%', background: T.pale, flexShrink: 0 }}>
            <img decoding="async" loading="lazy" src={actu.photo_url} alt={actu.titre}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(22,6,54,0.35) 0%, transparent 30%, transparent 60%, rgba(22,6,54,0.7) 100%)' }}/>
            <div style={{ position: 'absolute', top: 12, left: 12 }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '1.2px', background: isAlerte ? 'rgba(220,38,38,0.9)' : 'rgba(22,6,54,0.65)', padding: '4px 10px', borderRadius: 100 }}>
                {isAlerte ? 'Alerte' : 'Actualité'}
              </span>
            </div>
            <button onClick={onFermer} aria-label="Fermer"
              style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(22,6,54,0.65)', border: 'none', borderRadius: '50%', width: 34, height: 34, color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 20px', color: '#fff' }}>
              <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                {actu.titre}
              </h2>
            </div>
          </div>
        ) : (
          <div style={{ background: headerBg, padding: '20px 22px 24px', color: '#fff', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: '0.62rem', fontWeight: 800, color: isAlerte ? '#FCA5A5' : T.light, textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 100, border: `1px solid ${isAlerte ? 'rgba(252,165,165,0.4)' : 'rgba(255,255,255,0.2)'}` }}>
                {isAlerte ? 'Alerte' : 'Actualité'}
              </span>
              <button onClick={onFermer} aria-label="Fermer"
                style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>
            <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0 }}>
              {actu.titre}
            </h2>
          </div>
        )}

        <div style={{ padding: '18px 22px 22px', overflowY: 'auto', flex: 1 }}>
          {actu.contenu && (
            <p style={{ fontSize: '0.9rem', color: T.ink, lineHeight: 1.55, margin: '0 0 14px', fontWeight: 600 }}>
              {actu.contenu}
            </p>
          )}
          {actu.contenu_long && (
            <div style={{ fontSize: '0.88rem', color: T.deep, lineHeight: 1.65, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>
              {actu.contenu_long}
            </div>
          )}
          {(actu.date_debut || actu.date_fin) && (
            <p style={{ fontSize: '0.78rem', color: T.muted, fontWeight: 600, margin: '0 0 6px' }}>
              <Calendar size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/>
              {actu.date_fin
                ? `Jusqu'au ${new Date(String(actu.date_fin).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}`
                : `Depuis le ${new Date(String(actu.date_debut).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}`
              }
            </p>
          )}
          {article && lienArticle && (
            <a href={lienArticle} onClick={onVoirArticle}
              style={{ width: '100%', marginTop: 14, padding: '0.8rem 1rem', borderRadius: 14, border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left', textDecoration: 'none', boxSizing: 'border-box' }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Voir&nbsp;: {article.nom}
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M9 6l6 6-6 6"/>
              </svg>
            </a>
          )}

          <button onClick={onFermer}
            style={{ width: '100%', marginTop: 10, padding: '0.875rem', border: 'none', borderRadius: 100, background: isAlerte ? 'linear-gradient(135deg, #DC2626, #B91C1C)' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.55)' : `0 4px 16px ${T.main}55` }}>
            Compris
          </button>
        </div>
      </div>
    </div>
  )
}
