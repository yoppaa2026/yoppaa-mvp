'use client'
// Kit de partage commerçant (Ch3) — partie interactive : copie du lien, partage
// natif, téléchargement du QR, 3 tons de message. Le lien ?ref attribue chaque
// inscription au commerçant (widget d'impact).

import { useState } from 'react'

const T = {
  bgTop: '#160636', deep: '#2D0F6B', ink: '#1A0840',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', green: '#10B981', greenLight: '#6EE7B7',
}

// Textes de partage (3 tons). Le lien ?ref est ajouté à la fin par le partage.
const TEXTES = [
  { cle: 'clients', label: 'Pour tes clients', texte: 'Quelque chose se prépare pour nos commerces de quartier, et j’en suis 🟣 Rejoins le mouvement, réserve ta place :' },
  { cle: 'commercant', label: 'Pour un autre commerçant', texte: 'Commerçant du coin ? On mobilise notre commune pour faire venir Yoppaa. Ajoute-toi, c’est gratuit et c’est maintenant :' },
  { cle: 'court', label: 'Version courte', texte: 'Yoppaa arrive bientôt dans notre commune 🟣 Réserve ta place :' },
]

function IconShare() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>
    </svg>
  )
}
function IconCopy() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  )
}

export default function KitClient({ slug, kit, lien, qr }) {
  const [copie, setCopie] = useState(null)

  async function copier(texte, cle) {
    try { await navigator.clipboard.writeText(texte); setCopie(cle); setTimeout(() => setCopie(null), 2200) } catch { /* clipboard indispo */ }
  }
  async function partager(texte, cle) {
    const data = { title: 'Yoppaa', text: texte, url: lien }
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share(data) } catch { /* annulé */ }
    } else {
      copier(`${texte} ${lien}`, cle)
    }
  }

  const wrap = { minHeight: '100svh', background: `linear-gradient(160deg, ${T.bgTop} 0%, ${T.deep} 55%, ${T.ink} 100%)`, fontFamily: '"DM Sans", system-ui, sans-serif', padding: '2rem 1rem 3rem' }

  if (!kit) {
    return (
      <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: 420 }}>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '2rem', letterSpacing: '-0.05em', marginBottom: 14 }}>yoppaa</p>
          <p style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 8 }}>Kit introuvable</p>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.9rem' }}>Ce lien de kit n&apos;existe pas (ou plus). Vérifie l&apos;adresse.</p>
        </div>
      </div>
    )
  }

  const btnBase = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '9px 14px', borderRadius: 100, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', border: 'none' }

  return (
    <div style={wrap}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* En-tête */}
        <div style={{ textAlign: 'center', marginBottom: '1.4rem' }}>
          <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.7rem', letterSpacing: '-0.05em', color: '#fff', lineHeight: 1, marginBottom: 12 }}>yoppaa</p>
          <p style={{ fontSize: '0.72rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', margin: '0 0 6px' }}>Ton kit de partage</p>
          <h1 style={{ fontWeight: 900, fontSize: '1.5rem', color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>{kit.nom}</h1>
          {kit.commune && <p style={{ margin: '4px 0 0', fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)' }}>{kit.commune}</p>}
        </div>

        {/* Impact */}
        <div style={{ textAlign: 'center', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 18, padding: '18px', marginBottom: 16, boxShadow: `0 8px 26px ${T.main}55` }}>
          <p style={{ margin: 0, fontSize: '2.6rem', fontWeight: 900, color: '#fff', letterSpacing: '-1.5px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{kit.impact}</p>
          <p style={{ margin: '6px 0 0', fontSize: '0.88rem', fontWeight: 700, color: 'rgba(255,255,255,0.95)' }}>
            {kit.impact <= 1 ? 'personne inscrite grâce à toi 🟣' : 'personnes inscrites grâce à toi 🟣'}
          </p>
        </div>

        {/* Lien tracké */}
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>Ton lien personnel</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <code style={{ flex: '1 1 220px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: T.light, fontSize: '0.82rem', background: 'rgba(0,0,0,0.25)', padding: '9px 12px', borderRadius: 10 }}>{lien.replace('https://', '')}</code>
            <button onClick={() => copier(lien, 'lien')} style={{ ...btnBase, background: '#fff', color: T.main }}>
              <IconCopy/> {copie === 'lien' ? 'Copié !' : 'Copier'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)' }}>Chaque inscription via ce lien t&apos;est attribuée.</p>
        </div>

        {/* QR code */}
        {qr && (
          <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 16, marginBottom: 16, textAlign: 'center' }}>
            <p style={{ margin: '0 0 12px', fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>Ton QR code (à mettre en vitrine)</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt="QR code Yoppaa" style={{ width: 200, height: 200, borderRadius: 12, background: '#fff', padding: 8 }}/>
            <div style={{ marginTop: 12 }}>
              <a href={qr} download={`yoppaa-qr-${slug}.png`} style={{ ...btnBase, background: 'rgba(255,255,255,0.12)', color: '#fff', textDecoration: 'none' }}>
                Télécharger le QR
              </a>
            </div>
          </div>
        )}

        {/* Textes de partage */}
        <p style={{ margin: '0 0 10px', fontSize: '0.8rem', fontWeight: 800, color: '#fff' }}>Messages prêts à partager</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {TEXTES.map(t => (
            <div key={t.cle} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: 14 }}>
              <p style={{ margin: '0 0 6px', fontSize: '0.68rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{t.label}</p>
              <p style={{ margin: '0 0 12px', fontSize: '0.88rem', color: 'rgba(255,255,255,0.95)', lineHeight: 1.5 }}>{t.texte}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => partager(t.texte, t.cle)} style={{ ...btnBase, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', flex: 1 }}>
                  <IconShare/> Partager
                </button>
                <button onClick={() => copier(`${t.texte} ${lien}`, t.cle)} style={{ ...btnBase, background: 'rgba(255,255,255,0.10)', color: '#fff' }}>
                  <IconCopy/> {copie === t.cle ? 'Copié !' : 'Copier'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <p style={{ margin: '1.6rem 0 0', textAlign: 'center', fontSize: '0.76rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          Plus tu partages, plus vite ta commune atteint son objectif et se lance sur Yoppaa. 🟣
        </p>
      </div>
    </div>
  )
}
