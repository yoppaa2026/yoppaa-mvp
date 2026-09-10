// Banc de la CADENCE DE LA CUISINE (lot 5 du module restaurant, 12/09/2026).
//
// 🔴 « VINGT COUVERTS À 20:00 ET RIEN À 20:30, CE N'EST PAS UNE BONNE SOIRÉE,
// C'EST UN COUP DE FEU. » Le restaurateur règle combien de personnes peuvent
// ARRIVER sur un même quart d'heure ; au-delà, sa fiche propose un autre quart
// d'heure, même quand des tables sont libres.
//
// CE QUE CE BANC PROTÈGE, dans l'ordre où ça coûterait :
//   1. la règle : les ARRIVÉES d'un quart d'heure d'horloge, pas les présences ;
//      un groupe plus grand que la cadence passe s'il arrive seul ; rien du tout
//      quand rien n'est réglé ;
//   2. la fiche et le serveur posent la même question avec la même règle, et
//      le serveur refuse avec un code que la route traduit ;
//   3. le restaurateur, lui, est prévenu sans être bloqué ;
//   4. rien ne change chez qui n'a pas de cadence, ni chez un salon ;
//   5. la base et le code disent les mêmes bornes, les mêmes colonnes, les
//      mêmes noms d'arguments, et les fonctions publiques rendent les couverts.
//
// ⚠️ TOUT CE QUI PEUT S'EXÉCUTER S'EXÉCUTE : la règle, le moteur de créneaux, le
// serveur sur une fausse base qui ne rend QUE les colonnes demandées, la lecture
// de salle du tableau de bord. Les gardes de source ne servent qu'aux écrans,
// qui ne tournent pas hors navigateur, et à la migration, que seul Alex passe
// (elle a été essayée à part sur un Postgres en mémoire).

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  QUART_MINUTES, CADENCE_MIN, CADENCE_MAX, plafondCadence, validerCadence, quartDe,
  arriveesDuQuart, etatCadence, phraseCadence, phraseCuisinePleine, lireSalleDuJour,
  STATUTS_QUI_OCCUPENT,
} from '../lib/inventaire-salle.js'
import { conflitReservation, genererSlots, jourSemaineDate } from '../lib/rdv-slots.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => sansProse(readFileSync(new URL('../' + chemin, import.meta.url), 'utf8'))
const brut = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8')

const H = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b }
const DATE = '2030-03-16'
const resa = (id, debut, couverts, extra = {}) => ({
  id, commercant_id: 'c1', prestation_id: 't4', heure_debut: `${debut}:00`, heure_fin: '21:30:00',
  couverts, statut: 'confirme', date_rdv: DATE, place_no: 1, praticien_id: null, deleted_at: null, ...extra,
})

// La salle du Bistrologue : six tables de quatre, deux de deux, deux de six (à
// partir de cinq : il garde ses grandes tables aux groupes).
const T2 = { id: 't2', commercant_id: 'c1', nom: 'Table de 2', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 2, quantite: 2, capacite: 4, duree_minutes: 90, tva_taux: null }
const T4 = { id: 't4', commercant_id: 'c1', nom: 'Table de 4', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 4, quantite: 6, capacite: 24, duree_minutes: 120, tva_taux: null }
const T6 = { id: 't6', commercant_id: 'c1', nom: 'Table de 6', par_couverts: true, actif: true, couverts_min: 5, couverts_max: 6, quantite: 2, capacite: 12, duree_minutes: 150, tva_taux: null }
const SALLE = [T4, T2, T6]

// ═══════════════════════════════════════════════════════════════════════════
// 1. LE RÉGLAGE
// ═══════════════════════════════════════════════════════════════════════════
egal('pas de réglage, pas de cadence', [undefined, null, ''].map(v => plafondCadence({ rdv_cadence_couverts: v })), [null, null, null])
egal('⚠️ ni un commerce absent', plafondCadence(null), null)
egal('une cadence se lit en nombre, même venue en texte', [plafondCadence({ rdv_cadence_couverts: 12 }), plafondCadence({ rdv_cadence_couverts: '12' })], [12, 12])
egal('🔴 zéro, un négatif, un décimal, un nombre hors bornes ou des lettres ne ferment pas une fiche',
  [0, -4, 1.5, 201, 'abc'].map(v => plafondCadence({ rdv_cadence_couverts: v })), [null, null, null, null, null])
egal('⚠️ les bornes elles-mêmes sont des cadences', [CADENCE_MIN, CADENCE_MAX].map(v => plafondCadence({ rdv_cadence_couverts: v })), [1, 200])
egal('le réglage tapé vide, c’est « pas de limite »', validerCadence(''), { ok: true, valeur: null, message: null })
egal('⚠️ des espaces autour ne comptent pas', validerCadence(' 8 '), { ok: true, valeur: 8, message: null })
verifier('🔴 on ne peut pas enregistrer 0, 201, 1,5, un négatif ou des lettres',
  ['0', '201', '1.5', '1,5', 'douze', '-2'].every(s => validerCadence(s).ok === false && validerCadence(s).valeur === null))
verifier('⚠️ et le refus dit les bornes', /entre 1 et 200/.test(validerCadence('0').message || ''), validerCadence('0').message)

// ═══════════════════════════════════════════════════════════════════════════
// 2. LES ARRIVÉES D'UN QUART D'HEURE D'HORLOGE
// ═══════════════════════════════════════════════════════════════════════════
egal('le quart d’heure dure quinze minutes', QUART_MINUTES, 15)
egal('le quart d’heure d’horloge de chaque minute',
  ['19:00', '19:07', '19:14', '19:15', '23:59'].map(h => quartDe(H(h))), [H('19:00'), H('19:00'), H('19:00'), H('19:15'), H('23:45')])
egal('⚠️ une heure illisible n’a pas de quart d’heure', [null, undefined, '', 'x'].map(quartDe), [null, null, null, null])
egal('⚠️ minuit est un vrai quart d’heure', quartDe(0), 0)

