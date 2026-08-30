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
  { nom: '🔴 le bon n’est plus recrédité à l’annulation client',
    fichier: 'app/api/rdv/cancel/route.js',
    de: '        const rec = await recrediterBon(supabase, bonId, Number(bonMontant), refs)',
    vers: '        const rec = { ok: true }' },

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
    de: '    ? arrondi(Math.round(prestaNette * pct) / 100)',
    vers: '    ? arrondi(Math.round((prix || 0) * pct) / 100)' },

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

  // ─── 10) L'AVANTAGE QUI S'ÉVAPORE ────────────────────────────────────
  { nom: '🔴 un bon qui annule l’acompte repart en insertion directe, sans débit',
    fichier: 'app/commander/rdv/[slug]/page.js',
    de: '      const avantageUtilise = !!bonChoisi || !!(recompenseFid && recompenseActive)',
    vers: '      const avantageUtilise = false' },
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
