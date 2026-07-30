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

const LAUNCH_DATE = new Date(
  process.env.NEXT_PUBLIC_LAUNCH_DATE
  || '2026-09-01T10:00:00+02:00'
)

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
      style={{ display: 'inline-block', verticalAlign: '-0.15em', marginLeft: 4, borderRadius: 2, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
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

// Cadre téléphone : écran de l'app reproduit en CSS, HAUTEUR FIXE commune
// (les 4 mockups font exactement la même taille, demande Alex 30/07)
const ECRAN_H = 460
function PhoneFrame({ children, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      {/* Ombre volontairement modérée : les gros blurs (60px) coûtent cher à
          re-rastériser après une pause de scroll (jank PC constaté) */}
      <div style={{ width: 264, borderRadius: 32, background: '#0B0318', padding: 9, boxShadow: '0 10px 24px rgba(22,6,54,0.35)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ borderRadius: 24, overflow: 'hidden', background: T.bg, position: 'relative', height: ECRAN_H }}>
          {/* Encoche */}
          <div style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', width: 74, height: 16, borderRadius: 100, background: '#0B0318', zIndex: 5 }}/>
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
        <p style={{ margin: '10px 0 6px', fontSize: 7.5, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Jeudi 3 septembre</p>
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
function MockDashboard() {
  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', background: T.bg, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, padding: '26px 12px 12px', flexShrink: 0 }}>
        <p style={{ margin: 0, fontSize: 7.5, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1px' }}>Espace commerçant</p>
        <p style={{ margin: '3px 0 0', fontWeight: 900, fontSize: 13, color: '#fff', letterSpacing: '-0.3px' }}>Aujourd&rsquo;hui</p>
      </div>
      {/* Stats du jour */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 10px 0', flexShrink: 0 }}>
        {[
          { val: '12', label: 'commandes' },
          { val: '8', label: 'RDV' },
          { val: '184,60€', label: 'du jour' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, background: '#fff', borderRadius: 10, padding: '7px 6px', border: `1px solid ${T.pale}`, textAlign: 'center' }}>
            <p style={{ margin: 0, fontWeight: 900, fontSize: 11, color: T.main }}>{s.val}</p>
            <p style={{ margin: '1px 0 0', fontSize: 6.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{s.label}</p>
          </div>
        ))}
      </div>
      {/* Commande à préparer */}
      <div style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 11, border: `1px solid ${T.pale}`, overflow: 'hidden', flexShrink: 0 }}>
        <Bande3px/>
        <div style={{ padding: '8px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 10, color: T.ink }}>#1042 · Marie D.</p>
            <span style={{ fontSize: 7, fontWeight: 800, color: '#B45309', background: '#FEF3C7', padding: '2px 7px', borderRadius: 100 }}>En préparation</span>
          </div>
          <p style={{ margin: '0 0 6px', fontSize: 8.5, color: T.muted, fontWeight: 600 }}>4 croissants · 1 pain complet · retrait 16:30</p>
          <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '5px 10px', textAlign: 'center' }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff' }}>Marquer prête · le client est prévenu</span>
          </div>
        </div>
      </div>
      {/* Signal Yopper : l'envie du quartier */}
      <div style={{ margin: '8px 10px 0', background: '#fff', borderRadius: 11, padding: '8px 10px', border: `1px solid ${T.pale}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <IconHeart size={10}/>
          <span style={{ fontSize: 7, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Ton quartier te parle</span>
        </div>
        <p style={{ margin: 0, fontSize: 8.5, color: T.ink, fontWeight: 600, lineHeight: 1.45 }}>« Des sandwiches le midi, ce serait top ! » · 14 habitants sont d&rsquo;accord</p>
      </div>
      {/* Assistant IA */}
      <div style={{ margin: '8px 10px 0', background: `linear-gradient(135deg, ${T.panel}, ${T.deep})`, borderRadius: 11, padding: '8px 10px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <IconSparkles size={10}/>
          <span style={{ fontSize: 7, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Rédiger avec l&rsquo;IA</span>
        </div>
        <p style={{ margin: 0, fontSize: 8.5, color: '#fff', fontWeight: 600, lineHeight: 1.45 }}>Trois propositions de texte pour ton deal, prêtes en cinq secondes.</p>
      </div>
      {/* Stock du jour collé en bas */}
      <div style={{ margin: 'auto 10px 10px', background: '#fff', borderRadius: 11, padding: '8px 10px', border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 800, color: T.ink }}>Croissant au beurre</p>
        <span style={{ fontSize: 7.5, fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '2px 8px', borderRadius: 100, border: '1px solid #10B98133' }}>Stock jeudi : 24</span>
      </div>
    </div>
  )
}

// ─── Compteur vers le 1er septembre (isolé : tick sans re-render la page) ────
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

// Incitant mobilisation (repris de LandingTeasing, mêmes règles)
function IncitantMobilisation({ communeStats, globalStats }) {
  const boxSt = { margin: '0 0 14px', padding: '12px 14px', borderRadius: 12, background: 'rgba(150,96,224,0.14)', border: '1px solid rgba(196,160,244,0.35)' }
  const ligneSt = { margin: 0, fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.45 }
  const sousSt = { margin: 0, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }
  const barre = (pct) => (
    <div style={{ height: 7, borderRadius: 100, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', margin: '8px 0 6px' }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: 'linear-gradient(90deg, #9660E0, #C4A0F4)', transition: 'width 0.4s' }}/>
    </div>
  )

  if (communeStats?.horsZone) {
    return (
      <div style={boxSt}>
        <p style={ligneSt}>Yoppaa arrive région par région 🟣</p>
        <p style={{ ...sousSt, marginTop: 6 }}>Laisse ton email : on te prévient dès que Yoppaa arrive dans ta commune.</p>
      </div>
    )
  }
  if (communeStats) {
    const com = communeStats.nb_commercants || 0
    const seuil = Math.max(1, communeStats.seuil_preinscrits || 10)
    const hab = communeStats.nb_yoppers || 0
    const pct = Math.min(100, Math.round((com / seuil) * 100))
    const atteint = com >= seuil
    if (communeStats.active) {
      return (
        <div style={boxSt}>
          <p style={ligneSt}>Yoppaa est disponible à <strong>{communeStats.nom}</strong> 🟣</p>
          {barre(100)}
          <p style={sousSt}>{hab > 0 ? `${hab} habitant${hab > 1 ? 's' : ''} sont déjà Yoppers` : 'Deviens Yopper !'}</p>
        </div>
      )
    }
    return (
      <div style={boxSt}>
        <p style={ligneSt}>
          {atteint
            ? <>Ça y est, {communeStats.nom} a ses {seuil} commerçants ! Rejoins les Yoppers : plus on est nombreux, plus notre quartier revit 🟣</>
            : <>Déjà <strong>{com}</strong> commerçant{com > 1 ? 's' : ''} sur <strong>{seuil}</strong> pour activer <strong>{communeStats.nom}</strong> 🟣</>}
        </p>
        {barre(pct)}
        <p style={sousSt}>
          {hab > 0
            ? `${hab} habitant${hab > 1 ? 's' : ''} ${hab > 1 ? 'attendent' : 'attend'} déjà. Parles-en autour de toi.`
            : 'Sois le premier habitant à te mobiliser.'}
        </p>
      </div>
    )
  }
  if (globalStats) {
    const com = globalStats.total_commercants || 0
    const hab = globalStats.total_yoppers || 0
    const petit = (com + hab) < 5
    return (
      <div style={boxSt}>
        <p style={ligneSt}>
          {petit
            ? <>Sois parmi les tout premiers à faire venir Yoppaa dans ta commune 🟣</>
            : <>Déjà <strong>{com}</strong> commerçant{com > 1 ? 's' : ''} et <strong>{hab}</strong> curieux mobilisés 🟣</>}
        </p>
        <p style={{ ...sousSt, marginTop: 6 }}>Entre ton code postal pour voir où en est ta commune.</p>
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
    accroche: 'Ta commune entend parler de toi chaque matin.',
    points: [
      'Tout Exister, plus :',
      'Deals du jour et actualités illimités',
      'Ta place quotidienne dans le Good Morning Yoppers',
      'Notifications push envoyées aux habitants de ta commune',
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
      'Assistant IA complet : rédaction avancée pour tes articles, tes deals et tes actus, avec un usage étendu',
      '0% de commission sur tes ventes',
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
      setStatut({ envoi: 'ok', message: 'Bien reçu 🟣 Rendez-vous le 1er septembre. À très vite !' })
      if (j.slug_kit) setKitSlug(j.slug_kit)
      if (typeof window !== 'undefined' && window.turnstile && turnstileRef.current) {
        try { window.turnstile.reset(turnstileRef.current) } catch (_) {}
      }
    } catch (err) {
      setStatut({ envoi: 'ko', message: 'Erreur réseau, réessaie' })
    }
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  // Le consentement marketing est FACULTATIF : il ne bloque jamais l'inscription
  const formValide = form.email.trim() && /^\d{4}$/.test(form.code_postal.trim())
    && (form.type_utilisateur !== 'commercant' || !!form.commercant_nom.trim())

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

  const allerAuForm = (typeUtilisateur) => {
    if (typeUtilisateur) setForm(p => ({ ...p, type_utilisateur: typeUtilisateur }))
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
    <div style={{ background: T.bg, color: T.ink, fontFamily: '"DM Sans", sans-serif' }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" async defer/>

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
          <h1 style={{ fontSize: 'clamp(2.3rem, 6.5vw, 3.8rem)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.06, margin: '0 auto 18px', maxWidth: 700, color: '#fff' }}>
            Ton quartier<br/>dans ta poche.
          </h1>
          <p style={{ fontSize: 'clamp(1.02rem, 2.6vw, 1.2rem)', color: 'rgba(255,255,255,0.92)', lineHeight: 1.65, maxWidth: 580, margin: '0 auto 26px', fontWeight: 500 }}>
            Voici Yoppaa, l&rsquo;app belge <DrapeauBelge/> qui rapproche les habitants de leurs commerçants.
            Tu commandes chez ton boulanger, tu réserves chez ton coiffeur et tu suis la vie de ta commune,
            le tout dans une seule app. Et les commerçants gardent l&rsquo;intégralité de leurs ventes :
            <strong style={{ color: '#fff' }}> 0% de commission</strong>.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 44 }}>
            <button onClick={() => allerAuForm('yopper')} style={btnPrimaire}>Devenir Yopper</button>
            <button onClick={() => allerAuForm('commercant')}
              style={{ ...btnPrimaire, background: 'transparent', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)', boxShadow: 'none' }}>
              Je suis commerçant
            </button>
          </div>
          <p style={{ margin: '0 0 14px', fontSize: 12, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.6px' }}>
            Lancement de l&rsquo;app le 1<sup>er</sup> septembre
          </p>
          <CompteurLancement/>
        </div>
      </section>

      {/* ═══ 2. MANIFESTO (clair, court) ═══ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '64px 20px 8px', textAlign: 'center' }}>
        <SectionEyebrow>Pourquoi Yoppaa</SectionEyebrow>
        <h2 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.3rem)', fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1.15, margin: '0 0 16px', color: T.ink }}>
          Les grandes plateformes prélèvent une commission sur chaque vente.<br/>
          <span style={{ color: T.main }}>Nous, on a choisi le camp du quartier.<br/>Celui du boulanger qui te connaît par ton prénom.</span>
        </h2>
        <p style={{ fontSize: '1.02rem', color: T.muted, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 28px', fontWeight: 500 }}>
          Yoppaa réunit les commerces de ta commune dans une seule app. Tu commandes et tu réserves
          chez eux en quelques secondes, ils gardent tout ce qu&rsquo;ils gagnent, et ton quartier
          reste vivant. C&rsquo;est aussi simple que ça.
        </p>
        {/* Les 3 familles de commerçants (taxonomie produit : alimentaire / services / détail) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, textAlign: 'left' }}>
          {[
            { titre: 'Alimentaire', exemples: 'Boulangeries, boucheries, snacks, friteries, sandwicheries, restaurants, food trucks et plein d’autres.' },
            { titre: 'Services', exemples: 'Coiffeurs, barbiers, instituts de beauté, bien-être, garages et tous les métiers sur rendez-vous.' },
            { titre: 'Détail', exemples: 'Boutiques de mode, fleuristes, librairies, décoration et tout le commerce de proximité.' },
          ].map(s => (
            <div key={s.titre} style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', border: `1px solid ${T.pale}`, boxShadow: '0 4px 14px rgba(22,6,54,0.05)' }}>
              <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 900, color: T.main, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{s.titre}</p>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: T.deep, lineHeight: 1.55 }}>{s.exemples}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 3. CÔTÉ YOPPERS : mockups ═══ */}
      <section style={{ maxWidth: 1080, margin: '0 auto', padding: '56px 20px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <SectionEyebrow>Pour toi, Yopper</SectionEyebrow>
          <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900, letterSpacing: '-1px', margin: '0 0 12px', color: T.ink }}>
            Tes commerces préférés, à portée de main.
          </h2>
          <p style={{ fontSize: '1rem', color: T.muted, maxWidth: 560, margin: '0 auto', lineHeight: 1.65, fontWeight: 500 }}>
            Fini la file du samedi matin et le répondeur du coiffeur. Tu commandes à l&rsquo;avance,
            tu réserves quand ça t&rsquo;arrange, et chaque matin l&rsquo;app te souffle les bons plans
            du jour près de chez toi.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'clamp(18px, 4vw, 40px)', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'flex-start', color: T.deep }}>
          <PhoneFrame label="Commande à l'avance et passe la prendre sans faire la file">
            <MockFiche/>
          </PhoneFrame>
          <PhoneFrame label="Chaque matin à 7h30, les bons plans de ta commune arrivent tout seuls">
            <MockMorning/>
          </PhoneFrame>
          <PhoneFrame label="Prends rendez-vous chez ton coiffeur ou ton barbier, même à minuit">
            <MockRdv/>
          </PhoneFrame>
        </div>
        {/* Bénéfices en pastilles */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 40 }}>
          {[
            'Click & Collect', 'Rendez-vous en ligne', 'Good Morning Yoppers', 'Deals du jour',
            'Livraison locale', 'Suivi de commande', 'Boutiques de détail',
          ].map(b => (
            <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 100, background: '#fff', border: `1.5px solid ${T.pale}`, fontSize: 13, fontWeight: 800, color: T.deep, boxShadow: '0 2px 10px rgba(22,6,54,0.05)' }}>
              <IconCheck size={12}/> {b}
            </span>
          ))}
        </div>
      </section>

      {/* ═══ 4. CÔTÉ COMMERÇANTS (sombre, punch) ═══ */}
      <section style={{ background: `linear-gradient(135deg, ${T.panel} 0%, ${T.ink} 100%)`, color: '#fff', marginTop: 48 }}>
        <Bande3px/>
        <div style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 20px 72px' }}>
          <div style={{ textAlign: 'center', marginBottom: 44 }}>
            <SectionEyebrow dark>Pour les commerçants</SectionEyebrow>
            <h2 style={{ fontSize: 'clamp(1.6rem, 4.5vw, 2.3rem)', fontWeight: 900, letterSpacing: '-1.2px', lineHeight: 1.12, margin: '0 0 14px', color: '#fff' }}>
              Les outils des grandes enseignes.<br/>Sans toucher à tes marges.
            </h2>
            <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.88)', maxWidth: 600, margin: '0 auto', lineHeight: 1.65, fontWeight: 500 }}>
              Une page professionnelle, des commandes, des rendez-vous, des promotions qui arrivent
              directement sur le téléphone de tes clients, et même un assistant IA pour rédiger tes textes.
              Tout est pensé pour te faire gagner du temps, et Yoppaa ne prélève jamais rien sur tes ventes.
            </p>
          </div>

          {/* Chiffres punch */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, maxWidth: 760, margin: '0 auto 48px' }}>
            {[
              { chiffre: '0%', label: 'de commission sur tes ventes' },
              { chiffre: '30 jours', label: "d'essai gratuit, sans carte de paiement" },
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
                { titre: 'Ton quartier te parle', texte: 'Les habitants te disent ce qu’ils aimeraient trouver chez toi : de nouvelles envies, de nouveaux produits, de nouveaux clients. Tu sais ce que ton quartier attend avant même d’ouvrir le rideau.' },
                { titre: 'Des notifications qui touchent leur cible', texte: 'Ton deal du matin part en notification push vers les habitants de ta commune, pas dans le vide. Le bon message, aux bonnes personnes, au bon moment.' },
                { titre: 'Une gestion sans prise de tête', texte: 'Stock du jour, commandes, rendez-vous, tout se pilote en quelques clics depuis ton téléphone. Et quand une commande est prête, le client est prévenu automatiquement.' },
              ].map(a => (
                <div key={a.titre} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 18, padding: '16px 18px', textAlign: 'left' }}>
                  <p style={{ margin: '0 0 6px', fontWeight: 900, fontSize: 15.5, color: '#fff', letterSpacing: '-0.3px' }}>{a.titre}</p>
                  <p style={{ margin: 0, fontSize: 13.5, color: 'rgba(255,255,255,0.88)', lineHeight: 1.6, fontWeight: 500 }}>{a.texte}</p>
                </div>
              ))}
              <button onClick={() => allerAuForm('commercant')} style={{ ...btnPrimaire, marginTop: 6, width: '100%' }}>
                Préinscrire mon commerce
              </button>
            </div>
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
                <button onClick={() => allerAuForm('commercant')}
                  style={{
                    marginTop: 'auto', width: '100%', padding: '13px', borderRadius: 100,
                    fontWeight: 900, fontSize: 13.5, letterSpacing: 0.4, textTransform: 'uppercase',
                    cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                    /* CTA plein pour la vedette, contour pour les accroches */
                    border: f.vedette ? 'none' : `1.5px solid ${T.main}`,
                    background: f.vedette ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff',
                    color: f.vedette ? '#fff' : T.main,
                    boxShadow: f.vedette ? `0 6px 20px ${T.main}55` : 'none',
                  }}>
                  Je me préinscris
                </button>
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: '22px auto 0', fontSize: 13, fontWeight: 700, color: T.muted, textAlign: 'center', maxWidth: 560, lineHeight: 1.6 }}>
          30 jours d&rsquo;essai gratuit sur les formules payantes, sans carte de paiement.
          Ensuite, paiement mensuel par Bancontact ou carte, et tu restes libre de partir quand tu veux.
        </p>
      </section>

      {/* ═══ 6. LA ZONE : commune par commune ═══ */}
      <section style={{ maxWidth: 760, margin: '0 auto', padding: '64px 20px 8px', textAlign: 'center' }}>
        <SectionEyebrow>Où ça se passe</SectionEyebrow>
        <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.1rem)', fontWeight: 900, letterSpacing: '-1px', margin: '0 0 14px', color: T.ink }}>
          On démarre en Wallonie, commune par commune.
        </h2>
        <p style={{ fontSize: '1rem', color: T.muted, lineHeight: 1.7, maxWidth: 600, margin: '0 auto 18px', fontWeight: 500 }}>
          Yoppaa ne s&rsquo;ouvre pas partout à moitié : chaque commune s&rsquo;active quand suffisamment
          de commerçants l&rsquo;ont rejointe. C&rsquo;est donc toi qui fais venir Yoppaa chez toi,
          en te préinscrivant et en en parlant autour de toi.
        </p>
        <p style={{ fontSize: '0.95rem', fontWeight: 800, color: T.main, margin: 0 }}>
          Entre ton code postal dans le formulaire : tu verras où en est ta commune.
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
              Ici, pas de commission sur les ventes, pas de revente de données, pas d&rsquo;algorithme qui
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
            Rendez-vous le 1<sup>er</sup> septembre.
          </h2>
          <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.9)', margin: '0 0 32px', lineHeight: 1.65, fontWeight: 500, maxWidth: 440 }}>
            Laisse ton email et tu seras parmi les premiers à télécharger l&rsquo;app.
            Commerçant ? Ta préinscription fait avancer ta commune vers son activation.
          </p>

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
                    Un lien perso et un QR code à partager. Chaque inscription via ton lien fait avancer ta commune.
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

              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                {[
                  { val: 'yopper', label: 'Je suis curieux' },
                  { val: 'commercant', label: 'Je suis commerçant' },
                ].map(opt => {
                  const actif = form.type_utilisateur === opt.val
                  return (
                    <button key={opt.val} type="button"
                      onClick={() => setForm(p => ({ ...p, type_utilisateur: opt.val }))}
                      style={{ flex: 1, padding: '11px 12px', borderRadius: 12, border: `1.5px solid ${actif ? '#C4A0F4' : 'rgba(255,255,255,0.18)'}`, background: actif ? 'rgba(196,160,244,0.18)' : 'transparent', color: actif ? '#fff' : '#C4A0F4', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
                      {opt.label}
                    </button>
                  )
                })}
              </div>

              <input type="text"
                required={form.type_utilisateur === 'commercant'}
                maxLength={160}
                placeholder={form.type_utilisateur === 'commercant'
                  ? 'Le nom de ton commerce'
                  : 'Un commerce que tu aimerais voir ? (optionnel)'}
                value={form.commercant_nom}
                onChange={e => setForm(p => ({ ...p, commercant_nom: e.target.value }))}
                style={inputStyle}/>

              <textarea placeholder="Un message ? (optionnel)" rows={2}
                value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value.slice(0, 500) }))}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 50 }}/>

              {/* Opt-in marketing RGPD : case visible, jamais pré-cochée, facultative */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.consentement_marketing}
                  onChange={e => setForm(p => ({ ...p, consentement_marketing: e.target.checked }))}
                  style={{ marginTop: 2, width: 15, height: 15, accentColor: '#9660E0', flexShrink: 0, cursor: 'pointer' }}/>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, fontWeight: 600 }}>
                  Je souhaite recevoir les actualités de Yoppaa et être prévenu de l&rsquo;ouverture de ma commune.
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
              <Link href="/legal" style={{ color: 'inherit', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.25)' }}>Mentions légales</Link>
            </p>
          </footer>
        </div>
      </section>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}
