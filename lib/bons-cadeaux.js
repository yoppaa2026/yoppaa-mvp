// lib/bons-cadeaux.js
//
// Helpers PURS du module Bons cadeaux (partagés front + serveur).
// Décisions Alex 31/07 : montant libre, validité 12 mois par défaut
// (réglable par commerçant), solde utilisable en plusieurs fois,
// en ligne (tunnel) ET au comptoir.

import { euros } from './montants'

export const BON_MONTANT_MIN = 5
export const BON_MONTANT_MAX = 250

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) : le code se lit
// au téléphone et se recopie au comptoir sans hésitation.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

// Code façon 'BC-7K2M-9XQ4' : lisible, dictable, 31^8 ≈ 850 milliards de
// combinaisons (l'API de vérification est rate-limitée en plus).
//
// ⚠️ TIRAGE CRYPTOGRAPHIQUE, PAS Math.random(). Un bon cadeau est un
// instrument au porteur : qui devine un code encaisse l'argent de quelqu'un
// d'autre. Math.random() s'appuie sur xorshift128+, dont l'état interne se
// reconstitue à partir de quelques sorties observées : il suffisait d'acheter
// deux ou trois bons pour commencer à deviner ceux générés juste après, tous
// clients confondus puisque c'est le même processus serveur qui les tire.
// Le nombre de combinaisons ne protège de rien si la suite est prévisible.
//
// Le tirage rejette les octets qui déborderaient : 256 n'est pas un multiple
// de 31, et prendre le reste ferait sortir les huit premiers caractères de
// l'alphabet plus souvent que les autres. Un biais suffit à réduire l'espace
// réellement à couvrir pour qui cherche.
function tirerCaracteres(nombre) {
  const source = globalThis.crypto
  if (!source?.getRandomValues) {
    // Aucun repli sur un générateur faible : mieux vaut refuser d'émettre un
    // bon que d'en émettre un devinable.
    throw new Error('Tirage aléatoire sûr indisponible : bon cadeau non généré.')
  }
  const limite = Math.floor(256 / ALPHABET.length) * ALPHABET.length  // 248
  const sortie = []
  while (sortie.length < nombre) {
    const octets = new Uint8Array(nombre * 2)
    source.getRandomValues(octets)
    for (const o of octets) {
      if (o >= limite) continue                 // rejeté, sinon biais
      sortie.push(ALPHABET[o % ALPHABET.length])
      if (sortie.length === nombre) break
    }
  }
  return sortie.join('')
}

export function genererCodeBon() {
  const c = tirerCaracteres(8)
  return `BC-${c.slice(0, 4)}-${c.slice(4)}`
}

