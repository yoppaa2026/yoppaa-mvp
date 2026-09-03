// Banc de l'ARGENT et du LÉGAL : ventilation TVA, journal comptable, bons
// cadeaux, délais d'annulation.
//
// POURQUOI CES QUATRE-LÀ. Ce sont les calculs dont une erreur ne se voit pas
// tout de suite et coûte le plus cher quand elle se voit : une TVA mal
// ventilée part dans une déclaration, un journal faux passe chez un comptable,
// un bon cadeau mal calculé, c'est de l'argent qui sort, et un délai
// d'annulation décalé d'une heure prive un client de son remboursement.
//
// Règle du banc : on ne teste pas que « ça rend un nombre », on teste que les
// totaux SE RECONSTITUENT. Un journal dont la somme des ventilations ne fait
// pas le chiffre d'affaires est un journal faux, quelle que soit sa jolie mise
// en forme.

import { readFileSync, readdirSync } from 'node:fs'
import { ventiler, tauxFraisLivraison, cleTaux, libelleTaux, tauxPourArticle, imputerRemise, TAUX_NON_RENSEIGNE, REGIME_EMPORTER } from '../lib/tva.js'
import { construireLignes, journalParJour, tauxRencontres, estComptabilisable, csvJournal, csvDetail, montantStripe, sommeStripe, arrondi, referencesNonQualifiees, partDejaTaxee, regimesParBon, libelleRegimeBon } from '../lib/export-comptable.js'
import { regimeBon, regimeDuBon, USAGE_UNIQUE, USAGE_MULTIPLE } from '../lib/bons-tva.js'
import { calculerRemiseBon, normaliserCodeBon, genererCodeBon, bonExpire, BON_MONTANT_MIN, BON_MONTANT_MAX } from '../lib/bons-cadeaux.js'
import { brusselsInstant } from '../lib/timezone.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// ⚠️ UN `select` PEUT ÊTRE UNE CONSTANTE, ET CES GARDES LE LISAIENT EN DUR.
// Depuis le 02/09, les colonnes des commandes et des rendez-vous vivent dans
// `COLS_COMMANDE` / `COLS_RDV`, parce que DEUX requêtes les partagent : les
// ventes de la période, puis celles remboursées pendant la période. Une garde
// qui ne sait lire qu'un littéral aurait rougi pour rien, puis aurait été
// « corrigée » en l'affaiblissant. Elle résout donc la constante.
//
// ⚠️ ET ELLE REND VIDE SI ELLE NE TROUVE RIEN : une garde qui ne peut plus
// rougir ne garde plus rien.
const selectsDe = (src, table) => {
  const re = new RegExp(`from\\('${table}'\\)\\s*(?:\\/\\/[^\\n]*\\n\\s*)*\\.select\\(\\s*(?:'([^']*)'|([A-Z_][A-Z0-9_]*))`, 'g')
  return [...src.matchAll(re)].map(m => ({ litteral: m[1] ?? null, constante: m[2] ?? null }))
}
const colonnesDe = (src, table) => selectsDe(src, table)
  .map(s => s.litteral !== null
    ? s.litteral
    : (src.match(new RegExp(`const ${s.constante} = '([^']*)'`))?.[1] || ''))
  .join(' ')

// ═══════════════════════════════════════════════════════════════════════════
// 1. VENTILATION TVA — le prix saisi est TTC, on en extrait la taxe
// ═══════════════════════════════════════════════════════════════════════════
// Belgique : 6 % à emporter, 12 % sur place, 21 % alcool et non alimentaire.
egal('21% sur 121,00', ventiler(121, 21), { base: 100, tva: 21 })
egal('6% sur 10,60', ventiler(10.60, 6), { base: 10, tva: 0.60 })
egal('12% sur 11,20', ventiler(11.20, 12), { base: 10, tva: 1.20 })
// La base plus la TVA doit TOUJOURS redonner le TTC, sans centime perdu.
for (const [ttc, taux] of [[21.90, 21], [3.33, 6], [99.99, 12], [0.50, 21], [7.77, 6]]) {
  const v = ventiler(ttc, taux)
  verifier(`base + TVA = TTC (${ttc} à ${taux}%)`, Math.abs((v.base + v.tva) - ttc) < 0.005, JSON.stringify(v))
}
// Taux inconnu : on ne fabrique pas une TVA imaginaire.
egal('taux nul = pas de TVA', ventiler(50, 0), { base: 50, tva: 0 })
egal('taux absent = pas de TVA', ventiler(50, null), { base: 50, tva: 0 })

egal('clé d’un taux absent', cleTaux(null), TAUX_NON_RENSEIGNE)
egal('clé d’un taux présent', cleTaux(6), 6)
egal('libellé explicite', libelleTaux(TAUX_NON_RENSEIGNE), 'Taux non renseigne')

// Frais de livraison : le taux le PLUS BAS de la commande (tolérance admise).
egal('frites 6% + bière 21% → frais à 6%', tauxFraisLivraison([21, 6], 21), 6)
egal('commande homogène', tauxFraisLivraison([21, 21], 6), 21)

// Taux d'un article selon le régime.
egal('article sans taux → défaut du commerce',
  tauxPourArticle({ article: { tva_taux: null }, regime: REGIME_EMPORTER, tauxDefautCommerce: 21 }), 21)
egal('taux de l’article prioritaire',
  tauxPourArticle({ article: { tva_taux: 6 }, regime: REGIME_EMPORTER, tauxDefautCommerce: 21 }), 6)

// ═══════════════════════════════════════════════════════════════════════════
// 2. JOURNAL COMPTABLE — le total doit toujours se reconstituer
// ═══════════════════════════════════════════════════════════════════════════
verifier('une commande récupérée compte', estComptabilisable('recupere'))
verifier('une commande annulée ne compte pas', !estComptabilisable('annulee_client_refund'))
verifier('un paiement échoué ne compte pas', !estComptabilisable('annulee_paiement_ko'))

// Commande mixte : 6 % et 21 %, plus des frais de livraison.
const commandeMixte = {
  id: 'c1', numero_commande: 42, statut: 'recupere', date_commande: '2026-08-04',
  mode_retrait: 'livraison', regime_tva: 'emporter', paye_en_ligne: true,
  total: 28.50, frais_livraison: 3.00, tva_taux_livraison: 6,
  stripe_frais: 0.65, stripe_net: 27.85, bon_cadeau_montant: 0,
  commande_articles: [
    { article_id: 'a1', quantite: 2, prix_unitaire: 8.00, tva_taux: 6 },   // 16,00
    { article_id: 'a2', quantite: 1, prix_unitaire: 9.50, tva_taux: 21 },  //  9,50
  ],
}
let lignes = construireLignes({ commandes: [commandeMixte], rdvs: [], tauxDefaut: 21 })
egal('une ligne produite', lignes.length, 1)
egal('canal livraison', lignes[0].canal, 'Livraison')
egal('ventilation 6% (articles + frais)', lignes[0].parTaux[6], 19)
egal('ventilation 21%', lignes[0].parTaux[21], 9.5)
const sommeVentil = Object.values(lignes[0].parTaux).reduce((s, v) => s + v, 0)
verifier('somme des ventilations = total encaissé', Math.abs(sommeVentil - 28.50) < 0.005, `${sommeVentil} vs 28.5`)

// ÉCART : le détail ne reconstitue pas le total (remise, deal, option non
// détaillée). Il doit être RATTACHÉ, jamais perdu.
const commandeAvecEcart = {
  ...commandeMixte, id: 'c2', total: 30.00, frais_livraison: 0, tva_taux_livraison: null,
}
lignes = construireLignes({ commandes: [commandeAvecEcart], rdvs: [], tauxDefaut: 21 })
const sommeEcart = Object.values(lignes[0].parTaux).reduce((s, v) => s + v, 0)
verifier('l’écart est rattaché, pas perdu', Math.abs(sommeEcart - 30.00) < 0.005, `${sommeEcart} vs 30`)

// Bon cadeau : la part payée par le bon n'est ni en ligne ni au comptoir.
const commandeBon = { ...commandeMixte, id: 'c3', bon_cadeau_montant: 10 }
lignes = construireLignes({ commandes: [commandeBon], rdvs: [], tauxDefaut: 21 })
egal('part du bon isolée', lignes[0].bonCadeau, 10)
egal('encaissé en ligne hors bon', lignes[0].enLigne, 18.5)
verifier('en ligne + comptoir + bon = total',
  Math.abs((lignes[0].enLigne + lignes[0].comptoir + lignes[0].bonCadeau) - lignes[0].total) < 0.005,
  JSON.stringify(lignes[0]))

// Acomptes de rendez-vous : seul l'acompte entre au journal, jamais le solde.
const rdvPaye = { id: 'r1', numero_rdv: 7, statut: 'honore', date_rdv: '2026-08-04', acompte_montant: 8.75, acompte_paye: true, acompte_paye_en_ligne: true, tva_taux: 21, prix_estime: 35, stripe_frais: 0.29, stripe_net: 8.46 }
const rdvNonPaye = { id: 'r2', statut: 'confirme', date_rdv: '2026-08-04', acompte_montant: 0, acompte_paye: false }
lignes = construireLignes({ commandes: [], rdvs: [rdvPaye, rdvNonPaye], tauxDefaut: 21 })
egal('seul l’acompte payé entre au journal', lignes.length, 1)
egal('montant = acompte, pas le prix de la prestation', lignes[0].total, 8.75)
verifier('le solde réglé sur place n’apparaît pas', lignes[0].total !== 35)

// Taux non renseigné : signalé, jamais deviné.
const commandeSansTaux = {
  id: 'c4', statut: 'recupere', date_commande: '2026-08-04', mode_retrait: 'retrait',
  paye_en_ligne: false, total: 10, frais_livraison: 0,
  commande_articles: [{ article_id: 'a9', quantite: 1, prix_unitaire: 10, tva_taux: null }],
}
lignes = construireLignes({ commandes: [commandeSansTaux], rdvs: [], tauxDefaut: null })
verifier('taux manquant marqué « non renseigné »', TAUX_NON_RENSEIGNE in lignes[0].parTaux, JSON.stringify(lignes[0].parTaux))

// Journal quotidien : les totaux du jour doivent égaler la somme des lignes.
lignes = construireLignes({ commandes: [commandeMixte, commandeBon], rdvs: [rdvPaye], tauxDefaut: 21 })
const jours = journalParJour(lignes)
egal('un seul jour', jours.length, 1)
egal('trois transactions', jours[0].nb, 3)
const totalLignes = lignes.reduce((s, l) => s + l.total, 0)
verifier('total du jour = somme des lignes', Math.abs(jours[0].total - totalLignes) < 0.005, `${jours[0].total} vs ${totalLignes}`)
const totalVentilJour = Object.values(jours[0].parTaux).reduce((s, v) => s + v, 0)
verifier('ventilation du jour = total du jour', Math.abs(totalVentilJour - jours[0].total) < 0.005, `${totalVentilJour} vs ${jours[0].total}`)
verifier('frais Stripe additionnés', Math.abs(jours[0].fraisStripe - (0.65 + 0.65 + 0.29)) < 0.005, String(jours[0].fraisStripe))

egal('taux rencontrés triés, NR en dernier', tauxRencontres(lignes), [6, 21])

// Le fichier remis au comptable : format belge, sinon Excel massacre tout.
const csv = csvJournal({ lignes, commercant: { nom: 'La Mie de Test', numero_tva: 'BE0123456789' }, du: '2026-08-01', au: '2026-08-31' })
verifier('BOM UTF-8 en tête', csv.charCodeAt(0) === 0xFEFF)
verifier('séparateur point-virgule', csv.includes(';'))
verifier('virgule décimale', /\d+,\d{2}/.test(csv), csv.slice(0, 200))
verifier('le nom du commerce y figure', csv.includes('La Mie de Test'))

// ═══════════════════════════════════════════════════════════════════════════
// 3. BONS CADEAUX — de l'argent qui sort
// ═══════════════════════════════════════════════════════════════════════════
egal('remise plafonnée par le solde', calculerRemiseBon(20, 50), 20)
egal('remise plafonnée par le dû', calculerRemiseBon(50, 20), 20)
// Stripe refuse un paiement sous 0,50 € : quand le bon laisserait un reste
// dérisoire, on plafonne la remise pour laisser exactement 0,50 € à payer.
// (Le solde non consommé reste sur le bon pour la fois suivante.)
egal('reste dérisoire ramené à 0,50 €', calculerRemiseBon(20, 20.30), 19.80)
// Un bon qui couvre TOUT ne laisse aucun reste : rien à plafonner, pas de
// passage par Stripe. Je l'attendais plafonné à tort à la première écriture.
egal('bon qui couvre tout : remise entière', calculerRemiseBon(50, 20.30), 20.30)
egal('couverture exacte autorisée', calculerRemiseBon(20, 20), 20)
egal('solde vide', calculerRemiseBon(0, 20), 0)
egal('solde négatif', calculerRemiseBon(-5, 20), 0)
egal('rien à payer', calculerRemiseBon(20, 0), 0)
for (const [solde, du] of [[13.37, 20.10], [5, 5.20], [100, 0.60], [7.5, 7.9]]) {
  const r = calculerRemiseBon(solde, du)
  const reste = Math.round((du - r) * 100) / 100
  verifier(`reste jamais entre 0 et 0,50 (solde ${solde}, dû ${du})`, reste === 0 || reste >= 0.5, `reste ${reste}`)
  verifier(`remise jamais supérieure au solde (${solde}/${du})`, r <= solde + 0.001)
}

egal('code normalisé depuis une saisie libre', normaliserCodeBon('bc 7k2m 9xq4'), 'BC-7K2M-9XQ4')
egal('code déjà propre', normaliserCodeBon('BC-7K2M-9XQ4'), 'BC-7K2M-9XQ4')
egal('sans préfixe', normaliserCodeBon('7K2M9XQ4'), 'BC-7K2M-9XQ4')
egal('saisie trop courte refusée', normaliserCodeBon('BC-123'), null)
egal('saisie vide refusée', normaliserCodeBon(''), null)
verifier('code généré au bon format', /^BC-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(genererCodeBon()))
verifier('code généré sans caractère ambigu', !/[01OIL]/.test(genererCodeBon().replace('BC-', '')))
verifier('un code généré se renormalise en lui-même', (() => { const c = genererCodeBon(); return normaliserCodeBon(c) === c })())

// ─── Le TIRAGE du code, pas seulement sa forme ────────────────────────────
// Un bon cadeau est un instrument au porteur : deviner un code, c'est
// encaisser l'argent d'un autre. Le format était vérifié, jamais le hasard.
const CODES = Array.from({ length: 3000 }, () => genererCodeBon())

// Aucun doublon sur trois mille tirages. Une collision ici trahirait un
// générateur qui tourne en rond (graine figée, séquence courte).
egal('aucune collision sur 3000 codes', new Set(CODES).size, 3000)
verifier('tous au bon format', CODES.every(c => /^BC-[23456789A-HJ-NP-Z]{4}-[23456789A-HJ-NP-Z]{4}$/.test(c)))
verifier('aucun caractère ambigu, jamais', CODES.every(c => !/[01OIL]/.test(c.slice(3))))

// Distribution : les 31 caractères doivent tous sortir. Un alphabet dont une
// partie ne tombe jamais, c'est un espace de recherche plus petit qu'annoncé.
const tousCaracteres = CODES.map(c => c.replace(/BC-|-/g, '')).join('')
const vus = new Set(tousCaracteres)
egal('les 31 caractères sortent tous', vus.size, 31)

// Et sans biais. 256 n'est pas un multiple de 31 : un tirage naïf (octet
// modulo 31) fait sortir les HUIT PREMIERS caractères de l'alphabet une fois
// sur neuf de plus que les autres.
//
// ⚠️ Ce test a d'abord été écrit en regardant l'écart maximum par caractère,
// avec une tolérance de 35 %. Mesure faite sur un tirage volontairement
// biaisé : l'écart n'y monte qu'à 14 %, noyé dans le bruit statistique. Le
// test passait donc au vert sur exactement ce qu'il prétendait interdire.
//
// Ce qui trahit le biais, c'est la comparaison des DEUX GROUPES : les huit
// premiers caractères contre les vingt-trois autres. Le bruit s'y annule, et
// le rapport saute à 1,13 là où un tirage sain reste à 1,00.
const compte = (c) => tousCaracteres.split(c).length - 1
const moyenne = (liste) => liste.reduce((a, b) => a + b, 0) / liste.length
const debutAlphabet = moyenne([...'23456789'].map(compte))
const finAlphabet = moyenne([...'ABCDEFGHJKMNPQRSTUVWXYZ'].map(compte))
const rapport = debutAlphabet / finAlphabet
verifier('les huit premiers caractères ne sortent pas plus que les autres',
  rapport > 0.96 && rapport < 1.04, `rapport ${rapport.toFixed(4)} (biaisé = 1,13)`)

// Le tirage doit venir d'une source cryptographique. C'est LA règle : le
// nombre de combinaisons ne protège de rien si la suite est prévisible.
const sourceBons = readFileSync(new URL('../lib/bons-cadeaux.js', import.meta.url), 'utf8')
const codeSeul = sourceBons.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
verifier('le code n\'est pas tiré avec Math.random', !/Math\.random/.test(codeSeul))
verifier('le tirage passe par getRandomValues', /getRandomValues/.test(codeSeul))
verifier('aucun repli silencieux sur un tirage faible', /throw new Error/.test(codeSeul))

// ─── Ce qui protège le code une fois émis ──────────────────────────────────
// L'entropie ne suffit pas : sans limite sur les essais, 850 milliards de
// combinaisons se grignotent. Et le compteur partagé est fail-open, donc une
// instance sans Upstash n'en aurait AUCUNE.
const { checkLocal } = await import('../lib/ratelimit.js')
const t0 = 1_000_000
for (let i = 0; i < 10; i++) {
  verifier(`essai ${i + 1} sur 10 autorisé`, checkLocal('test:ip', 10, 60_000, t0 + i).success)
}
verifier('le onzième essai est refusé', !checkLocal('test:ip', 10, 60_000, t0 + 10).success)
// Une minute plus tard, la fenêtre a glissé : le client honnête n'est pas puni.
verifier('après la fenêtre, on peut réessayer', checkLocal('test:ip', 10, 60_000, t0 + 61_000).success)
// Deux adresses différentes ne se pénalisent pas l'une l'autre.
verifier('les compteurs sont par identifiant', checkLocal('test:autre-ip', 10, 60_000, t0 + 10).success)

const routeVerif = readFileSync(new URL('../app/api/bons-cadeaux/verifier/route.js', import.meta.url), 'utf8')
verifier('la vérification de code a un repli local', /cle: 'bon', max: \d+/.test(routeVerif))
// Ne jamais confirmer qu'un code existe ailleurs : ce serait un oracle.
const serveurBons = readFileSync(new URL('../lib/bons-cadeaux-server.js', import.meta.url), 'utf8')
verifier('code inconnu et code d\'un autre commerce : même message',
  /Même message que le code inconnu/.test(serveurBons))

verifier('bon expiré détecté', bonExpire({ expires_at: '2026-01-01' }, new Date('2026-08-05')))
verifier('bon valide non expiré', !bonExpire({ expires_at: '2027-01-01' }, new Date('2026-08-05')))
verifier('bon sans échéance jamais expiré', !bonExpire({ expires_at: null }, new Date('2026-08-05')))
verifier('bornes de montant cohérentes', BON_MONTANT_MIN > 0 && BON_MONTANT_MAX > BON_MONTANT_MIN)

