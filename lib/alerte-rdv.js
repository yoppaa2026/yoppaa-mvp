// L'alerte « nouveau rendez-vous » du tableau de bord.
//
// ⚠️ ELLE N'EXISTAIT PAS. Le commerçant alimentaire est prévenu à chaque
// commande, par un son et une notification. Le salon, lui, ne l'était de rien :
// le commentaire du code disait « pas de notif son ici, ajoutée dans RDV-10 »,
// et RDV-10 n'est jamais venu. Une cliente réservait, et la coiffeuse ne le
// découvrait qu'en pensant à regarder son agenda.

// ⚠️ ON COMPARE DES IDENTIFIANTS, PAS UN NOMBRE. La détection des commandes se
// contente de comparer la longueur de la liste, ce qui rate un cas simple :
// entre deux relevés, un rendez-vous est annulé et un autre pris. Le total n'a
// pas bougé, la coiffeuse n'est prévenue de rien, et la nouvelle cliente arrive
// sans que personne ne l'attende. Les rendez-vous se suppriment en douceur
// (`deleted_at`), donc le cas est réel.
export function nouveauxRdvs(connus, rdvs) {
  // Premier relevé : on prend note de l'existant sans rien annoncer, sinon le
  // commerçant recevrait une alerte par rendez-vous déjà en agenda à chaque
  // ouverture de son tableau de bord.
  if (!connus) return []
  return (rdvs || []).filter(r => r && r.id && !connus.has(r.id))
}

export function idsDes(rdvs) {
  return new Set((rdvs || []).map(r => r?.id).filter(Boolean))
}

// Ce que l'alerte raconte.
//
// « Un rendez-vous vient d'arriver » ne sert à rien : il faut savoir QUI vient,
// QUAND, et chez QUELLE praticienne, sinon il faut de toute façon ouvrir
// l'agenda. C'est le même soin que pour les commandes, où l'alerte donne le
// numéro.
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// @param aujourdhui  'YYYY-MM-DD' en date LOCALE (jamais toISOString : minuit
//                    heure belge, c'est 22h la veille en temps universel).
export function texteAlerteRdv(rdv, { aujourdhui, demain } = {}) {
  if (!rdv) return { titre: 'Nouveau rendez-vous', corps: '' }

  const prenom = rdv.client_prenom || String(rdv.client_nom || '').split(/\s+/)[0] || 'Un client'
  const heure = String(rdv.heure_debut || '').slice(0, 5)

  let quand = ''
  const date = String(rdv.date_rdv || '').slice(0, 10)
  if (date && date === aujourdhui) quand = "aujourd'hui"
  else if (date && date === demain) quand = 'demain'
  else if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Midi en temps universel comme point d'ancrage : jamais de bascule d'heure
    // d'été à cette heure-là, le jour rendu est donc toujours le bon.
    const d = new Date(`${date}T12:00:00Z`)
    if (!isNaN(d.getTime())) quand = `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`
  }

  const morceaux = [prenom]
  if (quand) morceaux.push(quand)
  if (heure) morceaux.push(`à ${heure}`)
  const avec = rdv.praticien?.prenom ? ` avec ${rdv.praticien.prenom}` : ''
  const quoi = rdv.prestation?.nom ? ` · ${rdv.prestation.nom}` : ''

  return {
    titre: 'Nouveau rendez-vous 🟣',
    corps: `${morceaux.join(' ')}${avec}${quoi}`,
  }
}
