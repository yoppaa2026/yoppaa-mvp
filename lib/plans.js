// Plans YOPPAA — source unique de vérité
// Toute logique conditionnelle "ce plan peut-il X ?" passe par canDo(plan, feature).
// Pour les features catégorie-spécifiques (commande, livraison, rdv, multi_praticiens),
// utiliser canDoAvecCategorie(plan, feature, categorie) pour le gating complet.
//
// Refactor 2026-06-02 : passage 7 plans → 3 plans (on / full / public).
// Source : matrice détaillée des plans Yoppaa fournie par Alex le 2026-06-02.

export const PLANS = ['on', 'full', 'public']

// ─── Matrice complète des features par plan ────────────────────────────────
// ON  : présence + communication (deals, actus, morning) + favoris + signaux + stats basiques
// FULL: tout ON + transactionnel + paiement + fidélité + stats détaillées + hardware
// PUBLIC: variant services & administrations (push zone + alertes urgentes, pas de prix/deals)
export const PLAN_FEATURES = {
  on: {
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

    // Communication
    deals:                true,
    actus:                true,
    morning:              true,

    // Engagement client
    favoris:              true,
    signaux_yoppers:      true,

    // Statistiques (basiques)
    stats_vues:           true,
    stats_favoris:        true,
    stats_signaux:        true,
    stats_historique:     true,

    // ❌ Exclus du plan ON (réservés à FULL)
    commande:                  false,
    livraison:                 false,
    rdv:                       false,
    multi_praticiens:          false,
    paiement_ligne:            false,
    paiement_cash:             false,
    push_favoris_immediat:     false,
    morning_prioritaire:       false,
    stats_detaillees:          false,
    fidelite:                  false,
    export_comptable:          false,
    newsletter_ciblee:         false,
    hardware:                  false,

    // ❌ Exclus du plan ON (PUBLIC only)
    notifications_push_zone:   false,
    alertes_urgentes:          false,
  },

  full: {
    // Tout ce qu'il y a dans ON
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
    deals:                true,
    actus:                true,
    morning:              true,
    favoris:              true,
    signaux_yoppers:      true,
    stats_vues:           true,
    stats_favoris:        true,
    stats_signaux:        true,
    stats_historique:     true,

    // Fonctions ajoutées par FULL
    paiement_ligne:            true,
    paiement_cash:             true,
    push_favoris_immediat:     true,
    morning_prioritaire:       true,
    stats_detaillees:          true,
    fidelite:                  true,
    export_comptable:          true,
    newsletter_ciblee:         true,    // Phase 2 mais déclaré true dès maintenant
    hardware:                  true,    // kit pro 399€ optionnel

    // Fonctions conditionnelles selon catégorie (gating via canDoAvecCategorie)
    commande:                  true,    // alimentaire uniquement
    livraison:                 true,    // alimentaire uniquement
    rdv:                       true,    // vitrine uniquement
    multi_praticiens:          true,    // vitrine uniquement

    // ❌ Exclus du plan FULL (PUBLIC only)
    notifications_push_zone:   false,
    alertes_urgentes:          false,
  },

  public: {
    // Tout ce qu'il y a dans ON (sauf prix_affiches, deals, signaux_yoppers)
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
    deals:                false,   // pas de deals commerciaux
    actus:                true,
    morning:              true,
    favoris:              true,
    signaux_yoppers:      false,   // pas de signaux pour entités publiques
    stats_vues:           true,
    stats_favoris:        true,
    stats_signaux:        false,
    stats_historique:     true,

    // Fonctions spécifiques PUBLIC
    notifications_push_zone:   true,    // push à TOUS les Yoppers de la zone administrative
    alertes_urgentes:          true,    // alertes prioritaires rouges

    // ❌ Exclus du plan PUBLIC
    commande:                  false,
    livraison:                 false,
    rdv:                       false,
    multi_praticiens:          false,
    paiement_ligne:            false,
    paiement_cash:             false,
    push_favoris_immediat:     false,
    morning_prioritaire:       false,
    stats_detaillees:          false,
    fidelite:                  false,
    export_comptable:          false,
    newsletter_ciblee:         false,
    hardware:                  false,
  },
}

export const PLAN_LABEL = {
  on:     'ON',
  full:   'FULL',
  public: 'PUBLIC',
}

