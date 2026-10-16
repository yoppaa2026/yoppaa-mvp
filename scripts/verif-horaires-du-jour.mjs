// Banc de L'HORAIRE D'UN JOUR PRÉCIS : la semaine, sauf exception (16/10).
//
// ✅ ALEX, 16/10 (tableau) : UNE liste « Fermetures et horaires exceptionnels »
// pour tout le commerce. Une fermeture ou un horaire adapté REMPLACE les
// horaires de ces jours-là, partout : créneaux de retrait et tournées,
// boutique, rendez-vous et tables, Ouvert / Fermé.
//
// ⚠️ TOUT S'EXÉCUTE : la règle, et les fonctions qui l'appliquent (créneaux de
// retrait, boutique, pastille, moteur des rendez-vous, agenda).
//
// Repères : le 16/10/2026 est un vendredi. 19/10 lundi, 20/10 mardi,
// 24/12 jeudi.

import {
  plagesException, estFermetureComplete, couvreLeJour, exceptionDuJour,
  horaireDuJour, horairesPourDate, fermeturesAgenda, phraseException,
  exceptionsAAnnoncer, dateLisible,
} from '../lib/horaires-du-jour.js'
import {
  estFermeExceptionnellement, ouvertLe, creneauRetraitHorsHoraires,
  joursRetraitBoutique, calculerStatutOuverture,
} from '../lib/ouverture.js'
import { genererSlots } from '../lib/rdv-slots.js'
import { creneauAcceptable } from '../lib/deplacement-rdv.js'
import { plagesOuvertes, fermetureQuiBloque, rdvsSousLaFermeture } from '../lib/fermetures-rdv.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// Une boulangerie : 07:00-18:00 en semaine, fermée le dimanche et le lundi.
const SEMAINE = {
  lundi: { ouvert: false },
  mardi: { ouvert: true, debut: '07:00', fin: '18:00' },
  mercredi: { ouvert: true, debut: '07:00', fin: '18:00' },
  jeudi: { ouvert: true, debut: '07:00', fin: '18:00' },
  vendredi: { ouvert: true, debut: '07:00', fin: '18:00' },
  samedi: { ouvert: true, debut: '07:00', fin: '13:00' },
  dimanche: { ouvert: false },
}
const FERME_20 = { id: 'f1', date_debut: '2026-10-20', date_fin: '2026-10-20', motif: 'Formation', created_at: '2026-10-01' }
const NOEL = { id: 'a1', date_debut: '2026-12-24', date_fin: '2026-12-31', plage1_debut: '08:00:00', plage1_fin: '13:00:00', created_at: '2026-10-02' }
const RESTO_FERIE = { id: 'a2', date_debut: '2026-10-20', date_fin: '2026-10-20', plage1_debut: '12:00', plage1_fin: '14:00', plage2_debut: '18:30', plage2_fin: '21:30', created_at: '2026-10-03' }
const LUNDI_OUVERT = { id: 'a3', date_debut: '2026-10-19', date_fin: '2026-10-19', plage1_debut: '09:00', plage1_fin: '12:00', created_at: '2026-10-04' }

