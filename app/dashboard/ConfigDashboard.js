'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { canDo, getIaConfig } from '@/lib/plans'
import TabGenerateur from './TabGenerateur'
import BoutonIaInline from './BoutonIaInline'
import TabPaiements from './TabPaiements'
import { compresserImage } from '@/lib/compress-image'
// Icônes Lucide React (alignées sur la charte canonique Yoppaa).
// Aucun emoji dans l'UI sauf exceptions ☀️ (soleil GMY) et 🟣 (signature identitaire).
import {
  Check, X, AlertTriangle, Calendar, Clock, Lock, Trash2, Copy, Zap, Save, Phone,
  Sun, Star, Settings, Package, Lightbulb, Camera, Store, Scissors, Croissant,
  Bell, BellOff, ClipboardList, Bike, MapPin, FileText, Printer, Download,
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
  },
  cardActive: {
    background: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    border: `1.5px solid ${T.bgPanel}`,
    boxShadow: `0 8px 24px rgba(22,6,54,0.12)`,
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

function Input({ style, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <input {...props}
      style={{ ...s.input, ...(focused ? s.inputFocus : {}), ...style }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}

function Textarea({ style, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea {...props}
      style={{ ...s.input, resize: 'vertical', minHeight: 80, ...(focused ? s.inputFocus : {}), ...style }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
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
  }
  return <svg {...props} style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>{paths[name]}</svg>
}

// ─── Onglet MENU ──────────────────────────────────────────────────────────────
function TabMenu({ commercantId, commercant, toast }) {
  // ─── Mode vitrine ou menu commandable ────────────────────────────────────
  // Pour catégorie='vitrine' (coiffeur, opticien…), on retire stock/jour, temps prépa,
  // et on force est_vitrine=true sur les articles créés.
  const estVitrine = commercant?.categorie === 'vitrine'
  // Variantes (matrice taille/couleur) proposées au détail et au service.
  // L'alimentaire garde son système d'options/suppléments.
  const variantesCategorie = commercant?.categorie === 'detail' || estVitrine
  // ─── Sous-onglet actif : Articles | Catégories | Personnalisation ────────
  const [subTab, setSubTab] = useState('articles')
  const [searchQuery, setSearchQuery] = useState('')

  const [articles, setArticles] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCatForm, setShowCatForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: '', photo_url: '' })
  const [nouvelleCat, setNouvelleCat] = useState('')
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

  // FIX STOCK : afficher le stock restant côté commerçant
  const [commandesParArticleJour, setCommandesParArticleJour] = useState({})
  // STOCK PAR JOUR : { articleId: { lundi: { stock, actif }, mardi: ... } }
  const [stockParJourMap, setStockParJourMap] = useState({})

  // 1er fetch = affiche "Chargement…". Les re-fetch (apres save/delete)
  // ne toggle pas loading pour ne pas demonter la liste et perdre le scroll.
  const firstLoadRef = useRef(true)

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

  // Applique un dispo aux 7 jours. Pour le jour actuel on rajoute déjà_commandé.
  async function setStockTousJours(articleId, dispo, dejaCommandeAuj, jourActuelKey) {
    const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
    await Promise.all(JOURS.map(j => {
      const brut = j === jourActuelKey ? (dispo + (dejaCommandeAuj || 0)) : dispo
      return setStockJour(articleId, j, brut, true)
    }))
    toast('Stock appliqué aux 7 jours')
  }

  // Charge les quantités commandées aujourd'hui par article (exclut "non_retire")
  const chargerCommandesAujourdhui = useCallback(async () => {
    if (!commercantId) return
    const d = new Date()
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const { data: cmds } = await supabase
      .from('commandes')
      .select('id')
      .eq('commercant_id', commercantId)
      .eq('date_commande', dateStr)
      .neq('statut', 'non_retire')
    if (!cmds || cmds.length === 0) { setCommandesParArticleJour({}); return }
    const cmdIds = cmds.map(c => c.id)
    const { data: lignes } = await supabase
      .from('commande_articles')
      .select('article_id, quantite')
      .in('commande_id', cmdIds)
    const map = {}
    ;(lignes || []).forEach(r => {
      map[r.article_id] = (map[r.article_id] || 0) + r.quantite
    })
    setCommandesParArticleJour(map)
  }, [commercantId])

  useEffect(() => {
    if (!commercantId) return
    chargerCommandesAujourdhui()
    const id = setInterval(chargerCommandesAujourdhui, 5000)
    return () => clearInterval(id)
  }, [commercantId, chargerCommandesAujourdhui])

  function openNew() {
    setForm({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: catActive !== 'Tous' && catActive !== 'Sans catégorie' ? catActive : '', temps_prepa: '', photo_url: '' })
    setGalerie([])
    setEditId(null); setShowForm(true)
  }
  function openEdit(a) {
    setForm({ nom: a.nom, description: a.description || '', prix: String(a.prix), stock_jour: String(a.stock_jour ?? ''), actif: a.actif, categorie: a.categorie || '', temps_prepa: String(a.temps_prepa ?? ''), photo_url: a.photo_url || '' })
    setGalerie([])
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
      stock_jour: estVitrine ? 0 : (parseInt(form.stock_jour) || 0),
      actif: form.actif,
      categorie: form.categorie.trim() || null,
      temps_prepa: estVitrine ? 0 : (parseFloat(form.temps_prepa) || 0),
      photo_url: form.photo_url || null,
      est_vitrine: estVitrine,
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
    if (categories.includes(nouvelleCat.trim())) { toast('Catégorie déjà existante', 'error'); return }
    setCategories(prev => [...prev, nouvelleCat.trim()])
    setCatActive(nouvelleCat.trim())
    setNouvelleCat('')
    setShowCatForm(false)
    toast('Catégorie créée')
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
    if (!confirm(`Supprimer la catégorie "${cat}" ? Les articles resteront mais sans catégorie.`)) return
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
    if (!confirm('Supprimer cet article ?')) return
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
    const compressed = await compresserImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85 })
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
    const compressed = await compresserImage(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85 })
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
          <div><label style={s.label}>Nom *</label><Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder={estVitrine ? 'Ex: Monture Lindberg Air Titanium' : 'Ex: Croissant beurre'}/></div>
          <div>
            <label style={s.label}>Catégorie</label>
            <select value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
              style={{ ...s.input, cursor: 'pointer' }}>
              <option value="">— Sans catégorie —</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div><label style={s.label}>Description</label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder={estVitrine ? 'Ex: Titane japonais, charnières flex, 12 coloris…' : 'Ex: Feuilleté, pur beurre AOP...'}/></div>
          {estVitrine ? (
            <div>
              <label style={s.label}>Prix indicatif (€)</label>
              <Input type="number" step="0.10" min="0" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="À partir de 290"/>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Affiché en mode "à partir de" sur ta fiche client.</p>
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
          <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label={estVitrine ? 'Produit visible' : 'Article disponible'}/>

          {/* Photo de couverture */}
          <div>
            <label style={s.label}>Photo de couverture</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 72, height: 72, borderRadius: 12, overflow: 'hidden', background: T.hairline, flexShrink: 0, position: 'relative', border: `1px solid ${T.hairline}` }}>
                {form.photo_url ? (
                  <>
                    <img src={form.photo_url} alt="Couverture" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
                    <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
    return <ArticleCard key={a.id} a={a} estVitrine={estVitrine} onEdit={openEdit} onToggle={toggleActif} onUpdateStock={updateStock} onDelete={deleteArticle} s={s} dejaCommande={commandesParArticleJour[a.id] || 0} stockParJour={stockParJourMap[a.id] || {}} onSetStockJour={setStockJour} onSetStockTousJours={setStockTousJours}/>
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
              <label style={s.label}>Nom de la catégorie</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <Input value={nouvelleCat} onChange={e => setNouvelleCat(e.target.value)} placeholder="Ex: Viennoiseries, Sandwichs chauds…" onKeyDown={e => e.key === 'Enter' && ajouterCategorie()} style={{ flex: 1 }}/>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={ajouterCategorie}><Icon name="check" size={14}/></button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowCatForm(false)}><Icon name="x" size={14} color={T.main}/></button>
              </div>
            </div>
          )}
          {categories.length === 0 && !showCatForm ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
              <p style={{ color: T.muted, marginBottom: 16 }}>Aucune catégorie pour le moment</p>
              <p style={{ color: T.muted, fontSize: 12, marginBottom: 16 }}>Les catégories organisent tes articles côté client (ex&nbsp;: Viennoiseries, Boissons…).</p>
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
    if (!confirm('Supprimer ce groupe et toutes ses options ?')) return
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

  useEffect(() => { fetchVariantes() }, [article.id])

  async function fetchVariantes() {
    setLoading(true)
    const { data } = await supabase.from('article_variantes').select('*').eq('article_id', article.id).order('ordre')
    setVariantes(data || [])
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
                    {v.photo_url ? <img src={v.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : (uploadId === v.id ? <span style={{ fontSize: 10 }}>…</span> : <Camera size={15} strokeWidth={1.6} color={T.muted}/>)}
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

function ArticleCard({ a, estVitrine = false, onEdit, onToggle, onUpdateStock, onDelete, s, dejaCommande = 0, stockParJour = {}, onSetStockJour, onSetStockTousJours }) {
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

  const dispoEffectif = (jour) => {
    const entry = stockParJour[jour]
    const conso = jour === jourActuelKey ? dejaCommande : 0
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

  function ouvrirEdition(jour) {
    const eff = dispoEffectif(jour)
    setEditVal(String(eff.dispo))
    setJourEdite(jour)
  }

  function fermerEdition() { setJourEdite(null); setEditVal('') }

  function sauvegarder(jour, actif) {
    // L'utilisateur saisit le DISPO. On stocke le brut = dispo + déjà commandé
    // (uniquement pour le jour actuel — pour les autres jours, dispo = brut).
    const dispoSaisi = Math.max(0, parseInt(editVal) || 0)
    const conso = jour === jourActuelKey ? dejaCommande : 0
    const brut = actif ? dispoSaisi + conso : 0
    onSetStockJour(a.id, jour, brut, actif)
    fermerEdition()
  }

  return (
    <div style={{ ...s.card, opacity: a.actif ? 1 : 0.6, borderLeft: `4px solid ${a.actif ? T.main : '#E5E7EB'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        {a.photo_url && (
          <div style={{ width: 48, height: 48, borderRadius: 10, overflow: 'hidden', flexShrink: 0, border: `1px solid ${T.hairline}` }}>
            <img src={a.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
            {!estVitrine && (a.temps_prepa || 0) > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.bgPanel, background: '#F8F6FF', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="clock" size={11} color={T.bgPanel}/>{a.temps_prepa} min</span>}
            {!estVitrine && (effAuj.ferme ? (
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
                Vitrine · non commandable
              </span>
            )}
          </div>

          {/* 7 chips stock par jour — masqué en mode vitrine (pas de stock pertinent) */}
          {!estVitrine && <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Stock par jour</span>
              <button onClick={() => {
                const v = window.prompt('Stock disponible à appliquer aux 7 jours :', String(stockRestant))
                if (v !== null) {
                  const dispo = Math.max(0, parseInt(v) || 0)
                  onSetStockTousJours(a.id, dispo, dejaCommande, jourActuelKey)
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
                const couleurs = ferme
                  ? { bg: '#F3F4F6', color: '#9CA3AF', border: '#E5E7EB' }
                  : epuise
                  ? { bg: '#FEE2E2', color: '#DC2626', border: '#FCA5A5' }
                  : eff.override
                  ? { bg: '#F0FDF4', color: '#10B981', border: '#86EFAC' }
                  : { bg: '#fff', color: T.bgPanel, border: T.hairline }
                return (
                  <button key={jour} onClick={() => ouvrirEdition(jour)}
                    style={{ padding: '4px 8px', borderRadius: 8, border: `1.5px solid ${aujourdhui ? T.main : couleurs.border}`, background: couleurs.bg, color: couleurs.color, fontSize: 11, fontWeight: 700, cursor: 'pointer', minWidth: 52, fontFamily: 'inherit', transition: 'all 0.15s', position: 'relative' }}>
                    <span style={{ display: 'block', fontSize: 9, opacity: 0.7 }}>{JOURS_LABELS_COURT[idx]}</span>
                    <span style={{ display: 'block', fontWeight: 900 }}>{ferme ? '✕' : eff.dispo}</span>
                  </button>
                )
              })}
            </div>

            {/* Éditeur inline — saisie en "stock dispo" (intuitif) */}
            {jourEdite && (() => {
              const isAuj = jourEdite === jourActuelKey
              const consoEdit = isAuj ? dejaCommande : 0
              return (
                <div style={{ marginTop: 8, padding: 12, background: '#FAFAFA', borderRadius: 10, border: `1px solid ${T.hairline}` }}>
                  {/* Ligne 1 : label + input + bouton primaire (sur petit écran : label en haut, input + bouton sur la ligne) */}
                  <div className="stock-editor-row" style={{ marginBottom: 8 }}>
                    <span className="stock-editor-label" style={{ fontSize: 12, fontWeight: 800, color: T.deep }}>
                      {JOURS_LABELS_COURT[JOURS_KEYS.indexOf(jourEdite)]} &mdash; Stock disponible
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
                      Fermer ce jour
                    </button>
                    <button onClick={fermerEdition}
                      style={{ ...s.btn, ...s.btnGhost, padding: '5px 12px', fontSize: 12 }}>
                      Annuler
                    </button>
                  </div>
                  {consoEdit > 0 && (
                    <p style={{ fontSize: 11, color: T.muted, fontWeight: 600, margin: '8px 0 0' }}>
                      {consoEdit} déjà commandé{consoEdit > 1 ? 's' : ''} aujourd&rsquo;hui, sera ajouté automatiquement au total brut interne.
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
      {showOptions && <OptionsArticle articleId={a.id} toast={(msg, type) => { const ev = new CustomEvent('yoppaa-toast', {detail:{msg,type}}); window.dispatchEvent(ev) }}/>}
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
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const [deals, setDeals] = useState([])
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    titre: '', description: '', description_longue: '', prix_deal: '', prix_original: '',
    date_debut: tomorrow, date_fin: tomorrow,
    heure_debut: '00:00', heure_fin: '23:59',
    inclus_morning: false, actif: true, article_id: '',
    cta_appeler_reserver: false,
    photo_url: '', est_bonne_affaire: false,
  })
  const [saving, setSaving] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const firstLoadRef = useRef(true)

  // Heure limite Morning (par défaut 23:00, configurable par commerçant)
  const heureLimite = commercant?.heure_limite_morning?.slice(0, 5) || '23:00'

  useEffect(() => { fetchDeals(); fetchArticles() }, [commercantId])

  async function fetchDeals() {
    if (firstLoadRef.current) setLoading(true)
    const { data } = await supabase.from('yoppaa_deals')
      .select('*, article:articles(id, nom, prix, categorie)')
      .eq('commercant_id', commercantId)
      .order('date_deal', { ascending: false, nullsLast: true })
      .order('created_at', { ascending: false })
    setDeals(data || [])
    if (firstLoadRef.current) { setLoading(false); firstLoadRef.current = false }
  }

  async function fetchArticles() {
    const { data } = await supabase.from('articles')
      .select('id, nom, prix, categorie, actif')
      .eq('commercant_id', commercantId)
      .eq('actif', true)
      .order('categorie').order('nom')
    setArticles(data || [])
  }

  function openNew() {
    setForm({ titre: '', description: '', description_longue: '', prix_deal: '', prix_original: '',
      date_debut: tomorrow, date_fin: tomorrow,
      heure_debut: '00:00', heure_fin: '23:59',
      inclus_morning: false, actif: true, article_id: '',
      cta_appeler_reserver: false,
      photo_url: '', est_bonne_affaire: false })
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
      date_debut: dDebut,
      date_fin: dFin,
      heure_debut: hDebut,
      heure_fin: hFin,
      inclus_morning: !!d.inclus_morning,
      actif: d.actif !== false,
      article_id: d.article_id || '',
      cta_appeler_reserver: !!d.cta_appeler_reserver,
      photo_url: d.photo_url || '',
      est_bonne_affaire: !!d.est_bonne_affaire,
    })
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

  // Quand on choisit un article, on pré-remplit prix_original
  function onArticleChange(articleId) {
    const art = articles.find(a => a.id === articleId)
    setForm(p => ({
      ...p,
      article_id: articleId,
      prix_original: art && !p.prix_original ? String(art.prix) : p.prix_original,
    }))
  }

  // Calcule si la deadline Morning est dépassée pour la date du deal
  function deadlinePassee(dateDeal, inclusMorning) {
    if (!inclusMorning) return false
    if (!dateDeal) return false
    // Pour figurer dans Le Morning du jour J, il faut soumettre avant 23h J-1
    // Donc deadline = "veille du deal à 23h"
    const veille = new Date(dateDeal + 'T00:00:00')
    veille.setDate(veille.getDate() - 1)
    const [h, m] = heureLimite.split(':').map(Number)
    veille.setHours(h, m, 0, 0)
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
    // Validation prix : prix_deal doit etre inferieur au prix_original (audit M4.2 bug)
    if (form.prix_deal && form.prix_original) {
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
      // date_deal = 1er jour de la période (utilisé pour la sélection Good Morning Yoppers)
      date_deal: dDebut,
      date_debut: dateDebut,
      date_fin: dateFin,
      inclus_morning: !!form.inclus_morning,
      actif: !!form.actif,
      article_id: form.article_id || null,
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
    if (!confirm('Supprimer ce deal ?')) return
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
        <strong>Good Morning Yoppers</strong> · push quotidien à 7h30 aux clients de ta zone.
        <br/>Cochez «&nbsp;Inclure dans le Good Morning Yoppers&nbsp;» avant <strong>{heureLimite}</strong> la veille pour y apparaître. Un seul deal par jour par commerçant peut être inclus.
      </div>

      {/* Formulaire création / édition */}
      {showForm && (
        <div style={s.cardActive}>
          <h3 style={{ ...s.h3, marginBottom: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name={editId ? 'edit' : 'plus'} size={14} color={T.main}/>
            {editId ? 'Modifier le deal' : 'Nouveau deal'}
          </h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><label style={s.label}>Titre *</label><Input value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder="Ex: 2 croissants achetés, 1 offert"/></div>

            {/* Photo du deal (utilisee en hero dans la modale enrichie cote client) */}
            <div>
              <label style={s.label}>Photo du deal</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {form.photo_url ? (
                  <div style={{ position: 'relative', width: 88, height: 88, borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${T.pale}`, flexShrink: 0 }}>
                    <img src={form.photo_url} alt="Photo deal" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
                  onResult={v => setForm(p => ({ ...p, description: v.court || p.description, description_longue: v.long || p.description_longue }))}
                  toast={toast} />
              </div>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Une ou deux phrases affichées sur la card du deal…"/>
            </div>

            <div>
              <label style={s.label}>Description enrichie</label>
              <Textarea value={form.description_longue} onChange={e => setForm(p => ({ ...p, description_longue: e.target.value }))} placeholder="Détails complets affichés sur la fiche du deal : conditions, composition, avantages…" style={{ minHeight: 110 }}/>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                Visible dans la fiche complète du deal côté Yopper. Idéal pour raconter l&rsquo;histoire du produit ou détailler les conditions.
              </p>
            </div>
            <div>
              <label style={s.label}>Article concerné (optionnel)</label>
              <select value={form.article_id} onChange={e => onArticleChange(e.target.value)}
                style={{ ...s.input, cursor: 'pointer' }}>
                <option value="">— Deal général (pas lié à un produit) —</option>
                {articles.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nom}{a.categorie ? ` · ${a.categorie}` : ''} — {Number(a.prix).toFixed(2)}€
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                Si tu lies un produit, le badge DEAL s&rsquo;affiche dessus dans le menu et la réduction est appliquée automatiquement au panier (plan Vendre alimentaire).
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Prix deal (€)</label><Input type="number" step="0.10" min="0" value={form.prix_deal} onChange={e => setForm(p => ({ ...p, prix_deal: e.target.value }))} placeholder="2.50"/></div>
              <div><label style={s.label}>Prix d&rsquo;origine (€)</label><Input type="number" step="0.10" min="0" value={form.prix_original} onChange={e => setForm(p => ({ ...p, prix_original: e.target.value }))} placeholder="3.50"/></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={s.label}>Date début *</label>
                <Input type="date" value={form.date_debut} min={today}
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
              <div>
                <label style={s.label}>Date fin *</label>
                <Input type="date" value={form.date_fin} min={form.date_debut || today}
                  onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))}/>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Heure début</label><Input type="time" value={form.heure_debut} onChange={e => setForm(p => ({ ...p, heure_debut: e.target.value }))}/></div>
              <div><label style={s.label}>Heure fin</label><Input type="time" value={form.heure_fin} onChange={e => setForm(p => ({ ...p, heure_fin: e.target.value }))}/></div>
            </div>
            {form.date_debut && form.date_fin && form.date_debut !== form.date_fin && (
              <p style={{ fontSize: 11, color: T.muted, fontStyle: 'italic', margin: 0 }}>
                Période multi-jours : le deal sera affiché tous les jours entre {form.date_debut} et {form.date_fin}. Pour le Good Morning Yoppers, le push partira le matin du {form.date_debut}.
              </p>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: form.inclus_morning ? '#FFF7ED' : '#FAFAFA', border: `1.5px solid ${form.inclus_morning ? '#EA580C' : T.hairline}`, borderRadius: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.inclus_morning} onChange={e => setForm(p => ({ ...p, inclus_morning: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sun size={14} strokeWidth={1.8} color="#EA580C"/> Inclure dans le Good Morning Yoppers</span>
            </label>
            {warningSoumission && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#7F1D1D', fontWeight: 600 }}>
                <AlertTriangle size={14} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Deadline dépassée, ce deal ne sera pas dans le Good Morning Yoppers de demain.
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
  const firstLoadRef = useRef(true)

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
    if (!confirm('Supprimer cette actualité ?')) return
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
            <div><label style={s.label}>Titre *</label><Input value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder={form.type === 'alerte' ? 'Ex: Fermé exceptionnellement vendredi' : 'Ex: Nouveau menu d&rsquo;hiver dès lundi'}/></div>

            {/* Photo (utilisee comme hero dans la modale enrichie cote client) */}
            <div>
              <label style={s.label}>Photo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {form.photo_url ? (
                  <div style={{ position: 'relative', width: 88, height: 88, borderRadius: 12, overflow: 'hidden', border: `1.5px solid ${T.pale}`, flexShrink: 0 }}>
                    <img src={form.photo_url} alt="Photo actu" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
                  onResult={v => setForm(p => ({ ...p, contenu: v.court || p.contenu, contenu_long: v.long || p.contenu_long }))}
                  toast={toast} />
              </div>
              <Textarea value={form.contenu} onChange={e => setForm(p => ({ ...p, contenu: e.target.value }))} placeholder="Une phrase visible sur la fiche"/>
            </div>

            <div>
              <label style={s.label}>Contenu enrichi</label>
              <Textarea value={form.contenu_long} onChange={e => setForm(p => ({ ...p, contenu_long: e.target.value }))} placeholder="Détails complets affichés dans la fiche de l&rsquo;actualité" style={{ minHeight: 110 }}/>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 4, lineHeight: 1.4 }}>
                Visible dans la fiche complète de l&rsquo;actualité côté Yopper. Idéal pour raconter le contexte.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Date début</label><Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))}/></div>
              <div><label style={s.label}>Date fin (vide = pas d&rsquo;échéance)</label><Input type="date" value={form.date_fin} min={form.date_debut} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))}/></div>
            </div>

            {/* Inclure dans Good Morning Yoppers. Exister limite a 1/semaine
                calendaire. Communiquer / Vendre : illimite cote UI. */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: form.inclus_gmy ? '#FFF7ED' : '#FAFAFA', border: `1.5px solid ${form.inclus_gmy ? '#EA580C' : T.hairline}`, borderRadius: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.inclus_gmy} onChange={e => setForm(p => ({ ...p, inclus_gmy: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: T.ink, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}><Sun size={14} strokeWidth={1.8} color="#EA580C"/> Inclure dans Le Good Morning Yoppers</span>
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>
                  {estExister ? 'Palier Exister : 1 apparition GMY par semaine calendaire (lundi-dimanche).' : 'Ta publication apparaîtra dans le push du matin 7h30 aux Yoppers de ta zone.'}
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
  const [form, setForm] = useState({ heure_debut: '', heure_fin: '', max_commandes: 5, delta_minutes: 0, actif: true, capacite_temps: 30 })
  const [fermetureForm, setFermetureForm] = useState({ date_debut: '', date_fin: '', motif: '' })
  const [saving, setSaving] = useState(false)
  const [savingFermeture, setSavingFermeture] = useState(false)
  const [showCopier, setShowCopier] = useState(false)
  const [joursCibles, setJoursCibles] = useState([])

  const [horizon, setHorizon] = useState(1)
  const [savingHorizon, setSavingHorizon] = useState(false)
  const [modeGlobal, setModeGlobal] = useState('commandes')
  const [savingMode, setSavingMode] = useState(false)

  useEffect(() => { fetchAll() }, [commercantId])

  async function fetchAll() {
    setLoading(true)
    const [{ data: cren }, { data: comm }, { data: ferm }] = await Promise.all([
      supabase.from('creneaux').select('*').eq('commercant_id', commercantId).order('heure_debut'),
      supabase.from('commercants').select('horizon_commande, mode_capacite, horaires_detail').eq('id', commercantId).single(),
      supabase.from('fermetures_exceptionnelles').select('*').eq('commercant_id', commercantId).order('date_debut')
    ])
    setCreneaux(cren || [])
    setHorizon(comm?.horizon_commande || 1)
    setModeGlobal(comm?.mode_capacite || 'commandes')
    setHoraires(comm?.horaires_detail || null)
    setFermetures(ferm || [])
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

  async function toggleCreneau(c) {
    await supabase.from('creneaux').update({ actif: !c.actif }).eq('id', c.id)
    fetchAll()
  }

  // ─── Fix suppression individuelle ─────────────────────────────────────────
  async function deleteCreneau(id) {
    if (!confirm('Supprimer ce créneau ?')) return
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
    if (!confirm(msg)) return

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
      if (!confirm(`${avecCmd.length} créneau(x) ont des commandes actives.\nOK = supprimer uniquement les ${sansCmd.length} créneaux libres`)) return
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
        if (!confirm(`Ce créneau est hors des horaires d'ouverture (${h.debut}–${h.fin}).\nContinuer quand même ?`)) return
      }
    }

    // Superposition sur ce jour
    const existants = creneauxDuJour(jourActif)
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
      capacite_temps: parseFloat(form.capacite_temps) || 30
    })
    if (error) { toast('Erreur : ' + error.message, 'error'); setSaving(false); return }
    toast('Créneau ajouté'); setSaving(false); setShowForm(false)
    setForm({ heure_debut: '', heure_fin: '', max_commandes: 5, delta_minutes: 0, actif: true, capacite_temps: 30 })
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
      if (!confirm(`${existants.length} créneau(x) existent déjà pour ${jourActif}.\nOK = remplacer · Annuler = abandonner`)) return
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
    if (!confirm('Supprimer cette fermeture ?')) return
    await supabase.from('fermetures_exceptionnelles').delete().eq('id', id)
    toast('Fermeture supprimée'); fetchAll()
  }

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  const HORIZONS = [
    { val: 1, label: '1 jour',  desc: "Aujourd'hui seulement" },
    { val: 2, label: '2 jours', desc: "Aujourd'hui + demain" },
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
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
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
      </div>

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
              <div><label style={s.label}>Date début *</label><Input type="date" value={fermetureForm.date_debut} onChange={e => setFermetureForm(p => ({ ...p, date_debut: e.target.value }))} /></div>
              <div><label style={s.label}>Date fin *</label><Input type="date" value={fermetureForm.date_fin} onChange={e => setFermetureForm(p => ({ ...p, date_fin: e.target.value }))} /></div>
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
function TabLivraison({ commercantId, toast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [codesPostaux, setCodesPostaux] = useState([])
  const [inputCP, setInputCP] = useState('')
  const [fraisFixe, setFraisFixe] = useState('')
  const [gratuitDes, setGratuitDes] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('livraison_config').select('*').eq('commercant_id', commercantId).maybeSingle()
      if (data) {
        setCodesPostaux(data.codes_postaux || [])
        setFraisFixe(data.frais_fixe != null ? String(data.frais_fixe) : '')
        setGratuitDes(data.gratuit_des != null ? String(data.gratuit_des) : '')
      }
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

  async function sauvegarder() {
    if (codesPostaux.length === 0) { toast('Ajoute au moins un code postal de livraison', 'error'); return }
    const frais = parseFloat((fraisFixe || '0').replace(',', '.'))
    if (isNaN(frais) || frais < 0) { toast('Frais de livraison invalide', 'error'); return }
    let gratuit = null
    if (gratuitDes.trim()) {
      gratuit = parseFloat(gratuitDes.replace(',', '.'))
      if (isNaN(gratuit) || gratuit < 0) { toast('Seuil de gratuité invalide', 'error'); return }
    }
    setSaving(true)
    const { error } = await supabase.from('livraison_config').upsert({
      commercant_id: commercantId,
      codes_postaux: codesPostaux,
      frais_fixe: frais,
      gratuit_des: gratuit,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'commercant_id' })
    setSaving(false)
    if (error) { toast('Erreur : ' + error.message, 'error'); return }
    toast('Livraison enregistrée', 'success')
  }

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
            <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Gratuit dès (€) — optionnel</span>
            <input value={gratuitDes} onChange={e => setGratuitDes(e.target.value)} placeholder="Ex : 25" inputMode="decimal" style={inputStyle} />
          </label>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: T.muted }}>
          Aperçu Yopper : {(() => {
            const f = parseFloat((fraisFixe || '0').replace(',', '.')) || 0
            const g = gratuitDes.trim() ? parseFloat(gratuitDes.replace(',', '.')) : null
            if (f === 0) return 'Livraison gratuite'
            return `Livraison ${f.toFixed(2)}€${g ? `, offerte dès ${g.toFixed(2)}€` : ''}`
          })()}
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

  useEffect(() => { charger() }, [commercantId])

  async function charger() {
    const { data } = await supabase.from('livraison_creneaux').select('*').eq('commercant_id', commercantId)
    setCreneaux(data || [])
    setLoading(false)
  }

  async function ajouter() {
    if (!form.heure_debut || !form.heure_fin) { toast('Renseigne les heures de la tournée', 'error'); return }
    if (form.heure_fin <= form.heure_debut) { toast('L’heure de fin doit être après le début', 'error'); return }
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

function TabProfil({ commercantId, toast, onSaved }) {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)
  // Photos de la fiche (couverture + galerie max 4), table commercant_photos.
  // Même mécanique que l'étape Visuels du signup : le commerçant doit pouvoir
  // enrichir sa fiche APRÈS l'inscription sans repasser par le signup.
  const [couvertureUrl, setCouvertureUrl] = useState(null)
  const [galerie, setGalerie] = useState([])
  const [uploadingCouv, setUploadingCouv] = useState(false)
  const [uploadingGal, setUploadingGal] = useState(false)
  const MAX_GALERIE = 4

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
      const defaultHoraires = { lundi: { ouvert: true, debut: '07:00', fin: '14:00' }, mardi: { ouvert: true, debut: '07:00', fin: '14:00' }, mercredi: { ouvert: true, debut: '07:00', fin: '14:00' }, jeudi: { ouvert: true, debut: '07:00', fin: '14:00' }, vendredi: { ouvert: true, debut: '07:00', fin: '14:00' }, samedi: { ouvert: true, debut: '07:00', fin: '13:00' }, dimanche: { ouvert: false, debut: '07:00', fin: '12:00' } }
      setForm({ nom: data.nom || '', type: data.type || '', email: data.email || '', telephone: data.telephone || '', adresse: data.adresse || '', description: data.description || '', horaires: data.horaires || '', heure_ouverture_resa: data.heure_ouverture_resa ? data.heure_ouverture_resa.slice(0,5) : '21:00', horaires_detail: data.horaires_detail || defaultHoraires, categorie: data.categorie || 'alimentaire', livraison_actif: !!data.livraison_actif, fidelite_actif: !!data.fidelite_actif, plan: data.plan || 'exister', notif_mode: data.notif_mode || 'recap_jour', rdv_actif: !!data.rdv_actif, photos_catalogue_actif: data.photos_catalogue_actif !== false, boutique_mode_vente: data.boutique_mode_vente || 'retrait', boutique_retrait_paiement: data.boutique_retrait_paiement || 'en_ligne', boutique_frais_port: data.boutique_frais_port ?? '', boutique_gratuit_des: data.boutique_gratuit_des ?? '' })
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
    if (!confirm('Supprimer le logo ?')) return
    await supabase.from('commercants').update({ logo_url: null }).eq('id', commercantId)
    setLogoPreview(null); toast('Logo supprimé')
  }

  async function saveProfil() {
    if (!form.nom.trim()) return toast('Le nom est obligatoire', 'error')
    setSaving(true)
    const { error } = await supabase.from('commercants').update({ nom: form.nom.trim(), type: form.type.trim(), telephone: form.telephone.trim() || null, adresse: form.adresse.trim() || null, description: form.description.trim() || null, horaires: form.horaires.trim() || null, heure_ouverture_resa: form.heure_ouverture_resa || '21:00', horaires_detail: form.horaires_detail, livraison_actif: !!form.livraison_actif, fidelite_actif: !!form.fidelite_actif, notif_mode: form.notif_mode || 'recap_jour', photos_catalogue_actif: !!form.photos_catalogue_actif, boutique_mode_vente: form.boutique_mode_vente || 'retrait', boutique_retrait_paiement: form.boutique_retrait_paiement || 'en_ligne', boutique_frais_port: parseFloat(form.boutique_frais_port) || 0, boutique_gratuit_des: (form.boutique_gratuit_des === '' || form.boutique_gratuit_des == null) ? null : parseFloat(form.boutique_gratuit_des) }).eq('id', commercantId)
    setSaving(false)
    if (error) {
      console.error('[ConfigDashboard.saveProfil]', error)
      toast(`Erreur enregistrement : ${error.message}`, 'error')
      return
    }
    toast('Profil mis à jour')
    // Rafraîchit le commerçant parent : les onglets conditionnels (ex. Livraison
    // via livraison_actif) apparaissent/disparaissent sans reload manuel.
    onSaved?.()
  }

  if (loading || !form) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      <h2 style={s.h2}>Profil du commerce</h2>

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
            {logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <Store size={28} strokeWidth={1.6} color={T.muted}/>}
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

      {/* Photos de la fiche : couverture + galerie (comme l'étape Visuels du signup) */}
      <div style={s.card}>
        <label style={s.label}>Photos de ta fiche</label>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
          La couverture est ta vignette principale. Les photos supplémentaires s&rsquo;affichent en carrousel sur ta page client.
        </p>

        {/* Couverture */}
        <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Photo de couverture</p>
        <label style={{ display: 'block', width: '100%', maxWidth: 420, aspectRatio: '16/9', borderRadius: 14, border: `2px dashed ${couvertureUrl ? T.main : T.light}`, background: T.pale, overflow: 'hidden', cursor: uploadingCouv ? 'wait' : 'pointer', position: 'relative' }}>
          {couvertureUrl ? (
            <img src={couvertureUrl} alt="Couverture" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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

        {/* Galerie */}
        <p style={{ fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '16px 0 8px' }}>Photos supplémentaires ({galerie.length}/{MAX_GALERIE})</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {galerie.map(p => (
            <div key={p.id} style={{ width: 120, aspectRatio: '4/3', borderRadius: 12, overflow: 'hidden', position: 'relative', border: `1px solid ${T.hairline}` }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              <button type="button" onClick={() => supprimerPhotoGalerie(p)} title="Supprimer"
                style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 100, border: 'none', background: 'rgba(22,6,54,0.85)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: '22px', padding: 0 }}>×</button>
            </div>
          ))}
          {galerie.length < MAX_GALERIE && (
            <label style={{ width: 120, aspectRatio: '4/3', borderRadius: 12, border: `2px dashed ${T.light}`, background: '#FAFAFA', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: uploadingGal ? 'wait' : 'pointer', color: T.muted, fontSize: 11, fontWeight: 700 }}>
              <Camera size={18} strokeWidth={1.8} color={T.main}/>
              {uploadingGal ? 'Upload…' : 'Ajouter'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) uploadGalerie(e.target.files[0]); e.target.value = '' }} disabled={uploadingGal}/>
            </label>
          )}
        </div>
        <p style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>Intérieur, produits, équipe… Tous les ratios acceptés.</p>
      </div>

      {/* Infos */}
      <div style={s.card}>
        <div style={{ display: 'grid', gap: 14 }}>
          {[
            { label: 'Nom *', key: 'nom', placeholder: 'Ex: Boulangerie Dupont' },
            { label: 'Type', key: 'type', placeholder: 'Ex: Boulangerie, Coffee shop...' },
            { label: 'Email', key: 'email', placeholder: '', type: 'email', disabled: true, hint: 'Non modifiable, contact support' },
            { label: 'Téléphone', key: 'telephone', placeholder: '+32 470 00 00 00', type: 'tel' },
            { label: 'Adresse', key: 'adresse', placeholder: 'Rue de la Paix 12, 1000 Bruxelles' },
          ].map(f => (
            <div key={f.key}>
              <label style={s.label}>{f.label}</label>
              <Input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} type={f.type || 'text'} disabled={f.disabled} style={f.disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}} />
              {f.hint && <p style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{f.hint}</p>}
            </div>
          ))}
          <div>
            <label style={s.label}>Description (visible clients)</label>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Décrivez votre commerce..." />
          </div>

          <div>
            <label style={s.label}>Horaires d'ouverture</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].map((jour, idx) => {
                const labels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
                const h = form.horaires_detail?.[jour] || { ouvert: false, debut: '07:00', fin: '14:00' }
                return (
                  <div key={jour} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: h.ouvert ? T.pale : '#F9FAFB', border: `1.5px solid ${h.ouvert ? T.light : '#E5E7EB'}` }}>
                    <button onClick={() => setForm(p => ({ ...p, horaires_detail: { ...p.horaires_detail, [jour]: { ...h, ouvert: !h.ouvert } } }))}
                      style={{ width: 36, height: 20, borderRadius: 100, background: h.ouvert ? T.main : '#D1D5DB', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 2, left: h.ouvert ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}/>
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: h.ouvert ? T.ink : T.muted, width: 76, flexShrink: 0 }}>{labels[idx]}</span>
                    {h.ouvert ? (
                      <>
                        <Input type="time" value={h.debut} onChange={e => setForm(p => ({ ...p, horaires_detail: { ...p.horaires_detail, [jour]: { ...h, debut: e.target.value } } }))} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' }} />
                        <span style={{ fontSize: 13, color: T.muted, flexShrink: 0 }}>→</span>
                        <Input type="time" value={h.fin} onChange={e => setForm(p => ({ ...p, horaires_detail: { ...p.horaires_detail, [jour]: { ...h, fin: e.target.value } } }))} style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '4px 8px' }} />
                      </>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#9CA3AF' }}>Fermé</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <label style={s.label}>Ouverture des réservations</label>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>
              Heure à partir de laquelle les clients peuvent réserver pour le lendemain (défaut : 21h00)
            </p>
            <Input type="time" value={form.heure_ouverture_resa} onChange={e => setForm(p => ({ ...p, heure_ouverture_resa: e.target.value }))} style={{ width: 140 }} />
          </div>
        </div>

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
                  { val: 'chaque',     Icon: Zap,           label: `À chaque nouvelle ${nounSing.toLowerCase() === 'rdv' ? 'demande' : nounSing}`, desc: `Email instantané à chaque ${nounSing.toLowerCase() === 'rdv' ? 'réservation' : 'commande'}. Idéal si tu n'ouvres pas le dashboard souvent.` },
                  { val: 'recap_jour', Icon: ClipboardList, label: 'Récap quotidien (8h)',           desc: `Un seul email chaque matin avec tous tes ${noun} de la journée. Moins intrusif.` },
                  { val: 'aucun',      Icon: BellOff,       label: 'Aucun email',                    desc: 'Tu consultes uniquement ton dashboard. Aucun email automatique.' },
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

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${form.fidelite_actif ? T.main : T.pale}`, background: form.fidelite_actif ? T.pale : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={!!form.fidelite_actif} onChange={e => setForm(p => ({ ...p, fidelite_actif: e.target.checked }))} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Star size={15} strokeWidth={1.8}/> Activer le programme fidélité</p>
                <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                  Programme tampon : la 10ème commande offerte. Module fidélité complet à venir.
                </p>
              </div>
            </label>
          </div>
        )}

        {/* ─── Mode de vente boutique (détail) ─── */}
        {form.categorie === 'detail' && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
            <p style={{ ...s.label, marginBottom: 6 }}>Mode de vente de la boutique</p>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>Comment tes clients récupèrent leurs achats.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {[
                { val: 'retrait', label: 'Retrait en magasin', desc: 'Le client vient chercher sa commande.' },
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
                <p style={{ ...s.label, marginBottom: 6 }}>Paiement au retrait</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ val: 'en_ligne', label: 'En ligne (obligatoire)' }, { val: 'magasin', label: 'En magasin' }].map(opt => {
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

      <div style={{ ...s.card, background: T.pale, boxShadow: 'none', border: 'none' }}>
        <p style={{ fontSize: 12, color: T.main, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Lightbulb size={13} strokeWidth={1.8}/> URL client : yoppaa.app/commander</p>
      </div>

      <QRCodeSection commercantId={commercantId} toast={toast} />
    </div>
  )
}

// ─── Composant QR Code imprimable ─────────────────────────────────────────────
function QRCodeSection({ commercantId, toast }) {
  const [slug, setSlug]           = useState(null)
  const [nomCommerce, setNomCommerce] = useState('')
  const [loading, setLoading]     = useState(true)
  const [qrDataUrl, setQrDataUrl] = useState(null)

  const url = slug ? `https://yoppaa.app/commander/${slug}` : null

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
  }, [url])

  // ─── Canvas composé — style tribu hype ───────────────────────────────────
  async function buildCompositeCanvas() {
    const QR   = 820   // taille QR rendu dans le canvas
    const PAD  = 56
    const W    = QR + PAD * 2

    // Zones verticales
    const TOP_H    = 200  // 3 points + yoppaa + nom commerce
    const QR_H     = QR + 32
    const MIDDLE_H = 80   // tagline sous QR
    const BOT_H    = 120  // "Rejoins la tribu..."
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

    // ── 3 points yo·pp·aa ──
    const dots = [
      { r: 7,  c: 'rgba(255,255,255,0.5)' },
      { r: 10, c: '#C4A0F4' },
      { r: 7,  c: '#9660E0' },
    ]
    const gapDots = 22
    const totalDW = dots.reduce((a, d) => a + d.r * 2, 0) + gapDots * 2
    let dx = W / 2 - totalDW / 2
    const dotsY = PAD + 38
    dots.forEach((d, i) => {
      dx += d.r
      ctx.beginPath(); ctx.arc(dx, dotsY, d.r, 0, Math.PI * 2)
      ctx.fillStyle = d.c; ctx.fill()
      // Glow sur le point du milieu
      if (i === 1) {
        ctx.beginPath(); ctx.arc(dx, dotsY, d.r + 6, 0, Math.PI * 2)
        const glow = ctx.createRadialGradient(dx, dotsY, d.r, dx, dotsY, d.r + 10)
        glow.addColorStop(0, 'rgba(196,160,244,0.35)')
        glow.addColorStop(1, 'rgba(196,160,244,0)')
        ctx.fillStyle = glow; ctx.fill()
      }
      dx += d.r + (i < 2 ? gapDots : 0)
    })

    // ── "yoppaa" wordmark ──
    ctx.textAlign = 'center'
    ctx.fillStyle = '#FFFFFF'
    ctx.font = '800 80px "Plus Jakarta Sans", system-ui, Arial, sans-serif'
    ctx.fillText('yoppaa', W / 2, PAD + 108)

    // ── Séparateur subtil ──
    const sep = ctx.createLinearGradient(PAD * 2, 0, W - PAD * 2, 0)
    sep.addColorStop(0,   'rgba(196,160,244,0)')
    sep.addColorStop(0.5, 'rgba(196,160,244,0.3)')
    sep.addColorStop(1,   'rgba(196,160,244,0)')
    ctx.strokeStyle = sep; ctx.lineWidth = 0.8
    ctx.beginPath(); ctx.moveTo(PAD * 2, PAD + 122); ctx.lineTo(W - PAD * 2, PAD + 122); ctx.stroke()

    // ── Nom du commerce — bien visible ──
    ctx.font = '700 38px "DM Sans", Arial, sans-serif'
    ctx.fillStyle = '#C4A0F4'
    ctx.fillText(nomCommerce, W / 2, PAD + 168)

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
    ctx.fillText('Commande en avance, passe en priorité', W / 2, midY + 46)

    // ── "ICI ON EST YOPPERS" — grande accroche ──
    const botY = PAD + TOP_H + QR_H + MIDDLE_H
    ctx.font = '900 52px "DM Sans", Arial, sans-serif'
    // Dégradé blanc → light sur le texte
    const txtGrad = ctx.createLinearGradient(PAD, 0, W - PAD, 0)
    txtGrad.addColorStop(0, '#FFFFFF')
    txtGrad.addColorStop(0.5, '#EDE0FF')
    txtGrad.addColorStop(1, '#C4A0F4')
    ctx.fillStyle = txtGrad
    ctx.fillText('ICI ON EST YOPPERS', W / 2, botY + 50)

    // ── Ligne déco bottom ──
    ctx.strokeStyle = sep; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(PAD, botY + 66); ctx.lineTo(W - PAD, botY + 66); ctx.stroke()

    // ── "Rejoins la tribu — yoppaa.app" ──
    ctx.font = '500 24px "DM Sans", Arial, sans-serif'
    ctx.fillStyle = 'rgba(196,160,244,0.6)'
    ctx.fillText('Rejoins la tribu sur yoppaa.app', W / 2, botY + 96)

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
<title>Yoppaa QR — ${nomCommerce}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  @page{size:${format} portrait;margin:0;}
  html,body{width:${pw};height:${ph};overflow:hidden;background:#160636!important;
    -webkit-print-color-adjust:exact;print-color-adjust:exact;
    display:flex;align-items:center;justify-content:center;}
  img{width:${imgW};height:auto;display:block;}
</style></head>
<body><img src="${imgUrl}"/></body>
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
          ? <img src={qrDataUrl} alt="QR Code" style={{ width: 196, height: 196, borderRadius: 12, display: 'block', margin: '0 auto', background: '#fff', padding: 8, boxShadow: '0 8px 32px rgba(107,53,196,0.5)' }}/>
          : <div style={{ width: 196, height: 196, background: '#2D0F6B', borderRadius: 12, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C4A0F4', fontSize: 12 }}>Génération...</div>
        }

        {/* Tagline */}
        <p style={{ fontSize: 11, color: 'rgba(196,160,244,0.7)', marginTop: 10, marginBottom: 6 }}>Commande en avance, passe en priorité</p>

        {/* Accroche tribu */}
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 900, fontSize: '1.05rem', color: '#fff', letterSpacing: '-0.3px', marginBottom: 4 }}>ICI ON EST YOPPERS 🟣</p>

        {/* URL */}
        <p style={{ fontSize: 9, color: 'rgba(196,160,244,0.5)', marginTop: 2 }}>Rejoins la tribu sur yoppaa.app</p>
      </div>

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
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...s.btn, ...s.btnPrimary, flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => printQR('A5')} disabled={!qrDataUrl}><Printer size={13} strokeWidth={1.8}/> A5</button>
        <button style={{ ...s.btn, ...s.btnPrimary, flex: 1, justifyContent: 'center', display: 'inline-flex', alignItems: 'center', gap: 5 }} onClick={() => printQR('A4')} disabled={!qrDataUrl}><Printer size={13} strokeWidth={1.8}/> A4</button>
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

