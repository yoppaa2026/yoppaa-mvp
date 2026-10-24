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

// La Brother sur le rouleau continu de 62 mm, coupé après chaque étiquette.
// Les noms sont ceux des énumérations de l'extension. Le modèle ci-dessous
// n'est que le défaut : celui de l'imprimante choisie le remplace
// (`modeleSdk`).
export const IMPRESSION_BROTHER = {
  modelName: 'QL_820NWB',
  labelName: 'RollW62',
  numberOfCopies: 1,
  autoCut: true,
}

// 🔴 LE MODÈLE SUIT L'IMPRIMANTE (Alex, 24/10 : QL-800 en USB au comptoir).
// Il partait toujours en « QL_820NWB » : une autre Brother recevait les
// réglages d'une machine qu'elle n'est pas. Les modèles 62 mm de l'énumération
// `PrinterModel` du SDK Brother 4.13.2. ⚠️ Aucun nom n'en contient un autre
// (« QL-810Wc » contient « QL_810W », jamais « QL_800 ») : un nom plus court
// ajouté ici avalerait les autres.
export const MODELES_BROTHER = ['QL_820NWB', 'QL_810W', 'QL_800']

/**
 * Le nom de modèle du SDK pour ce que la recherche a rendu : « QL-800 » →
 * « QL_800 », « QL-820NWBc » → « QL_820NWB ». Inconnu : le défaut, comme avant.
 */
export function modeleSdk(nom) {
  const n = String(nom || '').toUpperCase().replace(/[\s-]+/g, '_')
  return MODELES_BROTHER.find(m => n.includes(m)) || IMPRESSION_BROTHER.modelName
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

/**
 * L'imprimante retenue est-elle utilisable ? En Wi-Fi : une adresse. En USB
 * (24/10) : rien de plus, le SDK ouvre la Brother branchée sur la tablette.
 * ⚠️ Aucun autre port (Bluetooth) : la tablette ne demande rien de plus.
 */
export function imprimanteValide(i) {
  if (!i || typeof i !== 'object') return false
  if (i.port === 'usb') return true
  return i.port === 'wifi' && typeof i.channelInfo === 'string' && i.channelInfo.trim().length > 0
}

/** Les options de `printImage` pour UNE étiquette (image en base64, sans en-tête). */
export function optionsImpression(imprimante, encodedImage) {
  if (!imprimanteValide(imprimante)) throw new Error('imprimante inconnue')
  if (typeof encodedImage !== 'string' || !encodedImage || encodedImage.startsWith('data:')) throw new Error('image invalide')
  return {
    ...IMPRESSION_BROTHER,
    modelName: modeleSdk(imprimante.modelName),
    encodedImage,
    port: imprimante.port,
    channelInfo: typeof imprimante.channelInfo === 'string' ? imprimante.channelInfo.trim() : '',
  }
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
 * Ce que dit la tablette quand la recherche USB échoue (24/10). L'extension
 * rejette avec un texte anglais : on le lit, comme les erreurs d'impression.
 */
export function messageRechercheUsb(erreur) {
  const m = String(erreur?.message || erreur || '').toLowerCase()
  if (/not found/.test(m)) return 'Aucune imprimante branchée. Branche la Brother sur le hub, allume-la (voyant « Editor Lite » éteint), puis réessaie.'
  if (/already pending/.test(m)) return 'Une demande d’autorisation est déjà ouverte : réponds-y sur l’écran.'
  if (/receiver|permission|denied/.test(m)) return 'Autorise Yoppaa Comptoir à utiliser l’imprimante, puis touche encore « Chercher en USB ».'
  return 'La recherche USB n’a pas abouti. Débranche et rebranche la Brother, puis réessaie.'
}

/** La clé d'une imprimante trouvée : en USB, il n'y a pas toujours d'adresse. */
export function cleImprimante(p) {
  const port = p?.port === 'usb' ? 'usb' : 'wifi'
  return `${port}:${p?.channelInfo || p?.serialNumber || p?.modelName || ''}`
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
