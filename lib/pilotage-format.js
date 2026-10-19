// LA MISE EN FORME DU PILOTAGE, partagée par la page et l'email (19/10).
//
// ⚠️ UN FICHIER À PART, ET C'EST VOULU : la page de l'admin tourne dans le
// navigateur, l'email importe le module d'envoi. Mettre ces fonctions dans
// l'email aurait fait charger l'envoi d'emails au navigateur.

export function nombre(n, { argent = false } = {}) {
  const v = Number(n || 0)
  return argent
    ? `${v.toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : v.toLocaleString('fr-BE')
}

// « +3 », « −2 », « = » : l'écart avec la période de comparaison.
export function ecart(actuel, avant, { argent = false } = {}) {
  const d = Number(actuel || 0) - Number(avant || 0)
  if (Math.abs(d) < (argent ? 0.005 : 1)) return '='
  const signe = d > 0 ? '+' : '−'
  return `${signe}${nombre(Math.abs(d), { argent })}`
}

// « dimanche 19 octobre » pour un jour AAAA-MM-JJ, sans passer par un instant
// relu en heure de Greenwich (il glisserait d'une journée).
export function jourEnLettres(jour) {
  const [a, m, j] = String(jour || '').split('-').map(Number)
  if (!a || !m || !j) return ''
  const d = new Date(Date.UTC(a, m - 1, j, 12))
  return d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

// « il y a 3 h », « il y a 2 j », ou « jamais ».
export function depuis(iso, maintenant = new Date()) {
  if (!iso) return 'jamais'
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return 'jamais'
  const min = Math.max(0, Math.round((maintenant.getTime() - t) / 60000))
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 48) return `il y a ${h} h`
  return `il y a ${Math.round(h / 24)} j`
}
