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

  // 🔴 LA GARDE QUI PROTÈGE UNE DÉCISION D'ALEX. Le commerçant annule très
  // souvent parce qu'il n'est pas là : pousser automatiquement enverrait
  // quelqu'un vers un créneau qu'il n'honorera pas. Lui seul sait pourquoi il
  // annule, donc chez lui c'est un bouton, jamais un déclenchement.
  const ANNUL_PRO = lire('app/api/rdv/annuler-commercant/route.js')
  verifier('🔴 l’annulation du commerçant ne prévient PERSONNE toute seule',
    !/prevenirLaFile\(/.test(ANNUL_PRO))

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

  // ⚠️ ON NE PROMET PAS UNE PLACE GARDÉE. Le créneau reste réservable par
  // n'importe qui pendant la fenêtre de priorité : l'écrire serait promettre
  // ce que le code ne tient pas (arbitrage d'Alex, 06/09).
  for (const [nom, src] of [['le push', SERVEUR], ['l’écran', BLOC]]) {
    verifier(`⚠️ ${nom} ne promet aucune place gardée`,
      !/place (est|t’est|vous est) (gardée|réservée)/i.test(src) && !/réservée pour toi/i.test(src))
  }
  verifier('⚠️ le push dit qu’on est prévenu avant les autres',
    /prévenu avant les autres/.test(SERVEUR))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Liste d’attente des rendez-vous verte.')
