// Banc de L'OFFRE DE LANCEMENT et du BALISAGE de la page d'accueil.
//
// Ce qui peut se casser ici ne se voit ni au lint, ni au build, ni à l'écran :
//
//   ⚠️ LE TEXTE PROMET UNE DURÉE, ET STRIPE EN PRÉLÈVE UNE AUTRE.
//
// La page d'accueil, le formulaire d'inscription, les conditions générales et
// l'appel à Stripe sont quatre fichiers séparés. Rien, mécaniquement, ne les
// oblige à dire la même chose. Le jour où ils divergent, personne ne s'en
// aperçoit : le commerçant lit « offert jusqu'au 8 janvier », l'écran est
// parfait, et la facture tombe le 20 novembre. On ne le découvre qu'au premier
// prélèvement, c'est-à-dire trop tard, et pour TOUT LE MONDE EN MÊME TEMPS
// puisque toutes les premières factures tombent le même jour.
//
// Le banc tient donc quatre promesses :
//   1. la règle est EXÉCUTÉE sur les cas du tableau validé par Alex, et sur
//      ses bords, là où les erreurs d'un jour se cachent ;
//   2. ce que Stripe recevra est calculé par LA MÊME fonction que le texte ;
//   3. aucune date ni durée n'est écrite en dur dans les pages, et les CGU
//      disent la convention de décompte, parce que c'est du contractuel ;
//   4. le balisage Google est un JSON valide, et ses prix sont ceux des
//      cartes affichées, pas des nombres recopiés.

import { readFileSync } from 'node:fs'
import {
  finEssai, joursOfferts, joursOffertsAuLancement, estRegimeLancement, phraseEssai,
  libelleLancement, libelleFinEssaiLancement,
  LAUNCH_DATE_ISO, FIN_ESSAI_LANCEMENT_ISO, ESSAI_JOURS_MINIMUM,
} from '../lib/lancement.js'
import { calculerTrialEnd, isTrialDiffereActif } from '../lib/stripe-billing.js'
import { jsonLdLanding, jsonLdLandingString, echapperJsonLd, SITE_URL } from '../lib/seo-landing.js'
import { getPrixPlan } from '../lib/plans.js'
import robots from '../app/robots.js'
import { FACEBOOK_URL } from '../lib/reseaux.js'

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8')

let ok = 0, ko = 0
const echecs = []
const verifier = (nom, cond, detail = '') => {
  if (cond) { ok++; return }
  ko++; echecs.push(`${nom}${detail ? ` → ${detail}` : ''}`)
}

// Retire les commentaires d'un source avant de chercher dedans.
// ⚠️ Trois gardes sont déjà nées MUETTES dans ce projet parce qu'elles
// trouvaient leur mot-clé dans MON PROPRE COMMENTAIRE, qui expliquait
// justement la règle. On teste ce que le lecteur voit, jamais ce que
// l'auteur a écrit pour lui-même.
function sansCommentaires(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')   // blocs JSX {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, '')             // blocs /* … */
    .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')
}

