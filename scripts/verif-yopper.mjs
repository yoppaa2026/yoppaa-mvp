// Banc du côté YOPPER : ce que l'habitant voit et reçoit.
//
// Monté le 05/08 après quatre signalements d'Alex qui avaient tous la même
// racine : du code qui échoue en SILENCE. Une carte de fidélité qui n'apparaît
// jamais, un profil vide, un badge qui promet du vide, un SMS à 3h du matin.
// Aucun de ces défauts ne produit d'erreur, ni au build, ni au lint, ni dans
// les journaux : seul un test qui interroge l'INTENTION les attrape.

import { readFileSync, readdirSync } from 'node:fs'
import { heureDecente } from '../lib/fidelite-sms.js'
import {
  extraireCodePostal,
  commercantEligibleDeal,
  commercantEligibleActu,
  codesPostauxDe,
} from '../lib/morning-eligibilite.js'
import { estSessionPerdue, ERREUR_SESSION } from '../lib/session-perdue.js'
import { sansProse } from './lire-code.mjs'

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
// ⚠️ LA SIGNATURE A CHANGÉ LE 24/08, ET CETTE GARDE L'A VU. Elle exigeait
// `aUnCompte(supabase, clientEmail)` : la fonction prend désormais un
// `clientId` en secours, parce qu'au comptoir il n'y a PAS d'email et que la
// garde ne vérifiait donc personne. Changer une signature, c'est changer un
// contrat — et ici c'est un banc, pas un appelant, qui portait le contrat.
verifier('pas de SMS de bienvenue à qui a un compte', /aUnCompte\(supabase, clientEmail, clientId\)/.test(smsCode))
verifier('🔴 et la garde sait aussi travailler sans email (comptoir)',
  /async function aUnCompte\(supabase, email, clientId = null\)/.test(smsCode))
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

