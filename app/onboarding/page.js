'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const T = {
  bg:      '#F8F6FF',
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

const ECRANS = [
  {
    id: 'bienvenue',
    emoji: null,
    visuel: 'yoppaa',
    titre: 'Ton quartier,\ndans ta poche.',
    sousTitre: 'Découvre les commerçants autour de toi. Commande en avance. Récupère sans attendre.',
    cta: 'Commencer →',
    skip: false,
  },
  {
    id: 'notifications',
    emoji: '🔔',
    visuel: 'notifs',
    titre: 'Les bons deals,\nau bon moment.',
    sousTitre: 'Reçois les offres flash de tes commerçants préférés. 1 notification par jour — jamais de spam.',
    cta: 'Activer les notifications',
    ctaSecondaire: 'Pas maintenant',
    skip: true,
  },
  {
    id: 'localisation',
    emoji: '📍',
    visuel: 'maps',
    titre: 'Les commerçants\nprès de chez toi.',
    sousTitre: 'Yoppaa utilise ta position pour te montrer ce qui est ouvert autour de toi en ce moment.',
    cta: 'Autoriser la localisation',
    ctaSecondaire: 'Pas maintenant',
    skip: true,
  },
  {
    id: 'connexion',
    emoji: '🟣',
    visuel: 'connexion',
    titre: 'Rejoins\nles Yoppers.',
    sousTitre: 'Connecte-toi pour commander, suivre tes commandes et accéder à ton historique sur tous tes appareils.',
    cta: 'Se connecter',
    ctaSecondaire: 'Continuer sans compte',
    skip: true,
  },
]

