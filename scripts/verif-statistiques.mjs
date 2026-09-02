// Banc des STATISTIQUES du tableau de bord.
//
// Un chiffre faux est pire que pas de chiffre. Un commerçant qui voit un
// chiffre d'affaires gonflé se croit plus riche qu'il ne l'est, et il le
// découvre chez son comptable. Ce banc vérifie donc surtout ce qu'on N'INCLUT
// PAS : les commandes annulées, celles que personne n'est venu chercher, le
// solde d'un rendez-vous réglé au comptoir.
//
// Il verrouille aussi deux décisions produit qui ne se déduisent d'aucun
// calcul : l'évolution se tait sous cinq unités, et la note moyenne sous
// trois avis.

import { readFileSync } from 'node:fs'
import {
  fenetres, commandeEncaissee, chiffreAffaires, panierMoyen, evolution,
  topArticles, nonRecuperees, tauxAnnulation, noteMoyenne, performanceDeals,
  messageVide, arrondi, SEUIL_EVOLUTION, MIN_AVIS_POUR_NOTE, STATUTS_COMMANDE,
  valeurRdv, acompteRdv, rdvHonore, topPrestations, serieJournaliere,
  momentsDePointe, MIN_POUR_POINTE, JOURS_SEMAINE,
} from '../lib/statistiques.js'
import { partiesBruxelles } from '../lib/timezone.js'

const lireBrut = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES FENÊTRES — comparer à la période qui précède, pas à l'an dernier
// ═══════════════════════════════════════════════════════════════════════════
const t0 = new Date('2026-08-09T12:00:00Z')
const f = fenetres(30, t0)
egal('la fenêtre fait bien 30 jours',
  Math.round((f.fin - f.debut) / (24 * 3600 * 1000)), 30)
egal('la période précédente a la même durée',
  Math.round((f.debut - f.debutPrecedent) / (24 * 3600 * 1000)), 30)
verifier('les deux fenêtres se touchent sans se chevaucher', f.debutPrecedent < f.debut && f.debut <= f.fin)

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE CHIFFRE D'AFFAIRES — ce qu'on compte, et surtout ce qu'on ne compte pas
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE TEST LE PLUS IMPORTANT DE CE FICHIER, et il est né d'une erreur.
//
// Les statuts avaient d'abord été écrits de mémoire : « payee », « recuperee »,
// « livree », « expediee ». Aucune de ces valeurs n'existe. Le banc était
// pourtant VERT, parce qu'il testait exactement les mêmes valeurs inventées que
// le code. Un test qui partage les fantasmes du code ne prouve rien.
//
// On confronte donc la liste à sa SOURCE : la contrainte CHECK de la base.
const migrationStatuts = lireBrut('migrations/MIGRATION_COMMANDES_STATUT_CHECK.sql')
const blocCheck = migrationStatuts.slice(migrationStatuts.indexOf('CHECK (statut IN ('))
const statutsEnBase = [...blocCheck.matchAll(/'([a-z_]+)'/g)].map(m => m[1])
verifier('la contrainte de base est lisible', statutsEnBase.length === 8, `${statutsEnBase.length} trouvés`)
for (const s of STATUTS_COMMANDE) {
  verifier(`« ${s} » existe vraiment en base`, statutsEnBase.includes(s))
}
for (const s of statutsEnBase) {
  verifier(`« ${s} » est connu du module`, STATUTS_COMMANDE.includes(s))
}

verifier('une commande payée et en attente de prise en charge compte', commandeEncaissee({ statut: 'en_attente' }))
verifier('une commande en préparation compte', commandeEncaissee({ statut: 'en_preparation' }))
verifier('une commande prête compte', commandeEncaissee({ statut: 'pret' }))
verifier('une commande récupérée compte', commandeEncaissee({ statut: 'recupere' }))
verifier('une commande annulée avec remboursement ne compte pas', !commandeEncaissee({ statut: 'annulee_client_refund' }))
verifier('un paiement échoué ne compte pas', !commandeEncaissee({ statut: 'annulee_paiement_ko' }))
// C'EST LE PIÈGE : la commande a été payée, mais la marchandise est restée sur
// l'étagère. La compter ferait croire à un chiffre d'affaires qu'on n'a pas.
verifier('une commande NON RETIRÉE ne compte pas', !commandeEncaissee({ statut: 'non_retire' }))
verifier('une commande jamais payée ne compte pas', !commandeEncaissee({ statut: 'paiement_en_attente' }))
verifier('un statut inconnu ne compte pas', !commandeEncaissee({ statut: 'zzz' }))
verifier('une commande sans statut ne compte pas', !commandeEncaissee({}))

// ⚠️ `paye_en_ligne` FIGURE DANS CES JEUX D'ESSAI DEPUIS LE 02/09, et il ne
// s'agit pas d'un détail : sans lui, ces commandes décrivaient un état qui
// n'existe pas en base, et le banc validait « encaissé en ligne » sur des
// commandes dont personne ne savait comment elles avaient été payées. Un jeu
// d'essai qui ne ressemble pas à la base valide un monde imaginaire.
const commandes = [
  { total: 24.50, statut: 'recupere', paye_en_ligne: true },
  { total: 10.00, statut: 'en_attente', paye_en_ligne: true },
  { total: 99.00, statut: 'annulee_client_refund', paye_en_ligne: true },  // exclue
  { total: 50.00, statut: 'non_retire', paye_en_ligne: true },             // exclue
]
egal('le chiffre d\'affaires ignore annulé et non retiré', chiffreAffaires(commandes, []).total, 34.50)

