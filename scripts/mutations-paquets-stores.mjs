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
const PLIST = 'ios/App/App/Info.plist'
const ANDROID_MANIFESTE = 'android/app/src/main/AndroidManifest.xml'

const MUTATIONS = [
  // ─── LE WORKFLOW iOS, QUI N A JAMAIS TOURNE (17/09) ─────────────────────
  // 🔴 C est la situation exacte du workflow Android ce matin : cinq defauts
  // silencieux, tous trouves en le LANCANT. Celui-ci n a pas encore tourne, et
  // ses gardes sont la seule chose qui le separe d une soiree perdue sur une
  // erreur de signature illisible.
  { nom: '🔴 iOS repasse en signature automatique : xcodebuild reclame une session Apple',
    fichier: IOS,
    de: 'CODE_SIGN_STYLE=Manual',
    vers: 'CODE_SIGN_STYLE=Automatic' },

  { nom: '🔴 l export oublie l equipe : un compte a plusieurs equipes echoue',
    fichier: IOS,
    de: '<key>teamID</key>',
    vers: '<key>teamIgnore</key>' },

  { nom: '🔴 l export n associe plus le bundle a son profil : le profil importe est ignore',
    fichier: IOS,
    de: '            <key>provisioningProfiles</key>',
    vers: '            <key>profilsIgnores</key>' },

  // ⚠️ LE PIEGE DU HEREDOC : avec des apostrophes autour du marqueur, le shell
  // recopie la variable LITTERALEMENT dans le fichier produit, et l export part
  // avec le texte au lieu de la valeur. Invisible a la lecture du workflow.
  { nom: '🔴 le gabarit d export cesse d interpoler : le Team ID part en texte',
    fichier: IOS,
    de: 'cat > export.plist <<PLIST',
    vers: "cat > export.plist <<'PLIST'" },

  { nom: '🔴 la signature du .ipa n est plus verifiee sur son autorite',
    fichier: IOS,
    de: 'grep -q "Authority=Apple Distribution" signature.txt',
    vers: 'grep -q "" signature.txt' },

  { nom: '⚠️ le Team ID passe en dur dans le depot',
    fichier: IOS,
    de: 'DEVELOPMENT_TEAM="$TEAM_ID"',
    vers: 'DEVELOPMENT_TEAM="4PS788HD98"' },

  // ─── LE DEPOT CHEZ APPLE, AJOUTE LE 17/09 AU SOIR ───────────────────────
  // 🔴 Sans cette etape, le travail est VERT et le paquet ne part nulle part.
  // C est la forme la plus traitre : rien n echoue, il ne se passe rien.
  { nom: '🔴 le paquet iOS n est plus depose : travail vert, App Store vide',
    fichier: IOS,
    de: '          xcrun altool --upload-app -f "$IPA" -t ios \\',
    vers: '          echo "on ne depose pas" \\' },

  // ⚠️ L ORDRE (artefact AVANT depot, validation AVANT depot) est verifie par
  // les gardes mais N EST PAS MESURE ICI : l inverser demande de deplacer des
  // blocs entiers, et une ancre multi-ligne se casse au premier changement
  // d indentation. Les deux moities « presence » sont eprouvees, les deux
  // moities « ordre » ne le sont pas. Note plutot que tue, comme pour `chmod`.

  { nom: '🔴 on ne valide plus avant de deposer : un numero de build brule pour une icone',
    fichier: IOS,
    de: '          xcrun altool --validate-app -f "$IPA" -t ios \\',
    vers: '          echo "on valide pas" \\' },

  // 🔴 TROISIEME FOIS CE MOTIF : lire le code de sortie au lieu de la phrase.
  // `altool` range ses refus dans « product-errors » et peut rendre 0.
  { nom: '🔴 la validation n est plus relue : Apple refuse, on depose quand meme',
    fichier: IOS,
    de: '          if grep -q "product-errors" validation.json; then',
    vers: '          if false; then' },

  { nom: '🔴 la cle API perd le nom qu Apple ira chercher : « No such private key »',
    fichier: IOS,
    de: '          CLE=~/.appstoreconnect/private_keys/AuthKey_$CLE_API_ID.p8',
    vers: '          CLE=~/.appstoreconnect/private_keys/cle.p8' },

  { nom: '🔴 un secret de depot manquant ne fait plus echouer : le paquet ne part pas, en silence',
    fichier: IOS,
    de: '              echo "::error::Le secret $v manque. Sans les trois, rien ne peut etre televerse."',
    vers: '              echo "secret absent, on continue"' },

  { nom: '🔴 la cle privee cesse de venir d un secret : elle passe par une saisie',
    fichier: IOS,
    de: '          CLE_API_P8_B64: ${{ secrets.APPSTORE_CLE_P8_B64 }}',
    vers: '          CLE_API_P8_B64: ${{ inputs.cle_p8 }}' },

  // 🔴 LA DECLARATION D EXPORT ABSENTE N EMPECHE PAS LE DEPOT : elle bloque la
  // SOUMISSION, apres coup, avec « Conformite aux regles d exportation
  // manquante », et il faut repondre a la main a chaque version.
  { nom: '🔴 la conformite export disparait de l Info.plist : chaque depot reste en attente',
    fichier: PLIST,
    de: '<key>ITSAppUsesNonExemptEncryption</key>',
    vers: '<key>ITSAppUsesNonExemptEncryptionAbsente</key>' },

  // ─── CE QUE LE CODE DEMANDE ET QUE LES MANIFESTES DOIVENT DECLARER ──────
  //
  // 🔴 LE DEFAUT DU 17/09 A MINUIT, TROUVE PAR UN MAIL D APPLE (ITMS-90683).
  // Le code appelle `navigator.geolocation` dans quatre fichiers et ouvre
  // quatorze choix d image, et AUCUN des deux manifestes ne le declarait. Le
  // manifeste Android ne portait QUE `INTERNET`. Les deux paquets seraient
  // partis avec leur ecran principal vide.
  { nom: '🔴 iOS cesse d expliquer la position : ITMS-90683, et la geoloc ne s accorde jamais',
    fichier: PLIST,
    de: '\t<key>NSLocationWhenInUseUsageDescription</key>',
    vers: '\t<key>NSLocationWhenInUseUsageDescriptionAbsente</key>' },

  { nom: '🔴 iOS cesse d expliquer l appareil photo : l app est TUEE au premier appui',
    fichier: PLIST,
    de: '\t<key>NSCameraUsageDescription</key>',
    vers: '\t<key>NSCameraUsageDescriptionAbsente</key>' },

  { nom: '🔴 iOS cesse d expliquer la phototheque',
    fichier: PLIST,
    de: '\t<key>NSPhotoLibraryUsageDescription</key>',
    vers: '\t<key>NSPhotoLibraryUsageDescriptionAbsente</key>' },

  // 🔴 APPLE REFUSE UNE CHAINE CREUSE. « Cette app a besoin de votre
  // position » ne dit pas a quoi ca sert : le texte doit nommer l usage.
  { nom: '🔴 la chaine d explication devient creuse : Apple rejette a la revue',
    fichier: PLIST,
    de: '\t<string>Yoppaa utilise ta position pour te montrer les commerces ouverts autour de toi et la distance qui t\'en sépare.</string>',
    vers: '\t<string>Cette app utilise votre position.</string>' },

  { nom: '🔴 Android cesse de declarer la position : le WebView ne l obtient JAMAIS',
    fichier: ANDROID_MANIFESTE,
    de: '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    vers: '    <uses-permission android:name="android.permission.NOTHING" />' },

  // 🔴 CELLE-CI MESURE LE FILTRE DES COMMENTAIRES. Commenter la permission la
  // laisse LISIBLE dans le fichier : une garde qui cherche le mot resterait
  // verte sur un manifeste qui ne demande plus rien.
  { nom: '🔴 la permission est COMMENTEE : le mot reste, la demande disparait',
    fichier: ANDROID_MANIFESTE,
    de: '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    vers: '    <!-- <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" /> -->' },

  // ⚠️ SANS `required="false"`, Google Play deduit de la permission que
  // l appareil DOIT avoir un GPS et masque l app a ceux qui n en ont pas.
  { nom: '⚠️ le GPS redevient obligatoire : Play masque l app aux appareils sans GPS',
    fichier: ANDROID_MANIFESTE,
    de: '<uses-feature android:name="android.hardware.location.gps" android:required="false" />',
    vers: '<uses-feature android:name="android.hardware.location.gps" android:required="true" />' },

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

  { nom: '🔴 LE DEFAUT REEL DU 17/09 : gradlew lance sans etre executable, « Permission denied »',
    fichier: ANDROID,
    de: "          chmod +x ./gradlew",
    vers: "          echo on y va" },

  // ⚠️ L'ORDRE (chmod AVANT l appel) est verifie par la garde mais N EST PAS
  // MESURE ICI : l inverser demande une ancre sur deux lignes, et une ancre
  // multi-ligne se casse au premier changement d indentation. La garde reste
  // utile, sa moitie « ordre » est simplement non eprouvee. Note plutot que tue.

  { nom: '🔴 le numero de build pose en silence : le 2e depot refuse, cause introuvable',
    fichier: ANDROID,
    de: "          grep -q \"versionCode ${{ inputs.version_code }}\" \"$G\" || {",
    vers: "          if false; then" },

  { nom: '🔴 la signature n est plus verifiee : un artefact muet part au depot',
    fichier: ANDROID,
    de: "          jarsigner -verify \"$AAB\" | tee verif.txt",
    vers: "          echo \"on fait confiance\" > verif.txt" },

  // 🔴 LE DEFAUT REEL DU 17/09, dans les deux sens : `-strict` rejette le cas
  // normal (certificat auto-signe), et lire le code de sortie au lieu de la
  // phrase ne protege de rien puisque jarsigner rend 0 sur un jar non signe.
  { nom: '🔴 « -strict » revient : il fait echouer un bundle pourtant signe',
    fichier: ANDROID,
    de: "          jarsigner -verify \"$AAB\" | tee verif.txt",
    vers: "          jarsigner -verify -strict \"$AAB\" | tee verif.txt" },

  { nom: '🔴 on relit le code de sortie au lieu de la phrase : 0 sur un jar non signe',
    fichier: ANDROID,
    de: "          if ! grep -q \"jar verified\" verif.txt; then",
    vers: "          if false; then" },

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
