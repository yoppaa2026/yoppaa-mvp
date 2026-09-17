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

import { sansAccents } from './texte-normalise.js'

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

// Les mots d'un texte, comparables entre eux : sans accents, sans casse, sans
// ponctuation. On compare des MOTS et non des morceaux de chaîne, sinon un
// libellé « Sse » se croirait contenu dans « Chaussée ».
function motsDe(valeur) {
  return sansAccents(valeur).replace(/[^a-z0-9]+/g, ' ').trim()
}

// 🔴 LE NOM DU COMMERCE S'AFFICHAIT DEUX FOIS (trouvé par Alex le 17/09, sur une
// capture d'écran destinée aux stores). La ligne de lieu annonçait « Le Dressing
// de Sophie · 43 m » juste sous le titre « Le Dressing de Sophie », et la
// question à laquelle cette ligne existe pour répondre, OÙ est ce commerce,
// n'obtenait plus qu'une distance noyée dans une répétition.
//
// ⚠️ LA GARDE EXISTAIT, ET ELLE ÉTAIT MORTE. L'accueil masquait le libellé du
// lieu quand `source === 'siege'`. Or le 15/08 le siège a cessé d'être un lieu :
// `normaliser()` pose désormais `source: lieu.type`, qui vaut `permanent`,
// `hebdo` ou `ponctuel`, et JAMAIS `siege`. La condition ne pouvait donc plus
// être vraie, et son commentaire décrivait toujours la bonne règle. Une garde
// qui ne se déclenche jamais est pire qu'une garde absente : elle rassure.
//
// La règle est donc reposée sur ce qu'elle voulait dire depuis le début : un
// libellé ne s'affiche que s'il apporte un lieu que le nom ne donne pas déjà.
// « Salle Saint-Roch » reste, « Le Dressing de Sophie » s'efface.
//
// ⚠️ SANS NOM À COMPARER, ON AFFICHE. Se taire demanderait de savoir que le
// libellé est redondant ; on ne le sait pas, et le pire cas de ce module reste
// une carte qui en dit trop, jamais une carte muette sur le lieu.
export function libelleApporteUnLieu(libelleLieu, nomCommerce) {
  const libelle = motsDe(libelleLieu)
  if (!libelle) return false
  const nom = motsDe(nomCommerce)
  if (!nom) return true
  const motsDuNom = new Set(nom.split(' '))
  return !libelle.split(' ').every((mot) => motsDuNom.has(mot))
}

// Ce que la carte affiche à cet endroit : la distance si on la connaît, sinon
// la localité, sinon rien. La règle vit ici pour que l'écran n'ait pas à la
// rejouer, et pour qu'un banc puisse la mesurer sans rendre du React.
export function lieuDeCarte({ distance, adresse, libelleLieu = null, nomCommerce = null, formatDistance }) {
  const libelle = libelleApporteUnLieu(libelleLieu, nomCommerce) ? libelleLieu : null
  if (distance != null) {
    const d = formatDistance ? formatDistance(distance) : `${distance}`
    return libelle ? `${libelle} · ${d}` : d
  }
  const localite = localiteDeAdresse(adresse)
  if (!localite) return null
  return libelle ? `${libelle} · ${localite}` : localite
}
