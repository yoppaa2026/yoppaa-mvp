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

// ⚠️ LES PRIMITIVES D'HEURE BELGE VIVENT DANS `lib/heure-belge.js` DEPUIS LE
// 04/09. Le module des délais de commande en a besoin aussi, et deux copies du
// fuseau auraient divergé au premier changement d'heure. Elles sont réexportées
// ici pour que les appelants existants ne bougent pas.
export { FUSEAU, heureNormalisee, minutesLocales, minutesDeLHeure, libelleHeure } from './heure-belge.js'
// ⚠️ UN RÉEXPORT N'EST PAS UN IMPORT. La ligne au-dessus ouvre ces noms aux
// appelants, elle ne les pose PAS dans ce fichier : `libelleFenetre` a levé
// « libelleHeure is not defined » à la première exécution. Rien dans le lint ni
// dans le build ne l'avait vu, et aucune recherche de mot ne l'aurait trouvé.
import { minutesLocales, minutesDeLHeure, libelleHeure } from './heure-belge.js'
// ⚠️ L'HEURE DE FERMETURE SE LIT LÀ OÙ ELLE VIT DÉJÀ. `limiteRetraitCeJour`
// sait qu'une boulangerie qui ferme le midi rouvre l'après-midi, et que c'est la
// FIN de la dernière plage qui compte. En réécrire une seconde version aurait
// divergé au premier commerce à horaire coupé.
import { limiteRetraitCeJour } from './ouverture.js'

/**
 * Cette offre porte-t-elle une fenêtre ? C'est ce qui en fait une offre de fin
 * de journée, et rien d'autre.
 *
 * ⚠️ LES DEUX HEURES, OU AUCUNE. La contrainte en base dit la même chose ; on
 * la redit ici parce qu'une ligne écrite avant la migration peut être à moitié
 * remplie, et qu'une demi-fenêtre ne doit jamais s'afficher.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 NE PAS CONFONDRE AVEC `date_debut` ET `date_fin`, ET LA CONFUSION EST
 * FACILE : `yoppaa_deals` porte les deux, et les noms se ressemblent.
 *
 *   • `date_debut` / `date_fin` sont des HORODATAGES. Le formulaire des bonnes
 *     affaires y colle une heure (« du 3 au 7, de 10 h à 18 h ») : c'est la
 *     PÉRIODE de la campagne, et TOUS les deals en ont une.
 *
 *   • `heure_debut` / `heure_fin` sont des HEURES DE PENDULE, sans date. Elles
 *     disent la fenêtre du JOUR MÊME, et SEUL un invendu en porte.
 *
 * Lire les premières ici ferait passer chaque bonne affaire de la semaine pour
 * un invendu de fin de journée.
 * ═══════════════════════════════════════════════════════════════════════════
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
// ⚠️ `libelleHeure` VIT DANS `lib/heure-belge.js` DEPUIS LE 04/09, avec la
// typographie française qu'elle porte (« 19 h », « 19 h 30 »). Elle est
// réexportée plus haut : les écrans qui l'importent d'ici ne bougent pas.

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
 * Les créneaux qui TOMBENT dans la fenêtre, sans regarder leur clôture.
 *
 * Un créneau convient s'il CHEVAUCHE la fenêtre : soit il commence dedans, soit
 * la fenêtre commence pendant lui. Les deux sens sont nécessaires, sinon un
 * créneau qui englobe toute la fenêtre serait écarté.
 */
