// BANC DES NOTIFICATIONS DANS L'APPLICATION NATIVE (16/09).
//
// 🔴 CE QUI SE CASSE ICI NE SE VOIT PAS. Le plugin OneSignal natif s'expose
// sous `window.OneSignal`, EXACTEMENT le même nom que le SDK web
// (`<clobbers target="OneSignal" />`). Dans l'app publiée sur les stores, le
// code écrit pour le navigateur croirait donc parler au web alors qu'il parle
// au natif : aucune exception, aucun journal, et simplement personne ne
// recevrait jamais une notification.
//
// ⚠️ ET LE PIÈGE JUMEAU : `OneSignalDeferred` n'existe pas dans l'app. Une
// fonction empilée dans cette file y resterait pour toujours, sans un mot.
//
// Le module est PUR — on lui passe la fenêtre — donc il s'exécute ici, sans
// navigateur et sans téléphone.

import { readFileSync, readdirSync } from 'node:fs'
import { sansProse } from './lire-code.mjs'
import {
  estAppNative, pluginNatif, initialiserPushNatif, demanderPushNatif,
  etatPushNatif, taguerNatif, retirerTagNatif,
} from '../lib/push-natif.js'

const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const codeDe = (chemin) => sansProse(lire(chemin))
// ⚠️ ON INTERROGE LE DÉPÔT, PAS SEULEMENT LES TEXTES. Un workflow peut être
// parfaitement écrit et demander un fichier qui n'existe pas : c'est ce qui
// s'est produit le 17/09 avec `pod install` sur un projet passé à SPM.
const existe = (chemin) => {
  try { readFileSync(new URL(`../${chemin}`, import.meta.url)); return true }
  catch { return false }
}

let ok = 0
const echecs = []
const verifie = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  echecs.push(`${nom}${detail ? ` — ${detail}` : ''}`)
}
const egal = (nom, obtenu, attendu) =>
  verifie(nom, obtenu === attendu, `« ${obtenu} » au lieu de « ${attendu} »`)

// Un faux plugin natif, avec les signatures LUES DANS LES TYPES INSTALLÉS
// (onesignal-cordova-plugin 5.5.7) : `initialize(appId)`, `login(id)`,
// `Notifications.hasPermission()`, `requestPermission(fallbackToSettings)`,
// `User.addTags(obj)`, `User.removeTag(cle)`.
const fenetreNative = (options = {}) => {
  const journal = []
  const os = {
    initialize: (id) => journal.push(['initialize', id]),
    login: (id) => journal.push(['login', id]),
    Notifications: {
      hasPermission: () => options.autorise === true,
      requestPermission: async (fallback) => {
        journal.push(['requestPermission', fallback])
        if (options.jette) throw new Error('boom')
        return options.accorde !== false
      },
    },
    User: {
      addTags: (t) => journal.push(['addTags', JSON.stringify(t)]),
      removeTag: (k) => journal.push(['removeTag', k]),
    },
  }
  return { fenetre: { Capacitor: { isNativePlatform: () => true }, OneSignal: os }, journal }
}

// ═══ 1) RECONNAÎTRE L'APPLICATION, ET ELLE SEULE ═══════════════════════════
{
  const { fenetre } = fenetreNative()
  verifie('🔴 dans l’app, la plateforme est reconnue', estAppNative(fenetre) === true)
  verifie('un navigateur ordinaire n’est pas l’app', estAppNative({}) === false)
  verifie('une fenêtre absente non plus', estAppNative(undefined) === false)
  verifie('⚠️ un `Capacitor` présent mais web ne compte pas',
    estAppNative({ Capacitor: { isNativePlatform: () => false } }) === false)
  // ⚠️ UN ACCÈS QUI JETTE N'EST PAS UNE APPLICATION NATIVE : dans le doute, on
  // reste sur le chemin web, qui fonctionne partout.
  verifie('🔴 un accès qui lève ne fait pas basculer en natif',
    estAppNative({ get Capacitor() { throw new Error('bloqué') } }) === false)

  // 🔴 LE CŒUR DU PIÈGE : le SDK WEB porte le même nom. On distingue par ce que
  // l'objet SAIT FAIRE, jamais par son nom.
  const webDeguise = { Capacitor: { isNativePlatform: () => true }, OneSignal: { init: () => {} } }
  verifie('🔴 le SDK web n’est jamais pris pour le plugin natif', pluginNatif(webDeguise) === null)
  verifie('le plugin natif, lui, est reconnu', pluginNatif(fenetre) !== null)
  verifie('hors de l’app, aucun plugin n’est rendu',
    pluginNatif({ OneSignal: { initialize: () => {} } }) === null)
}

