// COMPTER UNE SALLE EN TABLES, PAS EN COUVERTS.
//
// 🔴 LE DÉFAUT QUE CE FICHIER CORRIGE. Une salle se comptait en places : quarante
// couverts, et l'on accepte tant qu'il en reste. Un groupe de six passait donc
// alors que la salle n'avait plus que trois tables de deux, à trois endroits
// différents. Le restaurateur découvrait le problème le soir même, devant six
// personnes debout.
//
// Aucun spécialiste ne compte ainsi. Zenchef tient un « stock de tables »,
// OpenTable assigne sur un inventaire, et tous appliquent la même règle
// d'attribution : LA PLUS PETITE TABLE QUI CONVIENT. C'est elle qui garde les
// grandes tables libres pour les grands groupes, et sans elle une salle se
// fragmente en début de service.
//
// ⚠️ DEUX MODES, ET ILS SE DISENT. Tant qu'un seul format n'a pas sa quantité,
// on reste en couverts, exactement comme avant. Le mode inventaire ne s'allume
// que lorsque TOUS les formats actifs sont renseignés. Un mode implicite
// produirait deux calculs contradictoires selon l'écran qui pose la question,
// et personne ne saurait lequel croire.

// ⚠️ DEPUIS LE MODULE BAS, PAS DEPUIS `rdv-slots` (10/09) : le moteur de
// créneaux lit désormais ce fichier, et l'import dans l'autre sens fermait un
// cycle.
import { timeToMinutes } from './deplacement-rdv'

// Combien d'exemplaires de ce format le commerçant possède-t-il ?
// `null` veut dire « il ne l'a pas dit », ce qui n'est pas « il n'en a pas ».
export function quantiteDe(format) {
  const n = Math.floor(Number(format?.quantite))
  return Number.isFinite(n) && n >= 1 ? n : null
}

// ⚠️ TOUS, PAS AU MOINS UN. Un inventaire à moitié rempli est pire qu'un
// inventaire absent : les formats renseignés seraient comptés en tables et les
// autres en couverts, dans la même salle et pour le même service.
export function enModeInventaire(formats) {
  const tables = (formats || []).filter(f => f && f.par_couverts === true && f.actif !== false)
  return tables.length > 0 && tables.every(f => quantiteDe(f) !== null)
}

// Ce qu'il reste à encoder avant que le mode s'allume, pour le dire à l'écran.
export function formatsSansQuantite(formats) {
  return (formats || [])
    .filter(f => f && f.par_couverts === true && f.actif !== false && quantiteDe(f) === null)
    .map(f => f.nom || 'Sans nom')
}

// La taille d'une table, c'est son maximum de couverts.
export function tailleDe(format) {
  const n = Math.floor(Number(format?.couverts_max))
  return Number.isFinite(n) && n >= 1 ? n : null
}

function minimumDe(format) {
  const n = Math.floor(Number(format?.couverts_min))
  return Number.isFinite(n) && n >= 1 ? n : 1
}

// ─── LA RÈGLE D'ATTRIBUTION ─────────────────────────────────────────────────
//
// Les formats capables d'accueillir ce groupe, du plus juste au plus large.
//
// ⚠️ L'ÉCART D'ABORD, LA TAILLE ENSUITE. Deux formats peuvent avoir le même
// écart si l'un a un minimum plus haut ; on départage par la taille, pour que
// le résultat ne dépende jamais de l'ordre de la liste reçue. Un moteur qui
// change d'avis quand la base rend ses lignes autrement est intenable à
// déboguer.
export function formatsPourGroupe(formats, couverts) {
  const n = Math.floor(Number(couverts))
  if (!Number.isFinite(n) || n < 1) return []
  return (formats || [])
    .filter(f => f && f.par_couverts === true && f.actif !== false)
    .filter(f => {
      const taille = tailleDe(f)
      return taille !== null && n >= minimumDe(f) && n <= taille
    })
    .sort((a, b) => (tailleDe(a) - n) - (tailleDe(b) - n) || tailleDe(a) - tailleDe(b))
}

// Combien d'exemplaires de chaque format sont déjà pris sur cette fenêtre.
//
// ⚠️ ON COMPTE LES CHEVAUCHEMENTS, PAS LES HEURES ÉGALES. Une table à 20h00 et
// une à 20h30 occupent la salle en même temps ; ne compter que les départs
// identiques laisserait passer un service entier décalé d'une demi-heure.
//
// ⚠️ ET UNE RÉSERVATION PREND UNE TABLE, quel que soit le nombre de convives.
// Six personnes sur une table de six, c'est UN exemplaire immobilisé, pas six.
// C'est toute la différence avec le comptage en couverts.
//
// 🔴 ET LES DEUX FORMES QUI CIRCULENT SONT LUES (10/09). La base rend des heures
// (`heure_debut`), le moteur de créneaux manipule des minutes (`start`). Passer
// des minutes à une lecture qui n'attend que des heures ne lève rien : l'heure
// absente vaut 0, aucune réservation ne chevauche plus rien, et la salle paraît
// VIDE. C'est le piège du zéro, et il aurait ouvert toute la salle en silence.
export function occupationParFormat(reservations, debutMin, finMin) {
  const pris = new Map()
  for (const r of (reservations || [])) {
    if (!r?.prestation_id) continue
    const d = typeof r.start === 'number' ? r.start : timeToMinutes(r.heure_debut)
    const f = typeof r.end === 'number' ? r.end : timeToMinutes(r.heure_fin)
    if (!Number.isFinite(d) || !Number.isFinite(f)) continue
    if (!(debutMin < f && finMin > d)) continue
    const cle = String(r.prestation_id)
    pris.set(cle, (pris.get(cle) || 0) + 1)
  }
  return pris
}

