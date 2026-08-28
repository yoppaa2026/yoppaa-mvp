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

// ⚠️ L'ESPACE EST INSÉCABLE (U+00A0), ET CE N'EST PAS DE LA COQUETTERIE.
// Alex, 28/08 : dans un email reçu sur téléphone, « 72,00 € » se coupait en
// fin de ligne et le « € » tombait tout seul sur la ligne suivante, sous le
// montant. Trois fois dans le même ticket. Un nombre séparé de son unité se
// relit mal, et sur un justificatif d'achat ça inquiète.
//
// ⚠️ VÉRIFIÉ AVANT DE LE FAIRE : aucun SMS n'appelle `euros()`. Un caractère
// hors GSM-7 dans un SMS le ferait basculer en UCS-2, donc 70 caractères au
// lieu de 160, donc le double de crédits sur des SMS que le commerçant paie.
// C'est le genre de coût qu'on n'ajoute pas sans regarder.
export function euros(valeur) {
  const n = Number(valeur)
  return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} €`
}

// Sans l'espace ni le symbole : pour les endroits qui collent leur propre
// unité (« 12,50€ / 25,00€ » d'une jauge, par exemple).
export function eurosNus(valeur) {
  const n = Number(valeur)
  return (Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')
}
