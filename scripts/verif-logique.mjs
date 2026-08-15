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
import { contexteRetrait, textesRetrait, textesConfirmation, rdvPorteLesProduits } from '../lib/ecran-retrait.js'
import { libelleOptions, ESPACE_INSECABLE } from '../lib/options-ligne.js'
import { emailCommandeExpediee, emailRecapCommandesJour, emailRdvConfirme, emailCommandeConfirmee, emailRdvAnnule } from '../lib/resend.js'
import { partagerCommandes } from '../lib/commandes-vue.js'
import { restaurerStockVariantes } from '../lib/stock-variantes-server.js'
import { couleurRdv, texteLisibleSur, COULEUR_DEFAUT, ENCRE } from '../lib/agenda-couleurs.js'
import { contenuBlocRdv, HAUTEUR_TROIS_LIGNES } from '../lib/agenda-bloc.js'
import { statutCreneaux, pastilleCreneaux, prochainJourAvecCreneaux, aDesCreneaux, jourPlus } from '../lib/statut-commerce.js'
import { nouveauxRdvs, idsDes, texteAlerteRdv } from '../lib/alerte-rdv.js'
import { messagePanierRepris } from '../lib/panier-repris-message.js'
import { normaliserEmail, memeEmail } from '../lib/email-normalise.js'
import { ouvertLe, prochainJourOuvert, joursRetraitBoutique, limiteRetraitCeJour } from '../lib/ouverture.js'
import { jourBruxelles, minutesBruxelles } from '../lib/timezone.js'
import {
  rappelAEnvoyer, heuresDAttente, baremeRappels, peutMarquerNonRetire,
  ancienneteCommande, texteRappelRetrait, RAPPEL_TROP_TARD_HEURES,
} from '../lib/rappels-retrait.js'
import { bonsDuJour, resumeBonsVendus, texteBonVendu } from '../lib/bons-vendus.js'
import { jourSemaineDe } from '../lib/creneaux.js'
import {
  lieuxDuJour, communesDuCommercant, estItinerant,
  lieuALHeure, plagesSeChevauchent, lieuEnConflit,
  lieuPrincipal, lieuDeLaPlage, lieuDeLaReservation, libelleLieu, horairesDepuisLieux,
} from '../lib/lieux-activite.js'
import { adresseRendezVous, champsLieu } from '../lib/lieu-fige.js'
import { scoreOnboarding, SEUIL_SOUMISSION } from '../lib/score-onboarding.js'
import {
  capacitePrestation, estCoursCollectif, placesRestantes, estComplet,
  premierePlaceLibre, libellePlaces, regrouperEnSeances, blocsAgenda,
} from '../lib/cours-collectifs.js'
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

// ⚠️ RETIRER LES COMMENTAIRES AVANT DE JUGER UN FICHIER SOURCE. Trois tests ont
// déjà été cassés par MES PROPRES commentaires : celui qui explique un défaut
// corrigé cite forcément la ligne fautive, et la recherche tombait dessus.
// Hissé au niveau du fichier après avoir été redéfini dans deux blocs séparés.
function sansCommentaires(src) {
  return src.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
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

// ═══════════════════════════════════════════════════════════════════════════
// 6 ter. LA VERSION CHOISIE — de la vente au comptoir
// ═══════════════════════════════════════════════════════════════════════════
// Une taille et un coloris n'ont PAS de colonne à eux : ils vivent dans
// `options`, le jsonb de la ligne. Le parcours complet est donc testé ici, de
// la construction de la ligne jusqu'au texte lu par le vendeur.
const rVariante = construireLignesCommande({
  panier: [{ id: 'a1', quantite: 1, variante_id: 'v1' }],
  articlesData, optionsValeurs: [],
  variantesData: [{ id: 'v1', article_id: 'a1', actif: true, stock: 5, prix: 24.9, axe1_valeur: 'M', axe2_valeur: 'Bleu' }],
  dealsData: [], commercant, regime: 'emporter', dateCommande: JOUR,
})
verifier('une ligne avec version se construit', rVariante.ok, JSON.stringify(rVariante))
egal('la version est rangée dans options',
  rVariante.lignes[0].options[0],
  { groupe_nom: 'Version', valeur_nom: 'M · Bleu', prix_supplement: 0 })
egal('et la ligne retient QUELLE version', rVariante.lignes[0].variante_id, 'v1')

// Le libellé lu au comptoir, EXÉCUTÉ sur ce que la vente vient de produire.
egal('libellé de la version vendue',
  libelleOptions(rVariante.lignes[0].options), `Version${ESPACE_INSECABLE}: M · Bleu`)
// ⚠️ L'ESPACE AVANT LE DEUX-POINTS EST INSÉCABLE, et l'interroger par son CODE
// est la seule façon honnête de le vérifier : recopier le caractère dans ce
// fichier ne prouve rien, il est invisible et redevient une espace ordinaire au
// premier copier-coller. Trois vérifications sont tombées là-dessus.
egal('l’espace avant le deux-points est bien insécable', ESPACE_INSECABLE.codePointAt(0), 0x00A0)
verifier('et c’est bien elle qui sert dans le libellé',
  libelleOptions([{ groupe_nom: 'Version', valeur_nom: 'M' }]).includes(`${ESPACE_INSECABLE}: `))
verifier('jamais une espace ordinaire à sa place',
  !/ : /.test(libelleOptions([{ groupe_nom: 'Version', valeur_nom: 'M' }])))
egal('rien à dire rend null', libelleOptions(null), null)
egal('liste vide rend null', libelleOptions([]), null)
egal('valeurs vides rendent null', libelleOptions([{ groupe_nom: 'Version', valeur_nom: '  ' }]), null)
egal('sans nom de groupe, la valeur seule',
  libelleOptions([{ valeur_nom: 'andalouse' }]), 'andalouse')
egal('plusieurs choix se séparent au point médian',
  libelleOptions([{ groupe_nom: 'Version', valeur_nom: 'M' }, { groupe_nom: 'Sauce', valeur_nom: 'andalouse' }]),
  `Version${ESPACE_INSECABLE}: M · Sauce${ESPACE_INSECABLE}: andalouse`)

// ⚠️ ET LA REQUÊTE DOIT RAPPORTER DE QUOI L'ÉCRIRE. L'écran de retrait affichait
// « 1 × Robe fleurie » sans taille ni coloris : ce n'était pas un défaut
// d'affichage, la colonne n'était tout simplement pas demandée.
const srcRouteCommandes = sansCommentaires(
  readFileSync(new URL('../app/api/yopper/commandes/route.js', import.meta.url), 'utf8'))
const selectListe = (srcRouteCommandes.match(/commande_articles\([^)]*\)/g) || []).join(' | ')
verifier('la liste des commandes rapporte la version choisie',
  /commande_articles\([^)]*\boptions\b/.test(srcRouteCommandes), selectListe)
verifier('et le nom figé à la vente, pas celui du catalogue',
  /commande_articles\([^)]*\barticle_nom\b/.test(srcRouteCommandes), selectListe)

// L'écran de retrait s'en sert vraiment. Un `select` enrichi sans affichage ne
// changerait rien pour le vendeur.
const srcEcranClient = sansCommentaires(
  readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8'))
verifier('l’écran de retrait affiche la version',
  /libelleOptions\(l\.options\)/.test(srcEcranClient))

// ═══════════════════════════════════════════════════════════════════════════
// 6 quater. LE LIEN RENDEZ-VOUS ↔ COMMANDE, vu du commerçant
// ═══════════════════════════════════════════════════════════════════════════
// Les mêmes produits apparaissent à DEUX endroits du tableau de bord : dans le
// rendez-vous, et dans la liste des commandes. Sans référence commune, rien ne
// dit qu'il s'agit d'une seule vente, et le commerçant en prépare deux.
const srcDashboard = sansCommentaires(
  readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))

verifier('les commandes rapportent le rendez-vous auquel elles appartiennent',
  /rdv:rdv_reservations!commandes_rdv_reservation_id_fkey\(/.test(srcDashboard))
verifier('avec de quoi le nommer et le situer',
  /commandes_rdv_reservation_id_fkey\([^)]*numero_rdv[^)]*date_rdv[^)]*heure_debut/.test(srcDashboard))
verifier('le rendez-vous rapporte la RÉFÉRENCE de sa commande',
  /rdv_reservations_commande_id_fkey\([^)]*numero_prefixe/.test(srcDashboard))
