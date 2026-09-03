// Rétrécir la liste des communes à mesure qu'on tape.
//
// LE PROBLÈME QUE CE FICHIER RÈGLE. Le choix de commune était une liste
// déroulante contenant TOUTE la Wallonie, soit 260 entrées. Sur un téléphone,
// une liste de 260 entrées ne se parcourt pas : elle se subit. Et c'est le tout
// premier geste demandé à un Yopper qui vient de se connecter.
//
// ⚠️ LA LISTE RESTE (Alex, 03/09). Le champ ne la remplace pas, il la rétrécit.
// Tant que rien n'est tapé, TOUTES les communes sont là : celui qui préfère
// dérouler déroule, celui qui préfère taper tape. Rendre une liste vide tant
// qu'on n'a pas écrit aurait échangé un mauvais geste contre un autre.
//
// ⚠️ ON CHERCHE AUSSI PAR CODE POSTAL. Beaucoup de gens donnent « 5640 » plus
// spontanément que « Mettet », et c'est ce que la landing leur a déjà demandé.
//
// ⚠️ ON CHERCHE MOT PAR MOT, PAS SUR LA CHAÎNE ENTIÈRE. « Braine-l'Alleud »,
// « Ottignies-Louvain-la-Neuve », « La Bruyère » : quelqu'un qui tape « alleud »
// ou « neuve » doit trouver. Un nom composé se découpe donc en mots, et le tiret
// comme l'apostrophe séparent au même titre que l'espace.
//
// La règle est le PRÉFIXE et non le morceau : « net » ne doit pas rendre
// « Mettet ». Chaque mot tapé doit commencer un mot du nom, ou un code postal.

import { sansAccents } from './texte-normalise.js'

// Les mots d'un nom, accents retirés. Tout ce qui n'est ni lettre ni chiffre
// sépare : tiret, apostrophe, espace, point.
export function motsDe(valeur) {
  return sansAccents(valeur).split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * Les communes qui correspondent à ce qui vient d'être tapé.
 *
 * Rien de tapé : la liste ENTIÈRE, dans l'ordre où elle est arrivée. C'est la
 * liste d'avant, intacte, et le champ n'est qu'un raccourci par-dessus.
 */
export function filtrerCommunes(communes = [], requete = '') {
  const liste = Array.isArray(communes) ? communes : []
  const q = sansAccents(requete).trim()
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean)
  if (tokens.length === 0) return liste

  const trouves = liste.filter(c => {
    const mots = motsDe(c?.nom)
    // ⚠️ Les codes postaux peuvent arriver en nombres : `startsWith` sur un
    // nombre lèverait, et la recherche entière tomberait sur la première
    // commune venue. On force la chaîne.
    const codes = (Array.isArray(c?.codes_postaux) ? c.codes_postaux : []).map(v => String(v ?? ''))
    return tokens.every(t =>
      mots.some(m => m.startsWith(t)) || codes.some(cp => cp.startsWith(t)))
  })

  // Ce qui COMMENCE par ce qu'on a tapé passe devant : quelqu'un qui tape
  // « namur » veut Namur, pas la commune voisine qui partage son code postal.
  const rang = (c) => (sansAccents(c?.nom).startsWith(q) ? 0 : 1)
  return trouves
    .slice()
    .sort((a, b) => rang(a) - rang(b) || String(a?.nom || '').localeCompare(String(b?.nom || ''), 'fr'))
}