// ═══ 1. LA RÈGLE ═════════════════════════════════════════════════════════
{
  egal('les plages se lisent en HH:MM', plagesException(NOEL), [['08:00', '13:00']])
  egal('deux plages', plagesException(RESTO_FERIE), [['12:00', '14:00'], ['18:30', '21:30']])
  verifier('sans plage : fermé toute la journée', estFermetureComplete(FERME_20))
  verifier('avec plage : pas une fermeture', !estFermetureComplete(NOEL))
  verifier('🔴 une seconde plage sans la première ne compte pas',
    estFermetureComplete({ date_debut: '2026-10-20', date_fin: '2026-10-20', plage2_debut: '10:00', plage2_fin: '11:00' }))
  verifier('les bornes de la période sont comprises', couvreLeJour(NOEL, '2026-12-24') && couvreLeJour(NOEL, '2026-12-31'))
  verifier('hors période, rien', !couvreLeJour(NOEL, '2027-01-01') && !couvreLeJour(NOEL, '2026-12-23'))
  verifier('une date mal écrite ne couvre rien', !couvreLeJour(NOEL, '24/12/2026'))

  egal('🔴 une fermeture GAGNE sur un horaire adapté le même jour',
    exceptionDuJour([RESTO_FERIE, FERME_20], '2026-10-20')?.id, 'f1')
  egal('entre deux horaires adaptés, le plus récent',
    exceptionDuJour([NOEL, { ...NOEL, id: 'a9', created_at: '2026-10-10', plage1_fin: '12:00' }], '2026-12-24')?.id, 'a9')
  egal('aucune exception : null', exceptionDuJour([NOEL], '2026-10-20'), null)

  egal('sans exception, le jour de la semaine tel quel', horaireDuJour(SEMAINE, '2026-10-20', [NOEL]), SEMAINE.mardi)
  verifier('sans exception ni grille : undefined (on ne bloque pas)', horaireDuJour(null, '2026-10-20', []) === undefined)
  egal('🔴 fermé exceptionnellement : le jour est fermé', horaireDuJour(SEMAINE, '2026-10-20', [FERME_20]),
    { ouvert: false, exceptionnel: true, motif: 'Formation' })
  egal('🔴 horaires adaptés : le jour n’a que ces heures', horaireDuJour(SEMAINE, '2026-12-24', [NOEL]),
    { ouvert: true, debut: '08:00', fin: '13:00', exceptionnel: true, motif: null })
  egal('deux plages : la pause comme dans la grille', horaireDuJour(SEMAINE, '2026-10-20', [RESTO_FERIE]),
    { ouvert: true, debut: '12:00', fin: '14:00', debut2: '18:30', fin2: '21:30', exceptionnel: true, motif: null })
  egal('🔴 un jour habituellement fermé peut ouvrir', horaireDuJour(SEMAINE, '2026-10-19', [LUNDI_OUVERT])?.ouvert, true)

  verifier('sans exception, la MÊME grille (même objet)', horairesPourDate(SEMAINE, '2026-10-20', [NOEL]) === SEMAINE)
  const grille = horairesPourDate(SEMAINE, '2026-12-24', [NOEL])
  egal('la grille du 24/12 : jeudi remplacé', grille.jeudi?.fin, '13:00')
  egal('les autres jours intacts', grille.mardi, SEMAINE.mardi)
  verifier('« 24 h/24 » cède devant une exception',
    horairesPourDate({ always_open: true }, '2026-10-20', [FERME_20]).always_open === undefined)
}