export function creneauxDansLaFenetre(offre, creneaux = []) {
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
 * De combien de temps un créneau ferme-t-il ses commandes avant de commencer,
 * en minutes. Zéro quand rien n'est réglé.
 *
 * ⚠️ MÊME RÈGLE QUE `creneauCommandable`, DITE EN MINUTES D'HORLOGE. Là-bas on
 * compare des instants, ici des heures de pendule, parce qu'une offre de fin de
 * journée et un créneau sont deux réglages du MÊME jour. La règle, elle, est
 * une seule : le créneau ferme `cutoff_heures` avant son début.
 */
export function margeDeCloture(creneau) {
  const h = Number(creneau?.cutoff_heures)
  return (Number.isFinite(h) && h > 0) ? h * 60 : 0
}

// Combien de minutes après l'ouverture de la fenêtre tombe cet instant.
//
// ⚠️ C'EST CE CALCUL CIRCULAIRE QUI FAIT PASSER MINUIT. Comparer deux heures
// de pendule à la soustraction se trompe d'une journée entière sur la friterie
// ouverte de 22 h à 1 h : 00 h 30 y devient « moins vingt et une heures ». En
// comptant depuis l'ouverture, 00 h 30 vaut simplement 150 minutes.
function depuisLOuverture(debutFenetre, instant) {
  return (((instant - debutFenetre) % 1440) + 1440) % 1440
}

/**
 * Les créneaux qui permettent RÉELLEMENT de venir chercher cette offre.
 *
 * 🔴 LE CHEVAUCHEMENT NE SUFFIT PAS, ET C'EST LE DÉFAUT QUE CETTE FONCTION
 * PORTAIT DEPUIS SA PREMIÈRE LIGNE. Un créneau à 17 h dont la clôture est
 * réglée à 48 h n'accepte plus rien depuis avant-hier. Il chevauchait pourtant
 * la fenêtre de 15 h à 18 h : l'offre était publiée, elle s'affichait, et
 * personne ne pouvait la prendre. Le commerçant aurait cru à un bug de Yoppaa,
 * pas à son propre réglage — et il aurait eu raison.
 *
 * La question exacte est : « existe-t-il un moment, PENDANT que l'offre est
 * visible, où ce créneau est encore commandable ? » Le premier de ces moments
 * est l'ouverture de la fenêtre. Il suffit donc que la clôture tombe après.
 *
 * ⚠️ ET CELA ÉCARTE AUSSI LE CRÉNEAU DÉJÀ COMMENCÉ, sans aucune clôture
 * réglée. Un créneau de 16 h à 20 h CHEVAUCHE bien une fenêtre de 17 h à 19 h,
 * et l'ancienne version le retenait ; mais à 17 h il a démarré depuis une
 * heure, et `creneauCommandable` le refuse côté serveur. L'écran de
 * publication disait donc le contraire du serveur, ce qui est la pire des deux
 * réponses possibles.
 *
 * D'où la forme exacte du test : le créneau doit COMMENCER pendant la fenêtre,
 * et assez tard pour que sa clôture laisse un moment de commande.
 */
export function creneauxUtilisables(offre, creneaux = []) {
  const debutF = minutesDeLHeure(offre?.heure_debut)
  const finF = minutesDeLHeure(offre?.heure_fin)
  if (debutF === null || finF === null || debutF === finF) return []
  const duree = depuisLOuverture(debutF, finF)
  const liste = Array.isArray(creneaux) ? creneaux : []
  return liste.filter(c => {
    const debutC = minutesDeLHeure(c?.heure_debut)
    // Un créneau sans heure de fin est une ligne à moitié écrite. On ne
    // l'oppose pas au commerçant, on ne s'en sert pas non plus.
    if (debutC === null || minutesDeLHeure(c?.heure_fin) === null) return false
    const apres = depuisLOuverture(debutF, debutC)
    if (apres >= duree) return false
    return apres >= margeDeCloture(c)
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
    // ⚠️ DEUX CAUSES, DEUX GESTES. « Ajoute un créneau » est un mauvais conseil
    // quand le créneau existe et que c'est sa CLÔTURE qui ferme la porte : le
    // commerçant en créerait un second, aussi inutilisable que le premier, et
    // conclurait que la fonction ne marche pas.
    const dansLaPlage = creneauxDansLaFenetre(offre, creneaux)
    if (dansLaPlage.length > 0) {
      return 'Tes créneaux de cette plage n\'acceptent plus de commande : leur clôture est déjà passée. Baisse la clôture de ces créneaux, ou ouvre la fenêtre plus tôt.'
    }
    return 'Aucun créneau de retrait dans cette plage. Ajoute un créneau, sinon personne ne pourra venir chercher.'
  }
  return null
}

/** Raccourci de lecture : cette offre peut-elle être publiée ? */
export function offrePubliable(offre, creneaux = []) {
  return refusDePublication(offre, creneaux) === null
}

// ─── COMBIEN IL EN RESTE ────────────────────────────────────────────────────
//
// 🔴 `stockJourAEcrire` A VÉCU UNE HEURE, ET ALEX L'A DÉMOLIE.
//
// Elle convertissait le reste déclaré par le commerçant en un total à écrire
// dans `articles.stock_jour`. L'arithmétique était juste, la prémisse était
// fausse.
//
// Son scénario : un boulanger qui produit sur commande ne met AUCUNE limite de
// stock sur ses tartes, puisqu'il produit ce qu'on lui demande. Le champ est
// donc vide, ce qui veut dire « aucune limite ». Publier « il m'en reste 1 » y
// aurait écrit 1. Or **`articles.stock_jour` n'est pas daté** : il vaut pour
// tous les jours suivants. Le lendemain, sa tarte auparavant illimitée aurait
// été plafonnée à une pièce. **Publier un invendu aurait cassé durablement son
// catalogue, en silence.**
//
// ✅ LA QUANTITÉ VIT DONC SUR L'OFFRE (`yoppaa_deals.quantite`), qui porte déjà
// sa fenêtre et son prix. Un seul objet, une seule durée de vie : quand la
// fenêtre se ferme, tout s'arrête et rien ne déborde sur demain.
//
// Le disponible se calcule alors comme le stock alimentaire, même forme :
//     quantité de l'offre − vendu sur cette offre aujourd'hui − réservations
// Le comptage est rendu possible par `commande_articles.deal_id`, qui
// n'existait pas : le `deal_id` servait à calculer le prix, puis il était jeté.

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

// ─── LE GESTE DU COMMERÇANT ─────────────────────────────────────────────────
//
// ⚠️ IL EST 17 H ET IL A LES MAINS DANS LA FARINE. Tout ce qui suit existe pour
// que publier un invendu tienne en trois gestes : ce qu'il lui reste, à quel
// prix, jusqu'à quand. Le reste, on le déduit.
//
// 🔴 UN FORMULAIRE DE PLUS N'AURAIT PAS ÉTÉ UTILISÉ. Le formulaire des bonnes
// affaires demande un titre, une description, un type, des dates : c'est l'outil
// de celui qui prépare sa semaine, pas de celui qui ferme dans une heure.

/**
 * L'heure à laquelle il ferme aujourd'hui, en minutes depuis minuit.
 *
 * ⚠️ ON RELIT `limiteRetraitCeJour`, on n'en écrit pas une seconde version. Elle
 * sait déjà qu'une boulangerie qui ferme le midi rouvre l'après-midi, et que
 * c'est la FIN de la dernière plage qui compte, pas celle de la première.
 */
export function fermetureDuJour(horairesDetail, nomJour) {
  const m = limiteRetraitCeJour(horairesDetail, nomJour, 0)
  return Number.isFinite(m) ? m : null
}

/**
 * La fenêtre proposée par défaut : de maintenant à la fermeture.
 *
 * ⚠️ ON NE PROPOSE RIEN QUAND LA JOURNÉE EST FINIE. Une fenêtre qui se ferme
 * avant de s'ouvrir n'afficherait l'offre à personne, et le commerçant croirait
 * avoir publié. `refusDePublication` le dirait, mais autant ne pas l'y amener.
 *
 * ⚠️ ET ON LAISSE UN QUART D'HEURE. Publier à 17 h 58 pour une fermeture à 18 h
 * ne laisse à personne le temps de traverser le village.
 */
export const MINUTES_UTILES_MINIMUM = 15

export function fenetreParDefaut(horairesDetail, nomJour, instant = new Date()) {
  const fin = fermetureDuJour(horairesDetail, nomJour)
  const debut = minutesLocales(instant)
  if (fin === null || debut === null) return null
  if (fin - debut < MINUTES_UTILES_MINIMUM) return null
  return { heure_debut: enHeure(debut), heure_fin: enHeure(fin) }
}

/** Minutes depuis minuit vers « HH:MM », la forme que la base attend. */
export function enHeure(minutes) {
  const m = Number(minutes)
  if (!Number.isFinite(m) || m < 0 || m >= 1440) return null
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`
}

/**
 * Le prix qu'on lui suggère : la remise conseillée sur son prix habituel.
 *
 * ⚠️ ON SUGGÈRE, ON N'IMPOSE PAS. Le plancher est une règle, le conseil est un
 * avis. Un commerçant qui casse à 40 % publie ; celui qui casse à 20 %, non.
 */
export function prixConseille(prixOriginal) {
  const plein = Number(prixOriginal)
  if (!Number.isFinite(plein) || plein <= 0) return null
  return Math.round(plein * (100 - REMISE_CONSEILLEE)) / 100
}

/**
 * La ligne à écrire pour publier un invendu.
 *
 * ⚠️ LE TITRE EST CELUI DE L'ARTICLE, et rien d'autre. Demander une accroche à
 * quelqu'un qui ferme dans une heure, c'est lui demander de ne pas publier. Le
 * Yopper, lui, cherche « la tarte aux pommes », pas un slogan.
 *
 * ⚠️ `date_deal`, `date_debut` ET `date_fin` VALENT LE JOUR MÊME. Un invendu ne
 * survit pas à sa journée, et la lecture des deals du jour passe par ces
 * colonnes-là : sans elles, l'offre existerait sans jamais s'afficher.
 *
 * ⚠️ ET JAMAIS `inclus_morning`. Le Good Morning part à 7 h du matin, l'invendu
 * vit de 17 h à la fermeture : le pousser là serait annoncer la veille ce qui
 * n'existe pas encore.
 */
export function lignePublication({ article, reste, prix, heureDebut, heureFin, jour, commercantId }) {
  if (!article?.id || !commercantId) return null
  const quantite = Math.floor(Number(reste))
  const prixCasseEuros = Number(prix)
  const plein = Number(article.prix)
  if (!Number.isFinite(quantite) || quantite < 1) return null
  if (!Number.isFinite(prixCasseEuros) || prixCasseEuros <= 0) return null
  if (!Number.isFinite(plein) || plein <= 0) return null
  if (minutesDeLHeure(heureDebut) === null || minutesDeLHeure(heureFin) === null) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(jour || ''))) return null

  return {
    commercant_id: commercantId,
    article_id: article.id,
    titre: article.nom,
    // ⚠️ `deal_type: 'lot'` AVEC UNE SEULE UNITÉ. C'est le type qui produit une
    // ligne de panier À PART, avec son prix propre, sans faire disparaître
    // l'article au prix plein du catalogue. Un « remise_pct » aurait remisé
    // TOUT le stock du jour, y compris ce qui n'est pas un invendu.
    deal_type: 'lot',
    unites_par_deal: 1,
    prix_deal: Math.round(prixCasseEuros * 100) / 100,
    prix_original: Math.round(plein * 100) / 100,
    quantite,
    heure_debut: heureDebut,
    heure_fin: heureFin,
    date_deal: jour,
    date_debut: jour,
    date_fin: jour,
    actif: true,
    inclus_morning: false,
    est_bonne_affaire: false,
  }
}
