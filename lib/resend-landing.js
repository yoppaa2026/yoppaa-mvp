// lib/resend-landing.js — Templates email Resend pour la landing page.
//
// Separe de lib/resend.js pour ne pas surcharger le fichier principal.
// Reutilise le logo canonique + la palette + le layout (mais footer different
// car ici les destinataires sont des pre-inscrits landing, pas des Yoppers ou
// des commercants).

import { logoEmailDark, C } from './resend'
import { getRevealLabel } from './landing-mode'

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
    <div style="background:linear-gradient(135deg,${C.panel} 0%,#2D0F6B 60%,${C.ink} 100%);border-radius:18px 18px 0 0;padding:32px 28px 26px;">
      ${logoEmailDark(36)}
      <p style="margin:14px 0 0;color:${C.light};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${title}</p>
    </div>
    <div style="background:#fff;border-radius:0 0 18px 18px;padding:30px 28px;border:1px solid ${C.pale};border-top:none;">
      ${intro ? `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:${C.ink};">${intro}</p>` : ''}
      ${body}
      ${ctaUrl && ctaLabel ? `
        <p style="margin:26px 0 0;text-align:center;">
          <a href="${ctaUrl}" style="display:inline-block;padding:14px 30px;background:linear-gradient(135deg,${C.panel},${C.main});color:#fff;text-decoration:none;border-radius:100px;font-weight:800;font-size:15px;letter-spacing:-0.2px;">
            ${ctaLabel} →
          </a>
        </p>
      ` : ''}
    </div>
    <p style="margin:20px 0 0;text-align:center;font-size:11px;color:${C.muted};">
      yoppaa.app · Ton quartier dans ta poche
      <br/>Tu reçois cet email parce que tu t'es inscrit sur yoppaa.app.
    </p>
  </div>
</body>
</html>`
}

// Email de remerciement apres pre-inscription.
// Variantes selon mode_landing (teasing/reveal) + type_utilisateur.
export function emailMerciPreinscription({ mode_landing = 'teasing', type_utilisateur = 'curieux' } = {}) {
  if (mode_landing === 'teasing') {
    return layout({
      title: 'Bien reçu',
      intro: `Merci d'avoir laissé ton email 🟣`,
      body: `
        <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
          Tu fais maintenant partie des <strong>premiers curieux</strong>.
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
          Je construis quelque chose depuis plusieurs mois. Un projet belge, ancré dans nos quartiers, qui prendra sa pleine forme le <strong style="color:${C.main};">${getRevealLabel()}</strong>.
        </p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
          Ce jour-là, tu recevras un email avec tous les détails. Tu seras parmi les <strong>premiers à savoir</strong>.
        </p>
        <p style="margin:0;font-size:15px;line-height:1.65;color:${C.ink};">
          À très vite,<br/>
          <strong>Alexandre</strong> 🟣
        </p>
      `,
    })
  }

  // Mode reveal : message plus complet
  const isCommercant = type_utilisateur === 'commercant'
  return layout({
    title: 'Bienvenue dans la tribu',
    intro: `Bienvenue dans la communauté Yoppaa 🟣`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
        ${isCommercant
          ? "Tu es maintenant inscrit(e) comme <strong>commerçant pionnier</strong>. Tu seras prévenu(e) dès que ta page Yoppaa Pro sera prête à activer (septembre 2026)."
          : "Tu es maintenant inscrit(e) comme <strong>Yopper</strong>. Tu seras parmi les premiers à pouvoir télécharger l'app dès le lancement officiel (septembre 2026)."}
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
        D'ici là, je te tiendrai informé(e) de l'avancée du projet. Pas de spam, juste les vraies étapes.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:${C.ink};">
        Merci de faire partie de cette aventure 🟣<br/>
        <strong>Alexandre</strong>
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app',
    ctaLabel: 'Suivre l\'aventure',
  })
}

// Email envoye au reveal (1er aout, date pilotee par NEXT_PUBLIC_REVEAL_DATE) aux
// pre-inscrits Teasing : le grand devoilement.
export function emailRevealLaunch() {
  return layout({
    title: 'C\'est parti',
    intro: `Le moment est venu. Yoppaa, c'est officiel. 🟣`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
        Tu fais partie des <strong>premiers curieux</strong>. Tu as laissé ton email pendant la phase mystère, merci pour ta confiance.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
        Aujourd'hui, je peux enfin te présenter ce que je construis : <strong style="color:${C.main};">Yoppaa, l'app belge des commerces de quartier</strong>.
      </p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
        Sans commission. Belge. Bootstrap. Pour ton quartier.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:${C.ink};">
        Découvre tout maintenant 👇
      </p>
    `,
    ctaUrl: 'https://www.yoppaa.app',
    ctaLabel: 'DÉCOUVRIR YOPPAA',
  })
}
