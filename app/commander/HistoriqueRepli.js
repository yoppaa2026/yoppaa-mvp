'use client'
//
// L'HISTORIQUE SE PLIE, ET SON TITRE CONTINUE DE PARLER.
//
// 🔴 DEMANDE D'ALEX, 31/08, sur l'onglet Suivi : les trois listes terminées
// poussent vers le bas ce que le Yopper vient réellement chercher, c'est-à-dire
// ce qui est EN COURS. Une commande d'il y a trois semaines n'a pas à occuper la
// moitié de l'écran d'une commande de ce matin.
//
// ⚠️ MAIS UN BLOC REPLIÉ NE DOIT PAS DEVENIR MUET, et c'est la même règle que
// pour les communes de l'admin : si le titre ne dit rien quand il est fermé, il
// faut l'ouvrir pour savoir s'il vaut la peine d'être ouvert. Le COMPTE reste
// donc toujours visible. « Historique » seul ne dit rien ; « Historique · 3
// commandes » dit s'il y a quelque chose à y chercher.
//
// ⚠️ ET ON DÉMONTE LE CONTENU, on ne le cache pas en CSS. Sur un téléphone, des
// dizaines de cartes gardées dans le document coûtent à chaque défilement, et
// c'est précisément le poids qu'on cherche à retirer.
//
// ⚠️ CE N'EST PAS LE `Repli` DE L'ADMIN, ET C'EST VOLONTAIRE. Là-bas le titre
// pèse 22 pixels en gras noir, ici l'application parle en petites majuscules
// grises barrées d'un filet. Réutiliser le composant aurait importé une autre
// langue visuelle dans l'écran du Yopper.

import { useState } from 'react'

const T = {
  main:  '#6B35C4',
  pale:  '#EDE0FF',
  muted: '#6B7280',
}

export default function HistoriqueRepli({
  // Ce que le titre dit encore une fois plié : « 3 commandes », « 5 rendez-vous ».
  // Sans lui, replier revient à cacher au lieu de ranger.
  compte,
  titre = 'Historique',
  ouvertParDefaut = false,
  style = null,
  children,
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)

  return (
    <div style={style || undefined}>
      {/* ⚠️ TOUTE LA BARRE EST LE BOUTON, filet compris. Une flèche de seize
          pixels au doigt, c'est une cible qu'on rate une fois sur trois. */}
      <button
        type="button"
        onClick={() => setOuvert(o => !o)}
        aria-expanded={ouvert}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          background: 'none', border: 'none', padding: '4px 0', margin: '0 0 10px',
          cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main}
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          style={{ flexShrink: 0, transform: ouvert ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 140ms ease' }}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
        <span style={{ fontWeight: 700, fontSize: '0.7rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {titre}
        </span>
        {compte ? (
          <span style={{ fontWeight: 700, fontSize: '0.7rem', color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            · {compte}
          </span>
        ) : null}
        <span style={{ flex: 1, height: 1, background: T.pale }}/>
      </button>

      {ouvert && children}
    </div>
  )
}
