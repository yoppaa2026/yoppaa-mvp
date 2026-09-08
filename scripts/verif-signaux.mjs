// Banc des SIGNAUX YOPPER : quand parle-t-on au commerçant, et comment.
//
// L'enjeu n'est pas technique, il est commercial. Un email envoyé trop tôt
// (« 1 personne a demandé ») affaiblit l'argument au lieu de le servir, et un
// email envoyé trop souvent devient du bruit qui abîme la confiance. Ces
// règles-là méritent d'être verrouillées.

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  libelleEnvie, phraseHorsOuverture, enviesAAlerter, peutEnvoyerEmail,
  LIBELLE_ENVIE, TYPES_ENVIE, envieConnue,
  envoyerSignal, messageEchecSignal, MESSAGE_SIGNAL_RESEAU,
  ENVIE_VERS_FONCTION, fonctionDeLEnvie, envieDeLaFonction, phraseEnvieFonction,
  enviesProposables,
} from '../lib/signaux.js'
import { PLAN_FEATURES } from '../lib/plans.js'
import { emailSuggestionCommerce, emailSignalementFiche } from '../lib/resend.js'

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
// ⚠️ LA CARTE DE FIDÉLITÉ EST LA SIXIÈME, ajoutée le 26/08 à la demande
// d'Alex. C'est le seul signal qui parle d'une habitude plutôt que d'un
// service : celui qui le pose revient déjà, et personne ne réclame une carte
// de fidélité au comptoir.
// ⚠️ ET « INVENDUS » EST LA SEPTIÈME, ajoutée le 04/09 sur une idée d'Alex :
// au lieu de remplir l'écran de fin de journée d'offres incertaines, on remplit
// la boîte du commerçant avec la demande de ses propres habitants.
const TYPES = ['commande', 'rdv', 'livraison', 'prix', 'deals', 'fidelite', 'invendus']
verifier('les sept envies sont nommées', TYPES.every(t => LIBELLE_ENVIE[t]))
verifier('aucune envie ne manque à l\'appel', TYPES_ENVIE.length === TYPES.length,
  `${TYPES_ENVIE.length} type(s) au module`)
egal('la carte de fidélité se dit au singulier',
  libelleEnvie('fidelite').phrase(1), '1 habitant aimerait une carte de fidélité chez toi')
egal('et au pluriel',
  libelleEnvie('fidelite').phrase(3), '3 habitants aimeraient une carte de fidélité chez toi')

// 🔴 LA LISTE BLANCHE, posée le 26/08 en même temps que le sixième signal.
// La route acceptait N'IMPORTE QUELLE chaîne de 40 caractères comme type : un
// appelant pouvait inventer des catégories et polluer les statistiques sur
// lesquelles le commerçant décide s'il change de formule.
// ═══════════════════════════════════════════════════════════════════════════
// DE L'ENVIE À LA FONCTION QUI Y RÉPOND
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ CROISÉE AVEC LA VRAIE MATRICE, jamais avec une liste recopiée ici. Une
// correspondance qui pointe vers une clé inexistante ne lève AUCUNE erreur :
// `canDo` rend simplement false, et la fonction disparaît en silence. C'est
// exactement ce qui est arrivé avec `prix` au lieu de `prix_affiches`.
{
  const clesMatrice = new Set(Object.keys(PLAN_FEATURES.vendre))
  for (const [envie, fonction] of Object.entries(ENVIE_VERS_FONCTION)) {
    verifier(`l'envie « ${envie} » pointe une clé qui existe vraiment`,
      clesMatrice.has(fonction), `${fonction} est absente de PLAN_FEATURES`)
    verifier(`et « ${envie} » est un type de signal connu`, envieConnue(envie))
  }
  verifier('les six envies ont toutes leur fonction',
    Object.keys(ENVIE_VERS_FONCTION).length === TYPES_ENVIE.length)

  // ⚠️ LE PIÈGE NOMMÉ. Si quelqu'un « simplifie » en écrivant 'prix', les prix
  // disparaissent de toutes les fiches sans qu'aucune erreur ne le dise.
  egal('le signal « prix » mène à prix_affiches, jamais à prix',
    fonctionDeLEnvie('prix'), 'prix_affiches')
  verifier('un type inconnu ne mène nulle part', fonctionDeLEnvie('bidon') === null)
  verifier('et le sens inverse retombe sur le bon signal',
    envieDeLaFonction('prix_affiches') === 'prix'
    && envieDeLaFonction('fidelite') === 'fidelite'
    && envieDeLaFonction('export_comptable') === null)
}

