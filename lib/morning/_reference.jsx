// ════════════════════════════════════════════════════════════════════
// GOOD MORNING YOPPERS — Référence visuelle canonique
// ════════════════════════════════════════════════════════════════════
//
// Ce fichier sert de RÉFÉRENCE pour le design system Yoppaa.
// Il n'est PAS routé (préfixe _) et ne s'exécute pas en production.
//
// Source : artefact React partagé par Alexandre le 2026-05-28.
// Spec complète : voir memory/project_good_morning_yoppers.md
// Design system tiré de ce fichier : memory/feedback_visuel_yoppaa.md
//
// IMPLÉMENTATION FINALE à découper en composants modulaires :
//   app/commander/morning/page.tsx
//   components/morning/GoodMorningHeader.tsx
//   components/morning/DealCard.tsx
//   components/morning/ActuCard.tsx
//   components/morning/MorningFooter.tsx
//   components/morning/icons.tsx
//   lib/morning/fetchMorning.ts
//   hooks/useMatchWidth.ts
//
// Quand l'implémentation modulaire est faite, ce fichier reste comme
// référence visuelle pour les futurs développeurs et pour vérifier
// la fidélité visuelle.
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useLayoutEffect } from "react";

const deals = [
  {
    commerce: "P'tit Toqué", type: "🥐", categorie: "Boulangerie",
    deal: "Croissants butter édition limitée",
    prix: "1,20€", prixNormal: "1,80€", stock: 18,
    actu: "On ouvre dès 6h30 ce mois-ci pour les lève-tôt 🌅",
  },
  {
    commerce: "Kebabistro", type: "🌯", categorie: "Snack",
    deal: "Midi express — sandwich + boisson",
    prix: "7,50€", prixNormal: "10,50€", stock: 3,
    actu: "Nouvelle sauce maison à l'ail confit sur toutes les formules 🧄",
  },
  {
    commerce: "Mozz'Art", type: "🍕", categorie: "Pizzeria",
    deal: "Pizza du jour — 4 fromages",
    prix: "9€", prixNormal: "13€", stock: 8,
    actu: "Soirée pizza vendredi — commande dès maintenant pour 19h–21h 🎉",
  },
];

const now      = new Date();
const days     = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const months   = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const dayShort = days[now.getDay()];
const dateRest = `${now.getDate()} ${months[now.getMonth()]}`;
const tom      = new Date(now); tom.setDate(tom.getDate()+1);
const tomorrowStr = `${days[tom.getDay()]} ${tom.getDate()} ${months[tom.getMonth()]}`;

// Numéro d'édition : jours depuis le lancement (1er janvier 2026)
const launch = new Date(2026, 0, 1);
const editionNb = Math.floor((now - launch) / (1000*60*60*24)) + 1;

// ── Hook : font-size de "Good Morning" matche la largeur de "Yoppers" ─
function useMatchWidth(targetRef, sourceText, fontWeight="800") {
  const [fontSize, setFontSize] = useState(28);
  useLayoutEffect(() => {
    if (!targetRef.current) return;
    const targetW = targetRef.current.offsetWidth;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    let lo = 8, hi = 80, best = 28;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      ctx.font = `${fontWeight} ${mid}px 'DM Sans', sans-serif`;
      const w = ctx.measureText(sourceText).width;
      if (Math.abs(w - targetW) < 0.5) { best = mid; break; }
      if (w < targetW) lo = mid; else hi = mid;
      best = mid;
    }
    setFontSize(Math.round(best * 10) / 10);
  }, [targetRef.current?.offsetWidth]);
  return fontSize;
}