// ═══ 2. LES COMMANDES : retrait, tournée, boutique ═══════════════════════
{
  verifier('🔴 un horaire adapté n’est PAS une fermeture', !estFermeExceptionnellement([NOEL], '2026-12-24'))
  verifier('une fermeture complète l’est', estFermeExceptionnellement([FERME_20], '2026-10-20'))

  verifier('le 24/12 est ouvert (horaires adaptés)', ouvertLe({ horairesDetail: SEMAINE, fermetures: [NOEL], dateStr: '2026-12-24' }))
  verifier('le 20/10 est fermé', !ouvertLe({ horairesDetail: SEMAINE, fermetures: [FERME_20], dateStr: '2026-10-20' }))
  verifier('🔴 un lundi habituellement fermé, ouvert par exception', ouvertLe({ horairesDetail: SEMAINE, fermetures: [LUNDI_OUVERT], dateStr: '2026-10-19' }))

  const matin = { heure_debut: '09:00', heure_fin: '09:15' }
  const soir = { heure_debut: '16:00', heure_fin: '16:15' }
  const deborde = { heure_debut: '12:45', heure_fin: '13:15' }
  egal('un créneau du matin tient dans l’horaire du 24/12',
    creneauRetraitHorsHoraires({ creneau: matin, dateStr: '2026-12-24', horairesDetail: SEMAINE, fermetures: [NOEL] }), null)
  egal('🔴 un créneau de 16:00 est masqué le 24/12',
    creneauRetraitHorsHoraires({ creneau: soir, dateStr: '2026-12-24', horairesDetail: SEMAINE, fermetures: [NOEL] })?.raison, 'hors_ouverture')
  egal('🔴 un créneau qui DÉBORDE est masqué (Alex : « Masqué »)',
    creneauRetraitHorsHoraires({ creneau: deborde, dateStr: '2026-12-24', horairesDetail: SEMAINE, fermetures: [NOEL] })?.raison, 'hors_ouverture')
  egal('un jour normal, le 16:00 reste',
    creneauRetraitHorsHoraires({ creneau: soir, dateStr: '2026-10-22', horairesDetail: SEMAINE, fermetures: [NOEL] }), null)
  egal('fermé exceptionnellement : jour fermé',
    creneauRetraitHorsHoraires({ creneau: matin, dateStr: '2026-10-20', horairesDetail: SEMAINE, fermetures: [FERME_20] })?.raison, 'jour_ferme')
  egal('🔴 un horaire adapté s’applique même sans grille renseignée',
    creneauRetraitHorsHoraires({ creneau: soir, dateStr: '2026-12-24', horairesDetail: null, fermetures: [NOEL] })?.raison, 'hors_ouverture')

  // Les tournées : indépendantes des horaires, SAUF un jour d'horaires adaptés.
  const tournee = { heure_debut: '18:00', heure_fin: '19:00' }
  egal('une tournée du soir roule boutique fermée, un jour normal',
    creneauRetraitHorsHoraires({ creneau: tournee, dateStr: '2026-10-22', horairesDetail: SEMAINE, fermetures: [NOEL], seulementException: true }), null)
  egal('🔴 le 24/12, la tournée de 18:00 disparaît (Alex : « comme le retrait »)',
    creneauRetraitHorsHoraires({ creneau: tournee, dateStr: '2026-12-24', horairesDetail: SEMAINE, fermetures: [NOEL], seulementException: true })?.raison, 'hors_ouverture')

  // La boutique : le jour même s'arrête à la fermeture adaptée, moins le délai.
  const jours = joursRetraitBoutique({ horairesDetail: SEMAINE, fermetures: [NOEL], depuis: '2026-12-24', maintenant: 12 * 60 + 30, delaiHeures: 1 })
  verifier('🔴 le 24/12 à 12:30, plus de retrait le jour même (fermeture 13:00, délai 1 h)', !jours.some(j => j.jour === '2026-12-24'))
  const tot = joursRetraitBoutique({ horairesDetail: SEMAINE, fermetures: [NOEL], depuis: '2026-12-24', maintenant: 10 * 60, delaiHeures: 1 })
  verifier('à 10:00, le retrait du jour reste possible', tot.some(j => j.jour === '2026-12-24'))
}

// ═══ 3. OUVERT / FERMÉ, CE QUE LE CLIENT LIT ═════════════════════════════
{
  // Mardi 20/10/2026 à 10:00 à Bruxelles (heure d'été, UTC+2).
  const mardi10h = new Date('2026-10-20T08:00:00Z')
  egal('un mardi normal à 10:00 : ouvert', calculerStatutOuverture(SEMAINE, mardi10h).label, 'Ouvert')
  const ferme = calculerStatutOuverture(SEMAINE, mardi10h, [FERME_20])
  egal('🔴 fermé ce jour-là : la pastille le dit', ferme.label, 'Fermé exceptionnellement')
  egal('et annonce la réouverture', ferme.sousTitre, 'Ouvre demain à 07:00')
  const court = calculerStatutOuverture(SEMAINE, mardi10h, [{ ...NOEL, date_debut: '2026-10-20', date_fin: '2026-10-20', plage1_fin: '12:00' }])
  egal('🔴 horaires adaptés : « Ferme à 12:00 »', court.sousTitre, 'Ferme à 12:00')
  // Dimanche 18/10 à 10:00 : fermé, et lundi habituellement fermé ouvre par exception.
  const dimanche = calculerStatutOuverture(SEMAINE, new Date('2026-10-18T08:00:00Z'), [LUNDI_OUVERT])
  egal('🔴 la réouverture suit l’exception du lendemain', dimanche.sousTitre, 'Ouvre demain à 09:00')
  egal('sans exception, le dimanche annonce mardi', calculerStatutOuverture(SEMAINE, new Date('2026-10-18T08:00:00Z')).sousTitre, 'Ouvre mardi à 07:00')
  egal('« 24 h/24 » fermé un jour férié : fermé',
    calculerStatutOuverture({ always_open: true }, mardi10h, [FERME_20]).etat, 'ferme')

  egal('la phrase d’une fermeture', phraseException(FERME_20), 'Fermé exceptionnellement le 20 octobre.')
  egal('la phrase d’une période adaptée', phraseException(NOEL), 'Horaires adaptés du 24 décembre au 31 décembre : 08:00–13:00.')
  egal('deux plages', phraseException(RESTO_FERIE), 'Horaires adaptés le 20 octobre : 12:00–14:00 et 18:30–21:30.')
  egal('le premier du mois', dateLisible('2026-11-01'), '1er novembre')
  const annonces = exceptionsAAnnoncer([NOEL, FERME_20, { date_debut: '2026-10-01', date_fin: '2026-10-02' }], '2026-10-16', 30)
  egal('🔴 on annonce ce qui vient dans le mois, par date (pas le passé, pas Noël)', annonces.map(e => e.id), ['f1'])
}

