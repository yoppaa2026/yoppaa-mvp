'use client'
// ════════════════════════════════════════════════════════════════════
// LE KIT COMMERÇANT — A4 recto/verso à plastifier, et la carte de visite.
//
// URL : yoppaa.app/brand-kit/commercant   (?segment=alimentaire|restaurant|services|detail)
//
// ⚠️ POURQUOI DANS L'APP ET PLUS DANS UNE MAQUETTE À CÔTÉ. La maquette
// s'affichait dans une police de SUBSTITUTION, Plus Jakarta Sans n'étant pas
// embarquable ailleurs. Or Jakarta est étroite : régler des césures et des
// hauteurs contre une police plus large, c'est régler contre le mauvais
// rendu. Ici, la police est la vraie, le logo est le vrai composant, et le QR
// est produit par la même bibliothèque que celui du tableau de bord.
//
// ⚠️ ET LE LOGO N'EST PAS REDESSINÉ : `<YoppaaLogo>` porte les proportions de
// `lib/logo.js`. Le recopier ici aurait donné un troisième jeu de mesures.
//
// IMPRESSION : Ctrl+P, A4 portrait, marges nulles, arrière-plans cochés.
//
// 🔥 REFONTE DU 14/10, EN DEUX TEMPS.
//
// 1) Décision d'Alex au tableau : UNE BASE COMMUNE + UN RECTO PAR SEGMENT
//    (alimentaire à emporter, restaurant, services sur rendez-vous, détail).
//    Une seule page, un réglage de segment : une correction de la base vaut
//    pour les quatre feuilles.
//
// 2) Son retour sur la première version : « tu peux faire bien mieux, TROP
//    MÉLANGÉ, PAS ASSEZ TUNNEL DE VENTE. Le ticket à compléter sur un flyer
//    plastifié, pas utile et pas pertinent. Il faut structurer et moderniser
//    comme la landing, DU PEPS, ODOO MIND. » D'où un vrai TUNNEL, une idée par
//    bloc, dans l'ordre où on lit :
//      RECTO, le choc et la promesse : le métier, le titre de la landing, la
//        pique, une bande qui tranche, trois choses qui changent pour LUI,
//        puis « Remplis ton commerce, pas leurs poches » et un QR pour
//        REGARDER (la landing).
//      VERSO, la décision : comment ça marche en trois étapes, l'offre, les
//        formules, la liberté, puis UN appel à l'action et un QR pour AGIR
//        (l'inscription).
//    Le ticket à remplir est parti : un papier plastifié ne se remplit pas.
//
// 🔴 CE QUI A ÉTÉ RETIRÉ DE L'ANCIEN PAPIER. « La place de marché du commerce
// local belge » (formule abandonnée) ; « la gazette chaque matin » sans dire
// qu'en Exister c'est chaque semaine ; « ta fiche est prête en cinq minutes »
// (un délai qu'aucun écran ne tient) ; des comptes d'habitants non présentés
// comme des exemples ; et sur la CARTE DE VISITE, « Gratuit jusqu'au 8 janvier
// 2027 », faux depuis les 100 jours permanents.
//
// ⚠️ SUR PAPIER, UN FOND EST BLANC OU FRANCHEMENT FONCÉ (29/08) : les violets
// très clairs ressortent bleu ciel au tirage. Les aplats de cette page sont
// donc `T.ink`, `T.panel`, `T.deep` ou `T.main`, jamais `T.bg` ni `T.pale`.
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
// Le téléphone de l'entreprise (appel et WhatsApp) et l'encodage offert : la
// même source que la landing.
import { TELEPHONE_AFFICHE, ENCODAGE_OFFERT } from '@/lib/contact'
import { accrocheKit, METIER_LIBRE_MAX } from '@/lib/kit-accroche'

// ⚠️ LA DESTINATION DES QR EST UNE DÉCISION, PAS UN DÉTAIL.
//
// RECTO → la landing, ancre `#commercants` (gardée par `verif:lancement`) : un
// commerçant qui scanne entre deux clients veut d'abord REGARDER.
// VERSO → l'inscription : c'est la face de la décision, sous un « Inscris-toi ».
// ⚠️ 14/10 : c'est une entorse VOULUE à la règle d'août (« jamais `/pro` »),
// pour la seule face qui demande d'agir ; le recto garde la règle.
// Les deux portent le SEGMENT (`via=kit-…`) : on saura quelle feuille fait
// venir, et laquelle fait s'inscrire.
const urlQr = (via) => `https://www.yoppaa.app/?via=${via}#commercants`
const urlInscription = (via) => `https://www.yoppaa.app/signup?via=${via}`

const T = {
  ink: '#1A0840', panel: '#160636', deep: '#2D0F6B',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4',
  pale: '#EDE0FF', bg: '#F8F6FF', grey: '#6B7280',
}
const MENTHE = '#6EE7B7'
const FILET = '#D9CCF2'

