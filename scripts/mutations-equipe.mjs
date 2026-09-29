// HARNAIS DE MUTATION — L'ÉQUIPE D'UN COMMERCE
//
// Chaque mutation ouvre une porte précise, et le banc qu'elle nomme doit
// rougir.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   npm run mutations:equipe

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:equipe'

const MUTATIONS = [
  // ─── LES RÈGLES ──────────────────────────────────────────────────────────
  { nom: '🔴 la chaîne "false" coche une case',
    fichier: 'lib/equipe.js', de: 'droits[colonneDroit(cle)] = entree?.[cle] === true || entree?.[colonneDroit(cle)] === true', vers: 'droits[colonneDroit(cle)] = !!entree?.[cle] || !!entree?.[colonneDroit(cle)]' },
  { nom: '🔴 « argent » sans « agenda » passe',
    fichier: 'lib/equipe.js', de: '  if (d.droit_argent && !d.droit_agenda) {', vers: '  if (false) {' },
  { nom: '🔴 un droit inconnu répond au lieu de lever',
    fichier: 'lib/equipe.js', de: "  if (!CLES_DROITS.includes(cle)) throw new Error(`droit d'équipe inconnu : ${cle}`)", vers: '' },
  { nom: '🔴 le forfait n est plus vérifié',
    fichier: 'lib/equipe.js', de: "  return canDo(planEffectif(commercant, maintenant), 'equipe')", vers: '  return true' },
  { nom: '🔴 un commerce non validé a une équipe',
    fichier: 'lib/equipe.js', de: "  if (!['valide', 'actif'].includes(commercant.statut)) return false", vers: '' },
  { nom: '🔴 le patron s invite lui-même',
    fichier: 'lib/equipe.js', de: "  if (emailPatron && adresse === adresseNormalisee(emailPatron)) return", vers: "  if (false) return" },
  { nom: '🔴 le plafond ne compte plus les invitations en attente',
    fichier: 'lib/equipe.js', de: "  const enPlace = (membres || []).filter(m => m.statut !== 'retire')", vers: "  const enPlace = (membres || []).filter(m => m.statut === 'actif')" },
  { nom: '⚠️ le plafond change sans décision d Alex',
    fichier: 'lib/equipe.js', de: 'export const EQUIPE_MAX = 10', vers: 'export const EQUIPE_MAX = 5' },
  { nom: '🔴 le plafond saute',
    fichier: 'lib/equipe.js', de: '  if (enPlace.length >= EQUIPE_MAX) return', vers: '  if (enPlace.length > EQUIPE_MAX) return' },
  { nom: '🔴 la date de fin ne coupe plus l accès',
    fichier: 'lib/equipe.js', de: '  if (membre.expire_le && new Date(membre.expire_le).getTime() <= maintenant.getTime()) return false', vers: '' },
  { nom: '🔴 un membre agit dans un autre commerce',
    fichier: 'lib/equipe.js', de: '  if (!commercant || membre.commercant_id !== commercant.id) return false', vers: '  if (!commercant) return false' },
  { nom: '🔴 un autre compte accepte l invitation',
    fichier: 'lib/equipe.js', de: '  if (adresseNormalisee(user.email) !== adresseNormalisee(membre.email)) {', vers: '  if (false) {' },
  { nom: '🔴 une invitation expirée s accepte',
    fichier: 'lib/equipe.js', de: '  if (!invitationOuverte(membre, maintenant)) return', vers: '  if (!membre.invitation_expire_le) return' },

  // ─── LE SERVEUR ──────────────────────────────────────────────────────────
  { nom: '🔴 la garde du membre oublie le commerce',
    fichier: 'lib/equipe-server.js', de: ".eq('commercant_id', commercantId).eq('auth_user_id', user.id).eq('statut', 'actif')", vers: ".eq('auth_user_id', user.id).eq('statut', 'actif')" },
  { nom: '🔴 la garde du membre oublie ses cases',
    fichier: 'lib/equipe-server.js', de: '  if (!peutAgir({ membre, commercant, droit })) return { ok: false, status: 403', vers: '  if (!membre) return { ok: false, status: 403' },
  { nom: '🔴 un membre gère l équipe',
    fichier: 'lib/equipe-server.js', de: '  if (!patron && !(await adminVerifie(request, user))) return { ok: false, status: 403', vers: '  if (false) return { ok: false, status: 403' },
  { nom: '🔴 les routes lisent l empreinte du jeton',
    fichier: 'lib/equipe-server.js', de: "export const COLONNES_MEMBRE = 'id, commercant_id,", vers: "export const COLONNES_MEMBRE = 'id, invitation_jeton_hash, commercant_id," },
  { nom: '⚠️ une lecture ratée répond « personne »',
    fichier: 'lib/equipe-server.js', de: "  if (error) throw new Error(`lecture de l'équipe : ${error.message}`)", vers: '' },

  // ─── LES ROUTES ──────────────────────────────────────────────────────────
  { nom: '🔴 le jeton est gardé en clair',
    fichier: 'app/api/equipe/inviter/route.js', de: 'invitation_jeton_hash: empreinteJeton(jeton),', vers: 'invitation_jeton_hash: jeton,' },
  { nom: '🔴 l invitation oublie l adresse du patron',
    fichier: 'app/api/equipe/inviter/route.js', de: 'emailPatron: commercant.email, maintenant,', vers: 'emailPatron: null, maintenant,' },
  { nom: '🔴 modifier touche l équipe d un autre commerce',
    fichier: 'app/api/equipe/modifier/route.js', de: ".eq('id', membre_id).eq('commercant_id', commercant_id).neq('statut', 'retire').select(COLONNES_MEMBRE).maybeSingle()", vers: ".eq('id', membre_id).neq('statut', 'retire').select(COLONNES_MEMBRE).maybeSingle()" },
  { nom: '🔴 retirer touche l équipe d un autre commerce',
    fichier: 'app/api/equipe/retirer/route.js', de: ".eq('id', membre_id).eq('commercant_id', commercant_id).neq('statut', 'retire')", vers: ".eq('id', membre_id).neq('statut', 'retire')" },
  { nom: '🔴 retirer laisse vivre le lien d invitation',
    fichier: 'app/api/equipe/retirer/route.js', de: "retire_le: maintenant, updated_at: maintenant, invitation_jeton_hash: null, invitation_expire_le: null", vers: "retire_le: maintenant, updated_at: maintenant" },
  { nom: '🔴 rejoindre sans vérifier la règle',
    fichier: 'app/api/equipe/rejoindre/route.js', de: '    if (refus) return NextResponse.json({ ok: false, error: refus }, { status: 409 })', vers: '' },
  { nom: '🔴 une invitation s accepte deux fois',
    fichier: 'app/api/equipe/rejoindre/route.js', de: ".eq('id', membre.id).eq('statut', 'invite').eq('invitation_jeton_hash', empreinte)", vers: ".eq('id', membre.id)" },
  { nom: '🔴 l invitation sans session livre l adresse entière',
    fichier: 'app/api/equipe/invitation/route.js', de: '      adresse: adresseMasquee(membre.email),', vers: '      adresse: membre.email,' },
  { nom: '🔴 « mes équipes » montre un accès terminé',
    fichier: 'app/api/equipe/mes-equipes/route.js', de: 'membreEnActivite(m, maintenant) && commerceAUneEquipe(c, maintenant)', vers: 'commerceAUneEquipe(c, maintenant)' },

  // ─── LE RETOUR APRÈS CONNEXION ───────────────────────────────────────────
  { nom: '🔴 « //site » redevient une adresse interne',
    fichier: 'lib/chemin-interne.js', de: "  if (s.startsWith('//') || s.startsWith('/\\\\')) return defaut", vers: "  if (s.startsWith('/\\\\')) return defaut" },
  { nom: '🔴 la barre oblique inverse de tête passe',
    fichier: 'lib/chemin-interne.js', de: "  if (s.startsWith('//') || s.startsWith('/\\\\')) return defaut", vers: "  if (s.startsWith('//')) return defaut" },
  { nom: '🔴 un caractère de contrôle passe',
    fichier: 'lib/chemin-interne.js', de: '    if (n < 32 || n === 127) return defaut', vers: '    if (false) return defaut' },
  { nom: '🔴 la page de session suit n importe quelle adresse',
    fichier: 'app/auth/session/page.js', de: "    const next = cheminInterne(searchParams.get('next'), '/dashboard')", vers: "    const next = searchParams.get('next') || '/dashboard'" },
  { nom: '🔴 la page de connexion suit n importe quelle adresse',
    fichier: 'app/login/page.js', de: "  const nextPath = cheminInterne(searchParams?.get('next'), '/dashboard')", vers: "  const nextPath = searchParams?.get('next') || '/dashboard'" },

  // ─── L'EMAIL, LA BASE, L'ÉCRAN ───────────────────────────────────────────
  { nom: '🔴 la mention de bas de page redevient brute',
    fichier: 'lib/resend.js', de: '  const commercantNom = commercantNomBrut ? echapperHtml(commercantNomBrut) : \'\'', vers: '  const commercantNom = commercantNomBrut || \'\'' },
  { nom: '🔴 la migration ouvre une règle d accès',
    fichier: 'migrations/MIGRATION_EQUIPE_MEMBRES.sql', de: 'ALTER TABLE public.equipe_journal ENABLE ROW LEVEL SECURITY;', vers: 'ALTER TABLE public.equipe_journal ENABLE ROW LEVEL SECURITY; CREATE POLICY equipe_lit ON public.equipe_membres FOR SELECT TO authenticated USING (true);' },
  { nom: '🔴 l onglet entre dans la barre sans le Poste équipe',
    fichier: 'lib/equipe.js', de: 'export const EQUIPE_DANS_LA_BARRE = false', vers: 'export const EQUIPE_DANS_LA_BARRE = true' },
  { nom: '⚠️ ?config=equipe retombe sur l accueil',
    fichier: 'app/dashboard/page.js', de: "    'equipe']", vers: "    ]" },
  { nom: '🔴 la matrice ouvre l équipe à Exister',
    fichier: 'lib/plans.js', de: "    equipe:                  false,   // l'équipe (personnel, livreurs) : Vendre", vers: "    equipe:                  true,   // l'équipe (personnel, livreurs) : Vendre" },
]