// ── Visuel écran 1 — Yoppaa wordmark animé ───────────────────────────────────
function VisuelYoppaa() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* 3 points yo·pp·aa animés */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {[
          { c: 'rgba(255,255,255,0.5)', s: 10, delay: '0s' },
          { c: T.light, s: 16, delay: '0.2s' },
          { c: T.mid, s: 10, delay: '0.4s' },
        ].map((d, i) => (
          <div key={i} style={{
            width: d.s, height: d.s, borderRadius: '50%', background: d.c,
            animation: `dotPulse 2s ease-in-out ${d.delay} infinite`,
            boxShadow: `0 0 20px ${d.c}88`,
          }}/>
        ))}
      </div>

      {/* Wordmark */}
      <p style={{ fontWeight: 900, fontSize: '3.5rem', color: '#fff', letterSpacing: '-2px', lineHeight: 1, fontFamily: '"DM Sans", sans-serif' }}>
        yoppaa
      </p>

      {/* Cards commerçants simulées */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 280 }}>
        {[
          { nom: 'Au Pain Doré', type: 'Boulangerie', statut: 'Ouvert', deal: '🔥 Deal: Tarte -20%', emoji: '🥐' },
          { nom: 'Kebabistro', type: 'Snack', statut: 'Ouvert', emoji: '🌯' },
          { nom: "Le 9-15", type: 'Sandwicherie', statut: 'Ouvert', emoji: '🥪' },
        ].map((c, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)',
            borderRadius: 14, padding: '0.75rem 1rem',
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', gap: 10,
            animation: `slideUp 0.5s ease ${0.1 + i * 0.15}s both`,
          }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}>
              {c.emoji}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff', letterSpacing: '-0.2px' }}>{c.nom}</p>
              <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>{c.type}</p>
              {c.deal && <p style={{ fontSize: '0.65rem', fontWeight: 700, color: T.light, marginTop: 2 }}>{c.deal}</p>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', animation: 'pulse 2s infinite' }}/>
              <span style={{ fontSize: '0.65rem', color: '#4ADE80', fontWeight: 700 }}>{c.statut}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Visuel écran 2 — Notifications ───────────────────────────────────────────
function VisuelNotifs() {
  const notifs = [
    { commerce: 'Au Pain Doré', message: '🔥 Tarte au riz -20% jusqu\'à 11h !', time: 'maintenant', color: T.main },
    { commerce: 'Kebabistro', message: '🌯 Menu midi disponible — 8,50€', time: '5 min', color: T.mid },
    { commerce: 'Le 9-15', message: '📦 Plus que 3 sandwichs au thon !', time: '12 min', color: T.deep },
  ]
  return (
    <div style={{ width: '100%', maxWidth: 300 }}>
      {/* Téléphone mockup */}
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 24, padding: '1rem', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.light, animation: 'pulse 2s infinite' }}/>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', flex: 1 }}>Centre de notifications</span>
          <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>Tout effacer</span>
        </div>
        {notifs.map((n, i) => (
          <div key={i} style={{
            background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '0.625rem 0.75rem', marginBottom: 6,
            border: `1px solid ${n.color}33`,
            animation: `slideUp 0.4s ease ${0.15 + i * 0.15}s both`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 16, height: 16, borderRadius: 5, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', gap: 1.5 }}>
                    {[3,5,3].map((s,j) => <div key={j} style={{width:s,height:s,borderRadius:'50%',background:'rgba(255,255,255,0.7)'}}/>)}
                  </div>
                </div>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255,255,255,0.8)' }}>yoppaa</span>
              </div>
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>{n.time}</span>
            </div>
            <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{n.commerce}</p>
            <p style={{ fontSize: '0.75rem', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>{n.message}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Visuel écran 3 — Localisation ─────────────────────────────────────────────
function VisuelMaps() {
  return (
    <div style={{ width: '100%', maxWidth: 300, position: 'relative' }}>
      {/* Carte simulée */}
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', aspectRatio: '4/3', position: 'relative', backdropFilter: 'blur(12px)' }}>
        {/* Grille carte */}
        <div style={{ position: 'absolute', inset: 0 }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 20}%`, height: 1, background: 'rgba(255,255,255,0.05)' }}/>
          ))}
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 20}%`, width: 1, background: 'rgba(255,255,255,0.05)' }}/>
          ))}
        </div>

        {/* Cercle rayon */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 140, height: 140, borderRadius: '50%', background: `${T.main}18`, border: `2px solid ${T.main}44`, animation: 'radarPulse 3s ease-in-out infinite' }}/>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 80, height: 80, borderRadius: '50%', background: `${T.main}25`, border: `1.5px solid ${T.main}55` }}/>

        {/* Position utilisateur */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', border: `3px solid ${T.main}`, boxShadow: `0 0 16px ${T.main}88, 0 2px 8px rgba(0,0,0,0.3)` }}/>
        </div>

        {/* Marqueurs commerçants */}
        {[
          { x: '25%', y: '35%', nom: '🥐', color: T.main },
          { x: '70%', y: '25%', nom: '🌯', color: T.mid },
          { x: '65%', y: '65%', nom: '🥪', color: T.deep },
          { x: '20%', y: '70%', nom: '🍕', color: T.main },
        ].map((m, i) => (
          <div key={i} style={{
            position: 'absolute', left: m.x, top: m.y,
            transform: 'translate(-50%,-50%)',
            animation: `popIn 0.3s ease ${0.2 + i * 0.1}s both`,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: m.color, border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', boxShadow: `0 4px 12px ${m.color}66` }}>
              {m.nom}
            </div>
          </div>
        ))}
      </div>

      {/* Badge GPS */}
      <div style={{ position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '6px 16px', boxShadow: `0 4px 16px ${T.main}66`, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fff' }}>📍 4 commerçants autour de toi</span>
      </div>
    </div>
  )
}

// ── Visuel écran 4 — Connexion ────────────────────────────────────────────────
function VisuelConnexion() {
  return (
    <div style={{ width: '100%', maxWidth: 280 }}>
      {/* Avatar Yopper */}
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, margin: '0 auto 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', boxShadow: `0 8px 32px ${T.main}66, 0 0 0 4px rgba(255,255,255,0.1)` }}>
          🟣
        </div>
        <p style={{ fontWeight: 900, fontSize: '0.9rem', color: '#fff', letterSpacing: '-0.3px' }}>ICI ON EST YOPPERS</p>
        <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Rejoins la tribu du commerce local</p>
      </div>

      {/* Avantages compte */}
      {[
        { icon: '📦', label: 'Suis tes commandes en temps réel' },
        { icon: '⭐', label: 'Accède à tes commerçants favoris' },
        { icon: '🔄', label: 'Retrouve ton historique partout' },
        { icon: '🎁', label: 'Accède aux offres exclusives Yoppers' },
      ].map((a, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '0.625rem 0.875rem', marginBottom: 6,
          border: '1px solid rgba(255,255,255,0.1)',
          animation: `slideUp 0.4s ease ${0.1 + i * 0.1}s both`,
        }}>
          <span style={{ fontSize: '1rem', flexShrink: 0 }}>{a.icon}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>{a.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter()
  const [ecranIdx, setEcranIdx] = useState(0)
  const [sortie, setSortie] = useState(false)

  const ecran = ECRANS[ecranIdx]
  const estDernier = ecranIdx === ECRANS.length - 1

  function allerEcranSuivant() {
    if (ecranIdx < ECRANS.length - 1) {
      setSortie(true)
      setTimeout(() => { setEcranIdx(i => i + 1); setSortie(false) }, 300)
    } else {
      terminer()
    }
  }

  function terminer() {
    localStorage.setItem('yoppaa_onboarding_done', '1')
    router.push('/commander')
  }

  function gererCta() {
    if (ecran.id === 'notifications') {
      // Demander permission notifications
      if ('Notification' in window) {
        Notification.requestPermission().then(() => allerEcranSuivant())
      } else {
        allerEcranSuivant()
      }
    } else if (ecran.id === 'localisation') {
      // Demander permission géolocalisation
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          () => allerEcranSuivant(),
          () => allerEcranSuivant()
        )
      } else {
        allerEcranSuivant()
      }
    } else if (ecran.id === 'connexion') {
      router.push('/login?redirect=/commander')
    } else {
      allerEcranSuivant()
    }
  }

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; overflow: hidden; }
        body { font-family: "DM Sans", sans-serif; background: ${T.bgPanel}; }

        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideOut { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(-24px); } }
        @keyframes dotPulse { 0%,100% { transform:scale(1); opacity:0.8; } 50% { transform:scale(1.3); opacity:1; } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        @keyframes radarPulse { 0%,100% { transform:translate(-50%,-50%) scale(1); opacity:0.5; } 50% { transform:translate(-50%,-50%) scale(1.05); opacity:0.8; } }
        @keyframes popIn { from { opacity:0; transform:translate(-50%,-50%) scale(0.5); } to { opacity:1; transform:translate(-50%,-50%) scale(1); } }
        @keyframes progressFill { from { width:0; } to { width:100%; } }

        .wrap { height: 100dvh; display: flex; flex-direction: column; max-width: 480px; margin: 0 auto; position: relative; overflow: hidden; }
        .ecran { flex: 1; display: flex; flex-direction: column; animation: ${sortie ? 'slideOut 0.3s ease forwards' : 'fadeIn 0.4s ease'}; }

        .btn-primary {
          width: 100%;
          padding: 1rem;
          border: none;
          border-radius: 100px;
          font-weight: 800;
          font-size: 1rem;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          letter-spacing: -0.3px;
          background: linear-gradient(135deg, ${T.main}, ${T.mid});
          color: #fff;
          box-shadow: 0 6px 24px ${T.main}55;
          transition: all 0.2s;
        }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 32px ${T.main}66; }
        .btn-secondary {
          width: 100%;
          padding: 0.875rem;
          background: transparent;
          border: 1.5px solid rgba(255,255,255,0.2);
          border-radius: 100px;
          color: rgba(255,255,255,0.6);
          font-weight: 600;
          font-size: 0.9rem;
          cursor: pointer;
          font-family: "DM Sans", sans-serif;
          transition: all 0.15s;
          margin-top: 8px;
        }
        .btn-secondary:hover { border-color: rgba(255,255,255,0.4); color: rgba(255,255,255,0.9); }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      <div className="wrap" style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.main}88 100%)` }}>

        {/* Barre de progression */}
        <div style={{ padding: '1rem 1.25rem 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {ECRANS.map((_, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 100, background: i <= ecranIdx ? '#fff' : 'rgba(255,255,255,0.2)', transition: 'background 0.4s ease', overflow: 'hidden' }}>
                {i === ecranIdx && (
                  <div style={{ height: '100%', background: '#fff', animation: 'progressFill 0.4s ease forwards' }}/>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Skip */}
        {ecran.skip && (
          <div style={{ textAlign: 'right', padding: '0.75rem 1.25rem 0', flexShrink: 0 }}>
            <button onClick={terminer}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', padding: '4px 8px' }}>
              Passer →
            </button>
          </div>
        )}

        {/* Contenu */}
        <div className="ecran">

          {/* Zone visuelle */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem 1.5rem 1rem' }}>
            {ecran.visuel === 'yoppaa' && <VisuelYoppaa/>}
            {ecran.visuel === 'notifs' && <VisuelNotifs/>}
            {ecran.visuel === 'maps' && <VisuelMaps/>}
            {ecran.visuel === 'connexion' && <VisuelConnexion/>}
          </div>

          {/* Zone texte + boutons */}
          <div style={{ padding: '1.5rem 1.5rem 2rem', flexShrink: 0 }}>

            {/* Emoji */}
            {ecran.emoji && (
              <div style={{ fontSize: '2rem', marginBottom: 12, animation: 'slideUp 0.4s ease 0.1s both' }}>
                {ecran.emoji}
              </div>
            )}

            {/* Titre */}
            <h1 style={{
              fontWeight: 900, fontSize: '2rem', color: '#fff', letterSpacing: '-1px', lineHeight: 1.1, marginBottom: 10,
              animation: 'slideUp 0.4s ease 0.15s both',
              whiteSpace: 'pre-line',
            }}>
              {ecran.titre}
            </h1>

            {/* Sous-titre */}
            <p style={{
              fontSize: '0.9rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginBottom: 28,
              animation: 'slideUp 0.4s ease 0.2s both',
            }}>
              {ecran.sousTitre}
            </p>

            {/* CTA principal */}
            <div style={{ animation: 'slideUp 0.4s ease 0.25s both' }}>
              <button className="btn-primary" onClick={gererCta}>
                {ecran.cta}
              </button>

              {/* CTA secondaire */}
              {ecran.ctaSecondaire && (
                <button className="btn-secondary" onClick={allerEcranSuivant}>
                  {ecran.ctaSecondaire}
                </button>
              )}
            </div>

            {/* Points de pagination */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
              {ECRANS.map((_, i) => (
                <div key={i} style={{
                  width: i === ecranIdx ? 20 : 6, height: 6, borderRadius: 100,
                  background: i === ecranIdx ? '#fff' : 'rgba(255,255,255,0.25)',
                  transition: 'all 0.3s ease',
                }}/>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}