// La SIGNATURE de l'identité Yopper, isolée du cookie qui la transporte.
//
// POURQUOI CE FICHIER EST SÉPARÉ. La lecture du cookie a besoin de
// `next/headers`, qui n'existe qu'à l'intérieur de Next : tout ce qui vit dans
// le même fichier devient donc intestable hors de l'application. Or la
// signature est précisément la partie qu'il faut pouvoir éprouver, puisque
// c'est elle qui empêche de se faire passer pour quelqu'un d'autre. Elle vit
// ici, pure, et `lib/yopper-session.js` l'utilise.
//
// LA RÈGLE. On attache au contenu une empreinte HMAC-SHA256 calculée avec un
// secret qui ne quitte jamais le serveur. Modifier un seul caractère du contenu
// invalide l'empreinte. Sans le secret, personne ne peut en produire une
// valide : le cookie devient infalsifiable, même s'il reste lisible.

import crypto from 'node:crypto'

// Le secret ne doit jamais atteindre le navigateur. On accepte une variable
// dédiée, et à défaut la clé de service, toujours présente côté serveur : cela
// évite d'imposer une nouvelle variable d'environnement pour déployer.
function secret() {
  return process.env.YOPPER_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

// ⚠️ UN SECRET VIDE SIGNE ENCORE, ET C'EST LE PIÈGE. `createHmac` accepte une
// clé vide sans broncher : la signature reste calculable, sauf que TOUT LE
// MONDE peut la calculer. Le cookie redeviendrait alors exactement ce que ce
// fichier existe pour empêcher, un identifiant que l'on se fabrique soi-même
// avec l'adresse d'un autre, et rien ne le signalerait.
//
// Trouvé le 12/09 en auditant la même famille de défauts que les tâches
// planifiées : une garde qui, faute de secret, laisse passer au lieu de refuser.
export function secretUtilisable() {
  const s = secret()
  if (!s) {
    console.error(
      '[yopper-signature] aucun secret (YOPPER_COOKIE_SECRET ni ' +
      'SUPABASE_SERVICE_ROLE_KEY) : identite Yopper refusee.'
    )
    return null
  }
  return s
}

function signer(payloadB64, cle) {
  return crypto.createHmac('sha256', cle).update(payloadB64).digest('base64url')
}

// Comparaison à temps constant : une comparaison naïve fuit, par sa durée,
// le nombre de caractères corrects et permet de reconstruire la signature.
function signaturesEgales(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8')
  const bb = Buffer.from(String(b || ''), 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

// Fabrique la valeur à poser dans le cookie : contenu encodé + signature.
// Rend null si aucun secret n'est disponible : mieux vaut pas de cookie du tout
// qu'un cookie que n'importe qui saurait refaire.
export function encoderIdentite(identity) {
  const cle = secretUtilisable()
  if (!cle) return null
  const payload = Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url')
  return `${payload}.${signer(payload, cle)}`
}

// Vérifie une valeur de cookie et rend l'identité, ou null si elle est absente,
// non signée (ancien format), altérée, ou vide de tout identifiant.
export function identiteDepuisValeur(raw) {
  try {
    const cle = secretUtilisable()
    if (!cle || !raw) return null

    const sep = String(raw).lastIndexOf('.')
    if (sep <= 0) return null                       // ancien format, non signé
    const payload = String(raw).slice(0, sep)
    const signature = String(raw).slice(sep + 1)
    if (!signaturesEgales(signature, signer(payload, cle))) return null

    const identity = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!identity?.email && !identity?.client_id) return null
    return identity
  } catch {
    return null
  }
}
