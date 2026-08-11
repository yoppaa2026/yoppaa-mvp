// Les rappels d'une commande qui attend, et le vieillissement qu'un commerçant
// doit voir.
//
// ⚠️ UNE COMMANDE PRÊTE POUVAIT DORMIR INDÉFINIMENT. Le commerçant clique
// « Marquer prête », le client reçoit UN message, et plus rien ne se passait
// jamais. Ni relance, ni signal côté commerçant : la commande restait « Prête »
// pour toujours, son stock retiré des rayons, et personne ne s'en apercevait.
//
// Décision d'Alex (11/08) :
//   • rappels au client à 24 h, 48 h et 72 h en DÉTAIL et en SERVICES ;
//   • un seul rappel à 24 h en ALIMENTAIRE — un pain n'attend pas trois jours ;
//   • ⚠️ AUCUNE ANNULATION AUTOMATIQUE. Le commerçant décide, et lui seul. Le
//     rôle du code est de le lui rappeler, pas de trancher à sa place.
//
// Module PUR : l'instant est toujours injecté, jamais lu de l'horloge. C'est ce
// qui permet au banc de vérifier un rappel « à 48 heures » sans attendre deux
// jours.

const HEURE = 3600 * 1000

// ⚠️ AU-DELÀ D'UNE SEMAINE, L'AUTOMATE SE TAIT. Deux raisons.
//
// La première est de bon sens : un rappel « ta commande t'attend » envoyé onze
// jours après coup ne rend service à personne, et donne l'impression d'un
// système qui se réveille au hasard.
//
// La seconde est concrète. La reprise du 11/08 a daté les commandes déjà prêtes
// avec leur date de CRÉATION, faute de mieux : neuf commandes d'essai se sont
// retrouvées « prêtes » depuis des semaines. Sans ce plafond, le premier
// passage du cron leur aurait envoyé leurs trois rappels d'un coup.
//
// Passé ce délai, c'est au commerçant de trancher — et son tableau de bord,
// lui, continue de montrer la commande vieillir.
export const RAPPEL_TROP_TARD_HEURES = 7 * 24

// ⚠️ LES PRODUITS NE PÉRIMENT PAS AU MÊME RYTHME. Une robe mise de côté peut
// attendre trois jours, un sandwich non. C'est la seule raison de ces deux
// barèmes : ils ne décrivent pas des catégories, ils décrivent des denrées.
export const RAPPELS_PRODUITS = [24, 48, 72]
export const RAPPELS_ALIMENTAIRE = [24]

export function baremeRappels(categorie) {
  return String(categorie || 'alimentaire') === 'alimentaire'
    ? RAPPELS_ALIMENTAIRE
    : RAPPELS_PRODUITS
}

// Combien d'heures cette commande attend-elle ?
// Rend null quand la question n'a pas de sens : pas de date, date illisible.
export function heuresDAttente(pretAt, maintenant) {
  if (!pretAt) return null
  const t = new Date(pretAt).getTime()
  const n = (maintenant instanceof Date ? maintenant : new Date(maintenant)).getTime()
  if (!Number.isFinite(t) || !Number.isFinite(n)) return null
  return (n - t) / HEURE
}

// Faut-il envoyer un rappel maintenant, et lequel ?
//
// @param commande  { statut, pret_at, rappel_retrait_nb, commercant: { categorie } }
// @returns null si rien à faire, sinon { palier, rang }
//          `palier` = 24 | 48 | 72, `rang` = le nouveau compte de rappels
export function rappelAEnvoyer(commande, maintenant = new Date()) {
  if (!commande || commande.statut !== 'pret') return null

  const heures = heuresDAttente(commande.pret_at, maintenant)
  // ⚠️ SANS DATE, ON N'ENVOIE RIEN. Traiter l'absence comme un zéro enverrait
  // un rappel à toutes les commandes prêtes dès le premier passage du cron.
  //
  // ⚠️ CETTE GARDE EST REDONDANTE, ET C'EST ASSUMÉ. La mesure du défaut l'a
  // montré : la retirer ne change rien, parce que `null < 24` vaut true et que
  // la comparaison de palier plus bas rattrape déjà l'absence. Mais elle repose
  // sur une coercition silencieuse, exactement le genre de hasard qui se
  // retourne contre nous dès qu'un palier change. On garde le test explicite :
  // il ne coûte rien et il dit ce qu'on veut, au lieu de compter sur un effet
  // de bord du langage.
  if (heures === null) return null
  if (heures > RAPPEL_TROP_TARD_HEURES) return null

  const bareme = baremeRappels(commande.commercant?.categorie)
  // Le nombre de rappels DÉJÀ partis. Absent = aucun.
  const brut = commande.rappel_retrait_nb
  const dejaEnvoyes = (brut === null || brut === undefined || brut === '') ? 0 : Number(brut)
  const rang = Number.isFinite(dejaEnvoyes) ? dejaEnvoyes : 0

  // Tous les paliers sont passés : on se tait. Le commerçant, lui, continue de
  // voir la commande vieillir dans son tableau de bord.
  if (rang >= bareme.length) return null

  const palier = bareme[rang]
  if (heures < palier) return null
  return { palier, rang: rang + 1 }
}

