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
} from '../lib/statistiques.js'

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

const commandes = [
  { total: 24.50, statut: 'recupere' },
  { total: 10.00, statut: 'en_attente' },
  { total: 99.00, statut: 'annulee_client_refund' },  // exclue
  { total: 50.00, statut: 'non_retire' },             // exclue
]
egal('le chiffre d\'affaires ignore annulé et non retiré', chiffreAffaires(commandes, []), 34.50)

// Pour un rendez-vous, seul l'ACOMPTE a transité par Yoppaa. Le solde se règle
// au comptoir : l'annoncer serait inventer un chiffre.
const rdvs = [
  { statut: 'confirme', acompte_montant: 12.50 },
  { statut: 'confirme', acompte_montant: 0 },      // sans acompte : rien encaissé
  { statut: 'annule_client', acompte_montant: 20 },  // exclu
]
egal('seul l\'acompte des RDV confirmés compte', chiffreAffaires([], rdvs), 12.50)
egal('commandes et RDV s\'additionnent', chiffreAffaires(commandes, rdvs), 47.00)
egal('rien du tout', chiffreAffaires([], []), 0)
egal('appel sans argument', chiffreAffaires(), 0)

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
egal('sur le total des deux', annul.total, 7)
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
// 9. RGPD ET HONNÊTETÉ — ce que la route ne doit jamais renvoyer
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

const ecran = lire('app/dashboard/ConfigDashboard.js')
const bloc = ecran.slice(ecran.indexOf('function TabStatistiques'), ecran.indexOf('// ─── Onglet SIGNAUX'))
verifier('l\'écran existe', bloc.length > 1000)
verifier('l\'écran dit que le comptoir n\'est pas compté', /comptoir/.test(bloc))
verifier('l\'écran rappelle qu\'on ne voit personne', /jamais qui a commandé/.test(bloc))
verifier('les euros s\'écrivent à la française', /replace\('\.', ','\)/.test(bloc))
// L'onglet doit être ouvert au palier gratuit : voir ce que sa fiche produit
// est ce qui donne envie d'en faire plus.
verifier('l\'onglet Chiffres n\'est pas réservé à un palier',
  /\{ id: 'stats',\s+label: 'Chiffres', icon: 'chart' \}/.test(ecran))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Statistiques vertes.')
