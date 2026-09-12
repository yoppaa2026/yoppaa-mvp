// Où se trouve un commerce, quand on ne sait pas où se trouve le client.
//
// 🔴 CE QUE LA CARTE NE DISAIT PLUS DU TOUT. La liste des commerces n'affiche
// que la DISTANCE, et uniquement si elle existe : `c.distance != null`. Or elle
// n'existe qu'une fois la géolocalisation accordée. Un visiteur qui refuse le
// mouchard, ou à qui le navigateur ne l'a pas encore demandé, voyait donc une
// liste de commerces sans le moindre indice de l'endroit où ils se trouvent :
// ni distance, ni adresse, ni commune.
//
// Le brief demandait de RETIRER l'adresse de la carte. Elle n'y était pas, et
// le vrai défaut allait dans l'autre sens.
//
// ⚠️ ON NE MONTRE QUE LA LOCALITÉ, JAMAIS LA RUE. Dans une liste de découverte,
// « Mettet » répond à la question posée ; « Rue du Moulin 20 » prend une ligne
// pour une information dont le client n'a besoin qu'une fois décidé, et elle
// l'attend sur la fiche.
//
// ⚠️ ET SI ON NE SAIT PAS, ON NE DIT RIEN. L'adresse est un champ libre saisi
// par le commerçant : elle peut être écrite dans n'importe quel ordre. Inventer
// une localité à partir d'un texte mal formé serait pire que de se taire, et le
// pire cas de ce module est exactement l'état d'avant, une carte sans lieu.

// Un code postal belge tient en quatre chiffres, et la localité le suit.
// Le séparateur est libre : virgule, tiret, ou rien du tout.
const LOCALITE = /\b\d{4}\s*[,\-–]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'’\-. ]*)$/

export function localiteDeAdresse(adresse) {
  if (!adresse) return null
  const texte = String(adresse).trim()
  const m = texte.match(LOCALITE)
  if (!m) return null
  const localite = m[1].trim().replace(/[.,;]+$/, '')
  // Une initiale seule n'est pas une commune : c'est une coquille de saisie.
  return localite.length >= 2 ? localite : null
}

// Ce que la carte affiche à cet endroit : la distance si on la connaît, sinon
// la localité, sinon rien. La règle vit ici pour que l'écran n'ait pas à la
// rejouer, et pour qu'un banc puisse la mesurer sans rendre du React.
export function lieuDeCarte({ distance, adresse, libelleLieu = null, formatDistance }) {
  if (distance != null) {
    const d = formatDistance ? formatDistance(distance) : `${distance}`
    return libelleLieu ? `${libelleLieu} · ${d}` : d
  }
  const localite = localiteDeAdresse(adresse)
  if (!localite) return null
  return libelleLieu ? `${libelleLieu} · ${localite}` : localite
}
