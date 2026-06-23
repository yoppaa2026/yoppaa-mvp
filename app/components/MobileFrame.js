'use client'
// ════════════════════════════════════════════════════════════════════
// MobileFrame — wrapper qui simule un device mobile sur écran desktop.
//
// Approche : iframe. Sur desktop, on charge la même URL dans un iframe
// de largeur 393px (iPhone 15 Pro). Le contenu pense être sur mobile
// (viewport 393), donc :
//   - Les media queries internes basculent en mode mobile (1 col)
//   - Le scroll est natif iframe (fluide partout)
//   - Les modals position:fixed sont relatives à l'iframe viewport
//   - Le bottom nav reste dans le cadre
//
// Le param ?frame=1 dans l'URL de l'iframe empêche le wrapping récursif
// (sinon l'iframe recharge MobileFrame qui recharge un iframe...).
//
// Sur mobile/tablette (<1024px) ou dans l'iframe : passthrough total.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'

export default function MobileFrame({ children }) {
  const [mounted, setMounted] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [insideFrame, setInsideFrame] = useState(false)
  const [iframeUrl, setIframeUrl] = useState('')

  useEffect(() => {
    setMounted(true)

    // Détecte si on est déjà dans l'iframe (param frame=1)
    const params = new URLSearchParams(window.location.search)
    const inIframe = params.get('frame') === '1' || window.self !== window.top
    setInsideFrame(inIframe)

    // Build l'URL de l'iframe : même pathname + same params + frame=1
    if (!inIframe) {
      const newParams = new URLSearchParams(window.location.search)
      newParams.set('frame', '1')
      setIframeUrl(`${window.location.pathname}?${newParams.toString()}`)
    }

    // Détection desktop
    const mq = window.matchMedia('(min-width: 1024px)')
    setIsDesktop(mq.matches)
    const handler = (e) => setIsDesktop(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // SSR / mobile / dans l'iframe : rendu transparent
  if (!mounted || !isDesktop || insideFrame) return <>{children}</>

  // Dimensions iPhone 15 Pro (interior screen) — utilisées pour l'iframe
  const PHONE_W = 393
  const PHONE_H = 852
  const FRAME_THICK = 13

  return (
    <>
      {/* Background dégradé violet fixed */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(135deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)',
        zIndex: -10, pointerEvents: 'none',
      }}/>

      {/* Glows décoratifs */}
      <div style={{
        position: 'fixed', top: '15%', right: '12%',
        width: 600, height: 600, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(150,96,224,0.35) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: -9,
      }}/>
      <div style={{
        position: 'fixed', bottom: '15%', left: '12%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(196,160,244,0.25) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none', zIndex: -9,
      }}/>

      {/* Wordmark coin bas-droit */}
      <div style={{
        position: 'fixed', bottom: 28, right: 32, zIndex: 100,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
        pointerEvents: 'none',
      }}>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: '-0.05em', lineHeight: 1, fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif' }}>
          <span style={{ color: '#fff' }}>yo</span>
          <span style={{ color: '#C4A0F4' }}>pp</span>
          <span style={{ color: '#9660E0' }}>aa</span>
        </p>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'rgba(196,160,244,0.85)', letterSpacing: '0.012em', fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif' }}>
          Ton quartier dans ta poche
        </p>
      </div>

      {/* Cadre iPhone centré avec iframe à l'intérieur */}
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        boxSizing: 'border-box',
      }}>
        <div style={{
          position: 'relative',
          width: PHONE_W + FRAME_THICK * 2,
          height: PHONE_H + FRAME_THICK * 2,
          maxHeight: 'calc(100vh - 64px)',
          background: '#1a1a1a',
          borderRadius: 60,
          padding: FRAME_THICK,
          boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(196,160,244,0.2), 0 0 100px rgba(150,96,244,0.4)',
          boxSizing: 'border-box',
        }}>
          {/* Encoche / Dynamic Island */}
          <div style={{
            position: 'absolute',
            top: 1, left: '50%', transform: 'translateX(-50%)',
            width: 130, height: 28,
            background: '#0a0a0a',
            borderRadius: '0 0 22px 22px',
            zIndex: 100,
            boxShadow: '0 1px 3px rgba(0,0,0,0.6)',
          }}/>

          {/* Iframe avec le contenu mobile
              sandbox isole l'historique iframe du parent : sans ça, un bouton "Retour"
              dans l'app fait reculer la page parent au lieu de naviguer dans l'iframe */}
          {iframeUrl && (
            <iframe
              src={iframeUrl}
              title="Aperçu mobile Yoppaa"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: 47,
                background: '#fff',
                display: 'block',
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}
