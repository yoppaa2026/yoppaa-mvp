// UNE RÉPONSE DIT-ELLE OUI OU NON ?
//
// 🔴 POURQUOI CETTE FONCTION EXISTE À PART. La règle vivait au milieu de
// `prevenirClient`, dans `lib/fetch-pro.js`, qui porte `'use client'` et importe
// le client Supabase : un banc Node ne peut pas l'importer. J'ai donc écrit six
// cas de comportement qui REJOUAIENT la logique dans le banc, et une mutation
// l'a démasqué en restant verte — ils mesuraient ma copie, pas le code.
//
// Une règle qu'on ne peut pas exécuter depuis un banc finit toujours par être
// testée en double, et la copie ne rougit jamais.
//
// ⚠️ ELLE EST PURE : ni réseau, ni horloge, ni Supabase. On lui donne ce qu'une
// réponse a dit, elle rend le verdict.

// 🔴 LE 200 QUI DIT NON (trouvé le 17/09, sur la fidélité). Nos routes
// répondent `NextResponse.json({ ok: false, reason: '…' })`, c'est-à-dire un
// code 200 avec un refus dans le corps. Lire le code sans lire le corps, c'est
// croire quelqu'un sur son ton de voix : `/api/fidelite/crediter` refusait
// cinq motifs différents, et le tableau de bord annonçait un succès.
//
// ⚠️ ON TESTE `corps?.ok === false`, JAMAIS `!corps?.ok`. Toutes les routes ne
// rendent pas `ok` : une réponse `{ sent: true }` serait déclarée en échec par
// la seconde forme, et l'avertissement s'afficherait chez le commerçant sans
// qu'il se soit rien passé. Une alarme qui sonne tout le temps ne protège plus
// rien. Absence de `ok` vaut succès, c'est le contrat d'avant.
//
// `corps` vaut `null` quand la réponse était vide ou illisible : ce n'est pas
// un refus, beaucoup de routes répondent sans corps.
export function reponseRefuse(estOk, corps) {
  if (!estOk) return true
  return corps?.ok === false
}

// Le motif d'un refus, dans l'ordre où nos routes le nomment. Rend une chaîne
// vide plutôt que `null` : l'appelant la complète par le code HTTP.
//
// ⚠️ `reason` EST LU EN DERNIER ET C'EST VOULU. C'est un mot technique
// (`telephone_invalide`), utile en journal, illisible pour un commerçant : on
// ne s'en sert que si la route n'a pas pris la peine d'écrire une phrase.
export function motifDuRefus(corps) {
  return corps?.error || corps?.message || corps?.reason || ''
}
