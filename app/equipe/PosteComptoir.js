'use client'
// LE COMPTOIR DU POSTE (équipe, étape 5, 01/10) : tamponner une carte de
// fidélité, encaisser un bon cadeau. La case « Comptoir », décidée par Alex le
// 29/09 (« cases comptoir (bon cadeau, tampon fidélité) : OUI »).
//
// ⚠️ LES MÊMES ROUTES QUE LE PATRON, ET RIEN D'AUTRE :
//   • `/api/fidelite/comptoir`  : chercher la carte d'un numéro, la créer ;
//   • `/api/fidelite/mouvement` : un passage, une cagnotte, une récompense ;
//   • `/api/bons-cadeaux/comptoir` : chercher un bon, le débiter UNE fois.
// Le serveur relit tout (la case, le commerce, la règle de la carte, le solde
// du bon) : cet écran ne calcule rien, il demande et il raconte.
//
// ⚠️ PAS DE SUPPRESSION DE CARTE ICI : elle reste au patron (la route le
// refuse à un membre, de toute façon).

import { useState } from 'react'
import { postPro } from '@/lib/fetch-pro'
import { confirmer } from '@/app/dashboard/PosteConfirmation'
import DotsAttente from '@/app/components/DotsAttente'
import { normaliserTelephone, afficherTelephone, estCagnotte, seuilCagnotte, seuilPassages, libelleRecompense } from '@/lib/fidelite'
import { normaliserCodeBon, libelleBon } from '@/lib/bons-cadeaux'
import { euros } from '@/lib/montants'

