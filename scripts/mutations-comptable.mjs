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
    de: '        remboursements: retoursPlafonnes(retours.parRdv.get(r.id), parBonRdv),',
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
    de: '      retoursBons: mouvementsBons || [],\n      periode: { du, au },',
    vers: '      retoursBons: mouvementsBons || [],\n      periode: null,' },

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

  { nom: '🔴 la règle du remboursement est recopiée au lieu d’être empruntée',
    banc: 'verif:stats', fichier: STATS,
    de: 'import { resteApresRemboursement } from \'./remboursements\'',
    vers: 'const resteApresRemboursement = (e, r) => Math.max(0, Math.min(Number(e) || 0, (Number(e) || 0) - (Number(r) || 0)))' },

  { nom: '🔴 la route des chiffres n’a plus le remboursement des commandes',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    // ⚠️ ANCRE RECALÉE LE 02/09 : deux colonnes ont été ajoutées au même
    // `select` dans la foulée. Un texte introuvable est une NON-mesure qui
    // passe pour une mesure, donc le harnais la compte comme manquée.
    de: 'total, fidelite_remise, stripe_refund_amount, paye_en_ligne',
    vers: 'total, fidelite_remise, paye_en_ligne' },

  { nom: '🔴 la route des chiffres n’a plus celui des rendez-vous',
    banc: 'verif:stats', fichier: ROUTE_STATS,
    de: 'fidelite_remise, stripe_refund_amount, prestation_id',
    vers: 'fidelite_remise, prestation_id' },

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
