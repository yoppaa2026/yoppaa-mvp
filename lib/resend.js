// Helper Resend centralisé : un seul endroit pour configurer l'expéditeur,
// gérer les erreurs, et templater les emails Yoppaa.
//
// Configuration :
// - RESEND_API_KEY (obligatoire) → clé API depuis resend.com
// - RESEND_FROM (optionnel)      → expéditeur, ex "Yoppaa <noreply@yoppaa.app>"
//                                   Si vide, fallback sandbox onboarding@resend.dev
//                                   (qui n'envoie qu'à l'email du compte Resend).
//
// L'email admin Yoppaa est hardcodé sur alexandre@avcotech.be (brief projet).

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM        = process.env.RESEND_FROM || 'Yoppaa <onboarding@resend.dev>'
const ADMIN_EMAIL = 'alexandre@avcotech.be'

// Wrapper : on log les erreurs Resend pour faciliter debug mais on ne plante
// pas l'API route (l'email est non bloquant pour la validation).
// attachments : tableau optionnel { filename, content (base64), content_type } — utile pour les iCal RDV.
async function envoyer({ to, subject, html, attachments = null }) {
  try {
    const payload = { from: FROM, to, subject, html }
    if (attachments && attachments.length > 0) payload.attachments = attachments
    const { data, error } = await resend.emails.send(payload)
    if (error) {
      console.error('[resend] échec envoi', { to, subject, error })
      return { ok: false, error }
    }
    return { ok: true, id: data?.id }
  } catch (e) {
    console.error('[resend] exception envoi', { to, subject, e })
    return { ok: false, error: e?.message || String(e) }
  }
}

export async function envoyerAuAdmin({ subject, html, attachments }) {
  return envoyer({ to: ADMIN_EMAIL, subject, html, attachments })
}

export async function envoyerAuCommercant({ to, subject, html, attachments }) {
  return envoyer({ to, subject, html, attachments })
}

// ─── PALETTE HTML pour les templates email ─────────────────────────────────
const C = {
  bg:      '#F8F6FF',
  ink:     '#1A0840',
  panel:   '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  muted:   '#6B7280',
}

// Layout commun : header violet foncé + corps blanc + footer discret.
// Inline styles uniquement (les clients mail ignorent souvent <style>).
function layout({ title, intro, body, ctaUrl, ctaLabel }) {
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${C.ink};">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:linear-gradient(135deg,${C.panel} 0%,#2D0F6B 60%,${C.ink} 100%);border-radius:18px 18px 0 0;padding:28px 28px 22px;">
      <div style="display:flex;gap:5px;margin-bottom:10px;">
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#fff;opacity:0.5;"></span>
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${C.light};"></span>
        <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${C.mid};"></span>
      </div>
      <p style="margin:0;color:#fff;font-weight:900;font-size:26px;letter-spacing:-1.2px;line-height:1;">yoppaa</p>
      <p style="margin:6px 0 0;color:${C.light};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="background:#fff;border-radius:0 0 18px 18px;padding:28px;border:1px solid ${C.pale};border-top:none;">
      ${intro ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:${C.ink};">${intro}</p>` : ''}
      ${body}
      ${ctaUrl && ctaLabel ? `
        <p style="margin:24px 0 0;text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;background:linear-gradient(135deg,${C.panel},${C.main});color:#fff;text-decoration:none;border-radius:100px;font-weight:800;font-size:15px;letter-spacing:-0.2px;">
            ${ctaLabel} →
          </a>
        </p>
      ` : ''}
    </div>
    <p style="margin:18px 0 0;text-align:center;font-size:11px;color:${C.muted};">
      yoppaa.app · Skip the wait · Tu reçois cet email parce que tu es inscrit comme commerçant.
    </p>
  </div>
</body>
</html>`
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES SPÉCIFIQUES
// ═══════════════════════════════════════════════════════════════════════════

// 1) Email à TOI (admin) quand un nouveau commerçant soumet son onboarding
export function emailNouveauCommercantAValider({ nom, type, plan, score, success_pack, commercant_id }) {
  const adminUrl = 'https://yoppaa.app/admin'
  return layout({
    title: 'Nouveau commerçant à valider',
    intro: `<strong>${nom}</strong> vient de soumettre son inscription Yoppaa Pro et attend ta validation.`,
    body: `
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Récap</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:5px 0;color:${C.muted};">Type</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${type || '—'}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">Plan</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${(plan || 'on').toUpperCase()}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">Score profil</td><td style="padding:5px 0;color:${score >= 80 ? '#10B981' : score >= 60 ? '#EA580C' : '#DC2626'};font-weight:800;text-align:right;">${score} / 100</td></tr>
          ${success_pack ? `<tr><td style="padding:5px 0;color:${C.muted};">Success Pack</td><td style="padding:5px 0;color:${C.main};font-weight:800;text-align:right;">${success_pack.toUpperCase()}</td></tr>` : ''}
          <tr><td style="padding:5px 0;color:${C.muted};">ID interne</td><td style="padding:5px 0;color:${C.muted};font-size:11px;text-align:right;font-family:monospace;">${commercant_id || '—'}</td></tr>
        </table>
      </div>
    `,
    ctaUrl: adminUrl,
    ctaLabel: 'Valider depuis /admin',
  })
}

// 2) Email AU COMMERÇANT quand sa demande est validée → sa page est live
export function emailValidationCommercant({ nom, slug }) {
  const ficheUrl     = slug ? `https://yoppaa.app/commander/${slug}` : 'https://yoppaa.app/commander'
  const dashboardUrl = 'https://yoppaa.app/dashboard'
  return layout({
    title: 'Bienvenue dans la tribu Yoppaa',
    intro: `Bonne nouvelle <strong>${nom}</strong> — ta page Yoppaa est <strong style="color:${C.main};">en ligne</strong> dès maintenant.`,
    body: `
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        Tes premiers clients peuvent déjà te trouver, voir tes horaires, et te contacter directement depuis ta fiche.
      </p>
      <div style="background:${C.bg};border-radius:12px;padding:16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Ta fiche publique</p>
        <p style="margin:0;font-size:13px;color:${C.main};font-weight:700;word-break:break-all;">
          <a href="${ficheUrl}" style="color:${C.main};text-decoration:none;">${ficheUrl}</a>
        </p>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${C.ink};">
        Conseil : depuis ton dashboard, complète ton menu, ajoute un deal ou une actu pour booster ton trafic dès cette semaine.
      </p>
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Ouvrir mon dashboard',
  })
}

// 3) Email AU COMMERÇANT quand sa demande est rejetée → motif + lien retour
export function emailRejetCommercant({ nom, motif }) {
  const signupUrl = 'https://yoppaa.app/signup'
  return layout({
    title: 'Demande à compléter',
    intro: `Bonjour <strong>${nom}</strong>, ta demande Yoppaa Pro nécessite quelques ajustements avant qu'on puisse activer ta page.`,
    body: `
      <div style="background:#FFF7ED;border-left:4px solid #EA580C;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#9A3412;text-transform:uppercase;letter-spacing:0.7px;">Motif</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#7C2D12;font-weight:600;">${motif || 'Profil incomplet — voir détails depuis ton onboarding.'}</p>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${C.ink};">
        Reviens sur ton onboarding pour corriger ces points, puis soumets à nouveau. On valide en moins de 24h une fois les ajustements faits.
      </p>
    `,
    ctaUrl: signupUrl,
    ctaLabel: 'Compléter ma demande',
  })
}