// ⚠️ DÉCISION D'ALEX, 09/08 : un rendez-vous compte pour son PRIX COMPLET.
// La version précédente ne comptait que l'acompte encaissé en ligne, et le
// commerçant en concluait que ses rendez-vous n'étaient pas comptés du tout.
//
// LE TEST QUI ATTRAPE LA RÉGRESSION : une coupe à 35 € avec 8,75 € d'acompte.
// Si quelqu'un revient à l'acompte, `prestations` tombe à 8,75 et ce test rougit.
egal('un RDV vaut son prix complet', valeurRdv({ prix_estime: 35, acompte_montant: 8.75 }), 35)
egal('sans prix estimé, on se rabat sur l\'acompte', valeurRdv({ acompte_montant: 8.75 }), 8.75)
egal('un RDV sans rien vaut zéro', valeurRdv({}), 0)
egal('l\'acompte reste lisible à part', acompteRdv({ prix_estime: 35, acompte_montant: 8.75 }), 8.75)
verifier('un RDV confirmé compte', rdvHonore({ statut: 'confirme' }))
verifier('un RDV honoré compte', rdvHonore({ statut: 'honore' }))
verifier('un no-show ne compte pas', !rdvHonore({ statut: 'no_show' }))
verifier('un RDV annulé par le client ne compte pas', !rdvHonore({ statut: 'annule_client' }))
verifier('un RDV annulé par le commerçant ne compte pas', !rdvHonore({ statut: 'annule_commercant' }))
verifier('un RDV reporté ne compte pas', !rdvHonore({ statut: 'reporte' }))

const rdvs = [
  { statut: 'confirme', prix_estime: 35, acompte_montant: 8.75, acompte_paye_en_ligne: true },
  { statut: 'confirme', prix_estime: 20, acompte_montant: 0 },   // réglé entièrement au comptoir
  { statut: 'annule_client', prix_estime: 90, acompte_montant: 20, acompte_paye_en_ligne: true },  // exclu
  { statut: 'no_show', prix_estime: 90, acompte_montant: 20, acompte_paye_en_ligne: true },        // exclu
]
const caRdv = chiffreAffaires([], rdvs)
egal('les prestations comptent à leur prix complet', caRdv.prestations, 55)
egal('l\'encaissé en ligne ne retient que les acomptes', caRdv.encaisse_en_ligne, 8.75)
egal('le reste est annoncé comme réglé au comptoir', caRdv.au_comptoir, 46.25)
egal('le nombre de RDV suit les mêmes exclusions', caRdv.nb_rdv, 2)

const caTout = chiffreAffaires(commandes, rdvs)
egal('produits et prestations s\'additionnent', caTout.total, 89.50)
egal('la part produits reste lisible', caTout.produits, 34.50)
// La clé de rapprochement avec la Comptabilité : produits encaissés + acomptes.
egal('l\'encaissé en ligne mélange produits et acomptes', caTout.encaisse_en_ligne, 43.25)
verifier('le total est bien la somme des deux parts',
  arrondi(caTout.produits + caTout.prestations) === caTout.total)
egal('rien du tout', chiffreAffaires([], []).total, 0)
egal('appel sans argument', chiffreAffaires().total, 0)

// Panier moyen : sur les seules commandes encaissées, sinon il s'effondre à
// cause des annulations.
egal('panier moyen', panierMoyen(commandes), 17.25)
egal('panier moyen sans vente', panierMoyen([{ statut: 'annulee', total: 50 }]), 0)
egal('centimes justes', arrondi(10 / 3), 3.33)

// ═══════════════════════════════════════════════════════════════════════════
// 3. L'ÉVOLUTION — elle se tait plutôt que de mentir
// ═══════════════════════════════════════════════════════════════════════════
// Passer de 1 à 3 commandes n'est pas « +200 % », c'est deux commandes de plus.
egal('trop peu de données : pas d\'évolution', evolution(3, 1), null)
egal('juste sous le seuil : silence', evolution(10, SEUIL_EVOLUTION - 1), null)
egal('au seuil : on parle', evolution(10, 5), { pct: 100, sens: 'hausse' })
egal('une baisse se dit', evolution(50, 100), { pct: -50, sens: 'baisse' })
egal('stable', evolution(100, 100), { pct: 0, sens: 'stable' })
// Un démarrage depuis zéro ne produit pas une division par zéro.
egal('depuis zéro : pas de pourcentage', evolution(42, 0), null)
egal('vers zéro depuis une base solide', evolution(0, 20), { pct: -100, sens: 'baisse' })

// ═══════════════════════════════════════════════════════════════════════════
// 4. CE QUI SE VEND
// ═══════════════════════════════════════════════════════════════════════════
const lignes = [
  { nom: 'Pain au levain', quantite: 3, prix_unitaire: 3.20 },
  { nom: 'Pain au levain', quantite: 2, prix_unitaire: 3.20 },
  { nom: 'Croissant', quantite: 10, prix_unitaire: 1.10 },
  { nom: '', quantite: 5, prix_unitaire: 2 },   // ligne sans nom : ignorée
]
const top = topArticles(lignes)
egal('le plus vendu en tête', top[0].nom, 'Croissant')
egal('les quantités du même article s\'additionnent', top[1].quantite, 5)
egal('le montant suit', top[1].montant, 16)
egal('une ligne sans nom est ignorée', top.length, 2)
egal('liste vide', topArticles([]), [])
verifier('la liste est bornée', topArticles(
  Array.from({ length: 20 }, (_, i) => ({ nom: `A${i}`, quantite: i + 1, prix_unitaire: 1 })), 5
).length === 5)

