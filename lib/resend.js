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
import { euros } from './montants'
import { etatPaiementClient, soldeRdv } from './rdv-paiement'
// ⚠️ AUCUNE DATE D'OUVERTURE ÉCRITE EN DUR DANS UN EMAIL. Le kit annonçait
// « 1er septembre » CINQ FOIS alors que l'ouverture est passée au 1er octobre :
// des commerçants ont donc reçu, noir sur blanc, une date fausse à recopier sur
// leurs réseaux. La date vient désormais de `lib/lancement.js`, comme partout
// ailleurs, et le jour où elle bouge, ces phrases bougent avec elle.
import { libelleLancement } from './lancement'
import { nomTransporteur, suiviUrl } from './transporteurs'

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

// Les lignes de DÉTAIL qui expliquent pourquoi le total a baissé.
//
// 🔴 SANS ELLES, LE DÉCOMPTE SE LIT COMME UNE ERREUR. Alex, 27/08 : la remise
// était bien appliquée, mais l'email affichait « Prix 40,00 € · Acompte payé
// 9,00 € · Solde 21,00 € ». Or 40 moins 9 ne fait pas 21. Le client doute, le
// commerçant doute, et celui qui doute réclame le montant affiché en haut.
//
// ⚠️ RÈGLE D'ALEX : « ça doit être affiché PARTOUT où on parle de la
// transaction. » D'où une fonction unique, appelée par chaque gabarit qui
// dresse un décompte, plutôt qu'un bloc recopié qu'on oublierait quelque part.
//
// ⚠️ L'ORDRE EST CELUI DE L'APPLICATION : la récompense d'abord (une remise du
// commerçant), le bon cadeau ensuite (de l'argent déjà payé). Même ordre que
// `appliquerRecompenseAvantBon` et que `phraseAvantages` : les trois doivent
// raconter la même histoire.
//
// Rend une chaîne vide quand il n'y a rien à dire : une ligne « −0,00 € » vaut
// moins que pas de ligne du tout.
export function lignesAvantages(C, { fidelite_remise = 0, bon_cadeau_montant = 0 } = {}) {
  const montant = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  // ⚠️ MÊME LOOK QUE LES EMAILS DE COMMANDE, où ce détail existe depuis le
  // 25/08 et qu'Alex a validé. Deux présentations pour la même information
  // feraient douter que ce soit la même chose.
  const ligne = (libelle, couleur, valeur) => `<tr>
        <td style="padding:10px 14px;color:${couleur};font-size:13px;font-weight:700;border-bottom:1px solid ${C.pale};">${libelle}</td>
        <td style="padding:10px 14px;color:${couleur};font-size:13px;font-weight:800;text-align:right;border-bottom:1px solid ${C.pale};">−${euros(valeur)}</td>
      </tr>`
  const recompense = montant(fidelite_remise)
  const bon = montant(bon_cadeau_montant)
  return [
    recompense ? ligne('🟣 Récompense fidélité', C.main, recompense) : '',
    bon ? ligne('🎁 Bon cadeau', '#10B981', bon) : '',
  ].join('')
}

export async function envoyerAuAdmin({ subject, html, attachments }) {
  return envoyer({ to: ADMIN_EMAIL, subject, html, attachments })
}

export async function envoyerAuCommercant({ to, subject, html, attachments }) {
  return envoyer({ to, subject, html, attachments })
}

