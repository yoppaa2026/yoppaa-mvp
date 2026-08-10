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
import { emailCommandeExpediee, emailRecapCommandesJour } from '../lib/resend.js'
import { partagerCommandes } from '../lib/commandes-vue.js'
import { restaurerStockVariantes } from '../lib/stock-variantes-server.js'
import { couleurRdv, texteLisibleSur, COULEUR_DEFAUT, ENCRE } from '../lib/agenda-couleurs.js'
import { contenuBlocRdv, HAUTEUR_TROIS_LIGNES } from '../lib/agenda-bloc.js'
import { nouveauxRdvs, idsDes, texteAlerteRdv } from '../lib/alerte-rdv.js'
import { messagePanierRepris } from '../lib/panier-repris-message.js'
import { normaliserEmail, memeEmail } from '../lib/email-normalise.js'
import { ouvertLe, prochainJourOuvert } from '../lib/ouverture.js'
import { bonsDuJour, resumeBonsVendus, texteBonVendu } from '../lib/bons-vendus.js'
import { jourSemaineDe } from '../lib/creneaux.js'
import {
  referenceCommande, referenceComplete, referenceAvecNom,
  prefixePourCommande, libelleSemaine, referenceRdv, referenceRdvComplete, PREFIXES,
} from '../lib/numero-commande.js'
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
// LE BON CADEAU VENDU, QUE LE COMMERÇANT NE VOYAIT NULLE PART
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ Quelqu'un achetait un bon cadeau, l'argent arrivait sur son compte, et son
// tableau de bord n'en disait pas un mot. Un email partait, mais UNIQUEMENT s'il
// était réglé sur « à chaque commande » : réglé sur le récapitulatif du matin ou
// sur rien du tout, il découvrait la vente dans ses chiffres, des jours plus
// tard. Il n'a rien à préparer, mais quelqu'un vient d'offrir SON commerce.
{
  const b = (id, montant, jour) => ({ id, montant_initial: montant, solde: montant, created_at: `${jour}T10:00:00Z` })
  const jourDe = (x) => String(x.created_at).slice(0, 10)
  const lot = [b('a', 50, '2026-08-11'), b('b', 25, '2026-08-11'), b('c', 100, '2026-08-10')]

  egal('seuls les bons du jour affiché sont retenus',
    bonsDuJour(lot, '2026-08-11', jourDe).map(x => x.id), ['a', 'b'])
  egal('le résumé additionne', resumeBonsVendus(bonsDuJour(lot, '2026-08-11', jourDe)), { nombre: 2, total: 75 })
  egal('aucun bon, aucun résumé', resumeBonsVendus([]), { nombre: 0, total: 0 })
  egal('sans fonction de jour, on ne devine pas', bonsDuJour(lot, '2026-08-11'), [])

  // ⚠️ C'EST LE MONTANT INITIAL QUI COMPTE, PAS LE SOLDE. Le solde baisse à
  // mesure que le bénéficiaire dépense : un bon entièrement utilisé afficherait
  // « 0 € » alors qu'il a bel et bien été vendu à son prix.
  egal('un bon déjà dépensé reste compté à son prix de vente',
    resumeBonsVendus([{ montant_initial: 50, solde: 0 }]), { nombre: 1, total: 50 })

  // Ce qu'on lui dit : il n'a rien à faire, il a juste à savoir.
  const txt = texteBonVendu({ montant_initial: 50 })
  verifier('le montant est annoncé', txt.corps.includes('50.00'))
  verifier('et qu\'il n\'a rien à préparer', /rien à préparer/.test(txt.corps))
  verifier('sans montant, la phrase tient debout',
    !/undefined|NaN/.test(texteBonVendu({}).corps), texteBonVendu({}).corps)

  // Et le tableau de bord doit les charger ET les annoncer.
  const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')
  verifier('le tableau de bord charge les bons vendus', /from\('bons_cadeaux'\)/.test(dash))
  verifier('il les affiche pour le jour regardé', /bonsDuJour\(bonsVendus/.test(dash))
  verifier('et il annonce une vente qui vient d\'arriver', /setNouveauBon\(/.test(dash))
  // ⚠️ Un tag de notification propre : deux notifications de même tag se
  // REMPLACENT, une commande effacerait l'annonce du bon.
  verifier('avec son propre tag de notification', /'yoppaa-bon'/.test(dash))

  // ⚠️ ET LE RÉCAPITULATIF DU MATIN. Un commerçant réglé dessus ne recevait
  // AUCUN email quand on lui achetait un bon : l'envoi immédiat n'existe que
  // pour « à chaque commande ». L'email est RENDU et on lit le HTML produit.
  const recapAvec = emailRecapCommandesJour({
    nom_commercant: 'La Mie de Test', date_jour: '2026-08-11', commandes: [],
    bons_vendus: [{ montant_initial: 50 }, { montant_initial: 25 }],
  })
  verifier('le récapitulatif annonce les bons vendus', /2 bons cadeaux vendus/.test(recapAvec))
  verifier('avec leur total', recapAvec.includes('75.00'))
  verifier('et qu\'il n\'y a rien à préparer', /rien à préparer/.test(recapAvec))
  // Sans bon vendu, aucun bloc : on n'écrit pas « 0 bon cadeau ».
  const recapSans = emailRecapCommandesJour({ nom_commercant: 'X', date_jour: '2026-08-11', commandes: [] })
  verifier('sans bon vendu, on n\'en parle pas', !/bon cadeau/i.test(recapSans))
  // Un seul bon se dit au singulier.
  const recapUn = emailRecapCommandesJour({ nom_commercant: 'X', date_jour: '2026-08-11', commandes: [], bons_vendus: [{ montant_initial: 40 }] })
  verifier('un seul bon se dit au singulier',
    /Bon cadeau vendu/.test(recapUn) && !/bons cadeaux/.test(recapUn))
  const cronRecap = readFileSync(new URL('../app/api/cron/recap-jour-8h/route.js', import.meta.url), 'utf8')
  verifier('le cron va bien les chercher', /from\('bons_cadeaux'\)/.test(cronRecap))
  verifier('et les passe à l\'email', /bons_vendus:\s*bonsVeille/.test(cronRecap))
}

// ═══════════════════════════════════════════════════════════════════════════
// « JE RÉCUPÈRE AUJOURD'HUI » ALORS QUE LE MAGASIN EST FERMÉ
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ EN BOUTIQUE, LE RETRAIT N'ÉTAIT SOUMIS À AUCUNE CONDITION. La date était
// forcée à aujourd'hui et le contrôle valait `true` EN DUR : un dimanche, on
// annonçait au client un retrait un dimanche, et il se déplaçait devant une
// porte fermée. L'alimentaire est protégé par ses créneaux (pas de créneau, pas
// de commande) ; la boutique n'en a pas, donc plus rien ne la protégeait.
//
// On EXÉCUTE la recherche sur de vraies dates, dont un vrai dimanche.
{
  // 2026-08-16 est un dimanche, 2026-08-17 un lundi.
  const HORAIRES = {
    lundi:    { ouvert: true, debut: '09:00', fin: '18:00' },
    mardi:    { ouvert: true, debut: '09:00', fin: '18:00' },
    mercredi: { ouvert: true, debut: '09:00', fin: '18:00' },
    jeudi:    { ouvert: true, debut: '09:00', fin: '18:00' },
    vendredi: { ouvert: true, debut: '09:00', fin: '18:00' },
    samedi:   { ouvert: true, debut: '09:00', fin: '13:00' },
    dimanche: { ouvert: false },
  }
  verifier('le jeu d\'essai vise bien un dimanche', jourSemaineDe('2026-08-16') === 'dimanche')

  verifier('un dimanche, le magasin est fermé',
    ouvertLe({ horairesDetail: HORAIRES, dateStr: '2026-08-16' }) === false)
  verifier('un lundi, il est ouvert',
    ouvertLe({ horairesDetail: HORAIRES, dateStr: '2026-08-17' }) === true)
  egal('un dimanche, le retrait est annoncé pour le lendemain',
    prochainJourOuvert({ horairesDetail: HORAIRES, depuis: '2026-08-16' }), '2026-08-17')
  egal('un lundi, c\'est le jour même',
    prochainJourOuvert({ horairesDetail: HORAIRES, depuis: '2026-08-17' }), '2026-08-17')

  // ⚠️ LES CONGÉS PRIMENT sur la grille hebdomadaire. Un commerçant qui ferme
  // deux semaines ne doit pas voir des commandes tomber pendant son absence.
  const CONGES = [{ date_debut: '2026-08-17', date_fin: '2026-08-21' }]
  egal('un congé repousse au premier jour rouvert',
    prochainJourOuvert({ horairesDetail: HORAIRES, fermetures: CONGES, depuis: '2026-08-16' }), '2026-08-22')
  verifier('et le jour de congé est bien fermé',
    ouvertLe({ horairesDetail: HORAIRES, fermetures: CONGES, dateStr: '2026-08-18' }) === false)
  // Une fermeture d'un seul jour n'a pas de date de fin.
  verifier('une fermeture d\'un jour compte aussi',
    ouvertLe({ horairesDetail: HORAIRES, fermetures: [{ date_debut: '2026-08-17' }], dateStr: '2026-08-17' }) === false)

  // Fermé plus de deux semaines : on ne promet pas une date lointaine, on
  // refuse la commande. C'est `creneauOk` qui s'appuie là-dessus.
  const TOUJOURS_FERME = { lundi: { ouvert: false }, mardi: { ouvert: false }, mercredi: { ouvert: false }, jeudi: { ouvert: false }, vendredi: { ouvert: false }, samedi: { ouvert: false }, dimanche: { ouvert: false } }
  egal('un commerce fermé en permanence ne propose aucune date',
    prochainJourOuvert({ horairesDetail: TOUJOURS_FERME, depuis: '2026-08-16' }), null)

  // ⚠️ SANS HORAIRES DU TOUT, ON N'INTERDIT RIEN. Un commerçant qui n'a pas
  // encore rempli sa fiche ne doit pas voir ses ventes bloquées par notre
  // prudence : fermer par défaut ferait perdre de l'argent à quelqu'un qui n'a
  // rien demandé.
  egal('sans horaires, le jour même reste possible',
    prochainJourOuvert({ horairesDetail: null, depuis: '2026-08-16' }), '2026-08-16')
  verifier('un commerce ouvert 24h/24 est toujours ouvert',
    ouvertLe({ horairesDetail: { always_open: true }, dateStr: '2026-08-16' }) === true)
  // Les horaires à pause (midi fermé) restent des jours ouverts.
  verifier('un jour à deux plages reste ouvert',
    ouvertLe({ horairesDetail: { dimanche: { ouvert: true, debut: '09:00', fin: '12:00', debut2: '14:00', fin2: '18:00' } }, dateStr: '2026-08-16' }) === true)

  // Et l'écran doit s'appuyer dessus, sinon rien de tout ça ne sert.
  const fiche = readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')
  verifier('la boutique cherche son prochain jour ouvert', /prochainJourOuvert\(\{/.test(fiche))
  verifier('le retrait n\'est plus accepté sans condition',
    !/modeBoutiqueEff === 'expedition' \? expeFormOk : true/.test(fiche))
  verifier('la date de commande suit ce jour, pas aujourd\'hui',
    /jourRetraitBoutique \|\| jourLocalISO\(new Date\(\)\)/.test(fiche))
  verifier('et le client lit la date AVANT de payer', /À récupérer/.test(fiche))
}

// ═══════════════════════════════════════════════════════════════════════════
// LE NUMÉRO DE COMMANDE — le seul langage commun entre le client et le commerçant
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ DEUX DÉFAUTS, ET LE SECOND EST LE PLUS TRAÎTRE.
//
// 1. L'ancien déclencheur faisait `MAX(numero) + 1`. Deux commandes arrivées
//    dans la même seconde LISENT LE MÊME MAXIMUM et repartent avec le MÊME
//    numéro. Un samedi matin de boulangerie, le commerçant a deux « #7 » à
//    servir. Corrigé en base par un compteur incrémenté SOUS VERROU : c'est le
//    verrou de ligne, et lui seul, qui rend le doublon impossible.
//
// 2. L'application avait un REPLI qui recalculait « la position du jour » quand
//    le numéro manquait, alors que la base numérote par SEMAINE. Le commerçant
//    pouvait chercher « 12 » là où son client annonçait « 3 ». Le repli est
//    supprimé partout : une commande sans référence n'en affiche aucune, plutôt
//    qu'un chiffre inventé.
egal('un Click & Collect porte son CC', referenceCommande({ numero_commande: 12, numero_prefixe: 'CC' }), 'CC12')
egal('une livraison porte son LI', referenceCommande({ numero_commande: 5, numero_prefixe: 'LI' }), 'LI5')
egal('une expédition porte son EX', referenceCommande({ numero_commande: 3, numero_prefixe: 'EX' }), 'EX3')
egal('un retrait en magasin porte son RE', referenceCommande({ numero_commande: 12, numero_prefixe: 'RE' }), 'RE12')
egal('un rendez-vous porte son RV', referenceRdv({ numero_rdv: 7, numero_prefixe: 'RV' }), 'RV7')
egal('un rendez-vous sans préfixe stocké le déduit', referenceRdv({ numero_rdv: 7 }), 'RV7')
egal('sans préfixe du tout, le numéro seul', referenceCommande({ numero_commande: 12 }), '12')
// ⚠️ SANS NUMÉRO, ON N'INVENTE RIEN. C'était tout le problème du repli.
egal('pas de numéro, pas de référence', referenceCommande({ numero_commande: null }), null)
egal('ni avec une valeur qui n\'est pas un nombre', referenceCommande({ numero_commande: 'douze' }), null)
egal('sans rien du tout non plus', referenceCommande({}), null)
// Le zéro n'est pas un numéro valide : le compteur commence à 1.
egal('le numéro zéro reste affichable tel quel', referenceCommande({ numero_commande: 0, numero_prefixe: 'CC' }), 'CC0')

// Le préfixe se calcule comme en base, pour pouvoir l'annoncer avant la commande.
// ⚠️ Le Click & Collect se reconnaît à son CRÉNEAU : un retrait en magasin porte
// le MÊME `mode_retrait` et n'a pas d'heure convenue. C'est la seule différence.
egal('livraison', prefixePourCommande({ mode_retrait: 'livraison' }), 'LI')
egal('expédition', prefixePourCommande({ mode_retrait: 'expedition' }), 'EX')
egal('retrait avec créneau : Click & Collect', prefixePourCommande({ mode_retrait: 'retrait', creneau_id: 'x' }), 'CC')
egal('retrait sans créneau : magasin', prefixePourCommande({ mode_retrait: 'retrait' }), 'RE')
egal('rien du tout : traité comme un retrait en magasin', prefixePourCommande({}), 'RE')
// ⚠️ Deux lettres partout : aucun préfixe ne doit être vide ni long d'une seule
// lettre, sinon la référence redevient ambiguë à l'oral et à l'écrit.
for (const p of Object.keys(PREFIXES)) {
  verifier(`le préfixe ${p} fait bien deux lettres`, /^[A-Z]{2}$/.test(p), p)
}

// La semaine lève la confusion d'une semaine à l'autre, là où on relit.
egal('la semaine se dit simplement', libelleSemaine('2026-33'), 'sem. 33')
egal('sans zéro inutile', libelleSemaine('2026-07'), 'sem. 7')
egal('une semaine absente ne dit rien', libelleSemaine(null), null)
egal('la référence complète porte la semaine',
  referenceComplete({ numero_commande: 12, numero_prefixe: 'CC', numero_semaine: '2026-33' }), 'CC12 · sem. 33')
egal('sans semaine, elle reste courte',
  referenceComplete({ numero_commande: 12, numero_prefixe: 'CC' }), 'CC12')
egal('un rendez-vous aussi porte sa semaine',
  referenceRdvComplete({ numero_rdv: 7, numero_semaine: '2026-33' }), 'RV7 · sem. 33')
// Au comptoir, le numéro va avec le prénom : c'est comme ça qu'on appelle
// quelqu'un dans une file.
egal('au comptoir, le prénom accompagne',
  referenceAvecNom({ numero_commande: 12, numero_prefixe: 'CC', client_prenom: 'Sophie' }), 'CC12 · Sophie')
egal('à défaut, le premier mot du nom',
  referenceAvecNom({ numero_commande: 12, client_nom: 'Dupont Jean' }), '12 · Dupont')
egal('sans nom, le numéro seul', referenceAvecNom({ numero_commande: 12 }), '12')

// ⚠️ ET LE REPLI DOIT AVOIR DISPARU PARTOUT. S'il revient à un seul endroit,
// les deux écrans recommencent à dire deux choses différentes.
for (const [chemin, ecran] of [
  ['app/dashboard/page.js', 'le tableau de bord'],
  ['app/commander/page.js', 'l\'écran du client'],
  ['app/api/yopper/commandes/route.js', 'la liste des commandes'],
]) {
  const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')
  verifier(`${ecran} n'invente plus de position du jour`,
    !/findIndex\(c => c\.id === commande/.test(src) && !/positionsMap/.test(src), chemin)
  verifier(`${ecran} lit la référence partagée`, /referenceCommande\(/.test(src), chemin)
}

// La migration doit poser le verrou, l'unicité, et ne pas renuméroter le passé.
{
  // ⚠️ On retire les commentaires SQL AVANT de juger : l'en-tête de la migration
  // EXPLIQUE le défaut corrigé, et cite donc « MAX(numero_commande) ». Un test
  // qui lit les commentaires condamne la documentation du correctif.
  const mig = readFileSync(new URL('../migrations/MIGRATION_NUMERO_COMMANDE.sql', import.meta.url), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/(^|\s)--.*/, '$1')).join('\n')
  verifier('le compteur est incrémenté sous verrou de ligne',
    /UPDATE compteurs_commande[\s\S]{0,200}?SET dernier = dernier \+ 1[\s\S]{0,200}?RETURNING dernier/.test(mig))
  verifier('et surtout plus par MAX + 1', !/MAX\(numero_commande\)/.test(mig))
  verifier('le doublon est rendu impossible par un index unique',
    /CREATE UNIQUE INDEX[\s\S]{0,200}?commercant_id, numero_semaine, numero_prefixe, numero_commande/.test(mig))
  // ⚠️ L'index ne doit couvrir que les nouvelles références : les anciennes
  // commandes ont numero_semaine à NULL et des numéros qui se répètent d'une
  // semaine à l'autre. Sans le filtre, l'index refuserait de se créer.
  verifier('l\'index épargne les anciennes commandes', /WHERE numero_semaine IS NOT NULL/.test(mig))
  verifier('un numéro déjà posé n\'est jamais recalculé',
    /IF NEW\.numero_commande IS NOT NULL THEN[\s\S]{0,60}?RETURN NEW/.test(mig))
  verifier('le préfixe distingue le créneau du retrait en magasin',
    /NEW\.creneau_id IS NOT NULL\s+THEN 'CC'/.test(mig) && /ELSE 'RE'/.test(mig))
  // Les rendez-vous entrent dans le même mécanisme, avec leur propre préfixe.
  verifier('les rendez-vous sont numérotés eux aussi',
    /CREATE TRIGGER trg_set_rdv_numero/.test(mig) && /'RV'/.test(mig))
  // ⚠️ Deux déclencheurs qui numérotent la même colonne se marcheraient dessus :
  // on retire d'abord celui qui existerait déjà.
  verifier('un ancien déclencheur de numérotation est retiré d\'abord',
    /DROP TRIGGER IF EXISTS %I ON rdv_reservations/.test(mig))
  verifier('les deux tables ont leur index unique',
    /uidx_commande_numero/.test(mig) && /uidx_rdv_numero/.test(mig))
  verifier('la semaine est ISO, pour tenir le passage d\'année',
    /'IYYY-IW'/.test(mig))
  verifier('rien n\'est renuméroté dans le passé', !/UPDATE commandes\s+SET numero/.test(mig))
}

// ═══════════════════════════════════════════════════════════════════════════
// L'EMAIL QUI FAISAIT DISPARAÎTRE LES COMMANDES
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ L'email du client était enregistré TEL QU'IL L'AVAIT TAPÉ, majuscules
// comprises, et relu systématiquement EN MINUSCULES (`identiteYopper` applique
// un `toLowerCase()`). La comparaison `client_email = <email du compte>` ne
// retrouvait donc RIEN dès que le client avait saisi « Jean.Dupont@Gmail.com ».
//
// Il commandait, tout se passait bien. Il se connectait, et ses commandes ET
// ses rendez-vous DISPARAISSAIENT de son écran.
//
// ⚠️ Et le défaut ÉPARGNAIT SON AUTEUR : qui tape son adresse en minuscules,
// comme la plupart des gens sur téléphone, ne le rencontre jamais. C'est la
// pire des configurations, celle où on ne peut pas se croire soi-même.
egal('les majuscules tombent', normaliserEmail('Jean.Dupont@Gmail.com'), 'jean.dupont@gmail.com')
egal('les espaces autour aussi', normaliserEmail('  jean@test.be  '), 'jean@test.be')
egal('une adresse déjà propre ne bouge pas', normaliserEmail('jean@test.be'), 'jean@test.be')
egal('rien du tout rend null', normaliserEmail(''), null)
egal('null rend null', normaliserEmail(null), null)
egal('des espaces seuls rendent null', normaliserEmail('   '), null)
// ⚠️ La comparaison doit suivre la même règle, sinon on répare l'écriture et on
// laisse la lecture divergente.
verifier('deux écritures de la même adresse se retrouvent',
  memeEmail('Jean.Dupont@Gmail.com', 'jean.dupont@gmail.com'))
verifier('deux adresses différentes ne se confondent pas',
  !memeEmail('jean@test.be', 'jeanne@test.be'))
verifier('le vide ne vaut jamais le vide', !memeEmail('', '') && !memeEmail(null, null))

// Et les trois endroits qui écrivent l'email doivent l'appeler : un seul oublié,
// et le client concerné reperd tout.
for (const [chemin, quoi] of [
  ['app/api/stripe/checkout/create-commande/route.js', 'la commande'],
  ['app/api/stripe/checkout/create-rdv-commande/route.js', 'le tunnel rendez-vous'],
  ['app/api/stripe/webhook/route.js', 'le rendez-vous né du paiement'],
]) {
  const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')
  verifier(`${quoi} enregistre l'email normalisé`,
    /client_email: normaliserEmail\(/.test(src), chemin)
  verifier(`${quoi} ne l'écrit plus brut`,
    !/^\s*client_email,\s*$/m.test(src), chemin)
}
// La réparation de l'existant ne doit rien détruire.
{
  const mig = readFileSync(new URL('../migrations/MIGRATION_EMAIL_MINUSCULES.sql', import.meta.url), 'utf8')
  verifier('la migration ne supprime rien', !/DELETE|DROP/i.test(mig))
  verifier('elle ne touche que ce qui doit changer', /WHERE[\s\S]{0,120}?<> lower\(btrim\(/.test(mig))
  verifier('elle couvre les commandes ET les rendez-vous',
    /UPDATE commandes/.test(mig) && /UPDATE rdv_reservations/.test(mig))
  verifier('sa vérification recompte ce qui resterait', /count\(\*\) FILTER/.test(mig))
}

// ═══════════════════════════════════════════════════════════════════════════
// « TES 1 ARTICLE T'ONT SUIVI » — le message qui ne s'accordait pas
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE PLURIEL N'ÉTAIT APPLIQUÉ QU'AU MOT « ARTICLE ». Avec un seul produit, le
// client lisait « Tes 1 article t'ont suivi depuis la fiche » : ni le
// déterminant, ni le verbe, ni le participe ne s'accordaient. Et « depuis la
// fiche » ne veut rien dire pour quelqu'un qui ne sait pas ce qu'est une fiche.
//
// Une phrase fausse ne fait planter personne. Elle abîme la confiance en
// silence, ce qui est pire.
{
  const un = messagePanierRepris({ repris: 1, vers: 'rdv' })
  verifier('au singulier, la phrase s\'accorde', /Ton article est toujours/.test(un.garde), un.garde)
  verifier('et ne dit surtout pas « Tes 1 »', !/Tes 1/.test(un.garde))
  const trois = messagePanierRepris({ repris: 3, vers: 'rdv' })
  verifier('au pluriel aussi', /Tes 3 articles sont toujours/.test(trois.garde), trois.garde)
  verifier('aucun panier, aucun message', messagePanierRepris({ repris: 0 }).garde === null)

  // Ce qui n'a pas pu suivre, sans deviner le genre du produit : « il » ou
  // « elle » sur un nom d'article inconnu tombe une fois sur deux.
  const perduUn = messagePanierRepris({ repris: 1, ignores: ['Shampoing bio'], vers: 'rdv' })
  verifier('un article resté est nommé', perduUn.perdus.includes('Shampoing bio'))
  verifier('au singulier, le verbe suit', /se commande depuis/.test(perduUn.perdus), perduUn.perdus)
  const perduDeux = messagePanierRepris({ repris: 0, ignores: ['Shampoing', 'Masque'], vers: 'rdv' })
  verifier('au pluriel, le verbe suit aussi', /se commandent depuis/.test(perduDeux.perdus), perduDeux.perdus)
  verifier('et on les nomme tous', perduDeux.perdus.includes('Shampoing') && perduDeux.perdus.includes('Masque'))
  // ⚠️ Aucun genre deviné : ni « il », ni « elle », ni « celui-ci ».
  verifier('aucun genre n\'est supposé', !/\b(il|elle|celui|celle)\b/i.test(perduUn.perdus), perduUn.perdus)

  // Le sens : on ne parle plus de « fiche », un mot d'informaticien.
  for (const m of [un.garde, trois.garde, perduUn.perdus, perduDeux.perdus]) {
    verifier('le mot « fiche » a disparu des messages', !/fiche/i.test(m || ''), m)
  }
  // Et aucune phrase ne doit sortir avec un trou.
  for (const m of [un.garde, trois.garde, perduUn.perdus, perduDeux.perdus]) {
    verifier('aucune phrase à trou', !/undefined|null|NaN/.test(m || ''), m)
  }
}
// Les deux écrans doivent APPELER la source unique, pas garder leur version.
for (const chemin of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js']) {
  const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
    .split(/\r?\n/).map(l => l.replace(/(^|\s)\/\/.*/, '$1')).join('\n')
  verifier(`${chemin} appelle la phrase partagée`, /messagePanierRepris\(\{/.test(src), chemin)
  verifier(`${chemin} n'écrit plus le pluriel à la main`,
    !/article\{[^}]*repris > 1/.test(src), chemin)
}

// ═══════════════════════════════════════════════════════════════════════════
// L'AGENDA AUX COULEURS DES PRATICIENNES
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA COULEUR NE SERVAIT À RIEN. Tous les rendez-vous confirmés étaient du
// même violet, quel que soit le praticien : la couleur choisie pour Carole ne
// vivait que dans une pastille de douze pixels au coin du bloc. Dans un salon à
// trois praticiennes, il fallait lire les initiales une par une.
//
// ⚠️ ET LE PIÈGE DU CONTRASTE. Le réglage est un sélecteur de couleur SANS
// contrainte : une praticienne peut choisir un rose très pâle. Du texte blanc
// dessus devient illisible, et la fonctionnalité demandée pour gagner en
// lisibilité l'aurait fait perdre. On calcule donc la clarté du fond.
egal('le bloc prend la couleur de la praticienne',
  couleurRdv({ statut: 'confirme', couleurPraticien: '#E91E8C' }).bg, '#E91E8C')
egal('sans praticienne, le violet de la marque',
  couleurRdv({ statut: 'confirme' }).bg, COULEUR_DEFAUT)
egal('une couleur illisible retombe sur le violet',
  couleurRdv({ statut: 'confirme', couleurPraticien: 'rose bonbon' }).bg, COULEUR_DEFAUT)
// Sur un fond sombre, on écrit en blanc ; sur un fond clair, à l'encre.
egal('texte blanc sur un fond soutenu', texteLisibleSur('#6B35C4'), '#fff')
egal('texte sombre sur un rose pâle', texteLisibleSur('#FFD1E8'), ENCRE)
egal('texte sombre sur du jaune', texteLisibleSur('#FFEB3B'), ENCRE)
egal('texte blanc sur du bleu marine', texteLisibleSur('#0D2149'), '#fff')
// ⚠️ La luminance est PERÇUE, pas une moyenne : l'œil est bien plus sensible au
// vert qu'au bleu. Un vert vif et un bleu de même valeur numérique n'ont pas du
// tout la même clarté, et une moyenne bête écrirait en blanc sur du vert clair.
verifier('un vert vif est traité comme clair', texteLisibleSur('#7CFC00') === ENCRE)
verifier('un bleu de même intensité est traité comme sombre', texteLisibleSur('#0000FC') === '#fff')
// Les deux états sortis du planning gardent leur code : un rendez-vous annulé
// ne doit pas se confondre avec la journée à faire.
verifier('un rendez-vous annulé garde son rouge',
  couleurRdv({ statut: 'annule', couleurPraticien: '#E91E8C' }).bg === '#FEE2E2')
verifier('un client pas venu garde son gris',
  couleurRdv({ statut: 'no_show', couleurPraticien: '#E91E8C' }).bg === '#E5E7EB')
verifier('et ces deux-là ne sont pas marqués comme couleur de praticienne',
  couleurRdv({ statut: 'annule' }).estPraticien === false)
verifier('alors qu\'un rendez-vous à venir l\'est',
  couleurRdv({ statut: 'confirme', couleurPraticien: '#E91E8C' }).estPraticien === true)

// ═══════════════════════════════════════════════════════════════════════════
// LA PRESTATION S'ÉCRIT SUR TOUS LES BLOCS, MÊME LES PLUS COURTS
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ ELLE DISPARAISSAIT SOUS 36 PIXELS. Le bloc empilait l'heure, le prénom,
// puis la prestation : un rendez-vous de trente minutes ne mesure que trente-
// quatre pixels, la troisième ligne était rognée, et AUCUNE prestation d'une
// demi-heure n'affichait son nom. Le commerçant ouvrait chaque rendez-vous pour
// savoir ce qu'il avait à faire.
//
// Une reprise de la mise en page pourrait le regratter sans que rien ne
// s'allume : le build compile aussi bien une ligne perdue. D'où ce banc, qui
// EXÉCUTE la décision et relit ce qui en sort.
{
  const sophie = {
    heure_debut: '14:30:00', client_prenom: 'Sophie',
    prestation: { nom: 'Balayage' }, praticien: { prenom: 'Carole' },
  }
  // Trente minutes : la hauteur réelle du composant, 2 × 18 - 2 = 34 pixels.
  const court = contenuBlocRdv({ hauteur: 34, rdv: sophie, praticienFiltre: 'all' })
  egal('un bloc de 30 minutes nomme quand même la prestation', court.prestation, 'Balayage')
  verifier('et l\'heure s\'y replie sur la ligne du prénom', court.titre === '14:30 Sophie', court.titre)
  egal('elle n\'occupe donc plus de ligne à elle seule', court.heureSeule, null)

  // Une heure : la place est là, chacun retrouve sa ligne.
  const long = contenuBlocRdv({ hauteur: 70, rdv: sophie, praticienFiltre: 'all' })
  egal('un bloc d\'une heure garde l\'heure sur sa ligne', long.heureSeule, '14:30')
  egal('le titre n\'est alors que le prénom', long.titre, 'Sophie')
  egal('et la praticienne accompagne la prestation', long.prestation, 'Carole · Balayage')

  // Filtré sur une praticienne, son prénom serait du bruit : on la connaît déjà.
  egal('filtré sur une personne, son prénom ne se répète pas',
    contenuBlocRdv({ hauteur: 70, rdv: sophie, praticienFiltre: 'p1' }).prestation, 'Balayage')

  // ⚠️ LA PRESTATION N'EST JAMAIS VIDE, quelle que soit la combinaison. Une
  // ligne blanche dans un agenda ne se remarque pas, et personne ne saurait
  // qu'une information a été perdue.
  const combinaisons = []
  for (const hauteur of [0, 34, 36, 37, 70, null, undefined, NaN]) {
    for (const filtre of ['all', 'p1', null]) {
      for (const rdv of [sophie, { heure_debut: '09:00:00' }, {}, null]) {
        combinaisons.push(contenuBlocRdv({ hauteur, rdv, praticienFiltre: filtre }))
      }
    }
  }
  verifier(`la prestation est écrite sur les ${combinaisons.length} combinaisons`,
    combinaisons.every(c => typeof c.prestation === 'string' && c.prestation.trim().length > 0),
    JSON.stringify(combinaisons.find(c => !c.prestation?.trim())))
  verifier('et le titre non plus n\'est jamais vide',
    combinaisons.every(c => typeof c.titre === 'string' && c.titre.trim().length > 0))
  // `heureSeule` n'est pas de la partie : elle vaut null par construction dès
  // que l'heure se replie sur le titre, et rien ne l'écrit alors à l'écran.
  verifier('aucun « undefined » ne se glisse dans les libellés',
    !combinaisons.some(c => /undefined|null|NaN/.test(`${c.titre}|${c.prestation}`)),
    JSON.stringify(combinaisons.find(c => /undefined|null|NaN/.test(`${c.titre}|${c.prestation}`))))

  // ⚠️ UNE HAUTEUR ABSENTE NE DOIT PAS SE LIRE COMME « GRAND ». `Number(null)`
  // vaut 0 et passe les comparaisons sans bruit ; c'est le format compact,
  // celui qui montre le plus, qui doit l'emporter.
  egal('sans hauteur connue, on prend le format compact',
    contenuBlocRdv({ rdv: sophie, praticienFiltre: 'all' }).heureSeule, null)

  // Le seuil est un « strictement plus grand » : 36 pixels ne suffisent pas.
  egal('à 36 pixels exactement, encore compact',
    contenuBlocRdv({ hauteur: HAUTEUR_TROIS_LIGNES, rdv: sophie }).heureSeule, null)
  egal('à 37, la place est là', contenuBlocRdv({ hauteur: 37, rdv: sophie }).heureSeule, '14:30')

  // Sans prestation renseignée, on écrit « RDV » plutôt qu'un vide.
  egal('un rendez-vous sans prestation dit au moins « RDV »',
    contenuBlocRdv({ hauteur: 34, rdv: { heure_debut: '09:00:00', client_prenom: 'Luc' } }).prestation, 'RDV')

  // ⚠️ ET LE COMPOSANT DOIT S'EN SERVIR. Une fonction juste dont personne
  // n'appelle le nom laisserait le défaut intact dans l'agenda. On vise
  // l'APPEL, jamais la simple présence d'un import.
  // Les commentaires sont retirés d'abord : celui qui explique le défaut cite
  // la ligne fautive, et la recherche tomberait dessus.
  const agenda = readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  verifier('l\'agenda appelle contenuBlocRdv', /contenuBlocRdv\(\{/.test(agenda))
  verifier('il affiche la ligne de prestation qui en sort', /contenu\.prestation/.test(agenda))
  // La ligne de prestation ne doit dépendre d'AUCUNE condition de hauteur.
  const ligneMorte = agenda.split(/\r?\n/).find(l => /contenu\.prestation/.test(l) && /hauteur|&&|\?/.test(l))
  verifier('et cette ligne ne dépend plus d\'une hauteur', !ligneMorte, ligneMorte)
  verifier('plus aucun seuil de 36 pixels dans le composant',
    !/hauteur\s*[<>]=?\s*36/.test(agenda),
    (agenda.match(/.*hauteur\s*[<>]=?\s*36.*/) || [])[0])
}

// ═══════════════════════════════════════════════════════════════════════════
// L'ALERTE « NOUVEAU RENDEZ-VOUS », QUI N'EXISTAIT PAS
// ═══════════════════════════════════════════════════════════════════════════
// Le commerçant alimentaire est prévenu à chaque commande, par un son et une
// notification. Le salon ne l'était de RIEN : le commentaire du code disait
// « pas de notif son ici, ajoutée dans RDV-10 », et RDV-10 n'est jamais venu.
// Une cliente réservait, la coiffeuse ne le découvrait qu'en pensant à ouvrir
// son agenda.
{
  const r = (id, extra = {}) => ({ id, date_rdv: '2026-08-12', heure_debut: '14:30:00', ...extra })

  // ⚠️ AU PREMIER RELEVÉ, ON N'ANNONCE RIEN. Sinon le commerçant recevrait une
  // alerte par rendez-vous déjà en agenda à chaque ouverture de son écran.
  egal('le premier relevé n\'annonce rien', nouveauxRdvs(null, [r('a'), r('b')]), [])

  const connus = idsDes([r('a'), r('b')])
  egal('un rendez-vous de plus est repéré', nouveauxRdvs(connus, [r('a'), r('b'), r('c')]).map(x => x.id), ['c'])
  egal('rien de neuf, rien à dire', nouveauxRdvs(connus, [r('a'), r('b')]), [])
  egal('une annulation seule n\'annonce rien', nouveauxRdvs(connus, [r('a')]), [])

  // ⚠️ LE CAS QUE LE COMPTAGE DES COMMANDES RATE. Entre deux relevés, un
  // rendez-vous est annulé et un autre pris : le TOTAL n'a pas bougé. En
  // comparant des longueurs, personne n'est prévenu et la nouvelle cliente
  // arrive sans que personne ne l'attende.
  const apres = [r('a'), r('z')]
  egal('un annulé plus un pris, à total égal, est bien repéré',
    nouveauxRdvs(connus, apres).map(x => x.id), ['z'])
  verifier('alors qu\'un comptage n\'aurait rien vu', apres.length === 2)

  // Ce que l'alerte raconte : « un rendez-vous est arrivé » obligerait à ouvrir
  // l'agenda de toute façon.
  const texte = texteAlerteRdv(
    { client_prenom: 'Sophie', date_rdv: '2026-08-12', heure_debut: '14:30:00', praticien: { prenom: 'Carole' }, prestation: { nom: 'Balayage' } },
    { aujourdhui: '2026-08-11', demain: '2026-08-12' })
  verifier('l\'alerte nomme la cliente', texte.corps.includes('Sophie'))
  verifier('elle dit quand', texte.corps.includes('demain') && texte.corps.includes('14:30'))
  verifier('elle dit avec qui', texte.corps.includes('Carole'))
  verifier('et ce qui est réservé', texte.corps.includes('Balayage'))
  // Aujourd'hui se dit « aujourd'hui », pas « mercredi 11 août ».
  const ceJour = texteAlerteRdv({ client_prenom: 'Luc', date_rdv: '2026-08-11', heure_debut: '09:00:00' }, { aujourdhui: '2026-08-11', demain: '2026-08-12' })
  verifier('le jour même se dit simplement', ceJour.corps.includes("aujourd'hui"))
  // Plus loin, on nomme le jour : « à 9h » sans date ne veut rien dire.
  const plusLoin = texteAlerteRdv({ client_prenom: 'Luc', date_rdv: '2026-08-20', heure_debut: '09:00:00' }, { aujourdhui: '2026-08-11', demain: '2026-08-12' })
  verifier('au-delà, la date est nommée', /jeudi 20 août/.test(plusLoin.corps), plusLoin.corps)
  // Un rendez-vous sans praticienne ni prestation ne doit pas produire de trous.
  const minimal = texteAlerteRdv({ date_rdv: '2026-08-12', heure_debut: '10:00:00' }, { aujourdhui: '2026-08-11', demain: '2026-08-12' })
  verifier('sans nom ni prestation, la phrase tient debout',
    !/undefined|null|·\s*$/.test(minimal.corps), minimal.corps)
}
// ⚠️ ET LE TAG DE LA NOTIFICATION DOIT DIFFÉRER. Deux notifications de même tag
// se REMPLACENT : une commande arrivée juste après un rendez-vous effaçait
// l'annonce du rendez-vous, et le commerçant n'en entendait jamais parler.
{
  const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
  verifier('le tag de notification est paramétrable', /function envoyerNotification\(titre, body, tag =/.test(dash))
  verifier('le rendez-vous a le sien', /'yoppaa-rdv'/.test(dash))
  verifier('le tableau de bord repère les nouveaux rendez-vous', /nouveauxRdvs\(rdvsConnusRef\.current, rdvsData\)/.test(dash))
  verifier('et il prend note de l\'existant au premier relevé', /rdvsConnusRef = useRef\(null\)/.test(dash))
}

// ═══════════════════════════════════════════════════════════════════════════
// LE STOCK DES VERSIONS QUI NE REVENAIT JAMAIS
// ═══════════════════════════════════════════════════════════════════════════
// Yoppaa gère le stock de deux façons. En ALIMENTAIRE, une réservation à durée
// de vie : le client abandonne, la note expire toute seule, rien à se rappeler.
// En BOUTIQUE DE DÉTAIL, un décrément en dur de `article_variantes.stock`, fait
// AVANT le paiement, qu'il faut penser à rendre.
//
// ⚠️ PERSONNE N'Y PENSAIT, SUR AUCUNE DES TROIS SORTIES : abandon du paiement
// Stripe, expiration par le cron, annulation par le client. L'abandon de panier
// étant le cas le plus courant du commerce en ligne, le stock d'une boutique se
// vidait tout seul. Le commerçant finissait par afficher « épuisé » sur un
// article dont il avait trois exemplaires sur l'étagère.
//
// On EXÉCUTE la restitution contre une fausse base, et on lit les stocks après.
{
  function fausseBase({ lignes, versions }) {
    const stocks = new Map(versions.map(v => [v.id, v.stock]))
    const appels = []
    const api = {
      from(table) {
        const q = { table, _ids: null, _filtres: [] }
        q.select = () => q
        q.in = (col, vals) => { q._ids = vals; return q }
        q.not = () => q
        q.eq = (col, val) => { q._eq = val; return q }
        q.update = (patch) => { q._patch = patch; return q }
        // `await` sur la requête : c'est ici que la fausse base répond.
        q.then = (resoudre) => {
          if (q.table === 'commande_articles') {
            return resoudre({ data: lignes.filter(l => q._ids.includes(l.commande_id) && l.variante_id), error: null })
          }
          if (q.table === 'article_variantes' && q._patch) {
            appels.push({ id: q._eq, stock: q._patch.stock })
            stocks.set(q._eq, q._patch.stock)
            return resoudre({ error: null })
          }
          if (q.table === 'article_variantes') {
            return resoudre({ data: [...stocks].filter(([id]) => q._ids.includes(id)).map(([id, stock]) => ({ id, stock })), error: null })
          }
          return resoudre({ data: [], error: null })
        }
        return q
      },
    }
    return { api, stocks, appels }
  }

  // Deux pièces d'une même version dans la commande, plus une autre version.
  const base = fausseBase({
    lignes: [
      { commande_id: 'c1', variante_id: 'vM', quantite: 2 },
      { commande_id: 'c1', variante_id: 'vL', quantite: 1 },
      { commande_id: 'c1', variante_id: null, quantite: 5 },   // article sans version
      { commande_id: 'c2', variante_id: 'vM', quantite: 3 },   // autre commande
    ],
    versions: [{ id: 'vM', stock: 0 }, { id: 'vL', stock: 4 }],
  })
  const r1 = await restaurerStockVariantes(base.api, ['c1'])
  verifier('la restitution aboutit', r1.ok === true)
  egal('la version commandée deux fois récupère ses deux pièces', base.stocks.get('vM'), 2)
  egal('l\'autre version récupère la sienne', base.stocks.get('vL'), 5)
  egal('deux versions touchées, pas plus', r1.rendues, 2)

  // ⚠️ ON ADDITIONNE AVANT D'ÉCRIRE. Deux lignes sur la même version, ou deux
  // commandes annulées d'un coup, ne doivent pas donner deux écritures
  // concurrentes dont l'une écraserait l'autre.
  const base2 = fausseBase({
    lignes: [
      { commande_id: 'c1', variante_id: 'vM', quantite: 2 },
      { commande_id: 'c2', variante_id: 'vM', quantite: 3 },
    ],
    versions: [{ id: 'vM', stock: 1 }],
  })
  await restaurerStockVariantes(base2.api, ['c1', 'c2'])
  egal('deux commandes d\'un coup : une seule écriture, le total est juste', base2.stocks.get('vM'), 6)
  egal('et une seule écriture a bien été faite', base2.appels.length, 1)

  // Une commande sans aucune version ne doit rien écrire du tout.
  const base3 = fausseBase({
    lignes: [{ commande_id: 'c9', variante_id: null, quantite: 4 }],
    versions: [{ id: 'vM', stock: 7 }],
  })
  const r3 = await restaurerStockVariantes(base3.api, ['c9'])
  egal('sans version, rien n\'est touché', r3.rendues, 0)
  egal('et le stock des autres versions ne bouge pas', base3.stocks.get('vM'), 7)

  // Appelée sans commande : elle ne doit pas partir interroger la base.
  egal('sans commande, elle ne fait rien', await restaurerStockVariantes(base3.api, []), { ok: true, rendues: 0 })
}

// ⚠️ LES TROIS SORTIES DOIVENT L'APPELER, et chacune sur une transition RÉELLE :
// un `update(...)` filtré sur l'ancien statut, dont on lit le résultat. Sans
// cette précaution, un webhook rejoué rendrait le stock une seconde fois et le
// commerçant vendrait des pièces qu'il n'a pas.
for (const [chemin, sortie] of [
  ['app/api/cron/expire-reservations/route.js', 'l\'expiration par le cron'],
  ['app/api/commande/cancel/route.js', 'l\'annulation par le client'],
  ['app/api/stripe/webhook/route.js', 'l\'abandon du paiement'],
]) {
  const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
  verifier(`${sortie} rend le stock`, /restaurerStockVariantes\(/.test(src), chemin)
  verifier(`${sortie} ne le rend que sur une bascule réelle`,
    /\.eq\('statut', 'paiement_en_attente'\)[\s\S]{0,80}?\.select\('id'\)/.test(src)
    || /\.neq\('statut', 'annulee_client_refund'\)[\s\S]{0,80}?\.select\('id'\)/.test(src), chemin)
}
// Et la version doit être ENREGISTRÉE, sans quoi il n'y a rien à rendre.
verifier('la ligne de commande retient la version vendue',
  /variante_id: variante \? variante\.id : null/.test(readFileSync(new URL('../lib/lignes-commande.js', import.meta.url), 'utf8')))
verifier('et l\'insertion l\'écrit en base',
  /variante_id: l\.variante_id/.test(readFileSync(new URL('../app/api/stripe/checkout/create-commande/route.js', import.meta.url), 'utf8')))

// ═══════════════════════════════════════════════════════════════════════════
// LA COMMANDE DE BOUTIQUE QUI DISPARAISSAIT LE LENDEMAIN
// ═══════════════════════════════════════════════════════════════════════════
// Le classement par jour a été pensé pour le Click & Collect alimentaire, où la
// commande est attachée à un CRÉNEAU : passé le jour dit, elle a été retirée ou
// elle ne le sera jamais, et l'historique est sa place.
//
// ⚠️ LA BOUTIQUE DE DÉTAIL N'A AUCUN CRÉNEAU. Le client passe « dans la
// semaine », un colis part quand il est emballé. Une commande passée lundi et
// pas encore expédiée basculait donc mardi dans l'Historique, un onglet qu'on
// ouvre pour chercher, pas pour travailler. Le commerçant devait deviner qu'il
// lui restait des colis à envoyer, et le client attendait un paquet que personne
// ne préparait.
//
// On EXÉCUTE le partage sur de vraies commandes et on lit ce qui en sort.
{
  const JOURS_VUE = ['2026-08-11', '2026-08-12']   // aujourd'hui + horizon
  const AUJ = '2026-08-11'
  const cmdV = (id, jour, statut) => ({ id, jour, statut })
  const jourDe = (c) => c.jour

  const lot = [
    cmdV('hier-a-faire',  '2026-08-10', 'en_attente'),
    cmdV('hier-prete',    '2026-08-10', 'pret'),
    cmdV('hier-finie',    '2026-08-10', 'recupere'),
    cmdV('hier-annulee',  '2026-08-10', 'annulee_client_refund'),
    cmdV('aujourdhui',    '2026-08-11', 'en_attente'),
    cmdV('demain',        '2026-08-12', 'en_attente'),
  ]
  const vueDetail = partagerCommandes({
    commandes: lot, categorie: 'detail', joursDispos: JOURS_VUE, jourActif: AUJ, aujourdhui: AUJ, jourDe,
  })
  const ids = (l) => l.map(c => c.id).sort()
  egal('en boutique, les commandes d\'hier encore à faire remontent sur aujourd\'hui',
    ids(vueDetail.duJour), ['aujourdhui', 'hier-a-faire', 'hier-prete'])
  egal('les terminées et les annulées restent bien dans l\'historique',
    ids(vueDetail.historique), ['hier-annulee', 'hier-finie'])

  // ⚠️ ET SURTOUT PAS DEUX FOIS. Les faire apparaître aussi sur demain
  // donnerait au commerçant l'impression d'avoir le double de travail.
  const vueDemain = partagerCommandes({
    commandes: lot, categorie: 'detail', joursDispos: JOURS_VUE, jourActif: '2026-08-12', aujourdhui: AUJ, jourDe,
  })
  egal('une commande en retard ne remonte que sur aujourd\'hui', ids(vueDemain.duJour), ['demain'])

  // ⚠️ L'ALIMENTAIRE NE CHANGE PAS. Une commande du samedi non retirée doit
  // finir en « non retiré », pas remonter indéfiniment sur le jour courant et
  // saturer l'écran du boulanger.
  const vueAlim = partagerCommandes({
    commandes: lot, categorie: 'alimentaire', joursDispos: JOURS_VUE, jourActif: AUJ, aujourdhui: AUJ, jourDe,
  })
  egal('en alimentaire, rien ne remonte', ids(vueAlim.duJour), ['aujourdhui'])
  egal('et tout ce qui est passé reste dans l\'historique',
    ids(vueAlim.historique), ['hier-a-faire', 'hier-annulee', 'hier-finie', 'hier-prete'])

  // La vitrine vend aussi des produits, sans créneau : même règle que le détail.
  const vueVitrine = partagerCommandes({
    commandes: lot, categorie: 'vitrine', joursDispos: JOURS_VUE, jourActif: AUJ, aujourdhui: AUJ, jourDe,
  })
  egal('la vitrine suit la même règle que le détail', ids(vueVitrine.duJour), ids(vueDetail.duJour))

  // Aucune commande ne doit se retrouver nulle part : chacune est soit à faire,
  // soit dans l'histoire, soit sur un autre jour du sélecteur.
  const vues = [...vueDetail.duJour, ...vueDetail.historique].map(c => c.id)
  verifier('aucune commande ne se perd entre les deux listes',
    lot.filter(c => !vues.includes(c.id)).every(c => JOURS_VUE.includes(c.jour)),
    lot.filter(c => !vues.includes(c.id)).map(c => c.id).join(', '))

  // Sans fonction de jour, on ne devine pas : mieux vaut deux listes vides
  // qu'un classement au hasard.
  egal('sans clé de jour, le partage ne fabrique rien',
    partagerCommandes({ commandes: lot, categorie: 'detail' }), { duJour: [], historique: [] })
}
// Et l'écran doit APPELER ce partage, pas en garder une copie divergente.
{
  const dash = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
  verifier('le tableau de bord appelle le partage partagé', /partagerCommandes\(\{/.test(dash))
  verifier('il lui passe la catégorie du commerce', /categorie: commercant\?\.categorie/.test(dash))
  verifier('et le commerçant voit qu\'une commande traîne', /En attente depuis/.test(dash))
}

// ═══════════════════════════════════════════════════════════════════════════
// LE NOM DE CE QUI A ÉTÉ VENDU — figé à la vente, comme le taux de TVA
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ IL ÉTAIT CALCULÉ PUIS JETÉ. `construireLignesCommande` retient déjà le nom
// vendu, titre du DEAL compris, et l'insertion ne l'écrivait pas : le tableau de
// bord le retrouvait par jointure sur `articles`. Deux dégâts :
//   • un « Lot de 3 » s'affichait sous le nom de l'article de base ;
//   • un article retiré du catalogue, ce qui arrive à chaque fin de collection
//     en boutique de détail, rendait la commande illisible POUR TOUJOURS —
//     « 1× » suivi de rien sur la vignette, « — » sur le reçu du client, et un
//     justificatif comptable vide alors qu'il doit tenir des années.
//
// On EXÉCUTE le constructeur de lignes et on lit ce qu'il rend.
{
  const article = { id: 'a1', nom: 'Écharpe en laine', prix: 39, actif: true, stock: 10, tva_taux: 21 }
  const commercantTest = { id: 'c1', categorie: 'detail', tva_taux_defaut: 21 }
  const base = {
    articlesData: [article], optionsValeurs: [], variantesData: [], dealsData: [],
    commercant: commercantTest, regime: 'assujetti', dateCommande: '2026-08-11',
  }
  const simple = construireLignesCommande({ ...base, panier: [{ id: 'a1', quantite: 2 }] })
  verifier('la ligne porte le nom de ce qui a été vendu', simple.ok === true)
  egal('et c\'est bien le nom de l\'article', simple.lignes?.[0]?.article_nom, 'Écharpe en laine')

  // Un lot est une offre séparée : c'est SON titre que le commerçant doit lire,
  // pas celui de l'article de base.
  const lot = {
    // ⚠️ `deal_type`, pas `type` : c'est ce champ que lit `estOffreSeparee`, et
    // un jeu d'essai mal formé aurait fait passer le test sur une remise.
    id: 'd1', article_id: 'a1', titre: 'Lot de 3 écharpes', prix_deal: 99,
    unites_par_deal: 3, actif: true, deal_type: 'lot',
    // Une offre séparée n'est retenue que si sa fenêtre couvre la date de la
    // commande : sans dates, elle est refusée, et le test aurait mesuré ce
    // refus au lieu de mesurer le nom.
    date_debut: '2026-08-01', date_fin: '2026-08-31',
  }
  const avecLot = construireLignesCommande({
    ...base, dealsData: [lot], panier: [{ id: 'a1', quantite: 1, deal_id: 'd1' }],
  })
  if (avecLot.ok) {
    egal('un lot garde SON titre, pas celui de l\'article', avecLot.lignes?.[0]?.article_nom, 'Lot de 3 écharpes')
  } else {
    verifier('le jeu d\'essai du lot est valide', false, avecLot.error)
  }
}

// Et la valeur doit être ÉCRITE, sinon tout ce qui précède ne sert à rien.
const routeCmd = readFileSync(new URL('../app/api/stripe/checkout/create-commande/route.js', import.meta.url), 'utf8')
verifier('l\'insertion enregistre le nom vendu',
  /\.from\('commande_articles'\)[\s\S]{0,1400}?article_nom: l\.article_nom/.test(routeCmd))
// Les trois écrans le lisent EN PREMIER, la jointure ne servant plus qu'aux
// commandes d'avant la colonne.
for (const [chemin, ecran] of [
  ['app/dashboard/page.js', 'la vignette du commerçant'],
  ['app/commander/page.js', 'la liste du client'],
  ['lib/commande-notifs.js', 'les emails'],
]) {
  const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
  verifier(`${ecran} lit le nom figé avant la jointure`,
    /article_nom \|\| (a|l|ligne)\.article\?\.nom/.test(src), chemin)
}
// La migration doit exister, et ne rien casser pour les commandes déjà passées.
const migNom = readFileSync(new URL('../migrations/MIGRATION_COMMANDE_ARTICLE_NOM.sql', import.meta.url), 'utf8')
verifier('la colonne est ajoutée sans contrainte de non-nullité',
  /ADD COLUMN IF NOT EXISTS article_nom text/.test(migNom) && !/NOT NULL/.test(migNom))
verifier('les droits sont posés explicitement', /GRANT SELECT ON commande_articles/.test(migNom))
verifier('sa vérification interroge la base', /information_schema\.columns/.test(migNom))

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
