// Ce que le client a VRAIMENT choisi sur une ligne de commande.
//
// ⚠️ LA VERSION N'A PAS DE COLONNE À ELLE. Une taille et un coloris ne vivent
// nulle part ailleurs que dans `options`, le jsonb de la ligne, où
// `lib/lignes-commande.js` les range à la vente sous le groupe « Version », en
// tête de liste. Il n'existe aucun autre endroit où les lire : `variante_id` ne
// sert qu'à rendre le stock, et le libellé d'une version supprimée n'existerait
// plus qu'ici.
//
// D'où ce fichier. La mise en forme était recopiée à l'identique dans
// `lib/commande-notifs.js` et dans `app/api/commande/cancel/route.js`, et
// nulle part ailleurs : l'écran de retrait, celui que le vendeur lit par-dessus
// l'épaule du client pour sortir le bon paquet, annonçait « 1 × Robe fleurie »
// sans jamais dire quelle taille ni quel coloris.
//
// Forme retenue : « Version : M · Bleu · Sauce : andalouse ». Le nom du groupe
// est gardé, car « andalouse » tout seul ne dit pas de quoi il s'agit.

// ⚠️ ÉCRITE PAR SON CODE, JAMAIS AU CLAVIER. Une espace insécable est invisible
// dans un éditeur : recopiée à la main elle redevient une espace ordinaire sans
// que personne ne s'en aperçoive, et le test censé la vérifier passe au vert en
// comparant deux caractères qu'on croit identiques. Trois vérifications sont
// tombées là-dessus avant que la constante ne soit écrite en clair.
//
// C'est U+00A0 qui précède un deux-points en français ; l'espace fine U+202F est
// réservée au point-virgule, au point d'exclamation et à l'interrogation.
export const ESPACE_INSECABLE = ' '

// Rend `null` plutôt qu'une chaîne vide : les écrans testent la présence, et
// une chaîne vide afficherait un bloc vide, une puce orpheline, un séparateur
// suspendu.
export function libelleOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return null
  const morceaux = options
    .map(o => {
      const valeur = String(o?.valeur_nom ?? '').trim()
      if (!valeur) return null
      const groupe = String(o?.groupe_nom ?? '').trim()
      return groupe ? `${groupe}${ESPACE_INSECABLE}: ${valeur}` : valeur
    })
    .filter(Boolean)
  return morceaux.length > 0 ? morceaux.join(' · ') : null
}
