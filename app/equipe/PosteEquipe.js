'use client'
// LE POSTE ÉQUIPE D'UN COMMERCE, EN LECTURE (29/09, étape 2).
//
// Ce que la personne voit dépend de SES cases, et c'est le serveur qui en
// décide (`/api/equipe/poste`) : l'écran n'affiche que les parties reçues.
//
// ⚠️ L'AGENDA EST CELUI DU PATRON (`AgendaRdv`), sans ses boutons de création
// ni de clôture : il ne touche pas la base, il affiche ce qu'on lui donne. Un
// seul agenda pour deux écrans, qui ne peuvent donc pas se contredire.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DotsAttente from '@/app/components/DotsAttente'
import AgendaRdv from '@/app/dashboard/AgendaRdv'
import { statutRdv } from '@/lib/rdv-statut'
import { etatPaiementRdv, etatPaiementCommande } from '@/lib/rdv-paiement'
import { referenceRdv, referenceCommande } from '@/lib/numero-commande'
import { intituleReservation } from '@/lib/reservation-metier'
import { estReservationDeTable, couvertsDe } from '@/lib/cours-collectifs'
import { libelleOptions } from '@/lib/options-ligne'
import { libelleRetrait } from '@/lib/libelle-retrait'
import { libelleStatutCommande, STATUTS_COMMANDE_EN_COURS } from '@/lib/statuts-commande'
import { euros } from '@/lib/montants'
import { libelleJourPoste } from '@/lib/equipe-poste'
// ── Étape 3 : les gestes, avec les MÊMES questions et les MÊMES routes que le
// tableau de bord du patron (29/09).
import { postPro, prevenirClient } from '@/lib/fetch-pro'
import PosteConfirmation, { confirmer } from '@/app/dashboard/PosteConfirmation'
import { questionRdv, statutDepuisChoix, noShowPossible, questionEncaissement } from '@/lib/confirmation-rdv'
import { resteAEncaisser, resteAEncaisserCommande } from '@/lib/rdv-paiement'
import { STATUT_SUIVANT, LIBELLE_GESTE_SUIVANT, transitionPermise } from '@/lib/statuts-commande'
import { peutMarquerNonRetire } from '@/lib/rappels-retrait'

