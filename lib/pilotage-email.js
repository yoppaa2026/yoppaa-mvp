// L'EMAIL DE PILOTAGE DE 7H00 (19/10).
//
// L'essentiel de la veille en trente secondes, et le lien vers la page
// « Pilotage » pour le détail. Ce qui demande un geste d'abord (les alertes),
// les chiffres ensuite.
//
// ⚠️ AUCUNE DONNÉE PERSONNELLE : des nombres et des noms de commerces, rien
// d'autre (le calcul n'en reçoit pas). Les noms sont échappés : un commerçant
// écrit son nom lui-même.
// ⚠️ « HIER » EST COMPARÉ AU MÊME JOUR DE LA SEMAINE PRÉCÉDENTE : un lundi
// contre un dimanche ne dirait rien d'une friterie.

import { layout, C, echapperHtml } from './resend'
import { baseDuSite } from './stripe-mode'
import { libelleEnvie } from './signaux'
import { jourCivilPlus } from './timezone'
import { nombre, ecart, jourEnLettres } from './pilotage-format'

const COULEURS_ALERTE = {
  rouge: { fond: '#FEE2E2', texte: '#7F1D1D', bord: '#FCA5A5' },
  orange: { fond: '#FEF3C7', texte: '#78350F', bord: '#FCD34D' },
  vert: { fond: '#D1FAE5', texte: '#065F46', bord: '#6EE7B7' },
}

export function emailPilotage(p) {
  const quand = jourEnLettres(p.hier)
  const rouges = p.alertes.filter(a => a.niveau === 'rouge').length
  const subject = rouges > 0
    ? `Pilotage du ${quand} : ${rouges} point${rouges > 1 ? 's' : ''} à régler`
    : `Pilotage du ${quand}`

  const alertes = p.alertes.length
    ? p.alertes.map(a => {
        const c = COULEURS_ALERTE[a.niveau] || COULEURS_ALERTE.orange
        return `<p style="margin:0 0 8px;padding:10px 12px;border-radius:10px;background:${c.fond};border:1px solid ${c.bord};color:${c.texte};font-size:13.5px;line-height:1.5;font-weight:700;">${echapperHtml(a.texte)}</p>`
      }).join('')
    : `<p style="margin:0 0 8px;font-size:13.5px;color:${C.muted};">Rien à signaler : tout a tourné, rien n’attend.</p>`

  const lignesTuiles = p.tuiles.map(t => `
    <tr>
      <td style="padding:7px 0;border-bottom:1px solid ${C.pale};font-size:13.5px;color:${C.ink};">${echapperHtml(t.libelle)}</td>
      <td style="padding:7px 0;border-bottom:1px solid ${C.pale};font-size:15px;color:${C.ink};font-weight:800;text-align:right;white-space:nowrap;">${t.indisponible ? '—' : nombre(t.hier, t)}</td>
      <td style="padding:7px 0 7px 10px;border-bottom:1px solid ${C.pale};font-size:12px;color:${C.muted};text-align:right;white-space:nowrap;">${t.indisponible ? 'indisponible' : `${ecart(t.hier, t.memeJourSemainePassee, t)} · 7 j : ${nombre(t.septJours, t)}`}</td>
    </tr>`).join('')

  const aDemarcher = p.revenu.aDemarcher.slice(0, 5).map(l =>
    `<li style="margin:0 0 4px;">${echapperHtml(l.nom)} : ${l.signaux30} ${l.signaux30 > 1 ? 'signaux' : 'signal'} sur 30 jours (${l.types.map(t => echapperHtml(libelleEnvie(t).court)).join(', ')})</li>`).join('')

  const body = `
    <p style="margin:0 0 10px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.main};">Ce qui t’attend</p>
    ${alertes}

    <p style="margin:22px 0 6px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.main};">Hier, comparé au ${jourEnLettres(jourCivilPlus(p.hier, -7))}</p>
    <table style="width:100%;border-collapse:collapse;">${lignesTuiles}</table>
    <p style="margin:8px 0 0;font-size:11.5px;color:${C.muted};line-height:1.5;">Hors fiches de démonstration. « 7 j » : les sept derniers jours, hier compris.</p>

    <p style="margin:22px 0 6px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.main};">Le parc</p>
    <p style="margin:0;font-size:13.5px;line-height:1.7;color:${C.ink};">
      <strong>${nombre(p.croissance.comptesYopper)}</strong> comptes Yopper ·
      <strong>${nombre(p.commerces.publies)}</strong> fiches en ligne sur ${nombre(p.commerces.total)} commerces ·
      <strong>${nombre(p.commerces.pasEnLigne.length)}</strong> pas encore en ligne<br/>
      Revenu attendu après l’essai : <strong>${nombre(p.revenu.revenuAttenduHtva, { argent: true })} HTVA par mois</strong>
      (${p.revenu.payants} formule${p.revenu.payants > 1 ? 's' : ''} payante${p.revenu.payants > 1 ? 's' : ''}, dont ${p.revenu.avecAbonnement} avec abonnement Stripe)
    </p>
    ${aDemarcher ? `
      <p style="margin:22px 0 6px;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${C.main};">À démarcher</p>
      <ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.6;color:${C.ink};">${aDemarcher}</ul>` : ''}
  `

  return {
    subject,
    html: layout({
      audience: 'admin',
      title: `Pilotage · ${quand}`,
      intro: '',
      body,
      ctaUrl: `${baseDuSite()}/admin#pilotage`,
      ctaLabel: 'Ouvrir le pilotage',
    }),
  }
}
