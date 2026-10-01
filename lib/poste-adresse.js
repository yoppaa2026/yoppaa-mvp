// OÙ EN EST LE POSTE, GARDÉ DANS L'ADRESSE (01/10).
//
// 🔴 « QUAND JE FAIS UN REFRESH DU POSTE, JE DOIS CHOISIR À NOUVEAU LE
// COMMERÇANT, JE NE RESTE PAS SUR LA MÊME PAGE. TRÈS ÉNERVANT » (Alex, 01/10).
// Le commerce, l'onglet et le filtre ne vivaient que dans la mémoire de la
// page : un rafraîchissement les perdait, et un membre de deux équipes
// rechoisissait son commerce dix fois par service.
//
// Deux mémoires, chacune pour son cas :
//   • l'ADRESSE (`?commerce=…&onglet=…&filtre=…`) : un rafraîchissement
//     reprend exactement où on était ;
//   • l'APPAREIL (`localStorage`) retient le dernier commerce : la tablette du
//     comptoir rouvre le sien depuis son icône, qui n'a pas de paramètres.
//
// ⚠️ RIEN DE TOUT ÇA NE DONNE UN ACCÈS : le serveur revérifie à chaque
// lecture que le compte est membre de ce commerce. Un identifiant recopié dans
// l'adresse d'un autre ne lui ouvre rien.

export const CLE_DERNIER_COMMERCE = 'yoppaa_poste_commerce'
export const PARAMS_POSTE = ['commerce', 'onglet', 'filtre']

/** Ce que l'adresse dit du poste. */
export function lirePoste(search = '') {
  const p = new URLSearchParams(search || '')
  return { commerce: p.get('commerce'), onglet: p.get('onglet'), filtre: p.get('filtre') }
}

/** Le commerce à rouvrir : l'adresse d'abord, puis l'appareil, s'il fait partie des équipes. */
export function commerceARouvrir(equipes = [], { adresse = null, appareil = null } = {}) {
  if (!Array.isArray(equipes) || equipes.length === 0) return null
  if (equipes.length === 1) return equipes[0]
  return equipes.find(e => e.commercant_id === adresse)
    || equipes.find(e => e.commercant_id === appareil)
    || null
}

/** Réécrit l'adresse sans recharger ni empiler l'historique. `null` retire le paramètre. */
export function ecrirePoste(champs = {}) {
  try {
    const url = new URL(window.location.href)
    for (const [cle, valeur] of Object.entries(champs)) {
      if (!PARAMS_POSTE.includes(cle)) continue
      if (valeur) url.searchParams.set(cle, valeur)
      else url.searchParams.delete(cle)
    }
    window.history.replaceState(window.history.state, '', url)
  } catch { /* l'adresse reste telle quelle : le poste marche quand même */ }
}

export function lireDernierCommerce() {
  try { return window.localStorage.getItem(CLE_DERNIER_COMMERCE) } catch { return null }
}

export function retenirDernierCommerce(id) {
  try {
    if (id) window.localStorage.setItem(CLE_DERNIER_COMMERCE, id)
    else window.localStorage.removeItem(CLE_DERNIER_COMMERCE)
  } catch { /* confort d'appareil */ }
}
