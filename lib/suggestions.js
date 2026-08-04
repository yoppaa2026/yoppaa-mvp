// Les commerces que les habitants réclament et qui ne sont pas encore sur
// Yoppaa.
//
// Ce signal-là ne concerne PAS le commerçant : c'est la carte de prospection
// d'Alex. Vingt personnes qui réclament la même boulangerie valent plus qu'une
// tournée de démarchage à l'aveugle, et le code postal dit dans quelle commune
// aller.
//
// Le regroupement se fait ici plutôt qu'en SQL : le volume est faible, et une
// fonction se teste au banc alors qu'une vue ne se teste pas.

// Un même commerce sera écrit de dix façons : « Boulangerie Dupont »,
// « boulangerie dupont », « Boul. Dupont ». On ramène tout à une clé commune,
// sans accents ni ponctuation.
export function cleCommerce(nom) {
  return String(nom || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Le code postal belge vit à la fin de l'adresse (« Rue du Moulin 12, 5640
// Mettet »). On prend donc le DERNIER nombre de quatre chiffres : le premier
// serait souvent un numéro de rue.
export function codePostalDe(adresse) {
  const trouves = String(adresse || '').match(/(?<!\d)[1-9]\d{3}(?!\d)/g)
  return trouves?.length ? trouves[trouves.length - 1] : null
}

// Regroupe les suggestions brutes en commerces à démarcher.
//
// Deux suggestions ne parlent du même commerce que si le nom ET le code postal
// concordent : une enseigne peut exister dans deux communes, et ce sont bien
// deux prospects.
//
// ⚠️ Ne renvoie AUCUNE donnée personnelle : ni client_id, ni commentaire nominatif.
export function regrouperSuggestions(lignes = []) {
  const par = new Map()

  for (const l of lignes) {
    const nom = String(l.nom_commerce || '').trim()
    if (!nom) continue
    const cp = codePostalDe(l.adresse)
    const cle = `${cleCommerce(nom)}|${cp || ''}`

    const existant = par.get(cle)
    const date = l.created_at ? new Date(l.created_at) : null

    if (!existant) {
      par.set(cle, {
        cle,
        nom,
        code_postal: cp,
        type_commerce: l.type_commerce || null,
        adresse: l.adresse || null,
        demandes: 1,
        derniere: date,
        premiere: date,
        commentaires: l.commentaire ? [l.commentaire] : [],
      })
      continue
    }

    existant.demandes++
    if (date && (!existant.derniere || date > existant.derniere)) existant.derniere = date
    if (date && (!existant.premiere || date < existant.premiere)) existant.premiere = date
    // La première adresse renseignée gagne : les suivantes sont souvent vides.
    if (!existant.adresse && l.adresse) existant.adresse = l.adresse
    if (!existant.type_commerce && l.type_commerce) existant.type_commerce = l.type_commerce
    if (l.commentaire && existant.commentaires.length < 5) existant.commentaires.push(l.commentaire)
  }

  // Le plus réclamé d'abord : c'est l'ordre dans lequel on démarche. À égalité,
  // le plus récent, parce qu'une demande d'hier se rappelle mieux qu'une
  // demande d'il y a six mois.
  return [...par.values()].sort((a, b) =>
    b.demandes - a.demandes
    || (b.derniere?.getTime() || 0) - (a.derniere?.getTime() || 0)
    || a.nom.localeCompare(b.nom))
}

// Combien de commerces réclamés par commune : la question « où j'y vais en
// premier ». Un code postal absent n'est pas rangé sous une fausse commune.
export function parCodePostal(groupes = []) {
  const par = new Map()
  for (const g of groupes) {
    if (!g.code_postal) continue
    const e = par.get(g.code_postal) || { code_postal: g.code_postal, commerces: 0, demandes: 0 }
    e.commerces++
    e.demandes += g.demandes
    par.set(g.code_postal, e)
  }
  return [...par.values()].sort((a, b) => b.demandes - a.demandes || b.commerces - a.commerces)
}
