'use client'
// GARDER SON TABLEAU DE BORD SOUS LA MAIN (30/09 au soir, Alex : « utile dans
// le tableau de bord aussi »). Les règles vivent dans lib/aide-installation.js.
//
// ⚠️ RIEN AU RENDU SERVEUR : on ne sait pas encore si le tableau de bord est
// ouvert depuis l'icône installée, et un encadré qui apparaît puis disparaît à
// chaque chargement serait pire que pas d'encadré.
// ⚠️ LE RANGEMENT EST UN CONFORT D'APPAREIL : `localStorage`, lu et écrit sous
// `try`. S'il est illisible (navigation privée), l'encadré reste simplement
// rangeable pour la séance.

import { useEffect, useState } from 'react'
import { estDansLApp } from '@/lib/retour-app'
import { estAppNative } from '@/lib/push-natif'
import { appareilDe, aideAMontrer, gesteInstallation, CLE_AIDE_RANGEE } from '@/lib/aide-installation'

const T = { ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280' }

function lireRangee() {
  try { return window.localStorage.getItem(CLE_AIDE_RANGEE) === '1' } catch { return false }
}

export default function AideInstallation() {
  const [etat, setEtat] = useState(null)          // null = pas encore su
  const [invite, setInvite] = useState(null)      // l'événement `beforeinstallprompt`

  useEffect(() => {
    const montrer = aideAMontrer({
      installee: estDansLApp() === true,
      native: estAppNative(window),
      rangee: lireRangee(),
    })
    setEtat(montrer
      ? { visible: true, appareil: appareilDe({ userAgent: navigator.userAgent, pointsTactiles: navigator.maxTouchPoints }) }
      : { visible: false })
    // Chrome propose l'installation : on garde l'événement pour un vrai bouton.
    const surInvite = (e) => { e.preventDefault(); setInvite(e) }
    const surInstallee = () => setEtat({ visible: false })
    window.addEventListener('beforeinstallprompt', surInvite)
    window.addEventListener('appinstalled', surInstallee)
    return () => {
      window.removeEventListener('beforeinstallprompt', surInvite)
      window.removeEventListener('appinstalled', surInstallee)
    }
  }, [])

  if (!etat?.visible) return null

  function ranger() {
    try { window.localStorage.setItem(CLE_AIDE_RANGEE, '1') } catch { /* confort d'appareil */ }
    setEtat({ visible: false })
  }
  async function installer() {
    if (!invite) return
    try {
      await invite.prompt()
      const choix = await invite.userChoice
      if (choix?.outcome === 'accepted') setEtat({ visible: false })
    } catch { /* le navigateur a refusé : l'encadré reste, avec son texte */ }
    setInvite(null)
  }

  const geste = gesteInstallation(etat.appareil, { installable: !!invite })
  return (
    <div role="note" style={{ background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 14, padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <img decoding="async" loading="lazy" src="/icon-pro-192.png" alt="" width={36} height={36} style={{ borderRadius: 9, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: T.ink }}>Garde ton tableau de bord sous la main</p>
        <p style={{ margin: '3px 0 0', fontSize: 12.5, lineHeight: 1.5, color: T.deep }}>
          Ce n&rsquo;est pas une app à télécharger dans les stores : {geste.texte}
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {geste.bouton && (
            <button type="button" onClick={installer}
              style={{ padding: '7px 14px', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {geste.bouton}
            </button>
          )}
          <button type="button" onClick={ranger}
            style={{ padding: '7px 12px', borderRadius: 100, border: `1px solid ${T.pale}`, background: '#fff', color: T.muted, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Plus tard
          </button>
        </div>
      </div>
    </div>
  )
}
