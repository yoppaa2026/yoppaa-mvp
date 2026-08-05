'use client'
// La bannière d'en-tête d'une fiche commerçant.
//
// DÉCISION D'ALEX (05/08) : c'est TOUJOURS ce visuel, pour tout le monde.
// Avant, le haut de fiche affichait la photo envoyée par le commerçant quand
// il en avait une, et un aplat mauve sinon : deux fiches côte à côte n'avaient
// donc rien en commun, et la moitié d'entre elles ne disaient même pas chez qui
// on était. Le nom en haut devient le repère fixe de toutes les fiches.
//
// Les photos ne sont pas perdues pour autant : elles descendent toutes dans le
// carrousel « Mon commerce en images », où elles sont regardées pour ce
// qu'elles sont plutôt que rognées en bandeau.

const T = {
  bgPanel: '#160636',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
}

// Uniformité ne veut pas dire que toutes les fiches doivent être le même
// rectangle. La position des halos est dérivée du NOM : deux commerces voisins
// n'ont pas exactement la même lumière, mais tous ont la même charte, et la
// bannière d'un commerce ne change jamais d'un jour à l'autre.
function empreinte(nom) {
  let h = 0
  for (let i = 0; i < String(nom || '').length; i++) {
    h = (h * 31 + nom.charCodeAt(i)) % 100000
  }
  return h
}

export default function BanniereCommerce({ nom, hauteur = '100%', taillePolice = '1.5rem' }) {
  const h = empreinte(nom)
  const x1 = 60 + (h % 30)          // 60 → 89 %
  const y1 = 10 + (Math.floor(h / 30) % 25)
  const x2 = 10 + (Math.floor(h / 700) % 25)
  const y2 = 65 + (Math.floor(h / 11000) % 25)

  return (
    <div style={{ position: 'absolute', inset: 0, height: hauteur, background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 40%, ${T.main} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', overflow: 'hidden' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at ${x1}% ${y1}%, ${T.mid}55 0%, transparent 60%), radial-gradient(circle at ${x2}% ${y2}%, ${T.light}22 0%, transparent 50%)` }}/>

      <p style={{ position: 'relative', margin: 0, fontWeight: 900, fontSize: taillePolice, color: '#fff', letterSpacing: '-0.5px', textAlign: 'center', lineHeight: 1.2, textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>
        {nom}
      </p>

      {/* Dots V2-B : la signature Yoppaa, aux proportions canoniques. C'est
          elle qui fait qu'on reconnaît une fiche Yoppaa avant même de lire. */}
      <div aria-hidden="true" style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-start', gap: 4, height: 11, marginTop: 10 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', opacity: 0.9 }}/>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.light, marginTop: 2.8 }}/>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.light, marginTop: 2.8 }}/>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.mid, marginTop: 2.8 }}/>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.mid }}/>
      </div>
    </div>
  )
}
