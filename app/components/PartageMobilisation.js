'use client'
// Boutons de partage pour amplifier la mobilisation (viralité Ch2).
// Web Share API natif sur mobile, fallback copie du lien sur desktop.
// Messages ÉVOCATEURS (phase teasing) : on ne dévoile pas le produit, on donne
// envie de rejoindre. Les arguments commerçant explicites (0% commission) restent
// pour le Kit lancement (Ch3).

import { useState } from 'react'

const URL_SITE = 'https://www.yoppaa.app'
const MESSAGES = {
  ami: 'Quelque chose se prépare dans notre quartier. Rejoins la tribu Yoppaa et aide à le faire venir chez nous !',
  commercant: 'Commerçant ? Quelque chose se prépare pour le commerce de quartier. Réserve ta place sur Yoppaa dès maintenant.',
}

const T = { main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', green: '#10B981', greenLight: '#6EE7B7' }

function IconShare() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>
    </svg>
  )
}

export default function PartageMobilisation() {
  const [copie, setCopie] = useState(null)  // 'ami' | 'commercant' | null

  async function partager(cle) {
    const texte = MESSAGES[cle]
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ title: 'Yoppaa', text: texte, url: URL_SITE }) } catch { /* annulé */ }
      return
    }
    try {
      await navigator.clipboard.writeText(`${texte} ${URL_SITE}`)
      setCopie(cle)
      setTimeout(() => setCopie(null), 2500)
    } catch { /* clipboard indispo */ }
  }

  const btn = (fond) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
    padding: '0.8rem 1rem', border: 'none', borderRadius: 100, cursor: 'pointer',
    fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: '0.9rem', color: '#fff',
    background: fond, boxShadow: `0 6px 18px ${T.main}44`,
  })

  return (
    <div style={{ marginTop: '1.6rem', padding: '16px', borderRadius: 18, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <p style={{ margin: '0 0 4px', fontSize: '1rem', fontWeight: 900, color: '#fff', textAlign: 'center' }}>
        Fais grandir la tribu
      </p>
      <p style={{ margin: '0 0 14px', fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 1.5 }}>
        Plus on est nombreux, plus vite Yoppaa arrive. Invite autour de toi.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={() => partager('ami')} style={btn(`linear-gradient(135deg, ${T.main}, ${T.mid})`)}>
          <IconShare/> {copie === 'ami' ? 'Lien copié !' : 'Partager à un ami'}
        </button>
        <button onClick={() => partager('commercant')} style={btn('rgba(255,255,255,0.10)')}>
          <IconShare/> {copie === 'commercant' ? 'Lien copié !' : 'Inviter un commerçant'}
        </button>
      </div>
    </div>
  )
}