const CONTACT = {
  nom: 'Alexandre Verstappen',
  // ⚠️ Le numéro vient de `lib/contact.js` (le même que WhatsApp sur la
  // landing). Écrit en format belge sur papier : 0492 73 08 69.
  tel: TELEPHONE_AFFICHE.replace(/^\+32 /, '0'),
  email: 'hello@yoppaa.app',
}

// ─── Les icônes (charte : SVG, jamais d'emoji) ──────────────────────────────
function Icone({ d, taille = '6mm', couleur = '#fff' }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.map((p, i) => <path key={i} d={p}/>)}
    </svg>
  )
}
const I = {
  pin:    ['M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  sac:    ['M5 8h14l-1.2 12H6.2z', 'M9 8V6.5a3 3 0 0 1 6 0V8'],
  boucle: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 0 1 4-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 0 1-4 4H4'],
  agenda: ['M4 6.5h16V20H4z', 'M4 10.5h16', 'M8.5 3.5v4', 'M15.5 3.5v4'],
  table:  ['M4 9h16', 'M7 9v10', 'M17 9v10', 'M9 5h6'],
  vitrine:['M4 9h16l-1.5-4.5h-13z', 'M5 9v11h14V9', 'M10 20v-6h4v6'],
}

// ─── LES QUATRE RECTOS (Alex, 14/10) ─────────────────────────────────────────
//
// ⚠️ ON PIQUE LE MODÈLE, JAMAIS UN NOM (décision d'Alex, comme la landing).
// ⚠️ AUCUN CHIFFRE INVENTÉ : ce papier reste des mois sur un comptoir. Les
// seuls nombres viennent de `lib/plans.js` et de `lib/lancement.js`.
// ⚠️ CHAQUE PROMESSE EXISTE DANS L'APP : le rappel une heure avant
// (`lib/rappels.js`), l'empreinte sans débit (`SetupIntent`), les invendus,
// les cartes de séances, la lecture de carte par l'IA.
// ⚠️ TROIS ATOUTS, PAS CINQ : « ils te trouvent, ils viennent sans
// t'appeler, ils reviennent ». C'est la structure de la landing, et trois
// blocs se lisent d'un regard là où cinq puces se survolent.
//
// 🔴 AUCUN MÉTIER EN EXEMPLE DANS CE TEXTE (Alex, 14/10, option 1). « Tu tiens
// une friterie ? » et le « cornet de frites » vexaient la sandwicherie et la
// boulangerie d'à côté, qui ont presque les mêmes besoins ; « chaque pull »
// laissait le fleuriste dehors. La feuille est GÉNÉRALISTE : la pastille
// (`accroche`, voir `lib/kit-accroche.js`), la ligne du haut (`facons`, des
// MANIÈRES de vendre et pas une liste de métiers, qui en oublierait toujours
// un) et les textes valent pour tout le segment. Le métier précis ne vit que
// dans la pastille, et seulement quand on le TAPE dans l'atelier.
const SEGMENTS = [
  {
    cle: 'alimentaire',
    onglet: 'Alimentaire à emporter',
    facons: 'Au comptoir, à emporter, en livraison',
    accroche: { verbe: 'Tu tiens', pastille: 'un commerce de bouche' },
    titre: ['Les autres prennent tes commandes.', 'Yoppaa t’amène des clients.'],
    pique: 'Ce que tu vends, ce n’est pas à nous d’en manger une part.',
    atouts: [
      { icone: I.pin, titre: 'Ils te trouvent.', texte: 'À l’heure de manger, ils ouvrent l’app de leur commune : qui est ouvert, ce qu’il reste. Toi, à deux pas.' },
      { icone: I.sac, titre: 'Ils commandent sans t’appeler.', texte: 'Options, quantités, heure de retrait : tout arrive écrit. Un appel en plein coup de feu, c’est une commande qui attend.' },
      { icone: I.boucle, titre: 'Ils reviennent.', texte: 'Fidélité au numéro de GSM, et ce qu’il te reste le soir repart à prix réduit au lieu d’être jeté.' },
    ],
  },
  {
    cle: 'restaurant',
    onglet: 'Restaurant',
    facons: 'En salle, en terrasse, à emporter',
    accroche: { verbe: 'Tu tiens', pastille: 'un restaurant' },
    titre: ['Les autres prennent tes réservations.', 'Yoppaa t’amène des clients.'],
    pique: 'Chez nous, un couvert réservé ne se paie pas au couvert.',
    atouts: [
      { icone: I.pin, titre: 'Ils te trouvent.', texte: 'Le vendredi soir, ils cherchent une table à deux pas. Dans l’app de leur commune, elle est chez toi.' },
      { icone: I.table, titre: 'Ils réservent sans t’appeler.', texte: 'Combien, à quelle heure : c’est ta salle qui attribue la table. Sur les grandes tables, une empreinte bancaire, rien n’est débité si le client vient.' },
      { icone: I.boucle, titre: 'Ils reviennent.', texte: 'Bons cadeaux, fidélité au GSM, plats à emporter depuis la même page : ils reviennent, et ils amènent les autres.' },
    ],
  },
  {
    cle: 'services',
    onglet: 'Services sur rendez-vous',
    facons: 'En salon, en cabinet, à domicile',
    accroche: { verbe: 'Tu travailles', pastille: 'sur rendez-vous' },
    titre: ['Les autres prennent tes rendez-vous.', 'Yoppaa t’amène des clients.'],
    pique: 'Ton agenda est plein ? Tant mieux. Ça ne nous rapporte pas un centime de plus.',
    atouts: [
      { icone: I.pin, titre: 'Ils te trouvent.', texte: 'Le dimanche soir, ils cherchent un créneau près de chez eux. Tu es fermé, ton agenda ne l’est pas.' },
      { icone: I.agenda, titre: 'Ils réservent sans t’appeler.', texte: 'Prestation, personne, heure : plus de répondeur. Le rappel part tout seul une heure avant.' },
      { icone: I.boucle, titre: 'Ils reviennent.', texte: 'Abonnements, cartes de séances, bons cadeaux : le client revient sans que tu le relances.' },
    ],
  },
  {
    cle: 'detail',
    onglet: 'Détail et boutiques',
    facons: 'En vitrine, en rayon, à retirer sur place',
    accroche: { verbe: 'Tu tiens', pastille: 'une boutique' },
    titre: ['Les autres prennent une part de chaque vente.', 'Yoppaa t’amène des clients.'],
    pique: 'Ta vitrine, ton stock, ton prix. Pas de commission Yoppaa planquée dans ton ticket de caisse.',
    atouts: [
      { icone: I.pin, titre: 'Ils te trouvent.', texte: 'Ils veulent acheter près de chez eux, sans attendre un colis. Ta vitrine est dans leur poche.' },
      { icone: I.vitrine, titre: 'Ils achètent sans t’appeler.', texte: 'Ils voient ce qui est en stock, choisissent et passent prendre. Ils entrent, et ils voient le reste.' },
      { icone: I.boucle, titre: 'Ils reviennent.', texte: 'Tes nouveautés en notification, la fidélité, les bons cadeaux : le client qu’on t’offre devient le tien.' },
    ],
  },
]

// La bande qui tranche, sous le titre : trois vérités, aucune promesse vague.
const BANDE = ['0 % de commission Yoppaa', 'Prix fixe, même ton meilleur samedi', 'Tu pars quand tu veux']

// ─── La jauge de débordement ────────────────────────────────────────────────
//
// ⚠️ ELLE EXISTE PARCE QUE LE DÉFAUT EST INVISIBLE. Une feuille A4 a une
// hauteur fixe : ce qui dépasse est simplement coupé, sans erreur, sans
// avertissement, et on ne s'en aperçoit qu'à l'impression. On mesure, et on
// l'affiche.
//
// ⚠️ ELLE MESURE DANS LES DEUX SENS (29/08) : un nombre SIGNÉ, ce qui est
// coupé, ou ce qui reste.
//
// ⚠️ LE VERDICT VIT DANS `lib/jauge-page.js` ET PAS ICI : il est exécuté par
// `verif:kit`.
//
// ⚠️ ÉCRAN SEULEMENT : `.jauge` est masquée à l'impression.
function useAjustement(feuille, contenu, pied, cle) {
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
    // ⚠️ `cle` : changer de segment change le texte, donc la hauteur.
  }, [feuille, contenu, pied, cle])
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
  // ⚠️ `loading="eager"` ET PAS `lazy` : la page est faite pour être IMPRIMÉE,
  // une image différée peut ne pas être décodée au moment du tirage, et le QR
  // sortirait en carré blanc sur du papier qu'on ne peut plus corriger.
  return <img src={src} alt="" decoding="async" loading="eager"
    style={{ width: taille, height: taille, display: 'block' }}/>
}

