// Plans YOPPAA — source unique de vérité
// Toute logique conditionnelle "ce plan peut-il X ?" passe par canDo(plan, feature).
// Pour les features catégorie-spécifiques (commande, livraison, rdv, multi_praticiens,
// reservation_produit), utiliser canDoAvecCategorie(plan, feature, categorie).
//
// ═══════════════════════════════════════════════════════════════════════════════
// REFACTOR 2026-06-16 : passage 3 plans (on/full/public) → 4 paliers
//   Exister (gratuit) · Communiquer (19,90€) · Vendre (49,90€) · Public (gratuit)
// Framework interne : « Exister / Communiquer / Vendre »
// Source : brief refonte 3 paliers du 15/06/2026, validations Q1-Q3 du 15/06 PM.
//
// MAPPING MIGRATION DB :
//   on   → exister     (présence + GMY uniquement)
//   full → vendre      (tout, dont transactionnel)
//   nouveau palier intermédiaire : communiquer (push ciblés, pas de transactionnel)
//
// COMPAT TEMPORAIRE : aliases legacy on/full acceptés pendant la transition.
// Les helpers (canDo, canDoAvecCategorie...) résolvent automatiquement les anciennes
// valeurs vers les nouvelles. À retirer une fois la migration DB validée (LEGACY_PLAN_ALIASES).
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// FEATURE FLAG — Plan PUBLIC (décision Alex 22/06/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Le Plan PUBLIC (services & administrations, commune, CPAS...) est NEUTRALISÉ
// en V1 pour recentrer le périmètre sur le commerce avant le 21/07 (dévoilement)
// et le 01/09 (lancement). Réactivation phase 2.
//
// Source unique de vérité du flag. Si false :
//   - plansDispoPourCategorie('publique') retourne [] (catégorie inscriptible disparaît)
//   - L'onglet "Officiel" de /commander disparaît
//   - /commander/services/[slug] renvoie 404
//   - Les sections "services & administrations" sont masquées partout
//
// La spec, les colonnes DB (codes_postaux[]), la table services_publics si créée,
// les routes /onboarding-public, /dashboard-public, /admin/services-publics,
// le composant <IconService>, etc. RESTENT INTACTS pour réactivation rapide.
//
// Variable Vercel : NEXT_PUBLIC_PLAN_PUBLIC_ENABLED ('true' pour réactiver).
// Défaut : OFF.
export const PLAN_PUBLIC_ENABLED = process.env.NEXT_PUBLIC_PLAN_PUBLIC_ENABLED === 'true'

export const PLANS = ['exister', 'communiquer', 'vendre', 'public']

// Aliases pour compat pendant la transition (LEGACY).
// canDo('on', X) → canDo('exister', X). À retirer post-migration.
const LEGACY_PLAN_ALIASES = {
  on:   'exister',
  full: 'vendre',
}

export function resolvePlan(plan) {
  if (!plan) return null
  return LEGACY_PLAN_ALIASES[plan] || plan
}

// ─── Matrice complète des features par plan ────────────────────────────────
//
// EXISTER (gratuit) :
//   • Présence + référencement + favoris + signaux + stats brutes
//   • Apparition GMY (Good Morning Yoppers)
//   • PEUT partager 1 actu via GMY (flag actu_gmy)
//   • PAS de page actus dédiée, PAS de deals, PAS de push ciblé, PAS de transactionnel
//
// COMMUNIQUER (19,90€) :
//   • Tout Exister
//   • Actus illimitées (page fiche + push ciblés favoris)
//   • Deals + mise en avant Bonnes affaires
//   • Newsletter / segmentation favoris
//   • Stats détaillées (engagement)
//   • IA bridée (reformulation, suggestions)
//   • Fidélité COMPTOIR (pointage GSM, décision Alex 31/07 : tueur Fidely-Box)
//   • PAS de transactionnel (le crédit fidélité AUTO reste Vendre)
//
// VENDRE (49,90€) :
//   • Tout Communiquer
//   • Transactionnel : commande C&C / RDV / réservation table / réservation produit
//   • Paiement en ligne (Stripe Connect)
//   • Fidélité configurable
//   • IA avancée (rédaction, segmentation, benchmarking)
//   • Export comptable
//
// PUBLIC (gratuit à vie) :
//   • Variant services & administrations
//   • Push zone (codes postaux) + alertes urgentes
//   • Pas de prix/deals/transactionnel

