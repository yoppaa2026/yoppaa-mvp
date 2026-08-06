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

import { readFileSync } from 'node:fs'
import { ventiler, tauxFraisLivraison, cleTaux, libelleTaux, tauxPourArticle, TAUX_NON_RENSEIGNE, REGIME_EMPORTER } from '../lib/tva.js'
import { construireLignes, journalParJour, tauxRencontres, estComptabilisable, csvJournal } from '../lib/export-comptable.js'
import { calculerRemiseBon, normaliserCodeBon, genererCodeBon, bonExpire, BON_MONTANT_MIN, BON_MONTANT_MAX } from '../lib/bons-cadeaux.js'
import { brusselsInstant } from '../lib/timezone.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

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
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Argent et légal verts.')
