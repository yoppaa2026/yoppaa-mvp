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
import { ecrireSur } from './harnais-mutation.mjs'
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
    de: '    const rec = await recrediterBons(db, lignes, refs)',
    vers: '    const rec = { ok: true }' },

  { nom: '🔴 la colonne du bon disparaît du select d’annulation',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '      prix_estime, fidelite_remise, bon_cadeau_id, bon_cadeau_montant,',
    vers: '      prix_estime, fidelite_remise,' },

  // ⚠️ LE FRÈRE : la commande liée porte sa propre part de bon depuis que le
  // bon paie les produits. L'oublier laisse la moitié du bon dans le vide.
  { nom: '🔴 les avantages de la commande liée ne sont plus rendus',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '        bonsUtilises: lignesBonsDe(commandeLiee),',
    vers: '        bonsUtilises: [],' },

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
    // 🔴 CETTE MUTATION NE MUTAIT PLUS RIEN, ET LA MESURE L'A DIT (04/09).
    //
    // Elle ajoutait `if (!rec.deja_recredite)`. Or `recrediterBons`, la version
    // qui rend PLUSIEURS bons, agrège ses résultats par `boucler()` et ne
    // remonte que `{ ok, nom, resultats, echecs }` : `rec.deja_recredite` vaut
    // donc `undefined`, la condition est toujours vraie, et rien ne changeait.
    //
    // ⚠️ UNE MUTATION QUI NE MUTE RIEN EST UNE MUTATION MANQUÉE, pas une garde
    // faible. Le drapeau vit maintenant sur CHAQUE ligne de `rec.resultats`,
    // et le défaut du 30/08 se rejoue en ne comptant que ce qu'on a fait
    // soi-même au lieu de ce qui est revenu au Yopper.
    de: '    else rendu.bon = arr(lignes.reduce((s, l) => s + Number(l.montant), 0))',
    vers: '    else rendu.bon = arr((rec.resultats || []).filter(r => !r.deja_recredite).reduce((s, r) => s + Number(r.montant || 0), 0))' },

  // 🔴 L'ORDRE QUI SUPPRIME LA COURSE. Rembourser AVANT de rendre rouvre la
  // fenêtre où le webhook `charge.refunded` rend la récompense entre notre
  // re-crédit du bon et notre relecture. C'est ce qui s'est passé le 30/08,
  // traces en base à l'appui.
  //
  // ⚠️ MA PREMIÈRE VERSION NEUTRALISAIT L'APPEL SANS LE DÉPLACER, et la garde
  // est restée verte : elle mesure une POSITION, pas une présence. Le harnais
  // l'a dit. Celle-ci remet vraiment un remboursement en amont.
  { nom: '🔴 le remboursement Stripe repasse AVANT le retour des avantages',
    fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '    // ─── Ce qui n\'est pas de la carte revient AVANT le remboursement ────────',
    vers: '    await stripe.refunds.create({ payment_intent: rdv.stripe_payment_intent_id })' },

  { nom: '🔴 et pareil sur l’annulation par le client',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '    // ─── 4.7) CE QUI N\'EST PAS DE LA CARTE REVIENT, ET IL REVIENT D\'ABORD ───',
    vers: '    await stripe.refunds.create({ payment_intent: rdv.stripe_payment_intent_id })' },

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
    de: '    const liste = libelleRetours(r, categorie)',
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
    de: '    return `${base}${retours ? libelleRetoursFaits({ ...retours, categorie }) : \'\'}`',
    vers: '    return base' },

  // 🔴 UN REMBOURSEMENT RATÉ QUI SE TAIT EST PIRE QUE PAS DE MESSAGE : le
  // commerçant l'apprend par une réclamation, des semaines plus tard.
  { nom: '🔴 un remboursement Stripe raté est noyé dans les bonnes nouvelles',
    fichier: 'lib/rdv-paiement.js',
    de: '  if (refund_error) {',
    vers: '  if (false) {' },

  { nom: '🔴 la fenêtre du no-show ne dit plus la part gardée sur le bon',
    fichier: 'lib/rdv-paiement.js',
    de: '  if (part.gardeSurBon > 0) morceaux.push(`${euros(part.gardeSurBon)} pris sur son ${libelleBon(categorie)}`)',
    vers: '' },

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

  { nom: '🔴 le no-show ne dit plus au client ce qui reste au commerçant',
    fichier: 'lib/resend.js',
    de: '        const surBon = Number(bon_garde) || 0',
    vers: '        const surBon = 0' },

  { nom: '🔴 et il ne dit plus ce qui lui revient quand même',
    fichier: 'lib/resend.js',
    de: '        const surBon = Number(bon_restitue) || 0',
    vers: '        const surBon = 0' },

  { nom: '🔴 la route du no-show ne relaie plus les montants du partage',
    fichier: 'app/api/emails/rdv-no-show/route.js',
    de: '        bon_garde,\n        bon_restitue,\n        recompense_rendue,',
    vers: '' },

  { nom: '🔴 le stock des versions n’est plus rendu à l’annulation d’un RDV',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '        const rest = await restaurerStockVariantes(supabase, [commandeLiee.id])',
    vers: '        const rest = { ok: true }' },

  // ─── 14) LE NO-SHOW NE GARDE QUE LA GARANTIE (30/08 au soir) ────────────
  //
  // 🔴 LE DÉFAUT D'ORIGINE : le commerçant gardait le bon EN ENTIER, soit 40 €
  // retenus pour un service non rendu quand la garantie n'en valait que 25.
  { nom: '🔴 le commerçant regarde de nouveau tout le bon comme sa garantie',
    fichier: 'lib/rdv-paiement.js',
    de: '  const bonGarde = arr(Math.min(surBon, resteAImputer))',
    vers: '  const bonGarde = surBon' },

  // ⚠️ L'ARGENT COMPTANT S'IMPUTE EN PREMIER : sans ça on rend du bon tout en
  // gardant du liquide au-delà de la garantie.
  { nom: '🔴 l’acompte encaissé ne s’impute plus sur la garantie',
    fichier: 'lib/rdv-paiement.js',
    // ⚠️ RECIBLÉE LE 31/08 : la ligne lit désormais `gardeEnCaisse`, borné par
    // la garantie, et non plus `enCaisse` brut. La règle mesurée n'a pas bougé.
    de: '  const resteAImputer = Math.max(0, arr(garantie - gardeEnCaisse))',
    vers: '  const resteAImputer = Math.max(0, arr(garantie))' },

  // 🔴 LE PIÈGE DU ZÉRO, HUITIÈME FOIS : confondre « on ne sait pas » et
  // « rien n'était dû » ferait retenir de l'argent sur une supposition.
  { nom: '🔴 un acompte dû inconnu devient une garantie inventée',
    fichier: 'lib/rdv-paiement.js',
    de: '  const garantie = connu ? arr(brut) : enCaisse',
    vers: '  const garantie = arr(brut)' },

  { nom: '🔴 la récompense ne revient plus sur un no-show',
    fichier: 'lib/rdv-paiement.js',
    de: '    recompenseRendue: arr(rdv?.fidelite_remise),',
    vers: '    recompenseRendue: 0,' },

  { nom: '🔴 la fenêtre du no-show se tait sur ce qui revient',
    fichier: 'lib/confirmation-rdv.js',
    de: '    const { garde, rend } = libelleNoShow(part, categorie)',
    vers: "    const { garde } = libelleNoShow(part, categorie)\n    const rend = ''" },

  { nom: '🔴 un ancien rendez-vous ne dit plus qu’on ignore sa garantie',
    fichier: 'lib/confirmation-rdv.js',
    de: '    const inconnu = !part.connu && part.bonRestitue > 0',
    vers: '    const inconnu = false && part.bonRestitue > 0' },

  { nom: '🔴 le no-show se réécrit depuis le navigateur',
    fichier: 'app/dashboard/page.js',
    de: "      const res = await postPro('/api/rdv/no-show', { rdv_id: rdvId })",
    vers: "      const res = await postPro('/api/emails/rdv-no-show', { rdv_id: rdvId })" },

  { nom: '🔴 la route du no-show perd sa garde d’autorisation',
    fichier: 'app/api/rdv/no-show/route.js',
    de: "    const verdict = await gardeSurLigne(request, supabase, 'rdv_reservations', rdv_id)",
    vers: '    const verdict = { ok: true }' },

  // 🔴 RESTITUER LE BON ENTIER, C'EST RENDRE AU CLIENT UNE GARANTIE QUE LE
  // COMMERÇANT A LE DROIT DE GARDER.
  { nom: '🔴 le no-show restitue le bon entier au lieu du surplus',
    fichier: 'app/api/rdv/no-show/route.js',
    de: '      bonsUtilises: repartirRestitution(lignesBonsDe(rdv), part.bonRestitue),',
    vers: '      bonsUtilises: lignesBonsDe(rdv),' },

  { nom: '🔴 un rendez-vous annulé peut de nouveau être noté absent',
    fichier: 'app/api/rdv/no-show/route.js',
    de: "    if (rdv.statut === 'annule_client' || rdv.statut === 'annule_commercant') {",
    vers: '    if (false) {' },

  { nom: '🔴 le no-show rejoué restitue une seconde fois',
    fichier: 'app/api/rdv/no-show/route.js',
    de: "      .neq('statut', 'no_show')",
    vers: '' },

  // ⚠️ L'ACOMPTE DÛ DOIT ÊTRE FIGÉ À LA RÉSERVATION, comme la TVA et le lieu.
  // ⚠️ CES DEUX-LÀ RETIRENT *TOUTES* LES OCCURRENCES, et c'est le harnais qui
  // me l'a appris ce soir : ces fichiers figent l'acompte dû à DEUX endroits,
  // et n'en muter qu'un laissait la garde verte puisqu'elle COMPTE. Une
  // mutation partielle sur une règle qui se compte ne mesure rien.
  { nom: '🔴 la route de réservation ne fige plus l’acompte dû',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '        acompte_du: vent.acompteDu,\n',
    vers: '', toutes: true },

  { nom: '🔴 l’acompte dû ne voyage plus dans le tunnel avec produits',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: 'acompte_du: ',
    vers: 'acompte_du_ignore: ', toutes: true },

  { nom: '🔴 le webhook confond « acompte dû absent » et « zéro »',
    fichier: 'app/api/stripe/webhook/route.js',
    de: "      acompte_du: meta.acompte_du === undefined || meta.acompte_du === ''",
    vers: '      acompte_du: false' },

  { nom: '🔴 l’email du no-show annonce le montant posé, pas la part gardée',
    fichier: 'app/api/emails/rdv-no-show/route.js',
    de: '        bon_garde,\n        bon_restitue,\n        recompense_rendue,',
    vers: '        bon_garde: rdv.bon_cadeau_montant,' },

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
    de: '    const couvertSansPaiement = totalCents === 0 && (bonsValides.length > 0 || !!recompense)',
    vers: '    const couvertSansPaiement = false' },

  { nom: '🔴 la part produits du bon n’est plus débitée',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: "        const deb = await debiterBons(supabase, bonsProduits, { source: 'commande', commande_id: commande.id })",
    vers: '        const deb = { ok: true }' },

  { nom: '🔴 un second débit raté laisse le premier dépensé',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '          if (bonsPresta.length > 0) await recrediterBons(supabase, bonsPresta, { rdv_id: idRdv })',
    vers: '          if (false) await recrediterBons(supabase, bonsPresta, { rdv_id: idRdv })' },

  { nom: '🔴 la commande couverte n’est plus marquée payée en ligne',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '          paye_en_ligne: true,',
    vers: '          paye_en_ligne: false,' },

  // ─── 13) L'ÉCRAN N'ÉCRIT PLUS LUI-MÊME ───────────────────────────────
  { nom: '🔴 la réservation sans paiement repart sans preuve d’identité',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: "        const res = await fetchAvecPreuveSiConnecte('/api/rdv/reserver', {",
    vers: "        const res = await fetch('/api/rdv/reserver', {" },

  // ─── 14) LA BORNE QUI REND LE PAIEMENT D'AVANCE POSSIBLE (31/08) ──────
  //
  // ⚠️ UNE GARDE DE CE LOT N'EST PAS MESURÉE ICI, ET JE PRÉFÈRE LE DIRE :
  // « on rend AVANT de rembourser » repose sur une comparaison de POSITION
  // dans le fichier (`indexOf` de l'un contre l'autre). Inverser deux blocs
  // ne s'exprime pas en un remplacement de chaîne, et fabriquer une mutation
  // qui casse la compilation ne mesurerait rien : un banc qui explose n'est
  // pas un banc rouge. La garde existe et se lit ; elle n'est pas prouvée.
  { nom: '🔴 le commerçant garde de nouveau TOUT l’encaissé',
    fichier: 'lib/rdv-paiement.js',
    de: '  const gardeEnCaisse = arr(Math.min(enCaisse, garantie))',
    vers: '  const gardeEnCaisse = arr(enCaisse)' },

  { nom: '🔴 ce qui dépasse la garantie ne repart plus',
    fichier: 'lib/rdv-paiement.js',
    de: '  const carteRestituee = arr(enCaisse - gardeEnCaisse)',
    vers: '  const carteRestituee = 0' },

  { nom: '🔴 la phrase du no-show tait le remboursement sur la carte',
    fichier: 'lib/rdv-paiement.js',
    de: '    retours.push(`${euros(part.carteRestituee)} lui sont remboursés sur sa carte`)',
    vers: '    retours.push(`un montant lui revient`)' },

  { nom: '🔴 le remboursement rend TOUT le paiement, garantie comprise',
    fichier: 'app/api/rdv/no-show/route.js',
    de: '            amount: Math.round(part.carteRestituee * 100),',
    vers: '' },

  { nom: '🔴 la route ne charge plus l’intention de paiement',
    fichier: 'app/api/rdv/no-show/route.js',
    de: '        stripe_payment_intent_id, stripe_refund_id,',
    vers: '' },

  { nom: '🔴 ni le compte Stripe du commerçant',
    fichier: 'app/api/rdv/no-show/route.js',
    de: '        commercant:commercants(stripe_account_id)',
    vers: '        commercant_id as c2' },

  { nom: '🔴 un remboursement raté redevient silencieux',
    fichier: 'app/api/rdv/no-show/route.js',
    de: '      remboursement_erreur: refundError,',
    vers: '' },

  { nom: '🔴 l’écran ne distingue plus le dû du versé',
    fichier: 'app/api/rdv/no-show/route.js',
    de: '      carte_restituee: refundId ? part.carteRestituee : 0,',
    vers: '      carte_restituee: part.carteRestituee,' },

  // ─── LA REMISE SUR UNE PRESTATION (06/09) ────────────────────────────────
  //
  // 🔴 CE QU ON MESURE EST DU CODE D ARGENT, ET LE SENS DE L ERREUR COMPTE :
  // une remise affichee mais non debitee SURFACTURE le client.
  { nom: '🔴 reserver repart du prix PLEIN de la prestation',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '    const { prix: prixBase } = await prixPrestationServeur(db, prestation)',
    vers: '    const prixBase = prestation.prix != null ? Number(prestation.prix) : null' },

  { nom: '🔴 l acompte est calcule sur le prix PLEIN',
    fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '    const { prix: prixBase } = await prixPrestationServeur(supabase, prestation)',
    vers: '    const prixBase = prestation.prix != null ? Number(prestation.prix) : null' },

  { nom: '🔴 le tunnel complet repart du prix PLEIN',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    const { prix: prixBase } = await prixPrestationServeur(supabase, prestation)',
    vers: '    const prixBase = prestation.prix != null ? Number(prestation.prix) : null' },

  // 🔴 UNE LECTURE EN ECHEC NE DOIT RIEN BRADER : mieux vaut ne pas appliquer
  // une remise que la deviner.
  // ⚠️ ANCRE SUR LE JOURNAL, PAS SUR LE REPLI : les deux replis sont
  // rigoureusement identiques, et un remplacement viserait le premier.
  { nom: '🔴 une base muette fait disparaitre le prix plein',
    fichier: 'lib/prix-prestation-server.js',
    de: "    console.warn('[prix-prestation] lecture des deals KO, prix plein applique', error.message)",
    vers: '    return { prix: null, remise: null, deals: [] }' },

  // ─── L ECRAN ANNONCE CE QUE LE SERVEUR DEBITE ───────────────────────────
  { nom: '🔴 la fiche RDV reaffiche le prix plein',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: 'function formatPrix(prestation, deals = []) {',
    vers: 'function formatPrix(prestation, deals = []) { if (prestation) return prestation.prix != null ? `${Number(prestation.prix).toFixed(2)} €` : "Sur demande";' },

  { nom: '🔴 le prix fige sur le rendez-vous redevient le prix plein',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '      const prixEstime = prixEffectifPrestation(prestationChoisie, deals)',
    vers: '      const prixEstime = prestationChoisie.prix != null ? Number(prestationChoisie.prix) : null' },

  { nom: '🔴 le prix barre disparait : la remise ne se voit plus',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                {remiseSurPrestation(p, deals) && (',
    vers: '                                {false && (' },

  // ─── LE FORMULAIRE DE DEAL ──────────────────────────────────────────────
  { nom: '🔴 le deroulant cesse de proposer les prestations',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                {estRemiseSurProduit({ deal_type: form.deal_type }) && prestationsLiables.length > 0 && (',
    vers: '                {false && prestationsLiables.length > 0 && (' },

  { nom: '🔴 un LOT peut viser une prestation (deux systemes de seances)',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                {estRemiseSurProduit({ deal_type: form.deal_type }) && prestationsLiables.length > 0 && (',
    vers: '                {prestationsLiables.length > 0 && (' },

  { nom: '🔴 une prestation SANS PRIX est proposee a la remise',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '    p.actif !== false && !p.deleted_at && Number(p.prix) > 0)',
    vers: '    p.actif !== false && !p.deleted_at)' },

  { nom: '🔴 choisir une prestation laisse trainer l article',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "        article_id: '', categorie_cible: '', cible_tout: '', prestation_id: id,",
    vers: '        prestation_id: id,' },

  { nom: '🔴 la prestation ne part plus dans le payload',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      prestation_id: (estRemiseSurProduit({ deal_type: form.deal_type }) && form.prestation_id) ? form.prestation_id : null,",
    vers: '      prestation_id: null,' },

  // ─── LA REMISE GLOBALE (Alex, 06/09) ────────────────────────────────────
  //
  // 🔴 LA MUTATION QUI REPRODUIT MON PROPRE OUBLI. J avais ecrit ce module le
  // matin meme et sa requete filtrait sur `prestation_id` : une remise « toutes
  // mes prestations » n en porte AUCUN, elle serait donc restee invisible au
  // serveur pendant que la fiche l affichait.
  { nom: '🔴 les remises GLOBALES redeviennent invisibles au serveur',
    fichier: 'lib/prix-prestation-server.js',
    de: '    .or(`prestation_id.eq.${prestation.id},cible_tout.eq.${TOUT_PRESTATIONS}`)',
    vers: "    .eq('prestation_id', prestation.id)" },

  { nom: '🔴 le module ne charge plus la colonne cible_tout',
    fichier: 'lib/prix-prestation-server.js',
    de: "    .select('id, titre, deal_type, remise_pct, prix_deal, prestation_id, cible_tout, actif, date_deal, date_debut, date_fin')",
    vers: "    .select('id, titre, deal_type, remise_pct, prix_deal, prestation_id, actif, date_deal, date_debut, date_fin')" },

  { nom: '🔴 la lecture cesse d etre bornee au commercant',
    fichier: 'lib/prix-prestation-server.js',
    de: "    .eq('commercant_id', prestation.commercant_id)",
    vers: "    .eq('actif', true)" },

  // ─── L ECRAN ────────────────────────────────────────────────────────────
  { nom: '🔴 le menu cesse de proposer « tout d un coup »',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                {form.deal_type === TYPE_REMISE && (articlesLiables.length > 0 || prestationsLiables.length > 0) && (',
    vers: '                {false && (articlesLiables.length > 0 || prestationsLiables.length > 0) && (' },

  // 🔴 « Tous mes produits a 5 EUR » n est pas une promotion : `estRemiseSurProduit`
  // accepte AUSSI le prix fixe, et c est le piege exact.
  { nom: '🔴 un PRIX FIXE global devient possible (le magasin brade)',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                {form.deal_type === TYPE_REMISE && (articlesLiables.length > 0 || prestationsLiables.length > 0) && (',
    vers: '                {estRemiseSurProduit({ deal_type: form.deal_type }) && (articlesLiables.length > 0 || prestationsLiables.length > 0) && (' },

  { nom: '🔴 les deux portees fusionnent en une seule',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                      <option value={`tout:${TOUT_PRESTATIONS}`}>Toutes mes prestations</option>',
    vers: '                      <option value={`tout:${TOUT_PRODUITS}`}>Toutes mes prestations</option>' },

  { nom: '🔴 la remise globale ne part plus dans le payload',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '      cible_tout: (form.deal_type === TYPE_REMISE && form.cible_tout) ? form.cible_tout : null,',
    vers: '      cible_tout: null,' },

  { nom: '🔴 choisir « tout » laisse trainer les autres cibles',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: "      setForm(p => ({ ...p, article_id: '', prestation_id: '', categorie_cible: '', cible_tout: v.slice(5) }))",
    vers: '      setForm(p => ({ ...p, cible_tout: v.slice(5) }))' },

  // 🔴 LE DEFAUT VU PAR ALEX : les produits en vrac sous « Tout d un coup ».
  // Un commercant qui n a qu un seul produit le voyait colle sous ce titre.
  { nom: '🔴 les produits repartent en vrac sous le titre du dessus',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                  <optgroup label="Un produit précis">',
    vers: '                  <span>' },

  { nom: '🔴 l ordre des groupes ne suit plus le libelle',
    fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                  <optgroup label="Un produit précis">',
    vers: '                  <optgroup label="Zzz un produit précis">' },
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
  // ⚠️ `toutes` RETIRE TOUTES LES OCCURRENCES, ET C'EST NÉCESSAIRE (30/08 au
  // soir). Deux fichiers écrivent l'acompte dû à DEUX endroits : n'en muter
  // qu'un laissait la garde verte, parce qu'elle COMPTE. Une mutation partielle
  // sur une règle qui se compte ne mesure rien.
  ecrireSur(f, m.toutes ? original.split(m.de).join(m.vers) : original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

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
