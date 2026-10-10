'use client'
// Section admin : commercants avec kyb_statut='en_attente' a valider/rejeter.
// Pour chaque dossier :
//   - Identite du commercant (nom, type, plan)
//   - Numero BCE, avec le lien vers sa fiche au registre public (KBO)
//   - Nom + prenom du representant legal
//   - La declaration sur l'honneur (faite ou non, et quand)
//   - Boutons "Valider" (POST /api/admin/kyb/valider)
//   - Bouton "Rejeter" (modal motif obligatoire >= 10 cars)
//
// 🔴 PLUS DE CARTE D'IDENTITÉ (Alex, 09/10, « socle minimal »). Ce qu'on
// vérifie ici : que le numéro existe au registre, que l'entreprise y est
// ACTIVE, que son nom correspond au commerce, et que le représentant déclaré
// y figure (titulaire ou administrateur). Le lien ouvre la fiche officielle.
//
// Refresh apres chaque action. Le composant gere son propre state local.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Shield, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { formaterBCECompact } from '@/lib/kyb'
import { lienFicheBCE, DECLARATION_VERSION } from '@/lib/declaration'
import DotsAttente from '@/app/components/DotsAttente'

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

// 🔴 LE JETON SE RELIT AU MOMENT DE L'APPEL (10/10) : gardé depuis l'ouverture,
// il périme au bout d'une heure, et la page principale avait le même défaut
// AVANT le code à six chiffres (jeton sans double authentification, refusé).
async function jetonActuel() {
  const { data: { session: s } } = await supabase.auth.getSession()
  return s?.access_token || null
}

export default function SectionKYBAValider({ toast }) {
  const [dossiers, setDossiers] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionEnCours, setActionEnCours] = useState(null)
  const [rejetEnCours, setRejetEnCours] = useState(null)
  const [motifRejet, setMotifRejet] = useState('')

  const charger = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('commercants')
      .select(`
        id, nom, type, plan, email,
        bce, representant_legal_nom, representant_legal_prenom,
        declaration_version, declaration_acceptee_at, kyb_statut, kyb_motif_rejet,
        created_at
      `)
      .eq('kyb_statut', 'en_attente')
      .order('created_at', { ascending: true })
    setDossiers(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  async function valider(commercant_id) {
    if (!confirm('Valider ce KYB ? Le commercant pourra etre publie quand sa fiche sera aussi validee.')) return
    const jeton = await jetonActuel()
    if (!jeton) { toast?.('Session expirée, reconnecte-toi', 'error'); return }
    setActionEnCours(commercant_id)
    try {
      const res = await fetch('/api/admin/kyb/valider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ commercant_id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erreur inconnue')
      toast?.(`KYB valide. Email : ${json.email}. Journal : ${json.journal}`, json.journal === 'ecrit' ? 'success' : 'error')
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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await jetonActuel() || ''}` },
        body: JSON.stringify({ commercant_id, motif: motifRejet.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error || 'Erreur inconnue')
      toast?.(`KYB rejete. Email : ${json.email}. Journal : ${json.journal}`, json.journal === 'ecrit' ? 'success' : 'error')
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
              placeholder="Ex : ce numéro d'entreprise est radié au registre. Vérifie le numéro de ton entreprise active, puis renvoie ton dossier."
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
  const bceFormate = dossier.bce ? `BE ${formaterBCECompact(dossier.bce)}` : 'manquant'
  const lienRegistre = lienFicheBCE(dossier.bce)
  // ⚠️ LA VERSION EN VIGUEUR, PAS SEULEMENT « UNE » DÉCLARATION : la route
  // de validation refuse un dossier sans elle, l'écran le dit avant le clic.
  const declare = dossier.declaration_version === DECLARATION_VERSION
  const dateDeclaration = dossier.declaration_acceptee_at
    ? new Date(dossier.declaration_acceptee_at).toLocaleString('fr-BE', { timeZone: 'Europe/Brussels', dateStyle: 'long', timeStyle: 'short' })
    : null
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

      {/* Le registre public : c'est LÀ que se fait la vérification */}
      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {lienRegistre ? (
          <a href={lienRegistre} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${T.main}`, color: T.main, fontWeight: 800, fontSize: 14, textDecoration: 'none' }}>
            Ouvrir la fiche au registre des entreprises (KBO)
          </a>
        ) : (
          <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, padding: 10, borderRadius: 10, background: '#FEF2F2', color: '#991B1B', fontSize: 13, fontWeight: 700 }}>
            <AlertTriangle size={15} strokeWidth={2.2}/> Numéro d&apos;entreprise absent ou invalide : à rejeter.
          </p>
        )}
        <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
          À vérifier sur la fiche : l&apos;entreprise est <strong>active</strong>, son nom ou sa dénomination
          correspond au commerce, et la personne déclarée y figure comme titulaire ou administrateur.
        </p>
        <p style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 0, padding: 10, borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: declare ? '#ECFDF5' : '#FEF2F2', color: declare ? '#065F46' : '#991B1B' }}>
          {declare
            ? (<><CheckCircle size={15} strokeWidth={2.2}/> Déclaration sur l&apos;honneur faite le {dateDeclaration}</>)
            : (<><AlertTriangle size={15} strokeWidth={2.2}/> Pas de déclaration sur l&apos;honneur : rejette en lui demandant de renvoyer son dossier.</>)}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onRejeter} disabled={disabled}
          style={{ flex: 1, padding: '11px 16px', borderRadius: 100, border: `1.5px solid #DC2626`, background: '#fff', color: '#DC2626', fontWeight: 800, fontSize: 14, cursor: disabled ? 'wait' : 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          Rejeter
        </button>
        <button onClick={onValider} disabled={disabled || !declare}
          style={{ flex: 1, padding: '11px 16px', borderRadius: 100, border: 'none', background: declare ? '#10B981' : '#A7F3D0', color: '#fff', fontWeight: 800, fontSize: 14, cursor: disabled ? 'wait' : !declare ? 'not-allowed' : 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {disabled ? (<>En cours <DotsAttente couleur="#fff" taille={4} label="Validation"/></>) : (<><CheckCircle size={14} strokeWidth={2.4}/>Valider KYB</>)}
        </button>
      </div>
    </div>
  )
}

