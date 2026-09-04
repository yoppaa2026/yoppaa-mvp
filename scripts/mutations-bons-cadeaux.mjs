// HARNAIS DE MUTATION — le bon cadeau de bout en bout (28/08).
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout` :
// le dépôt porte du travail non commité, et un checkout l'effacerait.
//
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON. Un banc qui
// PLANTE n'a rien prouvé : il faut qu'il rougisse en disant « en échec ».
//
// ⚠️ ATTENTION AUX PRÉFIXES : `rdv.id` est un préfixe de `rdv.identifiant`.
// Chaque texte de recherche est ancré pour ne viser qu'un seul endroit.

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`

const MUTATIONS = [
  { nom: '🔴 le montant repasse au point décimal',
    banc: 'verif:bons', fichier: 'lib/montants.js',
    // ⚠️ L'ESPACE EST INSÉCABLE DANS LE FICHIER, et une espace ordinaire écrite
    // ici ne trouve rien : la mutation devient « TEXTE INTROUVABLE », c'est-à-
    // dire une NON-mesure qui passe pour une mesure. On l'échappe.
    de: "return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} €`",
    vers: "return `${(Number.isFinite(n) ? n : 0).toFixed(2)} €`" },

  { nom: '🔴 l’espace avant l’euro redevient sécable',
    banc: 'verif:bons', fichier: 'lib/montants.js',
    de: "return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} €`",
    vers: "return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} €`" },

  { nom: '🔴 le solde du rendez-vous réoublie le bon cadeau',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '  const net = Math.max(0, prixBrut - remise - bon)',
    vers: '  const net = Math.max(0, prixBrut - remise)' },

  { nom: '🔴 le reste à encaisser réoublie le bon',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '  const prixNet = Math.round(Math.max(0, prix - remise - bon) * 100) / 100',
    vers: '  const prixNet = Math.round(Math.max(0, prix - remise) * 100) / 100' },

  { nom: '🔴 la phrase de l’agenda réoublie le bon',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '    : Math.round(Math.max(0, prixBrut - remiseFid - bonCadeau) * 100) / 100',
    vers: '    : Math.round(Math.max(0, prixBrut - remiseFid) * 100) / 100' },

  { nom: '🔴 SUR-CORRECTION : le CA du commerçant retranche le bon',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '    const montant = Math.max(0, brut - (Number.isFinite(remiseRdv) ? remiseRdv : 0))',
    vers: '    const montant = Math.max(0, brut - (Number.isFinite(remiseRdv) ? remiseRdv : 0) - (Number(rdv.bon_cadeau_montant) || 0))' },

  { nom: '🔴 le compte du Yopper réoublie le bon',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '  const net = total\n    - (Number.isFinite(bon) ? bon : 0)\n    - (Number.isFinite(remise) ? remise : 0)\n  return Math.round(Math.max(0, net) * 100) / 100\n}\n\nexport function libelleModeEncaissement',
    vers: '  const net = total\n    - (Number.isFinite(remise) ? remise : 0)\n  return Math.round(Math.max(0, net) * 100) / 100\n}\n\nexport function libelleModeEncaissement' },

  { nom: '🔴 le piège du zéro revient : un total absent vaut zéro',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '  const total = nombre(commande?.total)\n  if (total === null) return null',
    vers: '  const total = Number(commande?.total)\n  if (!Number.isFinite(total)) return null' },

  // ⚠️ RÉ-ANCRÉE LE 29/08. Elle visait l'appel littéral
  // `calculerRemiseBon(bonCadeau.solde, baseApresRecompense)`, qui a déménagé
  // dans `lib/tunnel-rdv-montants.js` : elle rendait TEXTE INTROUVABLE, ce qui
  // est une non-mesure. L'ordre récompense-puis-bon est désormais EXÉCUTÉ par
  // `verif:tunnel-rdv` ; ce qui reste à garder ici, c'est que la route délègue
  // au module au lieu de refaire le calcul dans son coin.
  { nom: '🔴 tunnel ACOMPTE : la route recalcule le bon dans son coin',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '    const vent = ventilerTunnelRdv({',
    vers: '    const vent = calculMaison({' },

  // ⚠️ RE-ANCREE LE 31/08 : l appel a recu la categorie du commerce.
  // ⚠️ RE-ANCREE LE 01/09 : la validation a demenage dans le module partage
  // `chargerBonsValides`, parce que le rendez-vous cumule desormais lui aussi
  // et que QUATRE copies de la meme regle d argent auraient diverge.
  { nom: '🔴 tunnel PRODUITS : les bons ne sont plus revalidés',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    const resBons = await chargerBonsValides(supabase, {',
    vers: '    const resBons = { ok: true, bons: [{ id: bon_cadeau_code, solde: 999 }] } || await chargerBonsValides(supabase, {' },

  // 🔴 LA LISTE EST LE SEUL CANAL vers le webhook : le rendez-vous n existe pas
  // encore, il n y a aucune ligne en base ou lire `bons_utilises`. Sans elle,
  // le webhook ne debite QUE le premier bon, et les autres restent credites
  // alors que leur porteur les a depenses.
  { nom: '🔴 tunnel PRODUITS : seul le premier bon part vers le webhook',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '              bons_utilises: JSON.stringify(bonsPresta),',
    vers: '              bons_utilises: JSON.stringify(bonsPresta.slice(0, 1)),' },

  { nom: '🔴 tunnel ACOMPTE : la liste des bons ne part plus vers le webhook',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '              bons_utilises: JSON.stringify(bonsUtilises),',
    vers: '              bon_cadeau_montant: String(remiseBonEUR),' },

  // 🔴 LES DEUX PARTS SORTENT DU MEME PARTAGE. Les calculer separement les
  // laisserait se recouvrir : un bon de 50 EUR paierait 50 EUR de prestation ET
  // 50 EUR de produits, soit 100 EUR pris sur un solde de 50.
  { nom: '🔴 les deux parts se calculent séparément et se recouvrent',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    const bonsProduits = partsBons.produits.map(l => ({ id: l.id, montant: l.montant }))',
    vers: '    const bonsProduits = repartirBonsRdv(bonsValides, { surPresta: vent.bonSurProduits, surProduits: 0 }).presta.map(l => ({ id: l.id, montant: l.montant }))' },

  // 🔴 « COUVERT » NE PEUT PAS S ACCROCHER A `bonCadeau`. Celui-ci est le
  // premier bon servi SUR LA PRESTATION : quand les bons ne paient que les
  // produits, il vaut `null` alors que des bons ont bien paye, et le rendez-vous
  // entierement couvert repart au comptoir.
  { nom: '🔴 « couvert » retombe sur le premier bon de la prestation',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '    const couvertSansPaiement = totalCents === 0 && (bonsValides.length > 0 || !!recompense)',
    vers: '    const couvertSansPaiement = totalCents === 0 && (!!bonCadeau || !!recompense)' },

  { nom: '🔴 SÉCURITÉ : mes-bons lit l’adresse dans un PARAMÈTRE',
    banc: 'verif:bons', fichier: 'app/api/yopper/mes-bons/route.js',
    de: '    const id = await identiteProuvee(request)',
    vers: '    const id = { email: (await request.clone().json().catch(() => ({}))).email }' },

  // ⚠️ LE DÉBIT A DÉMÉNAGÉ DANS LE MODULE LE 30/08, avec la consommation de la
  // récompense : les trois chemins qui créent un rendez-vous font les deux
  // gestes par le même appel. La mutation suit, sinon elle mesurerait du code
  // que plus personne n'exécute.
  // ⚠️ RE-ANCREES LE 01/09 : le module debite maintenant une LISTE.
  { nom: '🔴 les bons d’un rendez-vous sont débités en « commande »',
    banc: 'verif:bons', fichier: 'lib/rdv-creation-server.js',
    de: "      const deb = await debiterBons(db, lignesBons, { source: 'rdv', rdv_id: rdvId })",
    vers: "      const deb = await debiterBons(db, lignesBons, { source: 'commande', rdv_id: rdvId })" },

  // 🔴 SEUL LE PREMIER BON EST DEBITE. Les autres restent credites alors que
  // leur porteur les a depenses : le commercant sert une prestation qu il n a
  // encaissee qu en partie, et personne ne s en apercoit.
  { nom: '🔴 le rendez-vous ne débite que le premier de ses bons',
    banc: 'verif:bons', fichier: 'lib/rdv-creation-server.js',
    de: '  const lignesBons = Array.isArray(bonsUtilises) ? bonsUtilises : []',
    vers: '  const lignesBons = (Array.isArray(bonsUtilises) ? bonsUtilises : []).slice(0, 1)' },

  { nom: '🔴 le module cesse de LIRE le résultat du débit',
    banc: 'verif:bons', fichier: 'lib/rdv-creation-server.js',
    de: "      if (!deb?.ok) console.error('[rdv/creation] débit des bons KO', deb?.echecs, { rdvId })\n      else bilan.bon = true",
    vers: '      bilan.bon = true' },

  // 🔴 LE REPLI SUR L ANCIENNE PAIRE. Des paiements partis AVANT ce
  // deploiement arrivent APRES : leur session Stripe ne porte que
  // `bon_cadeau_id`, et sans repli leur bon n est JAMAIS debite alors que le
  // client a paye un acompte reduit.
  { nom: '🔴 un paiement parti avant le cumul perd son bon',
    banc: 'verif:bons', fichier: 'lib/rdv-creation-server.js',
    de: '  if (meta?.bon_cadeau_id && Number(meta?.bon_cadeau_montant) > 0) {',
    vers: '  if (false && meta?.bon_cadeau_id && Number(meta?.bon_cadeau_montant) > 0) {' },

  // ⚠️ ET LE WEBHOOK DOIT LUI PASSER LE BON REÇU DE STRIPE, sinon les deux
  // mutations ci-dessus mesurent du code qu'on appelle à vide.
  //
  // 🔴 CETTE MUTATION EST RESTÉE VERTE À SA PREMIÈRE ÉCRITURE, et c'est pour ça
  // qu'elle est écrite ainsi. Elle neutralisait l'appel en gardant son NOM en
  // place : la garde cherchait le nom, elle ne voyait rien. Elle vide
  // maintenant l'ARGUMENT, ce qu'aucune recherche de mot ne peut ignorer.
  //
  // ⚠️ RE-ANCREE LE 01/09 : le module prend une LISTE. L argument vide reste
  // le bon moyen de mesurer, pour la meme raison qu en aout.
  { nom: '🔴 le webhook appelle le module sans lui passer les bons',
    banc: 'verif:bons', fichier: 'app/api/stripe/webhook/route.js',
    de: '      bonsUtilises: champs.bons_utilises,',
    vers: '      bonsUtilises: [],' },

  // 🔴 ET LE RENDEZ-VOUS NAIT SANS SA LISTE. La colonne resterait vide, et
  // l annulation ne rendrait pas un centime : c est le defaut du 29/08,
  // « bon jamais recredite », sur toutes les reservations payees par Stripe.
  { nom: '🔴 le rendez-vous naît sans la liste de ses bons',
    banc: 'verif:bons', fichier: 'app/api/stripe/webhook/route.js',
    de: '      bons_utilises: lignesBonsDeMeta(meta),',
    vers: '      bons_utilises: [],' },

  { nom: '🔴 ni la récompense',
    banc: 'verif:bons', fichier: 'app/api/stripe/webhook/route.js',
    de: '      recompenseId: meta.fidelite_recompense_id || null,',
    vers: '      recompenseId: null,' },

  // ─── LE RESTE DU BON, ET À QUOI IL SERT (30/08) ──────────────────────
  { nom: '🔴 la phrase du reste ne dit plus à quoi il sert',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    ? `Il restera ${euros(r)} sur ton bon, pour une prochaine fois chez ${chez}.`',
    vers: '    ? `Il restera ${euros(r)} sur ton bon.`' },

  { nom: '🔴 elle ne nomme plus le commerce où le solde est utilisable',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '  const chez = String(nomCommercant || \'\').trim()',
    vers: '  const chez = \'\'' },

  { nom: '🔴 un solde nul se met à parler',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  if (!Number.isFinite(r) || r <= 0) return ''",
    vers: '  if (false) return \'\'' },

  { nom: '🔴 le montant du reste reperd son espace insécable',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    ? `Il restera ${euros(r)} sur ton bon, pour une prochaine fois chez ${chez}.`',
    vers: '    ? `Il restera ${r.toFixed(2).replace(\'.\', \',\')} € sur ton bon, pour une prochaine fois chez ${chez}.`' },

  { nom: '🔴 le tunnel boutique réécrit la phrase dans son coin',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    // ⚠️ ANCRE REMISE À JOUR LE 01/09 : l'écran cumule désormais plusieurs bons,
    // et le reliquat porte sur LEUR SOMME. L'ancienne visait `bonApplique` au
    // singulier et ressortait en TEXTE INTROUVABLE, c'est-à-dire une NON-mesure
    // qui passait pour une mesure.
    de: `                              {' '}{libelleResteBon(
                                bonsAppliques.reduce((s, b) => s + Number(b.solde || 0), 0) - remiseBonEffective(),
                                commercant?.nom)}`,
    vers: '                              {remiseBonEffective() > 0 && ` · il restera quelque chose sur ton bon`}' },

  // ─── LE BON INVISIBLE SANS ACOMPTE (30/08, puis 31/08) ───────────────
  //
  // ⚠️ CETTE MUTATION A CHANGÉ DE CIBLE, ET LA NOTER VAUT MIEUX QUE LA JETER.
  // Le 30/08, le bon sans acompte était rendu VISIBLE dans un bloc informatif,
  // et la mutation éteignait ce bloc. Le 31/08 il est devenu ACTIONNABLE : le
  // bloc informatif ne sert plus qu'avant le choix d'une prestation. La règle
  // qu'on protège n'a pas bougé d'un pouce — un bon ne doit jamais redevenir
  // invisible — mais l'endroit où elle vit, si.
  { nom: '🔴 le bon redevient invisible quand rien ne se paie en ligne',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                        {mesBonsIci.length > 0 && !seanceSurAbo && prixBase == null && (',
    vers: '                        {false && mesBonsIci.length > 0 && !seanceSurAbo && (' },

  { nom: '🔴 le bloc informatif ne montre plus le code à présenter',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                  {b.code}\n                                </span>',
    vers: '                                  {b.id}\n                                </span>' },

  // 🔴 CETTE MUTATION EST RESTÉE VERTE LE 01/09, et c'est la même leçon que le
  // 30/08 : elle injectait `setBonChoisi(`, un nom que le tunnel n'emploie plus
  // depuis qu'il cumule. Elle n'avait donc plus rien à faire tomber. Une
  // mutation qui vise un nom mort ne mesure rien, elle rassure.
  { nom: '🔴 le bloc informatif se met à retenir le bon',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                              {mesBonsIci.map(b => (\n                                <span key={b.id}',
    vers: '                              {mesBonsIci.map(b => (\n                                <span onClick={() => setBonsAppliques([b])} key={b.id}' },

  // 🔴 LA PHRASE IMPOSSIBLE : le bon éteint la prestation AVANT de déborder sur
  // les produits, donc « le reste soldera ta presta au comptoir » décrit un cas
  // qui n'existe pas. La garde existe pour qu'on ne le repropose pas.
  { nom: '🔴 la phrase impossible réapparaît',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "                                : 'Présente ton code au comptoir le jour de ton rendez-vous.'}",
    vers: "                                : 'Le reste pourra solder ta prestation au comptoir.'}" },

  { nom: '🔴 LA COLONNE DISPARAÎT DU SELECT (le défaut le plus fréquent)',
    banc: 'verif:bons', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: 'acompte_montant, fidelite_remise, bon_cadeau_montant,',
    vers: 'acompte_montant, fidelite_remise,' },

  // ⚠️ RE-ANCREE LE 01/09 : le tunnel rendez-vous envoie une LISTE de codes.
  { nom: '🔴 l’écran de rendez-vous n’envoie plus les codes des bons',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '              ...(bonsAppliques.length > 0 ? { bons_cadeaux_codes: bonsAppliques.map(b => b.code) } : {}),',
    vers: '              ...(bonsAppliques.length > 0 ? { bons_choisis: bonsAppliques.map(b => b.code) } : {}),' },

  // 🔴 UNE SEULE DES TROIS SORTIES CUMULE. Le tunnel rendez-vous a TROIS
  // sorties, et le 27/08 un seul des deux tunnels connaissait la fidelite :
  // c est exactement ce defaut-la que la garde des TROIS occurrences attrape.
  { nom: '🔴 une sortie du rendez-vous n’envoie plus qu’un seul bon',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '            ...(bonsAppliques.length > 0 ? { bons_cadeaux_codes: bonsAppliques.map(b => b.code) } : {}),',
    vers: '            ...(bonsAppliques.length > 0 ? { bon_cadeau_code: bonsAppliques[0].code } : {}),' },

  { nom: '🔴 le serveur accepte de nouveau un cadeau anonyme',
    banc: 'verif:bons', fichier: 'app/api/bons-cadeaux/checkout/route.js',
    de: "    if (!String(acheteur_prenom || '').trim()) {",
    vers: "    if (false && !String(acheteur_prenom || '').trim()) {" },

  // ─── LA RÉCOMPENSE RENDUE, ET DITE (30/08, trouvé par Alex) ──────────
  //
  // 🔴 Elle revenait sur la carte, et personne ne l'annonçait. Alex l'a vu
  // parce qu'il est allé vérifier sa carte ; un Yopper, lui, croit avoir perdu
  // ses 10 €. Frère exact du bon cadeau, corrigé la veille et jamais porté à
  // côté — dans les DEUX routes d'annulation, qui se recopient l'une l'autre.
  // ⚠️ ET LE 30/08 AU SOIR, LE GESTE A QUITTÉ LES DEUX ROUTES pour un module
  // unique : c'est la RECOPIE qui produisait ces frères à répétition. Ce qu'on
  // mesure ici, c'est donc que chaque route TRANSMET encore sa récompense ; le
  // contenu, lui, s'exécute dans `verif:tunnel-rdv` sur une base simulée.
  { nom: '🔴 l’annulation Yopper ne transmet plus sa récompense au module',
    banc: 'verif:recompense', fichier: 'app/api/rdv/cancel/route.js',
    de: '      recompenseId: recompenseSurProduitsGardes ? null : rdv.fidelite_recompense_id,',
    vers: '      recompenseId: null,' },

  { nom: '🔴 l’annulation commerçant fait pareil',
    banc: 'verif:recompense', fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '      recompenseId: rdv.fidelite_recompense_id,',
    vers: '      recompenseId: null,' },

  { nom: '🔴 une route se remet à écrire sa propre copie du geste',
    banc: 'verif:recompense', fichier: 'app/api/rdv/cancel/route.js',
    de: '    const rendu = await rendreAvantagesRdv(supabase, {',
    vers: '    const rendreAvantages = async () => ({ bon: 0, recompense: 0 })\n    const rendu = await rendreAvantages({' },

  // 🔴 LA COLONNE ABSENTE DU SELECT, le défaut le plus fréquent du projet, et
  // je l'ai RECRÉÉ en écrivant ce correctif : `Number(undefined || 0)` vaut 0,
  // la ligne disparaît, et aucune erreur ne se lève.
  { nom: '🔴 la remise figée disparaît du select de l’annulation commerçant',
    banc: 'verif:recompense', fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '        commande_id, fidelite_recompense_id, fidelite_remise, bon_cadeau_id, bon_cadeau_montant,',
    vers: '        commande_id, fidelite_recompense_id, bon_cadeau_id, bon_cadeau_montant,' },

  { nom: '🔴 l’email d’annulation redevient muet sur la récompense',
    banc: 'verif:recompense', fichier: 'lib/resend.js',
    de: '          lignes.push(`Ta récompense fidélité de <strong>${euros(surCarteFid)}</strong> retourne sur ta carte, utilisable à ton prochain passage.`)',
    vers: '          void surCarteFid' },

  // ⚠️ ET LA COULEUR NE DOIT PAS MENTIR : un rendez-vous payé entièrement par
  // la fidélité passait en ORANGE « Remboursement à voir » alors que tout était
  // déjà revenu.
  { nom: '🔴 le bloc passe en orange quand seule la récompense revient',
    banc: 'verif:recompense', fichier: 'lib/resend.js',
    de: '        const vert = refund_en_cours || surBon > 0 || surCarteFid > 0',
    vers: '        const vert = refund_en_cours || surBon > 0' },

  { nom: '🔴 la perte de récompense redevient silencieuse',
    banc: 'verif:recompense', fichier: 'lib/fidelite-recompense.js',
    de: '  return perte > 0 ? perte : 0',
    vers: '  return 0' },

  { nom: '🔴 le tunnel de commande cesse d avertir',
    banc: 'verif:recompense', fichier: 'app/commander/[slug]/page.js',
    de: '{libellePerteRecompense(recompenseFid, totalAvecFrais()) && (',
    vers: '{false && libellePerteRecompense(recompenseFid, totalAvecFrais()) && (' },

  // 🔴 L'AVERTISSEMENT DOIT MESURER LA MÊME ASSIETTE QUE LA REMISE (30/08).
  // Alex a demandé si ce message était à jour partout : il ne l'était pas, le
  // tunnel rendez-vous le calculait encore sur la prestation seule alors que
  // la récompense venait de passer au panier entier le matin même. Il
  // annonçait une perte qui n'existait plus.
  { nom: '🔴 l’avertissement de perte retombe sur la prestation seule',
    banc: 'verif:recompense', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                              {libellePerteRecompense(recompenseFid, assietteRecompense, motAssiette) && (',
    vers: '                              {libellePerteRecompense(recompenseFid, prixBase, motAssiette) && (' },

  // ⚠️ ET L'INVERSE : la remise qui s'écarte de l'avertissement. Les deux
  // doivent lire la MÊME variable, pas deux expressions équivalentes.
  { nom: '🔴 la remise et l’avertissement se remettent à calculer chacun de leur côté',
    banc: 'verif:recompense', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                      ? calculerRemiseRecompense(recompenseFid, assietteRecompense)',
    vers: '                      ? calculerRemiseRecompense(recompenseFid, prixBase + totalProduits)' },
  { nom: '🔴 la garde de paiement remonte AVANT le calcul du dû',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '    if (!couvertSansPaiement) {\n      if (surPlace && !cashAutorise) {',
    vers: '    if (true) {\n      if (surPlace && !cashAutorise) {' },

  { nom: '🔴 la bibliothèque d’emails reformate un montant à la main',
    banc: 'verif:logique', fichier: 'lib/resend.js',
    de: '${euros(Number(montant))}</p>',
    vers: '${Number(montant).toFixed(2)} €</p>' },

  // ─── LE CA DU JOUR (défaut trouvé par Alex le 28/08) ─────────────────────
  { nom: '🔴 le CA du jour réoublie la récompense (le défaut d’Alex)',
    banc: 'verif:bord', fichier: 'lib/statistiques.js',
    de: '  const remise = Number(commande.fidelite_remise || 0)\n  return arrondi(Math.max(0, total - remise))',
    vers: '  return arrondi(Math.max(0, total))' },

  { nom: '🔴 SUR-CORRECTION : le CA des commandes retranche le bon cadeau',
    banc: 'verif:bord', fichier: 'lib/statistiques.js',
    de: '  const remise = Number(commande.fidelite_remise || 0)\n  return arrondi(Math.max(0, total - remise))',
    vers: '  const remise = Number(commande.fidelite_remise || 0)\n  return arrondi(Math.max(0, total - remise - Number(commande.bon_cadeau_montant || 0)))' },

  { nom: '🔴 la marchandise restée sur l’étagère recompte dans le CA',
    banc: 'verif:bord', fichier: 'lib/statistiques.js',
    de: "const STATUTS_ENCAISSES = ['en_attente', 'en_preparation', 'pret', 'recupere']",
    vers: "const STATUTS_ENCAISSES = ['en_attente', 'en_preparation', 'pret', 'recupere', 'non_retire']" },

  { nom: '🔴 le pavé se remet à additionner le tarif plein',
    banc: 'verif:bord', fichier: 'app/dashboard/page.js',
    de: '    ca:         chiffreAffaires(commandesDuJour).produits,',
    vers: "    ca:         commandesDuJour.filter(c => c.statut !== 'annulee_client_refund').reduce((acc, c) => acc + Number(c.total), 0)," },

  { nom: '🔴 un montant du commerçant repasse au point décimal',
    banc: 'verif:bord', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '                {euros(bon.solde)}',
    vers: '                {Number(bon.solde).toFixed(2)} €' },

  // ─── CE QUE LA DESTINATAIRE A VU (28/08) ─────────────────────────────────
  { nom: '🔴 le bloc du bon cadeau reperd sa couleur de repli',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: 'background-color:#160636;background-image:linear-gradient(135deg,#160636 0%,#2D0F6B 100%)',
    vers: 'background:linear-gradient(135deg,#160636 0%,#2D0F6B 100%)' },

  { nom: '🔴 l’entête de TOUS les emails reperd sa couleur de repli',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: 'background-color:${C.panel};background-image:linear-gradient(135deg,${C.panel} 0%,#2D0F6B 60%,${C.ink} 100%)',
    vers: 'background:linear-gradient(135deg,${C.panel} 0%,#2D0F6B 60%,${C.ink} 100%)' },

  { nom: '🔴 « Le mot DE Alexandre » revient',
    banc: 'verif:bons', fichier: 'lib/francais.js',
    de: '  return VOYELLES.includes(m[0]) ? `d’${m}` : `de ${m}`',
    vers: '  return `de ${m}`' },

  { nom: '🔴 l’élision se déclenche AUSSI devant une consonne',
    banc: 'verif:bons', fichier: 'lib/francais.js',
    de: '  return VOYELLES.includes(m[0]) ? `d’${m}` : `de ${m}`',
    vers: '  return `d’${m}`' },

  { nom: '🔴 SÉCURITÉ : le prénom du bénéficiaire repart brut dans le HTML',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: "<strong>${echapperHtml(beneficiaire_prenom) || 'Hello'}</strong>",
    vers: "<strong>${beneficiaire_prenom || 'Hello'}</strong>" },

  { nom: '🔴 SÉCURITÉ : le prénom de l’acheteur repart brut dans le HTML',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: "<strong>${echapperHtml(acheteur_prenom)}</strong> t'offre",
    vers: "<strong>${acheteur_prenom}</strong> t'offre" },

  // ─── LA TVA DU TICKET (28/08) ────────────────────────────────────────────
  { nom: '🔴 la récompense ne sort plus de la base TVA',
    banc: 'verif:comptable', fichier: 'lib/tva.js',
    de: '    const pris = Math.min(sortie[cle], reste)',
    vers: '    const pris = 0' },

  // ─── LE BOUTON FLOTTANT ET LA PHRASE DE LA TVA (28/08, soir) ─────────────
  { nom: '🔴 le bouton flottant perd son hystérésis et clignote',
    banc: 'verif:bons', fichier: 'lib/bouton-flottant.js',
    de: '  if (v <= SEUIL_MONTRER) return true\n  return montreAvant',
    vers: '  return true' },

  { nom: '🔴 les deux seuils du bouton flottant sont inversés',
    banc: 'verif:bons', fichier: 'lib/bouton-flottant.js',
    // ⚠️ ANCRÉE SUR LE CHIFFRE SEUL, pas sur le commentaire : ma première
    // version y cherchait une apostrophe typographique là où le fichier en a
    // une droite, et la mutation devenait « TEXTE INTROUVABLE », donc une
    // NON-mesure qui passe pour une mesure. Troisième fois aujourd'hui.
    de: 'export const SEUIL_CACHER = 0.35',
    vers: 'export const SEUIL_CACHER = 0.02' },

  { nom: '🔴 le piège du zéro revient sur le ratio absent',
    banc: 'verif:bons', fichier: 'lib/bouton-flottant.js',
    de: "  if (visible === null || visible === undefined || visible === '') return montreAvant",
    vers: '  // garde retirée' },

  { nom: '🔴 le bouton flottant redevient toujours visible',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: 'nbArticlesPanier() > 0 && montrerFlottant && (',
    vers: 'nbArticlesPanier() > 0 && (' },

  { nom: '🔴 la TVA du ticket reperd son assiette',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: '`TVA comprise dans les ${euros(ventilation_tva.reduce((s, v) => s + Number(v.ttc || 0), 0))}`',
    vers: "'Dont TVA'" },

  { nom: '🔴 SUR-CORRECTION : la phrase de TVA annonce le TOTAL, pas la base',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: '`TVA comprise dans les ${euros(ventilation_tva.reduce((s, v) => s + Number(v.ttc || 0), 0))}`',
    vers: '`TVA comprise dans les ${euros(Number(total))}`' },

  // ─── L'ANCRE DU PAPIER (29/08) ───────────────────────────────────────────
  // ⚠️ Un QR imprimé ne se corrige plus : cette garde protège des exemplaires
  // déjà distribués, que personne ne peut rappeler.
  { nom: '🔴 l’ancre du QR imprimé disparaît de la landing',
    banc: 'verif:lancement', fichier: 'app/components/LandingReveal.js',
    de: '<section id="commercants" style={{ background: `linear-gradient(135deg, ${T.panel} 0%, ${T.ink} 100%)`',
    vers: '<section style={{ background: `linear-gradient(135deg, ${T.panel} 0%, ${T.ink} 100%)`' },

  { nom: '🔴 l’ancre existe mais glisse sur une autre section',
    banc: 'verif:lancement', fichier: 'app/components/LandingReveal.js',
    de: '<section id="commercants"',
    vers: '<section id="commercants-ailleurs"' },

  { nom: '🔴 SUR-CORRECTION : le bon cadeau sortirait de la base TVA',
    banc: 'verif:comptable', fichier: 'lib/commande-notifs.js',
    de: '  const parTauxNet = imputerRemise(parTauxTicket, cmd.fidelite_remise)',
    vers: '  const parTauxNet = imputerRemise(parTauxTicket, Number(cmd.fidelite_remise || 0) + Number(cmd.bon_cadeau_montant || 0))' },

  // ═══ LE BON S'APPLIQUE MÊME SANS ACOMPTE (31/08) ════════════════════════
  //
  // 🔴 Le bon n'est pas un paiement, c'est un AVOIR chez ce commerçant. Le
  // réserver aux rendez-vous à acompte faisait porter au client un risque
  // d'oubli sur de l'argent déjà versé.
  { nom: '🔴 le bon redevient réservé aux rendez-vous à acompte',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '{mesBonsIci.length > 0 && !seanceSurAbo && prixBase != null && (',
    vers: '{mesBonsIci.length > 0 && !seanceSurAbo && prixBase != null && acompteEnLigne && (' },

  { nom: '🔴 le bloc s’affiche mais ne propose plus de l’utiliser',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                      if (actif) setBonsAppliques(l => l.filter(a => a.code !== b.code))',
    vers: '                                      if (actif) return' },

  // 🔴 RETENIR UN BON EFFACE LES AUTRES. C est LE defaut qu Alex a signale sur
  // 180 EUR et trois bons : en choisir un faisait disparaitre les deux autres,
  // et on pouvait en conclure qu ils etaient perdus.
  { nom: '🔴 retenir un bon efface les autres dans le tunnel rendez-vous',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '          return [...liste, { id: j.code, code: j.code, solde: j.solde }]',
    vers: '          return [{ id: j.code, code: j.code, solde: j.solde }]' },

  // 🔴 CHAQUE BON ANNONCE CE QU IL FINANCERAIT SEUL. Sur trois bons, chacun
  // afficherait le montant que seul le premier obtient : l ecran promettrait
  // trois fois la meme deduction, et le total serait faux a l ecran.
  { nom: '🔴 chaque bon annonce ce qu’il paierait tout seul',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                              const partsIci = repartirBonsRdv(bonsAppliques, {',
    vers: '                              const partsIci = repartirBonsRdv([b], {' },

  { nom: '🔴 le repli informatif reprend la place de l’actionnable',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '{mesBonsIci.length > 0 && !seanceSurAbo && prixBase == null && (',
    vers: '{mesBonsIci.length > 0 && !seanceSurAbo && !acompteEnLigne && (' },

  { nom: '🔴 le code du bon disparaît du bloc actionnable',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                        : b.code}',
    vers: '                                        : null}' },

  // 🔴 ET LE RÉCAPITULATIF : un montant absent n'est pas une information.
  { nom: '🔴 le récapitulatif cesse de chiffrer ce qu’il faut emporter',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '? `Rien à payer maintenant, tu règles ${euros(surPlace)} sur place.`',
    vers: "? 'Rien à payer maintenant, tu règles sur place.'" },

  // ⚠️ ET LA PHRASE DU BON NE DOIT PAS SE DIRE SUR UNE SÉANCE D'ABONNEMENT,
  // qui ne coûte rien pour une tout autre raison.
  { nom: '🔴 « ton bon couvre tout » se dit même sans aucune déduction',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                    : remiseBon > 0',
    vers: '                                    : true' },

  // ═══ LE STOCK GLOBAL QUE LE SERVEUR IGNORAIT (31/08) ════════════════════
  //
  // 🔴 « Stock du jour (défaut) » n'était plafonné que par le navigateur : dix
  // pains annoncés, quarante vendables. Le méta-défaut du projet, quatrième
  // fois : l'écran calcule, le serveur décide.
  { nom: '🔴 le serveur cesse de lire le stock global',
    banc: 'verif:logique', fichier: 'lib/lignes-commande.js',
    de: "    supabase.from('articles')\n      .select('id, stock_jour')\n      .in('id', stockArticleIds),",
    vers: "    Promise.resolve({ data: [] })," },

  { nom: '🔴 l’absence d’entrée redevient « aucune limite »',
    banc: 'verif:logique', fichier: 'lib/lignes-commande.js',
    de: '      : (stockGlobalParArticle[artId] > 0 ? stockGlobalParArticle[artId] : null)',
    vers: '      : null' },

  { nom: '🔴 le stock global l’emporte sur la grille du jour',
    banc: 'verif:logique', fichier: 'lib/lignes-commande.js',
    de: '      ? (stockEntry.stock || 0)',
    vers: '      ? Math.max(stockEntry.stock || 0, stockGlobalParArticle[artId] || 0)' },

  { nom: '🔴 une grille à zéro retombe sur le stock global',
    banc: 'verif:logique', fichier: 'lib/lignes-commande.js',
    de: '    const stockBrut = stockEntry',
    vers: '    const stockBrut = (stockEntry && stockEntry.stock > 0)' },

  // ⚠️ ET LA MOITIÉ SQL COMPTE AUTANT : sans elle, la course reste ouverte.
  { nom: '🔴 la fonction atomique perd son repli sur le stock global',
    banc: 'verif:logique', fichier: 'migrations/MIGRATION_STOCK_GLOBAL_SERVEUR.sql',
    de: '      SELECT stock_jour INTO v_stock',
    vers: '      SELECT NULL INTO v_stock' },

  { nom: '🔴 elle lit le stock global SANS le verrouiller',
    banc: 'verif:logique', fichier: 'migrations/MIGRATION_STOCK_GLOBAL_SERVEUR.sql',
    de: '      WHERE id = v_article_id\n      FOR UPDATE;',
    vers: '      WHERE id = v_article_id;' },

  // ⚠️ EN PLPGSQL UNE VARIABLE SURVIT D'UNE ITÉRATION À L'AUTRE : sans ce
  // réarmement, un article sans entrée hérite du `v_actif` du précédent.
  { nom: '🔴 les variables ne sont plus réarmées entre deux articles',
    banc: 'verif:logique', fichier: 'migrations/MIGRATION_STOCK_GLOBAL_SERVEUR.sql',
    de: '    v_actif := NULL;',
    vers: '' },

  // ═══ L'HISTORIQUE REPLIABLE DU SUIVI (31/08) ════════════════════════════
  { nom: '🔴 le repli CACHE son contenu au lieu de le démonter',
    banc: 'verif:yopper', fichier: 'app/commander/HistoriqueRepli.js',
    de: '      {ouvert && children}',
    vers: "      <div style={{ display: ouvert ? 'block' : 'none' }}>{children}</div>" },

  { nom: '🔴 le bloc plié redevient muet, sans son compte',
    banc: 'verif:yopper', fichier: 'app/commander/HistoriqueRepli.js',
    de: '        {compte ? (',
    vers: '        {false ? (' },

  { nom: '🔴 seule la flèche devient cliquable',
    banc: 'verif:yopper', fichier: 'app/commander/HistoriqueRepli.js',
    de: "          display: 'flex', alignItems: 'center', gap: 8, width: '100%',",
    vers: "          display: 'flex', alignItems: 'center', gap: 8," },

  { nom: '🔴 le repli ne se dit plus aux lecteurs d’écran',
    banc: 'verif:yopper', fichier: 'app/commander/HistoriqueRepli.js',
    de: '        aria-expanded={ouvert}',
    vers: '' },

  { nom: '🔴 l’historique des rendez-vous redevient déplié en dur',
    banc: 'verif:yopper', fichier: 'app/commander/page.js',
    de: '                  <HistoriqueRepli',
    vers: '                  <div' },

  // ⚠️ ET LE COMPTE NE DOIT PAS PROMETTRE PLUS QUE CE QU'IL MONTRE : la liste
  // s'arrête à cinq.
  { nom: '🔴 le compte annonce le total alors que la liste s’arrête à cinq',
    banc: 'verif:yopper', fichier: 'app/commander/page.js',
    de: 'compte={`${Math.min(rdvsPasses.length, 5)} rendez-vous`}',
    vers: 'compte={`${rdvsPasses.length} rendez-vous`}' },

  // ⚠️ « TERMINÉ » N'EST PAS « PAS VALABLE » : `valable` rend faux pour un
  // abonnement qui n'a PAS ENCORE COMMENCÉ, et l'archiver serait l'exact
  // contraire de ce qu'il est.
  { nom: '🔴 « terminé » redevient « pas valable » (le pas-encore-commencé archivé)',
    banc: 'verif:yopper', fichier: 'lib/abonnements.js',
    de: '    termine: Boolean(\n      solde === 0\n      || (estDate(abonnement.date_fin) && estDate(aujourdhui) && aujourdhui > abonnement.date_fin)',
    vers: '    termine: Boolean(\n      !valable\n      || (false)' },

  { nom: '🔴 un abonnement épuisé reste rangé dans « en cours »',
    banc: 'verif:yopper', fichier: 'lib/abonnements.js',
    de: '      solde === 0\n      || (estDate(abonnement.date_fin)',
    vers: '      false\n      || (estDate(abonnement.date_fin)' },

  { nom: '🔴 le dernier jour de validité archive déjà l’abonnement',
    banc: 'verif:yopper', fichier: 'lib/abonnements.js',
    de: 'aujourdhui > abonnement.date_fin)',
    vers: 'aujourdhui >= abonnement.date_fin)' },

  { nom: '🔴 un contrat résilié reste affiché comme en cours',
    banc: 'verif:yopper', fichier: 'lib/abonnements.js',
    de: "      || abonnement.statut === 'resilie'",
    vers: '' },

  { nom: '🔴 l’écran refait la règle au lieu de lire le module',
    banc: 'verif:yopper', fichier: 'app/commander/page.js',
    de: 'clientAbonnements.filter(a => !a.termine).map',
    vers: 'clientAbonnements.filter(a => a.valable).map' },

  // ═══ LE NOM DU BON SUIT LE MÉTIER (31/08) ═══════════════════════════════
  //
  // 🔴 LA MUTATION QUI COMPTE EST CELLE DU REPLI. `lib/plans.js` traite une
  // catégorie absente comme de l'alimentaire ; reprendre ce réflexe ici ferait
  // dire « bon gourmand » chez un coiffeur dont la catégorie n'a pas été
  // chargée, et un email part sans qu'on puisse le rattraper.
  { nom: '🔴 une catégorie absente bascule du côté gourmand',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  const gourmand = String(categorie || '').trim().toLowerCase() === CATEGORIE_GOURMANDE",
    vers: "  const gourmand = String(categorie || 'alimentaire').trim().toLowerCase() === CATEGORIE_GOURMANDE" },

  { nom: '🔴 le détail se met à dire « gourmand »',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  cadeau: { un: 'bon cadeau', des: 'bons cadeaux' },",
    vers: "  cadeau: { un: 'bon gourmand', des: 'bons gourmands' }," },

  { nom: '🔴 l’alimentaire redevient « cadeau »',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  gourmand: { un: 'bon gourmand', des: 'bons gourmands' },",
    vers: "  gourmand: { un: 'bon cadeau', des: 'bons cadeaux' }," },

  // ⚠️ LE PLURIEL FRANÇAIS N'EST PAS UNE CONCATÉNATION : ma première version
  // rendait « bons cadeaus », et le banc l'a attrapé au premier tour.
  { nom: '🔴 le pluriel se fabrique en ajoutant un s',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  cadeau: { un: 'bon cadeau', des: 'bons cadeaux' },",
    vers: "  cadeau: { un: 'bon cadeau', des: 'bons cadeaus' }," },

  { nom: '🔴 la casse de la base fait basculer le mot',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "String(categorie || '').trim().toLowerCase()",
    vers: "String(categorie || '')" },

  // ═══ LE CÂBLAGE DE LA CATÉGORIE (31/08) ═════════════════════════════════
  //
  // 🔴 CES CINQ MUTATIONS SONT LE CŒUR DE LA TRANCHE. Le mot lui-même est
  // prouvé depuis ce matin ; ce qui casse en vrai, c'est le FIL : une signature
  // qui cesse de recevoir la catégorie, un appel qui cesse de la passer, un
  // libellé qu'on regèle par réflexe. Aucune ne fait planter quoi que ce soit,
  // toutes affichent un texte lisible et faux : c'est exactement pour ça
  // qu'elles doivent rougir.
  { nom: '🔴 TabLivraison ne reçoit plus la catégorie',
    banc: 'verif:bons', fichier: 'app/dashboard/ConfigDashboard.js',
    de: 'function TabLivraison({ commercantId, categorie, toast, surModifications }) {',
    vers: 'function TabLivraison({ commercantId, toast, surModifications }) {' },

  { nom: '🔴 l’appel de TabComptabilite cesse de passer la catégorie',
    banc: 'verif:bons', fichier: 'app/dashboard/ConfigDashboard.js',
    de: '<TabComptabilite commercantId={commercantId} categorie={commercant?.categorie} toast={showToast} />',
    vers: '<TabComptabilite commercantId={commercantId} toast={showToast} />' },

  { nom: '🔴 un libellé regelé revient dans l’en-tête de l’onglet',
    banc: 'verif:bons', fichier: 'app/dashboard/ConfigDashboard.js',
    de: "letterSpacing: '1.5px', marginBottom: 2 }}>{nomBonsMaj}</p>",
    vers: "letterSpacing: '1.5px', marginBottom: 2 }}>Bons cadeaux</p>" },

  { nom: '🔴 le signup regèle le mot dans la liste des fonctions',
    banc: 'verif:bons', fichier: 'app/signup/page.js',
    de: '`Carte de fidélité, ${libelleBon(categorie, { pluriel: true })}, export comptable`,',
    vers: "'Carte de fidélité, bons cadeaux, export comptable'," },

  // ⚠️ ET LA FRONTIÈRE DANS L'AUTRE SENS : l'export part chez un comptable,
  // il ne doit PAS suivre le métier. Une garde qui ne tient qu'un bord laisse
  // passer la sur-correction, et c'est le défaut que j'ai commis trois fois.
  { nom: '🔴 SUR-CORRECTION : l’export comptable se met à varier',
    banc: 'verif:bons', fichier: 'lib/export-comptable.js',
    de: "import { jourBruxelles, heureBruxelles } from './timezone'",
    vers: "import { jourBruxelles, heureBruxelles } from './timezone'\nimport { libelleBon } from './bons-cadeaux'" },

  // ═══ CÔTÉ YOPPER : LES DEUX FAMILLES D'ÉCRANS (31/08) ════════════════════
  //
  // 🔴 LA RÈGLE D'ALEX A DEUX MOITIÉS, et une garde qui n'en tiendrait qu'une
  // laisserait passer la moitié des défauts. Là où le commerce est connu, le
  // mot suit le métier ; là où il ne l'est pas, on dit « bon » nu. Les cinq
  // mutations attaquent les deux moitiés, dans les deux sens.
  { nom: '🔴 BonCadeauFiche ne reçoit plus la catégorie',
    banc: 'verif:bons', fichier: 'app/commander/BonCadeauFiche.js',
    de: 'export default function BonCadeauFiche({ bons = [], categorie = null, enLigne = true }) {',
    vers: 'export default function BonCadeauFiche({ bons = [], enLigne = true }) {' },

  { nom: '🔴 le tunnel boutique cesse de passer la catégorie à l’encart',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '<BonCadeauFiche bons={mesBonsIci} categorie={commercant?.categorie}/>',
    vers: '<BonCadeauFiche bons={mesBonsIci}/>' },

  { nom: '🔴 le tunnel rendez-vous regèle un libellé dans son récapitulatif',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "fontWeight: 700 }}>Ton {nomBon}</span>",
    vers: "fontWeight: 700 }}>Ton bon cadeau</span>" },

  // 🔴 L'AUTRE SENS, ET C'EST CELUI QUE J'AURAIS COMMIS SEUL : faire suivre le
  // métier à une liste qui MÉLANGE les commerces. Elle afficherait « Mes bons
  // cadeaux » au-dessus d'un bon de boulangerie.
  { nom: '🔴 SUR-CORRECTION : la liste multi-commerces renomme un métier',
    banc: 'verif:bons', fichier: 'app/commander/page.js',
    de: "{mesBons.length > 1 ? 'Mes bons' : 'Mon bon'}",
    vers: "{mesBons.length > 1 ? 'Mes bons cadeaux' : 'Mon bon cadeau'}" },

  // ⚠️ MA PREMIÈRE VERSION DE CETTE MUTATION AJOUTAIT UN IMPORT, RIEN DE PLUS,
  // et elle est restée verte à juste titre : un symbole importé sans être
  // appelé ne change aucun texte à l'écran, ce n'est donc pas un défaut. Une
  // mutation doit changer le RÉSULTAT. Celle-ci fait ce qu'un développeur
  // ferait vraiment en croyant bien faire : câbler la fonction avec la seule
  // chose disponible ici, c'est-à-dire rien, ce qui affiche « bon cadeau » chez
  // un boulanger par le jeu du repli.
  // ═══ LES EMAILS (31/08) ══════════════════════════════════════════════════
  //
  // 🔴 UN EMAIL PART SANS RETOUR POSSIBLE, d'où des mutations sur les DEUX
  // bouts : le gabarit qui nomme, et la route qui charge la colonne.
  //
  // ⚠️ LA PREMIÈRE EST CELLE QUI M'A ATTRAPÉ EN VRAI. `blocBonCadeau` est
  // appelé DEUX fois dans la bibliothèque, une fois par email ; mon
  // remplacement n'en avait touché qu'un, et l'email de l'ACHETEUR disait
  // encore « Bon cadeau · Chez Test » chez un boulanger. Aucune lecture ne
  // l'avait vu : c'est le banc qui EXÉCUTE le gabarit et lit le HTML rendu
  // qui l'a dit. La phrase en double, encore, pour la énième fois ici.
  { nom: '🔴 le deuxième appel du bloc du bon réoublie la catégorie',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: '      ? blocBonCadeau({ code, montant, commercant_nom, expires_at, commercant_categorie })',
    vers: '      ? blocBonCadeau({ code, montant, commercant_nom, expires_at })' },

  // ⚠️ MA PREMIÈRE VERSION RETIRAIT LE PARAMÈTRE DE LA SIGNATURE : le gabarit
  // levait alors une `ReferenceError` et le banc PLANTAIT. Un plantage n'est
  // pas une mesure, c'est une non-mesure qui en a l'air. Une mutation doit
  // changer le RÉSULTAT, jamais la TERMINAISON. Celle-ci garde le paramètre et
  // l'ignore, ce qui est exactement le défaut réel : un câblage à moitié fait.
  { nom: '🔴 le gabarit du bénéficiaire ignore la catégorie qu’il reçoit',
    banc: 'verif:bons', fichier: 'lib/resend.js',
    de: "  const nom = libelleBon(commercant_categorie)\n  return layout({\n    audience: 'yopper',\n    commercantNom: commercant_nom,\n    title: `On t'offre un ${nom} 🟣`,",
    vers: "  const nom = libelleBon(null)\n  return layout({\n    audience: 'yopper',\n    commercantNom: commercant_nom,\n    title: `On t'offre un ${nom} 🟣`," },

  // 🔴 ET LE FIL CÔTÉ BASE : la colonne retirée du `select`. Rien ne casse,
  // `libelleBon` retombe sur « cadeau », l'email part, et personne ne le sait.
  { nom: '🔴 la route du bon annulé cesse de demander la catégorie en base',
    banc: 'verif:bons', fichier: 'app/api/emails/rdv-annule/route.js',
    de: 'commercant:commercants(nom, slug, adresse, telephone, email, categorie),',
    vers: 'commercant:commercants(nom, slug, adresse, telephone, email),' },

  // ⚠️ ET CELLE-CI ÉTAIT RESTÉE VERTE PARCE QUE MA GARDE COMPTAIT. Retirer un
  // journal sur sept en laissait toujours cinq, donc le seuil tenait. Compter
  // n'est pas garder : la garde vise désormais la RÈGLE, « aucun journal
  // n'appelle `libelleBon` », et la mutation fait ce qu'un développeur zélé
  // ferait un jour, câbler le mot du métier jusque dans la console.
  // ═══ LE MODULE DE PAIEMENT ET LES ROUTES (31/08) ═════════════════════════
  //
  // 🔴 `rdv-paiement` EST LU PAR LES DEUX CÔTÉS À LA FOIS, écrans et emails :
  // une phrase qui y regèle son mot se propage partout d'un coup.
  { nom: '🔴 la phrase des avantages regèle le mot du bon',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '  if (bon) morceaux.push(`${euros(bon)} en ${libelleBon(categorie)}`)',
    vers: '  if (bon) morceaux.push(`${euros(bon)} en bon cadeau`)' },

  { nom: '🔴 l’état de paiement du client ignore la catégorie reçue',
    banc: 'verif:bons', fichier: 'lib/rdv-paiement.js',
    de: '        libelle: `Payé avec ton ${libelleBon(categorie)}`,',
    vers: '        libelle: `Payé avec ton ${libelleBon(null)}`,' },

  // ⚠️ ET LE REPLI DOIT SURVIVRE : ce module est appelé SANS options par de
  // vieux appelants. Le casser serait une régression silencieuse de plus.
  { nom: '🔴 SUR-CORRECTION : le module bascule au gourmand sans catégorie',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "const CATEGORIE_GOURMANDE = 'alimentaire'",
    vers: "const CATEGORIE_GOURMANDE = ''" },

  { nom: '🔴 SUR-CORRECTION : un journal technique se met à varier',
    banc: 'verif:bons', fichier: 'app/api/stripe/webhook/route.js',
    de: "console.error('[stripe/webhook] bon cadeau introuvable', bonId)",
    vers: "console.error(`[stripe/webhook] ${libelleBon(null)} introuvable`, bonId)" },

  { nom: '🔴 SUR-CORRECTION : l’écran d’annulation devine un métier qu’il ignore',
    banc: 'verif:bons', fichier: 'app/commander/cancel/page.js',
    de: 'Ton paiement, ton bon et ta récompense fidélité te reviennent automatiquement.',
    vers: 'Ton paiement, ton {libelleBon(null)} et ta récompense fidélité te reviennent automatiquement.' },

  // ─── L'ÉCRAN DE CONFIRMATION D'ACHAT (31/08) ──────────────────────────────

  { nom: '🔴 LE CODE D’UN CADEAU SORT DU SERVEUR (argent du destinataire)',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  const pourMoi = String(bon.destinataire_mode || 'moi') !== 'offrir'",
    vers: '  const pourMoi = true' },

  { nom: '🔴 SUR-CORRECTION : plus personne ne reçoit son code, même en achetant pour soi',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  const pourMoi = String(bon.destinataire_mode || 'moi') !== 'offrir'",
    vers: '  const pourMoi = false' },

  { nom: '🔴 le repli bascule : un mode absent retiendrait le code',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "  const pourMoi = String(bon.destinataire_mode || 'moi') !== 'offrir'",
    vers: "  const pourMoi = String(bon.destinataire_mode || 'offrir') !== 'offrir'" },

  { nom: '🔴 un bon annulé s’annonce comme un achat réussi',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "export const ETATS_CONFIRMATION = ['actif', 'paiement_en_attente']",
    vers: "export const ETATS_CONFIRMATION = ['actif', 'paiement_en_attente', 'annule']" },

  { nom: '🔴 le webhook en retard fait échouer la confirmation d’un paiement réussi',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "export const ETATS_CONFIRMATION = ['actif', 'paiement_en_attente']",
    vers: "export const ETATS_CONFIRMATION = ['actif']" },

  { nom: '🔴 « actif » devient vrai même quand le webhook n’est pas passé',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: "      actif: String(bon.statut || '') === 'actif',",
    vers: '      actif: true,' },

  { nom: '🔴 le retour de Stripe reperd sa session : l’app ne sait plus quel bon',
    banc: 'verif:bons', fichier: 'app/api/bons-cadeaux/checkout/route.js',
    de: "}?bon=ok&session_id={CHECKOUT_SESSION_ID}`,",
    vers: '}?bon=ok`,' },

  { nom: '🔴 la route de confirmation se remet à lire les adresses email',
    banc: 'verif:bons', fichier: 'app/api/bons-cadeaux/confirmation/route.js',
    de: ".select('code, token, montant_initial, solde, statut, expires_at, destinataire_mode, beneficiaire_prenom, commercant:commercants(nom, slug, categorie)')",
    vers: ".select('code, token, montant_initial, solde, statut, expires_at, destinataire_mode, beneficiaire_prenom, acheteur_email, beneficiaire_email, commercant:commercants(nom, slug, categorie)')" },

  { nom: '🔴 la fiche commerce cesse de monter la confirmation',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '                  <BonConfirmation etat={bonRetour} bon={bonConfirme} categorie={commercant?.categorie} onContinuer={() => setBonRetour(null)}/>',
    vers: '                  {null}' },

  { nom: '🔴 la fiche rendez-vous cesse de monter la confirmation',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                  <BonConfirmation etat={bonRetour} bon={bonConfirme} categorie={commercant?.categorie} onContinuer={() => setBonRetour(null)}/>',
    vers: '                  {null}' },

  // ⚠️ CELLE-CI EST LE JUMEAU DU DÉFAUT MUET DU 31/08 : le composant reste
  // monté, bien placé, et le mot cesse de suivre le métier. Rien ne se voit.
  { nom: '🔴 la confirmation ne reçoit plus la catégorie du commerce',
    banc: 'verif:fiche', fichier: 'app/commander/[slug]/page.js',
    de: '                  <BonConfirmation etat={bonRetour} bon={bonConfirme} categorie={commercant?.categorie} onContinuer={() => setBonRetour(null)}/>',
    vers: '                  <BonConfirmation etat={bonRetour} bon={bonConfirme}/>' },

  { nom: '🔴 la confirmation ne reçoit plus le détail du bon acheté',
    banc: 'verif:fiche', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                  <BonConfirmation etat={bonRetour} bon={bonConfirme} categorie={commercant?.categorie} onContinuer={() => setBonRetour(null)}/>',
    vers: '                  <BonConfirmation etat={bonRetour} categorie={commercant?.categorie}/>' },

  // ⚠️ L'ORDRE EST LA RÈGLE : nettoyer l'URL avant d'avoir lu la session jette
  // la seule clé qui dit quel bon vient d'être acheté. Le code compile, l'écran
  // s'affiche, et il est vide. Défaut muet, exactement comme le précédent.
  { nom: '🔴 l’URL est nettoyée AVANT que la session soit lue',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: "      const sessionId = params.get('session_id')\n      setBonRetour(p)",
    vers: "      setBonRetour(p)" },

  { nom: '🔴 une lecture ratée efface la confirmation d’un paiement réussi',
    banc: 'verif:bons', fichier: 'app/commander/BonConfirmation.js',
    de: '  if (!bon) {',
    vers: '  if (false) {' },

  { nom: '🔴 le lien vers la page du bon part aussi à qui OFFRE le bon',
    banc: 'verif:bons', fichier: 'app/commander/BonConfirmation.js',
    de: '        {bon.pour_moi && bon.token && (',
    vers: '        {bon.token && (' },

  { nom: '🔴 la route de confirmation accepte n’importe quelle chaîne comme session',
    banc: 'verif:bons', fichier: 'app/api/bons-cadeaux/confirmation/route.js',
    de: "!/^cs_[A-Za-z0-9_]{10,}$/.test(sessionId)",
    vers: 'false' },

  // ─── LE CUMUL DE PLUSIEURS BONS (01/09) ───────────────────────────────────
  //
  // ⚠️ CETTE FONCTION DÉCIDE DE L'ARGENT. Chaque règle qu'elle porte doit
  // pouvoir faire rougir le banc quand on la retire.

  { nom: '🔴 le bon le plus proche de l’expiration ne part plus en premier',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '      if (ea !== eb) return ea - eb',
    vers: '      if (ea !== eb) return eb - ea' },

  // 🔴 LA VRAIE ERREUR QUE J'AI FAITE : corriger le minimum Stripe UNE SEULE
  // fois laisse un reste que Stripe refuse quand la dernière ligne saute.
  { nom: '🔴 le minimum Stripe n’est corrigé qu’une fois (mon erreur du 01/09)',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '  while (reste > 0 && reste < MINIMUM_STRIPE_CENTS && lignes.length > 0) {',
    vers: '  if (reste > 0 && reste < MINIMUM_STRIPE_CENTS && lignes.length > 0) {' },

  { nom: '🔴 le minimum Stripe n’est plus respecté du tout',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '  while (reste > 0 && reste < MINIMUM_STRIPE_CENTS && lignes.length > 0) {',
    vers: '  while (false) {' },

  { nom: '🔴 le minimum Stripe descend a un centime',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: 'const MINIMUM_STRIPE_CENTS = 50',
    vers: 'const MINIMUM_STRIPE_CENTS = 1' },

  { nom: '🔴 la borne des cinq bons saute',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    .slice(0, BONS_MAX_PAR_COMMANDE)',
    vers: '' },

  // ⚠️ DEUX MUTATIONS RETIREES ICI, ET C'EST LE HARNAIS QUI LES A DEMASQUEES.
  //
  // « des lignes de debit a zero entrent dans la commande » (retrait de
  // `if (pris <= 0) continue`) et « la repartition reordonne le tableau de
  // l appelant » (retrait de `[...bons]`) sont restees VERTES : ces deux
  // lignes ne changeaient RIEN. La premiere etait couverte par le `filter` sur
  // le solde, la seconde par le fait que `filter` rend deja une copie.
  //
  // 🔴 DEUX GARDES QUI SE COUVRENT L UNE L AUTRE, C EST ZERO GARDE MESURABLE.
  // Le code a ete simplifie : une seule regle, a un seul endroit, et c est la
  // mutation du `filter` ci-dessous qui la mesure vraiment.

  // 🔴 L'INVARIANT : ce qui est pris plus ce qui reste fait ce qui etait du.
  // S il se rompt, de l argent apparait ou disparait.
  { nom: '🔴 l’invariant se rompt : de l’argent disparait',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    reste -= pris',
    vers: '    reste -= pris / 2' },

  { nom: '🔴 un bon au solde nul entre quand meme dans la repartition',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    .filter(b => Number(b?.solde) > 0)',
    vers: '    .filter(() => true)' },

  // ─── LE CODE ARRIVÉ PAR LE LIEN DU BON (01/09) ────────────────────────────

  { nom: '🔴 le lien « Découvrir » n’emporte plus le code',
    banc: 'verif:bons', fichier: 'app/cadeau/[token]/page.js',
    de: '<a href={`${ficheUrl}?bon_code=${encodeURIComponent(bon.code)}`}',
    vers: '<a href={ficheUrl}' },

  { nom: '🔴 le code du lien est lu mais jamais appliqué',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '    appliquerBon(code)',
    vers: '    // appliquerBon(code)' },

  // 🔴 UN CODE EST UN SECRET AU PORTEUR : le laisser dans la barre d'adresse,
  // c'est le laisser se partager, se photographier et s'archiver.
  { nom: '🔴 le code reste dans la barre d’adresse',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: "      url.searchParams.delete('bon_code')",
    vers: '      // rien' },

  // ⚠️ SANS L'IDENTIFIANT DU COMMERCE, la vérification part avec `undefined`
  // et refuse un code parfaitement bon. Défaut muet côté serveur.
  { nom: '🔴 on n’attend plus que le commerce soit chargé',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '    if (bonDuLienFait.current || !commercant?.id) return',
    vers: '    if (bonDuLienFait.current) return' },

  { nom: '🔴 le code du lien se rejoue à chaque rendu',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '    bonDuLienFait.current = true',
    vers: '    // une seule fois, vraiment ?' },

  // ─── L'ÉCRAN DU CUMUL (01/09) ─────────────────────────────────────────────

  // 🔴 LE DÉFAUT EXACT VU PAR ALEX : choisir un bon faisait disparaître les
  // autres, et on pouvait en conclure qu'ils étaient perdus.
  { nom: '🔴 la liste des bons se cache de nouveau quand un bon est retenu',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '                      {mesBonsIci.length > 0 && (',
    vers: '                      {bonsAppliques.length === 0 && mesBonsIci.length > 0 && (' },

  { nom: '🔴 l’écran envoie de nouveau UN SEUL code au serveur',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '          ...(bonsAppliques.length > 0 ? { bons_cadeaux_codes: bonsAppliques.map(b => b.code) } : {}),',
    vers: '          ...(bonsAppliques.length > 0 ? { bon_cadeau_code: bonsAppliques[0].code } : {}),' },

  // 🔴 L'ÉCRAN NE DOIT PAS ANNONCER UN MONTANT QUE LA COMMANDE NE RETIENDRA
  // PAS : il répartit avec le MÊME module que le serveur.
  { nom: '🔴 l’écran recalcule la remise à sa façon',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '  function repartitionBons() { return repartirBons(bonsAppliques, baseApresRecompense()) }',
    vers: '  function repartitionBons() { return { lignes: [], total: bonsAppliques.reduce((s, b) => s + Number(b.solde), 0), reste: 0 } }' },

  { nom: '🔴 un même code peut être appliqué deux fois',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '          if (liste.some(b => b.code === j.code)) {',
    vers: '          if (false) {' },

  { nom: '🔴 le champ de code se referme dès le premier bon',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '                      {bonsCfg?.actif && bonsAppliques.length < BONS_MAX_PAR_COMMANDE && (',
    vers: '                      {bonsCfg?.actif && bonsAppliques.length === 0 && (' },

  // ⚠️ AVEC TROIS BONS DONT UN ENTAMÉ, ne parler que du premier serait faux.
  { nom: '🔴 le reliquat annoncé ne porte que sur le premier bon',
    banc: 'verif:bons', fichier: 'app/commander/[slug]/page.js',
    de: '                                bonsAppliques.reduce((s, b) => s + Number(b.solde || 0), 0) - remiseBonEffective(),',
    vers: '                                Number(bonsAppliques[0]?.solde || 0) - remiseBonEffective(),' },

  // ─── LE CHAMP DE CODE DU TUNNEL RENDEZ-VOUS (01/09) ───────────────────────

  { nom: '🔴 le tunnel rendez-vous reperd son champ de code',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                placeholder="BC-XXXX-XXXX"',
    vers: '                                placeholder="ton code"' },

  // 🔴 LE SOLDE NE SE DÉCIDE PAS À L'ÉCRAN. Le prendre de la saisie laisserait
  // n importe qui s attribuer le montant qu il veut.
  { nom: '🔴 le solde du bon saisi vient de l’écran au lieu du serveur',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '          return [...liste, { id: j.code, code: j.code, solde: j.solde }]',
    vers: '          return [...liste, { id: code, code, solde: 9999 }]' },

  // 🔴 UN MEME CODE DEUX FOIS COMPTERAIT SON SOLDE DEUX FOIS. Le serveur le
  // refuse aussi, mais l ecran promettrait alors une deduction que la
  // reservation ne retiendrait pas.
  { nom: '🔴 le même code peut être appliqué deux fois au rendez-vous',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '          if (liste.some(b => b.code === j.code)) {',
    vers: '          if (false) {' },

  { nom: '🔴 la saisie n’est plus normalisée avant vérification',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '    const code = normaliserCodeBon(source)',
    vers: '    const code = source' },

  // 🔴 LE CHAMP SE REFERME AU PREMIER BON. C est lui, et lui seul, qui permet
  // d AJOUTER un bon recu ailleurs par-dessus ceux du compte : le fermer rend
  // le cumul inaccessible a qui n a pas de compte Yoppaa.
  { nom: '🔴 le champ de code se referme dès le premier bon retenu',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                        {!seanceSurAbo && prixBase != null && bonsAppliques.length < BONS_MAX_PAR_COMMANDE && (',
    vers: '                        {!seanceSurAbo && prixBase != null && bonsAppliques.length === 0 && (' },

  { nom: '🔴 le tunnel rendez-vous cesse de lire le code du lien',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: "      code = params.get('bon_code')",
    vers: '      code = null' },

  // ─── L'ÉCRAN SÉPARÉ (01/09) ───────────────────────────────────────────────

  { nom: '🔴 la confirmation redevient une carte perdue au milieu de la fiche',
    banc: 'verif:bons', fichier: 'app/commander/BonConfirmation.js',
    de: "    position: 'fixed', inset: 0, zIndex: 10000,",
    vers: '    zIndex: 10000,' },

  { nom: '🔴 le plein écran n’a plus de sortie vers la fiche',
    banc: 'verif:bons', fichier: 'app/commander/BonConfirmation.js',
    de: '            {onContinuer && (',
    vers: '            {false && (' },

  { nom: '🔴 le plein écran perd les marges de sécurité de l’iPhone',
    banc: 'verif:bons', fichier: 'app/commander/BonConfirmation.js',
    de: "    padding: 'calc(24px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px))',",
    vers: "    padding: '24px 16px'," },

  { nom: '🔴 un tunnel cesse de passer la sortie de l’écran',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: ' onContinuer={() => setBonRetour(null)}/>',
    vers: '/>' },

  // ⚠️ SUR-CORRECTION : barrer l'écran de quelqu'un qui vient de RENONCER
  // reviendrait à le punir de son choix. Rien n'a été débité.
  { nom: '🔴 SUR-CORRECTION : un paiement annulé prend tout l’écran',
    banc: 'verif:bons', fichier: 'app/commander/BonConfirmation.js',
    de: "  if (etat === 'annule') {",
    vers: "  if (false) {" },

  // ─── CE QUI RESTE À L'ÉCRAN QUAND LA PERSONNE PART (01/09) ────────────────
  //
  // 🔴 LE DÉFAUT VU PAR ALEX : après déconnexion, « MES BONS 291,00 € » et les
  // CODES restaient affichés sous le bouton « Se connecter ».

  { nom: '🔴 LES BONS RESTENT À L’ÉCRAN APRÈS LA DÉCONNEXION (codes en clair)',
    banc: 'verif:session', fichier: 'app/commander/page.js',
    de: '    setMesCartesFid([]); setMesBons([])',
    vers: '    setMesCartesFid([])' },

  { nom: '🔴 les abonnements restent à l’écran après la déconnexion',
    banc: 'verif:session', fichier: 'app/commander/page.js',
    de: '    setClientCommandes([]); setClientRdvs([]); setClientAbonnements([])',
    vers: '    setClientCommandes([]); setClientRdvs([])' },

  { nom: '🔴 les cartes de fidélité redeviennent oubliées (défaut du 12/08)',
    banc: 'verif:session', fichier: 'app/commander/page.js',
    de: '    setMesCartesFid([]); setMesBons([])',
    vers: '    setMesBons([])' },

  { nom: '🔴 la modale de retrait reste ouverte par-dessus l’écran d’invité',
    banc: 'verif:session', fichier: 'app/commander/page.js',
    de: '    setAvisCommande(null); setPickupCommande(null)',
    vers: '    setAvisCommande(null)' },

  // ⚠️ LA DIVERGENCE EST LE VRAI DÉFAUT : c'est parce que l'effacement vivait
  // en DEUX exemplaires qu'il a pu être juste d'un côté et faux de l'autre.
  // ⚠️ LE PIÈGE CRLF, DEUXIÈME FOIS. `app/commander/page.js` est en CRLF
  // (mesuré : 4536 CRLF, zéro LF seul). Un `\n` nu dans l'ancre ne trouve
  // RIEN, et la mutation ressort « TEXTE INTROUVABLE » : une NON-mesure qui
  // passe pour une mesure. Les deux ancres ci-dessous portent donc `\r\n`.
  { nom: '🔴 la SUPPRESSION DE COMPTE n’efface plus rien à l’écran',
    banc: 'verif:session', fichier: 'app/commander/page.js',
    de: "                    // lui appartenait n'a le droit de rester à l'écran.\r\n                    viderEtatPersonnel()",
    vers: "                    // lui appartenait n'a le droit de rester à l'écran." },

  { nom: '🔴 la DÉCONNEXION n’efface plus rien à l’écran',
    banc: 'verif:session', fichier: 'app/commander/page.js',
    de: "                    // a plus d'email.\r\n                    viderEtatPersonnel()",
    vers: "                    // a plus d'email." },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 LES TROIS CHEMINS QUI RENDENT L ARGENT D UN RENDEZ-VOUS (01/09)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Ils lisaient la paire `bon_cadeau_id` / `bon_cadeau_montant`. Sur trois bons
  // ayant finance 145 EUR, cela remettait 145 EUR sur le PREMIER et RIEN sur les
  // deux autres : de l argent cree d un cote, detruit de l autre, et sur un
  // instrument au porteur que le Yopper detient encore.
  //
  // ⚠️ ILS N ETAIENT MUTES NULLE PART jusqu ici. Trois routes d argent sans une
  // seule mutation, c est trois routes non mesurees.
  { nom: '🔴 l’annulation par le client ne rend que le premier bon',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/cancel/route.js',
    de: '      bonsUtilises: lignesBonsDe(rdv),',
    vers: '      bonsUtilises: lignesBonsDe(rdv).slice(0, 1),' },

  { nom: '🔴 l’annulation par le client oublie les bons de la commande liée',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/cancel/route.js',
    de: '        bonsUtilises: lignesBonsDe(commandeLiee),',
    vers: '        bonsUtilises: [],' },

  { nom: '🔴 l’annulation par le commerçant ne rend que le premier bon',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/annuler-commercant/route.js',
    de: '      bonsUtilises: lignesBonsDe(rdv),',
    vers: '      bonsUtilises: lignesBonsDe(rdv).slice(0, 1),' },

  // 🔴 LA COLONNE ABSENTE D UN SELECT, LE DEFAUT LE PLUS FREQUENT DE CE PROJET
  // et le plus SILENCIEUX : la liste arriverait vide, le repli prendrait la
  // main, et un rendez-vous a trois bons n en rendrait qu un.
  { nom: '🔴 l’annulation ne demande plus la liste des bons en base',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/cancel/route.js',
    de: '      prix_estime, fidelite_remise, bon_cadeau_id, bon_cadeau_montant, bons_utilises,',
    vers: '      prix_estime, fidelite_remise, bon_cadeau_id, bon_cadeau_montant,' },

  // 🔴 LE NO-SHOW REND UNE PART, PAS LES BONS. La reposer entiere sur le
  // premier creerait de l argent sur celui-la et en detruirait sur les autres.
  { nom: '🔴 le no-show repose toute la part sur le premier bon',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/rdv/no-show/route.js',
    de: '      bonsUtilises: repartirRestitution(lignesBonsDe(rdv), part.bonRestitue),',
    vers: '      bonsUtilises: [{ id: rdv.bon_cadeau_id, montant: part.bonRestitue }],' },

  // 🔴 ET LE MODULE ANNONCE LA SOMME, pas le premier. Un email qui dit « 50 EUR
  // te reviennent » quand 145 EUR reviennent declenche un appel au commercant.
  { nom: '🔴 le module n’annonce que le premier bon rendu',
    banc: 'verif:tunnel-rdv', fichier: 'lib/rdv-annulation-server.js',
    de: '    else rendu.bon = arr(lignes.reduce((s, l) => s + Number(l.montant), 0))',
    vers: '    else rendu.bon = arr(lignes[0].montant)' },

  // 🔴 ET IL RECREDITE VRAIMENT LES CINQ.
  { nom: '🔴 le module ne recrédite que le premier bon',
    banc: 'verif:tunnel-rdv', fichier: 'lib/rdv-annulation-server.js',
    de: '    const rec = await recrediterBons(db, lignes, refs)',
    vers: '    const rec = await recrediterBons(db, lignes.slice(0, 1), refs)' },

  // 🔴 LE REPLI SUR L ANCIENNE PAIRE, dans l autre sens : des rendez-vous ecrits
  // AVANT ce deploiement n ont que `bon_cadeau_id`. Les ignorer, c est le defaut
  // du 29/08 sur toutes les lignes existantes.
  { nom: '🔴 un rendez-vous d’avant le cumul ne récupère plus son bon',
    banc: 'verif:tunnel-rdv', fichier: 'lib/rdv-annulation-server.js',
    de: '  if (objet?.bon_cadeau_id && Number(objet?.bon_cadeau_montant) > 0) {',
    vers: '  if (false && objet?.bon_cadeau_id && Number(objet?.bon_cadeau_montant) > 0) {' },

  // 🔴 ET LA LISTE FAIT FOI DES QU ELLE EXISTE : lire les deux additionnerait le
  // premier bon deux fois, donc rendrait plus que ce qui a ete pris.
  { nom: '🔴 la liste et l’ancienne paire se cumulent',
    banc: 'verif:tunnel-rdv', fichier: 'lib/rdv-annulation-server.js',
    de: '  if (liste.length > 0) return liste',
    vers: '  // la liste ne fait plus foi' },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 LA RÉPARTITION SUR LES DEUX CIBLES, ET LA RESTITUTION PARTIELLE
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Ces deux fonctions decident de l argent. Elles sont EXECUTEES au banc, cas
  // par cas, et mesurees ici.
  { nom: '🔴 un bon paie la prestation ET les produits au-delà de son solde',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '      dispo -= partPresta',
    vers: '      // le solde n est plus decompte' },

  { nom: '🔴 les produits sont servis avant la prestation',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    const partPresta = Math.min(dispo, restePresta)',
    vers: '    const partPresta = Math.min(dispo, restePresta) * 0' },

  { nom: '🔴 un seau qui ne se remplit pas est annoncé plein',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    restePresta: Math.max(0, restePresta) / 100,',
    vers: '    restePresta: 0,' },

  { nom: '🔴 la restitution repart du premier bon servi',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '  for (let i = liste.length - 1; i >= 0 && reste > 0; i--) {',
    vers: '  for (let i = 0; i < liste.length && reste > 0; i++) {' },

  { nom: '🔴 la restitution rend plus que ce que le bon avait payé',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux.js',
    de: '    const rend = Math.min(paye, reste)',
    vers: '    const rend = reste' },

  // 🔴 ET LA VALIDATION PARTAGEE, qui gouverne QUATRE routes de paiement.
  { nom: '🔴 la borne des cinq bons saute',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux-server.js',
    de: '  if (recus.length > BONS_MAX_PAR_COMMANDE) {',
    vers: '  if (false) {' },

  { nom: '🔴 un doublon de code est dédupliqué en silence au lieu d’être refusé',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux-server.js',
    de: '    if (normalises.includes(code)) {',
    vers: '    if (false) {' },

  { nom: '🔴 un code invalide passe sans être rechargé en base',
    banc: 'verif:bons', fichier: 'lib/bons-cadeaux-server.js',
    de: '    if (!res.ok) return { ok: false, status: 400, error: res.error, bon_refuse: true }',
    vers: '    if (!res.ok) continue' },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 LES EMAILS QUI DISENT CE QUI REVIENT (Alex, 01/09, commande #CC2)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Son email d annulation annoncait « ta recompense de 5,00 EUR t est rendue »
  // et NE DISAIT PAS UN MOT des 145 EUR revenus sur ses trois bons. L argent
  // etait bel et bien recredite : c est l email qui se taisait.
  { nom: '🔴 l’email de commande annulée se retait sur les bons rendus',
    banc: 'verif:livraison', fichier: 'lib/resend.js',
    de: '    retours.push(`<strong>${euros(bonMnt)}</strong> ${plusieurs ? \'sont recrédités sur tes\' : \'sont recrédités sur ton\'} ${motBon}, utilisables dès maintenant.`)',
    vers: '    void bonMnt' },

  // 🔴 LE PLURIEL. « ton bon gourmand » devant TROIS bons : le Yopper en
  // cherche un, il en a trois, et le compte ne tombe jamais juste.
  // ⚠️ L ANCRE PORTE LA LIGNE SUIVANTE, ET CE N EST PAS DU CONFORT. Ecrite
  // seule, `  const plusieurs = Number(nb_bons) > 1` se retrouvait AUSSI a
  // l interieur de la ligne indentee du gabarit RENDEZ-VOUS, quatre cents
  // lignes plus haut : le harnais mutait l autre gabarit, et le banc de ce
  // gabarit-ci restait vert. Une ancre qui matche deux endroits ne mesure pas
  // celui qu on croit.
  { nom: '🔴 la commande annulée redit « ton bon » devant trois bons',
    banc: 'verif:livraison', fichier: 'lib/resend.js',
    de: '  const plusieurs = Number(nb_bons) > 1\n  const motBon = libelleBon(commercant_categorie, { pluriel: plusieurs })',
    vers: '  const plusieurs = false\n  const motBon = libelleBon(commercant_categorie, { pluriel: plusieurs })' },

  { nom: '🔴 la route d’annulation ne compte plus les bons',
    banc: 'verif:livraison', fichier: 'app/api/emails/commande-annulee/route.js',
    de: '        fidelite_remise, bon_cadeau_montant, bons_utilises,',
    vers: '        fidelite_remise, bon_cadeau_montant,' },

  // 🔴 ET LE FRERE COTE RENDEZ-VOUS, dont la phrase existait depuis le 29/08
  // mais restait au singulier.
  { nom: '🔴 le rendez-vous annulé redit « ton bon » devant trois bons',
    banc: 'verif:tunnel-rdv', fichier: 'lib/resend.js',
    de: '          const plusieurs = Number(nb_bons) > 1',
    vers: '          const plusieurs = false' },

  { nom: '🔴 le no-show redit « ton bon » devant trois bons',
    banc: 'verif:tunnel-rdv', fichier: 'lib/resend.js',
    de: '  const plusieursBons = Number(nb_bons) > 1',
    vers: '  const plusieursBons = false' },

  { nom: '🔴 la route du no-show ne charge plus la liste des bons',
    banc: 'verif:tunnel-rdv', fichier: 'app/api/emails/rdv-no-show/route.js',
    de: '        client_email, client_prenom, bons_utilises,',
    vers: '        client_email, client_prenom,' },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 LE PRODUIT ACHETÉ AVEC LE RENDEZ-VOUS (Alex, 01/09)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Head Spa a 60 EUR ET shampoing a 21,90 EUR, le tout couvert par ses bons.
  // L email confirmait le rendez-vous et ne disait RIEN du shampoing.
  //
  // ⚠️ CE CHEMIN EST CELUI DES BONS : quand ils couvrent tout, il n y a aucun
  // paiement Stripe, donc aucun webhook, donc c est cette route-ci qui envoie.
  { nom: '🔴 l’email de RDV se retait sur les produits achetés avec',
    banc: 'verif:logique', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '    const produits = await chargerProduitsDuRdv(supabase, rdv.commande_id)',
    vers: '    const produits = null' },

  // 🔴 LA COLONNE ABSENTE DU SELECT : le module recoit `undefined`, rend
  // `null`, et l email se tait SANS la moindre erreur. Le defaut le plus
  // frequent du projet, et le plus silencieux.
  { nom: '🔴 la route d’email ne charge plus commande_id',
    banc: 'verif:logique', fichier: 'app/api/emails/rdv-confirme/route.js',
    de: '        annulation_token, lieu_id, lieu_libelle, lieu_adresse, commande_id,',
    vers: '        annulation_token, lieu_id, lieu_libelle, lieu_adresse,' },

  // 🔴 « PAYE EN LIGNE » AFFIRME SUR LE TOTAL BRUT. Quand un bon paie les
  // produits, la carte n encaisse rien : l email fait chercher un debit
  // bancaire qui n existe pas.
  { nom: '🔴 le bloc produits réaffirme « payé en ligne » sur le total brut',
    banc: 'verif:logique', fichier: 'lib/resend.js',
    de: "            const enLigne = produits.paye_en_ligne === undefined\n              ? Number(produits.total) || 0\n              : Number(produits.paye_en_ligne) || 0",
    vers: '            const enLigne = Number(produits.total) || 0' },

  // 🔴 ET LE WEBHOOK PASSE PAR LE MEME MODULE. Deux chargements ecrits a la
  // main, c est exactement la divergence qu on vient de reparer.
  { nom: '🔴 le webhook recharge les produits de son côté',
    banc: 'verif:logique', fichier: 'app/api/stripe/webhook/route.js',
    de: '  const produits = await chargerProduitsDuRdv(supabase, rdv?.commande_id)',
    vers: '  const produits = null' },

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔴 « LE REMBOURSEMENT EST LANCÉ » SUR UNE CARTE JAMAIS DÉBITÉE (01/09)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Commande #RE4 : 21,90 EUR couverts en entier par les bons. L email
  // promettait un virement de 5 a 10 jours que Stripe n aurait jamais fait.
  //
  // ⚠️ `paye_en_ligne` repond a « le client doit-il encore payer », PAS a
  // « la carte a-t-elle ete debitee ». On lui demandait la mauvaise question.
  { nom: '🔴 l’email promet à nouveau un virement sur une carte jamais débitée',
    banc: 'verif:livraison', fichier: 'lib/resend.js',
    de: '  const surCarte = part === null ? paye_en_ligne : part > 0',
    vers: '  const surCarte = paye_en_ligne' },

  // 🔴 ET LE FRERE COMMERCANT, PIRE : on l envoyait rembourser depuis Stripe
  // une transaction que Stripe n a jamais vue.
  { nom: '🔴 le commerçant est renvoyé rembourser un paiement inexistant',
    banc: 'verif:livraison', fichier: 'lib/resend.js',
    de: '  const surCartePro = partPro === null ? paye_en_ligne : partPro > 0',
    vers: '  const surCartePro = paye_en_ligne' },

  // ⚠️ LE PIEGE DU ZERO : sans total, on ne SAIT pas, et « on ne sait pas »
  // n est pas « rien ». Taire un vrai virement serait le defaut inverse.
  { nom: '🔴 sans total connu, l’email tait un vrai remboursement',
    banc: 'verif:livraison', fichier: 'lib/resend.js',
    de: '  if (!Number.isFinite(t)) return null',
    vers: '  if (!Number.isFinite(t)) return 0' },

  // 🔴 ET LA DEDUCTION PORTE SUR LES DEUX AVANTAGES. En oublier un ferait
  // promettre un virement sur une commande que cet avantage a couverte.
  { nom: '🔴 la part carte oublie les BONS',
    banc: 'verif:livraison', fichier: 'lib/resend.js',
    de: '  return Math.max(0, arr(t - arr(fidelite_remise) - arr(bon_cadeau_montant)))',
    vers: '  return Math.max(0, arr(t - arr(fidelite_remise)))' },

  { nom: '🔴 la part carte oublie la RÉCOMPENSE',
    banc: 'verif:livraison', fichier: 'lib/resend.js',
    de: '  return Math.max(0, arr(t - arr(fidelite_remise) - arr(bon_cadeau_montant)))\n}',
    vers: '  return Math.max(0, arr(t - arr(bon_cadeau_montant)))\n}' },
]

function lancer(banc) {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ DISTINGUER UN BANC QUI ROUGIT D'UN BANC QUI PLANTE, ET LES BANCS NE
    // LE DISENT PAS TOUS AVEC LES MÊMES MOTS. `verif:bons` écrit « en échec »,
    // `verif:bord` écrit « ÉCHEC(S) ». Le détecteur ne connaissait que le
    // premier : cinq mutations parfaitement attrapées ont été comptées comme
    // des plantages, c'est-à-dire comme des NON-preuves. Un harnais de mesure
    // qui se trompe de verdict est pire qu'une garde molle, parce qu'il a
    // l'air de travailler. Une vraie erreur d'exécution, elle, n'imprime
    // aucune de ces deux formules et reste donc bien détectée.
    const aRougiProprement = /en échec|ÉCHEC\(S\)/.test(sortie)
    return { rouge: true, plante: !aRougiProprement, extrait: sortie.slice(-260) }
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
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer(m.banc)
  ecrireSur(f, original)
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

// ⚠️ ET ON DIT POURQUOI. Ce contrôle final annonçait « ROUGE APRÈS
// RESTAURATION » sans un mot de plus : impossible de distinguer un vrai défaut
// d'un aléa d'exécution, et un verdict qu'on ne peut pas instruire finit par
// se faire ignorer. Le 01/09, `verif:comptable` est sorti rouge ici et VERT au
// lancement suivant : sans l'extrait, il aurait fallu deviner.
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
