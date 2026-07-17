// Carte de partage Open Graph (1200x630) générée dynamiquement.
// Remplace le logo Vercel par défaut lors des partages (iMessage, WhatsApp, FB...).
// Convention Next app router : ce fichier renseigne automatiquement og:image +
// twitter:image pour la home. Rendu via next/og (Satori) : layout flex uniquement.

import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Yoppaa — Quelque chose se prépare dans ton quartier'

export default function OpengraphImage() {
  const dots = ['#FFFFFF', '#C4A0F4', '#9660E0', '#C4A0F4', '#9660E0']
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #160636 0%, #2D0F6B 58%, #1A0840 100%)',
          fontFamily: 'sans-serif',
          padding: 64,
        }}
      >
        {/* Wordmark */}
        <div style={{ display: 'flex', fontSize: 156, fontWeight: 800, letterSpacing: -7, lineHeight: 1 }}>
          <span style={{ color: '#FFFFFF' }}>yopp</span>
          <span style={{ color: '#C4A0F4' }}>aa</span>
        </div>

        {/* Dots V2-B */}
        <div style={{ display: 'flex', marginTop: 30 }}>
          {dots.map((c, i) => (
            <div key={i} style={{ display: 'flex', width: 34, height: 34, borderRadius: 999, background: c, marginLeft: i === 0 ? 0 : 22 }} />
          ))}
        </div>

        {/* Accroche */}
        <div style={{ marginTop: 58, fontSize: 48, fontWeight: 700, color: '#FFFFFF', textAlign: 'center', width: 940, lineHeight: 1.22 }}>
          Quelque chose se prépare dans ton quartier
        </div>

        {/* Date */}
        <div style={{ marginTop: 26, fontSize: 30, fontWeight: 600, color: '#C4A0F4' }}>
          Le grand dévoilement · 1er août 2026
        </div>
      </div>
    ),
    { ...size }
  )
}
