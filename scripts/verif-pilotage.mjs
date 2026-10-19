// Banc du tableau de pilotage (19/10) : `npm run verif:pilotage`.
//
// Le comportement d'abord (lignes inventées, horloge choisie), puis les gardes
// sur le code : qui peut lire, à quelle heure part l'email, quelles colonnes
// sont lues, et que chaque tâche automatique note bien son passage.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import { calculerPilotage, etatCron, CRONS_SUIVIS, jourDe, COMMANDE_PAS_NEE } from '../lib/pilotage.js'
import { COLONNES_PILOTAGE } from '../lib/pilotage-server.js'
import { emailPilotage } from '../lib/pilotage-email.js'
import { nombre, ecart, jourEnLettres, depuis } from '../lib/pilotage-format.js'
import { cheminSansParametres, ligneJournal, noterPassageCron, noterErreurEcran, purgerJournal } from '../lib/journal-technique.js'
import { HEURES_CRON } from '../lib/heure-cron.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const brut = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(brut(f))

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE CALCUL
// ═══════════════════════════════════════════════════════════════════════════
// Le mardi 20 octobre 2026 à 7h00 à Bruxelles (heure d'été : 5h00 UTC).
const MAINTENANT = new Date('2026-10-20T05:00:00Z')

const commercants = [
  { id: 'friterie', nom: 'Friterie <b>Test</b>', plan: 'exister', categorie: 'alimentaire', statut: 'valide', statut_publication: 'publie', created_at: '2026-10-01T10:00:00Z' },
  { id: 'abbayes', nom: 'Les Abbayes', plan: 'vendre', categorie: 'alimentaire', statut: 'valide', statut_publication: 'publie', created_at: '2026-10-02T10:00:00Z', stripe_subscription_id: 'sub_1', subscription_status: 'trialing' },
  { id: 'boutique', nom: 'La Boutique', plan: 'communiquer', categorie: 'detail', statut: 'valide', statut_publication: 'en_attente', created_at: '2026-10-05T10:00:00Z' },
  { id: 'essai', nom: 'L’Essayeur', plan: 'exister', essai_plan: 'vendre', categorie: 'alimentaire', statut: 'valide', statut_publication: 'relecture', created_at: '2026-10-18T10:00:00Z' },
  { id: 'suspendu', nom: 'Le Suspendu', plan: 'vendre', categorie: 'alimentaire', statut: 'valide', statut_publication: 'suspendu', created_at: '2026-09-01T10:00:00Z' },
  { id: 'demo', nom: 'Démo', plan: 'vendre', categorie: 'alimentaire', statut: 'valide', statut_publication: 'relecture', billing_exempt: true, created_at: '2026-08-01T10:00:00Z' },
]

const commandes = [
  // Hier (19/10), dans l'app, encaissée : 20 € moins 5 € de récompense.
  { commercant_id: 'abbayes', statut: 'recupere', origine: 'en_ligne', total: 20, fidelite_remise: 5, created_at: '2026-10-19T10:00:00Z' },
  // 🔴 Hier à 00h30 À BRUXELLES, encore le 18 en heure de Greenwich.
  { commercant_id: 'abbayes', statut: 'en_attente', origine: 'en_ligne', total: 10, created_at: '2026-10-18T22:30:00Z' },
  // Hier, encodée par le commerçant.
  { commercant_id: 'abbayes', statut: 'pret', origine: 'commercant', total: 12, created_at: '2026-10-19T11:00:00Z' },
  // Hier, panier abandonné et paiement jamais revenu : n'existent pas.
  { commercant_id: 'abbayes', statut: 'annulee_paiement_ko', origine: 'en_ligne', total: 99, created_at: '2026-10-19T12:00:00Z' },
  { commercant_id: 'abbayes', statut: 'paiement_en_attente', origine: 'en_ligne', total: 99, created_at: '2026-10-19T12:30:00Z' },
  // Hier, annulée par le client : une commande passée, mais pas une vente.
  { commercant_id: 'abbayes', statut: 'annulee_client_refund', origine: 'en_ligne', total: 50, created_at: '2026-10-19T13:00:00Z' },
  // Le même jour, une semaine plus tôt (lundi 12).
  { commercant_id: 'abbayes', statut: 'recupere', origine: 'en_ligne', total: 8, created_at: '2026-10-12T10:00:00Z' },
  // Mardi 13 : dans les sept derniers jours.
  { commercant_id: 'abbayes', statut: 'recupere', origine: 'en_ligne', total: 8, created_at: '2026-10-13T10:00:00Z' },
  // 🔴 Fiche de démonstration, hier : écartée de tout.
  { commercant_id: 'demo', statut: 'recupere', origine: 'en_ligne', total: 500, created_at: '2026-10-19T10:00:00Z' },
  { commercant_id: 'demo', statut: 'recupere', origine: 'en_ligne', total: 500, created_at: '2026-10-19T10:05:00Z' },
]

