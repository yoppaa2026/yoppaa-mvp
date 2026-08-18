'use client'
// « Mon commerce en images » : le carrousel de photos d'une fiche.
//
// Depuis le 05/08, le haut de fiche est une bannière standard pour tout le
// monde : les photos vivent donc TOUTES ici, y compris celle qui servait de
// couverture. Elles y gagnent, une photo rognée en bandeau de 180 pixels ne se
// regarde pas, une vignette qu'on fait défiler oui.
//
// Le titre était « La maison en images », qui ne veut rien dire pour un salon,
// un food truck ou un artisan (Alex, 05/08).

const T = {
  muted: '#6B7280',
  pale:  '#EDE0FF',
  deep:  '#2D0F6B',
}

export default function GalerieCommerce({ photos = [], nomCommerce = '', titre = 'Mon commerce en images' }) {
  const liste = (photos || []).filter(p => p?.url)
  if (liste.length === 0) return null

  return (
    <div style={{ marginTop: 18, paddingLeft: 12 }}>
      <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8, paddingRight: 12 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2"/>
          <circle cx="12" cy="12" r="3.5"/>
          <path d="M8 5l1.5-2h5L16 5"/>
        </svg>
        {titre}
      </p>
      {/* `data-scroll-x` : sur PC, globals.css rend la barre de défilement à
          partir de 1024 px. Sans elle, rien n'indiquait à la souris qu'il y
          avait d'autres photos à droite. */}
      <div data-scroll-x style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, paddingRight: 12, scrollbarWidth: 'none' }}>
        {liste.map((p, i) => (
          <figure key={p.id || i} style={{ flexShrink: 0, width: 200, margin: 0 }}>
            <div style={{ width: 200, height: 140, borderRadius: 14, overflow: 'hidden', boxShadow: '0 4px 16px rgba(22,6,54,0.12)', border: `1px solid ${T.pale}` }}>
              <img decoding="async" src={p.url} alt={p.legende || `${nomCommerce}, photo ${i + 1}`} loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            </div>
            {p.legende && (
              <figcaption style={{ fontSize: '0.68rem', color: T.deep, fontWeight: 600, margin: '5px 2px 0', lineHeight: 1.35 }}>
                {p.legende}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  )
}
