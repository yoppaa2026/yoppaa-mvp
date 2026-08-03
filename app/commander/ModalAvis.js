'use client'
// Modale pour laisser un avis sur un commerce.
//
// Props :
//  - commercant : { id, nom, type }
//  - clientId : id du client Yopper (obligatoire pour poster un avis)
//  - commandeId : id de la commande si l'avis est lié → badge "Vérifié"
//  - onClose : fermeture
//  - onSent : callback succès

import { useState } from 'react'
import { fetchYopper } from '@/lib/fetch-yopper'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  light: '#C4A0F4', pale: '#EDE0FF', bgPage: '#F5F3FA',
  hairline: '#F0EBF8', muted: '#6B7280',
}

// Étoile SVG : 'fill' OU 'stroke' selon état
function Etoile({ rempli, size = 36, color = '#F59E0B' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={rempli ? color : 'none'} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
    </svg>
  )
}

export default function ModalAvis({ commercant, clientId, commandeId = null, onClose, onSent }) {
  const [note, setNote] = useState(0)
  const [hover, setHover] = useState(0)
  const [commentaire, setCommentaire] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function envoyer() {
    if (note < 1) return
    if (!clientId) { setError('Connecte-toi pour laisser un avis.'); return }
    setSubmitting(true)
    setError(null)
    // L'avis part par une route serveur : la table n'accepte plus d'écriture
    // directe. Le serveur reprend l'auteur du cookie et vérifie qu'il a bien
    // une commande récupérée chez ce commerce, ce qu'une policy SQL ne pouvait
    // pas faire faute d'identité Supabase Auth pour un Yopper.
    let err = null
    try {
      const r = await fetchYopper('/api/yopper/avis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercant_id: commercant.id,
          note,
          commentaire: commentaire.trim() || null,
          commande_id: commandeId || null,
        }),
      })
      const j = await r.json()
      if (!j?.ok) err = { message: j?.error || 'Enregistrement impossible.' }
    } catch {
      err = { message: 'Erreur réseau, réessaie.' }
    }
    setSubmitting(false)
    if (err) {
      setError(err.message)
      return
    }
    setDone(true)
    onSent?.()
    setTimeout(() => { onClose?.() }, 1800)
  }

  const noteAffichee = hover || note
  const LABELS = ['', 'Décevant', 'Bof', 'Correct', 'Très bien', 'Excellent']

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '"DM Sans", sans-serif' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 48px rgba(26,8,64,0.3)', position: 'relative' }}>

        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

        {!done && (
          <button onClick={onClose} aria-label="Fermer"
            style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, border: 'none', background: T.bgPage, borderRadius: '50%', color: T.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ×
          </button>
        )}

        <div style={{ padding: '22px 22px 20px' }}>

          {/* État succès */}
          {done && (
            <div style={{ textAlign: 'center', padding: '18px 0 10px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 60, height: 60, borderRadius: '50%', background: '#F0FDF4', marginBottom: 14 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: T.ink, margin: '0 0 6px', letterSpacing: '-0.3px' }}>
                Merci pour ton avis&nbsp;!
              </h2>
              <p style={{ fontSize: 13, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                Ton retour aide la tribu Yoppers à choisir mieux.
              </p>
            </div>
          )}

          {/* Formulaire */}
          {!done && (
            <>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>
                {commandeId ? '✓ Commande récupérée' : 'Laisser un avis'}
              </p>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: '-0.3px', margin: '0 0 4px', lineHeight: 1.25 }}>
                Comment c&rsquo;était chez {commercant.nom}&nbsp;?
              </h2>
              <p style={{ fontSize: 12, color: T.muted, margin: '0 0 18px', lineHeight: 1.5 }}>
                {commandeId
                  ? 'Ton avis sera marqué « vérifié » car lié à ta commande.'
                  : 'Partage ton expérience pour aider les autres Yoppers.'}
              </p>

              {/* Étoiles */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 6 }}
                onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button"
                    onClick={() => setNote(n)}
                    onMouseEnter={() => setHover(n)}
                    style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer' }}>
                    <Etoile rempli={n <= noteAffichee} size={38}/>
                  </button>
                ))}
              </div>
              <p style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: noteAffichee > 0 ? T.deep : T.muted, height: 18, margin: '0 0 16px' }}>
                {LABELS[noteAffichee] || ' '}
              </p>

              {/* Commentaire */}
              <label style={{ fontSize: 11, fontWeight: 700, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                Commentaire <span style={{ color: T.muted, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span>
              </label>
              <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
                rows={3}
                placeholder="Ex: croissants top, service rapide, super accueil…"
                maxLength={400}
                style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: 'inherit', color: T.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 4 }}/>
              <p style={{ fontSize: 10, color: T.muted, fontWeight: 600, textAlign: 'right', margin: '0 0 14px' }}>
                {commentaire.length} / 400
              </p>

              {error && (
                <p style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, margin: '0 0 12px' }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} disabled={submitting}
                  style={{ flex: 1, padding: '11px 18px', border: `1.5px solid ${T.hairline}`, borderRadius: 100, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  {commandeId ? 'Plus tard' : 'Annuler'}
                </button>
                <button onClick={envoyer} disabled={note < 1 || submitting}
                  style={{ flex: 2, padding: '12px 18px', border: 'none', borderRadius: 100, background: (note < 1 || submitting) ? '#D1D5DB' : `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: (note < 1 || submitting) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: (note < 1 || submitting) ? 'none' : `0 6px 20px ${T.main}40` }}>
                  {submitting ? 'Envoi…' : 'Envoyer mon avis'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
