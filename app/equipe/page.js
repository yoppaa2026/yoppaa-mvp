'use client'
// LE POSTE ÉQUIPE : /equipe (29/09)
//
// L'écran d'une personne de l'équipe d'un commerce : personnel en salle, au
// comptoir, livreur. PAS le tableau de bord du patron avec des onglets cachés :
// un écran à part, qui ne lit que par les routes `/api/equipe/…`.
//
// ⚠️ ÉTAPE 1 : la liste des équipes dont on fait partie. L'agenda, les
// commandes et les livraisons arrivent à l'étape 2.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DotsAttente from '@/app/components/DotsAttente'
import YoppaaLogo from '@/app/components/YoppaaLogo'
import { DROITS, libelleFinAcces } from '@/lib/equipe'

const T = { fond: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', panel: '#160636', rouge: '#B91C1C', filet: '#E7DEF6' }

export default function PosteEquipe() {
  const [etat, setEtat] = useState({ charge: false })

  useEffect(() => {
    let annule = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        window.location.href = `/login?next=${encodeURIComponent('/equipe')}`
        return
      }
      try {
        const r = await fetch('/api/equipe/mes-equipes', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
        const j = await r.json().catch(() => null)
        if (annule) return
        if (r.status === 401) { window.location.href = `/login?next=${encodeURIComponent('/equipe')}`; return }
        setEtat(j?.ok ? { charge: true, equipes: j.equipes || [] } : { charge: true, erreur: j?.error || 'Équipes illisibles.' })
      } catch {
        if (!annule) setEtat({ charge: true, erreur: 'Pas de connexion, réessaie dans un instant.' })
      }
    })()
    return () => { annule = true }
  }, [])

  let contenu
  if (!etat.charge) {
    contenu = <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><DotsAttente couleur={T.main} label="Chargement de tes équipes"/></div>
  } else if (etat.erreur) {
    contenu = <p style={{ margin: 0, color: T.rouge, fontWeight: 700 }}>{etat.erreur}</p>
  } else if (etat.equipes.length === 0) {
    contenu = (
      <p style={{ margin: 0, fontSize: 14.5, color: T.ink, lineHeight: 1.55 }}>
        Ton compte ne fait partie d&rsquo;aucune équipe pour le moment. Si un commerce t&rsquo;a envoyé une invitation par email, ouvre le lien reçu.
      </p>
    )
  } else {
    contenu = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {etat.equipes.map(e => (
          <div key={e.commercant_id} style={{ border: `1px solid ${T.filet}`, borderRadius: 14, padding: 16 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.ink }}>{e.nom}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {DROITS.filter(d => e.droits[d.cle]).map(d => (
                <span key={d.cle} style={{ fontSize: 11.5, fontWeight: 700, color: T.panel, background: T.pale, padding: '3px 10px', borderRadius: 100 }}>{d.label}</span>
              ))}
            </div>
            {e.expire_le && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: T.muted }}>Accès jusqu&rsquo;au {libelleFinAcces(e.expire_le)}</p>}
            <p style={{ margin: '10px 0 0', fontSize: 13, color: T.muted, lineHeight: 1.5 }}>Ton poste de travail arrive très bientôt ici.</p>
          </div>
        ))}
      </div>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: T.fond, padding: '24px 16px', boxSizing: 'border-box', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <YoppaaLogo size={26} mode="light"/>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1px' }}>Poste équipe</span>
        </div>
        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${T.filet}`, padding: 20 }}>{contenu}</div>
      </div>
    </main>
  )
}
