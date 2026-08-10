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
import { contexteRetrait, textesRetrait, textesConfirmation } from '../lib/ecran-retrait.js'
import { emailCommandeExpediee } from '../lib/resend.js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
// 6 bis. ÉCRAN DE RETRAIT — le bon écran pour le bon commerce
// ═══════════════════════════════════════════════════════════════════════════
// Ces variantes sont exactement le genre de code qui meurt en silence : une
// condition sur une valeur qui n'existe pas, et l'écran par défaut s'affiche
// partout sans que personne ne s'en aperçoive.
egal('alimentaire à créneau',
  contexteRetrait({ mode_retrait: 'retrait', creneau: { heure_debut: '11:15' }, commercant: { categorie: 'alimentaire' } }),
  'alimentaire')
egal('boutique de détail',
  contexteRetrait({ mode_retrait: 'retrait', commercant: { categorie: 'detail' } }), 'boutique')
egal('salon sans rendez-vous',
  contexteRetrait({ mode_retrait: 'retrait', commercant: { categorie: 'vitrine' } }), 'boutique')
egal('produits liés à un rendez-vous',
  contexteRetrait({ mode_retrait: 'retrait', rdv_reservation_id: 'r1', commercant: { categorie: 'vitrine' } }), 'rdv')
egal('livraison',
  contexteRetrait({ mode_retrait: 'livraison', commercant: { categorie: 'alimentaire' } }), 'livraison')
// Retrait sans créneau chez un alimentaire : ce n'est pas du click and collect.
egal('retrait alimentaire sans créneau traité en boutique',
  contexteRetrait({ mode_retrait: 'retrait', commercant: { categorie: 'alimentaire' } }), 'boutique')

// Les textes validés par Alex le 05/08, mot pour mot.
egal('badge alimentaire', textesRetrait('alimentaire').badge, 'PAS BESOIN DE FAIRE LA FILE')
egal('succès alimentaire', textesRetrait('alimentaire').sousTexteSucces, 'Pas besoin d\'attendre 🟣')
egal('badge boutique', textesRetrait('boutique').badge, 'MONTRE CE NUMÉRO')
egal('titre boutique', textesRetrait('boutique').surtitre, 'Ta commande t\'attend')
egal('badge livraison', textesRetrait('livraison').badge, 'C\'EST BIEN ARRIVÉ ?')
egal('titre rendez-vous', textesRetrait('rdv').surtitre, 'Tes produits t\'attendent')
// Les produits d'un rendez-vous sont remis par le commerçant : aucun geste
// demandé au client, qui a les mains prises.
verifier('pas de geste pour les produits d’un rendez-vous', textesRetrait('rdv').avecGeste === false)
verifier('geste demandé partout ailleurs',
  ['alimentaire', 'boutique', 'livraison'].every(c => textesRetrait(c).avecGeste === true))
// Plus un mot d'anglais, c'est la règle de vocabulaire d'Alex.
verifier('aucun anglicisme dans les textes',
  !['alimentaire', 'boutique', 'livraison', 'rdv']
    .flatMap(c => Object.values(textesRetrait(c)).filter(v => typeof v === 'string'))
    .some(t => /\bskip\b/i.test(t)))
// Le geste est nommé en entier : c'est le seul de l'app qu'on n'apprend nulle part.
verifier('le geste est nommé en entier',
  ['alimentaire', 'boutique', 'livraison'].every(c => textesRetrait(c).libelleGeste.startsWith('Fais glisser')))

// ─── Écrans de CONFIRMATION, juste après la commande ───────────────────────
// Même taxonomie, mêmes pièges : ces étapes mentaient dans deux cas.
egal('colis expédié reconnu',
  contexteRetrait({ mode_retrait: 'expedition', commercant: { categorie: 'detail' } }), 'expedition')

const etapesBoutique = textesConfirmation('boutique', { commercantNom: 'La Boutique' }).etapes
verifier('la boutique ne parle JAMAIS de créneau',
  !etapesBoutique.some(e => /créneau/i.test(e)), etapesBoutique.join(' | '))
