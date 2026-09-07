'use client'
// « Comment ça marche », en tête d'un onglet du tableau de bord.
//
// 🔴 POURQUOI CE COMPOSANT EXISTE (Alex, 07/09). L'objectif du produit est
// l'autonomie : un commerçant qui s'en sort seul en parle autour de lui, un
// commerçant qui doit appeler au secours n'en parle pas. L'aide n'est donc pas
// du confort, c'est le canal d'acquisition.
//
// ⚠️ UN BLOC DÉPLIABLE, PAS UNE FENÊTRE QUI S'OUVRE TOUTE SEULE. Une modale à
// chaque clic sur un onglet est exactement la friction que ce produit combat
// partout ailleurs : on la ferme sans lire dès la deuxième fois, et l'aide
// devient un obstacle. Ici, il s'ouvre à la première visite, se replie ensuite,
// et reste rouvrable d'un mot.
//
// ⚠️ ET LE « DÉJÀ VU » EST LOCAL AU NAVIGATEUR. Rien en base : ce n'est pas une
// donnée du commerce, c'est une préférence d'affichage. Un stockage inaccessible
// (navigation privée, quota plein) ne doit rien casser : on retombe alors sur
// « ouvert », qui est le pire cas acceptable.

import { useState, useEffect } from 'react'

const CLE = (id) => `yoppaa_aide_${id}`

export default function BlocAide({ id, titre, T, children }) {
  // ⚠️ ON COMMENCE FERMÉ, PAS OUVERT. Le serveur ne connaît pas le stockage du
  // navigateur : ouvrir par défaut ferait clignoter le bloc chez tous ceux qui
  // l'ont déjà lu, à chaque chargement.
  const [ouvert, setOuvert] = useState(false)
  const [pret, setPret] = useState(false)

  useEffect(() => {
    let dejaVu = false
    try { dejaVu = localStorage.getItem(CLE(id)) === '1' } catch { dejaVu = false }
    setOuvert(!dejaVu)
    setPret(true)
  }, [id])

  function basculer() {
    const suivant = !ouvert
    setOuvert(suivant)
    // On ne mémorise que la FERMETURE : rouvrir pour relire ne doit pas
    // reprogrammer une ouverture automatique au prochain passage.
    if (!suivant) { try { localStorage.setItem(CLE(id), '1') } catch { /* stockage indisponible */ } }
  }

  if (!pret) return null

  return (
    <div style={{
      background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14,
      padding: ouvert ? '14px 16px' : '10px 14px', marginBottom: 16,
    }}>
      <button type="button" onClick={basculer}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', fontFamily: '"DM Sans", sans-serif',
        }}>
        <span style={{
          width: 20, height: 20, borderRadius: '50%', background: T.pale,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.main}
               strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7v.5"/><path d="M12 17.5v.01"/>
          </svg>
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: T.ink, letterSpacing: '-0.2px' }}>
          {titre}
        </span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.muted}
             strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
             style={{ transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>
      {ouvert && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  )
}

// Une étape de la démarche. Numérotée, parce qu'ICI l'ordre porte une
// information vraie : on ne peut pas rattacher une prestation à une plage
// avant d'avoir créé la prestation.
export function EtapeAide({ n, titre, T, children }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
      <span style={{
        width: 20, height: 20, borderRadius: '50%', background: T.main, color: '#fff',
        fontSize: 11, fontWeight: 900, display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, fontFamily: '"DM Sans", sans-serif',
      }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12.5, fontWeight: 800, color: T.deep, margin: '1px 0 2px' }}>{titre}</p>
        <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.55, margin: 0 }}>{children}</p>
      </div>
    </div>
  )
}
