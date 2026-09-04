// L'OFFRE DE FIN DE JOURNÉE : est-elle ouverte, MAINTENANT ?
//
// Un invendu ne vit que quelques heures. Toute la valeur de l'écran tient dans
// cette question, et toute sa fragilité aussi.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ LE PIÈGE DU FUSEAU, ET IL NOUS A DÉJÀ MORDUS DEUX FOIS.
//
// `heure_debut` et `heure_fin` sont des `time` SANS fuseau : ce sont les heures
// que le commerçant lit sur sa pendule, en heure belge. `new Date()`, lui,
// compte en temps universel. Les comparer directement se trompe d'une heure en
// hiver et de DEUX en été.
//
// Et `toISOString()` ne sauve rien, il rend Greenwich : à 23 h chez nous, il
// annonce déjà le lendemain.
//
// ✅ LE REMÈDE : on demande l'heure locale à `Intl`, avec le fuseau nommé. Lui
// seul connaît les changements d'heure, et il n'y a rien à maintenir.
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ PAS DE DRAPEAU `anti_gaspi` EN BASE, ET C'EST DÉLIBÉRÉ. Un booléen à côté
// des heures aurait pu dire « oui » pendant que les heures disent le
// contraire : deux sources de vérité pour une seule idée, le défaut qui revient
// le plus souvent dans ce projet. LA PRÉSENCE DE LA FENÊTRE FAIT L'OFFRE.

// ─── CE QUE ÇA S'APPELLE ─────────────────────────────────────────────────────
//
// ⚠️ DEUX NOMS, ET C'EST VOULU (Alex, 04/09). Le titre côté Yopper porte le
// SENS et doit se retenir ; le nom de la fonction côté commerçant doit être
// limpide pour celui qui l'achète. Yoppaa le fait déjà : le Yopper lit
// « Good Morning Yoppers », le commerçant achète « une place dans le
// Good Morning ».
//
// ⚠️ ILS VIVENT ICI ET NULLE PART AILLEURS. Recopiés dans les écrans, ils
// auraient divergé au premier changement de formulation, comme le libellé du
// bon cadeau avant le 31/08.
//
// ⚠️ « À sauver » A ÉTÉ ÉCARTÉ : c'est le verbe de Too Good To Go en français.
// Aucun risque juridique, mais ça ferait passer Yoppaa pour un clone de ce
// qu'elle refuse d'être. « Panier surprise » aussi ; « Magic Bag » est leur
// marque déposée.
export const TITRE_YOPPER = 'Rien ne se perd'
export const SOUS_TITRE_YOPPER = 'Les derniers du jour, avant la fermeture.'
export const NOM_FONCTION_COMMERCANT = 'Avant la fermeture'

// ⚠️ ON PREND CE QUI RESTE, ON RÉSERVE CE QUI ATTEND. Le verbe porte la rareté
// mieux que « Réserver ».
export const LIBELLE_BOUTON = 'Je le prends'

export const FUSEAU = 'Europe/Brussels'

// ⚠️ Construit UNE fois : `Intl.DateTimeFormat` est coûteux, et cette fonction
// est appelée pour chaque offre de chaque écran.
const HEURE_LOCALE = new Intl.DateTimeFormat('fr-BE', {
  timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false,
})

/**
 * ⚠️ MINUIT PEUT SE DIRE « 24 ». Selon la version d'ICU, `hour: '2-digit'` en
 * `hour12: false` rend « 24 » à minuit plutôt que « 00 ». Non gardé, minuit
 * vaudrait 1440 et tomberait hors de toutes les fenêtres.
 *
 * ⚠️ ELLE EST EXPORTÉE UNIQUEMENT POUR ÊTRE MESURABLE. Le Node de cette machine
 * rend « 00 », donc aucun test passant par `minutesLocales` ne peut faire
 * rougir cette garde : la mutation qui la retirait restait verte. Une garde
 * qu'on ne peut pas mesurer est une garde que le prochain supprimera en la
 * croyant morte. On teste donc la RÈGLE directement, sans dépendre de ce que
 * l'environnement veut bien produire.
 */
