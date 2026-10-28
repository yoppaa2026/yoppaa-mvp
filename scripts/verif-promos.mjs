// Banc du MODULE PROMO (28/10).
//
// 🔴 CE QU'IL GARDE : qu'une promo SE VOIE. Alex, 28/10, sur le site d'essai :
// « les promos passent, mais elles ne sont visibles nulle part ». Le prix
// suivait le jour choisi, l'affichage suivait aujourd'hui.
//
// ⚠️ TOUT S'EXÉCUTE pour `lib/promos-visibles.js` (module pur). Les gardes de
// code vérifient seulement que les fiches APPELLENT ce module avec le jour
// choisi.
//
//   npm run verif:promos

import { readFileSync } from 'node:fs'
import {
  momentDuDeal, promosAVenir, promoAVenirPourArticle, promoAVenirPourPrestation,
  economieDesLignesCents, accrocheDuDeal, fenetreDuDeal, ajouterJoursISO, nomDuJour,
} from '../lib/promos-visibles.js'
import { sansProse } from './lire-code.mjs'

const lireCode = (chemin) => sansProse(readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8'))

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}
const egal = (nom, a, b) => verifier(nom, JSON.stringify(a) === JSON.stringify(b),
  `obtenu ${JSON.stringify(a)}, attendu ${JSON.stringify(b)}`)

// Le lundi 2 novembre 2026.
const LUNDI = '2026-11-02'
const jour = (n) => ajouterJoursISO(LUNDI, n)
const ponctuel = (n, extra = {}) => ({ id: `p${n}`, titre: `Promo ${n}`, deal_type: 'remise_pct', remise_pct: 20, actif: true, date_deal: jour(n), ...extra })
const periode = (a, b, extra = {}) => ({ id: `r${a}-${b}`, titre: 'Période', deal_type: 'remise_pct', remise_pct: 10, actif: true, date_debut: `${jour(a)}T00:00:00`, date_fin: `${jour(b)}T23:59:59`, ...extra })

// ─── 1. LE MOMENT, DIT COMME AU COMPTOIR ─────────────────────────────────
egal('ajouter des jours traverse le mois', ajouterJoursISO('2026-10-30', 3), '2026-11-02')
egal('le nom du jour', nomDuJour(LUNDI), 'lundi')
egal('aujourd’hui', momentDuDeal(ponctuel(0), LUNDI), "Aujourd'hui")
egal('demain', momentDuDeal(ponctuel(1), LUNDI), 'Demain')
egal('dans la semaine : le jour', momentDuDeal(ponctuel(2), LUNDI), 'Mercredi')
egal('au-delà d’une semaine : la date', momentDuDeal(ponctuel(10), LUNDI), 'Le 12 nov.')
egal('en cours jusqu’à un jour de la semaine', momentDuDeal(periode(-2, 4), LUNDI), "Jusqu'à vendredi")
egal('en cours jusqu’à une date', momentDuDeal(periode(-2, 12), LUNDI), "Jusqu'au 14 nov.")
egal('une période qui commence demain', momentDuDeal(periode(1, 4), LUNDI), "Dès demain, jusqu'à vendredi")
egal('une période plus tard, dans le même mois', momentDuDeal(periode(3, 6), LUNDI), 'Du 5 au 8 nov.')
egal('une période à cheval sur deux mois', momentDuDeal({ actif: true, date_debut: '2026-11-28', date_fin: '2026-12-02' }, LUNDI), 'Du 28 nov. au 2 déc.')
egal('🔴 une promo passée n’a pas de moment', momentDuDeal(ponctuel(-1), LUNDI), null)
egal('la fenêtre lit les deux formats', [fenetreDuDeal(ponctuel(1)), fenetreDuDeal(periode(1, 2))],
  [{ debut: jour(1), fin: jour(1) }, { debut: jour(1), fin: jour(2) }])