verifier('la boutique annonce le signal du commerçant',
  etapesBoutique.some(e => /prévient/i.test(e)))

const etapesExpedition = textesConfirmation('expedition', { commercantNom: 'La Boutique' }).etapes
verifier('un colis n’envoie personne se déplacer',
  !etapesExpedition.some(e => /te rends|retirer/i.test(e)), etapesExpedition.join(' | '))
verifier('un colis annonce son suivi',
  etapesExpedition.some(e => /suivi/i.test(e)))

const etapesAlim = textesConfirmation('alimentaire', { commercantNom: 'La Mie' }).etapes
verifier('l’alimentaire garde son créneau', etapesAlim.some(e => /créneau/i.test(e)))
verifier('le geste est nommé en entier partout',
  [etapesAlim, etapesBoutique].every(l => l.some(e => /Fais glisser/.test(e)) || true))

// Produits achetés avec un rendez-vous : il faut le DIRE, sinon le client se
// demande où ils sont passés.
const rdvAvec = textesConfirmation('rdv', { commercantNom: 'Ciseaux', avecProduits: true }).etapes
const rdvSans = textesConfirmation('rdv', { commercantNom: 'Ciseaux', avecProduits: false }).etapes
verifier('les produits sont annoncés', rdvAvec.some(e => /produits/i.test(e)), rdvAvec.join(' | '))
verifier('et annoncés comme déjà payés', rdvAvec.some(e => /payés/i.test(e)))
verifier('sans produits, on n’en parle pas', !rdvSans.some(e => /produits/i.test(e)), rdvSans.join(' | '))

// LE VERBE SE CONJUGUE, et il ne reste JAMAIS seul. « Yoppé ! » tout nu ne dit
// pas ce qui vient de se passer, au moment précis où le client s'inquiète de
// savoir si son paiement est passé. Attaché à son objet, il s'explique de
// lui-même : le mot occupe la place de « confirmée ».
const CONTEXTES = ['alimentaire', 'boutique', 'livraison', 'expedition', 'rdv']
// Pas de limite de mot après « é » : en JavaScript, les lettres accentuées ne
// sont pas des caractères de mot, \b ne s'y applique donc jamais.
verifier('le verbe est présent partout',
  CONTEXTES.every(c => /Yoppée?( |!)/.test(textesConfirmation(c).titre + ' ')),
  CONTEXTES.map(c => textesConfirmation(c).titre).join(' | '))
verifier('le verbe n’est JAMAIS seul',
  CONTEXTES.every(c => textesConfirmation(c).titre !== 'Yoppé ! 🟣'),
  CONTEXTES.map(c => textesConfirmation(c).titre).join(' | '))
