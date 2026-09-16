// Banc de LA PORTE DU TABLEAU DE BORD.
//
// Ce qui peut se casser ici ne se voit pas :
//
//   ⚠️ UN COMMERÇANT NON VALIDÉ ENTRE, OU UN COMMERÇANT VALIDÉ RESTE DEHORS.
//
// Les deux sont silencieux. Le premier ne se remarque que le jour où Alex
// découvre un espace ouvert qu'il n'a jamais validé. Le second est pire : le
// commerçant se croit expulsé, il n'écrit même pas, il s'en va.
//
// Le banc tient donc trois promesses :
//   1. la règle est EXÉCUTÉE sur chaque état réel de la base, y compris le
//      `actif` posé à la main qui n'apparaît nulle part dans le code ;
//   2. chaque refus a sa RAISON, parce qu'une porte fermée sans explication
//      est la pire des réponses ;
//   3. l'écran est bien MONTÉ, et l'admin n'est jamais bloqué.

import { readFileSync, readdirSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  accesDashboard, STATUTS_ACCES_AUTORISE,
  RAISON_OK, RAISON_AUCUN_COMPTE, RAISON_ONBOARDING, RAISON_REJETE, RAISON_ATTENTE,
  // ⚠️ IMPORTÉES POUR ÊTRE EXÉCUTÉES : l'autre porte, celle de la fiche.
  fichePubliee, COLONNE_PUBLICATION, PUBLICATION_OUVERTE,
  attenteDepuis, joursOuvresEntre,
  remplissageInscription, CHAMPS_INSCRIPTION, dossiersEnRetard,
} from '../lib/statut-commercant.js'
// ⚠️ IMPORTÉE POUR ÊTRE EXÉCUTÉE, avec un faux client Supabase : c'est la
// seule façon de savoir ce que la file RÉPOND, et non ce qu'elle a l'air de
// répondre. Le résolveur d'alias de `verif:acces` rend ce module atteignable.
import { inscrire } from '../lib/attente-rdv-server.js'
// ⚠️ IMPORTÉES POUR ÊTRE EXÉCUTÉES : cette règle décide d'écrire à de vraies
// personnes, et une relance en double ne se rattrape pas.
import { raisonPasDeRelance, trierPourRelance, COLONNES_RELANCE } from '../lib/relance-inscription.js'
// ⚠️ IMPORTÉE POUR ÊTRE EXÉCUTÉE : c'est elle qui décide si un `+alias` reste
// distinct de l'adresse administrateur, donc si douze comptes de test restent
// douze commerçants ordinaires.
import { normaliserEmail, memeEmail } from '../lib/email-normalise.js'
// ⚠️ IMPORTÉES POUR ÊTRE EXÉCUTÉES : « Voir Dashboard », sa durée et son
// stockage (15/09, trouvé par Alex).
import {
  DUREE_IMPERSONATION_MS, raisonImpersonationRefusee, finImpersonation, ligneExpiree, finAInscrire,
  compteAChange, poserImpersonation, lireImpersonation, effacerImpersonation, messageImpersonation,
} from '../lib/impersonation.js'

// ⚠️ On NORMALISE LES FINS DE LIGNE. Git rend ces fichiers en CRLF sous
// Windows, et une expression qui cherche `return\n` ne trouve alors rien : la
// garde passe au vert sans avoir rien vérifié. Ce piège a déjà fait échouer des
// remplacements en silence dans ce projet.
const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
// ⚠️ COMPTER, PAS CHERCHER. Une garde qui teste la présence d'un mot reste
// verte quand ce mot vit à deux endroits et qu'on n'en abîme qu'un. Ce piège
// s'est présenté trois fois dans la soirée du 30/08.
const egalNombre = (nom, obtenu, attendu) =>
  verifier(nom, obtenu === attendu, `obtenu ${obtenu}, attendu ${attendu}`)

function sansCommentaires(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
}

// ═══ 1. LES ÉTATS RÉELS DE LA BASE ═══════════════════════════════════════
// Relevé fait par Alex le 20/08 sur les 8 comptes existants. Ce sont eux qui
// doivent passer, pas des cas imaginaires.
{
  const RELEVE = [
    { nom: '6 comptes complets',     c: { statut: 'valide', statut_publication: 'publie', kyb_statut: 'valide' },      passe: true },
    { nom: 'le compte « actif »',    c: { statut: 'actif',  statut_publication: 'publie', kyb_statut: 'non_demarre' }, passe: true },
    { nom: 'validé, KYB non démarré', c: { statut: 'valide', statut_publication: 'publie', kyb_statut: 'non_demarre' }, passe: true },
  ]
  for (const cas of RELEVE) {
    const v = accesDashboard(cas.c)
    verifier(`${cas.nom} garde son accès`, v.autorise === cas.passe,
      `rendu ${v.autorise} (${v.raison})`)
  }

  // ⚠️ LA GARDE QUI COMPTE VRAIMENT ICI.
  // `actif` n'existe nulle part dans le code : il a été posé à la main. Le
  // retirer de la liste mettrait ce commerçant dehors du jour au lendemain,
  // sans que rien ne le signale. C'est la raison pour laquelle on ne devine
  // jamais un statut, on va le lire.
  verifier('le statut « actif » de la base est autorisé',
    STATUTS_ACCES_AUTORISE.includes('actif'),
    'un compte en production le porte, il serait expulsé')
  verifier('le statut « valide » du code est autorisé',
    STATUTS_ACCES_AUTORISE.includes('valide'))
  verifier("et la liste ne s'ouvre pas à n'importe quoi",
    STATUTS_ACCES_AUTORISE.length === 2, STATUTS_ACCES_AUTORISE.join(', '))
}

// ═══ 2. QUI RESTE DEHORS, ET AVEC QUELLE RAISON ══════════════════════════
{
  const REFUS = [
    { nom: 'aucune fiche',              c: null,
      raison: RAISON_AUCUN_COMPTE },
    { nom: 'inscription jamais soumise', c: { statut: null, statut_publication: 'brouillon' },
      raison: RAISON_ONBOARDING },
    { nom: 'soumis, pas encore validé',  c: { statut: null, statut_publication: 'en_attente' },
      raison: RAISON_ATTENTE },
    { nom: 'dossier rejeté',             c: { statut: 'rejete', statut_publication: 'en_attente', motif_rejet: 'Extrait BCE illisible' },
      raison: RAISON_REJETE },
    { nom: 'statut inconnu',             c: { statut: 'zorglub', statut_publication: 'publie' },
      raison: RAISON_ATTENTE },
  ]
  for (const cas of REFUS) {
    const v = accesDashboard(cas.c)
    verifier(`${cas.nom} n'entre pas`, v.autorise === false, `rendu ${v.autorise}`)
    verifier(`${cas.nom} : la raison est nommée`, v.raison === cas.raison,
      `rendu « ${v.raison} », attendu « ${cas.raison} »`)
  }

  // ⚠️ UN STATUT INCONNU DOIT FERMER, PAS OUVRIR.
  // C'est le sens de la liste blanche : une valeur ajoutée demain en base sans
  // que le code le sache laisse la porte close, elle ne l'ouvre pas.
  verifier('un statut jamais vu ferme la porte',
    accesDashboard({ statut: 'quelque_chose_de_neuf' }).autorise === false)

  // Le motif de rejet doit REMONTER : c'est la seule chose utile de cet écran.
  const rejet = accesDashboard({ statut: 'rejete', motif_rejet: 'Extrait BCE illisible' })
  verifier('le motif du rejet est transmis à l\'écran',
    rejet.motif === 'Extrait BCE illisible', String(rejet.motif))
  verifier('un rejet sans motif ne fabrique pas de texte',
    accesDashboard({ statut: 'rejete' }).motif === null)

  // Le rejet prime sur l'inscription inachevée : il est plus informatif, et il
  // appelle un geste précis.
  verifier('un rejet reste un rejet même en brouillon',
    accesDashboard({ statut: 'rejete', statut_publication: 'brouillon' }).raison === RAISON_REJETE)

  // Et l'accès accordé ne porte jamais de raison de refus.
  verifier('un accès accordé est marqué comme tel',
    accesDashboard({ statut: 'valide' }).raison === RAISON_OK)
}

