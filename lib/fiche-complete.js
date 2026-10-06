// UNE FICHE EST-ELLE PRÊTE À ÊTRE MONTRÉE AUX CLIENTS ?
//
// 🔴 POURQUOI CE FICHIER EXISTE (Alex, 28/09) : « les commerçants ne complètent
// pas leurs fiches, je ne peux pas laisser les fiches non complétées être
// publiées ». La cause n'était pas les commerçants, c'était la mécanique :
// valider un dossier OUVRAIT le tableau de bord ET PUBLIAIT la fiche d'un même
// geste. Or le catalogue, les photos et l'encaissement ne se remplissent QUE
// depuis le tableau de bord. Alex n'avait donc que deux choix, tous deux
// mauvais : ne pas valider, et le commerçant ne pouvait rien compléter ;
// valider, et une fiche vide partait en ligne.
//
// Depuis, les deux gestes sont séparés. Valider ouvre l'espace ; la fiche
// reste invisible jusqu'à ce qu'elle soit complète, que le commerçant demande
// sa mise en ligne, et qu'Alex clique sur « Publier ».
//
// ⚠️ LA LISTE EST CELLE D'ALEX, décidée le 28/09 : au moins 3 articles ou
// prestations, 2 photos, un logo, une présentation, des horaires, et au moins
// un moyen d'encaisser sur les deux.
//
// 🔴 ET UN LIEU SITUÉ DANS « OÙ ME TROUVER » (Alex, 06/10). C'est de là que se
// mesure la distance des cards, et l'étoile de livraison part du lieu
// permanent. L'adresse d'inscription ne sert qu'au dossier : elle ne localise
// JAMAIS le commerce. Sans lieu situé, la fiche n'a ni adresse ni distance.
// Une seule règle pour tous, sans liste d'exceptions : le commerce fixe y met
// son adresse, le food truck ses emplacements, le centre à plusieurs salles
// ses salles.
//
// ⚠️ UN CRITÈRE QUI NE CONCERNE PAS CE COMMERÇANT DISPARAÎT, il ne reste pas
// rouge à vie (même règle que le score d'inscription, voir
// lib/score-onboarding.js). Un commerce en Exister n'encaisse rien en ligne ni
// sur place par Yoppaa : lui demander un moyen de paiement, c'est lui barrer la
// publication pour toujours sans qu'il puisse rien y faire.
//
// Fichier PUR : aucune base, aucune horloge implicite, testable en l'exécutant.
// C'est LUI que lisent le tableau de bord, l'admin, les emails et les routes
// serveur : une règle écrite deux fois finit par dire deux choses.

import { peut, resolvePlan } from './plans'
import { modesPaiementOuverts } from './modes-paiement'
import { STATUTS_ACCES_AUTORISE, COLONNE_PUBLICATION } from './statut-commercant'

export const MIN_CATALOGUE = 3
export const MIN_PHOTOS = 2
// Le même seuil que l'inscription : un commerçant n'a pas à découvrir, une
// fois dans son tableau de bord, qu'une présentation acceptée hier ne suffit
// plus aujourd'hui.
export const MIN_PRESENTATION = 20

// ⚠️ LA RÈGLE DÉCLARE LES COLONNES QU'ELLE LIT. Une seule absente du select et
// le critère correspondant paraît manquant à tort : le commerçant se ferait
// relancer pour un logo qu'il a déjà mis.
export const COLONNES_FICHE_COMPLETE = [
  'id', 'nom', 'email', 'slug', 'categorie', 'plan', 'essai_plan', 'created_at',
  'logo_url', 'description', 'horaires_detail', 'siege_social_est_lieu_activite',
  'stripe_account_charges_enabled', 'accepte_paiement_cash',
  'boutique_retrait_paiement', 'boutique_mode_vente',
  'statut', COLONNE_PUBLICATION, 'publication_demandee_at',
  'relance_fiche_envoyee_at', 'relances_fiche_nb',
].join(', ')

