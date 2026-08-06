'use client'
// Section admin : le compteur d'essais répond-il vraiment ?
//
// Impossible à vérifier à la main. La fenêtre glisse sur soixante secondes :
// taper onze codes au clavier prend plus longtemps que ça, les premiers sont
// déjà sortis quand on arrive au dernier, et on conclut à tort que rien ne
// bloque. Ce bouton tire les onze essais d'affilée, côté serveur.
//
// Ce que ça protège : la vérification des codes de bons cadeaux, où l'absence
// de limite ouvre le brute-force sur de l'argent.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, AlertTriangle, CheckCircle } from 'lucide-react'

const T = {
  bg: '#F8F6FF', main: '#6B35C4', pale: '#EDE0FF',
  ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}

export default function SectionDiagnosticRatelimit() {
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)

  async function tester() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setRes({ ok: false, error: 'Session expirée' }); setLoading(false); return }
      const r = await fetch('/api/admin/diagnostic-ratelimit', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setRes(await r.json())
    } catch (e) {
      setRes({ ok: false, error: String(e?.message || e) })
    }
    setLoading(false)
  }

  const bloque = res?.ok && res?.compte_reellement
  const parRepli = res?.ok && res?.via_repli_local
  const couleur = !res?.ok ? '#DC2626' : (!bloque ? '#DC2626' : (parRepli ? '#EA580C' : T.green))

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>
          <ShieldCheck size={20} strokeWidth={2} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6, color: T.main }}/>
          Limite des essais
        </h2>
        <button onClick={tester} disabled={loading}
          style={{ background: T.main, border: 'none', padding: '8px 16px', borderRadius: 100, color: '#fff', fontWeight: 800, fontSize: 12.5, cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          {loading ? 'Test en cours…' : 'Tester maintenant'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 14px', lineHeight: 1.5 }}>
        Onze essais d&rsquo;affilée sur une clé de test. Le onzième doit être refusé.
        C&rsquo;est ce qui empêche d&rsquo;essayer les codes de bons cadeaux en série, et ça
        ne se vérifie pas à la main : la fenêtre ne dure qu&rsquo;une minute.
      </p>

      {res && (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, borderLeft: `4px solid ${couleur}`, padding: '14px 16px' }}>
          {!res.ok ? (
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#DC2626' }}>Erreur : {res.error}</p>
          ) : (
            <>
              <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 800, color: couleur, display: 'flex', alignItems: 'center', gap: 7 }}>
                {bloque ? <CheckCircle size={16} strokeWidth={2.2}/> : <AlertTriangle size={16} strokeWidth={2.2}/>}
                {res.verdict}
              </p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                {res.essais.map(e => (
                  <span key={e.n} title={`Essai ${e.n}`}
                    style={{ width: 26, height: 26, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, background: e.autorise ? T.pale : '#FEE2E2', color: e.autorise ? T.deep : '#DC2626' }}>
                    {e.n}
                  </span>
                ))}
              </div>
              <p style={{ margin: 0, fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
                Base <strong style={{ color: T.deep }}>{res.config.hote || 'non configurée'}</strong>
                {' · '}adresse {res.config.url_https ? 'valide' : 'invalide'}
                {' · '}jeton {res.config.token_present ? 'présent' : 'absent'}
                {' · '}compteur partagé {res.config.limiteur_instancie ? 'actif' : 'inactif'}
                {' · '}{res.duree_ms} ms pour onze appels
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}
