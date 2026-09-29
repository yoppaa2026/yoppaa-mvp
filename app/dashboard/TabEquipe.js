'use client'
// ─── MON ÉQUIPE : le patron invite, règle les cases, retire (29/09) ──────────
//
// « Un accès limité pour le personnel : l'agenda, les rendez-vous, les
// réservations de table, pas le reste. » Et les livreurs par le même chemin.
//
// ⚠️ CET ÉCRAN NE DÉCIDE RIEN. Il montre, et il envoie : le forfait, le
// plafond, les cases permises et l'adresse se revérifient dans les routes
// `/api/equipe/…` (règles : `lib/equipe.js`). Un bouton caché ici n'est pas
// une protection, c'est une politesse.

import { useEffect, useState, useCallback } from 'react'
import { Users, Mail, Trash2, Clock, Check } from 'lucide-react'
import { postPro } from '@/lib/fetch-pro'
import { confirmer } from './PosteConfirmation'
import DotsAttente from '@/app/components/DotsAttente'
import { DROITS, EQUIPE_MAX, LIBELLES_ETAT, libelleFinAcces, refusDroits, droitsDepuis } from '@/lib/equipe'

const T = {
  main: '#6B35C4', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280',
  hairline: '#EEE9F5', panel: '#160636', rouge: '#B91C1C', vert: '#047857',
}
const carte = { background: '#fff', borderRadius: 14, padding: 20, marginBottom: 12, border: `1px solid ${T.hairline}`, boxSizing: 'border-box', maxWidth: '100%', overflowWrap: 'anywhere' }
const champ = { width: '100%', maxWidth: 420, padding: '10px 14px', borderRadius: 10, border: `1px solid ${T.hairline}`, fontSize: 14, color: T.ink, background: '#fff', boxSizing: 'border-box', fontFamily: '"DM Sans", sans-serif' }
const etiquette = { display: 'block', fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, letterSpacing: '0.5px', textTransform: 'uppercase' }
const bouton = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', fontWeight: 700, fontSize: 13 }
const principal = { ...bouton, background: T.panel, color: '#fff' }
const discret = { ...bouton, background: '#fff', color: T.panel, border: `1px solid ${T.hairline}` }

const CASES_VIDES = Object.fromEntries(DROITS.map(d => [d.cle, false]))

// La valeur d'un champ `datetime-local` pour une date ISO, dans l'heure du
// navigateur (celle du commerçant).
function versChampDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
// Et l'inverse : le champ est en heure locale, le serveur reçoit un instant.
function depuisChampDate(valeur) {
  if (!valeur) return null
  const d = new Date(valeur)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

// Lit la réponse d'une route de l'équipe, et dit toujours quelque chose.
async function lire(reponse) {
  if (!reponse || reponse.sansSession) return { ok: false, error: 'Ta session a expiré, reconnecte-toi.' }
  if (reponse.erreurReseau) return { ok: false, error: 'Pas de connexion, réessaie.' }
  const j = await reponse.json().catch(() => null)
  if (!j) return { ok: false, error: `Réponse illisible (${reponse.status}).` }
  return j
}

function Cases({ valeur, onChange, desactive = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {DROITS.map(d => (
        <label key={d.cle} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: desactive ? 'default' : 'pointer', padding: '8px 10px', borderRadius: 10, background: valeur[d.cle] ? T.pale : '#FAFAFD', border: `1px solid ${valeur[d.cle] ? T.main + '33' : T.hairline}` }}>
          <input type="checkbox" checked={!!valeur[d.cle]} disabled={desactive}
            onChange={e => onChange({ ...valeur, [d.cle]: e.target.checked })}
            style={{ marginTop: 3, accentColor: T.main }}/>
          <span>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: T.ink }}>{d.label}</span>
            <span style={{ display: 'block', fontSize: 12, color: T.muted, lineHeight: 1.45 }}>{d.aide}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

// La même phrase que le serveur, calculée avant l'envoi : le commerçant la lit
// sans attendre un aller-retour. Le serveur la recalcule de toute façon.
function refusDesCases(cases) {
  return refusDroits(droitsDepuis(cases))
}

function FinAcces({ actif, valeur, onActif, onValeur }) {
  return (
    <div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: T.ink, cursor: 'pointer' }}>
        <input type="checkbox" checked={actif} onChange={e => onActif(e.target.checked)} style={{ accentColor: T.main }}/>
        Accès limité dans le temps
      </label>
      <p style={{ margin: '4px 0 0 24px', fontSize: 12, color: T.muted, lineHeight: 1.45 }}>
        Pour un extra ou un livreur d&rsquo;un soir : l&rsquo;accès se coupe tout seul à cette date.
      </p>
      {actif && (
        <input type="datetime-local" value={valeur} onChange={e => onValeur(e.target.value)}
          style={{ ...champ, marginTop: 8, maxWidth: 260 }}/>
      )}
    </div>
  )
}