// ═══ 1. LA RÈGLE, EXÉCUTÉE ═══════════════════════════════════════════════
// « L'essai se termine au plus tard entre le 8 janvier 2027 et 30 jours après
//   l'inscription. » Validée par Alex le 20/08.
{
  const jour = (iso) => new Date(iso)

  // Le tableau qu'Alex a validé, cas par cas, et rien d'autre.
  const TABLE = [
    { nom: 'inscrit en août 2026',   le: '2026-08-20T10:00:00+02:00', fin: '2027-01-08', jours: 141, lancement: true },
    { nom: 'inscrit le 1er nov.',    le: '2026-11-01T14:00:00+01:00', fin: '2027-01-08', jours: 68,  lancement: true },
    { nom: 'inscrit le 20 déc.',     le: '2026-12-20T09:00:00+01:00', fin: '2027-01-19', jours: 30,  lancement: false },
    { nom: 'inscrit le 15 mars 27',  le: '2027-03-15T09:00:00+01:00', fin: '2027-04-14', jours: 30,  lancement: false },
  ]

  for (const cas of TABLE) {
    const d = jour(cas.le)
    // Le jour de fin se lit en heure BELGE : la fin de l'essai des « lancement »
    // tombe à minuit pile, donc en UTC c'est encore la veille à 23 h. Comparer
    // sur `toISOString()` rendrait le 7 janvier et ferait échouer un banc juste.
    const finBelge = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(finEssai(d))
    verifier(`fin d'essai, ${cas.nom}`, finBelge === cas.fin, `rendu ${finBelge}, attendu ${cas.fin}`)
    verifier(`journées offertes, ${cas.nom}`, joursOfferts(d) === cas.jours, `rendu ${joursOfferts(d)}, attendu ${cas.jours}`)
    verifier(`régime de lancement, ${cas.nom}`, estRegimeLancement(d) === cas.lancement)
  }

  // ⚠️ LES BORDS, c'est là que vivent les erreurs d'un jour.
  // Personne, JAMAIS, n'a moins de 30 jours : c'est le plancher, et c'est lui
  // qui empêche quelqu'un inscrit le 5 janvier de payer trois jours plus tard.
  const tardifs = ['2027-01-05T09:00:00+01:00', '2027-01-07T23:59:00+01:00', '2030-06-01T09:00:00+02:00']
  for (const iso of tardifs) {
    verifier(`plancher de ${ESSAI_JOURS_MINIMUM} jours tenu (${iso.slice(0, 10)})`,
      joursOfferts(jour(iso)) >= ESSAI_JOURS_MINIMUM,
      `rendu ${joursOfferts(jour(iso))} jours`)
  }

  // La bascule doit GLISSER, pas tomber d'une falaise : autour du 9 décembre,
  // la constante cède au plancher sans qu'aucune journée ne soit perdue. C'est
  // ce qui permet à la règle de se périmer toute seule, sans une ligne à
  // écrire le 9 janvier.
  const veille = joursOfferts(jour('2026-12-08T12:00:00+01:00'))
  const bascule = joursOfferts(jour('2026-12-09T12:00:00+01:00'))
  const apres = joursOfferts(jour('2026-12-10T12:00:00+01:00'))
  verifier('la bascule glisse, sans marche',
    veille >= bascule && bascule >= apres && veille - apres <= 2,
    `${veille} puis ${bascule} puis ${apres}`)
  verifier('et personne ne descend sous le plancher à la bascule',
    Math.min(veille, bascule, apres) >= ESSAI_JOURS_MINIMUM)

  // Une date d'inscription absurde ne doit pas rendre NaN et faire écrire
  // « NaN jours offerts » sur la page d'inscription.
  verifier("une date invalide ne fabrique pas un « NaN jours »",
    Number.isFinite(joursOfferts(new Date('pas une date'))))
  verifier("et rend une date de fin exploitable",
    !Number.isNaN(finEssai(new Date('pas une date')).getTime()))

  // Les libellés, RENDUS et relus. Ils partent dans des textes contractuels.
  verifier("le libellé de lancement dit « 1er octobre 2026 »",
    libelleLancement({ avecAnnee: true }) === '1er octobre 2026',
    libelleLancement({ avecAnnee: true }))
  verifier("le libellé de fin d'essai dit « 8 janvier 2027 »",
    libelleFinEssaiLancement() === '8 janvier 2027',
    libelleFinEssaiLancement())
  verifier('la phrase de vente nomme la date, pas seulement une durée',
    phraseEssai(jour('2026-08-20T10:00:00+02:00')).includes('8 janvier 2027'),
    phraseEssai(jour('2026-08-20T10:00:00+02:00')))
  verifier("et hors régime de lancement elle retombe sur l'essai normal",
    phraseEssai(jour('2027-06-01T10:00:00+02:00')) === "30 jours d'essai gratuit",
    phraseEssai(jour('2027-06-01T10:00:00+02:00')))

  // Les deux constantes elles-mêmes.
  verifier("l'ouverture publique est bien au 1er octobre 2026",
    LAUNCH_DATE_ISO.startsWith('2026-10-01'), LAUNCH_DATE_ISO)
  verifier("la gratuité de lancement s'arrête bien au 8 janvier 2027",
    FIN_ESSAI_LANCEMENT_ISO.startsWith('2027-01-08'), FIN_ESSAI_LANCEMENT_ISO)
}

