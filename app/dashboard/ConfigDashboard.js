'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { canDo } from '@/lib/plans'
import TabPaiements from './TabPaiements'

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
  }
  return <svg {...props} style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>{paths[name]}</svg>
}

// ─── Onglet MENU ──────────────────────────────────────────────────────────────
function TabMenu({ commercantId, commercant, toast }) {
  // ─── Mode vitrine ou menu commandable ────────────────────────────────────
  // Pour catégorie='vitrine' (coiffeur, opticien…), on retire stock/jour, temps prépa,
  // et on force est_vitrine=true sur les articles créés.
  const estVitrine = commercant?.categorie === 'vitrine'
  // ─── Sous-onglet actif : Articles | Catégories | Personnalisation ────────
  const [subTab, setSubTab] = useState('articles')
  const [searchQuery, setSearchQuery] = useState('')

  const [articles, setArticles] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCatForm, setShowCatForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: '' })
  const [nouvelleCat, setNouvelleCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [catActive, setCatActive] = useState('Tous')
  // Renommage catégorie
  const [renamingCat, setRenamingCat] = useState(null) // nom de la cat en cours de renommage
  const [renameValue, setRenameValue] = useState('')
  const [renameSaving, setRenameSaving] = useState(false)

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
    setForm({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: catActive !== 'Tous' && catActive !== 'Sans catégorie' ? catActive : '', temps_prepa: '' })
    setEditId(null); setShowForm(true)
  }
  function openEdit(a) {
    setForm({ nom: a.nom, description: a.description || '', prix: String(a.prix), stock_jour: String(a.stock_jour ?? ''), actif: a.actif, categorie: a.categorie || '', temps_prepa: String(a.temps_prepa ?? '') })
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
    toast('Catégorie créée ✓')
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
          <p style={{ fontSize: 11, fontWeight: 700, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: 2 }}>{estVitrine ? 'Vitrine' : 'Menu'}</p>
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
            <p style={{ fontSize: 11, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 4 }}>Personnalisation par article</p>
            <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, margin: 0 }}>
              Configure les groupes d&rsquo;options de chaque article (sauces obligatoires, suppléments payants…). Clique pour gérer.
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
                  <OptionsArticle articleId={a.id} toast={(msg, type) => { const ev = new CustomEvent('yoppaa-toast', {detail:{msg,type}}); window.dispatchEvent(ev) }}/>
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
        <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Aucune option — clique sur «&nbsp;+ Groupe&nbsp;» pour en ajouter.</p>
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
                      {consoEdit} déjà commandé{consoEdit > 1 ? 's' : ''} aujourd&rsquo;hui — sera ajouté automatiquement au total brut interne.
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
    titre: '', description: '', prix_deal: '', prix_original: '',
    date_debut: tomorrow, date_fin: tomorrow,
    heure_debut: '00:00', heure_fin: '23:59',
    inclus_morning: false, actif: true, article_id: '',
    cta_appeler_reserver: false,
  })
  const [saving, setSaving] = useState(false)
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
    setForm({ titre: '', description: '', prix_deal: '', prix_original: '',
      date_debut: tomorrow, date_fin: tomorrow,
      heure_debut: '00:00', heure_fin: '23:59',
      inclus_morning: false, actif: true, article_id: '',
      cta_appeler_reserver: false })
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
    })
    setEditId(d.id); setShowForm(true)
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
    const payload = {
      commercant_id: commercantId,
      titre: form.titre.trim(),
      description: form.description.trim() || null,
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
            <div><label style={s.label}>Description</label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Détails du deal, conditions…"/></div>
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
                Si tu lies un produit, le badge DEAL s&rsquo;affiche dessus dans le menu et la réduction est appliquée automatiquement au panier (plan FULL alimentaire).
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
              <span style={{ fontSize: 13, color: T.ink, fontWeight: 700 }}>☀️ Inclure dans le Good Morning Yoppers</span>
            </label>
            {warningSoumission && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#7F1D1D', fontWeight: 600 }}>
                ⚠️ Deadline dépassée — ce deal ne sera pas dans le Good Morning Yoppers de demain.
              </div>
            )}
            {/* CTA Appeler pour réserver : à activer pour les deals qui nécessitent
                contact (réservation, dispo limitée, conditions particulières) */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: form.cta_appeler_reserver ? T.pale : '#FAFAFA', border: `1.5px solid ${form.cta_appeler_reserver ? T.bgPanel : T.hairline}`, borderRadius: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.cta_appeler_reserver} onChange={e => setForm(p => ({ ...p, cta_appeler_reserver: e.target.checked }))} style={{ width: 18, height: 18, cursor: 'pointer' }}/>
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: 13, color: T.ink, fontWeight: 700, display: 'block' }}>📞 Bouton « Appeler pour réserver »</span>
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>Active un bouton d&rsquo;appel direct dans la modale du deal côté client</span>
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
            {d.inclus_morning && <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 100, background: '#FFF7ED', color: '#EA580C' }}>☀️ Morning</span>}
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
function TabActus({ commercantId, toast }) {
  const today = new Date().toISOString().slice(0, 10)
  const [actus, setActus] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    titre: '', contenu: '', type: 'actu', date_debut: today, date_fin: '', actif: true,
  })
  const [saving, setSaving] = useState(false)
  const firstLoadRef = useRef(true)

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
    setForm({ titre: '', contenu: '', type: 'actu', date_debut: today, date_fin: '', actif: true })
    setEditId(null); setShowForm(true)
  }
  function openEdit(a) {
    setForm({
      titre: a.titre || '',
      contenu: a.contenu || '',
      type: a.type || 'actu',
      date_debut: a.date_debut || today,
      date_fin: a.date_fin || '',
      actif: a.actif !== false,
    })
    setEditId(a.id); setShowForm(true)
  }

  async function saveActu() {
    if (!form.titre.trim()) return toast('Titre obligatoire', 'error')
    setSaving(true)
    const payload = {
      commercant_id: commercantId,
      titre: form.titre.trim(),
      contenu: form.contenu.trim() || null,
      type: form.type,
      date_debut: form.date_debut || null,
      date_fin: form.date_fin || null,
      actif: !!form.actif,
    }
    const { error } = editId
      ? await supabase.from('actualites').update(payload).eq('id', editId)
      : await supabase.from('actualites').insert(payload)
    setSaving(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast(editId ? 'Actualité mise à jour' : 'Actualité publiée')
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
            <div><label style={s.label}>Contenu</label><Textarea value={form.contenu} onChange={e => setForm(p => ({ ...p, contenu: e.target.value }))} placeholder="Détails (optionnel)"/></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Date début</label><Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))}/></div>
              <div><label style={s.label}>Date fin (vide = pas d&rsquo;échéance)</label><Input type="date" value={form.date_fin} min={form.date_debut} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))}/></div>
            </div>
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
  const JOURS_LABELS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dim']

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
    toast('Horizon mis à jour ✓')
  }

  async function saveModeGlobal(val) {
    setSavingMode(true)
    await supabase.from('commercants').update({ mode_capacite: val }).eq('id', commercantId)
    setModeGlobal(val); setSavingMode(false)
    toast('Mode mis à jour ✓')
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
    if (cmdLiees?.length > 0) { toast(`Impossible — ${cmdLiees.length} commande(s) active(s) sur ce créneau`, 'error'); return }
    const { error } = await supabase.from('creneaux').delete().eq('id', id)
    if (error) { toast('Erreur suppression : ' + error.message, 'error'); return }
    toast('Créneau supprimé ✓'); fetchAll()
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
      toast('Impossible — tous ont des commandes actives', 'error'); return
    }
    if (avecCmd.length > 0) {
      if (!confirm(`⚠️ ${avecCmd.length} créneau(x) ont des commandes actives.\nOK = supprimer uniquement les ${sansCmd.length} créneaux libres`)) return
    }

    // Supprimer un par un (évite le bug .in())
    let ok = 0
    for (const id of sansCmd) {
      const { error } = await supabase.from('creneaux').delete().eq('id', id)
      if (!error) ok++
    }
    toast(`${ok} créneau(x) supprimé(s) ✓`); fetchAll()
  }

  // ─── Ajouter créneau sur le jour actif ────────────────────────────────────
  async function saveCreneau() {
    if (!form.heure_debut || !form.heure_fin) return toast('Heures obligatoires', 'error')
    if (form.heure_fin <= form.heure_debut) return toast('Heure de fin invalide', 'error')

    // Vérif hors horaires
    if (jourOuvert(jourActif) && horaires?.[jourActif]) {
      const h = horaireJour(jourActif)
      if (form.heure_debut < h.debut || form.heure_fin > h.fin) {
        if (!confirm(`⚠️ Ce créneau est hors des horaires d'ouverture (${h.debut}–${h.fin}).\nContinuer quand même ?`)) return
      }
    }

    // Superposition sur ce jour
    const existants = creneauxDuJour(jourActif)
    for (const e of existants) {
      if (form.heure_debut < e.heure_fin.slice(0,5) && form.heure_fin > e.heure_debut.slice(0,5)) {
        toast('⚠️ Ce créneau chevauche un créneau existant', 'error'); return
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
    toast('Créneau ajouté ✓'); setSaving(false); setShowForm(false)
    setForm({ heure_debut: '', heure_fin: '', max_commandes: 5, delta_minutes: 0, actif: true, capacite_temps: 30 })
    fetchAll()
  }

  // ─── Générer auto sur le jour actif ───────────────────────────────────────
  async function genererJour() {
    if (!jourOuvert(jourActif)) return toast(`${jourActif} est fermé — modifie les horaires dans Profil`, 'error')
    const h = horaireJour(jourActif)
    const debut = prompt(`Heure d'ouverture (défaut: ${h.debut}) :`) || h.debut
    const fin   = prompt(`Heure de fermeture (défaut: ${h.fin}) :`) || h.fin
    const duree = parseInt(prompt('Durée en minutes (ex: 15) :') || '15')
    const max   = parseInt(prompt('Commandes max par créneau (ex: 5) :') || '5')
    const cap   = parseFloat(prompt(`Capacité temps (min) par créneau (ex: ${duree}) :`) || String(duree))
    if (!debut || !fin || !duree) return

    // Vérif hors horaires
    if (debut < h.debut || fin > h.fin) {
      toast(`⚠️ Hors horaires d'ouverture (${h.debut}–${h.fin}) — génération annulée`, 'error'); return
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
      if (!confirm(`⚠️ ${existants.length} créneau(x) existent déjà pour ${jourActif}.\nOK = remplacer · Annuler = abandonner`)) return
      for (const c of existants) await supabase.from('creneaux').delete().eq('id', c.id)
    }

    await supabase.from('creneaux').insert(slots)
    toast(`${slots.length} créneaux générés pour ${jourActif} ✓`); fetchAll()
  }

  // ─── Copier vers d'autres jours ───────────────────────────────────────────
  async function copierVers() {
    const source = creneauxDuJour(jourActif)
    if (!source.length) return toast('Aucun créneau à copier', 'error')
    if (!joursCibles.length) return toast('Sélectionne au moins un jour cible', 'error')

    let total = 0
    for (const cible of joursCibles) {
      if (!jourOuvert(cible)) { toast(`${cible} est fermé — ignoré`, 'error'); continue }
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
    toast(`${total} créneau(x) copiés ✓`); setShowCopier(false); setJoursCibles([]); fetchAll()
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
    toast('Fermeture ajoutée ✓'); setSavingFermeture(false); setShowFermetureForm(false)
    setFermetureForm({ date_debut: '', date_fin: '', motif: '' }); fetchAll()
  }

  async function deleteFermeture(id) {
    if (!confirm('Supprimer cette fermeture ?')) return
    await supabase.from('fermetures_exceptionnelles').delete().eq('id', id)
    toast('Fermeture supprimée ✓'); fetchAll()
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
        <h3 style={{ fontWeight: 800, fontSize: 14, color: T.deep, marginBottom: 4 }}>📅 Horizon de réservation</h3>
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
        <h3 style={{ fontWeight: 800, fontSize: 14, color: T.deep, marginBottom: 4 }}>⚙️ Mode de capacité</h3>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>Comment la capacité de tes créneaux est calculée.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { val: 'commandes', label: '📦 Commandes max', desc: 'Nombre de commandes par créneau' },
            { val: 'temps', label: '⏱ Temps de préparation', desc: 'Capacité en minutes · 1 unité = 1 min' },
          ].map(m => (
            <button key={m.val} onClick={() => saveModeGlobal(m.val)} disabled={savingMode}
              style={{ flex: 1, padding: '10px 12px', borderRadius: 10, border: '2px solid ' + (modeGlobal === m.val ? T.main : T.pale), background: modeGlobal === m.val ? T.main : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
              <p style={{ fontWeight: 800, fontSize: 12, color: modeGlobal === m.val ? '#fff' : T.ink, marginBottom: 2 }}>{m.label}</p>
              <p style={{ fontSize: 10, color: modeGlobal === m.val ? 'rgba(255,255,255,0.8)' : T.muted }}>{m.desc}</p>
            </button>
          ))}
        </div>
        {modeGlobal === 'temps' && (
          <p style={{ fontSize: 11, color: T.main, marginTop: 10, fontWeight: 600 }}>💡 Capacité = durée créneau × nb de cuisiniers — Ex: 15 min × 2 = 30 min</p>
        )}
      </div>

      {/* ─── Onglets jours ─── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {JOURS_SEMAINE.map((jour, idx) => {
          const ouvert = jourOuvert(jour)
          const nbCren = creneauxDuJour(jour).length
          const actif = jourActif === jour
          return (
            <button key={jour} onClick={() => { if (!ouvert) { toast(`${jour} est fermé — modifie les horaires dans Profil`, 'error'); return }; setJourActif(jour); setShowForm(false); setShowCopier(false) }}
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
          <p style={{ fontSize: 20, marginBottom: 8 }}>🔒</p>
          <p style={{ fontWeight: 700, color: '#DC2626' }}>{jourActif} — Commerce fermé</p>
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
                  🕐 {horaireJour(jourActif).debut} – {horaireJour(jourActif).fin}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {crensJourActif.length > 0 && (
                <>
                  <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '6px 12px' }} onClick={() => { setShowCopier(v => !v); setShowForm(false) }}>📋 Copier vers...</button>
                  <button style={{ ...s.btn, ...s.btnDanger, fontSize: 12, padding: '6px 12px' }} onClick={toutSupprimer}>🗑 Vider</button>
                </>
              )}
              <button style={{ ...s.btn, ...s.btnGhost, fontSize: 12, padding: '6px 12px' }} onClick={genererJour}>⚡ Générer</button>
              <button style={{ ...s.btn, ...s.btnPrimary, fontSize: 12, padding: '6px 12px' }} onClick={() => { setShowForm(v => !v); setShowCopier(false) }}>+ Ajouter</button>
            </div>
          </div>

          {/* Alerte hors horaires */}
          {horsHoraires.length > 0 && (
            <div style={{ background: '#FEF3C7', border: '1.5px solid #F59E0B44', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>
                ⚠️ {horsHoraires.length} créneau(x) hors des horaires d'ouverture ({horaireJour(jourActif).debut}–{horaireJour(jourActif).fin})
              </p>
            </div>
          )}

          {/* Panel copier vers */}
          {showCopier && (
            <div style={{ ...s.cardActive, marginBottom: 12 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: T.ink, marginBottom: 10 }}>📋 Copier les créneaux de {jourActif} vers :</p>
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
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={copierVers} disabled={!joursCibles.length}>✓ Copier</button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setShowCopier(false); setJoursCibles([]) }}>Annuler</button>
              </div>
            </div>
          )}

          {/* Formulaire ajout créneau */}
          {showForm && (
            <div style={{ ...s.cardActive, marginBottom: 12 }}>
              <h3 style={{ ...s.h3, marginBottom: 14 }}>+ Nouveau créneau — {jourActif}</h3>
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
                  <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Durée × nb de cuisiniers — Ex: 15 min × 2 = 30 min</p>
                </div>
              )}
              <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Créneau actif" />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveCreneau} disabled={saving}>{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
              </div>
            </div>
          )}

          {/* Liste créneaux du jour */}
          {crensJourActif.length === 0 && !showForm ? (
            <div style={{ ...s.card, textAlign: 'center', padding: 32 }}>
              <p style={{ color: T.muted, marginBottom: 8 }}>Aucun créneau pour {jourActif}</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button style={{ ...s.btn, ...s.btnGhost }} onClick={genererJour}>⚡ Générer auto</button>
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
                        {horsH && <span style={{ fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '1px 6px', borderRadius: 100 }}>⚠️ Hors horaires</span>}
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
                        <button style={{ ...s.btn, ...s.btnDanger, padding: '3px 8px', fontSize: 11, marginTop: 4 }} onClick={() => deleteCreneau(c.id)}>🗑</button>
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
          <h2 style={{ ...s.h2, margin: 0 }}>🔒 Fermetures exceptionnelles</h2>
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
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveFermeture} disabled={savingFermeture}>{savingFermeture ? 'Enregistrement...' : '✓ Enregistrer'}</button>
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
                  <button style={{ ...s.btn, ...s.btnDanger, padding: '4px 10px', fontSize: 12, flexShrink: 0 }} onClick={() => deleteFermeture(f.id)}>🗑</button>
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
function TabProfil({ commercantId, toast }) {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoPreview, setLogoPreview] = useState(null)

  useEffect(() => { fetchProfil() }, [commercantId])

  async function fetchProfil() {
    setLoading(true)
    const { data } = await supabase.from('commercants').select('*').eq('id', commercantId).single()
    if (data) {
      const defaultHoraires = { lundi: { ouvert: true, debut: '07:00', fin: '14:00' }, mardi: { ouvert: true, debut: '07:00', fin: '14:00' }, mercredi: { ouvert: true, debut: '07:00', fin: '14:00' }, jeudi: { ouvert: true, debut: '07:00', fin: '14:00' }, vendredi: { ouvert: true, debut: '07:00', fin: '14:00' }, samedi: { ouvert: true, debut: '07:00', fin: '13:00' }, dimanche: { ouvert: false, debut: '07:00', fin: '12:00' } }
      setForm({ nom: data.nom || '', type: data.type || '', email: data.email || '', telephone: data.telephone || '', adresse: data.adresse || '', description: data.description || '', horaires: data.horaires || '', heure_ouverture_resa: data.heure_ouverture_resa ? data.heure_ouverture_resa.slice(0,5) : '21:00', horaires_detail: data.horaires_detail || defaultHoraires, categorie: data.categorie || 'alimentaire', livraison_actif: !!data.livraison_actif, fidelite_actif: !!data.fidelite_actif, plan: data.plan || 'on', notif_rdv_mode: data.notif_rdv_mode || 'recap_jour', rdv_actif: !!data.rdv_actif })
      setLogoPreview(data.logo_url || null)
    }
    setLoading(false)
  }

  async function uploadLogo(file) {
    if (file.size > 512 * 1024) { toast('Logo trop lourd — max 512KB', 'error'); return }
    if (!file.type.startsWith('image/')) { toast('Format invalide', 'error'); return }
    setUploadingLogo(true)
    const ext = file.name.split('.').pop()
    const fileName = `${commercantId}-${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('logos').upload(fileName, file, { upsert: true })
    if (error) { toast('Erreur upload logo', 'error'); setUploadingLogo(false); return }
    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(fileName)
    await supabase.from('commercants').update({ logo_url: urlData.publicUrl }).eq('id', commercantId)
    setLogoPreview(urlData.publicUrl)
    toast('Logo mis à jour ✓'); setUploadingLogo(false)
  }

  async function supprimerLogo() {
    if (!confirm('Supprimer le logo ?')) return
    await supabase.from('commercants').update({ logo_url: null }).eq('id', commercantId)
    setLogoPreview(null); toast('Logo supprimé')
  }

  async function saveProfil() {
    if (!form.nom.trim()) return toast('Le nom est obligatoire', 'error')
    setSaving(true)
    await supabase.from('commercants').update({ nom: form.nom.trim(), type: form.type.trim(), telephone: form.telephone.trim() || null, adresse: form.adresse.trim() || null, description: form.description.trim() || null, horaires: form.horaires.trim() || null, heure_ouverture_resa: form.heure_ouverture_resa || '21:00', horaires_detail: form.horaires_detail, livraison_actif: !!form.livraison_actif, fidelite_actif: !!form.fidelite_actif, notif_rdv_mode: form.notif_rdv_mode || 'recap_jour' }).eq('id', commercantId)
    setSaving(false); toast('Profil mis à jour ✓')
  }

  if (loading || !form) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      <h2 style={s.h2}>Profil du commerce</h2>

      {/* Badge catégorie — lecture seule. Pour changer, contacter support. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px 6px 8px', borderRadius: 100, background: T.pale, border: `1px solid ${T.main}33`, marginBottom: 14 }}>
        <span style={{ fontSize: 14 }}>{form.categorie === 'vitrine' ? '💇' : '🥐'}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color: T.bgPanel, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {form.categorie === 'vitrine' ? 'Vitrine · Présence + RDV' : 'Alimentaire · Click & Collect'}
        </span>
      </div>

      {/* Logo */}
      <div style={s.card}>
        <label style={s.label}>Logo</label>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>Format carré · 512×512px · JPG ou PNG · Max 512KB</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 88, height: 88, borderRadius: 14, background: T.pale, border: `2px dashed ${logoPreview ? T.main : T.light}`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : <span style={{ fontSize: 28 }}>🏪</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ ...s.btn, ...s.btnPrimary, cursor: uploadingLogo ? 'wait' : 'pointer' }}>
              {uploadingLogo ? 'Upload...' : '📷 Choisir un logo'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) uploadLogo(e.target.files[0]) }} disabled={uploadingLogo} />
            </label>
            {logoPreview && <button style={{ ...s.btn, ...s.btnDanger, fontSize: 12 }} onClick={supprimerLogo}>🗑 Supprimer</button>}
          </div>
        </div>
      </div>

      {/* Infos */}
      <div style={s.card}>
        <div style={{ display: 'grid', gap: 14 }}>
          {[
            { label: 'Nom *', key: 'nom', placeholder: 'Ex: Boulangerie Dupont' },
            { label: 'Type', key: 'type', placeholder: 'Ex: Boulangerie, Coffee shop...' },
            { label: 'Email', key: 'email', placeholder: '', type: 'email', disabled: true, hint: 'Non modifiable — contact support' },
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
                        <Input type="time" value={h.debut} onChange={e => setForm(p => ({ ...p, horaires_detail: { ...p.horaires_detail, [jour]: { ...h, debut: e.target.value } } }))} style={{ width: 110, fontSize: 13, padding: '4px 8px' }} />
                        <span style={{ fontSize: 13, color: T.muted, flexShrink: 0 }}>→</span>
                        <Input type="time" value={h.fin} onChange={e => setForm(p => ({ ...p, horaires_detail: { ...p.horaires_detail, [jour]: { ...h, fin: e.target.value } } }))} style={{ width: 110, fontSize: 13, padding: '4px 8px' }} />
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

        {/* ─── Notifications RDV (vitrine avec rdv_actif uniquement) ─── */}
        {/* Le commercant choisit comment etre notifie des nouveaux RDV par email :
            instantane / recap quotidien 8h / aucun. Cron Vercel gere recap_jour. */}
        {form.categorie === 'vitrine' && form.rdv_actif && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
            <p style={{ ...s.label, marginBottom: 6 }}>Notifications RDV par email</p>
            <p style={{ fontSize: 11, color: T.muted, marginBottom: 10, lineHeight: 1.5 }}>
              Comment veux-tu être prévenu(e) des nouveaux RDV en plus du dashboard ?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { val: 'chaque',     icone: '⚡', label: 'À chaque nouveau RDV',         desc: 'Email instantané à chaque réservation. Idéal si tu n\'ouvres pas le dashboard souvent.' },
                { val: 'recap_jour', icone: '📋', label: 'Récap quotidien (8h)',          desc: 'Un seul email chaque matin avec tous tes RDV de la journée. Moins intrusif.' },
                { val: 'aucun',      icone: '🔕', label: 'Aucun email',                   desc: 'Tu consultes uniquement ton dashboard. Aucun email automatique.' },
              ].map(opt => {
                const actif = form.notif_rdv_mode === opt.val
                return (
                  <label key={opt.val}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${actif ? T.main : T.pale}`, background: actif ? T.pale : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <input type="radio" name="notif_rdv_mode" checked={actif}
                      onChange={() => setForm(p => ({ ...p, notif_rdv_mode: opt.val }))}
                      style={{ width: 16, height: 16, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px' }}>{opt.icone} {opt.label}</p>
                      <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>{opt.desc}</p>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* ─── Toggles FULL (alimentaire uniquement) ─── */}
        {/* Les commercants FULL alim peuvent choisir d'activer/desactiver
            certaines features (livraison, fidelite). La pill client reflete l'etat. */}
        {form.plan === 'full' && form.categorie === 'alimentaire' && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
            <p style={{ ...s.label, marginBottom: 12 }}>Fonctionnalités activables (plan FULL)</p>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${form.livraison_actif ? T.main : T.pale}`, background: form.livraison_actif ? T.pale : '#fff', cursor: 'pointer', marginBottom: 10, transition: 'all 0.15s' }}>
              <input type="checkbox" checked={!!form.livraison_actif} onChange={e => setForm(p => ({ ...p, livraison_actif: e.target.checked }))} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px' }}>🚴 Activer la livraison</p>
                <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                  Affiche la pill « LIVRAISON » sur ta fiche. Configuration complète (zone, frais, créneaux) à venir.
                </p>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${form.fidelite_actif ? T.main : T.pale}`, background: form.fidelite_actif ? T.pale : '#fff', cursor: 'pointer', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={!!form.fidelite_actif} onChange={e => setForm(p => ({ ...p, fidelite_actif: e.target.checked }))} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer', marginTop: 2 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 800, color: T.ink, margin: '0 0 2px' }}>⭐ Activer le programme fidélité</p>
                <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, margin: 0 }}>
                  Programme tampon : la 10ème commande offerte. Module fidélité complet à venir.
                </p>
              </div>
            </label>
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.pale}` }}>
          <button style={{ ...s.btn, ...s.btnPrimary, padding: '11px 24px', fontSize: 14 }} onClick={saveProfil} disabled={saving}>
            {saving ? 'Enregistrement...' : '✓ Enregistrer'}
          </button>
        </div>
      </div>

      <div style={{ ...s.card, background: T.pale, boxShadow: 'none', border: 'none' }}>
        <p style={{ fontSize: 12, color: T.main, fontWeight: 600 }}>💡 URL client : yoppaa.app/commander</p>
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
    ctx.font = '900 80px "DM Sans", Arial, sans-serif'
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
    a.click(); toast('PNG téléchargé ✓')
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
      toast(`PDF ${format} téléchargé ✓`)
    } catch (e) { console.error(e); toast('Erreur PDF', 'error') }
  }

  if (loading) return null
  if (!slug) return (
    <div style={{ ...s.card, background: '#FEF3C7', border: '1.5px solid #F59E0B33', marginTop: 12 }}>
      <p style={{ fontSize: 13, color: '#92400E', fontWeight: 600 }}>⚠️ Aucun slug — contacte le support.</p>
    </div>
  )

  return (
    <div style={{ ...s.card, marginTop: 12 }}>
      <h2 style={{ ...s.h2, marginBottom: 4 }}>QR Code</h2>
      <p style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Vitrine, sacs, flyers — partout !</p>

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
        <p style={{ fontFamily: '"DM Sans", sans-serif', fontWeight: 900, fontSize: '1.9rem', color: '#fff', letterSpacing: '-2px', lineHeight: 1, marginBottom: 2 }}>yoppaa</p>

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
        <button style={{ ...s.btn, ...s.btnGhost, padding: '4px 10px', fontSize: 11, flexShrink: 0 }}
          onClick={() => { navigator.clipboard.writeText(url); toast('URL copiée ✓') }}>📋</button>
      </div>

      {/* PNG */}
      <button style={{ ...s.btn, ...s.btnGhost, width: '100%', justifyContent: 'center', marginBottom: 10 }} onClick={downloadPNG} disabled={!qrDataUrl}>
        ⬇️ Télécharger PNG
      </button>

      {/* PDF */}
      <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>PDF</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <button style={{ ...s.btn, ...s.btnGhost, flex: 1, justifyContent: 'center' }} onClick={() => downloadPDF('A5')} disabled={!qrDataUrl}>📄 A5</button>
        <button style={{ ...s.btn, ...s.btnGhost, flex: 1, justifyContent: 'center' }} onClick={() => downloadPDF('A4')} disabled={!qrDataUrl}>📄 A4</button>
      </div>

      {/* Impression */}
      <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Impression</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={{ ...s.btn, ...s.btnPrimary, flex: 1, justifyContent: 'center' }} onClick={() => printQR('A5')} disabled={!qrDataUrl}>🖨️ A5</button>
        <button style={{ ...s.btn, ...s.btnPrimary, flex: 1, justifyContent: 'center' }} onClick={() => printQR('A4')} disabled={!qrDataUrl}>🖨️ A4</button>
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
  ferme: '🔒', horaires: '🕐', adresse: '📍', telephone: '📞',
  articles: '🍞', site_web: '🌐', doublon: '👯', autre: '💬',
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
          <p style={{ fontSize: '2rem', marginBottom: 8 }}>✨</p>
          <p style={{ fontWeight: 800, color: T.ink, marginBottom: 4 }}>
            {filtre === 'en_attente' ? 'Aucun signalement en attente' : 'Aucun signalement dans ce filtre'}
          </p>
          <p style={{ fontSize: 13, color: T.muted }}>
            {filtre === 'en_attente' ? 'Bravo — tes infos sont à jour.' : 'Change de filtre pour voir les autres.'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {liste.map(sig => {
          const typeLabel = SIGN_TYPE_LABEL[sig.type] || sig.type
          const typeIcon  = SIGN_TYPE_ICON[sig.type] || '💬'
          const couleurStatut = sig.statut === 'en_attente' ? '#DC2626'
                              : sig.statut === 'vu'         ? '#EA580C'
                              : sig.statut === 'traite'     ? '#10B981'
                              : T.muted
          return (
            <div key={sig.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: `1px solid ${T.hairline}`, borderLeft: `4px solid ${couleurStatut}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{typeIcon}</span>
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
                    ✓ Marquer comme traité
                  </button>
                  <button onClick={() => setStatut(sig.id, 'vu')}
                    style={{ ...s.btn, ...s.btnGhost, padding: '7px 14px', fontSize: 12 }}>
                    👁 Vu, j&rsquo;y reviens
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
                  ✓ Maintenant traité
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
    toast('Réponse publiée ✓'); setSaving(null)
    setReponses(p => ({ ...p, [avisId]: '' })); fetchAvis()
  }

  const noteMoyenne = avis.length ? (avis.reduce((acc, a) => acc + a.note, 0) / avis.length).toFixed(1) : null

  function Etoiles({ note, taille = 15 }) {
    return (
      <span style={{ display: 'inline-flex', gap: 1 }}>
        {[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: taille, color: i <= note ? '#F59E0B' : '#E5E7EB' }}>★</span>)}
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
          <p style={{ fontSize: 28, marginBottom: 10 }}>⭐</p>
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
                {saving === a.id ? 'Publication...' : '↩ Répondre'}
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

  // Charge le commerçant pour connaître le plan (conditionne les onglets)
  useEffect(() => {
    if (!commercantId) return
    let annule = false
    supabase.from('commercants').select('*').eq('id', commercantId).maybeSingle()
      .then(({ data }) => { if (!annule) setCommercant(data) })
    return () => { annule = true }
  }, [commercantId])

  // Onglets dynamiques selon le plan + la catégorie
  const peutDeals = canDo(commercant?.plan, 'deals')
  const peutActus = canDo(commercant?.plan, 'actus')
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

  // Onglet 'Paiements' visible uniquement pour les commerçants FULL :
  //   • Vitrine FULL → acompte RDV en ligne
  //   • Alimentaire FULL → paiement obligatoire commande C&C (Phase 1.5)
  const peutPaiements = commercant?.plan === 'full'

  // Vitrine : on parle de "Vitrine" plutôt que "Menu", et on masque "Créneaux" (pas de C&C)
  const tabs = [
    { id: 'menu',     label: estVitrine ? 'Vitrine' : 'Menu', icon: 'menu' },
    peutDeals && { id: 'deals', label: 'Deals', icon: 'tag' },
    peutActus && { id: 'actus', label: 'Actus', icon: 'sliders' },
    !estVitrine && { id: 'creneaux', label: 'Créneaux', icon: 'clock' },
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
      {tab === 'actus'    && peutActus && <TabActus commercantId={commercantId} toast={showToast} />}
      {tab === 'creneaux' && <TabCreneaux commercantId={commercantId} toast={showToast} />}
      {tab === 'paiements' && peutPaiements && <TabPaiements commercantId={commercantId} toast={showToast} />}
      {tab === 'profil'   && <TabProfil   commercantId={commercantId} toast={showToast} />}
      {tab === 'avis'     && <TabAvis     commercantId={commercantId} toast={showToast} />}
      {tab === 'signalements' && <TabSignalements commercantId={commercantId} toast={showToast} />}

      <Toast message={toastMsg} type={toastType} />
    </div>
  )
}