const rdvs = [
  { commercant_id: 'abbayes', statut: 'honore', source: 'yopper', prix_estime: 30, created_at: '2026-10-19T09:00:00Z' },
  { commercant_id: 'abbayes', statut: 'confirme', source: 'commercant', prix_estime: 40, created_at: '2026-10-19T09:30:00Z' },
  { commercant_id: 'abbayes', statut: 'annule_client', source: 'yopper', prix_estime: 30, created_at: '2026-10-19T09:45:00Z' },
  { commercant_id: 'abbayes', statut: 'no_show', source: 'yopper', prix_estime: 30, created_at: '2026-10-19T10:00:00Z' },
  { commercant_id: 'demo', statut: 'honore', source: 'yopper', prix_estime: 100, created_at: '2026-10-19T09:00:00Z' },
]

const signaux = [
  { commercant_id: 'friterie', type: 'commande', created_at: '2026-10-19T18:00:00Z' },
  { commercant_id: 'friterie', type: 'livraison', created_at: '2026-10-10T18:00:00Z' },
  { commercant_id: 'abbayes', type: 'invendus', created_at: '2026-10-19T18:00:00Z' },
  { commercant_id: 'essai', type: 'commande', created_at: '2026-10-19T18:00:00Z' },
  { commercant_id: 'demo', type: 'commande', created_at: '2026-10-19T18:00:00Z' },
]

// Toutes les tâches sont passées hier matin, sauf trois cas particuliers : la
// relance de facturation (4 jours sans passage), la tâche hebdomadaire (il y a
// 5 jours) et la purge mensuelle (il y a 19 jours).
const PARTICULIERS = ['/api/cron/billing-relances', '/api/cron/signaux-hebdo', '/api/cron/purge-adresses-livraison']
const journalOk = [
  ...CRONS_SUIVIS.filter(c => !PARTICULIERS.includes(c.chemin))
    .map(c => ({ genre: 'cron', nom: c.chemin, cree_le: '2026-10-19T06:00:00Z' })),
  { genre: 'cron', nom: '/api/cron/signaux-hebdo', cree_le: '2026-10-15T07:30:00Z' },
  { genre: 'cron', nom: '/api/cron/purge-adresses-livraison', cree_le: '2026-10-01T03:00:00Z' },
  { genre: 'cron', nom: '/api/cron/billing-relances', cree_le: '2026-10-16T08:00:00Z' },
  { genre: 'erreur_ecran', nom: '/commander/friterie', cree_le: '2026-10-19T15:00:00Z' },
  { genre: 'erreur_ecran', nom: '/commander/friterie', cree_le: '2026-10-17T15:00:00Z' },
]

