// LES FERMETURES EXCEPTIONNELLES DE L'AGENDA (congés, formation, jour férié)
//
// 🔴 ELLES NE S'APPLIQUAIENT QUE DANS LE NAVIGATEUR (audit du 03/10, avant
// Centre Respire). La fiche publique grisait les jours fermés, mais aucune
// route ne lisait `rdv_fermetures` : une requête forgée, une fiche restée
// ouverte depuis la veille ou un webhook d'acompte posaient un rendez-vous en
// plein congé. La professeure partie une semaine trouvait des inscrites à son
// retour, et une cliente qui avait payé trouvait porte close.
//
// ⚠️ ET LA FICHE ELLE-MÊME LAISSAIT PASSER LE COURS D'UNE PROFESSEURE ABSENTE.
// Sans préférence, seules les fermetures de TOUT le commerce bloquaient un
// jour : le cours du lundi, donné par une professeure en congé, restait
// réservable parce que la cliente n'avait choisi personne. Or la PLAGE dit qui
// donne le cours.
//
// La règle s'écrit donc ici une fois, et la fiche comme le serveur l'appellent :
//   • une fermeture du commerce (sans praticien) ferme la journée ;
//   • celle d'un praticien ferme SES plages, et le rendez-vous qu'on lui
//     destine nommément.
//
// Une fermeture couvre des journées entières, bornes comprises (« du 26 au 30 »
// inclut le 30), comme l'écran de saisie le promet.
//
// 🔴 SAUF LA FERMETURE D'UNE SÉANCE (question 1, décision d'Alex du 04/10).
// « Annuler ce cours » rouvrait les places à la réservation en ligne : une
// fermeture ne savait couvrir qu'une journée. Elle peut maintenant nommer UN
// cours (`prestation_id`) à UNE heure (`heure_debut`), un seul jour : elle ne
// ferme que cette séance, le reste de la journée reste ouvert, et l'agenda ne
// l'affiche pas comme une journée fermée. Les deux colonnes vont ensemble, la
// base le garantit (`MIGRATION_FERMETURE_SEANCE.sql`).
//
// Fichier PUR : il s'exécute au banc, sans base.

const DATE = /^\d{4}-\d{2}-\d{2}$/

// La fermeture d'UNE séance, et non d'une journée.
export function estFermetureDeSeance(f) {
  return Boolean(f && f.prestation_id != null && f.heure_debut != null)
}

const hhmm = (h) => String(h || '').slice(0, 5)

function couvre(f, dateStr) {
  if (!f || !DATE.test(String(dateStr || ''))) return false
  const debut = String(f.date_debut || '').slice(0, 10)
  const fin = String(f.date_fin || '').slice(0, 10)
  if (!DATE.test(debut) || !DATE.test(fin)) return false
  return debut <= dateStr && dateStr <= fin
}

// La fermeture qui empêche ce rendez-vous, ou null.
//
// ⚠️ `praticienId` est celui qui ASSURE le rendez-vous : choisi par la cliente,
// ou à défaut celui de la plage qui l'accueille. Sans lui, seule une fermeture
// du commerce bloque.
// ⚠️ `prestationId` ET `heure` : sans eux, une séance fermée ne bloque rien,
// ce qui est juste pour une question qui porte sur la JOURNÉE (la grille, la
// pastille du calendrier).
export function fermetureQuiBloque(fermetures, { dateStr, praticienId = null, prestationId = null, heure = null } = {}) {
  for (const f of fermetures || []) {
    if (!couvre(f, dateStr)) continue
    if (estFermetureDeSeance(f)) {
      if (prestationId != null && String(f.prestation_id) === String(prestationId)
        && hhmm(heure).length === 5 && hhmm(f.heure_debut) === hhmm(heure)) return f
      continue
    }
    if (f.praticien_id == null) return f
    if (praticienId != null && String(f.praticien_id) === String(praticienId)) return f
  }
  return null
}

// Toutes les fermetures qui couvrent ce jour, celles du commerce comme celles
// d'une praticienne. L'agenda les NOMME : « Fermé » ou « Absence : Emily ».
// ⚠️ SANS LES SÉANCES FERMÉES : un cours annulé n'est pas une journée fermée.
export function fermeturesDuJour(fermetures, dateStr) {
  return (fermetures || []).filter(f => !estFermetureDeSeance(f) && couvre(f, dateStr))
}

