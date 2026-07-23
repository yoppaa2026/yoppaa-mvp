'use client'
// Modale d'édition rapide d'un commerçant depuis le dashboard admin Yoppaa.
// Permet de corriger les champs critiques (nom, slug, plan, statut, contacts, etc.)
// sans devoir passer par le dashboard du commerçant lui-même.
//
// Toutes les modifs vont directement en DB via supabase.from('commercants').update(...)
// La RLS "Admin Yoppaa modifie tout" (migration admin) autorise ces UPDATE pour l'admin.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { PLANS } from '@/lib/plans'
import { TOUS_TYPES } from '@/lib/types-commerce'

const T = {
  bg:       '#F8F6FF',
  bgPanel:  '#160636',
  main:     '#6B35C4',
  mid:      '#9660E0',
  light:    '#C4A0F4',
  pale:     '#EDE0FF',
  ink:      '#1A0840',
  deep:     '#2D0F6B',
  muted:    '#6B7280',
  hairline: '#EEE9F5',
}

const STATUTS_PUB = ['publie', 'en_attente', 'rejete', 'suspendu']
const CATEGORIES = ['alimentaire', 'vitrine', 'detail']
// Suggestions du champ Type : liste officielle complète (lib/types-commerce).
// Le champ reste en TEXTE LIBRE : contrôle total admin pour normaliser un type
// « Autre… » saisi au signup ou corriger une anomalie ("Boulangerie & Pâtisserie"
// = double métier, séparateur ' & ').
const TYPES_COMMUNS = TOUS_TYPES