// ═══ 3. LA PORTE EST-ELLE POSÉE ? ════════════════════════════════════════
// ⚠️ Une règle parfaite que personne n'appelle ne garde rien. C'est le défaut
// des quatre écrans d'accueil : vivants pendant des semaines, jamais montrés.
{
  const dash = lire('app/dashboard/page.js')
  const visible = sansCommentaires(dash)

  verifier('le tableau de bord lit la règle',
    /from '@\/lib\/statut-commercant'/.test(dash))
  verifier('et il APPELLE la règle sur la fiche chargée',
    /accesDashboard\(data\[0\]\)/.test(visible),
    'importer sans appeler ne garde rien')
  verifier('un refus interrompt le chargement',
    /if \(!verdict\.autorise\) \{[\s\S]{0,200}return\n/.test(visible))
  verifier("l'écran de refus est MONTÉ",
    /<EcranValidation[\s/>]/.test(visible))
  // ⚠️ `lastIndexOf` et non `indexOf` : la police est chargée DEUX fois dans ce
  // fichier, une première dans l'écran de choix du commerce, qui vient AVANT
  // la porte. Comparer à la première occurrence faisait échouer une garde
  // pourtant juste. Chercher au bon endroit, encore une fois.
  const posRefus = visible.indexOf('if (refusAcces) return')
  verifier('la garde de rendu existe', posRefus > -1)
  verifier('le refus se rend AVANT le tableau de bord',
    posRefus > -1 && posRefus < visible.lastIndexOf('<link href="https://fonts.googleapis.com'),
    'sinon le tableau de bord se peint quand même une fraction de seconde')

  // ⚠️ ET SURTOUT : le refus ne doit PAS rediriger vers /login. Une
  // redirection ferait croire à un problème de mot de passe alors que le
  // compte est parfaitement valide, juste pas encore ouvert.
  verifier('un refus ne renvoie pas vers /login',
    !/if \(!verdict\.autorise\)[\s\S]{0,160}router\.push\('\/login'\)/.test(visible),
    'la personne doit lire POURQUOI, pas croire à un mot de passe refusé')

  // L'admin regarde les dossiers en attente : c'est tout l'intérêt.
  // ⚠️ PRÉCISÉE LE 15/09, PAS DÉSARMÉE. Elle cherchait la clé du localStorage,
  // qui a quitté le tableau de bord : `indexOf` aurait rendu -1, donc « avant »
  // pour toujours, et la garde serait restée verte sans plus rien regarder.
  const posImpersonation = visible.indexOf('const imp = lireImpersonation()')
  verifier("l'impersonation admin sort AVANT la porte",
    posImpersonation > -1 && posImpersonation < visible.indexOf('accesDashboard(data[0])'),
    'Alex doit pouvoir ouvrir un dossier qu\'il n\'a pas encore validé')
}

// ═══ 4. CE QUE L'ÉCRAN DIT ═══════════════════════════════════════════════
// Une porte fermée sans sa raison est la pire des réponses. Chaque situation a
// son texte ET son geste.
{
  const ecran = sansCommentaires(lire('app/dashboard/EcranValidation.js'))

  verifier("l'attente annonce un délai",
    /sous 24 heures/.test(ecran),
    'sans délai, « en cours de validation » ne répond pas à la question posée')
  verifier("l'attente promet un email",
    /email dès que ton espace s&rsquo;ouvre/.test(ecran))
  verifier("l'attente rassure sur le travail déjà fait",
    /rien n&rsquo;est perdu/.test(ecran))
  verifier('le rejet montre le motif',
    /\{motif\}/.test(ecran))
  verifier('le rejet mène à la correction',
    /Corriger mon dossier/.test(ecran))
  verifier("l'inscription inachevée renvoie la finir",
    /Reprendre mon inscription/.test(ecran))
  verifier('on peut toujours se déconnecter',
    /onDeconnexion/.test(ecran))

  // ⚠️ Le rouge est réservé à ce qui DÉTRUIT. Un refus est une mauvaise
  // nouvelle, pas une destruction.
  verifier("le refus n'est pas peint en rouge",
    !/#DC2626|#EF4444/.test(ecran),
    'l\'ambre dit « à corriger », le rouge dit « perdu »')
  verifier("l'écran mesure en dvh, jamais en vh",
    !/[^d]vh\b/.test(ecran))
}

// ═══ LA PORTE DE L'ADMINISTRATION ═════════════════════════════════════════
//
// 🔴 UN CLIC DE L'ADMIN POUVAIT EFFACER SON PROPRE ACCÈS (30/08 au soir, trouvé
// en répondant à une question d'Alex sur le ménage dans ses comptes de test).
// La suppression d'un commerçant supprime l'utilisateur Auth rattaché, et le
// commerce « Kebabistro » était rattaché AU SIEN.
//
// ⚠️ CE N'EST PAS UNE SIMPLE PERTE D'ACCÈS, C'EST UNE PORTE QUI S'OUVRE. Être
// admin n'est pas « être ce compte », c'est « détenir cette adresse » :
// `is_yoppaa_admin()` teste `auth.email()`, et le code teste la même chaîne à
// vingt-cinq endroits. Le compte supprimé, l'adresse redevient libre, et la
// première personne qui s'y inscrit reprend tous les droits.
{
  const src = lire('app/api/admin/commercants/route.js')

  // ⚠️ ON MESURE LES DEUX CHEMINS, pas la présence d'un mot : l'identifiant du
  // demandeur, et l'adresse du compte visé. Une garde qui n'interroge qu'un
  // seul chemin se tait le jour où celui-là change.
  verifier('la suppression sait QUI la demande',
    /return \{ admin, user \}/.test(src))
  verifier('elle refuse d’effacer le compte du demandeur',
    /c\.auth_user_id === user\.id/.test(src))
  verifier('et elle refuse aussi par l’adresse du compte visé',
    /getUserById\(c\.auth_user_id\)/.test(src)
    && /vise\.user\.email === ADMIN_EMAIL/.test(src))

  // ⚠️ ET LES DEUX REFUS DISENT CE QU'ILS ÉVITENT. « Suppression impossible »
  // ferait cliquer une seconde fois ; ici il faut comprendre qu'on vient
  // d'éviter de donner Yoppaa à un inconnu.
  //
  // 🔴 ON COMPTE, ON NE CHERCHE PAS. Ma première version testait la présence de
  // « libérerait » dans le fichier : le mot vit dans les DEUX messages, donc en
  // abîmer un seul laissait la garde verte. Le harnais l'a dit, et c'est la
  // troisième fois de la soirée que je copie un mot au lieu de compter.
  const refus = [...src.matchAll(/error: 'compte_admin',\s*\n\s*message: `([^`]*)`/g)].map(m => m[1])
  egalNombre('les deux refus admin existent', refus.length, 2)
  egalNombre('et tous les deux disent ce qu’ils évitent',
    refus.filter(m => /libérerait/.test(m) && /adresse/.test(m)).length, 2)

  // 🔴 LE GARDE-FOU DES TRANSACTIONS PAYÉES NE COUVRE PAS CE CAS : un commerce
  // de test n'a aucun paiement, il passe donc sans qu'on lui demande rien. Les
  // deux gardes sont indépendantes, et celle de l'admin vient AVANT.
  // ⚠️ PRÉCISÉE LE 15/09, PAS DÉSARMÉE : le garde-fou des paiements est devenu
  // celui de l'HISTORIQUE (décision d'Alex). L'ordre, lui, ne change pas.
  const posAdmin = src.indexOf("error: 'compte_admin'")
  const posHistorique = src.indexOf("error: 'historique_a_conserver'")
  verifier('le refus admin passe avant le garde-fou de l’historique',
    posAdmin > 0 && posHistorique > 0 && posAdmin < posHistorique,
    `admin ${posAdmin}, historique ${posHistorique}`)

  // 🔴 ET L'EFFACEMENT DU COMPTE LIÉ SE LIT, il ne s'espère pas. Son échec
  // partait dans un `console.warn` que personne ne lit, et l'écran répondait
  // « supprimé » dans tous les cas.
  //
  // ⚠️ CE N'EST PAS UN DÉTAIL DE JOURNAL : supprimer un commerçant, c'est
  // répondre à une demande d'effacement. Un compte qui survit, c'est une
  // personne qui reste inscrite et peut encore se connecter, pendant que
  // Yoppaa la croit partie.
  verifier('l’effacement du compte lié lit son résultat',
    /const \{ error: errAuth \} = await admin\.auth\.admin\.deleteUser/.test(src))
  verifier('et il ne se contente plus d’un avertissement de console',
    !/deleteUser\(c\.auth_user_id\)\.catch\(\(e\) => console\.warn/.test(src))
  verifier('un échec remonte jusqu’à l’écran',
    /compte_supprime: compteSupprime/.test(src) && /avertissement:/.test(src))
  // ⚠️ `null` N'EST PAS `false`, huitième fois sur ce projet : « il n'y avait
  // aucun compte » et « le compte n'a pas pu être supprimé » ne se disent pas
  // de la même façon.
  verifier('« aucun compte » ne se confond pas avec « échec »',
    /let compteSupprime = null/.test(src))

  // ═══ 🔴 UN VRAI COMMERÇANT S'ARCHIVE, IL NE S'EFFACE JAMAIS (Alex, 15/09) ═══
  //
  // Le garde-fou ne comptait que les paiements EN LIGNE : les commandes payées
  // au comptoir, les réservations sans acompte, les bons, les abonnements et
  // les SMS achetés à Yoppaa partaient avec le commerçant. Et il se contournait
  // d'un clic « Supprimer quand même (test) ».
  // ⚠️ ON LIT LE CODE, PAS LA PROSE : les commentaires de la route racontent
  // précisément ce qu'on vient d'en retirer.
  const codeSuppression = src.slice(src.indexOf('export async function DELETE'))
    .replace(/^[ \t]*\/\/.*$/gm, '')
  for (const table of ['commandes', 'rdv_reservations', 'bons_cadeaux', 'abonnements', 'fidelite_sms_achats', 'success_packs']) {
    verifier(`🔴 l’historique compte « ${table} »`,
      new RegExp(`\\{ table: '${table}',`).test(codeSuppression))
  }
  // ⚠️ LES PACKS SIMPLEMENT COCHÉS NE SONT PAS UNE VENTE (Alex, 15/09) : les
  // compter bloquerait à vie un commerce qui n'a rien acheté. Et l'exclusion
  // doit réellement s'appliquer à la requête, pas seulement figurer dans la liste.
  verifier('⚠️ un pack seulement souhaité n’est pas de l’historique',
    /\{ table: 'success_packs', exclureStatut: 'souhaite',/.test(codeSuppression))
  verifier('⚠️ et l’exclusion s’applique vraiment au comptage, lignes sans statut comprises',
    /if \(h\.exclureStatut\) requete = requete\.or\(`statut\.is\.null,statut\.neq\.\$\{h\.exclureStatut\}`\)/.test(codeSuppression))
  verifier('🔴 l’historique compte TOUT, pas seulement ce qui est payé',
    !/paye_en_ligne|acompte_paye/.test(codeSuppression))
  verifier('🔴 un historique refuse la suppression',
    /if \(historique\.length > 0\) \{/.test(codeSuppression))
  verifier('⚠️ un comptage impossible refuse aussi, il ne laisse pas passer',
    /if \(errCompte\) \{/.test(codeSuppression) && /error: 'historique_illisible'/.test(codeSuppression))
  verifier('🔴 plus aucun moyen de passer outre',
    !/\bforce\b/.test(codeSuppression))
  verifier('le refus dit le geste : archiver en suspendant',
    /suspendu/.test((codeSuppression.match(/error: 'historique_a_conserver',[\s\S]*?\}, \{ status: 409 \}/) || [''])[0]))

  const modale = lire('app/admin/ModalEditCommercant.js').replace(/^[ \t]*\/\/.*$/gm, '')
  verifier('🔴 l’écran ne propose plus de supprimer « quand même »',
    !/quand même/.test(modale) && !/\bforce\b/.test(modale))
  verifier('il reconnaît le refus d’historique',
    /j\.error === 'historique_a_conserver'/.test(modale))
  verifier('et il propose d’archiver, c’est-à-dire de suspendre',
    /update\(\{ statut_publication: 'suspendu' \}\)/.test(modale) && /Archiver ce commerçant/.test(modale))
}

// ═══ LE PIÈGE QUI N'EXISTE PAS ENCORE, ET QU'ON EMPÊCHE D'ARRIVER ═════════
//
// 🔴 LES DOUZE COMMERCES DE TEST UTILISENT UN `+alias` DE LA MÊME BOÎTE :
// `verstappenalexandre+ciseauxprovisoires@gmail.com`, et onze autres. Gmail les
// livre toutes au même endroit, mais Supabase en fait DOUZE UTILISATEURS
// DISTINCTS, et l'admin se reconnaît à une égalité stricte de chaîne.
//
// ⚠️ DONC TOUT TIENT À UNE CHOSE : que la normalisation d'email NE CANONISE
// PAS les adresses Gmail. Retirer la partie après le `+` (et les points) est une
// idée qui revient dès qu'on veut dédoublonner des clients : elle est même
// techniquement juste du point de vue de Gmail. Le jour où quelqu'un l'ajoute,
// **chacun de ces douze comptes devient administrateur de Yoppaa**, sans qu'une
// seule ligne du contrôle admin n'ait bougé.
//
// ⚠️ ON EXÉCUTE LA FONCTION, on ne lit pas son code : une garde qui cherche
// l'absence de `split('+')` raterait n'importe quelle autre écriture du même
// raffinement.
{
  const ADMIN = 'verstappenalexandre@gmail.com'
  verifier('la normalisation garde le +alias distinct de l’adresse admin',
    normaliserEmail('verstappenalexandre+ciseauxprovisoires@gmail.com') !== ADMIN,
    normaliserEmail('verstappenalexandre+ciseauxprovisoires@gmail.com'))
  verifier('et elle ne retire pas non plus les points',
    normaliserEmail('verstappen.alexandre@gmail.com') !== ADMIN,
    normaliserEmail('verstappen.alexandre@gmail.com'))
  // ⚠️ ET ELLE FAIT QUAND MÊME SON TRAVAIL : casse et espaces, sinon un email
  // tapé « Alexandre@… » perdrait ses commandes en se connectant.
  verifier('mais elle uniformise bien la casse et les espaces',
    normaliserEmail('  VerstappenAlexandre@Gmail.com ') === ADMIN)
  verifier('et deux écritures de la même adresse se reconnaissent',
    memeEmail('A@B.be', ' a@b.be ') === true)
  verifier('quand deux adresses différentes ne se confondent pas',
    memeEmail('verstappenalexandre+x@gmail.com', ADMIN) === false)
}

// ═══ « VOIR DASHBOARD » VIT DANS L'ONGLET, ET IL MEURT (15/09, trouvé par Alex) ═══
//
// 🔴 Revenu sur l'onglet où il testait La Table d'Essai avec le compte du
// restaurant, Alex est tombé sur Ciseaux et Soins en MODE ADMIN. Il s'était
// connecté côté Yopper dans un autre onglet, avec son adresse, qui est aussi
// celle de l'admin : la session est commune à tout le navigateur. Et un vieux
// « Voir Dashboard » dormait dans le localStorage, commun à tous les onglets et
// jamais effacé par une déconnexion. L'admin passe toutes les gardes, débit
// d'une empreinte compris.
//
// ⚠️ LES DATES FIXES SONT SANS DANGER ICI : la règle reçoit son « maintenant »,
// elle ne lit jamais l'horloge.
{
  const ADMIN = 'verstappenalexandre@gmail.com'
  const H = 3600 * 1000
  const T0 = new Date('2026-09-15T20:00:00Z')
  const LIGNE = { id: 'i1', admin_email: ADMIN, commercant_id: 'c1', started_at: T0.toISOString(), ended_at: null }
  const a = (ms, autres = {}) => ({ adminEmail: ADMIN, commercantId: 'c1', maintenant: new Date(T0.getTime() + ms), ...autres })

  // ── La règle, exécutée ─────────────────────────────────────────────────
  verifier('✅ la durée est de deux heures (décision d’Alex)', DUREE_IMPERSONATION_MS === 2 * H)
  verifier('une ligne ouverte, au nom de l’admin, pour ce commerce, autorise',
    raisonImpersonationRefusee(LIGNE, a(60 * 1000)) === null)
  verifier('🔴 à 1 h 59 elle autorise encore', raisonImpersonationRefusee(LIGNE, a(2 * H - 60 * 1000)) === null)
  verifier('🔴 à deux heures pile, c’est fini', raisonImpersonationRefusee(LIGNE, a(2 * H)) === 'expiree')
  verifier('🔴 trois jours plus tard aussi', raisonImpersonationRefusee(LIGNE, a(72 * H)) === 'expiree')
  verifier('🔴 une ligne fermée n’autorise plus rien',
    raisonImpersonationRefusee({ ...LIGNE, ended_at: T0.toISOString() }, a(60 * 1000)) === 'terminee')
  verifier('🔴 la ligne d’un autre commerce n’ouvre pas celui-ci',
    raisonImpersonationRefusee(LIGNE, a(60 * 1000, { commercantId: 'c2' })) === 'autre_commerce')
  verifier('🔴 ni celle d’un autre compte',
    raisonImpersonationRefusee({ ...LIGNE, admin_email: 'quelquun@exemple.be' }, a(60 * 1000)) === 'autre_admin')
  verifier('🔴 un +alias n’est pas l’admin',
    raisonImpersonationRefusee({ ...LIGNE, admin_email: 'verstappenalexandre+test@gmail.com' }, a(60 * 1000)) === 'autre_admin')
  verifier('🔴 sans ligne, aucun accès', raisonImpersonationRefusee(null, a(0)) === 'introuvable')
  verifier('⚠️ une date illisible n’autorise pas',
    raisonImpersonationRefusee({ ...LIGNE, started_at: 'demain' }, a(0)) === 'date_illisible'
    && raisonImpersonationRefusee({ ...LIGNE, started_at: null }, a(0)) === 'date_illisible')
  verifier('⚠️ une ligne commencée demain n’autorise pas', raisonImpersonationRefusee(LIGNE, a(-24 * H)) === 'date_illisible')
  verifier('la fin tombe deux heures après le début', finImpersonation(LIGNE)?.getTime() === T0.getTime() + 2 * H)
  verifier('🔴 une ligne oubliée trois jours se ferme à la fin de sa durée, pas « maintenant »',
    finAInscrire(LIGNE, new Date(T0.getTime() + 72 * H)).getTime() === T0.getTime() + 2 * H)
  verifier('et une ligne encore dans sa durée, au moment réel',
    finAInscrire(LIGNE, new Date(T0.getTime() + H)).getTime() === T0.getTime() + H)
  verifier('🔴 au-delà de deux heures, une ligne ouverte est expirée', ligneExpiree(LIGNE, new Date(T0.getTime() + 3 * H)) === true)
  verifier('mais pas avant', ligneExpiree(LIGNE, new Date(T0.getTime() + H)) === false)
  verifier('⚠️ et une date illisible l’est d’office', ligneExpiree({ ...LIGNE, started_at: 'x' }, T0) === true)

  // ── Le compte de l'onglet ──────────────────────────────────────────────
  verifier('le même compte n’arrête rien', compteAChange('u1', 'u1') === false)
  verifier('🔴 un autre compte, connecté dans un autre onglet, arrête le tableau de bord', compteAChange('u1', 'u2') === true)
  verifier('🔴 une déconnexion ailleurs aussi', compteAChange('u1', undefined) === true)
  verifier('avant le chargement, il n’y a rien à comparer', compteAChange(null, 'u2') === false)

  // ── Le stockage : l'onglet, jamais le navigateur ───────────────────────
  const fauxStockage = () => {
    const m = new Map()
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, removeItem: (k) => { m.delete(k) } }
  }
  const S = { onglet: fauxStockage(), navigateur: fauxStockage() }
  S.navigateur.setItem('yoppaa_admin_impersonating', 'ciseaux')
  S.navigateur.setItem('yoppaa_admin_impersonation_session_id', 'vieille-ligne')
  verifier('🔴 un vieux « Voir Dashboard » du navigateur ne rouvre RIEN', lireImpersonation(S) === null)
  verifier('🔴 et il est purgé dès la lecture',
    S.navigateur.getItem('yoppaa_admin_impersonating') === null && S.navigateur.getItem('yoppaa_admin_impersonation_session_id') === null)
  verifier('« Voir Dashboard » se range', poserImpersonation('c1', 'i1', S) === true)
  verifier('🔴 dans l’onglet', S.onglet.getItem('yoppaa_admin_impersonating') === 'c1')
  verifier('🔴 et jamais dans le navigateur', S.navigateur.getItem('yoppaa_admin_impersonating') === null)
  const relu = lireImpersonation(S)
  verifier('il se relit dans le même onglet', relu?.commercantId === 'c1' && relu?.impersonationId === 'i1')
  effacerImpersonation(S)
  verifier('🔴 et il s’efface', lireImpersonation(S) === null)
  verifier('⚠️ sans ligne du journal, rien ne se range', poserImpersonation('c1', null, S) === false && lireImpersonation(S) === null)
  verifier('⚠️ sans stockage d’onglet, rien ne se range', poserImpersonation('c1', 'i1', { onglet: null, navigateur: null }) === false)
  const libSrc = sansCommentaires(lire('lib/impersonation.js'))
  verifier('🔴 par défaut, l’onglet est le sessionStorage, et le navigateur une source à purger',
    /onglet = typeof sessionStorage !== 'undefined' \? sessionStorage : null/.test(libSrc)
    && /navigateur = typeof localStorage !== 'undefined' \? localStorage : null/.test(libSrc)
    && !/navigateur\.setItem/.test(libSrc))

  // ── Le code, là où la règle doit être appelée ──────────────────────────
  const dash = sansCommentaires(lire('app/dashboard/page.js'))
  const liste = sansCommentaires(lire('app/admin/SectionTousCommercants.js'))
  const abo = sansCommentaires(lire('app/dashboard/abonnement/page.js'))
  const pageAdmin = sansCommentaires(lire('app/admin/page.js'))
  const routeVerif = sansCommentaires(lire('app/api/admin/impersonate-verifier/route.js'))
  const routeFin = sansCommentaires(lire('app/api/admin/impersonate-end/route.js'))
  const routeDebut = sansCommentaires(lire('app/api/admin/impersonate-start/route.js'))

  verifier('🔴 plus aucun « Voir Dashboard » dans le localStorage',
    !/localStorage\.(getItem|setItem)\('yoppaa_admin_impersonat/.test([dash, liste, abo, pageAdmin].join('\n')))
  verifier('🔴 « Voir Dashboard » se range dans l’onglet, et le dit s’il n’y arrive pas',
    /if \(!poserImpersonation\(c\.id, j\.impersonation_id\)\) \{/.test(liste))
  verifier('🔴 et ne pose plus le commerce du tableau de bord', !/yoppaa_dashboard_commercant_id/.test(liste))

  // 🔴 UN MESSAGE NOMME UN BOUTON QUI DOIT EXISTER SOUS CE NOM (16/09, relevé en
  // écrivant la procédure d'essai d'Alex). Les messages de /admin disaient
  // « Clique « Voir Dashboard » » pendant que le bouton s'appelait
  // « Dashboard → » : on envoyait quelqu'un chercher un bouton introuvable.
  // On EXÉCUTE les messages, on en tire le nom cité, et on le relit dans l'écran.
  const nomsCites = [...new Set(
    ['expiree', 'terminee', 'introuvable', 'reseau', 'raison-inconnue']
      .map(r => (messageImpersonation(r).match(/«\s*([^»]+?)\s*»/) || [])[1])
      .filter(Boolean),
  )]
  verifier('tous les messages de retour citent le MÊME bouton',
    nomsCites.length === 1, nomsCites.join(' / ') || 'aucun nom cité')
  verifier('🔴 et ce bouton porte ce nom dans l’écran admin',
    nomsCites.length > 0 && nomsCites.every(n => liste.includes(n)),
    `${nomsCites.join(' / ')} : introuvable dans SectionTousCommercants`)

  const iLire = dash.indexOf('const imp = lireImpersonation()')
  const iVerdict = dash.indexOf('const verdict = await verifierImpersonation(supabase, imp)')
  const iCharge = dash.indexOf("? await supabase.from('commercants').select('*').eq('id', imp.commercantId).maybeSingle()")
  verifier('🔴 le tableau de bord demande au serveur AVANT de charger le commerce',
    iLire > -1 && iVerdict > iLire && iCharge > iVerdict, `${iLire} / ${iVerdict} / ${iCharge}`)
  verifier('🔴 un refus efface et renvoie à /admin avec la raison',
    /effacerImpersonation\(\)\s*router\.push\(`\/admin\?voir=\$\{encodeURIComponent\(verdict\.ok \? 'introuvable' : verdict\.raison\)\}`\)/.test(dash))
  verifier('⚠️ le bandeau dit jusqu’à quand', /jusqu’à \{new Date\(impersonationFin\)\.toLocaleTimeString\('fr-BE'/.test(dash))
  verifier('🔴 à deux heures, l’onglet quitte tout seul', /setTimeout\(\(\) => quitterImpersonation\('expiree'\)/.test(dash))
  verifier('⚠️ « Quitter » ne prend pas le clic pour une raison', /typeof raison === 'string'/.test(dash))

  verifier('🔴 le tableau de bord retient le compte du chargement', /compteAuChargementRef\.current = user\.id/.test(dash))
  verifier('🔴 il écoute un changement de compte', /supabase\.auth\.onAuthStateChange\(\(event, session\) => \{/.test(dash))
  verifier('⚠️ sans rappel async : la bibliothèque l’attend en tenant son verrou (31/08)', !/onAuthStateChange\(async/.test(dash))
  verifier('🔴 il compare au compte du chargement', /compteAChange\(compteAuChargementRef\.current, session\?\.user\?\.id\)/.test(dash))
  const iArret = dash.indexOf('if (compteChange) return')
  verifier('🔴 un compte changé arrête l’écran AVANT tout le reste',
    iArret > -1 && iArret < dash.indexOf('if (listeCommercants.length > 0 && !commercant) return'))

  const iSortie = dash.indexOf('async function seDeconnecter()')
  const sortie = iSortie === -1 ? '' : dash.slice(iSortie, dash.indexOf("router.push('/login')", iSortie))
  verifier('🔴 la déconnexion se déclare voulue AVANT de sortir',
    sortie.indexOf('sortieVoulueRef.current = true') > -1
    && sortie.indexOf('sortieVoulueRef.current = true') < sortie.indexOf('supabase.auth.signOut()'))
  verifier('🔴 la déconnexion du tableau de bord ferme « Voir Dashboard », jeton encore vivant',
    /fermerImpersonationServeur\(supabase, \{ toutes: true \}\)/.test(sortie)
    && sortie.indexOf('effacerImpersonation()') > -1
    && sortie.indexOf('effacerImpersonation()') < sortie.indexOf('supabase.auth.signOut()'))

  verifier('🔴 l’admin n’a plus de déconnexion qui n’efface rien',
    !/marquerDeconnexionVoulue\(\); await supabase\.auth\.signOut\(\)/.test(pageAdmin))
  verifier('🔴 ses deux boutons passent par la même sortie', (pageAdmin.match(/onClick=\{seDeconnecter\}/g) || []).length === 2)
  verifier('🔴 qui ferme « Voir Dashboard » et lit son résultat',
    /fermerImpersonationServeur\(supabase, \{ toutes: true \}\)/.test(pageAdmin)
    && /effacerImpersonation\(\)/.test(pageAdmin)
    && /const \{ error: errSortie \} = await supabase\.auth\.signOut\(\)/.test(pageAdmin)
    && /signOut\(\{ scope: 'local' \}\)/.test(pageAdmin))
  verifier('⚠️ un retour forcé depuis le tableau de bord est expliqué', /showToast\(messageImpersonation\(raison\), 'error'\)/.test(pageAdmin))

  verifier('🔴 la page Abonnement suit la même règle', /const verdict = await verifierImpersonation\(supabase, imp\)/.test(abo))
  verifier('🔴 et ne rouvre plus un commerce qui n’est pas le sien',
    /\.eq\('id', savedId\)\.eq\('auth_user_id', user\.id\)/.test(abo))

  verifier('🔴 le serveur lit le journal avec le jeton de l’admin, jamais la clé de service',
    /\.from\('admin_impersonations'\)\s*\.select\('id, admin_email, commercant_id, started_at, ended_at'\)/.test(routeVerif)
    && /NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(routeVerif) && !/SERVICE_ROLE/.test(routeVerif))
  verifier('🔴 il applique la règle',
    /raisonImpersonationRefusee\(ligne, \{ adminEmail: user\.email, commercantId: commercant_id, maintenant \}\)/.test(routeVerif))
  verifier('🔴 un journal illisible ne vaut pas un accord', /if \(error\) \{[\s\S]{0,200}journal_illisible/.test(routeVerif))
  verifier('⚠️ une ligne expirée se ferme, et le résultat est lu', /if \(errFin \|\| !fermees\?\.length\)/.test(routeVerif))
  verifier('🔴 la fermeture n’est plus un espoir', /if \(errFin \|\| !faite\?\.length\)/.test(routeFin) && !/no_auth/.test(routeFin))
  verifier('🔴 la déconnexion ferme toutes les lignes de l’admin', /if \(!toutes\) requete = requete\.eq\('id', impersonation_id\)/.test(routeFin))
  verifier('⚠️ une nouvelle connexion range les lignes oubliées', /\.filter\(l => ligneExpiree\(l, maintenant\)\)/.test(routeDebut))
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. L'AUTRE PORTE : LA FICHE ACCUEILLE-T-ELLE DES CLIENTS ?
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 `/api/rdv/reserver` NE LA REGARDAIT PAS (16/09). Chez un commerce en
// préparation, invisible pour tout le monde, `rdv_actif` était le seul verrou du
// serveur : une requête bien formée posait un rendez-vous, bloquait un créneau
// et pouvait exiger une empreinte bancaire. Deux routes sœurs du même cœur
// transactionnel faisaient ce contrôle depuis toujours, chacune avec sa propre
// comparaison recopiée à la main : la règle n'existait nulle part, seulement
// ses copies.
{
  // ─── LA RÈGLE, EXÉCUTÉE ────────────────────────────────────────────────
  verifier('une fiche publiée accueille', fichePubliee({ statut_publication: 'publie' }) === true)
  for (const etat of ['brouillon', 'en_attente', 'rejete', 'suspendu', 'Publie', 'publié', '']) {
    verifier(`⚠️ « ${etat || '(vide)'} » n’accueille personne`,
      fichePubliee({ statut_publication: etat }) === false)
  }
  // ⚠️ LISTE BLANCHE, ET C'EST TOUT L'ENJEU : refuser quatre états nommément
  // laisserait passer le cinquième le jour où quelqu'un l'ajoute en base.
  verifier('⚠️ un état inventé demain reste dehors tout seul',
    fichePubliee({ statut_publication: 'archive_2027' }) === false)
  // 🔴 LE PIÈGE DE LA COLONNE ABSENTE, ET IL SE RETOURNE ICI CONTRE LES
  // COMMERÇANTS PUBLIÉS : oubliée dans un select, elle vaut `undefined` et la
  // route refuse alors TOUT LE MONDE, sans un mot. D'où la garde générale plus
  // bas, qui vérifie que chaque appelant la charge.
  verifier('🔴 une colonne absente ferme la porte, elle ne l’ouvre pas', fichePubliee({}) === false)
  verifier('une fiche introuvable ferme aussi',
    fichePubliee(null) === false && fichePubliee(undefined) === false)
  verifier('la règle nomme elle-même la colonne qu’elle lit',
    COLONNE_PUBLICATION === 'statut_publication' && PUBLICATION_OUVERTE === 'publie')

  // ─── QUI APPLIQUE LA RÈGLE CHARGE SA COLONNE ───────────────────────────
  // ⚠️ AUCUNE LISTE RECOPIÉE À LA MAIN : on balaie, sinon il manquera un
  // fichier et il manquera en silence.
  const sources = []
  const parcourir = (dossier) => {
    for (const e of readdirSync(new URL(`../${dossier}`, import.meta.url), { withFileTypes: true })) {
      if (e.isDirectory()) parcourir(`${dossier}/${e.name}`)
      else if (e.name.endsWith('.js')) sources.push(`${dossier}/${e.name}`)
    }
  }
  parcourir('app')
  parcourir('lib')
  const codeDe = (f) => sansProse(lire(f))
  // La règle se définit ici, elle ne s'y applique pas.
  const appliquent = sources.filter(f => /fichePubliee\s*\(/.test(codeDe(f)) && f !== 'lib/statut-commercant.js')
  verifier('la règle est appliquée par au moins neuf fichiers',
    appliquent.length >= 9, `${appliquent.length} trouvés`)
  // 🔴 ON COMPTE, ON NE CHERCHE PAS. Chercher le mot une fois, c'est rester
  // vert quand un fichier lit les commerçants à DEUX endroits et qu'un seul
  // porte la colonne : le Good Morning en a deux, et la mutation qui vidait le
  // premier n'a rien déclenché. Chaque lecture de commerçant est donc examinée
  // séparément.
  const lecturesCommercants = (src) => {
    const out = []
    // Jointure : `commercant:commercants (id, nom, …)`
    for (const m of src.matchAll(/commercants\s*\(([^)]*)\)/g)) out.push(m[1])
    // Lecture directe : `.from('commercants')` … `.select('…')`
    for (const m of src.matchAll(/from\('commercants'\)[\s\S]{0,400}?\.select\(([^)]*)\)/g)) out.push(m[1])
    return out
  }
  // ⚠️ SEULS LES FICHIERS QUI INTERROGENT LA BASE. Un module pur reçoit la
  // fiche toute faite et n'a aucune colonne à demander : le lui exiger serait
  // une garde impossible à satisfaire, donc une garde qu'on finit par éteindre.
  // Ses appelants, eux, sont vérifiés juste en dessous.
  //
  // 🔴 ET D'UN CRAN PLUS LOIN : qui délègue la règle à un module pur doit lui
  // servir une fiche qui porte la colonne. Sans ça `commercantEligibleDeal`
  // écarterait en silence TOUS les commerçants du Good Morning.
  const delegues = sources.filter(f => /commercantEligible(Deal|Actu)\s*\(/.test(codeDe(f)))
    .filter(f => f !== 'lib/morning-eligibilite.js')
  verifier('au moins un appelant délègue l’éligibilité', delegues.length >= 1, `${delegues.length} trouvés`)
  // ⚠️ ET ON NE L'EXIGE PAS DE TOUTE LECTURE : ce module lit deux fois les
  // commerçants rien que pour écrire « une place s'est libérée chez X ». Ces
  // lectures-là ne jugent rien. La règle juste est un COMPTE : autant de
  // lectures portant la colonne que d'endroits où ce fichier juge.
  const porteLaColonne = new RegExp(`\\b${COLONNE_PUBLICATION}\\b`)
  for (const f of [...new Set([...appliquent, ...delegues])]) {
    // Les écrans lisent `commercants_public` avec `select('*')` : la colonne
    // arrive sans être nommée.
    if (f.startsWith('app/commander/')) continue
    const src = codeDe(f)
    const juges = (src.match(/fichePubliee\s*\(|commercantEligible(Deal|Actu)\s*\(/g) || []).length
    const servies = lecturesCommercants(src).filter(cols => porteLaColonne.test(cols)).length
    if (!lecturesCommercants(src).length) continue
    verifier(`🔴 ${f} sert la colonne à CHAQUE endroit où il juge`,
      servies >= juges, `${servies} lecture(s) avec la colonne pour ${juges} jugement(s)`)
  }
  // 🔴 ET LA GARDE QUI VISE LA RÈGLE, PAS UNE LIGNE : personne ne recopie la
  // comparaison à la main. C'est ainsi que les deux routes sœurs se sont
  // trouvées gardées pendant que la troisième ne l'était pas.
  const recopient = sources.filter(f => /statut_publication\s*[!=]==\s*'publie'/.test(codeDe(f)))
  verifier('🔴 plus aucune comparaison recopiée à la main',
    recopient.length === 0, recopient.join(', '))

  // ─── LES TROIS ROUTES DU CŒUR TRANSACTIONNEL ───────────────────────────
  // ⚠️ CES ROUTES NE S'EXÉCUTENT PAS AU BANC : elles appellent Supabase. On
  // vérifie donc qu'elles appellent la règle ET à quelle place, l'ordre étant
  // ici la moitié du sujet.
  for (const f of [
    'app/api/rdv/reserver/route.js',
    'app/api/stripe/checkout/create-commande/route.js',
    'app/api/bons-cadeaux/checkout/route.js',
  ]) {
    verifier(`🔴 ${f} refuse une fiche non publiée`, /if \(!fichePubliee\(/.test(codeDe(f)))
  }
  {
    const src = codeDe('app/api/rdv/reserver/route.js')
    const iRegle = src.indexOf('!fichePubliee(commercant)')
    const iForfait = src.indexOf('verdictForfait(')
    const iCreation = src.indexOf('creerReservationRdv(')
    // ⚠️ AVANT LE FORFAIT : une fiche en préparation n'a rien à dire de son
    // abonnement. Et avant la création, évidemment.
    verifier('🔴 la règle passe avant le forfait', iRegle > 0 && iForfait > iRegle)
    verifier('🔴 et bien avant que le rendez-vous naisse', iCreation > iRegle)
    // ⚠️ LE MÊME REFUS QUE POUR UN AGENDA ÉTEINT : nos états internes ne
    // regardent pas le client.
    verifier('⚠️ et le client n’apprend pas l’existence du commerce',
      /error: 'Ce commerçant ne prend pas encore de rendez-vous en ligne.', code: 'fiche_non_publiee'/.test(src))
  }
  {
    // ─── ET CELLE-CI S'EXÉCUTE POUR DE BON ───────────────────────────────
    // 🔴 LA LEÇON DU 16/09 : une garde qui lit du code ne vérifie que ma
    // lecture du code. `inscrire` reçoit son client en paramètre, on lui en
    // donne un faux et on regarde ce qu'elle RÉPOND.
    //
    // ⚠️ LE CONSTRUCTEUR DE REQUÊTE SUPABASE EST UN THENABLE : `then` oui,
    // `catch` non. Le faux client doit l'être aussi, sinon il ne mesure pas le
    // vrai chemin.
    const fauxDb = (reponses, vues = []) => ({
      from(table) {
        vues.push(table)
        const rep = reponses[table] || { data: null, error: null }
        const base = {
          single: async () => rep,
          maybeSingle: async () => rep,
          then: (res, rej) => Promise.resolve(rep).then(res, rej),
        }
        // ⚠️ TOUT AUTRE VERBE REND LA REQUÊTE : select, eq, neq, in, order…
        // Un faux client qui ne connaît qu'une liste de verbes fait échouer le
        // banc sur SA propre lacune, et on croit alors avoir trouvé un défaut.
        // ⚠️ Les symboles restent absents, sinon `await` s'y perd.
        const q = new Proxy(base, {
          get: (cible, prop) =>
            (prop in cible ? cible[prop] : (typeof prop === 'symbol' ? undefined : () => q)),
        })
        return q
      },
    })
    const PRESTATION = {
      id: 'p1', nom: 'Table de 4', commercant_id: 'c1',
      capacite: 4, attente_max: 10, actif: true, deleted_at: null, par_couverts: true,
    }
    const demande = { prestationId: 'p1', clientId: 'y1', dateRdv: '2026-10-02', heureDebut: '19:00', duree: null }
    const inscrireAvec = (commerce, errCommerce = null, vues = []) => inscrire(fauxDb({
      rdv_prestations: { data: PRESTATION, error: null },
      commercants: { data: commerce, error: errCommerce },
      rdv_attente: { data: [], error: null },
    }, vues), demande)

    const vuesFerme = []
    const ferme = await inscrireAvec({ id: 'c1', statut_publication: 'en_attente' }, null, vuesFerme)
    verifier('🔴 EXÉCUTÉE : une fiche en préparation ne prend personne dans sa file',
      ferme?.ok === false && ferme?.error === 'commerce_ferme', JSON.stringify(ferme))
    // 🔴 ET L'ORDRE, PROUVÉ PAR L'EXÉCUTION plutôt que par deux `indexOf` : si
    // la file avait seulement été LUE, c'est que le refus arrivait trop tard.
    verifier('🔴 EXÉCUTÉE : la file n’est même pas ouverte quand la fiche est fermée',
      !vuesFerme.includes('rdv_attente'), vuesFerme.join(' → '))

    const publie = await inscrireAvec({ id: 'c1', statut_publication: 'publie' })
    verifier('✅ EXÉCUTÉE : une fiche publiée passe ce contrôle',
      publie?.error !== 'commerce_ferme', JSON.stringify(publie))

    // ⚠️ ET LA DIFFÉRENCE QUI COMPTE : un incident de lecture n'est pas un
    // commerce fermé. Sans ce test, une panne réseau annoncerait à toute la
    // file que le commerçant ne veut plus d'elle.
    const panne = await inscrireAvec(null, { message: 'reseau' })
    verifier('🔴 EXÉCUTÉE : une lecture en échec se dit lecture en échec',
      panne?.error === 'lecture_ko', JSON.stringify(panne))

    // La liste d'attente : rien à facturer, mais une place libérée enverrait un
    // push vers une page qui n'existe pour personne.
    const src = codeDe('lib/attente-rdv-server.js')
    verifier('🔴 la file refuse un commerce non publié', src.includes("error: 'commerce_ferme'"))
    // ⚠️ UNE LECTURE QUI ÉCHOUE N'EST PAS UNE FICHE FERMÉE, sinon un incident
    // réseau annonce un commerce fermé à toute la file.
    verifier('⚠️ une lecture en échec se dit lecture en échec',
      /if \(errC\) return \{ ok: false, error: 'lecture_ko' \}/.test(src))
    verifier('⚠️ et le refus a sa phrase côté route',
      /commerce_ferme: '[^']+'/.test(codeDe('app/api/rdv/attente/route.js')))
  }
  // ✅ ET CELLE QUI NE DOIT PAS LA PORTER, décision du 16/09 : des séances déjà
  // payées se posent même si la fiche est dépubliée, exactement comme un bon
  // cadeau déjà vendu reste utilisable. Garde figée pour qu'on ne « corrige »
  // pas un jour ce qui est un choix.
  verifier('✅ un abonnement déjà signé garde le droit de poser ses séances',
    !/fichePubliee/.test(codeDe('app/api/rdv/reserver-abonnement/route.js')))

  // ─── ET CE QUE L'ADMIN MONTRE DE CES ÉTATS ─────────────────────────────
  //
  // 🔴 16/09, TROUVÉ PAR ALEX. « La Table du Stock », inscription commencée le
  // 13/09 et jamais soumise, s'affichait « Suspendu » dans la liste et
  // « publie » dans la fenêtre d'édition. Les deux mentaient sur la même
  // valeur, `brouillon`, qu'aucun des deux ne connaissait : la liste retombait
  // sur son défaut, le menu sur sa première option. Un « Enregistrer » pour
  // corriger un téléphone aurait PUBLIÉ un commerce jamais validé.
  {
    const modale = codeDe('app/admin/ModalEditCommercant.js')
    const liste = codeDe('app/admin/SectionTousCommercants.js')
    verifier('🔴 la modale n’invente plus « publie » sur un état qu’elle ignore',
      !/statut_publication: commercant\.statut_publication \|\| 'publie'/.test(modale))
    verifier('🔴 et elle n’écrit le statut QUE s’il est connu',
      /if \(STATUTS_PUB\.some\(s => s\.valeur === form\.statut_publication\)\)/.test(modale))
    verifier('🔴 un état inconnu ne se déguise plus en « Suspendu »',
      /BADGE_STATUT\[c\.statut_publication\] \|\| BADGE_INCONNU/.test(liste))
    verifier('⚠️ et le défaut de la liste n’est plus un état réel',
      /BADGE_INCONNU = \{[^}]*label: 'Statut inconnu'/.test(liste))

    // 🔴 LA RÈGLE, PAS LA LIGNE : tout état que le code ÉCRIT, l'admin doit
    // savoir l'afficher ET le choisir. C'est cette garde-ci qui aurait attrapé
    // `brouillon` le 13/09, au lieu de laisser Alex le découvrir trois jours
    // plus tard en croyant avoir suspendu quelqu'un.
    const ecrits = new Set()
    for (const f of sources) {
      for (const m of codeDe(f).matchAll(/statut_publication:\s*'([a-z_]+)'/g)) ecrits.add(m[1])
    }
    verifier('le code écrit au moins quatre états de publication',
      ecrits.size >= 4, [...ecrits].join(', '))
    for (const etat of ecrits) {
      verifier(`🔴 l’admin sait AFFICHER « ${etat} »`,
        new RegExp(`\\b${etat}:\\s*\\{`).test(liste), 'absent de BADGE_STATUT')
      verifier(`🔴 l’admin sait CHOISIR « ${etat} »`,
        new RegExp(`valeur: '${etat}'`).test(modale), 'absent du menu d’édition')
      verifier(`⚠️ et l’admin sait FILTRER « ${etat} »`,
        new RegExp(`<option value="${etat}">`).test(liste), 'absent du filtre de la liste')
    }
  }

  // ─── DEPUIS COMBIEN DE TEMPS CELUI-LÀ ATTEND-IL ? ──────────────────────
  // ⚠️ EXÉCUTÉE. Une date brute laissait le calcul à faire pendant que la page
  // d'inscription promet une réponse sous 24 h ouvrées.
  {
    const LUN = new Date('2026-09-14T09:00:00')   // lundi
    const MAR = new Date('2026-09-15T09:00:00')   // mardi
    const MER = new Date('2026-09-16T09:00:00')   // mercredi
    const VEN = new Date('2026-09-11T20:00:00')   // vendredi soir

    verifier('aujourd’hui se dit « aujourd’hui »', attenteDepuis(MER, MER).texte === 'aujourd’hui')
    verifier('la veille se dit « hier »', attenteDepuis(MAR, MER).texte === 'hier')
    verifier('au-delà, on compte les jours', attenteDepuis(LUN, MER).texte === 'il y a 2 jours')

    // 🔴 LE WEEK-END NE COMPTE PAS, sinon tout dossier déposé le vendredi soir
    // paraîtrait en retard dès le lundi matin et l'alerte perdrait son sens.
    // ⚠️ UNE ALARME QUI SONNE TOUT LE TEMPS NE PROTÈGE PLUS RIEN.
    egalNombre('samedi et dimanche ne sont pas des jours ouvrés',
      joursOuvresEntre(VEN, LUN), 1)
    verifier('🔴 déposé vendredi soir, traité lundi : DANS les temps',
      attenteDepuis(VEN, LUN).enRetard === false)
    verifier('🔴 déposé vendredi soir, toujours rien mardi : EN RETARD',
      attenteDepuis(VEN, MAR).enRetard === true, JSON.stringify(attenteDepuis(VEN, MAR)))

    // ⚠️ UNE DATE ABSENTE NE DÉCLENCHE PAS UNE FAUSSE ALERTE : on ne sait pas,
    // on le dit, et on n'accuse personne.
    const sansDate = attenteDepuis(null, MER)
    verifier('une date absente se dit inconnue, sans alarme',
      sansDate.texte === 'date inconnue' && sansDate.enRetard === false)
    verifier('une date illisible non plus', attenteDepuis('pas une date', MER).enRetard === false)
    // Une date dans le futur ne rend jamais un compte négatif.
    egalNombre('une date future ne remonte pas le temps', attenteDepuis(MER, LUN).jours, 0)

    verifier('⚠️ et l’écran de validation MONTRE l’attente, pas seulement la date',
      /\{attente\.texte\}/.test(codeDe('app/admin/page.js')))

    // ─── LE FILET DES DOSSIERS OUBLIÉS ───────────────────────────────────
    // 🔴 L'alerte de soumission part d'un `fetch` DEPUIS LE NAVIGATEUR : elle
    // se perd sur un 403, sur un 500, ou si l'onglet se ferme entre
    // l'enregistrement et l'appel. Le filet, lui, part du serveur.
    const FICHES = [
      { nom: 'À l’heure', created_at: MAR },        // hier
      { nom: 'Oublié', created_at: VEN },           // vendredi → mercredi
      { nom: 'Très oublié', created_at: '2026-09-07T09:00:00' },
    ]
    const oublies = dossiersEnRetard(FICHES, MER)
    egalNombre('🔴 EXÉCUTÉE : seuls les dossiers EN RETARD sont rappelés', oublies.length, 2)
    verifier('⚠️ celui d’hier ne déclenche rien',
      !oublies.some(d => d.fiche.nom === 'À l’heure'))
    // ⚠️ LE PLUS ANCIEN EN TÊTE : c'est lui qui décide s'il reste ou s'il part.
    verifier('🔴 le plus ancien passe en premier', oublies[0].fiche.nom === 'Très oublié')
    egalNombre('une file vide ne réveille personne', dossiersEnRetard([], MER).length, 0)
    egalNombre('une lecture nulle non plus', dossiersEnRetard(null, MER).length, 0)
    // ⚠️ UNE DATE ABSENTE N'INVENTE PAS UN RETARD.
    egalNombre('un dossier sans date ne sonne pas',
      dossiersEnRetard([{ nom: 'Sans date', created_at: null }], MER).length, 0)

    {
      const cron = codeDe('app/api/cron/recap-jour-8h/route.js')
      verifier('🔴 le filet tourne côté serveur, dans le cron du matin',
        /dossiersEnRetard\(attente \|\| \[\]\)/.test(cron))
      verifier('⚠️ il ne réveille personne quand la file est vide',
        /if \(oublies\.length\) \{/.test(cron))
      // 🔴 UNE LECTURE EN ÉCHEC N'EST PAS « AUCUN DOSSIER N'ATTEND ».
      verifier('🔴 une lecture en échec se voit', /if \(errAttente\) throw/.test(cron))
      // ⚠️ ET IL NE RETARDE PAS LES RÉCAPS DES COMMERÇANTS.
      // ⚠️ ON VISE L'APPEL, PAS LE NOM : cherché tout court, le nom se trouve
      // d'abord dans la ligne d'import, tout en haut, et la comparaison ne
      // mesure alors que l'ordre des imports. Le piège de l'import, quatrième
      // fois du jour.
      verifier('⚠️ il passe APRÈS les récapitulatifs',
        cron.indexOf('dossiersEnRetard(attente') > cron.indexOf('surveillerCompteur({'))
    }
    {
      const signup = codeDe('app/signup/page.js')
      // 🔴 `fetch` NE LÈVE PAS SUR UN CODE HTTP : sans cette lecture, un 403
      // passait pour un succès et le commerçant voyait « Demande envoyée ! ».
      verifier('🔴 la soumission lit la réponse de la notification',
        /if \(!res\.ok\) throw new Error\(`notify-yoppaa \$\{res\.status\}`\)/.test(signup))
      verifier('⚠️ et réessaie une fois, sans boucler', /await prevenirYoppaa\(\)/.test(signup))
      verifier('⚠️ l’échec est tracé au lieu d’être avalé',
        /Yoppaa n a pas pu etre prevenu/.test(signup))
    }
  }

  // ─── CEUX QUI SE SONT ARRÊTÉS EN ROUTE ─────────────────────────────────
  // Demande d'Alex, 16/09 : « mon problème est la table du stock qui arrive
  // dans mon DB admin sans prévenir et sans infos ».
  {
    const section = codeDe('app/admin/SectionInscriptionsEnCours.js')
    const page = codeDe('app/admin/page.js')
    verifier('🔴 la section est MONTÉE dans l’admin', /<SectionInscriptionsEnCours \/>/.test(page))
    // ⚠️ `> 0` D'ABORD : absente, `indexOf` rend -1, et « -1 est plus petit »
    // aurait suffi à garder cette garde verte sur une section disparue.
    verifier('⚠️ et AVANT la liste générale, sinon il faut la chercher',
      page.indexOf('<SectionInscriptionsEnCours />') > 0
      && page.indexOf('<SectionInscriptionsEnCours />') < page.indexOf('<SectionTousCommercants'))
    // ⚠️ LA GARDE VISE LE FILTRE, PAS LA VALEUR ÉCRITE À LA MAIN : l'état
    // vient maintenant de la règle partagée, et cette garde a rougi le jour où
    // il a cessé d'être recopié. Elle vérifie donc le geste, et la provenance
    // de l'état se vérifie séparément.
    verifier('🔴 elle ne montre QUE les inscriptions non terminées',
      /\.eq\('statut_publication', ETAT_NON_TERMINEE\)/.test(section))
    // 🔴 LE PIÈGE DE LA COLONNE, ENCORE : sans elle dans le select, le filtre
    // porte sur une valeur absente et la section reste vide pour toujours.
    //
    // ⚠️ ON VISE LE SELECT, PAS LE FICHIER. Chercher le nom partout, c'est le
    // trouver dans le `.eq(...)` juste en dessous et rester vert alors que la
    // colonne a quitté le select : la mutation l'a prouvé, deuxième fois du
    // jour. Une garde doit regarder l'endroit exact où la chose se joue.
    const selectPrincipal = section.match(/from\('commercants'\)[\s\S]{0,200}?\.select\(`([\s\S]*?)`\)/)
    verifier('la lecture des commerçants est repérable', !!selectPrincipal)
    verifier(`🔴 elle charge « ${COLONNE_PUBLICATION} » DANS son select`,
      !!selectPrincipal && porteLaColonne.test(selectPrincipal[1]))
    // 🔴 UNE REQUÊTE EN ÉCHEC ET UNE LISTE VIDE SE RESSEMBLENT À L'ÉCRAN, et
    // la seconde se lirait « personne n'attend ».
    verifier('🔴 elle lit l’erreur de lecture au lieu de l’avaler',
      /if \(error\) \{ setErr\(error\.message\)/.test(section))
    verifier('⚠️ et le dit sans faire croire qu’il n’y a personne',
      /Rien ne dit qu&apos;il n&apos;y a personne/.test(section))
    verifier('⚠️ elle dit l’attente, pas la date brute', /attenteDepuis\(c\.created_at\)/.test(section))
    // ⚠️ LE GESTE ATTENDU EST UN APPEL : les coordonnées sont des liens.
    verifier('⚠️ le téléphone et l’email se cliquent',
      /href=\{`tel:\$\{c\.telephone\}`\}/.test(section) && /href=\{`mailto:\$\{c\.email\}`\}/.test(section))
    // ⚠️ L'ÉCRAN ET LA TÂCHE DOIVENT PARLER DES MÊMES FICHES : deux copies de
    // l'état et Alex verrait une liste pendant que le cron en relance une autre.
    verifier('🔴 l’écran prend l’état à la règle, il ne le recopie pas',
      /ETAT_NON_TERMINEE = PUBLICATION_BROUILLON/.test(section))

    // ⚠️ SA PLACE EST UN CHOIX (Alex, 16/09) : juste sous les deux validations,
    // avec la liste des commerçants dans la foulée. Ce sont les écrans sur
    // lesquels on AGIT ; les diagnostics se consultent, eux, et passent après.
    verifier('⚠️ elle est placée juste sous les validations',
      page.indexOf('<SectionKYBAValider') > 0
      && page.indexOf('<SectionKYBAValider') < page.indexOf('<SectionInscriptionsEnCours />'))
    verifier('⚠️ et la liste des commerçants la suit, avant les diagnostics',
      page.indexOf('<SectionTousCommercants') < page.indexOf('<SectionDiagnosticBrevo'))

    // ─── « DOSSIER REMPLI À 0 % », LE MENSONGE D'ÉCRAN ───────────────────
    // 🔴 `validation_auto_score` n'est écrit qu'à la SOUMISSION : sur un
    // brouillon il vaut toujours zéro. L'écran annonçait « 0 % » à quelqu'un
    // qui avait tout saisi sauf le dernier clic, et un chiffre faux décide à la
    // place de celui qui le lit.
    verifier('🔴 la section ne lit plus le score de soumission',
      !/validation_auto_score/.test(section))
    verifier('🔴 elle compte ce qui est vraiment rempli',
      /remplissageInscription\(c\)/.test(section))
    verifier('🔴 et charge les champs DÉCLARÉS par la règle',
      /\$\{COLONNES_INSCRIPTION\}/.test(section), 'liste recopiée à la main')

    // ⚠️ EXÉCUTÉE.
    const pleine = Object.fromEntries(CHAMPS_INSCRIPTION.map(c => [c, 'x']))
    egalNombre('un dossier complet est compté entier',
      remplissageInscription(pleine).remplis, CHAMPS_INSCRIPTION.length)
    verifier('⚠️ et il se dit « 7 champs sur 7 », jamais en pourcentage',
      remplissageInscription(pleine).texte === `${CHAMPS_INSCRIPTION.length} champs sur ${CHAMPS_INSCRIPTION.length} renseignés`)
    egalNombre('un champ manquant se voit',
      remplissageInscription({ ...pleine, description: null }).remplis, CHAMPS_INSCRIPTION.length - 1)
    // ⚠️ UN CHAMP D'ESPACES N'EST PAS UN CHAMP REMPLI.
    egalNombre('un champ d’espaces ne compte pas',
      remplissageInscription({ ...pleine, adresse: '   ' }).remplis, CHAMPS_INSCRIPTION.length - 1)
    verifier('un dossier vide le dit', remplissageInscription({}).texte === 'dossier vide')
    verifier('une fiche absente ne plante pas', remplissageInscription(null).remplis === 0)
    // 🔴 LE CAS RÉEL DU 13/09 : six champs sur sept, et l'écran disait 0 %.
    const laTableDuStock = {
      nom: 'La Table du Stock', type: 'Restaurant & Bar - café', categorie: 'alimentaire',
      adresse: 'Rue d’Orbey 15, 5070 Fosses-la-Ville', telephone: '0471074349',
      email: 'un@exemple.be', description: 'Parking gratuit, salle de réception à l’étage',
    }
    verifier('🔴 le dossier réel se lit enfin pour ce qu’il est',
      remplissageInscription(laTableDuStock).texte === '7 champs sur 7 renseignés',
      remplissageInscription(laTableDuStock).texte)
  }

  // ─── LA RELANCE, ET SURTOUT CE QU'ELLE N'ENVOIE PAS ────────────────────
  //
  // 🔴 CETTE RÈGLE DÉCIDE D'ÉCRIRE À DE VRAIES PERSONNES. Elle s'exécute donc
  // ici, sur chaque cas, plutôt que de se relire : une relance en double se
  // voit et agace, et on ne la découvre jamais au banc si le banc ne fait que
  // chercher des mots.
  {
    const MAINTENANT = new Date('2026-09-16T10:00:00')
    const fiche = (extra = {}) => ({
      id: 'c1', nom: 'La Table du Stock', email: 'commercant@exemple.be',
      statut_publication: 'brouillon', created_at: '2026-09-13T10:00:00',
      relance_inscription_envoyee_at: null, ...extra,
    })
    const raison = (extra, quand = MAINTENANT) => raisonPasDeRelance(fiche(extra), quand)

    verifier('✅ commencée il y a trois jours, jamais relancée : on relance',
      raison({}) === null, String(raison({})))
    // 🔴 LE GARDE-FOU QUI JUSTIFIE LA MIGRATION.
    verifier('🔴 déjà relancée : JAMAIS une seconde fois',
      raison({ relance_inscription_envoyee_at: '2026-09-15T08:00:00' }) === 'deja_relance')
    verifier('🔴 une inscription menée au bout ne se relance pas',
      raison({ statut_publication: 'en_attente' }) === 'inscription_pas_en_brouillon')
    verifier('⚠️ une fiche publiée encore moins',
      raison({ statut_publication: 'publie' }) === 'inscription_pas_en_brouillon')
    verifier('sans adresse, rien à envoyer', raison({ email: null }) === 'pas_d_email')
    verifier('une fiche absente ne déclenche rien', raisonPasDeRelance(null, MAINTENANT) === 'fiche_absente')

    // ⚠️ LES DEUX BORNES, ET LEURS VOISINES IMMÉDIATES : c'est là que les
    // règles de délai se trompent, jamais au milieu.
    verifier('⚠️ 47 h : trop tôt, on laisse finir tranquillement',
      raison({ created_at: '2026-09-14T11:00:00' }) === 'trop_tot')
    verifier('⚠️ 48 h pile : la relance part', raison({ created_at: '2026-09-14T10:00:00' }) === null)
    verifier('⚠️ 30 jours pile : encore dans les temps',
      raison({ created_at: '2026-08-17T10:00:00' }) === null)
    verifier('🔴 31 jours : on ne réveille plus personne',
      raison({ created_at: '2026-08-16T09:00:00' }) === 'trop_vieux')
    // ⚠️ DANS LE DOUTE ON N'ENVOIE PAS : une date illisible ne vaut pas un feu vert.
    verifier('🔴 une date illisible n’autorise pas un envoi',
      raison({ created_at: 'pas une date' }) === 'date_inconnue')
    verifier('une date absente non plus', raison({ created_at: null }) === 'date_inconnue')

    // Le tri d'une fournée rend AUSSI ce qu'il a écarté, et pourquoi.
    const tri = trierPourRelance([
      fiche(), fiche({ id: 'c2', relance_inscription_envoyee_at: '2026-09-15T08:00:00' }),
      fiche({ id: 'c3', email: null }), fiche({ id: 'c4', created_at: '2026-09-16T09:00:00' }),
    ], MAINTENANT)
    egalNombre('un seul retenu sur quatre', tri.retenus.length, 1)
    egalNombre('et les écartés sont comptés par raison', Object.keys(tri.ecartes).length, 3)
    verifier('⚠️ chaque écarté porte un nom, sinon « 0 envoi » est indébogable',
      tri.ecartes.deja_relance === 1 && tri.ecartes.pas_d_email === 1 && tri.ecartes.trop_tot === 1,
      JSON.stringify(tri.ecartes))

    // ─── LA TÂCHE ELLE-MÊME ──────────────────────────────────────────────
    const cron = codeDe('app/api/cron/relance-inscriptions/route.js')
    // 🔴 SANS SECRET, ON REFUSE. Dix crons ont déjà été trouvés ouverts.
    verifier('🔴 la tâche refuse sans CRON_SECRET', /gardeCron\(request, 'relance-inscriptions'\)/.test(cron))
    verifier('🔴 elle prend ses colonnes à la règle', /\.select\(COLONNES_RELANCE\)/.test(cron))
    verifier('⚠️ dont celle du garde-fou',
      /relance_inscription_envoyee_at/.test(codeDe('lib/relance-inscription.js'))
      && COLONNES_RELANCE.includes('relance_inscription_envoyee_at'))
    verifier('🔴 une lecture en échec ne se lit pas « personne à relancer »',
      /if \(error\) \{[\s\S]{0,220}status: 500/.test(cron))
    // 🔴 L'ORDRE : marquer AVANT d'envoyer. Marquer après, c'est offrir un
    // second email à la moindre coupure entre les deux.
    const iMarque = cron.indexOf('relance_inscription_envoyee_at: maintenant.toISOString()')
    const iEnvoi = cron.indexOf('envoyerAuCommercant(')
    verifier('🔴 elle marque la fiche AVANT d’envoyer', iMarque > 0 && iEnvoi > iMarque)
    // ⚠️ ET ELLE REND LA FICHE RELANÇABLE SI L'ENVOI ÉCHOUE, sinon elle est
    // comptée comme relancée sans que personne n'ait rien reçu.
    verifier('⚠️ un envoi raté ne consomme pas la relance',
      /update\(\{ relance_inscription_envoyee_at: null \}\)/.test(cron))
    verifier('⚠️ le marquage ne repose pas sur un await non lu', /if \(errMarque\)/.test(cron))
    // La tâche doit être PLANIFIÉE, sinon elle ne tournera jamais.
    verifier('🔴 elle est déclarée dans vercel.json',
      /"\/api\/cron\/relance-inscriptions"/.test(lire('vercel.json')))
  }
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Porte du tableau de bord verte.')