// ═══════════════════════════════════════════════════════════════════════════
// 4. HEURE DE BRUXELLES — le délai d'annulation
// ═══════════════════════════════════════════════════════════════════════════
// Été (CEST, UTC+2) : 14h00 murale = 12h00 UTC.
egal('heure d’été', brusselsInstant('2026-08-05', '14:00').toISOString(), '2026-08-05T12:00:00.000Z')
// Hiver (CET, UTC+1) : 14h00 murale = 13h00 UTC. C'est CE cas qui était faux
// avec un offset codé en dur, et la deadline tombait une heure trop tôt.
egal('heure d’hiver', brusselsInstant('2026-01-15', '14:00').toISOString(), '2026-01-15T13:00:00.000Z')
egal('secondes acceptées', brusselsInstant('2026-08-05', '14:00:00').toISOString(), '2026-08-05T12:00:00.000Z')
// Bascules DST : dernier dimanche de mars et d'octobre.
egal('veille du passage à l’heure d’été', brusselsInstant('2026-03-28', '12:00').toISOString(), '2026-03-28T11:00:00.000Z')
egal('lendemain du passage à l’heure d’été', brusselsInstant('2026-03-30', '12:00').toISOString(), '2026-03-30T10:00:00.000Z')
egal('après le retour à l’heure d’hiver', brusselsInstant('2026-10-26', '12:00').toISOString(), '2026-10-26T11:00:00.000Z')
verifier('entrée vide = date invalide', isNaN(brusselsInstant(null, '14:00').getTime()))
verifier('heure vide = date invalide', isNaN(brusselsInstant('2026-08-05', null).getTime()))

// Le délai d'annulation lui-même : 24h avant un RDV du 15 janvier à 9h.
const rdvHiver = brusselsInstant('2026-01-15', '09:00')
const cutoff = new Date(rdvHiver.getTime() - 24 * 3600 * 1000)
egal('cutoff 24h en hiver', cutoff.toISOString(), '2026-01-14T08:00:00.000Z')

// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// CE QUI A ÉTÉ ENCAISSÉ AU COMPTOIR ENTRE ENFIN AU JOURNAL
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ IL MANQUAIT LA MOITIÉ DU DOCUMENT (Alex, 17/08). L'export annonçait
// « 1600 € en ligne, 0,00 € au comptoir » à un centre qui avait encaissé treize
// séances à 15 € au terminal et en espèces : aucune réconciliation n'était
// possible, et « honoré » valait « payé » sans que personne n'ait rien dit.

const { resteAEncaisser, MODES_QUI_ENCAISSENT } = await import('../lib/rdv-paiement.js')

// Ce qui reste dû au comptoir : le solde si un acompte est déjà payé en ligne.
egal('sans acompte, tout le prix reste à encaisser', resteAEncaisser({ prix_estime: 35 }), 35)
egal('avec acompte payé, seulement le solde',
  resteAEncaisser({ prix_estime: 35, acompte_montant: 8.75, acompte_paye: true }), 26.25)
// ⚠️ UN ACOMPTE NON PAYÉ N'EST PAS UN ACOMPTE : le tout reste dû.
egal('un acompte jamais payé ne réduit rien',
  resteAEncaisser({ prix_estime: 35, acompte_montant: 8.75, acompte_paye: false }), 35)
// ⚠️ UNE SÉANCE D'ABONNEMENT EST DÉJÀ PAYÉE : zéro, et la question du moyen de
// paiement ne se posera même pas.
egal('une séance d’abonnement ne demande rien', resteAEncaisser({ abonnement_id: 'a', prix_estime: 0 }), 0)
// ⚠️ GARDE NÉE MUETTE, MESURÉE EN MUTATION : la ligne ci-dessus passait même
// sans la règle du contrat, puisqu'une séance d'abonnement porte déjà
// `prix_estime: 0`. C'est LE CONTRAT qui décide, pas le nombre — et le jour où
// un prix traîne sur une séance d'abonnement, on ne doit pas le réclamer.
egal('et le contrat l’emporte même si un prix traîne dessus',
  resteAEncaisser({ abonnement_id: 'a', prix_estime: 40 }), 0)
// ⚠️ `null` VEUT DIRE « ON NE SAIT PAS », ET CE N'EST PAS ZÉRO. Un devis sans
// prix ne doit pas se transformer en « rien à payer ».
egal('un prix inconnu reste inconnu', resteAEncaisser({ prix_estime: null }), null)
egal('sans rendez-vous, rien', resteAEncaisser(null), null)

const RDV_ENCAISSE = {
  id: 'r-enc-1', numero_rdv: 19, statut: 'honore', date_rdv: '2026-08-21',
  prix_estime: 15, tva_taux: 21,
  encaisse_mode: 'terminal', encaisse_montant: 15, encaisse_le: '2026-08-21T11:05:00.000Z',
}
const [ligneComptoir] = construireLignes({ rdvs: [RDV_ENCAISSE] })
egal('un encaissement déclaré devient une ligne', ligneComptoir?.type, 'Solde RDV')
egal('datée du jour de l’encaissement', ligneComptoir.date, '2026-08-21')
egal('comptée au comptoir', ligneComptoir.comptoir, 15)
egal('et jamais en ligne', ligneComptoir.enLigne, 0)
// ⚠️ STRIPE N'A RIEN VU PASSER : lui attribuer des frais fabriquerait une
// dépense qui n'existe pas.
egal('sans frais Stripe, puisque Stripe n’y est pour rien', ligneComptoir.fraisStripe, 0)
egal('le moyen déclaré voyage avec la ligne', ligneComptoir.modeEncaissement, 'terminal')
egal('ventilée au taux du rendez-vous', ligneComptoir.parTaux[21], 15)

// ⚠️ ON N'ÉCRIT QUE CE QUI A ÉTÉ DÉCLARÉ. Un rendez-vous honoré sans
// encaissement noté ne produit AUCUNE ligne : supposer qu'il a été payé
// mettrait dans un document comptable de l'argent que personne n'a vu passer.
egal('un honoré sans encaissement noté n’écrit rien',
  construireLignes({ rdvs: [{ ...RDV_ENCAISSE, encaisse_mode: null, encaisse_montant: null }] }).length, 0)
// « Rien encaissé » est une réponse, pas un encaissement.
egal('« rien encaissé » n’écrit rien non plus',
  construireLignes({ rdvs: [{ ...RDV_ENCAISSE, encaisse_mode: 'rien', encaisse_montant: 0 }] }).length, 0)
verifier('et « rien » n’est pas un moyen qui encaisse',
  !MODES_QUI_ENCAISSENT.includes('rien'))
// ⚠️ GARDE NÉE MUETTE, MESURÉE EN MUTATION : les deux cas ci-dessus portaient
// un montant nul, si bien que retirer le test du MOYEN ne changeait rien. C'est
// le MOYEN qui décide qu'un encaissement a eu lieu, jamais le montant : le jour
// où un montant traîne sur une réponse « rien encaissé », il ne doit pas entrer
// dans un document comptable.
egal('un montant qui traîne sur « rien encaissé » n’entre pas au journal',
  construireLignes({ rdvs: [{ ...RDV_ENCAISSE, encaisse_mode: 'rien', encaisse_montant: 26.25 }] }).length, 0)
egal('ni sur un moyen absent',
  construireLignes({ rdvs: [{ ...RDV_ENCAISSE, encaisse_mode: null, encaisse_montant: 26.25 }] }).length, 0)

// ⚠️ AUCUN DOUBLE COMPTAGE AVEC L'ACOMPTE. Le montant encaissé est le SOLDE,
// figé au moment où le commerçant a répondu : les deux lignes réunies font le
// prix, jamais plus.
const RDV_ACOMPTE_PUIS_SOLDE = {
  id: 'r-enc-2', numero_rdv: 20, statut: 'honore', date_rdv: '2026-08-21',
  prix_estime: 35, tva_taux: 21,
  acompte_montant: 8.75, acompte_paye: true, acompte_paye_en_ligne: true,
  encaisse_mode: 'especes', encaisse_montant: 26.25, encaisse_le: '2026-08-21T11:05:00.000Z',
}
const deuxLignes = construireLignes({ rdvs: [RDV_ACOMPTE_PUIS_SOLDE] })
egal('acompte et solde font deux lignes', deuxLignes.length, 2)
egal('et leur somme fait le prix, pas davantage',
  deuxLignes.reduce((s, l) => s + l.total, 0), 35)

// La réconciliation : le relevé du terminal d'un côté, le tiroir de l'autre.
const jourEnc = journalParJour(construireLignes({
  rdvs: [RDV_ENCAISSE, { ...RDV_ACOMPTE_PUIS_SOLDE, date_rdv: '2026-08-21', encaisse_le: '2026-08-21T12:00:00.000Z' }],
}))[0]
egal('le terminal est isolé', jourEnc.terminal, 15)
egal('les espèces aussi', jourEnc.especes, 26.25)
verifier('et leur somme ne dépasse pas le comptoir du jour',
  jourEnc.terminal + jourEnc.especes <= jourEnc.comptoir + 0.001)

// ⚠️ LA COLONNE DOIT ARRIVER JUSQU'AU CALCUL. Un encaissement absent du
// `select` viderait le comptoir du journal SANS la moindre erreur : c'est LE
// défaut le plus fréquent de ce projet.
const srcExportCompta = readFileSync(new URL('../app/api/dashboard/export-comptable/route.js', import.meta.url), 'utf8')
verifier('la route charge bien l’encaissement du comptoir',
  /encaisse_mode, encaisse_montant, encaisse_le/.test(srcExportCompta))

// ⚠️ ET LES FRAIS STRIPE, QUI ÉTAIENT CALCULÉS, EXPORTÉS, ET JETÉS À
// L'AFFICHAGE. Un commerçant qui ne voit pas ses frais croit que son chiffre
// TTC est ce qu'il touche.
const srcComptaEcran = readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8')
// ⚠️ CES DEUX GARDES VERROUILLAIENT LE DÉFAUT, et c'est la troisième fois sur
// ce projet. Elles exigeaient la présence LITTÉRALE de
// `acc.fraisStripe + (j.fraisStripe || 0)`, c'est-à-dire du `|| 0` qui écrase
// « jamais relevé » en « zéro » : corriger le bug les faisait rougir. Elles
// disent maintenant l'INTENTION, et surtout elles INTERDISENT le piège au lieu
// d'exiger une écriture correcte particulière.
verifier('l’écran n’écrase plus un frais Stripe inconnu en zéro',
  !/(?:frais|net)Stripe[^\n]*\|\|\s*0\)/i.test(srcComptaEcran))
// ⚠️ GARDE NÉE MUETTE, MESURÉE EN MUTATION. Premier jet : un simple
// `/Non relevé/`. Casser la carte des FRAIS la laissait verte, celle du NET
// portant encore les mots. L'homonyme voisin : on exige les DEUX.
verifier('et il NOMME l’ignorance plutôt que d’écrire 0,00',
  /totaux\.fraisStripe == null \? 'Non relevé'/.test(srcComptaEcran)
  && /totaux\.netStripe == null \? 'Non relevé'/.test(srcComptaEcran))
verifier('avec la raison, sinon « Non relevé » se lit comme une panne',
  /ne veut pas dire zéro/.test(srcComptaEcran))

// ─── ET LA MÊME RÈGLE, EXÉCUTÉE ───────────────────────────────────────────
// ⚠️ EXÉCUTER, JAMAIS RELIRE. Les trois lignes ci-dessus lisent une source
// faute de pouvoir exécuter du JSX ; la règle elle-même, elle, se mesure.
egal('rien n’est passé par Stripe : le frais vaut zéro', montantStripe(0, null), 0)
egal('même quand le brut est absent', montantStripe(0, undefined), 0)
egal('de l’argent y est passé sans frais relevé : on ne sait pas', montantStripe(400, null), null)
egal('et un frais relevé se rend tel quel', montantStripe(400, 6.46), 6.46)
// ⚠️ ADDITIONNER EN GARDANT L'IGNORANCE : un total partiel se lirait comme un
// total complet, ce qui est exactement le mensonge qu'on vient de corriger.
egal('une seule ligne inconnue rend le total inconnu', sommeStripe(3, null), null)
egal('et l’inconnu ne se répare pas plus loin', sommeStripe(null, 3), null)
egal('deux frais connus s’additionnent', sommeStripe(3, 6.46), 9.46)

// Le cas exact d'Alex (19/08) : trois abonnements vendus en ligne AVANT que la
// colonne des frais existe, et cinq encaissés au comptoir le même mois.
const [jourEnLigneInconnu] = journalParJour(construireLignes({
  abonnements: [{ id: 'a1', prix: 400, paye: true, paye_le: '2026-08-16T09:00:00.000Z',
    mode_paiement: 'en_ligne', tva_taux: 21, statut: 'actif' }],
}))
egal('un abonnement vendu en ligne sans frais relevé laisse la journée inconnue',
  jourEnLigneInconnu?.fraisStripe, null)
const [jourComptoir] = journalParJour(construireLignes({
  abonnements: [{ id: 'a2', prix: 400, paye: true, paye_le: '2026-08-19T09:00:00.000Z',
    mode_paiement: 'terminal', tva_taux: 21, statut: 'actif' }],
}))
egal('une journée sans le moindre paiement en ligne coûte zéro, et le dit',
  jourComptoir?.fraisStripe, 0)
// Et le CSV laisse la case VIDE, il n'écrit pas 0,00 dans un document comptable.
const csvInconnu = csvJournal({
  lignes: construireLignes({ abonnements: [{ id: 'a3', prix: 400, paye: true,
    paye_le: '2026-08-16T09:00:00.000Z', mode_paiement: 'en_ligne', tva_taux: 21, statut: 'actif' }] }),
  commercant: { nom: 'Centre Test' }, du: '2026-08-01', au: '2026-08-31',
})
// ⚠️ ON LIT LES CELLULES, PAS LE TEXTE. Première écriture de cette garde : une
// regex qui cherchait `;0,00;0,00` en fin de ligne — elle accrochait « Dont
// espèces » et « Dont virement », légitimement à zéro, et rougissait sur un
// export correct. Découper au point-virgule ne se trompe pas de colonne.
const cellules16 = (csvInconnu.split(/\r?\n/).find(l => l.startsWith('2026-08-16;')) || '').split(';')
egal('la case Frais Stripe reste vide dans le journal exporté', cellules16.at(-2), '')
egal('et la case Net Stripe aussi', cellules16.at(-1), '')
const cellulesTotal = (csvInconnu.split(/\r?\n/).find(l => l.startsWith('TOTAL;')) || '').split(';')
egal('le TOTAL n’invente pas davantage un frais nul', cellulesTotal.at(-2), '')

// ⚠️ ET LA MÊME RÈGLE SUR TOUTES LES FAMILLES DE LIGNES (rappel d'Alex, 19/08 :
// « ça doit valoir pour le C&C et tout le reste »). On EXÉCUTE une ligne de
// chaque sorte plutôt que de relire la source : c'est ce geste-là qui avait
// débusqué le canal faux sur les retraits, quand mon inspection du source avait
// rendu un faux négatif sur toute la ligne.
const FAMILLES = [
  ['Click & Collect payé en ligne', { commandes: [{ id: 'c1', total: 24, statut: 'recupere', paye_en_ligne: true, creneau_id: 'k1', created_at: '2026-08-16T09:00:00.000Z' }] }, null],
  ['retrait en magasin payé au comptoir', { commandes: [{ id: 'c2', total: 24, statut: 'recupere', paye_en_ligne: false, encaisse_mode: 'especes', created_at: '2026-08-16T09:00:00.000Z' }] }, 0],
  ['livraison payée en ligne', { commandes: [{ id: 'c3', total: 30, statut: 'recupere', paye_en_ligne: true, mode_retrait: 'livraison', created_at: '2026-08-16T09:00:00.000Z' }] }, null],
  ['expédition payée en ligne', { commandes: [{ id: 'c4', total: 30, statut: 'recupere', paye_en_ligne: true, mode_retrait: 'expedition', created_at: '2026-08-16T09:00:00.000Z' }] }, null],
  ['acompte de rendez-vous payé en ligne', { rdvs: [{ id: 'r1', statut: 'honore', date_rdv: '2026-08-16', prix_estime: 60, acompte_montant: 15, acompte_paye: true, acompte_paye_en_ligne: true, tva_taux: 21 }] }, null],
  ['solde de rendez-vous encaissé au comptoir', { rdvs: [RDV_ENCAISSE] }, 0],
  ['abonnement vendu en ligne', { abonnements: [{ id: 'a4', prix: 400, paye: true, paye_le: '2026-08-16T09:00:00.000Z', mode_paiement: 'en_ligne', tva_taux: 21, statut: 'actif' }] }, null],
  ['abonnement réglé au comptoir', { abonnements: [{ id: 'a5', prix: 400, paye: true, paye_le: '2026-08-16T09:00:00.000Z', mode_paiement: 'terminal', tva_taux: 21, statut: 'actif' }] }, 0],
]
for (const [quoi, source, attendu] of FAMILLES) {
  const lignes = construireLignes(source).filter(l => l.enLigne > 0 || l.comptoir > 0)
  verifier(`une ligne existe pour : ${quoi}`, lignes.length > 0)
  for (const l of lignes) {
    egal(`${quoi} → frais ${attendu === null ? 'inconnu, jamais zéro' : 'nul, et il le dit'}`, l.fraisStripe, attendu)
    egal(`${quoi} → net ${attendu === null ? 'inconnu' : 'nul'}`, l.netStripe, attendu)
  }
}
verifier('le détail du comptoir est là pour la réconciliation',
  /Dont terminal/.test(srcComptaEcran) && /Dont espèces/.test(srcComptaEcran))

// Le CSV porte les mêmes colonnes que l'écran.
const csvEnc = csvJournal({
  lignes: construireLignes({ rdvs: [RDV_ENCAISSE] }),
  commercant: { nom: 'Centre Test' }, du: '2026-08-01', au: '2026-08-31',
})
verifier('le journal exporté détaille terminal et espèces',
  /Dont terminal;Dont especes/.test(csvEnc))

// ═══════════════════════════════════════════════════════════════════════════
// LE MÊME GESTE AUX DEUX AUTRES ENDROITS OÙ L'ON ENCAISSE AU COMPTOIR
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ RÈGLE POSÉE PAR ALEX LE 17/08, désormais non négociable : « si une
// amélioration touche d'autres endroits de l'app, il faut aussi l'appliquer ».
// Le geste d'encaissement n'existait que sur les rendez-vous ; les commandes
// payées sur place et les abonnements inscrits à la main partaient au comptoir
// SANS LEUR MOYEN. C'est lui qui l'a vu, pas moi.

const { resteAEncaisserCommande, MODES_ENCAISSEMENT } = await import('../lib/rdv-paiement.js')

egal('une commande payée sur place reste à encaisser en entier',
  resteAEncaisserCommande({ total: 24.5, paye_en_ligne: false }), 24.5)
// Un bon cadeau a été payé en ligne à son achat : il ne se réencaisse pas.
egal('le bon cadeau se déduit de ce qui reste dû',
  resteAEncaisserCommande({ total: 24.5, bon_cadeau_montant: 10, paye_en_ligne: false }), 14.5)
egal('une commande déjà payée en ligne ne demande rien',
  resteAEncaisserCommande({ total: 24.5, paye_en_ligne: true }), 0)
egal('un bon cadeau plus gros que la commande ne rend jamais négatif',
  resteAEncaisserCommande({ total: 10, bon_cadeau_montant: 25, paye_en_ligne: false }), 0)
egal('sans commande, rien', resteAEncaisserCommande(null), null)

// Le moyen voyage jusqu'au journal, et JAMAIS sur une vente en ligne.
const [ligneCmdComptoir] = construireLignes({
  commandes: [{ id: 'c-enc', numero_commande: 12, statut: 'recupere', total: 24.5, mode_retrait: 'boutique',
    paye_en_ligne: false, encaisse_mode: 'especes', commande_articles: [] }],
  tauxDefaut: 21,
})
egal('une commande payée sur place porte son moyen', ligneCmdComptoir.modeEncaissement, 'especes')
egal('et son montant va bien au comptoir', ligneCmdComptoir.comptoir, 24.5)
const [ligneCmdEnLigne] = construireLignes({
  commandes: [{ id: 'c-web', numero_commande: 13, statut: 'recupere', total: 24.5, mode_retrait: 'boutique',
    paye_en_ligne: true, encaisse_mode: 'especes', commande_articles: [] }],
  tauxDefaut: 21,
})
// ⚠️ UNE VENTE EN LIGNE N'A PAS DE MOYEN AU COMPTOIR, même si une valeur traîne
// en base : sans cette garde, un montant payé par Stripe se retrouverait dans
// le comptage de caisse du commerçant.
egal('une vente en ligne n’emporte aucun moyen de comptoir', ligneCmdEnLigne.modeEncaissement, null)