// ═══════════════════════════════════════════════════════════════════════════
// 5. CE QUI FÂCHE — le chiffre qu'on serait tenté de cacher
// ═══════════════════════════════════════════════════════════════════════════
const perdues = nonRecuperees(commandes)
egal('une commande non retirée est comptée', perdues.nombre, 1)
egal('avec son montant', perdues.montant, 50)
egal('aucune perte', nonRecuperees([{ statut: 'recuperee', total: 10 }]).nombre, 0)

const annul = tauxAnnulation(commandes, rdvs)
egal('annulations comptées des deux côtés', annul.annules, 2)
egal('sur le total des deux', annul.total, 8)
// Un no-show n'est PAS une annulation : personne n'a décidé de renoncer, le
// client n'est simplement pas venu. Il reste au dénominateur.
egal('un no-show ne gonfle pas le taux d\'annulation',
  tauxAnnulation([], [{ statut: 'no_show' }]).annules, 0)
egal('rien à diviser', tauxAnnulation([], []), null)

// ═══════════════════════════════════════════════════════════════════════════
// 6. LA NOTE — pas de moyenne sur un seul avis
// ═══════════════════════════════════════════════════════════════════════════
egal('un seul avis ne fait pas une note', noteMoyenne([{ note: 5 }]), null)
egal('deux non plus', noteMoyenne([{ note: 5 }, { note: 4 }]), null)
egal('trois oui', noteMoyenne([{ note: 5 }, { note: 4 }, { note: 3 }]), { note: 4, nombre: 3 })
egal('le seuil est bien celui annoncé', MIN_AVIS_POUR_NOTE, 3)
egal('arrondi au dixième', noteMoyenne([{ note: 5 }, { note: 4 }, { note: 4 }]).note, 4.3)
// Les notes absentes ou nulles ne doivent pas tirer la moyenne vers le bas.
egal('les notes vides sont écartées',
  noteMoyenne([{ note: 5 }, { note: 4 }, { note: 3 }, { note: null }, {}]).nombre, 3)

// ═══════════════════════════════════════════════════════════════════════════
// 7. LES DEALS
// ═══════════════════════════════════════════════════════════════════════════
const perf = performanceDeals([
  { vues: 100, clics: 20, cta_clics: 5 },
  { vues: 50, clics: 5, cta_clics: 1 },
])
egal('les vues s\'additionnent', perf.vues, 150)
egal('taux de clic', perf.tauxClic, 17)
// Un taux calculé sur trois vues n'a aucun sens.
egal('trop peu de vues : pas de taux', performanceDeals([{ vues: 3, clics: 1 }]).tauxClic, null)
egal('aucun deal', performanceDeals([]).vues, 0)

// ═══════════════════════════════════════════════════════════════════════════
// 8. L'ÉCRAN VIDE — encourager, jamais culpabiliser
// ═══════════════════════════════════════════════════════════════════════════
// Un commerce qui démarre est à zéro partout, et c'est normal.
const messages = [
  messageVide({}),
  messageVide({ aDesArticles: true }),
  messageVide({ aDesArticles: true, peutVendre: true }),
  messageVide({ aDesArticles: true, aDesDeals: true }),
]
verifier('aucun message vide n\'est culpabilisant',
  messages.every(m => !/dommage|échec|mauvais|devrais|aucun résultat/i.test(m)))
verifier('chaque message dit quoi faire ou rassure',
  messages.every(m => m.length > 40))
verifier('sans catalogue, on parle du catalogue', /catalogue/i.test(messageVide({})))
verifier('avec catalogue mais sans deal, on parle de l\'offre',
  /offre du jour/i.test(messageVide({ aDesArticles: true, peutVendre: true })))

// ═══════════════════════════════════════════════════════════════════════════
// 9. CE QUI SE RÉSERVE
// ═══════════════════════════════════════════════════════════════════════════
const noms = { p1: 'Coupe femme', p2: 'Coupe homme' }
const rdvsPresta = [
  { statut: 'honore', prestation_id: 'p1', prix_estime: 35 },
  { statut: 'confirme', prestation_id: 'p1', prix_estime: 35 },
  { statut: 'confirme', prestation_id: 'p2', prix_estime: 20 },
  { statut: 'annule_client', prestation_id: 'p2', prix_estime: 20 },  // exclu
  { statut: 'confirme', prestation_id: 'disparue', prix_estime: 15 },
]
const tp = topPrestations(rdvsPresta, noms)
egal('la prestation la plus réservée est en tête', tp[0].nom, 'Coupe femme')
egal('avec son nombre', tp[0].quantite, 2)
egal('et son montant au prix complet', tp[0].montant, 70)
// ⚠️ Une prestation retirée du catalogue ne doit pas faire disparaître les
// rendez-vous déjà honorés : ils passent sous un libellé neutre.
verifier('une prestation supprimée reste comptée',
  tp.some(p => p.nom === 'Prestation supprimée' && p.quantite === 1))
egal('les annulés sont exclus', tp.reduce((s, p) => s + p.quantite, 0), 4)
egal('liste vide', topPrestations([], {}), [])

