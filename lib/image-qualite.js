// QUALITÉ DES IMAGES — on AVERTIT, on ne BLOQUE PAS.
//
// ⚠️ ARBITRAGE D'ALEX, 21/08. Le signup refusait toute image sous 800 px sur le
// grand côté. Trois raisons de ne plus le faire :
//
//   1. Le tableau de bord, lui, n'a JAMAIS eu ce contrôle. La même photo, dans
//      la même galerie, dans la même table, passait le lendemain sans un mot.
//      On bloquait donc le PREMIER JOUR ce qu'on accepte tous les autres.
//   2. Une photo récupérée depuis Facebook ou une conversation sort souvent en
//      720 px : c'est le cas le plus fréquent, pas le cas limite.
//   3. Le refus tombait sans dire NI la taille de l'image, NI quoi faire.
//
// La règle devient : ça passe, ça se voit, et ça se dit. Au commerçant pendant
// qu'il téléverse, ET à l'admin sur l'écran de validation — c'est lui qui
// demandera la reprise avant de publier la fiche.
//
// ⚠️ CETTE FONCTION EST PURE ET N'A PAS BESOIN DU NAVIGATEUR : c'est ce qui
// permet au banc de l'EXÉCUTER et de lire ce qui en sort. La mesure, elle,
// demande le DOM et vit dans `mesurerFichierImage` / l'attribut `onLoad`.

/**
 * Taille conseillée sur le GRAND CÔTÉ, par usage.
 * Elle vaut la taille à laquelle l'image sera réellement rendue après
 * compression : en dessous, le navigateur agrandit et ça se voit.
 */
export const TAILLE_CONSEILLEE = {
  logo: 400,        // recompressé en 400x400
  photo: 800,       // galerie et couverture, recompressées en 1600x1200
  article: 800,     // photo d'article, recompressée en 1200x1500
}

/**
 * @param {{w:number,h:number}|null} dims
 * @param {number} minPx taille conseillée sur le grand côté
 * @param {'logo'|'photo'} quoi
 * @returns {{grandCote:number, minPx:number, titre:string, detail:string}|null}
 *          null si l'image est assez grande, ou si on n'a pas pu la mesurer.
 */
export function avertissementTaille(dims, minPx, quoi = 'photo') {
  if (!dims) return null
  const w = Number(dims.w)
  const h = Number(dims.h)
  // ⚠️ `Number(null)` vaut 0 et passerait un test « > 0 » écrit à l'envers.
  // On teste des nombres finis et strictement positifs, rien d'autre.
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null

  const grandCote = Math.max(w, h)
  if (grandCote >= minPx) return null

  const estLogo = quoi === 'logo'
  return {
    grandCote,
    minPx,
    titre: estLogo
      ? `Logo un peu petit : ${grandCote} px`
      : `Photo un peu petite : ${grandCote} px`,
    detail: estLogo
      ? `Il en faudrait ${minPx} pour qu'il reste net sur la vignette de ta fiche. `
        + `On le garde. Si tu as le fichier d'origine de ton logo, il vaudra mieux que celui-ci.`
      : `Il en faudrait ${minPx} pour qu'elle reste nette sur ta fiche. `
        + `On la garde. Reprends-la depuis ton téléphone si tu peux : Facebook et `
        + `les conversations réduisent les images qu'on y récupère.`,
  }
}

/**
 * Contrôles qui BLOQUENT vraiment : un fichier qui n'est pas une image, ou
 * trop lourd pour être téléversé. La taille en pixels n'en fait plus partie.
 *
 * @returns {string|null} le message de refus, ou null si le fichier passe.
 */
export function refusFichierImage(file, { maxMo = 15 } = {}) {
  if (!file) return 'Aucun fichier.'
  // ⚠️ TOUT `image/*`, ET PAS UNE LISTE DE TROIS FORMATS. Le signup n'acceptait
  // que jpeg/png/webp là où le tableau de bord accepte tout : un iPhone qui
  // remonte un HEIC se serait fait refuser à l'inscription et accepter le
  // lendemain. Ce que le navigateur ne sait pas décoder est attrapé plus loin,
  // par la mesure, qui rend `null` et donne un message clair.
  if (!/^image\//.test(file.type || '')) {
    return 'Ce fichier n\'est pas une image. Choisis une photo JPG, PNG ou WEBP.'
  }
  if (file.size > maxMo * 1024 * 1024) {
    return `Fichier trop lourd. Maximum ${maxMo} Mo.`
  }
  return null
}

/**
 * Mesure un fichier image. Demande le DOM, donc jamais appelée par le banc.
 * @returns {Promise<{w:number,h:number}|null>} null si l'image est illisible.
 */
export async function mesurerFichierImage(file) {
  if (typeof window === 'undefined' || !file) return null
  const url = URL.createObjectURL(file)
  try {
    return await new Promise(resolve => {
      const img = new window.Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Résumé pour l'écran de validation admin : combien d'images sont sous leur
 * taille conseillée, et laquelle est la plus petite.
 *
 * ⚠️ IL COMPTE, IL NE SE CONTENTE PAS DE SIGNALER. Un « une image est petite »
 * sur une fiche qui en porte six ne dit pas s'il faut en reprendre une ou six.
 *
 * @param {Array<{libelle:string, dims:{w:number,h:number}|null, quoi?:string}>} images
 */
export function bilanTaillesImages(images) {
  const petites = []
  for (const img of images || []) {
    const quoi = img.quoi === 'logo' ? 'logo' : 'photo'
    const av = avertissementTaille(img.dims, TAILLE_CONSEILLEE[quoi], quoi)
    if (av) petites.push({ libelle: img.libelle, grandCote: av.grandCote, minPx: av.minPx })
  }
  if (petites.length === 0) return null
  petites.sort((a, b) => a.grandCote - b.grandCote)
  const plusPetite = petites[0]
  return {
    nb: petites.length,
    petites,
    texte: petites.length === 1
      ? `1 image sous la taille conseillée : ${plusPetite.libelle} (${plusPetite.grandCote} px, il en faudrait ${plusPetite.minPx}).`
      : `${petites.length} images sous la taille conseillée, la plus petite est ${plusPetite.libelle} (${plusPetite.grandCote} px).`,
  }
}