export const PLAN_FEATURES = {
  exister: {
    // Visibilité & présence
    vitrine:              true,
    prix_affiches:        true,
    photos:               true,
    galerie_illimitee:    true,
    horaires_detail:      true,
    description:          true,

    // Référencement & diffusion
    apparition_commander: true,
    seo_google:           true,
    sitemap:              true,
    schema_org:           true,
    recherche_categorie:  true,

    // Engagement client
    favoris:              true,
    signaux_yoppers:      true,   // visibilité des signaux reçus

    // Statistiques brutes (compteurs)
    stats_vues:           true,
    stats_favoris:        true,
    stats_signaux:        true,
    stats_historique:     true,

    // Communication minimale
    morning:              true,   // apparition GMY quotidien
    actu_gmy:             true,   // peut publier 1 actu visible dans le GMY

    // ❌ Réservé Communiquer / Vendre
    actus_illimitees:        false,  // pas de page actus dédiée + plusieurs actus simultanées
    deals:                   false,
    bonnes_affaires:         false,
    push_cibles_favoris:     false,
    newsletter_ciblee:       false,
    segmentation_favoris:    false,
    stats_detaillees:        false,
    ia_bridee:               false,
    morning_prioritaire:     false,

    // ❌ Réservé Vendre
    commande:                false,
    livraison:               false,
    rdv:                     false,
    multi_praticiens:        false,
    reservation_produit:     false,   // réservation/mise de côté détail
    reservation_table:       false,   // réservation table restaurant
    paiement_ligne:          false,
    paiement_cash:           false,
    fidelite:                false,
    fidelite_auto:           false,
    // Déclarée explicitement : une clé ABSENTE vaut false comme une clé fermée,
    // mais personne ne l'a décidé. Le banc scripts/verif-plans.mjs refuse
    // désormais toute clé qui manquerait à un palier.
    bons_cadeaux:            false,
    ia_avancee:              false,
    export_comptable:        false,
    hardware:                false,

    // ❌ Réservé Public
    notifications_push_zone: false,
    alertes_urgentes:        false,
  },

  communiquer: {
    // Tout Exister
    vitrine:              true,
    prix_affiches:        true,
    photos:               true,
    galerie_illimitee:    true,
    horaires_detail:      true,
    description:          true,
    apparition_commander: true,
    seo_google:           true,
    sitemap:              true,
    schema_org:           true,
    recherche_categorie:  true,
    favoris:              true,
    signaux_yoppers:      true,
    stats_vues:           true,
    stats_favoris:        true,
    stats_signaux:        true,
    stats_historique:     true,
    morning:              true,
    actu_gmy:             true,

    // ✅ Ajouts Communiquer
    actus_illimitees:        true,
    deals:                   true,
    bonnes_affaires:         true,    // mise en avant deal "bonne affaire"
    push_cibles_favoris:     true,    // push illimités aux Yoppers ayant favorisé
    newsletter_ciblee:       true,
    segmentation_favoris:    true,
    stats_detaillees:        true,    // engagement, ouvertures push, etc.
    ia_bridee:               true,    // reformulation, suggestions idées
    morning_prioritaire:     true,    // priorisation dans GMY

    // ✅ Fidélité COMPTOIR (pointage GSM au dashboard, cartes, SMS) — le crédit
    // AUTOMATIQUE sur transactions (fidelite_auto) reste réservé à Vendre
    fidelite:                true,

    // ❌ Réservé Vendre (pas de transactionnel)
    commande:                false,
    livraison:               false,
    rdv:                     false,
    multi_praticiens:        false,
    reservation_produit:     false,
    reservation_table:       false,
    paiement_ligne:          false,
    paiement_cash:           false,
    fidelite_auto:           false,
    bons_cadeaux:            false,
    ia_avancee:              false,
    export_comptable:        false,
    hardware:                false,

    // ❌ Réservé Public
    notifications_push_zone: false,
    alertes_urgentes:        false,
  },

  vendre: {
    // Tout Communiquer
    vitrine:              true,
    prix_affiches:        true,
    photos:               true,
    galerie_illimitee:    true,
    horaires_detail:      true,
    description:          true,
    apparition_commander: true,
    seo_google:           true,
    sitemap:              true,
    schema_org:           true,
    recherche_categorie:  true,
    favoris:              true,
    signaux_yoppers:      true,
    stats_vues:           true,
    stats_favoris:        true,
    stats_signaux:        true,
    stats_historique:     true,
    morning:              true,
    actu_gmy:             true,
    actus_illimitees:     true,
    deals:                true,
    bonnes_affaires:      true,
    push_cibles_favoris:  true,
    newsletter_ciblee:    true,
    segmentation_favoris: true,
    stats_detaillees:     true,
    ia_bridee:            true,
    morning_prioritaire:  true,

    // ✅ Ajouts Vendre (transactionnel + paiement + fidélité + IA avancée)
    commande:                true,    // catégorie alimentaire (gating via canDoAvecCategorie)
    livraison:               true,    // catégorie alimentaire
    rdv:                     true,    // catégorie vitrine
    multi_praticiens:        true,    // catégorie vitrine
    reservation_produit:     true,    // catégorie detail
    reservation_table:       true,    // catégorie alimentaire (restaurant)
    paiement_ligne:          true,
    paiement_cash:           true,
    fidelite:                true,
    fidelite_auto:           true,    // crédit auto sur transactions + récompense auto checkout
    bons_cadeaux:            true,    // bons cadeaux digitaux (toggle par commerçant, 3 segments)
    ia_avancee:              true,    // rédaction, segmentation, benchmarking
    export_comptable:        true,
    hardware:                true,    // kit pro optionnel

    // ❌ Réservé Public
    notifications_push_zone: false,
    alertes_urgentes:        false,
  },

  public: {
    // Tout Exister sauf prix/signaux (services & administrations)
    vitrine:              true,
    prix_affiches:        false,   // pas de prix pour entité publique
    photos:               true,
    galerie_illimitee:    true,
    horaires_detail:      true,
    description:          true,
    apparition_commander: true,
    seo_google:           true,
    sitemap:              true,
    schema_org:           true,
    recherche_categorie:  true,
    favoris:              true,
    signaux_yoppers:      false,  // pas de signaux pour entités publiques
    stats_vues:           true,
    stats_favoris:        true,
    stats_signaux:        false,
    stats_historique:     true,
    morning:              true,
    actu_gmy:             false,  // remplacé par actus_illimitees côté commune

    // ✅ Actus illimitées (commune publie infos/actus/alertes en autonomie)
    actus_illimitees:        true,

    // ✅ Spécifique Public
    notifications_push_zone: true,    // push à TOUS les Yoppers d'un code postal
    alertes_urgentes:        true,    // alertes prioritaires rouges (coupure eau, sécurité…)

    // ❌ Exclus pour PUBLIC
    deals:                   false,
    bonnes_affaires:         false,
    push_cibles_favoris:     false,
    newsletter_ciblee:       false,
    segmentation_favoris:    false,
    stats_detaillees:        false,
    ia_bridee:               false,
    morning_prioritaire:     false,
    commande:                false,
    livraison:               false,
    rdv:                     false,
    multi_praticiens:        false,
    reservation_produit:     false,
    reservation_table:       false,
    paiement_ligne:          false,
    paiement_cash:           false,
    fidelite:                false,
    fidelite_auto:           false,
    // Une commune ou un CPAS ne vend pas de bons cadeaux. Déclaré, pas déduit.
    bons_cadeaux:            false,
    ia_avancee:              false,
    export_comptable:        false,
    hardware:                false,
  },
}