// ═══ 4. L'AGENDA : rendez-vous et tables ═════════════════════════════════
{
  const legacy = { id: 'r0', date_debut: '2026-10-22', date_fin: '2026-10-22', praticien_id: null, prestation_id: null }
  const absence = { id: 'r1', date_debut: '2026-10-20', date_fin: '2026-10-20', praticien_id: 'emily' }
  const cours = { id: 'r2', date_debut: '2026-10-20', date_fin: '2026-10-20', praticien_id: null, prestation_id: 'yoga', heure_debut: '10:00' }
  const agenda = fermeturesAgenda([legacy, absence, cours], [FERME_20, NOEL])
  verifier('🔴 l’ancienne fermeture « tout le commerce » de l’agenda est ignorée (recopiée le 16/10)',
    !agenda.some(f => f.id === 'r0'))
  verifier('les absences et les cours annulés restent', agenda.some(f => f.id === 'r1') && agenda.some(f => f.id === 'r2'))
  verifier('🔴 une fermeture de la liste unique ferme l’agenda', fermetureQuiBloque(agenda, { dateStr: '2026-10-20' }) !== null)
  verifier('un horaire adapté ne ferme pas la journée de l’agenda', fermetureQuiBloque(agenda, { dateStr: '2026-12-24' }) === null)
  egal('plus aucune plage ce jour-là', plagesOuvertes([{ jour_semaine: 'mardi' }], agenda, '2026-10-20'), [])
  egal('🔴 les rendez-vous touchés se listent par la même règle',
    rdvsSousLaFermeture([{ statut: 'confirme', date_rdv: '2026-10-20', praticien_id: 'emily' }], agenda.find(f => f.exception)).length, 1)

  // Le moteur : la grille du jour passe par `horairesPourDate`.
  const plages = [{ jour_semaine: 'jeudi', heure_debut: '08:00', heure_fin: '18:00', pas_minutes: 30, actif: true }]
  const slots = (date, fermetures) => genererSlots({
    dateChoisie: new Date(`${date}T12:00:00`), dureeMinutes: 30, creneaux: plages, reservations: [],
    horairesDetail: horairesPourDate(SEMAINE, date, fermetures),
  }).map(s => s.heure)
  const normal = slots('2026-10-22', [NOEL])
  verifier('un jeudi normal : des créneaux jusqu’à 17:30', normal.includes('17:30'))
  const noel = slots('2026-12-24', [NOEL])
  verifier('🔴 le 24/12 : plus rien après 13:00', noel.length > 0 && !noel.some(h => h >= '13:00') && noel.includes('12:30'))
  egal('🔴 fermé : aucun créneau', slots('2026-10-22', [{ ...FERME_20, date_debut: '2026-10-22', date_fin: '2026-10-22' }]), [])

  // Le déplacement et l'ajout à la main : `horaireDuJour`.
  const verdict = creneauAcceptable({
    dateStr: '2026-12-24', heureDebut: '15:00', dureeMinutes: 30,
    horaireJour: horaireDuJour(SEMAINE, '2026-12-24', [NOEL]),
    creneauxJour: plages, rdvsExistants: [],
  })
  verifier('🔴 déplacer un rendez-vous à 15:00 le 24/12 est refusé', verdict !== null && verdict !== undefined && verdict.ok !== true)
}

