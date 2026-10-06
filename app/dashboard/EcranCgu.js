'use client'

// L'ÉCRAN QUI FAIT ACCEPTER LES CGU AUX COMMERÇANTS DÉJÀ INSCRITS (06/10).
//
// 🔴 PERSONNE NE LES AVAIT ACCEPTÉES : ni case ni trace. Les nouveaux inscrits
// cochent à l'inscription ; ceux qui étaient là avant les acceptent ici, une
// fois, à leur prochaine connexion (décision d'Alex, tableau). Même chose à
// chaque nouvelle version (`CGU_COMMERCANT_VERSION`).
//
// ⚠️ C'EST LE SERVEUR QUI ENREGISTRE (`/api/commercant/accepter-cgu`), avec son
// heure. L'écran n'écrit rien en base lui-même.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import DotsAttente from '@/app/components/DotsAttente'
import { CGU_COMMERCANT_VERSION, LIEN_CGU_COMMERCANT } from '@/lib/cgu'

const T = { bg: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', deep: '#2D0F6B', muted: '#6B7280', pale: '#EDE0FF' }

export default function EcranCgu({ commercant, onAccepte, onDeconnexion }) {
  const [coche, setCoche] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function accepter() {
    if (!coche || enCours) return
    setEnCours(true); setErreur(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/commercant/accepter-cgu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ commercant_id: commercant.id, version: CGU_COMMERCANT_VERSION }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.ok) {
        setErreur(j?.error || 'L’acceptation n’a pas pu être enregistrée. Réessaie.')
        setEnCours(false)
        return
      }
      onAccepte?.({ cgu_version: j.version, cgu_acceptees_at: j.acceptees_at })
    } catch {
      setErreur('L’acceptation n’a pas pu être enregistrée. Vérifie ta connexion et réessaie.')
      setEnCours(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem', fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '1.75rem 1.5rem', maxWidth: 520, width: '100%', border: `1.5px solid ${T.pale}`, boxShadow: `0 8px 32px ${T.main}18` }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.4px', margin: '0 0 8px' }}>
          Nos conditions d’utilisation
        </h1>
        <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6, margin: '0 0 18px' }}>
          Avant de continuer, on te demande de lire et d’accepter les conditions générales d’utilisation pour
          les commerçants. Tu ne le fais qu’une fois, et de nouveau seulement si elles changent.
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: 13.5, color: T.ink, lineHeight: 1.5, marginBottom: 16 }}>
          <input type="checkbox" checked={coche} onChange={e => setCoche(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 1, accentColor: T.main, flexShrink: 0, cursor: 'pointer' }}/>
          <span>
            J’ai lu et j’accepte les{' '}
            <a href={LIEN_CGU_COMMERCANT} target="_blank" rel="noopener noreferrer"
              style={{ color: T.main, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3 }}>
              conditions générales d’utilisation pour les commerçants
            </a>
            , y compris les frais de paiement et les règles de remboursement.
          </span>
        </label>
        {erreur && (
          <p role="alert" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 12px', color: '#7F1D1D', fontSize: 13, fontWeight: 600, margin: '0 0 14px' }}>
            {erreur}
          </p>
        )}
        <button type="button" onClick={accepter} disabled={!coche || enCours}
          style={{ width: '100%', padding: '0.875rem 1.25rem', borderRadius: 100, border: 'none', background: (!coche || enCours) ? `${T.muted}66` : `linear-gradient(135deg, ${T.deep}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: !coche ? 'not-allowed' : enCours ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          Accepter et continuer
          {enCours && <DotsAttente couleur="#fff" taille={5} label="Enregistrement"/>}
        </button>
        <button type="button" onClick={onDeconnexion}
          style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: T.muted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
          Me déconnecter
        </button>
      </div>
    </div>
  )
}
