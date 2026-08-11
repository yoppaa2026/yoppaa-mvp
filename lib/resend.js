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

// ⚠️ AUCUN EMAIL NE PORTAIT LA RÉFÉRENCE. Les écrans affichaient bien « CC12 »
// depuis la refonte de la numérotation, mais les appelants passaient ici le
// numéro BRUT et les gabarits écrivaient « #12 ». Le client lisait donc un
// numéro dans son email et un autre à l'écran, et le commerçant, qui cherche
// « CC12 » dans son tableau de bord, ne pouvait plus faire le lien.
//
// Les gabarits n'ont PAS à connaître les préfixes : le paramètre
// `numero_commande` reçoit désormais la référence déjà formée par
// `referenceCommande()` (lib/numero-commande.js), la même fonction que celle
// des écrans. Un seul endroit décide de la forme d'un numéro.

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
// Logo Yoppaa canonique pour email (header sombre) : wordmark + 5 dots V2-B.
// Spec alignée sur app/components/YoppaaLogo.js mode 'dark' :
//   dotBase = wordmarkSize × 0.254 (strict, cf. feedback_proportions_logo_canonique)
//   dotMini = dotBase × 0.55, dotGap = dotBase × 0.55, dotOffset = dotBase × 0.4
// Wordmark : Plus Jakarta Sans 800 (fallback robuste pour clients mail).
//
// NB : la disposition des dots utilise une <table> (pattern email standard).
// inline-flex/gap n'est pas fiable sur Gmail/Outlook ; <table> + valign="top"
// + padding-top contrôle visuellement le décalage "sourire" sans risque.
export function logoEmailDark(wordmarkSize = 32) {
  const dotBase   = Math.round(wordmarkSize * 0.254)
  const dotMini   = Math.max(2, Math.round(dotBase * 0.55))
  const dotGap    = Math.max(3, Math.round(dotBase * 0.55))
  const dotOffset = Math.max(2, Math.round(dotBase * 0.4))
  const wordmarkToDots = Math.round(wordmarkSize * 0.28)
  const fontStack = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
  // Helper interne : génère 1 td contenant 1 dot rond. font-size:0;line-height:0 évite
  // que la cellule prenne plus de hauteur que le cercle (Outlook line-height par défaut).
  const cell = (size, color, top, rightPad) => `<td valign="top" style="padding:${top}px ${rightPad}px 0 0;font-size:0;line-height:0;mso-line-height-rule:exactly;"><div style="width:${size}px;height:${size}px;background:${color};border-radius:50%;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</div></td>`
  // Wrapper table shrink-to-fit pour grouper wordmark + dots et garantir le
  // centrage horizontal des dots SOUS le wordmark (alignItems:center du
  // composant React YoppaaLogo). align="center" sur la table interne centre
  // les dots par rapport à la largeur du wordmark, pas du panel parent.
  return `
    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;">
      <tr><td align="center" style="text-align:center;">
        <p style="margin:0;font-family:${fontStack};font-weight:800;font-size:${wordmarkSize}px;letter-spacing:-0.05em;line-height:1;text-align:center;">
          <span style="color:#FFFFFF;">yo</span><span style="color:${C.light};">pp</span><span style="color:${C.mid};">aa</span>
        </p>
        <table cellpadding="0" cellspacing="0" border="0" align="center" role="presentation" style="margin:${wordmarkToDots}px auto 0;border-collapse:collapse;">
          <tr>
            ${cell(dotBase, '#FFFFFF', 0,         dotGap)}
            ${cell(dotMini, C.light,   dotOffset, dotGap)}
            ${cell(dotBase, C.light,   dotOffset, dotGap)}
            ${cell(dotMini, C.mid,     dotOffset, dotGap)}
            ${cell(dotBase, C.mid,     0,         0)}
          </tr>
        </table>
      </td></tr>
    </table>`
}

// Mention destinataire footer selon audience.
function mentionAudience(audience, commercantNom) {
  if (audience === 'yopper') {
    return commercantNom
      ? `Tu reçois cet email parce que tu as passé commande chez ${commercantNom}.`
      : `Tu reçois cet email parce que tu utilises Yoppaa.`
  }
  if (audience === 'commercant') {
    return `Tu reçois cet email parce que tu es commerçant Yoppaa.`
  }
  return '' // admin / interne : pas de mention
}

export function layout({ title, intro, body, ctaUrl, ctaLabel, audience = 'yopper', commercantNom = '' }) {
  const mention = mentionAudience(audience, commercantNom)
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
      ${logoEmailDark(32)}
      <p style="margin:14px 0 0;color:${C.light};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${title}</p>
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
      yoppaa.app · Ton quartier dans ta poche${mention ? `<br/>${mention}` : ''}
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
    audience: 'admin',
    title: 'Nouveau commerçant à valider',
    intro: `<strong>${nom}</strong> vient de soumettre son inscription Yoppaa Pro et attend ta validation.`,
    body: `
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Récap</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:5px 0;color:${C.muted};">Type</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${type || '—'}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">Plan</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${(plan || 'exister').toUpperCase()}</td></tr>
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

// 1 bis) Email AU COMMERÇANT dès la soumission : accusé de réception qui
// rassure pendant l'attente de validation manuelle (sinon silence jusqu'à
// la validation, anxiogène pour un commerçant qui vient de tout remplir).
export function emailDemandeRecue({ nom, plan }) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  const planLabel = { exister: 'Exister', communiquer: 'Communiquer', vendre: 'Vendre', public: 'Public', on: 'Exister', full: 'Vendre' }[plan] || 'Exister'
  return layout({
    audience: 'commercant',
    title: 'Demande bien reçue',
    intro: `Merci <strong>${nom}</strong>, ta demande d'inscription sur Yoppaa est bien arrivée chez nous. 🟣`,
    body: `
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        Notre équipe vérifie ton profil et ta fiche sera <strong>validée sous 24 h ouvrées</strong>.
        Tu recevras un email dès que ta page sera en ligne : tu n'as rien d'autre à faire pour l'instant.
      </p>
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Récap</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:5px 0;color:${C.muted};">Commerce</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${nom}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">Formule choisie</td><td style="padding:5px 0;color:${C.main};font-weight:800;text-align:right;">${planLabel}</td></tr>
        </table>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${C.ink};">
        En attendant, tu peux déjà peaufiner ton profil depuis ton tableau de bord (articles, photos, horaires).
        Une question ? Réponds simplement à cet email.
      </p>
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Ouvrir mon tableau de bord',
  })
}

// 1 ter) Accompagnement sur place / matériel commandé depuis le tableau de bord
// (onglet Accompagnement) et PAYÉ à la commande via Stripe. Envoyés par le
// webhook billing une fois le paiement confirmé.
function tableauLignes(lignes = [], total = 0) {
  return `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${lignes.map(l => `
        <tr>
          <td style="padding:6px 0;color:${C.ink};font-weight:700;">${l.label}</td>
          <td style="padding:6px 0;color:${C.main};font-weight:800;text-align:right;white-space:nowrap;">${Number(l.prix).toFixed(2).replace('.', ',')} € HTVA</td>
        </tr>`).join('')}
      <tr>
        <td style="padding:8px 0 0;border-top:1px solid ${C.pale};color:${C.muted};font-weight:700;">Total indicatif</td>
        <td style="padding:8px 0 0;border-top:1px solid ${C.pale};color:${C.ink};font-weight:900;text-align:right;white-space:nowrap;">${Number(total).toFixed(2).replace('.', ',')} € HTVA</td>
      </tr>
    </table>
  `
}

export function emailAccompagnementPayeAdmin({ commercant_id, nom, email, telephone, adresse, categorie, plan, lignes, total, message }) {
  return layout({
    audience: 'admin',
    title: 'Accompagnement payé',
    intro: `<strong>${nom}</strong> vient de payer un accompagnement sur place ou du matériel depuis son tableau de bord.`,
    body: `
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Payé</p>
        ${tableauLignes(lignes, total)}
      </div>
      ${message ? `<div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#B45309;text-transform:uppercase;letter-spacing:0.7px;">Son message</p>
        <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.6;">${message}</p>
      </div>` : ''}
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Le contacter pour la suite</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:5px 0;color:${C.muted};">Email</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${email || '—'}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">Téléphone</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${telephone || '—'}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">Adresse</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${adresse || '—'}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">Catégorie · formule</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${categorie || '—'} · ${(plan || 'exister').toUpperCase()}</td></tr>
          <tr><td style="padding:5px 0;color:${C.muted};">ID interne</td><td style="padding:5px 0;color:${C.muted};font-size:11px;text-align:right;font-family:monospace;">${commercant_id || '—'}</td></tr>
        </table>
      </div>
    `,
    ctaUrl: 'https://www.yoppaa.app/admin',
    ctaLabel: 'Ouvrir /admin',
  })
}

export function emailAccompagnementPayeCommercant({ nom, lignes, total }) {
  return layout({
    audience: 'commercant',
    title: 'Commande confirmée',
    intro: `Merci <strong>${nom}</strong>, ton paiement est bien reçu. 🟣`,
    body: `
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        On te contacte sous <strong>2 jours ouvrables</strong> : pour un accompagnement sur place, on convient
        ensemble de la date qui t'arrange ; pour du matériel, on te confirme l'expédition.
        Ta facture arrive séparément par email.
      </p>
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Ta commande</p>
        ${tableauLignes(lignes, total)}
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${C.ink};">
        Une précision à ajouter ? Réponds simplement à cet email, ça nous arrive directement.
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app/dashboard',
    ctaLabel: 'Ouvrir mon tableau de bord',
  })
}

