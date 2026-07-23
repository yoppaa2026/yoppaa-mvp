'use client'
// Bouton "Rédiger avec l'IA" en ligne, à côté des champs description des
// deals/actus/articles. Réutilise /api/ia/generer-post (même quota/plan/modèle
// que l'onglet Générateur) et injecte la 1re variante dans les champs via
// onResult({court, long, hashtags}). Le titre/nom en cours sert de brief.
// Pas d'invention (prix/dates/caractéristiques passés en `infos`).

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function BoutonIaInline({
  commercantId,
  surface = 'deal',
  brief,
  occasion = 'Nouveauté',
  ton = 'Chaleureux',
  infos = '',
  briefManquantMsg = 'Écris d’abord un titre, l’IA s’en inspire.',
  onResult,
  toast,
}) {
  const [loading, setLoading] = useState(false)

  async function go() {
    const b = (brief || '').trim()
    if (!b) { toast?.(briefManquantMsg, 'error'); return }
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast?.('Session expirée, reconnecte-toi.', 'error'); setLoading(false); return }
      const res = await fetch('/api/ia/generer-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: commercantId, surface, occasion, brief: b, ton, infos }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        if (j.error === 'quota_atteint') toast?.('Quota IA mensuel atteint. Il repart le 1er du mois.', 'error')
        else if (j.error === 'plan_sans_ia') toast?.('Le générateur est réservé aux paliers Communiquer et Vendre.', 'error')
        else toast?.(j.error || 'La génération a échoué, réessaie.', 'error')
        setLoading(false); return
      }
      const v = (j.variantes || [])[0]
      if (v && (v.court || v.long)) {
        onResult?.(v)
        toast?.('Texte généré ✨ Relis et ajuste avant de publier.', 'success')
      } else {
        toast?.('Aucune proposition, réessaie.', 'error')
      }
    } catch {
      toast?.('Erreur réseau, réessaie.', 'error')
    }
    setLoading(false)
  }

  return (
    <button type="button" onClick={go} disabled={loading}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 100, border: '1.5px solid #C4A0F4', background: loading ? '#EDE0FF' : '#fff', color: '#6B35C4', fontWeight: 800, fontSize: 11.5, cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
      {loading ? 'Rédaction…' : '✨ Rédiger avec l’IA'}
    </button>
  )
}
