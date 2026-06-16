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

const FROM        = process.env.RESEND_FROM || 'Yoppaa <onboarding@resend.dev>'
const ADMIN_EMAIL = 'alexandre@avcotech.be'

// Lazy init du client Resend : instancié à la première utilisation, pas à
// l'import du module. Évite que les builds Preview Vercel (sans RESEND_API_KEY
// configurée) plantent à la collecte des pages.
let _resendClient = null
function getResendClient() {
  if (_resendClient) return _resendClient
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }
  _resendClient = new Resend(apiKey)
  return _resendClient
}

// Wrapper : on log les erreurs Resend pour faciliter debug mais on ne plante
// pas l'API route (l'email est non bloquant pour la validation).
// attachments : tableau optionnel { filename, content (base64), content_type } — utile pour les iCal RDV.
async function envoyer({ to, subject, html, attachments = null }) {
  try {
    const resend = getResendClient()
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
// Exportée pour permettre aux templates externes (billing-emails, etc.) de
// composer du body HTML avec la même palette Yoppaa que le layout.
export const C = {
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
// Exporté pour permettre aux modules externes (billing-emails, etc.) de
// composer leurs propres templates Yoppaa-branded.
export function layout({ title, intro, body, ctaUrl, ctaLabel }) {
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

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES RDV (Sprint A — 2026-06-07)
// ═══════════════════════════════════════════════════════════════════════════

// Helper formatage date FR : "lundi 15 juin 2026"
// Exporté pour billing-emails et autres modules de templates.
export function formatDateFr(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// 4) Email AU YOPPER : RDV confirmé (iCal joint)
//    Envoyé après webhook payment_intent.succeeded OU insert direct sans acompte.
export function emailRdvConfirme({
  yopper_prenom, commercant_nom, commercant_adresse, commercant_slug,
  prestation_nom, date_rdv, heure_debut, heure_fin, duree_minutes,
  prix_estime, acompte_paye, acompte_montant, delai_annulation_heures = 24,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/rdv/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  const solde = (prix_estime != null && acompte_montant != null) ? (Number(prix_estime) - Number(acompte_montant)) : null
  return layout({
    title: 'Ton RDV est confirmé',
    intro: `<strong>${yopper_prenom}</strong>, ton rendez-vous chez <strong>${commercant_nom}</strong> est bien confirmé. À très vite 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Quand</p>
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_rdv)}</p>
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'} (${duree_minutes || '?'} min)</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Prestation</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${prestation_nom || '—'}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Adresse</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${commercant_adresse || '—'}</td></tr>
        ${prix_estime != null ? `<tr><td style="padding:10px 14px;color:${C.muted};${acompte_paye ? `border-bottom:1px solid ${C.pale};` : ''}">Prix estimé</td><td style="padding:10px 14px;color:${C.main};font-weight:900;text-align:right;${acompte_paye ? `border-bottom:1px solid ${C.pale};` : ''}">${Number(prix_estime).toFixed(2)} €</td></tr>` : ''}
        ${acompte_paye ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Acompte payé</td><td style="padding:10px 14px;color:#10B981;font-weight:800;text-align:right;border-bottom:1px solid ${C.pale};">✓ ${Number(acompte_montant).toFixed(2)} €</td></tr>` : ''}
        ${solde != null && solde > 0 ? `<tr><td style="padding:10px 14px;color:${C.muted};">Solde sur place</td><td style="padding:10px 14px;color:${C.deep};font-weight:800;text-align:right;">${solde.toFixed(2)} €</td></tr>` : ''}
      </table>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${C.ink};">
        Tout est prêt 🟣 Tu peux ajouter ce RDV à ton calendrier dès maintenant.
      </p>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1.5px dashed ${C.main}44;margin-bottom:6px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">📅 Ajout au calendrier</p>
        <p style="margin:0;font-size:12px;color:${C.deep};line-height:1.55;">Un fichier <strong>.ics</strong> est joint à cet email. Ouvre-le pour ajouter le RDV à ton calendrier (Apple, Google, Outlook). Rappel automatique 24h avant.</p>
      </div>
      <p style="margin:14px 0 0;font-size:11px;color:${C.muted};line-height:1.55;">
        ⏰ Annulation/modification possible jusqu'à ${delai_annulation_heures}h avant le RDV depuis ton espace Yopper.
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Voir mon RDV sur Yoppaa',
  })
}

// 5) Email AU YOPPER : RDV annulé (iCal CANCEL joint)
export function emailRdvAnnule({
  yopper_prenom, commercant_nom, commercant_slug,
  prestation_nom, date_rdv, heure_debut,
  acompte_paye, acompte_montant, refund_en_cours, raison_annulation,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/rdv/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  const raisonLabel = raison_annulation === 'commercant'
    ? `Annulé par <strong>${commercant_nom}</strong>`
    : raison_annulation === 'auto'
      ? 'Annulé automatiquement (paiement non finalisé)'
      : 'Annulé à ta demande'
  return layout({
    title: 'Ton RDV a été annulé',
    intro: `<strong>${yopper_prenom}</strong>, ton rendez-vous du <strong>${formatDateFr(date_rdv)} à ${heure_debut?.slice(0,5) || '?'}</strong> chez <strong>${commercant_nom}</strong> est annulé.`,
    body: `
      <div style="background:#FEF2F2;border-left:4px solid #DC2626;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#991B1B;text-transform:uppercase;letter-spacing:0.7px;">Motif</p>
        <p style="margin:0;font-size:14px;color:#7F1D1D;font-weight:600;">${raisonLabel}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#991B1B;">Prestation : ${prestation_nom || '—'}</p>
      </div>
      ${acompte_paye && acompte_montant ? `
      <div style="background:${refund_en_cours ? '#ECFDF5' : '#FFF7ED'};border-left:4px solid ${refund_en_cours ? '#10B981' : '#EA580C'};border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${refund_en_cours ? '#065F46' : '#9A3412'};text-transform:uppercase;letter-spacing:0.7px;">${refund_en_cours ? '💸 Remboursement en cours' : '⚠ Remboursement à voir'}</p>
        <p style="margin:0;font-size:13px;color:${refund_en_cours ? '#065F46' : '#7C2D12'};line-height:1.55;font-weight:600;">
          ${refund_en_cours
            ? `<strong>${Number(acompte_montant).toFixed(2)} €</strong> seront recrédités sur ta carte sous 5 à 10 jours ouvrés.`
            : `Acompte payé : <strong>${Number(acompte_montant).toFixed(2)} €</strong>. Contacte le commerçant si tu as une question.`}
        </p>
      </div>` : ''}
      <p style="margin:0 0 4px;font-size:13px;color:${C.ink};line-height:1.6;">
        Le RDV a été automatiquement retiré de ton calendrier (un fichier .ics d'annulation est joint à cet email).
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Reprendre un RDV',
  })
}

// 6) Email AU YOPPER : rappel J-1 (cron quotidien 9h)
export function emailRdvReminder({
  yopper_prenom, commercant_nom, commercant_adresse, commercant_slug,
  prestation_nom, date_rdv, heure_debut, heure_fin, duree_minutes,
  solde_a_prevoir, delai_annulation_heures = 24,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/rdv/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  const mapsUrl = commercant_adresse ? `https://www.google.com/maps/search/${encodeURIComponent(commercant_adresse)}` : null
  return layout({
    title: 'Rappel — RDV demain',
    intro: `<strong>${yopper_prenom}</strong>, petit rappel : tu as un RDV chez <strong>${commercant_nom}</strong> demain ${formatDateFr(date_rdv).split(' ').slice(0,3).join(' ')} à <strong>${heure_debut?.slice(0,5) || '?'}</strong> 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'} (${duree_minutes || '?'} min)</p>
        <p style="margin:6px 0 0;font-size:13px;color:${C.deep};font-weight:700;">${prestation_nom || '—'}</p>
        ${commercant_adresse ? `<p style="margin:6px 0 0;font-size:12px;color:${C.muted};">📍 ${commercant_adresse}</p>` : ''}
      </div>
      ${solde_a_prevoir != null && solde_a_prevoir > 0 ? `
      <div style="background:#FFFBEB;border:1px solid #F59E0B33;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0;font-size:13px;color:#78350F;font-weight:700;">💰 Solde à régler sur place : <strong>${Number(solde_a_prevoir).toFixed(2)} €</strong></p>
      </div>` : ''}
      ${mapsUrl ? `
      <div style="text-align:center;margin-bottom:14px;">
        <a href="${mapsUrl}" style="display:inline-block;padding:10px 18px;background:#fff;color:${C.main};border:1.5px solid ${C.main};border-radius:100px;font-weight:800;font-size:13px;text-decoration:none;">📍 Itinéraire Google Maps</a>
      </div>` : ''}
      <p style="margin:0;font-size:11px;color:${C.muted};line-height:1.55;text-align:center;">
        ⏰ Le délai d'annulation (${delai_annulation_heures}h avant) est probablement dépassé. En cas d'urgence, contacte directement ${commercant_nom}.
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Voir mon RDV',
  })
}

// 7) Email AU YOPPER : progression fidélité (après chaque RDV honoré)
export function emailFideliteProgression({
  yopper_prenom, commercant_nom, commercant_slug,
  points_actuels, seuil, pourcent_recompense,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/rdv/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  const pourcent = Math.max(0, Math.min(100, Math.round((points_actuels / seuil) * 100)))
  const restants = Math.max(0, seuil - points_actuels)
  return layout({
    title: 'Tu progresses sur ta fidélité ⭐',
    intro: `<strong>${yopper_prenom}</strong>, ton RDV chez <strong>${commercant_nom}</strong> a été marqué comme honoré. Tu as gagné un point fidélité 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:20px;border:1px solid ${C.main}22;margin-bottom:14px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Ta progression</p>
        <p style="margin:0;font-size:36px;font-weight:900;color:${C.ink};letter-spacing:-1.5px;line-height:1;">${points_actuels} / ${seuil}</p>
        <div style="margin:14px auto 4px;max-width:260px;height:10px;background:#fff;border-radius:100px;overflow:hidden;border:1px solid ${C.pale};">
          <div style="width:${pourcent}%;height:100%;background:linear-gradient(90deg,${C.main} 0%,${C.mid} 60%,${C.light} 100%);border-radius:100px;"></div>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:${C.deep};font-weight:600;">
          ${restants > 0 ? `Plus que <strong>${restants}</strong> RDV pour débloquer <strong>${pourcent_recompense}%</strong> de réduction !` : 'Récompense débloquée 🎉'}
        </p>
      </div>
      <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.6;text-align:center;">
        Merci d'être fidèle à <strong>${commercant_nom}</strong> 🟣
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Reprendre un RDV',
  })
}

// 8) Email AU YOPPER : récompense fidélité débloquée (au seuil atteint, distinct du 7)
export function emailFideliteRecompenseDebloquee({
  yopper_prenom, commercant_nom, commercant_slug,
  pourcent_recompense, code_promo,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/rdv/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  return layout({
    title: 'Récompense débloquée 🎉',
    intro: `<strong>${yopper_prenom}</strong>, tu viens de débloquer ta récompense fidélité chez <strong>${commercant_nom}</strong> 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:24px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Ta récompense</p>
        <p style="margin:0;font-size:48px;font-weight:900;letter-spacing:-2px;line-height:1;">-${pourcent_recompense}%</p>
        <p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.9;">à ton prochain RDV chez ${commercant_nom}</p>
      </div>
      ${code_promo ? `
      <div style="background:#fff;border:2px dashed ${C.main};border-radius:12px;padding:14px;margin-bottom:14px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Code à présenter</p>
        <p style="margin:0;font-size:22px;font-weight:900;color:${C.main};letter-spacing:2px;font-family:monospace;">${code_promo}</p>
      </div>` : ''}
      <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.6;text-align:center;">
        La récompense s'applique automatiquement à ton prochain RDV. Profite bien 🟣
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Réserver mon prochain RDV',
  })
}

// 9) Email AU COMMERÇANT : nouveau RDV (mode 'chaque')
export function emailNouveauRdvCommercant({
  nom_commercant, yopper_prenom, yopper_nom, yopper_email, yopper_telephone,
  prestation_nom, date_rdv, heure_debut, heure_fin, duree_minutes,
  prix_estime, acompte_paye, acompte_montant, notes_client,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  return layout({
    title: 'Nouveau RDV reçu',
    intro: `<strong>${nom_commercant}</strong>, un client vient de réserver un RDV ! 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_rdv)}</p>
        <p style="margin:4px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'} (${duree_minutes || '?'} min)</p>
        <p style="margin:8px 0 0;font-size:13px;color:${C.main};font-weight:800;">${prestation_nom || '—'}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Client</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${yopper_prenom || ''} ${yopper_nom || ''}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Email</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};font-size:12px;">${yopper_email || '—'}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};${prix_estime != null ? `border-bottom:1px solid ${C.pale};` : ''}">Téléphone</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;${prix_estime != null ? `border-bottom:1px solid ${C.pale};` : ''}">${yopper_telephone || '—'}</td></tr>
        ${prix_estime != null ? `<tr><td style="padding:10px 14px;color:${C.muted};${acompte_paye ? `border-bottom:1px solid ${C.pale};` : ''}">Prix estimé</td><td style="padding:10px 14px;color:${C.main};font-weight:900;text-align:right;${acompte_paye ? `border-bottom:1px solid ${C.pale};` : ''}">${Number(prix_estime).toFixed(2)} €</td></tr>` : ''}
        ${acompte_paye ? `<tr><td style="padding:10px 14px;color:${C.muted};">Acompte payé en ligne</td><td style="padding:10px 14px;color:#10B981;font-weight:800;text-align:right;">✓ ${Number(acompte_montant).toFixed(2)} €</td></tr>` : ''}
      </table>
      ${notes_client ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">Note du client</p>
        <p style="margin:0;font-size:13px;color:#7C2D12;font-weight:600;line-height:1.5;">${notes_client}</p>
      </div>` : ''}
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Voir dans mon dashboard',
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES COMMANDES C&C ALIM (Sprint A bis — 2026-06-07)
// ═══════════════════════════════════════════════════════════════════════════

// Helper rendu liste articles commande
function renderArticlesRows(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return ''
  return articles.map(a => `
    <tr>
      <td style="padding:8px 14px;color:${C.ink};font-size:13px;border-bottom:1px solid ${C.pale};">
        <strong>${a.quantite || 1}×</strong> ${a.nom || '—'}
        ${a.option_libelle ? `<br/><span style="color:${C.muted};font-size:11px;">${a.option_libelle}</span>` : ''}
      </td>
      <td style="padding:8px 14px;color:${C.ink};font-size:13px;text-align:right;font-weight:700;border-bottom:1px solid ${C.pale};white-space:nowrap;">${a.prix_total != null ? Number(a.prix_total).toFixed(2) + ' €' : ''}</td>
    </tr>
  `).join('')
}

// 11) Email AU YOPPER : commande confirmée
export function emailCommandeConfirmee({
  yopper_prenom, commercant_nom, commercant_adresse, commercant_slug,
  numero_commande, articles, total, date_retrait, heure_debut, heure_fin,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  return layout({
    title: 'Ta commande est confirmée',
    intro: `<strong>${yopper_prenom}</strong>, ta commande chez <strong>${commercant_nom}</strong> est bien enregistrée 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Retrait prévu</p>
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_retrait)}</p>
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'}</p>
        ${numero_commande ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Commande <strong style="color:${C.main};">#${numero_commande}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${renderArticlesRows(articles)}
        ${total != null ? `<tr><td style="padding:12px 14px;color:${C.ink};font-size:14px;font-weight:900;background:${C.bg};">Total</td><td style="padding:12px 14px;color:${C.main};font-size:16px;font-weight:900;text-align:right;background:${C.bg};">${Number(total).toFixed(2)} €</td></tr>` : ''}
      </table>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📍 Adresse de retrait</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${commercant_adresse || '—'}</p>
      </div>
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;">
        🔔 Tu recevras un nouvel email dès que ta commande sera <strong>prête à retirer</strong>.
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Voir ma commande',
  })
}

// 12) Email AU YOPPER : commande prête à retirer (quand commercant passe statut → 'pret')
export function emailCommandePrete({
  yopper_prenom, commercant_nom, commercant_adresse, commercant_slug,
  numero_commande, heure_debut, heure_fin,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  const mapsUrl = commercant_adresse ? `https://www.google.com/maps/search/${encodeURIComponent(commercant_adresse)}` : null
  return layout({
    title: 'Ta commande est prête 🎉',
    intro: `<strong>${yopper_prenom}</strong>, c'est prêt ! Ta commande chez <strong>${commercant_nom}</strong> t'attend 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Prête à retirer</p>
        ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
        <p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'}</p>
      </div>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📍 Adresse</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${commercant_adresse || '—'}</p>
      </div>
      ${mapsUrl ? `
      <div style="text-align:center;margin-bottom:14px;">
        <a href="${mapsUrl}" style="display:inline-block;padding:10px 18px;background:#fff;color:${C.main};border:1.5px solid ${C.main};border-radius:100px;font-weight:800;font-size:13px;text-decoration:none;">📍 Itinéraire Google Maps</a>
      </div>` : ''}
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;text-align:center;">
        À tout de suite 🟣
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Voir ma commande',
  })
}

// 13) Email AU COMMERÇANT : nouvelle commande C&C (mode 'chaque')
export function emailNouvelleCommandeCommercant({
  nom_commercant, yopper_prenom, yopper_nom, yopper_email, yopper_telephone,
  numero_commande, articles, total, date_retrait, heure_debut, heure_fin,
  notes_client,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  return layout({
    title: 'Nouvelle commande reçue',
    intro: `<strong>${nom_commercant}</strong>, un client vient de passer commande ! 🛒`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Retrait</p>
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_retrait)}</p>
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'}</p>
        ${numero_commande ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Commande <strong style="color:${C.main};">#${numero_commande}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Client</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${yopper_prenom || ''} ${yopper_nom || ''}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Email</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};font-size:12px;">${yopper_email || '—'}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};">Téléphone</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;">${yopper_telephone || '—'}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${renderArticlesRows(articles)}
        ${total != null ? `<tr><td style="padding:12px 14px;color:${C.ink};font-size:14px;font-weight:900;background:${C.bg};">Total</td><td style="padding:12px 14px;color:${C.main};font-size:16px;font-weight:900;text-align:right;background:${C.bg};">${Number(total).toFixed(2)} €</td></tr>` : ''}
      </table>
      ${notes_client ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">Note du client</p>
        <p style="margin:0;font-size:13px;color:#7C2D12;font-weight:600;line-height:1.5;">${notes_client}</p>
      </div>` : ''}
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Voir dans mon dashboard',
  })
}

// 14) Email AU COMMERÇANT : récap matinal des commandes du jour (cron 8h, mode 'recap_jour')
export function emailRecapCommandesJour({
  nom_commercant, date_jour, commandes,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  const total = Array.isArray(commandes) ? commandes.length : 0
  const dateLabel = date_jour ? formatDateFr(date_jour) : 'aujourd\'hui'

  const rows = (commandes || []).map(c => `
    <tr>
      <td style="padding:10px 14px;color:${C.main};font-weight:900;font-size:14px;border-bottom:1px solid ${C.pale};white-space:nowrap;">${c.heure_debut?.slice(0,5) || '?'}</td>
      <td style="padding:10px 14px;color:${C.ink};font-weight:700;font-size:13px;border-bottom:1px solid ${C.pale};">
        ${c.yopper_prenom || ''} ${c.yopper_nom || ''}
        ${c.numero_commande ? `<span style="color:${C.muted};font-weight:500;font-size:11px;"> · #${c.numero_commande}</span>` : ''}
        <br/><span style="color:${C.muted};font-weight:500;font-size:11px;">${c.nb_articles || '?'} article(s)</span>
      </td>
      <td style="padding:10px 14px;color:${C.main};font-weight:900;font-size:13px;text-align:right;border-bottom:1px solid ${C.pale};white-space:nowrap;">${c.total != null ? Number(c.total).toFixed(2) + ' €' : ''}</td>
    </tr>
  `).join('')

  return layout({
    title: `${total} commande${total !== 1 ? 's' : ''} ${dateLabel.split(' ').slice(1,3).join(' ')}`,
    intro: `Bonjour <strong>${nom_commercant}</strong>, voici tes commandes pour <strong>${dateLabel}</strong> 🟣`,
    body: total === 0
      ? `<p style="margin:0;font-size:14px;color:${C.muted};line-height:1.6;text-align:center;padding:24px 0;">📭 Aucune commande aujourd'hui. Bonne journée !</p>`
      : `
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${rows}
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:${C.muted};line-height:1.55;text-align:center;">
        Tu peux changer la fréquence de ces emails dans ton dashboard → Profil → Notifications commandes.
      </p>
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Ouvrir mon dashboard',
  })
}

// 10) Email AU COMMERÇANT : récap matinal des RDV du jour (cron 8h, mode 'recap_jour')
export function emailRecapRdvJour({
  nom_commercant, date_jour, rdvs,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  const total = Array.isArray(rdvs) ? rdvs.length : 0
  const dateLabel = date_jour ? formatDateFr(date_jour) : 'aujourd\'hui'

  const rdvsRows = (rdvs || []).map(r => `
    <tr>
      <td style="padding:10px 14px;color:${C.main};font-weight:900;font-size:14px;border-bottom:1px solid ${C.pale};white-space:nowrap;">${r.heure_debut?.slice(0,5) || '?'}</td>
      <td style="padding:10px 14px;color:${C.ink};font-weight:700;font-size:13px;border-bottom:1px solid ${C.pale};">
        ${r.yopper_prenom || ''} ${r.yopper_nom || ''}
        <br/><span style="color:${C.muted};font-weight:500;font-size:11px;">${r.prestation_nom || '—'} · ${r.duree_minutes || '?'} min</span>
      </td>
      <td style="padding:10px 14px;color:${C.muted};font-size:11px;text-align:right;border-bottom:1px solid ${C.pale};">${r.yopper_telephone || ''}</td>
    </tr>
  `).join('')

  return layout({
    title: `${total} RDV ${dateLabel.split(' ').slice(1,3).join(' ')}`,
    intro: `Bonjour <strong>${nom_commercant}</strong>, voici tes RDV pour <strong>${dateLabel}</strong> 🟣`,
    body: total === 0
      ? `<p style="margin:0;font-size:14px;color:${C.muted};line-height:1.6;text-align:center;padding:24px 0;">📭 Aucun RDV aujourd'hui. Bonne journée !</p>`
      : `
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${rdvsRows}
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:${C.muted};line-height:1.55;text-align:center;">
        Tu peux changer la fréquence de ces emails dans ton dashboard → Profil → Notifications RDV.
      </p>
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Ouvrir mon dashboard',
  })
}