// 2) Email AU COMMERÇANT quand sa demande est validée → sa page est live
export function emailValidationCommercant({ nom, slug }) {
  const ficheUrl     = slug ? `https://yoppaa.app/commander/${slug}` : 'https://yoppaa.app/commander'
  const dashboardUrl = 'https://yoppaa.app/dashboard'
  return layout({
    audience: 'commercant',
    title: 'Bienvenue dans la tribu Yoppaa',
    intro: `Bonne nouvelle <strong>${nom}</strong> : ta page Yoppaa est <strong style="color:${C.main};">en ligne</strong> dès maintenant.`,
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

// 3 bis) Email AU COMMERÇANT : KYB validé par Yoppaa (la fiche peut maintenant
//        être publiée si statut_publication='valide' aussi). S5 lancement 19/06.
export function emailKYBValide({ nom }) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  return layout({
    title: 'Vérification entreprise validée',
    intro: `Bonjour <strong>${nom}</strong>, ta vérification d'entreprise est <strong style="color:${C.main};">validée</strong>. Tout est en règle, ton dossier est complet.`,
    body: `
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${C.ink};">
        Si ce n'est pas déjà fait, ta fiche commerce sera publiée dès qu'elle aura passé la validation finale (souvent sous 24h).
      </p>
      <p style="margin:0;font-size:13px;color:${C.muted};line-height:1.55;">
        Tes documents d'identité restent confidentiels et chiffrés. Conformes RGPD, consultables uniquement par l'équipe Yoppaa.
      </p>
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Ouvrir mon dashboard',
  })
}

// 3 ter) Email AU COMMERÇANT : KYB rejeté par Yoppaa → motif clair + lien
//        retour signup pour ré-uploader les pièces.
export function emailKYBRejete({ nom, motif }) {
  const signupUrl = 'https://www.yoppaa.app/signup'
  return layout({
    title: 'Vérification entreprise à corriger',
    intro: `Bonjour <strong>${nom}</strong>, ta vérification d'entreprise nécessite une correction avant qu'on puisse publier ta fiche.`,
    body: `
      <div style="background:#FFF7ED;border-left:4px solid #EA580C;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#9A3412;text-transform:uppercase;letter-spacing:0.7px;">Motif</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#7C2D12;font-weight:600;">${motif || 'Documents à compléter — voir détails sur ton signup.'}</p>
      </div>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${C.ink};">
        Reviens sur la dernière étape de ton signup pour corriger : ré-upload d'une pièce d'identité plus lisible, vérification du numéro BCE, ou correction du nom du représentant légal.
      </p>
      <p style="margin:0;font-size:13px;color:${C.muted};line-height:1.55;">
        Les anciens fichiers sont supprimés. On valide en moins de 24h après ta nouvelle soumission.
      </p>
    `,
    ctaUrl: signupUrl,
    ctaLabel: 'Corriger ma vérification',
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
  // Accepte une date seule (YYYY-MM-DD → RDV) OU un timestamp ISO complet
  // (subscription_trial_end contient un ...T..Z : concaténer 'T12:00:00' donnait
  // une « Invalid Date »). Garde-fou : renvoie '—' si non parsable.
  const s = String(dateStr)
  const d = s.includes('T') ? new Date(s) : new Date(s + 'T12:00:00')
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// 4) Email AU YOPPER : RDV confirmé (iCal joint)
//    Envoyé après webhook payment_intent.succeeded OU insert direct sans acompte.
export function emailRdvConfirme({
  yopper_prenom, commercant_nom, commercant_adresse,
  prestation_nom, date_rdv, heure_debut, heure_fin, duree_minutes,
  prix_estime, acompte_paye, acompte_montant, delai_annulation_heures = 24,
  annulation_token = null,
  // La référence du rendez-vous, déjà formée par `referenceRdv()` : « RV12 ».
  // Elle n'existait NULLE PART dans cet email, alors que c'est elle que le
  // commerçant cherche dans son agenda quand le client appelle.
  numero_rdv = null,
  praticien_prenom = null, praticien_nom = null, praticien_couleur = null,
  infos_pratiques = null,
  // Tunnel unique : produits achetés en même temps que le rendez-vous et
  // retirés le jour même. Ils vivent dans CET email, il n'y en a pas un second
  // pour la commande : deux confirmations pour un seul paiement font douter le
  // client d'avoir payé deux fois.
  produits = null,
}) {
  // CTA principale "Voir mon RDV" pointe vers l'onglet "Commandes et rendez-vous"
  // du Yopper avec le sous-onglet "rdvs" preselectionne (sinon l'utilisateur arrive
  // sur le tab Commandes par defaut, signale par Alex 30/06).
  const mesRdvUrl = 'https://www.yoppaa.app/commander?onglet=commandes&tab=rdvs'
  const cancelUrl = annulation_token
    ? `https://www.yoppaa.app/commander/rdv/cancel?token=${annulation_token}`
    : null
  const solde = (prix_estime != null && acompte_montant != null) ? (Number(prix_estime) - Number(acompte_montant)) : null
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: 'Ton RDV est confirmé',
    intro: `<strong>${yopper_prenom}</strong>, ton rendez-vous chez <strong>${commercant_nom}</strong> est bien confirmé. À très vite 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Quand</p>
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_rdv)}</p>
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'} (${duree_minutes || '?'} min)</p>
        ${numero_rdv ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Rendez-vous <strong style="color:${C.main};">#${numero_rdv}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Prestation</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${prestation_nom || '—'}</td></tr>
        ${praticien_prenom ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Avec</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:${praticien_couleur || C.main};display:inline-block;"></span>${praticien_prenom}${praticien_nom ? ' ' + praticien_nom : ''}</span></td></tr>` : ''}
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Adresse</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${commercant_adresse || '—'}</td></tr>
        ${prix_estime != null ? `<tr><td style="padding:10px 14px;color:${C.muted};${acompte_paye ? `border-bottom:1px solid ${C.pale};` : ''}">Prix estimé</td><td style="padding:10px 14px;color:${C.main};font-weight:900;text-align:right;${acompte_paye ? `border-bottom:1px solid ${C.pale};` : ''}">${Number(prix_estime).toFixed(2)} €</td></tr>` : ''}
        ${acompte_paye ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Acompte payé</td><td style="padding:10px 14px;color:#10B981;font-weight:800;text-align:right;border-bottom:1px solid ${C.pale};">✓ ${Number(acompte_montant).toFixed(2)} €</td></tr>` : ''}
        ${solde != null && solde > 0 ? `<tr><td style="padding:10px 14px;color:${C.muted};">Solde sur place</td><td style="padding:10px 14px;color:${C.deep};font-weight:800;text-align:right;">${solde.toFixed(2)} €</td></tr>` : ''}
      </table>
      ${(produits && produits.lignes && produits.lignes.length > 0) ? `
      <div style="background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <p style="margin:0;padding:10px 14px;background:${C.pale};font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Tes produits, prêts pour ce jour-là</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${produits.lignes.map(l => `<tr><td style="padding:9px 14px;color:${C.ink};font-weight:700;border-bottom:1px solid ${C.pale};">${l.quantite} × ${l.nom}</td><td style="padding:9px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${Number(l.total).toFixed(2)} €</td></tr>`).join('')}
          <tr><td style="padding:10px 14px;color:${C.muted};">Payé en ligne</td><td style="padding:10px 14px;color:#10B981;font-weight:900;text-align:right;">✓ ${Number(produits.total).toFixed(2)} €</td></tr>
        </table>
      </div>
      <p style="margin:0 0 14px;font-size:12px;color:${C.deep};line-height:1.55;">
        Tes produits sont mis de côté. Tu les récupères en même temps que ton rendez-vous, rien à repayer sur place.
      </p>` : ''}
      <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${C.ink};">
        Tout est prêt 🟣 Tu peux ajouter ce RDV à ton calendrier dès maintenant.
      </p>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1.5px dashed ${C.main}44;margin-bottom:6px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">📅 Ajout au calendrier</p>
        <p style="margin:0;font-size:12px;color:${C.deep};line-height:1.55;">Un fichier <strong>.ics</strong> est joint à cet email. Ouvre-le pour ajouter le RDV à ton calendrier (Apple, Google, Outlook). Rappel automatique 24h avant.</p>
      </div>
      ${infos_pratiques ? `
      <div style="background:${C.pale};border-radius:12px;padding:12px 14px;margin-top:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">Infos pratiques de ${commercant_nom}</p>
        <p style="margin:0;font-size:12px;color:${C.deep};line-height:1.6;white-space:pre-line;">${infos_pratiques}</p>
      </div>` : ''}
      ${cancelUrl ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-top:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">Tu veux annuler ?</p>
        <p style="margin:0 0 8px;font-size:12px;color:#7C2D12;line-height:1.5;">
          Tu peux annuler ton RDV gratuitement jusqu'à <strong>${delai_annulation_heures}h</strong> avant ton créneau. Remboursement automatique de l'acompte en 5 à 10 jours.
        </p>
        <a href="${cancelUrl}" style="display:inline-block;padding:8px 14px;background:#fff;color:#92400E;border:1.5px solid #F59E0B;border-radius:100px;font-weight:800;font-size:12px;text-decoration:none;">Annuler mon RDV</a>
      </div>` : `
      <p style="margin:14px 0 0;font-size:11px;color:${C.muted};line-height:1.55;">
        ⏰ Annulation possible jusqu'à ${delai_annulation_heures}h avant le RDV depuis ton espace Yopper.
      </p>`}
    `,
    ctaUrl: mesRdvUrl,
    ctaLabel: 'Voir mon RDV',
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

// 5bis) Email AU YOPPER : RDV marqué no-show par le commerçant
// Pas d'iCal CANCEL (pour eux le RDV est juste resté "non honoré", info)
export function emailRdvNoShow({
  yopper_prenom, commercant_nom,
  prestation_nom, date_rdv, heure_debut,
  acompte_paye, acompte_montant,
}) {
  const mesRdvUrl = 'https://www.yoppaa.app/commander?onglet=commandes'
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: 'Ton RDV a été marqué non honoré',
    intro: `<strong>${yopper_prenom}</strong>, le rendez-vous du <strong>${formatDateFr(date_rdv)} à ${heure_debut?.slice(0,5) || '?'}</strong> chez <strong>${commercant_nom}</strong> a été marqué <strong style="color:#6B7280;">non honoré</strong>.`,
    body: `
      <div style="background:#F9FAFB;border-left:4px solid #6B7280;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.7px;">Prestation</p>
        <p style="margin:0;font-size:14px;color:${C.ink};font-weight:600;">${prestation_nom || '—'}</p>
      </div>
      <p style="margin:0 0 14px;font-size:13px;color:${C.ink};line-height:1.6;">
        Si tu penses qu'il y a une erreur, contacte directement <strong>${commercant_nom}</strong> pour clarifier la situation.
      </p>
      ${acompte_paye && acompte_montant ? `
      <div style="background:#FFF7ED;border-left:4px solid #EA580C;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#9A3412;text-transform:uppercase;letter-spacing:0.7px;">Acompte</p>
        <p style="margin:0;font-size:13px;color:#7C2D12;line-height:1.55;font-weight:600;">
          L'acompte de <strong>${Number(acompte_montant).toFixed(2)} €</strong> est conservé par le commerçant car le créneau a été bloqué pour toi. Pour un geste commercial, contacte-le directement.
        </p>
      </div>` : ''}
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;">
        À très bientôt, on espère, sur Yoppaa 🟣
      </p>
    `,
    ctaUrl: mesRdvUrl,
    ctaLabel: 'Voir mes RDV',
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
  // Produits achetés avec le rendez-vous : le commerçant doit les préparer
  // AVANT que le client arrive, sinon la promesse « tu repars avec » tombe.
  produits = null,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  return layout({
    audience: 'commercant',
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
      ${(produits && produits.lignes && produits.lignes.length > 0) ? `
      <div style="background:#ECFDF5;border-left:4px solid #10B981;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:#065F46;text-transform:uppercase;letter-spacing:0.6px;">Produits à préparer, déjà payés</p>
        ${produits.lignes.map(l => `<p style="margin:0 0 3px;font-size:13px;color:#065F46;font-weight:700;">${l.quantite} × ${l.nom}</p>`).join('')}
        <p style="margin:6px 0 0;font-size:12px;color:#047857;font-weight:800;">Total encaissé : ${Number(produits.total).toFixed(2)} €</p>
      </div>` : ''}
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
  yopper_prenom, commercant_nom, commercant_adresse,
  numero_commande, articles, total, date_retrait, heure_debut, heure_fin,
  mode_retrait = 'retrait', adresse_livraison = null, frais_livraison = 0,
  commercant_categorie = null,  // 'vitrine' adapte le vocabulaire (salon, pas boutique)
  bon_cadeau_montant = 0,       // part payée par un bon cadeau (déduite du total)
  // Ventilation de TVA calculée depuis les taux FIGÉS sur les lignes de la
  // commande : [{ taux, base, tva, ttc }]. Vide pour une commande antérieure au
  // figement, auquel cas on n'affiche rien plutôt qu'un chiffre faux.
  ventilation_tva = [],
  tva_taux_livraison = null,    // taux appliqué aux frais de livraison (accessoire de la vente)
  annulation_token = null, delai_annulation_heures = 2,
  offrir_mdp = false,  // true si le client n'a pas encore de compte (pas de mot de passe)
  offrir_mdp_email = '',  // email de la commande : le lien le transporte pour cibler le BON compte
}) {
  // Trois mondes : livraison alim (créneau), boutique détail (retrait sans
  // créneau OU expédition), retrait C&C classique (créneau)
  const estLivraison = mode_retrait === 'livraison'
  const estExpedition = mode_retrait === 'expedition'
  const estBoutiqueRetrait = mode_retrait === 'retrait_boutique'
  const estBoutique = estExpedition || estBoutiqueRetrait
  const estVitrineCat = commercant_categorie === 'vitrine'
  const titreQuand = estExpedition ? 'Expédition' : estLivraison ? 'Livraison prévue' : estBoutiqueRetrait ? (estVitrineCat ? 'Retrait sur place' : 'Retrait en boutique') : 'Retrait prévu'
  // Ligne horaire.
  //
  // ⚠️ CLARIFIÉ LE 05/08 (décision Alex). La boutique n'a pas de créneau : elle
  // annonçait « dès que ta commande est prête, pendant les heures d'ouverture »,
  // ce qui laissait le client deviner QUAND se déplacer. Il pouvait arriver
  // devant une commande pas préparée. Le commerçant marque désormais la commande
  // prête depuis son tableau de bord, ce qui déclenche un email et une
  // notification : on annonce donc une attente, pas un horaire.
  const ligneHoraire = estExpedition
    ? 'Ton colis part dès que la commande est préparée'
    : estBoutiqueRetrait
      ? 'En préparation · on te prévient dès qu\'elle t\'attend'
      : (heure_debut && heure_fin)
        ? `${heure_debut.slice(0, 5)} → ${heure_fin.slice(0, 5)}`
        : 'Aux heures d\'ouverture'
  // CTA principale "Voir ma commande" pointe vers l'onglet "Commandes et rendez-vous"
  // du Yopper (vue liste de toutes ses commandes en cours), accessible via le param
  // ?onglet=commandes sur la page racine /commander.
  const mesCommandesUrl = 'https://www.yoppaa.app/commander?onglet=commandes'
  // Annulation self-service : uniquement pour les commandes à CRÉNEAU (le délai
  // « Xh avant ton créneau » n'a aucun sens en boutique). Boutique : ligne
  // contact, la rétractation légale de 14 jours vit dans les CGU, pas ici.
  const cancelUrl = (!estBoutique && annulation_token)
    ? `https://www.yoppaa.app/commander/cancel?token=${annulation_token}`
    : null
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: 'Ta commande est confirmée',
    intro: `<strong>${yopper_prenom}</strong>, ta commande chez <strong>${commercant_nom}</strong> est bien enregistrée 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">${titreQuand}</p>
        ${estExpedition ? '' : `<p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_retrait)}</p>`}
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${ligneHoraire}</p>
        ${numero_commande ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Commande <strong style="color:${C.main};">#${numero_commande}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${renderArticlesRows(articles)}
        ${(estLivraison || estExpedition) && Number(frais_livraison) > 0 ? `<tr><td style="padding:10px 14px;color:${C.deep};font-size:13px;font-weight:600;border-top:1px solid ${C.pale};">${estExpedition ? 'Frais de port' : 'Frais de livraison'}${tva_taux_livraison != null ? ` <span style="color:${C.muted};font-weight:600;">(TVA ${tva_taux_livraison} %)</span>` : ''}</td><td style="padding:10px 14px;color:${C.deep};font-size:13px;font-weight:700;text-align:right;border-top:1px solid ${C.pale};">${Number(frais_livraison).toFixed(2)} €</td></tr>` : ''}
        ${total != null ? `<tr><td style="padding:12px 14px;color:${C.ink};font-size:14px;font-weight:900;background:${C.bg};">Total</td><td style="padding:12px 14px;color:${C.main};font-size:16px;font-weight:900;text-align:right;background:${C.bg};">${Number(total).toFixed(2)} €</td></tr>` : ''}
        ${Number(bon_cadeau_montant) > 0 ? `
        <tr><td style="padding:10px 14px;color:#10B981;font-size:13px;font-weight:700;">🎁 Bon cadeau</td><td style="padding:10px 14px;color:#10B981;font-size:13px;font-weight:800;text-align:right;">−${Number(bon_cadeau_montant).toFixed(2)} €</td></tr>
        <tr><td style="padding:10px 14px;color:${C.ink};font-size:13px;font-weight:900;border-top:1px solid ${C.pale};">${total != null && Number(total) - Number(bon_cadeau_montant) > 0 ? 'Reste payé' : 'Payé par le bon'}</td><td style="padding:10px 14px;color:${C.ink};font-size:13px;font-weight:900;text-align:right;border-top:1px solid ${C.pale};">${total != null ? Math.max(0, Number(total) - Number(bon_cadeau_montant)).toFixed(2) : '0.00'} €</td></tr>` : ''}
        ${ventilation_tva.length > 0 ? `
        <tr><td colspan="2" style="padding:10px 14px 4px;color:${C.muted};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;border-top:1px solid ${C.pale};">Dont TVA</td></tr>
        ${ventilation_tva.map(v => `
        <tr>
          <td style="padding:3px 14px;color:${C.muted};font-size:12px;">TVA ${v.taux} % · base ${v.base.toFixed(2)} €</td>
          <td style="padding:3px 14px;color:${C.deep};font-size:12px;font-weight:700;text-align:right;">${v.tva.toFixed(2)} €</td>
        </tr>`).join('')}
        <tr><td colspan="2" style="padding:4px 14px 10px;color:${C.muted};font-size:10.5px;line-height:1.5;">Prix TVA comprise. Ce ticket est un justificatif de commande, pas une facture.</td></tr>` : ''}
      </table>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📍 ${estExpedition ? 'Adresse d\'expédition' : estLivraison ? 'Adresse de livraison' : 'Adresse de retrait'}</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${((estLivraison || estExpedition) ? adresse_livraison : commercant_adresse) || '—'}</p>
      </div>
      <p style="margin:0 0 14px;font-size:12px;color:${C.muted};line-height:1.55;">
        🔔 ${estBoutiqueRetrait
          ? `<strong>${commercant_nom} prépare ta commande.</strong> Tu reçois un email et une notification dès qu'elle t'attend en boutique : inutile de te déplacer avant, tu ne peux pas la manquer.`
          : `Tu recevras un nouvel email dès que ta commande sera <strong>${estExpedition ? 'expédiée (avec ton numéro de suivi)' : estLivraison ? 'prête pour la livraison' : 'prête à retirer'}</strong>.`}
      </p>
      ${cancelUrl ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-top:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">Tu veux annuler ?</p>
        <p style="margin:0 0 8px;font-size:12px;color:#7C2D12;line-height:1.5;">
          Tu peux annuler ta commande gratuitement jusqu'à <strong>${delai_annulation_heures}h</strong> avant ton créneau de ${estLivraison ? 'livraison' : 'retrait'}. Remboursement automatique en 5 à 10 jours.
        </p>
        <a href="${cancelUrl}" style="display:inline-block;padding:8px 14px;background:#fff;color:#92400E;border:1.5px solid #F59E0B;border-radius:100px;font-weight:800;font-size:12px;text-decoration:none;">Annuler ma commande</a>
      </div>` : ''}
      ${estBoutique ? `
      <p style="margin:0 0 14px;font-size:12px;color:${C.muted};line-height:1.55;">
        Un souci avec ta commande ? Contacte directement ${estVitrineCat ? 'le commerçant, il trouvera' : 'la boutique, elle trouvera'} une solution avec toi.
      </p>` : ''}
      ${offrir_mdp ? `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-top:14px;">
        <p style="margin:0 0 8px;font-size:12px;color:${C.deep};line-height:1.5;">
          <strong>Astuce :</strong> crée un mot de passe pour retrouver tes commandes et te reconnecter en un clic. Le lien magique par email reste toujours disponible.
        </p>
        <a href="https://www.yoppaa.app/commander/auth/definir-mdp${offrir_mdp_email ? `?email=${encodeURIComponent(offrir_mdp_email)}` : ''}" style="display:inline-block;padding:8px 14px;background:${C.main};color:#fff;border-radius:100px;font-weight:800;font-size:12px;text-decoration:none;">Créer mon mot de passe</a>
      </div>` : ''}
    `,
    ctaUrl: mesCommandesUrl,
    ctaLabel: 'Voir ma commande',
  })
}

// 11bis) Email AU YOPPER : commande annulée + refund confirmé
export function emailCommandeAnnuleeYopper({
  yopper_prenom, commercant_nom, numero_commande, total,
  refund_manuel = false, paye_en_ligne = true,
}) {
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: 'Ta commande est annulée',
    intro: `<strong>${yopper_prenom}</strong>, ta commande chez <strong>${commercant_nom}</strong> a bien été annulée.`,
    body: `
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid ${C.pale};margin-bottom:14px;text-align:center;">
        ${numero_commande ? `<p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Commande annulée</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:${C.ink};letter-spacing:-1px;">#${numero_commande}</p>` : ''}
        ${total != null ? `<p style="margin:6px 0 0;font-size:13px;color:${C.muted};">Montant : <strong style="color:${C.ink};">${Number(total).toFixed(2)} €</strong></p>` : ''}
      </div>
      ${paye_en_ligne ? `
      <div style="background:${refund_manuel ? '#FFFBEB' : '#ECFDF5'};border-left:4px solid ${refund_manuel ? '#F59E0B' : '#10B981'};border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${refund_manuel ? '#78350F' : '#065F46'};text-transform:uppercase;letter-spacing:0.6px;">Remboursement</p>
        <p style="margin:0;font-size:13px;color:${refund_manuel ? '#7C2D12' : '#064E3B'};line-height:1.5;font-weight:600;">
          ${refund_manuel
            ? `Notre système n'a pas pu lancer le remboursement automatique. ${commercant_nom} va le traiter manuellement sous quelques jours.`
            : `Le remboursement est lancé. Tu verras le montant revenir sur ton moyen de paiement <strong>dans 5 à 10 jours</strong>.`
          }
        </p>
      </div>` : ''}
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;text-align:center;">
        Au plaisir de te revoir bientôt sur Yoppaa 🟣
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app/commander',
    ctaLabel: 'Explorer les commerces',
  })
}

// 11ter) Email AU COMMERÇANT : un client a annulé sa commande
export function emailCommandeAnnuleeCommercant({
  nom_commercant, yopper_prenom, yopper_nom,
  numero_commande, total, date_retrait, heure_debut, heure_fin,
  refund_manuel = false, paye_en_ligne = true,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  return layout({
    audience: 'commercant',
    title: 'Une commande a été annulée',
    intro: `<strong>${nom_commercant}</strong>, ${yopper_prenom || 'un client'} vient d'annuler sa commande.`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Retrait prévu (annulé)</p>
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;text-decoration:line-through;text-decoration-color:${C.muted};">${formatDateFr(date_retrait)}</p>
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;text-decoration:line-through;text-decoration-color:${C.muted};">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'}</p>
        ${numero_commande ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Commande <strong style="color:${C.main};">#${numero_commande}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Client</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${yopper_prenom || ''} ${yopper_nom || ''}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};">Total annulé</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;">${total != null ? Number(total).toFixed(2) + ' €' : '—'}</td></tr>
      </table>
      ${paye_en_ligne ? (refund_manuel
        ? `<div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">⚠ Refund manuel à traiter</p>
            <p style="margin:0;font-size:13px;color:#7C2D12;font-weight:600;line-height:1.5;">
              Le remboursement automatique a échoué. Merci de refund manuellement depuis ton Stripe Dashboard sous 48h.
            </p>
          </div>`
        : `<div style="background:#ECFDF5;border-left:4px solid #10B981;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#065F46;text-transform:uppercase;letter-spacing:0.6px;">Remboursement</p>
            <p style="margin:0;font-size:13px;color:#064E3B;font-weight:600;line-height:1.5;">
              Yoppaa a déjà lancé le remboursement automatique vers le client. Rien à faire de ton côté.
            </p>
          </div>`
      ) : ''}
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Voir dans mon dashboard',
  })
}

