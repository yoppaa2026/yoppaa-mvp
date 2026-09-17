// BANC DU MONDE D'UN COMPTE STRIPE (17/09).
//
// 🔴 CE QUI SE CASSE ICI NE SE VOIT NULLE PART. Le jour où la clé plateforme
// passe en `sk_live_`, chaque `stripe_account_id` créé en test pointe vers un
// compte qui n'existe pas. Le commerçant clique « Continuer l'onboarding », ça
// échoue en anglais, il reclique, ça échoue encore. Il ne peut PLUS JAMAIS se
// connecter, et rien ne remonte à Yoppaa.
//
// ⚠️ LE VERDICT NE S'INTERPRÈTE PAS. On ne lit aucun message d'erreur Stripe :
// on compare le monde noté à la naissance du compte et celui de la clé. Deux
// mots. C'est pour ça que ce banc peut tout mesurer sans réseau et sans Stripe.
//
// ⚠️ ET « INCONNU » EST UN VERDICT À PART ENTIÈRE. Un compte dont le monde n'a
// jamais été noté ne permet RIEN d'affirmer. Le confondre avec « ok » endort ;
// le confondre avec « perdu » détacherait un compte qui marche.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  MODE_TEST, MODE_LIVE, VERDICT, COLONNES_MODE,
  modeDeLaCle, modePlateforme, verdictCompte, comptePerdu,
  detachementCompte, naissanceCompte, messageCompte,
} from '../lib/stripe-mode.js'

const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const codeDe = (chemin) => sansProse(lire(chemin))

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