const T = { fond: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', panel: '#160636', rouge: '#B91C1C', vert: '#047857', filet: '#E7DEF6' }
const carte = { background: '#fff', borderRadius: 14, border: `1px solid ${T.filet}`, padding: 14, boxSizing: 'border-box' }
const puce = (actif) => ({ padding: '8px 14px', borderRadius: 100, border: `1px solid ${actif ? T.panel : T.filet}`, background: actif ? T.panel : '#fff', color: actif ? '#fff' : T.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' })

// Un rechargement toutes les 30 secondes, et au retour sur l'écran : une
// réservation prise en ligne doit apparaître sans que personne n'y pense.
const RAFRAICHIR_MS = 30000

function lienTel(tel) {
  const t = String(tel || '').replace(/[^\d+]/g, '')
  return t ? `tel:${t}` : null
}
function lienCarte(adresse) {
  return adresse ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}` : null
}

function Telephone({ numero }) {
  const lien = lienTel(numero)
  if (!lien) return null
  return <a href={lien} style={{ color: T.main, fontWeight: 700, textDecoration: 'none' }}>{numero}</a>
}

// ─── Le détail d'un rendez-vous, en lecture ─────────────────────────────────
function DetailRdv({ rdv, commerce, droits = {}, gestes = null, enCours = false, onFermer }) {
  const enAttente = rdv.statut === 'confirme'
  const absentPossible = enAttente && droits.argent && noShowPossible(rdv, new Date())
  const table = estReservationDeTable(rdv)
  const intitule = intituleReservation({ prestation_nom: rdv.prestation?.nom, table, couverts: couvertsDe(rdv) })
  const statut = statutRdv(rdv)
  const paiement = etatPaiementRdv(rdv, { categorie: commerce.categorie })
  return (
    <div role="dialog" aria-modal="true" aria-label="Détail de la réservation"
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50, padding: 12 }}
      onClick={onFermer}>
      <div style={{ ...carte, width: '100%', maxWidth: 480, padding: 20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: T.muted, fontWeight: 700 }}>{referenceRdv(rdv)}</p>
            <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 800, color: T.ink }}>{[rdv.client_prenom, rdv.client_nom].filter(Boolean).join(' ') || 'Client'}</p>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: statut.texte, background: statut.fond, padding: '4px 10px', borderRadius: 100 }}>{statut.label}</span>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 14.5, color: T.ink }}>
          <strong>{libelleJourPoste(rdv.date_rdv)}</strong> · {String(rdv.heure_debut || '').slice(0, 5)}{rdv.heure_fin ? ` – ${String(rdv.heure_fin).slice(0, 5)}` : ''}
        </p>
        {intitule && <p style={{ margin: '4px 0 0', fontSize: 14, color: T.ink }}>{intitule}{rdv.praticien?.prenom ? ` · avec ${rdv.praticien.prenom}` : ''}</p>}
        {rdv.client_telephone && <p style={{ margin: '10px 0 0', fontSize: 14 }}><Telephone numero={rdv.client_telephone}/></p>}
        {rdv.notes_client && <p style={{ margin: '10px 0 0', fontSize: 13.5, color: T.ink, background: T.fond, borderRadius: 10, padding: '8px 10px' }}>« {rdv.notes_client} »</p>}
        {paiement && <p style={{ margin: '10px 0 0', fontSize: 13, color: T.muted }}><strong style={{ color: T.ink }}>{paiement.libelle}</strong>{paiement.detail ? ` · ${paiement.detail}` : ''}</p>}
        {rdv.lieu_libelle && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: T.muted }}>{rdv.lieu_libelle}</p>}
        {enAttente && gestes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
            <button type="button" disabled={enCours} onClick={() => gestes.venu(rdv)} style={{ ...puce(true), padding: '12px 14px', background: T.vert, borderColor: T.vert }}>
              {enCours ? <DotsAttente label="Enregistrement"/> : 'Client venu'}
            </button>
            {absentPossible && (
              <button type="button" disabled={enCours} onClick={() => gestes.absent(rdv)} style={{ ...puce(false), padding: '12px 14px' }}>Client absent</button>
            )}
            <button type="button" disabled={enCours} onClick={() => gestes.annuler(rdv)} style={{ ...puce(false), padding: '12px 14px', color: T.rouge, borderColor: '#FCA5A5' }}>Annuler la réservation</button>
          </div>
        )}
        <button type="button" onClick={onFermer} style={{ ...puce(!enAttente || !gestes), width: '100%', marginTop: enAttente && gestes ? 8 : 16, padding: '12px 14px' }}>Fermer</button>
      </div>
    </div>
  )
}

// ─── Les commandes ───────────────────────────────────────────────────────────
const FILTRES = [
  { cle: 'en_cours', label: 'À traiter', garde: c => STATUTS_COMMANDE_EN_COURS.includes(c.statut) },
  { cle: 'pret', label: 'Prêtes', garde: c => c.statut === 'pret' },
  { cle: 'recupere', label: 'Remises', garde: c => c.statut === 'recupere' },
  { cle: 'tout', label: 'Tout', garde: () => true },
]

function CarteCommande({ c, commerce, gestes = null, enCours = false }) {
  const vers = STATUT_SUIVANT[c.statut]
  const avancer = gestes && vers && transitionPermise(c, vers)
  const nonRetire = gestes && peutMarquerNonRetire(c, new Date())
  const creneau = c.creneau || c.creneau_livraison || null
  const paiement = etatPaiementCommande(c, { categorie: commerce.categorie })
  const retrait = libelleRetrait({ ...c, commercant: commerce }, creneau, { court: true })
  return (
    <div style={carte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: T.ink }}>{referenceCommande(c) || 'Commande'} · {c.client_nom || 'Client'}</p>
          {retrait && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>{retrait}</p>}
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.panel, background: T.pale, padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{libelleStatutCommande(c)}</span>
      </div>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(c.commande_articles || []).map((l, i) => {
          const options = libelleOptions(l.options)
          return (
            <li key={i} style={{ fontSize: 14, color: T.ink }}>
              <strong>{l.quantite} ×</strong> {l.article_nom}
              {options && <span style={{ display: 'block', fontSize: 12.5, color: T.muted, marginLeft: 22 }}>{options}</span>}
            </li>
          )
        })}
      </ul>
      {c.mode_retrait === 'livraison' && c.adresse_livraison && (
        <p style={{ margin: '10px 0 0', fontSize: 13 }}><a href={lienCarte(c.adresse_livraison)} target="_blank" rel="noopener noreferrer" style={{ color: T.main, fontWeight: 700 }}>{c.adresse_livraison}</a></p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 10, flexWrap: 'wrap', fontSize: 13 }}>
        {c.client_telephone ? <Telephone numero={c.client_telephone}/> : <span/>}
        {paiement && <span style={{ color: T.muted }}><strong style={{ color: T.ink }}>{paiement.libelle}</strong>{Number(c.total) > 0 ? ` · ${euros(c.total)}` : ''}</span>}
      </div>
      {(avancer || nonRetire) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          {avancer && (
            <button type="button" disabled={enCours} onClick={() => gestes.avancer(c)} style={{ ...puce(true), flex: 1, padding: '11px 14px' }}>
              {enCours ? <DotsAttente label="Enregistrement"/> : LIBELLE_GESTE_SUIVANT[c.statut]}
            </button>
          )}
          {nonRetire && (
            <button type="button" disabled={enCours} onClick={() => gestes.nonRetire(c)} style={{ ...puce(false), padding: '11px 14px' }}>Non retirée</button>
          )}
        </div>
      )}
    </div>
  )
}

function Commandes({ commandes, commerce, aujourdhui, gestes = null, enCours = null }) {
  const [filtre, setFiltre] = useState('en_cours')
  const garde = FILTRES.find(f => f.cle === filtre)?.garde || (() => true)
  const visibles = commandes.filter(garde)
  const parJour = useMemo(() => {
    const m = new Map()
    for (const c of visibles) {
      const jour = c.date_commande || String(c.created_at || '').slice(0, 10)
      if (!m.has(jour)) m.set(jour, [])
      m.get(jour).push(c)
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [visibles])
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
        {FILTRES.map(f => (
          <button key={f.cle} type="button" onClick={() => setFiltre(f.cle)} style={puce(filtre === f.cle)}>
            {f.label} · {commandes.filter(f.garde).length}
          </button>
        ))}
      </div>
      {parJour.length === 0 && <p style={{ margin: '16px 0', color: T.muted, fontSize: 14 }}>Rien ici pour le moment.</p>}
      {parJour.map(([jour, liste]) => (
        <div key={jour} style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1px' }}>{libelleJourPoste(jour, aujourdhui)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map(c => <CarteCommande key={c.id} c={c} commerce={commerce} gestes={gestes} enCours={enCours === c.id}/>)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Les livraisons du jour ──────────────────────────────────────────────────
function Livraisons({ livraisons }) {
  const aFaire = livraisons.filter(l => l.statut_livraison !== 'livree' && l.statut !== 'recupere')
  const faites = livraisons.length - aFaire.length
  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: T.muted }}>
        {aFaire.length} à livrer aujourd&rsquo;hui{faites ? ` · ${faites} déjà livrée${faites > 1 ? 's' : ''}` : ''}
      </p>
      {aFaire.length === 0 && <p style={{ margin: '16px 0', color: T.muted, fontSize: 14 }}>Aucune livraison à faire pour le moment.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {aFaire.map((l, i) => (
          <div key={l.id} style={carte}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: T.ink }}>{i + 1}. {l.client_nom || 'Client'}</p>
              {l.creneau && <span style={{ fontSize: 12.5, color: T.muted, whiteSpace: 'nowrap' }}>{String(l.creneau.heure_debut).slice(0, 5)} – {String(l.creneau.heure_fin).slice(0, 5)}</span>}
            </div>
            {l.adresse && <p style={{ margin: '6px 0 0', fontSize: 14.5 }}><a href={lienCarte(l.adresse)} target="_blank" rel="noopener noreferrer" style={{ color: T.main, fontWeight: 700 }}>{l.adresse}</a></p>}
            {/* Ce qu'il doit donner à la porte (Alex, 29/09), sans aucun prix. */}
            {l.lignes?.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {l.lignes.map((ligne, j) => (
                  <li key={j} style={{ fontSize: 13.5, color: T.ink }}>
                    <strong>{ligne.quantite} ×</strong> {ligne.article_nom}
                    {ligne.options && <span style={{ display: 'block', fontSize: 12.5, color: T.muted, marginLeft: 22 }}>{ligne.options}</span>}
                  </li>
                ))}
              </ul>
            )}
            {l.note && <p style={{ margin: '6px 0 0', fontSize: 13.5, color: T.ink, background: T.fond, borderRadius: 10, padding: '8px 10px' }}>{l.note}</p>}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontSize: 13.5, flexWrap: 'wrap' }}>
              {l.client_telephone ? <Telephone numero={l.client_telephone}/> : <span/>}
              {l.a_encaisser
                ? <strong style={{ color: T.rouge }}>À encaisser : {euros(l.a_encaisser)}</strong>
                : <span style={{ color: T.vert, fontWeight: 700 }}>Déjà payée</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Le poste ────────────────────────────────────────────────────────────────
export default function PosteEquipe({ equipe, onChanger }) {
  const [etat, setEtat] = useState({ charge: false })
  const [onglet, setOnglet] = useState(null)
  const [rdvOuvert, setRdvOuvert] = useState(null)
  // Ce qui travaille (l'identifiant de la ligne), et ce qu'on dit après.
  const [enCours, setEnCours] = useState(null)
  const [avis, setAvis] = useState(null)   // { texte, ton: 'ok' | 'erreur' }

  const charger = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) { window.location.href = `/login?next=${encodeURIComponent('/equipe')}`; return }
    try {
      const r = await fetch('/api/equipe/poste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ commercant_id: equipe.commercant_id }),
      })
      const j = await r.json().catch(() => null)
      if (!j?.ok) {
        // ⚠️ UN ACCÈS COUPÉ SE DIT : retiré, terminé, commerce sorti de Vendre.
        setEtat({ charge: true, erreur: r.status === 403 ? 'Ton accès à ce commerce est fermé. Vois avec ton responsable.' : (j?.error || 'Poste illisible.') })
        return
      }
      setEtat({ charge: true, ...j })
    } catch {
      setEtat(e => ({ ...e, charge: true, horsLigne: true }))
    }
  }, [equipe.commercant_id])

  useEffect(() => {
    charger()
    const id = setInterval(charger, RAFRAICHIR_MS)
    const auRetour = () => { if (document.visibilityState === 'visible') charger() }
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('pageshow', auRetour)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', auRetour); window.removeEventListener('pageshow', auRetour) }
  }, [charger])

  // ─── LES GESTES (étape 3) ──────────────────────────────────────────────────
  //
  // ⚠️ CHAQUE GESTE SUIT LA SÉQUENCE DU TABLEAU DE BORD, route pour route :
  // la question (`questionRdv`, `questionEncaissement`), la route qui écrit,
  // puis celle qui prévient le client avec ce que la première a rendu. Le
  // serveur revérifie tout : la case, le commerce, le statut, le montant.
  const dire = (texte, ton = 'ok') => setAvis({ texte, ton })
  async function lire(res) {
    if (!res || res.sansSession) return { ok: false, error: 'Ta session a expiré, reconnecte-toi.' }
    if (res.erreurReseau) return { ok: false, error: 'Pas de connexion, réessaie.' }
    const j = await res.json().catch(() => null)
    return j || { ok: false, error: `Réponse illisible (${res.status}).` }
  }
  // Un client pas prévenu se DIT : l'écran ne fait pas comme si l'email était parti.
  async function prevenir(url, corps, quoi) {
    const r = await prevenirClient(url, corps, quoi)
    if (!r.ok) dire(`C’est enregistré, mais ${quoi} n’a pas pu partir (${r.erreur}). Préviens ton responsable.`, 'erreur')
    return r
  }
  async function geste(id, travail) {
    if (enCours) return
    setEnCours(id); setAvis(null)
    try { await travail() } finally { setEnCours(null); await charger() }
  }
  const categorie = etat.commerce?.categorie || null
  const gestesRdv = {
    venu: (rdv) => geste(rdv.id, async () => {
      let encaissement = null
      if (resteAEncaisser(rdv) > 0) {
        const choix = await confirmer(questionRdv('honore', rdv, categorie))
        if (!choix || choix === 'rien') return
        encaissement = choix
      }
      const j = await lire(await postPro('/api/equipe/rdv/venu', { rdv_id: rdv.id, encaissement }))
      if (!j.ok) { dire(j.error || 'Impossible de noter ce client venu.', 'erreur'); return }
      setRdvOuvert(null)
      dire('Client noté venu')
      await prevenir('/api/fidelite/rdv-honore', { rdv_id: rdv.id }, 'le crédit de fidélité du client')
      if (j.commande_id) await prevenir('/api/commande/produits-remis', { commande_id: j.commande_id }, 'la remise de ses produits')
    }),
    annuler: (rdv) => geste(rdv.id, async () => {
      // La question du patron, sans « déplacer » : ce geste arrive plus tard.
      const q = questionRdv('annule_commercant', rdv, categorie)
      const choix = await confirmer({ ...q, actions: (q.actions || []).filter(a => a.valeur !== 'deplacer') })
      const d = statutDepuisChoix('annule_commercant', choix)
      if (!d) return
      const j = await lire(await postPro('/api/rdv/annuler-commercant', { rdv_id: rdv.id, raison: d.raison }))
      if (!j.ok) { dire(j.error || 'La réservation n’a pas pu être annulée.', 'erreur'); return }
      setRdvOuvert(null)
      dire('Réservation annulée')
      await prevenir('/api/emails/rdv-annule', {
        rdv_id: rdv.id,
        raison_annulation: d.raison,
        refund_montant: j.refund_montant,
        refund_en_cours: !!j.refund_id && !j.refund_error,
        bon_rendu: j.bon_rendu,
        nb_bons: j.nb_bons,
        recompense_rendue: j.recompense_rendue,
        produits_montant: j.produits_montant,
      }, 'l’email d’annulation au client')
    }),
    absent: (rdv) => geste(rdv.id, async () => {
      const choix = await confirmer(questionRdv('no_show', rdv, categorie))
      const d = statutDepuisChoix('no_show', choix)
      if (!d) return
      const j = await lire(await postPro('/api/rdv/no-show', { rdv_id: rdv.id }))
      if (!j.ok) { dire(j.error || 'Ce client n’a pas pu être noté absent.', 'erreur'); return }
      setRdvOuvert(null)
      dire('Client noté absent')
      await prevenir('/api/emails/rdv-no-show', {
        rdv_id: rdv.id,
        bon_garde: j.garde_sur_bon,
        bon_restitue: j.bon_restitue,
        recompense_rendue: j.recompense_rendue,
      }, 'l’email « tu n’es pas venu »')
    }),
  }
  const gestesCommande = {
    avancer: (c) => geste(c.id, async () => {
      const vers = STATUT_SUIVANT[c.statut]
      let encaissement = null
      if (vers === 'recupere' && !c.encaisse_mode) {
        const reste = resteAEncaisserCommande(c)
        if (reste > 0) {
          const choix = await confirmer(questionEncaissement({ montant: reste, nom: c.client_nom }))
          if (!choix || choix === 'rien') return
          encaissement = choix
        }
      }
      const j = await lire(await postPro('/api/equipe/commande/statut', { commande_id: c.id, statut: vers, encaissement }))
      if (!j.ok) { dire(j.error || 'La commande n’a pas pu avancer.', 'erreur'); return }
      dire(vers === 'recupere' ? 'Commande remise' : vers === 'pret' ? 'Commande prête' : 'Préparation démarrée')
      if (vers === 'recupere') await prevenir('/api/fidelite/crediter', { commande_id: c.id }, 'le crédit de fidélité du client')
      if (vers === 'en_preparation' || vers === 'pret') await prevenir('/api/commande/push-statut', { commande_id: c.id, statut: vers }, 'la notification au client')
      if (vers === 'pret') await prevenir('/api/emails/commande-prete', { commande_id: c.id }, 'l’email « c’est prêt »')
    }),
    nonRetire: (c) => geste(c.id, async () => {
      const choix = await confirmer({
        titre: 'Commande non retirée ?',
        message: 'Le client n’est pas venu la chercher. Ses articles repartent en stock.',
        actions: [
          { valeur: 'oui', ton: 'danger', label: 'Oui, non retirée' },
          { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
        ],
      })
      if (choix !== 'oui') return
      const j = await lire(await postPro('/api/commande/non-retire', { commande_id: c.id }))
      if (!j.ok) { dire(j.error || 'La commande n’a pas pu être notée non retirée.', 'erreur'); return }
      dire('Commande notée non retirée')
    }),
  }

  const onglets = [
    etat.agenda && { cle: 'agenda', label: 'Agenda' },
    etat.commandes && { cle: 'commandes', label: 'Commandes' },
    etat.livraisons && { cle: 'livraisons', label: 'Livraisons' },
  ].filter(Boolean)
  const actif = onglet && onglets.some(o => o.cle === onglet) ? onglet : onglets[0]?.cle

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: '-0.4px' }}>{equipe.nom}</h1>
        {onChanger && <button type="button" onClick={onChanger} style={{ background: 'none', border: 'none', color: T.main, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Changer de commerce</button>}
      </div>

      {!etat.charge && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><DotsAttente couleur={T.main} label="Chargement du poste"/></div>}
      {etat.erreur && <p style={{ color: T.rouge, fontWeight: 700 }}>{etat.erreur}</p>}
      {etat.horsLigne && <p style={{ color: T.rouge, fontWeight: 700, fontSize: 13 }}>Pas de connexion : ce qui s&rsquo;affiche n&rsquo;est peut-être plus à jour.</p>}
      {avis && (
        <p role="status" style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, background: avis.ton === 'erreur' ? '#FEE2E2' : '#DCFCE7', color: avis.ton === 'erreur' ? T.rouge : T.vert }}>{avis.texte}</p>
      )}
      <PosteConfirmation/>

      {etat.charge && !etat.erreur && onglets.length === 0 && (
        <p style={{ color: T.muted }}>Tes cases ne donnent encore rien à afficher ici. Le comptoir arrive bientôt.</p>
      )}

      {onglets.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {onglets.map(o => <button key={o.cle} type="button" onClick={() => setOnglet(o.cle)} style={puce(actif === o.cle)}>{o.label}</button>)}
        </div>
      )}

      {actif === 'agenda' && etat.agenda && (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.filet}`, overflow: 'hidden' }}>
          <AgendaRdv rdvs={etat.agenda.rdvs} creneaux={etat.agenda.creneaux} praticiens={etat.agenda.praticiens}
            horairesDetail={etat.commerce?.horaires_detail} commercant={etat.commerce} onSelectRdv={setRdvOuvert}/>
        </div>
      )}
      {actif === 'commandes' && etat.commandes && <Commandes commandes={etat.commandes} commerce={etat.commerce} aujourdhui={etat.aujourdhui} gestes={etat.droits?.commandes ? gestesCommande : null} enCours={enCours}/>}
      {actif === 'livraisons' && etat.livraisons && <Livraisons livraisons={etat.livraisons}/>}

      {rdvOuvert && <DetailRdv rdv={rdvOuvert} commerce={etat.commerce} droits={etat.droits || {}} gestes={etat.droits?.agenda ? gestesRdv : null} enCours={enCours === rdvOuvert.id} onFermer={() => setRdvOuvert(null)}/>}
    </div>
  )
}