const JOUR = [
  resa('a', '19:00', 4), resa('b', '19:05', 2), resa('c', '19:15', 6), resa('d', '18:45', 3),
  resa('e', '19:00', 5, { statut: 'annule_client' }), resa('f', '19:10', 2, { statut: 'no_show' }),
]
egal('🔴 on compte les personnes qui ARRIVENT sur ce quart d’heure', arriveesDuQuart(JOUR, H('19:00')), 6)
egal('⚠️ quelle que soit la minute choisie dans le quart d’heure', arriveesDuQuart(JOUR, H('19:14')), 6)
egal('🔴 une table assise depuis 18:45 ne compte pas à 19:00 : les arrivées, pas les présences',
  [arriveesDuQuart(JOUR, H('18:45')), arriveesDuQuart(JOUR, H('19:15'))], [3, 6])
egal('⚠️ une réservation annulée ou non honorée ne compte pas',
  arriveesDuQuart(JOUR.filter(r => r.statut !== 'confirme'), H('19:00')), 0)
egal('⚠️ les deux formes qui circulent : des minutes ou des heures',
  arriveesDuQuart([{ start: H('19:00'), couverts: 4 }, { heure_debut: '19:05:00', couverts: 2 }], H('19:00')), 6)
egal('⚠️ un nombre de personnes absent compte pour une',
  arriveesDuQuart([{ heure_debut: '19:00' }, { heure_debut: '19:00', couverts: null }], H('19:00')), 2)
egal('🔴 une heure illisible n’arrive pas à minuit',
  arriveesDuQuart([{ heure_debut: null, couverts: 8 }, { heure_debut: 'midi', couverts: 8 }], 0), 0)
egal('⚠️ la réservation qu’on déplace ne se compte pas elle-même', arriveesDuQuart(JOUR, H('19:00'), { exclureId: 'a' }), 2)
egal('⚠️ les statuts qui occupent sont ceux de la salle', STATUTS_QUI_OCCUPENT, ['confirme', 'honore'])

// ═══════════════════════════════════════════════════════════════════════════
// 3. CE QUE LA CADENCE DIT D'UN GROUPE
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ PARTOUT `?.` : sous une mutation, un état peut devenir `null`, et le banc
// doit alors ROUGIR, pas planter. Un banc qui plante n'a rien mesuré.
egal('pas de cadence : rien à dire', etatCadence({ plafond: null, couverts: 4, reservations: JOUR, debutMin: H('19:00') }), null)
const e12 = (couverts, debut = '19:00', extra = {}) => etatCadence({ plafond: 12, couverts, reservations: JOUR, debutMin: H(debut), ...extra })
egal('⚠️ six arrivées et six de plus, pile la cadence : ça passe', [e12(6)?.apres, e12(6)?.depasse], [12, false])
egal('🔴 une personne de plus, ça ne passe plus', [e12(7)?.apres, e12(7)?.depasse], [13, true])
egal('⚠️ ce qui reste sur le quart d’heure', e12(7)?.restants, 6)
egal('⚠️ et le quart d’heure dont on parle', e12(7, '19:09')?.quart, H('19:00'))
egal('⚠️ le quart d’heure suivant a ses propres arrivées', e12(6, '19:15')?.arrivees, 6)
egal('✅ seul sur son quart d’heure, un groupe plus grand que la cadence passe',
  etatCadence({ plafond: 6, couverts: 10, reservations: [], debutMin: H('20:00') })?.depasse, false)
egal('🔴 mais pas s’il y a déjà quelqu’un',
  etatCadence({ plafond: 6, couverts: 10, reservations: [resa('x', '20:00', 2)], debutMin: H('20:00') })?.depasse, true)
egal('🔴 un quart d’heure déjà au-delà, posé au téléphone, se ferme à tout le monde',
  etatCadence({ plafond: 6, couverts: 1, reservations: [resa('x', '20:00', 8)], debutMin: H('20:00') })?.depasse, true)
egal('⚠️ une heure illisible ne se juge pas', etatCadence({ plafond: 12, couverts: 4, reservations: JOUR, debutMin: null }), null)
egal('⚠️ un plafond illisible non plus', etatCadence({ plafond: 0, couverts: 4, reservations: JOUR, debutMin: H('19:00') }), null)
egal('⚠️ un nombre de personnes illisible compte pour une',
  etatCadence({ plafond: 12, couverts: 'x', reservations: [], debutMin: H('19:00') })?.apres, 1)
egal('⚠️ déplacée sur son propre quart d’heure, elle ne se gêne pas',
  etatCadence({ plafond: 6, couverts: 4, reservations: [resa('a', '19:00', 4)], debutMin: H('19:00'), exclureId: 'a' })?.depasse, false)

// ═══════════════════════════════════════════════════════════════════════════
// 4. CE QUE LISENT LE RESTAURATEUR ET LE CLIENT
// ═══════════════════════════════════════════════════════════════════════════
egal('⚠️ rien à dire quand la cuisine suit', phraseCadence(e12(4)), null)
const dit = phraseCadence(etatCadence({ plafond: 12, couverts: 4, reservations: [resa('a', '19:00', 10)], debutMin: H('19:05') }))
egal('🔴 le restaurateur lit qui arrive déjà, et ce que sa cuisine accepte',
  dit?.titre, '10 personnes arrivent déjà sur le quart d’heure de 19:00 : ta cuisine en accepte 12.')
egal('⚠️ et ce que ferait ce groupe, sans être bloqué',
  dit?.detail, 'Avec ces 4, ce serait 14 en même temps. Tu peux la poser quand même : elle comptera dans ce quart d’heure comme les autres.')
verifier('⚠️ c’est une alerte, pas un refus', dit?.ton === 'alerte')
const seul = phraseCadence(etatCadence({ plafond: 1, couverts: 1, reservations: [resa('a', '19:00', 1)], debutMin: H('19:00') }))
egal('⚠️ au singulier, des deux côtés', [seul?.titre, seul?.detail?.slice(0, 44)],
  ['1 personne arrive déjà sur le quart d’heure de 19:00 : ta cuisine en accepte 1.', 'Avec cette personne, ce serait 2 en même tem'])
verifier('⚠️ au déplacement, on la déplace',
  /Tu peux la déplacer quand même/.test(phraseCadence(e12(7), { deplacement: true })?.detail || ''))
