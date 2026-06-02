// Plans YOPPAA — source unique de vérité
// Toute logique conditionnelle "ce plan peut-il X ?" passe par canDo(plan, feature).
// Évite la dette de checker `plan === 'full'` partout dans le code.
//
// Refactor 2026-06-02 : passage de 7 plans (on/live/boost/max/pro/proplus) à 3 plans :
//   • on       — gratuit à vie, présence basique (alimentaire + vitrine)
//   • full     — payant unique, toutes features (alimentaire 59,90€/mois OU vitrine 39,90€/mois selon catégorie)
//   • public   — gratuit à vie, services & administrations (actus + alertes uniquement)
// La catégorie (commercants.categorie = 'alimentaire' | 'vitrine') distingue les prix et les features pertinentes.

export const PLANS = ['on', 'full', 'public']

// Matrice plan × feature. 'full' débloque tout ; les features non-pertinentes pour
// une catégorie (ex: rdv pour alimentaire) sont filtrées en amont via isVitrine/isAlimentaire.
export const PLAN_FEATURES = {
  on: {
    prix:             false,
    photos:           false,
    deals:            false,
    actus:            false,
    commande:         false,
    livraison:        false,
    fidelite:         false,
    hardware:         false,
    morning:          false,
    rdv:              false,
    multi_praticiens: false,
  },
  full: {
    prix:             true,
    photos:           true,
    deals:            true,
    actus:            true,
    commande:         true,    // alimentaire only (filtré par categorie en amont)
    livraison:        true,    // alimentaire only
    fidelite:         true,
    hardware:         true,    // alimentaire only
    morning:          true,
    rdv:              true,    // vitrine only (filtré par categorie en amont)
    multi_praticiens: true,    // vitrine only
  },
  // Services & administrations : actus + alertes uniquement, gratuit à vie.
  public: {
    prix:             false,
    photos:           true,
    deals:            false,
    actus:            true,
    commande:         false,
    livraison:        false,
    fidelite:         false,
    hardware:         false,
    morning:          true,
    rdv:              false,
    multi_praticiens: false,
  },
}

export const PLAN_LABEL = {
  on:     'ON',
  full:   'FULL',
  public: 'PUBLIC',
}

// Tarifs officiels (annuel mis en avant, mensuel sans engagement en secondaire).
// Le prix dépend de la catégorie : FULL alimentaire = 59,90€/mois, FULL vitrine = 39,90€/mois.
// La catégorie est obligatoire pour résoudre le prix de FULL — d'où le helper getPrixPlan.
export function getPrixPlan(plan, categorie) {
  if (plan === 'on' || plan === 'public') {
    return { annuel: 0, mensuel: 0, label_annuel: 'Gratuit à vie', label_mensuel: '—' }
  }
  if (plan === 'full') {
    if (categorie === 'vitrine') {
      return {
        annuel: 399,
        mensuel: 39.90,
        label_annuel: '33,25€/mois facturé 399€/an',
        label_mensuel: '39,90€/mois sans engagement',
      }
    }
    // alimentaire (ou défaut)
    return {
      annuel: 599,
      mensuel: 59.90,
      label_annuel: '49,92€/mois facturé 599€/an',
      label_mensuel: '59,90€/mois sans engagement',
    }
  }
  return null
}

// Indique si un plan permet une feature donnée.
// IMPORTANT : pour les features catégorie-spécifiques (commande, rdv, livraison, multi_praticiens),
// le code appelant doit avoir filtré par categorie en amont (sinon canDo('full', 'rdv') retourne
// true même pour une boulangerie).
export function canDo(plan, feature) {
  if (!plan) return false
  return PLAN_FEATURES[plan]?.[feature] ?? false
}

export function getPlanLabel(plan) {
  return PLAN_LABEL[plan] || 'ON'
}

export function isService(commercant) {
  return commercant?.est_service === true
}

// Catégorie commerçant : 'alimentaire' (menu + C&C) ou 'vitrine' (présence + RDV)
export function isVitrine(commercant) {
  return commercant?.categorie === 'vitrine'
}

export function isAlimentaire(commercant) {
  return !commercant?.categorie || commercant?.categorie === 'alimentaire'
}

// Plans disponibles selon la catégorie. Aujourd'hui, identique pour les 2 catégories :
//   ON gratuit OU FULL payant (prix différent selon catégorie).
export function plansDispoPourCategorie(/* categorie */) {
  return ['on', 'full']
}

// Plus petit plan qui débloque une feature (utile pour les CTA upgrade).
export function planRequisPour(feature) {
  for (const plan of PLANS) {
    if (PLAN_FEATURES[plan][feature]) return plan
  }
  return null
}

// Helper Pills statut — calcule l'état des 5 pills selon plan + runtime
// - actif : le plan PERMET cette feature (vert si oui, gris si non)
// - live  : un événement en cours maintenant (dot orange anime sur la pill)
//   → DEAL.live = true s'il y a un deal actif aujourd'hui
//   → ACTU.live = true s'il y a une actu/alerte active aujourd'hui
//
// Pills par catégorie (toujours 5 pills pour layout stable) :
//   - service public : EN LIGNE, ACTU, DEAL(indispo), COMMANDE(indispo), LIVRAISON(indispo)
//   - alimentaire    : EN LIGNE, DEAL, ACTU, COMMANDE, LIVRAISON
//   - vitrine        : EN LIGNE, DEAL, ACTU, RDV, FIDÉLITÉ
//     (COMMANDE et LIVRAISON n'ont pas de sens — remplacées par les features vitrine)
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
  const vitrine = isVitrine(commercant)

  if (vitrine) {
    // Vitrine : pills RDV-orientées (pas de COMMANDE/LIVRAISON qui ne s'appliquent pas)
    return [
      { key: 'enligne',  label: 'EN LIGNE', actif: true },
      { key: 'deal',     label: 'DEAL',     actif: canDo(plan, 'deals'), live: canDo(plan, 'deals') && dealActif },
      { key: 'actu',     label: 'ACTU',     actif: canDo(plan, 'actus'), live: canDo(plan, 'actus') && actuActive },
      { key: 'rdv',      label: 'RDV',      actif: canDo(plan, 'rdv') && commercant?.rdv_actif === true },
      { key: 'fidelite', label: 'FIDÉLITÉ', actif: canDo(plan, 'fidelite') && commercant?.rdv_fidelite_actif === true },
    ]
  }

  // Alimentaire (défaut)
  return [
    { key: 'enligne',   label: 'EN LIGNE',  actif: true },
    { key: 'deal',      label: 'DEAL',      actif: canDo(plan, 'deals'),     live: canDo(plan, 'deals')  && dealActif },
    { key: 'actu',      label: 'ACTU',      actif: canDo(plan, 'actus'),     live: canDo(plan, 'actus')  && actuActive },
    { key: 'commande',  label: 'COMMANDE',  actif: canDo(plan, 'commande') },
    { key: 'livraison', label: 'LIVRAISON', actif: canDo(plan, 'livraison') },
  ]
}
