// lib/resend-landing.js — Templates email Resend pour la landing page.
//
// Separe de lib/resend.js pour ne pas surcharger le fichier principal.
// Reutilise le logo canonique + la palette + le layout (mais footer different
// car ici les destinataires sont des pre-inscrits landing, pas des Yoppers ou
// des commercants).

import { logoEmailDark, C } from './resend'
import { getRevealLabel } from './landing-mode'
import { libelleLancement } from './lancement'

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
export function emailMerciPreinscription({ mode_landing = 'teasing', type_utilisateur = 'curieux', slug_kit = null } = {}) {
  // Bloc kit de partage : seulement pour un commerçant qui a un slug (Kit Ch3).
  // Lien tracké + QR sur la page /kit/<slug>. Domaine canonique www obligatoire.
  const kitBlock = slug_kit ? `
        <div style="margin:24px 0 0;padding:18px 18px 20px;border-radius:14px;background:${C.pale};border:1px solid ${C.light};">
          <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:${C.ink};">Ton kit de partage est prêt 🟣</p>
          <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6;color:${C.ink};">
            Un lien personnel et un QR code à afficher en vitrine. Chaque inscription via ton lien fait avancer ta commune vers son lancement.
          </p>
          <a href="https://www.yoppaa.app/kit/${slug_kit}" style="display:inline-block;padding:12px 26px;background:linear-gradient(135deg,${C.panel},${C.main});color:#fff;text-decoration:none;border-radius:100px;font-weight:800;font-size:14px;">
            Ouvrir mon kit →
          </a>
        </div>` : ''

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
        ${kitBlock}
      `,
    })
  }

  // Mode reveal (à partir du 1er août) : le projet est dévoilé, l'inscrit sait
  // déjà ce qu'est Yoppaa. Ce mail ne doit donc plus teaser : il dit CE QUI SE
  // PASSE ENSUITE (ouverture le 1er septembre), ce que la personne pourra
  // faire, et surtout ce qu'elle peut faire MAINTENANT, c'est-à-dire partager,
  // parce que c'est le nombre d'inscrits qui déclenche l'activation d'une
  // commune. Sans cet appel au partage, la préinscription est un cul-de-sac.
  const isCommercant = type_utilisateur === 'commercant'
  const dateLancement = libelleLancement({ avecAnnee: true })

  const encartPartage = `
        <div style="margin:24px 0 0;padding:18px 18px 20px;border-radius:14px;background:${C.bg};border:1px solid ${C.pale};">
          <p style="margin:0 0 8px;font-size:14px;font-weight:800;color:${C.ink};">Tu peux déjà faire avancer ta commune</p>
          <p style="margin:0 0 14px;font-size:13.5px;line-height:1.6;color:${C.ink};">
            Une commune s'active quand assez d'habitants et de commerçants s'y sont inscrits.
            Chaque personne à qui tu en parles rapproche la tienne de son ouverture.
            Envoie-leur simplement <strong>www.yoppaa.app</strong>.
          </p>
          <a href="https://www.yoppaa.app" style="display:inline-block;padding:12px 26px;background:linear-gradient(135deg,${C.panel},${C.main});color:#fff;text-decoration:none;border-radius:100px;font-weight:800;font-size:14px;">
            Partager Yoppaa →
          </a>
        </div>`

  return layout({
    title: 'Bienvenue dans la tribu',
    intro: `Bienvenue dans la tribu Yoppaa 🟣`,
    body: `
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
        ${isCommercant
          ? `Te voilà inscrit comme <strong>commerçant pionnier</strong>. L'app ouvre le <strong style="color:${C.main};">${dateLancement}</strong> : ce jour-là tu recevras ton lien d'activation pour créer ta page, ton catalogue et tes horaires.`
          : `Te voilà inscrit comme <strong>Yopper</strong>. L'app ouvre le <strong style="color:${C.main};">${dateLancement}</strong> : tu recevras un email ce jour-là, tu seras parmi les premiers à pouvoir l'utiliser.`}
      </p>
      <div style="margin:0 0 18px;padding:16px 18px;border-radius:14px;background:${C.bg};border:1px solid ${C.pale};">
        <p style="margin:0 0 8px;font-size:11px;font-weight:800;color:${C.muted};text-transform:uppercase;letter-spacing:0.7px;">Ce qui t'attend</p>
        ${isCommercant ? `
        <p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;color:${C.ink};">Une page professionnelle, des commandes et des rendez-vous en ligne, une carte de fidélité, des bons cadeaux, et tes offres poussées chaque matin aux habitants de ta commune.</p>
        <p style="margin:0;font-size:13.5px;line-height:1.6;color:${C.ink};">Aucune commission sur tes ventes, une formule gratuite pour toujours, et 30 jours d'essai sur les formules payantes.</p>
        ` : `
        <p style="margin:0 0 6px;font-size:13.5px;line-height:1.6;color:${C.ink};">Commander ton pain avant de passer, réserver ton coiffeur à minuit, recevoir chaque matin les bonnes affaires de ta commune, et cumuler tes points de fidélité sans carte en carton.</p>
        <p style="margin:0;font-size:13.5px;line-height:1.6;color:${C.ink};">Tous tes commerces de quartier au même endroit, gratuitement.</p>
        `}
      </div>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${C.ink};">
        D'ici là, je te tiendrai au courant des vraies étapes. Pas de spam, promis.
      </p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:${C.ink};">
        Merci de faire partie de l'aventure 🟣<br/>
        <strong>Alexandre</strong>
      </p>
      ${slug_kit ? kitBlock : encartPartage}
    `,
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
