// Banc du côté YOPPER : ce que l'habitant voit et reçoit.
//
// Monté le 05/08 après quatre signalements d'Alex qui avaient tous la même
// racine : du code qui échoue en SILENCE. Une carte de fidélité qui n'apparaît
// jamais, un profil vide, un badge qui promet du vide, un SMS à 3h du matin.
// Aucun de ces défauts ne produit d'erreur, ni au build, ni au lint, ni dans
// les journaux : seul un test qui interroge l'INTENTION les attrape.

import { readFileSync } from 'node:fs'
import { heureDecente } from '../lib/fidelite-sms.js'
import {
  extraireCodePostal,
  commercantEligibleDeal,
  commercantEligibleActu,
  codesPostauxDe,
} from '../lib/morning-eligibilite.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE COOKIE YOPPER — la panne silencieuse qui a duré deux jours
// ═══════════════════════════════════════════════════════════════════════════
// Le durcissement du 03/08 a signé le cookie. Quatre routes ont continué à
// décoder l'ANCIEN format en base64 nu : elles ne renvoyaient plus jamais
// d'identité, sans lever la moindre erreur. Résultat côté Alex : sa carte de
// fidélité invisible sur la fiche ET dans son profil.
//
// Ce test interdit qu'une route relise un cookie à la main. C'est la seule
// façon d'empêcher la prochaine route de refaire exactement la même chose.
const ROUTES_IDENTITE = [
  'app/api/fidelite/mes-cartes/route.js',
  'app/api/yopper/client/route.js',
  'app/api/yopper/sync-tags/route.js',
  'app/api/commande/ignore-avis/route.js',
  'app/api/yopper/commandes/route.js',
  'app/api/rdv/mes-rdvs/route.js',
]
for (const chemin of ROUTES_IDENTITE) {
  const src = lire(chemin)
  const ligneCode = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  verifier(`${chemin.split('/').slice(-2)[0]} ne décode plus le cookie à la main`,
    !/Buffer\.from\([^)]*'base64'\)/.test(ligneCode))
  verifier(`${chemin.split('/').slice(-2)[0]} passe par lib/yopper-auth ou yopper-session`,
    /identiteProuvee|identiteYopper|lireIdentiteYopper/.test(ligneCode))
}

