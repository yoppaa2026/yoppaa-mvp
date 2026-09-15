// Identité Yopper portée par le cookie HTTP-only `yoppaa_yopper`, SIGNÉE.
//
// 🔴 CE COOKIE NE PROUVE RIEN, ET PLUS AUCUNE ROUTE NE S'Y FIE (15/09).
//
// Il est né quand les Yoppers n'avaient pas de compte : faute d'`auth.uid()`,
// il servait à reconnaître l'auteur d'un avis ou le propriétaire d'un favori.
// Signé, il ne se fabrique plus à la main. Mais `POST /api/yopper/session`
// signe ce qu'on lui envoie : la signature garantit qu'un cookie a bien été
// émis par nous, jamais que celui qui le présente est la bonne personne. Il
// suffisait de déclarer l'email d'un tiers pour en recevoir un à son nom.
//
// Depuis le 03/08, tout ce qui touche à une personne exige `identiteProuvee`
// (le jeton Supabase, obtenu après vérification de l'adresse). Les deux
// dernières routes qui se contentaient du cookie, `commande/ignore-avis` et
// `signaux`, l'ont quitté le 15/09. Il ne sert plus qu'à PRÉREMPLIR les
// formulaires et à survivre à la purge d'iOS : `lireIdentiteYopper` n'est lue
// que par `GET /api/yopper/session`, qui le rend au navigateur qui l'a posé.
// `npm run verif:acces-api` rougit si une autre route le lit.
//
// LA SIGNATURE VIT DANS `lib/yopper-signature.js`, et pas ici, parce que ce
// fichier importe `next/headers` : tout ce qu'il contient devient alors
// intestable hors de Next. Elle est donc à côté, pure et éprouvée par
// `npm run verif:acces-api`.
//
// COMPATIBILITÉ. Les cookies posés avant cette mesure ne sont pas signés : ils
// sont refusés, et l'application en repose un signé au chargement suivant à
// partir du localStorage. La transition est donc automatique et invisible.

import { cookies } from 'next/headers'
import { encoderIdentite, identiteDepuisValeur } from './yopper-signature'

const COOKIE_NAME = 'yoppaa_yopper'

// Lit et VÉRIFIE le cookie. Renvoie null si absent, non signé, ou altéré.
// ⚠️ POUR PRÉREMPLIR, JAMAIS POUR AUTORISER : voir l'en-tête.
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
