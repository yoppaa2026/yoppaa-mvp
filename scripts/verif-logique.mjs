// Banc de vérification de la logique métier pure.
//
// POURQUOI CE FICHIER. Le 05/08, plusieurs corrections ont été annoncées comme
// faites alors qu'une partie ne s'exécutait jamais (branche morte sur un
// mode_retrait qui n'existe pas en base). Le build et le lint ne voient rien de
// tout cela : ils vérifient que le code compile, pas qu'il fait ce qu'on croit.
//
// Ce banc teste ce qui peut l'être sans navigateur ni base : les prix, les
// remises, la TVA, le stock, les libellés et le fichier calendrier. C'est là
// que vivent les erreurs qui coûtent de l'argent ou de la confiance.
//
//   node scripts/verif-logique.mjs

import {
  estOffreSeparee, estRemiseSurProduit, dealActifCeJour, dealViseArticle,
  remiseSurArticle, prixEffectif, prixEffectifVariante, offresSepareesPourArticle,
} from '../lib/deals.js'
import { construireLignesCommande, verifierStockDisponible } from '../lib/lignes-commande.js'
import { libelleRetrait, estRetraitBoutique } from '../lib/libelle-retrait.js'
import { generateRdvIcs, icsToBase64Attachment } from '../lib/ical.js'
import { tauxFraisLivraison } from '../lib/tva.js'
import { ventilerFrais } from '../lib/stripe-frais.js'

let ok = 0, ko = 0
const echecs = []