// L'appelant doit envoyer le jeton, sinon la route la mieux écrite du monde ne
// verra jamais personne. C'est la moitié du bug qu'on aurait pu manquer.
for (const chemin of ['app/commander/[slug]/page.js', 'app/commander/rdv/[slug]/page.js', 'app/commander/page.js']) {
  const src = lire(chemin)
  verifier(`${chemin} appelle mes-cartes avec le jeton`,
    src.includes("fetchYopper('/api/fidelite/mes-cartes'"))
  verifier(`${chemin} n'appelle plus mes-cartes sans jeton`,
    !src.includes("fetch('/api/fidelite/mes-cartes'"))
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE SMS DE FIDÉLITÉ — jamais la nuit, jamais sans signature
// ═══════════════════════════════════════════════════════════════════════════
// Un SMS de fidélité annonce 55 centimes. Rien ne justifie de réveiller
// quelqu'un pour ça.
const aHeure = (h) => new Date(`2026-08-05T${String(h).padStart(2, '0')}:30:00+02:00`)
verifier('3h du matin : on n\'écrit pas', !heureDecente(aHeure(3)))
verifier('6h : trop tôt', !heureDecente(aHeure(6)))
verifier('8h : on peut', heureDecente(aHeure(8)))
verifier('midi : on peut', heureDecente(aHeure(12)))
verifier('20h : on peut encore', heureDecente(aHeure(20)))
verifier('21h : trop tard', !heureDecente(aHeure(21)))
verifier('23h : trop tard', !heureDecente(aHeure(23)))

const sms = lire('lib/fidelite-sms.js')
const smsCode = sms.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
// L'emoji est arrivé chez Alex sous forme de « ? » : l'alphabet GSM ne le
// connaît pas. Un SMS qui finit par un point d'interrogation à la place de la
// signature fait douter de l'expéditeur, sur le canal le plus méfiant qui soit.
verifier('aucun emoji dans le contenu des SMS',
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(smsCode))
verifier('les SMS sont signés Yoppaa', /const SIGNATURE = 'Yoppaa'/.test(smsCode))
verifier('les deux SMS portent la signature',
  (smsCode.match(/\$\{SIGNATURE\}/g) || []).length >= 2)
verifier('la garde horaire est branchée sur l\'envoi', /if \(!heureDecente\(\)\) return/.test(smsCode))
// Quelqu'un qui a un compte a déjà sa carte dans l'application : lui envoyer un
// SMS payé par le commerçant ne lui apprend rien.
verifier('pas de SMS de bienvenue à qui a un compte', /aUnCompte\(supabase, clientEmail\)/.test(smsCode))
// Celui de récompense part quand même : le push web n'arrive pas partout.
const blocRecompense = smsCode.slice(smsCode.indexOf('smsRecompenseDebloquee'))
verifier('le SMS de récompense n\'est PAS filtré par le compte', !/aUnCompte/.test(blocRecompense))

// Le cron qui a réveillé Alex ne doit plus tourner la nuit.
const vercel = JSON.parse(lire('vercel.json'))
const cronFid = vercel.crons.find(c => c.path.includes('fidelite-rdv'))
verifier('le cron fidélité existe toujours', !!cronFid)
const heureCron = Number(cronFid.schedule.split(' ')[1])
verifier('le cron fidélité tourne en journée (UTC+2 en été)',
  heureCron >= 6 && heureCron <= 18, `${cronFid.schedule}`)

// ═══════════════════════════════════════════════════════════════════════════
// 3. LE BADGE « NOUVEAU » DU GOOD MORNING — ne promettre que ce qui existe
// ═══════════════════════════════════════════════════════════════════════════
const cp = codesPostauxDe({ codes_postaux: ['5640', '5641'] })
const PUBLIE_VENDRE = { statut_publication: 'publie', plan: 'vendre', adresse: 'Rue du Moulin 12, 5640 Mettet' }

verifier('un commerçant publié de la commune passe', commercantEligibleDeal(PUBLIE_VENDRE, cp))
verifier('un commerçant non publié ne passe pas',
  !commercantEligibleDeal({ ...PUBLIE_VENDRE, statut_publication: 'brouillon' }, cp))
verifier('une autre commune ne passe pas',
  !commercantEligibleDeal({ ...PUBLIE_VENDRE, adresse: 'Rue Neuve 1, 1000 Bruxelles' }, cp))
verifier('le palier gratuit n\'a pas les deals',
  !commercantEligibleDeal({ ...PUBLIE_VENDRE, plan: 'exister' }, cp))
// Mais il a bien droit à l'actu du Good Morning : c'est ce qui le fait exister.
verifier('le palier gratuit a l\'actu du Morning',
  commercantEligibleActu({ ...PUBLIE_VENDRE, plan: 'exister' }, cp))
verifier('une adresse sans code postal ne passe pas',
  !commercantEligibleActu({ ...PUBLIE_VENDRE, adresse: 'Grand-Place' }, cp))
verifier('un commerçant absent ne casse rien', !commercantEligibleDeal(null, cp))

// Les services publics ont été retirés du produit (09/08) : le Good Morning ne
// sert plus que des commerçants. On verrouille l'absence plutôt que de laisser
// le module revenir par une porte dérobée.
const morningLu = lire('lib/morning-contenu.js')
verifier('le Morning n\'interroge plus les services publics', !/services_publics/.test(morningLu))
verifier('la page Morning non plus',
  !/services_publics/.test(lire('app/commander/morning/page.js').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')))

egal('code postal extrait de l\'adresse', extraireCodePostal('Rue du Moulin 12, 5640 Mettet'), '5640')
egal('pas de code postal', extraireCodePostal('Grand-Place'), null)
egal('adresse absente', extraireCodePostal(null), null)

// Une commune sans code postal ne peut rien afficher : le badge doit rester
// éteint plutôt que de tenter une requête qui ramènerait tout le pays.
egal('commune vide = aucun code postal', codesPostauxDe(null).size, 0)

// Les règles ne doivent exister QU'À UN ENDROIT. La page Morning les
// recopiait ; le badge aurait fini par promettre ce qu'elle n'affiche pas.
const morning = lire('app/commander/morning/page.js')
verifier('la page Morning importe les règles partagées',
  /from '@\/lib\/morning-eligibilite'/.test(morning))
verifier('la page Morning ne redéfinit plus les règles',
  !/function commercantEligibleDeal\(/.test(morning))

// Le badge doit dépendre du contenu, pas seulement de la visite.
const accueil = lire('app/commander/page.js')
verifier('le badge croise « pas ouvert » ET « du contenu »',
  /const gmNonVu = gmPasOuvert && gmADuContenu/.test(accueil))
verifier('le contenu du Morning est bien interrogé',
  /morningADuContenu\(supabase, commune\)/.test(accueil))

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES EUROS S'ÉCRIVENT AVEC UNE VIRGULE
// ═══════════════════════════════════════════════════════════════════════════
// « 0.55 € » s'affichait sur la carte de fidélité, l'écran le plus regardé du
// programme.
const carte = lire('app/carte/[token]/page.js')
verifier('la carte formate les euros à la française', /replace\('\.', ','\)/.test(carte))
verifier('plus de toFixed nu suivi d\'un euro', !/toFixed\(2\)\} €/.test(carte))

// ═══════════════════════════════════════════════════════════════════════════
// 5. BONS CADEAUX ET FIDÉLITÉ — chaque euro compte UNE fois
// ═══════════════════════════════════════════════════════════════════════════
const { montantFidelisable } = await import('../lib/fidelite.js')

// Une commande ordinaire : tout compte.
egal('commande sans bon', montantFidelisable({ total: 24.50 }), 24.50)
// Une commande partiellement réglée par un bon : seule la part sortie de la
// poche compte. Le reste a déjà rempli la carte de celui qui a acheté le bon.
egal('bon partiel', montantFidelisable({ total: 50, bon_cadeau_montant: 20 }), 30)
// Entièrement payée par un bon : rien de plus n'est dépensé ce jour-là. Sans
// cette règle, s'offrir un bon à soi-même doublait la cagnotte.
egal('bon total', montantFidelisable({ total: 50, bon_cadeau_montant: 50 }), 0)
egal('bon plus grand que la commande', montantFidelisable({ total: 30, bon_cadeau_montant: 50 }), 0)
egal('montant absent', montantFidelisable({}), 0)
egal('commande absente', montantFidelisable(), 0)
egal('centimes justes', montantFidelisable({ total: 10.05, bon_cadeau_montant: 3.33 }), 6.72)
egal('bon négatif ignoré', montantFidelisable({ total: 10, bon_cadeau_montant: -5 }), 10)

// Les trois chemins de crédit doivent tous passer par cette règle, sinon le
// double comptage revient par celui qu'on a oublié.
for (const chemin of ['app/api/fidelite/crediter/route.js', 'app/api/yopper/commandes/route.js']) {
  const src = lire(chemin)
  verifier(`${chemin} déduit la part payée en bon`, /montantFidelisable\(/.test(src))
  verifier(`${chemin} ne crédite plus le total brut`, !/montant: Number\((cmd|full)\.total \|\| 0\)/.test(src))
  verifier(`${chemin} lit bien le montant du bon`, /bon_cadeau_montant/.test(src))
}

// L'achat d'un bon cadeau doit remplir la carte de l'ACHETEUR.
const webhook = lire('app/api/stripe/webhook/route.js')
const bloc = webhook.slice(webhook.indexOf('async function handleBonCadeauSucceeded'))
verifier('l\'achat d\'un bon crédite la fidélité', /crediterFidelite\(/.test(bloc))
verifier('c\'est l\'acheteur qui est crédité', /acheteur_email/.test(bloc))
verifier('le crédit porte la référence du bon', /bon_cadeau_id: bon\.id/.test(bloc))
// Un bon s'achète en ligne : aucune visite, donc aucun tampon.
verifier('mécanique passages : pas de tampon pour un bon',
  /fidelite_mecanique === 'cagnotte'/.test(bloc))
// Le rejeu d'un webhook Stripe ne doit jamais créditer deux fois.
const mouvements = lire('lib/fidelite-server.js')
verifier('le mouvement porte bon_cadeau_id', /bon_cadeau_id: refs\.bon_cadeau_id/.test(mouvements))
const migration = lire('migrations/MIGRATION_FIDELITE_BON_CADEAU.sql')
verifier('l\'index unique protège du rejeu', /CREATE UNIQUE INDEX.*uidx_fid_mvts_bon/s.test(migration))
verifier('la source bon_cadeau est autorisée', /'bon_cadeau'/.test(migration))

// ═══════════════════════════════════════════════════════════════════════════
// 6. LA LOCALISATION — on ne demande qu'une fois
// ═══════════════════════════════════════════════════════════════════════════
const { decisionGeoloc, DUREE_FRAICHE } = await import('../lib/geoloc.js')

egal('autorisation accordée : on lit sans déranger', decisionGeoloc({ etat: 'granted' }), 'lire')
egal('autorisation refusée : on se tait', decisionGeoloc({ etat: 'denied' }), 'jamais')
// Même refusée il y a longtemps, on ne relance pas : il l'a dit une fois.
egal('refus + déjà demandé : toujours silence', decisionGeoloc({ etat: 'denied', dejaDemande: true }), 'jamais')
egal('jamais demandé : on demande', decisionGeoloc({ etat: 'prompt' }), 'demander')
// C'EST LE BUG D'ALEX : sans ce cas, la fenêtre revenait à chaque ouverture.
egal('déjà demandé sans réponse : on ne relance pas', decisionGeoloc({ etat: 'prompt', dejaDemande: true }), 'jamais')
// Safari a longtemps ignoré l'API Permissions : sans état, même règle.
egal('sans API Permissions, première fois', decisionGeoloc({ etat: null }), 'demander')
egal('sans API Permissions, deuxième fois', decisionGeoloc({ etat: null, dejaDemande: true }), 'jamais')
egal('appel sans argument', decisionGeoloc(), 'demander')
verifier('une position se garde une demi-journée', DUREE_FRAICHE >= 6 * 3600 * 1000)

const accueil2 = lire('app/commander/page.js')
verifier('le démarrage passe par la décision', /geolocaliserAuDemarrage\(\)/.test(accueil2))
verifier('la position est mémorisée', /memoriserPosition\(/.test(accueil2))
// Le bouton « Utiliser ma position » doit rester un chemin direct : c'est le
// geste volontaire, il ne passe pas par la décision.
verifier('le bouton demande toujours', /demanderGeolocalisation\(\); setShowLocManuelle\(false\)/.test(accueil2))

// ⚠️ LA POSITION MÉMORISÉE NE DOIT JAMAIS EMPÊCHER DE RELIRE (Alex, 09/08 :
// « la localisation ne s'actualise plus »). Le correctif du 07/08, qui coupait
// la lecture quand le cache était frais, gelait la commune douze heures : le
// Yopper se déplaçait, l'application affichait la rue de la veille.
//
// C'était une prudence inutile : autorisation accordée = lecture SANS fenêtre.
// Seule la DEMANDE d'autorisation devait être protégée, et c'est le travail de
// `decisionGeoloc`, pas celui de la fraîcheur du cache.
verifier('une position fraîche ne bloque plus la relecture',
  !/decision === 'lire' && memo\?\.fraiche/.test(accueil2))
verifier('le rafraîchissement ne fait pas clignoter la rue affichée',
  /demanderGeolocalisation\(\{ silencieux: !!memo \}\)/.test(accueil2))
// Le mémorisé garde son rôle : afficher tout de suite, même hors ligne.
verifier('la dernière position s\'affiche sans attendre le satellite',
  /const memo = lirePositionMemorisee\(\)/.test(accueil2))

// ═══════════════════════════════════════════════════════════════════════════
// LES CGU DOIVENT DIRE CE QUE LE CODE FAIT (09/08)
// ═══════════════════════════════════════════════════════════════════════════
// Depuis le durcissement du 03/08, rien de personnel ne s'ouvre sans preuve de
// possession de la boîte mail. Les CGU, elles, annonçaient toujours un compte
// « facultatif » permettant de suivre ses commandes. Un texte contractuel qui
// promet un accès que le code refuse, ce n'est pas un détail de rédaction :
// c'est ce qu'on oppose à Yoppaa en cas de litige, et c'est aussi ce que les
// stores lisent au moment du dépôt.
const legal = lire('app/legal/page.js')
// On vise la SECTION, pas le sommaire : `id="…"` n'apparaît qu'une fois,
// alors que `href="#…"` du sommaire vient plus haut dans le fichier.
const cguClient = legal.slice(legal.indexOf('id="cgu-client"'), legal.indexOf('id="cgu-commercant"'))
verifier('les CGU client existent', cguClient.length > 2000)
// La commande sans compte reste possible : c'est la promesse de la landing.
verifier('les CGU maintiennent la commande sans compte',
  /sans créer de compte/.test(cguClient))
// Mais l'accès aux données personnelles exige la preuve.
verifier('les CGU conditionnent l\'accès aux données à la vérification',
  /vérification de l'adresse email|prouvé qu'on en est bien le titulaire/.test(cguClient))
verifier('les CGU citent le lien de connexion de l\'email de confirmation',
  /lien de connexion contenu dans l'email de confirmation/.test(cguClient))
// ⚠️ LA PHRASE QUI NE DOIT PLUS REVENIR : un compte présenté comme facultatif
// POUR SUIVRE SES COMMANDES. C'est précisément ce que le code ne permet plus.
verifier('les CGU ne présentent plus le compte comme facultatif pour le suivi',
  !/compte \(facultative\) permet de suivre/.test(cguClient))

// ─── CE QUE LES STORES EXIGENT ─────────────────────────────────────────────
// ⚠️ Motif de rejet classique : la politique de confidentialité DOIT être
// atteignable depuis l'APPLICATION, pas seulement depuis le site vitrine. Le
// lien n'existait que dans le pied de la landing.
for (const [ecran, chemin] of [['le Yopper', 'app/commander/page.js'], ['le commerçant', 'app/dashboard/page.js']]) {
  const src = lire(chemin)
  // Les liens sont construits depuis un tableau : on cherche la DESTINATION,
  // pas un attribut écrit en dur, sinon le test rougit alors que le lien existe.
  verifier(`${ecran} atteint la confidentialité depuis l'app`,
    /['"]\/legal#confidentialite['"]/.test(src))
  verifier(`${ecran} atteint ses conditions depuis l'app`,
    /['"]\/legal#cgu-(client|commercant)['"]/.test(src))
}

// ⚠️ Google Play exige une URL PUBLIQUE de demande de suppression de compte,
// utilisable sans installer l'application. L'ancre doit donc exister.
verifier('la suppression de compte a une adresse directe',
  /<H3 id="suppression-compte">/.test(legal))
verifier('elle décrit une voie hors application',
  /Sans passer par l'application/.test(legal))

// ⚠️ TOUT TIERS QUI REÇOIT DES DONNÉES DOIT ÊTRE DÉCLARÉ. Ce que le formulaire
// de sécurité des données de Google et les étiquettes de confidentialité
// d'Apple annoncent doit correspondre à ce que le code fait vraiment.
//
// LE TEST QUI COMPTE : on part du CODE, pas de la liste. Un service appelé
// quelque part et absent de la page fait rougir le banc.
const TIERS_DECLARABLES = [
  { nom: 'Nominatim', motif: /nominatim\.openstreetmap\.org/, attendu: /Nominatim/ },
  { nom: 'OpenRouteService', motif: /api\.openrouteservice\.org/, attendu: /OpenRouteService/ },
  { nom: 'Upstash', motif: /@upstash\/ratelimit/, attendu: /Upstash/ },
  { nom: 'Brevo', motif: /transactionalSMS/, attendu: /Brevo/ },
]
const codeComplet = ['lib/geocode.js', 'lib/brevo.js', 'lib/ratelimit.js',
  'app/api/distance/route.js', 'app/api/livraison/tournee-optimisee/route.js',
  'app/commander/page.js'].map(f => { try { return lire(f) } catch { return '' } }).join('\n')
for (const t of TIERS_DECLARABLES) {
  if (!t.motif.test(codeComplet)) continue   // service retiré du code : plus rien à déclarer
  verifier(`${t.nom} reçoit des données et figure dans la page légale`, t.attendu.test(legal))
}
// Brevo envoie AUSSI les SMS de fidélité : le décrire comme un simple outil
// d'emailing marketing annonce la mauvaise donnée et la mauvaise finalité.
verifier('Brevo est décrit pour les SMS, pas seulement pour les emails',
  /Brevo : SMS de service/.test(legal))
// La géolocalisation part directement de l'appareil du Yopper : ça se dit.
verifier('la page dit que la requête part de l\'appareil',
  /part directement de votre appareil/.test(legal))
verifier('la page rappelle qu\'on peut refuser la géolocalisation',
  /Refuser la géolocalisation reste possible/.test(legal))

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Côté Yopper vert.')
