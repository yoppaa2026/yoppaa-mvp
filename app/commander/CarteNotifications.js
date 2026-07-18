'use client'
// Carte "Notifications" du Profil Yopper : bouton EXPLICITE pour activer/réparer les
// push (statut de commande, rappels, deals). Indispensable car le prompt OneSignal ne
// se déclenchait qu'au moment d'un favori/commande : un Yopper qui ne fait pas ce geste
// n'était jamais sollicité -> aucun abonnement -> aucun push (constaté 18/07 sur mobile).
// Le clic ici est un geste utilisateur valide pour requestPermission (requis iOS).

import { useState, useEffect, useCallback } from 'react'
import { activerNotifications, lireEtatPush } from '@/app/components/OneSignalInit'

const T = {
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', muted: '#6B7280', green: '#10B981',
}

export default function CarteNotifications() {
  const [etat, setEtat] = useState(null)
  const [enCours, setEnCours] = useState(false)
  const [message, setMessage] = useState(null) // { type:'ok'|'info'|'error', texte }

  const rafraichir = useCallback(() => {
    setEtat(lireEtatPush())
  }, [])

  // Le SDK OneSignal se charge en afterInteractive : on lit l'état une fois monté,
  // puis on réessaie brièvement le temps qu'il soit prêt.
  useEffect(() => {
    rafraichir()
    const ids = [400, 1200, 2500].map(d => setTimeout(rafraichir, d))
    return () => ids.forEach(clearTimeout)
  }, [rafraichir])

  const actif = etat?.pret && etat?.permission === 'granted' && (etat?.optedIn === true || !!etat?.id)

  async function onActiver() {
    setEnCours(true); setMessage(null)
    try {
      const res = await activerNotifications()
      if (res.ok) {
        setMessage({ type: 'ok', texte: 'Notifications activées. Tu seras prévenu du statut de tes commandes.' })
      } else if (res.raison === 'refuse_os') {
        setMessage({ type: 'error', texte: 'Les notifications sont bloquées. Active-les dans les réglages de ton téléphone pour Yoppaa, puis réessaie.' })
      } else if (res.raison === 'non_supporte') {
        setMessage({ type: 'info', texte: "Sur iPhone, ajoute d'abord Yoppaa à ton écran d'accueil, puis ouvre l'app depuis cette icône." })
      } else if (res.raison === 'sdk_absent') {
        setMessage({ type: 'info', texte: 'Un instant, le service de notifications se charge. Réessaie dans quelques secondes.' })
      } else {
        setMessage({ type: 'error', texte: "L'activation n'a pas abouti. Réessaie, ou active les notifications dans les réglages de ton téléphone." })
      }
    } catch {
      setMessage({ type: 'error', texte: 'Une erreur est survenue. Réessaie.' })
    } finally {
      setEnCours(false)
      // L'abonnement peut se finaliser un instant après l'acceptation : on relit l'état.
      rafraichir()
      ;[600, 1800, 3500].forEach(d => setTimeout(rafraichir, d))
    }
  }

  const msgColor = message?.type === 'ok' ? T.green : message?.type === 'error' ? '#DC2626' : T.muted

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.pale}`, boxShadow: '0 2px 8px rgba(107,53,196,0.06)', padding: '1rem', marginBottom: '0.875rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: actif ? '#ECFDF5' : T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={actif ? T.green : T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0, marginBottom: 2 }}>Notifications</p>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: actif ? T.green : T.ink, margin: 0, lineHeight: 1.3 }}>
            {actif ? 'Activées ✓' : 'Suis le statut de tes commandes en direct'}
          </p>
        </div>
        {!actif && (
          <button onClick={onActiver} disabled={enCours}
            style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 13, cursor: enCours ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            {enCours ? '…' : 'Activer'}
          </button>
        )}
      </div>

      {message && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 600, color: msgColor, lineHeight: 1.45 }}>
          {message.texte}
        </p>
      )}

      {/* Diagnostic discret (utile pour comprendre l'état réel sur l'appareil). */}
      {etat?.pret && (
        <p style={{ margin: '8px 0 0', fontSize: 10.5, color: T.muted, opacity: 0.75, fontFamily: 'monospace' }}>
          push: {String(etat.supporte)} · perm: {String(etat.permission)} · abo: {String(etat.optedIn)} · id: {etat.id ? etat.id.slice(0, 8) : '—'}
        </p>
      )}
    </div>
  )
}
