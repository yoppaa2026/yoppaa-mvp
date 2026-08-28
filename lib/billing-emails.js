// ═══════════════════════════════════════════════════════════════════════════
// lib/billing-emails.js
//
// Templates emails Stripe Billing — 5 relances envoyées par le cron
// /api/cron/billing-relances :
//
//   • trial_j_minus_7              → "Plus que 7 jours d'essai gratuit"
//   • trial_j_minus_3              → "Plus que 3 jours d'essai"
//   • payment_failed_j_plus_1      → "On n'a pas pu finaliser ton paiement"
//   • payment_failed_j_plus_4      → "Dernière relance avant suspension dans 3 jours"
//   • payment_failed_j_plus_7_bascule → "Ton abonnement a été suspendu"
//
// Conventions Yoppaa :
//   - Tutoiement, ton chaleureux mais clair
//   - Vocabulaire belge : "informations de paiement", "carte de paiement",
//     "Bancontact" — JAMAIS "CB" (francisme inadapté au marché belge)
//   - Pas d'em-dash, virgules + points + parenthèses
//   - HTML inline styles uniquement (clients mail ignorent <style>)
//   - CTA principale : portail Stripe ou /dashboard/abonnement
// ═══════════════════════════════════════════════════════════════════════════

import { layout, C, formatDateFr, envoyerAuCommercant } from './resend'
import { PLAN_LABEL } from './plans'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'

// Helper : formate un tarif HTVA en "19,90 €"
function formatTarif(tarif) {
  const n = Number(tarif)
  if (tarif == null || Number.isNaN(n)) return '—'
  return `${n.toFixed(2).replace('.', ',')} €`
}

// Helper : retourne le libellé visible d'un plan (Communiquer / Vendre)
function planLabel(plan) {
  return PLAN_LABEL[plan] || plan || '—'
}

// ─── Template 1 : Trial J-7 ────────────────────────────────────────────────
export function emailTrialJMinus7({ nom, plan, tarif, date_fin_essai }) {
  return layout({
    title: 'Plus que 7 jours d\'essai',
    intro: `Bonjour <strong>${nom || 'Yopper'}</strong>, on espère que tu testes Yoppaa avec plaisir 👋`,
    body: `
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        Ton essai gratuit de la formule <strong style="color:${C.main};">${planLabel(plan)}</strong> se termine le <strong>${formatDateFr(date_fin_essai)}</strong>, soit dans 7 jours.
      </p>
      <div style="background:${C.bg};border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">À cette date</p>
        <p style="margin:0;font-size:14px;color:${C.ink};line-height:1.55;">
          Nous prélèverons automatiquement <strong>${formatTarif(tarif)} HTVA</strong> sur ton moyen de paiement enregistré.
        </p>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${C.ink};">
        Aucune action nécessaire si tu souhaites continuer. Sinon, tu peux résilier sans frais à tout moment depuis ton tableau de bord, avant la fin de l'essai.
      </p>
    `,
    ctaUrl: `${APP_URL}/dashboard/abonnement`,
    ctaLabel: 'Gérer mon abonnement',
  })
}

// ─── Template 2 : Trial J-3 ────────────────────────────────────────────────
export function emailTrialJMinus3({ nom, plan, tarif, date_fin_essai }) {
  return layout({
    title: 'Plus que 3 jours d\'essai',
    intro: `Petit rappel <strong>${nom || 'Yopper'}</strong>, ton essai gratuit se termine bientôt.`,
    body: `
      <div style="background-color:${C.pale};background-image:linear-gradient(135deg,${C.bg} 0%,${C.pale} 100%);border-radius:14px;padding:18px 20px;border:1px solid ${C.main}22;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.main};text-transform:uppercase;letter-spacing:0.7px;">Fin de l'essai</p>
        <p style="margin:0;font-size:18px;font-weight:900;color:${C.ink};letter-spacing:-0.5px;">${formatDateFr(date_fin_essai)}</p>
        <p style="margin:4px 0 0;font-size:13px;color:${C.deep};font-weight:600;">Premier prélèvement : <strong>${formatTarif(tarif)} HTVA</strong> · Formule ${planLabel(plan)}</p>
      </div>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        Si tu n'as pas encore renseigné tes informations de paiement, c'est le moment.
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${C.muted};">
        Tu peux toujours résilier sans frais avant la fin de l'essai depuis ton tableau de bord.
      </p>
    `,
    ctaUrl: `${APP_URL}/dashboard/abonnement`,
    ctaLabel: 'Vérifier mes informations de paiement',
  })
}

// ─── Template 3 : Payment failed J+1 ───────────────────────────────────────
export function emailPaymentFailedJPlus1({ nom, plan, tarif, date_facture }) {
  return layout({
    title: 'Paiement non finalisé',
    intro: `<strong>${nom || 'Yopper'}</strong>, le paiement de ton abonnement n'a pas pu être finalisé.`,
    body: `
      <div style="background:#FFFBEB;border-left:4px solid #F59E0B;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#78350F;text-transform:uppercase;letter-spacing:0.7px;">Échec de paiement</p>
        <p style="margin:0;font-size:14px;color:#7C2D12;font-weight:600;line-height:1.55;">
          Formule <strong>${planLabel(plan)}</strong> · <strong>${formatTarif(tarif)} HTVA</strong> · facture du ${formatDateFr(date_facture)}
        </p>
      </div>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        Pas d'inquiétude, Stripe va automatiquement retenter le prélèvement dans les prochains jours.
      </p>
      <p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:${C.ink};">
        Si tu sais que ta carte est expirée, ou si tu veux changer de moyen de paiement (Bancontact, Visa, Mastercard), mets-la à jour dès maintenant pour éviter toute interruption.
      </p>
      <p style="margin:0;font-size:12px;line-height:1.55;color:${C.muted};">
        Sans régularisation sous 7 jours, ton abonnement sera suspendu et tu repasseras automatiquement en formule <strong>Exister</strong> (gratuite). Tu conserveras ta fiche et tes données.
      </p>
    `,
    ctaUrl: `${APP_URL}/dashboard/abonnement`,
    ctaLabel: 'Mettre à jour mes informations de paiement',
  })
}

