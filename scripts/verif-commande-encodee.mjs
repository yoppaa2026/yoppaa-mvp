// BANC — LA COMMANDE ENCODÉE À LA MAIN (Alex, 10/10, « version express »)
//
// Ce qui est décidé et que ce banc tient :
//   - même créneau, même stock, même prix que la commande en ligne ;
//   - créneau plein, stock court, délai dépassé, hors zone : on PRÉVIENT,
//     puis on laisse encoder d'un second geste ;
//   - patron + équipe avec la case « Commandes » ;
//   - nom obligatoire, téléphone et e-mail facultatifs ;
//   - `paye_en_ligne` toujours faux, aucun frais Stripe ;
//   - l'e-mail au client est une confirmation, à la demande ; jamais l'e-mail
//     « Nouvelle commande » au commerçant, ni la sonnerie de son écran.
//
// ⚠️ ON EXÉCUTE LA RÈGLE, ET ON VISE L'ENDROIT DANS LE CODE (jamais un mot).
//
//   npm run verif:encodee

import { readFileSync } from 'node:fs'
import { creneauRetraitHorsHoraires, messageHorsHoraires } from '../lib/ouverture.js'
import { sansProse } from './lire-code.mjs'
import {
  ORIGINE_COMMERCANT, PAIEMENTS_ENCODEE, clientEncode, champsPaiementEncodee,
  avertissement, confirmationRequise, jugementMoment, nombreArriveesEnLigne, creneauTermine, articleHorsJour, etatTuile, joursDuCalendrier, horsCalendrier,
} from '../lib/commande-encodee.js'

let ok = 0
const echecs = []
const v = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const code = (f) => sansProse(lire(f))
// « a AVANT b » exige que les DEUX existent : -1 est « avant » tout.
const avant = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); return i >= 0 && j >= 0 && i < j }
const MAINTENANT = new Date('2026-10-10T09:30:00Z')

