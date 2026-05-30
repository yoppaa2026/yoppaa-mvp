// Plans YOPPAA — source unique de vérité
// Toute logique conditionnelle "ce plan peut-il X ?" passe par canDo(plan, feature).
// Évite la dette de checker `plan === 'live'` partout dans le code.

// PLANS array : ordre = alimentaire (on/live/boost/max) puis vitrine (pro/proplus).
// L'UI filtre par catégorie via plansDispoPourCategorie() — ne pas s'attendre à voir
// tous les plans à tous les commerçants.
export const PLANS = ['on', 'live', 'boost', 'max', 'pro', 'proplus']

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
  live: {
    prix:             true,
    photos:           true,
    deals:            true,
    actus:            true,
    commande:         false,
    livraison:        false,
    fidelite:         false,
    hardware:         false,
    morning:          true,
    rdv:              false,
    multi_praticiens: false,
  },
  boost: {
    prix:             true,
    photos:           true,
    deals:             true,
    actus:            true,
    commande:         true,
    livraison:        false,
    fidelite:         true,
    hardware:         true,
    morning:          true,
    rdv:              false,
    multi_praticiens: false,
  },
  max: {
    prix:             true,
    photos:           true,
    deals:             true,
    actus:            true,
    commande:         true,
    livraison:        true,
    fidelite:         true,
    hardware:         true,
    morning:          true,
    rdv:              false,
    multi_praticiens: false,
  },
  // ─── Plans VITRINE (coiffeur / esthe / barbier / etc.) ───
  pro: {
    prix:             true,
    photos:           true,
    deals:            true,
    actus:            true,
    commande:         false,   // pas de C&C pour vitrine
    livraison:        false,
    fidelite:         true,    // fidélité RDV automatique
    hardware:         false,
    morning:          true,
    rdv:              true,    // ✅ module RDV
    multi_praticiens: false,
  },
  proplus: {
    prix:             true,
    photos:           true,
    deals:             true,
    actus:            true,
    commande:         false,
    livraison:        false,
    fidelite:         true,
    hardware:         false,
    morning:          true,
    rdv:              true,
    multi_praticiens: true,    // ✅ planning multi-praticiens
  },
}

export const PLAN_LABEL = {
  on:      'ON',
  live:    'LIVE',
  boost:   'BOOST',
  max:     'MAX',
  pro:     'PRO',
  proplus: 'PRO+',
}

// Tarifs officiels (annuel mis en avant, mensuel sans engagement en secondaire)
// PRO/PRO+ : 2 mois offerts en annuel (mensuel × 10 ≈ prix annuel)
export const PLAN_PRIX = {
  on:      { annuel: 0,    mensuel: 0,      label_annuel: 'Gratuit à vie',                  label_mensuel: '—' },
  live:    { annuel: 299,  mensuel: 29.90,  label_annuel: '24,91€/mois facturé 299€/an',    label_mensuel: '29,90€/mois sans engagement' },
  boost:   { annuel: 799,  mensuel: 79.90,  label_annuel: '66,58€/mois facturé 799€/an',    label_mensuel: '79,90€/mois sans engagement' },
  max:     { annuel: 1290, mensuel: 129.90, label_annuel: '107,50€/mois facturé 1290€/an',  label_mensuel: '129,90€/mois sans engagement' },
  pro:     { annuel: 349,  mensuel: 34.90,  label_annuel: '29,08€/mois facturé 349€/an',    label_mensuel: '34,90€/mois sans engagement' },
  proplus: { annuel: 499,  mensuel: 49.90,  label_annuel: '41,58€/mois facturé 499€/an',    label_mensuel: '49,90€/mois sans engagement' },
}

// Indique si un plan permet une feature donnée
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

// Catégorie commerçant : 'alimentaire' (menu + C&C) ou 'vitrine' (présence + RDV externe)
export function isVitrine(commercant) {
  return commercant?.categorie === 'vitrine'
}

export function isAlimentaire(commercant) {
  return !commercant?.categorie || commercant?.categorie === 'alimentaire'
}

// Plans disponibles selon la catégorie :
//   • vitrine (coiffeur/esthe/barbier) → ON gratuit, PRO 34,90€/m (module RDV), PRO+ 49,90€/m (+ multi-praticiens)
//   • alimentaire (boulangerie/pizzeria/etc.) → ON gratuit, LIVE/BOOST/MAX (C&C et livraison)
// Note : LIVE n'est PLUS proposé en signup vitrine (0 commerçant concerné en DB au 2026-05-30).
export function plansDispoPourCategorie(categorie) {
  if (categorie === 'vitrine') return ['on', 'pro', 'proplus']
  return ['on', 'live', 'boost', 'max']
}

// Auto-détection du provider de réservation externe à partir d'une URL.
// Retourne { provider, label } pour afficher proprement le bouton CTA.
const PROVIDERS_RESERVATION = [
  { match: /optios\.(com|net|be|fr)/i,            provider: 'optios',    label: 'Réserver via Optios' },
  { match: /doctolib\.(fr|be|de|it)/i,            provider: 'doctolib',  label: 'Prendre RDV sur Doctolib' },
  { match: /planity\.com/i,                       provider: 'planity',   label: 'Réserver sur Planity' },
  { match: /treatwell\.(fr|be|nl)/i,              provider: 'treatwell', label: 'Réserver sur Treatwell' },
  { match: /booksy\.com/i,                        provider: 'booksy',    label: 'Réserver sur Booksy' },
  { match: /(thefork|lafourchette)\.(com|fr|be)/i,provider: 'thefork',   label: 'Réserver une table' },
  { match: /calendly\.com/i,                      provider: 'calendly',  label: 'Prendre rendez-vous' },
  { match: /resamania\.com/i,                     provider: 'resamania', label: 'Réserver via Resamania' },
  { match: /takeatable\.(com|be|fr)/i,            provider: 'takeatable',label: 'Réserver une table' },
  { match: /resengo\.com/i,                       provider: 'resengo',   label: 'Réserver via Resengo' },
]

export function detecterProviderReservation(url) {
  if (!url || typeof url !== 'string') return { provider: null, label: null }
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`)
    const host = u.hostname
    for (const p of PROVIDERS_RESERVATION) {
      if (p.match.test(host)) return { provider: p.provider, label: p.label }
    }
    return { provider: 'autre', label: 'Réserver en ligne' }
  } catch {
    return { provider: null, label: null }
  }
}

// Plus petit plan qui débloque une feature (utile pour les CTA upgrade)
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
