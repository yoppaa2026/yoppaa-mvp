// LES CASQUETTES D'UNE CONNEXION, LUES EN BASE (29/09). Règles : lib/casquettes.js.
//
// 🔴 TOUTE LECTURE RATÉE LÈVE. Une panne lue comme « aucun commerce » ferait
// effacer la connexion d'un patron : exactement le défaut qu'on corrige.
//
// ⚠️ PAS DE SERVICES PUBLICS : le module a été retiré (Alex, 29/09 : « il n'y a
// plus de service public »). Lire leur table ferait dépendre chaque
// suppression de compte d'une table qui peut disparaître.

import { casquettesDe } from './casquettes'

export async function casquettesDuCompte(admin, user) {
  if (!user?.id) throw new Error('casquettes : compte inconnu')
  const [commerces, profilsYopper, equipes] = await Promise.all([
    admin.from('commercants').select('id').eq('auth_user_id', user.id),
    admin.from('clients').select('id').eq('auth_user_id', user.id),
    admin.from('equipe_membres').select('id').eq('auth_user_id', user.id).eq('statut', 'actif'),
  ])
  for (const [quoi, r] of [['commerces', commerces], ['profil Yopper', profilsYopper], ['équipes', equipes]]) {
    if (r.error) throw new Error(`casquettes, lecture des ${quoi} : ${r.error.message}`)
  }
  return casquettesDe({ user, commerces: commerces.data, profilsYopper: profilsYopper.data, equipes: equipes.data })
}
