'use client'
// Modale de confirmation/changement de commune du Yopper.
// Reusable : déclenchée au 1er login (commune_id null) ou via "Changer ma commune".
//
// Flow :
// 1. Demande géoloc → reverse geocoding Nominatim → trouve la commune par code postal
// 2. Si trouvée : "Tu es à Mettet ? [Oui c'est ma commune] [Choisir autre]"
// 3. Si refus géoloc ou commune non détectée : liste déroulante des communes actives
// 4. À la validation : UPDATE clients.commune_id

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Tokens design system canonique
const T = {
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  bgPage:   '#F5F3FA',
  hairline: '#F0EBF8',
  muted:    '#6B7280',
}

// Pin icon SVG (design system : pas d'emoji UI)
function IconLocation({ size = 18, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}

export default function ConfirmCommune({ clientId, currentCommuneId, mode = 'first', onClose, onSet }) {
  // mode = 'first' (première détection, non fermable) | 'change' (changement, fermable)
  const [step, setStep] = useState('detecting') // 'detecting' | 'confirm' | 'choose'
  const [detected, setDetected] = useState(null)
  const [communes, setCommunes] = useState([])
  const [selectedId, setSelectedId] = useState(currentCommuneId || null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Charge la liste des communes actives (pour le mode "choose" + fallback)
  useEffect(() => {
    let annule = false
    supabase.from('communes').select('id, nom, codes_postaux, province').eq('active', true).order('nom')
      .then(({ data }) => { if (!annule) setCommunes(data || []) })
    return () => { annule = true }
  }, [])

  // Tente la détection auto via géoloc + Nominatim
  useEffect(() => {
    if (mode === 'change') {
      // En mode changement : on passe direct à la liste (pas de redétection)
      setStep('choose')
      return
    }
    if (!navigator.geolocation) {
      setStep('choose')
      return
    }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&accept-language=fr&zoom=10&addressdetails=1`
          const res = await fetch(url, { headers: { Accept: 'application/json' } })
          const data = await res.json()
          const codePostal = data?.address?.postcode
          if (!codePostal) {
            setStep('choose')
            return
          }
          // Cherche la commune qui contient ce code postal
          const { data: communeMatch } = await supabase
            .from('communes')
            .select('*')
            .contains('codes_postaux', [codePostal])
            .eq('active', true)
            .maybeSingle()
          if (communeMatch) {
            setDetected(communeMatch)
            setStep('confirm')
          } else {
            setStep('choose')
          }
        } catch (e) {
          setStep('choose')
        }
      },
      () => setStep('choose'),
      { timeout: 10000, enableHighAccuracy: false }
    )
  }, [mode])

  async function valider(communeId) {
    if (!communeId) return
    setSaving(true)
    setError(null)
    // Enregistrement commune côté serveur (RLS clients verrouillé), autorisé par le cookie Yopper.
    const res = await fetch('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set-commune', commune_id: communeId }) })
    const j = await res.json().catch(() => ({}))
    setSaving(false)
    if (!j.ok) {
      setError(j.error || 'Impossible de sauvegarder. Réessaie.')
      return
    }
    onSet?.(communeId, communes.find(c => c.id === communeId) || detected)
    onClose?.()
  }

  const fermable = mode === 'change'

  return (
    <div
      onClick={fermable ? onClose : undefined}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(26,8,64,0.55)',
        zIndex: 10000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        fontFamily: '"DM Sans", sans-serif',
        animation: 'cc-fadein 0.18s ease',
      }}>
      <style>{`
        @keyframes cc-fadein { from { opacity:0 } to { opacity:1 } }
        @keyframes cc-slidein { from { opacity:0; transform: translateY(10px) } to { opacity:1; transform: translateY(0) } }
      `}</style>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 22,
          maxWidth: 440, width: '100%',
          boxShadow: '0 24px 48px rgba(26,8,64,0.3)',
          overflow: 'hidden',
          animation: 'cc-slidein 0.28s cubic-bezier(0.16,1,0.3,1)',
          position: 'relative',
        }}>

        {/* Barre dégradée fine en haut - signature design system */}
        <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>

        {/* Bouton fermer si mode change */}
        {fermable && (
          <button onClick={onClose} aria-label="Fermer"
            style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, border: 'none', background: T.bgPage, borderRadius: '50%', color: T.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            ×
          </button>
        )}

        <div style={{ padding: '24px 24px 20px' }}>

          {/* ÉTAPE 1 : détection en cours */}
          {step === 'detecting' && (
            <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 16, background: T.bgPage, marginBottom: 14 }}>
                <IconLocation size={28} color={T.main}/>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: '-0.3px', margin: '0 0 6px' }}>
                On regarde où tu es…
              </h2>
              <p style={{ fontSize: 13, color: T.muted, margin: '0 0 4px', lineHeight: 1.5 }}>
                Accepte la demande de localisation de ton navigateur - on l'utilise uniquement pour te proposer ta commune.
              </p>
              <p style={{ fontSize: 11, color: T.mid, margin: '8px 0 0', fontWeight: 600 }}>
                On ne stocke pas ta position GPS.
              </p>
            </div>
          )}

          {/* ÉTAPE 2 : confirmation commune détectée */}
          {step === 'confirm' && detected && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <IconLocation size={22} color={T.main}/>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 10, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '1px', margin: 0 }}>
                    Détectée
                  </p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: T.ink, letterSpacing: '-0.5px', margin: '2px 0 0', lineHeight: 1.1 }}>
                    {detected.nom}
                  </p>
                  {detected.province && (
                    <p style={{ fontSize: 11, color: T.main, margin: '2px 0 0', fontWeight: 600 }}>
                      Province de {detected.province}
                    </p>
                  )}
                </div>
              </div>

              <p style={{ fontSize: 13, color: T.ink, margin: '0 0 18px', lineHeight: 1.55, fontWeight: 500 }}>
                C&rsquo;est bien <strong style={{ color: T.main }}>ta commune</strong> ? On utilisera ses codes postaux pour t&rsquo;envoyer le bon Good Morning Yoppers.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button onClick={() => valider(detected.id)} disabled={saving}
                  style={{ padding: '13px 18px', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', boxShadow: `0 6px 20px ${T.main}40`, letterSpacing: '-0.2px' }}>
                  {saving ? 'Enregistrement…' : `Oui, c'est ${detected.nom}`}
                </button>
                <button onClick={() => setStep('choose')} disabled={saving}
                  style={{ padding: '11px 18px', border: `1.5px solid ${T.hairline}`, borderRadius: 100, background: '#fff', color: T.main, fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  Non, choisir une autre commune
                </button>
              </div>
            </div>
          )}

          {/* ÉTAPE 3 : choix manuel */}
          {step === 'choose' && (
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: '-0.3px', margin: '0 0 8px' }}>
                {mode === 'change' ? 'Changer ma commune' : 'Choisis ta commune'}
              </h2>
              <p style={{ fontSize: 13, color: T.muted, margin: '0 0 16px', lineHeight: 1.5 }}>
                {mode === 'change'
                  ? 'Sélectionne ta nouvelle commune principale. Ton Good Morning Yoppers s\'adaptera en conséquence.'
                  : 'Choisis la commune que tu veux suivre dans ton Good Morning Yoppers.'}
              </p>

              <label style={{ fontSize: 11, fontWeight: 700, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                Commune
              </label>
              <select
                value={selectedId || ''}
                onChange={e => setSelectedId(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: 'inherit', color: T.ink, background: '#fff', cursor: 'pointer', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}>
                <option value="">- Sélectionne une commune -</option>
                {communes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nom}{c.province ? ` (${c.province})` : ''}
                  </option>
                ))}
              </select>

              {error && (
                <p style={{ fontSize: 12, color: '#DC2626', fontWeight: 600, margin: '0 0 12px' }}>
                  {error}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                {fermable && (
                  <button onClick={onClose} disabled={saving}
                    style={{ flex: 1, padding: '11px 18px', border: `1.5px solid ${T.hairline}`, borderRadius: 100, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                    Annuler
                  </button>
                )}
                <button onClick={() => valider(selectedId)} disabled={!selectedId || saving}
                  style={{ flex: fermable ? 2 : 1, padding: '13px 18px', border: 'none', borderRadius: 100, background: (!selectedId || saving) ? '#D1D5DB' : `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: (!selectedId || saving) ? 'not-allowed' : 'pointer', fontFamily: 'inherit', boxShadow: (!selectedId || saving) ? 'none' : `0 6px 20px ${T.main}40` }}>
                  {saving ? 'Enregistrement…' : 'Valider'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
