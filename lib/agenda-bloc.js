// Ce qu'un bloc de l'agenda écrit, selon la place dont il dispose.
//
// ⚠️ LA PRESTATION DISPARAISSAIT SUR LES BLOCS COURTS. Le bloc empilait trois
// lignes : l'heure, le prénom, puis la prestation. Un rendez-vous de trente
// minutes ne mesure que trente-quatre pixels : la troisième ligne était rognée,
// et AUCUNE prestation de trente minutes n'affichait son nom. Le commerçant
// devait ouvrir chaque rendez-vous pour savoir ce qu'il avait à faire, ce qui
// vide un agenda de son intérêt.
//
// La règle tient en une phrase : QUAND LA PLACE MANQUE, C'EST L'HEURE QUI CÈDE
// SA LIGNE, jamais la prestation. L'heure se replie sur la ligne du prénom, et
// la prestation garde la sienne.
//
// Cette fonction est ici, et non dans le composant, pour être exécutable par le
// banc : une mise en page se reprend, et rien ne rallumerait le défaut au
// passage. Le banc lit ce qui sort d'un bloc de trente minutes.

// Au-delà de cette hauteur, le bloc a la place de trois lignes.
export const HAUTEUR_TROIS_LIGNES = 36

export function contenuBlocRdv({ hauteur, rdv, praticienFiltre } = {}) {
  const r = rdv || {}

  // ⚠️ Une hauteur absente ne doit pas se lire comme « grand ». `Number(null)`
  // vaut 0 et passe les comparaisons numériques sans bruit : on teste donc la
  // présence d'un nombre, et à défaut on prend le format compact, celui qui
  // montre le PLUS d'informations.
  const h = Number(hauteur)
  const compact = !Number.isFinite(h) || h <= HAUTEUR_TROIS_LIGNES

  const heure = String(r.heure_debut || '').slice(0, 5)
  const prenom = r.client_prenom || String(r.client_nom || '').split(' ')[0] || 'Client'
  const prestation = r.prestation?.nom || 'RDV'
  const praticien = r.praticien?.prenom || ''

  // Le prénom de la praticienne n'accompagne la prestation que sur la vue
  // « Tous » : un filtre sur une personne l'a déjà identifiée. Et seulement si
  // le bloc a la place, sinon il mangerait le nom de la prestation.
  const avecPraticien = praticienFiltre === 'all' && !!praticien && !compact

  return {
    // Ligne de l'heure, seule. Vaut null quand elle se replie sur le titre.
    heureSeule: compact ? null : (heure || null),
    titre: compact && heure ? `${heure} ${prenom}` : prenom,
    // ⚠️ JAMAIS null. Cette ligne s'écrit dans tous les cas de figure.
    prestation: avecPraticien ? `${praticien} · ${prestation}` : prestation,
  }
}
