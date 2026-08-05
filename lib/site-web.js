// Lire le site web d'un commerçant pour en tirer de la matière rédactionnelle.
//
// C'est une fonctionnalité utile ET une porte d'entrée classique : une adresse
// fournie par l'utilisateur, que le SERVEUR va chercher. Sans garde-fous, il
// suffit de donner http://169.254.169.254 pour faire lire à notre serveur les
// secrets de l'hébergeur, ou une adresse interne pour explorer le réseau. On
// vérifie donc où l'on va AVANT d'y aller, et on résout le nom pour vérifier
// que l'adresse obtenue est bien publique.

import dns from 'node:dns/promises'

export const TAILLE_MAX = 500 * 1024   // 500 Ko de HTML, largement suffisant
export const DELAI_MAX = 6000          // 6 s : au-delà, le commerçant attend pour rien

// Complète une saisie humaine : « boulangerie-dupont.be » est une URL valide
// pour un commerçant, pas pour un analyseur d'URL.
export function normaliserUrl(saisie) {
  const brut = String(saisie || '').trim()
  if (!brut) return null
  const avecSchema = /^https?:\/\//i.test(brut) ? brut : `https://${brut}`
  try {
    const u = new URL(avecSchema)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.')) return null   // « localhost », « intranet »
    return u.toString()
  } catch {
    return null
  }
}

// Une adresse IP privée, locale ou de service de métadonnées ne doit jamais
// être atteinte depuis notre serveur.
export function estIpPrivee(ip) {
  const v = String(ip || '')
  if (!v) return true
  if (v === '::1' || v.startsWith('fe80:') || v.startsWith('fc') || v.startsWith('fd')) return true
  const o = v.split('.').map(Number)
  if (o.length !== 4 || o.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true
  if (o[0] === 10) return true
  if (o[0] === 127) return true
  if (o[0] === 0) return true
  if (o[0] === 169 && o[1] === 254) return true            // lien-local + métadonnées cloud
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true
  if (o[0] === 192 && o[1] === 168) return true
  if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true // CGNAT
  return false
}

// Réduit une page HTML au texte qui sert : titre, description, contenu visible.
// Les scripts et les styles partent en premier, sinon ils remplissent la moitié
// du budget de l'IA avec du code.
export function texteUtile(html, maxCaracteres = 6000) {
  const source = String(html || '')
  const titre = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(source)?.[1] || ''
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(source)?.[1] || ''

  const corps = source
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

  const assemble = [titre.trim(), description.trim(), corps].filter(Boolean).join('. ')
  return assemble.slice(0, maxCaracteres)
}

// Va chercher la page et renvoie son texte utile, ou null.
// Ne lève jamais : un site injoignable n'est pas une erreur du commerçant, la
// rédaction doit continuer sans lui.
export async function lireSiteWeb(saisie) {
  const url = normaliserUrl(saisie)
  if (!url) return null

  try {
    const hote = new URL(url).hostname
    const adresses = await dns.lookup(hote, { all: true })
    if (!adresses.length || adresses.some(a => estIpPrivee(a.address))) return null
  } catch {
    return null   // nom introuvable
  }

  const stop = AbortSignal.timeout(DELAI_MAX)
  try {
    const res = await fetch(url, {
      signal: stop,
      redirect: 'follow',
      headers: { 'User-Agent': 'YoppaaBot/1.0 (+https://www.yoppaa.app)' },
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') || ''
    if (!type.includes('text/html') && !type.includes('text/plain')) return null

    // On lit par morceaux pour ne jamais charger un fichier énorme en mémoire.
    const reader = res.body?.getReader?.()
    if (!reader) {
      const texte = (await res.text()).slice(0, TAILLE_MAX)
      return texteUtile(texte) || null
    }
    let recu = 0
    const morceaux = []
    const decodeur = new TextDecoder('utf-8')
    let html = ''
    while (recu < TAILLE_MAX) {
      const { done, value } = await reader.read()
      if (done) break
      recu += value.length
      morceaux.push(value)
      html += decodeur.decode(value, { stream: true })
    }
    try { await reader.cancel() } catch { /* flux déjà clos */ }
    return texteUtile(html) || null
  } catch {
    return null
  }
}