export const PLAN_LABEL = {
  exister:     'Exister',
  communiquer: 'Communiquer',
  vendre:      'Vendre',
  public:      'Public',
}

// ─── Tarifs ─────────────────────────────────────────────────────────────────
// Prix PARAMÉTRABLES via env vars (jamais hardcodés).
// Fallback aux valeurs du brief 15/06 si env vars non définies.
//
// Pour modifier : aller dans Vercel → Settings → Environment Variables
//   NEXT_PUBLIC_TARIF_COMMUNIQUER=19.90
//   NEXT_PUBLIC_TARIF_VENDRE=49.90
// Puis redeploy. La modification prend effet en ~30 secondes.

const TARIF_DEFAUT_COMMUNIQUER = 19.90
const TARIF_DEFAUT_VENDRE      = 49.90

function lireTarif(envKey, fallback) {
  const raw = process.env[envKey]
  if (!raw) return fallback
  const parsed = parseFloat(raw)
  if (Number.isFinite(parsed) && parsed > 0) return parsed
  return fallback
}

export function getPrixPlan(plan) {
  const resolved = resolvePlan(plan)
  if (resolved === 'exister' || resolved === 'public') {
    return {
      mensuel: 0,
      label_mensuel: 'Gratuit à vie',
    }
  }
  if (resolved === 'communiquer') {
    const tarif = lireTarif('NEXT_PUBLIC_TARIF_COMMUNIQUER', TARIF_DEFAUT_COMMUNIQUER)
    return {
      mensuel: tarif,
      label_mensuel: `${tarif.toFixed(2).replace('.', ',')}€/mois sans engagement`,
    }
  }
  if (resolved === 'vendre') {
    const tarif = lireTarif('NEXT_PUBLIC_TARIF_VENDRE', TARIF_DEFAUT_VENDRE)
    return {
      mensuel: tarif,
      label_mensuel: `${tarif.toFixed(2).replace('.', ',')}€/mois sans engagement`,
    }
  }
  return null
}

