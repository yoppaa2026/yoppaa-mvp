'use client'
// LandingReveal : landing complète affichée à partir du 1er août 10h (mode
// 'reveal' de lib/landing-mode.js). Le grand dévoilement : ce qu'est Yoppaa,
// pour les Yoppers et pour les commerçants, avec mockups fidèles à l'app.
//
// V2 (retours Alex 30/07) : mockups à hauteur identique (écran 460px),
// textes réécrits (français fluide), décors absolute retirés (jank scroll
// iOS, cf. reference_scroll_jank_ios), section formules détaillée avec
// Exister et Communiquer mis en avant (signaux des Yoppers, push ciblés)
// + bloc transparence.
//
// Duplication ASSUMÉE de la logique formulaire de LandingTeasing (Turnstile,
// stats communes, soumission) : le Teasing disparaît au 1er août, on ne
// refactore pas une page en prod à J-3. Source : LandingTeasing.js.

import { useState, useEffect, useRef } from 'react'
import Script from 'next/script'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import YoppaaLogo from '@/app/components/YoppaaLogo'
import {
  LAUNCH_DATE_ISO, libelleLancement, libelleDernierJourGratuit,
  joursOfferts, joursOffertsAuLancement, joursAvance,
  progressionVersLancement, joursAvantLancement,
  estRegimeLancement, ESSAI_JOURS_MINIMUM,
} from '@/lib/lancement'
import { FACEBOOK_URL, RESEAUX } from '@/lib/reseaux'
import { getPrixPlan } from '@/lib/plans'
import { TYPES_ENVIE, libelleEnvie } from '@/lib/signaux'
import { LIBELLE_COMMERCANT, LIBELLE_HABITANT } from '@/lib/libelles-audience'
import PartageMobilisation from './PartageMobilisation'

const T = {
  ink:     '#1A0840',
  panel:   '#160636',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  bg:      '#F8F6FF',
  muted:   '#6B7280',
}

// ⚠️ La date d'ouverture et l'offre de lancement viennent de lib/lancement.js,
// et de nulle part ailleurs : une landing qui promet une date et une facture
// qui en applique une autre, c'est le pire défaut possible.
const LAUNCH_DATE = new Date(LAUNCH_DATE_ISO)

function pad(n) { return String(n).padStart(2, '0') }

function calculerTemps() {
  const now = new Date()
  const diff = Math.max(0, LAUNCH_DATE.getTime() - now.getTime())
  return {
    jours:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    heures:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes:  Math.floor((diff / (1000 * 60)) % 60),
    secondes: Math.floor((diff / 1000) % 60),
  }
}

// ─── Petites briques visuelles ───────────────────────────────────────────────

// Drapeau belge SVG (l'emoji 🇧🇪 s'affiche « BE » sous Windows)
function DrapeauBelge({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 30 20" aria-label="Belgique"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', margin: '0 5px 0 4px', borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
      <rect width="10" height="20" fill="#000000"/>
      <rect x="10" width="10" height="20" fill="#FAE042"/>
      <rect x="20" width="10" height="20" fill="#ED2939"/>
    </svg>
  )
}

// Bande 3px canonique YOPPAA (signature visuelle de toutes les cards de l'app)
function Bande3px() {
  return <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
}

// Icônes SVG inline (charte : jamais d'emoji décoratif)
function IconFlame({ size = 12, color = '#FB923C' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2c1 3 3 4 3 7 0 1.5-1 3-3 3s-3-1.5-3-3c0-2 2-3 3-7zm-5 9c-1 0-3 2-3 6 0 4 3 5 8 5s8-1 8-5c0-4-2-6-3-6 0 3-2 5-5 5s-5-2-5-5z"/>
    </svg>
  )
}
function IconCheck({ size = 14, color = '#10B981', sw = 3 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5L20 7"/>
    </svg>
  )
}
function IconBell({ size = 13, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function IconSparkles({ size = 12, color = T.light }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 5.8H20l-5 3.6L17 18l-5-3.6L7 18l2-5.6-5-3.6h6.1L12 3z"/>
    </svg>
  )
}
function IconHeart({ size = 12, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
    </svg>
  )
}

function IconGift({ size = 12, color = T.main }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/>
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
    </svg>
  )
}

// Trio « rassurance » de la section commerçant (matériel, accompagnement, support)
function IconDevices({ size = 20, color = T.light }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="13" height="9" rx="1.5"/><path d="M5.5 17h6"/><path d="M8.5 13v4"/>
      <rect x="16.5" y="9" width="5.5" height="11" rx="1.5"/>
    </svg>
  )
}
function IconLifebuoy({ size = 20, color = T.light }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/>
      <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9"/>
    </svg>
  )
}
function IconHeadset({ size = 20, color = T.light }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 13v-1a8 8 0 0 1 16 0v1"/>
      <path d="M4 13h2.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 17z"/>
      <path d="M20 13h-2.5a1 1 0 0 0-1 1v3.5a1 1 0 0 0 1 1H18a2 2 0 0 1-2 2h-2.5"/>
    </svg>
  )
}

// Cadre téléphone : écran de l'app reproduit en CSS, HAUTEUR FIXE commune
// (les 4 mockups font exactement la même taille, demande Alex 30/07)
const ECRAN_H = 460

// Barre d'état du téléphone : heure, réseau, wifi, batterie. Tous les écrans
// démarrent par un bandeau sombre, l'encre est donc toujours blanche.
function StatusBar() {
  const c = '#fff'
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 13px', zIndex: 6, pointerEvents: 'none' }}>
      <span style={{ fontSize: 8.5, fontWeight: 800, color: c, letterSpacing: '0.2px' }}>7:30</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 3.5 }}>
        <svg width="11" height="8" viewBox="0 0 12 8" fill={c} aria-hidden="true">
          <rect y="5.5" width="2" height="2.5" rx="0.6" opacity="0.9"/><rect x="3.2" y="3.8" width="2" height="4.2" rx="0.6" opacity="0.9"/>
          <rect x="6.4" y="2" width="2" height="6" rx="0.6" opacity="0.9"/><rect x="9.6" y="0" width="2" height="8" rx="0.6" opacity="0.5"/>
        </svg>
        <svg width="10" height="8" viewBox="0 0 12 9" fill="none" stroke={c} strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
          <path d="M1.2 3.1a7 7 0 0 1 9.6 0"/><path d="M3.2 5.3a4 4 0 0 1 5.6 0"/><circle cx="6" cy="7.5" r="0.85" fill={c} stroke="none"/>
        </svg>
        <svg width="16" height="8" viewBox="0 0 18 9" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="14" height="8" rx="2.2" stroke={c} strokeOpacity="0.55"/>
          <rect x="2" y="2" width="9" height="5" rx="1.2" fill={c}/>
          <path d="M16.2 3.1v2.8a1.6 1.6 0 0 0 0-2.8z" fill={c} fillOpacity="0.55"/>
        </svg>
      </span>
    </div>
  )
}

function PhoneFrame({ children, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {/* Ombre volontairement modérée : les gros blurs (60px) coûtent cher à
          re-rastériser après une pause de scroll (jank PC constaté) */}
      <div style={{ width: 264, borderRadius: 32, background: '#0B0318', padding: 9, boxShadow: '0 10px 24px rgba(22,6,54,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ borderRadius: 24, overflow: 'hidden', background: T.bg, position: 'relative', height: ECRAN_H }}>
          {/* Encoche */}
          <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 74, height: 16, borderRadius: 100, background: '#0B0318', zIndex: 5 }}/>
          <StatusBar/>
          {children}
        </div>
      </div>
      {label && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'inherit', opacity: 0.85, textAlign: 'center', maxWidth: 250, lineHeight: 1.4 }}>{label}</p>}
    </div>
  )
}