// ═══ 2. CE QUE STRIPE RECEVRA ════════════════════════════════════════════
// La seule chose qui compte vraiment : le texte et l'argent doivent descendre
// de LA MÊME fonction. Un `calculerTrialEnd` qui recalculerait de son côté est
// exactement le défaut que ce banc existe pour empêcher.
{
  for (const iso of ['2026-08-20T10:00:00+02:00', '2026-11-01T14:00:00+01:00', '2026-12-20T09:00:00+01:00']) {
    const d = new Date(iso)
    const attendu = Math.floor(finEssai(d).getTime() / 1000)
    verifier(`Stripe reçoit la fin d'essai de la règle (${iso.slice(0, 10)})`,
      calculerTrialEnd(30, d) === attendu,
      `Stripe ${calculerTrialEnd(30, d)}, règle ${attendu}`)
  }

  // Un timestamp Stripe est en SECONDES. Rendre des millisecondes donnerait un
  // essai jusqu'en l'an 56 000, et Stripe le refuserait à la création.
  const t = calculerTrialEnd(30, new Date('2026-11-01T14:00:00+01:00'))
  verifier('le timestamp Stripe est en secondes, pas en millisecondes',
    t > 1_600_000_000 && t < 2_000_000_000, String(t))

  // `trialDays` est le PLANCHER, pas la durée : pendant le régime de lancement
  // il ne doit RIEN changer, sinon on aurait un compteur par commerçant.
  const aout = new Date('2026-08-20T10:00:00+02:00')
  verifier("pendant le lancement, le plancher ne déplace pas la fin d'essai",
    calculerTrialEnd(30, aout) === calculerTrialEnd(14, aout))
  // Hors lancement, en revanche, il doit compter.
  const mars = new Date('2027-03-15T09:00:00+01:00')
  verifier('hors lancement, le plancher redevient la durée',
    calculerTrialEnd(30, mars) > calculerTrialEnd(14, mars))

  verifier('le régime de lancement est vu comme actif en août 2026',
    isTrialDiffereActif(aout) === true)
  verifier('et comme terminé en mars 2027',
    isTrialDiffereActif(mars) === false)
}

