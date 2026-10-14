'use client'
// ════════════════════════════════════════════════════════════════════
// LE KIT COMMERÇANT — A4 recto/verso à plastifier, et la carte de visite.
//
// URL : yoppaa.app/brand-kit/commercant
//
// ⚠️ POURQUOI DANS L'APP ET PLUS DANS UNE MAQUETTE À CÔTÉ. La maquette
// s'affichait dans une police de SUBSTITUTION, Plus Jakarta Sans n'étant pas
// embarquable ailleurs. Or Jakarta est étroite : régler des césures et des
// hauteurs contre une police plus large, c'est régler contre le mauvais
// rendu. Ici, la police est la vraie, le logo est le vrai composant, et le QR
// est produit par la même bibliothèque que celui du tableau de bord.
//
// ⚠️ ET LE LOGO N'EST PAS REDESSINÉ : `<YoppaaLogo>` porte les proportions de
// `lib/logo.js`. Le recopier ici aurait donné un troisième jeu de mesures,
// exactement le défaut que ce fichier a fini par régler.
//
// IMPRESSION : Ctrl+P, A4 portrait, marges nulles, arrière-plans cochés.
//
// 🔥 REFONTE DU 14/10, SUR LA BASE DE LA LANDING V2. Décision d'Alex au
// tableau : UNE BASE COMMUNE + UN RECTO PAR SEGMENT (alimentaire à emporter,
// restaurant, services sur rendez-vous, détail). Le recto parle le métier de
// celui devant qui Alex se tient ; le verso (offre, formules, engagement, « On
// t'appelle ») est le même pour tous. Une seule page, un réglage de segment :
// une correction de la base vaut pour les quatre feuilles, aucune copie ne
// diverge. Le QR porte le segment (`?via=kit-…`) : on saura quelle feuille
// convertit.
//
// 🔴 CE QUI A ÉTÉ RETIRÉ, ET POURQUOI. « La place de marché du commerce local
// belge » (formule abandonnée, erreur n° 3 du brief de la landing) ; « la
// gazette chaque matin » sans dire qu'en Exister c'est chaque semaine (erreur
// n° 1) ; « ta fiche est prête en cinq minutes » (un délai de plus, qu'aucun
// écran ne tient) ; des comptes d'habitants (« 3 habitants ont voulu… ») qui
// n'étaient pas présentés comme des exemples ; et sur la CARTE DE VISITE,
// « Gratuit jusqu'au 8 janvier 2027 », faux depuis les 100 jours permanents
// et oublié le matin même (frère non traité).
// ════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from 'react'
import YoppaaLogo from '@/app/components/YoppaaLogo'
import { verdictJauge, TEINTES_JAUGE, PX_MM } from '@/lib/jauge-page'
import { feuilleEnSvg, svgEnPng, feuillesEnPdf, telecharger, DPI_IMPRESSION } from '@/lib/export-feuille'
// ⚠️ LES TARIFS NE SONT PAS RECOPIÉS ICI. `getPrixPlan` les lit dans
// `lib/plans.js`, où ils sont paramétrables par variable d'environnement. Un
// prix écrit en dur sur un papier plastifié ne se corrige plus.
import { getPrixPlan } from '@/lib/plans'
import { euros } from '@/lib/montants'
import { ESSAI_JOURS_MINIMUM } from '@/lib/lancement'
// WhatsApp, le téléphone de l'entreprise et l'encodage offert : la même source
// que la landing (`lib/contact.js`).
import { TELEPHONE_AFFICHE, ENCODAGE_OFFERT } from '@/lib/contact'

// ⚠️ LA DESTINATION DU QR EST UNE DÉCISION, PAS UN DÉTAIL.
//
// Pas `/pro` : cette route n'est pas une page, c'est un `redirect` vers le
// formulaire d'inscription. Un commerçant qui scanne entre deux clients veut
// REGARDER, pas saisir ses coordonnées. `/pro` reste l'adresse ÉCRITE sur la
// carte, courte et dictable, pour celui qui se décide plus tard et la tape.
//
// L'ancre `#commercants`, gardée par `verif:lancement`, est le haut de la
// landing v2, qui parle au commerçant. ⚠️ 14/10 : le `via` porte le SEGMENT de
// la feuille, pour savoir laquelle fait venir.
const urlQr = (via) => `https://www.yoppaa.app/?via=${via}#commercants`

