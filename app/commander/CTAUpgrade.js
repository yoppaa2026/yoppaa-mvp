// Composant CTAUpgrade — mini-CTA contextuel sur les sections grisées d'un commerçant.
// Cliquer envoie un signal d'intérêt au commerçant (table upgrade_requests).
// Anti-spam : 1 demande max / client / commerce / semaine / type.
//
// Wording unifie : "Je demande à {nom} d'activer {feature} dans l'app Yoppaa".
// Meme layout pour tous les types, alimentaire ET vitrine.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

// Libelle de la fonctionnalite demandee (apparaitra apres "d'activer ___ dans l'app Yoppaa")
const FEATURE = {
  prix:      'l’affichage de ses prix',
  deals:     'la publication de ses offres',
  commande:  'les commandes en ligne',
  livraison: 'la livraison',
  rdv:       'la réservation de RDV en ligne',
}

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

export default function CTAUpgrade({ type, commercant, variant = 'inline' }) {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  if (!type || !commercant) return null
  const feature = FEATURE[type] || type
  const phrase = `Je demande à ${commercant.nom} d’activer ${feature} dans l’app Yoppaa.`

  async function envoyerDemande() {
    if (sent || loading) return
    setLoading(true)
    try {
      const clientId = typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null
      if (clientId) {
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
    } catch (e) { /* anti-spam ou erreur : toast quand meme */ }
    setLoading(false)
    setSent(true)
    setTimeout(() => setSent(false), 4000)
  }

  // BANNER : carte sombre canonique Yoppaa, identique pour tous les types.
  if (variant === 'banner') {
    if (sent) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F0FDF4', border: '1.5px solid #10B98144', borderRadius: 14, padding: '12px 14px', fontFamily: '"DM Sans", sans-serif' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#065F46', lineHeight: 1.4, margin: 0 }}>
            Merci ! Ta demande a été transmise à <strong>{commercant.nom}</strong>.
          </p>
        </div>
      )
    }
    return (
      <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 100%)`, borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 30%, ${T.main}44 0%, transparent 55%)`, pointerEvents: 'none' }}/>
        <div style={{ position: 'relative' }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px', margin: 0, marginBottom: 6, opacity: 0.85 }}>
            Envoie un signal 🟣
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.45, margin: 0, marginBottom: 12, letterSpacing: '-0.2px' }}>
            « {phrase} »
          </p>
          <button onClick={envoyerDemande} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', background: '#fff', color: T.main, border: 'none', borderRadius: 100, fontWeight: 800, fontSize: 13, cursor: loading ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Envoi…' : (<>Envoyer ma demande
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
            </>)}
          </button>
        </div>
      </div>
    )
  }

  // INLINE : pill compact qui s'integre dans une section.
  return (
    <button onClick={envoyerDemande} disabled={loading || sent}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: sent ? '#F0FDF4' : '#fff', color: sent ? '#10B981' : T.bgPanel, border: `1.5px solid ${sent ? '#10B981' : T.bgPanel}`, borderRadius: 100, padding: '6px 12px', cursor: sent ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 12, fontWeight: 800, transition: 'all 0.15s' }}>
      {sent ? '✓ Demande transmise' : `Demander à activer ${feature}`}
    </button>
  )
}