egal('la phrase du client, avec l’heure et le nom', phraseCuisinePleine({ heure: '19:00:00', nom: 'Le Bistrologue' }),
  'À 19:00, Le Bistrologue accueille déjà autant de monde que sa cuisine le permet. Choisis une autre heure : un quart d’heure plus tôt ou plus tard suffit souvent.')
verifier('⚠️ sans heure ni nom, elle reste une phrase', /^Le restaurant accueille déjà autant de monde/.test(phraseCuisinePleine({})), phraseCuisinePleine({}))
verifier('⚠️ aucun tiret cadratin, aucun « RDV », dans rien de ce qui se lit',
  [dit?.titre, dit?.detail, seul?.titre, phraseCuisinePleine({ heure: '19:00', nom: 'X' }), validerCadence('0').message]
    .every(t => typeof t === 'string' && t.length > 0 && !/—|\bRDV\b/.test(t)))

// ═══════════════════════════════════════════════════════════════════════════
// 5. LE MOTEUR DE CRÉNEAUX : LA MÊME RÈGLE QUE LE SERVEUR
// ═══════════════════════════════════════════════════════════════════════════
// Dix personnes arrivent à 19:00 : une table de quatre, une de six.
const DIX = [resa('a', '19:00', 4), resa('b', '19:00', 6, { prestation_id: 't6', place_no: 2 })]
const regle = (couverts, reservations, plafond = 12, formats = SALLE, capacite = T4.capacite) => ({
  capacite, prestationId: 't4', parCouverts: true, couvertsDemandes: couverts,
  salle: { formats, reservations },
  cadence: plafond === null ? null : { plafond, reservations },
})
const a19 = (couverts, plafond = 12, debut = '19:00') => conflitReservation({ debut: H(debut), fin: H(debut) + 120, reservations: DIX, ...regle(couverts, DIX, plafond) })
verifier('⚠️ dix arrivées et deux de plus : la cuisine suit', a19(2).conflit === false, JSON.stringify(a19(2)))
egal('🔴 quatre de plus : la cuisine ne suit plus, et c’est elle qui le dit', [a19(4).conflit, a19(4).raison, a19(4).cadence?.restants], [true, 'cadence', 2])
verifier('🔴 alors que des tables de quatre sont libres : sans cadence, ça passe', a19(4, null).conflit === false)
verifier('🔴 le quart d’heure suivant reste ouvert au même groupe', a19(4, 12, '19:15').conflit === false)
{
  const pleine = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id, i) => resa(id, '19:00', 1, { place_no: i + 1 }))
  const c = conflitReservation({ debut: H('19:00'), fin: H('21:00'), reservations: pleine, ...regle(4, pleine, 6) })
  egal('⚠️ une salle pleine reste « complet » : la cuisine ne parle qu’après la salle', [c.conflit, c.raison], [true, 'complet'])
}
{
  // Une salle SANS inventaire : un seul format, quarante couverts. (Avec
  // plusieurs formats, la fiche en couverts tient une table d'un autre format
  // pour un conflit : défaut antérieur au lot 5, nommé, pas traité ici.)
  const enCouverts = [{ ...T4, quantite: null, capacite: 40 }]
  const dixT4 = [resa('a', '19:00', 4), resa('b', '19:00', 6, { place_no: 2 })]
  const c = conflitReservation({ debut: H('19:00'), fin: H('21:00'), reservations: dixT4, ...regle(4, dixT4, 12, enCouverts, 40) })
  egal('🔴 sans inventaire aussi, la cuisine a son mot à dire', [c.conflit, c.raison], [true, 'cadence'])
  const c2 = conflitReservation({ debut: H('19:00'), fin: H('21:00'), reservations: dixT4, ...regle(2, dixT4, 12, enCouverts, 40) })
  verifier('⚠️ et laisse passer ce qui tient dans la cadence', c2.conflit === false, JSON.stringify(c2))
}
{
  const c = conflitReservation({
    debut: H('19:00'), fin: H('19:30'), reservations: [], prestationId: 'coupe', capacite: 1,
    parCouverts: false, couvertsDemandes: 1, cadence: { plafond: 1, reservations: [resa('z', '19:00', 1)] },
  })
  verifier('🔴 un rendez-vous qui n’est pas une table ignore la cadence', c.conflit === false, JSON.stringify(c))
}
{
  // Une cadence jamais atteinte ne change RIEN à la réponse, forme comprise.
  const cas = [2, 4, 6].flatMap(n => ['18:45', '19:00', '19:15', '20:30'].map(h => ({ n, h })))
  const sans = cas.map(({ n, h }) => conflitReservation({ debut: H(h), fin: H(h) + 120, reservations: DIX, ...regle(n, DIX, null) }))
  const large = cas.map(({ n, h }) => conflitReservation({ debut: H(h), fin: H(h) + 120, reservations: DIX, ...regle(n, DIX, 199) }))
  egal('🔴 une cadence jamais atteinte laisse chaque réponse identique', large, sans)
}

