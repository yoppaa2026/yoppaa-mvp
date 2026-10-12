// LA STATION DU COMPTOIR, CÔTÉ TABLETTE (« Yoppaa Comptoir », 12/10).
//
// L'app Yoppaa Comptoir affiche le tableau de bord EN DIRECT : la boucle qui
// vide la file vit donc ici, dans le site, et une amélioration arrive sur les
// tablettes sans réinstaller l'APK. Elle ne s'active QUE dans l'app, quand
// l'extension Brother (`@rdlabo/capacitor-brotherprint`, nommée
// « BrotherPrint ») est présente.
//
// ⚠️ MODULE PUR : les options d'impression, la lecture des erreurs Brother,
// l'imprimante retenue. Le dessin vit dans `lib/etiquette-image.js`, la file
// côté serveur dans `lib/file-etiquettes.js`.

// La Brother QL-820NWBc, en Wi-Fi, sur le rouleau continu de 62 mm, coupé
// après chaque étiquette. Les noms sont ceux des énumérations de l'extension.
export const IMPRESSION_BROTHER = {
  modelName: 'QL_820NWB',
  labelName: 'RollW62',
  numberOfCopies: 1,
  autoCut: true,
}

// Le temps laissé à la Brother pour rendre une étiquette. Au-delà, elle est
// tenue pour injoignable (la file la reprendra, 90 s après sa prise).
export const DELAI_IMPRESSION_MS = 30 * 1000

// Ce que la tablette garde pour elle (réglage d'APPAREIL, pas du commerce).
export const CLE_APPAREIL = 'yoppaa_comptoir_appareil'
export const CLE_IMPRIMANTE = 'yoppaa_comptoir_imprimante'

/**
 * L'extension Brother, ou `null` (navigateur, PWA, app Yoppaa des clients).
 * ⚠️ LA PREUVE EST DANS `PluginHeaders`, comme pour la géolocalisation
 * (lib/geoloc.js, 02/10) : seul le code natif compilé dans l'app les publie.
 * Un objet du même nom posé par une page ne suffit pas.
 */
export function brotherNatif(fenetre) {
  try {
    const cap = fenetre?.Capacitor
    if (cap?.isNativePlatform?.() !== true) return null
    const compile = Array.isArray(cap.PluginHeaders) && cap.PluginHeaders.some((h) => h?.name === 'BrotherPrint')
    if (!compile) return null
    const b = cap.Plugins?.BrotherPrint
    return typeof b?.printImage === 'function' && typeof b?.addListener === 'function' ? b : null
  } catch {
    return null
  }
}

/** L'imprimante retenue est-elle utilisable (Wi-Fi + adresse) ? */
export function imprimanteValide(i) {
  return !!i && typeof i === 'object' && i.port === 'wifi' && typeof i.channelInfo === 'string' && i.channelInfo.trim().length > 0
}

/** Les options de `printImage` pour UNE étiquette (image en base64, sans en-tête). */
export function optionsImpression(imprimante, encodedImage) {
  if (!imprimanteValide(imprimante)) throw new Error('imprimante inconnue')
  if (typeof encodedImage !== 'string' || !encodedImage || encodedImage.startsWith('data:')) throw new Error('image invalide')
  return { ...IMPRESSION_BROTHER, encodedImage, port: imprimante.port, channelInfo: imprimante.channelInfo.trim() }
}

/**
 * La raison d'un échec rendu par la Brother, dans les mots de la file
 * (`RAISONS_ECHEC` de lib/file-etiquettes.js). Le SDK parle anglais et ses
 * codes varient d'un modèle à l'autre : on lit le message.
 * @param info   { message, code } de onPrintError / onPrintFailedCommunication
 * @param communication  vrai pour onPrintFailedCommunication
 */
export function raisonDepuisErreur(info, { communication = false } = {}) {
  const m = String(info?.message || '').toLowerCase()
  // Le SDK sépare ses mots par une espace, un tiret bas ou rien (ERROR_PAPER_EMPTY).
  if (/paper[ _-]?empty|no[ _-]?paper|out[ _-]?of[ _-]?paper|no[ _-]?media|media[ _-]?empty|papier/.test(m)) return 'papier'
  if (/cover|couvercle/.test(m)) return 'couvercle'
  if (/wrong[ _-]?(label|media|roll|paper)|label[ _-]?(mismatch|not[ _-]?match)|media[ _-]?mismatch|rouleau/.test(m)) return 'rouleau'
  if (communication || /communication|connect|timeout|time[ _-]?out|unreachable|socket|network|not[ _-]?found|offline/.test(m)) return 'injoignable'
  return 'autre'
}

/**
 * L'identifiant de CET appareil, lu ou créé une fois (navigateur seulement).
 * Envoyé avec l'état de la station : c'est lui qui dit « c'est cette tablette ».
 */
export function identifiantAppareil(stockage = globalThis.localStorage) {
  try {
    let id = stockage?.getItem(CLE_APPAREIL)
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) { id = nouvelIdentifiantAppareil(); stockage?.setItem(CLE_APPAREIL, id) }
    return id
  } catch {
    return null
  }
}

/** L'identifiant de CET appareil, créé une fois et gardé (8 à 64 caractères sûrs). */
export function nouvelIdentifiantAppareil(aleatoire = () => Math.random()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = 'tab-'
  for (let i = 0; i < 24; i++) id += alphabet[Math.floor(aleatoire() * alphabet.length) % alphabet.length]
  return id
}