// ═════════════════════════════════════════════════════════════════════════
// TAB RDV — Configuration vitrine (Prestations / Praticiens / Créneaux)
// Visible uniquement pour les commerçants vitrine au plan "vendre" (rdv_actif).
// 3 sous-onglets : Prestations | Praticiens | Créneaux RDV.
// Sess 5a : Prestations CRUD. Sess 5b : Praticiens. Sess 5c : Créneaux.
// ═════════════════════════════════════════════════════════════════════════

function TabRdv({ commercantId, commercant, toast }) {
  const [subTab, setSubTab] = useState('prestations')
  const subTabs = [
    { id: 'prestations', label: 'Prestations' },
    { id: 'praticiens',  label: 'Praticiens' },
    { id: 'creneaux',    label: 'Créneaux' },
    { id: 'fermetures',  label: 'Fermetures' },
  ]
  return (
    <div>
      {/* Barre sous-onglets RDV */}
      <div style={{ display: 'flex', gap: 6, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 16, boxShadow: '0 1px 6px rgba(22,6,54,0.05)', border: `1px solid ${T.hairline}` }}>
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13, background: subTab === t.id ? T.main : 'transparent', color: subTab === t.id ? '#fff' : T.muted, transition: 'all 0.2s' }}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'prestations' && <TabRdvPrestations commercantId={commercantId} toast={toast} />}
      {subTab === 'praticiens'  && <TabRdvPraticiens commercantId={commercantId} toast={toast} />}
      {subTab === 'creneaux'    && <TabRdvCreneaux commercantId={commercantId} toast={toast} />}
      {subTab === 'fermetures'  && <TabRdvFermetures commercantId={commercantId} toast={toast} />}
    </div>
  )
}

