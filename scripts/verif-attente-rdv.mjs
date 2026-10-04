// Banc de LA LISTE D'ATTENTE DES RENDEZ-VOUS.
//
// 🔴 CE QU'IL GARDE. Quand une place se libère, une seule question compte :
// QUI prévenir, et DANS QUEL ORDRE. Trois façons de se tromper, aucune ne lève
// d'erreur et aucune ne se voit à l'écran :
//   • une heure comparée au mauvais format (« 09:30:00 » contre « 09:30 »),
//     et plus personne n'est jamais prévenu ;
//   • une fenêtre de dates qui exclut son dernier jour, et le client qui a dit
//     « jusqu'au 20 » n'est pas prévenu le 20 ;
//   • un push programmé après le début du créneau, qui apprend au Yopper à
//     ignorer les suivants.
//
// ⚠️ TOUT S'EXÉCUTE. Aucune garde de ce banc ne cherche un mot dans un fichier
// sans avoir d'abord fait tourner la fonction qui compte.

import {
  PORTEE_SEANCE, PORTEE_FENETRE, STATUT_EN_ATTENTE, STATUT_PREVENU, STATUT_SERVI,
  MINUTES_PRIORITE, DUREES_FENETRE,
  memeHeure, jourPlus, porteeDe, attenteOuverte, plafondDe, dureeFenetre,
  fenetreDepuis, lignePourInscription, peutAttendre,
  concerneParLaPlace, fileConcernee, chaineDePushs, attenteVivante,
  libelleAttente, jourLisible, memeCible, compterMemeCible, dejaDansLaFile,
  attenteSur, seanceLisible, annulationPrevientLaFile,
} from '../lib/attente-rdv.js'
import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

const COURS = { id: 'p-cours', commercant_id: 'c1', capacite: 12, attente_max: 3 }
const SOLO  = { id: 'p-solo',  commercant_id: 'c1', capacite: 1,  attente_max: 3 }

