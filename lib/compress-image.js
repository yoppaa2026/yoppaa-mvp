// Compression d'image cote client avant upload Supabase Storage.
//
// Contexte : les photos prises depuis un iPhone recent pesent 3-5 Mo sans
// intervention. Rejeter avec "trop lourde, max 1 Mo" oblige l'utilisateur
// a compresser manuellement (Safari ne fournit aucun outil natif). Pattern
// zero-friction (memoire Alex) : on compresse automatiquement cote client.
//
// Utilise l'API Canvas native, aucune dependance. Passe pour :
//   - Avatars praticiens (400x400 suffit, affiche en 44px)
//   - Logo commercant (400x400 aussi, affiche en fiche + admin)
//   - Photos article, deals, actus (800x800 pour plus de detail)
//
// Retourne toujours un Blob JPEG (universel, meilleur ratio poids/qualite
// que PNG pour des photos). L'extension .jpg est appliquee au nom.

/**
 * @param {File} file - le fichier image source (input file)
 * @param {Object} [options]
 * @param {number} [options.maxWidth=400]  - largeur cible max en pixels
 * @param {number} [options.maxHeight=400] - hauteur cible max en pixels
 * @param {number} [options.quality=0.85]  - qualite JPEG (0-1)
 * @returns {Promise<Blob>} Blob JPEG compresse, ou le file original si deja plus petit ou compression impossible
 */
export async function compresserImage(file, options = {}) {
  const { maxWidth = 400, maxHeight = 400, quality = 0.85 } = options
  if (!file || !file.type?.startsWith('image/')) return file

  // Lire l'image via URL objet (plus rapide que FileReader base64)
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = url
    })

    // Redimensionnement en respectant le ratio
    let { width, height } = img
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height)
      width  = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    // Draw + export JPEG. Si l'image source est plus petite que maxWidth/maxHeight,
    // le redraw sans redimensionnement re-encode en JPEG (souvent plus leger que PNG).
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, width, height)

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return file  // fallback safety : navigateur qui refuse toBlob

    // Si la compression est contre-productive (ex : petit GIF anime), on garde l'original
    if (blob.size >= file.size) return file
    return blob
  } catch (e) {
    console.warn('[compresserImage] erreur, upload du fichier original', e?.message)
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}