function TabRdvPlaceholder({ label, detail }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 24, textAlign: 'center', border: `1px solid ${T.hairline}` }}>
      <p style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{detail}</p>
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
  const initialForm = { nom: '', description: '', duree_minutes: '30', prix_mode: 'fixe', prix: '', prix_min: '', prix_max: '', acompte_pourcent: '0', actif: true }
  const [form, setForm] = useState(initialForm)
  const firstLoadRef = useRef(true)

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
    setForm(initialForm); setEditId(null); setSelectedPraticiens(new Set()); setShowForm(true)
  }
  function openEdit(p) {
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
    if (!window.confirm(`Supprimer la prestation "${p.nom}" ? Les RDV existants liés à cette prestation ne seront pas affectés.`)) return
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
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, marginBottom: 14 }}>{editId ? 'Modifier la prestation' : 'Nouvelle prestation'}</p>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Nom *</label>
            <Input value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} placeholder="Coupe femme" style={{ marginBottom: 10 }}/>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.muted, marginBottom: 4 }}>Description (optionnel)</label>
            <Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Shampoing, coupe, brushing" rows={2} style={{ marginBottom: 10 }}/>
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
                            <img src={p.photo_url} alt={p.prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
    if (!window.confirm(`Supprimer le praticien "${p.prenom}${p.nom ? ' ' + p.nom : ''}" ? Les RDV existants ne seront pas affectés.`)) return
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
                  <img src={p.photo_url} alt={p.prenom} style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
            <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, marginBottom: 14 }}>{editId ? 'Modifier le praticien' : 'Nouveau praticien'}</p>

            {/* Photo + couleur en haut */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, padding: 12, background: T.bg, borderRadius: 12 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 70, height: 70, borderRadius: '50%', background: form.couleur_hex, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, overflow: 'hidden', border: `3px solid ${form.couleur_hex}55` }}>
                  {form.photo_url ? (
                    <img src={form.photo_url} alt="Praticien" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
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
function TabRdvCreneaux({ commercantId, toast }) {
  const JOURS_SEMAINE = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
  const JOURS_LABELS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dim.']
  const PAS_OPTIONS = [5, 10, 15, 30, 60]

  const [creneaux, setCreneaux] = useState([])
  const [praticiens, setPraticiens] = useState([])
  const [loading, setLoading] = useState(true)
  const [jourActif, setJourActif] = useState('lundi')
  const [praticienFiltre, setPraticienFiltre] = useState('all')  // 'all' | 'tous' | praticienId
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const initialForm = {
    praticien_id: 'tous',
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

  useEffect(() => { fetchAll() }, [commercantId])

  async function fetchAll() {
    setLoading(true)
    const [{ data: cren }, { data: prat }] = await Promise.all([
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
    ])
    setCreneaux(cren || [])
    setPraticiens(prat || [])
    setLoading(false)
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
    const payload = {
      commercant_id: commercantId,
      praticien_id: form.praticien_id === 'tous' ? null : form.praticien_id,
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

  async function softDelete(c) {
    if (!window.confirm(`Supprimer ce créneau (${c.jour_semaine} ${c.heure_debut?.slice(0,5)} – ${c.heure_fin?.slice(0,5)}) ?`)) return
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
      <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 12, marginBottom: 14, border: `1px solid ${T.hairline}`, overflowX: 'auto' }}>
        {JOURS_SEMAINE.map((j, i) => {
          const nbCreneaux = creneaux.filter(c => c.jour_semaine === j).length
          return (
            <button key={j} onClick={() => setJourActif(j)}
              style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 12, background: jourActif === j ? T.bgPanel : 'transparent', color: jourActif === j ? '#fff' : T.muted, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {JOURS_LABELS[i]}
              {nbCreneaux > 0 && (
                <span style={{ background: jourActif === j ? T.main : T.pale, color: jourActif === j ? '#fff' : T.main, fontSize: 10, fontWeight: 800, padding: '1px 5px', borderRadius: 100 }}>
                  {nbCreneaux}
                </span>
              )}
            </button>
          )
        })}
      </div>

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
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
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
    if (!window.confirm(label)) return
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
          <div style={{ background: '#fff', borderRadius: 18, padding: 22, maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
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

function TabSignalements({ commercantId, toast }) {
  const [signalements, setSignalements] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('en_attente')

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

// ─── Composant principal ──────────────────────────────────────────────────────
export default function ConfigDashboard({ commercantId }) {
  const [tab, setTab] = useState('menu')
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState('success')
  const [commercant, setCommercant] = useState(null)

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
  useEffect(() => { rechargerCommercant() }, [commercantId])

  // Onglets dynamiques selon le plan + la catégorie
  const peutDeals = canDo(commercant?.plan, 'deals')
  const peutActus = canDo(commercant?.plan, 'actus_illimitees')
  const iaActif = getIaConfig(commercant?.plan).actif   // Générateur IA (exister 1 test / communiquer / vendre)
  const estVitrine = commercant?.categorie === 'vitrine'

  // Compteur des signalements en attente → badge rouge sur l'onglet Signalements
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
    { id: 'menu',     label: commercant?.categorie === 'detail' ? 'Boutique' : estVitrine ? 'Catalogue' : 'Menu', icon: 'menu' },
    peutDeals && { id: 'deals', label: 'Deals', icon: 'tag' },
    peutActus && { id: 'actus', label: 'Actus', icon: 'sliders' },
    iaActif && { id: 'ia', label: 'Générateur', icon: 'sparkles' },
    !estVitrine && { id: 'creneaux', label: 'Créneaux', icon: 'clock' },
    peutLivraison && { id: 'livraison', label: 'Livraison', icon: 'box' },
    peutRdv && { id: 'rdv', label: 'RDV', icon: 'clock' },
    peutPaiements && { id: 'paiements', label: 'Paiements', icon: 'tag' },
    { id: 'profil',   label: 'Profil',   icon: 'shop' },
    { id: 'avis',     label: 'Avis',     icon: 'star' },
    { id: 'signalements', label: 'Signalements', icon: 'sliders', badge: signalementsEnAttente },
  ].filter(Boolean)

  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', paddingBottom: 24 }}>
      <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 14, marginBottom: 20, boxShadow: '0 2px 12px rgba(22,6,54,0.06)', border: `1px solid ${T.hairline}`, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, minWidth: 80, padding: '10px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13, transition: 'all 0.2s', background: tab === t.id ? T.bgPanel : 'transparent', color: tab === t.id ? '#fff' : T.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, position: 'relative' }}>
            <Icon name={t.icon} size={16} color={tab === t.id ? '#fff' : T.muted}/>
            {t.label}
            {t.badge > 0 && (
              <span style={{ background: '#DC2626', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 100, minWidth: 16, textAlign: 'center', boxShadow: '0 0 0 2px #fff' }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'menu'     && <TabMenu     commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'deals'    && peutDeals && <TabDeals commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'actus'    && peutActus && <TabActus commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'ia'       && iaActif && <TabGenerateur commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'creneaux' && <TabCreneaux commercantId={commercantId} toast={showToast} />}
      {tab === 'livraison' && peutLivraison && <TabLivraison commercantId={commercantId} toast={showToast} />}
      {tab === 'rdv'      && peutRdv && <TabRdv commercantId={commercantId} commercant={commercant} toast={showToast} />}
      {tab === 'paiements' && peutPaiements && <TabPaiements commercantId={commercantId} toast={showToast} />}
      {tab === 'profil'   && <TabProfil   commercantId={commercantId} toast={showToast} onSaved={rechargerCommercant} />}
      {tab === 'avis'     && <TabAvis     commercantId={commercantId} toast={showToast} />}
      {tab === 'signalements' && <TabSignalements commercantId={commercantId} toast={showToast} />}

      <Toast message={toastMsg} type={toastType} />
    </div>
  )
}