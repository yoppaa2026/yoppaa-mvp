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
import { timeToMinutes, minutesDeLHeure, heureDeMinutes } from './deplacement-rdv'
// ⚠️ DANS CE SENS-LÀ SEULEMENT : `cours-collectifs` n'importe que le module bas,
// jamais ce fichier. L'inverse fermerait un cycle.
import { estParCouverts, dureeSelonCouverts, couvertsDe } from './cours-collectifs'

// Combien d'exemplaires de ce format le commerçant possède-t-il ?
// `null` veut dire « il ne l'a pas dit », ce qui n'est pas « il n'en a pas ».
// ⚠️ Pour une JOINTURE, c'est le nombre de jointures possibles EN MÊME TEMPS.
export function quantiteDe(format) {
  const n = Math.floor(Number(format?.quantite))
  return Number.isFinite(n) && n >= 1 ? n : null
}

// ─── LES TABLES JOINTES (lot 3, 11/09) ──────────────────────────────────────
//
// 🔴 LA DEMANDE EXACTE DU BISTROLOGUE : « j'autorise le couplage de x fois 2
// tables de 4 personnes, si une personne veut réserver pour 6 ou 8 alors qu'il
// n'y a que des tables de 2 ou 4 ». Sans ça, un groupe de huit n'avait que le
// téléphone, et un groupe de six était refusé dès que les deux tables de six
// étaient prises, dans une salle pleine de tables de quatre.
//
// Une jointure est une ligne de `rdv_prestations`, comme un format : « 2 tables
// de 4 jointes, de 6 à 8 personnes, 2 à la fois ». `jointure_de` dit la table
// qu'on joint, `jointure_tables` combien. Sa capacité se DÉCLARE, elle ne
// s'additionne pas : deux tables de 4 ne font pas toujours 8, on perd souvent
// les bouts.
//
// ⚠️ ELLE N'EST PAS UNE TABLE DE PLUS. Elle ne compte ni dans les tables de la
// salle, ni dans ses couverts, ni dans le mode inventaire : elle ASSEMBLE des
// tables qui existent déjà, et une réservation posée dessus en immobilise
// `jointure_tables` exemplaires.
export function estJointure(format) {
  return !!format && format.jointure_de != null && String(format.jointure_de) !== ''
}

// Combien de tables une jointure assemble, ou `null` si ce n'est pas lisible.
export function tablesDeLaJointure(format) {
  const n = Math.floor(Number(format?.jointure_tables))
  return Number.isFinite(n) && n >= 2 ? n : null
}

// Les tables SEULES de la salle, celles qui existent vraiment : l'inventaire.
function tablesSeules(formats) {
  return (formats || []).filter(f => f && f.par_couverts === true && f.actif !== false && !estJointure(f))
}

// ⚠️ TOUS, PAS AU MOINS UN. Un inventaire à moitié rempli est pire qu'un
// inventaire absent : les formats renseignés seraient comptés en tables et les
// autres en couverts, dans la même salle et pour le même service.
// ⚠️ LES JOINTURES N'Y ENTRENT PAS : elles ne sont pas des tables de plus.
export function enModeInventaire(formats) {
  const tables = tablesSeules(formats)
  return tables.length > 0 && tables.every(f => quantiteDe(f) !== null)
}

// Ce qu'il reste à encoder avant que le mode s'allume, pour le dire à l'écran.
export function formatsSansQuantite(formats) {
  return tablesSeules(formats)
    .filter(f => quantiteDe(f) === null)
    .map(f => f.nom || 'Sans nom')
}

// La table qu'une jointure assemble, telle que la liste la porte.
export function baseDeLaJointure(jointure, formats) {
  if (!estJointure(jointure)) return null
  return (formats || []).find(f => f && String(f.id) === String(jointure.jointure_de)) || null
}

// Les jointures que le moteur peut proposer.
//
// ⚠️ PAS D'INVENTAIRE, PAS DE JOINTURE : en couverts, on ne sait pas quelles
// tables sont libres, donc on ne sait pas en joindre deux.
// ⚠️ ET UNE JOINTURE N'EST VALABLE QUE SI SA TABLE L'EST : active, seule (pas
// elle-même une jointure), et en assez d'exemplaires. Deux tables de 4 jointes
// dans une salle qui n'en a qu'une ne seraient jamais libres, et le client lirait
// « complet » à toutes les heures au lieu de « appelle-nous ».
export function jointuresValides(formats) {
  if (!enModeInventaire(formats)) return []
  return (formats || []).filter(j => {
    if (!j || j.par_couverts !== true || j.actif === false || !estJointure(j)) return false
    const k = tablesDeLaJointure(j)
    if (k === null || quantiteDe(j) === null || tailleDe(j) === null) return false
    const base = baseDeLaJointure(j, formats)
    if (!base || base.par_couverts !== true || base.actif === false || estJointure(base)) return false
    const q = quantiteDe(base)
    return q !== null && q >= k
  })
}

