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

function resolvePlan(plan) {
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
//   • PAS de transactionnel
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

    // ❌ Réservé Vendre (pas de transactionnel)
    commande:                false,
    livraison:               false,
    rdv:                     false,
    multi_praticiens:        false,
    reservation_produit:     false,
    reservation_table:       false,
    paiement_ligne:          false,
    paiement_cash:           false,
    fidelite:                false,
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
// Calcule l'état des 5 pills selon plan + catégorie + runtime.
// Pills par catégorie (toujours 5 pills pour layout stable) :
//   - service public : EN LIGNE, ACTU, DEAL(indispo), COMMANDE(indispo), LIVRAISON(indispo)
//   - alimentaire    : EN LIGNE, DEAL, ACTU, COMMANDE, LIVRAISON
//   - vitrine        : EN LIGNE, DEAL, ACTU, RDV, FIDÉLITÉ
//   - detail         : EN LIGNE, DEAL, ACTU, RÉSERVATION, FIDÉLITÉ
export function getPillsStatut(commercant, { dealActif = false, actuActive = false } = {}) {
  if (isService(commercant)) {
    return [
      { key: 'enligne',   label: 'EN LIGNE',  actif: true },
      { key: 'actu',      label: 'ACTU',      actif: true, live: actuActive },
      { key: 'deal',      label: 'DEAL',      actif: false, indisponible: true },
      { key: 'commande',  label: 'COMMANDE',  actif: false, indisponible: true },
      { key: 'livraison', label: 'LIVRAISON', actif: false, indisponible: true },
    ]
  }
  const plan = commercant?.plan || 'exister'
  const categorie = commercant?.categorie || 'alimentaire'
  const vitrine = isVitrine(commercant)
  const detail  = isDetail(commercant)

  if (vitrine) {
    return [
      { key: 'enligne',  label: 'EN LIGNE', actif: true },
      { key: 'deal',     label: 'DEAL',     actif: canDo(plan, 'deals'), live: canDo(plan, 'deals') && dealActif },
      { key: 'actu',     label: 'ACTU',     actif: canDo(plan, 'actus_illimitees'), live: canDo(plan, 'actus_illimitees') && actuActive },
      { key: 'rdv',      label: 'RDV',      actif: canDoAvecCategorie(plan, 'rdv', categorie) && commercant?.rdv_actif === true },
      { key: 'fidelite', label: 'FIDÉLITÉ', actif: canDo(plan, 'fidelite') && commercant?.rdv_fidelite_actif === true },
    ]
  }

  if (detail) {
    return [
      { key: 'enligne',     label: 'EN LIGNE',     actif: true },
      { key: 'deal',        label: 'DEAL',         actif: canDo(plan, 'deals'), live: canDo(plan, 'deals') && dealActif },
      { key: 'actu',        label: 'ACTU',         actif: canDo(plan, 'actus_illimitees'), live: canDo(plan, 'actus_illimitees') && actuActive },
      { key: 'reservation', label: 'RÉSERVATION',  actif: canDoAvecCategorie(plan, 'reservation_produit', categorie) },
      { key: 'fidelite',    label: 'FIDÉLITÉ',     actif: canDo(plan, 'fidelite') },
    ]
  }

  // Alimentaire
  // - COMMANDE : actif si plan le permet (Vendre alimentaire)
  // - LIVRAISON : actif uniquement si plan le permet ET toggle livraison_actif=true
  //   (le commercant Vendre alim peut choisir de ne pas activer la livraison)
  return [
    { key: 'enligne',   label: 'EN LIGNE',  actif: true },
    { key: 'deal',      label: 'DEAL',      actif: canDo(plan, 'deals'),                                    live: canDo(plan, 'deals') && dealActif },
    { key: 'actu',      label: 'ACTU',      actif: canDo(plan, 'actus_illimitees'),                         live: canDo(plan, 'actus_illimitees') && actuActive },
    { key: 'commande',  label: 'COMMANDE',  actif: canDoAvecCategorie(plan, 'commande',  categorie) },
    { key: 'livraison', label: 'LIVRAISON', actif: canDoAvecCategorie(plan, 'livraison', categorie) && commercant?.livraison_actif === true },
  ]
}
