'use client'
// « Préviens-moi si une place se libère. »
//
// 🔴 DEUX POINTS D'ENTRÉE, PARCE QUE LES DEUX ÉCRANS NE MONTRENT PAS LA MÊME
// CHOSE (décision d'Alex du 13/08, retrouvée dans le code le 06/09) :
//
//   • UN COURS complet reste affiché, GRISÉ. Le client voit la séance qu'il
//     veut : le bouton se pose SUR elle.
//   • UN CRÉNEAU individuel pris DISPARAÎT. Le client ne voit rien, juste
//     « aucun créneau libre ce jour-là » : le point d'entrée du solo, c'est
//     LE VIDE, et le bouton se pose dessous.
//
// D'où deux formes ici : `heure` fournie = on attend CETTE séance ; `heure`
// absente = on attend UN rendez-vous, sur une plage de dates que le client
// choisit d'un seul geste.
//
// ⚠️ ET LA PORTÉE N'EST JAMAIS ENVOYÉE AU SERVEUR. Elle se déduit là-bas de la
// capacité de la prestation : cet écran ne fait que proposer le bon geste.

import { useState, useEffect, useCallback } from 'react'
import { DUREES_FENETRE, memeHeure } from '@/lib/attente-rdv'
// 🔴 JAMAIS UN `fetch` NU VERS UNE ROUTE D'IDENTITÉ. `identiteProuvee` ne
// reconnaît personne sans le jeton en en-tête : un appel nu ferait répondre
// « pas connecté » à TOUT LE MONDE, et le bouton n'apparaîtrait jamais. C'est
// la panne du 30/08 sur le paiement, à l'identique.
import { fetchAvecPreuveSiConnecte } from '@/lib/fetch-yopper'

