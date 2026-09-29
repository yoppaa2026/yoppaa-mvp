'use client'
// REJOINDRE L'ÉQUIPE D'UN COMMERCE : /equipe/rejoindre?invitation=<jeton> (29/09)
//
// La personne arrive depuis l'email d'invitation. Elle n'a peut-être aucun
// compte, et ne connaît pas Yoppaa : la page dit qui l'invite, avec quelle
// adresse se connecter, puis accepte d'un clic.
//
// ⚠️ PAS DE MOT DE PASSE À INVENTER : la connexion passe par le lien magique
// de `/login`, qui crée le compte au premier passage et revient ici
// (`?next=`). Le jeton reste dans l'adresse pendant le détour : seul, il ne
// fait entrer personne, le compte doit porter l'adresse invitée (vérifié par
// le serveur, `/api/equipe/rejoindre`).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DotsAttente from '@/app/components/DotsAttente'
import YoppaaLogo from '@/app/components/YoppaaLogo'

const T = { fond: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', panel: '#160636', rouge: '#B91C1C', filet: '#E7DEF6' }
const bouton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '14px 18px', borderRadius: 100, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 15, fontFamily: '"DM Sans", sans-serif', textDecoration: 'none', boxSizing: 'border-box' }

export default function RejoindreEquipe() {
  const [jeton, setJeton] = useState(null)
  const [info, setInfo] = useState(null)        // { prenom, commerce, adresse, ouverte } ou { erreur }
  const [compte, setCompte] = useState(undefined) // undefined = on regarde ; null = personne ; sinon l'email
  const [enCours, setEnCours] = useState(false)
  const [refus, setRefus] = useState(null)
  const [fait, setFait] = useState(null)

  useEffect(() => {
    const j = new URLSearchParams(window.location.search).get('invitation')
    setJeton(j || '')
    if (!j) { setInfo({ erreur: 'Ce lien d’invitation est incomplet. Ouvre-le à nouveau depuis l’email reçu.' }); return }
    fetch('/api/equipe/invitation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitation: j }) })
      .then(r => r.json().catch(() => null))
      .then(r => setInfo(r?.ok ? r : { erreur: r?.error || 'Invitation illisible.' }))
      .catch(() => setInfo({ erreur: 'Pas de connexion, réessaie dans un instant.' }))
    // ⚠️ `getUser()` DEMANDE AU SERVEUR : un jeton qui traîne dans le
    // navigateur n'est pas une session (leçon du 14/09).
    supabase.auth.getUser()
      .then(({ data, error }) => setCompte(error || !data?.user ? null : (data.user.email || '')))
      .catch(() => setCompte(null))
  }, [])

  const retour = jeton ? `/equipe/rejoindre?invitation=${encodeURIComponent(jeton)}` : '/equipe/rejoindre'
  const lienConnexion = `/login?next=${encodeURIComponent(retour)}`

  async function rejoindre() {
    if (enCours) return
    setEnCours(true); setRefus(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) { setCompte(null); return }
      const r = await fetch('/api/equipe/rejoindre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ invitation: jeton }),
      })
      const j = await r.json().catch(() => null)
      if (!j?.ok) { setRefus(j?.error || `Impossible de rejoindre l’équipe (${r.status}).`); return }
      setFait(j.commerce || 'ton équipe')
    } catch {
      setRefus('Pas de connexion, réessaie dans un instant.')
    } finally {
      setEnCours(false)
    }
  }

  let contenu
  if (!info || compte === undefined) {
    contenu = <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><DotsAttente couleur={T.main} label="Lecture de l’invitation"/></div>
  } else if (info.erreur) {
    contenu = <p style={{ margin: 0, fontSize: 15, color: T.rouge, fontWeight: 700, lineHeight: 1.5 }}>{info.erreur}</p>
  } else if (fait) {
    contenu = (
      <>
        <h1 style={titre}>Bienvenue dans l&rsquo;équipe de {fait} 🟣</h1>
        <p style={texte}>Ton accès est prêt. Tu le retrouves à tout moment sur ton Poste équipe.</p>
        <a href="/equipe" style={{ ...bouton, background: T.panel, color: '#fff' }}>Ouvrir mon Poste équipe</a>
      </>
    )
  } else if (!info.ouverte) {
    contenu = (
      <>
        <h1 style={titre}>Cette invitation a expiré</h1>
        <p style={texte}>Demande à {info.commerce || 'ton responsable'} de te la renvoyer depuis son espace Yoppaa.</p>
      </>
    )
  } else {
    contenu = (
      <>
        <h1 style={titre}>{info.prenom ? `${info.prenom}, ` : ''}{info.commerce} t&rsquo;ouvre un accès à son équipe</h1>
        {compte === null ? (
          <>
            <p style={texte}>
              Connecte-toi avec l&rsquo;adresse qui a reçu l&rsquo;invitation (<strong>{info.adresse}</strong>). Pas de mot de passe à inventer : tu reçois un lien de connexion par email, et tu reviens ici.
            </p>
            <a href={lienConnexion} style={{ ...bouton, background: T.panel, color: '#fff' }}>Me connecter</a>
          </>
        ) : (
          <>
            <p style={texte}>Ton compte : <strong>{compte}</strong>.</p>
            {refus && <p style={{ ...texte, color: T.rouge, fontWeight: 700 }}>{refus}</p>}
            <button type="button" onClick={rejoindre} disabled={enCours} style={{ ...bouton, background: T.panel, color: '#fff', opacity: enCours ? 0.8 : 1 }}>
              {enCours ? <DotsAttente label="Entrée dans l’équipe"/> : 'Rejoindre l’équipe'}
            </button>
            <a href={lienConnexion} style={{ display: 'block', marginTop: 14, textAlign: 'center', fontSize: 13, color: T.main, fontWeight: 700 }}>
              Ce n&rsquo;est pas la bonne adresse ? Changer de compte
            </a>
          </>
        )}
      </>
    )
  }

  return (
    <main style={{ minHeight: '100vh', background: T.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', boxSizing: 'border-box', fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 20, border: `1px solid ${T.filet}`, padding: '28px 24px', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}><YoppaaLogo size={30} mode="light"/></div>
        {contenu}
      </div>
    </main>
  )
}

const titre = { margin: '0 0 12px', fontSize: 21, fontWeight: 800, color: '#1A0840', letterSpacing: '-0.4px', lineHeight: 1.25, textWrap: 'balance' }
const texte = { margin: '0 0 18px', fontSize: 14.5, color: '#1A0840', lineHeight: 1.55 }