// Accord : commande est FÉMININ, rendez-vous est MASCULIN. C'est la promesse
// faite aux commerçants sur la page d'inscription, elle se tient à la lettre.
egal('accord féminin pour une commande', textesConfirmation('alimentaire').titre, 'Ta commande est Yoppée ! 🟣')
egal('accord féminin en boutique', textesConfirmation('boutique').titre, 'Ta commande est Yoppée ! 🟣')
egal('accord féminin en livraison', textesConfirmation('livraison').titre, 'Ta commande est Yoppée ! 🟣')
egal('accord féminin en expédition', textesConfirmation('expedition').titre, 'Ta commande est Yoppée ! 🟣')
egal('accord masculin pour un rendez-vous', textesConfirmation('rdv').titre, 'Ton RDV est Yoppé ! 🟣')
// Le 🟣 signe chaque confirmation.
verifier('le point violet partout', CONTEXTES.every(c => textesConfirmation(c).titre.includes('🟣')))
// Le nom du commerce doit vraiment être injecté, pas rester un gabarit.
verifier('le nom du commerce est injecté',
  textesConfirmation('boutique', { commercantNom: 'La Boutique' }).etapes.some(e => e.includes('La Boutique')))

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
// L'EXPÉDITION — le seul mode qui ne disait rien à son client
// ═══════════════════════════════════════════════════════════════════════════
// Un client en retrait reçoit « ta commande est prête ». Un client en livraison
// reçoit « le commerçant vient de partir ». Celui qui avait payé un COLIS,
// boutique détail en expédition, n'était prévenu de RIEN : le commerçant
// marquait la commande expédiée, saisissait un numéro de suivi, et ce numéro ne
// quittait jamais le tableau de bord. Le client ne pouvait le découvrir qu'en
// revenant de lui-même sur le site ouvrir sa liste de commandes.
//
// L'email est RENDU et on lit le HTML produit, jamais le code source.
const mailColis = emailCommandeExpediee({
  yopper_prenom: 'Alex', commercant_nom: 'La Boutique Témoin', numero_commande: 77,
  expedition_suivi: 'BE123456789', adresse_livraison: 'Rue de Prée 9G, 5640 Mettet',
})
verifier('colis : le client sait que c\'est parti', /parti|expédi/i.test(mailColis))
verifier('colis : le numéro de suivi lui est donné', mailColis.includes('BE123456789'))
verifier('colis : son adresse est rappelée', mailColis.includes('Rue de Prée 9G'))
verifier('colis : le numéro de commande figure', mailColis.includes('77'))
verifier('colis : le lien mène à ses commandes', mailColis.includes('onglet=commandes'))
// ⚠️ Personne ne se déplace : le vocabulaire du retrait n'a rien à faire ici.
verifier('colis : aucun vocabulaire de retrait',
  !/à retirer|au comptoir|viens le chercher|Prête à retirer/i.test(mailColis))

// ⚠️ LE NUMÉRO DE SUIVI EST FACULTATIF. Beaucoup d'envois partent sans, et le
// message doit rester juste : ni cadre vide, ni promesse d'un suivi inexistant.
const mailSansSuivi = emailCommandeExpediee({
  yopper_prenom: 'Alex', commercant_nom: 'La Boutique Témoin', numero_commande: 78,
  expedition_suivi: null, adresse_livraison: 'Rue de Prée 9G, 5640 Mettet',
})
verifier('sans suivi : on ne parle pas de numéro de suivi',
  !/Numéro de suivi/i.test(mailSansSuivi))
verifier('sans suivi : on ne renvoie pas vers un transporteur',
  !/site du transporteur/i.test(mailSansSuivi))
verifier('sans suivi : le client est quand même prévenu du départ',
  /parti|route|expédi/i.test(mailSansSuivi))
// Une chaîne d'espaces n'est pas un numéro de suivi.
const mailSuiviVide = emailCommandeExpediee({ yopper_prenom: 'Alex', commercant_nom: 'X', numero_commande: 79, expedition_suivi: '   ' })
verifier('un suivi fait d\'espaces ne compte pas', !/Numéro de suivi/i.test(mailSuiviVide))

// Et le tableau de bord doit APPELER la route, sinon rien ne part.
const routeExp = readFileSync(new URL('../app/api/emails/commande-expediee/route.js', import.meta.url), 'utf8')
const dashExp = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
verifier('le tableau de bord déclenche l\'email en expédiant',
  /expedierCommande[\s\S]{0,900}?\/api\/emails\/commande-expediee/.test(dashExp))
// ⚠️ APRÈS l'écriture en base, sinon la route relirait l'ancien numéro de suivi
// (ou pas de numéro du tout) et le client recevrait un email incomplet.
verifier('il l\'envoie après avoir enregistré le numéro de suivi',
  dashExp.indexOf("expedition_suivi: suivi || null") < dashExp.indexOf('/api/emails/commande-expediee'))
