// Banc des GARDES DE FORFAIT SERVEUR.
//
// 🔴 CINQ ROUTES DU CŒUR TRANSACTIONNEL NE REGARDAIENT PAS LE FORFAIT. Les
// écrans, eux, le regardaient : un commerçant en Exister ne voyait pas le
// bouton « commander ». Mais **une garde d'écran n'est jamais une réponse**,
// et un `fetch` bien formé depuis la console passait à côté.
//
// ⚠️ CE BANC VÉRIFIE LES DEUX SENS, ET C'EST TOUT SON INTÉRÊT. Une garde qui
// refuse tout est aussi fausse qu'une garde qui laisse tout passer, et elle est
// plus difficile à voir : personne ne se plaint d'une porte fermée avant de
// s'être cogné dedans. Chaque fonction est donc testée REFUSÉE pour qui n'y a
// pas droit, ET ACCEPTÉE pour qui y a droit.
//
// ⚠️ LA RÈGLE QUI GOUVERNE TOUT : **la garde porte sur la CRÉATION, jamais sur
// la CONSOMMATION.** Un commerçant redescendu en Exister a peut-être vendu
// trente bons cadeaux et rempli deux cents cartes. Ses clients ont payé. Lui
// interdire d'HONORER ce qu'il a vendu ferait porter la sanction à des gens qui
// n'ont rien décidé.

import { readFileSync } from 'node:fs'
import { verdictForfait, forfaitOuvre, premierPlanQuiOuvre, COLONNES_GARDE } from '../lib/garde-forfait.js'
import { PLAN_FEATURES, commandeAllumee, getPillsStatut, planIa } from '../lib/plans.js'
import { actionCommerce } from '../lib/action-google.js'
import { commercantEligibleDeal } from '../lib/morning-eligibilite.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')
// ⚠️ ON CHERCHE DANS LE CODE, PAS DANS LA PROSE. Les commentaires de ces
// routes citent forcément ce qu'on y a retiré ou ajouté : trois gardes ont déjà
// rougi ou verdi à tort à cause de leur propre explication (26/08, deux fois
// dans la même journée).
const codeSeul = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(detail ? `${nom} — ${detail}` : nom)
}

// L'horloge est injectée : sans elle, « après l'essai » serait intestable
// jusqu'au 9 janvier 2027.
const PENDANT_ESSAI = new Date('2026-10-01T12:00:00Z')
const APRES_ESSAI   = new Date('2027-03-01T12:00:00Z')
const INSCRIT_LE    = '2026-08-01T10:00:00Z'

