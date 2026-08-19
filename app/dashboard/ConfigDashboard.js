'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { canDo, getIaConfig } from '@/lib/plans'
// ⚠️ Les bornes viennent de la source unique : écrites à la main dans ce texte,
// elles auraient menti au commerçant le jour où on les change.
import { normaliserCodeBon, BON_MONTANT_MIN, BON_MONTANT_MAX } from '@/lib/bons-cadeaux'
import { estRemiseSurProduit } from '@/lib/deals'
import { PACKS_SMS } from '@/lib/packs-sms'
import { avantLancement, libelleLancement } from '@/lib/lancement'
import { classerProduitsParCategorie, produitParType } from '@/lib/produits-boutique'
import { lieuEnConflit, horairesDepuisLieux } from '@/lib/lieux-activite'
import { capacitePrestation } from '@/lib/cours-collectifs'
import { optionsTaux, CAT_SERVICE } from '@/lib/tva-aide'
// ⚠️ Trois fonctions de moins depuis le 18/08, et le lieu avec elles : cet écran
// ne pose plus une seule séance, il crée le contrat. Le placement d'une série et
// la gravure du lieu n'ont pas été supprimés du projet, c'est le geste d'agenda
// qui les reprend.
import { exclusionsQuiSeChevauchent, seancesDeLaFormule, fenetreDeValidite, phraseApercuFormule, expliquerApercuFormule, soldeAbonnement, seancesConsommees, MOYENS_ENCAISSEMENT, libelleMoyenEncaissement } from '@/lib/abonnements'
import ChampAdresse from '@/app/components/ChampAdresse'
import TabGenerateur from './TabGenerateur'
import BoutonIaInline from './BoutonIaInline'
import { champsModifies } from '@/lib/formulaire-modifie'
import { peutActiverRdv, etatActivationRdv } from '@/lib/activation-rdv'
import { BarreEnregistrer, ModaleQuitter, useAvertirAvantDeQuitter } from './BarreEnregistrer'
// ⚠️ Le POSTE qui affiche ces fenêtres est monté une seule fois, dans
// `app/dashboard/page.js`, qui rend cet écran. On n'importe ici que la
// fonction qui pose la question.
import { confirme } from './PosteConfirmation'
import { confirmationSimple } from '@/lib/confirmations'
import SelecteurTypes from '@/app/components/SelecteurTypes'
import BandeDefilante from '@/app/components/BandeDefilante'
// ⚠️ `estFoodTruck` NE SERT PLUS ICI, ET C'EST VOULU. Le métier ne dit pas si
// un commerce bouge, ce sont ses LIEUX qui le disent : une professeure de yoga
// et un food truck n'ont pas le même métier et ont le même besoin. Cette
// section a cessé d'être conditionnée au métier le 12/08, et son dernier usage,
// un titre qui changeait selon la catégorie, est parti le 13/08.
import { jourLocalISO, jourSemaineLocal, jourBruxelles } from '@/lib/timezone'
import { poserSiChange, ecranRegarde } from '@/lib/rafraichissement'
import TabPaiements from './TabPaiements'
import { compresserImage, preparerPhotoArticle } from '@/lib/compress-image'
import { normaliserTelephone, afficherTelephone, appliquerCredit, libelleRecompense, presetFidelite } from '@/lib/fidelite'
import { libelleEnvie, phraseHorsOuverture } from '@/lib/signaux'
import { MAX_PHOTOS, conseilPhoto, etatGalerie, deplacerPhoto, metierPhotos } from '@/lib/guide-photos'
import { LARGEUR_CHAMP, LARGEUR_TEXTE_LONG } from '@/lib/responsive'
// Icônes Lucide React (alignées sur la charte canonique Yoppaa).
// Aucun emoji dans l'UI sauf exceptions ☀️ (soleil GMY) et 🟣 (signature identitaire).
import {
  Check, AlertTriangle, Calendar, Clock, Lock, Trash2, Copy, Zap, Phone,
  Sun, Star, Settings, Package, Lightbulb, Camera, Store, Scissors, Croissant,
  BellOff, ClipboardList, Bike, MapPin, FileText, Printer, Download,
  Eye, Globe, Users, MessageCircle, Sparkles, Reply,
} from 'lucide-react'

const T = {
  bg:      '#F8F6FF',
  bgCard:  '#FFFFFF',
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
  hairline:'#EEE9F5',
}

const s = {
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    border: `1px solid ${T.hairline}`,
    boxShadow: '0 1px 3px rgba(22,6,54,0.04)',
    // ⚠️ UNE CARTE NE DOIT JAMAIS POUSSER LA PAGE HORS DE L'ÉCRAN. Le padding
    // s'ajoutait à la largeur sans `border-box`, et un contenu insécable, une
    // adresse email ou un lien, l'élargissait encore : le tableau de bord se
    // mettait à défiler latéralement, et le commerçant voyait ses cartes
    // décalées avec une bande vide à droite.
    boxSizing: 'border-box',
    maxWidth: '100%',
    // Un mot qui ne peut pas être coupé, comme
    // « verstappenalexandre+ciseauxprovisoires@gmail.com », force sinon la
    // largeur de son conteneur, quelles que soient les règles au-dessus.
    overflowWrap: 'anywhere',
  },
  cardActive: {
    background: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    border: `1.5px solid ${T.bgPanel}`,
    boxShadow: `0 8px 24px rgba(22,6,54,0.12)`,
    // Mêmes garde-fous que `card` : une carte ouverte déborde exactement comme
    // une carte fermée, et c'est même elle qu'on regarde quand on saisit.
    boxSizing: 'border-box',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: T.muted,
    marginBottom: 6,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    // ⚠️ PLAFOND DE LARGEUR (09/08). `width: 100%` sans plafond, dans une carte
    // sans plafond non plus : sur un écran de 1920 avec la barre latérale,
    // chaque champ faisait 1 600 px de large. Vingt caractères à saisir dans un
    // champ d'un mètre de pixels donne l'impression d'un formulaire cassé, et
    // l'œil perd le début de la ligne en arrivant à la fin.
    // Sans effet sur mobile : l'écran y est plus étroit que le plafond.
    maxWidth: LARGEUR_CHAMP,
    padding: '10px 14px',
    borderRadius: 10,
    border: `1px solid ${T.hairline}`,
    fontSize: 14,
    color: T.ink,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: '"DM Sans", sans-serif',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  inputFocus: { borderColor: T.bgPanel, boxShadow: `0 0 0 3px rgba(22,6,54,0.08)` },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 18px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"DM Sans", sans-serif',
    fontWeight: 700,
    fontSize: 13,
    transition: 'all 0.15s',
  },
  btnPrimary: { background: T.bgPanel, color: '#fff', boxShadow: '0 4px 12px rgba(22,6,54,0.18)' },
  btnGhost:   { background: '#fff', color: T.bgPanel, border: `1px solid ${T.hairline}` },
  btnDanger:  { background: '#fff', color: '#DC2626', border: '1px solid #FCA5A5' },
  h2: { fontSize: 17, fontWeight: 800, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 16px' },
  h3: { fontSize: 13, fontWeight: 700, color: T.muted, margin: '0 0 4px' },
  tag: { display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 },
}

// ⚠️ IL AVALAIT LES `onFocus` ET `onBlur` QU'ON LUI DONNAIT, EN SILENCE. Ses
// propres gestionnaires étaient écrits APRÈS le `{...props}`, donc ils
// gagnaient : un appelant qui passait `onBlur` ne voyait jamais son code
// s'exécuter, sans la moindre erreur ni le moindre avertissement. Trouvé le
// 15/08 en posant la normalisation du plafond hebdomadaire, qui serait restée
// morte. Les deux sont désormais CHAÎNÉS : le nôtre pour le liseré de focus,
// puis celui de l'appelant.
function Input({ style, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <input {...props}
      style={{ ...s.input, ...(focused ? s.inputFocus : {}), ...style }}
      onFocus={(e) => { setFocused(true); onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); onBlur?.(e) }}
    />
  )
}

// Même correction que sur `Input`, et pour la même raison : il avalait lui aussi
// les gestionnaires de focus qu'on lui passait. Personne ne s'en servait encore,
// mais le premier qui l'aurait fait aurait cherché longtemps.
function Textarea({ style, onFocus, onBlur, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea {...props}
      // Un texte long a droit à plus de largeur qu'un champ d'une ligne, mais
      // pas à toute la largeur de l'écran pour autant.
      style={{ ...s.input, maxWidth: LARGEUR_TEXTE_LONG, resize: 'vertical', minHeight: 80, ...(focused ? s.inputFocus : {}), ...style }}
      onFocus={(e) => { setFocused(true); onFocus?.(e) }}
      onBlur={(e) => { setFocused(false); onBlur?.(e) }}
    />
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div onClick={() => onChange(!value)}
        style={{ width: 44, height: 24, borderRadius: 12, background: value ? T.bgPanel : '#E5E7EB', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
      </div>
      {label && <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{label}</span>}
    </label>
  )
}

function Toast({ message, type }) {
  if (!message) return null
  return (
    <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: type === 'error' ? '#DC2626' : T.bgPanel || T.deep, color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: `0 8px 24px rgba(22,6,54,0.25)`, whiteSpace: 'nowrap' }}>
      {message}
    </div>
  )
}

// ─── Bibliothèque d'icônes SVG line-style (cohérence avec footer client) ─────
function Icon({ name, size = 16, color = 'currentColor', strokeWidth = 2 }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const paths = {
    menu:      <><rect x="3" y="6" width="18" height="3" rx="1"/><rect x="3" y="11" width="18" height="3" rx="1"/><rect x="3" y="16" width="18" height="3" rx="1"/></>,
    clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></>,
    shop:      <><path d="M3 7h18l-1.5 13a2 2 0 01-2 2h-11a2 2 0 01-2-2L3 7z"/><path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2"/></>,
    star:      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>,
    edit:      <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
    trash:     <><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/></>,
    check:     <path d="M5 12l5 5L20 7"/>,
    x:         <path d="M18 6L6 18M6 6l12 12"/>,
    plus:      <path d="M12 5v14M5 12h14"/>,
    minus:     <path d="M5 12h14"/>,
    search:    <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    tag:       <><path d="M20 12l-8.5 8.5a2 2 0 01-2.83 0L2 13.83V4h9.83L20 12z"/><circle cx="7.5" cy="7.5" r="1.5"/></>,
    box:       <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"/></>,
    sliders:   <><path d="M4 6h11M19 6h1M4 12h6M14 12h6M4 18h13M21 18h-1"/><circle cx="17" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="18" r="2"/></>,
    calendar:  <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    chevR:     <path d="M9 6l6 6-6 6"/>,
    chevL:     <path d="M15 6l-6 6 6 6"/>,
    chevD:     <path d="M6 9l6 6 6-6"/>,
    chevU:     <path d="M6 15l6-6 6 6"/>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></>,
    sparkles:  <><path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/><path d="M18.5 14l.85 2.15L21.5 17l-2.15.85L18.5 20l-.85-2.15L15.5 17l2.15-.85L18.5 14z"/></>,
    heart:     <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7z"/>,
    gift:      <><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></>,
    // Ondes : ce que les habitants envoient vers le commerce.
    signal:    <><path d="M12 20v-8"/><path d="M8.5 15.5a5 5 0 017 0"/><path d="M5.5 12.5a9 9 0 0113 0"/><path d="M2.5 9.5a13 13 0 0119 0"/></>,
    chart:     <><path d="M3 3v18h18"/><path d="M7 15l3-4 3 3 5-7"/></>,
    info:      <><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></>,
  }
  // ⚠️ Un nom inconnu rendait un SVG VIDE, sans la moindre erreur : ni au lint,
  // ni au build, ni au banc. Juste un trou dans l'interface que personne ne
  // remarque avant de tomber dessus.
  if (!paths[name] && typeof console !== 'undefined') console.warn(`[Icon] nom inconnu : ${name}`)
  return <svg {...props} style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>{paths[name]}</svg>
}

// ─── Onglet MENU ──────────────────────────────────────────────────────────────
// Sélecteur des propositions IA (articles, deals, actus) : le commerçant tape
// celle qu'il préfère, elle remplit le(s) champ(s), modifiable ensuite.
// avecLong = affiche aussi la version longue sous l'accroche (deals/actus).
function PropositionsIa({ propositions, onChoisir, onFermer, avecLong = false }) {
  if (!propositions?.length) return null
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <p style={{ fontSize: 10.5, fontWeight: 800, color: T.main, margin: 0 }}>Choisis une proposition (tu pourras encore la modifier) :</p>
      {propositions.map((v, i) => (
        <button key={i} type="button" onClick={() => onChoisir(v)}
          style={{ textAlign: 'left', padding: '9px 11px', borderRadius: 10, border: '1.5px solid #EDE0FF', background: '#FAF8FE', fontSize: 12.5, color: T.ink, cursor: 'pointer', lineHeight: 1.45, fontFamily: 'inherit' }}>
          {v.court || v.long}
          {avecLong && v.court && v.long ? <span style={{ display: 'block', marginTop: 4, fontSize: 11, color: T.muted }}>{v.long}</span> : null}
        </button>
      ))}
      <button type="button" onClick={onFermer}
        style={{ justifySelf: 'start', padding: 0, border: 'none', background: 'none', fontSize: 11, fontWeight: 700, color: T.muted, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
        Aucune ne me convient
      </button>
    </div>
  )
}

function TabMenu({ commercantId, commercant, toast }) {
  // ─── Mode vitrine ou menu commandable ────────────────────────────────────
  // Catégorie='vitrine' (coiffeur, opticien…) : depuis le 31/07, chaque produit
  // choisit son mode via un toggle « Vendable à la commande » : vendable =
  // prix ferme + stock permanent (modèle détail, est_vitrine=false), sinon
  // prix indicatif « à partir de » non commandable (est_vitrine=true).
  const estVitrine = commercant?.categorie === 'vitrine'
  // Détail (boutique) : stock PERMANENT simple par article (ou par variante),
  // pas de stock par jour ni de temps de préparation (concepts C&C alimentaire).
  const estDetail = commercant?.categorie === 'detail'
  // Alimentaire : seul segment concerné par le double taux de TVA, la même
  // denrée relevant de la livraison de biens à emporter et de la restauration
  // quand elle est consommée en salle.
  const estAlimentaire = !estVitrine && !estDetail
  // Variantes (matrice taille/couleur) proposées au détail et au service.
  // L'alimentaire garde son système d'options/suppléments.
  const variantesCategorie = estDetail || estVitrine
  // Jours où le commerce est FERMÉ selon les horaires du Profil : le stock y est
  // présenté comme fermé automatiquement (dérogation possible après confirmation).
  const joursFermes = JOURS_KEYS.filter(j => commercant?.horaires_detail?.[j]?.ouvert === false)
  // Fermetures exceptionnelles (congés) à venir : les chips représentent les 7
  // prochains jours, on marque celles dont la prochaine occurrence tombe dans
  // une période de fermeture (onglet Créneaux).
  const [fermeturesExcept, setFermeturesExcept] = useState([])
  useEffect(() => {
    const d = new Date()
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    supabase.from('fermetures_exceptionnelles')
      .select('date_debut, date_fin, motif')
      .eq('commercant_id', commercantId)
      .gte('date_fin', iso)
      .then(({ data }) => setFermeturesExcept(data || []))
  }, [commercantId])
  const fermeturesSemaine = (() => {
    const map = {}
    const now = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(now); d.setDate(now.getDate() + i)
      const jsIdx = d.getDay()
      const cle = JOURS_KEYS[jsIdx === 0 ? 6 : jsIdx - 1]
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const f = fermeturesExcept.find(fe => fe.date_debut <= iso && iso <= fe.date_fin)
      if (f) map[cle] = { motif: f.motif || null }
    }
    return map
  })()
  // ─── Sous-onglet actif : Articles | Catégories | Personnalisation ────────
  const [subTab, setSubTab] = useState('articles')
  const [searchQuery, setSearchQuery] = useState('')

  const [articles, setArticles] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCatForm, setShowCatForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: '', photo_url: '', vendable: true })
  const [nouvelleCat, setNouvelleCat] = useState('')
  const [nouvelleCatParent, setNouvelleCatParent] = useState('')
  const [saving, setSaving] = useState(false)
  const [catActive, setCatActive] = useState('Tous')
  // Renommage catégorie
  const [renamingCat, setRenamingCat] = useState(null) // nom de la cat en cours de renommage
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)
  // Photos article : couverture (articles.photo_url) + galerie (article_photos)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [galerie, setGalerie] = useState([])
  const [uploadingGalerie, setUploadingGalerie] = useState(false)
  // Propositions IA pour la description : le commerçant choisit puis peut modifier
  const [propsIa, setPropsIa] = useState([])

  // FIX STOCK : afficher le stock restant côté commerçant
  const [commandesParArticleJour, setCommandesParArticleJour] = useState({})
  // La mémoire du relevé de fond : rien n'est reposé quand rien n'a bougé.
  const memoireCommandesJour = useRef(null)
  // STOCK PAR JOUR : { articleId: { lundi: { stock, actif }, mardi: ... } }
  const [stockParJourMap, setStockParJourMap] = useState({})

  // 1er fetch = affiche "Chargement…". Les re-fetch (apres save/delete)
  // ne toggle pas loading pour ne pas demonter la liste et perdre le scroll.
  const firstLoadRef = useRef(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchArticles() }, [commercantId])

  async function fetchArticles() {
    if (firstLoadRef.current) setLoading(true)
    const { data } = await supabase.from('articles').select('*').eq('commercant_id', commercantId).order('categorie').order('nom')
    setArticles(data || [])
    const cats = [...new Set((data || []).map(a => a.categorie).filter(Boolean))]
    setCategories(cats)
    if (firstLoadRef.current) {
      setLoading(false)
      firstLoadRef.current = false
    }
    // Charger les stocks par jour
    const artIds = (data || []).map(a => a.id)
    if (artIds.length > 0) {
      const { data: sjData } = await supabase
        .from('article_stock_jour')
        .select('*')
        .eq('commercant_id', commercantId)
        .in('article_id', artIds)
      const map = {}
      ;(sjData || []).forEach(r => {
        if (!map[r.article_id]) map[r.article_id] = {}
        map[r.article_id][r.jour_semaine] = { stock: r.stock, actif: r.actif }
      })
      setStockParJourMap(map)
    } else {
      setStockParJourMap({})
    }
  }

  // Upsert le stock pour un (article, jour). Si la contrainte unique n'existe
  // pas, on fait delete puis insert.
  async function setStockJour(articleId, jourSemaine, stock, actif) {
    const payload = { commercant_id: commercantId, article_id: articleId, jour_semaine: jourSemaine, stock: Math.max(0, parseInt(stock) || 0), actif: !!actif }
    const { error } = await supabase
      .from('article_stock_jour')
      .upsert(payload, { onConflict: 'article_id,jour_semaine' })
    if (error) {
      await supabase.from('article_stock_jour').delete().eq('article_id', articleId).eq('jour_semaine', jourSemaine)
      await supabase.from('article_stock_jour').insert(payload)
    }
    setStockParJourMap(prev => ({
      ...prev,
      [articleId]: { ...(prev[articleId] || {}), [jourSemaine]: { stock: payload.stock, actif: payload.actif } },
    }))
  }

  // Applique un dispo aux jours d'OUVERTURE (les jours fermés au Profil sont
  // ignorés). Pour le jour actuel on rajoute déjà_commandé.
  async function setStockTousJours(articleId, dispo, consoParJour = {}) {
    const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
    const ouverts = JOURS.filter(j => !joursFermes.includes(j))
    await Promise.all(ouverts.map(j => {
      // Brut = dispo saisi + déjà commandé POUR CE JOUR de retrait (bug 14)
      const brut = dispo + (consoParJour[j] || 0)
      return setStockJour(articleId, j, brut, true)
    }))
    toast(joursFermes.length > 0 ? 'Stock appliqué aux jours d\'ouverture' : 'Stock appliqué aux 7 jours')
  }

  // Charge les quantités commandées par article ET PAR JOUR DE RETRAIT sur les
  // 7 prochains jours (bug 14 : une commande passée dimanche POUR lundi doit
  // consommer le stock de LUNDI et apparaître sur la chip lundi, pas dimanche).
  // Map résultat : { articleId: { lundi: qte, mardi: qte, ... } }
  const chargerCommandesAujourdhui = useCallback(async () => {
    if (!commercantId) return
    const jours = []
    const jourKeyParDate = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i)
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const jsIdx = d.getDay()
      jourKeyParDate[iso] = JOURS_KEYS[jsIdx === 0 ? 6 : jsIdx - 1]
      jours.push(iso)
    }
    const { data: cmds } = await supabase
      .from('commandes')
      .select('id, date_commande')
      .eq('commercant_id', commercantId)
      .in('date_commande', jours)
      .neq('statut', 'non_retire')
    if (!cmds || cmds.length === 0) { poserSiChange(memoireCommandesJour, {}, setCommandesParArticleJour); return }
    const jourParCmd = Object.fromEntries(cmds.map(c => [c.id, jourKeyParDate[String(c.date_commande).slice(0, 10)]]))
    const { data: lignes } = await supabase
      .from('commande_articles')
      .select('article_id, quantite, commande_id')
      .in('commande_id', cmds.map(c => c.id))
    const map = {}
    ;(lignes || []).forEach(r => {
      const jk = jourParCmd[r.commande_id]
      if (!jk) return
      if (!map[r.article_id]) map[r.article_id] = {}
      map[r.article_id][jk] = (map[r.article_id][jk] || 0) + r.quantite
    })
    poserSiChange(memoireCommandesJour, map, setCommandesParArticleJour)
  }, [commercantId])

  // ⚠️ MÊME DÉFAUT QUE SUR LA FICHE CLIENT, TROUVÉ EN CHERCHANT SES FRÈRES.
  // Ce relevé tournait toutes les cinq secondes, sans regarder si le commerçant
  // avait les yeux sur l'écran, et reposait la carte des quantités avec un
  // objet neuf à chaque passage : l'onglet entier se redessinait pendant qu'il
  // tapait un prix. Deux requêtes douze fois par minute, pour des chiffres qui
  // ne bougent qu'au rythme des commandes.
  useEffect(() => {
    if (!commercantId) return
    chargerCommandesAujourdhui()
    const id = setInterval(() => {
      if (!ecranRegarde()) return
      chargerCommandesAujourdhui()
    }, 30000)
    return () => clearInterval(id)
  }, [commercantId, chargerCommandesAujourdhui])

  // Taux de TVA proposés au commerçant. Ils sont LUS EN BASE et jamais écrits
  // dans le code : la TVA est une matière fédérale et mouvante, un changement
  // doit se régler par une ligne dans tva_taux_reference, pas par un déploiement.
  const [tvaRefs, setTvaRefs] = useState([])
  useEffect(() => {
    let annule = false
    supabase.from('tva_taux_reference').select('taux, libelle, aide').eq('actif', true).order('ordre')
      .then(({ data }) => { if (!annule) setTvaRefs(data || []) })
    return () => { annule = true }
  }, [])

  function openNew() {
    setForm({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: catActive !== 'Tous' && catActive !== 'Sans catégorie' ? catActive : '', temps_prepa: '', photo_url: '', vendable: true, tva_taux: commercant?.tva_taux_defaut ?? '', tva_taux_sur_place: '' })
    setGalerie([]); setPropsIa([])
    setEditId(null); setShowForm(true)
  }
  function openEdit(a) {
    setForm({ nom: a.nom, description: a.description || '', prix: String(a.prix), stock_jour: String(a.stock_jour ?? ''), actif: a.actif, categorie: a.categorie || '', temps_prepa: String(a.temps_prepa ?? ''), photo_url: a.photo_url || '', vendable: !a.est_vitrine, tva_taux: a.tva_taux ?? '', tva_taux_sur_place: a.tva_taux_sur_place ?? '' })
    setGalerie([]); setPropsIa([])
    fetchGalerie(a.id)
    setEditId(a.id); setShowForm(true)
  }

  async function saveArticle() {
    if (!form.nom.trim() || !form.prix) return toast('Nom et prix obligatoires', 'error')
    setSaving(true)
    const payload = {
      commercant_id: commercantId,
      nom: form.nom.trim(),
      description: form.description.trim() || null,
      prix: parseFloat(form.prix),
      stock_jour: (estVitrine && !form.vendable) ? 0 : (parseInt(form.stock_jour) || 0),
      actif: form.actif,
      categorie: form.categorie.trim() || null,
      temps_prepa: (estVitrine || estDetail) ? 0 : (parseFloat(form.temps_prepa) || 0),
      photo_url: form.photo_url || null,
      // Vitrine : est_vitrine = prix indicatif non commandable (par produit).
      // Détail/alimentaire : toujours false (prix ferme).
      est_vitrine: estVitrine ? !form.vendable : false,
      // Chaîne vide = « pas renseigné » : on écrit null plutôt que 0, sans quoi
      // l'article passerait pour exonéré alors qu'il n'a simplement pas été réglé.
      tva_taux: form.tva_taux === '' || form.tva_taux == null ? null : Number(form.tva_taux),
      tva_taux_sur_place: form.tva_taux_sur_place === '' || form.tva_taux_sur_place == null ? null : Number(form.tva_taux_sur_place),
    }
    const { error } = editId
      ? await supabase.from('articles').update(payload).eq('id', editId)
      : await supabase.from('articles').insert(payload)
    setSaving(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast(editId ? 'Article mis à jour' : 'Article ajouté')
    setShowForm(false); fetchArticles()
  }

  async function ajouterCategorie() {
    if (!nouvelleCat.trim()) return
    // Sous-catégorie : stockée « Parent · Enfant » (convention, zéro migration)
    const nom = nouvelleCatParent ? `${nouvelleCatParent} · ${nouvelleCat.trim()}` : nouvelleCat.trim()
    if (categories.includes(nom)) { toast('Catégorie déjà existante', 'error'); return }
    setCategories(prev => [...prev, nom].sort())
    setCatActive(nom)
    setNouvelleCat('')
    setNouvelleCatParent('')
    setShowCatForm(false)
    toast(nouvelleCatParent ? 'Sous-catégorie créée' : 'Catégorie créée')
  }

  // ─── Renommer une catégorie ────────────────────────────────────────────────
  function startRename(cat) {
    setRenamingCat(cat)
    setRenameValue(cat)
  }

  async function saveRename(oldCat) {
    const newCat = renameValue.trim()
    if (!newCat) return toast('Nom obligatoire', 'error')
    if (newCat === oldCat) { setRenamingCat(null); return }
    if (categories.includes(newCat)) { toast('Ce nom existe déjà', 'error'); return }
    setRenameSaving(true)
    const { error } = await supabase
      .from('articles')
      .update({ categorie: newCat })
      .eq('commercant_id', commercantId)
      .eq('categorie', oldCat)
    setRenameSaving(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Catégorie renommée')
    setRenamingCat(null)
    if (catActive === oldCat) setCatActive(newCat)
    fetchArticles()
  }

  async function supprimerCategorie(cat) {
    if (!await confirme(confirmationSimple({ titre: `Supprimer la catégorie « ${cat} » ?`, message: 'Tes articles restent en place, ils se retrouvent simplement sans catégorie.', action: 'Oui, supprimer la catégorie' }))) return
    const { error } = await supabase.from('articles').update({ categorie: null }).eq('commercant_id', commercantId).eq('categorie', cat)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Catégorie supprimée'); fetchArticles()
    if (catActive === cat) setCatActive('Tous')
  }

  async function toggleActif(a) { await supabase.from('articles').update({ actif: !a.actif }).eq('id', a.id); fetchArticles() }

  async function updateStock(id, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 0) return
    await supabase.from('articles').update({ stock_jour: n }).eq('id', id)
    setArticles(prev => prev.map(a => a.id === id ? { ...a, stock_jour: n } : a))
  }

  async function deleteArticle(id) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer cet article ?', message: 'Il disparaît de ta carte. Les commandes déjà passées ne changent pas.', action: 'Oui, supprimer cet article' }))) return
    const { data, error } = await supabase.from('articles').delete().eq('id', id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || data.length === 0) { toast('Suppression refusée par les permissions Supabase (RLS)', 'error'); return }
    toast('Article supprimé'); fetchArticles()
  }

  // ─── Photos article : couverture (articles.photo_url) + galerie (article_photos) ──
  // Même bucket 'logos' et même compression que deals/actus. La couverture vit dans
  // le formulaire (form.photo_url) ; la galerie n'est dispo qu'en édition (article existant).
  async function uploadPhotoArticle(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo brut)', 'error'); return }
    setUploadingPhoto(true)
    // Fiche « façon post » : recadrage 4:5 + filigrane yoppaa (décision 30/07)
    const compressed = await preparerPhotoArticle(file)
    const fileName = `article-${commercantId}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (error) { toast('Erreur upload photo', 'error'); setUploadingPhoto(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    setForm(f => ({ ...f, photo_url: urlData.publicUrl }))
    setUploadingPhoto(false)
  }

  async function fetchGalerie(articleId) {
    const { data } = await supabase.from('article_photos').select('*').eq('article_id', articleId).order('ordre')
    setGalerie(data || [])
  }

  async function uploadGaleriePhoto(file, articleId) {
    if (!file || !articleId) return
    if (!file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo brut)', 'error'); return }
    setUploadingGalerie(true)
    // Même pipeline 4:5 + filigrane que la photo de couverture
    const compressed = await preparerPhotoArticle(file)
    const fileName = `article-gal-${articleId}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { toast('Erreur upload photo', 'error'); setUploadingGalerie(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const { data, error } = await supabase.from('article_photos').insert({ article_id: articleId, url: urlData.publicUrl, ordre: galerie.length }).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); setUploadingGalerie(false); return }
    if (data && data[0]) setGalerie(prev => [...prev, data[0]])
    setUploadingGalerie(false)
  }

  async function deleteGaleriePhoto(id) {
    const { error } = await supabase.from('article_photos').delete().eq('id', id)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    setGalerie(prev => prev.filter(p => p.id !== id))
  }

  const articlesFiltres = catActive === 'Tous' ? articles : articles.filter(a => a.categorie === catActive)
  const articlesSansCat = articles.filter(a => !a.categorie)
  const articlesRecherche = searchQuery.trim()
    ? articlesFiltres.filter(a => a.nom.toLowerCase().includes(searchQuery.toLowerCase()) || (a.description || '').toLowerCase().includes(searchQuery.toLowerCase()))
    : articlesFiltres

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  // ─── Sous-onglets Menu : Articles | Catégories | Personnalisation ───────
  const SUB_TABS = [
    { id: 'articles',         label: 'Articles',        icon: 'box' },
    { id: 'categories',       label: 'Catégories',      icon: 'tag' },
    { id: 'personnalisation', label: 'Personnalisation', icon: 'sliders' },
  ]

  function renderArticleForm() {
    return (
      <div style={s.cardActive}>
        <h3 style={{ ...s.h3, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name={editId ? 'edit' : 'plus'} size={14} color={T.main}/>
          {editId
            ? (estVitrine ? 'Modifier le produit' : 'Modifier l’article')
            : (estVitrine ? 'Nouveau produit phare' : 'Nouvel article')}
        </h3>
        <div style={{ display: 'grid', gap: 12 }}>
          <div><label style={s.label}>Nom *</label><Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder={estVitrine ? 'Ex: Monture Lindberg Air Titanium' : estDetail ? 'Ex: Jean slim brut' : 'Ex: Croissant beurre'}/></div>
          <div>
            <label style={s.label}>Catégorie</label>
            <select value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
              style={{ ...s.input, cursor: 'pointer' }}>
              <option value="">— Sans catégorie —</option>
              {/* Sous-catégories « Parent · Enfant » groupées en optgroup */}
              {(() => {
                const parents = [...new Set(categories.filter(c => c.includes(' · ')).map(c => c.split(' · ')[0]))]
                const simples = categories.filter(c => !c.includes(' · ') && !parents.includes(c))
                return (
                  <>
                    {simples.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    {parents.map(p => (
                      <optgroup key={p} label={p}>
                        {categories.includes(p) && <option value={p}>{p} (général)</option>}
                        {categories.filter(c => c.startsWith(p + ' · ')).map(c => (
                          <option key={c} value={c}>{c.slice(p.length + 3)}</option>
                        ))}
                      </optgroup>
                    ))}
                  </>
                )
              })()}
            </select>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
              <label style={{ ...s.label, marginBottom: 0 }}>Description</label>
              <BoutonIaInline commercantId={commercantId} surface="article" brief={form.nom}
                infos={form.description}
                briefManquantMsg={'Donne d’abord un nom à l’article, l’IA s’en inspire.'}
                onVariantes={vs => setPropsIa(vs)}
                toast={toast} />
            </div>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={estVitrine ? 'Ex: Titane japonais, charnières flex, 12 coloris…' : estDetail ? 'Ex: Coton bio, coupe droite, fabriqué au Portugal…' : 'Ex: Feuilleté, pur beurre AOP...'}/>
            {propsIa.length > 0 ? (
              <PropositionsIa propositions={propsIa}
                onChoisir={v => { setForm(p => ({ ...p, description: v.court || v.long })); setPropsIa([]) }}
                onFermer={() => setPropsIa([])} />
            ) : (
              <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{estDetail || estVitrine ? 'Astuce : note tes matières ou atouts en vrac (coton bio, fabrication européenne…) puis clique sur Rédiger avec l’IA.' : 'Astuce : note tes ingrédients ou atouts en vrac (pur beurre, producteur local…) puis clique sur Rédiger avec l’IA.'}</p>
            )}
          </div>
          {estVitrine ? (
            <>
              <Toggle value={!!form.vendable} onChange={v => setForm(p => ({ ...p, vendable: v }))} label="Vendable à la commande"/>
              {form.vendable ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div><label style={s.label}>Prix (€) *</label><Input type="number" step="0.10" min="0" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="18.90"/></div>
                    <div>
                      <label style={s.label}>Stock disponible</label>
                      <Input type="number" min="0" value={form.stock_jour} onChange={e => setForm(p => ({ ...p, stock_jour: e.target.value }))} placeholder="12"/>
                      <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Stock permanent. Si le produit a des variantes, le stock se gère par variante.</p>
                    </div>
                  </div>
                  {!canDo(commercant?.plan, 'commande') && (
                    <p style={{ fontSize: 10, color: T.muted, marginTop: -4 }}>La commande en ligne s&rsquo;active avec la formule Vendre. En attendant, le produit s&rsquo;affiche avec son prix.</p>
                  )}
                </>
              ) : (
                <div>
                  <label style={s.label}>Prix indicatif (€)</label>
                  <Input type="number" step="0.10" min="0" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="À partir de 290"/>
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Affiché en mode "à partir de" sur ta fiche client, sans achat en ligne.</p>
                </div>
              )}
            </>
          ) : estDetail ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Prix (€) *</label><Input type="number" step="0.10" min="0" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="49.90"/></div>
              <div>
                <label style={s.label}>Stock disponible</label>
                <Input type="number" min="0" value={form.stock_jour} onChange={e => setForm(p => ({ ...p, stock_jour: e.target.value }))} placeholder="12"/>
                <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Stock permanent. Si l&rsquo;article a des variantes, le stock se gère par variante.</p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={s.label}>Prix (€) *</label><Input type="number" step="0.10" min="0" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="1.20"/></div>
                <div><label style={s.label}>Stock du jour (défaut)</label><Input type="number" min="0" value={form.stock_jour} onChange={e => setForm(p => ({ ...p, stock_jour: e.target.value }))} placeholder="30"/></div>
              </div>
              <div>
                <label style={s.label}>Temps de préparation (min)</label>
                <Input type="number" min="0" step="0.5" value={form.temps_prepa} onChange={e => setForm(p => ({ ...p, temps_prepa: e.target.value }))} placeholder="0 = non défini · 1 = 1 min · 5 = 5 min"/>
                <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Utilisé en mode Temps de préparation</p>
              </div>
            </>
          )}
          {/* TVA. Le prix saisi est TTC : le taux ne change pas ce que paie le
              client, il détermine la part de TVA à l'intérieur. Deux taux pour
              l'alimentaire, parce qu'en Belgique la même denrée relève de la
              livraison de biens à emporter et de la restauration servie en
              salle, ce qui n'est pas le même régime. */}
          <div>
            {/* ⚠️ LES EXEMPLES SONT CEUX DU MÉTIER (Alex, 17/08 : « ils parlent
                de boissons, boissons alcoolisées, sur place, emporté. Pas top
                quand on est coiffeur, prof de yoga ou boutique de vêtements »).
                Aucun taux n'est masqué ni présélectionné : on nomme seulement
                celui qui est le plus courant chez lui. */}
            <label style={s.label}>TVA{estAlimentaire ? ' à emporter' : ''}</label>
            <select value={form.tva_taux ?? ''} onChange={e => setForm(p => ({ ...p, tva_taux: e.target.value }))}
              style={{ ...s.input, cursor: 'pointer' }}>
              <option value="">— À définir —</option>
              {optionsTaux(tvaRefs, commercant?.categorie).map(t => (
                <option key={t.taux} value={t.taux}>{t.texte}</option>
              ))}
            </select>
            {estAlimentaire && (
              <div style={{ marginTop: 10 }}>
                <label style={s.label}>TVA sur place (si consommation en salle)</label>
                <select value={form.tva_taux_sur_place ?? ''} onChange={e => setForm(p => ({ ...p, tva_taux_sur_place: e.target.value }))}
                  style={{ ...s.input, cursor: 'pointer' }}>
                  <option value="">— Même taux qu&rsquo;à emporter —</option>
                  {optionsTaux(tvaRefs, commercant?.categorie).map(t => (
                    <option key={t.taux} value={t.taux}>{t.texte}</option>
                  ))}
                </select>
              </div>
            )}
            <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>
              Le prix que tu saisis est le prix payé par le client, TVA comprise. En cas de doute
              sur le taux applicable, consulte ton comptable ou le SPF Finances.
            </p>
          </div>

          <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label={estVitrine ? 'Produit visible' : 'Article disponible'}/>

          {/* Photo de couverture */}
          <div>
            <label style={s.label}>Photo de couverture</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: T.hairline, flexShrink: 0, position: 'relative', border: `1px solid ${T.hairline}` }}>
                {form.photo_url ? (
                  <>
                    <img decoding="async" loading="lazy" src={form.photo_url} alt="Couverture" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                    <button type="button" onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                      style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 100, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '20px', padding: 0 }} title="Retirer">×</button>
                  </>
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.muted }}>
                    <Camera size={20} strokeWidth={1.6}/>
                  </div>
                )}
              </div>
              <label style={{ ...s.btn, ...s.btnGhost, cursor: uploadingPhoto ? 'wait' : 'pointer' }}>
                {uploadingPhoto ? 'Chargement…' : (form.photo_url ? 'Remplacer' : 'Ajouter une photo')}
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhotoArticle(e.target.files?.[0])} disabled={uploadingPhoto}/>
              </label>
            </div>
            <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Facultatif. Compressée automatiquement. Format idéal carré, minimum 800×800 px.</p>
          </div>

          {/* Galerie (article existant uniquement) */}
          {editId && (
            <div>
              <label style={s.label}>Galerie ({galerie.length})</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {galerie.map(p => (
                  <div key={p.id} style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', position: 'relative', border: `1px solid ${T.hairline}` }}>
                    <img decoding="async" loading="lazy" src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                    <button type="button" onClick={() => deleteGaleriePhoto(p.id)}
                      style={{ position: 'absolute', top: 1, right: 1, width: 18, height: 18, borderRadius: 100, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 12, lineHeight: '18px', padding: 0 }} title="Supprimer">×</button>
                  </div>
                ))}
                <label style={{ width: 60, height: 60, borderRadius: 10, border: `1.5px dashed ${T.main}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploadingGalerie ? 'wait' : 'pointer', color: T.main }}>
                  {uploadingGalerie ? '…' : <Icon name="plus" size={16} color={T.main}/>}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadGaleriePhoto(e.target.files?.[0], editId)} disabled={uploadingGalerie}/>
                </label>
              </div>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Photos supplémentaires montrées sur ta fiche.</p>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveArticle} disabled={saving}>
            <Icon name="check" size={14}/> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
        </div>
      </div>
    )
  }

  function renderArticleCard(a) {
    // Édition en place : le formulaire prend la place de la card pour cet article
    if (showForm && editId === a.id) {
      return <div key={a.id}>{renderArticleForm()}</div>
    }
    // Vitrine : la card dépend du produit (indicatif = pastille « à partir
    // de », vendable = stock permanent façon détail)
    const indicatif = estVitrine && a.est_vitrine
    return <ArticleCard key={a.id} a={a} estVitrine={indicatif} estDetail={estDetail || (estVitrine && !indicatif)} joursFermes={joursFermes} fermeturesSemaine={fermeturesSemaine} onEdit={openEdit} onToggle={toggleActif} onUpdateStock={updateStock} onDelete={deleteArticle} s={s} consoParJour={commandesParArticleJour[a.id] || {}} stockParJour={stockParJourMap[a.id] || {}} onSetStockJour={setStockJour} onSetStockTousJours={setStockTousJours}/>
  }

  return (
    <div>
      <style>{`
        .tabmenu-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .tabmenu-header-actions { display: flex; gap: 8px; flex-shrink: 0; }
        @media (max-width: 600px) {
          .tabmenu-header { flex-direction: column; align-items: stretch; }
          .tabmenu-header-actions { justify-content: flex-start; }
        }
        .stock-editor-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        @media (max-width: 480px) {
          .stock-editor-row { display: grid; grid-template-columns: 1fr auto; row-gap: 8px; column-gap: 8px; }
          .stock-editor-row .stock-editor-label { grid-column: 1 / -1; }
          .stock-editor-row .stock-editor-input { width: 100% !important; }
        }
      `}</style>
      {/* ─── En-tête (panel violet foncé YOPPAA) ─────────────────────────── */}
      <div className="tabmenu-header" style={{ background: T.bgPanel, borderRadius: 14, padding: '18px 20px', marginBottom: 14, color: '#fff' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>{commercant?.categorie === 'detail' ? 'Boutique' : estVitrine ? 'Catalogue' : 'Menu'}</p>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>
            {articles.length} {estVitrine ? 'produit' : 'article'}{articles.length > 1 ? 's' : ''}
            <span style={{ color: T.light, fontWeight: 600, fontSize: 14, marginLeft: 8 }}>· {categories.length} catégorie{categories.length > 1 ? 's' : ''}</span>
          </h2>
        </div>
        <div className="tabmenu-header-actions">
          {subTab === 'categories' && (
            <button style={{ ...s.btn, background: '#fff', color: T.bgPanel }} onClick={() => { setShowCatForm(v => !v); setShowForm(false) }}>
              <Icon name="plus" size={14}/> Catégorie
            </button>
          )}
          {(subTab === 'articles' || subTab === 'personnalisation') && (
            <button style={{ ...s.btn, background: '#fff', color: T.bgPanel }} onClick={() => { openNew(); setShowCatForm(false) }}>
              <Icon name="plus" size={14}/> {estVitrine ? 'Produit' : 'Article'}
            </button>
          )}
        </div>
      </div>

      {/* ─── Catalogue en ligne mais rien ne peut être encaissé ───────────────
          Une formule qui ouvre la vente, des produits publiés, et un compte
          Stripe inactif : le catalogue s'affiche mais aucun bouton d'achat
          n'apparaît côté client. Le commerçant n'avait AUCUN moyen de le
          savoir, l'état du compte ne vivant que dans l'onglet Paiements. Il
          aurait attendu des commandes qui ne pouvaient pas arriver. */}
      {canDo(commercant?.plan, 'commande') && commercant?.stripe_account_charges_enabled !== true && (
        <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '12px 14px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <path d="M12 9v4M12 17h.01"/>
          </svg>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 13, color: '#991B1B' }}>
              Tes clients ne peuvent pas encore acheter
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#7F1D1D', lineHeight: 1.5 }}>
              Ton catalogue est bien visible, mais les boutons d&rsquo;achat n&rsquo;apparaissent pas tant que
              ton compte de paiement n&rsquo;est pas activé. Ça se règle en quelques minutes dans
              l&rsquo;onglet <strong>Paiements</strong>.
            </p>
          </div>
        </div>
      )}

      {/* ─── Barre sous-onglets ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 16, border: `1px solid ${T.hairline}`, boxShadow: '0 1px 4px rgba(22,6,54,0.04)' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ flex: 1, minWidth: 80, padding: '10px 6px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 12.5, transition: 'all 0.2s', background: subTab === t.id ? T.bgPanel : 'transparent', color: subTab === t.id ? '#fff' : T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name={t.icon} size={14} color={subTab === t.id ? '#fff' : T.muted}/>
            {t.label}
          </button>
        ))}
      </div>

      {/* Nouvel article : formulaire affiché en haut.
          Édition d'un article existant : formulaire inline à l'emplacement
          de l'article (voir renderArticleCard plus bas). */}
      {showForm && editId === null && renderArticleForm()}

      {/* ───────────── SUB-TAB : ARTICLES ───────────── */}
      {subTab === 'articles' && (
        <>
          {/* Barre filtres + recherche */}
          {articles.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un article…"
                  style={{ ...s.input, paddingLeft: 38 }}/>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                  <Icon name="search" size={16} color={T.muted}/>
                </div>
              </div>
              {categories.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['Tous', ...categories, ...(articlesSansCat.length > 0 ? ['Sans catégorie'] : [])].map(cat => (
                    <button key={cat} onClick={() => setCatActive(cat)}
                      style={{ ...s.btn, padding: '6px 14px', fontSize: 12, background: catActive === cat ? T.bgPanel : '#fff', color: catActive === cat ? '#fff' : T.muted, border: `1.5px solid ${catActive === cat ? T.bgPanel : T.hairline}` }}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {articles.length === 0 && !showForm ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
              <p style={{ color: T.muted, marginBottom: 16 }}>Aucun article dans le menu</p>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNew}>
                <Icon name="plus" size={14}/> Ajouter le premier article
              </button>
            </div>
          ) : (
            <>
              {searchQuery.trim() ? (
                articlesRecherche.length === 0
                  ? <div style={{ ...s.card, textAlign: 'center', padding: 30, color: T.muted }}>Aucun résultat pour «&nbsp;{searchQuery}&nbsp;»</div>
                  : articlesRecherche.map(renderArticleCard)
              ) : catActive === 'Tous' && categories.length > 0 ? (
                <>
                  {categories.map(cat => {
                    const artsDecat = articles.filter(a => a.categorie === cat)
                    if (!artsDecat.length) return null
                    return (
                      <div key={cat} style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: T.bgPanel, textTransform: 'uppercase', letterSpacing: '1px' }}>{cat}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>·  {artsDecat.length}</span>
                          <div style={{ flex: 1, height: 1, background: T.hairline }}/>
                        </div>
                        {artsDecat.map(renderArticleCard)}
                      </div>
                    )
                  })}
                  {articlesSansCat.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '1px' }}>Sans catégorie</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>· {articlesSansCat.length}</span>
                        <div style={{ flex: 1, height: 1, background: T.hairline }}/>
                      </div>
                      {articlesSansCat.map(renderArticleCard)}
                    </div>
                  )}
                </>
              ) : (
                (catActive === 'Sans catégorie' ? articlesSansCat : articlesFiltres).map(renderArticleCard)
              )}
            </>
          )}
        </>
      )}

      {/* ───────────── SUB-TAB : CATÉGORIES ───────────── */}
      {subTab === 'categories' && (
        <>
          {showCatForm && (
            <div style={{ ...s.cardActive, padding: 16, marginBottom: 12 }}>
              {/* Sous-catégories (demande Alex 24/07) : convention « Parent · Enfant »
                  dans le champ categorie existant, zéro migration. */}
              {(() => {
                const racines = [...new Set(categories.map(c => c.split(' · ')[0]))]
                return racines.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={s.label}>Sous-catégorie de (optionnel)</label>
                    <select value={nouvelleCatParent} onChange={e => setNouvelleCatParent(e.target.value)}
                      style={{ ...s.input, cursor: 'pointer', marginTop: 6 }}>
                      <option value="">— Aucune (catégorie principale) —</option>
                      {racines.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                )
              })()}
              <label style={s.label}>{nouvelleCatParent ? `Nom de la sous-catégorie de « ${nouvelleCatParent} »` : 'Nom de la catégorie'}</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <Input value={nouvelleCat} onChange={e => setNouvelleCat(e.target.value)} placeholder={nouvelleCatParent ? 'Ex: Pantalons, Chemises…' : estDetail ? 'Ex: Homme, Femme, Accessoires…' : estVitrine ? 'Ex: Montures, Solaires, Lentilles…' : 'Ex: Viennoiseries, Sandwichs chauds…'} onKeyDown={e => e.key === 'Enter' && ajouterCategorie()} style={{ flex: 1 }}/>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={ajouterCategorie}><Icon name="check" size={14}/></button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setShowCatForm(false); setNouvelleCatParent('') }}><Icon name="x" size={14} color={T.main}/></button>
              </div>
            </div>
          )}
          {categories.length === 0 && !showCatForm ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
              <p style={{ color: T.muted, marginBottom: 16 }}>Aucune catégorie pour le moment</p>
              <p style={{ color: T.muted, fontSize: 12, marginBottom: 16 }}>Les catégories organisent tes articles côté client (ex&nbsp;: {estDetail ? 'Homme, Femme, Accessoires' : estVitrine ? 'Montures, Solaires' : 'Viennoiseries, Boissons'}…).</p>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowCatForm(true)}>
                <Icon name="plus" size={14}/> Créer la première catégorie
              </button>
            </div>
          ) : (
            <div>
              {categories.map(cat => {
                const count = articles.filter(a => a.categorie === cat).length
                const isRenaming = renamingCat === cat
                return (
                  <div key={cat} style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: T.bgPanel, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="tag" size={18} color="#fff"/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isRenaming ? (
                        <input value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveRename(cat); if (e.key === 'Escape') setRenamingCat(null) }}
                          autoFocus
                          style={{ ...s.input, padding: '6px 10px', fontSize: 14, fontWeight: 700 }}/>
                      ) : (
                        <>
                          <p style={{ fontWeight: 800, color: T.ink, fontSize: 14, margin: 0 }}>{cat}</p>
                          <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0' }}>{count} article{count > 1 ? 's' : ''}</p>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {isRenaming ? (
                        <>
                          <button onClick={() => saveRename(cat)} disabled={renameSaving}
                            style={{ ...s.btn, ...s.btnPrimary, padding: '6px 10px', fontSize: 12 }}>
                            <Icon name="check" size={14}/> {renameSaving ? '…' : 'Sauver'}
                          </button>
                          <button onClick={() => setRenamingCat(null)}
                            style={{ ...s.btn, ...s.btnGhost, padding: '6px 10px', fontSize: 12 }}>
                            <Icon name="x" size={14} color={T.main}/>
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startRename(cat)} title="Renommer"
                            style={{ ...s.btn, ...s.btnGhost, padding: '6px 10px', fontSize: 12 }}>
                            <Icon name="edit" size={14} color={T.main}/>
                          </button>
                          <button onClick={() => supprimerCategorie(cat)} title="Supprimer"
                            style={{ ...s.btn, ...s.btnDanger, padding: '6px 10px', fontSize: 12 }}>
                            <Icon name="trash" size={14} color="#DC2626"/>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              {articlesSansCat.length > 0 && (
                <div style={{ ...s.card, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', marginBottom: 8, opacity: 0.7 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="tag" size={18} color={T.muted}/>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, color: T.muted, fontSize: 14, margin: 0 }}>Sans catégorie</p>
                    <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0' }}>{articlesSansCat.length} article{articlesSansCat.length > 1 ? 's' : ''}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ───────────── SUB-TAB : PERSONNALISATION ───────────── */}
      {subTab === 'personnalisation' && (
        <>
          <div style={{ background: T.bgPanel, borderRadius: 14, padding: '14px 16px', marginBottom: 14, color: '#fff' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 4 }}>{variantesCategorie ? 'Variantes par article' : 'Personnalisation par article'}</p>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, margin: 0 }}>
              {variantesCategorie
                ? 'Décline chaque produit (taille, couleur…) avec un stock, un prix et une photo par combinaison. Clique pour gérer.'
                : 'Configure les groupes d’options de chaque article (sauces obligatoires, suppléments payants…). Clique pour gérer.'}
            </p>
          </div>
          {articles.length === 0 ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40, color: T.muted }}>
              Crée d&rsquo;abord des articles dans l&rsquo;onglet <strong>Articles</strong>.
            </div>
          ) : (
            articles.map(a => (
              <details key={a.id} style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
                <summary style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, listStyle: 'none' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: T.bgPanel, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="sliders" size={16} color="#fff"/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, color: T.ink, fontSize: 14, margin: 0 }}>{a.nom}</p>
                    <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0' }}>{Number(a.prix).toFixed(2)}€ {a.categorie ? `· ${a.categorie}` : ''}</p>
                  </div>
                  <Icon name="chevR" size={16} color={T.muted}/>
                </summary>
                <div style={{ padding: '0 16px 14px', borderTop: `1px solid ${T.hairline}` }}>
                  {variantesCategorie
                    ? <VariantesArticle article={a} toast={(msg, type) => { const ev = new CustomEvent('yoppaa-toast', {detail:{msg,type}}); window.dispatchEvent(ev) }}/>
                    : <OptionsArticle articleId={a.id} toast={(msg, type) => { const ev = new CustomEvent('yoppaa-toast', {detail:{msg,type}}); window.dispatchEvent(ev) }}/>}
                </div>
              </details>
            ))
          )}
        </>
      )}
    </div>
  )
}

// ─── Gestionnaire d'options pour un article ──────────────────────────────────
function OptionsArticle({ articleId, toast }) {
  const [groupes, setGroupes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formGroupe, setFormGroupe] = useState({ nom: '', type: 'unique', obligatoire: false })
  const [valeursForms, setValeursForms] = useState({})
  const [saving, setSaving] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchGroupes() }, [articleId])

  async function fetchGroupes() {
    setLoading(true)
    const { data: gData } = await supabase.from('article_options_groupes').select('*, valeurs:article_options_valeurs(*)').eq('article_id', articleId).order('created_at')
    setGroupes(gData || [])
    setLoading(false)
  }

  async function saveGroupe() {
    if (!formGroupe.nom.trim()) return toast('Nom obligatoire', 'error')
    setSaving(true)
    const { error } = await supabase.from('article_options_groupes').insert({ article_id: articleId, nom: formGroupe.nom.trim(), type: formGroupe.type, obligatoire: formGroupe.obligatoire })
    setSaving(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Groupe ajouté')
    setFormGroupe({ nom: '', type: 'unique', obligatoire: false }); setShowForm(false); fetchGroupes()
  }

  async function updateGroupe(id, patch) {
    const { error } = await supabase.from('article_options_groupes').update(patch).eq('id', id)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    fetchGroupes()
  }

  async function deleteGroupe(id) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer ce groupe ?', message: 'Toutes ses options disparaissent avec lui.', action: 'Oui, supprimer le groupe' }))) return
    const { data, error } = await supabase.from('article_options_groupes').delete().eq('id', id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || data.length === 0) { toast('Suppression refusée par les permissions Supabase (RLS)', 'error'); return }
    toast('Groupe supprimé'); fetchGroupes()
  }

  async function addValeur(groupeId) {
    const f = valeursForms[groupeId] || { nom: '', prix_supplement: 0 }
    if (!f.nom.trim()) return toast('Nom obligatoire', 'error')
    const { error } = await supabase.from('article_options_valeurs').insert({ groupe_id: groupeId, nom: f.nom.trim(), prix_supplement: parseFloat(f.prix_supplement) || 0 })
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    setValeursForms(p => ({ ...p, [groupeId]: { nom: '', prix_supplement: 0 } }))
    toast('Option ajoutée'); fetchGroupes()
  }

  async function deleteValeur(id) {
    const { data, error } = await supabase.from('article_options_valeurs').delete().eq('id', id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || data.length === 0) { toast('Suppression refusée par les permissions Supabase (RLS)', 'error'); return }
    fetchGroupes()
  }

  if (loading) return <p style={{ fontSize: 12, color: T.muted, padding: '8px 0' }}>Chargement des options...</p>

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hairline}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.bgPanel, textTransform: 'uppercase', letterSpacing: '1px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="sliders" size={14} color={T.bgPanel}/> Groupes d&rsquo;options
        </span>
        <button style={{ ...s.btn, ...s.btnGhost, padding: '5px 10px', fontSize: 11 }} onClick={() => setShowForm(v => !v)}>
          <Icon name="plus" size={12} color={T.bgPanel}/> Groupe
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#FAFAFA', borderRadius: 10, padding: 12, marginBottom: 10, border: `1.5px solid ${T.bgPanel}` }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <label style={{ ...s.label, fontSize: 10 }}>Nom du groupe *</label>
              <input value={formGroupe.nom} onChange={e => setFormGroupe(p => ({ ...p, nom: e.target.value }))}
                placeholder="Ex: Choix de sauce, Crudités..."
                style={{ ...s.input, fontSize: 13, padding: '7px 10px' }}/>
            </div>
            <div>
              <label style={{ ...s.label, fontSize: 10 }}>Type de choix</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { val: 'unique',   label: 'Un seul choix', desc: 'Ex : taille, sauce' },
                  { val: 'multiple', label: 'Plusieurs',     desc: 'Ex : suppléments' },
                ].map(opt => {
                  const sel = formGroupe.type === opt.val
                  return (
                    <button key={opt.val} type="button" onClick={() => setFormGroupe(p => ({ ...p, type: opt.val }))}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: `1.5px solid ${sel ? T.bgPanel : T.hairline}`, background: sel ? T.bgPanel : '#fff', color: sel ? '#fff' : T.ink, cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
                      <div style={{ fontWeight: 800, fontSize: 12, marginBottom: 1 }}>{opt.label}</div>
                      <div style={{ fontSize: 10, opacity: sel ? 0.85 : 0.6 }}>{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 0' }}>
              <input type="checkbox" checked={formGroupe.obligatoire}
                onChange={e => setFormGroupe(p => ({ ...p, obligatoire: e.target.checked }))} style={{ cursor: 'pointer', width: 16, height: 16 }}/>
              <span style={{ fontSize: 12, color: T.ink, fontWeight: 600 }}>Le client doit obligatoirement choisir</span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button style={{ ...s.btn, ...s.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={saveGroupe} disabled={saving}>
              <Icon name="check" size={13}/> Créer
            </button>
            <button style={{ ...s.btn, ...s.btnGhost, padding: '6px 12px', fontSize: 12 }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {groupes.length === 0 && !showForm && (
        <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Aucune option, clique sur «&nbsp;+ Groupe&nbsp;» pour en ajouter.</p>
      )}

      {groupes.map(g => (
        <div key={g.id} style={{ background: '#fff', borderRadius: 10, padding: 10, marginBottom: 8, border: `1px solid ${T.hairline}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: T.ink }}>{g.nom}</span>
              {/* Badge type cliquable pour basculer unique <-> multiple */}
              <button onClick={() => updateGroupe(g.id, { type: g.type === 'unique' ? 'multiple' : 'unique' })}
                title="Cliquer pour basculer"
                style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 100, background: T.bgPanel, color: '#fff', border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                {g.type === 'unique' ? '1 choix' : 'Plusieurs choix'}
              </button>
              {/* Badge obligatoire cliquable */}
              <button onClick={() => updateGroupe(g.id, { obligatoire: !g.obligatoire })}
                title="Cliquer pour basculer"
                style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 100, background: g.obligatoire ? '#FEE2E2' : '#F3F4F6', color: g.obligatoire ? '#DC2626' : T.muted, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                {g.obligatoire ? 'Obligatoire' : 'Optionnel'}
              </button>
            </div>
            <button style={{ ...s.btn, ...s.btnDanger, padding: '5px 8px', fontSize: 11 }} onClick={() => deleteGroupe(g.id)} title="Supprimer le groupe">
              <Icon name="trash" size={13} color="#DC2626"/>
            </button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {(g.valeurs || []).map(v => (
              <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 100, padding: '3px 8px 3px 10px', fontSize: 12 }}>
                <span style={{ color: T.ink, fontWeight: 600 }}>{v.nom}</span>
                {v.prix_supplement > 0 && <span style={{ color: T.main, fontSize: 11, fontWeight: 700 }}>+{Number(v.prix_supplement).toFixed(2)}€</span>}
                <button onClick={() => deleteValeur(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 12, padding: '0 2px', lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input value={valeursForms[g.id]?.nom || ''} onChange={e => setValeursForms(p => ({ ...p, [g.id]: { ...p[g.id], nom: e.target.value } }))}
              placeholder="Nouvelle option..." onKeyDown={e => e.key === 'Enter' && addValeur(g.id)}
              style={{ ...s.input, flex: 1, fontSize: 12, padding: '5px 8px' }}/>
            <input type="number" min="0" step="0.10" value={valeursForms[g.id]?.prix_supplement || ''} onChange={e => setValeursForms(p => ({ ...p, [g.id]: { ...p[g.id], prix_supplement: e.target.value } }))}
              placeholder="+€" style={{ ...s.input, width: 56, fontSize: 12, padding: '5px 6px', textAlign: 'center' }}/>
            <button style={{ ...s.btn, ...s.btnPrimary, padding: '5px 10px', fontSize: 12 }} onClick={() => addValeur(g.id)}>+</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Gestionnaire de variantes pour un article (détail / service) ────────────
// Axes (Taille, Couleur…) stockés sur l'article + une ligne article_variantes
// par combinaison (stock/prix/photo). Sauvegarde directe, comme OptionsArticle.
function VariantesArticle({ article, toast }) {
  const [gere, setGere] = useState(!!article.gere_variantes)
  const [axe1Nom, setAxe1Nom] = useState(article.axe1_nom || 'Taille')
  const [axe2Nom, setAxe2Nom] = useState(article.axe2_nom || '')
  const [axe1Valeurs, setAxe1Valeurs] = useState(Array.isArray(article.axe1_valeurs) ? article.axe1_valeurs : [])
  const [axe2Valeurs, setAxe2Valeurs] = useState(Array.isArray(article.axe2_valeurs) ? article.axe2_valeurs : [])
  const [input1, setInput1] = useState('')
  const [input2, setInput2] = useState('')
  const [variantes, setVariantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadId, setUploadId] = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchVariantes() }, [article.id])

  async function fetchVariantes() {
    setLoading(true)
    // Axes relus depuis la BASE (pas la prop article, potentiellement périmée :
    // la liste parent n'est pas rafraîchie après chaque saveAxes → les valeurs
    // semblaient « perdues » à la réouverture. Bug signalé Alex 24/07).
    const [{ data }, { data: art }] = await Promise.all([
      supabase.from('article_variantes').select('*').eq('article_id', article.id).order('ordre'),
      supabase.from('articles').select('gere_variantes, axe1_nom, axe1_valeurs, axe2_nom, axe2_valeurs').eq('id', article.id).single(),
    ])
    setVariantes(data || [])
    if (art) {
      setGere(!!art.gere_variantes)
      setAxe1Nom(art.axe1_nom || 'Taille')
      setAxe2Nom(art.axe2_nom || '')
      setAxe1Valeurs(Array.isArray(art.axe1_valeurs) ? art.axe1_valeurs : [])
      setAxe2Valeurs(Array.isArray(art.axe2_valeurs) ? art.axe2_valeurs : [])
    }
    setLoading(false)
  }

  async function saveAxes(patch) {
    const { error } = await supabase.from('articles').update(patch).eq('id', article.id)
    if (error) toast(`Erreur : ${error.message}`, 'error')
  }

  async function toggleGere(v) { setGere(v); await saveAxes({ gere_variantes: v }) }

  function addValeur(axe) {
    const raw = (axe === 1 ? input1 : input2).trim()
    if (!raw) return
    const list = axe === 1 ? axe1Valeurs : axe2Valeurs
    if (list.includes(raw)) { toast('Valeur déjà présente', 'error'); return }
    const next = [...list, raw]
    if (axe === 1) { setAxe1Valeurs(next); setInput1(''); saveAxes({ axe1_valeurs: next }) }
    else { setAxe2Valeurs(next); setInput2(''); saveAxes({ axe2_valeurs: next }) }
  }

  function removeValeur(axe, val) {
    const list = axe === 1 ? axe1Valeurs : axe2Valeurs
    const next = list.filter(x => x !== val)
    if (axe === 1) { setAxe1Valeurs(next); saveAxes({ axe1_valeurs: next }) }
    else { setAxe2Valeurs(next); saveAxes({ axe2_valeurs: next }) }
  }

  async function saveNom(axe) {
    if (axe === 1) await saveAxes({ axe1_nom: axe1Nom.trim() || null })
    else await saveAxes({ axe2_nom: axe2Nom.trim() || null })
  }

  async function genererCombinaisons() {
    if (!axe1Valeurs.length) { toast('Ajoute au moins une valeur au premier axe', 'error'); return }
    const a2 = axe2Valeurs.length ? axe2Valeurs : [null]
    const existing = new Set(variantes.map(v => `${v.axe1_valeur || ''}|${v.axe2_valeur || ''}`))
    const toInsert = []
    for (const v1 of axe1Valeurs) for (const v2 of a2) {
      const key = `${v1 || ''}|${v2 || ''}`
      if (!existing.has(key)) toInsert.push({ article_id: article.id, axe1_valeur: v1, axe2_valeur: v2, stock: 0, ordre: variantes.length + toInsert.length })
    }
    if (!toInsert.length) { toast('Toutes les combinaisons existent déjà'); return }
    const { error } = await supabase.from('article_variantes').insert(toInsert)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast(`${toInsert.length} combinaison${toInsert.length > 1 ? 's' : ''} ajoutée${toInsert.length > 1 ? 's' : ''}`)
    fetchVariantes()
  }

  function setVarLocal(id, patch) { setVariantes(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v)) }

  async function persistVar(id, patch) {
    const { error } = await supabase.from('article_variantes').update(patch).eq('id', id)
    if (error) toast(`Erreur : ${error.message}`, 'error')
  }

  async function deleteVariante(id) {
    const { data, error } = await supabase.from('article_variantes').delete().eq('id', id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || !data.length) { toast('Suppression refusée (RLS)', 'error'); return }
    setVariantes(prev => prev.filter(v => v.id !== id))
  }

  async function uploadVariantePhoto(file, id) {
    if (!file || !file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo)', 'error'); return }
    setUploadId(id)
    const compressed = await compresserImage(file, { maxWidth: 1000, maxHeight: 1000, quality: 0.85 })
    const fileName = `variante-${id}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { toast('Erreur upload photo', 'error'); setUploadId(null); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    await persistVar(id, { photo_url: urlData.publicUrl })
    setVarLocal(id, { photo_url: urlData.publicUrl })
    setUploadId(null)
  }

  function renderAxe(n, nom, setNom, valeurs, input, setInput) {
    return (
      <div style={{ marginBottom: 10, background: '#FAFAFA', borderRadius: 10, padding: 10, border: `1px solid ${T.hairline}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.muted, textTransform: 'uppercase' }}>Axe {n}{n === 2 ? ' (optionnel)' : ''}</span>
          <input value={nom} onChange={e => setNom(e.target.value)} onBlur={() => saveNom(n)} placeholder={n === 1 ? 'Taille' : 'Couleur'} style={{ ...s.input, fontSize: 12, padding: '5px 8px', width: 130 }}/>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {valeurs.map(val => (
            <span key={val} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 100, padding: '3px 6px 3px 10px', fontSize: 12 }}>
              <span style={{ color: T.ink, fontWeight: 600 }}>{val}</span>
              <button onClick={() => removeValeur(n, val)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 12, padding: '0 2px', lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addValeur(n) } }}
            placeholder={n === 1 ? 'Ex : S, M, L…' : 'Ex : Bleu, Rouge…'} style={{ ...s.input, flex: 1, fontSize: 12, padding: '5px 8px' }}/>
          <button style={{ ...s.btn, ...s.btnPrimary, padding: '5px 10px', fontSize: 12 }} onClick={() => addValeur(n)}>+</button>
        </div>
      </div>
    )
  }

  if (loading) return <p style={{ fontSize: 12, color: T.muted, padding: '8px 0' }}>Chargement des variantes...</p>

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hairline}` }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: gere ? 12 : 0 }}>
        <input type="checkbox" checked={gere} onChange={e => toggleGere(e.target.checked)} style={{ width: 16, height: 16, accentColor: T.main, cursor: 'pointer' }}/>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink }}>Cet article se décline en variantes (taille, couleur…)</span>
      </label>

      {gere && (
        <>
          {renderAxe(1, axe1Nom, setAxe1Nom, axe1Valeurs, input1, setInput1)}
          {renderAxe(2, axe2Nom, setAxe2Nom, axe2Valeurs, input2, setInput2)}

          <button style={{ ...s.btn, ...s.btnPrimary, padding: '7px 12px', fontSize: 12, marginBottom: 12 }} onClick={genererCombinaisons}>
            <Icon name="plus" size={13}/> Générer les combinaisons
          </button>

          {variantes.length === 0 ? (
            <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Définis tes axes puis clique sur «&nbsp;Générer les combinaisons&nbsp;».</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {variantes.map(v => (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: v.actif ? '#fff' : '#F9FAFB', borderRadius: 10, padding: 8, border: `1px solid ${T.hairline}`, opacity: v.actif ? 1 : 0.65 }}>
                  <label style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.hairline}`, cursor: 'pointer', position: 'relative', background: T.hairline, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {v.photo_url ? <img decoding="async" loading="lazy" src={v.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : (uploadId === v.id ? <span style={{ fontSize: 10 }}>…</span> : <Camera size={15} strokeWidth={1.6} color={T.muted}/>)}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadVariantePhoto(e.target.files?.[0], v.id)}/>
                  </label>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: T.ink, minWidth: 80, flex: 1 }}>
                    {v.axe1_valeur}{v.axe2_valeur ? ` · ${v.axe2_valeur}` : ''}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: T.muted, fontWeight: 700 }}>Stock</span>
                    <input type="number" min="0" value={v.stock ?? 0} onChange={e => setVarLocal(v.id, { stock: e.target.value })} onBlur={e => persistVar(v.id, { stock: parseInt(e.target.value) || 0 })} style={{ ...s.input, width: 54, fontSize: 12, padding: '5px 6px', textAlign: 'center' }}/>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: T.muted, fontWeight: 700 }}>Prix</span>
                    <input type="number" min="0" step="0.10" value={v.prix ?? ''} placeholder={Number(article.prix || 0).toFixed(2)} onChange={e => setVarLocal(v.id, { prix: e.target.value })} onBlur={e => persistVar(v.id, { prix: e.target.value === '' ? null : parseFloat(e.target.value) })} style={{ ...s.input, width: 62, fontSize: 12, padding: '5px 6px', textAlign: 'center' }}/>
                  </div>
                  <button onClick={() => { const nv = !v.actif; setVarLocal(v.id, { actif: nv }); persistVar(v.id, { actif: nv }) }} title="Actif / inactif"
                    style={{ width: 34, height: 20, borderRadius: 100, background: v.actif ? T.main : '#D1D5DB', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                    <div style={{ position: 'absolute', top: 2, left: v.actif ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }}/>
                  </button>
                  <button onClick={() => deleteVariante(v.id)} style={{ ...s.btn, ...s.btnDanger, padding: '4px 7px', fontSize: 11 }} title="Supprimer">
                    <Icon name="trash" size={12} color="#DC2626"/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Carte article réutilisable ───────────────────────────────────────────────
const JOURS_KEYS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_LABELS_COURT = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

function ArticleCard({ a, estVitrine = false, estDetail = false, joursFermes = [], fermeturesSemaine = {}, onEdit, onToggle, onUpdateStock, onDelete, s, consoParJour = {}, stockParJour = {}, onSetStockJour, onSetStockTousJours }) {
  const [showOptions, setShowOptions] = useState(false)
  const [jourEdite, setJourEdite] = useState(null)
  const [editVal, setEditVal] = useState('')

  // Sémantique commerçant : "stock dispo" = ce qu'il reste à vendre maintenant.
  // En interne on stocke le brut total préparé pour la journée ; le dispo se
  // recalcule = brut − déjà commandé. Quand le commerçant édite, il pense en
  // "dispo courant" → on sauve dispoSaisi + dejaCommande comme nouveau brut.
  // dejaCommande n'est appliqué qu'au jour ACTUEL (les commandes ne touchent
  // que le stock du jour où elles sont passées).
  const jourActuelIdx = (() => { const i = new Date().getDay(); return i === 0 ? 6 : i - 1 })()
  const jourActuelKey = JOURS_KEYS[jourActuelIdx]
  // Conso par jour de RETRAIT (bug 14) : dejaCommande = celle d'aujourd'hui
  const dejaCommande = consoParJour[jourActuelKey] || 0

  const dispoEffectif = (jour) => {
    const entry = stockParJour[jour]
    // Conso du jour de RETRAIT (plus seulement aujourd'hui, bug 14)
    const conso = consoParJour[jour] || 0
    if (entry) {
      if (entry.actif === false) return { dispo: 0, ferme: true, override: true, brut: entry.stock }
      const dispo = Math.max(0, (entry.stock || 0) - conso)
      return { dispo, ferme: false, override: true, brut: entry.stock || 0 }
    }
    const brut = a.stock_jour || 0
    return { dispo: Math.max(0, brut - conso), ferme: false, override: false, brut }
  }

  const effAuj = dispoEffectif(jourActuelKey)
  const stockBrutAuj = effAuj.brut
  const stockRestant = effAuj.dispo
  // Commerce fermé aujourd'hui (horaires Profil), sans dérogation de stock active
  const fermeCommerceAuj = joursFermes.includes(jourActuelKey) && !(effAuj.override && !effAuj.ferme && stockBrutAuj > 0)
  // Fermeture exceptionnelle (congés) couvrant aujourd'hui
  const congeAuj = !!fermeturesSemaine[jourActuelKey]

  async function ouvrirEdition(jour) {
    // Fermeture exceptionnelle (congés) sur la prochaine occurrence de ce jour :
    // avertit avant d'autoriser une dérogation de stock.
    if (fermeturesSemaine[jour]) {
      const motif = fermeturesSemaine[jour].motif
      const ok = await confirme(confirmationSimple({ titre: `Tu es en congé ce ${jour}`, message: motif ? `Motif noté : ${motif}. Prévoir du stock ce jour-là quand même ?` : 'Prévoir du stock ce jour-là quand même ?', action: 'Oui, prévoir du stock', ton: 'principal' }))
      if (!ok) return
    } else if (joursFermes.includes(jour)) {
      // Jour fermé au Profil : avertit avant d'autoriser une dérogation de stock.
      const ok = await confirme(confirmationSimple({ titre: `Ton commerce est fermé le ${jour}`, message: 'C’est ce que disent tes horaires dans le Profil. Prévoir du stock ce jour-là quand même ?', action: 'Oui, prévoir du stock', ton: 'principal' }))
      if (!ok) return
    }
    const eff = dispoEffectif(jour)
    setEditVal(String(eff.dispo))
    setJourEdite(jour)
  }

  function fermerEdition() { setJourEdite(null); setEditVal('') }

  function sauvegarder(jour, actif) {
    // L'utilisateur saisit le DISPO. On stocke le brut = dispo + déjà commandé
    // POUR CE JOUR DE RETRAIT (bug 14 : plus seulement le jour actuel).
    const dispoSaisi = Math.max(0, parseInt(editVal) || 0)
    const conso = consoParJour[jour] || 0
    const brut = actif ? dispoSaisi + conso : 0
    onSetStockJour(a.id, jour, brut, actif)
    fermerEdition()
  }

  return (
    <div style={{ ...s.card, opacity: a.actif ? 1 : 0.6, borderLeft: `4px solid ${a.actif ? T.main : '#E5E7EB'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        {a.photo_url && (
          <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.hairline}` }}>
            <img decoding="async" loading="lazy" src={a.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: T.ink, fontSize: 15 }}>{a.nom}</span>
            <span style={{ ...s.tag, background: a.actif ? T.bgPanel : '#F3F4F6', color: a.actif ? '#fff' : T.muted }}>{a.actif ? 'Actif' : 'Inactif'}</span>
          </div>
          {a.description && <p style={{ fontSize: 12, color: T.muted, margin: '0 0 8px' }}>{a.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 8 }}>
            {Number(a.prix) > 0 ? (
              <span style={{ fontWeight: 900, fontSize: 18, color: T.bgPanel, letterSpacing: '-0.3px' }}>
                {estVitrine && <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginRight: 4 }}>à partir de</span>}
                {Number(a.prix).toFixed(2)} €
              </span>
            ) : estVitrine ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>Prix sur demande</span>
            ) : null}
            {/* Détail : stock permanent simple, cliquable pour l'ajuster */}
            {estDetail && (() => {
              const st = a.stock_jour || 0
              return (
                <button type="button" title="Modifier le stock"
                  onClick={() => { const v = window.prompt('Stock disponible :', String(st)); if (v !== null) onUpdateStock(a.id, v) }}
                  style={{ fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: st === 0 ? '#DC2626' : st <= 2 ? '#EA580C' : '#10B981', background: st === 0 ? '#FEE2E2' : st <= 2 ? '#FFF7ED' : '#F0FDF4', padding: '3px 8px', borderRadius: 100 }}>
                  {st === 0 ? 'Épuisé' : `Stock : ${st}`}
                </button>
              )
            })()}
            {!estVitrine && !estDetail && (a.temps_prepa || 0) > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.bgPanel, background: '#F8F6FF', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={11} color={T.bgPanel}/>{a.temps_prepa} min</span>}
            {!estVitrine && !estDetail && (congeAuj ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.main, background: T.pale, padding: '3px 8px', borderRadius: 100 }}>Fermé aujourd&rsquo;hui (congés)</span>
            ) : fermeCommerceAuj ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, background: '#F9FAFB', padding: '3px 8px', borderRadius: 100 }}>Fermé aujourd&rsquo;hui (horaires)</span>
            ) : effAuj.ferme ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, background: '#F9FAFB', padding: '3px 8px', borderRadius: 100 }}>Fermé aujourd&rsquo;hui</span>
            ) : stockBrutAuj > 0 ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: stockRestant === 0 ? '#DC2626' : stockRestant <= 2 ? '#EA580C' : '#10B981', background: stockRestant === 0 ? '#FEE2E2' : stockRestant <= 2 ? '#FFF7ED' : '#F0FDF4', padding: '3px 8px', borderRadius: 100 }}>
                Aujourd&rsquo;hui&nbsp;: {stockRestant} dispo {dejaCommande > 0 && <span style={{ opacity: 0.65 }}>({dejaCommande} commandé{dejaCommande > 1 ? 's' : ''})</span>}
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, background: '#F9FAFB', padding: '3px 8px', borderRadius: 100 }}>Non géré</span>
            ))}
            {estVitrine && (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.main, background: T.pale, padding: '3px 8px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Prix indicatif · non commandable
              </span>
            )}
          </div>

          {/* 7 chips stock par jour — modèle C&C alimentaire uniquement
              (vitrine : pas de stock ; détail : stock permanent simple) */}
          {!estVitrine && !estDetail && <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stock par jour</span>
              <button onClick={() => {
                const v = window.prompt('Stock disponible à appliquer aux 7 jours :', String(stockRestant))
                if (v !== null) {
                  const dispo = Math.max(0, parseInt(v) || 0)
                  onSetStockTousJours(a.id, dispo, consoParJour)
                }
              }} style={{ ...s.btn, ...s.btnGhost, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                Appliquer à tous
              </button>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {JOURS_KEYS.map((jour, idx) => {
                const eff = dispoEffectif(jour)
                const ferme = eff.ferme
                const epuise = !ferme && eff.dispo === 0
                const aujourdhui = jour === jourActuelKey
                const fermeCommerce = joursFermes.includes(jour)
                const conge = fermeturesSemaine[jour]
                // Dérogation : stock actif malgré la fermeture du commerce (orange, à surveiller)
                const derogation = fermeCommerce && !conge && eff.override && !ferme && (eff.brut || 0) > 0
                const afficheFerme = ferme || conge || (fermeCommerce && !derogation)
                const enEdition = jourEdite === jour
                const couleurs = enEdition
                  ? { bg: T.bgPanel, color: '#fff', border: T.bgPanel }
                  : conge
                  ? { bg: T.pale, color: T.main, border: T.light }
                  : afficheFerme
                  ? { bg: '#F3F4F6', color: '#9CA3AF', border: '#E5E7EB' }
                  : derogation
                  ? { bg: '#FFF7ED', color: '#EA580C', border: '#FDBA74' }
                  : epuise
                  ? { bg: '#FEE2E2', color: '#DC2626', border: '#FCA5A5' }
                  // Vert = il y a du stock ce jour, que la valeur vienne du défaut
                  // de l'article ou d'une personnalisation du jour (Alex 23/07 :
                  // la nuance défaut/personnalisé ne porte aucun sens commerçant)
                  : { bg: '#F0FDF4', color: '#10B981', border: '#86EFAC' }
                return (
                  <button key={jour} onClick={() => ouvrirEdition(jour)}
                    title={conge ? `Fermeture exceptionnelle${conge.motif ? ` : ${conge.motif}` : ''}` : fermeCommerce ? (derogation ? 'Stock prévu malgré la fermeture (horaires du Profil)' : 'Commerce fermé ce jour (horaires du Profil)') : undefined}
                    style={{ padding: '4px 8px', borderRadius: 8, border: `1.5px solid ${enEdition ? T.bgPanel : aujourdhui ? T.main : couleurs.border}`, background: couleurs.bg, color: couleurs.color, fontSize: 11, fontWeight: 700, cursor: 'pointer', minWidth: 52, fontFamily: 'inherit', transition: 'all 0.15s', position: 'relative' }}>
                    {aujourdhui && <span title="Aujourd'hui" style={{ position: 'absolute', top: 3, right: 4, width: 5, height: 5, borderRadius: '50%', background: enEdition ? '#fff' : T.main }}/>}
                    <span style={{ display: 'block', fontSize: 9, opacity: 0.7 }}>{JOURS_LABELS_COURT[idx]}</span>
                    <span style={{ display: 'block', fontWeight: 900 }}>{afficheFerme ? '✕' : eff.dispo}</span>
                  </button>
                )
              })}
            </div>

            {/* Éditeur inline — saisie en "stock dispo" (intuitif) */}
            {jourEdite && (() => {
              const consoEdit = consoParJour[jourEdite] || 0
              return (
                <div style={{ marginTop: 8, padding: 12, background: '#FAFAFA', borderRadius: 10, border: `1px solid ${T.hairline}` }}>
                  {/* Ligne 1 : label + input + bouton primaire (sur petit écran : label en haut, input + bouton sur la ligne) */}
                  <div className="stock-editor-row" style={{ marginBottom: 8 }}>
                    <span className="stock-editor-label" style={{ fontSize: 12, fontWeight: 800, color: T.deep }}>
                      Stock du {jourEdite}
                    </span>
                    <input className="stock-editor-input" type="number" min={0} value={editVal} autoFocus
                      onChange={e => setEditVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') sauvegarder(jourEdite, true); if (e.key === 'Escape') fermerEdition() }}
                      style={{ ...s.input, width: 90, textAlign: 'center', padding: '6px 8px', fontSize: 14, fontWeight: 700 }}/>
                    <button onClick={() => sauvegarder(jourEdite, true)}
                      style={{ ...s.btn, ...s.btnPrimary, padding: '6px 14px', fontSize: 12 }}>
                      Enregistrer
                    </button>
                  </div>
                  {/* Ligne 2 : actions secondaires */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => sauvegarder(jourEdite, false)}
                      style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5' }}>
                      Article indisponible ce jour
                    </button>
                    <button onClick={fermerEdition}
                      style={{ ...s.btn, ...s.btnGhost, padding: '5px 12px', fontSize: 12 }}>
                      Annuler
                    </button>
                  </div>
                  {fermeturesSemaine[jourEdite] ? (
                    <p style={{ fontSize: 11, color: '#EA580C', fontWeight: 700, margin: '8px 0 0', lineHeight: 1.5 }}>
                      Attention : fermeture exceptionnelle prévue ce {jourEdite}{fermeturesSemaine[jourEdite].motif ? ` (${fermeturesSemaine[jourEdite].motif})` : ''}. Les clients ne pourront pas commander ce jour-là.
                    </p>
                  ) : joursFermes.includes(jourEdite) && (
                    <p style={{ fontSize: 11, color: '#EA580C', fontWeight: 700, margin: '8px 0 0', lineHeight: 1.5 }}>
                      Attention : ton commerce est fermé le {jourEdite} selon tes horaires (Profil). Les clients ne pourront pas commander ce jour-là.
                    </p>
                  )}
                  {consoEdit > 0 && (
                    <p style={{ fontSize: 11, color: T.muted, fontWeight: 600, margin: '8px 0 0' }}>
                      {consoEdit} déjà commandé{consoEdit > 1 ? 's' : ''} pour ce jour, sera ajouté automatiquement au total brut interne.
                    </p>
                  )}
                </div>
              )
            })()}
          </div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <Toggle value={a.actif} onChange={() => onToggle(a)}/>
          <button style={{ ...s.btn, ...s.btnGhost, padding: '6px 10px', fontSize: 12 }} onClick={() => onEdit(a)} title="Modifier l'article">
            <Icon name="edit" size={14} color={T.bgPanel}/>
          </button>
          <button style={{ ...s.btn, ...s.btnGhost, padding: '6px 10px', fontSize: 12, background: showOptions ? T.bgPanel : '#fff', color: showOptions ? '#fff' : T.bgPanel, borderColor: showOptions ? T.bgPanel : T.hairline }} onClick={() => setShowOptions(v => !v)} title="Options & personnalisation">
            <Icon name="sliders" size={14} color={showOptions ? '#fff' : T.bgPanel}/>
          </button>
          <button style={{ ...s.btn, ...s.btnDanger, padding: '6px 10px', fontSize: 12 }} onClick={() => onDelete(a.id)} title="Supprimer">
            <Icon name="trash" size={14} color="#DC2626"/>
          </button>
        </div>
      </div>
      {showOptions && ((estDetail || estVitrine)
        ? <VariantesArticle article={a} toast={(msg, type) => { const ev = new CustomEvent('yoppaa-toast', {detail:{msg,type}}); window.dispatchEvent(ev) }}/>
        : <OptionsArticle articleId={a.id} toast={(msg, type) => { const ev = new CustomEvent('yoppaa-toast', {detail:{msg,type}}); window.dispatchEvent(ev) }}/>)}
    </div>
  )
}

// ─── Onglet DEALS ─────────────────────────────────────────────────────────────
// Création/édition des deals d'un commerçant + intégration Good Morning Yoppers.
// Règles :
//   - 1 seul deal par jour peut être inclus dans Le Morning
//   - Deadline : 23h00 (commercant.heure_limite_morning) la veille
//   - Si on coche inclus_morning sur deal A, on décoche les autres deals
//     du même commerçant pour la même date_deal
function TabDeals({ commercantId, commercant, toast }) {
  const today = new Date().toISOString().slice(0, 10)
  const [deals, setDeals] = useState([])
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    titre: '', description: '', description_longue: '', prix_deal: '', prix_original: '',
    deal_type: 'lot', remise_pct: '', unites_par_deal: '', article2_id: '',
    // Défaut AUJOURD'HUI : un deal créé doit être visible immédiatement dans
    // l'app et le GMY (le défaut "demain" rendait les nouveaux deals invisibles
    // le jour même, incompréhensible pour le commerçant).
    date_debut: today, date_fin: today,
    heure_debut: '00:00', heure_fin: '23:59',
    inclus_morning: false, actif: true, article_id: '',
    cta_appeler_reserver: false,
    photo_url: '', est_bonne_affaire: false,
  })
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // Propositions IA pour l'accroche : le commerçant choisit puis peut modifier
  const [propsIa, setPropsIa] = useState([])
  const firstLoadRef = useRef(true)

  // Heure limite Morning : RÈGLE PRODUIT FIXE 23h00 (la colonne DB
  // heure_limite_morning contenait des valeurs erronées type 21:00, on ne la
  // lit plus : une seule vérité annoncée partout).
  const heureLimite = '23h00'

  // Articles réellement liables à un deal (les articles à variantes sont exclus
  // depuis le 26/07). Un commerce de SERVICES n'a pas de catalogue commandable :
  // ses prestations vivent dans rdv_prestations, donc lier un article ne peut
  // jamais être obligatoire chez lui, sa remise est une annonce.
  const articlesLiables = articles.filter(a => !a.gere_variantes)
  const articleRequis = articlesLiables.length > 0 && commercant?.categorie !== 'vitrine'
  // Catégories réellement utilisées par le catalogue : viser une catégorie vide
  // créerait une promo qui ne s'applique à rien.
  const categoriesLiables = [...new Set(articlesLiables.map(a => a.categorie).filter(Boolean))].sort()

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchDeals(); fetchArticles() }, [commercantId])

  async function fetchDeals() {
    if (firstLoadRef.current) setLoading(true)
    // On récupère error : une lecture qui échoue en silence affichait une liste
    // vide, donc « mon deal ne s'est pas enregistré » alors qu'il existait.
    // Embed DÉSAMBIGUÏSÉ : yoppaa_deals pointe DEUX fois vers articles
    // (article_id et article2_id du duo), PostgREST refusait donc la jointure
    // (PGRST201) et la liste restait vide. Le hint !article_id lève le doute.
    const { data, error } = await supabase.from('yoppaa_deals')
      .select('*, article:articles!article_id(id, nom, prix, categorie)')
      .eq('commercant_id', commercantId)
      .order('date_deal', { ascending: false, nullsLast: true })
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[TabDeals.fetchDeals]', error)
      toast(`Lecture des deals impossible : ${error.message}`, 'error')
    }
    setDeals(data || [])
    if (firstLoadRef.current) { setLoading(false); firstLoadRef.current = false }
  }

  async function fetchArticles() {
    const { data, error } = await supabase.from('articles')
      .select('id, nom, prix, categorie, actif, gere_variantes')
      .eq('commercant_id', commercantId)
      .eq('actif', true)
      .order('categorie').order('nom')
    if (error) console.error('[TabDeals.fetchArticles]', error)
    setArticles(data || [])
  }

  function openNew() {
    setForm({ titre: '', description: '', description_longue: '', prix_deal: '', prix_original: '',
      deal_type: 'lot', remise_pct: '', unites_par_deal: '', article2_id: '',
      date_debut: today, date_fin: today,
      heure_debut: '00:00', heure_fin: '23:59',
      inclus_morning: false, actif: true, article_id: '', categorie_cible: '',
      cta_appeler_reserver: false,
      photo_url: '', est_bonne_affaire: false })
    setPropsIa([])
    setEditId(null); setShowForm(true)
  }
  function openEdit(d) {
    // Récupère date_debut/date_fin depuis les timestamps ou retombe sur date_deal
    const dDebut = d.date_debut ? d.date_debut.slice(0, 10) : (d.date_deal || today)
    const dFin   = d.date_fin   ? d.date_fin.slice(0, 10)   : (d.date_deal || today)
    const hDebut = d.date_debut ? d.date_debut.slice(11, 16) : '00:00'
    const hFin   = d.date_fin   ? d.date_fin.slice(11, 16)   : '23:59'
    setForm({
      titre: d.titre || '',
      description: d.description || '',
      description_longue: d.description_longue || '',
      prix_deal: String(d.prix_deal ?? ''),
      prix_original: String(d.prix_original ?? ''),
      deal_type: d.deal_type || 'lot',
      remise_pct: String(d.remise_pct ?? ''),
      unites_par_deal: String(d.unites_par_deal ?? ''),
      article2_id: d.article2_id || '',
      date_debut: dDebut,
      date_fin: dFin,
      heure_debut: hDebut,
      heure_fin: hFin,
      inclus_morning: !!d.inclus_morning,
      actif: d.actif !== false,
      article_id: d.article_id || '',
      categorie_cible: d.categorie_cible || '',
      cta_appeler_reserver: !!d.cta_appeler_reserver,
      photo_url: d.photo_url || '',
      est_bonne_affaire: !!d.est_bonne_affaire,
    })
    setPropsIa([])
    setEditId(d.id); setShowForm(true)
  }

  // Upload photo deal dans le bucket 'logos' existant. Compression client
  // 1200x1200 JPEG q=0.85 pour la modale enrichie cote client (photo hero).
  async function uploadPhotoDeal(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo brut)', 'error'); return }
    setUploadingPhoto(true)
    const compressed = await compresserImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85 })
    const fileName = `deal-${commercantId}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (error) { toast('Erreur upload photo', 'error'); setUploadingPhoto(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    setForm(f => ({ ...f, photo_url: urlData.publicUrl }))
    setUploadingPhoto(false)
  }

  // Une remise vise UN article ou TOUTE une catégorie, jamais les deux : le
  // même menu déroulant propose donc les deux, les catégories étant préfixées
  // « cat: » pour les distinguer d'un identifiant d'article.
  // Choisir un article pré-remplit le prix d'origine.
  function onArticleChange(valeur) {
    if (String(valeur).startsWith('cat:')) {
      setForm(p => ({ ...p, article_id: '', categorie_cible: String(valeur).slice(4) }))
      return
    }
    const art = articles.find(a => a.id === valeur)
    setForm(p => ({
      ...p,
      article_id: valeur,
      categorie_cible: '',
      prix_original: art && !p.prix_original ? String(art.prix) : p.prix_original,
    }))
  }

  // Calcule si la deadline Morning est dépassée pour la date du deal
  function deadlinePassee(dateDeal, inclusMorning) {
    if (!inclusMorning) return false
    if (!dateDeal) return false
    // Pour figurer dans Le Morning du jour J, il faut soumettre avant 23h J-1
    // Donc deadline = "veille du deal à 23h00" (règle produit fixe)
    const veille = new Date(dateDeal + 'T00:00:00')
    veille.setDate(veille.getDate() - 1)
    veille.setHours(23, 0, 0, 0)
    return new Date() > veille
  }

  async function saveDeal() {
    if (!form.titre.trim()) return toast('Titre obligatoire', 'error')
    if (!form.date_debut) return toast('Date de début obligatoire', 'error')
    const dDebut = form.date_debut
    const dFin = form.date_fin || dDebut
    if (dFin < dDebut) return toast('La date de fin doit être après la date de début', 'error')
    setSaving(true)
    const dateDebut = `${dDebut}T${form.heure_debut || '00:00'}:00`
    const dateFin   = `${dFin}T${form.heure_fin || '23:59'}:59`
    // Validation par type de deal
    if (form.deal_type === 'remise_pct') {
      const pct = parseInt(form.remise_pct, 10)
      if (!pct || pct < 1 || pct > 90) { setSaving(false); return toast('Indique une remise entre 1 et 90 %', 'error') }
      // L'article n'est exigé que s'il y en a à lier. Un commerce de services
      // n'a pas de catalogue commandable (ses prestations vivent dans
      // rdv_prestations) : sa remise est une ANNONCE, pas un article en promo.
      // Sans ce garde-fou, aucun deal n'était jamais enregistré côté vitrine
      // (bug signalé par Alex 01/08).
      if (articleRequis && !form.article_id && !form.categorie_cible) { setSaving(false); return toast('Une remise % doit viser un article ou une catégorie', 'error') }
    }
    if (form.deal_type === 'bundle' && !form.article2_id) {
      setSaving(false); return toast('Choisis le second article du duo', 'error')
    }
    // Validation prix : prix_deal doit etre inferieur au prix_original (audit M4.2 bug)
    if (form.deal_type !== 'remise_pct' && form.prix_deal && form.prix_original) {
      const pd = parseFloat(form.prix_deal)
      const po = parseFloat(form.prix_original)
      if (pd >= po) {
        setSaving(false)
        return toast('Le prix deal doit être inférieur au prix d\'origine', 'error')
      }
    }
    const payload = {
      commercant_id: commercantId,
      titre: form.titre.trim(),
      description: form.description.trim() || null,
      description_longue: form.description_longue.trim() || null,
      prix_deal: form.prix_deal ? parseFloat(form.prix_deal) : null,
      prix_original: form.prix_original ? parseFloat(form.prix_original) : null,
      deal_type: form.deal_type || 'lot',
      remise_pct: form.deal_type === 'remise_pct' && form.remise_pct ? parseInt(form.remise_pct, 10) : null,
      unites_par_deal: form.deal_type === 'lot' && form.unites_par_deal ? Math.max(1, parseInt(form.unites_par_deal, 10)) : 1,
      article2_id: form.deal_type === 'bundle' && form.article2_id ? form.article2_id : null,
      // date_deal = 1er jour de la période (utilisé pour la sélection Good Morning Yoppers)
      date_deal: dDebut,
      date_debut: dateDebut,
      date_fin: dateFin,
      inclus_morning: !!form.inclus_morning,
      actif: !!form.actif,
      article_id: form.article_id || null,
      // Une catégorie entière ne se remise que par un pourcentage ou un prix
      // promo : un lot « 3 + 1 » sur une catégorie n'aurait aucun sens, on ne
      // saurait pas ce qui est offert.
      categorie_cible: (estRemiseSurProduit({ deal_type: form.deal_type }) && form.categorie_cible) ? form.categorie_cible : null,
      cta_appeler_reserver: !!form.cta_appeler_reserver,
      photo_url: form.photo_url || null,
      est_bonne_affaire: !!form.est_bonne_affaire,
      // Reset statut_morning a 'pending' si on remet inclus_morning=true a l'edition,
      // pour que le cron 7h30 le repique le lendemain
      ...(form.inclus_morning ? { statut_morning: 'pending' } : {}),
    }

    // Règle : 1 seul deal coché pour le Morning par jour → décocher les autres
    // pour le même date_deal (jour de featuring Morning)
    if (payload.inclus_morning) {
      const q = supabase.from('yoppaa_deals')
        .update({ inclus_morning: false })
        .eq('commercant_id', commercantId)
        .eq('date_deal', dDebut)
      if (editId) q.neq('id', editId)
      await q
    }

    // .select() pour détecter les RLS silencieux (0 rows affected)
    const { data, error } = editId
      ? await supabase.from('yoppaa_deals').update(payload).eq('id', editId).select()
      : await supabase.from('yoppaa_deals').insert(payload).select()
    setSaving(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || data.length === 0) {
      toast('Modification refusée par les permissions Supabase (RLS)', 'error')
      return
    }
    toast(editId ? 'Deal mis à jour' : 'Deal créé')

    // Push OneSignal aux favoris du commercant, uniquement a la CREATION
    // d'un deal actif (pas a chaque edit, evite spam). Fire-and-forget non
    // bloquant. Gating cote route API (plan Communiquer/Vendre + publie).
    if (!editId && payload.actif && data[0]?.id) {
      fetch('/api/deals/notify-favoris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: data[0].id }),
      }).catch(e => console.warn('[deals/notify-favoris] envoi echoue', e?.message))
    }

    setShowForm(false); fetchDeals()
  }

  async function deleteDeal(id) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer ce deal ?', message: 'Il disparaît de ta fiche tout de suite.', action: 'Oui, supprimer ce deal' }))) return
    const { data, error } = await supabase.from('yoppaa_deals').delete().eq('id', id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || data.length === 0) { toast('Suppression refusée (RLS)', 'error'); return }
    toast('Deal supprimé'); fetchDeals()
  }

  async function toggleActif(d) {
    const { data, error } = await supabase.from('yoppaa_deals').update({ actif: !d.actif }).eq('id', d.id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || data.length === 0) { toast('Modification refusée (RLS)', 'error'); return }
    fetchDeals()
  }

  // Filtre : actuels/futurs vs passés
  const dealsActuels = deals.filter(d => !d.date_deal || d.date_deal >= today)
  const dealsPasses  = deals.filter(d => d.date_deal && d.date_deal < today)

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  const warningSoumission = form.inclus_morning && deadlinePassee(form.date_debut, true)

  return (
    <div>
      {/* En-tête violet foncé */}
      <div style={{ background: T.bgPanel, borderRadius: 14, padding: '18px 20px', marginBottom: 14, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>Deals</p>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>
            {deals.length} deal{deals.length > 1 ? 's' : ''}
            <span style={{ color: T.light, fontWeight: 600, fontSize: 14, marginLeft: 8 }}>· {dealsActuels.length} à venir / actif{dealsActuels.length > 1 ? 's' : ''}</span>
          </h2>
        </div>
        <button style={{ ...s.btn, background: '#fff', color: T.bgPanel }} onClick={openNew}>
          <Icon name="plus" size={14}/> Nouveau deal
        </button>
      </div>

      {/* Info Good Morning Yoppers */}
      <div style={{ background: '#FFF7ED', borderLeft: `4px solid #EA580C`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 12.5, color: '#7C2D12', lineHeight: 1.5 }}>
        <strong>Good Morning Yoppers</strong> · l&rsquo;édition du matin + le push de 7h30, envoyés à tous les Yoppers de ta commune.
        <br/>Pour y figurer : coche «&nbsp;Inclure dans le Good Morning Yoppers&nbsp;» et enregistre <strong>avant {heureLimite} la veille</strong>. Publié trop tard&nbsp;? Ton deal reste visible sur ta fiche, avec la pastille DEAL qui clignote côté clients. Un seul deal par matin.
      </div>

      {/* Formulaire création / édition */}
      {showForm && (
        <div style={s.cardActive}>
          <h3 style={{ ...s.h3, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name={editId ? 'edit' : 'plus'} size={14} color={T.main}/>
            {editId ? 'Modifier le deal' : 'Nouveau deal'}
          </h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><label style={s.label}>Titre *</label><Input value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder={commercant?.categorie === 'detail' ? 'Ex: -20% sur la nouvelle collection' : commercant?.categorie === 'vitrine' ? 'Ex: -15% cette semaine sur le soin signature' : 'Ex: 2 croissants achetés, 1 offert'}/></div>

            {/* Photo du deal (utilisee en hero dans la modale enrichie cote client) */}
            <div>
              <label style={s.label}>Photo du deal</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {form.photo_url ? (
                  <div style={{ position: 'relative', width: 88, height: 88, borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${T.pale}`, flexShrink: 0 }}>
                    <img decoding="async" loading="lazy" src={form.photo_url} alt="Photo deal" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                    <button type="button" onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Retirer la photo">×</button>
                  </div>
                ) : (
                  <div style={{ width: 88, height: 88, borderRadius: 12, background: '#FAFAFA', border: `1.5px dashed ${T.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Camera size={22} strokeWidth={1.8} color={T.muted}/>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <label style={{ ...s.btn, ...s.btnGhost, cursor: 'pointer', display: 'inline-flex' }}>
                    <Icon name="camera" size={14} color={T.bgPanel}/>
                    {uploadingPhoto ? 'Chargement…' : (form.photo_url ? 'Remplacer' : 'Ajouter une photo')}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhotoDeal(e.target.files?.[0])} disabled={uploadingPhoto}/>
                  </label>
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                    Une photo attractive multiplie les clics. Compressée automatiquement.
                    <br/>Format idéal : paysage 4:3, minimum 1200×900 px. Les photos carrées ou portrait seront centrées et croppées.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                <label style={{ ...s.label, marginBottom: 0 }}>Accroche courte</label>
                <BoutonIaInline commercantId={commercantId} surface="deal" occasion="Bon plan" brief={form.titre}
                  infos={[form.prix_deal && `prix ${form.prix_deal}€`, form.prix_original && `au lieu de ${form.prix_original}€`].filter(Boolean).join(', ')}
                  onVariantes={vs => setPropsIa(vs)}
                  toast={toast} />
              </div>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Une ou deux phrases affichées sur la card du deal…"/>
              <PropositionsIa propositions={propsIa} avecLong
                onChoisir={v => { setForm(p => ({ ...p, description: v.court || p.description, description_longue: v.long || p.description_longue })); setPropsIa([]) }}
                onFermer={() => setPropsIa([])} />
            </div>

            <div>
              <label style={s.label}>Description enrichie</label>
              <Textarea value={form.description_longue} onChange={e => setForm(p => ({ ...p, description_longue: e.target.value }))} placeholder="Détails complets affichés sur la fiche du deal : conditions, composition, avantages…" style={{ minHeight: 110 }}/>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                Visible dans la fiche complète du deal côté Yopper. Idéal pour raconter l&rsquo;histoire du produit ou détailler les conditions.
              </p>
            </div>
            {/* Type de deal (sprint deals 26/07) : lot / remise % / prix fixe / duo */}
            <div>
              <label style={s.label}>Type de deal</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {[
                  { v: 'lot', label: 'Lot (ex: 3+1)' },
                  { v: 'remise_pct', label: 'Remise %' },
                  { v: 'prix_fixe', label: 'Prix promo' },
                  // Le duo exige DEUX articles au catalogue : inutile de le
                  // proposer à qui n'en a pas (salon, institut...).
                  ...(articlesLiables.length >= 2 ? [{ v: 'bundle', label: 'Duo (2 articles)' }] : []),
                ].map(t => (
                  <button key={t.v} type="button" onClick={() => setForm(p => ({ ...p, deal_type: t.v }))}
                    style={{ padding: '7px 13px', borderRadius: 100, border: `1.5px solid ${form.deal_type === t.v ? T.main : T.hairline}`, background: form.deal_type === t.v ? T.main : '#fff', color: form.deal_type === t.v ? '#fff' : T.ink, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={s.label}>
                {form.deal_type === 'remise_pct'
                  ? (articleRequis ? 'Ce que la remise vise *' : 'Ce que la remise vise (optionnel)')
                  : form.deal_type === 'bundle' ? 'Premier article du duo' : 'Article concerné (optionnel)'}
              </label>
              <select value={form.categorie_cible ? `cat:${form.categorie_cible}` : form.article_id}
                onChange={e => onArticleChange(e.target.value)}
                style={{ ...s.input, cursor: 'pointer' }}>
                <option value="">— Deal général (pas lié à un produit) —</option>
                {/* Articles à variantes exclus (décision 26/07 : pas de deal sur
                    variantes en V1, stock/choix ingérables) */}
                {articlesLiables.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nom}{a.categorie ? ` · ${a.categorie}` : ''} · {Number(a.prix).toFixed(2)}€
                  </option>
                ))}
                {/* Toute une catégorie d'un coup, réservé aux remises : « -20 %
                    sur les shampoings » évite de créer un deal par produit. */}
                {estRemiseSurProduit({ deal_type: form.deal_type }) && categoriesLiables.length > 0 && (
                  <optgroup label="Toute une catégorie">
                    {categoriesLiables.map(cat => (
                      <option key={cat} value={`cat:${cat}`}>Tous les articles · {cat}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                {articlesLiables.length === 0
                  ? 'Tu n’as pas encore de produit à lier : ton offre s’affichera comme une annonce sur ta fiche (le client te contacte ou passe te voir).'
                  : estRemiseSurProduit({ deal_type: form.deal_type })
                    ? 'La remise s’applique directement au produit : ton client voit le prix barré et le prix promo, et paie le prix promo. Pas de doublon dans ton catalogue.'
                    : 'Le lot s’affiche comme une carte à part sous l’article : le produit reste achetable à l’unité au prix normal, parce qu’une unité n’est pas un lot.'}
              </p>
            </div>
            {form.deal_type === 'bundle' && (
              <div>
                <label style={s.label}>Second article du duo *</label>
                <select value={form.article2_id} onChange={e => setForm(p => ({ ...p, article2_id: e.target.value }))}
                  style={{ ...s.input, cursor: 'pointer' }}>
                  <option value="">— Choisir —</option>
                  {articles.filter(a => !a.gere_variantes && a.id !== form.article_id).map(a => (
                    <option key={a.id} value={a.id}>{a.nom} · {Number(a.prix).toFixed(2)}€</option>
                  ))}
                </select>
              </div>
            )}
            {form.deal_type === 'remise_pct' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={s.label}>Remise (%) *</label>
                  <Input type="number" step="1" min="1" max="90" value={form.remise_pct} onChange={e => setForm(p => ({ ...p, remise_pct: e.target.value }))} placeholder="20"/>
                </div>
                <div style={{ alignSelf: 'end', paddingBottom: 8 }}>
                  {(() => {
                    const art = articles.find(a => a.id === form.article_id)
                    const pct = parseInt(form.remise_pct, 10)
                    if (!art || !pct) return <p style={{ fontSize: 11, color: T.muted, margin: 0 }}>Prix calculé automatiquement</p>
                    return <p style={{ fontSize: 12.5, fontWeight: 800, color: T.main, margin: 0 }}>{(Number(art.prix) * (100 - pct) / 100).toFixed(2)}€ <span style={{ color: T.muted, fontWeight: 600, textDecoration: 'line-through' }}>{Number(art.prix).toFixed(2)}€</span></p>
                  })()}
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: form.deal_type === 'lot' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                <div style={{ minWidth: 0 }}><label style={s.label}>{form.deal_type === 'lot' ? 'Prix du lot (€)' : form.deal_type === 'bundle' ? 'Prix du duo (€)' : 'Prix promo (€)'}</label><Input type="number" step="0.10" min="0" value={form.prix_deal} onChange={e => setForm(p => ({ ...p, prix_deal: e.target.value }))} placeholder="2.50" style={{ width: '100%', boxSizing: 'border-box' }}/></div>
                <div style={{ minWidth: 0 }}><label style={s.label}>Prix d&rsquo;origine (€)</label><Input type="number" step="0.10" min="0" value={form.prix_original} onChange={e => setForm(p => ({ ...p, prix_original: e.target.value }))} placeholder="3.50" style={{ width: '100%', boxSizing: 'border-box' }}/></div>
                {form.deal_type === 'lot' && (
                  <div style={{ minWidth: 0 }}>
                    <label style={s.label}>Unités / lot</label>
                    <Input type="number" step="1" min="1" value={form.unites_par_deal} onChange={e => setForm(p => ({ ...p, unites_par_deal: e.target.value }))} placeholder="4" style={{ width: '100%', boxSizing: 'border-box' }}/>
                    <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Ex : « 3+1 » = 4. Sert au décompte du stock.</p>
                  </div>
                )}
              </div>
            )}
            {/* minWidth: 0 sur les cellules : sans ça, les inputs date/time natifs
                (largeur intrinsèque, surtout iOS) débordent de la grille à droite. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <label style={s.label}>Date début *</label>
                <Input type="date" value={form.date_debut} min={today}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  onChange={e => {
                    const v = e.target.value
                    setForm(p => ({
                      ...p,
                      date_debut: v,
                      // Si la date de fin est avant la nouvelle date début → on l'aligne
                      date_fin: (!p.date_fin || p.date_fin < v) ? v : p.date_fin,
                    }))
                  }}/>
              </div>
              <div style={{ minWidth: 0 }}>
                <label style={s.label}>Date fin *</label>
                <Input type="date" value={form.date_fin} min={form.date_debut || today}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                  onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))}/>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ minWidth: 0 }}><label style={s.label}>Heure début</label><Input type="time" value={form.heure_debut} style={{ width: '100%', boxSizing: 'border-box' }} onChange={e => setForm(p => ({ ...p, heure_debut: e.target.value }))}/></div>
              <div style={{ minWidth: 0 }}><label style={s.label}>Heure fin</label><Input type="time" value={form.heure_fin} style={{ width: '100%', boxSizing: 'border-box' }} onChange={e => setForm(p => ({ ...p, heure_fin: e.target.value }))}/></div>
            </div>
            {form.date_debut && form.date_fin && form.date_debut !== form.date_fin && (
              <p style={{ fontSize: 11, color: T.muted, fontStyle: 'italic', margin: 0 }}>
                Période multi-jours : le deal sera affiché sur ta fiche tous les jours entre {form.date_debut} et {form.date_fin} (pastille DEAL). Le Good Morning Yoppers ne le met en avant que le matin du {form.date_debut}.
              </p>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: form.inclus_morning ? '#FFF7ED' : '#FAFAFA', border: `1.5px solid ${form.inclus_morning ? '#EA580C' : T.hairline}`, borderRadius: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.inclus_morning} onChange={e => setForm(p => ({ ...p, inclus_morning: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sun size={14} strokeWidth={1.8} color="#EA580C"/> Inclure dans le Good Morning Yoppers</span>
            </label>
            {warningSoumission && (
              <div style={{ background: '#FFF7ED', border: '1px solid #FDBA74', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#9A3412', fontWeight: 600, lineHeight: 1.5 }}>
                <AlertTriangle size={14} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Trop tard pour le Good Morning {form.date_debut === today ? 'd\'aujourd\'hui' : `du ${form.date_debut}`} (deadline {heureLimite} la veille). Ton deal reste visible sur ta fiche, avec la pastille DEAL qui clignote. Pour le prochain Morning, date-le à demain et enregistre avant {heureLimite} ce soir.
              </div>
            )}
            {/* CTA Appeler pour réserver : à activer pour les deals qui nécessitent
                contact (réservation, dispo limitée, conditions particulières) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: form.cta_appeler_reserver ? T.pale : '#FAFAFA', border: `1.5px solid ${form.cta_appeler_reserver ? T.bgPanel : T.hairline}`, borderRadius: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.cta_appeler_reserver} onChange={e => setForm(p => ({ ...p, cta_appeler_reserver: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: T.ink, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Phone size={14} strokeWidth={1.8}/> Bouton « Appeler pour réserver »</span>
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>Active un bouton d&rsquo;appel direct dans la modale du deal côté client</span>
              </div>
            </label>

            {/* Bonne affaire : badge qui met le deal en avant sur la fiche et dans les listes.
                Visible à partir du plan Communiquer. */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: form.est_bonne_affaire ? '#FEF3C7' : '#FAFAFA', border: `1.5px solid ${form.est_bonne_affaire ? '#F59E0B' : T.hairline}`, borderRadius: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.est_bonne_affaire} onChange={e => setForm(p => ({ ...p, est_bonne_affaire: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: T.ink, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Star size={14} strokeWidth={1.8} color="#F59E0B"/> Marquer comme « Bonne affaire »</span>
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>Ajoute un badge doré et met le deal en avant côté Yopper.</span>
              </div>
            </label>

            <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Deal actif (visible côté client)"/>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveDeal} disabled={saving}>
              <Icon name="check" size={14}/> {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Liste deals actuels */}
      {dealsActuels.length === 0 && !showForm && (
        <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: T.muted, marginBottom: 16 }}>Aucun deal actif</p>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNew}>
            <Icon name="plus" size={14}/> Créer le premier deal
          </button>
        </div>
      )}
      {dealsActuels.map(d => <DealRow key={d.id} d={d} today={today} onEdit={openEdit} onToggle={toggleActif} onDelete={deleteDeal}/>)}

      {/* Historique */}
      {dealsPasses.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>Historique · {dealsPasses.length} deal{dealsPasses.length > 1 ? 's' : ''} passé{dealsPasses.length > 1 ? 's' : ''}</p>
          {dealsPasses.slice(0, 10).map(d => <DealRow key={d.id} d={d} today={today} onEdit={openEdit} onToggle={toggleActif} onDelete={deleteDeal} passe/>)}
        </div>
      )}
    </div>
  )
}

function DealRow({ d, today, onEdit, onToggle, onDelete, passe = false }) {
  const dateAffichee = d.date_deal
    ? new Date(d.date_deal + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: 'short' })
    : '—'
  const isToday = d.date_deal === today
  return (
    <div style={{ ...s.card, opacity: passe || !d.actif ? 0.55 : 1, borderLeft: `4px solid ${d.inclus_morning ? '#EA580C' : (d.actif ? T.main : '#E5E7EB')}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: T.ink, fontSize: 15 }}>{d.titre}</span>
            {isToday && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 100, background: '#F0FDF4', color: '#10B981' }}>Aujourd&rsquo;hui</span>}
            {d.inclus_morning && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 100, background: '#FFF7ED', color: '#EA580C', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Sun size={11} strokeWidth={2}/> Morning</span>}
            {d.est_bonne_affaire && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 100, background: '#FEF3C7', color: '#7C2D12', display: 'inline-flex', alignItems: 'center', gap: 3 }}><Star size={11} strokeWidth={2.4}/> Bonne affaire</span>}
            <span style={{ ...s.tag, background: d.actif ? T.bgPanel : '#F3F4F6', color: d.actif ? '#fff' : T.muted }}>{d.actif ? 'Actif' : 'Inactif'}</span>
          </div>
          {d.description && <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 6px', lineHeight: 1.4 }}>{d.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            <span style={{ color: T.muted, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={11}/>{dateAffichee}</span>
            {d.prix_deal && (
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontWeight: 900, color: T.bgPanel, fontSize: 16 }}>{Number(d.prix_deal).toFixed(2)}€</span>
                {d.prix_original && <span style={{ textDecoration: 'line-through', color: T.muted, fontSize: 12 }}>{Number(d.prix_original).toFixed(2)}€</span>}
              </span>
            )}
          </div>
          {/* Stats deal : vues + clics CTA. Affichees seulement si au moins un
              event a ete comptabilise, pour ne pas polluer les deals fraichement crees. */}
          {((d.vues ?? 0) > 0 || (d.cta_clics ?? 0) > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${T.hairline}`, fontSize: 11.5, color: T.muted, fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Eye size={12} strokeWidth={2.2}/> {d.vues || 0} vue{(d.vues || 0) > 1 ? 's' : ''}
              </span>
              {(d.cta_clics ?? 0) > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.main }}>
                  <Phone size={12} strokeWidth={2.2}/> {d.cta_clics} clic{d.cta_clics > 1 ? 's' : ''} CTA
                </span>
              )}
              {(d.vues ?? 0) > 0 && (d.cta_clics ?? 0) > 0 && (
                <span style={{ color: T.deep, fontWeight: 800 }}>
                  {Math.round((d.cta_clics / d.vues) * 100)}% conv.
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <Toggle value={d.actif} onChange={() => onToggle(d)}/>
          <button style={{ ...s.btn, ...s.btnGhost, padding: '6px 10px', fontSize: 12 }} onClick={() => onEdit(d)} title="Modifier">
            <Icon name="edit" size={14} color={T.bgPanel}/>
          </button>
          <button style={{ ...s.btn, ...s.btnDanger, padding: '6px 10px', fontSize: 12 }} onClick={() => onDelete(d.id)} title="Supprimer">
            <Icon name="trash" size={14} color="#DC2626"/>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Onglet ACTUS / ALERTES ───────────────────────────────────────────────────
function TabActus({ commercantId, commercant, toast }) {
  const today = new Date().toISOString().slice(0, 10)
  const [actus, setActus] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    titre: '', contenu: '', contenu_long: '', type: 'actu', date_debut: today, date_fin: '', actif: true,
    photo_url: '', inclus_gmy: false,
  })
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  // Propositions IA pour l'accroche : le commerçant choisit puis peut modifier
  const [propsIa, setPropsIa] = useState([])
  const firstLoadRef = useRef(true)
  // Heure limite GMY : règle produit fixe 23h00 (même vérité que TabDeals).
  const heureLimiteGmy = '23h00'

  // Palier Exister limite a 1 apparition GMY par semaine calendaire lundi-dim
  // (decision Alex 01/07 anti-cannibalisation Communiquer). Communiquer + Vendre
  // sont illimites cote UI (rate limit push cote OneSignal si abus futur).
  const planResolu = commercant?.plan === 'on' ? 'exister' : commercant?.plan === 'full' ? 'vendre' : commercant?.plan
  const estExister = planResolu === 'exister'

  // Retourne le lundi 00:00 de la semaine calendaire d'une date (locale Brussels).
  function lundiSemaineFR(d) {
    const dt = new Date(d)
    const jour = dt.getDay()  // 0=dim, 1=lundi...
    const offset = jour === 0 ? -6 : 1 - jour
    dt.setDate(dt.getDate() + offset)
    dt.setHours(0, 0, 0, 0)
    return dt
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchActus() }, [commercantId])

  async function fetchActus() {
    if (firstLoadRef.current) setLoading(true)
    const { data } = await supabase.from('actualites')
      .select('*')
      .eq('commercant_id', commercantId)
      .order('created_at', { ascending: false })
    setActus(data || [])
    if (firstLoadRef.current) { setLoading(false); firstLoadRef.current = false }
  }

  function openNew() {
    setForm({ titre: '', contenu: '', contenu_long: '', type: 'actu', date_debut: today, date_fin: '', actif: true,
      photo_url: '', inclus_gmy: false })
    setPropsIa([])
    setEditId(null); setShowForm(true)
  }
  function openEdit(a) {
    setForm({
      titre: a.titre || '',
      contenu: a.contenu || '',
      contenu_long: a.contenu_long || '',
      type: a.type || 'actu',
      date_debut: a.date_debut || today,
      date_fin: a.date_fin || '',
      actif: a.actif !== false,
      photo_url: a.photo_url || '',
      inclus_gmy: !!a.inclus_gmy,
    })
    setPropsIa([])
    setEditId(a.id); setShowForm(true)
  }

  async function uploadPhotoActu(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo brut)', 'error'); return }
    setUploadingPhoto(true)
    const compressed = await compresserImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85 })
    const fileName = `actu-${commercantId}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (error) { toast('Erreur upload photo', 'error'); setUploadingPhoto(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    setForm(f => ({ ...f, photo_url: urlData.publicUrl }))
    setUploadingPhoto(false)
  }

  async function saveActu() {
    if (!form.titre.trim()) return toast('Titre obligatoire', 'error')

    // Validation Exister : 1 apparition GMY par semaine calendaire (lundi-dim).
    // On check les actus existantes du commercant avec inclus_gmy=true dont
    // la date_debut est dans la meme semaine que la date_debut de la nouvelle.
    if (estExister && form.inclus_gmy) {
      const dateRef = form.date_debut ? new Date(form.date_debut + 'T00:00:00') : new Date()
      const lundi = lundiSemaineFR(dateRef)
      const dimanche = new Date(lundi)
      dimanche.setDate(dimanche.getDate() + 6)
      dimanche.setHours(23, 59, 59, 999)

      const { data: dejaGmy } = await supabase.from('actualites')
        .select('id, titre, date_debut')
        .eq('commercant_id', commercantId)
        .eq('inclus_gmy', true)
        .gte('date_debut', lundi.toISOString().slice(0, 10))
        .lte('date_debut', dimanche.toISOString().slice(0, 10))

      const conflit = (dejaGmy || []).find(a => a.id !== editId)
      if (conflit) {
        toast(`Palier Exister : une seule apparition GMY par semaine (déjà : « ${conflit.titre} »). Passe à Communiquer pour publier plus.`, 'error')
        return
      }
    }

    setSaving(true)
    const payload = {
      commercant_id: commercantId,
      titre: form.titre.trim(),
      contenu: form.contenu.trim() || null,
      contenu_long: form.contenu_long.trim() || null,
      type: form.type,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
      actif: !!form.actif,
      photo_url: form.photo_url || null,
      inclus_gmy: !!form.inclus_gmy,
    }
    const { data, error } = editId
      ? await supabase.from('actualites').update(payload).eq('id', editId).select()
      : await supabase.from('actualites').insert(payload).select()
    setSaving(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast(editId ? 'Actualité mise à jour' : 'Actualité publiée')

    // Push OneSignal aux favoris a la CREATION d'une actu active. Anti-spam :
    // pas d'envoi a l'edition. Alerte = high_priority cote route.
    if (!editId && payload.actif && data?.[0]?.id) {
      fetch('/api/actus/notify-favoris', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actu_id: data[0].id }),
      }).catch(e => console.warn('[actus/notify-favoris] envoi echoue', e?.message))
    }

    setShowForm(false); fetchActus()
  }

  async function deleteActu(id) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer cette actualité ?', message: 'Elle disparaît de ta fiche tout de suite.', action: 'Oui, supprimer l’actualité' }))) return
    const { data, error } = await supabase.from('actualites').delete().eq('id', id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    if (!data || data.length === 0) { toast('Suppression refusée (RLS)', 'error'); return }
    toast('Actualité supprimée'); fetchActus()
  }

  async function toggleActif(a) {
    await supabase.from('actualites').update({ actif: !a.actif }).eq('id', a.id)
    fetchActus()
  }

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      <div style={{ background: T.bgPanel, borderRadius: 14, padding: '18px 20px', marginBottom: 14, color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>Actualités & Alertes</p>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>
            {actus.length} publication{actus.length > 1 ? 's' : ''}
          </h2>
        </div>
        <button style={{ ...s.btn, background: '#fff', color: T.bgPanel }} onClick={openNew}>
          <Icon name="plus" size={14}/> Nouvelle publication
        </button>
      </div>

      <div style={{ background: '#F0F9FF', borderLeft: `4px solid #0284C7`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 12.5, color: '#0C4A6E', lineHeight: 1.5 }}>
        Une <strong>actualité</strong> informe (nouveau produit, événement…). Une <strong>alerte</strong> signale un changement important (fermeture exceptionnelle, rupture). Les alertes s&rsquo;affichent en rouge sur la fiche client, prioritaires sur le menu.
      </div>

      {showForm && (
        <div style={s.cardActive}>
          <h3 style={{ ...s.h3, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name={editId ? 'edit' : 'plus'} size={14} color={T.main}/>
            {editId ? 'Modifier la publication' : 'Nouvelle publication'}
          </h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={s.label}>Type</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { val: 'actu',   label: 'Actualité', desc: 'Info positive' },
                  { val: 'alerte', label: 'Alerte',    desc: 'Important / urgent' },
                ].map(opt => {
                  const sel = form.type === opt.val
                  const colorActif = opt.val === 'alerte' ? '#DC2626' : T.bgPanel
                  return (
                    <button key={opt.val} type="button" onClick={() => setForm(p => ({ ...p, type: opt.val }))}
                      style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${sel ? colorActif : T.hairline}`, background: sel ? colorActif : '#fff', color: sel ? '#fff' : T.ink, cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
                      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>{opt.label}</div>
                      <div style={{ fontSize: 11, opacity: sel ? 0.85 : 0.6 }}>{opt.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>
            <div><label style={s.label}>Titre *</label><Input value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder={form.type === 'alerte' ? 'Ex: Fermé exceptionnellement vendredi' : commercant?.categorie === 'detail' ? 'Ex: La nouvelle collection est arrivée' : commercant?.categorie === 'vitrine' ? 'Ex: Nouveau soin visage dès lundi' : 'Ex: Nouveau menu d&rsquo;hiver dès lundi'}/></div>

            {/* Photo (utilisee comme hero dans la modale enrichie cote client) */}
            <div>
              <label style={s.label}>Photo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {form.photo_url ? (
                  <div style={{ position: 'relative', width: 88, height: 88, borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${T.pale}`, flexShrink: 0 }}>
                    <img decoding="async" loading="lazy" src={form.photo_url} alt="Photo actu" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                    <button type="button" onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                      style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', fontSize: 13, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Retirer la photo">×</button>
                  </div>
                ) : (
                  <div style={{ width: 88, height: 88, borderRadius: 12, background: '#FAFAFA', border: `1.5px dashed ${T.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Camera size={22} strokeWidth={1.8} color={T.muted}/>
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <label style={{ ...s.btn, ...s.btnGhost, cursor: 'pointer', display: 'inline-flex' }}>
                    <Icon name="camera" size={14} color={T.bgPanel}/>
                    {uploadingPhoto ? 'Chargement…' : (form.photo_url ? 'Remplacer' : 'Ajouter une photo')}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhotoActu(e.target.files?.[0])} disabled={uploadingPhoto}/>
                  </label>
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                    Optionnel. Rendra la publication plus visible côté Yopper.
                    <br/>Format idéal : paysage 4:3, minimum 1200×900 px. Les photos carrées ou portrait seront centrées et croppées.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                <label style={{ ...s.label, marginBottom: 0 }}>Accroche courte</label>
                <BoutonIaInline commercantId={commercantId} surface="actu" occasion={form.type === 'alerte' ? 'Infos pratiques' : 'Nouveauté'} brief={form.titre}
                  onVariantes={vs => setPropsIa(vs)}
                  toast={toast} />
              </div>
              <Textarea value={form.contenu} onChange={e => setForm(p => ({ ...p, contenu: e.target.value }))} placeholder="Une phrase visible sur la fiche"/>
              <PropositionsIa propositions={propsIa} avecLong
                onChoisir={v => { setForm(p => ({ ...p, contenu: v.court || p.contenu, contenu_long: v.long || p.contenu_long })); setPropsIa([]) }}
                onFermer={() => setPropsIa([])} />
            </div>

            <div>
              <label style={s.label}>Contenu enrichi</label>
              <Textarea value={form.contenu_long} onChange={e => setForm(p => ({ ...p, contenu_long: e.target.value }))} placeholder="Détails complets affichés dans la fiche de l&rsquo;actualité" style={{ minHeight: 110 }}/>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                Visible dans la fiche complète de l&rsquo;actualité côté Yopper. Idéal pour raconter le contexte.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'end' }}>
              <div style={{ minWidth: 0 }}><label style={s.label}>Date début</label><Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }}/></div>
              <div style={{ minWidth: 0 }}><label style={s.label}>Date fin</label><Input type="date" value={form.date_fin} min={form.date_debut} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box' }}/></div>
            </div>
            <p style={{ fontSize: 10, color: T.muted, margin: '4px 0 0' }}>Date fin vide = pas d&rsquo;échéance (l&rsquo;actu reste affichée jusqu&rsquo;à désactivation).</p>

            {/* Inclure dans Good Morning Yoppers. Exister limite a 1/semaine
                calendaire. Communiquer / Vendre : illimite cote UI. */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: form.inclus_gmy ? '#FFF7ED' : '#FAFAFA', border: `1.5px solid ${form.inclus_gmy ? '#EA580C' : T.hairline}`, borderRadius: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.inclus_gmy} onChange={e => setForm(p => ({ ...p, inclus_gmy: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: T.ink, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sun size={14} strokeWidth={1.8} color="#EA580C"/> Inclure dans Le Good Morning Yoppers</span>
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>
                  {estExister
                    ? `Palier Exister : 1 apparition GMY par semaine calendaire (lundi-dimanche). Enregistre avant ${heureLimiteGmy} la veille : ton actu entre dans le Good Morning du lendemain (édition + push aux Yoppers de ta commune) et y reste pendant sa période.`
                    : `Enregistre avant ${heureLimiteGmy} la veille : ton actu entre dans le Good Morning du lendemain (édition + push aux Yoppers de ta commune) et y reste pendant sa période. Publiée plus tard, elle vit sur ta fiche (pastille ACTU) et entrera dans le Morning suivant.`}
                </span>
              </div>
            </label>

            <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Publication active"/>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveActu} disabled={saving}>
              <Icon name="check" size={14}/> {saving ? 'Enregistrement…' : 'Publier'}
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {actus.length === 0 && !showForm && (
        <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: T.muted, marginBottom: 16 }}>Aucune publication</p>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNew}>
            <Icon name="plus" size={14}/> Créer la première publication
          </button>
        </div>
      )}

      {actus.map(a => (
        <div key={a.id} style={{ ...s.card, opacity: a.actif ? 1 : 0.6, borderLeft: `4px solid ${a.type === 'alerte' ? '#DC2626' : T.main}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: a.type === 'alerte' ? '#FEE2E2' : T.pale, color: a.type === 'alerte' ? '#DC2626' : T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {a.type === 'alerte' ? 'Alerte' : 'Actualité'}
                </span>
                <span style={{ fontWeight: 800, color: T.ink, fontSize: 14 }}>{a.titre}</span>
                <span style={{ ...s.tag, background: a.actif ? T.bgPanel : '#F3F4F6', color: a.actif ? '#fff' : T.muted }}>{a.actif ? 'Actif' : 'Inactif'}</span>
              </div>
              {a.contenu && <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 6px', lineHeight: 1.4 }}>{a.contenu}</p>}
              <p style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
                {a.date_debut ? `Du ${new Date(a.date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' })}` : 'Sans date début'}
                {a.date_fin ? ` au ${new Date(a.date_fin + 'T12:00:00').toLocaleDateString('fr-BE', { day: '2-digit', month: 'short' })}` : ' · permanente'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <Toggle value={a.actif} onChange={() => toggleActif(a)}/>
              <button style={{ ...s.btn, ...s.btnGhost, padding: '6px 10px', fontSize: 12 }} onClick={() => openEdit(a)} title="Modifier">
                <Icon name="edit" size={14} color={T.bgPanel}/>
              </button>
              <button style={{ ...s.btn, ...s.btnDanger, padding: '6px 10px', fontSize: 12 }} onClick={() => deleteActu(a.id)} title="Supprimer">
                <Icon name="trash" size={14} color="#DC2626"/>
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Onglet CRÉNEAUX ──────────────────────────────────────────────────────────
function TabCreneaux({ commercantId, toast }) {
  const JOURS_SEMAINE = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
  const JOURS_LABELS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

  const [creneaux, setCreneaux] = useState([])
  const [horaires, setHoraires] = useState(null)
  const [fermetures, setFermetures] = useState([])
  const [loading, setLoading] = useState(true)
  const [jourActif, setJourActif] = useState('lundi')
  const [showForm, setShowForm] = useState(false)
  const [showFermetureForm, setShowFermetureForm] = useState(false)
  const [form, setForm] = useState({ heure_debut: '', heure_fin: '', max_commandes: 5, delta_minutes: 0, actif: true, capacite_temps: 30, lieu_id: '' })
  const [fermetureForm, setFermetureForm] = useState({ date_debut: '', date_fin: '', motif: '' })
  // Le planning par emplacement, et les emplacements eux-mêmes. Décoché par
  // défaut : l'immense majorité des commerces ne bouge pas.
  const [parLieu, setParLieu] = useState(false)
  const [lieux, setLieux] = useState([])
  const [saving, setSaving] = useState(false)
  const [savingFermeture, setSavingFermeture] = useState(false)
  const [showCopier, setShowCopier] = useState(false)
  const [joursCibles, setJoursCibles] = useState([])

  const [horizon, setHorizon] = useState(1)
  const [savingHorizon, setSavingHorizon] = useState(false)
  const [modeGlobal, setModeGlobal] = useState('commandes')
  const [savingMode, setSavingMode] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchAll() }, [commercantId])

  async function fetchAll() {
    setLoading(true)
    const [{ data: cren }, { data: comm }, { data: ferm }, { data: lieux }] = await Promise.all([
      supabase.from('creneaux').select('*').eq('commercant_id', commercantId).order('heure_debut'),
      supabase.from('commercants').select('horizon_commande, mode_capacite, horaires_detail, planning_par_lieu').eq('id', commercantId).single(),
      supabase.from('fermetures_exceptionnelles').select('*').eq('commercant_id', commercantId).order('date_debut'),
      supabase.from('commercant_lieux').select('id, type, jour_semaine, date_jour, libelle, heure_debut, heure_fin, actif')
        .eq('commercant_id', commercantId).eq('actif', true),
    ])
    setCreneaux(cren || [])
    setHorizon(comm?.horizon_commande || 1)
    setModeGlobal(comm?.mode_capacite || 'commandes')
    setHoraires(comm?.horaires_detail || null)
    setFermetures(ferm || [])
    // ⚠️ Les emplacements ne servent QUE si le commerçant a coché « mes horaires
    // changent selon l'endroit ». Sans ce drapeau, aucun sélecteur n'apparaît et
    // les créneaux ne désignent aucun lieu, exactement comme avant.
    setParLieu(comm?.planning_par_lieu === true)
    setLieux(lieux || [])
    setLoading(false)
  }

  // ─── Helpers horaires ──────────────────────────────────────────────────────
  function jourOuvert(jour) {
    if (!horaires) return true
    return horaires[jour]?.ouvert !== false
  }
  function horaireJour(jour) {
    if (!horaires || !horaires[jour]) return { debut: '07:00', fin: '18:00' }
    return { debut: horaires[jour].debut || '07:00', fin: horaires[jour].fin || '18:00' }
  }
  function creneauxDuJour(jour) {
    // jour_semaine === null = anciens créneaux globaux — affichés uniquement sur lundi par convention
    return creneaux.filter(c => c.jour_semaine === jour || (c.jour_semaine === null && jour === 'lundi'))
  }
  // Les emplacements proposables pour un créneau de ce jour : ceux de la
  // tournée ce jour-là, et les lieux fixes, valables tous les jours.
  function lieuxDuJourEditeur(jour) {
    return lieux.filter(l => l.type === 'permanent'
      || (l.type === 'hebdo' && l.jour_semaine === jour))
  }
  function nomDuLieu(lieuId) {
    if (!lieuId) return null
    return lieux.find(l => l.id === lieuId)?.libelle || null
  }
  function creneauxNull() {
    return creneaux.filter(c => c.jour_semaine === null)
  }
  function creneauxHorsHoraires(jour, cren) {
    if (!horaires || !horaires[jour]?.ouvert) return []
    const h = horaireJour(jour)
    return cren.filter(c => c.heure_debut.slice(0,5) < h.debut || c.heure_fin.slice(0,5) > h.fin)
  }

  async function saveHorizon(val) {
    setSavingHorizon(true)
    await supabase.from('commercants').update({ horizon_commande: val }).eq('id', commercantId)
    setHorizon(val); setSavingHorizon(false)
    toast('Horizon mis à jour')
  }

  async function saveModeGlobal(val) {
    setSavingMode(true)
    await supabase.from('commercants').update({ mode_capacite: val }).eq('id', commercantId)
    setModeGlobal(val); setSavingMode(false)
    toast('Mode mis à jour')
  }

  async function updateCapaciteTemps(id, val) {
    const n = parseFloat(val)
    if (isNaN(n) || n < 1) return
    await supabase.from('creneaux').update({ capacite_temps: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, capacite_temps: n } : c))
  }

  async function updateMax(id, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 1) return
    await supabase.from('creneaux').update({ max_commandes: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, max_commandes: n } : c))
  }

  async function updateDelta(id, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 0) return
    await supabase.from('creneaux').update({ delta_minutes: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, delta_minutes: n } : c))
  }

  // Clôture des commandes, en heures avant le début du créneau.
  //
  // ⚠️ CE RÉGLAGE N'EXISTAIT QUE POUR LA LIVRAISON. Côté Click & Collect, la
  // seule limite était le début du créneau lui-même : on pouvait commander à
  // 6h58 pour le créneau de 7h00, sans laisser au boulanger la moindre chance.
  // Zéro reste le défaut, c'est-à-dire le comportement d'avant : personne ne se
  // voit imposer un délai qu'il n'a pas choisi.
  async function updateCutoff(id, val) {
    const n = parseInt(val, 10)
    if (isNaN(n) || n < 0) return
    await supabase.from('creneaux').update({ cutoff_heures: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, cutoff_heures: n } : c))
  }

  async function toggleCreneau(c) {
    await supabase.from('creneaux').update({ actif: !c.actif }).eq('id', c.id)
    fetchAll()
  }

  // ─── Fix suppression individuelle ─────────────────────────────────────────
  async function deleteCreneau(id) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer ce créneau ?', message: 'Tes clients ne pourront plus le choisir.', action: 'Oui, supprimer ce créneau' }))) return
    const { data: cmdLiees } = await supabase.from('commandes').select('id').eq('creneau_id', id).not('statut', 'in', '(recupere,non_retire)')
    if (cmdLiees?.length > 0) { toast(`Impossible : ${cmdLiees.length} commande(s) active(s) sur ce créneau`, 'error'); return }
    const { error } = await supabase.from('creneaux').delete().eq('id', id)
    if (error) { toast('Erreur suppression : ' + error.message, 'error'); return }
    toast('Créneau supprimé'); fetchAll()
  }

  // ─── Fix toutSupprimer — delete un par un pour éviter bug .in() ───────────
  async function toutSupprimer() {
    const crenJour = creneauxDuJour(jourActif)
    if (!crenJour.length) return
    const nbNull = jourActif === 'lundi' ? creneauxNull().length : 0
    const msg = nbNull > 0
      ? `Supprimer les ${crenJour.length} créneaux du ${jourActif} ? (dont ${nbNull} créneaux legacy sans jour assigné)`
      : `Supprimer les ${crenJour.length} créneaux du ${jourActif} ?`
    if (!await confirme(confirmationSimple({ titre: `Supprimer les créneaux du ${jourActif} ?`, message: msg, action: 'Oui, tous les supprimer' }))) return

    // Vérifier commandes actives
    const avecCmd = []
    const sansCmd = []
    for (const c of crenJour) {
      const { data } = await supabase.from('commandes').select('id').eq('creneau_id', c.id).not('statut', 'in', '(recupere,non_retire)')
      if (data?.length > 0) avecCmd.push(c.id)
      else sansCmd.push(c.id)
    }

    if (avecCmd.length > 0 && sansCmd.length === 0) {
      toast('Impossible : tous ont des commandes actives', 'error'); return
    }
    if (avecCmd.length > 0) {
      if (!await confirme(confirmationSimple({ titre: 'Certains créneaux ont des commandes', message: `${avecCmd.length} créneau${avecCmd.length > 1 ? 'x sont' : ' est'} déjà réservé${avecCmd.length > 1 ? 's' : ''} par des clients : ceux-là seront gardés.`, action: `Supprimer seulement les ${sansCmd.length} créneaux libres` }))) return
    }

    // Supprimer un par un (évite le bug .in())
    let ok = 0
    for (const id of sansCmd) {
      const { error } = await supabase.from('creneaux').delete().eq('id', id)
      if (!error) ok++
    }
    toast(`${ok} créneau(x) supprimé(s)`); fetchAll()
  }

  // ─── Ajouter créneau sur le jour actif ────────────────────────────────────
  async function saveCreneau() {
    if (!form.heure_debut || !form.heure_fin) return toast('Heures obligatoires', 'error')
    if (form.heure_fin <= form.heure_debut) return toast('Heure de fin invalide', 'error')

    // Vérif hors horaires
    if (jourOuvert(jourActif) && horaires?.[jourActif]) {
      const h = horaireJour(jourActif)
      if (form.heure_debut < h.debut || form.heure_fin > h.fin) {
        if (!await confirme(confirmationSimple({ titre: 'Ce créneau sort de tes heures d’ouverture', message: `Tu ouvres de ${h.debut} à ${h.fin} ce jour-là.`, action: 'Le créer quand même', ton: 'principal' }))) return
      }
    }

    // Superposition sur ce jour.
    // ⚠️ DEUX EMPLACEMENTS DIFFÉRENTS PEUVENT PARTAGER UNE HEURE sans se
    // gêner : un food truck qui sert de 11h à 14h sur une place ne peut pas,
    // mais deux salles tenues par des personnes différentes le peuvent. On ne
    // compare donc que les créneaux du MÊME emplacement.
    const existants = creneauxDuJour(jourActif)
      .filter(e => !parLieu || (e.lieu_id || null) === (form.lieu_id || null))
    for (const e of existants) {
      if (form.heure_debut < e.heure_fin.slice(0,5) && form.heure_fin > e.heure_debut.slice(0,5)) {
        toast('Ce créneau chevauche un créneau existant', 'error'); return
      }
    }

    setSaving(true)
    const { error } = await supabase.from('creneaux').insert({
      commercant_id: commercantId,
      jour_semaine: jourActif,
      heure_debut: form.heure_debut,
      heure_fin: form.heure_fin,
      max_commandes: parseInt(form.max_commandes) || 5,
      delta_minutes: parseInt(form.delta_minutes) || 0,
      actif: form.actif,
      capacite_temps: parseFloat(form.capacite_temps) || 30,
      // ⚠️ VIDE NE VEUT PAS DIRE « NULLE PART », il veut dire « là où se passe
      // l'activité ». C'est ce qui protège tous les commerces qui n'ont pas
      // activé le planning par emplacement, c'est-à-dire presque tous.
      lieu_id: parLieu ? (form.lieu_id || null) : null,
    })
    if (error) { toast('Erreur : ' + error.message, 'error'); setSaving(false); return }
    toast('Créneau ajouté'); setSaving(false); setShowForm(false)
    setForm({ heure_debut: '', heure_fin: '', max_commandes: 5, delta_minutes: 0, actif: true, capacite_temps: 30, lieu_id: '' })
    fetchAll()
  }

  // ─── Générer auto sur le jour actif ───────────────────────────────────────
  async function genererJour() {
    if (!jourOuvert(jourActif)) return toast(`${jourActif} est fermé, modifie les horaires dans Profil`, 'error')
    const h = horaireJour(jourActif)
    const debut = prompt(`Heure d'ouverture (défaut: ${h.debut}) :`) || h.debut
    const fin   = prompt(`Heure de fermeture (défaut: ${h.fin}) :`) || h.fin
    const duree = parseInt(prompt('Durée en minutes (ex: 15) :') || '15')
    const max   = parseInt(prompt('Commandes max par créneau (ex: 5) :') || '5')
    const cap   = parseFloat(prompt(`Capacité temps (min) par créneau (ex: ${duree}) :`) || String(duree))
    if (!debut || !fin || !duree) return

    // Vérif hors horaires
    if (debut < h.debut || fin > h.fin) {
      toast(`Hors horaires d'ouverture (${h.debut}–${h.fin}), génération annulée`, 'error'); return
    }

    const slots = []
    let current = debut
    while (current < fin) {
      const [hh, mm] = current.split(':').map(Number)
      const totalMin = hh * 60 + mm + duree
      const next = `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`
      if (next > fin) break
      slots.push({ commercant_id: commercantId, jour_semaine: jourActif, heure_debut: current, heure_fin: next, max_commandes: max, actif: true, capacite_temps: cap })
      current = next
    }
    if (!slots.length) return toast('Aucun créneau généré', 'error')

    const existants = creneauxDuJour(jourActif)
    if (existants.length > 0) {
      if (!await confirme(confirmationSimple({ titre: `Des créneaux existent déjà le ${jourActif}`, message: `Il y en a ${existants.length}. Les nouveaux prendront leur place.`, action: 'Oui, remplacer les créneaux existants' }))) return
      for (const c of existants) await supabase.from('creneaux').delete().eq('id', c.id)
    }

    await supabase.from('creneaux').insert(slots)
    toast(`${slots.length} créneaux générés pour ${jourActif}`); fetchAll()
  }

  // ─── Copier vers d'autres jours ───────────────────────────────────────────
  async function copierVers() {
    const source = creneauxDuJour(jourActif)
    if (!source.length) return toast('Aucun créneau à copier', 'error')
    if (!joursCibles.length) return toast('Sélectionne au moins un jour cible', 'error')

    let total = 0
    for (const cible of joursCibles) {
      if (!jourOuvert(cible)) { toast(`${cible} est fermé, ignoré`, 'error'); continue }
      // Supprimer existants sur la cible
      const existants = creneaux.filter(c => c.jour_semaine === cible)
      for (const c of existants) await supabase.from('creneaux').delete().eq('id', c.id)
      // Insérer copies
      const copies = source.map(c => ({
        commercant_id: commercantId,
        jour_semaine: cible,
        heure_debut: c.heure_debut,
        heure_fin: c.heure_fin,
        max_commandes: c.max_commandes,
        delta_minutes: c.delta_minutes || 0,
        actif: c.actif,
        capacite_temps: c.capacite_temps || 30
      }))
      await supabase.from('creneaux').insert(copies)
      total += copies.length
    }
    toast(`${total} créneau(x) copiés`); setShowCopier(false); setJoursCibles([]); fetchAll()
  }

  // ─── Fermetures exceptionnelles ───────────────────────────────────────────
  async function saveFermeture() {
    if (!fermetureForm.date_debut || !fermetureForm.date_fin) return toast('Dates obligatoires', 'error')
    if (fermetureForm.date_fin < fermetureForm.date_debut) return toast('Date de fin invalide', 'error')
    setSavingFermeture(true)
    const { error } = await supabase.from('fermetures_exceptionnelles').insert({
      commercant_id: commercantId,
      date_debut: fermetureForm.date_debut,
      date_fin: fermetureForm.date_fin,
      motif: fermetureForm.motif.trim() || null
    })
    if (error) { toast('Erreur : ' + error.message, 'error'); setSavingFermeture(false); return }
    toast('Fermeture ajoutée'); setSavingFermeture(false); setShowFermetureForm(false)
    setFermetureForm({ date_debut: '', date_fin: '', motif: '' }); fetchAll()
  }

  async function deleteFermeture(id) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer cette fermeture ?', message: 'Ce jour redeviendra ouvert à la réservation.', action: 'Oui, supprimer la fermeture' }))) return
    await supabase.from('fermetures_exceptionnelles').delete().eq('id', id)
    toast('Fermeture supprimée'); fetchAll()
  }

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  const HORIZONS = [
    // ⚠️ « 1 jour » se choisit maintenant EN CONNAISSANCE DE CAUSE. C'était le
    // réglage par défaut, et il rendait le commerce injoignable dès son dernier
    // créneau passé : plus rien à vendre jusqu'au lendemain matin. Le libellé
    // le dit désormais franchement.
    { val: 1, label: '1 jour',  desc: "Aujourd'hui seulement · rien pour demain" },
    { val: 2, label: '2 jours', desc: "Aujourd'hui + demain (conseillé)" },
    { val: 3, label: '3 jours', desc: "Les 3 prochains jours" },
    { val: 4, label: '4 jours', desc: "Les 4 prochains jours" },
    { val: 5, label: '5 jours', desc: "Les 5 prochains jours" },
    { val: 6, label: '6 jours', desc: "Les 6 prochains jours" },
    { val: 7, label: '7 jours', desc: "Une semaine à l'avance" },
  ]

  const crensJourActif = creneauxDuJour(jourActif)
  const horsHoraires = creneauxHorsHoraires(jourActif, crensJourActif)

  return (
    <div>
      {/* ─── Horizon ─── */}
      <div style={{ ...s.card, marginBottom: 16, background: T.pale, border: `1.5px solid ${T.main}22`, boxShadow: 'none' }}>
        <h3 style={{ fontWeight: 800, fontSize: 14, color: T.deep, marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Calendar size={15} strokeWidth={1.8}/> Horizon de réservation</h3>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>Jusqu'à combien de jours à l'avance tes clients peuvent réserver ?</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {HORIZONS.map(h => (
            <button key={h.val} onClick={() => saveHorizon(h.val)} disabled={savingHorizon}
              style={{ padding: '10px 12px', borderRadius: 10, border: `2px solid ${horizon === h.val ? T.main : T.pale}`, background: horizon === h.val ? T.main : '#fff', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', fontFamily: '"DM Sans", sans-serif' }}>
              <p style={{ fontWeight: 800, fontSize: 13, color: horizon === h.val ? '#fff' : T.ink, marginBottom: 2 }}>{h.label}</p>
              <p style={{ fontSize: 11, color: horizon === h.val ? 'rgba(255,255,255,0.8)' : T.muted }}>{h.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Mode capacité ─── */}
      <div style={{ ...s.card, marginBottom: 16 }}>
        <h3 style={{ fontWeight: 800, fontSize: 14, color: T.deep, marginBottom: 4, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Settings size={15} strokeWidth={1.8}/> Mode de capacité</h3>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>Comment la capacité de tes créneaux est calculée.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { val: 'commandes', label: 'Commandes max', desc: 'Nombre de commandes par créneau' },
            { val: 'temps', label: 'Temps de préparation', desc: 'Capacité en minutes · 1 unité = 1 min' },
          ].map(m => (
            <button key={m.val} onClick={() => saveModeGlobal(m.val)} disabled={savingMode}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid ' + (modeGlobal === m.val ? T.main : T.pale), background: modeGlobal === m.val ? T.main : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
              <p style={{ fontWeight: 800, fontSize: 12, color: modeGlobal === m.val ? '#fff' : T.ink, marginBottom: 2 }}>{m.label}</p>
              <p style={{ fontSize: 10, color: modeGlobal === m.val ? 'rgba(255,255,255,0.8)' : T.muted }}>{m.desc}</p>
            </button>
          ))}
        </div>
        {modeGlobal === 'temps' && (
          <p style={{ fontSize: 11, color: T.main, marginTop: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'flex-start', gap: 5 }}><Lightbulb size={13} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }}/> Capacité = durée créneau × nombre de cuisiniers (exemple : 15 min × 2 = 30 min)</p>
        )}
      </div>

      {/* ─── Onglets jours ─── */}
      <BandeDefilante libelle="les jours" style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {JOURS_SEMAINE.map((jour, idx) => {
          const ouvert = jourOuvert(jour)
          const nbCren = creneauxDuJour(jour).length
          const actif = jourActif === jour
          return (
            <button key={jour} onClick={() => { if (!ouvert) { toast(`${jour} est fermé, modifie les horaires dans Profil`, 'error'); return }; setJourActif(jour); setShowForm(false); setShowCopier(false) }}
              style={{ flexShrink: 0, padding: '8px 10px', borderRadius: 10, border: `2px solid ${actif ? T.main : ouvert ? T.pale : '#E5E7EB'}`, background: actif ? T.main : ouvert ? '#fff' : '#F9FAFB', cursor: ouvert ? 'pointer' : 'not-allowed', textAlign: 'center', fontFamily: '"DM Sans", sans-serif', opacity: ouvert ? 1 : 0.5, transition: 'all 0.15s', minWidth: 52 }}>
              <p style={{ fontWeight: 800, fontSize: 12, color: actif ? '#fff' : ouvert ? T.ink : T.muted }}>{JOURS_LABELS[idx]}</p>
              {ouvert
                ? <p style={{ fontSize: 10, color: actif ? 'rgba(255,255,255,0.8)' : T.muted, marginTop: 2 }}>{nbCren > 0 ? `${nbCren} crén.` : '–'}</p>
                : <p style={{ fontSize: 9, color: '#DC2626', marginTop: 2, fontWeight: 700 }}>Fermé</p>
              }
            </button>
          )
        })}
      </BandeDefilante>

      {/* ─── Contenu du jour actif ─── */}
      {!jourOuvert(jourActif) ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 32, background: '#FEF2F2', border: '1.5px solid #DC262622' }}>
          <Lock size={22} strokeWidth={1.8} color={T.muted} style={{ marginBottom: 8 }}/>
          <p style={{ fontWeight: 700, color: '#DC2626' }}>{jourActif} · Commerce fermé</p>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Modifie les horaires dans l'onglet Profil pour ouvrir ce jour.</p>
        </div>
      ) : (
        <>
          {/* Header jour */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h2 style={{ ...s.h2, margin: 0, textTransform: 'capitalize' }}>{jourActif}</h2>
              {horaires?.[jourActif] && (
                <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                  <Clock size={12} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> {horaireJour(jourActif).debut} – {horaireJour(jourActif).fin}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {crensJourActif.length > 0 && (
                <>
                  <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => { setShowCopier(v => !v); setShowForm(false) }}><Copy size={13} strokeWidth={1.8}/> Copier vers…</button>
                  <button style={{ ...s.btn, ...s.btnDanger, fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={toutSupprimer}><Trash2 size={13} strokeWidth={1.8}/> Vider</button>
                </>
              )}
              <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '6px 12px', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={genererJour}><Zap size={13} strokeWidth={1.8}/> Générer</button>
              <button style={{ ...s.btn, ...s.btnPrimary, fontSize: 12, padding: '6px 12px' }} onClick={() => { setShowForm(v => !v); setShowCopier(false) }}>+ Ajouter</button>
            </div>
          </div>

          {/* Alerte hors horaires */}
          {horsHoraires.length > 0 && (
            <div style={{ background: '#FEF3C7', border: '1.5px solid #F59E0B44', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>
                <AlertTriangle size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> {horsHoraires.length} créneau(x) hors des horaires d'ouverture ({horaireJour(jourActif).debut}–{horaireJour(jourActif).fin})
              </p>
            </div>
          )}

          {/* Panel copier vers */}
          {showCopier && (
            <div style={{ ...s.cardActive, marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Copy size={14} strokeWidth={1.8}/> Copier les créneaux de {jourActif} vers :</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {JOURS_SEMAINE.filter(j => j !== jourActif).map(jour => {
                  const ouvert = jourOuvert(jour)
                  const selec = joursCibles.includes(jour)
                  return (
                    <button key={jour} onClick={() => ouvert && setJoursCibles(prev => selec ? prev.filter(j => j !== jour) : [...prev, jour])}
                      style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: selec ? T.main : ouvert ? T.pale : '#F3F4F6', color: selec ? '#fff' : ouvert ? T.main : T.muted, opacity: ouvert ? 1 : 0.5, cursor: ouvert ? 'pointer' : 'not-allowed', textTransform: 'capitalize' }}>
                      {jour}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={copierVers} disabled={!joursCibles.length}>Copier</button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setShowCopier(false); setJoursCibles([]) }}>Annuler</button>
              </div>
            </div>
          )}

          {/* Formulaire ajout créneau */}
          {showForm && (
            <div style={{ ...s.cardActive, marginBottom: 12 }}>
              <h3 style={{ ...s.h3, marginBottom: 14 }}>+ Nouveau créneau · {jourActif}</h3>
              {/* ⚠️ N'APPARAÎT QUE SI « mes horaires changent selon l'endroit »
                  est coché dans Mes lieux. Demander l'emplacement à une
                  boulangerie serait une question absurde. */}
              {parLieu && (
                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>Emplacement</label>
                  <select value={form.lieu_id}
                    onChange={e => setForm(p => ({ ...p, lieu_id: e.target.value }))}
                    style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: `1.5px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif', background: '#fff', color: T.deep, boxSizing: 'border-box' }}>
                    <option value="">Partout où je suis ce jour-là</option>
                    {lieuxDuJourEditeur(jourActif).map(l => (
                      <option key={l.id} value={l.id}>
                        {l.libelle}{l.heure_debut ? ` · ${String(l.heure_debut).slice(0, 5)}–${String(l.heure_fin || '').slice(0, 5)}` : ''}
                      </option>
                    ))}
                  </select>
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>
                    Laisse « partout » si ce créneau vaut quel que soit l’endroit.
                  </p>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div><label style={s.label}>Début *</label><Input type="time" value={form.heure_debut} onChange={e => setForm(p => ({ ...p, heure_debut: e.target.value }))} /></div>
                <div><label style={s.label}>Fin *</label><Input type="time" value={form.heure_fin} onChange={e => setForm(p => ({ ...p, heure_fin: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={s.label}>Commandes max</label>
                  <Input type="number" min="1" max="50" value={form.max_commandes} onChange={e => setForm(p => ({ ...p, max_commandes: e.target.value }))} />
                </div>
                <div>
                  <label style={s.label}>Délai min (minutes)</label>
                  <Input type="number" min="0" max="120" value={form.delta_minutes} onChange={e => setForm(p => ({ ...p, delta_minutes: e.target.value }))} />
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Délai entre commande et retrait</p>
                </div>
              </div>
              {modeGlobal === 'temps' && (
                <div style={{ marginBottom: 12 }}>
                  <label style={s.label}>Capacité de préparation (min)</label>
                  <Input type="number" min="1" step="0.5" value={form.capacite_temps} onChange={e => setForm(p => ({ ...p, capacite_temps: e.target.value }))} />
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Durée × nb de cuisiniers. Ex : 15 min × 2 = 30 min</p>
                </div>
              )}
              <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Créneau actif" />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveCreneau} disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
              </div>
            </div>
          )}

          {/* Liste créneaux du jour */}
          {crensJourActif.length === 0 && !showForm ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 32 }}>
              <p style={{ color: T.muted, marginBottom: 8 }}>Aucun créneau pour {jourActif}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button style={{ ...s.btn, ...s.btnGhost, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={genererJour}><Zap size={14} strokeWidth={1.8}/> Générer auto</button>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowForm(true)}>+ Ajouter manuellement</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10, marginBottom: 16 }}>
              {crensJourActif.sort((a,b) => a.heure_debut.localeCompare(b.heure_debut)).map(c => {
                const horsH = horaires?.[jourActif]?.ouvert && (c.heure_debut.slice(0,5) < horaireJour(jourActif).debut || c.heure_fin.slice(0,5) > horaireJour(jourActif).fin)
                return (
                  <div key={c.id} style={{ ...s.card, marginBottom: 0, opacity: c.actif ? 1 : 0.55, borderLeft: `4px solid ${horsH ? '#F59E0B' : c.actif ? T.main : '#E5E7EB'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, letterSpacing: '-0.5px' }}>{c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}</div>
                        {/* L'emplacement de ce créneau, quand le commerçant en
                            tient plusieurs. Un créneau sans emplacement vaut
                            partout où il se trouve ce jour-là. */}
                        {parLieu && (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: c.lieu_id ? T.main : T.muted, marginTop: 2 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                            </svg>
                            {nomDuLieu(c.lieu_id) || 'Partout ce jour-là'}
                          </div>
                        )}
                        {horsH && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '1px 6px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={11} strokeWidth={2}/> Hors horaires</span>}
                        {modeGlobal === 'commandes' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
                            <span style={{ fontSize: 11, color: T.muted }}>Max :</span>
                            <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateMax(c.id, c.max_commandes - 1)}>−</button>
                            <input type="number" value={c.max_commandes} min={1} onChange={e => updateMax(c.id, e.target.value)}
                              style={{ ...s.input, width: 44, textAlign: 'center', padding: '2px 4px', fontSize: 13, fontWeight: 700 }} />
                            <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateMax(c.id, c.max_commandes + 1)}>+</button>
                          </div>
                        )}
                        {modeGlobal === 'temps' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8 }}>
                            <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>Cap :</span>
                            <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateCapaciteTemps(c.id, Math.max(1, (c.capacite_temps || 30) - 5))}>−</button>
                            <input type="number" value={c.capacite_temps || 30} min={1} onChange={e => updateCapaciteTemps(c.id, e.target.value)}
                              style={{ ...s.input, width: 44, textAlign: 'center', padding: '2px 4px', fontSize: 13, fontWeight: 700 }} />
                            <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateCapaciteTemps(c.id, (c.capacite_temps || 30) + 5)}>+</button>
                            <span style={{ fontSize: 10, color: T.muted }}>min</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: T.muted }}>Délai :</span>
                          <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateDelta(c.id, Math.max(0, (c.delta_minutes || 0) - 5))}>−</button>
                          <input type="number" value={c.delta_minutes || 0} min={0} onChange={e => updateDelta(c.id, e.target.value)}
                            style={{ ...s.input, width: 44, textAlign: 'center', padding: '2px 4px', fontSize: 13, fontWeight: 700 }} />
                          <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateDelta(c.id, (c.delta_minutes || 0) + 5)}>+</button>
                          <span style={{ fontSize: 10, color: T.muted }}>min</span>
                        </div>
                        {/* Clôture des commandes. Zéro = ouvert jusqu'au début
                            du créneau, exactement comme avant ce réglage. */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: T.muted }}>Clôture :</span>
                          <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateCutoff(c.id, Math.max(0, (c.cutoff_heures || 0) - 1))}>−</button>
                          <input type="number" value={c.cutoff_heures || 0} min={0} onChange={e => updateCutoff(c.id, e.target.value)}
                            style={{ ...s.input, width: 44, textAlign: 'center', padding: '2px 4px', fontSize: 13, fontWeight: 700 }} />
                          <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 6px', fontSize: 12 }} onClick={() => updateCutoff(c.id, (c.cutoff_heures || 0) + 1)}>+</button>
                          <span style={{ fontSize: 10, color: T.muted }}>h avant</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                        <Toggle value={c.actif} onChange={() => toggleCreneau(c)} />
                        <button style={{ ...s.btn, ...s.btnDanger, padding: '3px 8px', fontSize: 11, marginTop: 4, display: 'inline-flex', alignItems: 'center' }} onClick={() => deleteCreneau(c.id)} aria-label="Supprimer"><Trash2 size={12} strokeWidth={1.8}/></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Fermetures exceptionnelles ─── */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ ...s.h2, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Lock size={16} strokeWidth={1.8}/> Fermetures exceptionnelles</h2>
          <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '6px 12px' }} onClick={() => setShowFermetureForm(v => !v)}>+ Ajouter</button>
        </div>

        {showFermetureForm && (
          <div style={{ ...s.cardActive, marginBottom: 12 }}>
            <h3 style={{ ...s.h3, marginBottom: 14 }}>Nouvelle fermeture</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div style={{ minWidth: 0 }}><label style={s.label}>Date début *</label><Input type="date" value={fermetureForm.date_debut} style={{ width: '100%', boxSizing: 'border-box' }} onChange={e => setFermetureForm(p => ({ ...p, date_debut: e.target.value }))} /></div>
              <div style={{ minWidth: 0 }}><label style={s.label}>Date fin *</label><Input type="date" value={fermetureForm.date_fin} style={{ width: '100%', boxSizing: 'border-box' }} onChange={e => setFermetureForm(p => ({ ...p, date_fin: e.target.value }))} /></div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={s.label}>Motif (optionnel)</label>
              <Input value={fermetureForm.motif} onChange={e => setFermetureForm(p => ({ ...p, motif: e.target.value }))} placeholder="Ex: Congés annuels, Jour férié, Formation..." />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveFermeture} disabled={savingFermeture}>{savingFermeture ? 'Enregistrement...' : 'Enregistrer'}</button>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowFermetureForm(false)}>Annuler</button>
            </div>
          </div>
        )}

        {fermetures.length === 0 ? (
          <div style={{ ...s.card, textAlign: 'center', padding: 24 }}>
            <p style={{ color: T.muted, fontSize: 13 }}>Aucune fermeture exceptionnelle planifiée</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {fermetures.map(f => {
              const debut = new Date(f.date_debut).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
              const fin   = new Date(f.date_fin).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })
              const memeJour = f.date_debut === f.date_fin
              return (
                <div key={f.id} style={{ ...s.card, marginBottom: 0, borderLeft: '4px solid #DC2626', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <div>
                    <p style={{ fontWeight: 700, color: T.ink, fontSize: 14 }}>
                      {memeJour ? debut : `${debut} → ${fin}`}
                    </p>
                    {f.motif && <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{f.motif}</p>}
                  </div>
                  <button style={{ ...s.btn, ...s.btnDanger, padding: '4px 10px', fontSize: 12, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }} onClick={() => deleteFermeture(f.id)} aria-label="Supprimer"><Trash2 size={13} strokeWidth={1.8}/></button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}


// ─── Onglet PROFIL ────────────────────────────────────────────────────────────
// ─── Onglet LIVRAISON ─────────────────────────────────────────────────────────
// Config zone (codes postaux) + frais (fixe + gratuit dès X€). Créneaux livraison
// gérés dans un second temps (calqués sur TabCreneaux via livraison_creneaux).
function TabLivraison({ commercantId, toast, surModifications }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [codesPostaux, setCodesPostaux] = useState([])
  const [inputCP, setInputCP] = useState('')
  const [fraisFixe, setFraisFixe] = useState('')
  const [gratuitDes, setGratuitDes] = useState('')
  const [minimumCommande, setMinimumCommande] = useState('')
  // Cet écran n'a pas d'objet `form` unique, ses valeurs vivent dans quatre
  // états séparés. On en fabrique donc l'image pour la comparaison, et
  // seulement pour elle.
  const [initial, setInitial] = useState(null)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('livraison_config').select('*').eq('commercant_id', commercantId).maybeSingle()
      const valeurs = {
        codesPostaux: data?.codes_postaux || [],
        fraisFixe: data?.frais_fixe != null ? String(data.frais_fixe) : '',
        gratuitDes: data?.gratuit_des != null ? String(data.gratuit_des) : '',
        minimumCommande: data?.minimum_commande != null ? String(data.minimum_commande) : '',
      }
      setCodesPostaux(valeurs.codesPostaux)
      setFraisFixe(valeurs.fraisFixe)
      setGratuitDes(valeurs.gratuitDes)
      setMinimumCommande(valeurs.minimumCommande)
      setInitial(valeurs)
      setLoading(false)
    })()
  }, [commercantId])

  function ajouterCP() {
    const cp = inputCP.trim()
    if (!/^\d{4}$/.test(cp)) { toast('Code postal invalide (4 chiffres)', 'error'); return }
    if (codesPostaux.includes(cp)) { toast('Code postal déjà ajouté', 'info'); return }
    setCodesPostaux(prev => [...prev, cp].sort())
    setInputCP('')
  }

  function retirerCP(cp) { setCodesPostaux(prev => prev.filter(x => x !== cp)) }

  // ⚠️ Rend true ou false depuis le 15/08 : la fenêtre de sortie doit savoir si
  // l'écriture a réussi avant de démonter l'écran. Le bouton du bas ignore ce
  // retour et se comporte comme avant.
  async function sauvegarder() {
    if (codesPostaux.length === 0) { toast('Ajoute au moins un code postal de livraison', 'error'); return false }
    const frais = parseFloat((fraisFixe || '0').replace(',', '.'))
    if (isNaN(frais) || frais < 0) { toast('Frais de livraison invalide', 'error'); return false }
    let gratuit = null
    if (gratuitDes.trim()) {
      gratuit = parseFloat(gratuitDes.replace(',', '.'))
      if (isNaN(gratuit) || gratuit < 0) { toast('Seuil de gratuité invalide', 'error'); return false }
    }
    // Minimum de commande : vide ou 0 = aucun minimum, c'est le comportement
    // d'avant. Un commerçant déjà configuré ne voit donc rien changer.
    let mini = null
    if (minimumCommande.trim()) {
      mini = parseFloat(minimumCommande.replace(',', '.'))
      if (isNaN(mini) || mini < 0) { toast('Minimum de commande invalide', 'error'); return false }
    }
    setSaving(true)
    const { error } = await supabase.from('livraison_config').upsert({
      commercant_id: commercantId,
      codes_postaux: codesPostaux,
      frais_fixe: frais,
      gratuit_des: gratuit,
      minimum_commande: mini,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'commercant_id' })
    setSaving(false)
    if (error) { toast('Erreur : ' + error.message, 'error'); return false }
    setInitial({ codesPostaux, fraisFixe, gratuitDes, minimumCommande })
    toast('Livraison enregistrée', 'success')
    return true
  }

  // ─── Le garde-fou des modifications non enregistrées ─────────────────────
  const courantLivraison = { codesPostaux, fraisFixe, gratuitDes, minimumCommande }
  const nbModifsLivraison = champsModifies(initial, courantLivraison).length
  useAvertirAvantDeQuitter(nbModifsLivraison > 0)
  const actionsLivraison = useRef({})
  actionsLivraison.current = {
    enregistrer: sauvegarder,
    ignorer: () => {
      setCodesPostaux(initial.codesPostaux)
      setFraisFixe(initial.fraisFixe)
      setGratuitDes(initial.gratuitDes)
      setMinimumCommande(initial.minimumCommande)
      toast('Modifications abandonnées')
    },
  }
  useEffect(() => {
    surModifications?.({ modifie: nbModifsLivraison > 0, nb: nbModifsLivraison, saving, actions: actionsLivraison })
    return () => surModifications?.(null)
  }, [surModifications, nbModifsLivraison, saving])

  if (loading) return <div style={{ padding: 20, color: T.muted, fontWeight: 600 }}>Chargement…</div>

  const card = { background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16, marginBottom: 16 }
  const inputStyle = { padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif' }}>
      {/* Zone de livraison */}
      <div style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.ink }}>Zone de livraison</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.muted }}>Les codes postaux que tu livres. Un Yopper hors zone ne verra pas l&rsquo;option livraison.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={inputCP}
            onChange={e => setInputCP(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => { if (e.key === 'Enter') ajouterCP() }}
            placeholder="Ex : 5640"
            inputMode="numeric"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button onClick={ajouterCP} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Ajouter
          </button>
        </div>
        {codesPostaux.length === 0
          ? <p style={{ fontSize: 12.5, color: T.muted, fontStyle: 'italic', margin: 0 }}>Aucun code postal pour l&rsquo;instant.</p>
          : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {codesPostaux.map(cp => (
                <span key={cp} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 100, background: T.pale, color: T.ink, fontWeight: 700, fontSize: 13 }}>
                  {cp}
                  <button onClick={() => retirerCP(cp)} aria-label={`Retirer ${cp}`} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', padding: 0, color: T.main }}>
                    <Icon name="x" size={13} color={T.main} />
                  </button>
                </span>
              ))}
            </div>
        }
      </div>

      {/* Frais de livraison */}
      <div style={card}>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.ink }}>Frais de livraison</h3>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.muted }}>Un montant fixe, offert au-dessus d&rsquo;un seuil de panier (optionnel).</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <label style={{ flex: 1, minWidth: 140 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Frais fixe (€)</span>
            <input value={fraisFixe} onChange={e => setFraisFixe(e.target.value)} placeholder="Ex : 3" inputMode="decimal" style={inputStyle} />
          </label>
          <label style={{ flex: 1, minWidth: 140 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Gratuit dès (€), optionnel</span>
            <input value={gratuitDes} onChange={e => setGratuitDes(e.target.value)} placeholder="Ex : 25" inputMode="decimal" style={inputStyle} />
          </label>
          {/* Minimum de commande (09/08) : prendre sa voiture pour trois euros
              de marchandise fait perdre de l'argent, essence et temps compris.
              Vide = aucun minimum, donc rien ne change pour qui est déjà réglé. */}
          <label style={{ flex: 1, minWidth: 140 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Minimum de commande (€), optionnel</span>
            <input value={minimumCommande} onChange={e => setMinimumCommande(e.target.value)} placeholder="Ex : 15" inputMode="decimal" style={inputStyle} />
          </label>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: T.muted }}>
          Aperçu Yopper : {(() => {
            const f = parseFloat((fraisFixe || '0').replace(',', '.')) || 0
            const g = gratuitDes.trim() ? parseFloat(gratuitDes.replace(',', '.')) : null
            const m = minimumCommande.trim() ? parseFloat(minimumCommande.replace(',', '.')) : null
            const base = f === 0
              ? 'Livraison gratuite'
              : `Livraison ${f.toFixed(2)}€${g ? `, offerte dès ${g.toFixed(2)}€` : ''}`
            return m > 0 ? `${base} · à partir de ${m.toFixed(2)}€ de commande` : base
          })()}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
          Le minimum se compte sur les articles, sans les frais de livraison ni un éventuel bon cadeau :
          tu roules toujours pour au moins ce montant de marchandise.
        </p>
      </div>

      <button onClick={sauvegarder} disabled={saving} style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: saving ? T.muted : T.main, color: '#fff', fontWeight: 800, fontSize: 15, cursor: saving ? 'default' : 'pointer' }}>
        {saving ? 'Enregistrement…' : 'Enregistrer la livraison'}
      </button>

      <div style={{ marginTop: 22 }}>
        <SectionCreneauxLivraison commercantId={commercantId} toast={toast} />
      </div>
    </div>
  )
}

// Jours pour les créneaux de livraison (mêmes clés que horaires_detail / creneaux C&C).
const JOURS_LIV = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
const JOURS_LIV_LABELS = { lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi', vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche' }

// Gestion des créneaux de livraison (tournées). Calqué sur le principe du C&C :
// capacité = nb de commandes par tournée (max_commandes). Table livraison_creneaux.
function SectionCreneauxLivraison({ commercantId, toast }) {
  const [creneaux, setCreneaux] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ jour_semaine: 'mardi', heure_debut: '18:00', heure_fin: '19:00', max_commandes: 10, cutoff_heures: 2 })

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { charger() }, [commercantId])

  async function charger() {
    const { data } = await supabase.from('livraison_creneaux').select('*').eq('commercant_id', commercantId)
    setCreneaux(data || [])
    setLoading(false)
  }

  async function ajouter() {
    if (!form.heure_debut || !form.heure_fin) { toast('Renseigne les heures de la tournée', 'error'); return }
    if (form.heure_fin <= form.heure_debut) { toast('L’heure de fin doit être après le début', 'error'); return }
    // Anti-doublon / anti-chevauchement sur le même jour (même garde que les
    // créneaux C&C) : deux tournées identiques ou qui se recouvrent = refus
    for (const c of creneaux.filter(c => c.jour_semaine === form.jour_semaine)) {
      const debut = (c.heure_debut || '').slice(0, 5)
      const fin = (c.heure_fin || '').slice(0, 5)
      if (form.heure_debut < fin && form.heure_fin > debut) {
        toast(`Cette tournée chevauche la tournée ${debut}–${fin} déjà créée ce jour-là`, 'error')
        return
      }
    }
    const { error } = await supabase.from('livraison_creneaux').insert({
      commercant_id: commercantId,
      jour_semaine: form.jour_semaine,
      heure_debut: form.heure_debut,
      heure_fin: form.heure_fin,
      max_commandes: Math.max(1, Number(form.max_commandes) || 1),
      cutoff_heures: Math.max(0, Number(form.cutoff_heures) || 0),
      mode_capacite: 'commandes',
    })
    if (error) { toast('Erreur : ' + error.message, 'error'); return }
    toast('Tournée ajoutée')
    charger()
  }

  async function supprimer(id) {
    await supabase.from('livraison_creneaux').delete().eq('id', id)
    setCreneaux(prev => prev.filter(c => c.id !== id))
  }

  async function toggleActif(c) {
    await supabase.from('livraison_creneaux').update({ actif: !c.actif }).eq('id', c.id)
    setCreneaux(prev => prev.map(x => x.id === c.id ? { ...x, actif: !x.actif } : x))
  }

  async function majMax(id, val) {
    const n = Math.max(1, Number(val) || 1)
    await supabase.from('livraison_creneaux').update({ max_commandes: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, max_commandes: n } : c))
  }

  const tries = [...creneaux].sort((a, b) => {
    const j = JOURS_LIV.indexOf(a.jour_semaine) - JOURS_LIV.indexOf(b.jour_semaine)
    return j !== 0 ? j : (a.heure_debut || '').localeCompare(b.heure_debut || '')
  })

  const card = { background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16 }
  const field = { padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box' }

  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.ink }}>Créneaux de livraison (tournées)</h3>
      <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.muted }}>Tes fenêtres de tournée. La capacité limite le nombre de commandes par tournée.</p>

      {/* Formulaire d'ajout */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginBottom: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 120px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Jour</span>
          <select value={form.jour_semaine} onChange={e => setForm(p => ({ ...p, jour_semaine: e.target.value }))} style={field}>
            {JOURS_LIV.map(j => <option key={j} value={j}>{JOURS_LIV_LABELS[j]}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 90px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Début</span>
          <input type="time" value={form.heure_debut} onChange={e => setForm(p => ({ ...p, heure_debut: e.target.value }))} style={field} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 90px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Fin</span>
          <input type="time" value={form.heure_fin} onChange={e => setForm(p => ({ ...p, heure_fin: e.target.value }))} style={field} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 80px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Max cmd</span>
          <input type="number" min="1" value={form.max_commandes} onChange={e => setForm(p => ({ ...p, max_commandes: e.target.value }))} style={field} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: '1 1 90px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Limite (h avant)</span>
          <input type="number" min="0" value={form.cutoff_heures} onChange={e => setForm(p => ({ ...p, cutoff_heures: e.target.value }))} style={field} />
        </label>
        <button onClick={ajouter} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', flexShrink: 0 }}>
          Ajouter
        </button>
      </div>

      {/* Liste */}
      {loading ? <p style={{ fontSize: 12.5, color: T.muted }}>Chargement…</p>
        : tries.length === 0 ? <p style={{ fontSize: 12.5, color: T.muted, fontStyle: 'italic', margin: 0 }}>Aucune tournée pour l&rsquo;instant.</p>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tries.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, background: c.actif ? T.pale : '#F9FAFB', border: `1.5px solid ${c.actif ? T.light : '#E5E7EB'}`, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: c.actif ? T.ink : T.muted, width: 72, flexShrink: 0 }}>{JOURS_LIV_LABELS[c.jour_semaine] || c.jour_semaine}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: c.actif ? T.deep : T.muted, flexShrink: 0 }}>{(c.heure_debut || '').slice(0,5)}–{(c.heure_fin || '').slice(0,5)}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: T.muted, flexShrink: 0 }}>
                  max
                  <input type="number" min="1" value={c.max_commandes ?? 1} onChange={e => majMax(c.id, e.target.value)} style={{ ...field, width: 52, padding: '4px 6px' }} />
                </span>
                <div style={{ flex: 1 }} />
                <button onClick={() => toggleActif(c)} title={c.actif ? 'Désactiver' : 'Activer'} style={{ width: 34, height: 19, borderRadius: 100, background: c.actif ? T.main : '#D1D5DB', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                  <span style={{ position: 'absolute', top: 2, left: c.actif ? 17 : 2, width: 15, height: 15, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <button onClick={() => supprimer(c.id)} aria-label="Supprimer" style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', padding: 4, color: '#DC2626', flexShrink: 0 }}>
                  <Icon name="trash" size={15} color="#DC2626" />
                </button>
              </div>
            ))}
          </div>
      }
    </div>
  )
}

// Les réglages du programme, tirés du commerçant. Sortie de `useState` pour
// servir DEUX fois : l'état modifiable et son image de départ. Les écrire deux
// fois à la main, c'est prendre le risque qu'ils divergent un jour, et alors la
// barre d'enregistrement s'afficherait sur un écran auquel personne n'a touché.
function configFidelite(commercant) {
  const preset = presetFidelite(commercant?.categorie)
  return {
    fidelite_mecanique: commercant?.fidelite_mecanique || preset.fidelite_mecanique,
    fidelite_seuil_passages: commercant?.fidelite_seuil_passages || 10,
    fidelite_taux_cagnotte: commercant?.fidelite_taux_cagnotte || 5,
    fidelite_seuil_cagnotte: commercant?.fidelite_seuil_cagnotte || 10,
    fidelite_recompense_type: commercant?.fidelite_recompense_type || preset.fidelite_recompense_type,
    fidelite_recompense_valeur: commercant?.fidelite_recompense_valeur ?? preset.fidelite_recompense_valeur,
    fidelite_recompense_libelle: commercant?.fidelite_recompense_libelle || preset.fidelite_recompense_libelle,
    fidelite_sms_actif: commercant?.fidelite_sms_actif !== false,
  }
}

// ─── B.6 Fidélité : configuration + pointage comptoir (brief 31/07) ──────────
// LE GSM = LA CARTE : le commerçant tape le numéro du client, la carte se crée
// à la volée. Communiquer = ce pointage comptoir ; Vendre = + crédit AUTO sur
// les transactions Yoppaa (branché étape 4). SMS Brevo branchés à l'étape 6.
function TabFidelite({ commercantId, commercant, toast, onSaved, surModifications }) {
  const actif = commercant?.fidelite_actif === true
  const peutAuto = canDo(commercant?.plan, 'fidelite_auto')
  const [saving, setSaving] = useState(false)
  const [showConfig, setShowConfig] = useState(!actif)
  const [cfg, setCfg] = useState(() => configFidelite(commercant))
  // La même image de départ, gardée à part : c'est elle qui dit si le
  // programme a bougé, et c'est elle que « Ignorer » restitue.
  const [initial, setInitial] = useState(() => configFidelite(commercant))

  // Pointage comptoir
  const [telInput, setTelInput] = useState('')
  const [carte, setCarte] = useState(null)          // carte affichée
  const [telIntrouvable, setTelIntrouvable] = useState(null)  // numéro normalisé sans carte
  const [clientTrouve, setClientTrouve] = useState(null)      // compte Yoppaa portant ce numéro
  const [achatSms, setAchatSms] = useState(false)
  const soldeSms = commercant?.fidelite_sms_credits || 0

  // Achat d'un pack de SMS : Stripe Checkout sur le compte plateforme (c'est
  // Yoppaa qui vend les SMS). Le crédit est appliqué par le webhook billing.
  async function acheterPack(pack) {
    if (achatSms) return
    setAchatSms(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Session expirée, reconnecte-toi.', 'error'); setAchatSms(false); return }
      const r = await fetch('/api/fidelite/sms-packs/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: commercantId, pack }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok || !j.url) {
        toast(j.error || 'Impossible de lancer le paiement.', 'error')
        setAchatSms(false)
        return
      }
      window.location.href = j.url
    } catch {
      toast('Erreur réseau, réessaie.', 'error')
      setAchatSms(false)
    }
  }
  const [montantInput, setMontantInput] = useState('')
  const [dernieres, setDernieres] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!actif) return
    let annule = false
    supabase.from('fidelite_cartes').select('*').eq('commercant_id', commercantId)
      .order('updated_at', { ascending: false }).limit(8)
      .then(({ data }) => { if (!annule) setDernieres(data || []) })
    return () => { annule = true }
  }, [commercantId, actif, carte?.updated_at])

  async function sauverConfig(activer = false) {
    // ⚠️ LES RÉGLAGES D'ABORD, L'ACTIVATION ENSUITE, ET LES DEUX SÉPARÉS. Ce
    // sont les réglages seuls qui deviennent la nouvelle référence après
    // enregistrement : y laisser `fidelite_sms_credits: 25` ferait REPARTIR ce
    // cadeau de 25 SMS à chaque enregistrement suivant, puisque `cfg` est
    // recopié dans le patch. Un solde de SMS payés serait écrasé par 25.
    const reglages = {
      ...cfg,
      fidelite_seuil_passages: Math.min(50, Math.max(2, parseInt(cfg.fidelite_seuil_passages) || 10)),
      fidelite_taux_cagnotte: Math.min(30, Math.max(1, parseFloat(cfg.fidelite_taux_cagnotte) || 5)),
      fidelite_seuil_cagnotte: Math.max(1, parseFloat(cfg.fidelite_seuil_cagnotte) || 10),
      fidelite_recompense_valeur: parseFloat(cfg.fidelite_recompense_valeur) || null,
    }
    const patch = { ...reglages }
    if (activer) {
      patch.fidelite_actif = true
      // 25 SMS offerts à la première activation (une seule fois)
      if ((commercant?.fidelite_sms_credits || 0) === 0) patch.fidelite_sms_credits = 25
    }
    setSaving(true)
    const { error } = await supabase.from('commercants').update(patch).eq('id', commercantId)
    setSaving(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return false }
    // Les valeurs bornées (seuil ramené entre 2 et 50, taux entre 1 et 30) sont
    // ce qui part vraiment en base : c'est donc `reglages` et non `cfg` qui
    // devient la nouvelle référence. Sinon un seuil saisi à 99, corrigé à 50 par
    // le garde-fou, laisserait la barre affichée après un enregistrement réussi.
    setCfg(reglages)
    setInitial(reglages)
    toast(activer ? 'Fidélité activée, 25 SMS offerts 🟣' : 'Programme mis à jour')
    setShowConfig(false)
    onSaved?.()
    return true
  }

  // ─── Le garde-fou des modifications non enregistrées ─────────────────────
  // ⚠️ Rien à surveiller tant que le panneau de réglages est replié : ses
  // champs ne sont pas à l'écran, donc personne n'a rien saisi.
  const nbModifsFidelite = showConfig ? champsModifies(initial, cfg).length : 0
  useAvertirAvantDeQuitter(nbModifsFidelite > 0)
  const actionsFidelite = useRef({})
  actionsFidelite.current = {
    enregistrer: () => sauverConfig(!actif),
    ignorer: () => { setCfg(initial); toast('Modifications abandonnées') },
  }
  useEffect(() => {
    surModifications?.({
      modifie: nbModifsFidelite > 0, nb: nbModifsFidelite, saving, actions: actionsFidelite,
      // Le mot doit dire ce que fait le bouton : sur un programme jamais
      // activé, enregistrer c'est activer, et le commerçant a le droit de le
      // savoir avant d'appuyer.
      libelleAction: actif ? 'Enregistrer' : 'Activer la fidélité',
    })
    return () => surModifications?.(null)
  }, [surModifications, nbModifsFidelite, saving, actif])

  async function desactiver() {
    if (!await confirme(confirmationSimple({ titre: 'Désactiver le programme de fidélité ?', message: 'Les cartes de tes clients sont conservées, tu peux le réactiver quand tu veux.', action: 'Oui, désactiver la fidélité' }))) return
    const { error } = await supabase.from('commercants').update({ fidelite_actif: false }).eq('id', commercantId)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Fidélité désactivée (cartes conservées)')
    onSaved?.()
  }

  // Appel de l'API comptoir : elle seule peut identifier un client Yoppaa
  // déjà inscrit avec ce numéro (RLS clients fermée côté commerçant).
  async function appelComptoir(action, telephone) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast('Session expirée, reconnecte-toi.', 'error'); return null }
    const res = await fetch('/api/fidelite/comptoir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ action, commercant_id: commercantId, telephone }),
    })
    const j = await res.json()
    if (!res.ok || !j.ok) { toast(j.error || 'Erreur, réessaie.', 'error'); return null }
    return j
  }

  async function chercher() {
    const tel = normaliserTelephone(telInput)
    if (!tel) { toast('Numéro invalide (ex : 0470 12 34 56)', 'error'); return }
    setBusy(true)
    const j = await appelComptoir('chercher', tel)
    setBusy(false)
    if (!j) return
    setClientTrouve(j.client || null)
    if (j.carte) { setCarte(j.carte); setTelIntrouvable(null) }
    else { setCarte(null); setTelIntrouvable(j.telephone || tel) }
  }

  async function creerCarte() {
    if (!telIntrouvable) return
    setBusy(true)
    const j = await appelComptoir('creer', telIntrouvable)
    setBusy(false)
    if (!j?.carte) return
    setCarte(j.carte); setTelIntrouvable(null)
    setClientTrouve(j.client || null)
    toast(j.client
      ? `Carte créée pour ${j.client.prenom || 'ce client'} 🟣`
      : 'Carte créée 🟣')
    // SMS de bienvenue : branché à l'étape 6 (Brevo)
  }

  async function crediter() {
    if (!carte) return
    const credit = commercant.fidelite_mecanique === 'cagnotte'
      ? { montant: parseFloat(String(montantInput).replace(',', '.')) || 0 }
      : { passages: 1 }
    if (commercant.fidelite_mecanique === 'cagnotte' && credit.montant <= 0) {
      toast('Indique le montant de l’achat', 'error'); return
    }
    setBusy(true)
    const { patch, debloquees } = appliquerCredit(commercant, carte, credit)
    const { data, error } = await supabase.from('fidelite_cartes').update(patch).eq('id', carte.id).select().single()
    if (error) { setBusy(false); toast(`Erreur : ${error.message}`, 'error'); return }
    const mvts = [{ carte_id: carte.id, type: commercant.fidelite_mecanique === 'cagnotte' ? 'cagnotte' : 'passage', valeur: commercant.fidelite_mecanique === 'cagnotte' ? credit.montant : 1, source: 'comptoir' }]
    for (let i = 0; i < debloquees; i++) mvts.push({ carte_id: carte.id, type: 'recompense_debloquee', valeur: null, source: 'comptoir' })
    const { error: errMvt } = await supabase.from('fidelite_mouvements').insert(mvts)
    if (errMvt) console.warn('[fidelite] mouvement KO', errMvt.message)
    setBusy(false)
    setCarte(data)
    setMontantInput('')
    toast(debloquees > 0 ? `Carte pleine ! ${libelleRecompense(commercant)} 🟣` : 'C’est noté')
    // SMS carte pleine : branché à l'étape 6 (Brevo)
  }

  async function utiliserRecompense() {
    if (!carte || (carte.recompenses_disponibles || 0) < 1) return
    if (!await confirme(confirmationSimple({ titre: 'Utiliser la récompense maintenant ?', details: libelleRecompense(commercant), action: 'Oui, utiliser la récompense', ton: 'principal' }))) return
    setBusy(true)
    const { data, error } = await supabase.from('fidelite_cartes')
      .update({ recompenses_disponibles: carte.recompenses_disponibles - 1, updated_at: new Date().toISOString() })
      .eq('id', carte.id).select().single()
    if (!error) await supabase.from('fidelite_mouvements').insert({ carte_id: carte.id, type: 'recompense_utilisee', source: 'comptoir' })
    setBusy(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    setCarte(data)
    toast('Récompense utilisée, bien joué 🟣')
  }

  async function supprimerCarte() {
    if (!carte) return
    if (!await confirme(confirmationSimple({ titre: 'Supprimer cette carte de fidélité ?', message: 'À faire en cas de numéro mal tapé, ou si le client le demande.', details: afficherTelephone(carte.telephone), action: 'Oui, supprimer la carte' }))) return
    const { error } = await supabase.from('fidelite_cartes').delete().eq('id', carte.id)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    setCarte(null)
    toast('Carte supprimée')
  }

  const card = { background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16 }
  const field = { padding: '9px 11px', borderRadius: 9, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box' }
  const btnPlein = { padding: '10px 16px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }
  const btnGhost = { padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }
  const chip = (sel) => ({ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${sel ? T.main : T.hairline}`, background: sel ? T.pale : '#fff', color: sel ? T.main : T.muted, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' })
  const estCagnotte = (showConfig ? cfg.fidelite_mecanique : commercant?.fidelite_mecanique) === 'cagnotte'

  // Jauge de la carte affichée (fonction de rendu, pas un composant : elle est
  // recréée à chaque render de l'onglet)
  function renderJauge(c) {
    if (commercant.fidelite_mecanique === 'cagnotte') {
      const seuil = Number(commercant.fidelite_seuil_cagnotte || 10)
      const pct = Math.min(100, Math.round((Number(c.cagnotte) / seuil) * 100))
      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: T.deep }}>Cagnotte : {Number(c.cagnotte).toFixed(2).replace('.', ',')}€</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>objectif {seuil.toFixed(2).replace('.', ',')}€</span>
          </div>
          <div style={{ height: 8, borderRadius: 100, background: T.pale, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: `linear-gradient(90deg, ${T.main}, ${T.mid})`, transition: 'width 0.3s' }}/>
          </div>
        </div>
      )
    }
    const seuil = commercant.fidelite_seuil_passages || 10
    return (
      <div>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: T.deep }}>Passages : {c.passages}/{seuil}</p>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {Array.from({ length: seuil }, (_, i) => (
            <span key={i} style={{ width: 16, height: 16, borderRadius: '50%', background: i < c.passages ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : T.pale, border: `1.5px solid ${i < c.passages ? T.main : T.hairline}` }}/>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ─── Activation / configuration ─── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Programme de fidélité</p>
          {actif && (
            <span style={{ fontSize: 11, fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '3px 10px', borderRadius: 100, border: '1px solid #10B98133' }}>Actif</span>
          )}
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
          La carte de fidélité digitale de tes clients : leur numéro de GSM suffit, la carte se crée toute seule au comptoir.
          {peutAuto ? ' Et avec Vendre, chaque commande ou rendez-vous Yoppaa la remplit automatiquement.' : ''}
        </p>

        {/* Crédits SMS : le carburant du programme. Deux SMS seulement (carte
            ouverte, récompense débloquée), mais sans eux le client ne sait pas
            que sa carte existe. D'où le solde bien visible + la recharge ici. */}
        {actif && (
          <div style={{ background: soldeSms > 0 ? T.pale : '#FFFBEB', border: `1.5px solid ${soldeSms > 0 ? T.light : '#FCD34D'}`, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: soldeSms > 0 ? T.deep : '#78350F' }}>
                  {soldeSms} SMS restant{soldeSms > 1 ? 's' : ''}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: soldeSms > 0 ? T.muted : '#92400E', lineHeight: 1.5 }}>
                  {soldeSms === 0
                    ? 'Sans SMS, tes clients ne reçoivent plus le lien de leur carte ni l’annonce de leur récompense.'
                    : soldeSms <= 10
                      ? 'Il te reste peu de SMS, pense à recharger.'
                      : 'Utilisés pour l’ouverture d’une carte et l’annonce d’une récompense.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                {Object.entries(PACKS_SMS).map(([cle, p]) => (
                  <button key={cle} onClick={() => acheterPack(cle)} disabled={achatSms}
                    style={{ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.main}`, background: cle === '500' ? T.main : '#fff', color: cle === '500' ? '#fff' : T.main, fontWeight: 800, fontSize: 12, cursor: achatSms ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    {achatSms ? '…' : `${p.nb} SMS · ${p.prix_htva.toFixed(2)}€`}
                  </button>
                ))}
              </div>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 10, color: T.muted }}>Prix HTVA. Les crédits n&rsquo;expirent pas.</p>
          </div>
        )}

        {/* Affichette comptoir : le programme ne décolle que si le client sait
            qu'il existe. Une feuille A5 près de la caisse fait ce travail. */}
        {actif && commercant?.slug && (
          <a href={`/affichette/${commercant.slug}`} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 12, border: `1.5px solid ${T.pale}`, background: '#fff', textDecoration: 'none', marginBottom: 14 }}>
            <Printer size={17} color={T.main} style={{ flexShrink: 0 }}/>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: T.ink }}>Affichette pour ton comptoir</span>
              <span style={{ display: 'block', fontSize: 11, color: T.muted, marginTop: 1 }}>À imprimer en A5 : « Donne ton numéro de GSM », ta règle et ton QR code</span>
            </span>
          </a>
        )}

        {(showConfig || !actif) ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: T.deep }}>Mécanique</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={chip(!estCagnotte)} onClick={() => setCfg(p => ({ ...p, fidelite_mecanique: 'passages' }))}>Carte à passages</button>
                <button style={chip(estCagnotte)} onClick={() => setCfg(p => ({ ...p, fidelite_mecanique: 'cagnotte' }))}>Cagnotte par montant</button>
              </div>
            </div>
            {!estCagnotte ? (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: T.deep }}>Passages pour débloquer la récompense</p>
                <input type="number" min={2} max={50} style={{ ...field, width: 110 }} value={cfg.fidelite_seuil_passages}
                  onChange={e => setCfg(p => ({ ...p, fidelite_seuil_passages: e.target.value }))}/>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: T.deep }}>% du montant en cagnotte</p>
                  <input type="number" min={1} max={30} step="0.5" style={{ ...field, width: 110 }} value={cfg.fidelite_taux_cagnotte}
                    onChange={e => setCfg(p => ({ ...p, fidelite_taux_cagnotte: e.target.value }))}/>
                </div>
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: T.deep }}>Cagnotte à atteindre (€)</p>
                  <input type="number" min={1} step="0.5" style={{ ...field, width: 110 }} value={cfg.fidelite_seuil_cagnotte}
                    onChange={e => setCfg(p => ({ ...p, fidelite_seuil_cagnotte: e.target.value }))}/>
                </div>
              </div>
            )}
            <div>
              <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: T.deep }}>Récompense</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button style={chip(cfg.fidelite_recompense_type === 'remise_montant')} onClick={() => setCfg(p => ({ ...p, fidelite_recompense_type: 'remise_montant' }))}>Montant (€)</button>
                <button style={chip(cfg.fidelite_recompense_type === 'remise_pct')} onClick={() => setCfg(p => ({ ...p, fidelite_recompense_type: 'remise_pct' }))}>Pourcentage (%)</button>
                <input type="number" min={1} step="0.5" style={{ ...field, width: 100 }} value={cfg.fidelite_recompense_valeur}
                  onChange={e => setCfg(p => ({ ...p, fidelite_recompense_valeur: e.target.value }))}
                  placeholder={cfg.fidelite_recompense_type === 'remise_pct' ? '%' : '€'}/>
              </div>
              <input style={{ ...field, width: '100%' }} maxLength={90} value={cfg.fidelite_recompense_libelle}
                onChange={e => setCfg(p => ({ ...p, fidelite_recompense_libelle: e.target.value }))}
                placeholder="Libellé montré au client (ex : Le 11e pain est offert)"/>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.fidelite_sms_actif}
                onChange={e => setCfg(p => ({ ...p, fidelite_sms_actif: e.target.checked }))}
                style={{ width: 15, height: 15, accentColor: T.mid }}/>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: T.deep }}>Prévenir mes clients par SMS (création de carte + récompense débloquée)</span>
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btnPlein} disabled={saving} onClick={() => sauverConfig(!actif)}>
                {saving ? 'Enregistrement…' : actif ? 'Enregistrer' : 'Activer la fidélité (25 SMS offerts)'}
              </button>
              {actif && <button style={btnGhost} onClick={() => setShowConfig(false)}>Annuler</button>}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.deep }}>
              {commercant.fidelite_mecanique === 'cagnotte'
                ? `${Number(commercant.fidelite_taux_cagnotte)}% en cagnotte, récompense dès ${Number(commercant.fidelite_seuil_cagnotte).toFixed(2).replace('.', ',')}€`
                : `${commercant.fidelite_seuil_passages} passages → récompense`}
              {' · '}{libelleRecompense(commercant)}
            </span>
            <button style={btnGhost} onClick={() => setShowConfig(true)}>Modifier</button>
            <button style={{ ...btnGhost, color: '#DC2626', borderColor: '#FEE2E2' }} onClick={desactiver}>Désactiver</button>
          </div>
        )}
      </div>

      {/* ─── Pointage comptoir ─── */}
      {actif && (
        <div style={card}>
          <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Pointage comptoir</p>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
            Le client donne son numéro de GSM, tu le tapes, c&rsquo;est tout. Pas encore de carte ? Elle se crée en un clic.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="tel" inputMode="tel" style={{ ...field, flex: 1, fontSize: 16 }} placeholder="0470 12 34 56"
              value={telInput} onChange={e => setTelInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') chercher() }}/>
            <button style={btnPlein} disabled={busy} onClick={chercher}>Chercher</button>
          </div>

          {telIntrouvable && (
            <div style={{ marginTop: 12, background: T.pale, borderRadius: 12, padding: '12px 14px' }}>
              <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: T.deep }}>
                Aucune carte pour {afficherTelephone(telIntrouvable)}.
              </p>
              {/* Client Yoppaa déjà inscrit avec ce numéro : la carte sera
                  rattachée à son compte, il la verra dans son appli. */}
              <p style={{ margin: '0 0 10px', fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                {clientTrouve
                  ? <>C&rsquo;est le numéro de <strong style={{ color: T.main }}>{[clientTrouve.prenom, clientTrouve.nom].filter(Boolean).join(' ')}</strong>, déjà inscrit sur Yoppaa : sa carte sera reliée à son compte.</>
                  : 'Ce numéro n’a pas encore de compte Yoppaa : la carte fonctionnera quand même, il la retrouvera dès son inscription.'}
              </p>
              <button style={btnPlein} disabled={busy} onClick={creerCarte}>Créer sa carte 🟣</button>
            </div>
          )}

          {carte && (
            <div style={{ marginTop: 12, border: `1.5px solid ${T.pale}`, borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 900, color: T.ink }}>
                  {clientTrouve ? [clientTrouve.prenom, clientTrouve.nom].filter(Boolean).join(' ') : afficherTelephone(carte.telephone)}
                  {clientTrouve && <span style={{ fontSize: 11.5, fontWeight: 600, color: T.muted, marginLeft: 8 }}>{afficherTelephone(carte.telephone)}</span>}
                </p>
                <button onClick={supprimerCarte} aria-label="Supprimer la carte"
                  style={{ width: 26, height: 26, borderRadius: 100, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 12, fontWeight: 800, padding: 0 }}>✕</button>
              </div>
              {renderJauge(carte)}

              {(carte.recompenses_disponibles || 0) > 0 && (
                <div style={{ marginTop: 12, background: '#F0FDF4', border: '1.5px solid #10B98144', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#059669', flex: 1 }}>
                    {carte.recompenses_disponibles > 1 ? `${carte.recompenses_disponibles} récompenses disponibles` : 'Récompense disponible'} : {libelleRecompense(commercant)}
                  </span>
                  <button style={{ ...btnPlein, background: '#10B981' }} disabled={busy} onClick={utiliserRecompense}>Utiliser maintenant</button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                {commercant.fidelite_mecanique === 'cagnotte' ? (
                  <>
                    <input type="number" min="0" step="0.01" inputMode="decimal" style={{ ...field, width: 130 }} placeholder="Montant (€)"
                      value={montantInput} onChange={e => setMontantInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') crediter() }}/>
                    <button style={btnPlein} disabled={busy} onClick={crediter}>Créditer la cagnotte</button>
                  </>
                ) : (
                  <button style={{ ...btnPlein, fontSize: 15, padding: '12px 22px' }} disabled={busy} onClick={crediter}>+1 passage</button>
                )}
              </div>
            </div>
          )}

          {dernieres.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dernières cartes</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dernieres.map(c => (
                  <button key={c.id} onClick={() => { setCarte(c); setTelIntrouvable(null); setTelInput(afficherTelephone(c.telephone)) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: `1px solid ${carte?.id === c.id ? T.main : T.hairline}`, background: carte?.id === c.id ? T.pale : '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: T.ink, flex: 1 }}>{afficherTelephone(c.telephone)}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>
                      {commercant.fidelite_mecanique === 'cagnotte'
                        ? `${Number(c.cagnotte).toFixed(2).replace('.', ',')}€`
                        : `${c.passages}/${commercant.fidelite_seuil_passages || 10}`}
                    </span>
                    {(c.recompenses_disponibles || 0) > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#059669', background: '#F0FDF4', padding: '2px 8px', borderRadius: 100, border: '1px solid #10B98133' }}>Récompense</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MES LIEUX : où se passe l'activité, et quand ───────────────────────────
//
// Un PONCTUEL (date précise) prime sur la tournée hebdo du même jour, et les
// lieux PERMANENTS restent de la partie tous les jours. La fiche client affiche
// le lieu résolu du jour à la place de l'adresse du siège.
//
// ⚠️ CETTE SECTION N'EST PLUS RÉSERVÉE AUX FOOD TRUCKS. Elle avait été écrite
// pour eux, et elle décrivait déjà exactement le besoin d'une professeure de
// yoga qui donne cours dans deux salles : un lieu par jour, avec des exceptions.
// Deux métiers sans rapport, le même besoin. Seul le nom était trop étroit, la
// table s'appelle désormais `commercant_lieux`.
//
// Ce qu'elle a gagné le 12/08 : les lieux PERMANENTS, ceux du salon à deux
// adresses ou du commerçant inscrit à son domicile mais qui travaille ailleurs.
const JOURS_FT = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

// Les emplacements d'un même jour se lisent dans l'ordre du service : le midi
// avant le soir. Un lieu sans horaire vaut la journée entière, il passe donc
// devant, et c'est ce que `''` obtient sans cas particulier.
function parHeure(a, b) {
  return String(a?.heure_debut || '').localeCompare(String(b?.heure_debut || ''))
}
// ⚠️ DEUX CAS, ET RIEN ENTRE LES DEUX (décision d'Alex du 15/08).
//
// Cette section empilait QUATRE sous-parties pour tout le monde : des adresses
// valables toute l'année, un raccourci « où je suis aujourd'hui », un planning
// hebdomadaire et des dates particulières. Alex, en la relisant : « ce n'est
// pas clair », avec une flèche entre « Mes adresses » et « Mon planning » et un
// « IDEM ? ». Il avait raison : les deux répondent à la même question, et rien
// ne disait laquelle l'emportait.
//
// La réponse tient en une phrase : **soit une adresse fixe, soit un planning
// par jour.** Un commerce ne peut pas être les deux à la fois, et c'est déjà la
// question posée juste au-dessus, « Où tes clients te trouvent-ils ? ».
//
//   • adresse FIXE  → une adresse, celle du siège ou une autre. Rien d'autre.
//   • adresse MOBILE → le planning de la semaine, jusqu'à deux endroits par
//     jour, plus les emplacements exceptionnels. Pas d'adresse permanente, qui
//     contredirait le planning sans qu'on sache qui gagne.
//
// ⚠️ LE CAS ÉCARTÉ, ET IL FAUT LE DIRE : le salon à DEUX adresses permanentes.
// Il redevient possible en passant en mobile et en posant ses deux endroits sur
// tous les jours. Les lieux déjà enregistrés ne sont pas supprimés, seulement
// masqués dans le mode où ils n'ont pas de sens.
function SectionLieux({ commercantId, toast, mobile = false }) {
  const [emps, setEmps] = useState([])
  const [loading, setLoading] = useState(true)
  // « Aujourd'hui je suis à… » : zéro friction, 2 champs obligatoires + 1 bouton
  const [auj, setAuj] = useState({ libelle: '', adresse: '', latitude: null, longitude: null, heure_debut: '', heure_fin: '' })
  // Ponctuel futur (événement, marché…)
  const [futur, setFutur] = useState({ date_jour: '', libelle: '', adresse: '', latitude: null, longitude: null, heure_debut: '', heure_fin: '' })
  const [showFutur, setShowFutur] = useState(false)
  // Édition d'une ligne de tournée hebdo (un seul formulaire ouvert à la fois).
  // `id` distingue une modification d'un ajout : un jour peut désormais porter
  // DEUX emplacements, celui du midi et celui du soir.
  const [formHebdo, setFormHebdo] = useState(null)  // { id, jour, libelle, adresse, heures… }
  // ⚠️ RECOPIER UN JOUR SUR D'AUTRES (demande d'Alex, 16/08). Une professeure
  // qui donne cours dans la même salle du lundi au vendredi saisissait le nom,
  // l'adresse complète et deux horaires CINQ FOIS. La grille des horaires fixes
  // savait déjà le faire ; le planning par emplacements, non.
  const [copieDepuis, setCopieDepuis] = useState(null)   // le jour source, ou null
  const [copieVers, setCopieVers] = useState([])         // les jours cochés
  // Ajout d'un lieu PERMANENT : une seconde adresse, un atelier, une salle
  // louée à l'année. ⚠️ Ne PAS écrire « siège d'exploitation » : ce terme de la
  // Banque-Carrefour désigne une unité d'établissement déclarée, ce qu'une
  // salle louée n'est pas, et il ferait croire à une formalité administrative.
  const [perm, setPerm] = useState({ libelle: '', adresse: '', latitude: null, longitude: null })
  // ⚠️ LE SYSTÈME CLASSIQUE RESTE LA NORME, et cette case est DÉCOCHÉE par
  // défaut. Une boulangerie, un salon ou un cabinet ne bougeront jamais : leur
  // demander à chaque plage horaire « et c'était à quel endroit ? » serait une
  // question absurde posée à l'immense majorité pour servir une minorité.
  const [planningParLieu, setPlanningParLieu] = useState(false)
  // `null` tant qu'on ne sait pas : un rappel affiché pendant le chargement,
  // puis retiré, ferait clignoter une alerte pour rien.
  const [siegeEstLeLieu, setSiegeEstLeLieu] = useState(null)

  // ⚠️ `jourLocalISO` et PAS `toISOString()`. Minuit heure belge, c'est 22h ou
  // 23h LA VEILLE en temps universel : entre minuit et deux heures du matin,
  // « Aujourd'hui je suis à… » enregistrait l'emplacement sous la date d'HIER,
  // et la fiche du commerçant ne l'affichait jamais de la journée. Un marché de
  // nuit ou un montage à une heure du matin, et le client ne trouvait personne.
  const todayISO = jourLocalISO(new Date())
  const jourKey = jourSemaineLocal(new Date())

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { charger() }, [commercantId])
  async function charger() {
    const [{ data, error }, { data: c }] = await Promise.all([
      supabase.from('commercant_lieux').select('*').eq('commercant_id', commercantId),
      supabase.from('commercants').select('planning_par_lieu, siege_social_est_lieu_activite').eq('id', commercantId).maybeSingle(),
    ])
    if (error) { toast(`Erreur : ${error.message}`, 'error'); setLoading(false); return }
    setEmps(data || [])
    setPlanningParLieu(c?.planning_par_lieu === true)
    setSiegeEstLeLieu(c?.siege_social_est_lieu_activite !== false)
    // ⚠️ SANS CETTE ÉCRITURE, LE COMMERCE PASSERAIT POUR FERMÉ TOUTE LA
    // SEMAINE. Les horaires ne servent pas qu'à l'affichage : le moteur de
    // créneaux les croise avec les plages de rendez-vous et écarte tout créneau
    // tombant hors ouverture. Chez qui a répondu « je change d'endroit », la
    // grille n'est plus saisie à la main, elle est DÉDUITE des emplacements et
    // réécrite à chaque ajout, modification ou retrait.
    //
    // ⚠️ ET SEULEMENT POUR LUI : chez un commerce qui ne bouge pas, écraser des
    // horaires saisis à la main serait une catastrophe silencieuse.
    //
    // ⚠️ On part de la liste QUI VIENT D'ARRIVER, jamais de l'état React :
    // celui-ci ne sera à jour qu'au rendu suivant, et on écrirait les horaires
    // d'avant la modification qu'on vient justement d'enregistrer.
    if (c?.siege_social_est_lieu_activite === false) {
      const horaires = horairesDepuisLieux(data || [])
      supabase.from('commercants').update({ horaires_detail: horaires }).eq('id', commercantId)
        .then(({ error: e }) => { if (e) console.warn('[lieux] horaires non synchronisés', e.message) })
    }
    setLoading(false)
  }

  async function basculerPlanningParLieu(actif) {
    setPlanningParLieu(actif)   // l'écran répond tout de suite
    const { error } = await supabase.from('commercants')
      .update({ planning_par_lieu: actif }).eq('id', commercantId)
    if (error) { setPlanningParLieu(!actif); toast(`Erreur : ${error.message}`, 'error'); return }
    toast(actif
      ? 'Tes horaires se règlent maintenant emplacement par emplacement'
      : 'Tes horaires valent de nouveau pour tout ton commerce')
  }

  // ⚠️ UN JOUR PEUT PORTER PLUSIEURS EMPLACEMENTS depuis le 13/08, et c'est le
  // besoin des FOOD TRUCKS, où c'est la norme : le service du midi sur une
  // place, celui du soir dans un zoning. Cette liste était auparavant un objet
  // « un lieu par jour », ce qui écrasait silencieusement le second.
  const ponctuelsAuj = emps
    .filter(e => e.type === 'ponctuel' && e.date_jour === todayISO)
    .sort(parHeure)
  const hebdoParJour = {}
  for (const e of emps.filter(e => e.type === 'hebdo')) {
    (hebdoParJour[e.jour_semaine] ||= []).push(e)
  }
  for (const jour of Object.keys(hebdoParJour)) hebdoParJour[jour].sort(parHeure)

  const ponctuelAuj = ponctuelsAuj[0] || null
  const effectifsAuj = ponctuelsAuj.length > 0
    ? ponctuelsAuj.filter(e => e.actif)
    : (hebdoParJour[jourKey] || []).filter(e => e.actif)
  const effectifAuj = effectifsAuj[0] || null
  const futurs = emps
    .filter(e => e.type === 'ponctuel' && e.date_jour >= todayISO)
    .sort((a, b) => a.date_jour.localeCompare(b.date_jour))

  function fmtHeures(e) {
    if (!e.heure_debut || !e.heure_fin) return null
    return `${e.heure_debut.slice(0, 5)}–${e.heure_fin.slice(0, 5)}`
  }

  // ⚠️ MODIFIER PLUTÔT QUE SUPPRIMER PUIS RECRÉER. Les trois enregistrements
  // effaçaient l'ancienne ligne AVANT d'insérer la nouvelle. Si l'insertion
  // échouait (réseau coupé au marché, ce qui est le quotidien d'un food truck),
  // le commerçant se retrouvait sans AUCUN emplacement : sa fiche affichait
  // « Prochain emplacement annoncé bientôt » alors qu'il était sur place.
  // La modification, elle, ne détruit rien tant qu'elle n'a pas réussi.
  async function enregistrerEmplacement(existant, valeurs) {
    if (existant) {
      return supabase.from('commercant_lieux').update(valeurs).eq('id', existant.id)
    }
    return supabase.from('commercant_lieux').insert(valeurs)
  }

  // ⚠️ DEUX EMPLACEMENTS QUI SE CHEVAUCHENT N'ONT PAS DE RÉPONSE. « Où es-tu à
  // 12h30 » rendrait le premier de la liste, c'est-à-dire l'ordre d'insertion
  // en base : le client apprendrait où aller au hasard. On refuse la saisie
  // plutôt que de trancher à sa place.
  function conflit(candidat) {
    const gene = lieuEnConflit(emps, candidat)
    if (!gene) return false
    const quand = gene.heure_debut
      ? `de ${String(gene.heure_debut).slice(0, 5)} à ${String(gene.heure_fin || '').slice(0, 5)}`
      : 'toute la journée'
    toast(`« ${gene.libelle} » occupe déjà ce moment (${quand}). Ajuste les heures.`, 'error')
    return true
  }

  async function declarerAujourdhui() {
    if (!auj.libelle.trim() || !auj.adresse.trim()) { toast('Nom du lieu et adresse obligatoires', 'error'); return }
    // Le même emplacement se remplace, un autre s'AJOUTE : un food truck peut
    // annoncer son service du midi puis celui du soir.
    const memeLibelle = ponctuelsAuj.find(e => e.libelle === auj.libelle.trim())
    if (conflit({
      id: memeLibelle?.id, type: 'ponctuel', date_jour: todayISO,
      heure_debut: auj.heure_debut || null, heure_fin: auj.heure_fin || null,
    })) return
    const { error } = await enregistrerEmplacement(memeLibelle, {
      commercant_id: commercantId, type: 'ponctuel', date_jour: todayISO,
      libelle: auj.libelle.trim(), adresse: auj.adresse.trim(),
      latitude: auj.latitude, longitude: auj.longitude,
      heure_debut: auj.heure_debut || null, heure_fin: auj.heure_fin || null,
      actif: true,
    })
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('C’est noté, ta fiche affiche ton emplacement du jour')
    setAuj({ libelle: '', adresse: '', latitude: null, longitude: null, heure_debut: '', heure_fin: '' })
    charger()
  }

  async function ajouterFutur() {
    if (!futur.date_jour || !futur.libelle.trim() || !futur.adresse.trim()) { toast('Date, nom du lieu et adresse obligatoires', 'error'); return }
    if (futur.date_jour < todayISO) { toast('La date est déjà passée', 'error'); return }
    const existant = emps.find(e => e.type === 'ponctuel' && e.date_jour === futur.date_jour
      && e.libelle === futur.libelle.trim())
    if (conflit({
      id: existant?.id, type: 'ponctuel', date_jour: futur.date_jour,
      heure_debut: futur.heure_debut || null, heure_fin: futur.heure_fin || null,
    })) return
    const { error } = await enregistrerEmplacement(existant, {
      commercant_id: commercantId, type: 'ponctuel', date_jour: futur.date_jour,
      libelle: futur.libelle.trim(), adresse: futur.adresse.trim(),
      latitude: futur.latitude, longitude: futur.longitude,
      heure_debut: futur.heure_debut || null, heure_fin: futur.heure_fin || null,
      actif: true,
    })
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Emplacement planifié')
    setFutur({ date_jour: '', libelle: '', adresse: '', latitude: null, longitude: null, heure_debut: '', heure_fin: '' })
    setShowFutur(false)
    charger()
  }

  async function saveHebdo() {
    if (!formHebdo || !formHebdo.libelle.trim() || !formHebdo.adresse.trim()) { toast('Nom du lieu et adresse obligatoires', 'error'); return }
    // ⚠️ On modifie CE lieu-là, pas « le lieu du jour ». Le jour peut en porter
    // deux, et se repérer au jour écraserait le service du midi en enregistrant
    // celui du soir.
    const existant = formHebdo.id ? emps.find(e => e.id === formHebdo.id) : null
    // Le verrou vaut aussi pour une MODIFICATION : changer l'adresse ou
    // l'horaire d'un emplacement déplace tous les rendez-vous qui s'y tiennent.
    if (existant) {
      const bloquants = await rdvsQuiBloquent(existant.id)
      if (bloquants > 0) {
        toast(`${bloquants} rendez-vous ${bloquants > 1 ? 'sont prévus' : 'est prévu'} à cet endroit. Annule-les depuis l’agenda avant de le déplacer, et propose une nouvelle place à tes clients.`, 'error')
        return
      }
    }
    if (conflit({
      id: formHebdo.id, type: 'hebdo', jour_semaine: formHebdo.jour,
      heure_debut: formHebdo.heure_debut || null, heure_fin: formHebdo.heure_fin || null,
    })) return
    const { error } = await enregistrerEmplacement(existant, {
      commercant_id: commercantId, type: 'hebdo', jour_semaine: formHebdo.jour,
      libelle: formHebdo.libelle.trim(), adresse: formHebdo.adresse.trim(),
      latitude: formHebdo.latitude ?? null, longitude: formHebdo.longitude ?? null,
      heure_debut: formHebdo.heure_debut || null, heure_fin: formHebdo.heure_fin || null,
      actif: true,
    })
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Tournée mise à jour')
    setFormHebdo(null)
    charger()
  }

  // ⚠️ RECOPIER UN JOUR SUR D'AUTRES (demande d'Alex, 16/08). Une professeure
  // qui donne cours dans la même salle du lundi au vendredi saisissait le nom,
  // l'adresse complète et deux horaires CINQ FOIS. La grille des horaires fixes
  // proposait déjà « Dupliquer sur d'autres jours » ; le planning par
  // emplacements, non, alors que c'est là que la saisie est la plus longue.
  //
  // ⚠️ ON COPIE TOUS LES MOMENTS DU JOUR, pas seulement le premier. Un food
  // truck qui sert le midi sur une place et le soir dans un zoning veut les
  // deux, et n'en recopier qu'un lui ferait perdre la moitié de son service
  // sans rien dire.
  async function dupliquerJour() {
    const source = hebdoParJour[copieDepuis] || []
    if (source.length === 0) { toast('Ce jour n’a aucun emplacement à copier', 'error'); return }
    if (copieVers.length === 0) { toast('Choisis au moins un jour', 'error'); return }

    // ⚠️ ON VÉRIFIE TOUT AVANT D'ÉCRIRE QUOI QUE CE SOIT. Écrire au fil de l'eau
    // laisserait le commerçant avec trois jours copiés et un refus au milieu,
    // sans savoir ce qui est passé. Et on nomme celui qui gêne, comme partout
    // ailleurs : « ça n'a pas marché » n'aide personne à corriger.
    const posesVirtuels = []
    for (const cible of copieVers) {
      for (const e of source) {
        const candidat = {
          type: 'hebdo', jour_semaine: cible,
          heure_debut: e.heure_debut || null, heure_fin: e.heure_fin || null,
        }
        const gene = lieuEnConflit([...emps, ...posesVirtuels], candidat)
        if (gene) {
          const quand = gene.heure_debut
            ? `de ${String(gene.heure_debut).slice(0, 5)} à ${String(gene.heure_fin || '').slice(0, 5)}`
            : 'toute la journée'
          toast(`« ${gene.libelle} » occupe déjà ce moment le ${cible} (${quand}). Rien n’a été copié.`, 'error')
          return
        }
        // Les copies déjà décidées comptent pour la suivante : deux moments du
        // même jour source ne peuvent pas se marcher dessus sur la cible.
        posesVirtuels.push({ ...candidat, id: `copie-${posesVirtuels.length}`, libelle: e.libelle, actif: true })
      }
    }

    const lignes = copieVers.flatMap(cible => source.map(e => ({
      commercant_id: commercantId, type: 'hebdo', jour_semaine: cible,
      libelle: e.libelle, adresse: e.adresse,
      latitude: e.latitude ?? null, longitude: e.longitude ?? null,
      heure_debut: e.heure_debut || null, heure_fin: e.heure_fin || null,
      actif: true,
    })))
    const { error } = await supabase.from('commercant_lieux').insert(lignes)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast(`Copié sur ${copieVers.length} jour${copieVers.length > 1 ? 's' : ''}`)
    setCopieDepuis(null); setCopieVers([])
    // ⚠️ `charger()` fait tout le reste : il relit les emplacements ET redéduit
    // les horaires d'ouverture. Sans lui, les jours copiés resteraient fermés
    // aux yeux du moteur de créneaux, donc inréservables.
    charger()
  }

  // ⚠️ UN EMPLACEMENT QUI PORTE DES RENDEZ-VOUS NE BOUGE PLUS. Règle d'Alex du
  // 13/08 : le commerçant doit d'abord annuler ces rendez-vous, et il peut
  // ensuite inviter ses clients à reprendre place ailleurs. Déplacer en
  // silence enverrait des gens à une adresse où personne ne les attend, et ils
  // ne l'apprendraient qu'en arrivant.
  //
  // On ne compte que les rendez-vous À VENIR et encore debout : un rendez-vous
  // honoré la semaine dernière ne doit rien interdire, il appartient au passé.
  async function rdvsQuiBloquent(lieuId) {
    if (!lieuId) return 0
    const { count } = await supabase
      .from('rdv_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('lieu_id', lieuId)
      .eq('statut', 'confirme')
      .gte('date_rdv', todayISO)
      .is('deleted_at', null)
    return count || 0
  }

  async function supprimer(id) {
    const bloquants = await rdvsQuiBloquent(id)
    if (bloquants > 0) {
      toast(`${bloquants} rendez-vous ${bloquants > 1 ? 'sont prévus' : 'est prévu'} à cet endroit. Annule-les depuis l’agenda avant de le retirer, et propose une nouvelle place à tes clients.`, 'error')
      return
    }
    const { error } = await supabase.from('commercant_lieux').delete().eq('id', id)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    setEmps(prev => prev.filter(e => e.id !== id))
  }

  // ─── Les lieux PERMANENTS ────────────────────────────────────────────────
  // Le salon à deux adresses, l'atelier du commerçant inscrit à son domicile.
  // Ils sont de la partie tous les jours, sans jour ni date.
  const permanents = emps.filter(e => e.type === 'permanent')

  // ⚠️ L'AVERTISSEMENT VAUT MAINTENANT POUR TOUT LE MONDE (Alex, 15/08).
  //
  // Il ne s'affichait qu'aux commerçants ayant décoché la case du signup,
  // parce que les autres retombaient sur leur siège. Ce repli a disparu :
  // l'adresse d'inscription ne sert plus qu'à valider le dossier. **Aucun lieu
  // déclaré veut donc dire aucune adresse sur la fiche, pour tous.**
  //
  // Sans ce changement, un commerçant qui répond « toujours au même endroit »
  // sans rien saisir aurait une fiche muette et aucun écran pour le lui dire :
  // il l'apprendrait en voyant un client ne pas venir.
  const aucunLieuAlorsQuIlEnFaut = emps.length === 0

  async function ajouterPermanent() {
    if (!perm.libelle.trim() || !perm.adresse.trim()) { toast('Nom du lieu et adresse obligatoires', 'error'); return }
    // ⚠️ LE PREMIER LIEU DÉCLARÉ DEVIENT LE PRINCIPAL. C'est celui que le signup
    // a créé, ou à défaut celui-ci : sans lieu principal, un commerçant qui a
    // décoché la case n'aurait aucune adresse de référence.
    const { error } = await supabase.from('commercant_lieux').insert({
      commercant_id: commercantId, type: 'permanent',
      libelle: perm.libelle.trim(), adresse: perm.adresse.trim(),
      latitude: perm.latitude, longitude: perm.longitude,
      principal: permanents.length === 0,
      actif: true,
    })
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Lieu ajouté')
    setPerm({ libelle: '', adresse: '', latitude: null, longitude: null })
    charger()
  }

  const field = { padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${T.hairline}`, fontSize: 13, fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box' }
  const btnMini = { padding: '5px 12px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 800, fontSize: 11.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }

  if (loading) return null

  return (
    <div style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 14, padding: 16, marginTop: 16 }}>
      <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Où me trouver</p>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
        {mobile ? (
          <>
            Tu as répondu que tu changes d’endroit : c’est donc ton planning qui dit
            où tu es, jour par jour. Ta fiche annonce l’endroit du jour, et un
            emplacement exceptionnel remplace ton planning ce jour-là.
            <span style={{ display: 'block', marginTop: 4 }}>
              Les heures que tu poses ici deviennent tes horaires d’ouverture : tu n’as
              rien à saisir deux fois.
            </span>
          </>
        ) : (
          <>
            Tu as répondu que tes clients te trouvent toujours au même endroit.
            Une seule adresse suffit donc, et tes horaires se règlent au-dessus.
          </>
        )}
      </p>

      {/* ─── LE RAPPEL, et il n'est pas décoratif ────────────────────────────
          ⚠️ C'est lui qui rend sans danger le fait que l'adresse d'inscription
          ne serve plus qu'au dossier (décision Alex du 15/08). Tant qu'aucun
          lieu n'est déclaré, la fiche n'annonce AUCUNE adresse. Sans ce rappel,
          le commerçant ne l'apprendrait qu'en voyant un client ne pas venir. */}
      {aucunLieuAlorsQuIlEnFaut && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '11px 13px', marginBottom: 14 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
          </svg>
          <p style={{ margin: 0, fontSize: 12, color: '#92400E', fontWeight: 700, lineHeight: 1.5 }}>
            Tes clients ne savent pas encore où te trouver.
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, marginTop: 3 }}>
              L’adresse de ton inscription sert uniquement à valider ton dossier :
              elle n’est jamais montrée à tes clients. Indique ci-dessous où ils
              viennent te trouver. Tant qu’il n’y a rien, ta fiche n’affiche
              aucune adresse.
            </span>
          </p>
        </div>
      )}

      {/* ─── UNE SEULE ADRESSE, et seulement quand le commerce ne bouge pas ──
          ⚠️ En mode mobile, ce bloc est MASQUÉ. Une adresse valable tous les
          jours et un planning qui dit où l'on est chaque jour se contredisent,
          et le commerçant n'a aucun moyen de savoir laquelle sa fiche retient.
          C'est le « IDEM ? » d'Alex, et il n'avait pas de réponse. */}
      {!mobile && (<>
      <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mon adresse</p>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: T.muted, lineHeight: 1.45 }}>
        {permanents.length === 0
          ? 'Ta fiche utilise l’adresse de ton inscription. Tu peux en indiquer une autre ici.'
          : 'Cette adresse remplace celle de ton inscription sur ta fiche.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {permanents.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1px solid ${T.hairline}`, padding: '8px 12px' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.libelle}{e.principal ? ' · principal' : ''}
              </span>
              <span style={{ display: 'block', fontSize: 11.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.adresse}
              </span>
            </span>
            <button onClick={() => supprimer(e.id)} style={{ ...btnMini, color: '#DC2626', borderColor: '#FCA5A5', flexShrink: 0 }}>Retirer</button>
          </div>
        ))}
        {/* ⚠️ UNE SEULE, PAS DEUX. Le formulaire disparaît dès qu'une adresse
            est posée : deux adresses permanentes rouvriraient exactement
            l'ambiguïté qu'on vient de fermer. Pour deux endroits, il faut
            répondre « je change d'endroit » au-dessus. */}
        {permanents.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRadius: 10, border: `1px dashed ${T.pale}`, padding: '10px 12px' }}>
            <input style={field} placeholder="Nom du lieu (ex : Salle Saint-Roch)" value={perm.libelle}
              onChange={e => setPerm(p => ({ ...p, libelle: e.target.value }))}/>
            <ChampAdresse style={field} valeur={perm.adresse} position={perm}
              placeholder="Adresse complète (pour l’itinéraire)"
              couleurs={{ hairline: T.hairline, deep: T.deep, muted: T.muted }}
              onTexte={v => setPerm(p => ({ ...p, adresse: v, latitude: null, longitude: null }))}
              onChoisir={({ adresse, latitude, longitude }) => setPerm(p => ({ ...p, adresse, latitude, longitude }))}/>
            <button onClick={ajouterPermanent} style={{ ...btnMini, alignSelf: 'flex-start' }}>Utiliser cette adresse</button>
          </div>
        )}
      </div>
      </>)}

      {/* ─── TOUT CE QUI SUIT NE CONCERNE QUE LES COMMERCES QUI BOUGENT ────── */}
      {mobile && (<>

      {/* ⚠️ UNE ADRESSE FIXE RESTÉE D'AVANT NE DOIT PAS DEVENIR INVISIBLE.
          En masquant le bloc des adresses fixes en mode mobile, j'ai créé un
          cas où un lieu ACTIF continuait d'alimenter la fiche sans que son
          propriétaire puisse le voir ni le retirer. C'est le cas de Centre
          Respire, qui porte une « Salle Respire » permanente en plus de son
          planning. On ne propose pas d'en ajouter, mais on montre ce qui
          existe, et on permet de le retirer. */}
      {permanents.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Adresse fixe déclarée</p>
          <p style={{ margin: '0 0 8px', fontSize: 11, color: T.muted, lineHeight: 1.45 }}>
            Valable tous les jours, en plus de ton planning. Retire-la si tu ne
            reçois personne à cet endroit.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {permanents.map(e => (
              <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1px solid ${T.hairline}`, padding: '8px 12px' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.libelle}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.adresse}</span>
                </span>
                <button onClick={() => supprimer(e.id)} style={{ ...btnMini, color: '#DC2626', borderColor: '#FCA5A5', flexShrink: 0 }}>Retirer</button>
              </div>
            ))}
          </div>
        </div>
      )}


      {/* Tournée hebdo type */}
      <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mon planning</p>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: T.muted, lineHeight: 1.45 }}>Se répète chaque semaine, aux mêmes jours.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {JOURS_FT.map((jour, idx) => {
          // ⚠️ UNE LISTE, PAS UN LIEU. Un food truck sert le midi sur une place
          // et le soir dans un zoning : le jour porte les deux.
          const duJour = hebdoParJour[jour] || []
          const enEdition = formHebdo?.jour === jour
          const labels = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
          return (
            <div key={jour} style={{ borderRadius: 10, border: `1px solid ${T.hairline}`, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, width: 74, flexShrink: 0 }}>{labels[idx]}</span>
                {duJour.length === 0 && !enEdition && (
                  <button style={{ ...btnMini, marginLeft: 'auto' }}
                    onClick={() => setFormHebdo({ jour, libelle: '', adresse: '', latitude: null, longitude: null, heure_debut: '', heure_fin: '' })}>+ Ajouter</button>
                )}
                {duJour.length > 0 && !enEdition && (
                  <button style={{ ...btnMini, marginLeft: 'auto' }}
                    onClick={() => setFormHebdo({ jour, libelle: '', adresse: '', latitude: null, longitude: null, heure_debut: '', heure_fin: '' })}>+ Autre moment</button>
                )}
              </div>

              {duJour.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, paddingLeft: 82 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.deep, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.libelle}{fmtHeures(e) ? ` · ${fmtHeures(e)}` : ''}
                    {!e.latitude && (
                      <span title="Sans position, ce lieu n’apparaît pas dans les distances" style={{ color: '#D97706', fontWeight: 800 }}> ·&nbsp;position manquante</span>
                    )}
                  </span>
                  <button style={btnMini} onClick={() => setFormHebdo({
                    id: e.id, jour, libelle: e.libelle, adresse: e.adresse,
                    latitude: e.latitude, longitude: e.longitude,
                    heure_debut: (e.heure_debut || '').slice(0, 5), heure_fin: (e.heure_fin || '').slice(0, 5),
                  })}>Modifier</button>
                  <button onClick={() => supprimer(e.id)} aria-label={`Retirer ${e.libelle}`}
                    style={{ width: 24, height: 24, borderRadius: 100, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 12, fontWeight: 800, flexShrink: 0, padding: 0 }}>✕</button>
                </div>
              ))}

              {duJour.length > 1 && (
                <p style={{ margin: '6px 0 0', paddingLeft: 82, fontSize: 11, color: T.muted, lineHeight: 1.45 }}>
                  Plusieurs moments ce jour-là : les heures décident où tes clients te trouvent.
                </p>
              )}

              {/* ⚠️ DUPLIQUER CE JOUR (demande d'Alex, 16/08). Même geste et même
                  vocabulaire que la grille des horaires fixes : deux endroits
                  qui font la même chose doivent la faire pareil. */}
              {duJour.length > 0 && !enEdition && (
                copieDepuis === jour ? (
                  <div style={{ marginTop: 8, paddingLeft: 82 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, color: T.muted, lineHeight: 1.45 }}>
                      Copier {duJour.length > 1 ? `les ${duJour.length} moments` : 'cet emplacement'} sur :
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                      {JOURS_FT.filter(j => j !== jour).map(j => {
                        const coche = copieVers.includes(j)
                        return (
                          <button key={j}
                            onClick={() => setCopieVers(p => coche ? p.filter(x => x !== j) : [...p, j])}
                            style={{ padding: '4px 10px', borderRadius: 100, cursor: 'pointer', fontSize: 11, fontWeight: 800,
                              fontFamily: '"DM Sans", sans-serif', textTransform: 'capitalize',
                              border: `1.5px solid ${coche ? T.main : T.hairline}`,
                              background: coche ? T.pale : '#fff', color: coche ? T.main : T.muted }}>
                            {j.slice(0, 3)}
                          </button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={dupliquerJour}
                        style={{ flex: 1, padding: '6px 10px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 11.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                        Copier
                      </button>
                      <button onClick={() => { setCopieDepuis(null); setCopieVers([]) }}
                        style={{ ...btnMini, flex: 1 }}>Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setCopieDepuis(jour); setCopieVers([]) }}
                    style={{ marginTop: 6, marginLeft: 82, padding: '3px 10px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 800, fontSize: 10.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    ⧉ Dupliquer sur d&rsquo;autres jours
                  </button>
                )
              )}

              {enEdition && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  <input style={field} placeholder="Nom du lieu" value={formHebdo.libelle} onChange={ev => setFormHebdo(p => ({ ...p, libelle: ev.target.value }))}/>
                  <ChampAdresse style={field} valeur={formHebdo.adresse} position={formHebdo}
                    placeholder="Adresse complète"
                    couleurs={{ hairline: T.hairline, deep: T.deep, muted: T.muted }}
                    onTexte={v => setFormHebdo(p => ({ ...p, adresse: v, latitude: null, longitude: null }))}
                    onChoisir={({ adresse, latitude, longitude }) => setFormHebdo(p => ({ ...p, adresse, latitude, longitude }))}/>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="time" style={{ ...field, flex: 1 }} value={formHebdo.heure_debut} onChange={ev => setFormHebdo(p => ({ ...p, heure_debut: ev.target.value }))}/>
                    <span style={{ fontSize: 12, color: T.muted }}>→</span>
                    <input type="time" style={{ ...field, flex: 1 }} value={formHebdo.heure_fin} onChange={ev => setFormHebdo(p => ({ ...p, heure_fin: ev.target.value }))}/>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={saveHebdo} style={{ flex: 1, padding: '8px 12px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>Enregistrer</button>
                    <button onClick={() => setFormHebdo(null)} style={{ ...btnMini, flex: 1 }}>Annuler</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ─── L'INTERRUPTEUR ──────────────────────────────────────────────────
          ⚠️ DÉCOCHÉ PAR DÉFAUT, et il ne s'affiche qu'à qui a déclaré au moins
          un emplacement variable. Une boulangerie ne verra jamais cette case :
          poser la question « tes horaires changent-ils selon l'endroit ? » à
          qui n'a qu'une adresse, c'est inventer un doute qui n'existe pas. */}
      {emps.some(e => e.type === 'hebdo' || e.type === 'ponctuel') && (
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', background: planningParLieu ? T.pale : '#fff', border: `1.5px solid ${planningParLieu ? T.main : T.hairline}`, borderRadius: 12, padding: '11px 13px', margin: '0 0 14px' }}>
          <input type="checkbox" checked={planningParLieu}
            onChange={e => basculerPlanningParLieu(e.target.checked)}
            style={{ width: 17, height: 17, accentColor: T.main, marginTop: 1, flexShrink: 0, cursor: 'pointer' }}/>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: T.deep, lineHeight: 1.45 }}>
            Mes horaires changent selon l’endroit où je suis
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, color: T.muted, marginTop: 3 }}>
              Coche si tes créneaux de commande ou de rendez-vous ne sont pas les mêmes
              d’un emplacement à l’autre. Sinon, laisse décoché : tes horaires valent
              pour tout ton commerce, et tu n’as rien à régler emplacement par emplacement.
            </span>
          </span>
        </label>
      )}

      {/* ─── Lieux du jour ───────────────────────────────────────────────────
          Pour qui change d'endroit : food truck, cours donnés dans plusieurs
          salles, marchés. */}
      {/* Ce bloc ne se range pas par durée comme les trois autres : c'est un
          GESTE, celui d'annoncer sa position du jour en deux champs et un
          bouton. On le nomme donc pour ce qu'il fait. */}
      <p style={{ margin: '14px 0 2px', fontSize: 12, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        Emplacement exceptionnel
      </p>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: T.muted, lineHeight: 1.45 }}>
        Remplace ton planning un jour donné, sans y toucher. Pour aujourd’hui,
        c’est ici ; pour un jour à venir, c’est juste en dessous.
      </p>

      {/* Aujourd'hui : état + déclaration rapide */}
      <div style={{ background: T.pale, borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: T.deep }}>
          {effectifsAuj.length === 0
            ? 'Aucun emplacement annoncé aujourd’hui : ta fiche affiche « Prochain emplacement annoncé bientôt ».'
            : <>Aujourd’hui : {effectifsAuj.map(e => `${e.libelle}${fmtHeures(e) ? ` · ${fmtHeures(e)}` : ''}`).join(' puis ')}
              {effectifAuj?.type === 'hebdo' ? ' (tournée habituelle)' : ''}</>}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input style={field} placeholder="Nom du lieu (ex : Place du Marché)" value={auj.libelle}
            onChange={e => setAuj(p => ({ ...p, libelle: e.target.value }))}/>
          <ChampAdresse style={field} valeur={auj.adresse} position={auj}
            placeholder="Adresse complète (pour l’itinéraire)"
            couleurs={{ hairline: T.hairline, deep: T.deep, muted: T.muted }}
            onTexte={v => setAuj(p => ({ ...p, adresse: v, latitude: null, longitude: null }))}
            onChoisir={({ adresse, latitude, longitude }) => setAuj(p => ({ ...p, adresse, latitude, longitude }))}/>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="time" style={{ ...field, flex: 1 }} value={auj.heure_debut} onChange={e => setAuj(p => ({ ...p, heure_debut: e.target.value }))}/>
            <span style={{ fontSize: 12, color: T.muted }}>→</span>
            <input type="time" style={{ ...field, flex: 1 }} value={auj.heure_fin} onChange={e => setAuj(p => ({ ...p, heure_fin: e.target.value }))}/>
          </div>
          <button onClick={declarerAujourdhui}
            style={{ padding: '10px 14px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            {ponctuelAuj ? 'Remplacer l’emplacement du jour' : 'Je suis ici aujourd’hui'}
          </button>
        </div>
      </div>

      {/* Ponctuels à venir (marchés, événements) */}
      <p style={{ margin: '0 0 2px', fontSize: 12, fontWeight: 800, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px' }}>À venir</p>
      <p style={{ margin: '0 0 8px', fontSize: 11, color: T.muted, lineHeight: 1.45 }}>Un marché, un salon, un stage : annonce-le à l’avance.</p>
      {futurs.length === 0 && !showFutur && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: T.muted }}>Aucune pour l’instant. Un marché, un salon, un stage : annonce-le à l’avance.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
        {futurs.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 10, border: `1px solid ${T.hairline}`, padding: '8px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.main, flexShrink: 0 }}>
              {new Date(e.date_jour + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: T.deep, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.libelle}{fmtHeures(e) ? ` · ${fmtHeures(e)}` : ''}
            </span>
            <button onClick={() => supprimer(e.id)} aria-label="Supprimer cet emplacement"
              style={{ width: 24, height: 24, borderRadius: 100, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 12, fontWeight: 800, flexShrink: 0, padding: 0 }}>✕</button>
          </div>
        ))}
      </div>
      {showFutur ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input type="date" min={todayISO} style={field} value={futur.date_jour} onChange={e => setFutur(p => ({ ...p, date_jour: e.target.value }))}/>
          <input style={field} placeholder="Nom du lieu (ex : Marché de Mettet)" value={futur.libelle} onChange={e => setFutur(p => ({ ...p, libelle: e.target.value }))}/>
          <ChampAdresse style={field} valeur={futur.adresse} position={futur}
            placeholder="Adresse complète"
            couleurs={{ hairline: T.hairline, deep: T.deep, muted: T.muted }}
            onTexte={v => setFutur(p => ({ ...p, adresse: v, latitude: null, longitude: null }))}
            onChoisir={({ adresse, latitude, longitude }) => setFutur(p => ({ ...p, adresse, latitude, longitude }))}/>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="time" style={{ ...field, flex: 1 }} value={futur.heure_debut} onChange={e => setFutur(p => ({ ...p, heure_debut: e.target.value }))}/>
            <span style={{ fontSize: 12, color: T.muted }}>→</span>
            <input type="time" style={{ ...field, flex: 1 }} value={futur.heure_fin} onChange={e => setFutur(p => ({ ...p, heure_fin: e.target.value }))}/>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={ajouterFutur} style={{ flex: 1, padding: '8px 12px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>Planifier</button>
            <button onClick={() => setShowFutur(false)} style={{ ...btnMini, flex: 1 }}>Annuler</button>
          </div>
        </div>
      ) : (
        <button style={btnMini} onClick={() => setShowFutur(true)}>+ Planifier un emplacement</button>
      )}
      </>)}
    </div>
  )
}

// ⚠️ LES QUATRE SUJETS DE L'ONGLET PROFIL. Il en empilait autant sur un seul
// écran de 647 lignes, et le commerçant y descendait en scrollant à travers
// tout, sans repère. Chaque intitulé dit ce qu'on y règle, jamais comment
// c'est rangé en base : « Mes lieux » ne parlait à personne.
// ─── LA QUESTION QUI COMMANDE TOUT ──────────────────────────────────────────
//
// ⚠️ UNE SEULE QUESTION, ET ELLE DÉCIDE DE CE QUI S'AFFICHE ENSUITE. Avant, le
// commerçant remplissait ses horaires d'ouverture PUIS ses emplacements avec
// leurs heures, sans que rien ne dise lequel faisait foi. Deux saisies pour une
// seule réalité, donc une contradiction qui n'attendait que d'arriver.
//
// Répondre « oui » laisse l'écran d'hier, celui de l'immense majorité : une
// adresse, des horaires par jour. Répondre « non » retire la grille, parce que
// ce sont alors les emplacements qui portent les heures.
//
// ⚠️ La colonne s'appelle `siege_social_est_lieu_activite` et son défaut est
// `true` : un commerçant déjà inscrit répond donc « oui » sans avoir rien fait,
// et ne voit aucune différence.
function ChoixLieuUnique({ commercantId, valeur, onChange, toast }) {
  const [enregistre, setEnregistre] = useState(false)

  useEffect(() => {
    if (valeur !== null) return
    let annule = false
    supabase.from('commercants').select('siege_social_est_lieu_activite').eq('id', commercantId).maybeSingle()
      .then(({ data }) => { if (!annule) onChange(data?.siege_social_est_lieu_activite !== false) })
    return () => { annule = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lecture unique au montage
  }, [commercantId])

  async function repondre(memeEndroit) {
    onChange(memeEndroit)
    setEnregistre(true)

    // ⚠️ RÉPONDRE « JE CHANGE D'ENDROIT » NE SUFFISAIT PAS, ET C'EST CE QUI
    // RENDAIT UNE JOURNÉE ENTIÈRE INRÉSERVABLE (défaut trouvé par Alex le
    // 16/08). La colonne basculait, mais `horaires_detail` gardait la grille
    // d'avant. Or elle ne sert pas qu'à l'affichage : `genererJoursDispos` la
    // lit pour savoir quels jours proposer. Une professeure qui donnait cours
    // le lundi ET le mardi voyait donc son mardi grisé côté client, parce que
    // sa vieille grille disait « mardi : fermé ». Aucune erreur, aucun
    // avertissement, et personne ne pouvait réserver ce jour-là.
    //
    // La déduction existait, mais elle n'avait lieu qu'au chargement de cette
    // section : elle ne se déclenchait donc jamais au moment où la réponse
    // change, c'est-à-dire exactement quand elle est nécessaire.
    const patch = { siege_social_est_lieu_activite: memeEndroit }
    if (!memeEndroit) {
      const { data: lieux } = await supabase.from('commercant_lieux')
        .select('*').eq('commercant_id', commercantId)
      patch.horaires_detail = horairesDepuisLieux(lieux || [])
    }

    const { error } = await supabase.from('commercants').update(patch).eq('id', commercantId)
    setEnregistre(false)
    if (error) { onChange(!memeEndroit); toast(`Erreur : ${error.message}`, 'error'); return }
    toast(memeEndroit
      ? 'Tes horaires valent pour toute la semaine, à ton adresse'
      : 'Ce sont tes emplacements qui donnent tes horaires')
  }

  if (valeur === null) return null

  const choix = [
    { val: true,  titre: 'Toujours au même endroit',
      sous: 'Une adresse, des horaires par jour. C’est le cas d’un salon, d’une boulangerie, d’un cabinet.' },
    { val: false, titre: 'Je change d’endroit',
      sous: 'Food truck, cours donnés dans plusieurs salles, marchés. Ce sont tes emplacements qui donnent tes horaires.' },
  ]

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ margin: '0 0 4px', fontSize: 13.5, fontWeight: 800, color: T.ink }}>
        Où tes clients te trouvent-ils ?
      </p>
      <p style={{ margin: '0 0 10px', fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
        Ta réponse décide de ce que tu as à remplir ensuite. Tu peux en changer quand tu veux.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {choix.map(c => {
          const actif = valeur === c.val
          return (
            <button key={String(c.val)} onClick={() => repondre(c.val)} disabled={enregistre}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, textAlign: 'left', width: '100%',
                padding: '11px 13px', borderRadius: 12, cursor: enregistre ? 'wait' : 'pointer',
                border: `1.5px solid ${actif ? T.main : T.hairline}`, background: actif ? T.pale : '#fff',
                fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box' }}>
              <span style={{ width: 17, height: 17, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                border: `2px solid ${actif ? T.main : T.hairline}`, background: actif ? T.main : '#fff',
                boxShadow: actif ? `inset 0 0 0 3px #fff` : 'none' }}/>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: T.deep }}>{c.titre}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: T.muted, marginTop: 2, lineHeight: 1.45 }}>{c.sous}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const SOUS_ONGLETS_PROFIL = [
  { id: 'fiche',    label: 'Ma fiche' },
  { id: 'contact',  label: 'Mes coordonnées' },
  { id: 'lieux',    label: 'Où me trouver' },
  { id: 'reglages', label: 'Réglages' },
]

function TabProfil({ commercantId, toast, onSaved, surModifications }) {
  const [form, setForm] = useState(null)
  // ⚠️ L'ÉTAT TEL QU'IL EST EN BASE, figé au chargement et re-figé après chaque
  // enregistrement. C'est LUI qui permet de dire si quelque chose a changé, et
  // c'est lui que « Ignorer » restitue. Sans cette copie, on ne saurait
  // comparer qu'à du vide, et « Ignorer » ne pourrait rien rendre.
  const [initial, setInitial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sousOnglet, setSousOnglet] = useState('fiche')
  // ⚠️ `null` tant qu'on ne sait pas : afficher la grille des horaires puis la
  // retirer une seconde plus tard ferait clignoter l'écran, et un commerçant
  // qui commence à saisir verrait son champ disparaître sous ses doigts.
  const [siegeEstLeLieu, setSiegeEstLeLieu] = useState(null)
  // Duplication d'horaires : jour source ouvert + jours cibles cochés
  const [copieSource, setCopieSource] = useState(null)
  const [copieCibles, setCopieCibles] = useState([])
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  // Photos de la fiche (couverture + galerie max 4), table commercant_photos.
  // Même mécanique que l'étape Visuels du signup : le commerçant doit pouvoir
  // enrichir sa fiche APRÈS l'inscription sans repasser par le signup.
  const [couvertureUrl, setCouvertureUrl] = useState(null)
  const [galerie, setGalerie] = useState([])
  const [uploadingCouv, setUploadingCouv] = useState(false)
  const [uploadingGal, setUploadingGal] = useState(false)
  // Dix photos en tout : la principale (couverture) plus neuf. Le carrousel
  // « Mon commerce en images » est devenu le seul endroit où les photos vivent,
  // le haut de fiche portant désormais une bannière au nom du commerce.
  const MAX_GALERIE = MAX_PHOTOS - 1
  // Les conseils de prise de vue changent selon le métier : « recule-toi, prends
  // l'enseigne » ne veut rien dire pour un camion, et « ton produit phare »
  // sonne creux chez un coiffeur.
  //
  // ⚠️ `form?.` ET PAS `form.` : ce calcul est écrit ICI, tout en haut, alors
  // que `form` démarre à `null` et n'est rempli que par `fetchProfil()`, dans un
  // effet qui ne tourne qu'APRÈS le premier rendu. Le garde de chargement, lui,
  // est 120 lignes plus bas. Écrit `form.categorie`, cette ligne lisait donc une
  // propriété de `null` au tout premier rendu et faisait TOMBER TOUT L'ONGLET
  // PROFIL sur une page blanche, pour tous les commerçants sans exception.
  // Invisible au lint, invisible au build, invisible au banc : seul l'écran le
  // disait. Même famille que la zone morte temporelle du 09/08.
  const metierFiche = metierPhotos({ categorie: form?.categorie, type: form?.type })

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchProfil(); fetchPhotos() }, [commercantId])

  async function fetchPhotos() {
    const { data } = await supabase.from('commercant_photos')
      .select('id, url, type, ordre').eq('commercant_id', commercantId).order('ordre')
    const couv = (data || []).find(p => p.type === 'couverture')
    setCouvertureUrl(couv?.url || null)
    setGalerie((data || []).filter(p => p.type === 'galerie' && p.url))
  }

  async function uploadCouverture(file) {
    if (!file || !file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo brut)', 'error'); return }
    setUploadingCouv(true)
    const compressed = await compresserImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 })
    const fileName = `cover-${commercantId}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { toast('Erreur upload photo', 'error'); setUploadingCouv(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    // Une seule couverture : on remplace l'entrée existante.
    await supabase.from('commercant_photos').delete().eq('commercant_id', commercantId).eq('type', 'couverture')
    const { error } = await supabase.from('commercant_photos').insert({ commercant_id: commercantId, type: 'couverture', url: urlData.publicUrl, ordre: 0 })
    if (error) { toast(`Erreur : ${error.message}`, 'error'); setUploadingCouv(false); return }
    setCouvertureUrl(urlData.publicUrl)
    toast('Couverture mise à jour'); setUploadingCouv(false)
  }

  async function uploadGalerie(file) {
    if (galerie.length >= MAX_GALERIE) { toast(`Maximum ${MAX_GALERIE} photos`, 'error'); return }
    if (!file || !file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo brut)', 'error'); return }
    setUploadingGal(true)
    const compressed = await compresserImage(file, { maxWidth: 1600, maxHeight: 1200, quality: 0.85 })
    const fileName = `gal-${commercantId}-${Date.now()}.jpg`
    const { error: upErr } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { toast('Erreur upload photo', 'error'); setUploadingGal(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    const ordreSuivant = galerie.length > 0 ? Math.max(...galerie.map(p => p.ordre || 0)) + 1 : 1
    const { data: row, error } = await supabase.from('commercant_photos')
      .insert({ commercant_id: commercantId, type: 'galerie', url: urlData.publicUrl, ordre: ordreSuivant }).select().single()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); setUploadingGal(false); return }
    setGalerie(prev => [...prev, row])
    toast('Photo ajoutée'); setUploadingGal(false)
  }

  // Change une photo de place. On réécrit TOUTES les positions plutôt que
  // d'échanger deux valeurs : deux photos ayant hérité du même `ordre` par le
  // passé rendraient l'affichage imprévisible, et cette renumérotation les
  // répare au premier déplacement.
  async function reordonnerGalerie(index, direction) {
    const suivant = deplacerPhoto(galerie, index, direction)
    if (suivant === galerie) return
    setGalerie(suivant)
    // L'ordre 0 est réservé à la couverture : la galerie commence à 1.
    await Promise.all(suivant.map((p, i) =>
      supabase.from('commercant_photos').update({ ordre: i + 1 }).eq('id', p.id)
    ))
  }

  async function supprimerPhotoGalerie(photo) {
    const { error } = await supabase.from('commercant_photos').delete().eq('id', photo.id)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    try {
      const objectName = (photo.url || '').split('/').pop()
      if (objectName) await supabase.storage.from('logos').remove([objectName])
    } catch { /* nettoyage best effort */ }
    setGalerie(prev => prev.filter(p => p.id !== photo.id))
    toast('Photo supprimée')
  }

  async function fetchProfil() {
    setLoading(true)
    const { data } = await supabase.from('commercants').select('*').eq('id', commercantId).single()
    if (data) {
      const defaultHoraires = { lundi:{ ouvert: true, debut: '07:00', fin: '14:00' }, mardi: { ouvert: true, debut: '07:00', fin: '14:00' }, mercredi: { ouvert: true, debut: '07:00', fin: '14:00' }, jeudi: { ouvert: true, debut: '07:00', fin: '14:00' }, vendredi: { ouvert: true, debut: '07:00', fin: '14:00' }, samedi: { ouvert: true, debut: '07:00', fin: '13:00' }, dimanche: { ouvert: false, debut: '07:00', fin: '12:00' } }
      const profil = { nom: data.nom || '', type: data.type || '', email: data.email || '', telephone: data.telephone || '', adresse: data.adresse || '', site_web: data.site_web || '', description: data.description || '',
        // ⚠️ CE CHAMP ÉTAIT ENREGISTRÉ SANS JAMAIS ÊTRE CHARGÉ. La sauvegarde
        // écrit `(form.infos_pratiques || '').trim() || null` : absent du
        // formulaire, il partait donc à `null` à CHAQUE enregistrement. Un
        // commerçant qui venait corriger son numéro de téléphone effaçait au
        // passage ses infos pratiques, qui s'affichent sur ses DEUX fiches et
        // dans l'email de confirmation de rendez-vous. Rien ne le prévenait.
        infos_pratiques: data.infos_pratiques || '',
        horaires: data.horaires || '', horaires_detail: data.horaires_detail || defaultHoraires, categorie: data.categorie || 'alimentaire', livraison_actif: !!data.livraison_actif, fidelite_actif: !!data.fidelite_actif, plan: data.plan || 'exister', notif_mode: data.notif_mode || 'recap_jour', rdv_actif: !!data.rdv_actif, photos_catalogue_actif: data.photos_catalogue_actif !== false, boutique_mode_vente: data.boutique_mode_vente || 'retrait', boutique_retrait_paiement: data.boutique_retrait_paiement || 'en_ligne', boutique_frais_port: data.boutique_frais_port ?? '', boutique_gratuit_des: data.boutique_gratuit_des ?? '', boutique_delai_heures: data.boutique_delai_heures ?? 2 }
      setForm(profil)
      // ⚠️ LE MÊME OBJET DANS LES DEUX ÉTATS, ET C'EST VOULU. `setForm` ne
      // modifie jamais en place (toujours `{ ...p, … }`), donc la référence
      // gardée ici reste l'image fidèle de la base tant qu'on n'a pas
      // enregistré. C'est cette image que « Ignorer » restitue.
      setInitial(profil)
      setLogoPreview(data.logo_url || null)
    }
    setLoading(false)
  }

  async function uploadLogo(file) {
    if (!file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    // Compression client automatique (memoire feedback_zero_friction) : les
    // photos iPhone natives pesaient 3-5 Mo, le user devait redimensionner
    // manuellement. Compression 400x400 JPEG q=0.85 -> ~30-100 Ko.
    if (file.size > 15 * 1024 * 1024) { toast('Logo trop lourd (max 15 Mo brut)', 'error'); return }
    setUploadingLogo(true)
    const compressed = await compresserImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.85 })
    const fileName = `${commercantId}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (error) { toast('Erreur upload logo', 'error'); setUploadingLogo(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    await supabase.from('commercants').update({ logo_url: urlData.publicUrl }).eq('id', commercantId)
    setLogoPreview(urlData.publicUrl)
    toast('Logo mis à jour'); setUploadingLogo(false)
  }

  async function supprimerLogo() {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer ton logo ?', message: 'Ta fiche reprendra le logo provisoire en attendant.', action: 'Oui, supprimer le logo' }))) return
    await supabase.from('commercants').update({ logo_url: null }).eq('id', commercantId)
    setLogoPreview(null); toast('Logo supprimé')
  }

  // ⚠️ CETTE FONCTION REND DÉSORMAIS true OU false. Elle ne rendait rien, et la
  // barre d'enregistrement comme la fenêtre de sortie ont besoin de savoir si
  // l'écriture a réussi : enchaîner sur le changement d'onglet après un refus de
  // validation ferait perdre exactement le travail qu'on prétend protéger.
  // Le bouton historique du sous-onglet Réglages ignore ce retour, il continue
  // de fonctionner à l'identique.
  async function saveProfil() {
    if (!form.nom.trim()) { toast('Le nom est obligatoire', 'error'); return false }
    setSaving(true)
    const { error } = await supabase.from('commercants').update({ nom: form.nom.trim(), type: form.type.trim(), telephone: form.telephone.trim() || null, adresse: form.adresse.trim() || null, site_web: (form.site_web || '').trim() || null, description: form.description.trim() || null, infos_pratiques: (form.infos_pratiques || '').trim() || null, horaires: form.horaires.trim() || null, horaires_detail: form.horaires_detail, livraison_actif: !!form.livraison_actif, rdv_actif: !!form.rdv_actif, notif_mode: form.notif_mode || 'recap_jour', photos_catalogue_actif: !!form.photos_catalogue_actif, boutique_mode_vente: form.boutique_mode_vente || 'retrait', boutique_retrait_paiement: form.boutique_retrait_paiement || 'en_ligne', boutique_frais_port: parseFloat(form.boutique_frais_port) || 0, boutique_gratuit_des: (form.boutique_gratuit_des === '' || form.boutique_gratuit_des == null) ? null : parseFloat(form.boutique_gratuit_des), boutique_delai_heures: Math.max(0, parseInt(form.boutique_delai_heures, 10) || 0) }).eq('id', commercantId)
    setSaving(false)
    if (error) {
      console.error('[ConfigDashboard.saveProfil]', error)
      toast(`Erreur enregistrement : ${error.message}`, 'error')
      return false
    }
    // Ce qui est en base devient la nouvelle référence : la barre disparaît.
    setInitial(form)
    toast('Profil mis à jour')
    // Rafraîchit le commerçant parent : les onglets conditionnels (ex. Livraison
    // via livraison_actif) apparaissent/disparaissent sans reload manuel.
    onSaved?.()
    return true
  }

  // ─── Le garde-fou des modifications non enregistrées ─────────────────────
  // ⚠️ CE SOUS-ONGLET N'AVAIT AUCUN BOUTON D'ENREGISTREMENT. `saveProfil`
  // n'était appelée QUE depuis « Réglages », le quatrième sous-onglet : tout ce
  // qu'un commerçant saisissait dans « Ma fiche » ou « Mes coordonnées »
  // n'avait littéralement aucun moyen d'être enregistré depuis l'écran où il
  // se trouvait, et repartait avec lui en changeant d'onglet. C'est le défaut
  // relevé par Alex le 15/08.
  const champsModifiesProfil = champsModifies(initial, form)
  const nbModifsProfil = champsModifiesProfil.length
  useAvertirAvantDeQuitter(nbModifsProfil > 0)

  // Les actions vivent dans une référence rafraîchie à CHAQUE rendu : le parent
  // garde la référence, jamais la fonction. Sans ça il rappellerait une
  // fermeture périmée et enregistrerait le formulaire tel qu'il était trois
  // frappes plus tôt.
  const actionsProfil = useRef({})
  actionsProfil.current = {
    enregistrer: saveProfil,
    // ⚠️ « Ignorer » ne touche PAS aux photos, au logo ni aux lieux : ils
    // s'écrivent immédiatement en base, chacun par son propre bouton, et n'ont
    // jamais été en attente d'enregistrement. Restituer `initial` ne défait que
    // ce qui est réellement en attente.
    ignorer: () => { setForm(initial); toast('Modifications abandonnées') },
  }
  useEffect(() => {
    surModifications?.({ modifie: nbModifsProfil > 0, nb: nbModifsProfil, saving, actions: actionsProfil })
    return () => surModifications?.(null)
  }, [surModifications, nbModifsProfil, saving])

  if (loading || !form) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      <h2 style={s.h2}>Profil du commerce</h2>

      {/* ─── LES QUATRE SOUS-ONGLETS ─────────────────────────────────────────
          ⚠️ CET ECRAN FAISAIT 647 LIGNES ET MELANGEAIT QUATRE SUJETS SANS
          RAPPORT : ce que le client voit, comment te joindre, ou et quand tu
          travailles, et des reglages de fonctionnement. On y descendait en
          scrollant a travers tout, sans repere. Releve par Alex le 13/08.
          Le decoupage suit celui des onglets Boutique et Rendez-vous, qui ont
          deja leurs sous-onglets : on ne cree pas une facon de naviguer de
          plus. */}
      <BandeDefilante libelle="les sections du profil"
        style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 16, border: `1px solid ${T.hairline}`, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {SOUS_ONGLETS_PROFIL.map(o => (
          <button key={o.id} onClick={() => setSousOnglet(o.id)}
            style={{ flex: '1 0 auto', padding: '9px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', transition: 'all 0.2s', background: sousOnglet === o.id ? T.bgPanel : 'transparent', color: sousOnglet === o.id ? '#fff' : T.muted }}>
            {o.label}
          </button>
        ))}
      </BandeDefilante>

      {/* ─── MA FICHE : tout ce que le client voit de toi ─────────────────── */}
      {sousOnglet === 'fiche' && (<>
      {/* Badge catégorie — lecture seule. Pour changer, contacter support. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 8px', borderRadius: 100, background: T.pale, border: `1px solid ${T.main}33`, marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          {form.categorie === 'vitrine' ? <Scissors size={14} strokeWidth={1.8}/>
            : form.categorie === 'detail' ? <Package size={14} strokeWidth={1.8}/>
            : <Croissant size={14} strokeWidth={1.8}/>}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.bgPanel, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {form.categorie === 'vitrine' ? 'Service · Présence + RDV' : form.categorie === 'detail' ? 'Détail · Boutique' : 'Alimentaire · Click & Collect'}
        </span>
      </div>

      {/* Logo */}
      <div style={s.card}>
        <label style={s.label}>Logo</label>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Format carré conseillé · JPG ou PNG · compressé automatiquement</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 88, height: 88, borderRadius: 14, background: T.pale, border: `2px dashed ${logoPreview ? T.main : T.light}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoPreview ? <img decoding="async" loading="lazy" src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <Store size={28} strokeWidth={1.6} color={T.muted}/>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ ...s.btn, ...s.btnPrimary, cursor: uploadingLogo ? 'wait' : 'pointer' }}>
              {uploadingLogo ? 'Upload…' : <><Camera size={14} strokeWidth={1.8} style={{ marginRight: 5, display: 'inline', verticalAlign: 'text-bottom' }}/>Choisir un logo</>}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) uploadLogo(e.target.files[0]) }} disabled={uploadingLogo} />
            </label>
            {logoPreview && <button style={{ ...s.btn, ...s.btnDanger, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={supprimerLogo}><Trash2 size={13} strokeWidth={1.8}/> Supprimer</button>}
          </div>
        </div>
      </div>

      {/* Photos de la fiche : la principale + neuf autres, ordonnées.
          Le haut de fiche ne montre plus de photo depuis le 05/08 : celles-ci
          sont donc les SEULES images de la fiche, d'où le guide. */}
      <div style={s.card}>
        <label style={s.label}>Mon commerce en images</label>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>
          Jusqu&rsquo;à {MAX_PHOTOS} photos, qui défilent dans l&rsquo;ordre sur ta page.
          L&rsquo;ordre compte : on regarde rarement plus loin que la troisième.
        </p>
        {(() => {
          const etat = etatGalerie((couvertureUrl ? 1 : 0) + galerie.length)
          return (
            <p style={{ fontSize: 12, fontWeight: 700, color: etat.ton === 'vide' ? '#B45309' : T.main, marginBottom: 14, lineHeight: 1.5 }}>
              {etat.message}
            </p>
          )
        })()}

        {/* Photo principale = position 1 du guide. Elle reste la vignette qui
            représente le commerce dans les listes, d'où son statut à part. */}
        <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>
          Photo 1 · {conseilPhoto(1, metierFiche).titre}
        </p>
        <p style={{ fontSize: 11.5, color: T.muted, margin: '0 0 8px', lineHeight: 1.5 }}>{conseilPhoto(1, metierFiche).aide}</p>
        <label style={{ display: 'block', width: '100%', maxWidth: 420, aspectRatio: '16/9', borderRadius: 14, border: `2px dashed ${couvertureUrl ? T.main : T.light}`, background: T.pale, overflow: 'hidden', cursor: uploadingCouv ? 'wait' : 'pointer', position: 'relative' }}>
          {couvertureUrl ? (
            <img decoding="async" loading="lazy" src={couvertureUrl} alt="Couverture" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          ) : (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: T.muted, fontSize: 12, fontWeight: 700 }}>
              <Camera size={22} strokeWidth={1.8} color={T.main}/>
              {uploadingCouv ? 'Upload…' : 'Ajouter la couverture'}
            </span>
          )}
          {couvertureUrl && uploadingCouv && (
            <span style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: T.bgPanel }}>Upload…</span>
          )}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) uploadCouverture(e.target.files[0]); e.target.value = '' }} disabled={uploadingCouv}/>
        </label>
        <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Format paysage 16:9 idéal. Clique pour {couvertureUrl ? 'remplacer' : 'ajouter'}. Compressée automatiquement.</p>

        {/* Les suivantes, dans l'ordre où elles défileront. Chacune porte le
            conseil de SA place : « ajoute des photos » ne dit rien, « celle-ci
            c'est ton intérieur » se comprend et se fait. */}
        <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '18px 0 8px' }}>
          Les suivantes ({galerie.length + (couvertureUrl ? 1 : 0)}/{MAX_PHOTOS})
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {galerie.map((p, i) => {
            const conseil = conseilPhoto(i + 2, metierFiche)
            return (
              <div key={p.id} style={{ display: 'flex', gap: 12, alignItems: 'center', background: T.bg, borderRadius: 12, padding: 8 }}>
                <div style={{ width: 96, aspectRatio: '4/3', borderRadius: 10, overflow: 'hidden', position: 'relative', border: `1px solid ${T.hairline}`, flexShrink: 0 }}>
                  <img decoding="async" loading="lazy" src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: T.ink, margin: '0 0 2px' }}>
                    Photo {i + 2} · {conseil.titre}
                  </p>
                  <p style={{ fontSize: 11, color: T.muted, margin: 0, lineHeight: 1.45 }}>{conseil.aide}</p>
                </div>
                {/* Flèches plutôt que glisser-déposer : sur un téléphone, au
                    comptoir, une flèche se vise et ne rate pas. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                  <button type="button" onClick={() => reordonnerGalerie(i, 'avant')} disabled={i === 0} title="Monter"
                    style={{ width: 28, height: 24, borderRadius: 7, border: `1px solid ${T.hairline}`, background: '#fff', color: i === 0 ? T.hairline : T.deep, cursor: i === 0 ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="chevU" size={13} color={i === 0 ? T.hairline : T.deep}/>
                  </button>
                  <button type="button" onClick={() => reordonnerGalerie(i, 'apres')} disabled={i === galerie.length - 1} title="Descendre"
                    style={{ width: 28, height: 24, borderRadius: 7, border: `1px solid ${T.hairline}`, background: '#fff', color: i === galerie.length - 1 ? T.hairline : T.deep, cursor: i === galerie.length - 1 ? 'default' : 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="chevD" size={13} color={i === galerie.length - 1 ? T.hairline : T.deep}/>
                  </button>
                </div>
                <button type="button" onClick={() => supprimerPhotoGalerie(p)} title="Supprimer"
                  style={{ width: 28, height: 28, borderRadius: 100, border: `1px solid #FCA5A5`, background: '#fff', color: '#DC2626', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
              </div>
            )
          })}
          {galerie.length < MAX_GALERIE && (
            <label style={{ display: 'flex', gap: 12, alignItems: 'center', borderRadius: 12, border: `2px dashed ${T.light}`, background: '#FAFAFA', padding: 10, cursor: uploadingGal ? 'wait' : 'pointer' }}>
              <span style={{ width: 96, aspectRatio: '4/3', borderRadius: 10, background: T.pale, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Camera size={18} strokeWidth={1.8} color={T.main}/>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 2 }}>
                  {uploadingGal ? 'Envoi en cours…' : `Ajouter la photo ${galerie.length + 2} · ${conseilPhoto(galerie.length + 2, metierFiche).titre}`}
                </span>
                <span style={{ display: 'block', fontSize: 11, color: T.muted, lineHeight: 1.45 }}>
                  {conseilPhoto(galerie.length + 2, metierFiche).aide}
                </span>
              </span>
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) uploadGalerie(e.target.files[0]); e.target.value = '' }} disabled={uploadingGal}/>
            </label>
          )}
        </div>
        <p style={{ fontSize: 10, color: T.muted, marginTop: 8 }}>Tous les ratios acceptés, compression automatique. Les conseils sont là pour aider, pas pour contraindre.</p>
      </div>

      <div style={s.card}>
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={s.label}>Nom *</label>
            <Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex: Boulangerie Dupont"/>
          </div>
          <div>
            <label style={s.label}>Type de commerce</label>
            <SelecteurTypes categorie={form.categorie} value={form.type} onChange={v => setForm(p => ({ ...p, type: v }))}/>
          </div>
          <div>
            <label style={s.label}>Description (visible clients)</label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Décrivez votre commerce..." />
          </div>
          <div>
            <label style={s.label}>Infos pratiques (visible clients)</label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 6, lineHeight: 1.5 }}>
              Politique d&rsquo;annulation, modes de paiement acceptés, consignes... Affichées sur ta fiche et dans l&rsquo;email de confirmation de RDV.
            </p>
            <Textarea value={form.infos_pratiques || ''} onChange={e => setForm(p => ({ ...p, infos_pratiques: e.target.value }))}
              placeholder={'Ex : Paiement en liquide ou QR code.\nToute annulation moins de 24h avant le RDV sera facturée.'} />
          </div>
        </div>
      </div>
      </>)}

      {/* ─── MES COORDONNEES : comment on te joint ────────────────────────── */}
      {sousOnglet === 'contact' && (
      <div style={s.card}>
        <div style={{ display: 'grid', gap: 14 }}>
          {[
            { label: 'Email', key: 'email', placeholder: '', type: 'email', disabled: true, hint: 'Non modifiable, contact support' },
            { label: 'Téléphone', key: 'telephone', placeholder: '+32 470 00 00 00', type: 'tel' },
            { label: 'Adresse', key: 'adresse', placeholder: 'Rue de la Paix 12, 1000 Bruxelles' },
            // Le site est demandé à l'inscription, mais un commerçant déjà
            // inscrit ne repasse jamais par là : sans ce champ, il n'aurait
            // aucun moyen de le renseigner.
            { label: 'Site web', key: 'site_web', placeholder: 'www.mon-commerce.be', type: 'url', hint: 'Facultatif. Sert à l’assistant de rédaction quand tu écris ta présentation.' },
          ].map(f => (
            <div key={f.key}>
              <label style={s.label}>{f.label}</label>
              <Input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} type={f.type || 'text'} disabled={f.disabled} style={f.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}} />
              {f.hint && <p style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{f.hint}</p>}
            </div>
          ))}
        </div>
      </div>
      )}

      {/* ─── OU ET QUAND : l'endroit et les heures, jamais les deux fois ───
          ⚠️ DEUX ECRANS DISAIENT LA MEME CHOSE SANS SE PARLER. Un food truck
          qui declare « mardi, Place du Marche, 11h-14h » devait EN PLUS
          remplir « mardi 07:00 → 18:30 » ici, et rien ne disait lequel
          faisait foi. La grille ne s'affiche donc que pour qui ne bouge pas ;
          les autres la voient DEDUITE de leurs emplacements. */}
      {sousOnglet === 'lieux' && (<>
      <div style={s.card}>
        <ChoixLieuUnique commercantId={commercantId} valeur={siegeEstLeLieu} onChange={setSiegeEstLeLieu} toast={toast}/>
        {siegeEstLeLieu !== false && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div>
            <label style={s.label}>Horaires d'ouverture</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].map((jour, idx) => {
                const labels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
                const h = form.horaires_detail?.[jour] || { ouvert: false, debut: '07:00', fin: '14:00' }
                const setJour = (patch) => setForm(p => ({ ...p, horaires_detail: { ...p.horaires_detail, [jour]: { ...h, ...patch } } }))
                const aPause = !!(h.debut2 || h.fin2)
                return (
                  <div key={jour} style={{ padding: '8px 12px', borderRadius: 10, background: h.ouvert ? T.pale : '#F9FAFB', border: `1.5px solid ${h.ouvert ? T.light : '#E5E7EB'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={() => setJour({ ouvert: !h.ouvert })}
                        style={{ width: 36, height: 20, borderRadius: 100, background: h.ouvert ? T.main : '#D1D5DB', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 2, left: h.ouvert ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}/>
                      </button>
                      <span style={{ fontSize: 13, fontWeight: 700, color: h.ouvert ? T.ink : T.muted, width: 76, flexShrink: 0 }}>{labels[idx]}</span>
                      {h.ouvert ? (
                        <>
                          <Input type="time" value={h.debut} onChange={e => setJour({ debut: e.target.value })} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' }} />
                          <span style={{ fontSize: 13, color: T.muted, flexShrink: 0 }}>→</span>
                          <Input type="time" value={h.fin} onChange={e => setJour({ fin: e.target.value })} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' }} />
                          {!aPause && (
                            <button onClick={() => setJour({ debut2: '18:00', fin2: '22:00' })} title="Ajouter une 2e plage (ex : service du soir)"
                              style={{ ...s.btn, ...s.btnGhost, padding: '3px 8px', fontSize: 10.5, fontWeight: 800, flexShrink: 0, whiteSpace: 'nowrap' }}>
                              + pause
                            </button>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>Fermé</span>
                      )}
                    </div>
                    {/* 2e plage (horaires à pause : ex. 11:00-14:00 puis 18:00-22:00) */}
                    {h.ouvert && aPause && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <span style={{ width: 36, flexShrink: 0 }}/>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, width: 76, flexShrink: 0 }}>puis</span>
                        <Input type="time" value={h.debut2 || ''} onChange={e => setJour({ debut2: e.target.value })} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' }} />
                        <span style={{ fontSize: 13, color: T.muted, flexShrink: 0 }}>→</span>
                        <Input type="time" value={h.fin2 || ''} onChange={e => setJour({ fin2: e.target.value })} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' }} />
                        <button onClick={() => setJour({ debut2: null, fin2: null })} title="Retirer la 2e plage"
                          style={{ width: 22, height: 22, borderRadius: 100, border: 'none', background: '#FEE2E2', color: '#DC2626', cursor: 'pointer', fontSize: 12, fontWeight: 800, flexShrink: 0, lineHeight: '22px', padding: 0 }}>
                          ✕
                        </button>
                      </div>
                    )}
                    {/* Dupliquer ces horaires (plages 1 ET 2) vers d'autres jours */}
                    {h.ouvert && (
                      copieSource === jour ? (
                        <div style={{ marginTop: 8, background: '#fff', borderRadius: 10, padding: '8px 10px' }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: T.deep, margin: '0 0 6px' }}>Copier les horaires de {labels[idx]} vers :</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].filter(j => j !== jour).map(j => {
                              const coche = copieCibles.includes(j)
                              const lbl = j.charAt(0).toUpperCase() + j.slice(1)
                              return (
                                <button key={j} onClick={() => setCopieCibles(prev => coche ? prev.filter(x => x !== j) : [...prev, j])}
                                  style={{ padding: '4px 10px', borderRadius: 100, border: `1.5px solid ${coche ? T.main : T.hairline}`, background: coche ? T.main : '#fff', color: coche ? '#fff' : T.muted, fontWeight: 800, fontSize: 11, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                                  {lbl}
                                </button>
                              )
                            })}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => {
                              if (copieCibles.length === 0) { toast('Choisis au moins un jour', 'error'); return }
                              setForm(p => {
                                const hd = { ...p.horaires_detail }
                                copieCibles.forEach(j => { hd[j] = { ...h, ouvert: true } })
                                return { ...p, horaires_detail: hd }
                              })
                              toast(`Horaires copiés sur ${copieCibles.length} jour${copieCibles.length > 1 ? 's' : ''} (pense à Enregistrer)`)
                              setCopieSource(null); setCopieCibles([])
                            }}
                              style={{ flex: 1, padding: '6px 10px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 11.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                              Appliquer
                            </button>
                            <button onClick={() => { setCopieSource(null); setCopieCibles([]) }}
                              style={{ flex: 1, padding: '6px 10px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 800, fontSize: 11.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setCopieSource(jour); setCopieCibles([]) }}
                          style={{ marginTop: 6, padding: '3px 10px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 800, fontSize: 10.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                          ⧉ Dupliquer sur d&rsquo;autres jours
                        </button>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          {/* ⚠️ « OUVERTURE DES RÉSERVATIONS » A ÉTÉ RETIRÉ D'ICI. Ce champ
              fixait l'heure à laquelle le lendemain devenait réservable, 21h
              par défaut : une boulangerie dont le dernier créneau tombait à 11h
              passait dix heures à afficher « Résa dès 21:00 » à ses clients,
              alors qu'elle pouvait parfaitement prendre la commande.
              Deux réglages le remplacent, chacun sur sa vraie question :
              l'HORIZON dit jusqu'à quel jour on peut réserver, la CLÔTURE de
              chaque créneau dit jusqu'à quelle heure. Les deux vivent dans
              l'onglet Créneaux. La colonne reste en base, plus rien ne la lit. */}
        </div>
        )}
      </div>

        {/* ─── MES LIEUX : plus réservé aux food trucks ─────────────────────
            ⚠️ Cette section était conditionnée à `estFoodTruck(form.type)`, et
            c'est ce qui la rendait invisible à une professeure de yoga qui donne
            cours dans deux salles. Elle décrivait pourtant déjà exactement son
            besoin : un lieu par jour, avec des exceptions. Deux métiers sans
            rapport, le même besoin.
            Elle s'affiche donc pour tout le monde : chacun y déclare ses lieux
            fixes, et ceux qui bougent y posent leur tournée. */}
        {/* ⚠️ LA MÊME QUESTION COMMANDE LES DEUX. `siegeEstLeLieu` pilote déjà
            la grille d'horaires ci-dessus ; elle pilote maintenant aussi ce que
            cette section propose, sinon le commerçant lit deux réponses à la
            même question sans savoir laquelle sa fiche retiendra. */}
        <SectionLieux commercantId={commercantId} toast={toast} mobile={siegeEstLeLieu === false}/>
      </>)}

      {/* ─── REGLAGES : le fonctionnement, pas la vitrine ─────────────────── */}
      {sousOnglet === 'reglages' && (
      <div style={s.card}>
        {/* ─── Ouverture des réservations ─────────────────────────────────
            ⚠️ Cet interrupteur N'EXISTAIT NULLE PART. `rdv_actif` ne s'écrivait
            que depuis /admin : un commerçant ne pouvait ni ouvrir sa prise de
            RDV, ni la refermer pendant ses congés.
            L'ouverture se fait normalement depuis la bannière de l'onglet
            Prise de RDV, qui vérifie qu'il y a bien une prestation et un
            créneau. Ici, c'est l'interrupteur de tous les jours : on referme
            avant de partir, on rouvre en rentrant. */}
        {form.categorie === 'vitrine' && canDo(form.plan, 'rdv') && (
          <div style={{ marginBottom: 18, paddingBottom: 16, borderBottom: `1px solid ${T.pale}` }}>
            <p style={{ ...s.label, marginBottom: 10 }}>Prise de rendez-vous</p>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${form.rdv_actif ? T.main : T.pale}`, background: form.rdv_actif ? T.pale : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={!!form.rdv_actif} onChange={e => setForm(p => ({ ...p, rdv_actif: e.target.checked }))} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px' }}>Mes clients peuvent réserver en ligne</p>
                <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                  Décoche pendant tes congés : ta fiche reste visible, mais elle invite tes clients à t&rsquo;appeler plutôt qu&rsquo;à réserver.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* ─── Notifications RDV ou Commandes ─── */}
        {/* Toggle unique notif_mode (chaque/recap_jour/aucun) qui s'applique aux RDV
            pour les vitrines ET aux commandes C&C pour les alimentaires Vendre.
            Label adapte selon categorie (un commercant n'est jamais les deux). */}
        {((form.categorie === 'vitrine' && form.rdv_actif) || (form.categorie === 'alimentaire' && canDo(form.plan, 'commande'))) && (() => {
          const estVitrine = form.categorie === 'vitrine'
          const noun = estVitrine ? 'RDV' : 'commandes'
          const nounSing = estVitrine ? 'RDV' : 'commande'
          return (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
              <p style={{ ...s.label, marginBottom: 6 }}>Notifications {noun} par email</p>
              <p style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
                Comment veux-tu être prévenu(e) des nouvelles {noun} en plus du dashboard ?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { val: 'chaque',     Icon: Zap,           label: `À chaque nouvelle ${nounSing.toLowerCase() === 'rdv' ? 'demande' : nounSing}`, desc: `Email instantané à chaque ${nounSing.toLowerCase() === 'rdv' ? 'réservation' : 'commande'}. Idéal si tu n'ouvres pas ton tableau de bord souvent.` },
                  { val: 'recap_jour', Icon: ClipboardList, label: 'Récap quotidien (8h)',           desc: `Un seul email chaque matin avec tous tes ${noun} de la journée. Moins intrusif.` },
                  { val: 'aucun',      Icon: BellOff,       label: 'Aucun email',                    desc: 'Tu consultes uniquement ton tableau de bord. Aucun email automatique.' },
                ].map(opt => {
                  const actif = form.notif_mode === opt.val
                  return (
                    <label key={opt.val}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${actif ? T.main : T.pale}`, background: actif ? T.pale : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <input type="radio" name="notif_mode" checked={actif}
                        onChange={() => setForm(p => ({ ...p, notif_mode: opt.val }))}
                        style={{ width: 16, height: 16, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><opt.Icon size={14} strokeWidth={1.8}/> {opt.label}</p>
                        <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>{opt.desc}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* ─── Toggles Vendre (alimentaire uniquement) ─── */}
        {/* Les commerçants Vendre alim peuvent choisir d'activer/désactiver
            certaines features (livraison, fidelite). La pill client reflete l'etat. */}
        {canDo(form.plan, 'commande') && form.categorie === 'alimentaire' && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
            <p style={{ ...s.label, marginBottom: 12 }}>Fonctionnalités activables (plan Vendre)</p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${form.livraison_actif ? T.main : T.pale}`, background: form.livraison_actif ? T.pale : '#fff', cursor: 'pointer', marginBottom: 10, transition: 'all 0.15s' }}>
              <input type="checkbox" checked={!!form.livraison_actif} onChange={e => setForm(p => ({ ...p, livraison_actif: e.target.checked }))} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Bike size={15} strokeWidth={1.8}/> Activer la livraison</p>
                <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                  Affiche la pill « LIVRAISON » sur ta fiche. Configuration complète (zone, frais, créneaux) à venir.
                </p>
              </div>
            </label>

            {/* L'ancien toggle « fidélité » vivait ici : la fidélité se pilote
                désormais UNIQUEMENT depuis l'onglet Fidélité (B.6, 31/07),
                double commande retirée pour éviter les écrasements. */}
          </div>
        )}

        {/* ─── Mode de vente boutique (détail + vitrine depuis le 31/07 : les
            services vendent leurs produits au salon avec la même machine) ─── */}
        {(form.categorie === 'detail' || form.categorie === 'vitrine') && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
            <p style={{ ...s.label, marginBottom: 6 }}>{form.categorie === 'vitrine' ? 'Mode de vente de tes produits' : 'Mode de vente de la boutique'}</p>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>Comment tes clients récupèrent leurs achats.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {[
                { val: 'retrait', label: form.categorie === 'vitrine' ? 'Retrait sur place' : 'Retrait en magasin', desc: 'Le client vient chercher sa commande.' },
                { val: 'expedition', label: 'Expédition', desc: 'Envoi par colis à domicile.' },
                { val: 'les_deux', label: 'Les deux', desc: 'Le client choisit au moment de payer.' },
              ].map(opt => {
                const actif = form.boutique_mode_vente === opt.val
                return (
                  <label key={opt.val} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${actif ? T.main : T.pale}`, background: actif ? T.pale : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <input type="radio" name="boutique_mode_vente" checked={actif} onChange={() => setForm(p => ({ ...p, boutique_mode_vente: opt.val }))} style={{ width: 16, height: 16, accentColor: T.main, marginTop: 2, cursor: 'pointer' }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px' }}>{opt.label}</p>
                      <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>{opt.desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>

            {(form.boutique_mode_vente === 'retrait' || form.boutique_mode_vente === 'les_deux') && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ ...s.label, marginBottom: 4 }}>{form.categorie === 'vitrine' ? 'Paiement du retrait sur place' : 'Paiement du retrait en magasin'}</p>
                <p style={{ fontSize: 11, color: T.muted, marginBottom: 8, lineHeight: 1.5 }}>
                  Comment tes clients paient quand ils viennent chercher leur commande.
                  {form.boutique_mode_vente === 'les_deux' ? " L'expédition, elle, est toujours payée en ligne à la commande." : ''}
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ val: 'en_ligne', label: 'En ligne, à la commande' }, { val: 'magasin', label: 'Au comptoir, au retrait' }].map(opt => {
                    const sel = form.boutique_retrait_paiement === opt.val
                    return (
                      <button key={opt.val} type="button" onClick={() => setForm(p => ({ ...p, boutique_retrait_paiement: opt.val }))}
                        style={{ flex: 1, padding: '9px 10px', borderRadius: 10, border: `1.5px solid ${sel ? T.main : T.hairline}`, background: sel ? T.main : '#fff', color: sel ? '#fff' : T.muted, fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ─── Délai de préparation ────────────────────────────────────
                ⚠️ CE RÉGLAGE N'EXISTAIT PAS, et c'est ce qui empêchait de
                proposer honnêtement un retrait le jour même. Tous les délais de
                Yoppaa étaient attachés aux créneaux ; une boutique n'en a pas,
                donc aucun ne s'appliquait à elle. Le client voyait « à récupérer
                dès aujourd'hui » et pouvait se présenter dans la demi-heure. */}
            {(form.boutique_mode_vente === 'retrait' || form.boutique_mode_vente === 'les_deux') && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ ...s.label, marginBottom: 4 }}>Délai de préparation</p>
                <p style={{ fontSize: 11, color: T.muted, marginBottom: 8, lineHeight: 1.5 }}>
                  Le temps qu&rsquo;il te faut pour préparer une commande. Le retrait du jour même
                  n&rsquo;est proposé que s&rsquo;il te reste ce délai avant ta fermeture.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button type="button" style={{ ...s.btn, ...s.btnGhost, padding: '4px 10px' }}
                    onClick={() => setForm(p => ({ ...p, boutique_delai_heures: Math.max(0, Number(p.boutique_delai_heures ?? 2) - 1) }))}>−</button>
                  <Input type="number" min={0} value={form.boutique_delai_heures ?? 2}
                    onChange={e => setForm(p => ({ ...p, boutique_delai_heures: e.target.value }))}
                    style={{ width: 70, textAlign: 'center' }} />
                  <button type="button" style={{ ...s.btn, ...s.btnGhost, padding: '4px 10px' }}
                    onClick={() => setForm(p => ({ ...p, boutique_delai_heures: Number(p.boutique_delai_heures ?? 2) + 1 }))}>+</button>
                  <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>heures</span>
                </div>
                <p style={{ fontSize: 11, color: T.main, marginTop: 6, fontWeight: 600, lineHeight: 1.5 }}>
                  À zéro, le retrait du jour même reste proposé jusqu&rsquo;à ta fermeture.
                  Dans tous les cas, c&rsquo;est <strong>toi</strong> qui confirmes : le client est prévenu
                  quand tu marques sa commande prête, et on lui dit de ne pas se déplacer avant.
                </p>
              </div>
            )}

            {form.boutique_mode_vente === 'expedition' && (
              <div style={{ marginBottom: 12, background: T.pale, borderRadius: 10, padding: '9px 12px' }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: T.deep, margin: 0, lineHeight: 1.5 }}>
                  Paiement : toujours en ligne à la commande (on n&rsquo;expédie jamais sans paiement).
                </p>
              </div>
            )}

            {(form.boutique_mode_vente === 'expedition' || form.boutique_mode_vente === 'les_deux') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label style={s.label}>Frais de port (€)</label><Input type="number" min="0" step="0.10" value={form.boutique_frais_port} onChange={e => setForm(p => ({ ...p, boutique_frais_port: e.target.value }))} placeholder="4.90"/></div>
                <div><label style={s.label}>Offert dès (€)</label><Input type="number" min="0" step="1" value={form.boutique_gratuit_des} onChange={e => setForm(p => ({ ...p, boutique_gratuit_des: e.target.value }))} placeholder="50 (option)"/></div>
              </div>
            )}
            <p style={{ fontSize: 10, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
              Expédition : tu saisiras le numéro de suivi à la main une fois le colis parti. Zone desservie : toute la Belgique pour le lancement.
            </p>
          </div>
        )}

        {/* ─── Affichage (toutes catégories) ─── */}
        <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
          <p style={{ ...s.label, marginBottom: 12 }}>Affichage</p>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${form.photos_catalogue_actif ? T.main : T.pale}`, background: form.photos_catalogue_actif ? T.pale : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
            <input type="checkbox" checked={!!form.photos_catalogue_actif} onChange={e => setForm(p => ({ ...p, photos_catalogue_actif: e.target.checked }))} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Camera size={15} strokeWidth={1.8}/> Afficher les photos du catalogue</p>
              <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                Montre les photos de tes articles sur ta fiche. Décoche si tu préfères une présentation sans photos.
              </p>
            </div>
          </label>
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
          <button style={{ ...s.btn, ...s.btnPrimary, padding: '11px 24px', fontSize: 14 }} onClick={saveProfil} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
      )}

      <div style={{ ...s.card, background: T.pale, boxShadow: 'none', border: 'none' }}>
        <p style={{ fontSize: 12, color: T.main, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Lightbulb size={13} strokeWidth={1.8}/> URL client : yoppaa.app/commander</p>
      </div>

      <QRCodeSection commercantId={commercantId} toast={toast} />
    </div>
  )
}

// ─── Onglet Accompagnement et matériel ───────────────────────────────────────
// L'accompagnement sur place et le matériel ne se choisissaient qu'à l'étape 5
// de l'inscription. Celui qui passait à côté n'avait plus aucun moyen de le
// demander, alors que la page d'inscription promettait déjà « tu pourras
// commander à tout moment depuis ton tableau de bord ». C'est cet écran.
// Rien n'est débité : la demande crée une ligne success_packs en attente et
// nous rappelons le commerçant.
function TabAccompagnement({ commercantId, commercant, toast }) {
  const [choix, setChoix] = useState(() => new Set())
  const [message, setMessage] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [demandes, setDemandes] = useState([])

  const fetchDemandes = useCallback(async () => {
    const { data } = await supabase
      .from('success_packs')
      .select('id, type, statut, montant_ht, created_at')
      .eq('commercant_id', commercantId)
      .order('created_at', { ascending: false })
      .limit(10)
    setDemandes(data || [])
  }, [commercantId])
  useEffect(() => { fetchDemandes() }, [fetchDemandes])

  const { principaux, secondaires } = classerProduitsParCategorie(commercant?.categorie || 'detail')
  const total = Math.round([...choix].reduce((t, type) => t + (produitParType(type)?.prix || 0), 0) * 100) / 100

  function basculer(type) {
    setChoix(prev => {
      const n = new Set(prev)
      if (n.has(type)) n.delete(type); else n.add(type)
      return n
    })
  }

  // Paiement immédiat à la commande, sur le compte plateforme Yoppaa (comme les
  // packs SMS et les abonnements) : on redirige vers Stripe Checkout.
  async function commander() {
    if (envoi || choix.size === 0) return
    setEnvoi(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Session expirée, reconnecte-toi.', 'error'); setEnvoi(false); return }
      const r = await fetch('/api/accompagnement/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: commercantId, produits: [...choix], message }),
      })
      const j = await r.json()
      if (j?.ok && j.url) { window.location.href = j.url; return }
      toast(j?.error || 'Paiement indisponible pour le moment.', 'error')
    } catch {
      toast('Erreur réseau, réessaie.', 'error')
    }
    setEnvoi(false)
  }

  const statutBadge = (st) => ({
    paiement_en_attente: { txt: 'Paiement non finalisé', bg: '#F3F4F6', color: '#9CA3AF' },
    paye:       { txt: 'Payé, on te contacte',  bg: '#F0FDF4', color: '#10B981' },
    en_attente: { txt: 'En attente',             bg: '#FFF7ED', color: '#EA580C' },
    planifie:   { txt: 'Planifié',               bg: '#EEF2FF', color: '#4F46E5' },
    termine:    { txt: 'Terminé',                bg: '#F0FDF4', color: '#10B981' },
    annule:     { txt: 'Annulé',                 bg: '#F3F4F6', color: '#9CA3AF' },
  }[st] || { txt: st, bg: '#F3F4F6', color: '#6B7280' })

  const carteProduit = (p, secondaire = false) => {
    const actif = choix.has(p.type)
    return (
      <button key={p.type} type="button" onClick={() => basculer(p.type)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 10,
          background: actif ? '#FAF8FE' : '#fff',
          border: `1.5px solid ${actif ? T.main : T.hairline}`,
          borderRadius: 14, padding: '14px 16px', fontFamily: '"DM Sans", sans-serif',
          boxShadow: actif ? `0 4px 14px ${T.main}1F` : 'none',
        }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{
            flexShrink: 0, width: 20, height: 20, borderRadius: 6, marginTop: 1,
            border: `2px solid ${actif ? T.main : T.hairline}`,
            background: actif ? T.main : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {actif && <Icon name="check" size={12} color="#fff"/>}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: T.ink }}>{p.label}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: p.badgeColor, padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{p.badge}</span>
              <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 900, color: T.main, whiteSpace: 'nowrap' }}>
                {p.prix.toFixed(2).replace('.', ',')} €
                <span style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginLeft: 3 }}>HTVA</span>
              </span>
            </div>
            <p style={{ fontSize: 12, color: T.muted, margin: '6px 0 0', lineHeight: 1.55 }}>{p.desc}</p>
            {secondaire && p.mention && (
              <p style={{ fontSize: 11, color: '#B45309', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '6px 10px', margin: '8px 0 0', lineHeight: 1.5 }}>{p.mention}</p>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div>
      <div style={{ background: T.bgPanel, borderRadius: 14, padding: '18px 20px', marginBottom: 14, color: '#fff' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>Accompagnement et matériel</p>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>
          On peut venir t&rsquo;installer ça
        </h2>
        <p style={{ fontSize: 12, color: T.light, margin: '6px 0 0', lineHeight: 1.5, opacity: 0.9 }}>
          Yoppaa fonctionne sur ton téléphone, ta tablette ou ton ordinateur, sans rien acheter.
          Si tu veux un coup de main sur place ou du matériel de comptoir, c&rsquo;est ici.
        </p>
      </div>

      <div style={{ ...s.card, marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 4px' }}>Ce dont tu as besoin</p>
        <p style={{ fontSize: 11, color: T.muted, margin: '0 0 12px', lineHeight: 1.5 }}>
          Coche ce qui t&rsquo;intéresse, le paiement se fait en ligne à la commande. On te contacte
          ensuite sous 2 jours ouvrables : rendez-vous sur place pour l&rsquo;accompagnement, confirmation
          d&rsquo;expédition pour le matériel.
        </p>

        {principaux.map(p => carteProduit(p, false))}

        {secondaires.length > 0 && (
          <>
            <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '16px 0 8px' }}>Autres options</p>
            {secondaires.map(p => carteProduit(p, true))}
          </>
        )}

        <label style={{ ...s.label, marginTop: 6 }}>Une précision à nous donner ? (facultatif)</label>
        <Textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={400}
          placeholder="Tes disponibilités, une question, un besoin particulier…"
          style={{ minHeight: 70, fontSize: 13 }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={commander} disabled={envoi || choix.size === 0}>
            <Icon name="check" size={14}/> {envoi ? 'Redirection…' : 'Commander et payer'}
          </button>
          {choix.size > 0 && (
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
              Total : <strong style={{ color: T.ink }}>{total.toFixed(2).replace('.', ',')} € HTVA</strong>
              <span style={{ marginLeft: 6 }}>· TVA ajoutée au paiement</span>
            </p>
          )}
        </div>
      </div>

      {demandes.length > 0 && (
        <div style={s.card}>
          <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 10px' }}>Tes commandes</p>
          {demandes.map(d => {
            const b = statutBadge(d.statut)
            const p = produitParType(d.type)
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderTop: `1px solid ${T.hairline}`, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: 0 }}>{p?.label || d.type}</p>
                  <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0' }}>
                    Demandé le {new Date(d.created_at).toLocaleDateString('fr-BE')}
                    {d.montant_ht ? ` · ${Number(d.montant_ht).toFixed(2).replace('.', ',')} € HTVA` : ''}
                  </p>
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color: b.color, background: b.bg, padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{b.txt}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Composant QR Code imprimable ─────────────────────────────────────────────
function QRCodeSection({ commercantId, toast }) {
  const [slug, setSlug]           = useState(null)
  const [nomCommerce, setNomCommerce] = useState('')
  const [loading, setLoading]     = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [envoiKit, setEnvoiKit]   = useState(false)

  async function envoyerKit() {
    if (envoiKit) return
    setEnvoiKit(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Session expirée, reconnecte-toi.', 'error'); setEnvoiKit(false); return }
      const r = await fetch('/api/kit/envoyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: commercantId }),
      })
      const j = await r.json()
      toast(j?.ok ? `Kit envoyé à ${j.envoye_a} 🟣` : (j?.error || 'Envoi impossible'), j?.ok ? 'success' : 'error')
    } catch {
      toast('Erreur réseau, réessaie.', 'error')
    }
    setEnvoiKit(false)
  }

  // AVANT l'ouverture publique (1er août → 31 août), le QR ne doit pas envoyer
  // vers une fiche qui n'accepte pas encore de clients : il inscrit, et chaque
  // inscription est attribuée au commerçant (?ref=). À partir du 1er septembre
  // il pointe sur la fiche. Le commerçant ne réimprime rien : même affiche,
  // c'est la destination et le discours qui changent avant/après.
  const preLancement = avantLancement()
  const url = slug
    ? (preLancement ? `https://www.yoppaa.app/?ref=${slug}` : `https://www.yoppaa.app/commander/${slug}`)
    : null
  // L'affiche est lue par des gens qui ne connaissent pas encore Yoppaa :
  // `explication` dit en une ligne ce qu'ils gagnent à scanner. La date
  // d'ouverture est dérivée, jamais écrite en dur.
  const TXT_QR = preLancement
    ? {
        tagline: 'Scanne : tu sauras dès qu’on ouvre',
        accroche: `ON ARRIVE LE ${libelleLancement().toUpperCase()}`,
        explication: 'Commande, réserve et cumule tes points chez tes commerçants',
        pied: 'Inscris-toi sur yoppaa.app',
      }
    : {
        tagline: 'Commande en avance, passe en priorité',
        accroche: 'ICI ON EST YOPPERS',
        explication: 'Commande, réserve et cumule tes points chez tes commerçants',
        pied: 'Rejoins la tribu sur yoppaa.app',
      }

  useEffect(() => {
    async function fetchSlug() {
      setLoading(true)
      const { data } = await supabase.from('commercants').select('slug, nom').eq('id', commercantId).single()
      if (data) { setSlug(data.slug); setNomCommerce(data.nom || '') }
      setLoading(false)
    }
    fetchSlug()
  }, [commercantId])

  useEffect(() => {
    if (!url) return
    async function gen() {
      try {
        const QRCode = (await import('qrcode')).default
        const dataUrl = await QRCode.toDataURL(url, {
          width: 900, margin: 1,
          color: { dark: '#1A0840', light: '#FFFFFF' },
          errorCorrectionLevel: 'H',
        })
        setQrDataUrl(dataUrl)
      } catch (e) { toast('Erreur génération QR', 'error') }
    }
    gen()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [url])

  // ─── Canvas composé — style tribu hype ───────────────────────────────────
  async function buildCompositeCanvas() {
    const QR   = 820   // taille QR rendu dans le canvas
    const PAD  = 56
    const W    = QR + PAD * 2

    // Zones verticales
    const TOP_H    = 250  // wordmark tricolore + 5 dots V2-B + slogan + nom
    const QR_H     = QR + 32
    const MIDDLE_H = 80   // tagline sous QR
    const BOT_H    = 150  // accroche + ce que c'est + pied
    const H = TOP_H + QR_H + MIDDLE_H + BOT_H + PAD * 2

    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')

    // ── Fond dégradé ink ──
    const bg = ctx.createLinearGradient(0, 0, W * 0.3, H)
    bg.addColorStop(0,   '#160636')
    bg.addColorStop(0.45,'#2D0F6B')
    bg.addColorStop(1,   '#1A0840')
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

    // ── Halo décoratif derrière le QR ──
    const haloY = PAD + TOP_H + QR_H / 2
    const halo = ctx.createRadialGradient(W/2, haloY, 0, W/2, haloY, QR * 0.75)
    halo.addColorStop(0,   'rgba(107,53,196,0.22)')
    halo.addColorStop(0.6, 'rgba(107,53,196,0.06)')
    halo.addColorStop(1,   'rgba(0,0,0,0)')
    ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H)

    // ── Ligne déco top ──
    const lineGrad = ctx.createLinearGradient(0, 0, W, 0)
    lineGrad.addColorStop(0,   'rgba(196,160,244,0)')
    lineGrad.addColorStop(0.5, 'rgba(196,160,244,0.5)')
    lineGrad.addColorStop(1,   'rgba(196,160,244,0)')
    ctx.strokeStyle = lineGrad; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD, PAD + 2); ctx.lineTo(W - PAD, PAD + 2); ctx.stroke()

    // ── Wordmark tricolore « yoppaa » (fond foncé : blanc + light + mid) ──
    // fillText ne gère pas la couleur par segment : on dessine les trois
    // paires l'une après l'autre en mesurant, pour garder le tracking -0,05em.
    const WM = 80
    const wmFont = `800 ${WM}px "Plus Jakarta Sans", system-ui, Arial, sans-serif`
    ctx.textAlign = 'left'
    try { ctx.letterSpacing = `${-0.05 * WM}px` } catch { /* Safari < 17 */ }
    ctx.font = wmFont
    const segments = [['yo', '#FFFFFF'], ['pp', '#C4A0F4'], ['aa', '#9660E0']]
    const largeurWm = segments.reduce((w, [t]) => w + ctx.measureText(t).width, 0)
    let wx = W / 2 - largeurWm / 2
    const wmBaseline = PAD + 96
    for (const [txt, couleur] of segments) {
      ctx.fillStyle = couleur
      ctx.fillText(txt, wx, wmBaseline)
      wx += ctx.measureText(txt).width
    }
    try { ctx.letterSpacing = '0px' } catch { /* idem */ }

    // ── 5 dots V2-B (spec canonique : mini 0,55 · gap 0,55 · décalage 0,4) ──
    const dotBase = WM * 0.254
    const dotMini = dotBase * 0.55
    const dotGap  = dotBase * 0.55
    const dotOff  = dotBase * 0.4
    const dotsTop = PAD + 116
    const dots = [
      { d: dotBase, c: '#FFFFFF', o: 0 },
      { d: dotMini, c: '#C4A0F4', o: dotOff },
      { d: dotBase, c: '#C4A0F4', o: dotOff },
      { d: dotMini, c: '#9660E0', o: dotOff },
      { d: dotBase, c: '#9660E0', o: 0 },
    ]
    const largeurDots = dots.reduce((a, x) => a + x.d, 0) + dotGap * 4
    let dx = W / 2 - largeurDots / 2
    for (const p of dots) {
      const r = p.d / 2
      ctx.beginPath(); ctx.arc(dx + r, dotsTop + p.o + r, r, 0, Math.PI * 2)
      ctx.fillStyle = p.c; ctx.fill()
      dx += p.d + dotGap
    }

    // ── Slogan ──
    ctx.textAlign = 'center'
    ctx.font = `600 ${Math.round(WM * 0.236)}px "Plus Jakarta Sans", system-ui, Arial, sans-serif`
    ctx.fillStyle = '#C4A0F4'
    ctx.fillText('Ton quartier dans ta poche', W / 2, PAD + 176)

    // ── Séparateur subtil ──
    const sep = ctx.createLinearGradient(PAD * 2, 0, W - PAD * 2, 0)
    sep.addColorStop(0,   'rgba(196,160,244,0)')
    sep.addColorStop(0.5, 'rgba(196,160,244,0.3)')
    sep.addColorStop(1,   'rgba(196,160,244,0)')
    ctx.strokeStyle = sep; ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(PAD * 2, PAD + 196); ctx.lineTo(W - PAD * 2, PAD + 196); ctx.stroke()

    // ── Nom du commerce — bien visible ──
    ctx.font = '700 38px "DM Sans", Arial, sans-serif'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(nomCommerce, W / 2, PAD + 236)

    // ── Fond blanc arrondi pour QR ──
    const qrX = PAD; const qrY = PAD + TOP_H
    const qrSz = QR + 32
    const rr = 28
    ctx.fillStyle = '#FFFFFF'
    ctx.shadowColor = 'rgba(107,53,196,0.4)'
    ctx.shadowBlur = 40
    ctx.beginPath()
    ctx.moveTo(qrX + rr, qrY)
    ctx.lineTo(qrX + qrSz - rr, qrY)
    ctx.quadraticCurveTo(qrX + qrSz, qrY, qrX + qrSz, qrY + rr)
    ctx.lineTo(qrX + qrSz, qrY + qrSz - rr)
    ctx.quadraticCurveTo(qrX + qrSz, qrY + qrSz, qrX + qrSz - rr, qrY + qrSz)
    ctx.lineTo(qrX + rr, qrY + qrSz)
    ctx.quadraticCurveTo(qrX, qrY + qrSz, qrX, qrY + qrSz - rr)
    ctx.lineTo(qrX, qrY + rr)
    ctx.quadraticCurveTo(qrX, qrY, qrX + rr, qrY)
    ctx.closePath(); ctx.fill()
    ctx.shadowBlur = 0

    // ── QR image dans le fond blanc ──
    const qrImg = new window.Image()
    await new Promise(resolve => { qrImg.onload = resolve; qrImg.src = qrDataUrl })
    ctx.drawImage(qrImg, qrX + 16, qrY + 16, QR, QR)

    // ── "Commande en avance, passe en priorité" ──
    const midY = PAD + TOP_H + QR_H
    ctx.font = '600 30px "DM Sans", Arial, sans-serif'
    ctx.fillStyle = 'rgba(196,160,244,0.85)'
    ctx.fillText(TXT_QR.tagline, W / 2, midY + 46)

    // ── "ICI ON EST YOPPERS" — grande accroche ──
    const botY = PAD + TOP_H + QR_H + MIDDLE_H
    ctx.font = '900 52px "DM Sans", Arial, sans-serif'
    // Dégradé blanc → light sur le texte
    const txtGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
    txtGrad.addColorStop(0, '#FFFFFF')
    txtGrad.addColorStop(0.5, '#EDE0FF')
    txtGrad.addColorStop(1, '#C4A0F4')
    ctx.fillStyle = txtGrad
    ctx.fillText(TXT_QR.accroche, W / 2, botY + 50)

    // ── Ligne déco bottom ──
    ctx.strokeStyle = sep; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD, botY + 68); ctx.lineTo(W - PAD, botY + 68); ctx.stroke()

    // ── Ce que c'est, pour celui qui découvre l'affiche en vitrine ──
    ctx.font = '600 26px "DM Sans", Arial, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.fillText(TXT_QR.explication, W / 2, botY + 104)

    // ── "Rejoins la tribu — yoppaa.app" ──
    ctx.font = '500 24px "DM Sans", Arial, sans-serif'
    ctx.fillStyle = 'rgba(196,160,244,0.6)'
    ctx.fillText(TXT_QR.pied, W / 2, botY + 138)

    return canvas
  }

  // ─── HTML impression 1 page stricte ──────────────────────────────────────
  async function buildPrintHTML(format) {
    const canvas  = await buildCompositeCanvas()
    const imgUrl  = canvas.toDataURL('image/png')
    const isA4    = format === 'A4'
    const pw      = isA4 ? '210mm' : '148mm'
    const ph      = isA4 ? '297mm' : '210mm'
    const imgW    = isA4 ? '194mm' : '136mm'
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Yoppaa QR · ${nomCommerce}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{size:${format} portrait;margin:0;}
  html,body{width:${pw};height:${ph};overflow:hidden;background:#160636!important;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    display:flex;align-items:center;justify-content:center;}
  img{width:${imgW};height:auto;display:block;}
</style></head>
<body><img decoding="async" loading="lazy" src="${imgUrl}"/></body>
<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></html>`
  }

  async function printQR(format) {
    if (!qrDataUrl) return toast('QR pas encore prêt', 'error')
    const html = await buildPrintHTML(format)
    const win  = window.open('', '_blank')
    win.document.open(); win.document.write(html); win.document.close()
  }

  async function downloadPNG() {
    if (!qrDataUrl) return
    const canvas = await buildCompositeCanvas()
    const a = document.createElement('a')
    a.download = `yoppaa-qr-${slug}.png`
    a.href = canvas.toDataURL('image/png')
    a.click(); toast('PNG téléchargé')
  }

  async function downloadPDF(format) {
    if (!qrDataUrl) return
    try {
      const { jsPDF } = await import('jspdf')
      const canvas  = await buildCompositeCanvas()
      const imgData = canvas.toDataURL('image/png')
      const isA4    = format === 'A4'
      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: format.toLowerCase() })
      const W = pdf.internal.pageSize.getWidth()
      const H = pdf.internal.pageSize.getHeight()
      pdf.setFillColor(22, 6, 54); pdf.rect(0, 0, W, H, 'F')
      const imgW = isA4 ? 184 : 130
      const imgH = imgW * (canvas.height / canvas.width)
      pdf.addImage(imgData, 'PNG', (W - imgW) / 2, (H - imgH) / 2, imgW, imgH)
      pdf.save(`yoppaa-qr-${slug}-${format}.pdf`)
      toast(`PDF ${format} téléchargé`)
    } catch (e) { console.error(e); toast('Erreur PDF', 'error') }
  }

  if (loading) return null
  if (!slug) return (
    <div style={{ ...s.card, background: '#FEF3C7', border: '1.5px solid #F59E0B33', marginTop: 12 }}>
      <p style={{ fontSize: 13, color: '#92400E', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><AlertTriangle size={14} strokeWidth={1.8}/> Aucun slug, contacte le support.</p>
    </div>
  )

  return (
    <div style={{ ...s.card, marginTop: 12 }}>
      <h2 style={{ ...s.h2, marginBottom: 4 }}>QR Code</h2>
      <p style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Vitrine, sacs, flyers : partout !</p>

      {/* ── Preview tribu hype ── */}
      <div style={{ background: 'linear-gradient(160deg, #160636 0%, #2D0F6B 50%, #1A0840 100%)', borderRadius: 18, padding: '22px 20px 20px', textAlign: 'center', marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
        {/* Halo déco */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(107,53,196,0.2) 0%, transparent 70%)', pointerEvents: 'none' }}/>

        {/* 3 points */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 10, alignItems: 'center' }}>
          <div style={{ width: 8,  height: 8,  borderRadius: '50%', background: 'rgba(255,255,255,0.5)' }}/>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#C4A0F4', boxShadow: '0 0 12px rgba(196,160,244,0.6)' }}/>
          <div style={{ width: 8,  height: 8,  borderRadius: '50%', background: '#9660E0' }}/>
        </div>

        {/* yoppaa wordmark */}
        <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1.9rem', color: '#fff', letterSpacing: '-0.05em', lineHeight: 1, marginBottom: 2 }}>yoppaa</p>

        {/* Séparateur */}
        <div style={{ width: 40, height: 1, background: 'rgba(196,160,244,0.3)', margin: '8px auto' }}/>

        {/* Nom commerce */}
        <p style={{ fontSize: 15, fontWeight: 700, color: '#C4A0F4', marginBottom: 14, letterSpacing: '-0.3px' }}>{nomCommerce}</p>

        {/* QR */}
        {qrDataUrl
          ? <img decoding="async" loading="lazy" src={qrDataUrl} alt="QR Code" style={{ width: 196, height: 196, borderRadius: 12, display: 'block', margin: '0 auto', background: '#fff', padding: 8, boxShadow: '0 8px 32px rgba(107,53,196,0.5)' }}/>
          : <div style={{ width: 196, height: 196, background: '#2D0F6B', borderRadius: 12, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4A0F4', fontSize: 12 }}>Génération...</div>
        }

        {/* Tagline */}
        <p style={{ fontSize: 11, color: 'rgba(196,160,244,0.7)', marginTop: 10, marginBottom: 6 }}>{TXT_QR.tagline}</p>

        {/* Accroche tribu */}
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 900, fontSize: '1.05rem', color: '#fff', letterSpacing: '-0.3px', marginBottom: 4 }}>{TXT_QR.accroche} 🟣</p>

        {/* URL */}
        <p style={{ fontSize: 9, color: 'rgba(196,160,244,0.5)', marginTop: 2 }}>{TXT_QR.pied}</p>
      </div>

      {/* Rappel de phase : le commerçant doit comprendre POURQUOI son QR
          n'envoie pas encore sur sa fiche, sinon il croit à une erreur. */}
      {preLancement && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: '#78350F', fontWeight: 600, lineHeight: 1.55 }}>
            <strong>Avant le 1er septembre</strong>, ton QR inscrit tes clients et chaque inscription t&rsquo;est attribuée.
            Le jour du lancement, il ouvrira ta page : tu n&rsquo;as rien à réimprimer.
          </p>
        </div>
      )}

      {/* URL copiable */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.pale, borderRadius: 10, padding: '8px 12px', marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: T.main, flex: 1, wordBreak: 'break-all' }}>{url}</span>
        <button style={{ ...s.btn, ...s.btnGhost, padding: '4px 10px', fontSize: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}
          onClick={() => { navigator.clipboard.writeText(url); toast('URL copiée') }} aria-label="Copier l'URL"><Copy size={13} strokeWidth={1.8}/></button>
      </div>

      {/* PNG */}
      <button style={{ ...s.btn, ...s.btnGhost, width: '100%', justifyContent: 'center', marginBottom: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={downloadPNG} disabled={!qrDataUrl}>
        <Download size={14} strokeWidth={1.8}/> Télécharger PNG
      </button>

      {/* PDF */}
      <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PDF</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button style={{ ...s.btn, ...s.btnGhost, flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => downloadPDF('A5')} disabled={!qrDataUrl}><FileText size={13} strokeWidth={1.8}/> A5</button>
        <button style={{ ...s.btn, ...s.btnGhost, flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => downloadPDF('A4')} disabled={!qrDataUrl}><FileText size={13} strokeWidth={1.8}/> A4</button>
      </div>

      {/* Impression */}
      <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Impression</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button style={{ ...s.btn, ...s.btnPrimary, flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => printQR('A5')} disabled={!qrDataUrl}><Printer size={13} strokeWidth={1.8}/> A5</button>
        <button style={{ ...s.btn, ...s.btnPrimary, flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => printQR('A4')} disabled={!qrDataUrl}><Printer size={13} strokeWidth={1.8}/> A4</button>
      </div>

      {/* Kit complet : lien, messages prêts à coller, affichette. Le même
          contenu que l'email de bienvenue, consultable et renvoyable. */}
      <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 14 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mon kit de démarrage</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/kit/${slug}`} target="_blank" rel="noopener noreferrer"
            style={{ ...s.btn, ...s.btnGhost, flex: '1 1 150px', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
            <Eye size={13} strokeWidth={1.8}/> Ouvrir mon kit
          </a>
          <button style={{ ...s.btn, ...s.btnGhost, flex: '1 1 150px', justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }}
            onClick={envoyerKit} disabled={envoiKit}>
            <MessageCircle size={13} strokeWidth={1.8}/> {envoiKit ? 'Envoi…' : 'Me l’envoyer par email'}
          </button>
        </div>
        <p style={{ fontSize: 10, color: T.muted, marginTop: 6, lineHeight: 1.5 }}>
          Ton lien, tes messages prêts à coller et ton affichette de comptoir. Tu l&rsquo;as déjà reçu à ton inscription.
        </p>
      </div>
    </div>
  )
}



// ─── Onglet AVIS ──────────────────────────────────────────────────────────────
// ─── Onglet SIGNALEMENTS ─────────────────────────────────────────────────────
// Le commerçant voit les signalements de problèmes envoyés par les Yoppers et
// peut les marquer comme vus, traités ou ignorés. Au "traité", on lui rappelle
// gentiment de vérifier qu'il a bien corrigé l'info dans son profil.
const SIGN_TYPE_LABEL = {
  ferme:     'Fermé / disparu',
  horaires:  'Horaires incorrects',
  adresse:   'Adresse erronée',
  telephone: 'Téléphone faux',
  articles:  'Menu / articles KO',
  site_web:  'Site web cassé',
  doublon:   'Fiche en doublon',
  autre:     'Autre',
}
const SIGN_TYPE_ICON = {
  ferme:     Lock,
  horaires:  Clock,
  adresse:   MapPin,
  telephone: Phone,
  articles:  Package,
  site_web:  Globe,
  doublon:   Users,
  autre:     MessageCircle,
}

// ─── Onglet BONS CADEAUX (module 3, 31/07) ──────────────────────────────────
// Config (toggle + validité réglable) + pointage COMPTOIR (code → solde →
// débit d'un montant) + derniers bons vendus. Le commerçant ne voit que SES
// bons (RLS ownership) ; l'achat et l'activation passent par les API
// service_role (Stripe Checkout + webhook).
function TabBonsCadeaux({ commercantId, commercant, toast, onSaved, surModifications }) {
  const [actif, setActif] = useState(!!commercant?.bons_cadeaux_actif)
  const [validite, setValidite] = useState(String(commercant?.bons_cadeaux_validite_mois || 12))
  const [savingCfg, setSavingCfg] = useState(false)
  const [initial, setInitial] = useState(() => ({
    actif: !!commercant?.bons_cadeaux_actif,
    validite: String(commercant?.bons_cadeaux_validite_mois || 12),
  }))
  // Pointage comptoir
  const [codeInput, setCodeInput] = useState('')
  const [bon, setBon] = useState(null)
  const [chercheErr, setChercheErr] = useState(null)
  const [chercheLoading, setChercheLoading] = useState(false)
  const [montantDebit, setMontantDebit] = useState('')
  const [debitLoading, setDebitLoading] = useState(false)
  // Derniers bons vendus
  const [bons, setBons] = useState([])

  const fetchBons = useCallback(async () => {
    const { data } = await supabase
      .from('bons_cadeaux')
      .select('id, code, montant_initial, solde, statut, expires_at, created_at, destinataire_mode')
      .eq('commercant_id', commercantId)
      .eq('statut', 'actif')
      .order('created_at', { ascending: false })
      .limit(12)
    setBons(data || [])
  }, [commercantId])
  useEffect(() => { fetchBons() }, [fetchBons])

  async function saveCfg() {
    const mois = Math.min(60, Math.max(3, parseInt(validite) || 12))
    setSavingCfg(true)
    const { error } = await supabase
      .from('commercants')
      .update({ bons_cadeaux_actif: actif, bons_cadeaux_validite_mois: mois })
      .eq('id', commercantId)
    setSavingCfg(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return false }
    setValidite(String(mois))
    // La durée bornée est celle qui part en base : c'est elle la référence.
    setInitial({ actif, validite: String(mois) })
    toast(actif ? 'Bons cadeaux activés 🟣' : 'Bons cadeaux désactivés')
    onSaved?.()
    return true
  }

  // ─── Le garde-fou des modifications non enregistrées ─────────────────────
  const nbModifsBons = champsModifies(initial, { actif, validite }).length
  useAvertirAvantDeQuitter(nbModifsBons > 0)
  const actionsBons = useRef({})
  actionsBons.current = {
    enregistrer: saveCfg,
    ignorer: () => { setActif(initial.actif); setValidite(initial.validite); toast('Modifications abandonnées') },
  }
  useEffect(() => {
    surModifications?.({ modifie: nbModifsBons > 0, nb: nbModifsBons, saving: savingCfg, actions: actionsBons })
    return () => surModifications?.(null)
  }, [surModifications, nbModifsBons, savingCfg])

  async function chercherBon() {
    const code = normaliserCodeBon(codeInput)
    if (!code) { setChercheErr('Format attendu : BC-XXXX-XXXX'); return }
    setChercheLoading(true); setChercheErr(null); setBon(null)
    const { data, error } = await supabase
      .from('bons_cadeaux')
      .select('id, code, montant_initial, solde, statut, expires_at, beneficiaire_prenom, acheteur_prenom, created_at')
      .eq('commercant_id', commercantId)
      .eq('code', code)
      .maybeSingle()
    setChercheLoading(false)
    if (error) { setChercheErr('Recherche impossible, réessaie.'); return }
    if (!data || data.statut !== 'actif') { setChercheErr('Aucun bon actif avec ce code chez toi.'); return }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setChercheErr(`Ce bon a expiré le ${new Date(data.expires_at).toLocaleDateString('fr-BE')}.`); return }
    setBon(data)
    setMontantDebit('')
  }

  async function debiterComptoir() {
    if (!bon) return
    const m = Math.round((parseFloat(String(montantDebit).replace(',', '.')) || 0) * 100) / 100
    if (!(m > 0)) { toast('Indique le montant de l\'achat à déduire', 'error'); return }
    if (m > Number(bon.solde)) { toast(`Le solde du bon est de ${Number(bon.solde).toFixed(2)} €`, 'error'); return }
    setDebitLoading(true)
    // Mouvement d'abord (historique), puis solde — même pattern que la fidélité
    const { error: errMvt } = await supabase
      .from('bons_cadeaux_mouvements')
      .insert({ bon_id: bon.id, montant: -m, source: 'comptoir' })
    if (errMvt) { setDebitLoading(false); toast(`Erreur : ${errMvt.message}`, 'error'); return }
    const nouveauSolde = Math.max(0, Math.round((Number(bon.solde) - m) * 100) / 100)
    const { error: errUp } = await supabase
      .from('bons_cadeaux')
      .update({ solde: nouveauSolde, updated_at: new Date().toISOString() })
      .eq('id', bon.id)
    setDebitLoading(false)
    if (errUp) { toast(`Erreur : ${errUp.message}`, 'error'); return }
    setBon(p => ({ ...p, solde: nouveauSolde }))
    setMontantDebit('')
    fetchBons()
    toast(nouveauSolde > 0 ? `−${m.toFixed(2)} € · reste ${nouveauSolde.toFixed(2)} € sur le bon 🟣` : 'Bon entièrement utilisé 🟣')
  }

  const soldeBadge = (b) => {
    const expire = b.expires_at && new Date(b.expires_at) < new Date()
    if (expire) return { txt: 'Expiré', bg: '#F3F4F6', color: '#9CA3AF' }
    if (Number(b.solde) <= 0) return { txt: 'Utilisé', bg: '#F3F4F6', color: '#6B7280' }
    if (Number(b.solde) < Number(b.montant_initial)) return { txt: `Reste ${Number(b.solde).toFixed(2)} €`, bg: '#FFF7ED', color: '#EA580C' }
    return { txt: `${Number(b.solde).toFixed(2)} €`, bg: '#F0FDF4', color: '#10B981' }
  }

  return (
    <div>
      {/* En-tête panel violet (pattern des autres onglets) */}
      <div style={{ background: T.bgPanel, borderRadius: 14, padding: '18px 20px', marginBottom: 14, color: '#fff' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>Bons cadeaux</p>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>
          Tes clients offrent ton commerce
        </h2>
        <p style={{ fontSize: 12, color: T.light, margin: '6px 0 0', lineHeight: 1.5, opacity: 0.9 }}>
          Montant libre, payé en ligne, l&rsquo;argent arrive directement sur ton compte. Le bon s&rsquo;utilise en une ou plusieurs fois, en ligne ou au comptoir.
        </p>
      </div>

      {/* Comment ça marche, en clair.
          Le commerçant règle la validité et encaisse au comptoir sans qu'on lui
          ait jamais expliqué QUI fixe le montant, ni ce qu'il advient d'un bon
          entamé, ni quand l'argent lui arrive. Trois questions qu'il se pose au
          premier bon vendu, et qui se traduisent sinon par un appel. */}
      <div style={{ ...s.card, marginBottom: 14, background: T.pale, boxShadow: 'none', border: `1px solid ${T.main}22` }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: T.deep, margin: '0 0 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="info" size={15} color={T.main}/> Comment ça marche
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, color: T.deep, lineHeight: 1.7 }}>
          <li><strong>C&rsquo;est l&rsquo;acheteur qui choisit le montant</strong>, librement, entre {BON_MONTANT_MIN} et {BON_MONTANT_MAX} €. Tu n&rsquo;as rien à préparer ni à mettre en vente.</li>
          <li><strong>Un bon cadeau est une somme, pas un article.</strong> Le bénéficiaire l&rsquo;utilise sur ce qu&rsquo;il veut chez toi, ce qui t&rsquo;évite de devoir garder un produit en réserve pendant des mois.</li>
          <li><strong>Il s&rsquo;utilise en plusieurs fois.</strong> Un bon de 50 € dépensé à hauteur de 30 € en garde 20 pour la prochaine visite, en ligne comme au comptoir.</li>
          <li><strong>Tu es payé tout de suite</strong>, à l&rsquo;achat du bon, sur ton compte. Quand le bénéficiaire vient le dépenser, il ne te doit plus rien : c&rsquo;est déjà encaissé.</li>
          <li><strong>La validité court à partir de la vente</strong> et se règle juste en dessous. Passé ce délai, le bon ne peut plus être utilisé.</li>
        </ul>
      </div>

      {/* Configuration */}
      <div style={{ ...s.card, marginBottom: 14 }}>
        <Toggle value={actif} onChange={setActif} label="Proposer les bons cadeaux sur ma fiche"/>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 12 }}>
          <div style={{ flex: '0 0 140px' }}>
            <label style={s.label}>Validité (mois)</label>
            <Input type="number" min="3" max="60" value={validite} onChange={e => setValidite(e.target.value)}/>
          </div>
          <p style={{ fontSize: 10.5, color: T.muted, margin: '0 0 10px', lineHeight: 1.5 }}>12 mois par défaut. S&rsquo;applique aux bons vendus après l&rsquo;enregistrement.</p>
        </div>
        <button style={{ ...s.btn, ...s.btnPrimary, marginTop: 8 }} onClick={saveCfg} disabled={savingCfg}>
          <Icon name="check" size={14}/> {savingCfg ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>

      {/* Pointage comptoir */}
      <div style={{ ...s.card, marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 4px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Icon name="gift" size={15} color={T.main}/> Encaisser un bon au comptoir
        </p>
        <p style={{ fontSize: 11, color: T.muted, margin: '0 0 10px', lineHeight: 1.5 }}>
          Le client te montre son code (email ou page Yoppaa) : cherche-le, puis déduis le montant de son achat.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Input value={codeInput} onChange={e => { setCodeInput(e.target.value); setChercheErr(null) }} placeholder="BC-XXXX-XXXX"
            style={{ fontFamily: 'monospace', letterSpacing: '1px' }}/>
          <button style={{ ...s.btn, ...s.btnPrimary, flexShrink: 0 }} onClick={chercherBon} disabled={chercheLoading || !codeInput.trim()}>
            <Icon name="search" size={14}/> {chercheLoading ? '…' : 'Chercher'}
          </button>
        </div>
        {chercheErr && <p style={{ fontSize: 11.5, color: '#DC2626', fontWeight: 700, margin: '8px 0 0' }}>{chercheErr}</p>}

        {bon && (
          <div style={{ marginTop: 12, background: '#FAF8FE', border: `1.5px solid ${T.pale}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 900, color: T.ink, margin: 0, fontFamily: 'monospace', letterSpacing: '1px' }}>{bon.code}</p>
                <p style={{ fontSize: 11, color: T.muted, margin: '2px 0 0' }}>
                  {bon.beneficiaire_prenom || bon.acheteur_prenom ? `Pour ${bon.beneficiaire_prenom || bon.acheteur_prenom} · ` : ''}
                  {bon.expires_at ? `valable jusqu'au ${new Date(bon.expires_at).toLocaleDateString('fr-BE')}` : ''}
                </p>
              </div>
              <p style={{ fontSize: 18, fontWeight: 900, color: Number(bon.solde) > 0 ? '#10B981' : '#DC2626', margin: 0 }}>
                {Number(bon.solde).toFixed(2)} €
              </p>
            </div>
            {Number(bon.solde) > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
                <div style={{ flex: '0 0 130px' }}>
                  <Input type="number" min="0.01" step="0.01" value={montantDebit} onChange={e => setMontantDebit(e.target.value)} placeholder="Montant (€)"/>
                </div>
                <button style={{ ...s.btn, ...s.btnPrimary, flexShrink: 0 }} onClick={debiterComptoir} disabled={debitLoading}>
                  <Icon name="check" size={14}/> {debitLoading ? '…' : 'Déduire du bon'}
                </button>
                <button type="button" onClick={() => setMontantDebit(String(Number(bon.solde)))}
                  style={{ border: 'none', background: 'none', color: T.main, fontWeight: 700, fontSize: 11, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit', flexShrink: 0 }}>
                  Tout le solde
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Derniers bons vendus */}
      <div style={s.card}>
        <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 10px' }}>Derniers bons vendus</p>
        {bons.length === 0 ? (
          <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>
            Aucun bon vendu pour le moment. Active le module ci-dessus : le bouton « Offrir un bon cadeau » apparaîtra sur ta fiche.
          </p>
        ) : bons.map(b => {
          const badge = soldeBadge(b)
          return (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${T.hairline}` }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, margin: 0, fontFamily: 'monospace', letterSpacing: '0.5px' }}>{b.code}</p>
                <p style={{ fontSize: 10.5, color: T.muted, margin: '1px 0 0' }}>
                  {Number(b.montant_initial).toFixed(2)} € · {new Date(b.created_at).toLocaleDateString('fr-BE')}
                  {b.destinataire_mode === 'offrir' ? ' · offert' : ''}
                </p>
              </div>
              <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: badge.color, background: badge.bg, padding: '3px 9px', borderRadius: 100 }}>{badge.txt}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════
// TAB RDV — Configuration vitrine (Prestations / Praticiens / Créneaux)
// Visible uniquement pour les commerçants vitrine au plan "vendre" (rdv_actif).
// 3 sous-onglets : Prestations | Praticiens | Créneaux RDV.
// Sess 5a : Prestations CRUD. Sess 5b : Praticiens. Sess 5c : Créneaux.
// ═════════════════════════════════════════════════════════════════════════

function TabRdv({ commercantId, commercant, toast, onSaved }) {
  const [subTab, setSubTab] = useState('prestations')
  // ⚠️ L'INTERRUPTEUR QUI N'EXISTAIT NULLE PART. Voir lib/activation-rdv.js :
  // `rdv_actif` ne s'écrivait que depuis /admin, et le commerçant configurait
  // tout sans jamais pouvoir ouvrir sa fiche. La bannière vit ICI, là où il
  // bloque, et pas trois onglets plus loin dans les Réglages.
  const [inventaire, setInventaire] = useState(null)
  const [ouverture, setOuverture] = useState(false)
  const rdvActif = commercant?.rdv_actif === true

  // Recompté à chaque changement de sous-onglet : ajouter une prestation puis
  // revenir doit faire passer la bannière de « il te manque » à « ouvre ».
  useEffect(() => {
    if (!commercantId || rdvActif) return
    let annule = false
    ;(async () => {
      const [p, c] = await Promise.all([
        supabase.from('rdv_prestations').select('id', { count: 'exact', head: true })
          .eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null),
        supabase.from('rdv_creneaux').select('id', { count: 'exact', head: true })
          .eq('commercant_id', commercantId).is('deleted_at', null),
      ])
      if (!annule) setInventaire({ prestations: p.count || 0, creneaux: c.count || 0 })
    })()
    return () => { annule = true }
  }, [commercantId, rdvActif, subTab])

  const etatRdv = etatActivationRdv({
    rdvActif,
    prestationsActives: inventaire?.prestations,
    creneaux: inventaire?.creneaux,
  })

  async function ouvrirLesReservations() {
    // ⚠️ Le garde-fou est revérifié ICI, au moment du clic, et pas seulement à
    // l'affichage : entre les deux, une prestation a pu être désactivée.
    const verdict = peutActiverRdv({
      prestationsActives: inventaire?.prestations,
      creneaux: inventaire?.creneaux,
    })
    if (!verdict.ok) { toast(verdict.message, 'error'); return }
    setOuverture(true)
    const { error } = await supabase.from('commercants').update({ rdv_actif: true }).eq('id', commercantId)
    setOuverture(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('C’est ouvert, tes clients peuvent réserver 🟣')
    onSaved?.()
  }

  // ⚠️ « ABONNEMENTS » A QUITTÉ CETTE BARRE le 15/08, pour le CATALOGUE, à côté
  // des produits et des prestations (décision d'Alex). Un abonnement est une
  // chose qu'on VEND, au même titre qu'un produit : il n'avait rien à faire
  // dans les réglages de la prise de rendez-vous, qui décrivent COMMENT on
  // travaille et non ce qu'on propose.
  // ⚠️ Il reste réservé aux commerces de SERVICE, et c'est délibéré : une
  // séance d'abonnement EST un rendez-vous, avec sa place dans l'agenda et son
  // rappel. Les autres métiers ont les cartes cadeaux, qui font déjà le
  // pointage au comptoir sans agenda.
  const subTabs = [
    { id: 'prestations', label: 'Prestations' },
    { id: 'praticiens',  label: 'Praticiens' },
    { id: 'creneaux',    label: 'Créneaux' },
    { id: 'fermetures',  label: 'Fermetures' },
  ]
  return (
    <div>
      {/* ─── LA BANNIÈRE D'OUVERTURE ────────────────────────────────────────
          Tant que la prise de RDV est fermée, la fiche publique dit au client
          de téléphoner. Le commerçant doit l'apprendre ici, à l'endroit exact
          où il encode, et pouvoir y remédier d'un bouton. */}
      {!rdvActif && inventaire && (
        <div style={{ background: etatRdv.peutOuvrir ? T.pale : '#FEF3C7', border: `1.5px solid ${etatRdv.peutOuvrir ? T.main : '#F59E0B'}`, borderRadius: 14, padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <AlertTriangle size={18} strokeWidth={2} color={etatRdv.peutOuvrir ? T.main : '#B45309'} style={{ flexShrink: 0, marginTop: 2 }}/>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 800, color: T.ink, margin: '0 0 4px' }}>{etatRdv.titre}</p>
            <p style={{ fontSize: 12, color: T.deep, lineHeight: 1.55, margin: 0 }}>
              {etatRdv.message} Aujourd&rsquo;hui, ta fiche leur dit de t&rsquo;appeler.
            </p>
          </div>
          {etatRdv.peutOuvrir && (
            <button type="button" onClick={ouvrirLesReservations} disabled={ouverture}
              style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13, cursor: ouverture ? 'wait' : 'pointer', opacity: ouverture ? 0.7 : 1 }}>
              <Icon name="check" size={14}/> {ouverture ? 'Ouverture…' : 'Ouvrir les réservations'}
            </button>
          )}
        </div>
      )}

      {/* Barre sous-onglets RDV.
          ⚠️ ELLE DÉFILE ET ELLE MONTRE SES FLÈCHES. Avec quatre onglets et
          `flex: 1`, les libellés se comprimaient déjà ; le cinquième les
          écrasait franchement. La règle du projet ne souffre aucune exception :
          quand une barre est plus large que l'écran, le commerçant doit VOIR
          qu'il reste quelque chose à côté, jamais le deviner. `flex: 1 0 auto`
          remplit la largeur disponible sans jamais rogner un mot, et
          BandeDefilante pose les flèches sur ordinateur. */}
      <style>{`.rdv-subtabs::-webkit-scrollbar { display: none }`}</style>
      <BandeDefilante className="rdv-subtabs" libelle="les sections rendez-vous"
        style={{ display: 'flex', gap: 6, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 6px rgba(22,6,54,0.05)', border: `1px solid ${T.hairline}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ flex: '1 0 auto', padding: '8px 12px', whiteSpace: 'nowrap', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13, background: subTab === t.id ? T.main : 'transparent', color: subTab === t.id ? '#fff' : T.muted, transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </BandeDefilante>
      {subTab === 'prestations' && <TabRdvPrestations commercantId={commercantId} toast={toast} />}
      {subTab === 'praticiens'  && <TabRdvPraticiens commercantId={commercantId} toast={toast} />}
      {subTab === 'creneaux'    && <TabRdvCreneaux commercantId={commercantId} commercant={commercant} toast={toast} />}
      {subTab === 'fermetures'  && <TabRdvFermetures commercantId={commercantId} toast={toast} />}
    </div>
  )
}

// Sess 5a : CRUD Prestations RDV. nom, description, durée_minutes, prix
// (fixe ou fourchette prix_min/max), acompte_pourcent, ordre, actif.
// Soft delete via deleted_at (conformité 7 ans Belgique).
function TabRdvPrestations({ commercantId, toast }) {
  const [prestations, setPrestations] = useState([])
  const [praticiens, setPraticiens] = useState([])
  // Sess 5d : junction prestation ↔ praticien. Aucun coché = tous les praticiens
  // peuvent faire la prestation (pattern Yoppaa aligne sur le wizard client).
  const [junctionMap, setJunctionMap] = useState({})  // { prestation_id: Set(praticien_id) }
  const [selectedPraticiens, setSelectedPraticiens] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const initialForm = { nom: '', description: '', duree_minutes: '30', prix_mode: 'fixe', prix: '', prix_min: '', prix_max: '', acompte_pourcent: '0', actif: true, tva_taux: '', capacite: '1' }
  const [form, setForm] = useState(initialForm)
  // Propositions IA pour la description de la prestation (surface 'prestation')
  const [propsIa, setPropsIa] = useState([])
  const firstLoadRef = useRef(true)

  // Taux de TVA proposés, lus en base (jamais écrits dans le code).
  const [tvaRefs, setTvaRefs] = useState([])
  useEffect(() => {
    let annule = false
    supabase.from('tva_taux_reference').select('taux, libelle, aide').eq('actif', true).order('ordre')
      .then(({ data }) => { if (!annule) setTvaRefs(data || []) })
    return () => { annule = true }
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchAll() }, [commercantId])

  async function fetchAll() {
    if (firstLoadRef.current) setLoading(true)
    const [{ data: prest }, { data: prat }, { data: junction }] = await Promise.all([
      supabase
        .from('rdv_prestations')
        .select('*')
        .eq('commercant_id', commercantId)
        .is('deleted_at', null)
        .order('ordre', { ascending: true })
        .order('created_at', { ascending: true }),
      supabase
        .from('rdv_praticiens')
        .select('id, prenom, nom, couleur_hex, photo_url, actif')
        .eq('commercant_id', commercantId)
        .eq('actif', true)
        .is('deleted_at', null)
        .order('ordre', { ascending: true }),
      supabase
        .from('rdv_prestation_praticiens')
        .select('prestation_id, praticien_id'),
    ])
    setPrestations(prest || [])
    setPraticiens(prat || [])
    // Build junction map : prestation_id -> Set(praticien_id)
    const jm = {}
    ;(junction || []).forEach(row => {
      if (!jm[row.prestation_id]) jm[row.prestation_id] = new Set()
      jm[row.prestation_id].add(row.praticien_id)
    })
    setJunctionMap(jm)
    if (firstLoadRef.current) { setLoading(false); firstLoadRef.current = false }
  }

  function openNew() {
    setForm(initialForm); setEditId(null); setSelectedPraticiens(new Set()); setPropsIa([]); setShowForm(true)
  }
  function openEdit(p) {
    setPropsIa([])
    const isFourchette = p.prix == null && (p.prix_min != null || p.prix_max != null)
    setForm({
      nom: p.nom || '',
      description: p.description || '',
      duree_minutes: String(p.duree_minutes || 30),
      prix_mode: isFourchette ? 'fourchette' : 'fixe',
      prix: p.prix != null ? String(p.prix) : '',
      prix_min: p.prix_min != null ? String(p.prix_min) : '',
      prix_max: p.prix_max != null ? String(p.prix_max) : '',
      acompte_pourcent: String(p.acompte_pourcent ?? 0),
      actif: p.actif !== false,
      tva_taux: p.tva_taux ?? '',
      // Une prestation d'avant la bascule n'a pas de capacité : elle vaut 1,
      // c'est-à-dire ce qu'elle a toujours été.
      capacite: String(capacitePrestation(p)),
    })
    setEditId(p.id)
    // Précharge les praticiens autorisés depuis la junction existante
    setSelectedPraticiens(new Set(junctionMap[p.id] || []))
    setShowForm(true)
  }

  function togglePraticien(praticienId) {
    setSelectedPraticiens(prev => {
      const next = new Set(prev)
      if (next.has(praticienId)) next.delete(praticienId)
      else next.add(praticienId)
      return next
    })
  }

  async function save() {
    if (!form.nom.trim()) return toast('Nom obligatoire', 'error')
    const duree = parseInt(form.duree_minutes, 10)
    if (!duree || duree < 5) return toast('Durée minimum 5 min', 'error')
    const payload = {
      commercant_id: commercantId,
      nom: form.nom.trim(),
      description: form.description.trim() || null,
      duree_minutes: duree,
      prix:     form.prix_mode === 'fixe'       ? (form.prix ? Number(form.prix) : null) : null,
      prix_min: form.prix_mode === 'fourchette' ? (form.prix_min ? Number(form.prix_min) : null) : null,
      prix_max: form.prix_mode === 'fourchette' ? (form.prix_max ? Number(form.prix_max) : null) : null,
      acompte_pourcent: Math.max(0, Math.min(100, parseInt(form.acompte_pourcent, 10) || 0)),
      actif: !!form.actif,
      // Vide = pas renseigné : null, jamais 0, sinon la prestation passerait
      // pour exonérée alors qu'elle n'a simplement pas été réglée.
      tva_taux: form.tva_taux === '' || form.tva_taux == null ? null : Number(form.tva_taux),
      // ⚠️ COMBIEN DE PERSONNES SUR UN MÊME CRÉNEAU. 1 = rendez-vous
      // individuel, c'est-à-dire tout le parc existant et l'immense majorité
      // des métiers à rendez-vous. Au-delà, c'est un cours collectif : dix
      // personnes de 10h à 11h chez une professeure de yoga.
      capacite: capacitePrestation({ capacite: form.capacite }),
    }
    setSaving(true)
    // INSERT/UPDATE prestation
    let prestationId = editId
    if (editId) {
      const { error } = await supabase.from('rdv_prestations').update(payload).eq('id', editId)
      if (error) { setSaving(false); return toast(`Erreur : ${error.message}`, 'error') }
    } else {
      const { data: created, error } = await supabase.from('rdv_prestations').insert(payload).select('id').single()
      if (error || !created) { setSaving(false); return toast(`Erreur : ${error?.message || 'échec création'}`, 'error') }
      prestationId = created.id
    }
    // Sync junction prestation ↔ praticiens : delete existing puis insert selected
    // Pattern simple pour V1 (peu de lignes). Optimisable en delta plus tard si besoin.
    await supabase.from('rdv_prestation_praticiens').delete().eq('prestation_id', prestationId)
    if (selectedPraticiens.size > 0) {
      const rows = Array.from(selectedPraticiens).map(pid => ({ prestation_id: prestationId, praticien_id: pid }))
      const { error: errJ } = await supabase.from('rdv_prestation_praticiens').insert(rows)
      if (errJ) console.warn('[TabRdvPrestations] junction insert error', errJ)
    }
    setSaving(false)
    toast(editId ? 'Prestation mise à jour' : 'Prestation créée')
    setShowForm(false); setEditId(null); setForm(initialForm); setSelectedPraticiens(new Set())
    fetchAll()
  }

  async function toggleActif(p) {
    const { error } = await supabase.from('rdv_prestations').update({ actif: !p.actif }).eq('id', p.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    fetchAll()
  }

  async function softDelete(p) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer cette prestation ?', message: 'Les rendez-vous déjà pris ne bougent pas, elle disparaît seulement de ce que tes clients peuvent réserver.', details: p.nom, action: 'Oui, supprimer la prestation' }))) return
    const { error } = await supabase.from('rdv_prestations').update({ deleted_at: new Date().toISOString() }).eq('id', p.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast('Prestation supprimée')
    fetchAll()
  }

  if (loading) return <p style={{ color: T.muted, padding: 16 }}>Chargement…</p>

  return (
    <div>
      {/* Header avec bouton "Ajouter" */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.2px' }}>Prestations</p>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{prestations.length} prestation{prestations.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew}
          style={{ padding: '10px 16px', borderRadius: 100, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13, boxShadow: `0 4px 14px ${T.main}55` }}>
          + Ajouter une prestation
        </button>
      </div>

      {prestations.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 28, textAlign: 'center', border: `1px solid ${T.hairline}` }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Aucune prestation</p>
          <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>Crée ta première prestation (ex : "Coupe femme · 30 min · 35 €") pour permettre aux clients de réserver chez toi.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {prestations.map(p => {
            const prixLabel = p.prix != null
              ? `${Number(p.prix).toFixed(2)} €`
              : (p.prix_min != null || p.prix_max != null)
                ? `${p.prix_min ? Number(p.prix_min).toFixed(0) : '?'} – ${p.prix_max ? Number(p.prix_max).toFixed(0) : '?'} €`
                : 'Prix sur demande'
            return (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.hairline}`, opacity: p.actif ? 1 : 0.55, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, color: T.ink, marginBottom: 2 }}>{p.nom}</p>
                  {p.description && <p style={{ fontSize: 12, color: T.muted, marginBottom: 4, lineHeight: 1.4 }}>{p.description}</p>}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: T.muted }}>
                    <span><strong style={{ color: T.deep }}>{p.duree_minutes} min</strong></span>
                    <span><strong style={{ color: T.main }}>{prixLabel}</strong></span>
                    {p.acompte_pourcent > 0 && <span>Acompte <strong style={{ color: T.ink }}>{p.acompte_pourcent}%</strong></span>}
                    {!p.actif && <span style={{ color: '#DC2626', fontWeight: 700 }}>Inactif</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => toggleActif(p)} title={p.actif ? 'Désactiver' : 'Activer'}
                    style={{ padding: '6px 10px', border: `1px solid ${T.hairline}`, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: T.muted, fontFamily: '"DM Sans", sans-serif' }}>
                    {p.actif ? 'Désactiver' : 'Activer'}
                  </button>
                  <button onClick={() => openEdit(p)} title="Modifier"
                    style={{ padding: '6px 10px', border: `1px solid ${T.main}44`, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: T.main, fontFamily: '"DM Sans", sans-serif' }}>
                    Modifier
                  </button>
                  <button onClick={() => softDelete(p)} title="Supprimer"
                    style={{ padding: '6px 10px', border: '1px solid #DC262644', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#DC2626', fontFamily: '"DM Sans", sans-serif' }}>
                    Suppr.
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal formulaire création/édition */}
      {showForm && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90svh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, marginBottom: 14 }}>{editId ? 'Modifier la prestation' : 'Nouvelle prestation'}</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Nom *</label>
            <Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Coupe femme" style={{ marginBottom: 10 }}/>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted }}>Description (optionnel)</label>
              <BoutonIaInline commercantId={commercantId} surface="prestation" brief={form.nom}
                infos={form.description}
                briefManquantMsg={'Donne d’abord un nom à la prestation, l’IA s’en inspire.'}
                onVariantes={vs => setPropsIa(vs)}
                toast={toast} />
            </div>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Shampoing, coupe, brushing" rows={2} style={{ marginBottom: propsIa.length > 0 ? 4 : 10 }}/>
            {propsIa.length > 0 ? (
              <div style={{ marginBottom: 10 }}>
                <PropositionsIa propositions={propsIa}
                  onChoisir={v => { setForm(p => ({ ...p, description: v.court || v.long })); setPropsIa([]) }}
                  onFermer={() => setPropsIa([])} />
              </div>
            ) : (
              <p style={{ fontSize: 10, color: T.muted, margin: '0 0 10px' }}>Astuce : note ce que comprend la prestation en vrac (shampoing, massage du cuir chevelu…) puis clique sur Rédiger avec l’IA.</p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Durée (min) *</label>
                <Input type="number" min="5" step="5" value={form.duree_minutes} onChange={e => setForm({ ...form, duree_minutes: e.target.value })}/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Acompte (%)</label>
                <Input type="number" min="0" max="100" value={form.acompte_pourcent} onChange={e => setForm({ ...form, acompte_pourcent: e.target.value })}/>
              </div>
            </div>

            {/* ⚠️ COMBIEN DE PERSONNES SUR UN MÊME CRÉNEAU. Yoppaa ne
                connaissait qu'un modèle, une personne pour un créneau, ce qui
                décrit bien un coiffeur et pas du tout un cours de yoga de dix
                personnes à 10h. Le champ vaut 1 par défaut : le commerçant qui
                ne le touche pas ne voit aucune différence. */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>
                Personnes par créneau
              </label>
              <Input type="number" min="1" max="100" value={form.capacite}
                onChange={e => setForm({ ...form, capacite: e.target.value })}/>
              <p style={{ fontSize: 11, color: T.muted, margin: '4px 0 0', lineHeight: 1.45 }}>
                {capacitePrestation({ capacite: form.capacite }) > 1
                  ? `Cours collectif : ${capacitePrestation({ capacite: form.capacite })} personnes peuvent réserver le même horaire, et tes clients voient les places restantes.`
                  : 'Rendez-vous individuel : une seule personne par horaire. Augmente pour un cours collectif.'}
              </p>
            </div>
            {/* TVA de la prestation. Le prix affiché reste celui que paie le
                client : le taux détermine seulement la part de TVA à l'intérieur. */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>TVA</label>
              <select value={form.tva_taux ?? ''} onChange={e => setForm({ ...form, tva_taux: e.target.value })}
                style={{ ...s.input, cursor: 'pointer' }}>
                <option value="">— À définir —</option>
                {/* ⚠️ TOUJOURS LES EXEMPLES DU SERVICE ICI, quelle que soit la
                    catégorie du commerce : une PRESTATION est une prestation de
                    services par nature, et c'est la nature de l'opération qui
                    commande le taux en Belgique, jamais le rayon du magasin. */}
                {optionsTaux(tvaRefs, CAT_SERVICE).map(t => (
                  <option key={t.taux} value={t.taux}>{t.texte}</option>
                ))}
              </select>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>
                Prix TVA comprise. En cas de doute, consulte ton comptable ou le SPF Finances.
              </p>
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>Tarification</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button onClick={() => setForm({ ...form, prix_mode: 'fixe' })} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${form.prix_mode === 'fixe' ? T.main : T.hairline}`, background: form.prix_mode === 'fixe' ? T.pale : '#fff', color: form.prix_mode === 'fixe' ? T.main : T.muted, fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>Prix fixe</button>
              <button onClick={() => setForm({ ...form, prix_mode: 'fourchette' })} style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${form.prix_mode === 'fourchette' ? T.main : T.hairline}`, background: form.prix_mode === 'fourchette' ? T.pale : '#fff', color: form.prix_mode === 'fourchette' ? T.main : T.muted, fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>Fourchette</button>
            </div>
            {form.prix_mode === 'fixe' ? (
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Prix (€)</label>
                <Input type="number" min="0" step="0.50" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })} placeholder="35.00"/>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Min (€)</label>
                  <Input type="number" min="0" step="0.50" value={form.prix_min} onChange={e => setForm({ ...form, prix_min: e.target.value })} placeholder="30"/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Max (€)</label>
                  <Input type="number" min="0" step="0.50" value={form.prix_max} onChange={e => setForm({ ...form, prix_max: e.target.value })} placeholder="50"/>
                </div>
              </div>
            )}
            {/* Junction prestation ↔ praticiens : optionnel, aucun coché = tous éligibles */}
            {praticiens.length > 0 && (
              <div style={{ marginBottom: 14, padding: 12, background: T.bg, borderRadius: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: T.ink, marginBottom: 2 }}>Praticiens autorisés</p>
                <p style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.4 }}>
                  Coche uniquement les praticiens qui peuvent réaliser cette prestation. Aucun coché = tous les praticiens peuvent la faire.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {praticiens.map(p => {
                    const checked = selectedPraticiens.has(p.id)
                    const initiales = `${(p.prenom?.[0] || '').toUpperCase()}${(p.nom?.[0] || '').toUpperCase()}`
                    return (
                      <button key={p.id} type="button" onClick={() => togglePraticien(p.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 6px', border: `1.5px solid ${checked ? p.couleur_hex || T.main : T.hairline}`, background: checked ? `${p.couleur_hex || T.main}15` : '#fff', borderRadius: 100, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: p.couleur_hex || T.main, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 10, overflow: 'hidden' }}>
                          {p.photo_url ? (
                            <img decoding="async" loading="lazy" src={p.photo_url} alt={p.prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                          ) : (
                            <span>{initiales || '?'}</span>
                          )}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: checked ? T.ink : T.muted }}>
                          {p.prenom}{p.nom ? ' ' + p.nom[0] + '.' : ''}
                        </span>
                        {checked && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={p.couleur_hex || T.main} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12l5 5L20 7"/>
                          </svg>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <Toggle value={form.actif} onChange={v => setForm({ ...form, actif: v })} label="Prestation active (visible côté client)"/>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.deep, fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={save} disabled={saving}
                style={{ flex: 2, padding: '12px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14, opacity: saving ? 0.6 : 1, boxShadow: `0 4px 14px ${T.main}55` }}>
                {saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Créer la prestation')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══ ABONNEMENTS : LES FORMULES QUE LE COMMERÇANT VEND ═════════════════════
// ⚠️ ON N'ACHÈTE PLUS UNE SÉANCE, ON ACHÈTE UN DROIT. Une professeure de yoga
// vend une place fixe pour toute une année scolaire, un coach sportif vend un
// carnet de dix séances : dans les deux cas la séance est payée AVANT d'être
// réservée, et la séance à l'unité n'est plus qu'un reste, quand il en reste.
//
// Deux formes, qui remplissent LE MÊME compteur (cf. lib/abonnements.js) :
// une période avec ses dates, ou un carnet avec son nombre et sa validité.
//
// ⚠️ L'APERÇU DU BAS N'EST PAS DÉCORATIF, C'EST LE GARDE-FOU. Yoppaa ne
// maintient aucun calendrier scolaire, c'est le commerçant qui coche ses
// semaines : la SEULE protection contre une saisie de travers est qu'il lise
// le nombre de séances obtenu avant de confirmer. Emily attend 36, elle lit
// 36, ou elle voit tout de suite qu'elle s'est trompée.
// ⚠️ La liste des jours a disparu le 18/08 : plus personne n'en choisit un.

function dateCourte(iso) {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })
}

// « 180 jours » ne parle à personne, « 6 mois » si.
function dureeParlante(jours) {
  const n = parseInt(jours, 10)
  if (!Number.isFinite(n) || n <= 0) return ''
  if (n % 30 === 0 && n >= 30) {
    const mois = n / 30
    return mois === 1 ? '1 mois' : `${mois} mois`
  }
  return n === 1 ? '1 jour' : `${n} jours`
}

// ⚠️ L'heure de fin d'une séance se calculait ici pour générer la série. Plus
// aucune séance ne naît dans cet écran : la fonction est partie avec elle.

function TabRdvAbonnements({ commercantId, toast }) {
  const [formules, setFormules] = useState([])
  const [prestations, setPrestations] = useState([])
  const [abonnes, setAbonnes] = useState([])
  // ⚠️ La liste des lieux ne servait qu'à graver l'endroit sur chaque séance
  // générée d'avance. Le lieu se grave désormais quand la séance est posée,
  // dans l'agenda, exactement comme pour tout autre rendez-vous.
  const [showInscription, setShowInscription] = useState(false)
  const [inscrivant, setInscrivant] = useState(false)
  // ⚠️ NI MODE, NI JOUR, NI HEURE depuis le 18/08 : un contrat accorde N
  // séances sur une période, et chacune se pose ensuite où elle veut dans la
  // semaine. Voir MIGRATION_ABONNEMENTS_SANS_JOUR_FIXE.
  const initialInscription = {
    formule_id: '',
    client_prenom: '', client_nom: '', client_telephone: '', client_email: '',
    paye: false, mode_paiement: '',
  }
  const [insc, setInsc] = useState(initialInscription)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const initialForm = {
    libelle: '', type: 'periode', prestation_id: '',
    date_debut: '', date_fin: '',
    seances_carnet: '10', validite_jours: '180',
    prix: '', seances_par_semaine: '1', actif: true,
    // ⚠️ FAUX PAR DÉFAUT, comme en base. Rien ne part en vitrine sans que le
    // commerçant le dise : un brouillon ou un tarif négocié pour une cliente
    // en particulier n'a rien à faire sur la fiche publique.
    vente_en_ligne: false,
    periodes_exclues: [],
  }
  const [form, setForm] = useState(initialForm)
  const [exclu, setExclu] = useState({ debut: '', fin: '', libelle: '' })
  // Les séances déjà posées sur les contrats, pour montrer un SOLDE et non un
  // total figé. Et l'encaissement au comptoir, ouvert une carte à la fois.
  const [reservationsAbo, setReservationsAbo] = useState([])
  const [encaisseOuvert, setEncaisseOuvert] = useState(null)
  const [encaissantId, setEncaissantId] = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchAll() }, [commercantId])

  async function fetchAll() {
    setLoading(true)
    // ⚠️ LES LIEUX NE SONT PLUS CHARGÉS ICI (18/08). Cette quatrième requête ne
    // servait qu'à graver l'endroit sur chaque séance générée d'avance : plus
    // aucune séance ne naît dans cet écran, la requête partait pour rien à
    // chaque ouverture de l'onglet.
    // ⚠️ LA QUATRIÈME REQUÊTE EST REVENUE, POUR UNE TOUT AUTRE RAISON (19/08).
    // Cet écran affichait `seances_total` et rien d'autre : une abonnée qui
    // avait déjà consommé douze de ses trente-huit séances lisait « 38 séances »
    // pour toujours. La commerçante devait ouvrir l'agenda et compter à la main
    // pour savoir où elle en était. Alex : « il ne décompte pas les séances ».
    //
    // ⚠️ ON COMPTE LES RÉSERVATIONS, ON NE LIT PAS UN COMPTEUR. C'est la règle
    // du module (voir `seancesConsommees`) : un compteur stocké dérive au
    // premier accident, et personne ne sait plus quel chiffre croire.
    const [{ data: f }, { data: p }, { data: a }, { data: r }] = await Promise.all([
      supabase.from('abonnement_formules').select('*')
        .eq('commercant_id', commercantId).is('deleted_at', null)
        .order('ordre', { ascending: true }).order('created_at', { ascending: true }),
      supabase.from('rdv_prestations').select('id, nom, capacite, duree_minutes, tva_taux')
        .eq('commercant_id', commercantId).is('deleted_at', null)
        .order('ordre', { ascending: true }),
      supabase.from('abonnements').select('*')
        .eq('commercant_id', commercantId).is('deleted_at', null)
        .order('created_at', { ascending: false }),
      supabase.from('rdv_reservations').select('abonnement_id, statut, date_rdv')
        .eq('commercant_id', commercantId).not('abonnement_id', 'is', null)
        .is('deleted_at', null),
    ])
    setFormules(f || [])
    setPrestations(p || [])
    setAbonnes(a || [])
    setReservationsAbo(r || [])
    setLoading(false)
  }

  // ═══ L'ARGENT DU COMPTOIR ══════════════════════════════════════════════
  //
  // ⚠️ CET ÉCRAN ÉTAIT UN CUL-DE-SAC (Alex, 19/08). Une inscription enregistrée
  // sans paiement affichait « Paiement en attente »… et la carte ne proposait
  // que « Résilier ». La commerçante encaissait les 400 € le lendemain et
  // n'avait AUCUN geste pour le dire. Résilier le contrat d'une cliente qui
  // vient de payer est la seule porte qu'on lui laissait ouverte.
  //
  // ⚠️ ET LE MOYEN EST OBLIGATOIRE, comme à l'inscription : « payé » sans dire
  // par quel moyen renvoie en Comptabilité un montant qu'on ne sait plus aller
  // chercher, dans le tiroir ou sur le relevé du terminal. Trois boutons, un
  // geste chacun, plutôt qu'une liste déroulante suivie d'une validation.
  async function encaisser(a, mode) {
    setEncaissantId(a.id)
    const { error } = await supabase.from('abonnements')
      .update({ paye: true, paye_le: new Date().toISOString(), mode_paiement: mode })
      .eq('id', a.id)
    setEncaissantId(null)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    setEncaisseOuvert(null)
    toast(`Abonnement de ${a.client_prenom} encaissé`)
    fetchAll()
  }

  // ═══ LA SOUSCRIPTION ═══════════════════════════════════════════════════
  // ⚠️ TOUT SE GRAVE À LA SIGNATURE. Période, prix, plafond hebdomadaire, lieu :
  // modifier la formule l'an prochain ne doit pas réécrire les contrats déjà
  // signés, exactement comme le prix et la TVA d'un rendez-vous.
  async function inscrire() {
    const formule = formules.find(f => f.id === insc.formule_id)
    if (!formule) return toast('Choisis une formule', 'error')
    if (!insc.client_prenom.trim()) return toast('Le prénom est obligatoire', 'error')
    // ⚠️ L'EMAIL N'EST PLUS EXIGÉ, ET C'EST UN GAIN (18/08). Il l'était en mode
    // crédit parce que la cliente était la SEULE à pouvoir poser ses séances,
    // et l'email est la clé qui relie une réservation à son Yopper. La
    // commerçante pose désormais les séances elle-même : une abonnée de 70 ans
    // sans adresse email a le droit d'exister. L'écran le DIT au lieu de
    // l'interdire, et la contrainte de la base est tombée avec la migration.
    const presta = prestations.find(p => p.id === formule.prestation_id)
    if (!presta) return toast('Le cours de cette formule n’existe plus', 'error')

    // ⚠️ EN HEURE BELGE. `toISOString()` rend le jour de Greenwich : une
    // inscription prise à 00h30 aurait fait démarrer le contrat la VEILLE.
    const aujourdhui = jourBruxelles()
    const fenetre = fenetreDeValidite(formule, { achatLe: aujourdhui })
    if (!fenetre) return toast('Cette formule est incomplète, corrige-la d’abord', 'error')

    const total = seancesDeLaFormule(formule)
    if (total <= 0) return toast('Cette formule n’accorde aucune séance, corrige-la d’abord', 'error')

    const contrat = {
      commercant_id: commercantId,
      formule_id: formule.id,
      prestation_id: presta.id,
      client_prenom: insc.client_prenom.trim(),
      client_nom: insc.client_nom.trim() || null,
      client_telephone: insc.client_telephone.trim() || null,
      // Email NORMALISÉ : c'est la clé de rattachement partout dans le projet,
      // et une majuscule a déjà fait disparaître des commandes ici.
      client_email: insc.client_email.trim().toLowerCase() || null,
      // ⚠️ `mode`, `jour_semaine` et `heure_debut` SONT DE L'HISTOIRE depuis le
      // 18/08 : le jour fixe n'existe plus, chaque séance se pose où elle veut
      // dans la semaine. On écrit `credit` pour rester cohérent avec la
      // colonne, et plus aucun jour.
      mode: 'credit',
      type: formule.type,
      date_debut: fenetre.debut,
      date_fin: fenetre.fin,
      prix: Number(formule.prix) || 0,
      seances_total: total,
      seances_par_semaine: formule.seances_par_semaine || 1,
      statut: 'actif',
      paye: !!insc.paye,
      paye_le: insc.paye ? new Date().toISOString() : null,
      mode_paiement: insc.paye ? (insc.mode_paiement || 'sur_place') : null,
      // ⚠️ TVA FIGÉE À LA SIGNATURE, comme le prix juste au-dessus et comme le
      // fait un rendez-vous. Sans elle, l'abonnement entrait en Comptabilité
      // sans taux, et un contrat vendu cette année serait ventilé l'an prochain
      // au taux de l'an prochain. Le champ est bien dans le select des
      // prestations, ligne « id, nom, capacite, duree_minutes, tva_taux ».
      tva_taux: presta.tva_taux ?? null,
    }

    // ⚠️ UNE SEULE ÉCRITURE DEPUIS LE 18/08, ET UNE BRANCHE ENTIÈRE A DISPARU.
    //
    // L’inscription générait AUSSI toute la série des séances quand la
    // commerçante avait choisi « je bloque sa place » : trente-six lignes posées
    // le même jour de la semaine, d’un coup, à l’aveugle sur toute l’année. Le
    // jour fixe n’existe plus, cette génération non plus.
    //
    // ⚠️ ET CE N’EST PAS UNE PERTE, C’EST UN DÉPLACEMENT. Poser les séances est
    // devenu un GESTE D’AGENDA : la commerçante pose la première où elle veut,
    // la répète sur les semaines suivantes, et corrige celles qui ne vont pas.
    // Le code qui plaçait une série en respectant les places déjà prises n’a pas
    // été jeté : c’est lui que ce geste réutilise.
    setInscrivant(true)
    const { error } = await supabase.from('abonnements').insert(contrat)
    setInscrivant(false)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast(`${contrat.client_prenom} a ${total} séance${total > 1 ? 's' : ''} à poser`)
    setShowInscription(false); setInsc(initialInscription)
    fetchAll()
  }

  async function resilier(a) {
    if (!await confirme(confirmationSimple({ titre: `Résilier l’abonnement de ${a.client_prenom} ?`, message: 'Ses séances à venir seront annulées. Celles déjà passées restent dans ton historique.', action: 'Oui, résilier l’abonnement' }))) return
    // ⚠️ EN HEURE BELGE, sinon une résiliation prononcée à 00h30 travaillerait
    // sur la journée de la VEILLE et emporterait les séances d'aujourd'hui.
    const aujourdhui = jourBruxelles()
    const { error } = await supabase.from('abonnements')
      .update({ statut: 'resilie' }).eq('id', a.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    // ⚠️ LES SÉANCES PASSÉES NE BOUGENT PAS. Elles ont eu lieu, elles comptent
    // dans l'historique et dans les statistiques ; seul l'avenir se libère.
    //
    // ⚠️ ET LE STATUT S'ÉCRIT `annule_commercant`, jamais « annule » tout
    // court : cette valeur-là n'existe pas en base. Le projet distingue qui a
    // annulé, et trois statuts inventés de mémoire ont déjà faussé des
    // statistiques entières.
    await supabase.from('rdv_reservations')
      .update({ statut: 'annule_commercant' })
      .eq('abonnement_id', a.id)
      .gte('date_rdv', aujourdhui)
      .eq('statut', 'confirme')
    toast('Abonnement résilié, les places à venir sont libérées')
    fetchAll()
  }

  function openNew() {
    setEditId(null); setForm(initialForm); setExclu({ debut: '', fin: '', libelle: '' }); setShowForm(true)
  }
  function openEdit(f) {
    setEditId(f.id)
    setForm({
      libelle: f.libelle || '', type: f.type || 'periode', prestation_id: f.prestation_id || '',
      date_debut: f.date_debut || '', date_fin: f.date_fin || '',
      seances_carnet: f.seances_carnet != null ? String(f.seances_carnet) : '10',
      validite_jours: f.validite_jours != null ? String(f.validite_jours) : '180',
      prix: f.prix != null ? String(f.prix) : '',
      seances_par_semaine: String(f.seances_par_semaine ?? 1),
      actif: f.actif !== false,
      vente_en_ligne: f.vente_en_ligne === true,
      periodes_exclues: Array.isArray(f.periodes_exclues) ? f.periodes_exclues : [],
    })
    setExclu({ debut: '', fin: '', libelle: '' })
    setShowForm(true)
  }

  function ajouterExclusion() {
    const debut = exclu.debut, fin = exclu.fin || exclu.debut
    if (!debut) return toast('Indique au moins le premier jour sans cours', 'error')
    if (fin < debut) return toast('La fin ne peut pas précéder le début', 'error')
    const candidate = { debut, fin, libelle: exclu.libelle.trim() || null }
    // ⚠️ ON NOMME CELLE QUI GÊNE. Deux congés qui se recouvrent font croire au
    // commerçant qu'il a retiré deux semaines alors qu'il n'en a retiré qu'une,
    // et le compte de séances part de travers sans que rien ne le dise.
    const conflit = exclusionsQuiSeChevauchent([...form.periodes_exclues, candidate])
    if (conflit) {
      const gene = conflit.find(c => c !== candidate) || conflit[0]
      return toast(`Chevauche « ${gene.libelle || dateCourte(gene.debut)} »`, 'error')
    }
    setForm(p => ({ ...p, periodes_exclues: [...p.periodes_exclues, candidate].sort((a, b) => a.debut < b.debut ? -1 : 1) }))
    setExclu({ debut: '', fin: '', libelle: '' })
  }

  function retirerExclusion(i) {
    setForm(p => ({ ...p, periodes_exclues: p.periodes_exclues.filter((_, k) => k !== i) }))
  }

  // L'aperçu, recalculé à chaque frappe. Assez léger pour ne pas mériter de
  // mémoïsation : au pire sept fois cinquante-deux tours de boucle.
  //
  // ⚠️ IL PARLE DÉSORMAIS SANS JOUR. La phrase et son explication vivent dans
  // `lib/abonnements.js`, pures, donc le banc les EXÉCUTE et relit ce qu'elles
  // disent au lieu de chercher des mots dans du JSX.
  const nbCarnet = parseInt(form.seances_carnet, 10)
  const formulePourApercu = {
    type: form.type,
    date_debut: form.date_debut,
    date_fin: form.date_fin,
    periodes_exclues: form.periodes_exclues,
    seances_carnet: nbCarnet,
    validite_jours: parseInt(form.validite_jours, 10),
    seances_par_semaine: Math.max(1, parseInt(form.seances_par_semaine, 10) || 1),
  }
  const apercuFormule = phraseApercuFormule(formulePourApercu)
  const explicationApercu = expliquerApercuFormule(formulePourApercu)

  async function save() {
    if (!form.libelle.trim()) return toast('Donne un nom à ta formule', 'error')
    if (!form.prestation_id) return toast('Choisis le cours concerné', 'error')
    if (form.type === 'periode') {
      if (!form.date_debut || !form.date_fin) return toast('Indique les dates de début et de fin', 'error')
      if (form.date_fin < form.date_debut) return toast('La fin ne peut pas précéder le début', 'error')
    } else {
      if (!(nbCarnet > 0)) return toast('Un carnet doit contenir au moins une séance', 'error')
      if (!(parseInt(form.validite_jours, 10) > 0)) return toast('Indique la durée de validité du carnet', 'error')
    }
    const payload = {
      commercant_id: commercantId,
      prestation_id: form.prestation_id,
      libelle: form.libelle.trim(),
      type: form.type,
      // ⚠️ CHAQUE FORME NETTOIE LES CHAMPS DE L'AUTRE. Une formule passée de
      // période à carnet garderait sinon ses anciennes dates, que la contrainte
      // de cohérence en base accepterait sans broncher puisqu'elle ne regarde
      // que les champs de la forme choisie.
      date_debut: form.type === 'periode' ? form.date_debut : null,
      date_fin:   form.type === 'periode' ? form.date_fin   : null,
      periodes_exclues: form.type === 'periode' ? form.periodes_exclues : [],
      seances_carnet: form.type === 'carnet' ? nbCarnet : null,
      validite_jours: form.type === 'carnet' ? parseInt(form.validite_jours, 10) : null,
      // Vide = pas renseigné : null plutôt que 0, qui ferait passer la formule
      // pour gratuite.
      prix: form.prix === '' ? 0 : Number(form.prix),
      seances_par_semaine: Math.max(1, parseInt(form.seances_par_semaine, 10) || 1),
      actif: !!form.actif,
      vente_en_ligne: !!form.vente_en_ligne,
    }
    setSaving(true)
    const { error } = editId
      ? await supabase.from('abonnement_formules').update(payload).eq('id', editId)
      : await supabase.from('abonnement_formules').insert(payload)
    setSaving(false)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast(editId ? 'Formule mise à jour' : 'Formule créée')
    setShowForm(false); setEditId(null); setForm(initialForm)
    fetchAll()
  }

  async function softDelete(f) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer cette formule ?', message: 'Les abonnements déjà souscrits ne sont pas touchés, ils gardent leurs conditions.', details: f.libelle, action: 'Oui, supprimer la formule' }))) return
    const { error } = await supabase.from('abonnement_formules')
      .update({ deleted_at: new Date().toISOString() }).eq('id', f.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast('Formule supprimée')
    fetchAll()
  }

  if (loading) return <p style={{ color: T.muted, padding: 16 }}>Chargement…</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.2px' }}>Abonnements</p>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {formules.length === 0 ? 'Aucune formule' : `${formules.length} formule${formules.length > 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={openNew}
          style={{ padding: '10px 16px', borderRadius: 100, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13, boxShadow: `0 4px 14px ${T.main}55` }}>
          + Ajouter une formule
        </button>
      </div>

      {formules.length === 0 && !showForm && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 24, border: `1px solid ${T.hairline}` }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 8 }}>Tes clients paient d’avance ?</p>
          <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.65, marginBottom: 10 }}>
            Une formule d’abonnement, c’est un droit vendu une fois pour plusieurs séances. Deux façons de le faire :
          </p>
          <p style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.65, marginBottom: 4 }}>
            <strong>Une période</strong> · « Année, du 1er septembre au 3 juillet, hors congés ». Pour les cours qui suivent l’année scolaire.
          </p>
          <p style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.65 }}>
            <strong>Un carnet</strong> · « 10 séances valables 6 mois ». Pour les suivis, les cures et les forfaits.
          </p>
        </div>
      )}

      {showForm && (
        <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: `1px solid ${T.hairline}`, marginBottom: 14, maxWidth: '100%' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Nom de la formule *</label>
          <Input value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })}
            placeholder="Année, Semestre 1, Carnet de 10…" style={{ marginBottom: 12 }}/>

          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Le cours concerné *</label>
          <select value={form.prestation_id} onChange={e => setForm({ ...form, prestation_id: e.target.value })}
            style={{ ...s.input, marginBottom: 12 }}>
            <option value="">Choisis un cours…</option>
            {prestations.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>
          {prestations.length === 0 && (
            <p style={{ fontSize: 11.5, color: '#B45309', margin: '-6px 0 12px', lineHeight: 1.5 }}>
              Crée d’abord une prestation dans l’onglet Prestations : c’est elle qui porte la durée et le nombre de places.
            </p>
          )}

          {/* ⚠️ LA QUESTION QUI COMMANDE TOUT LE RESTE DU FORMULAIRE. */}
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 6 }}>Qu’est-ce que tu vends ?</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {[
              { id: 'periode', titre: 'Une période', desc: 'Du 1er septembre au 3 juillet' },
              { id: 'carnet',  titre: 'Un carnet',   desc: '10 séances valables 6 mois' },
            ].map(o => (
              <button key={o.id} onClick={() => setForm({ ...form, type: o.id })}
                style={{ flex: '1 1 150px', minWidth: 0, textAlign: 'left', padding: '10px 12px', borderRadius: 10, cursor: 'pointer', background: form.type === o.id ? `${T.main}12` : '#fff', border: `1.5px solid ${form.type === o.id ? T.main : T.hairline}`, fontFamily: '"DM Sans", sans-serif' }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: form.type === o.id ? T.main : T.ink }}>{o.titre}</span>
                <span style={{ display: 'block', fontSize: 11, color: T.muted, marginTop: 2 }}>{o.desc}</span>
              </button>
            ))}
          </div>

          {form.type === 'periode' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Premier jour *</label>
                  <Input type="date" value={form.date_debut} onChange={e => setForm({ ...form, date_debut: e.target.value })}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Dernier jour *</label>
                  <Input type="date" value={form.date_fin} onChange={e => setForm({ ...form, date_fin: e.target.value })}/>
                </div>
              </div>

              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Les semaines sans cours</label>
              <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, margin: '0 0 8px' }}>
                Congés scolaires, fermeture annuelle, jours fériés. Ces jours-là ne comptent pas de séance.
              </p>
              {form.periodes_exclues.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {form.periodes_exclues.map((p, i) => (
                    <div key={`${p.debut}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.bgSoft || '#F7F5FC', borderRadius: 8, padding: '7px 10px', minWidth: 0 }}>
                      <span style={{ fontSize: 12, color: T.ink, fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                        {p.libelle ? `${p.libelle} · ` : ''}{dateCourte(p.debut)}{p.fin && p.fin !== p.debut ? ` au ${dateCourte(p.fin)}` : ''}
                      </span>
                      <button onClick={() => retirerExclusion(i)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#DC2626', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>Retirer</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <Input type="date" value={exclu.debut} onChange={e => setExclu({ ...exclu, debut: e.target.value })}/>
                <Input type="date" value={exclu.fin} onChange={e => setExclu({ ...exclu, fin: e.target.value })}/>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <Input value={exclu.libelle} onChange={e => setExclu({ ...exclu, libelle: e.target.value })}
                  placeholder="Congé d’automne" style={{ flex: '1 1 140px', minWidth: 0 }}/>
                <button onClick={ajouterExclusion}
                  style={{ ...s.btn, ...s.btnGhost, padding: '10px 14px', fontSize: 12.5, flexShrink: 0 }}>Ajouter</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Nombre de séances *</label>
                <Input type="number" min="1" value={form.seances_carnet} onChange={e => setForm({ ...form, seances_carnet: e.target.value })}/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Valables (jours) *</label>
                <Input type="number" min="1" value={form.validite_jours} onChange={e => setForm({ ...form, validite_jours: e.target.value })}/>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Prix (€)</label>
              <Input type="number" min="0" step="0.01" value={form.prix} onChange={e => setForm({ ...form, prix: e.target.value })}/>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Séances par semaine</label>
              {/* ⚠️ LE CHAMP VIDE SE REMPLIT SOUS SES YEUX, ET C'EST TOUT
                  L'INTÉRÊT. Vidé, ce champ valait déjà 1 partout, en silence :
                  à l'enregistrement, dans l'aperçu et au plafond hebdomadaire.
                  Aucun bug, mais un commerçant qui vide en pensant « pas de
                  limite » obtenait le contraire, la limite la plus stricte
                  possible, et ne l'apprenait qu'à la première cliente qui ne
                  pouvait pas réserver sa deuxième séance.
                  On ne corrige donc pas la valeur, qui était juste : on la lui
                  MONTRE, à la sortie du champ, pour qu'il n'ait rien à deviner.
                  ⚠️ À la sortie et pas à la frappe : effacer pour retaper « 2 »
                  ferait apparaître un 1 sous les doigts, au milieu de la
                  saisie. */}
              <Input type="number" min="1" value={form.seances_par_semaine}
                onChange={e => setForm({ ...form, seances_par_semaine: e.target.value })}
                onBlur={() => setForm(p => ({
                  ...p,
                  seances_par_semaine: String(Math.max(1, parseInt(p.seances_par_semaine, 10) || 1)),
                }))}/>
            </div>
          </div>
          {/* ⚠️ LE PLAFOND N'EST PAS UN DÉTAIL : sans lui, un client qui réserve
              lui-même consomme tout son abonnement en deux mois alors qu'on lui
              en vend une séance par semaine. */}
          <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, margin: '-4px 0 14px' }}>
            Le maximum qu’un client peut réserver dans une même semaine. Laisse 1 si tu vends une séance hebdomadaire : ceux qui veulent venir deux fois prennent un second abonnement.
          </p>

          {/* ⚠️ L'APERÇU. Le seul rempart contre une saisie de travers, puisque
              Yoppaa ne connaît aucun calendrier scolaire. */}
          <div style={{ background: `${T.main}0D`, border: `1px solid ${T.main}33`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
            {/* ⚠️ PLUS DE JOUR IMPOSÉ (demande d'Alex, 15/08 au soir). Un menu
                déroulant siégeait ici pour désigner le jour du cours, et il
                faisait dire à l'aperçu un nombre qui ne valait que pour ce
                jour-là.
                ⚠️ Ce commentaire ne cite PAS la phrase retirée, et c'est
                délibéré : le banc l'interdit, et `sansCommentaires` ne sait pas
                reconnaître les lignes de continuation d'un commentaire JSX. La
                sortie est de reformuler, jamais de complexifier le filtre.
                Le client choisit lui-même son jour : on annonce donc le jour le
                MOINS favorable, seul nombre qu'on puisse tenir quel que soit son
                choix. Le calcul vit dans la lib, exécuté par le banc. */}
            {apercuFormule ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.main, margin: 0, lineHeight: 1.45 }}>
                  {apercuFormule}
                </p>
                {explicationApercu && (
                  <p style={{ fontSize: 11.5, color: T.muted, margin: '8px 0 0', lineHeight: 1.55 }}>
                    {explicationApercu}
                  </p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: T.muted, margin: 0 }}>
                {form.type === 'carnet'
                  ? 'Indique le nombre de séances et leur durée de validité.'
                  : 'Renseigne les dates pour voir combien de séances la formule contiendra.'}
              </p>
            )}
          </div>

          <div style={{ marginBottom: 10 }}>
            <Toggle value={form.actif} onChange={v => setForm({ ...form, actif: v })} label="Formule proposée"/>
          </div>

          {/* ⚠️ LA MISE EN VITRINE EST UN GESTE À PART, et volontairement
              séparée de « Formule proposée ». Une formule peut très bien
              exister pour l'usage du commerçant seul, un tarif négocié ou un
              brouillon, sans jamais s'afficher au public. La colonne vaut faux
              par défaut en base : rien ne se publie tout seul, y compris le
              jour où la migration passe sur des formules déjà créées. */}
          <div style={{ marginBottom: 14, background: T.bg, borderRadius: 10, padding: '10px 12px', border: `1px solid ${T.border}` }}>
            <Toggle value={form.vente_en_ligne} onChange={v => setForm({ ...form, vente_en_ligne: v })}
              label="Vendre cette formule en ligne"/>
            <p style={{ fontSize: 11, color: T.muted, margin: '6px 0 0', lineHeight: 1.5 }}>
              {form.vente_en_ligne
                ? <>Elle apparaît sur ta fiche publique. Le client paie en une fois par Bancontact ou par carte, et <strong>l&rsquo;argent arrive directement sur ton compte</strong>. Il réserve ensuite ses séances lui-même, dans la limite que tu as fixée par semaine.</>
                : <>Elle reste pour toi seul : tu inscris tes clients à la main et tu encaisses comme tu veux. Coche pour la mettre en vente sur ta fiche.</>}
            </p>
            {form.vente_en_ligne && !(Number(form.prix) > 0) && (
              <p style={{ fontSize: 11.5, color: '#B45309', margin: '6px 0 0', fontWeight: 700, lineHeight: 1.5 }}>
                Indique un prix : une formule à 0 € ne peut pas être achetée en ligne.
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={save} disabled={saving}
              style={{ ...s.btn, ...s.btnPrimary, opacity: saving ? 0.6 : 1, flex: '1 1 140px' }}>
              {saving ? 'Enregistrement…' : (editId ? 'Mettre à jour' : 'Créer la formule')}
            </button>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(initialForm) }}
              style={{ ...s.btn, ...s.btnGhost, flex: '0 1 auto' }}>Annuler</button>
          </div>
        </div>
      )}

      {formules.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {formules.map(f => {
            const presta = prestations.find(p => p.id === f.prestation_id)
            const resume = f.type === 'carnet'
              ? `${f.seances_carnet} séances · ${dureeParlante(f.validite_jours)}`
              : `Du ${dateCourte(f.date_debut)} au ${dateCourte(f.date_fin)}`
            const nbExclus = Array.isArray(f.periodes_exclues) ? f.periodes_exclues.length : 0
            return (
              <div key={f.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: `1px solid ${T.hairline}`, opacity: f.actif ? 1 : 0.55, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, overflowWrap: 'anywhere' }}>{f.libelle}</p>
                      {/* ⚠️ CE QUI EST EN VITRINE DOIT SE VOIR D'UN COUP D'ŒIL.
                          Sans cette pastille, le commerçant ne peut pas savoir
                          ce que ses clients voient sans rouvrir chaque formule
                          une par une, et il finirait par vendre sans le savoir
                          ou par croire vendre alors que rien n'est publié. */}
                      {f.vente_en_ligne && (
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 100, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                          En vente
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 12, color: T.muted, marginTop: 3, overflowWrap: 'anywhere' }}>
                      {presta ? `${presta.nom} · ` : ''}{resume}
                    </p>
                    <p style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                      {f.prix > 0 ? `${Number(f.prix).toFixed(2)} €` : 'Prix non renseigné'}
                      {f.seances_par_semaine > 1 ? ` · jusqu’à ${f.seances_par_semaine} par semaine` : ' · 1 par semaine'}
                      {nbExclus > 0 ? ` · ${nbExclus} période${nbExclus > 1 ? 's' : ''} sans cours` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(f)} style={{ ...s.btn, ...s.btnGhost, padding: '7px 12px', fontSize: 12 }}>Modifier</button>
                    <button onClick={() => softDelete(f)} style={{ ...s.btn, ...s.btnDanger, padding: '7px 12px', fontSize: 12 }}>Supprimer</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ LES ABONNÉS ═══════════════════════════════════════════════════ */}
      {formules.length > 0 && (
        <div style={{ marginTop: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.2px' }}>Abonnés</p>
              <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                {abonnes.length === 0 ? 'Personne pour l’instant' : `${abonnes.length} personne${abonnes.length > 1 ? 's' : ''}`}
              </p>
            </div>
            <button onClick={() => { setInsc(initialInscription); setShowInscription(true) }}
              style={{ padding: '10px 16px', borderRadius: 100, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13, boxShadow: `0 4px 14px ${T.main}55` }}>
              + Inscrire quelqu’un
            </button>
          </div>

          {showInscription && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: `1px solid ${T.hairline}`, marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>La formule *</label>
              <select value={insc.formule_id} onChange={e => setInsc({ ...insc, formule_id: e.target.value })}
                style={{ ...s.input, marginBottom: 12 }}>
                <option value="">Choisis une formule…</option>
                {formules.filter(f => f.actif !== false).map(f => (
                  <option key={f.id} value={f.id}>{f.libelle}{f.prix > 0 ? ` · ${Number(f.prix).toFixed(2)} €` : ''}</option>
                ))}
              </select>

              {/* ⚠️ LA QUESTION « QUI RÉSERVE LES SÉANCES ? » A DISPARU LE 18/08,
                  avec le jour fixe. Elle séparait deux populations, mais elle
                  obligeait surtout à trancher AU MOMENT DE L'INSCRIPTION ce qui
                  ne se décide qu'au fil de l'année : une abonnée peut réserver
                  deux séances toute seule puis téléphoner pour la troisième.
                  Les deux chemins restent ouverts en permanence, sans choix
                  préalable. */}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Prénom *</label>
                  <Input value={insc.client_prenom} onChange={e => setInsc({ ...insc, client_prenom: e.target.value })}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Nom</label>
                  <Input value={insc.client_nom} onChange={e => setInsc({ ...insc, client_nom: e.target.value })}/>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Téléphone</label>
                  <Input value={insc.client_telephone} onChange={e => setInsc({ ...insc, client_telephone: e.target.value })}/>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Email</label>
                  <Input type="email" value={insc.client_email} onChange={e => setInsc({ ...insc, client_email: e.target.value })}/>
                </div>
              </div>
              {/* ⚠️ L'EMAIL N'EST PLUS OBLIGATOIRE, ET ON DIT CE QUE SON ABSENCE
                  COÛTE plutôt que de la refuser. Il était exigé parce que la
                  cliente était la seule à pouvoir poser ses séances, et c'est
                  l'email qui relie une réservation à son Yopper. Maintenant que
                  la commerçante les pose aussi, une abonnée de 70 ans sans
                  adresse email a le droit d'exister. Interdire l'aurait
                  simplement empêchée d'être inscrite. */}
              <p style={{ fontSize: 11.5, color: T.muted, lineHeight: 1.55, margin: '-6px 0 12px' }}>
                {insc.client_email.trim()
                  ? 'Avec son email, elle pourra réserver ses séances elle-même depuis l’application.'
                  : 'Sans email, c’est toi qui poseras toutes ses séances : elle ne pourra pas réserver depuis l’application.'}
              </p>

              <div style={{ marginBottom: 12 }}>
                <Toggle value={insc.paye} onChange={v => setInsc({ ...insc, paye: v })} label="Déjà payé"/>
              </div>
              {insc.paye && (
                // ⚠️ « SUR PLACE » NE DIT PAS PAR QUEL MOYEN, et c'est le même
                // défaut que sur les rendez-vous : la Comptabilité recevait un
                // montant au comptoir sans savoir s'il fallait le chercher dans
                // le tiroir ou sur le relevé du terminal. Règle d'Alex du
                // 17/08 : une amélioration qui touche d'autres endroits de
                // l'application s'y applique aussi.
                // Le virement reste, contrairement aux rendez-vous : un contrat
                // à trois chiffres se règle couramment ainsi.
                <select value={insc.mode_paiement} onChange={e => setInsc({ ...insc, mode_paiement: e.target.value })}
                  style={{ ...s.input, marginBottom: 12 }}>
                  <option value="">— Comment as-tu été payé ? —</option>
                  <option value="terminal">Terminal (Bancontact, carte)</option>
                  <option value="especes">Espèces</option>
                  <option value="virement">Virement</option>
                </select>
              )}

              {/* Ce que la souscription va produire, AVANT de la produire. */}
              {(() => {
                const f = formules.find(x => x.id === insc.formule_id)
                if (!f) return null
                const n = seancesDeLaFormule(f)
                return (
                  <div style={{ background: `${T.main}0D`, border: `1px solid ${T.main}33`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
                    <p style={{ fontSize: 13, fontWeight: 800, color: T.main, margin: 0 }}>
                      {n} séance{n > 1 ? 's' : ''} à poser, à n’importe quel jour de la semaine.
                    </p>
                    {/* ⚠️ ON DIT OÙ SE FAIT LE GESTE SUIVANT. Sans cette ligne,
                        la commerçante enregistre et cherche un planning qui
                        n'arrivera pas : c'est elle qui pose les séances
                        maintenant, et elle doit savoir où. */}
                    <p style={{ fontSize: 11.5, color: T.muted, margin: '4px 0 0', lineHeight: 1.5 }}>
                      Tu les poseras depuis ton agenda, une par une ou en répétant la première sur les semaines suivantes.
                    </p>
                  </div>
                )
              })()}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={inscrire} disabled={inscrivant}
                  style={{ ...s.btn, ...s.btnPrimary, opacity: inscrivant ? 0.6 : 1, flex: '1 1 140px' }}>
                  {inscrivant ? 'Inscription…' : 'Inscrire'}
                </button>
                <button onClick={() => { setShowInscription(false); setInsc(initialInscription) }}
                  style={{ ...s.btn, ...s.btnGhost }}>Annuler</button>
              </div>
            </div>
          )}

          {abonnes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {abonnes.map(a => {
                const f = formules.find(x => x.id === a.formule_id)
                const resilie = a.statut === 'resilie'
                // Le solde se COMPTE sur les réservations, il ne se lit pas.
                const posees = seancesConsommees(reservationsAbo, { abonnementId: a.id })
                const restantes = soldeAbonnement(a, posees)
                const moyen = libelleMoyenEncaissement(a.mode_paiement)
                return (
                  <div key={a.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: `1px solid ${T.hairline}`, opacity: resilie ? 0.5 : 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, overflowWrap: 'anywhere' }}>
                          {a.client_prenom} {a.client_nom || ''}
                          {resilie && <span style={{ ...s.tag, background: '#FEE2E2', color: '#B91C1C', marginLeft: 8 }}>Résilié</span>}
                        </p>
                        <p style={{ fontSize: 12, color: T.muted, marginTop: 3, overflowWrap: 'anywhere' }}>
                          {/* ⚠️ LE SOLDE, PAS LE TOTAL. Cette ligne annonçait
                              « 38 séances » à vie, même à une abonnée qui en
                              avait déjà consommé douze : la commerçante devait
                              ouvrir l'agenda et compter à la main. Le total
                              reste dit, parce qu'un solde seul ne se situe pas.
                              ⚠️ `restantes` peut valoir null quand le contrat ne
                              dit pas combien il accordait : on n'affiche alors
                              PAS « 0 restantes », qui serait un mensonge. */}
                          {f ? `${f.libelle} · ` : ''}
                          {restantes === null
                            ? `${a.seances_total} séance${a.seances_total > 1 ? 's' : ''}`
                            : `${restantes} séance${restantes > 1 ? 's' : ''} restante${restantes > 1 ? 's' : ''} sur ${a.seances_total}`}
                          {/* ⚠️ CETTE LIGNE ANNONÇAIT « elle réserve elle-même »
                              sur la seule foi du mode, et c'était faux dès qu'une
                              abonnée n'avait pas d'email : personne ne réservait
                              rien. On lit désormais ce qui est VRAI, la présence
                              d'un email, qui est exactement ce qui lui ouvre
                              l'application. */}
                          {a.client_email ? ' · elle peut réserver elle-même' : ' · c’est toi qui poses ses séances'}
                        </p>
                        <p style={{ fontSize: 11.5, color: T.muted, marginTop: 3 }}>
                          Du {dateCourte(a.date_debut)} au {dateCourte(a.date_fin)}
                          {' · '}
                          {/* ⚠️ « PAYÉ » NE SUFFIT PAS, le moyen se dit aussi :
                              c'est lui qui indique où retrouver l'argent, dans
                              le tiroir ou sur le relevé du terminal. */}
                          {a.paye
                            ? <span style={{ color: '#15803D', fontWeight: 700 }}>Payé{moyen ? ` · ${moyen}` : ''}</span>
                            : <span style={{ color: '#B45309', fontWeight: 700 }}>Paiement en attente</span>}
                        </p>
                      </div>
                      {!resilie && (
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {/* ⚠️ LE GESTE QUI MANQUAIT. Sans lui, la seule action
                              offerte sur un contrat impayé était « Résilier » :
                              on encaissait 400 € au comptoir et l'écran n'avait
                              aucune porte pour le dire. */}
                          {!a.paye && (
                            <button onClick={() => setEncaisseOuvert(encaisseOuvert === a.id ? null : a.id)}
                              style={{ ...s.btn, ...s.btnPrimary, padding: '7px 12px', fontSize: 12 }}>
                              {encaisseOuvert === a.id ? 'Fermer' : 'Encaisser'}
                            </button>
                          )}
                          <button onClick={() => resilier(a)} style={{ ...s.btn, ...s.btnDanger, padding: '7px 12px', fontSize: 12 }}>Résilier</button>
                        </div>
                      )}
                    </div>

                    {/* ⚠️ UN BOUTON PAR MOYEN, pas une liste déroulante suivie
                        d'une validation : encaisser est un geste de comptoir, il
                        se fait en deux touches, la cliente devant soi. */}
                    {!resilie && !a.paye && encaisseOuvert === a.id && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.hairline}` }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: T.ink, marginBottom: 8 }}>
                          Comment {a.client_prenom} a-t-elle payé ses {Number(a.prix).toFixed(2)} € ?
                        </p>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {MOYENS_ENCAISSEMENT.map(m => (
                            <button key={m.cle} disabled={encaissantId === a.id}
                              onClick={() => encaisser(a, m.cle)}
                              style={{ ...s.btn, ...s.btnGhost, padding: '8px 12px', fontSize: 12, textAlign: 'left', opacity: encaissantId === a.id ? 0.6 : 1 }}>
                              <span style={{ fontWeight: 800 }}>{m.libelle}</span>
                              <span style={{ color: T.muted, fontWeight: 600 }}> · {m.detail}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Sess 5b : CRUD Praticiens RDV. prenom, nom, description, couleur_hex,
// photo_url (bucket Supabase Storage 'logos' avec naming praticien-{id}-{ts}),
// ordre, actif. Soft delete via deleted_at (compteurs RDV reservations preserves).
function TabRdvPraticiens({ commercantId, toast }) {
  const [praticiens, setPraticiens] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const initialForm = { prenom: '', nom: '', description: '', couleur_hex: '#6B35C4', photo_url: '', actif: true }
  const [form, setForm] = useState(initialForm)
  const firstLoadRef = useRef(true)
  const fileInputRef = useRef(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchPraticiens() }, [commercantId])

  async function fetchPraticiens() {
    if (firstLoadRef.current) setLoading(true)
    const { data } = await supabase
      .from('rdv_praticiens')
      .select('*')
      .eq('commercant_id', commercantId)
      .is('deleted_at', null)
      .order('ordre', { ascending: true })
      .order('created_at', { ascending: true })
    setPraticiens(data || [])
    if (firstLoadRef.current) { setLoading(false); firstLoadRef.current = false }
  }

  function openNew() { setForm(initialForm); setEditId(null); setShowForm(true) }
  function openEdit(p) {
    setForm({
      prenom: p.prenom || '',
      nom: p.nom || '',
      description: p.description || '',
      couleur_hex: p.couleur_hex || '#6B35C4',
      photo_url: p.photo_url || '',
      actif: p.actif !== false,
    })
    setEditId(p.id); setShowForm(true)
  }

  // Upload photo praticien dans le bucket 'logos' existant (pas de nouveau bucket
  // nécessaire). Naming praticien-{commercantId}-{ts}.{ext} pour distinguer
  // des logos commerçants.
  async function uploadPhoto(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    // Bug UX iPhone : les photos natives pesent 3-5 Mo. Compression client 400x400
    // JPEG q=0.85 -> ~30-100 Ko. Aucune action utilisateur requise.
    if (file.size > 15 * 1024 * 1024) { toast('Photo trop lourde (max 15 Mo brut)', 'error'); return }
    setUploading(true)
    const compressed = await compresserImage(file, { maxWidth: 400, maxHeight: 400, quality: 0.85 })
    const fileName = `praticien-${commercantId}-${Date.now()}.jpg`
    const { error } = await supabase.storage.from('logos').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' })
    if (error) { toast('Erreur upload photo', 'error'); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    setForm(f => ({ ...f, photo_url: urlData.publicUrl }))
    setUploading(false)
  }

  async function save() {
    if (!form.prenom.trim()) return toast('Prénom obligatoire', 'error')
    const payload = {
      commercant_id: commercantId,
      prenom: form.prenom.trim(),
      nom: form.nom.trim() || null,
      description: form.description.trim() || null,
      couleur_hex: form.couleur_hex || '#6B35C4',
      photo_url: form.photo_url || null,
      actif: !!form.actif,
    }
    setSaving(true)
    const { error } = editId
      ? await supabase.from('rdv_praticiens').update(payload).eq('id', editId)
      : await supabase.from('rdv_praticiens').insert(payload)
    setSaving(false)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast(editId ? 'Praticien mis à jour' : 'Praticien créé')
    setShowForm(false); setEditId(null); setForm(initialForm)
    fetchPraticiens()
  }

  async function toggleActif(p) {
    const { error } = await supabase.from('rdv_praticiens').update({ actif: !p.actif }).eq('id', p.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    fetchPraticiens()
  }

  async function softDelete(p) {
    if (!await confirme(confirmationSimple({ titre: 'Retirer cette personne de ton équipe ?', message: 'Les rendez-vous déjà pris avec elle ne bougent pas.', details: `${p.prenom}${p.nom ? ' ' + p.nom : ''}`, action: 'Oui, la retirer' }))) return
    const { error } = await supabase.from('rdv_praticiens').update({ deleted_at: new Date().toISOString() }).eq('id', p.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast('Praticien supprimé')
    fetchPraticiens()
  }

  if (loading) return <p style={{ color: T.muted, padding: 16 }}>Chargement…</p>

  return (
    <div>
      {/* Header avec bouton "Ajouter" */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.2px' }}>Praticiens</p>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{praticiens.length} praticien{praticiens.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={openNew}
          style={{ padding: '10px 16px', borderRadius: 100, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13, boxShadow: `0 4px 14px ${T.main}55` }}>
          + Ajouter un praticien
        </button>
      </div>

      {praticiens.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 28, textAlign: 'center', border: `1px solid ${T.hairline}` }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Aucun praticien</p>
          <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>Ajoute tes praticiens (ex : Sophie, Pierre) pour permettre aux clients de choisir avec qui ils prennent RDV. Si tu travailles seul, crée juste un praticien.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {praticiens.map(p => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.hairline}`, opacity: p.actif ? 1 : 0.55, display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Avatar circulaire avec photo ou initiales */}
              <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: '50%', background: p.couleur_hex || '#6B35C4', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, border: `2px solid ${p.couleur_hex || '#6B35C4'}33`, overflow: 'hidden' }}>
                {p.photo_url ? (
                  <img decoding="async" loading="lazy" src={p.photo_url} alt={p.prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                ) : (
                  <span>{(p.prenom?.[0] || '?').toUpperCase()}{(p.nom?.[0] || '').toUpperCase()}</span>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 800, fontSize: 14, color: T.ink }}>
                  {p.prenom} {p.nom || ''}
                  {!p.actif && <span style={{ color: '#DC2626', fontWeight: 700, fontSize: 11, marginLeft: 8 }}>Inactif</span>}
                </p>
                {p.description && <p style={{ fontSize: 12, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{p.description}</p>}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => toggleActif(p)} title={p.actif ? 'Désactiver' : 'Activer'}
                  style={{ padding: '6px 10px', border: `1px solid ${T.hairline}`, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: T.muted, fontFamily: '"DM Sans", sans-serif' }}>
                  {p.actif ? 'Désactiver' : 'Activer'}
                </button>
                <button onClick={() => openEdit(p)} title="Modifier"
                  style={{ padding: '6px 10px', border: `1px solid ${T.main}44`, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: T.main, fontFamily: '"DM Sans", sans-serif' }}>
                  Modifier
                </button>
                <button onClick={() => softDelete(p)} title="Supprimer"
                  style={{ padding: '6px 10px', border: '1px solid #DC262644', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#DC2626', fontFamily: '"DM Sans", sans-serif' }}>
                  Suppr.
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal formulaire création/édition */}
      {showForm && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90svh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, marginBottom: 14 }}>{editId ? 'Modifier le praticien' : 'Nouveau praticien'}</p>

            {/* Photo + couleur en haut */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, padding: 12, background: T.bg, borderRadius: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 70, height: 70, borderRadius: '50%', background: form.couleur_hex, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, overflow: 'hidden', border: `3px solid ${form.couleur_hex}55` }}>
                  {form.photo_url ? (
                    <img decoding="async" loading="lazy" src={form.photo_url} alt="Praticien" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                  ) : (
                    <span>{(form.prenom?.[0] || '?').toUpperCase()}{(form.nom?.[0] || '').toUpperCase()}</span>
                  )}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => uploadPhoto(e.target.files?.[0])}/>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  style={{ padding: '8px 12px', border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, borderRadius: 8, cursor: uploading ? 'default' : 'pointer', fontWeight: 700, fontSize: 12, fontFamily: '"DM Sans", sans-serif', marginBottom: 6 }}>
                  {uploading ? 'Upload…' : (form.photo_url ? 'Changer la photo' : 'Ajouter une photo')}
                </button>
                {form.photo_url && (
                  <button onClick={() => setForm(f => ({ ...f, photo_url: '' }))}
                    style={{ display: 'block', padding: '4px 8px', border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer', fontWeight: 600, fontSize: 11, fontFamily: '"DM Sans", sans-serif' }}>
                    Retirer la photo
                  </button>
                )}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: T.muted }}>Couleur</label>
                  <input type="color" value={form.couleur_hex} onChange={e => setForm({ ...form, couleur_hex: e.target.value })}
                    style={{ width: 36, height: 26, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'none' }}/>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Prénom *</label>
                <Input value={form.prenom} onChange={e => setForm({ ...form, prenom: e.target.value })} placeholder="Sophie"/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Nom</label>
                <Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Martin"/>
              </div>
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Description (optionnel)</label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Spécialiste coupe femme, 10 ans d'expérience" rows={2} style={{ marginBottom: 14 }}/>

            <div style={{ marginBottom: 16 }}>
              <Toggle value={form.actif} onChange={v => setForm({ ...form, actif: v })} label="Praticien actif (visible côté client)"/>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.deep, fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={save} disabled={saving}
                style={{ flex: 2, padding: '12px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14, opacity: saving ? 0.6 : 1, boxShadow: `0 4px 14px ${T.main}55` }}>
                {saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Créer le praticien')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sess 5c : CRUD Créneaux RDV par praticien. Différent de TabCreneaux (C&C) car
// pour RDV on a praticien_id (nullable = tous), pas_minutes (granularité réservation),
// pause optionnelle (déjeuner par exemple). Pas de capacite_temps ni max_commandes.
// V1 : créneaux récurrents par jour_semaine. Fermetures exceptionnelles = Sess fermetures
// reportée Sprint 3 (avec multi-prat fermetures par praticien).
function TabRdvCreneaux({ commercantId, commercant, toast }) {
  const JOURS_SEMAINE = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
  const JOURS_LABELS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dim.']
  const PAS_OPTIONS = [5, 10, 15, 30, 60]

  const [creneaux, setCreneaux] = useState([])
  const [praticiens, setPraticiens] = useState([])
  const [loading, setLoading] = useState(true)
  const [jourActif, setJourActif] = useState('lundi')
  const [praticienFiltre, setPraticienFiltre] = useState('all')  // 'all' | 'tous' | praticienId
  // Le planning par emplacement, décoché par défaut, et les emplacements
  // eux-mêmes. Une professeure de yoga donne cours à Mettet le mardi et à
  // Biesme le jeudi : ses plages de réservation ne sont pas les mêmes.
  const [parLieuRdv, setParLieuRdv] = useState(false)
  const [lieuxDispo, setLieuxDispo] = useState([])
  // Copie d'un jour vers d'autres jours (demande Alex 01/08, même geste que la
  // duplication des horaires du Profil) : on REMPLACE les créneaux des jours
  // cibles, sinon les copies successives s'empilent en doublons.
  const [copieCibles, setCopieCibles] = useState(new Set())
  const [copieLoading, setCopieLoading] = useState(false)
  // Jours où le commerce est déclaré FERMÉ dans les horaires du Profil : on
  // avertit avant d'y ouvrir des créneaux RDV (demande Alex 01/08), car un
  // créneau sur un jour fermé ne s'affiche jamais côté client.
  const joursFermesProfil = JOURS_SEMAINE.filter(j => commercant?.horaires_detail?.[j]?.ouvert === false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const initialForm = {
    praticien_id: 'tous',
    lieu_id: '',
    jour_semaine: 'lundi',
    heure_debut: '09:00',
    heure_fin: '18:00',
    pas_minutes: 15,
    avec_pause: false,
    pause_debut: '12:00',
    pause_fin: '13:00',
    actif: true,
  }
  const [form, setForm] = useState(initialForm)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchAll() }, [commercantId])

  async function fetchAll() {
    setLoading(true)
    const [{ data: cren }, { data: prat }, { data: comm }, { data: lieuxRdv }] = await Promise.all([
      supabase
        .from('rdv_creneaux')
        .select('*')
        .eq('commercant_id', commercantId)
        .is('deleted_at', null)
        .order('jour_semaine')
        .order('heure_debut'),
      supabase
        .from('rdv_praticiens')
        .select('id, prenom, nom, couleur_hex, actif')
        .eq('commercant_id', commercantId)
        .is('deleted_at', null)
        .order('ordre', { ascending: true }),
      supabase.from('commercants').select('planning_par_lieu').eq('id', commercantId).maybeSingle(),
      supabase.from('commercant_lieux')
        .select('id, type, jour_semaine, libelle, heure_debut, heure_fin, actif')
        .eq('commercant_id', commercantId).eq('actif', true),
    ])
    setCreneaux(cren || [])
    setPraticiens(prat || [])
    // ⚠️ Les emplacements ne servent QUE si le commerçant a coché « mes
    // horaires changent selon l'endroit ». Sans ce drapeau, aucun sélecteur
    // n'apparaît et les plages ne désignent aucun lieu, comme avant.
    setParLieuRdv(comm?.planning_par_lieu === true)
    setLieuxDispo(lieuxRdv || [])
    setLoading(false)
  }

  // Les emplacements proposables pour une plage de ce jour : ceux de la
  // tournée ce jour-là, et les lieux fixes, valables tous les jours.
  function lieuxDuJourRdv(jour) {
    return lieuxDispo.filter(l => l.type === 'permanent'
      || (l.type === 'hebdo' && l.jour_semaine === jour))
  }
  function nomLieuRdv(lieuId) {
    if (!lieuId) return null
    return lieuxDispo.find(l => l.id === lieuId)?.libelle || null
  }

  // Helper : récupère le nom d'un praticien à partir de son id (pour affichage)
  function praticienLabel(praticien_id) {
    if (!praticien_id) return 'Tous les praticiens'
    const p = praticiens.find(x => x.id === praticien_id)
    return p ? `${p.prenom}${p.nom ? ' ' + p.nom : ''}` : 'Praticien inconnu'
  }
  function praticienCouleur(praticien_id) {
    if (!praticien_id) return '#6B35C4'
    const p = praticiens.find(x => x.id === praticien_id)
    return p?.couleur_hex || '#6B35C4'
  }

  function creneauxDuJour() {
    return creneaux
      .filter(c => c.jour_semaine === jourActif)
      .filter(c => {
        if (praticienFiltre === 'all') return true
        if (praticienFiltre === 'tous') return c.praticien_id === null
        return c.praticien_id === praticienFiltre
      })
      .sort((a, b) => (a.heure_debut || '').localeCompare(b.heure_debut || ''))
  }

  function openNew() {
    setForm({ ...initialForm, jour_semaine: jourActif })
    setEditId(null); setShowForm(true)
  }
  function openEdit(c) {
    setForm({
      praticien_id: c.praticien_id || 'tous',
      lieu_id: c.lieu_id || '',
      jour_semaine: c.jour_semaine || 'lundi',
      heure_debut: (c.heure_debut || '09:00').slice(0,5),
      heure_fin: (c.heure_fin || '18:00').slice(0,5),
      pas_minutes: c.pas_minutes || 15,
      avec_pause: !!(c.pause_debut && c.pause_fin),
      pause_debut: (c.pause_debut || '12:00').slice(0,5),
      pause_fin: (c.pause_fin || '13:00').slice(0,5),
      actif: c.actif !== false,
    })
    setEditId(c.id); setShowForm(true)
  }

  async function save() {
    if (form.heure_fin <= form.heure_debut) return toast('Heure de fin doit être après l\'heure de début', 'error')
    if (form.avec_pause && form.pause_fin <= form.pause_debut) return toast('La pause est mal définie', 'error')
    // Jour fermé au Profil : le créneau ne servira à rien tant que les horaires
    // ne sont pas ouverts (le moteur de slots croise les deux). On prévient.
    if (joursFermesProfil.includes(form.jour_semaine) &&
        !await confirme(confirmationSimple({ titre: `Tu es déclaré fermé le ${form.jour_semaine}`, message: 'C’est ce que disent tes horaires dans le Profil. Tant que tu ne les ouvres pas, ce créneau ne s’affichera pas chez tes clients.', action: 'Le créer quand même', ton: 'principal' }))) return
    const payload = {
      commercant_id: commercantId,
      praticien_id: form.praticien_id === 'tous' ? null : form.praticien_id,
      // ⚠️ Vide ne veut pas dire « nulle part », il veut dire « là où se passe
      // l'activité ». C'est ce qui protège tous les commerces qui n'ont pas
      // activé le planning par emplacement, c'est-à-dire presque tous.
      lieu_id: parLieuRdv ? (form.lieu_id || null) : null,
      jour_semaine: form.jour_semaine,
      heure_debut: form.heure_debut + ':00',
      heure_fin: form.heure_fin + ':00',
      pas_minutes: parseInt(form.pas_minutes, 10) || 15,
      pause_debut: form.avec_pause ? form.pause_debut + ':00' : null,
      pause_fin:   form.avec_pause ? form.pause_fin + ':00'   : null,
      actif: !!form.actif,
    }
    setSaving(true)
    const { error } = editId
      ? await supabase.from('rdv_creneaux').update(payload).eq('id', editId)
      : await supabase.from('rdv_creneaux').insert(payload)
    setSaving(false)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast(editId ? 'Créneau mis à jour' : 'Créneau créé')
    setShowForm(false); setEditId(null); setForm(initialForm)
    fetchAll()
  }

  async function toggleActif(c) {
    const { error } = await supabase.from('rdv_creneaux').update({ actif: !c.actif }).eq('id', c.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    fetchAll()
  }

  // Copie TOUS les créneaux du jour affiché vers les jours cochés (praticiens
  // compris). Les jours cibles sont d'abord vidés : une copie remplace, elle
  // n'empile pas.
  async function copierVersJours() {
    const source = creneaux.filter(c => c.jour_semaine === jourActif)
    const cibles = [...copieCibles]
    if (cibles.length === 0) return
    if (source.length === 0) return toast('Aucun créneau à copier sur ce jour', 'error')
    const dejaRemplis = cibles.filter(j => creneaux.some(c => c.jour_semaine === j))
    if (dejaRemplis.length > 0 &&
        !await confirme(confirmationSimple({ titre: 'Des créneaux vont être remplacés', message: `Ceux du ${dejaRemplis.join(', ')} laisseront la place à ceux du ${jourActif}.`, action: 'Oui, les remplacer' }))) return
    setCopieLoading(true)
    const idsARemplacer = creneaux.filter(c => cibles.includes(c.jour_semaine)).map(c => c.id)
    if (idsARemplacer.length > 0) {
      const { error: errDel } = await supabase.from('rdv_creneaux')
        .update({ deleted_at: new Date().toISOString() }).in('id', idsARemplacer)
      if (errDel) { setCopieLoading(false); return toast(`Erreur : ${errDel.message}`, 'error') }
    }
    const lignes = cibles.flatMap(j => source.map(c => ({
      commercant_id: commercantId,
      praticien_id: c.praticien_id,
      jour_semaine: j,
      heure_debut: c.heure_debut,
      heure_fin: c.heure_fin,
      pas_minutes: c.pas_minutes,
      pause_debut: c.pause_debut,
      pause_fin: c.pause_fin,
      actif: c.actif,
    })))
    const { error } = await supabase.from('rdv_creneaux').insert(lignes)
    setCopieLoading(false)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    setCopieCibles(new Set())
    toast(`Créneaux copiés sur ${cibles.length} jour${cibles.length > 1 ? 's' : ''} 🟣`)
    fetchAll()
  }

  async function softDelete(c) {
    if (!await confirme(confirmationSimple({ titre: 'Supprimer ce créneau de rendez-vous ?', message: 'Tes clients ne pourront plus réserver sur cette plage.', details: `${c.jour_semaine} ${c.heure_debut?.slice(0,5)} – ${c.heure_fin?.slice(0,5)}`, action: 'Oui, supprimer ce créneau' }))) return
    const { error } = await supabase.from('rdv_creneaux').update({ deleted_at: new Date().toISOString() }).eq('id', c.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast('Créneau supprimé')
    fetchAll()
  }

  if (loading) return <p style={{ color: T.muted, padding: 16 }}>Chargement…</p>

  // Praticiens actifs uniquement pour le sélecteur du form (mais filtre garde tous)
  const praticiensActifs = praticiens.filter(p => p.actif !== false)
  const creneauxAffiches = creneauxDuJour()

  return (
    <div>
      {/* Header avec bouton "Ajouter" */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.2px' }}>Créneaux RDV</p>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Horaires hebdomadaires, avec ou sans praticien spécifique</p>
        </div>
        <button onClick={openNew}
          style={{ padding: '10px 16px', borderRadius: 100, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13, boxShadow: `0 4px 14px ${T.main}55` }}>
          + Ajouter un créneau
        </button>
      </div>

      {/* Filtre par praticien si ≥2 praticiens existent */}
      {praticiens.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tous' },
            { key: 'tous', label: 'Communs (tous prat.)' },
            ...praticiens.map(p => ({ key: p.id, label: `${p.prenom}${p.nom ? ' ' + p.nom[0] : ''}.`, color: p.couleur_hex })),
          ].map(opt => (
            <button key={opt.key} onClick={() => setPraticienFiltre(opt.key)}
              style={{ padding: '6px 12px', borderRadius: 100, border: `1.5px solid ${praticienFiltre === opt.key ? T.main : T.hairline}`, background: praticienFiltre === opt.key ? T.pale : '#fff', color: praticienFiltre === opt.key ? T.main : T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {opt.color && <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color }}/>}
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Tabs jour de la semaine */}
      <BandeDefilante libelle="les jours" style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 14, border: `1px solid ${T.hairline}`, overflowX: 'auto' }}>
        {JOURS_SEMAINE.map((j, i) => {
          const nbCreneaux = creneaux.filter(c => c.jour_semaine === j).length
          const ferme = joursFermesProfil.includes(j)
          return (
            <button key={j} onClick={() => setJourActif(j)}
              title={ferme ? 'Commerce fermé ce jour selon tes horaires (Profil)' : undefined}
              style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 12, background: jourActif === j ? T.bgPanel : 'transparent', color: jourActif === j ? '#fff' : ferme ? '#9CA3AF' : T.muted, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: ferme && jourActif !== j ? 0.65 : 1 }}>
              {JOURS_LABELS[i]}{ferme ? ' ·' : ''}
              {nbCreneaux > 0 && (
                <span style={{ background: jourActif === j ? T.main : T.pale, color: jourActif === j ? '#fff' : T.main, fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>
                  {nbCreneaux}
                </span>
              )}
            </button>
          )
        })}
      </BandeDefilante>

      {/* Jour fermé au Profil : un créneau y serait invisible côté client */}
      {joursFermesProfil.includes(jourActif) && (
        <div style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#78350F', lineHeight: 1.5 }}>
            Ton commerce est déclaré <strong>fermé le {jourActif}</strong> dans tes horaires (Paramètres → Profil).
            Les créneaux créés ici resteront invisibles pour tes clients tant que ce jour n&rsquo;est pas ouvert.
          </p>
        </div>
      )}

      {/* Copier le jour affiché vers d'autres jours (gain de temps : une
          semaine se configure en un geste au lieu de 7 saisies) */}
      {creneaux.filter(c => c.jour_semaine === jourActif).length > 0 && (
        <div style={{ background: '#fff', border: `1px solid ${T.hairline}`, borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
          <p style={{ fontSize: 11.5, fontWeight: 800, color: T.ink, margin: '0 0 8px' }}>
            Copier les créneaux du <span style={{ color: T.main }}>{jourActif}</span> vers :
          </p>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: copieCibles.size > 0 ? 10 : 0 }}>
            {JOURS_SEMAINE.filter(j => j !== jourActif).map(j => {
              const sel = copieCibles.has(j)
              const label = JOURS_LABELS[JOURS_SEMAINE.indexOf(j)] || j
              return (
                <button key={j} type="button"
                  onClick={() => setCopieCibles(prev => {
                    const next = new Set(prev)
                    if (next.has(j)) next.delete(j); else next.add(j)
                    return next
                  })}
                  style={{ padding: '5px 11px', borderRadius: 100, border: `1.5px solid ${sel ? T.main : T.hairline}`, background: sel ? T.main : '#fff', color: sel ? '#fff' : T.muted, fontWeight: 700, fontSize: 11.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                  {label}
                </button>
              )
            })}
          </div>
          {copieCibles.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={copierVersJours} disabled={copieLoading}
                style={{ padding: '7px 14px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: 12, cursor: copieLoading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                {copieLoading ? 'Copie…' : `Appliquer à ${copieCibles.size} jour${copieCibles.size > 1 ? 's' : ''}`}
              </button>
              <span style={{ fontSize: 10.5, color: T.muted, lineHeight: 1.4 }}>
                Les créneaux déjà présents ces jours-là seront remplacés.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Liste des créneaux du jour actif */}
      {creneauxAffiches.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 28, textAlign: 'center', border: `1px solid ${T.hairline}` }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Aucun créneau ce jour</p>
          <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            Ajoute un créneau pour ouvrir tes RDV ce jour-là. Tu peux créer des créneaux globaux (tous les praticiens) ou spécifiques à un praticien.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {creneauxAffiches.map(c => {
            const couleur = praticienCouleur(c.praticien_id)
            const label = praticienLabel(c.praticien_id)
            return (
              <div key={c.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.hairline}`, borderLeft: `4px solid ${couleur}`, opacity: c.actif ? 1 : 0.55, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, color: T.ink, marginBottom: 2 }}>
                    {c.heure_debut?.slice(0,5)} – {c.heure_fin?.slice(0,5)}
                    <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginLeft: 8 }}>· Pas {c.pas_minutes} min</span>
                  </p>
                  <div style={{ fontSize: 11, color: T.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: couleur }}/>
                      {label}
                    </span>
                    {c.pause_debut && c.pause_fin && (
                      <span>Pause {c.pause_debut.slice(0,5)} – {c.pause_fin.slice(0,5)}</span>
                    )}
                    {/* L'emplacement de cette plage, quand le commerçant en
                        tient plusieurs. Sans lui, deux plages identiques à deux
                        adresses différentes seraient indiscernables. */}
                    {parLieuRdv && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: c.lieu_id ? T.main : T.muted, fontWeight: c.lieu_id ? 700 : 500 }}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        {nomLieuRdv(c.lieu_id) || 'Partout ce jour-là'}
                      </span>
                    )}
                    {!c.actif && <span style={{ color: '#DC2626', fontWeight: 700 }}>Inactif</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => toggleActif(c)} title={c.actif ? 'Désactiver' : 'Activer'}
                    style={{ padding: '6px 10px', border: `1px solid ${T.hairline}`, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: T.muted, fontFamily: '"DM Sans", sans-serif' }}>
                    {c.actif ? 'Désact.' : 'Activer'}
                  </button>
                  <button onClick={() => openEdit(c)}
                    style={{ padding: '6px 10px', border: `1px solid ${T.main}44`, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: T.main, fontFamily: '"DM Sans", sans-serif' }}>
                    Modif.
                  </button>
                  <button onClick={() => softDelete(c)}
                    style={{ padding: '6px 10px', border: '1px solid #DC262644', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#DC2626', fontFamily: '"DM Sans", sans-serif' }}>
                    Suppr.
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal form création/édition */}
      {showForm && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90svh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, marginBottom: 14 }}>{editId ? 'Modifier le créneau' : 'Nouveau créneau'}</p>

            {/* Praticien */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Pour qui ?</label>
            <select value={form.praticien_id} onChange={e => setForm({ ...form, praticien_id: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${T.hairline}`, borderRadius: 8, fontSize: 14, fontFamily: '"DM Sans", sans-serif', marginBottom: 10, background: '#fff' }}>
              <option value="tous">Tous les praticiens (créneau commun)</option>
              {praticiensActifs.map(p => (
                <option key={p.id} value={p.id}>{p.prenom}{p.nom ? ' ' + p.nom : ''}</option>
              ))}
            </select>

            {/* Jour */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Jour de la semaine</label>
            <select value={form.jour_semaine} onChange={e => setForm({ ...form, jour_semaine: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${T.hairline}`, borderRadius: 8, fontSize: 14, fontFamily: '"DM Sans", sans-serif', marginBottom: 10, background: '#fff' }}>
              {JOURS_SEMAINE.map((j, i) => <option key={j} value={j}>{JOURS_LABELS[i] === 'Dim.' ? 'Dimanche' : JOURS_LABELS[i]}</option>)}
            </select>

            {/* ⚠️ L'EMPLACEMENT DE CETTE PLAGE. N'apparaît que si « mes horaires
                changent selon l'endroit » est coché dans Mes lieux : demander
                l'endroit à un salon de coiffure serait absurde.
                Une professeure de yoga donne cours à Mettet le mardi et à
                Biesme le jeudi ; ses plages de réservation ne sont pas les
                mêmes, et son client doit savoir où se présenter. */}
            {parLieuRdv && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Emplacement</label>
                <select value={form.lieu_id} onChange={e => setForm({ ...form, lieu_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${T.hairline}`, borderRadius: 8, fontSize: 14, fontFamily: '"DM Sans", sans-serif', marginBottom: 4, background: '#fff' }}>
                  <option value="">Partout où je suis ce jour-là</option>
                  {lieuxDuJourRdv(form.jour_semaine).map(l => (
                    <option key={l.id} value={l.id}>
                      {l.libelle}{l.heure_debut ? ` · ${String(l.heure_debut).slice(0, 5)}–${String(l.heure_fin || '').slice(0, 5)}` : ''}
                    </option>
                  ))}
                </select>
                <p style={{ fontSize: 11, color: T.muted, margin: '0 0 10px', lineHeight: 1.45 }}>
                  Laisse « partout » si tu proposes ces horaires quel que soit l’endroit.
                </p>
              </>
            )}

            {/* Horaires début/fin */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Début</label>
                <Input type="time" value={form.heure_debut} onChange={e => setForm({ ...form, heure_debut: e.target.value })}/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Fin</label>
                <Input type="time" value={form.heure_fin} onChange={e => setForm({ ...form, heure_fin: e.target.value })}/>
              </div>
            </div>

            {/* Pas de réservation */}
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Granularité réservation</label>
            <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
              {PAS_OPTIONS.map(p => (
                <button key={p} onClick={() => setForm({ ...form, pas_minutes: p })} type="button"
                  style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `1.5px solid ${form.pas_minutes === p ? T.main : T.hairline}`, background: form.pas_minutes === p ? T.pale : '#fff', color: form.pas_minutes === p ? T.main : T.muted, fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                  {p} min
                </button>
              ))}
            </div>

            {/* Pause optionnelle */}
            <div style={{ marginBottom: 10, padding: 10, background: T.bg, borderRadius: 10 }}>
              <Toggle value={form.avec_pause} onChange={v => setForm({ ...form, avec_pause: v })} label="Pause déjeuner ou autre"/>
              {form.avec_pause && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Pause début</label>
                    <Input type="time" value={form.pause_debut} onChange={e => setForm({ ...form, pause_debut: e.target.value })}/>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Pause fin</label>
                    <Input type="time" value={form.pause_fin} onChange={e => setForm({ ...form, pause_fin: e.target.value })}/>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <Toggle value={form.actif} onChange={v => setForm({ ...form, actif: v })} label="Créneau actif"/>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.deep, fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={save} disabled={saving}
                style={{ flex: 2, padding: '12px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14, opacity: saving ? 0.6 : 1, boxShadow: `0 4px 14px ${T.main}55` }}>
                {saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Créer le créneau')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sess 6 : CRUD Fermetures exceptionnelles (congés, jours fériés, formation, etc).
// Une fermeture bloque une plage de dates pour tous les praticiens (praticien_id = null)
// ou pour un praticien spécifique. Impact : l'app Yopper ne propose plus ces jours à
// la réservation, et l'AgendaRdv commerçant grise les cellules concernées.
function TabRdvFermetures({ commercantId, toast }) {
  const [fermetures, setFermetures] = useState([])
  const [praticiens, setPraticiens] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const initialForm = { praticien_id: 'tous', date_debut: today, date_fin: today, motif: '' }
  const [form, setForm] = useState(initialForm)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchAll() }, [commercantId])

  async function fetchAll() {
    setLoading(true)
    const [{ data: fer }, { data: prat }] = await Promise.all([
      supabase.from('rdv_fermetures').select('*').eq('commercant_id', commercantId).is('deleted_at', null).order('date_debut', { ascending: true }),
      supabase.from('rdv_praticiens').select('id, prenom, nom, couleur_hex, photo_url, actif').eq('commercant_id', commercantId).eq('actif', true).is('deleted_at', null).order('ordre', { ascending: true }),
    ])
    setFermetures(fer || [])
    setPraticiens(prat || [])
    setLoading(false)
  }

  function openNew() { setForm(initialForm); setEditId(null); setShowForm(true) }
  function openEdit(f) {
    setForm({
      praticien_id: f.praticien_id || 'tous',
      date_debut: f.date_debut,
      date_fin: f.date_fin,
      motif: f.motif || '',
    })
    setEditId(f.id); setShowForm(true)
  }

  async function save() {
    if (!form.date_debut || !form.date_fin) return toast('Dates obligatoires', 'error')
    if (form.date_fin < form.date_debut) return toast('La date de fin doit être après la date de début', 'error')
    const payload = {
      commercant_id: commercantId,
      praticien_id: form.praticien_id === 'tous' ? null : form.praticien_id,
      date_debut: form.date_debut,
      date_fin: form.date_fin,
      motif: form.motif.trim() || null,
    }
    setSaving(true)
    const { error } = editId
      ? await supabase.from('rdv_fermetures').update(payload).eq('id', editId)
      : await supabase.from('rdv_fermetures').insert(payload)
    setSaving(false)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast(editId ? 'Fermeture mise à jour' : 'Fermeture enregistrée')
    setShowForm(false); setEditId(null); setForm(initialForm)
    fetchAll()
  }

  async function softDelete(f) {
    const label = f.date_debut === f.date_fin
      ? `Supprimer la fermeture du ${f.date_debut} ?`
      : `Supprimer la fermeture du ${f.date_debut} au ${f.date_fin} ?`
    if (!await confirme(confirmationSimple({ titre: 'Supprimer cette fermeture ?', message: 'Ces jours redeviendront ouverts à la réservation.', details: label, action: 'Oui, supprimer la fermeture' }))) return
    const { error } = await supabase.from('rdv_fermetures').update({ deleted_at: new Date().toISOString() }).eq('id', f.id)
    if (error) return toast(`Erreur : ${error.message}`, 'error')
    toast('Fermeture supprimée')
    fetchAll()
  }

  function praticienLabel(pid) {
    if (!pid) return 'Tous les praticiens'
    const p = praticiens.find(x => x.id === pid)
    return p ? `${p.prenom}${p.nom ? ' ' + p.nom : ''}` : 'Praticien inconnu'
  }
  function praticienCouleur(pid) {
    if (!pid) return T.main
    const p = praticiens.find(x => x.id === pid)
    return p?.couleur_hex || T.main
  }
  function formatDateLabel(iso) {
    const d = new Date(iso + 'T12:00:00')
    return d.toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) return <p style={{ color: T.muted, padding: 16 }}>Chargement…</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 900, color: T.ink, letterSpacing: '-0.2px' }}>Fermetures exceptionnelles</p>
          <p style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>Congés, jours fériés, formation, autre. Bloque les RDV côté client.</p>
        </div>
        <button onClick={openNew}
          style={{ padding: '10px 16px', borderRadius: 100, border: 'none', cursor: 'pointer', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', fontWeight: 800, fontSize: 13, boxShadow: `0 4px 14px ${T.main}55` }}>
          + Ajouter une fermeture
        </button>
      </div>

      {fermetures.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 14, padding: 28, textAlign: 'center', border: `1px solid ${T.hairline}` }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6 }}>Aucune fermeture prévue</p>
          <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>Note tes prochains congés ou jours de fermeture ici. Les clients ne pourront pas prendre RDV sur ces dates.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fermetures.map(f => {
            const couleur = praticienCouleur(f.praticien_id)
            const isPast = f.date_fin < today
            return (
              <div key={f.id} style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', border: `1px solid ${T.hairline}`, borderLeft: `4px solid ${couleur}`, opacity: isPast ? 0.55 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 800, fontSize: 14, color: T.ink, marginBottom: 2 }}>
                    {f.date_debut === f.date_fin
                      ? formatDateLabel(f.date_debut)
                      : `${formatDateLabel(f.date_debut)} → ${formatDateLabel(f.date_fin)}`}
                    {isPast && <span style={{ fontSize: 11, color: T.muted, fontWeight: 600, marginLeft: 8 }}>(passée)</span>}
                  </p>
                  <div style={{ fontSize: 12, color: T.muted, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: couleur }}/>
                      {praticienLabel(f.praticien_id)}
                    </span>
                    {f.motif && <span style={{ fontStyle: 'italic' }}>{f.motif}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => openEdit(f)}
                    style={{ padding: '6px 10px', border: `1px solid ${T.main}44`, background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: T.main, fontFamily: '"DM Sans", sans-serif' }}>Modif.</button>
                  <button onClick={() => softDelete(f)}
                    style={{ padding: '6px 10px', border: '1px solid #DC262644', background: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 11, color: '#DC2626', fontFamily: '"DM Sans", sans-serif' }}>Suppr.</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90svh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, marginBottom: 14 }}>{editId ? 'Modifier la fermeture' : 'Nouvelle fermeture'}</p>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Pour qui ?</label>
            <select value={form.praticien_id} onChange={e => setForm({ ...form, praticien_id: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', border: `1.5px solid ${T.hairline}`, borderRadius: 8, fontSize: 14, fontFamily: '"DM Sans", sans-serif', marginBottom: 10, background: '#fff' }}>
              <option value="tous">Tous les praticiens (fermeture complète)</option>
              {praticiens.map(p => (
                <option key={p.id} value={p.id}>{p.prenom}{p.nom ? ' ' + p.nom : ''}</option>
              ))}
            </select>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Du</label>
                <Input type="date" value={form.date_debut} onChange={e => setForm({ ...form, date_debut: e.target.value })}/>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Au</label>
                <Input type="date" value={form.date_fin} onChange={e => setForm({ ...form, date_fin: e.target.value })}/>
              </div>
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Motif (optionnel)</label>
            <Input value={form.motif} onChange={e => setForm({ ...form, motif: e.target.value })} placeholder="Congés d'été, jour férié, formation..." style={{ marginBottom: 16 }}/>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowForm(false)}
                style={{ flex: 1, padding: '12px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.deep, fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={save} disabled={saving}
                style={{ flex: 2, padding: '12px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontSize: 14, opacity: saving ? 0.6 : 1, boxShadow: `0 4px 14px ${T.main}55` }}>
                {saving ? 'Enregistrement…' : (editId ? 'Enregistrer' : 'Créer la fermeture')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Onglet CHIFFRES ─────────────────────────────────────────────────────────
// Le tableau de bord promis par la page d'accueil depuis le premier jour, et
// qui n'existait pas.
//
// La règle de composition : un commerçant regarde ses chiffres debout, entre
// deux clients. S'il lui faut plus de dix secondes pour savoir si sa semaine
// est bonne, il ne revient pas. Donc trois blocs, dans l'ordre de ce qui
// l'intéresse : ce qu'il a gagné, ce qui cloche, ce qui se vend.
//
// ⚠️ UN COMMERCE QUI DÉMARRE EST À ZÉRO PARTOUT, et c'est normal. L'écran ne
// doit pas ressembler à un bulletin de notes : quand il n'y a rien, il le dit
// avec le geste suivant, il n'affiche pas une rangée de zéros.
// ─── La courbe jour par jour ─────────────────────────────────────────────────
//
// Des barres, pas une ligne. Une ligne suggère une continuité entre deux jours
// qui n'existe pas : on ne vend pas « un peu » entre mardi et mercredi. Les
// journées vides restent visibles, en creux, sinon la période paraît pleine.
//
// L'échelle part TOUJOURS de zéro. Une échelle tronquée transforme une hausse
// de 3 % en montagne, et c'est le mensonge le plus courant des tableaux de bord.
function Courbe({ points = [], euros }) {
  const max = Math.max(...points.map(p => p.montant), 0)
  if (max <= 0) return null
  const jourCourt = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`)
    return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
  }
  const meilleur = points.reduce((a, b) => (b.montant > a.montant ? b : a), points[0])
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 96, marginBottom: 6 }}>
        {points.map(p => (
          <div key={p.jour} title={`${jourCourt(p.jour)} : ${euros(p.montant)}`}
            style={{ flex: 1, minWidth: 2, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
            <div style={{
              width: '100%',
              height: `${Math.max(p.montant > 0 ? 4 : 2, Math.round((p.montant / max) * 100))}%`,
              borderRadius: 3,
              background: p.montant > 0 ? `linear-gradient(180deg, ${T.mid}, ${T.main})` : T.hairline,
            }}/>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.muted, fontWeight: 700 }}>
        <span>{jourCourt(points[0].jour)}</span>
        <span>{jourCourt(points[points.length - 1].jour)}</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12.5, color: T.deep, lineHeight: 1.55 }}>
        Ta meilleure journée : <strong style={{ color: T.main }}>{jourCourt(meilleur.jour)}</strong>, {euros(meilleur.montant)}.
      </p>
    </div>
  )
}

// ─── Les moments de pointe ───────────────────────────────────────────────────
//
// ⚠️ LA CONCLUSION SE TAIT SOUS UN CERTAIN VOLUME. Sur quatre commandes,
// « ton heure de pointe est 14h » ne décrit rien d'autre que le hasard : les
// barres restent affichées, la phrase disparaît. Même règle que l'évolution en
// pourcentage et que la note moyenne.
function Moments({ moments }) {
  const { heures = [], jours = [], pic_heure, pic_jour } = moments || {}
  const maxH = Math.max(...heures.map(h => h.nombre), 0)
  const maxJ = Math.max(...jours.map(j => j.nombre), 0)
  if (maxH <= 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p style={{ margin: '0 0 7px', fontSize: 11.5, fontWeight: 700, color: T.muted }}>Par heure (heure belge)</p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 56 }}>
          {heures.map(h => (
            <div key={h.heure} title={`${h.heure}h : ${h.nombre}`} style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end' }}>
              <div style={{ width: '100%', height: `${Math.max(h.nombre > 0 ? 6 : 3, Math.round((h.nombre / maxH) * 100))}%`, borderRadius: 3, background: h.nombre > 0 ? T.main : T.hairline }}/>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.muted, fontWeight: 700, marginTop: 4 }}>
          <span>0h</span><span>12h</span><span>23h</span>
        </div>
      </div>
      <div>
        <p style={{ margin: '0 0 7px', fontSize: 11.5, fontWeight: 700, color: T.muted }}>Par jour de la semaine</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {jours.map(j => (
            <div key={j.jour} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ height: 44, display: 'flex', alignItems: 'flex-end' }}>
                <div style={{ width: '100%', height: `${maxJ > 0 ? Math.max(j.nombre > 0 ? 8 : 4, Math.round((j.nombre / maxJ) * 100)) : 4}%`, borderRadius: 4, background: j.nombre > 0 ? T.main : T.hairline }}/>
              </div>
              <p style={{ margin: '5px 0 0', fontSize: 10.5, fontWeight: 800, color: T.muted }}>{j.nom.slice(0, 2)}</p>
            </div>
          ))}
        </div>
      </div>
      {pic_heure && pic_jour ? (
        <p style={{ margin: 0, fontSize: 12.5, color: T.deep, lineHeight: 1.55 }}>
          On te commande surtout le <strong style={{ color: T.main }}>{pic_jour.nom.toLowerCase()}</strong>,
          et autour de <strong style={{ color: T.main }}>{pic_heure.heure}h</strong>.
          C&rsquo;est le meilleur moment pour publier une offre.
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.55 }}>
          Pas encore assez de commandes pour dégager une tendance fiable. Les barres montrent
          ce qui s&rsquo;est passé, sans en tirer de conclusion.
        </p>
      )}
    </div>
  )
}

function TabStatistiques({ commercantId, toast }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [jours, setJours] = useState(30)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { charger() }, [commercantId, jours])

  async function charger() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast('Session expirée, reconnecte-toi.', 'error'); setLoading(false); return }
      const r = await fetch(`/api/dashboard/statistiques?commercant_id=${commercantId}&jours=${jours}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await r.json()
      if (j?.ok) setData(j)
    } catch { /* l'écran garde ses valeurs précédentes */ }
    setLoading(false)
  }

  const euros = (n) => `${Number(n || 0).toFixed(2).replace('.', ',')} €`

  // Une flèche colorée ne dit rien à qui la regarde vite. Le sens s'écrit.
  function Evolution({ e }) {
    if (!e) return null
    const monte = e.sens === 'hausse'
    const stable = e.sens === 'stable'
    const couleur = stable ? T.muted : monte ? '#059669' : '#DC2626'
    return (
      <span style={{ fontSize: 11.5, fontWeight: 800, color: couleur, marginLeft: 8 }}>
        {stable ? '=' : monte ? '↑' : '↓'} {Math.abs(e.pct)} % {stable ? '' : monte ? 'de plus' : 'de moins'}
        <span style={{ color: T.muted, fontWeight: 600 }}> qu&rsquo;avant</span>
      </span>
    )
  }

  function Bloc({ titre, enfants }) {
    return (
      <div style={{ ...s.card }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 12px' }}>{titre}</p>
        {enfants}
      </div>
    )
  }

  if (loading && !data) {
    return (
      <div>
        <h2 style={s.h2}>Tes chiffres</h2>
        <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement…</p>
      </div>
    )
  }

  const a = data?.argent
  const att = data?.attention
  const aud = data?.audience

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ ...s.h2, margin: 0 }}>Tes chiffres</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90].map(n => (
            <button key={n} onClick={() => setJours(n)}
              style={{ padding: '5px 11px', borderRadius: 100, border: `1.5px solid ${jours === n ? T.main : T.hairline}`, background: jours === n ? T.main : '#fff', color: jours === n ? '#fff' : T.deep, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
              {n} jours
            </button>
          ))}
        </div>
      </div>

      {/* Rien encore : on le dit, et on donne le geste suivant. */}
      {data?.vide && (
        <div style={{ ...s.card, background: T.pale, border: `1.5px solid ${T.main}22` }}>
          <p style={{ margin: 0, fontSize: 13.5, color: T.deep, lineHeight: 1.6, fontWeight: 600 }}>
            {data.vide}
          </p>
        </div>
      )}

      {!data?.vide && a && (
        <>
          {/* ─── Ce que ça a rapporté ─────────────────────────────────────── */}
          {/* ⚠️ LE TOTAL COMPTE LES RENDEZ-VOUS À LEUR PRIX COMPLET (Alex,
              09/08). La première version n'affichait que l'encaissé en ligne,
              c'est-à-dire l'acompte : 8,75 € pour une coupe à 35 €. Le
              commerçant en concluait, à juste titre, que ses rendez-vous ne
              comptaient pas. La ventilation entre ce que Stripe a versé et ce
              qui se règle au comptoir reste entière dans la Comptabilité. */}
          <div style={{ background: T.bgPanel, borderRadius: 16, padding: '20px 18px', marginBottom: 12, color: '#fff' }}>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              Chiffre d&rsquo;affaires sur {jours} jours
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
              {euros(a.chiffre_affaires)}
            </p>
            {a.evolution_ca && (
              <p style={{ margin: '8px 0 0', fontSize: 12.5 }}>
                <span style={{ color: a.evolution_ca.sens === 'baisse' ? '#FCA5A5' : '#86EFAC', fontWeight: 800 }}>
                  {a.evolution_ca.sens === 'stable' ? '=' : a.evolution_ca.sens === 'hausse' ? '↑' : '↓'} {Math.abs(a.evolution_ca.pct)} %
                </span>
                <span style={{ color: T.light }}> par rapport aux {jours} jours précédents</span>
              </p>
            )}
            {/* ⚠️ LA TROISIÈME PART MANQUAIT, ET AVEC ELLE TOUT UN MÉTIER
                (Alex, 17/08). Les abonnements n'entraient dans aucun chiffre :
                une professeure de yoga qui vend surtout des abonnements voyait
                un tableau de bord à zéro.

                Une part ne s'affiche que si elle existe, et la répartition
                entière disparaît s'il n'en reste qu'une : elle répéterait
                alors le grand chiffre juste au-dessus. Personne n'a besoin de
                lire « Abonnements 0 € » dans une boulangerie. */}
            {[a.ca_produits, a.ca_prestations, a.ca_abonnements].filter(v => v > 0).length >= 2 && (
              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
                {[
                  { label: 'Produits', valeur: a.ca_produits },
                  { label: 'Prestations', valeur: a.ca_prestations },
                  { label: 'Abonnements', valeur: a.ca_abonnements },
                ].filter(part => part.valeur > 0).map(part => (
                  <div key={part.label} style={{ flex: 1, background: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: '9px 12px' }}>
                    <p style={{ margin: 0, fontSize: 10.5, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{part.label}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 16, fontWeight: 800, lineHeight: 1.1 }}>{euros(part.valeur)}</p>
                  </div>
                ))}
              </div>
            )}
            <p style={{ margin: '12px 0 0', fontSize: 11.5, color: T.light, lineHeight: 1.5 }}>
              Dont <strong style={{ color: '#fff' }}>{euros(a.encaisse_en_ligne)}</strong> encaissés en ligne
              {a.au_comptoir > 0 && <> et <strong style={{ color: '#fff' }}>{euros(a.au_comptoir)}</strong> à régler chez toi</>}.
              Le détail, la TVA et les frais sont dans Comptabilité.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { label: 'Commandes', valeur: a.ventes, evo: a.evolution_ventes },
              { label: 'Panier moyen', valeur: euros(a.panier_moyen) },
              { label: 'Rendez-vous', valeur: a.rendez_vous },
            ].map(k => (
              <div key={k.label} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${T.hairline}` }}>
                <p style={{ margin: 0, fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</p>
                <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800, color: T.ink, lineHeight: 1.1 }}>
                  {k.valeur}
                </p>
                <Evolution e={k.evo}/>
              </div>
            ))}
          </div>

          {/* ─── Ce qui cloche ────────────────────────────────────────────────
              Affiché SEULEMENT s'il y a quelque chose à dire. Un bloc « 0
              commande non récupérée » n'apprend rien et occupe l'écran. */}
          {(att?.non_recuperees?.nombre > 0 || (att?.annulations?.annules ?? 0) > 0) && (
            <Bloc titre="À regarder" enfants={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {att.non_recuperees.nombre > 0 && (
                  <p style={{ margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
                    <strong style={{ color: '#B45309' }}>{att.non_recuperees.nombre} commande{att.non_recuperees.nombre > 1 ? 's' : ''} payée{att.non_recuperees.nombre > 1 ? 's' : ''} mais jamais retirée{att.non_recuperees.nombre > 1 ? 's' : ''}</strong>
                    {' '}({euros(att.non_recuperees.montant)}). Un appel suffit souvent à récupérer le client.
                  </p>
                )}
                {(att.annulations?.annules ?? 0) > 0 && (
                  <p style={{ margin: 0, fontSize: 13, color: T.deep, lineHeight: 1.55 }}>
                    <strong>{att.annulations.annules} annulation{att.annulations.annules > 1 ? 's' : ''}</strong> sur {att.annulations.total},
                    soit {att.annulations.pct} %.
                  </p>
                )}
              </div>
            }/>
          )}

          {/* ─── La courbe ────────────────────────────────────────────────────
              Un point par jour, journées vides comprises. Sans elles, deux
              ventes espacées de trois semaines donneraient deux barres collées
              et l'effet d'une offre du jour deviendrait illisible. */}
          {data.courbe?.length > 0 && data.courbe.some(j => j.montant > 0) && (
            <Bloc titre={`Jour par jour sur ${jours} jours`} enfants={<Courbe points={data.courbe} euros={euros}/>}/>
          )}

          {/* ─── Quand on te commande ─────────────────────────────────────────
              Le moment de la DEMANDE, pas celui du retrait : c'est lui qui dit
              quand publier une offre. Le retrait vit déjà dans l'agenda. */}
          {data.moments?.total > 0 && (
            <Bloc titre="Quand on te commande" enfants={<Moments moments={data.moments}/>}/>
          )}

          {/* ─── Ce qui se réserve ───────────────────────────────────────────── */}
          {data.catalogue?.prestations?.length > 0 && (
            <Bloc titre="Ce qui se réserve le plus" enfants={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.catalogue.prestations.map((p, i) => (
                  <div key={p.nom} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 20, fontSize: 12, fontWeight: 800, color: T.muted }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: T.main }}>{p.quantite}×</span>
                    <span style={{ fontSize: 12, color: T.muted, fontWeight: 600, minWidth: 62, textAlign: 'right' }}>{euros(p.montant)}</span>
                  </div>
                ))}
              </div>
            }/>
          )}

          {/* ─── Ce qui se vend ───────────────────────────────────────────── */}
          {data.catalogue?.top?.length > 0 && (
            <Bloc titre="Ce qui part le plus" enfants={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {data.catalogue.top.map((art, i) => (
                  <div key={art.nom} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 20, fontSize: 12, fontWeight: 800, color: T.muted }}>{i + 1}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.nom}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: T.main }}>{art.quantite}×</span>
                    <span style={{ fontSize: 12, color: T.muted, fontWeight: 600, minWidth: 62, textAlign: 'right' }}>{euros(art.montant)}</span>
                  </div>
                ))}
              </div>
            }/>
          )}
        </>
      )}

      {/* ─── Qui te suit ─────────────────────────────────────────────────────
          Toujours affiché, même à zéro vente : c'est ce qui bouge en premier
          chez un commerce qui démarre, et c'est encourageant. */}
      {aud && (
        <Bloc titre="Qui te suit" enfants={
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* ⚠️ LES VUES SONT ICI, PAS DANS LE BANDEAU DES VENTES, et c'est
                voulu : le bandeau disparaît quand tout est à zéro, or c'est
                précisément le moment où les vues sont le SEUL chiffre qui
                bouge. Un commerçant qui vient de s'inscrire a besoin de voir
                qu'on le regarde avant d'avoir vendu quoi que ce soit. */}
            {aud.vues && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, fontSize: 13.5, color: T.deep, lineHeight: 1.55 }}>
                  <strong style={{ fontSize: 18, color: T.main }}>{aud.vues.nombre}</strong>
                  {' '}ouverture{aud.vues.nombre > 1 ? 's' : ''} de ta fiche sur {jours} jours.
                  {aud.vues.nombre === 0 && ' Le compteur démarre : partage ton lien pour lancer la machine.'}
                </p>
                <Evolution e={aud.vues.evolution}/>
              </div>
            )}
            <p style={{ margin: 0, fontSize: 13.5, color: T.deep, lineHeight: 1.55 }}>
              <strong style={{ fontSize: 18, color: T.main }}>{aud.favoris}</strong>
              {' '}habitant{aud.favoris > 1 ? 's ont' : ' a'} mis ton commerce en favori.
              {aud.favoris > 0 && ' Ils sont prévenus de tes nouveautés.'}
            </p>
            {aud.note
              ? (
                <p style={{ margin: 0, fontSize: 13.5, color: T.deep, lineHeight: 1.55 }}>
                  Note moyenne <strong style={{ color: T.main }}>{String(aud.note.note).replace('.', ',')}/5</strong>, sur {aud.note.nombre} avis.
                </p>
              )
              : (
                <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.55 }}>
                  Pas encore assez d&rsquo;avis pour afficher une note. Il en faut au moins trois :
                  en dessous, une note dit ce qu&rsquo;une personne a pensé, pas ce que vaut ton commerce.
                </p>
              )}
            {aud.deals?.vues > 0 && (
              <p style={{ margin: 0, fontSize: 13.5, color: T.deep, lineHeight: 1.55 }}>
                Tes offres ont été vues <strong>{aud.deals.vues}</strong> fois
                {aud.deals.tauxClic != null && `, et ${aud.deals.tauxClic} % de ceux qui les ont vues ont cliqué`}.
              </p>
            )}
          </div>
        }/>
      )}

      <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.55, margin: '4px 2px 0' }}>
        Tu ne vois jamais qui a commandé ni qui t&rsquo;a mis en favori : seulement des nombres.
        C&rsquo;est la promesse faite aux habitants, et c&rsquo;est ce qui les met en confiance.
      </p>
    </div>
  )
}

// ─── Onglet SIGNAUX ──────────────────────────────────────────────────────────
// Deux natures de messages arrivent au commerçant, on ne les mélange pas :
//   • ENVIES        : ce que des habitants ont voulu faire chez lui et qu'ils
//                     n'ont pas pu. Uniquement des NOMBRES (RGPD : il ne saura
//                     jamais QUI a demandé, c'est la promesse de la page
//                     d'accueil).
//   • SIGNALEMENTS  : les erreurs de sa fiche, qu'il corrige lui-même.
//
// Pourquoi cet écran existe (décision d'Alex du 05/08). Un commerçant qui a
// déjà un logiciel de rendez-vous peut rester chez Yoppaa gratuitement : ce
// sont ces chiffres qui font le travail. On énonce un FAIT, jamais une offre.
// « 12 habitants ont voulu prendre rendez-vous chez toi, dont 4 après 19h » est
// une information sur SON commerce ; il en tire lui-même la conclusion. Écrire
// « passe à la formule supérieure » le braquerait.
function TabEnvies({ commercantId, toast }) {
  const [envies, setEnvies] = useState([])
  const [reglages, setReglages] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ouvrirReglages, setOuvrirReglages] = useState(false)
  const [enregistre, setEnregistre] = useState(false)
  const dejaMarque = useRef(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { charger() }, [commercantId])

  async function appel(options) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast('Session expirée, reconnecte-toi.', 'error'); return null }
    const r = await fetch(`/api/dashboard/signaux${options?.method ? '' : `?commercant_id=${commercantId}`}`, {
      method: options?.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: options?.body ? JSON.stringify({ commercant_id: commercantId, ...options.body }) : undefined,
    })
    return r.json().catch(() => null)
  }

  async function charger() {
    setLoading(true)
    const j = await appel()
    if (j?.ok) {
      setEnvies(j.envies || [])
      setReglages(j.reglages || null)
      // Marquage « vu » automatique : le commerçant n'a pas à cliquer pour
      // dire qu'il a regardé (zéro friction). Une seule fois par ouverture.
      if (!dejaMarque.current && j.nouvelles > 0) {
        dejaMarque.current = true
        appel({ method: 'POST', body: { action: 'marquer-vu' } })
      }
    }
    setLoading(false)
  }

  async function sauverReglages(patch) {
    const suivant = { ...reglages, ...patch }
    setReglages(suivant)
    const j = await appel({ method: 'POST', body: { action: 'reglages', ...patch } })
    if (!j?.ok) { toast(j?.error || 'Enregistrement impossible.', 'error'); charger(); return }
    setEnregistre(true)
    setTimeout(() => setEnregistre(false), 2000)
  }

  const total30 = envies.reduce((n, e) => n + Number(e.trente_jours || 0), 0)
  const soir30 = envies.reduce((n, e) => n + Number(e.soir_30j || 0), 0)
  const weekend30 = envies.reduce((n, e) => n + Number(e.weekend_30j || 0), 0)
  const horsOuverture = phraseHorsOuverture({ soir: soir30, weekend: weekend30 })

  if (loading) {
    return (
      <div>
        <h2 style={s.h2}>Ce que les habitants te demandent</h2>
        <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement…</p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={s.h2}>Ce que les habitants te demandent</h2>
      <p style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.55 }}>
        Quand quelqu&rsquo;un cherche quelque chose chez toi qu&rsquo;il ne trouve pas encore ici,
        il le fait savoir. Tu vois les nombres, jamais les personnes.
      </p>

      {total30 > 0 && (
        <div style={{ background: T.bgPanel, borderRadius: 16, padding: '20px 18px', marginBottom: 14, color: '#fff' }}>
          <p style={{ margin: 0, fontSize: 34, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
            {total30}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 14, fontWeight: 700, lineHeight: 1.5 }}>
            {total30 > 1 ? 'demandes reçues ces 30 derniers jours' : 'demande reçue ces 30 derniers jours'}
          </p>
          {horsOuverture && (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: T.light, lineHeight: 1.55 }}>
              {horsOuverture.charAt(0).toUpperCase() + horsOuverture.slice(1)}.
            </p>
          )}
        </div>
      )}

      {envies.length === 0 && (
        <div style={{ ...s.card, textAlign: 'center', padding: '2rem 1rem' }}>
          <Icon name="signal" size={30} color={T.main} strokeWidth={1.6}/>
          <p style={{ fontWeight: 800, color: T.ink, margin: '10px 0 4px' }}>
            Personne n&rsquo;a encore levé la main
          </p>
          <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
            Dès qu&rsquo;un habitant voudra commander, réserver ou se faire livrer chez toi,
            le compteur monte ici. Même la nuit, même le dimanche.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {envies.map(e => {
          const libelle = libelleEnvie(e.type)
          const n30 = Number(e.trente_jours || 0)
          const n7 = Number(e.sept_jours || 0)
          const hors = phraseHorsOuverture({ soir: Number(e.soir_30j || 0), weekend: Number(e.weekend_30j || 0) })
          return (
            <div key={e.type} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${T.hairline}`, borderLeft: `4px solid ${T.main}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: T.main, lineHeight: 1 }}>{n30}</span>
                <span style={{ fontWeight: 800, fontSize: 14, color: T.ink, flex: 1, minWidth: 0 }}>
                  {libelle.court}
                </span>
                {n7 > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, color: T.main, background: T.pale, padding: '2px 8px', borderRadius: 100 }}>
                    {n7} cette semaine
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: T.deep, lineHeight: 1.5, margin: '8px 0 0' }}>
                {libelle.phrase(n30)} ces 30 derniers jours{hors ? `, ${hors}` : ''}.
              </p>
              {Number(e.total || 0) > n30 && (
                <p style={{ fontSize: 11, color: T.muted, fontWeight: 600, margin: '6px 0 0' }}>
                  {e.total} depuis le début
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* ─── Réglages : le droit de dire non ─────────────────────────────────
          Un signal qui ne l'intéresse pas devient du bruit et abîme la
          confiance dans les suivants. Il doit pouvoir couper, sans avoir à le
          redemander chaque semaine. */}
      {reglages && (
        <div style={{ ...s.card, marginTop: 16 }}>
          <button onClick={() => setOuvrirReglages(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <Icon name="sliders" size={16} color={T.muted}/>
            <span style={{ fontWeight: 800, fontSize: 14, color: T.ink, flex: 1 }}>Quand veux-tu être prévenu ?</span>
            {enregistre && <span style={{ fontSize: 11, fontWeight: 800, color: '#10B981' }}>Enregistré</span>}
            <Icon name={ouvrirReglages ? 'chevU' : 'chevD'} size={16} color={T.muted}/>
          </button>

          {ouvrirReglages && (
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={s.label}>À partir de combien de demandes</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Input type="number" min={0} max={100} value={reglages.seuil ?? 5}
                    onChange={ev => setReglages({ ...reglages, seuil: ev.target.value })}
                    onBlur={ev => sauverReglages({ seuil: ev.target.value })}
                    style={{ width: 90 }} />
                  <span style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
                    En dessous, on te laisse tranquille. Mets 0 pour ne jamais recevoir d&rsquo;email.
                  </span>
                </div>
              </div>

              <Toggle value={reglages.email_actif !== false}
                onChange={v => sauverReglages({ email_actif: v })}
                label="M'envoyer un récapitulatif par email" />

              <div>
                <label style={s.label}>Faire une pause</label>
                <select value={reglages.pause_jusqu ? 'active' : '0'}
                  onChange={ev => sauverReglages({ pause_mois: ev.target.value === 'active' ? 0 : Number(ev.target.value) })}
                  style={{ ...s.input, width: 'auto', minWidth: 200 }}>
                  <option value="0">Pas de pause</option>
                  <option value="1">1 mois de silence</option>
                  <option value="3">3 mois de silence</option>
                  <option value="6">6 mois de silence</option>
                  {reglages.pause_jusqu && <option value="active">En pause jusqu&rsquo;au {new Date(reglages.pause_jusqu).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' })}</option>}
                </select>
                {reglages.pause_jusqu && (
                  <p style={{ fontSize: 12, color: T.muted, margin: '8px 0 0', lineHeight: 1.5 }}>
                    Les compteurs continuent de monter ici, on ne t&rsquo;écrit simplement plus.
                    Choisis &laquo;&nbsp;Pas de pause&nbsp;&raquo; pour reprendre.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Enveloppe des deux natures de signaux. Les signalements gardent leur écran
// tel quel, ils n'ont pas la même urgence : une fiche fausse se corrige tout
// de suite, une envie se regarde tranquillement.
function TabSignaux({ commercantId, toast, signalementsEnAttente = 0 }) {
  const [sub, setSub] = useState('envies')
  const SOUS_ONGLETS = [
    { id: 'envies', label: 'Envies', icon: 'signal' },
    { id: 'signalements', label: 'Signalements', icon: 'sliders', badge: signalementsEnAttente },
  ]
  return (
    <div>
      {/* Même règle que partout ailleurs : la barre défile et montre ses
          flèches. Deux onglets tiennent aujourd'hui, mais « Signalements » plus
          sa pastille de compteur frôle déjà le bord sur un petit téléphone. */}
      <style>{`.signaux-subtabs::-webkit-scrollbar { display: none }`}</style>
      <BandeDefilante className="signaux-subtabs" libelle="les sections signaux"
        style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 16, border: `1px solid ${T.hairline}`, boxShadow: '0 1px 4px rgba(22,6,54,0.04)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {SOUS_ONGLETS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            style={{ flex: '1 0 auto', minWidth: 80, padding: '10px 12px', whiteSpace: 'nowrap', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 12.5, transition: 'all 0.2s', background: sub === t.id ? T.bgPanel : 'transparent', color: sub === t.id ? '#fff' : T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Icon name={t.icon} size={14} color={sub === t.id ? '#fff' : T.muted}/>
            {t.label}
            {t.badge > 0 && (
              <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 100, minWidth: 16, textAlign: 'center' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </BandeDefilante>
      {sub === 'envies' && <TabEnvies commercantId={commercantId} toast={toast} />}
      {sub === 'signalements' && <TabSignalements commercantId={commercantId} toast={toast} />}
    </div>
  )
}

function TabSignalements({ commercantId, toast }) {
  const [signalements, setSignalements] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('en_attente')

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchSignalements() }, [commercantId])

  async function fetchSignalements() {
    setLoading(true)
    const { data } = await supabase
      .from('signalements')
      .select('*')
      .eq('commercant_id', commercantId)
      .order('created_at', { ascending: false })
    setSignalements(data || [])
    setLoading(false)
  }

  async function setStatut(id, nouveau) {
    const payload = { statut: nouveau }
    if (nouveau === 'vu')     payload.vu_at = new Date().toISOString()
    if (nouveau === 'traite') payload.traite_at = new Date().toISOString()
    const { error } = await supabase.from('signalements').update(payload).eq('id', id).select()
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast(nouveau === 'traite' ? 'Marqué comme traité ✓' : nouveau === 'ignore' ? 'Signalement ignoré' : 'Marqué comme vu')
    fetchSignalements()
  }

  const filtres = [
    { key: 'en_attente', label: 'En attente', color: '#DC2626' },
    { key: 'vu',         label: 'Vus',        color: '#EA580C' },
    { key: 'traite',     label: 'Traités',    color: '#10B981' },
    { key: 'ignore',     label: 'Ignorés',    color: T.muted },
    { key: 'tous',       label: 'Tous',       color: T.deep },
  ]
  const comptes = Object.fromEntries(filtres.map(f => [f.key, signalements.filter(s => f.key === 'tous' || s.statut === f.key).length]))
  const liste = filtre === 'tous' ? signalements : signalements.filter(s => s.statut === filtre)

  return (
    <div>
      <h2 style={s.h2}>Signalements de la tribu</h2>
      <p style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 1.55 }}>
        Les Yoppers signalent ici les infos qui leur paraissent obsolètes ou incorrectes.
        Mets à jour ton profil, puis marque comme « traité ».
      </p>

      {/* Filtres en pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {filtres.map(f => {
          const actif = filtre === f.key
          return (
            <button key={f.key} onClick={() => setFiltre(f.key)}
              style={{ padding: '6px 12px', borderRadius: 100, border: `1.5px solid ${actif ? f.color : T.hairline}`, background: actif ? f.color : '#fff', color: actif ? '#fff' : T.deep, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              {f.label}
              {comptes[f.key] > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, background: actif ? 'rgba(255,255,255,0.25)' : `${f.color}22`, color: actif ? '#fff' : f.color, padding: '1px 6px', borderRadius: 100 }}>
                  {comptes[f.key]}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {loading && <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement…</p>}

      {!loading && liste.length === 0 && (
        <div style={{ ...s.card, textAlign: 'center', padding: '2rem 1rem' }}>
          <Sparkles size={32} strokeWidth={1.6} color={T.main} style={{ marginBottom: 8 }}/>
          <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4 }}>
            {filtre === 'en_attente' ? 'Aucun signalement en attente' : 'Aucun signalement dans ce filtre'}
          </p>
          <p style={{ fontSize: 13, color: T.muted }}>
            {filtre === 'en_attente' ? 'Bravo, tes infos sont à jour.' : 'Change de filtre pour voir les autres.'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {liste.map(sig => {
          const typeLabel = SIGN_TYPE_LABEL[sig.type] || sig.type
          const TypeIcon  = SIGN_TYPE_ICON[sig.type] || MessageCircle
          const couleurStatut = sig.statut === 'en_attente' ? '#DC2626'
                              : sig.statut === 'vu'         ? '#EA580C'
                              : sig.statut === 'traite'     ? '#10B981'
                              : T.muted
          return (
            <div key={sig.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${T.hairline}`, borderLeft: `4px solid ${couleurStatut}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ flexShrink: 0, color: T.main, marginTop: 2 }}><TypeIcon size={20} strokeWidth={1.6}/></span>
                <span style={{ fontWeight: 800, fontSize: 14, color: T.ink, flex: 1, minWidth: 0 }}>{typeLabel}</span>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: couleurStatut, padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {sig.statut === 'en_attente' ? 'À traiter' : sig.statut === 'vu' ? 'Vu' : sig.statut === 'traite' ? 'Traité' : 'Ignoré'}
                </span>
              </div>
              {sig.description && (
                <p style={{ fontSize: 13, color: T.deep, lineHeight: 1.5, margin: '0 0 10px', padding: '8px 12px', background: T.bg, borderRadius: 10 }}>
                  &laquo;&nbsp;{sig.description}&nbsp;&raquo;
                </p>
              )}
              <p style={{ fontSize: 11, color: T.muted, fontWeight: 600, margin: '0 0 10px' }}>
                Reçu le {new Date(sig.created_at).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                {sig.yopper_id && <span> · par un Yopper</span>}
              </p>
              {sig.statut === 'en_attente' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={() => setStatut(sig.id, 'traite')}
                    style={{ ...s.btn, ...s.btnPrimary, padding: '7px 14px', fontSize: 12 }}>
                    <Check size={13} strokeWidth={2.2} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Marquer comme traité
                  </button>
                  <button onClick={() => setStatut(sig.id, 'vu')}
                    style={{ ...s.btn, ...s.btnGhost, padding: '7px 14px', fontSize: 12 }}>
                    <Eye size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Vu, j&rsquo;y reviens
                  </button>
                  <button onClick={() => setStatut(sig.id, 'ignore')}
                    style={{ ...s.btn, padding: '7px 14px', fontSize: 12, background: '#fff', color: T.muted, border: `1px solid ${T.hairline}` }}>
                    Ignorer
                  </button>
                </div>
              )}
              {sig.statut === 'vu' && (
                <button onClick={() => setStatut(sig.id, 'traite')}
                  style={{ ...s.btn, ...s.btnPrimary, padding: '7px 14px', fontSize: 12 }}>
                  <Check size={13} strokeWidth={2.2} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Maintenant traité
                </button>
              )}
              {(sig.statut === 'traite' || sig.statut === 'ignore') && (
                <button onClick={() => setStatut(sig.id, 'en_attente')}
                  style={{ ...s.btn, ...s.btnGhost, padding: '7px 14px', fontSize: 12 }}>
                  Rouvrir
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TabAvis({ commercantId, toast }) {
  const [avis, setAvis] = useState([])
  const [loading, setLoading] = useState(true)
  const [reponses, setReponses] = useState({})
  const [saving, setSaving] = useState(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { fetchAvis() }, [commercantId])

  async function fetchAvis() {
    setLoading(true)
    const { data } = await supabase.from('avis').select('*, client:clients(nom)').eq('commercant_id', commercantId).order('created_at', { ascending: false })
    setAvis(data || []); setLoading(false)
  }

  async function repondre(avisId) {
    const texte = reponses[avisId]?.trim()
    if (!texte) return toast('Réponse vide', 'error')
    setSaving(avisId)
    await supabase.from('avis').update({ reponse_commercant: texte }).eq('id', avisId)
    toast('Réponse publiée'); setSaving(null)
    setReponses(p => ({ ...p, [avisId]: '' })); fetchAvis()
  }

  const noteMoyenne = avis.length ? (avis.reduce((acc, a) => acc + a.note, 0) / avis.length).toFixed(1) : null

  function Etoiles({ note, taille = 15 }) {
    return (
      <span style={{ display: 'inline-flex', gap: 1 }}>
        {[1,2,3,4,5].map(i => <Star key={i} size={taille} strokeWidth={1.6} color={i <= note ? '#F59E0B' : '#E5E7EB'} fill={i <= note ? '#F59E0B' : 'none'}/>)}
      </span>
    )
  }

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={s.h2}>Avis clients <span style={{ color: T.mid, fontWeight: 600, fontSize: 14 }}>({avis.length})</span></h2>
        {noteMoyenne && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FFF8E7', padding: '6px 14px', borderRadius: 10, border: '1px solid #F59E0B33' }}>
            <span style={{ fontSize: 20, fontWeight: 900, color: '#F59E0B' }}>{noteMoyenne}</span>
            <Etoiles note={Math.round(noteMoyenne)} taille={14} />
          </div>
        )}
      </div>

      {avis.length === 0 ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
          <Star size={32} strokeWidth={1.6} color={T.main} style={{ marginBottom: 10 }}/>
          <p style={{ color: T.muted, fontWeight: 700 }}>Pas encore d'avis</p>
          <p style={{ color: T.light, fontSize: 13, marginTop: 4 }}>Les avis apparaissent après les premières commandes.</p>
        </div>
      ) : avis.map(a => (
        <div key={a.id} style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <Etoiles note={a.note} taille={17} />
              <p style={{ fontSize: 12, color: T.muted, margin: '4px 0 0', fontWeight: 600 }}>
                {a.client?.nom || 'Client'} · {new Date(a.created_at).toLocaleDateString('fr-BE')}
              </p>
            </div>
            <span style={{ ...s.tag, background: T.pale, color: T.main }}>{a.note}/5</span>
          </div>
          {a.commentaire && (
            <p style={{ fontSize: 13, color: T.ink, margin: '8px 0', lineHeight: 1.6, padding: '10px 14px', background: T.bg, borderRadius: 10, borderLeft: `3px solid ${T.pale}` }}>
              "{a.commentaire}"
            </p>
          )}
          {a.reponse_commercant ? (
            <div style={{ background: T.pale, borderRadius: 10, padding: '10px 14px', marginTop: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: T.main, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ta réponse</p>
              <p style={{ fontSize: 13, color: T.ink }}>{a.reponse_commercant}</p>
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              <Textarea placeholder="Répondre à cet avis..." value={reponses[a.id] || ''} onChange={e => setReponses(p => ({ ...p, [a.id]: e.target.value }))} style={{ minHeight: 60, fontSize: 13 }} />
              <button style={{ ...s.btn, ...s.btnPrimary, marginTop: 8, padding: '7px 14px', fontSize: 13 }} onClick={() => repondre(a.id)} disabled={saving === a.id}>
                {saving === a.id ? 'Publication…' : <><Reply size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/>Répondre</>}
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Onglet Comptabilité ──────────────────────────────────────────────────────
// Journal des transactions Yoppaa : aperçu à l'écran et export CSV.
//
// Le téléchargement passe par un fetch authentifié plutôt que par un simple
// lien : la route exige le jeton du commerçant, et on ne met jamais un jeton
// dans une URL (il finirait dans l'historique et dans les logs).
function TabComptabilite({ commercantId, toast }) {
  const aujourdHui = new Date()
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const debutMois = new Date(aujourdHui.getFullYear(), aujourdHui.getMonth(), 1)

  const [du, setDu] = useState(iso(debutMois))
  const [au, setAu] = useState(iso(aujourdHui))
  const [apercu, setApercu] = useState(null)
  const [chargement, setChargement] = useState(false)
  const [telechargement, setTelechargement] = useState(null)

  function periode(cle) {
    const a = aujourdHui.getFullYear()
    const m = aujourdHui.getMonth()
    if (cle === 'mois')     { setDu(iso(new Date(a, m, 1)));      setAu(iso(new Date(a, m + 1, 0))) }
    if (cle === 'precedent'){ setDu(iso(new Date(a, m - 1, 1)));  setAu(iso(new Date(a, m, 0))) }
    if (cle === 'trimestre'){ const t = Math.floor(m / 3) * 3; setDu(iso(new Date(a, t, 1))); setAu(iso(new Date(a, t + 3, 0))) }
    if (cle === 'annee')    { setDu(`${a}-01-01`);               setAu(`${a}-12-31`) }
    setApercu(null)
  }

  async function jeton() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token || null
  }

  async function charger() {
    setChargement(true); setApercu(null)
    try {
      const token = await jeton()
      if (!token) { toast('Session expirée, reconnecte-toi.', 'error'); setChargement(false); return }
      const r = await fetch(`/api/dashboard/export-comptable?commercant_id=${commercantId}&du=${du}&au=${au}&format=json`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await r.json()
      if (!j?.ok) { toast(j?.error || 'Chargement impossible', 'error'); setChargement(false); return }
      setApercu(j)
    } catch {
      toast('Erreur réseau', 'error')
    }
    setChargement(false)
  }

  async function telecharger(vue) {
    setTelechargement(vue)
    try {
      const token = await jeton()
      if (!token) { toast('Session expirée, reconnecte-toi.', 'error'); setTelechargement(null); return }
      const r = await fetch(`/api/dashboard/export-comptable?commercant_id=${commercantId}&du=${du}&au=${au}&vue=${vue}&format=csv`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({}))
        toast(j?.error || 'Export impossible', 'error'); setTelechargement(null); return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `yoppaa-${vue}-${du}-au-${au}.csv`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      toast('Export téléchargé')
    } catch {
      toast('Erreur réseau', 'error')
    }
    setTelechargement(null)
  }

  const eur = (n) => `${(Number(n) || 0).toFixed(2).replace('.', ',')} €`
  // ⚠️ LES FRAIS STRIPE ÉTAIENT CALCULÉS, EXPORTÉS DANS LE CSV, ET JETÉS À
  // L'AFFICHAGE (Alex, 17/08 : « les frais Stripe qui ne sont pas
  // comptabilisés »). Le commerçant lisait son chiffre TTC sans jamais voir ce
  // que l'encaissement lui coûte, alors que la donnée arrivait jusqu'à l'écran.
  //
  // Et la réconciliation demande le DÉTAIL du comptoir : le relevé du terminal
  // d'un côté, le comptage de caisse de l'autre. Un total qui mélange les deux
  // ne se recoupe avec rien.
  const totaux = (apercu?.journal || []).reduce((acc, j) => ({
    nb: acc.nb + j.nb,
    total: acc.total + j.total,
    enLigne: acc.enLigne + j.enLigne,
    comptoir: acc.comptoir + j.comptoir,
    terminal: acc.terminal + (j.terminal || 0),
    especes: acc.especes + (j.especes || 0),
    virement: acc.virement + (j.virement || 0),
    bonCadeau: acc.bonCadeau + j.bonCadeau,
    fraisStripe: acc.fraisStripe + (j.fraisStripe || 0),
    netStripe: acc.netStripe + (j.netStripe || 0),
  }), { nb: 0, total: 0, enLigne: 0, comptoir: 0, terminal: 0, especes: 0, virement: 0, bonCadeau: 0, fraisStripe: 0, netStripe: 0 })

  // Ventilation cumulée par taux, pour l'aperçu à l'écran.
  const parTaux = {}
  for (const j of (apercu?.journal || [])) {
    for (const [cle, ttc] of Object.entries(j.parTaux || {})) {
      parTaux[cle] = (parTaux[cle] || 0) + ttc
    }
  }

  const btn = { padding: '10px 16px', borderRadius: 100, border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={s.card}>
        <h3 style={s.cardTitle}>Journal des transactions Yoppaa</h3>
        <p style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6, marginBottom: 14 }}>
          Tes ventes passées par Yoppaa, jour par jour, ventilées par taux de TVA. À remettre à ton
          comptable ou à rapprocher de tes virements.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {[
            { cle: 'mois', label: 'Ce mois' },
            { cle: 'precedent', label: 'Mois dernier' },
            { cle: 'trimestre', label: 'Ce trimestre' },
            { cle: 'annee', label: 'Cette année' },
          ].map(p => (
            <button key={p.cle} onClick={() => periode(p.cle)}
              style={{ ...btn, padding: '7px 13px', fontSize: 12, background: T.pale, color: T.main }}>
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={s.label}>Du</label>
            <Input type="date" value={du} onChange={e => { setDu(e.target.value); setApercu(null) }}/>
          </div>
          <div>
            <label style={s.label}>Au</label>
            <Input type="date" value={au} onChange={e => { setAu(e.target.value); setApercu(null) }}/>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={charger} disabled={chargement} style={{ ...btn, background: T.bgPanel, color: '#fff' }}>
            {chargement ? 'Calcul…' : 'Voir le récapitulatif'}
          </button>
          <button onClick={() => telecharger('journal')} disabled={!!telechargement}
            style={{ ...btn, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff' }}>
            {telechargement === 'journal' ? 'Préparation…' : 'Télécharger le journal'}
          </button>
          <button onClick={() => telecharger('detail')} disabled={!!telechargement}
            style={{ ...btn, background: '#fff', color: T.deep, border: `1.5px solid ${T.hairline}` }}>
            {telechargement === 'detail' ? 'Préparation…' : 'Télécharger le détail'}
          </button>
        </div>
      </div>

      {apercu && (
        <div style={s.card}>
          <h3 style={s.cardTitle}>Du {du} au {au}</h3>

          {apercu.assujetti === false && (
            <p style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '9px 12px', marginBottom: 12, lineHeight: 1.5 }}>
              Ton commerce est enregistré comme non assujetti à la TVA : aucune ventilation n&rsquo;est calculée.
            </p>
          )}
          {apercu.avertissement_taux && (
            <p style={{ fontSize: 12, color: '#B45309', background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '9px 12px', marginBottom: 12, lineHeight: 1.5 }}>
              Certaines transactions sont antérieures à la mise en place des taux : elles reprennent le taux actuel de l&rsquo;article.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 14 }}>
            {[
              { l: 'Transactions', v: totaux.nb },
              { l: 'Chiffre TTC', v: eur(totaux.total) },
              { l: 'En ligne', v: eur(totaux.enLigne) },
              { l: 'Au comptoir', v: eur(totaux.comptoir) },
              // Le détail du comptoir, pour recouper le relevé du terminal et
              // le comptage de caisse. Ils n'apparaissent que s'il y a quelque
              // chose à recouper : une boulangerie 100 % en ligne n'a pas
              // besoin de lire deux zéros de plus.
              ...(totaux.terminal > 0 ? [{ l: 'Dont terminal', v: eur(totaux.terminal) }] : []),
              ...(totaux.especes > 0 ? [{ l: 'Dont espèces', v: eur(totaux.especes) }] : []),
              ...(totaux.virement > 0 ? [{ l: 'Dont virement', v: eur(totaux.virement) }] : []),
              { l: 'Bons cadeaux', v: eur(totaux.bonCadeau) },
              // ⚠️ CE QUE L'ENCAISSEMENT EN LIGNE COÛTE. Le montant existait
              // depuis toujours dans le fichier ; il n'était simplement affiché
              // nulle part, et un commerçant qui ne voit pas ses frais croit
              // que son chiffre TTC est ce qu'il touche.
              { l: 'Frais Stripe', v: eur(totaux.fraisStripe) },
              { l: 'Net Stripe reçu', v: eur(totaux.netStripe) },
            ].map(c => (
              <div key={c.l} style={{ background: T.bg, borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: T.ink }}>{c.v}</p>
                <p style={{ margin: '2px 0 0', fontSize: 10.5, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{c.l}</p>
              </div>
            ))}
          </div>

          {Object.keys(parTaux).length > 0 && (
            <>
              <p style={{ fontSize: 12, fontWeight: 800, color: T.deep, marginBottom: 6 }}>Ventilation par taux</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 12 }}>
                {Object.entries(parTaux).map(([cle, ttc]) => {
                  const taux = cle === 'NR' ? null : Number(cle)
                  const base = taux ? Math.round((ttc / (1 + taux / 100)) * 100) / 100 : ttc
                  return (
                    <div key={cle} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, padding: '7px 10px', background: cle === 'NR' ? '#FFFBEB' : T.bg, borderRadius: 8 }}>
                      <span style={{ fontWeight: 700, color: cle === 'NR' ? '#B45309' : T.deep }}>
                        {cle === 'NR' ? 'Taux non renseigné' : `${taux} %`}
                      </span>
                      <span style={{ color: T.muted }}>
                        base {eur(base)} · TVA {eur(ttc - base)} · TTC {eur(ttc)}
                      </span>
                    </div>
                  )
                })}
              </div>
              {parTaux.NR != null && (
                <p style={{ fontSize: 11.5, color: '#B45309', lineHeight: 1.5, marginBottom: 12 }}>
                  Des articles n&rsquo;ont aucun taux renseigné. Complète-les dans ton catalogue, sinon ces
                  montants ne pourront pas être ventilés.
                </p>
              )}
            </>
          )}

          {apercu.journal?.length > 0 ? (
            <BandeDefilante libelle="le journal" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: T.muted }}>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Jour</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700 }}>Nb</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>TTC</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>En ligne</th>
                    <th style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>Comptoir</th>
                    {/* Le coût de l'encaissement en ligne, jour par jour. Il
                        était calculé et exporté, mais nulle part à l'écran. */}
                    <th style={{ padding: '6px 8px', fontWeight: 700, textAlign: 'right' }}>Frais</th>
                  </tr>
                </thead>
                <tbody>
                  {apercu.journal.map(j => (
                    <tr key={j.date} style={{ borderTop: `1px solid ${T.hairline}` }}>
                      <td style={{ padding: '6px 8px', fontWeight: 700, color: T.ink }}>{j.date}</td>
                      <td style={{ padding: '6px 8px', color: T.muted }}>{j.nb}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: T.ink }}>{eur(j.total)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: T.muted }}>{eur(j.enLigne)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: T.muted }}>{eur(j.comptoir)}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: T.muted }}>{eur(j.fraisStripe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BandeDefilante>
          ) : (
            <p style={{ fontSize: 12.5, color: T.muted }}>Aucune transaction sur cette période.</p>
          )}
        </div>
      )}

      <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.6, padding: '0 4px' }}>
        Document d&rsquo;aide à la comptabilité. Yoppaa n&rsquo;est pas un système de caisse enregistrée
        certifié : ce journal ne remplace pas une caisse certifiée pour les établissements qui y sont
        soumis. En cas de doute, consulte ton comptable ou le SPF Finances.
      </p>
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
// tabInitial : permet aux raccourcis de la vue principale (Actions rapides)
// d'ouvrir directement le bon onglet, sans faire chercher le commerçant.
// ─── LE CATALOGUE : TOUT CE QUE LE COMMERÇANT VEND ───────────────────────────
//
// ⚠️ DÉCISION D'ALEX DU 15/08 : « l'onglet abonnement devrait aller dans le
// catalogue à côté des produits ». Il vivait sous Prise de RDV, avec les
// praticiens et les créneaux, c'est-à-dire au milieu des réglages qui décrivent
// COMMENT on travaille. Or un abonnement est une chose qu'on VEND, exactement
// comme un produit ou une prestation. Le modèle mental redevient simple : tout
// ce que je propose est au même endroit.
//
// ⚠️ ET IL RESTE RÉSERVÉ AUX COMMERCES DE SERVICE, exactement comme avant : ce
// déplacement n'ouvre rien à personne. Une séance d'abonnement EST un
// rendez-vous, avec sa ligne d'agenda, sa place et son rappel de la veille ;
// une formule pointe d'ailleurs obligatoirement vers une prestation. Ouvrir ce
// module à une boulangerie demanderait à sa cliente de réserver un créneau pour
// chacun de ses dix pains.
//
// La question a été posée et tranchée le même soir : les autres métiers ont les
// CARTES CADEAUX, qui font déjà le pointage au comptoir sans agenda. Bâtir un
// second système de pointage à côté du premier aurait produit deux règles
// jumelles, dont une qu'on oublierait de corriger.
function TabCatalogue({ commercantId, commercant, toast }) {
  const [sousOnglet, setSousOnglet] = useState('produits')
  const estVitrine = commercant?.categorie === 'vitrine'
  const peutAbonnements = estVitrine && canDo(commercant?.plan, 'rdv')

  // Sans abonnements, aucune barre : une barre à un seul onglet n'apprend rien
  // et vole de la hauteur d'écran à un téléphone.
  if (!peutAbonnements) {
    return <TabMenu commercantId={commercantId} commercant={commercant} toast={toast} />
  }

  const sousOnglets = [
    { id: 'produits', label: 'Prestations et produits' },
    { id: 'abonnements', label: 'Abonnements' },
  ]

  return (
    <div>
      {/* La barre défile et montre ses flèches, règle du projet sans exception. */}
      <style>{`.catalogue-subtabs::-webkit-scrollbar { display: none }`}</style>
      <BandeDefilante className="catalogue-subtabs" libelle="les sections du catalogue"
        style={{ display: 'flex', gap: 6, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 6px rgba(22,6,54,0.05)', border: `1px solid ${T.hairline}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {sousOnglets.map(t => (
          <button key={t.id} onClick={() => setSousOnglet(t.id)}
            style={{ flex: '1 0 auto', padding: '8px 12px', whiteSpace: 'nowrap', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13, background: sousOnglet === t.id ? T.main : 'transparent', color: sousOnglet === t.id ? '#fff' : T.muted, transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </BandeDefilante>

      {sousOnglet === 'produits' && <TabMenu commercantId={commercantId} commercant={commercant} toast={toast} />}
      {/* ⚠️ `commercant` n'est plus passé : il ne servait qu'à résoudre le lieu
          des séances générées d'avance, et cette génération a disparu avec le
          jour fixe le 18/08. */}
      {sousOnglet === 'abonnements' && <TabRdvAbonnements commercantId={commercantId} toast={toast} />}
    </div>
  )
}

export default function ConfigDashboard({ commercantId, tabInitial = 'menu' }) {
  const [tab, setTab] = useState(tabInitial)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState('success')
  const [commercant, setCommercant] = useState(null)

  // ─── Le travail en attente d'enregistrement ─────────────────────────────
  // Un seul onglet est monté à la fois : un seul formulaire peut donc être en
  // attente, et la barre vit ICI plutôt que dans chaque onglet. Elle est ainsi
  // toujours au même endroit, toujours au-dessus du reste, et un onglet qui
  // oublierait de la poser ne peut pas exister.
  const [modifs, setModifs] = useState({ modifie: false, nb: 0, saving: false, libelleAction: 'Enregistrer' })
  const actionsModifs = useRef(null)
  const [ongletVise, setOngletVise] = useState(null)

  // ⚠️ RÉFÉRENCE STABLE, et la comparaison avant `setModifs` n'est pas une
  // optimisation : l'enfant déclare son état depuis un effet, donc écrire un
  // nouvel objet à chaque rendu relancerait le rendu, qui relancerait l'effet,
  // sans fin.
  const declarerModifications = useCallback(etat => {
    actionsModifs.current = etat?.actions || null
    const suivant = { modifie: !!etat?.modifie, nb: etat?.nb || 0, saving: !!etat?.saving, libelleAction: etat?.libelleAction || 'Enregistrer' }
    setModifs(p => (p.modifie === suivant.modifie && p.nb === suivant.nb && p.saving === suivant.saving && p.libelleAction === suivant.libelleAction) ? p : suivant)
  }, [])

  function changerOnglet(id) {
    if (id === tab) return
    // Changer d'onglet démonte le formulaire : c'est la sortie qui coûte le
    // plus cher, et la seule qu'aucun bouton ne voit venir.
    if (modifs.modifie) { setOngletVise(id); return }
    setTab(id)
  }

  async function enregistrerPuisContinuer() {
    const ok = await actionsModifs.current?.current?.enregistrer?.()
    // ⚠️ On ne quitte QUE si l'enregistrement a réussi. Un nom vide ou une
    // erreur réseau laisse le commerçant sur son écran, avec son texte.
    if (ok === false) { setOngletVise(null); return }
    if (ongletVise) setTab(ongletVise)
    setOngletVise(null)
  }

  function abandonnerPuisContinuer() {
    actionsModifs.current?.current?.ignorer?.()
    if (ongletVise) setTab(ongletVise)
    setOngletVise(null)
  }

  function showToast(msg, type = 'success') {
    setToastMsg(msg); setToastType(type)
    setTimeout(() => setToastMsg(''), 3000)
  }

  useEffect(() => {
    function handleToast(e) { showToast(e.detail.msg, e.detail.type) }
    window.addEventListener('yoppaa-toast', handleToast)
    return () => window.removeEventListener('yoppaa-toast', handleToast)
  }, [])

  // Charge le commerçant pour connaître le plan (conditionne les onglets).
  // Exposé comme fonction pour rafraîchir après sauvegarde du Profil : activer la
  // livraison fait apparaître l'onglet Livraison sans reload manuel.
  async function rechargerCommercant() {
    if (!commercantId) return
    const { data } = await supabase.from('commercants').select('*').eq('id', commercantId).maybeSingle()
    setCommercant(data)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  useEffect(() => { rechargerCommercant() }, [commercantId])

  // Onglets dynamiques selon le plan + la catégorie
  const peutDeals = canDo(commercant?.plan, 'deals')
  const peutActus = canDo(commercant?.plan, 'actus_illimitees')
  const iaActif = getIaConfig(commercant?.plan).actif   // Générateur IA (exister 1 test / communiquer / vendre)
  const estVitrine = commercant?.categorie === 'vitrine'

  // Compteur des signalements en attente → badge rouge sur l'onglet Signaux
  const [signalementsEnAttente, setSignalementsEnAttente] = useState(0)
  useEffect(() => {
    if (!commercantId) return
    let annule = false
    supabase
      .from('signalements')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercantId)
      .eq('statut', 'en_attente')
      .then(({ count }) => { if (!annule) setSignalementsEnAttente(count || 0) })
    return () => { annule = true }
  }, [commercantId, tab])

  // Nouvelles envies depuis la dernière visite → point violet sur l'onglet.
  // Volontairement PAS le badge rouge : le rouge appelle une correction, une
  // envie se regarde. Mais il faut qu'elle se voie, sinon un commerçant qui n'a
  // rien à gérer n'ouvrira jamais cet écran.
  const [enviesNouvelles, setEnviesNouvelles] = useState(0)
  useEffect(() => {
    if (!commercantId) return
    let annule = false
    supabase.auth.getSession().then(({ data: { session } = {} }) => {
      if (!session || annule) return
      fetch(`/api/dashboard/signaux?commercant_id=${commercantId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then(r => r.json())
        .then(j => { if (!annule && j?.ok) setEnviesNouvelles(j.nouvelles || 0) })
        .catch(() => {})
    })
    return () => { annule = true }
  }, [commercantId, tab])

  // Onglet 'Paiements' visible uniquement pour les commerçants Vendre :
  //   • Vitrine Vendre → acompte RDV en ligne
  //   • Alimentaire Vendre → paiement obligatoire commande C&C (Phase 1.5)
  const peutPaiements = canDo(commercant?.plan, 'paiement_ligne')

  // Onglet 'RDV' visible uniquement pour vitrine au plan Vendre (canDo rdv).
  // Regroupe Prestations + Praticiens + Créneaux RDV en sous-onglets.
  const peutRdv = estVitrine && canDo(commercant?.plan, 'rdv')

  // Onglet Livraison : alim uniquement, quand la livraison est activée (toggle Profil).
  const peutLivraison = !estVitrine && commercant?.livraison_actif

  // Vitrine : on parle de "Vitrine" plutôt que "Menu", et on masque "Créneaux" (pas de C&C)
  const tabs = [
    // Les chiffres en premier : c'est ce qu'un commerçant vient voir en
    // ouvrant son tableau de bord, et la landing les lui promet depuis le
    // premier jour. Ouverts à TOUS les paliers, y compris le gratuit : voir
    // ce que sa fiche produit est ce qui donne envie d'en faire plus.
    { id: 'stats',    label: 'Chiffres', icon: 'chart' },
    { id: 'menu',     label: commercant?.categorie === 'detail' ? 'Boutique' : estVitrine ? 'Catalogue' : 'Menu', icon: 'menu' },
    peutDeals && { id: 'deals', label: 'Deals', icon: 'tag' },
    peutActus && { id: 'actus', label: 'Actus', icon: 'sliders' },
    iaActif && { id: 'ia', label: 'Générateur', icon: 'sparkles' },
    // Créneaux de retrait C&C : alimentaire uniquement (le retrait boutique détail
    // sera cadré au Module 2 étape 5).
    !estVitrine && commercant?.categorie !== 'detail' && { id: 'creneaux', label: 'Créneaux', icon: 'clock' },
    peutLivraison && { id: 'livraison', label: 'Livraison', icon: 'box' },
    // « RDV » ne disait pas ce qu'on y règle (prestations, praticiens, horaires
    // de réservation) : renommé « Prise de RDV » (demande Alex 01/08).
    peutRdv && { id: 'rdv', label: 'Prise de RDV', icon: 'calendar' },
    // Fidélité : Communiquer (comptoir) et Vendre (comptoir + crédit auto)
    canDo(commercant?.plan, 'fidelite') && { id: 'fidelite', label: 'Fidélité', icon: 'heart' },
    // Bons cadeaux : Vendre uniquement (l'achat passe par Stripe)
    canDo(commercant?.plan, 'bons_cadeaux') && { id: 'bons', label: 'Bons cadeaux', icon: 'gift' },
    peutPaiements && { id: 'paiements', label: 'Paiements', icon: 'tag' },
    // Journal des transactions et export : promis par la formule Vendre.
    canDo(commercant?.plan, 'export_comptable') && { id: 'comptabilite', label: 'Comptabilité', icon: 'tag' },
    { id: 'profil',   label: 'Profil',   icon: 'shop' },
    // Accompagnement sur place et matériel : accessible à tout moment, plus
    // seulement à l'inscription (l'étape 5 le promettait déjà).
    { id: 'accompagnement', label: 'Accompagnement', icon: 'box' },
    { id: 'avis',     label: 'Avis',     icon: 'star' },
    // « Signalements » ne disait que la moitié de ce qu'on y trouve désormais :
    // les envies des habitants y vivent aussi, et ce sont elles qui portent
    // l'argument. Renommé « Signaux » (05/08).
    { id: 'signaux', label: 'Signaux', icon: 'signal', badge: signalementsEnAttente, dot: enviesNouvelles > 0 },
  ].filter(Boolean)

  return (
    // ⚠️ La barre est en `fixed` : sans cette marge, elle recouvrirait le bas de
    // l'écran, donc le dernier champ du formulaire et souvent le bouton
    // historique. On ne protège pas le travail en cachant l'endroit où on le
    // saisit.
    <div style={{ fontFamily: '"DM Sans", sans-serif', paddingBottom: modifs.modifie ? 104 : 24 }}>
      {/* Barre d'onglets : UNE ligne défilable horizontalement (sur mobile les
          9+ onglets s'empilaient sur 3 lignes, layout ODOO = compact + scroll). */}
      <style>{`.cfg-tabs::-webkit-scrollbar { display: none }`}</style>
      <BandeDefilante className="cfg-tabs" libelle="les onglets" style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 14, marginBottom: 20, boxShadow: '0 2px 12px rgba(22,6,54,0.06)', border: `1px solid ${T.hairline}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => changerOnglet(t.id)}
            style={{ flex: '1 0 auto', padding: '10px 12px', whiteSpace: 'nowrap', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13, transition: 'all 0.2s', background: tab === t.id ? T.bgPanel : 'transparent', color: tab === t.id ? '#fff' : T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative' }}>
            <Icon name={t.icon} size={16} color={tab === t.id ? '#fff' : T.muted}/>
            {t.label}
            {t.badge > 0 && (
              <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 100, minWidth: 16, textAlign: 'center', boxShadow: '0 0 0 2px #fff' }}>
                {t.badge}
              </span>
            )}
            {t.dot && !(t.badge > 0) && (
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tab === t.id ? '#fff' : T.main, boxShadow: '0 0 0 2px #fff' }} />
            )}
          </button>
        ))}
      </BandeDefilante>

      {tab === 'stats'    && <TabStatistiques commercantId={commercantId} toast={showToast} />}
      {tab === 'menu'     && <TabCatalogue commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'deals'    && peutDeals && <TabDeals commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'actus'    && peutActus && <TabActus commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'ia'       && iaActif && <TabGenerateur commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'creneaux' && <TabCreneaux commercantId={commercantId} toast={showToast} />}
      {tab === 'livraison' && peutLivraison && <TabLivraison commercantId={commercantId} toast={showToast} surModifications={declarerModifications} />}
      {tab === 'rdv'      && peutRdv && <TabRdv commercantId={commercantId} commercant={commercant} toast={showToast} onSaved={rechargerCommercant} />}
      {tab === 'fidelite' && canDo(commercant?.plan, 'fidelite') && <TabFidelite commercantId={commercantId} commercant={commercant} toast={showToast} onSaved={rechargerCommercant} surModifications={declarerModifications} />}
      {tab === 'bons' && canDo(commercant?.plan, 'bons_cadeaux') && <TabBonsCadeaux commercantId={commercantId} commercant={commercant} toast={showToast} onSaved={rechargerCommercant} surModifications={declarerModifications} />}
      {tab === 'paiements' && peutPaiements && <TabPaiements commercantId={commercantId} toast={showToast} />}
      {tab === 'comptabilite' && canDo(commercant?.plan, 'export_comptable') && <TabComptabilite commercantId={commercantId} toast={showToast} />}
      {tab === 'profil'   && <TabProfil   commercantId={commercantId} toast={showToast} onSaved={rechargerCommercant} surModifications={declarerModifications} />}
      {tab === 'accompagnement' && <TabAccompagnement commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'avis'     && <TabAvis     commercantId={commercantId} toast={showToast} />}
      {tab === 'signaux' && <TabSignaux commercantId={commercantId} toast={showToast} signalementsEnAttente={signalementsEnAttente} />}

      <Toast message={toastMsg} type={toastType} />

      {/* La barre ODOO : elle n'existe que quand il y a quelque chose à perdre. */}
      <BarreEnregistrer
        visible={modifs.modifie}
        nb={modifs.nb}
        saving={modifs.saving}
        libelleAction={modifs.libelleAction}
        onEnregistrer={() => actionsModifs.current?.current?.enregistrer?.()}
        onIgnorer={() => actionsModifs.current?.current?.ignorer?.()}
      />
      <ModaleQuitter
        ouverte={!!ongletVise}
        nb={modifs.nb}
        saving={modifs.saving}
        onEnregistrer={enregistrerPuisContinuer}
        onAbandonner={abandonnerPuisContinuer}
        onRester={() => setOngletVise(null)}
      />
    </div>
  )
}