// ═══════════════════════════════════════════════════════════════════════════
// 10. LE TEMPS — tout se compte en HEURE BELGE, jamais en UTC
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ C'EST LE PIÈGE DE CE FICHIER. Une commande passée à 00h30 heure belge est
// horodatée 22h30 ou 23h30 UTC la VEILLE selon la saison. Compter sur l'heure
// brute rangerait la vente dans le mauvais jour et décalerait les heures de
// pointe d'une à deux heures en été.
//
// On mesure donc le test sur le défaut : deux instants choisis de part et
// d'autre du changement d'heure, et dont la lecture UTC est FAUSSE.
// ⚠️ ON COMPARE LES CHAMPS, PAS L'OBJET ENTIER. Ces deux tests comparaient la
// structure complète : ajouter `minute` et `minutes` à `partiesBruxelles`, pour
// que le serveur puisse lire l'heure belge, les a fait rougir alors que la
// règle qu'ils défendent — la bascule de jour — restait parfaitement juste.
// Un test qui casse à chaque champ ajouté ne défend plus rien, il gêne.
{
  const hiver = partiesBruxelles(new Date('2026-01-15T23:30:00Z'))
  egal('hiver : 23h30 UTC le 15 est déjà le 16 à Bruxelles',
    { jour: hiver.jour, heure: hiver.heure, jourSemaine: hiver.jourSemaine },
    { jour: '2026-01-16', heure: 0, jourSemaine: 5 })
  const ete = partiesBruxelles(new Date('2026-07-15T22:30:00Z'))
  egal('été : 22h30 UTC le 15 est déjà le 16 à Bruxelles',
    { jour: ete.jour, heure: ete.heure, jourSemaine: ete.jourSemaine },
    { jour: '2026-07-16', heure: 0, jourSemaine: 4 })
  // Et les minutes suivent la même heure murale, c'est ce qui sert au serveur.
  egal('les minutes accompagnent l\'heure belge', hiver.minutes, 30)
}
egal('été : midi UTC se lit 14h à Bruxelles',
  partiesBruxelles(new Date('2026-07-15T12:00:00Z')).heure, 14)
egal('hiver : midi UTC se lit 13h à Bruxelles',
  partiesBruxelles(new Date('2026-01-15T12:00:00Z')).heure, 13)
egal('une date invalide ne casse rien', partiesBruxelles('n\'importe quoi'), null)

// ─── La courbe ──────────────────────────────────────────────────────────────
const debutCourbe = new Date('2026-07-10T00:00:00Z')
const courbe = serieJournaliere(
  [
    { statut: 'recupere', total: 20, created_at: '2026-07-10T09:00:00Z' },
    { statut: 'recupere', total: 5,  created_at: '2026-07-10T15:00:00Z' },
    { statut: 'annulee_client_refund', total: 99, created_at: '2026-07-11T09:00:00Z' },
    // 22h30 UTC le 12 = 00h30 le 13 à Bruxelles : doit tomber le 13.
    { statut: 'recupere', total: 7, created_at: '2026-07-12T22:30:00Z' },
  ],
  [{ statut: 'confirme', prix_estime: 35, created_at: '2026-07-11T10:00:00Z' }],
  // ⚠️ LES ABONNEMENTS ENTRENT DANS LA COURBE DEPUIS LE 19/08. Sans eux, Alex
  // lisait « ta meilleure journée : 165 € » un jour qui lui avait rapporté
  // 1200 € : le TOTAL les comptait depuis le 17/08, la COURBE jamais.
  [
    { paye: true, prix: 400, paye_le: '2026-07-10T08:00:00Z' },
    // ⚠️ LA DATE EST `paye_le`, JAMAIS `created_at` : un contrat inscrit lundi
    // et encaissé vendredi appartient au vendredi, comme en Comptabilité.
    { paye: true, prix: 100, paye_le: '2026-07-11T08:00:00Z', created_at: '2026-07-10T08:00:00Z' },
    // Un contrat non payé n'est pas une vente.
    { paye: false, prix: 999, paye_le: '2026-07-11T08:00:00Z' },
  ],
  { debut: debutCourbe, jours: 5 }
)
egal('un point par jour, journées vides comprises', courbe.length, 5)
egal('la courbe démarre au bon jour', courbe[0].jour, '2026-07-10')
// 20 + 5 de commandes, plus un abonnement de 400 le même jour.
egal('deux ventes du même jour s\'additionnent', courbe[0].montant, 425)
egal('un abonnement monte la courbe comme le reste',
  courbe[0].montant - 25, 400)
// 35 de rendez-vous, plus l'abonnement daté sur son ENCAISSEMENT. La commande
// annulée ne compte pas, et le contrat impayé non plus.
egal('une commande annulée ne monte pas la courbe',
  courbe.find(j => j.jour === '2026-07-11').montant, 135)
egal('un contrat impayé ne monte pas la courbe',
  courbe.find(j => j.jour === '2026-07-11').montant < 999, true)
// LE TEST QUI ATTRAPE LE FUSEAU : sur l'heure UTC, ces 7 € tomberaient le 12.
egal('une vente de fin de soirée tombe dans le bon jour',
  courbe.find(j => j.jour === '2026-07-13').montant, 7)
