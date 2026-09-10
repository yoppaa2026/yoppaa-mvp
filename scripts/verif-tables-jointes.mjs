// Banc des TABLES JOINTES (lot 3 du module restaurant, 11/09/2026).
//
// 🔴 LA DEMANDE EXACTE DU BISTROLOGUE : « j'autorise le couplage de x fois 2
// tables de 4 personnes, si une personne veut réserver pour 6 ou 8 alors qu'il
// n'y a que des tables de 2 ou 4 ».
//
// CE QUE CE BANC PROTÈGE, dans l'ordre où ça coûterait :
//   1. une jointure IMMOBILISE ses tables : un groupe de huit posé sur deux
//      tables de quatre jointes les retire de leur format. Sinon la fiche les
//      vendrait une seconde fois pendant que le groupe est attablé ;
//   2. le moteur ne joint qu'en DERNIER RECOURS : un groupe de six prend la
//      table de six tant qu'il en reste une ;
//   3. le restaurateur décide combien À LA FOIS, et Yoppaa ne dépasse ni ce
//      nombre, ni ce que ses tables libres permettent ;
//   4. une jointure n'est pas une table de plus : ni dans les couverts de la
//      salle, ni dans le mode inventaire, ni dans une liste de cartes.
//
// ⚠️ TOUT CE QUI PEUT S'EXÉCUTER S'EXÉCUTE : le moteur, la grille de la fiche,
// le serveur sur une fausse base. Les gardes de source ne servent qu'à ce qui
// ne tourne pas hors navigateur, et elles le disent.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { sansProse } from './lire-code.mjs'
import {
  estJointure, tablesDeLaJointure, baseDeLaJointure, jointuresValides, nomDeJointure,
  enModeInventaire, formatsSansQuantite, couvertsTotaux, tablesTotales,
  formatsPourGroupe, occupationParFormat, formatLibrePour, etatSalle, tableAPoser, phraseSalle,
  plusGrandeTable, plusGrandGroupe, taillesReservables, formatPourAffichage, dureeDuGroupe,
  basesJoignables, jointuresDe, jointureParDefaut, verifierJointure, alerteJointure,
  conflitSalle,
} from '../lib/inventaire-salle.js'
import { genererSlots } from '../lib/rdv-slots.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b), `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)
const lire = (chemin) => sansProse(readFileSync(new URL('../' + chemin, import.meta.url), 'utf8'))
const brut = (chemin) => readFileSync(new URL('../' + chemin, import.meta.url), 'utf8')

// ─── LA SALLE DU BISTROLOGUE ─────────────────────────────────────────────────
// Six tables de quatre, deux de deux, deux de six (à partir de cinq, comme il
// garde ses grandes tables aux groupes), et « deux tables de 4 jointes, de 6 à
// 8 personnes, 2 à la fois ».
const T2 = { id: 't2', nom: 'Table de 2', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 2, quantite: 2, capacite: 4, duree_minutes: 90, tva_taux: null }
const T4 = { id: 't4', nom: 'Table de 4', par_couverts: true, actif: true, couverts_min: 1, couverts_max: 4, quantite: 6, capacite: 24, duree_minutes: 120, tva_taux: null }
const T6 = { id: 't6', nom: 'Table de 6', par_couverts: true, actif: true, couverts_min: 5, couverts_max: 6, quantite: 2, capacite: 12, duree_minutes: 150, tva_taux: null }
const J = { id: 'j', nom: '2 tables de 4 jointes', par_couverts: true, actif: true, couverts_min: 6, couverts_max: 8, quantite: 2, capacite: 16, duree_minutes: 150, tva_taux: null, jointure_de: 't4', jointure_tables: 2 }
const SALLE = [T4, J, T2, T6]   // ⚠️ volontairement dans le désordre
const H19 = 19 * 60
const resa = (id, prestation, debut = '19:00:00', fin = '21:30:00', extra = {}) =>
  ({ id, prestation_id: prestation, heure_debut: debut, heure_fin: fin, statut: 'confirme', date_rdv: '2026-09-19', place_no: 1, praticien_id: null, ...extra })

// ═══════════════════════════════════════════════════════════════════════════
// 1. CE QU'EST UNE JOINTURE
// ═══════════════════════════════════════════════════════════════════════════
verifier('une jointure se reconnaît à la table qu’elle joint', estJointure(J) && !estJointure(T4))
verifier('⚠️ un identifiant vide ou absent ne fait pas une jointure',
  !estJointure({ jointure_de: '' }) && !estJointure({ jointure_de: null }) && !estJointure(null))
egal('elle dit combien de tables elle assemble', tablesDeLaJointure(J), 2)
verifier('⚠️ une seule table, ou un nombre illisible, n’assemble rien',
  tablesDeLaJointure({ jointure_tables: 1 }) === null && tablesDeLaJointure({ jointure_tables: 'x' }) === null)
egal('et elle retrouve sa table dans la liste', baseDeLaJointure(J, SALLE)?.id, 't4')

// ═══════════════════════════════════════════════════════════════════════════
// 2. UNE JOINTURE N'EST PAS UNE TABLE DE PLUS
// ═══════════════════════════════════════════════════════════════════════════
verifier('🔴 la salle reste de 10 tables et 40 couverts, jointure comprise',
  tablesTotales(SALLE) === 10 && couvertsTotaux(SALLE) === 40,
  `${tablesTotales(SALLE)} tables / ${couvertsTotaux(SALLE)} couverts`)
verifier('🔴 la jointure ne décide pas du mode : la salle reste en tables',
  enModeInventaire(SALLE) === true)
verifier('⚠️ et une jointure sans nombre ne fait pas basculer la salle en couverts',
  enModeInventaire([T4, T2, T6, { ...J, quantite: null }]) === true)
