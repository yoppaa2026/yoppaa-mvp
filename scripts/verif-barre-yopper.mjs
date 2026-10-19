// Banc de la BARRE YOPPER SUR LES FICHES (19/10).
//
// ✅ Alex, au tableau : « Sur la fiche, pas dans le tunnel ». La barre
// Accueil · Suivi · Tribu · Profil se montre quand on parcourt une fiche,
// disparaît du créneau ou du panier jusqu'au paiement, et revient sur la
// confirmation.
//
//   npm run verif:barre

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { barreSurLaFiche, HAUTEUR_BARRE_YOPPER } from '../lib/barre-yopper.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const code = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

// ═══ 1. LA RÈGLE ════════════════════════════════════════════════════════════
verifier('commande : la carte sans panier la montre', barreSurLaFiche({ type: 'commande', etape: 2, panierVide: true }) === true)
verifier('commande : un panier rempli la retire', barreSurLaFiche({ type: 'commande', etape: 2, panierVide: false }) === false)
verifier('commande : le tunnel (créneau, coordonnées, paiement) la retire', barreSurLaFiche({ type: 'commande', etape: 3, panierVide: true }) === false)
verifier('commande : la confirmation la remontre', barreSurLaFiche({ type: 'commande', etape: 4, panierVide: false }) === true)
verifier('rdv : le choix de la prestation la montre', barreSurLaFiche({ type: 'rdv', etape: 1 }) === true)
verifier('rdv : des produits au panier la retirent', barreSurLaFiche({ type: 'rdv', etape: 1, panierVide: false }) === false)
verifier('rdv : le créneau la retire', barreSurLaFiche({ type: 'rdv', etape: 2 }) === false)
verifier('rdv : les coordonnées et le paiement la retirent', barreSurLaFiche({ type: 'rdv', etape: 3 }) === false)
verifier('rdv : la confirmation la remontre', barreSurLaFiche({ type: 'rdv', etape: 4, confirme: true }) === true)
verifier('un type inconnu ne montre rien', barreSurLaFiche({ type: 'autre', etape: 1 }) === false)
verifier('la hauteur est un nombre', HAUTEUR_BARRE_YOPPER > 40 && HAUTEUR_BARRE_YOPPER < 100)

// ═══ 2. UN SEUL COMPOSANT, TROIS ÉCRANS ═════════════════════════════════════
const BARRE = code('app/commander/BarreYopper.js')
const ACCUEIL = code('app/commander/page.js')
const CMD = code('app/commander/[slug]/page.js')
const RDV = code('app/commander/rdv/[slug]/page.js')
verifier('l’écran principal utilise le composant', ACCUEIL.includes('<BarreYopper className="navbar hero-fullwidth" actif={onglet} onChoisir={setOnglet}'))
verifier('l’écran principal n’a plus sa propre copie de la barre', !ACCUEIL.includes('<nav className="navbar'))
verifier('le composant garde les classes que la feuille globale remonte en tête sur grand écran',
  BARRE.includes('<nav className={className}>') && BARRE.includes('<div className="navbar-tabs">') && /className = 'navbar'/.test(BARRE))
verifier('hors de l’écran principal, un onglet ouvre l’écran principal sur cet onglet',
  BARRE.includes('router.push(`/commander?onglet=${encodeURIComponent(cle)}`)'))
verifier('le composant porte son style (une fiche ne charge pas celui de l’écran principal)',
  /\.navbar \{[^}]*flex-shrink: 0/.test(BARRE) && /@keyframes navPillPulse/.test(BARRE))
verifier('la fiche commande suit la règle',
  CMD.includes("barreSurLaFiche({ type: 'commande', etape, panierVide: nbArticlesPanier() === 0 })") && CMD.includes('{barreYopper && <BarreYopper/>}'))
verifier('la fiche rendez-vous suit la règle',
  /barreSurLaFiche\(\{\s*type: 'rdv', etape, panierVide: !barrePanierVisible,\s*confirme: \(etape === 4 && !!rdvCree\) \|\| etape === 5,/.test(RDV)
  && RDV.includes('{barreYopper && <BarreYopper/>}'))
verifier('la bulle « Un service en plus » se pose au-dessus de la barre',
  CMD.includes('auDessus={barreYopper ? HAUTEUR_BARRE_YOPPER : 0}')
  && code('app/commander/SignauxYopper.js').includes('bottom: `calc(${18 + (Number(auDessus) || 0)}px + env(safe-area-inset-bottom, 0px))`'))
verifier('les messages éphémères se posent au-dessus de la barre',
  CMD.includes('bottom: barreYopper ? 28 + HAUTEUR_BARRE_YOPPER : 28')
  && RDV.includes('bottom: barreYopper ? `calc(${28 + HAUTEUR_BARRE_YOPPER}px + env(safe-area-inset-bottom, 0px))` : 90'))
verifier('la barre se place DANS la page, sous la zone qui défile (pas par-dessus)',
  // (le commentaire JSX retiré par `sansProse` laisse ses accolades vides)
  /<\/div>[\s{}]*\{barreYopper && <BarreYopper\/>\}\s*<\/div>/.test(CMD) && /<\/div>[\s{}]*\{barreYopper && <BarreYopper\/>\}\s*<\/div>/.test(RDV))

console.log(`\nverif:barre — ${ok} OK, ${ko} KO`)
if (ko) { for (const e of echecs) console.log('  ✗ ' + e); process.exit(1) }