// ═══ 1) LA RÈGLE, EXÉCUTÉE ══════════════════════════════════════════════════
{
  const c1 = clientEncode({ nom: '  Mario   Rossi ', telephone: '0471 23 45 67', email: ' Mario@Exemple.BE ' })
  v('🔴 le nom seul suffit, les espaces sont nettoyés',
    clientEncode({ nom: 'Lu' }).ok && c1.ok && c1.client.client_nom === 'Mario Rossi')
  v('l’e-mail est mis en minuscules, le téléphone gardé tel quel',
    c1.client.client_email === 'mario@exemple.be' && c1.client.client_telephone === '0471 23 45 67')
  v('sans téléphone ni e-mail : null, jamais une chaîne vide',
    clientEncode({ nom: 'Lucie' }).client.client_telephone === null && clientEncode({ nom: 'Lucie' }).client.client_email === null)
  v('🔴 pas de nom : refus', !clientEncode({ nom: ' ' }).ok && !clientEncode({}).ok)
  v('un e-mail faux ou un téléphone tronqué : refus lisible',
    !clientEncode({ nom: 'Lucie', email: 'lucie@' }).ok && !clientEncode({ nom: 'Lucie', telephone: '0471' }).ok)

  const p0 = champsPaiementEncodee({ paiement: 'a_payer', total: 12.5, maintenant: MAINTENANT })
  const p1 = champsPaiementEncodee({ paiement: 'especes', total: 12.499, maintenant: MAINTENANT })
  const p2 = champsPaiementEncodee({ paiement: 'terminal', total: 30, maintenant: MAINTENANT })
  v('🔴 paye_en_ligne reste FAUX dans les trois cas (Stripe n’a rien vu)',
    [p0, p1, p2].every(p => p.ok && p.champs.paye_en_ligne === false))
  v('🔴 « à payer au retrait » n’écrit aucun encaissement',
    p0.champs.encaisse_mode === null && p0.champs.encaisse_montant === null && p0.champs.encaisse_le === null)
  v('🔴 « payé » écrit le mode, le montant arrondi et l’heure',
    p1.champs.encaisse_mode === 'especes' && p1.champs.encaisse_montant === 12.5 && p1.champs.encaisse_le === MAINTENANT.toISOString()
    && p2.champs.encaisse_mode === 'terminal')
  v('🔴 aucun mode que la base refuserait (pas de virement)',
    PAIEMENTS_ENCODEE.filter(p => p !== 'a_payer').every(p => ['terminal', 'especes'].includes(p)))
  v('un paiement non dit : refus', !champsPaiementEncodee({ paiement: null, total: 10 }).ok && !champsPaiementEncodee({ paiement: 'virement', total: 10 }).ok)

  const plein = avertissement('creneau_plein')
  const stockA = avertissement('stock:a1', 'Plus que 2.')
  v('un avertissement dit le fait en une phrase', plein.code === 'creneau_plein' && /plein/.test(plein.message))
  v('🔴 un avertissement d’article garde son code, et le texte de sa famille',
    stockA.code === 'stock:a1' && stockA.message === 'Le stock ne suffit pas. Plus que 2.')
  v('🔴 pas d’avertissement : on écrit sans demander', !confirmationRequise([], []))
  v('🔴 un avertissement non confirmé : on demande', confirmationRequise([plein], []))
  v('🔴 confirmé : on écrit', !confirmationRequise([plein, stockA], ['creneau_plein', 'stock:a1']))
  v('🔴 un NOUVEL avertissement apparu entre les deux clics redemande',
    confirmationRequise([plein, avertissement('stock:b2')], ['creneau_plein', 'stock:a1']))
  v('confirmer un article ne confirme pas l’autre', confirmationRequise([avertissement('stock:b2')], ['stock:a1']))

  const auj = '2026-10-10'
  v('🔴 une date passée est refusée', !!jugementMoment({ verdict: { ok: true }, dateCommande: '2026-10-09', aujourdhui: auj }).refus)
  v('🔴 un créneau d’un autre jour de semaine est refusé',
    !!jugementMoment({ verdict: { ok: false, raison: 'jour' }, dateCommande: auj, aujourdhui: auj }).refus)
  v('🔴 créneau commencé ou délai dépassé : avertissement, pas refus',
    jugementMoment({ verdict: { ok: false, raison: 'passe' }, dateCommande: auj, aujourdhui: auj }).avertissement?.code === 'creneau_commence'
    && jugementMoment({ verdict: { ok: false, raison: 'cutoff' }, dateCommande: auj, aujourdhui: auj }).avertissement?.code === 'delai_depasse'
    && !jugementMoment({ verdict: { ok: false, raison: 'cutoff' }, dateCommande: auj, aujourdhui: auj }).refus)
  v('🔴 un créneau TERMINÉ est refusé, même commencé',
    !!jugementMoment({ verdict: { ok: false, raison: 'passe' }, dateCommande: auj, aujourdhui: auj, termine: true }).refus)

  // Heure murale de Bruxelles en été : UTC+2 (11 h 30 à Bruxelles = 09:30Z).
  const instant = (d, h) => new Date(`${d}T${h.length === 5 ? `${h}:00` : h}+02:00`)
  const t = (debut, fin) => creneauTermine({ heure_debut: debut, heure_fin: fin }, { dateStr: auj, maintenant: MAINTENANT, instant })
  v('🔴 terminé à 11 h 30 : le créneau de 7 h, et celui qui finit pile à 11 h 30',
    t('07:00:00', '07:15:00') && t('11:15:00', '11:30:00'))
  v('🔴 le créneau EN COURS reste, l’avenir aussi', !t('11:15:00', '11:45:00') && !t('12:00:00', '12:15:00'))
  v('un créneau qui passe minuit finit le lendemain', !t('22:00:00', '00:30:00'))
  v('demain, rien n’est terminé',
    !creneauTermine({ heure_debut: '07:00:00', heure_fin: '07:15:00' }, { dateStr: '2026-10-11', maintenant: MAINTENANT, instant }))
  // 🔴 LES RÈGLES DE L'ARTICLE CE JOUR-LÀ (Alex, 10/10), samedi 10/10.
  const commerce = { categorie: 'alimentaire' }
  const SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']
  const tarte = { id: 't1', nom: 'Tarte aux pommes', delai_minutes: 2880, vente_jour: false, commande_active: true }
  const croissant = { id: 'c1', nom: 'Croissant', delai_minutes: 1440, vente_jour: true, commande_active: true }
  const pain = { id: 'p1', nom: 'Pain longue fermentation', delai_minutes: 2880, vente_jour: false, commande_active: true }
  const hors = (article, jour, indispo = []) => articleHorsJour({ article, indispo, commercant: commerce, jour, aujourdhui: auj })
  const hTarte = hors(tarte, '2026-10-11')
  v('🔴 la tarte à J+2 pour demain : trop tôt, premier jour lundi 12 octobre, le message nomme l’article',
    hTarte?.raison === 'delai' && hTarte.premier === '2026-10-12' && hTarte.court === 'Trop tôt · dès lundi 12 octobre'
    && hTarte.message === '« Tarte aux pommes » se commande 2 jours à l’avance. Le premier jour possible : lundi 12 octobre.',
    JSON.stringify(hTarte))
  const hPain = hors(pain, '2026-10-11', SEMAINE)
  v('🔴 LE PAIN DU WEEK-END À J+2 : pas « dès lundi », le premier jour est samedi 17',
    hPain?.raison === 'delai' && hPain.premier === '2026-10-17' && /Le premier jour possible : samedi 17 octobre\./.test(hPain.message),
    JSON.stringify(hPain))
  const hPainLundi = hors(pain, '2026-10-12', SEMAINE)
  v('🔴 le même pain pour lundi : il ne se vend pas le lundi, et le premier jour reste samedi 17',
    hPainLundi?.raison === 'jour' && hPainLundi.court === 'Pas le lundi · dès samedi 17 octobre'
    && hPainLundi.message === '« Pain longue fermentation » ne se vend pas le lundi. Le premier jour possible : samedi 17 octobre.',
    JSON.stringify(hPainLundi))
  v('le pain pour samedi 17 passe', hors(pain, '2026-10-17', SEMAINE) === null)
  v('🔴 la tarte pour lundi passe', hors(tarte, '2026-10-12') === null)
  v('🔴 le croissant à J+1 pour demain passe, un article sans délai aussi',
    hors(croissant, '2026-10-11') === null && hors({ nom: 'Baguette', vente_jour: true }, auj) === null)
  const gateau = { nom: 'Gâteau d’anniversaire', delai_minutes: 0, vente_jour: false, commande_active: true }
  v('🔴 un article SUR COMMANDE SEULEMENT, sans délai réglé, pour aujourd’hui : dès demain (les circuits comptent)',
    hors(gateau, auj)?.premier === '2026-10-11')
  const hJour = hors({ nom: 'Pain du jour', vente_jour: true, commande_active: false }, '2026-10-11')
  v('🔴 un article du jour même seulement, pour demain : signalé, sans premier jour inventé dans le court',
    hJour?.raison === 'aujourdhui_seulement' && hJour.court === 'Le jour même seulement', JSON.stringify(hJour))

  // 🔴 LE CALENDRIER DE LA FICHE (Alex, 10/10) : samedi 10/10, longueur 8.
  const cal = joursDuCalendrier({ aujourdhui: auj, longueur: 8, fermetures: [{ date_debut: '2026-10-13', date_fin: '2026-10-14' }] })
  v('🔴 les jours du calendrier : aujourd’hui compris, sans les jours de fermeture, longueur respectée',
    JSON.stringify(cal) === JSON.stringify(['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-15', '2026-10-16', '2026-10-17']), JSON.stringify(cal))
  v('🔴 aujourd’hui sans créneau restant : il n’est pas proposé (comme la fiche)',
    joursDuCalendrier({ aujourdhui: auj, longueur: 3, aujourdhuiOuvert: false })[0] === '2026-10-11')
  v('🔴 au-delà du calendrier : signalé ; dedans, non',
    horsCalendrier({ jour: '2026-10-18', aujourdhui: auj, longueur: 8 }) && !horsCalendrier({ jour: '2026-10-17', aujourdhui: auj, longueur: 8 })
    && !horsCalendrier({ jour: auj, aujourdhui: auj, longueur: 8 }))
  v('l’avertissement « hors calendrier » dit le fait', /au-delà de ton calendrier/.test(avertissement('hors_calendrier').message))

  // 🔴 LES HORAIRES, POUR LE RETRAIT (Alex, 11/10 : « mardi est fermé et il le propose »).
  const H = {
    mardi: { ouvert: false },
    mercredi: { ouvert: true, debut: '07:00', fin: '15:00' },
    jeudi: { creneaux: [['07:00', '12:00'], ['14:00', '18:00']] },
    vendredi: { ouvert: true, debut: '14:00', fin: '02:00' },
  }
  const hh = (debut, fin, dateStr) => creneauRetraitHorsHoraires({ creneau: { heure_debut: debut, heure_fin: fin }, dateStr, horairesDetail: H })
  v('🔴 le mardi fermé : refusé, quel que soit le créneau', hh('10:00:00', '10:15:00', '2026-10-13')?.raison === 'jour_ferme')
  v('🔴 mercredi fermé à 15:00 : 14:45-15:00 passe, 15:00-15:15 et 14:50-15:10 non (avec les heures)',
    hh('14:45:00', '15:00:00', '2026-10-14') === null && hh('15:00:00', '15:15:00', '2026-10-14')?.raison === 'hors_ouverture'
    && hh('14:50:00', '15:10:00', '2026-10-14')?.raison === 'hors_ouverture' && hh('15:00:00', '15:15:00', '2026-10-14').plages[0] === '07:00–15:00')
  v('🔴 l’autre écriture des horaires (`creneaux`) compte aussi, pause de midi comprise',
    hh('12:30:00', '12:45:00', '2026-10-15')?.raison === 'hors_ouverture' && hh('14:00:00', '14:15:00', '2026-10-15') === null)
  v('une fermeture après minuit garde le soir ouvert', hh('23:30:00', '23:45:00', '2026-10-16') === null)
  v('🔴 sans horaires connus pour ce jour, ou sans horaires du tout : on ne juge pas',
    hh('10:00:00', '10:15:00', '2026-10-17') === null
    && creneauRetraitHorsHoraires({ creneau: { heure_debut: '10:00', heure_fin: '10:15' }, dateStr: '2026-10-13', horairesDetail: null }) === null)
  v('le message dit le jour et les heures, au client et au commerçant',
    messageHorsHoraires(hh('10:00:00', '10:15:00', '2026-10-13'), '2026-10-13') === 'Le commerce est fermé le mardi. Choisis un autre jour.'
    && messageHorsHoraires(hh('15:00:00', '15:15:00', '2026-10-14'), '2026-10-14', { pourCommercant: true }) === 'Ce créneau dépasse tes heures d’ouverture du mercredi (07:00–15:00).')
  v('🔴 les pastilles du retrait sautent le mardi fermé',
    !joursDuCalendrier({ aujourdhui: auj, longueur: 8, horairesDetail: H }).includes('2026-10-13')
    && joursDuCalendrier({ aujourdhui: auj, longueur: 8 }).includes('2026-10-13'))

  // La tuile : la règle d'abord, puis le stock par LA fonction de la fiche.
  const tuile = (article, o = {}) => etatTuile({ article, commercant: commerce, jour: '2026-10-11', aujourdhui: auj, dejaCommande: 0, ...o })
  v('🔴 la tuile d’un article hors jour ne parle pas de stock', tuile(tarte).hors?.raison === 'delai' && tuile(tarte).gere === false)
  const max5 = { ...croissant, commande_max_jour: 5 }
  v('🔴 la tuile dit le reste du jour (maximum sur commande 5, 3 déjà commandés : reste 2)',
    tuile(max5, { dejaCommande: 3 }).gere === true && tuile(max5, { dejaCommande: 3 }).dispo === 2)
  v('🔴 épuisé : 0', tuile(max5, { dejaCommande: 5 }).dispo === 0)
  v('🔴 un vendu illisible (null) ne dit rien du stock, jamais « plein »', tuile(max5, { dejaCommande: null }).gere === false)
  v('sans limite : rien à dire', tuile(croissant).gere === false)

  v('sans heure de fin ou sans horloge : rien n’est caché',
    !creneauTermine({ heure_debut: '07:00:00' }, { dateStr: auj, maintenant: MAINTENANT, instant }) && !creneauTermine({ heure_fin: '07:15:00' }, { dateStr: auj }))

  const liste = [
    { statut: 'en_attente', origine: 'en_ligne' },
    { statut: 'en_attente', origine: ORIGINE_COMMERCANT },
    { statut: 'paiement_en_attente', origine: 'en_ligne' },
    { statut: 'pret' },
  ]
  v('🔴 la sonnerie ne compte ni la saisie du commerçant ni le paiement en cours', nombreArriveesEnLigne(liste) === 2)
}