export default function BlocAttente({ prestation, date, heure = null, T, compact = false }) {
  const [etat, setEtat] = useState('chargement')   // chargement | pret | envoi
  const [connecte, setConnecte] = useState(false)
  const [deja, setDeja] = useState(null)
  const [duree, setDuree] = useState('semaine')
  const [erreur, setErreur] = useState('')

  const surSeance = Boolean(heure)

  // Reconnaît l'attente déjà posée sur CETTE cible. Une séance se reconnaît à
  // sa date et à son heure ; une fenêtre, à sa seule prestation (en solo le
  // plafond compte par prestation, pas par plage).
  const memeCibleQue = useCallback((a) => {
    if (!a || a.prestation_id !== prestation?.id) return false
    if (surSeance) return a.portee === 'seance' && a.date_rdv === date && memeHeure(a.heure_debut, heure)
    return a.portee === 'fenetre'
  }, [prestation?.id, surSeance, date, heure])

  const relire = useCallback(async () => {
    try {
      const r = await fetchAvecPreuveSiConnecte('/api/rdv/attente')
      const j = await r.json()
      setConnecte(Boolean(j?.connecte))
      setDeja((j?.attentes || []).find(memeCibleQue) || null)
    } catch {
      setConnecte(false)
      setDeja(null)
    }
    setEtat('pret')
  }, [memeCibleQue])

  useEffect(() => { relire() }, [relire])

  async function inscrire() {
    setEtat('envoi'); setErreur('')
    try {
      const r = await fetchAvecPreuveSiConnecte('/api/rdv/attente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inscrire',
          prestation_id: prestation?.id,
          ...(surSeance ? { date_rdv: date, heure_debut: heure } : { duree }),
        }),
      })
      const j = await r.json()
      if (!j?.ok) { setErreur(j?.error || 'Impossible pour le moment.'); setEtat('pret'); return }
      await relire()
    } catch {
      setErreur('Impossible pour le moment, réessaie dans un instant.')
      setEtat('pret')
    }
  }

  async function seRetirer() {
    if (!deja?.id) return
    setEtat('envoi'); setErreur('')
    try {
      const r = await fetchAvecPreuveSiConnecte('/api/rdv/attente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retirer', id: deja.id }),
      })
      const j = await r.json()
      if (!j?.ok) setErreur(j?.error || 'Impossible pour le moment.')
      await relire()
    } catch {
      setErreur('Impossible pour le moment, réessaie dans un instant.')
      setEtat('pret')
    }
  }

  if (etat === 'chargement') return null

  const cadre = {
    background: '#fff',
    border: `1.5px solid ${T.pale}`,
    borderRadius: 12,
    padding: compact ? '0.75rem 0.875rem' : '0.875rem 1rem',
    marginTop: 10,
  }
  const titre = { fontSize: '0.85rem', fontWeight: 800, color: T.ink, lineHeight: 1.4, letterSpacing: '-0.2px' }
  const sous = { fontSize: '0.75rem', color: T.muted, lineHeight: 1.5, marginTop: 4 }

  // ── Déjà dans la file ────────────────────────────────────────────────────
  if (deja) {
    return (
      <div style={{ ...cadre, borderColor: T.main, background: `${T.main}0A` }}>
        <p style={titre}>Tu es dans la liste d’attente.</p>
        <p style={sous}>
          {/* ⚠️ ON NE PROMET PAS UNE PLACE GARDÉE : le créneau reste réservable
              par n'importe qui. On promet d'être prévenu en premier, et c'est
              ce que le code tient. */}
          {surSeance
            ? 'Si quelqu’un se désiste, tu es prévenu avant les autres par notification.'
            : 'Dès qu’un créneau se libère sur cette période, tu es prévenu avant les autres.'}
        </p>
        <button onClick={seRetirer} disabled={etat === 'envoi'}
          style={{
            marginTop: 8, background: 'none', border: 'none', padding: 0,
            color: T.muted, fontSize: '0.75rem', fontWeight: 700,
            textDecoration: 'underline', cursor: etat === 'envoi' ? 'wait' : 'pointer',
            fontFamily: '"DM Sans", sans-serif',
          }}>
          Ne plus me prévenir
        </button>
        {erreur && <p style={{ ...sous, color: '#DC2626', fontWeight: 700 }}>{erreur}</p>}
      </div>
    )
  }

  // ── Pas connecté ─────────────────────────────────────────────────────────
  // Il faut une identité pour tenir un rang, et une notification pour joindre
  // quelqu'un en minutes : un email arriverait toujours deuxième.
  if (!connecte) {
    const retour = typeof window !== 'undefined' ? window.location.pathname : '/commander'
    return (
      <div style={cadre}>
        <p style={titre}>Une place peut se libérer.</p>
        <p style={sous}>
          Connecte-toi pour être prévenu par notification dès qu’un désistement arrive.
        </p>
        {/* ⚠️ L'ADRESSE DE CONNEXION D'UN YOPPER EST `/commander/auth`, pas
            `/login` qui est celle du commerçant et retombe sur le tableau de
            bord. C'est celle qu'emploie déjà le cœur de cette page. */}
        <a href={`/commander/auth?redirect=${encodeURIComponent(retour)}`}
          style={{
            display: 'inline-block', marginTop: 8, padding: '0.5rem 0.875rem',
            borderRadius: 10, background: T.main, color: '#fff',
            fontSize: '0.78rem', fontWeight: 800, textDecoration: 'none',
            fontFamily: '"DM Sans", sans-serif',
          }}>
          Me connecter
        </a>
      </div>
    )
  }

  // ── Le geste ─────────────────────────────────────────────────────────────
  return (
    <div style={cadre}>
      <p style={titre}>
        {surSeance ? 'Cette séance est complète.' : 'Aucun créneau ne te convient ?'}
      </p>
      <p style={sous}>
        {surSeance
          ? 'On te prévient avant les autres si quelqu’un se désiste.'
          : 'On te prévient avant les autres dès qu’une place se libère.'}
      </p>

      {/* UN SEUL geste en plus : jusqu'à quand ça t'intéresse. Pas de
          matin-midi-soir au départ, un formulaire de plus tuerait le geste. */}
      {!surSeance && (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          {DUREES_FENETRE.map(d => (
            <button key={d.cle} onClick={() => setDuree(d.cle)}
              style={{
                padding: '0.4rem 0.7rem', borderRadius: 999,
                border: `1.5px solid ${duree === d.cle ? T.main : T.pale}`,
                background: duree === d.cle ? T.main : '#fff',
                color: duree === d.cle ? '#fff' : T.muted,
                fontSize: '0.73rem', fontWeight: 800, cursor: 'pointer',
                fontFamily: '"DM Sans", sans-serif', letterSpacing: '-0.1px',
              }}>
              {d.libelle}
            </button>
          ))}
        </div>
      )}

      <button onClick={inscrire} disabled={etat === 'envoi'}
        style={{
          marginTop: 10, width: '100%', padding: '0.65rem 1rem', borderRadius: 10,
          border: 'none', background: T.main, color: '#fff',
          fontSize: '0.82rem', fontWeight: 800, letterSpacing: '-0.2px',
          cursor: etat === 'envoi' ? 'wait' : 'pointer',
          opacity: etat === 'envoi' ? 0.7 : 1,
          fontFamily: '"DM Sans", sans-serif',
        }}>
        {etat === 'envoi' ? 'Un instant…' : 'Préviens-moi'}
      </button>

      {/* ⚠️ LA PHRASE QUI REND LE GESTE LOYAL. Le commerçant verra le prénom et
          le numéro pour pouvoir prévenir : ça se dit AVANT le clic, pas dans
          une case à cocher qui ferait semblant d'être un choix. */}
      <p style={{ ...sous, fontSize: '0.68rem', marginTop: 6 }}>
        Ton prénom et ton numéro seront visibles par le commerçant pour te prévenir.
      </p>

      {erreur && <p style={{ ...sous, color: '#DC2626', fontWeight: 700 }}>{erreur}</p>}
    </div>
  )
}