// Normalise la saisie utilisateur ('bc 7k2m 9xq4', 'BC7K2M9XQ4'…) vers le
// format canonique stocké en base. Retourne null si ça ne ressemble pas à un code.
export function normaliserCodeBon(saisie) {
  const brut = String(saisie || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const sans = brut.startsWith('BC') ? brut.slice(2) : brut
  if (!/^[A-Z0-9]{8}$/.test(sans)) return null
  return `BC-${sans.slice(0, 4)}-${sans.slice(4)}`
}

// Remise applicable sur une commande : jamais plus que le solde ni que le dû,
// et si un reste à payer subsiste il doit être >= 0,50 € (minimum Stripe).
// Dans ce cas on plafonne la remise pour laisser exactement 0,50 € à payer
// (le solde résiduel reste sur le bon, utilisable la fois suivante).
export function calculerRemiseBon(solde, totalDu) {
  const s = Math.round(Number(solde) * 100)
  const t = Math.round(Number(totalDu) * 100)
  if (s <= 0 || t <= 0) return 0
  let remise = Math.min(s, t)
  const reste = t - remise
  if (reste > 0 && reste < 50) remise = t - 50
  return Math.max(0, remise) / 100
}

export function bonExpire(bon, now = new Date()) {
  return !!bon?.expires_at && new Date(bon.expires_at) < now
}

// ═══════════════════════════════════════════════════════════════════════════
// PLUSIEURS BONS SUR UNE MÊME COMMANDE (demande d'Alex, 01/09)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 CE QUI SE PASSAIT : une commande de 180 € face à trois bons de 50, 75 et
// 20 € n'en acceptait QU'UN, et l'écran faisait DISPARAÎTRE les deux autres.
// On pouvait en conclure qu'ils étaient perdus.
//
// ⚠️ CINQ BONS AU PLUS. Ce n'est pas une limite technique : c'est une borne de
// bon sens, qui garde les métadonnées Stripe courtes et une commande lisible.
export const BONS_MAX_PAR_COMMANDE = 5

// Minimum encaissable par Stripe. En dessous, il refuse le paiement : mieux
// vaut laisser 0,50 € sur le bon que rendre la commande impayable.
const MINIMUM_STRIPE_CENTS = 50

/**
 * Répartit un montant dû sur plusieurs bons.
 *
 * 🔴 LE PLUS PROCHE DE L'EXPIRATION PART EN PREMIER. On dépense d'abord ce qui
 * risquait d'être perdu. Un bon sans date d'expiration passe en dernier : il ne
 * presse pas.
 *
 * 🔴 LE MINIMUM STRIPE S'APPLIQUE AU TOTAL, PAS À CHAQUE BON. C'est toute la
 * différence avec `calculerRemiseBon` appelée en boucle, qui laisserait 0,50 €
 * sur CHACUN et ferait perdre au client autant de fois qu'il a de bons.
 *
 * ⚠️ TOUT SE CALCULE EN CENTIMES. Trois additions de flottants suffisent à
 * produire un reste à payer de 0,004 €, que Stripe refuse sans expliquer.
 *
 * @param {Array<{id?, code?, solde, expires_at?}>} bons Les bons disponibles.
 * @param {number} totalDu Ce qu'il y a à payer avant les bons.
 * @returns {{lignes: Array<{id, code, montant}>, total: number, reste: number}}
 */
export function repartirBons(bons, totalDu) {
  const du = Math.round(Number(totalDu) * 100)
  const vide = { lignes: [], total: 0, reste: Math.max(0, du) / 100 }
  if (!Array.isArray(bons) || bons.length === 0 || !Number.isFinite(du) || du <= 0) return vide

  // ⚠️ LE TABLEAU REÇU N'EST JAMAIS RÉORDONNÉ : `filter` rend déjà une copie,
  // et c'est ELLE que `sort` réarrange. Le trier sur place changerait la liste
  // affichée à l'écran de l'appelant sans qu'il l'ait demandé.
  //
  // ⚠️ J'AVAIS ÉCRIT `[...bons].filter(...)`, UNE COPIE DE PLUS. Le harnais me
  // l'a démontré : la retirer ne changeait RIEN, donc elle ne protégeait rien.
  // Une défense qu'aucune mutation ne peut faire tomber n'est pas une défense,
  // c'est du bruit qui rassure.
  //
  // 🔴 ET C'EST ICI, ET NULLE PART AILLEURS, QU'UN SOLDE NUL EST ÉCARTÉ.
  // J'avais aussi un `if (pris <= 0) continue` plus bas : deux gardes qui se
  // couvraient l'une l'autre, donc AUCUNE des deux ne pouvait rougir seule.
  // Une seule règle, à un seul endroit, mesurable.
  const ordonnes = bons
    .filter(b => Number(b?.solde) > 0)
    .sort((a, b) => {
      const ea = a?.expires_at ? new Date(a.expires_at).getTime() : Number.POSITIVE_INFINITY
      const eb = b?.expires_at ? new Date(b.expires_at).getTime() : Number.POSITIVE_INFINITY
      if (ea !== eb) return ea - eb
      // À échéance égale, le plus petit solde d'abord : il se solde en entier
      // et laisse moins de reliquats éparpillés.
      return Number(a.solde) - Number(b.solde)
    })
    .slice(0, BONS_MAX_PAR_COMMANDE)

  const lignes = []
  let reste = du
  for (const b of ordonnes) {
    if (reste <= 0) break
    const solde = Math.round(Number(b.solde) * 100)
    const pris = Math.min(solde, reste)
    lignes.push({ id: b.id ?? null, code: b.code ?? null, montant: pris })
    reste -= pris
  }

  // 🔴 LA CORRECTION DU MINIMUM STRIPE, EN BOUCLE ET NON UNE SEULE FOIS.
  //
  // Si les bons laissent un reste inférieur à 0,50 € sans l'annuler, Stripe
  // refuse le paiement : on rend juste ce qu'il faut au dernier bon servi, qui
  // garde ce reliquat pour la prochaine fois.
  //
  // ⚠️ MA PREMIÈRE VERSION NE CORRIGEAIT QU'UNE FOIS, ET ELLE ÉTAIT FAUSSE.
  // Quand le dernier bon n'a pas de quoi rendre le manque, sa ligne disparaît
  // — et le reste peut alors REDESCENDRE sous le minimum, sur le bon d'avant.
  // Mesuré : 0,60 € dus, deux bons de 0,20 € et 0,39 €, la correction unique
  // rendait un reste de 0,40 € que Stripe aurait refusé.
  while (reste > 0 && reste < MINIMUM_STRIPE_CENTS && lignes.length > 0) {
    const derniere = lignes[lignes.length - 1]
    const manque = MINIMUM_STRIPE_CENTS - reste
    if (derniere.montant > manque) {
      derniere.montant -= manque
      reste = MINIMUM_STRIPE_CENTS
    } else {
      // Ce bon ne peut pas rendre assez : il ne sert pas du tout. Écrire un
      // débit nul salirait la commande et l'historique du bon pour rien.
      reste += derniere.montant
      lignes.pop()
    }
  }

  return {
    lignes: lignes.map(l => ({ ...l, montant: l.montant / 100 })),
    total: lignes.reduce((s, l) => s + l.montant, 0) / 100,
    reste: Math.max(0, reste) / 100,
  }
}

// CE QUI RESTE SUR LE BON, ET À QUOI ÇA SERT.
//
// 🔴 LA PHRASE S'ARRÊTAIT À « Il restera 18,10 € sur ton bon. » Un solde dont on
// ignore l'usage est un solde qu'on oublie, et un bon oublié est de l'argent que
// le commerçant a encaissé sans jamais revoir le client. Le dire, c'est
// transformer un reliquat en visite.
//
// ⚠️ ELLE VIVAIT EN DEUX EXEMPLAIRES, un par tunnel, et sous deux formes
// différentes : « Il restera X sur ton bon. » côté rendez-vous, « · il restera
// X sur ton bon » côté boutique. Deux écritures d'une même phrase finissent
// toujours par dire deux choses, et c'est le motif qui revient le plus souvent
// sur ce projet.
//
// ⚠️ ON NOMME LE COMMERCE quand on le connaît : « chez Ciseaux et Soins » dit
// où l'argent est utilisable, ce que « pour une prochaine fois » laisse deviner.
// Un bon cadeau n'est valable QUE chez son commerçant, et rien ne le rappelait.
//
// Rend '' quand il ne reste rien : une phrase sur un solde nul serait du bruit.
export function libelleResteBon(reste, nomCommercant = '') {
  const r = Math.round(Number(reste || 0) * 100) / 100
  if (!Number.isFinite(r) || r <= 0) return ''
  // ⚠️ `euros()` ET PAS UN `toFixed` À LA MAIN : c'est lui qui met la virgule et
  // l'espace INSÉCABLE, sans quoi le « € » se retrouve seul en début de ligne
  // sur un téléphone. Un vingt-et-unième formateur maison serait un défaut, pas
  // un détail.
  const chez = String(nomCommercant || '').trim()
  return chez
    ? `Il restera ${euros(r)} sur ton bon, pour une prochaine fois chez ${chez}.`
    : `Il restera ${euros(r)} sur ton bon, pour une prochaine fois.`
}

// ═══════════════════════════════════════════════════════════════════════════
// LE NOM DU BON CHANGE AVEC LE MÉTIER (décision d'Alex, 31/08)
// ═══════════════════════════════════════════════════════════════════════════
//
// 🔴 « BON CADEAU » DIT L'INTENTION, PAS L'USAGE. Chez un coiffeur ou un
// libraire, offrir EST l'usage dominant. Dans l'alimentaire, non : on n'offre
// pas un paquet de frites. Ce qu'on offre, c'est un repas à deux, une tarte
// pour la belle-famille, ou de quoi tenir la semaine chez son boulanger.
// Le mécanisme est identique, le mot ne l'est pas.
//
// ⚠️ ET C'EST LE COMMERÇANT QUE LE MOT DOIT ATTEINDRE D'ABORD. Un frituriste
// qui lit « vends des bons cadeaux » sur son tableau de bord ne se voit pas
// dedans, il pense bijouterie.
//
// ⚠️ « CHÈQUE-REPAS » EST ÉCARTÉ, ET CE N'EST PAS UN GOÛT. En Belgique c'est
// un titre légal financé par l'employeur, avec ses propres règles fiscales.
// L'employer ici créerait une confusion réelle chez des commerçants qui en
// acceptent tous les jours, et probablement un souci juridique.
//
// 🔴 LE DÉFAUT PAR DÉFAUT EST « CADEAU », ET C'EST LE CŒUR DE LA RÈGLE.
//
// `lib/plans.js` traite une catégorie absente comme de l'alimentaire, parce
// que c'est le métier historique. Reprendre ce réflexe ICI ferait dire « bon
// gourmand » chez un coiffeur dont la catégorie n'a pas été chargée, et un
// email part sans qu'on puisse le rattraper. On inverse donc délibérément :
// SEUL un `'alimentaire'` explicite déclenche « gourmand ». Une catégorie
// inconnue rend le terme canonique, compris partout.
//
// ⚠️ NE PAS APPELER `estAlimentaire()` ICI. Elle répond à une autre question,
// « ce commerce vend-il de la nourriture », dont le repli est l'inverse du
// nôtre. Les deux fonctions se ressemblent et ne disent pas la même chose.
const CATEGORIE_GOURMANDE = 'alimentaire'

// ⚠️ LES DEUX FORMES SONT ÉCRITES, PAS DÉDUITES. Ma première version fabriquait
// le pluriel en ajoutant un `s` et rendait « bons cadeaus ». Le pluriel français
// n'est pas une règle de concaténation, et une langue ne se devine pas : on
// l'écrit. Le banc l'a attrapé au premier tour.
const NOMS = {
  gourmand: { un: 'bon gourmand', des: 'bons gourmands' },
  cadeau: { un: 'bon cadeau', des: 'bons cadeaux' },
}

/**
 * Le nom du bon chez ce commerçant.
 *
 * @param {string|null|undefined} categorie `commercants.categorie`.
 * @param {{pluriel?: boolean, majuscule?: boolean}} options
 * @returns {string} « bon cadeau », « bons gourmands », « Bon cadeau »…
 */
export function libelleBon(categorie, { pluriel = false, majuscule = false } = {}) {
  const gourmand = String(categorie || '').trim().toLowerCase() === CATEGORIE_GOURMANDE
  const mot = NOMS[gourmand ? 'gourmand' : 'cadeau'][pluriel ? 'des' : 'un']
  return majuscule ? mot.charAt(0).toUpperCase() + mot.slice(1) : mot
}

// ═══════════════════════════════════════════════════════════════════════════
// CE QU'ON MONTRE À QUELQU'UN QUI REVIENT DE SA BANQUE (31/08)
// ═══════════════════════════════════════════════════════════════════════════
//
// Cette décision vivait dans la route `/api/bons-cadeaux/confirmation`, où elle
// n'était que LISIBLE. Elle décide de deux choses qui ne se rattrapent pas :
// quel achat a le droit de s'annoncer comme réussi, et si le CODE du bon sort
// du serveur. Un code est un instrument au porteur. On la sort donc ici, pure,
// pour qu'un banc puisse l'EXÉCUTER et qu'une mutation puisse la faire rougir.

// 🔴 SEULS DEUX ÉTATS MÈNENT À UNE CONFIRMATION. `actif`, et le bon dont le
// webhook n'a pas encore basculé la ligne alors que Stripe a déjà confirmé le
// paiement. Un bon annulé, remboursé ou épuisé ne s'annonce pas comme un achat
// qui vient de réussir : c'est un refus, pas une confirmation tiède.
export const ETATS_CONFIRMATION = ['actif', 'paiement_en_attente']

/**
 * Ce que la confirmation d'achat a le droit de dire.
 *
 * @param {object|null} bon Ligne `bons_cadeaux` telle que lue en base.
 * @returns {{ok: true, bon: object}|{ok: false, raison: string}}
 */
export function confirmationDepuisBon(bon) {
  if (!bon) return { ok: false, raison: 'introuvable' }
  if (!ETATS_CONFIRMATION.includes(String(bon.statut || ''))) {
    return { ok: false, raison: 'etat' }
  }

  // ⚠️ LE CODE NE SORT QUE SI L'ACHETEUR EST LE PORTEUR. Sur un cadeau, le
  // porteur est quelqu'un d'autre : le code part chez lui par email, et
  // l'acheteur le retrouve dans son propre email de confirmation. L'afficher
  // sur un écran de retour mettrait de l'argent sous les yeux de qui regarde
  // par-dessus l'épaule, avant même que le destinataire ait reçu son cadeau.
  //
  // ⚠️ ET LE REPLI EST « JE SUIS LE PORTEUR ». `destinataire_mode` vaut 'moi'
  // ou 'offrir' ; toute autre valeur, absente comprise, désigne un achat pour
  // soi, qui est le cas majoritaire. Seul un 'offrir' EXPLICITE retient le
  // code, exactement comme seul un 'alimentaire' explicite dit « gourmand ».
  const pourMoi = String(bon.destinataire_mode || 'moi') !== 'offrir'

  return {
    ok: true,
    bon: {
      montant: Number(bon.montant_initial),
      solde: Number(bon.solde),
      // `paiement_en_attente` ne veut pas dire « pas payé » : Stripe a
      // confirmé, c'est le webhook qui n'est pas encore passé. L'écran le dit
      // avec ses mots, il ne recopie pas ce statut technique.
      actif: String(bon.statut || '') === 'actif',
      expires_at: bon.expires_at ?? null,
      pour_moi: pourMoi,
      beneficiaire_prenom: pourMoi ? null : (bon.beneficiaire_prenom || null),
      code: pourMoi ? (bon.code || null) : null,
      token: pourMoi ? (bon.token || null) : null,
      commercant: {
        nom: bon.commercant?.nom || null,
        slug: bon.commercant?.slug || null,
        categorie: bon.commercant?.categorie || null,
      },
    },
  }
}
