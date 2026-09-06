// Liste d'attente des rendez-vous : la règle, sans base ni réseau.
//
// POURQUOI CE FICHIER EXISTE. Décider qui prévenir quand une place se libère
// est du raisonnement pur, et c'est là que le module se trompera : une heure
// comparée au mauvais format, une fenêtre de dates qui exclut son dernier
// jour, un push programmé après le début du créneau. Rien de tout ça ne
// demande une base de données pour être vérifié, et rien de tout ça ne se voit
// à l'oeil nu dans une route de 300 lignes.
//
// 🔴 LES DEUX PORTÉES NE SONT PAS UN RAFFINEMENT, CE SONT DEUX GESTES. Décision
// d'Alex du 13/08 : un cours complet reste affiché, grisé ; un créneau
// individuel pris, lui, DISPARAÎT. Donc en collectif le client clique sur la
// séance qu'il veut, et en solo il n'a rien à cliquer : il ne voit que le vide,
// sous « aucun créneau libre ce jour-là ». C'est ce qui décide de ce qu'on
// stocke, et la portée ne se choisit pas : elle se DÉDUIT de la capacité.

export const PORTEE_SEANCE  = 'seance'
export const PORTEE_FENETRE = 'fenetre'

export const STATUT_EN_ATTENTE = 'en_attente'
export const STATUT_PREVENU    = 'prevenu'
export const STATUT_SERVI      = 'servi'

// La fenêtre de priorité : le premier est prévenu tout de suite, le suivant un
// quart d'heure plus tard, et ainsi de suite. Personne ne bloque le créneau
// (arbitrage d'Alex, 06/09) : on prévient dans l'ordre, on ne réserve pas.
export const MINUTES_PRIORITE = 15

// UN SEUL geste en plus côté client : jusqu'à quand ça t'intéresse. Pas de
// matin-midi-soir au départ, un formulaire de plus tuerait le geste.
export const DUREES_FENETRE = [
  { cle: 'semaine',   libelle: 'Cette semaine',      jours: 7  },
  { cle: 'quinzaine', libelle: 'Les quinze jours',   jours: 15 },
  { cle: 'mois',      libelle: 'Le mois qui vient',  jours: 30 },
]

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/

// « 09:30:00 » et « 09:30 » désignent la même heure. La base rend la première
// forme, l'écran envoie la seconde, et une comparaison stricte entre les deux
// est fausse SANS JAMAIS LEVER D'ERREUR : personne ne serait prévenu, et rien
// ne le dirait.
export function memeHeure(a, b) {
  const ha = String(a || '').slice(0, 5)
  const hb = String(b || '').slice(0, 5)
  return ha.length === 5 && ha === hb
}

// Ajoute des jours à une date ISO, à midi UTC pour qu'aucun changement d'heure
// ne fasse basculer le résultat d'un jour.
export function jourPlus(jourISO, jours) {
  const j = String(jourISO || '').trim()
  if (!JOUR_ISO.test(j)) return null
  // 🔴 LE PIÈGE DU ZÉRO. `Number(null)` vaut 0, donc sans cette ligne une durée
  // ABSENTE rendrait le jour même, et « préviens-moi » ouvrirait une fenêtre
  // qui se referme le soir. Zéro jour est une demande, l'absence n'en est pas
  // une : on les sépare AVANT de convertir.
  if (jours === null || jours === undefined || jours === '') return null
  const n = Number(jours)
  if (!Number.isFinite(n)) return null
  const d = new Date(`${j}T12:00:00Z`)
  if (isNaN(d.getTime())) return null
  const fin = new Date(d.getTime() + Math.round(n) * 86400000)
  return fin.toISOString().slice(0, 10)
}

// LA PORTÉE SE DÉDUIT, ELLE NE SE CHOISIT PAS. Si l'écran l'envoyait, il
// suffirait d'une requête forgée pour attendre « une séance » sur un salon de
// coiffure, et cette ligne ne serait jamais trouvée par personne.
//
// ⚠️ Le piège du zéro : `Number(null)` vaut 0, et 0 n'est pas supérieur à 1.
// Une capacité absente retombe donc sur l'individuel, qui est le bon repli.
export function porteeDe(prestation) {
  const cap = Number(prestation?.capacite)
  return Number.isFinite(cap) && cap > 1 ? PORTEE_SEANCE : PORTEE_FENETRE
}

// Le commerçant a-t-il ouvert une file sur cette prestation ? 0 = non.
export function attenteOuverte(prestation) {
  const max = Number(prestation?.attente_max)
  return Number.isFinite(max) && max > 0
}

