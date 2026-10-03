// LES COMMERCES RÉSERVÉS À LA VÉRIFICATION, CÔTÉ SERVEUR (03/10)
//
// Une fiche en `relecture` (voir `lib/statut-commercant.js`) n'accueille que
// les comptes inscrits dans la table `comptes_relecture` : ceux des relecteurs
// d'Apple et de Google, et ceux d'Alex. La base en décide pour tout ce qui se
// LIT (vue `commercants_public`, `commerces_publies()`, `commerce_lisible()`).
// Ce module en décide pour ce qui s'ÉCRIT : commander, réserver, s'inscrire
// sur une liste d'attente, payer.
//
// ⚠️ CE N'EST PAS UNE DEUXIÈME RÈGLE DE PUBLICATION. Les routes gardent
// `fichePubliee` en premier, et ne viennent ici QUE pour une fiche qui ne
// l'est pas :
//
//     if (!fichePubliee(commercant) && !(await relectureAutorisee(…))) refus
//
// Une fiche en préparation, rejetée ou suspendue reste donc fermée à tous,
// relecteurs compris : seule `relecture` peut s'ouvrir, et seulement à eux.
//
// 🔴 TOUT DOUTE FERME LA PORTE. Pas de compte, compte inconnu, lecture qui
// échoue : la réponse est non. Une fiche de démonstration refusée à un
// relecteur se voit et se corrige ; ouverte au public, elle trompe quelqu'un.

import { ficheEnRelecture } from './statut-commercant'
import { identiteProuvee } from './yopper-auth'

// `lireCompte` rend l'identifiant du compte qui fait la demande, ou null. On
// ne le lit QUE pour une fiche en relecture : pour toutes les autres, la
// réponse est connue sans rien demander à personne.
export async function relectureAutorisee(db, commercant, lireCompte) {
  if (!ficheEnRelecture(commercant)) return false
  const compte = await lireCompte()
  if (!compte) return false

  const { data, error } = await db
    .from('comptes_relecture')
    .select('user_id')
    .eq('user_id', compte)
    .maybeSingle()
  if (error) {
    console.error('[relecture] lecture de la liste impossible', error.message)
    return false
  }
  return !!data
}

// Le compte derrière la requête, PROUVÉ par son jeton. Une route appelée sans
// jeton (un invité, un appel direct) n'a pas de compte : la porte reste close.
export async function compteDeLaRequete(request) {
  const identite = await identiteProuvee(request)
  return identite?.auth_user_id || null
}