// La grille de la fiche.
{
  const date = new Date(`${DATE}T12:00:00`)
  const jour = jourSemaineDate(date)
  const service = [{ id: 'soir', jour_semaine: jour, heure_debut: '18:00', heure_fin: '23:00', pas_minutes: 15, actif: true }]
  const ouvert = { [jour]: { ouvert: true, debut: '09:00', fin: '00:00' } }
  const base = (couverts, reservations) => ({
    dateChoisie: date, dureeMinutes: 120, creneaux: service, reservations, horairesDetail: ouvert,
    capacite: T4.capacite, prestationId: 't4', liaisonsCreneaux: [], parCouverts: true, couvertsDemandes: couverts,
    salle: { formats: SALLE, reservations },
  })
  const grille = (couverts, reservations, plafond) => genererSlots({ ...base(couverts, reservations), cadence: plafond == null ? null : { plafond, reservations } })
  const a = (slots, h) => slots.find(s => s.heure === h)
  verifier('🔴 la fiche ferme 19:00 au groupe de quatre, et le dit « complet »',
    a(grille(4, DIX, 12), '19:00')?.pris === true && a(grille(4, DIX, 12), '19:00')?.motif === 'complet', JSON.stringify(a(grille(4, DIX, 12), '19:00')))
  verifier('🔴 et lui propose 19:15', a(grille(4, DIX, 12), '19:15')?.pris === false)
  verifier('⚠️ 19:00 reste ouvert à un couple', a(grille(2, DIX, 12), '19:00')?.pris === false)
  verifier('⚠️ sans cadence, 19:00 est ouvert au groupe de quatre', a(grille(4, DIX, null), '19:00')?.pris === false)
  egal('🔴 sans cadence, la grille est exactement celle d’avant', grille(4, DIX, null), genererSlots(base(4, DIX)))
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE SERVEUR, SUR UNE FAUSSE BASE QUI NE REND QUE CE QU'ON LUI DEMANDE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ ELLE APPLIQUE LES FILTRES (commerce, jour, statut, suppression) et ne rend
// que les colonnes demandées : un select auquel manquerait `couverts` ou
// `rdv_cadence_couverts` rougirait ici, là où un objet fait main aurait tout
// fourni. Un témoin vérifie qu'elle refuse bien un rang déjà pris.
const { creerReservationRdv } = await import('../lib/rdv-creation-server.js')
function baseSimulee({ commerce = {}, demandee = T4, formats = SALLE, existantes = [], cadenceEnPanne = false } = {}) {
  const vu = { payload: null, selects: [] }
  const projeter = (ligne, colonnes) => {
    if (!ligne) return null
    const sortie = {}
    for (const c of String(colonnes).split(',').map(s => s.trim()).filter(Boolean)) {
      if (Object.prototype.hasOwnProperty.call(ligne, c)) sortie[c] = ligne[c]
    }
    return sortie
  }
  const table = (nom) => {
    const f = { eq: {}, in: {}, is: {} }
    let colonnes = ''
    let insertion = null
    const chaine = new Proxy({}, {
      get(_, prop) {
        if (prop === 'select') return (c) => { colonnes = String(c || ''); vu.selects.push(`${nom}:${colonnes.replace(/\s+/g, ' ').trim()}`); return chaine }
        if (prop === 'eq') return (k, v) => { f.eq[k] = v; return chaine }
        if (prop === 'in') return (k, v) => { f.in[k] = v; return chaine }
        if (prop === 'is') return (k, v) => { f.is[k] = v; return chaine }
        if (prop === 'insert') return (p) => { insertion = p; vu.payload = p; return chaine }
        if (prop === 'maybeSingle') return async () => {
          if (nom === 'rdv_prestations') return { data: demandee, error: null }
          if (nom === 'commercants') {
            if (cadenceEnPanne && /rdv_cadence_couverts/.test(colonnes)) return { data: null, error: { message: 'panne de lecture' } }
            return { data: projeter({ id: 'c1', nom: 'Le Bistrologue', adresse: 'Place Joseph Meunier, Mettet', ...commerce }, colonnes), error: null }
          }
          return { data: null, error: null }
        }
        if (prop === 'single') return async () => {
          if (!insertion) return { data: null, error: null }
          // L'index anti double-booking est PARTIEL : ce qui est annulé ou
          // supprimé n'y figure pas.
          const doublon = existantes.some(r => r.date_rdv === insertion.date_rdv
            && String(r.heure_debut).slice(0, 5) === String(insertion.heure_debut).slice(0, 5)
            && Number(r.place_no) === Number(insertion.place_no)
            && STATUTS_QUI_OCCUPENT.includes(r.statut) && !r.deleted_at)
          return doublon
            ? { data: null, error: { code: '23505' } }
            : { data: { id: 'rdv-neuf', numero_rdv: 1, numero_prefixe: 'RE', place_no: insertion.place_no }, error: null }
        }
        if (prop === 'then') return (resoudre, rejeter) => {
          let data = []
          if (nom === 'rdv_prestations') data = formats
          if (nom === 'rdv_reservations') {
            data = existantes
              .filter(r => Object.entries(f.eq).every(([k, v]) => (k === 'heure_debut'
                ? String(r[k]).slice(0, 5) === String(v).slice(0, 5)
                : String(r[k]) === String(v))))
              .filter(r => Object.entries(f.in).every(([k, v]) => [].concat(v).map(String).includes(String(r[k]))))
              .filter(r => Object.entries(f.is).every(([k, v]) => (r[k] ?? null) === v))
              .map(r => projeter(r, colonnes))
          }
          return Promise.resolve({ data, error: null }).then(resoudre, rejeter)
        }
        // order, limit, neq, update, gte… : sans effet sur ce qu'on mesure.
        return () => chaine
      },
    })
    return chaine
  }
  return { from: table, _vu: vu }
}
// ⚠️ UNE EXCEPTION DEVIENT UN REFUS NOMMÉ : sous une mutation, le serveur doit
// faire rougir le banc, pas le faire planter.
const reserver = async (db, couverts, heure = '19:00', champs = {}, prestationId = 't4') => {
  try {
    return await creerReservationRdv(db, {
      commercantId: 'c1', prestationId, dateRdv: DATE, heureDebut: heure,
      champs: { couverts, client_email: 'essai@yoppaa.app', ...champs },
    })
  } catch (e) {
    return { ok: false, code: 'exception', message: e?.message || String(e) }
  }
}
const lecturesCadence = (db) => db._vu.selects.filter(s => s === 'commercants:rdv_cadence_couverts').length
const lecturesArrivees = (db) => db._vu.selects.filter(s => s === 'rdv_reservations:id, heure_debut, couverts').length
{
  const db = baseSimulee({ existantes: [resa('x', '19:00', 2, { place_no: 1 })] })
  const r = await db.from('rdv_reservations').insert({ date_rdv: DATE, heure_debut: '19:00', place_no: 1 }).select('id').single()
  verifier('⚠️ témoin : la fausse base refuse bien un rang déjà pris', r.error?.code === '23505')
}
{
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 12 }, existantes: DIX })
  const res = await reserver(db, 4)
  egal('🔴 dix arrivées à 19:00, cadence douze : le groupe de quatre est refusé, avec ce qui reste',
    [res.ok, res.code, res.restants, res.plafond], [false, 'cadence_atteinte', 2, 12])
  verifier('🔴 et rien n’est écrit', db._vu.payload === null)
  verifier('⚠️ la cadence se lit à part, sur sa seule colonne, et les arrivées une fois', lecturesCadence(db) === 1 && lecturesArrivees(db) === 1, JSON.stringify(db._vu.selects))
  verifier('⚠️ la lecture du lieu ne demande pas la cadence : une colonne absente ferait tomber toutes les réservations',
    db._vu.selects.filter(s => s.startsWith('commercants:') && s !== 'commercants:rdv_cadence_couverts').every(s => !/rdv_cadence_couverts/.test(s)), JSON.stringify(db._vu.selects))
}
{
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 12 }, existantes: DIX })
  const res = await reserver(db, 2)
  egal('⚠️ un couple, pile la cadence : réservé', [res.ok, db._vu.payload?.couverts], [true, 2])
}
{
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 12 }, existantes: DIX })
  const res = await reserver(db, 4, '19:15')
  egal('🔴 le même groupe à 19:15 : réservé', [res.ok, db._vu.payload?.heure_debut], [true, '19:15'])
}
{
  const db = baseSimulee({ existantes: DIX })
  const res = await reserver(db, 4)
  verifier('🔴 sans cadence réglée, rien ne change : réservé', res.ok === true, JSON.stringify(res))
  verifier('⚠️ et les arrivées ne sont même pas lues', lecturesCadence(db) === 1 && lecturesArrivees(db) === 0, JSON.stringify(db._vu.selects))
}
{
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 4 }, demandee: T6 })
  const res = await reserver(db, 6, '20:00', {}, 't6')
  verifier('✅ seul sur son quart d’heure, un groupe de six passe une cadence de quatre', res.ok === true, JSON.stringify(res))
  const db2 = baseSimulee({ commerce: { rdv_cadence_couverts: 4 }, demandee: T6, existantes: [resa('x', '20:00', 1)] })
  const res2 = await reserver(db2, 6, '20:00', {}, 't6')
  verifier('🔴 mais pas si quelqu’un arrive déjà', res2.ok === false && res2.code === 'cadence_atteinte', JSON.stringify(res2))
}
{
  const annulees = [resa('a', '19:00', 6, { statut: 'annule_client' }), resa('b', '19:00', 6, { statut: 'no_show' }), resa('c', '19:00', 6, { deleted_at: '2030-03-01T10:00:00' })]
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 12 }, existantes: annulees })
  const res = await reserver(db, 4)
  verifier('🔴 annulées, non honorées ou supprimées, elles n’arrivent pas', res.ok === true, JSON.stringify(res))
}
{
  const autres = [...DIX, resa('atelier', '19:00', 1, { prestation_id: 'atelier', place_no: 3 })]
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 12 }, existantes: autres })
  const res = await reserver(db, 2)
  egal('🔴 la cuisine compte tout le monde qui arrive, pas seulement les tables', [res.ok, res.code], [false, 'cadence_atteinte'])
}
{
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 12 }, existantes: DIX })
  const res = await reserver(db, 4, '19:00', { source: 'commercant' })
  verifier('✅ le restaurateur est prévenu à l’écran, jamais bloqué par le serveur', res.ok === true && lecturesCadence(db) === 0, JSON.stringify({ res, selects: db._vu.selects }))
}
{
  const coupe = { id: 'coupe', commercant_id: 'c1', nom: 'Coupe', par_couverts: false, actif: true, capacite: 1, duree_minutes: 30, tva_taux: null }
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 1 }, demandee: coupe, formats: [coupe], existantes: [resa('x', '19:00', 1, { prestation_id: 'coupe' })] })
  const res = await reserver(db, 1, '19:15', {}, 'coupe')
  verifier('🔴 un salon ne lit même pas la cadence', res.ok === true && lecturesCadence(db) === 0, JSON.stringify({ res, selects: db._vu.selects }))
}
{
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 12 }, existantes: DIX, cadenceEnPanne: true })
  const erreurs = []
  const avant = console.error
  console.error = (...a) => erreurs.push(a.join(' '))
  let res
  try { res = await reserver(db, 4) } finally { console.error = avant }
  verifier('⚠️ une lecture en échec ne ferme rien : réservé', res?.ok === true, JSON.stringify(res))
  verifier('⚠️ mais elle se dit dans les journaux', erreurs.some(e => /cadence illisible/.test(e)), JSON.stringify(erreurs))
}
{
  const pleine = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id, i) => resa(id, '19:00', 1, { place_no: i + 1 }))
  const db = baseSimulee({ commerce: { rdv_cadence_couverts: 6 }, existantes: pleine })
  const res = await reserver(db, 4)
  egal('⚠️ une salle pleine répond « complet » avant la cuisine', [res.ok, res.code], [false, 'salle_complete'])
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA ROUTE TRADUIT CHAQUE REFUS DU SERVEUR
// ═══════════════════════════════════════════════════════════════════════════
const CREA = lire('lib/rdv-creation-server.js')
const ROUTE = lire('app/api/rdv/reserver/route.js')
verifier('🔴 la route traduit la cadence en refus de règle, et renvoie choisir une autre heure',
  /if \(res\.code === 'cadence_atteinte'\) \{\s*return NextResponse\.json\(\{\s*ok: false,\s*error: phraseCuisinePleine\(\{ heure, nom: commercant\.nom \}\),\s*creneau_refuse: true,\s*\}, \{ status: 409 \}\)/.test(ROUTE))
verifier('⚠️ avec la phrase du module', /import \{ phraseCuisinePleine \} from '@\/lib\/inventaire-salle'/.test(ROUTE))
{
  // 🔴 LE FRÈRE DU 11/09 : `groupe_trop_grand` n'était pas traduit, et tombait
  // dans le 500 « réessaie ». Chaque code de refus du serveur doit avoir sa
  // réponse ; seule l'écriture impossible reste une panne.
  const codes = [...new Set([...CREA.matchAll(/code: '([a-z_]+)'/g)].map(m => m[1]))]
  const traduits = new Set([...ROUTE.matchAll(/res\.code === '([a-z_]+)'/g)].map(m => m[1]))
  const oublies = codes.filter(c => c !== 'ecriture_impossible' && !traduits.has(c))
  verifier('le serveur a bien des codes de refus', codes.length >= 10, codes.join(', '))
  verifier('🔴 aucun refus du serveur ne tombe dans le 500 de la route', oublies.length === 0, oublies.join(', '))
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. LA FICHE (elle ne s'exécute pas hors navigateur : on lit ce qu'elle passe)
// ═══════════════════════════════════════════════════════════════════════════
const FICHE = lire('app/commander/rdv/[slug]/page.js')
verifier('🔴 la fiche lit la cadence du commerce avec la règle du module', /const plafondCuisine = plafondCadence\(commercant\)/.test(FICHE))
verifier('🔴 elle la passe au moteur, pour une table seulement, avec TOUTES les réservations du jour',
  /cadence: estParCouverts\(prestationChoisie\) && plafondCuisine !== null\s*\?\s*\{ plafond: plafondCuisine, reservations: reservationsDuJour \|\| \[\] \}\s*:\s*null,/.test(FICHE))
verifier('⚠️ la grille du jour et les pastilles du calendrier reçoivent la même règle',
  /reservations: reservationsFiltrees,[\s\S]{0,700}?\.\.\.regleOccupation\(reservations\),/.test(FICHE)
  && /reservations: resaFiltree,[\s\S]{0,500}?\.\.\.regleOccupation\(resaDuJour\),/.test(FICHE))
verifier('🔴 le contrôle d’avant envoi dit la cuisine, avec la phrase du serveur',
  /conflit\.raison === 'cadence'\s*\?\s*phraseCuisinePleine\(\{ heure: heureChoisie, nom: commercant\?\.nom \}\)/.test(FICHE))
verifier('⚠️ la fiche lit tout ce que la vue publique expose : la cadence arrive sans rien changer ailleurs',
  /\.from\('commercants_public'\)[^\n]*\n\s*\.select\('\*'\)/.test(FICHE))
const MOTEUR = lire('lib/rdv-slots.js')
verifier('⚠️ le moteur la transmet à la règle, et un quart d’heure plein se lit « complet »',
  /salle,\s*cadence,\s*\}\)/.test(MOTEUR) && /c\.raison === 'cadence' \? 'complet'/.test(MOTEUR))

