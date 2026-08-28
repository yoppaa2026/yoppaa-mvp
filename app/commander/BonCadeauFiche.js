'use client'
// Encart « tu as un bon cadeau ici » de la fiche commerçant (28/08).
//
// ⚠️ RIEN NE LE DISAIT. Un bon cadeau n'existait que dans l'email reçu le jour
// de l'achat : son porteur pouvait ouvrir dix fois la fiche du commerce sans
// que rien ne lui rappelle qu'il avait de l'argent à y dépenser. C'est le
// pendant exact de la carte de fidélité, qui le fait depuis le 31/07.
//
// MES bons viennent de /api/yopper/mes-bons (identité PROUVÉE), fetchés par la
// fiche. Rien ici ne vient d'une saisie : on n'affiche que ce que le serveur a
// reconnu comme appartenant au Yopper connecté.

import { euros } from '@/lib/montants'

const T = {
  vert:  '#059669',
  fond:  '#F0FDF4',
  bord:  '#10B98155',
  ink:   '#1A0840',
  deep:  '#2D0F6B',
}

function dateFr(d) {
  try {
    return new Date(d).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch { return null }
}

export default function BonCadeauFiche({ bons = [], enLigne = true }) {
  const liste = (bons || []).filter(b => Number(b?.solde) > 0)
  if (liste.length === 0) return null

  const total = liste.reduce((s, b) => s + Number(b.solde || 0), 0)
  // Le plus proche de l'expiration : la route le trie déjà, on ne re-trie pas,
  // on nomme simplement celui qui presse.
  const premier = liste[0]
  const echeance = premier.expires_at ? dateFr(premier.expires_at) : null
  const plusieurs = liste.length > 1

  return (
    <div style={{ marginTop: 12, background: T.fond, border: `1.5px solid ${T.bord}`, borderRadius: 12, padding: '10px 12px' }}>
      <p style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.62rem', fontWeight: 800, color: T.vert, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.vert} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/>
          <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
        </svg>
        {plusieurs ? 'Tes bons cadeaux' : 'Ton bon cadeau'}
      </p>

      <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 800, color: T.vert, lineHeight: 1.5 }}>
        {/* ⚠️ UN MONTANT N'EST PAS UNE INFORMATION : on dit ce qu'on peut en
            faire, et où. « 50,00 € » tout seul laisse deviner. */}
        Tu as <strong>{euros(total)}</strong> à dépenser ici
        {plusieurs ? `, sur ${liste.length} bons` : ''}.
      </p>

      {/* Le code sert AU COMPTOIR : c'est la seule porte d'entrée du
          commerçant, qui le saisit dans son tableau de bord. */}
      <p style={{ margin: '6px 0 0', fontSize: '0.72rem', fontWeight: 600, color: T.deep, lineHeight: 1.5 }}>
        {enLigne
          ? 'Au comptoir, montre ton code. En ligne, il te sera proposé au moment de payer.'
          : 'Montre ton code au comptoir, le commerçant le déduit de ton achat.'}
      </p>

      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', fontWeight: 800, color: T.ink, fontFamily: 'monospace', letterSpacing: '1px' }}>
        {premier.code}
        {plusieurs && <span style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 600, letterSpacing: 0, marginLeft: 6, opacity: 0.7 }}>et {liste.length - 1} autre{liste.length > 2 ? 's' : ''}</span>}
      </p>

      {/* ⚠️ L'ÉCHÉANCE SE DIT, SINON ELLE SURPREND. Un bon qui expire est de
          l'argent perdu, et personne ne relit un email d'il y a onze mois. */}
      {echeance && (
        <p style={{ margin: '4px 0 0', fontSize: '0.7rem', fontWeight: 600, color: T.deep, lineHeight: 1.5, opacity: 0.85 }}>
          {plusieurs ? 'Le premier expire' : 'Valable'} jusqu&rsquo;au {echeance}.
        </p>
      )}
    </div>
  )
}