// ═══ CE QUI EST EN CAISSE, ET CE QUI NE L'EST PAS ═════════════════════════
//
// ⚠️ 🔴 QUESTION D'ALEX, 23/08 : « est-ce que la transaction se met à jour dans
// la compta ? » Non. « Encaisse au comptoir » portait le total de TOUTE
// commande non payée en ligne, quel que soit son statut — en préparation,
// prête, et même JAMAIS RETIRÉE. Le journal affirmait un encaissement qui
// n'avait pas eu lieu.
//
// ⚠️ ET LE BANC N'A RIEN VU PARCE QUE TOUS SES JEUX D'ESSAI PORTAIENT UN
// MOYEN. Le cas « pas encore encaissée » n'était couvert nulle part : c'est
// exactement pour ça que le défaut a vécu (reference_tests_faussement_verts).
{
  const cmd = (extra) => ({ id: 'x', numero_commande: 1, statut: 'recupere', total: 24.5,
    mode_retrait: 'boutique', commande_articles: [], ...extra })

  const [pasEncaissee] = construireLignes({ commandes: [cmd({ paye_en_ligne: false })], tauxDefaut: 21 })
  egal('🔴 une commande pas encore encaissée n’est PAS dans la caisse', pasEncaissee.comptoir, 0)
  egal('🔴 son montant passe en « reste à encaisser »', pasEncaissee.resteAEncaisser, 24.5)
  egal('mais elle reste au journal, la vente existe', pasEncaissee.total, 24.5)

  const [encaissee] = construireLignes({ commandes: [cmd({ paye_en_ligne: false, encaisse_mode: 'terminal' })], tauxDefaut: 21 })
  egal('une commande encaissée entre bien en caisse', encaissee.comptoir, 24.5)
  egal('et il ne reste rien dessus', encaissee.resteAEncaisser, 0)

  // ⚠️ `rien` EST UNE RÉPONSE, PAS UN MOYEN : le client est venu et n'a pas
  // payé. L'argent n'est pas entré, la caisse ne doit pas le prétendre.
  const [impayee] = construireLignes({ commandes: [cmd({ paye_en_ligne: false, encaisse_mode: 'rien' })], tauxDefaut: 21 })
  egal('🔴 un impayé assumé n’entre pas en caisse', impayee.comptoir, 0)
  egal('et il reste dû', impayee.resteAEncaisser, 24.5)

  // ⚠️ UNE COMMANDE JAMAIS RETIRÉE COMPTAIT COMME DE L'ARGENT DANS LE TIROIR.
  const [jamaisRetiree] = construireLignes({ commandes: [cmd({ statut: 'non_retire', paye_en_ligne: false })], tauxDefaut: 21 })
  egal('🔴 une commande jamais retirée n’est pas de l’argent encaissé', jamaisRetiree.comptoir, 0)
  // ⚠️ MAIS SI ELLE ÉTAIT PAYÉE EN LIGNE, L'ARGENT EST BIEN CHEZ STRIPE : on ne
  // la retire pas du journal, sans quoi un encaissement RÉEL disparaîtrait.
  const [nonRetireeWeb] = construireLignes({ commandes: [cmd({ statut: 'non_retire', paye_en_ligne: true })], tauxDefaut: 21 })
  egal('une non retirée payée en ligne garde son encaissement', nonRetireeWeb.enLigne, 24.5)
  egal('et rien ne reste à encaisser dessus', nonRetireeWeb.resteAEncaisser, 0)

  // Un bon cadeau a déjà été payé à son achat : il ne reste pas dû.
  const [avecBon] = construireLignes({
    commandes: [cmd({ total: 30, bon_cadeau_montant: 10, paye_en_ligne: false })], tauxDefaut: 21 })
  egal('le bon cadeau se déduit de ce qui reste dû', avecBon.resteAEncaisser, 20)

  // ⚠️ L'ÉQUATION QUI FERME LE COMPTE, et la raison d'être de la colonne
  // (arbitrage d'Alex) : sans elle, le CA ne s'expliquerait plus par ses
  // colonnes de règlement et l'écart ne serait dit NULLE PART.
  const jourMele = journalParJour(construireLignes({
    commandes: [
      cmd({ id: 'a', paye_en_ligne: true, total: 24 }),
      cmd({ id: 'b', paye_en_ligne: false, encaisse_mode: 'especes', total: 16 }),
      cmd({ id: 'c', paye_en_ligne: false, total: 24 }),
      cmd({ id: 'd', paye_en_ligne: false, total: 30, bon_cadeau_montant: 30 }),
    ],
    tauxDefaut: 21,
  }))[0]
  egal('🔴 CA = en ligne + comptoir + bon cadeau + reste à encaisser',
    arrondi(jourMele.enLigne + jourMele.comptoir + jourMele.bonCadeau + jourMele.resteAEncaisser),
    jourMele.total)
  egal('le reste à encaisser du jour se cumule', jourMele.resteAEncaisser, 24)

  // ⚠️ CHAQUE LIGNE DOIT PORTER LE CHAMP. Le regroupement replie une absence
  // sur zéro pour ne jamais écrire `NaN` dans un document comptable : c'est
  // donc au BANC d'attraper l'oubli, pas au comptable.
  const toutesLignes = construireLignes({
    commandes: [cmd({ paye_en_ligne: false })],
    rdvs: [
      { id: 'r1', statut: 'honore', date_rdv: '2026-08-20', tva_taux: 21,
        encaisse_mode: 'especes', encaisse_montant: 15, encaisse_le: '2026-08-20T11:05:00.000Z' },
      { id: 'r2', statut: 'honore', date_rdv: '2026-08-20', tva_taux: 21,
        acompte_montant: 10, acompte_paye: true, acompte_paye_en_ligne: true },
    ],
    abonnements: [{ id: 'a1', prix: 300, paye: true, paye_le: '2026-08-20', mode_paiement: 'especes', tva_taux: 21 }],
    tauxDefaut: 21,
  })
  verifier('les quatre sortes de lignes sont bien produites', toutesLignes.length === 4, String(toutesLignes.length))
  verifier('🔴 chaque ligne du journal porte « reste à encaisser »',
    toutesLignes.every(l => typeof l.resteAEncaisser === 'number'),
    toutesLignes.map(l => `${l.type}:${l.resteAEncaisser}`).join(' · '))

  // Et la colonne arrive jusqu'aux deux fichiers, en-tête ET total.
  const cs = { commercant: { nom: 'X' }, du: '2026-08-01', au: '2026-08-31' }
  const journalCsv = csvJournal({ jours: journalParJour(toutesLignes), lignes: toutesLignes, ...cs })
  verifier('le journal annonce la colonne', /Reste a encaisser/.test(journalCsv))
  verifier('le journal la remplit jusqu\'au TOTAL',
    journalCsv.split('\r\n').some(l => l.startsWith('TOTAL') && /24,50/.test(l)), 'le total ne porte pas le reste dû')
  const detailCsv = csvDetail({ lignes: toutesLignes, ...cs })
  verifier('le détail annonce la colonne', /Reste a encaisser/.test(detailCsv))
  verifier('et il la remplit ligne à ligne', /24,50/.test(detailCsv))

  // ─── LE PÉRIMÈTRE DU FICHIER, ET PAS SEULEMENT SON STATUT LÉGAL ───────────
  //
  // 🔴 Alex, 31/08 : le commerçant ne peut corriger AUCUN montant. `encaisse_montant`
  // vaut ce que Yoppaa croit dû, dérivé de `prix_estime` ; un supplément encaissé
  // à sa caisse n'entre jamais ici. L'en-tête disait déjà « pas une caisse
  // certifiée », ce qui est une mention LÉGALE et ne dit rien du CONTENU.
  //
  // ⚠️ ON MESURE LES DEUX SÉPARÉMENT, ET C'EST TOUT L'INTÉRÊT. Fondre les deux
  // phrases en une seule ferait disparaître le périmètre pendant que le mot
  // « SCE » survit : une garde qui chercherait « caisse » resterait verte sur un
  // fichier qui ne dit plus ce qu'il contient.
  for (const [nom, csv] of [['le journal', journalCsv], ['le détail', detailCsv]]) {
    verifier(`🔴 ${nom} dit ce qu'il NE contient PAS`,
      /ne contient que les transactions passees par Yoppaa/.test(csv),
      'aucune mention de périmètre en tête de fichier')
    verifier(`${nom} garde aussi sa mention légale`,
      /caisse enregistree certifie \(SCE\)/.test(csv))
  }
  // ⚠️ ET DEUX LIGNES DISTINCTES, PAS UNE : on compte, on ne cherche pas.
  egal('les deux mentions sont deux lignes séparées',
    journalCsv.split('\r\n').filter(l => /SCE|ne contient que les transactions/.test(l)).length, 2)

  // ⚠️ 🔴 LE DÉTAIL SE TRIE PAR DATE **ET PAR HEURE**, ET RIEN NE LE VÉRIFIAIT.
  // Alex l'a vu sur son export du 23/08 : 15:29, 15:30, 15:34, puis 14:55 dans
  // la même journée. Le tri s'arrêtait à la date.
  //
  // ⚠️ ET CE N'EST PAS COSMÉTIQUE : un comptable qui recoupe le relevé d'un
  // terminal — horodaté à la minute — remonte les lignes une à une. Un ordre
  // approximatif lui fait refaire le travail à la main.
  {
    const aHeure = (h, id) => ({ id, numero_commande: 1, statut: 'recupere', total: 10,
      mode_retrait: 'boutique', paye_en_ligne: true, commande_articles: [],
      date_commande: '2026-08-10', created_at: `2026-08-10T${h}:00.000Z` })
    const ordre = construireLignes({
      commandes: [aHeure('15:29', 'a'), aHeure('12:55', 'b'), aHeure('15:34', 'c'), aHeure('09:05', 'd')],
      tauxDefaut: 21,
    }).map(l => l.heure)
    verifier('🔴 le détail est trié par heure dans la journée',
      ordre.join(' ') === [...ordre].sort().join(' '), ordre.join(' · '))

    // Les jours restent premiers : l'heure ne trie qu'à l'intérieur d'un jour.
    //
    // ⚠️ LE JOUR SE FAIT VARIER PAR `created_at`, ET PLUS PAR `date_commande`
    // (03/09). Une commande payée en ligne est désormais datée du jour du
    // PAIEMENT, pas du créneau de retrait : ce jeu d'essai décrivait l'ancienne
    // règle, et il aurait laissé croire que le tri était cassé.
    const jours = construireLignes({
      commandes: [
        // ⚠️ 21:00 UNIVERSEL, PAS 23:00 : à Bruxelles, 23h UTC le 11 août c'est
        // déjà 01h du matin le 12. Les deux lignes retombaient sur le même jour
        // et la garde rougissait pour un fuseau, pas pour un tri.
        { ...aHeure('08:00', 'x'), created_at: '2026-08-12T08:00:00.000Z' },
        { ...aHeure('21:00', 'y'), created_at: '2026-08-11T21:00:00.000Z' },
      ],
      tauxDefaut: 21,
    }).map(l => l.date)
    verifier('et la date passe avant l’heure', jours.join(' ') === '2026-08-11 2026-08-12', jours.join(' · '))

    // ⚠️ UNE HEURE PEUT MANQUER — une ligne d'abonnement n'en a pas. Les vides
    // passent en DERNIER dans la journée plutôt que de remonter en tête par
    // hasard, ce qui les mettrait avant des écritures réellement horodatées.
    const avecVide = construireLignes({
      commandes: [aHeure('14:00', 'p')],
      abonnements: [{ id: 'a1', prix: 50, paye: true, paye_le: '2026-08-10', mode_paiement: 'especes', tva_taux: 21 }],
      tauxDefaut: 21,
    })
    verifier('une ligne sans heure passe en dernier dans sa journée',
      (avecVide[0].heure || '') !== '' && (avecVide[1].heure || '') === '',
      avecVide.map(l => `${l.type}:${l.heure || '—'}`).join(' · '))
  }

  // ⚠️ 🔴 UNE RÉFÉRENCE SANS SA SEMAINE PEUT SE RÉPÉTER, ET LE FICHIER LE DIT.
  // Alex, 23/08 : sur son export, la référence « 1 » figure DEUX FOIS. Le
  // compteur repart à 1 chaque semaine, et une commande d'avant la
  // numérotation qualifiée n'a ni préfixe ni semaine pour la distinguer.
  //
  // ⚠️ ON NE RÉÉCRIT PAS CES RÉFÉRENCES : inventer une forme dans un document
  // comptable serait pire que le problème. On COMPTE et on NOMME, comme
  // l'export le fait déjà pour les taux manquants.
  {
    const cmd = (extra) => ({ id: 'abcdef1234', statut: 'recupere', total: 10, mode_retrait: 'boutique',
      paye_en_ligne: true, commande_articles: [], date_commande: '2026-08-10', ...extra })
    const [vieille] = construireLignes({ commandes: [cmd({ numero_commande: 1 })], tauxDefaut: 21 })
    verifier('🔴 une référence sans semaine est marquée incomplète', vieille.referenceIncomplete === true)
    const [neuve] = construireLignes({
      commandes: [cmd({ numero_commande: 4, numero_prefixe: 'CC', numero_semaine: '2026-33' })], tauxDefaut: 21 })
    verifier('une référence qualifiée ne l’est pas', neuve.referenceIncomplete === false, neuve.reference)
    egal('et elle porte bien sa semaine', neuve.reference, 'CC4-2026-S33')

    // ⚠️ UN PRÉFIXE SANS SEMAINE NE SUFFIT PAS : « CC4 » se répète lui aussi
    // d'une semaine à l'autre. C'est la SEMAINE qui lève l'ambiguïté.
    const [prefixeSeul] = construireLignes({
      commandes: [cmd({ numero_commande: 4, numero_prefixe: 'CC' })], tauxDefaut: 21 })
    verifier('🔴 un préfixe sans semaine reste incomplet', prefixeSeul.referenceIncomplete === true, prefixeSeul.reference)

    const lignesMelees = construireLignes({
      commandes: [cmd({ numero_commande: 1 }), cmd({ id: 'x', numero_commande: 4, numero_prefixe: 'CC', numero_semaine: '2026-33' })],
      tauxDefaut: 21,
    })
    egal('le compte des références incomplètes est juste', referencesNonQualifiees(lignesMelees), 1)
    verifier('aucune ligne, aucun compte', referencesNonQualifiees([]) === 0)

    // ⚠️ ET L'AVERTISSEMENT SORT DANS LES DEUX FICHIERS, avec son NOMBRE : un
    // « attention » sans chiffre ne dit pas s'il faut regarder une ligne ou
    // cinquante (feedback_tout_traiter_jamais_amateur).
    const cs = { commercant: { nom: 'X' }, du: '2026-08-01', au: '2026-08-31' }
    for (const [nom, csv] of [
      ['le journal', csvJournal({ jours: journalParJour(lignesMelees), lignes: lignesMelees, ...cs })],
      ['le détail', csvDetail({ lignes: lignesMelees, ...cs })],
    ]) {
      verifier(`${nom} annonce les références incomplètes`, /1 transaction anterieure/.test(csv))
    }
    // Rien à signaler quand tout est qualifié : un avertissement permanent ne
    // se lit plus.
    const propres = construireLignes({
      commandes: [cmd({ numero_commande: 4, numero_prefixe: 'CC', numero_semaine: '2026-33' })], tauxDefaut: 21 })
    verifier('et il se tait quand tout est qualifié',
      !/transaction anterieure/.test(csvDetail({ lignes: propres, ...cs })))
  }

  // ⚠️ ET L'ÉCRAN AVEC, SINON IL MENTIRAIT LÀ OÙ LE FICHIER DIT VRAI. C'est
  // l'erreur exacte commise le matin même sur les créneaux fermés : la règle
  // juste, testée, et JAMAIS BRANCHÉE à l'écran. L'aperçu de Comptabilité
  // recalcule ses propres totaux à partir du journal.
  const ecran = readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8')
  verifier('🔴 l’aperçu Comptabilité cumule le reste à encaisser',
    /resteAEncaisser: acc\.resteAEncaisser \+ \(j\.resteAEncaisser \|\| 0\)/.test(ecran),
    'l’écran perdrait la part non encaissée')
  verifier('et son cumul part de zéro', /comptoir: 0, resteAEncaisser: 0,/.test(ecran))
  verifier('🔴 et il l’AFFICHE au commerçant',
    /l: 'Reste à encaisser', v: eur\(totaux\.resteAEncaisser\)/.test(ecran),
    'le chiffre serait calculé puis jeté, comme les frais Stripe avant le 19/08')
  // Elle ne s'affiche que s'il y a quelque chose à dire : un commerce 100 % en
  // ligne n'a pas besoin de lire un zéro de plus.
  verifier('mais seulement s’il reste vraiment quelque chose',
    /totaux\.resteAEncaisser > 0 \?/.test(ecran))
}

// Les abonnements inscrits à la main : `mode_paiement` porte désormais le moyen.
const [ligneAboEspeces] = construireLignes({
  abonnements: [{ id: 'a-esp', prix: 300, paye: true, paye_le: '2026-08-17', mode_paiement: 'especes', tva_taux: 21 }],
})
egal('un abonnement réglé en espèces le dit', ligneAboEspeces.modeEncaissement, 'especes')
egal('et il va au comptoir', ligneAboEspeces.comptoir, 300)
const [ligneAboLigne] = construireLignes({
  abonnements: [{ id: 'a-web', prix: 400, paye: true, paye_le: '2026-08-17', mode_paiement: 'en_ligne', tva_taux: 21 }],
})
egal('un abonnement vendu en ligne n’a pas de moyen de comptoir', ligneAboLigne.modeEncaissement, null)

// ⚠️ TROIS SEAUX POUR LA RÉCONCILIATION. Un virement n'est ni dans le tiroir ni
// sur le relevé du terminal : le noyer dans « au comptoir » ferait chercher un
// montant qui ne se recoupe avec rien.
verifier('le virement est un moyen déclaré', !!MODES_ENCAISSEMENT.virement)
const jourTroisSeaux = journalParJour(construireLignes({
  abonnements: [
    { id: 'a1', prix: 300, paye: true, paye_le: '2026-08-17', mode_paiement: 'especes', tva_taux: 21 },
    { id: 'a2', prix: 540, paye: true, paye_le: '2026-08-17', mode_paiement: 'virement', tva_taux: 21 },
    { id: 'a3', prix: 100, paye: true, paye_le: '2026-08-17', mode_paiement: 'terminal', tva_taux: 21 },
  ],
}))[0]
egal('les espèces dans leur seau', jourTroisSeaux.especes, 300)
egal('le virement dans le sien', jourTroisSeaux.virement, 540)
egal('le terminal dans le sien', jourTroisSeaux.terminal, 100)
egal('et leur somme fait tout le comptoir', jourTroisSeaux.comptoir, 940)

// ⚠️ LES COLONNES DOIVENT ARRIVER JUSQU'AU CALCUL, ici comme pour les
// rendez-vous : LE défaut le plus fréquent de ce projet.
// ⚠️ CETTE GARDE ÉTAIT ANCRÉE SUR L'ADJACENCE des colonnes, et non sur leur
// présence : glisser une colonne entre `encaisse_le` et `commande_articles` la
// faisait rougir alors que rien n'était cassé. Une garde doit tenir à ce qui
// compte, pas à l'ordre des mots. Corrigée le 19/08 en ajoutant `client_nom`.
{
  const selectCommandes = colonnesDe(srcExportCompta, 'commandes')
  for (const colonne of ['encaisse_mode', 'encaisse_montant', 'encaisse_le', 'commande_articles']) {
    verifier(`la route charge ${colonne} sur les commandes`,
      new RegExp(`\\b${colonne}\\b`).test(selectCommandes), selectCommandes)
  }
}