// Ce que le rappel raconte au client.
//
// Il ne dit PAS « viens la chercher » comme un ordre : le client n'a peut-être
// pas pu passer, et le ton doit rester celui d'un service, pas d'un rappel à
// l'ordre.
export function texteRappelRetrait({ commercantNom, reference, palier, estAlimentaire = false }) {
  const chez = commercantNom || 'ton commerçant'
  const ref = reference ? ` #${reference}` : ''
  if (palier >= 72) {
    return {
      titre: '📦 Ta commande t’attend toujours',
      corps: `Ta commande${ref} est prête chez ${chez} depuis trois jours. Passe quand tu peux, ou préviens ${chez} si tu ne peux plus venir.`,
    }
  }
  if (palier >= 48) {
    return {
      titre: '📦 Ta commande t’attend toujours',
      corps: `Ta commande${ref} est toujours chez ${chez}. Elle t’attend aux heures d’ouverture.`,
    }
  }
  return {
    titre: '📦 Ta commande t’attend',
    corps: estAlimentaire
      ? `Ta commande${ref} est prête chez ${chez} depuis hier. Pense à passer la chercher.`
      : `Ta commande${ref} t’attend chez ${chez} depuis hier.`,
  }
}

// ─── CE QUE LE COMMERÇANT DOIT VOIR ───────────────────────────────────────
//
// ⚠️ « NON RETIRÉ » ÉTAIT INATTEIGNABLE EN BOUTIQUE. Le bouton « Client non
// venu » n'apparaît que si la commande a un CRÉNEAU, pour vérifier que l'heure
// est passée. Une commande de boutique n'en a pas : le bouton ne s'affichait
// jamais, le statut restait « Prête » à vie, et le stock des versions ne
// revenait jamais en rayon.
//
// La règle de remplacement : une commande sans créneau se juge sur son JOUR DE
// RETRAIT. Passé ce jour, le commerçant peut la déclarer non retirée.
export function peutMarquerNonRetire(commande, maintenant = new Date()) {
  if (!commande || commande.statut !== 'pret') return false
  const n = (maintenant instanceof Date ? maintenant : new Date(maintenant))
  if (isNaN(n.getTime())) return false

  // Commande à créneau : c'est la fin du créneau qui fait foi, comportement
  // inchangé.
  if (commande.creneau?.heure_fin && commande.date_commande) {
    const fin = new Date(`${commande.date_commande}T${String(commande.creneau.heure_fin).slice(0, 8)}`)
    return !isNaN(fin.getTime()) && n > fin
  }

  // Sans créneau : le lendemain du jour de retrait souhaité. On laisse la
  // journée entière au client avant d'ouvrir cette porte au commerçant.
  if (!commande.date_commande) return false
  const finDuJour = new Date(`${commande.date_commande}T23:59:59`)
  return !isNaN(finDuJour.getTime()) && n > finDuJour
}

// L'ancienneté, en clair, pour la vignette du tableau de bord.
// Rend null tant que la commande n'a pas au moins un jour : afficher
// « prête depuis 3 heures » sur toutes les commandes du jour serait du bruit.
export function ancienneteCommande(pretAt, maintenant = new Date()) {
  const heures = heuresDAttente(pretAt, maintenant)
  if (heures === null || heures < 24) return null
  const jours = Math.floor(heures / 24)
  return {
    jours,
    texte: jours === 1 ? 'Prête depuis hier' : `Prête depuis ${jours} jours`,
    // Au-delà de trois jours, c'est une commande dont il faut s'occuper.
    urgent: jours >= 3,
  }
}