// Le nom proposé pour une nouvelle jointure : « 2 tables de 4 jointes » quand
// la table s'appelle « Table de 4 », « 2 × Banquette » sinon. Le restaurateur
// peut le changer : c'est ce qu'il lira dans son agenda.
export function nomDeJointure(base, tables) {
  const k = Math.floor(Number(tables))
  const nom = String(base?.nom || '').trim()
  if (!nom || !Number.isFinite(k) || k < 2) return nom
  const m = /^tables?\s+(de|pour)\s+(\d+)(.*)$/i.exec(nom)
  return m ? `${k} tables ${m[1].toLowerCase()} ${m[2]}${m[3]} jointes` : `${k} × ${nom}`
}

// ─── LE RÉGLAGE D'UNE JOINTURE, DANS LES TABLES DU RESTAURATEUR ─────────────

// Les tables qu'on peut joindre : actives, seules, et au moins deux exemplaires.
export function basesJoignables(formats) {
  return tablesSeules(formats).filter(f => (quantiteDe(f) || 0) >= 2 && tailleDe(f) !== null)
}

// Les jointures faites de cette table, telles que la liste les porte.
export function jointuresDe(base, formats) {
  if (!base) return []
  return (formats || []).filter(j => estJointure(j) && String(j.jointure_de) === String(base.id))
}

// Ce que le formulaire propose pour une nouvelle jointure.
//
// ⚠️ UNE SEULE À LA FOIS PAR DÉFAUT, pas autant que la salle le permet. Chaque
// jointure immobilise des tables que d'autres groupes auraient prises : c'est
// au restaurateur de dire combien de ses tables peuvent vraiment se
// rapprocher. Par défaut, on en engage le moins possible.
// ⚠️ À PARTIR D'UNE PERSONNE DE PLUS QUE LA TABLE, jusqu'à la somme : c'est
// l'endroit où la jointure commence à servir, et le restaurateur corrige la
// somme s'il perd les bouts.
// ⚠️ LA DURÉE DU PLUS LONG REPAS DE LA SALLE : un grand groupe reste au moins
// aussi longtemps que la plus grande table pleine.
export function jointureParDefaut(base, formats, tables = 2) {
  const k = Math.max(2, Math.floor(Number(tables)) || 2)
  const t = tailleDe(base) || 1
  const duree = tablesSeules(formats).reduce(
    (m, f) => Math.max(m, dureeSelonCouverts(f, tailleDe(f) || 1)),
    dureeSelonCouverts(base, t * k))
  return {
    nom: nomDeJointure(base, k),
    couverts_min: t + 1,
    couverts_max: t * k,
    quantite: 1,
    duree_minutes: duree,
  }
}

// Ce qui empêche d'enregistrer une jointure, dit en une phrase, ou `null`.
//
// ⚠️ LE MÊME MOT QUE LA BASE, AVANT ELLE : la base refuse aussi une jointure
// sans table ou d'une seule table, mais son refus arriverait en message brut.
export function verifierJointure({ base, tables, couverts_min, couverts_max, quantite }) {
  if (!base || estJointure(base) || base.par_couverts !== true || quantiteDe(base) === null) {
    return 'Choisis une table de ta salle à joindre.'
  }
  const q = quantiteDe(base)
  const k = Math.floor(Number(tables))
  if (q < 2) return `Il te faut au moins deux « ${base.nom} » pour les joindre.`
  if (!Number.isFinite(k) || k < 2 || k > q) return `Tu as ${q} « ${base.nom} » : tu peux en joindre de 2 à ${q}.`
  const min = Math.floor(Number(couverts_min))
  const max = Math.floor(Number(couverts_max))
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < 2) {
    return 'Dis pour combien de personnes, au moins deux.'
  }
  if (min > max) return '« À partir de » ne peut pas dépasser « Jusqu’à ».'
  const x = Math.floor(Number(quantite))
  const possible = Math.floor(q / k)
  if (!Number.isFinite(x) || x < 1 || x > possible) {
    return `Avec ${q} « ${base.nom} » jointes par ${k}, tu peux en avoir ${possible} au plus en même temps.`
  }
  return null
}

