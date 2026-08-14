'use client'
// LE BLOC « ABONNEMENTS » DE LA FICHE, où un client achète son carnet ou son
// année sans passer par le comptoir.
//
// Décision d'Alex du 15/08 : un bloc à part, sous les prestations, et PAS un
// article de boutique. Un abonnement porte une durée, un solde et des règles,
// qui n'ont aucune place sur une fiche produit, et le stock n'y veut rien dire.
//
// ⚠️ LE CLIENT DOIT LIRE CE QU'IL ACHÈTE AVANT DE PAYER : combien de séances,
// jusqu'à quand, à quel rythme, et surtout qu'il achète un DROIT À RÉSERVER et
// non un planning déjà posé. Un bouton « 150 € » tout seul se conteste, et se
// conteste avec raison.

import { useState } from 'react'
import { resumeFormulePublique } from '@/lib/abonnements'

const T = {
  main:  '#6B35C4',
  mid:   '#9660E0',
  pale:  '#EDE0FF',
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  muted: '#6B7280',
}

export default function BlocAbonnements({ commercant, formules = [], prestations = [] }) {
  const [choisie, setChoisie] = useState(null)
  const [form, setForm] = useState({ prenom: '', nom: '', email: '', telephone: '' })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  if (!formules.length) return null

  const valide = !!(form.prenom.trim() && form.nom.trim() && form.email.trim().includes('@'))

  async function payer() {
    if (!valide || envoi || !choisie) return
    setEnvoi(true)
    setErreur(null)
    try {
      const res = await fetch('/api/stripe/checkout/create-abonnement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formule_id: choisie.id,
          client_email: form.email.trim(),
          client_prenom: form.prenom.trim(),
          client_nom: form.nom.trim(),
          client_telephone: form.telephone.trim(),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!body?.ok || !body?.url) {
        // ⚠️ On dit ce qui ne va pas. « Une erreur est survenue » devant un
        // paiement fait fuir le client et ne laisse aucune prise au commerçant
        // quand il nous appelle.
        setErreur(body?.error || 'Le paiement n\'a pas pu démarrer. Réessaie dans un instant.')
        setEnvoi(false)
        return
      }
      window.location.href = body.url
    } catch (e) {
      setErreur(`Connexion interrompue : ${e?.message || 'réessaie'}`)
      setEnvoi(false)
    }
  }

  const inputSt = {
    width: '100%', padding: '0.6rem 0.8rem', borderRadius: 10,
    border: `1.5px solid ${T.pale}`, fontSize: '0.9rem',
    fontFamily: '"DM Sans", sans-serif', color: T.ink,
    background: '#fff', outline: 'none', boxSizing: 'border-box',
  }
  const labelSt = { fontSize: '0.65rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }

  return (
    <div style={{ padding: '0 1rem', marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          Abonnements
        </span>
        <div style={{ flex: 1, height: 1, background: T.pale }}/>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {formules.map(f => {
          const r = resumeFormulePublique(f)
          if (!r) return null
          const presta = prestations.find(p => String(p.id) === String(f.prestation_id))
          return (
            <div key={f.id} style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, padding: '0.9rem 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: '0.95rem', fontWeight: 800, color: T.ink, margin: 0, lineHeight: 1.3 }}>{r.libelle}</p>
                  {presta && (
                    <p style={{ fontSize: '0.75rem', color: T.muted, margin: '2px 0 0', fontWeight: 600 }}>{presta.nom}</p>
                  )}
                </div>
                <p style={{ fontSize: '1.05rem', fontWeight: 900, color: T.main, margin: 0, letterSpacing: '-0.3px', flexShrink: 0 }}>
                  {r.prix.toFixed(0)}€
                </p>
              </div>

              {/* Ce que la formule donne, en trois lignes qu'on lit sans effort. */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <Pastille>{r.seancesLibelle}</Pastille>
                {r.validite && <Pastille>{r.validite}</Pastille>}
                <Pastille>{r.rythme}</Pastille>
              </div>

              <p style={{ fontSize: '0.75rem', color: T.deep, margin: '8px 0 0', lineHeight: 1.5 }}>
                {r.reservation}
              </p>

              <button onClick={() => { setChoisie(f); setErreur(null) }}
                style={{
                  width: '100%', marginTop: 10, padding: '0.65rem', borderRadius: 100, border: 'none',
                  background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff',
                  fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer',
                  fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.main}44`,
                }}>
                Prendre cet abonnement
              </button>
            </div>
          )
        })}
      </div>

      {/* ─── Coordonnées, puis Stripe ────────────────────────────────────── */}
      {choisie && (
        <div onClick={() => !envoi && setChoisie(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, padding: '1rem', overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 18, overflow: 'hidden', marginTop: '2rem', marginBottom: '2rem', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 20px 60px rgba(22,6,54,0.4)' }}>

            <div style={{ background: `linear-gradient(135deg, #160636 0%, ${T.deep} 100%)`, color: '#fff', padding: '1rem 1.125rem' }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.pale, textTransform: 'uppercase', letterSpacing: '1.5px', margin: 0, marginBottom: 4, opacity: 0.85 }}>
                Ton abonnement chez {commercant?.nom}
              </p>
              <p style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, lineHeight: 1.25 }}>
                {choisie.libelle}
                <br/>
                <span style={{ color: T.pale, fontSize: '0.85rem', fontWeight: 700 }}>
                  {resumeFormulePublique(choisie)?.seancesLibelle} · {Number(choisie.prix).toFixed(2)} €
                </span>
              </p>
            </div>

            <div style={{ padding: '1.125rem 1.125rem 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={labelSt}>Prénom *</label>
                  <input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} style={inputSt} autoComplete="given-name"/>
                </div>
                <div>
                  <label style={labelSt}>Nom *</label>
                  <input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} style={inputSt} autoComplete="family-name"/>
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={labelSt}>Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputSt} autoComplete="email"/>
                {/* ⚠️ L'email n'est pas une formalité : c'est LUI qui relie le
                    contrat à ses séances, et c'est avec lui que la cliente
                    retrouvera son solde. Un email non normalisé a déjà fait
                    disparaître des commandes sur ce projet. */}
                <p style={{ fontSize: '0.68rem', color: T.muted, marginTop: 3, lineHeight: 1.45 }}>
                  C&apos;est avec cet email que tu retrouveras ton solde de séances.
                </p>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSt}>Téléphone</label>
                <input type="tel" value={form.telephone} onChange={e => setForm({ ...form, telephone: e.target.value })} style={inputSt} autoComplete="tel"/>
              </div>

              <div style={{ background: '#F5F3FF', borderRadius: 10, padding: '0.65rem 0.8rem', marginBottom: 12 }}>
                <p style={{ fontSize: '0.75rem', color: T.deep, margin: 0, lineHeight: 1.55 }}>
                  Tu paies <strong>en une fois</strong>, par Bancontact ou par carte.
                  Ensuite tu réserves tes séances toi-même depuis la fiche, quand tu veux.
                </p>
              </div>

              {erreur && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: '0.6rem 0.8rem', marginBottom: 12 }}>
                  <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', margin: 0, lineHeight: 1.4 }}>{erreur}</p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '0.75rem 1.125rem 1.125rem', borderTop: `1px solid ${T.pale}`, background: '#FAFAFA' }}>
              <button onClick={() => setChoisie(null)} disabled={envoi}
                style={{ flex: 1, padding: '0.75rem', background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif' }}>
                Retour
              </button>
              <button onClick={payer} disabled={!valide || envoi}
                style={{
                  flex: 2, padding: '0.75rem', border: 'none', borderRadius: 100,
                  background: (!valide || envoi) ? '#D1D5DB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`,
                  color: '#fff', fontWeight: 800, cursor: (!valide || envoi) ? 'default' : 'pointer',
                  fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif',
                }}>
                {envoi ? 'Redirection…' : `Payer ${Number(choisie.prix).toFixed(2)} €`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Pastille({ children }) {
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2D0F6B', background: '#F5F3FF', border: '1px solid #EDE0FF', borderRadius: 100, padding: '3px 9px', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  )
}
