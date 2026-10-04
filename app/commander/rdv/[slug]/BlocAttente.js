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
import { Bell } from 'lucide-react'
import { DUREES_FENETRE, attenteSur, seanceLisible } from '@/lib/attente-rdv'
// 🔴 JAMAIS UN `fetch` NU VERS UNE ROUTE D'IDENTITÉ. `identiteProuvee` ne
// reconnaît personne sans le jeton en en-tête : un appel nu ferait répondre
// « pas connecté » à TOUT LE MONDE, et le bouton n'apparaîtrait jamais. C'est
// la panne du 30/08 sur le paiement, à l'identique.
import { fetchAvecPreuveSiConnecte } from '@/lib/fetch-yopper'
// 🔴 LES NOTIFICATIONS D'ABORD (Alex, 04/10 : « il doit avoir les notifs ») :
// voir `lib/notifs-attente`. L'activation se demande DANS le clic, avant
// l'inscription : sur iPhone, un `await` placé avant ferait perdre le geste.
import { activerNotifications, lireEtatPush } from '@/app/components/OneSignalInit'
import { etatNotifsAttente, phraseNotifsRefusees, phraseNotifsAvant } from '@/lib/notifs-attente'

// ⚠️ LA PROMESSE TENUE PAR LE CODE, ET RIEN DE PLUS. La file prévient dans
// l'ordre d'arrivée, un quart d'heure d'écart entre chaque personne, et ne
// bloque jamais le créneau (arbitrage d'Alex, 06/09).
//
// 🔴 ET ELLE DIT QUI VOIT QUOI (04/10). Depuis la décision d'Alex, la commerçante
// voit le prénom et le téléphone des personnes qui attendent un cours, pour
// pouvoir appeler quand une place se libère au dernier moment. La personne le
// sait AVANT de s'inscrire : c'est la condition pour que ce soit loyal (RGPD).
// C'est toujours la notification qui prévient, dans l'ordre.
const PROMESSE = 'On te prévient par notification. Le commerce voit ton prénom et ton téléphone. La place n’est pas gardée : la première personne qui réserve la prend.'

// Où le Yopper retrouve ses attentes une fois la fiche quittée.
const LIEN_MES_ATTENTES = '/commander?onglet=commandes&tab=rdvs'