const donnees = (extra = {}) => ({
  erreurs: [],
  commercants,
  commandes,
  rdvs,
  signaux,
  vues: [
    { commercant_id: 'friterie', jour: '2026-10-19', vues: 7 },
    { commercant_id: 'friterie', jour: '2026-10-12', vues: 3 },
    { commercant_id: 'demo', jour: '2026-10-19', vues: 100 },
  ],
  favoris: [{ commercant_id: 'friterie' }, { commercant_id: 'demo' }],
  comptesParJour: [{ jour: '2026-10-19', comptes: 4 }, { jour: '2026-10-12', comptes: 1 }, { jour: '2026-09-01', comptes: 10 }],
  clientsSansCompte: 22,
  preinscrits: [{ type_utilisateur: 'yopper' }, { type_utilisateur: 'yopper' }, { type_utilisateur: 'commercant' }],
  suggestions: [{ created_at: '2026-10-18T10:00:00Z' }],
  signalements: [],
  avis: [],
  bons: [],
  cartes: [],
  webhooksEnErreur: [],
  journal: journalOk,
  journalDepuis: '2026-09-25T00:00:00Z',
  ...extra,
})

const p = calculerPilotage(donnees(), MAINTENANT)
const tuile = (cle) => p.tuiles.find(t => t.cle === cle)

verifier('aujourd’hui et hier sont ceux de Bruxelles', p.aujourdhui === '2026-10-20' && p.hier === '2026-10-19', `${p.aujourdhui} / ${p.hier}`)
verifier('🔴 00h30 à Bruxelles compte le jour belge, pas celui de Greenwich', jourDe('2026-10-18T22:30:00Z') === '2026-10-19')

verifier('commandes app hier : 3 (00h30 compris), sans paniers abandonnés ni démo',
  tuile('commandes_app').hier === 3, String(tuile('commandes_app').hier))
verifier('les deux statuts qui n’ont jamais existé sont écartés',
  COMMANDE_PAS_NEE.includes('annulee_paiement_ko') && COMMANDE_PAS_NEE.includes('paiement_en_attente') && COMMANDE_PAS_NEE.length === 2)
verifier('commandes encodées hier : 1', tuile('commandes_encodees').hier === 1)
verifier('comparé au MÊME jour de la semaine passée (lundi 12) : 1',
  tuile('commandes_app').memeJourSemainePassee === 1, String(tuile('commandes_app').memeJourSemainePassee))
verifier('les sept derniers jours comprennent le mardi 13 et pas le lundi 12',
  tuile('commandes_app').septJours === 4 && tuile('commandes_app').septJoursAvant === 1,
  `${tuile('commandes_app').septJours} / ${tuile('commandes_app').septJoursAvant}`)
verifier('la courbe fait 30 jours et finit hier',
  tuile('commandes_app').courbe.length === 30 && tuile('commandes_app').courbe[29].jour === '2026-10-19' && tuile('commandes_app').courbe[0].jour === '2026-09-20')

verifier('RDV app hier : honoré et pas venu, sans l’annulé ni la démo', tuile('rdv_app').hier === 2, String(tuile('rdv_app').hier))
verifier('RDV encodés hier : 1', tuile('rdv_encodes').hier === 1)

// Volume d'hier : 15 (20 − 5 de récompense) + 10 + 12 + 30 (honoré) + 40 (confirmé)
// = 107. Ni l'annulée, ni le pas venu, ni la démo.
verifier('🔴 le volume reprend les définitions du tableau de bord (récompense déduite, annulées et pas venus exclus)',
  tuile('volume').hier === 107, String(tuile('volume').hier))
verifier('le volume est de l’argent', tuile('volume').argent === true)

verifier('vues d’hier sans la démo', tuile('vues').hier === 7, String(tuile('vues').hier))
// Les vues n'ont qu'un jour la semaine d'avant (lundi 12, 3 vues) : un écart
// d'un seul jour dans la comparaison tombe sur le mardi 13, vide.
verifier('🔴 les vues d’hier comparées au lundi 12, pas au mardi 13', tuile('vues').memeJourSemainePassee === 3, String(tuile('vues').memeJourSemainePassee))
verifier('signaux d’hier sans la démo', tuile('signaux').hier === 3, String(tuile('signaux').hier))
verifier('nouveaux comptes d’hier', tuile('comptes').hier === 4)
verifier('total des comptes Yopper', p.croissance.comptesYopper === 15)
verifier('préinscrits par type', p.croissance.preinscritsYopper === 2 && p.croissance.preinscritsCommercant === 1)
verifier('favoris sans la démo', p.croissance.favoris === 1)

