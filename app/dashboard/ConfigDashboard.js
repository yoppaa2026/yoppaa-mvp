'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const T = {
  bg:      '#F8F6FF',
  bgCard:  '#FFFFFF',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

const s = {
  card: {
    background: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    border: `1.5px solid ${T.pale}`,
    boxShadow: '0 2px 8px rgba(107,53,196,0.06)',
  },
  cardActive: {
    background: '#fff',
    borderRadius: 14,
    padding: 20,
    marginBottom: 12,
    border: `2px solid ${T.main}`,
    boxShadow: `0 0 20px ${T.main}22`,
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
    border: `1.5px solid ${T.pale}`,
    fontSize: 14,
    color: T.ink,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: '"DM Sans", sans-serif',
    transition: 'border-color 0.15s',
  },
  inputFocus: { borderColor: T.main, boxShadow: `0 0 0 3px ${T.main}11` },
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
  btnPrimary: { background: T.main, color: '#fff' },
  btnGhost:   { background: T.pale, color: T.main },
  btnDanger:  { background: '#FEE2E2', color: '#DC2626' },
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
        style={{ width: 44, height: 24, borderRadius: 12, background: value ? T.main : '#E5E7EB', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s' }} />
      </div>
      {label && <span style={{ fontSize: 13, color: T.ink, fontWeight: 600 }}>{label}</span>}
    </label>
  )
}

function Toast({ message, type }) {
  if (!message) return null
  return (
    <div style={{ position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: type === 'error' ? '#DC2626' : T.main, color: '#fff', padding: '12px 24px', borderRadius: 12, fontWeight: 700, fontSize: 14, zIndex: 9999, boxShadow: `0 4px 20px ${type === 'error' ? '#DC262644' : T.main + '44'}`, whiteSpace: 'nowrap' }}>
      {message}
    </div>
  )
}

// ─── Onglet MENU ──────────────────────────────────────────────────────────────
function TabMenu({ commercantId, toast }) {
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

  useEffect(() => { fetchArticles() }, [commercantId])

  async function fetchArticles() {
    setLoading(true)
    const { data } = await supabase.from('articles').select('*').eq('commercant_id', commercantId).order('categorie').order('nom')
    setArticles(data || [])
    const cats = [...new Set((data || []).map(a => a.categorie).filter(Boolean))]
    setCategories(cats)
    setLoading(false)
  }

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
      stock_jour: parseInt(form.stock_jour) || 0,
      actif: form.actif,
      categorie: form.categorie.trim() || null,
      temps_prepa: parseFloat(form.temps_prepa) || 0,
    }
    if (editId) { await supabase.from('articles').update(payload).eq('id', editId); toast('Article mis à jour ✓') }
    else { await supabase.from('articles').insert(payload); toast('Article ajouté ✓') }
    setSaving(false); setShowForm(false); fetchArticles()
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
    // Mettre à jour tous les articles de cette catégorie
    await supabase
      .from('articles')
      .update({ categorie: newCat })
      .eq('commercant_id', commercantId)
      .eq('categorie', oldCat)
    toast('Catégorie renommée ✓')
    setRenameSaving(false)
    setRenamingCat(null)
    // Mettre à jour la catégorie active si c'était celle renommée
    if (catActive === oldCat) setCatActive(newCat)
    fetchArticles()
  }

  async function supprimerCategorie(cat) {
    if (!confirm(`Supprimer la catégorie "${cat}" ? Les articles resteront mais sans catégorie.`)) return
    await supabase.from('articles').update({ categorie: null }).eq('commercant_id', commercantId).eq('categorie', cat)
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
    await supabase.from('articles').delete().eq('id', id)
    toast('Article supprimé'); fetchArticles()
  }

  const articlesFiltres = catActive === 'Tous' ? articles : articles.filter(a => a.categorie === catActive)
  const articlesSansCat = articles.filter(a => !a.categorie)

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={s.h2}>Menu <span style={{ color: T.mid, fontWeight: 600, fontSize: 14 }}>({articles.length})</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => { setShowCatForm(v => !v); setShowForm(false) }}>+ Catégorie</button>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => { openNew(); setShowCatForm(false) }}>+ Article</button>
        </div>
      </div>

      {/* Formulaire nouvelle catégorie */}
      {showCatForm && (
        <div style={{ ...s.cardActive, padding: 16, marginBottom: 12 }}>
          <label style={s.label}>Nom de la catégorie</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <Input value={nouvelleCat} onChange={e => setNouvelleCat(e.target.value)} placeholder="Ex: Viennoiseries, Sandwichs chauds..." onKeyDown={e => e.key === 'Enter' && ajouterCategorie()} style={{ flex: 1 }}/>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={ajouterCategorie}>✓</button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowCatForm(false)}>✕</button>
          </div>
        </div>
      )}

      {/* Filtres catégories */}
      {categories.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {['Tous', ...categories, ...(articlesSansCat.length > 0 ? ['Sans catégorie'] : [])].map(cat => (
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {/* Filtre actif */}
              {renamingCat === cat ? (
                // ─── Mode renommage inline ──────────────────────────────────
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: T.pale, borderRadius: 10, padding: '3px 6px', border: `1.5px solid ${T.main}` }}>
                  <input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveRename(cat); if (e.key === 'Escape') setRenamingCat(null) }}
                    autoFocus
                    style={{ ...s.input, width: 120, fontSize: 12, padding: '3px 8px', border: 'none', background: 'transparent', boxShadow: 'none' }}
                  />
                  <button
                    onClick={() => saveRename(cat)}
                    disabled={renameSaving}
                    style={{ ...s.btn, ...s.btnPrimary, padding: '3px 8px', fontSize: 11 }}>
                    {renameSaving ? '...' : '✓'}
                  </button>
                  <button
                    onClick={() => setRenamingCat(null)}
                    style={{ ...s.btn, ...s.btnGhost, padding: '3px 8px', fontSize: 11 }}>
                    ✕
                  </button>
                </div>
              ) : (
                <>
                  <button onClick={() => setCatActive(cat)}
                    style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: catActive === cat ? T.main : T.pale, color: catActive === cat ? '#fff' : T.main }}>
                    {cat}
                  </button>
                  {/* Boutons renommer + supprimer — uniquement sur les vraies catégories */}
                  {cat !== 'Tous' && cat !== 'Sans catégorie' && (
                    <>
                      <button
                        onClick={() => startRename(cat)}
                        title="Renommer"
                        style={{ ...s.btn, ...s.btnGhost, padding: '5px 7px', fontSize: 11 }}>
                        ✏️
                      </button>
                      <button
                        onClick={() => supprimerCategorie(cat)}
                        title="Supprimer"
                        style={{ ...s.btn, ...s.btnDanger, padding: '5px 7px', fontSize: 11 }}>
                        🗑
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Formulaire article */}
      {showForm && (
        <div style={s.cardActive}>
          <h3 style={{ ...s.h3, marginBottom: 14 }}>{editId ? '✏️ Modifier' : '+ Nouvel article'}</h3>
          <div style={{ display: 'grid', gap: 12 }}>
            <div><label style={s.label}>Nom *</label><Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex: Croissant beurre"/></div>
            <div>
              <label style={s.label}>Catégorie</label>
              <select value={form.categorie} onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
                style={{ ...s.input, cursor: 'pointer' }}>
                <option value="">— Sans catégorie —</option>
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div><label style={s.label}>Description</label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ex: Feuilleté, pur beurre AOP..."/></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label style={s.label}>Prix (€) *</label><Input type="number" step="0.10" min="0" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="1.20"/></div>
              <div><label style={s.label}>Stock du jour</label><Input type="number" min="0" value={form.stock_jour} onChange={e => setForm(p => ({ ...p, stock_jour: e.target.value }))} placeholder="30"/></div>
            </div>
            <div>
              <label style={s.label}>⏱ Temps de préparation (min)</label>
              <Input type="number" min="0" step="0.5" value={form.temps_prepa} onChange={e => setForm(p => ({ ...p, temps_prepa: e.target.value }))} placeholder="0 = non défini · 0.5 = 30 sec · 1 = 1 min · 5 = 5 min"/>
              <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Utilisé si le créneau est configuré en mode Temps de préparation</p>
            </div>
            <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Article disponible"/>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveArticle} disabled={saving}>{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {/* Liste articles */}
      {articles.length === 0 && !showForm ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: T.muted, marginBottom: 16 }}>Aucun article dans le menu</p>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNew}>Ajouter le premier article</button>
        </div>
      ) : (
        <>
          {catActive === 'Tous' && categories.length > 0 ? (
            <>
              {categories.map(cat => {
                const artsDecat = articles.filter(a => a.categorie === cat)
                if (!artsDecat.length) return null
                return (
                  <div key={cat} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', background: T.pale, padding: '3px 10px', borderRadius: 100 }}>{cat}</span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    </div>
                    {artsDecat.map(a => <ArticleCard key={a.id} a={a} onEdit={openEdit} onToggle={toggleActif} onUpdateStock={updateStock} onDelete={deleteArticle} s={s}/>)}
                  </div>
                )
              })}
              {articlesSansCat.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', background: '#F9FAFB', padding: '3px 10px', borderRadius: 100 }}>Sans catégorie</span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  </div>
                  {articlesSansCat.map(a => <ArticleCard key={a.id} a={a} onEdit={openEdit} onToggle={toggleActif} onUpdateStock={updateStock} onDelete={deleteArticle} s={s}/>)}
                </div>
              )}
            </>
          ) : (
            (catActive === 'Sans catégorie' ? articlesSansCat : articlesFiltres).map(a =>
              <ArticleCard key={a.id} a={a} onEdit={openEdit} onToggle={toggleActif} onUpdateStock={updateStock} onDelete={deleteArticle} s={s}/>
            )
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
  const [formGroupe, setFormGroupe] = useState({ nom: '', type: 'multiple', obligatoire: false })
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
    await supabase.from('article_options_groupes').insert({ article_id: articleId, nom: formGroupe.nom.trim(), type: formGroupe.type, obligatoire: formGroupe.obligatoire })
    toast('Groupe ajouté ✓'); setSaving(false)
    setFormGroupe({ nom: '', type: 'multiple', obligatoire: false }); setShowForm(false); fetchGroupes()
  }

  async function deleteGroupe(id) {
    if (!confirm('Supprimer ce groupe et toutes ses options ?')) return
    await supabase.from('article_options_groupes').delete().eq('id', id)
    toast('Groupe supprimé'); fetchGroupes()
  }

  async function addValeur(groupeId) {
    const f = valeursForms[groupeId] || { nom: '', prix_supplement: 0 }
    if (!f.nom.trim()) return toast('Nom obligatoire', 'error')
    await supabase.from('article_options_valeurs').insert({ groupe_id: groupeId, nom: f.nom.trim(), prix_supplement: parseFloat(f.prix_supplement) || 0 })
    setValeursForms(p => ({ ...p, [groupeId]: { nom: '', prix_supplement: 0 } }))
    toast('Option ajoutée ✓'); fetchGroupes()
  }

  async function deleteValeur(id) {
    await supabase.from('article_options_valeurs').delete().eq('id', id)
    fetchGroupes()
  }

  if (loading) return <p style={{ fontSize: 12, color: T.muted, padding: '8px 0' }}>Chargement des options...</p>

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.pale}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.deep, textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚙️ Options</span>
        <button style={{ ...s.btn, ...s.btnGhost, padding: '4px 10px', fontSize: 11 }} onClick={() => setShowForm(v => !v)}>+ Groupe</button>
      </div>

      {showForm && (
        <div style={{ background: T.pale, borderRadius: 10, padding: 12, marginBottom: 10, border: `1.5px solid ${T.main}33` }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <div>
              <label style={{ ...s.label, fontSize: 10 }}>Nom du groupe *</label>
              <input value={formGroupe.nom} onChange={e => setFormGroupe(p => ({ ...p, nom: e.target.value }))}
                placeholder="Ex: Choix de sauce, Crudités..."
                style={{ ...s.input, fontSize: 13, padding: '7px 10px' }}/>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <label style={{ ...s.label, fontSize: 10 }}>Type</label>
                <select value={formGroupe.type} onChange={e => setFormGroupe(p => ({ ...p, type: e.target.value }))}
                  style={{ ...s.input, fontSize: 12, padding: '6px 8px', width: 'auto', cursor: 'pointer' }}>
                  <option value="unique">Choix unique (1 seul)</option>
                  <option value="multiple">Choix multiple (plusieurs)</option>
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
                <input type="checkbox" id={`oblig-${articleId}`} checked={formGroupe.obligatoire}
                  onChange={e => setFormGroupe(p => ({ ...p, obligatoire: e.target.checked }))} style={{ cursor: 'pointer' }}/>
                <label htmlFor={`oblig-${articleId}`} style={{ fontSize: 12, color: T.ink, cursor: 'pointer' }}>Obligatoire</label>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button style={{ ...s.btn, ...s.btnPrimary, padding: '6px 12px', fontSize: 12 }} onClick={saveGroupe} disabled={saving}>✓ Créer</button>
            <button style={{ ...s.btn, ...s.btnGhost, padding: '6px 12px', fontSize: 12 }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {groupes.length === 0 && !showForm && (
        <p style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Aucune option — clique sur "+ Groupe" pour en ajouter.</p>
      )}

      {groupes.map(g => (
        <div key={g.id} style={{ background: '#FAFAFA', borderRadius: 10, padding: 10, marginBottom: 8, border: `1px solid ${T.pale}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: T.ink }}>{g.nom}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: g.type === 'unique' ? '#FEF3C7' : '#EDE0FF', color: g.type === 'unique' ? '#92400E' : T.main }}>
                {g.type === 'unique' ? '1 choix' : 'Multi'}
              </span>
              {g.obligatoire && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 100, background: '#FEE2E2', color: '#DC2626' }}>Obligatoire</span>}
            </div>
            <button style={{ ...s.btn, ...s.btnDanger, padding: '3px 8px', fontSize: 11 }} onClick={() => deleteGroupe(g.id)}>🗑</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {(g.valeurs || []).map(v => (
              <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 100, padding: '3px 8px 3px 10px', fontSize: 12 }}>
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
function ArticleCard({ a, onEdit, onToggle, onUpdateStock, onDelete, s }) {
  const [showOptions, setShowOptions] = useState(false)
  return (
    <div style={{ ...s.card, opacity: a.actif ? 1 : 0.6, borderLeft: `4px solid ${a.actif ? T.main : '#E5E7EB'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: T.ink, fontSize: 15 }}>{a.nom}</span>
            <span style={{ ...s.tag, background: a.actif ? T.pale : '#F3F4F6', color: a.actif ? T.main : T.muted }}>{a.actif ? 'Actif' : 'Inactif'}</span>
          </div>
          {a.description && <p style={{ fontSize: 12, color: T.muted, margin: '0 0 8px' }}>{a.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 800, fontSize: 17, color: T.main }}>{Number(a.prix).toFixed(2)} €</span>
            {(a.temps_prepa || 0) > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: T.mid, background: T.pale, padding: '2px 8px', borderRadius: 100 }}>⏱ {a.temps_prepa} min</span>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Stock :</span>
              <button style={{ ...s.btn, ...s.btnGhost, padding: '3px 8px', fontSize: 14 }} onClick={() => onUpdateStock(a.id, (a.stock_jour || 0) - 1)}>−</button>
              <input type="number" value={a.stock_jour ?? 0} min={0} onChange={e => onUpdateStock(a.id, e.target.value)}
                style={{ ...s.input, width: 56, textAlign: 'center', padding: '4px 8px', fontSize: 14, fontWeight: 700 }}/>
              <button style={{ ...s.btn, ...s.btnGhost, padding: '3px 8px', fontSize: 14 }} onClick={() => onUpdateStock(a.id, (a.stock_jour || 0) + 1)}>+</button>
              {a.stock_jour === 0 && <span style={{ ...s.tag, background: '#FEE2E2', color: '#DC2626' }}>Épuisé</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
          <Toggle value={a.actif} onChange={() => onToggle(a)}/>
          <button style={{ ...s.btn, ...s.btnGhost, padding: '5px 12px', fontSize: 12 }} onClick={() => onEdit(a)}>✏️</button>
          <button style={{ ...s.btn, ...s.btnGhost, padding: '5px 12px', fontSize: 12, background: showOptions ? T.pale : undefined }} onClick={() => setShowOptions(v => !v)}>⚙️</button>
          <button style={{ ...s.btn, ...s.btnDanger, padding: '5px 12px', fontSize: 12 }} onClick={() => onDelete(a.id)}>🗑</button>
        </div>
      </div>
      {showOptions && <OptionsArticle articleId={a.id} toast={(msg, type) => { const ev = new CustomEvent('yoppaa-toast', {detail:{msg,type}}); window.dispatchEvent(ev) }}/>}
    </div>
  )
}

// ─── Onglet CRÉNEAUX ──────────────────────────────────────────────────────────
function TabCreneaux({ commercantId, toast }) {
  const [creneaux, setCreneaux] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ heure_debut: '', heure_fin: '', max_commandes: 5, delta_minutes: 0, actif: true, mode_capacite: 'commandes', capacite_temps: 30 })
  const [saving, setSaving] = useState(false)

  const [horizon, setHorizon] = useState(1)
  const [savingHorizon, setSavingHorizon] = useState(false)

  useEffect(() => { fetchCreneaux() }, [commercantId])

  async function fetchCreneaux() {
    setLoading(true)
    const [{ data: cren }, { data: comm }] = await Promise.all([
      supabase.from('creneaux').select('*').eq('commercant_id', commercantId).order('heure_debut'),
      supabase.from('commercants').select('horizon_commande').eq('id', commercantId).single()
    ])
    setCreneaux(cren || [])
    setHorizon(comm?.horizon_commande || 1)
    setLoading(false)
  }

  async function saveHorizon(val) {
    setSavingHorizon(true)
    await supabase.from('commercants').update({ horizon_commande: val }).eq('id', commercantId)
    setHorizon(val)
    setSavingHorizon(false)
    toast('Horizon mis à jour ✓')
  }

  async function saveCreneau() {
    if (!form.heure_debut || !form.heure_fin) return toast('Heures obligatoires', 'error')
    if (form.heure_fin <= form.heure_debut) return toast('Heure de fin invalide', 'error')

    // ─── Détection superposition — bloquant ─────────────────────
    const nouveauSlot = [{ heure_debut: form.heure_debut, heure_fin: form.heure_fin }]
    const superpositions = detecterSuperpositions(creneaux, nouveauSlot)
    if (superpositions.length > 0) {
      toast(`⚠️ Ce créneau chevauche un créneau existant — modifie les heures ou supprime le créneau conflictuel.`, 'error')
      return
    }

    setSaving(true)
    await supabase.from('creneaux').insert({ commercant_id: commercantId, heure_debut: form.heure_debut, heure_fin: form.heure_fin, max_commandes: parseInt(form.max_commandes) || 5, delta_minutes: parseInt(form.delta_minutes) || 0, actif: form.actif, mode_capacite: form.mode_capacite || 'commandes', capacite_temps: parseFloat(form.capacite_temps) || 30 })
    toast('Créneau ajouté ✓'); setSaving(false); setShowForm(false)
    setForm({ heure_debut: '', heure_fin: '', max_commandes: 5, delta_minutes: 0, actif: true }); fetchCreneaux()
  }

  async function toggleCreneau(c) { await supabase.from('creneaux').update({ actif: !c.actif }).eq('id', c.id); fetchCreneaux() }

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

  
  async function updateModeCapacite(id, val) {
    await supabase.from('creneaux').update({ mode_capacite: val }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, mode_capacite: val } : c))
  }

  async function updateCapaciteTemps(id, val) {
    const n = parseFloat(val)
    if (isNaN(n) || n < 1) return
    await supabase.from('creneaux').update({ capacite_temps: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, capacite_temps: n } : c))
  }

  async function deleteCreneau(id) {
    if (!confirm('Supprimer ce créneau ?')) return
    // Vérifier commandes actives liées à ce créneau
    const { data: cmdLiees } = await supabase
      .from('commandes')
      .select('id')
      .eq('creneau_id', id)
      .neq('statut', 'recupere')
    if (cmdLiees?.length > 0) {
      toast(`Impossible — ${cmdLiees.length} commande(s) active(s) sur ce créneau`, 'error')
      return
    }
    await supabase.from('creneaux').delete().eq('id', id)
    toast('Créneau supprimé ✓'); fetchCreneaux()
  }

  async function toutSupprimer() {
    if (!creneaux.length) return
    if (!confirm(`Supprimer les ${creneaux.length} créneaux ? Cette action est irréversible.`)) return

    const ids = creneaux.map(c => c.id)

    // ─── Vérifier quels créneaux ont des commandes liées ─────────
    const { data: commandesLiees } = await supabase
      .from('commandes')
      .select('creneau_id')
      .in('creneau_id', ids)
      .neq('statut', 'recupere')

    const idsAvecCommandes = [...new Set((commandesLiees || []).map(c => c.creneau_id))]
    const idsSansCommandes = ids.filter(id => !idsAvecCommandes.includes(id))

    if (idsAvecCommandes.length > 0 && idsSansCommandes.length === 0) {
      toast(`Impossible — tous les créneaux ont des commandes actives`, 'error')
      return
    }

    if (idsAvecCommandes.length > 0) {
      const ok = confirm(`⚠️ ${idsAvecCommandes.length} créneau(x) ont des commandes actives et ne peuvent pas être supprimés.

OK = Supprimer uniquement les ${idsSansCommandes.length} créneaux sans commandes
Annuler = Annuler`)
      if (!ok) return
    }

    if (idsSansCommandes.length > 0) {
      await supabase.from('creneaux').delete().in('id', idsSansCommandes)
    }
    toast(`${idsSansCommandes.length} créneau(x) supprimé(s) ✓`)
    fetchCreneaux()
  }

  function detecterSuperpositions(existants, nouveaux) {
    const superpositions = []
    for (const n of nouveaux) {
      for (const e of existants) {
        const eDebut = e.heure_debut.slice(0,5)
        const eFin = e.heure_fin.slice(0,5)
        if (n.heure_debut < eFin && n.heure_fin > eDebut) {
          superpositions.push(`${n.heure_debut}–${n.heure_fin}`)
          break
        }
      }
    }
    return superpositions
  }

  async function genererCreneaux() {
    const debut = prompt('Heure d\'ouverture (ex: 07:00) :')
    const fin = prompt('Heure de fermeture (ex: 14:00) :')
    const duree = parseInt(prompt('Durée en minutes (ex: 15) :') || '15')
    const max = parseInt(prompt('Commandes max par créneau (ex: 5) :') || '5')
    if (!debut || !fin || !duree) return
    const slots = []
    let current = debut
    while (current < fin) {
      const [h, m] = current.split(':').map(Number)
      const totalMin = h * 60 + m + duree
      const next = `${String(Math.floor(totalMin/60)).padStart(2,'0')}:${String(totalMin%60).padStart(2,'0')}`
      if (next > fin) break
      slots.push({ commercant_id: commercantId, heure_debut: current, heure_fin: next, max_commandes: max, actif: true, mode_capacite: 'commandes', capacite_temps: 30 })
      current = next
    }
    if (!slots.length) return toast('Aucun créneau généré', 'error')

    const superpositions = detecterSuperpositions(creneaux, slots)
    if (superpositions.length > 0) {
      const ok = confirm(`⚠️ ${superpositions.length} créneau(x) se superposent avec des créneaux existants :\n${superpositions.join(', ')}\n\nOK = Supprimer tous les créneaux existants et remplacer\nAnnuler = Annuler la génération`)
      if (!ok) return
      // Remplacer — supprimer par IDs d'abord
      const ids = creneaux.map(c => c.id)
      if (ids.length > 0) await supabase.from('creneaux').delete().in('id', ids)
      await supabase.from('creneaux').insert(slots)
      toast(`${slots.length} créneaux générés (anciens remplacés) ✓`)
    } else {
      await supabase.from('creneaux').insert(slots)
      toast(`${slots.length} créneaux générés ✓`)
    }
    fetchCreneaux()
  }

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  const HORIZONS = [
    { val: 1, label: '1 jour',  desc: "Aujourd'hui seulement" },
    { val: 2, label: '2 jours', desc: "Aujourd'hui + demain" },
    { val: 3, label: '3 jours', desc: "Les 3 prochains jours" },
    { val: 7, label: '7 jours', desc: "Une semaine à l'avance" },
  ]

  return (
    <div>
      {/* ─── Horizon de réservation ─── */}
      <div style={{ ...s.card, marginBottom: 20, background: T.pale, border: `1.5px solid ${T.main}22`, boxShadow: 'none' }}>
        <h3 style={{ fontWeight: 800, fontSize: 14, color: T.deep, marginBottom: 4 }}>📅 Horizon de réservation</h3>
        <p style={{ fontSize: 12, color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
          Jusqu'à combien de jours à l'avance tes clients peuvent-ils réserver ?
        </p>
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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={s.h2}>Créneaux <span style={{ color: T.mid, fontWeight: 600, fontSize: 14 }}>({creneaux.length})</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btn, ...s.btnDanger }} onClick={toutSupprimer} disabled={creneaux.length === 0}>🗑 Tout supprimer</button>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={genererCreneaux}>⚡ Générer auto</button>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowForm(true)}>+ Ajouter</button>
        </div>
      </div>

      {showForm && (
        <div style={s.cardActive}>
          <h3 style={{ ...s.h3, marginBottom: 14 }}>Nouveau créneau</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><label style={s.label}>Début *</label><Input type="time" value={form.heure_debut} onChange={e => setForm(p => ({ ...p, heure_debut: e.target.value }))} /></div>
            <div><label style={s.label}>Fin *</label><Input type="time" value={form.heure_fin} onChange={e => setForm(p => ({ ...p, heure_fin: e.target.value }))} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={s.label}>Commandes max</label>
              <Input type="number" min="1" max="50" value={form.max_commandes} onChange={e => setForm(p => ({ ...p, max_commandes: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={s.label}>Délai min (minutes)</label>
              <Input type="number" min="0" max="120" value={form.delta_minutes} onChange={e => setForm(p => ({ ...p, delta_minutes: e.target.value }))} style={{ width: '100%' }} />
              <p style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>Délai entre commande et retrait</p>
            </div>
          </div>

          {/* ─── Mode capacité ─── */}
          <div style={{ background: T.pale, borderRadius: 12, padding: 14, marginBottom: 12, border: '1px solid ' + T.main + '22' }}>
            <label style={{ ...s.label, marginBottom: 10 }}>Mode de capacité</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              {[
                { val: 'commandes', label: '📦 Commandes max', desc: 'Nombre de commandes' },
                { val: 'temps', label: '⏱ Temps de préparation', desc: 'Capacité en minutes' },
              ].map(m => (
                <button key={m.val} onClick={() => setForm(p => ({ ...p, mode_capacite: m.val }))}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 10, border: '2px solid ' + (form.mode_capacite === m.val ? T.main : T.pale), background: form.mode_capacite === m.val ? T.main : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif' }}>
                  <p style={{ fontWeight: 800, fontSize: 12, color: form.mode_capacite === m.val ? '#fff' : T.ink, marginBottom: 2 }}>{m.label}</p>
                  <p style={{ fontSize: 10, color: form.mode_capacite === m.val ? 'rgba(255,255,255,0.8)' : T.muted }}>{m.desc}</p>
                </button>
              ))}
            </div>
            {form.mode_capacite === 'temps' && (
              <div style={{ marginTop: 10 }}>
                <label style={s.label}>Capacité de préparation (min)</label>
                <Input type="number" min="1" step="0.5" value={form.capacite_temps} onChange={e => setForm(p => ({ ...p, capacite_temps: e.target.value }))} style={{ width: '100%' }} />
                <p style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>Durée créneau × nb de cuisiniers — Ex: créneau 15 min, 2 cuisiniers = 30 min</p>
              </div>
            )}
          </div>

          <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Créneau actif" />
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveCreneau} disabled={saving}>{saving ? 'Enregistrement...' : '✓ Enregistrer'}</button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}

      {creneaux.length === 0 && !showForm ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: T.muted, marginBottom: 8 }}>Aucun créneau configuré</p>
          <p style={{ color: T.light, fontSize: 13, marginBottom: 16 }}>Utilise "Générer auto" pour tout créer en un clic.</p>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={genererCreneaux}>⚡ Générer automatiquement</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {creneaux.map(c => (
            <div key={c.id} style={{ ...s.card, marginBottom: 0, opacity: c.actif ? 1 : 0.55, borderLeft: `4px solid ${c.actif ? T.main : '#E5E7EB'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.ink, letterSpacing: '-1px' }}>{c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: T.muted }}>Max :</span>
                    <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 7px', fontSize: 13 }} onClick={() => updateMax(c.id, c.max_commandes - 1)}>−</button>
                    <input type="number" value={c.max_commandes} min={1} onChange={e => updateMax(c.id, e.target.value)}
                      style={{ ...s.input, width: 48, textAlign: 'center', padding: '3px 6px', fontSize: 13, fontWeight: 700 }} />
                    <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 7px', fontSize: 13 }} onClick={() => updateMax(c.id, c.max_commandes + 1)}>+</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 12, color: T.muted }}>Délai :</span>
                    <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 7px', fontSize: 13 }} onClick={() => updateDelta(c.id, Math.max(0, (c.delta_minutes || 0) - 5))}>−</button>
                    <input type="number" value={c.delta_minutes || 0} min={0} onChange={e => updateDelta(c.id, e.target.value)}
                      style={{ ...s.input, width: 48, textAlign: 'center', padding: '3px 6px', fontSize: 13, fontWeight: 700 }} />
                    <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 7px', fontSize: 13 }} onClick={() => updateDelta(c.id, (c.delta_minutes || 0) + 5)}>+</button>
                    <span style={{ fontSize: 11, color: T.muted }}>min</span>
                    {(c.delta_minutes || 0) > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: T.main, background: T.pale, padding: '2px 6px', borderRadius: 100 }}>⏱ {c.delta_minutes} min</span>}
                  </div>

                  {/* ─── Mode capacité sur la card ─── */}
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid ' + T.pale }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                      {[{ val: 'commandes', label: '📦' }, { val: 'temps', label: '⏱' }].map(m => (
                        <button key={m.val} onClick={() => updateModeCapacite(c.id, m.val)}
                          style={{ ...s.btn, padding: '2px 8px', fontSize: 11, background: (c.mode_capacite || 'commandes') === m.val ? T.main : T.pale, color: (c.mode_capacite || 'commandes') === m.val ? '#fff' : T.main }}>
                          {m.label} {(c.mode_capacite || 'commandes') === m.val ? ((c.mode_capacite || 'commandes') === 'commandes' ? 'Commandes' : 'Temps') : ''}
                        </button>
                      ))}
                    </div>
                    {(c.mode_capacite || 'commandes') === 'temps' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>Capacité :</span>
                        <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 7px', fontSize: 13 }} onClick={() => updateCapaciteTemps(c.id, Math.max(1, (c.capacite_temps || 30) - 5))}>−</button>
                        <input type="number" value={c.capacite_temps || 30} min={1} step={0.5} onChange={e => updateCapaciteTemps(c.id, e.target.value)}
                          style={{ ...s.input, width: 52, textAlign: 'center', padding: '3px 6px', fontSize: 13, fontWeight: 700 }} />
                        <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 7px', fontSize: 13 }} onClick={() => updateCapaciteTemps(c.id, (c.capacite_temps || 30) + 5)}>+</button>
                        <span style={{ fontSize: 11, color: T.muted }}>min</span>
                      </div>
                    )}
                  </div>
                </div>
                <Toggle value={c.actif} onChange={() => toggleCreneau(c)} />
              </div>
              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                <button style={{ ...s.btn, ...s.btnDanger, padding: '4px 10px', fontSize: 12 }} onClick={() => deleteCreneau(c.id)}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      )}
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
      setForm({ nom: data.nom || '', type: data.type || '', email: data.email || '', telephone: data.telephone || '', adresse: data.adresse || '', description: data.description || '', horaires: data.horaires || '', heure_ouverture_resa: data.heure_ouverture_resa ? data.heure_ouverture_resa.slice(0,5) : '21:00', horaires_detail: data.horaires_detail || defaultHoraires })
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
    await supabase.from('commercants').update({ nom: form.nom.trim(), type: form.type.trim(), telephone: form.telephone.trim() || null, adresse: form.adresse.trim() || null, description: form.description.trim() || null, horaires: form.horaires.trim() || null, heure_ouverture_resa: form.heure_ouverture_resa || '21:00', horaires_detail: form.horaires_detail }).eq('id', commercantId)
    setSaving(false); toast('Profil mis à jour ✓')
  }

  if (loading || !form) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      <h2 style={s.h2}>Profil du commerce</h2>

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

  function showToast(msg, type = 'success') {
    setToastMsg(msg); setToastType(type)
    setTimeout(() => setToastMsg(''), 3000)
  }

  useEffect(() => {
    function handleToast(e) { showToast(e.detail.msg, e.detail.type) }
    window.addEventListener('yoppaa-toast', handleToast)
    return () => window.removeEventListener('yoppaa-toast', handleToast)
  }, [])

  const tabs = [
    { id: 'menu',     label: '🍞 Menu' },
    { id: 'creneaux', label: '🕐 Créneaux' },
    { id: 'profil',   label: '🏪 Profil' },
    { id: 'avis',     label: '⭐ Avis' },
  ]

  return (
    <div style={{ fontFamily: '"DM Sans", sans-serif', paddingBottom: 24 }}>
      <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 14, marginBottom: 20, boxShadow: '0 2px 8px rgba(107,53,196,0.08)', border: `1px solid ${T.pale}`, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, minWidth: 80, padding: '9px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13, transition: 'all 0.2s', background: tab === t.id ? T.main : 'transparent', color: tab === t.id ? '#fff' : T.muted }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'menu'     && <TabMenu     commercantId={commercantId} toast={showToast} />}
      {tab === 'creneaux' && <TabCreneaux commercantId={commercantId} toast={showToast} />}
      {tab === 'profil'   && <TabProfil   commercantId={commercantId} toast={showToast} />}
      {tab === 'avis'     && <TabAvis     commercantId={commercantId} toast={showToast} />}

      <Toast message={toastMsg} type={toastType} />
    </div>
  )
}