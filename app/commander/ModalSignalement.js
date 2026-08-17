'use client'
// Modale de signalement réutilisable.
// Permet à un Yopper de signaler un problème sur une fiche commerce OU service public.
// Props :
//  - target : { kind: 'commerce' | 'service', id: uuid, nom: string }
//  - yopperId : uuid du client connecté (peut être null pour signaler anonymement)
//  - onClose : fermeture
//  - onSent  : callback succès

import { useState } from 'react'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  light: '#C4A0F4', pale: '#EDE0FF', bgPage: '#F5F3FA',
  hairline: '#F0EBF8', muted: '#6B7280',
}

// 8 types de signalement avec label + icône SVG.
const TYPES = [
  { key: 'ferme',     label: 'Fermé / disparu',    icon: '🔒' },
  { key: 'horaires',  label: 'Horaires incorrects', icon: '🕐' },
  { key: 'adresse',   label: 'Adresse erronée',     icon: '📍' },
  { key: 'telephone', label: 'Téléphone faux',      icon: '📞' },
  { key: 'articles',  label: 'Menu / articles KO',  icon: '🍞' },
  { key: 'site_web',  label: 'Site web cassé',      icon: '🌐' },
  { key: 'doublon',   label: 'Fiche en doublon',    icon: '👯' },
  { key: 'autre',     label: 'Autre',               icon: '💬' },
]

export default function ModalSignalement({ target, onClose, onSent }) {
  const [type, setType] = useState(null)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState(null)

  async function envoyer() {
    if (!type) return
    setSubmitting(true)
    setError(null)
    // Route serveur : la table était insérable par n'importe qui, donc par
    // n'importe quel robot. L'auteur est repris du cookie côté serveur.
    let err = null
    try {
      const r = await fetch('/api/signaux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'signalement',
          motif: type,
          description: description.trim() || null,
          commercant_id: target.kind === 'commerce' ? target.id : null,
          service_id:    target.kind === 'service'  ? target.id : null,
        }),
      })
      const j = await r.json()
      if (!j?.ok) err = { message: j?.error || 'Envoi impossible.' }
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

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '"DM Sans", sans-serif' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', maxHeight: '90svh', overflow: 'auto', boxShadow: '0 24px 48px rgba(26,8,64,0.3)', position: 'relative' }}>

        {/* Barre dégradée fine (design system) */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

        {/* Bouton fermer */}
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
                Merci, signalement envoyé !
              </h2>
              <p style={{ fontSize: 13, color: T.muted, margin: 0, lineHeight: 1.5 }}>
                Le commerçant va recevoir ton retour et corriger ce qui doit l&rsquo;être.
              </p>
            </div>
          )}

          {/* Formulaire */}
          {!done && (
            <>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px' }}>
                Signaler un problème
              </p>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: T.ink, letterSpacing: '-0.3px', margin: '0 0 4px', lineHeight: 1.25 }}>
                {target.nom}
              </h2>
              <p style={{ fontSize: 12, color: T.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
                Tes signalements aident la tribu à garder Yoppaa à jour. Merci de prendre 30 secondes&nbsp;!
              </p>

              {/* Sélection du type */}
              <label style={{ fontSize: 11, fontWeight: 700, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 8 }}>
                Que se passe-t-il&nbsp;?
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
                {TYPES.map(t => {
                  const actif = type === t.key
                  return (
                    <button key={t.key} type="button" onClick={() => setType(t.key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 12px', borderRadius: 12,
                        border: `1.5px solid ${actif ? T.main : T.hairline}`,
                        background: actif ? T.pale : '#fff',
                        color: actif ? T.deep : T.ink,
                        cursor: 'pointer', fontFamily: 'inherit',
                        fontWeight: actif ? 800 : 600,
                        fontSize: 12, textAlign: 'left',
                        transition: 'all 0.15s',
                      }}>
                      <span style={{ fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
                      <span style={{ flex: 1, lineHeight: 1.2 }}>{t.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Description */}
              <label style={{ fontSize: 11, fontWeight: 700, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                Précisions <span style={{ color: T.muted, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(optionnel)</span>
              </label>
              <textarea value={description} onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder="Ex: ils sont en réalité fermés le lundi…"
                style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: 'inherit', color: T.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 14 }}/>

              {error && (
                <p style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, margin: '0 0 12px' }}>
                  Erreur : {error}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onClose} disabled={submitting}
                  style={{ flex: 1, padding: '11px 18px', border: `1.5px solid ${T.hairline}`, borderRadius: 100, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 13, cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  Annuler
                </button>
                <button onClick={envoyer} disabled={!type || submitting}
                  style={{ flex: 2, padding: '12px 18px', border: 'none', borderRadius: 100, background: (!type || submitting) ? '#D1D5DB' : `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: (!type || submitting) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: (!type || submitting) ? 'none' : `0 6px 20px ${T.main}40` }}>
                  {submitting ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