// ─── LES QUATRE RECTOS (Alex, 14/10) ─────────────────────────────────────────
//
// ⚠️ ON PIQUE LE MODÈLE, JAMAIS UN NOM (décision d'Alex, comme la landing).
// ⚠️ AUCUN CHIFFRE INVENTÉ : ce papier reste des mois sur un comptoir. Les
// seuls nombres viennent de `lib/plans.js` et de `lib/lancement.js`.
// ⚠️ CHAQUE PROMESSE EXISTE DANS L'APP : le rappel une heure avant
// (`lib/rappels.js`), l'empreinte sans débit (`SetupIntent`), les invendus,
// l'équipe, la lecture de carte par l'IA.
const SEGMENTS = [
  {
    cle: 'alimentaire',
    onglet: 'Alimentaire à emporter',
    pour: 'Friteries, snacks, boulangeries, boucheries, traiteurs, food trucks',
    titre: ['Les autres prennent tes commandes.', 'Yoppaa t’amène des clients.'],
    chapo: 'À l’heure de manger, les habitants de ta commune ouvrent Yoppaa : qui est ouvert, ce qu’il reste, où commander sans faire la file. Et ils tombent sur toi, à deux pas.',
    pique: 'Ton cornet de frites, ce n’est pas à nous d’en manger une part.',
    unite: 'commande',
    points: [
      <>Ils commandent à l&rsquo;avance, avec l&rsquo;heure de retrait. <b>Un appel en plein coup de feu, c&rsquo;est une frite qui brûle.</b></>,
      <>Sauces, suppléments, tailles : <b>ils commandent comme au comptoir</b>, et ta cuisine reçoit la commande écrite.</>,
      <>À la fermeture, <b>ce qu&rsquo;il te reste repart à prix réduit</b> au lieu d&rsquo;être jeté.</>,
      <>Leur <b>carte de fidélité</b> se remplit toute seule : le numéro de GSM suffit, plus de carton à tamponner.</>,
      <>Pas le temps d&rsquo;encoder ? <b>Prends ta carte en photo</b> : l&rsquo;IA la lit et prépare tes articles.</>,
    ],
  },
  {
    cle: 'restaurant',
    onglet: 'Restaurant',
    pour: 'Restaurants, brasseries, pizzerias, tavernes',
    titre: ['Les autres prennent tes réservations.', 'Yoppaa t’amène des clients.'],
    chapo: 'Le vendredi soir, les habitants de ta commune cherchent une table à deux pas. Sur Yoppaa, ils la trouvent chez toi, sans passer par un annuaire qui facture chaque couvert.',
    pique: 'Chez nous, un couvert réservé ne se paie pas au couvert.',
    unite: 'couvert',
    points: [
      <>Ils réservent à toute heure : combien ils sont, à quelle heure. <b>C&rsquo;est ta salle qui attribue la table</b>, pas un algorithme.</>,
      <>Sur les grandes tables, <b>une empreinte bancaire</b> : la carte est enregistrée, rien n&rsquo;est débité si le client vient.</>,
      <>Ils commandent aussi <b>à emporter</b>, depuis la même page, sans que le téléphone sonne pendant le service.</>,
      <><b>Bons cadeaux et fidélité</b> : ils reviennent, et ils font venir les autres.</>,
      <>Pas le temps d&rsquo;encoder ? <b>Prends ta carte en photo</b> : l&rsquo;IA la lit et prépare tes plats.</>,
    ],
  },
  {
    cle: 'services',
    onglet: 'Services sur rendez-vous',
    pour: 'Coiffeurs, barbershops, instituts, bien-être, garages',
    titre: ['Les autres prennent tes rendez-vous.', 'Yoppaa t’amène des clients.'],
    chapo: 'Ton salon est fermé, ton agenda ne l’est pas. Le dimanche soir, les habitants de ta commune réservent leur créneau, et découvrent que tu es à deux pas.',
    pique: 'Ton agenda est plein ? Tant mieux. Ça ne nous rapporte pas un centime de plus.',
    unite: 'rendez-vous',
    points: [
      <>Ils choisissent la prestation, la personne et l&rsquo;heure. <b>Plus de répondeur, plus de rappel à passer.</b></>,
      <>Le <b>rappel part tout seul une heure avant</b> : moins de rendez-vous oubliés.</>,
      <><b>Abonnements et cartes de séances</b> : ton client achète, réserve lui-même, et son solde se décompte tout seul.</>,
      <><b>Bons cadeaux à offrir</b>, fidélité liée au GSM : ils reviennent, et ils en parlent.</>,
      <>Tu as une équipe ? <b>Chacun son agenda</b>, ses prestations et ses horaires.</>,
    ],
  },
  {
    cle: 'detail',
    onglet: 'Détail et boutiques',
    pour: 'Mode, fleuristes, librairies, décoration, épiceries fines',
    titre: ['Les autres prennent une part de chaque pull.', 'Yoppaa t’amène des clients.'],
    chapo: 'Les habitants de ta commune veulent acheter près de chez eux, sans attendre un colis. Sur Yoppaa, ils voient ta vitrine, choisissent, et passent la prendre.',
    pique: 'Ta vitrine, ton stock, ton prix. Pas de commission Yoppaa planquée sous chaque pull.',
    unite: 'vente',
    points: [
      <><b>Ta boutique en ligne</b> : tes articles avec leurs tailles et leurs couleurs, et le stock qui suit.</>,
      <>Ils réservent ou achètent, puis passent en boutique. <b>Ils entrent, et ils voient le reste.</b></>,
      <>Tu expédies aussi, si tu veux : <b>la livraison à domicile</b>, par la poste.</>,
      <>Tes <b>nouveautés et tes promos</b> arrivent sur le téléphone de ceux qui t&rsquo;ont mis en favori.</>,
      <><b>Bons cadeaux et fidélité</b> : le client qu&rsquo;on t&rsquo;offre devient ton client.</>,
    ],
  },
]

// Le verso, commun : ce qu'on raye, mot pour mot celui de la landing.
const RATURES = [
  ['Une part de chaque vente.', 'Un prix fixe, même pour ton meilleur samedi.'],
  ['Un contrat dont on ne sort pas.', 'Tu pars quand tu veux, et ta page reste.'],
  ['Des clients qui appartiennent à la plateforme.', 'Tes clients restent les tiens.'],
  ['Un service client qui ne connaît pas ton commerce.', 'Une vraie personne qui connaît ton dossier.'],
  ['Un logiciel de plus à apprendre.', 'Ton téléphone suffit.'],
]

const T = {
  ink: '#1A0840', panel: '#160636', deep: '#2D0F6B',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4',
  pale: '#EDE0FF', bg: '#F8F6FF', grey: '#6B7280',
}

const CONTACT = {
  nom: 'Alexandre Verstappen',
  // ⚠️ Le numéro vient de `lib/contact.js` (le même que WhatsApp sur la
  // landing). Écrit en format belge sur papier : 0492 73 08 69.
  tel: TELEPHONE_AFFICHE.replace(/^\+32 /, '0'),
  email: 'hello@yoppaa.app',
}