// ═══ 5. CE QU'UNE FERMETURE RATTRAPE, ET LE FORMULAIRE ═══════════════════
{
  const { commandesTouchees, rdvsTouches, erreurException, ligneException, bilanAnnulationFermeture } = await import('../lib/fermetures-touches.js')
  const cmd = (id, date, statut, creneau) => ({ id, date_commande: date, statut, creneau })
  const MATIN = { heure_debut: '09:00:00', heure_fin: '09:15:00' }
  const SOIR = { heure_debut: '16:00:00', heure_fin: '16:15:00' }
  const commandes = [
    cmd('a', '2026-12-24', 'en_attente', MATIN),
    cmd('b', '2026-12-24', 'en_attente', SOIR),
    cmd('c', '2026-12-24', 'annulee_commercant', SOIR),
    cmd('d', '2026-12-24', 'paiement_en_attente', SOIR),
    cmd('e', '2026-12-24', 'pret', null),
    cmd('f', '2026-12-23', 'en_attente', SOIR),
  ]
  egal('🔴 horaires adaptés : seule la commande dont le créneau sort de l’horaire', commandesTouchees(commandes, NOEL).map(c => c.id), ['b'])
  egal('🔴 fermeture : toutes les commandes à servir de ces jours-là', commandesTouchees(commandes, { ...NOEL, plage1_debut: null, plage1_fin: null }).map(c => c.id), ['a', 'b', 'e'])
  verifier('une commande annulée ou pas encore payée ne compte pas',
    !commandesTouchees(commandes, { date_debut: '2026-12-24', date_fin: '2026-12-24' }).some(c => c.id === 'c' || c.id === 'd'))

  const rdv = (id, date, debut, fin, extra = {}) => ({ id, date_rdv: date, heure_debut: debut, heure_fin: fin, statut: 'confirme', deleted_at: null, ...extra })
  const rdvs = [
    rdv('r1', '2026-12-24', '09:00:00', '09:45:00'),
    rdv('r2', '2026-12-24', '12:30:00', '13:15:00'),
    rdv('r3', '2026-12-24', '12:30:00', '14:00:00', { prestation: { par_couverts: true } }),
    rdv('r4', '2026-12-24', '15:00:00', '15:30:00', { statut: 'annule_commercant' }),
  ]
  egal('🔴 horaires adaptés : le soin qui déborde, pas la table qui arrive dans l’horaire', rdvsTouches(rdvs, NOEL).map(r => r.id), ['r2'])
  egal('🔴 fermeture : tous les rendez-vous confirmés', rdvsTouches(rdvs, { date_debut: '2026-12-24', date_fin: '2026-12-24' }).map(r => r.id), ['r1', 'r2', 'r3'])

  egal('sans dates : la phrase le dit', erreurException({}), 'Indique les deux dates.')
  egal('fin avant début : refusé', erreurException({ date_debut: '2026-12-24', date_fin: '2026-12-23' }), 'La date de fin doit être le même jour ou après la date de début.')
  egal('une fermeture n’a pas besoin d’heures', erreurException({ date_debut: '2026-12-24', date_fin: '2026-12-24' }), null)
  egal('🔴 un horaire adapté exige ses heures', erreurException({ date_debut: '2026-12-24', date_fin: '2026-12-24', adaptes: true }), 'Indique les heures d’ouverture de ce jour-là.')
  egal('une plage vide est refusée', erreurException({ date_debut: '2026-12-24', date_fin: '2026-12-24', adaptes: true, plage1_debut: '09:00', plage1_fin: '09:00' }), 'Une plage doit durer au moins une minute.')
  const ligne = ligneException({ commercantId: 'c1', date_debut: '2026-12-24', date_fin: '2026-12-24', motif: ' ', adaptes: false, plage1_debut: '09:00', plage1_fin: '13:00', avecPlage2: true, plage2_debut: '14:00', plage2_fin: '18:00' })
  egal('🔴 une fermeture s’écrit SANS plage, même si le formulaire en garde', [ligne.plage1_debut, ligne.plage2_debut, ligne.motif], [null, null, null])
  const adaptee = ligneException({ commercantId: 'c1', date_debut: '2026-12-24', date_fin: '2026-12-31', adaptes: true, plage1_debut: '08:00', plage1_fin: '13:00', avecPlage2: false, plage2_debut: '14:00', plage2_fin: '18:00' })
  egal('un horaire adapté à une plage s’écrit sans la seconde', [adaptee.plage1_debut, adaptee.plage1_fin, adaptee.plage2_debut], ['08:00', '13:00', null])
  verifier('🔴 le bilan dit un remboursement raté', /un remboursement a échoué/.test(bilanAnnulationFermeture({ commandes: { faits: 1, rembourse: 12.5 }, rdvs: { faits: 1, rates: 1 } })))
  egal('le bilan d’un échec total', bilanAnnulationFermeture({ commandes: { echecs: 2 } }), 'Rien n’a pu être annulé. Vérifie ta connexion et recommence.')
}

