'use client'
// « Rédiger avec l'IA » sur les DEUX textes de la fiche : la présentation et
// les infos pratiques.
//
// ⚠️ POURQUOI PAS `BoutonIaInline`. Celui-là appelle `/api/ia/generer-post`,
// réservé aux paliers Communiquer et Vendre : un commerçant en Exister y
// verrait un bouton qui refuse de servir. Or la fiche est précisément ce qu'on
// veut lui voir soigner, c'est elle qui décide un habitant à pousser sa porte.
// Ce bouton passe donc par `/api/ia/presentation`, ouverte à tous les paliers
// avec un quota mensuel qui dépend du palier (arbitrage d'Alex, 26/08 : 3 par
// mois pour Exister, davantage au-dessus).
//
// ⚠️ ET IL PART DE CE QUE LE COMMERÇANT A DÉJÀ TAPÉ. Le contenu du champ est
// envoyé comme matière première : trois mots en vrac suffisent, et c'est bien
// mieux qu'un texte inventé de toutes pièces. C'est ce que dit la ligne
// d'exemples affichée sous le champ.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function BoutonIaFiche({
  commercantId,
  champ = 'presentation',   // 'presentation' | 'infos_pratiques'
  mots = '',                // ce qui est déjà dans le champ
  siteWeb = '',
  onVariantes,
  toast,
}) {
  const [loading, setLoading] = useState(false)

  async function go() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast?.('Session expirée, reconnecte-toi.', 'error'); setLoading(false); return }
      const res = await fetch('/api/ia/presentation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          commercant_id: commercantId,
          champ,
          mots: (mots || '').trim(),
          ...(siteWeb ? { site_web: siteWeb } : {}),
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        // ⚠️ LE QUOTA SE DIT AVEC SES MOTS À LUI. Le serveur renvoie une phrase
        // complète pour ce cas : la remplacer par « erreur » ferait croire à
        // une panne alors que tout fonctionne.
        toast?.(j?.message || j?.error || 'La rédaction a échoué, réessaie.', 'error')
        setLoading(false); return
      }
      const vs = (j.variantes || []).filter(Boolean)
      if (!vs.length) { toast?.('Aucune proposition, réessaie.', 'error'); setLoading(false); return }
      // Le parent affiche les propositions, le commerçant choisit puis modifie.
      onVariantes?.(vs.map(texte => ({ court: texte, long: texte })))
      toast?.(
        `${j.site_lu ? 'On a lu ton site pour t’aider. ' : ''}${vs.length} propositions ✨ Choisis, puis arrange à ta façon.`,
        'success'
      )
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
