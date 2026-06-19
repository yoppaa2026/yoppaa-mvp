'use client'
// Section admin : commercants avec kyb_statut='en_attente' a valider/rejeter.
// Pour chaque dossier :
//   - Identite du commercant (nom, type, plan)
//   - Numero BCE (format valide)
//   - Nom + prenom du representant legal
//   - 2 liens vers les fichiers ID (URL signees 1h via Supabase Storage)
//   - Boutons "Valider" (POST /api/admin/kyb/valider)
//   - Bouton "Rejeter" (modal motif obligatoire >= 10 cars)
//
// Refresh apres chaque action. Le composant gere son propre state local.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Shield, IdCard, CheckCircle, AlertTriangle, Download, RefreshCw } from 'lucide-react'
import { formaterBCECompact } from '@/lib/kyb'

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

export default function SectionKYBAValider({ toast }) {
  const [session, setSession] = useState(null)
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionEnCours, setActionEnCours] = useState(null)
  const [rejetEnCours, setRejetEnCours] = useState(null)
  const [motifRejet, setMotifRejet] = useState('')

  // Charge la session pour avoir le token JWT a passer aux routes API
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => setSession(s))
  }, [])

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('commercants')
      .select(`
        id, nom, type, plan, email,
        bce, representant_legal_nom, representant_legal_prenom,
        kyb_id_recto_url, kyb_id_verso_url, kyb_statut, kyb_motif_rejet,
        created_at
      `)
      .eq('kyb_statut', 'en_attente')
      .order('created_at', { ascending: true })
    setDossiers(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  async function valider(commercant_id) {
    if (!session) { toast?.('Session expiree', 'error'); return }
    if (!confirm('Valider ce KYB ? Le commercant pourra etre publie quand sa fiche sera aussi validee.')) return
    setActionEnCours(commercant_id)
    try {
      const res = await fetch('/api/admin/kyb/valider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erreur inconnue')
      toast?.(`KYB valide. Email : ${json.email}`, 'success')
      await charger()
    } catch (e) {
      toast?.(`Erreur : ${e.message}`, 'error')
    }
    setActionEnCours(null)
  }

  function ouvrirRejet(dossier) {
    setRejetEnCours(dossier)
    setMotifRejet('')
  }

  async function confirmerRejet() {
    if (!motifRejet.trim() || motifRejet.trim().length < 10) {
      toast?.('Motif min 10 caracteres', 'error')
      return
    }
    const commercant_id = rejetEnCours.id
    setActionEnCours(commercant_id)
    try {
      const res = await fetch('/api/admin/kyb/rejeter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id, motif: motifRejet.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erreur inconnue')
      toast?.(`KYB rejete. Email : ${json.email}`, 'success')
      setRejetEnCours(null)
      setMotifRejet('')
      await charger()
    } catch (e) {
      toast?.(`Erreur : ${e.message}`, 'error')
    }
    setActionEnCours(null)
  }

  return (
    <section style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 22, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Shield size={20} strokeWidth={2.2} color={T.main}/>
          KYB en attente <span style={{ color: T.main, marginLeft: 6 }}>· {dossiers.length}</span>
        </h2>
        <button onClick={charger}
          style={{ background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <RefreshCw size={11} strokeWidth={2.2}/> Rafraichir
        </button>
      </div>

      {loading && <p style={{ color: T.muted, textAlign: 'center', padding: 20 }}>Chargement…</p>}

      {!loading && dossiers.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 14, padding: '24px 20px', textAlign: 'center', border: `1px solid ${T.hairline}` }}>
          <CheckCircle size={32} strokeWidth={1.6} color="#10B981" style={{ margin: '0 auto 8px', display: 'block' }}/>
          <p style={{ color: T.muted, margin: 0, fontWeight: 600 }}>Aucun KYB en attente.</p>
        </div>
      )}

      <div style={{ display: 'grid', gap: 14 }}>
        {dossiers.map(d => (
          <CarteKYB key={d.id}
            dossier={d}
            onValider={() => valider(d.id)}
            onRejeter={() => ouvrirRejet(d)}
            disabled={actionEnCours === d.id}
          />
        ))}
      </div>

      {/* Modal rejet */}
      {rejetEnCours && (
        <div onClick={() => !actionEnCours && setRejetEnCours(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.7px', margin: '0 0 6px' }}>Rejet KYB</p>
            <h3 style={{ fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', margin: '0 0 16px' }}>
              {rejetEnCours.nom}
            </h3>
            <label style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
              Motif (visible par le commercant)
            </label>
            <textarea value={motifRejet} onChange={e => setMotifRejet(e.target.value)}
              rows={5}
              placeholder="Ex: La carte d'identite recto est floue, impossible de lire le nom. Merci de re-uploader une photo nette."
              style={{ width: '100%', padding: 12, borderRadius: 10, border: `1.5px solid ${T.hairline}`, fontSize: 14, fontFamily: '"DM Sans", sans-serif', color: T.ink, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 4 }}/>
            <p style={{ fontSize: 11, color: motifRejet.length < 10 ? '#DC2626' : T.muted, fontWeight: 600, margin: '0 0 16px' }}>
              {motifRejet.length} / 10 caracteres minimum
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setRejetEnCours(null); setMotifRejet('') }}
                disabled={actionEnCours}
                style={{ flex: 1, padding: '11px 18px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 14, cursor: actionEnCours ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                Annuler
              </button>
              <button onClick={confirmerRejet}
                disabled={actionEnCours || motifRejet.trim().length < 10}
                style={{ flex: 1, padding: '11px 18px', borderRadius: 100, border: 'none', background: motifRejet.trim().length < 10 ? '#FCA5A5' : '#DC2626', color: '#fff', fontWeight: 800, fontSize: 14, cursor: actionEnCours || motifRejet.trim().length < 10 ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                {actionEnCours ? 'Envoi…' : 'Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function CarteKYB({ dossier, onValider, onRejeter, disabled }) {
  const bceFormate = dossier.bce ? `BE ${formaterBCECompact(dossier.bce)}` : '—'
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: 18, border: `1px solid ${T.hairline}` }}>
      {/* En-tete */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 900, color: T.ink, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            {dossier.nom}
          </p>
          <p style={{ fontSize: 12, color: T.muted, margin: 0, fontWeight: 600 }}>
            {dossier.type} · plan {dossier.plan} · {dossier.email}
          </p>
        </div>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#92400E', background: '#FEF3C7', padding: '4px 10px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px', flexShrink: 0 }}>
          en attente
        </span>
      </div>

      {/* Identite entreprise */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, marginBottom: 12, fontSize: 13, padding: 12, background: T.bg, borderRadius: 10 }}>
        <span style={{ fontWeight: 700, color: T.muted }}>BCE :</span>
        <span style={{ fontWeight: 700, color: T.deep, fontFamily: 'ui-monospace, Menlo, monospace' }}>{bceFormate}</span>
        <span style={{ fontWeight: 700, color: T.muted }}>Representant legal :</span>
        <span style={{ fontWeight: 700, color: T.deep }}>{dossier.representant_legal_prenom} {dossier.representant_legal_nom}</span>
      </div>

      {/* Liens fichiers ID (URL signees 1h) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <FichierID label="Carte ID recto" path={dossier.kyb_id_recto_url}/>
        <FichierID label="Carte ID verso" path={dossier.kyb_id_verso_url}/>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onRejeter} disabled={disabled}
          style={{ flex: 1, padding: '11px 16px', borderRadius: 100, border: `1.5px solid #DC2626`, background: '#fff', color: '#DC2626', fontWeight: 800, fontSize: 14, cursor: disabled ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          Rejeter
        </button>
        <button onClick={onValider} disabled={disabled}
          style={{ flex: 1, padding: '11px 16px', borderRadius: 100, border: 'none', background: '#10B981', color: '#fff', fontWeight: 800, fontSize: 14, cursor: disabled ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {disabled ? 'En cours…' : (<><CheckCircle size={14} strokeWidth={2.4}/>Valider KYB</>)}
        </button>
      </div>
    </div>
  )
}

function FichierID({ label, path }) {
  const [signedUrl, setSignedUrl] = useState(null)
  const [chargement, setChargement] = useState(false)
  const [erreur, setErreur] = useState(null)

  async function ouvrir() {
    if (signedUrl) { window.open(signedUrl, '_blank'); return }
    if (!path) { setErreur('chemin manquant'); return }
    setChargement(true)
    const { data, error } = await supabase.storage.from('kyb_documents').createSignedUrl(path, 3600)
    setChargement(false)
    if (error || !data?.signedUrl) {
      setErreur(error?.message || 'URL signee impossible')
      return
    }
    setSignedUrl(data.signedUrl)
    window.open(data.signedUrl, '_blank')
  }

  if (!path) {
    return (
      <div style={{ padding: 10, borderRadius: 10, border: `1.5px dashed ${T.hairline}`, background: '#FAFAFA', textAlign: 'center' }}>
        <AlertTriangle size={16} strokeWidth={2} color="#EF4444" style={{ margin: '0 auto 4px', display: 'block' }}/>
        <p style={{ fontSize: 11, fontWeight: 700, color: T.muted, margin: 0 }}>{label}</p>
        <p style={{ fontSize: 10, color: '#EF4444', margin: '2px 0 0', fontWeight: 600 }}>Manquant</p>
      </div>
    )
  }

  return (
    <button type="button" onClick={ouvrir} disabled={chargement}
      style={{ padding: 10, borderRadius: 10, border: `1.5px solid ${T.hairline}`, background: '#fff', cursor: chargement ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <IdCard size={20} strokeWidth={1.8} color={T.main}/>
      <p style={{ fontSize: 11, fontWeight: 700, color: T.deep, margin: 0 }}>{label}</p>
      <span style={{ fontSize: 10, color: T.main, margin: 0, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <Download size={10} strokeWidth={2.4}/> {chargement ? '…' : 'Voir'}
      </span>
      {erreur && <p style={{ fontSize: 9, color: '#EF4444', margin: 0 }}>{erreur}</p>}
    </button>
  )
}
