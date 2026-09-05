'use client'
// Onglet "Générateur" du dashboard commerçant (Ch3bis) : génère des textes prêts à
// publier (post réseaux, accroche). TEXTE uniquement. Appelle /api/ia/generer-post
// (le plan + le quota + le modèle sont gérés côté serveur). Arme du palier Communiquer.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getIaConfig } from '@/lib/plans'
import { signatureYoppaa, postAvecSignature } from '@/lib/lien-fiche'
import PartageVisuel from '@/app/components/PartageVisuel'
import { TYPE_ACTU } from '@/lib/visuel-partage'

const T = {
  bgPanel: '#160636', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}

const OCCASIONS = [
  { cle: 'Nouveauté', emo: '✨' },
  { cle: 'Bon plan', emo: '🔥' },
  { cle: 'Événement', emo: '📅' },
  { cle: 'Coup de cœur', emo: '💜' },
  { cle: 'Infos pratiques', emo: 'ℹ️' },
  { cle: 'Remerciement', emo: '🙏' },
]
const TONS = ['Chaleureux', 'Dynamique', 'Élégant', 'Décontracté', 'Gourmand']

export default function TabGenerateur({ commercantId, commercant, toast }) {
  const cfg = getIaConfig(commercant?.plan)
  const estExister = (commercant?.plan === 'exister' || commercant?.plan === 'on')

  const [occasion, setOccasion] = useState('Nouveauté')
  const [brief, setBrief] = useState('')
  const [ton, setTon] = useState('Chaleureux')
  const [infos, setInfos] = useState('')
  const [loading, setLoading] = useState(false)
  const [variantes, setVariantes] = useState([])
  // 🔴 LE POST NE RENVOYAIT NULLE PART (Alex, 05/09). Yoppaa payait la
  // génération, le commerçant collait le texte sur Facebook, et personne ne
  // revenait : l'outil travaillait pour un autre. Le lien est désormais calculé
  // par le serveur et collé sous chaque post copié.
  const [lien, setLien] = useState(null)
  const [nomCommerce, setNomCommerce] = useState(null)
  const [quota, setQuota] = useState(null)
  const [copie, setCopie] = useState(null)

  const restant = quota ? quota.restant : cfg.quota_mois

  async function generer() {
    if (!brief.trim()) { toast?.('Décris en une ligne ce que tu veux annoncer.', 'error'); return }
    setLoading(true); setVariantes([])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast?.('Session expirée, reconnecte-toi.', 'error'); setLoading(false); return }
      const res = await fetch('/api/ia/generer-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: commercantId, surface: 'post', occasion, brief, ton, infos }),
      })
      const j = await res.json()
      if (!res.ok || !j.ok) {
        if (j.error === 'quota_atteint') {
          setQuota(j.quota || { restant: 0, total: cfg.quota_mois })
          toast?.('Quota mensuel atteint. Il se réinitialise le 1er du mois.', 'error')
        } else if (j.error === 'plan_sans_ia') {
          toast?.(j.message || 'Le générateur est réservé aux paliers Communiquer et Vendre.', 'error')
        } else {
          toast?.(j.error || 'La génération a échoué, réessaie.', 'error')
        }
        setLoading(false); return
      }
      setVariantes(j.variantes || [])
      // 🔴 LE LIEN VIENT DU SERVEUR, il n'est jamais recomposé ici. C'est lui
      // qui fait revenir vers Yoppaa les gens qui liront ce post sur Facebook.
      setLien(j.lien || null)
      setNomCommerce(j.commerce_nom || null)
      setQuota(j.quota || null)
    } catch (e) {
      toast?.('Erreur réseau, réessaie.', 'error')
    }
    setLoading(false)
  }

  async function copier(txt, cle) {
    try { await navigator.clipboard.writeText(txt); setCopie(cle); setTimeout(() => setCopie(null), 2000) } catch { /* clipboard indispo */ }
  }

  const puce = (actif) => ({
    padding: '9px 14px', borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s',
    border: `1.5px solid ${actif ? T.main : T.hairline}`,
    background: actif ? T.main : '#fff', color: actif ? '#fff' : T.muted,
  })
  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', boxSizing: 'border-box' }

  return (
    <div>
      {/* En-tête + compteur quota */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>Générateur de posts</h2>
          <p style={{ fontSize: 13, color: T.muted, margin: '4px 0 0', lineHeight: 1.5 }}>
            Décris ton idée, l&apos;IA rédige des posts prêts à publier. Aucun prix ni date inventé.
          </p>
        </div>
        <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 800, color: T.main, background: T.pale, padding: '6px 12px', borderRadius: 100 }}>
          {restant}/{cfg.quota_mois} ce mois-ci
        </span>
      </div>

      {estExister && (
        <div style={{ background: 'rgba(150,96,224,0.10)', border: `1px solid ${T.light}`, borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: T.ink, lineHeight: 1.5 }}>
            Tu as <strong>1 essai gratuit ce mois-ci</strong> pour découvrir. Passe à <strong>Communiquer</strong> pour 60 générations/mois. 🟣
          </p>
        </div>
      )}

      {/* Formulaire */}
      <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.hairline}`, padding: 18, marginBottom: 18, boxShadow: '0 2px 12px rgba(22,6,54,0.05)' }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Occasion</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {OCCASIONS.map(o => (
            <button key={o.cle} type="button" onClick={() => setOccasion(o.cle)} style={puce(occasion === o.cle)}>
              {o.emo} {o.cle}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Ce que tu veux annoncer</p>
        <textarea value={brief} onChange={e => setBrief(e.target.value.slice(0, 400))} rows={2}
          placeholder="Ex : nouvelle formule lunch à emporter, faite maison"
          style={{ ...inputStyle, resize: 'vertical', minHeight: 54, marginBottom: 16 }} />

        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Ton</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {TONS.map(t => (
            <button key={t} type="button" onClick={() => setTon(t)} style={puce(ton === t)}>{t}</button>
          ))}
        </div>

        <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>Infos exactes à respecter (optionnel)</p>
        <input value={infos} onChange={e => setInfos(e.target.value.slice(0, 300))}
          placeholder="Prix, dates, horaires… (l'IA ne les inventera pas)"
          style={{ ...inputStyle, marginBottom: 18 }} />

        <button onClick={generer} disabled={loading || !brief.trim()}
          style={{ width: '100%', padding: '13px', borderRadius: 100, border: 'none', cursor: loading || !brief.trim() ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 900, fontSize: 14, letterSpacing: '0.3px', color: '#fff', background: loading || !brief.trim() ? '#C4A0F4' : `linear-gradient(135deg, ${T.main}, ${T.mid})` }}>
          {loading ? 'Génération…' : '✨ Générer mes posts'}
        </button>
      </div>

      {/* Résultats */}
      {variantes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
            {variantes.length} proposition{variantes.length > 1 ? 's' : ''}
          </p>
          {variantes.map((v, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.hairline}`, overflow: 'hidden', boxShadow: '0 2px 12px rgba(22,6,54,0.05)' }}>
              <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink}, ${T.main} 60%, ${T.light})` }} />
              <div style={{ padding: 16 }}>
                {/* ═══ DEUX NIVEAUX, PUIS LE VISUEL (Alex, 05/09) ═══════════
                    Chaque version est un BLOC COMPLET, montré exactement comme
                    il sera collé : le texte, les hashtags et la signature.

                    🔴 LE COMMERÇANT DOIT VOIR CE QU'IL COPIE. Avant, les
                    hashtags et le lien flottaient sous les deux versions sans
                    qu'on sache lesquels partaient avec quoi : il découvrait le
                    contenu de son presse-papiers une fois publié. */}
                {v.long && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                      Version standard
                    </p>
                    <p style={{ margin: '0 0 8px', fontSize: 14.5, color: T.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{v.long}</p>
                    {v.hashtags?.length > 0 && (
                      <p style={{ margin: '0 0 8px', fontSize: 12.5, color: T.mid, fontWeight: 700 }}>{v.hashtags.join(' ')}</p>
                    )}
                    {lien && (
                      <p style={{ margin: '0 0 10px', fontSize: 12.5, color: T.main, fontWeight: 700, wordBreak: 'break-all' }}>
                        {signatureYoppaa(lien, nomCommerce)}
                      </p>
                    )}
                    <button onClick={() => copier(postAvecSignature([v.long, v.hashtags?.join(' ')].filter(Boolean).join('\n\n'), lien, nomCommerce), `long-${i}`)}
                      style={{ padding: '8px 14px', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                      {copie === `long-${i}` ? 'Copié !' : 'Copier la version standard'}
                    </button>
                  </div>
                )}

                {/* ⚠️ LA COURTE PORTE LE LIEN ELLE AUSSI. Elle est faite pour
                    une story ou une notification, mais rien n'empêche de la
                    coller sur Facebook : sans signature, ce post-là ne
                    ramènerait personne, et c'est exactement le trou qu'on vient
                    de boucher. */}
                {v.court && (
                  <div style={{ marginBottom: 4, paddingTop: 12, borderTop: `1px solid ${T.hairline}` }}>
                    <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.7px' }}>
                      Version courte
                    </p>
                    <p style={{ margin: '0 0 10px', fontSize: 13.5, color: T.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{v.court}</p>
                    <button onClick={() => copier(postAvecSignature(v.court, lien, nomCommerce), `court-${i}`)}
                      style={{ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 800, fontSize: 12.5, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                      {copie === `court-${i}` ? 'Copié !' : 'Copier la version courte'}
                    </button>
                  </div>
                )}

                {/* 🔴 LE VISUEL A SES PROPRES CHAMPS DEPUIS LE 05/09. Il prenait
                    la version COURTE comme titre : une phrase entière, avec deux
                    points, un prix et un emoji. Ce n'est pas un titre, c'est un
                    post écrit en très gros, et Alex l'a vu sur capture.

                    ⚠️ LE MODÈLE ÉCRIT MAINTENANT POUR L'AFFICHE : une accroche
                    de deux à cinq mots et un sous-titre d'une phrase. Le repli
                    sur `court` et `long` vit ICI, pas dans la route : une
                    réponse d'hier, ou un modèle qui n'a pas suivi la consigne,
                    ne doit pas laisser la carte vide.

                    ⚠️ ET LE TYPE EST « NOUVEAUTÉ » : le générateur sert à ce qui
                    n'a pas d'objet dans Yoppaa. Un invendu ou un deal partage
                    depuis SA carte, avec ses propres données, jamais depuis ici
                    où le prix serait retapé à la main. */}
                <PartageVisuel
                  annonce={{
                    type: TYPE_ACTU,
                    enseigne: nomCommerce || commercant?.nom || '',
                    titre: v.accroche || v.court || v.long || '',
                    description: v.soustitre || v.court || null,
                    lien,
                  }}
                  texte={postAvecSignature([v.long, v.hashtags?.join(' ')].filter(Boolean).join('\n\n'), lien, nomCommerce)}
                  slug={commercant?.slug || ''}
                  toast={toast}/>
              </div>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: T.muted, textAlign: 'center', margin: '4px 0 0', lineHeight: 1.5 }}>
            Relis toujours avant de publier. L&apos;IA t&apos;aide à rédiger, tu gardes le dernier mot. 🟣
          </p>
        </div>
      )}
    </div>
  )
}
