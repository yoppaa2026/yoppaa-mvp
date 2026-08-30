// HARNAIS DE MUTATION — L'ARGENT DU RENDEZ-VOUS (29/08).
//
// 🔴 CE QU'ON MESURE : que `verif:tunnel-rdv` aurait attrapé les cinq défauts
// qu'Alex a trouvés en production. Un banc écrit APRÈS la correction verdit sur
// un dépôt déjà réparé : ça ne prouve rien. Il faut lui remettre chaque défaut
// sous le nez, un par un.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON : un banc qui
// PLANTE au lieu de rougir n'est pas une mesure, c'est un accident.
//
//   node scripts/mutations-tunnel-rdv.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:tunnel-rdv'

const MUTATIONS = [
  // ─── 1) LE DÉFAUT PRINCIPAL : LE BON NON RECRÉDITÉ ──────────────────────
  // ⚠️ LE GESTE A DÉMÉNAGÉ DANS UN MODULE (30/08 au soir). Il vivait en DEUX
  // exemplaires, un par route d'annulation, et les trois corrections des trois
  // derniers jours n'en ont touché qu'un à chaque fois.
  { nom: '🔴 le bon n’est plus recrédité à l’annulation',
    fichier: 'lib/rdv-annulation-server.js',
    de: '    const rec = await recrediterBon(db, bonId, Number(bonMontant), refs)',
    vers: '    const rec = { ok: true }' },

  { nom: '🔴 la colonne du bon disparaît du select d’annulation',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '      prix_estime, fidelite_remise, bon_cadeau_id, bon_cadeau_montant,',
    vers: '      prix_estime, fidelite_remise,' },

  // ⚠️ LE FRÈRE : la commande liée porte sa propre part de bon depuis que le
  // bon paie les produits. L'oublier laisse la moitié du bon dans le vide.
  { nom: '🔴 les avantages de la commande liée ne sont plus rendus',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '        bonId: commandeLiee.bon_cadeau_id,',
    vers: '        bonId: null,' },

  // ─── 2) LE REMBOURSEMENT QUI RENDRAIT PLUS QUE LE PRÉLÈVEMENT ───────────
  { nom: '🔴 le remboursement porte sur le brut, bon compris',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '          - Number(commandeLiee.bon_cadeau_montant || 0)\n          - Number(commandeLiee.fidelite_remise || 0)))',
    vers: '          - 0))' },

  // ─── 3) L'ANNULATION COMMERÇANT QUI NE REMBOURSAIT RIEN ────────────────
  { nom: '🔴 le tableau de bord réécrit le statut sans passer par le serveur',
    fichier: 'app/dashboard/page.js',
    de: "      const res = await postPro('/api/rdv/annuler-commercant', { rdv_id: rdvId, raison })",
    vers: "      const res = await postPro('/api/emails/rdv-annule', { rdv_id: rdvId, raison })" },

  { nom: '🔴 la route d’annulation commerçant perd sa garde d’autorisation',
    fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: "    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)",
    vers: '    const verdict = { ok: true }' },

  // ─── 4) LE WEBHOOK QUI COUPAIT LA BRANCHE COMMANDE ────────────────────
  { nom: '🔴 le webhook recommence à sortir dès qu’il trouve le rendez-vous',
    fichier: 'app/api/stripe/webhook/route.js',
    de: "    console.info('[stripe/webhook] refund enregistré sur RDV', { rdvId: rdv.id, refund: refund.id })\n  }",
    vers: "    console.info('[stripe/webhook] refund enregistré sur RDV', { rdvId: rdv.id, refund: refund.id })\n    return\n  }" },

  // ─── 5) LA VENTILATION : LE SENS NE DOIT JAMAIS S'INVERSER ────────────
  // 🔴 C'EST LE CŒUR. Si le bon cesse de mordre sur les produits, on revient
  // exactement au défaut qu'Alex a vu : le bon fond, le montant ne bouge pas.
  { nom: '🔴 le bon ne paie plus les produits',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: '  const bonSurProduits = arrondi(Math.min(bonRestant, produitsApresRecompense))',
    vers: '  const bonSurProduits = 0' },

  // ⚠️ L'ORDRE : bon avant récompense, et le porteur du bon brûlerait du solde
  // sur une part qui lui était offerte de toute façon.
  { nom: '🔴 la récompense passe APRÈS le bon',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: '  const prestaApresRecompense = prix === null ? null : arrondi(Math.max(0, prix - recompenseSurPresta))',
    vers: '  const prestaApresRecompense = prix === null ? null : arrondi(Math.max(0, prix))' },

  // ⚠️ F22 : l'acompte se calcule sur le NET. C'est la règle d'Alex du 24/08,
  // et c'est aussi la source du « 8,75 € payé en ligne » quand elle est ignorée.
  { nom: '🔴 l’acompte se recalcule sur le prix PLEIN (le 8,75 € d’Alex)',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: '    ? arrondi(Math.round(prestaApresRecompense * pct) / 100)',
    vers: '    ? arrondi(Math.round((prix || 0) * pct) / 100)' },

  // 🔴 LA RÈGLE DU 30/08 AU SOIR : LE BON SE DÉDUIT DE L'ACOMPTE, EURO POUR
  // EURO. Revenir à « un pourcentage de ce qui reste » recrée le 5 € réclamé à
  // quelqu'un qui venait d'engager 40 € de bon.
  { nom: '🔴 l’acompte redevient un pourcentage de ce qui reste après le bon',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: '    : arrondi(Math.min(Math.max(0, acompteDu - bonSurPresta), prestaNette))',
    vers: '    : arrondi(Math.round(prestaNette * pct) / 100)' },

  // ⚠️ ET IL NE DÉPASSE JAMAIS CE QUI RESTE À PAYER.
  { nom: '🔴 un pourcentage au-delà de 100 fait avancer plus que la prestation',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: '    : arrondi(Math.min(Math.max(0, acompteDu - bonSurPresta), prestaNette))',
    vers: '    : arrondi(Math.max(0, acompteDu - bonSurPresta))' },

  // ─── 11) CE QUI REVIENT S'ANNONCE, MÊME SI CE N'EST PAS NOUS (30/08 soir) ─
  //
  // 🔴 LA MUTATION QUI COMPTE LE PLUS DE CE FICHIER : c'est le défaut exact
  // qu'Alex a lu sur son email, le bon annoncé et la récompense muette.
  { nom: '🔴 la récompense ne s’annonce que si c’est NOUS qui l’avons rendue',
    fichier: 'lib/rdv-annulation-server.js',
    de: '      rendu.recompense = arr(recompenseMontant)',
    vers: '      if (recFid.utilisee_at) rendu.recompense = arr(recompenseMontant)' },

  { nom: '🔴 un bon déjà recrédité par le webhook redevient muet',
    fichier: 'lib/rdv-annulation-server.js',
    de: '    else rendu.bon = arr(bonMontant)',
    vers: '    else if (!rec.deja_recredite) rendu.bon = arr(bonMontant)' },

  { nom: '🔴 une récompense déjà libre ne fait plus crier personne',
    fichier: 'lib/rdv-annulation-server.js',
    de: '      else console.warn(`[${ou}] récompense déjà libre à l’annulation`, { recompenseId, ...refs })',
    vers: '' },

  { nom: '🔴 la même récompense est comptée deux fois, rendez-vous et commande',
    fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '        recompenseId: memeRecompense ? null : commandeLiee.fidelite_recompense_id,',
    vers: '        recompenseId: commandeLiee.fidelite_recompense_id,' },

  // ─── 12) LE COMMERÇANT NE SAIT PAS CE QU'IL DÉCLENCHE (30/08 soir) ───────
  { nom: '🔴 la fenêtre d’annulation reparle du seul acompte',
    fichier: 'lib/confirmation-rdv.js',
    de: '    const liste = libelleRetours(r)',
    vers: "    const liste = ''" },

  { nom: '🔴 les produits mis de côté ne sont plus comptés',
    fichier: 'lib/rdv-paiement.js',
    de: '  const produits = vivante\n    ? arr(Math.max(0, n(cmd.total) - n(cmd.bon_cadeau_montant) - n(cmd.fidelite_remise)))\n    : 0',
    vers: '  const produits = 0' },

  // ⚠️ LE BRUT N'EST PAS CE QUE LA CARTE A PAYÉ : promettre le brut promet plus
  // que ce que Stripe peut rendre.
  { nom: '🔴 la part des produits payée par bon est promise sur la carte',
    fichier: 'lib/rdv-paiement.js',
    de: '    ? arr(Math.max(0, n(cmd.total) - n(cmd.bon_cadeau_montant) - n(cmd.fidelite_remise)))',
    vers: '    ? arr(Math.max(0, n(cmd.total)))' },

  { nom: '🔴 une commande déjà annulée est remboursée une seconde fois',
    fichier: 'lib/rdv-paiement.js',
    de: "  const vivante = !!cmd && !['annulee_client_refund', 'annulee_paiement_ko'].includes(cmd.statut)",
    vers: '  const vivante = !!cmd' },

  { nom: '🔴 la fenêtre d’après redevient muette sur l’argent parti',
    fichier: 'lib/confirmation-rdv.js',
    de: '    return `${base}${retours ? libelleRetoursFaits(retours) : \'\'}`',
    vers: '    return base' },

  // 🔴 UN REMBOURSEMENT RATÉ QUI SE TAIT EST PIRE QUE PAS DE MESSAGE : le
  // commerçant l'apprend par une réclamation, des semaines plus tard.
  { nom: '🔴 un remboursement Stripe raté est noyé dans les bonnes nouvelles',
    fichier: 'lib/rdv-paiement.js',
    de: '  if (refund_error) {',
    vers: '  if (false) {' },

  { nom: '🔴 le no-show ne parle plus du bon cadeau gardé',
    fichier: 'lib/confirmation-rdv.js',
    de: "      r.surBon > 0 ? `${euros(r.surBon)} de bon cadeau` : '',",
    vers: "      ''," },

  { nom: '🔴 le tableau de bord ne montre plus au commerçant ce qui est parti',
    fichier: 'app/dashboard/page.js',
    de: '      surRetours: (r) => { retours = r },',
    vers: '' },

  // ⚠️ LA COLONNE ABSENTE D'UN SELECT, septième occurrence.
  { nom: '🔴 la commande jointe reperd ses colonnes d’avantage',
    fichier: 'app/dashboard/page.js',
    de: 'statut, bon_cadeau_montant, fidelite_remise, commande_articles(',
    vers: 'statut, commande_articles(' },

  // ─── 13) LE CLIENT ET SES PRODUITS ──────────────────────────────────────
  { nom: '🔴 l’email d’annulation ne dit plus le sort des produits remboursés',
    fichier: 'lib/resend.js',
    de: '        } else if (desProduits > 0) {',
    vers: '        } else if (false) {' },

  { nom: '🔴 le no-show ne dit plus au client que son bon reste au commerçant',
    fichier: 'lib/resend.js',
    de: '        const surBon = Number(bon_cadeau_montant) || 0',
    vers: '        const surBon = 0' },

  { nom: '🔴 la route du no-show ne charge plus la colonne du bon',
    fichier: 'app/api/emails/rdv-no-show/route.js',
    de: '        bon_cadeau_montant,\n',
    vers: '' },

  { nom: '🔴 le stock des versions n’est plus rendu à l’annulation d’un RDV',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '        const rest = await restaurerStockVariantes(supabase, [commandeLiee.id])',
    vers: '        const rest = { ok: true }' },

  { nom: '🔴 la récompense promet de nouveau une baisse « d’autant » de l’acompte',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '${totalProduits > 0 ? \'Déduite de ta prestation et de tes produits\' : \'Déduite du prix\'}, ton acompte se calcule sur ce qui reste.`',
    vers: '${totalProduits > 0 ? \'Déduite de ta prestation et de tes produits\' : \'Déduite du prix\'}, ton acompte baisse d’autant.`' },

  // ⚠️ LE PIÈGE DU ZÉRO, sixième fois : `Number(null)` vaut 0 et EST fini.
  { nom: '🔴 un prix absent devient zéro au lieu de rester inconnu',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: "  if (v === null || v === undefined || v === '') return null",
    vers: '  if (false) return null' },

  // 🔴 LA RÉCOMPENSE PAIE LES PRODUITS AUSSI (30/08) : la retenir sur la seule
  // prestation recrée l'incohérence qu'Alex a trouvée en posant la question
  // des produits seuls.
  { nom: '🔴 la récompense redevient prisonnière de la prestation',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: '  const recompenseSurProduits = arrondi(Math.min(recompenseRestante, produits))',
    vers: '  const recompenseSurProduits = 0' },

  // ⚠️ ET JAMAIS AU-DELÀ DU PANIER : sans plafond, une récompense de 100 €
  // sur un panier de 70 € rendrait des montants négatifs.
  { nom: '🔴 la récompense n’est plus plafonnée au panier',
    fichier: 'lib/tunnel-rdv-montants.js',
    de: '  const recompenseSurPresta = prix === null ? 0 : arrondi(Math.min(recompenseRestante, prix))',
    vers: '  const recompenseSurPresta = prix === null ? 0 : recompenseRestante' },

  // ⚠️ LES DEUX PARTS DOIVENT ATTERRIR SUR LES DEUX OBJETS.
  { nom: '🔴 la part produits de la récompense ne s’écrit plus sur la commande',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '        ...(vent.recompenseSurProduits > 0 ? { fidelite_remise: vent.recompenseSurProduits } : {}),',
    vers: '' },

  { nom: '🔴 le rendez-vous reçoit la remise TOTALE, comptée deux fois',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '              fidelite_remise: String(vent.recompenseSurPresta),',
    vers: '              fidelite_remise: String(vent.remiseRecompense),' },

  // 🔴 ET L'ASSIETTE : la calculer sur la seule prestation, c'est refuser au
  // client une remise qu'il a gagnée.
  { nom: '🔴 l’assiette de la récompense retombe sur la prestation seule',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    const assietteRecompense = arrondiEuros((prixBase || 0) + produitsCents / 100)',
    vers: '    const assietteRecompense = arrondiEuros(prixBase || 0)' },

  // ⚠️ ET LA LIGNE STRIPE : ne regarder que le bon ferait payer au client des
  // produits que sa récompense vient de couvrir.
  { nom: '🔴 la ligne Stripe ignore la récompense sur les produits',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    const deduitSurProduits = (vent.bonSurProduits + vent.recompenseSurProduits) > 0',
    vers: '    const deduitSurProduits = vent.bonSurProduits > 0' },

  // ⚠️ L'ANNULATION : une récompense qui a payé des produits gardés reste
  // consommée, sinon le client emporte une remise gratuite.
  { nom: '🔴 la récompense revient même quand elle a payé des produits gardés',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '    const recompenseSurProduitsGardes = gardeSesProduits\n      && Number(commandeLiee?.fidelite_remise || 0) > 0',
    vers: '    const recompenseSurProduitsGardes = false' },

  // ─── 6) CE QUE LE CLIENT LIT ─────────────────────────────────────────
  { nom: '🔴 le suivi Yopper réaffiche le tarif plein',
    fichier: 'lib/rdv-paiement.js',
    de: '  const bon = nombre(rdv?.bon_cadeau_montant) || 0\n  return Math.round(Math.max(0, prix - remise - bon) * 100) / 100',
    vers: '  return Math.round(Math.max(0, prix - remise) * 100) / 100' },

  { nom: '🔴 l’historique réaffiche le statut technique « confirme »',
    fichier: 'app/commander/page.js',
    de: "                        confirme:           { label: 'Rendez-vous passé',          bg: '#F5F3FF', color: '#6B35C4' },",
    vers: '' },

  // ─── 7) L'EMAIL QUI SE TAIT ──────────────────────────────────────────
  { nom: '🔴 l’email d’annulation ne dit plus le bon recrédité',
    fichier: 'lib/resend.js',
    de: '        if (surBon > 0) {',
    vers: '        if (false) {' },

  // ─── 8) LA COMPTABILITÉ AVEUGLE ──────────────────────────────────────
  { nom: '🔴 le journal comptable reperd le bon cadeau des rendez-vous',
    fichier: 'lib/export-comptable.js',
    de: '    if (parBonRdv > 0) {',
    vers: '    if (false) {' },

  { nom: '🔴 la route comptable ne charge plus la colonne du bon',
    fichier: 'app/api/dashboard/export-comptable/route.js',
    de: 'acompte_paye_en_ligne, bon_cadeau_montant, fidelite_remise, tva_taux',
    vers: 'acompte_paye_en_ligne, tva_taux' },

  // ─── 9) LES DEUX BOUTS DU FIL (30/08) ────────────────────────────────
  // 🔴 LE DÉFAUT QUI A BLOQUÉ ALEX : l'appel partait sans jeton, la route
  // exigeait une identité prouvée, et le paiement se refusait tout seul.
  { nom: '🔴 l’appel au tunnel avec produits repart sans preuve d’identité',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: "const res = await fetchAvecPreuveSiConnecte('/api/stripe/checkout/create-rdv-commande'",
    vers: "const res = await fetch('/api/stripe/checkout/create-rdv-commande'" },

  { nom: '🔴 le récapitulatif redevient muet sur le bon cadeau',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                          {remiseBon > 0 && (',
    vers: '                          {false && (' },

  { nom: '🔴 le récapitulatif redevient muet sur la récompense',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                          {remiseFid > 0 && (',
    vers: '                          {false && (' },

  // ─── 10) LA CRÉATION DE RÉSERVATION, MESURÉE EN L'EXÉCUTANT (30/08) ──
  //
  // ⚠️ CES MUTATIONS-LÀ SONT LES PLUS IMPORTANTES DU FICHIER. Le lieu, la
  // capacité, la place et la TVA vivaient en QUATRE copies, et les gardes qui
  // les surveillaient cherchaient `place_no:` dans quatre fichiers : une FORME,
  // pas une RÈGLE. Une place figée à 1 serait passée sans un rougissement.
  { nom: '🔴 la place se COMPTE au lieu de chercher la première libre',
    fichier: 'lib/rdv-creation-server.js',
    de: '    placeNo = premierePlaceLibre(prestation, (dejaLa || []).map(r => r.place_no)) || 1',
    vers: '    placeNo = (dejaLa || []).length + 1' },

  { nom: '🔴 la capacité gravée retombe à 1, la contrainte bloque le 2e inscrit',
    fichier: 'lib/rdv-creation-server.js',
    de: '    capacite_creneau: capacite,',
    vers: '    capacite_creneau: 1,' },

  { nom: '🔴 la TVA n’est plus figée à la réservation',
    fichier: 'lib/rdv-creation-server.js',
    de: '    tva_taux: prestation.tva_taux ?? null,',
    vers: '    tva_taux: null,' },

  // 🔴 L'ORDRE DU SPREAD : un appelant pourrait alors imposer sa propre place,
  // et on recrée exactement la divergence que le module existe pour tuer.
  { nom: '🔴 l’appelant peut imposer sa place, sa capacité et sa TVA',
    fichier: 'lib/rdv-creation-server.js',
    de: '    capacite_creneau: capacite,\n    place_no: placeNo,\n  }',
    vers: '    capacite_creneau: capacite,\n    place_no: placeNo,\n    ...champs,\n  }' },

  // 🔴 CROISER DEUX IDENTIFIANTS SANS VÉRIFIER LEUR LIEN : la prestation d’un
  // salon se réserverait dans l’agenda d’un autre.
  { nom: '🔴 la prestation n’est plus rattachée à son commerce',
    fichier: 'lib/rdv-creation-server.js',
    de: "  if (String(prestation.commercant_id) !== String(commercantId)) {",
    vers: '  if (false) {' },

  // ⚠️ UN RENDEZ-VOUS ANNULÉ LIBÈRE SA PLACE : la compter la rendrait
  // introuvable, et un cours à moitié vide afficherait complet.
  { nom: '🔴 un rendez-vous annulé occupe encore sa place',
    fichier: 'lib/rdv-creation-server.js',
    de: "      .in('statut', STATUTS_OCCUPENT)",
    vers: "      .in('statut', ['confirme', 'honore', 'annule_client'])" },

  // 🔴 LE LIEU EXPLICITE DE LA PLAGE : sans lui, la confirmation envoie au
  // siège social, donc au DOMICILE d’une commerçante inscrite chez elle.
  { nom: '🔴 le lieu explicite de la plage est ignoré',
    fichier: 'lib/rdv-creation-server.js',
    de: '  const lieu = await champsLieuPour(db, commercant, { jour: dateRdv, heure, lieuId })',
    vers: '  const lieu = await champsLieuPour(db, commercant, { jour: dateRdv, heure })' },

  { nom: '🔴 un chevauchement de praticien devient une panne technique',
    fichier: 'lib/rdv-creation-server.js',
    de: "    if (error.code === '23505' || error.code === '23P01') {",
    vers: "    if (error.code === '23505') {" },

  { nom: '🔴 un cours complet dit « ce créneau vient d’être pris »',
    fichier: 'lib/rdv-creation-server.js',
    de: "      return { ok: false, code: 'place_prise', collectif: capacite > 1 }",
    vers: "      return { ok: false, code: 'place_prise', collectif: false }" },

  // ─── 11) LA ROUTE SANS PAIEMENT ET SES GARDES ────────────────────────
  //
  // 🔴 LA GARDE QUI FAIT TENIR TOUT LE RESTE : sans elle, il suffit d’appeler
  // cette route pour réserver sans payer l’acompte du commerçant.
  { nom: '🔴 un acompte encaissable passe quand même sans paiement',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '    if (vent.acompte >= MINIMUM_STRIPE) {',
    vers: '    if (false) {' },

  { nom: '🔴 le forfait du commerçant n’est plus vérifié',
    fichier: 'app/api/rdv/reserver/route.js',
    de: "    const verdict = verdictForfait(commercant, 'rdv')",
    vers: '    const verdict = { ok: true }' },

  { nom: '🔴 l’interrupteur d’agenda n’est plus regardé',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '    if (!commercant.rdv_actif) {',
    vers: '    if (false) {' },

  { nom: '🔴 la récompense s’accorde sans identité prouvée',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '      const identite = await identiteProuvee(request)',
    vers: "      const identite = { email: client_email }" },

  { nom: '🔴 un créneau déjà passé est accepté',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '    if (isNaN(instant.getTime()) || instant.getTime() <= Date.now()) {',
    vers: '    if (false) {' },

  // 🔴 UN `client_id` FOURNI PAR L’APPELANT rattacherait le rendez-vous à la
  // fiche de n’importe qui.
  { nom: '🔴 la fiche client est désignée par l’appelant',
    fichier: 'app/api/rdv/reserver/route.js',
    de: "      const { data: fiche } = await db.from('clients').select('id').eq('email', email).maybeSingle()",
    vers: "      const { data: fiche } = await db.from('clients').select('id').eq('id', body.client_id).maybeSingle()" },

  // ─── 12) LE PANIER ENTIÈREMENT COUVERT ───────────────────────────────
  { nom: '🔴 « couvert sans paiement » n’est plus déduit du total',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    const couvertSansPaiement = totalCents === 0 && (!!bonCadeau || !!recompense)',
    vers: '    const couvertSansPaiement = false' },

  { nom: '🔴 la part produits du bon n’est plus débitée',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: "        const deb = await debiterBon(supabase, bonCadeau.id, vent.bonSurProduits, { source: 'commande', commande_id: commande.id })",
    vers: '        const deb = { ok: true }' },

  { nom: '🔴 un second débit raté laisse le premier dépensé',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '          if (vent.bonSurPresta > 0) await recrediterBon(supabase, bonCadeau.id, vent.bonSurPresta, { rdv_id: idRdv })',
    vers: '          if (false) await recrediterBon(supabase, bonCadeau.id, 0, {})' },

  { nom: '🔴 la commande couverte n’est plus marquée payée en ligne',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '          paye_en_ligne: true,',
    vers: '          paye_en_ligne: false,' },

  // ─── 13) L'ÉCRAN N'ÉCRIT PLUS LUI-MÊME ───────────────────────────────
  { nom: '🔴 la réservation sans paiement repart sans preuve d’identité',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: "        const res = await fetchAvecPreuveSiConnecte('/api/rdv/reserver', {",
    vers: "        const res = await fetch('/api/rdv/reserver', {" },
]

function lancer() {
  try {
    execSync(`npm run ${BANC}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ROUGIR N'EST PAS PLANTER. Un banc qui explose sur une exception ne
    // mesure rien : il faut qu'il ait COMPTÉ ses échecs.
    const aRougiProprement = /en échec/.test(sortie)
    return { rouge: true, plante: !aRougiProprement, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`✕ ${BANC} DÉJÀ rouge avant toute mutation.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  writeFileSync(f, original.replace(m.de, m.vers), 'utf8')
  const res = lancer()
  writeFileSync(f, original, 'utf8')

  // ⚠️ ON CONTRÔLE LA RESTAURATION. Un harnais qui abîme le dépôt coûte plus
  // cher que tout ce qu'il mesure.
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

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