// Les séances fermées ce jour-là (cours annulés), pour la grille de la fiche.
export function seancesFermeesDuJour(fermetures, dateStr) {
  return (fermetures || []).filter(f => estFermetureDeSeance(f) && couvre(f, dateStr))
}

// Ce créneau de la grille est-il une séance fermée ?
export function seanceFermee(fermetures, { dateStr, prestationId, heure } = {}) {
  return seancesFermeesDuJour(fermetures, dateStr)
    .some(f => String(f.prestation_id) === String(prestationId) && hhmm(f.heure_debut) === hhmm(heure))
}

// Les rendez-vous qu'une fermeture rattrape : vivants, dans ses dates, et
// pour une praticienne, les siens seulement. Un rendez-vous sans praticienne
// sur une plage commune n'appartient à personne : son absence ne le touche pas.
// ⚠️ LA MÊME RÈGLE QUE LE SERVEUR (`fermetureQuiBloque`), lue dans l'autre sens :
// la commerçante voit exactement ce que sa fermeture aurait refusé.
export function rdvsSousLaFermeture(rdvs, fermeture) {
  if (!fermeture) return []
  const seance = estFermetureDeSeance(fermeture)
  return (rdvs || []).filter(r =>
    r && r.statut === 'confirme' && !r.deleted_at
    && couvre(fermeture, String(r.date_rdv || '').slice(0, 10))
    && (seance
      ? String(r.prestation_id) === String(fermeture.prestation_id) && hhmm(r.heure_debut) === hhmm(fermeture.heure_debut)
      : (fermeture.praticien_id == null || (r.praticien_id != null && String(r.praticien_id) === String(fermeture.praticien_id)))))
}

// Les rendez-vous à venir posés sur une PLAGE qu'on s'apprête à supprimer
// (Audit 1 I15, 03/10) : son jour (de la semaine, ou sa date précise), une
// heure de début dans ses bornes, et pour une plage nommée, sa praticienne.
// ⚠️ SUPPRIMER UNE PLAGE N'ANNULE RIEN : la commerçante doit le savoir AVANT,
// et décider elle-même de ce qu'elle fait de ces rendez-vous.
const JOURS_PLAGE = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
export function rdvsSurLaPlage(rdvs, plage, { aujourdhui } = {}) {
  if (!plage) return []
  const debut = String(plage.heure_debut || '').slice(0, 5)
  const fin = String(plage.heure_fin || '').slice(0, 5)
  return (rdvs || []).filter(r => {
    if (!r || r.statut !== 'confirme' || r.deleted_at) return false
    const d = String(r.date_rdv || '').slice(0, 10)
    if (!DATE.test(d) || (aujourdhui && d < aujourdhui)) return false
    if (plage.date_specifique) {
      if (d !== String(plage.date_specifique).slice(0, 10)) return false
    } else if (JOURS_PLAGE[new Date(`${d}T12:00:00Z`).getUTCDay()] !== plage.jour_semaine) return false
    const h = String(r.heure_debut || '').slice(0, 5)
    if (!(h >= debut && h < fin)) return false
    return plage.praticien_id == null || String(r.praticien_id ?? '') === String(plage.praticien_id)
  })
}

// Les plages d'un jour qui restent ouvertes malgré les fermetures.
//
// ⚠️ UNE PLAGE COMMUNE RESTE OUVERTE quand un seul praticien est absent : elle
// n'appartient à personne, et la maison accueille encore. Seule une fermeture
// du commerce la ferme.
// ⚠️ UNE SÉANCE FERMÉE NE FERME AUCUNE PLAGE : la plage peut porter d'autres
// heures ou d'autres prestations. C'est la grille qui retire la séance.
export function plagesOuvertes(creneauxJour, fermetures, dateStr) {
  const ferme = (fermetures || []).filter(f => !estFermetureDeSeance(f) && couvre(f, dateStr))
  if (ferme.some(f => f.praticien_id == null)) return []
  if (ferme.length === 0) return creneauxJour || []
  const absents = new Set(ferme.map(f => String(f.praticien_id)))
  return (creneauxJour || []).filter(c => c?.praticien_id == null || !absents.has(String(c.praticien_id)))
}