const commerce = (plan, extra = {}) => ({
  id: 'c1', plan, created_at: INSCRIT_LE, categorie: 'alimentaire', ...extra,
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE VERDICT LUI-MÊME
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ APRÈS L'ESSAI : le forfait choisi fait seul la loi.
verifier('Exister n\'ouvre pas la commande',
  !forfaitOuvre(commerce('exister'), 'commande', APRES_ESSAI))
verifier('Communiquer non plus',
  !forfaitOuvre(commerce('communiquer'), 'commande', APRES_ESSAI))
verifier('Vendre ouvre la commande',
  forfaitOuvre(commerce('vendre'), 'commande', APRES_ESSAI))
verifier('Communiquer ouvre la fidélité comptoir',
  forfaitOuvre(commerce('communiquer'), 'fidelite', APRES_ESSAI))
// ⚠️ LE CRÉDIT AUTOMATIQUE RESTE VENDRE, la fidélité comptoir non : deux clés
// différentes, et les confondre offrirait le transactionnel à Communiquer.
verifier('mais pas le crédit automatique',
  !forfaitOuvre(commerce('communiquer'), 'fidelite_auto', APRES_ESSAI))

// 🔴 PENDANT L'ESSAI, TOUT S'OUVRE. C'est la promesse faite au commerçant sur
// son tableau de bord ; une garde serveur qui l'ignorerait lui refuserait ce
// que son propre écran vient de lui ouvrir, sans un mot d'explication.
const enEssai = commerce('exister', { essai_plan: 'vendre' })
verifier('un Exister EN ESSAI de Vendre peut créer une commande',
  forfaitOuvre(enEssai, 'commande', PENDANT_ESSAI))
verifier('et prendre des rendez-vous',
  forfaitOuvre(enEssai, 'rdv', PENDANT_ESSAI))
// ⚠️ ET L'ESSAI SE REFERME. Le 9 janvier, ce qui n'a pas été payé se ferme.
verifier('mais plus une fois l\'essai terminé',
  !forfaitOuvre(enEssai, 'commande', APRES_ESSAI))
// ⚠️ L'ESSAI NE SE PROPOSE PAS TOUT SEUL : sans `essai_plan`, rien n'est ouvert
// même pendant la période. Il se DEMANDE, il ne s'impose pas.
verifier('sans essai demandé, rien ne s\'ouvre pendant la période',
  !forfaitOuvre(commerce('exister'), 'commande', PENDANT_ESSAI))

// ⚠️ FAIL-CLOSED SUR UNE DATE MANQUANTE. Un commerçant privé de son essai
// téléphone dans l'heure ; un commerçant qui garde tout gratuit après le
// 9 janvier ne dit rien et coûte des euros tous les mois.
verifier('sans date d\'inscription, l\'essai est éteint',
  !forfaitOuvre({ id: 'c', plan: 'exister', essai_plan: 'vendre' }, 'commande', PENDANT_ESSAI))
// ⚠️ ET PAS DE COMMERÇANT = PAS DE PASSE-DROIT.
verifier('un commerçant absent est refusé', !forfaitOuvre(null, 'commande'))
verifier('et le refus est explicite', verdictForfait(null, 'commande').code === 'commercant_inconnu')

// Le refus doit être UTILISABLE.
{
  const v = verdictForfait(commerce('exister'), 'commande', APRES_ESSAI)
  // ⚠️ 403 ET PAS 401 : le commerçant est bien authentifié, c'est un droit
  // qu'il n'a pas. Les confondre ferait déconnecter l'écran en boucle.
  verifier('le refus est un 403', v.statut === 403)
  verifier('il porte un code lisible', v.code === 'forfait_insuffisant')
  // ⚠️ IL NOMME LE FORFAIT MANQUANT. Un refus qui dit seulement « non » envoie
  // le commerçant au téléphone, et il a raison d'appeler.
  verifier('il nomme le forfait qui ouvrirait', v.plan_requis === 'vendre')
  verifier('et sa phrase le dit en toutes lettres', /Vendre/.test(v.message))
  // ⚠️ ET IL DIT LE GESTE, pas seulement le manque.
  verifier('la phrase dit quoi faire', /essayer|tableau de bord/i.test(v.message))
}
verifier('le premier forfait qui ouvre la commande est Vendre',
  premierPlanQuiOuvre('commande') === 'vendre')
verifier('celui qui ouvre la fidélité est Communiquer',
  premierPlanQuiOuvre('fidelite') === 'communiquer')
// Une clé inventée n'ouvre chez personne, et ne fabrique pas de forfait.
verifier('une fonction inconnue n\'ouvre nulle part',
  premierPlanQuiOuvre('n_importe_quoi') === null)
verifier('et son refus ne promet aucun forfait',
  verdictForfait(commerce('vendre'), 'n_importe_quoi').plan_requis === null)

// ⚠️ CHAQUE FONCTION GARDÉE DOIT EXISTER DANS LA MATRICE. Une clé absente rend
// `false` sans erreur : la garde fermerait tout, pour tout le monde, en
// silence. C'est le piège de `'prix'` au lieu de `'prix_affiches'`, qui a déjà
// mordu ce projet.
for (const feature of ['commande', 'livraison', 'rdv', 'fidelite', 'fidelite_auto', 'paiement_ligne']) {
  verifier(`la clé « ${feature} » existe dans la matrice`,
    Object.prototype.hasOwnProperty.call(PLAN_FEATURES.vendre, feature))
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LES CINQ ROUTES — ET LA COLONNE QUI DOIT ARRIVER JUSQU'À ELLES
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ `planEffectif` LIT TROIS COLONNES. Il en manque une et la garde se trompe
// EN SILENCE : `plan` absent et tout le monde retombe en Exister, boutique
// fermée pour des commerçants qui paient ; `created_at` ou `essai_plan` absents
// et l'essai s'éteint sans un mot.
const ROUTES = [
  { nom: 'create-commande',  chemin: 'app/api/stripe/checkout/create-commande/route.js' },
  { nom: 'create-rdv-acompte', chemin: 'app/api/stripe/checkout/create-rdv-acompte/route.js' },
  { nom: 'stripe/connect',   chemin: 'app/api/stripe/connect/create-account-link/route.js' },
  { nom: 'fidelite/comptoir', chemin: 'app/api/fidelite/comptoir/route.js' },
]
for (const r of ROUTES) {
  const src = codeSeul(lire(r.chemin))
  verifier(`${r.nom} appelle la garde de forfait`, /verdictForfait\(/.test(src))
  for (const col of COLONNES_GARDE) {
    verifier(`${r.nom} charge « ${col} »`, new RegExp(`\\b${col}\\b`).test(src))
  }
}

// ─── create-commande ────────────────────────────────────────────────────────
{
  const src = codeSeul(lire('app/api/stripe/checkout/create-commande/route.js'))
  verifier('create-commande garde la commande', /verdictForfait\(commercant, 'commande'\)/.test(src))
  // ⚠️ LA LIVRAISON A SON PROPRE PALIER. Une seule garde sur `commande`
  // laisserait passer une tournée chez un commerçant qui n'y a pas droit.
  verifier('et la livraison séparément', /verdictForfait\(commercant, 'livraison'\)/.test(src))
  // 🔴 ET ELLE N'APPLIQUE PAS LA CATÉGORIE. `peut()` réserve `commande` à
  // l'alimentaire alors que cette route sert AUSSI le détail : y passer
  // couperait la boutique de tout commerce de détail en Vendre. Passé à deux
  // doigts le 26/08.
  verifier('create-commande n\'applique pas la catégorie', !/\bpeut\(/.test(src))
}

// ─── stripe/connect : LE PIÈGE DU REMBOURSEMENT ─────────────────────────────
//
// 🔴 UNE GARDE POSÉE EN TÊTE DE CETTE ROUTE EMPÊCHERAIT UN REMBOURSEMENT. Un
// commerçant redescendu en Exister ne pourrait plus regénérer son lien Stripe :
// ni rembourser un client, ni atteindre l'argent déjà encaissé. On lui
// interdirait l'accès à son propre compte bancaire pour cause de forfait.
{
  const src = codeSeul(lire('app/api/stripe/connect/create-account-link/route.js'))
  const iCreation = src.indexOf('if (!accountId)')
  const iGarde = src.indexOf('verdictForfait(')
  verifier('stripe/connect garde bien quelque chose', iGarde > 0)
  verifier('la création du compte est repérable', iCreation > 0)
  // ⚠️ LA GARDE EST DEDANS, PAS AVANT. C'est toute la différence entre
  // « tu ne peux pas ouvrir un compte » et « tu ne peux plus toucher ton
  // argent ».
  verifier('la garde Stripe est APRÈS le test du compte existant', iGarde > iCreation)
  // Et le lien se génère toujours, pour tout le monde, en dehors du bloc.
  const apresBloc = src.slice(src.indexOf('accountLinks.create'))
  verifier('le lien d\'un compte existant se génère sans condition de forfait',
    apresBloc.length > 0 && !/verdictForfait/.test(apresBloc))
}

// ─── fidelite/comptoir : CHERCHER RESTE OUVERT ──────────────────────────────
//
// 🔴 FERMER `chercher` CONFISQUERAIT CE QUE LES CLIENTS ONT MÉRITÉ. C'est
// l'action qui retrouve une carte EXISTANTE pour que le client dépense sa
// récompense. Deux cents habitants sont revenus pour la gagner ; ils n'ont pas
// à la perdre parce que le commerçant a changé de formule.
{
  const src = codeSeul(lire('app/api/fidelite/comptoir/route.js'))
  const iChercher = src.indexOf("action === 'chercher'")
  const iCreer = src.indexOf("action === 'creer'")
  const iGarde = src.indexOf('verdictForfait(')
  verifier('le comptoir garde bien quelque chose', iGarde > 0)
  verifier('les deux actions sont repérables', iChercher > 0 && iCreer > 0)
  // ⚠️ LA GARDE EST DANS `creer`, APRÈS `chercher`. Posée avant, elle fermerait
  // la consommation en même temps que la création.
  verifier('la garde est dans « creer », jamais avant « chercher »',
    iGarde > iChercher && iGarde > iCreer)
  const blocChercher = src.slice(iChercher, iCreer)
  verifier('« chercher » ne teste aucun forfait', !/verdictForfait/.test(blocChercher))
  // ⚠️ ET IL NE TESTE PAS NON PLUS `fidelite_actif` : une carte remplie du
  // temps où le programme tournait doit rester consultable après extinction.
  verifier('« chercher » ne teste pas non plus l\'interrupteur',
    !/fidelite_actif/.test(blocChercher))
}

// ─── create-rdv-acompte ─────────────────────────────────────────────────────
{
  const src = codeSeul(lire('app/api/stripe/checkout/create-rdv-acompte/route.js'))
  // ⚠️ DEUX FONCTIONS, DEUX GARDES : `rdv` ouvre l'agenda, `paiement_ligne`
  // ouvre l'encaissement. Une seule laisserait passer la moitié du geste.
  verifier('le RDV payant garde l\'agenda ET le paiement',
    /'rdv', 'paiement_ligne'/.test(src))
  // ⚠️ ET L'INTERRUPTEUR, séparément : avoir la fonction dans sa formule ne
  // veut pas dire l'avoir allumée.
  verifier('et il vérifie aussi l\'interrupteur rdv_actif',
    /!commercant\.rdv_actif/.test(src))
}

// ─── fidelite/crediter ──────────────────────────────────────────────────────
//
// La garde existait, mais elle lisait `commercant.plan` : un commerçant EN
// ESSAI de Vendre voyait la fidélité automatique sur son tableau de bord et sa
// carte ne se remplissait pas, sans la moindre erreur nulle part.
{
  const src = codeSeul(lire('lib/fidelite-server.js'))
  verifier('le crédit automatique lit le forfait EFFECTIF',
    /canDo\(planEffectif\(commercant\), 'fidelite_auto'\)/.test(src))
  verifier('et plus la colonne brute',
    !/canDo\(commercant\.plan, 'fidelite_auto'\)/.test(src))
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. L'ESSAI DOIT SE VOIR DEPUIS LA FICHE PUBLIQUE
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 TROUVÉ LE 26/08 EN VÉRIFIANT AUTRE CHOSE. Un commerçant active l'essai de
// Vendre : son tableau de bord s'ouvre, les onglets s'allument, le bandeau
// annonce sa date. Et SA FICHE PUBLIQUE CONTINUE DE REFUSER LES COMMANDES.
//
// ⚠️ CE N'ÉTAIT PAS UN DÉTAIL D'AFFICHAGE, C'ÉTAIT L'ESSAI QUI NE SERVAIT À
// RIEN. Il va voir sa propre boutique, rien n'a changé, et il conclut que la
// proposition était creuse. « Qu'il y goûte, et qu'il y reste » suppose qu'il
// y ait quelque chose à goûter.
{
  const ECRANS = [
    { nom: 'la fiche commerçant', chemin: 'app/commander/[slug]/page.js' },
    { nom: 'la fiche rendez-vous', chemin: 'app/commander/rdv/[slug]/page.js' },
    { nom: 'la liste des commerces', chemin: 'app/commander/page.js' },
  ]
  for (const e of ECRANS) {
    const src = codeSeul(lire(e.chemin))
    verifier(`${e.nom} lit le forfait effectif`, /planEffectif\(/.test(src))
    // ⚠️ ET PLUS LA COLONNE BRUTE. Un seul `canDo(x.plan, …)` oublié et
    // l'essai reste invisible à cet endroit-là, sans erreur nulle part.
    verifier(`${e.nom} ne lit plus la colonne brute`,
      !/canDo\((?:commercant\??\.|c\.)plan\b/.test(src))
    // 🔴 ET SURTOUT PAS `peut()`. Il applique la CATÉGORIE, et la matrice
    // réserve `commande` à l'alimentaire alors que ces écrans servent AUSSI
    // le détail et la vitrine : y passer couperait la boutique de tous les
    // commerces de détail en Vendre. Passé à deux doigts le 26/08.
    verifier(`${e.nom} n'applique pas la catégorie`, !/\bpeut\(/.test(src))
  }

  // ⚠️ ET LA COLONNE DOIT ARRIVER JUSQU'À EUX. Ces écrans lisent la VUE
  // `commercants_public`, pas la table : `essai_plan` doit y être exposée,
  // sinon `planEffectif` retombe sur `plan` EN SILENCE et tout ce qui précède
  // ne sert à rien.
  const migration = lire('migrations/MIGRATION_VUE_PUBLIQUE_ESSAI.sql')
  verifier('la vue publique expose essai_plan', /^\s*essai_plan$/m.test(migration))
  // ⚠️ ET ELLE GARDE TOUT LE RESTE. `CREATE OR REPLACE VIEW` REMPLACE : une
  // liste amputée ferait disparaître des colonnes sans lever d'erreur. Une
  // première version de cette migration en oubliait TREIZE, dont toute la
  // configuration de fidélité.
  for (const col of ['fidelite_mecanique', 'fidelite_recompense_libelle', 'bons_cadeaux_actif',
    'photos_catalogue_actif', 'infos_pratiques', 'boutique_delai_heures', 'created_at']) {
    verifier(`la vue garde « ${col} »`, new RegExp(`\\b${col}\\b`).test(migration))
  }
  // ⚠️ GRANT SYSTÉMATIQUE : une vue sans GRANT, c'est la fiche publique qui
  // rend 42501 à tous les visiteurs, d'un coup.
  verifier('la vue est bien accordée à anon',
    /GRANT SELECT ON commercants_public TO anon, authenticated;/.test(migration))
  // ⚠️ ET `essai_demande_le` RESTE DEHORS : on n'expose que ce qui sert.
  verifier('la date de demande d\'essai n\'est pas exposée',
    !/^\s*essai_demande_le,?$/m.test(migration))
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 LA COMMANDE EN LIGNE S'ÉTEINT (Alex, 09/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// C'était le SEUL module sans interrupteur : la livraison, les rendez-vous, la
// fidélité et les bons cadeaux ont tous le leur. Un restaurant qui ne fait pas
// de plats à emporter se voyait imposer un bouton « Commander ».
//
// ⚠️ ET LE FORFAIT NE SUFFIT PAS À DÉCIDER : il dit ce que le commerçant a le
// DROIT de faire, pas ce qu'il VEUT faire. Les deux conditions vivent côte à
// côte, jamais l'une à la place de l'autre.
{
  verifier('un commerce qui n’a rien réglé accepte les commandes',
    commandeAllumee({ categorie: 'alimentaire', plan: 'vendre' }))
  verifier('un commerce qui a coché accepte aussi',
    commandeAllumee({ commande_actif: true }))
  verifier('🔴 un commerce qui a décoché refuse',
    !commandeAllumee({ commande_actif: false }))
  // 🔴 LE PIÈGE QUI AURAIT COUPÉ LE PARC ENTIER. La colonne s'ajoute à la table
  // AVANT d'exister dans la vue publique : pendant ce temps-là elle vaut
  // `undefined` chez chaque visiteur. Avec `=== true`, la commande en ligne
  // aurait disparu partout le temps d'une migration, sans une seule erreur.
  verifier('🔴 une colonne pas encore lue OUVRE, elle ne ferme pas',
    commandeAllumee({}) && commandeAllumee(null) && commandeAllumee({ commande_actif: undefined }))
  verifier('et le code le dit dans ce sens-là',
    /commercant\?\.commande_actif !== false/.test(lire('lib/plans.js')))

  // Les pastilles, dans les trois catégories.
  {
    const cles = (c) => getPillsStatut(c, {}).map(p => p.key)
    for (const categorie of ['alimentaire', 'detail', 'vitrine']) {
      const base = { categorie, plan: 'vendre', fidelite_actif: false, bons_cadeaux_actif: false }
      verifier(`un ${categorie} en Vendre propose de commander`,
        cles(base).includes('commande'))
      verifier(`🔴 et il ne le propose plus quand il éteint`,
        !cles({ ...base, commande_actif: false }).includes('commande'))
    }
  }

  // 🔴 LE SERVEUR, SINON CE N'EST QU'UN ÉCRAN. Une garde d'écran n'est jamais
  // une réponse : sans cette ligne, la fiche n'affiche plus rien mais un lien
  // direct vers le tunnel passe encore.
  const CREATE = codeSeul(lire('app/api/stripe/checkout/create-commande/route.js'))
  verifier('🔴 la route de création refuse une commande éteinte',
    /if \(!commandeAllumee\(commercant\)\) \{/.test(CREATE)
    && /code: 'commande_eteinte'/.test(CREATE))
  verifier('⚠️ et elle garde AUSSI la garde de forfait',
    /const verdict = verdictForfait\(commercant, 'commande'\)/.test(CREATE))

  const FICHE = codeSeul(lire('app/commander/[slug]/page.js'))
  // ⚠️ LA VARIABLE A CHANGÉ DE NOM LE 09/09, et le nom dit la nuance : ce que
  // le COMMERCE accepte, distinct de ce que le CLIENT peut faire maintenant.
  // Chez un restaurant qui propose l'emporté ET les tables, la carte ne se
  // remplit qu'une fois qu'il a dit ce qu'il venait faire.
  verifier('la fiche publique lit l’interrupteur',
    /const commerceAccepteCommandes = canDo\(forfaitVivant, 'commande'\) && commandeAllumee\(commercant\)/.test(FICHE))

  const CONFIG = codeSeul(lire('app/dashboard/ConfigDashboard.js'))
  verifier('l’interrupteur existe dans le profil',
    /Accepter les commandes en ligne/.test(CONFIG))
  // ⚠️ IL VIENT AVANT LA LIVRAISON : on ne livre pas ce qu'on ne peut pas
  // commander, et l'ordre des cases raconte cette dépendance.
  verifier('⚠️ et il vient avant celui de la livraison',
    CONFIG.indexOf('Accepter les commandes en ligne') < CONFIG.indexOf('Activer la livraison'))
  verifier('🔴 il prévient quand la livraison reste allumée pour rien',
    /Ta livraison est encore allumée, et elle ne servira à rien/.test(CONFIG))
  verifier('et il se relit comme il s’écrit',
    /commande_actif: data\.commande_actif !== false,/.test(CONFIG)
    && /commande_actif: form\.commande_actif !== false,/.test(CONFIG))
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 L'ESSAI SE VOYAIT AU TABLEAU DE BORD, ET NULLE PART AILLEURS (15/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// Trouvé en relisant le règlement du concours de lancement : un commerçant en
// essai de Vendre allumait ses bons cadeaux, et PERSONNE ne pouvait en acheter.
// La route d'achat et celle qui affiche le bouton lisaient `commercant.plan`.
// Le même défaut vivait dans les pastilles, le lien Google, le Good Morning,
// les notifications aux favoris, l'export comptable, les statistiques, les
// packs SMS, la fidélité d'un bon, le récap du matin et la limite d'actus.
//
// ⚠️ LES DEUX SENS, comme partout dans ce banc : ouvert PENDANT l'essai,
// refermé APRÈS. Une correction qui ouvrirait pour toujours offrirait Vendre.
{
  const enEssai = commerce('exister', {
    essai_plan: 'vendre', slug: 'essai', bons_cadeaux_actif: true, fidelite_actif: false,
    statut_publication: 'publie', adresse: 'Rue de Prée 9, 5640 Mettet',
  })

  // ─── Ce qui s'exécute ─────────────────────────────────────────────────────
  const pastilles = (c, m) => getPillsStatut(c, { maintenant: m }).map(p => p.key)
  verifier('🔴 la fiche d’un commerçant en essai montre ses bons cadeaux',
    pastilles(enEssai, PENDANT_ESSAI).includes('bons'))
  verifier('et ne les montre plus une fois l’essai terminé',
    !pastilles(enEssai, APRES_ESSAI).includes('bons'))
  verifier('sans essai demandé, la pastille reste absente',
    !pastilles({ ...enEssai, essai_plan: null }, PENDANT_ESSAI).includes('bons'))

  verifier('🔴 Google apprend qu’un commerçant en essai prend des commandes',
    actionCommerce(enEssai, PENDANT_ESSAI)?.type === 'commander')
  verifier('et ne le déclare plus après l’essai',
    actionCommerce(enEssai, APRES_ESSAI) === null)

  const mettet = new Set(['5640'])
  verifier('🔴 le deal d’un commerçant en essai entre dans le Good Morning',
    commercantEligibleDeal(enEssai, mettet, PENDANT_ESSAI))
  verifier('et en sort après l’essai',
    !commercantEligibleDeal(enEssai, mettet, APRES_ESSAI))

  // ─── Ce qui se lit ────────────────────────────────────────────────────────
  //
  // ⚠️ CES ROUTES NE S'EXÉCUTENT PAS AU BANC : elles appellent Supabase et
  // Stripe. On lit donc la RÈGLE (le forfait effectif) ET la REQUÊTE (les deux
  // colonnes), parce qu'une seule des deux ne protège rien : `planEffectif`
  // sans `essai_plan` retombe sur le forfait choisi, en silence.
  // ⚠️ L'actu du Good Morning n'a pas d'essai d'exécution : `actu_gmy` est
  // ouverte à Exister, le résultat serait le même avant et après. Sa garde est
  // donc de lecture.
  const LECTURES = [
    { nom: 'l’achat d’un bon', chemin: 'app/api/bons-cadeaux/checkout/route.js', regles: [
      ['charge l’essai', /'id, nom, slug, plan, essai_plan, created_at, categorie,/],
      ['vend selon le forfait effectif', /!canDo\(planEffectif\(commercant\), 'bons_cadeaux'\)/],
    ] },
    { nom: 'le bouton « offrir un bon »', chemin: 'app/api/bons-cadeaux/config/route.js', regles: [
      ['charge l’essai', /'plan, essai_plan, created_at, statut_publication,/],
      ['s’affiche selon le forfait effectif', /canDo\(planEffectif\(c\), 'bons_cadeaux'\)/],
    ] },
    { nom: 'la notification d’une actu', chemin: 'app/api/actus/notify-favoris/route.js', regles: [
      ['charge l’essai', /slug, plan, essai_plan, created_at, statut_publication\)/],
      ['lit le forfait effectif', /const planVivant = planEffectif\(c\)/],
    ] },
    { nom: 'la notification d’un deal', chemin: 'app/api/deals/notify-favoris/route.js', regles: [
      ['charge l’essai', /slug, plan, essai_plan, created_at, statut_publication\)/],
      ['lit le forfait effectif', /!canDo\(planEffectif\(c\), 'deals'\)/],
    ] },
    { nom: 'l’export comptable', chemin: 'app/api/dashboard/export-comptable/route.js', regles: [
      ['charge l’essai', /'id, nom, plan, essai_plan, created_at, auth_user_id,/],
      ['lit le forfait effectif', /canDo\(planEffectif\(commercant\), 'export_comptable'\)/],
    ] },
    { nom: 'les statistiques', chemin: 'app/api/dashboard/statistiques/route.js', regles: [
      ['chargent l’essai', /'id, auth_user_id, plan, essai_plan, created_at, categorie'/],
      ['lisent le forfait effectif', /peutVendre: canDo\(planEffectif\(commercant\), 'deals'\)/],
    ] },
    { nom: 'les packs SMS', chemin: 'app/api/fidelite/sms-packs/checkout/route.js', regles: [
      ['chargent l’essai', /plan, essai_plan, created_at, auth_user_id, stripe_customer_id/],
      ['lisent le forfait effectif', /canDo\(planEffectif\(com\), 'fidelite'\)/],
    ] },
    { nom: 'la fidélité d’un bon acheté', chemin: 'app/api/stripe/webhook/route.js', regles: [
      ['charge la ligne entière', /\.from\('commercants'\)\.select\('\*'\)\.eq\('id', com\.id\)/],
      ['lit le forfait effectif', /canDo\(planEffectif\(complet\), 'fidelite_auto'\)/],
    ] },
    { nom: 'le cron du Good Morning', chemin: 'app/api/cron/morning-yoppers/route.js', regles: [
      ['lit le forfait effectif pour les deals', /const planDeal = planEffectif\(c\)/],
      ['et pour les actus', /canDo\(planEffectif\(c\), 'actu_gmy'\)/],
    ], selects: [/adresse, plan, essai_plan, created_at, statut_publication\)/g, 2] },
    { nom: 'le récap du matin', chemin: 'app/api/cron/recap-jour-8h/route.js', regles: [
      ['charge l’essai', /categorie, plan, essai_plan, created_at, rdv_actif'/],
      ['lit le forfait effectif', /planEffectif\(c\) === 'vendre'/],
    ] },
    { nom: 'l’éligibilité au Good Morning', chemin: 'lib/morning-eligibilite.js', regles: [
      ['l’actu lit le forfait effectif', /canDo\(planEffectif\(c, maintenant\), 'actu_gmy'\)/],
    ] },
    { nom: 'la page Good Morning', chemin: 'app/commander/morning/page.js', regles: [],
      selects: [/adresse, plan, essai_plan, created_at, statut_publication,/g, 2] },
    { nom: 'le balisage Google de la fiche', chemin: 'app/commander/[slug]/layout.js', regles: [
      ['charge l’essai', /longitude, plan, essai_plan, created_at'/],
    ] },
    { nom: 'la consigne Google du kit', chemin: 'app/kit/[slug]/page.js', regles: [
      ['charge l’essai', /'nom, slug, plan, essai_plan, created_at, categorie'/],
    ] },
    { nom: 'le tableau de bord', chemin: 'app/dashboard/ConfigDashboard.js', regles: [
      ['la consigne Google charge l’essai', /'slug, nom, plan, essai_plan, created_at, categorie'/],
      ['la limite d’actus lit le forfait effectif', /const planResolu = planEffectif\(commercant\)/],
    ] },
  ]
  // ⚠️ La forme brute interdite, sur les fichiers où plus aucun droit ne doit
  // se lire dans la colonne. Pas sur le tableau de bord : il lit `plan` pour
  // AFFICHER le forfait choisi, et c'est juste.
  const BRUT = /canDo\((?:c|com|commercant|complet)\??\.plan\b|resolvePlan\(c\.plan\) === 'vendre'/
  for (const l of LECTURES) {
    const src = codeSeul(lire(l.chemin))
    for (const [quoi, re] of l.regles) verifier(`${l.nom} ${quoi}`, re.test(src))
    if (l.selects) {
      const [re, attendu] = l.selects
      const n = (src.match(re) || []).length
      verifier(`${l.nom} charge l’essai dans ses ${attendu} requêtes`, n === attendu, `${n} trouvée(s)`)
    }
    if (l.chemin !== 'app/dashboard/ConfigDashboard.js') {
      verifier(`${l.nom} ne lit plus la colonne brute`, !BRUT.test(src))
    }
  }
  for (const chemin of ['lib/action-google.js', 'lib/plans.js']) {
    verifier(`${chemin} lit le forfait effectif`,
      /const plan = planEffectif\(commercant, maintenant\)/.test(codeSeul(lire(chemin))))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE VOLUME D'IA PENDANT L'ESSAI (Alex, 15/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// « On garde le volume de Communiquer pour l'IA. » L'essai ouvre les fonctions
// de Vendre, jamais Sonnet ni ses 200 textes par mois. Les deux erreurs sont
// possibles et aucune ne se voit : lire `plan` laisse un Exister en essai à un
// texte par mois, lire `planEffectif` offre Sonnet à tout essai.
{
  const essaiVendre = commerce('exister', { essai_plan: 'vendre' })
  verifier('🔴 un Exister en essai de Vendre écrit au volume de Communiquer',
    planIa(essaiVendre, PENDANT_ESSAI) === 'communiquer')
  verifier('et retombe sur Exister une fois l’essai terminé',
    planIa(essaiVendre, APRES_ESSAI) === 'exister')
  verifier('un Exister en essai de Communiquer aussi',
    planIa(commerce('exister', { essai_plan: 'communiquer' }), PENDANT_ESSAI) === 'communiquer')
  verifier('⚠️ un Communiquer en essai de Vendre ne monte pas à Vendre',
    planIa(commerce('communiquer', { essai_plan: 'vendre' }), PENDANT_ESSAI) === 'communiquer')
  verifier('⚠️ celui qui PAIE Vendre garde son volume',
    planIa(commerce('vendre'), PENDANT_ESSAI) === 'vendre')
  verifier('sans essai demandé, rien ne monte',
    planIa(commerce('exister'), PENDANT_ESSAI) === 'exister')
  verifier('et l’ancien nom `full` reste Vendre',
    planIa(commerce('full'), APRES_ESSAI) === 'vendre')

  const IA = [
    { nom: 'le générateur de textes', chemin: 'app/api/ia/generer-post/route.js', regles: [
      ['charge l’essai', /'id, nom, type, plan, essai_plan, created_at, categorie,/],
      ['règle son volume par planIa', /const cfg = getIaConfig\(planIa\(com\)\)/],
    ] },
    { nom: 'la rédaction de la fiche', chemin: 'app/api/ia/presentation/route.js', regles: [
      ['charge l’essai', /auth_user_id, plan, essai_plan, created_at'/],
      ['règle son quota par planIa', /getIaFicheConfig\(planIa\(com\)\)\.quota_mois/],
    ] },
    { nom: 'l’onglet générateur', chemin: 'app/dashboard/TabGenerateur.js', regles: [
      ['affiche le volume du serveur', /const cfg = getIaConfig\(planIa\(commercant\)\)/],
      ['ne promet « 1 essai » qu’à un vrai Exister', /const estExister = planIa\(commercant\) === 'exister'/],
    ] },
    { nom: 'le tableau de bord', chemin: 'app/dashboard/ConfigDashboard.js', regles: [
      ['ouvre l’onglet par planIa', /const iaActif = getIaConfig\(planIa\(commercant\)\)\.actif/],
    ] },
  ]
  for (const l of IA) {
    const src = codeSeul(lire(l.chemin))
    for (const [quoi, re] of l.regles) verifier(`${l.nom} ${quoi}`, re.test(src))
    verifier(`🔴 ${l.nom} ne règle jamais l’IA sur le forfait effectif`,
      !/getIa(?:Fiche)?Config\(planEffectif/.test(src))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Gardes de forfait vertes.')
