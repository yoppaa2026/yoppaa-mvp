'use client'
// ─── La fenêtre qui demande, puis celle qui confirme ─────────────────────────
//
// ⚠️ CE QU'ELLE REMPLACE, ET POURQUOI C'ÉTAIT INTENABLE. Annuler un rendez-vous
// posait DEUX `window.confirm()` à la suite. Le second demandait « Est-ce parce
// que tu déplaces cet endroit ? », avec pour seules réponses OK et Annuler :
// « Annuler » y voulait dire « annulation ordinaire », donc CONTINUER. Relevé
// par Alex le 15/08 en une phrase, « ok pour déplacer, annuler pour annuler ».
// Un bouton dont le mot dit le contraire de ce qu'il fait n'est pas un détail
// de style, c'est une fausse manœuvre qui attend son tour.
//
// Esprit ODOO : une seule fenêtre, des boutons qui PORTENT LA PHRASE de ce
// qu'ils déclenchent, et une confirmation ensuite. On ne devine jamais ce qui
// vient de se passer.

import { useEffect } from 'react'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  pale: '#EDE0FF', muted: '#6B7280',
}

const TONS = {
  danger:    { fond: 'linear-gradient(135deg, #DC2626, #EF4444)', texte: '#fff', bord: 'none' },
  principal: { fond: `linear-gradient(135deg, ${T.main}, ${T.mid})`, texte: '#fff', bord: 'none' },
  neutre:    { fond: '#fff', texte: T.deep, bord: `1.5px solid ${T.pale}` },
}

export default function ModaleConfirmation({
  ouverte,
  titre,
  message,
  details = null,
  actions = [],
  enCours = false,
  confirmation = null,   // une fois l'action faite : la phrase à lire
  onChoix,
  onFermer,
}) {
  // ⚠️ ÉCHAP FERME, ET FERMER NE FAIT RIEN. C'est la règle inverse du
  // `window.confirm()` qu'on remplace, où la touche d'échappement valait
  // « Annuler » et déclenchait donc, ici, une annulation ordinaire.
  useEffect(() => {
    if (!ouverte) return
    const auClavier = (e) => { if (e.key === 'Escape' && !enCours) onFermer?.() }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [ouverte, enCours, onFermer])

  if (!ouverte) return null

  return (
    <div
      onClick={() => { if (!enCours) onFermer?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26,8,64,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '"DM Sans", sans-serif' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={confirmation ? 'Confirmation' : titre}
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 440, width: '100%', boxSizing: 'border-box', boxShadow: '0 24px 70px rgba(22,6,54,0.4)' }}>

        {confirmation ? (
          // ─── C'EST FAIT ────────────────────────────────────────────────
          // La confirmation est une FENÊTRE et pas un message fugace : sur un
          // geste irréversible, le commerçant doit pouvoir relire ce qui vient
          // de se produire avant de refermer.
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: T.pale, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5"/>
                </svg>
              </span>
              <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, margin: 0 }}>C&rsquo;est noté&nbsp;! 🟣</p>
            </div>
            <p style={{ fontSize: 13, color: T.deep, lineHeight: 1.55, margin: '0 0 18px' }}>{confirmation}</p>
            <button
              type="button"
              onClick={onFermer}
              style={{ width: '100%', padding: '12px 16px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13.5, cursor: 'pointer' }}>
              Fermer
            </button>
          </>
        ) : (
          // ─── LA QUESTION ───────────────────────────────────────────────
          <>
            <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, margin: '0 0 6px', lineHeight: 1.3 }}>{titre}</p>
            {message && (
              <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, margin: '0 0 12px' }}>{message}</p>
            )}
            {details && (
              <div style={{ background: T.pale, borderRadius: 12, padding: '10px 12px', marginBottom: 16, fontSize: 12.5, fontWeight: 700, color: T.deep, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                {details}
              </div>
            )}

            {/* ⚠️ CHAQUE BOUTON PORTE LA PHRASE DE CE QU'IL FAIT. Jamais « OK »
                ni « Annuler » : sur un écran d'annulation, « Annuler » ne veut
                plus rien dire, on ne sait pas si l'on annule le rendez-vous ou
                la question. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {actions.map(a => {
                const ton = TONS[a.ton] || TONS.neutre
                return (
                  <button
                    key={a.valeur}
                    type="button"
                    disabled={enCours}
                    onClick={() => onChoix?.(a.valeur)}
                    style={{ padding: '12px 16px', borderRadius: 100, border: ton.bord, background: ton.fond, color: ton.texte, fontFamily: '"DM Sans", sans-serif', fontWeight: a.ton === 'neutre' ? 700 : 800, fontSize: 13.5, cursor: enCours ? 'wait' : 'pointer', opacity: enCours ? 0.6 : 1, lineHeight: 1.35, textAlign: 'center' }}>
                    {enCours ? 'Un instant…' : a.label}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