const S = {
  eyebrow: { fontSize: '8.6pt', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: T.main, margin: 0 },
  h2: { fontSize: '22pt', lineHeight: 1.06, letterSpacing: '-.03em', wordSpacing: '.05em', fontWeight: 800, margin: '2.5mm 0 0', textWrap: 'balance', color: T.ink },
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
  // le libellé.
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
// un seul fichier à déposer, et son pilote sait faire le retournement.
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

export default function KitCommercant() {
  // Le segment vient de l'adresse (`?segment=restaurant`) pour qu'un lien
  // ouvre directement la bonne feuille, puis des onglets de l'atelier.
  const [cleSegment, setCleSegment] = useState('alimentaire')
  // Le métier tapé pour une tournée ciblée (« une poissonnerie »). Vide, la
  // pastille généraliste du segment reste : voir `lib/kit-accroche.js`.
  const [metierLibre, setMetierLibre] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const voulu = params.get('segment')
    if (SEGMENTS.some(s => s.cle === voulu)) setCleSegment(voulu)
    // `?metier=une%20poissonnerie` : un lien envoyé ouvre la feuille prête.
    const metier = params.get('metier')
    if (metier) setMetierLibre(metier.slice(0, METIER_LIBRE_MAX))
  }, [])
  const seg = SEGMENTS.find(s => s.cle === cleSegment) || SEGMENTS[0]
  const accroche = accrocheKit(seg.accroche, metierLibre)
  const qr = useQr(urlQr(`kit-${seg.cle}`))
  const qrInscription = useQr(urlInscription(`kit-${seg.cle}`))
  // La carte de visite sert à tous les segments : son QR ne porte que « carte ».
  const qrCarte = useQr(urlQr('kit-carte'))
  // Trois repères par feuille : la page, son corps, et son bandeau du bas.
  // Les deux derniers servent à mesurer le blanc quand la page tient.
  const recto = useRef(null), rectoCorps = useRef(null), rectoPied = useRef(null)
  const verso = useRef(null), versoCorps = useRef(null), versoPied = useRef(null)
  const carteTexte = useRef(null), carteQr = useRef(null)
  // ⚠️ La pastille change la hauteur du recto : un métier long passe sur deux
  // lignes. La jauge doit remesurer à chaque lettre, pas seulement au segment.
  const debRecto = useAjustement(recto, rectoCorps, rectoPied, `${seg.cle}|${accroche.pastille}`)
  const debVerso = useAjustement(verso, versoCorps, versoPied, seg.cle)

  const feuille = {
    width: '210mm', height: '297mm', overflow: 'hidden', background: '#fff',
    display: 'flex', flexDirection: 'column',
    fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif',
    color: T.ink, boxShadow: '0 10px 40px rgba(26,8,64,.22)',
  }
  // ⚠️ LE VERSO A SA PROPRE MARGE HAUTE : c'est la page la plus chargée des
  // deux (mesuré par la jauge, 29/08). Le recto, lui, ouvre sur un aplat.
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
                  border: `1.5px solid ${s.cle === seg.cle ? T.main : FILET}`,
                  background: s.cle === seg.cle ? T.main : '#fff',
                  color: s.cle === seg.cle ? '#fff' : T.deep,
                }}>
                {s.onglet}
              </button>
            ))}
          </div>
          {/* ✅ Option 1 d'Alex (14/10) : généraliste par défaut, le métier en
              option, tapé librement (« on n'a jamais tous les métiers »). */}
          <label style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px', margin: '0 0 14px', fontSize: 14, fontWeight: 700, color: T.ink }}>
            Métier visé (facultatif)&nbsp;:
            <input type="text" value={metierLibre} maxLength={METIER_LIBRE_MAX}
              onChange={e => setMetierLibre(e.target.value)}
              placeholder={`vide = « ${seg.accroche.verbe} ${seg.accroche.pastille} ? »`}
              style={{ flex: '1 1 260px', maxWidth: 420, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${FILET}`, fontSize: 14, fontFamily: 'inherit', color: T.ink }}/>
            {metierLibre.trim() && (
              <button type="button" onClick={() => setMetierLibre('')}
                style={{ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${FILET}`, background: '#fff', color: T.deep, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Revenir à la feuille générale
              </button>
            )}
            <span style={{ flexBasis: '100%', fontSize: 12.5, fontWeight: 600, color: '#3F3355' }}>
              Avec l&rsquo;article, comme il se lira&nbsp;: «&nbsp;une poissonnerie&nbsp;», «&nbsp;un salon de coiffure&nbsp;». La pastille devient «&nbsp;Tu tiens une poissonnerie&nbsp;?&nbsp;», le reste de la feuille ne change pas.
            </span>
          </label>
          <p style={{ margin: '0 0 8px', fontSize: 14, lineHeight: 1.6, color: '#3F3355' }}>
            <strong>Impression :</strong> Ctrl+P, format A4 portrait, marges nulles, « graphiques d&rsquo;arrière-plan » coché.
            Deux pages, puis les cartes de visite.
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: '#3F3355' }}>
            La <strong>jauge</strong> sous chaque page mesure <strong>dans les deux sens</strong> : ce qui est
            coupé quand ça déborde, et le blanc qui reste en bas quand ça tient. En vert avec la marge, la page
            est bonne à tirer. Elle est masquée à l&rsquo;impression.
          </p>
          {/* ⚠️ DIRE À QUOI SERT CHAQUE FICHIER. Le SVG est vectoriel mais son
              contenu est de l'HTML embarqué : les navigateurs le rendent, pas
              Illustrator ni Inkscape. */}
          <p style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.6, color: '#3F3355' }}>
            <strong>Les fichiers :</strong> le <strong>PNG en {DPI_IMPRESSION} dpi</strong> est celui à envoyer
            à un imprimeur, il s&rsquo;ouvre partout. Le <strong>SVG</strong> reste vectoriel et se rouvre
            dans un navigateur, mais pas dans Illustrator ni Inkscape, qui ignorent l&rsquo;HTML qu&rsquo;il
            embarque. Dans les deux cas la police est <strong>incorporée au fichier</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>

          {/* ══════════════ RECTO : LE CHOC ET LA PROMESSE ══════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="feuille" ref={recto} style={feuille}>
              <div ref={rectoCorps}>
                {/* ══ LE HAUT, COMME LA LANDING ══ Aplat foncé, le métier dans
                    une pastille blanche, le titre en blanc uni (règle des titres
                    sur fond sombre). */}
                <div style={{ background: `linear-gradient(140deg, ${T.panel} 0%, ${T.ink} 55%, ${T.deep} 100%)`, color: '#fff', padding: '11mm 17mm 9mm' }}>
                  <YoppaaLogo size={30} mode="dark"/>
                  <p style={{ margin: '4.5mm 0 0', fontSize: '8.4pt', fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase', color: T.light }}>
                    {seg.facons}
                  </p>
                  <p style={{ margin: '4mm 0 0', fontSize: '15pt', fontWeight: 800, color: 'rgba(255,255,255,.92)' }}>
                    {accroche.verbe}{' '}
                    <span style={{ display: 'inline-block', padding: '.4mm 3.2mm 1mm', borderRadius: '2.4mm', background: '#fff', color: T.ink }}>{accroche.pastille}</span>&nbsp;?
                  </p>
                  <h1 style={{ margin: '3.5mm 0 0', fontSize: '32pt', lineHeight: 1.04, letterSpacing: '-.03em', wordSpacing: '.06em', fontWeight: 800, color: '#fff', textWrap: 'balance' }}>
                    {seg.titre[0]} {seg.titre[1]}
                  </h1>
                  <p style={{ margin: '4mm 0 0', fontSize: '13pt', lineHeight: 1.3, fontWeight: 800, letterSpacing: '-.01em', color: T.light }}>
                    Ils t&rsquo;appellent «&nbsp;partenaire&nbsp;». Ils se paient comme un associé.
                  </p>
                </div>

                {/* ══ LA BANDE QUI TRANCHE ══ (la bande défilante de la landing,
                    à plat). ⚠️ « 0 % de commission YOPPAA » : jamais sans sujet. */}
                <div style={{ background: T.main, color: '#fff', padding: '3.4mm 17mm', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '1.5mm 3.5mm', fontSize: '10.2pt', fontWeight: 800 }}>
                  {BANDE.map((b, i) => (
                    <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: '3.5mm' }}>
                      {i > 0 && <span style={{ width: '1.8mm', height: '1.8mm', borderRadius: '50%', background: T.light }}/>}
                      {b}
                    </span>
                  ))}
                </div>

                {/* ══ TROIS CHOSES QUI CHANGENT, POUR LUI ══ */}
                <div style={{ padding: '6.5mm 17mm 0' }}>
                  <p style={S.eyebrow}>Ce que Yoppaa change pour toi</p>
                  <div style={{ margin: '3mm 0 0', display: 'grid', gap: '2.4mm' }}>
                    {seg.atouts.map(a => (
                      <div key={a.titre} style={{ display: 'grid', gridTemplateColumns: '11mm 1fr', columnGap: '4.5mm', alignItems: 'start', border: `0.9pt solid ${FILET}`, borderRadius: '3.5mm', padding: '3.4mm 4.5mm' }}>
                        <span style={{ width: '11mm', height: '11mm', borderRadius: '3mm', background: T.main, display: 'grid', placeItems: 'center' }}>
                          <Icone d={a.icone}/>
                        </span>
                        <div>
                          <p style={{ margin: 0, fontSize: '13.5pt', fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>{a.titre}</p>
                          <p style={{ margin: '1mm 0 0', fontSize: '10.2pt', lineHeight: 1.38, fontWeight: 600, color: T.deep }}>{a.texte}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ══ LA PIQUE DU MÉTIER ══ */}
                  <div style={{ margin: '4.5mm 0 0', borderLeft: `1.5mm solid ${T.main}`, paddingLeft: '5mm' }}>
                    <p style={{ margin: 0, fontSize: '14pt', lineHeight: 1.25, fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>{seg.pique}</p>
                    <p style={{ margin: '1.6mm 0 0', fontSize: '9.6pt', lineHeight: 1.4, fontWeight: 600, color: T.deep }}>
                      Yoppaa ne prend aucune commission sur tes ventes&nbsp;: la formule au mois est notre seul revenu.
                    </p>
                  </div>
                </div>
              </div>

              {/* ══ LE SOCLE : l'accroche de la landing et le QR pour REGARDER ══ */}
              <div ref={rectoPied} style={{ marginTop: 'auto', background: T.panel, color: '#fff', padding: '7.5mm 17mm', display: 'flex', alignItems: 'center', gap: '8mm' }}>
                <div style={{ flex: 1 }}>
                  {/* ✅ Le dernier mot de la landing (Alex, 14/10), qui a remplacé
                      « Reprends tes clients » : « pas certain qu'elle interpelle ». */}
                  <p style={{ margin: 0, fontSize: '23pt', fontWeight: 800, letterSpacing: '-.025em', wordSpacing: '.06em', lineHeight: 1.05 }}>
                    Remplis ton commerce,<br/>pas leurs poches.
                  </p>
                  {/* ⚠️ LA RÈGLE, PAS UNE DATE : lue dans `lib/lancement.js`. */}
                  <p style={{ margin: '3mm 0 0', fontSize: '13pt', fontWeight: 800, letterSpacing: '-.015em', lineHeight: 1.2, color: MENTHE }}>
                    {ESSAI_JOURS_MINIMUM} jours offerts, dès ton inscription.
                  </p>
                  <p style={{ margin: '1.8mm 0 0', fontSize: '9.6pt', lineHeight: 1.4, fontWeight: 600, color: T.light }}>
                    {/* ✅ Alex, 14/10 : la phrase entière plutôt que « Retourne la
                        feuille : comment ça marche », et sur sa propre ligne pour
                        qu'aucun mot ne reste seul en dessous. */}
                    Sans carte de paiement, sans engagement.<br/>
                    <strong style={{ color: '#fff' }}>Retourne la feuille pour savoir comment ça fonctionne.</strong>
                  </p>
                </div>
                <div>
                  {/* Le QR reste sur BLANC : un code violet sur violet ne se lit pas. */}
                  <div style={{ background: '#fff', borderRadius: '3.5mm', padding: '3mm' }}>
                    <Qr src={qr} taille="28mm"/>
                  </div>
                  {/* ✅ Alex, 14/10 : « ils doivent savoir qu'il y a une
                      différence » entre les deux QR. Chacun DIT où il mène. */}
                  <p style={{ margin: '2.6mm 0 0', fontSize: '8.6pt', lineHeight: 1.3, fontWeight: 800, color: '#fff', textAlign: 'center' }}>
                    Scanne pour découvrir
                  </p>
                </div>
              </div>
            </div>
            <Jauge valeur={debRecto}/>
            <Telechargements cible={recto} largeurMm={210} hauteurMm={297} nom={`yoppaa-kit-${seg.cle}-recto`}/>
          </div>

          {/* ══════════════ VERSO : LA DÉCISION (commun à tous) ══════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="feuille" ref={verso} style={feuille}>
              <div ref={versoCorps} style={padVerso}>
                {/* ══ COMMENT ÇA MARCHE ══ Une vraie suite, donc des numéros. */}
                <p style={S.eyebrow}>Comment ça marche</p>
                <h2 style={S.h2}>Trois étapes. Zéro risque.</h2>
                <div style={{ margin: '5mm 0 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5mm' }}>
                  {[
                    { titre: 'Tu t’inscris.', texte: <>Ton numéro d&rsquo;entreprise suffit, sans carte ni contrat. Tes {ESSAI_JOURS_MINIMUM} jours offerts commencent.</> },
                    // ⚠️ L'ENCODAGE OFFERT SUIT SON DRAPEAU, COMME LA LANDING. Mais
                    // un papier ne s'efface pas : tiré pendant l'offre, il la
                    // promet encore après. D'où « en ce moment ».
                    ENCODAGE_OFFERT
                      ? { titre: 'On remplit ta page.', texte: <>En ce moment, on encode ta carte, ton menu ou ton catalogue pour toi. Gratuitement.</> }
                      : { titre: 'Tu remplis ta page.', texte: <>Une liste te guide point par point. Ta carte en photo&nbsp;? L&rsquo;IA la lit pour toi.</> },
                    { titre: 'Ta commune te trouve.', texte: <>Ta page part en ligne dès qu&rsquo;elle est complète, dans l&rsquo;app de ta commune et sur Google.</> },
                  ].map((e, i) => (
                    <div key={e.titre}>
                      <span style={{ width: '10mm', height: '10mm', borderRadius: '50%', background: T.main, color: '#fff', display: 'grid', placeItems: 'center', fontSize: '14pt', fontWeight: 800 }}>{i + 1}</span>
                      <p style={{ margin: '2.6mm 0 0', fontSize: '12.5pt', lineHeight: 1.18, fontWeight: 800, letterSpacing: '-.015em', color: T.ink }}>{e.titre}</p>
                      <p style={{ margin: '1.4mm 0 0', fontSize: '9.4pt', lineHeight: 1.38, fontWeight: 600, color: T.deep }}>{e.texte}</p>
                    </div>
                  ))}
                </div>

                {/* ══ PENSÉ POUR LE COMMERÇANT (Alex, 14/10) ══ Les commandes,
                    rendez-vous et tables pris AU TÉLÉPHONE s'ajoutent dans Yoppaa
                    (`ModalNouvelleCommande`, `ModalNouveauRdv`). ⚠️ On énonce la
                    logique du modèle, on n'affirme rien d'un concurrent précis. */}
                <div style={{ margin: '5mm 0 0', borderLeft: `1.5mm solid ${T.main}`, paddingLeft: '5mm' }}>
                  <p style={{ margin: 0, fontSize: '14pt', lineHeight: 1.15, fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>
                    Le téléphone sonne encore&nbsp;? Tant mieux.
                  </p>
                  <p style={{ margin: '1.4mm 0 0', fontSize: '9.8pt', lineHeight: 1.4, fontWeight: 600, color: T.deep }}>
                    Une commande, un rendez-vous ou une table pris au téléphone&nbsp;: tu l&rsquo;ajoutes dans Yoppaa.
                    Ceux qui se paient à la commission n&rsquo;y gagnent rien, alors ils s&rsquo;en moquent.
                    <strong style={{ color: T.ink }}> Yoppaa est pensé pour le commerçant&nbsp;: on te laisse faire.</strong>
                  </p>
                </div>

                {/* ══ L'OFFRE, EN GRAND ══ Le « 100 » de la landing. */}
                <div style={{ margin: '5mm 0 0', background: T.ink, color: '#fff', borderRadius: '4.5mm', padding: '4mm 7mm', display: 'flex', alignItems: 'center', gap: '6mm' }}>
                  <span style={{ fontSize: '52pt', lineHeight: .9, fontWeight: 800, letterSpacing: '-.05em', color: T.light, flexShrink: 0 }}>{ESSAI_JOURS_MINIMUM}</span>
                  <div>
                    <p style={{ margin: 0, fontSize: '17pt', lineHeight: 1.12, fontWeight: 800, letterSpacing: '-.02em', wordSpacing: '.05em' }}>
                      jours pour tout essayer. Pour tout le monde. Tout le temps.
                    </p>
                    <p style={{ margin: '2mm 0 0', fontSize: '9.8pt', lineHeight: 1.4, fontWeight: 600, color: T.light }}>
                      Les trois formules, dès ton inscription, sans carte de paiement&nbsp;: rien ne se déclenche dans ton dos.
                    </p>
                  </div>
                </div>

                {/* ══ LES TROIS FORMULES ══
                    ⚠️ LES MONTANTS VIENNENT DE `lib/plans.js`, ILS NE SONT PAS
                    RECOPIÉS. HTVA, comme partout : on s'adresse à des pros.
                    🔴 LE GOOD MORNING SE DIT AVEC SA CADENCE (erreur n° 1 du brief
                    de la landing) : chaque SEMAINE en Exister, chaque MATIN en
                    Communiquer. */}
                <p style={{ ...S.eyebrow, marginTop: '5mm' }}>Ensuite, tu choisis</p>
                <div style={{ margin: '2.6mm 0 0', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3.5mm' }}>
                  {[
                    { nom: 'Exister', prix: 'Gratuit', sous: 'à vie', lignes: ['Ta page, dans l’app et sur Google', 'Ta place chaque semaine dans le Good Morning Yoppers', 'Les envies du quartier'] },
                    { nom: 'Communiquer', prix: euros(getPrixPlan('communiquer').mensuel), sous: 'HTVA par mois', lignes: ['Deals, actus et notifications', 'Ta place chaque matin dans le Good Morning Yoppers', 'Fidélité par GSM, bons cadeaux'] },
                    { nom: 'Vendre', prix: euros(getPrixPlan('vendre').mensuel), sous: 'HTVA par mois', vedette: true, lignes: ['Commandes, rendez-vous, tables, boutique', 'Paiement en ligne ou au comptoir', 'Aucune commission Yoppaa sur tes ventes'] },
                  ].map(f => (
                    <div key={f.nom} style={{ border: `${f.vedette ? '1.6pt' : '0.9pt'} solid ${f.vedette ? T.main : FILET}`, borderRadius: '3mm', padding: '3.4mm 3.6mm' }}>
                      <p style={{ margin: 0, fontSize: '12pt', fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>{f.nom}</p>
                      <p style={{ margin: '1mm 0 0', fontSize: '13pt', fontWeight: 800, color: T.main, lineHeight: 1.1 }}>
                        {f.prix} <span style={{ fontSize: '7.6pt', fontWeight: 700, color: T.grey }}>{f.sous}</span>
                      </p>
                      <ul style={{ listStyle: 'none', margin: '2mm 0 0', padding: 0, display: 'grid', gap: '1.3mm' }}>
                        {f.lignes.map(l => <li key={l} style={{ fontSize: '8.9pt', lineHeight: 1.28, fontWeight: 600, color: T.deep }}>· {l}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* ══ L'ABONNEMENT N'ENFERME PERSONNE ══ (Alex, 14/10 : « quand on
                    dit abonnement, les gens pensent engagement »). Tenu par le
                    code : une résiliation repasse le commerce en Exister. */}
                <div style={{ margin: '5mm 0 0', background: `linear-gradient(135deg, ${T.deep} 0%, ${T.main} 100%)`, color: '#fff', borderRadius: '4.5mm', padding: '4mm 7mm' }}>
                  <p style={{ margin: 0, fontSize: '14pt', lineHeight: 1.16, fontWeight: 800, letterSpacing: '-.02em' }}>
                    Ici, l&rsquo;abonnement n&rsquo;enferme personne.
                  </p>
                  <p style={{ margin: '2mm 0 0', fontSize: '10pt', lineHeight: 1.42, fontWeight: 600, color: 'rgba(255,255,255,.9)' }}>
                    Tu aimes, tu restes. Ça ne te sert plus, tu arrêtes quand tu veux, sans préavis, et ta page reste
                    en ligne, gratuitement.
                  </p>
                  <p style={{ margin: '2.6mm 0 0', fontSize: '17pt', fontWeight: 800, letterSpacing: '-.02em', wordSpacing: '.14em' }}>
                    Yopper un jour, Yopper toujours.
                  </p>
                </div>
              </div>

              {/* ══ L'APPEL À L'ACTION : le QR pour AGIR, et un humain ══ */}
              <div ref={versoPied} style={{ marginTop: 'auto', background: T.panel, color: '#fff', padding: '4.5mm 17mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '7mm' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '22pt', fontWeight: 800, letterSpacing: '-.025em', wordSpacing: '.06em', lineHeight: 1.05 }}>
                    Prêt&nbsp;? Inscris-toi.
                  </p>
                  <p style={{ margin: '2mm 0 0', fontSize: '11pt', fontWeight: 700, color: MENTHE }}>
                    Scanne le code, ou tape yoppaa.app/pro
                  </p>
                  {/* ✅ « On t'appelle » (Alex, 14/10) : le deuxième chemin. */}
                  <p style={{ margin: '3.2mm 0 0', fontSize: '9.6pt', lineHeight: 1.45, fontWeight: 600, color: T.light }}>
                    Une question&nbsp;? <strong style={{ color: '#fff' }}>{CONTACT.nom} · {CONTACT.tel}</strong> (appel ou WhatsApp)<br/>
                    {/* ⚠️ L'IDENTITÉ LÉGALE (`project_avcotech_identite_legale`), et
                        260, JAMAIS 262 : c'est le nombre de communes wallonnes. */}
                    {CONTACT.email} · Une marque d&rsquo;Avcotech SRL, 5640 Mettet · 260 communes en Wallonie
                  </p>
                </div>
                {/* ⚠️ UN QR DES DEUX CÔTÉS : un A4 posé sur un comptoir ne montre
                    qu'une face. Celui-ci mène à l'INSCRIPTION (face de la décision). */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.8mm', flexShrink: 0 }}>
                  <div style={{ background: '#fff', borderRadius: '3mm', padding: '2.6mm' }}>
                    <Qr src={qrInscription} taille="26mm"/>
                  </div>
                  {/* Le pendant de « Scanne pour découvrir » au recto. */}
                  <p style={{ margin: 0, fontSize: '8.6pt', lineHeight: 1.3, fontWeight: 800, color: '#fff', textAlign: 'center' }}>
                    Scanne pour t&rsquo;inscrire
                  </p>
                  <YoppaaLogo size={22} mode="dark"/>
                </div>
              </div>
            </div>
            <Jauge valeur={debVerso}/>
            <Telechargements cible={verso} largeurMm={210} hauteurMm={297} nom={`yoppaa-kit-${seg.cle}-verso`}/>
          </div>
        </div>

        {/* ⚠️ L'ORDRE EST CELUI DE L'IMPRESSION : recto d'abord. */}
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
                  les 100 jours permanents. La règle, jamais une date. */}
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
                Remplis ton<br/>commerce, pas<br/>leurs poches.
              </p>
              <p style={{ margin: '2.4mm 0 0', fontSize: '7.2pt', lineHeight: 1.5, fontWeight: 600, color: T.grey }}>
                Yoppaa ne prend aucune<br/>commission sur tes ventes.
              </p>
              {/* Son QR mène à la landing, comme celui du recto de l'A4. */}
              <p style={{ margin: '2mm 0 0', fontSize: '7.6pt', fontWeight: 800, color: T.main }}>
                Scanne pour découvrir
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