egal('le 12 reste vide', courbe.find(j => j.jour === '2026-07-12').montant, 0)
// ⚠️ TROISIÈME ARGUMENT DEPUIS LE 19/08. Écrit `serieJournaliere([], [], {})`,
// ce test restait vert POUR LA MAUVAISE RAISON : le `{}` était pris pour les
// abonnements, les options devenaient `undefined`, et l'absence de `debut`
// rendait `[]` sans rien prouver. Changer une signature ne se voit ni au lint,
// ni au build, ni au banc : il faut relire CHAQUE appelant.
egal('sans début, pas de courbe', serieJournaliere([], [], [], {}), [])
egal('sans options du tout non plus', serieJournaliere([], [], []), [])

// ⚠️ ET LA COURBE S'ARRÊTAIT LA VEILLE. Trente cases posées depuis le jour de
// `debut` couvrent bien trente jours, mais PAS LA JOURNÉE EN COURS, que le
// chiffre d'affaires comptait pourtant : les deux écrans se contredisaient.
// Alex a vendu 2000 € d'abonnements le matin du 19/08, et la courbe lui
// annonçait « ta meilleure journée : le 16/8, 1365 € ».
const courbeAujourdhui = serieJournaliere(
  [], [],
  [{ paye: true, prix: 2000, paye_le: '2026-08-19T08:13:00Z' }],
  { debut: new Date('2026-07-20T15:00:00Z'), fin: new Date('2026-08-19T15:30:00Z'), jours: 30 },
)
egal('la courbe va jusqu’au jour en cours', courbeAujourdhui.at(-1).jour, '2026-08-19')
egal('et la vente du matin même y est', courbeAujourdhui.at(-1).montant, 2000)
egal('sans perdre le premier jour de la fenêtre', courbeAujourdhui[0].jour, '2026-07-20')
// Sans `fin`, l'ancien décompte reste : c'est ce qui rend la garde utile.
egal('sans fin, on pose exactement le nombre de cases demandé',
  serieJournaliere([], [], [], { debut: new Date('2026-07-20T15:00:00Z'), jours: 30 }).length, 30)

// ─── Les moments de pointe ─────────────────────────────────────────────────
// Sous le seuil : les barres existent, la conclusion se tait.
const peu = momentsDePointe(
  [{ statut: 'recupere', total: 10, created_at: '2026-07-15T12:00:00Z' }], [])
egal('une seule commande ne fait pas une heure de pointe', peu.pic_heure, null)
egal('ni un jour de pointe', peu.pic_jour, null)
egal('les barres sont quand même là', peu.heures.length, 24)
egal('et les sept jours aussi', peu.jours.length, 7)
// ⚠️ Lundi doit tomber en case 0 : `getUTCDay()` rend 0 pour DIMANCHE.
egal('la semaine commence le lundi', JOURS_SEMAINE[0], 'Lundi')
egal('le lundi est bien en tête de liste', peu.jours[0].nom, 'Lundi')
// Le 15 juillet 2026 est un mercredi : la barre doit tomber en case 2.
egal('un mercredi tombe dans la case du mercredi', peu.jours[2].nombre, 1)
egal('et 12h UTC se range à 14h', peu.heures[14].nombre, 1)

const assez = momentsDePointe(
  Array.from({ length: MIN_POUR_POINTE }, () => (
    { statut: 'recupere', total: 10, created_at: '2026-07-18T16:00:00Z' })), [])
egal('au seuil, on parle', assez.pic_heure.heure, 18)
egal('le samedi est identifié', assez.pic_jour.nom, 'Samedi')
egal('le total suit', assez.total, MIN_POUR_POINTE)
// Les commandes non encaissées ne doivent pas peser sur les moments de pointe.
egal('un panier abandonné ne crée pas de pic',
  momentsDePointe([{ statut: 'annulee_paiement_ko', created_at: '2026-07-18T16:00:00Z' }], []).total, 0)

// ═══════════════════════════════════════════════════════════════════════════
// 11. RGPD ET HONNÊTETÉ — ce que la route ne doit jamais renvoyer
// ═══════════════════════════════════════════════════════════════════════════
const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
const route = lire('app/api/dashboard/statistiques/route.js')
const routeCode = route.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

