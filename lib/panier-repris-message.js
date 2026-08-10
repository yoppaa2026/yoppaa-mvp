// Ce qu'on dit au client quand son panier l'a suivi d'un tunnel à l'autre.
//
// ⚠️ LE MESSAGE ÉTAIT FAUX EN FRANÇAIS ET VIDE DE SENS.
// Il s'écrivait « Tes {n} article{s} t'ont suivi depuis la fiche ». Le pluriel
// n'était appliqué qu'au mot « article » : avec un seul produit, ça donnait
// « **Tes 1 article t'ont suivi depuis la fiche** ». Ni le déterminant, ni le
// verbe, ni le participe ne s'accordaient.
//
// Et « depuis la fiche » ne veut rien dire pour un client : il ne sait pas ce
// qu'est une fiche. Ce qu'il veut savoir, lui, c'est que rien n'a été perdu en
// changeant d'écran.
//
// Les textes vivent ici pour être vérifiables : une phrase mal accordée ne fait
// planter personne, elle abîme juste la confiance, silencieusement.

// @param repris   nombre d'articles qui ont suivi
// @param ignores  noms des articles qui n'ont pas pu suivre
// @param vers     'rdv' (on arrive dans le tunnel rendez-vous) | 'boutique'
export function messagePanierRepris({ repris = 0, ignores = [], vers = 'rdv' } = {}) {
  const n = Number(repris) || 0
  const restes = (ignores || []).filter(Boolean)

  let garde = null
  if (n === 1) {
    garde = 'Ton article est toujours dans ton panier 🟣'
  } else if (n > 1) {
    garde = `Tes ${n} articles sont toujours dans ton panier 🟣`
  }

  let perdus = null
  if (restes.length === 1) {
    // ⚠️ On évite « il » ou « elle » : le genre d'un nom d'article est
    // impossible à deviner. La phrase tourne donc autour de l'article lui-même.
    perdus = vers === 'rdv'
      ? `${restes[0]} se commande depuis la boutique : tu le retrouveras là-bas.`
      : `${restes[0]} n'a pas pu venir jusqu'ici : ajoute-le à nouveau.`
  } else if (restes.length > 1) {
    perdus = vers === 'rdv'
      ? `${restes.join(', ')} se commandent depuis la boutique : tu les retrouveras là-bas.`
      : `${restes.join(', ')} n'ont pas pu venir jusqu'ici : ajoute-les à nouveau.`
  }

  return { garde, perdus }
}
