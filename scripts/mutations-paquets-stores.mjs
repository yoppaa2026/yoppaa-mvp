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
const DOSSIER = 'DOSSIER_STORES.md'
const RACINE_PAGE = 'app/page.tsx'
const COMPOSANT = 'app/components/RedirectionAppNative.js'
const PROFIL = 'app/commander/page.js'
const LEGAL = 'app/legal/page.js'
const ONESIGNAL = 'lib/onesignal.js'
const PONT = 'app/components/PontNatif.js'
const GEOLOC = 'lib/geoloc.js'
const RETOUR = 'lib/retour-vers-app.js'
const PAGE_RETOUR = 'app/retour-app/[...chemin]/page.js'
const DROITS = 'ios/App/App/App.entitlements'
const PBX = 'ios/App/App.xcodeproj/project.pbxproj'
const SCENE = 'ios/App/App/SceneDelegate.swift'
const ACTIVITE = 'android/app/src/main/java/app/yoppaa/client/MainActivity.java'
const AASA = 'public/.well-known/apple-app-site-association'
const ASSETLINKS = 'public/.well-known/assetlinks.json'
const PROXY = 'proxy.js'

const MUTATIONS = [
  // ─── CE QUE LE MANIFESTE DEMANDE DOIT ETRE DECLARE AUX STORES (18/09) ───
  //
  // 🔴 LE TROU TROUVE PAR ALEX : « on devait changer quelque chose dans les
  // declarations Play, tu te souviens ? ». `ACCESS_FINE_LOCATION` est entree au
  // manifeste le 17/09 au soir, et le dossier ne prevoyait de declarer que la
  // position « approximative ». Google RECOUPE le manifeste avec le formulaire
  // Securite des donnees, et la divergence se paie APRES la revue.
  //
  // ⚠️ RIEN NE REGARDAIT DANS CE SENS : les gardes partaient du CODE et s
  // arretaient au MANIFESTE. Vingt-quatre heures sans que personne le voie.
  { nom: '🔴 le dossier ne declare plus que la position approximative',
    fichier: DOSSIER,
    de: '**position approximative ET PRÉCISE**',
    vers: '**position approximative**' },

  // ─── LES TEXTES DE FICHE ───────────────────────────────────────────────
  //
  // 🔴 AUCUN STORE N INTERPRETE LE MARKDOWN. Deux intertitres de la
  // description longue etaient en gras markdown : les asterisques seraient
  // parties telles quelles dans la fiche publique. Signale, puis porte de todo
  // en todo pendant des semaines parce que rien ne le mesurait.
  { nom: '🔴 un intertitre repasse en gras markdown, que la fiche affichera tel quel',
    fichier: DOSSIER,
    de: '> Ce que tu peux faire',
    vers: '> **Ce que tu peux faire**' },

  // 🔴 ET UN TEXTE TROP LONG EST REFUSE AU COLLAGE, pas a la revue : on
  // l abrege alors dans l urgence, mal.
  //
  // ⚠️ CETTE ANCRE SUIT LA VALEUR DU SOUS-TITRE, ET C EST INEVITABLE : la
  // mutation doit rendre CE texte trop long, donc elle doit le connaitre. Elle
  // a donc perime le 20/09, quand Alex a remplace « Tes commerces, à portée »
  // par le sien. ✅ `verif:ancres` l a attrapee le jour meme, et c est
  // exactement son travail : une ancre perimee ne mesure rien ET ne dit rien.
  // Ne pas chercher a la rendre « robuste » en visant un fragment : une ancre
  // partielle risque de ne plus etre unique, et un saut de ligne y est proscrit.
  { nom: '🔴 le sous-titre Apple depasse ses 30 caracteres',
    fichier: DOSSIER,
    de: '> `Les commerces de ton quartier`',
    vers: '> `Les commerces de ton quartier et de la rue d a cote`' },

  // 🔴 ET UN TEXTE VIDE NE DOIT PAS PASSER EN SILENCE. Ma garde est nee
  // complice : l entete « Description » d Apple renvoie au texte de Play
  // plutot que de le dupliquer, donc sans bloc « > ». Le parseur en faisait un
  // texte de zero caractere, qui tient dans n importe quelle limite et ne
  // contient aucun markdown : DEUX verifications vertes en n ayant rien
  // regarde. Le compte des champs pleins est ce qui l attrape.
  { nom: '🔴 un texte de fiche est vide, et personne ne le compte plus',
    fichier: DOSSIER,
    de: '> `Yoppaa - Commerces locaux`',
    vers: '> ``' },

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
    de: "    return candidats.find((os) => typeof os?.initialize === 'function') || null",
    vers: '    return candidats.find((os) => !!os) || null' },

  // ⚠️ CELLE-CI REMET UN DEFAUT PLAUSIBLE, pas un cas invente. Croire une
  // autorisation accordee alors qu elle ne l est pas fait afficher « tu es
  // abonne » a quelqu un qui ne recevra jamais rien.
  { nom: '🔴 l etat des notifications se croit autorise sans l avoir demande',
    de: "    return { natif: true, autorise: os.Notifications?.hasPermission?.() === true }",
    vers: '    return { natif: true, autorise: true }' },

  { nom: '🔴 une autorisation refusee par le systeme passe pour accordee',
    de: "    return accorde === true ? { ok: true, raison: null } : { ok: false, raison: 'refuse_os' }",
    vers: "    return { ok: true, raison: null }" },

  // ─── LE PREMIER ECRAN DE L APP (21/09) ──────────────────────────────────
  //
  // 🔴 CE QUE CES MUTATIONS PROTEGENT. Le manifeste ouvre la PWA sur
  // `/commander` ; `server.url` ouvre l app des stores sur la RACINE, donc sur
  // la landing commercante et ses tarifs mensuels. Personne ne l avait jamais
  // vu : TestFlight portait « aucun testeur », et Alex testait la PWA en
  // croyant tester l app deposee. Notre note de revue decrit pourtant un champ
  // de localisation qui n existe pas sur la landing : le relecteur cherche un
  // ecran absent et conclut que l app est incomplete.
  { nom: '🔴 une seule branche redirige : la moitie des chemins reste sur la landing',
    fichier: RACINE_PAGE,
    de: '        <RedirectionAppNative />',
    vers: '        {null}' },

  // ⚠️ `push` AU LIEU DE `replace` : le geste « revenir en arriere » ramene le
  // relecteur sur la landing, l ecran exact qu on vient de lui eviter.
  { nom: '🔴 le retour arriere ramene sur la landing',
    fichier: COMPOSANT,
    de: "router.replace('/commander')",
    vers: "router.push('/commander')" },

  // ⚠️ LA DETECTION RECOPIEE. Deux copies finissent par diverger, et celle de
  // `push-natif` rattrape deja l acces qui jette.
  { nom: '🔴 la detection ne descend plus du module partage',
    fichier: COMPOSANT,
    de: "from '@/lib/push-natif'",
    vers: "from '@/lib/detection-locale'" },

  // 🔴 LA FENETRE LUE PENDANT LE RENDU, qui rouvre la zone morte du 03/09 :
  // ecran blanc que ni le lint ni le build ne voient.
  { nom: '🔴 la fenetre est lue pendant le rendu, pas dans l effet',
    fichier: COMPOSANT,
    de: '  const router = useRouter()',
    vers: '  const router = useRouter(); const natif = estAppNative(window)' },

  // ─── RESTER DANS L APP (02/10) ──────────────────────────────────────────
  //
  // 🔴 iOS envoie dans SAFARI toute nouvelle fenetre, meme vers yoppaa.app :
  // le Yopper quittait l app pour lire les CGU, et rien ne le ramenait.
  { nom: '🔴 les CGU repartent dans Safari depuis l app',
    fichier: PROFIL,
    de: "target={natif ? undefined : '_blank'} rel={natif ? undefined : 'noopener noreferrer'}",
    vers: 'target="_blank" rel="noopener noreferrer"' },

  { nom: '🔴 natif est lu pendant le rendu au lieu du crochet',
    fichier: PROFIL,
    de: '  const natif = useAppNative()',
    vers: "  const natif = typeof window !== 'undefined' && !!window.Capacitor" },

  // 🔴 L iPhone n offre aucun geste « precedent » dans une WebView : sans ce
  // bouton, le Yopper reste bloque sur les CGU ouvertes sur place.
  { nom: '🔴 la page legale perd son bouton de retour dans l app',
    fichier: LEGAL,
    de: '          <button type="button" onClick={retourDepuisLegal}',
    vers: '          <button type="button" onClick={undefined}' },

  { nom: '🔴 le retour de la page legale n a plus de point de chute',
    fichier: LEGAL,
    de: "  else window.location.href = '/commander'",
    vers: '  else return' },

  // ⚠️ LA REGLE, PAS LE CAS : un autre lien interne en nouvelle fenetre ferait
  // sortir de l app de la meme facon.
  { nom: '🔴 un lien interne d une page Yopper s ouvre en nouvelle fenetre',
    fichier: 'app/commander/BonConfirmation.js',
    de: "<a href={`/cadeau/${bon.token}`} style={{ display: 'block'",
    vers: "<a href={`/cadeau/${bon.token}`} target=\"_blank\" style={{ display: 'block'" },

  // ─── LE VRAI PLUGIN (03/10, trouve par Alex sur le build 1.0.1 (3)) ─────
  //
  // 🔴 L ANCIENNE RECHERCHE : `window.OneSignal.initialize`. Le plugin 5.5.7
  // est un module, Cordova pose ses EXPORTS sous `window.OneSignal` : rien
  // n etait trouve, aucune notification native n a jamais marche, et le banc
  // etait vert parce qu il imitait le plugin au lieu de le charger.
  { nom: '🔴 on ne cherche plus que window.OneSignal, comme avant le 03/10',
    de: '    const candidats = [fenetre?.plugins?.OneSignal, fenetre?.OneSignal?.default, fenetre?.OneSignal]',
    vers: '    const candidats = [fenetre?.OneSignal]' },

  // ─── TOUCHER UNE NOTIFICATION (02/10) ───────────────────────────────────
  //
  // 🔴 Le serveur envoyait un chemin RELATIF dans `url`, vers le web ET vers
  // l app, et personne n ecoutait le toucher : « ta commande est prete »
  // ouvrait l app sur la derniere page vue.
  { nom: '🔴 le chemin d une notification n est plus filtre',
    de: '  return cheminInterne(s, null)',
    vers: '  return s || null' },

  { nom: '🔴 l adresse de lancement passe avant le chemin des donnees',
    de: '  return cheminDeNotification(notif?.additionalData?.chemin)',
    vers: '  return cheminDeNotification(notif?.launchURL) || cheminDeNotification(notif?.additionalData?.chemin)' },

  { nom: '🔴 un second montage rebranche un second ecouteur',
    de: "  if (fenetre.__yoppaaClicNatif === true) return { ok: true, raison: 'deja_branche' }",
    vers: '' },

  { nom: '🔴 un toucher sans chemin valide ouvre quand meme',
    de: '      if (chemin) ouvrir(chemin)',
    vers: '      ouvrir(chemin)' },

  { nom: '🔴 le lien repart dans `url`, donc aussi vers l app',
    fichier: ONESIGNAL,
    de: '  if (adresseWeb) payload.web_url = adresseWeb',
    vers: '  if (url) payload.url = url' },

  // 🔴 LE BANDEAU ANDROID (03/10) : sans canal, « Divers », aucun bandeau.
  { nom: '🔴 un envoi personnel repart sans canal, donc sans bandeau Android',
    fichier: ONESIGNAL,
    de: '    payload.android_channel_id = CANAL_ANDROID_PERSONNEL',
    vers: '' },

  // 🔴 LE DEFAUT DE LA NUIT DU 02 AU 03/10 : `web_url` relatif, OneSignal
  // rejette le message entier, plus rien ne part.
  { nom: '🔴 web_url repart en chemin relatif',
    fichier: ONESIGNAL,
    de: '  if (adresseWeb) payload.web_url = adresseWeb',
    vers: '  if (url) payload.web_url = url' },

  { nom: '🔴 l app ne recoit plus son chemin',
    fichier: ONESIGNAL,
    de: '  const donnees = { ...(data || {}), ...(chemin ? { chemin } : {}) }',
    vers: '  const donnees = { ...(data || {}) }' },

  { nom: '🔴 le pont natif n est plus pose dans le gabarit racine',
    fichier: 'app/layout.tsx',
    de: '        <PontNatif />',
    vers: '' },

  { nom: '🔴 une initialisation ratee essaie quand meme d ecouter',
    fichier: PONT,
    de: '    if (!init.ok) return',
    vers: '    if (false) return' },

  // ─── LA POSITION PAR LE MODULE NATIF (02/10) ────────────────────────────
  //
  // 🔴 Dans l app, WebKit ajoute sa fenetre « This website will use your
  // precise location », au nom du SITE. Et l ancienne app n a pas le module.
  { nom: '🔴 l ancienne app prend un relais web pour le module natif',
    fichier: GEOLOC,
    de: '    if (!compile) return null',
    vers: '' },

  { nom: '🔴 on se fie a isPluginAvailable, qui ne regarde que les noms',
    fichier: GEOLOC,
    de: "      && cap.PluginHeaders.some((h) => h?.name === 'Geolocation')",
    vers: "      && cap.isPluginAvailable?.('Geolocation') === true" },

  { nom: '🔴 une position sans chiffres devient (0, 0), golfe de Guinee',
    fichier: GEOLOC,
    de: '        || p?.coords?.latitude == null || p?.coords?.longitude == null) {',
    vers: '        ) {' },

  { nom: '🔴 un module muet fait tourner les points a vie',
    fichier: GEOLOC,
    de: "  filet = setTimeout(() => conclure(echec, { code: 3, message: 'delai' }), delai + marge)",
    vers: '  filet = null' },

  { nom: '🔴 deux reponses pour une question',
    fichier: GEOLOC,
    de: '    if (fini) return',
    vers: '    if (false) return' },

  { nom: '🔴 un refus du systeme n est plus un refus',
    fichier: GEOLOC,
    de: '  if (n === 3 || n === 8) return 1',
    vers: '  if (n === 8) return 1' },

  { nom: '🔴 Android « prompt-with-rationale » devient « on ne sait pas »',
    fichier: GEOLOC,
    de: "      if (etat === 'prompt-with-rationale') return 'prompt'",
    vers: '' },

  { nom: '🔴 le navigateur perd les options de l ecran',
    fichier: GEOLOC,
    de: '    geo.getCurrentPosition(succes, echec, options)',
    vers: '    geo.getCurrentPosition(succes, echec, {})' },

  { nom: '🔴 un ecran rappelle WebKit en direct',
    fichier: 'app/commander/ConfirmCommune.js',
    de: '    lirePosition(window,',
    vers: '    navigator.geolocation.getCurrentPosition(' },

  // ─── REVENIR DANS L APP APRES LA BANQUE (02/10) ─────────────────────────
  //
  // 🔴 Bancontact dans l app : la banque finit dans Safari, Stripe y ramene la
  // confirmation, l app reste figee sur Stripe. On repare le RETOUR.
  { nom: '🔴 l app pose une marque que le serveur ne cherche pas',
    fichier: CONF,
    de: "  appendUserAgent: 'YoppaaApp',",
    vers: "  appendUserAgent: 'Yoppaa',"},

  { nom: '🔴 un mot qui contient la marque passe pour l app',
    fichier: RETOUR,
    de: '  return typeof ua === \'string\' && /(^|\\s)YoppaaApp(\\/|\\s|$)/.test(ua)',
    vers: "  return typeof ua === 'string' && /YoppaaApp/.test(ua)" },

  { nom: '🔴 partie de l app, la commande ne passe plus par /retour-app',
    fichier: RETOUR,
    de: '  return depuisApp ? `${base}${PREFIXE_RETOUR}${chemin}` : `${base}${chemin}`',
    vers: '  return `${base}${chemin}`' },

  { nom: '🔴 la page de retour accepte une remontee ou une barre cachee',
    fichier: RETOUR,
    de: "  if (net.some((s) => s === null || s === '' || s === '.' || s === '..' || s.includes('/'))) return null",
    vers: '  if (net.some((s) => s === null)) return null' },

  { nom: '🔴 un segment deja code est code deux fois',
    fichier: RETOUR,
    de: '    try { return decodeURIComponent(s) } catch { return null }',
    vers: '    return s' },

  { nom: '🔴 le lien vers l app accepte un autre site',
    fichier: RETOUR,
    de: '  const sur = cheminInterne(chemin, null)',
    vers: '  const sur = chemin' },

  { nom: '🔴 la commande revient en direct, sans /retour-app',
    fichier: 'app/api/stripe/checkout/create-commande/route.js',
    de: '      success_url: urlDeRetour(STRIPE_CONFIG.appUrl, `/commander/${commercant.slug}?paiement=ok&commande_id=${commande.id}&session_id={CHECKOUT_SESSION_ID}`, depuisApp),',
    vers: '      success_url: `${STRIPE_CONFIG.appUrl}/commander/${commercant.slug}?paiement=ok&commande_id=${commande.id}&session_id={CHECKOUT_SESSION_ID}`,' },

  { nom: '🔴 l acompte croit toujours venir de l app',
    fichier: 'app/api/stripe/checkout/create-rdv-acompte/route.js',
    de: "  const depuisApp = estUaApp(request.headers.get('user-agent'))",
    vers: '  const depuisApp = true' },

  { nom: '🔴 le lien d empreinte revient en direct',
    fichier: 'app/api/stripe/checkout/empreinte-lien/route.js',
    de: '      success_url: urlDeRetour(base, `/empreinte/${jeton}?etat=ok`, depuisApp),',
    vers: '      success_url: `${base}/empreinte/${jeton}?etat=ok`,' },

  { nom: '🔴 dans l app, la page de retour s affiche au lieu de renvoyer',
    fichier: PAGE_RETOUR,
    de: '  if (estUaApp(ua)) redirect(cible)',
    vers: '' },

  { nom: '🔴 le bouton reste dans le navigateur au lieu de rouvrir l app',
    fichier: PAGE_RETOUR,
    de: '        <a href={lien} style=',
    vers: '        <a href={cible} style=' },

  // ─── LE NATIF (02/10) ───────────────────────────────────────────────────
  //
  // 🔴 Trois manques du premier binaire, tous silencieux : iOS sans
  // `aps-environment` ne recoit aucune notification ; aucun lien ne pouvait
  // ouvrir l app ; le bouton retour Android fermait l app.
  { nom: '🔴 iOS repart sans les notifications de production',
    fichier: DROITS,
    de: '	<string>production</string>',
    vers: '	<string>development</string>' },

  { nom: '🔴 une configuration Xcode signe sans les autorisations',
    fichier: PBX,
    de: '				CODE_SIGN_ENTITLEMENTS = App/App.entitlements;',
    vers: '' },

  { nom: '🔴 iOS ne declare plus le schema yoppaa://',
    fichier: PLIST,
    de: '				<string>yoppaa</string>',
    vers: '				<string>yoppa</string>' },

  { nom: '🔴 iOS : OneSignal rouvre les adresses dans le navigateur',
    fichier: PLIST,
    de: '	<key>OneSignal_suppress_launch_urls</key>',
    vers: '	<key>OneSignal_suppress_launch</key>' },

  { nom: '🔴 iOS : le lien universel n ouvre plus la page',
    fichier: SCENE,
    de: '        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL {',
    vers: '        if let url = Optional<URL>.none {' },

  { nom: '🔴 iOS ouvre un lien vers n importe quel site',
    fichier: SCENE,
    de: '        guard morceaux.host?.lowercased() == hote else { return nil }',
    vers: '' },

  { nom: '🔴 iOS ouvre n importe quel schema',
    fichier: SCENE,
    de: '        guard let schema = morceaux.scheme?.lowercased(), schema == "yoppaa" || schema == "https" else { return nil }',
    vers: '        guard let schema = morceaux.scheme?.lowercased() else { return nil }' },

  { nom: '🔴 Android ouvre le tableau de bord commercant dans l app',
    fichier: ANDROID_MANIFESTE,
    de: '                <data android:pathPrefix="/retour-app/" />',
    vers: '                <data android:pathPrefix="/retour-app/" /><data android:pathPrefix="/dashboard" />' },

  { nom: '🔴 Android ne verifie plus ses liens d app',
    fichier: ANDROID_MANIFESTE,
    de: '<intent-filter android:autoVerify="true">',
    vers: '<intent-filter>' },

  { nom: '🔴 Android ouvre un lien vers n importe quel site',
    fichier: ACTIVITE,
    de: '        if (!HOTE.equalsIgnoreCase(hote)) return null;',
    vers: '' },

  { nom: '🔴 Android rejoue le lien d une activite recreee',
    fichier: ACTIVITE,
    de: '        if (lancement && restauree) return;',
    vers: '' },

  { nom: '🔴 Android rejoue le lien d une relance depuis les recentes',
    fichier: ACTIVITE,
    de: '        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;',
    vers: '' },

  { nom: '🔴 le bouton retour Android ferme l app au lieu de remonter',
    fichier: ACTIVITE,
    de: '                    vue.goBack();',
    vers: '                    moveTaskToBack(true);' },

  { nom: '🔴 iOS part sans le module de position',
    fichier: 'ios/App/CapApp-SPM/Package.swift',
    de: '                .product(name: "CapacitorGeolocation", package: "CapacitorGeolocation"),',
    vers: '' },

  // ─── L APK D ESSAI (03/10) ──────────────────────────────────────────────
  { nom: '🔴 bundletool signe avec notre cle sans verifier son empreinte',
    fichier: ANDROID,
    de: '          echo "${BT_SHA256}  bundletool.jar" | sha256sum -c - \\',
    vers: '          true \\' },

  { nom: '🔴 la cle de signature peut rester sur la machine si une etape echoue',
    fichier: ANDROID,
    de: "          trap 'rm -f cle.jks' EXIT",
    vers: '' },

  { nom: '🔴 le paquet iOS ne relit plus ses notifications signees',
    fichier: IOS,
    de: '          grep -q "aps-environment" droits.txt \\',
    vers: '          true \\' },

  // ─── LES FICHIERS DES LIENS (02/10) ─────────────────────────────────────
  //
  // 🔴 Sans eux, ou mal servis, les liens d email s ouvrent dans le
  // navigateur, et rien ne le dit.
  { nom: '🔴 le fichier Apple oublie la page de retour apres la banque',
    fichier: AASA,
    de: '          { "/": "/retour-app/*" }',
    vers: '          { "/": "/carte/*" }' },

  { nom: '🔴 le fichier Apple nomme une autre app',
    fichier: AASA,
    de: '"appIDs": ["4PS788HD98.app.yoppaa.client"]',
    vers: '"appIDs": ["4PS788HD98.app.yoppaa.pro"]' },

  { nom: '🔴 le fichier Apple part sans son type JSON',
    fichier: 'next.config.ts',
    de: '        headers: [{ key: "Content-Type", value: "application/json" }],',
    vers: '        headers: [{ key: "Cache-Control", value: "no-store" }],' },

  { nom: '🔴 le fichier Android nomme une autre app',
    fichier: ASSETLINKS,
    de: '"package_name": "app.yoppaa.client",',
    vers: '"package_name": "app.yoppaa.pro",' },

  // 🔴 ITMS-90683 SUR LE BUILD 1.0.1 (3), le 03/10 : le module de position
  // reference la position « toujours », et Apple exige sa phrase.
  { nom: '🔴 iOS ne dit plus pourquoi le module peut demander la position toujours',
    fichier: PLIST,
    de: '	<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>',
    vers: '	<key>NSLocationAlwaysUsage</key>' },

  { nom: '🔴 l empreinte Android est tronquee',
    fichier: ASSETLINKS,
    de: ':02:6D:82:55:0A:60:02:F7:2E"',
    vers: ':02:6D:82:55:0A:60:02:F7"' },

  // ─── LA LANDING AVANT LES ECRANS D ACCUEIL (03/10, vu par Alex) ─────────
  //
  // 🔴 `RedirectionAppNative` sortait l app de la landing APRES le
  // JavaScript : 1 a 2 s de landing au tout premier lancement. `proxy.js` la
  // renvoie avant le moindre HTML.
  { nom: '🔴 la racine sort du matcher : la landing revient dans l app',
    fichier: PROXY,
    de: "  matcher: ['/api/:path*', '/'],",
    vers: "  matcher: ['/api/:path*']," },

  { nom: '🔴 tout le monde est renvoye : le web perd sa landing',
    fichier: PROXY,
    de: "pathname === '/' && estUaApp(request.headers.get('user-agent'))",
    vers: "pathname === '/'" },

  { nom: '🔴 toute page de l app est renvoyee : /commander boucle sur lui-meme',
    fichier: PROXY,
    de: "return pathname === '/' && estUaApp(",
    vers: "return estUaApp(" },

  { nom: '🔴 l app est renvoyee sur la racine elle-meme',
    fichier: PROXY,
    de: "NextResponse.redirect(new URL('/commander', request.url))",
    vers: "NextResponse.redirect(new URL('/', request.url))" },
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
