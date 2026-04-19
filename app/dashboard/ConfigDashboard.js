'use client'
 
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
 
// ─── Palette Yoppaa ───────────────────────────────────────────────────────────
const C = {
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  main:  '#6B35C4',
  mid:   '#9660E0',
  light: '#C4A0F4',
  pale:  '#EDE0FF',
}
 
// ─── Styles communs ───────────────────────────────────────────────────────────
const s = {
  page: {
    minHeight: '100vh',
    background: C.pale,
    fontFamily: '"DM Sans", sans-serif',
    padding: '24px 16px',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    boxShadow: '0 2px 12px rgba(107,53,196,0.08)',
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 6,
    letterSpacing: '-0.3px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 10,
    border: `1.5px solid ${C.light}`,
    fontSize: 15,
    color: C.ink,
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: '"DM Sans", sans-serif',
    transition: 'border-color 0.15s',
  },
  inputFocus: {
    borderColor: C.main,
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '10px 20px',
    borderRadius: 10,
    border: 'none',
    cursor: 'pointer',
    fontFamily: '"DM Sans", sans-serif',
    fontWeight: 700,
    fontSize: 14,
    transition: 'all 0.15s',
  },
  btnPrimary: {
    background: C.main,
    color: '#fff',
  },
  btnGhost: {
    background: C.pale,
    color: C.main,
  },
  btnDanger: {
    background: '#FEE2E2',
    color: '#DC2626',
  },
  tag: {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 700,
  },
  h2: {
    fontSize: 20,
    fontWeight: 800,
    color: C.ink,
    letterSpacing: '-1px',
    margin: '0 0 20px',
  },
  h3: {
    fontSize: 15,
    fontWeight: 700,
    color: C.ink,
    margin: '0 0 4px',
  },
  row: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
}
 
// ─── Composant Input avec focus state ─────────────────────────────────────────
function Input({ style, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      {...props}
      style={{ ...s.input, ...(focused ? s.inputFocus : {}), ...style }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}
 
function Textarea({ style, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      {...props}
      style={{
        ...s.input,
        resize: 'vertical',
        minHeight: 80,
        ...(focused ? s.inputFocus : {}),
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  )
}
 
// ─── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ value, onChange, label }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 44,
          height: 24,
          borderRadius: 12,
          background: value ? C.main : '#D1D5DB',
          position: 'relative',
          transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute',
          top: 2,
          left: value ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }} />
      </div>
      {label && <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{label}</span>}
    </label>
  )
}
 
// ─── Toast notification ───────────────────────────────────────────────────────
function Toast({ message, type }) {
  if (!message) return null
  return (
    <div style={{
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: type === 'error' ? '#DC2626' : C.main,
      color: '#fff',
      padding: '12px 24px',
      borderRadius: 12,
      fontWeight: 700,
      fontSize: 14,
      zIndex: 9999,
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      whiteSpace: 'nowrap',
    }}>
      {message}
    </div>
  )
}
 
