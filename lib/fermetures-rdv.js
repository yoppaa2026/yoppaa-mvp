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
// Fichier PUR : il s'exécute au banc, sans base.

const DATE = /^\d{4}-\d{2}-\d{2}$/

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
export function fermetureQuiBloque(fermetures, { dateStr, praticienId = null } = {}) {
  for (const f of fermetures || []) {
    if (!couvre(f, dateStr)) continue
    if (f.praticien_id == null) return f
    if (praticienId != null && String(f.praticien_id) === String(praticienId)) return f
  }
  return null
}

// Les plages d'un jour qui restent ouvertes malgré les fermetures.
//
// ⚠️ UNE PLAGE COMMUNE RESTE OUVERTE quand un seul praticien est absent : elle
// n'appartient à personne, et la maison accueille encore. Seule une fermeture
// du commerce la ferme.
export function plagesOuvertes(creneauxJour, fermetures, dateStr) {
  const ferme = (fermetures || []).filter(f => couvre(f, dateStr))
  if (ferme.some(f => f.praticien_id == null)) return []
  if (ferme.length === 0) return creneauxJour || []
  const absents = new Set(ferme.map(f => String(f.praticien_id)))
  return (creneauxJour || []).filter(c => c?.praticien_id == null || !absents.has(String(c.praticien_id)))
}
