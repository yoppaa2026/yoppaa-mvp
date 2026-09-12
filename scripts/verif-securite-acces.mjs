// Banc des ACCÈS : qui a le droit de déclencher quoi (audit du 12/09/2026).
//
// 🔴 CE QU'IL A TROUVÉ EN NAISSANT. Les DIX tâches planifiées laissaient passer
// quand `CRON_SECRET` était absente. Deux écritures, un seul défaut :
//
//     if (!secret) return true
//     if (secret && entete !== `Bearer ${secret}`)
//
// Et ces routes sont les seules que `proxy.js` exclut du compteur de requêtes,
// à juste titre puisque Vercel les appelle lui-même. Une adresse ouverte y était
// donc une adresse ouverte SANS BORNE, à un nom qui se devine du premier coup
// (`/api/cron/morning-yoppers` écrit à tous les Yoppers, `expire-reservations`
// annule des réservations, `stripe-frais` touche à l'argent).
//
// CE QUE CE BANC PROTÈGE :
//   1. la garde des crons s'EXÉCUTE : sans secret elle refuse, mauvais secret
//      elle refuse, bon secret elle laisse passer, et elle ne recopie jamais le
//      secret dans sa réponse ;
//   2. les dix routes l'utilisent, et aucune ne relit le secret à la main ;
//   3. ce que `vercel.json` planifie existe et est gardé (la parité, pas la
//      bonne volonté) ;
//   4. l'exclusion du compteur dans `proxy.js` ne vaut que tant que la garde
//      existe : les deux se vérifient ensemble, jamais l'une sans l'autre ;
//   5. l'identité Yopper refuse de se signer sans secret ;
//   6. la clé de service ne descend JAMAIS dans un fichier du navigateur, et
//      aucune clé n'est écrite en dur.
//
// ⚠️ TOUT CE QUI PEUT S'EXÉCUTER S'EXÉCUTE. Les gardes de structure ne servent
// qu'à ce qui ne tourne pas hors Next (les routes elles-mêmes, qui ont besoin
// d'une requête HTTP et d'une base).
//
//   npm run verif:acces-api

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { sansProse } from './lire-code.mjs'
import { gardeCron, refusCron } from '../lib/cron-auth.js'
import { encoderIdentite, identiteDepuisValeur } from '../lib/yopper-signature.js'
import {
  sonderCompteur, verdictCompteur, surveillerCompteur, SONDE_PLAFOND,
} from '../lib/sonde-compteur.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

const lire = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8')
const code = (chemin) => sansProse(lire(chemin))

// Fausse requête : seule la lecture d'en-tête compte pour une garde.
const requete = (entetes = {}) => ({
  headers: {
    get: (nom) => {
      const cle = Object.keys(entetes).find(k => k.toLowerCase() === String(nom).toLowerCase())
      return cle ? entetes[cle] : null
    },
  },
})

// Faux NextResponse : on veut lire le statut ET le corps rendus.
const FauxResponse = {
  json: (corps, init) => ({ corps, status: init?.status }),
}

// ⚠️ TOUT PASSE PAR ICI, ET C'EST DÉLIBÉRÉ. Une mutation doit faire ROUGIR ce
// banc, jamais l'interrompre : si `gardeCron` se met à JETER (par exemple en
// retirant la comparaison de longueurs, `timingSafeEqual` jette alors sur deux
// tailles différentes), un appel nu ferait tomber le banc entier et on lirait
// « plantage » là où il faut lire « garde cassée ». Une exception devient donc
// un verdict défavorable ordinaire.
const garde = (entetes) => {
  try {
    return gardeCron(requete(entetes), 'banc')
  } catch (e) {
    return { ok: false, status: 500, exception: e?.message || String(e) }
  }
}

const SECRET = 'un-secret-de-banc-0123456789'
const secretInitial = process.env.CRON_SECRET

// ─── 1. La garde des crons, exécutée ────────────────────────────────────────

process.env.CRON_SECRET = SECRET

egal('bon secret : accepté',
  garde({ authorization: `Bearer ${SECRET}` }), { ok: true })

verifier('mauvais secret : refusé en 401',
  garde({ authorization: 'Bearer pas-le-bon-secret-du-tout' }).status === 401)

