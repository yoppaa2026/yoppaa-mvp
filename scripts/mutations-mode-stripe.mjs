// HARNAIS DE MUTATION — LE MONDE D UN COMPTE STRIPE (17/09)
//
// 🔴 CE QU ON MESURE. Le jour ou la cle plateforme passe en `sk_live_`, chaque
// `stripe_account_id` cree en test pointe vers un compte inexistant. Sans les
// gardes de ce lot, le commercant clique « Continuer l onboarding », recoit un
// message anglais, reclique, et reste coince POUR TOUJOURS.
//
// Chacune des mutations ci-dessous remet une des formes fausses possibles. Si
// le banc reste vert sur l une d elles, ce lot ne protege pas ce qu il pretend.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-mode-stripe.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:mode-stripe'
const MODULE = 'lib/stripe-mode.js'

const LIEN = 'app/api/stripe/connect/create-account-link/route.js'
const ETAT = 'app/api/stripe/connect/refresh-status/route.js'
const SQL  = 'migrations/MIGRATION_MODE_COMPTE_STRIPE.sql'
const BORD = 'app/dashboard/TabPaiements.js'

const MUTATIONS = [
  // ─── LE MONDE D UNE CLE ─────────────────────────────────────────────────
  { nom: '🔴 pas de cle = « live » : le defaut exact d isStripeTestMode',
    de: "  if (typeof cle !== 'string') return null",
    vers: "  if (typeof cle !== 'string') return MODE_LIVE" },

  { nom: '🔴 la cle publiable decide du mode : une valeur publique juge la plateforme',
    de: "  if (cle.startsWith('sk_test_')) return MODE_TEST",
    vers: "  if (cle.includes('test_')) return MODE_TEST" },

  { nom: '🔴 tout ce qui n est pas test devient live, prefixe inconnu compris',
    de: "  if (cle.startsWith('sk_live_')) return MODE_LIVE",
    vers: "  if (!cle.startsWith('sk_test_')) return MODE_LIVE" },

  // ─── LE VERDICT ─────────────────────────────────────────────────────────
  { nom: '🔴 un monde non note passe pour « ok » : la detection s endort',
    de: "  if (ne !== MODE_TEST && ne !== MODE_LIVE) return VERDICT.INCONNU",
    vers: "  if (ne !== MODE_TEST && ne !== MODE_LIVE) return VERDICT.OK" },

  { nom: '🔴 un monde non note passe pour « perdu » : on detache des comptes qui marchent',
    de: "  if (ne !== MODE_TEST && ne !== MODE_LIVE) return VERDICT.INCONNU",
    vers: "  if (ne !== MODE_TEST && ne !== MODE_LIVE) return VERDICT.PERDU" },

  { nom: '🔴 un mode plateforme absent ne bloque plus le verdict : on juge sans savoir',
    de: "  if (mode !== MODE_TEST && mode !== MODE_LIVE) return VERDICT.INCONNU",
    vers: "  if (mode !== MODE_TEST && mode !== MODE_LIVE) return VERDICT.OK" },

  { nom: '🔴 une valeur fantaisiste en base passe pour un monde',
    de: "  if (ne !== MODE_TEST && ne !== MODE_LIVE) return VERDICT.INCONNU",
    vers: "  if (!ne) return VERDICT.INCONNU" },

  { nom: '🔴 le verdict ne regarde plus que le monde du compte : la bascule devient invisible',
    de: "  return ne === mode ? VERDICT.OK : VERDICT.PERDU",
    vers: "  return VERDICT.OK" },

  { nom: '🔴 « perdu » dit vrai sur « inconnu » : detachement en masse au premier deploiement',
    de: "  return verdictCompte(commercant, mode) === VERDICT.PERDU",
    vers: "  return verdictCompte(commercant, mode) !== VERDICT.OK" },

  // ─── CE QU ON ECRIT EN BASE ─────────────────────────────────────────────
  { nom: '🔴 L ANCIEN IDENTIFIANT EST JETE : une cle remise en test efface les vrais comptes',
    de: "    stripe_account_id_precedent: commercant?.stripe_account_id ?? null,",
    vers: "    stripe_account_id_precedent: null," },

  { nom: '🔴 un drapeau survit au detachement : la fiche pretend encore encaisser',
    de: "    stripe_account_charges_enabled: false,",
    vers: "    stripe_account_charges_enabled: true," },

  { nom: '🔴 le monde n est plus note a la naissance : toute la detection devient muette',
    de: "    stripe_account_mode: mode,",
    vers: "    stripe_account_mode: null," },

  { nom: '🔴 la naissance invente « live » quand la cle est inconnue',
    de: "export function naissanceCompte(accountId, mode = modePlateforme()) {",
    vers: "export function naissanceCompte(accountId, mode = modePlateforme() || MODE_LIVE) {" },

  // ─── CE QUE LIT LE COMMERCANT ───────────────────────────────────────────
  { nom: '⚠️ le message ne dit plus ce qui ne bouge pas : le commercant croit avoir tout perdu',
    de: "      + 'articles et tes clients ne bougent pas.'",
    vers: "      + ''" },

  { nom: '🔴 le message rend l identifiant technique et l anglais de Stripe',
    de: "    return 'Ton compte de paiement doit etre reconnecte : Yoppaa est passe en '",
    vers: "    return 'No such account: acct_1ABC. Ton compte doit etre reconnecte en '" },

  // ─── LA ROUTE DE CONNEXION ──────────────────────────────────────────────
  { nom: '🔴 LE DEFAUT D ORIGINE : le verdict disparait, le commercant reste coince a vie',
    fichier: LIEN,
    de: "    const perdu = comptePerdu(commercant)",
    vers: "    const perdu = false" },

  { nom: '🔴 le monde n est plus selectionne : le verdict est aveugle en silence',
    fichier: LIEN,
    de: "      .select('id, nom, email, slug, stripe_account_id, stripe_account_mode, auth_user_id, plan, essai_plan, created_at')",
    vers: "      .select('id, nom, email, slug, stripe_account_id, auth_user_id, plan, essai_plan, created_at')" },

  { nom: '⚠️ le slug retombe hors du select : Stripe recoit une URL technique',
    fichier: LIEN,
    de: "      .select('id, nom, email, slug, stripe_account_id, stripe_account_mode, auth_user_id, plan, essai_plan, created_at')",
    vers: "      .select('id, nom, email, stripe_account_id, stripe_account_mode, auth_user_id, plan, essai_plan, created_at')" },

  { nom: '🔴 le monde n est plus note a la creation : la garde ne se declenchera jamais',
    fichier: LIEN,
    de: "        .update(naissanceCompte(accountId))",
    vers: "        .update({ stripe_account_id: accountId })" },

  { nom: '🔴 l erreur d ecriture du lien n est plus lue : compte cree chez Stripe, orphelin chez nous',
    fichier: LIEN,
    de: "      const { error: errLien } = await supabase",
    vers: "      const errLien = null; await supabase" },

  { nom: '🔴 l erreur de detachement n est plus lue : deux comptes, un seul lien',
    fichier: LIEN,
    de: "      const { error: errDetach } = await supabase",
    vers: "      const errDetach = null; await supabase" },

  { nom: '🔴 ON DESARME LA GARDE DE FORFAIT pour tout le monde, pas juste pour un compte perdu',
    fichier: LIEN,
    de: "      const verdict = perdu ? { ok: true } : verdictForfait(commercant, 'paiement_ligne')",
    vers: "      const verdict = { ok: true }" },

  { nom: '⚠️ la garde de forfait se rearme sur un compte perdu : il paie NOTRE bascule',
    fichier: LIEN,
    de: "      const verdict = perdu ? { ok: true } : verdictForfait(commercant, 'paiement_ligne')",
    vers: "      const verdict = verdictForfait(commercant, 'paiement_ligne')" },

  // ─── LA ROUTE D ETAT ────────────────────────────────────────────────────
  { nom: '🔴 on interroge Stripe avant de juger : message anglais sur un simple affichage',
    fichier: ETAT,
    de: "    const verdict = verdictCompte(commercant)",
    vers: "    const verdict = null" },

  { nom: '⚠️ la date d ouverture retombe hors du select : reecrite a chaque passage',
    fichier: ETAT,
    de: "      .select('id, stripe_account_id, stripe_account_mode, stripe_onboarding_done_at, auth_user_id')",
    vers: "      .select('id, stripe_account_id, stripe_account_mode, auth_user_id')" },

  { nom: '🔴 le monde retombe hors du select de l etat : le verdict ne voit plus rien',
    fichier: ETAT,
    de: "      .select('id, stripe_account_id, stripe_account_mode, stripe_onboarding_done_at, auth_user_id')",
    vers: "      .select('id, stripe_account_id, stripe_onboarding_done_at, auth_user_id')" },

  { nom: '🔴 un simple affichage se met a ecrire en base, a chaque ouverture de page',
    fichier: ETAT,
    de: "        code: 'compte_autre_mode',",
    vers: "        code: 'compte_autre_mode', ecrit: await supabase.from('commercants').update(detachementCompte(commercant)).eq('id', commercant_id)," },

  { nom: '🔴 le commercant recoit un code technique au lieu du message francais',
    fichier: ETAT,
    de: "        error: messageCompte(verdict),",
    vers: "        error: 'compte_autre_mode'," },

  // ─── L ECRAN QUI DOIT LE DIRE ───────────────────────────────────────────
  { nom: '🔴 LE DEFAUT D ORIGINE : l ecran n attrape plus la reponse, le 409 part dans le vide',
    fichier: BORD,
    de: "      const res = await fetch('/api/stripe/connect/refresh-status', {",
    vers: "      const res = { ok: true, json: async () => ({}) }; await fetch('/api/stripe/connect/refresh-status', {" },

  { nom: '🔴 le code HTTP n est plus lu : un 409 passe pour un succes',
    fichier: BORD,
    de: "      if (!res.ok) {",
    vers: "      if (false) {" },

  { nom: '🔴 le message du serveur est remplace par un texte generique',
    fichier: BORD,
    de: "        toast?.(j.error || 'L’état de ton compte de paiement n’a pas pu être vérifié.', 'error')",
    vers: "        toast?.('Erreur', 'error')" },

  { nom: '⚠️ l ecran ne se recharge plus : l etat reste fige apres l erreur',
    fichier: BORD,
    de: "      const j = await res.json().catch(() => ({}))",
    vers: "      const j = await res.json().catch(() => ({})); return" },

  // ─── LA MIGRATION ───────────────────────────────────────────────────────
  { nom: '🔴 les droits ne sont plus repliques : le parcours casse sous l identite du commercant',
    fichier: SQL,
    de: "      'GRANT %s (stripe_account_mode, stripe_account_id_precedent) ON public.commercants TO %s',",
    vers: "      'SELECT %s, ''(stripe_account_mode, stripe_account_id_precedent) ON public.commercants TO %s'''," },

  { nom: '🔴 l existant n est plus marque : onze comptes invisibles a la detection',
    fichier: SQL,
    de: "   SET stripe_account_mode = 'test'",
    vers: "   SET stripe_account_mode = stripe_account_mode" },

  { nom: '⚠️ la contrainte accepte n importe quelle valeur : un « sandbox » fait mentir le verdict',
    fichier: SQL,
    de: "  CHECK (stripe_account_mode IS NULL OR stripe_account_mode IN ('test', 'live'));",
    vers: "  CHECK (stripe_account_mode IS NULL OR length(stripe_account_mode) > 0);" },

  { nom: '🔴 le controle ne compte plus les comptes sans monde note',
    fichier: SQL,
    de: "         WHERE stripe_account_id IS NOT NULL AND stripe_account_mode IS NULL),",
    vers: "         WHERE stripe_account_id IS NOT NULL)," },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n est pas une mesure, c est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-400) }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log('Banc vert au départ.\n')

let attrapees = 0
const manquees = []

for (const m of MUTATIONS) {
  const f = chemin(m.fichier || MODULE)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier || MODULE}. On s'arrête.`)
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
