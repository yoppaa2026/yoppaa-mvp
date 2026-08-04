// ═══════════════════════════════════════════════════════════════════════════
// lib/signaux-email.js
//
// L'email hebdomadaire des signaux : ce que des habitants ont voulu faire chez
// un commerçant et qu'ils n'ont pas pu.
//
// C'EST LE SEUL EMAIL DE YOPPAA QUI NE DEMANDE RIEN. Il énonce un fait sur le
// commerce de la personne qui le reçoit, et s'arrête là. Le raisonnement est
// d'Alex (05/08) : un commerçant qui a déjà un logiciel de rendez-vous éconduit
// un commercial, mais pas ses propres clients. Si douze habitants de sa commune
// ont voulu réserver chez lui, c'est lui qui en tire la conclusion.
//
// TROIS INTERDITS, qui sont la raison d'être du fichier :
//   • jamais un nom de formule, jamais « passe à », jamais « débloque » ;
//   • jamais une personne, jamais un prénom, jamais un nombre inférieur au
//     seuil : « 1 habitant a demandé » affaiblit l'argument au lieu de le
//     servir ;
//   • jamais sans la porte de sortie : couper ces emails doit être aussi
//     facile que de les recevoir.
//
// Le soir et le week-end sont la charnière de l'email. Ces demandes sont
// arrivées boutique fermée, quand personne ne pouvait décrocher : ce ne sont
// pas des rendez-vous qu'il a déjà, ce sont des rendez-vous qu'il a perdus.
// ═══════════════════════════════════════════════════════════════════════════

import { layout, C } from './resend'
import { libelleEnvie, phraseHorsOuverture } from './signaux'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://www.yoppaa.app'

// `types` : les lignes de signaux_envies_stats déjà filtrées par le seuil et
// triées du plus demandé au moins demandé (enviesAAlerter s'en charge).
export function emailSignauxHebdo({ nom, types = [] }) {
  if (!types.length) return null

  const principal = types[0]
  const nPrincipal = Number(principal.trente_jours || 0)

  // L'objet porte le fait, en entier. Un objet vague (« Des nouvelles de ta
  // fiche ») ne se lit pas ; le nombre, lui, se lit depuis la liste des mails.
  const subject = libelleEnvie(principal.type).phrase(nPrincipal)

  const lignes = types.map(t => {
    const n = Number(t.trente_jours || 0)
    const hors = phraseHorsOuverture({ soir: Number(t.soir_30j || 0), weekend: Number(t.weekend_30j || 0) })
    return `
      <div style="background:${C.bg};border-radius:12px;padding:14px 16px;border:1px solid ${C.pale};margin-bottom:10px;">
        <p style="margin:0;font-size:22px;font-weight:800;color:${C.main};line-height:1;">${n}</p>
        <p style="margin:6px 0 0;font-size:14px;color:${C.ink};line-height:1.55;">
          ${libelleEnvie(t.type).phrase(n)} ces 30 derniers jours${hors ? `,<br><strong>${hors}</strong>` : ''}.
        </p>
      </div>`
  }).join('')

  const total = types.reduce((n, t) => n + Number(t.trente_jours || 0), 0)

  return {
    subject,
    html: layout({
      title: 'Ce qu\'on te demande',
      intro: `Bonjour <strong>${nom || 'Yopper'}</strong>, voilà ce que des habitants ont cherché chez toi ce mois-ci.`,
      body: `
        ${lignes}
        <p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:${C.ink};">
          ${total > 1 ? 'Ce sont des personnes de ta commune' : 'C\'est quelqu\'un de ta commune'}, qui ${total > 1 ? 'ont' : 'a'} pensé à toi.
          On ne te dit pas qui : ta fiche ne sert pas à collecter des coordonnées.
        </p>
        <p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:${C.muted};">
          Tu peux régler à partir de combien de demandes on t'écrit, faire une pause,
          ou ne plus rien recevoir du tout. Tout est sur la même page, en deux clics.
        </p>
      `,
      ctaUrl: `${APP_URL}/dashboard?config=signaux`,
      ctaLabel: 'Voir le détail',
      audience: 'commercant',
    }),
  }
}