// ═══ 1) LE MONDE D'UNE CLÉ ═════════════════════════════════════════════════
{
  egal('une clé de test est reconnue', modeDeLaCle('sk_test_51ABCdef'), MODE_TEST)
  egal('une clé live est reconnue', modeDeLaCle('sk_live_51ABCdef'), MODE_LIVE)

  // 🔴 UNE CLÉ ABSENTE N'EST PAS UNE CLÉ DE PRODUCTION. C'est le défaut exact
  // de `isStripeTestMode()` : il rend `false` sans clé, donc « live », et
  // choisirait les tarifs de production sur une installation sans Stripe.
  egal('pas de clé, pas de verdict', modeDeLaCle(''), null)
  egal('clé absente, pas de verdict', modeDeLaCle(undefined), null)
  egal('clé nulle, pas de verdict', modeDeLaCle(null), null)
  egal('un objet n’est pas une clé', modeDeLaCle({ toString: () => 'sk_live_x' }), null)

  // ⚠️ LA CLÉ PUBLIABLE N'EST PAS LA CLÉ SECRÈTE. `pk_live_` traîne côté
  // navigateur ; la confondre ferait juger le mode sur une valeur publique.
  egal('la clé publiable ne décide de rien', modeDeLaCle('pk_live_51ABC'), null)
  // 🔴 CELUI-CI EST LE VRAI PIÈGE, et il manquait : chercher « test_ » quelque
  // part dans la chaîne au lieu de viser le préfixe ferait passer la clé
  // publiable pour la clé secrète. Trouvé par mutation, pas par relecture.
  egal('🔴 la clé publiable de test ne décide de rien non plus', modeDeLaCle('pk_test_51ABC'), null)
  egal('une clé restreinte ne décide de rien', modeDeLaCle('rk_live_51ABC'), null)
  egal('une clé restreinte de test non plus', modeDeLaCle('rk_test_51ABC'), null)
  egal('le mot « test » seul ne décide de rien', modeDeLaCle('une_cle_de_test_bidon'), null)
  egal('un préfixe tronqué ne décide de rien', modeDeLaCle('sk_'), null)
  egal('un mot qui contient le préfixe ne suffit pas', modeDeLaCle('xx_sk_live_1'), null)

  // Le défaut lit l'environnement, et l'environnement du banc n'a pas de clé.
  const avant = process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_SECRET_KEY
  egal('sans environnement, la plateforme n’a pas de mode', modePlateforme(), null)
  process.env.STRIPE_SECRET_KEY = 'sk_live_de_banc'
  egal('l’environnement est bien lu', modePlateforme(), MODE_LIVE)
  if (avant === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = avant
}

// ═══ 2) LES QUATRE VERDICTS ════════════════════════════════════════════════
{
  const sansCompte = { stripe_account_id: null, stripe_account_mode: null }
  const testNe     = { stripe_account_id: 'acct_1', stripe_account_mode: MODE_TEST }
  const liveNe     = { stripe_account_id: 'acct_2', stripe_account_mode: MODE_LIVE }
  const sansMonde  = { stripe_account_id: 'acct_3', stripe_account_mode: null }

  egal('pas de compte : rien à dire', verdictCompte(sansCompte, MODE_LIVE), VERDICT.AUCUN)
  egal('compte vide : rien à dire', verdictCompte({ stripe_account_id: '' }, MODE_LIVE), VERDICT.AUCUN)
  egal('un commerçant absent ne fait pas tomber le verdict', verdictCompte(null, MODE_LIVE), VERDICT.AUCUN)

  egal('test sous clé de test : atteignable', verdictCompte(testNe, MODE_TEST), VERDICT.OK)
  egal('live sous clé live : atteignable', verdictCompte(liveNe, MODE_LIVE), VERDICT.OK)

  // 🔴 LE CAS DU JOUR DE LA BASCULE.
  egal('test sous clé live : PERDU', verdictCompte(testNe, MODE_LIVE), VERDICT.PERDU)
  // ⚠️ ET LE RETOUR EN ARRIÈRE, qui arrivera si on remonte un bac à sable.
  egal('live sous clé de test : PERDU', verdictCompte(liveNe, MODE_TEST), VERDICT.PERDU)

  // 🔴 LES DEUX ABSENCES, QUI NE DOIVENT JAMAIS DEVENIR UN VERDICT.
  egal('monde du compte non noté : inconnu', verdictCompte(sansMonde, MODE_LIVE), VERDICT.INCONNU)
  egal('mode plateforme inconnu : inconnu', verdictCompte(testNe, null), VERDICT.INCONNU)
  egal('les deux inconnus : inconnu', verdictCompte(sansMonde, null), VERDICT.INCONNU)
  // ⚠️ UNE VALEUR FANTAISISTE N'EST PAS UN MONDE. Une colonne remplie à la main
  // avec « TEST » ou « sandbox » ne doit pas passer pour du test.
  egal('« TEST » majuscule n’est pas un monde', verdictCompte({ stripe_account_id: 'a', stripe_account_mode: 'TEST' }, MODE_TEST), VERDICT.INCONNU)
  egal('« sandbox » n’est pas un monde', verdictCompte({ stripe_account_id: 'a', stripe_account_mode: 'sandbox' }, MODE_LIVE), VERDICT.INCONNU)

  // 🔴 LE RACCOURCI NE DOIT DIRE VRAI QUE POUR UN SEUL DES QUATRE VERDICTS.
  // S'il disait vrai sur « inconnu », il détacherait des comptes qui marchent.
  verifie('🔴 « perdu » ne dit vrai que sur le verdict perdu',
    comptePerdu(testNe, MODE_LIVE) === true &&
    comptePerdu(testNe, MODE_TEST) === false &&
    comptePerdu(sansMonde, MODE_LIVE) === false &&
    comptePerdu(sansCompte, MODE_LIVE) === false &&
    comptePerdu(testNe, null) === false)
}

// ═══ 3) CE QU'ON ÉCRIT EN BASE ═════════════════════════════════════════════
{
  const c = { stripe_account_id: 'acct_ancien', stripe_account_mode: MODE_TEST }
  const d = detachementCompte(c)

  // 🔴 L'ANCIEN IDENTIFIANT SURVIT. Sans lui, une clé remise en test par erreur
  // effacerait les liens vers les VRAIS comptes, un commerçant après l'autre.
  egal('🔴 l’ancien compte est mis de côté, pas jeté', d.stripe_account_id_precedent, 'acct_ancien')
  egal('le lien courant est libéré', d.stripe_account_id, null)
  egal('le monde est oublié avec lui', d.stripe_account_mode, null)

  // ⚠️ LES TROIS DRAPEAUX TOMBENT ENSEMBLE. En laisser un à `true` ferait dire
  // à la fiche qu'elle encaisse, et l'écran proposerait un paiement mort.
  verifie('🔴 plus rien ne prétend encaisser',
    d.stripe_account_charges_enabled === false &&
    d.stripe_account_details_submitted === false &&
    d.stripe_account_payouts_enabled === false)

  // ⚠️ LE DÉTACHEMENT NE TOUCHE À RIEN D'AUTRE. Six clés, pas sept : une clé de
  // plus serait une colonne écrasée sans que personne l'ait demandé.
  egal('le détachement n’écrit que ces six colonnes', Object.keys(d).length, 6)

  const n = naissanceCompte('acct_neuf', MODE_LIVE)
  egal('la naissance relie le compte', n.stripe_account_id, 'acct_neuf')
  egal('🔴 et note son monde', n.stripe_account_mode, MODE_LIVE)
  egal('la naissance n’écrit que ces deux colonnes', Object.keys(n).length, 2)

  // ⚠️ UN COMPTE NÉ SANS MONDE CONNU EST INVISIBLE À VIE. Mieux vaut `null`
  // explicite qu'une valeur inventée : le contrôle C du SQL le comptera.
  egal('sans mode plateforme, le monde reste vide', naissanceCompte('acct_x', null).stripe_account_mode, null)

  // 🔴 ET SURTOUT SANS SECOND ARGUMENT, parce que c'est ainsi que la route
  // l'appelle. Passer `null` à la main saute la valeur par défaut : la garde
  // mesurait alors un chemin que le code de production ne prend jamais.
  // Trouvé par mutation, pas par relecture.
  const cleAvant = process.env.STRIPE_SECRET_KEY
  delete process.env.STRIPE_SECRET_KEY
  egal('🔴 sans clé du tout, la naissance n’invente aucun monde',
    naissanceCompte('acct_x').stripe_account_mode, null)
  egal('🔴 et le verdict par défaut reste « inconnu »',
    verdictCompte({ stripe_account_id: 'acct_1', stripe_account_mode: MODE_TEST }), VERDICT.INCONNU)
  egal('🔴 « perdu » ne dit jamais vrai sans clé',
    comptePerdu({ stripe_account_id: 'acct_1', stripe_account_mode: MODE_TEST }), false)
  process.env.STRIPE_SECRET_KEY = 'sk_live_de_banc'
  egal('🔴 avec une clé live, la naissance note « live »',
    naissanceCompte('acct_x').stripe_account_mode, MODE_LIVE)
  if (cleAvant === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = cleAvant

  // 🔴 ALLER-RETOUR : ce qu'on écrit doit se relire. Un détachement suivi d'une
  // naissance doit rendre le commerçant à nouveau atteignable.
  const apres = { ...c, ...d, ...naissanceCompte('acct_neuf', MODE_LIVE) }
  egal('🔴 après reconnexion, le compte est atteignable', verdictCompte(apres, MODE_LIVE), VERDICT.OK)
  egal('et l’ancien identifiant est toujours là', apres.stripe_account_id_precedent, 'acct_ancien')
}

// ═══ 4) CE QUE LIT LE COMMERÇANT ═══════════════════════════════════════════
{
  const perdu = messageCompte(VERDICT.PERDU)
  const inconnu = messageCompte(VERDICT.INCONNU)

  egal('rien à dire quand tout va bien', messageCompte(VERDICT.OK), null)
  egal('rien à dire sans compte', messageCompte(VERDICT.AUCUN), null)
  verifie('un message existe pour « perdu »', typeof perdu === 'string' && perdu.length > 40)
  verifie('un message existe pour « inconnu »', typeof inconnu === 'string' && inconnu.length > 40)

  // ⚠️ PERSONNE NE CHERCHE UNE INFORMATION. Le message doit dire le GESTE, la
  // DURÉE, et surtout CE QUI MARCHE ENCORE : sinon le commerçant croit avoir
  // tout perdu, sa fiche comprise.
  verifie('🔴 il dit le geste attendu', /Connecter Stripe/.test(perdu))
  verifie('⚠️ il dit combien de temps ça prend', /cinq minutes/.test(perdu))
  // 🔴 LES TROIS, PAS L'UN DES TROIS. Une alternance `fiche|articles|clients`
  // restait verte quand la phrase de réassurance était vidée : « Ta fiche, tes »
  // subsistait dans le fragment d'avant, et le mot suffisait. C'est le piège
  // récurrent du dépôt, pris ici par mutation.
  verifie('🔴 il nomme la fiche, les articles ET les clients',
    /fiche/.test(perdu) && /articles/.test(perdu) && /clients/.test(perdu))
  verifie('🔴 et il dit explicitement qu’ils ne bougent pas', /ne bougent pas/.test(perdu))
  // ⚠️ UNE PHRASE TRONQUÉE SE VOIT À L'ÉCRAN. Le message doit se terminer.
  verifie('⚠️ la phrase est terminée', /\.$/.test(perdu.trim()))

  // 🔴 AUCUN IDENTIFIANT TECHNIQUE, AUCUN ANGLAIS. C'est exactement ce que le
  // commerçant recevait avant : « No such account: 'acct_1ABC…' ».
  for (const [nom, m] of [['perdu', perdu], ['inconnu', inconnu]]) {
    verifie(`🔴 le message « ${nom} » ne montre aucun identifiant`, !/acct_|sk_(test|live)_|No such/.test(m))
    verifie(`⚠️ le message « ${nom} » ne dit ni « test » ni « live » en jargon`, !/\bsk_|API|mode test\b/i.test(m))
  }
}

// ═══ 5) LA ROUTE DE CONNEXION ══════════════════════════════════════════════
{
  const src = codeDe('app/api/stripe/connect/create-account-link/route.js')

  // 🔴 VISER L'ENDROIT, PAS LE MOT (cinq fois pris au piège le 16/09). Un
  // `stripe_account_mode` trouvé dans une ligne d'import ou un commentaire ne
  // prouve rien : on veut la colonne DANS LE SELECT.
  const select = src.match(/\.select\((['"`])([^'"`]+)\1\)/)
  verifie('🔴 le select de la route est lisible', !!select)
  const colonnes = (select?.[2] || '').split(',').map((s) => s.trim())
  for (const c of COLONNES_MODE.split(',').map((s) => s.trim())) {
    verifie(`🔴 « ${c} » est SÉLECTIONNÉE, pas seulement lue`, colonnes.includes(c))
  }
  // ⚠️ `slug` ÉTAIT LU SANS ÊTRE SÉLECTIONNÉ : l'URL envoyée à Stripe pointait
  // donc toujours vers l'identifiant technique. Défaut trouvé le 17/09.
  verifie('⚠️ « slug » est sélectionné puisqu’il est lu', colonnes.includes('slug'))

  // 🔴 L'ORDRE EST LA RÈGLE, PAS LA PRÉSENCE. Le détachement doit précéder le
  // `if (!accountId)`, sinon la création est sautée et la route repart sur le
  // compte mort. Une garde qui cherche les deux mots serait verte à l'envers.
  const iPerdu  = src.indexOf('comptePerdu(')
  const iCree   = src.indexOf('if (!accountId)')
  const iLien   = src.indexOf('accountLinks.create')
  verifie('🔴 le verdict est posé AVANT la création', iPerdu > -1 && iCree > -1 && iPerdu < iCree)
  verifie('🔴 et bien avant la demande de lien', iPerdu > -1 && iLien > -1 && iPerdu < iLien)
  verifie('🔴 le détachement précède la création', src.indexOf('detachementCompte(') < iCree)

  // 🔴 LE MONDE DOIT ÊTRE NOTÉ À LA NAISSANCE, sinon toute la détection est
  // muette à vie. On compte : une seule écriture, au bon endroit.
  const naissances = (src.match(/naissanceCompte\(/g) || []).length
  egal('🔴 le monde est noté exactement une fois', naissances, 1)
  verifie('🔴 et la naissance suit la création du compte',
    src.indexOf('naissanceCompte(') > src.indexOf('stripe.accounts.create('))

  // 🔴 LES DEUX ÉCRITURES SONT LUES. Un `await` dont on ignore l'erreur est un
  // espoir, pas une action : le compte existerait chez Stripe sans être relié.
  for (const quoi of ['detachementCompte', 'naissanceCompte']) {
    const i = src.indexOf(`${quoi}(`)
    const bloc = src.slice(Math.max(0, i - 200), i + 400)
    verifie(`🔴 l’écriture de ${quoi} lit son erreur`, /const\s*\{\s*error:/.test(bloc))
  }

  // ⚠️ UN COMPTE PERDU N'EST PAS UNE PREMIÈRE OUVERTURE. Lui opposer son
  // forfait reviendrait à lui faire payer NOTRE bascule.
  verifie('⚠️ la garde de forfait s’efface pour un compte perdu',
    /perdu\s*\?\s*\{\s*ok:\s*true\s*\}\s*:\s*verdictForfait\(/.test(src))
  // 🔴 MAIS ELLE RESTE ARMÉE POUR TOUT LE RESTE. On ne désarme pas une garde.
  verifie('🔴 et reste armée pour une vraie première ouverture',
    /verdictForfait\(commercant, 'paiement_ligne'\)/.test(src))
}

// ═══ 6) LA ROUTE D'ÉTAT ════════════════════════════════════════════════════
{
  const src = codeDe('app/api/stripe/connect/refresh-status/route.js')

  const select = src.match(/\.select\((['"`])([^'"`]+)\1\)/)
  const colonnes = (select?.[2] || '').split(',').map((s) => s.trim())
  verifie('🔴 le monde du compte est sélectionné', colonnes.includes('stripe_account_mode'))
  // ⚠️ `stripe_onboarding_done_at` ÉTAIT LU SANS ÊTRE SÉLECTIONNÉ : la date
  // d'ouverture était donc réécrite à chaque passage. Défaut trouvé le 17/09.
  verifie('⚠️ la date d’ouverture est sélectionnée puisqu’elle est lue',
    colonnes.includes('stripe_onboarding_done_at'))

  // 🔴 L'ORDRE, ENCORE : on ne va pas chez Stripe avant d'avoir jugé.
  const iVerdict = src.indexOf('verdictCompte(')
  const iStripe  = src.indexOf('stripe.accounts.retrieve(')
  verifie('🔴 le verdict précède l’appel à Stripe', iVerdict > -1 && iStripe > -1 && iVerdict < iStripe)

  // ⚠️ CETTE ROUTE N'ÉCRIT RIEN SUR UN COMPTE PERDU. Elle tourne à chaque
  // affichage : une écriture ici se répéterait sans qu'on l'ait demandée.
  verifie('⚠️ un simple affichage ne détache rien', !/detachementCompte\(/.test(src))

  // Le commerçant doit recevoir le message français, pas un code.
  verifie('🔴 le message rendu vient du module', /messageCompte\(/.test(src))
}

// ═══ 7) LA MIGRATION ═══════════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_MODE_COMPTE_STRIPE.sql')

  verifie('🔴 les deux colonnes sont créées',
    /ADD COLUMN IF NOT EXISTS stripe_account_mode/.test(sql) &&
    /ADD COLUMN IF NOT EXISTS stripe_account_id_precedent/.test(sql))
  // ⚠️ SANS GRANT, LE PARCOURS CASSE EN SILENCE : l'écriture passe sous
  // l'identité du commerçant, pas avec la clé de service.
  verifie('🔴 les droits sont accordés', /GRANT %s \(stripe_account_mode, stripe_account_id_precedent\)/.test(sql))
  verifie('⚠️ et répliqués depuis la colonne sœur', /column_name\s*=\s*'stripe_account_id'/.test(sql))
  // ⚠️ UNE VALEUR FANTAISISTE EN BASE FERAIT MENTIR LE VERDICT.
  verifie('⚠️ seules deux valeurs sont acceptées', /IN \('test', 'live'\)/.test(sql))
  // 🔴 L'EXISTANT DOIT ÊTRE RENSEIGNÉ, sinon la détection reste aveugle.
  verifie('🔴 l’existant est marqué « test »', /SET stripe_account_mode = 'test'/.test(sql))
  // ⚠️ ET LE CONTRÔLE DOIT COMPTER LES INVISIBLES.
  verifie('🔴 le contrôle compte les comptes sans monde noté',
    /stripe_account_id IS NOT NULL AND stripe_account_mode IS NULL/.test(sql))
  // ⚠️ RIEN DE TOUT ÇA NE DOIT FUIR DANS LA VUE PUBLIQUE.
  verifie('🔴 le contrôle vérifie la vue publique', /commercants_public/.test(sql))
}

console.log(`\nMode d’un compte Stripe : ${ok} vérifications`)
if (echecs.length) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
