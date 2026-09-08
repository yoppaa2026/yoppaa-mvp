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

export default function BlocAide({ id, titre, resume = null, T, children }) {
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

  // 🔴 IL SE FONDAIT DANS LA PAGE (Alex, 08/09 : « ça se fond trop avec le
  // reste, c'est un élément important pour l'utilisateur, plus visible mais pas
  // envahissant, un peu comme les alertes dans le menu »). Une carte blanche à
  // filet gris sur un fond presque blanc : rien ne disait qu'il y avait
  // quelque chose à ouvrir, et une aide qu'on ne voit pas ne sert personne.
  //
  // ⚠️ ET LE TON RESTE CELUI DE LA MARQUE, PAS CELUI D'UNE ALARME. L'ambre du
  // menu dit « il te manque quelque chose, agis » ; ici il n'y a rien à
  // réparer, seulement quelque chose à lire. Le violet fait le même travail de
  // visibilité sans faire craindre un problème.
  return (
    <div style={{
      background: ouvert ? '#fff' : 'linear-gradient(135deg, #F5EEFF, #FBF8FF)',
      border: `1.5px solid ${ouvert ? `${T.main}44` : `${T.main}66`}`,
      boxShadow: ouvert ? 'none' : `0 2px 10px ${T.main}1F`,
      borderRadius: 14,
      padding: ouvert ? '14px 16px' : '11px 14px', marginBottom: 16,
      transition: 'background 0.2s, box-shadow 0.2s',
    }}>
      <button type="button" onClick={basculer}
        style={{
          display: 'flex', alignItems: 'center', gap: 9, width: '100%',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          textAlign: 'left', fontFamily: '"DM Sans", sans-serif',
        }}>
        {/* La pastille est PLEINE : à plat sur le pâle, elle disparaissait. */}
        <span style={{
          width: 22, height: 22, borderRadius: '50%', background: T.main,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, boxShadow: `0 2px 6px ${T.main}55`,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7v.5"/><path d="M12 17.5v.01"/>
          </svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: T.ink, letterSpacing: '-0.2px' }}>
            {titre}
          </span>
          {/* Fermé, il dit ce qu'il contient : « ouvrir pour voir » n'est pas
              une raison d'ouvrir. */}
          {!ouvert && resume && (
            <span style={{ display: 'block', fontSize: 11.5, color: T.main, fontWeight: 600, lineHeight: 1.45, marginTop: 1 }}>
              {resume}
            </span>
          )}
        </span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
          padding: '4px 10px', borderRadius: 100,
          background: ouvert ? 'transparent' : '#fff',
          border: `1px solid ${ouvert ? 'transparent' : `${T.main}55`}`,
          fontSize: 11.5, fontWeight: 800, color: T.main,
        }}>
          {ouvert ? 'Replier' : 'Lire'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main}
               strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
               style={{ transform: ouvert ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </span>
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
