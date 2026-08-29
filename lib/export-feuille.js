// ════════════════════════════════════════════════════════════════════
// EXPORTER UNE FEUILLE IMPRIMABLE EN SVG ET EN PNG.
//
// ⚠️ LE PRINCIPE : UNE SEULE SOURCE DE VÉRITÉ. On ne redessine RIEN. La page
// affichée à l'écran est sérialisée telle quelle dans un `<foreignObject>`,
// puis rastérisée pour le PNG. `lib/affiche-kit.js` redessine son affiche au
// canvas, et c'est un choix qu'on ne refait pas ici : chaque virgule du texte
// obligerait à retoucher du code de dessin, et les deux versions divergeraient
// au premier oubli. C'est exactement le défaut des « deux sources de vérité »
// déjà payé deux fois dans ce projet.
//
// 🔴 LA POLICE EST TOUT LE SUJET. `next/font` sert Plus Jakarta Sans depuis
// `/_next/static/media/*.woff2` : un SVG qui pointerait vers cette adresse
// s'afficherait, PARTOUT AILLEURS, dans une police de substitution plus large.
// C'est LE défaut qui a coûté trois allers-retours sur ce kit, et il serait
// SILENCIEUX : le fichier s'ouvrirait, il serait juste faux. On embarque donc
// les fontes en base64, et si on n'y arrive pas ON REFUSE D'EXPORTER.
// Un fichier muet vaut mieux qu'un fichier qui ment.
// ════════════════════════════════════════════════════════════════════

// 210 mm à 96 dpi, la résolution de référence du CSS.
export const DPI_ECRAN = 96
// 300 dpi : le standard d'un imprimeur. En dessous, un A4 tiré en nombre bave.
export const DPI_IMPRESSION = 300

const mmEnPx = (mm) => (mm / 25.4) * DPI_ECRAN

// ─── Embarquer les fontes ───────────────────────────────────────────────────

let cachePolices = null

// ⚠️ POUR LE BANC. Sans ce vidage, les vérifications deviendraient dépendantes
// de leur ORDRE : un test qui réussit à embarquer la police masquerait ensuite
// le test du refus. Un banc dont le résultat dépend de l'ordre finit par
// verdir pour de mauvaises raisons.
export function _oublierPolices() { cachePolices = null }

function base64(buffer) {
  const octets = new Uint8Array(buffer)
  let binaire = ''
  // ⚠️ PAR TRANCHES. `String.fromCharCode(...tableau)` sur une fonte de 20 ko
  // fait déborder la pile d'appels : le défaut n'apparaît que sur les gros
  // fichiers, donc jamais pendant qu'on écrit le code.
  const TRANCHE = 8192
  for (let i = 0; i < octets.length; i += TRANCHE) {
    binaire += String.fromCharCode.apply(null, octets.subarray(i, i + TRANCHE))
  }
  return btoa(binaire)
}

