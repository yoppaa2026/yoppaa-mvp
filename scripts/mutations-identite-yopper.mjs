// HARNAIS DE MUTATION — L'IDENTITÉ MÉLANGÉE (03/09).
//
// 🔴 CE QU'ON MESURE : qu'un Yopper voie SES coordonnées, et pas celles du
// compte précédent. Alex arrivait dans la bonne session, avec la bonne adresse
// et le bon mot de passe, mais le nom, le prénom et le téléphone d'un autre.
//
// Trois écritures partielles (`if (client.nom) localStorage.setItem(...)`), un
// repli explicite sur le prénom d'avant, une fusion serveur enfermée dans
// « seulement si le navigateur n'a rien », et une hydratation qui ne demandait
// jamais à la session qui était connecté.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON : toutes gardent
//    des accolades équilibrées, sinon le banc exploserait au lieu de rougir.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES. Le dépôt est stocké en LF, mais le
// disque peut porter du CRLF là où git n a pas encore normalisé : une ancre à
// cheval sur deux lignes ne vaut alors que sur une machine. Vérifié par
// npm run verif:ancres.
//
//   node scripts/mutations-identite-yopper.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:yopper'

const MODULE = 'lib/identite-locale.js'
const ACCUEIL = 'app/commander/page.js'
const CONFIRM = 'app/commander/auth/confirm/page.js'
const CONNEXION = 'app/commander/auth/page.js'
const AUTH = 'lib/yopper-auth.js'

const MUTATIONS = [
  // ─── LE CŒUR : ÉCRIRE, C'EST AUSSI EFFACER ──────────────────────────────
  { nom: '🔴 un champ vide n’efface plus rien (le defaut d’origine)',
    fichier: MODULE,
    de: "  if (v === '') localStorage.removeItem(cle)",
    vers: "  if (false) localStorage.removeItem(cle)" },

  { nom: '🔴 le telephone redevient conditionnel (l’ancien survivrait)',
    fichier: MODULE,
    de: "    ecrire('yoppaa_telephone', telephone)",
    vers: "    if (telephone) ecrire('yoppaa_telephone', telephone)" },

  { nom: '🔴 le nom redevient conditionnel',
    fichier: MODULE,
    de: "    ecrire('yoppaa_nom', nom)",
    vers: "    if (nom) ecrire('yoppaa_nom', nom)" },

  { nom: '🔴 une identite sans identifiant s’ecrit a moitie',
    fichier: MODULE,
    de: '    if (!client_id || !email) { effacerIdentiteLocale(); return }',
    vers: '    if (false) { effacerIdentiteLocale(); return }' },

  // ─── « CE CACHE EST-IL CELUI DE QUELQU'UN D'AUTRE ? » ───────────────────
  { nom: '🔴 un cache VIDE passe pour un cache etranger',
    fichier: MODULE,
    de: '  if (!s || !c) return false',
    vers: '  if (!s) return false' },

  { nom: '🔴 la casse fabrique un etranger',
    fichier: MODULE,
    de: "  const s = String(emailSession || '').trim().toLowerCase()",
    vers: "  const s = String(emailSession || '').trim()" },

  // ─── LA SESSION EST LA VÉRITÉ ───────────────────────────────────────────
  { nom: '🔴 l’hydratation cesse de demander a la session qui est connecte',
    fichier: ACCUEIL,
    de: '        const { data } = await supabase.auth.getSession()',
    vers: '        const data = {}' },

  { nom: '🔴 le cookie d’un an reintroduit l’autre identite',
    fichier: ACCUEIL,
    de: 'const cookieEtranger = cacheEtranger(emailSession, data?.identity?.email)',
    vers: 'const cookieEtranger = false' },

  { nom: '🔴 la reponse prouvee du serveur redevient reservee aux trous',
    fichier: ACCUEIL,
    de: '          if (!data) return  ',
    vers: '          if (!data) return; if (!telephone) { }  ' },

  // ─── PLUS D'ÉCRITURE PARTIELLE, NULLE PART ──────────────────────────────
  { nom: '🔴 une ecriture partielle revient dans le retour de lien magique',
    fichier: CONFIRM,
    de: "          localStorage.setItem('yoppaa_onboarding_done', '1'); router.replace(next)",
    vers: "          if (client) localStorage.setItem('yoppaa_nom', 'X'); localStorage.setItem('yoppaa_onboarding_done', '1'); router.replace(next)" },

  { nom: '🔴 le retour de lien magique cesse de passer par le module',
    fichier: CONFIRM,
    de: '            poserIdentiteLocale({',
    vers: '            void ({' },

  { nom: '🔴 la page de connexion relit le prenom du compte precedent',
    fichier: CONNEXION,
    de: '      poserIdentiteLocale({',
    vers: "      poserIdentiteLocale({ prenomAvant: localStorage.getItem('yoppaa_prenom')," },

  // ─── LE LIEN FICHE ↔ COMPTE ─────────────────────────────────────────────
  { nom: '🔴 la fiche trouvee par l’adresse ne se rattache plus',
    fichier: AUTH,
    de: '          .update({ auth_user_id: user.id })',
    vers: '          .update({})' },

  { nom: '🔴 le rattachement ecrase un lien EXISTANT (vol de fiche)',
    fichier: AUTH,
    de: "          .is('auth_user_id', null)",
    vers: '          .limit(1)' },

  { nom: '🔴 l’echec du rattachement se tait',
    fichier: AUTH,
    de: '        if (errLien) console.error',
    vers: '        if (false) console.error' },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ON DISTINGUE « ROUGE » DE « PLANTÉ ». Un banc qui explose au lieu de
    // rougir n'est pas une mesure, c'est un accident.
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