// ── SVG icons ───────────────────────────────────────────────────
const IconLocation = ({size=14, color="#2D0F6B"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);
const IconCalendar = ({size=18, color="#fff"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);
const IconArrow = ({size=12, color="#6B35C4"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 5l7 7-7 7"/>
  </svg>
);
const IconFire = ({size=14, color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
  </svg>
);
const IconNews = ({size=14, color="currentColor"}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/>
    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6z"/>
  </svg>
);

export default function GoodMorningYoppersReference() {
  const [tab, setTab]         = useState("deals");
  const [shown, setShown]     = useState([false,false,false]);
  const [visible, setVisible] = useState(false);
  const yoppersRef            = useRef(null);
  const gmFontSize            = useMatchWidth(yoppersRef, "Good Morning");

  useEffect(() => {
    setTimeout(() => setVisible(true), 80);
    deals.forEach((_,i) => setTimeout(() => setShown(p => { const n=[...p]; n[i]=true; return n; }), 400+i*150));
  }, []);

  useEffect(() => {
    setShown([false,false,false]);
    deals.forEach((_,i) => setTimeout(() => setShown(p => { const n=[...p]; n[i]=true; return n; }), 60+i*120));
  }, [tab]);

  return (
    <div style={{
      minHeight:"100vh", background:"#F5F3FA",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:"24px 16px", fontFamily:"'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;0,800;1,400&family=Playfair+Display:ital@1&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }

        .card {
          width:100%; max-width:400px; background:#fff;
          border-radius:24px; overflow:hidden;
          box-shadow:0 2px 4px rgba(26,8,64,0.06), 0 12px 40px rgba(26,8,64,0.1);
          opacity:${visible?1:0}; transform:translateY(${visible?"0":"20px"});
          transition:all 0.6s cubic-bezier(0.16,1,0.3,1);
        }

        /* ── HEADER ── */
        .header {
          padding:24px 24px 20px;
          border-bottom:1px solid #F0EBF8;
          position:relative;
        }
        .header::before {
          content:''; position:absolute; top:0; left:0; right:0; height:3px;
          background:linear-gradient(90deg,#1A0840 0%,#6B35C4 60%,#C4A0F4 100%);
        }

        /* Date proéminente */
        .hd-date-row {
          display:flex; align-items:baseline; gap:8px;
          margin-bottom:18px;
        }
        .hd-day {
          font-size:11px; font-weight:800; color:#1A0840;
          letter-spacing:1.5px; text-transform:uppercase;
        }
        .hd-date-rest {
          font-size:11px; font-weight:500; color:#6B35C4;
          letter-spacing:0.3px;
        }
        .hd-edition-no {
          margin-left:auto;
          font-size:10px; font-weight:700; color:#9660E0;
          letter-spacing:0.5px;
        }
        .hd-edition-no::before {
          content:'N°'; opacity:0.6; margin-right:2px;
        }

        /* Titres */
        .hd-titles { display:flex; flex-direction:column; }
        .hd-gm {
          font-weight:800; color:#1A0840;
          line-height:1; letter-spacing:-0.5px;
          white-space:nowrap;
        }
        .hd-yoppers {
          font-size:48px; font-weight:800;
          letter-spacing:-2px; line-height:1;
          white-space:nowrap;
        }
        .hy-yo { color:#1A0840; }
        .hy-pp { color:#6B35C4; }
        .hy-aa { color:#9660E0; }

        /* Zone */
        .hd-zone {
          margin-top:14px;
          display:flex; align-items:center; gap:6px;
        }
        .hd-zone-name {
          font-size:11px; font-weight:700; color:#1A0840;
          letter-spacing:0.5px;
        }
        .hd-dots-mini { display:flex; gap:4px; margin-left:auto; }
        .hd-dot { width:5px; height:5px; border-radius:50%; }

        /* ── TABS ── */
        .tabs {
          display:flex; gap:0; padding:0 24px;
          border-bottom:1px solid #F0EBF8;
        }
        .tab {
          padding:13px 0; margin-right:24px;
          font-size:12px; font-weight:700; letter-spacing:0.3px;
          color:#6B35C4; cursor:pointer; border:none; background:none; outline:none;
          border-bottom:2px solid transparent; transition:all 0.2s ease;
          display:flex; align-items:center; gap:6px;
        }
        .tab.active { color:#1A0840; border-bottom-color:#1A0840; }
        .tab-pill {
          font-size:9px; font-weight:700;
          background:#EDE0FF; color:#2D0F6B;
          padding:1px 6px; border-radius:10px;
        }
        .tab.active .tab-pill { background:#1A0840; color:#fff; }

        /* ── ITEMS ── */
        .items { padding:16px; display:flex; flex-direction:column; gap:10px; }

        .anim { transition:all 0.4s cubic-bezier(0.16,1,0.3,1); }
        .anim.off { opacity:0; transform:translateY(8px); }
        .anim.on  { opacity:1; transform:translateY(0); }

        /* Deal */
        .deal {
          border:1px solid #F0EBF8; border-radius:16px;
          padding:14px 16px; cursor:pointer;
          transition:all 0.2s ease; background:#fff;
        }
        .deal:hover {
          border-color:#6B35C4;
          box-shadow:0 4px 16px rgba(107,53,196,0.08);
          transform:translateY(-1px);
        }
        .deal-top { display:flex; align-items:flex-start; gap:12px; margin-bottom:10px; }
        .deal-emoji-wrap {
          width:40px; height:40px; border-radius:12px;
          background:#F5F3FA; flex-shrink:0;
          display:flex; align-items:center; justify-content:center; font-size:20px;
        }
        .deal-info { flex:1; }
        .deal-commerce {
          font-size:10px; font-weight:700; color:#2D0F6B;
          letter-spacing:0.8px; text-transform:uppercase; margin-bottom:2px;
        }
        .deal-desc { font-size:14px; font-weight:700; color:#1A0840; line-height:1.3; }
        .deal-bottom { display:flex; align-items:center; gap:8px; }
        .deal-prix { font-size:20px; font-weight:800; color:#1A0840; }
        .deal-barre { font-size:12px; color:#9660E0; text-decoration:line-through; }
        .deal-stock {
          margin-left:auto; font-size:9px; font-weight:700;
          padding:3px 8px; border-radius:20px;
        }
        .s-urgent { background:#FFF2F2; color:#CC3333; }
        .s-normal { background:#EDE0FF; color:#2D0F6B; }

        /* Actu */
        .actu {
          border:1px solid #F0EBF8; border-radius:16px;
          padding:14px 16px; cursor:pointer;
          transition:all 0.2s ease;
        }
        .actu:hover {
          border-color:#6B35C4;
          box-shadow:0 4px 16px rgba(107,53,196,0.08);
          transform:translateY(-1px);
        }
        .actu-top { display:flex; align-items:center; gap:10px; margin-bottom:8px; }
        .actu-emoji-wrap {
          width:32px; height:32px; border-radius:10px;
          background:#F5F3FA; flex-shrink:0;
          display:flex; align-items:center; justify-content:center; font-size:15px;
        }
        .actu-commerce {
          font-size:10px; font-weight:700; color:#2D0F6B;
          letter-spacing:0.8px; text-transform:uppercase;
        }
        .actu-cat { font-size:10px; color:#6B35C4; }
        .actu-line { height:1px; background:#F0EBF8; margin-bottom:10px; }
        .actu-text {
          font-family:'Playfair Display',serif; font-style:italic;
          font-size:13px; color:#2D0F6B; line-height:1.55;
          margin-bottom:10px;
        }
        .actu-lire {
          display:inline-flex; align-items:center; gap:5px;
          font-size:10px; font-weight:700; color:#6B35C4;
          letter-spacing:0.5px; text-transform:uppercase;
        }

        /* ── COMBINED FOOTER ── */
        .combined-footer {
          background:#1A0840;
          padding:14px 20px;
          display:flex; align-items:center; gap:12px;
        }
        .cf-icon {
          width:36px; height:36px; border-radius:10px;
          background:rgba(196,160,244,0.15);
          display:flex; align-items:center; justify-content:center;
          flex-shrink:0;
        }
        .cf-msg {
          flex:1; min-width:0;
          font-size:11px; color:rgba(255,255,255,0.7); line-height:1.4;
        }
        .cf-msg strong { color:#fff; font-weight:700; }
        .cf-cta {
          font-size:11px; font-weight:700; color:#1A0840;
          background:#C4A0F4; padding:7px 14px; border-radius:20px;
          border:none; cursor:pointer; transition:background 0.2s;
          letter-spacing:0.3px; flex-shrink:0;
        }
        .cf-cta:hover { background:#EDE0FF; }

        /* Yoppaa logo discret en bas */
        .signature {
          padding:10px 24px;
          display:flex; align-items:center; justify-content:center;
          gap:6px; background:#1A0840;
          border-top:1px solid rgba(196,160,244,0.1);
        }
        .sig-label {
          font-size:9px; font-weight:500;
          color:rgba(196,160,244,0.5);
          letter-spacing:1.5px; text-transform:uppercase;
        }
        .sig-logo {
          font-size:13px; font-weight:800; letter-spacing:-0.5px;
        }
        .sl-yo { color:#fff; }
        .sl-pp { color:#C4A0F4; }
        .sl-aa { color:#9660E0; }
      `}</style>

      <div className="card">

        {/* HEADER */}
        <div className="header">
          <div className="hd-date-row">
            <div className="hd-day">{dayShort}</div>
            <div className="hd-date-rest">{dateRest}</div>
            <div className="hd-edition-no">{editionNb}</div>
          </div>

          <div className="hd-titles">
            <div className="hd-gm" style={{fontSize: gmFontSize}}>
              Good Morning
            </div>
            <div className="hd-yoppers" ref={yoppersRef}>
              <span className="hy-yo">Yo</span>
              <span className="hy-pp">pp</span>
              <span className="hy-aa">ers</span>
            </div>
          </div>

          <div className="hd-zone">
            <IconLocation size={13} color="#6B35C4"/>
            <div className="hd-zone-name">Mettet</div>
            <div className="hd-dots-mini">
              <div className="hd-dot" style={{background:"#1A0840"}}/>
              <div className="hd-dot" style={{background:"#6B35C4"}}/>
              <div className="hd-dot" style={{background:"#9660E0"}}/>
            </div>
          </div>
        </div>

        {/* TABS */}
        <div className="tabs">
          <button className={`tab ${tab==="deals"?"active":""}`} onClick={()=>setTab("deals")}>
            <IconFire size={13} color="currentColor"/> Deals
            <span className="tab-pill">{deals.length}</span>
          </button>
          <button className={`tab ${tab==="actus"?"active":""}`} onClick={()=>setTab("actus")}>
            <IconNews size={13} color="currentColor"/> Actus
            <span className="tab-pill">{deals.length}</span>
          </button>
        </div>

        {/* CONTENT */}
        <div className="items">
          {tab==="deals" && deals.map((d,i) => {
            const isUrgent = d.stock <= 5;
            return (
              <div key={i} className={`anim ${shown[i]?"on":"off"}`}
                style={{transitionDelay:`${i*55}ms`}}>
                <div className="deal">
                  <div className="deal-top">
                    <div className="deal-emoji-wrap">{d.type}</div>
                    <div className="deal-info">
                      <div className="deal-commerce">{d.commerce}</div>
                      <div className="deal-desc">{d.deal}</div>
                    </div>
                  </div>
                  <div className="deal-bottom">
                    <div className="deal-prix">{d.prix}</div>
                    <div className="deal-barre">{d.prixNormal}</div>
                    <div className={`deal-stock ${isUrgent?"s-urgent":"s-normal"}`}>
                      {isUrgent?"⚡ ":""}{d.stock} restants
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {tab==="actus" && deals.map((d,i) => (
            <div key={i} className={`anim ${shown[i]?"on":"off"}`}
              style={{transitionDelay:`${i*55}ms`}}>
              <div className="actu">
                <div className="actu-top">
                  <div className="actu-emoji-wrap">{d.type}</div>
                  <div>
                    <div className="actu-commerce">{d.commerce}</div>
                    <div className="actu-cat">{d.categorie}</div>
                  </div>
                </div>
                <div className="actu-line"/>
                <div className="actu-text">"{d.actu}"</div>
                <div className="actu-lire">
                  Lire <IconArrow size={11} color="#6B35C4"/>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* COMBINED FOOTER : message + CTA */}
        <div className="combined-footer">
          <div className="cf-icon">
            <IconCalendar size={18} color="#C4A0F4"/>
          </div>
          <div className="cf-msg">
            Rendez-vous <strong>{tomorrowStr}</strong> à <strong>07h30</strong> pour de nouveaux deals.
          </div>
          <button className="cf-cta">Explorer</button>
        </div>

        {/* SIGNATURE */}
        <div className="signature">
          <div className="sig-label">propulsé par</div>
          <div className="sig-logo">
            <span className="sl-yo">yo</span>
            <span className="sl-pp">pp</span>
            <span className="sl-aa">aa</span>
          </div>
        </div>

      </div>
    </div>
  );
}
