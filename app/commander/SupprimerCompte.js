'use client'
// Suppression de compte Yopper, depuis l'onglet Profil.
//
// Obligatoire à deux titres : le droit à l'effacement du RGPD, et la règle
// commune à Apple et Google qui refusent toute application permettant de créer
// un compte sans permettre de le supprimer DEPUIS l'app.
//
// Le geste est irréversible, donc il est volontairement en deux temps : on
// explique d'abord précisément ce qui disparaît et ce qui est conservé, puis on
// demande de recopier un mot. Le serveur peut refuser (commande en cours,
// rendez-vous à venir, bon cadeau avec du solde) et renvoie alors ses raisons.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { marquerDeconnexionVoulue } from '@/lib/session-permanente'

const T = { main: '#6B35C4', ink: '#1A0840', deep: '#2D0F6B', pale: '#EDE0FF', muted: '#6B7280' }
const ROUGE = '#DC2626'

export default function SupprimerCompte({ email, onSupprime }) {
  const [ouvert, setOuvert] = useState(false)
  const [saisie, setSaisie] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [raisons, setRaisons] = useState([])
  const [fait, setFait] = useState(false)

  async function supprimer() {
    if (envoi || saisie.trim().toUpperCase() !== 'SUPPRIMER') return
    setEnvoi(true); setErreur(null); setRaisons([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErreur('Ta session a expiré, reconnecte-toi puis réessaie.'); setEnvoi(false); return }
      const r = await fetch('/api/yopper/supprimer-compte', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ confirmation: 'SUPPRIMER' }),
      })
      const j = await r.json()
      if (j?.ok) {
        setFait(true)
        // Le compte n'existe plus côté serveur : on ferme la session locale.
        // ⚠️ Départ VOULU, et le plus définitif de tous : sans ce marqueur, la
        // restauration de session tenterait de reposer les jetons d'un compte
        // qui vient d'être supprimé.
        marquerDeconnexionVoulue()
        await supabase.auth.signOut().catch(() => {})
        fetch('/api/yopper/session', { method: 'DELETE' }).catch(() => {})
        onSupprime?.()
        return
      }
      if (j?.bloque) { setRaisons(j.raisons || []); setErreur(j.error || null) }
      else setErreur(j?.error || 'Suppression impossible pour le moment.')
    } catch {
      setErreur('Erreur réseau, réessaie.')
    }
    setEnvoi(false)
  }

  if (fait) {
    return (
      <div style={{ marginTop: 14, background: '#F0FDF4', border: '1px solid #A7F3D0', borderRadius: 14, padding: '14px 16px' }}>
        <p style={{ margin: '0 0 4px', fontSize: '0.9rem', fontWeight: 800, color: '#065F46' }}>Ton compte est supprimé</p>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#047857', lineHeight: 1.55 }}>
          Tes données personnelles ont été effacées. Merci d&rsquo;avoir fait un bout de chemin avec nous 🟣
        </p>
      </div>
    )
  }

  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)}
        style={{ display: 'block', width: '100%', marginTop: 14, padding: '0.6rem', background: 'transparent', color: T.muted, border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: '0.78rem', textDecoration: 'underline', fontFamily: '"DM Sans", sans-serif' }}>
        Supprimer mon compte
      </button>
    )
  }

  return (
    <div style={{ marginTop: 14, background: '#FEF2F2', border: `1px solid ${ROUGE}33`, borderRadius: 14, padding: '16px 18px' }}>
      <p style={{ margin: '0 0 8px', fontSize: '0.92rem', fontWeight: 900, color: ROUGE }}>Supprimer définitivement mon compte</p>

      <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: T.ink, lineHeight: 1.6 }}>
        <strong>Ce qui disparaît pour de bon :</strong> ton compte et ton adresse {email}, tes favoris,
        tes cartes de fidélité et les points qu&rsquo;elles contiennent, tes avis et tes suggestions.
      </p>
      <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: T.ink, lineHeight: 1.6 }}>
        <strong>Ce qui est conservé sans ton nom :</strong> tes commandes et tes rendez-vous passés,
        que la loi belge oblige les commerçants à garder sept ans pour leur comptabilité. Ils y
        apparaîtront de façon anonyme.
      </p>
      <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: T.muted, lineHeight: 1.55 }}>
        C&rsquo;est irréversible : nous ne pourrons rien restaurer.
      </p>

      {raisons.length > 0 && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.8rem', fontWeight: 800, color: '#B45309' }}>
            Pas tout de suite, il reste quelque chose en cours
          </p>
          {raisons.map((r, i) => (
            <p key={i} style={{ margin: '0 0 3px', fontSize: '0.78rem', color: '#92400E', lineHeight: 1.5 }}>• {r}</p>
          ))}
          <p style={{ margin: '6px 0 0', fontSize: '0.75rem', color: '#92400E', lineHeight: 1.5 }}>
            Reviens quand ce sera terminé, ou écris-nous à dpo@yoppaa.app.
          </p>
        </div>
      )}

      {erreur && raisons.length === 0 && (
        <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: ROUGE, fontWeight: 700 }}>{erreur}</p>
      )}

      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: T.deep, marginBottom: 6 }}>
        Recopie <strong>SUPPRIMER</strong> pour confirmer
      </label>
      <input
        value={saisie}
        onChange={e => setSaisie(e.target.value)}
        placeholder="SUPPRIMER"
        style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: 12, border: `1.5px solid ${T.pale}`, fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', marginBottom: 12, letterSpacing: '1px' }}
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={supprimer} disabled={envoi || saisie.trim().toUpperCase() !== 'SUPPRIMER'}
          style={{ flex: 1, minWidth: 150, padding: '0.8rem', borderRadius: 100, border: 'none', background: saisie.trim().toUpperCase() === 'SUPPRIMER' ? ROUGE : '#F3F4F6', color: saisie.trim().toUpperCase() === 'SUPPRIMER' ? '#fff' : '#9CA3AF', fontWeight: 800, fontSize: '0.85rem', cursor: saisie.trim().toUpperCase() === 'SUPPRIMER' ? 'pointer' : 'not-allowed', fontFamily: '"DM Sans", sans-serif' }}>
          {envoi ? 'Suppression…' : 'Supprimer mon compte'}
        </button>
        <button onClick={() => { setOuvert(false); setSaisie(''); setErreur(null); setRaisons([]) }}
          style={{ padding: '0.8rem 1.2rem', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.deep, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          Annuler
        </button>
      </div>
    </div>
  )
}