export default function TabEquipe({ commercantId, toast }) {
  const [etat, setEtat] = useState({ charge: false, erreur: null, membres: [], disponible: false })
  const [enCours, setEnCours] = useState(null)   // ce qui travaille : 'inviter', 'retirer:<id>'…

  // Formulaire d'invitation
  const [prenom, setPrenom] = useState('')
  const [email, setEmail] = useState('')
  const [cases, setCases] = useState(CASES_VIDES)
  const [finActive, setFinActive] = useState(false)
  const [fin, setFin] = useState('')

  // Modification d'une personne
  const [edition, setEdition] = useState(null)   // { id, cases, finActive, fin }

  const charger = useCallback(async () => {
    const j = await lire(await postPro('/api/equipe/membres', { commercant_id: commercantId }))
    if (!j.ok) { setEtat(e => ({ ...e, charge: true, erreur: j.error || 'Équipe illisible.' })); return }
    setEtat({ charge: true, erreur: null, membres: j.membres || [], disponible: !!j.disponible })
  }, [commercantId])

  useEffect(() => { charger() }, [charger])

  async function inviter() {
    if (enCours) return
    const refus = refusDesCases(cases)
    if (refus) { toast(refus, 'error'); return }
    if (finActive && !fin) { toast('Choisis la date de fin, ou décoche « Accès limité ».', 'error'); return }
    setEnCours('inviter')
    try {
      const j = await lire(await postPro('/api/equipe/inviter', {
        commercant_id: commercantId, prenom, email, droits: cases,
        expire_le: finActive ? depuisChampDate(fin) : null,
      }))
      if (!j.ok) { toast(j.error || 'Invitation impossible.', 'error'); return }
      toast(j.email_parti
        ? `Invitation envoyée à ${j.membre.email} 🟣`
        : `Invitation enregistrée, mais l’email n’est pas parti. Clique sur « Renvoyer ».`, j.email_parti ? 'success' : 'error')
      setPrenom(''); setEmail(''); setCases(CASES_VIDES); setFinActive(false); setFin('')
      await charger()
    } finally {
      setEnCours(null)
    }
  }

  async function enregistrer() {
    if (enCours || !edition) return
    const refus = refusDesCases(edition.cases)
    if (refus) { toast(refus, 'error'); return }
    if (edition.finActive && !edition.fin) { toast('Choisis la date de fin, ou décoche « Accès limité ».', 'error'); return }
    setEnCours(`modifier:${edition.id}`)
    try {
      const j = await lire(await postPro('/api/equipe/modifier', {
        commercant_id: commercantId, membre_id: edition.id, droits: edition.cases,
        expire_le: edition.finActive ? depuisChampDate(edition.fin) : null,
      }))
      if (!j.ok) { toast(j.error || 'Modification impossible.', 'error'); return }
      toast('Accès mis à jour')
      setEdition(null)
      await charger()
    } finally {
      setEnCours(null)
    }
  }

  async function renvoyer(m) {
    if (enCours) return
    setEnCours(`renvoyer:${m.id}`)
    try {
      const j = await lire(await postPro('/api/equipe/renvoyer', { commercant_id: commercantId, membre_id: m.id }))
      if (!j.ok) { toast(j.error || 'Renvoi impossible.', 'error'); return }
      toast(j.email_parti ? `Nouvelle invitation envoyée à ${m.email}` : 'Invitation renouvelée, mais l’email n’est pas parti.', j.email_parti ? 'success' : 'error')
      await charger()
    } finally {
      setEnCours(null)
    }
  }

  async function retirer(m) {
    if (enCours) return
    const choix = await confirmer({
      titre: `Retirer ${m.prenom} de ton équipe ?`,
      message: m.etat === 'invite' || m.etat === 'invitation_expiree'
        ? 'Son invitation ne fonctionnera plus.'
        : 'Son accès se coupe tout de suite. Ce que cette personne a déjà fait reste dans le journal.',
      actions: [
        { valeur: 'retirer', label: `Retirer ${m.prenom}`, ton: 'danger' },
        { valeur: 'rien', label: 'Garder cet accès', ton: 'neutre' },
      ],
    })
    if (choix !== 'retirer') return
    setEnCours(`retirer:${m.id}`)
    try {
      const j = await lire(await postPro('/api/equipe/retirer', { commercant_id: commercantId, membre_id: m.id }))
      if (!j.ok) { toast(j.error || 'Retrait impossible.', 'error'); return }
      toast(`${m.prenom} ne fait plus partie de ton équipe`)
      if (edition?.id === m.id) setEdition(null)
      await charger()
    } finally {
      setEnCours(null)
    }
  }

  if (!etat.charge) {
    return <div style={{ ...carte, display: 'flex', justifyContent: 'center' }}><DotsAttente couleur={T.main} label="Chargement de ton équipe"/></div>
  }
  if (etat.erreur) {
    return (
      <div style={carte}>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: T.rouge, fontWeight: 700 }}>{etat.erreur}</p>
        <button type="button" style={discret} onClick={() => { setEtat(e => ({ ...e, charge: false })); charger() }}>Réessayer</button>
      </div>
    )
  }

  const enPlace = etat.membres
  const complet = enPlace.length >= EQUIPE_MAX

  return (
    <div>
      <div style={carte}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: T.ink, letterSpacing: '-0.5px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={18} strokeWidth={2}/> Mon équipe
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.55 }}>
          Ton personnel et tes livreurs se connectent avec leur propre compte, et ne voient que ce que tu coches. Ton mot de passe reste à toi.
        </p>
      </div>

      {!etat.disponible && (
        <div style={{ ...carte, background: '#FEF3C7', border: '1.5px solid #F59E0B33' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400E', fontWeight: 700, lineHeight: 1.5 }}>
            L&rsquo;équipe fait partie de la formule Vendre. Les accès ci-dessous restent visibles, mais ils sont coupés tant que ton commerce n&rsquo;est pas en Vendre.
          </p>
        </div>
      )}

      {/* ── Les personnes ── */}
      <div style={carte}>
        <p style={{ ...etiquette, marginBottom: 12 }}>Ton équipe · {enPlace.length} / {EQUIPE_MAX}</p>
        {enPlace.length === 0 && (
          <p style={{ margin: 0, fontSize: 13, color: T.muted }}>Personne pour l&rsquo;instant. Invite quelqu&rsquo;un juste en dessous.</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {enPlace.map(m => {
            const enEdition = edition?.id === m.id
            const attente = m.etat === 'invite' || m.etat === 'invitation_expiree'
            const couleurEtat = m.etat === 'actif' ? T.vert : (m.etat === 'invite' ? T.main : T.rouge)
            return (
              <div key={m.id} style={{ border: `1px solid ${enEdition ? T.panel : T.hairline}`, borderRadius: 12, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: T.ink }}>{m.prenom}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>{m.email}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: couleurEtat, background: couleurEtat + '14', padding: '3px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>
                    {LIBELLES_ETAT[m.etat] || m.etat}
                  </span>
                </div>

                {!enEdition && (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                      {DROITS.filter(d => m.droits[d.cle]).map(d => (
                        <span key={d.cle} style={{ fontSize: 11.5, fontWeight: 700, color: T.deep, background: T.pale, padding: '3px 10px', borderRadius: 100 }}>{d.label}</span>
                      ))}
                    </div>
                    {m.expire_le && (
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: T.muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Clock size={12} strokeWidth={2}/> Accès jusqu&rsquo;au {libelleFinAcces(m.expire_le)}
                      </p>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                      <button type="button" style={discret} disabled={!!enCours}
                        onClick={() => setEdition({ id: m.id, cases: { ...CASES_VIDES, ...m.droits }, finActive: !!m.expire_le, fin: versChampDate(m.expire_le) })}>
                        Modifier ses accès
                      </button>
                      {attente && (
                        <button type="button" style={discret} disabled={!!enCours} onClick={() => renvoyer(m)}>
                          {enCours === `renvoyer:${m.id}` ? <DotsAttente couleur={T.panel} label="Envoi en cours"/> : <><Mail size={13} strokeWidth={2}/> Renvoyer l&rsquo;invitation</>}
                        </button>
                      )}
                      <button type="button" style={{ ...discret, color: T.rouge, borderColor: '#FCA5A5' }} disabled={!!enCours} onClick={() => retirer(m)}>
                        {enCours === `retirer:${m.id}` ? <DotsAttente couleur={T.rouge} label="Retrait en cours"/> : <><Trash2 size={13} strokeWidth={2}/> Retirer</>}
                      </button>
                    </div>
                  </>
                )}

                {enEdition && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <Cases valeur={edition.cases} onChange={c => setEdition(e => ({ ...e, cases: c }))}/>
                    <FinAcces actif={edition.finActive} valeur={edition.fin}
                      onActif={v => setEdition(e => ({ ...e, finActive: v }))} onValeur={v => setEdition(e => ({ ...e, fin: v }))}/>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" style={principal} disabled={!!enCours} onClick={enregistrer}>
                        {enCours === `modifier:${m.id}` ? <DotsAttente label="Enregistrement en cours"/> : <><Check size={13} strokeWidth={2.2}/> Enregistrer ses accès</>}
                      </button>
                      <button type="button" style={discret} disabled={!!enCours} onClick={() => setEdition(null)}>Laisser comme avant</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Inviter ── */}
      {etat.disponible && (
        <div style={carte}>
          <p style={{ ...etiquette, marginBottom: 12 }}>Inviter une personne</p>
          {complet ? (
            <p style={{ margin: 0, fontSize: 13, color: T.muted, lineHeight: 1.5 }}>
              Ton équipe compte déjà {EQUIPE_MAX} personnes. Retire quelqu&rsquo;un avant d&rsquo;en inviter une autre.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={etiquette} htmlFor="equipe-prenom">Prénom</label>
                <input id="equipe-prenom" style={champ} value={prenom} maxLength={60} onChange={e => setPrenom(e.target.value)} placeholder="Julie"/>
              </div>
              <div>
                <label style={etiquette} htmlFor="equipe-email">Adresse email</label>
                <input id="equipe-email" type="email" inputMode="email" autoComplete="off" style={champ} value={email} onChange={e => setEmail(e.target.value)} placeholder="julie@exemple.be"/>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: T.muted }}>Elle recevra l&rsquo;invitation à cette adresse, et devra se connecter avec elle.</p>
              </div>
              <div>
                <span style={etiquette}>Ce que cette personne peut faire</span>
                <Cases valeur={cases} onChange={setCases}/>
              </div>
              <FinAcces actif={finActive} valeur={fin} onActif={setFinActive} onValeur={setFin}/>
              <div>
                <button type="button" style={principal} disabled={!!enCours || !prenom.trim() || !email.trim()} onClick={inviter}>
                  {enCours === 'inviter' ? <DotsAttente label="Envoi de l’invitation"/> : <><Mail size={14} strokeWidth={2}/> Envoyer l&rsquo;invitation</>}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
