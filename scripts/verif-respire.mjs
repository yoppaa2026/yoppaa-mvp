// Banc du lot « AVANT CENTRE RESPIRE » (audit du 17/10).
//
// ✅ Alex, au tableau : corriger avant son démarrage les quatre défauts
// généraux et celui de sa configuration (congés saisis DANS la formule).
//   1. la série d'une abonnée ignorait les fermetures du 16/10 ;
//   2. l'inscription au comptoir d'une période déjà commencée prenait le
//      compte plein ;
//   3. l'email de confirmation et le rappel dépendaient du navigateur ;
//   4. l'absence d'une prof ne listait pas les inscrits de ses cours, et la
//      file d'attente prévenait encore pour son cours ;
//   5. les congés de la formule ne bloquaient pas la réservation.
//
//   npm run verif:respire

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  termesInscriptionComptoir, offreAuJour, peutReserverSurAbonnement, peutPoserSeance,
  expliquerRefusSeance, expliquerRefusCommercant,
} from '../lib/abonnements.js'
import { rdvsSousLaFermeture, seanceSansProfesseur } from '../lib/fermetures-rdv.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const code = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

// L'année de Centre Respire, ses congés scolaires dans la formule.
const CONGES = [
  { debut: '2026-10-26', fin: '2026-11-01' },
  { debut: '2026-12-21', fin: '2027-01-03' },
  { debut: '2027-02-15', fin: '2027-02-21' },
  { debut: '2027-04-05', fin: '2027-04-18' },
]
const ANNEE = {
  id: 'f1', type: 'periode', prix: 450, seances_par_semaine: 1,
  date_debut: '2026-09-01', date_fin: '2027-06-30', periodes_exclues: CONGES,
}

// ═══ 2. L'INSCRIPTION AU COMPTOIR SUIT L'OFFRE DU JOUR ═══════════════════════
{
  const offre = offreAuJour(ANNEE, { aujourdhui: '2026-10-22' })
  const neuve = termesInscriptionComptoir(ANNEE, { reprise: false, aujourdhui: '2026-10-22' })
  verifier('le 22/10, une nouvelle inscription prend les séances qui restent',
    neuve.seances_total === offre.seances && neuve.seances_total < 38, `${neuve.seances_total} (en ligne : ${offre.seances})`)
  verifier('et le même prix qu’en ligne', neuve.prix === offre.prix && neuve.prix < 450, String(neuve.prix))
  verifier('et commence le jour de l’inscription', neuve.date_debut === '2026-10-22', neuve.date_debut)
  const reprise = termesInscriptionComptoir(ANNEE, { reprise: true, fenetre: { debut: '2026-09-01' }, aujourdhui: '2026-10-22' })
  verifier('une reprise garde son contrat entier (payé en septembre)',
    reprise.prix === 450 && reprise.date_debut === '2026-09-01' && reprise.seances_total > neuve.seances_total)
  const avant = termesInscriptionComptoir(ANNEE, { reprise: false, aujourdhui: '2026-08-20' })
  verifier('avant le début de la période, compte et prix pleins', avant.prix === 450 && avant.date_debut === '2026-09-01')
  const carnet = termesInscriptionComptoir({ type: 'carnet', prix: 150, seances_total: 10, validite_jours: 180 }, { reprise: false, aujourdhui: '2026-10-22' })
  verifier('un carnet n’est jamais au prorata', carnet.prix === 150)
  verifier('sans formule, rien', termesInscriptionComptoir(null) === null)

  const bord = code('app/dashboard/ConfigDashboard.js')
  verifier('l’enregistrement écrit les termes du jour',
    /const termes = termesInscriptionComptoir\(formule, \{ reprise: !!insc\.reprise \|\| reprise\.reprise, fenetre, aujourdhui \}\)/.test(bord)
    && /prix: termes\.prix,\s*seances_total: termes\.seances_total,/.test(bord)
    && /date_debut: termes\.date_debut \|\| fenetre\.debut,/.test(bord))
  verifier('l’aperçu annonce les mêmes termes',
    /const termes = termesInscriptionComptoir\(f, \{ reprise: !!insc\.reprise, aujourdhui: jourBruxelles\(\) \}\)/.test(bord))
}

