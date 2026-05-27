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

// Catégorie commerçant : 'alimentaire' (menu + C&C) ou 'vitrine' (présence + RDV externe)
export function isVitrine(commercant) {
  return commercant?.categorie === 'vitrine'
}

export function isAlimentaire(commercant) {
  return !commercant?.categorie || commercant?.categorie === 'alimentaire'
}

// Plans disponibles selon la catégorie : vitrine n'accède pas à BOOST/MAX
// (Click & Collect et livraison n'ont pas de sens pour un coiffeur/opticien).
export function plansDispoPourCategorie(categorie) {
  if (categorie === 'vitrine') return ['on', 'live']
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
  return [
    { key: 'enligne',   label: 'EN LIGNE',  actif: true },
    { key: 'deal',      label: 'DEAL',      actif: canDo(plan, 'deals'),    live: canDo(plan, 'deals')  && dealActif },
    { key: 'actu',      label: 'ACTU',      actif: canDo(plan, 'actus'),    live: canDo(plan, 'actus')  && actuActive },
    // Vitrine : COMMANDE et LIVRAISON sont structurellement indisponibles (pas pertinent pour coiffeur/opticien)
    { key: 'commande',  label: 'COMMANDE',  actif: !vitrine && canDo(plan, 'commande'),  indisponible: vitrine },
    { key: 'livraison', label: 'LIVRAISON', actif: !vitrine && canDo(plan, 'livraison'), indisponible: vitrine },
  ]
}