// ─── Mockup 1 : fiche commerçant Click & Collect (côté Yopper) ───────────────
function MockFiche() {
  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Hero fiche violet + card infos qui chevauche */}
      <div style={{ height: 74, background: `linear-gradient(135deg, ${T.panel} 0%, ${T.deep} 40%, ${T.main} 100%)`, position: 'relative', flexShrink: 0 }}>
        <Bande3px/>
      </div>
      <div style={{ background: '#fff', margin: '-30px 10px 0', borderRadius: 14, padding: '10px 12px', boxShadow: '0 8px 24px rgba(22,6,54,0.16)', position: 'relative', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, border: '2px solid #fff', marginTop: -22, boxShadow: '0 4px 12px rgba(22,6,54,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l2 4h8l2-4"/><path d="M6 22l-2-9h16l-2 9"/><path d="M9 12v4M15 12v4M12 12v4"/></svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 6.5, fontWeight: 800, color: T.main, background: T.pale, padding: '2px 6px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Boulangerie</span>
            <p style={{ margin: '3px 0 0', fontWeight: 900, fontSize: 13, color: T.ink, letterSpacing: '-0.3px' }}>Boulangerie du Centre</p>
          </div>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F0FDF4', borderRadius: 100, padding: '2px 7px', border: '1px solid #10B98133', marginTop: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981' }}/>
          <span style={{ fontSize: 8, fontWeight: 800, color: '#10B981' }}>Ouvert · 07:00–18:00</span>
        </div>
      </div>
      {/* Jours de retrait */}
      <div style={{ display: 'flex', gap: 5, padding: '10px 10px 0', flexShrink: 0 }}>
        {['Auj.', 'Demain', 'Jeudi'].map((j, i) => (
          <span key={j} style={{ padding: '4px 10px', borderRadius: 100, fontSize: 8.5, fontWeight: 800, background: i === 0 ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: i === 0 ? '#fff' : T.deep, border: i === 0 ? 'none' : `1px solid ${T.pale}` }}>{j}</span>
        ))}
      </div>
      {/* Deal du jour (vraie DealOfferCard) */}
      <div style={{ margin: '9px 10px 0', background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, borderRadius: 11, padding: '8px 10px', border: `1px solid ${T.main}55`, flexShrink: 0 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 6.5, fontWeight: 800, color: '#FB923C', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          <IconFlame size={8}/> Deal du jour
        </span>
        <p style={{ margin: '2px 0 3px', fontWeight: 800, color: '#fff', fontSize: 10.5 }}>3 croissants + 1 offert</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: T.light }}>5,40€</span>
            <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.55)', textDecoration: 'line-through', fontWeight: 700 }}>7,20€</span>
          </div>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 12 }}>+</span>
        </div>
      </div>
      {/* Articles */}
      {[
        { nom: 'Croissant au beurre', prix: '1,80€', stock: '12 dispo', qte: 2 },
        { nom: 'Pain complet', prix: '3,20€', stock: '6 dispo', qte: 0 },
      ].map(a => (
        <div key={a.nom} style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 11, padding: '8px 10px', border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 10.5, color: T.ink }}>{a.nom}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 900, color: T.main }}>{a.prix}</span>
              <span style={{ fontSize: 7, fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '1px 6px', borderRadius: 100, border: '1px solid #10B98133' }}>{a.stock}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {a.qte > 0 && (
              <>
                <span style={{ width: 18, height: 18, borderRadius: 6, border: `1px solid ${T.pale}`, color: T.main, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10 }}>−</span>
                <span style={{ fontWeight: 900, fontSize: 10, color: T.ink }}>{a.qte}</span>
              </>
            )}
            <span style={{ width: 20, height: 20, borderRadius: 6, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 11 }}>+</span>
          </div>
        </div>
      ))}
      {/* CTA panier collé en bas */}
      <div style={{ padding: 10, marginTop: 'auto' }}>
        <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '8px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff' }}>Commander · retrait 16:30</span>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: '#fff' }}>9,00€</span>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup 2 : Good Morning Yoppers (l'édition de 7h30) ────────────────────
function MockMorning() {
  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', background: T.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, padding: '26px 12px 12px', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 7.5, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Chaque matin · 7h30</p>
        <p style={{ margin: '3px 0 0', fontWeight: 900, fontSize: 14, color: '#fff', letterSpacing: '-0.3px' }}>Good Morning Yoppers</p>
        <p style={{ margin: '2px 0 0', fontSize: 8.5, color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Les deals et actus de ta commune</p>
      </div>
      {/* Carte deal façon post */}
      <div style={{ margin: '10px 10px 0', background: '#fff', borderRadius: 12, padding: '9px 11px', border: `1px solid ${T.pale}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, flexShrink: 0 }}>B</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: T.ink }}>Boulangerie du Centre</p>
            <p style={{ margin: 0, fontSize: 7, color: T.main, fontWeight: 600 }}>Boulangerie · aujourd&rsquo;hui</p>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 100, background: T.pale, color: T.deep, fontSize: 6.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            <IconFlame size={7} color={T.main}/> Deal
          </span>
        </div>
        <p style={{ margin: '0 0 5px', fontSize: 10.5, fontWeight: 700, color: T.ink }}>3 croissants + 1 offert</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>5,40€</span>
          <span style={{ fontSize: 8.5, color: T.mid, textDecoration: 'line-through' }}>7,20€</span>
          <span style={{ fontSize: 6.5, fontWeight: 700, padding: '2px 6px', borderRadius: 20, background: '#FEF2F2', color: '#DC2626' }}>5 restants</span>
          <span style={{ marginLeft: 'auto', fontSize: 7, fontWeight: 700, color: T.main, textTransform: 'uppercase', letterSpacing: '0.4px' }}>J&rsquo;en profite ›</span>
        </div>
      </div>
      {/* Carte actu commerçant */}
      <div style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 12, padding: '9px 11px', border: `1px solid ${T.pale}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${T.deep}, ${T.main})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, flexShrink: 0 }}>T</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: T.ink }}>Torréfaction Sainte-Croix</p>
            <p style={{ margin: 0, fontSize: 7, color: T.main, fontWeight: 600 }}>Torréfacteur · actu</p>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: T.ink }}>Nouvel arrivage d&rsquo;Éthiopie ce samedi</p>
      </div>
      {/* Carte actu boutique */}
      <div style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 12, padding: '9px 11px', border: `1px solid ${T.pale}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: `linear-gradient(135deg, ${T.mid}, ${T.light})`, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 10, flexShrink: 0 }}>M</span>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: T.ink }}>Maison Léa</p>
            <p style={{ margin: 0, fontSize: 7, color: T.main, fontWeight: 600 }}>Boutique · actu</p>
          </div>
        </div>
        <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, color: T.ink }}>La nouvelle collection est arrivée</p>
      </div>
      {/* Push notification collée en bas */}
      <div style={{ margin: 'auto 10px 10px', background: 'rgba(107,53,196,0.08)', borderRadius: 10, padding: '7px 10px', display: 'flex', alignItems: 'center', gap: 6, border: `1px dashed ${T.main}44` }}>
        <IconBell size={11}/>
        <p style={{ margin: 0, fontSize: 8, fontWeight: 700, color: T.deep, lineHeight: 1.4 }}>Une notification chaque matin, pour ta commune uniquement</p>
      </div>
    </div>
  )
}

// ─── Mockup 3 : prise de RDV (services) ──────────────────────────────────────
function MockRdv() {
  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', background: T.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, padding: '26px 12px 12px', flexShrink: 0 }}>
        <p style={{ margin: 0, fontWeight: 900, fontSize: 13, color: '#fff', letterSpacing: '-0.3px' }}>Barbier Léon</p>
        <p style={{ margin: '2px 0 0', fontSize: 8.5, color: T.light, fontWeight: 700 }}>Prendre rendez-vous</p>
      </div>
      <div style={{ padding: '10px 10px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <p style={{ margin: '0 0 6px', fontSize: 7.5, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Choisis ta prestation</p>
        <div style={{ background: '#fff', borderRadius: 11, padding: '8px 10px', border: `1.5px solid ${T.main}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: `0 4px 14px ${T.main}22` }}>
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 10.5, color: T.ink }}>Coupe + barbe</p>
            <p style={{ margin: '2px 0 0', fontSize: 8, color: T.muted, fontWeight: 600 }}>45 min</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 900, color: T.main }}>28,00€</span>
        </div>
        <p style={{ margin: '10px 0 6px', fontSize: 7.5, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Avec qui ?</p>
        <div style={{ display: 'flex', gap: 5 }}>
          {[{ n: 'Léon', actif: true }, { n: 'Sami', actif: false }, { n: 'Sans préférence', actif: false }].map(p => (
            <span key={p.n} style={{ padding: '4px 9px', borderRadius: 100, fontSize: 8, fontWeight: 800, background: p.actif ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: p.actif ? '#fff' : T.deep, border: p.actif ? 'none' : `1px solid ${T.pale}` }}>{p.n}</span>
          ))}
        </div>
        <p style={{ margin: '10px 0 6px', fontSize: 7.5, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Jeudi 8 octobre</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {[
            { h: '09:00', pris: false, actif: false },
            { h: '09:45', pris: false, actif: true },
            { h: '10:30', pris: true, actif: false },
            { h: '11:15', pris: false, actif: false },
            { h: '14:00', pris: false, actif: false },
            { h: '14:45', pris: false, actif: false },
          ].map(s => (
            <span key={s.h} style={{ padding: '5px 9px', borderRadius: 8, fontSize: 8.5, fontWeight: 800, background: s.actif ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: s.actif ? '#fff' : s.pris ? '#C7C9D1' : T.deep, border: s.actif ? 'none' : `1px solid ${T.pale}`, textDecoration: s.pris ? 'line-through' : 'none' }}>{s.h}</span>
          ))}
        </div>
        <div style={{ marginTop: 'auto', paddingBottom: 10 }}>
          <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '8px 14px', textAlign: 'center' }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: '#fff' }}>Confirmer mon RDV</span>
          </div>
          <div style={{ marginTop: 8, background: '#F0FDF4', border: '1px solid #10B98144', borderRadius: 10, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <IconCheck size={11}/>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#10B981' }}>C&rsquo;est noté ! Rappel 1h avant 🟣</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup 4 : dashboard commerçant ────────────────────────────────────────
// Reproduit l'écran d'accueil réel : en-tête sombre avec le nom du commerce,
// onglets Commandes / RDV / Paramètres, actions rapides (esprit ODOO), stats
// du jour, sélecteur de jours, puis les commandes à préparer.
function MockDashboard() {
  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', background: T.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* En-tête */}
      <div style={{ background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, padding: '25px 11px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2l2 4h8l2-4"/><path d="M6 22l-2-9h16l-2 9"/></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 900, fontSize: 11, color: '#fff', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Boulangerie du Centre</p>
            <p style={{ margin: '1px 0 0', fontSize: 6.5, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Formule Vendre</p>
          </div>
          <span style={{ width: 20, height: 20, borderRadius: 6, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconBell size={10} color={T.light}/>
          </span>
        </div>
        {/* Onglets principaux */}
        <div style={{ display: 'flex', gap: 5, marginTop: 9 }}>
          {[{ l: 'Commandes', a: true }, { l: 'RDV', a: false }, { l: 'Paramètres', a: false }].map(o => (
            <span key={o.l} style={{ padding: '4px 10px', borderRadius: 100, fontSize: 8, fontWeight: 800, background: o.a ? '#fff' : 'rgba(255,255,255,0.10)', color: o.a ? T.deep : 'rgba(255,255,255,0.75)' }}>{o.l}</span>
          ))}
        </div>
      </div>

      {/* Actions rapides (les gestes de comptoir, sans fouiller les réglages) */}
      <div style={{ display: 'flex', gap: 5, padding: '9px 10px 0', flexShrink: 0 }}>
        {[
          { l: 'Carte de fidélité', a: 'Pointer un client', i: <IconHeart size={9} color={T.main}/> },
          { l: 'Bon cadeau', a: 'Encaisser un code', i: <IconGift size={9} color={T.main}/> },
        ].map(x => (
          <div key={x.l} style={{ flex: 1, minWidth: 0, background: '#fff', borderRadius: 9, border: `1px solid ${T.pale}`, padding: '5px 7px', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 17, height: 17, borderRadius: 5, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{x.i}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 7.5, fontWeight: 800, color: T.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.l}</span>
              <span style={{ display: 'block', fontSize: 6, fontWeight: 700, color: T.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.a}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Stats du jour */}
      <div style={{ display: 'flex', gap: 5, padding: '7px 10px 0', flexShrink: 0 }}>
        {[
          { val: '4', label: 'à préparer', color: '#DC2626', bg: '#FEF2F2', bd: '#FECACA', pulse: true },
          { val: '2', label: 'prêtes', color: '#059669', bg: '#F0FDF4', bd: '#A7F3D0', pulse: false },
          { val: '184,60€', label: 'CA du jour', color: T.main, bg: '#fff', bd: T.pale, pulse: false },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: s.bg, borderRadius: 9, padding: '5px 6px', border: `1px solid ${s.bd}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {s.pulse && <span style={{ width: 4, height: 4, borderRadius: '50%', background: s.color, flexShrink: 0 }}/>}
              <p style={{ margin: 0, fontSize: 5.8, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
            </div>
            <p style={{ margin: '1px 0 0', fontWeight: 900, fontSize: 13, color: s.color, letterSpacing: '-0.6px', lineHeight: 1.1 }}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Sélecteur de jours */}
      <div style={{ display: 'flex', gap: 4, padding: '7px 10px 0', flexShrink: 0 }}>
        {[{ l: 'Aujourd’hui', n: 4, a: true }, { l: 'Demain', n: 3, a: false }, { l: 'Historique', n: 0, a: false }].map(j => (
          <span key={j.l} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 100, fontSize: 7.5, fontWeight: 800, background: j.a ? T.main : '#fff', color: j.a ? '#fff' : T.ink, border: j.a ? 'none' : `1px solid ${T.main}28` }}>
            {j.l}
            {j.n > 0 && <span style={{ background: j.a ? 'rgba(255,255,255,0.3)' : '#DC2626', color: '#fff', fontSize: 5.8, fontWeight: 800, padding: '0.5px 4px', borderRadius: 100 }}>{j.n}</span>}
          </span>
        ))}
      </div>

      {/* Commande à préparer */}
      <div style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 11, border: `1px solid ${T.pale}`, overflow: 'hidden', flexShrink: 0 }}>
        <Bande3px/>
        <div style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 9.5, color: T.ink }}>#1042 · Marie D.</p>
            <span style={{ fontSize: 6.5, fontWeight: 800, color: '#B45309', background: '#FEF3C7', padding: '2px 7px', borderRadius: 100 }}>En préparation</span>
          </div>
          <p style={{ margin: '0 0 3px', fontSize: 8, color: T.muted, fontWeight: 600 }}>4 croissants · 1 pain complet</p>
          <p style={{ margin: '0 0 6px', fontSize: 7.5, color: T.main, fontWeight: 800 }}>Retrait 16:30 · payé en ligne · 9,00€</p>
          <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '5px 10px', textAlign: 'center' }}>
            <span style={{ fontSize: 8, fontWeight: 800, color: '#fff' }}>Marquer prête · le client est prévenu</span>
          </div>
        </div>
      </div>

      {/* Commande déjà prête */}
      <div style={{ margin: '7px 10px 0', background: '#fff', borderRadius: 11, border: '1px solid #A7F3D0', padding: '7px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 9.5, color: T.ink }}>#1041 · Yasmine B.</p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 6.5, fontWeight: 800, color: '#059669', background: '#F0FDF4', padding: '2px 7px', borderRadius: 100 }}>
            <IconCheck size={7}/> Prête
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 7.5, color: T.muted, fontWeight: 600 }}>Notification envoyée à 15:52 · retrait 16:00</p>
      </div>

      {/* Assistant IA, collé en bas */}
      <div style={{ margin: 'auto 10px 10px', background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, borderRadius: 11, padding: '8px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <IconSparkles size={9}/>
          <span style={{ fontSize: 6.5, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Rédiger avec l&rsquo;IA</span>
        </div>
        <p style={{ margin: 0, fontSize: 8, color: '#fff', fontWeight: 600, lineHeight: 1.4 }}>Trois propositions de texte pour ton deal, prêtes en cinq secondes.</p>
      </div>
    </div>
  )
}

// ─── Mockup 5 : la carte de fidélité du Yopper (page reçue par SMS) ─────────
function MockFidelite() {
  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', height: '100%', display: 'flex', flexDirection: 'column', background: `linear-gradient(180deg, ${T.panel} 0%, ${T.deep} 58%, ${T.main} 130%)`, padding: '26px 10px 10px' }}>
      {/* Le SMS qui amène le client sur sa carte */}
      <div style={{ background: 'rgba(255,255,255,0.94)', borderRadius: 11, padding: '6px 9px', flexShrink: 0, boxShadow: '0 6px 16px rgba(0,0,0,0.28)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3.5, background: '#22C55E', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-2.9-.4L3 21l1.6-4.8A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/></svg>
          </span>
          <span style={{ fontSize: 6, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Messages · Yoppaa</span>
          <span style={{ marginLeft: 'auto', fontSize: 6, fontWeight: 700, color: T.muted }}>maintenant</span>
        </div>
        <p style={{ margin: 0, fontSize: 7.5, color: T.ink, fontWeight: 600, lineHeight: 1.4 }}>Ta carte de fidélité chez Boulangerie du Centre est ouverte 🟣 Suis-la ici : yoppaa.app/carte/…</p>
      </div>

      {/* Wordmark tricolore fond foncé */}
      <div style={{ textAlign: 'center', margin: '12px 0 10px', flexShrink: 0 }}>
        <p style={{ margin: 0, fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: 19, letterSpacing: '-0.05em', lineHeight: 1 }}>
          <span style={{ color: '#fff' }}>yo</span><span style={{ color: T.light }}>pp</span><span style={{ color: T.mid }}>aa</span>
        </p>
        <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
          {['#fff', T.light, T.mid].map((c, i) => (
            <span key={i} style={{ width: 4.5, height: 4.5, borderRadius: '50%', background: c, opacity: i === 0 ? 0.55 : 1 }}/>
          ))}
        </div>
      </div>

      {/* La carte */}
      <div style={{ background: '#fff', borderRadius: 15, overflow: 'hidden', boxShadow: '0 12px 30px rgba(0,0,0,0.32)', flexShrink: 0 }}>
        <Bande3px/>
        <div style={{ padding: '12px 12px 13px', textAlign: 'center' }}>
          <p style={{ margin: '0 0 1px', fontSize: 6.5, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.9px' }}>Ma carte de fidélité</p>
          <p style={{ margin: '0 0 10px', fontWeight: 900, fontSize: 12, color: T.ink, letterSpacing: '-0.3px' }}>Boulangerie du Centre</p>

          <div style={{ background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, borderRadius: 11, padding: '11px 11px 12px' }}>
            <p style={{ margin: '0 0 5px', fontSize: 6, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '0.9px' }}>Mes passages</p>
            <p style={{ margin: '0 0 8px', fontSize: 21, fontWeight: 900, color: '#fff', letterSpacing: '-1px', lineHeight: 1 }}>
              7<span style={{ fontSize: 10, fontWeight: 700, color: T.light, marginLeft: 4 }}>/ 10</span>
            </p>
            <div style={{ height: 6, borderRadius: 100, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
              <div style={{ width: '70%', height: '100%', borderRadius: 100, background: `linear-gradient(90deg, ${T.light}, #fff)` }}/>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 7.5, color: T.light, lineHeight: 1.45 }}>
              Encore <strong style={{ color: '#fff' }}>3 passages</strong> et tu débloques : 1 café offert
            </p>
          </div>

          <div style={{ marginTop: 10, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '7px 12px' }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff' }}>Voir Boulangerie du Centre</span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 6.5, color: T.muted, lineHeight: 1.45 }}>Garde ce lien : c&rsquo;est ta carte, elle se met à jour toute seule 🟣</p>
        </div>
      </div>

      <p style={{ margin: 'auto 0 0', textAlign: 'center', fontSize: 6.5, color: 'rgba(255,255,255,0.55)', paddingTop: 8 }}>Ton quartier dans ta poche 🟣</p>
    </div>
  )
}

// ─── Mockup 6 : inscription commerçant (étape 5, score de complétude) ───────
function MockOnboarding() {
  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', background: T.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, padding: '25px 11px 11px', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 6.5, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Créer mon commerce</p>
        <p style={{ margin: '2px 0 0', fontWeight: 900, fontSize: 12, color: '#fff', letterSpacing: '-0.3px' }}>Étape 5 sur 5 · Validation</p>
        {/* Fil des étapes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 9 }}>
          {['Compte', 'Infos', 'Visuels', 'Horaires', 'Validation'].map((e, i) => (
            <div key={e} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 3, borderRadius: 100, background: i <= 4 ? T.light : 'rgba(255,255,255,0.18)' }}/>
              <p style={{ margin: '3px 0 0', fontSize: 5.5, fontWeight: 800, color: i === 4 ? '#fff' : 'rgba(255,255,255,0.6)', letterSpacing: '0.2px' }}>{e}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Score de complétude */}
      <div style={{ margin: '9px 10px 0', background: '#fff', borderRadius: 11, border: `1px solid ${T.pale}`, padding: '9px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 5 }}>
          <div>
            <p style={{ margin: 0, fontSize: 8.5, fontWeight: 900, color: T.ink }}>Ton score de complétude</p>
            <p style={{ margin: '1px 0 0', fontSize: 6.5, color: T.muted, fontWeight: 600 }}>Minimum 60 / 100 pour soumettre.</p>
          </div>
          <p style={{ margin: 0, fontWeight: 900, fontSize: 15, color: '#10B981', letterSpacing: '-0.5px', lineHeight: 1 }}>
            82<span style={{ fontSize: 7.5, color: T.muted, fontWeight: 700 }}> / 100</span>
          </p>
        </div>
        <div style={{ height: 7, borderRadius: 100, background: T.pale, overflow: 'hidden' }}>
          <div style={{ width: '82%', height: '100%', background: 'linear-gradient(90deg, #10B981, #10B981cc)' }}/>
        </div>
      </div>

      {/* Ce qui est déjà rempli */}
      <div style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 11, border: `1px solid ${T.pale}`, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5, flexShrink: 0 }}>
        {[
          'Infos du commerce et adresse',
          'Logo et photo de couverture',
          'Horaires d’ouverture',
          'Catalogue : 6 articles publiés',
        ].map(l => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconCheck size={9}/>
            <span style={{ fontSize: 8, fontWeight: 700, color: T.ink }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Boutique Yoppaa : l'accompagnement se choisit ici */}
      <div style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 11, border: `1.5px solid ${T.main}`, padding: '8px 10px', flexShrink: 0, boxShadow: `0 4px 14px ${T.main}1F` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ width: 13, height: 13, borderRadius: 4, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <IconCheck size={8} color="#fff" sw={3.4}/>
          </span>
          <p style={{ margin: 0, fontSize: 8.5, fontWeight: 900, color: T.ink }}>Success Pack on-site</p>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 900, color: T.main }}>199€</span>
        </div>
        <p style={{ margin: 0, fontSize: 7, color: T.muted, fontWeight: 600, lineHeight: 1.45 }}>On vient chez toi : photos, installation complète de ton catalogue, formation, suivi à J+30. Optionnel.</p>
      </div>

      {/* Soumission */}
      <div style={{ margin: 'auto 10px 10px' }}>
        <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '8px 12px', textAlign: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>Envoyer mon dossier</span>
        </div>
        <p style={{ margin: '6px 0 0', textAlign: 'center', fontSize: 6.5, color: T.muted, fontWeight: 600, lineHeight: 1.4 }}>Réponse sous 48 h ouvrables. Ta page part en ligne dès la validation.</p>
      </div>
    </div>
  )
}

// ─── Compteur vers l'ouverture publique (isolé : tick sans re-render la page) ─
// Perf scroll : le repaint du tick chaque seconde est CONFINÉ à sa propre boîte
// (contain layout/paint) pour que la reprise du scroll ne le paie jamais, le
// tick est suspendu quand l'onglet est caché, et pas de text-shadow (coûteux à
// re-rastériser après une pause).
function CompteurLancement() {
  const [t, setT] = useState(calculerTemps)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const id = setInterval(() => {
      if (!document.hidden) setT(calculerTemps())
    }, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div style={{ display: 'flex', gap: 'clamp(10px, 3vw, 22px)', justifyContent: 'center', flexWrap: 'wrap', contain: 'layout paint', willChange: 'contents' }}>
      {[
        { val: t.jours, label: 'jours' },
        { val: t.heures, label: 'heures' },
        { val: t.minutes, label: 'minutes' },
        { val: t.secondes, label: 'secondes' },
      ].map(({ val, label }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 58 }}>
          <span style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {pad(val)}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── L'OFFRE DE LANCEMENT, en grand ─────────────────────────────────────────
// ⚠️ Elle vivait en petit texte gris sous les formules, et personne ne la
// voyait : une offre qu'il faut chercher n'est pas une offre.
//
// Elle dit maintenant sa MÉCANIQUE plutôt que de crier fort. La date de fin ne
// bouge pas, donc attendre coûte des jours, et ce coût SE CHIFFRE : c'est bien
// plus convaincant qu'un « dépêche-toi ». Les deux nombres sont calculés, pas
// écrits : ils fondent tout seuls, jour après jour.
//
// ⚠️ Et elle corrige un contresens : le 1er octobre est la date du lancement
// OFFICIEL, pas celle du départ. Un commerçant peut être en ligne bien avant,
// et c'est même tout son intérêt.
function EncartOffreLancement({ onRejoindre }) {
  if (!estRegimeLancement()) return null
  const garantis = joursOffertsAuLancement()   // 100, calculés depuis les deux dates
  const avance = joursAvance()                  // ce que l'avance ajoute, et qui fond

  return (
    <div style={{
      background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 58%, ${T.main} 130%)`,
      borderRadius: 24, overflow: 'hidden', color: '#fff',
      boxShadow: `0 14px 34px ${T.ink}3A`, margin: '0 0 40px',
    }}>
      <Bande3px/>
      <div style={{ padding: 'clamp(24px, 5vw, 38px)', display: 'flex', gap: 'clamp(20px, 4vw, 44px)', flexWrap: 'wrap', alignItems: 'center' }}>

        {/* ⚠️ UN SEUL CHIFFRE SUR TOUTE LA PAGE : 100.
            Décision d'Alex, 20/08 : « je ne veux pas qu'on annonce un chiffre
            en plus des 100 jours, tu es là plus tôt, génial et c'est bonus ».
            Un deuxième nombre oblige à expliquer une addition, et une offre
            qu'il faut expliquer se fait relire de travers. L'avance est donc
            dite en toutes lettres, jamais chiffrée. Ce qui est reçu reste
            évidemment plus généreux que ce qui est promis. */}
        <div style={{ flex: '1 1 240px', minWidth: 220 }}>
          <p style={{ margin: '0 0 10px', fontSize: 11.5, fontWeight: 900, color: T.light, textTransform: 'uppercase', letterSpacing: '1.4px' }}>
            Offre de lancement
          </p>
          <p style={{ margin: 0, fontSize: 'clamp(2.6rem, 8vw, 4rem)', fontWeight: 900, letterSpacing: '-2.5px', lineHeight: 1, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
            {garantis} jours
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 'clamp(1.3rem, 4vw, 1.8rem)', fontWeight: 900, letterSpacing: '-1px', color: T.light }}>
            offerts.
          </p>
          <p style={{ margin: '10px 0 0', fontSize: 13.5, fontWeight: 700, lineHeight: 1.5, color: 'rgba(255,255,255,0.86)' }}>
            À partir du {libelleLancement()}.
          </p>
        </div>

        {/* Ce que ça veut dire, concrètement */}
        <div style={{ flex: '1 1 340px', minWidth: 280 }}>
          <p style={{ margin: '0 0 14px', fontSize: '1.02rem', fontWeight: 700, lineHeight: 1.6, color: '#fff' }}>
            <strong style={{ color: T.light }}>Communiquer</strong> et <strong style={{ color: T.light }}>Vendre</strong> te
            sont offertes jusqu&rsquo;au <strong style={{ color: T.light }}>{libelleDernierJourGratuit()}</strong> inclus,
            quel que soit le forfait que tu choisis.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {['Zéro contrat', 'Zéro engagement', 'Sans carte de paiement', 'Résiliable en deux clics'].map(m => (
              <span key={m} style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 11px', borderRadius: 100, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff' }}>
                {m}
              </span>
            ))}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.16)', margin: '0 0 16px' }}/>

          {/* ⚠️ L'AVANCE EST DITE EN TOUTES LETTRES, JAMAIS CHIFFRÉE.
              Le bonus ne se compte pas, il se raconte : « tout ce qui précède
              est en plus ». Un second nombre obligerait à poser une addition,
              et une offre qu'il faut expliquer se fait relire de travers. */}
          <p style={{ margin: '0 0 18px', fontSize: 14, fontWeight: 600, lineHeight: 1.65, color: 'rgba(255,255,255,0.92)' }}>
            Le {libelleLancement()} est la date du lancement <strong style={{ color: '#fff' }}>officiel</strong>,
            pas celle du départ. Ta page part en ligne dès qu&rsquo;elle est validée et tes premiers
            clients commandent avant tout le monde.
            {avance > 0 && <> Et <strong style={{ color: '#fff' }}>tout le temps d&rsquo;ici
              le {libelleLancement()} est en bonus</strong> : il ne compte pas dans tes {garantis} jours,
              et il fond un peu chaque jour.</>}
          </p>
          {/* ⚠️ Style écrit ici, PAS `btnPrimaire` : celui-ci vit DANS le
              composant principal, donc l'appeler d'ici serait une variable
              libre. Aucune erreur au lint ni au build, et un écran blanc à
              l'exécution. Voir reference_eslint_no_undef_eteint. */}
          <button onClick={onRejoindre} style={{
            display: 'inline-block', padding: '15px 32px', borderRadius: 100, border: 'none',
            background: '#fff', color: T.deep,
            fontWeight: 900, fontSize: 14.5, letterSpacing: 0.4, textTransform: 'uppercase',
            cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
            boxShadow: '0 8px 22px rgba(0,0,0,0.28)',
          }}>
            Je prends mes {garantis} jours
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── LA FENÊTRE « TRIBU » ────────────────────────────────────────────────────
// Demandée par Alex le 20/08. Elle répond aux trois objections d'un commerçant
// qui hésite, dans l'ordre où elles lui viennent :
//   1. « combien ça me coûte pour essayer »  → 100 jours offerts
//   2. « et après, je suis coincé »          → zéro contrat, zéro engagement
//   3. « et si je veux juste être visible »  → Exister, gratuit à vie
//
// ⚠️ Alex avait d'abord demandé une fenêtre « un peu fake » annonçant X
// commerçants préinscrits aujourd'hui. Refusé : un chiffre fabriqué montré à
// quelqu'un qui décide de s'abonner est une affirmation fausse sur un fait
// vérifiable, et la page promet trois écrans plus haut que tout est écrit noir
// sur blanc. Le chiffre affiché ici est donc le VRAI, et c'est le seul de la
// page : 100.
//
// ⚠️ Trois précautions apprises à nos dépens :
//   • aucun `blur` ni ombre animée : ils font geler le défilement sur iPhone
//     (voir reference_scroll_jank_ios) ;
//   • une VRAIE croix de fermeture, et le refus est retenu pour la session :
//     une fenêtre qui revient à chaque écran se fait fermer sans être lue ;
//   • `dvh` jamais `vh`, et un décalage bas généreux pour ne pas couvrir les
//     boutons sur mobile.
function FenetreTribu({ onRejoindre, masquer }) {
  const [visible, setVisible] = useState(false)
  const [ferme, setFerme] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { if (sessionStorage.getItem('yoppaa_tribu_fermee')) return } catch { /* mode privé */ }
    // Elle attend que la personne ait vraiment commencé à lire : surgir à la
    // première seconde, c'est se faire fermer avant d'être lue.
    const id = setTimeout(() => setVisible(true), 9000)
    return () => clearTimeout(id)
  }, [])

  const fermer = () => {
    setFerme(true)
    try { sessionStorage.setItem('yoppaa_tribu_fermee', '1') } catch { /* mode privé */ }
  }

  if (!visible || ferme || masquer) return null

  return (
    <div style={{
      position: 'fixed', zIndex: 60,
      left: 'max(12px, env(safe-area-inset-left))',
      right: 'max(12px, env(safe-area-inset-right))',
      bottom: 'calc(16px + env(safe-area-inset-bottom))',
      maxWidth: 380, marginLeft: 'auto',
      background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 60%, ${T.panel} 100%)`,
      color: '#fff', borderRadius: 20, overflow: 'hidden',
      border: '1px solid rgba(196,160,244,0.35)',
      boxShadow: '0 16px 40px rgba(22,6,54,0.45)',
    }}>
      <Bande3px/>
      <div style={{ padding: '16px 18px 18px', position: 'relative' }}>
        <button onClick={fermer} aria-label="Fermer"
          style={{
            position: 'absolute', top: 10, right: 10, width: 30, height: 30,
            borderRadius: 100, border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(255,255,255,0.08)', color: '#fff',
            fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
          }}>
          ✕
        </button>

        {estRegimeLancement() && (
          <p style={{ margin: '0 0 6px', fontSize: 'clamp(1.35rem, 5vw, 1.65rem)', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.1, color: '#fff', paddingRight: 34 }}>
            {joursOffertsAuLancement()} jours offerts.
          </p>
        )}
        <p style={{ margin: '0 0 12px', fontSize: 15.5, fontWeight: 800, color: T.light, lineHeight: 1.35, paddingRight: 34 }}>
          Tu rejoins la tribu ?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          {[
            'Zéro contrat, zéro engagement',
            'Sans carte de paiement',
            'Et si tu veux juste rester visible, Exister est gratuit à vie',
          ].map(l => (
            <div key={l} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ marginTop: 3, flexShrink: 0, color: T.light }}><IconCheck size={12}/></span>
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45, color: 'rgba(255,255,255,0.92)' }}>{l}</span>
            </div>
          ))}
        </div>

        <button onClick={() => { fermer(); onRejoindre() }} style={{
          width: '100%', padding: '13px', borderRadius: 100, border: 'none',
          background: 'linear-gradient(135deg, #C4A0F4, #9660E0)', color: T.ink,
          fontWeight: 900, fontSize: 14, letterSpacing: 0.3, textTransform: 'uppercase',
          cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
        }}>
          Je rejoins la tribu
        </button>
      </div>
    </div>
  )
}

// Incitant mobilisation (repris de LandingTeasing, mêmes règles)
// ⚠️ RÉÉCRIT LE 20/08 : IL N'Y A PLUS DE SEUIL DE DÉBLOCAGE.
//
// Ce bloc affichait une jauge « 3 commerçants sur 10 pour activer Mettet », et
// tout le discours de la landing en découlait. La Wallonie est ouverte : cette
// jauge ne mesure plus rien, et laisser une barre de progression à l'écran
// ferait croire à une attente qui n'existe plus.
//
// Ce qui reste vrai et utile, c'est le NOMBRE. Il ne conditionne rien, il
// rassure : on ne rejoint pas une place vide. Un chiffre trop petit se tait de
// lui-même plutôt que d'annoncer « 1 commerçant », qui découragerait.
function IncitantMobilisation({ communeStats, globalStats }) {
  const boxSt = { margin: '0 0 14px', padding: '12px 14px', borderRadius: 12, background: 'rgba(150,96,224,0.14)', border: '1px solid rgba(196,160,244,0.35)' }
  const ligneSt = { margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }
  const sousSt = { margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }

  // ⚠️ PLUS AUCUN COMPTE AFFICHÉ (décision Alex, 20/08).
  // « 3 commerçants, 11 curieux » décourage au lieu d'entraîner : de petits
  // nombres racontent un démarrage, pas un mouvement. Mais retirer le chiffre
  // sans rien mettre à la place laisse un bloc mort.
  //
  // La barre montre donc le chemin parcouru entre l'annonce publique et
  // l'ouverture. Elle avance toute seule chaque jour, elle donne le sentiment
  // que ça bouge, et surtout ELLE NE MENT PAS : elle mesure du temps réel, que
  // n'importe qui peut recompter sur un calendrier. Une jauge de
  // « préparation » inventée aurait été un mensonge déguisé en pourcentage.
  const pct = progressionVersLancement()
  const restant = joursAvantLancement()
  const barreLancement = restant > 0 ? (
    <>
      <div style={{ height: 7, borderRadius: 100, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', margin: '8px 0 6px' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: 'linear-gradient(90deg, #9660E0, #C4A0F4)', transition: 'width 0.4s' }}/>
      </div>
      <p style={sousSt}>
        Ouverture officielle le {libelleLancement()} · <strong>J-{restant}</strong>
      </p>
    </>
  ) : null

  if (communeStats?.horsZone) {
    return (
      <div style={boxSt}>
        <p style={ligneSt}>Yoppaa démarre en Wallonie 🟣</p>
        <p style={{ ...sousSt, marginTop: 6 }}>Laisse ton email : on te prévient dès que Yoppaa arrive chez toi.</p>
      </div>
    )
  }
  if (communeStats) {
    return (
      <div style={boxSt}>
        <p style={ligneSt}>Yoppaa est ouvert à <strong>{communeStats.nom}</strong> 🟣</p>
        {barreLancement || <p style={{ ...sousSt, marginTop: 6 }}>Ta page peut être en ligne cette semaine.</p>}
      </div>
    )
  }
  if (globalStats) {
    return (
      <div style={boxSt}>
        <p style={ligneSt}>Yoppaa est ouvert dans toute la Wallonie 🟣</p>
        {barreLancement || <p style={{ ...sousSt, marginTop: 6 }}>Entre ton code postal : ta commune est déjà ouverte.</p>}
      </div>
    )
  }
  return null
}

const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: '1.5px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.08)',
  color: '#fff',
  fontSize: 14,
  fontFamily: '"DM Sans", sans-serif',
  marginBottom: 12,
  outline: 'none',
  boxSizing: 'border-box',
}

// ─── Titre de section réutilisable ──────────────────────────────────────────
// ─── LA TOTALE ───────────────────────────────────────────────────────────
//
// Le résumé-choc de l'offre, demandé par Alex le 26/08 : « il me faut une
// communication percutante ». Il ouvre la partie commerçant, AVANT les
// mockups et les cartes de formules, pour une raison de conversion : c'est le
// premier endroit où le commerçant sait que la page lui parle. Celui qui est
// déjà convaincu s'inscrit là, sans traverser six sections. Celui qui hésite
// continue à défiler, et tout le reste est fait pour lui.
//
// ⚠️ TROIS « TU VEUX… ? », TROIS RÉPONSES. Un commerçant ne lit pas une grille
// de comparaison, il cherche sa situation. Le gratuit passe en premier parce
// qu'il désarme l'objection avant qu'elle n'arrive.
//
// ⚠️ AUCUN PRIX, AUCUN NOMBRE DE JOURS ÉCRIT À LA MAIN : ils viennent de
// `lib/plans.js` et `lib/lancement.js`. Le jour où 19,90 bouge, ce bloc suit.
//
// ⚠️ ET RIEN QUE CE QUI EXISTE. La réservation de table est ABSENTE malgré son
// drapeau à `true` dans `lib/plans.js` : le module n'est pas écrit. Une liste
// « la totale » qui promet une fonctionnalité fantôme se retourne au premier
// restaurateur qui signe.
function LaTotale() {
  const prix = p => getPrixPlan(p)?.mensuel
  const eur = n => `${Number(n).toFixed(2).replace('.', ',')} €`

  // ⚠️ ALEX, 26/08 : « il ne faut plus broder, il faut être percutant et oser
  // s'affirmer ». Les descriptions sont donc des ÉNUMÉRATIONS, pas des
  // phrases : le commerçant scanne, il ne lit pas. Chaque mot de liaison retiré
  // est un nom de plus qu'il voit.
  const NIVEAUX = [
    {
      question: 'Être vu ?',
      reponse: 'Gratuit. À vie.',
      quoi: 'Ta page, tes photos, tes horaires, Google, tes statistiques, le Good Morning Yoppers.',
      // ⚠️ L'ARGUMENT LE PLUS FORT DE LA PAGE, et il est gratuit. C'est ce que
      // le module des signaux a été écrit pour porter : ce ne sont pas des
      // clients qu'il a déjà, ce sont des clients qu'il perd.
      signaux: true,
      prix: '0 €, pour toujours, sans carte.',
      vedette: true,
    },
    {
      question: 'Être entendu ?',
      reponse: `${eur(prix('communiquer'))}/mois.`,
      quoi: 'Actus, deals, bonnes affaires, notifications push à tes favoris, carte de fidélité, IA qui rédige tes textes.',
    },
    {
      question: 'Vendre ?',
      reponse: `${eur(prix('vendre'))}/mois.`,
      quoi: 'Click and Collect, livraison, rendez-vous en ligne, multi-praticiens, abonnements, paiement en ligne ou au comptoir, bons cadeaux, fidélité automatique.',
    },
  ]

  return (
    <div style={{ maxWidth: 780, margin: '0 auto 48px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 24, overflow: 'hidden' }}>
      <div style={{ padding: 'clamp(24px, 5vw, 34px)' }}>
        {/* ⚠️ LE TITRE EST D'ALEX, mot pour mot. Le mien disait « tout ce qu'un
            commerce de quartier peut faire en ligne » : correct, tiède, et
            long. Le sien nomme le lecteur et revendique la place. */}
        <h3 style={{ margin: '0 0 6px', fontSize: 'clamp(1.35rem, 3.8vw, 1.9rem)', fontWeight: 900, letterSpacing: '-0.9px', lineHeight: 1.15, color: '#fff', textAlign: 'center' }}>
          Les outils du commerçant de proximité.
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: 14.5, fontWeight: 700, color: T.light, textAlign: 'center' }}>
          {/* ⚠️ « Zéro commission » TOUT COURT est interdit, et le banc m'a
              arrêté ici. Le commerçant paie quand même les frais de son
              prestataire de paiement : sans le sujet, la phrase promet une
              gratuité qui n'existe pas. Règle d'Alex, gardée depuis des mois. */}
          Tout, dans une seule app. Zéro commission Yoppaa.
        </p>

        <div style={{ display: 'grid', gap: 16 }}>
          {NIVEAUX.map(n => (
            <div key={n.question} style={{ background: n.vedette ? 'rgba(196,160,244,0.13)' : 'rgba(255,255,255,0.04)', border: `1px solid ${n.vedette ? 'rgba(196,160,244,0.4)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 16, padding: '18px 18px 16px' }}>
              <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: '-0.3px' }}>
                {n.question} <span style={{ color: T.light }}>{n.reponse}</span>
              </p>
              <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, fontWeight: 500 }}>
                {n.quoi}
              </p>
              {n.signaux && (
                <>
                  <p style={{ margin: '12px 0 0', fontSize: 13.5, color: '#fff', lineHeight: 1.6, fontWeight: 700 }}>
                    Et tes Yoppers te disent ce qu’ils attendent de toi.
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, fontWeight: 500 }}>
                    {/* ⚠️ LES CINQ ENVIES VIENNENT DU MODULE, pas d'une liste
                        recopiée : ajouter un signal doit suffire à l'annoncer
                        ici. Le sixième, la carte de fidélité, est arrivé le
                        26/08 et cette phrase l'a pris toute seule. */}
                    {TYPES_ENVIE.map(t => libelleEnvie(t).court.toLowerCase()).join(', ')}. Tu vois combien
                    ils sont, et combien ont demandé <strong style={{ color: '#fff' }}>le soir ou le week-end,
                    quand ta boutique était fermée et que personne ne pouvait t’appeler.</strong>
                  </p>
                  <p style={{ margin: '10px 0 0', fontSize: 13.5, color: T.light, fontWeight: 800, lineHeight: 1.6 }}>
                    Ça ne s’achète nulle part. Et chez nous, c’est gratuit.
                  </p>
                </>
              )}
              {n.prix && (
                <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 800, color: T.light }}>{n.prix}</p>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 22, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.12)', textAlign: 'center' }}>
          {estRegimeLancement() && (
            <p style={{ margin: '0 0 6px', fontSize: 14.5, fontWeight: 800, color: '#fff', lineHeight: 1.55 }}>
              {joursOffertsAuLancement()} jours offerts à partir du {libelleLancement()},
              et tout le temps d’ici là est en bonus.
            </p>
          )}
          <p style={{ margin: '0 0 4px', fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 600, lineHeight: 1.6 }}>
            Sans carte de paiement. Sans engagement. Tarifs affichés, aucune surprise.
          </p>
          {/* ⚠️ « Yoppaa ne prend aucune commission », JAMAIS « tout te
              revient » : le commerçant paie quand même les frais de son
              prestataire de paiement, et la formule sans sujet est un mensonge
              par omission. Règle posée par Alex de longue date. */}
          <p style={{ margin: '0 0 22px', fontSize: 13, color: '#fff', fontWeight: 800 }}>
            Yoppaa ne prend aucune commission sur tes ventes.
          </p>

          {/* ⚠️ ALEX, 26/08 : « il faut faire comprendre aux commerçants qu'ils
              n'ont RIEN À PERDRE mais tout à gagner. »

              Le reste du bloc dit ce qu'il gagne. Celui-ci répond à la question
              qu'il se pose vraiment avant de cliquer : qu'est-ce que ça
              m'engage ? Chaque ligne est VÉRIFIABLE dans le produit, aucune
              n'est une figure de style :
                • Exister est à 0 € et son libellé de plan dit « Gratuit à vie » ;
                • les deux formules payantes portent « sans engagement » ;
                • aucun Checkout n'est ouvert à l'inscription (option B, 24/08) ;
                • Yoppaa ne prélève rien sur les ventes ;
                • et surtout, RIEN À REMPLACER : c'est écrit noir sur blanc dans
                  `lib/signaux.js`, un commerçant peut être là gratuitement même
                  s'il a déjà un logiciel de rendez-vous. C'est la réponse à la
                  seule vraie objection, « j'ai déjà un système ». */}
          <div style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 16, padding: '16px 18px', marginBottom: 22, textAlign: 'left' }}>
            <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 900, color: '#A7F3D0', letterSpacing: '-0.3px' }}>
              Ce que ça t’engage : rien.
            </p>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {[
                'Tu ne donnes aucune carte de paiement pour t’inscrire.',
                'Tu ne remplaces rien : garde ton logiciel, ta caisse, tes habitudes.',
                'Tu restes libre de partir quand tu veux, sans préavis.',
                'Et si tu n’en fais rien, ta page reste en ligne gratuitement. À vie.',
              ].map(l => (
                <li key={l} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 1.55, fontWeight: 600 }}>
                  <span style={{ flexShrink: 0, marginTop: 2, color: '#6EE7B7' }}><IconCheck size={12}/></span>
                  <span>{l}</span>
                </li>
              ))}
            </ul>
          </div>

          <p style={{ margin: '0 0 4px', fontSize: 'clamp(1.05rem, 2.6vw, 1.3rem)', fontWeight: 900, color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.3 }}>
            C’est le rendez-vous des Yoppers de ton quartier.
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 'clamp(1.05rem, 2.6vw, 1.3rem)', fontWeight: 900, color: T.light, letterSpacing: '-0.4px', lineHeight: 1.3 }}>
            Tu ne peux pas ne pas y être.
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500, lineHeight: 1.6 }}>
            Et si tu décides de ne pas venir, dis-le-nous : on veut comprendre pourquoi.
          </p>

          <Link href="/signup"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 32px', borderRadius: 100, background: 'linear-gradient(135deg, #C4A0F4, #9660E0)', color: '#1A0840', fontWeight: 900, fontSize: 15.5, textDecoration: 'none', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 8px 22px rgba(150,96,224,0.35)' }}>
            J&rsquo;inscris mon commerce
          </Link>
        </div>
      </div>
    </div>
  )
}

function SectionEyebrow({ children, dark = false }) {
  return (
    <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, color: dark ? T.light : T.main, textTransform: 'uppercase', letterSpacing: '1.6px' }}>
      {children}
    </p>
  )
}

// ─── Données des 3 formules (section tarifs) ────────────────────────────────
const FORMULES = [
  {
    nom: 'Exister',
    prix: 'Gratuit',
    sousPrix: 'pour toujours',
    badge: 'Gratuit à vie',
    accroche: 'Ton commerce existe en ligne, sans rien débourser.',
    points: [
      'Ta page professionnelle : horaires, photos, itinéraire, contact',
      'Visible dans l’app et référencée sur Google',
      'Une place chaque semaine dans le Good Morning Yoppers',
      'Les envies du quartier : les habitants te disent ce qu’ils aimeraient trouver chez toi',
    ],
  },
  {
    nom: 'Communiquer',
    prix: '19,90€',
    sousPrix: 'HTVA par mois',
    badge: 'Pour être vu chaque jour',
    accroche: 'Communique de façon ciblée : ta commune entend parler de toi chaque matin.',
    points: [
      'Tout Exister, plus :',
      'Deals du jour et actualités illimités',
      'Ta place quotidienne dans le Good Morning Yoppers',
      'Notifications push envoyées aux habitants de ta commune',
      'Carte de fidélité digitale : le numéro de GSM de ton client suffit, plus aucune carte perdue',
      'Assistant IA qui rédige tes deals et tes actus en quelques secondes',
    ],
  },
  {
    nom: 'Vendre',
    prix: '49,90€',
    sousPrix: 'HTVA par mois',
    badge: 'La totale · recommandée',
    accroche: 'Tu vends en ligne et tu gardes chaque euro de tes ventes.',
    vedette: true,
    points: [
      'Tout Communiquer, plus :',
      'Click & Collect avec paiement en ligne',
      'Rendez-vous en ligne, réservables 24h/24',
      'Boutique en ligne et livraison locale',
      'Fidélité automatique : chaque commande et chaque rendez-vous remplit la carte, sans rien faire',
      'Bons cadeaux à offrir : tes clients font découvrir ton commerce à leurs proches',
      'Assistant IA complet : rédaction avancée pour tes articles, tes deals et tes actus, avec un usage étendu',
      '0% de commission Yoppaa sur tes ventes',
    ],
  },
]

// ─── Composant principal ────────────────────────────────────────────────────
export default function LandingReveal({ referent = null }) {
  const [form, setForm] = useState({
    // RGPD : opt-in marketing RÉEL, jamais pré-coché. L'inscription (être
    // prévenu du lancement = la finalité demandée) n'en dépend pas.
    email: '', code_postal: '', type_utilisateur: 'yopper', commercant_nom: '', message: '', consentement_marketing: false,
  })
  const [statut, setStatut] = useState({ envoi: 'idle', message: null })
  const [kitSlug, setKitSlug] = useState(null)
  const [turnstileToken, setTurnstileToken] = useState(null)
  const [communeStats, setCommuneStats] = useState(null)
  const [globalStats, setGlobalStats] = useState(null)
  const turnstileRef = useRef(null)
  const attributionRef = useRef({ ref_commercant: null, utm_source: null, utm_medium: null, utm_campaign: null })

  // Totaux globaux de mobilisation
  useEffect(() => {
    let vivant = true
    fetch('/api/communes/stats')
      .then(r => r.json())
      .then(j => { if (vivant && j?.ok && j?.global) setGlobalStats(j) })
      .catch(() => {})
    return () => { vivant = false }
  }, [])

  // Attribution ?ref= + utm (une fois au montage)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    attributionRef.current = {
      ref_commercant: p.get('ref') || null,
      utm_source: p.get('utm_source') || null,
      utm_medium: p.get('utm_medium') || null,
      utm_campaign: p.get('utm_campaign') || null,
    }
  }, [])

  // Stats de la commune dès que le CP est complet (débounce)
  useEffect(() => {
    const cp = form.code_postal.trim()
    let vivant = true
    const t = setTimeout(() => {
      if (!/^\d{4}$/.test(cp)) { if (vivant) setCommuneStats(null); return }
      fetch(`/api/communes/stats?cp=${cp}`)
        .then(r => r.json())
        .then(j => { if (vivant) setCommuneStats(j?.ok ? (j.found ? j : { horsZone: true }) : null) })
        .catch(() => { if (vivant) setCommuneStats(null) })
    }, 400)
    return () => { vivant = false; clearTimeout(t) }
  }, [form.code_postal])

  // Turnstile invisible : callbacks globaux
  useEffect(() => {
    if (typeof window === 'undefined') return
    window.onTurnstileSuccess = (token) => setTurnstileToken(token)
    window.onTurnstileExpired = () => setTurnstileToken(null)
    window.onTurnstileError   = () => setTurnstileToken(null)
  }, [])

  async function soumettre(e) {
    e.preventDefault()
    if (statut.envoi === 'envoi') return
    setStatut({ envoi: 'envoi', message: null })
    try {
      const res = await fetch('/api/pre-inscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          code_postal: form.code_postal,
          type_utilisateur: form.type_utilisateur,
          commercant_nom: form.commercant_nom,
          message: form.message,
          consentement_marketing: form.consentement_marketing,
          turnstile_token: turnstileToken,
          ...attributionRef.current,
        }),
      })
      const j = await res.json()
      if (!j.ok) {
        setStatut({ envoi: 'ko', message: j.error || 'Une erreur est survenue, réessaie' })
        return
      }
      setStatut({ envoi: 'ok', message: `Bien reçu 🟣 Rendez-vous le ${libelleLancement()}. À très vite !` })
      if (j.slug_kit) setKitSlug(j.slug_kit)
      if (typeof window !== 'undefined' && window.turnstile && turnstileRef.current) {
        try { window.turnstile.reset(turnstileRef.current) } catch (_) {}
      }
    } catch (err) {
      setStatut({ envoi: 'ko', message: 'Erreur réseau, réessaie' })
    }
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  // Consentement OBLIGATOIRE (décision Alex 31/07 soir) : la case décrit la
  // finalité même du formulaire (être prévenu du lancement + actualités),
  // jamais pré-cochée, mais requise pour s'inscrire.
  const formValide = form.email.trim() && /^\d{4}$/.test(form.code_postal.trim())
    && (form.type_utilisateur !== 'commercant' || !!form.commercant_nom.trim())
    && form.consentement_marketing

  // Rendu Turnstile explicite au 1er focus (perf, cf. LandingTeasing)
  const tsRendered = useRef(false)
  const lancerChallenge = () => {
    if (tsRendered.current || typeof window === 'undefined' || !siteKey) return
    let tries = 0
    const rendre = () => {
      if (tsRendered.current) return
      if (window.turnstile && turnstileRef.current) {
        tsRendered.current = true
        try {
          window.turnstile.render(turnstileRef.current, {
            sitekey: siteKey, size: 'invisible',
            callback: (t) => window.onTurnstileSuccess?.(t),
            'expired-callback': () => window.onTurnstileExpired?.(),
            'error-callback': () => window.onTurnstileError?.(),
          })
        } catch (e) { /* ignore */ }
      } else if (tries++ < 25) {
        setTimeout(rendre, 150)
      }
    }
    rendre()
  }

  // 🔴 L'INSCRIPTION, PAS LA LISTE D'ATTENTE (Alex, 26/08 : « objectif
  // INSCRIPTION »). CINQ boutons de cette page portaient le mot commerçant, et
  // les cinq faisaient DÉFILER vers le formulaire d'email : le bouton du hero,
  // celui de la carte matériel, celui de chaque formule, l'encart de l'offre
  // et le pavé flottant « Je rejoins la tribu ». Aucun n'inscrivait.
  //
  // ⚠️ Deux d'entre eux sont des composants qui reçoivent une fonction : ils ne
  // peuvent pas être un `Link`, d'où ce petit navigateur. Les trois autres sont
  // devenus de vrais liens, qui s'ouvrent dans un nouvel onglet au clic milieu
  // et se copient au clic droit, comme tout lien doit pouvoir le faire.
  const allerAuSignup = () => {
    if (typeof window !== 'undefined') window.location.href = '/signup'
  }

  const allerAuForm = (typeUtilisateur) => {
    // ⚠️ LE FORMULAIRE EST CELUI DES HABITANTS, ET LUI SEUL. Un appelant qui
    // demanderait « commercant » le rendrait invalide sans rien afficher : le
    // champ du nom de commerce n'est plus obligatoire ni annoncé comme tel, et
    // le visiteur resterait bloqué sur un bouton d'envoi sans savoir pourquoi.
    // Le commerçant a son propre bouton, qui l'inscrit vraiment.
    if (typeUtilisateur === 'yopper') setForm(p => ({ ...p, type_utilisateur: 'yopper' }))
    if (typeof document !== 'undefined') {
      document.getElementById('preinscription')?.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const btnPrimaire = {
    display: 'inline-block', padding: '15px 32px', borderRadius: 100, border: 'none',
    background: 'linear-gradient(135deg, #C4A0F4, #9660E0)', color: T.ink,
    fontWeight: 900, fontSize: 14.5, letterSpacing: 0.4, textTransform: 'uppercase',
    cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 10px 30px rgba(150,96,224,0.45)',
  }

  return (
    // Pas d'overflowX hidden ici : avec overflow-y visible, il transformait ce
    // div en zone de scroll imbriquée (scroll qui « accroche » sur PC). Plus
    // rien ne déborde horizontalement depuis le retrait des décors absolute.
    <main style={{ background: T.bg, color: T.ink, fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer/>

      {/* Données structurées : sans elles Google n'a aucun moyen de relier le
          nom « Yoppaa » à une organisation, ce qui laisse les homonymes
          occuper la requête de marque. Rendu en JSON-LD dans le corps, ce que
          Google lit aussi bien que dans le head. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': 'https://www.yoppaa.app/#organization',
              name: 'Yoppaa',
              legalName: 'AVCOTECH SRL',
              url: 'https://www.yoppaa.app',
              logo: 'https://www.yoppaa.app/icon-192.png',
              slogan: 'Ton quartier dans ta poche',
              vatID: 'BE0731.637.148',
              address: {
                '@type': 'PostalAddress',
                streetAddress: 'Rue de Prée 9 G',
                postalCode: '5640',
                addressLocality: 'Mettet',
                addressCountry: 'BE',
              },
              areaServed: { '@type': 'AdministrativeArea', name: 'Wallonie, Belgique' },
            },
            {
              '@type': 'WebSite',
              '@id': 'https://www.yoppaa.app/#website',
              url: 'https://www.yoppaa.app',
              name: 'Yoppaa',
              inLanguage: 'fr-BE',
              publisher: { '@id': 'https://www.yoppaa.app/#organization' },
              description: "L'app belge qui réunit les commerces de quartier : commande à l'avance, rendez-vous en ligne, fidélité et bons cadeaux, sans commission Yoppaa pour les commerçants.",
            },
          ],
        }) }}
      />

      {/* ═══ 1. HERO REVEAL (fond sombre) ═══ */}
      <section style={{ background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 60%, ${T.panel} 100%)`, color: '#fff' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '56px 20px 64px', textAlign: 'center' }}>
          {referent && (
            <div style={{ display: 'inline-block', marginBottom: 24, padding: '10px 18px', borderRadius: 100, background: 'rgba(196,160,244,0.16)', border: '1px solid rgba(196,160,244,0.4)', fontSize: 13.5, fontWeight: 700, color: '#fff', lineHeight: 1.45 }}>
              <strong style={{ color: T.light }}>{referent}</strong> t&rsquo;invite à rejoindre Yoppaa 🟣
            </div>
          )}
          <div style={{ marginBottom: 36 }}>
            <YoppaaLogo size={58} mode="dark"/>
          </div>
          {/* ⚠️ LE HERO PARLE AUX COMMERÇANTS D'ABORD (décision Alex, 20/08).
              Les habitants, eux, arrivent par leur commerçant : c'est lui qu'il
              faut convaincre en trois secondes. Le titre garde la mélodie de la
              marque, « ton quartier dans ta poche », mais la retourne de son
              côté à lui. Le versant Yopper reste entier plus bas, section 3. */}
          <h1 style={{ fontSize: 'clamp(2.1rem, 6vw, 3.5rem)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.06, margin: '0 auto 18px', maxWidth: 760, color: '#fff' }}>
            Ton commerce,<br/>dans la poche de ton quartier.
          </h1>
          <p style={{ fontSize: 'clamp(1.02rem, 2.6vw, 1.2rem)', color: 'rgba(255,255,255,0.92)', lineHeight: 1.65, maxWidth: 620, margin: '0 auto 24px', fontWeight: 500 }}>
            Yoppaa est l&rsquo;app belge <DrapeauBelge/> qui met ton commerce dans le téléphone des
            habitants de ta commune. Commandes à emporter, rendez-vous en ligne, deals du jour,
            carte de fidélité : les outils des grandes enseignes.
            {/* ⚠️ « Yoppaa ne prend » ET PAS « aucune commission » tout court :
                sans sujet, la phrase se lit « aucun frais du tout », et c'est
                FAUX, les frais bancaires restent ceux de la banque. Le banc l'a
                attrapée ici même, sur ma propre réécriture du hero. */}
            {' '}Et <strong style={{ color: '#fff' }}>Yoppaa ne prend aucune commission sur tes ventes</strong>.
          </p>

          {/* L'offre, dès la première seconde et pas en petit gris tout en bas. */}
          {estRegimeLancement() && (
            <div style={{
              display: 'inline-flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
              padding: '12px 22px', borderRadius: 100, marginBottom: 26,
              background: 'rgba(196,160,244,0.16)', border: '1.5px solid rgba(196,160,244,0.45)',
            }}>
              {/* ⚠️ UN SEUL CHIFFRE, ET C'EST 100.
                  J'avais retiré le total mais laissé « + 42 jours d'avance » :
                  c'était toujours un second nombre, et Alex l'a vu à l'écran
                  avant moi. L'avance se dit en mots, jamais en chiffres. */}
              <span style={{ fontSize: 'clamp(1.15rem, 3.4vw, 1.5rem)', fontWeight: 900, letterSpacing: '-0.8px', color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                {joursOffertsAuLancement()} jours offerts
              </span>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: T.light }}>
                à partir du {libelleLancement()}, quel que soit le forfait
                {joursAvance() > 0 && ' · et tout le temps d’ici là est en bonus'}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 40 }}>
            {/* ⚠️ LE TROISIÈME CHEMIN, trouvé par la mutation du banc et pas
                par la relecture. Ce bouton d'en-tête FAISAIT DÉFILER vers le
                formulaire de préinscription : le commerçant qui cliquait dès
                l'arrivée, c'est-à-dire le plus décidé de tous, atterrissait
                dans le formulaire des habitants. Il mène maintenant là où il
                dit qu'il mène. */}
            <Link href="/signup" style={{ ...btnPrimaire, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>
              {LIBELLE_COMMERCANT}
            </Link>
            <button onClick={() => allerAuForm('yopper')}
              style={{ ...btnPrimaire, background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)', boxShadow: 'none' }}>
              {LIBELLE_HABITANT}
            </button>
          </div>

          {/* ⚠️ « OFFICIEL », et la phrase qui suit, parce que le compteur seul
              disait exactement le contraire de la vérité : il laissait croire
              qu'il ne se passe rien avant, alors qu'arriver tôt est justement
              tout l'intérêt. */}
          <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.6px' }}>
            Lancement officiel le {libelleLancement()}
          </p>
          <CompteurLancement/>
          <p style={{ margin: '18px auto 0', maxWidth: 520, fontSize: 14, fontWeight: 600, lineHeight: 1.6, color: 'rgba(255,255,255,0.82)' }}>
            Pas besoin de l&rsquo;attendre pour commencer : ta page part en ligne dès qu&rsquo;elle est
            validée, et tes premiers clients commandent avant tout le monde.
          </p>
          {/* ⚠️ ALEX, 26/08 : « rends-les plus visibles, je recrute pour les
              réseaux ». Une ligne soulignée en petit sous un compte à rebours
              ne se voit pas : elle avait le poids d'une note de bas de page
              alors qu'elle porte un objectif.

              ⚠️ ET LA LISTE VIENT DE `lib/reseaux`, jamais nommée ici. C'est ce
              qui a fait qu'Instagram est apparu partout d'un coup, et c'est ce
              qui fera apparaître le suivant sans toucher à cette ligne. */}
          <div style={{ marginTop: 24, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {RESEAUX.map(r => (
              <a key={r.nom} href={r.url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 20px', borderRadius: 100, background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(196,160,244,0.5)', color: '#fff', fontWeight: 800, fontSize: 13.5, textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}>
                Suis-nous sur {r.nom}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 2. MANIFESTO (clair, court) ═══ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '64px 20px 8px', textAlign: 'center' }}>
        <SectionEyebrow>Pourquoi Yoppaa</SectionEyebrow>
        {/* Le titre affirme d'abord ce que personne d'autre ne peut dire (tous
            les secteurs réunis) : le « 0% de commission » est devenu un ticket
            d'entrée dans le secteur, il rassure mais ne positionne plus.
            Les trois métiers cités annoncent exactement les trois familles de
            la grille ci-dessous (alimentaire, services, détail). */}
        <h2 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.3rem)', fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1.15, margin: '0 0 16px', color: T.ink }}>
          Tous les commerces de ta commune, dans une seule app.<br/>
          <span style={{ color: T.main }}>Nous, on a choisi le camp du quartier.<br/>Celui du boulanger, de la coiffeuse et de la boutique de vêtements qui te connaissent par ton prénom.</span>
        </h2>
        <p style={{ fontSize: '1.02rem', color: T.muted, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 28px', fontWeight: 500 }}>
          Pas une app par commerce, pas une app par secteur : une seule, pour tout ton quartier.
          Tu commandes, tu réserves et tu cumules tes points en quelques secondes. Tes commerçants,
          eux, ne reversent aucune commission à Yoppaa sur ce que tu leur achètes, et ta commune
          reste vivante.
        </p>
        {/* Les familles de commerçants (taxonomie produit : alimentaire /
            services / détail, plus tous ceux qui n'entrent dans aucune case).
            La grille déborde volontairement de la colonne de texte (760px) pour
            tenir les 4 cartes sur une seule ligne : `marginLeft: 50%` +
            `translateX(-50%)` recentre un enfant plus large que son parent. */}
        <style>{`
          .familles-grid { display: grid; gap: 14px; grid-template-columns: 1fr; text-align: left; }
          @media (min-width: 560px) { .familles-grid { grid-template-columns: repeat(2, 1fr); } }
          @media (min-width: 920px) { .familles-grid { grid-template-columns: repeat(4, 1fr); } }
        `}</style>
        <div className="familles-grid" style={{ width: 'min(1040px, calc(100vw - 40px))', marginLeft: '50%', transform: 'translateX(-50%)' }}>
          {[
            { titre: 'Alimentaire', exemples: 'Boulangeries, boucheries, snacks, friteries, sandwicheries, restaurants, food trucks et plein d’autres.' },
            { titre: 'Services', exemples: 'Coiffeurs, barbiers, instituts de beauté, bien-être, garages et tous les métiers sur rendez-vous.' },
            { titre: 'Détail', exemples: 'Boutiques de mode, fleuristes, librairies, décoration et tout le commerce de proximité.' },
            { titre: 'Et tous les autres', exemples: 'Un distributeur automatique à la ferme, un apiculteur, un maraîcher, un artisan qui n’ouvre que le samedi. Savoir ce qui est disponible aujourd’hui, annoncer une nouveauté : ça compte tout autant.' },
          ].map(s => (
            <div key={s.titre} style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: `1px solid ${T.pale}`, boxShadow: '0 4px 14px rgba(22,6,54,0.05)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 900, color: T.main, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{s.titre}</p>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: T.deep, lineHeight: 1.55 }}>{s.exemples}</p>
            </div>
          ))}
        </div>
        {/* Le corollaire du zéro prélèvement Yoppaa : un modèle qui ne vit pas
            des ventes n'a aucune raison d'exclure les tout petits, contrairement
            aux places de marché qui doivent rentabiliser chaque vendeur. */}
        <p style={{ fontSize: '0.98rem', color: T.deep, lineHeight: 1.7, maxWidth: 640, margin: '22px auto 0', fontWeight: 600 }}>
          Personne n&rsquo;est trop petit pour Yoppaa. La formule Exister est gratuite, pour toujours :
          que tu sois seul ou toute une équipe, ouvert tous les jours ou juste le samedi, tu as ta
          place ici. 🟣
        </p>
      </section>

      {/* ═══ 3. CÔTÉ YOPPERS : mockups ═══ */}
      {/* Section volontairement plus large que les autres : quatre téléphones
          côte à côte sur grand écran, sinon le 4e retombe seul à la ligne. */}
      <section style={{ maxWidth: 1220, margin: '0 auto', padding: '56px 20px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <SectionEyebrow>Pour toi, Yopper</SectionEyebrow>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900, letterSpacing: '-1px', margin: '0 0 12px', color: T.ink }}>
            Tes commerces préférés, à portée de main.
          </h2>
          <p style={{ fontSize: '1rem', color: T.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.65, fontWeight: 500 }}>
            Fini la file du samedi matin et le répondeur du coiffeur. Tu commandes à l&rsquo;avance,
            tu réserves quand ça t&rsquo;arrange, tes cartes de fidélité se remplissent toutes seules
            au lieu de traîner au fond du portefeuille, et chaque matin l&rsquo;app te souffle les bons
            plans du jour près de chez toi.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'clamp(16px, 2.6vw, 28px)', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start', color: T.deep, maxWidth: 1180, margin: '0 auto' }}>
          <PhoneFrame label="Commande à l'avance et passe la prendre sans faire la file">
            <MockFiche/>
          </PhoneFrame>
          <PhoneFrame label="Chaque matin à 7h30, les bons plans de ta commune arrivent tout seuls">
            <MockMorning/>
          </PhoneFrame>
          <PhoneFrame label="Prends rendez-vous chez ton coiffeur ou ton barbier, même à minuit">
            <MockRdv/>
          </PhoneFrame>
          <PhoneFrame label="Ta carte de fidélité se remplit toute seule, sans carton à perdre">
            <MockFidelite/>
          </PhoneFrame>
        </div>
        {/* Bénéfices en pastilles */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 40 }}>
          {[
            'Click & Collect', 'Rendez-vous en ligne', 'Good Morning Yoppers', 'Deals du jour',
            'Cartes de fidélité', 'Bons cadeaux', 'Livraison locale', 'Suivi de commande',
            'Boutiques de détail',
          ].map(b => (
            <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 100, background: '#fff', border: `1.5px solid ${T.pale}`, fontSize: 13, fontWeight: 800, color: T.deep, boxShadow: '0 2px 10px rgba(22,6,54,0.05)' }}>
              <IconCheck size={12}/> {b}
            </span>
          ))}
        </div>
      </section>

      {/* ═══ 4. CÔTÉ COMMERÇANTS (sombre, punch) ═══ */}
      {/* Voir le composant LaTotale, juste sous l'accroche. */}
      <section style={{ background: `linear-gradient(135deg, ${T.panel} 0%, ${T.ink} 100%)`, color: '#fff', marginTop: 48 }}>
        <Bande3px/>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 20px 72px' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <SectionEyebrow dark>Pour les commerçants</SectionEyebrow>
            <h2 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.3rem)', fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1.12, margin: '0 0 14px', color: '#fff' }}>
              Les outils des grandes enseignes.<br/>Sans toucher à tes marges.
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.88)', maxWidth: 620, margin: '0 auto', lineHeight: 1.65, fontWeight: 500 }}>
              La première place de marché du commerce local qui va de la visibilité au marketing,
              et du marketing à la vente. Une page professionnelle, des commandes, des rendez-vous,
              une carte de fidélité, des bons cadeaux, des promotions qui arrivent directement sur le
              téléphone de tes clients, et même un assistant IA pour rédiger tes textes.
              Tout est pensé pour te faire gagner du temps, et Yoppaa ne prélève jamais rien sur tes ventes.
            </p>
          </div>

          <LaTotale />

          {/* Chiffres punch */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, maxWidth: 760, margin: '0 auto 48px' }}>
            {[
              { chiffre: '0%', label: 'de commission Yoppaa sur tes ventes' },
              estRegimeLancement()
                ? { chiffre: `${joursOffertsAuLancement()} jours`, label: `offerts à partir du ${libelleLancement()}, sans carte de paiement` }
                : { chiffre: `${ESSAI_JOURS_MINIMUM} jours`, label: "d'essai gratuit, sans carte de paiement" },
              { chiffre: '10 min', label: 'pour mettre ta page en ligne' },
              { chiffre: '0€', label: 'la formule Exister, pour toujours' },
            ].map(s => (
              <div key={s.label} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 18, padding: '20px 14px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 'clamp(1.6rem, 4vw, 2.1rem)', fontWeight: 900, letterSpacing: '-1px', color: T.light }}>{s.chiffre}</p>
                <p style={{ margin: '6px 0 0', fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.85)', lineHeight: 1.4 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Dashboard mockup + arguments */}
          <div style={{ display: 'flex', gap: 'clamp(24px, 5vw, 56px)', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
            <PhoneFrame label="Ton espace commerçant : simple, rapide, pensé pour le comptoir">
              <MockDashboard/>
            </PhoneFrame>
            <div style={{ flex: '1 1 340px', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { titre: 'Ton quartier te parle', texte: 'Les habitants te disent ce qu’ils attendent de toi : du Click & Collect, de la livraison, des bonnes affaires, un produit que tu ne proposes pas encore. Et ton tableau de bord traduit tout ça en chiffres : ce qui part, à quelle heure, ce qui revient le plus souvent dans les demandes.' },
                { titre: 'Tes clients, ta relation', texte: 'Le client qui commande chez toi reste ton client, pas celui d’une plateforme qui te le reloue. Tu vois ce qu’il te faut pour préparer sa commande et l’accueillir, et tu parles aux habitants par des notifications ciblées que Yoppaa envoie pour toi, sans jamais avoir à manipuler de fichier de contacts. Leurs coordonnées restent protégées et ne sont revendues à personne. Nos tarifs, nos frais et nos règles sont écrits noir sur blanc : la transparence est partout.' },
                { titre: 'Des notifications qui touchent leur cible', texte: 'Ton deal du matin part en notification push vers les habitants de ta commune, pas dans le vide. Le bon message, aux bonnes personnes, au bon moment.' },
                { titre: 'Ils reviennent, sans que tu y penses', texte: 'La carte de fidélité se remplit toute seule, au comptoir comme en ligne, et le client reçoit un SMS quand sa récompense tombe. Tes bons cadeaux se vendent en ligne et se dépensent chez toi.' },
                { titre: 'Une gestion sans prise de tête', texte: 'Stock du jour, commandes, rendez-vous, tout se pilote en quelques clics depuis ton téléphone. Et quand une commande est prête, le client est prévenu automatiquement.' },
              ].map(a => (
                <div key={a.titre} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 18, padding: '16px 18px', textAlign: 'left' }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 900, fontSize: 15.5, color: '#fff', letterSpacing: '-0.3px' }}>{a.titre}</p>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.88)', lineHeight: 1.6, fontWeight: 500 }}>{a.texte}</p>
                </div>
              ))}
              {/* ⚠️ « Préinscrire », c'était le mot du problème : ce bouton
                  descendait vers un formulaire d'email. L'objectif est
                  l'INSCRIPTION, pas la liste d'attente. */}
              <Link href="/signup" style={{ ...btnPrimaire, marginTop: 6, width: '100%', display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                J&rsquo;inscris mon commerce
              </Link>
            </div>
          </div>

          {/* L'inscription, montrée telle qu'elle est : cinq étapes guidées et
              un score de complétude, pour désamorcer la peur du dossier. */}
          <div style={{ display: 'flex', gap: 'clamp(24px, 5vw, 56px)', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', marginTop: 52 }}>
            <div style={{ flex: '1 1 320px', maxWidth: 440, textAlign: 'left' }}>
              <SectionEyebrow dark>Ton inscription</SectionEyebrow>
              <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.6rem)', fontWeight: 900, letterSpacing: '-0.8px', lineHeight: 1.15, margin: '0 0 12px', color: '#fff' }}>
                Cinq étapes, et ta page part en ligne.
              </h3>
              <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.88)', lineHeight: 1.65, fontWeight: 500, margin: 0 }}>
                Ton compte, tes infos, tes visuels, tes horaires, et c&rsquo;est envoyé. Un score de
                complétude te dit en direct où tu en es, donc tu ne devines jamais ce qu&rsquo;il te
                manque. Nous validons ton dossier, puis ta page est publiée et ton kit de bienvenue
                arrive dans ta boîte mail.
              </p>
            </div>
            <PhoneFrame label="Un score de complétude en direct : tu sais toujours ce qu'il te reste à faire">
              <MockOnboarding/>
            </PhoneFrame>
          </div>

          {/* Trio « rassurance » : les 3 objections qu'on entend au comptoir
              (matériel à acheter, peur de l'installation, personne au bout du fil) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, maxWidth: 900, margin: '48px auto 0' }}>
            {[
              {
                icone: <IconDevices/>,
                titre: 'Aucun matériel à acheter',
                texte: 'Yoppaa tourne sur ce que tu as déjà : ton téléphone, ta tablette ou ton ordinateur. Pas de caisse imposée, pas de terminal à louer. Et si tu veux un écran dédié au comptoir, on peut t’équiper à prix raisonnable, jamais en obligation.',
              },
              {
                icone: <IconLifebuoy/>,
                titre: 'En ligne en dix minutes',
                texte: 'L’inscription se fait seul, tranquillement, en quelques étapes guidées. Tu préfères qu’on passe ? L’accompagnement sur place se choisit au moment de ton inscription, ou plus tard depuis ton tableau de bord : on vient chez toi installer ton catalogue et te former.',
              },
              {
                icone: <IconHeadset/>,
                titre: 'Un humain au bout du fil',
                texte: 'Par email, en visio ou au téléphone, une vraie personne te répond et connaît ton dossier. Pas de robot, pas de ticket qui traîne trois jours.',
              },
            ].map(r => (
              <div key={r.titre} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 18, padding: '20px 18px', textAlign: 'left' }}>
                <div style={{ marginBottom: 10 }}>{r.icone}</div>
                <p style={{ margin: '0 0 6px', fontWeight: 900, fontSize: 15.5, color: '#fff', letterSpacing: '-0.3px' }}>{r.titre}</p>
                <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.88)', lineHeight: 1.6, fontWeight: 500 }}>{r.texte}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 5. LES FORMULES (clair, détaillé, transparence) ═══ */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 20px 8px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <SectionEyebrow>Les formules</SectionEyebrow>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900, letterSpacing: '-1px', margin: '0 0 12px', color: T.ink }}>
            Simples, transparentes, sans engagement.
          </h2>
          <p style={{ fontSize: '1rem', color: T.muted, maxWidth: 600, margin: '0 auto', lineHeight: 1.65, fontWeight: 500 }}>
            Chez Yoppaa, pas d&rsquo;abonnement contraignant ni de frais cachés : tu viens parce que
            c&rsquo;est sympa, tu restes parce que c&rsquo;est utile. Chaque formule est mensuelle,
            sans engagement, et résiliable en deux clics.
          </p>
        </div>
        {/* L'offre de lancement, en grand, AVANT les cartes : c'est elle qui
            fait lire la grille tarifaire, pas l'inverse. */}
        <EncartOffreLancement onRejoindre={allerAuSignup}/>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 18, alignItems: 'stretch' }}>
          {FORMULES.map(f => (
            <div key={f.nom} style={{
              background: '#fff', borderRadius: 22, overflow: 'hidden', display: 'flex', flexDirection: 'column',
              /* Vendre = la vedette : bordure violette, ombre plus marquée */
              border: f.vedette ? `2px solid ${T.main}` : `1px solid ${T.pale}`,
              boxShadow: f.vedette ? `0 10px 26px ${T.main}2E` : '0 6px 18px rgba(22,6,54,0.08)',
            }}>
              <Bande3px/>
              <div style={{ padding: '22px 22px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{
                  alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 900, padding: '4px 12px', borderRadius: 100,
                  textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12,
                  color: f.vedette ? '#fff' : T.deep,
                  background: f.vedette ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : T.pale,
                }}>
                  {f.badge}
                </span>
                <p style={{ margin: 0, fontWeight: 900, fontSize: 22, color: T.ink, letterSpacing: '-0.5px' }}>{f.nom}</p>
                <p style={{ margin: '6px 0 2px', fontWeight: 900, fontSize: 30, color: T.main, letterSpacing: '-1px' }}>
                  {f.prix}
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.muted, letterSpacing: 0, marginLeft: 6 }}>{f.sousPrix}</span>
                </p>
                <p style={{ margin: '10px 0 16px', fontSize: 14, fontWeight: 700, color: T.deep, lineHeight: 1.5 }}>{f.accroche}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 20 }}>
                  {f.points.map(pt => (
                    <div key={pt} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ marginTop: 2, flexShrink: 0 }}><IconCheck size={13}/></span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: pt.startsWith('Tout ') ? T.main : T.ink, lineHeight: 1.5 }}>{pt}</span>
                    </div>
                  ))}
                </div>
                {/* ⚠️ « Je me préinscris » sur une carte de FORMULE était le
                    plus trompeur des cinq : le commerçant vient de choisir son
                    prix, il clique, et il atterrit dans un formulaire d'email
                    qui ne retient même pas la formule qu'il a choisie. */}
                <Link href="/signup"
                  style={{
                    marginTop: 'auto', width: '100%', padding: '13px', borderRadius: 100,
                    fontWeight: 900, fontSize: 13.5, letterSpacing: 0.4, textTransform: 'uppercase',
                    cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                    display: 'block', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box',
                    /* CTA plein pour la vedette, contour pour les accroches */
                    border: f.vedette ? 'none' : `1.5px solid ${T.main}`,
                    background: f.vedette ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff',
                    color: f.vedette ? '#fff' : T.main,
                    boxShadow: f.vedette ? `0 6px 20px ${T.main}55` : 'none',
                  }}>
                  Je m&rsquo;inscris
                </Link>
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: '22px auto 0', fontSize: 13, fontWeight: 700, color: T.muted, textAlign: 'center', maxWidth: 560, lineHeight: 1.6 }}>
          {/* L'offre est dite en grand juste au-dessus : ici on ne répète pas,
              on répond à la question suivante, « et après, ça se passe
              comment ». Voir feedback_information_complete. */}
          {!estRegimeLancement() && <>{ESSAI_JOURS_MINIMUM} jours d&rsquo;essai gratuit sur les formules payantes, sans carte de paiement. </>}
          Ensuite, paiement mensuel par Bancontact ou carte, aucune augmentation en cours d&rsquo;année,
          et tu restes libre de partir quand tu veux.
        </p>
        {/* ⚠️ ICI AUSSI, ET PAS SEULEMENT EN BAS DE PAGE. C'est le moment où le
            commerçant vient de lire les prix : c'est là qu'il décide. L'envoyer
            chercher un bouton six sections plus bas, c'est le perdre. */}
        <div style={{ textAlign: 'center', marginTop: 26 }}>
          <Link href="/signup"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, fontSize: 15, textDecoration: 'none', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 8px 20px rgba(107,53,196,0.28)' }}>
            J&rsquo;inscris mon commerce
          </Link>
          <p style={{ margin: '10px 0 0', fontSize: 12.5, color: T.muted, fontWeight: 600 }}>
            Ta page peut être en ligne cette semaine. Sans carte de paiement.
          </p>
        </div>
      </section>

      {/* ═══ 6. LA ZONE : commune par commune ═══ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '64px 20px 8px', textAlign: 'center' }}>
        {/* ⚠️ Réécrit le 20/08 : il n'y a PLUS de seuil de déblocage et plus
            d'activation commune par commune. Toute la Wallonie est ouverte.
            L'ancien discours demandait au commerçant d'attendre ses voisins
            pour exister, ce qui est devenu faux, et décourageant pour rien. */}
        <SectionEyebrow>Où ça se passe</SectionEyebrow>
        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900, letterSpacing: '-1px', margin: '0 0 14px', color: T.ink }}>
          Toute la Wallonie, dès aujourd&rsquo;hui.
        </h2>
        <p style={{ fontSize: '1rem', color: T.muted, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 18px', fontWeight: 500 }}>
          Pas de liste d&rsquo;attente, pas de seuil à atteindre, pas de commune à débloquer :
          où que soit ton commerce en Wallonie, tu peux ouvrir ta page maintenant et prendre
          tes premières commandes.
        </p>
        <p style={{ fontSize: '0.95rem', fontWeight: 800, color: T.main, margin: 0 }}>
          Et plus vous êtes nombreux dans une commune, plus ses habitants ont de raisons
          d&rsquo;ouvrir l&rsquo;app chaque matin.
        </p>
      </section>

      {/* ═══ 7. L'HISTOIRE ═══ */}
      <section style={{ maxWidth: 680, margin: '0 auto', padding: '56px 20px 8px' }}>
        <div style={{ background: '#fff', borderRadius: 22, overflow: 'hidden', border: `1px solid ${T.pale}`, boxShadow: '0 6px 18px rgba(22,6,54,0.08)' }}>
          <Bande3px/>
          <div style={{ padding: 'clamp(22px, 5vw, 34px)' }}>
            <SectionEyebrow>Un projet belge indépendant</SectionEyebrow>
            <p style={{ margin: '0 0 12px', fontSize: '1.02rem', color: T.ink, lineHeight: 1.7, fontWeight: 600 }}>
              Yoppaa n&rsquo;appartient à aucun grand groupe. C&rsquo;est un projet wallon <DrapeauBelge/>,
              construit sans levée de fonds, avec une conviction simple : le digital doit servir les
              commerces de quartier, pas se servir sur leur dos.
            </p>
            <p style={{ margin: 0, fontSize: '0.95rem', color: T.muted, lineHeight: 1.7, fontWeight: 500 }}>
              Ici, pas de commission Yoppaa sur les ventes, pas de revente de données, pas d&rsquo;algorithme qui
              cache tes commerçants derrière des annonces sponsorisées. Une app, ton quartier, et c&rsquo;est tout. 🟣
            </p>
          </div>
        </div>
      </section>

      {/* ═══ 8. PRÉINSCRIPTION (sombre) ═══ */}
      <section id="preinscription" style={{ background: `linear-gradient(135deg, ${T.ink} 0%, ${T.deep} 60%, ${T.panel} 100%)`, color: '#fff', marginTop: 64 }}>
        <Bande3px/>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '60px 20px 64px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.2rem)', fontWeight: 900, letterSpacing: '-1.2px', margin: '0 0 10px', color: '#fff' }}>
            {/* ⚠️ « Rendez-vous le 1er octobre » disait exactement le contraire
                du reste de la page : c'était une invitation à attendre. */}
            {estRegimeLancement()
              ? <>N&rsquo;attends pas le {libelleLancement()}.</>
              : <>Rejoins ton quartier.</>}
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.9)', margin: '0 0 32px', lineHeight: 1.65, fontWeight: 500, maxWidth: 460 }}>
            {/* ⚠️ Plus d'« activation de commune » : la Wallonie est ouverte,
                et faire dépendre l'inscription d'un seuil serait faux. */}
            Deux publics, deux gestes différents. Prends celui qui te ressemble.
          </p>

          {/* 🔴 LE COMMERÇANT N'AVAIT AUCUN MOYEN DE S'INSCRIRE (Alex, 26/08).
              Toute cette page lui parle : les mockups de son tableau de bord,
              les formules, la réponse à ses trois objections, et jusqu'au texte
              juste au-dessus qui lui promet ses jours offerts. Puis il arrivait
              ici, et le seul geste disponible était de laisser son email dans
              une liste d'attente destinée aux HABITANTS.

              Aucun lien vers /signup n'existait nulle part sur la landing. Ce
              n'était pas les publications qui manquaient de force : elles
              menaient à un cul-de-sac. */}
          {/* ⚠️ UN BLOC PAR PUBLIC, ET UN SEUL GESTE DANS CHACUN (Alex, 26/08).
              Le bouton du commerçant et le formulaire des habitants se
              suivaient dans la même colonne, et le formulaire proposait EN PLUS
              un choix « Je suis commerçant » : deux chemins pour le même
              visiteur, dont un qui ne l'inscrivait pas. « Le commerçant ne sait
              pas où il doit s'inscrire », et il avait raison de ne pas savoir.

              Le formulaire est désormais celui des HABITANTS, sans sélecteur :
              un champ qui demande qui tu es, juste après un bouton qui te l'a
              demandé, est une question de trop. */}
          <div style={{ width: '100%', maxWidth: 460, background: 'rgba(196,160,244,0.12)', border: '1.5px solid rgba(196,160,244,0.45)', borderRadius: 18, padding: '22px 20px', marginBottom: 18 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.9px' }}>
              {LIBELLE_COMMERCANT}
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 14.5, color: '#fff', fontWeight: 600, lineHeight: 1.6 }}>
              Ta commune est déjà ouverte et ta page peut être en ligne cette semaine.
            </p>
            <Link href="/signup"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '15px 30px', borderRadius: 100, background: 'linear-gradient(135deg, #C4A0F4, #9660E0)', color: '#1A0840', fontWeight: 900, fontSize: 15.5, letterSpacing: 0.2, textDecoration: 'none', fontFamily: '"DM Sans", sans-serif', marginBottom: 10, boxShadow: '0 8px 22px rgba(150,96,224,0.35)' }}>
              J&rsquo;inscris mon commerce
            </Link>
          {/* ⚠️ LE COMPTE VIENT DE `lib/lancement.js`, JAMAIS ÉCRIT EN DUR :
              « 100 » est calculé depuis les deux dates, et un 100 tapé à la
              main deviendrait un mensonge daté.
              ⚠️ ET UN SEUL CHIFFRE SUR LA PAGE, décision d'Alex du 20/08. Un
              second nombre, même exact, « peut être interprété comme
              mensonger » : une offre qu'on soupçonne ne convainc personne.
              L'avance se dit donc EN MOTS, comme dans le hero. Le banc l'avait
              gardé, et il m'a arrêté ici. */}
            {estRegimeLancement() && (
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.light, lineHeight: 1.55 }}>
                {joursOffertsAuLancement()} jours offerts à partir du {libelleLancement()},
                et tout le temps d&rsquo;ici là est en bonus. Sans carte de paiement.
              </p>
            )}
          </div>

          {/* Le second public, et son seul geste à lui : laisser son email. */}
          <div style={{ width: '100%', maxWidth: 460, textAlign: 'left', marginBottom: 10 }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.9px' }}>
              {LIBELLE_HABITANT}
            </p>
            {/* ⚠️ ALEX, 26/08 : « simplifier la communication côté Yopper.
                Inscris-toi et on te tient au courant quand les premiers
                commerçants sont en ligne et pour télécharger l'app. Simple et
                clair. »

                L'ancienne phrase promettait d'être « parmi les premiers à
                télécharger », ce qui ne dit ni quand, ni pourquoi s'inscrire
                maintenant. Les deux nouvelles raisons sont concrètes et
                datées par des évènements réels : les commerces qui ouvrent, et
                l'app qui sort. */}
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: 500, lineHeight: 1.6 }}>
              Inscris-toi : on te prévient quand les premiers commerces de ton quartier
              sont en ligne, et le jour où l&rsquo;app est téléchargeable.
            </p>
          </div>

          {statut.envoi === 'ok' ? (
            <div style={{ maxWidth: 460, width: '100%' }}>
              <div style={{ background: 'rgba(16,185,129,0.15)', border: '1.5px solid #10B98166', borderRadius: 18, padding: '24px 22px' }}>
                <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#A7F3D0' }}>
                  ✓ {statut.message}
                </p>
              </div>
              {kitSlug && (
                <div style={{ marginTop: 16, padding: '18px 16px', borderRadius: 16, background: 'rgba(150,96,224,0.16)', border: '1px solid rgba(196,160,244,0.4)', textAlign: 'center' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: '#fff' }}>Ton kit de partage est prêt 🟣</p>
                  <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.9)', lineHeight: 1.5 }}>
                    Un lien perso et un QR code à partager. Chaque inscription via ton lien t&rsquo;est attribuée.
                  </p>
                  <Link href={`/kit/${kitSlug}`} style={{ display: 'inline-block', padding: '12px 26px', borderRadius: 100, background: 'linear-gradient(135deg, #C4A0F4, #9660E0)', color: '#1A0840', fontWeight: 900, fontSize: 13.5, letterSpacing: 0.3, textDecoration: 'none', fontFamily: '"DM Sans", sans-serif' }}>
                    Ouvrir mon kit de partage
                  </Link>
                </div>
              )}
              <div style={{ marginTop: 16, textAlign: 'left' }}>
                <IncitantMobilisation communeStats={communeStats} globalStats={globalStats}/>
              </div>
              <PartageMobilisation/>
            </div>
          ) : (
            <form onSubmit={soumettre} style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 18, padding: '24px 22px', maxWidth: 460, width: '100%', textAlign: 'left' }}>
              <input type="email" required placeholder="Ton email" onFocus={lancerChallenge}
                value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                style={inputStyle}/>
              <input type="text" required inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="Ton code postal (4 chiffres)" onFocus={lancerChallenge}
                value={form.code_postal} onChange={e => setForm(p => ({ ...p, code_postal: e.target.value.replace(/\D/g, '').slice(0,4) }))}
                style={inputStyle}/>

              <IncitantMobilisation communeStats={communeStats} globalStats={globalStats}/>

              {/* ⚠️ LE SÉLECTEUR « habitant / commerçant » A ÉTÉ RETIRÉ le 26/08.
                  Il ouvrait un SECOND chemin au commerçant, celui qui ne
                  l'inscrit pas : il cochait « Je suis commerçant », laissait
                  son email, et repartait sans compte en croyant s'être
                  inscrit. Le bouton juste au-dessus est son chemin, celui-ci
                  est celui des habitants. Redemander qui tu es, juste après un
                  bouton qui te l'a demandé, est une question de trop. */}

              <input type="text"
                maxLength={160}
                placeholder="Un commerce que tu aimerais voir ? (optionnel)"
                value={form.commercant_nom}
                onChange={e => setForm(p => ({ ...p, commercant_nom: e.target.value }))}
                style={inputStyle}/>

              <textarea placeholder="Un message ? (optionnel)" rows={2}
                value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value.slice(0, 500) }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}/>

              {/* Consentement RGPD : case visible, jamais pré-cochée, OBLIGATOIRE
                  (elle décrit la finalité même de l'inscription) */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.consentement_marketing}
                  onChange={e => setForm(p => ({ ...p, consentement_marketing: e.target.checked }))}
                  style={{ marginTop: 2, width: 15, height: 15, accentColor: '#9660E0', flexShrink: 0, cursor: 'pointer' }}/>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, fontWeight: 600 }}>
                  J&rsquo;accepte d&rsquo;être prévenu du lancement et de recevoir les actualités de Yoppaa. <span style={{ color: '#C4A0F4' }}>*</span>
                </span>
              </label>

              {siteKey && <div ref={turnstileRef} />}

              <button type="submit" disabled={statut.envoi === 'envoi' || !formValide}
                style={{ width: '100%', padding: '14px', borderRadius: 100, border: 'none', background: !formValide || statut.envoi === 'envoi' ? 'rgba(255,255,255,0.12)' : 'linear-gradient(135deg, #C4A0F4, #9660E0)', color: !formValide || statut.envoi === 'envoi' ? 'rgba(255,255,255,0.5)' : '#1A0840', fontWeight: 900, fontSize: 14, letterSpacing: 0.5, textTransform: 'uppercase', cursor: !formValide || statut.envoi === 'envoi' ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s', marginTop: 4 }}>
                {statut.envoi === 'envoi' ? 'Envoi…' : 'Me prévenir du lancement'}
              </button>

              {statut.envoi === 'ko' && statut.message && (
                <p style={{ margin: '12px 0 0', fontSize: 12, color: '#FCA5A5', fontWeight: 700, textAlign: 'center' }}>
                  ⚠ {statut.message}
                </p>
              )}

              <p style={{ margin: '14px 0 0', fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 1.5 }}>
                <Lock size={11} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Aucun spam.{' '}
                <Link href="/legal" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.35)' }}>Données protégées</Link>.
              </p>
            </form>
          )}

          {/* Footer */}
          <footer style={{ marginTop: 52, fontSize: 11, color: 'rgba(255,255,255,0.62)', lineHeight: 1.7 }}>
            <div style={{ marginBottom: 14 }}>
              <YoppaaLogo size={26} mode="dark"/>
            </div>
            <p style={{ margin: 0, fontWeight: 700, color: 'rgba(255,255,255,0.78)' }}>Un projet belge indépendant 🟣</p>
            <p style={{ margin: '6px 0 0' }}>
              <a href="mailto:hello@yoppaa.app" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.25)' }}>hello@yoppaa.app</a>
              {' · '}
              {/* ⚠️ La liste vient de lib/reseaux : ajouter Instagram ou LinkedIn
                  là-bas les fera apparaître ici ET dans le balisage Google. */}
              {RESEAUX.map(r => (
                <span key={r.nom}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.25)' }}>{r.nom}</a>
                  {' · '}
                </span>
              ))}
              <Link href="/legal" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.25)' }}>Mentions légales</Link>
            </p>
          </footer>
        </div>
      </section>

      {/* ⚠️ `masquer` quand le formulaire est déjà envoyé : proposer de
          rejoindre la tribu à quelqu'un qui vient de le faire, c'est lui dire
          qu'on ne l'a pas vu. */}
      <FenetreTribu
        masquer={statut.envoi === 'ok'}
        onRejoindre={allerAuSignup}
      />

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </main>
  )
}