verifier('aucun en-tête : refusé en 401',
  garde({}).status === 401)

verifier('en-tête vide : refusé en 401',
  garde({ authorization: '' }).status === 401)

// ⚠️ LE PRÉFIXE « Bearer » N'EST PAS UNE SÉCURITÉ, C'EST UNE FORME. Le secret
// nu est donc accepté, comme le fait déjà `utilisateurAppelant` dans
// lib/api-auth.js ; ce qui garde, c'est de CONNAÎTRE le secret. La première
// version de cette ligne exigeait le mot et a rougi : elle mesurait l'écriture
// d'hier au lieu de la règle. Ce qui compte se vérifie juste en dessous.
verifier('le secret nu, sans le mot Bearer, est accepté',
  garde({ authorization: SECRET }).ok === true)
verifier('… mais un mauvais secret nu reste refusé',
  garde({ authorization: 'pas-le-bon-secret-du-tout-non' }).status === 401)

verifier('secret tronqué : refusé (longueurs différentes)',
  garde({ authorization: `Bearer ${SECRET.slice(0, -1)}` }).status === 401)

verifier('secret rallongé : refusé',
  garde({ authorization: `Bearer ${SECRET}x` }).status === 401)

// ⚠️ Sans la comparaison de longueurs, `timingSafeEqual` JETTE sur deux tailles
// différentes : la route rendrait un 500 au lieu d'un refus, et une exception
// non attrapée dans une tâche est une tâche qui ne tourne plus.
verifier('longueurs différentes : un refus, jamais une exception',
  garde({ authorization: 'Bearer x' }).status === 401)

verifier('le mot Bearer est insensible à la casse',
  garde({ authorization: `bearer ${SECRET}` }).ok === true)

verifier('les espaces autour du jeton sont tolérés',
  garde({ authorization: `Bearer   ${SECRET}   ` }).ok === true)

// 🔴 LA RÈGLE QUI A MOTIVÉ TOUT LE LOT : pas de secret, pas de tâche.
process.env.CRON_SECRET = ''
verifier('CRON_SECRET absente : REFUS, et non passage',
  garde({ authorization: `Bearer ${SECRET}` }).ok === false)
verifier('CRON_SECRET absente : 503, qui dit « mal configuré », pas 401',
  garde({}).status === 503)
delete process.env.CRON_SECRET
verifier('CRON_SECRET jamais définie : refus aussi',
  garde({ authorization: 'Bearer peu importe' }).ok === false)

// Le secret ne doit jamais ressortir dans ce qu'on renvoie au demandeur.
process.env.CRON_SECRET = SECRET
const corpsRefus = JSON.stringify(refusCron(garde({ authorization: 'Bearer faux' }), FauxResponse))
verifier('le refus ne recopie jamais le secret', !corpsRefus.includes(SECRET))

egal('refusCron laisse passer un verdict favorable',
  refusCron({ ok: true }, FauxResponse), null)
verifier('refusCron rend le statut du verdict',
  refusCron({ ok: false, status: 503, error: 'x' }, FauxResponse).status === 503)

process.env.CRON_SECRET = secretInitial
if (secretInitial === undefined) delete process.env.CRON_SECRET

// ─── 2. Les dix routes portent la garde partagée ────────────────────────────

