// Banc du lot « DÉCOUVERTE, FRÉQUENCE, FORMULES AFFICHÉES » (18/10).
//
// ✅ Alex, au tableau, demandes d'Emily (Centre Respire) :
//   1. un tarif découverte SUR le cours (même séance, mêmes places), une fois
//      par cours et par client (email ou téléphone) ;
//   2. la fréquence d'un créneau : chaque semaine, une semaine sur deux, une
//      fois par mois, ou des dates choisies, pour cours ET services ;
//   3. une formule « sur ta fiche, à prendre chez toi », visible sans achat.
//
//   npm run verif:frequence

import { readFileSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  frequenceAccepte, creneauTombeLe, champsFrequence, prochainesDates, datesDuJourAVenir,
  libelleFrequence, jourDeLaDate, COLONNES_FREQUENCE,
} from '../lib/frequence-creneau.js'
import { creneauxDuJour } from '../lib/deplacement-rdv.js'
import { rdvsSurLaPlage, seanceSansProfesseur } from '../lib/fermetures-rdv.js'
import { serieDeSeances, raisonSemaineEcartee, formuleAfficheeSurFiche, formuleVendableEnLigne } from '../lib/abonnements.js'
import { prixPrestationServeur, tarifDecouverte } from '../lib/prix-prestation-server.js'
import { copieDePrestation } from '../lib/catalogue-copie.js'

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const code = (f) => sansProse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))