// ─── IA texte (Ch3bis) ───────────────────────────────────────────────────────
// Générateur de textes marchand (posts réseaux, accroches deals/actus). TEXTE
// UNIQUEMENT (jamais d'image). Bridage par palier = modèle + quota mensuel :
//   • exister     : Haiku, 1/mois   (dégustation, levier d'upgrade)
//   • communiquer : Haiku, 60/mois (relevé 40 → 60 le 23/07, ajout assist articles)
//   • vendre      : Sonnet, 200/mois
//   • public      : désactivé
// Coût pire cas (quota plein) : ~0,004 € / ~0,15 € / ~3,3 € par marchand/mois.
export const IA_CONFIG = {
  exister:     { actif: true,  modele: 'haiku',  quota_mois: 1 },
  communiquer: { actif: true,  modele: 'haiku',  quota_mois: 60 },
  vendre:      { actif: true,  modele: 'sonnet', quota_mois: 200 },
  public:      { actif: false, modele: null,     quota_mois: 0 },
}

// Identifiants modèles Anthropic (source unique). Surchargeables par env pour ne
// jamais recoder si Anthropic sort un nouveau modèle (ex. IA_MODELE_SONNET=claude-sonnet-6).
// Défauts au 18/07/2026 : Haiku 4.5 (1$/5$) et Sonnet 5 (3$/15$, intro 2$/10$ jusqu'au 31/08).
export const IA_MODELES = {
  haiku:  process.env.IA_MODELE_HAIKU  || 'claude-haiku-4-5-20251001',
  sonnet: process.env.IA_MODELE_SONNET || 'claude-sonnet-5',
}

