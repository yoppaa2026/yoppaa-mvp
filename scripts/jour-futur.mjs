// UN JOUR DE LA SEMAINE TOUJOURS FUTUR, POUR LES BANCS QUI APPELLENT LE MOTEUR
// DE CRÉNEAUX.
//
// 🔴 POURQUOI (15/09 au soir). Le moteur masque les heures déjà passées quand
// la date demandée est AUJOURD'HUI. Un banc qui lui passe une date écrite en
// dur rougit donc le jour venu, à l'heure dite, sans qu'une ligne de code ait
// bougé : `verif:slots` le 05/08 puis le 15/09, `verif:table` le 15/09 à 19 h,
// et `verif:jointes` aurait suivi le samedi 19/09 au soir. Un rouge qu'on sait
// faux apprend à ignorer le rouge.
//
// ⚠️ AU MOINS SEPT JOURS D'AVANCE, À MIDI HEURE LOCALE : jamais aujourd'hui, et
// jamais à cheval sur un changement de jour.
//
// Les dates fixes restent permises aux fonctions PURES qui reçoivent leur
// « maintenant » en paramètre : elles ne lisent pas l'horloge, elles ne
// vieillissent pas.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

export function jourFutur(nomJour, depuis = new Date()) {
  const cible = JOURS.indexOf(nomJour)
  if (cible === -1) throw new Error(`jour inconnu : ${nomJour}`)
  const d = new Date(depuis)
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() + 7)
  while (d.getDay() !== cible) d.setDate(d.getDate() + 1)
  return d
}

// La date au format de la base (AAAA-MM-JJ), lue en heure LOCALE, comme le
// moteur la lit. ⚠️ Jamais `toISOString().slice(0, 10)`, qui rend le jour de
// Greenwich.
export function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