// ═══ 1. LA RÈGLE DE FRÉQUENCE ═══════════════════════════════════════════════
// Novembre 2026 : dimanches 1, 8, 15, 22, 29. Décembre : 6, 13, 20, 27.
{
  const hebdo = { jour_semaine: 'dimanche' }
  verifier('sans fréquence, chaque semaine (le comportement d’avant)',
    ['2026-11-01', '2026-11-08', '2026-11-29'].every(d => creneauTombeLe(hebdo, d)))
  verifier('le mauvais jour ne tombe jamais', !creneauTombeLe(hebdo, '2026-11-02'))
  verifier('jourDeLaDate', jourDeLaDate('2026-11-01') === 'dimanche' && jourDeLaDate('x') === null)

  const premier = { jour_semaine: 'dimanche', frequence: 'mensuel', rang_mois: 1 }
  verifier('mensuel 1er dimanche : le 1er novembre oui', creneauTombeLe(premier, '2026-11-01'))
  verifier('mensuel 1er dimanche : le 8 novembre non', !creneauTombeLe(premier, '2026-11-08'))
  verifier('mensuel 1er dimanche : le 6 décembre oui', creneauTombeLe(premier, '2026-12-06'))
  const troisieme = { jour_semaine: 'dimanche', frequence: 'mensuel', rang_mois: 3 }
  verifier('mensuel 3e dimanche : 15 novembre oui, 22 non',
    creneauTombeLe(troisieme, '2026-11-15') && !creneauTombeLe(troisieme, '2026-11-22'))
  const dernier = { jour_semaine: 'dimanche', frequence: 'mensuel', rang_mois: -1 }
  verifier('mensuel dernier dimanche : 29 novembre oui, 22 non',
    creneauTombeLe(dernier, '2026-11-29') && !creneauTombeLe(dernier, '2026-11-22'))
  verifier('mensuel dernier dimanche : 27 décembre oui (mois de 31 jours)', creneauTombeLe(dernier, '2026-12-27'))
  // Le bord exact : novembre 2026 a 30 jours, ses lundis sont 2, 9, 16, 23, 30.
  // Le 23 + 7 = 30 : ce n'est PAS le dernier, le 30 l'est.
  const dernierLundi = { jour_semaine: 'lundi', frequence: 'mensuel', rang_mois: -1 }
  verifier('mensuel dernier lundi : 30 novembre oui, 23 non (le bord exact)',
    creneauTombeLe(dernierLundi, '2026-11-30') && !creneauTombeLe(dernierLundi, '2026-11-23'))
  verifier('mensuel dernier : un 4e qui est aussi le dernier (février 2027, 28 jours)',
    creneauTombeLe({ jour_semaine: 'dimanche', frequence: 'mensuel', rang_mois: -1 }, '2027-02-28')
    && creneauTombeLe({ jour_semaine: 'dimanche', frequence: 'mensuel', rang_mois: 4 }, '2027-02-28'))

  const deux = { jour_semaine: 'mardi', frequence: 'deux_semaines', date_depart: '2026-11-03' }
  verifier('deux semaines : la semaine de départ oui', creneauTombeLe(deux, '2026-11-03'))
  verifier('deux semaines : la suivante non', !creneauTombeLe(deux, '2026-11-10'))
  verifier('deux semaines : deux semaines plus tard oui', creneauTombeLe(deux, '2026-11-17'))
  verifier('deux semaines : avant le départ, rien', !creneauTombeLe(deux, '2026-10-20'))
  // « À partir de la semaine du » : c'est la SEMAINE qui compte, pas le jour.
  verifier('deux semaines : un départ un autre jour de la même semaine compte la semaine',
    creneauTombeLe({ ...deux, date_depart: '2026-11-05' }, '2026-11-03')
    && creneauTombeLe({ ...deux, date_depart: '2026-11-02' }, '2026-11-03')
    && !creneauTombeLe({ ...deux, date_depart: '2026-11-09' }, '2026-11-03'))
  verifier('deux semaines : à travers le passage à l’heure d’hiver et l’année',
    creneauTombeLe(deux, '2027-01-12') && !creneauTombeLe(deux, '2027-01-05'))

  const dates = { jour_semaine: 'dimanche', frequence: 'dates', dates_choisies: ['2026-11-08', '2026-12-13'] }
  verifier('dates choisies : seulement elles',
    creneauTombeLe(dates, '2026-11-08') && creneauTombeLe(dates, '2026-12-13') && !creneauTombeLe(dates, '2026-11-15'))

  verifier('une fréquence incomplète ne tombe jamais',
    !frequenceAccepte({ frequence: 'mensuel' }, '2026-11-01')
    && !frequenceAccepte({ frequence: 'deux_semaines' }, '2026-11-01')
    && !frequenceAccepte({ frequence: 'dates', dates_choisies: [] }, '2026-11-01')
    && !frequenceAccepte({ frequence: 'inconnue' }, '2026-11-01'))
  verifier('sans date, seul « chaque semaine » répond oui',
    frequenceAccepte({}, null) && !frequenceAccepte(premier, null))
  verifier('une date précise l’emporte, comme avant',
    creneauTombeLe({ date_specifique: '2026-11-04', jour_semaine: 'lundi' }, '2026-11-04')
    && !creneauTombeLe({ date_specifique: '2026-11-04', jour_semaine: 'mercredi' }, '2026-11-11'))

  verifier('libellés',
    libelleFrequence(premier) === 'Le 1er dimanche du mois' && libelleFrequence(dernier) === 'Le dernier dimanche du mois'
    && libelleFrequence(deux) === 'Une semaine sur deux' && libelleFrequence(dates) === '2 dates' && libelleFrequence(hebdo) === 'Chaque semaine')
  verifier('prochaines dates du 1er dimanche',
    JSON.stringify(prochainesDates(premier, '2026-10-18', { nombre: 3 })) === JSON.stringify(['2026-11-01', '2026-12-06', '2027-01-03']),
    JSON.stringify(prochainesDates(premier, '2026-10-18', { nombre: 3 })))
  const aCocher = datesDuJourAVenir('dimanche', '2026-10-18', { semaines: 3 })
  verifier('dates à cocher : les dimanches à venir', JSON.stringify(aCocher) === JSON.stringify(['2026-10-18', '2026-10-25', '2026-11-01']), JSON.stringify(aCocher))

  const c1 = champsFrequence({ frequence: 'hebdo', date_depart: '2026-11-03', rang_mois: 2 }, 'mardi')
  verifier('enregistrer « chaque semaine » vide les autres champs',
    c1.ok && c1.champs.frequence === 'hebdo' && c1.champs.date_depart === null && c1.champs.rang_mois === null && c1.champs.dates_choisies === null)
  verifier('mensuel sans rang : refusé avec une phrase', champsFrequence({ frequence: 'mensuel' }, 'dimanche').ok === false)
  verifier('deux semaines sans départ : refusé', champsFrequence({ frequence: 'deux_semaines' }, 'mardi').ok === false)
  const c2 = champsFrequence({ frequence: 'dates', dates_choisies: ['2026-11-08', '2026-11-09', '2026-11-08', 'x'] }, 'dimanche')
  verifier('dates choisies : seulement le jour du créneau, sans doublon',
    c2.ok && JSON.stringify(c2.champs.dates_choisies) === '["2026-11-08"]', JSON.stringify(c2))
  verifier('dates choisies toutes d’un autre jour : refusé',
    champsFrequence({ frequence: 'dates', dates_choisies: ['2026-11-09'] }, 'dimanche').ok === false)
  verifier('les colonnes de fréquence', COLONNES_FREQUENCE === 'frequence, date_depart, rang_mois, dates_choisies')
}