// ─── La jauge de débordement ────────────────────────────────────────────────
//
// ⚠️ ELLE EXISTE PARCE QUE LE DÉFAUT EST INVISIBLE. Une feuille A4 a une
// hauteur fixe : ce qui dépasse est simplement coupé, sans erreur, sans
// avertissement, et on ne s'en aperçoit qu'à l'impression. Trois allers-retours
// ont été perdus à deviner « ça déborde ? ». On mesure, et on l'affiche.
//
// ⚠️ ELLE MESURE DANS LES DEUX SENS, et c'est le point (29/08). Une jauge qui
// dit seulement « ça déborde » ne renseigne que la moitié du temps : une fois
// au vert, on ne sait plus si la page tient de justesse ou si on a tellement
// raccourci qu'elle est devenue vide. Il faudrait un aller-retour de plus pour
// l'apprendre, et c'est exactement l'aller-retour que cette jauge existe pour
// supprimer. Elle rend donc un nombre SIGNÉ : ce qui est coupé, ou ce qui reste.
//
// ⚠️ LE VERDICT VIT DANS `lib/jauge-page.js` ET PAS ICI : il est exécuté par
// `verif:kit`. Une jauge qui se trompe de verdict donne une confiance fausse
// sur un support qu'on ne peut plus corriger une fois imprimé.
//
// ⚠️ ÉCRAN SEULEMENT : `.jauge` est masquée à l'impression.
function useAjustement(feuille, contenu, pied) {
  const [mm, setMm] = useState(null)
  useEffect(() => {
    const f = feuille.current
    if (!f) return
    const mesurer = () => {
      // `scrollHeight` inclut ce qui est coupé par `overflow:hidden`.
      const trop = (f.scrollHeight - f.clientHeight) * PX_MM
      if (trop > 0) { setMm(Math.round(trop * 10) / 10); return }
      // Ça tient : la marge est le blanc que `marginTop:auto` a laissé entre
      // le corps et le bandeau. Des rectangles et pas `offsetTop`, qui dépend
      // de l'ancêtre positionné et se décalerait au moindre `position` ajouté.
      const c = contenu.current, p = pied.current
      if (!c || !p) { setMm(0); return }
      const libre = (p.getBoundingClientRect().top - c.getBoundingClientRect().bottom) * PX_MM
      setMm(-Math.round(Math.max(0, libre) * 10) / 10)
    }
    mesurer()
    // Les polices arrivent APRÈS le premier rendu : sans ce second passage,
    // on mesure la police de repli et le verdict est faux.
    if (document.fonts?.ready) document.fonts.ready.then(mesurer)
    const obs = new ResizeObserver(mesurer)
    obs.observe(f)
    return () => obs.disconnect()
  }, [feuille, contenu, pied])
  return mm
}

function Jauge({ valeur }) {
  const verdict = verdictJauge(valeur)
  if (!verdict) return null
  const teinte = TEINTES_JAUGE[verdict.etat]
  return (
    <p className="jauge" style={{
      margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: '0.04em',
      color: teinte.color, background: teinte.background,
      border: `1px solid ${teinte.bord}`,
      borderRadius: 8, padding: '6px 10px', display: 'inline-block',
    }}>
      {verdict.texte}
    </p>
  )
}

// ─── Le QR, produit par la bibliothèque du tableau de bord ──────────────────
function useQr(url) {
  const [dataUrl, setDataUrl] = useState(null)
  useEffect(() => {
    let vivant = true
    ;(async () => {
      try {
        const QRCode = (await import('qrcode')).default
        // Mêmes réglages que le QR de la fiche commerçant : correction
        // maximale, encre `ink` sur blanc. Un QR imprimé ne se refait pas.
        const d = await QRCode.toDataURL(url, {
          width: 900, margin: 0, errorCorrectionLevel: 'H',
          color: { dark: T.ink, light: '#FFFFFF' },
        })
        if (vivant) setDataUrl(d)
      } catch { /* la page reste lisible sans le QR */ }
    })()
    return () => { vivant = false }
  }, [url])
  return dataUrl
}

function Qr({ src, taille }) {
  if (!src) return <div style={{ width: taille, height: taille, background: '#F1F1F2', borderRadius: '2mm' }}/>
  // Une `<img>` nue et non `next/image` : la source est une donnée `data:`
  // produite dans le navigateur, il n'y a aucun fichier à optimiser.
  //
  // ⚠️ `loading="eager"` ET PAS `lazy`, contrairement au reste de l'app. La
  // garde de `verif:slots` réclame les deux attributs à cause du gel de
  // défilement iOS, mais ici la page est faite pour être IMPRIMÉE : une image
  // différée peut ne pas être décodée au moment du tirage, et le QR sortirait
  // en carré blanc sur du papier qu'on ne peut plus corriger.
  return <img src={src} alt="" decoding="async" loading="eager"
    style={{ width: taille, height: taille, display: 'block' }}/>
}

const S = {
  descripteur: { fontSize: '9.4pt', fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: T.main, margin: '5mm 0 0', lineHeight: 1.5 },
  eyebrow: { fontSize: '8.6pt', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: T.main, margin: 0 },
  // ⚠️ 27pt (et non plus 31) depuis le 14/10 : le titre de la v2 tient en deux
  // phrases, et le recto débordait de 2,4 mm (mesuré par la jauge).
  h1: { fontSize: '27pt', lineHeight: 1.06, letterSpacing: '-.025em', wordSpacing: '.05em', fontWeight: 800, margin: '5mm 0 0', textWrap: 'balance' },
  h2: { fontSize: '19pt', lineHeight: 1.13, letterSpacing: '-.025em', fontWeight: 800, margin: '3mm 0 0', textWrap: 'balance' },
  chapo: { fontSize: '12pt', lineHeight: 1.45, margin: '4.5mm 0 0', color: T.deep, fontWeight: 500 },
}

