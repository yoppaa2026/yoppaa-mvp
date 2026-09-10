// LES COURS COLLECTIFS : plusieurs personnes sur un même créneau.
//
// Yoppaa ne connaissait qu'un modèle de rendez-vous, une personne pour un
// créneau, ce qui décrit bien un coiffeur et pas du tout un cours de yoga de
// dix personnes à 10h. C'est pourtant le quotidien d'un studio, d'un coach ou
// d'une auto-école.
//
// ⚠️ LA CAPACITÉ VIT SUR LA PRESTATION, décision d'Alex du 13/08 : « Hatha
// yoga, 12 places », « Séance individuelle, 1 place ». Réglée une fois, valable
// partout. La jauge par salle a été écartée, elle obligeait à renseigner une
// capacité à chaque plage horaire.
//
// ⚠️ ET LE DÉFAUT EST 1, ce qui protège tout le parc : une prestation qui n'a
// jamais vu ce réglage reste individuelle, et son commerçant ne voit aucune
// différence.
//
// Fonctions PURES : aucune lecture de base, aucune horloge.

// ⚠️ LE MODULE BAS, ET LUI SEUL : il n'importe rien, aucun cycle possible.
import { timeToMinutes, finApresMinuit } from './deplacement-rdv'

// Une capacité absente, nulle ou aberrante vaut 1.
//
// ⚠️ ON EXIGE UN NOMBRE VALABLE, on n'écarte pas des cas d'absence un par un.
// Les deux formes de l'absence se comportent à l'opposé l'une de l'autre,
// `Number(null)` valant 0 et `Number(undefined)` valant NaN, et ce projet s'y
// est déjà fait prendre deux fois. Les énumérer serait donc fragile : il
// suffirait d'en oublier une. On demande l'inverse, un nombre fini et au moins
// égal à 1, et tout le reste retombe sur le défaut sans avoir été nommé.
//
// ⚠️ Une première version testait AUSSI `null`, `undefined` et la chaîne vide
// avant ce contrôle. Deux mutations du banc ont montré que ce garde-fou ne
// protégeait rien de plus : le contrôle final rattrapait déjà tous ces cas.
// Un test de plus n'aurait rien prouvé, la ligne en moins est plus honnête.
export function capacitePrestation(prestation) {
  const n = Number(prestation?.capacite)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

// Un cours collectif, ou un rendez-vous en tête à tête ?
// 🔴 UNE TABLE N'EST PAS UN COURS (Alex, 10/09 : « c'est un peu confus »).
//
// Cette fonction confondait deux notions sous la même condition, `capacite > 1` :
//   • PLUSIEURS PLACES PAR CRÉNEAU, vrai pour un cours ET pour une table : c'est
//     ce qui donne un rang à chaque réservation (`place_no`), et ça reste juste ;
//   • UN COURS À HEURE FIXE, qui ne se réserve que sur une plage qui le nomme,
//     vrai pour le yoga de 10h et FAUX pour une table.
//
// Depuis que la capacité d'une table se déduit de son inventaire — six tables de
// quatre font vingt-quatre —, chaque format de table est devenu, pour le code, un
// « cours de vingt-quatre personnes ». Trois conséquences, toutes vues par Alex :
//   • le tableau de bord annonçait « 2 cours n'ont pas encore d'horaire » et
//     demandait d'ouvrir « une plage à l'heure du cours » ;
//   • la fiche marquait les tables « dates à venir » ;
//   • et surtout le moteur de créneaux, qui n'accepte un cours que sur une plage
//     qui le nomme, n'offrait AUCUN horaire à un groupe de quatre — même sur une
//     plage « toutes mes prestations ».
//
// ⚠️ UNE TABLE SE RÉSERVE SUR TOUT SERVICE QUI L'ACCUEILLE. Elle ne se donne pas
// à heure fixe : c'est le client qui choisit quand il vient dîner.
export function estCoursCollectif(prestation) {
  return prestation?.par_couverts !== true && capacitePrestation(prestation) > 1
}

// ─── COMPTER DES COUVERTS PLUTÔT QUE DES LIGNES (09/09) ─────────────────────
//
// 🔴 UNE TABLE N'EST PAS UNE PLACE. Un cours de yoga, c'est une personne par
// inscription : compter les lignes suffit. Une table, c'est UNE réservation
// pour QUATRE personnes, et la salle se remplit en couverts.
//
// ⚠️ TOUT EST ADDITIF, ET C'EST LA CONDITION POUR TOUCHER CE FICHIER. `couverts`
// vaut 1 par défaut en base, et `par_couverts` vaut faux partout : pour chaque
// cours existant, la somme des couverts EST le compte des lignes, au sens
// strict. Aucun agenda ne change.
export function estParCouverts(prestation) {
  return prestation?.par_couverts === true
}

export function couvertsDe(reservation) {
  const n = Number(reservation?.couverts)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
}

// Ce qu'occupe un ensemble de réservations : des lignes, ou des couverts.
export function occupationDe(prestation, reservations = []) {
  const enCouverts = estParCouverts(prestation)
  return (reservations || []).reduce((s, r) => s + (enCouverts ? couvertsDe(r) : 1), 0)
}

// Les bornes du « pour combien de personnes ? ».
//
// ⚠️ LE MAXIMUM NE DÉPASSE JAMAIS LA CAPACITÉ. Un restaurant qui accepte des
// tables de douze dans une salle de huit couverts afficherait un choix qui ne
// peut aboutir, et le client irait jusqu'au bout pour lire « complet ».
export function bornesCouverts(prestation) {
  const capacite = capacitePrestation(prestation)
  const minDeclare = Number(prestation?.couverts_min)
  const min = Number.isFinite(minDeclare) && minDeclare >= 1 ? Math.floor(minDeclare) : 1
  const maxDeclare = Number(prestation?.couverts_max)
  const max = Number.isFinite(maxDeclare) && maxDeclare >= 1 ? Math.floor(maxDeclare) : capacite
  return { min: Math.min(min, capacite), max: Math.max(Math.min(min, capacite), Math.min(max, capacite)) }
}

// Le nombre de couverts demandé, ramené dans les bornes. Sert au serveur : un
// écran propose, il ne décide pas.
export function couvertsValides(prestation, demandes) {
  if (!estParCouverts(prestation)) return 1
  const { min, max } = bornesCouverts(prestation)
  const n = Math.floor(Number(demandes))
  if (!Number.isFinite(n)) return null
  return n >= min && n <= max ? n : null
}

// ─── LA DURÉE SUIT LA TAILLE DU GROUPE (lot 1, 09/09) ───────────────────────
//
// 🔴 UNE DURÉE UNIQUE FAIT MENTIR L'AGENDA DANS LES DEUX SENS. Une table de deux
// libérée après deux heures, c'est un service perdu ; une table de huit reprise
// après quatre-vingt-dix minutes, c'est un client debout à côté de sa chaise.
// L'enquête chez les spécialistes donne les mêmes ordres partout : deux
// personnes 90 minutes, quatre 120, six et plus 150.
//
// FORME DES PALIERS : `[{ des: 5, minutes: 150 }]`, lu « à partir de 5 couverts,
// compter 150 minutes ». Le palier retenu est celui dont le seuil est le PLUS
// HAUT parmi ceux que le groupe atteint.
//
// ⚠️ SANS PALIER, LA DURÉE DE BASE, et c'est ce qui rend le lot inoffensif : la
// colonne est nulle sur les neuf prestations du parc, donc chaque agenda calcule
// aujourd'hui exactement ce qu'il calculait hier.
//
// ⚠️ ET SEULEMENT SUR UNE TABLE. Un cours de yoga dure ce qu'il dure, que trois
// ou douze personnes s'y inscrivent : les paliers n'ont aucun sens hors d'une
// salle qui se remplit en couverts.
export function dureeDeBase(prestation) {
  const d = Math.floor(Number(prestation?.duree_minutes))
  return Number.isFinite(d) && d > 0 ? d : 60
}

export function dureeSelonCouverts(prestation, couverts) {
  const base = dureeDeBase(prestation)
  if (!estParCouverts(prestation)) return base
  const n = Math.floor(Number(couverts))
  if (!Number.isFinite(n) || n < 1) return base

  // ⚠️ `Array.isArray` ET PAS UNE VÉRITÉ SIMPLE : la colonne est un jsonb, elle
  // peut revenir en objet si quelqu'un l'écrit à la main malgré la contrainte.
  // Un `for...of` sur un objet lèverait, et l'écran entier tomberait pour un
  // libellé de durée.
  const paliers = Array.isArray(prestation?.duree_paliers) ? prestation.duree_paliers : []
  let retenu = base
  let seuilRetenu = 0
  for (const p of paliers) {
    const des = Math.floor(Number(p?.des))
    const minutes = Math.floor(Number(p?.minutes))
    // Un palier illisible est IGNORÉ, jamais interprété : mieux vaut la durée de
    // base qu'une table bloquée trois heures par un `NaN`.
    if (!Number.isFinite(des) || !Number.isFinite(minutes)) continue
    if (des < 1 || minutes <= 0) continue
    if (n >= des && des > seuilRetenu) { seuilRetenu = des; retenu = minutes }
  }
  return retenu
}

// Ce qu'on enregistre quand le commerçant règle ses paliers : trié, dédoublonné,
// nettoyé de ce qui ne veut rien dire.
//
// ⚠️ ON NORMALISE À L'ÉCRITURE, PAS À LA LECTURE. Un tableau propre en base se
// relit partout de la même façon ; un tableau sale se réinterprète différemment
// dans chaque écran qui le touche, et c'est ainsi qu'on obtient deux durées pour
// une même table.
export function palierNettoyes(paliers) {
  const vus = new Map()
  for (const p of (Array.isArray(paliers) ? paliers : [])) {
    const des = Math.floor(Number(p?.des))
    const minutes = Math.floor(Number(p?.minutes))
    if (!Number.isFinite(des) || !Number.isFinite(minutes)) continue
    if (des < 1 || minutes <= 0) continue
    // Le dernier saisi gagne : c'est ce que le commerçant vient d'écrire.
    vus.set(des, minutes)
  }
  return [...vus.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([des, minutes]) => ({ des, minutes }))
}

// Les places encore libres sur un créneau.
//
// `occupees` est le nombre d'inscrits DÉJÀ CONFIRMÉS. On ne descend jamais
// sous zéro : une capacité réduite après coup laisserait sinon apparaître un
// nombre négatif à l'écran du client.
export function placesRestantes(prestation, occupees = 0) {
  const total = capacitePrestation(prestation)
  const prises = Math.max(0, Number(occupees) || 0)
  return Math.max(0, total - prises)
}

export function estComplet(prestation, occupees = 0) {
  return placesRestantes(prestation, occupees) === 0
}

// LA PREMIÈRE PLACE LIBRE, celle que le prochain inscrit va occuper.
//
// ⚠️ CE N'EST PAS `nombre d'inscrits + 1`. Quand quelqu'un annule, sa place se
// libère au MILIEU : sur un cours de dix où les places 1, 2 et 4 sont prises,
// la suivante est la 3, pas la 4. Compter les inscrits aurait redonné la 4,
// déjà occupée, et l'index unique aurait rejeté l'inscription. Le client
// aurait lu « ce créneau vient d'être pris » devant un cours à moitié vide.
//
// Rend null si tout est occupé.
export function premierePlaceLibre(prestation, placesPrises = []) {
  const total = capacitePrestation(prestation)
  const prises = new Set((placesPrises || []).map(n => Number(n)).filter(Number.isFinite))
  for (let place = 1; place <= total; place++) {
    if (!prises.has(place)) return place
  }
  return null
}

// LE RANG D'UNE TABLE, QUI N'EST PAS UNE PLACE DE COURS (10/09).
//
// 🔴 LE DÉFAUT QU'ALEX A TOUCHÉ : « pourquoi ça bloque après deux résas ? ».
// L'index anti double-booking `rdv_no_double_book` porte sur (commerce,
// praticien, date, heure de début, place) — SANS LA PRESTATION. Pour un cours,
// c'est juste : la place se compte dans la séance. Pour une salle, non : deux
// tables de deux prennent les rangs 1 et 2 à 19h, la table de quatre calculait
// son rang dans SON format, obtenait 1, et la base la rejetait comme un
// doublon. Le serveur avait bien trouvé la table ; l'écriture la refusait.
//
// ⚠️ LE RANG SE CHERCHE DONC PARMI TOUTES LES RÉSERVATIONS DE CETTE HEURE, tous
// formats et tous praticiens confondus, et il N'A PAS DE PLAFOND. Pour une
// table, ce n'est pas lui qui dit « complet » : c'est l'inventaire, contrôlé
// avant. Borné par la capacité d'un format, il redonnerait une place déjà prise
// dès que les autres formats en occupent plus que lui.
//
// ⚠️ ET L'INDEX GARDE SON RÔLE. Deux réservations qui arrivent à la même seconde
// trouvent le même rang libre : la base en refuse une, atomiquement, et c'est
// précisément ce qu'on attend d'elle.
export function rangLibre(placesPrises = []) {
  const prises = new Set((placesPrises || []).map(n => Number(n)).filter(Number.isFinite))
  let rang = 1
  while (prises.has(rang)) rang++
  return rang
}

// Ce qu'on affiche au client sous un créneau de cours.
//
// ⚠️ UN COURS COMPLET RESTE AFFICHÉ, grisé, décision d'Alex du 13/08. Le faire
// disparaître laisserait croire qu'il n'y a pas cours ce jour-là, alors que
// l'information utile est « c'est plein, regarde un autre jour ». Elle sert
// aussi au commerçant : un cours toujours complet lui dit d'en ouvrir un autre.
export function libellePlaces(prestation, occupees = 0) {
  if (!estCoursCollectif(prestation)) return null
  const restantes = placesRestantes(prestation, occupees)
  if (restantes === 0) return 'Complet'
  if (restantes === 1) return '1 place restante'
  return `${restantes} places restantes`
}

// CE QUE L'AGENDA DOIT DESSINER pour une liste de rendez-vous qui démarrent au
// même moment.
//
// ⚠️ L'agenda place ses blocs en position ABSOLUE, calés sur l'heure de début.
// Douze inscrits au même cours donneraient donc douze blocs exactement l'un
// sur l'autre : le commerçant verrait un seul nom, celui du dernier rendu, et
// n'aurait aucun moyen de savoir que onze autres personnes viennent.
//
// On rend donc une liste de blocs où chaque cours compte pour UN, et où les
// rendez-vous individuels restent tels quels. La distinction se lit sur
// `capacite_creneau`, gravé dans la réservation : aucune jointure nécessaire.
export function blocsAgenda(rdvs = []) {
  const blocs = []
  const seances = new Map()

  for (const r of (rdvs || [])) {
    if (!r) continue
    const capacite = Number(r.capacite_creneau) || 1
    if (capacite <= 1) {
      blocs.push({ type: 'rdv', cle: r.id, rdv: r, heure_debut: r.heure_debut, heure_fin: r.heure_fin })
      continue
    }
    // ⚠️ LE PRATICIEN NE FAIT PAS PARTIE DE LA CLÉ, et il en faisait partie
    // jusqu'au 16/08. Un cours de douze s'affichait « 2/12 » alors qu'il était
    // PLEIN : dix inscrites portaient la praticienne, deux avaient réservé
    // « sans préférence », et l'agenda en faisait DEUX séances.
    //
    // ⚠️ CE N'ÉTAIT PAS UN DÉFAUT D'AFFICHAGE, C'ÉTAIT DEUX DÉFINITIONS DE LA
    // MÊME CHOSE. La capacité est portée par la PRESTATION ; le garde-fou de
    // réservation compte donc les inscrits sur date + heure + prestation, et
    // c'est lui qui a correctement refusé la treizième. L'agenda ajoutait le
    // praticien, donc il ne pouvait pas tomber sur le même nombre.
    //
    // Dans le bon modèle, le praticien est un attribut de chaque INSCRIPTION,
    // jamais de la séance : un cours de yoga à 10:00 est un cours, que les gens
    // aient coché une praticienne ou non.
    const cle = [r.date_rdv, r.heure_debut, r.prestation_id].join('|')
    if (!seances.has(cle)) {
      const seance = {
        type: 'seance', cle,
        heure_debut: r.heure_debut, heure_fin: r.heure_fin,
        // Le praticien reste celui du premier inscrit : il ne définit plus la
        // séance, il sert encore à la colorer et à l'annoncer.
        prestation_id: r.prestation_id, praticien_id: r.praticien_id || null,
        capacite, inscrits: [],
      }
      seances.set(cle, seance)
      blocs.push(seance)
    }
    seances.get(cle).inscrits.push(r)
  }

  for (const s of seances.values()) {
    s.inscrits.sort((a, b) => (Number(a.place_no) || 1) - (Number(b.place_no) || 1))
  }
  return blocs
}

// Les inscrits d'un même cours, regroupés pour l'agenda du commerçant.
//
// ⚠️ UN BLOC PAR COURS, PAS UNE LIGNE PAR INSCRIT. Dix lignes empilées sur le
// même créneau rendent une journée illisible, et c'est le genre d'écran qu'un
// commerçant cesse d'ouvrir. Le regroupement se fait sur ce qui définit une
// séance : la date, l'heure et la prestation.
//
// ⚠️ LE PRATICIEN EN A ÉTÉ RETIRÉ LE 16/08, comme dans `blocsAgenda`, et les
// deux clés doivent rester identiques. Deux définitions de « la même séance »
// dans le même fichier, c'est exactement le défaut qu'on vient de corriger :
// elles finiraient par diverger, et le second à changer aurait tort sans que
// rien ne le dise.
//
// Rend une liste triée par heure, chaque entrée portant ses inscrits.
export function regrouperEnSeances(reservations = []) {
  const parCle = new Map()
  for (const r of (reservations || [])) {
    if (!r) continue
    const cle = [r.date_rdv, r.heure_debut, r.prestation_id].join('|')
    if (!parCle.has(cle)) {
      parCle.set(cle, {
        cle,
        date_rdv: r.date_rdv,
        heure_debut: r.heure_debut,
        heure_fin: r.heure_fin,
        prestation_id: r.prestation_id,
        praticien_id: r.praticien_id || null,
        inscrits: [],
      })
    }
    parCle.get(cle).inscrits.push(r)
  }
  const seances = [...parCle.values()]
  for (const s of seances) {
    s.inscrits.sort((a, b) => (Number(a.place_no) || 1) - (Number(b.place_no) || 1))
  }
  seances.sort((a, b) => String(a.date_rdv).localeCompare(String(b.date_rdv))
    || String(a.heure_debut).localeCompare(String(b.heure_debut)))
  return seances
}

// ─── LES SERVICES D'UNE SALLE (10/09) ────────────────────────────────────────
//
// 🔴 CE QU'ALEX A VU : « l'agenda n'est pas correct, et quand je clique il ne me
// donne pas le résumé complet ; je dois cliquer sur les tables de 2, puis sur
// celles de 6 ». L'agenda d'une salle était celui d'un studio de yoga : un bloc
// par FORMAT et par heure de départ, comme un cours. Or dans une salle, les
// tables qui se chevauchent sont l'ordinaire d'un service. Les blocs partis à
// 18h00 et à 18h30 se recouvraient, le second cachait le premier, et chacun
// n'ouvrait que son format : le restaurateur ne voyait jamais son service.
//
// ✅ UN BLOC PAR SERVICE : toutes les tables qui se chevauchent, de la première
// arrivée au dernier départ, quels que soient leur format et leur heure. C'est
// ainsi qu'un restaurateur pense sa soirée.
//
// Une réservation est une table quand SA prestation l'est : la jointure doit
// donc porter `par_couverts` (voir `SELECT_RDVS`, tableau de bord).
export function estReservationDeTable(reservation) {
  return reservation?.prestation?.par_couverts === true
}

const enHeure = (minutes) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

// ⚠️ UNE RÉSERVATION QUI COMMENCE PENDANT UN SERVICE LE REJOINT, et le service
// s'allonge jusqu'à son départ. Deux services ne se touchent que s'il y a un
// vrai trou : une table qui part à 19h30 et une qui arrive à 19h30 ne se
// chevauchent pas, elles appartiennent à deux services.
//
// ⚠️ LA FIN APRÈS MINUIT se compte après le début : une table de 23h00 à 00:30
// dure une heure et demie, pas moins vingt-deux heures.
//
// Rend les services dans l'ordre du jour, chacun avec ses tables dans l'ordre
// d'arrivée, et le résumé des arrivées heure par heure.
export function servicesDeSalle(reservations = []) {
  const tables = (reservations || [])
    .filter(r => r && estReservationDeTable(r) && r.heure_debut && r.heure_fin)
    .map(r => {
      const debut = timeToMinutes(r.heure_debut)
      return { r, debut, fin: finApresMinuit(debut, timeToMinutes(r.heure_fin)) }
    })
    .sort((a, b) => a.debut - b.debut || a.fin - b.fin || (Number(a.r.place_no) || 1) - (Number(b.r.place_no) || 1))

  const groupes = []
  let courant = null
  for (const t of tables) {
    if (!courant || t.debut >= courant.finMin) {
      courant = { debutMin: t.debut, finMin: t.fin, tables: [] }
      groupes.push(courant)
    }
    courant.tables.push(t.r)
    courant.finMin = Math.max(courant.finMin, t.fin)
  }

  return groupes.map(g => {
    const arrivees = []
    for (const r of g.tables) {
      const heure = String(r.heure_debut).slice(0, 5)
      let a = arrivees.find(x => x.heure === heure)
      if (!a) { a = { heure, tables: 0, couverts: 0 }; arrivees.push(a) }
      a.tables += 1
      a.couverts += couvertsDe(r)
    }
    return {
      type: 'service',
      cle: `service|${g.tables[0]?.date_rdv || ''}|${g.debutMin}`,
      debutMin: g.debutMin,
      finMin: g.finMin,
      heure_debut: enHeure(g.debutMin),
      heure_fin: enHeure(g.finMin),
      tables: g.tables,
      arrivees,
    }
  })
}

// La case de l'agenda où un bloc commence, et sa hauteur de départ dedans.
//
// 🔴 UN RENDEZ-VOUS À 18h15 N'APPARAISSAIT PAS DU TOUT (trouvé le 10/09). La
// grille est découpée en demi-heures et ne dessinait un bloc que dans la case
// dont l'heure était EXACTEMENT la sienne. À 18h15 ou 18h45, aucune case ne
// correspondait : la réservation existait, comptait dans « À venir », et ne se
// voyait nulle part. Le jour où un salon ou un restaurant passe ses créneaux au
// quart d'heure, la moitié de son agenda disparaît sans une erreur.
//
// ✅ Le bloc se pose dans la case qui CONTIENT son heure, décalé du nombre de
// minutes qui l'en séparent.
export function caseDeDepart(debutMin, heureMin, pasMinutes) {
  const pas = Number(pasMinutes) > 0 ? Number(pasMinutes) : 30
  const rang = Math.floor((Number(debutMin) - Number(heureMin)) / pas)
  const caseMin = Number(heureMin) + rang * pas
  return { caseMin, decalage: Number(debutMin) - caseMin }
}