egal('⚠️ elle n’est pas non plus « un format à qui il manque le nombre »',
  formatsSansQuantite([T4, { ...J, quantite: null }]), [])
egal('🔴 la plus grande TABLE reste la table de six', plusGrandeTable(SALLE), 6)

// ═══════════════════════════════════════════════════════════════════════════
// 3. QUAND UNE JOINTURE EST PROPOSABLE
// ═══════════════════════════════════════════════════════════════════════════
egal('la jointure du Bistrologue est proposable', jointuresValides(SALLE).map(f => f.id), ['j'])
egal('🔴 pas d’inventaire, pas de jointure : on ne sait pas quelles tables sont libres',
  jointuresValides([T4, J, { ...T2, quantite: null }, T6]), [])
egal('🔴 une jointure éteinte ne se propose pas', jointuresValides([T4, { ...J, actif: false }, T2, T6]), [])
egal('🔴 ni celle dont la table est éteinte', jointuresValides([{ ...T4, actif: false }, J, T2, T6]), [])
egal('🔴 ni celle dont la table n’existe plus', jointuresValides([J, T2, T6]), [])
egal('🔴 ni deux tables de quatre jointes dans une salle qui n’en a qu’une',
  jointuresValides([{ ...T4, quantite: 1 }, J, T2, T6]), [])
egal('⚠️ ni une jointure de jointure',
  jointuresValides([T4, J, T2, T6, { ...J, id: 'jj', jointure_de: 'j' }]).map(f => f.id), ['j'])
egal('⚠️ ni une jointure sans taille déclarée', jointuresValides([T4, { ...J, couverts_max: null }, T2, T6]), [])

// ═══════════════════════════════════════════════════════════════════════════
// 4. 🔴 LE DERNIER RECOURS : LES TABLES SEULES D'ABORD
// ═══════════════════════════════════════════════════════════════════════════
egal('🔴 un groupe de six : la table de six d’abord, la jointure ensuite',
  formatsPourGroupe(SALLE, 6).map(f => f.id), ['t6', 'j'])
egal('🔴 un groupe de huit : seule la jointure l’accueille', formatsPourGroupe(SALLE, 8).map(f => f.id), ['j'])
egal('⚠️ un groupe de quatre ne se voit jamais proposer deux tables jointes',
  formatsPourGroupe(SALLE, 4).map(f => f.id), ['t4'])
