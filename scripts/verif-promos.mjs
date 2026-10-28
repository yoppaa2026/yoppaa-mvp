// Banc du MODULE PROMO (28/10).
//
// 🔴 CE QU'IL GARDE : qu'une promo SE VOIE. Alex, 28/10, sur le site d'essai :
// « les promos passent, mais elles ne sont visibles nulle part ». Le prix
// suivait le jour choisi, l'affichage suivait aujourd'hui.
//
// ⚠️ TOUT S'EXÉCUTE pour `lib/promos-visibles.js` (module pur). Les gardes de
// code vérifient seulement que les fiches APPELLENT ce module avec le jour
// choisi.
//
//   npm run verif:promos

import { readFileSync } from 'node:fs'
import {
  momentDuDeal, promosAVenir, promoAVenirPourArticle, promoAVenirPourPrestation,
  economieDesLignesCents, accrocheDuDeal, fenetreDuDeal, ajouterJoursISO, nomDuJour,
} from '../lib/promos-visibles.js'
import { sansProse } from './lire-code.mjs'

const lireCode = (chemin) => sansProse(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// Le lundi 2 novembre 2026.
const LUNDI = '2026-11-02'
const jour = (n) => ajouterJoursISO(LUNDI, n)
const ponctuel = (n, extra = {}) => ({ id: `p${n}`, titre: `Promo ${n}`, deal_type: 'remise_pct', remise_pct: 20, actif: true, date_deal: jour(n), ...extra })
const periode = (a, b, extra = {}) => ({ id: `r${a}-${b}`, titre: 'Période', deal_type: 'remise_pct', remise_pct: 10, actif: true, date_debut: `${jour(a)}T00:00:00`, date_fin: `${jour(b)}T23:59:59`, ...extra })

// ─── 1. LE MOMENT, DIT COMME AU COMPTOIR ─────────────────────────────────
egal('ajouter des jours traverse le mois', ajouterJoursISO('2026-10-30', 3), '2026-11-02')
egal('le nom du jour', nomDuJour(LUNDI), 'lundi')
egal('aujourd’hui', momentDuDeal(ponctuel(0), LUNDI), "Aujourd'hui")
egal('demain', momentDuDeal(ponctuel(1), LUNDI), 'Demain')
egal('dans la semaine : le jour', momentDuDeal(ponctuel(2), LUNDI), 'Mercredi')
egal('au-delà d’une semaine : la date', momentDuDeal(ponctuel(10), LUNDI), 'Le 12 nov.')
egal('en cours jusqu’à un jour de la semaine', momentDuDeal(periode(-2, 4), LUNDI), "Jusqu'à vendredi")
egal('en cours jusqu’à une date', momentDuDeal(periode(-2, 12), LUNDI), "Jusqu'au 14 nov.")
egal('une période qui commence demain', momentDuDeal(periode(1, 4), LUNDI), "Dès demain, jusqu'à vendredi")
egal('une période plus tard, dans le même mois', momentDuDeal(periode(3, 6), LUNDI), 'Du 5 au 8 nov.')
egal('une période à cheval sur deux mois', momentDuDeal({ actif: true, date_debut: '2026-11-28', date_fin: '2026-12-02' }, LUNDI), 'Du 28 nov. au 2 déc.')
egal('🔴 une promo passée n’a pas de moment', momentDuDeal(ponctuel(-1), LUNDI), null)
egal('la fenêtre lit les deux formats', [fenetreDuDeal(ponctuel(1)), fenetreDuDeal(periode(1, 2))],
  [{ debut: jour(1), fin: jour(1) }, { debut: jour(1), fin: jour(2) }])

// ─── 2. LA SECTION « PROMOS » ────────────────────────────────────────────
{
  const deals = [ponctuel(3), ponctuel(0), periode(-1, 2), ponctuel(20), ponctuel(-3),
    ponctuel(1, { actif: false }), ponctuel(1, { id: 'inv', heure_debut: '17:00', heure_fin: '19:00' })]
  const liste = promosAVenir(deals, LUNDI)
  egal('🔴 en cours et à venir sur 14 jours, triées, sans les passées, éteintes ni invendus',
    liste.map(p => p.deal.id), ['r-1-2', 'p0', 'p3'])
  egal('chacune dit si elle est en cours et son premier jour utile',
    liste.map(p => [p.enCours, p.premierJour]), [[true, LUNDI], [true, LUNDI], [false, jour(3)]])
  egal('l’appelant peut écarter ce que sa fiche ne vend pas',
    promosAVenir(deals, LUNDI, { garder: d => d.id !== 'p0' }).map(p => p.deal.id), ['r-1-2', 'p3'])
  egal('sans jour, rien', promosAVenir(deals, null), [])
}

// ─── 3. LA PASTILLE SUR L'ARTICLE ET LA PRESTATION ───────────────────────
{
  const PAIN = { id: 'pain', categorie: 'Pains', prix: 4 }
  const mercredi = ponctuel(2, { article_id: 'pain' })
  egal('🔴 un lundi, la promo du mercredi se dit sur l’article',
    promoAVenirPourArticle(PAIN, [mercredi], LUNDI, LUNDI)?.moment, 'Mercredi')
  egal('🔴 le mercredi choisi, plus de pastille : le prix barré le dit',
    promoAVenirPourArticle(PAIN, [mercredi], jour(2), LUNDI), null)
  egal('🔴 le mercredi choisi, plus de pastille : même si une autre promo vient vendredi',
    promoAVenirPourArticle(PAIN, [mercredi, ponctuel(4, { article_id: 'pain' })], jour(2), LUNDI), null)
  egal('une promo d’un autre article ne s’affiche pas',
    promoAVenirPourArticle({ id: 'autre', prix: 2 }, [mercredi], LUNDI, LUNDI), null)
  egal('la catégorie compte aussi',
    promoAVenirPourArticle(PAIN, [ponctuel(1, { categorie_cible: 'Pains' })], LUNDI, LUNDI)?.moment, 'Demain')
  const SOIN = { id: 'soin', prix: 50 }
  egal('🔴 la prestation aussi : « Demain »',
    promoAVenirPourPrestation(SOIN, [ponctuel(1, { prestation_id: 'soin' })], LUNDI, LUNDI)?.moment, 'Demain')
  egal('et pas le jour même du rendez-vous',
    promoAVenirPourPrestation(SOIN, [ponctuel(1, { prestation_id: 'soin' })], jour(1), LUNDI), null)
  egal('l’accroche : pourcentage, prix promo, offre',
    [accrocheDuDeal({ deal_type: 'remise_pct', remise_pct: 20 }), accrocheDuDeal({ deal_type: 'prix_fixe' }), accrocheDuDeal({ deal_type: 'lot', titre: 'Lot de 3' })],
    ['-20 %', 'Prix promo', 'Offre'])
}

// ─── 4. CE QUE LE CLIENT ÉCONOMISE ───────────────────────────────────────
egal('🔴 l’économie en centimes, quantité comprise',
  economieDesLignesCents([{ prix_plein: 12.9, prix_unitaire: 10.32, quantite: 2 }, { prix_plein: null, prix_unitaire: 3, quantite: 1 }]), 516)
egal('jamais négative, jamais sur une ligne sans prix plein',
  economieDesLignesCents([{ prix_plein: 2, prix_unitaire: 3, quantite: 1 }, { prix_unitaire: 3, quantite: 1 }]), 0)
egal('rien, rien', economieDesLignesCents(null), 0)

// ─── 5. LES FICHES APPELLENT LE MODULE, AU JOUR CHOISI ───────────────────
{
  const F = lireCode('app/commander/[slug]/page.js')
  verifier('🔴 la fiche boutique juge ses deals au jour choisi',
    /const jourDesPromos = dateDeLaCommande\(\)/.test(F)
    && /const dealsDuJourChoisi = \(dealsTous \|\| \[\]\)\.filter\(d => dealActifCeJour\(d, jourDesPromos\)\)/.test(F))
  verifier('🔴 plus aucune remise affichée sur la liste d’aujourd’hui',
    !/remiseSurArticle\([^()]*, dealsActifs\)/.test(F) && !/offresSepareesPourArticle\(a, dealsActifs\)/.test(F))
  verifier('🔴 et toujours AVEC le jour (sinon `lib/deals.js` refiltre sur aujourd’hui)',
    (F.match(/remiseSurArticle\(\w+, dealsDuJourChoisi, jourDesPromos\)/g) || []).length >= 6)
  verifier('le bandeau suit le jour choisi', /dealVedette && \(\(\) => \{ const dealActif = dealVedette;/.test(F))
  verifier('la section « Promos » s’affiche', /\{promosDeLaFiche\.length > 0 && \(/.test(F) && />Promos<\/p>/.test(F))
  verifier('🔴 la pastille « -20 % mercredi » est passée aux articles',
    (F.match(/promoAVenir=\{promoAVenirPourArticle\(a, dealsTous, jourDesPromos, aujourdhuiPromos\)\}/g) || []).length >= 3)
  verifier('🔴 une offre ne s’achète qu’au jour choisi', /if \(!dealActifCeJour\(deal, jourDesPromos\)\) return false/.test(F))
  verifier('🔴 le récapitulatif dit l’économie', /Tu économises \{euros\(economiePanier\(\)\)\}/.test(F))
  const R = lireCode('app/commander/rdv/[slug]/page.js')
  verifier('🔴 la fiche RDV annonce les promos à venir',
    /const promosAVenirFiche = promosAVenir\(dealsActifs, aujourdhuiPromos\)\.filter\(p => !p\.enCours\)/.test(R)
    && /\{etape === 1 && promosAVenirFiche\.length > 0 && \(/.test(R))
  verifier('🔴 la pastille sur la prestation', /promoAVenirPourPrestation\(p, dealsActifs, jourPrix, aujourdhuiPromos\)/.test(R))
  verifier('🔴 le récapitulatif RDV dit l’économie', /Tu économises \{euros\(Number\(r\.prixBarre\) - Number\(r\.prix\)\)\}/.test(R))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Les promos se voient : vert.')
