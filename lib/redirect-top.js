// Helper : redirige la fenêtre TOP vers une URL externe, depuis n'importe
// quel contexte (top frame ou iframe MobileFrame).
//
// Cas iframe MobileFrame (PC desktop) :
//   - window.top.location.href = url       lève une DOMException cross-origin
//                                          (Chrome strict même avec allow-same-origin)
//   - <a target="_top"> cliqué             OK avec sandbox allow-top-navigation-by-user-activation
//
// Cas mobile / top frame normal : window.top === window → assignment direct OK.
//
// Doit être appelé DANS un handler d'événement user (clic, tap) pour que le browser
// considère qu'il y a une user activation. Sinon le sandbox bloque la navigation.

export function redirectTop(url) {
  if (typeof window === 'undefined' || !url) return
  if (window.top === window) {
    window.location.href = url
    return
  }
  // Pattern natif : <a target="_top">. Bypass le problème cross-origin du
  // window.top.location.href, et reste compatible avec le sandbox iframe.
  const a = document.createElement('a')
  a.href = url
  a.target = '_top'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