// ⚠️ CE TEST VERROUILLAIT L'ENDROIT DE LA RÈGLE, PAS LA RÈGLE. Il exigeait que
// CHAQUE route contienne `montantFidelisable(` et `bon_cadeau_montant`, ce qui
// interdisait précisément la bonne correction : sortir le bloc, recopié trois
// fois, dans une fonction unique. Un test doit se mesurer sur le défaut qu'il
// empêche, ici le double comptage, jamais sur la façon dont c'était écrit.
//
// La règle est donc vérifiée là où elle vit maintenant, et on exige des chemins
// de crédit qu'ils y passent, ce qui est plus fort qu'avant : oublier une route
// n'est plus possible, il n'y a plus de copie à oublier.
const fideliteServeur = lire('lib/fidelite-server.js')
verifier('la règle du bon cadeau vit dans lib/fidelite-server.js',
  /montantFidelisable\(/.test(fideliteServeur))
verifier('et elle lit bien le montant du bon',
  /bon_cadeau_montant/.test(fideliteServeur))
verifier('le crédit d\'une commande ne part jamais du total brut',
  !/montant: Number\((cmd|full)\.total \|\| 0\)/.test(fideliteServeur))

// Tous les chemins qui clôturent une commande passent par la fonction partagée.
// Le geste du Yopper, le bouton du commerçant, et le rendez-vous honoré depuis
// le 12/08 : trois portes, un seul crédit.
for (const chemin of [
  'app/api/fidelite/crediter/route.js',
  'app/api/yopper/commandes/route.js',
  'app/api/commande/produits-remis/route.js',
]) {
  const src = lire(chemin)
  verifier(`${chemin} passe par le crédit partagé`, /crediterFideliteCommande\(/.test(src))
  verifier(`${chemin} ne recopie pas la règle du bon`, !/montantFidelisable\(/.test(src))
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

// ⚠️ CRÉER UN COMPTE RÉARME LA DEMANDE (Alex, 10/08 : « lors de la création
// d'un nouveau compte il ne propose pas la fenêtre pour la position »).
// Le drapeau « déjà demandée » vit dans le NAVIGATEUR, pas dans le compte :
// quelqu'un qui créait un compte sur un navigateur ayant déjà croisé Yoppaa ne
// voyait donc JAMAIS la fenêtre, et devait cliquer sur la pastille d'adresse
// pour l'ouvrir à la main. Or c'est au moment où l'on s'engage que la position
// sert le plus : c'est elle qui fait apparaître les commerces autour de soi.
const geoMod = await import('../lib/geoloc.js')
verifier('la demande peut être réarmée', typeof geoMod.oublierDemande === 'function')
// Une fois réarmée, la décision redevient « demander ».
egal('après réarmement, on redemande', decisionGeoloc({ etat: 'prompt', dejaDemande: false }), 'demander')
// ⚠️ MAIS UN REFUS RESTE UN REFUS. Réarmer ne doit jamais rouvrir la fenêtre à
// quelqu'un qui a dit non : ce serait du harcèlement, et le navigateur ne
// rouvrirait rien de toute façon.
egal('réarmer ne contourne pas un refus', decisionGeoloc({ etat: 'denied', dejaDemande: false }), 'jamais')
const defMdp = lire('app/commander/auth/definir-mdp/page.js')
verifier('la création de compte réarme la demande', /oublierDemande\(\)/.test(defMdp))

// ⚠️ LA POSITION SE RAFRAÎCHIT AU RETOUR AU PREMIER PLAN (Alex, 10/08). Le
// Yopper ouvre l'application chez lui, la laisse en fond, la rouvre trois rues
// plus loin : sans ça, elle lui montre encore les commerces de son point de
// départ. Une application installée sur téléphone n'est presque jamais
// rechargée, elle est seulement remise au premier plan.
const accueilGeo = lire('app/commander/page.js')
verifier('le retour au premier plan relance la position',
  /visibilitychange['"]?, auRetour/.test(accueilGeo) && /addEventListener\('focus', auRetour\)/.test(accueilGeo))
// ⚠️ IL DOIT REPASSER PAR LA DÉCISION, jamais par la demande directe : sinon la
// fenêtre d'autorisation se rouvrirait à chaque bascule d'application, ce qui
// est exactement le défaut corrigé le 07/08.
verifier('et il repasse par la décision, pas par la demande directe',
  /auRetour = \(\) => \{[^}]*geolocaliserAuDemarrage\(\)/.test(accueilGeo))
verifier('les écouteurs sont retirés au démontage',
  /removeEventListener\('visibilitychange', auRetour\)/.test(accueilGeo))
// Et le geste volontaire : un appui long sur la pastille rafraîchit sans avoir
// à ouvrir le panneau puis viser un bouton.
verifier('un appui long sur la pastille rafraîchit', /onPointerDown=\{\(\) => \{/.test(accueilGeo)
  && /appuiLongRef\.current = true/.test(accueilGeo))
verifier('et l\'appui court garde son comportement',
  /if \(appuiLongRef\.current\) \{ appuiLongRef\.current = false; return \}/.test(accueilGeo))

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

// ⚠️ ET UNE SECONDE ADRESSE, POUR L'EFFACEMENT PARTIEL. Google la publie sur la
// fiche du store, à côté de la précédente : la question « proposez-vous un moyen
// de supprimer une partie des données SANS supprimer le compte » est distincte,
// et le RGPD nous oblige à répondre oui. Retirer cet identifiant casserait un
// lien affiché dans le Play Store, sans que rien ne le signale.
verifier('l’effacement partiel a sa propre adresse',
  /<H3 id="droits-donnees">/.test(legal))
verifier('et il est dit qu’on ne supprime pas son compte pour autant',
  /jamais obligé de supprimer votre compte/.test(legal))
// Les trois exigences de Google pour cette page : la procédure, ce qui part, ce
// qui reste et pour combien de temps.
verifier('l’effacement partiel nomme ce qui peut partir',
  /Peuvent être effacés à votre demande/.test(legal))
verifier('et ce que la loi oblige à garder, avec sa durée',
  /Ne peuvent pas être effacés isolément[\s\S]{0,400}7 ans/.test(legal))

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

// ═══════════════════════════════════════════════════════════════════════════
// LA SESSION QUI MEURT EN ARRIÈRE-PLAN (Alex, 11/08)
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ « Retour dans l'app après quelques minutes, plus de commandes ni de
// rendez-vous. Fermer et rouvrir ne solutionne pas, déconnexion et reconnexion
// obligatoires. » Son profil restait pourtant affiché : nom, email, téléphone.
//
// Cause : sur iPhone, le renouvellement du jeton s'arrête en arrière-plan. Au
// retour, la bibliothèque ET le relevé de 5 secondes le renouvellent en même
// temps ; le jeton de rafraîchissement est consommé deux fois, le second essai
// reçoit « déjà utilisé », et la session est EFFACÉE. `fetchYopper` partait
// alors en anonyme sans le dire, et six `catch` posaient des listes vides.
//
// On EXÉCUTE la décision plutôt que de la lire dans le source.
{
  const rep = (status, corps) => [{ status }, corps]

  verifier('un 401 est une session perdue', estSessionPerdue(...rep(401, { ok: false })))
  verifier('le marqueur de fetchYopper aussi',
    estSessionPerdue({ status: 401 }, { ok: false, error: ERREUR_SESSION }))
  // ⚠️ LE CAS TRAÎTRE : la fidélité répond 200 avec `connecte:false`. Pour
  // l'écran, c'est la même chose qu'un 401 ; c'est même le SEUL endroit qui
  // disait la vérité sur la capture d'Alex (« Connecte-toi pour retrouver tes
  // cartes ») pendant que tout le reste affichait zéro sans rien expliquer.
  verifier('un 200 avec connecte:false est une session perdue',
    estSessionPerdue(...rep(200, { ok: true, connecte: false, cartes: [] })))

  // Et une VRAIE liste vide ne doit surtout pas déclencher le bandeau : un
  // Yopper sans commande n'a pas à lire « ta session a expiré ».
  verifier('une liste vide légitime n\'est PAS une session perdue',
    !estSessionPerdue(...rep(200, { ok: true, commandes: [] })))
  verifier('un compte connecté sans carte non plus',
    !estSessionPerdue(...rep(200, { ok: true, connecte: true, cartes: [] })))
  verifier('une panne serveur n\'est pas une session perdue',
    !estSessionPerdue(...rep(500, { ok: false, error: 'boom' })))
  verifier('sans réponse ni corps, on n\'invente rien', !estSessionPerdue(null, null))
  verifier('ni avec un corps vide', !estSessionPerdue({ status: 200 }, undefined))
}

// ⚠️ ET LE TRANSPORT NE DOIT PLUS PARTIR EN ANONYME. Sans jeton, `fetchYopper`
// envoyait quand même la requête : le serveur répondait en visiteur, et rien ne
// permettait de distinguer « je ne suis plus authentifié » d'un vide.
{
  const fy = lire('lib/fetch-yopper.js')
  verifier('fetchYopper tente un renouvellement avant d\'abandonner',
    /refreshSession\(\)/.test(fy))
  verifier('et sans jeton, il n\'appelle PAS le serveur',
    /if \(!token\) return reponseSessionPerdue\(\)/.test(fy))
  // ⚠️ LA GARDE PORTE SUR `fetchYopper` SEUL, PAS SUR LE FICHIER.
  //
  // Elle a été écrite le 11/08 pour interdire un en-tête d'autorisation
  // OPTIONNEL, qui faisait partir les routes personnelles en anonyme et vidait
  // l'application. Depuis le 24/08, le fichier contient AUSSI
  // `fetchAvecPreuveSiConnecte`, dont l'en-tête est légitimement conditionnel :
  // le tunnel de commande doit rester ouvert aux invités.
  //
  // Chercher le motif dans TOUT le fichier faisait donc rougir le banc sur du
  // code sain. On isole le corps de `fetchYopper` : la règle reste entière là
  // où elle protège quelque chose.
  const corpsFetchYopper = (fy.split('export async function fetchYopper(')[1] || '').split('\n}')[0]
  verifier('le corps de fetchYopper existe bien (la garde ne peut pas être vide)',
    corpsFetchYopper.length > 50)
  verifier('dans fetchYopper, l\'en-tête d\'autorisation n\'est pas conditionnel',
    !/if \(token\) headers\.Authorization/.test(corpsFetchYopper),
    (corpsFetchYopper.match(/.*if \(token\) headers\.Authorization.*/) || [])[0])

  // ⚠️ ET L'AUTRE MOITIÉ DE LA RÈGLE : la fonction permissive doit rester
  // permissive. Si quelqu'un lui ajoutait un jour le refus de `fetchYopper`,
  // les invités ne pourraient plus commander du tout.
  const corpsPermissif = (fy.split('export async function fetchAvecPreuveSiConnecte(')[1] || '').split('\n}')[0]
  verifier('fetchAvecPreuveSiConnecte existe', corpsPermissif.length > 50)
  verifier('et il part quand même sans jeton (l\'invité doit pouvoir commander)',
    !/reponseSessionPerdue\(\)/.test(corpsPermissif))
  verifier('mais il transporte la preuve quand elle existe',
    /if \(token\) headers\.Authorization/.test(corpsPermissif))

  const sb = lire('lib/supabase.js')
  verifier('les options de session sont écrites, plus subies',
    /persistSession: true/.test(sb) && /autoRefreshToken: true/.test(sb))
}

// ⚠️ ET L'ÉCRAN NE DOIT PLUS EFFACER SES LISTES NI SE TAIRE.
{
  const src = lire('app/commander/page.js')
    .split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

  verifier('le relevé ne tourne que si l\'écran est allumé',
    /visibilityState !== 'visible'\) return\s*\n\s*const email/.test(src))
  verifier('et il a cessé de battre toutes les 5 secondes',
    !/\}, 5000\)/.test(src), (src.match(/.*\}, 5000\).*/) || [])[0])
  // ⚠️ CES DEUX GARDES ONT ROUGI LE 22/08 SUR UN CODE AMÉLIORÉ, et c'est le
  // test qu'il a fallu relire, pas le code (reference_tests_faussement_verts,
  // « le test qui verrouille une forme »).
  //
  // Elles cherchaient `event === 'SIGNED_OUT'` DANS L'ÉCRAN. L'écoute existe
  // toujours, elle a déménagé dans `lib/session-permanente.js` où elle sert
  // les cinq écrans au lieu d'un seul. Ce qu'on veut obtenir n'a pas changé :
  // l'application doit réagir à une session tombée. Ce qui a changé, c'est
  // qu'elle tente d'abord de la REPOSER, et ne prévient qu'en dernier recours.
  //
  // Elles jugent donc désormais l'intention, là où elle vit.
  const perm = lire('lib/session-permanente.js')
  verifier('la déconnexion est écoutée', /event === 'SIGNED_OUT'/.test(perm))
  verifier('le renouvellement réussi lève l\'alerte', /event === 'TOKEN_REFRESHED'/.test(perm))
  verifier('l\'écran est branché sur cette écoute', /brancherSessionPermanente\(/.test(src))
  // ⚠️ ET LE BANDEAU NE S'ALLUME PLUS TOUT SEUL SUR UN `SIGNED_OUT` : une
  // session perdue dans une course de renouvellement est récupérable, et
  // déranger le Yopper pour ça était le défaut à corriger.
  verifier('le bandeau ne s\'allume plus directement sur SIGNED_OUT',
    !/if \(event === 'SIGNED_OUT'\) setSessionPerdue\(true\)/.test(src))
  // ⚠️ CES DEUX GARDES CHERCHAIENT « Session expirée » ET « Se reconnecter »
  // DANS L'ÉCRAN, et le 30/08 elles ont rougi sur du code juste : les deux
  // phrases ont déménagé dans `lib/retour-app.js`, parce qu'il y en a
  // maintenant DEUX jeux. Sur un navigateur où le Yopper ne s'est jamais
  // connecté, il n'y a pas d'expiration mais une absence, et lui annoncer qu'il
  // a perdu quelque chose est faux autant qu'inquiétant.
  //
  // Ce qui compte n'a pas bougé : un bandeau existe, et il propose une porte de
  // sortie. Il se mesure là où la règle vit, et `verif:session` l'exécute.
  verifier('le bandeau lit la règle d’accès perdu', /libelleAccesPerdu\(\{ dejaConnecte:/.test(src))
  verifier('et il en affiche le titre, le texte ET le bouton',
    /\.titre\}/.test(src) && /\.texte\}/.test(src) && /\.bouton\}/.test(src))
  const retour = lire('lib/retour-app.js')
  verifier('la règle sait dire « session expirée » quand c’en est une',
    /titre: 'Session expirée'/.test(retour))
  verifier('et propose de se reconnecter', /bouton: 'Se reconnecter'/.test(retour))
  // ⚠️ ON VISE L'INTÉRIEUR DE LA FONCTION, pas le fichier entier : la même
  // ligne de garde existe dans le chargement des commandes, et un test posé sur
  // tout le fichier resterait vert alors que les rendez-vous, eux, seraient de
  // nouveau effacés. La mesure du défaut l'a pris sur le fait.
  const corpsDe = (nom) => {
    const debut = src.indexOf(`async function ${nom}(`)
    if (debut < 0) return ''
    const suite = src.slice(debut)
    const fin = suite.indexOf('\n  }\n')
    return fin < 0 ? suite : suite.slice(0, fin)
  }
  const corpsRdvs = corpsDe('chargerRdvsClient')
  verifier('la fonction des rendez-vous a bien été trouvée', corpsRdvs.length > 100)
  verifier('les rendez-vous ne sont plus effacés sur une session perdue',
    /estSessionPerdue\([^)]*\)\) \{ setSessionPerdue\(true\); return \}/.test(corpsRdvs)
    && !/setSessionPerdue\(true\)[^}]*setClientRdvs\(\[\]\)/.test(corpsRdvs),
    corpsRdvs.slice(0, 100).replace(/\s+/g, ' '))

  const corpsFavoris = corpsDe('chargerFavoris')
  verifier('les favoris non plus',
    /estSessionPerdue\([^)]*\)\) \{ setSessionPerdue\(true\); return \}/.test(corpsFavoris),
    corpsFavoris.slice(0, 100).replace(/\s+/g, ' '))
  verifier('les commandes non plus',
    !/setClientCommandes\(res\?\.commandes \|\| \[\]\)/.test(src),
    (src.match(/.*setClientCommandes\(res\?\.commandes.*/) || [])[0])
  // ⚠️ DEUX APPELS NUS SUR UNE ROUTE QUI EXIGE UNE PREUVE. `get-own` et
  // `update-own` répondaient 401 à tous les coups : la commune du Yopper
  // n'était jamais chargée, et surtout son prénom, son nom et son téléphone
  // n'étaient JAMAIS enregistrés. L'écran affichait la nouvelle valeur, lue du
  // navigateur, et la base gardait l'ancienne.
  //
  // ⚠️ `get-or-create`, lui, est VOLONTAIREMENT ouvert : il sert au passage à
  // la caisse d'un visiteur pas encore authentifié, et la route le traite avant
  // son contrôle d'identité. L'interdire ferait échouer toute première commande.
  //
  // ⚠️ ET LA LISTE DES ACTIONS PROTÉGÉES SE LIT DANS LA ROUTE, elle ne s'écrit
  // plus ici. Ce test ne visait que `get-own` et `update-own` : `set-commune`,
  // protégée exactement pareil, n'y figurait pas, et l'écran de choix de commune
  // l'appelait sans jeton depuis des semaines. Alex l'a vu le 16/08, en rouge
  // sous le sélecteur : « session_yopper_manquante ». Une liste écrite à la main
  // ne protège que les cas qu'on connaissait le jour où on l'a écrite.
  const ACTIONS_OUVERTES = ['get-or-create']
  const actionsProtegees = [...new Set(
    [...lire('app/api/yopper/client/route.js').matchAll(/action === '([a-z-]+)'/g)].map(m => m[1])
  )].filter(a => !ACTIONS_OUVERTES.includes(a))

  verifier('les actions protégées de la route ont bien été trouvées',
    actionsProtegees.length >= 3, actionsProtegees.join(', ') || 'aucune')

  // ⚠️ ET ON BALAIE TOUS LES APPELANTS, pas un seul fichier. Cette garde ne
  // lisait que `app/commander/page.js` : l'appel fautif vivait dans
  // `ConfirmCommune.js`, qu'elle n'a jamais ouvert. Le motif était juste, le
  // PÉRIMÈTRE était faux, et c'est aussi efficace qu'un test absent.
  const appelants = []
  const explorer = (url, prefixe) => {
    for (const e of readdirSync(url, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue
      const sousUrl = new URL(`${e.name}${e.isDirectory() ? '/' : ''}`, url)
      if (e.isDirectory()) explorer(sousUrl, `${prefixe}${e.name}/`)
      else if (e.name.endsWith('.js')) {
        const contenu = readFileSync(sousUrl, 'utf8')
        if (contenu.includes('/api/yopper/client')) appelants.push([`${prefixe}${e.name}`, contenu])
      }
    }
  }
  explorer(new URL('../app/', import.meta.url), 'app/')

  verifier('les appelants de la route ont bien été trouvés', appelants.length >= 2,
    appelants.map(([n]) => n).join(', ') || 'aucun')

  for (const [nom, contenu] of appelants) {
    const blocsNus = contenu.split("fetch('/api/yopper/client'").slice(1)
    for (const action of actionsProtegees) {
      const fautif = blocsNus.find(b => b.slice(0, 250).includes(action))
      verifier(`${nom} : aucun appel nu pour l'action ${action}`, !fautif,
        fautif ? fautif.slice(0, 130).replace(/\s+/g, ' ') : '')
    }
  }
  // ⚠️ CE QUE CE BANC NE TIENT PAS, ET IL VAUT MIEUX L'ÉCRIRE : rien ne vérifie
  // qu'une action ENVOYÉE par un écran existe encore côté route. La renommer
  // sur le serveur ne casse ni le build ni le lint, et l'écran continue
  // d'afficher son formulaire devant une route qui répond « action inconnue ».
  // Une première tentative de garde a été écrite le 16/08 puis RETIRÉE : elle
  // lisait toutes les actions du fichier, y compris celles destinées à d'autres
  // routes, et accusait `/api/yopper/commandes` de ne pas exister ici. Une garde
  // mal ancrée qui rougit sur du code juste coûte plus cher que pas de garde.
}


// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ RIEN NE DOIT ENFERMER UN YOPPER HORS DE SES PROPRES COMMANDES (Alex, 16/08)
//
// Il a commandé, s'est connecté par lien magique pour retrouver sa commande, et
// la modale de commune s'est ouverte : NON FERMABLE, sur une liste VIDE parce
// que sa commune n'était pas « active », avec pour seul bouton un lien vers la
// landing. Aucun chemin vers sa commande.
//
// « Il ne peut pas y avoir de frein à l'enregistrement d'un commerçant ou d'un
// Yopper. »
//
// Deux verrous se superposaient, et il faut les tenir tous les deux :
//   1. le filtre `active` sur la liste des communes ;
//   2. la modale elle-même, qui ne se fermait pas.
// ═══════════════════════════════════════════════════════════════════════════

// Le commentaire de ce fichier PARLE de `active` pour expliquer qu'on ne
// filtre plus dessus : sans retirer les commentaires, ce banc se lirait
// lui-même. Piège maison, cinq fois vécu.
const srcCommune = lire('app/commander/ConfirmCommune.js')
  .split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')

verifier('la liste des communes ne filtre plus sur « active »',
  !/from\('communes'\)[\s\S]{0,200}?\.eq\('active'/.test(srcCommune))
// La détection par géolocalisation avait le MÊME filtre : reconnaître la bonne
// commune puis refuser de la proposer serait la pire des sorties.
verifier('la détection par code postal non plus',
  !/contains\('codes_postaux'[\s\S]{0,120}?\.eq\('active'/.test(srcCommune))

// ⚠️ ET LA FENÊTRE SE FERME TOUJOURS. C'est le verrou le plus grave des deux :
// même avec toutes les communes ouvertes, une modale sans sortie transforme un
// service rendu en péage.
//
// ⚠️ ON VÉRIFIE LA FERMETURE, PAS LE NOM DE LA VARIABLE QUI LA GOUVERNAIT. Le
// premier test interdisait `const fermable` : réintroduire le verrou sous la
// forme `mode === 'change' ? onClose : undefined` ne le faisait pas rougir.
// C'est la règle qui compte, pas la forme d'hier.
verifier('le fond se ferme au clic, sans condition de mode',
  /onClick=\{onClose\}/.test(srcCommune))
verifier('et aucune fermeture n’est conditionnée au mode',
  !/mode === 'change' \? onClose/.test(srcCommune))
verifier('plus aucune condition ne rend la fenêtre non fermable',
  !/const fermable/.test(srcCommune))
verifier('la croix de fermeture est toujours montée',
  /aria-label="Fermer"/.test(srcCommune))
// La sortie textuelle compte autant que la croix : sur mobile, une croix de
// 28 px se rate, un bouton pleine largeur non.
verifier('et une sortie « Plus tard » existe en toutes lettres',
  /Plus tard/.test(srcCommune))

// ⚠️ ET ON N'ANNONCE PLUS UNE FERMETURE QUI N'EXISTE PLUS. Le message « ta
// commune n'est pas encore ouverte » ne pouvait mener qu'à la landing : le
// garder après cette bascule serait mentir ET réenfermer.
verifier('le message de commune fermée a disparu',
  !/pas encore ouverte/.test(srcCommune))
verifier('et il ne reste aucun renvoi vers la landing',
  !/yoppaa\.app/.test(srcCommune))

// La migration qui ouvre tout : elle doit exister, porter son contrôle, et ne
// réécrire que ce qui change.
const migrationCommunes = lire('migrations/MIGRATION_TOUTES_COMMUNES_OUVERTES.sql')
verifier('la migration ouvre les communes fermées',
  /UPDATE communes[\s\S]{0,120}SET active = true[\s\S]{0,60}WHERE NOT active/.test(migrationCommunes))
// ⚠️ DEUX COMPTAGES, AVANT ET APRÈS, et on les COMPTE au lieu de les chercher :
// le motif existe des deux côtés, en casser un laissait l'autre satisfaire le
// test. Sixième fois aujourd'hui que l'homonyme voisin rend une garde muette.
// Et un état lu seulement APRÈS ne prouve rien : c'est l'écart entre les deux
// qui dit ce que la migration a fait.
egal('elle compte les communes fermées AVANT et APRÈS',
  (migrationCommunes.match(/count\(\*\) FILTER \(WHERE NOT active\)/g) || []).length, 2)


// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ « ACCÈS REFUSÉ » NE DOIT PAS ÊTRE LE MESSAGE D'UNE SESSION EXPIRÉE
//
// Alex, 16/08, en essayant d'ouvrir une commune depuis /admin : la lecture de
// la page avait fonctionné, l'enregistrement a répondu « Erreur : accès
// refusé ». Il a cherché un problème de droits qui n'existait pas.
//
// Les DIX routes admin portaient la même ligne, recopiée à l'identique :
//
//     if (!user || user.email !== ADMIN_EMAIL) → 403 « accès refusé »
//
// `getUser()` rend `null` quand le jeton n'est plus valide : un jeton expiré
// tombait donc dans la branche des droits. ⚠️ Un message qui nomme la mauvaise
// cause coûte plus cher que pas de message : il envoie chercher ailleurs, avec
// l'autorité d'une réponse.
//
// ⚠️ ON BALAIE LE DOSSIER, ON NE LISTE PAS LES ROUTES. Vérifier les dix connues
// laisserait passer la onzième, écrite dans six mois par quelqu'un qui aura
// recopié l'ancienne forme. Le banc trouve les routes lui-même.
// ═══════════════════════════════════════════════════════════════════════════

const routesAdmin = readdirSync(new URL('../app/api/admin', import.meta.url), { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => `app/api/admin/${e.name}/route.js`)
  .filter(p => { try { lire(p); return true } catch { return false } })

verifier('des routes admin ont bien été trouvées', routesAdmin.length >= 10,
  `${routesAdmin.length} trouvée(s)`)

for (const chemin of routesAdmin) {
  const src = lire(chemin)
  if (!/ADMIN_EMAIL/.test(src)) continue   // route sans contrôle d'email : hors sujet
  const court = chemin.replace('app/api/admin/', '').replace('/route.js', '')

  // La forme fautive, celle qui confond les deux causes.
  verifier(`${court} ne confond plus session morte et droits manquants`,
    !/!user \|\| user\.email !== ADMIN_EMAIL/.test(src))
  // Et la distinction est réellement écrite : un jeton mort rend 401, pas 403.
  verifier(`${court} rend 401 sur une session expirée`,
    /if \(!user\)[\s\S]{0,180}?session expirée/.test(src)
    && /session expirée[\s\S]{0,120}?401/.test(src))
  verifier(`${court} garde 403 pour un compte qui n’est pas admin`,
    /user\.email !== ADMIN_EMAIL[\s\S]{0,180}?403/.test(src))
}

// ═══ LA LISTE SE CHARGE AU MONTAGE, ET SE RELANCE AU RETOUR ════════════════
//
// 🔴 DEUX PANNES OPPOSÉES, UN SEUL ÉCRAN, LE MÊME JOUR.
// Le matin du 26/08 : la requête ne rendait jamais la main au réveil du
// téléphone. Corrigée par un délai maximal et une relance au retour au premier
// plan. Mais en ajoutant la relance, l'appel AU MONTAGE a été remplacé au lieu
// d'être complété : `chargerCommercants` n'avait plus qu'un seul appelant,
// l'écouteur. Or à l'ouverture de l'application, `pageshow` s'est déjà produit
// AVANT que React n'attache l'écouteur : l'événement est manqué, personne
// n'appelle, et « On réveille ton quartier » tourne indéfiniment.
//
// ⚠️ LE SYMPTÔME EST IDENTIQUE AU PIXEL PRÈS. C'est ce qui rend ce défaut
// dangereux : on le croit déjà corrigé, puisqu'on vient de corriger le même
// écran. Alex l'a retrouvé sur iPhone ET sur Android, à chaque ouverture.
//
// ⚠️ LA RÈGLE QUE CETTE GARDE TIENT : une relance n'est pas un chargement. Un
// écouteur de secours ne se déclenche que si quelqu'un a d'abord essayé.
{
  const src = lire('app/commander/page.js')

  // Le corps de l'effet, découpé entre deux repères de CODE, jamais sur un
  // nombre de caractères : une fenêtre glissante lit chez le voisin.
  const avantEcouteur = /if \(commercants\.length > 0\) return([\s\S]*?)const reveiller/.exec(src)?.[1]
  verifier("l'effet de chargement des commerces est reconnaissable",
    typeof avantEcouteur === 'string')
  verifier('la liste des commerces se charge AU MONTAGE',
    /chargerCommercants\(\)/.test(avantEcouteur || ''),
    'plus aucun appel hors de l\'écouteur : l\'écran resterait sur ses trois points')

  // Et la relance du matin reste en place, avec ses DEUX événements : une page
  // restaurée depuis le cache ne repasse pas toujours par un changement de
  // visibilité (leçon du bouton mort au retour de Stripe).
  verifier('et elle se relance au retour au premier plan',
    /addEventListener\('visibilitychange', reveiller\)/.test(src)
    && /addEventListener\('pageshow', reveiller\)/.test(src))

  // ⚠️ ET LA SORTIE DE SECOURS DU MATIN NE DOIT PAS DISPARAÎTRE NON PLUS :
  // sans délai maximal, une requête pendante rend le même écran mort.
  verifier('le chargement a toujours un délai maximal',
    /abandon\.abort\(\)/.test(src) && /abortSignal\(abandon\.signal\)/.test(src))
  verifier("et un échec se DIT au lieu de ressembler à un vide",
    /setErreurChargement\(true\)/.test(src))
}

// ═══ L'HISTORIQUE SE PLIE, ET SON TITRE CONTINUE DE PARLER (31/08) ════════
//
// 🔴 Demande d'Alex : les listes terminées poussaient vers le bas ce que le
// Yopper vient réellement chercher, c'est-à-dire ce qui est EN COURS.
{
  const repli = lire('app/commander/HistoriqueRepli.js')
  const page = lire('app/commander/page.js')

  // ⚠️ ON DÉMONTE, ON NE CACHE PAS. Un `display: none` garderait des dizaines
  // de cartes dans le document, et c'est précisément le poids qu'on retire.
  verifier('🔴 le repli DÉMONTE son contenu au lieu de le cacher',
    /\{ouvert && children\}/.test(repli) && !/display: 'none'/.test(repli))
  // ⚠️ TOUTE LA BARRE EST LE BOUTON : une flèche de 14 pixels au doigt se rate
  // une fois sur trois.
  verifier('la barre entière est cliquable, et elle se dit aux lecteurs d’écran',
    /<button/.test(repli) && /aria-expanded=\{ouvert\}/.test(repli)
    && /width: '100%'/.test(repli))
  // 🔴 REPLIÉ NE VEUT PAS DIRE MUET. Sans compte, il faut ouvrir pour savoir
  // s'il vaut la peine d'être ouvert : on n'a rien gagné.
  verifier('🔴 le compte reste visible une fois plié',
    /\{compte \?/.test(repli))

  // ── Les deux historiques passent par lui, et aucun ne garde l'ancienne barre.
  const usages = (page.match(/<HistoriqueRepli/g) || []).length
  egal('les trois historiques du Suivi sont repliables', usages, 3)
  verifier('et le composant est bien importé',
    /import HistoriqueRepli from '\.\/HistoriqueRepli'/.test(page))
  // ⚠️ ON COMPTE LES SURVIVANTS, on ne cherche pas un succès. Une barre
  // « Historique » écrite à la main qui subsisterait serait invisible autrement.
  const barresManuelles = (page.match(/letterSpacing: '0\.5px' \}\}>Historique</g) || []).length
  egal('🔴 aucune barre « Historique » n’est restée à la main', barresManuelles, 0)

  // 🔴 ET LE COMPTE ANNONCE CE QUE LE BLOC CONTIENT, PAS CE QUI EXISTE. La
  // liste s'arrête à cinq : promettre douze pour en montrer cinq serait un
  // mensonge de plus dans un écran d'argent.
  const comptes = (page.match(/compte=\{`\$\{Math\.min\(/g) || []).length
  egal('🔴 les deux comptes disent ce qui est AFFICHÉ, pas le total', comptes, 2)

  // ── 🔴 « TERMINÉ » N'EST PAS « PAS VALABLE » ────────────────────────────
  //
  // `valable` rend faux pour quatre raisons, dont deux qui ne sont pas des
  // fins : un abonnement pas encore commencé, et un contrat sans dates.
  // Ranger le premier dans l'historique archiverait un abonnement acheté ce
  // matin pour le mois prochain.
  const { etatAbonnement } = await import('../lib/abonnements.js')
  const AUJ = '2026-08-31'
  const etat = (a) => etatAbonnement({ id: 'a', statut: 'actif', ...a }, [], { aujourdhui: AUJ })

  verifier('🔴 un abonnement PAS ENCORE COMMENCÉ n’est pas terminé',
    etat({ date_debut: '2026-10-01', date_fin: '2026-12-31', seances_total: 10 }).termine === false)
  verifier('🔴 un abonnement dont la fin est passée est terminé',
    etat({ date_debut: '2026-01-01', date_fin: '2026-08-30', seances_total: 10 }).termine === true)
  verifier('un abonnement en cours ne l’est pas',
    etat({ date_debut: '2026-08-01', date_fin: '2026-09-30', seances_total: 10 }).termine === false)
  verifier('le dernier jour compte encore',
    etat({ date_debut: '2026-08-01', date_fin: AUJ, seances_total: 10 }).termine === false)
  verifier('🔴 des séances épuisées terminent l’abonnement',
    etat({ date_debut: '2026-08-01', date_fin: '2026-09-30', seances_total: 0 }).termine === true)
  verifier('un contrat résilié est terminé',
    etat({ statut: 'resilie', date_debut: '2026-08-01', date_fin: '2026-09-30', seances_total: 10 }).termine === true)
  // ⚠️ ET UN SOLDE INCONNU N'EST PAS UN SOLDE ÉPUISÉ, neuvième fois.
  verifier('🔴 un solde INCONNU ne termine rien',
    etat({ date_debut: '2026-08-01', date_fin: '2026-09-30', seances_total: null }).termine === false)
  // ⚠️ ET UN CARNET SANS DATES RESTE OUVERT tant qu'il lui reste des séances.
  verifier('un carnet sans dates reste en cours',
    etat({ seances_total: 10 }).termine === false)

  // L'écran filtre bien sur ce drapeau, et ne recalcule pas la règle.
  verifier('🔴 l’écran lit le drapeau du module au lieu de refaire la règle',
    /filter\(a => !a\.termine\)/.test(page) && /filter\(a => a\.termine\)/.test(page))
  verifier('et il ne se sert pas de `valable` pour trancher',
    !/a\.valable/.test(page))
}

// ═══ LA CONFIRMATION DE COMMANDE — L'INVITÉ NE VOYAIT RIEN (03/09) ═════════
//
// 🔴 IL PAYAIT, ET IL RETOMBAIT SUR LA FICHE DU COMMERCE. Panier vidé par le
// rechargement, pas de numéro, pas de « c'est bon », pas de bouton
// d'annulation. Rien ne lui disait que son argent était parti quelque part.
//
// La relecture post-paiement partait par `fetchYopper`, qui REFUSE de partir
// sans session Supabase : il fabrique un 401 sans appeler personne. Un invité
// n'a pas de session, la réponse ne portait donc aucune commande, et TOUT
// l'écran vivait dans un `if (data)`. La route, elle, n'a jamais rien demandé.
//
// ⚠️ ET LE COMMENTAIRE AU-DESSUS PROMETTAIT DÉJÀ « on affiche quand même ».
// Neuvième fois qu'une affirmation en prose ne correspond pas au code : les
// gardes ci-dessous mesurent la STRUCTURE, pas la phrase.
{
  const tunnel = sansProse(lire('app/commander/[slug]/page.js'))

  // ─── L'appel doit accepter de partir sans session ───────────────────────
  verifier('🔴 la confirmation se relit par un appel qui part SANS session',
    /fetchAvecPreuveSiConnecte\('\/api\/yopper\/commandes'/.test(tunnel))
  verifier('et plus par celui qui renonce faute de jeton',
    !/fetchYopper\('\/api\/yopper\/commandes'/.test(tunnel))

  // ─── L'écran ne dépend plus de la relecture ─────────────────────────────
  // Stripe a accepté le paiement : c'est LUI la preuve, pas notre relecture.
  const debut = tunnel.indexOf("if (paiement === 'ok')")
  const blocOk = debut > -1
    ? tunnel.slice(debut, tunnel.indexOf('}, [slug])', debut) + 1)
    : ''
  verifier('le bloc du retour de paiement a bien été retrouvé', blocOk.length > 200)
  verifier('🔴 la confirmation s’affiche même quand la relecture échoue',
    /allerEtape\(4\)/.test(blocOk) && !/if \(data\)/.test(blocOk))
  verifier('et l’identifiant survit, pour garder l’annulation possible',
    /\{ id: commandeId \}/.test(blocOk))

  // ─── Les trois états du compte, et surtout le troisième ─────────────────
  verifier('l’état « connecté » est alimenté par la session',
    /setEstConnecte\(!!user\)/.test(tunnel))
  verifier('🔴 l’invité reçoit son encadré',
    /\{!estConnecte && \(/.test(tunnel))
  verifier('et le nudge « mot de passe » est réservé à qui a une session',
    /\{estConnecte && !aMotDePasse && \(/.test(tunnel))
  // 🔴 LA CONDITION MORTE. `!(client.email && clientId)` ne peut JAMAIS être
  // vraie à la confirmation : on n'y arrive qu'après avoir donné son adresse,
  // et `getOuCreerClient` pose `clientId` avant de partir payer. Elle reste
  // légitime à l'étape 3, où l'adresse n'est pas encore saisie : UNE occurrence,
  // pas deux.
  verifier('🔴 la condition morte ne gouverne plus rien à la confirmation',
    (tunnel.match(/!\(client\.email && clientId\)/g) || []).length === 1)
  // ⚠️ Et l'invité part définir son mot de passe, PAS créer un deuxième compte
  // à côté de la fiche client qui existe déjà.
  verifier('l’encadré de l’invité mène à la définition du mot de passe',
    /router\.push\(`\/commander\/auth\/definir-mdp/.test(tunnel))

  // ─── CE QUE L'ENCADRÉ PROMET DOIT EXISTER ───────────────────────────────
  //
  // Il annonce un lien dans l'email de confirmation, et une commande qu'on
  // retrouvera dans son compte. Deux promesses, deux vérifications.
  const resend = sansProse(lire('lib/resend.js'))
  verifier('🔴 l’email de confirmation porte bien ce lien',
    /offrir_mdp \?/.test(resend) && /commander\/auth\/definir-mdp/.test(resend))
  // ⚠️ Sans l'adresse, le lien ne cible plus rien : il se rabat sur le stockage
  // du navigateur, or ce bouton se clique souvent depuis un AUTRE appareil.
  for (const emetteur of ['lib/commande-notifs.js', 'app/api/emails/commande-confirmee/route.js']) {
    verifier(`${emetteur} donne au lien l’adresse à cibler`,
      /offrir_mdp_email:\s*cmd\.client_email/.test(sansProse(lire(emetteur))))
  }

  // « tu retrouves cette commande » : la liste retrouve par l'ADRESSE. Les deux
  // côtés doivent donc l'écrire pareil, sinon une majuscule tapée le jour de la
  // commande la rend invisible pour toujours.
  const { normaliserEmail } = await import('../lib/email-normalise.js')
  egal('une adresse est normalisée à l’écriture', normaliserEmail(' Alex@Gmail.COM '), 'alex@gmail.com')
  const routeCommandes = sansProse(lire('app/api/yopper/commandes/route.js'))
  verifier('la liste retrouve les commandes par l’adresse',
    /\.eq\('client_email', yopper\.email\)/.test(routeCommandes))
  verifier('🔴 et la commande enregistre une adresse normalisée',
    /client_email: normaliserEmail\(client_email\)/.test(
      sansProse(lire('app/api/stripe/checkout/create-commande/route.js'))))
  verifier('l’identité relit l’adresse en minuscules',
    /user\.email\.toLowerCase\(\)/.test(sansProse(lire('lib/yopper-auth.js'))))

  // ─── La porte que l'appelant fermait est bien ouverte côté serveur ──────
  //
  // `get-one` est placée AVANT la garde d'identité : sa protection est l'UUID
  // que Stripe vient de rendre au Yopper. Si elle passait un jour derrière la
  // garde, l'invité redeviendrait aveugle sans que personne ne le voie.
  const iGetOne = routeCommandes.indexOf("action === 'get-one'")
  const iGarde = routeCommandes.indexOf('session_yopper_manquante')
  verifier('🔴 la relecture par UUID est bien AVANT la garde d’identité',
    iGetOne > -1 && iGarde > -1 && iGetOne < iGarde)
}

// 🔴 LE TOTAL S'IMPRIMAIT AU MILIEU DU FICHIER (trouvé le 31/08).
//
// Il vivait cent lignes avant la fin, et ignorait donc tout ce qui suivait :
// les gardes du chargement, celles du repli, celles des abonnements. Le banc
// annonçait « 224 vérifications » en en ayant fait bien davantage.
//
// ⚠️ LES ÉCHECS, EUX, ÉTAIENT BIEN COMPTÉS : le bloc final lit `ko` après tout
// le monde. Rien n'est jamais passé au travers. Mais un banc qui sous-déclare
// son propre travail est un banc dont on ne peut pas suivre la progression, et
// c'est précisément le chiffre que je recopie dans chaque message de commit.
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)

if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Côté Yopper vert.')