// ═══════════════════════════════════════════════════════════════════════════
// 9. LE TABLEAU DE BORD
// ═══════════════════════════════════════════════════════════════════════════
{
  const vu = {}
  const faux = (erreurCommerce = null, cadence = 12) => ({
    from: (t) => {
      const v = vu[t] = { select: null, eq: {}, in: {}, is: {} }
      const c = {
        select: (s) => { v.select = s; return c },
        eq: (k, val) => { v.eq[k] = val; return c },
        in: (k, val) => { v.in[k] = val; return c },
        is: (k, val) => { v.is[k] = val; return c },
        maybeSingle: async () => erreurCommerce
          ? { data: null, error: erreurCommerce }
          : { data: t === 'commercants' && /rdv_cadence_couverts/.test(v.select || '') ? { rdv_cadence_couverts: cadence } : {}, error: null },
        then: (r) => r({ data: [{ id: 'x', heure_debut: '19:00:00', couverts: 4 }], error: null }),
      }
      return c
    },
  })
  const lu = await lireSalleDuJour(faux(), { commercantId: 'c1', dateStr: DATE })
  verifier('🔴 la salle du tableau de bord se lit avec ses couverts', /\bcouverts\b/.test(vu.rdv_reservations?.select || ''), vu.rdv_reservations?.select)
  egal('🔴 et la cadence du commerce, relue en base', [vu.commercants?.select, vu.commercants?.eq?.id, lu.plafond], ['rdv_cadence_couverts', 'c1', 12])
  const sans = await lireSalleDuJour(faux(null, null), { commercantId: 'c1', dateStr: DATE })
  egal('⚠️ sans cadence réglée, rien', [sans.plafond, sans.error], [null, null])
  const panne = await lireSalleDuJour(faux({ message: 'colonne absente' }), { commercantId: 'c1', dateStr: DATE })
  egal('⚠️ une cadence illisible le dit, elle ne passe pas pour « pas de limite »', panne.error?.message, 'colonne absente')
}