export function plafondDe(prestation) {
  const max = Number(prestation?.attente_max)
  return Number.isFinite(max) && max > 0 ? Math.floor(max) : 0
}

export function dureeFenetre(cle) {
  return DUREES_FENETRE.find(d => d.cle === cle) || null
}

// La plage de dates d'une attente en solo, depuis le jour où il la pose.
export function fenetreDepuis(jourISO, cle) {
  const duree = dureeFenetre(cle)
  if (!duree) return null
  const debut = String(jourISO || '').trim()
  if (!JOUR_ISO.test(debut)) return null
  const fin = jourPlus(debut, duree.jours)
  return fin ? { date_debut: debut, date_fin: fin } : null
}

// Ce qu'il faut écrire en base pour une inscription, selon la portée. Rend
// `null` si la demande n'a pas de sens : c'est la seule porte d'entrée, donc
// c'est ici qu'on refuse une séance sans heure ou une fenêtre sans durée.
export function lignePourInscription({ prestation, jourISO, dateRdv, heureDebut, duree }) {
  if (!prestation?.id || !prestation?.commercant_id) return null
  const portee = porteeDe(prestation)
  const base = {
    commercant_id: prestation.commercant_id,
    prestation_id: prestation.id,
    portee,
  }
  if (portee === PORTEE_SEANCE) {
    const d = String(dateRdv || '').trim()
    const h = String(heureDebut || '').slice(0, 5)
    if (!JOUR_ISO.test(d) || h.length !== 5) return null
    // ⚠️ On n'attend pas une séance déjà passée. `jourISO` est le jour de
    // Bruxelles, la seule référence qui vaille ici.
    if (JOUR_ISO.test(String(jourISO || '')) && d < jourISO) return null
    return { ...base, date_rdv: d, heure_debut: h, date_debut: null, date_fin: null }
  }
  const plage = fenetreDepuis(jourISO, duree)
  if (!plage) return null
  return { ...base, date_rdv: null, heure_debut: null, ...plage }
}

// Reste-t-il de la place dans la file ? Le plafond compte PAR SÉANCE en
// collectif et PAR PRESTATION en solo : sinon cinq personnes inscrites sur le
// cours du lundi bloqueraient le mardi, qu'elles n'attendent pas.
export function peutAttendre({ prestation, dejaEnAttente = 0, dejaInscrit = false }) {
  if (!attenteOuverte(prestation)) {
    return { ok: false, raison: 'fermee' }
  }
  if (dejaInscrit) return { ok: false, raison: 'deja_inscrit' }
  const dejaN = Number(dejaEnAttente)
  const deja = Number.isFinite(dejaN) && dejaN > 0 ? Math.floor(dejaN) : 0
  if (deja >= plafondDe(prestation)) return { ok: false, raison: 'complete' }
  return { ok: true, raison: null }
}

// ─── LE PLAFOND COMPTE CE QU'ON ATTEND ─────────────────────────────────────
// 🔴 EN COLLECTIF ON COMPTE PAR SÉANCE, EN SOLO PAR PRESTATION. Compter par
// prestation dans les deux cas ferait que cinq inscrits sur le cours du lundi
// bloqueraient le mardi, que personne n'attend. Compter par séance dans les
// deux cas ne voudrait rien dire en solo, où il n'y a aucune séance à viser.
export function memeCible(a, b) {
  if (!a || !b) return false
  if (!a.prestation_id || a.prestation_id !== b.prestation_id) return false
  if (a.portee !== b.portee) return false
  if (a.portee === PORTEE_SEANCE) {
    return String(a.date_rdv || '') === String(b.date_rdv || '')
        && memeHeure(a.heure_debut, b.heure_debut)
  }
  if (a.portee === PORTEE_FENETRE) return true
  return false
}

// Combien de personnes VIVANTES visent déjà la même chose. ⚠️ Les lignes
// expirées ne comptent pas : sinon une file se fermerait pour toujours au
// premier mois chargé, et personne ne comprendrait pourquoi.
export function compterMemeCible(lignes, cible, jourISO) {
  return (lignes || []).filter(l => attenteVivante(l, jourISO) && memeCible(l, cible)).length
}

export function dejaDansLaFile(lignes, cible, clientId) {
  if (!clientId) return false
  return (lignes || []).some(l =>
    l.statut !== STATUT_SERVI && String(l.client_id) === String(clientId) && memeCible(l, cible))
}

