import type { NextConfig } from "next";

// ─── Sécurité : en-têtes HTTP globaux (Sprint 3 Sécurité MVP, protection #5) ──
//
// Tiers réellement chargés côté navigateur (recensés dans le code) :
//   • Scripts : OneSignal (cdn.onesignal.com), Turnstile (challenges.cloudflare.com)
//   • Styles/fonts : Google Fonts (fonts.googleapis.com + fonts.gstatic.com)
//   • connect (XHR/WebSocket) : Supabase (REST + realtime wss), OneSignal, Turnstile
//   • Images : Supabase Storage + data/blob (photos commerçants)
//   • Pas de Stripe.js embarqué (Checkout = redirection top-level, non soumise à la CSP)
//
// 'unsafe-inline' est requis : l'app utilise des styles inline partout et Next
// injecte des scripts inline sans nonce. 'unsafe-eval' n'est ajouté qu'en DEV
// (HMR de Next en a besoin), jamais en prod.

const isDev = process.env.NODE_ENV !== "production";

// Origine Supabase dérivée de l'env pour autoriser REST + WebSocket realtime.
let supabaseOrigin = "";
let supabaseWss = "";
try {
  const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  supabaseOrigin = u.origin;
  supabaseWss = `wss://${u.host}`;
} catch {
  // NEXT_PUBLIC_SUPABASE_URL absente au build : on laisse vide (connect-src 'self').
}

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://cdn.onesignal.com https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWss} https://api.onesignal.com https://*.onesignal.com https://*.os.tc https://challenges.cloudflare.com${isDev ? " ws:" : ""}`,
  "frame-src 'self' https://challenges.cloudflare.com https://*.onesignal.com",
  "worker-src 'self' blob:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
]
  .filter(Boolean)
  .join("; ")
  .replace(/\s+/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // HSTS : force HTTPS 2 ans (ignoré par les navigateurs sur localhost/HTTP).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Anti-clickjacking (l'aperçu MobileFrame reste autorisé car same-origin).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Géoloc autorisée (détection de commune) ; caméra/micro bloqués.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(self), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
