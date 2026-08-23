'use client'
// LA BANDE « TOUS LES COMMERCES AUTOUR DE TOI ».
//
// ⚠️ DEMANDE D'ALEX (bloc E) : porter le concept LÀ OÙ IL A DE LA VALEUR.
//
// Le problème qu'elle règle : une grande partie des Yoppers n'arrivera JAMAIS
// par l'accueil. Ils scannent un QR collé sur une vitrine, ou reçoivent le lien
// d'une fiche par message. Ils voient UN commerce, commandent peut-être, et
// repartent en croyant que Yoppaa est l'application de ce commerçant-là. Toute
// la promesse (« ton quartier dans ta poche ») leur reste invisible.
//
// ⚠️ SA PLACE EST LA FIN DE LA FICHE, jamais avant le panier : une invitation à
// partir posée au-dessus du bouton d'achat, c'est une vente en moins.
//
// ⚠️ ET ELLE NE PROMET PAS « TOUS » LES COMMERCES. Le titre est celui d'Alex,
// mais le texte dit ce qui est VRAI aujourd'hui : les commerçants inscrits de
// la commune. Le jour où un Yopper n'y trouve pas sa boulangerie, une promesse
// exagérée se retourne contre l'application.

const T = {
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  main:  '#6B21D4',
  light: '#A855F7',
  mid:   '#8B3FE8',
  pale:  '#EDE0FF',
}

export default function BandeAutourDeToi({ onVoir, titre = 'Tous les commerces autour de toi' }) {
  if (typeof onVoir !== 'function') return null

  return (
    <div style={{ padding: '0 12px', marginTop: 24 }}>
      <button onClick={onVoir}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer',
          border: 'none', borderRadius: 16, padding: '16px 18px',
          background: `linear-gradient(140deg, ${T.ink} 0%, ${T.deep} 55%, ${T.main} 100%)`,
          fontFamily: '"DM Sans", sans-serif',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
        <span style={{ minWidth: 0 }}>
          {/* Les trois points de la marque, signature Yoppaa */}
          <span style={{ display: 'flex', gap: 3, marginBottom: 7 }}>
            {[{ c: '#fff', o: 0.5, s: 5 }, { c: T.light, o: 1, s: 6 }, { c: T.mid, o: 1, s: 5 }].map((d, i) => (
              <span key={i} style={{ width: d.s, height: d.s, borderRadius: '50%', background: d.c, opacity: d.o, display: 'block' }}/>
            ))}
          </span>
          <span style={{ display: 'block', fontWeight: 900, fontSize: '1rem', color: '#fff', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
            {titre}
          </span>
          <span style={{ display: 'block', fontSize: '0.76rem', color: T.pale, fontWeight: 600, marginTop: 4, lineHeight: 1.45 }}>
            Yoppaa réunit les commerçants de ta commune. Boulangerie, coiffeur,
            pharmacie&nbsp;: ils sont tous dans la même application.
          </span>
        </span>
        <span aria-hidden="true" style={{
          flexShrink: 0, width: 34, height: 34, borderRadius: '50%',
          background: 'rgba(255,255,255,0.14)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6l6 6-6 6"/>
          </svg>
        </span>
      </button>
    </div>
  )
}
