// Helper : redirige la fenêtre TOP vers une URL externe, depuis n'importe
// quel contexte, dans une iframe ou non.
//
// ⚠️ IL RESTE UTILE MÊME SANS LE CADRE TÉLÉPHONE. Celui-ci a été retiré le
// 09/08, mais les slides de démonstration (`/demo-mettet/slides`) embarquent
// toujours l'application dans une iframe, et un paiement lancé depuis là doit
// sortir du cadre. Sur l'application elle-même, `window.top === window` : on
// retombe simplement sur l'affectation directe.
//
// Cas iframe :
//   - window.top.location.href = url       lève une DOMException cross-origin
//                                          (Chrome strict même avec allow-same-origin)
//   - <a target="_top"> cliqué             OK avec sandbox allow-top-navigation-by-user-activation
//
// Cas normal : window.top === window → affectation directe.
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