// Le commerçant voit des nombres, jamais des personnes. C'est la promesse
// faite aux habitants sur la page d'accueil.
for (const champ of ['client_email', 'client_nom', 'client_telephone', 'adresse_livraison']) {
  verifier(`la route ne lit pas ${champ}`, !new RegExp(champ).test(routeCode))
}
verifier('la propriété du commerce est vérifiée', /auth_user_id !== user\.id/.test(routeCode))
verifier('la période est bornée', /Math\.min\(365/.test(routeCode))
// Le count vit dans `count`, pas dans `data` : s'y tromper ferait croire qu'un
// commerçant n'a aucun article et lui servirait le mauvais message.
verifier('le comptage des articles lit bien count', /\{ count: nbArticles \}/.test(routeCode))
// ⚠️ SANS `prix_estime`, le chiffre d'affaires retomberait silencieusement à
// l'acompte : le reproche d'Alex du 09/08, à l'identique.
verifier('la route charge le prix complet des prestations', /prix_estime/.test(routeCode))
verifier('la route charge la prestation pour la nommer', /prestation_id/.test(routeCode))

// ⚠️ LE DÉFAUT LE PLUS FRÉQUENT DU PROJET, SEPTIÈME FOIS (Alex, 19/08).
// `seancesNonDeclarees` écarte une séance déjà encaissée au comptoir en lisant
// `encaisse_mode` — colonne que le select ne demandait pas. La garde comparait
// `undefined`, qui ne figure dans aucun moyen de paiement : les deux séances
// déjà déclarées étaient recomptées comme non déclarées, et la ligne sous le
// chiffre d'affaires annonçait 300 € sur 20 séances au lieu de 270 € sur 18.
// Aucune erreur, aucun signal, juste un repli silencieux.
//
// ⚠️ ON DÉCOUPE LA LISTE, on ne cherche pas un mot dedans : `acompte` est
// contenu dans `acompte_montant`, et une garde par sous-chaîne se serait crue
// satisfaite par la colonne voisine. C'est l'homonyme voisin, déjà rencontré.
// ⚠️ LA COURBE ET LE TOTAL DOIVENT COUVRIR LA MÊME PÉRIODE. Sans borne de fin,
// la courbe s'arrête la veille et cache la journée en cours, que le chiffre
// d'affaires compte pourtant : deux écrans, deux histoires.
// ⚠️ GARDE NÉE MUETTE, MESURÉE EN MUTATION. Premier jet : `/fin: f\.fin/`.
// Elle restait verte une fois la borne retirée, parce que `periode: { …, fin:
// f.fin.toISOString() }` porte la même sous-chaîne vingt lignes plus haut.
// L'HOMONYME VOISIN, encore. On ancre sur l'APPEL.
verifier('la route borne la courbe sur maintenant',
  /serieJournaliere\([^)]*fin: f\.fin/.test(routeCode))

const selectRdv = (/from\('rdv_reservations'\)\s*\n?\s*\.select\('([^']+)'\)/.exec(routeCode) || [])[1] || ''
const colonnesRdv = selectRdv.split(',').map(c => c.trim())
for (const colonne of ['statut', 'prix_estime', 'acompte_montant', 'acompte_paye', 'encaisse_mode', 'abonnement_id', 'created_at']) {
  verifier(`le select des rendez-vous demande ${colonne}`, colonnesRdv.includes(colonne))
}

// La route des vues : elle ne doit RIEN enregistrer sur le visiteur.
const routeVue = lire('app/api/fiche/vue/route.js')
const routeVueCode = routeVue.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
for (const trace of ['ip', 'user_agent', 'yopper', 'client_id', 'session_id']) {
  verifier(`la route des vues n'enregistre pas ${trace}`,
    !new RegExp(`\\b${trace}\\b`, 'i').test(routeVueCode))
}
verifier('la route des vues valide le format de l\'identifiant', /UUID\.test/.test(routeVueCode))
verifier('la route des vues passe par la fonction en base', /incrementer_vue_fiche/.test(routeVueCode))

// La migration : agrégée par jour, fermée par RLS, et ses droits posés.
const migVues = lireBrut('migrations/MIGRATION_VUES_FICHE.sql')
verifier('la table des vues est agrégée par jour', /PRIMARY KEY \(commercant_id, jour\)/.test(migVues))
verifier('RLS est activée sur les vues', /ENABLE ROW LEVEL SECURITY/.test(migVues))
verifier('aucune policy permissive n\'ouvre la table', !/CREATE POLICY/.test(migVues))
verifier('les droits sont posés explicitement', /GRANT SELECT, INSERT, UPDATE ON public\.fiche_vues/.test(migVues))
verifier('le jour est calculé en heure belge', /Europe\/Brussels/.test(migVues))
verifier('la fonction est SECURITY DEFINER', /SECURITY DEFINER/.test(migVues))

// Le dédoublonnage vit côté navigateur, pas en base : la base ne doit pas
// avoir de quoi reconnaître un visiteur.
const vueFiche = lire('lib/vue-fiche.js')
verifier('une vue n\'est comptée qu\'une fois par session', /sessionStorage/.test(vueFiche))
verifier('les deux fiches partagent la même clé', /const CLE = /.test(vueFiche))

const ecran = lire('app/dashboard/ConfigDashboard.js')
const bloc = ecran.slice(ecran.indexOf('// ─── La courbe jour par jour'), ecran.indexOf('// ─── Onglet SIGNAUX'))
verifier('l\'écran existe', bloc.length > 1000)
// L'écran annonce un chiffre d'affaires COMPLET, et dit dans la même phrase
// quelle part a réellement transité par Yoppaa. Sans ça, le commerçant
// croirait que tout est sur son compte Stripe.
verifier('l\'écran nomme bien un chiffre d\'affaires', /Chiffre d&rsquo;affaires sur \{jours\} jours/.test(bloc))
verifier('l\'écran distingue l\'encaissé en ligne', /encaissés en ligne/.test(bloc))
verifier('l\'écran renvoie vers la Comptabilité', /Comptabilité/.test(bloc))
verifier('l\'écran dit ce qui reste à régler au comptoir', /comptoir/.test(bloc))
verifier('l\'écran montre les vues de fiche', /ouverture\{aud\.vues\.nombre > 1 \? 's' : ''\} de ta fiche/.test(bloc))
// ⚠️ LES VUES DOIVENT ÊTRE HORS DU BANDEAU DES VENTES. Ce bandeau disparaît
// quand tout est à zéro, or c'est exactement le moment où les vues sont le
// SEUL chiffre qui bouge. Les placer dedans les rendrait invisibles au
// commerçant qui vient de s'inscrire, c'est-à-dire à celui qui en a besoin.
verifier('les vues vivent dans le bloc toujours affiché',
  bloc.indexOf('de ta fiche sur {jours} jours') > bloc.indexOf('titre="Qui te suit"'))
verifier('un compteur à zéro donne le geste suivant', /Le compteur démarre/.test(bloc))
verifier('l\'écran montre la courbe', /<Courbe /.test(bloc))
verifier('l\'écran montre les moments de pointe', /<Moments /.test(bloc))
verifier('l\'écran montre ce qui se réserve', /Ce qui se réserve le plus/.test(bloc))
// ⚠️ Une échelle qui ne part pas de zéro transforme une hausse de 3 % en
// montagne : c'est le mensonge le plus courant des tableaux de bord.
verifier('la courbe part de zéro', /L&rsquo;échelle part TOUJOURS de zéro|échelle part TOUJOURS de zéro/.test(bloc))
verifier('l\'écran rappelle qu\'on ne voit personne', /jamais qui a commandé/.test(bloc))
verifier('les euros s\'écrivent à la française', /replace\('\.', ','\)/.test(bloc))
// L'onglet doit être ouvert au palier gratuit : voir ce que sa fiche produit
// est ce qui donne envie d'en faire plus.
verifier('l\'onglet Chiffres n\'est pas réservé à un palier',
  /\{ id: 'stats',\s+label: 'Chiffres', icon: 'chart' \}/.test(ecran))

// ═══════════════════════════════════════════════════════════════════════════
// LE REMBOURSEMENT PARTIEL TRAVERSAIT LE FILTRE PAR STATUT (02/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 LE FRÈRE DU DÉFAUT DU JOURNAL COMPTABLE. Le filtre par statut écarte bien
// les annulations, mais le webhook Stripe garde VOLONTAIREMENT le statut
// courant sur un remboursement partiel. Une commande de 60 € remboursée de
// 20 € s'affichait 60 € au tableau de bord ET 60 € dans le journal : deux
// écrans, le même mensonge, la même cause.
{
  const { valeurCommande } = await import('../lib/statistiques.js')

  egal('une commande remboursée en partie ne compte que ce qui reste',
    valeurCommande({ total: 60, statut: 'recupere', stripe_refund_amount: 20 }), 40)
  egal('une commande intacte ne bouge pas',
    valeurCommande({ total: 60, statut: 'recupere' }), 60)
  egal('une commande remboursée en entier ne rapporte rien',
    valeurCommande({ total: 60, statut: 'recupere', stripe_refund_amount: 60 }), 0)
  // ⚠️ LE PLAFOND : dans le tunnel unique, le rendez-vous et sa commande
  // partagent un paiement, et le webhook écrit le même montant sur les deux.
  egal('un remboursement plus gros que la vente ne creuse pas un négatif',
    valeurCommande({ total: 60, statut: 'recupere', stripe_refund_amount: 200 }), 0)
  // ⚠️ ET LA RÉCOMPENSE PASSE TOUJOURS AVANT : elle n'est jamais entrée en
  // caisse, le remboursement se mesure sur ce qui y était.
  egal('la récompense sort d’abord, le remboursement ensuite',
    valeurCommande({ total: 60, fidelite_remise: 10, stripe_refund_amount: 20 }), 30)

  egal('un rendez-vous remboursé en partie suit la même règle',
    valeurRdv({ prix_estime: 50, statut: 'honore', stripe_refund_amount: 15 }), 35)
  egal('et son acompte encaissé en ligne baisse d’autant',
    acompteRdv({ acompte_montant: 20, stripe_refund_amount: 8 }), 12)
  egal('un acompte remboursé en entier ne se rapproche plus de rien',
    acompteRdv({ acompte_montant: 20, stripe_refund_amount: 20 }), 0)

  // ⚠️ ET LA RÈGLE NE VIT QU'À UN ENDROIT. Le journal comptable et le tableau
  // de bord répondent à la même question : deux copies auraient divergé au
  // premier correctif, comme `rendreAvantages` en 2 copies corrigées 3 fois
  // d'un seul côté.
  const stats = lireBrut('lib/statistiques.js')
  verifier('le tableau de bord emprunte la règle, il ne la recopie pas',
    /from '\.\/remboursements'/.test(stats) && !/Math\.min\(.*refund/i.test(stats))
  const compta = lireBrut('lib/export-comptable.js')
  verifier('le journal comptable emprunte la même',
    /from '\.\/remboursements'/.test(compta))

  // 🔴 ET LA COLONNE DOIT ARRIVER JUSQU'AU CALCUL. Sans elle, tout ce bloc
  // reste vert et le tableau de bord recommence à compter l'argent rendu : LE
  // défaut le plus fréquent du projet, et il est silencieux.
  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 « ENCAISSÉ EN LIGNE » COMPTAIT DE L'ARGENT QUI N'A JAMAIS VU STRIPE
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Ce chiffre est présenté comme la clé du rapprochement avec la comptabilité,
  // et il additionnait TOUS les produits sans regarder le moyen de paiement.
  const { partCarteCommande, acompteRdvEnLigne } = await import('../lib/statistiques.js')

  egal('un Click and Collect réglé au comptoir n’a rien vu de Stripe',
    partCarteCommande({ total: 24.50, statut: 'recupere', paye_en_ligne: false }), 0)
  egal('une commande payée en ligne, si',
    partCarteCommande({ total: 24.50, statut: 'recupere', paye_en_ligne: true }), 24.50)
  // ⚠️ LE BON CADEAU A ÉTÉ ENCAISSÉ LE JOUR DE SON ACHAT : sur cette commande,
  // la carte n'a payé que le reste. Le journal comptable fait cette distinction
  // depuis le 29/08, elle n'avait jamais été portée jusqu'ici.
  egal('la part payée par un bon cadeau ne passe pas par la carte',
    partCarteCommande({ total: 50, paye_en_ligne: true, bon_cadeau_montant: 20 }), 30)
  egal('la récompense non plus',
    partCarteCommande({ total: 50, paye_en_ligne: true, fidelite_remise: 10 }), 40)
  egal('et le remboursement en sort aussi',
    partCarteCommande({ total: 50, paye_en_ligne: true, stripe_refund_amount: 15 }), 35)
  egal('une commande entièrement réglée par bon ne rapporte rien à Stripe',
    partCarteCommande({ total: 20, paye_en_ligne: true, bon_cadeau_montant: 20 }), 0)

  egal('un acompte réglé sur place n’est pas du Stripe',
    acompteRdvEnLigne({ acompte_montant: 8.75, acompte_paye_en_ligne: false }), 0)
  egal('un acompte payé en ligne, si',
    acompteRdvEnLigne({ acompte_montant: 8.75, acompte_paye_en_ligne: true }), 8.75)
  // ⚠️ ET `acompteRdv` NE BOUGE PAS : `valeurRdv` s'en sert comme repli quand la
  // prestation n'a pas de prix estimé. Lui faire rendre zéro sur un acompte
  // réglé au comptoir amputerait le chiffre d'affaires.
  egal('mais le repli du chiffre d’affaires reste entier',
    valeurRdv({ acompte_montant: 8.75, acompte_paye_en_ligne: false }), 8.75)

  // 🔴 LE CAS QUI MANQUAIT : le commerçant vend 100 € au comptoir et voyait
  // « 100 € encaissés en ligne, 0 chez toi ».
  const caComptoir = chiffreAffaires([
    { total: 100, statut: 'recupere', paye_en_ligne: false },
    { total: 40, statut: 'recupere', paye_en_ligne: true },
  ], [])
  egal('le chiffre d’affaires reste entier', caComptoir.total, 140)
  egal('seule la commande en ligne compte comme Stripe', caComptoir.encaisse_en_ligne, 40)
  egal('et celle du comptoir n’est plus perdue', caComptoir.au_comptoir, 100)
  // ⚠️ L'INVARIANT QUI FERME LE COMPTE : les deux colonnes redonnent le total.
  // L'ancienne formule oubliait purement et simplement les produits du comptoir,
  // qui ne figuraient dans AUCUNE des deux.
  verifier('les deux colonnes expliquent le chiffre d’affaires en entier',
    arrondi(caComptoir.encaisse_en_ligne + caComptoir.au_comptoir) === caComptoir.total,
    `${caComptoir.encaisse_en_ligne} + ${caComptoir.au_comptoir} ≠ ${caComptoir.total}`)

  // ⚠️ ET L'ÉCRAN NE DIT PLUS « À RÉGLER » CE QUI EST DÉJÀ RÉGLÉ. Ce montant
  // mêle ce qui est encaissé chez le commerçant et ce qui reste dû : il dit
  // donc ce qui ne passe pas par Stripe, sans affirmer que c'est encore dû.
  const ecranBord = lireBrut('app/dashboard/ConfigDashboard.js')
  verifier('l’écran n’annonce plus « à régler » un montant déjà encaissé',
    !/euros\(a\.au_comptoir\)[^<]*<\/strong> à régler chez toi/.test(ecranBord))
  verifier('et nomme quand même où il est',
    /euros\(a\.au_comptoir\)\}<\/strong> chez toi/.test(ecranBord))

  const routeStats = lireBrut('app/api/dashboard/statistiques/route.js')
  // ⚠️ ON SAUTE LES COMMENTAIRES PLUTÔT QUE DE COMPTER LES CARACTÈRES : une
  // fenêtre en nombre de signes rougit dès qu'on ajoute une explication
  // au-dessus du `select`, ce qui est exactement le contraire du but.
  const selectDe = (table) => routeStats.match(
    new RegExp(`from\\('${table}'\\)\\s*(?:\\/\\/[^\\n]*\\n\\s*)*\\.select\\('([^']*)'`))?.[1] || ''
  verifier('la route des chiffres lit le remboursement des commandes',
    /\bstripe_refund_amount\b/.test(selectDe('commandes')), selectDe('commandes'))
  verifier('et celui des rendez-vous',
    /\bstripe_refund_amount\b/.test(selectDe('rdv_reservations')), selectDe('rdv_reservations'))
  // 🔴 ET LE MOYEN DE PAIEMENT, sans lequel « encaissé en ligne » recommence à
  // compter le comptoir comme du Stripe, tout le bloc ci-dessus restant vert.
  for (const col of ['paye_en_ligne', 'bon_cadeau_montant']) {
    verifier(`la route des chiffres lit ${col} sur les commandes`,
      new RegExp(`\\b${col}\\b`).test(selectDe('commandes')), selectDe('commandes'))
  }
  verifier('et acompte_paye_en_ligne sur les rendez-vous',
    /\bacompte_paye_en_ligne\b/.test(selectDe('rdv_reservations')), selectDe('rdv_reservations'))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Statistiques vertes.')
