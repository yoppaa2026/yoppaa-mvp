'use client'

// L'ÉCRAN QUI FAIT DÉCLARER SUR L'HONNEUR LES COMMERÇANTS DÉJÀ INSCRITS (09/10).
//
// 🔴 LA CARTE D'IDENTITÉ N'EST PLUS DEMANDÉE (décision d'Alex, « socle
// minimal »). Les nouveaux inscrits déclarent à l'inscription ; ceux qui
// étaient là avant le font ici, une fois, à leur prochaine connexion (décision
// d'Alex, tableau). Même chose à chaque nouvelle version (`DECLARATION_VERSION`).
//
// ⚠️ C'EST LE SERVEUR QUI ENREGISTRE (`/api/commercant/declarer`), avec son
// heure, l'adresse IP et le navigateur. L'écran n'écrit rien en base lui-même.
//
// ⚠️ LE TEXTE AFFICHÉ EST CELUI QUI SERA GARDÉ : il vient de `texteDeclaration`,
// et le serveur refuse s'il ne retrouve pas exactement le même.
//
// Une fiche ancienne à qui il manque le numéro ou les noms peut les compléter
// ici ; une fiche qui les a les montre, sans les laisser changer (une
// entreprise vérifiée ne change pas d'identité sans repasser par Yoppaa).

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import DotsAttente from '@/app/components/DotsAttente'
import { validerBCE, formaterBCECompact } from '@/lib/kyb'
import { DECLARATION_VERSION, texteDeclaration } from '@/lib/declaration'

