'use client'
// ─── La barre qui empêche de perdre son travail ──────────────────────────────
//
// Esprit ODOO : dès qu'un champ change, le formulaire devient « sale » et une
// barre s'invite en bas de l'écran avec les deux seules actions qui comptent,
// ENREGISTRER et IGNORER. On ne cherche plus le bouton, c'est lui qui vient.
//
// ⚠️ POURQUOI UNE BARRE ET PAS SEULEMENT UNE FENÊTRE D'AVERTISSEMENT : la
// fenêtre arrive au moment où l'on quitte, c'est-à-dire trop tard, et elle ne
// dit toujours pas où se trouve le bouton. Elle reste utile en DERNIER RECOURS,
// sur les deux sorties qu'une barre ne peut pas couvrir : changer d'onglet et
// fermer l'application. D'où les deux pièces de ce fichier.

import { useEffect } from 'react'
import { AlertTriangle, Check, RotateCcw, X } from 'lucide-react'
import { MESSAGE_QUITTER, libelleModifications } from '@/lib/formulaire-modifie'

const T = {
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

// Le garde-fou du navigateur. Fermer l'onglet, recharger, revenir en arrière :
// autant de sorties qu'aucun bouton de notre interface ne voit passer.
export function useAvertirAvantDeQuitter(modifie) {
  useEffect(() => {
    if (!modifie) return
    function avantDeQuitter(e) {
      e.preventDefault()
      // Les navigateurs modernes affichent leur propre texte et ignorent le
      // nôtre, mais `returnValue` reste ce qui DÉCLENCHE la question.
      e.returnValue = MESSAGE_QUITTER
      return MESSAGE_QUITTER
    }
    window.addEventListener('beforeunload', avantDeQuitter)
    return () => window.removeEventListener('beforeunload', avantDeQuitter)
  }, [modifie])
}

// ─── La barre collante ───────────────────────────────────────────────────────
export function BarreEnregistrer({ visible, nb = 0, saving = false, onEnregistrer, onIgnorer, libelleAction = 'Enregistrer' }) {
  if (!visible) return null
  return (
    <div
      role="status"
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0,
        // Sous les notifications (9999) et sous le bandeau du haut (9998) :
        // une barre qui recouvrirait une alerte ferait perdre plus que du texte.
        zIndex: 9990,
        background: T.bgPanel,
        borderTop: `2px solid ${T.main}`,
        boxShadow: '0 -6px 24px rgba(22,6,54,0.28)',
        // ⚠️ L'encoche et la barre de gestes de l'iPhone mangent le bas de
        // l'écran : sans cette marge, « Enregistrer » se retrouve à moitié
        // dessous et devient intappable, ce qui reproduit exactement le défaut
        // qu'on corrige.
        padding: '12px 14px calc(12px + env(safe-area-inset-bottom))',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        fontFamily: '"DM Sans", sans-serif',
        animation: 'yoppaaBarreMonte 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
      <style>{`@keyframes yoppaaBarreMonte { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { @keyframes yoppaaBarreMonte { from { transform: none } to { transform: none } } }`}</style>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: '1 1 180px', minWidth: 0 }}>
        <AlertTriangle size={16} strokeWidth={2} color={T.light} style={{ flexShrink: 0 }}/>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', lineHeight: 1.35, overflowWrap: 'anywhere' }}>
          {libelleModifications(nb) || 'Modifications non enregistrées'}
        </span>
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={onIgnorer}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '9px 13px', borderRadius: 100,
            border: '1.5px solid rgba(255,255,255,0.28)', background: 'transparent',
            color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 12.5,
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1,
          }}>
          <RotateCcw size={13} strokeWidth={2}/> Ignorer
        </button>
        <button
          type="button"
          onClick={onEnregistrer}
          disabled={saving}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '9px 17px', borderRadius: 100, border: 'none',
            background: `linear-gradient(135deg, ${T.main}, ${T.mid})`,
            color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 12.5,
            cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1,
            boxShadow: '0 3px 12px rgba(107,53,196,0.45)',
          }}>
          <Check size={14} strokeWidth={2.4}/> {saving ? 'Enregistrement…' : libelleAction}
        </button>
      </span>
    </div>
  )
}

// ─── La fenêtre de dernier recours ───────────────────────────────────────────
// Trois issues, comme Odoo : enregistrer et continuer, abandonner, rester.
// ⚠️ « Rester ici » est le choix par défaut, celui d'Échap et du clic sur le
// fond : quand on ne sait pas, on ne détruit pas le travail de quelqu'un.
export function ModaleQuitter({ ouverte, nb = 0, saving = false, onEnregistrer, onAbandonner, onRester }) {
  useEffect(() => {
    if (!ouverte) return
    function auClavier(e) { if (e.key === 'Escape') onRester?.() }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [ouverte, onRester])

  if (!ouverte) return null
  return (
    <div
      onClick={onRester}
      style={{
        position: 'fixed', inset: 0, zIndex: 9995,
        background: 'rgba(26,8,64,0.62)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        fontFamily: '"DM Sans", sans-serif',
      }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Modifications non enregistrées"
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 22, maxWidth: 420, width: '100%', boxSizing: 'border-box', boxShadow: '0 20px 60px rgba(22,6,54,0.35)' }}>
        <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: T.ink, margin: '0 0 8px' }}>
          <AlertTriangle size={17} strokeWidth={2} color={T.main}/> Tu as du travail non enregistré
        </p>
        <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
          {libelleModifications(nb) || 'Des modifications non enregistrées'} sur cet écran.
          Si tu continues sans enregistrer, elles seront perdues.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={onEnregistrer}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 16px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13.5, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            <Check size={15} strokeWidth={2.4}/> {saving ? 'Enregistrement…' : 'Enregistrer et continuer'}
          </button>
          <button
            type="button"
            onClick={onRester}
            disabled={saving}
            style={{ padding: '11px 16px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.deep, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            Rester ici
          </button>
          <button
            type="button"
            onClick={onAbandonner}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '9px 16px', borderRadius: 100, border: 'none', background: 'transparent', color: T.muted, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
            <X size={13} strokeWidth={2}/> Abandonner mes modifications
          </button>
        </div>
      </div>
    </div>
  )
}
