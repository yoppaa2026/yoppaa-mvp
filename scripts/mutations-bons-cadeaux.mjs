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
    de: "return `${(Number.isFinite(n) ? n : 0).toFixed(2).replace('.', ',')} €`",
    vers: "return `${(Number.isFinite(n) ? n : 0).toFixed(2)} €`" },

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

  { nom: '🔴 tunnel ACOMPTE : le bon passe AVANT la récompense',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '      remiseBonEUR = calculerRemiseBon(bonCadeau.solde, baseApresRecompense)',
    vers: '      remiseBonEUR = calculerRemiseBon(bonCadeau.solde, prixBase)' },

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

  // ⚠️ ANCRÉE SUR LA LIGNE SUIVANTE : `source: 'rdv',` apparaît D'ABORD dans la
  // consommation de la récompense, quinze lignes plus haut. Sans cette ancre,
  // la mutation frappait le mauvais bloc et ne prouvait rien.
  { nom: '🔴 le webhook ne débite plus le bon d’un rendez-vous',
    banc: 'verif:bons', fichier: 'app/api/stripe/webhook/route.js',
    de: "          source: 'rdv',\n          rdv_id: rdvId",
    vers: "          source: 'commande',\n          rdv_id: rdvId" },

  { nom: '🔴 le webhook cesse de LIRE le résultat du débit',
    banc: 'verif:bons', fichier: 'app/api/stripe/webhook/route.js',
    de: '        if (!deb?.ok) {\n          console.error(\'[stripe/webhook] débit bon cadeau RDV KO\', deb?.error, { rdvId })\n        }',
    vers: '        void deb' },

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

  { nom: '🔴 la garde de paiement remonte AVANT le calcul du dû',
    banc: 'verif:bons', fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '    if (!couvertSansPaiement) {\n      if (surPlace && !cashAutorise) {',
    vers: '    if (true) {\n      if (surPlace && !cashAutorise) {' },

  { nom: '🔴 la bibliothèque d’emails reformate un montant à la main',
    banc: 'verif:logique', fichier: 'lib/resend.js',
    de: '${euros(Number(montant))}</p>',
    vers: '${Number(montant).toFixed(2)} €</p>' },
]

function lancer(banc) {
  try {
    execSync(`npm run ${banc}`, { cwd: RACINE, stdio: 'pipe', encoding: 'utf8' })
    return { rouge: false, plante: false }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/en échec/.test(sortie), extrait: sortie.slice(-260) }
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
