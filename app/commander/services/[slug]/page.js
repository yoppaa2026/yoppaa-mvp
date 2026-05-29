'use client'
// ════════════════════════════════════════════════════════════════════
// FICHE SERVICE PUBLIC — Plan PUBLIC (commune, CPAS, police, urgences…)
//
// Lecture seule côté client. Pas de menu, pas de panier, pas de
// réservation. Vise à donner les infos de contact + actus officielles.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import ModalSignalement from '../../ModalSignalement'

// Design system canonique
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

const SERVICE_TYPE_EMOJI = {
  commune: '🏛️', cpas: '🤝', police: '🚓', pompiers: '🚒',
  ecole: '🏫', urgence: '🚨', medecin_garde: '🩺',
  pharmacie_garde: '💊', autre: '🏢',
}
const SERVICE_TYPE_LABEL = {
  commune: 'Administration communale', cpas: 'CPAS', police: 'Police',
  pompiers: 'Pompiers', ecole: 'École', urgence: 'Urgence',
  medecin_garde: 'Médecin de garde', pharmacie_garde: 'Pharmacie de garde',
  autre: 'Service public',
}
const JOURS_LABEL = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi',
  jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

// ─── Icons SVG ──────────────────────────────────────────────────────
function IconPhone({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.22 2.18 2 2 0 012.2 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.11 6.11l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
    </svg>
  )
}
function IconMail({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <path d="M22 6l-10 7L2 6"/>
    </svg>
  )
}
function IconMap({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  )
}
function IconGlobe({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
    </svg>
  )
}
function IconBack({ size = 14, color = T.muted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  )
}
function IconClock({ size = 14, color = T.deep }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  )
}

