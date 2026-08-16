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
export function estCoursCollectif(prestation) {
  return capacitePrestation(prestation) > 1
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