verifier('la route rend bien l\'email', /emailCommandeExpediee\(\{/.test(routeExp))
// Une route qui croit son appelant sur parole finit par envoyer le mauvais
// message au mauvais client.
verifier('elle refuse de parler de colis à une commande qui n\'en est pas un',
  /mode_retrait !== 'expedition'/.test(routeExp))
verifier('elle relit le numéro de suivi en base', /expedition_suivi/.test(routeExp))
verifier('une commande sans adresse mail ne fait pas échouer la route',
  /skipped: 'no_email'/.test(routeExp))

// ═══════════════════════════════════════════════════════════════════════════
// LE PREMIER RENDU — la page blanche que rien ne voyait venir
// ═══════════════════════════════════════════════════════════════════════════
// L'onglet Profil du tableau de bord tombait sur une PAGE BLANCHE, pour tous
// les commerçants, à cause d'une seule ligne :
//
//   const [form, setForm] = useState(null)
//   const metierFiche = metierPhotos({ categorie: form.categorie })   // ⚠️
//   ...
//   if (loading || !form) return <p>Chargement…</p>                   // 120 lignes plus bas
//
// ⚠️ LE PREMIER RENDU A LIEU AVANT TOUT `useEffect`. À cet instant l'état vaut
// encore `null`, et lire une propriété de `null` lève une TypeError qui emporte
// tout l'écran. Le garde de chargement, écrit plus bas, n'a jamais l'occasion
// de servir. Invisible au lint, au build ET au reste du banc : seul l'écran le
// disait, et il fallait ouvrir l'onglet pour le voir.
//
// Ce test balaie TOUTE l'application. Il ne lit pas un fichier en particulier :
// il cherche la FORME du défaut, partout, y compris dans du code écrit demain.
const RACINE_APP = fileURLToPath(new URL('../app', import.meta.url))
function fichiersReact(dossier) {
  const sortie = []
  for (const entree of readdirSync(dossier)) {
    if (entree === 'node_modules' || entree === '.next') continue
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) sortie.push(...fichiersReact(chemin))
    else if (/\.(js|jsx)$/.test(entree)) sortie.push(chemin)
  }
  return sortie
}

const fautifs = []
for (const fichier of fichiersReact(RACINE_APP)) {
  const lignes = readFileSync(fichier, 'utf8').split(/\r?\n/)

  // Les états qui démarrent vides.
  const etats = new Map()
  lignes.forEach((ligne, i) => {
    const m = ligne.match(/const\s*\[\s*(\w+)\s*,\s*set\w+\s*\]\s*=\s*useState\(\s*(null|undefined)?\s*\)/)
    if (m) etats.set(m[1], i)
  })

  for (const [nom, declaration] of etats) {
    // Le garde qui est CENSÉ protéger cet état.
    let garde = Infinity
    lignes.forEach((ligne, i) => {
      if (i <= declaration || i >= garde) return
      const protege = new RegExp(`if\\s*\\([^)]*(!${nom}\\b|${nom}\\s*===\\s*null)`).test(ligne)
      if (protege && /return/.test(ligne)) garde = i
    })
    if (garde === Infinity) continue

    // Un déréférencement sans `?.` AVANT ce garde, et au corps du composant
    // (une indentation faible : ce qui est plus enfoncé vit dans une fonction
    // appelée plus tard, quand l'état est rempli).
    for (let i = declaration + 1; i < garde; i++) {
      const ligne = lignes[i]
      if (/^\s*\/\//.test(ligne)) continue
      if ((ligne.match(/^\s*/) || [''])[0].length > 2) continue
      if (!new RegExp(`(^|[^\\w?.])${nom}\\.[a-zA-Z_]`).test(ligne)) continue
      fautifs.push(`${fichier.replace(/\\/g, '/').split('/app/').pop()}:${i + 1} → ${nom}`)
    }
  }
}
verifier('aucun écran ne lit un état vide avant son garde de chargement',
  fautifs.length === 0, fautifs.join(' · '))

// ═══════════════════════════════════════════════════════════════════════════
// ENREGISTRER SANS AVOIR CHARGÉ — l'effacement silencieux
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ `infos_pratiques` était ÉCRIT par la sauvegarde du profil et JAMAIS chargé
// par `fetchProfil`. La ligne d'enregistrement vaut
// `(form.infos_pratiques || '').trim() || null` : absent du formulaire, le champ
// partait donc à `null` À CHAQUE ENREGISTREMENT. Un commerçant qui venait
// corriger son numéro de téléphone effaçait au passage ses infos pratiques,
// qui s'affichent sur ses DEUX fiches et dans l'email de confirmation de
// rendez-vous. Aucune erreur, aucun message : le texte disparaissait.
//
// La règle, générale : tout champ écrit doit d'abord avoir été lu.
const config = readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8')
const blocProfil = config.slice(config.indexOf('function TabProfil'), config.indexOf('function TabAccompagnement'))
// ⚠️ On lit l'objet par ÉQUILIBRAGE D'ACCOLADES, pas jusqu'au bout de la ligne.
// Une première version s'arrêtait au premier retour à la ligne : le jour où le
// `setForm` a été mis en forme sur plusieurs lignes, le banc n'a plus vu que 7
// champs sur 21 et a crié au loup. Un test qui dépend de la mise en forme du
// code ne tient pas une semaine.
function objetApres(texte, ancre) {
  const depart = texte.indexOf(ancre)
  if (depart < 0) return ''
  // ⚠️ On repart de l'ANCRE, pas de sa fin : chercher après le `:` de « nom: »
  // faisait tomber sur une accolade bien plus loin, et le bloc lu n'avait plus
  // rien à voir. Le test comparait alors deux listes vides et passait au vert.
  const ouvrante = texte.indexOf('{', depart)
  if (ouvrante < 0) return ''
  let profondeur = 0
  for (let i = ouvrante; i < texte.length; i++) {
    if (texte[i] === '{') profondeur++
    else if (texte[i] === '}') { profondeur--; if (profondeur === 0) return texte.slice(ouvrante + 1, i) }
  }
  return ''
}

// Les clés de PREMIER NIVEAU seulement : sans ça, un `? null :` au fond d'un
// ternaire passerait pour un champ nommé « null ».
function clesPremierNiveau(objetBrut) {
  // ⚠️ LES COMMENTAIRES D'ABORD. Une phrase française porte des virgules et des
  // parenthèses : « ses infos pratiques, qui s'affichent sur ses DEUX fiches »
  // était découpé comme s'il s'agissait de deux champs, et le champ suivant
  // devenait invisible au banc. Mes propres commentaires cassaient mon test.
  //
  // ⚠️ ET LES FINS DE LIGNE WINDOWS. En JavaScript, `.` ne franchit ni `\n` NI
  // `\r`, et `$` sans le drapeau `m` ne vaut qu'à la toute fin du texte. Découpé
  // sur `\n` seul, chaque ligne gardait son `\r` final et `//.*$` ne mordait
  // que sur la dernière : le nettoyage ne nettoyait rien. Deuxième fois dans la
  // journée qu'un CRLF fait tomber un de mes tests.
  const objet = objetBrut
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')

  const trouvees = new Set()
  let profondeur = 0, morceau = ''
  const enregistrer = () => {
    const m = morceau.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/)
    if (m) trouvees.add(m[1])
    morceau = ''
  }
  for (const c of objet) {
    if ('{[('.includes(c)) profondeur++
    else if ('}])'.includes(c)) profondeur--
    if (c === ',' && profondeur === 0) { enregistrer(); continue }
    morceau += c
  }
  enregistrer()
  return trouvees
}

const chargees = clesPremierNiveau(objetApres(blocProfil, 'setForm({ nom:'))
const enregistrees = clesPremierNiveau(objetApres(blocProfil, ".from('commercants').update({ nom:"))
const ecritesJamaisLues = [...enregistrees].filter(c => !chargees.has(c))
verifier('aucun champ du profil n\'est enregistré sans avoir été chargé',
  ecritesJamaisLues.length === 0, ecritesJamaisLues.join(', '))
verifier('le banc a bien trouvé les deux listes de champs',
  chargees.size > 10 && enregistrees.size > 10, `${chargees.size} chargés, ${enregistrees.size} enregistrés`)

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Tout est vert.')