// ─── Template 4 : Payment failed J+4 ───────────────────────────────────────
export function emailPaymentFailedJPlus4({ nom, plan }) {
  return layout({
    title: 'Dernière relance avant suspension',
    intro: `<strong>${nom || 'Yopper'}</strong>, ton paiement Yoppaa est toujours en attente.`,
    body: `
      <div style="background:#FEF2F2;border-left:4px solid #DC2626;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:#991B1B;text-transform:uppercase;letter-spacing:0.7px;">Dernière relance</p>
        <p style="margin:0;font-size:14px;color:#7F1D1D;font-weight:700;line-height:1.55;">
          Dans <strong>3 jours</strong>, ton abonnement <strong>${planLabel(plan)}</strong> sera suspendu et tu repasseras automatiquement en formule <strong>Exister</strong> (gratuite).
        </p>
      </div>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        Tu conserveras ta fiche, tes données, ton historique et tes clients. Mais tu perdras l'accès aux fonctionnalités spécifiques de la formule <strong>${planLabel(plan)}</strong> (push ciblés, statistiques, IA, paiement en ligne selon ton plan).
      </p>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${C.ink};">
        Pour éviter ça, il te suffit de mettre à jour tes informations de paiement maintenant. Stripe retentera automatiquement le prélèvement dans la foulée.
      </p>
    `,
    ctaUrl: `${APP_URL}/dashboard/abonnement`,
    ctaLabel: 'Mettre à jour mes informations de paiement',
  })
}

// ─── Template 5 : Bascule J+7 (sub annulée + plan = exister) ───────────────
export function emailBasculeExister({ nom, ancien_plan }) {
  return layout({
    title: 'Abonnement suspendu',
    intro: `<strong>${nom || 'Yopper'}</strong>, faute de paiement régularisé, ton abonnement a été suspendu.`,
    body: `
      <div style="background:${C.bg};border-radius:14px;padding:18px 20px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Ta nouvelle formule</p>
        <p style="margin:0;font-size:22px;font-weight:900;color:${C.ink};letter-spacing:-0.5px;">Exister</p>
        <p style="margin:4px 0 0;font-size:13px;color:${C.deep};font-weight:600;">Gratuite à vie, sans engagement.</p>
      </div>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:${C.ink};">
        Tu es automatiquement repassé en formule <strong>Exister</strong> aujourd'hui. Ta fiche reste en ligne, tes données sont intactes, tes clients te retrouvent toujours sur Yoppaa.
      </p>
      <div style="background:#fff;border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:14px;">
        <p style="margin:0 0 6px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.6px;">Ce qui change pour toi</p>
        <p style="margin:0;font-size:13px;color:${C.ink};line-height:1.6;">
          Tu perds les fonctionnalités spécifiques à la formule <strong>${planLabel(ancien_plan)}</strong>, mais tu gardes tout l'accès essentiel pour exister sur Yoppaa, partager des actus dans Good Morning Yoppers et rester visible auprès de tes Yoppers.
        </p>
      </div>
      <p style="margin:0;font-size:13px;line-height:1.6;color:${C.ink};">
        Tu peux réactiver ton abonnement à tout moment depuis ton tableau de bord, sans nouvel essai gratuit nécessaire.
      </p>
    `,
    ctaUrl: `${APP_URL}/dashboard/abonnement`,
    ctaLabel: 'Réactiver mon abonnement',
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH : envoie la bonne relance selon le type, retourne { ok, error }
// ═══════════════════════════════════════════════════════════════════════════

const SUBJECT_BY_TYPE = {
  trial_j_minus_7:                 'Plus que 7 jours d\'essai gratuit Yoppaa',
  trial_j_minus_3:                 'Plus que 3 jours d\'essai Yoppaa',
  payment_failed_j_plus_1:         'On n\'a pas pu finaliser ton paiement Yoppaa',
  payment_failed_j_plus_4:         'Dernière relance avant suspension Yoppaa',
  payment_failed_j_plus_7_bascule: 'Ton abonnement Yoppaa a été suspendu',
}

export async function sendBillingRelance({ commercant, type, context = {} }) {
  if (!commercant?.email) {
    return { ok: false, error: 'commercant.email manquant' }
  }
  const subject = SUBJECT_BY_TYPE[type]
  if (!subject) {
    return { ok: false, error: `type de relance inconnu : ${type}` }
  }

  const tplArgs = {
    nom:            commercant.nom || 'Yopper',
    plan:           context.plan       || commercant.plan,
    ancien_plan:    context.ancien_plan || commercant.plan,
    tarif:          context.tarif,
    date_fin_essai: context.date_fin_essai,
    date_facture:   context.date_facture,
  }

  let html
  switch (type) {
    case 'trial_j_minus_7':                 html = emailTrialJMinus7(tplArgs); break
    case 'trial_j_minus_3':                 html = emailTrialJMinus3(tplArgs); break
    case 'payment_failed_j_plus_1':         html = emailPaymentFailedJPlus1(tplArgs); break
    case 'payment_failed_j_plus_4':         html = emailPaymentFailedJPlus4(tplArgs); break
    case 'payment_failed_j_plus_7_bascule': html = emailBasculeExister(tplArgs); break
    default:                                return { ok: false, error: `template manquant pour ${type}` }
  }

  return envoyerAuCommercant({ to: commercant.email, subject, html })
}