// ═══ 6. C'EST BRANCHÉ ? (chaque écran, chaque serveur) ═══════════════════
//
// 🔴 LE DÉFAUT DU 23/08, ENCORE ET TOUJOURS : une règle juste que personne
// n'appelle. Chaque lecteur des horaires doit passer par l'horaire du jour, et
// chaque lecture de la liste doit ramener ses PLAGES (sans elles, un horaire
// adapté se lit comme une fermeture complète).
{
  const { readFileSync } = await import('node:fs')
  const { sansProse } = await import('./lire-code.mjs')
  const lu = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
  const fiche = lu('app/commander/[slug]/page.js')
  verifier('🔴 fiche : la pastille reçoit la liste unique', /<PillStatutOuverture horaires=\{commercant\.horaires_detail\} fermetures=\{fermetures\}\/>/.test(fiche))
  verifier('🔴 fiche : les exceptions à venir sont annoncées', /<AnnoncesExceptions exceptions=\{fermetures\}\/>/.test(fiche))
  verifier('🔴 fiche : un jour se compare à un jour (plus à un instant)',
    /from\('fermetures_exceptionnelles'\)\.select\('\*'\)\.eq\('commercant_id', c\.id\)\.gte\('date_fin', jourCivilPlus\(jourLocalISO\(new Date\(\)\), -1\)\)/.test(fiche))
  const rdvFiche = lu('app/commander/rdv/[slug]/page.js')
  verifier('🔴 fiche rendez-vous : la liste unique, plages comprises',
    /\.from\('fermetures_exceptionnelles'\)\s*\.select\(COLONNES_EXCEPTIONS\)/.test(rdvFiche))
  verifier('🔴 fiche rendez-vous : l’agenda reçoit la fermeture traduite', /setFermetures\(fermeturesAgenda\(ferm \|\| \[\], exceptionsLues \|\| \[\]\)\)/.test(rdvFiche))
  verifier('🔴 fiche rendez-vous : la grille et le calendrier suivent l’horaire du jour',
    (rdvFiche.match(/horairesDetail: horairesPourDate\(/g) || []).length === 2
      && /creneaux: creneauxFiltres, exceptions \}\)/.test(rdvFiche)
      && /const horaireJour = horaireDuJour\(commercant\.horaires_detail, dateStr, exceptions\)/.test(rdvFiche))
  verifier('fiche rendez-vous : pastille et annonce', /fermetures=\{exceptions\}/.test(rdvFiche) && /<AnnoncesExceptions exceptions=\{exceptions\} variant="card"\/>/.test(rdvFiche))

  const accueil = lu('app/commander/page.js')
  verifier('🔴 liste : les fermetures se lisent AVEC leurs plages', /from\('fermetures_exceptionnelles'\)\.select\(COLONNES_EXCEPTIONS\)/.test(accueil))
  verifier('🔴 liste : chaque jour de la carte passe par l’horaire du jour',
    /const jourDe = \(offset\) => horaireDuJour\(c\.horaires_detail, jourCivilPlus\(dateAuj, offset\), fermeturesDuCommerce\)/.test(accueil))
  verifier('🔴 liste : la pastille et le statut reçoivent la liste',
    /exceptions: fermeturesDuCommerce,/.test(accueil) && /exceptions: \(fermeturesData \|\| \[\]\)\.filter\(f => f\.commercant_id === id\),/.test(accueil))
  verifier('liste : le badge des tables reçoit la liste', /chargerTablesDuJour\(commercantsData\.filter\(c => ids\.includes\(c\.id\)\), parCommerce\)/.test(accueil))

  const agenda = lu('app/dashboard/AgendaRdv.js')
  verifier('🔴 agenda : la grille et ses bornes suivent l’horaire du jour', (agenda.match(/horaireDuJour\(horairesDetail, (j|jour)\.iso, exceptions\)/g) || []).length === 3)
  const poste = lu('app/equipe/PosteEquipe.js')
  verifier('🔴 agenda de l’équipe : il reçoit enfin les fermetures', /fermetures=\{etat\.agenda\.fermetures \|\| \[\]\} exceptions=\{etat\.agenda\.exceptions \|\| \[\]\}/.test(poste))
  const routePoste = lu('app/api/equipe/poste/route.js')
  verifier('🔴 et la route les lit', /reponse\.agenda\.fermetures = fermeturesAgenda\(/.test(routePoste))

  const reserver = lu('app/api/rdv/reserver/route.js')
  verifier('🔴 réserver : un jour exceptionnel ne se juge plus sur la grille de la semaine',
    /const jourExceptionnel = Boolean\(exceptionDuJour\(exceptionsLues \|\| \[\], date_rdv\)\)/.test(reserver) && /if \(!jourExceptionnel && horaires/.test(reserver))
  for (const [nom, f] of [
    ['les commandes encodées', 'app/api/equipe/commande/creer/route.js'],
    ['le calendrier de l’encodage', 'lib/calendrier-commande-server.js'],
    ['la commande en ligne', 'app/api/stripe/checkout/create-commande/route.js'],
    ['la création des rendez-vous', 'lib/rdv-creation-server.js'],
    ['le déplacement', 'lib/rdv-deplacement-server.js'],
    ['la file d’attente', 'lib/attente-rdv-server.js'],
    ['la reconfirmation', 'app/api/rdv/reconfirmer/route.js'],
  ]) verifier(`🔴 ${nom} lit la liste AVEC ses plages`, /select\(COLONNES_EXCEPTIONS\)/.test(lu(f)))

  const bord = lu('app/dashboard/page.js')
  verifier('🔴 le bouton du haut (Alex, 16/10) ouvre la fenêtre', /key: 'fermetures',/.test(bord) && /action: \(\) => setFermeturesOuvertes\(true\),/.test(bord)
    && (bord.match(/onClick=\{\(\) => \(a\.action \? a\.action\(\) : ouvrirConfig\(a\.key\)\)\}/g) || []).length === 2)
  verifier('la fenêtre relit la liste après chaque écriture', /onChange=\{\(\) => chargerExceptions\(commercant\.id\)\}/.test(bord))
  const conf = lu('app/dashboard/ConfigDashboard.js')
  verifier('🔴 la liste unique vit sous les horaires d’ouverture', /<FermeturesExceptionnelles commercantId=\{commercantId\} toast=\{toast\} \/>/.test(conf))
  verifier('🔴 l’onglet Créneaux n’écrit plus de fermeture, il rappelle la liste',
    /<RappelExceptions commercantId=\{commercantId\} toast=\{toast\} exceptions=\{fermetures\} onChange=\{fetchAll\} \/>/.test(conf)
      && !/from\('fermetures_exceptionnelles'\)\.insert\(/.test(conf))
  verifier('🔴 l’agenda ne pose plus de fermeture « tout le commerce »', !/<option value="tous">Tous les praticiens/.test(conf)
    && /if \(!form\.praticien_id\) return toast\(/.test(conf))
  const ecran = lu('app/dashboard/FermeturesExceptionnelles.js')
  verifier('🔴 l’écran écrit par la règle partagée, et lit l’erreur',
    /const ligne = ligneException\(\{ commercantId, \.\.\.form \}\)/.test(ecran) && /if \(error\) \{ toast\(`Erreur : \$\{error\.message\}`, 'error'\); return \}/.test(ecran))
  verifier('🔴 l’écran montre ce qui est touché par la règle du serveur',
    /commandesTouchees\(commandes, candidate\)/.test(ecran) && /rdvsTouches\(rdv\.data \|\| \[\], candidate\)/.test(ecran))
  verifier('🔴 l’annulation passe par les routes unitaires', /\/api\/commande\/annuler-commercant/.test(ecran) && /\/api\/rdv\/annuler-commercant/.test(ecran))
  const file = lu('app/api/rdv/fermeture-file/route.js')
  verifier('🔴 une fermeture de la liste vide les files d’attente, avec la même garde',
    /gardeLigneEquipe\(request, supabase, 'fermetures_exceptionnelles', exception_id, 'agenda'\)/.test(file) && /fermerLesFiles\(supabase, \{ \.\.\.traduite, commercant_id: exception\.commercant_id \}\)/.test(file))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('L’horaire du jour : vert.')
