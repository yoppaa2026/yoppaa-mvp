'use client'
// UN ÉCRAN QUI PLANTE DOIT DIRE POURQUOI (05/10).
//
// 🔴 LE CAS QUI L'A FAIT NAÎTRE : après « Supprimer mon compte », Alex voyait
// la page anglaise de Next, « This page couldn't load », sur son iPhone. Pas
// de console sur un téléphone, rien côté serveur : on ne pouvait que deviner.
//
// Les deux écrans d'erreur (app/error.js, app/global-error.js) appellent
// cette fonction. Elle envoie le message et le début de la pile à
// `/api/erreur-ecran`, qui les écrit dans les journaux du serveur.
//
// ⚠️ LE CHEMIN SEUL, JAMAIS L'ADRESSE ENTIÈRE : une adresse peut porter un
// jeton (lien d'annulation, lien de connexion) dans sa partie « ?… ».
// ⚠️ BEST-EFFORT : un signalement qui échoue ne doit jamais aggraver l'écran.

export function resumeErreur(error) {
  return {
    message: String(error?.message || error || 'erreur inconnue').slice(0, 500),
    pile: String(error?.stack || '').split('\n').slice(0, 8).join('\n').slice(0, 1500),
    digest: error?.digest ? String(error.digest).slice(0, 100) : null,
  }
}

export function signalerErreurEcran(error, ou = 'page') {
  try {
    const chemin = typeof window !== 'undefined' ? window.location.pathname.slice(0, 200) : null
    fetch('/api/erreur-ecran', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...resumeErreur(error), chemin, ou }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* rien : on ne fait pas planter l'écran qui signale un plantage */ }
}
