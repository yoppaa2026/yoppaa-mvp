'use client'
// L'écran que voit un commerçant dont le compte n'est pas encore ouvert.
//
// ⚠️ IL NE SUFFIT PAS DE FERMER LA PORTE. Quelqu'un qui vient de passer vingt
// minutes à remplir son inscription et qui se retrouve dehors sans explication
// croit que le site est cassé, et il écrit à Yoppaa. L'écran répond donc aux
// trois questions qu'il se pose À CET INSTANT : qu'est-ce qui se passe, combien
// de temps, et qu'est-ce que je fais maintenant.
//
// Trois situations, trois écrans, et jamais le même bouton :
//   • en attente  → rien à faire, on le prévient par email ;
//   • rejeté      → le motif, et le bouton qui MÈNE À LA CORRECTION ;
//   • inscription inachevée → on le renvoie là où il s'est arrêté.
//
// ⚠️ Le rouge est réservé à ce qui détruit. Un refus est une mauvaise nouvelle,
// pas une destruction : il est en ambre.

import Link from 'next/link'
import { RAISON_REJETE, RAISON_ONBOARDING } from '@/lib/statut-commercant'

const T = {
  bg:     '#F8F6FF',
  carte:  '#FFFFFF',
  ink:    '#1A0840',
  deep:   '#2D0F6B',
  main:   '#6B35C4',
  mid:    '#9660E0',
  light:  '#C4A0F4',
  pale:   '#EDE0FF',
  muted:  '#6B7280',
  ambre:  '#EA580C',
  ambreFond: '#FFF7ED',
}

function Horloge({ couleur }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
  )
}

function Panneau({ couleur }) {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>
      <path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
  )
}

const btn = {
  display: 'inline-block', padding: '13px 26px', borderRadius: 100, border: 'none',
  background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff',
  fontWeight: 800, fontSize: 14.5, letterSpacing: 0.2, cursor: 'pointer',
  fontFamily: '"DM Sans", sans-serif', textDecoration: 'none',
  boxShadow: `0 6px 18px ${T.main}44`,
}
const btnDiscret = {
  ...btn, background: 'transparent', color: T.muted,
  border: `1.5px solid ${T.pale}`, boxShadow: 'none', fontWeight: 700,
}

export default function EcranValidation({ raison, motif, nomCommerce, onDeconnexion }) {
  const rejete = raison === RAISON_REJETE
  const inacheve = raison === RAISON_ONBOARDING
  const accent = rejete ? T.ambre : T.main

  return (
    <div style={{
      minHeight: '100dvh', background: T.bg, color: T.ink,
      fontFamily: '"DM Sans", sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 20px',
    }}>
      <div style={{
        maxWidth: 520, width: '100%', background: T.carte, borderRadius: 22,
        border: `1px solid ${rejete ? '#FDBA74' : T.pale}`,
        boxShadow: '0 10px 30px rgba(22,6,54,0.09)',
        padding: 'clamp(26px, 6vw, 40px)',
      }}>
        <div style={{
          width: 60, height: 60, borderRadius: 18, marginBottom: 22,
          background: rejete ? T.ambreFond : T.pale,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {rejete ? <Panneau couleur={accent}/> : <Horloge couleur={accent}/>}
        </div>

        {inacheve ? (
          <>
            <h1 style={{ fontSize: 'clamp(1.4rem, 4.5vw, 1.8rem)', fontWeight: 900, letterSpacing: '-0.8px', lineHeight: 1.2, margin: '0 0 12px' }}>
              Ton inscription n&rsquo;est pas terminée.
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: T.muted, margin: '0 0 24px', fontWeight: 500 }}>
              Il te reste quelques informations à compléter avant que Yoppaa puisse examiner
              ton dossier. Tout ce que tu as déjà saisi est conservé, tu reprends où tu
              t&rsquo;es arrêté.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/signup" style={btn}>Reprendre mon inscription</Link>
              <button onClick={onDeconnexion} style={btnDiscret}>Me déconnecter</button>
            </div>
          </>
        ) : rejete ? (
          <>
            <h1 style={{ fontSize: 'clamp(1.4rem, 4.5vw, 1.8rem)', fontWeight: 900, letterSpacing: '-0.8px', lineHeight: 1.2, margin: '0 0 12px' }}>
              Ton dossier demande une correction.
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: T.muted, margin: '0 0 18px', fontWeight: 500 }}>
              L&rsquo;équipe Yoppaa a examiné ton inscription et n&rsquo;a pas pu la valider en
              l&rsquo;état.
            </p>
            {/* ⚠️ Un élément écarté se montre AVEC SA RAISON. Sans le motif,
                l'écran ne fait qu'annoncer un refus, ce qui n'aide personne. */}
            {motif ? (
              <div style={{
                background: T.ambreFond, border: '1px solid #FDBA74', borderRadius: 14,
                padding: '14px 16px', margin: '0 0 22px',
              }}>
                <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 900, color: T.ambre, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                  Ce qu&rsquo;il faut corriger
                </p>
                <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: T.ink, fontWeight: 600 }}>{motif}</p>
              </div>
            ) : (
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: T.ink, fontWeight: 600, margin: '0 0 22px' }}>
                Écris-nous à <a href="mailto:hello@yoppaa.app" style={{ color: T.main, fontWeight: 800 }}>hello@yoppaa.app</a> et
                on te dit précisément ce qui bloque.
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Link href="/signup" style={btn}>Corriger mon dossier</Link>
              <button onClick={onDeconnexion} style={btnDiscret}>Me déconnecter</button>
            </div>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 'clamp(1.4rem, 4.5vw, 1.8rem)', fontWeight: 900, letterSpacing: '-0.8px', lineHeight: 1.2, margin: '0 0 12px' }}>
              {nomCommerce ? <>{nomCommerce} est en cours de validation.</> : <>Ton compte est en cours de validation.</>}
            </h1>
            <p style={{ fontSize: 15, lineHeight: 1.65, color: T.muted, margin: '0 0 20px', fontWeight: 500 }}>
              Ton inscription est bien arrivée chez nous 🟣 L&rsquo;équipe Yoppaa la vérifie,
              en général <strong style={{ color: T.ink }}>sous 24 heures</strong>. Tu recevras
              un email dès que ton espace s&rsquo;ouvre, et tu pourras alors publier ta page.
            </p>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: T.muted, margin: '0 0 24px', fontWeight: 500 }}>
              Tu n&rsquo;as rien à faire d&rsquo;ici là, et rien n&rsquo;est perdu : tout ce que tu as
              rempli t&rsquo;attend. Une question ?{' '}
              <a href="mailto:hello@yoppaa.app" style={{ color: T.main, fontWeight: 700 }}>hello@yoppaa.app</a>
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={onDeconnexion} style={btnDiscret}>Me déconnecter</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
