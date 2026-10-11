'use client'

// L'ÉCRAN DE TRAVAIL DES COMMANDES (Alex, 11/10, « Odoo mind »).
//
// Trois colonnes Nouvelles → En prépa → Prêtes, des cartes compactes triées par
// heure, UN bouton par carte (l'étape suivante), le reste dans la carte
// complète qui s'ouvre d'un clic. Au-dessus : la bande des créneaux en une
// ligne, et le panneau « À préparer » avec l'export.
//
// ⚠️ CE FICHIER N'ÉCRIT RIEN. Il appelle les gestes du tableau de bord
// (`onAvancer` = `changerStatut`, `onBasculerCreneau` = fermer / rouvrir) et
// les règles pures de `lib/vue-commandes.js`. Il LIT une seule chose : le nom
// du second article d'un duo, pour « À préparer » (11/10).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DotsAttente from '@/app/components/DotsAttente'
import { euros } from '@/lib/montants'
import { referenceCommande } from '@/lib/numero-commande'
import { etatPaiementCommande, couleurPaiement } from '@/lib/rdv-paiement'
import { getMinutesBrussels } from '@/lib/ouverture'
import { ORIGINE_COMMERCANT } from '@/lib/commande-encodee'
import { COULEUR_LIVRAISON } from '@/lib/couleurs-statut-commande'
import { confirme } from './PosteConfirmation'
import { confirmationSimple } from '@/lib/confirmations'
import {
  colonnesDeCommandes, actionSuivante, enRetard, lignesCourtes, heureDeRetrait,
  aPreparer, periodeExport, articlesDeDuo,
} from '@/lib/vue-commandes'
import { donneesExport, pdfCommandes } from '@/lib/export-commandes-pdf'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', pale: '#EDE0FF', muted: '#5B6170',
  hairline: '#E4DCF2', fond: '#FBFAFF', retard: '#B91C1C',
}
const LIGNES_MAX = 4

// L'heure, relue chaque minute : un retard apparaît sans recharger.
function useMinuteBruxelles() {
  const [m, setM] = useState(() => getMinutesBrussels(new Date()))
  useEffect(() => {
    const t = setInterval(() => setM(getMinutesBrussels(new Date())), 60000)
    return () => clearInterval(t)
  }, [])
  return m
}