export default function BlocAttente({ prestation, date, heure = null, T, compact = false, onChange = null }) {
  const [etat, setEtat] = useState('chargement')   // chargement | pret | envoi
  const [connecte, setConnecte] = useState(false)
  const [deja, setDeja] = useState(null)
  const [duree, setDuree] = useState('semaine')
  const [erreur, setErreur] = useState('')
  const [notif, setNotif] = useState('inconnu')

  const surSeance = Boolean(heure)
  const prestationId = prestation?.id || null

  const relire = useCallback(async () => {
    try {
      const r = await fetchAvecPreuveSiConnecte('/api/rdv/attente')
      const j = await r.json()
      setConnecte(Boolean(j?.connecte))
      setDeja(attenteSur(j?.attentes, { prestationId, date, heure }))
    } catch {
      setConnecte(false)
      setDeja(null)
    }
    setEtat('pret')
  }, [prestationId, date, heure])

  useEffect(() => { relire() }, [relire])

  // L'état des notifications. Le module se charge après la page : on relit
  // SIX FOIS AU PLUS, puis on s'arrête (le clic retentera de toute façon).
  // ⚠️ UNE RELECTURE BORNÉE, PAS UN RELEVÉ : rien ne tourne au-delà de cinq
  // secondes, écran allumé ou non.
  useEffect(() => {
    let essais = 0
    let t = null
    const lire = () => {
      const e = lireEtatPush()
      setNotif(etatNotifsAttente(e))
      return Boolean(e?.pret)
    }
    const essayer = () => { essais++; if (!lire() && essais < 6) t = setTimeout(essayer, 800) }
    if (!lire()) t = setTimeout(essayer, 800)
    return () => clearTimeout(t)
  }, [])

  // Demande les notifications. `true` si elles sont actives au retour.
  // ⚠️ APPELÉE EN PREMIER DANS LE CLIC, sans `await` avant elle.
  async function exigerNotifications() {
    if (etatNotifsAttente(lireEtatPush()) === 'actif') return true
    const res = await activerNotifications()
    setNotif(etatNotifsAttente(lireEtatPush()))
    if (!res?.ok) { setErreur(phraseNotifsRefusees(res?.raison)); return false }
    setNotif('actif')
    return true
  }

  // Relit, PUIS prévient la fiche : sa grille marque la séance où il attend,
  // et doit le savoir tout de suite, pas au prochain chargement.
  const relireEtPrevenir = async () => { await relire(); onChange?.() }

  async function inscrire() {
    setEtat('envoi'); setErreur('')
    if (!await exigerNotifications()) { setEtat('pret'); return }
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
      await relireEtPrevenir()
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
      await relireEtPrevenir()
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
  const note = { ...sous, fontSize: '0.68rem', marginTop: 6 }

  // 🔴 LA FENÊTRE NE DISAIT PAS CE QU'ELLE ÉTAIT (Alex, 03/10 : « quand la
  // fenêtre s'ouvre elle ne dit pas LISTE D'ATTENTE »). Le surtitre la nomme
  // dans les trois états, et nomme ce qu'on attend : la séance cliquée, ou la
  // prestation en solo, où aucune séance n'est visée.
  const quoi = surSeance ? seanceLisible(date, heure) : (prestation?.nom || '')
  const surtitre = (
    <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
      <Bell size={12} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span>Liste d’attente{quoi ? ` · ${quoi}` : ''}</span>
    </p>
  )

  // ── Déjà dans la file ────────────────────────────────────────────────────
  if (deja) {
    return (
      <div style={{ ...cadre, borderColor: T.main, background: `${T.main}0A` }}>
        {surtitre}
        <p style={titre}>
          {!surSeance && deja.libelle ? `Tu es sur la liste d’attente ${deja.libelle}.` : 'Tu es sur la liste d’attente.'}
        </p>
        <p style={sous}>
          {/* ⚠️ ON NE PROMET PAS UNE PLACE GARDÉE : le créneau reste réservable
              par n'importe qui. On promet d'être prévenu, dans l'ordre des
              inscriptions, et c'est ce que le code tient. */}
          {surSeance
            ? 'Si quelqu’un se désiste, les personnes en attente sont prévenues dans l’ordre des inscriptions.'
            : 'Dès qu’un créneau se libère sur cette période, les personnes en attente sont prévenues dans l’ordre des inscriptions.'}
        </p>
        <p style={note}>{PROMESSE}</p>
        {/* 🔴 DÉJÀ INSCRIT, NOTIFICATIONS COUPÉES (04/10) : il croirait être
            prévenu. On le dit, et on propose de les rallumer. */}
        {(notif === 'a_demander' || notif === 'bloque' || notif === 'non_supporte') && (
          <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, background: '#FFFBEB', border: '1.5px solid #FCD34D' }}>
            <p style={{ ...sous, marginTop: 0, color: '#92400E', fontWeight: 700 }}>
              Tes notifications sont coupées : on ne pourra pas te prévenir.
              {notif !== 'a_demander' ? ` ${phraseNotifsAvant(notif)}` : ''}
            </p>
            {notif !== 'non_supporte' && (
              <button onClick={async () => { setErreur(''); await exigerNotifications() }}
                style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: '#92400E', fontSize: '0.75rem', fontWeight: 800, textDecoration: 'underline', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                Activer les notifications
              </button>
            )}
          </div>
        )}
        {/* 🔴 « OÙ VOIT-IL QU'IL EST EN LISTE D'ATTENTE ? » (Alex, 03/10). Ici,
            et dans son espace : on lui dit où, sans quoi il l'oublie. */}
        <p style={note}>
          Tu la retrouves dans <a href={LIEN_MES_ATTENTES} style={{ color: T.main, fontWeight: 700 }}>Suivi, onglet Rendez-vous</a>.
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
        {surtitre}
        <p style={titre}>Une place peut se libérer.</p>
        <p style={sous}>
          Connecte-toi pour t’inscrire : si quelqu’un se désiste, tu reçois une notification.
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
      {surtitre}
      {/* ⚠️ EN SOLO, LE TITRE NE RÉPÈTE PLUS LE VIDE (03/10). Il s'affiche sous
          « Aucun créneau libre ce jour-là » : « Aucun créneau ne te convient ? »
          redisait la même chose en posant une question. */}
      <p style={titre}>
        {surSeance ? 'Cette séance est complète.' : 'Une place peut encore se libérer.'}
      </p>
      <p style={sous}>
        {surSeance
          ? 'Inscris-toi : si quelqu’un se désiste, les personnes en attente sont prévenues dans l’ordre des inscriptions.'
          : 'Choisis jusqu’à quand ça t’intéresse, à partir d’aujourd’hui.'}
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

      {/* ⚠️ DIT AVANT LE CLIC quand les notifications manquent : sur un
          navigateur qui ne les reçoit pas, pas de bouton, on dit quoi faire. */}
      {phraseNotifsAvant(notif) && <p style={{ ...note, color: notif === 'actif' ? T.muted : '#92400E', fontWeight: 700 }}>{phraseNotifsAvant(notif)}</p>}

      {notif !== 'non_supporte' && <button onClick={inscrire} disabled={etat === 'envoi'}
        style={{
          marginTop: 10, width: '100%', padding: '0.65rem 1rem', borderRadius: 10,
          border: 'none', background: T.main, color: '#fff',
          fontSize: '0.82rem', fontWeight: 800, letterSpacing: '-0.2px',
          cursor: etat === 'envoi' ? 'wait' : 'pointer',
          opacity: etat === 'envoi' ? 0.7 : 1,
          fontFamily: '"DM Sans", sans-serif',
        }}>
        {etat === 'envoi' ? 'Un instant…' : notif === 'actif' ? 'Préviens-moi' : 'Activer les notifications et m’inscrire'}
      </button>}

      {/* ⚠️ LA PHRASE QUI REND LE GESTE LOYAL, dite AVANT le clic. */}
      <p style={note}>{PROMESSE}</p>

      {erreur && <p style={{ ...sous, color: '#DC2626', fontWeight: 700 }}>{erreur}</p>}
    </div>
  )
}