// Rend le CSS des `@font-face` avec les fontes en `data:`, ou `null` si aucune
// n'a pu être lue. ⚠️ `null` veut dire SANS OBJET, pas « vide » : l'appelant
// doit refuser l'export, pas continuer avec une chaîne vide.
export async function policesEmbarquees(familleRecherchee) {
  if (cachePolices !== null) return cachePolices

  const cle = String(familleRecherchee || '').split(',')[0].replace(/["']/g, '').trim()
  if (!cle) return null

  const regles = []
  for (const feuille of Array.from(document.styleSheets)) {
    let liste
    // ⚠️ Une feuille d'un autre domaine lève à la lecture. On passe, on ne
    // plante pas : les fontes qui nous intéressent sont servies par l'app.
    try { liste = feuille.cssRules } catch { continue }
    if (!liste) continue
    for (const r of Array.from(liste)) {
      if (r.type !== 5) continue  // CSSRule.FONT_FACE_RULE
      const famille = (r.style.getPropertyValue('font-family') || '').replace(/["']/g, '').trim()
      if (famille !== cle) continue
      regles.push(r)
    }
  }
  if (regles.length === 0) return null

  const morceaux = []
  for (const r of regles) {
    const src = r.style.getPropertyValue('src') || ''
    const adresse = /url\(["']?([^"')]+)["']?\)/.exec(src)?.[1]
    if (!adresse) continue
    try {
      const rep = await fetch(adresse)
      // ⚠️ `fetch` NE REJETTE PAS SUR UN CODE HTTP. Sans cette lecture, un 404
      // produirait une fonte faite de la page d'erreur, et le SVG s'ouvrirait
      // en police de substitution sans que rien ne l'ait signalé.
      if (!rep.ok) continue
      const donnees = base64(await rep.arrayBuffer())
      const poids = r.style.getPropertyValue('font-weight') || '400'
      const style = r.style.getPropertyValue('font-style') || 'normal'
      const plage = r.style.getPropertyValue('unicode-range')
      morceaux.push(
        `@font-face{font-family:'${cle}';font-style:${style};font-weight:${poids};` +
        `font-display:block;src:url(data:font/woff2;base64,${donnees}) format('woff2')` +
        `${plage ? `;unicode-range:${plage}` : ''}}`
      )
    } catch { /* une fonte manquante n'empêche pas les autres */ }
  }
  if (morceaux.length === 0) return null
  cachePolices = morceaux.join('\n')
  return cachePolices
}

// ─── La feuille en SVG ──────────────────────────────────────────────────────

export async function feuilleEnSvg(noeud, largeurMm, hauteurMm) {
  if (!noeud) throw new Error('Aucune feuille à exporter.')

  const calcule = getComputedStyle(noeud)
  const css = await policesEmbarquees(calcule.fontFamily)
  if (css === null) {
    // 🔴 LE REFUS EST LA BONNE RÉPONSE. Exporter ici produirait un fichier
    // d'apparence normale, dans la mauvaise police, et personne ne le verrait
    // avant l'imprimeur.
    throw new Error(
      'La police n’a pas pu être embarquée : le fichier s’ouvrirait dans une ' +
      'police de substitution. Export annulé.'
    )
  }

  const clone = noeud.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  // La variable `--font-jakarta` n'existe pas hors de l'app : on grave la
  // famille résolue. L'ombre portée et l'arrondi sont des artifices d'écran.
  clone.style.fontFamily = calcule.fontFamily
  clone.style.boxShadow = 'none'
  clone.style.borderRadius = '0'
  clone.style.margin = '0'

  const html = new XMLSerializer().serializeToString(clone)
  const l = Math.round(mmEnPx(largeurMm))
  const h = Math.round(mmEnPx(hauteurMm))

  // ⚠️ `<style>` EN CDATA : le CSS des fontes est du base64, donc sans `<` ni
  // `&`, mais un SVG est du XML et on ne laisse pas ça à la chance.
  // ⚠️ Le `box-sizing` est rappelé ici : hors de l'app, la remise à zéro de
  // Tailwind n'existe plus. Tout le reste de la page est en style en ligne,
  // qui l'emporte de toute façon sur cette feuille.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeurMm}mm" height="${hauteurMm}mm" viewBox="0 0 ${l} ${h}">
<style><![CDATA[
${css}
*{box-sizing:border-box}
]]></style>
<rect width="100%" height="100%" fill="#ffffff"/>
<foreignObject x="0" y="0" width="${l}" height="${h}">${html}</foreignObject>
</svg>`
}

// ─── Le SVG en PNG ──────────────────────────────────────────────────────────

export function svgEnPng(svgTexte, largeurMm, hauteurMm, dpi = DPI_IMPRESSION) {
  return new Promise((resolve, reject) => {
    const l = Math.round((largeurMm / 25.4) * dpi)
    const h = Math.round((hauteurMm / 25.4) * dpi)
    const img = new Image()
    img.onload = () => {
      try {
        const toile = document.createElement('canvas')
        toile.width = l
        toile.height = h
        const ctx = toile.getContext('2d')
        // ⚠️ LE FOND BLANC EST EXPLICITE. Une toile naît TRANSPARENTE, et un
        // PNG transparent posé sur un fond sombre par un imprimeur donnerait
        // du texte noir sur noir.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, l, h)
        ctx.drawImage(img, 0, 0, l, h)
        toile.toBlob(
          (b) => b ? resolve(b) : reject(new Error('L’image n’a pas pu être produite.')),
          'image/png'
        )
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('Le navigateur n’a pas su rendre le SVG.'))
    // ⚠️ UNE ADRESSE `data:` ET PAS UN `blob:`. Une image SVG chargée depuis un
    // `blob:` TEINTE la toile dans certains navigateurs, et `toBlob` lève
    // alors une erreur de sécurité. Le `data:` est du même document.
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgTexte)
  })
}

// ─── Le téléchargement ──────────────────────────────────────────────────────

export function telecharger(contenu, nomFichier, type) {
  const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  // ⚠️ On libère APRÈS un tour de boucle : révoquer dans la foulée annule le
  // téléchargement dans Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