// App, hors démo : hier ×2 (dont 00h30), l'annulée par le client, le 12 et le 13.
verifier('🔴 la démo est hors de l’activité, et comptée à part',
  p.activite.commandesApp === 5 && p.activite.commandesEncodees === 1 && p.activite.demoCommandes === 2 && p.activite.demoRdv === 1,
  JSON.stringify(p.activite))
verifier('la démo reste listée, marquée, dans le tableau des commerces',
  p.commerces.lignes.some(l => l.id === 'demo' && l.demo === true) && p.commerces.total === 5 && p.commerces.demo === 1)

// Revenu : Communiquer 19,90 + Vendre 49,90. Ni Exister, ni le suspendu, ni la démo.
verifier('revenu attendu : formules payantes, hors suspendu et démo', p.revenu.revenuAttenduHtva === 69.8, String(p.revenu.revenuAttenduHtva))
verifier('les payants sans abonnement Stripe sont nommés',
  p.revenu.sansAbonnement.length === 1 && p.revenu.sansAbonnement[0].nom === 'La Boutique')
verifier('les essais en cours sont nommés', p.revenu.enEssai.length === 1 && p.revenu.enEssai[0].essai === 'vendre')
verifier('✅ à démarcher : la friterie en Exister qui reçoit des signaux',
  p.revenu.aDemarcher.length === 1 && p.revenu.aDemarcher[0].nom.startsWith('Friterie') && p.revenu.aDemarcher[0].signaux30 === 2,
  JSON.stringify(p.revenu.aDemarcher))
verifier('pas à démarcher : celui qui paie Vendre, ni celui qui l’essaie déjà',
  !p.revenu.aDemarcher.some(l => l.nom === 'Les Abbayes' || l.nom === 'L’Essayeur'))
verifier('le premier prélèvement est une date future', !!p.revenu.premierPrelevement && new Date(p.revenu.premierPrelevement) > MAINTENANT)

verifier('pas encore en ligne : en attente et relecture, ni publiée ni suspendue',
  p.commerces.pasEnLigne.map(l => l.nom).sort().join('|') === 'La Boutique|L’Essayeur')

// Les alertes.
verifier('✅ alerte verte : un commerce gratuit a reçu un signal hier',
  p.alertes.some(a => a.niveau === 'vert' && a.texte.includes('Friterie')))
verifier('pas d’alerte verte pour un commerce qui paie Vendre',
  !p.alertes.some(a => a.niveau === 'vert' && a.texte.includes('Les Abbayes')))
verifier('alerte orange : inscrit depuis plus de 7 jours, fiche pas en ligne',
  p.alertes.some(a => a.niveau === 'orange' && /1 commerce inscrit depuis plus de 7 jours/.test(a.texte)))
verifier('alerte orange : un plantage d’écran hier', p.alertes.some(a => a.niveau === 'orange' && /1 plantage d’écran hier/.test(a.texte)))
verifier('santé : plantages hier et sur 7 jours, page nommée',
  p.sante.erreursEcranHier === 1 && p.sante.erreursEcran7 === 2 && p.sante.pagesEnErreur[0]?.page === '/commander/friterie')

