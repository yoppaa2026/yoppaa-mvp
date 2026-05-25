// Plans YOPPAA — source unique de vérité
// Toute logique conditionnelle "ce plan peut-il X ?" passe par canDo(plan, feature).
// Évite la dette de checker `plan === 'live'` partout dans le code.

export const PLANS = ['on', 'live', 'boost', 'max']

export const PLAN_FEATURES = {
  on: {
    prix:      false,
    photos:    false,
    deals:     false,
    actus:     false,
    commande:  false,
    livraison: false,
    fidelite:  false,
    hardware:  false,
    morning:   false,
  },
  live: {
    prix:      true,
    photos:    true,
    deals:     true,
    actus:     true,
    commande:  false,
    livraison: false,
    fidelite:  false,
    hardware:  false,
    morning:   true,
  },
  boost: {
    prix:      true,
    photos:    true,
    deals:     true,
    actus:     true,
    commande:  true,
    livraison: false,
    fidelite:  true,
    hardware:  true,
    morning:   true,
  },
  max: {
    prix:      true,
    photos:    true,
    deals:     true,
    actus:     true,
    commande:  true,
    livraison: true,
    fidelite:  true,
    hardware:  true,
    morning:   true,
  },
}

export const PLAN_LABEL = {
  on:    'ON',
  live:  'LIVE',
  boost: 'BOOST',
  max:   'MAX',
}

// Tarifs officiels (annuel mis en avant, mensuel sans engagement en secondaire)
export const PLAN_PRIX = {
  on:    { annuel: 0,    mensuel: 0,      label_annuel: 'Gratuit à vie',                  label_mensuel: '—' },
  live:  { annuel: 299,  mensuel: 29.90,  label_annuel: '24,91€/mois facturé 299€/an',    label_mensuel: '29,90€/mois sans engagement' },
  boost: { annuel: 799,  mensuel: 79.90,  label_annuel: '66,58€/mois facturé 799€/an',    label_mensuel: '79,90€/mois sans engagement' },
  max:   { annuel: 1290, mensuel: 129.90, label_annuel: '107,50€/mois facturé 1290€/an',  label_mensuel: '129,90€/mois sans engagement' },
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
  return [
    { key: 'enligne',   label: 'EN LIGNE',  actif: true },
    { key: 'deal',      label: 'DEAL',      actif: canDo(plan, 'deals'),    live: canDo(plan, 'deals')  && dealActif },
    { key: 'actu',      label: 'ACTU',      actif: canDo(plan, 'actus'),    live: canDo(plan, 'actus')  && actuActive },
    { key: 'commande',  label: 'COMMANDE',  actif: canDo(plan, 'commande') },
    { key: 'livraison', label: 'LIVRAISON', actif: canDo(plan, 'livraison') },
  ]
}
