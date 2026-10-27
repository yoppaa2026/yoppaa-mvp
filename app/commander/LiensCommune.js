// « AUTRES COMMERCES À <COMMUNE> », EN BAS DE LA FICHE (27/10), composant SERVEUR.
//
// ✅ ALEX, 27/10 (tableau) : en bas de chaque fiche, seulement les liens. C'est
// par eux que Google trouve une nouvelle fiche sans attendre le plan du site
// (« Aucune page d'origine détectée » dans la Search Console, 7 Abbayes).
// Un commerce qui n'a pas de commune (pas de lieu permanent) n'en a pas.

import Link from 'next/link'
import { ficheDuCommerce } from '@/lib/reservation-metier'
import { MAX_VOISINS } from '@/lib/commerces-commune'

const T = { main: '#6B35C4', pale: '#EDE0FF', ink: '#1A0840', muted: '#6B7280' }

export default function LiensCommune({ commune, commercantId }) {
  if (!commune) return null
  const voisins = commune.commerces.filter(c => c.id !== commercantId)
  return (
    <nav aria-label={`Commerces à ${commune.nom}`}
      style={{ margin: '8px 1rem 0', padding: '14px 16px', borderTop: `1px solid ${T.pale}`, fontFamily: '"DM Sans", sans-serif' }}>
      {voisins.length > 0 && (
        <>
          <h2 style={{ margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Autres commerces à {commune.nom}
          </h2>
          <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {voisins.slice(0, MAX_VOISINS).map(c => (
              <li key={c.id} style={{ fontSize: '0.88rem' }}>
                <Link href={ficheDuCommerce(c)} style={{ color: T.ink, fontWeight: 700, textDecoration: 'none' }}>{c.nom}</Link>
                {c.type && <span style={{ color: T.muted }}> · {c.type}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      <Link href={`/commerces/${commune.slug}`} style={{ fontSize: '0.88rem', fontWeight: 800, color: T.main, textDecoration: 'none' }}>
        Tous les commerces de {commune.nom} →
      </Link>
    </nav>
  )
}