export default function FicheServicePublic({ params }) {
  const router = useRouter()
  const [service, setService] = useState(null)
  const [actus, setActus] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  // Next.js 15+ : params est un Promise — on l'attend
  const [slug, setSlug] = useState(null)
  const [showSignalement, setShowSignalement] = useState(false)
  const [signalementSent, setSignalementSent] = useState(false)

  useEffect(() => {
    Promise.resolve(params).then(p => setSlug(p?.slug))
  }, [params])

  useEffect(() => {
    if (!slug) return
    let annule = false
    async function load() {
      const { data: s } = await supabase
        .from('services_publics')
        .select('*')
        .eq('slug', slug)
        .eq('statut', 'valide')
        .maybeSingle()
      if (annule) return
      if (!s) { setNotFound(true); setLoading(false); return }
      setService(s)

      const today = new Date().toISOString().slice(0, 10)
      const { data: a } = await supabase
        .from('actualites')
        .select('id, titre, contenu, type, date_debut, date_fin, urgence')
        .eq('service_id', s.id)
        .eq('actif', true)
        .lte('date_debut', today)
        .gte('date_fin', today)
        .order('urgence', { ascending: false })
        .order('date_debut', { ascending: false })
      if (!annule) setActus(a || [])
      setLoading(false)
    }
    load()
    return () => { annule = true }
  }, [slug])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '"DM Sans", sans-serif', color: T.muted }}>
        Chargement…
      </div>
    )
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: T.bgPage, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: '"DM Sans", sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 18, padding: '32px 28px', maxWidth: 400, textAlign: 'center', border: `1px solid ${T.pale}` }}>
          <p style={{ fontSize: '2.5rem', marginBottom: 12 }}>🏛️</p>
          <h2 style={{ fontWeight: 900, fontSize: '1.2rem', color: T.ink, margin: '0 0 8px', letterSpacing: '-0.3px' }}>
            Service introuvable
          </h2>
          <p style={{ fontSize: 13, color: T.muted, margin: '0 0 18px', lineHeight: 1.5 }}>
            Ce service public n&rsquo;existe pas ou n&rsquo;est pas encore activé.
          </p>
          <button onClick={() => { if (window.history.length > 1) router.back(); else router.push('/commander') }}
            style={{ padding: '10px 22px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.ink}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Retour
          </button>
        </div>
      </div>
    )
  }

  const isUrgence = service.national || service.type === 'urgence'
  const emoji = SERVICE_TYPE_EMOJI[service.type] || '🏢'
  const typeLabel = SERVICE_TYPE_LABEL[service.type] || 'Service'
  const couleurAccent = isUrgence ? '#DC2626' : T.deep

  const mapsUrl = service.latitude && service.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${service.latitude},${service.longitude}`
    : service.adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.adresse)}` : null

  return (
    <div style={{ minHeight: '100vh', background: T.bgPage, fontFamily: '"DM Sans", sans-serif', maxWidth: 760, margin: '0 auto' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Topbar : retour */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: `1px solid ${T.hairline}`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => { if (window.history.length > 1) router.back(); else router.push('/commander') }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: T.bgPage, border: 'none', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          <IconBack/> Retour
        </button>
      </div>

      {/* Photo de couverture pleine largeur si présente */}
      {service.photo_couverture_url && (
        <div style={{ width: '100%', height: 200, position: 'relative', overflow: 'hidden', borderBottom: `1px solid ${T.hairline}` }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: isUrgence ? `linear-gradient(90deg, #DC2626, #B91C1C, #7F1D1D)` : `linear-gradient(90deg, ${T.ink}, ${T.main}, ${T.light})`, zIndex: 2 }}/>
          <img src={service.photo_couverture_url} alt={service.nom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        </div>
      )}

      {/* Hero header */}
      <div style={{ background: '#fff', padding: '20px 18px 18px', borderBottom: `1px solid ${T.hairline}`, position: 'relative' }}>
        {!service.photo_couverture_url && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: isUrgence ? `linear-gradient(90deg, #DC2626, #B91C1C, #7F1D1D)` : `linear-gradient(90deg, ${T.ink}, ${T.main}, ${T.light})` }}/>
        )}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: service.logo_url ? '#fff' : (isUrgence ? '#FEE2E2' : T.pale), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden', border: service.logo_url ? `1px solid ${T.pale}` : 'none', marginTop: service.photo_couverture_url ? -48 : 0, boxShadow: service.photo_couverture_url ? '0 4px 16px rgba(26,8,64,0.18)' : 'none' }}>
            {service.logo_url ? (
              <img src={service.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
            ) : (
              <span style={{ fontSize: 32 }}>{emoji}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: couleurAccent, padding: '3px 8px', borderRadius: 100, letterSpacing: '0.7px', textTransform: 'uppercase' }}>
                {isUrgence ? '⚠ Urgence' : 'Officiel'}
              </span>
              <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, letterSpacing: '0.3px' }}>
                {typeLabel}
              </span>
            </div>
            <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, letterSpacing: '-0.5px', margin: 0, lineHeight: 1.15 }}>
              {service.nom}
            </h1>
          </div>
        </div>
      </div>

      {/* Actus en cours du service (alertes urgentes en tête) */}
      {actus.length > 0 && (
        <div style={{ padding: '12px 14px 0' }}>
          {actus.map(a => {
            const isAlerte = a.urgence || a.type === 'alerte'
            return (
              <div key={a.id} style={{ background: isAlerte ? 'linear-gradient(135deg, #7F1D1D, #B91C1C)' : `linear-gradient(135deg, ${T.ink}, ${T.deep})`, borderRadius: 14, padding: '12px 14px', color: '#fff', marginBottom: 10, boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.25)' : '0 4px 16px rgba(26,8,64,0.15)' }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: isAlerte ? '#FCA5A5' : T.light, textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 4px' }}>
                  {isAlerte ? '⚠ Alerte' : 'Actualité'}
                </p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', margin: '0 0 4px', lineHeight: 1.25 }}>
                  {a.titre}
                </p>
                {a.contenu && (
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.45 }}>
                    {a.contenu}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Description */}
      {service.description && (
        <div style={{ padding: '14px 18px 6px' }}>
          <p style={{ fontSize: 14, color: T.ink, lineHeight: 1.55, margin: 0, fontWeight: 500 }}>
            {service.description}
          </p>
        </div>
      )}

      {/* Actions principales — Appeler / Email / Itinéraire / Site */}
      <div style={{ padding: '12px 14px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {service.telephone && (
          <a href={`tel:${service.telephone}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: `linear-gradient(135deg, ${couleurAccent}, ${isUrgence ? '#991B1B' : T.main})`, color: '#fff', textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, boxShadow: `0 6px 18px ${isUrgence ? '#DC262633' : T.main + '33'}` }}>
            <IconPhone size={20} color="#fff"/>
            <span>Appeler</span>
            <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.85 }}>{service.telephone}</span>
          </a>
        )}
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: '#fff', color: T.ink, textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, border: `1.5px solid ${T.pale}` }}>
            <IconMap size={20} color={T.main}/>
            <span>Itinéraire</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {service.adresse || 'Voir sur la carte'}
            </span>
          </a>
        )}
        {service.email_public && (
          <a href={`mailto:${service.email_public}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: '#fff', color: T.ink, textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, border: `1.5px solid ${T.pale}` }}>
            <IconMail size={20} color={T.main}/>
            <span>Email</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {service.email_public}
            </span>
          </a>
        )}
        {service.site_web && (
          <a href={service.site_web.startsWith('http') ? service.site_web : `https://${service.site_web}`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '14px 10px', borderRadius: 14, background: '#fff', color: T.ink, textDecoration: 'none', fontWeight: 800, fontSize: 13, gap: 6, border: `1.5px solid ${T.pale}` }}>
            <IconGlobe size={20} color={T.main}/>
            <span>Site web</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {service.site_web.replace(/^https?:\/\//, '')}
            </span>
          </a>
        )}
      </div>

      {/* Horaires */}
      {service.horaires_detail && Object.keys(service.horaires_detail).length > 0 && (
        <div style={{ padding: '14px 18px 6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <IconClock size={16} color={T.deep}/>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Horaires
            </span>
          </div>
          <div style={{ background: '#fff', borderRadius: 14, padding: '4px 0', border: `1px solid ${T.hairline}` }}>
            {Object.entries(JOURS_LABEL).map(([key, label], i) => {
              const h = service.horaires_detail?.[key]
              return (
                <div key={key} style={{ padding: '10px 14px', borderBottom: i < 6 ? `1px solid ${T.hairline}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: h?.ouvert === false ? T.muted : T.main }}>
                    {h?.ouvert === false ? 'Fermé' : (h?.debut && h?.fin ? `${h.debut} – ${h.fin}` : '—')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Périmètre couvert */}
      {service.codes_postaux && service.codes_postaux.length > 0 && !service.national && (
        <div style={{ padding: '12px 18px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 6px' }}>
            Périmètre couvert
          </p>
          <p style={{ fontSize: 12, color: T.deep, margin: 0, lineHeight: 1.5 }}>
            Codes postaux : {service.codes_postaux.join(' · ')}
          </p>
        </div>
      )}

      {service.national && (
        <div style={{ padding: '12px 18px 8px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 100, background: '#FEE2E2', color: '#991B1B', fontWeight: 700, fontSize: 11, letterSpacing: '0.3px' }}>
            🌍 Service national — disponible dans toute la Belgique
          </div>
        </div>
      )}

      {/* Bouton signalement discret en bas */}
      <div style={{ padding: '14px 18px 28px', textAlign: 'center' }}>
        {signalementSent ? (
          <p style={{ fontSize: 12, color: '#16A34A', fontWeight: 700, margin: 0 }}>
            ✓ Merci, signalement enregistré
          </p>
        ) : (
          <button onClick={() => setShowSignalement(true)}
            style={{ background: 'none', border: 'none', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline', textDecorationColor: T.hairline, textUnderlineOffset: 3 }}>
            Signaler un problème sur cette fiche
          </button>
        )}
      </div>

      {showSignalement && (
        <ModalSignalement
          target={{ kind: 'service', id: service.id, nom: service.nom }}
          yopperId={typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null}
          onClose={() => setShowSignalement(false)}
          onSent={() => setSignalementSent(true)}
        />
      )}
    </div>
  )
}
