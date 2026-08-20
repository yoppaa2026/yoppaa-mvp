'use client'
// ════════════════════════════════════════════════════════════════════
// BRAND KIT YOPPAA — la totale, prête à télécharger
//
// URL : yoppaa.app/brand-kit
//
// Contient :
//   - 5 variantes du logo complet (foncé, clair, mono noir/blanc/main)
//   - Logo dots seuls (favicon)
//   - 8 formats réseaux sociaux pré-templatés
//
// Tous téléchargeables en SVG + PNG.
//
// Note police : SVG embarque référence Google Fonts Plus Jakarta Sans.
// Pour print/broderie, ouvrir dans Illustrator/Inkscape et faire
// "Convert text to outlines" (Cmd+Shift+O sur Illustrator).
// ════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { Check, AlertTriangle, X } from 'lucide-react'

const T = {
  ink:    '#1A0840',
  panel:  '#160636',
  deep:   '#2D0F6B',
  main:   '#6B35C4',
  mid:    '#9660E0',
  light:  '#C4A0F4',
  pale:   '#EDE0FF',
  bg:     '#F8F6FF',
  muted:  '#6B7280',
}

// ────────── PALETTES PAR MODE ──────────
// slogan = couleur du slogan (sentence case, Jakarta 500)
const PALETTES = {
  dark:       { yo: '#FFFFFF', pp: T.light, aa: T.mid,  d1: '#FFFFFF', d2: T.light, d3: T.light, d4: T.mid,   d5: T.mid,   bg: T.ink,   slogan: T.light },
  light:      { yo: T.ink,     pp: T.main,  aa: T.mid,  d1: T.ink,     d2: T.main,  d3: T.main,  d4: T.mid,   d5: T.mid,   bg: '#FFFFFF', slogan: T.main },
  monoBlack:  { yo: '#000',    pp: '#000',  aa: '#000', d1: '#000',    d2: '#000',  d3: '#000',  d4: '#000',  d5: '#000',  bg: '#FFFFFF', slogan: '#000' },
  monoWhite:  { yo: '#FFFFFF', pp: '#fff',  aa: '#fff', d1: '#fff',    d2: '#fff',  d3: '#fff',  d4: '#fff',  d5: '#fff',  bg: T.ink,   slogan: '#FFFFFF' },
  monoMain:   { yo: T.main,    pp: T.main,  aa: T.main, d1: T.main,    d2: T.main,  d3: T.main,  d4: T.main,  d5: T.main,  bg: '#FFFFFF', slogan: T.main },
}

const SLOGAN_TEXT = 'Ton quartier dans ta poche'

// ────────── GÉNÉRATEUR DE SVG LOGO COMPLET ──────────
// viewBox = 440 × 240 sans slogan, 440 × 295 avec slogan
function generateLogoSvg(palette, includeBg = false, fontDataUrls = {}, withSlogan = false) {
  const { w800, w600 } = fontDataUrls
  let fontFaceStyle = ''
  if (w800 && (w600 || !withSlogan)) {
    fontFaceStyle = `@font-face { font-family: 'Plus Jakarta Sans'; font-weight: 800; font-style: normal; src: url('${w800}') format('woff2'); }`
    if (withSlogan && w600) {
      fontFaceStyle += ` @font-face { font-family: 'Plus Jakarta Sans'; font-weight: 600; font-style: normal; src: url('${w600}') format('woff2'); }`
    }
  } else {
    fontFaceStyle = withSlogan
      ? `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap');`
      : `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@800&display=swap');`
  }
  const height = withSlogan ? 305 : 240
  const bgRect = includeBg ? `<rect width="440" height="${height}" fill="${palette.bg}"/>` : ''
  const sloganText = withSlogan
    ? `<text x="220" y="272" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="600" font-size="26" letter-spacing="0.3" text-anchor="middle" fill="${palette.slogan}">${SLOGAN_TEXT}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 ${height}" preserveAspectRatio="xMidYMid meet" width="440" height="${height}">
  <defs>
    <style>${fontFaceStyle}</style>
  </defs>
  ${bgRect}
  <text x="220" y="120" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="800" font-size="110" letter-spacing="-5.5" text-anchor="middle">
    <tspan fill="${palette.yo}">yo</tspan><tspan fill="${palette.pp}">pp</tspan><tspan fill="${palette.aa}">aa</tspan>
  </text>
  <g transform="translate(131.8, 160)">
    <circle cx="14" cy="14" r="14" fill="${palette.d1}"/>
    <circle cx="51.1" cy="21.7" r="7.7" fill="${palette.d2}"/>
    <circle cx="88.2" cy="25.2" r="14" fill="${palette.d3}"/>
    <circle cx="125.3" cy="21.7" r="7.7" fill="${palette.d4}"/>
    <circle cx="162.4" cy="14" r="14" fill="${palette.d5}"/>
  </g>
  ${sloganText}
</svg>`
}

// ────────── GÉNÉRATEUR DE SVG DOTS SEULS (V2-B) ──────────
// viewBox = 200 × 50 (pas de texte, donc pas de problème de police)
function generateDotsSvg(palette, includeBg = false) {
  const bgRect = includeBg ? `<rect width="200" height="50" fill="${palette.bg}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50" preserveAspectRatio="xMidYMid meet" width="200" height="50">
  ${bgRect}
  <g transform="translate(12, 7)">
    <circle cx="14" cy="14" r="14" fill="${palette.d1}"/>
    <circle cx="51.1" cy="21.7" r="7.7" fill="${palette.d2}"/>
    <circle cx="88.2" cy="25.2" r="14" fill="${palette.d3}"/>
    <circle cx="125.3" cy="21.7" r="7.7" fill="${palette.d4}"/>
    <circle cx="162.4" cy="14" r="14" fill="${palette.d5}"/>
  </g>
</svg>`
}

