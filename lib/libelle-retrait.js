// Comment on annonce un retrait à un Yopper, en une phrase, partout pareil.
//
// LE PROBLÈME QUE CE FICHIER RÈGLE. Chaque écran affichait « 4 août » et
// laissait le client deviner le reste : à quelle heure, à partir de quand,
// faut-il attendre un signal. Alex, le 05/08 : « toujours veiller à donner un
// message clair à l'utilisateur ».
//
// Deux philosophies de retrait coexistent dans Yoppaa, et elles ne se
// racontent pas de la même façon :
//
//   • le CRÉNEAU (alimentaire, click and collect) : le client a réservé une
//     tranche horaire précise, il vient à ce moment-là. « Retrait le 4 août
//     entre 11h15 et 11h30 » ;
//
//   • la BOUTIQUE (détail, produits d'un salon) : pas de créneau, le
//     commerçant prépare puis prévient. Annoncer une date sèche ferait venir
//     le client devant une commande pas prête. On dit donc où en est la
//     préparation, et on ne donne un jour qu'une fois la commande prête.

function formatJour(dateISO, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  if (!dateISO) return null
  try {
    return new Date(String(dateISO).slice(0, 10) + 'T12:00:00').toLocaleDateString('fr-BE', options)
  } catch {
    return null
  }
}

function formatHeure(h) {
  return h ? String(h).slice(0, 5) : null
}

// ⚠️ PIÈGE VÉRIFIÉ LE 05/08. En base, `mode_retrait` ne prend QUE trois
// valeurs : 'retrait', 'livraison', 'expedition'. Il n'existe pas de
// 'retrait_boutique' : le retrait boutique est stocké 'retrait', exactement
// comme le click and collect alimentaire, alors que ce sont deux mondes
// différents (l'un a un créneau, l'autre pas).
//
// Se fier à `mode_retrait === 'retrait_boutique'` produit donc du CODE MORT,
// ce qui a été mon cas au premier essai. On redérive le monde, comme le fait
// déjà lib/commande-notifs.js pour les emails : soit la catégorie du commerce
// le dit, soit l'absence de créneau le trahit.
export function estRetraitBoutique(commande, creneau = null) {
  if (commande?.mode_retrait !== 'retrait') return false
  const categorie = commande?.commercant?.categorie
  if (['detail', 'vitrine'].includes(categorie)) return true
  // Filet : une commande de retrait sans créneau ne peut pas être du C&C.
  return !creneau && !commande?.creneau_id
}

// Renvoie la phrase à afficher pour une commande.
//
// `commande`  : { date_commande, mode_retrait, statut }
// `creneau`   : { heure_debut, heure_fin } ou null
// `options`   : { court: true } pour la version compacte des listes
export function libelleRetrait(commande, creneau = null, { court = false } = {}) {
  if (!commande) return ''
  const mode = commande.mode_retrait
  const jourCourt = formatJour(commande.date_commande, { weekday: 'short', day: 'numeric', month: 'short' })
  const jourLong = formatJour(commande.date_commande)
  const jour = court ? jourCourt : jourLong

  // Commande née d'un tunnel unique : elle se retire LE JOUR DU RENDEZ-VOUS,
  // pas quand le commerçant fait signe. Sans ce cas, elle héritait du message
  // de la boutique (« on te prévient dès qu'elle t'attend ») et le client
  // attendait une notification qui ne viendrait jamais.
  if (commande.rdv_reservation_id) {
    return jour
      ? `À emporter le ${jour}, avec ton rendez-vous`
      : 'À emporter avec ton rendez-vous'
  }

  if (mode === 'expedition') {
    return commande.statut === 'pret' ? 'Expédiée, elle arrive' : 'Expédiée dès qu\'elle est préparée'
  }

  if (mode === 'livraison') {
    const debut = formatHeure(creneau?.heure_debut)
    const fin = formatHeure(creneau?.heure_fin)
    if (jour && debut && fin) return `Livraison le ${jour} entre ${debut} et ${fin}`
    return jour ? `Livraison le ${jour}` : 'Livraison à venir'
  }

  // Retrait en boutique : pas de créneau, le commerçant donne le signal.
  if (estRetraitBoutique(commande, creneau)) {
    if (commande.statut === 'pret') {
      return jour ? `À retirer, elle t'attend depuis le ${jour}` : 'Elle t\'attend en boutique'
    }
    return 'En préparation · on te prévient dès qu\'elle t\'attend'
  }

  // Retrait à créneau (alimentaire) : l'horaire est le cœur de l'information.
  const debut = formatHeure(creneau?.heure_debut)
  const fin = formatHeure(creneau?.heure_fin)
  if (jour && debut && fin) return `Retrait le ${jour} entre ${debut} et ${fin}`
  if (jour && debut) return `Retrait le ${jour} à partir de ${debut}`
  if (jour) return `Retrait le ${jour}`
  return 'Retrait à venir'
}
