// Identité Yopper portée par le cookie HTTP-only `yoppaa_yopper`, SIGNÉE.
//
// LE PROBLÈME QUE CELA RÉSOUT. Les Yoppers n'ont pas forcément de compte
// Supabase Auth : la base ne dispose d'aucun `auth.uid()` pour reconnaître
// l'auteur d'un avis ou le propriétaire d'un favori. On s'appuie donc sur un
// cookie. Mais un cookie qui ne contient qu'un identifiant en clair se
// fabrique en dix secondes : il suffit d'encoder le sien avec l'identifiant
// d'un autre pour agir en son nom.
//
// LA SIGNATURE. On attache au contenu une empreinte HMAC-SHA256 calculée avec
// un secret qui ne quitte jamais le serveur. Modifier ne serait-ce qu'un
// caractère du contenu invalide l'empreinte, et le serveur rejette. Sans le
// secret, personne ne peut en produire une valide : le cookie devient
// infalsifiable, même s'il reste lisible.
//
// CE QUE CELA NE FAIT TOUJOURS PAS. La signature garantit qu'un cookie a bien
// été émis par nous, pas que la personne qui le présente est celle qu'elle
// prétend être : quiconque obtient une identité au moment où on la lui pose
// (par exemple en saisissant l'email d'un tiers au moment d'une commande
// invité) obtient un cookie valide. La réponse définitive reste un compte par
// Yopper, qui est une décision produit.
//
// COMPATIBILITÉ. Les cookies posés avant cette mesure ne sont pas signés : ils
// sont refusés, et l'application en repose un signé au chargement suivant à
// partir du localStorage. La transition est donc automatique et invisible.

import { cookies } from 'next/headers'
import crypto from 'node:crypto'

const COOKIE_NAME = 'yoppaa_yopper'

// Le secret ne doit jamais atteindre le navigateur. On accepte une variable
// dédiée, et à défaut la clé de service, toujours présente côté serveur : cela
// évite d'imposer une nouvelle variable d'environnement pour déployer.
function secret() {
  return process.env.YOPPER_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function signer(payloadB64) {
  return crypto.createHmac('sha256', secret()).update(payloadB64).digest('base64url')
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
export function encoderIdentite(identity) {
  const payload = Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url')
  return `${payload}.${signer(payload)}`
}

// Lit et VÉRIFIE le cookie. Renvoie null si absent, non signé, ou altéré.
export async function lireIdentiteYopper() {
  try {
    const jar = await cookies()
    const raw = jar.get(COOKIE_NAME)?.value
    if (!raw) return null

    const sep = raw.lastIndexOf('.')
    if (sep <= 0) return null                       // ancien format, non signé
    const payload = raw.slice(0, sep)
    const signature = raw.slice(sep + 1)
    if (!signaturesEgales(signature, signer(payload))) return null

    const identity = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!identity?.email && !identity?.client_id) return null
    return identity
  } catch {
    return null
  }
}

export const NOM_COOKIE_YOPPER = COOKIE_NAME
