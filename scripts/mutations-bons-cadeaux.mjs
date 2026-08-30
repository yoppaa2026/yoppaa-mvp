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

  { nom: '🔴 tunnel PRODUITS : le bon n’est plus revalidé',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '      const resBon = await chargerBonValide(supabase, { code: codeBon, commercant_id: commercant.id })',
    vers: '      const resBon = { ok: true, bon: { id: bon_cadeau_code, solde: 999 } }' },

  { nom: '🔴 tunnel PRODUITS : le bon ne part plus vers le webhook',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: '              bon_cadeau_id: String(bonCadeau.id),',
    vers: '              bon_cadeau_ref: String(bonCadeau.id),' },

  { nom: '🔴 SÉCURITÉ : mes-bons lit l’adresse dans un PARAMÈTRE',
    banc: 'verif:bons', fichier: 'app/api/yopper/mes-bons/route.js',
    de: '    const id = await identiteProuvee(request)',
    vers: '    const id = { email: (await request.clone().json().catch(() => ({}))).email }' },

  // ⚠️ LE DÉBIT A DÉMÉNAGÉ DANS LE MODULE LE 30/08, avec la consommation de la
  // récompense : les trois chemins qui créent un rendez-vous font les deux
  // gestes par le même appel. La mutation suit, sinon elle mesurerait du code
  // que plus personne n'exécute.
  { nom: '🔴 le bon d’un rendez-vous est débité en « commande »',
    banc: 'verif:bons', fichier: 'lib/rdv-creation-server.js',
    de: "      const deb = await debiterBon(db, bonCadeauId, Number(bonMontant), { source: 'rdv', rdv_id: rdvId })",
    vers: "      const deb = await debiterBon(db, bonCadeauId, Number(bonMontant), { source: 'commande', rdv_id: rdvId })" },

  { nom: '🔴 le module cesse de LIRE le résultat du débit',
    banc: 'verif:bons', fichier: 'lib/rdv-creation-server.js',
    de: "      if (!deb?.ok) console.error('[rdv/creation] débit bon cadeau KO', deb?.error, { rdvId })\n      else bilan.bon = true",
    vers: '      bilan.bon = true' },

  // ⚠️ ET LE WEBHOOK DOIT LUI PASSER LE BON REÇU DE STRIPE, sinon les deux
  // mutations ci-dessus mesurent du code qu'on appelle à vide.
  //
  // 🔴 CETTE MUTATION EST RESTÉE VERTE À SA PREMIÈRE ÉCRITURE, et c'est pour ça
  // qu'elle est écrite ainsi. Elle neutralisait l'appel en gardant son NOM en
  // place : la garde cherchait le nom, elle ne voyait rien. Elle vide
  // maintenant l'ARGUMENT, ce qu'aucune recherche de mot ne peut ignorer.
  { nom: '🔴 le webhook appelle le module sans lui passer le bon',
    banc: 'verif:bons', fichier: 'app/api/stripe/webhook/route.js',
    de: '      bonCadeauId: meta.bon_cadeau_id || null,',
    vers: '      bonCadeauId: null,' },

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
    de: "                              {' '}{libelleResteBon(Number(bonApplique.solde) - remiseBonEffective(), commercant?.nom)}",
    vers: '                              {remiseBonEffective() < Number(bonApplique.solde) && ` · il restera ${euros(Number(bonApplique.solde) - remiseBonEffective())} sur ton bon`}' },

  // ─── LE BON INVISIBLE SANS ACOMPTE (30/08) ───────────────────────────
  { nom: '🔴 le bon redevient invisible quand rien ne se paie en ligne',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                        {mesBonsIci.length > 0 && !seanceSurAbo && !acompteEnLigne && (',
    vers: '                        {false && mesBonsIci.length > 0 && !seanceSurAbo && (' },

  { nom: '🔴 le bloc informatif ne montre plus le code à présenter',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                                  {b.code}\n                                </span>',
    vers: '                                  {b.id}\n                                </span>' },

  { nom: '🔴 le bloc informatif se met à débiter le bon',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '                              {mesBonsIci.map(b => (\n                                <span key={b.id}',
    vers: '                              {mesBonsIci.map(b => (\n                                <span onClick={() => setBonChoisi(b)} key={b.id}' },

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

  { nom: '🔴 l’écran de rendez-vous n’envoie plus le code du bon',
    banc: 'verif:bons', fichier: 'app/commander/rdv/[slug]/page.js',
    de: '              ...(bonChoisi ? { bon_cadeau_code: bonChoisi.code } : {}),',
    vers: '              ...(bonChoisi ? { bon_choisi: bonChoisi.code } : {}),' },

  { nom: '🔴 le serveur accepte de nouveau un cadeau anonyme',
    banc: 'verif:bons', fichier: 'app/api/bons-cadeaux/checkout/route.js',
    de: "    if (!String(acheteur_prenom || '').trim()) {",
    vers: "    if (false && !String(acheteur_prenom || '').trim()) {" },

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
  if (lancer(banc).rouge) { finalRouge = true; console.log(`🔴 ${banc} ROUGE APRÈS RESTAURATION.`) }
}
console.log(finalRouge ? '' : '\nBancs verts après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