export function heureNormalisee(h) {
  return h === 24 ? 0 : h
}

/** Combien de minutes se sont écoulées depuis minuit, EN HEURE BELGE. */
export function minutesLocales(instant = new Date()) {
  const d = instant instanceof Date ? instant : new Date(instant)
  if (Number.isNaN(d.getTime())) return null
  const parts = HEURE_LOCALE.formatToParts(d)
  const valeur = (type) => Number(parts.find(p => p.type === type)?.value ?? NaN)
  const h = valeur('hour')
  const min = valeur('minute')
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null
  return heureNormalisee(h) * 60 + min
}

/**
 * Une heure de base (« 17:00:00 », « 9:30 ») en minutes depuis minuit.
 * Rend `null` sur tout ce qui n'est pas une heure : une absence n'est pas zéro.
 */
export function minutesDeLHeure(valeur) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(valeur ?? '').trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Cette offre porte-t-elle une fenêtre ? C'est ce qui en fait une offre de fin
 * de journée, et rien d'autre.
 *
 * ⚠️ LES DEUX HEURES, OU AUCUNE. La contrainte en base dit la même chose ; on
 * la redit ici parce qu'une ligne écrite avant la migration peut être à moitié
 * remplie, et qu'une demi-fenêtre ne doit jamais s'afficher.
 */
export function porteUneFenetre(offre) {
  return minutesDeLHeure(offre?.heure_debut) !== null
      && minutesDeLHeure(offre?.heure_fin) !== null
}

/**
 * Le prix est-il vraiment cassé ?
 *
 * 🔴 SANS CETTE RÈGLE, LE SOUS-TITRE MENT. « Les derniers du jour » laisse
 * entendre une affaire, et rien n'empêchait un commerçant de publier son
 * invendu AU PRIX PLEIN. Une promesse que l'application ne tient pas se paie
 * une fois, puis le Yopper n'ouvre plus l'écran.
 *
 * ⚠️ ZÉRO N'EST PAS UN PRIX. Un `prix_original` absent vaudrait 0 après
 * conversion, et `0 > prix_deal` serait faux : l'offre passerait pour valable
 * sans qu'on sache de combien elle remise. Sixième fois que ce projet se fait
 * avoir par le zéro.
 */
export function prixCasse(offre) {
  const casse = Number(offre?.prix_deal)
  const plein = Number(offre?.prix_original)
  if (!Number.isFinite(casse) || !Number.isFinite(plein)) return false
  if (casse <= 0 || plein <= 0) return false
  return casse < plein
}

/** La remise, en pourcentage entier. `null` si le prix n'est pas cassé. */
export function remisePourcent(offre) {
  if (!prixCasse(offre)) return null
  const casse = Number(offre.prix_deal)
  const plein = Number(offre.prix_original)
  return Math.round((1 - casse / plein) * 100)
}