function verifier(nom, condition, detail = '') {
  if (condition) { ok++; return }
  ko++
  echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

function egal(nom, obtenu, attendu) {
  const a = JSON.stringify(obtenu), b = JSON.stringify(attendu)
  verifier(nom, a === b, `obtenu ${a}, attendu ${b}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DEALS — la règle unique des promotions
// ═══════════════════════════════════════════════════════════════════════════
const JOUR = '2026-08-05'
const shampoing = { id: 'a1', nom: 'Shampoing', prix: 21.9, categorie: 'Shampoing' }
const soin = { id: 'a2', nom: 'Soin', prix: 30, categorie: 'Soin' }

const remise10 = { id: 'd1', deal_type: 'remise_pct', remise_pct: 10, article_id: 'a1', date_deal: JOUR, actif: true }
const remise20cat = { id: 'd2', deal_type: 'remise_pct', remise_pct: 20, categorie_cible: 'Shampoing', date_deal: JOUR, actif: true }
const lot = { id: 'd3', deal_type: 'lot', prix_deal: 50, unites_par_deal: 3, article_id: 'a1', date_deal: JOUR, actif: true }
const prixFixe = { id: 'd4', deal_type: 'prix_fixe', prix_deal: 15, article_id: 'a1', date_deal: JOUR, actif: true }
const remiseHier = { ...remise10, id: 'd5', date_deal: '2026-08-04' }

verifier('lot = offre séparée', estOffreSeparee(lot))
verifier('remise ≠ offre séparée', !estOffreSeparee(remise10))
verifier('prix fixe = remise sur produit', estRemiseSurProduit(prixFixe))
verifier('deal actif aujourd’hui', dealActifCeJour(remise10, JOUR))
verifier('deal d’hier inactif', !dealActifCeJour(remiseHier, JOUR))
verifier('deal inactif ignoré', !dealActifCeJour({ ...remise10, actif: false }, JOUR))
verifier('intervalle couvrant', dealActifCeJour({ deal_type: 'remise_pct', date_debut: '2026-08-01', date_fin: '2026-08-31', actif: true }, JOUR))
verifier('deal vise par catégorie', dealViseArticle(remise20cat, shampoing))
verifier('deal catégorie ne vise pas les autres', !dealViseArticle(remise20cat, soin))

egal('remise 10% sur 21,90', remiseSurArticle(shampoing, [remise10], JOUR)?.prix, 19.71)
// LA PLUS AVANTAGEUSE gagne quand deux remises se chevauchent.
egal('meilleure remise retenue (20% cat > 10% article)', remiseSurArticle(shampoing, [remise10, remise20cat], JOUR)?.prix, 17.52)
egal('prix fixe retenu s’il est le plus bas', remiseSurArticle(shampoing, [remise10, prixFixe], JOUR)?.prix, 15)
verifier('aucune remise sur un article non visé', remiseSurArticle(soin, [remise10, remise20cat], JOUR) === null)
verifier('remise expirée ignorée', remiseSurArticle(shampoing, [remiseHier], JOUR) === null)
// Une « remise » qui augmente le prix n'en est pas une.
verifier('remise plus chère refusée', remiseSurArticle(shampoing, [{ deal_type: 'prix_fixe', prix_deal: 99, article_id: 'a1', date_deal: JOUR, actif: true }], JOUR) === null)
egal('prixEffectif sans deal', prixEffectif(soin, [], JOUR), 30)
egal('prixEffectif avec remise', prixEffectif(shampoing, [remise10], JOUR), 19.71)

// Un LOT ne doit JAMAIS modifier le prix unitaire.
egal('lot ne remise pas l’unité', prixEffectif(shampoing, [lot], JOUR), 21.9)
egal('lot reste une carte séparée', offresSepareesPourArticle(shampoing, [lot], JOUR).length, 1)
egal('remise ne crée pas de carte', offresSepareesPourArticle(shampoing, [remise10], JOUR).length, 0)

// Variantes : le pourcentage suit, le prix fixe non.
egal('variante sous remise %', prixEffectifVariante(40, shampoing, [remise10], JOUR), 36)
egal('variante ignorée par un prix fixe', prixEffectifVariante(40, shampoing, [prixFixe], JOUR), 40)

// ═══════════════════════════════════════════════════════════════════════════
// 2. LIGNES DE COMMANDE — le prix qui fait foi
// ═══════════════════════════════════════════════════════════════════════════
const commercant = { id: 'c1', tva_taux_defaut: 21 }
const articlesData = [
  { ...shampoing, actif: true, commercant_id: 'c1', tva_taux: 21, temps_prepa: 1 },
  { ...soin, actif: true, commercant_id: 'c1', tva_taux: 21, temps_prepa: 1 },
]

let r = construireLignesCommande({
  panier: [{ id: 'a1', quantite: 2 }],
  articlesData, optionsValeurs: [], variantesData: [], dealsData: [remise10],
  commercant, regime: 'emporter', dateCommande: JOUR,
})
verifier('calcul OK', r.ok)
egal('remise appliquée SANS deal_id envoyé', r.lignes[0].prix_unitaire, 19.71)
egal('total en centimes', r.totalCents, 3942)
egal('TVA figée', r.lignes[0].tva_taux, 21)

// Un deal_id de type REMISE ne doit pas devenir une offre : la remise
// s'appliquerait deux fois, ou le libellé remplacerait le nom de l'article.
r = construireLignesCommande({
  panier: [{ id: 'a1', quantite: 1, deal_id: 'd1' }],
  articlesData, optionsValeurs: [], variantesData: [], dealsData: [remise10],
  commercant, regime: 'emporter', dateCommande: JOUR,
})
egal('deal_id de remise ignoré comme offre', r.lignes[0].prix_unitaire, 19.71)
egal('nom de l’article conservé', r.lignes[0].article_nom, 'Shampoing')
egal('pas de sur-consommation de stock', r.lignes[0].quantite_stock, 1)

// Un LOT garde son prix, son libellé et consomme ses unités.
r = construireLignesCommande({
  panier: [{ id: 'a1', quantite: 1, deal_id: 'd3' }],
  articlesData, optionsValeurs: [], variantesData: [], dealsData: [{ ...lot, titre: 'Lot de 3' }],
  commercant, regime: 'emporter', dateCommande: JOUR,
})
egal('prix du lot', r.lignes[0].prix_unitaire, 50)
egal('libellé du lot', r.lignes[0].article_nom, 'Lot de 3')
egal('stock consommé par le lot', r.lignes[0].quantite_stock, 3)

// Un deal expiré doit être REFUSÉ, pas silencieusement appliqué.
r = construireLignesCommande({
  panier: [{ id: 'a1', quantite: 1, deal_id: 'd6' }],
  articlesData, optionsValeurs: [], variantesData: [],
  dealsData: [{ id: 'd6', deal_type: 'lot', titre: 'Lot périmé', prix_deal: 10, article_id: 'a1', date_deal: '2026-01-01', actif: true }],
  commercant, regime: 'emporter', dateCommande: JOUR,
})
verifier('lot expiré refusé', !r.ok && r.status === 400, JSON.stringify(r))

// Quantités aberrantes
verifier('quantité 0 refusée', !construireLignesCommande({ panier: [{ id: 'a1', quantite: 0 }], articlesData, optionsValeurs: [], variantesData: [], dealsData: [], commercant, regime: 'emporter', dateCommande: JOUR }).ok)
verifier('quantité 999 refusée', !construireLignesCommande({ panier: [{ id: 'a1', quantite: 999 }], articlesData, optionsValeurs: [], variantesData: [], dealsData: [], commercant, regime: 'emporter', dateCommande: JOUR }).ok)
verifier('article inconnu refusé', !construireLignesCommande({ panier: [{ id: 'zz', quantite: 1 }], articlesData, optionsValeurs: [], variantesData: [], dealsData: [], commercant, regime: 'emporter', dateCommande: JOUR }).ok)

// Options : le supplément s'ajoute APRÈS la remise, jamais avant.
r = construireLignesCommande({
  panier: [{ id: 'a1', quantite: 1, options: [{ valeur_ids: ['v1'] }] }],
  articlesData,
  optionsValeurs: [{ id: 'v1', nom: 'Grand', prix_supplement: 2, article_options_groupes: { article_id: 'a1', nom: 'Taille' } }],
  variantesData: [], dealsData: [remise10],
  commercant, regime: 'emporter', dateCommande: JOUR,
})
egal('supplément ajouté après remise', r.lignes[0].prix_unitaire, 21.71)

// ═══════════════════════════════════════════════════════════════════════════
// 3. STOCK — l'agrégation par article
// ═══════════════════════════════════════════════════════════════════════════
function supabaseFactice({ stocks = [], commandes = [], reservations = [] } = {}) {
  const table = (rows) => {
    const q = {
      select: () => q, in: () => q, eq: () => q, not: () => q, gt: () => q,
      then: (res) => res({ data: rows }),
    }
    return q
  }
  return { from: (nom) => table(nom === 'article_stock_jour' ? stocks : nom === 'commande_articles' ? commandes : reservations) }
}

const lignesStock = [
  { article_id: 'a1', article_nom: 'Shampoing', quantite: 1, quantite_stock: 3 },
  { article_id: 'a1', article_nom: 'Shampoing', quantite: 2, quantite_stock: 2 },
]
// 2026-08-05 est un MERCREDI.
let stock = await verifierStockDisponible({
  supabase: supabaseFactice({ stocks: [{ article_id: 'a1', jour_semaine: 'mercredi', stock: 10, actif: true }] }),
  lignes: lignesStock, commercantId: 'c1', dateCommande: JOUR,
})
verifier('stock suffisant', stock.ok)
egal('consommation agrégée des deux lignes', stock.consoParArticle?.a1, 5)
egal('jour de semaine correct', stock.jourSemaine, 'mercredi')

stock = await verifierStockDisponible({
  supabase: supabaseFactice({ stocks: [{ article_id: 'a1', jour_semaine: 'mercredi', stock: 4, actif: true }] }),
  lignes: lignesStock, commercantId: 'c1', dateCommande: JOUR,
})
verifier('stock insuffisant détecté', !stock.ok && stock.status === 409, JSON.stringify(stock))

stock = await verifierStockDisponible({
  supabase: supabaseFactice({ stocks: [{ article_id: 'a1', jour_semaine: 'mercredi', stock: 10, actif: false }] }),
  lignes: lignesStock, commercantId: 'c1', dateCommande: JOUR,
})
verifier('article inactif ce jour refusé', !stock.ok)

stock = await verifierStockDisponible({
  supabase: supabaseFactice({ stocks: [] }),
  lignes: lignesStock, commercantId: 'c1', dateCommande: JOUR,
})
verifier('sans entrée de stock = pas de limite', stock.ok)

// ═══════════════════════════════════════════════════════════════════════════
// 4. LIBELLÉS DE RETRAIT — le piège du mode_retrait
// ═══════════════════════════════════════════════════════════════════════════
const creneau = { heure_debut: '11:15:00', heure_fin: '11:30:00' }

// ⚠️ 'retrait_boutique' N'EXISTE PAS en base : il faut le redériver.
verifier('boutique redérivée par la catégorie', estRetraitBoutique({ mode_retrait: 'retrait', commercant: { categorie: 'detail' } }))
verifier('vitrine aussi', estRetraitBoutique({ mode_retrait: 'retrait', commercant: { categorie: 'vitrine' } }))
verifier('alimentaire à créneau n’est pas boutique', !estRetraitBoutique({ mode_retrait: 'retrait', commercant: { categorie: 'alimentaire' } }, creneau))
verifier('livraison n’est pas boutique', !estRetraitBoutique({ mode_retrait: 'livraison', commercant: { categorie: 'detail' } }))

egal('C&C alimentaire avec horaires',
  libelleRetrait({ mode_retrait: 'retrait', date_commande: '2026-08-04', commercant: { categorie: 'alimentaire' } }, creneau),
  'Retrait le mardi 4 août entre 11:15 et 11:30')
egal('boutique en préparation',
  libelleRetrait({ mode_retrait: 'retrait', statut: 'en_preparation', date_commande: '2026-08-04', commercant: { categorie: 'detail' } }, null),
  'En préparation · on te prévient dès qu\'elle t\'attend')
egal('boutique prête',
  libelleRetrait({ mode_retrait: 'retrait', statut: 'pret', date_commande: '2026-08-04', commercant: { categorie: 'detail' } }, null),
  'À retirer, elle t\'attend depuis le mardi 4 août')
egal('livraison avec créneau',
  libelleRetrait({ mode_retrait: 'livraison', date_commande: '2026-08-04', commercant: { categorie: 'alimentaire' } }, creneau),
  'Livraison le mardi 4 août entre 11:15 et 11:30')
egal('expédition',
  libelleRetrait({ mode_retrait: 'expedition', statut: 'en_preparation', commercant: { categorie: 'detail' } }),
  'Expédiée dès qu\'elle est préparée')
verifier('commande nulle ne casse pas', libelleRetrait(null) === '')
// Commande née du tunnel unique : retrait le jour du RDV, pas sur signal.
egal('commande liée à un RDV',
  libelleRetrait({ mode_retrait: 'retrait', rdv_reservation_id: 'r1', statut: 'en_attente', date_commande: '2026-08-10', commercant: { categorie: 'vitrine' } }, null),
  'À emporter le lundi 10 août, avec ton rendez-vous')

// ═══════════════════════════════════════════════════════════════════════════
// 5. FICHIER CALENDRIER — la cause du « iOS NOK »
// ═══════════════════════════════════════════════════════════════════════════
const ics = generateRdvIcs({
  id: 'r1', date_rdv: '2026-08-10', heure_debut: '13:00', heure_fin: '13:30',
  prestation_nom: 'Coupe femme', commercant_nom: 'Ciseaux', commercant_adresse: 'Rue X',
  commercant_email: 'salon@test.be', client_email: 'yopper@test.be', client_nom: 'Alex V',
})
verifier('ATTENDEE présent (indispensable iOS)', ics.includes('ATTENDEE'), ics.split('\r\n').filter(l => l.startsWith('ATT')).join('|'))
verifier('ATTENDEE porte l’email du client', ics.includes('mailto:yopper@test.be'))
verifier('ORGANIZER présent', ics.includes('ORGANIZER'))
verifier('METHOD REQUEST', ics.includes('METHOD:REQUEST'))
verifier('lignes en CRLF', ics.includes('\r\n'))

// Sans email de commerçant, l'ORGANIZER doit quand même exister.
const icsSansMail = generateRdvIcs({
  id: 'r2', date_rdv: '2026-08-10', heure_debut: '13:00', heure_fin: '13:30',
  prestation_nom: 'Coupe', commercant_nom: 'Ciseaux', commercant_adresse: '',
  client_email: 'yopper@test.be',
})
verifier('ORGANIZER de secours', icsSansMail.includes('ORGANIZER'))

const icsAnnule = generateRdvIcs({
  id: 'r3', date_rdv: '2026-08-10', heure_debut: '13:00', heure_fin: '13:30',
  prestation_nom: 'Coupe', commercant_nom: 'Ciseaux', commercant_adresse: '',
  client_email: 'yopper@test.be', method: 'CANCEL', status: 'CANCELLED', sequence: 1,
})
egal('type MIME suit la méthode réelle',
  icsToBase64Attachment(icsAnnule).content_type,
  'text/calendar; charset=utf-8; method=CANCEL')
egal('type MIME REQUEST sur une confirmation',
  icsToBase64Attachment(ics).content_type,
  'text/calendar; charset=utf-8; method=REQUEST')

// ═══════════════════════════════════════════════════════════════════════════
// 6. TVA — frais de livraison au taux le plus bas
// ═══════════════════════════════════════════════════════════════════════════
egal('frais au taux le plus bas', tauxFraisLivraison([21, 6, 12], 21), 6)
egal('repli sur le taux du commerce', tauxFraisLivraison([], 21), 21)

// ═══════════════════════════════════════════════════════════════════════════
// 7. VENTILATION DES FRAIS STRIPE — le double comptage du tunnel unique
// ═══════════════════════════════════════════════════════════════════════════
let v = ventilerFrais(1.00, 8.75, 21.90)   // acompte 8,75 + produits 21,90
verifier('somme des parts = frais réels', Math.abs((v.rdv.frais + v.commande.frais) - 1.00) < 0.001, JSON.stringify(v))
egal('part du RDV au prorata', v.rdv.frais, 0.29)
egal('part des produits = le reste', v.commande.frais, 0.71)
egal('net du RDV', v.rdv.net, 8.46)
egal('net des produits', v.commande.net, 21.19)

// Acompte nul : tout revient aux produits, rien au rendez-vous.
v = ventilerFrais(1.00, 0, 21.90)
egal('sans acompte, frais entièrement aux produits', v.commande.frais, 1)
egal('sans acompte, rien au rendez-vous', v.rdv.frais, 0)

// Arrondi : la somme doit tomber juste même sur des montants tordus.
v = ventilerFrais(0.97, 13.33, 26.67)
verifier('pas de centime perdu à l’arrondi', Math.abs((v.rdv.frais + v.commande.frais) - 0.97) < 0.0001, JSON.stringify(v))

verifier('total nul = pas de ventilation', ventilerFrais(1.00, 0, 0) === null)
verifier('frais absents = pas de ventilation', ventilerFrais(null, 10, 10) === null)

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Tout est vert.')