// Le geste, côté écran.
const srcDashCmd = readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8')
verifier('remettre une commande payée sur place demande le moyen',
  /setCommandeAEncaisser\(c\)/.test(srcDashCmd))
verifier('et seulement s’il reste quelque chose à encaisser',
  /!c\.encaisse_mode && resteAEncaisserCommande\(c\) > 0/.test(srcDashCmd))
verifier('le moyen part dans la même écriture que le statut',
  /const payloadCmd = \{ statut, \.\.\.\(champs \|\| \{\}\) \}/.test(srcDashCmd))
verifier('l’inscription d’un abonnement demande le moyen, plus « sur place »',
  /<option value="terminal">/.test(srcComptaEcran) && /<option value="especes">/.test(srcComptaEcran))
verifier('et l’écran isole les trois seaux',
  /Dont virement/.test(srcComptaEcran))

// ═══════════════════════════════════════════════════════════════════════════
// LE CLICK AND COLLECT AVAIT UN CUL-DE-SAC, ET SA CARTE NE DISAIT PAS L'ARGENT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Alex, 17/08 : « rien n'indique le montant à payer quel que soit le statut,
// je ne sais pas la mettre en récupérée ». Deux défauts d'un coup :
//   • `STATUTS.pret.next` valait `null` : la livraison enchaînait, l'expédition
//     enchaînait, et le retrait en boutique n'avait AUCUNE sortie. Le geste le
//     plus banal du comptoir, remettre le paquet, n'existait pas.
//   • la carte affichait le TOTAL, qui n'est pas un état : elle ne disait pas
//     s'il fallait tendre la main.

const { etatPaiementCommande } = await import('../lib/rdv-paiement.js')

const CMD_SUR_PLACE = { total: 11.5, paye_en_ligne: false }
egal('une commande payée sur place reste à payer', etatPaiementCommande(CMD_SUR_PLACE).cle, 'du')
verifier('et le montant est écrit', /11,50/.test(etatPaiementCommande(CMD_SUR_PLACE).libelle))
egal('une commande payée en ligne est payée',
  etatPaiementCommande({ total: 11.5, paye_en_ligne: true }).cle, 'paye')
verifier('et elle le dit sans réclamer un centime',
  !/à payer/i.test(etatPaiementCommande({ total: 11.5, paye_en_ligne: true }).libelle))

// ⚠️ LE BON CADEAU SE DÉDUIT ET SE DIT. Sans la phrase, le commerçant réclame
// le total affiché en haut de la carte, et c'est le client qui s'en aperçoit.
const CMD_BON = { total: 24.5, bon_cadeau_montant: 10, paye_en_ligne: false }
verifier('un bon cadeau réduit ce qu’il reste à payer', /14,50/.test(etatPaiementCommande(CMD_BON).libelle))
verifier('et la ligne explique pourquoi', /bon cadeau/.test(etatPaiementCommande(CMD_BON).detail || ''))
// ⚠️ UN BON QUI COUVRE TOUT N'EST PAS « RIEN À PAYER » : c'est payé, à l'achat
// du bon. Les confondre ferait croire à une vente perdue.
egal('un bon qui couvre tout se lit comme payé',
  etatPaiementCommande({ total: 10, bon_cadeau_montant: 10, paye_en_ligne: false }).cle, 'paye')

// Une fois encaissée, elle dit combien et par quel moyen.
const CMD_ENCAISSEE = { total: 11.5, paye_en_ligne: false, encaisse_mode: 'especes', encaisse_montant: 11.5 }
egal('une commande encaissée est verte', etatPaiementCommande(CMD_ENCAISSEE).cle, 'paye')
verifier('et elle nomme le moyen', /espèces/.test(etatPaiementCommande(CMD_ENCAISSEE).detail || ''))
// Remise sans être payée : la dette se voit, comme sur un rendez-vous.
const CMD_IMPAYEE = { total: 11.5, paye_en_ligne: false, encaisse_mode: 'rien', encaisse_montant: 0 }
egal('remise sans être payée reste due', etatPaiementCommande(CMD_IMPAYEE).cle, 'du')
// ⚠️ GARDE NÉE MUETTE, MESURÉE EN MUTATION : le `cle` ne distingue pas une
// commande jamais encaissée d'une commande REMISE sans être payée. Les deux
// sont orange ; seule la phrase dit que le paquet est parti.
verifier('et la ligne dit que le paquet est déjà parti',
  /sans être payée/.test(etatPaiementCommande(CMD_IMPAYEE).detail || ''))

// ─── LE GESTE QUI MANQUAIT ────────────────────────────────────────────────
verifier('« Prête » mène enfin quelque part',
  /'pret':\s+\{ label: 'Prête',\s+couleur: T\.vert,\s+icon: '●', next: 'recupere',\s+nextLabel: 'Remettre au client' \}/.test(srcDashCmd))
// ⚠️ ET PAS DEUX BOUTONS POUR UN SEUL GESTE : la livraison et l'expédition ont
// leur propre sortie depuis « Prête », juste en dessous.
verifier('la livraison et l’expédition gardent la leur',
  /!\(\(estExpedition \|\| estLivraison\) && commande\.statut === 'pret'\)/.test(srcDashCmd))
// ⚠️ ON COMPTE, ET C'EST LA DIXIÈME FOIS QUE L'HOMONYME VOISIN REND UNE GARDE
// MUETTE. La règle sert DEUX fois sur la carte, pour la pastille et pour la
// ligne de détail : chercher son nom laissait le second usage satisfaire le
// test, et retirer la pastille ne faisait rien rougir.
//
// ⚠️ ET L'ANCRE NE FIGE PLUS LES ARGUMENTS. Elle cherchait `etatPaiementCommande(commande)`
// à la parenthèse près : le jour où la fonction a reçu la catégorie du commerce
// (31/08), le compte est tombé à zéro alors que les deux usages étaient bien là.
// Une garde qui compte doit compter l'APPEL, pas sa signature du moment.
egal('la carte passe par la règle du paiement aux deux endroits',
  (srcDashCmd.match(/etatPaiementCommande\(commande[,)]/g) || []).length, 2)

// ─── LE SWIPE NE VAUT QUE S'IL N'Y A PLUS RIEN À PAYER ────────────────────
//
// ⚠️ Alex, 17/08 : « le swipe est uniquement valable s'il n'y a pas de solde à
// payer ? » Il ne l'était pas. Le geste du client écrivait `statut='recupere'`
// côté serveur SANS regarder le solde : une commande payée sur place devenait
// récupérée sans que personne n'ait encaissé, et le commerçant n'avait plus
// aucun bouton pour le noter.
//
// Vérifié dans le même mouvement : ce swipe N'EXISTE PAS pour les rendez-vous.
// `SwipeRetrait` n'a qu'un usage, dans `PickupScreen`, monté pour les seules
// commandes. Un rendez-vous ne peut être honoré que par le commerçant.
const srcClient = readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8')
verifier('l’écran client refuse le geste quand il reste à payer',
  /resteAEncaisserCommande\(commande\) > 0 \?/.test(srcClient))
// ⚠️ ON NE CACHE PAS LE GESTE, ON DIT POURQUOI IL N'EST PAS LÀ : ne rien
// afficher est la pire des sorties, le client croirait à une panne.
verifier('et il dit combien, et qui confirmera',
  /À régler sur place/.test(srcClient) && /qui confirme la remise/.test(srcClient))

// ═══════════════════════════════════════════════════════════════════════════
// J'AVAIS ENFERMÉ LE CLIENT DANS SON ÉCRAN DE RETRAIT
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Alex, 17/08 : « il faut mettre une croix sur tous les écrans de swipe si
// le client veut sortir de cet écran et y revenir plus tard ». Le défaut était
// pire que ça : `PickupScreen` occupe TOUT le téléphone, par-dessus la
// navigation, et n'a jamais eu de croix. Tant que le geste de glissement était
// là, on pouvait au moins glisser ; le jour où je l'ai remplacé par un encadré
// explicatif — un `div` sans le moindre bouton — la seule sortie a disparu.
// Le Yopper devait tuer l'application.
//
// La croix appelle `onFermer`, la même sortie que le bouton « J'ai compris »,
// et elle est posée HORS des trois branches : ouvrir son numéro n'engage à rien.
verifier('l’écran de retrait a une croix',
  /aria-label="Fermer et revenir à mes commandes"/.test(srcClient))
// ⚠️ MESURÉ EN MUTATION : une croix qui n'appelle rien laisse le client dedans.
// On exige donc le geste, pas seulement le dessin.
verifier('et cette croix referme vraiment l’écran',
  /<button onClick=\{onFermer\} aria-label="Fermer et revenir à mes commandes"/.test(srcClient))
// ⚠️ ET ELLE EST AU-DESSUS DES TROIS BRANCHES, pas dans l'une d'elles : c'est
// exactement l'erreur d'origine, une sortie qui n'existait que dans un cas.
verifier('la croix est posée avant le partage des trois cas',
  srcClient.indexOf('aria-label="Fermer et revenir à mes commandes"')
    < srcClient.indexOf('resteAEncaisserCommande(commande) > 0 ?'))

// ═══════════════════════════════════════════════════════════════════════════
// LE CLIENT NE SAVAIT PAS S'IL DEVAIT EMPORTER DE QUOI PAYER
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ Alex, 17/08 : « dans les mails, rien ne dit payé ou pas payé, ou
// partiellement. Dans les statuts de commande non plus. » La pastille du
// commerçant existait depuis le matin ; celle de la personne qui PAIE, non.
//
// ⚠️ ET ON NE LUI SERT PAS LES MOTS DU COMMERÇANT. « Encaissé au terminal »,
// « remise au client sans être payée » : ce sont les mots de sa caisse à lui.
const { etatPaiementClient } = await import('../lib/rdv-paiement.js')

egal('une commande à payer au comptoir le dit au client',
  etatPaiementClient({ total: 15, paye_en_ligne: false }).cle, 'du')
// ⚠️ L'ESPACE AVANT L'EURO EST INSÉCABLE DEPUIS LE 28/08, et ces deux gardes
// l'écrivaient en dur. Ce qu'elles protègent, c'est l'ORDRE des mots — l'état
// d'abord, le montant ensuite — pas le codet du caractère d'espacement. Une
// garde qui rougit sur une amélioration de typographie surveille la mauvaise
// chose, comme celle du minimum de livraison ce matin.
verifier('avec le mot d’état EN TÊTE, puis le montant',
  /^À régler sur place 15,00[\s ]€$/.test(etatPaiementClient({ total: 15, paye_en_ligne: false }).libelle))
egal('une commande payée en ligne est verte',
  etatPaiementClient({ total: 15, paye_en_ligne: true }).cle, 'paye')
verifier('et elle promet qu’il n’y a rien à sortir',
  /rien à sortir/i.test(etatPaiementClient({ total: 15, paye_en_ligne: true }).detail || ''))
// ⚠️ LES MOTS DU COMMERÇANT NE DOIVENT PAS FUIR CÔTÉ CLIENT. Garde née muette
// à la première écriture : je testais la clé, qui vaut « paye » des deux côtés.
verifier('le client ne lit jamais le vocabulaire de la caisse',
  !/encaiss/i.test(JSON.stringify(etatPaiementClient({ total: 15, paye_en_ligne: false, encaisse_mode: 'especes', encaisse_montant: 15 }))))
// Un bon cadeau qui couvre tout : payé à l'achat du bon, jamais « gratuit ».
egal('un bon qui couvre tout se lit comme payé, côté client aussi',
  etatPaiementClient({ total: 10, bon_cadeau_montant: 10 }).cle, 'paye')
// ⚠️ ET LE BON PARTIEL SE DÉDUIT AVANT D'ÊTRE ANNONCÉ, sinon le client prépare
// le total qu'il voit en haut de sa carte.
verifier('un bon partiel ne réclame que le solde',
  /14,50/.test(etatPaiementClient({ total: 24.5, bon_cadeau_montant: 10 }).libelle))

// ─── LA MÊME PHRASE DANS LES EMAILS ───────────────────────────────────────
const { blocPaiementYopper } = await import('../lib/resend.js')
verifier('l’email d’une commande à payer sur place le dit',
  /À régler sur place 15,00[\s ]€/.test(blocPaiementYopper({ total: 15, paye_en_ligne: false })))
verifier('l’email d’une commande payée en ligne le dit aussi',
  /Payé en ligne/.test(blocPaiementYopper({ total: 15, paye_en_ligne: true })))
// ⚠️ LE DÉFAUT D'ORIGINE, EN UNE LIGNE : les deux emails étaient RIGOUREUSEMENT
// identiques. On compare les deux rendus, on n'inspecte pas un mot.
verifier('et les deux emails ne se ressemblent plus',
  blocPaiementYopper({ total: 15, paye_en_ligne: false })
    !== blocPaiementYopper({ total: 15, paye_en_ligne: true }))
// ⚠️ ON TESTE L'ABSENCE, PAS LE NOMBRE. Sans total ni moyen déclaré, on ne sait
// rien : inventer « À régler sur place » serait pire que se taire.
egal('sans rien de connu, l’email se tait', blocPaiementYopper({}), '')
egal('et il se tait aussi sans commande', blocPaiementYopper(null), '')

// ⚠️ LES COLONNES DOIVENT ARRIVER JUSQU'AUX GABARITS. C'est LE défaut le plus
// fréquent de ce projet : le select oublie une colonne, le repli est silencieux,
// et la fonctionnalité meurt sans lever la moindre erreur. Les TROIS emails que
// le client lit avant de se déplacer sont vérifiés, pas seulement celui qu'Alex
// a montré en capture.
for (const [nom, chemin] of [
  ['le ticket de confirmation', '../lib/commande-notifs.js'],
  ['l’email « ta commande est prête »', '../app/api/emails/commande-prete/route.js'],
  ['le rappel de retrait', '../app/api/cron/rappels-retrait/route.js'],
]) {
  const src = readFileSync(new URL(chemin, import.meta.url), 'utf8')
  verifier(`${nom} charge de quoi parler d’argent`, /paye_en_ligne/.test(src) && /encaisse_mode/.test(src))
  verifier(`${nom} passe la commande au bloc de paiement`, /paiement:\s*\w*cmd/.test(src))
}

// ─── ET LA MÊME PASTILLE DANS LE SUIVI DU CLIENT ──────────────────────────
//
// ⚠️ ON COMPTE, ONZIÈME FOIS DE L'HOMONYME VOISIN. Le suivi a QUATRE listes —
// en livraison, prêtes à retirer, en cours, historique — et chercher le nom du
// composant laissait trois d'entre elles muettes sans rien faire rougir.
egal('les quatre listes du suivi portent la pastille de paiement',
  (srcClient.match(/<PillPaiementClient commande=\{c\}/g) || []).length, 4)
// L'écran de retrait la porte aussi : c'est là que les deux la regardent.
verifier('l’écran de retrait la porte également',
  /<PillPaiementClient commande=\{commande\}\/>/.test(srcClient))

// ⚠️ ET LE SERVEUR TRANCHE, PAS LE NAVIGATEUR. L'écran peut être ouvert depuis
// vingt minutes, ou l'appel fabriqué à la main.
const srcRouteYopper = readFileSync(new URL('../app/api/yopper/commandes/route.js', import.meta.url), 'utf8')
verifier('le serveur refuse aussi, et nomme sa raison',
  /resteAEncaisserCommande\(cmd\) > 0/.test(srcRouteYopper) && /solde_a_regler/.test(srcRouteYopper))