// Les tâches automatiques.
const etat = (chemin) => p.sante.crons.find(c => c.chemin === chemin)?.etat
verifier('chaque tâche suivie a une ligne', p.sante.crons.length === CRONS_SUIVIS.length)
verifier('passé hier matin : OK', etat('/api/cron/recap-jour-8h') === 'ok')
verifier('🔴 pas passé depuis 4 jours alors que le journal a 25 jours : en retard', etat('/api/cron/billing-relances') === 'retard')
verifier('la tâche hebdomadaire passée il y a 5 jours : OK', etat('/api/cron/signaux-hebdo') === 'ok')
verifier('la purge mensuelle passée il y a 19 jours : OK', etat('/api/cron/purge-adresses-livraison') === 'ok')
verifier('🔴 alerte rouge pour la tâche en retard', p.alertes.some(a => a.niveau === 'rouge' && a.texte.includes('billing-relances')))
verifier('⚠️ un journal tout neuf n’accuse personne',
  etatCron({ chemin: '/api/cron/billing-relances', rythme: 'jour' }, [], '2026-10-19T20:00:00Z', MAINTENANT).etat === 'attente')
verifier('⚠️ mais un journal de plus d’un jour accuse la tâche quotidienne absente',
  etatCron({ chemin: '/api/cron/billing-relances', rythme: 'jour' }, [], '2026-10-18T20:00:00Z', MAINTENANT).etat === 'retard')
verifier('sans date de journal, on attend', etatCron({ chemin: '/x', rythme: 'mois' }, [], null, MAINTENANT).etat === 'attente')
verifier('le pilotage lui-même est suivi', CRONS_SUIVIS.some(c => c.chemin === '/api/cron/pilotage-matin'))
verifier('le cron des 5 minutes n’est pas suivi (il noierait le journal)', !CRONS_SUIVIS.some(c => c.chemin.includes('expire-reservations')))

