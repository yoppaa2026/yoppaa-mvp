// Compter une ouverture de fiche, une seule fois par session et par commerce.
//
// LE DÉDOUBLONNAGE VIT ICI, PAS EN BASE. La base n'enregistre qu'une case
// (commerce, jour) : elle ne peut pas savoir que deux appels viennent du même
// visiteur, et on ne veut surtout pas lui donner de quoi le savoir. C'est donc
// le navigateur qui se souvient, dans le sessionStorage, des fiches déjà
// comptées pendant cette visite.
//
// Un rechargement de page, un aller-retour vers un produit ou un passage par
// le tunnel ne doivent pas gonfler le compteur : sinon le commerçant lit un
// chiffre trois fois trop gros et cesse d'y croire.
//
// Deux fiches existent pour un même commerce (boutique et rendez-vous) : elles
// partagent la même clé, une visite reste une visite.

const CLE = 'yoppaa.vues.fiche'

function dejaVues() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CLE) || '[]'))
  } catch {
    return new Set()
  }
}

// Renvoie true si la vue doit être comptée (et la marque au passage).
// Exporté séparément de l'envoi pour être testable sans réseau.
export function marquerVue(commercantId, memoire) {
  if (!commercantId) return false
  const vues = memoire || dejaVues()
  const id = String(commercantId)
  if (vues.has(id)) return false
  vues.add(id)
  if (!memoire) {
    try { sessionStorage.setItem(CLE, JSON.stringify([...vues])) } catch { /* mode privé : on compte quand même */ }
  }
  return true
}

// Best-effort, jamais bloquant : un compteur qui tombe ne doit ni ralentir la
// fiche, ni faire apparaître la moindre erreur au client.
export function compterVueFiche(commercantId) {
  if (typeof window === 'undefined' || !commercantId) return
  if (!marquerVue(commercantId)) return
  fetch('/api/fiche/vue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commercant_id: commercantId }),
    keepalive: true,
  }).catch(() => {})
}