// ─── Onglet MENU ──────────────────────────────────────────────────────────────
function TabMenu({ commercantId, toast }) {
  const [articles, setArticles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nom: '', description: '', prix: '', stock_jour: '', actif: true })
  const [saving, setSaving] = useState(false)
 
  useEffect(() => { fetchArticles() }, [commercantId])
 
  async function fetchArticles() {
    setLoading(true)
    const { data } = await supabase
      .from('articles')
      .select('*')
      .eq('commercant_id', commercantId)
      .order('created_at')
    setArticles(data || [])
    setLoading(false)
  }
 
  function openNew() {
    setForm({ nom: '', description: '', prix: '', stock_jour: '', actif: true })
    setEditId(null)
    setShowForm(true)
  }
 
  function openEdit(a) {
    setForm({ nom: a.nom, description: a.description || '', prix: String(a.prix), stock_jour: String(a.stock_jour ?? ''), actif: a.actif })
    setEditId(a.id)
    setShowForm(true)
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
    }
    if (editId) {
      await supabase.from('articles').update(payload).eq('id', editId)
      toast('Article mis à jour ✓')
    } else {
      await supabase.from('articles').insert(payload)
      toast('Article ajouté ✓')
    }
    setSaving(false)
    setShowForm(false)
    fetchArticles()
  }
 
  async function toggleActif(a) {
    await supabase.from('articles').update({ actif: !a.actif }).eq('id', a.id)
    fetchArticles()
  }
 
  async function updateStock(id, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 0) return
    await supabase.from('articles').update({ stock_jour: n }).eq('id', id)
    setArticles(prev => prev.map(a => a.id === id ? { ...a, stock_jour: n } : a))
  }
 
  async function deleteArticle(id) {
    if (!confirm('Supprimer cet article ?')) return
    await supabase.from('articles').delete().eq('id', id)
    toast('Article supprimé')
    fetchArticles()
  }
 
  if (loading) return <p style={{ color: C.mid, textAlign: 'center', padding: 40 }}>Chargement...</p>
 
  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={s.h2}>Menu ({articles.length} articles)</h2>
        <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNew}>+ Ajouter</button>
      </div>
 
      {/* Formulaire ajout/edit */}
      {showForm && (
        <div style={{ ...s.card, border: `2px solid ${C.main}` }}>
          <h3 style={{ ...s.h3, color: C.main, marginBottom: 16 }}>
            {editId ? 'Modifier l\'article' : 'Nouvel article'}
          </h3>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label style={s.label}>Nom de l'article *</label>
              <Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Ex: Croissant beurre" />
            </div>
            <div>
              <label style={s.label}>Description (optionnel)</label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ex: Feuilleté, pur beurre AOP..." />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={s.label}>Prix (€) *</label>
                <Input type="number" step="0.10" min="0" value={form.prix} onChange={e => setForm(p => ({ ...p, prix: e.target.value }))} placeholder="1.20" />
              </div>
              <div>
                <label style={s.label}>Stock du jour (unités)</label>
                <Input type="number" min="0" value={form.stock_jour} onChange={e => setForm(p => ({ ...p, stock_jour: e.target.value }))} placeholder="Ex: 30" />
              </div>
            </div>
            <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Article disponible à la vente" />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveArticle} disabled={saving}>
              {saving ? 'Enregistrement...' : '✓ Enregistrer'}
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}
 
      {/* Liste articles */}
      {articles.length === 0 && !showForm ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: C.mid, marginBottom: 16 }}>Aucun article dans le menu</p>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={openNew}>Ajouter le premier article</button>
        </div>
      ) : articles.map(a => (
        <div key={a.id} style={{
          ...s.card,
          opacity: a.actif ? 1 : 0.6,
          borderLeft: `4px solid ${a.actif ? C.main : '#D1D5DB'}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={s.h3}>{a.nom}</span>
                <span style={{
                  ...s.tag,
                  background: a.actif ? C.pale : '#F3F4F6',
                  color: a.actif ? C.main : '#6B7280',
                }}>
                  {a.actif ? 'Actif' : 'Inactif'}
                </span>
              </div>
              {a.description && <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 10px' }}>{a.description}</p>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, fontSize: 18, color: C.main }}>{Number(a.prix).toFixed(2)} €</span>
                {/* Stock inline edit */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, color: '#6B7280', fontWeight: 600 }}>Stock jour :</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      style={{ ...s.btn, ...s.btnGhost, padding: '4px 10px', fontSize: 16 }}
                      onClick={() => updateStock(a.id, (a.stock_jour || 0) - 1)}
                    >−</button>
                    <input
                      type="number"
                      value={a.stock_jour ?? 0}
                      min={0}
                      onChange={e => updateStock(a.id, e.target.value)}
                      style={{ ...s.input, width: 60, textAlign: 'center', padding: '4px 8px', fontSize: 15, fontWeight: 700 }}
                    />
                    <button
                      style={{ ...s.btn, ...s.btnGhost, padding: '4px 10px', fontSize: 16 }}
                      onClick={() => updateStock(a.id, (a.stock_jour || 0) + 1)}
                    >+</button>
                  </div>
                  {(a.stock_jour === 0) && (
                    <span style={{ ...s.tag, background: '#FEE2E2', color: '#DC2626' }}>Épuisé</span>
                  )}
                </div>
              </div>
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              <Toggle value={a.actif} onChange={() => toggleActif(a)} />
              <button style={{ ...s.btn, ...s.btnGhost, padding: '6px 14px', fontSize: 13 }} onClick={() => openEdit(a)}>✏️ Modifier</button>
              <button style={{ ...s.btn, ...s.btnDanger, padding: '6px 14px', fontSize: 13 }} onClick={() => deleteArticle(a.id)}>🗑 Supprimer</button>
            </div>
          </div>
        </div>
      ))}
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
    const { data } = await supabase
      .from('creneaux')
      .select('*')
      .eq('commercant_id', commercantId)
      .order('heure_debut')
    setCreneaux(data || [])
    setLoading(false)
  }
 
  async function saveCreneau() {
    if (!form.heure_debut || !form.heure_fin) return toast('Heures obligatoires', 'error')
    if (form.heure_fin <= form.heure_debut) return toast('L\'heure de fin doit être après le début', 'error')
    setSaving(true)
    await supabase.from('creneaux').insert({
      commercant_id: commercantId,
      heure_debut: form.heure_debut,
      heure_fin: form.heure_fin,
      max_commandes: parseInt(form.max_commandes) || 5,
      actif: form.actif,
    })
    toast('Créneau ajouté ✓')
    setSaving(false)
    setShowForm(false)
    setForm({ heure_debut: '', heure_fin: '', max_commandes: 5, actif: true })
    fetchCreneaux()
  }
 
  async function toggleCreneau(c) {
    await supabase.from('creneaux').update({ actif: !c.actif }).eq('id', c.id)
    fetchCreneaux()
  }
 
  async function updateMax(id, val) {
    const n = parseInt(val)
    if (isNaN(n) || n < 1) return
    await supabase.from('creneaux').update({ max_commandes: n }).eq('id', id)
    setCreneaux(prev => prev.map(c => c.id === id ? { ...c, max_commandes: n } : c))
  }
 
  async function deleteCreneau(id) {
    if (!confirm('Supprimer ce créneau ?')) return
    await supabase.from('creneaux').delete().eq('id', id)
    toast('Créneau supprimé')
    fetchCreneaux()
  }
 
  // Générer des créneaux automatiquement
  async function genererCreneaux() {
    const debut = prompt('Heure d\'ouverture (ex: 07:00) :')
    const fin = prompt('Heure de fermeture (ex: 14:00) :')
    const duree = parseInt(prompt('Durée d\'un créneau en minutes (ex: 15) :') || '15')
    const max = parseInt(prompt('Commandes max par créneau (ex: 5) :') || '5')
    if (!debut || !fin || !duree) return
 
    const slots = []
    let current = debut
    while (current < fin) {
      const [h, m] = current.split(':').map(Number)
      const totalMin = h * 60 + m + duree
      const nextH = Math.floor(totalMin / 60)
      const nextM = totalMin % 60
      const next = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`
      if (next > fin) break
      slots.push({ commercant_id: commercantId, heure_debut: current, heure_fin: next, max_commandes: max, actif: true })
      current = next
    }
    if (slots.length === 0) return toast('Aucun créneau généré', 'error')
    await supabase.from('creneaux').insert(slots)
    toast(`${slots.length} créneaux générés ✓`)
    fetchCreneaux()
  }
 
  if (loading) return <p style={{ color: C.mid, textAlign: 'center', padding: 40 }}>Chargement...</p>
 
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={s.h2}>Créneaux ({creneaux.length})</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={{ ...s.btn, ...s.btnGhost }} onClick={genererCreneaux}>⚡ Générer auto</button>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowForm(true)}>+ Ajouter</button>
        </div>
      </div>
 
      {/* Formulaire */}
      {showForm && (
        <div style={{ ...s.card, border: `2px solid ${C.main}` }}>
          <h3 style={{ ...s.h3, color: C.main, marginBottom: 16 }}>Nouveau créneau</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={s.label}>Heure de début *</label>
              <Input type="time" value={form.heure_debut} onChange={e => setForm(p => ({ ...p, heure_debut: e.target.value }))} />
            </div>
            <div>
              <label style={s.label}>Heure de fin *</label>
              <Input type="time" value={form.heure_fin} onChange={e => setForm(p => ({ ...p, heure_fin: e.target.value }))} />
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={s.label}>Commandes max</label>
            <Input type="number" min="1" max="50" value={form.max_commandes} onChange={e => setForm(p => ({ ...p, max_commandes: e.target.value }))} style={{ width: 100 }} />
          </div>
          <Toggle value={form.actif} onChange={v => setForm(p => ({ ...p, actif: v }))} label="Créneau actif" />
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={saveCreneau} disabled={saving}>
              {saving ? 'Enregistrement...' : '✓ Enregistrer'}
            </button>
            <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}
 
      {/* Liste créneaux */}
      {creneaux.length === 0 && !showForm ? (
        <div style={{ ...s.card, textAlign: 'center', padding: 40 }}>
          <p style={{ color: C.mid, marginBottom: 8 }}>Aucun créneau configuré</p>
          <p style={{ color: '#9CA3AF', fontSize: 13, marginBottom: 16 }}>
            Utilise "Générer auto" pour créer tous tes créneaux en un clic.
          </p>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={genererCreneaux}>⚡ Générer automatiquement</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {creneaux.map(c => (
            <div key={c.id} style={{
              ...s.card,
              marginBottom: 0,
              opacity: c.actif ? 1 : 0.55,
              borderLeft: `4px solid ${c.actif ? C.main : '#D1D5DB'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.ink, letterSpacing: '-1px' }}>
                    {c.heure_debut.slice(0, 5)} – {c.heure_fin.slice(0, 5)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 13, color: '#6B7280' }}>Max :</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 8px', fontSize: 14 }} onClick={() => updateMax(c.id, c.max_commandes - 1)}>−</button>
                      <input
                        type="number"
                        value={c.max_commandes}
                        min={1}
                        onChange={e => updateMax(c.id, e.target.value)}
                        style={{ ...s.input, width: 50, textAlign: 'center', padding: '3px 6px', fontSize: 14, fontWeight: 700 }}
                      />
                      <button style={{ ...s.btn, ...s.btnGhost, padding: '2px 8px', fontSize: 14 }} onClick={() => updateMax(c.id, c.max_commandes + 1)}>+</button>
                    </div>
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>cmd</span>
                  </div>
                </div>
                <Toggle value={c.actif} onChange={() => toggleCreneau(c)} />
              </div>
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button style={{ ...s.btn, ...s.btnDanger, padding: '5px 12px', fontSize: 12 }} onClick={() => deleteCreneau(c.id)}>🗑</button>
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
 
  useEffect(() => { fetchProfil() }, [commercantId])
 
  async function fetchProfil() {
    setLoading(true)
    const { data } = await supabase.from('commercants').select('*').eq('id', commercantId).single()
    if (data) setForm({
      nom: data.nom || '',
      type: data.type || '',
      email: data.email || '',
      telephone: data.telephone || '',
      adresse: data.adresse || '',
      description: data.description || '',
      horaires: data.horaires || '',
    })
    setLoading(false)
  }
 
  async function saveProfil() {
    if (!form.nom.trim()) return toast('Le nom est obligatoire', 'error')
    setSaving(true)
    const { error } = await supabase.from('commercants').update({
      nom: form.nom.trim(),
      type: form.type.trim(),
      telephone: form.telephone.trim() || null,
      adresse: form.adresse.trim() || null,
      description: form.description.trim() || null,
      horaires: form.horaires.trim() || null,
    }).eq('id', commercantId)
    setSaving(false)
    if (error) return toast('Erreur lors de la sauvegarde', 'error')
    toast('Profil mis à jour ✓')
  }
 
  if (loading || !form) return <p style={{ color: C.mid, textAlign: 'center', padding: 40 }}>Chargement...</p>
 
  const field = (label, key, placeholder, opts = {}) => (
    <div key={key}>
      <label style={s.label}>{label}</label>
      {opts.textarea
        ? <Textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} />
        : <Input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder} type={opts.type || 'text'} />
      }
      {opts.hint && <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>{opts.hint}</p>}
    </div>
  )
 
  return (
    <div>
      <h2 style={s.h2}>Profil du commerce</h2>
      <div style={s.card}>
        <div style={{ display: 'grid', gap: 16 }}>
          {field('Nom du commerce *', 'nom', 'Ex: Boulangerie Dupont')}
          {field('Type de commerce', 'type', 'Ex: Boulangerie, Coffee shop, Sandwicherie...')}
          {field('Email de contact', 'email', 'email@exemple.com', { type: 'email', hint: 'Non modifiable ici — contact support si besoin' })}
          {field('Téléphone', 'telephone', '+32 470 00 00 00', { type: 'tel' })}
          {field('Adresse', 'adresse', 'Rue de la Paix 12, 1000 Bruxelles')}
          {field('Description (visible par les clients)', 'description', 'Décrivez votre commerce en quelques mots...', { textarea: true })}
          {field('Horaires (texte libre)', 'horaires', 'Ex: Lun–Ven 7h–14h · Sam 7h–13h · Dim fermé', {
            textarea: true,
            hint: 'Ces horaires s\'affichent sur la fiche client. Indiquez vos heures réelles d\'ouverture.'
          })}
        </div>
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.pale}` }}>
          <button style={{ ...s.btn, ...s.btnPrimary, padding: '12px 28px', fontSize: 15 }} onClick={saveProfil} disabled={saving}>
            {saving ? 'Enregistrement...' : '✓ Enregistrer le profil'}
          </button>
        </div>
      </div>
 
      {/* Info champ email */}
      <div style={{ ...s.card, background: C.pale, boxShadow: 'none' }}>
        <p style={{ fontSize: 13, color: C.main, fontWeight: 600, margin: 0 }}>
          💡 <strong>Domaine visible côté client :</strong> yoppaa.app/commander/{form.nom.toLowerCase().replace(/\s+/g, '-') || 'votre-commerce'}
        </p>
      </div>
    </div>
  )
}
 
// ─── Composant principal ──────────────────────────────────────────────────────
export default function ConfigDashboard({ commercantId }) {
  const [tab, setTab] = useState('menu')
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState('success')
 
  function showToast(msg, type = 'success') {
    setToastMsg(msg)
    setToastType(type)
    setTimeout(() => setToastMsg(''), 3000)
  }
 
  const tabs = [
    { id: 'menu', label: '🍞 Menu' },
    { id: 'creneaux', label: '🕐 Créneaux' },
    { id: 'profil', label: '🏪 Profil' },
  ]
 
  return (
    <div style={s.page}>
      {/* Google Font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800&display=swap" rel="stylesheet" />
 
      {/* Header */}
      <div style={{ maxWidth: 720, margin: '0 auto 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.main, letterSpacing: '-2px', fontFamily: '"DM Sans", sans-serif' }}>yoppaa</span>
          <span style={{ fontSize: 13, color: C.mid, fontWeight: 600 }}>Configuration</span>
        </div>
 
        {/* Onglets */}
        <div style={{ display: 'flex', gap: 4, background: '#fff', padding: 4, borderRadius: 14, boxShadow: '0 2px 12px rgba(107,53,196,0.08)' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer',
                fontFamily: '"DM Sans", sans-serif',
                fontWeight: 700,
                fontSize: 14,
                transition: 'all 0.2s',
                background: tab === t.id ? C.main : 'transparent',
                color: tab === t.id ? '#fff' : C.mid,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
 
      {/* Contenu */}
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {tab === 'menu' && <TabMenu commercantId={commercantId} toast={showToast} />}
        {tab === 'creneaux' && <TabCreneaux commercantId={commercantId} toast={showToast} />}
        {tab === 'profil' && <TabProfil commercantId={commercantId} toast={showToast} />}
      </div>
 
      <Toast message={toastMsg} type={toastType} />
    </div>
  )
}