// ─── Les boutons de téléchargement ──────────────────────────────────────────
//
// ⚠️ ILS EXPORTENT LA PAGE AFFICHÉE, ILS NE LA REDESSINENT PAS. Voir
// `lib/export-feuille.js` : une seconde version dessinée au canvas divergerait
// de celle-ci dès la première correction de texte.
function Telechargements({ cible, largeurMm, hauteurMm, nom }) {
  const [enCours, setEnCours] = useState(null)
  const [erreur, setErreur] = useState(null)

  const exporter = async (format) => {
    setEnCours(format)
    setErreur(null)
    try {
      const svg = await feuilleEnSvg(cible.current, largeurMm, hauteurMm)
      if (format === 'svg') {
        telecharger(svg, `${nom}.svg`, 'image/svg+xml;charset=utf-8')
      } else {
        telecharger(await svgEnPng(svg, largeurMm, hauteurMm), `${nom}.png`, 'image/png')
      }
    } catch (e) {
      // ⚠️ ON DIT CE QUI S'EST PASSÉ. Un bouton qui ne fait rien en silence est
      // le pire des deux mondes : on recommence trois fois avant de comprendre.
      setErreur(e?.message || 'Le téléchargement n’a pas abouti.')
    } finally {
      setEnCours(null)
    }
  }

  // ⚠️ MÊME HABILLAGE QUE LES BOUTONS DU BRAND KIT (`app/brand-kit/page.js`) :
  // violet pour le SVG, violet foncé pour le PNG, et la largeur en pixels dans
  // le libellé. Deux jeux de boutons différents pour le même geste, sur deux
  // pages voisines, feraient hésiter à chaque visite.
  const largeurPng = Math.round((largeurMm / 25.4) * DPI_IMPRESSION)
  const bouton = {
    flex: 1, padding: '8px 12px', color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 11, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.3px',
    fontFamily: 'inherit',
  }

  return (
    <div className="outils" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => exporter('svg')} disabled={enCours !== null}
          style={{ ...bouton, background: T.main, opacity: enCours ? 0.5 : 1 }}>
          {enCours === 'svg' ? '…' : '↓ SVG'}
        </button>
        <button type="button" onClick={() => exporter('png')} disabled={enCours !== null}
          style={{ ...bouton, background: T.deep, opacity: enCours ? 0.5 : 1 }}>
          {enCours === 'png' ? '…' : `↓ PNG ${largeurPng}px`}
        </button>
      </div>
      {erreur && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, fontWeight: 700, color: '#B91C1C' }}>
          {erreur} <span style={{ fontWeight: 600, color: '#7F1D1D' }}>
            L’impression directe par Ctrl+P reste possible, elle ne dépend pas de cet export.
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Les deux faces en un seul PDF ──────────────────────────────────────────
//
// ⚠️ C'EST LE FICHIER QU'ON DONNE À UN IMPRIMEUR. Deux pages A4 dans l'ordre,
// un seul fichier à déposer, et son pilote sait faire le retournement. Les
// téléchargements par face restent : ils servent à autre chose, se relire une
// seule page ou l'envoyer par message.
function TelechargementCombine({ pages, nom = 'yoppaa-kit-commercant' }) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  const exporter = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      const pdf = await feuillesEnPdf(pages.map(p => p.current), 210, 297)
      telecharger(pdf, `${nom}-recto-verso.pdf`, 'application/pdf')
    } catch (e) {
      setErreur(e?.message || 'Le PDF n’a pas pu être assemblé.')
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="outils" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button type="button" onClick={exporter} disabled={enCours}
        style={{
          alignSelf: 'flex-start', padding: '11px 20px', color: '#fff', border: 'none',
          borderRadius: 10, fontSize: 13, fontWeight: 800, letterSpacing: '0.3px',
          cursor: 'pointer', fontFamily: 'inherit', background: T.ink,
          opacity: enCours ? 0.5 : 1,
        }}>
        {enCours ? 'Assemblage des deux pages…' : '↓ PDF recto/verso · les 2 pages A4'}
      </button>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: '#3F3355', maxWidth: 620 }}>
        Un seul fichier, deux pages dans l&rsquo;ordre, en {DPI_IMPRESSION} dpi. C&rsquo;est celui à
        déposer chez un imprimeur ou à envoyer à ton imprimante en recto/verso.
      </p>
      {erreur && (
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, fontWeight: 700, color: '#B91C1C', maxWidth: 620 }}>
          {erreur} <span style={{ fontWeight: 600, color: '#7F1D1D' }}>
            Les téléchargements page par page, eux, ne dépendent pas de cet assemblage.
          </span>
        </p>
      )}
    </div>
  )
}

function Puce() {
  return <span style={{ flex: '0 0 auto', width: '2.8mm', height: '2.8mm', borderRadius: '50%', background: T.main, marginTop: '1.9mm' }}/>
}

function Point({ children }) {
  return (
    // ⚠️ LE CORPS RESTE À 11pt. C'est un papier lu de l'autre côté d'un
    // comptoir, souvent debout : on resserre l'interligne, jamais la taille.
    <li style={{ display: 'flex', gap: '3.2mm', alignItems: 'flex-start', fontSize: '11pt', lineHeight: 1.3 }}>
      <Puce/><span>{children}</span>
    </li>
  )
}

// Le ticket à remplir au stylo : le calculateur de la landing, en papier. Le
// commerçant écrit SES chiffres sur la ligne, jamais les nôtres.
function LigneAVide({ libelle, unite }) {
  return (
    <p style={{ margin: 0, display: 'flex', alignItems: 'flex-end', gap: '2mm', padding: '1.3mm 0' }}>
      <span style={{ flex: '0 0 auto' }}>{libelle}</span>
      <span style={{ flex: 1, borderBottom: `0.8pt dotted ${T.ink}`, transform: 'translateY(-1mm)' }}/>
      <span style={{ flex: '0 0 auto', fontWeight: 800 }}>{unite}</span>
    </p>
  )
}

