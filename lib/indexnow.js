// IndexNow : prévenir Bing (et les autres moteurs du protocole : Yandex,
// Seznam, Naver) qu'une page vient d'apparaître ou de changer (27/10, lot 4
// validé par Alex au tableau).
//
// Sans ce signal, Bing ne découvre une fiche qu'en repassant de lui-même sur
// le plan du site, ce qui peut prendre des semaines. Google n'est PAS du
// protocole : pour lui, ce sont le plan du site et les liens qui comptent.
//
// ⚠️ LA CLÉ EST PUBLIQUE PAR CONSTRUCTION : le moteur la relit sur notre site
// (`public/<clé>.txt`) pour vérifier que l'envoi vient bien du propriétaire du
// domaine. Ce n'est pas un secret, elle n'a rien à faire dans les variables
// d'environnement. Changer la clé = renommer ET réécrire ce fichier.
//
// 🔴 HORS PRODUCTION, ON N'ENVOIE RIEN. Le site d'essai (Preview, base de test)
// publierait sinon des adresses www de commerces qui n'existent pas en prod.
// Et tant que le site entier est fermé aux robots (`NEXT_PUBLIC_SEO_INDEX`),
// annoncer une page interdite d'exploration n'a pas de sens.

export const INDEXNOW_CLE = 'd23334d34171d6bfb8ca1afdfea85f77'
export const HOTE_INDEXNOW = 'www.yoppaa.app'
const BASE = `https://${HOTE_INDEXNOW}`
export const POINT_INDEXNOW = 'https://api.indexnow.org/indexnow'
// Le protocole accepte 10 000 adresses par envoi.
const MAX_URLS = 10000

export function indexNowActif(env = process.env) {
  return env.VERCEL_ENV === 'production' && env.NEXT_PUBLIC_SEO_INDEX === 'true'
}

// Le corps de l'envoi. Seules les adresses de NOTRE domaine passent : le
// moteur refuse tout l'envoi si une seule adresse sort de l'hôte déclaré.
export function corpsIndexNow(urls) {
  const deChezNous = (u) => typeof u === 'string' && (u === BASE || u.startsWith(`${BASE}/`))
  const liste = [...new Set((urls || []).filter(deChezNous))].slice(0, MAX_URLS)
  if (!liste.length) return null
  return {
    host: HOTE_INDEXNOW,
    key: INDEXNOW_CLE,
    keyLocation: `${BASE}/${INDEXNOW_CLE}.txt`,
    urlList: liste,
  }
}

// Ne lève JAMAIS : prévenir Bing ne doit bloquer ni faire échouer aucun geste
// (une publication reste une publication si le moteur ne répond pas).
// 200 et 202 sont des succès (202 : clé en cours de vérification).
export async function signalerAuxMoteurs(urls, { env = process.env, fetchImpl = fetch } = {}) {
  if (!indexNowActif(env)) return { ok: false, raison: 'hors production' }
  const corps = corpsIndexNow(urls)
  if (!corps) return { ok: false, raison: 'aucune adresse' }
  try {
    const r = await fetchImpl(POINT_INDEXNOW, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(4000),
    })
    return { ok: r.status === 200 || r.status === 202, statut: r.status, nombre: corps.urlList.length }
  } catch (e) {
    return { ok: false, raison: e?.name === 'TimeoutError' ? 'pas de réponse' : (e?.message || String(e)) }
  }
}