const T = { bg: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', deep: '#2D0F6B', muted: '#5B6170', pale: '#EDE0FF', hairline: '#E4DCF2' }

const champ = {
  width: '100%', padding: '11px 14px', borderRadius: 10, border: `1.5px solid ${T.hairline}`,
  fontSize: 15, fontWeight: 600, color: T.ink, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box',
}
const etiquette = { display: 'block', fontSize: 13, fontWeight: 800, color: T.deep, marginBottom: 6 }

export default function EcranDeclaration({ commercant, onDeclare, onDeconnexion }) {
  const bceFiche = validerBCE(typeof commercant.bce === 'string' ? commercant.bce : '')
  const nomsFiche = (commercant.representant_legal_prenom || '').trim().length >= 2
    && (commercant.representant_legal_nom || '').trim().length >= 2

  const [bce, setBce] = useState(bceFiche.valide ? formaterBCECompact(bceFiche.raw) : '')
  const [prenom, setPrenom] = useState(nomsFiche ? commercant.representant_legal_prenom.trim() : '')
  const [nom, setNom] = useState(nomsFiche ? commercant.representant_legal_nom.trim() : '')
  const [coche, setCoche] = useState(false)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState(null)

  const verifBce = validerBCE(bce)
  const texte = texteDeclaration({ prenom, nom, bce, commerce: commercant.nom })
  const peutEnvoyer = !!texte && coche && !enCours

  async function declarer() {
    if (!peutEnvoyer) return
    setEnCours(true); setErreur(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const r = await fetch('/api/commercant/declarer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ commercant_id: commercant.id, version: DECLARATION_VERSION, texte, bce, prenom, nom }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.ok) {
        setErreur(j?.error || 'La déclaration n’a pas pu être enregistrée. Réessaie.')
        setEnCours(false)
        return
      }
      const { ok: _ok, ...maj } = j
      onDeclare?.(maj)
    } catch {
      setErreur('La déclaration n’a pas pu être enregistrée. Vérifie ta connexion et réessaie.')
      setEnCours(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 1rem', fontFamily: '"DM Sans", sans-serif' }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '1.75rem 1.5rem', maxWidth: 560, width: '100%', border: `1.5px solid ${T.pale}`, boxShadow: `0 8px 32px ${T.main}18` }}>
        <h1 style={{ fontSize: '1.35rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.4px', margin: '0 0 8px' }}>
          Une déclaration, une seule fois
        </h1>
        <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.6, margin: '0 0 14px' }}>
          Yoppaa ne demande plus de carte d’identité. Pour garantir aux habitants que chaque commerce
          est bien tenu par la bonne personne, on te demande à la place une déclaration sur
          l’honneur. Tu ne la fais qu’une fois.
        </p>

        {commercant.carte_supprimee_at && (
          <p role="note" style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 12, padding: '10px 12px', fontSize: 13.5, color: '#065F46', lineHeight: 1.5, margin: '0 0 16px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5"/></svg>
            <span>La photo de carte d’identité que tu nous avais envoyée a été <strong>définitivement supprimée</strong> de nos serveurs.</span>
          </p>
        )}

        <div style={{ display: 'grid', gap: 12, marginBottom: 14 }}>
          <div>
            <label htmlFor="decl-bce" style={etiquette}>Numéro d’entreprise (BCE)</label>
            <input id="decl-bce" type="text" inputMode="numeric" value={bce} onChange={e => setBce(e.target.value)}
              readOnly={bceFiche.valide} placeholder="0123.456.789"
              style={{ ...champ, background: bceFiche.valide ? T.bg : '#fff', borderColor: bce && !verifBce.valide ? '#EF4444' : T.hairline }}/>
            {bce && !verifBce.valide && (
              <p style={{ fontSize: 13, color: '#B91C1C', fontWeight: 600, margin: '4px 0 0' }}>Ce numéro n’est pas valide, vérifie les chiffres.</p>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
            <div>
              <label htmlFor="decl-prenom" style={etiquette}>Prénom du représentant légal</label>
              <input id="decl-prenom" type="text" value={prenom} onChange={e => setPrenom(e.target.value)}
                readOnly={nomsFiche} style={{ ...champ, background: nomsFiche ? T.bg : '#fff' }}/>
            </div>
            <div>
              <label htmlFor="decl-nom" style={etiquette}>Nom</label>
              <input id="decl-nom" type="text" value={nom} onChange={e => setNom(e.target.value)}
                readOnly={nomsFiche} style={{ ...champ, background: nomsFiche ? T.bg : '#fff' }}/>
            </div>
          </div>
          {(bceFiche.valide || nomsFiche) && (
            <p style={{ fontSize: 13, color: T.muted, lineHeight: 1.5, margin: 0 }}>
              Une erreur dans ces informations ? Écris-nous à{' '}
              <a href="mailto:support@yoppaa.app" style={{ color: T.main, fontWeight: 700 }}>support@yoppaa.app</a>
              {' '}avant de déclarer : on la corrige avec toi.
            </p>
          )}
        </div>

        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: texte ? 'pointer' : 'not-allowed', fontSize: 14, color: T.ink, lineHeight: 1.55, marginBottom: 16, padding: '12px 14px', background: T.bg, borderRadius: 12, border: `1px solid ${T.hairline}` }}>
          <input type="checkbox" checked={coche} disabled={!texte} onChange={e => setCoche(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 2, accentColor: T.main, flexShrink: 0, cursor: 'inherit' }}/>
          <span>{texte || 'Complète le numéro d’entreprise et les noms pour lire la déclaration.'}</span>
        </label>

        {erreur && (
          <p role="alert" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 12px', color: '#7F1D1D', fontSize: 13.5, fontWeight: 600, margin: '0 0 14px' }}>
            {erreur}
          </p>
        )}
        <button type="button" onClick={declarer} disabled={!peutEnvoyer}
          style={{ width: '100%', padding: '0.875rem 1.25rem', borderRadius: 100, border: 'none', background: !peutEnvoyer ? `${T.muted}66` : `linear-gradient(135deg, ${T.deep}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 15, cursor: enCours ? 'wait' : !peutEnvoyer ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          Je déclare sur l’honneur
          {enCours && <DotsAttente couleur="#fff" taille={5} label="Enregistrement"/>}
        </button>
        <button type="button" onClick={onDeconnexion}
          style={{ display: 'block', margin: '12px auto 0', background: 'none', border: 'none', color: T.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>
          Me déconnecter
        </button>
      </div>
    </div>
  )
}
