// Identité Yopper portée par le cookie HTTP-only `yoppaa_yopper`, SIGNÉE.
//
// LE PROBLÈME QUE CELA RÉSOUT. Les Yoppers n'ont pas forcément de compte
// Supabase Auth : la base ne dispose d'aucun `auth.uid()` pour reconnaître
// l'auteur d'un avis ou le propriétaire d'un favori. On s'appuie donc sur un
// cookie. Mais un cookie qui ne contient qu'un identifiant en clair se
// fabrique en dix secondes : il suffit d'encoder le sien avec l'identifiant
// d'un autre pour agir en son nom.
//
// LA SIGNATURE VIT DANS `lib/yopper-signature.js`, et pas ici, parce que ce
// fichier importe `next/headers` : tout ce qu'il contient devient alors
// intestable hors de Next. La partie qui protège est donc à côté, pure et
// éprouvée par `npm run verif:acces-api`.
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
import { encoderIdentite, identiteDepuisValeur } from './yopper-signature'

const COOKIE_NAME = 'yoppaa_yopper'

// Lit et VÉRIFIE le cookie. Renvoie null si absent, non signé, ou altéré.
export async function lireIdentiteYopper() {
  try {
    const jar = await cookies()
    return identiteDepuisValeur(jar.get(COOKIE_NAME)?.value)
  } catch {
    return null
  }
}

// Réexport : les routes qui posent le cookie importent encore d'ici, et la
// signature n'est pas leur affaire.
export { encoderIdentite }

export const NOM_COOKIE_YOPPER = COOKIE_NAME