export default function KitCommercant() {
  // Le segment vient de l'adresse (`?segment=restaurant`) pour qu'un lien
  // ouvre directement la bonne feuille, puis des onglets de l'atelier.
  const [cleSegment, setCleSegment] = useState('alimentaire')
  useEffect(() => {
    const voulu = new URLSearchParams(window.location.search).get('segment')
    if (SEGMENTS.some(s => s.cle === voulu)) setCleSegment(voulu)
  }, [])
  const seg = SEGMENTS.find(s => s.cle === cleSegment) || SEGMENTS[0]
  const qr = useQr(urlQr(`kit-${seg.cle}`))
  // La carte de visite sert à tous les segments : son QR ne porte que « kit ».
  const qrCarte = useQr(urlQr('kit-carte'))
  // Trois repères par feuille : la page, son corps, et son bandeau du bas.
  // Les deux derniers servent à mesurer le blanc quand la page tient.
  const recto = useRef(null), rectoCorps = useRef(null), rectoPied = useRef(null)
  const verso = useRef(null), versoCorps = useRef(null), versoPied = useRef(null)
  const carteTexte = useRef(null), carteQr = useRef(null)
  const debRecto = useAjustement(recto, rectoCorps, rectoPied)
  const debVerso = useAjustement(verso, versoCorps, versoPied)

  const feuille = {
    width: '210mm', height: '297mm', overflow: 'hidden', background: '#fff',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
    color: T.ink, boxShadow: '0 10px 40px rgba(26,8,64,.22)',
  }
  const pad = { padding: '15mm 17mm 0' }
  // ⚠️ LE VERSO A SA PROPRE MARGE HAUTE. Il porte sept points, le bloc
  // communautaire et le closer en deux temps : c'est la page la plus chargée
  // des deux, et elle débordait de 11,4 mm (mesuré par la jauge, 29/08). Le
  // recto, lui, tient et n'a aucune raison d'être resserré avec lui.
  const padVerso = { padding: '13mm 17mm 0' }

  return (
    <div style={{ minHeight: '100vh', background: '#E9E5F5', padding: '34px 22px 90px' }}>
      <style>{`
        @media print {
          body { background:#fff }
          .atelier, .jauge, .notice, .outils { display:none !important }
          .feuille, .carte { box-shadow:none !important; break-inside:avoid; page-break-inside:avoid }
          .feuille { page-break-after:always }
          .carte { margin:10mm }
          @page { size:A4 portrait; margin:0 }
        }
      `}</style>

      <div style={{ maxWidth: 1300, margin: '0 auto' }}>
        <div className="atelier" style={{ background: '#fff', borderRadius: 16, padding: '22px 26px', marginBottom: 28, boxShadow: '0 6px 24px rgba(26,8,64,.10)' }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 900, letterSpacing: '-.5px', color: T.ink }}>
            Kit commerçant · A4 recto/verso et carte de visite
          </h1>
          {/* Les quatre rectos (Alex, 14/10). Le verso est le même pour tous. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '6px 0 14px' }}>
            {SEGMENTS.map(s => (
              <button key={s.cle} type="button" onClick={() => setCleSegment(s.cle)} aria-pressed={s.cle === seg.cle}
                style={{
                  padding: '9px 16px', borderRadius: 100, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 13.5, fontWeight: 800,
                  border: `1.5px solid ${s.cle === seg.cle ? T.main : '#D9CCF2'}`,
                  background: s.cle === seg.cle ? T.main : '#fff',
                  color: s.cle === seg.cle ? '#fff' : T.deep,
                }}>
                {s.onglet}
              </button>
            ))}
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6, color: '#3F3355' }}>
            <strong>Impression :</strong> Ctrl+P, format A4 portrait, marges nulles, « graphiques d&rsquo;arrière-plan » coché.
            Deux pages, puis les cartes de visite.
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#3F3355' }}>
            La <strong>jauge</strong> sous chaque page mesure <strong>dans les deux sens</strong> : ce qui est
            coupé quand ça déborde, et le blanc qui reste en bas quand ça tient. Une feuille A4 a une hauteur
            fixe : ce qui dépasse disparaît sans erreur ni avertissement, et ne se voit qu&rsquo;une fois
            imprimé. En vert avec la marge, la page est bonne à tirer. Elle est masquée à l&rsquo;impression.
          </p>
          {/* ⚠️ DIRE À QUOI SERT CHAQUE FICHIER. Le SVG est vectoriel mais son
              contenu est de l'HTML embarqué : les navigateurs le rendent, pas
              Illustrator ni Inkscape. Le taire ferait envoyer chez l'imprimeur
              un fichier qui s'y ouvrirait vide. */}
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: '#3F3355' }}>
            <strong>Les fichiers :</strong> le <strong>PNG en {DPI_IMPRESSION} dpi</strong> est celui à envoyer
            à un imprimeur, il s&rsquo;ouvre partout. Le <strong>SVG</strong> reste vectoriel et se rouvre
            dans un navigateur, mais pas dans Illustrator ni Inkscape, qui ignorent l&rsquo;HTML qu&rsquo;il
            embarque. Dans les deux cas la police est <strong>incorporée au fichier</strong> : s&rsquo;il n&rsquo;y
            arrive pas, le téléchargement est refusé plutôt que rendu dans une autre police.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>

          {/* ══════════════ RECTO ══════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="feuille" ref={recto} style={feuille}>
              <div ref={rectoCorps} style={pad}>
                <YoppaaLogo size={40} mode="light"/>
                {/* Le descripteur nomme les MÉTIERS du segment : celui qui tient
                    la feuille doit s'y reconnaître avant de lire le titre. */}
                <p style={S.descripteur}>{seg.pour}</p>

                {/* ✅ Le titre de la landing v2 (Alex, 14/10), au métier du segment. */}
                <h1 style={S.h1}>{seg.titre[0]}<br/><span style={{ color: T.main }}>{seg.titre[1]}</span></h1>
                <p style={S.chapo}>{seg.chapo}</p>

                {/* ⚠️ « Yoppaa ne prend » ET PAS « aucune commission » tout court :
                    les frais de paiement existent, et une promesse sans sujet se
                    retourne au premier versement. */}
                <div style={{ margin: '5mm 0 0', borderLeft: `1.5mm solid ${T.main}`, paddingLeft: '6mm' }}>
                  <p style={{ margin: 0, fontSize: '14.5pt', lineHeight: 1.25, fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>
                    Ils t&rsquo;appellent «&nbsp;partenaire&nbsp;».<br/>
                    <span style={{ color: T.main }}>Ils se paient comme un associé.</span>
                  </p>
                  <p style={{ margin: '2.4mm 0 0', fontSize: '11pt', lineHeight: 1.35, fontWeight: 800, color: T.ink }}>{seg.pique}</p>
                  <span style={{ display: 'block', marginTop: '2mm', fontSize: '10pt', lineHeight: 1.42, fontWeight: 600, color: T.deep }}>
                    Yoppaa ne prend aucune commission sur tes ventes&nbsp;: la formule au mois est notre seul
                    revenu. Les frais de paiement, eux, restent ceux de ta banque, comme au comptoir.
                  </span>
                </div>

                <ul style={{ listStyle: 'none', margin: '5mm 0 0', padding: 0, display: 'grid', gap: '2.4mm' }}>
                  {seg.points.map((p, i) => <Point key={i}>{p}</Point>)}
                </ul>

                {/* ══ LE TICKET QU'ON NE T'IMPRIME JAMAIS, À REMPLIR AU STYLO ══
                    ✅ L'idée validée par Alex le 14/10 pour la landing, en papier.
                    ⚠️ AUCUN CHIFFRE PRÉIMPRIMÉ CÔTÉ « EUX » : sur une feuille qui
                    reste des mois au comptoir, un taux écrit par nous serait NOTRE
                    chiffre, et il vieillirait. Les lignes sont vides : c'est le
                    commerçant qui écrit le sien. */}
                <div style={{ margin: '5mm 0 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5mm', fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, "Courier New", monospace', fontSize: '9.4pt', color: T.ink }}>
                  <div style={{ border: `1pt dashed ${T.ink}`, borderRadius: '2mm', padding: '3mm 4mm' }}>
                    <p style={{ margin: '0 0 1.5mm', fontWeight: 800, fontSize: '8.4pt', letterSpacing: '.06em', textTransform: 'uppercase', textAlign: 'center' }}>Le ticket qu&rsquo;on ne t&rsquo;imprime jamais</p>
                    <LigneAVide libelle="Ce qu’on me prend" unite="%"/>
                    <LigneAVide libelle={`Par ${seg.unite}`} unite="€"/>
                    <LigneAVide libelle="Sur un an" unite="€"/>
                  </div>
                  <div style={{ border: `1pt solid ${T.main}`, borderRadius: '2mm', padding: '3mm 4mm' }}>
                    <p style={{ margin: '0 0 1.5mm', fontWeight: 800, fontSize: '8.4pt', letterSpacing: '.06em', textTransform: 'uppercase', textAlign: 'center', color: T.main }}>Le ticket Yoppaa</p>
                    <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between', padding: '1.3mm 0' }}><span>Commission Yoppaa</span><b>0,00 €</b></p>
                    <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between', padding: '1.3mm 0' }}><span>Par {seg.unite}</span><b>0,00 €</b></p>
                    <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between', padding: '1.3mm 0' }}><span>La formule</span><b>au mois</b></p>
                  </div>
                </div>
                <p style={{ margin: '2mm 0 0', fontSize: '9pt', lineHeight: 1.35, fontWeight: 600, color: T.grey }}>
                  Fais le calcul avec ton stylo. Ou scanne&nbsp;: le calculateur le fait avec tes chiffres.
                </p>
              </div>

              {/* ══ LE SOCLE : l'offre et le QR, sur le seul bloc violet ══ */}
              <div ref={rectoPied} style={{ marginTop: 'auto', background: T.panel, color: '#fff', padding: '7.5mm 17mm', display: 'flex', alignItems: 'center', gap: '8mm' }}>
                <div style={{ flex: 1 }}>
                  {/* ✅ Le dernier mot de la landing (Alex, 14/10), en tête du socle. */}
                  <p style={{ margin: 0, fontSize: '24pt', fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.05 }}>
                    Reprends tes clients.
                  </p>
                  {/* ⚠️ LA RÈGLE, PAS UNE DATE : 100 jours depuis l'inscription,
                      lus dans `lib/lancement.js`. Un papier ne se corrige plus. */}
                  <p style={{ margin: '3mm 0 0', fontSize: '13pt', fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.2, color: T.light }}>
                    {ESSAI_JOURS_MINIMUM} jours offerts, dès ton inscription.
                  </p>
                  <p style={{ margin: '2mm 0 0', fontSize: '9.6pt', lineHeight: 1.4, fontWeight: 600, color: T.light }}>
                    Pour tout le monde, quel que soit le jour où tu t&rsquo;inscris.
                    <strong style={{ color: '#fff' }}> Tu essaies tout, tu restes si c&rsquo;est utile.</strong> Sans
                    carte de paiement. Les formules et ce que ça t&rsquo;engage&nbsp;: au verso.
                  </p>
                </div>
                <div>
                  {/* Le QR reste sur BLANC : un code violet sur violet ne se lit pas. */}
                  <div style={{ background: '#fff', borderRadius: '3.5mm', padding: '3mm' }}>
                    <Qr src={qr} taille="30mm"/>
                  </div>
                  <p style={{ margin: '3mm 0 0', fontSize: '8.2pt', lineHeight: 1.3, fontWeight: 800, color: '#fff', textAlign: 'center' }}>
                    Scanne et fais<br/>le calcul
                  </p>
                </div>
              </div>
            </div>
            <Jauge valeur={debRecto}/>
            <Telechargements cible={recto} largeurMm={210} hauteurMm={297} nom={`yoppaa-kit-${seg.cle}-recto`}/>
          </div>

          {/* ══════════════ VERSO ══════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="feuille" ref={verso} style={feuille}>
              <div ref={versoCorps} style={padVerso}>
                {/* ══ L'OFFRE, LA RÈGLE ET PAS UNE DATE ══ */}
                <p style={S.eyebrow}>Ce que ça t&rsquo;engage&nbsp;: rien</p>
                <h2 style={S.h2}>
                  {ESSAI_JOURS_MINIMUM} jours offerts, dès ton inscription.
                  <br/><span style={{ color: T.main }}>Pour tout le monde. Tout le temps.</span>
                </h2>
                <p style={{ ...S.chapo, marginTop: '2.6mm', fontSize: '10.6pt' }}>
                  Tu essaies tout, les trois formules, sans carte de paiement&nbsp;: rien ne se déclenche dans
                  ton dos. Tu viens parce que c&rsquo;est gratuit, tu restes parce que c&rsquo;est utile.
                </p>

                {/* ══ CE QU'ON RAYE ══ La rature a un sens : on raye l'ANCIENNE
                    façon de faire, et notre réponse s'écrit à côté (Alex, 14/10,
                    sur la landing : « tu as barré, quel message doit passer ? »). */}
                <p style={{ ...S.eyebrow, marginTop: '5mm' }}>On a rayé ce qui te coûte</p>
                <div style={{ margin: '2mm 0 0', borderTop: `0.8pt solid #D9CCF2` }}>
                  {RATURES.map(([avant, ici]) => (
                    <div key={avant} style={{ display: 'grid', gridTemplateColumns: '0.95fr 1.05fr', gap: '5mm', alignItems: 'center', padding: '2.2mm 0', borderBottom: `0.8pt solid #D9CCF2` }}>
                      <s style={{ fontSize: '10pt', lineHeight: 1.3, fontWeight: 600, color: T.grey, textDecorationColor: '#DC2626', textDecorationThickness: '1.2pt' }}>{avant}</s>
                      <span style={{ fontSize: '11pt', lineHeight: 1.3, fontWeight: 800, color: T.ink }}>✓ {ici}</span>
                    </div>
                  ))}
                </div>

                {/* ══ LES TROIS FORMULES ══
                    ⚠️ LES MONTANTS VIENNENT DE `lib/plans.js`, ILS NE SONT PAS
                    RECOPIÉS : un prix écrit en dur divergerait de l'application au
                    premier changement de tarif, et sur du papier ça ne se rattrape
                    plus. HTVA, comme partout : on s'adresse à des professionnels.
                    🔴 LE GOOD MORNING SE DIT AVEC SA CADENCE (erreur n° 1 du brief) :
                    chaque SEMAINE en Exister, chaque MATIN en Communiquer. */}
                <div style={{ margin: '5mm 0 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3.5mm' }}>
                  {[
                    { nom: 'Exister', prix: 'Gratuit', sous: 'à vie', lignes: ['Ta page, dans l’app et sur Google', 'Ta place chaque semaine dans le Good Morning Yoppers', 'Les envies du quartier'] },
                    { nom: 'Communiquer', prix: euros(getPrixPlan('communiquer').mensuel), sous: 'HTVA par mois', lignes: ['Deals, actus et notifications', 'Ta place chaque matin dans le Good Morning Yoppers', 'Fidélité par GSM, bons cadeaux'] },
                    { nom: 'Vendre', prix: euros(getPrixPlan('vendre').mensuel), sous: 'HTVA par mois', vedette: true, lignes: ['Commandes, rendez-vous, tables, boutique', 'Paiement en ligne ou au comptoir', 'Aucune commission Yoppaa sur tes ventes'] },
                  ].map(f => (
                    <div key={f.nom} style={{ border: `${f.vedette ? '1.6pt' : '0.9pt'} solid ${f.vedette ? T.main : '#D9CCF2'}`, borderRadius: '3mm', padding: '3.4mm 3.6mm' }}>
                      <p style={{ margin: 0, fontSize: '12pt', fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>{f.nom}</p>
                      <p style={{ margin: '1mm 0 0', fontSize: '13pt', fontWeight: 800, color: T.main, lineHeight: 1.1 }}>
                        {f.prix} <span style={{ fontSize: '7.6pt', fontWeight: 700, color: T.grey }}>{f.sous}</span>
                      </p>
                      <ul style={{ listStyle: 'none', margin: '2mm 0 0', padding: 0, display: 'grid', gap: '1.3mm' }}>
                        {f.lignes.map(l => <li key={l} style={{ fontSize: '9.6pt', lineHeight: 1.32, fontWeight: 600, color: T.deep }}>· {l}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* ══ L'ABONNEMENT N'ENFERME PERSONNE ══ (Alex, 14/10 : « quand on
                    dit abonnement, les gens pensent engagement »). Tenu par le
                    code : une résiliation repasse le commerce en Exister. */}
                <div style={{ margin: '5mm 0 0', border: `1.4pt solid ${T.main}`, borderRadius: '4mm', padding: '4.4mm 6mm' }}>
                  <p style={{ margin: 0, fontSize: '14pt', lineHeight: 1.16, fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>
                    Ici, l&rsquo;abonnement n&rsquo;enferme personne.
                  </p>
                  <p style={{ margin: '2.2mm 0 0', fontSize: '10.2pt', lineHeight: 1.42, fontWeight: 600, color: T.deep }}>
                    Tu aimes, tu restes. Ça ne te sert plus, tu arrêtes quand tu veux, sans préavis. Et ta page
                    reste en ligne, gratuitement&nbsp;: tes clients te trouvent toujours. Tu ne remplaces rien&nbsp;:
                    garde ta caisse, ton logiciel, tes habitudes.
                  </p>
                  <p style={{ margin: '2.6mm 0 0', fontSize: '15pt', fontWeight: 800, letterSpacing: '-.02em', wordSpacing: '.12em', color: T.main }}>
                    Yopper un jour, Yopper toujours.
                  </p>
                </div>

                {/* ⚠️ L'ENCODAGE OFFERT SUIT SON DRAPEAU, COMME SUR LA LANDING. Mais
                    un papier ne s'efface pas : une feuille tirée pendant l'offre la
                    promet encore le jour où le drapeau tombe. D'où « en ce moment ». */}
                {ENCODAGE_OFFERT && (
                  <p style={{ margin: '4mm 0 0', fontSize: '10.4pt', lineHeight: 1.4, fontWeight: 700, color: T.ink }}>
                    <span style={{ color: '#047857', fontWeight: 800 }}>En ce moment&nbsp;:</span> on encode ta carte, ton menu
                    ou ton catalogue pour toi. Gratuitement. Demande&#8209;le.
                  </p>
                )}
              </div>

              <div ref={versoPied} style={{ marginTop: 'auto', background: T.panel, color: '#fff', padding: '6mm 17mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '6mm' }}>
                <div>
                  {/* ✅ « On t'appelle » (Alex, 14/10) : le deuxième chemin de la
                      landing, sur le papier. Le numéro vient de `lib/contact.js`. */}
                  <p style={{ margin: 0, fontSize: '13pt', fontWeight: 800, letterSpacing: '-.02em', color: '#fff', lineHeight: 1.2 }}>
                    Une question&nbsp;? Envie de voir&nbsp;?<br/><span style={{ color: T.light }}>On t&rsquo;appelle. Ou écris-nous sur WhatsApp.</span>
                  </p>
                  <p style={{ margin: '3mm 0 0', fontSize: '9.4pt', lineHeight: 1.42, fontWeight: 600, color: T.light }}>
                    {/* ⚠️ LE CONTACT TIENT SUR UNE SEULE LIGNE, ET C'EST CE QUI PAIE
                        LA MENTION LÉGALE. Le verso n'avait que 5,9 mm de marge :
                        ajouter une ligne sans en reprendre une l'aurait fait passer
                        en « de justesse ». Trois lignes avant, trois lignes après. */}
                    {CONTACT.nom} · <strong style={{ color: '#fff' }}>{CONTACT.tel}</strong> (appel ou WhatsApp) · {CONTACT.email}<br/>
                    {/* ⚠️ L'IDENTITÉ LÉGALE EST CELLE DE `project_avcotech_identite_legale` :
                        Avcotech SRL, BCE 0731.637.148, Rue de Prée 9G, 5640 Mettet.
                        La rue est volontairement omise : ce papier n'est pas un document
                        commercial, il rassure sur QUI est derrière la marque.
                        ⚠️ ET 260, JAMAIS 262 : c'est le nombre de communes wallonnes. */}
                    Yoppaa est une marque d&rsquo;Avcotech SRL, 5640 Mettet.<br/>
                    260 communes ouvertes en Wallonie.
                  </p>
                </div>
                {/* ⚠️ UN QR DES DEUX CÔTÉS. Un A4 plastifié posé sur un comptoir
                    ne montre qu'une face, et rarement celle qu'on avait choisie.
                    Sans lui, la moitié des exemplaires laissés sont muets. */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3mm' }}>
                  <div style={{ background: '#fff', borderRadius: '2.4mm', padding: '2.2mm' }}>
                    <Qr src={qr} taille="21mm"/>
                  </div>
                  <YoppaaLogo size={22} mode="dark"/>
                </div>
              </div>
            </div>
            <Jauge valeur={debVerso}/>
            <Telechargements cible={verso} largeurMm={210} hauteurMm={297} nom={`yoppaa-kit-${seg.cle}-verso`}/>
          </div>
        </div>

        {/* ⚠️ L'ORDRE EST CELUI DE L'IMPRESSION : recto d'abord. Un PDF dont les
            faces sont inversées ne se voit qu'une fois la pile sortie. */}
        <TelechargementCombine pages={[recto, verso]} nom={`yoppaa-kit-${seg.cle}`}/>

        {/* ══════════════ CARTE DE VISITE ══════════════ */}
        <h2 className="notice" style={{ margin: '44px 0 14px', fontSize: 20, fontWeight: 800, letterSpacing: '-.4px', color: T.ink }}>
          La carte de visite · 85 × 55 mm
        </h2>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start' }}>
         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="carte" ref={carteTexte} style={{ width: '85mm', height: '55mm', borderRadius: '3mm', overflow: 'hidden', background: '#fff', color: T.ink, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-jakarta), system-ui, sans-serif', boxShadow: '0 8px 28px rgba(26,8,64,.26)' }}>
            <div style={{ padding: '5.5mm 6mm 0', flex: 1 }}>
              <YoppaaLogo size={21} mode="light"/>
              {/* 🔴 14/10 : plus de « place de marché ». La carte porte le titre
                  de la landing, valable pour tous les métiers. */}
              <p style={{ margin: '3mm 0 0', fontSize: '9.4pt', fontWeight: 800, letterSpacing: '-.015em', color: T.ink, lineHeight: 1.22 }}>
                Les autres prennent tes commandes.<br/><span style={{ color: T.main }}>Yoppaa t&rsquo;amène des clients.</span>
              </p>
              <p style={{ margin: '2.4mm 0 0', fontSize: '7.2pt', lineHeight: 1.5, fontWeight: 600, color: T.grey }}>
                <strong style={{ color: T.ink, fontSize: '8.4pt' }}>{CONTACT.nom}</strong><br/>
                {CONTACT.tel} · {CONTACT.email}
              </p>
            </div>
            <div style={{ background: T.panel, color: '#fff', padding: '3.2mm 6mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '3mm' }}>
              {/* 🔴 14/10 : « Gratuit jusqu'au 8 janvier 2027 » était FAUX depuis
                  les 100 jours permanents, et oublié le matin même. La règle,
                  lue dans `lib/lancement.js`, jamais une date. */}
              <p style={{ margin: 0, fontSize: '8pt', fontWeight: 800, letterSpacing: '-.01em' }}>{ESSAI_JOURS_MINIMUM} jours offerts, dès l&rsquo;inscription</p>
              <span style={{ fontSize: '7pt', fontWeight: 700, color: T.light }}>yoppaa.app/pro</span>
            </div>
          </div>
          <Telechargements cible={carteTexte} largeurMm={85} hauteurMm={55} nom="yoppaa-carte-visite-recto"/>
         </div>

         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="carte" ref={carteQr} style={{ width: '85mm', height: '55mm', borderRadius: '3mm', overflow: 'hidden', background: '#fff', color: T.ink, display: 'flex', alignItems: 'center', gap: '5mm', padding: '6mm', fontFamily: 'var(--font-jakarta), system-ui, sans-serif', boxShadow: '0 8px 28px rgba(26,8,64,.26)' }}>
            <Qr src={qrCarte} taille="22mm"/>
            <div>
              <p style={{ margin: 0, fontSize: '10pt', fontWeight: 800, lineHeight: 1.22, letterSpacing: '-.02em' }}>
                Scanne.<br/>Fais le calcul<br/>avec tes chiffres.
              </p>
              <p style={{ margin: '2.4mm 0 0', fontSize: '7.2pt', lineHeight: 1.5, fontWeight: 600, color: T.grey }}>
                Yoppaa ne prend aucune<br/>commission sur tes ventes.
              </p>
            </div>
          </div>
          <Telechargements cible={carteQr} largeurMm={85} hauteurMm={55} nom="yoppaa-carte-visite-verso"/>
         </div>
        </div>
      </div>
    </div>
  )
}