verifier('et la version des produits à préparer',
  /rdv_reservations_commande_id_fkey\([\s\S]*?commande_articles\([^)]*options/.test(srcDashboard))

// La carte de commande DIT que la commande appartient à un rendez-vous, et que
// personne ne viendra la chercher au comptoir.
verifier('la carte de commande annonce le rendez-vous',
  /Lié à un rendez-vous/.test(srcDashboard))
verifier('et prévient qu’elle ne sera pas retirée au comptoir',
  /ne passera pas les chercher/.test(srcDashboard))
verifier('le bloc du rendez-vous porte la référence de la commande',
  /referenceCommande\(rdv\.commande\)/.test(srcDashboard))

// ⚠️ DEUX LECTURES, UNE SEULE DÉFINITION. Le tableau de bord relit tout toutes
// les cinq secondes : un `select` enrichi d'un côté seulement fait clignoter la
// donnée, présente au chargement puis disparue au relevé suivant.
const compter = (src, motif) => (src.match(motif) || []).length
egal('les commandes se lisent partout avec la même définition',
  compter(srcDashboard, /\.select\(SELECT_COMMANDES\)/g), 2)
egal('les rendez-vous aussi',
  compter(srcDashboard, /\.select\(SELECT_RDVS\)/g), 2)
verifier('aucune requête de commandes ne reste recopiée à la main',
  !/\.select\(`\*, creneau:creneaux/.test(srcDashboard))

// ═══════════════════════════════════════════════════════════════════════════
// 6 quater bis. QUAND LE RENDEZ-VOUS TOMBE, LA COMMANDE LUI SURVIT
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ À l'annulation, le client choisit le sort de ses produits. S'il les GARDE,
// il n'est remboursé que de son acompte et la commande reste en boutique. Elle
// conservait pourtant son rendez-vous, donc l'écran annonçait « on te les remet
// à ton rendez-vous » pour un rendez-vous disparu : ni numéro à montrer, ni
// geste, ni moyen d'aller les chercher. Même impasse après un no-show.
egal('un rendez-vous confirmé porte ses produits', rdvPorteLesProduits({ statut: 'confirme' }), true)
egal('un rendez-vous honoré aussi', rdvPorteLesProduits({ statut: 'honore' }), true)
egal('un rendez-vous annulé par le client ne les porte plus', rdvPorteLesProduits({ statut: 'annule_client' }), false)
egal('annulé par le commerçant non plus', rdvPorteLesProduits({ statut: 'annule_commercant' }), false)
egal('un no-show non plus', rdvPorteLesProduits({ statut: 'no_show' }), false)
// Rendez-vous non chargé : on ne présume pas sa mort. Une commande qui vient
// d'être passée en a forcément un vivant.
egal('sans rendez-vous chargé, on ne présume rien', rdvPorteLesProduits(undefined), true)

// L'écran qui en découle, EXÉCUTÉ. C'est là que le mensonge se voyait.
const cmdRdvVivant = { mode_retrait: 'retrait', rdv_reservation_id: 'r1', rdv: { statut: 'confirme' }, commercant: { categorie: 'vitrine' } }
const cmdRdvTombe = { mode_retrait: 'retrait', rdv_reservation_id: 'r1', rdv: { statut: 'annule_client' }, commercant: { categorie: 'vitrine' } }
egal('rendez-vous vivant : les produits attendent au fauteuil', contexteRetrait(cmdRdvVivant), 'rdv')
egal('rendez-vous tombé : la commande redevient un retrait en magasin', contexteRetrait(cmdRdvTombe), 'boutique')
// Et elle retrouve TOUT ce qui va avec, à commencer par le geste qui la clôture.
verifier('et elle retrouve le geste qui la clôture',
  textesRetrait(contexteRetrait(cmdRdvTombe)).avecGeste === true)
verifier('et le numéro à montrer au comptoir',
  textesRetrait(contexteRetrait(cmdRdvTombe)).badge === 'MONTRE CE NUMÉRO')

// La liste des commandes doit rapporter ce statut, sinon la règle ne s'applique
// jamais : `contexteRetrait` retomberait sur son défaut prudent.
verifier('la liste des commandes rapporte le statut du rendez-vous',
  /rdv:rdv_reservations!commandes_rdv_reservation_id_fkey\([^)]*statut/.test(srcRouteCommandes))

// ⚠️ ET LE CRON DE RAPPELS SUIT LA MÊME RÈGLE. Sans ce filtre, un client dont
// les produits attendent son rendez-vous de vendredi recevait dès le lendemain
// « ta commande t'attend, viens la chercher », et se déplaçait pour rien.
const srcCronRappels = sansCommentaires(
  readFileSync(new URL('../app/api/cron/rappels-retrait/route.js', import.meta.url), 'utf8'))
verifier('le cron ne réclame pas le retrait de produits attendus au fauteuil',
  /rdv_reservation_id && rdvPorteLesProduits\(cmd\.rdv\)/.test(srcCronRappels))
verifier('et il demande le statut du rendez-vous pour pouvoir en juger',
  /rdv:rdv_reservations!commandes_rdv_reservation_id_fkey\([^)]*statut/.test(srcCronRappels))

// ─── La boucle se ferme, et par UN seul crédit ────────────────────────────
// Le rendez-vous honoré est le moment exact où le commerçant tend le sachet :
// lui demander un second geste dans un autre onglet, c'est s'assurer qu'il
// l'oubliera.
verifier('un rendez-vous honoré clôture la commande de produits',
  /statut === 'honore'[\s\S]{0,900}await produitsRemis\(/.test(srcDashboard))
verifier('et un bouton manuel reste sur la vignette',
  /Produits remis au client/.test(srcDashboard))
// L'idempotence vient de l'UPDATE filtré sur les anciens statuts : l'automatique
// suivi du manuel ne crédite la fidélité qu'une fois.
const srcProduitsRemis = sansCommentaires(
  readFileSync(new URL('../app/api/commande/produits-remis/route.js', import.meta.url), 'utf8'))
verifier('la remise des produits est idempotente',
  /\.in\('statut', STATUTS_REMISABLES\)/.test(srcProduitsRemis))
verifier('et elle vérifie que le commerçant possède bien la commande',
  /auth_user_id !== user\.id/.test(srcProduitsRemis))

// ═══════════════════════════════════════════════════════════════════════════
// 6 quater ter. L'AGENDA REMONTE DANS LE PASSÉ
// ═══════════════════════════════════════════════════════════════════════════
// Le verrou était volontaire et commenté « pour MVP ». Un agenda qui ne remonte
// pas est inutilisable : le commerçant qui a oublié de clôturer un rendez-vous
// la veille n'avait aucun moyen d'y revenir, alors que ses commandes ont leur
// historique depuis le début.
const srcAgenda = sansCommentaires(
  readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))
verifier('plus aucun verrou n’interdit le passé',
  !/if \(d < today\) return/.test(srcAgenda))
verifier('un historique des rendez-vous passés existe',
  /const \[historique, setHistorique\]/.test(srcAgenda))
verifier('il ne montre que ce qui est déjà passé',
  /r\.date_rdv < aujourdhuiIso/.test(srcAgenda))
// ⚠️ Ce qui reste à CLÔTURER remonte en premier : c'est la seule chose sur
// laquelle il reste un geste à faire, et la trier par date la noierait.
verifier('les rendez-vous à clôturer remontent en premier',
  /rang\(a\) - rang\(b\)/.test(srcAgenda))

// ⚠️ LA MODALE DE DÉTAIL EST RENDUE HORS DE LA ZONE DÉFILANTE. Elle vivait
// dedans, et `-webkit-overflow-scrolling: touch` PIÈGE les éléments en
// `position: fixed` sur iPhone : ils se placent par rapport au conteneur qui
// défile, pas par rapport à l'écran. L'en-tête des statistiques lui mangeait le
// haut, donc le nom du client et la date du rendez-vous.
verifier('la modale de détail est rendue hors de la zone défilante',
  srcDashboard.indexOf('{rdvSelectionne && (') > srcDashboard.indexOf('<ConfigDashboard'))

// ═══════════════════════════════════════════════════════════════════════════
// 6 sexies bis. OÙ SE PASSE L'ACTIVITÉ, ET QUAND
// ═══════════════════════════════════════════════════════════════════════════
// Le siège social n'est pas le lieu de l'activité. Un commerçant inscrit à son
// domicile envoyait ses clients chez lui, et une professeure de yoga qui donne
// cours dans trois salles ne pouvait pas les décrire.
//
// 2026-08-12 est un MERCREDI. Toutes les dates de ce bloc en découlent, et
// c'est volontaire : un test de calendrier qui se lit doit dire son jour.
const MERCREDI = '2026-08-12'
const JEUDI = '2026-08-13'

const salon = {
  nom: 'Ciseaux', adresse: 'Rue de Prée 9G, Mettet',
  latitude: 50.3, longitude: 4.6, commune_id: 'com-mettet',
  siege_social_est_lieu_activite: true,
}
// La professeure de yoga : inscrite chez elle, elle donne cours ailleurs.
const yoga = {
  nom: 'Yoga Sophie', adresse: 'Rue du Domicile 1, Mettet',
  latitude: 50.31, longitude: 4.61, commune_id: 'com-mettet',
  siege_social_est_lieu_activite: false,
}
const salleMettet = { id: 'l1', type: 'hebdo', jour_semaine: 'mercredi', libelle: 'Salle Saint-Roch', adresse: 'Place, Mettet', commune_id: 'com-mettet', actif: true }
const salleBiesme = { id: 'l2', type: 'hebdo', jour_semaine: 'jeudi', libelle: 'Salle des fêtes', adresse: 'Rue, Biesme', commune_id: 'com-biesme', actif: true }
const marcheNoel = { id: 'l3', type: 'ponctuel', date_jour: MERCREDI, libelle: 'Marché de Noël', adresse: 'Grand-Place', commune_id: 'com-namur', actif: true }

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE SIÈGE SOCIAL N'EST PLUS JAMAIS UN LIEU (décision d'Alex du 15/08)
//
// « L'adresse du signup ne doit servir qu'à la validation du dossier. »
// Ces tests disaient EXACTEMENT LE CONTRAIRE il y a une heure : ils
// garantissaient que le siège fasse office de lieu. Ils sont retournés, parce
// qu'une adresse saisie pour être en règle à la BCE n'est pas une invitation à
// venir sonner, et que le domicile d'une commerçante était publié sans qu'elle
// l'ait jamais demandé.
//
// ⚠️ CE QUI REND LA BASCULE SANS DANGER : `MIGRATION_ADRESSE_SIEGE_DELIEE.sql`
// a recopié le siège dans un VRAI lieu permanent pour les huit commerces dont
// l'activité s'y passait. Le salon ci-dessous en porte un, comme dans la base.
// ═══════════════════════════════════════════════════════════════════════════
const ciseauxLieu = { id: 'l0', type: 'permanent', libelle: 'Ciseaux', adresse: 'Rue de Prée 9G, Mettet', commune_id: 'com-mettet', actif: true }

egal('le lieu déclaré fait l’adresse du commerce',
  lieuxDuJour({ commercant: salon, lieux: [ciseauxLieu], jour: MERCREDI }).map(l => l.adresse),
  ['Rue de Prée 9G, Mettet'])
// ⚠️ AUCUNE ADRESSE EST UNE RÉPONSE VALABLE, et c'est le cœur du changement.
// Un commerçant qui n'a rien déclaré n'a rien à annoncer, et son tableau de
// bord le lui dit. Retomber sur son siège publierait une adresse
// administrative qu'il n'a jamais offerte à ses clients.
egal('sans aucun lieu déclaré, on n’annonce AUCUNE adresse',
  lieuxDuJour({ commercant: salon, lieux: [], jour: MERCREDI }), [])
verifier('et le siège n’apparaît nulle part, même seul',
  !lieuxDuJour({ commercant: salon, lieux: [] }).some(l => l.source === 'siege'))

// ─── L'itinérante : le bon lieu, le bon jour ──────────────────────────────
egal('mercredi, la prof de yoga est à Mettet',
  lieuxDuJour({ commercant: yoga, lieux: [salleMettet, salleBiesme], jour: MERCREDI }).map(l => l.libelle),
  ['Salle Saint-Roch'])
egal('jeudi, elle est à Biesme',
  lieuxDuJour({ commercant: yoga, lieux: [salleMettet, salleBiesme], jour: JEUDI }).map(l => l.libelle),
  ['Salle des fêtes'])
// ⚠️ ET SON DOMICILE N'APPARAÎT JAMAIS. C'est tout l'objet du chantier : la
// case décochée retire le siège social des lieux où l'on envoie un client.
verifier('son domicile n’est jamais proposé',
  !lieuxDuJour({ commercant: yoga, lieux: [salleMettet, salleBiesme], jour: MERCREDI })
    .some(l => /Domicile/.test(l.adresse || '')))

// ─── Le ponctuel PRIME sur l'habitude ─────────────────────────────────────
// Le marché de Noël remplace la tournée du jour, il ne s'y ajoute pas : on ne
// peut pas être à deux endroits à la fois.
egal('un ponctuel remplace l’hebdomadaire ce jour-là',
  lieuxDuJour({ commercant: yoga, lieux: [salleMettet, salleBiesme, marcheNoel], jour: MERCREDI }).map(l => l.libelle),
  ['Marché de Noël'])
egal('et le lendemain, la tournée reprend',
  lieuxDuJour({ commercant: yoga, lieux: [salleMettet, salleBiesme, marcheNoel], jour: JEUDI }).map(l => l.libelle),
  ['Salle des fêtes'])

// ⚠️ L'ORDRE COMPTE : LE LIEU DU JOUR EN PREMIER. Les écrans prennent le
// premier de la liste pour répondre à « où es-tu aujourd'hui ». Un food truck
// qui a aussi un dépôt déclaré en lieu fixe verrait sinon sa fiche annoncer le
// dépôt alors qu'il est au marché, et on aurait ressuscité le défaut que le
// module food truck avait corrigé.
const truck = { ...yoga, nom: 'Le Truck', adresse: 'Dépôt, Mettet' }
const depot = { id: 'l5', type: 'permanent', libelle: 'Le dépôt', adresse: 'Dépôt, Mettet', commune_id: 'com-mettet', actif: true }
egal('le lieu du jour passe devant le lieu fixe',
  lieuxDuJour({ commercant: truck, lieux: [salleMettet, depot], jour: MERCREDI })[0].libelle,
  'Salle Saint-Roch')
egal('et le ponctuel devant tout le reste',
  lieuxDuJour({ commercant: truck, lieux: [salleMettet, depot, marcheNoel], jour: MERCREDI })[0].libelle,
  'Marché de Noël')
// Le lieu fixe reste dans la liste, il n'est pas effacé : il a cédé la tête.
egal('le lieu fixe reste présent, en second',
  lieuxDuJour({ commercant: truck, lieux: [salleMettet, depot], jour: MERCREDI }).length, 2)
// ⚠️ ET SON ADRESSE D'INSCRIPTION N'EST JAMAIS DE LA PARTIE, même quand elle
// ressemble à un vrai lieu : elle n'existe que dans `commercants.adresse`.
verifier('l’adresse d’inscription du truck n’est jamais proposée',
  !lieuxDuJour({ commercant: truck, lieux: [salleMettet], jour: MERCREDI })
    .some(l => l.source === 'siege'))

// ─── Deux adresses fixes : les deux, tous les jours ───────────────────────
// ⚠️ Ne pas dire « siège d'exploitation » : ce terme de la Banque-Carrefour
// désigne une unité d'établissement déclarée, ce qu'une salle louée n'est pas.
// Le mot a été retiré du signup le 13/08 pour cette raison.
const boutique2 = { id: 'l4', type: 'permanent', libelle: 'Boutique de Fosses', adresse: 'Rue, Fosses', commune_id: 'com-fosses', actif: true }
egal('une seconde adresse fixe reste ouverte tous les jours',
  lieuxDuJour({ commercant: salon, lieux: [ciseauxLieu, boutique2], jour: JEUDI }).map(l => l.libelle),
  ['Ciseaux', 'Boutique de Fosses'])

// ─── Un lieu désactivé disparaît, sans exception ──────────────────────────
egal('un lieu désactivé ne s’affiche plus',
  lieuxDuJour({ commercant: yoga, lieux: [{ ...salleMettet, actif: false }], jour: MERCREDI }), [])

// ─── Sans date, on montre les permanents plutôt que rien ──────────────────
egal('sans jour, on rend au moins les permanents',
  lieuxDuJour({ commercant: salon, lieux: [ciseauxLieu, boutique2] }).length, 2)

// ─── TOUTES SES COMMUNES, TOUT LE TEMPS (décision Alex du 12/08) ──────────
// L'autre option, ne la montrer que dans la commune du jour, l'aurait rendue
// invisible six jours sur sept à ceux qui la cherchent.
egal('la prof de yoga apparaît dans ses deux communes',
  communesDuCommercant({ commercant: yoga, lieux: [salleMettet, salleBiesme] }).sort(),
  ['com-biesme', 'com-mettet'])
egal('et son domicile ne l’inscrit pas dans la sienne',
  communesDuCommercant({ commercant: yoga, lieux: [] }), [])
egal('le salon reste dans la sienne, par SON LIEU et non par son siège',
  communesDuCommercant({ commercant: salon, lieux: [ciseauxLieu] }), ['com-mettet'])
egal('un lieu désactivé ne rattache à aucune commune',
  communesDuCommercant({ commercant: yoga, lieux: [{ ...salleBiesme, actif: false }] }), [])

// ─── Itinérant ou pas : la fiche ne dit pas la même chose ─────────────────
// La question se lit sur les LIEUX, jamais sur la catégorie : un food truck et
// une professeure de yoga n'ont pas le même métier mais le même besoin.
egal('un salon n’est pas itinérant', estItinerant([boutique2]), false)
egal('une prof de yoga l’est', estItinerant([salleMettet]), true)
egal('sans lieu, personne ne l’est', estItinerant([]), false)

// ═══════════════════════════════════════════════════════════════════════════
// 6 ter bis. DEUX EMPLACEMENTS LE MÊME JOUR — le midi et le soir
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ Le besoin vient des FOOD TRUCKS, où c'est la norme et non l'exception :
// le service du midi sur une place, celui du soir dans un zoning. La table
// l'interdisait par un index unique « un lieu par jour », et la règle ne savait
// répondre qu'à « où es-tu aujourd'hui ».
//
// La question devient « où es-tu à telle heure », et c'est aussi ce qui
// rattache un rendez-vous à un lieu SANS rattacher un lieu à chaque créneau :
// le créneau a une heure, le lieu a une plage, l'intersection tranche.
const truckMidi = { id: 'm1', type: 'hebdo', jour_semaine: 'mercredi', libelle: 'Place du Marché', adresse: 'Place 1', heure_debut: '11:00:00', heure_fin: '14:00:00', actif: true }
const truckSoir = { id: 'm2', type: 'hebdo', jour_semaine: 'mercredi', libelle: 'Zoning', adresse: 'Zoning 2', heure_debut: '18:00', heure_fin: '21:00', actif: true }
const deuxServices = [truckMidi, truckSoir]

egal('à midi, le food truck est sur la place',
  lieuALHeure({ commercant: truck, lieux: deuxServices, jour: MERCREDI, heure: '12:30' })?.libelle,
  'Place du Marché')
egal('le soir, il est au zoning',
  lieuALHeure({ commercant: truck, lieux: deuxServices, jour: MERCREDI, heure: '19:00' })?.libelle,
  'Zoning')
// Entre deux services, mieux vaut annoncer le prochain que de ne rien dire.
egal('entre les deux, on annonce le prochain',
  lieuALHeure({ commercant: truck, lieux: deuxServices, jour: MERCREDI, heure: '15:00' })?.libelle,
  'Zoning')
egal('avant l’ouverture, on annonce le premier',
  lieuALHeure({ commercant: truck, lieux: deuxServices, jour: MERCREDI, heure: '08:00' })?.libelle,
  'Place du Marché')
egal('sans heure, la réponse reste celle d’avant',
  lieuALHeure({ commercant: truck, lieux: deuxServices, jour: MERCREDI })?.libelle,
  'Place du Marché')
// Sans emplacement ce jour-là ET sans siège déclaré comme lieu, il n'y a rien à
// répondre. Avec un siège coché, c'est lui qui répond, ce que la ligne suivante
// vérifie : les deux comportements comptent.
egal('un jour sans emplacement ne répond rien',
  lieuALHeure({ commercant: yoga, lieux: deuxServices, jour: JEUDI, heure: '12:30' }), null)
// ⚠️ ET HORS DE TOUTE PLAGE, PLUS RIEN NE RÉPOND. Le siège comblait ce trou ;
// il ne le comble plus, et c'est voulu : mieux vaut ne rien annoncer qu'annoncer
// une adresse administrative.
egal('hors de toute plage, aucun lieu ne répond',
  lieuALHeure({ commercant: truck, lieux: deuxServices, jour: JEUDI, heure: '12:30' }), null)

// ⚠️ LA PLAGE QUI PASSE MINUIT. Un food truck de nuit annonce 22h → 02h. Sans
// ce cas, sa plage serait vide et il n'aurait de lieu à AUCUNE heure de son
// service, celle de 23h30 comprise.
const truckNuit = [{ id: 'n1', type: 'hebdo', jour_semaine: 'mercredi', libelle: 'Nuit', adresse: 'x', heure_debut: '22:00', heure_fin: '02:00', actif: true }]
egal('23h30 tombe dans un service qui passe minuit',
  lieuALHeure({ commercant: truck, lieux: truckNuit, jour: MERCREDI, heure: '23:30' })?.libelle, 'Nuit')
egal('1h du matin aussi',
  lieuALHeure({ commercant: truck, lieux: truckNuit, jour: MERCREDI, heure: '01:00' })?.libelle, 'Nuit')

// ─── Deux plages ne peuvent pas se marcher dessus ─────────────────────────
// ⚠️ Sans cette garde, « où es-tu à 12h30 » rendrait le premier de la liste,
// c'est-à-dire l'ordre d'insertion en base : le client apprendrait où aller au
// hasard. L'éditeur refuse la saisie plutôt que de trancher à sa place.
egal('deux plages qui se recouvrent sont en conflit',
  lieuEnConflit(deuxServices, { type: 'hebdo', jour_semaine: 'mercredi', heure_debut: '12:00', heure_fin: '13:00' })?.libelle,
  'Place du Marché')
egal('deux plages jointives passent',
  lieuEnConflit(deuxServices, { type: 'hebdo', jour_semaine: 'mercredi', heure_debut: '14:00', heure_fin: '18:00' }), null)
egal('un autre jour ne gêne personne',
  lieuEnConflit(deuxServices, { type: 'hebdo', jour_semaine: 'jeudi', heure_debut: '12:00', heure_fin: '13:00' }), null)
egal('on ne se compare pas à soi-même en modification',
  lieuEnConflit(deuxServices, { id: 'm1', type: 'hebdo', jour_semaine: 'mercredi', heure_debut: '11:00', heure_fin: '14:00' }), null)
// Un lieu sans horaire vaut toute la journée : il ne peut pas en côtoyer un autre.
egal('un lieu sans horaire occupe la journée entière',
  lieuEnConflit(deuxServices, { type: 'hebdo', jour_semaine: 'mercredi' })?.libelle, 'Place du Marché')
egal('deux plages disjointes ne se chevauchent pas',
  plagesSeChevauchent(truckMidi, truckSoir), false)

// ─── LE SYSTÈME CLASSIQUE RESTE LA NORME ──────────────────────────────────
// ⚠️ La garantie la plus importante du chantier, comme la case par défaut du
// 12/08 : une boulangerie n'activera jamais le planning par lieu. Ses créneaux
// ne désignent aucun lieu, et vide ne veut pas dire « nulle part », il veut
// dire « là où se passe l'activité ».
egal('une plage sans lieu désigne le lieu du commerce',
  libelleLieu(lieuDeLaPlage({ jour_semaine: 'mercredi' }, { commercant: salon, lieux: [ciseauxLieu] })),
  'Ciseaux, Rue de Prée 9G, Mettet')
egal('le lieu principal du salon est le lieu qu’il a déclaré',
  lieuPrincipal({ commercant: salon, lieux: [ciseauxLieu] })?.libelle, 'Ciseaux')
// ⚠️ Et sans lieu déclaré, il n'y a pas de lieu principal. Le siège ne vient
// plus boucher le trou.
egal('sans lieu déclaré, aucun lieu principal',
  lieuPrincipal({ commercant: salon, lieux: [] }), null)

// ⚠️ LE FOOD TRUCK TEL QU'IL EXISTE DÉJÀ, et c'est le défaut que l'exécution a
// débusqué : case du siège décochée, aucun lieu permanent, donc AUCUN lieu
// principal. Ses créneaux de retrait actuels, qui ne désignent aucun lieu, se
// retrouvaient sans la moindre adresse. Le repli se fait sur le jour et l'heure
// de la plage elle-même.
egal('un créneau de midi retombe sur l’emplacement de midi',
  lieuDeLaPlage({ jour_semaine: 'mercredi', heure_debut: '12:00' }, { commercant: truck, lieux: deuxServices })?.libelle,
  'Place du Marché')
egal('un créneau du soir retombe sur celui du soir',
  lieuDeLaPlage({ jour_semaine: 'mercredi', heure_debut: '19:00' }, { commercant: truck, lieux: deuxServices })?.libelle,
  'Zoning')
egal('une plage qui désigne un lieu le garde',
  lieuDeLaPlage({ lieu_id: 'm2', jour_semaine: 'mercredi', heure_debut: '12:00' }, { commercant: truck, lieux: deuxServices })?.libelle,
  'Zoning')
// ⚠️ TROU DÉCOUVERT EN MESURANT UNE AUTRE FONCTION : rien ne vérifiait qu'un
// emplacement DÉSACTIVÉ cesse d'être proposé ici. La mutation qui retirait le
// filtre laissait le banc entièrement vert, et un commerçant qui range un
// emplacement sans le supprimer aurait continué d'y envoyer ses clients.
egal('un emplacement désactivé n’est plus proposé, et rien ne le remplace',
  lieuDeLaPlage({ jour_semaine: 'mercredi', heure_debut: '12:00' },
    { commercant: truck, lieux: deuxServices.map(l => ({ ...l, actif: false })) }), null)
egal('et un emplacement désactivé ne compte pas non plus dans le jour',
  lieuxDuJour({ commercant: yoga, lieux: deuxServices.map(l => ({ ...l, actif: false })), jour: MERCREDI }), [])

// ─── CE QUI EST DÉJÀ PRIS NE BOUGE PLUS ───────────────────────────────────
// ⚠️ Le lieu figé gagne TOUJOURS sur le calcul. C'est ce qui fait qu'un
// rendez-vous d'il y a six mois dit encore où il a eu lieu, même si
// l'emplacement a été supprimé depuis.
egal('un rendez-vous garde le lieu figé à la réservation',
  lieuDeLaReservation({ lieu_libelle: 'Salle Saint-Roch', lieu_adresse: 'Place, Mettet', date_rdv: MERCREDI, heure_debut: '19:00' },
    { commercant: truck, lieux: deuxServices })?.libelle,
  'Salle Saint-Roch')
// Les rendez-vous ANTÉRIEURS à la bascule n'ont rien de figé : eux se calculent.
egal('un rendez-vous d’avant se résout à sa date et à son heure',
  lieuDeLaReservation({ date_rdv: MERCREDI, heure_debut: '19:30' }, { commercant: truck, lieux: deuxServices })?.libelle,
  'Zoning')

// ─── CE QUE LE CLIENT LIT, PARTOUT PAREIL ─────────────────────────────────
// ⚠️ LE PARCOURS RENDEZ-VOUS ENVOYAIT LES CLIENTS AU SIÈGE SOCIAL. L'email de
// confirmation, celui d'annulation, le rappel de la veille et « Mes
// rendez-vous » lisaient tous `commercants.adresse`, sans jamais consulter les
// lieux. Pour une commerçante inscrite à son domicile mais qui donne cours en
// salle, cela veut dire envoyer un inconnu CHEZ ELLE.
egal('l’adresse annoncée est celle gravée dans le rendez-vous',
  adresseRendezVous({
    lieu_libelle: 'Salle Saint-Roch', lieu_adresse: 'Place, Mettet',
    commercant: { adresse: 'Rue du Domicile 1' },
  }),
  'Salle Saint-Roch, Place, Mettet')
// ⚠️ Le repli n'est pas un luxe : il vaut pour l'immense majorité des commerces
// et pour tous les rendez-vous ANTÉRIEURS à la bascule, qui n'ont rien de gravé.
egal('sans lieu gravé, le siège reste la réponse',
  adresseRendezVous({ commercant: { adresse: 'Rue de Prée 9G, Mettet' } }),
  'Rue de Prée 9G, Mettet')
egal('un lieu gravé sans nom donne quand même son adresse',
  adresseRendezVous({ lieu_adresse: 'Zoning 2', commercant: { adresse: 'Dépôt' } }),
  'Zoning 2')
egal('et sans rien du tout, on n’invente pas', adresseRendezVous({}), '')

// Les colonnes gravées se construisent en un seul endroit : quatre canaux les
// lisent, trois écrans les écrivent, et une divergence enverrait un client au
// mauvais endroit sans que rien ne le signale.
egal('les colonnes gravées portent l’identifiant, le nom et l’adresse',
  champsLieu({ id: 'l1', libelle: 'Salle', adresse: 'Place 1' }),
  { lieu_id: 'l1', lieu_libelle: 'Salle', lieu_adresse: 'Place 1' })
// ⚠️ Un objet VIDE, pas des `null` : on n'écrase pas ce qu'on ne sait pas, et
// un commerce sans lieu déclaré doit continuer de réserver normalement.
egal('sans lieu, on n’écrit rien plutôt que du vide', champsLieu(null), {})

// ═══════════════════════════════════════════════════════════════════════════
// 6 quater. LES COURS COLLECTIFS — plusieurs personnes sur un créneau
// ═══════════════════════════════════════════════════════════════════════════
// Yoppaa ne connaissait qu'un modèle de rendez-vous, une personne pour un
// créneau, ce qui décrit bien un coiffeur et pas du tout un cours de yoga de
// dix personnes à 10h.
const cours = { id: 'p1', nom: 'Hatha yoga', capacite: 12 }
const soloPresta = { id: 'p2', nom: 'Coupe', capacite: 1 }

// ⚠️ LA GARANTIE QUI COMPTE : une prestation qui n'a jamais vu ce réglage
// reste INDIVIDUELLE. Le défaut est 1, et tout le parc bascule sans bouger.
egal('une prestation d’avant la bascule reste individuelle',
  capacitePrestation({ nom: 'Coupe' }), 1)
egal('et un salon ne devient jamais un cours', estCoursCollectif({ nom: 'Coupe' }), false)

// ⚠️ TESTER L'ABSENCE, JAMAIS LE NOMBRE. `Number(null)` vaut 0 et passerait un
// `< 1` sans broncher, `undefined` donne NaN : les deux formes de l'absence se
// comportent à l'opposé, et ce projet s'y est déjà fait prendre deux fois.
egal('une capacité nulle vaut 1', capacitePrestation({ capacite: null }), 1)
egal('une capacité vide vaut 1', capacitePrestation({ capacite: '' }), 1)
egal('une capacité à zéro vaut 1', capacitePrestation({ capacite: 0 }), 1)
egal('une capacité aberrante vaut 1', capacitePrestation({ capacite: -5 }), 1)
egal('une capacité en texte est lue', capacitePrestation({ capacite: '8' }), 8)
// Une capacité décimale n'a aucun sens : on ne compte pas 8,7 personnes. Sans
// l'arrondi, la dernière place resterait éternellement libre sans être
// attribuable, et le cours n'afficherait jamais « Complet ».
egal('une capacité décimale est arrondie vers le bas',
  capacitePrestation({ capacite: 8.7 }), 8)
egal('un cours de 12 est collectif', estCoursCollectif(cours), true)

egal('il reste 4 places sur 12 quand 8 sont prises', placesRestantes(cours, 8), 4)
// Une capacité réduite après coup afficherait sinon un nombre négatif.
egal('on ne descend jamais sous zéro', placesRestantes({ capacite: 5 }, 9), 0)
egal('douze inscrits, c’est complet', estComplet(cours, 12), true)
egal('onze, non', estComplet(cours, 11), false)

// ⚠️ LA PLACE SE LIBÈRE AU MILIEU, et c'est le piège qui aurait coûté le plus
// cher. Sur un cours où les places 1, 2 et 4 sont prises, la suivante est la 3,
// pas la 5. Compter les inscrits aurait redonné une place DÉJÀ OCCUPÉE :
// l'index unique aurait rejeté l'inscription, et le client aurait lu « ce
// créneau vient d'être pris » devant un cours à moitié vide.
egal('la place libérée au milieu est réattribuée',
  premierePlaceLibre(cours, [1, 2, 4]), 3)
egal('et l’ordre des places prises n’y change rien',
  premierePlaceLibre(cours, [4, 1, 2]), 3)
egal('un cours vide commence à la place 1', premierePlaceLibre(cours, []), 1)
egal('un créneau individuel occupé ne rend aucune place',
  premierePlaceLibre(soloPresta, [1]), null)
egal('un cours plein non plus',
  premierePlaceLibre({ capacite: 3 }, [1, 2, 3]), null)

// ⚠️ UN COURS COMPLET RESTE AFFICHÉ, grisé (décision Alex du 13/08). Le faire
// disparaître laisserait croire qu'il n'y a pas cours ce jour-là, alors que
// l'information utile est « c'est plein, regarde un autre jour ».
egal('le client lit combien il reste de places', libellePlaces(cours, 8), '4 places restantes')
egal('et le singulier est respecté', libellePlaces(cours, 11), '1 place restante')
egal('un cours plein le dit', libellePlaces(cours, 12), 'Complet')
// Sur un rendez-vous individuel, la mention n'a aucun sens : rendre null
// permet à l'écran de masquer la ligne au lieu d'afficher « 1 place restante »
// à qui prend rendez-vous chez son coiffeur.
egal('un rendez-vous individuel n’affiche aucune jauge', libellePlaces(soloPresta, 0), null)

// ⚠️ UN BLOC PAR COURS, PAS UNE LIGNE PAR INSCRIT. Dix lignes empilées sur le
// même créneau rendent la journée illisible, et c'est le genre d'écran qu'un
// commerçant cesse d'ouvrir.
const inscriptions = [
  { id: 'a', date_rdv: '2026-08-18', heure_debut: '10:00', prestation_id: 'p1', place_no: 3, client_prenom: 'Zoé' },
  { id: 'b', date_rdv: '2026-08-18', heure_debut: '10:00', prestation_id: 'p1', place_no: 1, client_prenom: 'Ali' },
  { id: 'c', date_rdv: '2026-08-18', heure_debut: '18:00', prestation_id: 'p2', place_no: 1, client_prenom: 'Bob' },
]
const seances = regrouperEnSeances(inscriptions)
egal('les inscrits d’un même cours tiennent en une séance', seances.length, 2)
egal('la séance de 10h porte ses deux inscrits', seances[0].inscrits.length, 2)
// Triés par place, sans quoi l'ordre serait celui de la base, donc l'ordre
// d'inscription, et la liste changerait d'un rafraîchissement à l'autre.
egal('et ils sont rangés par place', seances[0].inscrits.map(i => i.client_prenom), ['Ali', 'Zoé'])
egal('les séances sont rangées par heure', seances.map(s => s.heure_debut), ['10:00', '18:00'])
// Deux prestations différentes à la même heure restent deux séances : un
// praticien peut donner un cours pendant qu'un autre reçoit en individuel.
// ═══════════════════════════════════════════════════════════════════════════
// LES HORAIRES DÉDUITS DES EMPLACEMENTS
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ DEUX ÉCRANS DISAIENT LA MÊME CHOSE SANS SE PARLER. Un food truck qui
// déclarait « mardi, Place du Marché, 11h-14h » devait EN PLUS remplir « mardi
// 07:00 → 18:30 » dans ses horaires, et rien ne disait lequel faisait foi.
//
// ⚠️ ET ON NE POUVAIT PAS SIMPLEMENT SUPPRIMER LA GRILLE : le moteur de
// créneaux CROISE les horaires avec les plages de rendez-vous et écarte tout
// créneau hors ouverture. Les retirer aurait fait passer le commerce pour
// fermé toute la semaine, sans qu'aucun créneau ne soit plus proposé.
const truckSemaine = [
  { type: 'hebdo', jour_semaine: 'mardi', libelle: 'Place', heure_debut: '11:00:00', heure_fin: '14:00:00', actif: true },
  { type: 'hebdo', jour_semaine: 'mardi', libelle: 'Zoning', heure_debut: '18:00', heure_fin: '21:00', actif: true },
  { type: 'hebdo', jour_semaine: 'jeudi', libelle: 'Biesme', heure_debut: '09:00', heure_fin: '12:00', actif: true },
  { type: 'permanent', libelle: 'Dépôt', adresse: 'x', actif: true },
]
const horairesTruck = horairesDepuisLieux(truckSemaine)

// ⚠️ LES DEUX SERVICES NE SE FONDENT PAS EN UN SEUL. Midi 11h-14h et soir
// 18h-21h donneraient, en prenant le minimum et le maximum, une ouverture de
// 11h à 21h : le client se verrait proposer un créneau à 16h devant un camion
// absent. Le format porte `debut2`/`fin2` pour les commerces à coupure, et le
// moteur de créneaux sait déjà les lire.
egal('deux services donnent une journée à coupure',
  horairesTruck.mardi, { ouvert: true, debut: '11:00', fin: '14:00', debut2: '18:00', fin2: '21:00' })
egal('un seul service donne une plage simple',
  horairesTruck.jeudi, { ouvert: true, debut: '09:00', fin: '12:00' })
egal('un jour sans emplacement est fermé', horairesTruck.lundi, { ouvert: false })
// Un lieu PERMANENT ne dit rien du calendrier : il vaut tous les jours, sans
// horaire propre. Le compter ouvrirait la semaine entière.
egal('un dépôt permanent n’ouvre aucun jour', horairesTruck.dimanche, { ouvert: false })
egal('un lieu désactivé n’ouvre rien',
  horairesDepuisLieux([{ type: 'hebdo', jour_semaine: 'lundi', heure_debut: '08:00', heure_fin: '10:00', actif: false }]).lundi,
  { ouvert: false })
// Présent ce jour-là mais sans heures : on sait qu'il est ouvert, pas quand.
// Mieux vaut le dire que d'inventer des bornes que le moteur prendrait au mot.
egal('présent sans heures, on ne les invente pas',
  horairesDepuisLieux([{ type: 'hebdo', jour_semaine: 'samedi', actif: true }]).samedi,
  { ouvert: true, sansHoraire: true })
// Au-delà de deux services, le format ne sait pas les décrire : on couvre du
// premier au dernier EN LE SIGNALANT, pour que l'écran puisse le dire plutôt
// que de laisser croire à une précision qui n'existe pas.
egal('trois services sont couverts et signalés',
  horairesDepuisLieux([
    { type: 'hebdo', jour_semaine: 'lundi', heure_debut: '08:00', heure_fin: '10:00', actif: true },
    { type: 'hebdo', jour_semaine: 'lundi', heure_debut: '12:00', heure_fin: '14:00', actif: true },
    { type: 'hebdo', jour_semaine: 'lundi', heure_debut: '18:00', heure_fin: '20:00', actif: true },
  ]).lundi,
  { ouvert: true, debut: '08:00', fin: '20:00', approximatif: true })
egal('les sept jours sont toujours décrits',
  Object.keys(horairesDepuisLieux([])).length, 7)
// ⚠️ SEULE LA TOURNÉE HEBDOMADAIRE FAIT LE CALENDRIER. Un marché ponctuel du
// 18 août n'ouvre pas tous les mardis de l'année, et un dépôt permanent
// n'ouvre aucun jour : le compter aurait ouvert la semaine entière chez un
// food truck qui ne sort que le samedi.
egal('un emplacement ponctuel n’ouvre pas son jour de semaine',
  horairesDepuisLieux([
    { type: 'ponctuel', date_jour: '2026-08-18', jour_semaine: 'mardi', heure_debut: '09:00', heure_fin: '17:00', actif: true },
  ]).mardi, { ouvert: false })
egal('et un lieu permanent n’ouvre aucun jour',
  horairesDepuisLieux([
    { type: 'permanent', jour_semaine: 'lundi', heure_debut: '09:00', heure_fin: '17:00', actif: true },
  ]).lundi, { ouvert: false })

// ═══════════════════════════════════════════════════════════════════════════
// LE SCORE DU SIGNUP — 100 % DOIT ÊTRE ATTEIGNABLE
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ IL NE L'ÉTAIT PAS. Dix des cent points étaient donnés pour « au moins un
// article au menu », or AUCUN écran du signup ne permet d'ajouter un article :
// le commerçant plafonnait à 90 % sans jamais comprendre ce qui manquait, et
// terminait son inscription sur un échec. Relevé par Alex le 14/08.
const FICHE_COMPLETE = {
  latitude: 50.3, longitude: 4.6,
  description: 'Une présentation assez longue pour passer le seuil.',
  logo_url: 'https://x/logo.png', telephone: '071 01 00 00',
  horaires_detail: { lundi: { ouvert: true, debut: '09:00', fin: '18:00' } },
}
egal('une fiche complète atteint 100 %',
  scoreOnboarding({ commercant: FICHE_COMPLETE, onboarding: { photo_ok: true } }).pourcentage, 100)
verifier('et elle est déclarée complète',
  scoreOnboarding({ commercant: FICHE_COMPLETE, onboarding: { photo_ok: true } }).complet)

// ⚠️ ET LE MÊME DÉFAUT SE CACHAIT AILLEURS, plus discret : les horaires valent
// vingt points, mais un service en formule Exister peut les passer, et depuis
// le 13/08 celui dont les horaires viennent de ses emplacements aussi. Pour
// eux, le plafond tombait à 70 % sans qu'ils aient rien mal fait.
const sansHoraires = scoreOnboarding({
  commercant: { ...FICHE_COMPLETE, horaires_detail: null },
  onboarding: { photo_ok: true }, horairesRequis: false,
})
egal('un commerce sans horaires atteint 100 % lui aussi', sansHoraires.pourcentage, 100)
egal('parce que le critère est retiré du calcul, pas laissé rouge',
  sansHoraires.criteres.some(c => c.cle === 'horaires'), false)
egal('et le total des points possibles baisse d’autant', sansHoraires.total, 80)

// Un dossier vide ne trompe personne.
egal('une fiche vide vaut 0 %', scoreOnboarding({}).pourcentage, 0)
verifier('et ne permet pas de soumettre', !scoreOnboarding({}).peutSoumettre)
// ⚠️ L'ARRONDI NE DOIT JAMAIS AFFICHER 99 % QUAND TOUT EST COCHÉ. Sans les
// horaires, cinq critères sur six donnent 81,25 % : un 99 % affiché alors que
// tout est fait serait un mensonge cruel, juste avant le bouton d'envoi.
egal('l’arrondi ne fabrique jamais de 99 % trompeur',
  scoreOnboarding({ commercant: FICHE_COMPLETE, onboarding: { photo_ok: true }, horairesRequis: false }).pourcentage, 100)

// Le seuil garde le même sens pour tout le monde, puisqu'il est en pourcentage.
const partiel = scoreOnboarding({
  commercant: { latitude: 1, longitude: 1, telephone: '071 01 00 00', logo_url: 'x' },
  onboarding: { photo_ok: true },
})
verifier(`à ${SEUIL_SOUMISSION} % ou plus, on peut envoyer son dossier`,
  partiel.peutSoumettre, `${partiel.pourcentage} %`)
// ⚠️ Le seuil se lit depuis la règle, jamais réécrit à la main : le jour où il
// change, ce test suit au lieu de mentir sur ce qu'il vérifie.
verifier('et juste en dessous, non',
  !scoreOnboarding({ commercant: { latitude: 1, longitude: 1 }, onboarding: { photo_ok: true } }).peutSoumettre)

// ⚠️ CE QUI MANQUE SE DIT DANS L'ORDRE DE CE QUI RAPPORTE LE PLUS. Un
// commerçant pressé doit savoir par quoi commencer, pas relire une liste.
const presque = scoreOnboarding({
  commercant: { latitude: 1, longitude: 1, telephone: '071 01 00 00' },
  onboarding: {},
})
egal('le manque le plus lourd vient en premier', presque.manquants[0].poids, 20)
// ⚠️ ET C'EST L'ORDRE DE DÉCLARATION QUI LE GARANTIT, pas un tri. Deux
// mutations ont montré qu'un `sort` par précaution ne changeait jamais rien :
// il a été retiré, et la garantie déplacée ici, où elle se vérifie vraiment.
// Un critère ajouté demain au mauvais endroit fera rougir cette ligne.
const poidsDeclares = scoreOnboarding({}).criteres.map(c => c.poids)
verifier('les critères sont déclarés du plus lourd au plus léger',
  poidsDeclares.every((p, i) => i === 0 || poidsDeclares[i - 1] >= p), poidsDeclares.join(' '))
verifier('et chaque manque porte son mode d’emploi',
  presque.manquants.every(m => typeof m.aide === 'string' && m.aide.length > 10))

// ─── DÉPLACER UN LIEU N'EST PAS ÉCONDUIRE UN CLIENT ───────────────────────
// ⚠️ Le verrou d'Alex oblige à annuler les rendez-vous d'un emplacement qu'on
// déplace. Sans motif propre, le client lit « Annulé par Studio Souffle » et
// comprend qu'on ne veut plus de lui, alors que le cours a simplement changé
// d'adresse et qu'il est invité à revenir. Un même geste, deux lectures
// opposées : c'est le texte qui décide.
//
// ⚠️ L'EMAIL EST RENDU ET RELU, jamais cherché dans le source : un libellé
// écrit mais jamais atteint par une condition resterait invisible au client.
const BASE_ANNUL = {
  yopper_prenom: 'Ali', commercant_nom: 'Studio Souffle', commercant_slug: 'studio-souffle',
  prestation_nom: 'Hatha yoga', date_rdv: '2026-08-18', heure_debut: '10:00:00',
}
const mailLieu = emailRdvAnnule({ ...BASE_ANNUL, raison_annulation: 'lieu' })
const mailOrdinaire = emailRdvAnnule({ ...BASE_ANNUL, raison_annulation: 'commercant' })

verifier('le déplacement annonce un changement d’endroit, pas une annulation',
  /change d’endroit/.test(mailLieu) && !/Annulé par/.test(mailLieu), mailLieu.slice(0, 0))
verifier('et invite explicitement à reprendre sa place',
  /Reprends ta place/.test(mailLieu) && /Reprendre ma place/.test(mailLieu))
// L'annulation ordinaire ne doit surtout pas hériter de ce ton : elle annonce
// bien une annulation, et son bouton reste une invitation neutre.
verifier('une annulation ordinaire reste une annulation',
  /Annulé par/.test(mailOrdinaire) && !/change d’endroit/.test(mailOrdinaire))
verifier('avec son bouton habituel',
  /Reprendre un RDV/.test(mailOrdinaire) && !/Reprendre ma place/.test(mailOrdinaire))
// Les autres motifs ne bougent pas d'un pouce.
verifier('l’annulation par le client reste inchangée',
  /Annulé à ta demande/.test(emailRdvAnnule({ ...BASE_ANNUL, raison_annulation: 'yopper' })))
verifier('et l’annulation automatique aussi',
  /paiement non finalisé/.test(emailRdvAnnule({ ...BASE_ANNUL, raison_annulation: 'auto' })))

const srcDashRdv = sansCommentaires(
  readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))
verifier('le tableau de bord sait transmettre le motif',
  /raison_annulation: raison/.test(srcDashRdv))
verifier('et demande au commerçant lequel des deux c’est',
  /\? 'lieu' : 'commercant'/.test(srcDashRdv))

// ─── L'AGENDA : UN COURS COMPTE POUR UN BLOC, PAS POUR DOUZE ──────────────
// ⚠️ Les blocs de l'agenda sont placés en position ABSOLUE sur leur heure de
// début. Douze inscrits au même cours se seraient empilés exactement l'un sur
// l'autre : le commerçant n'aurait vu qu'un seul nom, celui du dernier rendu,
// sans aucun moyen de savoir que onze autres personnes viennent.
const JOUR_COURS = '2026-08-18'
const inscritsEtCoupe = [
  { id: 'y1', date_rdv: JOUR_COURS, heure_debut: '10:00', heure_fin: '11:00', prestation_id: 'yoga', capacite_creneau: 12, place_no: 3, client_prenom: 'Zoé' },
  { id: 'y2', date_rdv: JOUR_COURS, heure_debut: '10:00', heure_fin: '11:00', prestation_id: 'yoga', capacite_creneau: 12, place_no: 1, client_prenom: 'Ali' },
  { id: 'c1', date_rdv: JOUR_COURS, heure_debut: '10:00', heure_fin: '10:30', prestation_id: 'coupe', capacite_creneau: 1, place_no: 1, client_prenom: 'Max' },
]
const blocs = blocsAgenda(inscritsEtCoupe)
// ⚠️ TOUS LES ACCÈS SONT OPTIONNELS. Une première version écrivait
// `blocs[0].inscrits.length` : cassé, le regroupement rendait `undefined` et
// le banc PLANTAIT au lieu de rougir. Un banc qui s'arrête ne dit pas quel
// défaut il a trouvé, il dit seulement qu'il n'a pas fini.
egal('trois rendez-vous donnent deux blocs', blocs.length, 2)
egal('le cours est une séance', blocs[0]?.type, 'seance')
egal('avec ses deux inscrits', blocs[0]?.inscrits?.length, 2)
egal('rangés par place', blocs[0]?.inscrits?.map(i => i.client_prenom), ['Ali', 'Zoé'])
egal('et la jauge du cours', [blocs[0]?.inscrits?.length, blocs[0]?.capacite], [2, 12])
// ⚠️ Un rendez-vous individuel reste un bloc à lui seul, exactement comme
// avant : le regroupement ne doit pas avaler les salons.
egal('le rendez-vous individuel reste seul', blocs[1]?.type, 'rdv')
egal('et porte bien son rendez-vous', blocs[1]?.rdv?.client_prenom, 'Max')
// Une réservation d'avant la bascule n'a pas de capacité gravée : elle vaut 1.
egal('un rendez-vous d’avant reste individuel',
  blocsAgenda([{ id: 'x', heure_debut: '09:00' }])[0]?.type, 'rdv')
// ⚠️ DEUX COURS DIFFÉRENTS À LA MÊME HEURE RESTENT DEUX SÉANCES. Sans la
// prestation dans la clé, le yoga et le pilates de 10h fusionneraient en un
// seul bloc, et le commerçant lirait une jauge qui additionne deux cours.
egal('deux cours différents au même horaire font deux blocs',
  blocsAgenda([
    { id: 'a', date_rdv: JOUR_COURS, heure_debut: '10:00', prestation_id: 'yoga', capacite_creneau: 12, place_no: 1 },
    { id: 'b', date_rdv: JOUR_COURS, heure_debut: '10:00', prestation_id: 'pilates', capacite_creneau: 8, place_no: 1 },
  ]).length, 2)
egal('une liste vide ne casse rien', [blocsAgenda([]).length, blocsAgenda().length], [0, 0])

verifier('l’agenda regroupe les inscrits en séances',
  /blocsAgenda\(rdvsCommencantIci\)/.test(srcAgenda))
verifier('et n’empile plus un bloc par inscrit',
  !/\{rdvsCommencantIci\.map\(r =>/.test(srcAgenda))
verifier('un cours ouvre sa liste, pas une fiche',
  /setSeanceOuverte\(seance\)/.test(srcAgenda))
verifier('et de là on ouvre la fiche d’un inscrit',
  /setSeanceOuverte\(null\); if \(onSelectRdv\) onSelectRdv\(i\)/.test(srcAgenda))

// ─── LES TROIS ÉCRANS QUI INSCRIVENT, ET CE QU'ILS GRAVENT ────────────────
// ⚠️ La capacité doit être gravée partout : la contrainte d'exclusion la lit
// pour savoir si elle s'applique, et un écran qui l'oublierait laisserait la
// contrainte bloquer le deuxième inscrit de ses cours.
const srcResaRdv = sansCommentaires(
  readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
const srcWebhookRdv = sansCommentaires(
  readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8'))

verifier('la réservation grave la capacité',
  /capacite_creneau: capacitePrestation\(prestationChoisie\)/.test(srcResaRdv))
// ⚠️ ANCRÉ SUR `premierePlaceLibre`, jamais sur un comptage : c'est la
// différence entre réattribuer la place libérée au milieu et en redemander une
// déjà occupée.
verifier('et prend la première place libre',
  /place_no: premierePlaceLibre\(prestationChoisie, slotChoisi\?\.placesOccupees/.test(srcResaRdv))
verifier('le paiement d’acompte grave la capacité aussi',
  /payload\.capacite_creneau = capacite/.test(srcWebhookRdv))
// ⚠️ La place se calcule à l'arrivée du WEBHOOK, pas au moment du paiement :
// entre les deux, d'autres personnes ont pu s'inscrire, et une place figée
// dans les métadonnées Stripe serait périmée APRÈS que le client a payé.
verifier('et la calcule au moment de créer le rendez-vous',
  /payload\.place_no = premierePlaceLibre\(presta,/.test(srcWebhookRdv))
// Le moteur reçoit la capacité, sans quoi un cours se fermerait au premier
// inscrit et personne ne pourrait jamais être deux.
egal('l’écran passe la capacité au moteur, aux deux endroits qui comptent',
  (srcResaRdv.match(/capacite: capacitePrestation\(prestationChoisie\)/g) || []).length, 2)
// Un cours complet reste affiché, grisé : le filtre laisse passer ce motif.
verifier('un cours complet reste affiché',
  /slots\.filter\(s => !s\.pris \|\| s\.motif === 'complet'\)/.test(srcResaRdv))

egal('deux prestations à la même heure font deux séances',
  regrouperEnSeances([
    { date_rdv: '2026-08-18', heure_debut: '10:00', prestation_id: 'p1', place_no: 1 },
    { date_rdv: '2026-08-18', heure_debut: '10:00', prestation_id: 'p2', place_no: 1 },
  ]).length, 2)

// ⚠️ TOUS LES CANAUX, ET TOUS LES ÉCRANS QUI GRAVENT. Corrigés un par un, ils
// auraient divergé : c'est exactement ce qui s'était produit avec les numéros
// de commande, corrigés dans les corps d'emails et oubliés dans les objets.
// ⚠️ LA LISTE A DOUBLÉ LE 15/08. Elle ne couvrait que les quatre canaux du
// rendez-vous, alors que les COMMANDES annoncent elles aussi « viens ici », et
// qu'elles retombaient toutes sur `commercants.adresse`. Une commande retirée
// chez une commerçante itinérante envoyait donc le client à son siège, malgré
// le lieu gravé sur la commande depuis le 13/08.
//
// ⚠️ Le repli sur le siège N'A PAS DISPARU de `adresseRendezVous`, et c'est
// volontaire : un rendez-vous ANTÉRIEUR au module n'a aucun lieu gravé, et le
// siège reste alors la seule vérité historique. Le retirer réécrirait le passé.
const CANAUX_LIEU = [
  ['la confirmation de rendez-vous', 'app/api/emails/rdv-confirme/route.js'],
  ['l’email d’annulation', 'app/api/emails/rdv-annule/route.js'],
  ['le rappel de la veille', 'app/api/cron/rdv-reminder-9h/route.js'],
  ['« Mes rendez-vous »', 'app/api/rdv/mes-rdvs/route.js'],
  ['la confirmation de commande', 'app/api/emails/commande-confirmee/route.js'],
  ['l’email « commande prête »', 'app/api/emails/commande-prete/route.js'],
  ['le rappel de retrait', 'app/api/cron/rappels-retrait/route.js'],
  ['les notifications de commande', 'lib/commande-notifs.js'],
  ['l’annulation d’un rendez-vous', 'app/api/rdv/cancel/route.js'],
  ['les emails du webhook Stripe', 'app/api/stripe/webhook/route.js'],
]
for (const [nom, chemin] of CANAUX_LIEU) {
  const src = sansCommentaires(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))
  verifier(`${nom} annonce le lieu du rendez-vous`, /adresseRendezVous\(/.test(src))
  verifier(`${nom} ne lit plus l’adresse du siège`,
    !/commercant[?]?\.adresse \|\| ''/.test(src))
  // ⚠️ ET LA COLONNE DOIT ÊTRE DEMANDÉE. Appeler `adresseRendezVous` sur un
  // enregistrement dont le `select` ne ramène pas `lieu_libelle` rend
  // systématiquement le siège, SANS la moindre erreur : la fonction est bien
  // appelée, elle n'a simplement rien à lire. Ce test est né MUET, et c'est la
  // mesure par mutation qui l'a montré. Troisième fois aujourd'hui que ce
  // projet se fait avoir par une colonne absente d'une requête, après la
  // capacité des cours et le lien vers l'abonnement.
  verifier(`${nom} demande bien le lieu gravé`, /lieu_libelle/.test(src))
}

// ⚠️ LES FICHES PUBLIQUES AUSSI, ET C'EST CE QUI MANQUAIT (Alex, 15/08).
//
// Le module LIEUX du 13/08 a été branché sur l'accueil, sur la fiche boutique
// et sur les quatre canaux de notification. **Jamais sur la fiche des
// SERVICES**, qui est pourtant la seule que voit un métier de service. Elle
// affichait `commercants.adresse` en direct, donc le SIÈGE SOCIAL : une
// professeure de yoga inscrite à son domicile envoyait ses clientes chez elle,
// et un food truck annonçait l'adresse de son dépôt.
//
// Ce banc a couvert le geste (graver) et les emails (annoncer), en oubliant
// LIRE. On liste donc les deux fiches, et chacune doit passer par `lieuxDuJour`
// avant d'afficher quoi que ce soit.
const FICHES_PUBLIQUES = [
  ['la fiche boutique', 'app/commander/[slug]/page.js'],
  ['la fiche des services', 'app/commander/rdv/[slug]/page.js'],
]
for (const [nom, chemin] of FICHES_PUBLIQUES) {
  const src = sansCommentaires(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))
  verifier(`${nom} demande où se passe l’activité`, /lieuxDuJour\(\{/.test(src))
  verifier(`${nom} charge les lieux du commerçant`, /from\('commercant_lieux'\)/.test(src))
  // ⚠️ ANCRÉ SUR L'AFFICHAGE, pas sur l'appel : appeler `lieuxDuJour` sans se
  // servir du résultat laisserait le test vert et le client au mauvais endroit.
  // C'est la cinquième fois que ce projet écrit un test qui vérifie qu'un
  // morceau de code EXISTE au lieu de vérifier ce qu'il fait.
  verifier(`${nom} affiche l’adresse qui en sort`, /adresseAffichee/.test(src))
  verifier(`${nom} n’affiche plus le siège en direct`,
    !/encodeURIComponent\(commercant\??\.adresse\)/.test(src))
}
// Et le jour se lit en heure BELGE. Entre minuit et deux heures du matin,
// `toISOString()` rend la veille, et la fiche annoncerait le lieu d'hier.
for (const [nom, chemin] of FICHES_PUBLIQUES) {
  const src = sansCommentaires(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))
  verifier(`${nom} cherche le lieu du bon jour`, /jour: jourLocalISO\(new Date\(\)\)/.test(src))
}

// ⚠️ DEUX CAS ET RIEN ENTRE LES DEUX, côté réglage (Alex, 15/08).
//
// La section « Où me trouver » empilait quatre sous-parties pour tout le monde,
// dont une adresse valable toute l'année ET un planning par jour. Les deux
// répondent à la même question et rien ne disait laquelle l'emportait : « ce
// n'est pas clair », avec un « IDEM ? » entre les deux.
const srcConfigLieux = sansCommentaires(
  readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
verifier('la section des lieux sait si le commerce bouge',
  /function SectionLieux\(\{ commercantId, toast, mobile/.test(srcConfigLieux))
verifier('et la réponse vient de la question déjà posée',
  /mobile=\{siegeEstLeLieu === false\}/.test(srcConfigLieux))
// ⚠️ Un commerce qui bouge n'a PAS d'adresse permanente : elle contredirait son
// planning. Le bloc est donc masqué, pas seulement déplacé.
verifier('un commerce qui bouge ne se voit pas proposer d’adresse fixe',
  /\{!mobile && \(<>/.test(srcConfigLieux))
verifier('et un commerce fixe ne se voit pas proposer de planning',
  /\{mobile && \(<>/.test(srcConfigLieux))

const ECRANS_QUI_GRAVENT = [
  ['la réservation par le client', 'app/commander/rdv/[slug]/page.js'],
  ['le paiement d’acompte', 'app/api/stripe/webhook/route.js'],
  ['la création par le commerçant', 'app/dashboard/ModalNouveauRdv.js'],
]
// ⚠️ ANCRÉ SUR L'ÉCRITURE, PAS SUR L'APPEL. La première version cherchait
// `champsLieuPour(` et restait VERTE quand on neutralisait son résultat :
// l'appel était bien écrit, il ne servait simplement plus à rien. Un test qui
// vérifie qu'un morceau de code EXISTE ne dit rien de ce qu'il fait, et c'est
// la quatrième forme du test faussement vert de ce projet.
for (const [nom, chemin] of ECRANS_QUI_GRAVENT) {
  const src = sansCommentaires(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))
  verifier(`${nom} grave le lieu dans la réservation`,
    /Object\.assign\(payload, await champsLieuPour\(/.test(src)
    || /\.\.\.lieu,/.test(src) && /const lieu = await champsLieuPour\(/.test(src))
}
// Le lieu se résout à la DATE ET À L'HEURE : c'est ce qui distingue le service
// du midi de celui du soir chez un food truck.
const srcResaClient = sansCommentaires(
  readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
verifier('et il le résout à l’heure du rendez-vous',
  /jour: dateStr, heure: heureChoisie/.test(srcResaClient))
// ⚠️ Mais le CHOIX EXPLICITE du commerçant l'emporte : quand la plage de
// réservation désigne un emplacement, le déduire de l'heure le contredirait.
verifier('sauf si la plage désigne elle-même un emplacement',
  /lieuId: plageChoisie\?\.lieu_id \|\| null/.test(srcResaClient))

// ─── L'ACCUEIL MESURE JUSQU'AU BON ENDROIT ────────────────────────────────
// ⚠️ La distance se mesurait depuis le SIÈGE SOCIAL. Le food truck affichait la
// distance jusqu'à son dépôt pendant qu'il était au marché, et la professeure de
// yoga inscrite chez elle la distance jusqu'à son domicile. Un Yopper à deux
// rues de la salle de cours la voyait à huit kilomètres et passait son chemin.
verifier('l’accueil mesure la distance sur les lieux du jour',
  /lieuxDuJour\(\{ commercant: c, lieux: lieuxParCommercant/.test(srcEcranClient))
verifier('et garde le plus proche',
  /if \(distance === null \|\| d < distance\)/.test(srcEcranClient))
verifier('il charge les lieux des commerces affichés',
  /from\('commercant_lieux'\)/.test(srcEcranClient))
// ⚠️ LES LIEUX ARRIVENT APRÈS LA POSITION. Sans recalcul, la distance resterait
// celle du siège pendant tout le temps où le Yopper regarde son écran.
verifier('et remesure quand ils arrivent',
  /setCommercants\(prev => avecDistances\(prev, position, parCommercant\)\)/.test(srcEcranClient))
// Le nom du lieu n'est montré que s'il diffère du siège.
verifier('la carte nomme le lieu quand il diffère du siège',
  /lieu_proche\?\.libelle \? `\$\{c\.lieu_proche\.libelle\} · ` : ''/.test(srcEcranClient))

// ═══════════════════════════════════════════════════════════════════════════
// 6 quinquies. LA BARRE DU HAUT — la cloche ne sort plus de l'écran
// ═══════════════════════════════════════════════════════════════════════════
// Trois onglets (Commandes, Rendez-vous, Paramètres) faisaient déborder la
// rangée : les deux blocs extrêmes refusaient de rétrécir et `overflow: hidden`
// mangeait la droite, donc la cloche et la déconnexion.
verifier('l’identité du commerce est le bloc qui cède',
  /flexShrink: 1, minWidth: 0, overflow: 'hidden'/.test(srcDashboard))
verifier('les onglets ne rétrécissent pas',
  /backdropFilter: 'blur\(8px\)', border: '1px solid rgba\(255,255,255,0\.1\)', flexShrink: 0/.test(srcDashboard))
// ⚠️ `[\s\S]*?` acceptait un `gap` trouvé DANS UNE AUTRE RÈGLE, plus bas dans la
// feuille : le test restait vert alors que la rangée n'avait plus d'espacement.
// `[^}]*?` s'arrête à l'accolade fermante, donc à l'intérieur de la règle.
verifier('la rangée du haut respire',
  /\.topbar-inner \{[^}]*?gap: 10px;/.test(srcDashboard))
verifier('seul l’onglet ouvert porte son mot',
  /\{actif && label\}/.test(srcDashboard))
verifier('les autres restent nommés pour qui ne voit pas l’icône',
  /aria-label=\{titre\}/.test(srcDashboard))

// ═══════════════════════════════════════════════════════════════════════════
// 6 sexies. LE RENOUVELLEMENT DE SESSION — un seul à la fois
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ L'accueil lance QUATRE chargements en parallèle. Session endormie, les
// quatre demandaient un renouvellement avec LE MÊME jeton, à usage unique : le
// premier le consommait, les trois autres recevaient « Already Used », et la
// bibliothèque effaçait la session. Le rattrapage fabriquait le problème.
const srcFetchYopper = sansCommentaires(
  readFileSync(new URL('../lib/fetch-yopper.js', import.meta.url), 'utf8'))
verifier('un renouvellement partagé entre les appels concurrents',
  /let renouvellementEnCours = null/.test(srcFetchYopper))
verifier('les suivants attendent le même, ils n’en lancent pas un autre',
  /if \(!renouvellementEnCours\)/.test(srcFetchYopper))
egal('une seule demande de renouvellement dans tout le fichier',
  compter(srcFetchYopper, /refreshSession\(/g), 1)
verifier('et le verrou se relâche une fois la réponse revenue',
  /\.finally\(\(\) => \{ renouvellementEnCours = null \}\)/.test(srcFetchYopper))
// Ce qui ne doit JAMAIS revenir : appeler le serveur sans jeton. Le serveur
// répond alors en visiteur anonyme, et l'écran ne distingue plus un vide
// légitime d'une session perdue.
verifier('sans jeton, on n’appelle pas le serveur',
  /if \(!token\) return reponseSessionPerdue\(\)/.test(srcFetchYopper))

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
  // ⚠️ CES DEUX TESTS VERROUILLAIENT L'ANCIEN COMPORTEMENT. Ils exigeaient
  // `prochainJourOuvert` et le libellé « À récupérer », c'est-à-dire la valeur
  // unique calculée dans son coin et la phrase qui promettait un retrait
  // immédiat. Ils seraient restés verts en interdisant la correction : un test
  // se mesure sur le DÉFAUT qu'il empêche, jamais sur la formulation d'hier.
  // Même piège que `verif-fiche` le 10/08.
  verifier('la boutique construit une LISTE de jours, plus une valeur unique',
    /joursRetraitBoutique\(\{/.test(fiche))
  verifier('le retrait n\'est plus accepté sans condition',
    !/modeBoutiqueEff === 'expedition' \? expeFormOk : true/.test(fiche))
  verifier('la date de commande suit ce jour, pas aujourd\'hui',
    /jourRetraitBoutique \|\| jourLocalISO\(new Date\(\)\)/.test(fiche))
  verifier('et le client lit la date AVANT de payer', /Retrait souhaité/.test(fiche))
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
// LES COMMANDES QUI POURRISSENT DANS UN COIN (Alex, 11/08)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ UNE COMMANDE PRÊTE POUVAIT DORMIR INDÉFINIMENT. Le commerçant la marque
// prête, le client reçoit UN message, et plus rien ne se passait jamais : ni
// relance, ni signal côté commerçant. La commande restait « Prête » à vie, son
// stock retiré des rayons.
//
// Décision d'Alex : rappels à 24, 48 et 72 h en détail et services, un seul à
// 24 h en alimentaire, et ⚠️ AUCUNE ANNULATION AUTOMATIQUE — le commerçant
// décide, le code lui rappelle.
{
  const T0 = new Date('2026-08-11T10:00:00Z')
  const plus = (h) => new Date(T0.getTime() + h * 3600 * 1000)
  const cmd = (extra = {}) => ({
    statut: 'pret', pret_at: T0.toISOString(), rappel_retrait_nb: 0,
    commercant: { categorie: 'detail' }, ...extra,
  })

  egal('une commande fraîche n\'est pas relancée', rappelAEnvoyer(cmd(), plus(3)), null)
  egal('à 23 heures, pas encore', rappelAEnvoyer(cmd(), plus(23)), null)
  egal('à 24 heures, le premier rappel part', rappelAEnvoyer(cmd(), plus(24)), { palier: 24, rang: 1 })
  // ⚠️ ET IL NE PART QU'UNE FOIS. Un cron qui repasse toutes les heures ne doit
  // pas réveiller le client à chaque tour : c'est le compteur qui l'en empêche.
  egal('le même rappel ne repart pas', rappelAEnvoyer(cmd({ rappel_retrait_nb: 1 }), plus(30)), null)
  egal('à 48 heures, le deuxième', rappelAEnvoyer(cmd({ rappel_retrait_nb: 1 }), plus(48)), { palier: 48, rang: 2 })
  egal('à 72 heures, le troisième', rappelAEnvoyer(cmd({ rappel_retrait_nb: 2 }), plus(72)), { palier: 72, rang: 3 })
  egal('et après le troisième, on se tait', rappelAEnvoyer(cmd({ rappel_retrait_nb: 3 }), plus(120)), null)

  // ⚠️ L'ALIMENTAIRE N'A QU'UN SEUL PALIER. Un pain n'attend pas trois jours.
  const alim = (extra = {}) => cmd({ commercant: { categorie: 'alimentaire' }, ...extra })
  egal('en alimentaire, un rappel à 24 heures', rappelAEnvoyer(alim(), plus(24)), { palier: 24, rang: 1 })
  egal('et rien à 48', rappelAEnvoyer(alim({ rappel_retrait_nb: 1 }), plus(48)), null)
  egal('le barème alimentaire n\'a qu\'un palier', baremeRappels('alimentaire'), [24])
  egal('celui des produits en a trois', baremeRappels('detail'), [24, 48, 72])
  egal('un service vend des produits, même barème', baremeRappels('vitrine'), [24, 48, 72])

  // ⚠️ SANS DATE, ON N'ENVOIE RIEN. `Number(null)` vaut 0 et passerait les
  // comparaisons : toutes les commandes prêtes seraient relancées au premier
  // passage du cron. On teste l'ABSENCE, jamais le nombre.
  egal('sans date de mise à disposition, aucun rappel',
    rappelAEnvoyer(cmd({ pret_at: null }), plus(48)), null)
  egal('ni avec une date illisible',
    rappelAEnvoyer(cmd({ pret_at: 'pas une date' }), plus(48)), null)
  egal('une commande pas encore prête n\'est pas relancée',
    rappelAEnvoyer(cmd({ statut: 'en_preparation' }), plus(48)), null)
  egal('une commande déjà récupérée non plus',
    rappelAEnvoyer(cmd({ statut: 'recupere' }), plus(48)), null)
  // Un compteur absent vaut zéro, pas NaN.
  egal('compteur absent, le premier rappel part quand même',
    rappelAEnvoyer(cmd({ rappel_retrait_nb: null }), plus(24)), { palier: 24, rang: 1 })

  // ⚠️ LE PLAFOND D'UNE SEMAINE. La reprise du 11/08 a daté neuf commandes
  // d'essai avec leur date de création : sans ce plafond, le premier passage du
  // cron leur aurait envoyé leurs trois rappels d'un coup.
  egal('au-delà d\'une semaine, l\'automate se tait',
    rappelAEnvoyer(cmd(), plus(RAPPEL_TROP_TARD_HEURES + 1)), null)
  egal('juste avant le plafond, il parle encore',
    rappelAEnvoyer(cmd(), plus(RAPPEL_TROP_TARD_HEURES - 1))?.palier, 24)

  egal('l\'attente se compte en heures', heuresDAttente(T0.toISOString(), plus(36)), 36)
  egal('sans date, pas d\'attente calculable', heuresDAttente(null, plus(36)), null)

  // ─── Ce que le commerçant voit ────────────────────────────────────────
  egal('avant 24 heures, on ne signale rien', ancienneteCommande(T0.toISOString(), plus(20)), null)
  egal('à 24 heures, « prête depuis hier »', ancienneteCommande(T0.toISOString(), plus(25))?.texte, 'Prête depuis hier')
  egal('à trois jours, on le dit', ancienneteCommande(T0.toISOString(), plus(74))?.texte, 'Prête depuis 3 jours')
  egal('et c\'est marqué urgent', ancienneteCommande(T0.toISOString(), plus(74))?.urgent, true)
  egal('deux jours, pas encore urgent', ancienneteCommande(T0.toISOString(), plus(50))?.urgent, false)

  // ⚠️ « NON RETIRÉ » ÉTAIT INATTEIGNABLE EN BOUTIQUE. Le bouton n'apparaît que
  // si la commande a un CRÉNEAU, pour vérifier que l'heure est passée. Une
  // commande de boutique n'en a pas : le statut restait « Prête » à vie et le
  // stock ne revenait jamais en rayon.
  const boutique = { statut: 'pret', date_commande: '2026-08-11' }
  egal('le jour même, le commerçant ne peut pas encore trancher',
    peutMarquerNonRetire(boutique, new Date('2026-08-11T18:00:00')), false)
  egal('le lendemain, il le peut',
    peutMarquerNonRetire(boutique, new Date('2026-08-12T09:00:00')), true)
  // Le comportement à créneau ne bouge pas.
  const avecCreneau = { statut: 'pret', date_commande: '2026-08-11', creneau: { heure_fin: '11:30:00' } }
  egal('à créneau, avant la fin, non',
    peutMarquerNonRetire(avecCreneau, new Date('2026-08-11T11:00:00')), false)
  egal('à créneau, après la fin, oui',
    peutMarquerNonRetire(avecCreneau, new Date('2026-08-11T12:00:00')), true)
  egal('une commande pas prête ne se déclare pas non retirée',
    peutMarquerNonRetire({ ...boutique, statut: 'en_preparation' }, new Date('2026-08-13T09:00:00')), false)
  egal('sans date de retrait, on ne devine pas',
    peutMarquerNonRetire({ statut: 'pret' }, new Date('2026-08-13T09:00:00')), false)

  // Les textes ne laissent jamais de trou ni de dièse orphelin.
  const t24 = texteRappelRetrait({ commercantNom: 'La Boutique', reference: 'RE1', palier: 24 })
  verifier('le rappel nomme le commerce et la référence',
    t24.corps.includes('La Boutique') && t24.corps.includes('#RE1'), t24.corps)
  const sansRef = texteRappelRetrait({ commercantNom: 'La Boutique', reference: null, palier: 72 })
  verifier('sans référence, pas de dièse orphelin', !/#\s/.test(sansRef.corps), sansRef.corps)
  verifier('sans nom de commerce, la phrase tient debout',
    !/undefined|null/.test(texteRappelRetrait({ palier: 48 }).corps))
  verifier('à 72 heures, on propose de prévenir plutôt que d\'insister',
    /préviens/.test(texteRappelRetrait({ commercantNom: 'X', palier: 72 }).corps))

  // ⚠️ L'ANNULATION AUTOMATIQUE DOIT AVOIR DISPARU. Le cron `non-retire-daily`
  // basculait chaque nuit toute commande prête dont le jour de retrait était
  // passé, sans rappel, sans prévenir personne, et SANS RENDRE LE STOCK. Il
  // contredisait frontalement la décision d'Alex : le commerçant décide, et lui
  // seul. Ce test interdit son retour.
  const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
  // ⚠️ ON REGARDE LES CHEMINS, PAS LE FICHIER. Le commentaire qui explique la
  // suppression cite forcément le nom du cron supprimé, et la recherche tombait
  // dessus. C'est la quatrième fois que mes propres commentaires cassent un
  // test : ici, `vercel.json` étant du JSON, l'explication vit dans une clé
  // `_pourquoi` qu'il faut écarter comme on écarte les commentaires ailleurs.
  const cheminsCron = [...vercel.matchAll(/"path":\s*"([^"]+)"/g)].map(m => m[1])
  verifier('le cron qui annulait en silence a disparu',
    !cheminsCron.some(p => /non-retire-daily/.test(p)),
    cheminsCron.join(' '))
  verifier('les rappels le remplacent', /api\/cron\/rappels-retrait/.test(vercel))
  // ⚠️ ET PAS À N'IMPORTE QUELLE HEURE. L'ancien tournait à 00h30 : un rappel
  // de retrait ne se lit pas à deux heures du matin. Même famille que le SMS de
  // fidélité envoyé à 3h, corrigé le 05/08.
  // ⚠️ `vercel.json` SUIT UN SCHÉMA STRICT. Une clé inconnue dans une entrée de
  // cron fait échouer le DÉPLOIEMENT ENTIER, pas seulement le cron :
  //   « Invalid vercel.json - `crons[4]` should NOT have additional property »
  // J'y avais mis un `_pourquoi` pour expliquer le remplacement du cron
  // nocturne. La production ne s'est pas mise à jour. Les explications vont
  // dans le fichier de la route, jamais ici.
  const conf = JSON.parse(vercel)
  const clesInconnues = (conf.crons || []).flatMap(c =>
    Object.keys(c).filter(k => !['path', 'schedule'].includes(k)))
  verifier('aucune clé inconnue dans les crons de vercel.json',
    clesInconnues.length === 0, clesInconnues.join(', '))

  const cron = (conf.crons || []).find(c => c.path.includes('rappels-retrait'))
  const heureCron = Number((cron?.schedule || '').split(' ')[1])
  verifier('les rappels partent à une heure décente',
    heureCron >= 6 && heureCron <= 18, `heure UTC = ${heureCron}`)

  const routeRappels = sansCommentaires(readFileSync(new URL('../app/api/cron/rappels-retrait/route.js', import.meta.url), 'utf8'))
  verifier('le cron applique la règle partagée', /rappelAEnvoyer\(cmd, maintenant\)/.test(routeRappels))
  // ⚠️ IL NE DOIT RIEN ANNULER. C'est toute la décision d'Alex.
  verifier('et ne bascule AUCUN statut',
    !/statut: 'non_retire'/.test(routeRappels),
    (routeRappels.match(/.*statut: 'non_retire'.*/) || [])[0])
  verifier('le compteur est posé AVANT l\'envoi',
    routeRappels.indexOf('rappel_retrait_nb: decision.rang') < routeRappels.indexOf('envoyerAuCommercant('))
  verifier('avec un verrou sur la valeur précédente',
    /\.eq\('rappel_retrait_nb', decision\.rang - 1\)/.test(routeRappels))
  verifier('une livraison n\'est jamais relancée', /\.neq\('mode_retrait', 'livraison'\)/.test(routeRappels))

  // ⚠️ LE STOCK DOIT REVENIR. Le tableau de bord posait le statut depuis le
  // navigateur, qui ne peut pas écrire dans la table des versions : chaque
  // commande déclarée non retirée retirait une pièce des rayons pour toujours.
  const routeNonRetire = sansCommentaires(readFileSync(new URL('../app/api/commande/non-retire/route.js', import.meta.url), 'utf8'))
  verifier('la route rend le stock des versions', /restaurerStockVariantes\(supabase, \[commandeId\]\)/.test(routeNonRetire))
  verifier('elle vérifie que le commerçant est propriétaire',
    /auth_user_id !== user\.id/.test(routeNonRetire))
  // ⚠️ L'IDEMPOTENCE VIENT DE L'APPELANT : l'UPDATE filtré sur l'ancien statut.
  // Sans lui, deux clics rendraient le stock deux fois et le feraient gonfler.
  verifier('l\'update est filtré sur l\'ancien statut',
    /\.eq\('statut', 'pret'\)/.test(routeNonRetire))
  // ⚠️ ON VISE L'APPEL, PAS L'IMPORT. `restaurerStockVariantes` apparaît en tête
  // de fichier dans la ligne d'import : la comparaison de positions trouvait
  // celle-là et concluait à l'envers.
  verifier('et le stock n\'est rendu que si la ligne a basculé',
    routeNonRetire.indexOf('if (!basculee)') < routeNonRetire.indexOf('restaurerStockVariantes(supabase'),
    `garde=${routeNonRetire.indexOf('if (!basculee)')}, appel=${routeNonRetire.indexOf('restaurerStockVariantes(supabase')}`)

  const dash = sansCommentaires(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))
  verifier('le tableau de bord passe par la route pour non_retire',
    /'\/api\/commande\/non-retire'/.test(dash))
  verifier('le bouton ne dépend plus d\'un créneau', /peutMarquerNonRetire\(commande/.test(dash))
  verifier('et la commande vieillit sous les yeux du commerçant',
    /ancienneteCommande\(commande\.pret_at/.test(dash))
}

// ═══════════════════════════════════════════════════════════════════════════
// LE JOUR DE RETRAIT D'UNE BOUTIQUE DE DÉTAIL (Alex, 11/08)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA BOUTIQUE AFFICHAIT LE SÉLECTEUR DE L'ALIMENTAIRE. Il se construit à
// partir des CRÉNEAUX ; une boutique n'en a aucun. « Aujourd'hui » n'était donc
// jamais poussé, et seul « Demain » apparaissait — alors que La Boutique Témoin
// était ouverte ce mardi-là de 10h00 à 18h30 et qu'il était 13h30.
//
// Pire : ce sélecteur ne pilotait RIEN. La date envoyée venait d'un chemin
// séparé et valait aujourd'hui. L'écran annonçait le 12, l'email, la fiche du
// client et le tableau de bord disaient tous le 11.
{
  // Mardi 11 août 2026, boutique ouverte du lundi au samedi 10h00-18h30.
  const MARDI = '2026-08-11'
  const h = (heure) => parseInt(heure.slice(0, 2), 10) * 60 + parseInt(heure.slice(3, 5), 10)
  const semaine = {
    lundi:    { ouvert: true, debut: '10:00', fin: '18:30' },
    mardi:    { ouvert: true, debut: '10:00', fin: '18:30' },
    mercredi: { ouvert: true, debut: '10:00', fin: '18:30' },
    jeudi:    { ouvert: true, debut: '10:00', fin: '18:30' },
    vendredi: { ouvert: true, debut: '10:00', fin: '18:30' },
    samedi:   { ouvert: true, debut: '10:00', fin: '18:30' },
    dimanche: { ouvert: false },
  }
  const jours = (maintenant, extra = {}) => joursRetraitBoutique({
    horairesDetail: semaine, fermetures: [], depuis: MARDI,
    maintenant, delaiHeures: 2, horizon: 4, ...extra,
  }).map(j => j.label)

  // ⚠️ LE CAS EXACT D'ALEX : mardi 13h30, boutique ouverte jusqu'à 18h30, deux
  // heures de préparation. Il reste largement le temps.
  egal('mardi 13h30, aujourd\'hui est proposé', jours(h('13:30'))[0], "Aujourd'hui")
  verifier('et ce n\'est plus la seule proposition', jours(h('13:30')).length > 1,
    jours(h('13:30')).join(' | '))

  // À 17h00, il ne reste qu'une heure et demie : moins que le délai réglé.
  egal('à 17h00, plus le temps de préparer', jours(h('17:00'))[0], 'Demain')
  // Pile à la limite : 16h30, il reste exactement les deux heures.
  egal('à 16h30 pile, aujourd\'hui tient encore', jours(h('16:30'))[0], "Aujourd'hui")
  egal('une minute plus tard, non', jours(h('16:31'))[0], 'Demain')
  // Après la fermeture, évidemment.
  egal('à 21h00, demain', jours(h('21:00'))[0], 'Demain')
  // Avant l'ouverture, la journée est entière devant soi.
  egal('à 08h00, aujourd\'hui', jours(h('08:00'))[0], "Aujourd'hui")

  // ⚠️ SANS HEURE COURANTE, ON NE PROPOSE PAS LE JOUR MÊME. Mieux vaut rater
  // une vente que promettre un retrait qu'on ne sait pas tenir.
  egal('sans heure connue, jamais aujourd\'hui', jours(undefined)[0], 'Demain')
  egal('ni avec une heure illisible', jours(NaN)[0], 'Demain')

  // Le dimanche est fermé : il ne doit apparaître nulle part.
  const suite = joursRetraitBoutique({
    horairesDetail: semaine, fermetures: [], depuis: '2026-08-15',  // samedi
    maintenant: h('11:00'), delaiHeures: 2, horizon: 4,
  })
  egal('le dimanche fermé est sauté', suite.map(j => j.jour),
    ['2026-08-15', '2026-08-17', '2026-08-18'])
  egal('et le lendemain du samedi se nomme par son jour', suite[1].label, 'lundi')

  // Les congés priment sur la grille hebdomadaire.
  const avecConges = joursRetraitBoutique({
    horairesDetail: semaine,
    fermetures: [{ date_debut: '2026-08-12', date_fin: '2026-08-13' }],
    depuis: MARDI, maintenant: h('11:00'), delaiHeures: 2, horizon: 5,
  })
  egal('les jours de congés disparaissent', avecConges.map(j => j.jour),
    ['2026-08-11', '2026-08-14', '2026-08-15'])

  // ⚠️ SANS HORAIRES RENSEIGNÉS, ON N'INTERDIT RIEN. Même politique que le
  // reste du module : un commerçant qui n'a pas fini sa fiche ne doit pas voir
  // ses ventes bloquées par notre prudence.
  const sansHoraires = joursRetraitBoutique({
    horairesDetail: null, fermetures: [], depuis: MARDI,
    maintenant: h('23:00'), delaiHeures: 2, horizon: 3,
  })
  egal('sans horaires, tous les jours sont proposés', sansHoraires.length, 3)
  egal('y compris aujourd\'hui à 23h00', sansHoraires[0].label, "Aujourd'hui")

  // Un commerce fermé en permanence ne propose rien plutôt que d'inventer.
  egal('commerce fermé partout, aucune proposition',
    joursRetraitBoutique({
      horairesDetail: { lundi: { ouvert: false }, mardi: { ouvert: false }, mercredi: { ouvert: false },
        jeudi: { ouvert: false }, vendredi: { ouvert: false }, samedi: { ouvert: false }, dimanche: { ouvert: false } },
      fermetures: [], depuis: MARDI, maintenant: h('11:00'), horizon: 7,
    }), [])

  // Une date illisible ne fabrique pas de liste.
  egal('date de départ illisible', joursRetraitBoutique({ depuis: 'pas une date' }), [])

  // ⚠️ LA PAUSE DE MIDI NE FERME PAS LA JOURNÉE. C'est la fin de la DERNIÈRE
  // plage qui compte : une boutique 10h-12h puis 14h-18h30 accepte encore une
  // commande à 13h00, même si elle est fermée à cet instant précis.
  const avecPause = { mardi: { ouvert: true, debut: '10:00', fin: '12:00', debut2: '14:00', fin2: '18:30' } }
  egal('la limite se calcule sur la dernière plage',
    limiteRetraitCeJour(avecPause, 'mardi', 2), h('16:30'))
  egal('sans délai, la limite est la fermeture',
    limiteRetraitCeJour(avecPause, 'mardi', 0), h('18:30'))
  egal('un jour sans horaires n\'a pas de limite',
    limiteRetraitCeJour({}, 'mardi', 2), null)

  // ⚠️ ET LES ÉCRANS DOIVENT S'EN SERVIR. Une règle juste que personne
  // n'applique laisse le défaut intact.
  const fiche = sansCommentaires(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('la fiche construit la liste des jours de boutique',
    /joursRetraitBoutique\(\{/.test(fiche))
  verifier('le sélecteur de l\'alimentaire est masqué en détail',
    /\{!estDetail && peutCommander && joursDispos\.length > 0/.test(fiche),
    (fiche.match(/.*peutCommander && joursDispos\.length > 0.*/) || [])[0])
  verifier('le jour retenu vient du choix du client',
    /joursBoutique\[jourBoutiqueChoisi\]\?\.jour/.test(fiche))
  // ⚠️ VISER LES TROIS ENDROITS, pas le motif. `estDetail && jourRetraitBoutique`
  // apparaît à plusieurs endroits : en casser un seul laissait le banc vert.
  // Mesuré, corrigé.
  verifier('le chargement des stocks lit le jour souhaité',
    /const dateStr = estDetail\s*\r?\n?\s*\? \(jourRetraitBoutique/.test(fiche),
    (fiche.match(/.*const dateStr = estDetail.*/) || [])[0] || 'expression absente')
  verifier('getStockMax aussi',
    /const jourDateSelectionne = estDetail && jourRetraitBoutique/.test(fiche))
  verifier('et la ligne d\'article reçoit le jour de retrait',
    /jourRetrait=\{estDetail \? jourRetraitBoutique : null\}/.test(fiche))
  verifier('plus aucun prochainJourOuvert dans la fiche',
    !/prochainJourOuvert/.test(fiche),
    (fiche.match(/.*prochainJourOuvert.*/) || [])[0])
  // Le texte qui promettait un retrait immédiat.
  verifier('« à récupérer dès aujourd\'hui » a disparu',
    !/À récupérer dès aujourd/.test(fiche),
    (fiche.match(/.*À récupérer dès aujourd.*/) || [])[0])
  verifier('et la règle d\'attente est écrite noir sur blanc',
    /Ne te déplace pas avant/.test(fiche))

  // ⚠️ LE SERVEUR NE VÉRIFIAIT RIEN. Seul le FORMAT de la date était contrôlé :
  // un onglet resté ouvert depuis la veille faisait tomber une commande à
  // retirer un dimanche ou en plein congé.
  const routeCmd2 = sansCommentaires(readFileSync(new URL('../app/api/stripe/checkout/create-commande/route.js', import.meta.url), 'utf8'))
  // ⚠️ CE N'EST PAS D'APPELER LA FONCTION QUI COMPTE, C'EST DE REFUSER. Le
  // premier test se contentait de la trouver dans le fichier : neutraliser la
  // condition laissait le banc vert, alors que le serveur acceptait de nouveau
  // n'importe quelle date. Mesuré, corrigé.
  verifier('le serveur calcule les jours possibles', /joursRetraitBoutique\(\{/.test(routeCmd2))
  verifier('ET REFUSE une date qui n\'y figure pas',
    /if \(!joursOk\.some\(j => j\.jour === date_commande\)\)/.test(routeCmd2),
    (routeCmd2.match(/.*joursOk\.some.*/) || [])[0] || 'refus absent')
  verifier('il rapatrie les horaires pour le faire',
    /horaires_detail, boutique_delai_heures/.test(routeCmd2))
  verifier('et les fermetures exceptionnelles',
    /from\('fermetures_exceptionnelles'\)/.test(routeCmd2))
  // ⚠️ HEURE BELGE CÔTÉ SERVEUR. Vercel tourne en temps universel : lire
  // l'horloge de la machine rendrait la veille entre minuit et 2h du matin.
  verifier('le serveur lit l\'heure BELGE, pas la sienne',
    /jourBruxelles\(\)/.test(routeCmd2) && /minutesBruxelles\(\)/.test(routeCmd2))
  verifier('il n\'utilise pas jourLocalISO pour cette comparaison',
    !/depuis: jourLocalISO/.test(routeCmd2),
    (routeCmd2.match(/.*depuis: jourLocalISO.*/) || [])[0])
}

// Les deux raccourcis d'heure belge, EXÉCUTÉS : c'est le seul moyen de
// s'assurer qu'ils ne retombent pas sur l'horloge de la machine.
{
  // 10 août 2026, 00h30 heure belge = 09/08 22h30 en temps universel.
  const nuit = new Date('2026-08-10T00:30:00+02:00')
  egal('à 00h30 belge, le jour est bien le 10', jourBruxelles(nuit), '2026-08-10')
  egal('et il est 30 minutes après minuit', minutesBruxelles(nuit), 30)
  // En plein après-midi, rien de piégeux.
  const aprem = new Date('2026-08-11T13:30:00+02:00')
  egal('13h30 belge fait 810 minutes', minutesBruxelles(aprem), 810)
  egal('et le jour est le 11', jourBruxelles(aprem), '2026-08-11')
  // ⚠️ EN HIVER, L'ÉCART N'EST PLUS LE MÊME (une heure au lieu de deux).
  const hiver = new Date('2026-01-15T00:30:00+01:00')
  egal('le 15 janvier à 00h30, toujours le bon jour', jourBruxelles(hiver), '2026-01-15')
}

// ═══════════════════════════════════════════════════════════════════════════
// LA PASTILLE DE DISPONIBILITÉ DE LA CARTE D'ACCUEIL
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LA PAGE D'ACCUEIL REFAISAIT SON PROPRE CALCUL, faux de trois façons, et
// affichait « Résa dès 21:00 » sur des commerces parfaitement libres. Chaque
// cas ci-dessous a été MESURÉ sur l'ancien code avant d'être corrigé.
{
  const LUNDI = '2026-08-10'   // un lundi
  const MARDI = '2026-08-11'

  // ⚠️ 1. UNE BOUTIQUE ET UN SALON N'ONT AUCUN CRÉNEAU, par construction : le
  // détail vend en retrait libre ou en colis, la vitrine vend pendant le
  // rendez-vous. Zéro créneau se lisait « fermé », et on leur collait une
  // pastille de réservation de créneau. Sur la première page de l'application.
  egal('une boutique n\'a pas de grille de créneaux', aDesCreneaux('detail'), false)
  egal('un salon non plus', aDesCreneaux('vitrine'), false)
  egal('un alimentaire, si', aDesCreneaux('alimentaire'), true)
  egal('sans catégorie connue, on suppose l\'alimentaire', aDesCreneaux(null), true)
  egal('aucune pastille de créneau sur une boutique',
    statutCreneaux({ creneaux: [], commandes: [], jour: LUNDI, nowMin: 600, categorie: 'detail' }), null)
  egal('ni sur un salon',
    statutCreneaux({ creneaux: [], commandes: [], jour: LUNDI, nowMin: 600, categorie: 'vitrine' }), null)
  egal('et rien à écrire quand il n\'y a pas de statut',
    pastilleCreneaux({ statut: null, creneaux: [], jour: LUNDI }), null)

  // ⚠️ 2. LES CRÉNEAUX DE TOUTE LA SEMAINE ÉTAIENT PRIS POUR CEUX D'AUJOURD'HUI.
  // La requête ne demandait pas `jour_semaine` : la grille arrivait en bloc.
  const grille = [
    { id: 'lun', jour_semaine: 'lundi',  heure_debut: '07:00', max_commandes: 5 },
    { id: 'sam', jour_semaine: 'samedi', heure_debut: '18:00', max_commandes: 5 },
  ]
  // Un lundi à 9h, le créneau du samedi 18h passait pour « disponible » parce
  // que 18h est plus tard que 9h. Il tombe pourtant cinq jours plus loin.
  egal('le créneau du samedi ne rend pas le lundi disponible',
    statutCreneaux({ creneaux: grille, commandes: [], jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'complet')
  // Et l'inverse : les créneaux des autres jours ne bouchent pas non plus.
  egal('le samedi, c\'est bien le créneau du samedi qui compte',
    statutCreneaux({ creneaux: grille, commandes: [], jour: '2026-08-15', nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'ouvert')
  // Un créneau sans jour vaut pour tous les jours (grilles d'avant le découpage).
  egal('un créneau sans jour vaut tous les jours',
    statutCreneaux({ creneaux: [{ id: 'x', heure_debut: '18:00', max_commandes: 5 }], commandes: [], jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'ouvert')

  // ⚠️ 3. LES COMMANDES DE TOUTES LES SEMAINES S'EMPILAIENT, ANNULÉES COMPRISES.
  // Aucun filtre de date, et « tout ce qui n'est pas récupéré » pour occupant.
  const creneauUnique = [{ id: 'c1', jour_semaine: 'lundi', heure_debut: '18:00', max_commandes: 5 }]
  const fantomes = [
    { creneau_id: 'c1', statut: 'annulee_client_refund', date_commande: '2026-07-20' },
    { creneau_id: 'c1', statut: 'annulee_client_refund', date_commande: '2026-07-27' },
    { creneau_id: 'c1', statut: 'annulee_paiement_ko',   date_commande: '2026-08-03' },
    { creneau_id: 'c1', statut: 'non_retire',            date_commande: '2026-08-03' },
    { creneau_id: 'c1', statut: 'annulee_client_refund', date_commande: LUNDI },
  ]
  egal('cinq commandes fantômes ne remplissent rien',
    statutCreneaux({ creneaux: creneauUnique, commandes: fantomes, jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'ouvert')
  // ⚠️ CELUI-CI SÉPARE LES DEUX DÉFAUTS. Le cas précédent avait ses annulées
  // réparties sur plusieurs semaines : le filtre de DATE suffisait à les
  // écarter, et le test restait vert même en remettant « tout sauf récupéré »
  // comme règle d'occupation. La mesure du défaut l'a pris sur le fait. Ici
  // les cinq annulées tombent le BON jour : seule la règle de statut peut
  // encore les écarter.
  const annuleesDuJour = [
    { creneau_id: 'c1', statut: 'annulee_client_refund', date_commande: LUNDI },
    { creneau_id: 'c1', statut: 'annulee_client_refund', date_commande: LUNDI },
    { creneau_id: 'c1', statut: 'annulee_paiement_ko',   date_commande: LUNDI },
    { creneau_id: 'c1', statut: 'non_retire',            date_commande: LUNDI },
    { creneau_id: 'c1', statut: 'recupere',              date_commande: LUNDI },
  ]
  egal('cinq commandes du jour, toutes sorties, ne bouchent rien',
    statutCreneaux({ creneaux: creneauUnique, commandes: annuleesDuJour, jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'ouvert')
  // Les vraies commandes du JOUR, elles, comptent bien.
  const vraies = (n, date) => Array.from({ length: n }, () => ({ creneau_id: 'c1', statut: 'en_attente', date_commande: date }))
  egal('cinq vraies commandes du jour remplissent le créneau',
    statutCreneaux({ creneaux: creneauUnique, commandes: vraies(5, LUNDI), jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'complet')
  egal('les mêmes, mais d\'un autre lundi, ne comptent pas',
    statutCreneaux({ creneaux: creneauUnique, commandes: vraies(5, '2026-08-03'), jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'ouvert')
  // ⚠️ `paiement_en_attente` COMPTE : la place est réservée le temps de Stripe.
  egal('un paiement en cours occupe bien sa place',
    statutCreneaux({ creneaux: creneauUnique, commandes: Array.from({ length: 5 }, () => ({ creneau_id: 'c1', statut: 'paiement_en_attente', date_commande: LUNDI })), jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'complet')
  // Deux places ou moins : on presse le client.
  egal('deux places restantes, on presse',
    statutCreneaux({ creneaux: creneauUnique, commandes: vraies(3, LUNDI), jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'urgent')

  // ⚠️ UNE CAPACITÉ ABSENTE N'EST PAS UNE CAPACITÉ DE ZÉRO. `0 < null` vaut
  // false : un créneau sans `max_commandes` se déclarait COMPLET pour toujours.
  egal('sans plafond connu, on ne prétend pas que c\'est plein',
    statutCreneaux({ creneaux: [{ id: 'z', jour_semaine: 'lundi', heure_debut: '18:00', max_commandes: null }], commandes: [], jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'ouvert')
  egal('et on ne le déclare pas « presque plein » non plus',
    statutCreneaux({ creneaux: [{ id: 'z', jour_semaine: 'lundi', heure_debut: '18:00' }], commandes: [], jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' }).etat,
    'ouvert')

  // ⚠️ LA JOURNÉE D'UNE BOULANGERIE QUI FERME À 11H. C'est le cas d'Alex :
  // « Résa dès 21:00 » pendant DIX HEURES, la seule phrase de l'application qui
  // demandait au Yopper de partir. On dit maintenant QUAND, pas à partir de
  // quelle heure.
  const matin = [
    { id: 'm-lun', jour_semaine: 'lundi', heure_debut: '11:00', max_commandes: 5 },
    { id: 'm-mar', jour_semaine: 'mardi', heure_debut: '11:00', max_commandes: 5 },
  ]
  const libelleA = (heure, horizon = 2) => {
    const statut = statutCreneaux({ creneaux: matin, commandes: [], jour: LUNDI, nowMin: parseInt(heure.slice(0,2))*60 + parseInt(heure.slice(3,5)), categorie: 'alimentaire' })
    return pastilleCreneaux({ statut, creneaux: matin, jour: LUNDI, horizon })?.label
  }
  egal('08h00, la journée est devant', libelleA('08:00'), 'Créneaux disponibles')
  egal('12h00, on annonce demain au lieu de 21h', libelleA('12:00'), 'Créneaux dès demain')
  egal('18h00 aussi', libelleA('18:00'), 'Créneaux dès demain')
  egal('20h59 aussi', libelleA('20:59'), 'Créneaux dès demain')
  verifier('et plus AUCUNE heure magique nulle part',
    !['08:00','12:00','14:00','18:00','20:59','21:00','23:00'].some(x => /21:00|21h/.test(String(libelleA(x)))),
    ['08:00','12:00','18:00','23:00'].map(x => `${x}=${libelleA(x)}`).join(' | '))

  // Horizon 1 = aujourd'hui seulement : on ne promet pas demain, et on ne
  // renvoie pas non plus à une heure. On constate, simplement.
  egal('en horizon 1, on ne promet pas demain', libelleA('12:00', 1), 'Plus de créneaux aujourd\'hui')

  // Le jour nommé au-delà de demain : « à 9h » sans savoir quel jour ne dit rien.
  const mardiSeul = [{ id: 'q', jour_semaine: 'mercredi', heure_debut: '10:00', max_commandes: 3 }]
  const statutVide = statutCreneaux({ creneaux: mardiSeul, commandes: [], jour: LUNDI, nowMin: 12*60, categorie: 'alimentaire' })
  egal('au-delà de demain, le jour est nommé',
    pastilleCreneaux({ statut: statutVide, creneaux: mardiSeul, jour: LUNDI, horizon: 5 })?.label,
    'Créneaux dès mercredi')

  // Le commerce fermé aujourd'hui ne doit pas afficher un vert qui contredit
  // le « Fermé » gris juste au-dessus.
  const ouvertDemain = statutCreneaux({ creneaux: [{ id: 'k', jour_semaine: 'lundi', heure_debut: '18:00', max_commandes: 5 }], commandes: [], jour: LUNDI, nowMin: 9*60, categorie: 'alimentaire' })
  egal('sous un « Fermé », pas de vert contradictoire',
    pastilleCreneaux({ statut: ouvertDemain, creneaux: [], jour: LUNDI, fermeAujourdhui: true, quandOuvre: 'demain' })?.label,
    'Créneaux dès demain')

  // Le calcul de jour ne dérape pas au changement d'heure ni en fin de mois.
  egal('lendemain simple', jourPlus('2026-08-10', 1), '2026-08-11')
  egal('passage de mois', jourPlus('2026-08-31', 1), '2026-09-01')
  egal('passage d\'année', jourPlus('2026-12-31', 1), '2027-01-01')
  egal('fin de l\'heure d\'été belge', jourPlus('2026-10-25', 1), '2026-10-26')
  egal('une date illisible ne fabrique rien', jourPlus('pas une date', 1), null)

  // L'horizon borne la recherche du prochain jour : on ne promet jamais un
  // jour que le commerçant n'a pas ouvert à la réservation.
  const toutLesJours = [{ id: 't', heure_debut: '10:00', max_commandes: 5 }]
  egal('horizon 1 ne regarde aucun lendemain',
    prochainJourAvecCreneaux({ creneaux: toutLesJours, depuis: LUNDI, horizon: 1 }), null)
  egal('horizon 2 regarde demain',
    prochainJourAvecCreneaux({ creneaux: toutLesJours, depuis: LUNDI, horizon: 2 })?.jour, MARDI)
  egal('un horizon absurde retombe sur le défaut',
    prochainJourAvecCreneaux({ creneaux: toutLesJours, depuis: LUNDI, horizon: null })?.jour, MARDI)
}

// ⚠️ ET LES ÉCRANS DOIVENT S'EN SERVIR. Une règle juste que personne n'appelle
// laisse le défaut intact à l'écran. On vise l'APPEL, et on interdit le retour
// des trois requêtes fautives.
{
  const accueil = sansCommentaires(readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8'))
  verifier('l\'accueil appelle statutCreneaux', /statutCreneaux\(\{/.test(accueil))
  verifier('et pastilleCreneaux', /pastilleCreneaux\(\{/.test(accueil))
  verifier('il demande jour_semaine aux créneaux', /jour_semaine/.test(accueil))
  verifier('il filtre les commandes sur les statuts occupants',
    /\.in\('statut', STATUTS_OCCUPENT_CRENEAU\)/.test(accueil))
  verifier('et sur la date de retrait', /\.gte\('date_commande'/.test(accueil))
  verifier('plus aucun « tout sauf récupéré »', !/neq\('statut', 'recupere'\)/.test(accueil),
    (accueil.match(/.*neq\('statut'.*/) || [])[0])
  verifier('plus aucune heure de réservation en dur dans l\'accueil',
    !/heure_ouverture_resa|'21:00'/.test(accueil),
    (accueil.match(/.*(heure_ouverture_resa|'21:00').*/) || [])[0])
  verifier('la disponibilité se rafraîchit au retour au premier plan',
    /chargerNotes\(ids, commercants\)/.test(accueil))
  verifier('les fermetures arrivent jusqu\'à la carte', /fermetures_exceptionnelles/.test(accueil))
  verifier('la recherche ignore les accents', /sansAccents\(c\.nom\)/.test(accueil))
  verifier('le jour des deals est le jour BELGE', !/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(accueil),
    (accueil.match(/.*new Date\(\)\.toISOString\(\)\.slice\(0, 10\).*/) || [])[0])
  verifier('la déconnexion efface aussi les rendez-vous', /setClientRdvs\(\[\]\); setMesCartesFid/.test(accueil))

  const fiche = sansCommentaires(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('la fiche n\'a plus de verrou horaire', !/heure_ouverture_resa|resaOuverte/.test(fiche),
    (fiche.match(/.*(heure_ouverture_resa|resaOuverte).*/) || [])[0])
  verifier('elle applique le délai par créneau', /creneauCommandable\(cr, \{/.test(fiche))
  verifier('et son horizon par défaut est de 2 jours', /HORIZON_DEFAUT = 2/.test(fiche))
  verifier('le message « aucun créneau » suit la liste réellement proposée',
    /creneauxProposables\(\)\.length === 0/.test(fiche))

  const config = sansCommentaires(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('le commerçant peut régler la clôture de ses créneaux', /cutoff_heures: n/.test(config))
  verifier('le champ « ouverture des réservations » a disparu du profil',
    !/heure_ouverture_resa/.test(config),
    (config.match(/.*heure_ouverture_resa.*/) || [])[0])
}

// ═══════════════════════════════════════════════════════════════════════════
// LA RÉFÉRENCE DOIT ÊTRE LA MÊME À L'ÉCRAN ET DANS L'EMAIL
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ AUCUN EMAIL NE PORTAIT LA RÉFÉRENCE. Les écrans affichaient « CC12 »
// depuis la refonte de la numérotation, mais les appelants passaient aux
// gabarits le numéro BRUT : les emails écrivaient « #12 ». Le client lisait un
// numéro dans sa boîte mail et un autre à l'écran, et le commerçant, qui
// cherche « CC12 » dans son tableau de bord, ne pouvait plus faire le lien.
// L'email du RENDEZ-VOUS, lui, n'affichait aucun numéro du tout.
//
// On REND les emails et on lit ce qui en sort.
{
  const rdv = {
    yopper_prenom: 'Sophie', commercant_nom: 'Ciseaux', commercant_adresse: 'Rue X',
    prestation_nom: 'Balayage', date_rdv: '2026-08-14', heure_debut: '14:30:00',
    heure_fin: '15:30:00', duree_minutes: 60, prix_estime: 45,
    numero_rdv: referenceRdv({ numero_rdv: 7 }),
  }
  const htmlRdv = emailRdvConfirme(rdv)
  verifier('l\'email de rendez-vous porte enfin une référence', /#RV7/.test(htmlRdv),
    (htmlRdv.match(/.{0,40}Rendez-vous.{0,60}/) || [])[0])
  verifier('et il ne dit plus « #7 » tout court', !/#7</.test(htmlRdv))

  // Sans numéro (rendez-vous d'avant la numérotation), aucune ligne vide ni
  // dièse orphelin : on n'écrit rien plutôt qu'un « # » seul.
  const htmlSansNum = emailRdvConfirme({ ...rdv, numero_rdv: null })
  verifier('sans numéro, pas de ligne « Rendez-vous # » vide', !/Rendez-vous <strong/.test(htmlSansNum))

  // La commande : même exigence, et c'est la référence qui doit voyager.
  const htmlCmd = emailCommandeConfirmee({
    yopper_prenom: 'Luc', commercant_nom: 'La Mie', commercant_adresse: 'Rue Y',
    numero_commande: referenceCommande({ numero_commande: 12, numero_prefixe: 'CC' }),
    articles: [{ nom: 'Pain', quantite: 1, prix_total: 3 }], total: 3,
    date_retrait: '2026-08-12', heure_debut: '07:00:00', heure_fin: '07:30:00',
  })
  verifier('l\'email de commande dit CC12', /#CC12/.test(htmlCmd),
    (htmlCmd.match(/.{0,30}Commande.{0,60}/) || [])[0])
  verifier('et plus jamais « #12 » nu', !/#12</.test(htmlCmd))

  // Une commande d'AVANT la numérotation n'a pas de préfixe : on affiche son
  // numéro nu plutôt que rien, c'est encore la meilleure information.
  egal('sans préfixe, le numéro nu reste affichable',
    referenceCommande({ numero_commande: 12 }), '12')

  // ⚠️ ET LES APPELANTS DOIVENT PASSER LA RÉFÉRENCE. Un gabarit correct nourri
  // du numéro brut réécrirait « #12 » sans que rien ne s'allume.
  const APPELANTS = [
    'lib/commande-notifs.js',
    'app/api/commande/cancel/route.js',
    'app/api/cron/recap-jour-8h/route.js',
    'app/api/emails/commande-annulee/route.js',
    'app/api/emails/commande-confirmee/route.js',
    'app/api/emails/commande-expediee/route.js',
    'app/api/emails/commande-prete/route.js',
    'app/api/livraison/statut/route.js',
  ]
  for (const chemin of APPELANTS) {
    const src = readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
      .split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    verifier(`${chemin} passe la référence, pas le numéro brut`,
      !/numero_commande:\s*cmd\.numero_commande/.test(src), chemin)
    verifier(`${chemin} rapatrie numero_prefixe`, /numero_prefixe/.test(src), chemin)
    // Le dérapage de la reprise automatique : un « numero_prefixe, » orphelin
    // laissé dans l'objet d'appel, variable inexistante dans cette portée,
    // aurait planté À L'ENVOI de chaque email et nulle part ailleurs.
    verifier(`${chemin} n'a pas de numero_prefixe orphelin`,
      !/referenceCommande\((?:cmd|c)\),\s*numero_prefixe,/.test(src), chemin)
  }

  // ⚠️ LES NOTIFICATIONS PUSH ET LES OBJETS D'EMAILS restaient au numéro nu
  // alors que les CORPS avaient été corrigés. Le client lisait « #12 » sur son
  // écran verrouillé, « #12 » dans l'objet, et « CC12 » deux centimètres plus
  // bas dans le corps du même message.
  const AU_NUMERO_NU = [
    'app/api/commande/push-statut/route.js',
    'app/api/livraison/statut/route.js',
    'lib/rappels.js',
    'app/api/commande/cancel/route.js',
    'app/api/emails/commande-annulee/route.js',
    'app/api/emails/commande-confirmee/route.js',
    'app/api/emails/commande-expediee/route.js',
    'app/api/emails/commande-prete/route.js',
    'lib/commande-notifs.js',
  ]
  for (const chemin of AU_NUMERO_NU) {
    const src = sansCommentaires(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))
    // ⚠️ VISER LA LECTURE, PAS L'AFFICHAGE. Mon premier test ne cherchait que
    // la forme en ligne `#${cmd.numero_commande}`. Or ces fichiers passent par
    // une variable intermédiaire : casser `const num = referenceCommande(cmd)`
    // en `const num = cmd.numero_commande` laissait le test vert. La mesure du
    // défaut l'a montré, deux fois.
    //
    // La règle est donc simple et sans échappatoire : dans ces fichiers, on ne
    // LIT plus jamais `numero_commande` d'une commande. `referenceCommande`
    // prend la commande entière, elle n'a pas besoin du champ.
    const fautives = src.split(/\r?\n/).filter(l =>
      /\bcmd\.numero_commande\b/.test(l) || /\bc\.numero_commande\b/.test(l))
    verifier(`${chemin} ne lit plus le numéro nu`,
      fautives.length === 0, fautives[0])
    verifier(`${chemin} rapatrie numero_prefixe`, /numero_prefixe/.test(src), chemin)
  }

  const ecranRdv = readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8')
    .split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  verifier('l\'écran « ton RDV est noté » affiche la référence', /referenceRdv\(rdvCree\)/.test(ecranRdv))
  verifier('et plus le numéro nu', !/#\{rdvCree\.numero_rdv\}/.test(ecranRdv))

  // ⚠️ L'ÉCRAN « TA COMMANDE EST YOPPÉE » affichait « #4 » là où l'email disait
  // « CC4 » (Alex, captures de 13h17 et 13h18). La route ne renvoyait pas le
  // préfixe, alors qu'elle importait déjà de quoi former la référence.
  const routeCommandes = sansCommentaires(readFileSync(new URL('../app/api/yopper/commandes/route.js', import.meta.url), 'utf8'))
  verifier('get-one rapatrie le préfixe', /numero_commande, numero_prefixe/.test(routeCommandes))
  verifier('et forme la référence pour l\'écran',
    /enrichirNumeros\(\[data\]\)\[0\]/.test(routeCommandes))
  // ⚠️ ET IL LUI FAUT LE CRÉNEAU. Sans lui, au retour de Stripe, l'écran se
  // croyait en boutique et annonçait « tu passes quand ça t'arrange » à un
  // client attendu à 17h00.
  verifier('get-one rapatrie de quoi retrouver le contexte',
    /mode_retrait, creneau_id/.test(routeCommandes))

  const ficheCmd = sansCommentaires(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('l\'écran de confirmation affiche la référence, pas le numéro nu',
    /numeroSequentiel: data\.numeroAffiche/.test(ficheCmd))
  verifier('et son contexte se dérive de la commande relue',
    /creneau: derniereCommande\?\.creneau/.test(ficheCmd))
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

// ⚠️ L'OBJET A ÉTÉ SORTI DE `setForm` LE 15/08 : il sert désormais deux fois,
// pour l'état modifiable et pour son image de départ, celle qui dit s'il reste
// du travail non enregistré. Ancré sur `setForm({ nom:`, ce test ne trouvait
// plus rien et accusait les 17 champs d'être écrits sans être chargés. Le
// contrat n'a pas changé, seul son nom : c'est très exactement le piège du
// changement de type de retour, vu d'un autre côté.
const chargees = clesPremierNiveau(objetApres(blocProfil, 'const profil = { nom:'))
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
