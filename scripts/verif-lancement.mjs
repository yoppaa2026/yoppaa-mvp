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

import { readFileSync, existsSync } from 'node:fs'
import {
  finEssai, joursOfferts, joursOffertsAuLancement, joursAvance, estRegimeLancement, phraseEssai,
  libelleLancement, libelleFinEssaiLancement, libelleDernierJourGratuit,
  progressionVersLancement,
  LAUNCH_DATE_ISO, FIN_ESSAI_LANCEMENT_ISO, ESSAI_JOURS_MINIMUM,
} from '../lib/lancement.js'
import { calculerTrialEnd, isTrialDiffereActif } from '../lib/stripe-billing.js'
import { jsonLdLanding, jsonLdLandingString, echapperJsonLd, SITE_URL } from '../lib/seo-landing.js'
import { getPrixPlan } from '../lib/plans.js'
import robots from '../app/robots.js'
import { FACEBOOK_URL, INSTAGRAM_URL, RESEAUX_URLS } from '../lib/reseaux.js'
import { LIBELLE_COMMERCANT, LIBELLE_HABITANT } from '../lib/libelles-audience.js'

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
    { nom: 'inscrit en août 2026',   le: '2026-08-20T10:00:00+02:00', fin: '2027-01-09', jours: 142, lancement: true },
    { nom: "inscrit le jour de l'ouverture", le: '2026-10-01T10:00:00+02:00', fin: '2027-01-09', jours: 100, lancement: true },
    { nom: 'inscrit le 1er nov.',    le: '2026-11-01T14:00:00+01:00', fin: '2027-01-09', jours: 69,  lancement: true },
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
  verifier("le libellé de facturation dit « 9 janvier 2027 »",
    libelleFinEssaiLancement() === '9 janvier 2027',
    libelleFinEssaiLancement())
  verifier('la phrase de vente annonce les 100 jours et leur point de départ',
    phraseEssai(jour('2026-08-20T10:00:00+02:00')) === '100 jours offerts à partir du 1er octobre',
    phraseEssai(jour('2026-08-20T10:00:00+02:00')))
  verifier('et ne chiffre jamais le total avec l\'avance',
    !/14[0-9] jours/.test(phraseEssai(jour('2026-08-20T10:00:00+02:00'))))
  verifier("et hors régime de lancement elle retombe sur l'essai normal",
    phraseEssai(jour('2027-06-01T10:00:00+02:00')) === "30 jours d'essai gratuit",
    phraseEssai(jour('2027-06-01T10:00:00+02:00')))

  // Les deux constantes elles-mêmes.
  verifier("l'ouverture publique est bien au 1er octobre 2026",
    LAUNCH_DATE_ISO.startsWith('2026-10-01'), LAUNCH_DATE_ISO)
  verifier('la première facture de lancement tombe bien le 9 janvier 2027',
    FIN_ESSAI_LANCEMENT_ISO.startsWith('2027-01-09'), FIN_ESSAI_LANCEMENT_ISO)

  // ⚠️ LA PROMESSE PUBLIQUE, REFAITE PAR L'ADDITION.
  // « 100 jours à partir du 1er octobre » n'est écrit nulle part : il découle
  // des deux dates. Si l'une bouge sans l'autre, ce nombre devient 97 ou 103 et
  // toute la communication ment sans que rien ne le signale.
  verifier("les 100 jours promis tombent juste depuis les deux dates",
    joursOffertsAuLancement() === 100, `${joursOffertsAuLancement()} jours`)
  verifier('le dernier jour gratuit est la veille de la facture',
    libelleDernierJourGratuit() === '8 janvier 2027', libelleDernierJourGratuit())
  verifier('les deux libellés ne se confondent pas',
    libelleDernierJourGratuit() !== libelleFinEssaiLancement(),
    'écrire « offert jusqu\'au 9 janvier » serait faux d\'une journée')

  // L'avance, et l'addition qui la rend crédible : 42 + 100 = 142.
  const aout = jour('2026-08-20T10:00:00+02:00')
  verifier("l'avance plus les 100 jours donne bien le total annoncé",
    joursAvance(aout) + joursOffertsAuLancement() === joursOfferts(aout),
    `${joursAvance(aout)} + ${joursOffertsAuLancement()} ≠ ${joursOfferts(aout)}`)
  verifier("l'avance est nulle une fois l'ouverture passée",
    joursAvance(jour('2026-11-01T14:00:00+01:00')) === 0)
  verifier("l'avance ne compte pas les jours d'une date invalide",
    joursAvance(new Date('pas une date')) === 0)
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
  verifier('la landing annonce le dernier jour gratuit',
    /libelleDernierJourGratuit\(\)/.test(reveal))
  verifier("la landing n'annonce PAS la date de facturation comme une gratuité",
    !/offertes? jusqu&rsquo;au \{libelleFinEssaiLancement/.test(reveal),
    'ce serait faux d\'une journée')
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
  verifier("l'inscription annonce les 100 jours",
    /joursOffertsAuLancement\(\)/.test(signup))
  verifier("et ne chiffre pas non plus le total avec l'avance",
    !/joursOfferts\(\)/.test(signup),
    'un seul chiffre partout : 100')
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
  // ⚠️ On COMPTE : les CGU énoncent la gratuité à deux endroits, la règle
  // générale et le cas de celui qui arrive après l'ouverture. N'en contrôler
  // qu'une laissait l'autre virer au 9 janvier sans que rien ne bouge.
  // Mesurée par mutation : MUETTE.
  const finsGratuites = (cgu.match(/8 janvier 2027 inclus/g) || []).length
  verifier('les CGU nomment le dernier jour gratuit aux deux endroits',
    finsGratuites >= 2, `${finsGratuites} mention(s)`)
  verifier("les CGU ne présentent jamais le 9 janvier comme un jour gratuit",
    !/gratuité jusqu&rsquo;au 9 janvier|offert jusqu&rsquo;au 9 janvier/.test(cgu))
  verifier('les CGU nomment la date de la première facture',
    /9 janvier 2027/.test(cgu))
  verifier('les CGU annoncent les cent jours',
    /cent \(100\) jours/.test(cgu))
  verifier("les CGU disent ce que touche celui qui arrive avant l'ouverture",
    /ainsi que des journées séparant sa création/.test(cgu),
    "sans ça, « 100 jours » et « 142 jours » se contredisent noir sur blanc")
  verifier('les CGU énoncent la règle des deux dates',
    /plus tardive/.test(cgu))
  verifier('les CGU nomment le plancher de trente jours',
    /trente \(30\) jours/.test(cgu))
  verifier('les CGU disent la convention de décompte',
    /veille de la date de fin/.test(cgu),
    'sans elle, 68 ou 69 jours est indécidable et le contrat est muet')
  verifier('les CGU donnent un exemple chiffré vérifiable',
    /69 journées/.test(cgu))
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

  // ⚠️ Le balisage doit dire la MÊME chose que la page. « commune par commune »
  // y avait survécu alors que la landing ne le disait plus : trouvé en relisant
  // la page SERVIE, pas la source. Google lit ce texte, les gens aussi.
  const textesBalisage = JSON.stringify(graphe)
  verifier("le balisage ne parle plus d'ouverture commune par commune",
    !/commune par commune/.test(textesBalisage))
  verifier('le balisage dit que la Wallonie est couverte',
    /en Wallonie/.test(textesBalisage))

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
      /8 janvier 2027 inclus/.test(o.description))
    // ⚠️ `priceValidUntil` NE DOIT PAS être posé ici. Je l'y avais mis pour
    // exprimer la fin de la gratuité : contresens. Ce champ dit quand LE PRIX
    // ANNONCÉ expire, or 19,90 €/mois n'expire pas le 9 janvier, il commence.
    // Google aurait affiché une expiration de tarif inexistante.
    verifier(`${o.name} ne prétend pas que son prix expire`,
      o.priceValidUntil === undefined,
      'le prix mensuel ne cesse pas à la fin de l\'essai, il démarre')
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
  // ⚠️ CETTE GARDE COMPARAIT DEUX `allerAuForm`, et le bouton du commerçant a
  // cessé d'en être un le 26/08 : il mène désormais au signup. On compare donc
  // le PREMIER lien d'inscription au bouton habitant, ce qui est la même
  // intention (le commerçant d'abord) sans figer la mécanique du bouton.
  verifier('le premier bouton du hero est celui du commerçant',
    reveal.indexOf('href="/signup"') < reveal.indexOf("allerAuForm('yopper')"),
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
  // ⚠️ LE HERO ANNONCE D'ABORD LES 100 JOURS, la promesse publique, et l'avance
  // ensuite comme un supplément. L'inverse ferait lire « 142 » comme une
  // exagération, ce qu'Alex a signalé le 20/08 : « ça peut être interprété
  // comme mensonger ». Une offre qu'on soupçonne ne convainc personne.
  verifier("le hero annonce les 100 jours garantis, pas le total brut",
    /\{joursOffertsAuLancement\(\)\} jours offerts/.test(hero))
  verifier("le hero rattache les 100 jours à la date d'ouverture",
    /à partir du \{libelleLancement\(\)\}/.test(hero))
  verifier("le hero présente l'avance comme un bonus, en mots",
    /est en bonus/.test(hero))
  verifier("le hero ne chiffre PAS le total avec l'avance",
    !/\{joursOfferts\(\)\}/.test(hero),
    'un seul chiffre sur la page : 100')

  // ⚠️ LE POINT MÉDIAN SÉPARE DES ÉLÉMENTS, IL NE COORDONNE PAS UNE PHRASE.
  // Alex l'a vu sur une capture du hero : « quel que soit le forfait · et tout
  // le temps d'ici là est en bonus ». Une virgule ouvrait la phrase, un point
  // médian la refermait. Les deux autres endroits qui portent déjà cette
  // promesse (« La totale » et le signup) écrivaient la virgule : c'est le
  // hero qui divergeait.
  // La garde porte sur la RÈGLE et pas sur cette phrase-là, sinon elle ne
  // dirait rien du prochain texte écrit dans le même réflexe.
  for (const chemin of ['app/components/LandingReveal.js', 'app/signup/page.js']) {
    verifier(`${chemin} ne fait jamais coordonner le point médian`,
      !/ · (et|mais|donc|car|ou) /.test(sansCommentaires(lire(chemin))),
      'un point médian sépare, une virgule coordonne')
  }

  // ⚠️ AUCUN SECOND NOMBRE, NULLE PART.
  // J'avais retiré le total (142) mais laissé « + 42 jours d'avance » dans la
  // pastille du hero : c'était toujours un second chiffre, et Alex l'a vu à
  // l'écran avant moi. La garde couvre donc les DEUX formes d'affichage, la
  // JSX `{…}` et l'interpolation `${…}` d'un gabarit.
  for (const [quoi, motif] of [
    ['le total', /\{joursOfferts\(\)\}|\$\{joursOfferts\(\)\}/],
    ["l'avance", /\{joursAvance\(\)\}|\$\{joursAvance\(\)\}|\{avance\}|\$\{avance\}/],
  ]) {
    verifier(`${quoi} n'est affiché nulle part sur la landing`,
      !motif.test(reveal),
      'un seul chiffre sur la page, et c\'est 100')
  }
  verifier("mais l'avance reste dite en toutes lettres",
    /est en bonus/.test(reveal))

  // ⚠️ LES DEUX PUBLICS, NOMMÉS D'UNE SEULE FAÇON.
  // La même personne était appelée « Devenir Yopper », « Je suis habitant » et
  // « Je suis curieux » sur la même page : trois occasions de se demander si
  // on est au bon endroit. Les libellés vivent maintenant dans un seul fichier.
  for (const [nom, chemin] of [
    ['la landing dévoilée', 'app/components/LandingReveal.js'],
    ['la landing de teasing', 'app/components/LandingTeasing.js'],
  ]) {
    const src = lire(chemin)
    verifier(`${nom} lit les libellés de public`,
      /from '@\/lib\/libelles-audience'/.test(src))
    const visible = sansCommentaires(src)
    verifier(`${nom} n'écrit plus « Je suis curieux »`,
      !/Je suis curieux/.test(visible))
    verifier(`${nom} n'écrit plus les libellés en dur`,
      !/'Je suis commerçant'|>Je suis habitant</.test(visible))
  }
  verifier("le libellé commerçant énonce le métier sans article",
    LIBELLE_COMMERCANT === 'Je suis commerçant', LIBELLE_COMMERCANT)
  verifier("le libellé habitant explique le mot Yopper",
    /futur Yopper/.test(LIBELLE_HABITANT), LIBELLE_HABITANT)

  // Le drapeau belge est collé au mot suivant s'il n'a pas de marge à droite.
  // ⚠️ Corrigé DANS le composant, donc partout où il est utilisé, plutôt qu'à
  // l'endroit signalé par la capture. Voir feedback_appliquer_partout.
  for (const chemin of ['app/components/LandingReveal.js', 'app/components/LandingTeasing.js']) {
    verifier(`le drapeau belge respire des deux côtés (${chemin.split('/').pop()})`,
      /margin: '0 5px 0 4px', borderRadius: 2/.test(lire(chemin)),
      'sans marge à droite, il se colle au mot suivant')
  }
  // ⚠️ On découpe LE BLOC avant d'y chercher, exactement comme pour le hero.
  // Sans ce découpage, la garde trouvait `joursOffertsAuLancement()` ailleurs
  // dans le fichier et restait verte alors que l'addition avait disparu du
  // bloc. Mesurée par mutation : MUETTE.
  const encart = brut.slice(brut.indexOf('function EncartOffreLancement'),
    brut.indexOf('// Incitant mobilisation'))
  verifier("le bloc de l'offre est bien découpé", encart.length > 800, `${encart.length} caractères`)
  verifier("le bloc pose les 100 jours garantis",
    /joursOffertsAuLancement\(\)/.test(encart))

  // ⚠️ UN SEUL CHIFFRE SUR TOUTE LA PAGE (décision Alex, 20/08) :
  // « je ne veux pas qu'on annonce un chiffre en plus des 100 jours, tu es là
  //   plus tôt, génial et c'est bonus ».
  // Un second nombre oblige à poser une addition, et une offre qu'il faut
  // expliquer se fait relire de travers. L'avance se dit en toutes lettres.
  //
  // ⚠️ Cette garde INTERDIT ce que la version précédente EXIGEAIT. C'est
  // volontaire : elle empêche le total chiffré de revenir par mégarde.
  verifier("le bloc ne chiffre PAS le total avec l'avance",
    !/joursOfferts\(\)/.test(encart),
    'le bonus se raconte, il ne se compte pas')
  verifier("le bloc dit quand même que l'avance est un bonus",
    /est en bonus/.test(encart))
  verifier("et qu'elle fond",
    /fond un peu chaque jour/.test(encart))

  // La comparaison, EXÉCUTÉE. C'est elle qui porte l'urgence.
  const auLancement = joursOffertsAuLancement()
  verifier("attendre le lancement coûte vraiment des jours",
    auLancement < joursOfferts(), `${joursOfferts()} aujourd'hui contre ${auLancement} au lancement`)
  verifier('et même en attendant, le plancher reste tenu',
    auLancement >= ESSAI_JOURS_MINIMUM, `${auLancement} jours`)

  // c bis) ⚠️ LA WALLONIE EST OUVERTE (décision Alex du 20/08).
  // Il n'y a plus de seuil de déblocage ni d'activation commune par commune.
  // L'ancien discours demandait au commerçant d'attendre ses voisins pour
  // exister : devenu faux, et décourageant pour rien.
  verifier("la landing n'annonce plus d'ouverture commune par commune",
    !/commune par commune/.test(reveal))
  verifier('la landing ne parle plus de seuil à atteindre',
    !/seuil_preinscrits|pour activer <strong>/.test(reveal))
  verifier("la landing n'affiche plus de jauge de déblocage",
    !/const barre = \(pct\)/.test(reveal),
    'une barre de progression fait croire à une attente qui n\'existe plus')
  verifier('la landing ne fait plus dépendre la préinscription d\'une activation',
    !/fait avancer ta commune|commune s&rsquo;active|vers son activation/.test(reveal))
  verifier('la landing dit que toute la Wallonie est ouverte',
    /Toute la Wallonie/.test(reveal))

  // ⚠️ PLUS AUCUN COMPTE AFFICHÉ. De petits nombres racontent un démarrage, pas
  // un mouvement, et découragent celui qu'ils devraient entraîner.
  verifier("la landing n'affiche plus le nombre de commerçants",
    !/\{com\}<\/strong> commerce|nb_commercants \|\| 0/.test(reveal))
  verifier("la landing n'affiche plus le nombre de curieux",
    !/\{hab\}<\/strong> habitant|nb_yoppers \|\| 0/.test(reveal))

  // Mais le bloc ne reste pas vide : la barre montre le chemin vers
  // l'ouverture. Elle avance seule et se vérifie sur un calendrier.
  verifier('la landing montre la progression vers l\'ouverture',
    /progressionVersLancement\(\)/.test(reveal))
  verifier('et annonce le nombre de jours restants',
    /joursAvantLancement\(\)/.test(reveal) && /J-\{restant\}/.test(reveal))

  // La progression, EXÉCUTÉE : c'est une mesure, pas une décoration.
  const pDebut = progressionVersLancement(new Date('2026-08-01T10:00:00+02:00'))
  const pMilieu = progressionVersLancement(new Date('2026-09-01T12:00:00+02:00'))
  const pVeille = progressionVersLancement(new Date('2026-09-30T12:00:00+02:00'))
  const pApres = progressionVersLancement(new Date('2026-11-01T12:00:00+01:00'))
  verifier('la barre part de zéro le jour de l\'annonce', pDebut === 0, `${pDebut}%`)
  verifier('elle avance vraiment entre l\'annonce et l\'ouverture',
    pDebut < pMilieu && pMilieu < pVeille, `${pDebut} puis ${pMilieu} puis ${pVeille}`)
  verifier('elle est pleine une fois l\'ouverture passée', pApres === 100, `${pApres}%`)
  verifier('elle ne dépasse jamais cent', pApres <= 100 && pVeille <= 100)
  verifier('elle avance assez pour se voir bouger d\'un jour à l\'autre',
    pVeille - pMilieu >= 30, `${pVeille - pMilieu} points sur le dernier mois`)
  verifier('et le dit sans ambiguïté sur ce qui a disparu',
    /pas de seuil à atteindre/.test(reveal))

  // c ter) LA FENÊTRE « TRIBU » (demandée par Alex le 20/08).
  // Elle répond aux trois objections d'un commerçant qui hésite. Écrite mais
  // jamais montée, elle serait exactement le défaut de l'onboarding : du code
  // vivant que personne ne voit.
  const tribu = brut.slice(brut.indexOf('function FenetreTribu'),
    brut.indexOf('// Incitant mobilisation'))
  verifier('la fenêtre tribu est bien découpée', tribu.length > 800, `${tribu.length} caractères`)
  verifier('la fenêtre tribu est MONTÉE dans la page',
    /<FenetreTribu[\s/>]/.test(reveal))
  verifier("elle pose la question de la tribu",
    /Tu rejoins la tribu \?/.test(tribu))
  verifier("elle annonce les 100 jours, et pas un autre chiffre",
    /\{joursOffertsAuLancement\(\)\} jours offerts/.test(tribu) && !/joursOfferts\(\)/.test(tribu))
  verifier('elle répond « zéro contrat, zéro engagement »',
    /Zéro contrat, zéro engagement/.test(tribu))
  verifier("elle rappelle qu'Exister est gratuit à vie",
    /Exister est gratuit à vie/.test(tribu),
    "c'est la réponse à « et si je veux juste rester visible »")
  verifier("elle a une VRAIE croix de fermeture",
    /aria-label="Fermer"/.test(tribu))
  verifier('et le refus est retenu pour la session',
    /sessionStorage\.setItem\('yoppaa_tribu_fermee'/.test(tribu),
    'une fenêtre qui revient à chaque écran se fait fermer sans être lue')
  verifier("le drapeau écrit est bien celui qui est LU",
    /sessionStorage\.getItem\('yoppaa_tribu_fermee'\)/.test(tribu),
    'écrire une valeur que personne ne relit est du code mort qui a l\'air vivant')
  verifier("elle ne surgit pas dès la première seconde",
    /setTimeout\(\(\) => setVisible\(true\), 9000\)/.test(tribu))
  verifier("elle se tait quand le formulaire est déjà envoyé",
    /masquer=\{statut\.envoi === 'ok'\}/.test(reveal),
    'la proposer à quelqu\'un qui vient de s\'inscrire, c\'est lui dire qu\'on ne l\'a pas vu')
  verifier("elle n'utilise aucun flou, qui gèle le défilement iPhone",
    !/blur\(/.test(tribu))
  verifier("elle mesure en dvh, jamais en vh",
    !/[^d]vh\b/.test(tribu))

  // d) Les réseaux sociaux, une seule source pour trois surfaces.
  verifier("l'adresse Facebook est celle de la page Yoppaa",
    FACEBOOK_URL === 'https://www.facebook.com/yoppaaapp/', FACEBOOK_URL)
  // ⚠️ CETTE GARDE EXIGEAIT `FACEBOOK_URL` DANS LA PAGE, donc la seule forme
  // qui existait le jour où elle a été écrite. Le 26/08, le hero est passé à
  // la liste complète pour afficher Instagram : la constante a disparu du
  // fichier et la garde a refusé une amélioration juste. Verrouillage de forme,
  // le quatrième de la journée.
  //
  // Ce qu'il faut protéger n'est pas le nom d'une constante : c'est que la
  // landing affiche TOUS les réseaux de la liste, et qu'elle les affiche DEUX
  // fois — dans le hero, où Alex recrute, et dans le pied de page.
  const blocsReseaux = reveal.split('RESEAUX.map').length - 1
  verifier('la landing affiche les réseaux dans le hero ET dans le pied',
    blocsReseaux >= 2, `${blocsReseaux} bloc(s)`)
  // ⚠️ INSTAGRAM AUSSI, depuis le 26/08. Le compte s'écrit `yoppaa.app`, avec
  // un point : un profil recopié de travers pointe dans le vide, et Google
  // range alors l'entreprise et le compte comme deux entités étrangères.
  verifier("l'adresse Instagram est celle du compte Yoppaa",
    INSTAGRAM_URL === 'https://www.instagram.com/yoppaa.app/', INSTAGRAM_URL)
  verifier('les deux réseaux sont publiés ensemble',
    RESEAUX_URLS.includes(FACEBOOK_URL) && RESEAUX_URLS.includes(INSTAGRAM_URL),
    RESEAUX_URLS.join(' | '))
  verifier("le balisage relie Instagram à l'entreprise aussi",
    (jsonLdLanding()['@graph'].find(n => n['@type'] === 'Organization').sameAs || []).includes(INSTAGRAM_URL))
  verifier("le balisage relie la page Facebook à l'entreprise",
    (jsonLdLanding()['@graph'].find(n => n['@type'] === 'Organization').sameAs || []).includes(FACEBOOK_URL),
    'sans `sameAs`, Google voit deux entités qui ne se connaissent pas')
  verifier("aucune adresse de réseau n'est recopiée dans la landing",
    !/facebook\.com/.test(reveal),
    'elle doit venir de lib/reseaux, sinon une des copies pointera un jour dans le vide')
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 LE COMMERÇANT DOIT POUVOIR S'INSCRIRE DEPUIS LA LANDING (26/08)
// ═══════════════════════════════════════════════════════════════════════════
//
// Toute la page lui parle : mockups de son tableau de bord, formules, réponse
// à ses trois objections. Puis il arrivait en bas et le SEUL geste disponible
// était de laisser son email dans une liste d'attente destinée aux habitants.
// Aucun lien vers /signup n'existait nulle part. Ce n'étaient pas les
// publications d'Alex qui manquaient de force : elles menaient à un cul-de-sac.
{
  const reveal = readFileSync('app/components/LandingReveal.js', 'utf8')

  // ⚠️ DEUX BOUTONS, PAS UN. Celui de la section des formules attrape le
  // commerçant au moment où il vient de lire les prix, c'est-à-dire au moment
  // où il décide. Compter les occurrences, sinon retirer l'un des deux
  // laisserait la garde verte sur l'autre : cinq fois aujourd'hui.
  // ⚠️ TROIS, PAS DEUX. Le bouton d'en-tête, celui de la section des formules,
  // et celui du bloc final. Le premier FAISAIT DÉFILER vers le formulaire des
  // habitants : le commerçant le plus décidé, celui qui clique dès l'arrivée,
  // était le plus mal servi. Trouvé par une mutation du banc, pas à la
  // relecture.
  const liens = reveal.split('href="/signup"').length - 1
  verifier('les trois boutons commerçant mènent au signup',
    liens >= 3, `${liens} lien(s) trouvé(s)`)
  verifier("et aucun ne fait plus défiler le commerçant vers le formulaire",
    !/allerAuForm\('commercant'\)/.test(reveal))
  verifier('et le bouton dit le geste, pas la destination',
    /J&rsquo;inscris mon commerce/.test(reveal))

  // ⚠️ LE COMPTE DE JOURS N'EST JAMAIS ÉCRIT EN DUR. « 100 » est calculé depuis
  // les deux dates : tapé à la main, il deviendrait un mensonge daté.
  //
  // ⚠️ ET L'AVANCE SE DIT EN MOTS, JAMAIS EN CHIFFRE. Décision d'Alex du
  // 20/08, déjà gardée plus haut : un second nombre sur la page, même exact,
  // « peut être interprété comme mensonger ». J'ai enfreint cette règle en
  // écrivant le bloc ci-dessous, et c'est cette garde-là qui m'a arrêté.
  //
  // ⚠️ GARDE RETIRÉE, PAS RAFISTOLÉE. J'avais écrit ici une vérification qui
  // découpait « les 140 caractères après la phrase » pour y chercher un
  // chiffre : c'est exactement LA FENÊTRE DE N CARACTÈRES QUI LIT CHEZ LE
  // VOISIN, piège déjà consigné le 15/08. Elle a rougi dès qu'un second bloc a
  // porté la même phrase, sans qu'aucune règle ne soit enfreinte.
  //
  // Et elle était redondante : la garde du 20/08, quelques lignes plus haut,
  // interdit DÉJÀ `{joursAvance()}` partout dans la landing, ce qui est la
  // vraie règle d'Alex (un seul chiffre sur la page). Deux gardes pour une
  // règle, dont une fragile, c'est une de trop.
  const blocsJours = reveal.split('{joursOffertsAuLancement()} jours offerts à partir du {libelleLancement()}').length - 1
  verifier('les jours offerts restent calculés partout où ils sont dits',
    blocsJours >= 2, `${blocsJours} bloc(s)`)

  // ⚠️ UN SEUL GESTE PAR PUBLIC (Alex, 26/08 : « le commerçant ne sait pas où
  // il doit s'inscrire »). Le formulaire de préinscription proposait EN PLUS
  // « Je suis commerçant » : le commerçant y laissait son email et repartait
  // sans compte, en croyant s'être inscrit. Deux chemins pour le même
  // visiteur, dont un qui ne mène nulle part.
  verifier('le formulaire ne redemande plus qui tu es',
    !/type_utilisateur: opt\.val/.test(reveal),
    'le sélecteur habitant/commerçant ouvrait un second chemin au commerçant')
  verifier('et il ne réclame plus le nom d\'un commerce',
    !/required=\{form\.type_utilisateur === 'commercant'\}/.test(reveal))
  // ⚠️ ET AUCUN APPELANT NE PEUT LE REMETTRE DANS CET ÉTAT : sans champ pour
  // le nom du commerce, un formulaire en mode « commercant » serait invalide
  // sans que rien ne le dise.
  verifier('aucun lien ne peut basculer le formulaire en mode commerçant',
    /if \(typeUtilisateur === 'yopper'\)/.test(reveal))
  // Les deux publics sont ANNONCÉS, chacun au-dessus de son geste.
  verifier('chaque public est nommé au-dessus de son propre geste',
    /\{LIBELLE_COMMERCANT\}/.test(reveal) && /\{LIBELLE_HABITANT\}/.test(reveal))

  // L'adresse courte des publications Facebook et Instagram.
  const pro = readFileSync('app/pro/page.tsx', 'utf8')
  verifier('/pro existe et mène à l\'inscription', /redirect\('\/signup\?via=pro'\)/.test(pro))
  // ⚠️ UN `href` EST UNE CHAÎNE, RIEN NE LE VOIT. La cible doit exister sur le
  // disque, sinon le lien le plus visible de la page mène à un 404.
  verifier('et la page d\'inscription existe vraiment',
    existsSync('app/signup/page.js') || existsSync('app/signup/page.tsx'))
}

console.log(`\n${ok} vérifications passées, ${ko} en échec.`)
if (ko > 0) {
  console.log('\nÉCHECS :')
  echecs.forEach(e => console.log('  ✕ ' + e))
  process.exit(1)
}
console.log('Offre de lancement et balisage verts.')