// ═══ 3. LES TEXTES : AUCUNE DATE ÉCRITE EN DUR ═══════════════════════════
// Une date recopiée à la main est une bombe à retardement : elle survit au
// changement de la constante et personne ne la retrouve.
{
  const cibles = [
    ['la landing dévoilée', 'app/components/LandingReveal.js'],
    ['la landing de teasing', 'app/components/LandingTeasing.js'],
    ["la page d'inscription", 'app/signup/page.js'],
    ["l'onglet Abonnement", 'app/dashboard/abonnement/page.js'],
  ]
  for (const [nom, chemin] of cibles) {
    const visible = sansCommentaires(lire(chemin))
    verifier(`${nom} n'annonce plus le 1er septembre`,
      !/1er septembre|<sup>er<\/sup> septembre|>er<\/sup> septembre/.test(visible))
    verifier(`${nom} n'écrit plus « 30 jours » en dur`,
      !/30 jours|essai 30/.test(visible),
      'la durée doit venir de lib/lancement, sinon elle survivra au changement de règle')
  }

  // Et elles doivent bel et bien LIRE la source unique. Une page qui ne
  // contient plus la vieille date mais n'importe pas la nouvelle est une page
  // qui a simplement perdu l'information.
  for (const [nom, chemin] of cibles) {
    verifier(`${nom} lit lib/lancement`,
      /from '@\/lib\/lancement'/.test(lire(chemin)))
  }

  // La landing doit dire la date de fin de gratuité : c'est l'argument.
  const reveal = sansCommentaires(lire('app/components/LandingReveal.js'))
  verifier('la landing annonce la fin de gratuité',
    /libelleFinEssaiLancement\(\)/.test(reveal))
  verifier("la landing annonce la date d'ouverture",
    /libelleLancement\(\)/.test(reveal))

  // L'inscription doit dire le NOMBRE de jours restants : c'est ce qui crée
  // l'urgence sans qu'on ait à l'expliquer.
  //
  // ⚠️ On COMPTE les endroits, on ne se contente pas de trouver le mot une
  // fois. Première version de cette garde : `/joursOfferts\(\)/.test(...)`.
  // Mesurée par mutation, elle était MUETTE — le compte retiré du bandeau
  // d'accueil la laissait verte, parce que le récapitulatif de la dernière
  // étape en gardait un. Trouver un mot ne prouve rien sur les FRÈRES.
  const signup = sansCommentaires(lire('app/signup/page.js'))
  const compteJours = (signup.match(/joursOfferts\(\)/g) || []).length
  verifier("l'inscription chiffre les jours offerts aux deux endroits",
    compteJours >= 2,
    `${compteJours} endroit(s) : il en faut un au bandeau d'accueil ET un au récapitulatif`)
  const compteRegime = (signup.match(/estRegimeLancement\(\)/g) || []).length
  verifier("les trois blocs de l'inscription basculent avec le régime",
    compteRegime >= 3,
    `${compteRegime} bloc(s) : bandeau, récapitulatif et pastille de formule`)
}

// ═══ 4. LES CGU, TEXTE CONTRACTUEL ═══════════════════════════════════════
// Elles ne décrivent pas une intention : elles doivent décrire ce que le code
// FAIT, avec sa convention de décompte, sinon un litige se tranche contre nous.
{
  const cgu = sansCommentaires(lire('app/legal/page.js'))
  verifier('les CGU nomment la date de fin de gratuité',
    /8 janvier 2027/.test(cgu))
  verifier('les CGU énoncent la règle des deux dates',
    /plus tardive/.test(cgu))
  verifier('les CGU nomment le plancher de trente jours',
    /trente \(30\) jours/.test(cgu))
  verifier('les CGU disent la convention de décompte',
    /veille de la date de fin/.test(cgu),
    'sans elle, 68 ou 69 jours est indécidable et le contrat est muet')
  verifier('les CGU donnent un exemple chiffré vérifiable',
    /68 journées/.test(cgu))
  verifier("les CGU ne promettent plus un essai qui démarre au 1er septembre",
    !/1er septembre 2026/.test(cgu))
  verifier("les CGU disent qu'aucune carte n'est exigée",
    /Aucun moyen de paiement n&rsquo;est exigé|sans carte de paiement/.test(cgu))

  // ⚠️ Le chiffre du contrat doit être CELUI DU CODE. C'est la garde qui
  // rattrape une règle changée sans que l'exemple des CGU suive.
  const exemple = joursOfferts(new Date('2026-11-01T12:00:00+01:00'))
  verifier("l'exemple des CGU correspond au calcul réel",
    new RegExp(`${exemple} journées`).test(cgu),
    `le code rend ${exemple} journées pour une inscription au 1er novembre`)
}