// ─── 2. LA SECTION « PROMOS » ────────────────────────────────────────────
{
  const deals = [ponctuel(3), ponctuel(0), periode(-1, 2), ponctuel(20), ponctuel(-3),
    ponctuel(1, { actif: false }), ponctuel(1, { id: 'inv', heure_debut: '17:00', heure_fin: '19:00' })]
  const liste = promosAVenir(deals, LUNDI)
  egal('🔴 en cours et à venir sur 14 jours, triées, sans les passées, éteintes ni invendus',
    liste.map(p => p.deal.id), ['r-1-2', 'p0', 'p3'])
  egal('chacune dit si elle est en cours et son premier jour utile',
    liste.map(p => [p.enCours, p.premierJour]), [[true, LUNDI], [true, LUNDI], [false, jour(3)]])
  egal('l’appelant peut écarter ce que sa fiche ne vend pas',
    promosAVenir(deals, LUNDI, { garder: d => d.id !== 'p0' }).map(p => p.deal.id), ['r-1-2', 'p3'])
  egal('sans jour, rien', promosAVenir(deals, null), [])
}

// ─── 3. LA PASTILLE SUR L'ARTICLE ET LA PRESTATION ───────────────────────
{
  const PAIN = { id: 'pain', categorie: 'Pains', prix: 4 }
  const mercredi = ponctuel(2, { article_id: 'pain' })
  egal('🔴 un lundi, la promo du mercredi se dit sur l’article',
    promoAVenirPourArticle(PAIN, [mercredi], LUNDI, LUNDI)?.moment, 'Mercredi')
  egal('🔴 le mercredi choisi, plus de pastille : le prix barré le dit',
    promoAVenirPourArticle(PAIN, [mercredi], jour(2), LUNDI), null)
  egal('🔴 le mercredi choisi, plus de pastille : même si une autre promo vient vendredi',
    promoAVenirPourArticle(PAIN, [mercredi, ponctuel(4, { article_id: 'pain' })], jour(2), LUNDI), null)
  egal('une promo d’un autre article ne s’affiche pas',
    promoAVenirPourArticle({ id: 'autre', prix: 2 }, [mercredi], LUNDI, LUNDI), null)
  egal('la catégorie compte aussi',
    promoAVenirPourArticle(PAIN, [ponctuel(1, { categorie_cible: 'Pains' })], LUNDI, LUNDI)?.moment, 'Demain')
  const SOIN = { id: 'soin', prix: 50 }
  egal('🔴 la prestation aussi : « Demain »',
    promoAVenirPourPrestation(SOIN, [ponctuel(1, { prestation_id: 'soin' })], LUNDI, LUNDI)?.moment, 'Demain')
  egal('et pas le jour même du rendez-vous',
    promoAVenirPourPrestation(SOIN, [ponctuel(1, { prestation_id: 'soin' })], jour(1), LUNDI), null)
  egal('l’accroche : pourcentage, prix promo, offre',
    [accrocheDuDeal({ deal_type: 'remise_pct', remise_pct: 20 }), accrocheDuDeal({ deal_type: 'prix_fixe' }), accrocheDuDeal({ deal_type: 'lot', titre: 'Lot de 3' })],
    ['-20 %', 'Prix promo', 'Offre'])
}

// ─── 4. CE QUE LE CLIENT ÉCONOMISE ───────────────────────────────────────
egal('🔴 l’économie en centimes, quantité comprise',
  economieDesLignesCents([{ prix_plein: 12.9, prix_unitaire: 10.32, quantite: 2 }, { prix_plein: null, prix_unitaire: 3, quantite: 1 }]), 516)
egal('jamais négative, jamais sur une ligne sans prix plein',
  economieDesLignesCents([{ prix_plein: 2, prix_unitaire: 3, quantite: 1 }, { prix_unitaire: 3, quantite: 1 }]), 0)
egal('rien, rien', economieDesLignesCents(null), 0)

