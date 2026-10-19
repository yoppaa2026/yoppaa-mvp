'use client'
// LA BARRE DU BAS DE L'APP YOPPER : Accueil · Suivi · Tribu · Profil.
//
// ✅ ALEX, 19/10 (tableau) : « le footer devrait rester visible tout le temps et
// pas uniquement sur la page d'accueil ». Elle vivait DANS l'écran principal
// (`app/commander/page.js`) : dès qu'on ouvrait une fiche, il ne restait que
// « Retour ». Choix : SUR LA FICHE, PAS DANS LE TUNNEL. La fiche la montre quand
// on parcourt, la masque du créneau ou du panier jusqu'au paiement, et la
// remontre sur l'écran de confirmation (pour aller droit dans « Suivi »).
//
// ⚠️ UN SEUL COMPOSANT pour l'écran principal et les fiches : deux copies
// auraient divergé à la première icône retouchée.
// ⚠️ LES CLASSES `navbar` ET `navbar-tabs` RESTENT : la feuille globale les
// remonte en tête de page sur grand écran (`app/globals.css`). Leur style de
// base vit ICI, parce qu'une fiche ne charge pas celui de l'écran principal.
//
// Hors de l'écran principal (`onChoisir` absent), un onglet ouvre l'écran
// principal sur cet onglet : `/commander?onglet=…`, déjà lu par celui-ci.

import { useRouter } from 'next/navigation'

const T = {
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
}

// Quand la montrer sur une fiche, et sa hauteur : `lib/barre-yopper.js`.

