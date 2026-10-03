// HARNAIS DE MUTATION — LES DEMOS RESERVEES A LA VERIFICATION DES STORES (03/10)
//
// 🔴 CE QU'ON MESURE, DANS LES DEUX SENS. Les relecteurs d'Apple et de Google
// commandent chez des commerces de demonstration ; le public ne doit JAMAIS
// les voir, ni les recevoir dans un envoi collectif. Une fiche en `relecture`
// ne s'ouvre qu'aux comptes de `comptes_relecture`, et seule cette valeur-la
// peut s'ouvrir.
//
// Ces mutations remettent les formes fausses : la relecture comptee comme
// publiee (elle partirait dans le Good Morning), l'ecran qui l'ecarte (le
// relecteur ne trouverait plus Chez Momo), le `||` a la place du `&&` (tous
// les commerces publies refuses), la fiche en preparation ouverte au
// relecteur, la liste lue sans compte, la vue ouverte a tous, la liste
// lisible depuis le navigateur.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUNE ANCRE A CHEVAL SUR DEUX LIGNES (npm run verif:ancres).
// ⚠️ CHAQUE MUTATION NOMME LA GARDE QU'ELLE DOIT FAIRE ROUGIR.
//
//   node scripts/mutations-relecture.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:acces'

const REGLE = 'lib/statut-commercant.js'
const PORTE = 'lib/relecture-serveur.js'
const FILE = 'lib/attente-rdv-server.js'
const MIGRATION = 'migrations/MIGRATION_RELECTURE_STORES.sql'

