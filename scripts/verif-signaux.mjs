// Banc des SIGNAUX YOPPER : quand parle-t-on au commerçant, et comment.
//
// L'enjeu n'est pas technique, il est commercial. Un email envoyé trop tôt
// (« 1 personne a demandé ») affaiblit l'argument au lieu de le servir, et un
// email envoyé trop souvent devient du bruit qui abîme la confiance. Ces
// règles-là méritent d'être verrouillées.

import { readFileSync } from 'node:fs'
import { libelleEnvie, phraseHorsOuverture, enviesAAlerter, peutEnvoyerEmail, LIBELLE_ENVIE } from '../lib/signaux.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// ═══════════════════════════════════════════════════════════════════════════
// 1. LES MOTS — un fait sur son commerce, jamais une offre
// ═══════════════════════════════════════════════════════════════════════════
// Les cinq types d'envie doivent tous avoir leur libellé, sinon le tableau de
// bord afficherait une clé technique au commerçant.
const TYPES = ['commande', 'rdv', 'livraison', 'prix', 'deals']
verifier('les cinq envies sont nommées', TYPES.every(t => LIBELLE_ENVIE[t]))
verifier('un type inconnu ne casse rien', typeof libelleEnvie('zzz').phrase(2) === 'string')

egal('singulier', libelleEnvie('rdv').phrase(1), '1 habitant a voulu prendre rendez-vous chez toi')
egal('pluriel', libelleEnvie('rdv').phrase(12), '12 habitants ont voulu prendre rendez-vous chez toi')
verifier('la phrase parle du commerce, pas de Yoppaa',
  TYPES.every(t => !/Yoppaa|formule|abonnement|passer à/i.test(libelleEnvie(t).phrase(5))),
  TYPES.map(t => libelleEnvie(t).phrase(5)).join(' | '))

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE SOIR ET LE WEEK-END — la réponse à « j'ai déjà un système »
// ═══════════════════════════════════════════════════════════════════════════
// Ces demandes sont arrivées boutique fermée : ce ne sont pas des rendez-vous
// qu'il a déjà, ce sont des rendez-vous qu'il a perdus.
verifier('le soir est mentionné', /19h/.test(phraseHorsOuverture({ soir: 4, weekend: 0 })))
verifier('le week-end est mentionné', /week-end/.test(phraseHorsOuverture({ soir: 0, weekend: 3 })))
verifier('les deux ensemble', /19h.*week-end/.test(phraseHorsOuverture({ soir: 4, weekend: 3 })))
// Une seule demande en soirée est une anecdote, pas un argument.
verifier('une seule demande ne fait pas un argument', phraseHorsOuverture({ soir: 1, weekend: 0 }) === null)
verifier('aucune demande hors ouverture', phraseHorsOuverture({ soir: 0, weekend: 0 }) === null)
verifier('entrée vide ne casse pas', phraseHorsOuverture() === null)

// ═══════════════════════════════════════════════════════════════════════════
// 3. QUAND PARLE-T-ON ? — on ne parle que si le nombre parle
// ═══════════════════════════════════════════════════════════════════════════
const actif = { signaux_seuil_alerte: 5, signaux_email_actif: true }
const stats = [
  { type: 'rdv', trente_jours: 12, total: 20 },
  { type: 'commande', trente_jours: 3, total: 8 },
]

let r = enviesAAlerter(stats, actif)
verifier('on alerte quand le seuil est franchi', r.alerter)
egal('seuls les types au-dessus du seuil sont retenus', r.types.map(t => t.type), ['rdv'])

egal('sous le seuil, silence', enviesAAlerter([{ type: 'rdv', trente_jours: 4 }], actif).alerter, false)
egal('aucune envie, silence', enviesAAlerter([], actif).alerter, false)

// Les types retenus sont triés du plus demandé au moins demandé : l'email doit
// commencer par ce qui frappe le plus.
r = enviesAAlerter([
  { type: 'commande', trente_jours: 6 },
  { type: 'rdv', trente_jours: 15 },
], actif)
egal('le plus demandé en premier', r.types.map(t => t.type), ['rdv', 'commande'])

