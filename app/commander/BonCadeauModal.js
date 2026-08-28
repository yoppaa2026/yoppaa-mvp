'use client'
// Modale d'achat d'un bon cadeau (module 3, 31/07) : montant libre 5-250 €,
// « je l'offre par email » (bénéficiaire + petit mot) ou « je le reçois dans
// ma boîte ». Paiement Stripe Checkout Direct Charge chez le commerçant, le
// bon est activé et envoyé par le webhook. Partagée fiche RDV + fiche boutique.

import { useState } from 'react'
import { redirectTop } from '@/lib/redirect-top'
import { useResetAuRetourDePaiement } from '@/lib/retour-paiement'
import { BON_MONTANT_MIN, BON_MONTANT_MAX } from '@/lib/bons-cadeaux'

const T = {
  bgPanel: '#160636', ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4',
  mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF', muted: '#6B7280',
}
const MONTANTS_RAPIDES = [20, 30, 50, 75]

export default function BonCadeauModal({ commercant, validiteMois = 12, onClose }) {
  const [montant, setMontant] = useState('')
  const [mode, setMode] = useState('offrir')  // 'offrir' | 'moi'
  const [acheteur, setAcheteur] = useState({ prenom: '', email: '' })
  const [benef, setBenef] = useState({ prenom: '', email: '' })
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [erreur, setErreur] = useState(null)
  // 🔴 Même défaut que les deux tunnels : annuler chez Stripe et revenir
  // laissait le bouton bloqué, la page étant restaurée depuis le cache du
  // navigateur avec son state figé.
  useResetAuRetourDePaiement(() => setLoading(false))

  const montantNum = Math.round((parseFloat(String(montant).replace(',', '.')) || 0) * 100) / 100
  const montantOk = montantNum >= BON_MONTANT_MIN && montantNum <= BON_MONTANT_MAX
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e || '')
  // ⚠️ UN CADEAU DOIT DIRE DE QUI IL VIENT. Les prénoms n'étaient pas exigés :
  // le bénéficiaire recevait « on t'offre un bon cadeau », de la part de
  // personne, et l'acheteur lisait « envoyé à » suivi d'une adresse email.
  // Les gabarits savent se rabattre sur « Merci » et « Hello », mais un repli
  // poli reste un cadeau anonyme.
  const prenomOk = (v) => String(v || '').trim().length > 0
  const formOk = montantOk && emailOk(acheteur.email) && prenomOk(acheteur.prenom)
    && (mode === 'moi' || (emailOk(benef.email) && prenomOk(benef.prenom)))

  async function payer() {
    if (!formOk || loading) return
    setLoading(true); setErreur(null)
    try {
      const r = await fetch('/api/bons-cadeaux/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commercant_id: commercant.id,
          montant: montantNum,
          acheteur_email: acheteur.email.trim(),
          acheteur_prenom: acheteur.prenom.trim(),
          destinataire_mode: mode,
          ...(mode === 'offrir' ? {
            beneficiaire_email: benef.email.trim(),
            beneficiaire_prenom: benef.prenom.trim(),
            message: message.trim(),
          } : {}),
        }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok || !j.url) {
        setErreur(j.error || 'Impossible de lancer le paiement, réessaie.')
        setLoading(false)
        return
      }
      redirectTop(j.url)
    } catch {
      setErreur('Impossible de lancer le paiement, réessaie.')
      setLoading(false)
    }
  }

  const inputSt = { width: '100%', padding: '0.8rem 0.95rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.72)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', maxHeight: '92dvh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', fontFamily: '"DM Sans", sans-serif' }}>

        {/* Header violet */}
        <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, padding: '18px 20px', position: 'sticky', top: 0, zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Bon cadeau</p>
            <p style={{ margin: '2px 0 0', fontSize: '1.05rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>{commercant?.nom}</p>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            style={{ width: 32, height: 32, borderRadius: 100, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: '32px', flexShrink: 0 }}>×</button>
        </div>

        <div style={{ padding: '16px 18px 20px' }}>
          {/* Montant libre + suggestions */}
          <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Montant du bon</p>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {MONTANTS_RAPIDES.map(m => (
              <button key={m} type="button" onClick={() => setMontant(String(m))}
                style={{ flex: 1, padding: '9px 0', borderRadius: 12, border: `1.5px solid ${montantNum === m ? T.main : T.pale}`, background: montantNum === m ? T.pale : '#fff', color: montantNum === m ? T.main : T.ink, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                {m}€
              </button>
            ))}
          </div>
          <input type="number" inputMode="decimal" min={BON_MONTANT_MIN} max={BON_MONTANT_MAX} value={montant}
            onChange={e => setMontant(e.target.value)} placeholder={`Montant libre (${BON_MONTANT_MIN} à ${BON_MONTANT_MAX} €)`}
            style={{ ...inputSt, marginBottom: montantNum > 0 && !montantOk ? 4 : 14, fontWeight: 700 }}/>
          {montantNum > 0 && !montantOk && (
            <p style={{ margin: '0 0 12px', fontSize: '0.72rem', color: '#DC2626', fontWeight: 700 }}>Entre {BON_MONTANT_MIN} et {BON_MONTANT_MAX} €.</p>
          )}

          {/* Destinataire */}
          <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pour qui ?</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {[
              { val: 'offrir', label: 'Je l\'offre', sous: 'Envoyé par email avec ton petit mot' },
              { val: 'moi', label: 'Pour moi', sous: 'Reçu dans ta boîte email' },
            ].map(opt => {
              const sel = mode === opt.val
              return (
                <button key={opt.val} type="button" onClick={() => setMode(opt.val)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 14, border: `2px solid ${sel ? T.main : T.pale}`, background: sel ? '#F8F6FF' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif' }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: '0.85rem', color: sel ? T.main : T.ink }}>{opt.label}</span>
                  <span style={{ display: 'block', fontSize: '0.68rem', color: T.muted, fontWeight: 600, marginTop: 2 }}>{opt.sous}</span>
                </button>
              )
            })}
          </div>

          {mode === 'offrir' && (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={benef.prenom} onChange={e => setBenef(p => ({ ...p, prenom: e.target.value }))} placeholder="Son prénom *" style={{ ...inputSt, flex: '0 0 38%' }}/>
                <input type="email" value={benef.email} onChange={e => setBenef(p => ({ ...p, email: e.target.value }))} placeholder="Son email *" style={{ ...inputSt, flex: 1 }}/>
              </div>
              <textarea value={message} onChange={e => setMessage(e.target.value.slice(0, 300))} rows={2}
                placeholder="Ton petit mot (optionnel) : Joyeux anniversaire !"
                style={{ ...inputSt, resize: 'vertical', marginBottom: 12, lineHeight: 1.5 }}/>
            </>
          )}

          <p style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tes coordonnées</p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={acheteur.prenom} onChange={e => setAcheteur(p => ({ ...p, prenom: e.target.value }))} placeholder="Ton prénom *" style={{ ...inputSt, flex: '0 0 38%' }}/>
            <input type="email" value={acheteur.email} onChange={e => setAcheteur(p => ({ ...p, email: e.target.value }))} placeholder="Ton email *" style={{ ...inputSt, flex: 1 }}/>
          </div>

          {erreur && (
            <p style={{ margin: '0 0 10px', fontSize: '0.78rem', color: '#DC2626', fontWeight: 700, background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '8px 12px' }}>{erreur}</p>
          )}

          <button onClick={payer} disabled={!formOk || loading}
            style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', cursor: formOk && !loading ? 'pointer' : 'default', background: formOk ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#E5E7EB', color: formOk ? '#fff' : '#9CA3AF', boxShadow: formOk ? `0 6px 24px ${T.main}55` : 'none' }}>
            {loading ? 'Redirection…' : montantOk ? `Payer ${montantNum.toFixed(2)} €` : 'Payer'}
          </button>
          <p style={{ margin: '10px 0 0', fontSize: '0.68rem', color: T.muted, textAlign: 'center', lineHeight: 1.5 }}>
            Paiement sécurisé Stripe (carte ou Bancontact). Bon valable {validiteMois} mois, utilisable en une ou plusieurs fois, en ligne ou sur place 🟣
          </p>
        </div>
      </div>
    </div>
  )
}