// ─── LA CARTE COMPACTE ──────────────────────────────────────────────────────
function CarteCompacte({ commande, couleur, aujourdhui, maintenantMin, categorie, onAvancer, onOuvrir }) {
  const [envoi, setEnvoi] = useState(false)
  const action = actionSuivante(commande)
  const retard = enRetard(commande, { aujourdhui, maintenantMin })
  const lignes = lignesCourtes(commande)
  const p = etatPaiementCommande(commande, { categorie })
  const cp = p ? couleurPaiement(p) : null
  const heure = heureDeRetrait(commande)
  const ref = referenceCommande(commande)
  const jour = String(commande.date_commande || '').slice(0, 10)
  const autreJour = jour && aujourdhui && jour !== aujourdhui

  async function avancer(e) {
    e.stopPropagation()
    if (envoi || !action) return
    setEnvoi(true)
    try { await onAvancer(commande, action.statut) } finally { setEnvoi(false) }
  }

  return (
    <div role="button" tabIndex={0} onClick={() => onOuvrir(commande)}
      onKeyDown={e => { if (e.key === 'Enter') onOuvrir(commande) }}
      aria-label={`Commande ${ref ? `#${ref}` : ''} de ${commande.client_nom || 'client'}, ouvrir le détail`}
      style={{ background: '#fff', borderRadius: 12, border: `1.5px solid ${retard ? '#FCA5A5' : T.hairline}`, borderLeft: `4px solid ${couleur}`, padding: '10px 12px', cursor: 'pointer', display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 18, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px', fontVariantNumeric: 'tabular-nums' }}>{heure || '—'}</span>
        {ref && <span style={{ fontSize: 13, fontWeight: 800, color: couleur }}>#{ref}</span>}
        {autreJour && <span style={{ fontSize: 12, fontWeight: 700, color: T.muted }}>{jour.slice(8, 10)}/{jour.slice(5, 7)}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 900, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{euros(commande.total)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{commande.client_nom || 'Client'}</span>
        {commande.origine === ORIGINE_COMMERCANT && <span style={puce(T.pale, T.deep)}>Encodée</span>}
        {commande.mode_retrait === 'livraison' && <span style={puce(COULEUR_LIVRAISON.pale, COULEUR_LIVRAISON.texte)}>Livraison</span>}
        {commande.mode_retrait === 'expedition' && <span style={puce('#EEF2FF', '#3730A3')}>Colis</span>}
        {commande.rdv_reservation_id && <span style={puce(T.pale, T.deep)}>Rendez-vous</span>}
      </div>
      <div style={{ display: 'grid', gap: 1 }}>
        {lignes.slice(0, LIGNES_MAX).map((l, i) => (
          <span key={i} style={{ fontSize: 13, color: T.ink, fontWeight: 600, lineHeight: 1.35 }}>
            {l.texte}{l.options ? <span style={{ color: T.muted, fontWeight: 500 }}> · {l.options}</span> : null}
          </span>
        ))}
        {lignes.length > LIGNES_MAX && <span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}>+ {lignes.length - LIGNES_MAX} autre{lignes.length - LIGNES_MAX > 1 ? 's' : ''}</span>}
      </div>
      {commande.notes_client && (
        <span style={{ fontSize: 13, fontWeight: 700, color: T.ink, background: '#F5F3FF', borderRadius: 6, padding: '3px 7px' }}>« {commande.notes_client} »</span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {p && cp && <span style={{ ...puce(cp.fond, cp.texte), border: `1px solid ${cp.bord}` }}>{p.libelle}</span>}
        {retard && <span style={puce('#FEF2F2', T.retard)}>En retard</span>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {action ? (
          <button type="button" onClick={avancer} disabled={envoi}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: 'none', background: couleur, color: '#fff', fontWeight: 800, fontSize: 13, cursor: envoi ? 'default' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {action.libelle} →
            {envoi && <DotsAttente couleur="#fff" taille={4} label="Changement de statut"/>}
          </button>
        ) : (
          <button type="button" onClick={e => { e.stopPropagation(); onOuvrir(commande) }}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${couleur}`, background: '#fff', color: couleur, fontWeight: 800, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
            Ouvrir la commande
          </button>
        )}
        <button type="button" onClick={e => { e.stopPropagation(); onOuvrir(commande) }} aria-label="Toutes les actions de la commande"
          title="Détail et toutes les actions"
          style={{ width: 38, borderRadius: 9, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.ink, fontWeight: 900, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>⋯</button>
      </div>
    </div>
  )
}

const puce = (fond, texte) => ({ fontSize: 12, fontWeight: 800, color: texte, background: fond, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap' })

// ─── LES TROIS COLONNES ─────────────────────────────────────────────────────
export function ColonnesCommandes({ commandes = [], aujourdhui, categorie, onAvancer, onOuvrir }) {
  const maintenantMin = useMinuteBruxelles()
  const colonnes = colonnesDeCommandes(commandes)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, alignItems: 'start' }}>
      {colonnes.map(col => (
        <section key={col.statut} aria-label={col.titre} style={{ background: col.fond, borderRadius: 14, padding: 10, display: 'grid', gap: 8 }}>
          <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: col.couleur }}/>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 900, color: T.ink, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col.titre}</h3>
            <span style={{ marginLeft: 'auto', minWidth: 26, textAlign: 'center', fontSize: 13, fontWeight: 900, color: '#fff', background: col.couleur, borderRadius: 100, padding: '1px 8px' }}>{col.commandes.length}</span>
          </header>
          {col.commandes.length === 0 ? (
            <p style={{ margin: 0, padding: '14px 6px', fontSize: 13, color: T.muted, textAlign: 'center' }}>Rien ici</p>
          ) : col.commandes.map(c => (
            <CarteCompacte key={c.id} commande={c} couleur={col.couleur} aujourdhui={aujourdhui} maintenantMin={maintenantMin}
              categorie={categorie} onAvancer={onAvancer} onOuvrir={onOuvrir}/>
          ))}
        </section>
      ))}
    </div>
  )
}

// ─── LA BANDE DES CRÉNEAUX, EN UNE LIGNE ────────────────────────────────────
// 🔴 40 cases « 0/5 LIBRE Fermer » identiques ne disaient rien en une seconde
// (Alex, 11/10). Une puce par créneau : l'heure, le remplissage, une barre. Le
// geste « fermer / rouvrir » reste, d'un clic sur la puce, avec confirmation.
export function BandeCreneaux({ creneauxRemplis = [], estTournee = false, etatCreneau, couleurDe, onBasculer }) {
  if (creneauxRemplis.length === 0) return null
  async function basculer(r) {
    const bloque = !!r.bloque
    const plage = `${String(r.creneau.heure_debut || '').slice(0, 5)}–${String(r.creneau.heure_fin || '').slice(0, 5)}`
    const ok = await confirme(confirmationSimple({
      titre: bloque ? `Rouvrir ${estTournee ? 'la tournée' : 'le créneau'} ${plage} ?` : `Fermer ${estTournee ? 'la tournée' : 'le créneau'} ${plage} ?`,
      message: bloque
        ? 'Tes clients pourront de nouveau le choisir en ligne.'
        : 'Plus aucune commande en ligne sur ce créneau aujourd’hui. Celles déjà prises restent.',
      action: bloque ? 'Oui, rouvrir' : 'Oui, fermer', ton: 'principal',
    }))
    if (ok) onBasculer(r.creneau.id, bloque)
  }
  return (
    <div role="list" aria-label={estTournee ? 'Remplissage des tournées' : 'Remplissage des créneaux'}
      style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 12, scrollbarWidth: 'thin' }}>
      {creneauxRemplis.map(r => {
        const couleur = couleurDe(r)
        const ratio = r.capacite > 0 ? Math.min(1, r.utiliseEff / r.capacite) : 0
        return (
          <button key={r.creneau.id} type="button" role="listitem" onClick={() => basculer(r)}
            title={`${etatCreneau(r)} · clique pour ${r.bloque ? 'rouvrir' : 'fermer'}`}
            style={{ flexShrink: 0, minWidth: 74, padding: '5px 8px 6px', borderRadius: 9, border: `1.5px solid ${couleur}55`, background: r.bloque ? '#F3F4F6' : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{String(r.creneau.heure_debut || '').slice(0, 5)}</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: couleur, fontVariantNumeric: 'tabular-nums' }}>
                {r.bloque ? 'Fermé' : `${Math.round(r.utiliseEff)}/${Math.round(r.capacite)}`}
              </span>
            </span>
            <span style={{ display: 'block', height: 3, borderRadius: 100, background: '#EEE9F8', marginTop: 4, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: `${ratio * 100}%`, height: '100%', background: couleur }}/>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── « À PRÉPARER » ET L'EXPORT ─────────────────────────────────────────────
const CLE_OUVERT = 'yoppaa:a-preparer-ouvert'

function telecharger(nomFichier, blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = nomFichier
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PanneauAPreparer({ commandesDuJour = [], toutesCommandes = [], jour, commerceNom = '', categorie = null }) {
  const [ouvert, setOuvert] = useState(() => { try { return localStorage.getItem(CLE_OUVERT) === '1' } catch { return false } })
  useEffect(() => { try { localStorage.setItem(CLE_OUVERT, ouvert ? '1' : '0') } catch { /* rien à retenir */ } }, [ouvert])
  // Le mot qui suit l'export, ici même : le tableau de bord n'affiche pas les
  // messages volants dans cet onglet.
  const [message, setMessage] = useState(null)
  useEffect(() => {
    if (!message) return
    const t = setTimeout(() => setMessage(null), 4000)
    return () => clearTimeout(t)
  }, [message])
  // Le nom du second article d'un duo : il n'est pas joint aux lignes (pas de
  // clé étrangère, voir MIGRATION_LOTS_STOCK_REEL). Lu à la demande, et
  // seulement s'il y a un duo.
  const idsDuo = articlesDeDuo(toutesCommandes).join(',')
  const [nomsArticles, setNomsArticles] = useState({})
  useEffect(() => {
    if (!idsDuo) return
    let annule = false
    supabase.from('articles').select('id, nom').in('id', idsDuo.split(',')).then(({ data }) => {
      if (!annule && data) setNomsArticles(Object.fromEntries(data.map(a => [a.id, a.nom])))
    })
    return () => { annule = true }
  }, [idsDuo])
  const prep = aPreparer(commandesDuJour, { nomsArticles })
  const [enExport, setEnExport] = useState(null) // 'jour' | 'semaine'

  // 🔴 EN PDF (Alex, 11/10) : un A4 couché, un bandeau par jour, une commande
  // par ligne. Les données sont rangées par `donneesExport` (pur, mesuré).
  async function exporter(quoi) {
    if (enExport) return
    const periode = periodeExport(jour, quoi)
    if (!periode) return
    const donnees = donneesExport(toutesCommandes, { ...periode, categorie, nomsArticles })
    if (donnees.nombre === 0) { setMessage(quoi === 'semaine' ? 'Aucune commande cette semaine.' : 'Aucune commande ce jour-là.'); return }
    setEnExport(quoi)
    try {
      const blob = await pdfCommandes(donnees, { commerceNom, periode })
      const base = String(commerceNom || 'commandes').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
      telecharger(`${base}-${periode.debut}${periode.fin !== periode.debut ? `_${periode.fin}` : ''}.pdf`, blob)
      setMessage(`${donnees.nombre} commande${donnees.nombre > 1 ? 's' : ''} exportée${donnees.nombre > 1 ? 's' : ''} (du ${periode.debut.split('-').reverse().join('/')}${periode.fin !== periode.debut ? ` au ${periode.fin.split('-').reverse().join('/')}` : ''}).`)
    } catch (e) {
      setMessage('Le PDF n’a pas pu être créé. Réessaie.')
    } finally {
      setEnExport(null)
    }
  }

  const resume = prep.articles.slice(0, 4).map(a => `${a.quantite} ${a.nom}`).join(' · ')
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setOuvert(o => !o)} aria-expanded={ouvert}
          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: ouvert ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}><path d="M9 6l6 6-6 6"/></svg>
          <span style={{ fontSize: 14, fontWeight: 900, color: T.ink, flexShrink: 0 }}>À préparer</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: prep.total ? T.main : T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {prep.total ? `${prep.total} article${prep.total > 1 ? 's' : ''} · ${resume}` : 'Rien à préparer'}
          </span>
        </button>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          {[['jour', 'PDF du jour'], ['semaine', 'PDF de la semaine']].map(([q, l]) => (
            <button key={q} type="button" onClick={() => exporter(q)} disabled={!!enExport}
              style={{ ...boutonExport, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>
              {l}
              {enExport === q && <DotsAttente couleur={T.main} taille={4} label="Création du PDF"/>}
            </button>
          ))}
        </div>
        {message && <p role="status" style={{ flexBasis: '100%', margin: 0, fontSize: 13, fontWeight: 700, color: T.main }}>{message}</p>}
      </div>
      {ouvert && prep.total > 0 && (
        <div style={{ borderTop: `1px solid ${T.hairline}`, padding: '10px 12px', display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          <div>
            <p style={titrePanneau}>Pour la journée</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <tbody>
                {prep.articles.map(a => (
                  <tr key={a.nom} style={{ borderBottom: `1px solid ${T.hairline}` }}>
                    <td style={{ padding: '5px 0', fontSize: 14, color: T.ink, fontWeight: 600 }}>{a.nom}</td>
                    <td style={{ padding: '5px 0', fontSize: 15, color: T.ink, fontWeight: 900, textAlign: 'right' }}>{a.quantite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p style={titrePanneau}>Par heure</p>
            {/* (11/10, Alex : « plus clair, séparation par ligne ou par
                encadré ») : un encadré par heure, un article par ligne. */}
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
              {prep.parHeure.map(h => (
                <div key={h.heure} style={{ border: `1.5px solid ${T.hairline}`, borderRadius: 10, overflow: 'hidden' }}>
                  <p style={{ margin: 0, padding: '5px 10px', background: T.pale, fontSize: 14, fontWeight: 900, color: T.deep, fontVariantNumeric: 'tabular-nums' }}>{h.heure}</p>
                  {h.articles.map((a, i) => (
                    <div key={a.nom} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '5px 10px', borderTop: i ? `1px solid ${T.hairline}` : 'none', fontSize: 13.5 }}>
                      <span style={{ color: T.ink, fontWeight: 600 }}>{a.nom}</span>
                      <span style={{ color: T.ink, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{a.quantite}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const boutonExport = { padding: '6px 10px', borderRadius: 8, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.ink, fontWeight: 700, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }
const titrePanneau = { margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }
