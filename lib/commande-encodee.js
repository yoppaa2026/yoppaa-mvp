// LA COMMANDE ENCODÉE À LA MAIN PAR LE COMMERÇANT (Alex, 10/10, « version express »).
//
// 🔴 POURQUOI. Une pizzeria a quitté son système de commande en ligne parce
// qu'il refusait les commandes du téléphone : deux carnets, et jamais la vraie
// image de la soirée. Alex, le 24/09 : « ils sont quasi tous multicanaux ».
// Sans ces commandes, un créneau « à moitié vide » dans Yoppaa est peut-être
// plein par téléphone, et la cuisine déborde.
//
// CE QUI EST DÉCIDÉ (tableau, 10/10) :
//   - retrait ET livraison ;
//   - créneau plein, stock insuffisant : on PRÉVIENT, puis on laisse encoder
//     d'un second geste (le commerçant connaît son four) ;
//   - le patron, et les membres de l'équipe qui ont la case « Commandes » ;
//   - le nom seul est obligatoire ; téléphone et e-mail facultatifs ;
//   - « payé » (espèces ou terminal) ou « à payer au retrait » ;
//   - l'e-mail au client est une CONFIRMATION, jamais une campagne, et il
//     ne part que si le commerçant le demande.
//
// ⚠️ CE MODULE EST PUR : il ne lit pas la base. La route serveur
// (`/api/equipe/commande/creer`) relit tout, puis lui demande quoi accepter,
// quoi signaler, et quoi écrire.

export const ORIGINE_EN_LIGNE = 'en_ligne'
export const ORIGINE_COMMERCANT = 'commercant'

// Comment le client a payé, ou va payer. `a_payer` n'écrit aucune colonne
// d'encaissement : la question sera posée à la remise, comme pour toute
// commande sur place.
export const PAIEMENTS_ENCODEE = ['a_payer', 'especes', 'terminal']
export const LIBELLES_PAIEMENT_ENCODEE = {
  a_payer: 'À payer au retrait',
  especes: 'Payé en espèces',
  terminal: 'Payé au terminal',
}

export const MODES_ENCODEE = ['retrait', 'livraison']

const texte = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max)

/**
 * Le client, tel que le commerçant l'a noté au téléphone.
 * Rend { ok: true, client } ou { ok: false, error }.
 */
export function clientEncode({ nom, telephone, email } = {}) {
  const n = texte(nom, 120)
  if (n.length < 2) return { ok: false, error: 'Indique au moins le nom du client.' }
  const t = texte(telephone, 30)
  if (t && t.replace(/\D/g, '').length < 8) return { ok: false, error: 'Ce numéro de téléphone semble incomplet.' }
  const e = texte(email, 254).toLowerCase()
  if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return { ok: false, error: 'Cette adresse e-mail ne semble pas valide.' }
  return { ok: true, client: { client_nom: n, client_telephone: t || null, client_email: e || null } }
}

/**
 * Les colonnes d'encaissement d'une commande encodée.
 * ⚠️ `paye_en_ligne` RESTE FAUX, TOUJOURS : il répond à « doit-il encore
 * payer EN LIGNE », et Stripe n'a rien vu. Le mettre à vrai ferait compter la
 * vente comme un paiement par carte dans la comptabilité, et une annulation
 * chercherait à la rembourser sur une carte qui n'existe pas.
 */
export function champsPaiementEncodee({ paiement, total, maintenant = new Date() } = {}) {
  if (!PAIEMENTS_ENCODEE.includes(paiement)) {
    return { ok: false, error: 'Dis si le client a déjà payé (espèces ou terminal) ou s’il paiera au retrait.' }
  }
  const base = { paye_en_ligne: false }
  if (paiement === 'a_payer') return { ok: true, champs: { ...base, encaisse_mode: null, encaisse_montant: null, encaisse_le: null } }
  const montant = Math.round(Number(total) * 100) / 100
  if (!(montant >= 0)) return { ok: false, error: 'Montant invalide.' }
  return {
    ok: true,
    champs: { ...base, encaisse_mode: paiement, encaisse_montant: montant, encaisse_le: maintenant.toISOString() },
  }
}

// Les avertissements : ce que le commerçant doit LIRE avant de confirmer.
// Aucun n'interdit ; chacun dit le fait, en une phrase.
export const AVERTISSEMENTS = {
  creneau_plein: 'Ce créneau est déjà plein.',
  creneau_bloque: 'Tu as fermé ce créneau aux commandes en ligne pour ce jour.',
  creneau_commence: 'Ce créneau a déjà commencé.',
  delai_depasse: 'Le délai de commande que tu as réglé pour ce créneau est dépassé.',
  stock: 'Le stock ne suffit pas.',
  hors_zone: 'Cette adresse est en dehors de ta zone de livraison.',
  adresse_non_situee: 'Cette adresse n’a pas été trouvée dans la liste officielle : elle n’aura pas de position sur ta tournée.',
  minimum_livraison: 'La commande n’atteint pas ton minimum de livraison.',
  jour_ferme: 'Tu as noté une fermeture ce jour-là.',
}

