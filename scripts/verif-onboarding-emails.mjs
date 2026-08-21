// Banc des TROIS ÉCRANS QUE VOIT UN COMMERÇANT QUI ARRIVE :
// l'inscription, l'email de validation, le kit de partage.
//
// ⚠️ CE QUI SE CASSE ICI NE SE VOIT DANS AUCUN TEST CLASSIQUE, parce que rien
// ne plante. Une date périmée s'envoie parfaitement. Un `color:undefined`
// s'affiche presque bien. Un message de réussite peint en rouge est un message
// livré. Le défaut n'est jamais dans l'exécution, il est dans ce que la
// personne LIT.
//
// Et le kit a une propriété que les autres emails n'ont pas : il est
// RECOPIÉ TEL QUEL par le commerçant sur ses réseaux et dans son groupe de
// quartier. Une date fausse ici ne trompe pas un lecteur, elle en trompe cent,
// et c'est le commerçant qui passe pour celui qui s'est trompé.
//
// Le banc EXÉCUTE les gabarits et lit le HTML qui en sort. Il ne cherche pas un
// mot dans un fichier source, sauf pour les composants React, qu'on ne peut pas
// rendre ici ; là, il découpe la section avant d'y chercher, et il compte.

import { readFileSync } from 'node:fs'
import { libelleLancement, avantLancement } from '../lib/lancement.js'
import {
  C, echapperHtml, emailKitBienvenue, emailValidationCommercant, emailRejetCommercant,
  emailDemandeRecue, emailNouveauCommercantAValider,
} from '../lib/resend.js'

// ⚠️ Fins de ligne normalisées : ces fichiers sont en CRLF, et une expression
// qui cherche `\n` littéral ne trouverait rien tout en passant au vert.
const lire = (chemin) =>
  readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

// ⚠️ ON DÉPOUILLE LES COMMENTAIRES AVANT DE CHERCHER. Le piège le plus fréquent
// de ce projet : la garde trouve le mot interdit dans MON PROPRE commentaire qui
// explique pourquoi il est interdit, et elle verdit sur un fichier fautif.
function sansCommentaires(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
}

