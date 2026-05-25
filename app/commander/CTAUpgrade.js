// Composant CTAUpgrade — mini-CTA contextuel sur les sections grisées d'un commerçant.
// Cliquer envoie un signal d'intérêt au commerçant (table upgrade_requests).
// Anti-spam : 1 demande max / client / commerce / semaine / type.
//
// Pour le moment, click affiche juste un toast (le backend
// upgrade_requests sera branché dans le Bloc 3).

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const COPY = {
  prix:      (nom) => `Je veux voir les prix de ${nom}`,
  deals:     (nom) => `Je veux voir les deals de ${nom}`,
  commande:  (nom) => `Je veux commander à l’avance chez ${nom}`,
  livraison: (nom) => `Je veux me faire livrer par ${nom}`,
}

const T = {
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  muted:   '#6B7280',
}

export default function CTAUpgrade({ type, commercant, variant = 'inline' }) {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!type || !commercant) return null
  const label = COPY[type]?.(commercant.nom) || `Je veux activer ${type}`

  async function envoyerDemande() {
    if (sent || loading) return
    setLoading(true)
    try {
      // Récupère un client_id si l'utilisateur s'est déjà identifié
      const clientId = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null
      if (clientId) {
        // Anti-spam : vérifie qu'il n'y a pas déjà eu une demande de ce client
        // pour ce commerce sur ce type dans les 7 derniers jours
        const ilYa7Jours = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
        const { data: dejaDemande } = await supabase
          .from('upgrade_requests')
          .select('id')
          .eq('client_id', clientId)
          .eq('commercant_id', commercant.id)
          .eq('type', type)
          .gte('created_at', ilYa7Jours)
          .limit(1)
          .maybeSingle()
        if (!dejaDemande) {
          await supabase.from('upgrade_requests').insert({
            client_id: clientId,
            commercant_id: commercant.id,
            type,
          })
        }
      }
      // Pas de client_id : pas de persistence, mais on remercie quand même
      // (la conversion en compte se fera plus tard si pertinent)
    } catch (e) {
      // Anti-spam ou erreur silencieuse : toast = "merci" dans tous les cas
    }
    setLoading(false)
    setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

  if (variant === 'banner') {
    return (
      <button onClick={envoyerDemande} disabled={loading || sent}
        style={{ display: 'block', width: '100%', background: sent ? '#F0FDF4' : T.bgPanel, color: sent ? '#16A34A' : '#fff', border: 'none', borderRadius: 14, padding: '14px 16px', cursor: sent ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14, fontWeight: 800, textAlign: 'center', boxShadow: sent ? 'none' : '0 8px 24px rgba(22,6,54,0.18)', transition: 'all 0.2s' }}>
        {sent ? '✓ Merci ! Ta demande a été transmise' : `💬 ${label} →`}
      </button>
    )
  }

  // variant inline : badge compact qui s'intègre dans une section
  return (
    <button onClick={envoyerDemande} disabled={loading || sent}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: sent ? '#F0FDF4' : '#fff', color: sent ? '#16A34A' : T.bgPanel, border: `1.5px solid ${sent ? '#16A34A' : T.bgPanel}`, borderRadius: 100, padding: '6px 12px', cursor: sent ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 800, transition: 'all 0.15s' }}>
      {sent ? '✓ Demande transmise' : `💬 ${label}`}
    </button>
  )
}