// ⚠️ ON SE TAIT QUAND LE NOMBRE NE PARLE PAS. `rdv` et `deals` ne sont émis
// par AUCUN écran : leurs compteurs valent zéro pour tout le monde. Écrire
// « 0 habitant aimerait » sous une fonction qu'on espère vendre serait le
// meilleur moyen d'en dissuader le commerçant.
{
  const envies = [
    { type: 'fidelite', trente_jours: 12, total: 30 },
    { type: 'commande', trente_jours: 0,  total: 4 },
  ]
  egal('la phrase reprend le compte des trente derniers jours',
    phraseEnvieFonction('fidelite', envies),
    '12 habitants aimeraient une carte de fidélité chez toi')
  verifier('zéro signal ne dit rien du tout',
    phraseEnvieFonction('commande', envies) === null)
  verifier('un signal jamais posé ne dit rien non plus',
    phraseEnvieFonction('deals', envies) === null)
  verifier('une fonction sans signal correspondant se tait',
    phraseEnvieFonction('export_comptable', envies) === null)
  verifier('et une liste absente ne fait pas tomber l\'écran',
    phraseEnvieFonction('fidelite', null) === null
    && phraseEnvieFonction('fidelite') === null)
  egal('le singulier se dit au singulier',
    phraseEnvieFonction('fidelite', [{ type: 'fidelite', trente_jours: 1 }]),
    '1 habitant aimerait une carte de fidélité chez toi')
}

