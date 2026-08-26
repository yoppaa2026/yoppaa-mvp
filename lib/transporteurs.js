// QUI PORTE LE COLIS, ET OÙ ON LE SUIT.
//
// 🔴 « IL FAUT POUVOIR AJOUTER LE NOM DU TRANSPORTEUR AVEC LE NUMÉRO
// D'EXPÉDITION. LE NOM DOIT AUSSI S'AFFICHER CÔTÉ YOPPER » (Alex, 26/08).
//
// ⚠️ UN NUMÉRO DE SUIVI SEUL NE SE SUIT NULLE PART. C'est le défaut que ce
// module ferme : la boutique enregistrait « 0072638628362826 » et l'affichait
// tel quel des deux côtés. Ce n'est pas une information, c'est une chaîne de
// caractères. Sans le transporteur, le client ne sait pas sur quel site aller
// le coller, et le commerçant ne sait plus, deux jours après, chez qui il a
// déposé le paquet.
//
// ⚠️ ET LE LIEN VAUT MIEUX QUE LE NOM. Une fois le transporteur connu, l'URL de
// suivi se fabrique : le Yopper clique au lieu de recopier seize chiffres sur
// un téléphone.
//
// ⚠️ CES ADRESSES CHANGENT SANS PRÉVENIR, et c'est une dette assumée. Quand
// l'une d'elles bougera, le lien tombera sur une page de recherche du
// transporteur, pas dans le vide : c'est pour ça que `suiviUrl` rend `null`
// plutôt qu'une URL fabriquée au hasard quand le modèle manque, et que
// l'affichage doit toujours montrer le NUMÉRO à côté du lien.

// ⚠️ L'ORDRE EST CELUI DE LA BELGIQUE, pas l'alphabet : bpost d'abord, parce
// que c'est ce qu'un commerçant belge utilise en premier, et « Autre » en
// dernier parce que c'est le repli.
export const TRANSPORTEURS = [
  { cle: 'bpost',         nom: 'bpost',         url: n => `https://track.bpost.cloud/btr/web/#/search?itemCode=${n}&postalCode=` },
  { cle: 'dpd',           nom: 'DPD',           url: n => `https://www.dpd.com/be/fr/suivi/?parcelNumber=${n}` },
  { cle: 'gls',           nom: 'GLS',           url: n => `https://gls-group.com/BE/fr/suivi-colis?match=${n}` },
  { cle: 'postnl',        nom: 'PostNL',        url: n => `https://jouw.postnl.be/track-and-trace/${n}` },
  { cle: 'dhl',           nom: 'DHL',           url: n => `https://www.dhl.com/be-fr/home/tracking.html?tracking-id=${n}` },
  { cle: 'ups',           nom: 'UPS',           url: n => `https://www.ups.com/track?loc=fr_BE&tracknum=${n}` },
  { cle: 'mondialrelay',  nom: 'Mondial Relay', url: n => `https://www.mondialrelay.be/suivi-de-colis/?numeroExpedition=${n}` },
  // ⚠️ « AUTRE » N'EST PAS UN OUBLI, C'EST UNE PORTE. Un commerçant qui livre
  // avec son cousin en camionnette doit pouvoir le dire ; sans cette entrée il
  // choisirait bpost par dépit, et le client cliquerait sur un lien mort.
  { cle: 'autre',         nom: 'Autre transporteur', url: null },
]

const PAR_CLE = Object.fromEntries(TRANSPORTEURS.map(t => [t.cle, t]))

// Le nom lisible, ou `null` s'il n'y a rien à dire. ⚠️ JAMAIS de repli sur
// « Transporteur inconnu » : une commande déposée avant que cette colonne
// existe n'a pas de transporteur, ce n'est pas la même chose qu'un transporteur
// qu'on n'aurait pas su lire.
export function nomTransporteur(cle) {
  return PAR_CLE[String(cle || '')]?.nom || null
}

// L'adresse de suivi, ou `null`. Elle demande les DEUX : un transporteur connu
// ET un numéro. L'un sans l'autre ne mène nulle part.
export function suiviUrl(cle, numero) {
  const t = PAR_CLE[String(cle || '')]
  const n = String(numero || '').trim()
  if (!t || typeof t.url !== 'function' || !n) return null
  return t.url(encodeURIComponent(n))
}

// Ce qu'on écrit sur une ligne, quand la place est comptée : « bpost ·
// 0072638628362826 », « bpost » seul, ou le numéro seul. `null` si les deux
// manquent, pour que l'appelant n'affiche rien du tout.
export function libelleExpedition(cle, numero) {
  const nom = nomTransporteur(cle)
  const n = String(numero || '').trim()
  if (nom && n) return `${nom} · ${n}`
  return nom || n || null
}
