// HARNAIS DE MUTATION — PERSONNE NE SE FIE À L'IDENTITÉ DÉCLARÉE (15/09).
//
// 🔴 CE QU'ON MESURE : que `verif:acces-api` rougisse dès qu'une route se
// contente de nouveau du cookie `yoppaa_yopper`. `POST /api/yopper/session`
// signe ce qu'on lui déclare : `ignore-avis` laissait un commerçant faire taire
// les demandes d'avis sur ses propres commandes, `signaux` laissait signer au
// nom de n'importe qui. Et que les appelants continuent d'envoyer la preuve.
//
// ⚠️ INSTANTANÉ DE CONTENU, RESTAURATION CONTRÔLÉE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RÉSULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES (`npm run verif:ancres`).
//
//   node scripts/mutations-identite-declaree.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:acces-api'

const AUTH = 'lib/yopper-auth.js'
const SIGNAUX = 'app/api/signaux/route.js'
const AVIS = 'app/api/commande/ignore-avis/route.js'
const ACCUEIL = 'app/commander/page.js'

const MUTATIONS = [
  // ─── LE MODULE D'IDENTITÉ ───────────────────────────────────────────────
  { nom: '🔴 sans jeton, le module rend de nouveau une identite declaree',
    fichier: AUTH,
    de: '  return null // sans jeton vérifié, personne',
    vers: "  return { client_id: 'c-declare', email: 'declare@exemple.be', prouve: false } // sans jeton vérifié, personne" },

  { nom: '🔴 le module relit le cookie declare',
    fichier: AUTH,
    de: "import { ficheUtilisablePar } from './fiche-client'",
    vers: "import { ficheUtilisablePar } from './fiche-client'\nimport { lireIdentiteYopper } from './yopper-session'" },

  // ─── LES DEUX ROUTES QUI S'EN CONTENTAIENT ───────────────────────────────
  { nom: '🔴 un signal s attribue de nouveau au cookie declare',
    fichier: SIGNAUX,
    de: '    const identite = await identiteProuvee(request)',
    vers: '    const identite = await lireIdentiteYopper()' },

  { nom: '🔴 masquer une demande d avis se contente de l identite large',
    fichier: AVIS,
    de: '  const id = await identiteProuvee(request)',
    vers: '  const id = await identiteYopper(request)' },

  { nom: '🔴 le jeton masque les demandes d avis de TOUTES les commandes',
    fichier: AVIS,
    de: "    .eq('client_email', email)   // sécurité : uniquement les siennes",
    vers: '    // sécurité : uniquement les siennes' },

  // ─── LES APPELANTS ENVOIENT LA PREUVE ───────────────────────────────────
  { nom: '⚠️ la demande d avis se masque par un fetch nu',
    fichier: ACCUEIL,
    de: "              await fetchYopper('/api/commande/ignore-avis', {",
    vers: "              await fetch('/api/commande/ignore-avis', {" },

  { nom: '⚠️ une envie part sans la preuve',
    fichier: 'app/commander/SignauxYopper.js',
    de: "      await fetchAvecPreuveSiConnecte('/api/signaux', {",
    vers: "      await fetch('/api/signaux', {" },

  { nom: '⚠️ la suggestion de commerce part sans la preuve',
    fichier: ACCUEIL,
    de: '    }, { fetchImpl: fetchAvecPreuveSiConnecte })',
    vers: '    })' },

  { nom: '⚠️ le signalement part sans la preuve',
    fichier: 'app/commander/ModalSignalement.js',
    de: '    }, { fetchImpl: fetchAvecPreuveSiConnecte })',
    vers: '    })' },

  // 🔴 LE DÉFAUT DU 21/08 : les étiquettes de ciblage partaient sans jeton.
  { nom: '🔴 les etiquettes de ciblage repartent en fetch nu',
    fichier: 'app/components/OneSignalInit.js',
    de: "  fetchYopper('/api/yopper/sync-tags', {",
    vers: "  fetch('/api/yopper/sync-tags', {" },

  { nom: '🔴 un appel prive vers la fiche client part en fetch nu',
    fichier: ACCUEIL,
    de: "      fetchYopper('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-own' }) })",
    vers: "      fetch('/api/yopper/client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'get-own' }) })" },

  // ─── LA SONDE DES ROUTES ────────────────────────────────────────────────
  { nom: '🔴 la sonde compte de nouveau l identite declaree comme une garde',
    fichier: 'scripts/sonde-gardes-api.mjs',
    de: "  ['identité prouvée',    (s) => /identiteProuvee/.test(s)],",
    vers: "  ['identité prouvée',    (s) => /identiteProuvee/.test(s)],\n  ['identité déclarée',   (s) => /identiteYopper|lireIdentiteYopper/.test(s)]," },
]

const lancer = () => {
  try {
    const sortie = execSync(`npm run ${BANC}`, { cwd: RACINE, encoding: 'utf8', stdio: 'pipe' })
    return { rouge: false, plante: false, extrait: sortie.slice(-300) }
  } catch (e) {
    const sortie = `${e.stdout || ''}${e.stderr || ''}`
    // ⚠️ ROUGE N'EST PAS PLANTÉ : un banc qui explose ne mesure rien.
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