// ═══ 5. LE BALISAGE GOOGLE ═══════════════════════════════════════════════
// On l'EXÉCUTE et on lit ce qui en sort. Un balisage se casse en silence :
// il n'a aucun rendu visible, et une virgule de trop suffit à ce que Google
// jette le bloc entier sans rien dire.
{
  const graphe = jsonLdLanding(new Date('2026-08-20T10:00:00+02:00'))
  verifier('le balisage déclare son contexte schema.org',
    graphe['@context'] === 'https://schema.org')
  verifier('le balisage est un graphe, pas une entité isolée',
    Array.isArray(graphe['@graph']) && graphe['@graph'].length >= 4)

  const parType = Object.fromEntries(graphe['@graph'].map(n => [n['@type'], n]))
  for (const t of ['Organization', 'WebSite', 'MobileApplication', 'Service']) {
    verifier(`le balisage décrit ${t}`, !!parType[t])
  }

  // L'éditeur : ce sont ces valeurs que Google recoupera avec /legal.
  verifier("l'éditeur porte le numéro de TVA",
    parType.Organization?.vatID === 'BE0731.637.148')
  verifier("l'éditeur porte l'adresse du siège",
    parType.Organization?.address?.postalCode === '5640')
  verifier("l'éditeur nomme la société qui édite",
    parType.Organization?.legalName === 'Avcotech SRL')

  // ⚠️ LE POINT QUI COMPTE : les prix balisés doivent être ceux des cartes
  // affichées. Un prix recopié dérive au premier changement de tarif, et
  // Google se met alors à annoncer un tarif que la page ne pratique plus.
  const offres = parType.Service?.hasOfferCatalog?.itemListElement || []
  verifier('les trois formules sont balisées', offres.length === 3, `${offres.length} trouvée(s)`)
  for (const plan of ['exister', 'communiquer', 'vendre']) {
    const attendu = getPrixPlan(plan).mensuel.toFixed(2)
    const offre = offres.find(o => o['@id'].endsWith(`#offre-${plan}`))
    verifier(`le prix balisé de ${plan} est celui de lib/plans`,
      offre?.price === attendu, `balisé ${offre?.price}, réel ${attendu}`)
    verifier(`${plan} déclare sa périodicité mensuelle`,
      offre?.priceSpecification?.unitCode === 'MON',
      'sans elle, Google lit un prix d\'achat unique et non un abonnement')
    verifier(`${plan} déclare que le prix est hors TVA`,
      offre?.valueAddedTaxIncluded === false)
    verifier(`${plan} est en euros`, offre?.priceCurrency === 'EUR')
  }

  // La gratuité de lancement doit apparaître sur les formules PAYANTES
  // uniquement : la baliser sur Exister, déjà gratuite, serait absurde.
  const payantes = offres.filter(o => parseFloat(o.price) > 0)
  for (const o of payantes) {
    verifier(`${o.name} annonce la gratuité de lancement`,
      /8 janvier 2027/.test(o.description))
    verifier(`${o.name} borne la validité du prix`,
      o.priceValidUntil === '2027-01-08')
  }
  const gratuite = offres.find(o => parseFloat(o.price) === 0)
  verifier("la formule gratuite ne parle pas d'une gratuité de lancement",
    !/8 janvier/.test(gratuite?.description || ''),
    'elle est déjà gratuite à vie, l\'offre n\'a aucun sens pour elle')

  // Hors régime de lancement, plus aucune mention : le balisage doit se
  // périmer tout seul, comme le reste.
  const plusTard = jsonLdLanding(new Date('2027-06-01T10:00:00+02:00'))
  const offresTard = plusTard['@graph'].find(n => n['@type'] === 'Service').hasOfferCatalog.itemListElement
  verifier("passé la gratuité, le balisage ne la promet plus",
    !offresTard.some(o => /8 janvier 2027/.test(o.description)))
  verifier('et ne borne plus la validité des prix',
    !offresTard.some(o => o.priceValidUntil))

  // La sérialisation. Deux façons de tout casser d'un coup.
  const texte = jsonLdLandingString(new Date('2026-08-20T10:00:00+02:00'))
  let relu = null
  try { relu = JSON.parse(texte.replace(/\\u003c/g, '<')) } catch { relu = null }
  verifier('le balisage sérialisé est un JSON valide', relu !== null)

  // ⚠️ L'échappement, éprouvé sur une charge qui contient VRAIMENT une balise.
  // Le vérifier sur le graphe réel ne prouverait rien : il n'y a aucun « < »
  // dedans, donc la garde serait verte même sans échappement du tout.
  const piege = echapperJsonLd({ texte: '</script><img src=x onerror=alert(1)>' })
  verifier("l'échappement neutralise un « < » capable de fermer le script",
    !piege.includes('<') && piege.includes('\\u003c'),
    'sans lui, un texte contenant une balise injecterait du HTML dans la page')
  verifier("et le JSON reste relisible une fois déséchappé",
    JSON.parse(piege.replace(/\\u003c/g, '<')).texte.startsWith('</script>'))
  verifier("la sortie réelle passe par le même échappement",
    texte === echapperJsonLd(graphe))

  // Et il doit être POSÉ sur la page. Un balisage parfait dans un fichier que
  // personne n'importe ne référence rien du tout : c'est exactement la forme
  // du défaut de l'onboarding, vivant et jamais affiché.
  const home = lire('app/page.tsx')
  verifier('la page d\'accueil pose le balisage',
    /application\/ld\+json/.test(home) && /jsonLdLandingString/.test(home))
  verifier("la page d'accueil autorise Google à l'indexer",
    /index: true/.test(home),
    'le site entier est en noindex tant que le catalogue contient des commerces de test')
  verifier("la page d'accueil déclare son adresse canonique",
    /canonical: 'https:\/\/www\.yoppaa\.app'/.test(home))
  verifier('le balisage vise bien le domaine www',
    SITE_URL === 'https://www.yoppaa.app')

  // ⚠️ LE MAILLON INVISIBLE. Tant que le catalogue contient des commerces de
  // test, le site entier est fermé aux robots. La landing est ouverte par
  // EXCEPTION dans robots.txt. Si cette exception saute, le balisage reste
  // parfait, la page reste belle, et Google n'a plus le droit de la lire :
  // rien, absolument rien à l'écran ne le dira.
  const regles = robots().rules
  const permis = [].concat(regles.allow || [])
  verifier("le robots.txt laisse Googlebot lire l'accueil",
    permis.includes('/$') || regles.allow === '/',
    'sans cette exception, le balisage ne sera jamais lu')
  verifier('le robots.txt laisse lire les pages légales',
    permis.includes('/legal') || regles.allow === '/')
  verifier('le robots.txt laisse télécharger le sitemap',
    permis.includes('/sitemap.xml') || regles.allow === '/',
    'un sitemap interdit remonte en « Impossible de récupérer » dans la Search Console')
  verifier("le robots.txt laisse lire le logo cité par le balisage",
    permis.includes('/og-share.png') || regles.allow === '/',
    "l'image d'une Organization non téléchargeable est ignorée par Google")
  verifier('le robots.txt annonce le sitemap',
    robots().sitemap === `${SITE_URL}/sitemap.xml`)
}