// Config IA du palier (résout les alias legacy on/full). Défaut prudent = exister.
export function getIaConfig(plan) {
  const resolved = resolvePlan(plan)
  return IA_CONFIG[resolved] || IA_CONFIG.exister
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Indique si un plan permet une feature donnée.
// Résout automatiquement les aliases legacy (on/full).
export function canDo(plan, feature) {
  const resolved = resolvePlan(plan)
  if (!resolved) return false
  return PLAN_FEATURES[resolved]?.[feature] === true
}

// Gating complet : plan + catégorie. Empêche par exemple canDo('vendre', 'rdv')
// de retourner true pour une boulangerie alimentaire.
const FEATURES_ALIMENTAIRE_ONLY = ['commande', 'livraison', 'reservation_table']
const FEATURES_VITRINE_ONLY     = ['rdv', 'multi_praticiens']
const FEATURES_DETAIL_ONLY      = ['reservation_produit']

export function canDoAvecCategorie(plan, feature, categorie) {
  if (!canDo(plan, feature)) return false
  if (FEATURES_ALIMENTAIRE_ONLY.includes(feature) && categorie !== 'alimentaire') return false
  if (FEATURES_VITRINE_ONLY.includes(feature)     && categorie !== 'vitrine')     return false
  if (FEATURES_DETAIL_ONLY.includes(feature)      && categorie !== 'detail')      return false
  return true
}

export function getPlanLabel(plan) {
  const resolved = resolvePlan(plan)
  return PLAN_LABEL[resolved] || PLAN_LABEL.exister
}

export function isService(commercant) {
  return commercant?.est_service === true || resolvePlan(commercant?.plan) === 'public'
}

export function isVitrine(commercant) {
  return commercant?.categorie === 'vitrine'
}

export function isAlimentaire(commercant) {
  return !commercant?.categorie || commercant?.categorie === 'alimentaire'
}

export function isDetail(commercant) {
  return commercant?.categorie === 'detail'
}

// ─── Labels user-facing des catégories ──────────────────────────────────────
// Identifiants techniques DB : alimentaire / vitrine / detail / publique.
// Labels affichés côté UI (validé Alex 01/07/2026) :
//   • vitrine → « Service »  (l'identifiant DB reste 'vitrine' pour compat)
//   • detail  → « Détail »   (avec accent en UI, DB reste 'detail')
// Utiliser LABEL_CATEGORIE partout où on affiche la catégorie à un humain.
export const LABEL_CATEGORIE = {
  alimentaire: 'Alimentaire',
  vitrine:     'Service',
  detail:      'Détail',
  publique:    'Officiel',
}

export function labelCategorie(cat) {
  return LABEL_CATEGORIE[cat] || cat || '—'
}

// ─── Bandeau catégorie ──────────────────────────────────────────────────────
// Dégradé de couleur affiché en signature visuelle des cards + fiches selon
// la catégorie du commerçant. Palette validée Alex 01/07/2026 :
//   • alimentaire → VIOLET canonique Yoppaa (Ink → Main → Light)
//   • vitrine     → VERT services / RDV (Forest → Emerald → Mint)
//   • detail      → ORANGE chaud boutique de quartier (Rust → Orange → Peach)
// Retourne une string CSS linear-gradient prête à consommer.
export function bandeauCategorie(commercant) {
  const cat = commercant?.categorie
  switch (cat) {
    case 'vitrine':
      return 'linear-gradient(90deg, #047857 0%, #10B981 60%, #6EE7B7 100%)'
    case 'detail':
      return 'linear-gradient(90deg, #C2410C 0%, #F97316 60%, #FDBA74 100%)'
    case 'alimentaire':
    default:
      return 'linear-gradient(90deg, #1A0840 0%, #6B35C4 60%, #C4A0F4 100%)'
  }
}

// Plans disponibles selon la catégorie au signup.
//   • publique → ['public'] (réservé entités officielles, validé par admin)
//     SI FLAG PLAN_PUBLIC_ENABLED=false (V1, défaut) → retourne [] (catégorie
//     invisible au signup, redirige vers les 3 catégories commerce).
//   • alimentaire / vitrine / detail → ['exister', 'communiquer', 'vendre']
export function plansDispoPourCategorie(categorie) {
  if (categorie === 'publique' || categorie === 'public') {
    return PLAN_PUBLIC_ENABLED ? ['public'] : []
  }
  if (['alimentaire', 'vitrine', 'detail'].includes(categorie)) {
    return ['exister', 'communiquer', 'vendre']
  }
  return ['exister']
}

// Plus petit plan qui débloque une feature (utile pour les CTA upgrade).
export function planRequisPour(feature) {
  for (const plan of PLANS) {
    if (PLAN_FEATURES[plan]?.[feature]) return plan
  }
  return null
}

// ─── Helper Pills statut ────────────────────────────────────────────────────
// UNE SEULE RÈGLE : les pastilles disent ce que le client PEUT FAIRE ici,
// jamais ce qui manque.
//
// Refonte du 03/08. L'ancienne version affichait cinq pastilles fixes dont les
// inactives en gris, avec pour intention assumée d'exercer une « pression
// sociale » sur le commerçant. Concrètement, elle exposait au public les
// fonctions qu'il ne payait pas : un habitant n'y lisait pas un abonnement,
// il y lisait que sa boulangerie valait moins que la voisine. C'est contraire
// au principe selon lequel personne n'est trop petit, et le levier commercial
// est désormais porté par le signal en bas de fiche et par le tableau de bord
// du commerçant, pas par sa vitrine.
//
// Conséquences : plus de pastille grise, plus de « EN LIGNE » toujours vraie,
// et un nombre variable de pastilles. Un commerce en formule Exister n'en a
// aucune, ce qui est honnête : sa fiche montre ses horaires, ses photos et son
// itinéraire, exactement ce qu'il a choisi.
//
// DEAL et ACTU dépendent de l'ÉTAT RÉEL, pas de la formule : annoncer un deal
// du jour alors qu'aucun n'est en cours serait mensonger.
export function getPillsStatut(commercant, { dealActif = false, actuActive = false } = {}) {
  // Le plan Public a été retiré de la V1 : aucune pastille à afficher.
  if (isService(commercant)) return []

  const plan = commercant?.plan || 'exister'
  const categorie = commercant?.categorie || 'alimentaire'
  const pills = []

  // 1) Ce qui se passe maintenant, avec son point qui pulse.
  if (canDo(plan, 'deals') && dealActif) {
    pills.push({ key: 'deal', label: 'Deal du jour', live: true })
  }
  if (canDo(plan, 'actus_illimitees') && actuActive) {
    pills.push({ key: 'actu', label: 'Actu', live: true })
  }

  // 2) Ce que le client peut faire, selon la catégorie du commerce.
  if (isVitrine(commercant)) {
    if (canDoAvecCategorie(plan, 'rdv', categorie) && commercant?.rdv_actif === true) {
      pills.push({ key: 'rdv', label: 'Rendez-vous' })
    }
    // Une vitrine en formule Vendre peut aussi vendre ses produits au salon.
    if (canDo(plan, 'commande')) pills.push({ key: 'commande', label: 'Commander' })
  } else if (isDetail(commercant)) {
    // La réservation de produit n'existe pas encore : ne rien promettre.
    if (canDo(plan, 'commande')) pills.push({ key: 'commande', label: 'Commander' })
  } else {
    if (canDoAvecCategorie(plan, 'commande', categorie)) {
      pills.push({ key: 'commande', label: 'Commander' })
    }
    if (canDoAvecCategorie(plan, 'livraison', categorie) && commercant?.livraison_actif === true) {
      pills.push({ key: 'livraison', label: 'Livraison' })
    }
  }

  // 3) Ce qui fidélise, pour les trois segments et sur le MÊME réglage.
  // L'ancienne version lisait rdv_fidelite_actif en vitrine, une colonne
  // héritée de l'ancienne fidélité des rendez-vous : un salon qui activait sa
  // carte gardait une pastille éteinte. Le détail, lui, n'interrogeait aucun
  // réglage et s'allumait même fidélité coupée. Et l'alimentaire n'avait pas
  // de pastille du tout. Le seul réglage qui fait foi est fidelite_actif.
  if (canDo(plan, 'fidelite') && commercant?.fidelite_actif === true) {
    pills.push({ key: 'fidelite', label: 'Fidélité' })
  }
  if (canDo(plan, 'bons_cadeaux') && commercant?.bons_cadeaux_actif === true) {
    pills.push({ key: 'bons', label: 'Bons cadeaux' })
  }

  return pills
}
