// Un montant se lit « 12,50 € » en Belgique et en France, jamais « 12.50 € ».
//
// ⚠️ Le projet recopiait `.toFixed(2).replace('.', ',')` à la main une
// vingtaine de fois, et la bibliothèque d'emails l'avait oublié 37 fois sur
// 39 : TOUS les emails du produit annonçaient des montants au point, sur les
// rendez-vous, les commandes, les annulations et les récapitulatifs.
// Une seule fonction, pour que l'oubli ne soit plus possible.
//
// ⚠️ Se comporte EXACTEMENT comme l'ancien `Number(x).toFixed(2)` pour ne rien
// changer en silence : `null` vaut toujours 0. Seul `undefined` change, et
// dans le bon sens, « 0,00 € » au lieu de « NaN € ».

export function euros(valeur) {
  const n = Number(valeur)
  return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} €`
}

// Sans l'espace ni le symbole : pour les endroits qui collent leur propre
// unité (« 12,50€ / 25,00€ » d'une jauge, par exemple).
export function eurosNus(valeur) {
  const n = Number(valeur)
  return (Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')
}