// ────────── GÉNÉRATEUR FORMATS RÉSEAUX SOCIAUX ──────────
function generateSocialSvg(width, height, palette, options = {}) {
  const { logoScale = 1, gradient = false, fontDataUrls = {}, withSlogan = false } = options
  const { w800, w600 } = fontDataUrls
  let fontFaceStyle = ''
  if (w800 && (w600 || !withSlogan)) {
    fontFaceStyle = `@font-face { font-family: 'Plus Jakarta Sans'; font-weight: 800; font-style: normal; src: url('${w800}') format('woff2'); }`
    if (withSlogan && w600) {
      fontFaceStyle += ` @font-face { font-family: 'Plus Jakarta Sans'; font-weight: 600; font-style: normal; src: url('${w600}') format('woff2'); }`
    }
  } else {
    fontFaceStyle = withSlogan
      ? `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap');`
      : `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@800&display=swap');`
  }

  const bg = gradient
    ? `<defs><linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${T.ink}"/><stop offset="100%" stop-color="${T.main}"/></linearGradient></defs><rect width="${width}" height="${height}" fill="url(#bgGrad)"/>`
    : `<rect width="${width}" height="${height}" fill="${palette.bg}"/>`

  // Logo dimensions (sans slogan : 360 × 220 · avec slogan : 360 × 295)
  const logoHeight = (withSlogan ? 280 : 220) * logoScale
  const logoY = (height - logoHeight) / 2
  const fontSize = 110 * logoScale
  const wordmarkX = width / 2
  const wordmarkY = logoY + (110 * logoScale)
  const dotsX = (width - 176.4 * logoScale) / 2
  const dotsY = logoY + (145 * logoScale)
  const dotsScale = logoScale

  const sloganSize = 26 * logoScale
  const sloganY = logoY + (260 * logoScale)
  const sloganText = withSlogan
    ? `<text x="${wordmarkX}" y="${sloganY}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="600" font-size="${sloganSize}" letter-spacing="${0.3 * logoScale}" text-anchor="middle" fill="${palette.slogan}">${SLOGAN_TEXT}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>${fontFaceStyle}</style>
  </defs>
  ${bg}
  <text x="${wordmarkX}" y="${wordmarkY}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="800" font-size="${fontSize}" letter-spacing="${-5.5 * logoScale}" text-anchor="middle">
    <tspan fill="${palette.yo}">yo</tspan><tspan fill="${palette.pp}">pp</tspan><tspan fill="${palette.aa}">aa</tspan>
  </text>
  <g transform="translate(${dotsX}, ${dotsY}) scale(${dotsScale})">
    <circle cx="14" cy="14" r="14" fill="${palette.d1}"/>
    <circle cx="51.1" cy="21.7" r="7.7" fill="${palette.d2}"/>
    <circle cx="88.2" cy="25.2" r="14" fill="${palette.d3}"/>
    <circle cx="125.3" cy="21.7" r="7.7" fill="${palette.d4}"/>
    <circle cx="162.4" cy="14" r="14" fill="${palette.d5}"/>
  </g>
  ${sloganText}
</svg>`
}

// ────────── GÉNÉRATEUR MARKETING (cover FB Tribu + posts FB) ──────────
// Composition adaptee : texte titre/sous-titre/signature + footer optionnel.
// avatarSafe=true : decale tout le contenu a droite (ou utilise la moitie
// droite du canvas pour la cover FB 1640x624 dont l'avatar mange ~340x340
// en bas-gauche).
function wrapText(text, maxChars) {
  if (!text) return []
  const words = text.split(' ')
  const lines = []
  let current = ''
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (candidate.length > maxChars && current) {
      lines.push(current)
      current = word
    } else {
      current = candidate
    }
  }
  if (current) lines.push(current)
  return lines
}

