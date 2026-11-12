// BANC — UN RELEVÉ À LA FOIS (Alex, 12/11, après la panne de production)
//
// Décisions d'Alex (tableau, 12/11) :
//   - PARTOUT : chaque relevé répété saute son tour tant que le précédent n'a
//     pas répondu ;
//   - ABANDON APRÈS 20 s : l'écran garde ce qu'il affiche, le tour suivant
//     réessaie ;
//   - le TABLEAU DE BORD S'ESPACE quand la base peine (échec ou lecture de plus
//     de 5 s) : 10, 20, puis 60 s au plus ; retour à 5 s dès une lecture rapide.
//
// ⚠️ LE BANC EXÉCUTE LA RÈGLE (lib/releve-unique.js), avec de vrais minuteurs
// raccourcis, ET LIT CHAQUE RELEVÉ QUI L'APPELLE, sans sa prose.
//
//   npm run verif:garde

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  unSeulALaFois, prochainDelai, repeterEspace, siEcranRegarde,
  ABANDON_MS, RELEVE_LENT_MS, RELEVE_MAX_MS,
} from '../lib/releve-unique.js'

const RACINE = new URL('../', import.meta.url)
const code = (f) => sansProse(readFileSync(new URL(f, RACINE), 'utf8'))
const attendre = (ms) => new Promise((r) => setTimeout(r, ms))