// ═══ 2) LA ROUTE D'ÉCRITURE ═════════════════════════════════════════════════
{
  const r = code('app/api/equipe/commande/creer/route.js')
  v('🔴 garde de l’équipe avec la case « Commandes », avant toute lecture',
    /const garde = await gardeEquipe\(request, admin, commercant_id, 'commandes'\)/.test(r)
    && avant(r, "gardeEquipe(request, admin, commercant_id, 'commandes')", ".from('commercants')"))
  v('alimentaire seulement', /if \(commercant\.categorie !== 'alimentaire'\) return non\(/.test(r))
  v('🔴 le prix vient de la règle de toutes les commandes, versions en avertissement',
    /construireLignesCommande\(\{[\s\S]{0,300}stockVarianteIndicatif: true,/.test(r))
  v('🔴 la capacité : le même compte partagé et la même règle',
    /occupationDuCreneau\(\{/.test(r) && /commandeDeborde\(creneau, \{/.test(r) && /avertissements\.push\(avertissement\('creneau_plein'\)\)/.test(r))
  // (10/10) réorientée : la même vérification, désormais ARTICLE PAR ARTICLE,
  // pour que tous les problèmes sortent en une fois.
  v('🔴 le stock : la même vérification, article par article ; un refus devient un avertissement, une panne reste une erreur',
    /verifierStockDisponible\(\{\s*supabase: admin, lignes: lignes\.filter\(l => String\(l\.article_id\) === id\),/.test(r)
    && /if \(v\.status >= 500\) return non\(v\.error, v\.status\)/.test(r)
    && /avertissements\.push\(avertissement\(`stock:\$\{id\}`, Number\.isFinite\(v\.stock_disponible\)/.test(r))
  v('🔴 les règles de l’article (délai, jours de vente, circuits) avant le stock, un avertissement par article',
    /const hors = articleHorsJour\(\{ article: art, indispo: joursIndisponibles\(entrees\), commercant, jour: date_commande, aujourdhui \}\)/.test(r)
    && /if \(hors\) avertissements\.push\(avertissement\(`article:\$\{id\}`, hors\.message\)\)\s*else aVerifier\.push\(id\)/.test(r)
    && /if \(errOff\) return non\(/.test(r)
    && avant(r, 'articleHorsJour({ article: art', 'confirmationRequise(avertissements, corps.confirmes)'))
  v('🔴 on prévient AVANT d’écrire', avant(r, 'confirmationRequise(avertissements, corps.confirmes)', ".from('commandes')\n      .insert("))
  v('🔴 la commande naît encodée, confirmée, sans Stripe',
    /origine: ORIGINE_COMMERCANT,/.test(r) && /statut: 'en_attente',/.test(r) && /\.\.\.paiement\.champs,/.test(r)
    && !/paye_en_ligne: true/.test(r) && !/stripe/i.test(r.replace(/stripe-mode/g, '')))
  v('🔴 aucune réservation de cinq minutes : elle consomme par ses lignes', !/reserver_stock_atomique/.test(r))
  v('🔴 les lignes ratées défont la commande', /if \(errLignes\) \{\s*await admin\.from\('commandes'\)\.delete\(\)\.eq\('id', commande\.id\)/.test(r))
  v('🔴 jamais l’e-mail « Nouvelle commande » au commerçant ; la confirmation au client à la demande',
    /envoyerEmailsCommande\(commande\.id, admin, \{ versClient: confirmation, versCommercant: false \}\)/.test(r)
    && /const confirmation = !!corps\.envoyer_confirmation && !!client\.client_email/.test(r))
  v('aucun consentement marketing présumé', /rgpd_marketing: false,/.test(r))
  v('la livraison hors du référentiel se note quand même, avec avertissement',
    /avertissements\.push\(avertissement\('adresse_non_situee'\)\)/.test(r) && /avertissements\.push\(avertissement\('hors_zone'\)\)/.test(r))
  v('le geste d’un membre est journalisé', /journaliserGeste\(admin, garde, \{\s*action: 'commande_encodee'/.test(r))
  v('🔴 un créneau terminé est refusé par le serveur, à l’heure de Bruxelles, avant toute écriture',
    /termine: creneauTermine\(creneau, \{ dateStr: date_commande, instant: brusselsInstant \}\),/.test(r)
    && avant(r, 'termine: creneauTermine(', 'if (moment.refus) return non(moment.refus)'))
  v('🔴 l’article est lu EN BASE, jamais dans le corps', /const art = articlesData\.find\(a => String\(a\.id\) === id\)/.test(r))
  v('🔴 horaires : l’encodage d’un retrait hors horaires prévient (avertissement), la tournée non',
    /if \(!estLivraison\) \{\s*const hors = creneauRetraitHorsHoraires\(\{ creneau, dateStr: date_commande, horairesDetail: commercant\.horaires_detail \}\)\s*if \(hors\) avertissements\.push\(avertissement\('hors_horaires', messageHorsHoraires\(hors, date_commande, \{ pourCommercant: true \}\)\)\)/.test(r)
    && /created_at, horizon_commande, horaires_detail'\)/.test(r))

  // Les autres portes : la fiche, le serveur en ligne, la bande du tableau de bord.
  const fiche = code('app/commander/[slug]/page.js')
  v('🔴 horaires : la fiche saute un jour fermé et cache un créneau hors horaires (retrait), pas la tournée',
    /\.filter\(cr => !horaires \|\| !creneauRetraitHorsHoraires\(\{ creneau: cr, dateStr: jourISO, horairesDetail: c\.horaires_detail \}\)\)/.test(fiche)
    && /const fermeCeJour = \(date\) => estEnFermeture\(date\) \|\| \(horaires && !estOuvertCeJour\(c\.horaires_detail, JOURS\[jourIdx\(date\)\]\)\)/.test(fiche)
    && /if \(!fermeCeJour\(today\)\)/.test(fiche) && /if \(fermeCeJour\(d\)\) continue/.test(fiche)
    && /data\.blocagesLivraison \|\| \[\], longueurCal, false\)\)/.test(fiche))
  const enLigne = code('app/api/stripe/checkout/create-commande/route.js')
  v('🔴 horaires : le serveur en ligne REFUSE un retrait hors horaires (409), pas la tournée',
    /if \(!estLivraison\) \{\s*const hors = creneauRetraitHorsHoraires\(\{ creneau, dateStr: date_commande, horairesDetail: commercant\.horaires_detail \}\)\s*if \(hors\) \{\s*return NextResponse\.json\(\{ ok: false, error: messageHorsHoraires\(hors, date_commande\), creneau_indisponible: true \}, \{ status: 409 \}\)/.test(enLigne)
    && /horaires_detail, boutique_delai_heures/.test(enLigne))
  v('🔴 au-delà du calendrier de la fiche : avertissement, et une lecture ratée est une erreur',
    /const calendrier = await calendrierDuCommerce\(\{ supabase: admin, commercant \}\)/.test(r)
    && /if \(!calendrier\.ok\) return non\(/.test(r)
    && /if \(horsCalendrier\(\{ jour: date_commande, aujourdhui: jourBruxelles\(\), longueur: calendrier\.longueur \}\)\) \{\s*avertissements\.push\(avertissement\('hors_calendrier'\)\)/.test(r)
    && /horizon_commande, horaires_detail'\)/.test(r))

  // Le module qui lit le calendrier : la longueur de la fiche, sur tout le catalogue.
  const cs = code('lib/calendrier-commande-server.js')
  v('🔴 le calendrier : `longueurCalendrier` sur TOUT le catalogue actif hors vitrine, jours de vente compris',
    /\.from\('articles'\)\.select\('id, delai_minutes, horizon_jours, vente_jour, commande_active, stock_mode, est_vitrine'\)\s*\.eq\('commercant_id', commercant\.id\)\.eq\('actif', true\)/.test(cs)
    && /\.from\('article_stock_jour'\)\.select\('article_id, jour_semaine'\)\.eq\('commercant_id', commercant\.id\)\.eq\('actif', false\)/.test(cs)
    && /horizon: commercant\.horizon_commande,/.test(cs) && /\.filter\(a => !a\.est_vitrine\)/.test(cs)
    && /delaiJours: delaiEnJours\(a\), indispo: offParArticle\[a\.id\] \|\| \[\], horizonJours: a\.horizon_jours, circuits: circuitsDeLArticle\(a, commercant\)/.test(cs)
    && /if \(errCat \|\| errOff \|\| errF\) return \{ ok: false \}/.test(cs))
}

// ═══ 3) LA LECTURE POUR LA FENÊTRE ══════════════════════════════════════════
{
  const r = code('app/api/equipe/commande/catalogue/route.js')
  v('🔴 même garde que l’écriture', /gardeEquipe\(request, admin, commercant_id, 'commandes'\)/.test(r))
  v('🔴 rien de personnel sur les commandes du jour',
    /select\('statut, date_commande, creneau_id, creneau_livraison_id, commande_articles\(quantite, article:articles\(temps_prepa\)\)'\)/.test(r)
    && !/client_nom|client_email|client_telephone/.test(r))
  v('ni prix indicatif ni versions', /filter\(a => !a\.est_vitrine && !a\.gere_variantes\)/.test(r))
  v('🔴 la grille lit les jours de vente et le vendu du jour aux sources de la fiche',
    /\.from\('article_stock_jour'\)\.select\('article_id, jour_semaine, stock, actif'\)\.in\('article_id', ids\)/.test(r)
    && /rpc\('stock_commande_par_article', \{ p_commercant_id: commercant_id, p_date: date \}\)/.test(r)
    && /dejaCommandePourStock\(\{ article: a, duJour, ventesMagasin \}\)/.test(r))
  v('🔴 un vendu illisible reste null (jamais « rien vendu »)',
    /let dejaCommande = null/.test(r) && /if \(vendu\.error \|\| magasin\.error\) \{/.test(r))
  v('🔴 horaires : la grille reçoit les horaires', /ordre_categories, horizon_commande, horaires_detail'\)/.test(r))
  v('🔴 la fenêtre reçoit le calendrier de la fiche, et une lecture ratée est une erreur',
    /const calendrier = commerce\.data \? await calendrierDuCommerce\(\{ supabase: admin, commercant: commerce\.data \}\) : \{ ok: false \}/.test(r)
    && /if \(!calendrier\.ok\) return NextResponse\.json\(\{ ok: false/.test(r)
    && /calendrier: \{ longueur: calendrier\.longueur, fermetures: calendrier\.fermetures \}/.test(r)
    && /ordre_categories, horizon_commande, horaires_detail'\)/.test(r))
  v('les colonnes que `etatStock` lit sont lues',
    /stock_jour, stock_comptoir, stock_comptoir_le, commande_max_jour, stock_maj_le/.test(r))
}

// ═══ 4) LES ÉCRANS ══════════════════════════════════════════════════════════
{
  const m = code('app/dashboard/ModalNouvelleCommande.js')
  v('🔴 la fenêtre lit et écrit par le serveur, pour le patron comme l’équipe',
    /postPro\('\/api\/equipe\/commande\/catalogue'/.test(m) && /postPro\('\/api\/equipe\/commande\/creer'/.test(m) && !/from '@\/lib\/supabase'/.test(m))
  v('🔴 le total et le remplissage viennent des règles du serveur',
    /construireLignesCommande\(\{/.test(m) && /remplissageCreneaux\(\{/.test(m))
  v('🔴 un créneau sans limite n’est jamais « plein »', /const complet = !!capacite && completBrut/.test(m))
  v('🔴 un avertissement s’efface dès qu’on change ce qu’il a vu',
    /useEffect\(\(\) => \{ setAvertissements\(null\) \}, \[mode, date, creneauId, panier, adresse, paiement\]\)/.test(m))
  v('🔴 « encoder quand même » renvoie les codes montrés', /encoder\(avertissements \? avertissements\.map\(a => a\.code\) : \[\]\)/.test(m))
  v('le bouton montre qu’il travaille', /\{envoi && <DotsAttente/.test(m))
  v('🔴 la tuile dit la règle du jour, puis le stock, par la règle du serveur ; un vendu illisible reste null',
    /const tuile = etatTuile\(\{/.test(m)
    && /dejaCommande: donnees\?\.dejaCommande \? \(donnees\.dejaCommande\[a\.id\] \|\| 0\) : null,/.test(m)
    && /\{tuile\.hors \? \(/.test(m) && /\{epuise \? 'Épuisé ce jour' : `Reste \$\{tuile\.dispo\}`\}/.test(m))
  v('🔴 les pastilles sont les jours du calendrier de la fiche ; « Aujourd’hui » seulement s’il reste un créneau',
    /return joursDuCalendrier\(\{ aujourdhui, longueur: donnees\.calendrier\.longueur, fermetures: donnees\.calendrier\.fermetures, aujourdhuiOuvert, horairesDetail: horaires \}\)/.test(m)
    && /&& !creneauTermine\(c, \{ dateStr: aujourdhui, maintenant: new Date\(minute\), instant: brusselsInstant \}\)\s*&& !\(horaires && creneauRetraitHorsHoraires\(\{ creneau: c, dateStr: aujourdhui, horairesDetail: horaires \}\)\)\)/.test(m)
    && /\{jours\.map\(d => \{/.test(m))
  v('🔴 horaires : la fenêtre cache les créneaux de retrait hors horaires et les jours fermés (pas en livraison)',
    /\.filter\(\(\{ creneau \}\) => mode !== 'retrait' \|\| !creneauRetraitHorsHoraires\(\{ creneau, dateStr: date, horairesDetail: donnees\?\.commercant\?\.horaires_detail \}\)\)/.test(m)
    && /const horaires = mode === 'retrait' \? donnees\.commercant\?\.horaires_detail : null/.test(m)
    && /aujourdhuiOuvert, horairesDetail: horaires \}\)/.test(m))
  v('🔴 horaires : la bande du tableau de bord cache les créneaux de retrait hors horaires',
    /\.filter\(\(\{ creneau \}\) => vueMode === 'livraison' \|\| !creneauRetraitHorsHoraires\(\{ creneau, dateStr: jourActif, horairesDetail: commercant\?\.horaires_detail \}\)\)/.test(code('app/dashboard/page.js')))
  v('🔴 un jour hors des pastilles retombe sur le premier jour, sauf « Autre date »',
    /if \(!autreDate && jours\.length > 0 && !jours\.includes\(date\)\) setDate\(jours\[0\]\)/.test(m))
  v('🔴 « Autre date » : le champ libre, et la mention au-delà du calendrier',
    /\{autreDate && \(\s*<input type="date"/.test(m) && /horsCalendrier\(\{ jour: date, aujourdhui, longueur: donnees\.calendrier\.longueur \}\)/.test(m))
  v('🔴 ON ENCHAÎNE : pop-up de deux secondes, fenêtre vidée, remplissage relu, la fenêtre ne se ferme pas',
    /setEnregistree\(\{ ref: referenceCommande\(/.test(m) && /nouvelleCommande\(\)\s*setEnvoi\(false\)\s*setRelecture\(v => v \+ 1\)\s*onCree\?\.\(j\)/.test(m)
    && /setTimeout\(\(\) => setEnregistree\(null\), 2000\)/.test(m)
    && /\}, \[commercantId, date, relecture\]\)/.test(m)
    && /function nouvelleCommande\(\) \{\s*setPanier\(\[\]\); setCreneauId\(null\)/.test(m) && /setPaiement\(null\); setAvertissements\(null\)/.test(m))
  v('🔴 le tableau de bord et le poste relisent leur liste SANS fermer la fenêtre',
    /onCree=\{\(\) => chargerCommandes\(commercant\.id\)\}/.test(code('app/dashboard/page.js')) && /onCree=\{\(\) => charger\(\)\}/.test(code('app/equipe/PosteEquipe.js')))
  v('🔴 la fenêtre cache les créneaux terminés, relus chaque minute, et lâche un choix terminé',
    /\}\)\.filter\(\(\{ creneau \}\) => !creneauTermine\(creneau, \{ dateStr: date, maintenant: new Date\(minute\), instant: brusselsInstant \}\)\)/.test(m)
    && /setInterval\(\(\) => setMinute\(Date\.now\(\)\), 60000\)/.test(m)
    && /if \(creneauId && !creneaux\.some\(\(\{ creneau \}\) => creneau\.id === creneauId\)\) setCreneauId\(null\)/.test(m))

  const bord = code('app/dashboard/page.js')
  v('🔴 la sonnerie ne compte que les arrivées en ligne (trois endroits)',
    (bord.match(/nombreArriveesEnLigne\(triees\)/g) || []).length === 2 && /dernierNombreRef\.current = arrivees/.test(bord)
    && !/triees\.length > dernierNombreRef\.current/.test(bord))
  v('le bouton n’apparaît qu’en alimentaire avec des créneaux',
    /commercant\?\.categorie === 'alimentaire' && \(creneauxRetrait\.length > 0 \|\| creneauxLivraison\.length > 0\)/.test(bord))
  v('la carte dit qu’une commande est encodée', /commande\.origine === ORIGINE_COMMERCANT/.test(bord))
  v('🔴 la bande de remplissage cache les créneaux terminés, à l’heure relue chaque minute',
    /\}\)\)\.filter\(\(\{ creneau \}\) => !creneauTermine\(creneau, \{ dateStr: jourActif, maintenant: new Date\(minuteBande\), instant: brusselsInstant \}\)\)/.test(bord)
    && /setInterval\(\(\) => setMinuteBande\(Date\.now\(\)\), 60000\)/.test(bord))

  const poste = code('app/equipe/PosteEquipe.js')
  v('🔴 l’équipe encode seulement avec la case « Commandes »',
    /etat\.droits\?\.commandes && etat\.commerce\?\.categorie === 'alimentaire'/.test(poste) && /<ModalNouvelleCommande/.test(poste))
}

// ═══ 5) LA MIGRATION ════════════════════════════════════════════════════════
{
  const sql = lire('migrations/MIGRATION_COMMANDE_ENCODEE.sql').split('-- ─── CONTRÔLE')[0]
  const fn = (sql.split('CREATE OR REPLACE FUNCTION public.commandes_capacite_creneau()')[1] || '').split('END $$;')[0]
  v('🔴 l’origine, en ligne par défaut, fermée à deux valeurs',
    /ADD COLUMN IF NOT EXISTS origine text NOT NULL DEFAULT 'en_ligne'/.test(sql) && /CHECK \(origine IN \('en_ligne', 'commercant'\)\)/.test(sql))
  v('🔴 l’exemption passe APRÈS le filtre des statuts et AVANT le verrou',
    avant(fn, "IF NEW.statut NOT IN ('paiement_en_attente', 'en_attente', 'en_preparation', 'pret') THEN", "IF NEW.origine = 'commercant' THEN")
    && avant(fn, "IF NEW.origine = 'commercant' THEN", 'pg_advisory_xact_lock('))
  // ⚠️ LE RESTE DE LA RÈGLE EST INCHANGÉ : on compare au texte d'I8, exemption retirée.
  const i8 = lire('migrations/MIGRATION_I7_I8_TOURNEE_FERMEE_CAPACITE.sql')
  const fnI8 = (i8.split('CREATE OR REPLACE FUNCTION public.commandes_capacite_creneau()')[1] || '').split('END $$;')[0]
  const normal = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()
  const sansExemption = fn.replace(/IF NEW\.origine = 'commercant' THEN\s*RETURN NEW;\s*END IF;/, '')
  v('🔴 hors exemption, le verrou est mot pour mot celui d’I8', fnI8.length > 500 && normal(sansExemption) === normal(fnI8))
  v('les colonnes lues sont vérifiées avant tout', avant(sql, "RAISE EXCEPTION 'Colonnes absentes", 'ADD COLUMN IF NOT EXISTS origine'))
  v('téléphone et e-mail facultatifs',
    /ALTER COLUMN client_email DROP NOT NULL/.test(sql) && /ALTER COLUMN client_telephone DROP NOT NULL/.test(sql))
}

console.log(`\nLa commande encodée : ${ok} vérifications`)
if (echecs.length > 0) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
