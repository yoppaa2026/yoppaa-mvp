// OÙ SE RANGE UNE IMAGE DE FICHE, ET COMMENT ON LA RETROUVE (29/09).
//
// 🔴 POURQUOI (contrôle du 29/09 sur les policies du stockage). Le bucket
// `logos` rangeait toutes les images « à plat » (`gal-<id>-<date>.jpg`), et ses
// policies d'écriture ne vérifiaient QUE le nom du bucket : tout compte
// connecté, Yopper compris, pouvait remplacer ou supprimer le logo et les
// photos de n'importe quel commerce. Aucune policy ne pouvait savoir à qui
// appartient un fichier, puisque rien dans son chemin ne le disait.
//
// Désormais chaque image vit dans le dossier de son commerce :
// `<commercant_id>/<nom>`. La policy lit ce premier dossier et le compare aux
// commerces de l'appelant (ou laisse passer l'admin).
//
// ⚠️ UN CHEMIN SANS COMMERCE N'EST PAS UN CHEMIN : on lève, plutôt que de
// ranger un fichier à la racine où la policy le refuserait en silence.
//
// Fichier PUR : testable en l'exécutant.

export const BUCKET_IMAGES = 'logos'

export function cheminImage(commercantId, nom) {
  const cid = String(commercantId || '').trim()
  const n = String(nom || '').trim()
  if (!cid) throw new Error('image sans commerce : impossible de la ranger')
  if (!n || n.includes('/')) throw new Error('nom d’image invalide')
  return `${cid}/${n}`
}

// Le nom de l'objet dans le bucket, depuis son adresse publique.
//
// ⚠️ PAS LE DERNIER SEGMENT DE L'ADRESSE. C'est ainsi que les suppressions
// retrouvaient leur fichier ; avec un dossier par commerce, elles viseraient
// `gal-….jpg` au lieu de `<commerce>/gal-….jpg`, ne supprimeraient rien, et
// laisseraient l'ancienne photo en place sans le dire.
export function objetDepuisUrl(url) {
  const s = String(url || '')
  const marque = `/${BUCKET_IMAGES}/`
  const i = s.indexOf(marque)
  if (i < 0) return null
  const brut = s.slice(i + marque.length).split('?')[0].split('#')[0]
  if (!brut) return null
  try { return decodeURIComponent(brut) } catch { return brut }
}
