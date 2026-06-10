'use client'
// ════════════════════════════════════════════════════════════════════
// MobileFrame — wrapper qui simule un "device" mobile sur écran desktop.
//
// Sur écran < 1024px : passthrough (rien ne change, mobile/tablette normal).
// Sur écran >= 1024px : affiche le contenu de l'app dans un "device frame"
//   centré, avec fond violet dégradé + effets glow + wordmark coin bas.
//   Effet "showcase Apple Keynote" pour les présentations.
//
// Utilisé pour la démo conseil communal Mettet 15/06 où Alex présentera
// l'app projetée sur grand écran. Sans ça, le contenu mobile (max 600px)
// flotte tristement au milieu d'une fenêtre 1920x1080 vide.
//
// Pas de cadre iPhone réaliste (trop de risques avec position fixed des
// modals + bottom nav). On utilise un "device frame" simplifié : wrapper
// maxWidth + bord arrondi + ombre élégante.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'

export default function MobileFrame({ children }) {
  const [isDesktop, setIsDesktop] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // SSR / mobile : rendu transparent
  if (!mounted || !isDesktop) return <>{children}</>

  return (
    <>
      {/* Background dégradé violet fixed derrière tout
          pointerEvents: none = laisse passer le scroll wheel par-dessus
          (sinon le scroll bloque quand la souris est sur le background) */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(135deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)',
        zIndex: -10,
        pointerEvents: 'none',
      }}/>

      {/* Effets glow décoratifs */}
      <div style={{
        position: 'fixed',
        top: '15%', right: '12%',
        width: 600, height: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(150,96,224,0.35) 0%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        zIndex: -9,
      }}/>
      <div style={{
        position: 'fixed',
        bottom: '15%', left: '12%',
        width: 500, height: 500,
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(196,160,244,0.25) 0%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        zIndex: -9,
      }}/>

      {/* Wordmark + tagline coin bas-droit pour la signature */}
      <div style={{
        position: 'fixed',
        bottom: 28, right: 32,
        zIndex: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
        pointerEvents: 'none',
      }}>
        <p style={{
          margin: 0,
          fontSize: 26, fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1,
          fontFamily: '"DM Sans", -apple-system, sans-serif',
        }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: '#C4A0F4' }}>pp</span>
          <span style={{ color: '#9660E0' }}>aa</span>
        </p>
        <p style={{
          margin: 0,
          fontSize: 10, fontWeight: 700, color: 'rgba(196,160,244,0.75)',
          letterSpacing: '1.5px', textTransform: 'uppercase',
          fontFamily: '"DM Sans", -apple-system, sans-serif',
        }}>
          L&rsquo;app des commerces de quartier
        </p>
      </div>

      {/* Conteneur "device" mobile centré.
          maxWidth = 480 simule une grosse phablette ; le contenu garde sa
          mise en page mobile normale.
          margin auto centre horizontalement.
          Background blanc + bord arrondi + ombre élégante = look "device". */}
      <div className="yp-mobile-frame" style={{
        position: 'relative',
        maxWidth: 600,
        margin: '24px auto',
        background: '#fff',                       // contenu blanc directement
        border: '13px solid #1a1a1a',             // épaisseur du cadre noir
        borderRadius: 60,                         // courbure iPhone moderne
        boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(196,160,244,0.2), 0 0 100px rgba(150,96,244,0.35)',
        zIndex: 1,
        // PAS de minHeight ni d'overflow : le cadre s'etire avec le contenu,
        // le scroll wheel passe normalement, pas de blocage.
      }}>
        {/* Encoche / Dynamic Island en haut centrée (style iPhone moderne) */}
        <div style={{
          position: 'absolute',
          top: -3, left: '50%', transform: 'translateX(-50%)',
          width: 130, height: 28,
          background: '#0a0a0a',
          borderRadius: '0 0 22px 22px',
          zIndex: 100,
          boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
        }}/>
        {children}
      </div>

      {/* CSS global : force 1 colonne pour les grids 2 cols a l'interieur du
          mobile frame. Sur ecran >= 1024px, les cards qui sont en grid
          repeat(2, ...) deviennent etroites (300px) car la frame fait 600px.
          On force grid-template-columns: 1fr pour avoir 1 colonne pleine
          largeur, beaucoup plus lisible. */}
      <style jsx global>{`
        @media (min-width: 1024px) {
          .yp-mobile-frame [style*="repeat(2"],
          .yp-mobile-frame [style*="grid-template-columns:repeat(2"],
          .yp-mobile-frame .grid-2col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </>
  )
}
