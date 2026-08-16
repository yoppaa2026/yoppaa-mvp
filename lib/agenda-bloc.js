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

// ═══════════════════════════════════════════════════════════════════════════
// DE QUEL JOUR PARLENT LES COMPTEURS
//
// ⚠️ UN COMPTEUR QUI NE NOMME PAS SA PÉRIODE MENT PAR OMISSION. Trouvé par
// Alex le 16/08 : il annule un rendez-vous, en honore un autre, et « À venir »
// comme « Honorés » restent à zéro. Le calcul était juste, et c'est bien ça le
// problème. Les quatre cartes ne décrivent QU'UN SEUL JOUR, celui du sélecteur,
// alors que l'agenda juste en dessous montre la SEMAINE ENTIÈRE. Il agissait
// sur lundi pendant que les compteurs parlaient de samedi.
//
// Rien à l'écran ne disait lequel. On l'écrit.
// ═══════════════════════════════════════════════════════════════════════════

const JOURS_LONGS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS_LONGS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// `jour` et `aujourdhui` sont des dates 'AAAA-MM-JJ'. Aucune horloge n'est lue
// ici : le jour du jour est injecté, sans quoi ce libellé serait intestable et
// le banc pourrirait au fil du calendrier, ce qui est déjà arrivé.
export function libellePeriodeStats({ jour, aujourdhui, historique = false } = {}) {
  if (historique) return 'Historique'

  // ⚠️ UN SEUL GARDE-FOU, ET C'EST CELUI-CI. J'avais écrit au-dessus un test de
  // FORMAT sur `AAAA-MM-JJ` : la mesure par mutation l'a démasqué comme
  // INUTILE. Tout ce qu'il refusait, `Date` le refuse déjà — une date absente,
  // mal ponctuée ou dans un autre ordre donne `Invalid Date`, donc `NaN` ici.
  // Le retirer ne faisait rougir aucun test, ce qui est le signe qu'il ne
  // protégeait de rien. Une ligne qui ne protège de rien ment sur le risque.
  //
  // Troisième fois sur ce projet qu'une mutation muette désigne une ligne à
  // retirer plutôt qu'un test à ajouter.
  const d = new Date(`${jour}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const date = `${JOURS_LONGS_FR[d.getDay()]} ${d.getDate()} ${MOIS_LONGS_FR[d.getMonth()]}`

  // ⚠️ « Aujourd'hui » SEUL NE SUFFIT PAS, et c'est tout l'intérêt de garder la
  // date derrière : le commerçant qui revient sur son écran après une nuit doit
  // pouvoir vérifier d'un regard que l'application ne lui montre pas la veille.
  if (jour === aujourdhui) return `Aujourd’hui · ${date}`

  // Demain se nomme, parce que c'est le jour vers lequel on bascule le plus
  // souvent, et qu'une date seule oblige à compter.
  if (aujourdhui) {
    const lendemain = new Date(`${aujourdhui}T12:00:00`)
    lendemain.setDate(lendemain.getDate() + 1)
    const iso = `${lendemain.getFullYear()}-${String(lendemain.getMonth() + 1).padStart(2, '0')}-${String(lendemain.getDate()).padStart(2, '0')}`
    if (jour === iso) return `Demain · ${date}`
  }

  // Une majuscule pour un intitulé qui commence une ligne.
  return date.charAt(0).toUpperCase() + date.slice(1)
}
