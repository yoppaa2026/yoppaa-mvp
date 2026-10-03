// LES REFUS D'UN RENDEZ-VOUS, AVANT ET APRÈS UN PAIEMENT (03/10)
//
// 🔴 POURQUOI CE MODULE (audit avant Centre Respire). L'acompte en ligne était
// encaissé AVANT tout contrôle de place : la route ouvrait Stripe sans
// vérifier que le cours avait encore de la place, et le rendez-vous ne naissait
// qu'au webhook. Si la place était prise entre-temps, le webhook levait une
// erreur, Stripe le rejouait trois jours, et personne ne remboursait : la
// cliente avait payé, n'avait pas de place, et lisait « confirmé ».
//
// Désormais :
//   • AVANT le paiement, la route fait passer la réservation par le module de
//     création en simple vérification, et refuse avec la phrase d'ici ;
//   • APRÈS le paiement, un refus de RÈGLE (place prise, horaire fermé…) ne se
//     rejoue plus : le webhook rembourse, et le dit à la cliente.
//
// ⚠️ UNE PANNE N'EST PAS UN REFUS DE RÈGLE. `ecriture_impossible` peut se
// résoudre au rejeu suivant : celui-là, on le laisse rejouer.
//
// Fichier PUR : il s'exécute au banc, sans base ni Stripe.

export const REFUS_DE_REGLE = [
  'place_prise', 'salle_complete', 'cadence_atteinte', 'prestation_hors_creneau',
  'prestation_introuvable', 'prestation_hors_commerce',
  'praticien_hors_commerce', 'praticien_hors_prestation',
  'couverts_invalides', 'groupe_trop_grand', 'creneau_passe', 'jour_ferme',
  // I9 (03/10) : la prestation retirée de la vente, la date au-delà de
  // l'horizon de la fiche. Deux règles, pas deux pannes : on ne les rejoue pas.
  'prestation_inactive', 'hors_horizon',
]

export function estRefusDeRegle(code) {
  return REFUS_DE_REGLE.includes(code)
}

// Ce qu'on répond AVANT d'envoyer la cliente chez Stripe.
// ⚠️ `creneau_refuse` renvoie la fiche choisir une autre heure, sur une grille
// remise à jour : c'est le geste utile après un refus d'horaire.
export function refusAvantPaiement(res, { nom = null } = {}) {
  const code = res?.code
  const horaire = (error) => ({ status: 409, corps: { ok: false, error, code, creneau_refuse: true } })
  if (code === 'place_prise') {
    return horaire(res.collectif
      ? 'La dernière place vient d’être prise. Choisis un autre horaire.'
      : 'Ce créneau vient d’être pris. Choisis-en un autre.')
  }
  if (code === 'salle_complete') {
    const restants = Number(res.restants)
    return horaire(restants > 0
      ? `Il ne reste que ${restants} place${restants > 1 ? 's' : ''} à cette heure-là.`
      : 'C’est complet à cette heure-là. Choisis un autre horaire.')
  }
  if (code === 'cadence_atteinte') {
    return horaire('Trop de personnes arrivent déjà à cette heure-là. Choisis un autre horaire.')
  }
  if (code === 'prestation_hors_creneau') {
    return horaire('Cet horaire n’est pas ouvert à cette prestation. Choisis-en un autre.')
  }
  if (code === 'creneau_passe') {
    return horaire('Ce créneau est déjà passé. Choisis-en un autre.')
  }
  // ⚠️ UN JOUR FERMÉ RENVOIE CHOISIR UNE AUTRE DATE : congés, formation, ou la
  // personne qui assure ce rendez-vous est absente ce jour-là.
  if (code === 'jour_ferme') {
    return horaire(`${nom || 'Le commerce'} ne prend pas de rendez-vous ce jour-là. Choisis une autre date.`)
  }
  // ⚠️ L'HORIZON RENVOIE À LA GRILLE : une date plus proche se réserve.
  if (code === 'hors_horizon') {
    return horaire('Cette date n’est pas encore ouverte à la réservation. Choisis une date plus proche.')
  }
  // ⚠️ UNE PRESTATION RETIRÉE NE RENVOIE PAS À LA GRILLE : aucune autre heure
  // ne la rendrait réservable.
  if (code === 'prestation_inactive') {
    return { status: 409, corps: { ok: false, code, error: `${nom || 'Le commerce'} ne propose plus cette prestation en ligne.` } }
  }
  if (code === 'praticien_hors_commerce' || code === 'praticien_hors_prestation') {
    return { status: 409, corps: { ok: false, code, error: 'Cette personne ne peut pas assurer ce rendez-vous. Choisis quelqu’un d’autre, ou « sans préférence ».' } }
  }
  if (code === 'couverts_invalides') {
    return { status: 400, corps: { ok: false, code, error: 'Ce nombre de personnes n’est pas accepté pour cette réservation.' } }
  }
  if (code === 'groupe_trop_grand') {
    return { status: 409, corps: { ok: false, code, error: `Aucune table n’accueille ce groupe en ligne. Appelle directement ${nom || 'le commerce'} : les grandes tablées se préparent de vive voix.` } }
  }
  if (code === 'prestation_introuvable' || code === 'prestation_hors_commerce') {
    return { status: 404, corps: { ok: false, code, error: 'Prestation introuvable.' } }
  }
  return { status: 500, corps: { ok: false, code: code || 'inconnu', error: 'Ta réservation n’a pas pu être vérifiée. Réessaie dans un instant.' } }
}

// 🔴 « ERREUR PAIEMENT : FAILED TO FETCH. REESSAIE » (Audit 2 C1, 03/10). Le
// tunnel collait le message brut de l'exception entre deux phrases : une
// panne réseau sortait en anglais technique, et une phrase serveur déjà
// lisible se retrouvait encadrée de « Erreur paiement : » et d'un second
// « réessaie ». La phrase du serveur passe telle quelle ; tout le reste
// devient une seule phrase humaine.
// `duServeur` : l'appelant marque l'erreur qui porte la phrase de la route.
export function messagePaiementRate(erreur, nomCommerce = null) {
  const qui = nomCommerce || 'le commerce'
  const phrase = String(erreur?.message || '').trim()
  if (erreur?.duServeur && phrase) return phrase
  return `Le paiement n’a pas pu démarrer. Vérifie ta connexion et réessaie, ou contacte ${qui}.`
}

// Ce qu'on écrit à la cliente quand son paiement est arrivé APRÈS que la place
// a disparu. La phrase complète la suivante : « Ta place n'a pas pu être
// confirmée : … ».
export function motifApresPaiement(code) {
  if (code === 'place_prise' || code === 'salle_complete' || code === 'cadence_atteinte') {
    return 'la dernière place a été prise juste avant que ton paiement arrive'
  }
  if (code === 'prestation_hors_creneau') return 'cet horaire n’était plus ouvert à la réservation'
  if (code === 'creneau_passe') return 'l’horaire était déjà passé quand ton paiement est arrivé'
  if (code === 'jour_ferme') return 'ce jour-là a été fermé à la réservation juste avant que ton paiement arrive'
  if (code === 'prestation_inactive') return 'cette prestation a été retirée de la réservation en ligne juste avant que ton paiement arrive'
  if (code === 'hors_horizon') return 'cette date n’était pas encore ouverte à la réservation'
  return 'la réservation n’a pas pu être enregistrée'
}
