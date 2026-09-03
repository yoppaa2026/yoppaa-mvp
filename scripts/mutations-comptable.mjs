// HARNAIS DE MUTATION — le journal comptable et ses remboursements (02/09).
//
// ⚠️ POURQUOI CE HARNAIS EXISTE. Le journal comptait de l'argent qui était
// reparti : un acompte remboursé, une commande remboursée en partie, un bon
// cadeau rendu. Les trois écrivaient un chiffre d'affaires que le commerçant
// n'avait jamais gagné, sur un document qu'il donne à son comptable. Les
// gardes qui l'empêchent désormais doivent POUVOIR rougir, sinon elles ne
// gardent rien.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout` :
// le dépôt porte du travail non commité, et un checkout l'effacerait.
//
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON. Un banc qui
// PLANTE n'a rien prouvé : il faut qu'il rougisse en disant « en échec ».

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const MODULE = 'lib/export-comptable.js'
const ROUTE = 'app/api/dashboard/export-comptable/route.js'
// ⚠️ LA RÈGLE VIT À UN SEUL ENDROIT, et les DEUX écrans l'empruntent : le
// journal du comptable et le tableau de bord du commerçant répondent à la même
// question, et tous les deux comptaient l'argent rendu.
const REGLE = 'lib/remboursements.js'
const STATS = 'lib/statistiques.js'
const ROUTE_STATS = 'app/api/dashboard/statistiques/route.js'