// ⚠️ LE TEXTE LIBRE D'UNE PERSONNE ARRIVE DANS LA BOÎTE D'UNE AUTRE.
//
// Ces gabarits composent du HTML par interpolation, et plusieurs de leurs
// paramètres sont du texte libre écrit par UN PARTI et rendu chez UN AUTRE :
// la note de commande d'un client atterrit chez le commerçant, le mot d'un bon
// cadeau atterrit chez un destinataire que l'ACHETEUR choisit librement.
//
// Les clients mail retirent les `<script>`, donc ce n'est pas du XSS. Mais les
// ancres, les images et les styles, eux, survivent — dans un message signé
// DKIM et SPF par le domaine yoppaa.app, avec l'en-tête et le logo Yoppaa.
// C'est un hameçonnage à crédibilité maximale, offert par nous.
//
// ⚠️ ON N'ÉCHAPPE PAS TOUT EN BLOC : `body` est du HTML que le module compose
// lui-même, l'échapper afficherait les balises en clair. On échappe les VALEURS
// venues du dehors, une par une, là où elles entrent.
export function echapperHtml(v) {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
  // ⚠️ CETTE CLÉ MANQUAIT, ET VINGT-DEUX PARAGRAPHES L'UTILISAIENT DÉJÀ.
  // `${C.deep}` rendait la chaîne « undefined », donc `color:undefined` : une
  // déclaration CSS invalide, que les clients mail jettent en silence. Le texte
  // retombait sur la couleur du <body>, assez proche pour que personne ne le
  // voie jamais — le genre de défaut qui ne se signale pas tout seul.
  deep:    '#2D0F6B',
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
  const adminUrl = 'https://www.yoppaa.app/admin'
  return layout({
    audience: 'admin',
    title: 'Nouveau commerçant à valider',
    intro: `<strong>${echapperHtml(nom)}</strong> vient de soumettre son inscription Yoppaa Pro et attend ta validation.`,
    body: `
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Récap</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:5px 0;color:${C.muted};">Type</td><td style="padding:5px 0;color:${C.ink};font-weight:700;text-align:right;">${echapperHtml(type || '—')}</td></tr>
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
export function emailDemandeRecue({ nom: nomBrut, plan }) {
  // ⚠️ `nom` arrive du CORPS DE LA REQUÊTE côté /api/notify-yoppaa, et cet
  // email part vers une adresse elle aussi choisie par l'appelant.
  const nom = echapperHtml(nomBrut)
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
          <td style="padding:6px 0;color:${C.main};font-weight:800;text-align:right;white-space:nowrap;">${euros(l.prix)} HTVA</td>
        </tr>`).join('')}
      <tr>
        <td style="padding:8px 0 0;border-top:1px solid ${C.pale};color:${C.muted};font-weight:700;">Total indicatif</td>
        <td style="padding:8px 0 0;border-top:1px solid ${C.pale};color:${C.ink};font-weight:900;text-align:right;white-space:nowrap;">${euros(total)} HTVA</td>
      </tr>
    </table>
  `
}

export function emailAccompagnementPayeAdmin({ commercant_id, nom, email, telephone, adresse, categorie, plan, lignes, total, message }) {
  return layout({
    audience: 'admin',
    title: 'Accompagnement payé',
    intro: `<strong>${echapperHtml(nom)}</strong> vient de payer un accompagnement sur place ou du matériel depuis son tableau de bord.`,
    body: `
      <div style="background:${C.bg};border-radius:12px;padding:16px 18px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Payé</p>
        ${tableauLignes(lignes, total)}
      </div>
      ${message ? `<div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#B45309;text-transform:uppercase;letter-spacing:0.7px;">Son message</p>
        <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.6;">${echapperHtml(message)}</p>
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
//
// ⚠️ IL PARTAIT AVEC LE MÊME TITRE QUE LE KIT — « Bienvenue dans la tribu
// Yoppaa » — et les DEUX arrivent à la seconde près (`app/api/admin/valider`
// les envoie l'un derrière l'autre). Le commerçant voyait deux fois la même
// ligne dans sa boîte et en ouvrait un seul.
//
// ⚠️ ET IL SE CONTREDISAIT AVEC LE KIT. Celui-ci annonce une ouverture au
// public à venir, celui-là promettait que « tes premiers clients peuvent déjà
// te trouver ». Les deux ne peuvent pas être vrais. La vérité est entre les
// deux, et elle est utile : la page est BEL ET BIEN en ligne dès maintenant,
// mais personne ne parcourt encore Yoppaa. Elle se trouve donc par le LIEN que
// le commerçant donne, pas par hasard — ce qui est exactement ce que le kit lui
// demande de faire.
export function emailValidationCommercant({ nom, slug, avant_lancement = false }) {
  const ficheUrl     = slug ? `https://www.yoppaa.app/commander/${slug}` : 'https://www.yoppaa.app/commander'
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  const ouverture    = libelleLancement()
  return layout({
    audience: 'commercant',
    title: 'Ta page est en ligne',
    intro: `C'est validé <strong>${nom}</strong> : ta page Yoppaa est <strong style="color:${C.main};">en ligne</strong> dès maintenant, et ton tableau de bord t'est ouvert.`,
    body: `
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        ${avant_lancement
          ? `Tous ceux à qui tu donnes ton lien y trouvent déjà tes horaires, tes infos et de quoi te contacter. L'ouverture au grand public, elle, c'est le <strong>${ouverture}</strong> : d'ici là, ce sont tes clients à toi qui arrivent en premier.`
          : 'Tes clients peuvent déjà te trouver, voir tes horaires, et te contacter directement depuis ta fiche.'}
      </p>
      <div style="background:${C.bg};border-radius:12px;padding:16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Ta fiche publique</p>
        <p style="margin:0;font-size:13px;color:${C.main};font-weight:700;word-break:break-all;">
          <a href="${ficheUrl}" style="color:${C.main};text-decoration:none;">${ficheUrl}</a>
        </p>
      </div>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:${C.ink};">
        Conseil : depuis ton tableau de bord, complète ton catalogue, ajoute un deal ou une actu. Une fiche vivante donne envie de revenir.
      </p>
      <p style="margin:0;font-size:12.5px;line-height:1.6;color:${C.muted};">
        Un second email arrive juste derrière celui-ci : ton <strong style="color:${C.ink};">kit de partage</strong>, avec ton lien, ton QR code et tes messages prêts à copier.
      </p>
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Ouvrir mon tableau de bord',
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
        <p style="margin:0;font-size:14px;line-height:1.55;color:#7C2D12;font-weight:600;">${echapperHtml(motif) || 'Documents à compléter — voir détails sur ton signup.'}</p>
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
  // ⚠️ www, comme partout ailleurs. Le domaine nu redirige, mais c'est un saut
  // de plus et ce n'est pas l'adresse canonique du site.
  const signupUrl = 'https://www.yoppaa.app/signup'
  return layout({
    title: 'Demande à compléter',
    intro: `Bonjour <strong>${nom}</strong>, ta demande Yoppaa Pro nécessite quelques ajustements avant qu'on puisse activer ta page.`,
    body: `
      <div style="background:#FFF7ED;border-left:4px solid #EA580C;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#9A3412;text-transform:uppercase;letter-spacing:0.7px;">Motif</p>
        <p style="margin:0;font-size:14px;line-height:1.55;color:#7C2D12;font-weight:600;">${echapperHtml(motif) || 'Profil incomplet — voir détails depuis ton onboarding.'}</p>
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

// 🔴 CE QUI A FAIT BAISSER LE PRIX SE DIT DANS LES EMAILS AUSSI (Alex, 26/08 :
// « il faut aussi mentionner quand un montant de la fidélité ou BC a été
// utilisé »). Un email qui annonce un total sans dire qu'une récompense l'a
// entamé laisse le commerçant ET le client avec deux chiffres qui ne se
// rejoignent pas, et personne pour les expliquer.
//
// ⚠️ ORDRE D'APPLICATION, jamais l'ordre alphabétique : la récompense d'abord
// (une remise), le bon cadeau ensuite (de l'argent déjà payé). C'est ce que
// fait `appliquerRecompenseAvantBon`, et les deux doivent dire la même chose.
//
// ⚠️ ET AUCUNE VALEUR NE VIENT D'ICI : les montants arrivent des routes, qui
// les lisent en base. Rend une chaîne vide quand il n'y a rien à dire, jamais
// « 0,00 € de récompense ».
export function ligneAvantagesEmail({ fidelite_remise, bon_cadeau_montant } = {}) {
  const montant = (v) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const recompense = montant(fidelite_remise)
  const bon = montant(bon_cadeau_montant)
  if (!recompense && !bon) return ''

  const bouts = []
  if (recompense) bouts.push(`<strong>${euros(recompense)}</strong> de récompense fidélité`)
  if (bon) bouts.push(`<strong>${euros(bon)}</strong> en bon cadeau`)
  return `Dont ${bouts.join(' et ')}.`
}

// 4) Email AU YOPPER : RDV confirmé (iCal joint)
//    Envoyé après webhook payment_intent.succeeded OU insert direct sans acompte.
export function emailRdvConfirme({
  yopper_prenom, commercant_nom, commercant_adresse,
  prestation_nom, date_rdv, heure_debut, heure_fin, duree_minutes,
  prix_estime, acompte_paye, acompte_montant, fidelite_remise = 0, delai_annulation_heures = 24,
  annulation_token = null,
  // La référence du rendez-vous, déjà formée par `referenceRdv()` : « RV12 ».
  // Elle n'existait NULLE PART dans cet email, alors que c'est elle que le
  // commerçant cherche dans son agenda quand le client appelle.
  numero_rdv = null,
  praticien_prenom = null, praticien_nom = null, praticien_couleur = null,
  infos_pratiques = null,
  // ⚠️ LE MÊME EMAIL SERT AU DÉPLACEMENT, et c'est voulu : le client a besoin
  // exactement des mêmes informations, plus une. En fabriquer un deuxième
  // aurait fait diverger l'adresse gravée, l'acompte et le fichier calendrier,
  // qui vivent tous ici.
  //
  // ⚠️ MAIS LE TITRE DOIT CHANGER. « Ton RDV est confirmé » sur un rendez-vous
  // qu'on vient de décaler est vrai au mot près et faux dans l'effet : le
  // client survole, reconnaît une confirmation qu'il a déjà lue, et se présente
  // à l'ancienne heure. Ce qui doit sauter aux yeux, c'est le CHANGEMENT.
  deplace = false,
  ancienne_date = null,
  ancienne_heure = null,
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
  // 🔴 CE CALCUL ÉTAIT FAIT ICI, ET IL OUBLIAIT LA REMISE DE FIDÉLITÉ. Il rendait
  // `prix_estime - acompte_montant`, donc 28 € là où le client ne devait que
  // 21 € : le comptoir aurait réclamé 7 € de trop. La règle vit désormais dans
  // `soldeRdv`, avec le rappel de la veille qui portait le même trou.
  const solde = soldeRdv({ prix_estime, fidelite_remise, acompte_montant, acompte_paye })
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: deplace ? 'Ton RDV a été déplacé' : 'Ton RDV est confirmé',
    intro: deplace
      ? `<strong>${echapperHtml(yopper_prenom)}</strong>, ton rendez-vous chez <strong>${echapperHtml(commercant_nom)}</strong> a été <strong>déplacé</strong>. Voici la nouvelle date à retenir 🟣`
      : `<strong>${echapperHtml(yopper_prenom)}</strong>, ton rendez-vous chez <strong>${echapperHtml(commercant_nom)}</strong> est bien confirmé. À très vite 🟣`,
    body: `
      ${deplace && ancienne_date ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">Ce qui change</p>
        <p style="margin:0;font-size:13px;color:#7C2D12;line-height:1.6;">
          <span style="text-decoration:line-through;">${formatDateFr(ancienne_date)}${ancienne_heure ? ` à ${ancienne_heure.slice(0,5)}` : ''}</span><br/>
          <strong>Nouvelle date : ${formatDateFr(date_rdv)}${heure_debut ? ` à ${heure_debut.slice(0,5)}` : ''}</strong>
        </p>
      </div>` : ''}
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Quand</p>
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_rdv)}</p>
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'} (${duree_minutes || '?'} min)</p>
        ${numero_rdv ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Rendez-vous <strong style="color:${C.main};">#${numero_rdv}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Prestation</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${prestation_nom || '—'}</td></tr>
        ${praticien_prenom ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Avec</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};"><span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:${praticien_couleur || C.main};display:inline-block;"></span>${praticien_prenom}${praticien_nom ? ' ' + praticien_nom : ''}</span></td></tr>` : ''}
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Adresse</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${echapperHtml(commercant_adresse) || '—'}</td></tr>
        ${prix_estime != null ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Prix</td><td style="padding:10px 14px;color:${C.main};font-weight:900;text-align:right;border-bottom:1px solid ${C.pale};">${euros(Number(prix_estime))}</td></tr>` : ''}
        ${lignesAvantages(C, { fidelite_remise })}
        ${acompte_paye ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Acompte payé</td><td style="padding:10px 14px;color:#10B981;font-weight:800;text-align:right;border-bottom:1px solid ${C.pale};">✓ ${euros(Number(acompte_montant))}</td></tr>` : ''}
        ${solde != null && solde > 0 ? `<tr><td style="padding:10px 14px;color:${C.muted};">Solde sur place</td><td style="padding:10px 14px;color:${C.deep};font-weight:800;text-align:right;">${euros(solde)}</td></tr>` : ''}
      </table>
      ${(produits && produits.lignes && produits.lignes.length > 0) ? `
      <div style="background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <p style="margin:0;padding:10px 14px;background:${C.pale};font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Tes produits, prêts pour ce jour-là</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${produits.lignes.map(l => `<tr><td style="padding:9px 14px;color:${C.ink};font-weight:700;border-bottom:1px solid ${C.pale};">${l.quantite} × ${l.nom}</td><td style="padding:9px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${euros(Number(l.total))}</td></tr>`).join('')}
          <tr><td style="padding:10px 14px;color:${C.muted};">Payé en ligne</td><td style="padding:10px 14px;color:#10B981;font-weight:900;text-align:right;">✓ ${euros(Number(produits.total))}</td></tr>
        </table>
      </div>
      <p style="margin:0 0 14px;font-size:12px;color:${C.deep};line-height:1.55;">
        Tes produits sont mis de côté. Tu les récupères en même temps que ton rendez-vous, rien à repayer sur place.
      </p>` : ''}
      <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${C.ink};">
        ${deplace
          ? 'Rien d\'autre ne change : même prestation, même prix, même référence 🟣'
          : 'Tout est prêt 🟣 Tu peux ajouter ce RDV à ton calendrier dès maintenant.'}
      </p>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1.5px dashed ${C.main}44;margin-bottom:6px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">📅 Ajout au calendrier</p>
        <p style="margin:0;font-size:12px;color:${C.deep};line-height:1.55;">Un fichier <strong>.ics</strong> est joint à cet email. ${deplace ? 'Ouvre-le pour <strong>mettre à jour</strong> le RDV déjà présent dans ton calendrier (Apple, Google, Outlook) : il se déplace tout seul, tu n\'auras pas deux rendez-vous.' : 'Ouvre-le pour ajouter le RDV à ton calendrier (Apple, Google, Outlook).'} Rappel automatique 24h avant.</p>
      </div>
      ${infos_pratiques ? `
      <div style="background:${C.pale};border-radius:12px;padding:12px 14px;margin-top:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">Infos pratiques de ${echapperHtml(commercant_nom)}</p>
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
  // ⚠️ LE MOTIF « LIEU » N'EST PAS UN LIBELLÉ DE PLUS. Quand un commerçant
  // déplace un emplacement, le verrou l'oblige à annuler les rendez-vous qui
  // s'y tenaient (règle d'Alex du 13/08). Sans motif propre, le client lit
  // « Annulé par Studio Souffle » et comprend qu'on ne veut plus de lui, alors
  // que le cours a simplement changé d'adresse et qu'il est invité à revenir.
  // Un même geste, deux lectures opposées : c'est le texte qui décide.
  const lieuChange = raison_annulation === 'lieu'
  const raisonLabel = lieuChange
    ? `Le lieu a changé chez <strong>${echapperHtml(commercant_nom)}</strong>`
    : raison_annulation === 'commercant'
      ? `Annulé par <strong>${echapperHtml(commercant_nom)}</strong>`
      : raison_annulation === 'auto'
        ? 'Annulé automatiquement (paiement non finalisé)'
        : 'Annulé à ta demande'
  return layout({
    title: lieuChange ? 'Ton RDV change d’endroit' : 'Ton RDV a été annulé',
    intro: lieuChange
      ? `<strong>${echapperHtml(yopper_prenom)}</strong>, ton rendez-vous du <strong>${formatDateFr(date_rdv)} à ${heure_debut?.slice(0,5) || '?'}</strong> chez <strong>${echapperHtml(commercant_nom)}</strong> ne peut pas être maintenu : l’endroit a changé. Reprends ta place en un clic, tu retrouveras les horaires à la nouvelle adresse.`
      : `<strong>${echapperHtml(yopper_prenom)}</strong>, ton rendez-vous du <strong>${formatDateFr(date_rdv)} à ${heure_debut?.slice(0,5) || '?'}</strong> chez <strong>${echapperHtml(commercant_nom)}</strong> est annulé.`,
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
            ? `<strong>${euros(Number(acompte_montant))}</strong> seront recrédités sur ta carte sous 5 à 10 jours ouvrés.`
            : `Acompte payé : <strong>${euros(Number(acompte_montant))}</strong>. Contacte le commerçant si tu as une question.`}
        </p>
      </div>` : ''}
      <p style="margin:0 0 4px;font-size:13px;color:${C.ink};line-height:1.6;">
        Le RDV a été automatiquement retiré de ton calendrier (un fichier .ics d'annulation est joint à cet email).
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: lieuChange ? 'Reprendre ma place' : 'Reprendre un RDV',
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
    intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, le rendez-vous du <strong>${formatDateFr(date_rdv)} à ${heure_debut?.slice(0,5) || '?'}</strong> chez <strong>${echapperHtml(commercant_nom)}</strong> a été marqué <strong style="color:#6B7280;">non honoré</strong>.`,
    body: `
      <div style="background:#F9FAFB;border-left:4px solid #6B7280;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#374151;text-transform:uppercase;letter-spacing:0.7px;">Prestation</p>
        <p style="margin:0;font-size:14px;color:${C.ink};font-weight:600;">${prestation_nom || '—'}</p>
      </div>
      <p style="margin:0 0 14px;font-size:13px;color:${C.ink};line-height:1.6;">
        Si tu penses qu'il y a une erreur, contacte directement <strong>${echapperHtml(commercant_nom)}</strong> pour clarifier la situation.
      </p>
      ${acompte_paye && acompte_montant ? `
      <div style="background:#FFF7ED;border-left:4px solid #EA580C;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#9A3412;text-transform:uppercase;letter-spacing:0.7px;">Acompte</p>
        <p style="margin:0;font-size:13px;color:#7C2D12;line-height:1.55;font-weight:600;">
          L'acompte de <strong>${euros(Number(acompte_montant))}</strong> est conservé par le commerçant car le créneau a été bloqué pour toi. Pour un geste commercial, contacte-le directement.
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
    intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, petit rappel : tu as un RDV chez <strong>${echapperHtml(commercant_nom)}</strong> demain ${formatDateFr(date_rdv).split(' ').slice(0,3).join(' ')} à <strong>${heure_debut?.slice(0,5) || '?'}</strong> 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${heure_debut?.slice(0,5) || '?'} → ${heure_fin?.slice(0,5) || '?'} (${duree_minutes || '?'} min)</p>
        <p style="margin:6px 0 0;font-size:13px;color:${C.deep};font-weight:700;">${prestation_nom || '—'}</p>
        ${commercant_adresse ? `<p style="margin:6px 0 0;font-size:12px;color:${C.muted};">📍 ${echapperHtml(commercant_adresse)}</p>` : ''}
      </div>
      ${solde_a_prevoir != null && solde_a_prevoir > 0 ? `
      <div style="background:#FFFBEB;border:1px solid #F59E0B33;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0;font-size:13px;color:#78350F;font-weight:700;">💰 Solde à régler sur place : <strong>${euros(Number(solde_a_prevoir))}</strong></p>
      </div>` : ''}
      ${mapsUrl ? `
      <div style="text-align:center;margin-bottom:14px;">
        <a href="${mapsUrl}" style="display:inline-block;padding:10px 18px;background:#fff;color:${C.main};border:1.5px solid ${C.main};border-radius:100px;font-weight:800;font-size:13px;text-decoration:none;">📍 Itinéraire Google Maps</a>
      </div>` : ''}
      <p style="margin:0;font-size:11px;color:${C.muted};line-height:1.55;text-align:center;">
        ⏰ Le délai d'annulation (${delai_annulation_heures}h avant) est probablement dépassé. En cas d'urgence, contacte directement ${echapperHtml(commercant_nom)}.
      </p>
    `,
    ctaUrl: ficheUrl,
    ctaLabel: 'Voir mon RDV',
  })
}

// 7) Email AU YOPPER : récompense fidélité débloquée.
//
// ⚠️ CE GABARIT NE PARLAIT QUE DE RENDEZ-VOUS, et il servait l'ancienne
// fidélité, retirée le 27/08. Il annonçait « -X% à ton prochain RDV » et
// proposait « Réserver mon prochain RDV ». Or la fidélité unifiée couvre les
// trois segments, et ses récompenses sont des libellés libres écrits par le
// commerçant (« 10,00€ offerts », « Le 11e passage te fait gagner 5€ »), pas
// des pourcentages. Un client de boulangerie aurait reçu une invitation à
// prendre rendez-vous, et le montant de sa remise ne serait apparu nulle part.
//
// ⚠️ L'ANCIEN EMAIL DE PROGRESSION (« 4 sur 10 », après chaque passage) EST
// SUPPRIMÉ, arbitrage d'Alex du 27/08 : dix messages pour une récompense, quand
// la progression se lit déjà sur la fiche et sur la carte. On n'annonce que le
// déblocage, le seul moment qui vaut un message.
//
// ⚠️ ET IL DIT LE NOMBRE. Un crédit de cagnotte franchit parfois plusieurs
// seuils d'un coup : le 27/08, trois crédits au comptoir en ont ouvert SEPT.
// Le libellé décrit UNE récompense, d'où « chacune » au pluriel : écrit sans
// ce mot à côté de « 3 récompenses », « 10,00€ offerts » se lirait comme un
// total, et l'email mentirait des deux tiers.
//
// ⚠️ `libelle` EST DU TEXTE ÉCRIT PAR LE COMMERÇANT et il part dans la boîte
// d'un tiers : il s'échappe, comme le reste (règle du 22/08).
export function emailFideliteRecompenseDebloquee({
  prenom, commercant_nom, libelle, nombre = 1, carte_token,
}) {
  const n = Math.max(1, Math.floor(Number(nombre) || 1))
  const carteUrl = carte_token
    ? `https://www.yoppaa.app/carte/${carte_token}`
    : 'https://www.yoppaa.app/commander'
  const quoi = echapperHtml(libelle || 'Récompense fidélité')
  return layout({
    title: n > 1 ? 'Récompenses débloquées 🎉' : 'Récompense débloquée 🎉',
    intro: n > 1
      ? `<strong>${echapperHtml(prenom || 'Yopper')}</strong>, tu viens de débloquer <strong>${n} récompenses</strong> chez <strong>${echapperHtml(commercant_nom)}</strong> 🟣`
      : `<strong>${echapperHtml(prenom || 'Yopper')}</strong>, tu viens de débloquer ta récompense fidélité chez <strong>${echapperHtml(commercant_nom)}</strong> 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:24px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">${n > 1 ? `Tes ${n} récompenses` : 'Ta récompense'}</p>
        <p style="margin:0;font-size:28px;font-weight:900;letter-spacing:-1px;line-height:1.2;">${quoi}</p>
        <p style="margin:10px 0 0;font-size:13px;font-weight:700;opacity:0.9;">${n > 1 ? 'chacune, ' : ''}à présenter lors de ton prochain passage chez ${echapperHtml(commercant_nom)}</p>
      </div>
      <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.6;text-align:center;">
        Ta carte t'attend dans l'application. ${n > 1 ? 'Tes récompenses te seront proposées une par une, au moment de payer.' : 'Elle te sera proposée automatiquement au moment de payer.'} 🟣
      </p>
    `,
    ctaUrl: carteUrl,
    ctaLabel: 'Voir ma carte',
  })
}

// 9) Email AU COMMERÇANT : nouveau RDV (mode 'chaque')
export function emailNouveauRdvCommercant({
  nom_commercant, yopper_prenom, yopper_nom, yopper_email, yopper_telephone,
  prestation_nom, date_rdv, heure_debut, heure_fin, duree_minutes,
  prix_estime, acompte_paye, acompte_montant, fidelite_remise = 0, notes_client,
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
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Client</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${echapperHtml(yopper_prenom) || ''} ${echapperHtml(yopper_nom) || ''}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Email</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};font-size:12px;">${yopper_email || '—'}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};${prix_estime != null ? `border-bottom:1px solid ${C.pale};` : ''}">Téléphone</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;${prix_estime != null ? `border-bottom:1px solid ${C.pale};` : ''}">${yopper_telephone || '—'}</td></tr>
        ${prix_estime != null ? `<tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Prix</td><td style="padding:10px 14px;color:${C.main};font-weight:900;text-align:right;border-bottom:1px solid ${C.pale};">${euros(Number(prix_estime))}</td></tr>` : ''}
        ${/* ⚠️ LE COMMERÇANT AUSSI DOIT VOIR CE QUI A FAIT BAISSER LE PRIX. Sans
             cette ligne il lit un acompte plus petit que son tarif, sans
             explication, et c'est lui qui réclame la différence au comptoir. */''}
        ${lignesAvantages(C, { fidelite_remise })}
        ${acompte_paye ? `<tr><td style="padding:10px 14px;color:${C.muted};">Acompte payé en ligne</td><td style="padding:10px 14px;color:#10B981;font-weight:800;text-align:right;">✓ ${euros(Number(acompte_montant))}</td></tr>` : ''}
      </table>
      ${(produits && produits.lignes && produits.lignes.length > 0) ? `
      <div style="background:#ECFDF5;border-left:4px solid #10B981;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:#065F46;text-transform:uppercase;letter-spacing:0.6px;">Produits à préparer, déjà payés</p>
        ${produits.lignes.map(l => `<p style="margin:0 0 3px;font-size:13px;color:#065F46;font-weight:700;">${l.quantite} × ${l.nom}</p>`).join('')}
        <p style="margin:6px 0 0;font-size:12px;color:#047857;font-weight:800;">Total encaissé : ${euros(Number(produits.total))}</p>
      </div>` : ''}
      ${notes_client ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">Note du client</p>
        <p style="margin:0;font-size:13px;color:#7C2D12;font-weight:600;line-height:1.5;">${echapperHtml(notes_client)}</p>
      </div>` : ''}
    `,
    ctaUrl: dashboardUrl,
    ctaLabel: 'Voir dans mon dashboard',
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES COMMANDES C&C ALIM (Sprint A bis — 2026-06-07)
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ AUCUN EMAIL NE DISAIT SI C'ÉTAIT PAYÉ (Alex, 17/08, deux captures à
// l'appui : « dans les mails, rien ne dit payé ou pas payé, ou partiellement »).
// CC2 réglée au comptoir et CC3 réglée en ligne étaient RIGOUREUSEMENT
// identiques : « Total 15,00 € », « dont TVA », et rien d'autre. Le client
// partait donc sans savoir s'il devait emporter de quoi payer, et le seul
// moment où il s'en apercevait, c'était devant le comptoir.
//
// ⚠️ ET UN TOTAL N'EST PAS UN ÉTAT. Le montant était là depuis toujours : c'est
// le MOT qui manquait. Il vient donc en tête, et il vient de `etatPaiementClient`
// — la même fonction que la pastille de l'application, pour que l'email et
// l'écran ne puissent jamais raconter deux histoires différentes.
//
// Le bloc s'efface tout seul quand la commande ne porte pas l'information
// (`total` absent) : mieux vaut rien qu'un « À régler 0,00 € ».
export function blocPaiementYopper(commande) {
  // ⚠️ ON TESTE L'ABSENCE, PAS LE NOMBRE. Sans total ni moyen déclaré, on ne
  // sait RIEN : annoncer « À régler sur place » serait une invention, et
  // annoncer « 0,00 € » serait le piège du zéro pour la cinquième fois.
  const rienDeSu = !commande
    || (!commande.paye_en_ligne && !commande.encaisse_mode && !Number.isFinite(Number(commande.total)))
  if (rienDeSu) return ''
  const etat = etatPaiementClient(commande)
  if (!etat) return ''
  const paye = etat.cle === 'paye'
  const teinte = paye
    ? { fond: '#ECFDF5', bord: '#10B981', titre: '#065F46', texte: '#064E3B' }
    : { fond: '#FFF7ED', bord: '#EA580C', titre: '#7C2D12', texte: '#9A3412' }
  return `
  <div style="background:${teinte.fond};border-left:4px solid ${teinte.bord};border-radius:10px;padding:12px 14px;margin-bottom:14px;">
    <p style="margin:0 0 3px;font-size:11px;font-weight:800;color:${teinte.titre};text-transform:uppercase;letter-spacing:0.6px;">${paye ? '✓ ' : ''}${etat.libelle}</p>
    ${etat.detail ? `<p style="margin:0;font-size:12.5px;color:${teinte.texte};line-height:1.5;font-weight:600;">${etat.detail}</p>` : ''}
  </div>`
}

// Helper rendu liste articles commande
function renderArticlesRows(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return ''
  return articles.map(a => `
    <tr>
      <td style="padding:8px 14px;color:${C.ink};font-size:13px;border-bottom:1px solid ${C.pale};">
        <strong>${a.quantite || 1}×</strong> ${a.nom || '—'}
        ${a.option_libelle ? `<br/><span style="color:${C.muted};font-size:11px;">${a.option_libelle}</span>` : ''}
      </td>
      <td style="padding:8px 14px;color:${C.ink};font-size:13px;text-align:right;font-weight:700;border-bottom:1px solid ${C.pale};white-space:nowrap;">${a.prix_total != null ? euros(a.prix_total) : ''}</td>
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
  // ⚠️ REMISE DE FIDÉLITÉ, déduite AVANT le bon cadeau. C'est l'ordre du
  // module depuis le 24/08 : la récompense abaisse le prix, le bon cadeau paie
  // ce qui reste. Dans l'autre sens, le bon serait consommé sur une part que
  // le commerçant offrait de toute façon.
  fidelite_remise = 0,
  // Ventilation de TVA calculée depuis les taux FIGÉS sur les lignes de la
  // commande : [{ taux, base, tva, ttc }]. Vide pour une commande antérieure au
  // figement, auquel cas on n'affiche rien plutôt qu'un chiffre faux.
  ventilation_tva = [],
  tva_taux_livraison = null,    // taux appliqué aux frais de livraison (accessoire de la vente)
  annulation_token = null, delai_annulation_heures = 2,
  offrir_mdp = false,  // true si le client n'a pas encore de compte (pas de mot de passe)
  offrir_mdp_email = '',  // email de la commande : le lien le transporte pour cibler le BON compte
  // ⚠️ L'ÉTAT DU PAIEMENT. La commande telle qu'elle est en base (paye_en_ligne,
  // total, bon_cadeau_montant, encaisse_mode…), pour que le ticket dise s'il
  // faut emporter de quoi payer. Voir blocPaiementYopper.
  paiement = null,
}) {
  // ⚠️ LES DEUX REMISES SE LISENT DANS LE MÊME ORDRE QU'ELLES S'APPLIQUENT :
  // récompense d'abord, bon cadeau ensuite. Et le net se calcule UNE fois, ici,
  // plutôt que dans chaque ligne du tableau : recalculé à trois endroits, il
  // aurait fini par diverger sur un arrondi, dans un document qui parle
  // d'argent au client.
  const remiseFidEUR = Number(fidelite_remise) || 0
  const bonEUR = Number(bon_cadeau_montant) || 0
  const netApresRemises = total != null
    ? Math.round(Math.max(0, Number(total) - remiseFidEUR - bonEUR) * 100) / 100
    : 0

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
    intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, ta commande chez <strong>${echapperHtml(commercant_nom)}</strong> est bien enregistrée 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">${titreQuand}</p>
        ${estExpedition ? '' : `<p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;">${formatDateFr(date_retrait)}</p>`}
        <p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;">${ligneHoraire}</p>
        ${numero_commande ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Commande <strong style="color:${C.main};">#${numero_commande}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${renderArticlesRows(articles)}
        ${(estLivraison || estExpedition) && Number(frais_livraison) > 0 ? `<tr><td style="padding:10px 14px;color:${C.deep};font-size:13px;font-weight:600;border-top:1px solid ${C.pale};">${estExpedition ? 'Frais de port' : 'Frais de livraison'}${tva_taux_livraison != null ? ` <span style="color:${C.muted};font-weight:600;">(TVA ${tva_taux_livraison} %)</span>` : ''}</td><td style="padding:10px 14px;color:${C.deep};font-size:13px;font-weight:700;text-align:right;border-top:1px solid ${C.pale};">${euros(Number(frais_livraison))}</td></tr>` : ''}
        ${total != null ? `<tr><td style="padding:12px 14px;color:${C.ink};font-size:14px;font-weight:900;background:${C.bg};">Total</td><td style="padding:12px 14px;color:${C.main};font-size:16px;font-weight:900;text-align:right;background:${C.bg};">${euros(Number(total))}</td></tr>` : ''}
        ${remiseFidEUR > 0 ? `
        <tr><td style="padding:10px 14px;color:${C.main};font-size:13px;font-weight:700;">🟣 Récompense fidélité</td><td style="padding:10px 14px;color:${C.main};font-size:13px;font-weight:800;text-align:right;">−${euros(remiseFidEUR)}</td></tr>` : ''}
        ${bonEUR > 0 ? `
        <tr><td style="padding:10px 14px;color:#10B981;font-size:13px;font-weight:700;">🎁 Bon cadeau</td><td style="padding:10px 14px;color:#10B981;font-size:13px;font-weight:800;text-align:right;">−${euros(bonEUR)}</td></tr>` : ''}
        ${(remiseFidEUR > 0 || bonEUR > 0) ? `
        <tr><td style="padding:10px 14px;color:${C.ink};font-size:13px;font-weight:900;border-top:1px solid ${C.pale};">${netApresRemises > 0 ? 'Total après remise' : 'Plus rien à payer'}</td><td style="padding:10px 14px;color:${C.ink};font-size:13px;font-weight:900;text-align:right;border-top:1px solid ${C.pale};">${euros(netApresRemises)}</td></tr>` : ''}
        ${ventilation_tva.length > 0 ? `
        <tr><td colspan="2" style="padding:10px 14px 4px;color:${C.muted};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;border-top:1px solid ${C.pale};">Dont TVA</td></tr>
        ${ventilation_tva.map(v => `
        <tr>
          <td style="padding:3px 14px;color:${C.muted};font-size:12px;">TVA ${v.taux} % · base ${euros(v.base)}</td>
          <td style="padding:3px 14px;color:${C.deep};font-size:12px;font-weight:700;text-align:right;">${euros(v.tva)}</td>
        </tr>`).join('')}
        <tr><td colspan="2" style="padding:4px 14px 10px;color:${C.muted};font-size:10.5px;line-height:1.5;">Prix TVA comprise. Ce ticket est un justificatif de commande, pas une facture.</td></tr>` : ''}
      </table>
      ${blocPaiementYopper(paiement)}
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📍 ${estExpedition ? 'Adresse d\'expédition' : estLivraison ? 'Adresse de livraison' : 'Adresse de retrait'}</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${echapperHtml((estLivraison || estExpedition) ? adresse_livraison : commercant_adresse) || '—'}</p>
      </div>
      <p style="margin:0 0 14px;font-size:12px;color:${C.muted};line-height:1.55;">
        🔔 ${estBoutiqueRetrait
          ? `<strong>${echapperHtml(commercant_nom)} prépare ta commande.</strong> Tu reçois un email et une notification dès qu'elle t'attend en boutique : inutile de te déplacer avant, tu ne peux pas la manquer.`
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

// 11ter) Email AU YOPPER : sa commande l'attend toujours
//
// ⚠️ IL N'Y AVAIT AUCUNE RELANCE. Le client était prévenu UNE fois que sa
// commande était prête, et plus jamais. Pendant ce temps, un travail nocturne
// la déclarait « non retirée » en silence dès le lendemain, sans lui laisser
// la moindre chance de se rattraper. Ce cron a été remplacé par ces rappels.
export function emailRappelRetrait({
  yopper_prenom, commercant_nom, commercant_adresse, numero_commande,
  palier = 24, texte,
  paiement = null,   // même bloc que les deux autres emails : voir blocPaiementYopper
}) {
  const chez = commercant_nom || 'ton commerçant'
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: 'Ta commande t’attend',
    intro: `<strong>${echapperHtml(yopper_prenom) || 'Yopper'}</strong>, ${texte}`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Elle t’attend chez ${chez}</p>
        ${numero_commande ? `<p style="margin:0;font-size:30px;font-weight:900;color:${C.ink};letter-spacing:-1.2px;line-height:1;">#${numero_commande}</p>` : ''}
      </div>
      ${commercant_adresse ? `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📍 Où la retirer</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${echapperHtml(commercant_adresse)}</p>
      </div>` : ''}
      ${blocPaiementYopper(paiement)}
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;">
        ${palier >= 72
          ? `Tu ne peux plus passer ? Préviens ${chez}, il pourra remettre les articles en vente.`
          : `Passe quand ça t’arrange, pendant les heures d’ouverture 🟣`}
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app/commander?onglet=commandes',
    ctaLabel: 'Voir ma commande',
  })
}

// 11bis) Email AU YOPPER : commande annulée + refund confirmé
export function emailCommandeAnnuleeYopper({
  yopper_prenom, commercant_nom, numero_commande, total,
  fidelite_remise = null, bon_cadeau_montant = null,
  refund_manuel = false, paye_en_ligne = true,
}) {
  // 🔴 CE MONTANT N'EST PAS CE QU'IL A PAYÉ, tant qu'on ne dit pas ce qui en a
  // été déduit. Le 26/08 l'email annonçait « Montant : 36,00 € » sur une
  // commande où dix euros venaient d'une récompense : le client compte son
  // remboursement à partir de ce chiffre, et se trompe de dix euros.
  const remise = Number(fidelite_remise)
  const bonMnt = Number(bon_cadeau_montant)
  const recompenseOk = Number.isFinite(remise) && remise > 0
  const bonOk = Number.isFinite(bonMnt) && bonMnt > 0
  const bouts = []
  if (recompenseOk) bouts.push(`<strong>${euros(remise)}</strong> avec ta récompense`)
  if (bonOk) bouts.push(`<strong>${euros(bonMnt)}</strong> avec ton bon cadeau`)
  // ⚠️ ET ON DIT CE QUI REVIENT, parce que c'est sa seule question. Une
  // récompense se rend en récompense, pas en argent.
  const rendu = recompenseOk
    ? `Ta récompense de <strong>${euros(remise)}</strong> t’est rendue : tu la retrouves dans ta carte de fidélité.`
    : ''
  return layout({
    audience: 'yopper',
    commercantNom: commercant_nom,
    title: 'Ta commande est annulée',
    intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, ta commande chez <strong>${echapperHtml(commercant_nom)}</strong> a bien été annulée.`,
    body: `
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid ${C.pale};margin-bottom:14px;text-align:center;">
        ${numero_commande ? `<p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Commande annulée</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:${C.ink};letter-spacing:-1px;">#${numero_commande}</p>` : ''}
        ${total != null ? `<p style="margin:6px 0 0;font-size:13px;color:${C.muted};">Montant : <strong style="color:${C.ink};">${euros(Number(total))}</strong></p>` : ''}
        ${bouts.length ? `<p style="margin:4px 0 0;font-size:12px;color:${C.deep};font-weight:600;line-height:1.5;">Dont ${bouts.join(' et ')}.</p>` : ''}
      </div>
      ${rendu ? `<div style="background:${C.bg};border-left:4px solid ${C.main};border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0;font-size:13px;color:${C.deep};line-height:1.55;font-weight:600;">${rendu}</p>
      </div>` : ''}
      ${paye_en_ligne ? `
      <div style="background:${refund_manuel ? '#FFFBEB' : '#ECFDF5'};border-left:4px solid ${refund_manuel ? '#F59E0B' : '#10B981'};border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${refund_manuel ? '#78350F' : '#065F46'};text-transform:uppercase;letter-spacing:0.6px;">Remboursement</p>
        <p style="margin:0;font-size:13px;color:${refund_manuel ? '#7C2D12' : '#064E3B'};line-height:1.5;font-weight:600;">
          ${refund_manuel
            ? `Notre système n'a pas pu lancer le remboursement automatique. ${echapperHtml(commercant_nom)} va le traiter manuellement sous quelques jours.`
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
  fidelite_remise = null, bon_cadeau_montant = null,
  refund_manuel = false, paye_en_ligne = true,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  // 🔴 « IL Y A UN ? - ?, C'EST UN BUG » (Alex, 26/08). Une commande de boutique
  // de détail n'a PAS de créneau : le retrait se fait aux heures d'ouverture,
  // il n'y a rien à afficher. Le gabarit rendait quand même la ligne, avec un
  // point d'interrogation de chaque côté de la flèche. Une valeur de repli
  // n'est pas une réponse à une donnée SANS OBJET : quand il n'y a pas
  // d'heure, il n'y a pas de ligne.
  const debut = String(heure_debut || '').slice(0, 5)
  const fin = String(heure_fin || '').slice(0, 5)
  const plage = debut && fin ? `${debut} → ${fin}` : (debut || fin || null)
  const avantages = ligneAvantagesEmail({ fidelite_remise, bon_cadeau_montant })
  return layout({
    audience: 'commercant',
    title: 'Une commande a été annulée',
    intro: `<strong>${nom_commercant}</strong>, ${echapperHtml(yopper_prenom) || 'un client'} vient d'annuler sa commande.`,
    body: `
      <div style="background:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Retrait prévu (annulé)</p>
        <p style="margin:0;font-size:16px;font-weight:900;color:${C.ink};letter-spacing:-0.3px;text-decoration:line-through;text-decoration-color:${C.muted};">${formatDateFr(date_retrait)}</p>
        ${plage ? `<p style="margin:2px 0 0;font-size:14px;color:${C.deep};font-weight:700;text-decoration:line-through;text-decoration-color:${C.muted};">${plage}</p>` : ''}
        ${numero_commande ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Commande <strong style="color:${C.main};">#${numero_commande}</strong></p>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Client</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${echapperHtml(yopper_prenom) || ''} ${echapperHtml(yopper_nom) || ''}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};${avantages ? `border-bottom:1px solid ${C.pale};` : ''}">Total annulé</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;${avantages ? `border-bottom:1px solid ${C.pale};` : ''}">${total != null ? euros(total) : '—'}</td></tr>
        ${avantages ? `<tr><td colspan="2" style="padding:10px 14px;color:${C.deep};font-weight:600;font-size:12px;line-height:1.5;">${avantages}</td></tr>` : ''}
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
  // 🔴 L'EXPÉDITION TOMBAIT DANS LE CAS « RETRAIT », faute d'être distinguée
  // (Alex, 26/08). Le client qui avait payé un colis recevait « Ta commande
  // est prête 🎉 … t'attend », l'adresse DU MAGASIN, un bouton « Itinéraire
  // Google Maps » et « À tout de suite ». Il pouvait faire la route pour rien.
  // ⚠️ Le test était BINAIRE — livraison ou le reste — et « le reste » n'était
  // pas une catégorie, c'était un oubli.
  est_expedition = false,
  adresse_livraison = null,
  // ⚠️ C'EST L'EMAIL LE PLUS IMPORTANT DES TROIS : celui qu'on lit en enfilant
  // sa veste. S'il ne dit pas qu'il reste 15 € à régler, la personne l'apprend
  // devant le comptoir, ou devant le livreur.
  paiement = null,
}) {
  const ficheUrl = commercant_slug ? `https://www.yoppaa.app/commander/${commercant_slug}` : 'https://www.yoppaa.app/commander'
  const mapsUrl = commercant_adresse ? `https://www.google.com/maps/search/${encodeURIComponent(commercant_adresse)}` : null
  const plage = (heure_debut || heure_fin)
    ? `${heure_debut?.slice(0, 5) || '?'} → ${heure_fin?.slice(0, 5) || '?'}`
    : null

  // ⚠️ L'EXPÉDITION D'ABORD, parce qu'elle est la plus facile à confondre avec
  // le retrait : dans les deux cas le colis est « prêt » chez le commerçant.
  // La différence est que personne ne vient le chercher.
  if (est_expedition) {
    return layout({
      title: 'Ton colis est emballé 📦',
      intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, ta commande chez <strong>${echapperHtml(commercant_nom)}</strong> est emballée. Elle part très bientôt 🟣`,
      body: `
        <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Emballée, en attente d’expédition</p>
          ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
        </div>
        ${adresse_livraison ? `
        <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📦 Expédiée à</p>
          <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${echapperHtml(adresse_livraison)}</p>
        </div>` : ''}
        ${blocPaiementYopper(paiement)}
        <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;text-align:center;">
          Tu recevras le numéro de suivi dès que le colis sera parti 🟣
        </p>
      `,
      ctaUrl: 'https://www.yoppaa.app/commander?onglet=commandes',
      ctaLabel: 'Suivre ma commande',
    })
  }

  if (est_livraison) {
    return layout({
      title: 'Ta commande part bientôt 🛵',
      intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, ta commande chez <strong>${echapperHtml(commercant_nom)}</strong> est préparée. Elle arrive dans ton créneau 🟣`,
      body: `
        <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Prête, livraison en préparation</p>
          ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
          ${plage ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">Livraison entre ${plage}</p>` : ''}
        </div>
        <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">🛵 Livrée à</p>
          <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${echapperHtml(adresse_livraison) || '—'}</p>
        </div>
        ${blocPaiementYopper(paiement)}
        <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.55;text-align:center;">
          Tu recevras un message quand ${echapperHtml(commercant_nom)} prendra la route. Pense à rester joignable 🟣
        </p>
      `,
      ctaUrl: 'https://www.yoppaa.app/commander?onglet=commandes',
      ctaLabel: 'Suivre ma commande',
    })
  }

  return layout({
    title: 'Ta commande est prête 🎉',
    intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, c'est prêt ! Ta commande chez <strong>${echapperHtml(commercant_nom)}</strong> t'attend 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,#10B981 0%,#059669 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Prête à retirer</p>
        ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
        ${plage ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">${plage}</p>` : ''}
      </div>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📍 Adresse</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${echapperHtml(commercant_adresse) || '—'}</p>
      </div>
      ${blocPaiementYopper(paiement)}
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
    intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, <strong>${echapperHtml(commercant_nom)}</strong> vient de partir avec ta commande 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.main} 0%,${C.deep} 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">En route vers toi</p>
        ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
        ${plage ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">Créneau ${plage}</p>` : ''}
      </div>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">🛵 Livrée à</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${echapperHtml(adresse_livraison) || '—'}</p>
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
  expedition_transporteur = null,
}) {
  const suivi = String(expedition_suivi || '').trim()
  // 🔴 LE TRANSPORTEUR, AJOUTÉ LE 26/08. « À saisir sur le site du
  // transporteur » : lequel ? L'email demandait au client de deviner, puis de
  // recopier seize chiffres à la main sur un téléphone. Maintenant il le nomme,
  // et quand on connaît son adresse de suivi, il suffit de cliquer.
  const nomPorteur = nomTransporteur(expedition_transporteur)
  const lien = suiviUrl(expedition_transporteur, suivi)
  return layout({
    title: 'Ton colis est parti 📦',
    intro: `<strong>${echapperHtml(yopper_prenom)}</strong>, <strong>${echapperHtml(commercant_nom)}</strong> vient d'expédier ta commande 🟣`,
    body: `
      <div style="background:linear-gradient(135deg,${C.main} 0%,${C.deep} 100%);border-radius:14px;padding:20px;margin-bottom:14px;text-align:center;color:#fff;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;opacity:0.9;">Expédiée</p>
        ${numero_commande ? `<p style="margin:0;font-size:32px;font-weight:900;letter-spacing:-1.5px;line-height:1;">#${numero_commande}</p>` : ''}
        ${nomPorteur ? `<p style="margin:8px 0 0;font-size:13px;font-weight:700;opacity:0.95;">Par ${echapperHtml(nomPorteur)}</p>` : ''}
      </div>
      ${suivi ? `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📦 Numéro de suivi${nomPorteur ? ` ${echapperHtml(nomPorteur)}` : ''}</p>
        <p style="margin:0;font-size:15px;color:${C.ink};font-weight:800;letter-spacing:0.5px;">${echapperHtml(suivi)}</p>
        ${lien
          ? `<p style="margin:8px 0 0;font-size:13px;line-height:1.5;"><a href="${lien}" style="color:${C.main};font-weight:800;">Suivre mon colis chez ${echapperHtml(nomPorteur)} →</a></p>`
          : `<p style="margin:6px 0 0;font-size:11px;color:${C.muted};line-height:1.5;">À saisir sur le site ${nomPorteur ? `de ${echapperHtml(nomPorteur)}` : 'du transporteur'} pour suivre ton colis.</p>`}
      </div>`
      // ⚠️ PAS DE NUMÉRO, MAIS UN TRANSPORTEUR : ça vaut encore la peine de le
      // dire. Le client sait au moins qui va sonner à sa porte.
      : (nomPorteur ? `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📦 Transporteur</p>
        <p style="margin:0;font-size:15px;color:${C.ink};font-weight:800;">${echapperHtml(nomPorteur)}</p>
        <p style="margin:6px 0 0;font-size:11px;color:${C.muted};line-height:1.5;">Cet envoi part sans numéro de suivi.</p>
      </div>` : '')}
      ${adresse_livraison ? `
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">📮 Envoyé à</p>
        <p style="margin:0;font-size:13px;color:${C.ink};font-weight:700;">${echapperHtml(adresse_livraison)}</p>
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
  // ⚠️ LES REMISES MANQUAIENT AUSSI DE CE CÔTÉ. Le commerçant lisait le total
  // BRUT dans son email : il préparait la commande en croyant devoir encaisser
  // 36 € alors que le client n'en devait que 26. Le bon cadeau était dans le
  // même cas, et depuis plus longtemps.
  fidelite_remise = 0,
  bon_cadeau_montant = 0,
}) {
  const dashboardUrl = 'https://www.yoppaa.app/dashboard'
  const remiseFidEUR = Number(fidelite_remise) || 0
  const bonEUR = Number(bon_cadeau_montant) || 0
  const netCommercant = total != null
    ? Math.round(Math.max(0, Number(total) - remiseFidEUR - bonEUR) * 100) / 100
    : 0
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
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Client</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};">${echapperHtml(yopper_prenom) || ''} ${echapperHtml(yopper_nom) || ''}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};border-bottom:1px solid ${C.pale};">Email</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;border-bottom:1px solid ${C.pale};font-size:12px;">${yopper_email || '—'}</td></tr>
        <tr><td style="padding:10px 14px;color:${C.muted};">Téléphone</td><td style="padding:10px 14px;color:${C.ink};font-weight:700;text-align:right;">${yopper_telephone || '—'}</td></tr>
      </table>
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid ${C.pale};border-radius:12px;overflow:hidden;margin-bottom:14px;">
        ${renderArticlesRows(articles)}
        ${total != null ? `<tr><td style="padding:12px 14px;color:${C.ink};font-size:14px;font-weight:900;background:${C.bg};">Total</td><td style="padding:12px 14px;color:${C.main};font-size:16px;font-weight:900;text-align:right;background:${C.bg};">${euros(Number(total))}</td></tr>` : ''}
        ${remiseFidEUR > 0 ? `
        <tr><td style="padding:10px 14px;color:${C.main};font-size:13px;font-weight:700;">🟣 Récompense fidélité</td><td style="padding:10px 14px;color:${C.main};font-size:13px;font-weight:800;text-align:right;">−${euros(remiseFidEUR)}</td></tr>` : ''}
        ${bonEUR > 0 ? `
        <tr><td style="padding:10px 14px;color:#10B981;font-size:13px;font-weight:700;">🎁 Bon cadeau</td><td style="padding:10px 14px;color:#10B981;font-size:13px;font-weight:800;text-align:right;">−${euros(bonEUR)}</td></tr>` : ''}
        ${(remiseFidEUR > 0 || bonEUR > 0) ? `
        <tr><td style="padding:10px 14px;color:${C.ink};font-size:13px;font-weight:900;border-top:1px solid ${C.pale};">Total après remise</td><td style="padding:10px 14px;color:${C.ink};font-size:13px;font-weight:900;text-align:right;border-top:1px solid ${C.pale};">${euros(netCommercant)}</td></tr>` : ''}
      </table>
      ${notes_client ? `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.6px;">Note du client</p>
        <p style="margin:0;font-size:13px;color:#7C2D12;font-weight:600;line-height:1.5;">${echapperHtml(notes_client)}</p>
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
        ${echapperHtml(c.yopper_prenom) || ''} ${echapperHtml(c.yopper_nom) || ''}
        ${c.numero_commande ? `<span style="color:${C.muted};font-weight:500;font-size:11px;"> · #${c.numero_commande}</span>` : ''}
        <br/><span style="color:${C.muted};font-weight:500;font-size:11px;">${c.nb_articles || '?'} article(s)</span>
      </td>
      <td style="padding:10px 14px;color:${C.main};font-weight:900;font-size:13px;text-align:right;border-bottom:1px solid ${C.pale};white-space:nowrap;">${c.total != null ? euros(c.total) : ''}</td>
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
          ${euros(totalBons)}
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
//
// ⚠️ CET EMAIL EST RECOPIÉ TEL QUEL PAR LE COMMERÇANT sur ses réseaux et dans
// son groupe de quartier. Ce n'est pas un email d'information : c'est un texte
// qui va être PUBLIÉ. Une date fausse ici se propage à tous ses clients, et
// c'est lui qui passe pour celui qui s'est trompé.
export function emailKitBienvenue({ nom_commercant, slug, avant_lancement = false }) {
  const kitUrl = `https://www.yoppaa.app/kit/${slug}`
  const affichetteUrl = `https://www.yoppaa.app/affichette/${slug}`
  const ouverture = libelleLancement()
  // AVANT l'ouverture publique, la fiche n'accepte pas encore de clients : le
  // lien utile est celui de préinscription, qui attribue chaque inscrit à ce
  // commerçant (?ref=). Après le lancement, on envoie directement sur la fiche
  // pour commander.
  const lien = avant_lancement
    ? `https://www.yoppaa.app/?ref=${slug}`
    : `https://www.yoppaa.app/commander/${slug}`

  const messages = avant_lancement ? [
    {
      titre: 'Pour tes réseaux sociaux',
      texte: `On sera sur Yoppaa dès le ${ouverture} 🟣 L'app qui réunit les commerces de la commune. Inscris-toi pour être prévenu de l'ouverture : ${lien}`,
    },
    {
      titre: 'Pour ton groupe WhatsApp de quartier',
      texte: `On prépare quelque chose : à partir du ${ouverture}, vous pourrez commander et réserver chez nous depuis Yoppaa, l'app de notre commune. Inscrivez-vous ici pour être prévenus : ${lien}`,
    },
    {
      titre: 'À dire au comptoir',
      texte: `Dès le ${ouverture}, vous pourrez commander chez nous en ligne. Inscrivez-vous, on vous prévient.`,
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
      ? `<strong>${nom_commercant}</strong>, c'est validé : ta page Yoppaa est prête. Elle s'ouvre au public le ${ouverture}, et d'ici là ton kit sert à préparer le terrain.`
      : `<strong>${nom_commercant}</strong>, ta page est en ligne. Voici ton kit de démarrage : tout est prêt, il n'y a plus qu'à le partager.`,
    body: `
      ${avant_lancement ? `
      <div style="background:${C.pale};border-left:4px solid ${C.main};border-radius:10px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0;font-size:12.5px;color:${C.deep};line-height:1.6;">
          <strong>Tu es en avance, et c'est exactement ce qu'il faut.</strong> Chaque habitant qui s'inscrit par ton lien t'est attribué :
          le ${ouverture}, ce sont autant de gens qui savent déjà que tu es sur Yoppaa. Tu suis le compte sur ton kit.
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
          ? `il inscrit tes clients en un scan, et basculera tout seul vers ta page le ${ouverture}.`
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
            ? `Les commerces qui démarrent le mieux sont ceux qui en parlent une fois à chaque client dès maintenant. Le ${ouverture}, ils ouvrent avec une clientèle déjà prête.`
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
      <p style="margin:0 0 2px;font-size:11px;font-weight:800;color:${C.light};text-transform:uppercase;letter-spacing:1px;">Bon cadeau · ${echapperHtml(commercant_nom)}</p>
      <p style="margin:0 0 10px;font-size:30px;font-weight:900;color:#fff;letter-spacing:-1px;">${euros(Number(montant))}</p>
      <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:${C.light};text-transform:uppercase;letter-spacing:1px;">Ton code</p>
      <p style="margin:0;font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;font-family:monospace;background:rgba(255,255,255,0.1);border-radius:10px;padding:8px 12px;display:inline-block;">${code}</p>
      ${expires_at ? `<p style="margin:10px 0 0;font-size:11px;color:${C.light};">Valable jusqu'au <strong>${formatDateFr(String(expires_at).slice(0, 10))}</strong></p>` : ''}
    </div>
    <p style="margin:0 0 14px;font-size:12px;color:${C.muted};line-height:1.6;">
      Ce bon s'utilise <strong>en une ou plusieurs fois</strong>, directement chez <strong>${echapperHtml(commercant_nom)}</strong> (montre ton code au comptoir) ou lors d'une commande en ligne sur Yoppaa (champ « J'ai un bon cadeau » au moment de payer). Le solde restant reste sur le bon.
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
    intro: `<strong>${beneficiaire_prenom || 'Hello'}</strong>, ${acheteur_prenom ? `<strong>${acheteur_prenom}</strong> t'offre` : 'on t\'offre'} un bon cadeau chez <strong>${echapperHtml(commercant_nom)}</strong> !`,
    body: `
      ${message ? `
      <div style="background:${C.pale};border-radius:12px;padding:12px 14px;margin-bottom:14px;">
        <p style="margin:0 0 2px;font-size:10px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.6px;">${acheteur_prenom ? `Le mot de ${acheteur_prenom}` : 'Petit mot'}</p>
        <p style="margin:0;font-size:13px;color:${C.deep};line-height:1.55;font-style:italic;">« ${echapperHtml(message)} »</p>
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
      ? `<strong>${acheteur_prenom || 'Merci'}</strong>, ton bon cadeau chez <strong>${echapperHtml(commercant_nom)}</strong> est activé !`
      : `<strong>${acheteur_prenom || 'Merci'}</strong>, ton bon cadeau chez <strong>${echapperHtml(commercant_nom)}</strong> vient d'être envoyé à <strong>${beneficiaire_prenom || beneficiaire_email}</strong> 🟣`,
    body: pour_moi
      ? blocBonCadeau({ code, montant, commercant_nom, expires_at })
      : `
      <div style="background:#fff;border-radius:12px;padding:16px;border:1px solid ${C.pale};margin-bottom:14px;text-align:center;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Bon cadeau offert</p>
        <p style="margin:0;font-size:24px;font-weight:900;color:${C.ink};letter-spacing:-1px;">${euros(Number(montant))}</p>
        <p style="margin:6px 0 0;font-size:13px;color:${C.muted};">envoyé à <strong style="color:${C.ink};">${beneficiaire_prenom || ''} ${beneficiaire_email ? `(${beneficiaire_email})` : ''}</strong></p>
      </div>
      <p style="margin:0;font-size:12px;color:${C.muted};line-height:1.6;">
        Le code est dans son email : c'est son bon, valable en une ou plusieurs fois chez ${echapperHtml(commercant_nom)}. Ce reçu vaut confirmation de ton paiement.
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
    intro: `Bonne nouvelle <strong>${nom_commercant}</strong>, tu viens de vendre un bon cadeau de <strong>${euros(Number(montant))}</strong> !`,
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
        ${echapperHtml(r.yopper_prenom) || ''} ${echapperHtml(r.yopper_nom) || ''}
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

// ─── AU YOPPER : son abonnement est actif ──────────────────────────────────
//
// ⚠️ CET EMAIL N'EXISTAIT PAS, ET C'EST LE PLUS GRAVE DES TROUS TROUVÉS LE
// 16/08. Alex a réellement payé 400 € : le contrat s'est créé en base, le
// commerçant l'a vu dans ses Abonnés, et l'acheteur n'a RIEN reçu. Ni écran,
// ni email, ni trace dans son espace.
//
// ⚠️ POUR UN MONTANT À TROIS CHIFFRES, UNE PREUVE D'ACHAT N'EST PAS UN CONFORT.
// C'est la première chose qu'on cherche quand quelque chose se passe mal, et
// son absence est indéfendable devant un client comme devant un juge.
//
// Le résumé vient de `resumeContratAchete`, la MÊME fonction qui alimente
// l'écran : un email qui annonce autre chose que l'écran est pire que pas
// d'email du tout.
export function emailAbonnementConfirme({
  yopper_prenom, commercant_nom, resume, mes_abonnements_url,
}) {
  const ligne = (label, valeur) => valeur ? `
    <tr>
      <td style="padding:7px 0;font-size:12px;color:${C.muted};">${label}</td>
      <td style="padding:7px 0;font-size:13px;color:${C.ink};font-weight:800;text-align:right;">${valeur}</td>
    </tr>` : ''

  return layout({
    title: 'Ton abonnement est actif 🟣',
    intro: `${yopper_prenom ? `${echapperHtml(yopper_prenom)}, ton` : 'Ton'} abonnement chez <strong>${echapperHtml(commercant_nom)}</strong> est confirmé. Garde cet email : c'est ta preuve d'achat.`,
    body: `
      <table role="presentation" width="100%" style="border-collapse:collapse;background:${C.bg};border-radius:12px;padding:4px 14px;">
        ${ligne('Formule', resume?.formule)}
        ${ligne('Séances', resume?.seances)}
        ${ligne('Validité', resume?.validite)}
        ${ligne('Montant payé', resume?.prix)}
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:${C.ink};line-height:1.6;font-weight:700;">
        ${resume?.aFaire || ''}
      </p>
      <p style="margin:10px 0 0;font-size:11.5px;color:${C.muted};line-height:1.55;">
        Une question sur ton abonnement ? Contacte directement ${echapperHtml(commercant_nom)}, c'est lui qui le gère.
      </p>
    `,
    ctaUrl: mes_abonnements_url,
    ctaLabel: 'Voir mon abonnement',
  })
}

// ─── AU COMMERÇANT : un abonnement vient d'être vendu ──────────────────────
//
// C'est la plus grosse rentrée de son catalogue, et il ne l'apprenait que s'il
// pensait à ouvrir l'onglet Abonnés. Même règle que le bon cadeau vendu :
// seulement si le commerçant a choisi d'être prévenu à chaque fois.
export function emailAbonnementVenduCommercant({
  nom_commercant, client_prenom, client_nom, resume,
}) {
  const qui = [client_prenom, client_nom].filter(Boolean).join(' ') || 'Un client'
  return layout({
    audience: 'commercant',
    commercantNom: nom_commercant,
    title: 'Un abonnement vient d’être vendu',
    intro: `<strong>${qui}</strong> vient de prendre un abonnement en ligne, et il est déjà payé.`,
    body: `
      <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.6;">
        ${[resume?.formule, resume?.seances, resume?.validite].filter(Boolean).join('<br>')}
      </p>
      <p style="margin:14px 0 0;font-size:20px;font-weight:900;color:${C.main};">${resume?.prix || ''}</p>
      <p style="margin:12px 0 0;font-size:11.5px;color:${C.muted};line-height:1.55;">
        Tu le retrouves dans ton tableau de bord, onglet Catalogue puis Abonnements.
        ${resume?.aFaire ? `<br>${resume.aFaire}` : ''}
      </p>
    `,
  })
}