// ─── LA REMISE MINIMALE ──────────────────────────────────────────────────────
//
// « Le commerçant qui veut y figurer doit jouer le jeu » (Alex, 04/09). Sans
// plancher, une remise de 10 % suffirait à occuper l'écran, et le Yopper qui
// ouvre « Rien ne se perd » n'y trouverait pas une affaire. Il n'ouvrirait plus,
// et il n'ouvrirait plus pour personne.
//
// ⚠️ UN SEUL CHIFFRE, ET IL SE CHANGE ICI. Il est volontairement isolé : c'est
// une règle commerciale, pas une constante technique, et elle bougera si un
// commerçant réel bute dessus.
//
// ⚠️ CE CHIFFRE A UN COÛT, ET IL FAUT LE SAVOIR : l'alternative du commerçant,
// c'est la POUBELLE. Un plancher trop haut produit du gaspillage, ce qui est
// exactement l'inverse du but.
//
// 🔴 POURQUOI 30 ET PAS 50, ET C'EST UNE QUESTION DE MARGE. Une boulangerie
// tourne autour de 60 à 70 % de marge brute sur le pain : à moitié prix, elle
// reste au-dessus de son coût. Une BOUCHERIE ou une POISSONNERIE sont plutôt
// entre 25 et 35 % : à moitié prix, elles VENDENT À PERTE. Or ce sont
// précisément les métiers qui ont le plus d'invendus périssables, donc ceux
// pour qui cette fonction existe. Un plancher à 50 excluait ceux qui en ont le
// plus besoin.
//
// ⚠️ Ce sont des ordres de grandeur de métier, pas des chiffres mesurés chez
// les commerçants de Yoppaa. Ils vont tous dans le même sens, c'est tout ce
// qu'on peut en dire.
//
// ⚠️ ET 35 N'EST UN REPÈRE POUR PERSONNE : il aurait l'air calculé plutôt que
// choisi, excluerait une tranche de commerçants et n'achèterait aucune
// crédibilité de plus.
export const REMISE_MINIMALE = 30

// Ce qu'on lui conseille sans l'imposer. ⚠️ STRICTEMENT AU-DESSUS DU PLANCHER,
// sinon le conseil ne conseille rien.
export const REMISE_CONSEILLEE = 50

// ⚠️ LE CONSEIL SE CONSTRUIT À PARTIR DES CHIFFRES, IL NE LES RECOPIE PAS.
// Un « -30 % » écrit à la main survivrait au changement du plancher et
// mentirait au commerçant sans que rien ne l'attrape.
//
// ⚠️ ET IL N'ANNONCE AUCUNE MESURE. Aucune offre de fin de journée n'a jamais
// tourné sur Yoppaa : écrire « les offres à moitié prix partent trois fois plus
// vite » serait inventer un chiffre. On dit le mécanisme, pas une statistique.
// Le jour où les données existeront, on lui montrera LES SIENNES, et ça vaudra
// tous les conseils.
export const CONSEIL_REMISE =
  `-${REMISE_MINIMALE} % minimum. À moitié prix, ils viennent plus vite.`

/**
 * Cette offre a-t-elle le droit de s'afficher ?
 *
 * ⚠️ LA FENÊTRE **ET** LA REMISE. L'écran du commerçant refusera d'enregistrer
 * une offre qui ne joue pas le jeu, mais **une garde d'écran n'est jamais une
 * réponse** : des lignes écrites avant cette règle peuvent exister, et la
 * lecture doit se défendre seule.
 */
export function offreValable(offre) {
  if (!porteUneFenetre(offre)) return false
  const remise = remisePourcent(offre)
  return remise !== null && remise >= REMISE_MINIMALE
}

/**
 * La fenêtre est-elle ouverte à cet instant ?
 *
 * ⚠️ LA FIN EST EXCLUE. « Jusqu'à 19 h » veut dire qu'à 19 h 00 c'est fini :
 * afficher encore l'offre à l'heure pile enverrait quelqu'un devant une porte
 * qui se ferme.
 *
 * ⚠️ ET LA FENÊTRE PEUT FRANCHIR MINUIT. Une friterie ouverte de 22 h à 1 h du
 * matin n'a rien d'exotique. Sans ce cas, elle n'aurait jamais rien affiché.
 */
export function fenetreOuverte(offre, instant = new Date()) {
  const t = minutesLocales(instant)
  if (t === null) return false
  return dansFenetre(t, minutesDeLHeure(offre?.heure_debut), minutesDeLHeure(offre?.heure_fin))
}

/**
 * Cette minute-là tombe-t-elle entre ces deux heures ?
 *
 * ⚠️ EXTRAITE POUR ÊTRE PARTAGÉE. La même question se pose pour « sommes-nous
 * dans la fenêtre » et pour « ce créneau chevauche-t-il la fenêtre ». Deux
 * copies auraient divergé sur le passage de minuit, qui est justement le cas
 * qu'on oublie.
 */
