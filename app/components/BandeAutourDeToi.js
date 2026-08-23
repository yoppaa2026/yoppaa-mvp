'use client'
// « TOUS LES COMMERCES AUTOUR DE TOI », EN UNE LIGNE.
//
// ⚠️ DEMANDE D'ALEX (bloc E) : porter le concept LÀ OÙ IL A DE LA VALEUR.
// Beaucoup de Yoppers n'arrivent jamais par l'accueil : ils scannent un QR sur
// une vitrine, ou reçoivent le lien d'une fiche. Ils voient UN commerce et
// repartent sans savoir que Yoppaa porte toute la commune.
//
// ⚠️ CORRECTION D'ALEX SUR CAPTURE (24/08) : « le message est trop long, il est
// aussi vu par des Yoppers actifs tous les jours ». C'est la remarque juste, et
// elle change la nature de l'élément. Un pavé de trois lignes qui explique ce
// qu'est Yoppaa à quelqu'un qui l'ouvre chaque matin, ce n'est pas de la
// pédagogie, c'est du bruit — et le bruit finit par se sauter des yeux, y
// compris chez celui qui en avait besoin.
//
// Alors la bande n'explique plus : elle PROPOSE UN GESTE. Une ligne, un
// chevron, le ton d'un lien de navigation. Le Yopper quotidien y lit un
// raccourci vers l'accueil ; celui qui débarque d'un QR y lit une découverte.
// La même ligne sert les deux, sans jamais prendre personne pour un débutant.
//
// ⚠️ ET ELLE NE PROMET PLUS « TOUS » LES COMMERCES DANS SON CORPS. Le titre
// reste celui d'Alex, mais plus une phrase en dessous n'affirme qu'ils y sont
// tous. Le jour où un Yopper n'y trouve pas sa boulangerie, une promesse
// exagérée se retourne contre l'application.

// ⚠️ LES POINTS VIENNENT DE LA SPEC, ILS NE SE REDESSINENT PAS.
// Alex, 24/08 : « 3 dots visibles, le logo en a 5 ». Je les avais peints à la
// main, comme l'aperçu du kit le 23/08 et comme la maquette du 19/08 : trois
// fois le même geste, trois fois faux. `pointsLogo` porte les cinq points ET
// le décalage des rangs 2-3-4, celui qui creuse le sourire.
import { pointsLogo, proportionsLogo } from '@/lib/logo'

const T = {
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  main:  '#6B35C4',
  mid:   '#9660E0',
  light: '#C4A0F4',
  pale:  '#EDE0FF',
  muted: '#6B7280',
}

// Corps de référence de la mini-signature : 24 donne un gros point d'environ
// 6 px, la bonne échelle pour une ligne de texte.
const CORPS = 24

function PointsYoppaa() {
  const { dotGap, dotOffset } = proportionsLogo(CORPS)
  const points = pointsLogo(CORPS)
  const hauteur = points[0].diametre + dotOffset
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'flex-start', gap: dotGap, height: hauteur, flexShrink: 0 }}>
      {points.map(p => (
        <span key={p.rang} style={{
          width: p.diametre, height: p.diametre, borderRadius: '50%',
          marginTop: p.decalage,
          background: p.rang % 2 === 0 ? T.light : T.main,
          display: 'block',
        }}/>
      ))}
    </span>
  )
}

export default function BandeAutourDeToi({ onVoir, titre = 'Tous les commerces autour de toi' }) {
  if (typeof onVoir !== 'function') return null

  return (
    <div style={{ padding: '0 12px', marginTop: 20 }}>
      <button onClick={onVoir}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          // Un fond clair, pas un pavé violet : la bande accompagne la page, elle
          // ne réclame pas l'attention que mérite le bouton d'achat.
          background: '#fff', border: `1.5px solid ${T.pale}`,
          borderRadius: 14, padding: '12px 14px',
          fontFamily: '"DM Sans", sans-serif',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
        <PointsYoppaa/>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: '0.85rem', color: T.ink, letterSpacing: '-0.2px' }}>
          {titre}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true">
          <path d="M9 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  )
}