// ═══════════════════════════════════════════════════════════════════════════
// 1. LA PORTÉE SE DÉDUIT, ELLE NE SE CHOISIT PAS
// ═══════════════════════════════════════════════════════════════════════════
{
  egal('un cours de douze attend UNE SÉANCE', porteeDe(COURS), PORTEE_SEANCE)
  egal('un rendez-vous individuel attend UNE FENÊTRE', porteeDe(SOLO), PORTEE_FENETRE)

  // 🔴 LE PIÈGE DU ZÉRO, ENCORE. `Number(null)` vaut 0, et 0 n'est pas
  // supérieur à 1 : une capacité absente retombe sur l'individuel, qui est le
  // seul repli sûr (on n'invente pas un cours collectif).
  egal('capacité absente → individuel', porteeDe({ id: 'x', commercant_id: 'c1' }), PORTEE_FENETRE)
  egal('capacité nulle → individuel', porteeDe({ capacite: null }), PORTEE_FENETRE)
  egal('capacité 0 → individuel', porteeDe({ capacite: 0 }), PORTEE_FENETRE)
  egal('capacité 2 → séance', porteeDe({ capacite: 2 }), PORTEE_SEANCE)
  egal('prestation absente → individuel', porteeDe(null), PORTEE_FENETRE)

  // 🔴 LA GARDE QUI COMPTE. Si l'écran pouvait envoyer la portée, une requête
  // forgée poserait une attente « séance » sur un salon de coiffure : cette
  // ligne ne serait JAMAIS trouvée par le déclencheur, et personne ne saurait
  // pourquoi ce client n'est jamais prévenu.
  const forge = lignePourInscription({
    prestation: { ...SOLO, portee: PORTEE_SEANCE },
    jourISO: '2026-09-06', duree: 'semaine',
    dateRdv: '2026-09-10', heureDebut: '09:30',
    portee: PORTEE_SEANCE,
  })
  egal('🔴 une portée envoyée par l’écran est ignorée', forge?.portee, PORTEE_FENETRE)
  egal('🔴 et la date de séance forgée n’est pas retenue', forge?.date_rdv, null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LE PLAFOND
// ═══════════════════════════════════════════════════════════════════════════
{
  verifier('une file de 3 est ouverte', attenteOuverte({ attente_max: 3 }) === true)
  verifier('une file de 0 est fermée', attenteOuverte({ attente_max: 0 }) === false)
  verifier('un plafond absent ferme la file', attenteOuverte({}) === false)
  verifier('un plafond nul ferme la file', attenteOuverte({ attente_max: null }) === false)
  egal('le plafond se lit en entier', plafondDe({ attente_max: 5 }), 5)
  egal('un plafond négatif vaut zéro', plafondDe({ attente_max: -2 }), 0)

  egal('file vide : on peut attendre', peutAttendre({ prestation: COURS, dejaEnAttente: 0 }),
    { ok: true, raison: null })
  egal('file à 2 sur 3 : on peut encore', peutAttendre({ prestation: COURS, dejaEnAttente: 2 }),
    { ok: true, raison: null })
  egal('file pleine : refusée', peutAttendre({ prestation: COURS, dejaEnAttente: 3 }),
    { ok: false, raison: 'complete' })
  egal('file au-delà du plafond : refusée', peutAttendre({ prestation: COURS, dejaEnAttente: 9 }),
    { ok: false, raison: 'complete' })
  egal('déjà inscrit : refusé', peutAttendre({ prestation: COURS, dejaEnAttente: 0, dejaInscrit: true }),
    { ok: false, raison: 'deja_inscrit' })
  egal('file fermée : refusée', peutAttendre({ prestation: { attente_max: 0 }, dejaEnAttente: 0 }),
    { ok: false, raison: 'fermee' })
  // ⚠️ Un comptage absent ne doit pas ouvrir la porte en grand NI la fermer :
  // il vaut zéro, comme une file vide.
  egal('comptage absent : traité comme zéro', peutAttendre({ prestation: COURS, dejaEnAttente: null }),
    { ok: true, raison: null })
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. LES DATES
// ═══════════════════════════════════════════════════════════════════════════
{
  egal('sept jours plus tard', jourPlus('2026-09-06', 7), '2026-09-13')
  egal('un changement de mois', jourPlus('2026-09-28', 7), '2026-10-05')
  egal('un changement d’année', jourPlus('2026-12-28', 7), '2027-01-04')
  egal('une année bissextile', jourPlus('2028-02-28', 1), '2028-02-29')
  // ⚠️ MIDI UTC, ET C'EST LA RAISON. Le dernier dimanche d'octobre, une date
  // prise à minuit local recule d'un jour au passage à l'heure d'hiver.
  egal('le passage à l’heure d’hiver ne décale rien', jourPlus('2026-10-24', 1), '2026-10-25')
  egal('le passage à l’heure d’été ne décale rien', jourPlus('2026-03-28', 1), '2026-03-29')
  egal('une date invalide ne rend rien', jourPlus('06/09/2026', 7), null)
  egal('une date vide ne rend rien', jourPlus('', 7), null)
  egal('un nombre de jours absent ne rend rien', jourPlus('2026-09-06', null), null)

  egal('la semaine', fenetreDepuis('2026-09-06', 'semaine'),
    { date_debut: '2026-09-06', date_fin: '2026-09-13' })
  egal('la quinzaine', fenetreDepuis('2026-09-06', 'quinzaine'),
    { date_debut: '2026-09-06', date_fin: '2026-09-21' })
  egal('le mois', fenetreDepuis('2026-09-06', 'mois'),
    { date_debut: '2026-09-06', date_fin: '2026-10-06' })
  egal('une durée inventée ne rend rien', fenetreDepuis('2026-09-06', 'trimestre'), null)
  egal('une durée absente ne rend rien', fenetreDepuis('2026-09-06', null), null)
  egal('les trois durées sont proposées', DUREES_FENETRE.length, 3)
  verifier('chaque durée porte un libellé lisible',
    DUREES_FENETRE.length > 0 && DUREES_FENETRE.every(d => typeof d.libelle === 'string' && d.libelle.length > 3))
  egal('une durée se retrouve par sa clé', dureeFenetre('quinzaine')?.jours, 15)
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. LES DEUX FORMATS D'HEURE
// ═══════════════════════════════════════════════════════════════════════════
{
  // 🔴 LE DÉFAUT QUI NE PRÉVIENDRAIT PERSONNE. La base rend « 09:30:00 »,
  // l'écran envoie « 09:30 » : une comparaison stricte est fausse à tous les
  // coups, sans une seule erreur nulle part.
  verifier('🔴 09:30:00 et 09:30 sont la même heure', memeHeure('09:30:00', '09:30'))
  verifier('09:30 et 09:30:00 aussi, dans l’autre sens', memeHeure('09:30', '09:30:00'))
  verifier('deux heures différentes ne le sont pas', !memeHeure('09:30', '09:45'))
  // ⚠️ DEUX ABSENCES NE SONT PAS UNE ÉGALITÉ. Sans cette règle, une ligne sans
  // heure serait prévenue pour tous les créneaux de la journée.
  verifier('⚠️ deux heures absentes ne sont pas égales', !memeHeure(null, null))
  verifier('une heure vide n’égale rien', !memeHeure('', ''))
  verifier('une heure absente n’égale pas une vraie', !memeHeure(null, '09:30'))
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CE QU'ON ÉCRIT EN S'INSCRIVANT
// ═══════════════════════════════════════════════════════════════════════════
{
  const surCours = lignePourInscription({
    prestation: COURS, jourISO: '2026-09-06', dateRdv: '2026-09-10', heureDebut: '18:00',
  })
  egal('un cours inscrit une SÉANCE', surCours, {
    commercant_id: 'c1', prestation_id: 'p-cours', portee: PORTEE_SEANCE,
    date_rdv: '2026-09-10', heure_debut: '18:00', date_debut: null, date_fin: null,
  })

  const surSolo = lignePourInscription({
    prestation: SOLO, jourISO: '2026-09-06', duree: 'semaine',
  })
  egal('un solo inscrit une FENÊTRE', surSolo, {
    commercant_id: 'c1', prestation_id: 'p-solo', portee: PORTEE_FENETRE,
    date_rdv: null, heure_debut: null, date_debut: '2026-09-06', date_fin: '2026-09-13',
  })

  // L'heure de la base est ramenée au format court avant d'être écrite : sans
  // ça, la table mélangerait les deux formes et le déclencheur en raterait une.
  egal('l’heure est écrite au format court',
    lignePourInscription({ prestation: COURS, jourISO: '2026-09-06', dateRdv: '2026-09-10', heureDebut: '18:00:00' })?.heure_debut,
    '18:00')

  egal('un cours sans heure est refusé',
    lignePourInscription({ prestation: COURS, jourISO: '2026-09-06', dateRdv: '2026-09-10' }), null)
  egal('un cours sans date est refusé',
    lignePourInscription({ prestation: COURS, jourISO: '2026-09-06', heureDebut: '18:00' }), null)
  egal('un solo sans durée est refusé',
    lignePourInscription({ prestation: SOLO, jourISO: '2026-09-06' }), null)
  egal('une prestation sans commerce est refusée',
    lignePourInscription({ prestation: { id: 'x', capacite: 1 }, jourISO: '2026-09-06', duree: 'mois' }), null)

  // ⚠️ ON N'ATTEND PAS UNE SÉANCE DÉJÀ PASSÉE. Sinon la ligne reste en base
  // sans jamais pouvoir se déclencher, et elle occupe une place de la file.
  egal('🔴 une séance d’hier est refusée',
    lignePourInscription({ prestation: COURS, jourISO: '2026-09-06', dateRdv: '2026-09-05', heureDebut: '18:00' }), null)
  verifier('une séance du jour même est acceptée',
    lignePourInscription({ prestation: COURS, jourISO: '2026-09-06', dateRdv: '2026-09-06', heureDebut: '18:00' }) !== null)
}

// ═══════════════════════════════════════════════════════════════════════════
// 5 bis. LE PLAFOND COMPTE CE QU'ON ATTEND
// ═══════════════════════════════════════════════════════════════════════════
{
  const lundi  = { prestation_id: 'p-cours', portee: PORTEE_SEANCE, date_rdv: '2026-09-14', heure_debut: '18:00' }
  const mardi  = { prestation_id: 'p-cours', portee: PORTEE_SEANCE, date_rdv: '2026-09-15', heure_debut: '18:00' }
  const vivant = (o) => ({ statut: STATUT_EN_ATTENTE, ...o })

  verifier('deux inscrits sur la même séance visent la même cible', memeCible(lundi, { ...lundi }))
  verifier('🔴 le cours du lundi n’est pas celui du mardi', !memeCible(lundi, mardi))
  verifier('la même séance à une autre heure est une autre cible',
    !memeCible(lundi, { ...lundi, heure_debut: '19:00' }))
  verifier('l’heure longue et l’heure courte visent la même séance',
    memeCible(lundi, { ...lundi, heure_debut: '18:00:00' }))
  verifier('deux portées différentes ne se comptent pas ensemble',
    !memeCible(lundi, { prestation_id: 'p-cours', portee: PORTEE_FENETRE }))

  // ⚠️ EN SOLO LE PLAFOND EST PAR PRESTATION : deux fenêtres sur la même
  // prestation se comptent ensemble, quelles que soient leurs plages.
  const f1 = { prestation_id: 'p-solo', portee: PORTEE_FENETRE, date_debut: '2026-09-06', date_fin: '2026-09-13' }
  const f2 = { prestation_id: 'p-solo', portee: PORTEE_FENETRE, date_debut: '2026-10-01', date_fin: '2026-10-31' }
  verifier('🔴 en solo, deux fenêtres comptent dans la même file', memeCible(f1, f2))
  verifier('mais pas sur une autre prestation', !memeCible(f1, { ...f2, prestation_id: 'p-autre' }))

  const lignes = [
    vivant({ ...lundi, id: '1', client_id: 'y1' }),
    vivant({ ...lundi, id: '2', client_id: 'y2' }),
    vivant({ ...mardi, id: '3', client_id: 'y3' }),
    { ...lundi, id: '4', client_id: 'y4', statut: STATUT_SERVI },
  ]
  egal('deux personnes attendent le cours du lundi', compterMemeCible(lignes, lundi, '2026-09-06'), 2)
  egal('une seule attend celui du mardi', compterMemeCible(lignes, mardi, '2026-09-06'), 1)
  // 🔴 UNE LIGNE EXPIRÉE NE BLOQUE PLUS LA FILE. Sans ça, une file se fermerait
  // pour toujours au premier mois chargé, et rien ne le dirait.
  egal('🔴 après la séance, la file est libre', compterMemeCible(lignes, lundi, '2026-09-15'), 0)
  egal('une file vide compte zéro', compterMemeCible([], lundi, '2026-09-06'), 0)
  egal('une file absente compte zéro', compterMemeCible(null, lundi, '2026-09-06'), 0)

  verifier('celui qui attend déjà est reconnu', dejaDansLaFile(lignes, lundi, 'y1'))
  verifier('celui du mardi n’attend pas le lundi', !dejaDansLaFile(lignes, lundi, 'y3'))
  verifier('celui qui a été servi peut se réinscrire', !dejaDansLaFile(lignes, lundi, 'y4'))
  verifier('sans identité, on ne reconnaît personne', !dejaDansLaFile(lignes, lundi, null))
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. LE DÉSISTEMENT : QUI EST CONCERNÉ
// ═══════════════════════════════════════════════════════════════════════════
{
  const PLACE = { prestation_id: 'p-cours', date_rdv: '2026-09-10', heure_debut: '18:00:00' }
  const seance = (o = {}) => ({
    id: 'a1', prestation_id: 'p-cours', portee: PORTEE_SEANCE, statut: STATUT_EN_ATTENTE,
    date_rdv: '2026-09-10', heure_debut: '18:00', created_at: '2026-09-06T08:00:00Z', ...o,
  })
  const fenetre = (o = {}) => ({
    id: 'b1', prestation_id: 'p-cours', portee: PORTEE_FENETRE, statut: STATUT_EN_ATTENTE,
    date_debut: '2026-09-08', date_fin: '2026-09-15', created_at: '2026-09-06T09:00:00Z', ...o,
  })

  verifier('la séance exacte est concernée', concerneParLaPlace(seance(), PLACE))
  verifier('une autre heure ne l’est pas', !concerneParLaPlace(seance({ heure_debut: '19:00' }), PLACE))
  verifier('un autre jour ne l’est pas', !concerneParLaPlace(seance({ date_rdv: '2026-09-11' }), PLACE))
  verifier('une autre prestation ne l’est pas',
    !concerneParLaPlace(seance({ prestation_id: 'p-autre' }), PLACE))

  // ⚠️ CELUI QUI A DÉJÀ ÉTÉ PRÉVENU ATTEND TOUJOURS. Une deuxième place peut
  // se libérer, et l'exclure ferait de la file une liste à usage unique.
  verifier('déjà prévenu, il attend toujours', concerneParLaPlace(seance({ statut: STATUT_PREVENU }), PLACE))
  verifier('servi, il est sorti', !concerneParLaPlace(seance({ statut: STATUT_SERVI }), PLACE))

  verifier('une fenêtre qui contient le jour est concernée', concerneParLaPlace(fenetre(), PLACE))
  // 🔴 LES DEUX BORNES SONT INCLUSES. « Jusqu'au 20 » veut dire que le 20
  // compte encore : c'est le jour même où le client espérait le plus.
  verifier('🔴 la borne basse est incluse',
    concerneParLaPlace(fenetre({ date_debut: '2026-09-10', date_fin: '2026-09-30' }), PLACE))
  verifier('🔴 la borne haute est incluse',
    concerneParLaPlace(fenetre({ date_debut: '2026-09-01', date_fin: '2026-09-10' }), PLACE))
  verifier('une fenêtre finie la veille ne l’est pas',
    !concerneParLaPlace(fenetre({ date_debut: '2026-09-01', date_fin: '2026-09-09' }), PLACE))
  verifier('une fenêtre qui commence demain ne l’est pas',
    !concerneParLaPlace(fenetre({ date_debut: '2026-09-11', date_fin: '2026-09-20' }), PLACE))
  // ⚠️ UNE FENÊTRE SE MOQUE DE L'HEURE : elle attend un rendez-vous ce jour-là,
  // pas à cette minute-là.
  verifier('une fenêtre ne regarde pas l’heure',
    concerneParLaPlace(fenetre(), { ...PLACE, heure_debut: '07:15:00' }))

  verifier('une place sans date ne concerne personne',
    !concerneParLaPlace(seance(), { prestation_id: 'p-cours', heure_debut: '18:00' }))
  verifier('une ligne sans portée ne concerne personne',
    !concerneParLaPlace(seance({ portee: 'autre' }), PLACE))

  // L'ORDRE D'ARRIVÉE EST LE RANG, et les deux portées se mélangent dans la
  // même file : celui qui attendait « cette semaine » depuis lundi passe avant
  // celui qui s'est inscrit sur la séance ce matin.
  const file = fileConcernee([
    seance({ id: 'tard',  created_at: '2026-09-06T11:00:00Z' }),
    fenetre({ id: 'tot',  created_at: '2026-09-06T07:00:00Z' }),
    seance({ id: 'servi', created_at: '2026-09-06T06:00:00Z', statut: STATUT_SERVI }),
    seance({ id: 'ailleurs', prestation_id: 'p-autre', created_at: '2026-09-06T05:00:00Z' }),
    fenetre({ id: 'milieu', created_at: '2026-09-06T09:30:00Z' }),
  ], PLACE)
  egal('la file mélange les deux portées, dans l’ordre d’arrivée',
    file.map(l => l.id), ['tot', 'milieu', 'tard'])
  egal('une file sans personne concernée est vide', fileConcernee([], PLACE), [])
  egal('une file absente ne casse rien', fileConcernee(null, PLACE), [])
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. LA CHAÎNE DES NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
{
  const T0 = Date.parse('2026-09-10T14:00:00Z')
  const trois = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  const chaine = chaineDePushs(trois, { maintenantMs: T0 })
  egal('trois personnes, trois notifications', chaine.length, 3)
  egal('les rangs suivent l’ordre de la file', chaine.map(c => c.rang), [1, 2, 3])
  // Le premier part TOUT DE SUITE : pas de `send_after`, donc rien à annuler
  // pour lui. Les suivants sont programmés, donc annulables.
  egal('🔴 le premier part sans délai', chaine[0].sendAfter, null)
  egal('le deuxième part un quart d’heure plus tard', chaine[1].envoiMs - T0, MINUTES_PRIORITE * 60000)
  egal('le troisième une demi-heure plus tard', chaine[2].envoiMs - T0, 2 * MINUTES_PRIORITE * 60000)
  verifier('les suivants sont programmés, donc annulables',
    typeof chaine[1].sendAfter === 'string' && typeof chaine[2].sendAfter === 'string')
  egal('la priorité du premier dure un quart d’heure',
    Date.parse(chaine[0].prioriteJusqu) - T0, MINUTES_PRIORITE * 60000)

  // 🔴 ON NE PROGRAMME RIEN APRÈS LE DÉBUT DU CRÉNEAU. Une annulation qui tombe
  // vingt minutes avant un cours ne doit pas faire partir un push PENDANT la
  // séance, pour une place qui n'existe plus.
  const serre = chaineDePushs(trois, { maintenantMs: T0, debutMs: T0 + 20 * 60000 })
  egal('🔴 la chaîne s’arrête au début du créneau', serre.map(c => c.rang), [1, 2])
  const troisMinutes = chaineDePushs(trois, { maintenantMs: T0, debutMs: T0 + 3 * 60000 })
  egal('trois minutes avant, seul le premier part', troisMinutes.map(c => c.rang), [1])
  egal('un créneau déjà commencé ne prévient personne',
    chaineDePushs(trois, { maintenantMs: T0, debutMs: T0 - 60000 }), [])
  egal('un créneau qui commence à la seconde près ne prévient personne',
    chaineDePushs(trois, { maintenantMs: T0, debutMs: T0 }), [])

  egal('une file vide ne programme rien', chaineDePushs([], { maintenantMs: T0 }), [])
  egal('une file absente ne programme rien', chaineDePushs(null, { maintenantMs: T0 }), [])
  egal('sans instant de départ, on ne programme rien', chaineDePushs(trois, {}), [])
  // Sans borne, on prévient toute la file : c'est le cas d'un désistement
  // plusieurs jours à l'avance, le plus fréquent.
  egal('sans borne, toute la file est prévenue',
    chaineDePushs(trois, { maintenantMs: T0, debutMs: null }).length, 3)
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. CE QUI SORT DE LA FILE TOUT SEUL
// ═══════════════════════════════════════════════════════════════════════════
{
  // ⚠️ CE SONT LES DATES QUI FONT SORTIR, PAS UN CRON. Un balayage qui ne
  // tourne pas laisserait des lignes « en attente » sur des séances de l'an
  // dernier, et un push trois jours après qu'on a trouvé ailleurs est du spam.
  const s = { portee: PORTEE_SEANCE, statut: STATUT_EN_ATTENTE, date_rdv: '2026-09-10' }
  const f = { portee: PORTEE_FENETRE, statut: STATUT_EN_ATTENTE, date_debut: '2026-09-01', date_fin: '2026-09-10' }

  verifier('une séance à venir attend toujours', attenteVivante(s, '2026-09-06'))
  verifier('une séance du jour attend toujours', attenteVivante(s, '2026-09-10'))
  verifier('🔴 une séance passée est sortie', !attenteVivante(s, '2026-09-11'))
  verifier('une fenêtre en cours attend toujours', attenteVivante(f, '2026-09-06'))
  verifier('🔴 une fenêtre qui finit aujourd’hui attend ENCORE', attenteVivante(f, '2026-09-10'))
  verifier('une fenêtre expirée est sortie', !attenteVivante(f, '2026-09-11'))
  verifier('une place obtenue est sortie', !attenteVivante({ ...s, statut: STATUT_SERVI }, '2026-09-06'))
  verifier('sans jour de référence, on ne conclut rien', !attenteVivante(s, ''))
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. CE QUE LE YOPPER LIT
// ═══════════════════════════════════════════════════════════════════════════
{
  const annee = new Date().getFullYear()
  egal('un jour de cette année se dit sans l’année', jourLisible(`${annee}-09-10`), '10 septembre')
  verifier('un jour d’une autre année porte l’année', jourLisible('2031-09-10') === '10 septembre 2031')
  egal('une date invalide ne se dit pas', jourLisible('10/09/2026'), '')
  egal('un mois inventé ne se dit pas', jourLisible('2026-13-10'), '')

  verifier('une séance se dit avec son heure',
    libelleAttente({ portee: PORTEE_SEANCE, date_rdv: `${annee}-09-10`, heure_debut: '18:00:00' }) === 'le 10 septembre à 18:00')
  verifier('une fenêtre se dit avec sa fin',
    libelleAttente({ portee: PORTEE_FENETRE, date_fin: `${annee}-09-13` }) === 'jusqu’au 13 septembre')
  egal('rien à dire sur rien', libelleAttente(null), '')
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. LES BRANCHEMENTS
//
// ⚠️ CE QUE CES GARDES MESURENT N'EST PAS LA RÈGLE (elle s'exécute plus haut),
// C'EST QUE LES ROUTES L'APPELLENT. Une règle juste que personne n'invoque ne
// prévient personne, et rien ne le dit.
// ═══════════════════════════════════════════════════════════════════════════
{
  const lire = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

  // 🔴 LA COLONNE ABSENTE D'UN SELECT, HUITIÈME FOIS, ATTRAPÉE AVANT.
  // `cancel` chargeait `prestation:rdv_prestations(nom)` et PAS
  // `prestation_id` : sans lui, la file ne serait jamais retrouvée, et
  // `Number(undefined)` n'aurait levé aucune erreur.
  // ⚠️ On DÉCOUPE la liste de colonnes et on cherche dedans : chercher dans
  // tout le fichier serait vert grâce à n'importe quel jumeau.
  const CANCEL = lire('app/api/rdv/cancel/route.js')
  const colonnesCancel = /const selectCols = `([\s\S]*?)`/.exec(CANCEL)?.[1] || ''
  verifier('la liste de colonnes de l’annulation a été trouvée', colonnesCancel.length > 100,
    `${colonnesCancel.length} caractères`)
  verifier('🔴 l’annulation charge prestation_id', /\bprestation_id\b/.test(colonnesCancel))
  verifier('l’annulation du client prévient la file',
    /prevenirLaFile\(/.test(CANCEL) && /from '@\/lib\/attente-rdv-server'/.test(CANCEL))

  // 🔴 LA GARDE QUI PROTÈGE DEUX DÉCISIONS D'ALEX. 06/09 : le commerçant annule
  // souvent parce qu'il n'est pas là, donc un rendez-vous INDIVIDUEL qu'il
  // annule ne prévient personne. 04/10 : une place de COURS qu'il libère, elle,
  // prévient (« c'est une place de libre »), sauf quand tout le cours saute.
  // ⚠️ REPOINTÉE LE 04/10 : elle exigeait qu'aucun `prevenirLaFile(` n'existe
  // dans la route. Elle exige maintenant que la route passe par la règle, et
  // la règle est exécutée ci-dessous, cas par cas.
  const ANNUL_PRO = sansProse(lire('app/api/rdv/annuler-commercant/route.js'))
  const appelsFile = ANNUL_PRO.split('prevenirLaFile(').length - 1
  verifier('🔴 l’annulation du commerçant ne prévient la file QUE par la règle, une seule fois',
    appelsFile === 1
    && /if \(annulationPrevientLaFile\(rdv, \{ prevenirFile: prevenir_file, raison \}\)\) \{\s*const file = await prevenirLaFile\(/.test(ANNUL_PRO),
    `${appelsFile} appel(s)`)
  verifier('⚠️ et la règle a de quoi décider : la capacité et la table sont lues',
    /prestation_id,\s*prestation:rdv_prestations\(capacite, par_couverts\),/.test(ANNUL_PRO))
  {
    const place = (prestation, extra = {}) => ({ prestation_id: 'p', prestation, ...extra })
    verifier('🔴 une place de cours libérée par le commerce prévient la file',
      annulationPrevientLaFile(place({ capacite: 12, par_couverts: false })) === true)
    verifier('🔴 un rendez-vous individuel annulé par le commerce ne prévient personne (06/09)',
      annulationPrevientLaFile(place({ capacite: 1, par_couverts: false })) === false
      && annulationPrevientLaFile(place({ capacite: null })) === false)
    verifier('🔴 un cours ENTIER annulé ne prévient personne : aucune place ne se libère',
      annulationPrevientLaFile(place({ capacite: 12 }), { prevenirFile: false }) === false)
    verifier('⚠️ un changement de lieu non plus : la place reste promise à son client',
      annulationPrevientLaFile(place({ capacite: 12 }), { raison: 'lieu' }) === false)
    verifier('⚠️ ni une table, ni une prestation illisible',
      annulationPrevientLaFile(place({ capacite: 40, par_couverts: true })) === false
      && annulationPrevientLaFile({ prestation_id: 'p' }) === false
      && annulationPrevientLaFile(null) === false)
  }
  // Les deux gestes qui annulent TOUT ne préviennent pas : le cours entier, et
  // la journée fermée.
  const BORD = sansProse(lire('app/dashboard/page.js'))
  const debutCours = BORD.indexOf('async function repondreAnnulationSeance(')
  verifier('🔴 « Annuler ce cours » demande à la route de ne pas prévenir la file',
    debutCours > 0 && /prevenirFile: false,/.test(BORD.slice(debutCours, BORD.indexOf('function fermerAnnulationSeance', debutCours)))
    && /\{ rdv_id: rdvId, raison, prevenir_file: prevenirFile \}/.test(BORD))
  verifier('⚠️ et la fermeture d’une journée non plus',
    /\{ rdv_id: r\.id, raison: 'commercant', prevenir_file: false \}/.test(sansProse(lire('app/dashboard/ConfigDashboard.js'))))
  // 🔴 LA RÉSILIATION LIBÈRE DES PLACES (04/10) : chacune prévient sa file.
  const RESIL = sansProse(lire('app/api/rdv/resilier-abonnement/route.js'))
  verifier('🔴 la résiliation d’un abonnement prévient la file de chaque séance libérée',
    /\.select\('id, prestation_id, date_rdv, heure_debut, statut, deleted_at, rappel_push_id'\)/.test(RESIL)
    && /for \(const s of annulees\) \{\s*if \(!s\.prestation_id\) continue\s*const file = await prevenirLaFile\(supabase, \{\s*prestationId: s\.prestation_id,/.test(RESIL))

  // ⚠️ ET LA COMMERÇANTE L'APPREND : sans quoi elle appuierait ensuite sur
  // « Prévenir » à la main, pour une file déjà prévenue.
  {
    const { confirmationRdv: conf } = await import('../lib/confirmation-rdv.js')
    const RDV = { client_prenom: 'Léa', client_nom: 'Martin' }
    verifier('⚠️ la confirmation dit que la file est prévenue, et seulement si elle l’est',
      /Les personnes en liste d’attente sont prévenues/.test(conf('annule_commercant', { rdv: RDV, retours: { file_prevenue: 2 } }))
      && !/liste d’attente/.test(conf('annule_commercant', { rdv: RDV, retours: { file_prevenue: 0 } })))
    verifier('⚠️ les deux routes le rendent, et le tableau de bord le transmet',
      /file_prevenue: filePrevenue,/.test(ANNUL_PRO)
      && /file_prevenue: filePrevenue \}\)/.test(RESIL)
      && /file_prevenue: j\.file_prevenue,/.test(BORD))
  }

  // 🔴 QUI ATTEND CE COURS : PRÉNOM ET TÉLÉPHONE (Alex, 04/10). Une séance à la
  // fois, à la demande, dans l'ordre où la file prévient.
  {
    const { fileDeLaSeance: file, cleSeance: cle, compterAttentes: compterTout } = await import('../lib/attente-rdv.js')
    const JOUR = '2026-10-04'
    const L = (id, extra) => ({ id, portee: PORTEE_SEANCE, prestation_id: 'yoga', date_rdv: '2026-10-12', heure_debut: '18:00:00', statut: STATUT_EN_ATTENTE, ...extra })
    const lignes = [
      L('c', { created_at: '2026-10-03T10:00:00Z' }),
      L('a', { created_at: '2026-10-01T10:00:00Z' }),
      L('autre-heure', { heure_debut: '19:00:00', created_at: '2026-09-30T10:00:00Z' }),
      L('autre-cours', { prestation_id: 'pilates', created_at: '2026-09-30T10:00:00Z' }),
      L('servie', { statut: STATUT_SERVI, created_at: '2026-09-29T10:00:00Z' }),
      L('b', { created_at: '2026-10-02T10:00:00Z', statut: STATUT_PREVENU }),
    ]
    egal('🔴 la liste d’une séance suit l’ordre d’inscription, celui où la file prévient',
      file(lignes, { prestationId: 'yoga', dateRdv: '2026-10-12', heure: '18:00' }, JOUR).map(l => l.id), ['a', 'b', 'c'])
    verifier('⚠️ elle compte exactement ce que le panneau annonce',
      file(lignes, { prestationId: 'yoga', dateRdv: '2026-10-12', heure: '18:00' }, JOUR).length
      === (compterTout(lignes, JOUR).seances[cle('yoga', '2026-10-12', '18:00')] || 0))
    const ROUTE = sansProse(lire('app/api/rdv/attente-commerce/route.js'))
    verifier('🔴 les personnes ne sortent que derrière la garde de la case agenda, le commerce lu sur la prestation',
      /if \(corps\?\.action === 'liste'\) \{[\s\S]{0,200}const gardeListe = await gardeLigneEquipe\(request, admin, 'rdv_prestations', corps\?\.prestation_id, 'agenda'\)\s*const nonAutorise = refus\(gardeListe, NextResponse\)\s*if \(nonAutorise\) return nonAutorise\s*const res = await personnesDeLaSeance\(/.test(ROUTE))
    const AGENDA = sansProse(lire('app/dashboard/AgendaRdv.js'))
    verifier('⚠️ l’agenda ne les charge qu’à la demande, et jamais pour une autre séance',
      /\{onListerFile && !vue\?\.personnes && \(\s*<button onClick=\{voirQui\}/.test(AGENDA)
      && /const vue = fileVue\?\.cle === cle \? fileVue : null/.test(AGENDA))
  }

  // ⚠️ POSÉ DANS LE MODULE COMMUN, PAS CHEZ LES APPELANTS. Quatre chemins
  // créent un rendez-vous : posé chez chacun, ce geste serait oublié par le
  // cinquième, et l'oubli serait muet.
  const CREATION = lire('lib/rdv-creation-server.js')
  verifier('toute création de rendez-vous ferme la place dans la file',
    /placePrise\(/.test(CREATION))

  // 🔴 LE DROIT À L'EFFACEMENT. La ligne `clients` est ANONYMISÉE, jamais
  // supprimée : un `ON DELETE CASCADE` ne se déclencherait donc jamais, et
  // l'attente survivrait au compte.
  const SUPPR = lire('app/api/yopper/supprimer-compte/route.js')
  verifier('🔴 la suppression de compte efface les attentes',
    /from\('rdv_attente'\)\s*\.delete\(\)/.test(SUPPR))

  // 🔴 UN `fetch` NU NE PROUVE AUCUNE IDENTITÉ. `identiteProuvee` lit le jeton
  // dans l'en-tête : un appel nu ferait répondre « pas connecté » à TOUT LE
  // MONDE, et le bouton n'apparaîtrait jamais chez personne.
  const BLOC = lire('app/commander/rdv/[slug]/BlocAttente.js')
  verifier('🔴 l’écran d’attente passe la preuve d’identité',
    /fetchAvecPreuveSiConnecte\('\/api\/rdv\/attente'/.test(BLOC))
  verifier('🔴 et n’emploie aucun fetch nu', !/[^a-zA-Z]fetch\('\/api\//.test(BLOC))

  // ⚠️ LA PORTÉE ET LE COMMERCE NE SE LISENT JAMAIS DANS LA REQUÊTE. Sinon une
  // requête forgée rangerait une attente chez le voisin, ou fabriquerait une
  // ligne que le déclencheur ne trouvera jamais.
  const ROUTE = lire('app/api/rdv/attente/route.js')
  verifier('🔴 la route ne lit pas la portée envoyée', !/corps\?\.portee/.test(ROUTE))
  verifier('🔴 ni le commerce envoyé', !/corps\?\.commercant_id/.test(ROUTE))

  // ⚠️ UNE SEULE LISTE DE COLONNES, ET ELLE LES PORTE TOUTES. Une colonne
  // absente ici ne lève rien : la valeur vaut `undefined`, et la règle se
  // trompe en silence.
  const SERVEUR = lire('lib/attente-rdv-server.js')
  const colonnes = /COLONNES_ATTENTE = `([\s\S]*?)`/.exec(SERVEUR)?.[1] || ''
  verifier('la liste de colonnes du module a été trouvée', colonnes.length > 50, `${colonnes.length} caractères`)
  for (const c of ['id', 'commercant_id', 'prestation_id', 'client_id', 'portee',
                   'date_rdv', 'heure_debut', 'date_debut', 'date_fin',
                   'statut', 'push_id', 'prevenu_le', 'priorite_jusqu', 'created_at']) {
    verifier(`la colonne ${c} est chargée`, new RegExp(`\\b${c}\\b`).test(colonnes))
  }

  // 🔴 SE DÉSINSCRIRE NE DOIT PAS POUVOIR SORTIR QUELQU'UN D'AUTRE. La table
  // n'a AUCUNE policy pour rattraper le coup : la garde d'autorisation est ce
  // filtre sur le propriétaire, et lui seul.
  const suppression = /export async function retirer\(([\s\S]*?)\n}/.exec(SERVEUR)?.[1] || ''
  verifier('la fonction de désinscription a été trouvée', suppression.length > 200,
    `${suppression.length} caractères`)
  verifier('🔴 on ne peut effacer que SA propre attente',
    /\.delete\(\)[\s\S]{0,80}\.in\('client_id'/.test(suppression))

  // 🔴 LES DEUX SÉLECTEURS DE JOURS DOIVENT S'ACCORDER (07/09, question
  // d'Alex). La bande des quatorze premiers jours laissait déjà entrer sur un
  // jour COMPLET ; le mini-calendrier, lui, le verrouillait comme un jour
  // FERMÉ. Au-delà de J+14, la liste d'attente était donc inatteignable, et
  // rien ne le disait : le jour s'affichait, en rouge, et ne s'ouvrait pas.
  const FICHE = lire('app/commander/rdv/[slug]/page.js')
  verifier('🔴 le mini-calendrier ouvre un jour complet',
    /onClick=\{\(\) => ouvert && onSelect\(c\.j\.date\)\} disabled=\{!ouvert\}/.test(FICHE))
  verifier('⚠️ et garde un jour fermé verrouillé : rien à y attendre',
    !/disabled=\{!ouvert \|\| nbLibres === 0\}/.test(FICHE))
  verifier('la bande de jours laisse entrer sur un jour complet',
    /disabled=\{!j\.ouvert\}/.test(FICHE))
  // ⚠️ ET LE POINT CESSE DE CONFONDRE LES DEUX. Même rouge pour « fermé » et
  // « complet », le client ne pouvait pas savoir lequel s'ouvre.
  verifier('⚠️ fermé et complet ne portent plus le même point',
    /const dotColor = !ouvert \? '#D1D5DB'/.test(FICHE))

  // ⚠️ ON NE PROMET PAS UNE PLACE GARDÉE. Le créneau reste réservable par
  // n'importe qui pendant la fenêtre de priorité : l'écrire serait promettre
  // ce que le code ne tient pas (arbitrage d'Alex, 06/09).
  for (const [nom, src] of [['le push', SERVEUR], ['l’écran', BLOC]]) {
    verifier(`⚠️ ${nom} ne promet aucune place gardée`,
      !/place (est|t’est|vous est) (gardée|réservée)/i.test(src) && !/réservée pour toi/i.test(src))
  }
  // ⚠️ REPOINTÉE LE 04/10 (D2) : « Tu es prévenu » supposait un homme.
  verifier('⚠️ le push dit qu’on est prévenu avant les autres',
    /Tu reçois l’alerte avant les autres/.test(SERVEUR))
}

// ─── LA FILE, EXÉCUTÉE SUR UNE FAUSSE BASE (LA-01 et LA-05, 03/10) ─────────
//
// 🔴 DEUX DÉFAUTS QU'AUCUNE LECTURE DE CODE N'AVAIT VUS :
//   • LA-01 : la personne servie par un abonnement, un acompte ou une empreinte
//     restait dans la file, faute de `client_id` ; elle reprenait une place au
//     rang suivant et recevait un push pour son propre cours ;
//   • LA-05 : l'inscription ne relisait pas la séance. On attendait un cours
//     qui n'a pas lieu, un cours où il reste de la place, ou sa propre place.
//
// ⚠️ LES DATES SE CALCULENT DEPUIS AUJOURD'HUI, jamais en dur : un banc daté
// rougit le jour où sa date passe, sans que rien n'ait changé.
{
  const S = await import('../lib/attente-rdv-server.js')
  const { jourBruxelles, brusselsInstant } = await import('../lib/timezone.js')
  const { jourSemaineDate } = await import('../lib/rdv-slots.js')
  const { jourPlus: plus } = await import('../lib/attente-rdv.js')

  const norme = (x) => (/^\d{2}:\d{2}(:\d{2})?$/.test(String(x)) ? String(x).slice(0, 5) : x)
  const fauxDb = (tables) => ({
    from(table) {
      const filtres = []
      let maj = null, ajout = null, unique = false, effacer = false
      const b = {
        select() { return b }, order() { return b }, limit() { return b },
        eq(c, x) { filtres.push(l => String(norme(l[c])) === String(norme(x))); return b },
        neq(c, x) { filtres.push(l => String(norme(l[c])) !== String(norme(x))); return b },
        // LA-08 : la purge des fenêtres expirées.
        lt(c, x) { filtres.push(l => l[c] != null && String(l[c]) < String(x)); return b },
        delete() { effacer = true; return b },
        in(c, xs) { filtres.push(l => xs.map(String).includes(String(l[c]))); return b },
        is(c, x) { filtres.push(l => (l[c] ?? null) === x); return b },
        update(m) { maj = m; return b },
        insert(r) { ajout = Array.isArray(r) ? r : [r]; return b },
        maybeSingle() { unique = true; return b },
        single() { unique = true; return b },
        then(ok, ko) {
          const lignes = tables[table] || (tables[table] = [])
          let rep
          // ⚠️ L'INDEX D'UNICITÉ DE LA VRAIE BASE (rdv_attente_unique_fenetre) :
          // une fenêtre par personne et par prestation tant qu'elle n'est pas
          // servie, EXPIRÉE COMPRISE. Sans lui, ce banc ne verrait pas LA-08.
          const doublonFenetre = table === 'rdv_attente' && ajout && ajout.some(x => x.portee === 'fenetre'
            && lignes.some(l => l.portee === 'fenetre' && l.statut !== 'servi' && l.client_id === x.client_id && l.prestation_id === x.prestation_id))
          if (effacer) {
            const garder = lignes.filter(r => !filtres.every(f => f(r)))
            const n = lignes.length - garder.length
            lignes.splice(0, lignes.length, ...garder)
            rep = { data: null, error: null, count: n }
          } else if (doublonFenetre) {
            rep = { data: null, error: { code: '23505', message: 'rdv_attente_unique_fenetre' } }
          } else if (ajout) {
            const neuves = ajout.map((x, i) => ({ id: `${table}-${lignes.length + i + 1}`, created_at: new Date().toISOString(), ...x }))
            lignes.push(...neuves)
            rep = { data: unique ? neuves[0] : neuves, error: null }
          } else if (maj) {
            const l = lignes.filter(r => filtres.every(f => f(r)))
            l.forEach(r => Object.assign(r, maj))
            rep = { data: l, error: null }
          } else {
            const l = lignes.filter(r => filtres.every(f => f(r))).map(r => ({ ...r }))
            rep = { data: unique ? (l[0] || null) : l, error: null }
          }
          return Promise.resolve(rep).then(ok, ko)
        },
      }
      return b
    },
  })

  const D = plus(jourBruxelles(), 7)
  const JOUR = jourSemaineDate(new Date(`${D}T12:00:00`))
  const inscrite = (id, extra = {}) => ({ id, commercant_id: 'c1', prestation_id: 'yoga', date_rdv: D, heure_debut: '18:00:00',
    statut: 'confirme', deleted_at: null, place_no: Number(id.slice(-1)), client_id: null, client_email: null, ...extra })
  const base = ({ inscrits = [inscrite('r1'), inscrite('r2')], horizon = null } = {}) => ({
    commercants: [{ id: 'c1', nom: 'Centre', statut_publication: 'publie', rdv_horizon_jours: horizon, adresse: 'Rue 1', siege_social_est_lieu_activite: true }],
    rdv_prestations: [{ id: 'yoga', commercant_id: 'c1', nom: 'Yoga', capacite: 2, attente_max: 5, actif: true, deleted_at: null,
      par_couverts: false, duree_minutes: 60, tva_taux: 6 }],
    rdv_creneaux: [{ id: 'cr-yoga', commercant_id: 'c1', jour_semaine: JOUR, date_specifique: null, heure_debut: '18:00:00', heure_fin: '19:00:00',
      pause_debut: null, pause_fin: null, actif: true, deleted_at: null, praticien_id: null, lieu_id: null }],
    rdv_creneau_prestations: [{ creneau_id: 'cr-yoga', prestation_id: 'yoga' }],
    rdv_fermetures: [], commercant_lieux: [], rdv_attente: [],
    clients: [{ id: 'cl-sophie', email: 'sophie@exemple.be' }, { id: 'cl-marc', email: 'marc@exemple.be' }],
    rdv_reservations: inscrits,
  })
  const SOPHIE = { prestationId: 'yoga', clientId: 'cl-sophie', email: 'sophie@exemple.be', dateRdv: D, heureDebut: '18:00' }

  // ── 04/10 : UNE FERMETURE VIDE LES FILES QU'ELLE REND SANS OBJET ─────────
  // 🔴 Un cours annulé gardait sa liste d'attente jusqu'à la date, et une
  // notification « place libérée » déjà programmée partait quand même.
  {
    const { attentesFermeesPar } = await import('../lib/attente-rdv.js')
    const L = (id, extra = {}) => ({ id, commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-sophie', portee: 'seance',
      date_rdv: D, heure_debut: '18:00:00', statut: 'en_attente', push_id: null, created_at: '2026-10-01T10:00:00Z', ...extra })
    const lignes = [
      L('a1'),
      L('a2', { heure_debut: '19:00:00' }),
      L('a3', { prestation_id: 'pilates' }),
      // ⚠️ AVEC une date de séance : le harnais l'a dit, sans elle la ligne
      // n'était jamais visée et la garde de portée ne mesurait rien.
      L('a4', { portee: 'fenetre', date_rdv: D, heure_debut: '18:00:00', date_debut: D, date_fin: D }),
      L('a5', { statut: 'servi' }),
      L('a6', { date_rdv: plus(D, 1) }),
    ]
    const ids = (r) => r.map(l => l.id).sort().join(',')
    const coursAnnule = { commercant_id: 'c1', praticien_id: null, date_debut: D, date_fin: D, prestation_id: 'yoga', heure_debut: '18:00' }
    verifier('🔴 un cours annulé vide la file de CETTE séance seulement', ids(attentesFermeesPar(lignes, coursAnnule)) === 'a1',
      ids(attentesFermeesPar(lignes, coursAnnule)))
    const jourFerme = { commercant_id: 'c1', praticien_id: null, date_debut: D, date_fin: D, prestation_id: null, heure_debut: null }
    verifier('🔴 un jour fermé vide toutes les séances de ce jour', ids(attentesFermeesPar(lignes, jourFerme)) === 'a1,a2,a3',
      ids(attentesFermeesPar(lignes, jourFerme)))
    verifier('une attente « fenêtre » survit à un jour fermé', !attentesFermeesPar(lignes, jourFerme).some(l => l.id === 'a4'))
    verifier('une personne déjà servie n’est pas touchée', !attentesFermeesPar(lignes, jourFerme).some(l => l.id === 'a5'))
    verifier('⚠️ l’absence d’une praticienne ne ferme aucune file',
      attentesFermeesPar(lignes, { ...jourFerme, praticien_id: 'emily' }).length === 0)
    verifier('une fermeture supprimée ne ferme rien', attentesFermeesPar(lignes, { ...jourFerme, deleted_at: '2026-10-04' }).length === 0)
    verifier('une période couvre ses deux bornes',
      ids(attentesFermeesPar(lignes, { ...jourFerme, date_fin: plus(D, 1) })) === 'a1,a2,a3,a6')

    // Exécuté sur la fausse base : les lignes visées disparaissent, les autres restent.
    // ⚠️ L'AUTRE COMMERCE D'ABORD, sur une file intacte : le harnais l'a dit,
    // passé après, il ne trouvait plus rien à prendre et restait vert.
    const t = base()
    t.rdv_attente = lignes.map(l => ({ ...l }))
    const autreCommerce = await S.fermerLesFiles(fauxDb(t), { ...coursAnnule, commercant_id: 'c2' }, { prevenir: false })
    verifier('🔴 la fermeture d’un autre commerce ne touche à rien', autreCommerce.ok && autreCommerce.retires === 0 && t.rdv_attente.length === lignes.length,
      JSON.stringify(autreCommerce))
    const r = await S.fermerLesFiles(fauxDb(t), coursAnnule, { prevenir: false })
    verifier('🔴 fermerLesFiles retire la ligne de la séance annulée', r.ok && r.retires === 1 && !t.rdv_attente.some(l => l.id === 'a1'),
      JSON.stringify(r))
    verifier('et laisse les autres en place', t.rdv_attente.length === lignes.length - 1)
  }

  // ── AUDIT 1 I7 (04/10) : DES PLACES AJOUTÉES PRÉVIENNENT LA FILE ─────────
  {
    const t = base()
    const L = (id, extra = {}) => ({ id, commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-sophie', portee: 'seance',
      date_rdv: D, heure_debut: '18:00:00', statut: 'en_attente', push_id: null, created_at: '2026-10-01T10:00:00Z', ...extra })
    t.rdv_attente = [
      L('b1'), L('b2', { client_id: 'cl-marc' }),                       // la même séance, deux personnes
      L('b3', { date_rdv: plus(jourBruxelles(), -2) }),                 // une séance passée
      L('b4', { portee: 'fenetre', date_rdv: null, heure_debut: null }), // pas une séance
    ]
    const r = await S.prevenirLesSeancesDuCours(fauxDb(t), 'yoga')
    verifier('🔴 une seule séance à venir est visée, comptée une fois', r.ok && r.seances === 1, JSON.stringify(r))
    const vide = await S.prevenirLesSeancesDuCours(fauxDb(t), null)
    verifier('sans cours, rien', !vide.ok && vide.seances === 0)
    const ROUTE = sansProse(readFileSync(new URL('../app/api/rdv/attente-commerce/route.js', import.meta.url), 'utf8'))
    verifier('🔴 l’action « prevenir-cours » est gardée par le cours',
      /if \(corps\?\.action === 'prevenir-cours'\) \{\s*const gardeCours = await gardeLigneEquipe\(request, admin, 'rdv_prestations', corps\?\.prestation_id, 'agenda'\)/.test(ROUTE)
      && /refus\(gardeCours, NextResponse\)/.test(ROUTE))
  }

  // ── LA-05 : la séance est relue ──────────────────────────────────────
  {
    const t = base()
    const r = await S.inscrire(fauxDb(t), SOPHIE)
    verifier('🔴 un cours complet s’attend : l’inscription passe', r.ok === true && t.rdv_attente.length === 1, JSON.stringify(r))
  }
  {
    const t = base({ inscrits: [inscrite('r1')] })
    const r = await S.inscrire(fauxDb(t), SOPHIE)
    verifier('🔴 un cours où il reste de la place ne s’attend pas : on le réserve',
      r.ok === false && r.error === 'places_libres' && t.rdv_attente.length === 0, JSON.stringify(r))
  }
  {
    const t = base()
    const r = await S.inscrire(fauxDb(t), { ...SOPHIE, heureDebut: '13:00' })
    verifier('🔴 un cours qui n’a pas lieu à cette heure ne s’attend pas',
      r.ok === false && r.error === 'seance_introuvable' && t.rdv_attente.length === 0, JSON.stringify(r))
  }
  {
    // ⚠️ SA PLACE A ÉTÉ PRISE SUR SON ABONNEMENT : pas de `client_id`, seulement
    // son adresse, écrite autrement.
    const t = base({ inscrits: [inscrite('r1', { client_email: 'Sophie@Exemple.be' }), inscrite('r2')] })
    const r = await S.inscrire(fauxDb(t), SOPHIE)
    verifier('🔴 on n’attend pas sa propre place, même prise sur un abonnement',
      r.ok === false && r.error === 'deja_reserve' && t.rdv_attente.length === 0, JSON.stringify(r))
  }
  {
    const t = base({ horizon: 30 })
    const loin = plus(jourBruxelles(), 45)
    const r = await S.inscrire(fauxDb(t), { ...SOPHIE, dateRdv: loin })
    verifier('⚠️ au-delà de l’horizon de la fiche, la séance ne s’attend pas encore',
      r.ok === false && r.error === 'demande_invalide', JSON.stringify(r))
  }
  {
    const apres = brusselsInstant(D, '18:05').getTime()
    const v = await S.seanceAttendable(fauxDb(base()), {
      prestation: base().rdv_prestations[0], commerce: base().commercants[0],
      ligne: { date_rdv: D, heure_debut: '18:00' }, clientId: 'cl-sophie', maintenant: apres,
    })
    verifier('🔴 une séance commencée ne s’attend plus', v.ok === false && v.raison === 'seance_passee', JSON.stringify(v))
  }

  // ── LA-01 : la personne servie sort de la file, par tous les chemins ──
  {
    const t = base()
    t.rdv_attente.push(
      { id: 'a1', commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-sophie', portee: 'seance', date_rdv: D, heure_debut: '18:00:00', statut: 'prevenu', push_id: null, created_at: '2026-10-01T10:00:00Z' },
      { id: 'a2', commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-marc', portee: 'seance', date_rdv: D, heure_debut: '18:00:00', statut: 'prevenu', push_id: null, created_at: '2026-10-01T11:00:00Z' },
    )
    // Sa séance arrive par l'abonnement, sans `client_id`, l'adresse écrite autrement.
    const r = await S.placePrise(fauxDb(t), { prestationId: 'yoga', dateRdv: D, heureDebut: '18:00', clientId: null, clientEmail: ' Sophie@Exemple.be' })
    const a1 = t.rdv_attente.find(l => l.id === 'a1'), a2 = t.rdv_attente.find(l => l.id === 'a2')
    verifier('🔴 la personne servie par un abonnement sort de la file', r.ok === true && r.servis === 1 && a1.statut === 'servi', JSON.stringify({ r, a1: a1.statut }))
    verifier('⚠️ et l’autre reste en file, sans notification en attente', a2.statut === 'en_attente' && a2.push_id === null, a2.statut)
  }
  {
    const CREATION_SRC = sansProse(readFileSync(new URL('../lib/rdv-creation-server.js', import.meta.url), 'utf8'))
    verifier('🔴 la création passe l’adresse à la file',
      /clientId: champs\?\.client_id \|\| null,\s+clientEmail: champs\?\.client_email \|\| null,/.test(CREATION_SRC))
    const ROUTE_SRC = sansProse(readFileSync(new URL('../app/api/rdv/attente/route.js', import.meta.url), 'utf8'))
    verifier('et la route d’inscription passe l’adresse prouvée', /email: identite\.email \|\| null,/.test(ROUTE_SRC))
  }

  // ── LA-08 : une fenêtre expirée ne verrouille plus à vie ─────────────
  // ── LA-10 : une table n'a pas de liste d'attente ───────────────────────
  {
    const AUJ = jourBruxelles()
    const REIKI = { id: 'reiki', commercant_id: 'c1', nom: 'Reiki', capacite: 1, attente_max: 3, actif: true, deleted_at: null, par_couverts: false, duree_minutes: 60, tva_taux: 21 }
    const TABLE = { id: 'table4', commercant_id: 'c1', nom: 'Table de 4', capacite: 4, attente_max: 3, actif: true, deleted_at: null, par_couverts: true, duree_minutes: 90, tva_taux: 12 }
    const fenetre = (id, client, debut, fin, extra = {}) => ({ id, commercant_id: 'c1', prestation_id: 'reiki', client_id: client, portee: 'fenetre',
      date_rdv: null, heure_debut: null, date_debut: debut, date_fin: fin, statut: 'en_attente', push_id: null, created_at: '2026-09-01T10:00:00Z', ...extra })
    const avec = (attentes) => { const t = base(); t.rdv_prestations.push(REIKI, TABLE); t.rdv_attente.push(...attentes); return t }
    const SOPHIE_REIKI = { prestationId: 'reiki', clientId: 'cl-sophie', email: 'sophie@exemple.be', duree: 'semaine' }

    {
      const t = avec([fenetre('vieille', 'cl-sophie', plus(AUJ, -10), plus(AUJ, -3)), fenetre('marc', 'cl-marc', plus(AUJ, -10), plus(AUJ, -3))])
      const r = await S.inscrire(fauxDb(t), SOPHIE_REIKI)
      const siennes = t.rdv_attente.filter(l => l.client_id === 'cl-sophie')
      verifier('🔴 une fenêtre expirée ne verrouille plus : la réinscription passe',
        r.ok === true && siennes.length === 1 && siennes[0].date_debut === AUJ && siennes[0].id !== 'vieille', JSON.stringify({ r, siennes }))
      verifier('⚠️ et seule SA fenêtre expirée s’efface, pas celle d’une autre personne',
        t.rdv_attente.some(l => l.id === 'marc'))
    }
    {
      const t = avec([fenetre('vivante', 'cl-sophie', AUJ, plus(AUJ, 5))])
      const r = await S.inscrire(fauxDb(t), SOPHIE_REIKI)
      verifier('⚠️ une fenêtre encore ouverte reste « déjà inscrit », et ne s’efface pas',
        r.ok === false && r.error === 'deja_inscrit' && t.rdv_attente.some(l => l.id === 'vivante'), JSON.stringify(r))
    }
    verifier('une attente expirée ne compte plus comme « déjà inscrit »',
      !dejaDansLaFile([fenetre('x', 'y1', '2026-09-01', '2026-09-08')], { prestation_id: 'reiki', portee: 'fenetre' }, 'y1', '2026-10-03')
      && dejaDansLaFile([fenetre('x', 'y1', '2026-09-01', '2026-10-08')], { prestation_id: 'reiki', portee: 'fenetre' }, 'y1', '2026-10-03'))

    {
      const t = avec([])
      const r = await S.inscrire(fauxDb(t), { prestationId: 'table4', clientId: 'cl-sophie', email: 'sophie@exemple.be', duree: 'semaine' })
      verifier('🔴 une table n’a pas de liste d’attente : refus clair, rien d’écrit',
        r.ok === false && r.error === 'fermee' && t.rdv_attente.length === 0, JSON.stringify(r))
    }
    verifier('🔴 et la règle partagée la dit fermée, même réglée à 3',
      attenteOuverte({ par_couverts: true, attente_max: 3 }) === false && attenteOuverte({ par_couverts: false, attente_max: 3 }) === true)
  }

  // ── I12 : la file côté commerçante ; LA-03 : pas de chaîne en double ──
  // ⚠️ AUCUN PUSH RÉEL PENDANT UN BANC : sans clé, l'envoi s'arrête avant le
  // réseau. On s'en assure plutôt que de le supposer.
  delete process.env.ONESIGNAL_REST_API_KEY
  delete process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID

  // ── « VOIR QUI ATTEND », EXÉCUTÉ (Alex, 04/10) ────────────────────────
  // Le test 4 ne se jouait pas sur le site d'essai (les notifications n'y
  // s'activent pas, donc personne ne peut s'inscrire) : le banc rejoue le cas
  // à travers le vrai code serveur, sur une fausse base.
  {
    const JOUR_C = plus(jourBruxelles(), 8)
    const t = {
      rdv_attente: [
        { id: 'w2', commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-b', portee: 'seance', date_rdv: JOUR_C, heure_debut: '18:15:00', statut: 'prevenu', created_at: '2026-10-02T09:00:00Z' },
        { id: 'w1', commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-a', portee: 'seance', date_rdv: JOUR_C, heure_debut: '18:15:00', statut: 'en_attente', created_at: '2026-10-01T09:00:00Z' },
        { id: 'w3', commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-c', portee: 'seance', date_rdv: JOUR_C, heure_debut: '19:30:00', statut: 'en_attente', created_at: '2026-10-01T08:00:00Z' },
        { id: 'w4', commercant_id: 'c1', prestation_id: 'yoga', client_id: 'cl-d', portee: 'seance', date_rdv: JOUR_C, heure_debut: '18:15:00', statut: 'servi', created_at: '2026-09-30T08:00:00Z' },
      ],
      clients: [
        { id: 'cl-a', prenom: 'Léa', telephone: '0470 11 22 33', email: 'lea@exemple.be', nom: 'Martin' },
        { id: 'cl-b', prenom: 'Tom', telephone: null, email: 'tom@exemple.be', nom: 'Dupont' },
      ],
    }
    const r = await S.personnesDeLaSeance(fauxDb(t), { prestationId: 'yoga', dateRdv: JOUR_C, heureDebut: '18:15' })
    egal('🔴 la commerçante voit qui attend, dans l’ordre, avec prénom et téléphone, et rien d’autre', r, {
      ok: true,
      personnes: [
        { rang: 1, prenom: 'Léa', telephone: '0470 11 22 33', prevenu: false },
        { rang: 2, prenom: 'Tom', telephone: null, prevenu: true },
      ],
    })
    const vide = await S.personnesDeLaSeance(fauxDb(t), { prestationId: 'yoga', dateRdv: JOUR_C, heureDebut: '17:00' })
    egal('⚠️ une séance sans file rend une liste vide, pas une erreur', vide, { ok: true, personnes: [] })
    verifier('⚠️ une demande incomplète est refusée',
      (await S.personnesDeLaSeance(fauxDb(t), { prestationId: 'yoga', dateRdv: JOUR_C, heureDebut: '18' })).error === 'demande_invalide')
  }
  {
    const A = await import('../lib/attente-rdv.js')
    const DEMAIN = plus(jourBruxelles(), 1)
    const ligne = (id, extra) => ({ id, commercant_id: 'c1', prestation_id: 'yoga', client_id: `cl-${id}`, portee: 'seance', date_rdv: D, heure_debut: '18:00:00', statut: 'en_attente', push_id: null, created_at: `2026-10-01T1${id.length}:00:00Z`, ...extra })
    const comptes = A.compterAttentes([
      ligne('a'), ligne('b'),
      ligne('c', { statut: 'servi' }),
      ligne('d', { date_rdv: plus(jourBruxelles(), -2) }),
      { id: 'f', prestation_id: 'reiki', portee: 'fenetre', date_debut: jourBruxelles(), date_fin: DEMAIN, statut: 'en_attente' },
    ], jourBruxelles())
    verifier('🔴 la commerçante voit combien attendent chaque séance, vivants seulement',
      comptes.seances[A.cleSeance('yoga', D, '18:00')] === 2 && comptes.fenetres.reiki === 1, JSON.stringify(comptes))
    verifier('⚠️ « 18:00:00 » et « 18:00 » désignent la même séance', A.cleSeance('yoga', D, '18:00:00') === A.cleSeance('yoga', D, '18:00'))
    const maintenant = Date.now()
    verifier('🔴 une personne prévenue dont la priorité court n’est pas reprévenue',
      A.dejaPrevenueEnCours({ statut: 'prevenu', priorite_jusqu: new Date(maintenant + 600000).toISOString() }, maintenant)
      && !A.dejaPrevenueEnCours({ statut: 'prevenu', priorite_jusqu: new Date(maintenant - 600000).toISOString() }, maintenant)
      && !A.dejaPrevenueEnCours({ statut: 'en_attente', priorite_jusqu: new Date(maintenant + 600000).toISOString() }, maintenant))

    // LA-03, exécuté : une chaîne en cours ne repart pas de zéro.
    {
      const t = base()
      // La fausse base ne résout pas les jointures : le commerce publié voyage dans la ligne.
      t.rdv_prestations[0].commercant = { nom: 'Centre', slug: 'centre', statut_publication: 'publie' }
      t.rdv_attente.push(
        ligne('a', { statut: 'prevenu', priorite_jusqu: new Date(maintenant + 600000).toISOString() }),
        ligne('bb'),
      )
      const r = await S.prevenirLaFile(fauxDb(t), { prestationId: 'yoga', dateRdv: D, heureDebut: '18:00' })
      verifier('🔴 un second déclenchement ne reprévient pas celle qui vient de l’être',
        r.ok === true && r.file === 1, JSON.stringify(r))
    }

    // LA-07, exécuté : ni un cours retiré, ni un jour fermé.
    {
      const publie = { nom: 'Centre', slug: 'centre', statut_publication: 'publie' }
      const t = base()
      t.rdv_prestations[0] = { ...t.rdv_prestations[0], actif: false, commercant: publie }
      t.rdv_attente.push(ligne('a'))
      const r = await S.prevenirLaFile(fauxDb(t), { prestationId: 'yoga', dateRdv: D, heureDebut: '18:00' })
      verifier('🔴 un cours retiré ne fait prévenir personne', r.ok === true && r.file === 0 && r.raison === 'prestation_retiree', JSON.stringify(r))
    }
    {
      const publie = { nom: 'Centre', slug: 'centre', statut_publication: 'publie' }
      const t = base()
      t.rdv_prestations[0].commercant = publie
      t.rdv_fermetures.push({ commercant_id: 'c1', date_debut: D, date_fin: D, praticien_id: null, deleted_at: null })
      t.rdv_attente.push(ligne('a'))
      const r = await S.prevenirLaFile(fauxDb(t), { prestationId: 'yoga', dateRdv: D, heureDebut: '18:00' })
      verifier('🔴 un jour fermé ne fait prévenir personne', r.ok === true && r.file === 0 && r.raison === 'jour_ferme', JSON.stringify(r))
    }

    // Le bouton de la commerçante, exécuté.
    {
      const r = await S.prevenirSurDemande(fauxDb(base()), { prestationId: 'yoga', dateRdv: D, heureDebut: '18:00' })
      verifier('🔴 le bouton refuse sur un cours encore complet', r.ok === false && r.error === 'complet', JSON.stringify(r))
    }
    {
      const t = base({ inscrits: [inscrite('r1')] })
      // La fausse base ne résout pas les jointures : le commerce publié voyage dans la ligne.
      t.rdv_prestations[0].commercant = { nom: 'Centre', slug: 'centre', statut_publication: 'publie' }
      t.rdv_attente.push(ligne('a'), ligne('bb'))
      const r = await S.prevenirSurDemande(fauxDb(t), { prestationId: 'yoga', dateRdv: D, heureDebut: '18:00' })
      verifier('🔴 une place libre : la file est prévenue', r.ok === true && r.file === 2, JSON.stringify(r))
    }
    {
      const apres = brusselsInstant(D, '18:05').getTime()
      const t = base({ inscrits: [inscrite('r1')] })
      const r = await S.prevenirSurDemande(fauxDb(t), { prestationId: 'yoga', dateRdv: D, heureDebut: '18:00', maintenant: apres })
      verifier('⚠️ un cours commencé ne se prévient plus', r.ok === false && r.error === 'seance_passee', JSON.stringify(r))
    }
    {
      const t = base()
      t.rdv_prestations.push({ id: 'reiki', commercant_id: 'c1', nom: 'Reiki', capacite: 1, attente_max: 3, actif: true, deleted_at: null, par_couverts: false })
      const r = await S.prevenirSurDemande(fauxDb(t), { prestationId: 'reiki', dateRdv: D, heureDebut: '18:00' })
      verifier('⚠️ seul un cours collectif se prévient d’un bouton', r.ok === false && r.error === 'pas_un_cours', JSON.stringify(r))
    }
    {
      const t = base()
      t.rdv_attente.push(ligne('a'), ligne('bb', { statut: 'servi' }))
      const c = await S.attentesDuCommerce(fauxDb(t), 'c1')
      verifier('la route compte la file du commerce, servis exclus', c?.seances?.[A.cleSeance('yoga', D, '18:00')] === 1, JSON.stringify(c))
    }

    // ── Les écrans et la route ──
    const SRV = sansProse(readFileSync(new URL('../lib/attente-rdv-server.js', import.meta.url), 'utf8'))
    verifier('🔴 aucun nom ni contact ne sort pour la commerçante',
      /\.select\('prestation_id, portee, date_rdv, heure_debut, date_debut, date_fin, statut'\)/.test(SRV))
    const ROUTE_C = sansProse(readFileSync(new URL('../app/api/rdv/attente-commerce/route.js', import.meta.url), 'utf8'))
    // ⚠️ REPOINTÉES LE 04/10 SUR LEUR BLOC : depuis l'action `liste`, la même
    // garde existe deux fois dans la route. Chercher la ligne n'importe où
    // trouvait le JUMEAU, et la mutation de `prévenir` passait (vu au harnais).
    verifier('🔴 compter passe par la garde du commerce, case Agenda',
      /if \(corps\?\.action === 'compter'\) \{\s*const garde = await gardeEquipe\(request, admin, corps\?\.commercant_id, 'agenda'\)/.test(ROUTE_C))
    verifier('🔴 prévenir lit le commerce DANS la prestation, jamais dans le corps',
      /if \(corps\?\.action === 'prevenir'\) \{[\s\S]{0,300}?const garde = await gardeLigneEquipe\(request, admin, 'rdv_prestations', corps\?\.prestation_id, 'agenda'\)\s*const nonAutorise = refus\(garde, NextResponse\)/.test(ROUTE_C))
    const AG = sansProse(readFileSync(new URL('../app/dashboard/AgendaRdv.js', import.meta.url), 'utf8'))
    verifier('🔴 le panneau d’un cours dit combien attendent, et propose de prévenir seulement s’il reste une place',
      /attentes\.seances\?\.\[cleSeance\(prestationId, isoDate\(seanceOuverte\.jourDate\), seanceOuverte\.heure_debut\)\]/.test(AG)
      && /\{onPrevenirFile && avenir && libres > 0 && \(/.test(AG))
    const BD = sansProse(readFileSync(new URL('../app/dashboard/page.js', import.meta.url), 'utf8'))
    verifier('🔴 le tableau de bord charge la file et branche le bouton',
      /postPro\('\/api\/rdv\/attente-commerce', \{ action: 'compter', commercant_id: id \}\)/.test(BD)
      && /attentes=\{attentesRdv\}/.test(BD) && /onPrevenirFile=\{prevenirFileSeance\}/.test(BD)
      && /postPro\('\/api\/rdv\/attente-commerce', \{ action: 'prevenir', prestation_id: prestationId, date_rdv: date, heure_debut: heure \}\)/.test(BD))
  }
}

// ─── LA SÉANCE ATTENDUE RESTE CELLE QUI A ÉTÉ CLIQUÉE (LA-04, 03/10) ────────
//
// 🔴 SEULE L'HEURE ÉTAIT RETENUE, et rien ne l'effaçait au changement de jour
// ou de prestation : « Cette séance est complète » restait sous un mercredi
// libre, et l'inscription partait sur le mauvais cours.
{
  const FICHE = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 l’attente retient son jour et sa prestation',
    /setAttenteVisee\(enAttente \? null : \{ heure, date: isoDate\(dateChoisie\), prestationId: prestationChoisie\.id \}\)/.test(FICHE))
  verifier('🔴 et ne vaut que sur ce jour et cette prestation',
    /attenteVisee\.date === isoDate\(dateChoisie\) && attenteVisee\.prestationId === prestationChoisie\.id/.test(FICHE))
  verifier('⚠️ le bloc ne s’ouvre que sous une séance réellement complète',
    /&& slots\.some\(s => s\.heure === heureAttente && s\.pris && s\.motif === 'complet'\) && \(/.test(FICHE))

  // 🔴 LE RÉGLAGE QUI N'EXISTAIT PAS (03/10) : trois places d'attente sur chaque
  // prestation, qu'aucun écran ne montrait ni ne permettait de fermer.
  const CONFIG = sansProse(readFileSync(new URL('../app/dashboard/ConfigDashboard.js', import.meta.url), 'utf8'))
  verifier('🔴 la commerçante règle la taille de sa liste d’attente',
    /value=\{form\.attente_max\}/.test(CONFIG)
    && /attente_max: Math\.max\(0, Math\.min\(50, parseInt\(form\.attente_max, 10\) \|\| 0\)\)/.test(CONFIG))
  verifier('⚠️ et retrouve la sienne en rouvrant la prestation',
    /attente_max: String\(Number\.isFinite\(Number\(p\.attente_max\)\) \? Number\(p\.attente_max\) : 3\)/.test(CONFIG))
}

// ─── LA LISTE D'ATTENTE QU'ON TROUVE (Alex, 03/10) ─────────────────────────
//
// 🔴 « SI TU NE SAIS PAS QUE TU DOIS CLIQUER, TU N'Y ARRIVES JAMAIS. » Une
// séance complète ressemblait à une séance fermée, la fenêtre ne disait pas
// LISTE D'ATTENTE, et une fois inscrit, le Yopper n'en voyait plus trace nulle
// part. Le bloc affirmait en plus que le commerçant verrait son prénom et son
// numéro, ce qu'aucun écran ne fait.
{
  // ── Ce qui s'exécute ───────────────────────────────────────────────────
  verifier('🔴 chaque durée dit la fenêtre qu’elle surveille vraiment',
    DUREES_FENETRE.every(d => d.libelle === `Les ${d.jours} prochains jours`),
    DUREES_FENETRE.map(d => d.libelle).join(' / '))

  const LIGNES = [
    { id: 'a1', prestation_id: 'yoga', portee: PORTEE_SEANCE, date_rdv: '2026-10-05', heure_debut: '09:00:00' },
    { id: 'a2', prestation_id: 'reiki', portee: PORTEE_FENETRE, date_rdv: null, heure_debut: null, date_debut: '2026-10-03', date_fin: '2026-10-10' },
  ]
  egal('🔴 la règle partagée reconnaît la séance où il attend',
    attenteSur(LIGNES, { prestationId: 'yoga', date: '2026-10-05', heure: '09:00' })?.id, 'a1')
  verifier('🔴 mais pas la même heure un autre jour',
    attenteSur(LIGNES, { prestationId: 'yoga', date: '2026-10-12', heure: '09:00' }) === null)
  verifier('ni une autre heure le même jour',
    attenteSur(LIGNES, { prestationId: 'yoga', date: '2026-10-05', heure: '10:00' }) === null)
  verifier('ni la même séance d’une autre prestation',
    attenteSur(LIGNES, { prestationId: 'pilates', date: '2026-10-05', heure: '09:00' }) === null)
  egal('en solo, la fenêtre se reconnaît à sa prestation',
    attenteSur(LIGNES, { prestationId: 'reiki', date: '2026-10-08' })?.id, 'a2')
  verifier('⚠️ une fenêtre ne passe pas pour une séance',
    attenteSur(LIGNES, { prestationId: 'reiki', date: '2026-10-08', heure: '09:00' }) === null)
  verifier('rien à reconnaître sans prestation',
    attenteSur(LIGNES, {}) === null && attenteSur(null, { prestationId: 'yoga' }) === null)

  // ⚠️ AUCUNE DATE RELATIVE À AUJOURD'HUI ICI : 2099 porte toujours son année,
  // et l'année en cours se calcule.
  egal('🔴 la séance attendue se lit en clair', seanceLisible('2099-01-05', '09:00:00'), 'lundi 5 janvier 2099 à 09:00')
  const anneeIci = new Date().getFullYear()
  const jourIci = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][new Date(Date.UTC(anneeIci, 8, 10)).getUTCDay()]
  egal('cette année, sans l’année', seanceLisible(`${anneeIci}-09-10`, '18:00'), `${jourIci} 10 septembre à 18:00`)
  egal('une date invalide ne se lit pas', seanceLisible('10/09/2026', '18:00'), '')

  // ── Le bloc ────────────────────────────────────────────────────────────
  const BLOC = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/BlocAttente.js', import.meta.url), 'utf8'))
  // ⚠️ REPOINTÉE LE 04/10 : la phrase « visibles par le commerçant » était
  // fausse le 03/10, aucun écran ne montrait la file. Depuis la décision d'Alex
  // (prénom et téléphone), la commerçante les voit : la promesse doit le dire,
  // et le serveur ne doit rien donner de plus que ce qu'elle annonce.
  verifier('🔴 la phrase d’avant a disparu (« le commerçant pour te prévenir » : c’est la notification qui prévient)',
    !/visibles? par le commerçant/.test(BLOC))
  verifier('🔴 la promesse tenue est dite avant et après l’inscription',
    /const PROMESSE = 'On te prévient par notification\. Le commerce voit ton prénom et ton téléphone\. La place n’est pas gardée : la première personne qui réserve la prend\.'/.test(BLOC)
    && (BLOC.match(/<p style=\{note\}>\{PROMESSE\}<\/p>/g) || []).length === 2)
  verifier('🔴 et le serveur ne donne au commerce rien de plus que ce qu’elle annonce',
    /\.from\('clients'\)\s*\.select\('id, prenom, telephone'\)/.test(sansProse(readFileSync(new URL('../lib/attente-rdv-server.js', import.meta.url), 'utf8'))))
  verifier('🔴 la fenêtre dit LISTE D’ATTENTE dans ses trois états',
    /<span>Liste d’attente\{quoi \? ` · \$\{quoi\}` : ''\}<\/span>/.test(BLOC)
    && (BLOC.match(/\{surtitre\}/g) || []).length === 3)
  verifier('et nomme ce qu’on attend',
    /const quoi = surSeance \? seanceLisible\(date, heure\) : \(prestation\?\.nom \|\| ''\)/.test(BLOC))
  verifier('🔴 le bloc juge avec la règle partagée',
    /setDeja\(attenteSur\(j\?\.attentes, \{ prestationId, date, heure \}\)\)/.test(BLOC)
    && /const prestationId = prestation\?\.id \|\| null/.test(BLOC))
  // 🔴 LA FILE NE PRÉVIENT QUE PAR NOTIFICATION : l'inscription les EXIGE
  // (Alex, 04/10). ⚠️ REPOINTÉE : le 03/10 elle les demandait APRÈS
  // l'inscription, et un refus laissait inscrit pour rien. L'activation se
  // demande maintenant en premier dans le clic, et un échec n'inscrit pas.
  verifier('🔴 l’inscription exige les notifications AVANT d’écrire, sinon elle s’arrête',
    /import \{ activerNotifications, lireEtatPush \} from '@\/app\/components\/OneSignalInit'/.test(BLOC)
    && /async function inscrire\(\) \{\s*setEtat\('envoi'\); setErreur\(''\)\s*if \(!await exigerNotifications\(\)\) \{ setEtat\('pret'\); return \}/.test(BLOC)
    && /if \(etatNotifsAttente\(lireEtatPush\(\)\) === 'actif'\) return true\s*const res = await activerNotifications\(\)/.test(BLOC)
    && /if \(!res\?\.ok\) \{ setErreur\(phraseNotifsRefusees\(res\?\.raison\)\); return false \}/.test(BLOC))
  verifier('⚠️ un navigateur qui ne reçoit pas les notifications n’a pas de bouton, mais une phrase',
    /\{notif !== 'non_supporte' && <button onClick=\{inscrire\}/.test(BLOC)
    && /\{phraseNotifsAvant\(notif\) && <p /.test(BLOC))
  verifier('⚠️ déjà inscrit sans notifications : on le dit, et on propose de les rallumer',
    /\(notif === 'a_demander' \|\| notif === 'bloque' \|\| notif === 'non_supporte'\) && \(/.test(BLOC)
    && /Tes notifications sont coupées : on ne pourra pas te prévenir\./.test(BLOC))
  {
    const { etatNotifsAttente: etatN, phraseNotifsRefusees: refusN, phraseNotifsAvant: avantN } = await import('../lib/notifs-attente.js')
    verifier('🔴 autorisées et abonnées : on inscrit directement',
      etatN({ pret: true, supporte: true, permission: 'granted', optedIn: true }) === 'actif'
      && etatN({ pret: true, natif: true, optedIn: true }) === 'actif')
    verifier('🔴 autorisées mais désabonnées : on redemande, OneSignal n’enverrait rien',
      etatN({ pret: true, supporte: true, permission: 'granted', optedIn: false }) === 'a_demander')
    verifier('🔴 refusées dans le navigateur : bloqué, et on dit où les rouvrir',
      etatN({ pret: true, supporte: true, permission: 'denied' }) === 'bloque' && /réglages/.test(avantN('bloque')))
    verifier('🔴 un navigateur sans notifications (iPhone hors de l’app) renvoie vers l’app',
      etatN({ pret: true, supporte: false, permission: 'default' }) === 'non_supporte' && /Installe l’app Yoppaa/.test(avantN('non_supporte')))
    verifier('⚠️ l’app sans autorisation redemande, le module pas encore chargé tente au clic',
      etatN({ pret: true, natif: true, optedIn: false }) === 'a_demander' && etatN({ pret: false }) === 'inconnu' && etatN(null) === 'inconnu')
    verifier('⚠️ chaque échec dit quoi faire, et un inconnu ne reste pas muet',
      refusN('refuse_os') !== refusN('incomplet') && refusN('non_supporte') !== refusN('erreur') && refusN(undefined).length > 20
      && avantN('actif') === null)
  }
  verifier('🔴 et prévient la fiche après une inscription comme après un retrait',
    /const relireEtPrevenir = async \(\) => \{ await relire\(\); onChange\?\.\(\) \}/.test(BLOC)
    && (BLOC.match(/await relireEtPrevenir\(\)/g) || []).length === 2)

  // ── La fiche ───────────────────────────────────────────────────────────
  const FICHE = sansProse(readFileSync(new URL('../app/commander/rdv/[slug]/page.js', import.meta.url), 'utf8'))
  verifier('🔴 la fiche relit les attentes du Yopper, avec sa preuve',
    /fetchAvecPreuveSiConnecte\('\/api\/rdv\/attente'\)/.test(FICHE)
    && /useEffect\(\(\) => \{ if \(attenteIci\) relireMesAttentes\(\) \}, \[attenteIci, relireMesAttentes\]\)/.test(FICHE))
  verifier('🔴 la grille marque la séance où il attend, avec la même règle',
    /const dansLaFile = attenteDispo && !!attenteSur\(mesAttentes, \{ prestationId: prestationChoisie\.id, date: isoDate\(dateChoisie\), heure \}\)/.test(FICHE))
  verifier('🔴 la séance complète porte la cloche',
    /\{attenteDispo && \([\s\S]{0,700}\{dansLaFile \? 'Tu es en attente' : 'Liste d’attente'\}/.test(FICHE))
  verifier('🔴 une légende dit qu’une séance complète se touche',
    /\{dateChoisie && !slotsLoading && attenteIci\s*&& slots\.some\(s => s\.pris && s\.motif === 'complet'\) && \(/.test(FICHE)
    && /Une séance complète \? Choisis-la : on te prévient si une place se libère\./.test(FICHE))
  verifier('⚠️ le compteur ne dit plus « 0 plus de créneau »',
    !/plus de créneau/.test(FICHE) && /nbLibres === 0 \? 'Aucun créneau libre'/.test(FICHE))
  verifier('🔴 les deux blocs préviennent la grille',
    (FICHE.match(/onChange=\{relireMesAttentes\}/g) || []).length === 2)
  verifier('🔴 le bloc solo ne s’affiche pas sur une file fermée',
    /!estCoursCollectif\(prestationChoisie\) && attenteOuverte\(prestationChoisie\) && \(/.test(FICHE))

  // ── L'espace du Yopper ─────────────────────────────────────────────────
  const ESPACE = sansProse(readFileSync(new URL('../app/commander/page.js', import.meta.url), 'utf8'))
  const charge = /async function chargerAttentesClient\(\) \{([\s\S]*?)\n  \}/.exec(ESPACE)?.[1] || ''
  verifier('la fonction qui charge ses attentes a été trouvée', charge.length > 150, `${charge.length} caractères`)
  verifier('🔴 l’espace charge ses attentes avec une identité prouvée',
    /const rep = await fetchYopper\('\/api\/rdv\/attente'\)/.test(charge))
  verifier('⚠️ une session perdue ne vide pas ses listes d’attente',
    charge.indexOf('estSessionPerdue(rep, corps)') > 0
    && charge.indexOf('estSessionPerdue(rep, corps)') < charge.indexOf('setClientAttentes('))
  verifier('⚠️ elles se rechargent partout où se rechargent ses rendez-vous',
    /chargerAbonnementsClient\(\); chargerAttentesClient\(\)/.test(ESPACE)
    && !/chargerRdvsClient\(email\); chargerAbonnementsClient\(\)(?!; chargerAttentesClient\(\))/.test(ESPACE))
  verifier('🔴 la section « Tes listes d’attente » s’affiche',
    /\{clientAttentes\.length > 0 && \(/.test(ESPACE) && /Tes listes d’attente/.test(ESPACE)
    && /\{a\.libelle\}/.test(ESPACE) && /href=\{`\/commander\/rdv\/\$\{a\.commercant_slug\}`\}/.test(ESPACE))
  verifier('🔴 on sort de sa liste depuis son espace',
    /onClick=\{\(\) => retirerAttenteClient\(a\)\}/.test(ESPACE)
    && /JSON\.stringify\(\{ action: 'retirer', id: attente\.id \}\)[\s\S]{0,400}await chargerAttentesClient\(\)/.test(ESPACE))
  // Le lien du bloc doit mener quelque part : l'onglet et le sous-onglet
  // qu'il nomme existent, et s'ouvrent depuis l'adresse.
  verifier('🔴 le bloc dit où retrouver l’attente',
    /const LIEN_MES_ATTENTES = '\/commander\?onglet=commandes&tab=rdvs'/.test(BLOC) && /href=\{LIEN_MES_ATTENTES\}/.test(BLOC))
  verifier('⚠️ et cet endroit existe sous le nom qu’il lui donne',
    /key: 'commandes', label: 'Suivi'/.test(ESPACE) && /tabFromUrl === 'rdvs'/.test(ESPACE)
    && /Suivi, onglet Rendez-vous/.test(BLOC))
}

// ═══ LA-02 ET L'OUBLI DU COURS ANNULÉ (04/10) : QUI PRÉVIENT LA FILE ═══════
//
// 🔴 `placePrise` ne vivait que dans `creerReservationRdv` : la saisie au
// comptoir, le déplacement et la remise en confirmé reprenaient une place sans
// le dire à la file, et les notifications d'une place libérée partaient vers
// une séance de nouveau complète. Et une fermeture (cours annulé, jour fermé)
// ne vidait aucune file.
{
  const lire = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
  const ROUTE_PP = lire('app/api/rdv/place-prise/route.js')
  verifier('🔴 la route « place reprise » est gardée « Agenda »',
    /gardeLigneEquipe\(request, supabase, 'rdv_reservations', ids\[0\], 'agenda'\)/.test(ROUTE_PP) && /refus\(verdict, NextResponse\)/.test(ROUTE_PP))
  verifier('🔴 et bornée au commerce du premier rendez-vous',
    /\.in\('id', ids\)\s*\.eq\('commercant_id', premier\.commercant_id\)/.test(ROUTE_PP))
  verifier('elle relit chaque rendez-vous et appelle placePrise',
    /placePrise\(supabase, \{[\s\S]{0,200}clientEmail: r\.client_email/.test(ROUTE_PP))
  verifier('🔴 la saisie au comptoir prévient la file',
    /postPro\('\/api\/rdv\/place-prise', \{ rdv_ids: idsPoses \}\)/.test(lire('app/dashboard/ModalNouveauRdv.js')))
  verifier('🔴 le déplacement du patron aussi',
    /postPro\('\/api\/rdv\/place-prise', \{ rdv_ids: \[rdv\.id\] \}\)/.test(lire('app/dashboard/ModalDeplacerRdv.js')))
  const DEPL = lire('lib/rdv-deplacement-server.js')
  verifier('🔴 le déplacement de l’équipe aussi, à la NOUVELLE séance',
    /const suite = await placePrise\(db, \{\s*prestationId: maj\.prestation_id \?\? rdv\.prestation_id,\s*dateRdv: date,/.test(DEPL)
    && DEPL.indexOf('await placePrise(db') > DEPL.indexOf("return refus('deja_modifiee')"))
  const RECONF = lire('app/api/rdv/reconfirmer/route.js')
  verifier('🔴 la remise en confirmé aussi, après l’écriture',
    /const suite = await placePrise\(supabase, \{/.test(RECONF)
    && RECONF.indexOf('await placePrise(') > RECONF.indexOf('if (!ecrit || ecrit.length === 0)'))

  const ROUTE_FF = lire('app/api/rdv/fermeture-file/route.js')
  verifier('🔴 la route qui vide les files est gardée par la fermeture',
    /gardeLigneEquipe\(request, supabase, 'rdv_fermetures', fermeture_id, 'agenda'\)/.test(ROUTE_FF) && /refus\(verdict, NextResponse\)/.test(ROUTE_FF))
  verifier('elle relit la fermeture, cours et heure compris',
    /\.select\('id, commercant_id, praticien_id, date_debut, date_fin, prestation_id, heure_debut, deleted_at'\)/.test(ROUTE_FF)
    && /fermerLesFiles\(supabase, fermeture\)/.test(ROUTE_FF))
  verifier('🔴 annuler un cours vide sa file',
    /postPro\('\/api\/rdv\/fermeture-file', \{ fermeture_id: fermetureCreee\.id \}\)/.test(lire('app/dashboard/page.js')))
  verifier('🔴 poser une fermeture vide les files du jour',
    /postPro\('\/api\/rdv\/fermeture-file', \{ fermeture_id: ecrite\.id \}\)/.test(lire('app/dashboard/ConfigDashboard.js')))
  const SRV = lire('lib/attente-rdv-server.js')
  const corps = SRV.slice(SRV.indexOf('export async function fermerLesFiles'))
  verifier('🔴 la notification programmée tombe avec la ligne',
    /if \(l\.push_id\) \{\s*const r = await annulerPush\(l\.push_id\)/.test(corps))
  verifier('et la règle commune choisit les lignes', /const visees = attentesFermeesPar\(data \|\| \[\], fermeture\)/.test(corps))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Liste d’attente des rendez-vous verte.')