const MUTATIONS = [
  // ─── LA REGLE PURE ──────────────────────────────────────────────────────
  { nom: '🔴 la relecture compte comme publiee : les demos partent dans le Good Morning',
    fichier: REGLE,
    de: '  return commercant?.[COLONNE_PUBLICATION] === PUBLICATION_OUVERTE',
    vers: '  return PUBLICATIONS_DE_LA_VUE.includes(commercant?.[COLONNE_PUBLICATION])',
    garde: 'une fiche en relecture N’EST PAS publiée' },

  { nom: '🔴 l ecran ecarte ce que la vue lui confie : le relecteur ne trouve plus la demo',
    fichier: REGLE,
    de: '  return PUBLICATIONS_DE_LA_VUE.includes(commercant?.[COLONNE_PUBLICATION])',
    vers: '  return commercant?.[COLONNE_PUBLICATION] === PUBLICATION_OUVERTE',
    garde: 'la vue peut rendre la fiche publiée et la relecture' },

  // ─── LA PORTE DU SERVEUR ────────────────────────────────────────────────
  { nom: '🔴 une fiche en preparation s ouvre au relecteur',
    fichier: PORTE,
    de: '  if (!ficheEnRelecture(commercant)) return false',
    vers: '  if (!commercant) return false',
    garde: 'reste fermée, même au relecteur' },

  { nom: '🔴 n importe quel compte entre',
    fichier: PORTE,
    de: '  return !!data',
    vers: '  return true',
    garde: 'un compte hors de la liste reste dehors' },

  { nom: '⚠️ la liste est consultee sans compte',
    fichier: PORTE,
    de: '  if (!compte) return false',
    vers: '  if (compte === undefined) return false',
    garde: 'et la liste n’est même pas consultée' },

  // ─── LES ROUTES ─────────────────────────────────────────────────────────
  { nom: '🔴 un OU a la place du ET : le rendez-vous refuse tous les commerces publies',
    fichier: 'app/api/rdv/reserver/route.js',
    de: '    if (!fichePubliee(commercant) && !(await relectureAutorisee(db,',
    vers: '    if (!fichePubliee(commercant) || !(await relectureAutorisee(db,',
    garde: 'app/api/rdv/reserver/route.js : fiche publiée, ou relecture' },

  { nom: '🔴 l acompte s encaisse de nouveau chez un commerce non publie',
    fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: '    if (!fichePubliee(commercant) && !(await relectureAutorisee(supabase, commercant, () => compteDeLaRequete(request)))) {',
    vers: '    if (false) {',
    garde: 'create-rdv-acompte/route.js : fiche publiée' },

  { nom: '🔴 le rendez-vous avec produits juge une colonne qu il ne charge pas',
    fichier: 'app/api/stripe/checkout/create-rdv-commande/route.js',
    de: 'statut_publication, rdv_actif, plan, essai_plan, created_at,',
    vers: 'rdv_actif, plan, essai_plan, created_at,',
    garde: 'create-rdv-commande/route.js lit la colonne' },

  { nom: '🔴 l abonnement se vend de nouveau chez un commerce non publie',
    fichier: 'app/api/stripe/checkout/create-abonnement/route.js',
    de: '    if (!commercant || !fichePubliee(commercant)) {',
    vers: '    if (!commercant) {',
    garde: 'l’abonnement ne se vend plus' },

  // ─── LA LISTE D'ATTENTE ─────────────────────────────────────────────────
  { nom: '🔴 une place liberee previent la file d un commerce ferme',
    fichier: FILE,
    de: "    if (!fichePubliee(prestation.commercant)) return { ok: true, prevenus: 0, file: 0, raison: 'commerce_ferme' }",
    vers: "    if (false) return { ok: true, prevenus: 0, file: 0, raison: 'commerce_ferme' }",
    garde: 'ne prévient personne' },

  { nom: '🔴 la route ne passe plus le compte : le relecteur ne s inscrit plus',
    fichier: 'app/api/rdv/attente/route.js',
    de: '      authUserId: identite.auth_user_id,',
    vers: '      authUserId: null,',
    garde: 'la route lui passe le compte PROUVÉ' },

  { nom: '🔴 l identite prouvee ne porte plus le compte',
    fichier: 'lib/yopper-auth.js',
    de: '      auth_user_id: user.id,',
    vers: '      auth_user_id: null,',
    garde: 'l’identité prouvée porte le compte' },

  // ─── LES ENVOIS COLLECTIFS ET LES ECRANS ────────────────────────────────
  { nom: '🔴 le Good Morning prend les demos',
    fichier: 'app/api/cron/morning-yoppers/route.js',
    de: '    if (!fichePubliee(c)) continue',
    vers: '    if (!ficheRendueParLaVue(c)) continue',
    garde: 'morning-yoppers/route.js n’envoie jamais une démo' },

  { nom: '🔴 la fiche ecarte la demo que la vue a confiee au relecteur',
    fichier: 'app/commander/[slug]/page.js',
    de: '    if (!ficheRendueParLaVue(c)) {',
    vers: '    if (!fichePubliee(c)) {',
    garde: 'app/commander/[slug]/page.js n’écarte pas une démo' },

  { nom: '🔴 l accueil filtre de nouveau sur « publie » : le relecteur ne voit aucune demo',
    fichier: 'app/commander/page.js',
    de: ".in('statut_publication', PUBLICATIONS_DE_LA_VUE)",
    vers: ".eq('statut_publication', 'publie')",
    garde: 'l’accueil et les favoris demandent' },

  // ─── LA MIGRATION ───────────────────────────────────────────────────────
  { nom: '🔴 la vue montre les demos a TOUT LE MONDE',
    fichier: MIGRATION,
    de: "     OR (statut_publication = 'relecture'::text AND public.est_compte_relecture());",
    vers: "     OR (statut_publication = 'relecture'::text);",
    garde: 'la vue rend la relecture aux seuls comptes de la liste' },

  { nom: '🔴 la liste des relecteurs devient lisible depuis le navigateur',
    fichier: MIGRATION,
    de: 'REVOKE ALL ON public.comptes_relecture FROM anon, authenticated;',
    vers: 'GRANT SELECT ON public.comptes_relecture TO anon, authenticated;',
    garde: 'la liste n’est lisible par personne' },

  { nom: '🔴 l admin perd le catalogue des fiches non publiees',
    fichier: MIGRATION,
    de: '  ) OR COALESCE(public.is_yoppaa_admin(), false)',
    vers: '  )',
    garde: 'le catalogue aussi, propriétaire et admin gardés' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, sortie }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTE ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications/.test(sortie)
    return { rouge: true, plante, sortie }
  }
}

const depart = lancer()
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.sortie.slice(-400))
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
  ecrireSur(f, original.replace(m.de, m.vers))
  const res = lancer()
  ecrireSur(f, original)

  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }

  const nommee = res.sortie.includes(m.garde)
  if (res.rouge && !res.plante && nommee) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else if (res.rouge) { manquees.push(`${m.nom} — rouge, mais PAS sur « ${m.garde} »`); console.log(`  ✕ AUTRE GARDE : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉ VERT`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