export function dansFenetre(t, debut, fin) {
  if (debut === null || fin === null || t === null) return false
  // Une fenêtre de durée nulle n'est pas une fenêtre. La laisser passer
  // afficherait une offre une minute par jour, sans que personne comprenne.
  if (debut === fin) return false
  return debut < fin
    ? (t >= debut && t < fin)
    : (t >= debut || t < fin)   // franchit minuit
}

/**
 * Combien de minutes avant la fermeture, ou `null` si l'offre n'est pas ouverte.
 * C'est ce qui rend l'écran utile : « encore 40 minutes » fait sortir de chez
 * soi, « jusqu'à 19 h » demande un calcul.
 */
export function minutesAvantFermeture(offre, instant = new Date()) {
  if (!fenetreOuverte(offre, instant)) return null
  const fin = minutesDeLHeure(offre.heure_fin)
  const t = minutesLocales(instant)
  const reste = fin - t
  return reste > 0 ? reste : reste + 24 * 60
}

// ─── CE QUE L'ÉCRAN ÉCRIT ────────────────────────────────────────────────────
//
// ⚠️ TYPOGRAPHIE FRANÇAISE : « 19 h », avec une espace, et « 19 h 30 » sans
// zéro inutile. « 19h00 » se lit comme une référence technique.

export function libelleHeure(valeur) {
  const m = minutesDeLHeure(valeur)
  if (m === null) return ''
  const h = Math.floor(m / 60)
  const min = m % 60
  return min === 0 ? `${h} h` : `${h} h ${String(min).padStart(2, '0')}`
}

/**
 * ⚠️ ON DIT « JUSQU'À », PAS LA FENÊTRE ENTIÈRE. Ce qui intéresse celui qui
 * lit, c'est le moment où ça disparaît. L'heure de début ne lui apprend rien :
 * s'il voit l'offre, c'est qu'elle a commencé.
 */
export function libelleFenetre(offre) {
  const fin = libelleHeure(offre?.heure_fin)
  return fin ? `jusqu'à ${fin}` : ''
}

/**
 * Le temps restant, dit comme on le dirait à quelqu'un.
 *
 * ⚠️ ON ANNONCE L'ÉTAT, PAS UNE ALARME. « Encore 40 minutes » informe ;
 * « plus que 40 minutes ! » presse, et ce n'est pas notre rôle.
 */
export function libelleTempsRestant(minutes) {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) return ''
  if (minutes < 60) return `encore ${minutes} minute${minutes > 1 ? 's' : ''}`
  const h = Math.floor(minutes / 60)
  const min = minutes % 60
  return min === 0 ? `encore ${h} h` : `encore ${h} h ${String(min).padStart(2, '0')}`
}

// ─── LE RETRAIT PASSE PAR LES CRÉNEAUX, COMME TOUT LE RESTE ─────────────────
//
// ⚠️ DÉCISION D'ALEX, 04/09 : « il faut continuer à garder le système de
// créneau, le Yopper connaît, il ne doit pas chercher ses repères ».
//
// Je proposais l'inverse : une commande d'invendu sans créneau, la fenêtre en
// tenant lieu. Son argument est meilleur, et il vient du bon côté. Le Yopper
// connaît le rituel du numéro, du créneau et du glissement ; lui en inventer un
// second fabriquerait deux façons de retirer, alors qu'on a passé la journée à
// supprimer des divergences. Et ça ÉVITE UNE EXCEPTION dans la route qui crée
// les commandes, c'est-à-dire dans du code d'argent.
//
// Les deux notions répondent à deux questions différentes et cohabitent :
//   • la FENÊTRE dit jusqu'à quand l'offre est visible ;
//   • le CRÉNEAU dit quand le Yopper vient chercher.

