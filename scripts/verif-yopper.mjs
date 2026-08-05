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
  servicePublicEligible,
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

verifier('un service public local passe', servicePublicEligible({ codes_postaux: ['5640'], national: false }, cp))
verifier('un service NATIONAL ne passe pas', servicePublicEligible({ codes_postaux: ['5640'], national: true }, cp) === false)
verifier('un service sans code postal ne passe pas', !servicePublicEligible({ codes_postaux: [], national: false }, cp))

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
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Côté Yopper vert.')