function generateMarketingSvg(width, height, options = {}) {
  const {
    titre = '',
    sousTitre = '',
    showFooter = true,
    fontDataUrls = {},
    avatarSafe = false,
    bigDotsSignature = false,
    bigCenter = false, // teaser-style : pas de texte, juste dots geants au centre
    coverFBLayout = false, // safe zone FB cover (top only, marges horizontales)
  } = options
  const { w800, w600 } = fontDataUrls

  let fontFaceStyle = ''
  if (w800 && w600) {
    fontFaceStyle = `@font-face { font-family: 'Plus Jakarta Sans'; font-weight: 800; font-style: normal; src: url('${w800}') format('woff2'); }`
    fontFaceStyle += ` @font-face { font-family: 'Plus Jakarta Sans'; font-weight: 600; font-style: normal; src: url('${w600}') format('woff2'); }`
  } else {
    fontFaceStyle = `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;800&display=swap');`
  }

  // Fond : gradient diagonal Yoppaa + halo violet haut-droit
  const bg = `
    <defs>
      <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${T.ink}"/>
        <stop offset="50%" stop-color="${T.deep}"/>
        <stop offset="100%" stop-color="${T.main}"/>
      </linearGradient>
      <radialGradient id="halo" cx="0.85" cy="0.15" r="0.55">
        <stop offset="0%" stop-color="${T.light}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${T.light}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>
    <rect width="${width}" height="${height}" fill="url(#halo)"/>
  `

  // Layout : si avatarSafe, on reserve 380px en bas-gauche pour l'avatar FB
  // mais on garde le contenu centre horizontalement et decale legerement vers
  // le haut pour ne pas se chevaucher avec la zone avatar.
  const avatarReserveW = avatarSafe ? Math.min(380, width * 0.23) : 0
  const contentCenterX = avatarSafe ? avatarReserveW + (width - avatarReserveW) / 2 : width / 2
  const contentW = avatarSafe ? width - avatarReserveW - 40 : width - 80

  // Mode coverFBLayout (cover Facebook 1640x624) : composition finale validee
  // par Alex 19/06. Texte CENTRE horizontalement et verticalement (avatar bas-
  // gauche sur desktop ET mobile FB reel = ne chevauche pas le centre du
  // canvas). Pas de dots redondants. Pas de sous-titre obligatoire (rester
  // evasif au lancement, ajouter du contenu plus tard).
  if (coverFBLayout) {
    const safeMargin = 100
    const cx = width / 2
    const cy = height / 2
    const safeW = width - safeMargin * 2
    const titreSize = 96
    const sousTitreSize = 36
    const lineH = titreSize * 1.1
    const subLineH = sousTitreSize * 1.4
    const charsLigne = Math.max(16, Math.round(safeW / (titreSize * 0.5)))
    const subCharsLigne = Math.max(32, Math.round(safeW / (sousTitreSize * 0.5)))
    const tLines = wrapText(titre, charsLigne)
    const stLines = sousTitre ? wrapText(sousTitre, subCharsLigne) : []
    const titreBlocH = tLines.length * lineH
    const sousTitreBlocH = stLines.length * subLineH
    const gap = stLines.length > 0 ? 30 : 0
    const totalH = titreBlocH + (stLines.length > 0 ? gap + sousTitreBlocH : 0)
    const startY = cy - totalH / 2
    const tSVG = tLines.map((line, i) =>
      `<text x="${cx}" y="${startY + (i + 1) * lineH * 0.92}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="800" font-size="${titreSize}" letter-spacing="${-titreSize * 0.05}" text-anchor="middle" fill="#FFFFFF">${escapeXml(line)}</text>`
    ).join('')
    const stStartY = startY + titreBlocH + gap + sousTitreSize
    const stSVG = stLines.map((line, i) =>
      `<text x="${cx}" y="${stStartY + i * subLineH}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="600" font-size="${sousTitreSize}" letter-spacing="0.3" text-anchor="middle" fill="${T.light}">${escapeXml(line)}</text>`
    ).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><style>${fontFaceStyle}</style></defs>
  ${bg}
  ${tSVG}
  ${stSVG}
</svg>`
  }

  // Mode bigCenter (teaser) : wordmark "yoppaa" + dots V2-B + "Bientot..."
  // PROPORTIONS CANONIQUES YoppaaLogo (memory project-logo-dots-v2b 12/06) :
  // - dotBase   = wordmarkSize * 0.254  (28/110 dans la spec SVG)
  // - dotMini   = dotBase * 0.55
  // - dotGap    = dotBase * 0.55
  // - dotOffset = dotBase * 0.4  (sourire)
  // - wordmarkToDots >= 0.28 * wordmarkSize (eviter chevauchement descenders)
  // RÈGLE A RESPECTER PARTOUT ou les dots sont sous le wordmark.
  if (bigCenter) {
    // Fond specifique teaser : gradient radial centre (pas le gradient diagonal
    // partage qui creait une perception de "bandes" sur fond FB). Centre lumineux
    // deep, bords plus sombres ink. Effet de vignette inversee subtile.
    const bgTeaser = `
      <defs>
        <radialGradient id="teaserBg" cx="0.5" cy="0.5" r="0.75">
          <stop offset="0%" stop-color="${T.deep}"/>
          <stop offset="100%" stop-color="${T.ink}"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#teaserBg)"/>
    `
    // 1) Wordmark comme reference. Reduit de 0.28 a 0.22 * min(w,h) pour avoir
    //    une marge confortable aux bords (largeur visuelle ~67% au lieu de 85%).
    const wordmarkSize = Math.min(width, height) * 0.22
    // 2) Dots = wordmarkSize * 0.254 (RATIO CANONIQUE STRICT, spec V2-B)
    const dotBase = wordmarkSize * 0.254
    const dotMini = dotBase * 0.55
    const dotGap = dotBase * 0.55
    const dotOffset = dotBase * 0.4
    const dotsTotalW = 3 * dotBase + 2 * dotMini + 4 * dotGap
    const dotsBlockH = dotBase + dotOffset
    // 3) Texte teaser et gaps proportionnels au wordmark
    const wordmarkToDots = wordmarkSize * 0.28
    const dotsToBientot = wordmarkSize * 0.40
    const bientotSize = wordmarkSize * 0.20
    // 4) Centrage vertical de l'ensemble
    const totalH = wordmarkSize + wordmarkToDots + dotsBlockH + dotsToBientot + bientotSize
    const startY = (height - totalH) / 2
    const wordmarkY = startY + wordmarkSize * 0.85
    const dotsY = startY + wordmarkSize + wordmarkToDots
    const bientotY = dotsY + dotsBlockH + dotsToBientot + bientotSize * 0.85
    const dotsStartX = (width - dotsTotalW) / 2
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><style>${fontFaceStyle}</style></defs>
  ${bgTeaser}
  <text x="${width/2}" y="${wordmarkY}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="800" font-size="${wordmarkSize}" letter-spacing="${-wordmarkSize * 0.05}" text-anchor="middle">
    <tspan fill="#FFFFFF">yo</tspan><tspan fill="${T.light}">pp</tspan><tspan fill="${T.mid}">aa</tspan>
  </text>
  ${renderDotsV2B(dotsStartX, dotsY, dotBase, ['#FFFFFF', T.light, T.light, T.mid, T.mid])}
  <text x="${width/2}" y="${bientotY}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="600" font-size="${bientotSize}" letter-spacing="0.5" text-anchor="middle" fill="${T.light}">Bient&#244;t&#8230;</text>
</svg>`
  }

  // Polices auto-adaptatives + wrap. Pour posts FB 1080x1080 carres on veut
  // un titre VRAIMENT gros et visible (Insta-style). titreSize remonte de
  // 0.055*w (90px) a 0.085*w (95-110px pour 1080+) et plafond 130px.
  const titreSize = Math.min(width * 0.085, height * 0.16, 130)
  const sousTitreSize = titreSize * 0.36
  const lineH = titreSize * 1.1

  const charsParLigne = Math.max(10, Math.round(contentW / (titreSize * 0.5)))
  const titreLines = wrapText(titre, charsParLigne)
  const sousTitreLines = wrapText(sousTitre, Math.max(20, Math.round(contentW / (sousTitreSize * 0.5))))

  // Calcul vertical : bloc texte centre, footer dots+slogan en bas
  const titreBlocH = titreLines.length * lineH
  const sousTitreBlocH = sousTitre ? sousTitreLines.length * sousTitreSize * 1.4 + 30 : 0
  const blocTotalH = titreBlocH + sousTitreBlocH
  const blocStartY = (height - blocTotalH) / 2 - (showFooter ? 30 : 0)

  const titreSVG = titreLines.map((line, i) =>
    `<text x="${contentCenterX}" y="${blocStartY + (i + 1) * lineH * 0.92}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="800" font-size="${titreSize}" letter-spacing="${-titreSize * 0.05}" text-anchor="middle" fill="#FFFFFF">${escapeXml(line)}</text>`
  ).join('')

  const sousTitreStartY = blocStartY + titreBlocH + 40
  const sousTitreSVG = sousTitre ? sousTitreLines.map((line, i) =>
    `<text x="${contentCenterX}" y="${sousTitreStartY + i * sousTitreSize * 1.4}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="600" font-size="${sousTitreSize}" letter-spacing="0.2" text-anchor="middle" fill="${T.light}">${escapeXml(line)}</text>`
  ).join('') : ''

  // Footer : 5 dots V2-B + slogan
  let footerSVG = ''
  if (showFooter) {
    const dotBase = bigDotsSignature ? 28 : 18
    const dotMini = dotBase * 0.55
    const dotGap = dotBase * 0.55
    const dotOffset = dotBase * 0.4
    const dotsTotalW = 3 * dotBase + 2 * dotMini + 4 * dotGap
    const dotsY = height - 90
    const dotsStartX = contentCenterX - dotsTotalW / 2
    const sloganY = dotsY + dotBase + dotOffset + dotBase * 1.6
    const sloganSize = dotBase * 0.95
    footerSVG = `
      ${renderDotsV2B(dotsStartX, dotsY, dotBase, ['#FFFFFF', T.light, T.light, T.mid, T.mid])}
      <text x="${contentCenterX}" y="${sloganY}" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-weight="600" font-size="${sloganSize}" letter-spacing="0.3" text-anchor="middle" fill="${T.light}" opacity="0.9">Ton quartier dans ta poche</text>
    `
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs><style>${fontFaceStyle}</style></defs>
  ${bg}
  ${titreSVG}
  ${sousTitreSVG}
  ${footerSVG}
</svg>`
}

// Dots V2-B en SVG pur (5 dots maillon avec sourire). Couleurs passees en
// array : [d1 grand, d2 mini, d3 grand, d4 mini, d5 grand].
function renderDotsV2B(startX, topY, base, colors) {
  const mini = base * 0.55
  const gap = base * 0.55
  const offset = base * 0.4
  let x = startX
  const c1 = `<circle cx="${x + base/2}" cy="${topY + base/2}" r="${base/2}" fill="${colors[0]}"/>`
  x += base + gap
  const c2 = `<circle cx="${x + mini/2}" cy="${topY + offset + mini/2}" r="${mini/2}" fill="${colors[1]}"/>`
  x += mini + gap
  const c3 = `<circle cx="${x + base/2}" cy="${topY + offset + base/2}" r="${base/2}" fill="${colors[2]}"/>`
  x += base + gap
  const c4 = `<circle cx="${x + mini/2}" cy="${topY + offset + mini/2}" r="${mini/2}" fill="${colors[3]}"/>`
  x += mini + gap
  const c5 = `<circle cx="${x + base/2}" cy="${topY + base/2}" r="${base/2}" fill="${colors[4]}"/>`
  return c1 + c2 + c3 + c4 + c5
}

// Echappe les caracteres XML reserves dans le texte SVG.
function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ────────── DOWNLOAD HELPERS ──────────
function downloadSvg(svgString, filename) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 100)
}

function downloadPng(svgString, filename, width, height) {
  // Encoder via data URL plutôt que blob URL — meilleur support du @font-face dans canvas
  const encoded = encodeURIComponent(svgString).replace(/'/g, '%27').replace(/"/g, '%22')
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encoded}`
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    try {
      canvas.toBlob(b => {
        if (!b) {
          fallbackToConverter(svgString, filename)
          return
        }
        const dlUrl = URL.createObjectURL(b)
        const a = document.createElement('a')
        a.href = dlUrl
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(dlUrl), 100)
      }, 'image/png', 1)
    } catch (e) {
      fallbackToConverter(svgString, filename)
    }
  }
  img.onerror = () => fallbackToConverter(svgString, filename)
  img.src = dataUrl
}