/**
 * Un avertissement, avec son détail éventuel (ex. « Il en reste 2 »).
 * ⚠️ UN CODE PEUT VISER UN ARTICLE (`stock:<id>`) : deux articles courts sont
 * deux avertissements distincts, et confirmer l'un ne confirme pas l'autre.
 * Le texte, lui, vient de la famille (`stock`).
 */
export function avertissement(code, detail = null) {
  const famille = String(code).split(':')[0]
  const base = AVERTISSEMENTS[famille] || AVERTISSEMENTS[code] || 'À vérifier.'
  return { code, message: detail ? `${base} ${detail}` : base }
}

/**
 * Faut-il demander confirmation avant d'écrire ?
 * ⚠️ LA CONFIRMATION EST DONNÉE PAR L'ÉCRAN EN CONNAISSANCE DE CAUSE : elle
 * renvoie la liste des codes qu'il a montrés. Un avertissement apparu entre
 * les deux clics (le créneau s'est rempli entre-temps) redemande la
 * confirmation, au lieu de passer sous un « oui » donné à autre chose.
 */
export function confirmationRequise(avertissements = [], codesConfirmes = []) {
  const vus = new Set(Array.isArray(codesConfirmes) ? codesConfirmes : [])
  return (avertissements || []).some(a => !vus.has(a.code))
}

/**
 * Le créneau est-il TERMINÉ (son heure de fin passée) ?
 * 🔴 LA FENÊTRE MONTRAIT LES CRÉNEAUX DE 7 H À 15 H (trouvé par Alex, 10/10) :
 * le commerçant doit voir le nécessaire. Un créneau TERMINÉ disparaît ; celui
 * qui est EN COURS reste, c'est le client qui passe dans dix minutes.
 * Une fin avant le début (créneau qui passe minuit) finit le lendemain.
 * `instant` reçoit (dateStr, heure) et rend l'instant réel (`brusselsInstant`).
 */
export function creneauTermine(creneau, { dateStr, maintenant = new Date(), instant } = {}) {
  if (!creneau?.heure_fin || typeof instant !== 'function') return false
  const fin = instant(dateStr, creneau.heure_fin)
  if (!fin || isNaN(fin.getTime())) return false
  const debut = creneau.heure_debut ? instant(dateStr, creneau.heure_debut) : null
  const finReelle = debut && !isNaN(debut.getTime()) && fin.getTime() <= debut.getTime()
    ? new Date(fin.getTime() + 24 * 3600 * 1000) : fin
  return maintenant.getTime() >= finReelle.getTime()
}

/**
 * Le moment du créneau par rapport à maintenant, pour une commande encodée.
 * `verdict` est celui de `creneauCommandable` (lib/creneaux.js).
 *   - un autre jour de semaine que le créneau : REFUS (erreur de saisie) ;
 *   - une date passée : REFUS (on n'encode pas hier) ;
 *   - un créneau terminé (`termine`, de `creneauTermine`) : REFUS (l'écran
 *     ne le montre plus ; un onglet resté ouvert ne le fait pas revenir) ;
 *   - créneau commencé ou délai dépassé, aujourd'hui : AVERTISSEMENT (le
 *     client du téléphone passe dans dix minutes, c'est le cas normal).
 */
export function jugementMoment({ verdict, dateCommande, aujourdhui, termine = false }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateCommande || ''))) return { refus: 'Date invalide.' }
  if (dateCommande < aujourdhui) return { refus: 'Cette date est passée.' }
  if (termine) return { refus: 'Ce créneau est terminé. Choisis-en un autre.' }
  if (!verdict || verdict.ok) return { refus: null, avertissement: null }
  if (verdict.raison === 'jour') return { refus: 'Ce créneau n’existe pas ce jour-là de la semaine.' }
  if (verdict.raison === 'introuvable') return { refus: 'Créneau introuvable.' }
  if (verdict.raison === 'passe') return { refus: null, avertissement: avertissement('creneau_commence') }
  if (verdict.raison === 'cutoff') return { refus: null, avertissement: avertissement('delai_depasse') }
  return { refus: null, avertissement: null }
}

/**
 * Le nombre de commandes ARRIVÉES EN LIGNE, celui qui fait sonner le tableau
 * de bord (« Nouvelle commande ! »).
 * ⚠️ Une commande encodée par le commerçant ne sonne pas : il vient de la
 * saisir. Une commande en attente de paiement non plus : le client n'a pas
 * encore payé (même exclusion que l'interrogation toutes les 5 secondes, que
 * le premier chargement oubliait).
 */
export function nombreArriveesEnLigne(commandes) {
  return (commandes || []).filter(c => c && c.origine !== ORIGINE_COMMERCANT && c.statut !== 'paiement_en_attente').length
}