// ═══ 2) L'INITIALISATION ═══════════════════════════════════════════════════
{
  const { fenetre, journal } = fenetreNative()
  const res = initialiserPushNatif(fenetre, 'app-123', 'yopper-42')
  verifie('🔴 l’initialisation réussit dans l’app', res.ok === true)
  egal('avec l’identifiant d’application', journal[0].join(':'), 'initialize:app-123')
  egal('⚠️ et le Yopper est identifié pour les push individuels',
    journal[1].join(':'), 'login:yopper-42')

  // ⚠️ SANS IDENTITÉ, ON INITIALISE QUAND MÊME : un visiteur non connecté doit
  // pouvoir recevoir les notifications de sa commune avant d'avoir un compte.
  const b = fenetreNative()
  verifie('🔴 un visiteur sans compte est quand même abonné',
    initialiserPushNatif(b.fenetre, 'app-123', null).ok === true)
  egal('et personne n’est identifié à tort', b.journal.length, 1)

  // ⚠️ CHAQUE REFUS PORTE UN NOM : « ok: false » sans raison est indébogable.
  egal('hors de l’app, on le dit', initialiserPushNatif({}, 'app-123').raison, 'pas_natif')
  egal('sans identifiant d’application, on le dit aussi',
    initialiserPushNatif(fenetreNative().fenetre, '').raison, 'app_id_absent')
}

// ═══ 3) LA PERMISSION ══════════════════════════════════════════════════════
{
  const accorde = fenetreNative({ accorde: true })
  const r1 = await demanderPushNatif(accorde.fenetre)
  verifie('🔴 la permission accordée est rendue telle quelle', r1.ok === true)
  // ⚠️ `fallbackToSettings` OUVRE LES RÉGLAGES DU TÉLÉPHONE quand l'utilisateur
  // a déjà refusé : sans lui, un refus initial est définitif et le bouton ne
  // fait plus jamais rien.
  egal('⚠️ et les réglages s’ouvrent après un refus précédent',
    accorde.journal.find(l => l[0] === 'requestPermission')?.[1], true)

  const refus = fenetreNative({ accorde: false })
  egal('🔴 un refus se dit refus', (await demanderPushNatif(refus.fenetre)).raison, 'refuse_os')

  // ⚠️ DÉJÀ ACCORDÉE : on ne redemande pas, on ne montre rien.
  const deja = fenetreNative({ autorise: true })
  const r2 = await demanderPushNatif(deja.fenetre)
  verifie('⚠️ une permission déjà accordée ne redemande rien',
    r2.ok === true && r2.raison === 'deja_accorde'
    && !deja.journal.some(l => l[0] === 'requestPermission'))

  // 🔴 UNE EXCEPTION NE DOIT PAS EMPORTER L'ÉCRAN AVEC ELLE.
  const casse = fenetreNative({ jette: true })
  const r3 = await demanderPushNatif(casse.fenetre)
  verifie('🔴 une erreur du plugin ne jette pas, elle se nomme',
    r3.ok === false && r3.raison === 'boom')
  egal('hors de l’app, on le dit', (await demanderPushNatif({})).raison, 'pas_natif')
}

// ═══ 4) L'ÉTAT ET LES ÉTIQUETTES ═══════════════════════════════════════════
{
  verifie('🔴 hors de l’app, l’état natif n’existe pas', etatPushNatif({}) === null)
  verifie('dans l’app, il dit si c’est autorisé',
    etatPushNatif(fenetreNative({ autorise: true }).fenetre)?.autorise === true)
  verifie('et il dit non quand ça ne l’est pas',
    etatPushNatif(fenetreNative({ autorise: false }).fenetre)?.autorise === false)

  const { fenetre, journal } = fenetreNative()
  verifie('les étiquettes partent', taguerNatif(fenetre, { code_postal: '5640' }) === true)
  egal('avec leur contenu', journal[0][1], '{"code_postal":"5640"}')
  verifie('⚠️ un objet vide ou absent ne fait rien', taguerNatif(fenetre, null) === false)
  verifie('hors de l’app non plus', taguerNatif({}, { a: '1' }) === false)
  verifie('une étiquette se retire', retirerTagNatif(fenetre, 'favori:12') === true)
}

