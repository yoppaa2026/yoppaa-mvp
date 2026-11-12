// UN RELEVÉ À LA FOIS (Alex, 12/11, après la panne de production).
//
// 🔴 POURQUOI. Le 12/11, la base de production (taille « Nano ») a saturé. Les
// relevés qui se répètent ne l'ont pas causé, mais ils en ont fait une PANNE
// COMPLÈTE : un `setInterval` lance son tour même si le précédent n'a pas
// répondu. Quand la base ralentit, chaque tablette et chaque tableau de bord
// ouvert empilent une nouvelle série de lectures toutes les 5 s sur des
// lectures encore en attente, et la file ne se vide plus jamais.
//
// Décisions d'Alex (tableau, 12/11) :
//   - PARTOUT : chaque relevé répété saute son tour tant que le précédent
//     n'a pas répondu ;
//   - ABANDON APRÈS 20 s : une lecture qui ne répond pas est annulée, l'écran
//     garde ce qu'il affiche et le tour suivant réessaie. Sans cela, une seule
//     requête perdue figerait l'écran jusqu'au rechargement ;
//   - LE TABLEAU DE BORD S'ESPACE quand la base peine (lecture en échec ou de
//     plus de 5 s) : 10 s, 20 s, puis 60 s au plus, et revient à 5 s dès
//     qu'une lecture est rapide.
//
// ⚠️ L'ABANDON NE COMPTE PAS SUR LE SEUL `AbortSignal`. Il annule le `fetch`,
// mais supabase-js résout son jeton AVANT d'émettre la requête
// (reference_rappel_auth_verrou) : un blocage à cet endroit ignorerait le
// signal. La garde se libère donc d'elle-même au bout du délai, que la
// lecture ait rendu la main ou non ; le signal sert à couper le réseau et à
// dire au relevé de ne plus rien poser à l'écran.

import { ecranRegarde } from './rafraichissement.js'

export const ABANDON_MS = 20 * 1000
export const RELEVE_LENT_MS = 5 * 1000
export const RELEVE_MAX_MS = 60 * 1000

/**
 * Enveloppe un relevé : un seul tour à la fois, abandonné au bout de
 * `abandonMs`. `travail(signal)` reçoit un `AbortSignal` ; il peut rendre
 * `{ echec: true }` pour dire qu'il n'a pas pu lire (le tableau de bord
 * s'espace alors).
 *
 * Le tour rend `{ saute }` s'il n'a pas été lancé, sinon
 * `{ ok, abandon, duree }`. Il ne rejette jamais.
 */
export function unSeulALaFois(travail, { abandonMs = ABANDON_MS } = {}) {
  let enCours = null
  return function tour() {
    if (enCours) return Promise.resolve({ saute: true })
    const jeton = {}
    enCours = jeton
    const controle = new AbortController()
    const debut = Date.now()
    let minuterie = null
    const delai = new Promise((resoudre) => {
      minuterie = setTimeout(() => { controle.abort(); resoudre({ ok: false, abandon: true }) }, abandonMs)
    })
    const lecture = Promise.resolve()
      .then(() => travail(controle.signal))
      .then((r) => ({ ok: !(r && r.echec), abandon: false }), () => ({ ok: false, abandon: false }))
    return Promise.race([lecture, delai]).then((r) => {
      clearTimeout(minuterie)
      if (enCours === jeton) enCours = null
      return { ...r, duree: Date.now() - debut }
    })
  }
}

/**
 * Le délai avant le tour suivant : la base qui peine (échec, abandon, lecture
 * lente) double l'attente jusqu'à `max` ; une lecture rapide ramène à `base`.
 */
export function prochainDelai(actuel, resultat, { base, max = RELEVE_MAX_MS, lentMs = RELEVE_LENT_MS } = {}) {
  const r = resultat || {}
  const peine = r.abandon === true || r.ok === false || (Number(r.duree) || 0) > lentMs
  if (!peine) return base
  return Math.min(max, Math.max(base, Number(actuel) || base) * 2)
}

/**
 * Répète `tour` (créé par `unSeulALaFois`) : le tour suivant ne se programme
 * qu'APRÈS la réponse du précédent, au délai que `prochainDelai` fixe.
 * Rend la fonction qui arrête le relevé.
 */
export function repeterEspace(tour, { base, max = RELEVE_MAX_MS, lentMs = RELEVE_LENT_MS } = {}) {
  let arrete = false
  let minuterie = null
  let delai = base
  const programmer = () => { if (!arrete) minuterie = setTimeout(boucle, delai) }
  async function boucle() {
    const r = await tour()
    if (arrete) return
    if (!r.saute) delai = prochainDelai(delai, r, { base, max, lentMs })
    programmer()
  }
  programmer()
  return () => { arrete = true; clearTimeout(minuterie) }
}

/**
 * Le relevé d'un écran que personne ne regarde ne part pas : le tour est
 * simplement sauté, et reprend au retour sur l'écran.
 */
export function siEcranRegarde(tour) {
  return () => (ecranRegarde() ? tour() : Promise.resolve({ saute: true }))
}
