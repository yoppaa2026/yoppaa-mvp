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
// 🔴 ET ELLE DOIT DIRE LE MONTANT GARANTI (16/09). Elle ne le disait pas : le
// client donnait sa carte sans savoir ce qu'il engageait. Le bouton n'apparaît
// donc plus tant que la somme n'est pas connue, parce qu'un bouton affiché
// avant elle, c'est une signature avant lecture.
//
// ⚠️ ET ON N'ÉCRIT JAMAIS QU'UNE SOMME EST BLOQUÉE OU RETENUE : elle ne l'est
// pas. Le client irait la chercher sur son relevé et ne la trouverait pas.

import { useState, useEffect, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { euros } from '@/lib/montants'

const T = {
  main: '#6B35C4', deep: '#2D0F6B', ink: '#1A0840',
  muted: '#6B6485', pale: '#E9E1F8', bg: '#FAF8FF',
}

// Ce que le client lit quand le lien ne peut plus servir. ⚠️ AUCUN DE CES
// TITRES N'AFFIRME QUE LA TABLE TIENT : sur une réservation annulée ou déjà
// facturée, ce serait faux. La phrase qui rassure est réservée aux cas où elle
// est vraie, et le serveur donne le reste du message.
const TITRES = {
  expire: 'Ce lien a expiré',
  plus_demandee: 'Plus de carte à enregistrer',
  stripe_absent: 'Impossible pour le moment',
  reseau: 'Connexion perdue',
  lecture: 'Réessaie dans un instant',
  pas_confirmee: 'Cette table n’attend plus de carte',
  deja_debitee: 'Cette table n’attend plus de carte',
  service_commence: 'Cette table n’attend plus de carte',
}
const TABLE_TIENT = ['expire', 'plus_demandee', 'stripe_absent']

function quandLisible(date, heure) {
  if (!date) return null
  // ⚠️ MIDI, JAMAIS MINUIT : c'est le motif du dépôt. Une date lue à 00:00 dans
  // un fuseau en retard recule d'un jour, et la table du samedi s'affiche
  // vendredi.
  const d = new Date(`${date}T12:00:00`)
  if (isNaN(d.getTime())) return null
  const jour = d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
  return heure ? `${jour} à ${heure}` : jour
}

export default function PageEmpreinte({ params }) {
  const { jeton } = use(params)
  const recherche = useSearchParams()
  const etat = recherche.get('etat')
  const [details, setDetails] = useState(null)
  const [refus, setRefus] = useState(null)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  // Ce que la table garantit, lu AVANT tout geste. La même route, la même règle
  // et le même montant que ceux qui partiront chez Stripe : ils sortent du même
  // module serveur, jamais de deux calculs jumeaux.
  useEffect(() => {
    // Au retour de Stripe, la carte est posée : la table est garantie, il n'y a
    // plus rien à annoncer ni à demander.
    if (etat === 'ok') return
    let vivant = true
    ;(async () => {
      try {
        const res = await fetch('/api/rdv/empreinte-details', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jeton }),
        })
        const data = await res.json()
        if (!vivant) return
        if (data?.ok) setDetails(data)
        else setRefus({ code: data?.code || 'inconnu', error: data?.error || 'Ce lien n’est pas valable.' })
      } catch {
        // ⚠️ UNE COUPURE RÉSEAU N'EST PAS UN LIEN MORT : on ne renvoie pas le
        // client appeler son restaurant pour un lien parfaitement bon.
        if (vivant) setRefus({ code: 'reseau', error: 'Ta table n’a pas pu être lue. Réessaie dans un instant.' })
      }
    })()
    return () => { vivant = false }
  }, [jeton, etat])

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
  const titre = { fontSize: '1.3rem', fontWeight: 900, color: T.ink, margin: '0 0 10px', letterSpacing: '-0.4px' }

  // ⚠️ UN CLIENT QUI ROUVRE SON LIEN APRÈS COUP N'EST PAS UNE ERREUR : sa carte
  // est posée, il lit la même confirmation qu'au retour de Stripe.
  if (etat === 'ok' || refus?.code === 'deja_garantie') {
    return (
      <main style={cadre}>
        <div style={carte}>
          <h1 style={titre}>Ta table est garantie</h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: T.muted, margin: 0 }}>
            Ta carte est enregistrée. <strong style={{ color: T.ink }}>Rien n’a été débité</strong>, et rien ne le
            sera si tu viens. À tout bientôt.
          </p>
        </div>
      </main>
    )
  }

  if (refus) {
    return (
      <main style={cadre}>
        <div style={carte}>
          <h1 style={titre}>{TITRES[refus.code] || 'Ce lien n’est pas valable'}</h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: T.muted, margin: 0 }}>{refus.error}</p>
          {TABLE_TIENT.includes(refus.code) && (
            <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: T.ink, margin: '10px 0 0', fontWeight: 700 }}>
              Ta table reste réservée : elle ne dépend pas de ce lien.
            </p>
          )}
        </div>
      </main>
    )
  }

  // 🔴 PAS DE BOUTON TANT QUE LE MONTANT N'EST PAS LÀ. Tout le reste de la page
  // peut s'afficher, le geste non : il engage une carte sur une somme.
  if (!details) {
    return (
      <main style={cadre}>
        <div style={carte}>
          <h1 style={titre}>Confirme ta table</h1>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: T.muted, margin: 0 }}>
            Un instant, on retrouve ta table…
          </p>
        </div>
      </main>
    )
  }

  const quand = quandLisible(details.date_rdv, details.heure_debut)
  const couverts = Number(details.couverts) || 0

  return (
    <main style={cadre}>
      <div style={carte}>
        <h1 style={titre}>Confirme ta table</h1>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.6, color: T.muted, margin: '0 0 14px' }}>
          Ta table chez <strong style={{ color: T.ink }}>{details.commerce}</strong> est{' '}
          <strong style={{ color: T.ink }}>déjà réservée</strong>. Pour une table de cette taille, le
          restaurant demande d’enregistrer ta carte.
        </p>

        {/* Quelle table, exactement. Deux liens reçus le même jour se
            ressemblaient trait pour trait. */}
        {(quand || couverts > 0) && (
          <p style={{ fontSize: '0.9rem', lineHeight: 1.5, color: T.ink, fontWeight: 700, margin: '0 0 14px' }}>
            {[quand, couverts > 0 ? `${couverts} personne${couverts > 1 ? 's' : ''}` : null]
              .filter(Boolean).join(' · ')}
          </p>
        )}

        <div style={{ background: T.bg, border: `1px solid ${T.pale}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <p style={{ fontSize: '0.9rem', lineHeight: 1.6, color: T.ink, margin: 0, fontWeight: 700 }}>
            Rien n’est débité si tu viens.
          </p>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: T.muted, margin: '6px 0 0' }}>
            {`Le restaurant ne peut facturer ${euros(details.montant)} que si personne ne se présente${
              details.delai_heures > 0
                ? `, ou si tu annules moins de ${details.delai_heures} h avant`
                : ', ou si tu annules trop tard pour que ta table soit reprise'}.`}
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