// ═══ 5) L'AIGUILLAGE, DANS L'ÉCRAN ═════════════════════════════════════════
//
// 🔴 CE FICHIER EST ÉCRIT POUR LE NAVIGATEUR de bout en bout : permission
// `Notification`, service worker, geste utilisateur de Safari. Chaque point
// d'entrée doit SORTIR avant, dans l'app.
{
  const src = codeDe('app/components/OneSignalInit.js')
  for (const [nom, motif] of [
    ['le composant d’initialisation', /if \(estAppNative\(window\)\) \{[\s\S]{0,400}initialiserPushNatif\(window, APP_ID, yopperId\)/],
    ['l’activation depuis les réglages', /if \(estAppNative\(window\)\) return demanderPushNatif\(window\)/],
    ['la lecture de l’état', /const natif = etatPushNatif\(window\)/],
  ]) {
    verifie(`🔴 ${nom} passe par le natif`, motif.test(src))
  }
  // 🔴 LE PIÈGE JUMEAU : `OneSignalDeferred` n'existe pas dans l'app, donc une
  // fonction empilée dedans y reste pour toujours, sans un mot.
  const parFile = src.split('\n').filter(l => /pushOneSignal\(async/.test(l)).length
  verifie('au moins deux fonctions passent par la file différée', parFile >= 2, `${parFile} trouvées`)
  for (const fn of ['taggerFavoriOneSignal', 'promptPushOneSignal']) {
    const bloc = src.slice(src.indexOf(`export function ${fn}`), src.indexOf(`export function ${fn}`) + 420)
    verifie(`🔴 ${fn} sort avant la file différée`,
      bloc.indexOf('estAppNative(window)') > 0
      && bloc.indexOf('estAppNative(window)') < bloc.indexOf('pushOneSignal(async'))
  }
  // ⚠️ ET LE SDK WEB N'EST JAMAIS CHARGÉ DANS L'APP : les deux se disputeraient
  // le même global et le même abonnement.
  const iSortie = src.indexOf('if (estAppNative(window)) {')
  const iInitWeb = src.indexOf('await OneSignal.init({')
  verifie('🔴 le SDK web n’est pas initialisé dans l’app', iSortie > 0 && iInitWeb > iSortie)
}

// ═══ 6) L'ENVELOPPE NATIVE ═════════════════════════════════════════════════
{
  // ⚠️ LE CODE DÉPOUILLÉ, PAS LE FICHIER BRUT. La garde « jamais
  // `app.yoppaa.pro` » rougissait sur le COMMENTAIRE qui explique justement
  // pourquoi cet identifiant reste libre. Un faux rouge, donc sans gravité,
  // mais c'est le même piège que le faux vert d'un mot trouvé en commentaire.
  const conf = codeDe('capacitor.config.ts')
  // 🔴 L'IDENTIFIANT EST FIGÉ ET UNIQUE SUR TOUT GOOGLE PLAY.
  verifie('🔴 l’identifiant d’app est celui déposé', /appId: 'app\.yoppaa\.client'/.test(conf))
  verifie('⚠️ et jamais celui du tableau de bord', !/app\.yoppaa\.pro/.test(conf))
  // 🔴 LE PAIEMENT DOIT POUVOIR S'OUVRIR, sinon la commande est créée et jamais
  // payée, le client bloqué sur un écran vide.
  verifie('🔴 Stripe Checkout peut s’ouvrir dans l’app', /'checkout\.stripe\.com'/.test(conf))
  // ⚠️ JAMAIS DE HTTP EN CLAIR : un jeton de session qui voyage en clair ne se
  // rattrape pas, et les deux stores le refusent.
  verifie('🔴 rien ne passe en clair', /cleartext: false/.test(conf) && /allowMixedContent: false/.test(conf))
  verifie('⚠️ le site de production est la source', /url: 'https:\/\/www\.yoppaa\.app'/.test(conf))
  // ⚠️ LE `webDir` NE RECOPIE PLUS 1,2 Mo D'ICÔNES dans chaque paquet.
  verifie('⚠️ le dossier embarqué reste minimal', /webDir: 'capacitor-web'/.test(conf))
}

// ═══ 7) LES WORKFLOWS QUI FABRIQUENT LES PAQUETS ═══════════════════════════
{
  // 🔴 LE DÉFAUT QUI NE SE VOIT NULLE PART (17/09, dans LES DEUX workflows).
  // `if: ${{ env.X != '' }}` sur une étape dont le `env:` définit X : la
  // condition est évaluée AVANT l'étape, donc X est vide, donc l'étape est
  // TOUJOURS sautée. Android sortait un bundle non signé et Google le refusait
  // sans un mot ; iOS échouait plus loin sur une erreur de signature obscure.
  // Aucun des deux n'apparaissait en échec à l'endroit du problème.
  for (const w of ['paquet-android', 'paquet-ios']) {
    const src = lire(`.github/workflows/${w}.yml`)
    // ⚠️ ON VISE LA FORME EXACTE, pas le mot « env » : `env:` est légitime
    // partout ailleurs, c'est sa lecture dans un `if:` d'étape qui piège.
    const ifs = src.match(/^\s*if:.*$/gm) || []
    const fautifs = ifs.filter((l) => /env\./.test(l))
    verifie(`🔴 ${w} : aucun « if » ne lit un env d’étape`, fautifs.length === 0,
      fautifs.join(' | '))
    // 🔴 ET LA SIGNATURE REFUSE DE SE TAIRE. Un paquet non signé n'a aucun
    // usage : mieux vaut échouer bruyamment que livrer un fichier mort.
    //
    // 🔴 CETTE GARDE A ÉTÉ VERTE ET COMPLICE, le 17/09 au soir, ET C'EST MOI
    // QUI L'AI DÉSARMÉE. Elle cherchait `::error::Le secret` dans le fichier.
    // En ajoutant l'étape de téléversement, j'ai mis un SECOND message de la
    // même forme dans le workflow iOS : retirer celui de la signature ne la
    // faisait alors plus rougir, puisqu'elle trouvait celui du dépôt. La
    // mutation l'a démasquée. C'est le motif du jour, quatrième fois : un mot
    // cherché se trouve ailleurs, et une garde meurt quand on touche à un
    // AUTRE endroit, sans un mot.
    //
    // ⚠️ ON COMPTE DONC, ON NE CHERCHE PLUS : chaque bloc de secrets
    // obligatoires doit porter SON cri. Un bloc ajouté demain sans message
    // fera rougir celle-ci, au lieu de se glisser derrière les autres.
    // ⚠️ LES CHIFFRES COMPTENT DANS LES NOMS : `CLE_ANDROID_B64`,
    // `CERTIFICAT_P12_B64`. Première écriture sans `0-9`, elle trouvait zéro
    // bloc et rougissait sur du code juste. Deuxième fois aujourd'hui qu'une
    // garde neuve accuse le bon code ; c'est le détail affiché qui l'a dit.
    const blocs = (src.match(/for v in [A-Z0-9_ ]+; do/g) || []).length
    const cris = (src.match(/::error::Le secret \$v manque/g) || []).length
    verifie(`🔴 ${w} : CHAQUE bloc de secrets fait échouer le travail`,
      blocs > 0 && cris === blocs && /exit 1/.test(src),
      `blocs=${blocs}, messages=${cris}`)
  }

  const android = lire('.github/workflows/paquet-android.yml')
  // 🔴 `apksigner` NE SIGNE PAS UN BUNDLE : c'est l'outil des APK, et il refuse
  // un .aab. Un bundle se signe avec `jarsigner`.
  //
  // ⚠️ ON VISE LES LIGNES EXÉCUTÉES, PAS LE FICHIER. La première version de
  // cette garde rougissait sur le COMMENTAIRE ci-dessus, qui explique
  // précisément pourquoi cet outil est écarté. Deuxième fois de la semaine :
  // un mot cherché se trouve dans ce qui le proscrit.
  const lignesYml = android.split('\n').filter((l) => !/^\s*#/.test(l))
  verifie('🔴 le bundle est signé avec jarsigner',
    lignesYml.some((l) => /\bjarsigner\b/.test(l)))
  verifie('🔴 et jamais avec apksigner, qui refuse un .aab',
    !lignesYml.some((l) => /\bapksigner\b/.test(l)))
  // ⚠️ ON VÉRIFIE LA SIGNATURE APRÈS L'AVOIR POSÉE : `jarsigner` peut rendre 0
  // sans avoir rien signé, et l'artefact muet ne se découvre qu'au dépôt.
  //
  // 🔴 ET ON LIT SA PHRASE, PAS SON CODE DE SORTIE. Les deux autres façons ont
  // été essayées sur un vrai paquet le 17/09 et sont fausses : `-strict` échoue
  // sur un certificat auto-signé, ce qu'est TOUJOURS une clé Android ; et sans
  // `-strict`, jarsigner rend 0 même sur un jar non signé.
  verifie('⚠️ la signature est vérifiée après coup', /jarsigner -verify /.test(android))
  verifie('🔴 et la vérification lit « jar verified », pas le code de sortie',
    /grep -q "jar verified"/.test(android))
  verifie('🔴 « -strict » ne revient pas : il rejette le cas normal',
    !lignesYml.some((l) => /jarsigner -verify -strict/.test(l)))
  // 🔴 `gradlew` DOIT ÊTRE RENDU EXÉCUTABLE AVANT D'ÊTRE LANCÉ. Le dépôt vit
  // sous Windows, où Git ne conserve pas le bit : le runner Linux répond
  // « Permission denied », code 126, et ne nomme rien. Défaut réel du 17/09.
  //
  // ⚠️ ON VÉRIFIE L'ORDRE, pas la présence : un `chmod` après l'appel ne sert
  // à rien, et une garde qui cherche les deux mots serait verte à l'envers.
  {
    const iChmod = android.indexOf('chmod +x ./gradlew')
    const iLance = android.indexOf('./gradlew bundleRelease')
    verifie('🔴 gradlew est rendu exécutable AVANT d’être lancé',
      iChmod > -1 && iLance > -1 && iChmod < iLance)
  }
  // 🔴 ET LE NUMÉRO DE BUILD AUSSI. Un `sed` qui ne trouve rien ne dit rien :
  // le paquet repartirait avec l'ancien numéro, le premier dépôt passerait, et
  // le second serait refusé pour une cause à chercher très loin de là.
  verifie('🔴 le numéro de build posé est relu',
    /grep -q "versionCode/.test(android) && /Le numero de build n a pas ete pose/.test(android))

  // ═══ LE WORKFLOW iOS, QUI N'A JAMAIS TOURNÉ (17/09) ═════════════════════
  //
  // 🔴 C'EST EXACTEMENT LA SITUATION DU MATIN. Le workflow Android portait CINQ
  // défauts silencieux, tous découverts en le lançant pour de vrai. Celui d'iOS
  // n'a pas encore été exécuté : ses gardes sont donc la seule chose qui le
  // sépare d'une soirée perdue sur une erreur de signature illisible.
  {
    const ios = lire('.github/workflows/paquet-ios.yml')
    const lignesIos = ios.split('\n').filter((l) => !/^\s*#/.test(l))

    // 🔴 SIGNATURE MANUELLE, OBLIGATOIRE EN CI. Le projet Xcode porte
    // `CODE_SIGN_STYLE = Automatic` : Xcode voudrait alors ouvrir une session
    // Apple pour gérer les certificats, et un runner GitHub n'en a aucune.
    verifie('🔴 iOS archive en signature MANUELLE',
      lignesIos.some((l) => /CODE_SIGN_STYLE=Manual/.test(l)))
    verifie('🔴 et il nomme l’équipe, que xcodebuild ne devine pas',
      /DEVELOPMENT_TEAM="\$TEAM_ID"/.test(ios))

    // ⚠️ L'ÉQUIPE VIENT D'UN SECRET, JAMAIS DU FICHIER. Un Team ID écrit en dur
    // dans un dépôt public dit à qui appartient le compte, et fige une valeur
    // qui change si la société change d'équipe.
    // ⚠️ PREMIÈRE VERSION FAUSSE, corrigée dans la minute : elle interdisait
    // `DEVELOPMENT_TEAM=` suivi d'autre chose qu'un `$`, et rougissait donc sur
    // `DEVELOPMENT_TEAM="$TEAM_ID"`, à cause du guillemet. Une garde qui rougit
    // sur du code juste ne protège de rien : elle vise maintenant le DÉFAUT,
    // un Team ID de dix caractères écrit en clair dans le dépôt.
    verifie('⚠️ le Team ID vient d’un secret, pas du fichier',
      /secrets\.APPLE_TEAM_ID/.test(ios)
      && !lignesIos.some((l) => /DEVELOPMENT_TEAM="?[A-Z0-9]{10}"?/.test(l)))

    // 🔴 L'EXPORT NE DEVINE NI L'ÉQUIPE NI LE PROFIL. Sans `teamID`, un compte à
    // plusieurs équipes échoue ; sans `provisioningProfiles`, le profil importé
    // trois étapes plus haut est copié sur le runner et jamais utilisé.
    verifie('🔴 l’export nomme l’équipe',
      /<key>teamID<\/key>/.test(ios))
    verifie('🔴 l’export reste en signature manuelle',
      /<key>signingStyle<\/key><string>manual<\/string>/.test(ios))
    verifie('🔴 et il associe le bundle à son profil',
      /<key>provisioningProfiles<\/key>/.test(ios)
      && /<key>app\.yoppaa\.client<\/key>/.test(ios))

    // ⚠️ LE `heredoc` DOIT INTERPOLER. Écrit `<<'PLIST'` avec des apostrophes,
    // le shell recopie `${TEAM_ID}` littéralement dans le fichier, et l'export
    // part avec le texte au lieu de la valeur. Le défaut serait invisible à la
    // lecture du workflow.
    verifie('🔴 le gabarit d’export interpole ses variables',
      /cat > export\.plist <<PLIST/.test(ios) && !/cat > export\.plist <<'PLIST'/.test(ios))

    // 🔴 ON RELIT CE QU'ON A PRODUIT, ET ON LIT LA PHRASE. La leçon du paquet
    // Android : une commande de vérification peut rendre 0 sans rien vérifier.
    verifie('🔴 la signature du .ipa est vérifiée après coup',
      lignesIos.some((l) => /codesign -dv/.test(l)))
    verifie('🔴 et la vérification lit l’autorité, pas le code de sortie',
      /grep -q "Authority=Apple Distribution"/.test(ios))
    verifie('🔴 elle vérifie aussi que c’est le bon bundle',
      /grep -q "app\.yoppaa\.client"/.test(ios))

    // ⚠️ ET LES DEUX NOUVEAUX SECRETS FONT ÉCHOUER LE TRAVAIL S'ILS MANQUENT,
    // comme les trois autres. Un paquet signé par défaut n'existe pas : il
    // sortirait inutilisable, et le dépôt le refuserait des heures plus tard.
    verifie('🔴 les secrets d’équipe manquants font échouer le travail',
      /::error::APPLE_TEAM_ID ou PROFIL_NOM manque/.test(ios))

    // ═══ COCOAPODS OU SWIFT PACKAGE MANAGER, IL FAUT CHOISIR ═══════════════
    //
    // 🔴 LES DEUX DÉFAUTS TROUVÉS AU PREMIER VRAI LANCEMENT (17/09 au soir).
    // Le workflow lançait `pod install` et archivait un `App.xcworkspace` :
    // Capacitor 8 est passé à Swift Package Manager, et NI L'UN NI L'AUTRE
    // n'existe dans ce dépôt. GitHub a répondu « No Podfile found », et le
    // second défaut ne se serait révélé qu'après la correction du premier,
    // dix minutes de Mac plus tard.
    //
    // ⚠️ C'EST LA CONFIRMATION DE LA RÈGLE DU MATIN : un workflow qui n'a
    // jamais tourné ne prouve rien, quelle que soit la qualité de sa relecture.
    // J'avais corrigé trois défauts par la lecture ; il en restait deux que
    // seul le lancement pouvait montrer.
    //
    // ⚠️ ON VÉRIFIE AUSSI L'ÉTAT DU DÉPÔT, pas seulement le texte du workflow :
    // le jour où un Podfile réapparaîtrait, c'est le workflow qu'il faudrait
    // changer, et cette garde le dira avant le build.
    const aUnPodfile = existe('ios/App/Podfile')
    const aUnPackageSwift = existe('ios/App/CapApp-SPM/Package.swift')
    verifie('le projet iOS est en Swift Package Manager, pas en CocoaPods',
      aUnPackageSwift && !aUnPodfile,
      `Package.swift=${aUnPackageSwift}, Podfile=${aUnPodfile}`)
    verifie('🔴 le workflow ne lance donc jamais « pod install »',
      !lignesIos.some((l) => /\bpod install\b/.test(l)))
    verifie('🔴 et il archive le PROJET, pas un workspace CocoaPods',
      lignesIos.some((l) => /-project App\.xcodeproj/.test(l))
      && !lignesIos.some((l) => /-workspace App\.xcworkspace/.test(l)))
    // ⚠️ LES PAQUETS SE RÉSOLVENT AVANT L'ARCHIVE, explicitement : sinon Xcode
    // les télécharge au milieu du build, et une coupure réseau échoue dans une
    // étape qui parle de signature.
    verifie('⚠️ les dépendances Swift sont résolues avant l’archive',
      /-resolvePackageDependencies/.test(ios))

    // ═══ LE DÉPÔT CHEZ APPLE, QUI N'A PAS D'AUTRE VOIE ═════════════════════
    //
    // 🔴 ET C'EST LA DISSYMÉTRIE AVEC ANDROID, pas un oubli. Le `.aab` se
    // dépose à la main dans la console Play, depuis n'importe quel navigateur,
    // Windows compris. Un `.ipa`, non : App Store Connect ne prend le fichier
    // que par `altool` ou Transporter, qui font partie de Xcode et n'existent
    // donc que sur macOS. Le paquet Android n'a PAS besoin de cette étape ;
    // celui d'iOS ne peut pas s'en passer.
    const sansComm = lignesIos.join('\n')
    verifie('🔴 le paquet iOS est téléversé depuis le Mac de GitHub',
      /xcrun altool --upload-app/.test(sansComm))

    // ⚠️ L'ARTEFACT EST RÉCUPÉRÉ AVANT LE DÉPÔT, et l'ordre est le fond de
    // l'affaire : un dépôt refusé (numéro de build déjà vu, réseau) ferait
    // sinon perdre un fichier parfaitement bon, et dix minutes de Mac avec.
    {
      const iArtefact = sansComm.indexOf('upload-artifact')
      const iDepot = sansComm.indexOf('altool --upload-app')
      verifie('🔴 le fichier est mis de côté AVANT d’être déposé',
        iArtefact > -1 && iDepot > -1 && iArtefact < iDepot)
    }

    // ⚠️ ON VALIDE AVANT DE DÉPOSER. Un numéro de build brûlé ne se réutilise
    // jamais : autant apprendre d'une validation qu'il manque une icône.
    {
      const iValide = sansComm.indexOf('altool --validate-app')
      const iDepot = sansComm.indexOf('altool --upload-app')
      verifie('🔴 la validation passe AVANT le dépôt',
        iValide > -1 && iDepot > -1 && iValide < iDepot)
    }

    // 🔴 ET ON LIT CE QU'ALTOOL A ÉCRIT, PAS SON CODE DE SORTIE. Troisième fois
    // que ce motif se présente : `jarsigner -verify` rendait 0 sur un bundle
    // non signé, `codesign` peut se taire, et `altool` range ses refus dans
    // « product-errors ». Les DEUX appels doivent être relus, pas seulement le
    // dernier : une validation refusée qu'on n'écoute pas mène droit au dépôt.
    verifie('🔴 la validation et le dépôt sont relus, tous les deux',
      (sansComm.match(/grep -q "product-errors"/g) || []).length === 2)

    // 🔴 `altool` NE PREND PAS DE CHEMIN VERS LA CLÉ, IL LA CHERCHE. Sous ce
    // dossier, et sous ce nom exact. Nommée autrement, elle est introuvable et
    // le message ne dit pas où il regardait.
    verifie('🔴 la clé API porte le nom qu’Apple ira chercher',
      /AuthKey_\$CLE_API_ID\.p8/.test(sansComm)
      && /\.appstoreconnect\/private_keys/.test(sansComm))

    // ⚠️ LES TROIS SECRETS DU DÉPÔT MANQUANTS FONT ÉCHOUER LE TRAVAIL, comme
    // les cinq autres. Sans eux le paquet sortirait, mais ne partirait nulle
    // part, et le travail serait vert.
    verifie('🔴 les secrets du dépôt manquants font échouer le travail',
      /::error::Le secret \$v manque\. Sans les trois, rien ne peut etre televerse/.test(ios))

    // 🔴 ET LA CLÉ PRIVÉE NE VIT QUE DANS UN SECRET. Qui la détient peut
    // déposer une application au nom d'Avcotech.
    verifie('🔴 la clé privée vient d’un secret, jamais du dépôt',
      /secrets\.APPSTORE_CLE_P8_B64/.test(ios)
      && !/BEGIN PRIVATE KEY/.test(ios))

    // 🔴 LA DÉCLARATION D'EXPORT, SANS LAQUELLE CHAQUE DÉPÔT RESTE EN ATTENTE.
    // Absente de l'Info.plist, App Store Connect marque le build « Conformité
    // aux règles d'exportation manquante » et REFUSE de le laisser soumettre
    // tant qu'on n'a pas répondu à la question, à la main, à chaque version.
    // Yoppaa ne fait que du HTTPS, qui est exempté : la réponse est « false ».
    {
      const plist = lire('ios/App/App/Info.plist')
      verifie('🔴 la conformité export est déclarée, sinon chaque dépôt attend',
        /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist))
    }
  }
}

// ═══ 8) CE QUE LE CODE DEMANDE, LES MANIFESTES DOIVENT LE DÉCLARER ════════
//
// 🔴 LE DÉFAUT DU 17/09 À MINUIT, ET C'EST APPLE QUI L'A TROUVÉ, PAS NOUS.
// Le premier dépôt a répondu ITMS-90683 : pas de chaîne d'explication pour la
// position dans l'`Info.plist`. En cherchant les frères, il y en avait DEUX
// autres, dont un côté Android que rien n'aurait jamais signalé : le manifeste
// ne déclarait QUE `INTERNET`, alors que `navigator.geolocation` est appelé
// dans quatre fichiers.
//
// ⚠️ AUCUN PLUGIN NE LES AJOUTE À NOTRE PLACE. On utilise les API du
// navigateur, pas `@capacitor/geolocation` ni `@capacitor/camera` : rien ne
// fusionne de permission dans ces fichiers, contrairement à ce qu'on lit
// partout. Les deux paquets seraient partis avec leur écran principal vide.
//
// ⚠️ LA GARDE PART DU CODE, PAS DES MANIFESTES. Vérifier qu'une clé est
// présente ne dit rien : c'est l'APPEL qui crée l'obligation. Le jour où un
// écran appellera la caméra ou le micro, c'est ici que ça rougira.
{
  // 🔴 ET ON RETIRE LES COMMENTAIRES DES DEUX MANIFESTES AVANT DE LIRE. Ceux
  // que je viens d'y écrire NOMMENT les permissions qu'ils expliquent : une
  // garde qui cherche le mot le trouverait dans sa propre justification, et
  // resterait verte sur un manifeste vidé. C'est le motif déjà vu deux fois
  // cette semaine, un mot cherché se trouve dans ce qui le proscrit.
  const sansXml = (t) => t.replace(/<!--[\s\S]*?-->/g, '')
  const plist = sansXml(lire('ios/App/App/Info.plist'))
  const manif = sansXml(lire('android/app/src/main/AndroidManifest.xml'))

  const fichiersJs = ['app', 'lib'].flatMap((dossier) =>
    readdirSync(new URL(`../${dossier}/`, import.meta.url), { recursive: true })
      .filter((f) => typeof f === 'string' && f.endsWith('.js'))
      .map((f) => `${dossier}/${f.split('\\').join('/')}`))
  const toutLeCode = fichiersJs.map((f) => codeDe(f)).join('\n')

  // ⚠️ LA POSITION. Quatre fichiers l'appellent, et sans géolocalisation il
  // n'y a plus AUCUN lieu à montrer : l'écran principal se vide.
  const veutPosition = /navigator\.geolocation/.test(toutLeCode)
  verifie('⚠️ le code appelle bien la position (sinon cette section ment)',
    veutPosition)
  if (veutPosition) {
    verifie('🔴 iOS explique POURQUOI il demande la position',
      /<key>NSLocationWhenInUseUsageDescription<\/key>/.test(plist))
    verifie('🔴 Android déclare la position, sans quoi le WebView ne l’obtient jamais',
      /android\.permission\.ACCESS_FINE_LOCATION/.test(manif)
      && /android\.permission\.ACCESS_COARSE_LOCATION/.test(manif))
    // ⚠️ ET LE GPS RESTE FACULTATIF. Sans ces deux lignes, Google Play déduit
    // de la permission que l'appareil DOIT avoir un GPS, et masque
    // l'application à ceux qui n'en ont pas. Yoppaa sait vivre sans : on
    // choisit sa commune à la main.
    verifie('🔴 le GPS n’est pas rendu obligatoire à l’installation',
      /location\.gps"\s+android:required="false"/.test(manif)
      && /location\.network"\s+android:required="false"/.test(manif))
  }

  // ⚠️ L'IMAGE. Un `<input type="file" accept="image/*">` propose « Prendre une
  // photo » sur iPhone : sans `NSCameraUsageDescription`, iOS TUE l'app à
  // l'instant où l'utilisateur y touche. Ce n'est pas un avertissement.
  //
  // ⚠️ ANDROID N'A RIEN À DÉCLARER ICI, et c'est la dissymétrie : le WebView
  // passe par l'intent système, qui s'exécute dans l'application Appareil
  // photo. Demander `CAMERA` nous obligerait au contraire à la réclamer à
  // l'utilisateur pour rien.
  const veutImage = /type="file"[^>]*accept="image/.test(toutLeCode)
  verifie('⚠️ le code ouvre bien un choix d’image (sinon cette section ment)',
    veutImage)
  if (veutImage) {
    verifie('🔴 iOS explique POURQUOI il ouvre l’appareil photo',
      /<key>NSCameraUsageDescription<\/key>/.test(plist))
    verifie('🔴 iOS explique POURQUOI il ouvre la photothèque',
      /<key>NSPhotoLibraryUsageDescription<\/key>/.test(plist))
  }

  // 🔴 ET UNE CHAÎNE VIDE OU CREUSE SE FAIT REJETER. Apple refuse « cette app
  // a besoin de votre position » : le texte doit dire à quoi ça sert, dans la
  // langue de l'utilisateur. On exige donc qu'il nomme l'app et qu'il ait la
  // longueur d'une vraie phrase.
  for (const cle of ['NSCameraUsageDescription', 'NSLocationWhenInUseUsageDescription',
    'NSPhotoLibraryUsageDescription']) {
    const m = plist.match(new RegExp(`<key>${cle}</key>\\s*<string>([^<]*)</string>`))
    const texte = m ? m[1] : ''
    verifie(`🔴 ${cle} dit à quoi ça sert`,
      texte.length >= 40 && /Yoppaa/.test(texte), `« ${texte} »`)
  }
}

console.log(`\nPush natif et enveloppe : ${ok} vérifications`)
if (echecs.length) {
  console.log(`\n✕ ${echecs.length} ÉCHEC(S) :`)
  for (const e of echecs) console.log('   • ' + e)
  process.exit(1)
}
console.log('Tout passe.')
