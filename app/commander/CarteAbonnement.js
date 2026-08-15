'use client'
// ─── L'abonnement, vu par la cliente ─────────────────────────────────────────
//
// ⚠️ CET ÉCRAN N'EXISTAIT PAS. Depuis le 15/08 une cliente peut acheter une
// formule en ligne : elle payait, recevait un email, et l'application ne lui en
// reparlait plus jamais. Ni le solde, ni la validité, ni les séances posées.
//
// La carte vit dans « Commandes et rendez-vous », au-dessus des rendez-vous à
// venir, et PAS dans un onglet dédié : un onglet resterait vide à vie pour
// l'immense majorité des Yoppers, qui n'auront jamais d'abonnement.

import { resumeAbonnementClient, partConsommee } from '@/lib/abonnements'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  light: '#C4A0F4', pale: '#EDE0FF', muted: '#6B7280',
}

// Chaque ton porte sa couleur, et le gris n'est pas une punition : un
// abonnement terminé reste une chose qu'on a payée, il s'affiche calmement.
const TONS = {
  actif:   { bord: T.main,    fond: T.pale,    texte: T.deep,  barre: T.main },
  inconnu: { bord: T.light,   fond: T.pale,    texte: T.deep,  barre: T.light },
  epuise:  { bord: '#F59E0B', fond: '#FEF3C7', texte: '#92400E', barre: '#F59E0B' },
  termine: { bord: '#E5E7EB', fond: '#F9FAFB', texte: T.muted, barre: '#D1D5DB' },
}

export default function CarteAbonnement({ abonnement }) {
  const resume = resumeAbonnementClient(abonnement)
  if (!resume) return null

  const ton = TONS[resume.ton] || TONS.actif
  const part = partConsommee(abonnement)
  const nom = abonnement?.commercant?.nom || 'Ton abonnement'

  return (
    <div style={{ background: ton.fond, border: `1.5px solid ${ton.bord}`, borderRadius: 14, padding: 14, marginBottom: 10, boxSizing: 'border-box', maxWidth: '100%', overflowWrap: 'anywhere' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: ton.texte, textTransform: 'uppercase', letterSpacing: '1.2px', opacity: 0.8 }}>Abonnement</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', fontWeight: 900, color: T.ink, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</span>
      </div>

      <p style={{ fontSize: '1rem', fontWeight: 900, color: ton.texte, margin: '0 0 3px', lineHeight: 1.25 }}>{resume.titre}</p>
      {resume.detail && (
        <p style={{ fontSize: '0.75rem', color: ton.texte, opacity: 0.85, margin: 0, lineHeight: 1.45 }}>{resume.detail}</p>
      )}

      {/* ⚠️ LA BARRE NE S'AFFICHE QUE SI LE TOTAL EST CONNU. Une barre vide sur
          un abonnement sans nombre de séances laisserait croire à un compteur à
          zéro, alors qu'on ne sait simplement pas. */}
      {part !== null && (
        <div style={{ marginTop: 10 }}>
          <div style={{ height: 6, borderRadius: 100, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.round(part * 100)}%`, background: ton.barre, borderRadius: 100, transition: 'width 0.3s' }}/>
          </div>
          <p style={{ fontSize: '0.68rem', color: ton.texte, opacity: 0.75, margin: '5px 0 0', fontVariantNumeric: 'tabular-nums' }}>
            {abonnement.consommees} sur {abonnement.total} séance{abonnement.total > 1 ? 's' : ''} utilisée{abonnement.consommees > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