function fallbackToConverter(svgString, filename) {
  // Fallback : télécharger le SVG et ouvrir un convertisseur en ligne
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.replace('.png', '.svg')
  a.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    if (confirm('PNG indisponible dans ce navigateur (limite de sécurité sur les polices). Le SVG a été téléchargé. Ouvrir CloudConvert pour le convertir en PNG ?')) {
      window.open('https://cloudconvert.com/svg-to-png', '_blank')
    }
  }, 200)
}

// ────────── CARD GÉNÉRIQUE ──────────
function AssetCard({ title, sub, svgString, svgStringForPng, previewBg, filename, pngSize, dark = false }) {
  // Si pas de version PNG dédiée, on utilise la même que pour SVG (avec fond)
  const pngSvg = svgStringForPng || svgString
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 18, border: `1px solid ${T.pale}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: previewBg, borderRadius: 10, padding: dark ? 14 : 14, minHeight: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', border: previewBg === '#FFFFFF' ? `1px solid ${T.pale}` : 'none' }}
        dangerouslySetInnerHTML={{ __html: svgString.replace(/width="\d+"/, 'width="240"').replace(/height="\d+"/, 'height="auto"') }}
      />
      <div>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.deep, letterSpacing: '0.3px' }}>{title}</p>
        {sub && <p style={{ margin: '3px 0 0', fontSize: 10, color: T.muted, fontFamily: 'monospace' }}>{sub}</p>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => downloadSvg(svgString, `${filename}.svg`)}
          style={{ flex: 1, padding: '8px 12px', background: T.main, color: '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}>
          ↓ SVG
        </button>
        <button onClick={() => downloadPng(pngSvg, `${filename}.png`, pngSize.w, pngSize.h)}
          style={{ flex: 1, padding: '8px 12px', background: T.deep, color: '#fff', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}>
          ↓ PNG {pngSize.w}px
        </button>
      </div>
    </div>
  )
}

export default function BrandKit() {
  // Charger Plus Jakarta Sans 800 + 500 en data URL (pour PNG conversion sans CORS)
  const [fontDataUrls, setFontDataUrls] = useState({ w800: null, w600: null })
  const [fontStatus, setFontStatus] = useState('loading')
  const [withSlogan, setWithSlogan] = useState(false)

  useEffect(() => {
    const fetchFont = (weight) =>
      fetch(`https://cdn.jsdelivr.net/npm/@fontsource/plus-jakarta-sans@5.0.20/files/plus-jakarta-sans-latin-${weight}-normal.woff2`)
        .then(r => {
          if (!r.ok) throw new Error('Font fetch ' + r.status)
          return r.blob()
        })
        .then(blob => new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result)
          reader.onerror = () => reject(new Error('FileReader'))
          reader.readAsDataURL(blob)
        }))

    Promise.all([fetchFont(800), fetchFont(600)])
      .then(([w800, w600]) => {
        setFontDataUrls({ w800, w600 })
        setFontStatus('ready')
      })
      .catch(err => {
        console.error('Font load failed:', err)
        setFontStatus('fallback')
      })
  }, [])

  // ────────── ASSETS LOGO COMPLET ──────────
  const logoAssets = [
    { mode: 'dark',      title: 'Logo principal (fond foncé)',   sub: 'blanc · light · mid · à utiliser sur fond ink ou photo sombre',  filename: 'yoppaa-logo-dark',       dark: true },
    { mode: 'light',     title: 'Logo principal (fond clair)',    sub: 'ink · main · mid · à utiliser sur fond blanc ou clair',         filename: 'yoppaa-logo-light' },
    { mode: 'monoBlack', title: 'Mono noir',                       sub: 'impression NB, fax, gravure',                                    filename: 'yoppaa-logo-mono-black' },
    { mode: 'monoWhite', title: 'Mono blanc',                       sub: 'sur photo sombre ou fond couleur intense',                       filename: 'yoppaa-logo-mono-white', dark: true },
    { mode: 'monoMain',  title: 'Mono violet (main)',               sub: 'signature couleur unique, broderie',                             filename: 'yoppaa-logo-mono-main' },
  ]

  // ────────── ASSETS DOTS SEULS ──────────
  const dotsAssets = [
    { mode: 'dark',     title: '5 dots V2-B (fond foncé)',  sub: 'favicon, signature compacte',  filename: 'yoppaa-dots-dark',      dark: true },
    { mode: 'light',    title: '5 dots V2-B (fond clair)',  sub: 'favicon clair, signature email', filename: 'yoppaa-dots-light' },
    { mode: 'monoMain', title: '5 dots mono violet',         sub: 'watermark, motif',               filename: 'yoppaa-dots-mono-main' },
  ]

  // ────────── ASSETS RÉSEAUX SOCIAUX ──────────
  const socialAssets = [
    { title: 'Avatar carré',         dims: { w: 1080, h: 1080 }, scale: 1.6, mode: 'dark', filename: 'yoppaa-avatar-1080', sub: 'Instagram, Twitter, Facebook · profil', gradient: false },
    { title: 'App icon',              dims: { w: 1024, h: 1024 }, scale: 1.6, mode: 'dark', filename: 'yoppaa-app-icon-1024', sub: 'iOS, Android · stores', gradient: true },
    { title: 'Stripe icon (512)',    dims: { w: 512,  h: 512 },  scale: 0.8, mode: 'dark', filename: 'yoppaa-stripe-icon-512', sub: 'Stripe Brand settings · portail + emails', gradient: true },
    { title: 'OG image (partage lien)', dims: { w: 1200, h: 630 },  scale: 1.4, mode: 'dark', filename: 'yoppaa-og-1200x630', sub: 'preview lien social, Slack, WhatsApp, Telegram', gradient: false },
    { title: 'Twitter header',       dims: { w: 1500, h: 500 },  scale: 1.3, mode: 'dark', filename: 'yoppaa-twitter-header', sub: 'bannière X/Twitter', gradient: true },
    { title: 'LinkedIn banner',      dims: { w: 1584, h: 396 },  scale: 1.1, mode: 'dark', filename: 'yoppaa-linkedin-1584x396', sub: 'bannière LinkedIn profil/page', gradient: false },
    { title: 'Instagram story',      dims: { w: 1080, h: 1920 }, scale: 1.5, mode: 'dark', filename: 'yoppaa-story-1080x1920', sub: 'IG Stories, TikTok, Snapchat', gradient: true },
    { title: 'Post carré 1080',      dims: { w: 1080, h: 1080 }, scale: 1.8, mode: 'dark', filename: 'yoppaa-post-1080', sub: 'feed Instagram, Facebook', gradient: false },
    { title: 'Avatar fond clair',    dims: { w: 1080, h: 1080 }, scale: 1.6, mode: 'light', filename: 'yoppaa-avatar-light-1080', sub: 'profil fond blanc, variante', gradient: false },
  ]

  // ────────── ASSETS MARKETING (cover FB Tribu + posts FB lancement) ──────────
  // 7 visuels prets a poster pour la sortie publique Yoppaa. Composition adaptee
  // a la zone safe avatar pour la cover FB (texte decale a droite).
  const marketingAssets = [
    {
      title: 'Cover FB · Lancement',
      dims: { w: 1640, h: 624 },
      filename: 'yoppaa-fb-cover-lancement-1640x624',
      sub: 'banniere FB · accroche centree, evasive (phase teasing)',
      options: {
        titre: "L'app belge du commerce local",
        sousTitre: '',
        coverFBLayout: true,
      },
    },
    {
      title: 'Post FB · Teaser',
      dims: { w: 1080, h: 1080 },
      filename: 'yoppaa-post-fb-teaser-1080',
      sub: 'serie lancement 1/6 · teaser dots geants',
      options: { bigCenter: true, showFooter: false },
    },
    {
      title: 'Post FB · Reveal',
      dims: { w: 1080, h: 1080 },
      filename: 'yoppaa-post-fb-reveal-1080',
      sub: 'serie lancement 2/6 · annonce officielle',
      options: {
        titre: "L'app belge du commerce local arrive.",
        sousTitre: 'Zéro commission Yoppaa sur tes ventes.',
        showFooter: true, bigDotsSignature: true,
      },
    },
    {
      title: 'Post FB · Pitch killer',
      dims: { w: 1080, h: 1080 },
      filename: 'yoppaa-post-fb-pitch-1080',
      sub: 'serie lancement 3/6 · differenciation Appetito',
      options: {
        titre: 'Yoppaa ne prend rien sur tes ventes.',
        sousTitre: "19,90 EUR HTVA / mois, c'est tout.",
        showFooter: true, bigDotsSignature: true,
      },
    },
    {
      title: 'Post FB · Tribu',
      dims: { w: 1080, h: 1080 },
      filename: 'yoppaa-post-fb-tribu-1080',
      sub: 'serie lancement 4/6 · communaute',
      options: {
        titre: 'Rejoins la tribu Yoppaa',
        sousTitre: 'Tu commences ici. Avec ceux d\'à côté.',
        showFooter: true, bigDotsSignature: true,
      },
    },
    {
      title: 'Post FB · Commerçants',
      dims: { w: 1080, h: 1080 },
      filename: 'yoppaa-post-fb-commercants-1080',
      sub: 'série lancement 5/6 · appel aux commerçants',
      options: {
        // ⚠️ ACCENTS RÉTABLIS. Ce texte part sur Facebook tel quel : « Tu es
        // commercant ? » sans cédille est une faute PUBLIÉE, sur un visuel qui
        // sert justement à convaincre des commerçants.
        titre: 'Tu es commerçant ?',
        sousTitre: 'Crée ta fiche Yoppaa en 5 minutes sur www.yoppaa.app',
        showFooter: true, bigDotsSignature: true,
      },
    },
    {
      // Demandé par Alex le 20/08 : inviter les commerçants et annoncer
      // l'offre de lancement.
      // ⚠️ « quel que soit le forfait » est la promesse exacte : les 90 jours
      // valent aussi pour Exister, qui est déjà gratuit. C'est donc bien
      // 90 jours offerts sur Communiquer et sur Vendre, et il ne faut pas
      // laisser croire qu'un palier en serait exclu.
      // ⚠️ Et JAMAIS « 100 % te revient » : la formule vraie est qu'il n'y a
      // aucune commission, l'abonnement étant notre seul revenu. Les frais
      // bancaires, eux, restent ceux de la banque.
      title: 'Post FB · 90 jours offerts',
      dims: { w: 1080, h: 1080 },
      filename: 'yoppaa-post-fb-90-jours-1080',
      sub: 'offre de lancement · appel aux commerçants',
      options: {
        titre: '90 jours offerts.',
        // ⚠️ « Yoppaa ne prend » ET PAS « aucune commission » tout court : sans
        // sujet, la phrase se lit « aucun frais du tout », et c'est FAUX, les
        // frais bancaires restent ceux de la banque. Le banc l'a attrapée.
        sousTitre: 'Quel que soit le forfait. Yoppaa ne prend aucune commission sur tes ventes.',
        showFooter: true, bigDotsSignature: true,
      },
    },
    {
      title: 'Post FB · Yopper',
      dims: { w: 1080, h: 1080 },
      filename: 'yoppaa-post-fb-yopper-1080',
      sub: 'serie lancement 6/6 · CTA citoyens',
      options: {
        titre: 'Deviens Yopper.',
        sousTitre: 'Ton quartier dans ta poche. Télécharge gratuitement.',
        showFooter: true, bigDotsSignature: true,
      },
    },
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.bg, padding: '40px 20px 80px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* HEADER */}
        <div style={{ marginBottom: 32 }}>
          <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: T.main, letterSpacing: '2px', textTransform: 'uppercase' }}>Brand Kit · 2026-06-12</p>
          <h1 style={{ margin: '6px 0 8px', fontSize: 32, fontWeight: 900, color: T.ink, letterSpacing: '-1px' }}>
            La totale, prête à télécharger
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: T.muted, lineHeight: 1.5 }}>
            Logos officiels, dots seuls, formats réseaux sociaux. Tous en SVG (vectoriel scalable) et PNG.
          </p>
        </div>

        {/* TOGGLE AVEC / SANS SLOGAN */}
        <div style={{ background: '#fff', borderRadius: 14, padding: '14px 18px', marginBottom: 14, border: `1px solid ${T.pale}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.deep, letterSpacing: '0.3px' }}>
              Variante slogan
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: T.muted }}>
              {withSlogan ? 'Slogan « Ton quartier dans ta poche » affiché sous les dots' : 'Logo simple, sans slogan'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, background: T.bg, padding: 4, borderRadius: 10 }}>
            <button onClick={() => setWithSlogan(false)}
              style={{ padding: '8px 16px', background: !withSlogan ? T.main : 'transparent', color: !withSlogan ? '#fff' : T.deep, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}>
              Sans slogan
            </button>
            <button onClick={() => setWithSlogan(true)}
              style={{ padding: '8px 16px', background: withSlogan ? T.main : 'transparent', color: withSlogan ? '#fff' : T.deep, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px' }}>
              Avec slogan
            </button>
          </div>
        </div>

        {/* STATUT POLICE */}
        <div style={{ background: fontStatus === 'ready' ? '#ECFDF5' : fontStatus === 'fallback' ? '#FEF3C7' : T.pale, borderRadius: 12, padding: '12px 18px', marginBottom: 14, borderLeft: `4px solid ${fontStatus === 'ready' ? '#10B981' : fontStatus === 'fallback' ? '#F59E0B' : T.main}`, fontSize: 12, color: T.deep, lineHeight: 1.55 }}>
          {fontStatus === 'loading' && <p style={{ margin: 0 }}>⏳ Chargement de Plus Jakarta Sans (800 + 600) pour générer les PNG...</p>}
          {fontStatus === 'ready' && <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={15} strokeWidth={2.2} color="#10B981"/><strong>Polices prêtes</strong>. Les PNG seront générés avec Plus Jakarta Sans 800 (wordmark) et 600 (slogan).</p>}
          {fontStatus === 'fallback' && <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={15} strokeWidth={1.8}/><strong>Polices non chargées</strong>. Les PNG utiliseront une police système en fallback. Les SVG restent corrects.</p>}
        </div>

        {/* NOTE TECHNIQUE */}
        <div style={{ background: T.pale, borderRadius: 12, padding: '14px 18px', marginBottom: 32, borderLeft: `4px solid ${T.main}`, fontSize: 12, color: T.deep, lineHeight: 1.55 }}>
          <p style={{ margin: 0 }}>
            <strong>📌 Note :</strong> les SVG embarquent la police. Pour <strong>impression / broderie / gravure</strong>, ouvre le SVG dans Illustrator ou Inkscape puis fais <code>Texte → Vectoriser le texte</code> (Cmd+Shift+O sur Illustrator) avant export final. La police est aussi disponible gratuitement sur <a href="https://fonts.google.com/specimen/Plus+Jakarta+Sans" target="_blank" rel="noreferrer" style={{ color: T.main, fontWeight: 700 }}>fonts.google.com</a>.
          </p>
        </div>

        {/* SECTION 1 : LOGOS OFFICIELS */}
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
          1 · Logos officiels
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.muted }}>
          5 variantes. Toujours utiliser la version qui contraste avec son fond.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
          {logoAssets.map((a, i) => (
            <AssetCard
              key={i}
              title={a.title}
              sub={a.sub}
              svgString={generateLogoSvg(PALETTES[a.mode], false, {}, withSlogan)}
              svgStringForPng={generateLogoSvg(PALETTES[a.mode], true, fontDataUrls, withSlogan)}
              previewBg={PALETTES[a.mode].bg}
              filename={withSlogan ? `${a.filename}-slogan` : a.filename}
              pngSize={{ w: 1760, h: withSlogan ? 1220 : 960 }}
              dark={a.dark}
            />
          ))}
        </div>

        {/* SECTION 2 : DOTS SEULS */}
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
          2 · Dots seuls (V2-B)
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.muted }}>
          Pour favicon, watermark, motif décoratif.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
          {dotsAssets.map((a, i) => (
            <AssetCard
              key={i}
              title={a.title}
              sub={a.sub}
              svgString={generateDotsSvg(PALETTES[a.mode])}
              svgStringForPng={generateDotsSvg(PALETTES[a.mode], true)}
              previewBg={PALETTES[a.mode].bg}
              filename={a.filename}
              pngSize={{ w: 800, h: 200 }}
              dark={a.dark}
            />
          ))}
        </div>

        {/* SECTION 3 : RÉSEAUX SOCIAUX */}
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
          3 · Réseaux sociaux
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.muted }}>
          Formats officiels prêts à l&rsquo;emploi. PNG aux dimensions exactes recommandées par chaque plateforme.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
          {socialAssets.map((a, i) => (
            <AssetCard
              key={i}
              title={a.title}
              sub={`${a.dims.w}×${a.dims.h}px · ${a.sub}`}
              svgString={generateSocialSvg(a.dims.w, a.dims.h, PALETTES[a.mode], { logoScale: a.scale, gradient: a.gradient, fontDataUrls: {}, withSlogan })}
              svgStringForPng={generateSocialSvg(a.dims.w, a.dims.h, PALETTES[a.mode], { logoScale: a.scale, gradient: a.gradient, fontDataUrls, withSlogan })}
              previewBg={a.gradient ? `linear-gradient(135deg, ${T.ink}, ${T.main})` : PALETTES[a.mode].bg}
              filename={withSlogan ? `${a.filename}-slogan` : a.filename}
              pngSize={{ w: a.dims.w, h: a.dims.h }}
              dark={a.mode === 'dark' || a.mode === 'monoWhite' || a.gradient}
            />
          ))}
        </div>

        {/* SECTION 4 : MARKETING & COM (cover FB Tribu + posts FB) */}
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
          4 · Marketing &amp; com
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: T.muted }}>
          Cover Facebook avec safe zone avatar respect&eacute;e + s&eacute;rie de 6 posts pour le lancement. Tout prêt à uploader.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 40 }}>
          {marketingAssets.map((a, i) => (
            <AssetCard
              key={i}
              title={a.title}
              sub={`${a.dims.w}×${a.dims.h}px · ${a.sub}`}
              svgString={generateMarketingSvg(a.dims.w, a.dims.h, { ...a.options, fontDataUrls: {} })}
              svgStringForPng={generateMarketingSvg(a.dims.w, a.dims.h, { ...a.options, fontDataUrls })}
              previewBg={`linear-gradient(135deg, ${T.ink}, ${T.main})`}
              filename={a.filename}
              pngSize={{ w: a.dims.w, h: a.dims.h }}
              dark
            />
          ))}
        </div>

        {/* SECTION 5 : RÈGLES D'USAGE */}
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
          5 · Règles d&rsquo;usage
        </h2>
        <div style={{ background: '#fff', borderRadius: 12, padding: '20px 24px', border: `1px solid ${T.pale}`, fontSize: 13, color: T.deep, lineHeight: 1.7 }}>
          <p style={{ margin: '0 0 10px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Check size={16} strokeWidth={2.2} color="#10B981"/> À faire</p>
          <ul style={{ margin: '0 0 16px', paddingLeft: 20 }}>
            <li>Utiliser <strong>Plus Jakarta Sans 800</strong> avec letter-spacing <strong>-0,05em</strong></li>
            <li>Garder les dots V2-B <strong>en dessous</strong> du wordmark, jamais à côté ou au-dessus</li>
            <li>Respecter la cadence tricolore selon le fond (foncé : blanc-light-mid · clair : ink-main-mid)</li>
            <li>Conserver une marge minimale autour du logo équivalente à <strong>1 grand dot</strong> de hauteur</li>
            <li>Pour print/broderie : vectoriser le texte avant export</li>
          </ul>
          <p style={{ margin: '0 0 10px', fontWeight: 800, color: '#B91C1C', display: 'inline-flex', alignItems: 'center', gap: 6 }}><X size={16} strokeWidth={2.2}/> À ne jamais faire</p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>Changer la police, même temporairement</li>
            <li>Modifier les proportions des dots (toujours mini = 0,55 × grand)</li>
            <li>Mettre les dots au-dessus ou à côté du wordmark</li>
            <li>Ajouter un contour, une ombre ou un effet sur le logo</li>
            <li>Compresser ou déformer (toujours scale uniforme)</li>
            <li>Utiliser les variantes mono quand la tricolore est possible</li>
          </ul>
        </div>

        {/* FOOTER */}
        <div style={{ marginTop: 32, padding: '16px 20px', textAlign: 'center', fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>
          Spec figée le 2026-06-12 · wordmark Plus Jakarta Sans 800 + dots V2-B maillon (mini 0,55 · en dessous · décalage 25 %)
        </div>

      </div>
    </div>
  )
}
