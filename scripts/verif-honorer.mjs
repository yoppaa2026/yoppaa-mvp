// Banc « HONORER CE QUI EXISTE » (17/10).
//
// 🔴 RÈGLE DU PROJET : la garde porte sur la CRÉATION, jamais sur la
// CONSOMMATION. L'audit du 17/10 (bouton « Revenir à ma formule », ICONIC) a
// trouvé sept choses déjà vendues que l'écran rendait inatteignables quand le
// commerçant perd Vendre : commandes d'un salon, bons cadeaux, compte Stripe,
// cartes de séances, export comptable, récap de 8 h, cartes de fidélité.
// ✅ Alex, au tableau : rouvrir S'IL Y A QUELQUE CHOSE à honorer, création
// fermée ; et fermer l'encodage de commandes et de rendez-vous hors formule.
//
//   npm run verif:honorer

import { readFileSync } from 'node:fs'
import {
  TRACES_PAR_FONCTION, fonctionsAHonorer, exportComptableAutorise,
  recapDuJourAEnvoyer, PHRASE_HONORER,
} from '../lib/honorer.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const sans = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
const code = (f) => sans(readFileSync(f, 'utf8'))

// ═══ 1. LA RÈGLE, EXÉCUTÉE ═══════════════════════════════════════════════════
{
  const rien = () => false
  const tout = { bonsActifs: 3, compteStripe: true, abonnementsActifs: 2, ventes: 40, cartesFidelite: 200, commandesEnCours: 1 }
  const ouvert = fonctionsAHonorer(tout, rien)
  verifier('chaque trace rouvre sa fonction',
    ['bons_cadeaux', 'paiement_ligne', 'rdv', 'export_comptable', 'fidelite', 'commande'].every(f => ouvert.has(f)),
    [...ouvert].join(', '))
  verifier('sans trace, rien ne se rouvre', fonctionsAHonorer({}, rien).size === 0)
  verifier('zéro n\'est pas une trace',
    fonctionsAHonorer({ bonsActifs: 0, compteStripe: false, ventes: 0 }, rien).size === 0)
  verifier('une trace illisible n\'ouvre rien',
    fonctionsAHonorer({ bonsActifs: NaN, ventes: 'beaucoup', cartesFidelite: Infinity }, rien).size === 0)
  verifier('une fonction déjà à lui n\'est pas « à honorer »',
    !fonctionsAHonorer(tout, f => f === 'fidelite').has('fidelite'))
  verifier('chaque fonction a sa trace, et les traces sont distinctes',
    new Set(Object.values(TRACES_PAR_FONCTION)).size === Object.keys(TRACES_PAR_FONCTION).length)

  verifier('l\'export s\'ouvre par le forfait', exportComptableAutorise({ forfaitLePermet: true, nbLignes: 0 }))
  verifier('ou par des lignes à déclarer', exportComptableAutorise({ forfaitLePermet: false, nbLignes: 12 }))
  verifier('sans forfait ni ligne, il reste fermé', !exportComptableAutorise({ forfaitLePermet: false, nbLignes: 0 }))
  verifier('et sans renseignement aussi', !exportComptableAutorise())

  verifier('le récap part avec le forfait', recapDuJourAEnvoyer({ forfaitOuvert: true }))
  verifier('ou avec des commandes à remettre aujourd\'hui', recapDuJourAEnvoyer({ nbCommandes: 3 }))
  verifier('ou avec des tables déjà prises', recapDuJourAEnvoyer({ nbTables: 2 }))
  verifier('sinon, pas d\'email « Aucune commande » à qui ne peut plus en recevoir', !recapDuJourAEnvoyer({}))

  verifier('la phrase dit hors formule, honorer, et pas de neuf',
    /Hors de ta formule/.test(PHRASE_HONORER) && /honores/.test(PHRASE_HONORER) && /sans en créer/.test(PHRASE_HONORER))
}

