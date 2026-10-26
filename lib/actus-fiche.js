// Les actualités qu'une fiche affiche aujourd'hui (26/10).
//
// 🔴 LA FICHE RDV N'EN MONTRAIT AUCUNE. Le Centre Respire publie son actu de
// novembre : elle part dans le Good Morning et chez ses favoris, le Yopper
// tape « Voir la fiche »… et la fiche ne la montre pas. Seule la fiche
// boutique (`/commander/[slug]`) lisait la table `actualites` ; la fiche des
// métiers à rendez-vous (`/commander/rdv/[slug]`) ne l'avait jamais fait.
//
// ⚠️ UNE SEULE RÈGLE DE FENÊTRE, sur le jour BELGE : sans date, l'actu vaut
// tant qu'elle est active ; avec un début, à partir de ce jour ; avec une fin,
// jusqu'à ce jour compris. C'est celle de la fiche boutique, mot pour mot.

export function actuActiveCeJour(actu, jour) {
  const debut = actu?.date_debut ? String(actu.date_debut).slice(0, 10) : null
  const fin = actu?.date_fin ? String(actu.date_fin).slice(0, 10) : null
  if (debut && jour < debut) return false
  if (fin && fin < jour) return false
  return true
}
