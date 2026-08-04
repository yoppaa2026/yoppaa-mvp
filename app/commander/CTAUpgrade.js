// Composant CTAUpgrade - mini-CTA contextuel sur les sections grisées d'un commerçant.
// Cliquer envoie un signal d'intérêt au commerçant (table upgrade_requests).
// Anti-spam : 1 demande max / client / commerce / semaine / type.
//
// Wording revu le 03/08 : l'ancien « Je demande à X d'activer les commandes en
// ligne dans l'app Yoppaa » plaçait l'habitant en pétitionnaire et parlait le
// vocabulaire interne du produit. On part de son envie à lui, et le commerçant
// reçoit un signal qui ressemble à ce qu'un client lui dirait au comptoir.
//
// Boutons repris le 05/08 : les cinq envies partageaient « Envoyer mon envie ».
// « Envie » ne veut pas dire grand-chose isolé, et surtout le même bouton pour
// cinq demandes différentes ratait l'occasion d'être concret. Un habitant ne
// pense pas « j'envoie une envie », il pense « je veux pouvoir commander ici ».
// Chaque bouton dit donc CE QUE LA PERSONNE VEUT, à la première personne.

import { useState } from 'react'

// Un message par fonctionnalité : titre court, phrase à hauteur d'habitant, et
// libellé de bouton. `nom` est le nom du commerce.
const MESSAGES = {
  prix: {
    titre: 'Dis-lui ce que tu voudrais',
    phrase: nom => `Tu aimerais voir les prix de ${nom} avant de te déplacer ? Dis-le-lui.`,
    bouton: 'Je veux voir les prix',
    confirme: 'Il saura que tu veux voir ses prix',
  },
  deals: {
    titre: 'Dis-lui ce que tu voudrais',
    phrase: nom => `Tu aimerais connaître les bons plans de ${nom} avant tout le monde ? Dis-le-lui.`,
    bouton: 'Je veux ses bons plans',
    confirme: 'Il saura que tu veux ses bons plans',
  },
  commande: {
    titre: 'Dis-lui ce que tu voudrais',
    phrase: nom => `Tu aimerais commander chez ${nom} sans faire la file ? Dis-le-lui.`,
    bouton: 'Je veux commander ici',
    confirme: 'Il saura que tu veux commander chez lui',
  },
  livraison: {
    titre: 'Dis-lui ce que tu voudrais',
    phrase: nom => `Tu aimerais te faire livrer par ${nom} ? Dis-le-lui.`,
    bouton: 'Je veux être livré',
    confirme: 'Il saura que tu veux être livré',
  },
  rdv: {
    titre: 'Dis-lui ce que tu voudrais',
    phrase: nom => `Tu aimerais prendre rendez-vous chez ${nom} en ligne, même à minuit ? Dis-le-lui.`,
    bouton: 'Je veux prendre RDV en ligne',
    confirme: 'Il saura que tu veux réserver en ligne',
  },
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
  const message = MESSAGES[type] || MESSAGES.commande
  const phrase = message.phrase(commercant.nom)

  async function envoyerDemande() {
    if (sent || loading) return
    setLoading(true)
    try {
      // Route serveur. L'anti-spam d'une envie par semaine était appliqué ici,
      // dans le navigateur, donc contournable ; il est désormais vérifié côté
      // serveur, où la table n'est plus insérable directement.
      await fetch('/api/signaux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'envie', feature: type, commercant_id: commercant.id }),
      })
    } catch (e) { /* le remerciement s'affiche quand même */ }
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
          {/* La confirmation dit CE QUI a été transmis, pas juste « merci » :
              le Yopper doit savoir quel message est parti en son nom. */}
          <p style={{ fontSize: 13, fontWeight: 700, color: '#065F46', lineHeight: 1.4, margin: 0 }}>
            C&rsquo;est transmis à <strong>{commercant.nom}</strong>. {message.confirme} 🟣
          </p>
        </div>
      )
    }
    return (
      <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 100%)`, borderRadius: 14, padding: '14px 16px', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 30%, ${T.main}44 0%, transparent 55%)`, pointerEvents: 'none' }}/>
        <div style={{ position: 'relative' }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px', margin: 0, marginBottom: 6, opacity: 0.85 }}>
            {message.titre}
          </p>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.45, margin: 0, marginBottom: 12, letterSpacing: '-0.2px' }}>
            {phrase}
          </p>
          <button onClick={envoyerDemande} disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', background: '#fff', color: T.main, border: 'none', borderRadius: 100, fontWeight: 800, fontSize: 13, cursor: loading ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.18)', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Envoi…' : (<>{message.bouton}
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
      {sent ? '✓ C\'est transmis' : message.bouton}
    </button>
  )
}
