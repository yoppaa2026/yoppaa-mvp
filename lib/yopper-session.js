// Lecture côté serveur de l'identité Yopper, portée par le cookie HTTP-only
// `yoppaa_yopper` (posé par /api/yopper/session).
//
// À QUOI CELA SERT, ET CE QUE CELA NE FAIT PAS. Les Yoppers n'ont pas
// forcément de compte Supabase Auth : on ne peut donc pas s'appuyer sur
// auth.uid() pour écrire en leur nom. Ce cookie n'est pas une authentification
// forte, un visiteur peut le poser lui-même. Son intérêt est ailleurs : il
// permet de retirer aux tables toute écriture directe depuis le navigateur.
// Les écritures passent alors par des routes serveur, où l'on peut valider,
// limiter le débit et refuser ce qui n'a pas de sens, ce qu'une policy SQL ne
// sait pas faire.
//
// Le pattern est celui adopté en juillet pour les commandes.

import { cookies } from 'next/headers'

const COOKIE_NAME = 'yoppaa_yopper'

export async function lireIdentiteYopper() {
  try {
    const jar = await cookies()
    const raw = jar.get(COOKIE_NAME)?.value
    if (!raw) return null
    const identity = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
    if (!identity?.email && !identity?.client_id) return null
    return identity
  } catch {
    return null
  }
}