// Ce que la carte d'une jointure doit dire, s'il y a quelque chose à dire.
// ⚠️ UNE JOINTURE QUI N'EST PLUS PROPOSÉE LE DIT : sinon le restaurateur la
// voit dans sa liste et croit qu'un groupe de huit peut réserver.
export function alerteJointure(jointure, formats) {
  const base = baseDeLaJointure(jointure, formats)
  const k = tablesDeLaJointure(jointure)
  if (!base || base.deleted_at) return 'Sa table n’existe plus : cette jointure n’est pas proposée.'
  if (base.actif === false) return `« ${base.nom} » est désactivée : cette jointure n’est pas proposée.`
  const q = quantiteDe(base)
  if (q === null || k === null || q < k) return `Il faut au moins ${k || 2} « ${base.nom} » pour la proposer.`
  const possible = Math.floor(q / k)
  const x = quantiteDe(jointure)
  if (x !== null && x > possible) return `Tes ${q} « ${base.nom} » n’en permettent que ${possible} à la fois.`
  return null
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
//
// 🔴 LES JOINTURES VIENNENT APRÈS TOUTES LES TABLES SEULES, jamais avant (lot 3).
// C'est le « dernier recours » de l'enquête : deux tables jointes coûtent deux
// tables. Un groupe de six prend la table de six tant qu'il en reste une, et ne
// passe sur deux tables de quatre jointes que quand elles sont toutes prises.
// Entre jointures, même règle d'écart, puis la moins gourmande en tables.
export function formatsPourGroupe(formats, couverts) {
  const n = Math.floor(Number(couverts))
  if (!Number.isFinite(n) || n < 1) return []
  const accueille = (f) => {
    const taille = tailleDe(f)
    return taille !== null && n >= minimumDe(f) && n <= taille
  }
  const parEcart = (a, b) => (tailleDe(a) - n) - (tailleDe(b) - n) || tailleDe(a) - tailleDe(b)
  const seules = tablesSeules(formats).filter(accueille).sort(parEcart)
  const jointes = jointuresValides(formats).filter(accueille)
    .sort((a, b) => parEcart(a, b)
      || tablesDeLaJointure(a) - tablesDeLaJointure(b)
      || String(a.id).localeCompare(String(b.id)))
  return [...seules, ...jointes]
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
//
// 🔴 UNE JOINTURE IMMOBILISE SES TABLES (lot 3). Un groupe de huit posé sur « 2
// tables de 4 jointes » compte pour DEUX tables de quatre, et pour une jointure
// en cours. Sans `formats`, on ne sait pas qu'une ligne est une jointure : ses
// deux tables de quatre paraîtraient libres, et la fiche les vendrait pendant
// que le groupe est attablé. C'est pourquoi chaque appelant du module la passe.
// ⚠️ LA TRADUCTION VAUT POUR TOUTE JOINTURE CONNUE, même éteinte ou devenue
// invalide : ses réservations sont assises, ce n'est pas une affaire de réglage.
export function occupationParFormat(reservations, debutMin, finMin, formats = null) {
  const jointures = new Map()
  for (const j of (formats || [])) {
    if (!estJointure(j)) continue
    const k = tablesDeLaJointure(j)
    if (k !== null) jointures.set(String(j.id), { base: String(j.jointure_de), k })
  }
  const pris = new Map()
  for (const r of (reservations || [])) {
    if (!r?.prestation_id) continue
    const d = typeof r.start === 'number' ? r.start : timeToMinutes(r.heure_debut)
    const f = typeof r.end === 'number' ? r.end : timeToMinutes(r.heure_fin)
    if (!Number.isFinite(d) || !Number.isFinite(f)) continue
    if (!(debutMin < f && finMin > d)) continue
    const cle = String(r.prestation_id)
    pris.set(cle, (pris.get(cle) || 0) + 1)
    const j = jointures.get(cle)
    if (j) pris.set(j.base, (pris.get(j.base) || 0) + j.k)
  }
  return pris
}

// Combien de jointures de ce type la salle peut encore assembler sur la
// fenêtre : pas plus que le restaurateur n'en autorise à la fois, et pas plus
// que ses tables libres ne le permettent.
function jointuresLibres(jointure, formats, pris) {
  const base = baseDeLaJointure(jointure, formats)
  const k = tablesDeLaJointure(jointure)
  const q = quantiteDe(base)
  const x = quantiteDe(jointure)
  if (!base || k === null || q === null || x === null) return 0
  const tablesLibres = Math.max(0, q - (pris.get(String(base.id)) || 0))
  return Math.max(0, Math.min(x - (pris.get(String(jointure.id)) || 0), Math.floor(tablesLibres / k)))
}

// Combien de jointures de ce type la salle peut assembler au mieux, salle vide.
function jointuresTotales(jointure, formats) {
  const q = quantiteDe(baseDeLaJointure(jointure, formats))
  const k = tablesDeLaJointure(jointure)
  const x = quantiteDe(jointure)
  if (q === null || k === null || x === null) return 0
  return Math.min(x, Math.floor(q / k))
}

// Le format à donner à ce groupe, ou `null` si la salle ne peut pas l'accueillir.
//
// ⚠️ `null` NE VEUT PAS DIRE « COMPLET » : il veut dire « aucune table ne
// convient, même jointe ». Un groupe de douze dans une salle qui joint au mieux
// deux tables de quatre n'est pas refusé parce que c'est plein, mais parce que
// sa salle ne sait pas l'asseoir : l'un appelle un coup de fil, l'autre un autre
// horaire, et l'écran doit pouvoir distinguer les deux cas.
export function formatLibrePour({ formats, couverts, reservations = [], debutMin, finMin }) {
  const candidats = formatsPourGroupe(formats, couverts)
  if (candidats.length === 0) return { format: null, raison: 'aucune_table_a_cette_taille' }

  const pris = occupationParFormat(reservations, debutMin, finMin, formats)
  for (const f of candidats) {
    // Une jointure est libre si le restaurateur en autorise encore une à cette
    // heure, ET si assez de ses tables le sont.
    if (estJointure(f)) {
      if (jointuresLibres(f, formats, pris) > 0) return { format: f, raison: 'ok' }
      continue
    }
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
//
// ⚠️ AU-DELÀ, ON N'AFFICHE PAS ZÉRO CHOIX : la fiche doit inviter à téléphoner
// plutôt que de laisser le client conclure que le restaurant est fermé. Un
// groupe de douze n'est pas un refus, c'est un appel.
export function plusGrandeTable(formats) {
  return tablesSeules(formats).reduce((m, f) => Math.max(m, tailleDe(f) || 0), 0)
}

// 🔴 LE PLUS GRAND GROUPE QUE LA SALLE SAIT ASSEOIR, JOINTURES COMPRISES (lot 3).
// C'est la borne du sélecteur « nous serons combien » : sans elle, un
// restaurant qui joint deux tables de quatre pour huit n'aurait proposé que
// jusqu'à six, et le groupe de huit aurait continué à téléphoner pour rien.
export function plusGrandGroupe(formats) {
  return jointuresValides(formats).reduce((m, j) => Math.max(m, tailleDe(j) || 0), plusGrandeTable(formats))
}

// Les tailles de groupe que la salle sait asseoir, de 1 au plus grand groupe.
//
// ⚠️ IL PEUT Y AVOIR DES TROUS, et un bouton qui ne mène à rien ne se montre
// pas. Des tables jusqu'à 4 et une jointure « de 6 à 8 » laissent le groupe de
// cinq sans table : son bouton, cliqué, ne ferait rien sans le dire. La fiche
// ne le propose pas et lui dit d'appeler.
export function taillesReservables(formats) {
  const out = []
  const max = plusGrandGroupe(formats)
  for (let n = 1; n <= max; n++) {
    if (formatsPourGroupe(formats, n).length > 0) out.push(n)
  }
  return out
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
// ⚠️ SANS LES JOINTURES : elles assemblent des tables déjà comptées. Les
// ajouter annoncerait au Bistrologue une salle de cinquante-six couverts.
export function couvertsTotaux(formats) {
  return tablesSeules(formats)
    .reduce((s, f) => {
      const q = quantiteDe(f)
      const t = tailleDe(f)
      return q !== null && t !== null ? s + q * t : s
    }, 0)
}

export function tablesTotales(formats) {
  return tablesSeules(formats).reduce((s, f) => s + (quantiteDe(f) || 0), 0)
}

// ─── LA DURÉE DU REPAS : CELLE DU GROUPE, PAS CELLE DE LA TABLE ─────────────
//
// 🔴 ÉCRITE UNE SEULE FOIS (10/09 au soir). Le serveur la calculait dans son
// coin et la saisie au téléphone en calculait une autre : un couple posé au
// téléphone sur une table de quatre bloquait deux heures, le même couple
// réservé en ligne une heure et demie. Sur l'agenda d'Alex, deux « Table de
// 4 · 2 couverts » l'une sous l'autre, de 18:15 à 19:45 et de 19:00 à 21:00.
//
// La référence est la plus petite table faite pour ce groupe, libre ou non :
// c'est la durée que la fiche a annoncée au client. Hors inventaire, la durée
// reste celle de la table désignée, exactement comme avant.
export function dureeDuGroupe({ prestation, formats, couverts }) {
  const duree = dureeSelonCouverts(prestation, couverts)
  if (!estParCouverts(prestation) || !enModeInventaire(formats)) return duree
  const reference = formatPourAffichage(formats, couverts)
  return reference ? dureeSelonCouverts(reference, couverts) : duree
}

// Les statuts qui OCCUPENT une table. Un rendez-vous annulé libère la sienne.
// ⚠️ LA LISTE DU SERVEUR (`rdv-creation-server`), et un banc vérifie qu'elles
// ne divergent pas : une salle comptée autrement à l'écran et au serveur
// dirait « libre » d'un côté et « complet » de l'autre.
export const STATUTS_QUI_OCCUPENT = ['confirme', 'honore']

// ─── LA CADENCE DE LA CUISINE (lot 5, 12/09) ────────────────────────────────
//
// 🔴 VINGT COUVERTS À 20:00 ET RIEN À 20:30, CE N'EST PAS UNE BONNE SOIRÉE,
// C'EST UN COUP DE FEU. La salle peut avoir dix tables libres à 20:00 : si
// toutes arrivent en même temps, la cuisine envoie vingt entrées d'un coup et
// les derniers attendent quarante minutes. Le restaurateur règle donc combien
// de personnes peuvent ARRIVER sur un même quart d'heure ; au-delà, sa fiche
// propose un autre quart d'heure. OpenTable appelle ça ses « flow controls » ;
// dans notre gamme de prix, personne ne le fait.
//
// ⚠️ C'EST LA CUISINE QUI DÉCIDE, PAS LA SALLE : un seul nombre pour tout le
// restaurant, toutes salles, toutes tables et toutes prestations confondues.
// Deux salles, une cuisine.
//
// ⚠️ ON COMPTE LES ARRIVÉES, PAS LES PRÉSENCES. Une table assise depuis 19:00 ne
// charge plus la cuisine comme celle qui commande à 20:00. C'est toute la
// différence avec l'inventaire, qui compte les chevauchements.
//
// ⚠️ DES QUARTS D'HEURE D'HORLOGE (19:00, 19:15, 19:30…), pas une fenêtre
// glissante : c'est ce que le réglage annonce, et une règle qu'on ne peut pas
// dire en une phrase ne se vérifie pas de tête au téléphone.
//
// ✅ UN GROUPE PLUS GRAND QUE LA CADENCE PASSE S'IL ARRIVE SEUL SUR SON QUART
// D'HEURE (mon choix, à faire valider par Alex). Le restaurateur qui a une
// table de douze sait servir douze personnes d'un coup ; sans cette règle, un
// groupe de douze ne trouverait AUCUNE heure en ligne dès que la cadence vaut
// dix, et lirait une journée entière « complet » dans une salle vide.
//
// Rien de tout ça ne s'applique quand le restaurateur n'a rien réglé : `null`,
// et chaque écran se comporte exactement comme avant.
export const QUART_MINUTES = 15
// ⚠️ LES MÊMES BORNES QUE LA BASE (MIGRATION_CADENCE_CUISINE.sql), et un banc
// vérifie qu'elles ne divergent pas : l'écran accepterait sinon un nombre que
// la base refuse, avec un message brut.
export const CADENCE_MIN = 1
export const CADENCE_MAX = 200

// La cadence réglée par ce commerce, ou `null` s'il n'en a pas.
// ⚠️ `null` N'EST PAS ZÉRO : zéro fermerait tout le restaurant, rien veut dire
// « pas de limite ». Et un réglage qu'on ne sait pas lire ne ferme pas une fiche.
export function plafondCadence(commercant) {
  const brut = commercant?.rdv_cadence_couverts
  if (brut === null || brut === undefined || brut === '') return null
  const n = Number(brut)
  return Number.isInteger(n) && n >= CADENCE_MIN && n <= CADENCE_MAX ? n : null
}

// Ce que le restaurateur tape dans son réglage, vérifié avant d'être écrit.
// Vide : pas de cadence. Rend `{ ok, valeur, message }`.
export function validerCadence(saisie) {
  const texte = String(saisie ?? '').trim()
  if (texte === '') return { ok: true, valeur: null, message: null }
  const n = /^\d+$/.test(texte) ? Number(texte) : NaN
  if (!Number.isInteger(n) || n < CADENCE_MIN || n > CADENCE_MAX) {
    return { ok: false, valeur: null, message: `Un nombre de personnes entre ${CADENCE_MIN} et ${CADENCE_MAX}, ou rien pour ne pas limiter.` }
  }
  return { ok: true, valeur: n, message: null }
}

// Le quart d'heure d'horloge d'une heure en minutes : 19:07 donne 19:00.
export function quartDe(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return null
  const m = Number(minutes)
  return Number.isFinite(m) ? Math.floor(m / QUART_MINUTES) * QUART_MINUTES : null
}

// Combien de personnes arrivent déjà sur le quart d'heure de `debutMin`.
//
// ⚠️ LES DEUX FORMES QUI CIRCULENT, comme `occupationParFormat` : des minutes
// (`start`, le moteur de créneaux) ou des heures (`heure_debut`, la base). Une
// heure illisible ne compte pour aucun quart d'heure : lue comme minuit, elle
// chargerait celui de 00:00 d'une arrivée qui n'existe pas.
// ⚠️ UNE RÉSERVATION QUI N'OCCUPE PLUS RIEN NE COMPTE PAS, même si un appelant
// l'a laissée passer. Et `exclureId`, la réservation qu'on déplace, ne se gêne
// pas elle-même.
export function arriveesDuQuart(reservations, debutMin, { exclureId = null } = {}) {
  const q = quartDe(debutMin)
  if (q === null) return 0
  return (reservations || []).reduce((s, r) => {
    if (!r) return s
    if (r.statut && !STATUTS_QUI_OCCUPENT.includes(r.statut)) return s
    if (exclureId != null && String(r.id) === String(exclureId)) return s
    const d = typeof r.start === 'number' ? r.start : minutesDeLHeure(r.heure_debut)
    if (d === null || !Number.isFinite(d) || quartDe(d) !== q) return s
    return s + couvertsDe(r)
  }, 0)
}

// Ce que la cadence dit d'un groupe qui arriverait à `debutMin`, ou `null`
// quand aucune cadence n'est réglée : rien à dire, rien à retenir.
export function etatCadence({ plafond, couverts, reservations = [], debutMin, exclureId = null } = {}) {
  const p = Number.isInteger(plafond) && plafond >= CADENCE_MIN ? plafond : null
  const quart = quartDe(debutMin)
  if (p === null || quart === null) return null
  const n = Math.max(1, Math.floor(Number(couverts)) || 1)
  const arrivees = arriveesDuQuart(reservations, debutMin, { exclureId })
  return {
    plafond: p,
    quart,
    arrivees,
    apres: arrivees + n,
    restants: Math.max(0, p - arrivees),
    // ✅ SEUL SUR SON QUART D'HEURE, un groupe plus grand que la cadence passe.
    depasse: arrivees > 0 && arrivees + n > p,
  }
}

// Ce que l'écran du restaurateur dit d'une cadence dépassée, ou `null`.
// ⚠️ ELLE NE PARLE QUE QUAND IL Y A QUELQUE CHOSE À DIRE : une alarme qui sonne
// à chaque saisie ne se lit plus.
// ✅ ET ELLE PRÉVIENT SANS BLOQUER, comme la salle (décision d'Alex, 10/09 :
// « prévenir, puis laisser poser ») : il connaît sa cuisine et son équipe du
// soir. Ce qu'il pose quand même compte dans le quart d'heure, et le ferme en
// ligne.
export function phraseCadence(etat, { deplacement = false } = {}) {
  if (!etat?.depasse) return null
  const a = etat.arrivees
  const n = etat.apres - etat.arrivees
  return {
    ton: 'alerte',
    titre: `${a} personne${a > 1 ? 's arrivent' : ' arrive'} déjà sur le quart d’heure de ${heureDeMinutes(etat.quart)} : ta cuisine en accepte ${etat.plafond}.`,
    detail: `Avec ${n > 1 ? `ces ${n}` : 'cette personne'}, ce serait ${etat.apres} en même temps. Tu peux ${deplacement ? 'la déplacer' : 'la poser'} quand même : elle comptera dans ce quart d’heure comme les autres.`,
  }
}

// Ce que lit le CLIENT quand la cuisine est pleine sur son quart d'heure.
// ⚠️ UNE SEULE PHRASE POUR LES DEUX PORTES : le contrôle d'avant envoi de la
// fiche et le refus du serveur. Il n'a pas à connaître la cadence, seulement
// qu'une autre heure a sa chance.
export function phraseCuisinePleine({ heure, nom } = {}) {
  const h = String(heure || '').slice(0, 5)
  const qui = String(nom || '').trim() || 'Le restaurant'
  return h
    ? `À ${h}, ${qui} accueille déjà autant de monde que sa cuisine le permet. Choisis une autre heure : un quart d’heure plus tôt ou plus tard suffit souvent.`
    : `${qui} accueille déjà autant de monde que sa cuisine le permet à cette heure-là. Choisis une autre heure : un quart d’heure plus tôt ou plus tard suffit souvent.`
}

// Les réservations qui occupent la salle ce jour-là, tous formats confondus,
// et la cadence de la cuisine.
//
// ⚠️ UNE SEULE LECTURE POUR LES DEUX FENÊTRES DU TABLEAU DE BORD, la saisie et
// le déplacement. Deux copies d'une même requête finissent toujours par
// diverger, et c'est alors une fenêtre qui voit une salle que l'autre ne voit
// pas. `db` est le client de l'appelant : ici celui du restaurateur, qui ne lit
// que ses propres réservations.
// ⚠️ `couverts` : la cadence compte des personnes, pas des tables.
// ⚠️ ET LA CADENCE SE RELIT EN BASE AVEC ELLE, jamais dans l'état du tableau de
// bord : réglée à l'instant dans les Réservations, elle doit valoir tout de
// suite au téléphone, sans recharger la page.
export async function lireSalleDuJour(db, { commercantId, dateStr }) {
  const [resas, reglage] = await Promise.all([
    db
      .from('rdv_reservations')
      .select('id, prestation_id, heure_debut, heure_fin, statut, couverts')
      .eq('commercant_id', commercantId)
      .eq('date_rdv', dateStr)
      .in('statut', STATUTS_QUI_OCCUPENT)
      .is('deleted_at', null),
    db
      .from('commercants')
      .select('rdv_cadence_couverts')
      .eq('id', commercantId)
      .maybeSingle(),
  ])
  return {
    reservations: resas?.data || [],
    plafond: plafondCadence(reglage?.data),
    error: resas?.error || reglage?.error || null,
  }
}

// ─── LA SALLE, VUE PAR LE RESTAURATEUR (Alex, 10/09 au soir) ────────────────
//
// 🔴 « QUAND ON AJOUTE UNE RÉSA MANUELLEMENT, IL TIENT COMPTE DES DISPOS ? »
// Non. La saisie au téléphone vérifiait les horaires, jamais la salle. Le
// restaurateur choisissait un format à l'aveugle, pouvait poser une troisième
// table de deux là où il n'en a que deux, et ce couple, assis en vrai à une
// table de quatre, laissait cette table LIBRE aux yeux de la fiche en ligne,
// qui pouvait la vendre une seconde fois.
//
// ⚠️ LES FONCTIONS DU SERVEUR, RIEN DE RECOPIÉ : `formatLibrePour` pour la table
// proposée, `occupationParFormat` pour ce qui reste libre. L'écran qui dirait
// « libre » là où le serveur dirait « complet » serait pire que pas d'écran.
//
// `reservations` : celles du jour qui OCCUPENT (confirmées, honorées), tous
// formats confondus. `exclureId` : la réservation qu'on déplace, qui ne se gêne
// pas elle-même, sans quoi elle se compterait deux fois à son ancienne heure.
//
// 🔴 LES JOINTURES ONT LEUR LIGNE, APRÈS LES TABLES (lot 3), marquée
// `jointure: true` : « 2 tables de 4 jointes : 1 sur 2 », c'est-à-dire combien
// on peut encore en assembler, sur combien au mieux. Et les tables qu'elles
// immobilisent sont retirées de leur format : deux tables de quatre jointes
// pour un groupe de huit ne sont plus « libres » sur la ligne des tables de
// quatre.
export function etatSalle({ formats, couverts, reservations = [], debutMin, finMin, exclureId = null }) {
  const autres = exclureId == null
    ? (reservations || [])
    : (reservations || []).filter(r => String(r?.id) !== String(exclureId))
  const candidats = formatsPourGroupe(formats, couverts)
  const convient = new Set(candidats.map(f => String(f.id)))
  const pris = occupationParFormat(autres, debutMin, finMin, formats)
  const parTaille = (a, b) => (tailleDe(a) || 0) - (tailleDe(b) || 0) || String(a.nom || '').localeCompare(String(b.nom || ''))
  const seules = tablesSeules(formats)
    .filter(f => quantiteDe(f) !== null)
    .sort(parTaille)
    .map(f => {
      const total = quantiteDe(f)
      const occupes = pris.get(String(f.id)) || 0
      return { format: f, total, pris: occupes, libres: Math.max(0, total - occupes), convient: convient.has(String(f.id)), jointure: false }
    })
  const jointes = jointuresValides(formats)
    .sort(parTaille)
    .map(j => ({
      format: j,
      total: jointuresTotales(j, formats),
      pris: pris.get(String(j.id)) || 0,
      libres: jointuresLibres(j, formats, pris),
      convient: convient.has(String(j.id)),
      jointure: true,
    }))
  const choix = formatLibrePour({ formats, couverts, reservations: autres, debutMin, finMin })
  return { proposition: choix.format, raison: choix.raison, reference: candidats[0] || null, parFormat: [...seules, ...jointes] }
}

// La table à écrire, et s'il faut l'accord du restaurateur pour l'écrire.
//
// ✅ DÉCISION D'ALEX, 10/09 : « prévenir, puis laisser poser ». Quand plus
// aucune table ne convient, l'écran le DIT et propose de poser quand même : le
// restaurateur connaît sa salle, une table d'appoint, la terrasse. Un refus le
// renverrait à son carnet, et une réservation hors de l'agenda est pire qu'une
// réservation en trop : celle-ci, au moins, compte dans la salle et ferme la
// place en ligne.
//
// ⚠️ `prefere` : la table que le restaurateur a désignée, ou celle qu'occupe
// déjà la réservation qu'on déplace. Libre, elle est gardée.
// ⚠️ `basculer` : prise, passe-t-on à la table libre proposée ? OUI pour un
// déplacement, où personne n'a choisi de table, seulement une heure. NON pour
// un choix explicite : on le prévient, on ne le corrige pas dans son dos.
//
// `forcer: true` : cette table n'a plus d'exemplaire libre sur toute la durée
// du repas, et l'écrire demande son accord.
export function tableAPoser(etat, { prefere = null, basculer = false } = {}) {
  if (!etat) return { format: null, forcer: false, raison: 'inconnu' }
  if (etat.raison === 'aucune_table_a_cette_taille') return { format: null, forcer: false, raison: 'trop_grand' }
  const idPrefere = prefere && typeof prefere === 'object' ? prefere.id : prefere
  if (idPrefere != null && idPrefere !== '') {
    const ligne = (etat.parFormat || []).find(l => String(l.format.id) === String(idPrefere))
    if (ligne && ligne.convient) {
      if (ligne.libres > 0) return { format: ligne.format, forcer: false, raison: 'ok' }
      if (!basculer || !etat.proposition) return { format: ligne.format, forcer: true, raison: 'complet' }
    }
  }
  if (etat.proposition) return { format: etat.proposition, forcer: false, raison: 'ok' }
  return { format: etat.reference, forcer: true, raison: 'complet' }
}

// Ce que l'écran dit de la salle : un ton, une phrase, un détail.
//
// ⚠️ UN MESSAGE FAUX EST PIRE QU'ABSENT. « Aucune n'est libre de 19:00 à
// 20:30 » est exact : chaque exemplaire est pris à un moment du repas. « Toutes
// prises jusqu'à 19:30 » ne l'aurait été que pour la première qui se libère.
//
// `manuel` : le restaurateur a désigné la table lui-même. `actuel` : pour un
// déplacement, la table qu'occupe la réservation aujourd'hui.
export function phraseSalle({ formats, etat, choix, couverts, debut, fin, manuel = false, deplacement = false, actuel = null }) {
  if (!choix || choix.raison === 'inconnu') return null
  const n = Math.floor(Number(couverts))
  const personnes = `${n} personne${n > 1 ? 's' : ''}`
  const fenetre = `de ${debut} à ${fin}`
  const poser = deplacement ? 'la déplacer' : 'la poser'

  if (choix.raison === 'trop_grand') {
    // ⚠️ AVEC DES JOINTURES, LE PLUS GRAND GROUPE N'EST PLUS LA PLUS GRANDE
    // TABLE : dire « la plus grande en accueille 6 » à qui joint deux tables de
    // quatre pour huit serait faux, et renverrait chercher une table de huit.
    const joint = jointuresValides(formats).length > 0
    const max = joint ? plusGrandGroupe(formats) : plusGrandeTable(formats)
    const pourquoi = n > max
      ? (joint ? `Même en joignant des tables, ta salle accueille ${max} personnes au plus.` : `La plus grande en accueille ${max}.`)
      : 'Le minimum de chaque table se règle dans tes tables, avec « À partir de ».'
    // ⚠️ UNE RÉSERVATION QUI EXISTE DÉJÀ NE SE BLOQUE PAS : si les tables ont
    // changé depuis qu'elle a été prise, la déplacer reste possible. Elle garde
    // sa table, et le restaurateur le sait.
    return deplacement
      ? { ton: 'alerte', titre: `Aucune de tes tables n’accueille ${personnes}.`, detail: `${pourquoi} Elle garde sa table actuelle : tu peux la déplacer quand même si tu as une solution en salle.` }
      : { ton: 'refus', titre: `Aucune de tes tables n’accueille ${personnes}.`, detail: pourquoi }
  }

  if (choix.forcer) {
    const recours = `Tu peux ${poser} quand même si tu as une solution en salle, une table d’appoint ou la terrasse. Elle comptera dans ton service comme les autres.`
    if (manuel && etat?.proposition) {
      return {
        ton: 'alerte',
        titre: `« ${choix.format.nom} » : aucune n’est libre ${fenetre}.`,
        detail: `« ${etat.proposition.nom} » l’est. ${recours}`,
      }
    }
    return {
      ton: 'alerte',
      titre: manuel
        ? `« ${choix.format.nom} » : aucune n’est libre ${fenetre}.`
        : `Plus aucune table pour ${personnes} n’est libre ${fenetre}.`,
      detail: recours,
    }
  }

  // La table retenue n'est pas la plus petite qui convient : on dit pourquoi.
  const petite = etat?.reference
  const monte = !manuel && petite && String(petite.id) !== String(choix.format.id)
  // ⚠️ UN DÉPLACEMENT QUI GARDE SA TABLE N'A RIEN À DIRE DE PLUS : la fenêtre
  // affiche déjà « Libre : ... ». Elle ne parle que si la table change.
  if (deplacement) {
    if (!actuel || String(actuel.id) === String(choix.format.id)) return null
    return {
      ton: 'ok',
      titre: `Elle passe sur « ${choix.format.nom} ».`,
      detail: `Aucune « ${actuel.nom} » n’est libre ${fenetre}.`,
    }
  }
  return {
    ton: 'ok',
    titre: `${choix.format.nom} · ${debut} → ${fin}`,
    detail: monte ? `« ${petite.nom} » : aucune n’est libre ${fenetre}.` : null,
  }
}
