'use client'
// L'ÉCRAN QUI REMPLACE UNE PAGE PLANTÉE, partagé par app/error.js et
// app/global-error.js (05/10).
//
// Il remplace la page anglaise de Next (« This page couldn't load ») par un
// écran Yoppaa en français, et il MONTRE le message technique : sur un
// téléphone, une capture d'écran est le seul moyen de nous le transmettre.
// Le message ne contient que ce que le code a levé, jamais une donnée saisie.

import { useEffect } from 'react'
import { signalerErreurEcran, resumeErreur } from '@/lib/erreur-ecran'

const T = { main: '#6B35C4', ink: '#1A0840', deep: '#2D0F6B', pale: '#EDE0FF', muted: '#6B7280', bg: '#F7F3FF' }

export default function EcranErreur({ error, retry, ou = 'page' }) {
  useEffect(() => { signalerErreurEcran(error, ou) }, [error, ou])
  const { message } = resumeErreur(error)

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, boxSizing: 'border-box', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 18, padding: '24px 20px', boxShadow: '0 12px 40px rgba(26,8,64,0.12)', boxSizing: 'border-box' }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
        <p style={{ margin: '12px 0 6px', fontSize: '1.1rem', fontWeight: 900, color: T.ink }}>Cet écran n’a pas pu s’afficher</p>
        <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: T.deep, lineHeight: 1.55 }}>
          Ce que tu venais de faire est peut-être bien enregistré. Réessaie, ou reviens à l’accueil.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <button type="button" onClick={() => { try { retry?.() } catch { window.location.reload() } }}
            style={{ flex: 1, minWidth: 130, padding: '0.8rem', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            Réessayer
          </button>
          {/* ⚠️ UN VRAI RECHARGEMENT, pas une navigation interne : l'état de
              l'écran est cassé, on repart d'une page neuve. */}
          <button type="button" onClick={() => window.location.assign('/commander')}
            style={{ flex: 1, minWidth: 130, padding: '0.8rem', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.deep, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', fontFamily: 'inherit' }}>
            Retour à l’accueil
          </button>
        </div>
        <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Détail pour l’équipe Yoppaa</p>
        <p style={{ margin: 0, fontSize: '0.75rem', color: T.muted, background: T.bg, borderRadius: 10, padding: '8px 10px', fontFamily: 'ui-monospace, Menlo, monospace', wordBreak: 'break-word', lineHeight: 1.45 }}>
          {message}{error?.digest ? ` (${error.digest})` : ''}
        </p>
      </div>
    </div>
  )
}