// ⚠️ LES COLONNES DOIVENT ARRIVER JUSQU'À LA GARDE. Sans elles le solde vaut
// null, la garde laisse tout passer, et elle le fait EN SILENCE.
//
// ⚠️ CETTE GARDE FIGEAIT LA LISTE EXACTE, et elle a donc REFUSÉ l'ajout de
// `fidelite_remise` le 26/08 : le verrouillage de forme, une fois de plus. Une
// liste de colonnes n'a pas à être identique, elle doit CONTENIR ce dont le
// calcul a besoin. On nomme donc chaque colonne, séparément.
{
  const selectReception = (srcRouteYopper.match(/\.select\('id, mode_retrait, client_email[^']*'\)/) || [])[0] || ''
  for (const col of ['total', 'paye_en_ligne', 'bon_cadeau_montant', 'fidelite_remise']) {
    verifier(`et il charge ${col} pour calculer ce solde`, selectReception.includes(col))
  }
}

// La porte de secours du commerçant, pour les commandes déjà remises.
verifier('une commande remise sans moyen garde son rattrapage',
  /commande\.statut === 'recupere' && !commande\.encaisse_mode && resteAEncaisserCommande\(commande\) > 0/.test(srcDashCmd))

// ═══════════════════════════════════════════════════════════════════════════
// LE JOUR COMPTABLE D'UNE ÉCRITURE, ET LA NUIT QUI LE FAISAIT GLISSER
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ DÉFAUT VU PAR ALEX LE 19/08 À 00h28 : un abonnement encaissé cette nuit-là
// est arrivé daté du 18 dans l'export. `paye_le` est un INSTANT, et le découper
// en temps universel rend le jour de Greenwich. Minuit à Bruxelles, c'est 22h
// (été) ou 23h (hiver) la VEILLE en UTC.
//
// ⚠️ CE N'EST PAS COSMÉTIQUE : en fin de mois, toutes les ventes de la première
// heure de la nuit basculent dans le mois précédent ; au 1er janvier, dans
// l'exercice précédent. C'est un document remis à un comptable.
{
  // ── En ÉTÉ, Bruxelles est à UTC+2 ────────────────────────────────────────
  // 22h28 UTC le 18 = 00h28 le 19 chez nous. Le jour comptable est le 19.
  const aboNuitEte = {
    id: 'abo-nuit-ete', paye: true, prix: 400, tva_taux: 21,
    paye_le: '2026-08-18T22:28:00.000Z', mode_paiement: 'especes', statut: 'actif',
  }
  const lignesNuitEte = construireLignes({ abonnements: [aboNuitEte], tauxDefaut: 21 })
  egal('un abonnement encaissé à 00h28 en été est daté du jour même',
    lignesNuitEte[0]?.date, '2026-08-19')

  // ── En HIVER, Bruxelles est à UTC+1 ──────────────────────────────────────
  // ⚠️ LES DEUX SAISONS SE TESTENT. Un correctif écrit avec « +2 » en dur
  // serait faux d'une heure six mois par an, et le banc ne le verrait pas s'il
  // ne travaillait qu'en août. Ce projet a déjà payé cette erreur sur les
  // délais d'annulation.
  const aboNuitHiver = {
    id: 'abo-nuit-hiver', paye: true, prix: 400, tva_taux: 21,
    paye_le: '2026-01-14T23:15:00.000Z', mode_paiement: 'virement', statut: 'actif',
  }
  egal('… et en hiver aussi, avec un décalage d’une heure seulement',
    construireLignes({ abonnements: [aboNuitHiver], tauxDefaut: 21 })[0]?.date, '2026-01-15')

  // ── En pleine journée, rien ne bouge ─────────────────────────────────────
  const aboMidi = {
    id: 'abo-midi', paye: true, prix: 400, tva_taux: 21,
    paye_le: '2026-08-18T12:00:00.000Z', mode_paiement: 'terminal', statut: 'actif',
  }
  egal('un encaissement de plein jour garde son jour',
    construireLignes({ abonnements: [aboMidi], tauxDefaut: 21 })[0]?.date, '2026-08-18')

  // ── Les frères : le solde d'un rendez-vous, et la commande sans date ─────
  // ⚠️ ILS ÉTAIENT TROIS, PAS UN. Corriger le seul endroit signalé n'est pas
  // corriger le défaut : c'est la règle du 17/08, vérifiée ici.
  const rdvNuit = {
    id: 'rdv-nuit', statut: 'honore', tva_taux: 21,
    encaisse_montant: 15, encaisse_mode: 'especes',
    encaisse_le: '2026-08-18T22:40:00.000Z', date_rdv: '2026-08-18',
    prix_estime: 15, acompte_montant: 0,
  }
  const ligneRdvNuit = construireLignes({ rdvs: [rdvNuit], tauxDefaut: 21 })
    .find(l => l.type === 'Solde RDV')
  egal('un solde de rendez-vous encaissé après minuit est daté du jour même',
    ligneRdvNuit?.date, '2026-08-19')

  const cmdeNuit = {
    id: 'cmd-nuit', statut: 'recupere', total: 20, paye_en_ligne: true,
    date_commande: null, created_at: '2026-08-18T22:50:00.000Z',
    commande_articles: [{ article_id: 'a1', prix_unitaire: 20, quantite: 1, tva_taux: 6 }],
  }
  egal('une commande sans date de retrait retombe sur le bon jour',
    construireLignes({ commandes: [cmdeNuit], tauxDefaut: 21 })[0]?.date, '2026-08-19')

  // ── Une colonne DATE ne porte aucun fuseau ───────────────────────────────
  // ⚠️ ET NE DOIT SURTOUT PAS ÊTRE CONVERTIE. `date_commande` est déjà le jour
  // civil voulu ; le faire passer par un fuseau le décalerait pour de bon.
  const cmdeJour = {
    id: 'cmd-jour', statut: 'recupere', total: 20, paye_en_ligne: true,
    date_commande: '2026-08-19', created_at: '2026-08-18T22:50:00.000Z',
    commande_articles: [{ article_id: 'a1', prix_unitaire: 20, quantite: 1, tva_taux: 6 }],
  }
  egal('une date de retrait est prise telle quelle',
    construireLignes({ commandes: [cmdeJour], tauxDefaut: 21 })[0]?.date, '2026-08-19')

  // ── Et le journal range bien la nuit dans le bon jour ────────────────────
  const journalNuit = journalParJour(lignesNuitEte)
  egal('le journal ouvre la journée du 19', journalNuit[0]?.date, '2026-08-19')
  egal('… avec les 400 € dans le seau des espèces', journalNuit[0]?.especes, 400)
}

// ═══════════════════════════════════════════════════════════════════════════
// LE CLIENT ET L'HEURE DANS LE DÉTAIL (demande d'Alex, 19/08)
// ═══════════════════════════════════════════════════════════════════════════
//
// « Il faut faire l'export le plus complet possible » : sans nom, un
// encaissement de 400 € au comptoir ne se rapproche de rien ; sans heure, il
// est introuvable dans le relevé du terminal, où tout est horodaté.
{
  const abo = {
    id: 'abo-nom', paye: true, prix: 400, tva_taux: 21, statut: 'actif',
    paye_le: '2026-08-18T22:28:00.000Z', mode_paiement: 'especes',
    client_prenom: 'Émilie', client_nom: 'Dupont',
  }
  const rdv = {
    id: 'rdv-nom', statut: 'honore', tva_taux: 21,
    encaisse_montant: 15, encaisse_mode: 'terminal',
    encaisse_le: '2026-08-19T09:05:00.000Z', date_rdv: '2026-08-19',
    prix_estime: 15, acompte_montant: 0,
    client_prenom: 'Jean', client_nom: 'Martin',
  }
  const cmde = {
    id: 'cmd-nom', statut: 'recupere', total: 20, paye_en_ligne: true,
    date_commande: '2026-08-19', created_at: '2026-08-19T07:12:00.000Z',
    client_nom: 'Sophie Leroy',
    commande_articles: [{ article_id: 'a1', prix_unitaire: 20, quantite: 1, tva_taux: 6 }],
  }

  const lignes = construireLignes({ commandes: [cmde], rdvs: [rdv], abonnements: [abo], tauxDefaut: 21 })
  const ligneAbo = lignes.find(l => l.type === 'Abonnement')
  const ligneRdv = lignes.find(l => l.type === 'Solde RDV')
  const ligneCmd = lignes.find(l => l.type === 'Commande')

  // ── Le nom, assemblé selon la table ──────────────────────────────────────
  // `commandes` porte un nom complet, les deux autres séparent prénom et nom.
  egal('l’abonnement porte prénom et nom', ligneAbo?.client, 'Émilie Dupont')
  egal('le rendez-vous porte prénom et nom', ligneRdv?.client, 'Jean Martin')
  egal('la commande porte son nom complet', ligneCmd?.client, 'Sophie Leroy')
  // ⚠️ UN NOM ABSENT NE DOIT PAS ÉCRIRE « undefined » dans un document
  // comptable. Une commande anonyme existe : un visiteur qui paie sans compte.
  egal('un client sans nom laisse la case VIDE',
    construireLignes({ commandes: [{ ...cmde, client_nom: null }], tauxDefaut: 21 })[0]?.client, '')
  // ⚠️ ET UN PRÉNOM MANQUANT NE LAISSE PAS D'ESPACE DEVANT LE NOM. Ce cas-là
  // discrimine vraiment : un simple `join(' ')` passe le test précédent mais
  // rend « ␣Dupont » ici. Mesuré muet, puis réarmé.
  egal('un prénom manquant ne décale pas le nom',
    construireLignes({ abonnements: [{ ...abo, client_prenom: null }], tauxDefaut: 21 })[0]?.client, 'Dupont')
  egal('les espaces autour d’un nom sont rognés',
    construireLignes({ abonnements: [{ ...abo, client_prenom: '  Émilie  ', client_nom: ' Dupont ' }], tauxDefaut: 21 })[0]?.client,
    'Émilie Dupont')

  // ── L'heure, en heure belge ──────────────────────────────────────────────
  // ⚠️ 22h28 UTC = 00h28 chez nous. C'est cette heure-là qu'Alex a vue sur sa
  // pendule, et c'est elle qu'il retrouvera sur le relevé du terminal.
  egal('l’encaissement de 00h28 s’écrit bien 00:28', ligneAbo?.heure, '00:28')
  egal('un solde de rendez-vous porte l’heure de son encaissement', ligneRdv?.heure, '11:05')
  egal('une commande payée en ligne porte l’heure du paiement', ligneCmd?.heure, '09:12')
  // ⚠️ UNE DATE NUE NE PORTE AUCUNE HEURE : on ne l'invente pas, et surtout on
  // n'écrit pas « 00:00 », qui se lirait comme un encaissement de minuit.
  egal('une date sans heure laisse la case VIDE',
    construireLignes({ abonnements: [{ ...abo, paye_le: '2026-08-18' }], tauxDefaut: 21 })[0]?.heure, '')

  // ── ⚠️ UN JOUR RANGÉ DANS UNE COLONNE D'HORODATAGE N'EST PAS UNE HEURE ───
  // Alex, 19/08 : ses abonnements vendus en ligne affichaient tous « 02:00 ».
  // Le webhook n'écrivait qu'un JOUR dans `paye_le`, rangé à minuit universel,
  // et minuit UTC vaut 02:00 chez nous en été. Une heure inventée dans un
  // document comptable. Une case vide s'interprète, une fausse heure se croit.
  egal('un minuit universel ne devient pas 02:00',
    construireLignes({ abonnements: [{ ...abo, paye_le: '2026-08-16T00:00:00+00:00' }], tauxDefaut: 21 })[0]?.heure, '')
  egal('… quelle que soit son écriture',
    construireLignes({ abonnements: [{ ...abo, paye_le: '2026-08-16T00:00:00.000Z' }], tauxDefaut: 21 })[0]?.heure, '')
  // ⚠️ ET UNE VRAIE HEURE PROCHE DE MINUIT RESTE LISIBLE : on écarte l'instant
  // pile, pas la tranche de nuit. Sinon on effacerait les encaissements réels
  // de 00h28, ceux-là mêmes qui ont fait découvrir toute cette histoire.
  egal('une vente à 00h01 universel garde son heure',
    construireLignes({ abonnements: [{ ...abo, paye_le: '2026-08-16T00:01:00.000Z' }], tauxDefaut: 21 })[0]?.heure, '02:01')

  // ── ⚠️ LES RÉFÉRENCES PORTENT LEUR PRÉFIXE ───────────────────────────────
  // La colonne rendait « 23 » là où le client, ses emails et le tableau de bord
  // lisent tous « RV23 » : aucun rapprochement n'était possible. Même défaut
  // que l'écran de confirmation corrigé le 11/08, jamais porté jusqu'ici.
  egal('un rendez-vous porte sa référence complète',
    construireLignes({ rdvs: [{ ...rdv, numero_rdv: 23, numero_prefixe: 'RV' }], tauxDefaut: 21 })
      .find(l => l.type === 'Solde RDV')?.reference, 'RV23')
  egal('une commande aussi',
    construireLignes({ commandes: [{ ...cmde, numero_commande: 4, numero_prefixe: 'CC' }], tauxDefaut: 21 })[0]?.reference, 'CC4')

  // ── ⚠️ ET LA RÉFÉRENCE EST QUALIFIÉE QUAND ELLE SORT DE SA SEMAINE ───────
  // Remarque d'Alex, 19/08 : les compteurs des commandes et des rendez-vous
  // repartent à 1 CHAQUE SEMAINE, donc deux `RV23` peuvent apparaître dans un
  // export d'un mois. Ce n'est pas ambigu pour qui lit la ligne entière, qui
  // porte sa date ; ça le devient dès qu'on trie par référence, ce que fait
  // n'importe quel comptable.
  egal('un rendez-vous qualifie sa référence par sa semaine',
    construireLignes({ rdvs: [{ ...rdv, numero_rdv: 23, numero_prefixe: 'RV', numero_semaine: '2026-34' }], tauxDefaut: 21 })
      .find(l => l.type === 'Solde RDV')?.reference, 'RV23-2026-S34')
  // ⚠️ LA SEMAINE SE LIT SUR DEUX CHIFFRES, sinon un tri alphabétique range la
  // semaine 5 après la 40, et c'est exactement le tri que fait un tableur.
  egal('une semaine à un chiffre est complétée',
    construireLignes({ commandes: [{ ...cmde, numero_commande: 4, numero_prefixe: 'CC', numero_semaine: '2026-5' }], tauxDefaut: 21 })[0]?.reference,
    'CC4-2026-S05')

  // ── ⚠️ LES ABONNEMENTS, SÉRIE CONTINUE ET SANS SEMAINE ───────────────────
  // Un contrat vit douze mois : sa référence doit se suffire à elle-même, et
  // lui coller une semaine n'aurait aucun sens.
  egal('un abonnement porte son numéro de contrat',
    construireLignes({ abonnements: [{ ...abo, numero_abonnement: 7, numero_prefixe: 'ABT' }], tauxDefaut: 21 })[0]?.reference, 'ABT7')
  // ⚠️ ET LE PRÉFIXE SE RETROUVE MÊME S'IL MANQUE EN BASE. Mon premier test
  // fournissait toujours `numero_prefixe`, donc le repli n'était jamais
  // éprouvé : mesuré muet, puis réarmé. Un numéro nu se lirait « 7 », qui ne
  // veut rien dire dans un document où cohabitent CC, RV et ABT.
  egal('un contrat sans préfixe stocké se lit quand même ABT',
    construireLignes({ abonnements: [{ ...abo, numero_abonnement: 7, numero_prefixe: null }], tauxDefaut: 21 })[0]?.reference, 'ABT7')
  // ⚠️ ET SANS NUMÉRO, on retombe sur le fragment d'identifiant plutôt que sur
  // une case vide : c'est le cas des contrats d'avant la migration.
  verifier('un contrat non numéroté garde un repère',
    (construireLignes({ abonnements: [abo], tauxDefaut: 21 })[0]?.reference || '').length > 0)

  // ── ⚠️ LE CANAL NE CONTREDIT PLUS LA RÉFÉRENCE ───────────────────────────
  // Question d'Alex, 19/08 : « ça s'applique aussi au C&C, RE, et à tout le
  // reste ? ». En exécutant l'export avec une ligne de chaque sorte, une ligne
  // annonçait « Click & Collect » avec la référence `RE12` juste à droite.
  //
  // Deux fautes : `mode_retrait` ne distingue PAS le Click and Collect du
  // retrait en magasin (les deux valent `retrait`, c'est le CRÉNEAU qui les
  // sépare), et la branche « boutique » était MORTE, la contrainte de la base
  // n'acceptant que retrait, livraison et expedition.
  const canalDe = (c) => construireLignes({ commandes: [{ ...cmde, ...c }], tauxDefaut: 21 })[0]?.canal
  egal('le préfixe CC donne Click & Collect', canalDe({ numero_prefixe: 'CC' }), 'Click & Collect')
  egal('le préfixe RE donne Retrait en magasin', canalDe({ numero_prefixe: 'RE' }), 'Retrait en magasin')
  egal('le préfixe LI donne Livraison', canalDe({ numero_prefixe: 'LI' }), 'Livraison')
  egal('le préfixe EX donne Expédition', canalDe({ numero_prefixe: 'EX' }), 'Expédition')
  // ⚠️ ET LES COMMANDES D'AVANT LA NUMÉROTATION retombent sur la MÊME règle que
  // le déclencheur : le créneau, jamais le mode de retrait.
  egal('sans préfixe, un créneau fait le Click & Collect',
    canalDe({ numero_prefixe: null, mode_retrait: 'retrait', creneau_id: 'k1' }), 'Click & Collect')
  egal('sans préfixe et sans créneau, c’est un retrait en magasin',
    canalDe({ numero_prefixe: null, mode_retrait: 'retrait', creneau_id: null }), 'Retrait en magasin')
  egal('sans préfixe, la livraison reste reconnue',
    canalDe({ numero_prefixe: null, mode_retrait: 'livraison' }), 'Livraison')
  // ⚠️ ET `creneau_id` DOIT ARRIVER JUSQU'ICI, sinon le repli classerait toutes
  // les anciennes commandes en retrait en magasin, sans la moindre erreur.
  {
    const srcRoute = readFileSync(new URL('../app/api/dashboard/export-comptable/route.js', import.meta.url), 'utf8')
    const selectCmd = colonnesDe(srcRoute, 'commandes')
    verifier('le créneau arrive jusqu’au calcul du canal', /\bcreneau_id\b/.test(selectCmd), selectCmd)
  }

  // ── Les colonnes sortent bien dans le fichier, et dans le bon ordre ──────
  const csv = csvDetail({ lignes, commercant: { nom: 'Test' }, du: '2026-08-01', au: '2026-08-31' })
  const enTete = csv.split('\r\n').find(l => l.startsWith('Date'))
  verifier('le détail annonce l’heure et le client', /^Date;Heure;Client;Type/.test(enTete || ''), enTete || '')
  verifier('et le nom apparaît vraiment dans le fichier', csv.includes('Émilie Dupont'))
  verifier('et l’heure aussi', csv.includes('00:28'))

  // ⚠️ LE JOURNAL AGRÈGE PAR JOUR : une heure et un nom n'y voudraient rien
  // dire, et les y mettre laisserait croire à un document nominatif.
  const journal = csvJournal({ lignes, commercant: { nom: 'Test' }, du: '2026-08-01', au: '2026-08-31' })
  verifier('le journal ne nomme personne', !journal.includes('Émilie Dupont'))
}

// ── LE SELECT DE LA ROUTE PORTE CE QUE L'EXPORT AFFICHE ────────────────────
// ⚠️ C'EST LE DÉFAUT LE PLUS FRÉQUENT DU PROJET, et il serait ici SILENCIEUX :
// sans la colonne, la case « Client » sortirait vide sur toutes les lignes,
// sans la moindre erreur, et personne ne saurait si c'est un bug ou des ventes
// anonymes. La garde lit le CONTENU de chaque `select`, jamais son voisinage.
{
  const srcExport = readFileSync(new URL('../app/api/dashboard/export-comptable/route.js', import.meta.url), 'utf8')
  const selectDe = (table) => colonnesDe(srcExport, table)

  verifier('les commandes lisent le nom du client', /\bclient_nom\b/.test(selectDe('commandes')), selectDe('commandes'))
  verifier('les rendez-vous lisent prénom et nom',
    /\bclient_prenom\b/.test(selectDe('rdv_reservations')) && /\bclient_nom\b/.test(selectDe('rdv_reservations')))
  verifier('… et de quoi dater l’acompte payé en ligne',
    /\bacompte_paye_date\b/.test(selectDe('rdv_reservations')))
  verifier('les abonnements lisent prénom et nom',
    /\bclient_prenom\b/.test(selectDe('abonnements')) && /\bclient_nom\b/.test(selectDe('abonnements')))
  // ⚠️ ET LE PRÉFIXE DE NUMÉROTATION, sans lequel `referenceCommande` rendrait
  // le numéro NU : la correction serait muette, et la colonne afficherait
  // toujours « 23 » au lieu de « RV23 ».
  for (const table of ['commandes', 'rdv_reservations']) {
    verifier(`${table} lit le préfixe de numérotation`,
      /\bnumero_prefixe\b/.test(selectDe(table)), selectDe(table))
  }
}

// ── L'INSTANT DU PAIEMENT EST ÉCRIT, PAS SEULEMENT LE JOUR ─────────────────
{
  const srcWebhookInstant = readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8')
  verifier('le webhook grave l’instant du paiement sur le contrat',
    /payeA: new Date\(\(paymentIntent\.created/.test(srcWebhookInstant))
  const { contratDepuisFormule } = await import('../lib/abonnements.js')
  const contratInstant = contratDepuisFormule(
    { id: 'f1', type: 'carnet', seances_carnet: 10, validite_jours: 180, prix: 400 },
    { achatLe: '2026-08-19', payeA: '2026-08-19T08:30:00.000Z' })
  egal('et le contrat garde cet instant', contratInstant?.paye_le, '2026-08-19T08:30:00.000Z')
  // Sans instant fourni, on retombe sur le jour : c'est le cas des inscriptions
  // à la main d'avant, et il ne doit pas casser.
  const contratJour = contratDepuisFormule(
    { id: 'f1', type: 'carnet', seances_carnet: 10, validite_jours: 180, prix: 400 },
    { achatLe: '2026-08-19' })
  egal('sans instant, le jour fait foi', contratJour?.paye_le, '2026-08-19')

  const srcExport = readFileSync(new URL('../app/api/dashboard/export-comptable/route.js', import.meta.url), 'utf8')
  // ⚠️ ET LE FILTRE DES ABONNEMENTS SE FAIT EN HEURE BELGE. Il découpait
  // l'instant en temps universel : un abonnement encaissé à 00h28 le 19 était
  // classé au 18, donc un export du 19 au 19 ne le contenait PAS DU TOUT. Une
  // ligne ABSENTE, et non décalée. Écriture différente du même défaut, que la
  // garde générale ne voyait pas : elle ne cherchait que `toISOString()`.
  verifier('le filtre des abonnements date en heure belge',
    /const jour = jourBruxelles\(a\?\.paye_le\)/.test(srcExport))
  verifier('… et plus aucun découpage d’instant ne subsiste dans la route',
    !/String\(a\?\.paye_le[^)]*\)\.slice\(0, 10\)/.test(srcExport))
}

// ── AUCUN JOUR CIVIL NE SE DÉDUIT PLUS D'UN INSTANT EN TEMPS UNIVERSEL ─────
//
// ⚠️ LA GARDE PORTE SUR LA PRATIQUE, DANS TOUT `app` ET TOUT `lib`, et pas sur
// les endroits déjà corrigés : c'est la leçon des flous et des relevés du
// 18/08, une garde étroite ne garde rien. Elle compte les `toISOString()`
// suivis d'une découpe à dix caractères.
//
// ⚠️ TROIS FAMILLES, UNE SEULE FAUTIVE. Les instants stockés tels quels
// (`updated_at`, `deleted_at`, `expires_at`…) sont JUSTES : une colonne
// timestamp mérite l'instant universel, et on n'y touche pas — ils n'ont pas de
// `.slice(0, 10)`. Ceux ancrés à midi UTC (`T12:00:00Z` puis n jours) sont
// justes par construction : douze heures de marge de chaque côté, aucun fuseau
// ne les fait changer de jour. Reste la famille fautive, celle qui prend
// l'instant du moment.
{
  const anchesAutorisees = [
    // Ancrage à midi UTC : l'arithmétique de jours ne peut pas déraper.
    'lib/abonnements.js',
    'lib/statistiques.js',
    'lib/statut-commerce.js',
  ]
  const coupables = []
  const parcourirSources = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = `${dossier}/${entree.name}`
      if (entree.isDirectory()) { parcourirSources(chemin); continue }
      if (!entree.name.endsWith('.js')) continue
      if (anchesAutorisees.includes(chemin)) continue
      const source = readFileSync(chemin, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      const n = (source.match(/toISOString\(\)\s*\.?\s*slice\(0,\s*10\)/g) || []).length
      if (n > 0) coupables.push(`${chemin} (${n})`)
    }
  }
  parcourirSources('app')
  parcourirSources('lib')
  verifier('aucun jour civil n’est déduit d’un instant en temps universel',
    coupables.length === 0, coupables.join(', '))

  // ⚠️ ET LES TROIS EXCEPTIONS DOIVENT RESTER ANCRÉES À MIDI. Sans cette
  // vérification, la liste ci-dessus deviendrait un passe-droit permanent : il
  // suffirait qu'un de ces fichiers change de méthode pour que le défaut y
  // revienne sans que rien ne rougisse.
  for (const chemin of anchesAutorisees) {
    verifier(`${chemin} garde son ancrage à midi UTC`,
      /T12:00:00Z/.test(readFileSync(chemin, 'utf8')))
  }
}

// ── LES FRÈRES QUI ÉCRIVENT LA DATE, ET NON PLUS SEULEMENT CELUI QUI LA LIT ─
{
  const srcWebhookAbo = readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8')
  verifier('la date d’achat d’un abonnement en ligne est belge',
    /const achatLe = jourBruxelles\(/.test(srcWebhookAbo))
  const srcConfigDates = readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8')
  // ⚠️ DEUX, PAS UN : l'inscription qui ouvre le contrat, et la résiliation qui
  // décide quelles séances sont « à venir ». À 00h30, la seconde travaillerait
  // sur la veille et emporterait les séances d'aujourd'hui.
  egal('l’inscription et la résiliation datent en heure belge',
    (srcConfigDates.match(/const aujourdhui = jourBruxelles\(\)/g) || []).length, 2)
}

// ⚠️ UN FRAIS INCONNU RESTE VIDE, JAMAIS 0,00 (Alex, 19/08). Ses quatre
// abonnements vendus en ligne affichaient « 0,00 € de frais », ce qui AFFIRME
// qu'il n'y en a pas eu, alors qu'ils n'ont jamais été relevés : la colonne a
// été ajoutée le 17/08, ils datent des 16 et 17. Piège du zéro, `arrondi(null)`
// rendant 0. Sa voisine Net Stripe disait déjà « rien » correctement.
{
  const aboSansFrais = {
    id: 'x', paye: true, prix: 400, tva_taux: 21, statut: 'actif',
    paye_le: '2026-08-16T09:00:00.000Z', mode_paiement: 'en_ligne',
  }
  const sansFrais = construireLignes({ abonnements: [aboSansFrais], tauxDefaut: 21 })[0]
  egal('un frais jamais relevé vaut « on ne sait pas »', sansFrais?.fraisStripe, null)
  const csvVide = csvDetail({ lignes: [sansFrais], commercant: { nom: 'T' }, du: '2026-08-01', au: '2026-08-31' })
  const ligneVide = csvVide.split('\r\n').find(l => l.startsWith('2026-08-16')) || ''
  verifier('et sa case reste VIDE dans le fichier', /;;$/.test(ligneVide), ligneVide)
  // ⚠️ ET UN FRAIS RÉELLEMENT NUL S'ÉCRIT, lui : zéro connu et zéro inconnu ne
  // sont pas la même chose, c'est toute la raison de ce correctif.
  egal('un frais réellement nul reste un zéro',
    construireLignes({ abonnements: [{ ...aboSansFrais, stripe_frais: 0 }], tauxDefaut: 21 })[0]?.fraisStripe, 0)
}

// ═══ LA RÉCOMPENSE SORT DE LA BASE TVA, LE BON CADEAU NON (28/08) ═════════
//
// 🔴 Trouvé par Alex dans deux vrais tickets reçus le même quart d'heure. Le
// premier disait « Plus rien à payer 0,00 € » et, deux lignes plus bas,
// « TVA 21 % · base 6,61 € · 1,39 € ». Le document se contredisait tout seul.
//
// ⚠️ LES DEUX SENS SONT VÉRIFIÉS ICI, parce que se tromper coûte cher dans les
// deux : oublier la remise fait déclarer une TVA qu'on ne doit pas, retrancher
// le bon cadeau fait disparaître une TVA réellement due.
{
  // Le ticket d'Alex, cas 1 : 8,00 € à 21 %, récompense de 8,00 €.
  const offert = imputerRemise({ 21: 8 }, 8)
  egal('une commande entièrement offerte ne laisse aucune base', offert, { 21: 0 })

  // Le ticket d'Alex, cas 2 : 72,00 € à 21 %, bon cadeau de 50,00 €.
  // Le bon n'est PAS passé à `imputerRemise` : la base reste entière.
  const avecBon = imputerRemise({ 21: 72 }, 0)
  egal('un bon cadeau ne touche pas à la base imposable', avecBon, { 21: 72 })
  egal('et la TVA due reste celle des 72 €', ventiler(avecBon[21], 21), { base: 59.50, tva: 12.50 })

  // Une remise partielle mord sur le taux le plus lourd d'abord.
  egal('la remise s\'impute sur le plus gros montant',
    imputerRemise({ 6: 16, 21: 40 }, 10), { 6: 16, 21: 30 })

  // ⚠️ ET ELLE DÉBORDE quand elle épuise ce taux, sinon une grosse récompense
  // laisserait une base imposable que le client n'a pas payée.
  egal('une remise plus grosse déborde sur le taux suivant',
    imputerRemise({ 6: 16, 21: 40 }, 50), { 6: 6, 21: 0 })
  egal('une remise qui dépasse tout ne laisse rien',
    imputerRemise({ 6: 16, 21: 40 }, 100), { 6: 0, 21: 0 })

  // Les cas dégénérés ne doivent rien casser ni rien inventer.
  egal('aucune remise laisse la ventilation intacte', imputerRemise({ 21: 30 }, 0), { 21: 30 })
  egal('une remise absente vaut aucune remise', imputerRemise({ 21: 30 }, null), { 21: 30 })
  egal('une remise négative n\'augmente rien', imputerRemise({ 21: 30 }, -5), { 21: 30 })
  egal('sans aucun taux, rien à imputer', imputerRemise({}, 10), {})

  // ⚠️ LE GARDE-FOU CONTRE LA DIVERGENCE, et c'est LE point de ce bloc. Le
  // ticket du client et le journal du comptable décrivent la MÊME commande :
  // ils doivent en tirer la même base imposable. C'est en les laissant
  // calculer chacun de leur côté que l'écart est né.
  const cmdRemise = {
    id: 'tva1', numero_commande: 42, statut: 'recupere', date_commande: '2026-08-28',
    created_at: '2026-08-28T10:00:00Z', mode_retrait: 'retrait', regime_tva: 'emporter',
    paye_en_ligne: true, total: 50, fidelite_remise: 10, frais_livraison: 0,
    tva_taux_livraison: null, encaisse_mode: null,
    commande_articles: [{ article_id: 'a1', quantite: 1, prix_unitaire: 50, tva_taux: 21 }],
  }
  // ⚠️ GARDE DE BRANCHEMENT, ET ELLE MANQUAIT : la mesure par mutation l'a dit.
  // `imputerRemise` avait beau être juste, RIEN ne vérifiait que le gabarit du
  // ticket lui passe la SEULE récompense. Y ajouter `bon_cadeau_montant`
  // laissait tout vert, et faisait disparaître de la TVA réellement due.
  const notifs = readFileSync(new URL('../lib/commande-notifs.js', import.meta.url), 'utf8')
  verifier('le ticket n’impute que la récompense',
    /imputerRemise\(parTauxTicket, cmd\.fidelite_remise\)/.test(notifs))
  verifier('et jamais le bon cadeau, qui est un moyen de paiement',
    !/imputerRemise\([^)]*bon_cadeau/.test(notifs))

  const ligneJournal = construireLignes({ commandes: [cmdRemise], tauxDefaut: 21 })[0]
  const baseTicket = ventiler(imputerRemise({ 21: 50 }, 10)[21], 21).base
  const baseJournal = ventiler(ligneJournal.parTaux['21'], 21).base
  verifier('le ticket du client et le journal du comptable disent la même base',
    Math.abs(baseTicket - baseJournal) < 0.005,
    `ticket ${baseTicket} / journal ${baseJournal}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. 🔴 CE QUI EST REPARTI NE COMPTE PLUS COMME UNE VENTE (02/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ TOUT CE BLOC EXÉCUTE `construireLignes`. Aucune garde ne cherche un mot :
// le journal ne ment pas dans son vocabulaire, il ment dans ses montants.
{
  const PERIODE = { du: '2026-03-01', au: '2026-03-31' }
  const somme = (lignes, champ) => arrondi(lignes.reduce((s, l) => s + (Number(l[champ]) || 0), 0))

  // ─── Un rendez-vous annulé et remboursé ───────────────────────────────────
  //
  // 🔴 C'EST LE DÉFAUT D'ORIGINE : cette boucle ne filtrait AUCUN statut, et
  // `STATUTS_EXCLUS` n'en contient aucun de rendez-vous. Une ligne « Acompte
  // RDV » partait chez le comptable pour de l'argent rendu au client.
  const RDV_ANNULE = {
    id: 'r1', statut: 'annule_client', date_rdv: '2026-03-10',
    acompte_montant: 20, acompte_paye: true, acompte_paye_en_ligne: true,
    acompte_paye_date: '2026-03-05T10:00:00Z', tva_taux: 21,
    stripe_frais: 0.5, stripe_net: -0.5,
    stripe_refund_amount: 20, stripe_refund_date: '2026-03-11T14:30:00Z',
  }
  const lAnnule = construireLignes({ rdvs: [RDV_ANNULE], periode: PERIODE })
  verifier('un acompte remboursé produit sa contrepassation', lAnnule.length === 2, `${lAnnule.length} ligne(s)`)
  verifier('et le chiffre d’affaires retombe à zéro', somme(lAnnule, 'total') === 0, `${somme(lAnnule, 'total')}`)
  verifier('l’encaissement en ligne aussi', somme(lAnnule, 'enLigne') === 0)

  // ✅ ARBITRAGE D'ALEX : la ligne à zéro PORTE le frais retenu. Stripe ne le
  // restitue pas, c'est un coût réel, et il ne figurait dans aucun document.
  verifier('le frais retenu par Stripe reste visible', somme(lAnnule, 'fraisStripe') === 0.5,
    `${somme(lAnnule, 'fraisStripe')}`)
  // ⚠️ ET LE PIÈGE DU CHANTIER : `stripe_net` porte DÉJÀ le remboursement,
  // `stripe_frais` non. Sans la reconstitution du net d'origine, les deux
  // lignes auraient déduit deux fois et annoncé -20,50 de perte au lieu de
  // -0,50.
  verifier('le net des deux lignes vaut ce que Stripe a gardé', somme(lAnnule, 'netStripe') === -0.5,
    `${somme(lAnnule, 'netStripe')}`)

  // ✅ ARBITRAGE D'ALEX : une ligne de remboursement à SA date. Le relevé
  // bancaire montre deux mouvements ; un journal qui n'en montre qu'un ne se
  // rapproche de rien.
  // ⚠️ `?.` PARTOUT SUR CETTE LIGNE, ET CE N'EST PAS DE LA COQUETTERIE : une
  // mutation qui supprime la contrepassation vide le `find`, et un banc qui
  // PLANTE est compté comme MANQUÉ par le harnais. Il n'a rien prouvé, il a
  // seulement empêché la mesure.
  const negative = lAnnule.find(l => l.remboursement)
  verifier('la contrepassation est datée du remboursement', negative?.date === '2026-03-11', negative?.date)
  verifier('elle porte son heure, pour le rapprochement', /^\d{2}:\d{2}$/.test(negative?.heure || ''), negative?.heure)
  verifier('et la même référence que la vente', negative?.reference === lAnnule[0].reference)
  verifier('un remboursement ne repasse jamais par le tiroir',
    negative?.comptoir === 0 && negative?.modeEncaissement === null)

  // ─── Une commande PARTIELLEMENT remboursée ────────────────────────────────
  //
  // 🔴 LE FRÈRE : le webhook garde volontairement le statut sur un
  // remboursement partiel. 60 € remboursés de 20 € s'écrivaient 60 €.
  const CMD_PARTIELLE = {
    id: 'c1', statut: 'recupere', total: 60, paye_en_ligne: true,
    date_commande: '2026-03-04', created_at: '2026-03-04T09:00:00Z',
    commande_articles: [{ prix_unitaire: 60, quantite: 1, tva_taux: 21 }],
    stripe_frais: 1, stripe_net: 39,
    stripe_refund_amount: 20, stripe_refund_date: '2026-03-06T11:00:00Z',
  }
  const lPartielle = construireLignes({ commandes: [CMD_PARTIELLE], periode: PERIODE })
  verifier('une commande remboursée en partie ne compte que ce qui reste',
    somme(lPartielle, 'total') === 40, `${somme(lPartielle, 'total')}`)
  verifier('et son net rejoint celui de Stripe', somme(lPartielle, 'netStripe') === 39,
    `${somme(lPartielle, 'netStripe')}`)
  verifier('la ventilation par taux suit le montant',
    arrondi(lPartielle.reduce((s, l) => s + (l.parTaux['21'] || 0), 0)) === 40)
  // ⚠️ ET LA CONTREPASSATION NE SE COMPTE PAS COMME UNE RÉFÉRENCE AMBIGUË DE
  // PLUS. Sa référence est celle de la vente, déjà signalée en tête de fichier :
  // la compter deux fois annoncerait plus de transactions douteuses qu'il n'y
  // en a. La mesure se fait ICI, sur une COMMANDE, parce que c'est la seule
  // ligne qui porte ce drapeau : posée sur un rendez-vous, la garde ne pouvait
  // pas rougir.
  verifier('la vente compte pour une référence ambiguë, pas pour deux',
    referencesNonQualifiees(lPartielle) === 1, `${referencesNonQualifiees(lPartielle)}`)
  // ⚠️ L'INVARIANT D'ALEX TIENT LIGNE À LIGNE : CA = en ligne + comptoir + bon
  // + reste à encaisser. Un remboursement qui ne baisserait qu'une colonne
  // casserait le fichier sans que rien ne le dise.
  for (const l of [...lAnnule, ...lPartielle]) {
    verifier(`invariant tenu sur « ${l.type} »`,
      arrondi(l.enLigne + l.comptoir + l.bonCadeau + l.resteAEncaisser) === arrondi(l.total),
      `${l.enLigne} + ${l.comptoir} + ${l.bonCadeau} + ${l.resteAEncaisser} ≠ ${l.total}`)
  }

  // ─── Un bon cadeau rendu, que AUCUNE colonne ne dit ───────────────────────
  //
  // 🔴 `rendreAvantagesRdv` recrédite le bon sans toucher `bon_cadeau_montant` :
  // une coupe de 35 € réglée par bon puis annulée restait 35 € de CA.
  const RDV_BON = {
    id: 'r2', statut: 'annule_client', date_rdv: '2026-03-12',
    acompte_montant: 0, acompte_paye: false, bon_cadeau_montant: 35, tva_taux: 21,
    created_at: '2026-03-01T08:00:00Z',
  }
  const lBon = construireLignes({
    rdvs: [RDV_BON], periode: PERIODE,
    retoursBons: [{ rdv_id: 'r2', montant: 35, source: 'annulation', created_at: '2026-03-13T09:00:00Z' }],
  })
  verifier('un bon rendu efface le chiffre d’affaires qu’il portait',
    somme(lBon, 'total') === 0, `${somme(lBon, 'total')}`)
  verifier('c’est la colonne « bon cadeau » qui baisse', somme(lBon, 'bonCadeau') === 0)
  verifier('et rien ne repart par Stripe, qui n’a rien vu passer',
    somme(lBon, 'enLigne') === 0 && somme(lBon, 'netStripe') === 0)
  verifier('le retour du bon est daté de son mouvement',
    lBon.find(l => l.remboursement)?.date === '2026-03-13')

  // ─── Le no-show : la garantie RESTE, le reste revient ─────────────────────
  //
  // ⚠️ AUCUN CAS PARTICULIER N'A ÉTÉ ÉCRIT POUR LUI. C'est tout l'intérêt de
  // compter ce qui est resté plutôt que d'exclure des statuts : la garantie
  // s'écrit toute seule.
  const lNoShow = construireLignes({
    rdvs: [{ id: 'r3', statut: 'no_show', date_rdv: '2026-03-15', acompte_paye: false,
      bon_cadeau_montant: 50, tva_taux: 21, created_at: '2026-03-02T08:00:00Z' }],
    periode: PERIODE,
    retoursBons: [{ rdv_id: 'r3', montant: 35, source: 'annulation', created_at: '2026-03-15T18:00:00Z' }],
  })
  verifier('le no-show laisse sa garantie au commerçant', somme(lNoShow, 'total') === 15,
    `${somme(lNoShow, 'total')}`)

  // ⚠️ ET LE RETOUR D'UN BON EST PLAFONNÉ LUI AUSSI. Un même bon peut avoir
  // payé le rendez-vous ET les produits du tunnel unique : la ligne du
  // rendez-vous ne doit rendre que ce qu'ELLE portait, la commande porte le
  // reste. Sans plafond, un retour plus gros creuserait un chiffre d'affaires
  // négatif sur une prestation bien rendue.
  const lTropRendu = construireLignes({
    rdvs: [{ ...RDV_BON, id: 'r7', bon_cadeau_montant: 20 }], periode: PERIODE,
    retoursBons: [{ rdv_id: 'r7', montant: 50, source: 'annulation', created_at: '2026-03-13T09:00:00Z' }],
  })
  verifier('un retour de bon plus gros que la ligne ne creuse rien',
    somme(lTropRendu, 'total') === 0 && somme(lTropRendu, 'bonCadeau') === 0,
    `${somme(lTropRendu, 'total')} / ${somme(lTropRendu, 'bonCadeau')}`)

  // ⚠️ ET UN BON RENDU EN DEUX FOIS DONNE DEUX LIGNES, à leurs deux dates :
  // c'est ce que montre le compte du client, et c'est ce que le comptable doit
  // pouvoir rapprocher.
  const lDeuxRetours = construireLignes({
    rdvs: [{ ...RDV_BON, id: 'r8' }], periode: PERIODE,
    retoursBons: [
      { rdv_id: 'r8', montant: 15, source: 'annulation', created_at: '2026-03-14T09:00:00Z' },
      { rdv_id: 'r8', montant: 20, source: 'annulation', created_at: '2026-03-20T09:00:00Z' },
    ],
  })
  verifier('un bon rendu en deux fois donne deux lignes datées',
    lDeuxRetours.filter(l => l.remboursement).map(l => l.date).join(' ') === '2026-03-14 2026-03-20',
    lDeuxRetours.filter(l => l.remboursement).map(l => l.date).join(' '))
  verifier('et leur somme ramène le chiffre d’affaires à zéro', somme(lDeuxRetours, 'total') === 0)

  // ─── Une annulation qui GARDE l'acompte en dédommagement ──────────────────
  const lGarde = construireLignes({
    rdvs: [{ ...RDV_ANNULE, id: 'r4', stripe_refund_amount: null, stripe_refund_date: null, stripe_net: 19.5 }],
    periode: PERIODE,
  })
  verifier('un acompte gardé reste compté, et c’est juste', lGarde.length === 1 && lGarde[0].total === 20)
  verifier('son net n’est pas retouché', lGarde[0].netStripe === 19.5)

  // ─── Le tunnel unique : un refund plus gros que la ligne ──────────────────
  //
  // ⚠️ LE PLAFOND N'EST PAS UNE PRÉCAUTION. Le rendez-vous et sa commande
  // partagent un paiement, et le webhook écrit le même montant sur les deux.
  const lTunnel = construireLignes({
    rdvs: [{ ...RDV_ANNULE, id: 'r5', stripe_refund_amount: 50 }], periode: PERIODE,
  })
  verifier('un remboursement plus gros que la ligne ne creuse pas de trou',
    somme(lTunnel, 'total') === 0, `${somme(lTunnel, 'total')}`)

  // ─── La période : chaque mouvement à son mois ─────────────────────────────
  const RDV_AVRIL = { ...RDV_ANNULE, id: 'r6', stripe_refund_date: '2026-04-02T10:00:00Z' }
  const lMars = construireLignes({ rdvs: [RDV_AVRIL], periode: PERIODE })
  verifier('un remboursement d’avril ne pollue pas l’export de mars',
    lMars.length === 1 && lMars[0].total === 20)
  // ⚠️ AUCUNE LISTE D'EXCLUSION N'EST NÉCESSAIRE : chaque ligne est jugée sur sa
  // propre date d'écriture, donc la vente de mars s'exclut toute seule d'un
  // export d'avril. C'est ce qui a remplacé `venteHorsPeriode` le 03/09.
  const lAvril = construireLignes({
    rdvs: [RDV_AVRIL], periode: { du: '2026-04-01', au: '2026-04-30' },
  })
  verifier('et il sort seul dans l’export d’avril',
    lAvril.length === 1 && lAvril[0].total === -20, JSON.stringify(lAvril.map(l => l.total)))

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 UNE LIGNE EST DATÉE DU JOUR OÙ L'ARGENT A BOUGÉ (03/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Alex, sur son export : SEPT remboursements apparaissaient AVANT la vente
  // qu'ils annulaient. La ligne de rendez-vous était datée du JOUR DU RENDEZ-
  // VOUS, son heure de l'instant du PAIEMENT : les deux moitiés de la même case
  // venaient de deux moments différents. Un rendez-vous du 1er septembre annulé
  // le 30 août montrait donc son remboursement deux jours avant sa vente, et un
  // export d'août affichait -45 € sans la vente correspondante.
  const RDV_PAYE_AVANT = {
    id: 'd1', statut: 'confirme', date_rdv: '2026-03-20',
    acompte_montant: 10, acompte_paye: true, acompte_paye_en_ligne: true,
    acompte_paye_date: '2026-03-02T09:30:00Z', created_at: '2026-03-02T09:29:00Z',
    bon_cadeau_montant: 15, tva_taux: 21,
  }
  const lPaye = construireLignes({ rdvs: [RDV_PAYE_AVANT], periode: PERIODE })
  verifier('l’acompte est daté du jour du paiement, pas du rendez-vous',
    lPaye.find(l => l.type === 'Acompte RDV')?.date === '2026-03-02',
    lPaye.find(l => l.type === 'Acompte RDV')?.date)
  verifier('le bon consommé aussi, il est débité à la réservation',
    lPaye.find(l => l.type === 'Bon cadeau RDV')?.date === '2026-03-02')
  // ⚠️ ET LA DATE ET L'HEURE VIENNENT ENFIN DU MÊME INSTANT. C'était le défaut :
  // une ligne annonçait « le 20 mars à 09h30 » pour un paiement du 2 mars.
  for (const l of lPaye) {
    verifier(`date et heure du même instant sur « ${l.type} »`,
      l.date === '2026-03-02' && l.heure === '10:30', `${l.date} ${l.heure}`)
  }
  // 🔴 LE CAS QUI FAISAIT APPARAÎTRE LE REMBOURSEMENT AVANT LA VENTE.
  const lInverse = construireLignes({
    rdvs: [{ ...RDV_PAYE_AVANT, id: 'd2', statut: 'annule_client',
      stripe_refund_amount: 10, stripe_refund_date: '2026-03-05T11:00:00Z' }],
    periode: PERIODE,
  })
  const datesInverse = lInverse.map(l => l.date)
  verifier('la vente précède son remboursement, jamais l’inverse',
    datesInverse.every((d, i) => i === 0 || d >= datesInverse[i - 1]),
    JSON.stringify(lInverse.map(l => `${l.date} ${l.type}`)))

  // ⚠️ MÊME RÈGLE SUR LES COMMANDES, et c'est le frère : la date venait du
  // CRÉNEAU DE RETRAIT alors que l'heure venait déjà du paiement.
  const lCmdRetrait = construireLignes({
    commandes: [{ id: 'd3', statut: 'recupere', total: 20, paye_en_ligne: true,
      date_commande: '2026-03-25', created_at: '2026-03-11T08:15:00Z',
      commande_articles: [{ prix_unitaire: 20, quantite: 1, tva_taux: 21 }] }],
    periode: PERIODE,
  })
  verifier('une commande payée en ligne est datée de son paiement',
    lCmdRetrait[0]?.date === '2026-03-11', lCmdRetrait[0]?.date)
  const lCmdComptoir = construireLignes({
    commandes: [{ id: 'd4', statut: 'recupere', total: 20, paye_en_ligne: false,
      encaisse_mode: 'especes', encaisse_le: '2026-03-26T16:00:00Z',
      date_commande: '2026-03-25', created_at: '2026-03-11T08:15:00Z',
      commande_articles: [{ prix_unitaire: 20, quantite: 1, tva_taux: 21 }] }],
    periode: PERIODE,
  })
  verifier('et une commande réglée au comptoir, du geste du commerçant',
    lCmdComptoir[0]?.date === '2026-03-26', lCmdComptoir[0]?.date)
  // ⚠️ NI PAYÉE NI ENCAISSÉE : rien n'est entré en caisse, la ligne ne porte que
  // du « reste à encaisser ». Elle garde le jour du retrait prévu plutôt que de
  // disparaître du journal.
  const lCmdDue = construireLignes({
    commandes: [{ id: 'd5', statut: 'pret', total: 20, paye_en_ligne: false,
      date_commande: '2026-03-25', created_at: '2026-03-11T08:15:00Z',
      commande_articles: [{ prix_unitaire: 20, quantite: 1, tva_taux: 21 }] }],
    periode: PERIODE,
  })
  verifier('une commande qui n’a rien encaissé garde le jour du retrait',
    lCmdDue[0]?.date === '2026-03-25' && lCmdDue[0]?.resteAEncaisser === 20,
    lCmdDue[0]?.date)

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LES RÉFÉRENCES NUES DES RENDEZ-VOUS N'ÉTAIENT PAS COMPTÉES (03/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // L'en-tête annonçait « 9 transactions antérieures à la numérotation » sur un
  // export qui en portait 15 : le drapeau ne vivait que sur les commandes.
  const lNues = construireLignes({
    rdvs: [{ ...RDV_PAYE_AVANT, id: 'd6', numero_rdv: 3 }], periode: PERIODE,
  })
  verifier('une référence de rendez-vous sans semaine est signalée',
    referencesNonQualifiees(lNues) === 2, `${referencesNonQualifiees(lNues)}`)
  const lQualifiees = construireLignes({
    rdvs: [{ ...RDV_PAYE_AVANT, id: 'd7', numero_rdv: 3, numero_prefixe: 'RV', numero_semaine: '2026-10' }],
    periode: PERIODE,
  })
  verifier('une référence complète ne l’est pas',
    referencesNonQualifiees(lQualifiees) === 0,
    JSON.stringify(lQualifiees.map(l => l.reference)))
  // ⚠️ LES ABONNEMENTS EN SONT EXCLUS, ET C'EST VOULU : leur série est CONTINUE.
  const lAbo = construireLignes({
    abonnements: [{ id: 'd8', paye: true, prix: 100, paye_le: '2026-03-04T10:00:00Z',
      mode_paiement: 'en_ligne', tva_taux: 21, numero_abonnement: 7, numero_prefixe: 'ABT' }],
    periode: PERIODE,
  })
  verifier('un abonnement n’est jamais signalé comme référence ambiguë',
    referencesNonQualifiees(lAbo) === 0, JSON.stringify(lAbo.map(l => l.reference)))

  // ─── Ce qui n'a produit AUCUNE VENTE ne se contrepasse pas ────────────────
  //
  // ⚠️ Soustraire un remboursement d'un chiffre d'affaires jamais écrit
  // creuserait un trou au lieu d'en combler un.
  //
  // ⚠️ 🔴 MAIS LE FRAIS RETENU, LUI, EXISTE (03/09). Stripe ne restitue jamais
  // ses frais : sur une vente annulée et remboursée, ce coût réel ne figurait
  // dans AUCUN document. Trouvé dans l'export d'Alex par un acompte qui portait
  // 0,07 € de frais, part d'un paiement qui en avait coûté 0,35.
  const lExclue = construireLignes({
    commandes: [{ ...CMD_PARTIELLE, id: 'c2', statut: 'annulee_client_refund', stripe_refund_amount: 60 }],
    periode: PERIODE,
  })
  verifier('une commande annulée n’écrit ni vente ni contrepassation',
    lExclue.length === 1 && lExclue[0].type === 'Frais retenu',
    JSON.stringify(lExclue.map(l => l.type)))
  verifier('mais son frais retenu s’écrit', lExclue[0]?.fraisStripe === 1,
    JSON.stringify(lExclue.map(l => l.fraisStripe)))
  verifier('sans chiffre d’affaires ni ventilation par taux',
    lExclue[0]?.total === 0 && Object.keys(lExclue[0]?.parTaux || {}).length === 0,
    JSON.stringify([lExclue[0]?.total, lExclue[0]?.parTaux]))
  verifier('et son net vaut le frais en négatif', lExclue[0]?.netStripe === -1,
    `${lExclue[0]?.netStripe}`)
  verifier('l’invariant tient sur une ligne à zéro',
    arrondi((lExclue[0]?.enLigne || 0) + (lExclue[0]?.comptoir || 0)
      + (lExclue[0]?.bonCadeau || 0) + (lExclue[0]?.resteAEncaisser || 0)) === lExclue[0]?.total)
  // ⚠️ ET LA LIGNE EST DATÉE DU JOUR DE LA VENTE, pas de celui du remboursement :
  // c'est ce jour-là que Stripe a prélevé son frais, et c'est là que le
  // comptable le retrouve sur son relevé.
  verifier('le frais retenu est daté du jour où Stripe l’a prélevé',
    lExclue[0]?.date === '2026-03-04', `${lExclue[0]?.date}`)

  // ⚠️ 🔴 CETTE GARDE DISAIT LE CONTRAIRE CE MATIN, ET ELLE AVAIT TORT.
  // J'exigeais un remboursement enregistré, et la ligne n'est JAMAIS sortie en
  // production : sept commandes exclues portent un frais Stripe, aucune ne porte
  // `stripe_refund_amount`, que seul le webhook `charge.refunded` écrit et qui
  // ne trouve pas toujours la commande dans le tunnel partagé.
  //
  // ⚠️ LE FRAIS EST LA PREUVE : Stripe ne prélève que sur un paiement RÉUSSI.
  // Une garde qui ne se déclenche jamais est pire qu'une garde absente.
  const lExclueSansRemb = construireLignes({
    commandes: [{ ...CMD_PARTIELLE, id: 'c3', statut: 'annulee', stripe_refund_amount: null }],
    periode: PERIODE,
  })
  verifier('une commande annulée écrit son frais même sans remboursement enregistré',
    lExclueSansRemb.length === 1 && lExclueSansRemb[0].type === 'Frais retenu',
    JSON.stringify(lExclueSansRemb.map(l => l.type)))
  verifier('et ce frais est bien celui de la vente', lExclueSansRemb[0]?.fraisStripe === 1)

  // ⚠️ ET UN FRAIS JAMAIS RELEVÉ NE S'INVENTE PAS DAVANTAGE : `null` veut dire
  // « on ne sait pas », et une ligne à 0,00 affirmerait qu'il n'y en a pas eu.
  const lExclueSansFrais = construireLignes({
    commandes: [{ ...CMD_PARTIELLE, id: 'c4', statut: 'annulee_client_refund', stripe_frais: null }],
    periode: PERIODE,
  })
  verifier('ni une commande annulée dont le frais n’a jamais été relevé',
    lExclueSansFrais.length === 0, JSON.stringify(lExclueSansFrais.map(l => l.type)))

  // ⚠️ UNE LIGNE À ZÉRO QUI PORTE UN FRAIS S'EXPLIQUE, SINON ELLE INTRIGUE.
  const csvFrais = csvDetail({ lignes: lExclue, commercant: { nom: 'Test' }, du: PERIODE.du, au: PERIODE.au })
  verifier('le détail nomme la ligne « Frais retenu »', /;Frais retenu;/.test(csvFrais))
  verifier('et le fichier dit pourquoi elle est à zéro', /Seul ce cout subsiste/.test(csvFrais))

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 LA VENTE D'UN BON CADEAU N'EXISTAIT DANS AUCUN DOCUMENT (03/09)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Trouvée en interrogeant la base, pas au banc : AUCUN contrôle sur un fichier
  // ne révèle une ligne ABSENTE. Quinze bons vendus, encaissés sur le compte
  // Stripe du commerçant, sans une seule écriture comptable.

  // ─── La règle du régime, exécutée ─────────────────────────────────────────
  verifier('un commerce à taux unique émet des bons à usage unique',
    regimeBon({ tauxArticles: [21, 21], tauxPrestations: [21] }).regime === USAGE_UNIQUE)
  verifier('et le taux figé est celui-là',
    regimeBon({ tauxArticles: [21], tauxPrestations: [21] }).taux === 21)
  verifier('un commerce qui mélange les taux émet des bons à usages multiples',
    regimeBon({ tauxArticles: [6, 21] }).regime === USAGE_MULTIPLE)
  verifier('et il ne fige alors aucun taux',
    regimeBon({ tauxArticles: [6, 21] }).taux === null)
  verifier('sans catalogue, le taux du commerce décide',
    regimeBon({ tauxDefaut: 21 }).regime === USAGE_UNIQUE)
  // ⚠️ SANS AUCUN TAUX CONNU, TAXER À LA VENTE EST IMPOSSIBLE : on ne peut pas
  // ventiler, et inventer une valeur est exactement ce qu'on s'interdit.
  verifier('sans aucun taux connu, c’est usages multiples',
    regimeBon({}).regime === USAGE_MULTIPLE)
  verifier('le choix du commerçant passe devant la déduction',
    regimeBon({ tauxArticles: [21], regimeChoisi: USAGE_MULTIPLE }).regime === USAGE_MULTIPLE)
  verifier('mais il ne crée pas un taux qui n’existe pas',
    regimeBon({ regimeChoisi: USAGE_UNIQUE }).regime === USAGE_MULTIPLE)
  // ⚠️ UNE COLONNE VIDE VAUT USAGES MULTIPLES : les bons vendus avant le 03/09
  // n'ont pas de régime, et leur en donner un rétroactivement déplacerait de la
  // TVA déjà déclarée.
  verifier('un bon sans régime écrit vaut usages multiples',
    regimeDuBon({}) === USAGE_MULTIPLE)

  // ─── 🔴 LA CATÉGORIE TRANCHE LE DOUTE (03/09) ────────────────────────────
  //
  // Le catalogue de Kebabistro ne portait QUE du 6 %, donc la déduction le
  // classait « usage unique ». Une friterie vend des boissons : le 21 %
  // arrivera, et le régime, lui, est FIGÉ POUR TOUJOURS sur les bons vendus.
  // Un catalogue à un seul taux n'est pas un commerce à un seul taux.
  verifier('un commerce alimentaire reste en usages multiples malgré un taux unique',
    regimeBon({ tauxArticles: [6], categorie: 'alimentaire' }).regime === USAGE_MULTIPLE)
  verifier('et il ne fige alors aucun taux',
    regimeBon({ tauxArticles: [6], categorie: 'alimentaire' }).taux === null)
  verifier('un salon à taux unique bascule bien, lui',
    regimeBon({ tauxArticles: [21], categorie: 'service' }).regime === USAGE_UNIQUE)
  verifier('une boutique de détail aussi',
    regimeBon({ tauxArticles: [21], categorie: 'detail' }).regime === USAGE_UNIQUE)
  // ⚠️ MAIS LE CHOIX EXPLICITE DU COMMERÇANT RESTE AU-DESSUS DE TOUT : lui seul
  // connaît son commerce, et la catégorie n'est qu'un garde-fou par défaut.
  verifier('le commerçant peut réclamer l’usage unique malgré sa catégorie',
    regimeBon({ tauxArticles: [6], categorie: 'alimentaire', regimeChoisi: USAGE_UNIQUE }).regime === USAGE_UNIQUE)

  // ⚠️ ET LA RÈGLE NE VAUT QUE SI LA MATIÈRE LUI PARVIENT. Le lecteur qui
  // alimente `regimeBon` vit côté serveur : une catégorie oubliée là rendrait
  // tout le bloc ci-dessus vert pour rien, et c'est exactement le motif du
  // 02/09, où la correction était juste et le `select` incomplet.
  const srcBonsServer = readFileSync(new URL('../lib/bons-cadeaux-server.js', import.meta.url), 'utf8')
  verifier('le lecteur serveur transmet la catégorie à la règle',
    /regimeBon\(\{[^}]*categorie:\s*commercant\.categorie/s.test(srcBonsServer))
  verifier('et il lit la vraie table des prestations',
    /from\('rdv_prestations'\)/.test(srcBonsServer))

  // ⚠️ `created_at` EST DANS LA PÉRIODE VOLONTAIREMENT : c'est ce qui permet de
  // mesurer qu'un bon sans date de PAIEMENT ne se voit pas inventer un jour à
  // partir d'une autre colonne. Sans lui, un repli sur la création passerait
  // inaperçu.
  const BON_UM = { id: 'b1', statut: 'actif', montant_initial: 100,
    paye_le: '2026-03-05T10:00:00Z', created_at: '2026-03-04T08:00:00Z',
    stripe_frais: 2, stripe_net: 98,
    tva_regime: USAGE_MULTIPLE, acheteur_prenom: 'Camille', code: 'SECRET42' }
  const BON_UU = { ...BON_UM, id: 'b2', tva_regime: USAGE_UNIQUE, tva_taux: 21, code: 'SECRET99' }

  // ─── La vente, sous usages multiples : un encaissement SANS chiffre d'affaires
  const lVenteUM = construireLignes({ bons: [BON_UM], periode: PERIODE })
  verifier('la vente d’un bon produit enfin une ligne', lVenteUM.length === 1,
    JSON.stringify(lVenteUM.map(l => l.type)))
  verifier('et elle est datée du jour du paiement', lVenteUM[0]?.date === '2026-03-05',
    `${lVenteUM[0]?.date}`)
  verifier('sous usages multiples elle ne porte AUCUN chiffre d’affaires',
    lVenteUM[0]?.total === 0, `${lVenteUM[0]?.total}`)
  verifier('ni la moindre TVA', Object.keys(lVenteUM[0]?.parTaux || {}).length === 0)
  verifier('mais l’argent encaissé y figure', lVenteUM[0]?.enLigne === 100)
  verifier('dans sa propre colonne', lVenteUM[0]?.venteBon === 100)
  verifier('et le frais Stripe de la vente aussi',
    lVenteUM[0]?.fraisStripe === 2 && lVenteUM[0]?.netStripe === 98)

  // ⚠️ L'INVARIANT GAGNE UN TERME, et il doit tenir sur CHAQUE ligne.
  //
  // ⚠️ ET IL NE PLANTE PAS SUR UNE LIGNE ABSENTE. Une mutation qui supprime la
  // boucle des ventes vide le tableau : sans ces `?.`, le banc lèverait une
  // exception au lieu de rougir, et une mutation qui fait PLANTER un banc est
  // comptée MANQUÉE. Une mutation change le RÉSULTAT, jamais la TERMINAISON.
  const invariantBon = (l) => !!l && arrondi((l?.total || 0) + (Number(l?.venteBon) || 0))
    === arrondi((l?.enLigne || 0) + (l?.comptoir || 0) + (l?.bonCadeau || 0) + (Number(l?.resteAEncaisser) || 0))
  verifier('l’invariant étendu tient sur la vente d’un bon', invariantBon(lVenteUM[0]))

  // ─── La vente, sous usage unique : c'est ELLE qui porte la TVA ────────────
  const lVenteUU = construireLignes({ bons: [BON_UU], periode: PERIODE })
  verifier('sous usage unique la vente porte le chiffre d’affaires',
    lVenteUU[0]?.total === 100, `${lVenteUU[0]?.total}`)
  verifier('et sa TVA, au taux figé', lVenteUU[0]?.parTaux?.[21] === 100,
    JSON.stringify(lVenteUU[0]?.parTaux))
  verifier('la colonne « vente de bons » reste alors vide', lVenteUU[0]?.venteBon === 0)
  verifier('et l’invariant d’origine suffit', invariantBon(lVenteUU[0]))

  // ─── Ce qui ne s'écrit pas ───────────────────────────────────────────────
  verifier('un bon non payé n’écrit rien',
    construireLignes({ bons: [{ ...BON_UM, statut: 'paiement_en_attente' }], periode: PERIODE }).length === 0)
  // ⚠️ LES BONS D'AVANT LE 03/09 N'ONT PAS DE DATE : le cron ira la chercher
  // dans la session Stripe. On ne les rattache pas à un jour inventé.
  verifier('un bon sans date de paiement n’écrit rien',
    construireLignes({ bons: [{ ...BON_UM, paye_le: null }], periode: PERIODE }).length === 0)
  verifier('un bon vendu hors période s’exclut tout seul',
    construireLignes({ bons: [{ ...BON_UM, paye_le: '2026-05-05T10:00:00Z' }], periode: PERIODE }).length === 0)

  // ─── 🔴 SÉCURITÉ : LE CODE D'UN BON NE SORT JAMAIS DU SERVEUR ────────────
  //
  // Ce fichier quitte l'application. Un code encore chargé qui s'y trouverait
  // permettrait à quiconque l'ouvre de le dépenser.
  const csvBonD = csvDetail({ lignes: lVenteUM, commercant: { nom: 'Test' }, du: PERIODE.du, au: PERIODE.au })
  verifier('🔴 le code du bon ne figure PAS dans le fichier', !/SECRET42/.test(csvBonD))
  verifier('la référence identifie pourtant la vente', /BONb1/.test(csvBonD))
  verifier('le détail porte la colonne « Vente de bons »', /;Vente de bons;/.test(csvBonD))
  verifier('et le fichier explique que l’égalité gagne un terme',
    /CA TTC \+ Vente de bons/.test(csvBonD))
  const csvBonJ = csvJournal({ lignes: lVenteUM, commercant: { nom: 'Test' }, du: PERIODE.du, au: PERIODE.au })
  verifier('le journal aussi porte la colonne', /;Vente de bons;/.test(csvBonJ))
  const jourBon = journalParJour(lVenteUM)
  verifier('le journal du jour agrège la vente de bons', jourBon[0]?.venteBon === 100,
    `${jourBon[0]?.venteBon}`)

  // ─── L'UTILISATION D'UN BON DÉJÀ TAXÉ NE SE TAXE PAS DEUX FOIS ───────────
  //
  // ⚠️ C'EST TOUTE LA RAISON DU RÉGIME. Laisser la TVA aux DEUX bouts la
  // déclarerait deux fois.
  const RDV_BON_UU = { id: 'r9', statut: 'honore', bon_cadeau_montant: 40, tva_taux: 21,
    acompte_paye: false, acompte_montant: 0, date_rdv: '2026-03-10',
    created_at: '2026-03-08T09:00:00Z', acompte_paye_date: '2026-03-08T09:00:00Z',
    bons_utilises: [{ id: 'b2', montant: 40 }] }
  const lRdvUU = construireLignes({ rdvs: [RDV_BON_UU], bons: [BON_UU], periode: PERIODE })
  // ⚠️ LA LIGNE RESTE ÉCRITE, même vide : un rendez-vous entièrement réglé par
  // un bon qui disparaît du journal est le défaut corrigé le 29/08.
  // ⚠️ LA VENTE DU BON SORT AUSSI DANS CE JEU : on vise la ligne du
  // rendez-vous, jamais la première venue.
  const ligneRdvUU = lRdvUU.find(l => l.type === 'Bon cadeau RDV')
  verifier('un rendez-vous payé par un bon déjà taxé garde sa ligne',
    !!ligneRdvUU, JSON.stringify(lRdvUU.map(l => l.type)))
  verifier('mais elle ne porte plus de chiffre d’affaires', ligneRdvUU?.total === 0,
    `${ligneRdvUU?.total}`)
  verifier('ni de TVA', Object.keys(ligneRdvUU?.parTaux || {}).length === 0)
  verifier('ni de règlement par bon', ligneRdvUU?.bonCadeau === 0)
  verifier('et l’invariant tient encore', invariantBon(ligneRdvUU))

  // ⚠️ 🔴 UNE LIGNE À ZÉRO SANS EXPLICATION N'EST PAS UNE INFORMATION. Sur
  // l'export réel d'Alex, DIX lignes « Bon cadeau RDV » étaient entièrement
  // vides et rien ne disait pourquoi : un comptable y cherche l'erreur.
  const csvUU = csvDetail({ lignes: lRdvUU, commercant: { nom: 'Test' }, du: PERIODE.du, au: PERIODE.au })
  verifier('le fichier explique ses lignes à zéro', /USAGE UNIQUE/.test(csvUU))
  // ⚠️ ET IL LE DIT LIGNE PAR LIGNE, pas seulement en tête : un commerce peut
  // avoir des bons des DEUX régimes en circulation, le régime étant figé à la
  // vente de chaque bon. Devant une ligne précise, le comptable devait deviner.
  verifier('le détail porte la colonne « Regime du bon »', /;Regime du bon;/.test(csvUU))
  verifier('et la ligne d’un bon déjà taxé est marquée UU', /;UU;/.test(csvUU))
  // ⚠️ 🔴 ET JAMAIS LE CODE DU BON, contrairement à ce qui a été suggéré : deux
  // lettres suffisent, un code encore chargé serait dépensable.
  verifier('🔴 la colonne ne porte pas le code du bon', !/SECRET/.test(csvUU))
  verifier('un règlement à deux régimes se marque UU+UM',
    libelleRegimeBon(10, 20) === 'UU+UM')
  verifier('et une ligne sans bon ne porte aucun régime',
    libelleRegimeBon(0, 0) === '')
  verifier('et dit que les recompter doublerait la TVA', /deux fois/.test(csvUU))
  verifier('la ligne porte la part déjà taxée', ligneRdvUU?.bonDejaTaxe === 40,
    `${ligneRdvUU?.bonDejaTaxe}`)

  // Le même rendez-vous, payé par un bon à usages multiples : rien ne change.
  const lRdvUM = construireLignes({
    rdvs: [{ ...RDV_BON_UU, bons_utilises: [{ id: 'b1', montant: 40 }] }],
    bons: [BON_UM], periode: PERIODE })
  const ligneRdvUM = lRdvUM.find(l => l.type === 'Bon cadeau RDV')
  verifier('un bon à usages multiples se taxe bien à l’utilisation',
    ligneRdvUM?.total === 40 && ligneRdvUM?.parTaux?.[21] === 40,
    JSON.stringify([ligneRdvUM?.total, ligneRdvUM?.parTaux]))
  // ⚠️ ET L'AVERTISSEMENT SE TAIT QUAND IL N'Y A RIEN À DIRE : une phrase qui
  // s'affiche toujours ne se lit plus.
  const csvUM = csvDetail({ lignes: lRdvUM, commercant: { nom: 'Test' }, du: PERIODE.du, au: PERIODE.au })
  verifier('et le fichier se tait quand aucune ligne n’est concernée',
    !/USAGE UNIQUE/.test(csvUM))
  verifier('la ligne d’un bon taxé à l’utilisation est marquée UM', /;UM;/.test(csvUM))

  // ─── ET UNE COMMANDE PEUT MÉLANGER LES DEUX RÉGIMES ──────────────────────
  const CMD_MIXTE = {
    id: 'cm', statut: 'recupere', total: 100, paye_en_ligne: true,
    date_commande: '2026-03-12', created_at: '2026-03-12T09:00:00Z',
    commande_articles: [{ prix_unitaire: 100, quantite: 1, tva_taux: 21 }],
    bon_cadeau_montant: 70,
    bons_utilises: [{ id: 'b2', montant: 40 }, { id: 'b1', montant: 30 }],
  }
  const lMixte = construireLignes({ commandes: [CMD_MIXTE], bons: [BON_UU, BON_UM], periode: PERIODE })
  const lCmdMix = lMixte.find(l => l.type === 'Commande')
  verifier('la part déjà taxée sort du chiffre d’affaires de la commande',
    lCmdMix?.total === 60, `${lCmdMix?.total}`)
  verifier('et sort aussi de la colonne « payé par bon »', lCmdMix?.bonCadeau === 30,
    `${lCmdMix?.bonCadeau}`)
  verifier('la ventilation suit le chiffre d’affaires réel', lCmdMix?.parTaux?.[21] === 60,
    JSON.stringify(lCmdMix?.parTaux))
  verifier('l’invariant tient sur une commande à deux régimes', invariantBon(lCmdMix))

  // ⚠️ ON NE DÉDUIT JAMAIS PLUS QUE CE QUE LA LIGNE PORTE : `bons_utilises` est
  // un historique, la colonne de montant est ce qui a payé CETTE vente.
  verifier('la part déjà taxée est plafonnée au montant de la ligne',
    partDejaTaxee({ bons_utilises: [{ id: 'b2', montant: 999 }] },
      regimesParBon([BON_UU]), 40) === 40)
  verifier('un bon inconnu ne compte pas comme déjà taxé',
    partDejaTaxee({ bons_utilises: [{ id: 'inconnu', montant: 10 }] },
      regimesParBon([BON_UU]), 40) === 0)

  // ⚠️ UNE COLONNE ABSENTE D'UN SELECT EST LE DÉFAUT LE PLUS FRÉQUENT D'ICI, et
  // il est SILENCIEUX : sans elles, tout ce bloc reste vert et la vente des bons
  // redevient invisible.
  const srcRouteBons = readFileSync(new URL('../app/api/dashboard/export-comptable/route.js', import.meta.url), 'utf8')
  for (const col of ['tva_regime', 'paye_le', 'montant_initial', 'stripe_frais']) {
    verifier(`la route lit ${col} sur les bons`,
      new RegExp(`\\b${col}\\b`).test(colonnesDe(srcRouteBons, 'bons_cadeaux')))
  }
  verifier('🔴 la route ne lit JAMAIS le code du bon',
    !/(^|,\s*)code(\s*,|$)/.test(colonnesDe(srcRouteBons, 'bons_cadeaux')),
    colonnesDe(srcRouteBons, 'bons_cadeaux'))
  for (const table of ['commandes', 'rdv_reservations']) {
    verifier(`la route lit bons_utilises sur ${table}`,
      /\bbons_utilises\b/.test(colonnesDe(srcRouteBons, table)))
  }
  // ⚠️ ET LIRE NE SUFFIT PAS : IL FAUT TRANSMETTRE. Une route qui charge les
  // bons sans les passer au calcul laisse tout ce bloc vert et la vente des
  // bons invisible. C'est le maillon exact qui avait manqué le 02/09 sur
  // `stripe_refund_amount`.
  verifier('la route transmet les bons au calcul',
    /construireLignes\(\{[^)]*\bbons:\s*bons\s*\|\|\s*\[\]/.test(srcRouteBons))


  // ─── Le journal du jour et le fichier ─────────────────────────────────────
  const jours = journalParJour(lAnnule)
  verifier('le remboursement fait son propre jour', jours.length === 2)
  verifier('et ce jour est négatif', jours[1]?.total === -20 && jours[1]?.enLigne === -20,
    JSON.stringify(jours.map(j => j.total)))
  const csv = csvJournal({ lignes: lAnnule, commercant: { nom: 'Test' }, du: PERIODE.du, au: PERIODE.au })
  verifier('le fichier explique ses montants négatifs', /remboursement/i.test(csv))
  verifier('et dit que le frais reste sur la ligne de vente', /ne restituant pas ses frais/.test(csv))
  const detail = csvDetail({ lignes: lAnnule, commercant: { nom: 'Test' }, du: PERIODE.du, au: PERIODE.au })
  verifier('le détail nomme la ligne « Remboursement »', /;Remboursement;/.test(detail))
  verifier('et l’écrit en négatif', /-20,00/.test(detail))

  // ─── La route charge ce qu'il faut, une seule fois ────────────────────────
  //
  // ⚠️ UNE COLONNE ABSENTE D'UN SELECT EST LE DÉFAUT LE PLUS FRÉQUENT D'ICI, et
  // il est SILENCIEUX : sans ces deux-là, tout ce bloc reste vert et le journal
  // recommence à compter l'argent reparti.
  const srcRoute = readFileSync(new URL('../app/api/dashboard/export-comptable/route.js', import.meta.url), 'utf8')
  for (const col of ['stripe_refund_amount', 'stripe_refund_date']) {
    verifier(`la route lit ${col} sur les commandes`,
      new RegExp(`\\b${col}\\b`).test(colonnesDe(srcRoute, 'commandes')))
    verifier(`la route lit ${col} sur les rendez-vous`,
      new RegExp(`\\b${col}\\b`).test(colonnesDe(srcRoute, 'rdv_reservations')))
  }
  // ⚠️ ET UNE SEULE LISTE DE COLONNES PAR TABLE : ces `select` servent DEUX
  // requêtes chacun (les mouvements de la période, puis les ventes visées par
  // un bon rendu dont aucune date ne tombe dedans). Deux listes écrites à la
  // main auraient divergé à la première colonne ajoutée, en silence.
  for (const table of ['commandes', 'rdv_reservations']) {
    const lus = selectsDe(srcRoute, table)
    verifier(`les lectures de ${table} partagent la même liste de colonnes`,
      lus.length === 2 && lus.every(s => s.constante && s.litteral === null),
      JSON.stringify(lus))
  }
  // 🔴 LA ROUTE CHARGE SUR TOUTES LES DATES OÙ DE L'ARGENT A PU BOUGER. Une
  // seule colonne laisserait des mouvements dehors, maintenant que chaque ligne
  // est datée du jour de l'encaissement et plus du créneau ni du rendez-vous.
  for (const col of ['created_at', 'encaisse_le', 'stripe_refund_date', 'acompte_paye_date']) {
    verifier(`la route charge aussi sur ${col}`,
      new RegExp(`instant\\('${col}'\\)`).test(srcRoute))
  }
  verifier('et garde un filet sur les colonnes de date nue',
    /jour\('date_commande'\)/.test(srcRoute) && /jour\('date_rdv'\)/.test(srcRoute))
  verifier('et les bons rendus, que nulle colonne ne porte',
    /bons_cadeaux_mouvements/.test(srcRoute) && /eq\('source', 'annulation'\)/.test(srcRoute))
  // 🔴 LA BORNE DE SÉCURITÉ EST LA JOINTURE : la table des mouvements ne porte
  // pas de `commercant_id`. Sans `!inner` sur `bons_cadeaux`, cette lecture
  // remonterait les mouvements de TOUS les commerces.
  verifier('les mouvements sont bornés au commerce EN BASE, pas après coup',
    /bons_cadeaux!inner\(commercant_id\)/.test(srcRoute) &&
    /eq\('bons_cadeaux\.commercant_id', commercantId\)/.test(srcRoute))
  // ⚠️ ANCRÉE SUR L'APPEL, ET LA MESURE L'A EXIGÉ : `periode: { du, au }` existe
  // AUSSI dans la réponse JSON de la route. Une garde qui cherchait le motif
  // n'importe où restait verte quand `construireLignes` ne le recevait plus.
  // Le même piège que pour les ancres de mutation, du côté de la garde.
  verifier('la période est transmise au constructeur de lignes',
    /construireLignes\(\{[^)]*periode: \{ du, au \}/.test(srcRoute))
  verifier('comme les bons rendus', /construireLignes\(\{[^)]*retoursBons:/.test(srcRoute))
  // ⚠️ ET PLUS AUCUNE LISTE D'EXCLUSION : chaque ligne est jugée sur sa propre
  // date. Deux façons de répondre à la même question finissent toujours par
  // diverger, c'est le motif qui a produit le plus de défauts sur ce projet.
  verifier('aucune liste de ventes à exclure ne subsiste',
    !/venteHorsPeriode/.test(srcRoute))

  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LES FRAIS STRIPE COMPTÉS DEUX FOIS SUR UN PAIEMENT PARTAGÉ (03/09)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Vu par Alex sur son export : une commande de 19,71 € portait un « net » de
  // 28,11 €, parce qu'il contenait l'acompte du rendez-vous, déjà compté sur sa
  // propre ligne. Frais écrits 0,46 puis 0,47 pour 0,35 réellement prélevés.
  //
  // Cause : quand Stripe n'a pas encore constitué sa transaction de solde, le
  // rendez-vous n'écrit rien et passe une part NULLE à la commande, qui relance
  // la lecture et obtient cette fois le total du paiement. Le cron nocturne
  // ventile ensuite le rendez-vous, mais ne retouche plus la commande.
  const srcWebhook = readFileSync(new URL('../app/api/stripe/webhook/route.js', import.meta.url), 'utf8')
  verifier('le tunnel passe de quoi ventiler seul si la part manque',
    /partageAvec: \{ acompte: montantAcompte, produits: montantProduits \}/.test(srcWebhook))
  verifier('et la commande ventile plutôt que d’écrire le total du paiement',
    /ventilerFrais\(total\.frais, partageAvec\.acompte, partageAvec\.produits\)/.test(srcWebhook))

  // ⚠️ ET LA VENTILATION ELLE-MÊME, EXÉCUTÉE : la somme des deux parts doit
  // rendre EXACTEMENT les frais réels, sans centime perdu par un double
  // arrondi, sinon le journal ne se recoupe plus avec le relevé Stripe.
  const { ventilerFrais } = await import('../lib/stripe-frais.js')
  // ⚠️ LE DERNIER CAS EST CELUI QUI COMPTE, ET LA MESURE PAR MUTATION L'A
  // EXIGÉ : sur 0,03 € partagés en deux parts égales, les DEUX prorata
  // s'arrondissent à 0,02 et leur somme vaudrait 0,04. C'est précisément pour
  // ça que la deuxième part est le RESTE, jamais un second prorata. Sans ce
  // jeu-là, la garde ne pouvait pas rougir.
  for (const [total, acompte, produits] of [[0.35, 8.75, 19.71], [0.35, 12, 21.90], [1.83, 10, 90], [0.31, 0.01, 99.99], [0.03, 1, 1]]) {
    const p = ventilerFrais(total, acompte, produits)
    verifier(`les deux parts de ${total} redonnent le frais réel`,
      arrondi(p.rdv.frais + p.commande.frais) === total,
      `${p.rdv.frais} + ${p.commande.frais}`)
    verifier(`et chaque net vaut son montant moins sa part (${total})`,
      arrondi(p.rdv.net) === arrondi(acompte - p.rdv.frais)
      && arrondi(p.commande.net) === arrondi(produits - p.commande.frais))
  }
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Argent et légal verts.')
