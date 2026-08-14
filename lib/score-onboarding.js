// LE SCORE DE COMPLÉTION DU SIGNUP, ET LA PROMESSE QU'IL DOIT TENIR.
//
// ⚠️ IL ÉTAIT IMPOSSIBLE D'ATTEINDRE 100 %. Dix des cent points étaient donnés
// pour « au moins un article au menu », or aucun écran du signup ne permet
// d'ajouter un article : le commerçant plafonnait à 90 % sans jamais comprendre
// ce qui manquait, et terminait son inscription sur un échec. Relevé par Alex
// le 14/08.
//
// ⚠️ ET LE MÊME DÉFAUT SE CACHAIT AILLEURS, plus discret. Les horaires valent
// vingt points, mais tout le monde n'en a pas à saisir : un commerce de service
// en formule Exister peut les passer, et depuis le 13/08 celui qui change
// d'endroit aussi, puisque ses horaires se déduisent de ses emplacements. Pour
// eux, le plafond tombait à 70 % sans qu'ils aient rien mal fait.
//
// D'où la règle : LE SCORE SE CALCULE SUR CE QUI EST APPLICABLE À CE
// COMMERÇANT-LÀ. Un critère qui ne le concerne pas ne compte ni au numérateur,
// ni au dénominateur. Tout le monde peut donc atteindre 100 %, et personne n'y
// arrive sans avoir rien fait.
//
// Fonction PURE : aucune lecture de base, aucune horloge, entièrement testable.

// Le seuil à partir duquel on peut soumettre son dossier. Il reste exprimé en
// pourcentage, donc il garde le même sens pour tout le monde.
export const SEUIL_SOUMISSION = 60

// `horairesRequis` est faux pour un commerce qui n'a pas d'horaires à saisir :
// service en formule Exister, ou commerçant dont les horaires viennent de ses
// emplacements. Le critère disparaît alors de la liste au lieu de rester
// éternellement rouge.
export function scoreOnboarding({ commercant = {}, onboarding = {}, horairesRequis = true } = {}) {
  const criteres = [
    {
      cle: 'adresse', label: 'Adresse localisable', poids: 20,
      // ⚠️ Sans coordonnées, personne ne trouve le commerce et il n'apparaît
      // dans aucun tri par distance : c'est le critère le plus lourd.
      atteint: !!(commercant.latitude && commercant.longitude),
      aide: 'Choisis ton adresse dans la liste proposée, pour qu’on sache où tu es.',
    },
    {
      cle: 'photos', label: 'Au moins une photo', poids: 20,
      atteint: onboarding.photo_ok === true,
      aide: 'Une seule suffit pour commencer, tu en ajouteras d’autres plus tard.',
    },
    ...(horairesRequis ? [{
      cle: 'horaires', label: 'Horaires d’ouverture', poids: 20,
      atteint: !!(commercant.horaires_detail
        && Object.values(commercant.horaires_detail).some(h => h?.ouvert)),
      aide: 'Ouvre au moins un jour de la semaine.',
    }] : []),
    {
      cle: 'description', label: 'Présentation', poids: 15,
      atteint: (commercant.description || '').trim().length >= 20,
      aide: 'Vingt caractères suffisent, et l’assistant peut l’écrire pour toi.',
    },
    {
      cle: 'logo', label: 'Logo', poids: 15,
      atteint: !!commercant.logo_url,
      aide: 'Le tien, ou celui qu’on te prête en attendant.',
    },
    {
      cle: 'telephone', label: 'Téléphone', poids: 10,
      atteint: /^\+?[\d\s.-]{8,}$/.test(commercant.telephone || ''),
      aide: 'Pour qu’un client puisse t’appeler avant de venir.',
    },
  ]

  const total = criteres.reduce((s, c) => s + c.poids, 0)
  const points = criteres.filter(c => c.atteint).reduce((s, c) => s + c.poids, 0)
  // ⚠️ L'ARRONDI NE PEUT PAS FABRIQUER DE 99 % TROMPEUR, et c'est le calcul qui
  // le garantit, pas un cas particulier : quand tout est atteint, le rapport
  // vaut exactement 1, donc 100. Une première version ajoutait un
  // `points === total ? 100` par précaution ; le banc a montré qu'il ne
  // protégeait de rien, et une ligne qui ne protège de rien ment sur le risque.
  const pourcentage = total === 0 ? 100 : Math.floor((points / total) * 100)

  return {
    pourcentage,
    points,
    total,
    criteres,
    complet: points === total,
    peutSoumettre: pourcentage >= SEUIL_SOUMISSION,
    // Ce qu'il reste à faire, dans l'ordre de ce qui rapporte le plus : un
    // commerçant pressé sait ainsi par quoi commencer.
    //
    // ⚠️ AUCUN TRI ICI, ET C'EST VOLONTAIRE. Les critères sont DÉCLARÉS par
    // poids décroissant, ce que le banc vérifie : filtrer conserve cet ordre.
    // Une première version triait par précaution, et la mutation a montré que
    // ce tri ne changeait jamais rien. Le supprimer déplace la garantie là où
    // elle se lit, dans l'ordre de la liste elle-même.
    manquants: criteres.filter(c => !c.atteint),
  }
}
