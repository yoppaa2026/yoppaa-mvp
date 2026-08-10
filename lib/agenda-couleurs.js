// La couleur d'un rendez-vous dans l'agenda du commerçant.
//
// ⚠️ LE PROBLÈME. Tous les rendez-vous confirmés étaient du même violet, quel
// que soit le praticien. La couleur choisie pour Carole ne vivait que dans une
// pastille de douze pixels au coin du bloc. Dans un salon à trois praticiennes,
// il fallait donc lire les initiales une par une pour savoir qui faisait quoi.
// La couleur existait, elle ne servait à rien.
//
// La règle : **la couleur du praticien EST celle du bloc.** Carole en rose, son
// agenda est rose, et le salon se lit d'un coup d'œil.
//
// ⚠️ MAIS LE STATUT DOIT RESTER LISIBLE. Un rendez-vous annulé ou un client qui
// n'est pas venu ne doivent pas se confondre avec la journée à faire. Ces deux
// états gardent donc leur traitement propre : l'identité du praticien passe
// après, elle n'a plus d'utilité une fois le rendez-vous sorti du planning.

// Le violet de la marque, quand aucun praticien n'est assigné.
export const COULEUR_DEFAUT = '#6B35C4'

// L'encre sombre de Yoppaa, pour écrire sur une couleur claire.
export const ENCRE = '#1A0840'

// ⚠️ LA COULEUR DU PRATICIEN EST LIBRE : le réglage est un sélecteur de couleur
// sans contrainte. Une praticienne peut très bien choisir un rose pâle, et du
// texte blanc dessus devient illisible. On calcule donc la luminance perçue et
// on écrit en clair ou en sombre selon le fond. Sans ça, la fonctionnalité
// demandée pour gagner en lisibilité l'aurait fait perdre.
export function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  // Coefficients de luminance perçue : l'œil est bien plus sensible au vert
  // qu'au bleu. Un bleu marine et un vert vif de même valeur numérique n'ont
  // pas du tout la même clarté à l'écran.
  const r = (n >> 16) & 255, v = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * v + 0.114 * b) / 255
}

export function texteLisibleSur(hex) {
  const l = luminance(hex)
  // Couleur illisible ou absente : on retombe sur du blanc, qui va avec le
  // violet de secours.
  if (l === null) return '#fff'
  return l > 0.6 ? ENCRE : '#fff'
}

// Les deux états qui sortent du planning gardent leur code couleur.
const STATUTS_SORTIS = {
  no_show: { bg: '#E5E7EB', text: '#6B7280', border: '#9CA3AF' },
  annule:  { bg: '#FEE2E2', text: '#991B1B', border: '#DC2626' },
}

// @param statut            'confirme' | 'honore' | 'no_show' | 'annule'
// @param couleurPraticien  couleur_hex du praticien, ou rien
export function couleurRdv({ statut, couleurPraticien } = {}) {
  if (STATUTS_SORTIS[statut]) return { ...STATUTS_SORTIS[statut], estPraticien: false }

  const bg = luminance(couleurPraticien) === null ? COULEUR_DEFAUT : couleurPraticien
  return {
    bg,
    text: texteLisibleSur(bg),
    border: bg,
    estPraticien: true,
  }
}
