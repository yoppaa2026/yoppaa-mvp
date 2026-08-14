'use client'
// Modale "Nouveau RDV manuel" pour le commerçant vitrine.
// Déclenchée par tap sur un slot libre dans AgendaRdv.
// Saisie rapide : prestation + prénom + nom + tél (+ email/notes optionnels).
// Statut auto = 'confirme', source = 'commercant' (cf VITRINE-1).
// Pas de création de row clients : juste les champs RDV (decision Alex 2026-06-01).
// Validations server-side : overlap RDV existants + horaires shop + pause.

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { champsLieuPour } from '@/lib/lieu-fige'
import { capacitePrestation, premierePlaceLibre } from '@/lib/cours-collectifs'
import { creneauAcceptable, creneauxDuJour } from '@/lib/deplacement-rdv'

const T = {
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

const JOURS_KEY  = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_LONG = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']
const MOIS_LONG  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function timeToMinutes(t) {
  if (!t) return 0
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function jourIdxLun(d) { return (d.getDay() + 6) % 7 }

export default function ModalNouveauRdv({
  commercant, prestations, creneaux, rdvsExistants,
  dateInit, heureInit,
  onClose, onCreated,
}) {
  const [prestationId, setPrestationId] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  // Focus auto sur le select prestation à l'ouverture
  useEffect(() => {
    const el = document.getElementById('mn-rdv-presta')
    if (el) el.focus()
  }, [])

  // ESC pour fermer
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dateLabel = `${JOURS_LONG[jourIdxLun(dateInit)]} ${dateInit.getDate()} ${MOIS_LONG[dateInit.getMonth()]}`
  const presta = prestations.find(p => String(p.id) === String(prestationId))
  const dureeMin = presta?.duree_minutes
  const debutMin = timeToMinutes(heureInit)
  const finMin = dureeMin ? debutMin + dureeMin : null
  const heureFin = finMin != null ? minutesToTime(finMin) : null

  // Prix estimé selon prestation (prix fixe ou prix_min si variable)
  const prixEstime = presta
    ? (presta.prix != null ? Number(presta.prix) : (presta.prix_min != null ? Number(presta.prix_min) : null))
    : null

  const formValide = !!(prestationId && prenom.trim() && nom.trim() && tel.trim())

  async function valider() {
    if (!formValide || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const dateStr = isoDate(dateInit)
      const jourKey = JOURS_KEY[jourIdxLun(dateInit)]
      const horaireJour = commercant.horaires_detail?.[jourKey]
      // Logs diag : si la modale accepte un RDV qui chevauche pause/fermeture, on saura
      // immediatement quel input est manquant (creneaux vide, horaireJour null, etc.)
      console.info('[ModalNouveauRdv] valider — context', {
        dateStr, jourKey, heureInit, dureeMin, debutMin, finMin,
        horaireJour,
        nbCreneaux: (creneaux || []).length,
        nbRdvsExistants: (rdvsExistants || []).length,
      })
      // 1) CE CRÉNEAU ACCEPTE-T-IL CE RENDEZ-VOUS ?
      //
      // ⚠️ LA RÈGLE A DÉMÉNAGÉ DANS `lib/deplacement-rdv.js`, et ce n'est pas
      // un rangement. Le déplacement d'un rendez-vous, livré le 15/08, doit
      // poser EXACTEMENT les mêmes questions que la création : chevauchement,
      // jour de fermeture, heures d'ouverture, pause, dépassement de créneau.
      // Deux copies de cinq contrôles auraient divergé au premier correctif, et
      // le commerçant aurait obtenu un créneau par une porte et un refus par
      // l'autre. Elle est PURE, donc le banc l'exécute au lieu de la lire.
      //
      // Elle distingue toujours deux natures de superposition : les CO-INSCRITS
      // d'un même cours, qui ne sont pas un conflit tant qu'il reste de la
      // place, et tout le reste, qui en est un.
      //
      // Un seul changement d'ordre : les contrôles de structure (fermeture,
      // horaires, pause) passent désormais AVANT le calcul des places. Un
      // rendez-vous posé un jour de fermeture disait « ce cours est complet »,
      // il dit maintenant « ton commerce est fermé ce jour-là », ce qui est la
      // vraie raison.
      const capacite = capacitePrestation(presta)
      const verdict = creneauAcceptable({
        dateStr,
        heureDebut: heureInit,
        dureeMinutes: dureeMin,
        horaireJour,
        creneauxJour: creneauxDuJour(creneaux, { dateStr, jour: jourKey }),
        rdvsExistants,
        capacite,
        prestationId: presta.id,
      })
      if (!verdict.ok) {
        console.warn('[ModalNouveauRdv] créneau refusé', verdict)
        setError(verdict.message)
        setSubmitting(false)
        return
      }

      // ⚠️ LES PLACES SE LISENT EN BASE, JAMAIS DANS L'ÉTAT DE L'ÉCRAN. L'agenda
      // peut avoir quelques minutes de retard, et une place attribuée deux fois
      // serait rejetée par l'index unique avec un message incompréhensible.
      let placeNo = 1
      if (capacite > 1) {
        const { data: dejaLa } = await supabase
          .from('rdv_reservations')
          .select('place_no')
          .eq('commercant_id', commercant.id)
          .eq('prestation_id', presta.id)
          .eq('date_rdv', dateStr)
          .eq('heure_debut', heureInit)
          .in('statut', ['confirme', 'honore'])
          .is('deleted_at', null)
        const prises = (dejaLa || []).map(r => r.place_no)
        const libre = premierePlaceLibre(presta, prises)
        if (libre === null) {
          setError(`Ce cours est complet (${capacite} personne${capacite > 1 ? 's' : ''}).`)
          setSubmitting(false)
          return
        }
        placeNo = libre
      }

      // 2) Acompte (figé selon prestation ou pourcent global)
      const acomptePct = presta.acompte_pourcent || commercant.rdv_acompte_global || 0
      const acompteMontant = (prixEstime != null && acomptePct > 0)
        ? Math.round(prixEstime * acomptePct) / 100
        : null

      // 3) Insert
      const rdvId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : null
      const payload = {
        ...(rdvId ? { id: rdvId } : {}),
        commercant_id: commercant.id,
        client_id: null,                    // saisie manuelle, pas de lien clients (decision Alex)
        prestation_id: presta.id,
        client_email: email.trim() || null,
        client_prenom: prenom.trim(),
        client_nom: nom.trim(),
        client_telephone: tel.trim(),
        date_rdv: dateStr,
        heure_debut: heureInit,
        heure_fin: heureFin,
        duree_minutes: dureeMin,
        prix_estime: prixEstime,
        acompte_montant: acompteMontant,
        acompte_paye: false,
        statut: 'confirme',
        // TVA figée à la réservation : recalculer plus tard depuis la
        // prestation réécrirait l'historique au moindre changement de taux.
        tva_taux: presta.tva_taux ?? null,
        notes_client: notes.trim() || null,
        rgpd_marketing: false,
        source: 'commercant',               // distingue des RDVs pris en ligne par un Yopper
        // ⚠️ LA PLACE ET LA CAPACITÉ, GRAVÉES ICI AUSSI. Sans `place_no`, deux
        // inscrits d'un même cours se disputaient la place 1 et l'index unique
        // renvoyait « ce créneau vient d'être pris » devant un cours vide. Sans
        // `capacite_creneau`, la contrainte d'exclusion, active quand elle vaut
        // 1, bloquait le deuxième inscrit dès qu'un praticien était nommé.
        place_no: placeNo,
        capacite_creneau: capacite,
      }
      // ⚠️ LE LIEU EST GRAVÉ À LA RÉSERVATION, ici aussi. Un rendez-vous pris
      // au comptoir par le commerçant doit dire où aller comme les autres.
      Object.assign(payload, await champsLieuPour(supabase, commercant, { jour: dateStr, heure: heureInit }))
      const { error: errInsert } = await supabase.from('rdv_reservations').insert(payload)
      if (errInsert) {
        if (errInsert.code === '23505') {
          // ⚠️ SUR UN COURS, CE MESSAGE MENTAIT. La place calculée juste avant
          // vient d'être prise par quelqu'un d'autre : le cours n'est pas
          // « déjà pris », il a simplement bougé pendant la saisie.
          setError(capacite > 1
            ? 'Une place vient d\'être prise pendant ta saisie. Réessaie, la suivante sera calculée.'
            : 'Ce créneau exact vient d\'être pris (autre RDV identique). Recharge ton agenda.')
        } else {
          setError(`Erreur : ${errInsert.message || 'inconnue'}`)
        }
        setSubmitting(false)
        return
      }

      // 4) Email de confirmation au Yopper (non-bloquant, fire-and-forget).
      //    Pas d'email commercant (c'est lui qui cree le RDV, il sait deja).
      if (rdvId && (email.trim() || null)) {
        fetch('/api/emails/rdv-confirme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rdv_id: rdvId }),
        }).catch(e => console.warn('[ModalNouveauRdv] emails fire-and-forget KO', e))
      }

      // 5) Success : callback + close
      if (onCreated) onCreated()
      onClose()

    } catch (e) {
      console.error('[ModalNouveauRdv] exception', e)
      setError(`Erreur inattendue : ${e?.message || String(e)}`)
      setSubmitting(false)
    }
  }

  const inputSt = {
    width: '100%', padding: '0.625rem 0.875rem', borderRadius: 10,
    border: `1.5px solid ${T.pale}`, fontSize: '0.9rem',
    fontFamily: '"DM Sans", sans-serif', color: T.ink,
    background: '#fff', outline: 'none', boxSizing: 'border-box',
  }
  const labelSt = { fontSize: '0.65rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }

  // React Portal : rend la modale au niveau document.body, ce qui la fait sortir de tous
  // les stacking contexts du dashboard (sidebar, topbar, ancestors avec transform/filter).
  // Sans le portal, la modale etait partiellement masquee par le layout dashboard.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted || typeof document === 'undefined') return null

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, padding: '1rem', backdropFilter: 'blur(4px)', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, overflow: 'hidden', marginTop: '2rem', marginBottom: '2rem', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 20px 60px rgba(22,6,54,0.4)' }}>

        {/* Header sombre canonique Yoppaa */}
        <div style={{ background: `linear-gradient(135deg, ${T.bgPanel || '#160636'} 0%, ${T.deep} 100%)`, color: '#fff', padding: '1rem 1.125rem', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', margin: 0, marginBottom: 4, opacity: 0.85 }}>
                Nouveau RDV manuel
              </p>
              <p style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {dateLabel}<br/>
                <span style={{ color: T.light }}>à {heureInit}{heureFin ? ` – ${heureFin}` : ''}</span>
              </p>
            </div>
            <button onClick={onClose} aria-label="Fermer"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer', borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* Body — form */}
        <div style={{ padding: '1.125rem 1.125rem 0' }}>
          {/* Prestation */}
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="mn-rdv-presta" style={labelSt}>Prestation *</label>
            <select id="mn-rdv-presta" value={prestationId} onChange={(e) => setPrestationId(e.target.value)} style={inputSt}>
              <option value="">— Choisir une prestation —</option>
              {(prestations || []).map(p => {
                const prix = p.prix != null ? `${Number(p.prix).toFixed(0)}€` : (p.prix_min != null ? `dès ${Number(p.prix_min).toFixed(0)}€` : '')
                return (
                  <option key={p.id} value={p.id}>
                    {p.nom} · {p.duree_minutes}min{prix ? ` · ${prix}` : ''}
                  </option>
                )
              })}
            </select>
            {presta && heureFin && (
              <p style={{ fontSize: '0.72rem', color: T.main, fontWeight: 700, marginTop: 5 }}>
                RDV de {dureeMin}min : {heureInit} → {heureFin}{prixEstime != null ? ` · ${prixEstime.toFixed(0)}€` : ''}
              </p>
            )}
          </div>

          {/* Identite client : 2 colonnes */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelSt}>Prénom *</label>
              <input type="text" value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Marie" style={inputSt} autoComplete="off"/>
            </div>
            <div>
              <label style={labelSt}>Nom *</label>
              <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Dupont" style={inputSt} autoComplete="off"/>
            </div>
          </div>

          {/* Tel + email */}
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Téléphone *</label>
            <input type="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="0472 ..." style={inputSt} autoComplete="off"/>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={labelSt}>Email (optionnel)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="marie.dupont@..." style={inputSt} autoComplete="off"/>
            <p style={{ fontSize: '0.68rem', color: T.muted, marginTop: 3 }}>
              Renseigne pour envoyer une confirmation par mail. Laisse vide sinon.
            </p>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Notes (optionnel)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Demande particulière, allergie, etc." rows={2}
              style={{ ...inputSt, resize: 'vertical', minHeight: 56 }}/>
          </div>

          {/* Erreur */}
          {error && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: 12 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.4, margin: 0 }}>{error}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', gap: 8, padding: '0.75rem 1.125rem 1.125rem', borderTop: `1px solid ${T.pale}`, background: '#FAFAFA' }}>
          <button onClick={onClose} disabled={submitting}
            style={{ flex: 1, padding: '0.75rem', background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif' }}>
            Annuler
          </button>
          <button onClick={valider} disabled={!formValide || submitting}
            style={{
              flex: 2, padding: '0.75rem', border: 'none', borderRadius: 100,
              background: (!formValide || submitting) ? '#D1D5DB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`,
              color: '#fff', fontWeight: 800, cursor: (!formValide || submitting) ? 'default' : 'pointer',
              fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif',
              boxShadow: (!formValide || submitting) ? 'none' : `0 4px 16px ${T.main}55`,
            }}>
            {submitting ? 'Enregistrement…' : 'Confirmer le RDV ✓'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
