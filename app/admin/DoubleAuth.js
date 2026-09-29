'use client'
// 🔐 LA DOUBLE AUTHENTIFICATION DE L'ADMIN (29/09, voulue par Alex).
//
// Être admin, c'était DÉTENIR UNE ADRESSE ET UN MOT DE PASSE. Or l'admin
// modifie toutes les fiches, ouvre les dossiers d'identité et peut débiter une
// carte. Désormais, un code à six chiffres, donné par une application
// d'authentification (Alex utilise Proton Authenticator), est demandé à
// l'entrée de /admin.
//
// ⚠️ LA PAGE DE CONNEXION COMMUNE N'EST PAS TOUCHÉE : le code est demandé ici,
// à la porte de l'admin. Commerçants et Yoppers ne voient rien, et l'app en
// examen chez Play non plus.
//
// ⚠️ PAS DE CODES DE SECOURS CHEZ SUPABASE. La parade : enrôler DEUX appareils.
// En dernier recours, un facteur se retire depuis l'éditeur SQL de Supabase —
// d'où l'importance de protéger AUSSI le compte Supabase par un second facteur.
//
// Deux écrans : `EcranCodeAdmin` (la porte) et `SectionSecuriteAdmin` (ajouter
// ou retirer un appareil).

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const T = {
  main: '#6B35C4', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280',
  hairline: '#EEE9F5', vert: '#047857', vertPale: '#ECFDF5', rouge: '#B91C1C', rougePale: '#FEF2F2',
}

// Le niveau de la session : 'ok' (code validé), 'code' (un appareil existe,
// le code reste à donner), 'aucun' (aucun appareil enrôlé), ou 'erreur'.
export async function etatDoubleAuth() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) return 'erreur'
  if (data?.currentLevel === 'aal2') return 'ok'
  if (data?.nextLevel === 'aal2') return 'code'
  return 'aucun'
}

// Un code se tape avec des espaces, se colle avec des tirets : on ne garde
// que les chiffres, et on n'envoie que six chiffres.
export function nettoyerCode(saisie) {
  return String(saisie || '').replace(/\D/g, '').slice(0, 6)
}

function ChampCode({ valeur, onChange, onValider, desactive }) {
  return (
    <input
      value={valeur}
      onChange={e => onChange(nettoyerCode(e.target.value))}
      onKeyDown={e => { if (e.key === 'Enter' && valeur.length === 6) onValider() }}
      inputMode="numeric" autoComplete="one-time-code" autoFocus
      placeholder="123456" aria-label="Code à six chiffres" disabled={desactive}
      style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 22, letterSpacing: '0.35em', textAlign: 'center', borderRadius: 12, border: `1.5px solid ${T.hairline}`, fontFamily: 'ui-monospace, monospace', color: T.ink }}
    />
  )
}

