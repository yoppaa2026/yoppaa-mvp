'use client'
// ─── « Dis-lui ce que tu voudrais », une seule fois, en bas de la fiche ──────
//
// 🔴 « LES SIGNAUX YOPPER DOIVENT TOUS ÊTRE DANS LE BAS DE LA PAGE DU
// COMMERÇANT, PHRASE SIMPLE, CLAIRE ET EFFICACE » (Alex, 26/08).
//
// ⚠️ CE QUE ÇA REMPLACE : jusqu'à QUATRE bandeaux sombres pleine largeur,
// dispersés du haut au bas de la fiche. Le premier arrivait sous les
// coordonnées, avant même le catalogue : l'habitant qui venait juste voir les
// horaires se faisait interpeller par un panneau noir qui lui demandait de
// réclamer une carte de fidélité. Trois autres l'attendaient plus bas.
//
// ⚠️ ET CHACUN RÉPÉTAIT LE MÊME TITRE. « Dis-lui ce que tu voudrais » trois
// fois sur une même page, ce n'est plus une invitation, c'est une insistance.
// Un seul bloc, une seule phrase, et les envies en boutons : l'habitant lit
// une fois, choisit ce qui le concerne, et s'en va.
//
// ⚠️ RIEN À DEMANDER → RIEN DU TOUT. Chez un commerce qui propose déjà tout,
// ce composant ne rend rien : pas de cadre vide, pas de titre orphelin.

import { useState } from 'react'

const T = {
  bgPanel: '#160636',
  main:    '#6B35C4',
  light:   '#C4A0F4',
  deep:    '#2D0F6B',
}

// Le mot du BOUTON, à la première personne : un habitant ne pense pas
// « j'envoie une envie », il pense « je veux pouvoir commander ici ».
// ⚠️ Ce sont SES mots, jamais le vocabulaire du produit : pas de « formule »,
// pas de « débloquer », pas de nom de forfait.
// ⚠️ LES LIBELLÉS SONT CEUX D'ALEX (27/08), et ils nomment LE SERVICE, pas le
// geste. « Commander ici » disait ce que l'habitant ferait ; « Commande en
// ligne » dit ce qui manque au commerce. C'est la même liste que celle qu'un
// commerçant lit dans son tableau de bord : les deux côtés parlent enfin des
// mêmes choses.
//
// ⚠️ « Voir les prix » A DISPARU. Sa condition était `!canDo(plan,
// 'prix_affiches')`, or les TROIS forfaits affichent les prix : le bouton
// n'a jamais pu s'afficher chez personne. Le type `prix` reste dans
// `TYPES_ENVIE`, pour que d'anciens signaux gardent un nom.
const BOUTONS = {
  commande:  'Commande en ligne',
  livraison: 'Livraison',
  rdv:       'Prendre rendez-vous',
  fidelite:  'Carte de fidélité',
  deals:     'Bonnes affaires, deals et actus',
  // ⚠️ LE MOT DE L'HABITANT, PAS LE NÔTRE. Il ne réclame pas « l'anti-gaspi »,
  // qui est du vocabulaire de produit : il aimerait pouvoir passer en fin de
  // journée récupérer ce qui reste. Proposé aux seuls alimentaires.
  invendus:  'Invendus de fin de journée',
}

export default function SignauxYopper({ types = [], commercant }) {
  // ⚠️ UN ENVOI PAR TYPE, ET ON GARDE LA TRACE. Sans ça, cliquer sur « Être
  // livré » ferait passer les six boutons en « transmis » : le Yopper croirait
  // avoir demandé six choses qu'il n'a pas demandées.
  const [envoyes, setEnvoyes] = useState([])
  const [enCours, setEnCours] = useState(null)

  const proposables = (types || []).filter(t => BOUTONS[t])
  if (!commercant || proposables.length === 0) return null

  async function envoyer(type) {
    if (enCours || envoyes.includes(type)) return
    setEnCours(type)
    try {
      // L'anti-spam d'une envie par semaine vit côté serveur : il était dans le
      // navigateur, donc contournable, et la table n'y est plus insérable.
      await fetch('/api/signaux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'envie', feature: type, commercant_id: commercant.id }),
      })
    } catch (e) {
      // ⚠️ LE REMERCIEMENT S'AFFICHE QUAND MÊME, et c'est un choix. Le Yopper
      // n'a rien à faire d'une erreur réseau sur un geste sans conséquence
      // pour lui ; le refaire au prochain passage ne coûte rien.
    }
    setEnCours(null)
    setEnvoyes(prev => [...prev, type])
  }

  const tousEnvoyes = proposables.every(t => envoyes.includes(t))

  return (
    <div style={{ padding: '0 12px', marginTop: 24 }}>
      <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 100%)`, borderRadius: 16, padding: '16px 18px', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.main}44 0%, transparent 55%)`, pointerEvents: 'none' }}/>
        <div style={{ position: 'relative' }}>
          <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px', opacity: 0.85 }}>
            Dis-lui ce que tu voudrais
          </p>
          {/* ⚠️ UNE PHRASE, SIMPLE, ET ELLE PART DE LUI. Mots d'Alex, 27/08.
              Pas « demande à ce commerçant d'activer », qui place l'habitant en
              pétitionnaire et parle le vocabulaire interne du produit : on
              nomme un SERVICE EN PLUS, et on dit que ça tient en un clic. */}
          <p style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', lineHeight: 1.45, margin: '0 0 4px', letterSpacing: '-0.2px' }}>
            {tousEnvoyes
              ? <>C&rsquo;est transmis à <strong>{commercant.nom}</strong> 🟣</>
              : <>Tu aimerais un service en plus chez <strong>{commercant.nom}</strong> ?</>}
          </p>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: T.light, lineHeight: 1.5, margin: '0 0 12px', opacity: 0.9 }}>
            {tousEnvoyes
              ? 'Il verra combien d’habitants le demandent. Merci d’avoir pris trente secondes.'
              : 'Demande-le-lui en cliquant ci-dessous. On ne lui donne jamais ton nom.'}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {proposables.map(type => {
              const fait = envoyes.includes(type)
              const attend = enCours === type
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => envoyer(type)}
                  disabled={fait || !!enCours}
                  aria-label={fait ? `${BOUTONS[type]} : c'est transmis` : BOUTONS[type]}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 100,
                    background: fait ? 'rgba(255,255,255,0.12)' : '#fff',
                    color: fait ? '#fff' : T.main,
                    border: fait ? '1.5px solid rgba(255,255,255,0.35)' : 'none',
                    fontWeight: 800, fontSize: 12.5, fontFamily: '"DM Sans", sans-serif',
                    cursor: fait || enCours ? 'default' : 'pointer',
                    opacity: attend ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}>
                  {fait && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M5 12l5 5L20 7"/>
                    </svg>
                  )}
                  {attend ? 'Envoi…' : BOUTONS[type]}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ⚠️ EXPORTÉ POUR LE BANC, et pour que personne ne recopie ces libellés
// ailleurs. Deux listes qui se ressemblent finissent toujours par diverger.
export { BOUTONS as LIBELLES_BOUTONS_ENVIE }