// ─── Les états où la question se pose ──────────────────────────────────────
//
// Validé (l'espace est ouvert) et pas publié. `suspendu` en fait partie : c'est
// l'état qu'Alex utilise aussi pour retirer une fiche, et un commerçant dont la
// fiche a été retirée doit savoir ce qu'il lui manque pour revenir.
export const PUBLICATIONS_EN_ATTENTE = ['en_attente', 'suspendu']

export function ficheAPublier(commercant) {
  return STATUTS_ACCES_AUTORISE.includes(commercant?.statut)
    && PUBLICATIONS_EN_ATTENTE.includes(commercant?.[COLONNE_PUBLICATION])
}

// ─── Les deux exceptions, écrites une fois ─────────────────────────────────
//
// Un service en Exister peut travailler uniquement sur rendez-vous, sans
// horaires fixes. Un commerçant qui change d'endroit a ses horaires DÉDUITS de
// ses emplacements. Mêmes règles que l'inscription.
export function horairesRequis(commercant) {
  const plan = resolvePlan(commercant?.plan) || 'exister'
  if (plan === 'exister' && commercant?.categorie === 'vitrine') return false
  if (commercant?.siege_social_est_lieu_activite === false) return false
  return true
}

// Le paiement ne se demande qu'à celui dont la formule encaisse.
export function paiementRequis(commercant, maintenant = new Date()) {
  return peut(commercant, 'paiement_ligne', maintenant) || peut(commercant, 'paiement_cash', maintenant)
}

function paiementPret(commercant) {
  const estDetail = commercant?.categorie === 'detail'
  const modeBoutique = commercant?.boutique_mode_vente === 'expedition' ? 'expedition' : 'retrait'
  const { stripeOK, cashOK } = modesPaiementOuverts({ commercant, estDetail, modeBoutique })
  return stripeOK || cashOK
}

// Le mot que le commerçant emploie pour ce qu'il vend, accordé au nombre :
// « encore 1 produits » se lit comme une faute, et une faute dans un rappel
// fait douter du reste.
export function motCatalogue(commercant, n = 2) {
  const pluriel = n > 1
  if (commercant?.categorie === 'vitrine') return pluriel ? 'prestations ou articles' : 'prestation ou article'
  if (commercant?.categorie === 'detail') return pluriel ? 'articles' : 'article'
  return pluriel ? 'produits' : 'produit'
}

// L'onglet du tableau de bord où se remplit le catalogue. Chez un service qui
// prend des rendez-vous, les prestations vivent dans l'agenda ; partout
// ailleurs, dans la carte ou le catalogue.
function ongletCatalogue(commercant, maintenant) {
  return commercant?.categorie === 'vitrine' && peut(commercant, 'rdv', maintenant) ? 'rdv' : 'menu'
}

