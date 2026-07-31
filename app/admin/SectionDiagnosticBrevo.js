'use client'
// Section admin : diagnostic de la connexion Brevo (email marketing + SMS de
// fidélité). Répond en un clic à « est-ce que ça marche ? » sans fouiller les
// logs Vercel, et permet d'envoyer un vrai SMS de test pour valider
// l'expéditeur de bout en bout.

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MessageCircle, CheckCircle, AlertTriangle, Send } from 'lucide-react'

const T = {
  bg: '#F8F6FF', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}

export default function SectionDiagnosticBrevo() {
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [tel, setTel] = useState('')

  async function tester(avecSms = false) {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setRes({ ok: false, error: 'Session expirée' }); setLoading(false); return }
      const q = avecSms && tel.trim() ? `?sms=${encodeURIComponent(tel.trim())}` : ''
      const r = await fetch(`/api/admin/diagnostic-brevo${q}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setRes(await r.json())
    } catch (e) {
      setRes({ ok: false, error: String(e?.message || e) })
    }
    setLoading(false)
  }

  const okConnexion = res?.ok && res?.connexion
  const credits = res?.sms?.credits_brevo ?? null

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0 }}>
          Brevo <span style={{ color: T.main, marginLeft: 6 }}>· email &amp; SMS</span>
        </h2>
        <button onClick={() => tester(false)} disabled={loading}
          style={{ background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: loading ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          {loading ? '…' : '↻ Tester la connexion'}
        </button>
      </div>

      <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, padding: '16px 18px' }}>
        {!res && (
          <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
            Clique sur « Tester la connexion » pour vérifier que la clé Brevo répond, voir tes crédits SMS
            et l&rsquo;expéditeur qui sera utilisé pour les SMS de fidélité.
          </p>
        )}

        {res && !res.ok && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <AlertTriangle size={20} color="#DC2626" style={{ flexShrink: 0, marginTop: 2 }}/>
            <div>
              <p style={{ margin: '0 0 4px', fontWeight: 800, color: '#991B1B', fontSize: 14 }}>Connexion KO</p>
              <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                {res.message || res.error || 'Erreur inconnue'}
              </p>
              {res.detail && <p style={{ margin: '6px 0 0', fontSize: 11, color: T.muted, fontFamily: 'monospace', wordBreak: 'break-all' }}>{res.detail}</p>}
            </div>
          </div>
        )}

        {okConnexion && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
              <CheckCircle size={20} color={T.green} style={{ flexShrink: 0, marginTop: 2 }}/>
              <div>
                <p style={{ margin: '0 0 2px', fontWeight: 800, color: T.ink, fontSize: 14 }}>
                  Connexion OK{res.compte?.email ? ` · ${res.compte.email}` : ''}
                </p>
                <p style={{ margin: 0, fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                  La même clé sert aux contacts (email) et aux SMS de fidélité.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <div style={{ flex: 1, minWidth: 150, background: credits > 0 ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${credits > 0 ? '#86EFAC' : '#FCD34D'}`, borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: T.muted }}>Crédits SMS Brevo</p>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: credits > 0 ? '#059669' : '#B45309', letterSpacing: '-0.5px', lineHeight: 1 }}>{credits ?? '—'}</p>
              </div>
              <div style={{ flex: 1, minWidth: 150, background: T.bg, border: `1px solid ${T.pale}`, borderRadius: 12, padding: '12px 14px' }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: T.muted }}>Expéditeur utilisé</p>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', lineHeight: 1.2 }}>{res.sms?.expediteur_utilise}</p>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${T.hairline}`, paddingTop: 14 }}>
              <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 800, color: T.ink, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <MessageCircle size={15} color={T.main}/> Envoyer un SMS de test
              </p>
              <p style={{ margin: '0 0 10px', fontSize: 11.5, color: T.muted, lineHeight: 1.6 }}>
                C&rsquo;est le seul vrai moyen de valider l&rsquo;expéditeur : Brevo n&rsquo;expose aucune API pour le vérifier.
                Consomme 1 crédit Brevo (pas un crédit commerçant).
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input value={tel} onChange={e => setTel(e.target.value)} placeholder="0470 12 34 56"
                  style={{ flex: 1, minWidth: 160, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: 'inherit', color: T.ink, outline: 'none' }}/>
                <button onClick={() => tester(true)} disabled={loading || !tel.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 100, border: 'none', background: tel.trim() ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#E5E7EB', color: tel.trim() ? '#fff' : '#9CA3AF', fontWeight: 800, fontSize: 13, cursor: tel.trim() && !loading ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif' }}>
                  <Send size={14}/> {loading ? 'Envoi…' : 'Envoyer'}
                </button>
              </div>

              {res.test_sms && (() => {
                // Cas connu : Brevo bride l'envoi SMS tant qu'un humain de chez
                // eux n'a pas activé le compte, même avec des crédits achetés.
                // Rien à corriger côté Yoppaa, d'où l'explication en clair.
                const err = res.test_sms.erreur || ''
                const pasActive = /not yet activated|sending status/i.test(err)
                return (
                  <div style={{ marginTop: 12, background: res.test_sms.envoye ? '#F0FDF4' : pasActive ? '#FFFBEB' : '#FEF2F2', border: `1px solid ${res.test_sms.envoye ? '#86EFAC' : pasActive ? '#FCD34D' : '#FCA5A5'}`, borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: res.test_sms.envoye ? '#065F46' : pasActive ? '#78350F' : '#991B1B' }}>
                      {res.test_sms.envoye
                        ? `SMS parti vers ${res.test_sms.vers} (expéditeur ${res.test_sms.expediteur})`
                        : pasActive
                          ? 'Brevo n’a pas encore activé l’envoi de SMS sur ton compte'
                          : 'Envoi refusé par Brevo'}
                    </p>
                    {pasActive && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#7C2D12', lineHeight: 1.6 }}>
                        Ce n&rsquo;est pas un problème Yoppaa : tes crédits sont bien là et la clé fonctionne.
                        Brevo valide manuellement l&rsquo;autorisation d&rsquo;envoyer des SMS. Écris à leur support
                        (contact@brevo.com ou le chat de ton compte) en précisant : SMS <strong>transactionnels</strong>,
                        destination <strong>Belgique</strong>, expéditeur <strong>Yoppaa</strong>, et l&rsquo;objet des messages
                        (carte de fidélité d&rsquo;un commerce de quartier). L&rsquo;activation prend en général quelques heures.
                      </p>
                    )}
                    {res.test_sms.erreur && (
                      <p style={{ margin: '6px 0 0', fontSize: 11, color: pasActive ? '#92400E' : '#7F1D1D', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>
                        {res.test_sms.erreur}
                      </p>
                    )}
                  </div>
                )
              })()}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