egal('⚠️ un groupe de dix n’a rien, même joint', formatsPourGroupe(SALLE, 10), [])
{
  // Deux jointures possibles pour huit : la plus juste d'abord, puis la moins
  // gourmande en tables, et l'ordre de la base ne change rien.
  const J3 = { ...J, id: 'j3', nom: '3 tables de 4 jointes', couverts_min: 7, couverts_max: 12, quantite: 1, jointure_tables: 3 }
  const avec = [J3, ...SALLE]
  egal('⚠️ entre deux jointures, la plus juste pour le groupe', formatsPourGroupe(avec, 8).map(f => f.id), ['j', 'j3'])
  egal('⚠️ et l’ordre de la base n’y change rien',
    formatsPourGroupe([...SALLE, J3].reverse(), 8).map(f => f.id), ['j', 'j3'])
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. 🔴 UNE JOINTURE IMMOBILISE SES TABLES
// ═══════════════════════════════════════════════════════════════════════════
{
  const huitAttables = [resa('r1', 'j')]
  const pris = occupationParFormat(huitAttables, H19, H19 + 150, SALLE)
  egal('🔴 un groupe de huit sur deux tables de quatre en immobilise DEUX', pris.get('t4'), 2)
  egal('⚠️ et compte pour une jointure en cours', pris.get('j'), 1)
  egal('⚠️ sans la liste des formats, on ne sait pas que c’est une jointure : une ligne, comme avant',
    [...occupationParFormat(huitAttables, H19, H19 + 150)], [['j', 1]])
  egal('🔴 une jointure ÉTEINTE immobilise toujours ses tables : ses réservations sont assises',
    occupationParFormat(huitAttables, H19, H19 + 150, [T4, { ...J, actif: false }, T2, T6]).get('t4'), 2)
  egal('⚠️ on compte les chevauchements, pas les heures égales',
    occupationParFormat([resa('r1', 'j', '18:30:00', '21:00:00')], H19, H19 + 120, SALLE).get('t4'), 2)
  verifier('⚠️ et ce qui ne chevauche pas ne compte pas',
    occupationParFormat([resa('r1', 'j', '16:00:00', '18:30:00')], H19, H19 + 120, SALLE).size === 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LA TABLE DONNÉE, SALLE QUI SE REMPLIT
// ═══════════════════════════════════════════════════════════════════════════
{
  const deuxSix = [resa('a', 't6'), resa('b', 't6')]
  const choix = (couverts, reservations, duree = 150) =>
    formatLibrePour({ formats: SALLE, couverts, reservations, debutMin: H19, finMin: H19 + duree })
  egal('🔴 six personnes, une table de six libre : la table de six', choix(6, [resa('a', 't6')]).format?.id, 't6')
  egal('🔴 six personnes, les tables de six prises : deux tables de quatre jointes', choix(6, deuxSix).format?.id, 'j')
  egal('🔴 huit personnes, salle vide : la jointure', choix(8, []).format?.id, 'j')

  const deuxJointures = [resa('a', 'j'), resa('b', 'j')]
  const quota = choix(8, deuxJointures)
  verifier('🔴 le restaurateur en autorise deux à la fois : la troisième est refusée',
    quota.format === null && quota.raison === 'complet', JSON.stringify(quota.raison))
  egal('⚠️ et un groupe de quatre prend l’une des deux tables de quatre qui restent',
    choix(4, deuxJointures, 120).format?.id, 't4')

  const cinqQuatre = ['a', 'b', 'c', 'd', 'e'].map(id => resa(id, 't4'))
  const plusAssez = choix(8, cinqQuatre)
  verifier('🔴 une seule table de quatre libre : on ne joint pas deux tables qui n’existent pas',
    plusAssez.format === null && plusAssez.raison === 'complet', JSON.stringify(plusAssez.raison))

  const pleine = [resa('a', 'j'), resa('b', 't4'), resa('c', 't4')]
  const quatre = choix(4, [...pleine, resa('d', 'j')], 120)
  verifier('🔴 deux jointures + deux tables seules : les six tables de quatre sont prises',
    quatre.format === null && quatre.raison === 'complet', JSON.stringify(quatre))

  const dix = choix(10, [])
  verifier('🔴 dix personnes : « trop grand », pas « complet »',
    dix.format === null && dix.raison === 'aucune_table_a_cette_taille', dix.raison)
  verifier('⚠️ et la grille de la fiche le dit de la même façon',
    conflitSalle({ formats: SALLE, couverts: 10, reservations: [], debut: H19, fin: H19 + 150 }).raison === 'trop_grand')
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. CE QUE VOIT LE RESTAURATEUR AU TÉLÉPHONE
// ═══════════════════════════════════════════════════════════════════════════
{
  const e = etatSalle({ formats: SALLE, couverts: 8, reservations: [resa('a', 'j')], debutMin: H19, finMin: H19 + 150 })
  egal('🔴 la salle se lit avec la jointure en dernier, marquée',
    e.parFormat.map(l => `${l.format.id}:${l.libres}/${l.total}${l.jointure ? ' jointe' : ''}${l.convient ? ' +' : ''}`),
    ['t2:2/2', 't4:4/6', 't6:2/2', 'j:1/2 jointe +'])
  egal('🔴 et la jointure proposée pour huit', e.proposition?.id, 'j')
  const pourDeux = etatSalle({ formats: SALLE, couverts: 2, reservations: [], debutMin: H19, finMin: H19 + 90 })
  verifier('⚠️ pour un couple, la jointure ne convient pas', pourDeux.parFormat.find(l => l.jointure)?.convient === false)
  egal('⚠️ au mieux, pas plus de jointures que de paires de tables',
    etatSalle({ formats: [T2, { ...T4, quantite: 3 }, T6, { ...J, quantite: 5 }], couverts: 8, reservations: [], debutMin: H19, finMin: H19 + 150 })
      .parFormat.find(l => l.jointure)?.total, 1)
  const deplace = etatSalle({ formats: SALLE, couverts: 8, reservations: [resa('moi', 'j'), resa('a', 'j')], debutMin: H19, finMin: H19 + 150, exclureId: 'moi' })
  egal('🔴 une jointure qu’on déplace ne se gêne pas elle-même',
    [tableAPoser(deplace, { prefere: 'j', basculer: true }).format?.id, tableAPoser(deplace, { prefere: 'j', basculer: true }).forcer], ['j', false])
  const quotaAtteint = etatSalle({ formats: SALLE, couverts: 8, reservations: [resa('a', 'j'), resa('b', 'j')], debutMin: H19, finMin: H19 + 150 })
  egal('🔴 quota atteint : prévenir, puis laisser poser (décision d’Alex)',
    [tableAPoser(quotaAtteint).format?.id, tableAPoser(quotaAtteint).forcer, tableAPoser(quotaAtteint).raison], ['j', true, 'complet'])

  const trop = phraseSalle({ formats: SALLE, etat: null, choix: { format: null, forcer: false, raison: 'trop_grand' }, couverts: 10, debut: '19:00', fin: null })
  egal('🔴 dix personnes : la phrase parle des tables jointes, pas de la plus grande table',
    trop?.detail, 'Même en joignant des tables, ta salle accueille 8 personnes au plus.')
  const sansJointure = phraseSalle({ formats: [T4, T2, T6], etat: null, choix: { format: null, forcer: false, raison: 'trop_grand' }, couverts: 8, debut: '19:00', fin: null })
  egal('⚠️ et sans jointure, la phrase d’avant, mot pour mot', sansJointure?.detail, 'La plus grande en accueille 6.')
  const eSix = etatSalle({ formats: SALLE, couverts: 6, reservations: [resa('a', 't6'), resa('b', 't6')], debutMin: H19, finMin: H19 + 150 })
  const dit = phraseSalle({ formats: SALLE, etat: eSix, choix: tableAPoser(eSix), couverts: 6, debut: '19:00', fin: '21:30' })
  verifier('🔴 six personnes sur deux tables jointes : l’écran dit pourquoi pas la table de six',
    dit?.titre === '2 tables de 4 jointes · 19:00 → 21:30' && dit?.detail === '« Table de 6 » : aucune n’est libre de 19:00 à 21:30.',
    JSON.stringify(dit))
  verifier('⚠️ aucun tiret cadratin dans ce que dit la salle',
    [trop, sansJointure, dit].every(m => !/—/.test(`${m?.titre} ${m?.detail}`)))
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. « NOUS SERONS COMBIEN ? » : JUSQU'AU PLUS GRAND GROUPE
// ═══════════════════════════════════════════════════════════════════════════
egal('🔴 le sélecteur va jusqu’à huit grâce à la jointure', plusGrandGroupe(SALLE), 8)
egal('⚠️ sans jointure, jusqu’à la plus grande table, comme avant', plusGrandGroupe([T4, T2, T6]), 6)
egal('🔴 et chaque taille proposée a sa table', taillesReservables(SALLE), [1, 2, 3, 4, 5, 6, 7, 8])
egal('🔴 une taille sans table ne se propose pas : pas de bouton qui ne mène à rien',
  taillesReservables([T2, T4, J]), [1, 2, 3, 4, 6, 7, 8])
egal('⚠️ le format montré pour huit est la jointure', formatPourAffichage(SALLE, 8)?.id, 'j')
egal('🔴 la durée de huit personnes est celle de la jointure', dureeDuGroupe({ prestation: J, formats: SALLE, couverts: 8 }), 150)
egal('⚠️ et six personnes gardent la durée de la table de six, même posées sur la jointure',
  dureeDuGroupe({ prestation: T6, formats: SALLE, couverts: 6 }), 150)
egal('⚠️ une jointure aux paliers suit ses paliers',
  dureeDuGroupe({ prestation: J, formats: [T4, T2, T6, { ...J, duree_paliers: [{ des: 8, minutes: 180 }] }], couverts: 8 }), 180)

// ─── La grille de la fiche, qui décide de ce que le client voit ─────────────
{
  const samedi = new Date('2026-09-19T12:00:00+02:00')
  const service = [{ id: 'soir', jour_semaine: 'samedi', heure_debut: '18:00', heure_fin: '23:30', pas_minutes: 30, actif: true }]
  const ouvert = { samedi: { ouvert: true, debut: '09:00', fin: '02:00' } }
  const grille = (reservations) => genererSlots({
    dateChoisie: samedi, dureeMinutes: 150, creneaux: service, reservations, horairesDetail: ouvert,
    capacite: J.capacite, prestationId: 'j', liaisonsCreneaux: [], parCouverts: true, couvertsDemandes: 8,
    salle: { formats: SALLE, reservations },
  })
  const a19 = (slots) => slots.find(s => s.heure === '19:00')
  verifier('🔴 la fiche propose 19:00 à un groupe de huit quand une jointure reste',
    a19(grille([resa('a', 'j')]))?.pris === false, JSON.stringify(a19(grille([resa('a', 'j')]))))
  verifier('🔴 et le ferme quand les deux sont prises, en disant « complet »',
    a19(grille([resa('a', 'j'), resa('b', 'j')]))?.pris === true && a19(grille([resa('a', 'j'), resa('b', 'j')]))?.motif === 'complet')
  verifier('⚠️ ou quand il ne reste qu’une table de quatre à joindre',
    a19(grille(['a', 'b', 'c', 'd', 'e'].map(id => resa(id, 't4'))))?.pris === true)
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. LE RÉGLAGE, CHEZ LE RESTAURATEUR
// ═══════════════════════════════════════════════════════════════════════════
egal('le nom proposé parle comme lui', nomDeJointure(T4, 2), '2 tables de 4 jointes')
egal('⚠️ et reste lisible pour un nom libre', nomDeJointure({ nom: 'Banquette' }, 3), '3 × Banquette')
egal('⚠️ « Table pour 2 » aussi', nomDeJointure({ nom: 'Table pour 2' }, 2), '2 tables pour 2 jointes')
egal('on joint une table qu’on a en deux exemplaires au moins',
  basesJoignables([...SALLE, { ...T2, id: 'seule', quantite: 1 }]).map(f => f.id).sort(), ['t2', 't4', 't6'])
egal('⚠️ jamais une jointure', basesJoignables(SALLE).some(f => estJointure(f)), false)
egal('les jointures d’une table se retrouvent', jointuresDe(T4, SALLE).map(j => j.id), ['j'])
{
  const d = jointureParDefaut(T4, SALLE, 2)
  egal('🔴 par défaut : une de plus que la table, jusqu’à la somme', [d.couverts_min, d.couverts_max], [5, 8])
  egal('🔴 et UNE À LA FOIS : c’est au restaurateur d’en engager plus', d.quantite, 1)
  egal('⚠️ pour la durée du plus long repas de la salle', d.duree_minutes, 150)
  egal('⚠️ et le nom qui va avec', d.nom, '2 tables de 4 jointes')
  egal('⚠️ trois tables : jusqu’à douze', jointureParDefaut(T4, SALLE, 3).couverts_max, 12)
}
{
  const ok8 = { base: T4, tables: 2, couverts_min: 6, couverts_max: 8, quantite: 2 }
  egal('la jointure du Bistrologue s’enregistre', verifierJointure(ok8), null)
  verifier('🔴 pas sans table', /Choisis une table/.test(verifierJointure({ ...ok8, base: null })))
  verifier('🔴 pas une jointure de jointure', /Choisis une table/.test(verifierJointure({ ...ok8, base: J })))
  verifier('🔴 pas plus de tables qu’on n’en a', /de 2 à 6/.test(verifierJointure({ ...ok8, tables: 7 })))
  verifier('⚠️ ni une seule', /de 2 à 6/.test(verifierJointure({ ...ok8, tables: 1 })))
  verifier('⚠️ pas une table en un seul exemplaire', /au moins deux/.test(verifierJointure({ ...ok8, base: { ...T4, quantite: 1 } })))
  verifier('⚠️ « à partir de » ne dépasse pas « jusqu’à »', /ne peut pas dépasser/.test(verifierJointure({ ...ok8, couverts_min: 9 })))
  verifier('⚠️ pour deux personnes au moins', /au moins deux/.test(verifierJointure({ ...ok8, couverts_max: 1, couverts_min: 1 })))
  verifier('🔴 pas plus de jointures à la fois que de paires de tables',
    /tu peux en avoir 3 au plus en même temps/.test(verifierJointure({ ...ok8, quantite: 4 })))
  verifier('⚠️ et au moins une', verifierJointure({ ...ok8, quantite: 0 }) !== null)
}
egal('une jointure en ordre n’a rien à dire', alerteJointure(J, SALLE), null)
verifier('🔴 elle dit que sa table est éteinte', /est désactivée/.test(alerteJointure(J, [{ ...T4, actif: false }, J]) || ''))
verifier('🔴 qu’elle n’existe plus', /n’existe plus/.test(alerteJointure(J, [J, T2]) || ''))
verifier('🔴 qu’il en manque', /Il faut au moins 2/.test(alerteJointure(J, [{ ...T4, quantite: 1 }, J]) || ''))
verifier('⚠️ et qu’on en autorise plus que la salle ne permet',
  /n’en permettent que 1 à la fois/.test(alerteJointure({ ...J, quantite: 3 }, [{ ...T4, quantite: 3 }, J]) || ''))

// ═══════════════════════════════════════════════════════════════════════════
// 10. LE SERVEUR, SUR UNE FAUSSE BASE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ ELLE REPRODUIT CE QUI COMPTE : les formats de la salle, les réservations
// de l'heure, et l'index anti double-booking sur le rang. Un témoin vérifie
// qu'elle refuse bien un doublon, sinon ce test ne prouverait rien.
const { creerReservationRdv } = await import('../lib/rdv-creation-server.js')
function salleSimulee({ demandee, formats, existantes = [] }) {
  const vu = { payload: null, formatsLus: null }
  const table = (nom) => {
    const filtres = {}
    let colonnes = ''
    const chaine = {
      select: (c) => { colonnes = String(c || ''); if (nom === 'rdv_prestations') vu.formatsLus = colonnes; return chaine },
      eq: (col, val) => { filtres[col] = val; return chaine },
      in: (col, val) => { filtres[col] = val; return chaine },
      is: () => chaine,
      neq: () => chaine,
      order: () => chaine,
      maybeSingle: async () => ({
        data: nom === 'rdv_prestations' ? demandee
          : nom === 'commercants' ? { id: 'c1', nom: 'Le Bistrologue', adresse: 'Place Joseph Meunier, Mettet' }
          : null,
      }),
      insert: (p) => { vu.payload = p; return chaine },
      single: async () => {
        const p = vu.payload
        const doublon = existantes.some(r =>
          String(r.praticien_id ?? '') === String(p?.praticien_id ?? '')
          && r.date_rdv === p?.date_rdv
          && String(r.heure_debut).slice(0, 5) === String(p?.heure_debut).slice(0, 5)
          && Number(r.place_no) === Number(p?.place_no))
        return doublon
          ? { data: null, error: { code: '23505' } }
          : { data: { id: 'rdv-neuf', numero_rdv: 9, numero_prefixe: 'RE', place_no: p?.place_no }, error: null }
      },
      then: (resoudre) => {
        if (nom === 'rdv_prestations') return resoudre({ data: formats })
        if (nom !== 'rdv_reservations') return resoudre({ data: [] })
        let lignes = existantes.filter(r => !filtres.date_rdv || r.date_rdv === filtres.date_rdv)
        if (filtres.prestation_id !== undefined) {
          const ids = [].concat(filtres.prestation_id).map(String)
          lignes = lignes.filter(r => ids.includes(String(r.prestation_id)))
        }
        if (filtres.heure_debut !== undefined) {
          lignes = lignes.filter(r => String(r.heure_debut).slice(0, 5) === String(filtres.heure_debut).slice(0, 5))
        }
        void colonnes
        return resoudre({ data: lignes })
      },
    }
    return chaine
  }
  return { from: table, _vu: vu }
}
const reserver = (db, prestationId, couverts, heure = '19:00') => creerReservationRdv(db, {
  commercantId: 'c1', prestationId, dateRdv: '2026-09-19', heureDebut: heure,
  champs: { couverts, client_email: 'essai@yoppaa.app' },
})
const C1 = (f) => ({ ...f, commercant_id: 'c1' })
const SALLE_SRV = SALLE.map(C1)
{
  const db = salleSimulee({ demandee: C1(J), formats: SALLE_SRV, existantes: [resa('x', 't2', '19:00:00', '20:30:00')] })
  const r = await db.from('rdv_reservations').insert({ praticien_id: null, date_rdv: '2026-09-19', heure_debut: '19:00', place_no: 1 }).select('id').single()
  verifier('⚠️ témoin : la fausse base refuse bien un rang déjà pris', r.error?.code === '23505')
}
{
  const db = salleSimulee({ demandee: C1(J), formats: SALLE_SRV })
  const res = await reserver(db, 'j', 8)
  verifier('🔴 un groupe de huit réserve en ligne', res.ok === true, JSON.stringify({ ok: res.ok, code: res.code }))
  egal('🔴 sur deux tables de quatre jointes', db._vu.payload?.prestation_id, 'j')
  egal('⚠️ pour huit couverts, la durée de la jointure', [db._vu.payload?.couverts, db._vu.payload?.duree_minutes, db._vu.payload?.heure_fin], [8, 150, '21:30'])
  egal('⚠️ et une capacité gravée qui laisse deux tables coexister', db._vu.payload?.capacite_creneau, 16)
  verifier('🔴 le serveur lit la composition des formats, sinon il ne saurait rien joindre',
    /\bjointure_de\b/.test(db._vu.formatsLus || '') && /\bjointure_tables\b/.test(db._vu.formatsLus || ''), db._vu.formatsLus)
}
{
  const db = salleSimulee({ demandee: C1(T6), formats: SALLE_SRV, existantes: [resa('a', 't6'), resa('b', 't6', '19:00:00', '21:30:00', { place_no: 2 })] })
  const res = await reserver(db, 't6', 6)
  verifier('🔴 six personnes, tables de six prises : le serveur joint deux tables de quatre',
    res.ok === true && db._vu.payload?.prestation_id === 'j', JSON.stringify({ code: res.code, table: db._vu.payload?.prestation_id }))
  egal('⚠️ au premier rang libre de l’heure', db._vu.payload?.place_no, 3)
  egal('⚠️ pour la durée du groupe de six', db._vu.payload?.duree_minutes, 150)
}
{
  const db = salleSimulee({ demandee: C1(T6), formats: SALLE_SRV, existantes: [resa('a', 't6', '19:00:00', '21:30:00', { place_no: 1 })] })
  const res = await reserver(db, 't6', 6)
  egal('🔴 six personnes, une table de six libre : pas de jointure', [res.ok, db._vu.payload?.prestation_id], [true, 't6'])
}
{
  const db = salleSimulee({ demandee: C1(J), formats: SALLE_SRV, existantes: [resa('a', 'j'), resa('b', 'j', '19:00:00', '21:30:00', { place_no: 2 })] })
  const res = await reserver(db, 'j', 8)
  verifier('🔴 deux jointures déjà en place : la troisième est refusée, rien n’est écrit',
    res.ok === false && res.code === 'salle_complete' && db._vu.payload === null, JSON.stringify({ code: res.code }))
}
{
  const cinq = ['a', 'b', 'c', 'd', 'e'].map((id, i) => resa(id, 't4', '19:00:00', '21:00:00', { place_no: i + 1 }))
  const db = salleSimulee({ demandee: C1(J), formats: SALLE_SRV, existantes: cinq })
  const res = await reserver(db, 'j', 8)
  verifier('🔴 une seule table de quatre libre : le serveur ne joint pas ce qui n’existe pas',
    res.ok === false && res.code === 'salle_complete' && db._vu.payload === null, JSON.stringify({ code: res.code }))
}
{
  const existantes = [
    resa('a', 'j'), resa('b', 'j', '19:00:00', '21:30:00', { place_no: 2 }),
    resa('c', 't4', '19:00:00', '21:00:00', { place_no: 3 }), resa('d', 't4', '19:00:00', '21:00:00', { place_no: 4 }),
  ]
  const db = salleSimulee({ demandee: C1(T4), formats: SALLE_SRV, existantes })
  const res = await reserver(db, 't4', 4)
  verifier('🔴 les tables jointes sortent de leur format : plus de table de quatre pour quatre',
    res.ok === false && res.code === 'salle_complete', JSON.stringify({ code: res.code, table: db._vu.payload?.prestation_id }))
}
{
  const db = salleSimulee({ demandee: C1(J), formats: SALLE_SRV })
  const res = await reserver(db, 'j', 10)
  verifier('⚠️ un nombre hors des bornes de la jointure est refusé', res.ok === false && res.code === 'couverts_invalides', JSON.stringify(res.code))
}
{
  const db = salleSimulee({ demandee: C1(T6), formats: SALLE_SRV })
  const res = await reserver(db, 't6', 12)
  verifier('⚠️ douze personnes sur une table de six : ses bornes les refusent, rien n’est écrit',
    res.ok === false && res.code === 'couverts_invalides' && db._vu.payload === null, JSON.stringify(res.code))
}
{
  const enCouverts = [C1(T4), C1(J), C1({ ...T2, quantite: null }), C1(T6)]
  const db = salleSimulee({ demandee: C1(J), formats: enCouverts })
  const res = await reserver(db, 'j', 8)
  verifier('🔴 une jointure hors inventaire est refusée, rien n’est écrit',
    res.ok === false && res.code === 'prestation_introuvable' && db._vu.payload === null, JSON.stringify(res.code))
}
{
  const db = salleSimulee({ demandee: C1({ ...J, actif: false }), formats: [C1(T4), C1({ ...J, actif: false }), C1(T2), C1(T6)] })
  const res = await reserver(db, 'j', 8)
  verifier('⚠️ une jointure éteinte n’accueille plus de groupe de huit en ligne',
    res.ok === false && res.code === 'groupe_trop_grand' && db._vu.payload === null, JSON.stringify(res.code))
}

// ═══════════════════════════════════════════════════════════════════════════
// 11. CE QUI NE S'EXÉCUTE PAS HORS NAVIGATEUR : LE CÂBLAGE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CES GARDES DISENT QUE LA RÈGLE EST APPELÉE, pas qu'elle est juste : c'est
// le haut du fichier qui l'exécute.

// 🔴 LA COMPOSITION VOYAGE AVEC L'INVENTAIRE, DANS TOUT LE DÉPÔT. Une liste de
// formats qui porte `quantite` sert à compter la salle : sans `jointure_de` et
// `jointure_tables`, une réservation sur deux tables jointes n'y pèserait qu'une
// ligne, et ses tables paraîtraient libres. On résout aussi la constante du
// serveur, sinon la garde ne lirait qu'un nom de variable.
{
  const racine = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
  const fichiers = []
  const parcourir = (d) => {
    for (const e of readdirSync(d)) {
      if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
      const p = join(d, e)
      if (statSync(p).isDirectory()) parcourir(p)
      else if (/\.jsx?$/.test(e)) fichiers.push(p)
    }
  }
  parcourir(join(racine, 'app'))
  parcourir(join(racine, 'lib'))
  const fautifs = []
  const vus = []
  for (const f of fichiers) {
    const src = sansProse(readFileSync(f, 'utf8'))
    const nom = f.split(/[\\/]/).slice(-2).join('/')
    const constante = (src.match(/COLONNES_PRESTATION_DECIDE\s*=\s*\n?\s*'([^']+)'/) || [])[1] || null
    const selects = [
      ...[...src.matchAll(/from\(\s*['"]rdv_prestations['"]\s*\)[\s\S]{0,300}?\.select\(\s*(['"`])([^'"`]*)\1/g)].map(m => m[2]),
      ...(constante ? [...src.matchAll(/\.select\(COLONNES_PRESTATION_DECIDE\)/g)].map(() => constante) : []),
    ]
    for (const cols of selects) {
      vus.push(`${nom} → ${cols}`)
      if (/\bquantite\b/.test(cols) && !(/\bjointure_de\b/.test(cols) && /\bjointure_tables\b/.test(cols))) {
        fautifs.push(`${nom} → ${cols}`)
      }
    }
  }
  verifier('🔴 aucune liste de formats ne compte la salle sans la composition des jointures',
    fautifs.length === 0, fautifs.join(' | '))
  verifier('⚠️ et la garde voit le select du tableau de bord',
    vus.some(v => /^dashboard\/page\.js → .*\bquantite\b/.test(v)), `${vus.length} selects vus`)
  verifier('⚠️ et la constante du serveur',
    vus.some(v => /^lib\/rdv-creation-server\.js → .*\bquantite\b/.test(v)), `${vus.length} selects vus`)
}

// 🔴 CHAQUE COMPTAGE PASSE LA LISTE DES FORMATS. Sans elle, `occupationParFormat`
// ne sait pas qu'une ligne est une jointure : c'est exactement le trou de la
// section 5, par la porte d'un appelant.
{
  const SALLE_LIB = lire('lib/inventaire-salle.js')
  const appels = [...SALLE_LIB.matchAll(/occupationParFormat\(([^()]*)\)/g)].map(m => m[1])
    .filter(a => !/^reservations, debutMin, finMin, formats = null$/.test(a.trim()))
  verifier('🔴 le module compte toujours avec les formats',
    appels.length >= 2 && appels.every(a => a.split(',').length === 4 && /formats\s*$/.test(a)), JSON.stringify(appels))
  verifier('⚠️ et personne d’autre ne compte la salle à sa façon',
    !/occupationParFormat\(/.test(lire('lib/rdv-creation-server.js'))
    && !/occupationParFormat\(/.test(lire('app/dashboard/ModalNouveauRdv.js'))
    && !/occupationParFormat\(/.test(lire('app/dashboard/ModalDeplacerRdv.js')))
}

// Le serveur.
{
  const SRV = lire('lib/rdv-creation-server.js')
  verifier('🔴 le serveur refuse une jointure dans une salle comptée en couverts',
    /if \(estJointure\(prestation\) && !enModeInventaire\(formatsTable\)\) \{\s*return \{ ok: false, code: 'prestation_introuvable' \}/.test(SRV))
  const ROUTE = lire('app/api/rdv/reserver/route.js')
  verifier('🔴 « trop grand » répond un 409 qui dit d’appeler, pas un 500 « réessaie »',
    /if \(res\.code === 'groupe_trop_grand'\) \{[\s\S]{0,300}?Appelle directement \$\{commercant\.nom\}[\s\S]{0,200}?status: 409/.test(ROUTE))
  verifier('⚠️ et « complet » renvoie choisir une autre heure',
    /if \(res\.code === 'salle_complete'\) \{[\s\S]{0,400}?creneau_refuse: true,/.test(ROUTE))
}

// La fiche du client.
{
  const FICHE = lire('app/commander/rdv/[slug]/page.js')
  verifier('🔴 le sélecteur ne propose que les tailles qu’une table accueille',
    /\{taillesReservables\(prestations\)\.map\(n => \(/.test(FICHE)
    && !/Array\.from\(\{ length: plusGrand/.test(FICHE))
  verifier('🔴 une jointure ne se choisit jamais dans une liste de cartes',
    /const prestationsAuChoix = \(prestations \|\| \[\]\)\.filter\(p => !estJointure\(p\)\)/.test(FICHE)
    && /\{prestationsAuChoix\.map\(p =>/.test(FICHE)
    && /const prestationsProposables = prestationsAuChoix\.filter\(/.test(FICHE))
  verifier('⚠️ une taille sans table se dit, avec le téléphone',
    /const tailles = taillesReservables\(prestations\)/.test(FICHE) && /if \(!tailles\.includes\(n\)\) trous\.push\(n\)/.test(FICHE))
}

// Le tableau de bord : la saisie au téléphone.
{
  const SAISIE = lire('app/dashboard/ModalNouveauRdv.js')
  verifier('🔴 la saisie ne propose pas une jointure dans son menu',
    /const auMenu = \(prestations \|\| \[\]\)\.filter\(p => !estJointure\(p\)\)/.test(SAISIE)
    && /\(salleEnTables \? autresPrestations : auMenu\)\.map\(p =>/.test(SAISIE))
  verifier('🔴 le nombre de personnes va jusqu’au plus grand groupe',
    /max=\{plusGrandGroupe\(prestations\) \|\| undefined\}/.test(SAISIE))
  verifier('⚠️ la jointure ne s’affiche qu’au groupe qu’elle accueille, dans les deux listes',
    (SAISIE.match(/etat\.parFormat\.filter\(l => !l\.jointure \|\| l\.convient\)\.map\(/g) || []).length === 2)
}

// Le tableau de bord : les réglages.
{
  const CFG = lire('app/dashboard/ConfigDashboard.js')
  verifier('🔴 les jointures ne comptent pas parmi les tables de la liste',
    /const prestationsSeules = prestations\.filter\(p => !estJointure\(p\)\)/.test(CFG)
    && /\{prestationsSeules\.map\(p => \{/.test(CFG))
  verifier('🔴 la section des tables jointes n’existe que chez un restaurant',
    /\{estTable && \(jointures\.length > 0 \|\| enModeInventaire\(prestations\)\) && \(\(\) => \{/.test(CFG))
  verifier('🔴 la composition part à la création, et seulement là',
    /const aCreer = formEstJointure\s*\?\s*\{ \.\.\.payload, jointure_de: form\.jointure_de, jointure_tables: Number\(form\.jointure_tables\) \}\s*:\s*payload/.test(CFG)
    && /\.update\(payload\)\.eq\('id', editId\)/.test(CFG))
  const blocPayload = (CFG.match(/const payload = \{[\s\S]*?\n {4}\}\n/) || [''])[0]
  verifier('⚠️ et la mise à jour ne la renvoie jamais', blocPayload.length > 200 && !/jointure_/.test(blocPayload), `${blocPayload.length} caractères`)
  verifier('🔴 la règle du module passe avant la base',
    /const refus = verifierJointure\(\{/.test(CFG) && /if \(refus\) return toast\(refus, 'error'\)/.test(CFG))
  verifier('🔴 une nouvelle jointure reçoit les services de sa table, et l’échec se dit',
    /\.from\('rdv_creneau_prestations'\)\s*\.select\('creneau_id'\)\s*\.eq\('prestation_id', form\.jointure_de\)/.test(CFG)
    && /if \(errC\) copieRatee = true/.test(CFG) && /if \(copieRatee\) \{/.test(CFG))
  verifier('🔴 une jointure réservée ne s’éteint pas et ne se supprime pas sans le dire',
    /if \(p\.actif && await refusJointureReservee\(p\)\) return/.test(CFG)
    && /if \(await refusJointureReservee\(p\)\) return/.test(CFG))
  verifier('⚠️ ses réservations à venir comptent dès aujourd’hui, à l’heure de Bruxelles',
    /\.gte\('date_rdv', jourBruxelles\(\)\)/.test(CFG))
  verifier('🔴 une table jointe ne se supprime pas sous sa jointure',
    /const jointes = estJointure\(p\) \? \[\] : jointuresDe\(p, prestations\)/.test(CFG))
  verifier('⚠️ ni ne cesse d’être une table',
    /if \(editId && estTable && !formEstJointure && !form\.par_couverts\) \{/.test(CFG))
}

// La base : ce que le code ne voit pas.
{
  const SQL = brut('migrations/MIGRATION_TABLES_JOINTES.sql')
  for (const c of ['rdv_prestations_jointure_complete', 'rdv_prestations_jointure_bornes', 'rdv_prestations_jointure_est_une_table']) {
    verifier(`🔴 la base pose « ${c} »`, new RegExp(`ADD CONSTRAINT ${c}`).test(SQL))
  }
  verifier('🔴 la garde veille à la création ET à la modification',
    /CREATE TRIGGER rdv_prestations_jointure\s+BEFORE INSERT OR UPDATE ON public\.rdv_prestations/.test(SQL))
  verifier('🔴 la composition est figée',
    /IF TG_OP = 'UPDATE'\s+AND \(NEW\.jointure_de IS DISTINCT FROM OLD\.jointure_de\s+OR NEW\.jointure_tables IS DISTINCT FROM OLD\.jointure_tables\) THEN\s+RAISE EXCEPTION 'JOINTURE_FIGEE'/.test(SQL))
  verifier('🔴 une jointure se fait avec une table de la même maison',
    /OR base_commerce IS DISTINCT FROM NEW\.commercant_id/.test(SQL) && /RAISE EXCEPTION 'JOINTURE_INVALIDE'/.test(SQL))
  verifier('🔴 une jointure réservée ne s’éteint pas',
    /OR \(OLD\.deleted_at IS NULL AND NEW\.deleted_at IS NOT NULL\)\) THEN[\s\S]{0,400}?r\.date_rdv >= \$2[\s\S]{0,200}?RAISE EXCEPTION 'JOINTURE_RESERVEE'/.test(SQL))
  verifier('⚠️ à l’heure de Bruxelles', /USING OLD\.id, \(now\(\) AT TIME ZONE 'Europe\/Brussels'\)::date/.test(SQL))
  verifier('⚠️ la fonction ne s’appelle pas directement', /REVOKE EXECUTE ON FUNCTION public\.rdv_prestations_garde_jointure\(\) FROM public;/.test(SQL))
  verifier('⚠️ l’essai tourne sur des tables temporaires, sans lire une vraie réservation',
    /CREATE TEMP TABLE essai_tables \(LIKE public\.rdv_prestations INCLUDING DEFAULTS INCLUDING CONSTRAINTS\)/.test(SQL)
    && /EXECUTE FUNCTION public\.rdv_prestations_garde_jointure\('pg_temp\.essai_resas'\)/.test(SQL))
  const cas = [...SQL.matchAll(/INSERT INTO essai_jointures_resultats VALUES \((\d+), '[^']*', '(accepte|refuse)', '(accepte|refuse)'\)/g)]
  const numeros = [...new Set(cas.map(m => Number(m[1])))].sort((a, b) => a - b)
  egal('⚠️ quinze essais, numérotés sans trou', numeros, Array.from({ length: 15 }, (_, i) => i + 1))
  // ⚠️ CHAQUE REFUS DE LA BASE A SA PHRASE À L'ÉCRAN : un code sans traduction
  // arriverait en message brut chez le restaurateur.
  const CFG = lire('app/dashboard/ConfigDashboard.js')
  const codes = [...new Set([...SQL.matchAll(/RAISE EXCEPTION '([A-Z_]+)'/g)].map(m => m[1]))]
  egal('les trois refus de la base', codes.sort(), ['JOINTURE_FIGEE', 'JOINTURE_INVALIDE', 'JOINTURE_RESERVEE'])
  verifier('🔴 et chacun a sa phrase chez le restaurateur',
    codes.every(c => new RegExp(`m\\.includes\\('${c}'\\)\\) return '`).test(CFG)), codes.join(', '))
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Tables jointes vertes.')
