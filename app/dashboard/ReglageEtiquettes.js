'use client'
// LES ÉTIQUETTES DE COMMANDE, RÉGLÉES PAR APPAREIL (01/10).
//
// Partagé par le tableau de bord et le Poste de l'équipe : c'est l'appareil
// posé à côté de la Brother qui imprime, quel que soit l'écran ouvert dessus.
// Les règles vivent dans `lib/impression-etiquette.js`.
//
// ⚠️ RIEN AU RENDU SERVEUR : le réglage est dans le navigateur. Jusqu'à ce
// qu'il soit lu, l'appareil est réputé ne pas imprimer, ce qui est la valeur
// sûre (aucune fenêtre d'impression surprise).

import { useEffect, useState } from 'react'
import { lireImpressionActive, ecrireImpressionActive, imprimerEtiquette } from '@/lib/impression-etiquette'
import { ETIQUETTE_ESSAI, SACS_MAX, contenuEtiquette, etiquettesPourSacs } from '@/lib/etiquette-commande'

const T = { ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', vert: '#047857' }

export function useEtiquettesAppareil() {
  const [actif, setActif] = useState(false)
  useEffect(() => { setActif(lireImpressionActive()) }, [])
  const regler = (valeur) => { ecrireImpressionActive(valeur); setActif(valeur) }
  return [actif, regler]
}

function IconeImprimante({ couleur }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
    </svg>
  )
}

// ⚠️ LE RATTRAPAGE, ET LES SACS EN PLUS (Alex, 01/10 : « coller plusieurs
// étiquettes s'il y a plusieurs articles »). L'impression ne bloque jamais le
// changement de statut : plus de papier, imprimante éteinte, et la commande
// avance quand même. Ce bouton refait les étiquettes sans rien défaire, une
// par sac, numérotées. Le clic sur « Imprimer » est lui-même le geste que
// Safari exige : rien n'est attendu avant.
export function BoutonEtiquettes({ commande, categorie = null }) {
  const [sacs, setSacs] = useState(1)
  const rond = { width: 30, height: 30, borderRadius: '50%', border: `1px solid ${T.pale}`, background: '#fff', color: T.ink, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, padding: 0 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="Nombre de sacs">
        <button type="button" onClick={() => setSacs(s => Math.max(1, s - 1))} disabled={sacs <= 1}
          aria-label="Un sac de moins" style={{ ...rond, opacity: sacs <= 1 ? 0.4 : 1, cursor: sacs <= 1 ? 'default' : 'pointer' }}>−</button>
        <span style={{ minWidth: 48, textAlign: 'center', fontSize: 13, fontWeight: 800, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
          {sacs} sac{sacs > 1 ? 's' : ''}
        </span>
        <button type="button" onClick={() => setSacs(s => Math.min(SACS_MAX, s + 1))} disabled={sacs >= SACS_MAX}
          aria-label="Un sac de plus" style={rond}>+</button>
      </div>
      <button type="button" onClick={() => imprimerEtiquette(etiquettesPourSacs(contenuEtiquette(commande, { categorie }), sacs))}
        style={{ flex: 1, minWidth: 150, padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.ink, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <IconeImprimante couleur={T.ink}/>
        {sacs > 1 ? `Imprimer ${sacs} étiquettes` : 'Imprimer l’étiquette'}
      </button>
    </div>
  )
}

export default function ReglageEtiquettes({ actif, onChanger }) {
  const [ouvert, setOuvert] = useState(false)
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 14, padding: '10px 12px', marginBottom: 12 }}>
      <button type="button" onClick={() => setOuvert(o => !o)} aria-expanded={ouvert}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <IconeImprimante couleur={actif ? T.vert : T.muted}/>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: T.ink }}>Étiquettes de commande</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: actif ? T.vert : T.muted }}>
          {actif ? 'Imprimées ici' : 'Pas sur cet appareil'}
        </span>
      </button>
      {ouvert && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: T.deep }}>
            Quand tu démarres la préparation d&rsquo;une commande, son étiquette s&rsquo;imprime depuis cet appareil, avec la liste des articles à préparer. La fenêtre d&rsquo;impression s&rsquo;ouvre : la première fois, choisis ta Brother, puis touche « Imprimer ». Plusieurs sacs ? Sur la commande, choisis leur nombre : chaque étiquette porte « Sac 1/3 », « Sac 2/3 »…
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onChanger(!actif)}
              style={{ padding: '8px 14px', borderRadius: 100, border: 'none', background: actif ? '#fff' : T.main, color: actif ? T.ink : '#fff', boxShadow: actif ? `inset 0 0 0 1px ${T.pale}` : 'none', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {actif ? 'Ne plus imprimer ici' : 'Imprimer depuis cet appareil'}
            </button>
            <button type="button" onClick={() => imprimerEtiquette(ETIQUETTE_ESSAI)}
              style={{ padding: '8px 14px', borderRadius: 100, border: `1px solid ${T.pale}`, background: '#fff', color: T.ink, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Imprimer une étiquette d&rsquo;essai
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