// ═══ 2. LA RÈGLE COMMUNE EST CELLE DE TOUS ═══════════════════════════════════
{
  const plages = [
    { id: 'hebdo', jour_semaine: 'dimanche', heure_debut: '09:00', heure_fin: '10:00' },
    { id: 'yin', jour_semaine: 'dimanche', heure_debut: '10:00', heure_fin: '11:00', frequence: 'mensuel', rang_mois: 1 },
  ]
  verifier('creneauxDuJour : le 1er novembre, les deux plages',
    creneauxDuJour(plages, { dateStr: '2026-11-01', jour: 'dimanche' }).length === 2)
  verifier('creneauxDuJour : le 8 novembre, seulement la plage hebdomadaire',
    creneauxDuJour(plages, { dateStr: '2026-11-08', jour: 'dimanche' }).map(c => c.id).join() === 'hebdo')

  // La plage d'une collègue, mensuelle, ne sauve pas la séance d'une absente
  // les semaines où elle n'a pas lieu.
  const plagesProfs = [
    { praticien_id: 'emily', jour_semaine: 'dimanche', heure_debut: '10:00', heure_fin: '11:00' },
    { praticien_id: 'sarah', jour_semaine: 'dimanche', heure_debut: '10:00', heure_fin: '11:00', frequence: 'mensuel', rang_mois: 1 },
  ]
  const absenceEmily = [{ praticien_id: 'emily', date_debut: '2026-11-01', date_fin: '2026-11-30' }]
  verifier('le 8/11, la séance n’a plus de prof (la plage de Sarah ne tombe pas)',
    seanceSansProfesseur(absenceEmily, plagesProfs, { dateStr: '2026-11-08', heure: '10:00' }) === true)
  verifier('le 1/11, Sarah est là : la séance a une prof',
    seanceSansProfesseur(absenceEmily, plagesProfs, { dateStr: '2026-11-01', heure: '10:00' }) === false)

  const rdvs = [
    { id: 'a', statut: 'confirme', date_rdv: '2026-11-01', heure_debut: '10:00' },
    { id: 'b', statut: 'confirme', date_rdv: '2026-11-08', heure_debut: '10:00' },
  ]
  const plageHebdo = { jour_semaine: 'dimanche', heure_debut: '10:00', heure_fin: '11:00' }
  const devenueMensuelle = { ...plageHebdo, frequence: 'mensuel', rang_mois: 1 }
  const gardes = new Set(rdvsSurLaPlage(rdvs, devenueMensuelle, { aujourdhui: '2026-10-18' }).map(r => r.id))
  const perdus = rdvsSurLaPlage(rdvs, plageHebdo, { aujourdhui: '2026-10-18' }).filter(r => !gardes.has(r.id))
  verifier('passer en mensuel : le rendez-vous du 8/11 est annoncé, celui du 1/11 non',
    perdus.map(r => r.id).join() === 'b', perdus.map(r => r.id).join())

  const serie = serieDeSeances('2026-11-01', { nombre: 5, aLieu: d => creneauTombeLe(devenueMensuelle, d) })
  // Cinq semaines après le 1er novembre : 8, 15, 22, 29 (sans cours), 6 décembre.
  verifier('la série d’un cours mensuel saute les dimanches sans cours, et le dit',
    serie.dates.join() === '2026-12-06' && serie.ecartees.length === 4 && serie.ecartees.every(e => e.raison === 'pas_de_cours'),
    JSON.stringify(serie))
  const serieLongue = serieDeSeances('2026-11-01', { nombre: 9, aLieu: d => creneauTombeLe(devenueMensuelle, d) })
  verifier('sur neuf semaines, elle pose les 1ers dimanches suivants',
    serieLongue.dates.join() === '2026-12-06,2027-01-03', serieLongue.dates.join())
  verifier('sans `aLieu`, la série d’avant', serieDeSeances('2026-11-01', { nombre: 3 }).dates.length === 3)
  verifier('la raison se lit', raisonSemaineEcartee('pas_de_cours') === 'pas de cours ce jour-là')
}