// LE DROIT DE DIRE NON. Un signal qui ne convertit jamais devient du bruit.
egal('emails coupés', enviesAAlerter(stats, { ...actif, signaux_email_actif: false }).alerter, false)
egal('seuil à zéro = jamais', enviesAAlerter(stats, { ...actif, signaux_seuil_alerte: 0 }).alerter, false)

const dansUnMois = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
egal('pause respectée', enviesAAlerter(stats, { ...actif, signaux_email_pause_jusqu: dansUnMois }).alerter, false)
const ilYaUnMois = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
egal('pause expirée = on reparle', enviesAAlerter(stats, { ...actif, signaux_email_pause_jusqu: ilYaUnMois }).alerter, true)

// Un commerçant sans réglage explicite doit avoir un comportement sûr : le
// seuil par défaut de 5 s'applique, on ne le spamme pas.
egal('seuil par défaut appliqué', enviesAAlerter([{ type: 'rdv', trente_jours: 4 }], { signaux_email_actif: true }).alerter, false)
egal('seuil par défaut franchi', enviesAAlerter([{ type: 'rdv', trente_jours: 5 }], { signaux_email_actif: true }).alerter, true)

// ═══════════════════════════════════════════════════════════════════════════
// 4. LE RYTHME — jamais le même message tous les jours
// ═══════════════════════════════════════════════════════════════════════════
verifier('premier email autorisé', peutEnvoyerEmail({}))
const hier = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
verifier('pas deux jours de suite', !peutEnvoyerEmail({ signaux_email_le: hier }))
const ilYaHuitJours = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()
verifier('après une semaine, on peut reparler', peutEnvoyerEmail({ signaux_email_le: ilYaHuitJours }))

// ═══════════════════════════════════════════════════════════════════════════
// 5. L'ÉCRAN — le tableau de bord tient la même ligne que les libellés
// ═══════════════════════════════════════════════════════════════════════════
// Les libellés de lib/signaux.js sont propres, mais rien n'empêchait quelqu'un
// d'écrire « passe à la formule Vendre » directement dans le JSX de l'onglet.
// On lit donc la source du composant, la seule chose qui compte à l'écran.
const dashboard = readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8')
const onglet = dashboard.slice(
  dashboard.indexOf('function TabEnvies'),
  dashboard.indexOf('function TabSignalements'),
)
verifier('l\'onglet Envies existe dans le tableau de bord', onglet.length > 500)

// Les commentaires du fichier EXPLIQUENT la règle en citant ce qu'il ne faut
// pas écrire : on ne teste donc que les chaînes affichées.
const affiche = onglet
  .split('\n')
  .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n')
for (const interdit of ['formule', 'abonnement', 'Vendre', 'Communiquer', 'passe à', 'débloquer', 'upgrade']) {
  verifier(`l'onglet ne vend pas : « ${interdit} » absent`, !new RegExp(interdit, 'i').test(affiche))
}
// Le commerçant ne doit jamais pouvoir remonter à une personne : aucun champ
// nominatif ne doit apparaître dans l'écran.
for (const perso of ['client_id', 'yopper_id', 'prenom', 'telephone']) {
  verifier(`RGPD : l'onglet ne lit pas ${perso}`, !new RegExp(`\\b${perso}\\b`).test(affiche))
}
// « email » seul est légitime (le réglage d'envoi s'appelle ainsi) ; ce qu'on
// interdit, c'est de LIRE une adresse dans les données affichées.
verifier('RGPD : aucune adresse lue', !/\.email\b|email_client|client\.email/.test(affiche))
// Le droit de dire non doit rester atteignable depuis l'écran.
verifier('le réglage du seuil est présent', /seuil/.test(affiche))
verifier('l\'interrupteur email est présent', /email_actif/.test(affiche))
verifier('la pause est présente', /pause_mois/.test(affiche))
// L'onglet principal a bien été renommé, sinon les envies resteraient cachées
// derrière un mot qui ne les annonce pas.
verifier('l\'onglet s\'appelle Signaux', /id: 'signaux', label: 'Signaux'/.test(dashboard))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Signaux verts.')