// ═══ 5. LES CONGÉS DE LA FORMULE BLOQUENT LA RÉSERVATION ═════════════════════
{
  const contrat = { statut: 'actif', date_debut: '2026-09-01', date_fin: '2027-06-30', seances_total: 38, seances_par_semaine: 1 }
  const v = peutReserverSurAbonnement(contrat, { date: '2026-10-28', periodesExclues: CONGES })
  verifier('le 28/10 (Toussaint) est refusé', !v.ok && v.raison === 'conge', JSON.stringify(v))
  verifier('le 4/11 passe', peutReserverSurAbonnement(contrat, { date: '2026-11-04', periodesExclues: CONGES }).ok)
  verifier('sans congés transmis, rien ne change', peutReserverSurAbonnement(contrat, { date: '2026-10-28' }).ok)
  verifier('la fiche refuse aussi, avant l’envoi',
    peutPoserSeance({ statut: 'actif', debut: '2026-09-01', fin: '2027-06-30', total: 38, seancesParSemaine: 1, consommees: 0, dates: [], periodesExclues: CONGES }, { date: '2026-12-23' }).raison === 'conge')
  verifier('la cliente lit pourquoi', /congé/.test(expliquerRefusSeance('conge')))
  verifier('le commerçant aussi, avec son geste', /congés de la formule/.test(expliquerRefusCommercant('conge')) && /hors abonnement/.test(expliquerRefusCommercant('conge')))

  const route = code('app/api/rdv/reserver-abonnement/route.js')
  verifier('la route lit les congés sur la formule',
    /\.select\('prestation_id, periodes_exclues'\)/.test(route) && /periodesExclues,\s*\}\)/.test(route))
  verifier('une lecture ratée de la formule refuse',
    /if \(errFormule\) return NextResponse\.json\(\{ ok: false, error: 'lecture_impossible' \}, \{ status: 500 \}\)/.test(route))
  verifier('l’état de l’abonnement porte les congés',
    /periodes_exclues'\)\.in\('id', formuleIds\)/.test(code('app/api/yopper/abonnements/route.js')))
  const modale = code('app/dashboard/ModalNouveauRdv.js')
  verifier('la fenêtre du patron applique les congés aux deux verdicts',
    (modale.match(/periodesExclues: (aboChoisi|a)\.contrat\.formule\?\.periodes_exclues \|\| \[\]/g) || []).length >= 3)
}

