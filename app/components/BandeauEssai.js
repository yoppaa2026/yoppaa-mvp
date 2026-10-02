// LE BANDEAU « SITE D'ESSAI » (02/10, demandé par Alex).
//
// Composant SERVEUR : il lit la clé Stripe du déploiement et ne rend qu'un
// oui ou un non au navigateur, jamais la clé. La règle vit dans
// `bandeauEssaiVisible` (lib/stripe-mode.js), mesurée au banc.
//
// ⚠️ IL NE GÊNE RIEN. Posé par-dessus la page (`position: fixed`), il ne
// décale aucune mise en page, et `pointer-events: none` laisse passer les
// touchers : un bouton caché dessous reste cliquable.

import { bandeauEssaiVisible } from '@/lib/stripe-mode'

export default function BandeauEssai() {
  if (!bandeauEssaiVisible()) return null
  return (
    <div
      role="note"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 4px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2147483647,
        pointerEvents: 'none',
        padding: '3px 10px',
        borderRadius: 100,
        background: '#FDE68A',
        border: '1px solid #D97706',
        color: '#78350F',
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      Site d&rsquo;essai · paiements de test
    </div>
  )
}
