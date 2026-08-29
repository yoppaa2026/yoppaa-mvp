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

// ⚠️ LA DESTINATION DU QR EST UNE DÉCISION, PAS UN DÉTAIL.
//
// Pas `/pro` : cette route n'est pas une page, c'est un `redirect` vers le
// formulaire d'inscription. Un commerçant qui scanne entre deux clients veut
// REGARDER, pas saisir ses coordonnées. `/pro` reste l'adresse ÉCRITE sur la
// carte, courte et dictable, pour celui qui se décide plus tard et la tape.
//
// Pas la racine non plus : la landing s'ouvre sur le Yopper, et la section
// commerçante est loin en dessous. D'où l'ancre, gardée par `verif:lancement`.
const URL_QR = 'https://www.yoppaa.app/?via=kit#commercants'

const T = {
  ink: '#1A0840', panel: '#160636', deep: '#2D0F6B',
  main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4',
  pale: '#EDE0FF', bg: '#F8F6FF', grey: '#6B7280',
}

const CONTACT = {
  nom: 'Alexandre Verstappen',
  tel: '0492 73 08 69',
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
  if (!src) return <div style={{ width: taille, height: taille, background: '#F3F0FA', borderRadius: '2mm' }}/>
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
  h1: { fontSize: '31pt', lineHeight: 1.04, letterSpacing: '-.03em', fontWeight: 800, margin: '6mm 0 0', textWrap: 'balance' },
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
function TelechargementCombine({ pages }) {
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  const exporter = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      const pdf = await feuillesEnPdf(pages.map(p => p.current), 210, 297)
      telecharger(pdf, 'yoppaa-kit-commercant-recto-verso.pdf', 'application/pdf')
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

export default function KitCommercant() {
  const qr = useQr(URL_QR)
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
                <p style={S.descripteur}>La place de marché<br/>du commerce local belge</p>

                {/* ⚠️ « COMMANDENT » CONTREDISAIT LA PAGE, et Alex l'a vu (29/08) :
                    trois lignes plus bas, les pastilles promettent Alimentaire,
                    Service ET Détail. Or on ne « commande » pas chez un kiné ni chez
                    un garagiste. Le remède n'était pas de chercher un verbe qui couvre
                    les trois métiers, mais de REMONTER D'UN CRAN : on nomme le terrain
                    où se prend la décision, ce qui ne nomme aucun métier.
                    ⚠️ Et « décident » est ACTIF : ni reproche au commerçant, ni
                    fatalité, donc la suite du papier a quelque chose à proposer. */}
                <h1 style={S.h1}>Ils passent devant chez toi.<br/><span style={{ color: T.main }}>Ils décident sur leur téléphone.</span></h1>

                {/* ⚠️ UN EXEMPLE PAR SEGMENT, ET C'EST DÉLIBÉRÉ. Le chapo disait
                    « ni que tu fais des sandwichs le samedi » : le même défaut que le
                    titre, un seul métier nommé sur une page qui promet les trois. On
                    MONTRE l'horizontalité au lieu de la déclarer, trois lignes avant
                    les pastilles qui l'annoncent. */}
                <p style={S.chapo}>
                  Tes clients habitent à trois rues. Ils ne savent pas que tu es ouvert ce midi,
                  que tu prends les rendez-vous en ligne, ni que tu as en rayon ce qu&rsquo;ils cherchent.
                </p>

                {/* L'horizontalité : les catégories réelles de lib/plans.js. */}
                <div style={{ margin: '6mm 0 0', display: 'flex', gap: '3mm', flexWrap: 'wrap' }}>
                  {['Alimentaire', 'Service', 'Détail'].map(m => (
                    <span key={m} style={{ border: `1.2pt solid ${T.main}`, color: T.main, borderRadius: 100, padding: '2mm 5mm', fontSize: '11pt', fontWeight: 800, letterSpacing: '-.01em' }}>{m}</span>
                  ))}
                </div>
                {/* ⚠️ LE FOOD TRUCK EST GLISSÉ ICI, PAS AJOUTÉ EN LIGNE. C'est
                    l'endroit qui traite déjà les objections de taille et de métier :
                    « trop mobile » est la troisième de la même famille, et elle ne
                    coûte pas une ligne de plus sur une page qui n'en a plus. */}
                <p style={{ margin: '3.5mm 0 0', fontSize: '11pt', lineHeight: 1.4, fontWeight: 700, color: T.ink }}>
                  Une échoppe, un food truck ou vingt employés :<br/>personne n&rsquo;est trop petit, ni du mauvais métier, ni trop mobile.
                </p>

                {/* ⚠️ L'OBJECTION D'ALEX, RETOURNÉE EN PUNCHLINE (29/08). Écrire
                    « une place de marché ne prend pas de commission » était
                    contestable : celles que le commerçant connaît en prennent
                    une, et il fait le lien tout seul. On ne nie plus, on
                    tranche entre la place de marché et la place de village. */}
                <div style={{ margin: '4.5mm 0 0', borderLeft: `1.5mm solid ${T.main}`, paddingLeft: '6mm' }}>
                  <p style={{ margin: 0, fontSize: '14.5pt', lineHeight: 1.27, fontWeight: 800, letterSpacing: '-.02em', color: T.ink }}>
                    Les places de marché prennent leur commission.<br/>
                    Les places de village, non.<br/>
                    <span style={{ color: T.main }}>On a choisi le village.</span>
                  </p>
                  <span style={{ display: 'block', marginTop: '3mm', fontSize: '10.4pt', lineHeight: 1.44, fontWeight: 600, color: T.deep }}>
                    Yoppaa ne prend aucune commission sur tes ventes : nous vivons de l&rsquo;abonnement,
                    jamais de ce que tu gagnes. Les frais bancaires, eux, restent ceux de ta banque,
                    comme au comptoir.
                  </span>
                </div>

                {/* ══ GOOD MORNING YOPPERS ══
                    ⚠️ IL EST SUR LE RECTO PARCE QUE CE N'EST PAS UNE FONCTION,
                    C'EST UN ARGUMENT DE PLACE : c'est le seul push quotidien qui
                    sort du cercle des favoris. Vérifié dans le cron :
                    « un push par commune, envoyé à TOUS les Yoppers de la
                    commune », 05:30 UTC soit 07:30 à Bruxelles. */}
                <div style={{ margin: '4.5mm 0 0', background: T.panel, color: '#fff', borderRadius: '4mm', padding: '5mm 6.5mm' }}>
                  <p style={{ margin: 0, fontSize: '14pt', fontWeight: 800, letterSpacing: '-.02em', lineHeight: 1.15 }}>
                    Good Morning Yoppers,<br/>la gazette du quartier <span style={{ color: T.light }}>à 7 h 30.</span>
                  </p>
                  <p style={{ margin: '2.6mm 0 0', fontSize: '10.2pt', lineHeight: 1.36, fontWeight: 600, color: T.light }}>
                    Elle part chaque matin chez <strong style={{ color: '#fff' }}>tous les habitants qui ont choisi
                    ta commune</strong>, et pas seulement chez ceux qui t&rsquo;ont mis en favori.
                    C&rsquo;est le seul rendez-vous quotidien qui sort de ton cercle.
                    <strong style={{ color: '#fff' }}> Invite tes clients à rejoindre Yoppaa</strong> : plus la
                    communauté est grande, plus la place profite à tout le quartier, et à toi.
                  </p>
                </div>
              </div>

              {/* ══ LE SOCLE : l'offre et le QR, sur le seul bloc violet ══ */}
              <div ref={rectoPied} style={{ marginTop: 'auto', background: T.panel, color: '#fff', padding: '7.5mm 17mm', display: 'flex', alignItems: 'center', gap: '8mm' }}>
                <div style={{ flex: 1 }}>
                  {/* ⚠️ LA DATE D'OUVERTURE EST PASSÉE DANS LE SUR-TITRE. Elle ne
                      coûte pas une ligne de plus sur une page qui n'en a plus, et
                      elle est à sa place : c'est le premier mot du bloc de l'offre. */}
                  <p style={{ margin: 0, fontSize: '8.4pt', fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase', color: T.light }}>Ouverture le 1er octobre</p>
                  <p style={{ margin: '2.5mm 0 0', fontSize: '20pt', fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.12 }}>
                    Gratuit jusqu&rsquo;au<br/>8 janvier 2027.
                  </p>

                  {/* ══ L'URGENCE, ET ELLE EST VRAIE ══
                      🔴 VÉRIFIÉE DANS `lib/lancement.js` AVANT D'ÊTRE ÉCRITE, parce
                      qu'un papier ne se corrige plus. La règle d'Alex du 20/08 est une
                      CONSTANTE, pas un compteur par commerçant : l'essai finit le
                      8 janvier 2027 pour tout le monde, avec un plancher de 30 jours.
                      Donc s'inscrire plus tard donne VRAIMENT moins de jours offerts,
                      et on n'invente aucune rareté.
                      ⚠️ Et on n'imprime AUCUN décompte : un nombre de jours serait faux
                      la semaine suivante. On imprime la RÈGLE, qui reste vraie. */}
                  <p style={{ margin: '2.6mm 0 0', fontSize: '9.4pt', lineHeight: 1.4, fontWeight: 600, color: T.light }}>
                    La même date pour tout le monde, quel que soit le jour où tu t&rsquo;inscris.
                    <strong style={{ color: '#fff' }}> Chaque semaine d&rsquo;attente est une semaine offerte
                    en moins.</strong> Sans carte de paiement.
                  </p>

                  {/* ══ LES TROIS FORMULES, EN CLAIR ══
                      ⚠️ LES MONTANTS VIENNENT DE `lib/plans.js`, ILS NE SONT PAS
                      RECOPIÉS. Ils y sont paramétrables par variable d'environnement :
                      un prix écrit en dur ici divergerait de l'application au premier
                      changement de tarif, et sur du papier ça ne se rattrape plus.
                      ⚠️ HTVA, comme partout ailleurs dans l'app : on s'adresse à des
                      professionnels, et un prix TTC sous-entendu serait un piège.
                      ⚠️ EN UN SEUL PARAGRAPHE et pas en trois lignes : la version
                      empilée coûtait sept millimètres que le recto n'a pas. */}
                  <p style={{ margin: '2.8mm 0 0', fontSize: '9.4pt', lineHeight: 1.4, fontWeight: 600, color: T.light }}>
                    Ensuite, tu choisis : <strong style={{ color: '#fff' }}>Exister</strong> gratuit à vie,
                    <strong style={{ color: '#fff' }}> Communiquer</strong> {euros(getPrixPlan('communiquer').mensuel)},
                    <strong style={{ color: '#fff' }}> Vendre</strong> {euros(getPrixPlan('vendre').mensuel)}, HTVA par mois.
                    <strong style={{ color: '#fff' }}> Zéro engagement, zéro ambiguïté</strong> : tu changes
                    de formule ou tu arrêtes quand tu veux.
                  </p>
                </div>
                <div>
                  {/* Le QR reste sur BLANC : un code violet sur violet ne se lit pas. */}
                  <div style={{ background: '#fff', borderRadius: '3.5mm', padding: '3mm' }}>
                    <Qr src={qr} taille="30mm"/>
                  </div>
                  <p style={{ margin: '3mm 0 0', fontSize: '8.2pt', lineHeight: 1.3, fontWeight: 800, color: '#fff', textAlign: 'center' }}>
                    Ta fiche est prête<br/>en cinq minutes
                  </p>
                </div>
              </div>
            </div>
            <Jauge valeur={debRecto}/>
            <Telechargements cible={recto} largeurMm={210} hauteurMm={297} nom="yoppaa-kit-commercant-recto"/>
          </div>

          {/* ══════════════ VERSO ══════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="feuille" ref={verso} style={feuille}>
              <div ref={versoCorps} style={padVerso}>
                <p style={S.eyebrow}>Ton étal, dès lundi</p>
                <h2 style={S.h2}>Ta vitrine ne ferme plus <span style={{ color: T.main }}>à dix-huit heures.</span></h2>

                <ul style={{ listStyle: 'none', margin: '4mm 0 0', padding: 0, display: 'grid', gap: '2.7mm' }}>
                  <Point>Un client voit tes <b>horaires du jour</b> à onze heures du soir.</Point>
                  <Point>Il <b>commande</b>, il <b>prend rendez-vous</b>, il <b>achète son abonnement</b>, il <b>se fait livrer</b>. Sans que ton téléphone sonne pendant le service.</Point>
                  <Point>Il paie <b>en ligne par Bancontact ou chez toi au comptoir</b> : c&rsquo;est toi qui décides. <b>C&rsquo;est ton argent.</b></Point>
                  <Point>Il <b>t&rsquo;offre à quelqu&rsquo;un</b> : le bon cadeau est payé, tu l&rsquo;encaisses au comptoir.</Point>
                  <Point>Il revient, et <b>sa carte de fidélité</b> se remplit toute seule. Sans boîtier, sans carton.</Point>
                  <Point>Tes <b>actus, tes deals et tes bonnes affaires</b> arrivent sur le téléphone de ceux qui t&rsquo;ont mis en favori.</Point>
                  <Point>Tu vois <b>ce que tu as vendu</b>, jour par jour, et ton <b>export comptable</b> est prêt.</Point>
                </ul>

                {/* ══ LE COMMUNAUTAIRE, MONTRÉ ET NON DÉCLARÉ ══
                    Les deux phrases sont celles de `lib/signaux.js`, mot pour
                    mot. Un commerçant croit une capture d'écran, pas un
                    adjectif. */}
                <p style={{ ...S.eyebrow, marginTop: '4mm' }}>L&rsquo;application est communautaire</p>
                <h2 style={{ ...S.h2, fontSize: '16pt' }}>Tes clients te disent<br/><span style={{ color: T.main }}>ce qui leur manque.</span></h2>
                <p style={{ ...S.chapo, marginTop: '2.6mm', fontSize: '10.4pt' }}>
                  Une fonction que tu n&rsquo;as pas encore activée ? Depuis ta fiche, un habitant peut te
                  dire qu&rsquo;il aimerait l&rsquo;avoir chez toi. Tu reçois la demande, tu décides.
                </p>
                <div style={{ margin: '3mm 0 0', display: 'grid', gap: '2.2mm' }}>
                  {['3 habitants ont voulu commander chez toi',
                    '2 habitants aimeraient une carte de fidélité chez toi'].map(t => (
                    <div key={t} style={{ background: T.bg, border: `1.2pt solid ${T.pale}`, borderRadius: '3mm', padding: '2.4mm 4.4mm', display: 'flex', gap: '3.4mm', alignItems: 'center' }}>
                      <span style={{ flex: '0 0 auto', width: '3.6mm', height: '3.6mm', borderRadius: '50%', background: T.main }}/>
                      <p style={{ margin: 0, fontSize: '10.4pt', lineHeight: 1.3, fontWeight: 700, color: T.ink }}>{t}</p>
                    </div>
                  ))}
                </div>

                {/* ══ LE CLOSER, EN DEUX TEMPS ══
                    « Pas de raison de refuser » tue l'objection, « une raison
                    d'y aller maintenant » met en mouvement. ⚠️ L'urgence ne
                    dresse PAS le commerçant contre son voisin : chaque échoppe
                    de plus rend la place plus utile aux autres. */}
                <div style={{ margin: '5mm 0 0', background: T.bg, border: `1.4pt solid ${T.main}`, borderRadius: '4mm', padding: '5mm 6mm' }}>
                  <p style={{ margin: 0, fontSize: '14.5pt', lineHeight: 1.16, fontWeight: 800, letterSpacing: '-.025em', color: T.ink }}>
                    Tu n&rsquo;as aucune raison<br/>de ne pas y être.
                  </p>
                  <p style={{ margin: '2.4mm 0 0', fontSize: '10.2pt', lineHeight: 1.44, fontWeight: 600, color: T.deep }}>
                    Le forfait Exister est <strong>gratuit à vie</strong> : ta fiche, tes horaires, tes photos,
                    et les habitants qui te cherchent te trouvent. Zéro euro, zéro engagement.
                    <strong> Tu gardes tes clients et ta marge</strong>, leurs coordonnées sont à toi.
                  </p>
                  <hr style={{ border: 0, borderTop: `1.2pt solid ${T.pale}`, margin: '3.4mm 0' }}/>
                  <p style={{ margin: 0, fontSize: '14.5pt', lineHeight: 1.16, fontWeight: 800, letterSpacing: '-.025em', color: T.main }}>
                    Tu en as une<br/>d&rsquo;y être maintenant.
                  </p>
                  <p style={{ margin: '2.4mm 0 0', fontSize: '10.2pt', lineHeight: 1.44, fontWeight: 600, color: T.deep }}>
                    Une place de marché avec trois échoppes n&rsquo;attire personne. Avec trente, c&rsquo;est tout
                    le village qui vient. <strong>Chaque commerce qui s&rsquo;installe rend la place plus utile
                    aux autres</strong>, et à toi.
                  </p>
                </div>
              </div>

              <div ref={versoPied} style={{ marginTop: 'auto', background: T.pale, padding: '6mm 17mm', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '6mm' }}>
                <div>
                  <p style={{ margin: 0, fontSize: '11.5pt', fontWeight: 800, letterSpacing: '-.02em', color: T.ink, lineHeight: 1.2 }}>
                    Tu commences ici.<br/><span style={{ color: T.main }}>Avec ceux d&rsquo;à côté.</span>
                  </p>
                  <p style={{ margin: '3mm 0 0', fontSize: '9.4pt', lineHeight: 1.42, fontWeight: 600, color: T.grey }}>
                    {/* ⚠️ LE CONTACT TIENT SUR UNE SEULE LIGNE, ET C'EST CE QUI PAIE
                        LA MENTION LÉGALE. Le verso n'avait que 5,9 mm de marge :
                        ajouter une ligne sans en reprendre une l'aurait fait passer
                        en « de justesse ». Trois lignes avant, trois lignes après. */}
                    {CONTACT.nom} · {CONTACT.tel} · {CONTACT.email}<br/>
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
                  <YoppaaLogo size={22} mode="light"/>
                </div>
              </div>
            </div>
            <Jauge valeur={debVerso}/>
            <Telechargements cible={verso} largeurMm={210} hauteurMm={297} nom="yoppaa-kit-commercant-verso"/>
          </div>
        </div>

        {/* ⚠️ L'ORDRE EST CELUI DE L'IMPRESSION : recto d'abord. Un PDF dont les
            faces sont inversées ne se voit qu'une fois la pile sortie. */}
        <TelechargementCombine pages={[recto, verso]}/>

        {/* ══════════════ CARTE DE VISITE ══════════════ */}
        <h2 className="notice" style={{ margin: '44px 0 14px', fontSize: 20, fontWeight: 800, letterSpacing: '-.4px', color: T.ink }}>
          La carte de visite · 85 × 55 mm
        </h2>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', alignItems: 'flex-start' }}>
         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="carte" ref={carteTexte} style={{ width: '85mm', height: '55mm', borderRadius: '3mm', overflow: 'hidden', background: '#fff', color: T.ink, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-jakarta), system-ui, sans-serif', boxShadow: '0 8px 28px rgba(26,8,64,.26)' }}>
            <div style={{ padding: '5.5mm 6mm 0', flex: 1 }}>
              <YoppaaLogo size={21} mode="light"/>
              <p style={{ margin: '3.5mm 0 0', fontSize: '6.8pt', fontWeight: 800, letterSpacing: '.15em', textTransform: 'uppercase', color: T.main, lineHeight: 1.5 }}>
                La place de marché<br/>du commerce local belge
              </p>
              <p style={{ margin: '2.5mm 0 0', fontSize: '7.6pt', fontWeight: 700, color: T.ink }}>Alimentaire · Service · Détail</p>
              <p style={{ margin: '2.4mm 0 0', fontSize: '7.2pt', lineHeight: 1.5, fontWeight: 600, color: T.grey }}>
                <strong style={{ color: T.ink, fontSize: '8.4pt' }}>{CONTACT.nom}</strong><br/>
                {CONTACT.tel} · {CONTACT.email}
              </p>
            </div>
            <div style={{ background: T.panel, color: '#fff', padding: '3.2mm 6mm', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '3mm' }}>
              <p style={{ margin: 0, fontSize: '8pt', fontWeight: 800, letterSpacing: '-.01em' }}>Gratuit jusqu&rsquo;au 8 janvier 2027</p>
              <span style={{ fontSize: '7pt', fontWeight: 700, color: T.light }}>yoppaa.app/pro</span>
            </div>
          </div>
          <Telechargements cible={carteTexte} largeurMm={85} hauteurMm={55} nom="yoppaa-carte-visite-recto"/>
         </div>

         <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="carte" ref={carteQr} style={{ width: '85mm', height: '55mm', borderRadius: '3mm', overflow: 'hidden', background: '#fff', color: T.ink, display: 'flex', alignItems: 'center', gap: '5mm', padding: '6mm', fontFamily: 'var(--font-jakarta), system-ui, sans-serif', boxShadow: '0 8px 28px rgba(26,8,64,.26)' }}>
            <Qr src={qr} taille="22mm"/>
            <div>
              <p style={{ margin: 0, fontSize: '10pt', fontWeight: 800, lineHeight: 1.22, letterSpacing: '-.02em' }}>
                Scanne.<br/>Ta fiche est prête<br/>en cinq minutes.
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