// Une source illisible : indisponible, jamais zéro.
{
  const q = calculerPilotage(donnees({ erreurs: ['commandes', 'journal'], commandes: [], journal: [] }), MAINTENANT)
  verifier('🔴 une source illisible rend sa tuile indisponible, pas zéro',
    q.tuiles.find(t => t.cle === 'commandes_app').indisponible === true && q.tuiles.find(t => t.cle === 'volume').indisponible === true)
  verifier('et le dit dans les alertes', q.alertes.some(a => a.texte.includes('Lecture impossible') && a.texte.includes('commandes')))
  verifier('un journal illisible ne fabrique pas de retards', q.sante.journalIndisponible === true && q.sante.crons.length === 0 && q.sante.cronsEnRetard.length === 0)
  verifier('les autres sources restent lisibles', q.tuiles.find(t => t.cle === 'signaux').indisponible === false)
}
// Les événements Stripe en erreur.
{
  const q = calculerPilotage(donnees({ webhooksEnErreur: [{ event_type: 'checkout.session.completed', status: 'error', processed_at: '2026-10-19T10:00:00Z' }] }), MAINTENANT)
  verifier('🔴 un événement Stripe en erreur sonne rouge', q.alertes.some(a => a.niveau === 'rouge' && /1 événement Stripe en erreur/.test(a.texte)))
  verifier('et il est nommé par son type', q.sante.derniersWebhooksEnErreur[0]?.type === 'checkout.session.completed')
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. L'EMAIL
// ═══════════════════════════════════════════════════════════════════════════
{
  const mail = emailPilotage(p)
  verifier('le sujet dit le jour et ce qui est à régler', /^Pilotage du lundi 19 octobre : 1 point à régler$/.test(mail.subject), mail.subject)
  verifier('🔴 les noms de commerces sont échappés', !mail.html.includes('<b>Test</b>') && mail.html.includes('&lt;b&gt;Test&lt;/b&gt;'))
  verifier('🔴 aucune adresse email dans le corps', !/[\w.+-]+@[\w-]+\.[\w.]+/.test(mail.html))
  verifier('le lien mène au pilotage de l’admin', mail.html.includes('/admin#pilotage'))
  verifier('il compare au même jour de la semaine passée', mail.html.includes('lundi 12 octobre'))
  verifier('il dit que la démo est écartée', mail.html.includes('Hors fiches de démonstration'))
  const calme = emailPilotage(calculerPilotage(donnees({ journal: [], journalDepuis: null, commercants: commercants.filter(c => c.id === 'abbayes'), signaux: [] }), MAINTENANT))
  verifier('sans rien de rouge, le sujet ne crie pas', calme.subject === 'Pilotage du lundi 19 octobre', calme.subject)
}

// La mise en forme.
verifier('écart positif', ecart(5, 2) === '+3')
verifier('écart négatif avec le vrai signe moins', ecart(2, 5) === '−3')
verifier('écart nul', ecart(2, 2) === '=')
verifier('argent à la belge', nombre(1234.5, { argent: true }).replace(/\s/g, ' ') === '1 234,50 €' || nombre(1234.5, { argent: true }).includes('234,50'))
verifier('un jour en lettres ne glisse pas', jourEnLettres('2026-10-19') === 'lundi 19 octobre', jourEnLettres('2026-10-19'))
verifier('« jamais » quand rien n’est passé', depuis(null) === 'jamais')
verifier('les heures', depuis('2026-10-20T02:00:00Z', MAINTENANT) === 'il y a 3 h')

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE JOURNAL TECHNIQUE
// ═══════════════════════════════════════════════════════════════════════════
verifier('🔴 le chemin perd ses paramètres', cheminSansParametres('/compte?token=abc&email=x@y.be') === '/compte')
verifier('et son ancre', cheminSansParametres('/commander/x#paiement') === '/commander/x')
verifier('une adresse complète devient un chemin', cheminSansParametres('https://yoppaa.app/commander/x?a=1') === '/commander/x')
verifier('un genre inconnu ne s’écrit pas', ligneJournal('autre', 'x') === null)
verifier('un nom vide ne s’écrit pas', ligneJournal('cron', '  ') === null)
verifier('nom et détail bornés', ligneJournal('cron', 'a'.repeat(300), 'b'.repeat(900)).nom.length === 200
  && ligneJournal('cron', 'a', 'b'.repeat(900)).detail.length === 500)
{
  const inserts = []
  const dbOk = { from: () => ({ insert: async (l) => { inserts.push(l); return { error: null } } }) }
  verifier('un passage s’écrit', await noterPassageCron('/api/cron/x', null, dbOk) === true && inserts[0]?.genre === 'cron' && inserts[0]?.nom === '/api/cron/x')
  await noterErreurEcran({ chemin: '/a?email=x@y.be', message: 'boum', ou: 'page' }, dbOk)
  verifier('une erreur d’écran s’écrit sans les paramètres', inserts[1]?.nom === '/a' && inserts[1]?.detail === '[page] boum')
  // Une exception qui s'échappe doit faire ROUGIR le banc, pas le faire planter.
  const sansException = async (f) => { try { return await f() } catch { return 'EXCEPTION' } }
  const dbRefus = { from: () => ({ insert: async () => ({ error: { message: 'relation does not exist' } }) }) }
  verifier('🔴 une table absente ne fait pas échouer la tâche', await sansException(() => noterPassageCron('/api/cron/x', null, dbRefus)) === false)
  const dbCasse = { from: () => { throw new Error('réseau') } }
  verifier('🔴 une base injoignable non plus', await sansException(() => noterPassageCron('/api/cron/x', null, dbCasse)) === false)
  verifier('ni pour une erreur d’écran', await sansException(() => noterErreurEcran({ chemin: '/a' }, dbCasse)) === false)
  verifier('la purge non plus', await sansException(() => purgerJournal(dbCasse)) === null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES GARDES SUR LE CODE
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 AUCUNE DONNÉE PERSONNELLE N'EST LUE. Colonne par colonne.
{
  const interdites = /\b(email|telephone|prenom|adresse|commentaire|message|payload|error_msg|client_id|auth_user_id|detail)\b/
  for (const [table, cols] of Object.entries(COLONNES_PILOTAGE)) {
    verifier(`🔴 ${table} : aucune colonne personnelle`, !interdites.test(cols), cols)
  }
  verifier('`nom` n’est lu que pour les commerces et le journal (chemin d’une tâche ou d’une page)',
    Object.entries(COLONNES_PILOTAGE).every(([t, cols]) => !/\bnom\b/.test(cols) || ['commercants', 'journal_technique'].includes(t)))
  const SERVEUR = code('lib/pilotage-server.js')
  verifier('le serveur ne lit que les colonnes déclarées (aucun select écrit en dur, hors repli des favoris et début du journal)',
    (SERVEUR.match(/\.select\('/g) || []).length === 4
    && SERVEUR.includes(".select('commercant_id').order('commercant_id').order('client_id')")
    && SERVEUR.includes(".select('cree_le').order('cree_le', { ascending: true }).limit(1)")
    && (SERVEUR.match(/\.select\('id', \{ count: 'exact', head: true \}\)/g) || []).length === 2)
  verifier('toutes les lignes, pas les mille premières', (SERVEUR.match(/tout\('/g) || []).length >= 9 && SERVEUR.includes('toutesLesLignes('))
}

// La route admin : identité ET double authentification avant toute lecture.
{
  const R = code('app/api/admin/pilotage/route.js')
  const iGarde = R.indexOf('if (!(await adminVerifie(request, user)))')
  const iLecture = R.indexOf('construirePilotage(')
  verifier('🔴 la route admin exige la double authentification', iGarde > 0 && R.includes("{ status: 403 }"))
  verifier('🔴 et elle la vérifie AVANT de lire', iGarde > 0 && iLecture > iGarde)
  verifier('la session est exigée', R.includes("if (!user) return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })"))
}

// Le cron de 7h00.
{
  const R = code('app/api/cron/pilotage-matin/route.js')
  const iSecret = R.indexOf("refusCron(gardeCron(request, 'cron/pilotage-matin'), NextResponse)")
  const iHeure = R.indexOf("horsDeSonHeure(request, '/api/cron/pilotage-matin')")
  const iTravail = R.indexOf('construirePilotage(')
  verifier('🔴 le cron exige son secret', iSecret > 0)
  verifier('🔴 puis son heure, puis il travaille', iSecret < iHeure && iHeure < iTravail)
  verifier('l’email part à l’admin', R.includes('envoyerAuAdmin({ subject: mail.subject, html: mail.html })'))
  verifier('il purge le journal', R.includes('purgerJournal(admin)'))
  verifier('7h00 à Bruxelles', HEURES_CRON['/api/cron/pilotage-matin']?.heure === 7 && !HEURES_CRON['/api/cron/pilotage-matin']?.minute)
  const vercel = JSON.parse(brut('vercel.json'))
  verifier('🔴 planifié été ET hiver (5 h et 6 h UTC)',
    (vercel.crons || []).some(c => c.path === '/api/cron/pilotage-matin' && c.schedule === '0 5,6 * * *'))
}

// 🔴 CHAQUE TÂCHE SUIVIE NOTE SON PASSAGE, APRÈS SES GARDES.
{
  const ROUTES = {
    '/api/cron/recap-jour-8h': "return NextResponse.json({ ok: true, ignore: 'pas_8h_a_bruxelles' })",
    '/api/cron/rdv-reminder-9h': "horsDeSonHeure(request, '/api/cron/rdv-reminder-9h')",
    '/api/cron/billing-relances': "horsDeSonHeure(req, '/api/cron/billing-relances')",
    '/api/cron/relance-inscriptions': "horsDeSonHeure(request, '/api/cron/relance-inscriptions')",
    '/api/cron/rappels-retrait': "horsDeSonHeure(request, '/api/cron/rappels-retrait')",
    '/api/cron/morning-yoppers': "horsDeSonHeure(req, '/api/cron/morning-yoppers')",
    '/api/cron/fidelite-rdv': "horsDeSonHeure(request, '/api/cron/fidelite-rdv')",
    '/api/cron/signaux-hebdo': "horsDeSonHeure(request, '/api/cron/signaux-hebdo')",
    '/api/cron/stripe-frais': "refusCron(gardeCron(req, 'cron/stripe-frais'), NextResponse)",
    '/api/cron/purge-adresses-livraison': "refusCron(gardeCron(req, 'cron/purge-adresses-livraison'), NextResponse)",
    '/api/cron/pilotage-matin': "horsDeSonHeure(request, '/api/cron/pilotage-matin')",
  }
  verifier('chaque tâche suivie a sa garde au banc', CRONS_SUIVIS.every(c => ROUTES[c.chemin]), CRONS_SUIVIS.map(c => c.chemin).filter(c => !ROUTES[c]).join(', '))
  for (const [chemin, garde] of Object.entries(ROUTES)) {
    const R = code(`app${chemin}/route.js`)
    const iGarde = R.indexOf(garde)
    const iNote = R.indexOf(`noterPassageCron('${chemin}'`)
    verifier(`🔴 ${chemin} note son passage, après ses gardes`, iGarde > 0 && iNote > iGarde, `garde ${iGarde}, note ${iNote}`)
    verifier(`${chemin} ne le note qu’une fois`, (R.match(/noterPassageCron\(/g) || []).length === 1)
  }
}

// La route des erreurs d'écran : publique, donc bornée.
{
  const R = code('app/api/erreur-ecran/route.js')
  const iQuota = R.indexOf('checkLocal(`erreur-ecran:${clientIp(request)}`, ERREURS_JOURNAL_PAR_IP, FENETRE_JOURNAL_MS)')
  const iNote = R.indexOf('await noterErreurEcran(')
  verifier('🔴 une erreur d’écran ne s’écrit qu’après le quota par adresse', iQuota > 0 && iNote > iQuota && R.includes('if (quota.success) {'))
  verifier('le quota est de 20 par 10 minutes', R.includes('const ERREURS_JOURNAL_PAR_IP = 20') && R.includes('const FENETRE_JOURNAL_MS = 10 * 60 * 1000'))
  verifier('la pile ne va pas au journal', !/noterErreurEcran\(\{[^}]*pile/.test(R))
}

// Le calcul ne réécrit pas les définitions de l'argent.
{
  const L = code('lib/pilotage.js')
  verifier('🔴 les définitions viennent du tableau de bord des commerçants',
    L.includes("import { commandeEncaissee, valeurCommande, rdvHonore, valeurRdv, arrondi } from './statistiques'"))
  verifier('les RDV annulés viennent de la liste commune', L.includes("import { STATUTS_RDV_ANNULES } from './remboursements'"))
  verifier('🔴 la démo est écartée par `billing_exempt`', L.includes('export const estDemo = (c) => c?.billing_exempt === true'))
}

// La page.
{
  const ADMIN = code('app/admin/page.js')
  const iFiches = ADMIN.indexOf('<SectionFichesAPublier')
  const iPilotage = ADMIN.indexOf('<SectionPilotage />')
  const iTous = ADMIN.indexOf('<SectionTousCommercants')
  verifier('la page Pilotage vient après les trois blocs d’action, avant la liste des commerçants', iFiches > 0 && iPilotage > iFiches && iTous > iPilotage)
  const S = code('app/admin/SectionPilotage.js')
  verifier('elle lit la route admin avec le jeton', S.includes("fetch('/api/admin/pilotage', { headers: { Authorization: `Bearer ${session.access_token}` } })"))
  verifier('elle porte l’ancre de l’email', S.includes('<div id="pilotage"'))
  verifier('la démo est cachée par défaut dans le tableau', S.includes('const [demo, setDemo] = useState(false)') && S.includes('.filter(l => demo || !l.demo)'))
  verifier('⚠️ elle n’importe pas l’envoi d’emails', !S.includes('pilotage-email') && !S.includes('/resend'))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko) {
  for (const e of echecs) console.log(`  ✕ ${e}`)
  process.exit(1)
}
console.log('Pilotage vert.')