export default function BarreYopper({ actif = null, onChoisir = null, badge = 0, urgent = false, className = 'navbar' }) {
  const router = useRouter()
  const choisir = (cle) => {
    if (typeof onChoisir === 'function') return onChoisir(cle)
    router.push(`/commander?onglet=${encodeURIComponent(cle)}`)
  }

  return (
    <>
      <style>{`
        .navbar {
          flex-shrink: 0;
          background: ${T.bgPanel};
          border-top: 1px solid ${T.main}33;
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .navbar-tabs {
          display: flex;
          width: 100%;
          padding-left: max(env(safe-area-inset-left, 0px), 16px);
          padding-right: max(env(safe-area-inset-right, 0px), 16px);
          box-sizing: border-box;
        }
        @keyframes navPillPulse { 0%,100% { transform:scale(1); opacity:1; } 50% { transform:scale(1.35); opacity:0.72; } }
        @media (prefers-reduced-motion: reduce) {
          @keyframes navPillPulse { 0%,100% { transform:none; opacity:1; } }
        }
      `}</style>
      <nav className={className}>
        <div className="navbar-tabs">
          {[
            { key: 'accueil',   label: 'Accueil',   badge: 0 },
            // La violette PULSE quand une action attend le Yopper (commande prête
            // à retirer, ou livraison en route à réceptionner).
            { key: 'commandes', label: 'Suivi', badgeCmdUrgent: !!urgent, badge: Number(badge) || 0 },
            { key: 'tribu',     label: 'Tribu',     badge: 0 },
            { key: 'profil',    label: 'Profil',    badge: 0 },
          ].map(item => {
            const estActif = actif === item.key
            const op = estActif ? 1 : 0.5
            const stroke = '#ffffff'
            return (
              <button key={item.key} type="button" onClick={() => choisir(item.key)}
                /* Le point est décoratif pour l'œil, mais il porte une
                   information : sans ce libellé, un lecteur d'écran annoncerait
                   « Suivi » sans jamais dire qu'il s'y passe quelque chose. */
                aria-label={item.badge > 0 ? `${item.label}, ${item.badge} en cours` : undefined}
                aria-current={estActif ? 'page' : undefined}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '0.625rem 0 0.5rem', border: 'none', background: 'transparent', cursor: 'pointer', position: 'relative' }}>

                {item.key === 'accueil' && (
                  /* Maison (remplace les 3 dots horizontaux, trop proches du
                     glyphe « plus d'options » ⋯ — décision Alex 23/07). */
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <path d="M3 11 L12 3.5 L21 11" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    <path d="M5.5 9.5 L5.5 20 L18.5 20 L18.5 9.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                    <path d="M10 20 L10 14.5 L14 14.5 L14 20" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity={op}/>
                  </svg>
                )}
                {item.key === 'commandes' && (
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision" style={{ marginTop: 2 }}>
                    {/* Cadre calendrier */}
                    <rect x="3" y="5" width="18" height="16" rx="2.5" stroke={stroke} strokeWidth="2" strokeLinejoin="round" opacity={op}/>
                    {/* Barre header */}
                    <path d="M3,9.5 L21,9.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    {/* Anneaux du haut */}
                    <path d="M8,3 L8,7 M16,3 L16,7" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                    {/* 3 traits 'items de la liste' a l'interieur */}
                    <path d="M7,13   L17,13"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                    <path d="M7,16   L15,16"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                    <path d="M7,19   L13,19"   stroke={stroke} strokeWidth="1.8" strokeLinecap="round" opacity={op * 0.85}/>
                  </svg>
                )}
                {item.key === 'tribu' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <circle cx="5" cy="8" r="2.5" stroke={stroke} strokeWidth="2" opacity={op * 0.75}/>
                    <path d="M1.5,17.5 Q1.5,14 5,14 Q8.5,14 8.5,17.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op * 0.75}/>
                    <circle cx="19" cy="8" r="2.5" stroke={stroke} strokeWidth="2" opacity={op * 0.75}/>
                    <path d="M15.5,17.5 Q15.5,14 19,14 Q22.5,14 22.5,17.5" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op * 0.75}/>
                    <circle cx="12" cy="6" r="3.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    <path d="M5.5,20 Q5.5,15 12,15 Q18.5,15 18.5,20" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}
                {item.key === 'profil' && (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" shapeRendering="geometricPrecision">
                    <circle cx="12" cy="8" r="4.5" stroke={stroke} strokeWidth="2" opacity={op}/>
                    <path d="M3,21 Q3,16 12,16 Q21,16 21,21" stroke={stroke} strokeWidth="2" strokeLinecap="round" opacity={op}/>
                  </svg>
                )}

                {/* UN POINT, ET IL NE CLIGNOTE QUE QUAND ÇA T'ATTEND (Alex, 12/09).
                    Le détail commandes / rendez-vous existe À L'INTÉRIEUR de
                    l'onglet Suivi. ⚠️ LA PULSATION EST RÉSERVÉE À CE QUI ATTEND
                    UNE ACTION : une commande prête à retirer, une livraison à
                    réceptionner. Une alarme qui sonne tout le temps ne protège
                    plus rien. */}
                {item.key === 'commandes' && item.badge > 0 && (
                  <span aria-hidden="true" style={{
                    position: 'absolute', top: 6, left: 'calc(50% + 7px)',
                    width: 10, height: 10, borderRadius: '50%',
                    background: T.mid, border: '2px solid #fff',
                    boxShadow: `0 1px 5px ${T.mid}cc`,
                    animation: item.badgeCmdUrgent ? 'navPillPulse 1.5s ease-in-out infinite' : 'none',
                  }}/>
                )}

                {item.label && (
                  /* ⚠️ LE COMPTE SE RANGE DANS LE LIBELLÉ (Alex, 13/09) : le
                     libellé compte, le point appelle. */
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: estActif ? '#fff' : '#6B7280', letterSpacing: '0.2px', fontFamily: '"DM Sans", sans-serif' }}>
                    {item.badge > 0 ? `${item.label} · ${item.badge > 9 ? '9+' : item.badge}` : item.label}
                  </span>
                )}
                {estActif && <div style={{ position: 'absolute', bottom: 5, left: '50%', transform: 'translateX(-50%)', width: 22, height: 3, borderRadius: 3, background: T.light, boxShadow: `0 0 6px ${T.light}66` }}/>}
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