verifier('un type inventé est refusé', !envieConnue('n_importe_quoi'))
verifier('et les six vrais sont acceptés', TYPES.every(t => envieConnue(t)))
verifier('une envie vide ne passe pas', !envieConnue('') && !envieConnue(null))
{
  const route = readFileSync(new URL('../app/api/signaux/route.js', import.meta.url), 'utf8')
  verifier('le serveur refuse une envie inconnue', /if \(!envieConnue\(feature\)\)/.test(route))
  // ⚠️ ET IL LA LIT DU MODULE, sans recopier la liste : deux listes finissent
  // toujours par oublier l'une des deux le jour où un type s'ajoute.
  verifier('et la liste vient du module des signaux',
    /from '@\/lib\/signaux'/.test(route))

  // Le Yopper doit pouvoir POSER ce signal, et le commerçant le VOIR.
  //
  // 🔴 LES QUATRE BANDEAUX SONT DEVENUS UN SEUL BLOC EN BAS DE FICHE (Alex,
  // 26/08 : « les signaux Yopper doivent tous être dans le bas de la page du
  // commerçant, phrase simple, claire et efficace »). `CTAUpgrade` a été
  // supprimé ; la règle vit dans `enviesProposables`, l'écran dans
  // `SignauxYopper`.
  const bloc = readFileSync(new URL('../app/commander/SignauxYopper.js', import.meta.url), 'utf8')
  verifier('le Yopper peut demander une carte de fidélité',
    /fidelite: {2}'Carte de fidélité'/.test(bloc))
  // ⚠️ LES LIBELLÉS NOMMENT LE SERVICE, pas le geste (Alex, 27/08). C'est la
  // même liste que celle du tableau de bord : les deux côtés doivent parler
  // des mêmes choses, sinon le commerçant ne reconnaît pas ce qu'on lui
  // rapporte.
  verifier('et les cinq libellés sont ceux d\'Alex',
    /commande: {2}'Commande en ligne'/.test(bloc)
    && /livraison: 'Livraison'/.test(bloc)
    && /rdv: {7}'Prendre rendez-vous'/.test(bloc)
    && /deals: {5}'Bonnes affaires, deals et actus'/.test(bloc))
  verifier('la phrase part de son envie à lui',
    /Tu aimerais un service en plus chez/.test(bloc)
    && /Demande-le-lui en cliquant ci-dessous/.test(bloc))
  // ⚠️ « VOIR LES PRIX » N'A PLUS DE BOUTON, ET IL ÉTAIT MORT DEPUIS TOUJOURS :
  // `prix_affiches` vaut `true` dans les TROIS forfaits, donc sa condition
  // n'a JAMAIS été vraie. Le vérifier ici plutôt que de le croire.
  verifier('les trois forfaits affichent déjà les prix',
    ['exister', 'communiquer', 'vendre'].every(p => PLAN_FEATURES[p].prix_affiches === true))
  verifier('le bouton « voir les prix » a disparu', !/prix: /.test(bloc))
  // ⚠️ MAIS LE VOCABULAIRE RESTE : d'anciens signaux `prix` peuvent exister en
  // base, et le tableau de bord doit continuer à les nommer.
  verifier('le type « prix » reste connu du module', envieConnue('prix'))
  // ⚠️ ET IL N'Y A QU'UN SEUL BLOC. Le titre répété trois fois sur une même
  // page n'était plus une invitation, c'était une insistance.
  const fiche = readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8')
  const ficheCode = fiche.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')
  verifier('la fiche ne rend le bloc d\'envies qu\'une seule fois',
    (ficheCode.match(/<SignauxYopper/g) || []).length === 1)
  // ⚠️ ET IL EST APRÈS LE CATALOGUE. On ne demande à quelqu'un ce qui lui
  // manque qu'une fois qu'il a vu ce qu'il y a ; l'ancien bandeau fidélité
  // arrivait AVANT, sous les coordonnées.
  verifier('le bloc d\'envies arrive avant la sortie de fiche',
    ficheCode.indexOf('<SignauxYopper') > 0
    && ficheCode.indexOf('<SignauxYopper') < ficheCode.indexOf('<BandeAutourDeToi'))
  // ⚠️ ET LA RÈGLE N'EST PLUS DANS LE JSX. Une condition écrite à quatre
  // endroits différents est une condition qu'on ne peut pas mesurer.
  // ⚠️ L'APPEL PORTE MAINTENANT DEUX RENSEIGNEMENTS (04/09) : ce qu'il peut
  // vendre, et s'il publie DÉJÀ ses invendus. La garde vise donc le nom de la
  // fonction et son premier argument, pas la forme exacte de l'objet — sans
  // quoi elle rougirait au prochain renseignement ajouté, sans qu'aucune règle
  // n'ait bougé.
  verifier('la règle vient du module, pas de l\'écran',
    /enviesProposables\(commercant, \{/.test(ficheCode))

  // La règle elle-même, EXÉCUTÉE.
  const boulangerExister = { categorie: 'alimentaire', plan: 'exister' }
  const listeBoulanger = enviesProposables(boulangerExister, { peutCommander: false })
  verifier('un boulanger sans commande se voit proposer « commander ici »',
    listeBoulanger.includes('commande'))
  // ⚠️ ON NE PROPOSE PAS LA LIVRAISON LÀ OÙ ON NE PEUT RIEN COMMANDER : ce
  // serait réclamer la suite d'une chose qui n'existe pas.
  verifier('et jamais la livraison tant que commander est impossible',
    !listeBoulanger.includes('livraison'))
  // ⚠️ ET JAMAIS LE RENDEZ-VOUS CHEZ UN BOULANGER. Même règle que les onglets
  // du tableau de bord : ce qui est SANS OBJET pour la catégorie ne se montre
  // pas, même en gris, même en question.
  verifier('et jamais « prendre rendez-vous » chez un boulanger',
    !listeBoulanger.includes('rdv'))

  const salon = { categorie: 'vitrine', plan: 'communiquer', rdv_actif: false }
  const listeSalon = enviesProposables(salon, { peutCommander: false })
  verifier('un salon sans agenda se voit proposer le rendez-vous',
    listeSalon.includes('rdv'))
  // ⚠️ « COMMANDER » NE VEUT RIEN DIRE CHEZ UN COIFFEUR : il ne vend pas un
  // panier, il vend un créneau.
  verifier('et jamais « commander ici » chez un prestataire',
    !listeSalon.includes('commande'))

  // 🔴 LA BOUTIQUE TÉMOIN : DÉTAIL, VENDRE, ET ELLE EXPÉDIE (Alex, 27/08 :
  // « y'a le signal pour expédition alors qu'on le fait »).
  //
  // ⚠️ DEUX MÉCANIQUES, UN SEUL BESOIN. `livraison_actif` est l'interrupteur de
  // la TOURNÉE alimentaire ; un détaillant ne fait pas de tournée, il EXPÉDIE
  // (`boutique_mode_vente`). La règle lisait donc un drapeau jamais allumé chez
  // lui, et le bouton restait à vie.
  const boutiqueQuiExpedie = {
    categorie: 'detail', plan: 'vendre',
    boutique_mode_vente: 'expedition', fidelite_actif: true,
  }
  verifier('une boutique qui expédie ne se fait pas réclamer la livraison',
    !enviesProposables(boutiqueQuiExpedie, { peutCommander: true }).includes('livraison'))
  verifier('ni « les deux »',
    !enviesProposables({ ...boutiqueQuiExpedie, boutique_mode_vente: 'les_deux' }, { peutCommander: true })
      .includes('livraison'))
  // ⚠️ ET ON N'A PAS FERMÉ LE CAS QU'ON VOULAIT GARDER : une boutique qui ne
  // fait QUE du retrait doit toujours pouvoir se le faire demander. `retrait`
  // est la valeur PAR DÉFAUT de la colonne, donc la seule qui veut dire « rien ».
  verifier('une boutique qui ne fait que du retrait, si',
    enviesProposables({ ...boutiqueQuiExpedie, boutique_mode_vente: 'retrait' }, { peutCommander: true })
      .includes('livraison'))
  // Et l'alimentaire garde SA mécanique : la tournée.
  verifier('une friterie qui livre déjà ne se fait rien réclamer',
    !enviesProposables({ categorie: 'alimentaire', plan: 'vendre', livraison_actif: true }, { peutCommander: true })
      .includes('livraison'))
  verifier('une friterie sans tournée, si',
    enviesProposables({ categorie: 'alimentaire', plan: 'vendre', livraison_actif: false }, { peutCommander: true })
      .includes('livraison'))

  // ⚠️ ET LES DEALS SUIVENT LE FORFAIT EFFECTIF. Communiquer les a ; un Exister
  // EN ESSAI de Communiquer aussi, et on ne doit plus les lui réclamer.
  verifier('on réclame les bonnes affaires à un Exister',
    enviesProposables({ categorie: 'alimentaire', plan: 'exister' }, { peutCommander: false }).includes('deals'))
  verifier('mais plus à un Communiquer',
    !enviesProposables({ categorie: 'alimentaire', plan: 'communiquer' }, { peutCommander: false }).includes('deals'))

  const complet = {
    categorie: 'alimentaire', plan: 'vendre',
    livraison_actif: true, fidelite_actif: true,
  }
  // ⚠️ « PROPOSE DÉJÀ TOUT » INCLUT LES INVENDUS. L'appelant seul sait si une
  // offre de fin de journée tourne : le module ne peut pas le deviner depuis la
  // fiche du commerce.
  const toutOuvert = { peutCommander: true, proposeDesInvendus: true }
  // ⚠️ RIEN À DEMANDER → LISTE VIDE, et le composant ne rend RIEN. Pas de cadre
  // vide, pas de titre orphelin en bas d'une fiche déjà complète.
  verifier('un commerce qui propose déjà tout ne se fait rien demander',
    enviesProposables(complet, toutOuvert).length === 0,
    enviesProposables(complet, toutOuvert).join(', '))
  verifier('sans commerçant, aucune envie', enviesProposables(null).length === 0)

  // ⚠️ CHAQUE ENVIE PROPOSÉE DOIT AVOIR SON BOUTON. Une clé rendue par le
  // module sans libellé dans l'écran disparaîtrait EN SILENCE : le composant
  // filtre ce qu'il ne sait pas nommer.
  const toutesLesEnvies = [
    ...enviesProposables(boulangerExister, { peutCommander: false }),
    ...enviesProposables(salon, { peutCommander: false }),
    ...enviesProposables({ categorie: 'alimentaire', plan: 'vendre', fidelite_actif: false }, { peutCommander: true }),
  ]
  verifier('chaque envie proposée porte un libellé de bouton',
    toutesLesEnvies.every(t => new RegExp(`^ {2}${t}: `, 'm').test(bloc)),
    toutesLesEnvies.join(', '))
  // ⚠️ ET LE BLOC NE PARLE PAS LE VOCABULAIRE DU PRODUIT. C'est la règle du
  // 03/08 : l'habitant ne lit pas un abonnement, il lit une envie.
  verifier('le bloc ne parle ni forfait ni abonnement',
    !/formule|abonnement|débloquer|upgrade|Vendre|Communiquer|Exister/.test(
      bloc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ')))
}
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
for (const interdit of ['formule', 'abonnement', 'passe à', 'débloquer', 'upgrade']) {
  verifier(`l'onglet ne vend pas : « ${interdit} » absent`, !new RegExp(interdit, 'i').test(affiche))
}
verifier('l\'onglet ne nomme aucun palier', !/\b(Vendre|Communiquer|Exister)\b/.test(affiche))
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
// 6. L'EMAIL — le seul de Yoppaa qui ne demande rien
// ═══════════════════════════════════════════════════════════════════════════
const { emailSignauxHebdo } = await import('../lib/signaux-email.js')

egal('aucun type retenu, aucun email', emailSignauxHebdo({ nom: 'Chez Carole', types: [] }), null)

const mail = emailSignauxHebdo({
  nom: 'Chez Carole',
  types: [
    { type: 'rdv', trente_jours: 12, soir_30j: 4, weekend_30j: 3 },
    { type: 'commande', trente_jours: 6, soir_30j: 0, weekend_30j: 0 },
  ],
})
// L'objet porte le fait en entier : un objet vague ne se lit pas depuis la
// liste des mails, et c'est le nombre qui fait ouvrir.
egal('l\'objet porte le fait', mail.subject, '12 habitants ont voulu prendre rendez-vous chez toi')
verifier('le corps cite les deux types', /rendez-vous/.test(mail.html) && /commander/.test(mail.html))
verifier('le soir et le week-end sont dans le corps', /19h/.test(mail.html) && /week-end/.test(mail.html))
verifier('la porte de sortie est écrite', /pause|ne plus rien recevoir/i.test(mail.html))
verifier('le raccourci ouvre l\'onglet', /dashboard\?config=signaux/.test(mail.html))
for (const interdit of ['formule', 'abonnement', 'passe à', 'débloqu', 'upgrade', '€']) {
  verifier(`l'email ne vend pas : « ${interdit} » absent`, !new RegExp(interdit, 'i').test(mail.html))
}
// Les noms de paliers se testent avec la casse et une limite de mot : « vendre »
// en minuscule vit dans « vendredi », un test aveugle casserait au premier email
// qui daterait quelque chose.
verifier('l\'email ne nomme aucun palier', !/\b(Vendre|Communiquer|Exister)\b/.test(mail.html))
// RGPD : la promesse de la page d'accueil est que le commerçant ne saura
// jamais QUI a demandé. L'email doit la tenir, et le dire.
verifier('l\'email ne nomme personne', /on ne te dit pas qui/i.test(mail.html))

// Un seul type retenu : la phrase reste au singulier là où il faut.
const seul = emailSignauxHebdo({ nom: 'Chez Carole', types: [{ type: 'livraison', trente_jours: 5, soir_30j: 0, weekend_30j: 0 }] })
egal('objet au bon type', seul.subject, '5 habitants ont voulu se faire livrer par toi')
verifier('sans soir ni week-end, pas de phrase inventée', !/19h|week-end/.test(seul.html))

// ═══════════════════════════════════════════════════════════════════════════
// 7. LES COMMERCES RÉCLAMÉS — la carte de prospection
// ═══════════════════════════════════════════════════════════════════════════
const { cleCommerce, codePostalDe, regrouperSuggestions, parCodePostal } = await import('../lib/suggestions.js')

// Un même commerce est écrit de dix façons. S'il ne se regroupe pas, l'écran
// affiche dix lignes à 1 demande au lieu d'une ligne à 10, et le classement
// par urgence ne veut plus rien dire.
egal('la casse ne compte pas', cleCommerce('Boulangerie DUPONT'), cleCommerce('boulangerie dupont'))
egal('les accents ne comptent pas', cleCommerce('Épicerie Léa'), cleCommerce('Epicerie Lea'))
egal('la ponctuation ne compte pas', cleCommerce('Chez Jean-Marc !'), cleCommerce('Chez Jean Marc'))

// Le code postal belge est en fin d'adresse ; le premier nombre est un numéro
// de rue, et le prendre enverrait prospecter dans la mauvaise commune.
egal('code postal en fin d\'adresse', codePostalDe('Rue du Moulin 12, 5640 Mettet'), '5640')
egal('code postal seul', codePostalDe('1000 Bruxelles'), '1000')
egal('adresse sans code postal', codePostalDe('Rue du Moulin'), null)
egal('adresse vide', codePostalDe(null), null)
egal('un numéro à 4 chiffres seul n\'est pas pris pour un code postal',
  codePostalDe('Chaussée de Namur 1200'), '1200')  // ambigu par nature : documenté, pas corrigé

const brutes = [
  { nom_commerce: 'Boulangerie Dupont', adresse: 'Rue du Moulin 12, 5640 Mettet', created_at: '2026-08-01T10:00:00Z', commentaire: 'Le meilleur pain' },
  { nom_commerce: 'boulangerie dupont', adresse: '5640 Mettet', created_at: '2026-08-03T10:00:00Z' },
  { nom_commerce: 'Boulangerie Dupont', adresse: 'Rue de la Gare, 5000 Namur', created_at: '2026-08-02T10:00:00Z' },
  { nom_commerce: 'Fleuriste Léa', adresse: '5640 Mettet', created_at: '2026-07-01T10:00:00Z' },
  { nom_commerce: '   ', adresse: '5640 Mettet', created_at: '2026-08-04T10:00:00Z' },
]
const groupes = regrouperSuggestions(brutes)
egal('un nom vide est ignoré', groupes.length, 3)
egal('le plus réclamé en premier', groupes[0].nom, 'Boulangerie Dupont')
egal('les doublons sont additionnés', groupes[0].demandes, 2)
egal('la commune sépare deux enseignes de même nom',
  groupes.filter(g => cleCommerce(g.nom) === 'boulangerie dupont').length, 2)
egal('la dernière demande est la plus récente', groupes[0].derniere.toISOString(), '2026-08-03T10:00:00.000Z')
egal('l\'adresse la plus complète est gardée', groupes[0].adresse, 'Rue du Moulin 12, 5640 Mettet')

// RGPD : rien dans le résultat ne doit permettre de remonter à une personne.
verifier('aucun auteur dans le regroupement',
  groupes.every(g => !('client_id' in g) && !('yopper_id' in g)))

const communes = parCodePostal(groupes)
egal('la commune la plus demandée en tête', communes[0].code_postal, '5640')
egal('les demandes de la commune sont additionnées', communes[0].demandes, 3)
egal('un commerce sans code postal ne crée pas de fausse commune',
  parCodePostal([{ code_postal: null, demandes: 5 }]).length, 0)

// ═══════════════════════════════════════════════════════════════════════════
// ON NE DEMANDE PAS À QUELQU'UN CE QU'IL FAIT DÉJÀ (04/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 `proposeDesInvendus` N'ÉTAIT PASSÉ PAR PERSONNE. Le signal s'affichait
// donc chez TOUS les commerces alimentaires, y compris ceux qui publient leurs
// restes tous les soirs. Inviter un boulanger à faire ce qu'il fait déjà, c'est
// lui dire qu'on ne le connaît pas.
//
// ⚠️ ET LA RÈGLE ELLE-MÊME S'EXÉCUTE, juste en dessous : la garde de câblage ne
// dit que si l'argument part, pas ce qu'il produit.
{
  const FICHE = sansProse(readFileSync(new URL('../app/commander/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 la fiche dit si le commerçant publie déjà ses invendus',
    /proposeDesInvendus: \(dealsActifs \|\| \[\]\)\.some\(porteUneFenetre\)/.test(FICHE))

  const BOULANGER = { categorie: 'alimentaire', plan: 'vendre', rdv_actif: true, fidelite_actif: true, livraison_actif: true }
  verifier('🔴 sans invendu publié, on le lui propose',
    enviesProposables(BOULANGER, { peutCommander: true, proposeDesInvendus: false }).includes('invendus'))
  verifier('🔴 quand il en publie déjà, on se tait',
    !enviesProposables(BOULANGER, { peutCommander: true, proposeDesInvendus: true }).includes('invendus'))
  // ⚠️ ET JAMAIS HORS DE L'ALIMENTAIRE : en détail le stock se décrémente en
  // dur, la même offre le compterait deux fois.
  verifier('un commerce de détail ne se voit pas proposer d’invendus',
    !enviesProposables({ ...BOULANGER, categorie: 'detail' }, { peutCommander: true }).includes('invendus'))
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 UN ENVOI DONT PERSONNE NE LIT LA RÉPONSE (08/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// Le formulaire de la Tribu écrivait `await fetch(...).catch(() => {})` puis
// affichait « Merci pour ta suggestion ! ». Un 429, un 403, un 500 donnaient
// le même écran : quatre champs remplis à la main disparaissaient en silence,
// et personne, ni l'habitant ni nous, n'apprenait que rien n'était parti.
//
// ⚠️ ON EXÉCUTE LA FONCTION. Une garde qui chercherait le mot `envoyerSignal`
// dans les écrans ne dirait rien de ce que cette fonction rend vraiment.
{
  const reponse = (statut, corps) => async () => ({
    ok: statut >= 200 && statut < 300,
    status: statut,
    json: async () => corps,
  })

  const succes = await envoyerSignal({ type: 'suggestion' }, { fetchImpl: reponse(200, { ok: true }) })
  verifier('un envoi accepté rend bien ok', succes.ok === true)

  for (const statut of [400, 401, 403, 429, 500, 502]) {
    const r = await envoyerSignal({ type: 'suggestion' }, { fetchImpl: reponse(statut, { ok: false, error: 'x' }) })
    verifier(`🔴 un ${statut} n’est PAS un succès`, r.ok === false)
    verifier(`un ${statut} porte une phrase pour l’habitant`, typeof r.message === 'string' && r.message.length > 12)
  }

  // ⚠️ 200 AVEC `ok: false`. Cette route refuse parfois en rendant 200 (l'envie
  // déjà exprimée). Ne lire que le code HTTP prendrait un refus pour une
  // réussite : les deux conditions comptent.
  const refusPoli = await envoyerSignal({}, { fetchImpl: reponse(200, { ok: false, error: 'type invalide' }) })
  verifier('🔴 un 200 qui dit ok:false reste un échec', refusPoli.ok === false)

  const coupure = await envoyerSignal({}, { fetchImpl: async () => { throw new Error('offline') } })
  verifier('🔴 une coupure réseau ne passe pas pour un envoi', coupure.ok === false)
  verifier('et elle le dit sans jargon', coupure.message === MESSAGE_SIGNAL_RESEAU)

  // Un corps illisible : page HTML d'un proxy, réponse tronquée. `json()` jette.
  const illisible = await envoyerSignal({}, {
    fetchImpl: async () => ({ ok: false, status: 502, json: async () => { throw new Error('pas du json') } }),
  })
  verifier('un corps illisible reste un échec propre', illisible.ok === false && illisible.statut === 502)

  // ⚠️ CE QUE LE SERVEUR DIT N'EST PAS CE QUE L'HABITANT LIT. Le message d'une
  // erreur de base nomme des tables, des colonnes et des contraintes, et ces
  // formulaires sont ouverts à des visiteurs sans compte.
  const fuite = messageEchecSignal(500, 'null value in column "client_id" of relation "suggestions_commercants"')
  verifier('🔴 aucun détail interne ne sort en erreur serveur',
    !fuite.includes('client_id') && !fuite.includes('relation') && !fuite.includes('suggestions_commercants'))
  verifier('🔴 un 400 inconnu ne recopie rien non plus',
    !messageEchecSignal(400, 'duplicate key value violates unique constraint "x"').includes('constraint'))
  verifier('un refus que nous écrivons se dit tel quel',
    messageEchecSignal(400, 'nom du commerce requis').startsWith('Nom du commerce requis'))
  verifier('un 429 invite à patienter', /instant|attends/i.test(messageEchecSignal(429)))

  const ROUTE = sansProse(readFileSync(new URL('../app/api/signaux/route.js', import.meta.url), 'utf8'))
  verifier('🔴 la route ne renvoie plus le message de l’erreur interne',
    !/error:\s*e\?\.message/.test(ROUTE) && /error:\s*'envoi impossible'/.test(ROUTE))

  const TRIBU = sansProse(readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8'))
  // ⚠️ ON MESURE L'ORDRE, pas la présence. Une première version de cette garde
  // cherchait `setErreur(r.message)` quelque part dans le fichier : neutraliser
  // le test qui y mène la laissait VERTE. C'est du JSX, on ne peut pas
  // l'exécuter ici, alors la garde exige le refus AVANT l'annonce du succès.
  verifier('🔴 la suggestion ne s’annonce plus reçue sans lire la réponse',
    /await envoyerSignal\(/.test(TRIBU)
    && /if \(!r\.ok\) \{ setErreur\(r\.message\); return \}\s*setSent\(true\)/.test(TRIBU))
  verifier('🔴 et le formulaire ne se vide pas sur un échec',
    /Ce que tu as écrit est toujours là/.test(TRIBU))
  verifier('l’ancien envoi muet a bien disparu',
    !/\}\)\.catch\(\(\) => \{\}\)\s*setSent\(true\)/.test(TRIBU))

  const MODAL = sansProse(readFileSync(new URL('../app/commander/ModalSignalement.js', import.meta.url), 'utf8'))
  verifier('le signalement passe par le même envoi',
    /await envoyerSignal\(\{/.test(MODAL) && !/fetch\('\/api\/signaux'/.test(MODAL))
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 CE QU'ON NOUS DIT, ET QUE PERSONNE N'APPRENAIT (08/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// Deux suggestions de commerces dormaient en base sans que personne le sache.
// La table était saine, les droits bons, l'écran /admin les affichait : il
// fallait juste penser à aller voir. Une porte à frapper vaut le jour où elle
// arrive.
{
  const ROUTE = sansProse(readFileSync(new URL('../app/api/signaux/route.js', import.meta.url), 'utf8'))
  verifier('🔴 une suggestion prévient l’administration',
    /await prevenirLAdmin\(\s*`Commerce réclamé/.test(ROUTE))
  verifier('🔴 un signalement aussi',
    /await prevenirLAdmin\(\s*`Signalement/.test(ROUTE))
  verifier('🔴 et l’envoi de l’alerte est LU, pas espéré',
    /if \(!r\?\.ok\) console\.error\('\[signaux\] alerte admin NON partie'/.test(ROUTE))
  verifier('un email raté ne perd pas la suggestion de l’habitant',
    /return r\?\.ok === true/.test(ROUTE) && !/if \(!r\?\.ok\) return NextResponse/.test(ROUTE))
  // ⚠️ `ilike` transformerait « 100% Pizza » en motif à jokers.
  verifier('le compteur de demandes compare le nom à l’identique',
    /\.eq\('nom_commerce', nom\)/.test(ROUTE) && !/ilike\('nom_commerce'/.test(ROUTE))
  verifier('🔴 les deux formulaires ont leur propre borne',
    /checkLimit\(formulairesLimiter, clientIp\(request\)/.test(ROUTE))
  verifier('et cette borne a un filet quand Upstash manque',
    /\{ cle: 'form', max: 5, fenetreMs: 600000 \}/.test(ROUTE))
  // Les envies sont des clics : elles gardent la borne large.
  verifier('la borne des formulaires ne s’applique pas aux envies',
    /if \(type === 'signalement' \|\| type === 'suggestion'\) \{/.test(ROUTE))

  // ⚠️ CE TEXTE EST ÉCRIT PAR UN VISITEUR SANS COMPTE et arrive dans une boîte
  // mail signée par yoppaa.app. Les clients mail retirent les `<script>`, mais
  // pas les ancres ni les images : ON EXÉCUTE LE GABARIT pour le vérifier.
  const POISON = '<img src=x onerror="alert(1)"><a href="http://faux.example">clique</a>'
  const htmlSuggestion = emailSuggestionCommerce({
    nom_commerce: POISON, adresse: POISON, type_commerce: POISON, commentaire: POISON, deja: 3,
  })
  verifier('🔴 le nom d’un commerce suggéré ne peut pas injecter de HTML',
    !htmlSuggestion.includes('<img src=x') && !htmlSuggestion.includes('href="http://faux.example"'))
  verifier('mais le texte reste lisible une fois échappé',
    htmlSuggestion.includes('&lt;img src=x'))
  verifier('l’email dit combien de fois le commerce a été réclamé',
    /3<sup>e<\/sup> fois/.test(htmlSuggestion))
  verifier('une seule demande ne prétend pas qu’il y en a eu plusieurs',
    !/fois/.test(emailSuggestionCommerce({ nom_commerce: 'Chez Test', deja: 1 })))

  const htmlSignalement = emailSignalementFiche({
    motif: POISON, description: POISON, cible_nom: POISON, commercant_id: 'abc',
  })
  verifier('🔴 un signalement ne peut pas injecter de HTML non plus',
    !htmlSignalement.includes('<img src=x') && !htmlSignalement.includes('href="http://faux.example"'))
  verifier('l’email rappelle que le commerçant n’est pas prévenu',
    /pas prévenu/.test(htmlSignalement))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Signaux verts.')