// 12) Email AU YOPPER : la commande est prête (statut → 'pret')
//
// ⚠️ IL EXISTE DEUX VERSIONS, ET C'EST INDISPENSABLE. Ce message était écrit
// pour le RETRAIT uniquement : un client en LIVRAISON recevait « Prête à
// retirer », l'adresse du commerce et un lien d'itinéraire vers la boutique,
// alors qu'il attend chez lui. Pire, l'heure venait de `creneaux`, table vide
// pour une livraison : le créneau s'affichait « ? → ? ». Rien ne collait.
export function emailCommandePrete({
  yopper_prenom, commercant_nom, commercant_adresse, commercant_slug,
  numero_commande, heure_debut, heure_fin, est_livraison = false,
  adresse_livraison = null,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  const mapsUrl = commercant_adresse ? `https://www.google.com/maps/search/${encodeURIComponent(commercant_adresse)}` : null
  const plage = (heure_debut || heure_fin)
    ? `${heure_debut?.slice(0, 5) || '?'} → ${heure_fin?.slice(0, 5) || '?'}`
    : null

  if (est_livraison) {
    return layout({
      title: 'Ta commande part bientôt 🛵',
      intro: `<strong>${yopper_prenom}</strong>, ta commande chez <strong>${commercant_nom}</strong> est préparée. Elle arrive dans ton créneau 🟣`,
      body: `
        <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Prête, livraison en préparation</p>
          ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
          ${plage ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">Livraison entre ${plage}</p>` : ''}
        </div>
        <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">🛵 Livrée à</p>
          <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${adresse_livraison || '—'}</p>
        </div>
        <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;text-align:center;">
          Tu recevras un message quand ${commercant_nom} prendra la route. Pense à rester joignable 🟣
        </p>
      `,
      ctaUrl: 'https://www.yoppaa.app/commander?onglet=commandes',
      ctaLabel: 'Suivre ma commande',
    })
  }

  return layout({
    title: 'Ta commande est prête 🎉',
    intro: `<strong>${yopper_prenom}</strong>, c'est prêt ! Ta commande chez <strong>${commercant_nom}</strong> t'attend 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Prête à retirer</p>
        ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
        ${plage ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">${plage}</p>` : ''}
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

// 12 bis) Email AU YOPPER : le commerçant a pris la route.
//
// ⚠️ IL N'EXISTAIT AUCUN EMAIL SUR CE CHANGEMENT DE STATUT, uniquement une
// notification push. Or le push web ne fonctionne pas partout — Chrome sur
// iPhone ne le supporte pas — et c'est justement le message qu'il ne faut pas
// rater : c'est celui qui dit au client de rester joignable.
export function emailCommandeEnLivraison({
  yopper_prenom, commercant_nom, numero_commande, adresse_livraison,
  heure_debut, heure_fin,
}) {
  const plage = (heure_debut || heure_fin)
    ? `${heure_debut?.slice(0, 5) || '?'} → ${heure_fin?.slice(0, 5) || '?'}`
    : null
  return layout({
    title: 'Ta commande arrive 🛵',
    intro: `<strong>${yopper_prenom}</strong>, <strong>${commercant_nom}</strong> vient de partir avec ta commande 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.main} 0%,${C.deep} 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">En route vers toi</p>
        ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
        ${plage ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">Créneau ${plage}</p>` : ''}
      </div>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">🛵 Livrée à</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${adresse_livraison || '—'}</p>
      </div>
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;text-align:center;">
        Reste joignable, et confirme la réception dans l'application quand tu l'auras reçue 🟣
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app/commander?onglet=commandes',
    ctaLabel: 'Suivre ma commande',
  })
}

// 12 ter) Email AU YOPPER : son colis est parti (boutique détail, expédition)
//
// ⚠️ IL N'EXISTAIT PAS, ET C'ÉTAIT LE SEUL MODE SANS AUCUNE NOUVELLE. Un client
// qui commande en retrait reçoit « ta commande est prête », un client en
// livraison reçoit « le commerçant vient de partir ». Celui qui a payé un COLIS,
// lui, n'était prévenu de rien : le commerçant marquait la commande expédiée,
// saisissait un numéro de suivi… et ce numéro ne quittait jamais le tableau de
// bord. Le client ne pouvait le découvrir qu'en revenant de lui-même sur le site
// ouvrir sa liste de commandes.
//
// Le numéro de suivi est FACULTATIF : beaucoup d'envois partent sans. L'email
// doit donc rester juste quand il n'y en a pas, sans laisser un cadre vide ni
// promettre un suivi qui n'existe pas.
export function emailCommandeExpediee({
  yopper_prenom, commercant_nom, numero_commande, expedition_suivi, adresse_livraison,
}) {
  const suivi = String(expedition_suivi || '').trim()
  return layout({
    title: 'Ton colis est parti 📦',
    intro: `<strong>${yopper_prenom}</strong>, <strong>${commercant_nom}</strong> vient d'expédier ta commande 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.main} 0%,${C.deep} 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Expédiée</p>
        ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
      </div>
      ${suivi ? `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📦 Numéro de suivi</p>
        <p style="margin:0;font-size:15px;color:${C.ink};font-weight:800;letter-spacing:0.5px;">${suivi}</p>
        <p style="margin:6px 0 0;font-size:11px;color:${C.muted};line-height:1.5;">À saisir sur le site du transporteur pour suivre ton colis.</p>
      </div>` : ''}
      ${adresse_livraison ? `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📮 Envoyé à</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${adresse_livraison}</p>
      </div>` : ''}
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;text-align:center;">
        ${suivi
          ? 'Le transporteur prend le relais. Bonne réception 🟣'
          : 'Ton colis est en route. Compte quelques jours ouvrables pour la livraison 🟣'}
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app/commander?onglet=commandes',
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
    audience: 'commercant',
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
  nom_commercant, date_jour, commandes, bons_vendus,
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

  // ⚠️ LES BONS CADEAUX VENDUS LA VEILLE. Un commerçant réglé sur ce
  // récapitulatif ne recevait AUCUN email quand on lui achetait un bon : l'envoi
  // immédiat n'existe que pour ceux réglés sur « à chaque commande ». Il
  // découvrait la vente dans ses chiffres, des jours plus tard.
  // Il n'a rien à préparer, d'où le bloc discret sous le tableau : mais
  // quelqu'un a offert son commerce, et c'est un client qui viendra.
  const bons = Array.isArray(bons_vendus) ? bons_vendus : []
  const totalBons = bons.reduce((s, b) => s + (Number(b?.montant_initial) || 0), 0)
  const blocBons = bons.length === 0 ? '' : `
      <div style="background:${C.pale};border-radius:12px;padding:12px 14px;margin-top:14px;">
        <p style="margin:0 0 2px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">
          🎁 ${bons.length > 1 ? `${bons.length} bons cadeaux vendus` : 'Bon cadeau vendu'}
        </p>
        <p style="margin:0;font-size:14px;font-weight:900;color:${C.ink};">
          ${totalBons.toFixed(2)} €
          <span style="font-size:11px;font-weight:600;color:${C.muted};"> · déjà encaissés, rien à préparer</span>
        </p>
      </div>`

  return layout({
    audience: 'commercant',
    title: `${total} commande${total !== 1 ? 's' : ''} ${dateLabel.split(' ').slice(1,3).join(' ')}`,
    intro: `Bonjour <strong>${nom_commercant}</strong>, voici tes commandes pour <strong>${dateLabel}</strong> 🟣`,
    body: (total === 0
      ? `<p style="margin:0;font-size:14px;color:${C.muted};line-height:1.6;text-align:center;padding:24px 0;">📭 Aucune commande aujourd'hui. Bonne journée !</p>`
      : `
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${rows}
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:${C.muted};line-height:1.55;text-align:center;">
        Tu peux changer la fréquence de ces emails dans ton dashboard → Profil → Notifications commandes.
      </p>
    `) + blocBons,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Ouvrir mon dashboard',
  })
}

// 18) Email AU COMMERÇANT : bienvenue + kit de démarrage
// Envoyé automatiquement à la validation de son inscription, et renvoyable à
// la demande depuis son dashboard. Contient tout ce qu'il peut faire DÈS
// MAINTENANT pour amener ses clients : son lien, ses messages prêts à coller,
// son QR et son affichette de comptoir.
export function emailKitBienvenue({ nom_commercant, slug, avant_lancement = false }) {
  const kitUrl = `https://www.yoppaa.app/kit/${slug}`
  const affichetteUrl = `https://www.yoppaa.app/affichette/${slug}`
  // AVANT l'ouverture publique, la fiche n'accepte pas encore de clients : le
  // lien utile est celui de préinscription, qui fait monter le compteur de la
  // commune ET attribue chaque inscrit à ce commerçant (?ref=). Après le
  // lancement, on envoie directement sur la fiche pour commander.
  const lien = avant_lancement
    ? `https://www.yoppaa.app/?ref=${slug}`
    : `https://www.yoppaa.app/commander/${slug}`

  const messages = avant_lancement ? [
    {
      titre: 'Pour tes réseaux sociaux',
      texte: `On sera sur Yoppaa dès le 1er septembre 🟣 L'app qui réunit les commerces de la commune. Inscris-toi pour être prévenu de l'ouverture : ${lien}`,
    },
    {
      titre: 'Pour ton groupe WhatsApp de quartier',
      texte: `On prépare quelque chose : à partir du 1er septembre, vous pourrez commander et réserver chez nous depuis Yoppaa, l'app de notre commune. Inscrivez-vous ici pour être prévenus : ${lien}`,
    },
    {
      titre: 'À dire au comptoir',
      texte: 'Dès le 1er septembre, vous pourrez commander chez nous en ligne. Inscrivez-vous, on vous prévient.',
    },
  ] : [
    {
      titre: 'Pour tes réseaux sociaux',
      texte: `On est sur Yoppaa 🟣 Commandez chez nous en ligne, sans file d'attente : ${lien}`,
    },
    {
      titre: 'Pour ton groupe WhatsApp de quartier',
      texte: `Petite nouveauté : vous pouvez maintenant nous trouver et commander sur Yoppaa, l'app de notre commune. ${lien}`,
    },
    {
      titre: 'À dire au comptoir',
      texte: 'La prochaine fois, commandez sur Yoppaa : c\'est prêt quand vous arrivez.',
    },
  ]

  return layout({
    audience: 'commercant',
    title: 'Bienvenue dans la tribu Yoppaa 🟣',
    intro: avant_lancement
      ? `<strong>${nom_commercant}</strong>, ta page est prête. Elle s'ouvre au public le 1er septembre : d'ici là, ton kit sert à préparer le terrain.`
      : `<strong>${nom_commercant}</strong>, ta page est en ligne. Voici ton kit de démarrage : tout est prêt, il n'y a plus qu'à le partager.`,
    body: `
      ${avant_lancement ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0;font-size:12.5px;color:#7C2D12;line-height:1.6;">
          <strong>Nous sommes en phase de préparation.</strong> Chaque habitant qui s'inscrit via ton lien est attribué à ton commerce
          et fait monter le compteur de ta commune. Le 1er septembre, ils reçoivent tous une notification : ton commerce est ouvert sur Yoppaa.
        </p>
      </div>` : ''}

      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">${avant_lancement ? 'Ton lien de préinscription' : 'Ton lien'}</p>
        <p style="margin:0;font-size:15px;font-weight:800;color:${C.ink};word-break:break-all;">${lien.replace('https://', '')}</p>
        <p style="margin:8px 0 0;font-size:12px;color:${C.muted};line-height:1.55;">${avant_lancement
          ? 'Chaque inscription via ce lien t\'est attribuée. Il deviendra automatiquement le lien de ta page au lancement.'
          : 'C\'est l\'adresse de ta page : tes clients y commandent, réservent et te retrouvent.'}</p>
      </div>

      <p style="margin:0 0 10px;font-size:13px;font-weight:800;color:${C.ink};">Tes messages prêts à copier</p>
      ${messages.map(m => `
        <div style="background:#fff;border:1px solid ${C.pale};border-radius:12px;padding:12px 14px;margin-bottom:8px;">
          <p style="margin:0 0 4px;font-size:10.5px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">${m.titre}</p>
          <p style="margin:0;font-size:13px;color:${C.deep};line-height:1.55;">${m.texte}</p>
        </div>
      `).join('')}

      <p style="margin:16px 0 10px;font-size:13px;font-weight:800;color:${C.ink};">À imprimer</p>
      <p style="margin:0 0 8px;font-size:12.5px;color:${C.muted};line-height:1.6;">
        <strong style="color:${C.ink};">Ton QR code</strong> pour la vitrine, le comptoir ou tes sacs :
        ${avant_lancement
          ? 'il inscrit tes clients en un scan, et basculera tout seul vers ta page le 1er septembre.'
          : 'il ouvre ta page directement.'}
        Tu le télécharges en PNG ou en PDF depuis ton dashboard.
      </p>
      <p style="margin:0 0 14px;font-size:12.5px;color:${C.muted};line-height:1.6;">
        <strong style="color:${C.ink};">Ton affichette de fidélité</strong> (si tu actives le programme) : une feuille A5 à poser près de ta caisse,
        qui explique à tes clients qu'un simple numéro de GSM suffit. <a href="${affichetteUrl}" style="color:${C.main};">La voir</a>
      </p>

      <div style="background:${C.bg};border-radius:12px;padding:14px 16px;margin-bottom:6px;">
        <p style="margin:0 0 6px;font-size:12.5px;font-weight:800;color:${C.ink};">Le conseil qui change tout</p>
        <p style="margin:0;font-size:12.5px;color:${C.deep};line-height:1.6;">
          ${avant_lancement
            ? 'Les commerces qui démarrent le mieux sont ceux qui en parlent une fois à chaque client dès maintenant. Le 1er septembre, ils ouvrent avec une clientèle déjà prête.'
            : 'Les commerces qui démarrent le mieux sont ceux qui en parlent une fois à chaque client, pendant deux semaines. Une phrase au comptoir vaut dix publications.'}
        </p>
      </div>
    `,
    ctaUrl: kitUrl,
    ctaLabel: 'Ouvrir mon kit',
  })
}

// ─── Bons cadeaux (module 3, 31/07) ─────────────────────────────────────────

// Bloc visuel du bon : code en gros, montant, validité. Partagé par les deux
// emails (bénéficiaire et acheteur-pour-soi).
function blocBonCadeau({ code, montant, commercant_nom, expires_at }) {
  return `
    <div style="background:linear-gradient(135deg,#160636 0%,#2D0F6B 100%);border-radius:16px;padding:22px 20px;margin-bottom:14px;text-align:center;">
      <p style="margin:0 0 2px;font-size:11px;font-weight:800;color:${C.light};text-transform:uppercase;letter-spacing:1px;">Bon cadeau · ${commercant_nom}</p>
      <p style="margin:0 0 10px;font-size:30px;font-weight:900;color:#fff;letter-spacing:-1px;">${Number(montant).toFixed(2)} €</p>
      <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${C.light};text-transform:uppercase;letter-spacing:1px;">Ton code</p>
      <p style="margin:0;font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;font-family:monospace;background:rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;display:inline-block;">${code}</p>
      ${expires_at ? `<p style="margin:10px 0 0;font-size:11px;color:${C.light};">Valable jusqu'au <strong>${formatDateFr(String(expires_at).slice(0, 10))}</strong></p>` : ''}
    </div>
    <p style="margin:0 0 14px;font-size:12px;color:${C.muted};line-height:1.6;">
      Ce bon s'utilise <strong>en une ou plusieurs fois</strong>, directement chez <strong>${commercant_nom}</strong> (montre ton code au comptoir) ou lors d'une commande en ligne sur Yoppaa (champ « J'ai un bon cadeau » au moment de payer). Le solde restant reste sur le bon.
    </p>`
}

// 15) Email AU BÉNÉFICIAIRE : quelqu'un t'offre un bon cadeau
export function emailBonCadeauBeneficiaire({
  beneficiaire_prenom, acheteur_prenom, commercant_nom,
  montant, code, token, message = null, expires_at = null,
}) {
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: 'On t\'offre un bon cadeau 🟣',
    intro: `<strong>${beneficiaire_prenom || 'Hello'}</strong>, ${acheteur_prenom ? `<strong>${acheteur_prenom}</strong> t'offre` : 'on t\'offre'} un bon cadeau chez <strong>${commercant_nom}</strong> !`,
    body: `
      ${message ? `
      <div style="background:${C.pale};border-radius:12px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 2px;font-size:10px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">${acheteur_prenom ? `Le mot de ${acheteur_prenom}` : 'Petit mot'}</p>
        <p style="margin:0;font-size:13px;color:${C.deep};line-height:1.55;font-style:italic;">« ${message} »</p>
      </div>` : ''}
      ${blocBonCadeau({ code, montant, commercant_nom, expires_at })}
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;">
        Garde cet email précieusement : le code, c'est ton bon. Tu peux aussi retrouver ton solde à tout moment via le bouton ci-dessous.
      </p>
    `,
    ctaUrl: `https://www.yoppaa.app/cadeau/${token}`,
    ctaLabel: 'Voir mon bon cadeau',
  })
}

// 16) Email À L'ACHETEUR : confirmation d'achat (reçoit le code si le bon est
// pour lui ; sinon simple confirmation que le cadeau est parti)
export function emailBonCadeauAcheteur({
  acheteur_prenom, commercant_nom, montant, code = null, token = null,
  beneficiaire_email = null, beneficiaire_prenom = null, expires_at = null, pour_moi = true,
}) {
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: pour_moi ? 'Ton bon cadeau est prêt' : 'Ton cadeau est envoyé 🟣',
    intro: pour_moi
      ? `<strong>${acheteur_prenom || 'Merci'}</strong>, ton bon cadeau chez <strong>${commercant_nom}</strong> est activé !`
      : `<strong>${acheteur_prenom || 'Merci'}</strong>, ton bon cadeau chez <strong>${commercant_nom}</strong> vient d'être envoyé à <strong>${beneficiaire_prenom || beneficiaire_email}</strong> 🟣`,
    body: pour_moi
      ? blocBonCadeau({ code, montant, commercant_nom, expires_at })
      : `
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid ${C.pale};margin-bottom:14px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Bon cadeau offert</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:${C.ink};letter-spacing:-1px;">${Number(montant).toFixed(2)} €</p>
        <p style="margin:6px 0 0;font-size:13px;color:${C.muted};">envoyé à <strong style="color:${C.ink};">${beneficiaire_prenom || ''} ${beneficiaire_email ? `(${beneficiaire_email})` : ''}</strong></p>
      </div>
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.6;">
        Le code est dans son email : c'est son bon, valable en une ou plusieurs fois chez ${commercant_nom}. Ce reçu vaut confirmation de ton paiement.
      </p>`,
    ctaUrl: pour_moi && token ? `https://www.yoppaa.app/cadeau/${token}` : 'https://www.yoppaa.app/commander',
    ctaLabel: pour_moi && token ? 'Voir mon bon cadeau' : 'Explorer les commerces',
  })
}

// 17) Email AU COMMERÇANT : un bon cadeau vient d'être vendu
export function emailBonCadeauVenduCommercant({ nom_commercant, montant, acheteur_email, pour_moi }) {
  return layout({
    audience: 'commercant',
    title: 'Bon cadeau vendu 🟣',
    intro: `Bonne nouvelle <strong>${nom_commercant}</strong>, tu viens de vendre un bon cadeau de <strong>${Number(montant).toFixed(2)} €</strong> !`,
    body: `
      <p style="margin:0 0 10px;font-size:13px;color:${C.deep};line-height:1.6;">
        Acheté par <strong>${acheteur_email}</strong>${pour_moi ? '' : ', offert à un proche'}. Le montant part directement sur ton compte Stripe, comme une vente classique.
      </p>
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.6;">
        Quand le client viendra l'utiliser, encode simplement son code dans ton dashboard → onglet Bons cadeaux (ou il l'appliquera lui-même en commandant en ligne).
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app/dashboard',
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
    audience: 'commercant',
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
