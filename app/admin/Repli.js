'use client'
//
// UN BLOC QUI SE PLIE, ET DONT LE TITRE CONTINUE DE PARLER.
//
// 🔴 « C'EST BEAUCOUP TROP GRAND » (Alex, 30/08, sur les 260 communes). Un
// tableau de bord où il faut faire défiler trois écrans pour atteindre ce qu'on
// vient chercher n'est pas un tableau de bord, c'est une archive.
//
// ⚠️ MAIS UN BLOC REPLIÉ NE DOIT PAS DEVENIR MUET. C'est la règle « personne ne
// cherche une information » : si le titre ne dit rien quand il est fermé, il
// faut l'ouvrir pour savoir s'il vaut la peine d'être ouvert, et on n'a rien
// gagné. Le résumé reste donc TOUJOURS visible, plié ou déplié.
//
// ⚠️ ET IL DIT QUAND IL CACHE DU TRAVAIL EN COURS. Replier sur une modification
// non enregistrée la ferait disparaître de l'écran sans la perdre : c'est
// exactement la façon dont on égare une saisie. `alerte` est là pour ça.

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const T = {
  main: '#6B35C4',
  ink: '#1A0840',
  muted: '#6B7280',
  hairline: '#E9E4F5',
}

export default function Repli({
  titre,
  // Ce que le titre dit encore une fois plié. Sans lui, replier revient à
  // cacher l'information au lieu de la ranger.
  resume = null,
  // Ce qui doit rester cliquable même plié (un « Rafraîchir », par exemple).
  actions = null,
  // Une phrase courte affichée SOUS le titre quand le bloc est plié et qu'il
  // cache quelque chose qui appelle un geste.
  alerte = null,
  ouvertParDefaut = false,
  children,
}) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut)

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: ouvert ? 14 : 0 }}>
        {/* ⚠️ LE TITRE ENTIER EST LE BOUTON. Une flèche de 16 pixels au doigt,
            c'est une cible qu'on rate une fois sur trois. */}
        <button
          type="button"
          onClick={() => setOuvert(o => !o)}
          aria-expanded={ouvert}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none',
            padding: '6px 0', margin: 0, cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0,
            fontFamily: '"DM Sans", sans-serif', color: T.ink,
          }}
        >
          <ChevronDown
            size={20}
            strokeWidth={2.5}
            style={{
              color: T.main, flexShrink: 0,
              transform: ouvert ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 140ms ease',
            }}
          />
          <span style={{ minWidth: 0 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px' }}>{titre}</span>
            {resume}
          </span>
        </button>
        {actions}
      </div>

      {/* ⚠️ L'ALERTE NE S'AFFICHE QUE PLIÉ : dépliée, elle doublerait ce qu'on
          voit déjà. Repliée, elle est la seule chose qui empêche d'oublier. */}
      {!ouvert && alerte && (
        <p style={{ margin: '2px 0 0 30px', fontSize: 13, color: '#B45309', fontWeight: 700 }}>
          {alerte}
        </p>
      )}

      {/* ⚠️ ON DÉMONTE LE CONTENU, on ne le cache pas en CSS : deux cent
          soixante lignes gardées dans le document coûtent à chaque défilement,
          et c'est précisément le poids qu'on cherche à retirer. */}
      {ouvert && children}
    </section>
  )
}