// ─── Tarifs ─────────────────────────────────────────────────────────────────
// FULL prix dépend de la catégorie : alimentaire 59,90€/mois OU vitrine 39,90€/mois.
// ON et PUBLIC sont toujours gratuits.
export function getPrixPlan(plan, categorie) {
  if (plan === 'on' || plan === 'public') {
    return {
      mensuel: 0,
      annuel: 0,
      label_mensuel: '—',
      label_annuel: 'Gratuit à vie',
    }
  }
  if (plan === 'full') {
    if (categorie === 'alimentaire') {
      return {
        mensuel: 59.90,
        annuel: 599.00,
        label_mensuel: '59,90€/mois sans engagement',
        label_annuel: '49,92€/mois facturé 599€/an (2 mois offerts)',
      }
    }
    if (categorie === 'vitrine') {
      return {
        mensuel: 39.90,
        annuel: 399.00,
        label_mensuel: '39,90€/mois sans engagement',
        label_annuel: '33,25€/mois facturé 399€/an (2 mois offerts)',
      }
    }
  }
  return null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Indique si un plan permet une feature donnée.
// IMPORTANT : pour les features catégorie-spécifiques (commande, livraison, rdv,
// multi_praticiens), utiliser canDoAvecCategorie(plan, feature, categorie) plutôt
// pour le gating complet.
export function canDo(plan, feature) {
  if (!plan) return false
  return PLAN_FEATURES[plan]?.[feature] === true
}

// Gating complet : plan + catégorie. Empêche par exemple canDo('full', 'rdv') de
// retourner true pour une boulangerie alimentaire (rdv n'a aucun sens en alim).
const FEATURES_ALIMENTAIRE_ONLY = ['commande', 'livraison']
const FEATURES_VITRINE_ONLY     = ['rdv', 'multi_praticiens']

export function canDoAvecCategorie(plan, feature, categorie) {
  if (!canDo(plan, feature)) return false
  if (FEATURES_ALIMENTAIRE_ONLY.includes(feature) && categorie !== 'alimentaire') return false
  if (FEATURES_VITRINE_ONLY.includes(feature)     && categorie !== 'vitrine')     return false
  return true
}

export function getPlanLabel(plan) {
  return PLAN_LABEL[plan] || 'ON'
}

export function isService(commercant) {
  return commercant?.est_service === true || commercant?.plan === 'public'
}

export function isVitrine(commercant) {
  return commercant?.categorie === 'vitrine'
}

export function isAlimentaire(commercant) {
  return !commercant?.categorie || commercant?.categorie === 'alimentaire'
}

// Plans disponibles selon la catégorie au signup.
//   • publique → ['public'] (réservé entités officielles, validé par admin)
//   • alimentaire / vitrine → ['on', 'full']
export function plansDispoPourCategorie(categorie) {
  if (categorie === 'publique' || categorie === 'public') return ['public']
  if (categorie === 'vitrine' || categorie === 'alimentaire') return ['on', 'full']
  return ['on']
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
  const plan = commercant?.plan || 'on'
  const categorie = commercant?.categorie || 'alimentaire'
  const vitrine = isVitrine(commercant)

  if (vitrine) {
    return [
      { key: 'enligne',  label: 'EN LIGNE', actif: true },
      { key: 'deal',     label: 'DEAL',     actif: canDo(plan, 'deals'), live: canDo(plan, 'deals') && dealActif },
      { key: 'actu',     label: 'ACTU',     actif: canDo(plan, 'actus'), live: canDo(plan, 'actus') && actuActive },
      { key: 'rdv',      label: 'RDV',      actif: canDoAvecCategorie(plan, 'rdv', categorie) && commercant?.rdv_actif === true },
      { key: 'fidelite', label: 'FIDÉLITÉ', actif: canDo(plan, 'fidelite') && commercant?.rdv_fidelite_actif === true },
    ]
  }

  // Alimentaire
  // - COMMANDE : actif si plan le permet (auto pour FULL alim)
  // - LIVRAISON : actif uniquement si plan le permet ET toggle livraison_actif=true
  //   (le commercant FULL alim peut choisir de ne pas activer la livraison)
  return [
    { key: 'enligne',   label: 'EN LIGNE',  actif: true },
    { key: 'deal',      label: 'DEAL',      actif: canDo(plan, 'deals'),                                    live: canDo(plan, 'deals') && dealActif },
    { key: 'actu',      label: 'ACTU',      actif: canDo(plan, 'actus'),                                    live: canDo(plan, 'actus') && actuActive },
    { key: 'commande',  label: 'COMMANDE',  actif: canDoAvecCategorie(plan, 'commande',  categorie) },
    { key: 'livraison', label: 'LIVRAISON', actif: canDoAvecCategorie(plan, 'livraison', categorie) && commercant?.livraison_actif === true },
  ]
}