const MUTATIONS = [
  // ─── LE DÉFAUT D'ORIGINE : la vente remboursée reste comptée ──────────────
  { nom: '🔴 l’acompte remboursé ne se contrepasse plus',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      remboursements: rembAcompte > 0\n        ? [{ montant: rembAcompte, date: r.stripe_refund_date, sur: \'carte\' }]\n        : [],',
    vers: '      remboursements: [],' },

  { nom: '🔴 la commande remboursée en partie redevient comptée en entier',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    const rembCarte = partRemboursee(c.stripe_refund_amount, surCarte)',
    vers: '    const rembCarte = 0' },

  { nom: '🔴 le bon rendu ne se contrepasse plus',
    banc: 'verif:comptable', fichier: MODULE,
    // ⚠️ ANCRE RECALÉE LE 03/09 : le plafond est désormais la part À IMPOSER,
    // parce qu'on ne contrepasse pas un chiffre d'affaires qu'un bon déjà taxé
    // à sa vente n'a jamais fait entrer dans cette ligne.
    de: '        remboursements: retoursPlafonnes(retours.parRdv.get(r.id), parBonRdvAImposer),',
    vers: '        remboursements: [],' },

  // ─── LE PLAFOND, qui empêche le trou du tunnel unique ─────────────────────
  { nom: '🔴 le plafond du remboursement disparaît',
    banc: 'verif:comptable', fichier: REGLE,
    de: '  return arrondi(Math.min(m, p))',
    vers: '  return arrondi(m)' },

  { nom: '🔴 le retour d’un bon n’est plus plafonné à ce que la ligne portait',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    const part = arrondi(Math.min(Number(m?.montant) || 0, reste))',
    vers: '    const part = arrondi(Number(m?.montant) || 0)' },

  // ─── LE PIÈGE DU CHANTIER : deux temps pour frais et net ──────────────────
  { nom: '🔴 le net d’origine n’est plus reconstitué : on déduit deux fois',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  if (!(Number(rembourse) > 0)) return net == null ? null : arrondi(net)',
    vers: '  if (true) return net == null ? null : arrondi(net)' },

  { nom: '🔴 la contrepassation porte à nouveau un frais, qui compte double',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    fraisStripe: 0,\n    netStripe: surBon ? 0 : arrondi(-part),',
    vers: '    fraisStripe: origine.fraisStripe,\n    netStripe: surBon ? 0 : arrondi(-part),' },

  // ─── LA VALIDATION D'ALEX : une ligne à SA date ───────────────────────────
  { nom: '🔴 la contrepassation reprend la date de la vente',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  const jour = jourComptable(date) || origine.date',
    vers: '  const jour = origine.date' },

  { nom: '🔴 la contrepassation perd son heure',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    heure: heureComptable(date),',
    vers: '    heure: \'\',' },

  { nom: '🔴 la contrepassation redevient positive',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    total: arrondi(-part),',
    vers: '    total: arrondi(part),' },

  { nom: '🔴 la ventilation par taux du remboursement disparaît',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    parTaux: prorataTaux(origine.parTaux, part, origine.total),',
    vers: '    parTaux: {},' },

  { nom: '🔴 un bon rendu passe pour un remboursement de carte',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    bonCadeau: surBon ? arrondi(-part) : 0,',
    vers: '    bonCadeau: 0,' },

  { nom: '🔴 le remboursement d’un bon fait baisser l’encaissement en ligne',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    enLigne: surBon ? 0 : arrondi(-part),',
    vers: '    enLigne: arrondi(-part),' },

  { nom: '🔴 la contrepassation se compte comme une référence ambiguë de plus',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    reference: origine.reference,\n    total: arrondi(-part),',
    vers: '    reference: origine.reference,\n    referenceIncomplete: origine.referenceIncomplete,\n    total: arrondi(-part),' },

  // ─── CHAQUE MOUVEMENT À SON MOIS ─────────────────────────────────────────
  { nom: '🔴 la période ne borne plus les remboursements',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  if (!periode || !periode.du || !periode.au) return true',
    vers: '  return true\n  // eslint-disable-next-line no-unreachable\n  if (!periode || !periode.du || !periode.au) return true' },

  // ─── ET LA ROUTE, QUI DOIT CHARGER DE QUOI TRAVAILLER ─────────────────────
  //
  // ⚠️ UNE COLONNE ABSENTE D'UN SELECT EST LE DÉFAUT LE PLUS FRÉQUENT D'ICI, et
  // il est SILENCIEUX : tout le reste du banc reste vert.
  { nom: '🔴 la route n’a plus le montant remboursé des commandes',
    banc: 'verif:comptable', fichier: ROUTE,
    de: 'stripe_net, stripe_refund_amount, stripe_refund_date, date_commande',
    vers: 'stripe_net, date_commande' },

  { nom: '🔴 la route n’a plus la date de remboursement des rendez-vous',
    banc: 'verif:comptable', fichier: ROUTE,
    de: 'stripe_net, stripe_refund_amount, stripe_refund_date, date_rdv',
    vers: 'stripe_net, stripe_refund_amount, date_rdv' },

  { nom: '🔴 une des lectures de commandes se réécrit à la main',
    banc: 'verif:comptable', fichier: ROUTE,
    // ⚠️ ANCRE RECALÉE LE 03/09 : les deux requêtes bornées par date ont fusionné
    // en une seule qui charge sur toutes les dates d'encaissement.
    de: '      .from(\'commandes\')\n      .select(COLS_COMMANDE)\n      .eq(\'commercant_id\', commercantId)\n      .or([',
    vers: '      .from(\'commandes\')\n      .select(\'id, statut, total\')\n      .eq(\'commercant_id\', commercantId)\n      .or([' },

  { nom: '🔴 la route ne va plus chercher les bons rendus',
    banc: 'verif:comptable', fichier: ROUTE,
    de: '      .eq(\'source\', \'annulation\')',
    vers: '      .eq(\'source\', \'commande\')' },

  // 🔴 SÉCURITÉ : la table des mouvements ne porte pas de `commercant_id`.
  // Sans la jointure, cette lecture remonte les mouvements de TOUS les commerces.
  { nom: '🔴 SÉCURITÉ : les mouvements ne sont plus bornés au commerce',
    banc: 'verif:comptable', fichier: ROUTE,
    de: '\'bon_id, montant, source, commande_id, rdv_id, created_at, bons_cadeaux!inner(commercant_id)\'',
    vers: '\'bon_id, montant, source, commande_id, rdv_id, created_at\'' },

  { nom: '🔴 la route ne transmet plus la période',
    banc: 'verif:comptable', fichier: ROUTE,
    // ⚠️ ANCRE ÉLARGIE : `periode: { du, au },` existe AUSSI dans la réponse
    // JSON de la route. Une ancre qui matche deux endroits mute le mauvais, et
    // le banc visé reste vert (vécu le 01/09 sur un gabarit d'email).
    // ⚠️ ANCRE RECALÉE LE 03/09 : `bons` s'est glissé entre les deux.
    de: '      bons: bons || [],\n      periode: { du, au },',
    vers: '      bons: bons || [],\n      periode: null,' },

  // ─── LE FRÈRE : LE MÊME ARGENT, SUR L'AUTRE ÉCRAN ────────────────────────
  //
  // 🔴 Le tableau de bord filtre bien les statuts d'annulation, mais un
  // remboursement PARTIEL garde le sien : 60 € remboursés de 20 € s'affichaient
  // 60 € au commerçant comme au comptable.
  { nom: '🔴 le tableau de bord recompte la commande remboursée en entier',
    banc: 'verif:stats', fichier: STATS,
    de: '  return resteApresRemboursement(Math.max(0, total - remise), commande.stripe_refund_amount)',
    vers: '  return arrondi(Math.max(0, total - remise))' },

  { nom: '🔴 le tableau de bord recompte le rendez-vous remboursé en entier',
    banc: 'verif:stats', fichier: STATS,
    de: '    return resteApresRemboursement(\n      Math.max(0, prix - Number(rdv.fidelite_remise || 0)), rdv.stripe_refund_amount)',
    vers: '    return arrondi(Math.max(0, prix - Number(rdv.fidelite_remise || 0)))' },

  { nom: '🔴 l’acompte remboursé reste dans le rapprochement Stripe',
    banc: 'verif:stats', fichier: STATS,
    de: '  return resteApresRemboursement(rdv.acompte_montant, rdv.stripe_refund_amount)',
    vers: '  return Number(rdv.acompte_montant || 0)' },

  // ⚠️ LA MUTATION « la règle du remboursement est recopiée » A DISPARU LE
  // 03/09 : son ancre visait la ligne d'import, qui porte désormais TROIS
  // fonctions. Elle est couverte par « la règle du bon rendu est recopiée »,
  // plus bas, qui vise la même ligne et stub les trois. Deux mutations sur une
  // même ancre ne mesurent rien de plus.
  { nom: '🔴 la route des chiffres n’a plus le remboursement des commandes',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    // ⚠️ ANCRE RECALÉE LE 02/09 : deux colonnes ont été ajoutées au même
    // `select` dans la foulée. Un texte introuvable est une NON-mesure qui
    // passe pour une mesure, donc le harnais la compte comme manquée.
    de: 'total, fidelite_remise, stripe_refund_amount, paye_en_ligne',
    vers: 'total, fidelite_remise, paye_en_ligne' },

  { nom: '🔴 la route des chiffres n’a plus celui des rendez-vous',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    // ⚠️ ANCRE RECALÉE : `bon_cadeau_montant` s'est glissé entre les deux.
    de: 'fidelite_remise, stripe_refund_amount, bon_cadeau_montant',
    vers: 'fidelite_remise, bon_cadeau_montant' },

  // ─── ET « ENCAISSÉ EN LIGNE » COMPTAIT LE COMPTOIR COMME DU STRIPE ────────
  { nom: '🔴 un Click and Collect payé au comptoir redevient du Stripe',
    banc: 'verif:stats', fichier: STATS,
    de: '  if (!commande.paye_en_ligne) return 0',
    vers: '  if (false) return 0' },

  { nom: '🔴 la part payée par un bon cadeau repasse pour de la carte',
    banc: 'verif:stats', fichier: STATS,
    de: '    - Number(commande.bon_cadeau_montant || 0)\n  return resteApresRemboursement(Math.max(0, brut), commande.stripe_refund_amount)',
    vers: '\n  return resteApresRemboursement(Math.max(0, brut), commande.stripe_refund_amount)' },

  { nom: '🔴 un acompte réglé sur place redevient du Stripe',
    banc: 'verif:stats', fichier: STATS,
    de: '  return rdv.acompte_paye_en_ligne ? acompteRdv(rdv) : 0',
    vers: '  return acompteRdv(rdv)' },

  { nom: '🔴 le chiffre d’affaires entier repart dans l’encaissé en ligne',
    banc: 'verif:stats', fichier: STATS,
    de: '    encaisse_en_ligne: arrondi(produitsSurCarte + acomptes + abosEnLigne),',
    vers: '    encaisse_en_ligne: arrondi(produits + acomptes + abosEnLigne),' },

  { nom: '🔴 les produits du comptoir redisparaissent des deux colonnes',
    banc: 'verif:stats', fichier: STATS,
    de: '    au_comptoir: arrondi(produits + prestations + montantAbos\n      - (produitsSurCarte + acomptes + abosEnLigne)),',
    vers: '    au_comptoir: arrondi(prestations - acomptes + (montantAbos - abosEnLigne)),' },

  { nom: '🔴 la route des chiffres n’a plus le moyen de paiement',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    de: 'stripe_refund_amount, paye_en_ligne, bon_cadeau_montant, statut',
    vers: 'stripe_refund_amount, statut' },

  { nom: '🔴 la route des chiffres n’a plus celui de l’acompte',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    de: 'acompte_paye, acompte_paye_en_ligne, prix_estime',
    vers: 'acompte_paye, prix_estime' },

  { nom: '🔴 l’écran réannonce « à régler » un montant déjà encaissé',
    banc: 'verif:stats', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '{euros(a.au_comptoir)}</strong> chez toi',
    vers: '{euros(a.au_comptoir)}</strong> à régler chez toi' },

  // ─── UNE LIGNE EST DATÉE DU JOUR OÙ L'ARGENT A BOUGÉ (03/09) ─────────────
  //
  // 🔴 Sept remboursements apparaissaient AVANT la vente qu'ils annulaient.
  { nom: '🔴 l’acompte redevient daté du jour du rendez-vous',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      date: jourComptable(r.acompte_paye_date, r.created_at, r.date_rdv),\n      // L acompte est payé en ligne au moment de la réservation.',
    vers: '      date: (r.date_rdv || \'\').slice(0, 10),\n      // L acompte est payé en ligne au moment de la réservation.' },

  { nom: '🔴 le bon consommé redevient daté du jour du rendez-vous',
    banc: 'verif:comptable', fichier: MODULE,
    de: '        date: jourComptable(r.acompte_paye_date, r.created_at, r.date_rdv),',
    vers: '        date: (r.date_rdv || \'\').slice(0, 10),' },

  { nom: '🔴 la commande redevient datée de son créneau de retrait',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      date: jourComptable(\n        c.paye_en_ligne ? c.created_at : c.encaisse_le,',
    vers: '      date: jourComptable(\n        c.date_commande, c.created_at, c.paye_en_ligne ? c.created_at : c.encaisse_le,' },

  { nom: '🔴 une vente d’un autre mois réécrit son chiffre d’affaires ici',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    if (dansPeriode(ligne.date, periode)) lignes.push(ligne)',
    vers: '    lignes.push(ligne)' },

  { nom: '🔴 la route ne charge plus que sur une seule date',
    banc: 'verif:comptable', fichier: ROUTE,
    de: '        instant(\'acompte_paye_date\'),  // l\'acompte et le bon, pris à la réservation',
    vers: '        // instant retire' },

  { nom: '🔴 la route perd le filet des colonnes de date nue',
    banc: 'verif:comptable', fichier: ROUTE,
    de: '        jour(\'date_rdv\'),              // filet : un rendez-vous sans aucune de ces dates',
    vers: '        // filet retire' },

  // ─── LES RÉFÉRENCES NUES DES RENDEZ-VOUS ─────────────────────────────────
  { nom: '🔴 les références de rendez-vous ne sont plus signalées',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  return { reference: brute, referenceIncomplete: !/-S\\d{2}$/.test(brute || \'\') }',
    vers: '  return { reference: brute }' },

  // ─── LES FRAIS COMPTÉS DEUX FOIS SUR UN PAIEMENT PARTAGÉ ─────────────────
  { nom: '🔴 la commande réécrit les frais du paiement ENTIER',
    banc: 'verif:comptable', fichier: 'app/api/stripe/webhook/route.js',
    de: '        const parts = ventilerFrais(total.frais, partageAvec.acompte, partageAvec.produits)\n        frais = parts ? parts.commande : total',
    vers: '        frais = total' },

  { nom: '🔴 le tunnel ne passe plus de quoi ventiler',
    banc: 'verif:comptable', fichier: 'app/api/stripe/webhook/route.js',
    de: '          partageAvec: { acompte: montantAcompte, produits: montantProduits },',
    vers: '' },

  { nom: '🔴 la ventilation perd un centime au double arrondi',
    banc: 'verif:comptable', fichier: 'lib/stripe-frais.js',
    de: '  const fraisCommande = arrondi(Number(fraisTotal) - fraisRdv)',
    vers: '  const fraisCommande = arrondi(Number(fraisTotal) * (produits / total))' },

  // ─── LE NO-SHOW A LAISSÉ DE L'ARGENT (03/09) ─────────────────────────────
  { nom: '🔴 le no-show redisparaît du chiffre d’affaires',
    banc: 'verif:stats', fichier: STATS,
    de: '  const noShows = rdvs.filter(rdvNoShow)',
    vers: '  const noShows = []' },

  { nom: '🔴 le no-show revaut le prix de la séance',
    banc: 'verif:stats', fichier: STATS,
    de: '  return arrondi(acompteRdv(rdv) + bonReste(rdv.bon_cadeau_montant, retoursDuRdv))',
    vers: '  return arrondi(Number(rdv.prix_estime || 0))' },

  { nom: '🔴 la part gardée sur un bon est oubliée',
    banc: 'verif:stats', fichier: STATS,
    de: '  return arrondi(acompteRdv(rdv) + bonReste(rdv.bon_cadeau_montant, retoursDuRdv))',
    vers: '  return arrondi(acompteRdv(rdv))' },

  { nom: '🔴 un bon rendu ne se déduit plus de la garantie',
    banc: 'verif:stats', fichier: REGLE,
    de: '  const rendu = (mouvements || []).reduce((s, m) => s + (Number(m?.montant) || 0), 0)',
    vers: '  const rendu = 0' },

  { nom: '🔴 un retour plus gros que le bon creuse un négatif',
    banc: 'verif:stats', fichier: REGLE,
    de: '  return arrondi(Math.max(0, porte - rendu))',
    vers: '  return arrondi(porte - rendu)' },

  { nom: '🔴 le no-show gonfle le nombre de rendez-vous honorés',
    banc: 'verif:stats', fichier: STATS,
    de: '    nb_rdv: honores.length,',
    vers: '    nb_rdv: honores.length + noShows.length,' },

  { nom: '🔴 la garantie du no-show ne passe plus pour du Stripe',
    banc: 'verif:stats', fichier: STATS,
    de: '  const acomptes = [...honores, ...noShows].reduce((somme, r) => somme + acompteRdvEnLigne(r), 0)',
    vers: '  const acomptes = honores.reduce((somme, r) => somme + acompteRdvEnLigne(r), 0)' },

  { nom: '🔴 la route des chiffres n’a plus le bon du rendez-vous',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    de: 'stripe_refund_amount, bon_cadeau_montant, prestation_id',
    vers: 'stripe_refund_amount, prestation_id' },

  { nom: '🔴 SÉCURITÉ : les mouvements des stats ne sont plus bornés au commerce',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    de: '          .select(\'bon_id, montant, source, commande_id, rdv_id, created_at, bons_cadeaux!inner(commercant_id)\')',
    vers: '          .select(\'bon_id, montant, source, commande_id, rdv_id, created_at\')' },

  { nom: '🔴 les retours de bons ne remontent plus au calcul',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    de: '    const caActuel = chiffreAffaires(cmdActuelles, rdvActuels, aboActuels, retoursBons || [])',
    vers: '    const caActuel = chiffreAffaires(cmdActuelles, rdvActuels, aboActuels)' },

  { nom: '🔴 la règle du bon rendu est recopiée au lieu d’être empruntée',
    banc: 'verif:stats', fichier: STATS,
    de: 'import { resteApresRemboursement, indexerRetoursBons, bonReste } from \'./remboursements\'',
    vers: 'import { resteApresRemboursement } from \'./remboursements\'\nconst indexerRetoursBons = () => ({ parRdv: new Map(), parCommande: new Map() })\nconst bonReste = (p) => Math.max(0, Number(p) || 0)' },

  // ─── LA MÉTADONNÉE QUI SUR-PONDÉRAIT LA COMMANDE ─────────────────────────
  { nom: '🔴 la métadonnée reprend le prix brut des produits',
    banc: 'verif:stats', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '            produits_montant: String(vent.produitsAPayer),',
    vers: '            produits_montant: String(produitsCents / 100),' },

  // ─── LE FRAIS RETENU D'UNE VENTE ANNULÉE (03/09) ─────────────────────────
  { nom: '🔴 le frais retenu d’une vente annulée redisparaît',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      const fraisPerdu = arrondi(c.stripe_frais)',
    vers: '      const fraisPerdu = 0' },

  // ⚠️ CETTE MUTATION REMET LA GARDE QUE J'AVAIS ÉCRITE LE MATIN MÊME, et qui
  // ne se déclenchait JAMAIS en production : sept commandes exclues portent un
  // frais Stripe, aucune ne porte `stripe_refund_amount`.
  { nom: '🔴 le frais retenu réexige un remboursement enregistré, et ne sort plus jamais',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      if (fraisPerdu > 0) {',
    vers: '      if (fraisPerdu > 0 && Number(c.stripe_refund_amount) > 0) {' },

  { nom: '🔴 une vente jamais payée écrit un frais qu’elle n’a pas eu',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      const fraisPerdu = arrondi(c.stripe_frais)',
    vers: '      const fraisPerdu = arrondi(c.stripe_frais) || 0.01' },

  { nom: '🔴 la ligne de frais ressuscite le chiffre d’affaires de la vente',
    banc: 'verif:comptable', fichier: MODULE,
    de: '          total: 0,\n          parTaux: {},',
    vers: '          total: arrondi(c.total),\n          parTaux: {},' },

  { nom: '🔴 le net d’un frais retenu devient positif',
    banc: 'verif:comptable', fichier: MODULE,
    de: '          netStripe: arrondi(-fraisPerdu),',
    vers: '          netStripe: arrondi(fraisPerdu),' },

  { nom: '🔴 le frais retenu est daté du remboursement au lieu de la vente',
    banc: 'verif:comptable', fichier: MODULE,
    de: '          date: jourComptable(c.created_at, c.date_commande),',
    vers: '          date: jourComptable(c.stripe_refund_date, c.created_at),' },

  { nom: '🔴 le fichier n’explique plus sa ligne à zéro',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  if (fraisRetenus > 0) {',
    vers: '  if (fraisRetenus > 0 && false) {' },

  // ─── LA VENTE D'UN BON CADEAU (03/09) ────────────────────────────────────
  { nom: '🔴 la vente d’un bon cadeau redevient invisible',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  for (const b of bons) {',
    vers: '  for (const b of []) {' },

  { nom: '🔴 l’encaissement d’un bon vendu quitte sa colonne',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      venteBon: usageUnique ? 0 : montant,',
    vers: '      venteBon: 0,' },

  { nom: '🔴 un bon à usage unique ne porte plus son chiffre d’affaires',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      total: usageUnique ? montant : 0,\n      parTaux: usageUnique ? { [cle]: montant } : {},',
    vers: '      total: 0,\n      parTaux: {},' },

  { nom: '🔴 un bon à usages multiples se met à porter de la TVA à la vente',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      total: usageUnique ? montant : 0,\n      parTaux: usageUnique ? { [cle]: montant } : {},',
    vers: '      total: montant,\n      parTaux: { [cle]: montant },' },

  // ⚠️ CELLE-CI EST LA PLUS IMPORTANTE DU LOT : le fichier quitte
  // l'application, un code encore chargé qui s'y trouverait serait dépensable
  // par quiconque l'ouvre.
  { nom: '🔴 SÉCURITÉ : le code du bon part dans le fichier comptable',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      reference: `BON${String(b.id || \'\').slice(0, 8)}`,',
    vers: '      reference: String(b.code || \'\'),' },

  { nom: '🔴 un bon sans date de paiement se voit inventer un jour',
    banc: 'verif:comptable', fichier: MODULE,
    // ⚠️ PREMIÈRE VERSION RESTÉE VERTE : elle repliait sur la date du JOUR, qui
    // tombe hors de la période du jeu d'essai, donc la ligne s'excluait toute
    // seule et le banc ne voyait rien. Une mutation doit changer le RÉSULTAT.
    de: '    const date = jourComptable(b.paye_le)',
    vers: '    const date = jourComptable(b.paye_le, b.created_at)' },

  { nom: '🔴 un bon jamais payé entre quand même au journal',
    banc: 'verif:comptable', fichier: MODULE,
    de: "    if (!b || String(b.statut || '') === 'paiement_en_attente') continue",
    vers: '    if (!b) continue' },

  // ─── LA TVA COMPTÉE DEUX FOIS ────────────────────────────────────────────
  { nom: '🔴 la part déjà taxée à la vente est recomptée à l’utilisation',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    const parBonDejaTaxe = partDejaTaxee(c, regimeParBon, parBon)',
    vers: '    const parBonDejaTaxe = 0' },

  { nom: '🔴 le chiffre d’affaires de la commande ignore la part déjà taxée',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    const caLigne = arrondi(totalNet - parBonDejaTaxe)',
    vers: '    const caLigne = arrondi(totalNet)' },

  { nom: '🔴 la colonne « payé par bon » reprend la part déjà taxée',
    banc: 'verif:comptable', fichier: MODULE,
    de: '      bonCadeau: parBonAImposer,',
    vers: '      bonCadeau: parBon,' },

  { nom: '🔴 le rendez-vous retaxe un bon déjà taxé à sa vente',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    const parBonRdvDejaTaxe = partDejaTaxee(r, regimeParBon, parBonRdv)',
    vers: '    const parBonRdvDejaTaxe = 0' },

  { nom: '🔴 la part déjà taxée n’est plus plafonnée au montant de la ligne',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  return arrondi(Math.min(arrondi(brut), Math.max(0, arrondi(plafond))))',
    vers: '  return arrondi(brut)' },

  // ─── LA RÈGLE DU RÉGIME ──────────────────────────────────────────────────
  { nom: '🔴 un commerce à taux unique n’émet plus de bons à usage unique',
    banc: 'verif:comptable', fichier: 'lib/bons-tva.js',
    de: '  if (candidats.length === 1) return { regime: USAGE_UNIQUE, taux: candidats[0] }',
    vers: '  if (candidats.length === 99) return { regime: USAGE_UNIQUE, taux: candidats[0] }' },

  { nom: '🔴 un bon sans régime écrit bascule en usage unique',
    banc: 'verif:comptable', fichier: 'lib/bons-tva.js',
    de: "  return String(bon?.tva_regime || '') === USAGE_UNIQUE ? USAGE_UNIQUE : USAGE_MULTIPLE",
    vers: '  return USAGE_UNIQUE' },

  { nom: '🔴 l’usage unique se réclame sans qu’aucun taux ne soit connu',
    banc: 'verif:comptable', fichier: 'lib/bons-tva.js',
    de: '    return taux === null\n      ? { regime: USAGE_MULTIPLE, taux: null }\n      : { regime: USAGE_UNIQUE, taux }',
    vers: '    return { regime: USAGE_UNIQUE, taux }' },

  // ─── LE JOURNAL ET LA ROUTE ──────────────────────────────────────────────
  { nom: '🔴 le journal du jour n’agrège plus la vente de bons',
    banc: 'verif:comptable', fichier: MODULE,
    de: '    j.venteBon = arrondi(j.venteBon + (Number(l.venteBon) || 0))',
    vers: '    j.venteBon = arrondi(j.venteBon)' },

  { nom: '🔴 le fichier n’explique plus que l’égalité gagne un terme',
    banc: 'verif:comptable', fichier: MODULE,
    de: '  if (ventesBons > 0) {',
    vers: '  if (ventesBons > 0 && false) {' },

  { nom: '🔴 la route ne lit plus le régime de TVA des bons',
    banc: 'verif:comptable', fichier: ROUTE,
    de: 'stripe_frais, stripe_net, tva_regime, tva_taux, acheteur_prenom',
    vers: 'stripe_frais, stripe_net, tva_taux, acheteur_prenom' },

  { nom: '🔴 la route ne sait plus quels bons ont payé une commande',
    banc: 'verif:comptable', fichier: ROUTE,
    de: 'client_nom, bons_utilises, commande_articles(',
    vers: 'client_nom, commande_articles(' },

  { nom: '🔴 la route ne sait plus quels bons ont payé un rendez-vous',
    banc: 'verif:comptable', fichier: ROUTE,
    de: 'client_prenom, client_nom, bons_utilises',
    vers: 'client_prenom, client_nom' },

  { nom: '🔴 les bons ne remontent plus jusqu’au calcul',
    banc: 'verif:comptable', fichier: ROUTE,
    de: '      bons: bons || [],',
    vers: '      bons: [],' },

  // ⚠️ CELLE-CI MESURE LE FILET, PAS LE CODE. J'ai écrit `prestations` au lieu
  // de `rdv_prestations` le 03/09 : Supabase ne lève pas sur une table absente,
  // elle rend un vide, et la déduction du régime a tourné sans aucune
  // prestation. L'audit le VOYAIT et affichait « NON JUGÉE ». Il rougit
  // désormais, et cette mutation le prouve.
  { nom: '🔴 l’alimentaire fige un usage unique sur un catalogue inachevé',
    banc: 'verif:comptable', fichier: 'lib/bons-tva.js',
    de: "  if (CATEGORIES_A_TAUX_MELANGES.includes(String(categorie || ''))) {",
    vers: '  if (false) {' },

  { nom: '🔴 la catégorie ne remonte plus jusqu’à la règle',
    banc: 'verif:comptable', fichier: 'lib/bons-cadeaux-server.js',
    de: '      categorie: commercant.categorie,',
    vers: '      categorie: null,' },

  { nom: '🔴 une table qui n’existe pas repasse en silence',
    banc: 'audit:colonnes', fichier: 'lib/bons-cadeaux-server.js',
    de: "      supabase.from('rdv_prestations').select('tva_taux').eq('commercant_id', id),",
    vers: "      supabase.from('prestations').select('tva_taux').eq('commercant_id', id)," },
]

function lancer(banc) {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ DISTINGUER UN BANC QUI ROUGIT D'UN BANC QUI PLANTE : un plantage n'a
    // rien prouvé, il a seulement empêché la mesure.
    const aRougiProprement = /en échec|ÉCHEC\(S\)/.test(sortie)
    return { rouge: true, plante: !aRougiProprement, extrait: sortie.slice(-320) }
  }
}

for (const banc of [...new Set(MUTATIONS.map(m => m.banc))]) {
  const avant = lancer(banc)
  if (avant.rouge) { console.log(`✕ ${banc} DÉJÀ rouge.`); console.log(avant.extrait); process.exit(1) }
}
console.log('Bancs verts au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ UN TEXTE INTROUVABLE EST UNE NON-MESURE QUI PASSE POUR UNE MESURE.
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  // ⚠️ ET UNE ANCRE QUI MATCHE DEUX ENDROITS MUTE LE MAUVAIS (vécu le 01/09) :
  // le banc visé restait vert pendant qu'un autre gabarit changeait.
  const occurrences = original.split(m.de).length - 1
  if (occurrences > 1) {
    manquees.push(`${m.nom} — ANCRE AMBIGUË (${occurrences} endroits)`)
    console.log(`  ? ancre ambiguë : ${m.nom}`)
    continue
  }
  writeFileSync(f, original.replace(m.de, m.vers), 'utf8')
  const res = lancer(m.banc)
  writeFileSync(f, original, 'utf8')
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach(x => console.log('   • ' + x)) }

let finalRouge = false
for (const banc of [...new Set(MUTATIONS.map(m => m.banc))]) {
  const res = lancer(banc)
  if (res.rouge) {
    finalRouge = true
    console.log(`🔴 ${banc} ROUGE APRÈS RESTAURATION.`)
    console.log(`   ${res.plante ? 'PLANTAGE' : 'ÉCHEC DE BANC'} — ${(res.extrait || '').trim().split('\n').slice(-6).join('\n   ')}`)
  }
}
console.log(finalRouge ? '' : '\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