// ─── LA PORTE ────────────────────────────────────────────────────────────────
export function EcranCodeAdmin({ onValide, onDeconnexion }) {
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function valider() {
    if (code.length !== 6 || envoi) return
    setEnvoi(true); setErreur(null)
    try {
      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) throw error
      const facteurs = data?.totp || []
      if (facteurs.length === 0) throw new Error('aucun appareil enrôlé')
      // ⚠️ LE CODE EST ESSAYÉ SUR CHAQUE APPAREIL : Alex en a deux, et il ne
      // doit pas avoir à dire lequel il tient en main.
      let dernier = null
      for (const f of facteurs) {
        const r = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code })
        if (!r.error) { onValide(); return }
        dernier = r.error
      }
      throw dernier || new Error('code refusé')
    } catch (e) {
      setErreur(/invalid|expired|refus/i.test(e?.message || '')
        ? 'Code refusé. Attends le code suivant dans ton application et réessaie.'
        : `Vérification impossible : ${e?.message || e}`)
      setCode('')
    }
    setEnvoi(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: `linear-gradient(160deg, #1A0840 0%, ${T.deep} 60%, ${T.ink} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 18, padding: '26px 24px', width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <p style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 900, color: T.ink }}>Code de sécurité</p>
        <p style={{ margin: '0 0 16px', fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>
          Ouvre Proton Authenticator et tape le code à six chiffres de Yoppaa.
        </p>
        <ChampCode valeur={code} onChange={setCode} onValider={valider} desactive={envoi}/>
        {erreur && <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 700, color: T.rouge }}>{erreur}</p>}
        <button onClick={valider} disabled={code.length !== 6 || envoi}
          style={{ marginTop: 14, width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none', background: code.length === 6 ? T.main : '#D1D5DB', color: '#fff', fontWeight: 800, fontSize: 14, cursor: code.length === 6 && !envoi ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
          {envoi ? 'Vérification…' : 'Entrer dans l’administration'}
        </button>
        <button onClick={onDeconnexion}
          style={{ marginTop: 10, width: '100%', padding: '9px 16px', borderRadius: 12, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}

// ─── AJOUTER OU RETIRER UN APPAREIL ─────────────────────────────────────────
export function SectionSecuriteAdmin({ toast, etat, onChange }) {
  const [facteurs, setFacteurs] = useState([])
  const [enrolement, setEnrolement] = useState(null) // { id, qr, secret }
  const [code, setCode] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)

  const lire = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) { setErreur(error.message); return }
    setFacteurs(data?.totp || [])
  }, [])

  useEffect(() => { lire() }, [lire])

  async function commencer() {
    setErreur(null); setCode('')
    const nom = `Appareil ${facteurs.length + 1} · ${new Date().toLocaleDateString('fr-BE')}`
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: nom, issuer: 'Yoppaa' })
    if (error) { setErreur(error.message); return }
    setEnrolement({ id: data.id, qr: data.totp?.qr_code, secret: data.totp?.secret })
  }

  async function annuler() {
    // Un appareil commencé et jamais confirmé ne doit pas rester en suspens :
    // il bloquerait un nouvel essai portant le même nom.
    if (enrolement?.id) await supabase.auth.mfa.unenroll({ factorId: enrolement.id }).catch(() => {})
    setEnrolement(null); setCode('')
  }

  async function confirmer() {
    if (code.length !== 6 || !enrolement || envoi) return
    setEnvoi(true); setErreur(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolement.id, code })
    setEnvoi(false)
    if (error) { setErreur('Code refusé. Vérifie que tu as scanné le bon QR code, puis tape le code suivant.'); setCode(''); return }
    setEnrolement(null); setCode('')
    toast?.('Appareil ajouté : le code te sera demandé à chaque entrée dans l’administration', 'success')
    await lire(); onChange?.()
  }

  async function retirer(f) {
    const verifies = facteurs.filter(x => x.status === 'verified')
    // ⚠️ RETIRER LE DERNIER APPAREIL, C'EST ÉTEINDRE LA PROTECTION : on le dit.
    const dernier = verifies.length === 1 && f.status === 'verified'
    if (!window.confirm(dernier
      ? `Retirer « ${f.friendly_name} » ? C'est ton dernier appareil : l'administration ne sera plus protégée par un code.`
      : `Retirer « ${f.friendly_name} » ?`)) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
    if (error) { toast?.(`Retrait impossible : ${error.message}`, 'error'); return }
    toast?.('Appareil retiré', 'success')
    await lire(); onChange?.()
  }

  const verifies = facteurs.filter(f => f.status === 'verified')

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1.5px solid ${verifies.length === 0 ? '#FCA5A5' : T.hairline}`, padding: '18px 20px', marginBottom: 20 }}>
      <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 900, color: T.ink }}>Sécurité de ton accès</p>
      {verifies.length === 0 ? (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: T.rouge, fontWeight: 700, lineHeight: 1.55 }}>
          La double authentification n&apos;est pas encore activée : un mot de passe suffit pour entrer ici.
          Ajoute ton premier appareil, puis un second pour ne jamais te retrouver bloqué.
        </p>
      ) : (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: T.vert, fontWeight: 700, lineHeight: 1.55 }}>
          Protégé par un code à six chiffres{verifies.length === 1 ? ' · ajoute un second appareil, au cas où tu perdrais le premier.' : ` · ${verifies.length} appareils.`}
          {etat !== 'ok' && ' Tu n’as pas encore donné le code dans cette session.'}
        </p>
      )}

      {verifies.map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${T.hairline}` }}>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.deep }}>{f.friendly_name || 'Appareil'}</span>
          <button onClick={() => retirer(f)} style={{ background: 'none', border: `1.5px solid ${T.hairline}`, color: T.muted, borderRadius: 10, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Retirer</button>
        </div>
      ))}

      {!enrolement ? (
        <button onClick={commencer} style={{ marginTop: 10, background: T.main, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          {verifies.length === 0 ? 'Activer la double authentification' : 'Ajouter un appareil'}
        </button>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {enrolement.qr && (
            <img decoding="async" loading="eager" src={enrolement.qr} alt="QR code à scanner avec Proton Authenticator" width={180} height={180}
              style={{ background: '#fff', borderRadius: 12, border: `1px solid ${T.hairline}`, padding: 6 }}/>
          )}
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <ol style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 13, color: T.ink, lineHeight: 1.6 }}>
              <li>Dans Proton Authenticator, ajoute une entrée et scanne ce QR code.</li>
              <li>Tape ci-dessous le code à six chiffres qui s&apos;affiche.</li>
            </ol>
            <p style={{ margin: '0 0 10px', fontSize: 11.5, color: T.muted, overflowWrap: 'anywhere' }}>
              Pas d&apos;appareil photo ? Saisis la clé à la main : <code>{enrolement.secret}</code>
            </p>
            <ChampCode valeur={code} onChange={setCode} onValider={confirmer} desactive={envoi}/>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button onClick={confirmer} disabled={code.length !== 6 || envoi}
                style={{ background: code.length === 6 ? T.main : '#D1D5DB', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: code.length === 6 ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                {envoi ? 'Vérification…' : 'Confirmer cet appareil'}
              </button>
              <button onClick={annuler} style={{ background: 'none', border: `1.5px solid ${T.hairline}`, color: T.muted, borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
            </div>
          </div>
        </div>
      )}
      {erreur && <p role="alert" style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 700, color: T.rouge }}>{erreur}</p>}
    </div>
  )
}