// ═══ 4. L'ABSENCE D'UNE PROF TOUCHE LES INSCRITS DE SES COURS ════════════════
{
  const EMILY = 'emily', CAROLE = 'carole'
  const plages = [
    { praticien_id: EMILY, jour_semaine: 'mardi', heure_debut: '18:00', heure_fin: '19:30' },
    { praticien_id: null, jour_semaine: 'jeudi', heure_debut: '09:00', heure_fin: '12:00' },
    { praticien_id: EMILY, jour_semaine: 'vendredi', heure_debut: '10:00', heure_fin: '11:00' },
    { praticien_id: CAROLE, jour_semaine: 'vendredi', heure_debut: '10:00', heure_fin: '11:00' },
  ]
  const absence = { date_debut: '2026-11-02', date_fin: '2026-11-08', praticien_id: EMILY }
  const rdv = (id, date, heure, praticien = null) => ({ id, date_rdv: date, heure_debut: heure, praticien_id: praticien, statut: 'confirme' })
  const rdvs = [
    rdv(1, '2026-11-03', '18:00'),          // mardi, plage d'Emily seule → touché
    rdv(2, '2026-11-05', '09:30'),          // jeudi, plage commune → pas touché
    rdv(3, '2026-11-06', '10:00'),          // vendredi, Emily ET Carole → pas touché
    rdv(4, '2026-11-03', '18:00', CAROLE),  // nommé chez Carole → pas touché
    rdv(5, '2026-11-03', '18:00', EMILY),   // nommé chez Emily → touché (comme avant)
    rdv(6, '2026-11-10', '18:00'),          // hors de l'absence → pas touché
  ]
  const touches = rdvsSousLaFermeture(rdvs, absence, { plages }).map(r => r.id).sort()
  verifier('l’absence d’Emily touche ses inscrits sans prof désignée, et seulement eux',
    JSON.stringify(touches) === JSON.stringify([1, 5]), JSON.stringify(touches))
  verifier('sans les plages, la règle d’avant reste la même',
    JSON.stringify(rdvsSousLaFermeture(rdvs, absence).map(r => r.id)) === JSON.stringify([5]))
  verifier('une plage inactive ou supprimée ne compte pas',
    rdvsSousLaFermeture([rdv(7, '2026-11-05', '09:30')], absence, {
      plages: [{ praticien_id: EMILY, jour_semaine: 'jeudi', heure_debut: '09:00', heure_fin: '12:00' },
               { praticien_id: null, jour_semaine: 'jeudi', heure_debut: '09:00', heure_fin: '12:00', actif: false }],
    }).length === 1)

  const fermetures = [{ ...absence }]
  verifier('la file sait qu’un cours d’Emily n’a plus de prof',
    seanceSansProfesseur(fermetures, plages, { dateStr: '2026-11-03', heure: '18:00' }))
  verifier('mais pas un cours partagé avec Carole',
    !seanceSansProfesseur(fermetures, plages, { dateStr: '2026-11-06', heure: '10:00' }))
  verifier('ni une séance hors de l’absence',
    !seanceSansProfesseur(fermetures, plages, { dateStr: '2026-11-10', heure: '18:00' }))

  const att = code('lib/attente-rdv-server.js')
  verifier('la file ne prévient pas pour un cours sans prof, et une lecture ratée ne prévient personne',
    /if \(errPl\) return \{ ok: false, error: 'lecture_ko'/.test(att)
    && /if \(seanceSansProfesseur\(fermetures, plages \|\| \[\], \{ dateStr: dateRdv, heure: heureDebut \}\)\) return \{ ok: true, prevenus: 0, file: 0, raison: 'professeur_absent' \}/.test(att))
  verifier('l’écran des absences lit les plages',
    /setTouches\(rdvsSousLaFermeture\(data \|\| \[\], ferm, \{ plages: plages \|\| \[\] \}\)\)/.test(code('app/dashboard/ConfigDashboard.js')))
}

// ═══ 3. L'EMAIL ET LE RAPPEL PARTENT DU SERVEUR ══════════════════════════════
{
  const lib = code('lib/rdv-apres-reservation-server.js')
  verifier('après la réponse, le rappel puis l’email',
    /after\(async \(\) => \{/.test(lib) && /await programmerRappelRdv\(rdvId, db\)/.test(lib)
    && /await envoyerConfirmationRdv\(new Request\(/.test(lib))
  verifier('l’email part par la route elle-même, sans réseau',
    /import \{ POST as envoyerConfirmationRdv \} from '@\/app\/api\/emails\/rdv-confirme\/route'/.test(lib))
  for (const [nom, f, appel] of [
    ['la réservation gratuite', 'app/api/rdv/reserver/route.js', /confirmerApresReponse\(db, res\.rdv\.id\)/],
    ['la séance d’abonnement', 'app/api/rdv/reserver-abonnement/route.js', /confirmerApresReponse\(db, res\.rdv\?\.id\)/],
    ['le rendez-vous payé par des bons', 'app/api/stripe/checkout/create-rdv-commande/route.js', /confirmerApresReponse\(supabase, idRdv\)/],
  ]) verifier(`${nom} confirme côté serveur`, appel.test(code(f)))
  const fiche = code('app/commander/rdv/[slug]/page.js')
  verifier('la fiche ne demande plus ni l’email ni le rappel (sinon deux emails)',
    !/\/api\/emails\/rdv-confirme/.test(fiche) && !/\/api\/rdv\/schedule-rappel/.test(fiche))
}

// ═══ 1. LA SÉRIE LIT LES FERMETURES DU 16/10 ═════════════════════════════════
// (gardé aussi par verif:abonnements ; ici, la page qui les donne)
{
  const page = code('app/dashboard/page.js')
  const i = page.indexOf('<ModalNouveauRdv')
  const bloc = i >= 0 ? page.slice(i, page.indexOf('/>', i)) : ''
  verifier('la page donne les fermetures unifiées et les horaires exceptionnels',
    /fermetures=\{fermeturesAgendaTout\}/.test(bloc) && /exceptions=\{exceptionsRdv\}/.test(bloc))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) { echecs.forEach(e => console.log('  ✕ ' + e)); process.exit(1) }
console.log('Lot Centre Respire : vert.')
