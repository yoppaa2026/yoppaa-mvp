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

/**
 * Prépare une photo d'ARTICLE pour la fiche « façon post » (décision Alex
 * 30/07) : recadrage centré au format portrait 4:5 (le format réseau social
 * mobile), redimensionnement 1080×1350 max, filigrane « yoppaa » discret en
 * bas à droite, export JPEG.
 *
 * En cas d'erreur canvas, retombe sur la compression simple (jamais bloquant).
 *
 * @param {File} file - le fichier image source (input file)
 * @param {Object} [options]
 * @param {number}  [options.largeur=1080]   - largeur cible max (hauteur = largeur × 5/4)
 * @param {number}  [options.quality=0.85]   - qualité JPEG (0-1)
 * @param {boolean} [options.filigrane=true] - appliquer le wordmark yoppaa
 * @returns {Promise<Blob>} Blob JPEG 4:5, ou résultat de compresserImage en secours
 */
export async function preparerPhotoArticle(file, options = {}) {
  const { largeur = 1080, quality = 0.85, filigrane = true } = options
  const RATIO = 4 / 5  // largeur / hauteur
  if (!file || !file.type?.startsWith('image/')) return file

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = url
    })

    // Recadrage CENTRÉ vers le ratio 4:5 : on coupe l'excédent du côté trop long
    const srcRatio = img.width / img.height
    let sx = 0, sy = 0, srcW = img.width, srcH = img.height
    if (srcRatio > RATIO) {
      // Trop large : on rogne à gauche/droite
      srcW = Math.round(img.height * RATIO)
      sx = Math.round((img.width - srcW) / 2)
    } else if (srcRatio < RATIO) {
      // Trop haute : on rogne haut/bas
      srcH = Math.round(img.width / RATIO)
      sy = Math.round((img.height - srcH) / 2)
    }

    // Dimensions de sortie : jamais d'upscale au-delà de la source
    const outW = Math.min(largeur, srcW)
    const outH = Math.round(outW / RATIO)

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, outW, outH)

    // Filigrane wordmark « yoppaa » : discret, bas droite, blanc semi-transparent
    // avec une fine ombre pour rester lisible sur fond clair comme sombre
    if (filigrane) {
      const fontSize = Math.max(18, Math.round(outW * 0.042))
      const marge = Math.round(outW * 0.032)
      ctx.font = `800 ${fontSize}px "Plus Jakarta Sans", "DM Sans", system-ui, sans-serif`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'alphabetic'
      ctx.shadowColor = 'rgba(26,8,64,0.45)'
      ctx.shadowBlur = Math.round(fontSize * 0.35)
      ctx.shadowOffsetY = 1
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText('yoppaa', outW - marge, outH - marge)
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob) return compresserImage(file, { maxWidth: 1200, maxHeight: 1500, quality })
    return blob
  } catch (e) {
    console.warn('[preparerPhotoArticle] erreur canvas, compression simple', e?.message)
    return compresserImage(file, { maxWidth: 1200, maxHeight: 1500, quality })
  } finally {
    URL.revokeObjectURL(url)
  }
}
