'use client'

// LA PAGE « CONFIRME TA TABLE ».
//
// Le client d'une réservation prise au téléphone arrive ici par le lien que le
// restaurateur lui a envoyé. Il y enregistre sa carte, et rien d'autre.
//
// 🔴 CE QUE CETTE PAGE DOIT DIRE AVANT TOUT : rien ne sera débité s'il vient, et
// SA TABLE EST DÉJÀ RÉSERVÉE. Laisser croire qu'elle dépend de ce clic serait
// faux et ferait passer Yoppaa pour un service qui prend les tables en otage.
//
// ⚠️ ET ON N'ÉCRIT JAMAIS QU'UNE SOMME EST BLOQUÉE OU RETENUE : elle ne l'est
// pas. Le client irait la chercher sur son relevé et ne la trouverait pas.

import { useState, use } from 'react'
import { useSearchParams } from 'next/navigation'

const T = {
  main: '#6B35C4', deep: '#2D0F6B', ink: '#1A0840',
  muted: '#6B6485', pale: '#E9E1F8', bg: '#FAF8FF',
}

export default function PageEmpreinte({ params }) {
  const { jeton } = use(params)
  const recherche = useSearchParams()
  const etat = recherche.get('etat')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function enregistrer() {
    setErreur(null)
    setEnvoi(true)
    try {
      const res = await fetch('/api/stripe/checkout/empreinte-lien', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton }),
      })
      const data = await res.json()
      if (!data.ok || !data.url) throw new Error(data.error || 'Ce lien n’est plus valable.')
      window.location.href = data.url
    } catch (e) {
      // ⚠️ ON DIT CE QUI SE PASSE ET CE QU'IL PEUT FAIRE : un message qui
      // s'excuse sans expliquer laisse le client devant une page morte.
      setErreur(e.message)
      setEnvoi(false)
    }
  }

  const cadre = {
    minHeight: '100dvh', background: T.bg, display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: '1.25rem',
    fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  }
  const carte = {
    width: '100%', maxWidth: 440, background: '#fff', borderRadius: 18,
    border: `1px solid ${T.pale}`, padding: '1.75rem', boxShadow: '0 4px 24px rgba(26,8,64,0.07)',
  }

  if (etat === 'ok') {
    return (
      <main style={cadre}>
        <div style={carte}>
          <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: T.ink, margin: '0 0 10px', letterSpacing: '-0.4px' }}>
            Ta table est garantie
          </h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: T.muted, margin: 0 }}>
            Ta carte est enregistrée. <strong style={{ color: T.ink }}>Rien n’a été débité</strong>, et rien ne le
            sera si tu viens. À tout bientôt.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main style={cadre}>
      <div style={carte}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 900, color: T.ink, margin: '0 0 10px', letterSpacing: '-0.4px' }}>
          Confirme ta table
        </h1>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: T.muted, margin: '0 0 14px' }}>
          Ta table est <strong style={{ color: T.ink }}>déjà réservée</strong>. Pour une table de cette taille, le
          restaurant demande d’enregistrer ta carte.
        </p>
        <div style={{ background: T.bg, border: `1px solid ${T.pale}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: T.ink, margin: 0, fontWeight: 700 }}>
            Rien n’est débité si tu viens.
          </p>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: T.muted, margin: '6px 0 0' }}>
            Le restaurant ne peut facturer que si personne ne se présente, ou si tu annules trop tard pour que ta
            table soit reprise.
          </p>
        </div>

        {etat === 'annule' && (
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 10, padding: '9px 12px', margin: '0 0 14px' }}>
            Tu n’as rien enregistré. Ta table reste réservée, simplement sans garantie.
          </p>
        )}
        {erreur && (
          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '9px 12px', margin: '0 0 14px' }}>
            {erreur}
          </p>
        )}

        <button type="button" onClick={enregistrer} disabled={envoi}
          style={{
            width: '100%', padding: '0.85rem', borderRadius: 100, border: 'none',
            background: envoi ? '#C4B5E8' : `linear-gradient(135deg, ${T.deep}, ${T.main})`,
            color: '#fff', fontWeight: 800, fontSize: '0.95rem',
            cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
          {envoi ? 'Ouverture…' : 'Enregistrer ma carte'}
        </button>
        <p style={{ fontSize: '0.75rem', color: T.muted, textAlign: 'center', margin: '12px 0 0', lineHeight: 1.5 }}>
          Paiement sécurisé par Stripe. Yoppaa ne voit jamais ton numéro de carte.
        </p>
      </div>
    </main>
  )
}