// Rend le bilan complet.
//
// `nbCatalogue` = articles actifs + prestations actives, `nbPhotos` = photos de
// la fiche. Ils viennent de la base : c'est à l'appelant de les compter, la
// règle ne lit rien elle-même.
//
// `nbLieuxSitues` = lieux ACTIFS de « Où me trouver » qui ont une position
// (tous types : permanent, hebdomadaire, ponctuel).
export function ficheComplete({ commercant, nbCatalogue = 0, nbPhotos = 0, nbLieuxSitues = 0, maintenant = new Date() } = {}) {
  const c = commercant || {}
  const nbCat = Number.isFinite(nbCatalogue) ? nbCatalogue : 0
  const nbPh = Number.isFinite(nbPhotos) ? nbPhotos : 0
  const nbLieux = Number.isFinite(nbLieuxSitues) ? nbLieuxSitues : 0
  const mot = motCatalogue(c, MIN_CATALOGUE)
  const reste = Math.max(0, MIN_CATALOGUE - nbCat)

  const criteres = [
    {
      cle: 'catalogue',
      label: `Au moins ${MIN_CATALOGUE} ${mot}`,
      atteint: nbCat >= MIN_CATALOGUE,
      avancement: `${Math.min(nbCat, MIN_CATALOGUE)} sur ${MIN_CATALOGUE}`,
      manque: nbCat === 0 ? 'ton catalogue' : `encore ${reste} ${motCatalogue(c, reste)}`,
      // ⚠️ LA MENTION DEMANDÉE PAR ALEX : trois, c'est le seuil pour demander la
      // mise en ligne, pas l'objectif. Un commerçant qui s'arrête à trois a
      // une fiche qui ne fait pas revenir.
      aide: `Il en faut ${MIN_CATALOGUE} pour demander la mise en ligne. Mais un client qui ne trouve pas ce qu’il cherche ne revient pas : mets-y tout ce que tu vends.`,
      onglet: ongletCatalogue(c, maintenant),
    },
    {
      cle: 'photos',
      label: `${MIN_PHOTOS} photos de ton commerce`,
      atteint: nbPh >= MIN_PHOTOS,
      avancement: `${Math.min(nbPh, MIN_PHOTOS)} sur ${MIN_PHOTOS}`,
      manque: nbPh === 0 ? `${MIN_PHOTOS} photos` : 'une photo de plus',
      aide: 'Ta vitrine, ton comptoir, ton équipe : c’est ce que le client regarde en premier.',
      onglet: 'profil',
    },
    {
      cle: 'logo',
      label: 'Ton logo',
      atteint: !!String(c.logo_url || '').trim(),
      manque: 'ton logo',
      aide: 'Il apparaît sur ta fiche et dans la liste des commerces.',
      onglet: 'profil',
    },
    {
      cle: 'presentation',
      label: 'Ta présentation',
      atteint: String(c.description || '').trim().length >= MIN_PRESENTATION,
      manque: 'ta présentation',
      aide: 'Quelques phrases sur ce que tu fais. L’assistant peut t’aider à l’écrire.',
      onglet: 'profil',
    },
    {
      cle: 'lieu',
      label: 'Ton adresse dans « Où me trouver »',
      atteint: nbLieux >= 1,
      manque: 'ton adresse dans « Où me trouver »',
      aide: 'C’est elle que voient tes clients, et c’est d’elle que se mesure la distance qui leur est affichée. L’adresse de ton inscription ne sert qu’à valider ton dossier.',
      onglet: 'profil',
      sousOnglet: 'lieux',
    },
    ...(horairesRequis(c) ? [{
      cle: 'horaires',
      label: 'Tes horaires d’ouverture',
      atteint: !!(c.horaires_detail && typeof c.horaires_detail === 'object'
        && Object.values(c.horaires_detail).some(h => h?.ouvert)),
      manque: 'tes horaires',
      aide: 'Au moins un jour ouvert dans la semaine.',
      onglet: 'profil',
    }] : []),
    ...(paiementRequis(c, maintenant) ? [{
      cle: 'paiement',
      label: 'Un moyen d’encaisser',
      atteint: paiementPret(c),
      manque: 'un moyen d’encaisser',
      aide: 'Le paiement en ligne (Stripe) ou le paiement sur place : l’un des deux suffit.',
      onglet: 'paiements',
    }] : []),
  ]

  const manquants = criteres.filter(k => !k.atteint)
  return {
    criteres,
    manquants,
    complet: manquants.length === 0,
    faits: criteres.length - manquants.length,
    total: criteres.length,
  }
}

// « ton logo, 2 photos et ta présentation » : ce qu'on écrit au commerçant.
//
// ⚠️ ON NOMME CE QUI MANQUE, jamais un pourcentage. « Il te reste ton logo »
// se fait en deux minutes ; « ta fiche est à 71 % » ne dit pas par où
// commencer.
export function phraseManquants(manquants = []) {
  const mots = (manquants || []).map(m => m.manque).filter(Boolean)
  if (mots.length === 0) return ''
  if (mots.length === 1) return mots[0]
  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`
}