const DOSSIER_CRON = 'app/api/cron'
const routesCron = readdirSync(new URL('../' + DOSSIER_CRON, import.meta.url), { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => `${DOSSIER_CRON}/${e.name}/route.js`)

verifier('les tâches planifiées sont bien au nombre de dix', routesCron.length === 10,
  `trouvé ${routesCron.length}`)

for (const chemin of routesCron) {
  const src = code(chemin)
  const nom = chemin.split('/')[3]
  // ⚠️ ON EXIGE L'IMPORT **ET** L'APPEL. Chercher le seul nom laisserait passer
  // une route dont l'import a disparu : `no-undef` est éteint ici, le build ne
  // dit rien, et la route casserait à l'exécution. Leçon de sonde-gardes-api.
  verifier(`${nom} : importe la garde partagée`, /from '@\/lib\/cron-auth'/.test(src))
  verifier(`${nom} : appelle gardeCron`, /gardeCron\s*\(/.test(src))
  verifier(`${nom} : rend le refus`, /refusCron\s*\(/.test(src))
  // 🔴 LE DÉFAUT D'ORIGINE : relire le secret soi-même, c'est réécrire la garde.
  verifier(`${nom} : ne relit pas CRON_SECRET à la main`, !/process\.env\.CRON_SECRET/.test(src))
}

// ─── 3. Parité avec ce que Vercel planifie ──────────────────────────────────

const planifies = JSON.parse(lire('vercel.json')).crons.map(c => c.path)
for (const chemin of planifies) {
  const fichier = `app${chemin}/route.js`.replace('app/api', 'app/api')
  verifier(`planifié ${chemin} : la route existe`, routesCron.includes(fichier), fichier)
}
verifier('aucune tâche planifiée ne manque à l\'appel',
  routesCron.every(r => planifies.includes('/' + r.replace('app/', '').replace('/route.js', ''))))

// ─── 4. L'exclusion du compteur ne vaut que gardée ──────────────────────────

const proxy = code('proxy.js')
verifier('le proxy exclut toujours les crons du compteur', /\/api\/cron\//.test(proxy))
// ⚠️ CETTE LIGNE EST LE LIEN. Si l'exclusion existe, la garde DOIT exister :
// c'est cette combinaison qui a produit le trou, pas l'une des deux seule.
verifier('… et c\'est la garde partagée qui justifie cette exclusion',
  routesCron.every(r => /gardeCron\s*\(/.test(code(r))))

// ─── 5. L'identité Yopper refuse de se signer sans secret ───────────────────

const envInitial = {
  y: process.env.YOPPER_COOKIE_SECRET,
  s: process.env.SUPABASE_SERVICE_ROLE_KEY,
}
process.env.YOPPER_COOKIE_SECRET = 'secret-de-cookie-du-banc'
const signe = encoderIdentite({ email: 'jean@exemple.be', client_id: 'abc' })
verifier('avec un secret : le cookie est signé', typeof signe === 'string' && signe.includes('.'))
const signeAutre = encoderIdentite({ email: 'jean@exemple.be', client_id: 'AUTRE' })
verifier('changer le contenu change la signature',
  signe.split('.')[1] !== signeAutre.split('.')[1])

// L'aller-retour : ce qu'on pose se relit à l'identique.
egal('un cookie signé se relit',
  identiteDepuisValeur(signe), { email: 'jean@exemple.be', client_id: 'abc' })

// 🔴 LE GESTE QUE LA SIGNATURE EXISTE POUR INTERDIRE : reprendre le contenu
// d'un autre en gardant une signature qui n'est pas la sienne.
const contenuVole = Buffer.from(JSON.stringify({ email: 'victime@exemple.be', client_id: 'zzz' }), 'utf8').toString('base64url')
egal('un contenu remplacé est refusé',
  identiteDepuisValeur(`${contenuVole}.${signe.split('.')[1]}`), null)
egal('une signature inventée est refusée',
  identiteDepuisValeur(`${signe.split('.')[0]}.jesuisunesignature`), null)
egal('un cookie sans signature (ancien format) est refusé',
  identiteDepuisValeur(contenuVole), null)
egal('une valeur vide est refusée', identiteDepuisValeur(''), null)
egal('une identité sans email ni identifiant est refusée',
  identiteDepuisValeur(encoderIdentite({ prenom: 'Jean' })), null)

// Un secret différent ne doit jamais valider une signature d'un autre secret.
process.env.YOPPER_COOKIE_SECRET = 'un-autre-secret-completement'
egal('changer le secret invalide les cookies déjà posés',
  identiteDepuisValeur(signe), null)
process.env.YOPPER_COOKIE_SECRET = 'secret-de-cookie-du-banc'

// 🔴 `createHmac` accepte une clé VIDE sans broncher : la signature resterait
// calculable par tout le monde, donc le cookie redeviendrait falsifiable.
delete process.env.YOPPER_COOKIE_SECRET
delete process.env.SUPABASE_SERVICE_ROLE_KEY
egal('sans aucun secret : aucun cookie signé n\'est fabriqué',
  encoderIdentite({ email: 'jean@exemple.be' }), null)

process.env.YOPPER_COOKIE_SECRET = envInitial.y
process.env.SUPABASE_SERVICE_ROLE_KEY = envInitial.s
if (envInitial.y === undefined) delete process.env.YOPPER_COOKIE_SECRET
if (envInitial.s === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY

const session = code('app/api/yopper/session/route.js')
verifier('la route de session refuse de poser un cookie non signable',
  /if \(!encoded\)/.test(session) && /503/.test(session))

// ─── 5 bis. La sonde du compteur de requêtes, exécutée ──────────────────────
//
// 🔴 LE DANGER N'EST PAS LA PANNE, C'EST LE SILENCE. Le compteur est fail-open
// par choix : quand Upstash ne répond plus, tout continue de marcher et plus
// personne n'est limité. Cette sonde pose la question tous les matins, et
// n'écrit QUE si la réponse est mauvaise.

// Faux compteurs : on veut éprouver la règle, pas le réseau.
const limiteurQuiCompte = (plafond) => {
  const vus = new Map()
  return { limit: async (cle) => {
    const n = (vus.get(cle) || 0) + 1
    vus.set(cle, n)
    return { success: n <= plafond }
  } }
}
const limiteurOuvert = { limit: async () => ({ success: true }) }
const limiteurQuiJette = { limit: async () => { throw new Error('upstash injoignable') } }

const constatSain = await sonderCompteur(limiteurQuiCompte(SONDE_PLAFOND))
verifier('compteur sain : le dernier essai est refusé', constatSain.compte === true)
verifier('compteur sain : le filet local n\'a pas servi', constatSain.viaRepliLocal === false)
egal('compteur sain : on tire bien un essai de plus que le plafond',
  constatSain.tirages, SONDE_PLAFOND + 1)
egal('compteur sain : aucune alerte', verdictCompteur(constatSain).alerte, false)

// 🔴 LE CAS QUI A MOTIVÉ TOUT CECI : plus rien ne borne quoi que ce soit.
const constatOuvert = await sonderCompteur(limiteurOuvert)
verifier('compteur muet : le dernier essai passe encore', constatOuvert.compte === false)
egal('compteur muet : alerte levée', verdictCompteur(constatOuvert).alerte, true)
egal('compteur muet : la cause est nommée', verdictCompteur(constatOuvert).cause, 'aucune_limite')

// Upstash tombe : le filet local prend le relais, mais il ne vaut que pour une
// instance. C'est une panne, même si « ça bloque encore ».
const constatRepli = await sonderCompteur(limiteurQuiJette)
verifier('compteur partagé en panne : le filet local a servi', constatRepli.viaRepliLocal === true)
egal('compteur partagé en panne : alerte levée', verdictCompteur(constatRepli).alerte, true)
egal('compteur partagé en panne : cause distincte du cas precedent',
  verdictCompteur(constatRepli).cause, 'partage_muet')

// ⚠️ Une sonde qui jette ferait tomber la tâche qui l'héberge.
verifier('la sonde ne jette jamais, même sans compteur du tout',
  (await sonderCompteur(null)) !== null)
egal('aucun constat du tout : on alerte plutôt que de se taire',
  verdictCompteur(null).alerte, true)

// La surveillance complète : qui reçoit un email, et quand.
const boite = []
const fauxEnvoi = async (message) => { boite.push(message); return { ok: true } }

const r1 = await surveillerCompteur({ limiteur: limiteurQuiCompte(SONDE_PLAFOND), envoyerAuAdmin: fauxEnvoi })
egal('tout va bien : AUCUN email', boite.length, 0)
egal('tout va bien : pas d\'alerte', r1.alerte, false)

const r2 = await surveillerCompteur({ limiteur: limiteurOuvert, envoyerAuAdmin: fauxEnvoi })
egal('compteur muet : un email, un seul', boite.length, 1)
egal('compteur muet : alerte rendue a l appelant', r2.alerte, true)
verifier('l\'email dit ce qui ne va pas dans son objet', /compteur|limite/i.test(boite[0]?.subject || ''))
verifier('l\'email explique la conséquence',
  /force brute|brute/i.test(boite[0]?.html || ''))
verifier('l\'email dit qu\'il ne part que quand ça va mal',
  /ne part QUE/i.test(boite[0]?.html || ''))
// ⚠️ Gmail Android jette les dégradés : un fond doit être une couleur pleine.
verifier('l\'email n\'utilise aucun dégradé de fond',
  !/linear-gradient/i.test(boite[0]?.html || ''))

// ⚠️ UN ENVOI QUI ÉCHOUE NE DOIT PAS FAIRE TOMBER LE CRON QUI L'HÉBERGE.
const envoiQuiJette = async () => { throw new Error('resend KO') }
const r3 = await surveillerCompteur({ limiteur: limiteurOuvert, envoyerAuAdmin: envoiQuiJette })
verifier('un envoi en échec ne remonte pas en exception', r3 && r3.alerte === null)

// Parité : le plafond de la sonde doit être celui du limiteur qu'elle interroge.
const codeRatelimit = code('lib/ratelimit.js')
verifier('le plafond de la sonde est celui de bonsLimiter',
  new RegExp(`bonsLimiter\\s*=\\s*makeLimiter\\(Ratelimit\\.slidingWindow\\(${SONDE_PLAFOND},`).test(codeRatelimit))

// Le cron porte la sonde, APRÈS ses envois, et la route admin ne recompte plus.
const cronRecap = code('app/api/cron/recap-jour-8h/route.js')
verifier('le récapitulatif du matin porte la sonde', /surveillerCompteur\s*\(/.test(cronRecap))
verifier('… et elle vient APRÈS l\'envoi aux commerçants',
  cronRecap.indexOf('surveillerCompteur(') > cronRecap.indexOf('envoyerAuCommercant('))
const diagAdmin = code('app/api/admin/diagnostic-ratelimit/route.js')
verifier('le diagnostic admin partage la même sonde', /sonderCompteur\s*\(/.test(diagAdmin))
// 🔴 LA GARDE ANTI-DIVERGENCE : deux boucles qui prétendent mesurer la même
// chose finissent par ne plus dire la même chose.
verifier('le diagnostic admin n\'a plus sa propre boucle de tirages',
  !/for\s*\(\s*let\s+i\s*=\s*0;\s*i\s*<\s*11/.test(diagAdmin))

// ─── 6. La clé de service ne descend jamais dans le navigateur ──────────────

function parcourir(dossier, acc = []) {
  let entrees = []
  try { entrees = readdirSync(dossier, { withFileTypes: true }) } catch { return acc }
  for (const e of entrees) {
    const p = join(dossier, e.name).replace(/\\/g, '/')
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    if (e.isDirectory()) parcourir(p, acc)
    else if (/\.(js|jsx|ts|tsx|mjs)$/.test(e.name)) acc.push(p)
  }
  return acc
}

const sources = [...parcourir('app'), ...parcourir('lib')]
verifier('le parcours des sources a bien trouvé des fichiers', sources.length > 100,
  `${sources.length} fichiers`)

const clientsAvecCleService = sources.filter(p => {
  const brut = readFileSync(p, 'utf8')
  const estClient = /^\s*['"]use client['"]/.test(brut)
  return estClient && /SUPABASE_SERVICE_ROLE_KEY/.test(sansProse(brut))
})
egal('aucun fichier du navigateur ne touche à la clé de service', clientsAvecCleService, [])

// Une clé écrite en dur : on cherche une vraie valeur, pas les mentions de
// préfixe qui peuplent légitimement les commentaires et les tests de mode.
const enDur = sources.filter(p => /(sk_live_|sk_test_|whsec_)[A-Za-z0-9]{12,}/.test(sansProse(readFileSync(p, 'utf8'))))
egal('aucune clé Stripe écrite en dur dans le code', enDur, [])

const jwtEnDur = sources.filter(p => /eyJhbGciOi[A-Za-z0-9_-]{20,}/.test(sansProse(readFileSync(p, 'utf8'))))
egal('aucun jeton Supabase écrit en dur dans le code', jwtEnDur, [])

// ─── Verdict ────────────────────────────────────────────────────────────────

console.log(`\nBanc des accès : ${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉchecs :')
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Les tâches planifiées, l\'identité Yopper et les clés sont gardées.')