export default function ModalEditCommercant({ commercant, onClose, onSaved, onDeleted, toast }) {
  const [form, setForm] = useState({
    nom: '',
    slug: '',
    type: '',
    categorie: 'alimentaire',
    plan: 'exister',
    statut_publication: 'publie',
    email: '',
    telephone: '',
    adresse: '',
    description: '',
    rdv_actif: false,
    rdv_delai_annulation_heures: 24,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [mounted, setMounted] = useState(false)
  // Suppression définitive (commerçants de test)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [blockInfo, setBlockInfo] = useState(null)

  useEffect(() => { setMounted(true) }, [])

  // Init form depuis le commerçant à l'ouverture
  useEffect(() => {
    if (!commercant) return
    setForm({
      nom: commercant.nom || '',
      slug: commercant.slug || '',
      type: commercant.type || '',
      categorie: commercant.categorie || 'alimentaire',
      plan: commercant.plan || 'exister',
      statut_publication: commercant.statut_publication || 'publie',
      email: commercant.email || '',
      telephone: commercant.telephone || '',
      adresse: commercant.adresse || '',
      description: commercant.description || '',
      rdv_actif: !!commercant.rdv_actif,
      rdv_delai_annulation_heures: commercant.rdv_delai_annulation_heures ?? 24,
    })
    setError(null)
  }, [commercant])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  function setField(k, v) {
    setForm(p => ({ ...p, [k]: v }))
  }

  async function sauvegarder() {
    if (saving) return
    setError(null)

    // Validations basiques
    if (!form.nom.trim()) return setError('Le nom est obligatoire.')
    if (!form.slug.trim()) return setError('Le slug est obligatoire (URL de la fiche).')
    if (!/^[a-z0-9-]+$/.test(form.slug)) return setError('Slug invalide : uniquement lettres minuscules, chiffres, tirets.')

    setSaving(true)
    try {
      // Si slug a changé, vérifier qu'il n'est pas pris par un autre commerçant
      if (form.slug !== commercant.slug) {
        const { data: existant } = await supabase
          .from('commercants')
          .select('id')
          .eq('slug', form.slug)
          .neq('id', commercant.id)
          .maybeSingle()
        if (existant) {
          setError(`Slug "${form.slug}" déjà utilisé par un autre commerçant.`)
          setSaving(false)
          return
        }
      }

      const updates = {
        nom: form.nom.trim(),
        slug: form.slug.trim(),
        type: form.type.trim() || null,
        categorie: form.categorie,
        plan: form.plan,
        statut_publication: form.statut_publication,
        email: form.email.trim() || null,
        telephone: form.telephone.trim() || null,
        adresse: form.adresse.trim() || null,
        description: form.description.trim() || null,
        rdv_actif: !!form.rdv_actif,
        rdv_delai_annulation_heures: Number(form.rdv_delai_annulation_heures) || 24,
      }
      const { error: errUp } = await supabase
        .from('commercants')
        .update(updates)
        .eq('id', commercant.id)
      if (errUp) throw errUp

      if (toast) toast(`✓ ${form.nom} mis à jour`, 'success')
      if (onSaved) onSaved({ ...commercant, ...updates })
      onClose()

    } catch (e) {
      console.error('[ModalEditCommercant] save error', e)
      setError(`Erreur : ${e.message || 'inconnue'}`)
      setSaving(false)
    }
  }

  // Suppression définitive (cascade côté serveur). Gardée : le serveur refuse (409)
  // si le commerçant a des transactions payées, sauf force=true (données de test).
  async function supprimer(force = false) {
    if (deleting) return
    setDeleting(true); setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/commercants', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ commercant_id: commercant.id, force }),
      })
      const j = await res.json()
      if (res.status === 409 && j.error === 'transactions_payees') {
        setBlockInfo(j); setDeleting(false); return
      }
      if (!res.ok || !j.ok) throw new Error(j.message || j.error || 'Erreur suppression')
      if (toast) toast(`${commercant.nom} supprimé définitivement`, 'success')
      if (onDeleted) onDeleted(commercant.id)
      onClose()
    } catch (e) {
      console.error('[ModalEditCommercant] delete error', e)
      setError(`Erreur : ${e.message || 'inconnue'}`)
      setDeleting(false)
    }
  }

  // Comparaison tolérante : apostrophes typographiques vs droites (’ vs '),
  // espaces multiples/insécables et casse. Le but est la friction volontaire,
  // pas de bloquer sur un caractère invisible.
  const normaliserNom = (str) => (str || '')
    .replace(/[‘’ʼ´`]/g, "'")
    .replace(/[\s ]+/g, ' ')
    .trim()
    .toLowerCase()
  const nomOk = normaliserNom(confirmName) === normaliserNom(commercant?.nom)

  if (!mounted || typeof document === 'undefined' || !commercant) return null

  const labelSt = { fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }
  const inputSt = { width: '100%', padding: '0.55rem 0.75rem', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink, background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const selectSt = { ...inputSt, cursor: 'pointer' }

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, padding: '1rem', backdropFilter: 'blur(4px)', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 18, overflow: 'hidden', marginTop: '2rem', marginBottom: '2rem', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 20px 60px rgba(22,6,54,0.4)' }}>

        {/* Header sombre canonique */}
        <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, color: '#fff', padding: '1rem 1.125rem', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 10, fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', margin: 0, marginBottom: 4, opacity: 0.85 }}>
                Édition admin
              </p>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {commercant.nom}
              </h2>
            </div>
            <button onClick={onClose} aria-label="Fermer" disabled={saving}
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', cursor: saving ? 'default' : 'pointer', borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body form — 2 colonnes sur les champs courts */}
        <div style={{ padding: '1rem 1.125rem 0' }}>

          {/* Nom + Slug */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>Nom *</label>
              <input type="text" value={form.nom} onChange={e => setField('nom', e.target.value)} style={inputSt}/>
            </div>
            <div>
              <label style={labelSt}>Slug URL *</label>
              <input type="text" value={form.slug} onChange={e => setField('slug', e.target.value.toLowerCase())} placeholder="dermae-mettet" style={{ ...inputSt, fontFamily: 'monospace', fontSize: 13 }}/>
            </div>
          </div>

          {/* Type + Catégorie + Plan */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>Type</label>
              <input type="text" value={form.type} onChange={e => setField('type', e.target.value)} list="types-communs" style={inputSt}/>
              <datalist id="types-communs">
                {TYPES_COMMUNS.map(t => <option key={t} value={t}/>)}
              </datalist>
            </div>
            <div>
              <label style={labelSt}>Catégorie</label>
              <select value={form.categorie} onChange={e => setField('categorie', e.target.value)} style={selectSt}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelSt}>Plan</label>
              <select value={form.plan} onChange={e => setField('plan', e.target.value)} style={selectSt}>
                {PLANS.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          {/* Statut publication + RDV actif */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>Statut publication</label>
              <select value={form.statut_publication} onChange={e => setField('statut_publication', e.target.value)} style={selectSt}>
                {STATUTS_PUB.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', width: '100%', padding: '0.55rem 0', fontSize: 13, fontWeight: 700, color: T.ink }}>
                <input type="checkbox" checked={!!form.rdv_actif} onChange={e => setField('rdv_actif', e.target.checked)} style={{ width: 18, height: 18, accentColor: T.main, cursor: 'pointer' }}/>
                RDV actif (module RDV vitrine)
              </label>
            </div>
          </div>

          {/* Email + Téléphone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label style={labelSt}>Email</label>
              <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} style={inputSt}/>
            </div>
            <div>
              <label style={labelSt}>Téléphone</label>
              <input type="tel" value={form.telephone} onChange={e => setField('telephone', e.target.value)} style={inputSt}/>
            </div>
          </div>

          {/* Adresse */}
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>Adresse</label>
            <input type="text" value={form.adresse} onChange={e => setField('adresse', e.target.value)} style={inputSt}/>
          </div>

          {/* Délai annulation RDV (si rdv_actif) */}
          {form.rdv_actif && (
            <div style={{ marginBottom: 12 }}>
              <label style={labelSt}>Délai d'annulation RDV (heures avant)</label>
              <input type="number" min="0" max="168" value={form.rdv_delai_annulation_heures} onChange={e => setField('rdv_delai_annulation_heures', e.target.value)} style={{ ...inputSt, maxWidth: 120 }}/>
              <p style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Le client peut annuler jusqu'à X heures avant le RDV (refund auto si Stripe). Par défaut 24h.</p>
            </div>
          )}

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Description</label>
            <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={3} style={{ ...inputSt, resize: 'vertical', minHeight: 70, fontSize: 13 }}/>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: 12 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#DC2626', lineHeight: 1.4, margin: 0 }}>{error}</p>
            </div>
          )}
        </div>

        {confirmDelete ? (
          <div style={{ padding: '0.875rem 1.125rem 1.125rem', borderTop: '1px solid #FCA5A5', background: '#FEF2F2' }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: '#991B1B', margin: '0 0 6px' }}>Suppression définitive</p>
            <p style={{ fontSize: 12, color: '#B91C1C', lineHeight: 1.5, margin: '0 0 10px' }}>
              «&nbsp;{commercant.nom}&nbsp;» et TOUT son contenu (articles, variantes, commandes, RDV, deals, actus, créneaux…) seront supprimés, ainsi que le compte de connexion lié. <strong>Irréversible.</strong>
            </p>
            {blockInfo && (
              <div style={{ background: '#FFF7ED', border: '1.5px solid #FDBA74', borderRadius: 10, padding: '0.5rem 0.75rem', marginBottom: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#9A3412', lineHeight: 1.5, margin: 0 }}>{blockInfo.message}</p>
              </div>
            )}
            <label style={{ ...labelSt, color: '#991B1B' }}>Retape le nom pour confirmer</label>
            <input type="text" value={confirmName} onChange={e => setConfirmName(e.target.value)} placeholder={commercant.nom} autoFocus
              style={{ ...inputSt, borderColor: '#FCA5A5', marginBottom: 10 }}/>
            {error && <p style={{ fontSize: 12, fontWeight: 700, color: '#DC2626', margin: '0 0 10px' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setConfirmDelete(false); setConfirmName(''); setBlockInfo(null); setError(null) }} disabled={deleting}
                style={{ flex: 1, padding: '0.7rem', background: '#fff', border: `1.5px solid ${T.hairline}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: deleting ? 'default' : 'pointer', fontSize: 13, fontFamily: '"DM Sans", sans-serif' }}>
                Annuler
              </button>
              <button onClick={() => supprimer(!!blockInfo)} disabled={deleting || !nomOk}
                style={{ flex: 2, padding: '0.7rem', border: 'none', borderRadius: 100, background: (deleting || !nomOk) ? '#FCA5A5' : '#DC2626', color: '#fff', fontWeight: 800, cursor: (deleting || !nomOk) ? 'default' : 'pointer', fontSize: 13, fontFamily: '"DM Sans", sans-serif' }}>
                {deleting ? 'Suppression…' : (blockInfo ? 'Supprimer quand même (test)' : 'Supprimer définitivement')}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, padding: '0.75rem 1.125rem 1.125rem', borderTop: `1px solid ${T.hairline}`, background: '#FAFAFA', alignItems: 'center' }}>
            <button onClick={() => { setConfirmDelete(true); setError(null) }} disabled={saving} title="Supprimer ce commerçant"
              style={{ padding: '0.75rem 0.875rem', background: '#fff', border: '1.5px solid #FCA5A5', borderRadius: 100, color: '#DC2626', fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontSize: 13, fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
              Supprimer
            </button>
            <button onClick={onClose} disabled={saving}
              style={{ flex: 1, padding: '0.75rem', background: '#fff', border: `1.5px solid ${T.hairline}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontSize: 14, fontFamily: '"DM Sans", sans-serif' }}>
              Annuler
            </button>
            <button onClick={sauvegarder} disabled={saving}
              style={{ flex: 2, padding: '0.75rem', border: 'none', borderRadius: 100, background: saving ? '#D1D5DB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: saving ? 'default' : 'pointer', fontSize: 14, fontFamily: '"DM Sans", sans-serif', boxShadow: saving ? 'none' : `0 4px 14px ${T.main}55` }}>
              {saving ? 'Enregistrement…' : 'Enregistrer ✓'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