// ─── LE DÉSISTEMENT ────────────────────────────────────────────────────────
// Une place qui se libère, c'est toujours prestation + date + heure. On
// cherche les `seance` qui collent exactement, PLUS les `fenetre` de la même
// prestation dont la plage contient ce jour. Un déclencheur, deux filtres.
export function concerneParLaPlace(ligne, place) {
  if (!ligne || !place) return false
  if (ligne.statut === STATUT_SERVI) return false
  if (!ligne.prestation_id || ligne.prestation_id !== place.prestation_id) return false

  const jour = String(place.date_rdv || '').trim()
  if (!JOUR_ISO.test(jour)) return false

  if (ligne.portee === PORTEE_SEANCE) {
    return ligne.date_rdv === jour && memeHeure(ligne.heure_debut, place.heure_debut)
  }
  if (ligne.portee === PORTEE_FENETRE) {
    const d = String(ligne.date_debut || '')
    const f = String(ligne.date_fin || '')
    if (!JOUR_ISO.test(d) || !JOUR_ISO.test(f)) return false
    // Bornes INCLUSES : « jusqu'au 20 » veut dire que le 20 compte encore.
    return d <= jour && jour <= f
  }
  return false
}

// La file concernée, dans l'ordre d'arrivée. ⚠️ L'ordre EST le rang : pas de
// colonne à renuméroter, donc pas de renumérotation qui échoue à moitié et
// donne deux premiers.
export function fileConcernee(lignes, place) {
  return (lignes || [])
    .filter(l => concerneParLaPlace(l, place))
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
}

// La chaîne des notifications : le premier tout de suite, les suivants tous
// les quinze minutes, et TOUS ANNULABLES tant qu'ils ne sont pas partis.
//
// 🔴 ON NE PROGRAMME RIEN APRÈS LE DÉBUT DU CRÉNEAU. Une annulation qui tombe
// quarante minutes avant un cours ferait sinon partir un push pendant la
// séance, pour une place qui n'existe plus : le pire des messages, celui qui
// apprend à ignorer les suivants.
export function chaineDePushs(file, { maintenantMs, debutMs = null, minutes = MINUTES_PRIORITE } = {}) {
  const depart = Number(maintenantMs)
  if (!Number.isFinite(depart)) return []
  const m = Number(minutes)
  const pas = (Number.isFinite(m) && m > 0 ? Math.floor(m) : MINUTES_PRIORITE) * 60000
  const limite = Number.isFinite(Number(debutMs)) && debutMs !== null ? Number(debutMs) : null

  const out = []
  const liste = file || []
  for (let i = 0; i < liste.length; i++) {
    const quand = depart + i * pas
    if (limite !== null && quand >= limite) break
    out.push({
      id: liste[i].id,
      rang: i + 1,
      envoiMs: quand,
      // Le premier part maintenant : pas de `send_after`, donc rien à annuler
      // pour lui. Les suivants sont programmés, donc annulables.
      sendAfter: i === 0 ? null : new Date(quand).toISOString(),
      prioriteJusqu: new Date(quand + pas).toISOString(),
    })
  }
  return out
}

// Une attente est-elle encore vivante aujourd'hui ? ⚠️ CE SONT LES DATES QUI
// FONT SORTIR DE LA FILE, pas un statut posé par un cron : un balayage qui ne
// tourne pas laisserait des lignes « en attente » sur des séances de l'an
// dernier, et personne ne s'en apercevrait.
export function attenteVivante(ligne, jourISO) {
  if (!ligne || ligne.statut === STATUT_SERVI) return false
  const jour = String(jourISO || '').trim()
  if (!JOUR_ISO.test(jour)) return false
  if (ligne.portee === PORTEE_SEANCE) return String(ligne.date_rdv || '') >= jour
  if (ligne.portee === PORTEE_FENETRE) return String(ligne.date_fin || '') >= jour
  return false
}

// Ce que le Yopper lit dans « ce que j'attends ».
export function libelleAttente(ligne) {
  if (!ligne) return ''
  if (ligne.portee === PORTEE_SEANCE) {
    const h = String(ligne.heure_debut || '').slice(0, 5)
    return h ? `le ${jourLisible(ligne.date_rdv)} à ${h}` : `le ${jourLisible(ligne.date_rdv)}`
  }
  return `jusqu’au ${jourLisible(ligne.date_fin)}`
}

const MOIS = ['janvier','février','mars','avril','mai','juin',
              'juillet','août','septembre','octobre','novembre','décembre']

export function jourLisible(jourISO) {
  const j = String(jourISO || '').trim()
  if (!JOUR_ISO.test(j)) return ''
  const [a, m, d] = j.split('-')
  const mois = MOIS[Number(m) - 1]
  if (!mois) return ''
  return `${Number(d)} ${mois}${Number(a) !== new Date().getFullYear() ? ` ${a}` : ''}`
}