// ─── 5. LES FICHES APPELLENT LE MODULE, AU JOUR CHOISI ───────────────────
{
  const F = lireCode('app/commander/[slug]/page.js')
  verifier('🔴 la fiche boutique juge ses deals au jour choisi',
    /const jourDesPromos = dateDeLaCommande\(\)/.test(F)
    && /const dealsDuJourChoisi = \(dealsTous \|\| \[\]\)\.filter\(d => dealActifCeJour\(d, jourDesPromos\)\)/.test(F))
  verifier('🔴 plus aucune remise affichée sur la liste d’aujourd’hui',
    !/remiseSurArticle\([^()]*, dealsActifs\)/.test(F) && !/offresSepareesPourArticle\(a, dealsActifs\)/.test(F))
  verifier('🔴 et toujours AVEC le jour (sinon `lib/deals.js` refiltre sur aujourd’hui)',
    (F.match(/remiseSurArticle\(\w+, dealsDuJourChoisi, jourDesPromos\)/g) || []).length >= 6)
  verifier('le bandeau suit le jour choisi', /dealVedette && \(\(\) => \{ const dealActif = dealVedette;/.test(F))
  verifier('la section « Promos » s’affiche', /\{promosDeLaFiche\.length > 0 && \(/.test(F) && />Promos<\/p>/.test(F))
  verifier('🔴 la pastille « -20 % mercredi » est passée aux articles',
    (F.match(/promoAVenir=\{promoAVenirPourArticle\(a, dealsTous, jourDesPromos, aujourdhuiPromos\)\}/g) || []).length >= 3)
  verifier('🔴 une offre ne s’achète qu’au jour choisi', /if \(!dealActifCeJour\(deal, jourDesPromos\)\) return false/.test(F))
  verifier('🔴 le récapitulatif dit l’économie', /Tu économises \{euros\(economiePanier\(\)\)\}/.test(F))
  const R = lireCode('app/commander/rdv/[slug]/page.js')
  verifier('🔴 la fiche RDV annonce les promos à venir',
    // ⚠️ REPOINTÉE (lot 2) : la liste COMPLÈTE, l'heure choisie ne cache rien ici.
    /const promosAVenirFiche = promosAVenir\(dealsActifsTous, aujourdhuiPromos\)\.filter\(p => !p\.enCours\)/.test(R)
    && /\{etape === 1 && promosAVenirFiche\.length > 0 && \(/.test(R))
  verifier('🔴 la pastille sur la prestation', /promoAVenirPourPrestation\(p, dealsActifs, jourPrix, aujourdhuiPromos\)/.test(R))
  verifier('🔴 le récapitulatif RDV dit l’économie', /Tu économises \{euros\(Number\(r\.prixBarre\) - Number\(r\.prix\)\)\}/.test(R))
}

// ─── 6. LES EMAILS ET LE TABLEAU DE BORD (28/10, Alex : « prix barré + économie ») ─
{
  const { emailCommandeConfirmee, emailNouvelleCommandeCommercant } = await import('../lib/resend.js')
  const lignes = [
    { nom: 'Boucles d’oreille', quantite: 1, prix_total: 10.32, prix_plein_total: 12.9 },
    { nom: 'Donut', quantite: 2, prix_total: 5, prix_plein_total: null },
  ]
  const client = emailCommandeConfirmee({
    yopper_prenom: 'Alex', commercant_nom: 'Le Dressing', numero_commande: 'P1', articles: lignes,
    total: 15.32, economie_promo: 2.58, date_retrait: '2026-11-04', mode_retrait: 'retrait_boutique', commercant_categorie: 'detail',
  })
  verifier('🔴 l’email client barre le prix plein de la ligne en promo',
    /text-decoration:line-through[^>]*>12,90[\s ]€/.test(client))
  verifier('et seulement elle', (client.match(/text-decoration:line-through/g) || []).length === 1)
  verifier('🔴 l’email client dit ce qu’il a économisé', /Tu as économisé 2,58[\s ]€ grâce à la promo/.test(client))
  const sans = emailCommandeConfirmee({
    yopper_prenom: 'Alex', commercant_nom: 'Le Dressing', numero_commande: 'P2', articles: [lignes[1]],
    total: 5, date_retrait: '2026-11-04', mode_retrait: 'retrait_boutique',
  })
  verifier('sans promo, l’email ne parle ni de prix barré ni d’économie',
    !/line-through/.test(sans) && !/économisé/.test(sans))
  const commercant = emailNouvelleCommandeCommercant({
    nom_commercant: 'Le Dressing', yopper_prenom: 'Alex', numero_commande: 'P1', articles: lignes,
    total: 15.32, economie_promo: 2.58, date_retrait: '2026-11-04',
  })
  verifier('🔴 l’email commerçant dit ce que la promo a offert', /Dont 2,58[\s ]€ offerts en promo/.test(commercant))
  const notifs = lireCode('lib/commande-notifs.js')
  verifier('🔴 les notifications lisent le prix plein en base',
    /articles:commande_articles\([^)]*\bprix_plein\b/.test(notifs))
  verifier('et passent l’économie aux deux emails',
    (notifs.match(/economie_promo:\s+economieDesLignesCents\(cmd\.articles\) \/ 100,/g) || []).length === 2)
  verifier('🔴 le tableau de bord dit « Promo · X offerts » sur la ligne',
    /Number\(ligne\.prix_plein\) > Number\(ligne\.prix_unitaire\) && \(/.test(lireCode('app/dashboard/page.js')))
}

// ─── 7. LA TRACE SUR LE RENDEZ-VOUS (28/10, lot 1c, Salon Nathalie) ──────
{
  const { traceRdv, metaTraceRdv } = await import('../lib/prix-prestation-server.js')
  const remise = { deal: { id: 'd9' }, prix: 40, prixBarre: 50 }
  egal('🔴 un rendez-vous remisé garde son prix plein et sa promo', traceRdv(remise), { prix_plein: 50, promo_deal_id: 'd9' })
  egal('sans remise (ou au tarif découverte), rien', traceRdv(null), { prix_plein: null, promo_deal_id: null })
  egal('une « remise » qui ne baisse rien n’est pas une promo', traceRdv({ deal: { id: 'x' }, prix: 50, prixBarre: 50 }), { prix_plein: null, promo_deal_id: null })
  egal('les métadonnées Stripe : des chaînes, et aucune clé sans promo',
    [metaTraceRdv(remise), metaTraceRdv(null)], [{ prix_plein: '50', promo_deal_id: 'd9' }, {}])
  const reserver = lireCode('app/api/rdv/reserver/route.js')
  verifier('🔴 la réservation directe écrit la trace (les deux insertions)',
    (reserver.match(/\.\.\.traceRdv\(remiseRdv\),/g) || []).length === 2
    && /const \{ prix: prixBase, decouverte, remise: remiseRdv \} = await prixPrestationServeur\(/.test(reserver))
  const tunnel = lireCode('app/api/stripe/checkout/create-rdv-commande/route.js')
  verifier('🔴 le tunnel avec produits l’écrit, et l’envoie au webhook',
    /\.\.\.traceRdv\(remiseRdv\),/.test(tunnel) && /\.\.\.metaTraceRdv\(remiseRdv\),/.test(tunnel))
  verifier('🔴 l’acompte l’envoie au webhook',
    /\.\.\.metaTraceRdv\(remiseRdv\),/.test(lireCode('app/api/stripe/checkout/create-rdv-acompte/route.js')))
  const webhook = lireCode('app/api/stripe/webhook/route.js')
  verifier('🔴 le webhook la relit dans les métadonnées',
    /prix_plein: Number\(meta\.prix_plein\) > 0 \? Number\(meta\.prix_plein\) : null,/.test(webhook) && /promo_deal_id: meta\.promo_deal_id \|\| null,/.test(webhook))
  verifier('🔴 les deux chemins d’email la lisent et la passent',
    /prix_estime, prix_plein, acompte_paye/.test(lireCode('app/api/emails/rdv-confirme/route.js'))
    && /duree_minutes, prix_estime, prix_plein,/.test(webhook)
    && (webhook.match(/prix_plein:\s+rdv\.abonnement_id \? null : \(rdv\.prix_plein \?\? null\),/g) || []).length === 2)
  const { emailRdvConfirme, emailNouveauRdvCommercant } = await import('../lib/resend.js')
  const base = { yopper_prenom: 'Alex', commercant_nom: 'Salon Nathalie', nom_commercant: 'Salon Nathalie', prestation_nom: 'Soin visage', date_rdv: '2026-11-04', heure_debut: '10:00', heure_fin: '11:00', duree_minutes: 60, prix_estime: 40 }
  const mailRdv = emailRdvConfirme({ ...base, prix_plein: 50 })
  verifier('🔴 l’email RDV barre le prix plein et dit l’économie',
    /text-decoration:line-through[^>]*>50,00[\s ]€/.test(mailRdv) && /Tu as économisé 10,00[\s ]€ grâce à la promo/.test(mailRdv))
  verifier('sans promo, l’email RDV n’en parle pas', !/économisé/.test(emailRdvConfirme(base)))
  verifier('🔴 l’email du commerçant dit ce qu’il a offert',
    /Dont 10,00[\s ]€ offerts en promo/.test(emailNouveauRdvCommercant({ ...base, prix_plein: 50 })))
}

// ─── 8. LA RÉCURRENCE (lot 2) : EXÉCUTÉE ─────────────────────────────────
{
  const R = await import('../lib/recurrence-promo.js')
  // Novembre 2026 : le dimanche 1er, donc les samedis 7, 14, 21, 28.
  const mercredis = { recurrence: 'hebdo', jours_semaine: [3], date_debut: '2026-11-01' }
  verifier('🔴 « chaque mercredi » revient le mercredi', R.recurrenceAccepte(mercredis, '2026-11-04') && R.recurrenceAccepte(mercredis, '2026-11-11'))
  verifier('et pas le jeudi', !R.recurrenceAccepte(mercredis, '2026-11-05'))
  verifier('ni avant son début', !R.recurrenceAccepte({ ...mercredis, date_debut: '2026-11-05' }, '2026-11-04'))
  verifier('ni après sa fin', !R.recurrenceAccepte({ ...mercredis, date_fin: '2026-11-10' }, '2026-11-11'))
  verifier('sans fin, elle revient toujours', R.recurrenceAccepte(mercredis, '2027-06-02'))
  const premierSamedi = { recurrence: 'mensuel', rang_mois: 1, jour_semaine_mois: 6, date_debut: '2026-11-01' }
  verifier('🔴 « le 1er samedi du mois » : le 7 novembre, pas le 14',
    R.recurrenceAccepte(premierSamedi, '2026-11-07') && !R.recurrenceAccepte(premierSamedi, '2026-11-14'))
  verifier('et le 5 décembre', R.recurrenceAccepte(premierSamedi, '2026-12-05'))
  const dernierSamedi = { recurrence: 'mensuel', rang_mois: -1, jour_semaine_mois: 6, date_debut: '2026-11-01' }
  verifier('🔴 « le dernier samedi » : le 28 novembre, pas le 21',
    R.recurrenceAccepte(dernierSamedi, '2026-11-28') && !R.recurrenceAccepte(dernierSamedi, '2026-11-21'))
  const tous3 = { recurrence: 'intervalle', intervalle_jours: 3, date_debut: '2026-11-01' }
  verifier('🔴 « tous les 3 jours » depuis le début', R.recurrenceAccepte(tous3, '2026-11-01') && R.recurrenceAccepte(tous3, '2026-11-04') && !R.recurrenceAccepte(tous3, '2026-11-05'))
  verifier('une promo sans récurrence n’est pas jugée ici', !R.recurrenceAccepte({ date_debut: '2026-11-01', date_fin: '2026-11-30' }, '2026-11-04'))
  egal('les rythmes dits comme au comptoir', [
    R.libelleRecurrence(mercredis),
    R.libelleRecurrence({ recurrence: 'hebdo', jours_semaine: [6, 3, 0] }),
    R.libelleRecurrence(premierSamedi),
    R.libelleRecurrence(dernierSamedi),
    R.libelleRecurrence(tous3),
    R.libelleRecurrence({ recurrence: 'hebdo', jours_semaine: [0, 1, 2, 3, 4, 5, 6] }),
  ], ['Chaque mercredi', 'Chaque mercredi, samedi et dimanche', 'Le 1er samedi du mois', 'Le dernier samedi du mois', 'Tous les 3 jours', 'Tous les jours'])
  egal('les trois prochaines fois', R.prochainsJours(premierSamedi, '2026-11-02'), ['2026-11-07', '2026-12-05', '2027-01-02'])
  verifier('🔴 la plage horaire se juge à l’heure du retrait',
    R.plageAccepte({ plage_debut: '11:00', plage_fin: '14:00' }, '12:30') && !R.plageAccepte({ plage_debut: '11:00', plage_fin: '14:00' }, '14:00'))
  verifier('sans heure connue, c’est le jour qui décide', R.plageAccepte({ plage_debut: '11:00', plage_fin: '14:00' }, null))
  egal('la plage dite', R.libellePlage({ plage_debut: '11:30:00', plage_fin: '14:00:00' }), '11 h 30 à 14 h')
  egal('le formulaire refuse ce qui ne tient pas', [
    R.refusRecurrence({ recurrence: 'hebdo', jours_semaine: [] }),
    R.refusRecurrence({ recurrence: 'mensuel', rang_mois: 5, jour_semaine_mois: 6 }),
    R.refusRecurrence({ recurrence: 'intervalle', intervalle_jours: 0 }),
    R.refusRecurrence({ recurrence: 'hebdo', jours_semaine: [3], plage_debut: '14:00', plage_fin: '11:00' }),
    R.refusRecurrence({ recurrence: 'hebdo', jours_semaine: [3], plage_debut: '11:00', plage_fin: '14:00' }),
  ], ['Coche au moins un jour de la semaine.', 'Choisis le 1er, 2e, 3e, 4e ou dernier jour du mois.', 'Indique tous les combien de jours (1 à 365).', 'L’heure de fin doit venir après l’heure de début.', null])
}

// ─── 9. LA RÉCURRENCE BRANCHÉE (lot 2) ──────────────────────────────────
{
  const { dealActifCeJour, dealActifA } = await import('../lib/deals.js')
  const mercredi = { id: 'm', actif: true, deal_type: 'remise_pct', remise_pct: 20, article_id: 'pain', recurrence: 'hebdo', jours_semaine: [3], date_debut: '2026-11-01', plage_debut: '11:00', plage_fin: '14:00' }
  verifier('🔴 LA règle commune connaît la récurrence', dealActifCeJour(mercredi, '2026-11-04') && !dealActifCeJour(mercredi, '2026-11-05'))
  verifier('🔴 et la plage horaire, à l’heure du retrait',
    dealActifA(mercredi, '2026-11-04', '12:00') && !dealActifA(mercredi, '2026-11-04', '15:00') && dealActifA(mercredi, '2026-11-04', null))
  egal('🔴 la section dit le rythme et la plage', momentDuDeal(mercredi, LUNDI), 'Chaque mercredi · 11 h à 14 h')
  egal('🔴 la promo récurrente entre dans la section, à sa prochaine fois',
    promosAVenir([mercredi], LUNDI).map(p => [p.premierJour, p.enCours]), [['2026-11-04', false]])
  egal('🔴 la pastille la dit sur l’article un lundi', promoAVenirPourArticle({ id: 'pain', prix: 4 }, [mercredi], LUNDI, LUNDI)?.moment, 'Chaque mercredi · 11 h à 14 h')
  egal('une promo à dates avec une plage la dit aussi', momentDuDeal({ ...ponctuel(1), plage_debut: '11:00', plage_fin: '14:00' }, LUNDI), 'Demain · 11 h à 14 h')
  const { construireLignesCommande } = await import('../lib/lignes-commande.js')
  const calc = (heure) => construireLignesCommande({
    panier: [{ id: 'pain', quantite: 1 }], articlesData: [{ id: 'pain', nom: 'Pain', prix: 4 }], dealsData: [mercredi],
    commercant: { id: 'c' }, dateCommande: '2026-11-04', heureRetrait: heure,
  })
  egal('🔴 le calcul applique la promo dans la plage', calc('12:00').lignes?.[0]?.prix_unitaire, 3.2)
  egal('🔴 et pas en dehors', calc('15:00').lignes?.[0]?.prix_unitaire, 4)
  const L = lireCode('lib/lignes-commande.js')
  verifier('🔴 les deals se lisent AVEC la récurrence', /export const SELECT_DEALS = `[^`]*\$\{COLONNES_RECURRENCE\}`/.test(L))
  verifier('🔴 le prix des prestations aussi', /\$\{COLONNES_RECURRENCE\}`\)/.test(lireCode('lib/prix-prestation-server.js')))
  verifier('🔴 et la liste des commerces', /est_bonne_affaire, \$\{COLONNES_RECURRENCE\}`\)/.test(lireCode('app/commander/page.js')))
  verifier('🔴 la commande passe l’heure du créneau',
    /heureRetrait: creneau\?\.heure_debut \? String\(creneau\.heure_debut\)\.slice\(0, 5\) : null,/.test(lireCode('app/api/stripe/checkout/create-commande/route.js')))
  verifier('🔴 le panier aussi', /heureRetrait: heureDuCreneauChoisi\(\),/.test(lireCode('app/commander/[slug]/page.js')))
  for (const r of ['app/api/rdv/reserver/route.js', 'app/api/stripe/checkout/create-rdv-acompte/route.js', 'app/api/stripe/checkout/create-rdv-commande/route.js']) {
    verifier(`🔴 ${r} juge la plage à l’heure du RDV`, /heure: String\(heure(_debut)?\)\.slice\(0, 5\),/.test(lireCode(r)))
  }
  verifier('🔴 la fiche RDV filtre les deals par l’heure choisie',
    /const dealsActifs = dealsActifsTous\.filter\(d => plageAccepte\(d, heureChoisie \|\| null\)\)/.test(lireCode('app/commander/rdv/[slug]/page.js')))
}

// ─── 10. LE FORMULAIRE DU COMMERÇANT (lot 2) ────────────────────────────
{
  const C = lireCode('app/dashboard/ConfigDashboard.js')
  verifier('🔴 les heures ne sont plus collées dans les dates',
    /const dateDebut = `\$\{dDebut\}T00:00:00`/.test(C) && !/T\$\{form\.heure_debut/.test(C))
  verifier('🔴 elles partent en plage horaire', /plage_debut: avecPlage \? hD : null,/.test(C) && /plage_fin: avecPlage \? hF : null,/.test(C))
  verifier('🔴 la récurrence part avec la promo, contrôlée avant', /\.\.\.champsRec,/.test(C) && /const refus = refusRecurrence\(/.test(C))
  verifier('une promo récurrente peut n’avoir pas de fin', /const dateFin\s+= recurrente && form\.sans_fin \? null : `\$\{dFin\}T23:59:59`/.test(C))
  verifier('le commerçant voit « Répéter » et ce que liront ses clients', />Répéter<\/label>/.test(C) && /Tes clients liront :/.test(C))
  verifier('🔴 rouvrir une promo relit sa plage et sa récurrence',
    /const hDebut = d\.plage_debut \?/.test(C) && /recurrence: d\.recurrence \|\| '',/.test(C))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Les promos se voient : vert.')