/**
 * Les créneaux qui permettent réellement de venir chercher cette offre.
 *
 * Un créneau convient s'il CHEVAUCHE la fenêtre : soit il commence dedans, soit
 * la fenêtre commence pendant lui. Les deux sens sont nécessaires, sinon un
 * créneau qui englobe toute la fenêtre serait écarté.
 */
export function creneauxUtilisables(offre, creneaux = []) {
  const debutF = minutesDeLHeure(offre?.heure_debut)
  const finF = minutesDeLHeure(offre?.heure_fin)
  if (debutF === null || finF === null) return []
  const liste = Array.isArray(creneaux) ? creneaux : []
  return liste.filter(c => {
    const debutC = minutesDeLHeure(c?.heure_debut)
    const finC = minutesDeLHeure(c?.heure_fin)
    if (debutC === null || finC === null) return false
    return dansFenetre(debutC, debutF, finF) || dansFenetre(debutF, debutC, finC)
  })
}

/**
 * Pourquoi cette offre ne peut pas être publiée. `null` si elle le peut.
 *
 * 🔴 ON REFUSE À L'ÉCRITURE, ET ON DIT POURQUOI. Une offre qu'on laisse
 * enregistrer et qui ne s'affiche jamais est le pire des deux mondes : le
 * commerçant croit avoir travaillé, personne ne voit rien, et rien ne le
 * signale. C'est la même règle que la fenêtre incomplète, refusée par une
 * contrainte en base.
 *
 * ⚠️ ET LE MESSAGE NOMME LE GESTE QUI RÉPARE. « Offre invalide » n'aide
 * personne à 17 h, les mains dans la farine.
 */
export function refusDePublication(offre, creneaux = []) {
  if (!porteUneFenetre(offre)) {
    return 'Il manque l\'heure jusqu\'à laquelle ça reste disponible.'
  }
  const remise = remisePourcent(offre)
  if (remise === null) {
    return 'Le prix doit être plus bas que le prix habituel.'
  }
  if (remise < REMISE_MINIMALE) {
    return `Ta remise est de ${remise} %. Il en faut au moins ${REMISE_MINIMALE} %.`
  }
  if (creneauxUtilisables(offre, creneaux).length === 0) {
    return 'Aucun créneau de retrait dans cette plage. Ajoute un créneau, sinon personne ne pourra venir chercher.'
  }
  return null
}

/** Raccourci de lecture : cette offre peut-elle être publiée ? */
export function offrePubliable(offre, creneaux = []) {
  return refusDePublication(offre, creneaux) === null
}

/**
 * Les offres à montrer, dans l'ordre où elles doivent être lues.
 *
 * ⚠️ CE QUI SE RÉSERVE PASSE DEVANT. Une offre qu'on peut prendre tout de suite
 * vaut mieux, pour celui qui lit, qu'une offre où il faut tenter sa chance. S'il
 * se déplace deux fois pour rien, il n'ouvre plus jamais cet écran, et il ne
 * l'ouvre plus pour personne.
 *
 * ⚠️ À ÉGALITÉ, LA PLUS PRESSÉE D'ABORD : celle qui ferme le plus tôt.
 */
export function offresOuvertes(offres = [], instant = new Date(), { reservable = () => false } = {}) {
  const liste = Array.isArray(offres) ? offres : []
  return liste
    // ⚠️ VALABLE, PAS SEULEMENT OUVERTE : une offre au prix plein ne s'affiche
    // pas, quelle que soit son heure. Voir `offreValable`.
    .filter(o => offreValable(o) && fenetreOuverte(o, instant))
    .map(o => ({
      offre: o,
      reservable: !!reservable(o),
      restant: minutesAvantFermeture(o, instant),
      remise: remisePourcent(o),
    }))
    .sort((a, b) =>
      (a.reservable === b.reservable ? 0 : (a.reservable ? -1 : 1))
      || (a.restant - b.restant))
}