const lancer = (banc) => {
  try {
    const sortie = execSync(`npm run ${banc}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    return { rouge: true, plante: !/vérifications/.test(sortie), extrait: sortie.slice(-400) }
  }
}

const depart = lancer(BANC)
if (depart.rouge) {
  console.log(`🔴 ${BANC} EST DÉJÀ ROUGE. On ne mesure rien sur un banc rouge.`)
  console.log(depart.extrait)
  process.exit(1)
}
console.log(`Banc vert au départ : ${BANC}.\n`)

let attrapees = 0
const manquees = []
for (const m of MUTATIONS) {
  const f = chemin(m.fichier)
  const original = readFileSync(f, 'utf8')
  // ⚠️ Les fichiers peuvent être en CRLF : la cible suit la fin de ligne du fichier.
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const de = m.de.split('\n').join(eol)
  const vers = m.vers.split('\n').join(eol)
  if (!original.includes(de)) {
    manquees.push(`${m.nom} — TEXTE INTROUVABLE`)
    console.log(`  ? introuvable : ${m.nom}`)
    continue
  }
  ecrireSur(f, original.replace(de, vers))
  const res = lancer(m.banc || BANC)
  ecrireSur(f, original)
  if (readFileSync(f, 'utf8') !== original) {
    console.log(`\n🔴 RESTAURATION RATÉE sur ${m.fichier}. On s'arrête.`)
    process.exit(2)
  }
  if (res.rouge && !res.plante) { attrapees++; console.log(`  ✓ attrapée : ${m.nom}`) }
  else if (res.plante) { manquees.push(`${m.nom} — le banc a PLANTÉ`); console.log(`  ⚠ plantage : ${m.nom}`) }
  else { manquees.push(`${m.nom} — RESTÉE VERTE`); console.log(`  ✕ MANQUÉE : ${m.nom}`) }
}

console.log(`\n${attrapees}/${MUTATIONS.length} mutations attrapées.`)
if (manquees.length) { console.log('\nNON ATTRAPÉES :'); manquees.forEach((x) => console.log('   • ' + x)) }
const finalRouge = lancer(BANC).rouge
if (finalRouge) console.log(`🔴 ${BANC} EST ROUGE APRÈS RESTAURATION.`)
else console.log('\nBanc vert après restauration. Dépôt intact.')
process.exit(manquees.length || finalRouge ? 1 : 0)
