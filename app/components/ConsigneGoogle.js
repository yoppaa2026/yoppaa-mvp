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
//
// 🔴 15/10 (Alex, le Bistrologue) : UN LIEN PAR GESTE OUVERT, CHACUN AVEC SON
// CHAMP. Un restaurant qui prend des tables reçoit son lien de réservation
// (champ « Réservations »), et celui de commande s'il en prend aussi. Avant,
// il ne recevait que « Commander en ligne », même sans aucune commande.

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
  // L'adresse du lien qui vient d'être copié : chaque bouton dit le sien.
  const [copie, setCopie] = useState(null)
  if (!consigne) return null
  const liens = Array.isArray(consigne.liens) ? consigne.liens : []
  const plusieurs = liens.length > 1

  async function copier(url) {
    try {
      await navigator.clipboard.writeText(url)
      setCopie(url)
      setTimeout(() => setCopie(null), 2000)
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

      {liens.map(l => {
        const copiee = copie === l.url
        return (
          <div key={l.url} style={{ marginTop: 10 }}>
            {/* Avec deux liens, chacun dit son champ : coller la commande dans
                « Réservations » enverrait le client au mauvais endroit. */}
            {plusieurs && (
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: couleurTitre }}>
                Champ « {l.champ} »
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <code style={{
                flex: 1, minWidth: 200, fontSize: 12, fontWeight: 700,
                color: sombre ? '#fff' : T.deep,
                background: sombre ? 'rgba(0,0,0,0.22)' : '#F8F6FF',
                border: `1px solid ${bord}`, borderRadius: 8, padding: '8px 10px',
                overflowX: 'auto', whiteSpace: 'nowrap', display: 'block',
              }}>
                {l.url}
              </code>
              <button onClick={() => copier(l.url)}
                style={{
                  flexShrink: 0, padding: '8px 14px', borderRadius: 100, cursor: 'pointer',
                  border: `1.5px solid ${sombre ? '#fff' : T.main}`,
                  background: copiee ? (sombre ? '#fff' : T.main) : 'transparent',
                  color: copiee ? (sombre ? T.ink : '#fff') : (sombre ? '#fff' : T.main),
                  fontWeight: 800, fontSize: 12, fontFamily: '"DM Sans", sans-serif',
                }}>
                {copiee ? 'Lien copié !' : 'Copier le lien'}
              </button>
            </div>
          </div>
        )
      })}

      <p style={{ margin: '10px 0 0', fontSize: 11, color: couleurTexte, fontWeight: 600, lineHeight: 1.5 }}>
        {consigne.note}
        {' '}
        {/* ⚠️ La phrase qui évite la déception : le bouton n'est pas à nous. */}
        C&rsquo;est Google qui décide de la façon dont il affiche ce lien.
      </p>
    </div>
  )
}
