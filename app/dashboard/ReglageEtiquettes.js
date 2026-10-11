'use client'
// LES ÉTIQUETTES DE COMMANDE, RÉGLÉES PAR APPAREIL (01/10).
//
// Partagé par le tableau de bord et le Poste de l'équipe : c'est l'appareil
// posé à côté de la Brother qui imprime, quel que soit l'écran ouvert dessus.
// Les règles vivent dans `lib/impression-etiquette.js`.
//
// ⚠️ RIEN AU RENDU SERVEUR : le réglage est dans le navigateur. Jusqu'à ce
// qu'il soit lu, l'appareil est réputé ne pas imprimer, ce qui est la valeur
// sûre (aucune fenêtre d'impression surprise).

import { useCallback, useEffect, useState } from 'react'
import { lireImpressionActive, ecrireImpressionActive, imprimerEtiquette } from '@/lib/impression-etiquette'
import { ETIQUETTE_ESSAI, SACS_MAX, contenuEtiquette, etiquettesPourSacs } from '@/lib/etiquette-commande'
import { postPro } from '@/lib/fetch-pro'
import DotsAttente from '@/app/components/DotsAttente'

const T = { ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', vert: '#047857', alerte: '#B45309', erreur: '#B91C1C' }

export function useEtiquettesAppareil() {
  const [actif, setActif] = useState(false)
  useEffect(() => { setActif(lireImpressionActive()) }, [])
  const regler = (valeur) => { ecrireImpressionActive(valeur); setActif(valeur) }
  return [actif, regler]
}

// ─── LA TABLETTE DU COMPTOIR (« Yoppaa Comptoir », 11/10) ───────────────────
// L'état de la station : y en a-t-il une, est-elle en ligne, et les dernières
// étiquettes. 🔴 QUAND IL Y A UNE STATION, LE NAVIGATEUR N'IMPRIME PLUS : toutes
// les étiquettes passent par la file (décision d'Alex), sinon un appareil
// réglé « imprimer ici » ferait sortir chaque étiquette deux fois.
// `undefined` tant que l'état n'est pas lu : l'appelant n'imprime rien par le
// navigateur tant qu'il ne SAIT pas qu'il n'y a pas de station.
export function useStationComptoir(commercantId) {
  const [etat, setEtat] = useState(undefined) // undefined = pas encore lu ; { station, dernieres }
  const relire = useCallback(async () => {
    if (!commercantId) return
    const res = await postPro('/api/impression/station', { commercant_id: commercantId, action: 'etat' })
    const j = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
    if (j?.ok) setEtat({ station: j.station, dernieres: j.dernieres || [] })
  }, [commercantId])
  useEffect(() => {
    relire()
    const t = setInterval(relire, 20000)
    return () => clearInterval(t)
  }, [relire])
  async function demander(corps) {
    const res = await postPro('/api/impression/demander', { commercant_id: commercantId, ...corps })
    const j = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
    relire()
    return j?.ok ? { ok: true } : { ok: false, error: j?.error || 'L’étiquette n’a pas pu être demandée. Réessaie.' }
  }
  async function retirer() {
    const res = await postPro('/api/impression/station', { commercant_id: commercantId, action: 'retirer' })
    const j = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
    if (j?.ok) setEtat({ station: j.station, dernieres: j.dernieres || [] })
    return !!j?.ok
  }
  return { etat, aStation: !!etat?.station, relire, demander, retirer }
}

const LIBELLES_FILE = { en_attente: 'En attente', en_cours: 'En cours', imprimee: 'Imprimée', echec: 'Échec' }
const heureCourte = (iso) => iso ? new Date(iso).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' }) : ''

/** L'encadré de la tablette du comptoir, dans le réglage des étiquettes. */
function EncadreStation({ comptoir }) {
  const [envoi, setEnvoi] = useState(null) // 'essai' | 'retirer'
  const [message, setMessage] = useState(null)
  const station = comptoir?.etat?.station
  if (!station) {
    return (
      <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.5, color: T.muted }}>
        Avec l&rsquo;app <strong>Yoppaa Comptoir</strong> sur la tablette du kit, les étiquettes sortent toutes seules sur la Brother, sans fenêtre, même quand la préparation démarre depuis un téléphone de l&rsquo;équipe.
      </p>
    )
  }
  async function essai() {
    if (envoi) return
    setEnvoi('essai'); setMessage(null)
    const r = await comptoir.demander({ origine: 'essai' })
    setEnvoi(null)
    setMessage(r.ok ? 'Étiquette d’essai envoyée à la tablette.' : r.error)
  }
  async function retirer() {
    if (envoi) return
    setEnvoi('retirer'); setMessage(null)
    const ok = await comptoir.retirer()
    setEnvoi(null)
    if (!ok) setMessage('La tablette n’a pas pu être retirée. Réessaie.')
  }
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: '#F8F5FF', border: `1px solid ${T.pale}` }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.ink, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: station.enLigne ? T.vert : T.alerte, flexShrink: 0 }}/>
        {station.nom} · {station.enLigne ? 'en ligne' : `hors ligne${station.dernierContact ? ` depuis ${heureCourte(station.dernierContact)}` : ''}`}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: T.deep }}>
        Toutes les étiquettes sortent sur la Brother de cette tablette, d&rsquo;où que démarre la préparation.
        {!station.enLigne && ' Tant qu’elle est hors ligne, elles attendent et sortiront à son retour.'}
      </p>
      {(comptoir.etat.dernieres || []).length > 0 && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 3 }}>
          {comptoir.etat.dernieres.slice(0, 5).map(e => (
            <li key={e.id} style={{ fontSize: 12.5, color: e.statut === 'echec' ? T.erreur : T.deep, fontVariantNumeric: 'tabular-nums' }}>
              {heureCourte(e.cree_le)} · {e.origine === 'essai' ? 'Essai' : e.origine === 'reimpression' ? 'Réimpression' : 'Démarrage'}{e.sacs > 1 ? ` · ${e.sacs} sacs` : ''} · <strong>{LIBELLES_FILE[e.statut] || e.statut}</strong>{e.phrase ? ` : ${e.phrase}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={essai} disabled={!!envoi}
          style={{ padding: '8px 14px', borderRadius: 100, border: `1px solid ${T.pale}`, background: '#fff', color: T.ink, fontSize: 12.5, fontWeight: 700, cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {envoi === 'essai' ? <DotsAttente/> : null} Étiquette d&rsquo;essai sur la tablette
        </button>
        <button type="button" onClick={retirer} disabled={!!envoi}
          style={{ padding: '8px 14px', borderRadius: 100, border: `1px solid ${T.pale}`, background: '#fff', color: T.muted, fontSize: 12.5, fontWeight: 700, cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {envoi === 'retirer' ? <DotsAttente/> : null} Ne plus imprimer sur cette tablette
        </button>
      </div>
      {message && <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: T.deep }}>{message}</p>}
    </div>
  )
}

function IconeImprimante({ couleur }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={couleur} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>
    </svg>
  )
}

// ⚠️ LE RATTRAPAGE, ET LES SACS EN PLUS (Alex, 01/10 : « coller plusieurs
// étiquettes s'il y a plusieurs articles »). L'impression ne bloque jamais le
// changement de statut : plus de papier, imprimante éteinte, et la commande
// avance quand même. Ce bouton refait les étiquettes sans rien défaire, une
// par sac, numérotées. Le clic sur « Imprimer » est lui-même le geste que
// Safari exige : rien n'est attendu avant.
export function BoutonEtiquettes({ commande, categorie = null, commerce = null, comptoir = null }) {
  const [sacs, setSacs] = useState(1)
  const [envoi, setEnvoi] = useState(false)
  const [message, setMessage] = useState(null)
  // 🔴 AVEC UNE TABLETTE DU COMPTOIR, la réimpression passe par la file comme
  // le reste (11/10) : elle sort sur la Brother de la tablette, pas ici.
  async function imprimer() {
    if (comptoir?.aStation) {
      if (envoi) return
      setEnvoi(true); setMessage(null)
      const r = await comptoir.demander({ origine: 'reimpression', commande_id: commande.id, sacs })
      setEnvoi(false)
      setMessage(r.ok ? 'Envoyée à la tablette du comptoir.' : r.error)
      return
    }
    imprimerEtiquette(etiquettesPourSacs(contenuEtiquette(commande, { categorie, commerce }), sacs))
  }
  const rond = { width: 30, height: 30, borderRadius: '50%', border: `1px solid ${T.pale}`, background: '#fff', color: T.ink, fontSize: 16, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, padding: 0 }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} aria-label="Nombre de sacs">
        <button type="button" onClick={() => setSacs(s => Math.max(1, s - 1))} disabled={sacs <= 1}
          aria-label="Un sac de moins" style={{ ...rond, opacity: sacs <= 1 ? 0.4 : 1, cursor: sacs <= 1 ? 'default' : 'pointer' }}>−</button>
        <span style={{ minWidth: 48, textAlign: 'center', fontSize: 13, fontWeight: 800, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
          {sacs} sac{sacs > 1 ? 's' : ''}
        </span>
        <button type="button" onClick={() => setSacs(s => Math.min(SACS_MAX, s + 1))} disabled={sacs >= SACS_MAX}
          aria-label="Un sac de plus" style={rond}>+</button>
      </div>
      <button type="button" onClick={imprimer} disabled={envoi}
        style={{ flex: 1, minWidth: 150, padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.ink, fontSize: 12.5, fontWeight: 800, cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {envoi ? <DotsAttente/> : <IconeImprimante couleur={T.ink}/>}
        {sacs > 1 ? `Imprimer ${sacs} étiquettes` : 'Imprimer l’étiquette'}
      </button>
      {message && <p role="status" style={{ flexBasis: '100%', margin: 0, fontSize: 12.5, fontWeight: 700, color: T.deep }}>{message}</p>}
    </div>
  )
}

// `commerce` : son nom, imprimé en pied de l'étiquette d'essai comme sur les
// vraies, pour régler la machine sur ce qui sortira vraiment.
export default function ReglageEtiquettes({ actif, onChanger, commerce = null, comptoir = null }) {
  const [ouvert, setOuvert] = useState(false)
  const station = comptoir?.etat?.station
  const etatTitre = station
    ? { texte: station.enLigne ? 'Tablette du comptoir' : 'Tablette hors ligne', couleur: station.enLigne ? T.vert : T.alerte }
    : { texte: actif ? 'Imprimées ici' : 'Pas sur cet appareil', couleur: actif ? T.vert : T.muted }
  return (
    <div style={{ background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 14, padding: '10px 12px', marginBottom: 12 }}>
      <button type="button" onClick={() => setOuvert(o => !o)} aria-expanded={ouvert}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <IconeImprimante couleur={etatTitre.couleur}/>
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 800, color: T.ink }}>Étiquettes de commande</span>
        <span style={{ fontSize: 12, fontWeight: 800, color: etatTitre.couleur }}>{etatTitre.texte}</span>
      </button>
      {ouvert && station && <EncadreStation comptoir={comptoir}/>}
      {ouvert && !station && (
        <div style={{ marginTop: 10 }}>
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: T.deep }}>
            Quand tu démarres la préparation d&rsquo;une commande, son étiquette s&rsquo;imprime depuis cet appareil, avec la liste des articles à préparer. La fenêtre d&rsquo;impression s&rsquo;ouvre : la première fois, choisis ta Brother, puis touche « Imprimer ». Plusieurs sacs ? Sur la commande, choisis leur nombre : chaque étiquette porte « Sac 1/3 », « Sac 2/3 »…
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onChanger(!actif)}
              style={{ padding: '8px 14px', borderRadius: 100, border: 'none', background: actif ? '#fff' : T.main, color: actif ? T.ink : '#fff', boxShadow: actif ? `inset 0 0 0 1px ${T.pale}` : 'none', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              {actif ? 'Ne plus imprimer ici' : 'Imprimer depuis cet appareil'}
            </button>
            <button type="button" onClick={() => imprimerEtiquette({ ...ETIQUETTE_ESSAI, commerce: commerce || null })}
              style={{ padding: '8px 14px', borderRadius: 100, border: `1px solid ${T.pale}`, background: '#fff', color: T.ink, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Imprimer une étiquette d&rsquo;essai
            </button>
          </div>
          <EncadreStation comptoir={comptoir}/>
        </div>
      )}
    </div>
  )
}