const SAISIE = lire('app/dashboard/ModalNouveauRdv.js')
verifier('🔴 au téléphone, la salle se lit pour toute table, inventaire ou non',
  /const tableHorsInventaire = !enTable && !!prestationId && prestationId !== UNE_TABLE\s*&& estParCouverts\(/.test(SAISIE)
  && /if \(!lectureSalle \|\| !DATE_ISO\.test\(date\)\) return/.test(SAISIE)
  && /\{ etat: 'ok', reservations, plafond, date \}/.test(SAISIE))
verifier('🔴 elle compte la cadence avec la règle du serveur, et jamais sur une heure passée',
  /const cadence = !passe && salleConnue && heureValide && groupeCadence\s*\?\s*etatCadence\(\{ plafond: salle\.plafond, couverts: groupeCadence, reservations: salle\.reservations, debutMin \}\)/.test(SAISIE))
verifier('🔴 elle le dit, et le bouton devient « Poser quand même »',
  /const messageCadence = phraseCadence\(cadence\)/.test(SAISIE) && /\{messageCadence && \(/.test(SAISIE)
  && /\(choixTable\?\.forcer \|\| cadenceDepassee\) \? 'Poser quand même ✓'/.test(SAISIE))
verifier('🔴 une heure où la cuisine est pleine ne se propose pas d’un tap, en inventaire comme sans',
  /const cuisinePleine = \(m, groupe\) => !!etatCadence\(\{ plafond: salle\.plafond, couverts: groupe, reservations: salle\.reservations, debutMin: m \}\)\?\.depasse/.test(SAISIE)
  && /if \(cuisinePleine\(m, nCouverts\)\) return false/.test(SAISIE)
  && /if \(cuisinePleine\(timeToMinutes\(h\), groupe\)\) return false/.test(SAISIE)
  && /if \(tableHorsInventaire && !salleConnue\) return \[\]/.test(SAISIE))
verifier('🔴 au clic, un quart d’heure qui a changé arrête l’écriture',
  /const cadenceFrais = passe \? null : etatCadence\(\{ plafond: frais\.plafond, couverts: groupeCadence, reservations: frais\.reservations, debutMin \}\)\s*const cadenceChangee = \(cadenceFrais\?\.depasse === true\) !== cadenceDepassee/.test(SAISIE))
verifier('⚠️ hors inventaire, une salle illisible se dit, sinon la cadence se tairait sans raison',
  /\{tableHorsInventaire && salle\.etat === 'erreur' && \(/.test(SAISIE))

const DEPLACE = lire('app/dashboard/ModalDeplacerRdv.js')
verifier('🔴 au déplacement, la salle se lit pour toute table, avec la cadence',
  /if \(!estTable \|\| !\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(date\)\) return/.test(DEPLACE)
  && /\{ etat: 'ok', reservations, plafond, date \}/.test(DEPLACE))
verifier('🔴 la cadence du nouveau quart d’heure, sans se compter elle-même',
  /etatCadence\(\{ plafond: salle\.plafond, couverts: couvertsRdv, reservations: salle\.reservations, debutMin: minutesDeLHeure\(heure\), exclureId: rdv\?\.id \}\)/.test(DEPLACE))
verifier('🔴 elle le dit, et le bouton devient « Déplacer quand même »',
  /\|\| cadenceDepassee\)/.test(DEPLACE) && /const messageCadence = phraseCadence\(cadence, \{ deplacement: true \}\)/.test(DEPLACE)
  && /\{messageCadence && \(/.test(DEPLACE) && /salleAlerte \? 'Déplacer quand même ✓'/.test(DEPLACE))
verifier('🔴 « Créneaux libres » ne propose pas un quart d’heure plein',
  /if \(estTable && etatCadence\(\{ plafond: salle\.plafond, couverts: couvertsRdv, reservations: salle\.reservations, debutMin: minutesDeLHeure\(h\), exclureId: rdv\?\.id \}\)\?\.depasse\) return false/.test(DEPLACE))
verifier('🔴 au clic, un quart d’heure qui a changé arrête l’écriture',
  /const cadenceFrais = etatCadence\(\{ plafond: frais\.plafond, couverts: couvertsRdv, reservations: frais\.reservations, debutMin: minutesDeLHeure\(heure\), exclureId: rdv\.id \}\)/.test(DEPLACE)
  && /&& \(cadenceFrais\?\.depasse === true\) === cadenceDepassee/.test(DEPLACE))

const REGLAGES = lire('app/dashboard/ConfigDashboard.js')
const iReglage = REGLAGES.indexOf('function ReglageCadence(')
const REGLAGE = iReglage === -1 ? '' : REGLAGES.slice(iReglage, REGLAGES.indexOf('\nfunction ', iReglage + 10))
verifier('le réglage de la cadence se découpe', REGLAGE.length > 1500, String(REGLAGE.length))
verifier('🔴 il lit la cadence en base à l’ouverture, pas dans la fiche chargée au démarrage',
  /supabase\.from\('commercants'\)\.select\('rdv_cadence_couverts'\)\.eq\('id', commercantId\)\.maybeSingle\(\)/.test(REGLAGE)
  && /const p = plafondCadence\(data\)/.test(REGLAGE))
verifier('🔴 il vérifie la saisie avec la règle du module, et n’écrit que ce qu’elle rend',
  /const verdict = validerCadence\(saisie\)/.test(REGLAGE)
  && /\.update\(\{ rdv_cadence_couverts: verdict\.valeur \}\)\.eq\('id', commercantId\)/.test(REGLAGE))
verifier('🔴 il lit le résultat de l’écriture avant de dire « enregistrée »',
  /if \(error\) return toast\(`Erreur : \$\{error\.message\}\. Ta cadence n’a pas changé\.`, 'error'\)\s*setEnregistree\(verdict\.valeur\)/.test(REGLAGE))
verifier('⚠️ il ne s’affiche que chez un restaurant qui a des tables',
  /\{estTable && prestations\.some\(p => p\.par_couverts === true && p\.actif !== false\) && \(\s*<ReglageCadence commercantId=\{commercantId\} toast=\{toast\} \/>/.test(REGLAGES))
verifier('⚠️ ses bornes sont celles du module', /min=\{CADENCE_MIN\} max=\{CADENCE_MAX\}/.test(REGLAGE))
verifier('⚠️ aucun tiret cadratin ni emoji dans ce qu’il dit', !/—|🟣/.test(brut('app/dashboard/ConfigDashboard.js').slice(brut('app/dashboard/ConfigDashboard.js').indexOf('function ReglageCadence('), brut('app/dashboard/ConfigDashboard.js').indexOf('function TabRdvPrestations('))))

// ═══════════════════════════════════════════════════════════════════════════
// 10. LA MIGRATION, ET CE QUE LE CODE EN ATTEND
// ═══════════════════════════════════════════════════════════════════════════
const SQL = brut('migrations/MIGRATION_CADENCE_CUISINE.sql')
const code = (s) => s.split('\n').filter(l => !/^\s*--/.test(l)).join('\n')
const SQLC = code(SQL)
{
  const bornes = /CHECK \(rdv_cadence_couverts IS NULL OR rdv_cadence_couverts BETWEEN (\d+) AND (\d+)\)/.exec(SQLC)
  egal('🔴 la base et l’écran disent les mêmes bornes', bornes ? [Number(bornes[1]), Number(bornes[2])] : null, [CADENCE_MIN, CADENCE_MAX])
  verifier('⚠️ vide par défaut : aucun commerce ne change tant qu’il n’a rien réglé',
    /ADD COLUMN IF NOT EXISTS rdv_cadence_couverts integer;/.test(SQLC) && !/rdv_cadence_couverts integer[^;]*DEFAULT/.test(SQLC))
  verifier('🔴 le commerçant peut régler sa cadence, et chacun la lire',
    /GRANT SELECT \(rdv_cadence_couverts\) ON public\.commercants TO anon, authenticated;/.test(SQLC)
    && /GRANT UPDATE \(rdv_cadence_couverts\) ON public\.commercants TO authenticated;/.test(SQLC))
  const attendu = (/attendu text := '([^']+)'/.exec(SQLC) || [])[1]?.split(',') || []
  const vue = (/CREATE OR REPLACE VIEW public\.commercants_public AS\s*SELECT([\s\S]*?)FROM commercants/.exec(SQLC) || [])[1]
    ?.split(',').map(s => s.trim()).filter(Boolean) || []
  egal('🔴 la vue garde ses 55 colonnes, dans l’ordre, et la garde vérifie exactement celles-là', vue.slice(0, -1), attendu)
  egal('⚠️ 55, pas une de moins', attendu.length, 55)
  egal('🔴 la cadence arrive À LA FIN', vue[vue.length - 1], 'rdv_cadence_couverts')
  verifier('🔴 la migration refuse une vue qui a dérivé, et le dit',
    /IF vivant IS DISTINCT FROM attendu AND vivant IS DISTINCT FROM attendu \|\| ',rdv_cadence_couverts' THEN\s*RAISE EXCEPTION 'VUE_DERIVEE/.test(SQLC))
  verifier('⚠️ et un filtre des fiches publiées qui a changé', /IF filtre IS DISTINCT FROM 'statut_publication=''publie''' THEN\s*RAISE EXCEPTION 'VUE_DERIVEE/.test(SQLC))
  verifier('🔴 la vue reste en lecture seule, et ses options sont reposées',
    /REVOKE INSERT, UPDATE, DELETE ON public\.commercants_public FROM anon, authenticated;/.test(SQLC)
    && /EXECUTE format\('ALTER VIEW public\.commercants_public SET \(%s\)', array_to_string\(opts, ', '\)\)/.test(SQLC))
  verifier('🔴 tout le changement tient dans UNE transaction', SQLC.indexOf('BEGIN;') !== -1
    && SQLC.indexOf('BEGIN;') < SQLC.indexOf('ALTER TABLE public.commercants')
    && SQLC.indexOf('COMMIT;') > SQLC.lastIndexOf('GRANT EXECUTE ON FUNCTION'))

  const busy = (/CREATE FUNCTION public\.rdv_slots_busy\(([^)]*)\)\s*RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE[\s\S]*?\$function\$([\s\S]*?)\$function\$/.exec(SQLC) || [])
  const range = (/CREATE FUNCTION public\.rdv_slots_busy_range\(([^)]*)\)\s*RETURNS TABLE\(([\s\S]*?)\)\s*LANGUAGE[\s\S]*?\$function\$([\s\S]*?)\$function\$/.exec(SQLC) || [])
  const params = (s) => [...String(s || '').matchAll(/(p_[a-z_]+)/g)].map(m => m[1])
  const appel = (nom) => {
    const m = new RegExp(`rpc\\('${nom}', \\{([^}]*)\\}`).exec(FICHE)
    return m ? [...m[1].matchAll(/(p_[a-z_]+):/g)].map(x => x[1]) : []
  }
  egal('🔴 rdv_slots_busy garde les noms d’arguments de la fiche', params(busy[1]), appel('rdv_slots_busy'))
  egal('🔴 rdv_slots_busy_range aussi, sans quoi le calendrier se tairait', params(range[1]), appel('rdv_slots_busy_range'))
  verifier('🔴 les deux rendent les couverts, et les lisent',
    /couverts\s+int/.test(busy[2] || '') && /\bcouverts\b/.test(busy[3] || '')
    && /couverts\s+int/.test(range[2] || '') && /\bcouverts\b/.test(range[3] || ''))
  verifier('⚠️ le calendrier reçoit enfin la table de chaque réservation', /prestation_id\s+uuid/.test(range[2] || '') && /date_rdv\s+date/.test(range[2] || ''))
  const statuts = (s) => ((/statut IN \(([^)]*)\)/.exec(s || '') || [])[1] || '').split(',').map(x => x.trim().replace(/'/g, ''))
  egal('🔴 elles comptent les mêmes statuts que la salle et le serveur', [statuts(busy[3]), statuts(range[3])], [STATUTS_QUI_OCCUPENT, STATUTS_QUI_OCCUPENT])
  verifier('🔴 leurs droits sont reposés après la recréation',
    /GRANT EXECUTE ON FUNCTION public\.rdv_slots_busy\(uuid, date\) TO anon, authenticated, service_role;/.test(SQLC)
    && /GRANT EXECUTE ON FUNCTION public\.rdv_slots_busy_range\(uuid, date, date\) TO anon, authenticated, service_role;/.test(SQLC))
  verifier('⚠️ toutes les anciennes versions du calendrier partent, quelle que soit leur signature',
    /FOR f IN SELECT p\.oid::regprocedure AS signature[\s\S]*?p\.proname = 'rdv_slots_busy_range'[\s\S]*?EXECUTE 'DROP FUNCTION ' \|\| f\.signature::text;/.test(SQLC))
  verifier('⚠️ aucune donnée personnelle ne sort des fonctions publiques',
    ![busy[2], busy[3], range[2], range[3]].some(s => /client_|email|telephone|prenom|\bnom\b/.test(s || '')))
  verifier('🔴 elle se passe AVANT le déploiement, et le dit', /À PASSER AVANT LE DÉPLOIEMENT DU CODE/.test(SQL))
}
// La colonne que le code lit est celle que la migration crée.
verifier('🔴 le serveur lit la colonne que la migration crée, à part de la lecture du lieu',
  /\.from\('commercants'\)\s*\.select\('rdv_cadence_couverts'\)\s*\.eq\('id', commercantId\)\s*\.maybeSingle\(\)/.test(CREA)
  && !/const COLONNES_LIEU = '[^']*rdv_cadence_couverts/.test(CREA))
verifier('🔴 le serveur ne compte la cadence que pour une table, et pas pour le restaurateur',
  /if \(estParCouverts\(prestation\)\) \{[\s\S]*?const cuisineAConsulter = champs\?\.source !== 'commercant'\s*if \(cuisineAConsulter\) \{\s*const \{ data: reglage, error: errReglage \} = await db/.test(CREA))
verifier('⚠️ il lit les arrivées du jour sans filtre de prestation, avec leurs couverts',
  /\.from\('rdv_reservations'\)\s*\.select\('id, heure_debut, couverts'\)\s*\.eq\('commercant_id', commercantId\)\s*\.eq\('date_rdv', dateRdv\)\s*\.in\('statut', STATUTS_OCCUPENT\)\s*\.is\('deleted_at', null\)/.test(CREA))

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Cadence de la cuisine verte.')