// ═══ 3. CHAQUE LECTEUR DE CRÉNEAUX LIT LA FRÉQUENCE ══════════════════════════
{
  const lecteurs = [
    ['lib/rdv-creation-server.js', 'COLONNES_FREQUENCE'],
    ['app/api/rdv/reserver/route.js', 'COLONNES_FREQUENCE'],
    ['lib/attente-rdv-server.js', 'COLONNES_FREQUENCE'],
    ['lib/equipe-poste.js', 'COLONNES_FREQUENCE'],
    ['app/dashboard/ConfigDashboard.js', 'COLONNES_FREQUENCE'],
  ]
  // ⚠️ DANS LE SELECT, PAS SEULEMENT IMPORTÉE : un import seul laisse la
  // garde verte et la colonne `undefined` (vu par le harnais le 18/10).
  for (const [f] of lecteurs) {
    const c = code(f)
    const dansSelect = /\.select\(`[^`]*\$\{COLONNES_FREQUENCE\}`\)/.test(c)
      || /COLONNES_CRENEAU_RDV_EQUIPE = `[^`]*\$\{COLONNES_FREQUENCE\}`/.test(c)
    verifier(`${f} charge la fréquence dans son select`, dansSelect)
  }
  verifier('la pause du serveur suit la règle commune', code('app/api/rdv/reserver/route.js').includes('creneauTombeLe(c, date_rdv, jourSem)'))
  verifier('les jours de la fiche suivent la règle commune',
    code('lib/rdv-slots.js').includes('creneauxDuJour(creneaux, { dateStr: isoDate(d), jour }).length > 0'))
  verifier('la pause de la fiche suit la règle commune',
    code('app/commander/rdv/[slug]/page.js').includes('creneauxDuJour(creneauxFiltres, { dateStr, jour: jourSem })'))
  verifier('l’agenda suit la règle commune',
    code('app/dashboard/AgendaRdv.js').includes('creneauxDuJour(creneaux, { dateStr: jour.iso, jour: jour.keyJour })'))
  verifier('la règle centrale lit la fréquence',
    code('lib/deplacement-rdv.js').includes('frequenceAccepte(c, dateStr)'))
  // Plus aucune copie de l'ancienne règle hebdomadaire (date précise OU jour).
  const copies = ['lib/rdv-slots.js', 'app/api/rdv/reserver/route.js', 'app/commander/rdv/[slug]/page.js', 'app/dashboard/AgendaRdv.js', 'lib/fermetures-rdv.js']
    .filter(f => /!c\.date_specifique && c\.jour_semaine ===/.test(code(f)) || /JOURS_PLAGE\[/.test(code(f)))
  verifier('aucune copie de l’ancienne règle ne reste', copies.length === 0, copies.join(', '))
  const bord = code('app/dashboard/ConfigDashboard.js')
  verifier('l’éditeur écrit la fréquence nettoyée', bord.includes('...freq.champs') && bord.includes('champsFrequence(form, form.jour_semaine)'))
  // ⚠️ LA LIGNE DE COPIE ENTIÈRE : `frequence: c.frequence || 'hebdo'` existe
  // aussi à l'ouverture d'un créneau (jumeau vu par le harnais le 18/10).
  verifier('la copie vers d’autres jours emporte la fréquence',
    /frequence: c\.frequence \|\| 'hebdo',\s*date_depart: c\.date_depart \|\| null,\s*rang_mois: c\.rang_mois \?\? null,\s*dates_choisies: null,/.test(bord))
  verifier('changer la fréquence annonce les rendez-vous qui ne tombent plus',
    bord.includes('if (perdus.length > 0 && !await confirme(confirmationSimple({') && bord.includes('ne tombent plus sur ce créneau'))
  verifier('la série du patron saute les semaines sans cours',
    code('app/dashboard/ModalNouveauRdv.js').includes('aLieu: plageCeJour(dateChoisie) ? (d) => !!plageCeJour(d) : null'))
}

// ═══ 4. LE TARIF DÉCOUVERTE ═════════════════════════════════════════════════
{
  // Une base factice : `rdv_cours_deja_suivi` répond ce qu'on lui dit, les
  // deals sont vides. On compte les appels.
  const base = (repond, { deals = [] } = {}) => {
    const appels = []
    return {
      appels,
      rpc: async (nom, args) => { appels.push({ nom, args }); return repond },
      from: () => ({ select: () => ({ or: () => ({ eq: () => ({ eq: async () => ({ data: deals, error: null }) }) }) }) }),
    }
  }
  const cours = { id: 'p1', commercant_id: 'c1', prix: 15, prix_decouverte: 10 }
  const client = { email: 'a@b.be', telephone: '0470 12 34 56' }

  const db1 = base({ data: false, error: null })
  const r1 = await prixPrestationServeur(db1, cours, '2026-10-20', { client })
  verifier('jamais suivi : 10 €, découverte', r1.prix === 10 && r1.decouverte === true, JSON.stringify(r1))
  verifier('la question va à la fonction réservée au serveur',
    db1.appels[0]?.nom === 'rdv_cours_deja_suivi' && db1.appels[0]?.args?.p_prestation_id === 'p1' && db1.appels[0]?.args?.p_email === 'a@b.be')

  const r2 = await prixPrestationServeur(base({ data: true, error: null }), cours, '2026-10-20', { client })
  verifier('déjà suivi : prix normal', r2.prix === 15 && r2.decouverte === false, JSON.stringify(r2))
  const r3 = await prixPrestationServeur(base({ data: null, error: { message: 'KO' } }), cours, '2026-10-20', { client })
  verifier('une lecture ratée ne brade rien', r3.prix === 15 && r3.decouverte === false)
  const db4 = base({ data: false, error: null })
  const r4 = await prixPrestationServeur(db4, cours, '2026-10-20')
  verifier('sans client, pas de découverte, et pas de question', r4.prix === 15 && r4.decouverte === false && db4.appels.length === 0)
  const r5 = await prixPrestationServeur(base({ data: false, error: null }), { ...cours, prix_decouverte: null }, '2026-10-20', { client })
  verifier('sans tarif découverte, prix normal', r5.prix === 15 && r5.decouverte === false)
  const r6 = await prixPrestationServeur(base({ data: false, error: null }), { ...cours, prix_decouverte: 0 }, '2026-10-20', { client })
  verifier('un tarif à 0 € est ignoré (l’éditeur le refuse)', r6.prix === 15 && r6.decouverte === false)
  const r7 = await prixPrestationServeur(base({ data: false, error: null }), { ...cours, prix_decouverte: 20 }, '2026-10-20', { client })
  verifier('un tarif découverte plus cher que le prix ne s’applique pas', r7.prix === 15 && r7.decouverte === false)
  const r8 = await prixPrestationServeur(base({ data: false, error: null }), { ...cours, par_couverts: true }, '2026-10-20', { client })
  verifier('une table n’a pas de prix, découverte ou pas', r8.prix === null && r8.decouverte === false)
  const deal = [{ id: 'd', deal_type: 'remise_pct', remise_pct: 50, prestation_id: 'p1', actif: true, date_debut: '2026-10-01', date_fin: '2026-10-31' }]
  const r9 = await prixPrestationServeur(base({ data: false, error: null }, { deals: deal }), cours, '2026-10-20', { client })
  verifier('un deal moins cher que la découverte gagne, sans cumul',
    r9.decouverte === false && r9.prix <= 10, JSON.stringify(r9))
  verifier('le téléphone seul suffit à poser la question',
    (await tarifDecouverte(base({ data: false, error: null }), cours, { telephone: '0470123456' })) === 10)

  for (const f of ['app/api/rdv/reserver/route.js', 'app/api/stripe/checkout/create-rdv-acompte/route.js', 'app/api/stripe/checkout/create-rdv-commande/route.js']) {
    const c = code(f)
    verifier(`${f} charge prix_decouverte`, /select\([^)]*prix_decouverte/.test(c))
    verifier(`${f} passe le client au calcul du prix`, /prixPrestationServeur\([^)]*\{\s*client:/.test(c))
  }
  verifier('le rendez-vous gratuit ou sur place porte le drapeau', code('app/api/rdv/reserver/route.js').includes('tarif_decouverte: decouverte === true'))
  verifier('le rendez-vous avec produits porte le drapeau', code('app/api/stripe/checkout/create-rdv-commande/route.js').includes('tarif_decouverte: decouverte === true'))
  verifier('le drapeau voyage par Stripe (acompte)', code('app/api/stripe/checkout/create-rdv-acompte/route.js').includes("tarif_decouverte: '1'"))
  verifier('le drapeau voyage par Stripe (avec produits)', code('app/api/stripe/checkout/create-rdv-commande/route.js').includes("tarif_decouverte: '1'"))
  verifier('le webhook le relit', code('app/api/stripe/webhook/route.js').includes("tarif_decouverte: meta.tarif_decouverte === '1'"))
  verifier('l’agenda montre la mention', code('app/dashboard/page.js').includes('rdv.tarif_decouverte === true'))
  verifier('la fiche l’annonce', code('app/commander/rdv/[slug]/page.js').includes('tarifDecouverteAffiche(p, deals) != null'))
  // ✅ 19/10 (Alex : « pas d'indication de la réduc sauf dans le mail »).
  const ficheD = code('app/commander/rdv/[slug]/page.js')
  verifier('la pastille dit « Séance découverte »', ficheD.includes('Séance découverte : {euros(tarifDecouverteAffiche(p, deals))}'))
  verifier('le récapitulatif annonce la séance découverte avant de confirmer',
    ficheD.includes('{!seanceSurAbo && tarifDecouverteAffiche(prestationChoisie, deals) != null && ('))
  verifier('la confirmation dit le prix retenu par le serveur',
    ficheD.includes('rdvCree.tarif_decouverte === true && rdvCree.prix_estime != null'))
  verifier('la route gratuite renvoie le drapeau à l’écran',
    code('app/api/rdv/reserver/route.js').includes('tarif_decouverte: !!decouverte,'))
  verifier('après un acompte, le drapeau et le prix remontent',
    /select\('[^']*prix_estime, tarif_decouverte'\)/.test(code('app/api/rdv/from-session/route.js'))
    && ficheD.includes('tarif_decouverte: j.rdv.tarif_decouverte === true'))
  verifier('l’éditeur refuse un tarif découverte qui n’est pas plus bas', code('app/dashboard/ConfigDashboard.js').includes('!(d > 0) || !(d < Number(form.prix))'))
  verifier('la copie d’une prestation emporte son tarif découverte',
    copieDePrestation({ nom: 'Pilates', prix: 15, prix_decouverte: 10 }, { commercantId: 'c' })?.prix_decouverte === 10)
}

// ═══ 5. LA FORMULE AFFICHÉE, À PRENDRE CHEZ LE COMMERÇANT ════════════════════
{
  const f = { id: 'f', type: 'periode', prix: 215, seances_par_semaine: 1, date_debut: '2026-09-14', date_fin: '2027-01-31', actif: true }
  verifier('affichée : visible', formuleAfficheeSurFiche({ ...f, affichee_fiche: true }, { aujourdhui: '2026-10-18' }) === true)
  verifier('affichée : jamais vendable en ligne', formuleVendableEnLigne({ ...f, affichee_fiche: true }, { aujourdhui: '2026-10-18' }) === false)
  verifier('seulement par toi : invisible', formuleAfficheeSurFiche({ ...f }, { aujourdhui: '2026-10-18' }) === false)
  verifier('plus proposée : invisible', formuleAfficheeSurFiche({ ...f, affichee_fiche: true, actif: false }, { aujourdhui: '2026-10-18' }) === false)
  verifier('période finie : invisible', formuleAfficheeSurFiche({ ...f, affichee_fiche: true }, { aujourdhui: '2027-02-15' }) === false)
  verifier('en vente : passe par l’autre règle', formuleAfficheeSurFiche({ ...f, affichee_fiche: true, vente_en_ligne: true }) === false)

  const bloc = code('app/commander/rdv/[slug]/BlocAbonnements.js')
  verifier('pas de bouton d’achat sur une formule affichée', bloc.includes("f.vente_en_ligne !== true ?") && bloc.includes('sur place ou par téléphone'))
  verifier('la vente en ligne exige toujours un compte qui encaisse', bloc.includes('f?.vente_en_ligne === true ? venteEnLigne'))
  const fiche = code('app/commander/rdv/[slug]/page.js')
  verifier('la fiche lit les formules affichées', fiche.includes("or('vente_en_ligne.eq.true,affichee_fiche.eq.true')") && fiche.includes('affichee_fiche, deleted_at'))
  const bord = code('app/dashboard/ConfigDashboard.js')
  verifier('l’éditeur écrit les deux, jamais ensemble', bord.includes('affichee_fiche: !!form.actif && !form.vente_en_ligne && !!form.affichee_fiche'))
  verifier('le 4e choix existe', bord.includes("option('affichee', 'Sur ta fiche, à prendre chez toi'"))
}

// ═══ 6. LA MIGRATION ════════════════════════════════════════════════════════
{
  const sql = readFileSync(new URL('../migrations/MIGRATION_DECOUVERTE_FREQUENCE_FORMULES_18_10.sql', import.meta.url), 'utf8')
  verifier('la question « déjà suivi » est fermée au navigateur', /REVOKE ALL ON FUNCTION public\.rdv_cours_deja_suivi\(uuid, text, text\) FROM PUBLIC, anon, authenticated/.test(sql))
  verifier('la lecture publique des formules exige l’une des deux', sql.includes('(vente_en_ligne IS TRUE OR affichee_fiche IS TRUE)'))
  verifier('le drapeau découverte est gelé pour la cliente', sql.includes("'''prix_estime'', ''tarif_decouverte'', '"))
}

console.log(`\nverif:frequence — ${ok} OK, ${ko} KO`)
if (ko) { for (const e of echecs) console.log('  ✗ ' + e); process.exit(1) }