const T = { fond: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', panel: '#160636', rouge: '#B91C1C', vert: '#047857', filet: '#E7DEF6' }
const carte = { background: '#fff', borderRadius: 14, border: `1px solid ${T.filet}`, padding: 16, boxSizing: 'border-box' }
const champ = { flex: 1, minWidth: 0, padding: '11px 12px', borderRadius: 10, border: `1px solid ${T.filet}`, fontSize: 16, fontFamily: 'inherit', color: T.ink, background: '#fff' }
const bouton = (plein = true) => ({ padding: '11px 16px', borderRadius: 100, border: `1px solid ${plein ? T.panel : T.filet}`, background: plein ? T.panel : '#fff', color: plein ? '#fff' : T.ink, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' })
const titre = { margin: '0 0 4px', fontSize: 12, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.8px' }

async function appeler(url, corps) {
  const res = await postPro(url, corps)
  if (!res || res.sansSession) return { ok: false, error: 'Ta session a expiré, reconnecte-toi.' }
  if (res.erreurReseau) return { ok: false, error: 'Pas de connexion, réessaie.' }
  return (await res.json().catch(() => null)) || { ok: false, error: `Réponse illisible (${res.status}).` }
}

// La clé d'anti-doublon naît AU CLIC : une requête rejouée porte la même clé,
// et le serveur ne crédite qu'une fois (même règle que le patron).
function cleRequete() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

function Avis({ avis }) {
  if (!avis) return null
  return (
    <p role="status" style={{ margin: '10px 0 0', padding: '9px 11px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, background: avis.ton === 'erreur' ? '#FEE2E2' : '#DCFCE7', color: avis.ton === 'erreur' ? T.rouge : T.vert }}>{avis.texte}</p>
  )
}

// ─── LA CARTE DE FIDÉLITÉ ────────────────────────────────────────────────────
function Fidelite({ commercantId, regle }) {
  const [tel, setTel] = useState('')
  const [carteClient, setCarteClient] = useState(null)
  const [client, setClient] = useState(null)
  const [sansCarte, setSansCarte] = useState(null)   // le numéro sans carte
  const [montant, setMontant] = useState('')
  const [occupe, setOccupe] = useState(null)
  const [avis, setAvis] = useState(null)
  const cagnotte = estCagnotte(regle)
  const nomClient = client ? [client.prenom, client.nom].filter(Boolean).join(' ') : null

  async function chercher() {
    const normalise = normaliserTelephone(tel)
    if (!normalise) { setAvis({ ton: 'erreur', texte: 'Numéro invalide (ex : 0470 12 34 56).' }); return }
    setOccupe('chercher'); setAvis(null); setCarteClient(null); setSansCarte(null); setClient(null)
    const j = await appeler('/api/fidelite/comptoir', { action: 'chercher', commercant_id: commercantId, telephone: normalise })
    setOccupe(null)
    if (!j.ok) { setAvis({ ton: 'erreur', texte: j.error || 'Recherche impossible, réessaie.' }); return }
    setClient(j.client || null)
    if (j.carte) setCarteClient(j.carte)
    else setSansCarte(j.telephone || normalise)
  }

  async function creer() {
    setOccupe('creer'); setAvis(null)
    const j = await appeler('/api/fidelite/comptoir', { action: 'creer', commercant_id: commercantId, telephone: sansCarte })
    setOccupe(null)
    if (!j.ok || !j.carte) { setAvis({ ton: 'erreur', texte: j.error || 'La carte n’a pas pu être créée.' }); return }
    setCarteClient(j.carte); setSansCarte(null); setClient(j.client || null)
    setAvis({ ton: 'ok', texte: 'Carte créée.' })
  }

  async function crediter() {
    const m = cagnotte ? parseFloat(String(montant).replace(',', '.')) || 0 : null
    if (cagnotte && !(m > 0)) { setAvis({ ton: 'erreur', texte: 'Indique le montant de l’achat.' }); return }
    setOccupe('crediter'); setAvis(null)
    const j = await appeler('/api/fidelite/mouvement', { action: 'crediter', commercant_id: commercantId, carte_id: carteClient.id, cle: cleRequete(), ...(cagnotte ? { montant: m } : {}) })
    setOccupe(null)
    if (!j.ok) { setAvis({ ton: 'erreur', texte: j.error || 'Le tampon n’a pas pu être noté.' }); return }
    setCarteClient(j.carte); setMontant('')
    setAvis({ ton: 'ok', texte: j.deja ? 'Déjà enregistré.' : j.debloquees > 0 ? `Carte pleine ! ${libelleRecompense(regle)}` : 'C’est noté.' })
  }

  async function utiliser() {
    const choix = await confirmer({
      titre: 'Utiliser la récompense maintenant ?',
      details: libelleRecompense(regle),
      actions: [
        { valeur: 'oui', ton: 'principal', label: 'Oui, utiliser la récompense' },
        { valeur: 'rien', ton: 'neutre', label: 'Pas maintenant' },
      ],
    })
    if (choix !== 'oui') return
    setOccupe('utiliser'); setAvis(null)
    const j = await appeler('/api/fidelite/mouvement', { action: 'utiliser_recompense', commercant_id: commercantId, carte_id: carteClient.id, cle: cleRequete() })
    setOccupe(null)
    if (!j.ok) { setAvis({ ton: 'erreur', texte: j.error || 'La récompense n’a pas pu être utilisée.' }); return }
    setCarteClient(j.carte)
    setAvis({ ton: 'ok', texte: j.deja ? 'Déjà enregistré.' : 'Récompense utilisée.' })
  }

  const dispo = Number(carteClient?.recompenses_disponibles || 0)
  return (
    <div style={carte}>
      <p style={titre}>Carte de fidélité</p>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
        Le client donne son numéro de GSM, tu le tapes. Pas encore de carte ? Elle se crée en un geste.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="tel" inputMode="tel" placeholder="0470 12 34 56" value={tel} style={champ}
          onChange={e => setTel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') chercher() }}/>
        <button type="button" disabled={!!occupe} onClick={chercher} style={bouton()}>
          {occupe === 'chercher' ? <DotsAttente couleur="#fff" label="Recherche"/> : 'Chercher'}
        </button>
      </div>

      {sansCarte && (
        <div style={{ marginTop: 12, background: T.fond, borderRadius: 12, padding: '12px 14px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: T.ink }}>Aucune carte pour {afficherTelephone(sansCarte)}.</p>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: T.muted, lineHeight: 1.5 }}>
            {nomClient
              ? <>C&rsquo;est le numéro de <strong style={{ color: T.main }}>{nomClient}</strong>, déjà inscrit sur Yoppaa : sa carte sera reliée à son compte.</>
              : 'Ce numéro n’a pas encore de compte Yoppaa : la carte fonctionne quand même, il la retrouvera à son inscription.'}
          </p>
          <button type="button" disabled={!!occupe} onClick={creer} style={bouton()}>
            {occupe === 'creer' ? <DotsAttente couleur="#fff" label="Création"/> : 'Créer sa carte'}
          </button>
        </div>
      )}

      {carteClient && (
        <div style={{ marginTop: 12, border: `1.5px solid ${T.pale}`, borderRadius: 12, padding: '12px 14px' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.ink }}>
            {nomClient || afficherTelephone(carteClient.telephone)}
            {nomClient && <span style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginLeft: 8 }}>{afficherTelephone(carteClient.telephone)}</span>}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: T.ink }}>
            {cagnotte
              ? <>Cagnotte : <strong>{euros(Number(carteClient.cagnotte || 0))}</strong> sur {euros(seuilCagnotte(regle))}</>
              : <>Passages : <strong>{Number(carteClient.passages || 0)}</strong> sur {seuilPassages(regle)}</>}
          </p>
          {dispo > 0 && (
            <div style={{ marginTop: 10, background: '#F0FDF4', border: '1.5px solid #10B98144', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: T.vert }}>
                {dispo > 1 ? `${dispo} récompenses disponibles` : 'Récompense disponible'} : {libelleRecompense(regle)}
              </span>
              <button type="button" disabled={!!occupe} onClick={utiliser} style={{ ...bouton(), background: '#10B981', borderColor: '#10B981' }}>
                {occupe === 'utiliser' ? <DotsAttente couleur="#fff" label="Enregistrement"/> : 'Utiliser maintenant'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {cagnotte && (
              <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Montant (€)" value={montant} style={{ ...champ, maxWidth: 160 }}
                onChange={e => setMontant(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') crediter() }}/>
            )}
            <button type="button" disabled={!!occupe} onClick={crediter} style={bouton()}>
              {occupe === 'crediter' ? <DotsAttente couleur="#fff" label="Enregistrement"/> : cagnotte ? 'Créditer la cagnotte' : '+1 passage'}
            </button>
          </div>
        </div>
      )}
      <Avis avis={avis}/>
    </div>
  )
}

// ─── LE BON CADEAU ───────────────────────────────────────────────────────────
function BonCadeau({ commercantId, categorie }) {
  const [code, setCode] = useState('')
  const [bon, setBon] = useState(null)
  const [montant, setMontant] = useState('')
  const [occupe, setOccupe] = useState(null)
  const [avis, setAvis] = useState(null)
  const nom = libelleBon(categorie)

  async function chercher() {
    if (!normaliserCodeBon(code)) { setAvis({ ton: 'erreur', texte: 'Format attendu : BC-XXXX-XXXX' }); return }
    setOccupe('chercher'); setAvis(null); setBon(null)
    const j = await appeler('/api/bons-cadeaux/comptoir', { action: 'chercher', commercant_id: commercantId, code })
    setOccupe(null)
    if (!j.ok) { setAvis({ ton: 'erreur', texte: j.error || 'Recherche impossible, réessaie.' }); return }
    setBon(j.bon); setMontant('')
  }

  async function debiter() {
    const m = Math.round((parseFloat(String(montant).replace(',', '.')) || 0) * 100) / 100
    if (!(m > 0)) { setAvis({ ton: 'erreur', texte: 'Indique le montant de l’achat à déduire.' }); return }
    if (m > Number(bon.solde)) { setAvis({ ton: 'erreur', texte: `Le solde du bon est de ${euros(Number(bon.solde))}.` }); return }
    setOccupe('debiter'); setAvis(null)
    const j = await appeler('/api/bons-cadeaux/comptoir', { action: 'debiter', commercant_id: commercantId, bon_id: bon.id, montant: m })
    setOccupe(null)
    if (!j.ok) { setAvis({ ton: 'erreur', texte: j.error || 'Le bon n’a pas pu être débité.' }); return }
    setBon(j.bon); setMontant('')
    const reste = Number(j.bon.solde)
    setAvis({ ton: 'ok', texte: reste > 0 ? `−${euros(m)} : il reste ${euros(reste)} sur le bon.` : 'Bon entièrement utilisé.' })
  }

  return (
    <div style={carte}>
      <p style={titre}>{nom.charAt(0).toUpperCase() + nom.slice(1)}</p>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
        Le client montre son code. Tu retires le montant de son achat ; le reste reste sur le bon pour la prochaine fois.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" autoCapitalize="characters" placeholder="BC-XXXX-XXXX" value={code} style={champ}
          onChange={e => setCode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') chercher() }}/>
        <button type="button" disabled={!!occupe} onClick={chercher} style={bouton()}>
          {occupe === 'chercher' ? <DotsAttente couleur="#fff" label="Recherche"/> : 'Chercher'}
        </button>
      </div>
      {bon && (
        <div style={{ marginTop: 12, border: `1.5px solid ${T.pale}`, borderRadius: 12, padding: '12px 14px' }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.ink }}>{bon.code}</p>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: T.ink }}>
            Solde : <strong>{euros(Number(bon.solde))}</strong> sur {euros(Number(bon.montant_initial))}
            {bon.expires_at && <span style={{ color: T.muted }}> · valable jusqu&rsquo;au {new Date(bon.expires_at).toLocaleDateString('fr-BE')}</span>}
          </p>
          {(bon.beneficiaire_prenom || bon.acheteur_prenom) && (
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>
              {bon.beneficiaire_prenom ? `Pour ${bon.beneficiaire_prenom}` : ''}{bon.beneficiaire_prenom && bon.acheteur_prenom ? ', ' : ''}{bon.acheteur_prenom ? `offert par ${bon.acheteur_prenom}` : ''}
            </p>
          )}
          {Number(bon.solde) > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Montant (€)" value={montant} style={{ ...champ, maxWidth: 160 }}
                onChange={e => setMontant(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') debiter() }}/>
              <button type="button" disabled={!!occupe} onClick={debiter} style={bouton()}>
                {occupe === 'debiter' ? <DotsAttente couleur="#fff" label="Enregistrement"/> : 'Déduire du bon'}
              </button>
            </div>
          )}
        </div>
      )}
      <Avis avis={avis}/>
    </div>
  )
}

export default function PosteComptoir({ commercantId, comptoir = {} }) {
  const fidelite = comptoir.fidelite_actif === true
  const bons = comptoir.bons_cadeaux_actif === true
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {fidelite && <Fidelite commercantId={commercantId} regle={comptoir}/>}
      {bons && <BonCadeau commercantId={commercantId} categorie={comptoir.categorie}/>}
      {!fidelite && !bons && (
        <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>Ce commerce n&rsquo;a activé ni la fidélité ni les bons cadeaux : rien à faire ici pour le moment.</p>
      )}
    </div>
  )
}
