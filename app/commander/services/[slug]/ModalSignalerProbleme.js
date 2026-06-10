'use client'
// ════════════════════════════════════════════════════════════════════
// ModalSignalerProbleme — flow yopper pour signaler un problème citoyen
// à la commune (nid de poule, dépôt sauvage, égout bouché, autre).
//
// Flow en 3 étapes :
//   1. Localisation : géoloc auto via Geolocation API + reverse geocoding
//      via Nominatim (OpenStreetMap, gratuit). Fallback saisie manuelle
//      si l'utilisateur refuse la permission ou si l'API timeout.
//   2. Photo + description : capture caméra native (input file capture)
//      + commentaire optionnel.
//   3. Confirmation : récap + email yopper (pré-rempli si connecté) +
//      bouton envoyer. POST vers /api/signalements/create.
//
// Écran de succès "Yoppé ! La commune a été notifiée 🟣" après envoi.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'

// Palette canonique Yoppaa
const T = {
  bg:       '#F8F6FF',
  bgPage:   '#F5F3FA',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  hairline: '#F0EBF8',
  muted:    '#6B7280',
}

const TYPE_CONFIG = {
  nid_poule:     { emoji: '🕳️',  titre: 'Nid de poule', sousTitre: 'Dégât de voirie, trou, affaissement' },
  depot_sauvage: { emoji: '🗑️', titre: 'Dépôt sauvage', sousTitre: 'Immondices abandonnés sur la voie publique' },
  egout:         { emoji: '🚰', titre: 'Égout bouché',  sousTitre: 'Écoulement d\'eau perturbé, avaloir bouché' },
  autre:         { emoji: '⚠️',  titre: 'Autre problème', sousTitre: 'Tout autre incident à signaler à la commune' },
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ModalSignalerProbleme({
  service,        // { id, nom, slug } - la fiche commune destinataire
  type,           // 'nid_poule' | 'depot_sauvage' | 'egout' | 'autre'
  yopperId,       // uuid client connecté, ou null si anonyme
  yopperEmail: initialEmail = '',
  yopperPrenom: initialPrenom = '',
  onClose,
  onSent,
}) {
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.autre

  const [etape, setEtape] = useState(1)

  // État localisation
  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [adresse, setAdresse] = useState('')
  const [geolocLoading, setGeolocLoading] = useState(false)
  const [geolocErreur, setGeolocErreur] = useState(null)

  // État photo
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [description, setDescription] = useState('')

  // État yopper
  const [yopperEmail, setYopperEmail] = useState(initialEmail)
  const [yopperPrenom, setYopperPrenom] = useState(initialPrenom)

  // État envoi
  const [envoiEnCours, setEnvoiEnCours] = useState(false)
  const [envoiReussi, setEnvoiReussi] = useState(false)
  const [erreur, setErreur] = useState(null)

  // Démarrage géoloc auto à l'ouverture de l'étape 1
  useEffect(() => {
    if (etape !== 1 || latitude !== null || geolocErreur) return
    demanderGeoloc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etape])

  function demanderGeoloc() {
    if (!navigator.geolocation) {
      setGeolocErreur('Géolocalisation non supportée par ton navigateur. Saisis l\'adresse manuellement.')
      return
    }
    setGeolocLoading(true)
    setGeolocErreur(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        setLatitude(lat)
        setLongitude(lng)

        // Reverse geocoding via Nominatim (OpenStreetMap, gratuit, ~1 req/sec)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr&zoom=18`
          )
          const data = await res.json()
          const a = data?.address || {}
          const street = `${a.house_number || ''} ${a.road || ''}`.trim()
          const city = a.city || a.town || a.village || a.municipality || ''
          const postal = a.postcode || ''
          const fmt = `${street}, ${postal} ${city}`.replace(/^,\s*/, '').trim()
          if (fmt && fmt !== ',') setAdresse(fmt)
          else if (data?.display_name) setAdresse(data.display_name)
        } catch (e) {
          console.warn('[signalement] reverse geocoding échec', e)
          // Pas grave, l'utilisateur peut taper son adresse manuellement
        } finally {
          setGeolocLoading(false)
        }
      },
      (err) => {
        const msg = err.code === 1
          ? 'Permission de géolocalisation refusée. Saisis l\'adresse manuellement.'
          : 'Impossible de récupérer ta position. Saisis l\'adresse manuellement.'
        setGeolocErreur(msg)
        setGeolocLoading(false)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    )
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setErreur('Photo trop volumineuse (max 10 Mo)')
      return
    }
    setPhoto(file)
    setErreur(null)
    const reader = new FileReader()
    reader.onloadend = () => setPhotoPreview(reader.result)
    reader.readAsDataURL(file)
  }

  async function envoyer() {
    if (envoiEnCours) return
    setEnvoiEnCours(true)
    setErreur(null)

    try {
      const formData = new FormData()
      formData.append('service_id', service.id)
      formData.append('type', type)
      formData.append('yopper_email', yopperEmail.trim().toLowerCase())
      if (yopperPrenom) formData.append('yopper_prenom', yopperPrenom)
      if (yopperId) formData.append('yopper_id', yopperId)
      if (latitude !== null) formData.append('latitude', String(latitude))
      if (longitude !== null) formData.append('longitude', String(longitude))
      if (adresse) formData.append('adresse', adresse)
      if (description) formData.append('description', description)
      formData.append('photo', photo)

      const res = await fetch('/api/signalements/create', { method: 'POST', body: formData })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Erreur lors de l\'envoi')

      setEnvoiReussi(true)
      if (onSent) onSent(data.signalement_id)
    } catch (e) {
      setErreur(e.message || 'Erreur lors de l\'envoi')
    } finally {
      setEnvoiEnCours(false)
    }
  }

  // ─── Validations par étape ───
  const peutAvancerEtape1 = (latitude !== null && longitude !== null) || adresse.trim().length > 5
  const peutAvancerEtape2 = !!photo
  const peutEnvoyer = yopperEmail.trim() && RE_EMAIL.test(yopperEmail.trim().toLowerCase())

  // ─── Styles communs ───
  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.75)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '1rem',
  }
  const modal = {
    background: '#fff', borderRadius: 20, maxWidth: 460, width: '100%', maxHeight: '92vh',
    overflowY: 'auto', boxShadow: '0 20px 60px rgba(26,8,64,0.4)', position: 'relative',
  }

  // ═══════ ÉCRAN DE SUCCÈS ═══════
  if (envoiReussi) {
    return (
      <div style={overlay}>
        <div style={modal}>
          <div style={{ padding: '40px 28px 30px', textAlign: 'center' }}>
            <div style={{
              width: 80, height: 80, borderRadius: '50%', margin: '0 auto 20px',
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(16,185,129,0.4)',
            }}>
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12l5 5L20 7"/>
              </svg>
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, margin: '0 0 8px', letterSpacing: '-0.5px' }}>
              Signalé 🟣
            </h2>
            <p style={{ fontSize: 14, color: T.muted, margin: '0 0 6px', lineHeight: 1.5 }}>
              La commune de Mettet a été notifiée par email.
            </p>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 24px', lineHeight: 1.5 }}>
              Tu recevras une réponse à <strong style={{ color: T.deep }}>{yopperEmail}</strong> si nécessaire.
            </p>
            <button onClick={onClose}
              style={{
                padding: '14px 34px', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`,
                color: '#fff', border: 'none', borderRadius: 100, fontSize: 14, fontWeight: 800,
                cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.2px',
                boxShadow: `0 8px 22px ${T.main}40`,
              }}>
              Terminer
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ═══════ FLOW PRINCIPAL ═══════
  return (
    <div style={overlay} onClick={envoiEnCours ? undefined : onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>

        {/* Header sticky avec emoji + titre + fermer */}
        <div style={{ position: 'sticky', top: 0, background: '#fff', borderBottom: `1px solid ${T.hairline}`, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, zIndex: 2 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
            {config.emoji}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
              {config.titre}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: T.muted, fontWeight: 600 }}>
              Étape {etape} sur 3
            </p>
          </div>
          {!envoiEnCours && (
            <button onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: T.bgPage, color: T.muted, cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              ×
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, padding: '0 20px', marginTop: 12 }}>
          {[1, 2, 3].map(n => (
            <div key={n} style={{ flex: 1, height: 4, borderRadius: 100, background: n <= etape ? T.main : T.pale, transition: 'background 0.3s' }}/>
          ))}
        </div>

        {/* ═══ ÉTAPE 1 : Localisation ═══ */}
        {etape === 1 && (
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 16px', lineHeight: 1.55 }}>
              Où as-tu observé ce problème&nbsp;?
            </p>

            {geolocLoading && (
              <div style={{ background: T.pale, borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 16, height: 16, border: `2px solid ${T.light}`, borderTopColor: T.main, borderRadius: '50%', animation: 'spinner 0.8s linear infinite' }}/>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.deep }}>Localisation en cours...</span>
              </div>
            )}

            {geolocErreur && (
              <div style={{ background: '#FEF3C7', borderLeft: '3px solid #D97706', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                <p style={{ fontSize: 12, color: '#78350F', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                  ⚠ {geolocErreur}
                </p>
                <button onClick={demanderGeoloc}
                  style={{ marginTop: 8, padding: '6px 12px', background: 'transparent', border: `1px solid #D97706`, color: '#78350F', borderRadius: 100, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Réessayer
                </button>
              </div>
            )}

            {(latitude !== null) && !geolocErreur && (
              <div style={{ background: '#D1FAE5', borderRadius: 12, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#065F46', letterSpacing: '0.3px' }}>
                  ✓ Position détectée
                </span>
                <span style={{ fontSize: 10, color: '#047857', fontFamily: 'monospace', marginLeft: 'auto' }}>
                  {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </span>
              </div>
            )}

            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>
              Adresse exacte du problème
            </label>
            <input type="text" value={adresse} onChange={e => setAdresse(e.target.value)}
              placeholder="Ex : Rue de l'Église, 5640 Mettet"
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14, fontWeight: 600, border: `1.5px solid ${T.pale}`, borderRadius: 12, color: T.ink, fontFamily: 'inherit', background: '#fff' }}/>

            {/* Callout ambre : alerte le yopper que la géoloc auto = position actuelle,
                pas forcément le lieu du problème (cas du signalement "depuis le canapé") */}
            <div style={{ marginTop: 10, background: '#FEF3C7', borderLeft: '3px solid #D97706', borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ fontSize: 12, color: '#78350F', margin: 0, fontWeight: 600, lineHeight: 1.5 }}>
                ⚠ <strong>Tu n&rsquo;es plus sur place&nbsp;?</strong><br/>
                L&rsquo;adresse détectée correspond à <em>ta position actuelle</em>. Modifie-la pour qu&rsquo;elle corresponde au lieu exact du problème.
              </p>
            </div>
          </div>
        )}

        {/* ═══ ÉTAPE 2 : Photo + description ═══ */}
        {etape === 2 && (
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 16px', lineHeight: 1.55 }}>
              Une photo du problème permet à la commune d'agir plus vite.
            </p>

            {!photoPreview && (
              <label style={{
                display: 'block', padding: '36px 20px', border: `2px dashed ${T.light}`,
                borderRadius: 16, textAlign: 'center', cursor: 'pointer', background: T.pale,
                marginBottom: 16,
              }}>
                <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }}/>
                <div style={{ fontSize: 36, marginBottom: 8 }}>📸</div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.deep }}>
                  Prendre une photo
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: T.muted }}>
                  La caméra arrière s'ouvre automatiquement
                </p>
              </label>
            )}

            {photoPreview && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ borderRadius: 14, overflow: 'hidden', position: 'relative', maxHeight: 320 }}>
                  <img src={photoPreview} alt="Aperçu" style={{ width: '100%', maxHeight: 320, objectFit: 'cover', display: 'block' }}/>
                </div>
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '6px 12px',
                  background: T.pale, color: T.deep, borderRadius: 100, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer',
                }}>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} style={{ display: 'none' }}/>
                  🔄 Reprendre la photo
                </label>
              </div>
            )}

            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>
              Description (optionnel)
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value.slice(0, 500))}
              placeholder="Précisions utiles : taille, dangerosité, depuis quand..."
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14, border: `1.5px solid ${T.pale}`, borderRadius: 12, color: T.ink, fontFamily: 'inherit', background: '#fff', resize: 'vertical' }}/>
            <p style={{ fontSize: 10, color: T.muted, margin: '4px 0 0', textAlign: 'right' }}>
              {description.length}/500
            </p>
          </div>
        )}

        {/* ═══ ÉTAPE 3 : Confirmation + email ═══ */}
        {etape === 3 && (
          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: 13, color: T.muted, margin: '0 0 16px', lineHeight: 1.55 }}>
              Vérifie ton signalement avant l'envoi.
            </p>

            {/* Récap */}
            <div style={{ background: T.bgPage, borderRadius: 14, padding: '14px 16px', marginBottom: 16, fontSize: 13, color: T.ink, lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 4px' }}><strong style={{ color: T.deep }}>📍</strong> {adresse || 'Coordonnées GPS seules'}</p>
              {photoPreview && (
                <div style={{ marginTop: 8, borderRadius: 10, overflow: 'hidden' }}>
                  <img src={photoPreview} alt="" style={{ width: '100%', maxHeight: 140, objectFit: 'cover', display: 'block' }}/>
                </div>
              )}
              {description && (
                <p style={{ margin: '8px 0 0', fontStyle: 'italic', color: T.muted, fontSize: 12 }}>
                  « {description} »
                </p>
              )}
            </div>

            {/* Identité yopper (anonyme = on demande, connecté = on pré-remplit) */}
            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>
              Ton email <span style={{ color: '#DC2626' }}>*</span>
            </label>
            <input type="email" value={yopperEmail} onChange={e => setYopperEmail(e.target.value)}
              placeholder="ton@email.be"
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14, border: `1.5px solid ${T.pale}`, borderRadius: 12, color: T.ink, fontFamily: 'inherit', background: '#fff', marginBottom: 12 }}/>

            <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: T.deep, letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 6 }}>
              Ton prénom (optionnel)
            </label>
            <input type="text" value={yopperPrenom} onChange={e => setYopperPrenom(e.target.value)}
              placeholder="Prénom"
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 14, border: `1.5px solid ${T.pale}`, borderRadius: 12, color: T.ink, fontFamily: 'inherit', background: '#fff' }}/>

            <p style={{ fontSize: 10, color: T.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
              💡 La commune pourra te répondre directement à cette adresse.
            </p>

            {erreur && (
              <div style={{ background: '#FEE2E2', borderLeft: '3px solid #DC2626', borderRadius: 10, padding: '10px 12px', marginTop: 14 }}>
                <p style={{ fontSize: 12, color: '#991B1B', margin: 0, fontWeight: 700 }}>
                  ⚠ {erreur}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══ Boutons navigation ═══ */}
        <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `1px solid ${T.hairline}`, padding: '14px 20px', display: 'flex', gap: 10 }}>
          {etape > 1 && !envoiEnCours && (
            <button onClick={() => setEtape(etape - 1)}
              style={{ padding: '12px 18px', background: T.bgPage, color: T.ink, border: `1.5px solid ${T.pale}`, borderRadius: 100, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              ← Retour
            </button>
          )}

          {etape < 3 && (
            <button onClick={() => setEtape(etape + 1)}
              disabled={etape === 1 ? !peutAvancerEtape1 : !peutAvancerEtape2}
              style={{
                flex: 1, padding: '12px 18px',
                background: (etape === 1 ? peutAvancerEtape1 : peutAvancerEtape2) ? `linear-gradient(135deg, ${T.ink}, ${T.main})` : T.pale,
                color: (etape === 1 ? peutAvancerEtape1 : peutAvancerEtape2) ? '#fff' : T.muted,
                border: 'none', borderRadius: 100, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                opacity: (etape === 1 ? peutAvancerEtape1 : peutAvancerEtape2) ? 1 : 0.6,
              }}>
              Continuer →
            </button>
          )}

          {etape === 3 && (
            <button onClick={envoyer} disabled={!peutEnvoyer || envoiEnCours}
              style={{
                flex: 1, padding: '12px 18px',
                background: (peutEnvoyer && !envoiEnCours) ? `linear-gradient(135deg, ${T.ink}, ${T.main})` : T.pale,
                color: (peutEnvoyer && !envoiEnCours) ? '#fff' : T.muted,
                border: 'none', borderRadius: 100, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                opacity: (peutEnvoyer && !envoiEnCours) ? 1 : 0.6,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              {envoiEnCours
                ? (<>
                    <div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spinner 0.7s linear infinite' }}/>
                    Envoi en cours...
                  </>)
                : 'Envoyer le signalement 🟣'}
            </button>
          )}
        </div>

        <style>{`@keyframes spinner { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )
}