// Le format à donner à ce groupe, ou `null` si la salle ne peut pas l'accueillir.
//
// ⚠️ `null` NE VEUT PAS DIRE « COMPLET » : il veut dire « aucune table seule ne
// convient ». Un groupe de dix dans une salle de tables de six n'est pas refusé
// parce que c'est plein, mais parce qu'il faudrait joindre deux tables. C'est le
// lot 3 qui répondra, et l'écran doit pouvoir distinguer les deux cas.
export function formatLibrePour({ formats, couverts, reservations = [], debutMin, finMin }) {
  const candidats = formatsPourGroupe(formats, couverts)
  if (candidats.length === 0) return { format: null, raison: 'aucune_table_a_cette_taille' }

  const pris = occupationParFormat(reservations, debutMin, finMin)
  for (const f of candidats) {
    const total = quantiteDe(f)
    // Un format sans quantité ne peut pas être compté en exemplaires : c'est le
    // mode couverts, et l'appelant n'aurait pas dû arriver ici.
    if (total === null) continue
    if ((pris.get(String(f.id)) || 0) < total) return { format: f, raison: 'ok' }
  }
  return { format: null, raison: 'complet' }
}

// La même décision, rendue dans la forme que lit la grille des horaires.
//
// 🔴 POURQUOI ELLE EXISTE (Alex, 10/09 : « pourquoi ça bloque après deux
// résas ? Il devrait mettre les 2 personnes sur une table de 4 »). Le serveur
// savait monter d'un format ; la fiche, elle, ne regardait que la table
// montrée au client, et elle tenait toute table d'un AUTRE format pour un
// rendez-vous qui occupe la maison. Deux tables de deux réservées à 19h
// fermaient 19h au groupe de quatre, dans une salle aux trois quarts vide.
//
// ⚠️ C'EST `formatLibrePour`, ET RIEN D'AUTRE. L'écran et le serveur doivent
// poser la même question avec la même fonction : une grille qui propose ce que
// le serveur refuse envoie le client jusqu'au bout pour rien, et une grille qui
// refuse ce que le serveur accepterait ferme une salle qui a de la place.
//
// ⚠️ `reservations` : TOUTES celles du jour, sans filtre de praticien. Le
// serveur compte la salle entière, la grille doit compter la même chose.
export function conflitSalle({ formats, couverts, reservations = [], debut, fin }) {
  const choix = formatLibrePour({ formats, couverts, reservations, debutMin: debut, finMin: fin })
  return {
    conflit: !choix.format,
    // « Trop grand » n'est pas « complet » : l'un appelle un coup de fil,
    // l'autre un autre horaire.
    raison: choix.format ? null : choix.raison === 'aucune_table_a_cette_taille' ? 'trop_grand' : 'complet',
    format: choix.format,
    // Une table n'affiche pas « 3 places restantes » : ces champs sont ceux
    // d'un cours, et restent vides.
    inscrits: null,
    places: null,
    placesOccupees: [],
  }
}

// La plus grande tablée que cette salle sait asseoir sur une seule table.
// C'est la borne du sélecteur « nous serons combien ».
//
// ⚠️ AU-DELÀ, ON N'AFFICHE PAS ZÉRO CHOIX : la fiche doit inviter à téléphoner
// plutôt que de laisser le client conclure que le restaurant est fermé. Un
// groupe de douze n'est pas un refus, c'est un appel.
export function plusGrandeTable(formats) {
  return (formats || [])
    .filter(f => f && f.par_couverts === true && f.actif !== false)
    .reduce((m, f) => Math.max(m, tailleDe(f) || 0), 0)
}

// Le format à MONTRER pour un groupe, sans regarder qui est déjà assis.
//
// ⚠️ IL SERT À L'AFFICHAGE, PAS À LA DÉCISION. Le client doit voir un prix et
// une durée avant de choisir son heure, et à cet instant on ne sait pas encore
// quel créneau il prendra. Le serveur, lui, retiendra le premier format
// réellement LIBRE — le même en général, un plus grand si les petites tables
// sont prises. C'est « l'écran propose, le serveur décide », appliqué à une
// table plutôt qu'à un prix.
export function formatPourAffichage(formats, couverts) {
  return formatsPourGroupe(formats, couverts)[0] || null
}

// Ce que la salle porte au total, pour l'afficher au commerçant.
export function couvertsTotaux(formats) {
  return (formats || [])
    .filter(f => f && f.par_couverts === true && f.actif !== false)
    .reduce((s, f) => {
      const q = quantiteDe(f)
      const t = tailleDe(f)
      return q !== null && t !== null ? s + q * t : s
    }, 0)
}

export function tablesTotales(formats) {
  return (formats || [])
    .filter(f => f && f.par_couverts === true && f.actif !== false)
    .reduce((s, f) => s + (quantiteDe(f) || 0), 0)
}
