'use client'
// Section admin : activation manuelle des communes + réglage du seuil de déblocage.
// C'est Alex qui active chaque commune à la main (là où il a assez de commerçants).
// Aucune activation automatique. Lecture/écriture via /api/admin/communes (service_role
// + check admin). Remplace les UPDATE SQL manuels.

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Check, RefreshCw } from 'lucide-react'
// Le repli vit à part : d'autres blocs de l'admin sont aussi longs, et un bloc
// plié doit continuer de dire ce qu'il contient.
import Repli from './Repli'
import { sansAccents } from '@/lib/texte-normalise'

const T = {
  bg: '#F8F6FF', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}

// Normalise pour la recherche (minuscules + sans accents). La fonction vit dans
// `lib/texte-normalise.js` depuis le 03/09 : elle était recopiée à l'identique
// dans trois fichiers.
const norm = sansAccents

export default function SectionCommunes() {
  const [communes, setCommunes] = useState([])   // source de vérité (dernières valeurs serveur)
  const [edits, setEdits] = useState({})          // { commune_id: { seuil, active } } en cours d'édition
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [recherche, setRecherche] = useState('')
  const [saving, setSaving] = useState(null)      // commune_id en cours de sauvegarde
  const [toast, setToast] = useState(null)

  const charger = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErr('Session expirée'); setLoading(false); return }
      const res = await fetch('/api/admin/communes', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Erreur')
      setCommunes(j.communes || [])
      setEdits({})
    } catch (e) {
      setErr(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // Valeur affichée pour une commune (édition en cours sinon valeur serveur).
  const valeur = (c) => ({
    seuil: edits[c.commune_id]?.seuil ?? c.seuil_preinscrits ?? 5,
    active: edits[c.commune_id]?.active ?? !!c.active,
  })
  const estModifie = (c) => {
    const e = edits[c.commune_id]
    if (!e) return false
    return (e.seuil !== undefined && Number(e.seuil) !== (c.seuil_preinscrits ?? 5))
        || (e.active !== undefined && e.active !== !!c.active)
  }

  function setEdit(id, champ, val) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [champ]: val } }))
  }

  async function enregistrer(c) {
    const v = valeur(c)
    const seuil = Number(v.seuil)
    if (!Number.isInteger(seuil) || seuil < 1 || seuil > 999) {
      showToast('Seuil invalide (entier 1 à 999)', 'error'); return
    }
    setSaving(c.commune_id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/communes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commune_id: c.commune_id, seuil_preinscrits: seuil, active: v.active }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Erreur')
      // Applique localement + purge l'édition.
      setCommunes(prev => prev.map(x => x.commune_id === c.commune_id
        ? { ...x, seuil_preinscrits: seuil, active: v.active } : x))
      setEdits(prev => { const n = { ...prev }; delete n[c.commune_id]; return n })
      showToast(`${c.nom} : ${v.active ? 'active' : 'en mobilisation'} · seuil ${seuil}`, 'success')
    } catch (e) {
      showToast(`Erreur : ${e.message}`, 'error')
    }
    setSaving(null)
  }

  // Affichage : par défaut on montre les communes actives ou avec au moins 1 commerçant
  // (celles qui bougent). La recherche donne accès aux 260. Tri : actives d'abord,
  // puis par nb de commerçants décroissant, puis alpha.
  const filtrees = useMemo(() => {
    const q = norm(recherche.trim())
    let list = communes
    if (q) {
      list = communes.filter(c => norm(c.nom).includes(q))
    } else {
      list = communes.filter(c => c.active || (c.nb_commercants || 0) > 0)
    }
    return [...list].sort((a, b) =>
      (Number(b.active) - Number(a.active))
      || ((b.nb_commercants || 0) - (a.nb_commercants || 0))
      || a.nom.localeCompare(b.nom))
  }, [communes, recherche])

  const nbActives = communes.filter(c => c.active).length
  const masquees = !recherche.trim() ? communes.length - filtrees.length : 0

  // ⚠️ CE QUI SE PERDRAIT EN REPLIANT. Une modification saisie et non
  // enregistrée reste en mémoire, invisible : c'est comme ça qu'on égare une
  // saisie. Le repli le DIT au lieu de la faire disparaître en silence.
  const enAttente = communes.filter(c => estModifie(c)).length

  return (
    <Repli
      titre="Communes"
      // 🔴 LE TITRE PARLE MÊME PLIÉ (Alex, 30/08 : « c'est beaucoup trop
      // grand »). Un bloc replié dont l'intitulé ne dit rien oblige à l'ouvrir
      // pour savoir s'il valait la peine d'être ouvert.
      resume={(
        <>
          <span style={{ color: T.main, fontSize: 22, fontWeight: 900 }}> · {nbActives} active{nbActives > 1 ? 's' : ''}</span>
          <span style={{ color: T.muted, fontWeight: 700, fontSize: 14 }}> / {communes.length}</span>
        </>
      )}
      alerte={enAttente > 0
        ? `${enAttente} commune${enAttente > 1 ? 's' : ''} modifiée${enAttente > 1 ? 's' : ''} et pas encore enregistrée${enAttente > 1 ? 's' : ''}.`
        : null}
      actions={(
        <button onClick={charger} style={{ background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={13} strokeWidth={2}/> Rafraîchir
        </button>
      )}
    >
      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Activation <strong>manuelle</strong> : bascule une commune sur <strong>Active</strong> quand tu y as assez de commerçants.
        Une commune active devient disponible sur la landing. Ajuste le <strong>seuil</strong> de déblocage si besoin.
      </p>

      {/* Recherche */}
      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 360 }}>
        <Search size={16} strokeWidth={2} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.muted }}/>
        <input value={recherche} onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher une commune…"
          style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', boxSizing: 'border-box' }}/>
      </div>

      {loading && <p style={{ color: T.muted, textAlign: 'center', padding: 30 }}>Chargement…</p>}
      {err && <p style={{ color: '#DC2626', fontWeight: 700, fontSize: 13 }}>Erreur : {err}</p>}

      {!loading && !err && (
        <>
          <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, overflow: 'hidden' }}>
            {filtrees.length === 0 && (
              <p style={{ color: T.muted, textAlign: 'center', padding: 28, fontSize: 13, margin: 0 }}>Aucune commune trouvée.</p>
            )}
            {filtrees.map((c, i) => {
              const v = valeur(c)
              const modifie = estModifie(c)
              return (
                <div key={c.commune_id} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${T.hairline}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {/* Nom + stats */}
                  <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted, fontWeight: 600 }}>
                      <strong style={{ color: T.main }}>{c.nb_commercants || 0}</strong> commerçant{(c.nb_commercants || 0) > 1 ? 's' : ''}
                      {' · '}{c.nb_yoppers || 0} curieux
                    </p>
                  </div>

                  {/* Seuil */}
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: T.muted }}>
                    Seuil
                    <input type="number" min={1} max={999} value={v.seuil}
                      onChange={e => setEdit(c.commune_id, 'seuil', e.target.value.replace(/\D/g, '').slice(0, 3))}
                      style={{ width: 58, padding: '7px 8px', borderRadius: 8, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontWeight: 700, color: T.ink, textAlign: 'center', fontFamily: '"DM Sans", sans-serif', outline: 'none' }}/>
                  </label>

                  {/* Toggle active */}
                  <button onClick={() => setEdit(c.commune_id, 'active', !v.active)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 100, border: `1.5px solid ${v.active ? T.green : T.hairline}`, background: v.active ? '#ECFDF5' : '#fff', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    <span style={{ width: 34, height: 20, borderRadius: 100, background: v.active ? T.green : '#D1D5DB', position: 'relative', transition: 'background 0.15s', flexShrink: 0 }}>
                      <span style={{ position: 'absolute', top: 2, left: v.active ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }}/>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: v.active ? T.green : T.muted }}>
                      {v.active ? 'Active' : 'Mobilisation'}
                    </span>
                  </button>

                  {/* Enregistrer (seulement si modifié) */}
                  <button onClick={() => enregistrer(c)} disabled={!modifie || saving === c.commune_id}
                    style={{ padding: '8px 14px', borderRadius: 100, border: 'none', background: modifie ? T.main : T.hairline, color: modifie ? '#fff' : T.muted, fontWeight: 800, fontSize: 12, cursor: modifie && saving !== c.commune_id ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {saving === c.commune_id ? 'Enregistrement…' : <><Check size={13} strokeWidth={2.5}/> Enregistrer</>}
                  </button>
                </div>
              )
            })}
          </div>

          {masquees > 0 && (
            <p style={{ fontSize: 12, color: T.muted, margin: '10px 2px 0', fontStyle: 'italic' }}>
              {masquees} autre{masquees > 1 ? 's' : ''} commune{masquees > 1 ? 's' : ''} sans activité masquée{masquees > 1 ? 's' : ''}. Utilise la recherche pour les trouver.
            </p>
          )}
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.type === 'error' ? '#DC2626' : T.green, color: '#fff', padding: '12px 22px', borderRadius: 100, fontWeight: 700, fontSize: 14, boxShadow: '0 8px 28px rgba(0,0,0,0.25)', zIndex: 2000, fontFamily: '"DM Sans", sans-serif', maxWidth: '90%' }}>
          {toast.msg}
        </div>
      )}
    </Repli>
  )
}