// ═══ 2. LES ONGLETS DE PARAMÈTRES ════════════════════════════════════════════
{
  const bord = code('app/dashboard/ConfigDashboard.js')
  verifier('les traces ne sont comptées que pour les fonctions perdues',
    /const fonctionsManquantes = Object\.keys\(TRACES_PAR_FONCTION\)\s*\.filter\(f => f !== 'commande' && etatDe\(f\) !== null && !aLuiFonction\(f\)\)/.test(bord))
  verifier('la règle vient du module', /const aHonorer = fonctionsAHonorer\(tracesAHonorer, aLuiFonction\)/.test(bord))
  verifier('l\'onglet porte son « honore »', /honore: !!t\.feature && aHonorer\.has\(t\.feature\)/.test(bord))
  verifier('changerOnglet laisse entrer un onglet à honorer',
    /cible\.etat !== FONCTION_INCLUSE && cible\.etat !== FONCTION_EN_ESSAI && !cible\.honore\) \{\s*proposerFonction\(cible\)/.test(bord))
  verifier('la page « hors formule » se tait devant un onglet à honorer',
    /if \(cible\.etat === FONCTION_INCLUSE \|\| cible\.etat === FONCTION_EN_ESSAI \|\| cible\.honore\) return null/.test(bord))
  verifier('un onglet à honorer n\'a ni cadenas ni gris',
    /const ferme = t\.etat === FONCTION_FERMEE && !t\.honore/.test(bord)
    && /const aLui = t\.etat === FONCTION_INCLUSE \|\| t\.etat === FONCTION_EN_ESSAI \|\| t\.honore/.test(bord))

  for (const [onglet, feature, composant] of [
    ['fidelite', 'fidelite', 'TabFidelite'],
    ['bons', 'bons_cadeaux', 'TabBonsCadeaux'],
  ]) {
    verifier(`« ${onglet} » s'ouvre aussi pour honorer, en mode honorer`,
      new RegExp(`\\{tab === '${onglet}' && \\(peut\\(commercant, '${feature}'\\) \\|\\| aHonorer\\.has\\('${feature}'\\)\\) && <${composant} [^>]*modeHonorer=\\{!peut\\(commercant, '${feature}'\\)\\}`).test(bord))
  }
  verifier('« paiements » s\'ouvre pour honorer un compte Stripe',
    /\{tab === 'paiements' && \(peutPaiements \|\| aHonorer\.has\('paiement_ligne'\)\) && <TabPaiements/.test(bord)
    && /\{tab === 'paiements' && !peutPaiements && aHonorer\.has\('paiement_ligne'\) && <BandeauHonorer \/>\}/.test(bord))
  verifier('« comptabilité » s\'ouvre pour déclarer ses ventes passées',
    /\{tab === 'comptabilite' && \(peut\(commercant, 'export_comptable'\) \|\| aHonorer\.has\('export_comptable'\)\) && <TabComptabilite/.test(bord))
  verifier('les cartes de séances s\'ouvrent pour honorer',
    /honorerAbonnements=\{aHonorer\.has\('rdv'\)\}/.test(bord)
    && /const modeHonorerAbonnements = !peut\(commercant, 'rdv'\) && honorerAbonnements/.test(bord)
    && /<TabRdvAbonnements [^>]*modeHonorer=\{modeHonorerAbonnements\}/.test(bord))

  // LA CRÉATION RESTE FERMÉE.
  verifier('bons : pas de réglage de vente en mode honorer',
    /\{!modeHonorer && <div style=\{\{ \.\.\.s\.card, marginBottom: 14 \}\}>\s*<Toggle value=\{actif\} onChange=\{setActif\} label=\{`Proposer les \$\{nomBons\} sur ma fiche`\}/.test(bord))
  verifier('fidélité : pas de nouvelle carte en mode honorer',
    /\{modeHonorer\s*\? <p[^>]*>Hors de ta formule, on n&rsquo;ouvre plus de nouvelle carte\.<\/p>\s*: <button style=\{btnPlein\} disabled=\{busy\} onClick=\{creerCarte\}>/.test(bord))
  verifier('fidélité : le pointage reste ouvert en mode honorer',
    /\{\(actif \|\| modeHonorer\) && \(/.test(bord))
  verifier('cartes de séances : ni nouvelle formule ni nouvelle inscription',
    /\{!modeHonorer && \(\s*<button onClick=\{openNew\}/.test(bord)
    && /\{!modeHonorer && \(\s*<button onClick=\{\(\) => \{ setInsc\(initialInscription\); setShowInscription\(true\) \}\}/.test(bord))
  verifier('la phrase vient du module', /<p [^>]*>\{PHRASE_HONORER\}<\/p>/.test(bord))

  // LES TRACES.
  const traces = code('app/dashboard/useTracesAHonorer.js')
  verifier('des comptes, jamais des lignes', (traces.match(/head: true/g) || []).length >= 6)
  verifier('des bons NON ÉPUISÉS seulement', /\.eq\('statut', 'actif'\)\.gt\('solde', 0\)/.test(traces))
  verifier('des cartes de séances ACTIVES seulement', /from\('abonnements'\)[\s\S]{0,120}\.eq\('statut', 'actif'\)\.is\('deleted_at', null\)/.test(traces))
  verifier('des commandes PAS TERMINÉES seulement', /\.not\('statut', 'in', FILTRE_STATUTS_TERMINES\)/.test(traces))
  verifier('une lecture ratée vaut zéro', /return error \? 0 : \(count \|\| 0\)/.test(traces))
}

// ═══ 3. LE TABLEAU DE BORD ═══════════════════════════════════════════════════
{
  const page = code('app/dashboard/page.js')
  verifier('les commandes d\'un salon restent visibles s\'il y en a à honorer',
    /const commandesVisibles = commercant\?\.categorie !== 'vitrine'\s*\|\| canDo\(forfaitEnVigueur, 'commande'\) \|\| aHonorerBord\.has\('commande'\)/.test(page))
  verifier('les deux barres lisent la même visibilité',
    (page.match(/key: 'commandes', [^}]*visible: commandesVisibles \}/g) || []).length === 2)
  verifier('le salon n\'est plus chassé de ses commandes à honorer',
    /if \(commercant\?\.categorie === 'vitrine' && !commandesVisibles && ongletPrincipal === 'commandes'\)/.test(page))
  verifier('les raccourcis fidélité et bons restent pour honorer',
    /\(canDo\(planEffectif\(commercant\), 'fidelite'\) \|\| aHonorerBord\.has\('fidelite'\)\) && \{/.test(page)
    && /\(\(canDo\(planEffectif\(commercant\), 'bons_cadeaux'\) && commercant\.bons_cadeaux_actif\) \|\| aHonorerBord\.has\('bons_cadeaux'\)\) && \{/.test(page))
  // L'ENCODAGE.
  verifier('« Encoder une commande » suit la formule',
    /commercant\?\.categorie === 'alimentaire' && canDo\(planEffectif\(commercant\), 'commande'\) && \(creneauxRetrait\.length > 0/.test(page))
  verifier('l\'agenda ne pose plus de rendez-vous hors formule',
    /onNouveauRdv=\{peutReserver\(commercant\) \? \(date, heure, prestationId = null\) => setNouveauRdvSlot/.test(page))
  const agenda = code('app/dashboard/AgendaRdv.js')
  verifier('et une case libre sans geste n\'est pas cliquable',
    /const peutCreer = !!onNouveauRdv && state === 'libre'/.test(agenda))
}

// ═══ 4. LE SERVEUR ═══════════════════════════════════════════════════════════
{
  const exp = code('app/api/dashboard/export-comptable/route.js')
  const iLignes = exp.indexOf('const lignes = construireLignes(')
  const iGarde = exp.indexOf('if (!exportComptableAutorise({ forfaitLePermet, nbLignes: lignes.length }))')
  verifier('l\'export décide APRÈS le calcul des lignes', iLignes > 0 && iGarde > iLignes)
  verifier('et plus aucun refus avant', !/if \(!canDo\(planEffectif\(commercant\), 'export_comptable'\)\)/.test(exp))

  const recap = code('app/api/cron/recap-jour-8h/route.js')
  verifier('le récap reste ouvert aux commerces à commandes hors formule',
    /if \(!estVitrine && !commerceACommandes\) \{\s*continue/.test(recap) && !/if \(!estVitrine && !estAlim\)/.test(recap))
  verifier('et ne part que s\'il y a quelque chose à honorer',
    /if \(!recapDuJourAEnvoyer\(\{ forfaitOuvert: estAlim, nbCommandes: cmdsFlat\.length, nbTables: \(tablesFlat \|\| \[\]\)\.length \}\)\) \{\s*continue/.test(recap))
  verifier('les tables déjà prises restent au récap, jamais une section vide',
    /const tablesAHonorer = !estVitrine && !aUneSalle && c\.rdv_actif === true/.test(recap)
    && /tablesFlat = prises\.length > 0 \? prises : null/.test(recap))

  const cmd = code('app/api/equipe/commande/creer/route.js')
  verifier('encoder une commande demande la formule',
    /const forfait = verdictForfait\(commercant, 'commande'\)\s*if \(!forfait\.ok\) return non\(/.test(cmd)
    && /plan, essai_plan, created_at/.test(cmd))
  const rdv = code('app/api/equipe/rdv/creer/route.js')
  verifier('poser un rendez-vous demande la formule du métier',
    /const forfait = verdictForfait\(commerce\.data, fonctionReservation\(commerce\.data\)\)\s*if \(!forfait\.ok\) return/.test(rdv)
    && /select\('id, horaires_detail, rdv_acompte_global, categorie, plan, essai_plan, created_at'\)/.test(rdv))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) { echecs.forEach(e => console.log('  ✕ ' + e)); process.exit(1) }
console.log('Honorer : vert.')