// ═══ 6. CE QUE LA LANDING PROMET, ET À QUI ═══════════════════════════════
// Trois demandes d'Alex du 20/08, et chacune corrige un contresens réel.
{
  const brut = lire('app/components/LandingReveal.js')
  const reveal = sansCommentaires(brut)

  // ⚠️ On DÉCOUPE le hero avant d'y chercher quoi que ce soit.
  // Première version : la garde « l'offre apparaît dès le hero » cherchait la
  // phrase dans TOUT le fichier. Mesurée par mutation, elle était MUETTE : la
  // même phrase existe dans l'appel final, tout en bas de page, et suffisait à
  // la satisfaire. Chercher au bon endroit, pas seulement chercher.
  // Le découpage se fait sur le SOURCE BRUT : les repères de section sont des
  // commentaires JSX, que `sansCommentaires` efface.
  const hero = sansCommentaires(
    brut.slice(brut.indexOf('1. HERO REVEAL'), brut.indexOf('2. MANIFESTO')))
  verifier('le repère du hero est bien trouvé dans le source',
    hero.length > 500, `${hero.length} caractères découpés`)

  // a) Le hero parle aux COMMERÇANTS. Les habitants arrivent par leur
  //    commerçant : c'est lui qu'il faut accrocher en trois secondes.
  verifier('le titre du hero s\'adresse au commerçant',
    /Ton commerce,<br\/>dans la poche de ton quartier/.test(reveal),
    'il disait « Ton quartier dans ta poche », donc il parlait à l\'habitant')
  verifier('le premier bouton du hero est celui du commerçant',
    reveal.indexOf("allerAuForm('commercant')") < reveal.indexOf("allerAuForm('yopper')"),
    'le bouton Yopper passait devant')

  // b) ⚠️ LE CONTRESENS LE PLUS COÛTEUX : la page invitait à ATTENDRE le
  //    1er octobre, alors qu'arriver tôt est tout l'intérêt de l'offre.
  verifier('le hero dit que le lancement est OFFICIEL, pas le départ',
    /Lancement officiel le \{libelleLancement\(\)\}/.test(reveal))
  verifier("le hero dit qu'on n'a pas à attendre pour commencer",
    /Pas besoin de l&rsquo;attendre pour commencer/.test(reveal))
  verifier("l'appel final n'invite plus à attendre",
    !/Rendez-vous le \{libelleLancement\(\)\}\./.test(reveal),
    '« Rendez-vous le 1er octobre » disait le contraire de tout le reste')

  // c) L'offre est VISIBLE : un bloc à elle, et monté pour de bon. Écrire un
  //    composant que personne n'affiche est le défaut de l'onboarding, vivant
  //    et jamais vu par quiconque.
  verifier("l'offre a son propre bloc",
    /function EncartOffreLancement/.test(reveal))
  // ⚠️ `[\s/>]` et pas seulement le nom : sans la frontière, un composant
  // renommé « EncartOffreLancementAutreChose » satisfaisait la garde.
  verifier("et ce bloc est MONTÉ dans la page",
    /<EncartOffreLancement[\s/>]/.test(reveal),
    'un composant jamais monté est du code mort qui a l\'air vivant')
  verifier("l'offre apparaît DANS LE HERO, pas seulement en bas de page",
    /\{joursOfferts\(\)\} jours offerts/.test(hero))
  verifier('et le hero nomme la date de fin de gratuité',
    /libelleFinEssaiLancement\(\)/.test(hero))
  verifier("le bloc compare avec ce qu'on toucherait en attendant",
    /joursOffertsAuLancement\(\)/.test(reveal),
    'sans la comparaison, « dépêche-toi » n\'est qu\'une injonction')

  // La comparaison, EXÉCUTÉE. C'est elle qui porte l'urgence.
  const auLancement = joursOffertsAuLancement()
  verifier("attendre le lancement coûte vraiment des jours",
    auLancement < joursOfferts(), `${joursOfferts()} aujourd'hui contre ${auLancement} au lancement`)
  verifier('et même en attendant, le plancher reste tenu',
    auLancement >= ESSAI_JOURS_MINIMUM, `${auLancement} jours`)

  // d) Les réseaux sociaux, une seule source pour trois surfaces.
  verifier("l'adresse Facebook est celle de la page Yoppaa",
    FACEBOOK_URL === 'https://www.facebook.com/yoppaaapp/', FACEBOOK_URL)
  verifier('la landing affiche le lien Facebook',
    /FACEBOOK_URL/.test(reveal) && /RESEAUX\.map/.test(reveal))
  verifier("le balisage relie la page Facebook à l'entreprise",
    (jsonLdLanding()['@graph'].find(n => n['@type'] === 'Organization').sameAs || []).includes(FACEBOOK_URL),
    'sans `sameAs`, Google voit deux entités qui ne se connaissent pas')
  verifier("aucune adresse de réseau n'est recopiée dans la landing",
    !/facebook\.com/.test(reveal),
    'elle doit venir de lib/reseaux, sinon une des copies pointera un jour dans le vide')
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Offre de lancement et balisage verts.')
