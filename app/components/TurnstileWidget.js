'use client'
// Widget Cloudflare Turnstile réutilisable (invisible) pour les formulaires d'auth.
//
// Usage :
//   const turnstileRef = useRef(null)
//   ...
//   const captchaToken = await turnstileRef.current?.getToken()
//   await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } })
//   ...
//   <TurnstileWidget ref={turnstileRef} />
//
// - getToken() renvoie un token FRAIS à chaque appel (le token Turnstile est
//   single-use : Supabase le consomme à la vérification). En interne on consomme
//   le token courant puis on reset() le widget pour régénérer le suivant. Pour un
//   double appel (signUp + auto-login), appeler getToken() deux fois suffit.
// - Si NEXT_PUBLIC_TURNSTILE_SITE_KEY est absente (dev local), getToken() renvoie
//   null : quand le Captcha Supabase est désactivé, un token null/absent est ignoré,
//   donc rien ne casse en dev.
// - Le mode (invisible / managed) est déterminé par la config de la site key côté
//   Cloudflare (la même que la landing = invisible). On ne force pas la taille ici.

import Script from 'next/script'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

const TurnstileWidget = forwardRef(function TurnstileWidget(_props, ref) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)
  const tokenRef = useRef(null)
  const waitersRef = useRef([])

  // Rend le widget une seule fois, quand le script Turnstile est chargé.
  const ensureRendered = useCallback(() => {
    if (widgetIdRef.current != null) return
    if (typeof window === 'undefined' || !window.turnstile || !containerRef.current || !SITE_KEY) return
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token) => {
        tokenRef.current = token
        waitersRef.current.forEach((resolve) => resolve(token))
        waitersRef.current = []
      },
      'error-callback': () => {
        tokenRef.current = null
        waitersRef.current.forEach((resolve) => resolve(null))
        waitersRef.current = []
      },
      'expired-callback': () => { tokenRef.current = null },
    })
  }, [])

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!SITE_KEY) return null
      ensureRendered()
      if (widgetIdRef.current == null) return null

      // Token déjà prêt : on le consomme et on relance un challenge pour le suivant.
      if (tokenRef.current) {
        const token = tokenRef.current
        tokenRef.current = null
        try { window.turnstile.reset(widgetIdRef.current) } catch { /* noop */ }
        return token
      }

      // Pas encore de token (challenge en cours) : on attend le prochain callback,
      // avec un garde-fou de 8s pour ne jamais bloquer la soumission indéfiniment.
      return new Promise((resolve) => {
        let done = false
        const settle = (v) => { if (!done) { done = true; resolve(v) } }
        waitersRef.current.push(settle)
        setTimeout(() => settle(tokenRef.current || null), 8000)
      })
    },
  }), [ensureRendered])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        onLoad={ensureRendered}
      />
      <div ref={containerRef} />
    </>
  )
})

export default TurnstileWidget