let ok = 0
const echecs = []
function v(nom, condition, detail = '') {
  if (condition) ok++
  else echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// ═══ 1. LA RÈGLE, EXÉCUTÉE ═══════════════════════════════════════════════════
v('les seuils décidés : abandon 20 s, lente au-delà de 5 s, 60 s au plus',
  ABANDON_MS === 20000 && RELEVE_LENT_MS === 5000 && RELEVE_MAX_MS === 60000,
  JSON.stringify({ ABANDON_MS, RELEVE_LENT_MS, RELEVE_MAX_MS }))

{
  // Un tour en attente : le suivant est SAUTÉ, la lecture ne part qu'une fois.
  let appels = 0
  let liberer
  const tour = unSeulALaFois(() => { appels++; return new Promise((r) => { liberer = r }) }, { abandonMs: 1000 })
  const premier = tour()
  const second = await tour()
  v('🔴 un tour lancé pendant que le précédent attend est SAUTÉ', second.saute === true, JSON.stringify(second))
  v('🔴 la lecture n’est partie qu’une fois', appels === 1, String(appels))
  liberer()
  const r1 = await premier
  v('le premier tour rend la main avec ok', r1.ok === true && r1.abandon === false, JSON.stringify(r1))
  await tour()
  v('🔴 une fois la réponse reçue, le tour suivant repart', appels === 2, String(appels))
}

{
  // Une lecture qui ne répond JAMAIS : abandonnée, le signal coupe, la garde se libère.
  let signalVu = null
  let appels = 0
  const tour = unSeulALaFois((signal) => { appels++; signalVu = signal; return new Promise(() => {}) }, { abandonMs: 30 })
  const r = await tour()
  v('🔴 une lecture sans réponse est ABANDONNÉE au délai', r.abandon === true && r.ok === false, JSON.stringify(r))
  v('🔴 l’abandon coupe la lecture (signal annulé)', signalVu?.aborted === true)
  await tour()
  v('🔴 après l’abandon, le tour suivant repart (l’écran ne reste jamais figé)', appels === 2, String(appels))
}

{
  const enEchec = unSeulALaFois(async () => ({ echec: true }))
  const r = await enEchec()
  v('une lecture qui dit « échec » est comptée en échec', r.ok === false && !r.abandon, JSON.stringify(r))
  const qui = unSeulALaFois(async () => { throw new Error('réseau') })
  let rejet = false
  const r2 = await qui().catch(() => { rejet = true })
  v('🔴 une lecture qui plante ne fait pas planter le relevé (jamais de rejet)', !rejet && r2?.ok === false, JSON.stringify(r2))
  const r3 = await qui()
  v('et la garde est libérée après un plantage', r3?.saute !== true, JSON.stringify(r3))
}

{
  const opts = { base: 5000, max: 60000, lentMs: 5000 }
  v('une lecture rapide garde 5 s', prochainDelai(5000, { ok: true, duree: 300 }, opts) === 5000)
  v('🔴 une lecture rapide RAMÈNE à 5 s après un ralentissement', prochainDelai(60000, { ok: true, duree: 300 }, opts) === 5000)
  v('🔴 un échec espace : 5 → 10 s', prochainDelai(5000, { ok: false, duree: 100 }, opts) === 10000)
  v('🔴 une lecture de plus de 5 s espace aussi', prochainDelai(5000, { ok: true, duree: 7000 }, opts) === 10000)
  v('un abandon espace', prochainDelai(10000, { ok: false, abandon: true, duree: 20000 }, opts) === 20000)
  const suite = [5000]
  for (let i = 0; i < 4; i++) suite.push(prochainDelai(suite[suite.length - 1], { ok: false }, opts))
  v('🔴 10, 20, 40, puis 60 s AU PLUS', JSON.stringify(suite) === JSON.stringify([5000, 10000, 20000, 40000, 60000]), JSON.stringify(suite))
}

{
  // repeterEspace : le tour suivant ne part qu'APRÈS la réponse du précédent.
  let enVol = 0
  let maxEnVol = 0
  let tours = 0
  const tour = unSeulALaFois(async () => {
    enVol++; tours++; maxEnVol = Math.max(maxEnVol, enVol)
    await attendre(25)
    enVol--
  }, { abandonMs: 1000 })
  // ⚠️ On compte aussi les APPELS : la garde rattraperait un relevé qui
  // n'attend pas la réponse (deux protections pour une règle), mais ses
  // minuteurs se multiplieraient et frapperaient à une porte occupée.
  let appelsTour = 0
  const compte = () => { appelsTour++; return tour() }
  const arreter = repeterEspace(compte, { base: 5, max: 40, lentMs: 1000 })
  await attendre(200)
  arreter()
  const apresArret = tours
  await attendre(80)
  v('🔴 jamais deux lectures en même temps, même avec un rythme plus court que la lecture', maxEnVol === 1, String(maxEnVol))
  v('🔴 le tour suivant attend la réponse : aucun tour lancé pour rien', appelsTour === tours, `${appelsTour} appels pour ${tours} lectures`)
  v('le relevé tourne', tours >= 3, String(tours))
  v('🔴 arrêter le relevé l’arrête vraiment', tours === apresArret, `${apresArret} → ${tours}`)
}

{
  globalThis.document = { visibilityState: 'hidden' }
  let appels = 0
  const tour = siEcranRegarde(unSeulALaFois(async () => { appels++ }))
  const r = await tour()
  v('🔴 écran caché : le tour est sauté, rien ne part', r.saute === true && appels === 0, JSON.stringify(r))
  globalThis.document.visibilityState = 'visible'
  await tour()
  v('écran visible : le tour part', appels === 1, String(appels))
  delete globalThis.document
}

// ═══ 2. CHAQUE RELEVÉ PASSE PAR LA GARDE, LU ═════════════════════════════════
{
  const d = code('app/dashboard/page.js')
  v('🔴 tableau de bord : le relevé des 5 s est un seul tour à la fois',
    /const tour = unSeulALaFois\(async \(signal\) => \{/.test(d))
  v('🔴 tableau de bord : il s’espace quand la base peine, à partir de 5 s',
    /pollingRef\.current = repeterEspace\(tour, \{ base: RELEVE_RECENT_MS \}\)/.test(d))
  v('🔴 tableau de bord : un tour abandonné ne pose RIEN à l’écran (3 lectures)',
    (d.match(/if \(signal\.aborted\) return \{ echec: true \}/g) || []).length === 3)
  v('tableau de bord : les trois lectures coupent leur réseau à l’abandon',
    (d.match(/\.abortSignal\(signal\)/g) || []).length === 3)
  v('🔴 tableau de bord : une lecture en erreur compte comme un échec (espacement)',
    /if \(error\) echec = true/.test(d) && /if \(agendaPret && !rdvsRecents\) echec = true/.test(d) && /return \{ echec \}/.test(d))
  v('🔴 tableau de bord : plus aucun setInterval pour ce relevé',
    !/pollingRef\.current = setInterval/.test(d) && !/clearInterval\(pollingRef\.current\)/.test(d))
  v('🔴 tableau de bord : une seule relecture complète à la fois (retour, focus, 5 min)',
    /const relire = unSeulALaFois\(\(\) => Promise\.all\(\[chargerCommandes\(cid\), chargerRdvs\(cid\)\]\)\)/.test(d)
    && /if \(document\.visibilityState === 'visible'\) relire\(\)/.test(d))

  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 poste équipe : un tour à la fois, rien quand l’écran est caché',
    /const tour = unSeulALaFois\(\(\) => charger\(\)\)/.test(poste) && /setInterval\(siEcranRegarde\(tour\), RAFRAICHIR_MS\)/.test(poste)
    && /if \(document\.visibilityState === 'visible'\) tour\(\)/.test(poste))
  const reglage = code('app/dashboard/ReglageEtiquettes.js')
  v('🔴 réglage des étiquettes : un tour à la fois, rien quand l’écran est caché',
    /const tour = unSeulALaFois\(\(\) => relire\(\)\)/.test(reglage) && /setInterval\(siEcranRegarde\(tour\), 20000\)/.test(reglage))
  const config = code('app/dashboard/ConfigDashboard.js')
  v('catalogue : les ventes du magasin, un tour à la fois',
    /const tour = unSeulALaFois\(\(\) => chargerVentesMagasin\(\)\)/.test(config))
  v('catalogue : les commandes du jour, un tour à la fois',
    /const tour = unSeulALaFois\(\(\) => chargerCommandesAujourdhui\(\)\)/.test(config))
  v('catalogue : les deux relevés sautent l’écran caché',
    (config.match(/setInterval\(siEcranRegarde\(tour\), 30000\)/g) || []).length === 2)
  const fiche = code('app/commander/[slug]/page.js')
  v('fiche publique : un tour à la fois, écran caché sauté',
    /const tour = unSeulALaFois\(\(\) => Promise\.all\(\[chargerCommandesJour\(\), rafraichirArticlesEtStocks\(\)\]\)\)/.test(fiche)
    && /const intervalId = setInterval\(siEcranRegarde\(tour\), 30000\)/.test(fiche))
  const bandeau = code('app/dashboard/BandeauFicheAPublier.js')
  v('bandeau « fiche à publier » : un tour à la fois, écran caché sauté',
    /const tour = unSeulALaFois\(\(\) => lire\(\)\)/.test(bandeau) && /setInterval\(siEcranRegarde\(tour\), RELECTURE_MS\)/.test(bandeau))
  const yopper = code('app/commander/page.js')
  v('côté Yopper : ses commandes et rendez-vous (15 s), un tour à la fois',
    /const iv = setInterval\(siEcranRegarde\(tour\), 15000\)/.test(yopper))
  v('côté Yopper : les deux relectures de la minute, une à la fois',
    (yopper.match(/if \(document\.visibilityState === 'visible'\) relire\(\)/g) || []).length === 2
    && /const relire = unSeulALaFois\(\(\) => Promise\.all\(\[chargerActiviteAujourdhui\(ids\), chargerNotes\(ids, commercants\)\]\)\)/.test(yopper))
  const rdv = code('app/commander/rdv/[slug]/page.js')
  v('🔴 retour de Stripe : une lecture à la fois, chaque seconde comptée, rien écran caché',
    /const timer = setInterval\(\(\) => \{ if \(!ecranRegarde\(\)\) return; tentatives\+\+; lecture\(\) \}, 1000\)/.test(rdv)
    && /const pollInterval = setInterval\(\(\) => \{ if \(!ecranRegarde\(\)\) return; attempts\+\+; lecture\(\) \}, 1000\)/.test(rdv)
    && (rdv.match(/const lecture = unSeulALaFois\(async \(\) => \{/g) || []).length === 2)
}

// ═══ 3. LA PRATIQUE, PARTOUT ═════════════════════════════════════════════════
// ⚠️ On n'interdit pas un fichier, on interdit la FORME qui empile : un
// `setInterval(async …)` lance son tour sans attendre le précédent.
{
  const { readdirSync } = await import('node:fs')
  const fautifs = []
  const parcourir = (dossier) => {
    for (const e of readdirSync(new URL(dossier, RACINE), { withFileTypes: true })) {
      const chemin = `${dossier}/${e.name}`
      if (e.isDirectory()) { parcourir(chemin); continue }
      if (!e.name.endsWith('.js')) continue
      if (/setInterval\(\s*async\b/.test(code(chemin))) fautifs.push(chemin)
    }
  }
  parcourir('app')
  parcourir('lib')
  v('🔴 aucun setInterval(async …) dans l’app : il empile ses lectures', fautifs.length === 0, fautifs.join(', '))
}

console.log(`Un relevé à la fois : ${ok} vérifications`)
if (echecs.length) {
  console.log(`🔴 ${echecs.length} ÉCHEC(S) :`)
  echecs.forEach((e) => console.log('   • ' + e))
  process.exit(1)
}
console.log('Tout passe.')
