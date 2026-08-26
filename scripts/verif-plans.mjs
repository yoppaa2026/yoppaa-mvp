// Vérifie que TOUTE clé passée à canDo() existe vraiment dans la matrice des
// formules, et que la matrice est cohérente d'un palier à l'autre.
//
// POURQUOI CE FICHIER. `canDo(plan, 'feature')` renvoie `false` quand la clé
// n'existe pas, exactement comme quand la formule ne l'ouvre pas. Une faute de
// frappe ne casse donc RIEN de visible : elle ferme silencieusement une
// fonctionnalité, ou en ouvre une par un chemin détourné. On a déjà été mordus
// par `canDo(plan, 'prix')` au lieu de `prix_affiches`, qui affichait à tort
// une bannière « demande les prix » chez des commerçants qui les affichent.
//
// Aucun test unitaire classique n'attrape ça : il faut confronter le CODE à la
// matrice. C'est ce que fait ce fichier, en lisant les sources.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import {
  PLAN_FEATURES, canDo, canDoAvecCategorie, resolvePlan, getPillsStatut,
  planEffectif, peut, statutFonction, planPourGarder, essaiProposable,
  FONCTION_INCLUSE, FONCTION_ESSAI_POSSIBLE, FONCTION_EN_ESSAI, FONCTION_FERMEE,
} from '../lib/plans.js'

const racine = process.cwd()
const DOSSIERS = ['app', 'lib']

function fichiersJs(dossier, acc = []) {
  for (const entree of readdirSync(dossier)) {
    if (entree === 'node_modules' || entree === '.next') continue
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) fichiersJs(chemin, acc)
    // plans.js est le site de DÉFINITION : ses propres appels à canDo portent
    // une variable, pas une clé, et n'ont rien à vérifier.
    else if (extname(chemin) === '.js' && !chemin.endsWith('plans.js')) acc.push(chemin)
  }
  return acc
}

