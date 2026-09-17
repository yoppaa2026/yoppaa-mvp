// HARNAIS DE MUTATION — L ENVELOPPE NATIVE ET SES PAQUETS (17/09)
//
// 🔴 POURQUOI IL N EXISTAIT PAS, ET POURQUOI C EST GRAVE. `verif:push-natif`
// portait 42 verifications que RIEN n avait jamais eprouvees. Un banc jamais
// mesure peut etre entierement vert et entierement complice : c est exactement
// ce qui s est passe, puisque DEUX defauts reels vivaient dans les workflows
// sans qu une seule garde ne bronche.
//
// Ce que ces mutations remettent, ce sont les formes fausses qui ont
// REELLEMENT existe dans le depot :
//   • `if: env.X` sur une etape dont le `env:` definit X. La condition est
//     evaluee AVANT l etape : elle est toujours fausse, l etape est toujours
//     sautee. Android sortait un bundle NON SIGNE, refuse par Google sans un
//     mot ; iOS echouait plus loin sur une erreur de signature obscure.
//   • `apksigner` sur un `.aab`, qu il refuse : c est l outil des APK.
//
// ⚠️ INSTANTANE DE CONTENU, RESTAURATION CONTROLEE, jamais `git checkout`.
// ⚠️ UNE MUTATION CHANGE LE RESULTAT, JAMAIS LA TERMINAISON.
// ⚠️ AUCUN SAUT DE LIGNE DANS LES CIBLES.
//
//   node scripts/mutations-paquets-stores.mjs

import { readFileSync } from 'node:fs'
import { ecrireSur } from './harnais-mutation.mjs'
import { execSync } from 'node:child_process'

const RACINE = 'c:/Users/HP/yoppaa-mvp'
const chemin = (f) => `${RACINE}/${f}`
const BANC = 'verif:push-natif'
const MODULE = 'lib/push-natif.js'

const ANDROID = '.github/workflows/paquet-android.yml'
const IOS = '.github/workflows/paquet-ios.yml'
const CONF = 'capacitor.config.ts'

const MUTATIONS = [
  // ─── LE DEFAUT REEL DU 17/09, DANS LES DEUX WORKFLOWS ───────────────────
  { nom: '🔴 LE DEFAUT D ORIGINE : la signature Android redevient toujours sautee',
    fichier: ANDROID,
    de: "      - name: Signer le bundle",
    vers: "      - name: Signer le bundle\n        if: ${{ env.CLE_ANDROID_B64 != '' }}" },

  { nom: '🔴 LE FRERE : la signature iOS redevient toujours sautee',
    fichier: IOS,
    de: "      - name: Préparer la signature",
    vers: "      - name: Préparer la signature\n        if: ${{ env.CERTIFICAT_P12_B64 != '' }}" },

  { nom: '🔴 apksigner revient : il refuse un .aab, le paquet sort non signe',
    fichier: ANDROID,
    de: "          jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA-256 \\",
    vers: "          apksigner sign --min-sdk-version 23 \\" },

  { nom: '🔴 la signature n est plus verifiee : un artefact muet part au depot',
    fichier: ANDROID,
    de: "          jarsigner -verify -strict \"$AAB\"",
    vers: "          echo \"on fait confiance\"" },

  { nom: '🔴 un secret Android manquant ne fait plus echouer : bundle non signe, en silence',
    fichier: ANDROID,
    de: "              echo \"::error::Le secret $v manque. Sans les trois, le bundle ne peut pas etre signe.\"",
    vers: "              echo \"secret absent, on continue\"" },

  { nom: '🔴 un secret iOS manquant ne fait plus echouer : Xcode plante plus loin, sans raison lisible',
    fichier: IOS,
    de: "              echo \"::error::Le secret $v manque. Sans les trois, rien ne peut etre signe.\"",
    vers: "              echo \"secret absent, on continue\"" },

  // ─── LES GARDES DE L ENVELOPPE, QUE PLUS RIEN NE MESURAIT ───────────────
  { nom: '🔴 l identifiant d app devient celui du tableau de bord : deux apps, un seul nom possible',
    fichier: CONF,
    de: "  appId: 'app.yoppaa.client',",
    vers: "  appId: 'app.yoppaa.pro'," },

  { nom: '🔴 Stripe Checkout ne peut plus s ouvrir : la commande est creee et jamais payee',
    fichier: CONF,
    de: "    'checkout.stripe.com',",
    vers: "    'exemple.invalide'," },

  { nom: '🔴 le trafic en clair est autorise : un jeton de session voyage a decouvert',
    fichier: CONF,
    de: '    cleartext: false,',
    vers: '    cleartext: true,' },

  { nom: '🔴 le contenu mixte revient : une page sure charge des ressources en clair',
    fichier: CONF,
    de: '    allowMixedContent: false,',
    vers: '    allowMixedContent: true,' },

  { nom: '⚠️ le dossier embarque regonfle : 1,2 Mo d icones dans chaque paquet',
    fichier: CONF,
    de: "  webDir: 'capacitor-web',",
    vers: "  webDir: 'public'," },

  // ─── LE PLUGIN NATIF, QUI PORTE LE MEME NOM QUE LE SDK WEB ──────────────
  { nom: '🔴 le natif et le web ne se distinguent plus : personne ne recoit jamais rien',
    de: "  return typeof os?.initialize === 'function' ? os : null",
    vers: '  return os || null' },

  // ⚠️ CELLE-CI REMET UN DEFAUT PLAUSIBLE, pas un cas invente. Croire une
  // autorisation accordee alors qu elle ne l est pas fait afficher « tu es
  // abonne » a quelqu un qui ne recevra jamais rien.
  { nom: '🔴 l etat des notifications se croit autorise sans l avoir demande',
    de: "    return { natif: true, autorise: os.Notifications?.hasPermission?.() === true }",
    vers: '    return { natif: true, autorise: true }' },

  { nom: '🔴 une autorisation refusee par le systeme passe pour accordee',
    de: "    return accorde === true ? { ok: true, raison: null } : { ok: false, raison: 'refuse_os' }",
    vers: "    return { ok: true, raison: null }" },
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
