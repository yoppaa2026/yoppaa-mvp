// HARNAIS DE MUTATION — LA PORTE DE L'ADMINISTRATION (30/08 au soir).
//
// 🔴 CE QU'ON MESURE : qu'un clic de l'admin ne peut plus effacer son propre
// accès. Ce défaut n'était pas une perte de session, c'était une PORTE QUI
// S'OUVRE : être admin, c'est détenir une adresse, pas être un compte. Le
// compte supprimé, l'adresse redevient libre et la première inscription reprend
// tous les droits.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
//
//   node scripts/mutations-admin.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:acces'

const MUTATIONS = [
  { nom: '🔴 la suppression ne sait plus QUI la demande',
    fichier: 'app/api/admin/commercants/route.js',
    de: '  return { admin, user }',
    vers: '  return { admin }' },

  { nom: '🔴 l’admin peut de nouveau effacer son propre compte',
    fichier: 'app/api/admin/commercants/route.js',
    de: '    if (c.auth_user_id && user?.id && c.auth_user_id === user.id) {',
    vers: '    if (false) {' },

  // ⚠️ LE SECOND CHEMIN COMPTE AUTANT : il tiendra le jour où l'admin sera une
  // liste et non une constante.
  { nom: '🔴 le second chemin, par l’adresse du compte visé, disparaît',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      const { data: vise } = await admin.auth.admin.getUserById(c.auth_user_id)',
    vers: '      const vise = null' },

  { nom: '🔴 le refus ne dit plus ce qu’il évite',
    fichier: 'app/api/admin/commercants/route.js',
    de: 'libérerait ton adresse',
    vers: 'poserait un souci' },

  // 🔴 L'ORDRE : le garde-fou des paiements ne couvre PAS un commerce de test,
  // qui n'a aucune transaction. Si le refus admin passe après, il ne protège
  // plus le seul cas où il servait.
  { nom: '🔴 le refus admin repasse APRÈS le garde-fou des paiements',
    fichier: 'app/api/admin/commercants/route.js',
    de: "        error: 'compte_admin',",
    vers: "        error: 'zz_compte_admin',", toutes: true },

  // 🔴 L'ESPOIR À LA PLACE DE L'ACTION. C'est ce silence-là qui a sauvé l'accès
  // d'Alex : « Dermaé » était rattaché à son compte, l'effacement a échoué, et
  // rien ne l'a signalé. La chance a fait le travail d'une garde.
  { nom: '🔴 l’effacement du compte lié redevient un espoir',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      const { error: errAuth } = await admin.auth.admin.deleteUser(c.auth_user_id)\n        .catch((e) => ({ error: e }))',
    vers: '      const errAuth = null\n      await admin.auth.admin.deleteUser(c.auth_user_id).catch((e) => console.warn(e?.message))' },

  { nom: '🔴 l’échec ne remonte plus jusqu’à l’écran',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      compte_supprime: compteSupprime,',
    vers: '' },

  // ⚠️ `null` N'EST PAS `false` : « aucun compte à supprimer » et « le compte
  // n'a pas pu l'être » ne se disent pas de la même façon.
  { nom: '🔴 « aucun compte » se confond avec « échec »',
    fichier: 'app/api/admin/commercants/route.js',
    de: '    let compteSupprime = null',
    vers: '    let compteSupprime = false' },

  // ─── UN VRAI COMMERÇANT S'ARCHIVE (Alex, 15/09) ─────────────────────────
  //
  // 🔴 Chaque table oubliée, c'est un pan d'historique qui repart avec le
  // commerçant. Le bon cadeau est celui qu'on oublierait : il n'a rien d'une
  // commande, et c'est pourtant de l'argent encaissé.
  { nom: '🔴 les bons cadeaux sortent de l’historique',
    fichier: 'app/api/admin/commercants/route.js',
    de: "      { table: 'bons_cadeaux', singulier: 'bon cadeau', pluriel: 'bons cadeaux' },",
    vers: '' },

  { nom: '🔴 les SMS achetes a Yoppaa sortent de l’historique',
    fichier: 'app/api/admin/commercants/route.js',
    de: "      { table: 'fidelite_sms_achats', singulier: 'achat de SMS', pluriel: 'achats de SMS' },",
    vers: '' },

  { nom: '🔴 un historique ne refuse plus la suppression',
    fichier: 'app/api/admin/commercants/route.js',
    de: '    if (historique.length > 0) {',
    vers: '    if (false) {' },

  // ⚠️ « Je n'ai pas pu regarder » ne veut pas dire « il n'y a rien ».
  { nom: '🔴 un comptage impossible laisse passer',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      if (errCompte) {',
    vers: '      if (false) {' },

  { nom: '🔴 le passage en force revient',
    fichier: 'app/api/admin/commercants/route.js',
    de: '    const { commercant_id } = body || {}',
    vers: '    const { commercant_id, force } = body || {}' },

  { nom: '🔴 l’ecran ne reconnait plus le refus d’historique',
    fichier: 'app/admin/ModalEditCommercant.js',
    de: "      if (res.status === 409 && j.error === 'historique_a_conserver') {",
    vers: "      if (res.status === 409 && j.error === 'transactions_payees') {" },

  { nom: '🔴 l’archivage ne suspend plus la fiche',
    fichier: 'app/admin/ModalEditCommercant.js',
    de: "        .update({ statut_publication: 'suspendu' })",
    vers: "        .update({ statut_publication: 'rejete' })" },

  // ─── LES VENTES D'AVCOTECH (Alex, 15/09) ────────────────────────────────
  { nom: '🔴 les packs d’accompagnement payes sortent de l’historique',
    fichier: 'app/api/admin/commercants/route.js',
    de: "      { table: 'success_packs', exclureStatut: 'souhaite', singulier: \"pack d'accompagnement\", pluriel: \"packs d'accompagnement\" },",
    vers: '' },

  // ⚠️ L'erreur inverse : compter les souhaits bloquerait à vie un commerce
  // qui n'a rien acheté.
  { nom: '🔴 un pack seulement coche devient de l’historique',
    fichier: 'app/api/admin/commercants/route.js',
    de: "      { table: 'success_packs', exclureStatut: 'souhaite',",
    vers: "      { table: 'success_packs'," },

  { nom: '🔴 l’exclusion des souhaits ne s’applique plus au comptage',
    fichier: 'app/api/admin/commercants/route.js',
    de: '      if (h.exclureStatut) requete = requete.or(`statut.is.null,statut.neq.${h.exclureStatut}`)',
    vers: '' },

  // ─── LE PIÈGE QUI N'EXISTE PAS ENCORE ──────────────────────────────────
  //
  // 🔴 CANONISER LES ADRESSES GMAIL est une idée qui revient dès qu'on veut
  // dédoublonner des clients, et elle est même juste du point de vue de Gmail.
  // Ici elle transformerait les DOUZE comptes de test en douze administrateurs.
  // ⚠️ ÉCRITES SANS LA MOINDRE BARRE OBLIQUE INVERSE, ET C'EST DÉLIBÉRÉ. Ma
  // première version passait par une expression régulière : l'échappement s'est
  // perdu en route, le fichier muté ne compilait plus, et le banc a PLANTÉ au
  // lieu de rougir. Une mutation change le RÉSULTAT, jamais la TERMINAISON —
  // un banc qui explose ne mesure rien, il constate un accident.
  { nom: '🔴 la normalisation se met à retirer le +alias (12 admins d’un coup)',
    fichier: 'lib/email-normalise.js',
    de: '  return s || null',
    vers: "  if (!s) return null\n  const [av, ap] = s.split('@')\n  return ap ? av.split('+')[0] + '@' + ap : s" },

  { nom: '🔴 et elle se met aussi à retirer les points',
    fichier: 'lib/email-normalise.js',
    de: '  return s || null',
    vers: "  if (!s) return null\n  const [av, ap] = s.split('@')\n  return ap ? av.split('.').join('') + '@' + ap : s" },

  // ⚠️ ET DANS L'AUTRE SENS : une normalisation qui ne fait plus RIEN casserait
  // la reconnaissance d'un email tapé avec une majuscule.
  { nom: '🔴 la normalisation cesse d’uniformiser la casse',
    fichier: 'lib/email-normalise.js',
    de: "  const s = String(valeur ?? '').trim().toLowerCase()",
    vers: "  const s = String(valeur ?? '')" },

  // ─── « VOIR DASHBOARD » VIT DANS L'ONGLET, ET IL MEURT (15/09, trouvé par Alex) ──
  //
  // 🔴 Un vieux « Voir Dashboard » dormait dans le localStorage, commun à tous
  // les onglets et jamais effacé : Alex est tombé sur Ciseaux et Soins en MODE
  // ADMIN. L'admin passe toutes les gardes, débit d'une empreinte compris.
  { nom: '🔴 la duree passe a huit heures',
    fichier: 'lib/impersonation.js',
    de: 'export const DUREE_IMPERSONATION_MS = 2 * 60 * 60 * 1000',
    vers: 'export const DUREE_IMPERSONATION_MS = 8 * 60 * 60 * 1000' },

  { nom: '🔴 a deux heures pile, elle autorise encore',
    fichier: 'lib/impersonation.js',
    de: "  if (ecoule >= DUREE_IMPERSONATION_MS) return 'expiree'",
    vers: "  if (ecoule > DUREE_IMPERSONATION_MS) return 'expiree'" },

  { nom: '🔴 une ligne fermee autorise encore',
    fichier: 'lib/impersonation.js',
    de: "  if (ligne.ended_at) return 'terminee'",
    vers: "  if (false) return 'terminee'" },

  { nom: '🔴 la ligne d un autre commerce ouvre celui-ci',
    fichier: 'lib/impersonation.js',
    de: "  if (!commercantId || String(ligne.commercant_id) !== String(commercantId)) return 'autre_commerce'",
    vers: "  if (!commercantId) return 'autre_commerce'" },

  { nom: '🔴 la ligne d un autre compte autorise',
    fichier: 'lib/impersonation.js',
    de: "  if (!admin || String(ligne.admin_email || '').trim().toLowerCase() !== admin) return 'autre_admin'",
    vers: "  if (!admin) return 'autre_admin'" },

  { nom: '🔴 une ligne oubliee se ferme a maintenant (trois jours d acces au journal)',
    fichier: 'lib/impersonation.js',
    de: '  return fin < maintenant ? fin : maintenant',
    vers: '  return maintenant' },

  { nom: '🔴 une ligne de plus de deux heures ne passe plus pour expiree',
    fichier: 'lib/impersonation.js',
    de: '  return !fin || fin <= maintenant',
    vers: '  return !fin' },

  { nom: '🔴 une deconnexion dans un autre onglet n arrete plus rien',
    fichier: 'lib/impersonation.js',
    de: "  return String(idAuChargement) !== String(idActuel || '')",
    vers: '  return !!idActuel && String(idAuChargement) !== String(idActuel)' },

  { nom: '🔴 « Voir Dashboard » retourne dans le navigateur (tous les onglets)',
    fichier: 'lib/impersonation.js',
    de: "  try { onglet = typeof sessionStorage !== 'undefined' ? sessionStorage : null } catch { onglet = null }",
    vers: "  try { onglet = typeof localStorage !== 'undefined' ? localStorage : null } catch { onglet = null }" },

  { nom: '🔴 les vieilles cles du navigateur ne se purgent plus',
    fichier: 'lib/impersonation.js',
    de: '    navigateur.removeItem(CLE_COMMERCE)',
    vers: '    void 0' },

  { nom: '🔴 le tableau de bord ne demande plus rien au serveur',
    fichier: 'app/dashboard/page.js',
    de: '        const verdict = await verifierImpersonation(supabase, imp)',
    vers: '        const verdict = { ok: true, expireAt: null }' },

  { nom: '🔴 un refus du serveur n efface plus rien',
    fichier: 'app/dashboard/page.js',
    de: '        effacerImpersonation()',
    vers: '        void 0' },

  { nom: '🔴 deux heures passees, l onglet reste ouvert',
    fichier: 'app/dashboard/page.js',
    de: "    const minuterie = setTimeout(() => quitterImpersonation('expiree'), Math.max(0, reste))",
    vers: '    const minuterie = setTimeout(() => {}, Math.max(0, reste))' },

  { nom: '🔴 un autre compte connecte ailleurs ne l arrete plus',
    fichier: 'app/dashboard/page.js',
    de: '      if (compteAChange(compteAuChargementRef.current, session?.user?.id)) {',
    vers: '      if (false) {' },

  { nom: '🔴 l ecran d arret n est plus rendu',
    fichier: 'app/dashboard/page.js',
    de: '  if (compteChange) return (',
    vers: '  if (false && compteChange) return (' },

  { nom: '🔴 la deconnexion du tableau de bord laisse « Voir Dashboard » ouvert',
    fichier: 'app/dashboard/page.js',
    de: '    if (impersonating) await fermerImpersonationServeur(supabase, { toutes: true })',
    vers: '    void 0' },

  { nom: '⚠️ la deconnexion voulue passe pour un changement de compte',
    fichier: 'app/dashboard/page.js',
    de: '    sortieVoulueRef.current = true',
    vers: '    void 0' },

  { nom: '🔴 « Voir Dashboard » s ecrit de nouveau dans le navigateur',
    fichier: 'app/admin/SectionTousCommercants.js',
    de: '      if (!poserImpersonation(c.id, j.impersonation_id)) {',
    vers: "      if (localStorage.setItem('yoppaa_admin_impersonating', c.id)) {" },

  // ─── LE MESSAGE ET LE BOUTON (16/09) ────────────────────────────────────
  { nom: '🔴 le bouton reprend un nom que les messages ne citent pas',
    fichier: 'app/admin/SectionTousCommercants.js',
    de: '                    Voir Dashboard →',
    vers: '                    Dashboard →' },

  { nom: '🔴 un message envoie cliquer sur un bouton qui n existe pas',
    fichier: 'lib/impersonation.js',
    de: "  expiree: 'Ta connexion en tant que commerçant a pris fin après deux heures. Clique « Voir Dashboard » pour la rouvrir.',",
    vers: "  expiree: 'Ta connexion en tant que commerçant a pris fin après deux heures. Clique « Ouvrir le dashboard » pour la rouvrir.'," },

  { nom: '🔴 un bouton de l admin retrouve une deconnexion qui n efface rien',
    fichier: 'app/admin/page.js',
    de: 'onClick={seDeconnecter}',
    vers: "onClick={async () => { marquerDeconnexionVoulue(); await supabase.auth.signOut(); router.push('/login') }}" },

  { nom: '🔴 la sortie de l admin ne ferme plus le journal',
    fichier: 'app/admin/page.js',
    de: '      const fermees = await fermerImpersonationServeur(supabase, { toutes: true })',
    vers: '      const fermees = true' },

  { nom: '🔴 la page Abonnement rouvre un commerce qui n est pas le sien',
    fichier: 'app/dashboard/abonnement/page.js',
    de: ".eq('id', savedId).eq('auth_user_id', user.id)",
    vers: ".eq('id', savedId)" },

  { nom: '🔴 la page Abonnement ne demande plus au serveur',
    fichier: 'app/dashboard/abonnement/page.js',
    de: '        const verdict = await verifierImpersonation(supabase, imp)',
    vers: '        const verdict = { ok: true }' },

  { nom: '🔴 la route accepte sans appliquer la regle',
    fichier: 'app/api/admin/impersonate-verifier/route.js',
    de: '    const raison = raisonImpersonationRefusee(ligne, { adminEmail: user.email, commercantId: commercant_id, maintenant })',
    vers: '    const raison = null' },

  { nom: '🔴 un journal illisible vaut un accord',
    fichier: 'app/api/admin/impersonate-verifier/route.js',
    de: '    if (error) {',
    vers: '    if (false) {' },

  { nom: '🔴 la fermeture redevient un espoir',
    fichier: 'app/api/admin/impersonate-end/route.js',
    de: '      if (errFin || !faite?.length) {',
    vers: '      if (false) {' },

  { nom: '⚠️ une nouvelle connexion ne range plus les lignes oubliees',
    fichier: 'app/api/admin/impersonate-start/route.js',
    de: '    for (const l of (ouvertes || []).filter(l => ligneExpiree(l, maintenant))) {',
    vers: '    for (const l of []) {' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-400) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
    const plante = !/vérifications passées/.test(sortie)
    return { rouge: true, plante, extrait: sortie.slice(-500) }
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
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  if (!original.includes(m.de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, m.toutes ? original.split(m.de).join(m.vers) : original.replace(m.de, m.vers))
  const res = lancer()
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

const finalRouge = lancer().rouge
if (finalRouge) console.log(`🔴 ${BANC} ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
