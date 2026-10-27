// LA FICHE ÉCRITE PAR LE SERVEUR (27/10), composant SERVEUR.
//
// ✅ ALEX, 27/10 (tableau) : la fiche du commerçant doit arriver complète chez
// Google. Ce bloc prend la place des blocs gris pendant le chargement, avec ce
// que la fiche dira ensuite : nom, métier, description, adresse du LIEU,
// téléphone, horaires, carte et prix. La fiche habituelle le remplace dès
// qu'elle a chargé, avec les mêmes informations : rien n'est montré deux fois.
//
// ⚠️ JAMAIS LE SIÈGE SOCIAL : l'adresse est celle du lieu déclaré
// (`lieuPublic`), sinon aucune.

import { euros } from '@/lib/montants'
import { extraireVille, lieuPublic } from '@/lib/fiche-seo'
import { lignesHoraires } from '@/lib/fiche-contenu-seo'
import { estItinerant } from '@/lib/lieux-activite'

const T = {
  main: '#6B35C4',
  pale: '#EDE0FF',
  ink: '#1A0840',
  deep: '#2D0F6B',
  muted: '#6B7280',
}

const titreSection = {
  margin: '0 0 8px', fontSize: '0.72rem', fontWeight: 800, color: T.muted,
  textTransform: 'uppercase', letterSpacing: '0.5px',
}
const carte = { background: '#fff', borderRadius: 12, border: `1px solid ${T.pale}`, padding: '12px 14px' }

export default function FicheServeur({ commercant: c, lieux = [], sections = [] }) {
  if (!c) return null
  const lieu = lieuPublic(lieux)
  const ville = extraireVille(lieu?.adresse)
  const horaires = estItinerant(lieux) ? [] : lignesHoraires(c.horaires_detail)
  const metier = [c.type, ville ? `à ${ville}` : null].filter(Boolean).join(' ')

  return (
    <article style={{ padding: '1.25rem 1rem 0.5rem', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink }}>
      <header>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.2 }}>{c.nom}</h1>
        {metier && <p style={{ margin: '4px 0 0', fontSize: '0.92rem', fontWeight: 700, color: T.main }}>{metier}</p>}
        {c.description && (
          <p style={{ margin: '8px 0 0', fontSize: '0.92rem', lineHeight: 1.55, color: T.deep, whiteSpace: 'pre-wrap' }}>{c.description}</p>
        )}
      </header>

      {(lieu?.adresse || c.telephone) && (
        <section style={carte}>
          <h2 style={titreSection}>Infos pratiques</h2>
          {lieu?.adresse && <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5 }}>{lieu.adresse}</p>}
          {c.telephone && (
            <p style={{ margin: lieu?.adresse ? '4px 0 0' : 0, fontSize: '0.9rem' }}>
              <a href={`tel:${String(c.telephone).replace(/\s+/g, '')}`} style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>{c.telephone}</a>
            </p>
          )}
        </section>
      )}

      {horaires.length > 0 && (
        <section style={carte}>
          <h2 style={titreSection}>Horaires</h2>
          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 16, rowGap: 4, fontSize: '0.88rem' }}>
            {horaires.map(h => (
              <div key={h.jour} style={{ display: 'contents' }}>
                <dt style={{ fontWeight: 700 }}>{h.jour}</dt>
                <dd style={{ margin: 0, color: h.texte === 'Fermé' ? T.muted : T.ink, fontVariantNumeric: 'tabular-nums' }}>{h.texte}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {sections.map(s => (
        <section key={s.titre} style={carte}>
          <h2 style={titreSection}>{s.titre}</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.elements.map((e, i) => (
              <li key={`${e.nom}-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: '0.9rem' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 700 }}>{e.nom}</span>
                  {e.detail && <span style={{ display: 'block', fontSize: '0.8rem', color: T.muted, lineHeight: 1.4 }}>{e.detail}</span>}
                </span>
                {e.prix != null && <span style={{ fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{euros(e.prix)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  )
}
