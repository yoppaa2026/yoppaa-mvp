'use client'
// « AJOUTE CE LIEN À TA FICHE GOOGLE ».
//
// ⚠️ DEMANDE D'ALEX (24/08). Le meilleur rapport effort/résultat du kit : en
// deux minutes, sans une ligne de code, le commerçant récupère un bouton
// « Commander en ligne » ou « Prendre rendez-vous » sur sa fiche Google et
// dans Maps. Ce qui manquait, ce n'était pas la technique : c'était de le lui
// DIRE, et de lui donner le lien exact à coller.
//
// ⚠️ ON NE PROMET PAS LE BOUTON. Google décide de ce qu'il affiche, et ce que
// l'on maîtrise s'arrête au lien. Promettre un bouton qu'on ne contrôle pas,
// c'est fabriquer une déception à retardement.
//
// Le contenu vient de `lib/action-google.js` : le lien affiché ici est le MÊME
// que celui que le QR imprime, et que la fiche déclare aux moteurs.

import { useState } from 'react'

const T = {
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B21D4',
  muted:    '#6B7280',
  pale:     '#EDE0FF',
  hairline: '#E5E7EB',
}

export default function ConsigneGoogle({ consigne, sombre = false }) {
  const [copie, setCopie] = useState(false)
  if (!consigne) return null

  async function copier() {
    try {
      await navigator.clipboard.writeText(consigne.url)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch { /* copie refusée par le navigateur : le lien reste lisible et sélectionnable */ }
  }

  const couleurTitre = sombre ? '#fff' : T.ink
  const couleurTexte = sombre ? T.pale : T.muted
  const fond = sombre ? 'rgba(255,255,255,0.06)' : '#fff'
  const bord = sombre ? 'rgba(255,255,255,0.16)' : T.hairline

  return (
    <div style={{ background: fond, border: `1.5px solid ${bord}`, borderRadius: 14, padding: '14px 16px' }}>
      <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: couleurTitre, display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sombre ? '#fff' : T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>
        </svg>
        {consigne.titre}
      </p>

      <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12, color: couleurTexte, lineHeight: 1.6, fontWeight: 600 }}>
        {consigne.etapes.map((e, i) => <li key={i}>{e}</li>)}
      </ol>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <code style={{
          flex: 1, minWidth: 200, fontSize: 12, fontWeight: 700,
          color: sombre ? '#fff' : T.deep,
          background: sombre ? 'rgba(0,0,0,0.22)' : '#F8F6FF',
          border: `1px solid ${bord}`, borderRadius: 8, padding: '8px 10px',
          overflowX: 'auto', whiteSpace: 'nowrap', display: 'block',
        }}>
          {consigne.url}
        </code>
        <button onClick={copier}
          style={{
            flexShrink: 0, padding: '8px 14px', borderRadius: 100, cursor: 'pointer',
            border: `1.5px solid ${sombre ? '#fff' : T.main}`,
            background: copie ? (sombre ? '#fff' : T.main) : 'transparent',
            color: copie ? (sombre ? T.ink : '#fff') : (sombre ? '#fff' : T.main),
            fontWeight: 800, fontSize: 12, fontFamily: '"DM Sans", sans-serif',
          }}>
          {copie ? 'Lien copié !' : 'Copier le lien'}
        </button>
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 11, color: couleurTexte, fontWeight: 600, lineHeight: 1.5 }}>
        {consigne.note}
        {' '}
        {/* ⚠️ La phrase qui évite la déception : le bouton n'est pas à nous. */}
        C&rsquo;est Google qui décide de la façon dont il affiche ce lien.
      </p>
    </div>
  )
}