// Découpe les arguments d'un appel en respectant les parenthèses et les
// chaînes : une découpe naïve sur la virgule casserait sur canDo(f(a,b), 'x').
function argumentsDe(source, debut) {
  let profondeur = 0, courant = '', args = [], guillemet = null
  for (let i = debut; i < source.length; i++) {
    const c = source[i]
    if (guillemet) {
      courant += c
      if (c === guillemet && source[i - 1] !== '\\') guillemet = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') { guillemet = c; courant += c; continue }
    if (c === '(' || c === '[' || c === '{') profondeur++
    if (c === ')' && profondeur === 0) { args.push(courant.trim()); return args }
    if (c === ')' || c === ']' || c === '}') profondeur--
    if (c === ',' && profondeur === 0) { args.push(courant.trim()); courant = ''; continue }
    courant += c
  }
  return args
}

// ⚠️ LE SCANNER LISAIT LES COMMENTAIRES, DANS LES DEUX SENS.
// Trouvé le 26/08 : un commentaire qui CITE un appel fautif en exemple, pour
// mettre en garde contre lui, était compté comme un vrai appel et faisait
// rougir le banc. C'était le symptôme visible. L'invisible est bien pire : un
// `canDo(plan, 'commande')` MIS EN COMMENTAIRE comptait comme un usage réel,
// donc une clé pouvait passer pour utilisée alors que plus rien ne l'appelait.
// C'est la famille des tests faussement verts, dans sa forme « le commentaire
// valide la garde ».
//
// ⚠️ LES LIGNES SONT VIDÉES, JAMAIS RETIRÉES : ce scanner rend des numéros de
// ligne, et les décaler rendrait chacun de ses messages faux.
function sansCommentaires(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (bloc) => '\n'.repeat((bloc.match(/\n/g) || []).length))
    .split('\n').map(l => (/^\s*\/\//.test(l) ? '' : l)).join('\n')
}

const clesTrouvees = new Map()   // cle -> [fichier:ligne]
const clesDynamiques = []

for (const dossier of DOSSIERS) {
  for (const fichier of fichiersJs(join(racine, dossier))) {
    const source = sansCommentaires(readFileSync(fichier, 'utf8'))
    const regex = /\bcanDo(?:AvecCategorie)?\s*\(/g
    let m
    while ((m = regex.exec(source)) !== null) {
      // On ignore la DÉFINITION de la fonction elle-même.
      const avant = source.slice(Math.max(0, m.index - 20), m.index)
      if (/function\s+$/.test(avant) || /export function\s+$/.test(avant)) continue
      const args = argumentsDe(source, m.index + m[0].length)
      const second = args[1]
      if (!second) continue
      const ligne = source.slice(0, m.index).split('\n').length
      const ref = `${fichier.replace(racine + '\\', '').replace(racine + '/', '')}:${ligne}`
      const litteral = /^'([^']+)'$|^"([^"]+)"$/.exec(second)
      if (litteral) {
        const cle = litteral[1] || litteral[2]
        if (!clesTrouvees.has(cle)) clesTrouvees.set(cle, [])
        clesTrouvees.get(cle).push(ref)
      } else {
        clesDynamiques.push(`${ref} → ${second}`)
      }
    }
  }
}

let ko = 0
const cheminsMatrice = Object.keys(PLAN_FEATURES)
const toutesLesCles = new Set(cheminsMatrice.flatMap(p => Object.keys(PLAN_FEATURES[p])))

console.log(`${clesTrouvees.size} clés distinctes utilisées dans le code, ${toutesLesCles.size} déclarées dans la matrice.\n`)

// ─── 1. Toute clé utilisée doit exister ───────────────────────────────────
for (const [cle, refs] of [...clesTrouvees].sort()) {
  if (!toutesLesCles.has(cle)) {
    ko++
    console.log(`  ✕ clé INCONNUE « ${cle} » → ${refs.join(', ')}`)
  }
}

// ─── 2. Toute clé doit être déclarée dans TOUS les paliers ────────────────
// Une clé absente d'un palier y vaut `undefined`, donc false : la formule
// ferme la fonctionnalité sans que personne ne l'ait décidé.
for (const cle of toutesLesCles) {
  const manquants = cheminsMatrice.filter(p => !(cle in PLAN_FEATURES[p]))
  if (manquants.length > 0) {
    ko++
    console.log(`  ✕ « ${cle} » n'est pas déclarée dans : ${manquants.join(', ')}`)
  }
}

// ─── 3. Cohérence des paliers : Vendre ⊇ Communiquer ⊇ Exister ────────────
// Un palier supérieur ne doit jamais RETIRER ce qu'un palier inférieur ouvre.
const ORDRE = ['exister', 'communiquer', 'vendre']
for (let i = 1; i < ORDRE.length; i++) {
  const bas = PLAN_FEATURES[ORDRE[i - 1]], haut = PLAN_FEATURES[ORDRE[i]]
  if (!bas || !haut) continue
  for (const cle of Object.keys(bas)) {
    if (bas[cle] === true && haut[cle] !== true) {
      ko++
      console.log(`  ✕ régression de palier : « ${cle} » est ouverte en ${ORDRE[i - 1]} mais fermée en ${ORDRE[i]}`)
    }
  }
}

// ─── 4. Garde-fous de comportement ────────────────────────────────────────
function verifier(nom, condition) {
  if (condition) return
  ko++
  console.log(`  ✕ ${nom}`)
}
verifier('une clé inexistante renvoie false', canDo('vendre', 'cette_cle_nexiste_pas') === false)
verifier('un plan inconnu renvoie false', canDo('plan_bidon', 'commande') === false)
verifier('un plan null renvoie false', canDo(null, 'commande') === false)
verifier('les alias legacy sont résolus', resolvePlan('full') != null && resolvePlan('on') != null)
verifier('la commande reste alimentaire', canDoAvecCategorie('vendre', 'commande', 'vitrine') === false)
verifier('le RDV reste vitrine', canDoAvecCategorie('vendre', 'rdv', 'alimentaire') === false)
verifier('le RDV passe chez une vitrine', canDoAvecCategorie('vendre', 'rdv', 'vitrine') === true)

// ⚠️ LE SCANNER LUI-MÊME, MIS À L'ÉPREUVE. Il vient d'être corrigé pour ne
// plus lire les commentaires ; un correctif de banc qui ne se vérifie pas ne
// vaut pas mieux que le défaut qu'il prétend fermer.
{
  const echantillon = [
    "// canDo(plan, 'cle_commentee')",
    "  /* canDo(plan, 'cle_en_bloc') */",
    "const vrai = canDo(plan, 'commande')",
    "const url = 'https://exemple.be/a//b'",
  ].join('\n')
  const nettoye = sansCommentaires(echantillon)
  verifier('un appel mis en commentaire ne compte pas comme un usage',
    !/cle_commentee/.test(nettoye) && !/cle_en_bloc/.test(nettoye))
  verifier('mais le vrai appel survit', /canDo\(plan, 'commande'\)/.test(nettoye))
  verifier('et une adresse web n\'est pas prise pour un commentaire',
    /exemple\.be/.test(nettoye))
  verifier('les numéros de ligne ne bougent pas',
    nettoye.split('\n').length === echantillon.split('\n').length)
}

// ═══════════════════════════════════════════════════════════════════════════
// LA DÉGUSTATION — TOUT LE MONDE A TOUT JUSQU'AU 9 JANVIER
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CES VÉRIFICATIONS EXÉCUTENT LES FONCTIONS, elles ne cherchent aucun mot.
// Et elles se placent des deux côtés du 9 janvier : le code qui s'allumera ce
// matin-là est aujourd'hui invisible en production, il ne se relit pas, il se
// fait tourner.
{
  const PENDANT = new Date('2026-11-15T10:00:00Z')   // dégustation en cours
  const APRES   = new Date('2027-02-01T10:00:00Z')   // dégustation terminée
  const INSCRIT = '2026-08-20T09:00:00Z'

  const boulanger = { plan: 'exister', categorie: 'alimentaire', created_at: INSCRIT }
  const salon     = { plan: 'exister', categorie: 'vitrine',     created_at: INSCRIT }
  const payant    = { plan: 'vendre',  categorie: 'alimentaire', created_at: INSCRIT }
  // Le même boulanger, qui a DEMANDÉ à essayer Vendre.
  const essayeur  = { ...boulanger, essai_plan: 'vendre' }

  // ⚠️ LE CŒUR DE LA CORRECTION D'ALEX : L'ESSAI NE S'IMPOSE PAS.
  // Celui qui a choisi Exister a les fonctions d'Exister, point. Lui ouvrir
  // d'office le Click & Collect, ce serait lui répondre qu'il s'est trompé.
  verifier('un Exister qui n\'a rien demandé garde EXACTEMENT Exister',
    planEffectif(boulanger, PENDANT) === 'exister'
    && peut(boulanger, 'commande', PENDANT) === false
    && peut(boulanger, 'deals', PENDANT) === false)
  verifier('mais l\'essai lui est proposable',
    essaiProposable(boulanger, PENDANT) === true
    && statutFonction(boulanger, 'commande', PENDANT) === FONCTION_ESSAI_POSSIBLE)

  verifier('dès qu\'il demande l\'essai, il a le forfait en vigueur',
    planEffectif(essayeur, PENDANT) === 'vendre'
    && peut(essayeur, 'commande', PENDANT) === true)
  verifier('et l\'écran doit le dire : la fonction est EN ESSAI, pas incluse',
    statutFonction(essayeur, 'commande', PENDANT) === FONCTION_EN_ESSAI)
  verifier('après le 9 janvier, l\'essai ne donne plus rien',
    planEffectif(essayeur, APRES) === 'exister'
    && peut(essayeur, 'commande', APRES) === false
    && statutFonction(essayeur, 'commande', APRES) === FONCTION_FERMEE)
  verifier('et on ne propose plus un essai qui n\'est plus possible',
    essaiProposable(boulanger, APRES) === false
    && statutFonction(boulanger, 'commande', APRES) === FONCTION_FERMEE)

  // ⚠️ UN ESSAI NE RÉTROGRADE JAMAIS PERSONNE.
  const vendreQuiEssaieMoins = { ...payant, essai_plan: 'communiquer' }
  verifier('un essai plus bas que le forfait payé ne retire rien',
    planEffectif(vendreQuiEssaieMoins, PENDANT) === 'vendre'
    && peut(vendreQuiEssaieMoins, 'commande', PENDANT) === true)
  verifier('et on ne propose pas d\'essai à qui a déjà tout',
    essaiProposable(payant, PENDANT) === false)
  verifier('un essai_plan inconnu ne débloque rien',
    planEffectif({ ...boulanger, essai_plan: 'premium_illimite' }, PENDANT) === 'exister')

  // ⚠️ LA CATÉGORIE TRANCHE AVANT LE FORFAIT. Un boulanger n'aura jamais de
  // prise de rendez-vous, même en payant Vendre : lui montrer cette fonction,
  // fût-elle grisée, serait lui promettre ce qui n'arrivera pas.
  verifier('même en essayant Vendre, un boulanger n\'a pas le RDV',
    peut({ ...essayeur }, 'rdv', PENDANT) === false)
  verifier('et cette fonction est SANS OBJET pour lui, jamais fermée ni à l\'essai',
    statutFonction(boulanger, 'rdv', PENDANT) === null
    && statutFonction(essayeur, 'rdv', PENDANT) === null
    && statutFonction(boulanger, 'rdv', APRES) === null)
  verifier('alors qu\'un salon se la voit proposer, puis fermer',
    statutFonction(salon, 'rdv', PENDANT) === FONCTION_ESSAI_POSSIBLE
    && statutFonction(salon, 'rdv', APRES) === FONCTION_FERMEE)

  verifier('ce qui est compris dans le forfait payé reste « inclus »',
    statutFonction(payant, 'commande', PENDANT) === FONCTION_INCLUSE
    && statutFonction(payant, 'commande', APRES) === FONCTION_INCLUSE)
  verifier('ce qu\'Exister a déjà n\'est jamais annoncé comme un essai',
    statutFonction(boulanger, 'vitrine', PENDANT) === FONCTION_INCLUSE
    && statutFonction(essayeur, 'vitrine', PENDANT) === FONCTION_INCLUSE)

  // Le forfait à prendre pour GARDER, celui qu'annonce la modale.
  verifier('pour garder la commande, il faut Vendre',
    planPourGarder(boulanger, 'commande', PENDANT) === 'vendre'
    && planPourGarder(essayeur, 'commande', PENDANT) === 'vendre')
  verifier('pour garder les deals, Communiquer suffit',
    planPourGarder(boulanger, 'deals', PENDANT) === 'communiquer')
  verifier('et on ne propose aucun forfait pour ce qui est déjà inclus',
    planPourGarder(payant, 'commande', PENDANT) === null)
  verifier('ni pour ce qui est sans objet dans le métier',
    planPourGarder(boulanger, 'rdv', PENDANT) === null)

  // ⚠️ ABSENCE DE DATE D'INSCRIPTION = PAS DE DÉGUSTATION.
  // C'est la colonne oubliée dans un `select`, le défaut le plus fréquent du
  // projet. Des deux erreurs possibles on garde celle qui se voit.
  const sansDate = { plan: 'exister', categorie: 'alimentaire', essai_plan: 'vendre' }
  verifier('sans date d\'inscription, l\'essai ne s\'ouvre pas',
    planEffectif(sansDate, PENDANT) === 'exister'
    && essaiProposable(sansDate, PENDANT) === false)
  verifier('une date d\'inscription illisible non plus',
    planEffectif({ ...sansDate, created_at: 'pas une date' }, PENDANT) === 'exister')
  verifier('et un commerçant absent ne débloque rien',
    planEffectif(null, PENDANT) === 'exister' && peut(null, 'commande', PENDANT) === false)
}

// ═══════════════════════════════════════════════════════════════════════════
// NE PAS VENDRE CE QUI N'EXISTE PAS
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA PAGE D'INSCRIPTION PROMETTAIT UNE FONCTIONNALITÉ QUI N'A JAMAIS ÉTÉ
// ÉCRITE. Le palier Vendre affichait à un commerce de détail « Réservation
// produit + retrait en magasin », avec une fiche détaillée : « le Yopper
// réserve un article, tu le mets de côté, tu reçois la notification, tu
// confirmes la disponibilité ». AUCUNE ligne de code ne consultait cette
// capacité. La fiche client, elle, était honnête et n'affichait rien : le
// commentaire de `lib/plans.js` disait même « ne rien promettre ».
//
// Un commerçant souscrivait donc au palier payant sur du vide, et attendait une
// notification qui n'arriverait jamais.
//
// Décision Alex du 10/08 : la réservation, c'est pour les TABLES de restaurant.
// Le détail vend en ligne, avec retrait au magasin ou expédition.
//
// Même esprit que le test de la page /legal : ce qui est ANNONCÉ doit
// correspondre à ce que le CODE fait.
{
  const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
  const sansCommentaires = (src) => src.split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')

  for (const chemin of ['lib/plans.js', 'app/signup/page.js']) {
    verifier(`${chemin} ne parle plus de réservation d'article`,
      !/reservation_produit/.test(sansCommentaires(lire(chemin))), chemin)
  }
  const signup = lire('app/signup/page.js')
  verifier('la page d\'inscription ne promet plus de « Réservation produit »',
    !/Réservation produit/.test(signup))
  // Et elle décrit ce qui existe VRAIMENT pour le détail.
  verifier('elle annonce le retrait en magasin et l\'expédition',
    /retrait en magasin ou expédition/i.test(signup))
}

// ═══════════════════════════════════════════════════════════════════════════
// LES PASTILLES DE CAPACITÉS — ce qu'un commerçant PAIE doit se voir
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ AUCUN BANC NE LES COUVRAIT, et elles se coupaient en silence depuis le
// 10/08 (Alex, 19/08). Sur la carte du listing, la rangée était en `nowrap`
// avec `overflow: hidden` : `Fidélité` et `Bons cadeaux`, empilées EN DERNIER
// par `getPillsStatut`, tombaient hors de la carte sans le moindre signe.
{
  const COMMERCE_COMPLET = {
    plan: 'vendre', categorie: 'alimentaire',
    fidelite_actif: true, bons_cadeaux_actif: true, livraison_actif: true,
  }
  const cles = getPillsStatut(COMMERCE_COMPLET, { dealActif: true, actuActive: true }).map(p => p.key)
  verifier('un commerce qui a tout activé annonce sa fidélité', cles.includes('fidelite'))
  verifier('et ses bons cadeaux', cles.includes('bons'))
  // ⚠️ ELLES SONT LES DERNIÈRES DE LA LISTE, et c'est ce qui les rendait
  // vulnérables. Si un jour l'ordre change, cette garde le dira.
  verifier('et ce sont bien les deux dernières, donc les plus exposées',
    cles.slice(-2).join(',') === 'fidelite,bons')
  // Une capacité éteinte ne s'annonce pas : une pastille barrée vaut moins
  // qu'une carte sobre (refonte du 03/08).
  const eteintes = getPillsStatut({ ...COMMERCE_COMPLET, fidelite_actif: false, bons_cadeaux_actif: false }).map(p => p.key)
  verifier('une fidélité coupée ne s’annonce pas', !eteintes.includes('fidelite'))
  verifier('des bons cadeaux coupés non plus', !eteintes.includes('bons'))

  // ⚠️ ON INTERDIT LE PIÈGE plutôt que d'exiger une écriture correcte
  // particulière : c'est la leçon des gardes qui verrouillaient le défaut.
  const srcPills = readFileSync(new URL('../app/commander/PillsStatut.js', import.meta.url), 'utf8')
  verifier('la rangée de pastilles ne coupe plus ce qui dépasse',
    !/overflow:\s*xs\s*\?\s*'hidden'/.test(srcPills) && !/flexWrap:\s*xs\s*\?\s*'nowrap'/.test(srcPills))
  // Le point qui pulse est posé en NÉGATIF hors de la pastille : un parent qui
  // masque le débordement l'ampute, et le signal « ça se passe maintenant »
  // est justement celui qu'on veut voir sur la carte.
  verifier('et le point qui pulse n’est plus rogné',
    /overflow:\s*'visible'/.test(srcPills))
}

if (clesDynamiques.length > 0) {
  console.log(`\n⚠️  ${clesDynamiques.length} appel(s) à clé calculée, non vérifiables ici :`)
  clesDynamiques.forEach(d => console.log('     ' + d))
}

console.log(ko === 0 ? '\nMatrice des formules cohérente.' : `\n${ko} problème(s).`)
if (ko > 0) process.exit(1)
