'use client'
import { useState, useEffect } from 'react'
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
  const [categories, setCategories] = useState([]) // liste des catégories uniques
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showCatForm, setShowCatForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: '' })
  const [nouvelleCat, setNouvelleCat] = useState('')
  const [saving, setSaving] = useState(false)
  const [catActive, setCatActive] = useState('Tous')

  useEffect(() => { fetchArticles() }, [commercantId])

  async function fetchArticles() {
    setLoading(true)
    const { data } = await supabase.from('articles').select('*').eq('commercant_id', commercantId).order('categorie').order('nom')
    setArticles(data || [])
    // Extraire les catégories uniques
    const cats = [...new Set((data || []).map(a => a.categorie).filter(Boolean))]
    setCategories(cats)
    setLoading(false)
  }

  function openNew() { setForm({ nom: '', description: '', prix: '', stock_jour: '', actif: true, categorie: catActive !== 'Tous' ? catActive : '' }); setEditId(null); setShowForm(true) }
  function openEdit(a) { setForm({ nom: a.nom, description: a.description || '', prix: String(a.prix), stock_jour: String(a.stock_jour ?? ''), actif: a.actif, categorie: a.categorie || '' }); setEditId(a.id); setShowForm(true) }

  async function saveArticle() {
    if (!form.nom.trim() || !form.prix) return toast('Nom et prix obligatoires', 'error')
    setSaving(true)
    const payload = { commercant_id: commercantId, nom: form.nom.trim(), description: form.description.trim() || null, prix: parseFloat(form.prix), stock_jour: parseInt(form.stock_jour) || 0, actif: form.actif, categorie: form.categorie.trim() || null }
    if (editId) { await supabase.from('articles').update(payload).eq('id', editId); toast('Article mis à jour ✓') }
    else { await supabase.from('articles').insert(payload); toast('Article ajouté ✓') }
    setSaving(false); setShowForm(false); fetchArticles()
  }

  async function ajouterCategorie() {
    if (!nouvelleCat.trim()) return
    // Vérifier si elle existe déjà
    if (categories.includes(nouvelleCat.trim())) { toast('Catégorie déjà existante', 'error'); return }
    setCategories(prev => [...prev, nouvelleCat.trim()])
    setCatActive(nouvelleCat.trim())
    setNouvelleCat('')
    setShowCatForm(false)
    toast('Catégorie créée ✓')
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

  // Articles filtrés par catégorie active
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
            <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setCatActive(cat)}
                style={{ ...s.btn, padding: '5px 12px', fontSize: 12, background: catActive === cat ? T.main : T.pale, color: catActive === cat ? '#fff' : T.main }}>
                {cat}
              </button>
              {cat !== 'Tous' && cat !== 'Sans catégorie' && (
                <button onClick={() => supprimerCategorie(cat)}
                  style={{ ...s.btn, ...s.btnDanger, padding: '5px 8px', fontSize: 11 }}>🗑</button>
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
          {/* Affichage par catégorie si "Tous" */}
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
            // Vue filtrée par catégorie
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
  const [valeursForms, setValeursForms] = useState({}) // groupeId -> { nom, prix_supplement }
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

      {/* Formulaire nouveau groupe */}
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

      {/* Liste des groupes */}
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

          {/* Valeurs existantes */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {(g.valeurs || []).map(v => (
              <span key={v.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 100, padding: '3px 8px 3px 10px', fontSize: 12 }}>
                <span style={{ color: T.ink, fontWeight: 600 }}>{v.nom}</span>
                {v.prix_supplement > 0 && <span style={{ color: T.main, fontSize: 11, fontWeight: 700 }}>+{Number(v.prix_supplement).toFixed(2)}€</span>}
                <button onClick={() => deleteValeur(v.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 12, padding: '0 2px', lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>

          {/* Ajouter une valeur */}
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
  const [form, setForm] = useState({ heure_debut: '', heure_fin: '', max_commandes: 5, actif: true })
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchCreneaux() }, [commercantId])

  async function fetchCreneaux() {
    setLoading(true)
    const { data } = await supabase.from('creneaux').select('*').eq('commercant_id', commercantId).order('heure_debut')
    setCreneaux(data || [])
    setLoading(false)
  }

  async function saveCreneau() {
    if (!form.heure_debut || !form.heure_fin) return toast('Heures obligatoires', 'error')
    if (form.heure_fin <= form.heure_debut) return toast('Heure de fin invalide', 'error')
    setSaving(true)
    await supabase.from('creneaux').insert({ commercant_id: commercantId, heure_debut: form.heure_debut, heure_fin: form.heure_fin, max_commandes: parseInt(form.max_commandes) || 5, actif: form.actif })
    toast('Créneau ajouté ✓'); setSaving(false); setShowForm(false)
    setForm({ heure_debut: '', heure_fin: '', max_commandes: 5, actif: true }); fetchCreneaux()
  }

  async function toggleCreneau(c) { await supabase.from('creneaux').update({ actif: !c.actif }).eq('id', c.id); fetchCreneaux() }

  async function updateMax(id, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 1) return
    await supabase.from('creneaux').update({ max_commandes: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, max_commandes: n } : c))
  }

  async function deleteCreneau(id) {
    if (!confirm('Supprimer ce créneau ?')) return
    await supabase.from('creneaux').delete().eq('id', id)
    toast('Créneau supprimé'); fetchCreneaux()
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
      slots.push({ commercant_id: commercantId, heure_debut: current, heure_fin: next, max_commandes: max, actif: true })
      current = next
    }
    if (!slots.length) return toast('Aucun créneau généré', 'error')
    await supabase.from('creneaux').insert(slots)
    toast(`${slots.length} créneaux générés ✓`); fetchCreneaux()
  }

  if (loading) return <p style={{ color: T.muted, textAlign: 'center', padding: 40 }}>Chargement...</p>

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={s.h2}>Créneaux <span style={{ color: T.mid, fontWeight: 600, fontSize: 14 }}>({creneaux.length})</span></h2>
        <div style={{ display: 'flex', gap: 8 }}>
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
          <div style={{ marginBottom: 12 }}>
            <label style={s.label}>Commandes max</label>
            <Input type="number" min="1" max="50" value={form.max_commandes} onChange={e => setForm(p => ({ ...p, max_commandes: e.target.value }))} style={{ width: 100 }} />
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
                    {/* Toggle ouvert/fermé */}
                    <button onClick={() => setForm(p => ({ ...p, horaires_detail: { ...p.horaires_detail, [jour]: { ...h, ouvert: !h.ouvert } } }))}
                      style={{ width: 36, height: 20, borderRadius: 100, background: h.ouvert ? T.main : '#D1D5DB', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                      <div style={{ position: 'absolute', top: 2, left: h.ouvert ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}/>
                    </button>
                    {/* Nom du jour */}
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

      {/* Onglets */}
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