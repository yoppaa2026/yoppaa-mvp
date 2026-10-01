'use client'
// LE POSTE ÉQUIPE : /equipe (29/09)
//
// L'écran d'une personne de l'équipe d'un commerce : personnel en salle, au
// comptoir, livreur. PAS le tableau de bord du patron avec des onglets cachés :
// un écran à part, qui ne lit que par les routes `/api/equipe/…`.
//
// Une seule équipe : le poste s'ouvre directement. Plusieurs (un extra qui
// travaille dans deux commerces) : on choisit.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { marquerDeconnexionVoulue } from '@/lib/session-permanente'
import DotsAttente from '@/app/components/DotsAttente'
import YoppaaLogo from '@/app/components/YoppaaLogo'
import { DROITS, libelleFinAcces } from '@/lib/equipe'
import PosteEquipe from './PosteEquipe'
import { lirePoste, commerceARouvrir, ecrirePoste, lireDernierCommerce, retenirDernierCommerce } from '@/lib/poste-adresse'

const T = { fond: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', panel: '#160636', rouge: '#B91C1C', filet: '#E7DEF6' }

export default function PageEquipe() {
  const [etat, setEtat] = useState({ charge: false })
  const [choisie, setChoisie] = useState(null)
  function choisir(e) {
    setChoisie(e)
    retenirDernierCommerce(e.commercant_id)
    ecrirePoste({ commerce: e.commercant_id })
  }
  function changer() {
    setChoisie(null)
    retenirDernierCommerce(null)
    ecrirePoste({ commerce: null, onglet: null, filtre: null })
  }

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
        if (!j?.ok) { setEtat({ charge: true, erreur: j?.error || 'Équipes illisibles.' }); return }
        const equipes = j.equipes || []
        setEtat({ charge: true, equipes })
        // ⚠️ ON REPREND OÙ ON ÉTAIT (Alex, 01/10) : l'adresse, sinon le dernier
        // commerce de cet appareil (lib/poste-adresse.js).
        const rouvrir = commerceARouvrir(equipes, { adresse: lirePoste(window.location.search).commerce, appareil: lireDernierCommerce() })
        if (rouvrir) choisir(rouvrir)
      } catch {
        if (!annule) setEtat({ charge: true, erreur: 'Pas de connexion, réessaie dans un instant.' })
      }
    })()
    return () => { annule = true }
  }, [])

  // ⚠️ SUR UNE TABLETTE PARTAGÉE, IL FAUT POUVOIR CHANGER DE COMPTE. La
  // déconnexion est marquée comme VOULUE, sinon la session permanente la
  // rétablirait aussitôt (leçon du 14/09, `app/login/page.js`).
  async function seDeconnecter() {
    marquerDeconnexionVoulue()
    const { error } = await supabase.auth.signOut()
    if (error) await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    window.location.href = `/login?next=${encodeURIComponent('/equipe')}`
  }

  let contenu
  if (!etat.charge) {
    contenu = <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><DotsAttente couleur={T.main} label="Chargement de tes équipes"/></div>
  } else if (etat.erreur) {
    contenu = <p style={{ margin: 0, color: T.rouge, fontWeight: 700 }}>{etat.erreur}</p>
  } else if (choisie) {
    contenu = <PosteEquipe equipe={choisie} onChanger={etat.equipes.length > 1 ? changer : null}/>
  } else if (etat.equipes.length === 0) {
    contenu = (
      <p style={{ margin: 0, fontSize: 14.5, color: T.ink, lineHeight: 1.55 }}>
        Ton compte ne fait partie d&rsquo;aucune équipe pour le moment. Si un commerce t&rsquo;a envoyé une invitation par email, ouvre le lien reçu.
      </p>
    )
  } else {
    contenu = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 14.5, color: T.ink }}>Choisis le commerce où tu travailles :</p>
        {etat.equipes.map(e => (
          <button key={e.commercant_id} type="button" onClick={() => choisir(e)}
            style={{ textAlign: 'left', border: `1px solid ${T.filet}`, borderRadius: 14, padding: 16, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: T.ink }}>{e.nom}</span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {DROITS.filter(d => e.droits[d.cle]).map(d => (
                <span key={d.cle} style={{ fontSize: 11.5, fontWeight: 700, color: T.panel, background: T.pale, padding: '3px 10px', borderRadius: 100 }}>{d.label}</span>
              ))}
            </span>
            {e.expire_le && <span style={{ display: 'block', marginTop: 8, fontSize: 12.5, color: T.muted }}>Accès jusqu&rsquo;au {libelleFinAcces(e.expire_le)}</span>}
          </button>
        ))}
      </div>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: T.fond, padding: '20px 16px 32px', boxSizing: 'border-box', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ maxWidth: choisie ? 1180 : 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12 }}>
          <YoppaaLogo size={26} mode="light"/>
          <span style={{ fontSize: 12, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1px' }}>Poste équipe</span>
        </div>
        {choisie ? contenu : <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${T.filet}`, padding: 20 }}>{contenu}</div>}
        {etat.charge && (
          <p style={{ margin: '24px 0 0', textAlign: 'center' }}>
            <button type="button" onClick={seDeconnecter} style={{ background: 'none', border: 'none', color: T.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
              Se déconnecter
            </button>
          </p>
        )}
      </div>
    </main>
  )
}
