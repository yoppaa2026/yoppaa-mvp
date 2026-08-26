'use client'
// ─── Le colis part : chez qui, et sous quel numéro ───────────────────────────
//
// 🔴 CE QU'ELLE REMPLACE : un `window.prompt()`. Sur iPhone, c'est la boîte
// grise du système, qui n'appartient à personne, ne dit pas de quelle commande
// on parle, ne propose qu'UN champ, et ouvre un clavier alphabétique devant
// seize chiffres à taper (Alex, 26/08, capture à l'appui).
//
// ⚠️ ET SURTOUT ELLE NE DEMANDAIT PAS LE TRANSPORTEUR. Un numéro de suivi seul
// ne se suit nulle part : ni le client ni le commerçant ne savent sur quel site
// aller le coller. C'est la vraie raison de cette fenêtre ; le confort n'est
// que la conséquence.
//
// ⚠️ LES DEUX RESTENT FACULTATIFS, et c'est voulu. Un commerçant qui dépose
// son colis à la poste du village sans étiquette suivie doit pouvoir marquer sa
// commande expédiée quand même. Rendre le numéro obligatoire l'empêcherait de
// clôturer, et il finirait par saisir n'importe quoi.

import { useEffect, useState } from 'react'
import { TRANSPORTEURS } from '@/lib/transporteurs'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  pale: '#EDE0FF', muted: '#6B7280', hairline: '#E9E3F5',
}

export default function ModaleExpedition({
  ouverte,
  reference = null,          // « #EX2 », pour savoir DE QUELLE commande on parle
  transporteurInitial = '',
  suiviInitial = '',
  enCours = false,
  onValider,
  onFermer,
}) {
  const [transporteur, setTransporteur] = useState(transporteurInitial || '')
  const [suivi, setSuivi] = useState(suiviInitial || '')

  // ⚠️ ON RECHARGE À CHAQUE OUVERTURE. Sans ça, le commerçant qui corrige la
  // commande #EX2 après avoir rempli #EX1 retrouve le numéro de la précédente
  // déjà dans le champ, et l'envoie sans le relire.
  useEffect(() => {
    if (!ouverte) return
    setTransporteur(transporteurInitial || '')
    setSuivi(suiviInitial || '')
  }, [ouverte, transporteurInitial, suiviInitial])

  useEffect(() => {
    if (!ouverte) return
    const auClavier = (e) => { if (e.key === 'Escape' && !enCours) onFermer?.() }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [ouverte, enCours, onFermer])

  if (!ouverte) return null

  function valider() {
    if (enCours) return
    onValider?.({
      // ⚠️ CHAÎNE VIDE → `null`, JAMAIS ''. La colonne porte une contrainte qui
      // n'accepte que les clés connues ou NULL : une chaîne vide serait rejetée
      // par la base, et le commerçant verrait un échec sans comprendre.
      transporteur: transporteur || null,
      suivi: suivi.trim() || null,
    })
  }

  return (
    <div
      onClick={() => { if (!enCours) onFermer?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(26,8,64,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '"DM Sans", sans-serif' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Marquer la commande expédiée"
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 440, width: '100%', boxSizing: 'border-box', boxShadow: '0 24px 70px rgba(22,6,54,0.4)' }}>

        <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, margin: '0 0 6px', lineHeight: 1.3 }}>
          Le colis {reference ? <span style={{ color: T.main }}>{reference}</span> : null} est parti&nbsp;?
        </p>
        <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.55, margin: '0 0 16px' }}>
          Ton client reçoit tout de suite un email avec le suivi. Tu peux laisser
          vide si tu n&rsquo;as pas d&rsquo;étiquette suivie.
        </p>

        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Transporteur
        </label>
        <select
          value={transporteur}
          onChange={e => setTransporteur(e.target.value)}
          disabled={enCours}
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${T.hairline}`, fontFamily: '"DM Sans", sans-serif', fontSize: 14, fontWeight: 700, color: T.ink, background: '#fff', marginBottom: 14 }}>
          <option value="">Je ne précise pas</option>
          {TRANSPORTEURS.map(t => (
            <option key={t.cle} value={t.cle}>{t.nom}</option>
          ))}
        </select>

        <label style={{ display: 'block', fontSize: 11.5, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
          Numéro de suivi
        </label>
        {/* ⚠️ `inputMode="numeric"` ET PAS `type="number"` : un numéro de suivi
            peut commencer par des zéros et contenir des lettres. Le type
            numérique les avalerait, et « 0072638628362826 » deviendrait
            « 72638628362826 ». On demande juste le bon clavier. */}
        <input
          value={suivi}
          onChange={e => setSuivi(e.target.value)}
          disabled={enCours}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Colle le numéro de l’étiquette"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${T.hairline}`, fontFamily: '"DM Sans", sans-serif', fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 18 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* ⚠️ LE BOUTON DIT LE GESTE, pas « OK ». Et il n'est pas rouge :
              expédier ne détruit rien. */}
          <button
            type="button"
            disabled={enCours}
            onClick={valider}
            style={{ padding: '12px 16px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13.5, cursor: enCours ? 'wait' : 'pointer', opacity: enCours ? 0.6 : 1 }}>
            {enCours ? 'Un instant…' : 'Marquer expédiée et prévenir le client'}
          </button>
          <button
            type="button"
            disabled={enCours}
            onClick={onFermer}
            style={{ padding: '12px 16px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.deep, fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
            Pas encore
          </button>
        </div>
      </div>
    </div>
  )
}