// Découpe le corps d'une fonction nommée : chercher dans TOUT le fichier, c'est
// se garantir de trouver la phrase ailleurs et de ne rien vérifier.
function corpsDeFonction(src, nom) {
  const debut = src.indexOf(`function ${nom}(`)
  if (debut === -1) return ''
  const suite = src.slice(debut + 10)
  const m = suite.search(/\n(export )?function \w+\(/)
  return m === -1 ? suite : suite.slice(0, m)
}

const compter = (texte, motif) => (texte.match(motif) || []).length

const MOIS = 'janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre'
const DATE_EN_DUR = new RegExp(`\\b\\d{1,2}(er)?\\s+(${MOIS})\\b`, 'g')

const OUVERTURE = libelleLancement()          // « 1er octobre » aujourd'hui
const PHASE = avantLancement()

// ═══ 1. LE KIT : AUCUNE DATE ÉCRITE À LA MAIN ════════════════════════════
// Le kit annonçait « 1er septembre » cinq fois alors que l'ouverture est passée
// au 1er octobre. Des commerçants ont donc reçu, noir sur blanc, une date
// fausse à recopier sur leurs réseaux.
{
  const html = emailKitBienvenue({ nom_commercant: 'La friterie du quartier', slug: 'la-friterie-du-quartier', avant_lancement: true })

  verifier('le kit nomme la date d\'ouverture', html.includes(OUVERTURE), OUVERTURE)
  // ⚠️ ON COMPTE. Vérifier UNE occurrence quand il y en a sept laisse six
  // phrases libres de porter une autre date. Défaut vécu trois fois.
  const nb = compter(html, new RegExp(OUVERTURE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
  verifier('et il la nomme PARTOUT où il l\'annonçait', nb >= 5, `${nb} occurrence(s), 5 attendues au minimum`)

  // La garde de fond : la date ne doit exister nulle part en dur dans le corps
  // de la fonction. Elle vient de `lib/lancement.js` ou de nulle part.
  const corps = sansCommentaires(corpsDeFonction(lire('lib/resend.js'), 'emailKitBienvenue'))
  const enDur = (corps.match(DATE_EN_DUR) || []).filter(d => d !== OUVERTURE)
  verifier('aucune date française écrite à la main dans le kit',
    enDur.length === 0, enDur.join(' · '))
  verifier('le kit dérive la date de lib/lancement',
    /libelleLancement\(\)/.test(corps))

  // ⚠️ LE SEUIL COMMUNAL N'EXISTE PLUS depuis le 16/08 : les 260 communes
  // wallonnes sont ouvertes, aucune n'a de palier à franchir.
  verifier('le kit ne promet plus de compteur communal',
    !/compteur de (ta|la) commune/i.test(html))
  verifier('le kit ne promet plus de seuil à atteindre',
    !/atteint son objectif|seuil|palier/i.test(html))

  // ⚠️ ET IL NE PROMET PLUS DE NOTIFICATION AUTOMATIQUE À L'OUVERTURE.
  // « Le 1er septembre, ils reçoivent tous une notification » : ce code
  // n'existe pas. Prévenir les préinscrits d'une commune quand un commerçant
  // la rejoint est un chantier ouvert, pas une fonctionnalité livrée.
  verifier('le kit ne promet pas une notification que le code n\'envoie pas',
    !/ils reçoivent tous une notification/i.test(html))

  // Après l'ouverture, plus aucune date d'ouverture ne traîne.
  const apres = emailKitBienvenue({ nom_commercant: 'Test', slug: 'test', avant_lancement: false })
  verifier('après l\'ouverture, le kit ne parle plus d\'une ouverture à venir',
    !apres.includes(OUVERTURE))
  verifier('après l\'ouverture, le lien envoie sur la fiche',
    apres.includes('/commander/test') && !apres.includes('?ref='))
  verifier('avant l\'ouverture, le lien est celui de préinscription',
    html.includes('?ref=la-friterie-du-quartier'))
}

// ═══ 2. LES DEUX EMAILS DE VALIDATION NE SE MARCHENT PLUS DESSUS ═════════
// ⚠️ `app/api/admin/valider` les envoie l'un derrière l'autre : ils arrivent à
// la seconde près dans la même boîte. Ils portaient le MÊME titre.
{
  const titre = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  const val = emailValidationCommercant({ nom: 'La friterie du quartier', slug: 'la-friterie-du-quartier', avant_lancement: true })
  const kit = emailKitBienvenue({ nom_commercant: 'La friterie du quartier', slug: 'la-friterie-du-quartier', avant_lancement: true })

  verifier('les deux emails simultanés portent des titres différents',
    titre(val) !== titre(kit), `« ${titre(val)} » vs « ${titre(kit)} »`)
  verifier('la validation annonce la mise en ligne', /en ligne/i.test(titre(val)), titre(val))

  // ⚠️ ET ILS NE SE CONTREDISENT PLUS. L'un annonçait une ouverture à venir
  // pendant que l'autre déclarait que « tes premiers clients peuvent déjà te
  // trouver ». La vérité est entre les deux : la page EST en ligne, mais
  // personne ne parcourt encore Yoppaa, donc elle se trouve par le LIEN.
  verifier('avant l\'ouverture, la validation situe l\'ouverture publique',
    val.includes(OUVERTURE))
  verifier('avant l\'ouverture, la validation ne promet pas une découverte spontanée',
    !/clients peuvent déjà te trouver/.test(val),
    'personne ne parcourt encore Yoppaa : on se trouve par le lien')
  verifier('la validation annonce le second email',
    /kit de partage/i.test(val),
    'sinon deux emails d\'un coup ressemblent à un doublon')

  const valApres = emailValidationCommercant({ nom: 'Test', slug: 'test', avant_lancement: false })
  verifier('après l\'ouverture, la validation ne parle plus d\'une date à venir',
    !valApres.includes(OUVERTURE))
}

// ═══ 3. AUCUN « undefined » DANS UN EMAIL, ET TOUS LES LIENS EN www ══════
// ⚠️ `C.deep` n'existait pas dans la palette : vingt-deux paragraphes rendaient
// `color:undefined`, une déclaration invalide que les clients mail jettent en
// silence. Le texte retombait sur la couleur du body, assez proche pour que
// personne ne le voie jamais.
{
  verifier('la palette email définit « deep »', /^#[0-9A-F]{6}$/i.test(String(C.deep)), String(C.deep))

  const RENDUS = [
    ['kit (avant)',      emailKitBienvenue({ nom_commercant: 'A', slug: 'a', avant_lancement: true })],
    ['kit (après)',      emailKitBienvenue({ nom_commercant: 'A', slug: 'a', avant_lancement: false })],
    ['validation',       emailValidationCommercant({ nom: 'A', slug: 'a', avant_lancement: true })],
    ['rejet',            emailRejetCommercant({ nom: 'A', motif: 'Extrait BCE illisible' })],
    ['demande reçue',    emailDemandeRecue({ nom: 'A', plan: 'vendre' })],
    ['nouveau à valider', emailNouveauCommercantAValider({ nom: 'A', type: 'detail', plan: 'vendre', score: 82, commercant_id: 'x' })],
  ]
  for (const [nom, html] of RENDUS) {
    verifier(`${nom} : aucun « undefined » rendu`,
      !html.includes('undefined'), 'une clé de palette ou un paramètre manque')
    verifier(`${nom} : aucune couleur vide`,
      !/color:\s*(;|")/.test(html))

    // ⚠️ www PARTOUT. Le domaine nu redirige, mais ce n'est pas l'adresse
    // canonique, et c'est un saut de plus depuis une boîte mail.
    const nus = (html.match(/https:\/\/yoppaa\.app[^\s"']*/g) || [])
    verifier(`${nom} : tous les liens Yoppaa sont en www`,
      nus.length === 0, nus.join(' · '))
  }
}

// ═══ 4. L'INSCRIPTION : UNE RÉUSSITE N'EST PAS UNE ERREUR ════════════════
// ⚠️ « Compte créé ! » sortait dans le bandeau ROUGE, celui des refus. Le
// commerçant venait de franchir sa première étape et l'écran lui répondait avec
// la couleur d'un échec.
{
  const brut = lire('app/signup/page.js')
  const src = sansCommentaires(brut)

  verifier('la réussite a son propre canal',
    /const \[compteCree, setCompteCree\] = useState\(false\)/.test(src))
  verifier('plus aucune réussite ne passe par setError',
    !/setError\('Compte créé/.test(src),
    'le canal des erreurs est peint en rouge')
  // ⚠️ ON DÉCOUPE LE BLOC AVANT D'Y CHERCHER, et cette garde-ci l'a appris à ses
  // dépens : `background: '#ECFDF5'` apparaît TROIS FOIS dans ce fichier. Peinte
  // en rouge, la carte de réussite laissait la garde verte, qui trouvait le vert
  // six cents lignes plus bas. Chercher un mot ne suffit jamais, il faut
  // chercher AU BON ENDROIT.
  const debutBloc = src.indexOf('{compteCree && (')
  verifier('le bandeau de réussite est bien monté', debutBloc > -1)
  const finBloc = src.indexOf('{error && (', debutBloc)
  const bloc = debutBloc > -1 && finBloc > debutBloc ? src.slice(debutBloc, finBloc) : ''
  verifier('le bloc se termine avant celui des erreurs', bloc.length > 0)

  verifier('le bandeau de réussite est VERT',
    /background: '#ECFDF5'/.test(bloc),
    'et pas la couleur d\'un refus')
  verifier('il ne porte AUCUNE couleur de refus',
    !/#FEE2E2|#FCA5A5|#7F1D1D|#DC2626/.test(bloc))
  verifier('il nomme la première étape franchie',
    /Première étape franchie/.test(bloc))
  verifier('il dit le geste suivant',
    /clique sur le lien/.test(bloc),
    'à cet instant la seule question est « je fais quoi ? »')

  // ⚠️ Le bouton menait à un mur : « Créer mon compte » sur un compte déjà
  // créé ne pouvait plus rendre qu'un « User already registered ».
  verifier('le bouton change de geste après la création',
    /compteCree \? 'J’ai confirmé mon email →'/.test(src))
  verifier('et il relit la session au lieu d\'en créer une seconde',
    /compteCree \? reprendreApresConfirmation/.test(src))
  verifier('la reprise existe et lit la session',
    /async function reprendreApresConfirmation\(\)[\s\S]{0,300}supabase\.auth\.getSession\(\)/.test(src))

  // Le bloc « administration communale » pointait vers /administrations, une
  // page qui n'existe pas : le seul lien du site menait à un 404, en
  // production, sous le bouton principal de l'inscription.
  verifier('le bloc administration communale est retiré',
    !/administration communale/i.test(src))
  verifier('et son lien mort avec lui',
    !/\/administrations/.test(src))
}

// ═══ 5. LA PAGE DU KIT ═══════════════════════════════════════════════════
{
  const brut = lire('app/kit/[slug]/KitClient.js')
  const src = sansCommentaires(brut)

  verifier('la page du kit ne promet plus de seuil communal',
    !/atteint son objectif/.test(src))
  const enDur = (src.match(DATE_EN_DUR) || [])
  verifier('aucune date française écrite à la main dans la page du kit',
    enDur.length === 0, enDur.join(' · '))
  verifier('les textes de partage dérivent la date',
    /textesAvant\(ouverture\)/.test(src))

  // ⚠️ UN ZÉRO N'EST PAS UN COMPTEUR, C'EST UN REPROCHE. « 0 personne inscrite
  // grâce à toi » est la première chose que voit un commerçant qui ouvre son
  // kit, c'est-à-dire AVANT d'avoir pu partager quoi que ce soit.
  verifier('le compteur ne s\'affiche qu\'à partir de 1',
    /kit\.impact > 0 \? \(/.test(src))
  verifier('et à zéro, la carte invite au lieu de reprocher',
    /Ton lien est prêt/.test(src))
  verifier('le singulier reste juste à 1',
    /kit\.impact === 1 \?/.test(src),
    '`<= 1` couvrait le zéro, qui ne s\'affiche plus')
}

// ═══ 6. LA CHAÎNE DE VALIDATION PASSE BIEN LA PHASE AUX DEUX EMAILS ══════
// ⚠️ Sinon l'un annonce une ouverture à venir pendant que l'autre la déclare
// déjà faite, dans la même boîte, à la même seconde.
{
  const route = sansCommentaires(lire('app/api/admin/valider/route.js'))
  verifier('la route calcule la phase une seule fois',
    /const phaseAvantLancement = avantLancement\(\)/.test(route))
  const passages = compter(route, /avant_lancement: phaseAvantLancement/g)
  verifier('et elle la passe aux DEUX emails', passages === 2, `${passages} passage(s)`)
}

// ═══ 7. LE GABARIT SUPABASE SERT LES DEUX PUBLICS ════════════════════════
// ⚠️ `app/signup` (commerçant) et `app/commander/auth` (Yopper) appellent TOUS
// LES DEUX `supabase.auth.signUp`, et Supabase n'a qu'un seul gabarit « Confirm
// signup ». Un habitant qui crée son compte pour commander reçoit donc
// EXACTEMENT le même email qu'un commerçant : tout mot qui ne vaut que pour l'un
// est faux pour l'autre une fois sur deux.
//
// Ce gabarit vit dans le tableau de bord Supabase, hors du dépôt. On garde donc
// ce qu'on peut garder : le texte de référence, à la racine.
{
  const doc = lire('EMAIL_CONFIRMATION_SUPABASE.md')

  // ⚠️ ON DÉCOUPE LE BLOC HTML. Le document EXPLIQUE quels mots sont bannis, et
  // les cite : chercher dans le fichier entier trouverait « facture » dans mon
  // propre avertissement et rougirait sur un gabarit parfaitement sain.
  const d = doc.indexOf('```html')
  const f = doc.indexOf('```', d + 7)
  const gabarit = d > -1 && f > d ? doc.slice(d + 7, f) : ''
  verifier('le gabarit Supabase est bien dans le document', gabarit.length > 500)

  const RESERVES_COMMERCANT = /facture|ta fiche|notre équipe|ton commerce|tableau de bord|commerçant/i
  verifier('le gabarit ne parle à AUCUN des deux publics en particulier',
    !RESERVES_COMMERCANT.test(gabarit),
    'un Yopper recevrait un email de commerçant')

  verifier('le lien se construit depuis .RedirectTo',
    gabarit.includes('{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=signup'),
    'un lien en dur renverrait TOUT LE MONDE sur le tableau de bord commerçant')
  verifier('et jamais depuis .SiteURL',
    !/\{\{ \.SiteURL \}\}/.test(gabarit))
  verifier('le gabarit est en français', /Confirmer mon adresse/.test(gabarit))
  verifier('aucun « undefined » dans le gabarit', !gabarit.includes('undefined'))
  verifier('le document dit où le coller',
    /Authentication → Emails → Templates → Confirm signup/.test(doc))
}

// ═══ 8. CE QUI VIENT DU DEHORS N'EST PAS DU HTML ═════════════════════════
// ⚠️ Trois défauts réels de l'audit du 21/08, et le même motif dans les trois :
// un texte écrit par quelqu'un est recraché tel quel dans un document que lit
// quelqu'un d'autre.
{
  // a) LES EMAILS. Le texte libre d'une partie arrive dans la boîte d'une
  // autre : la note du client chez le commerçant, le mot du bon cadeau chez un
  // destinataire que l'ACHETEUR choisit librement. Les clients mail retirent
  // les <script>, mais les ancres et les styles survivent, dans un message
  // signé DKIM par notre domaine. On EXÉCUTE le gabarit sur une charge qui
  // contient vraiment une balise.
  const CHARGE = '</p><a href="https://evil.tld">Reconfigure ton compte</a><p>'

  verifier('echapperHtml neutralise une balise',
    echapperHtml(CHARGE) === '&lt;/p&gt;&lt;a href=&quot;https://evil.tld&quot;&gt;Reconfigure ton compte&lt;/a&gt;&lt;p&gt;',
    echapperHtml(CHARGE))
  verifier('echapperHtml rend une chaîne vide sur une absence',
    echapperHtml(null) === '' && echapperHtml(undefined) === '')

  const recu = emailDemandeRecue({ nom: CHARGE, plan: 'vendre' })
  verifier("l'accusé de réception n'ouvre pas de balise venue du dehors",
    !recu.includes('<a href="https://evil.tld"'),
    'un nom peut contenir n\'importe quoi')
  verifier('et il affiche quand même le texte, échappé',
    recu.includes('&lt;a href=&quot;https://evil.tld&quot;&gt;'))

  const admin = emailNouveauCommercantAValider({ nom: CHARGE, type: CHARGE, plan: 'vendre', score: 0, commercant_id: 'x' })
  verifier("l'email d'admin non plus",
    !admin.includes('<a href="https://evil.tld"'))

  // b) LE BALISAGE DE LA FICHE COMMERÇANT. `JSON.stringify` n'échappe PAS le
  // « < » : un nom ou une description contenant « </script> » fermait le bloc
  // et exécutait du script sur l'origine yoppaa.app, chez chaque visiteur.
  const layout = sansCommentaires(lire('app/commander/[slug]/layout.js'))
  verifier('la fiche commerçant échappe son balisage',
    /echapperJsonLd\(jsonLd\)/.test(layout))
  verifier('et plus aucun JSON.stringify nu dans un script injecté',
    !/dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify/.test(layout),
    'le remède existait déjà dans le dépôt, il n\'était pas posé ici')

  // c) LE RELAIS DE COURRIER OUVERT. `/api/notify-yoppaa` n'avait AUCUNE
  // authentification, et l'appelant choisissait le destinataire ET le texte.
  const notify = sansCommentaires(lire('app/api/notify-yoppaa/route.js'))
  // ⚠️ ON CHERCHE LE REFUS, PAS LE MOT. Une première version de cette garde
  // testait la présence de « authorization » : elle est restée VERTE alors que
  // le refus venait d'être supprimé, parce que le mot figure encore deux lignes
  // plus haut, dans la lecture de l'en-tête. Chercher au bon endroit, toujours.
  verifier('notify-yoppaa REFUSE sans jeton',
    /if \(!token\)[\s\S]{0,140}status: 401/.test(notify),
    'lire l\'en-tête ne sert à rien si on n\'en fait rien')
  verifier('notify-yoppaa refuse une session invalide',
    /if \(!user\)[\s\S]{0,140}status: 401/.test(notify))
  verifier('notify-yoppaa vérifie la session', /auth\.getUser\(\)/.test(notify))
  verifier('notify-yoppaa vérifie que la fiche appartient à l\'appelant',
    /com\.auth_user_id !== user\.id/.test(notify))
  verifier('le destinataire vient de la BASE, jamais du corps',
    /to: com\.email/.test(notify) && !/const \{[^}]*\bemail\b[^}]*\} = body/.test(notify),
    'sinon un compte authentifié écrit encore l\'adresse de quelqu\'un d\'autre')
  verifier('le nom aussi vient de la base',
    /const nom = com\.nom/.test(notify))

  // Et l'appelant envoie bien le jeton, sinon la soumission casse en silence.
  const signup = sansCommentaires(lire('app/signup/page.js'))
  verifier("l'inscription envoie son jeton à notify-yoppaa",
    /Authorization: `Bearer \$\{s\?\.access_token/.test(signup))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
console.log(`Phase lue : ${PHASE ? 'avant' : 'après'} l'ouverture du ${OUVERTURE}.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Emails et écrans d\'arrivée verts.')
