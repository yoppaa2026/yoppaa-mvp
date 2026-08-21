'use client'
// DÉPLACER UN RENDEZ-VOUS, depuis la fiche du rendez-vous.
//
// ⚠️ CE GESTE N'EXISTAIT PAS. Le tableau de bord savait créer, clôturer,
// marquer un no-show et annuler. Décaler quelqu'un d'une heure obligeait donc à
// ANNULER puis RECRÉER : le client recevait « ton rendez-vous est annulé »,
// perdait son numéro, et l'historique du commerçant gardait la trace d'une
// annulation qui n'avait jamais eu lieu. C'est pourtant le geste le plus banal
// d'un agenda.
//
// Origine : la décision d'Alex du 15/08 sur les abonnements, « il faut pouvoir
// déplacer les RDV un à un ». Le besoin dépasse largement les abonnements.
//
// ⚠️ TROIS CHOSES BOUGENT ENSEMBLE, et en oublier une casse un module entier :
//   • la date et l'heure, évidemment ;
//   • LA PLACE sur le cours d'arrivée, sans quoi deux inscrits se disputent la
//     même et l'index unique refuse l'écriture ;
//   • LE LIEU GRAVÉ, sans quoi une commerçante itinérante envoie sa cliente à
//     l'adresse de l'ancien jour.
//
// La règle qui dit si un créneau accepte vit dans `lib/deplacement-rdv.js`,
// pure et partagée avec la création manuelle : deux copies auraient divergé.

import { useState, useEffect, useMemo } from 'react'
import { postPro } from '@/lib/fetch-pro'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { champsLieuPour } from '@/lib/lieu-fige'
import { capacitePrestation, premierePlaceLibre } from '@/lib/cours-collectifs'
import {
  creneauAcceptable, creneauxDuJour, deplacementUtile, champsDuDeplacement,
  heureDeFin, heureDeMinutes, minutesDeLHeure, jourCle, formatJour,
} from '@/lib/deplacement-rdv'

const T = {
  main:  '#6B35C4',
  mid:   '#9660E0',
  light: '#C4A0F4',
  pale:  '#EDE0FF',
  ink:   '#1A0840',
  deep:  '#2D0F6B',
  muted: '#6B7280',
}

// La date du jour au format de la base, calculée en heure LOCALE.
// `toISOString()` donnerait l'UTC, et un commerçant qui ouvre son agenda à 1h
// du matin en été verrait la veille proposée comme premier jour possible.
function aujourdhuiIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ModalDeplacerRdv({
  commercant, rdv, prestations = [], creneaux = [], rdvsExistants = [],
  onClose, onDeplace,
}) {
  const [date, setDate] = useState(rdv?.date_rdv || aujourdhuiIso())
  const [heure, setHeure] = useState(String(rdv?.heure_debut || '').slice(0, 5))
  const [prevenir, setPrevenir] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const presta = prestations.find(p => String(p.id) === String(rdv?.prestation_id)) || null
  // ⚠️ LA DURÉE VIENT DE LA RÉSERVATION, pas de la prestation d'aujourd'hui. Le
  // prix, la TVA et la durée sont figés à la réservation depuis le début du
  // projet : recalculer déplacerait un rendez-vous d'une heure vers une durée
  // de 45 minutes parce que le commerçant a modifié son catalogue entre-temps.
  const dureeMinutes = Number(rdv?.duree_minutes) || Number(presta?.duree_minutes) || 0
  const capacite = presta ? capacitePrestation(presta) : Math.max(1, Number(rdv?.capacite_creneau) || 1)
  const estCours = capacite > 1

  const jour = useMemo(() => (
    /^\d{4}-\d{2}-\d{2}$/.test(date) ? jourCle(new Date(`${date}T12:00:00`)) : null
  ), [date])
  const horaireJour = jour ? commercant?.horaires_detail?.[jour] : null
  const creneauxJour = useMemo(() => creneauxDuJour(creneaux, { dateStr: date, jour }), [creneaux, date, jour])

  const contexte = {
    dateStr: date,
    dureeMinutes,
    horaireJour,
    creneauxJour,
    rdvsExistants,
    capacite,
    prestationId: rdv?.prestation_id ?? null,
    // ⚠️ LE RENDEZ-VOUS NE SE CHEVAUCHE PAS LUI-MÊME. Sans cette exclusion, tout
    // décalage plus court qu'une prestation serait refusé, c'est-à-dire
    // précisément les petits décalages qu'on demande le plus souvent.
    exclureId: rdv?.id ?? null,
  }

  // LE VERDICT S'AFFICHE AVANT DE CONFIRMER, il ne sanctionne pas après coup.
  // Même principe que l'aperçu des abonnements : l'écran est le garde-fou.
  const verdict = useMemo(() => creneauAcceptable({ ...contexte, heureDebut: heure }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, heure, dureeMinutes, capacite, horaireJour, creneauxJour, rdvsExistants])

  // LES HEURES QUI RESTENT LIBRES CE JOUR-LÀ, proposées d'un tap.
  // Zéro friction : le commerçant ne devine pas ses propres trous, il les voit.
  const heuresLibres = useMemo(() => {
    if (!dureeMinutes || creneauxJour.length === 0) return []
    const trouvees = []
    for (const c of creneauxJour) {
      const debut = minutesDeLHeure(c?.heure_debut)
      const fin = minutesDeLHeure(c?.heure_fin)
      if (debut === null || fin === null) continue
      for (let m = debut; m + dureeMinutes <= fin; m += 15) {
        const h = heureDeMinutes(m)
        if (!h || trouvees.includes(h)) continue
        if (creneauAcceptable({ ...contexte, heureDebut: h }).ok) trouvees.push(h)
      }
    }
    return trouvees.sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dureeMinutes, capacite, horaireJour, creneauxJour, rdvsExistants])

  const utile = deplacementUtile(rdv, { date, heure })
  const peutValider = !!(date && heure && verdict.ok && utile && dureeMinutes > 0 && !submitting)
  const heureFin = heureDeFin(heure, dureeMinutes)
  const nomClient = [rdv?.client_prenom, rdv?.client_nom].filter(Boolean).join(' ') || 'ce client'

  async function valider() {
    if (!peutValider) return
    setSubmitting(true)
    setError(null)
    try {
      // ⚠️ LA PLACE SE LIT EN BASE, jamais dans l'état de l'écran, qui peut
      // avoir quelques minutes de retard. Et on s'EXCLUT de la lecture : sur un
      // déplacement à l'intérieur du même cours, on compterait sinon sa propre
      // place comme prise par quelqu'un d'autre.
      let placeNo = 1
      if (estCours) {
        const { data: dejaLa, error: errLecture } = await supabase
          .from('rdv_reservations')
          .select('id, place_no')
          .eq('commercant_id', commercant.id)
          .eq('prestation_id', rdv.prestation_id)
          .eq('date_rdv', date)
          .eq('heure_debut', heure)
          .in('statut', ['confirme', 'honore'])
          .is('deleted_at', null)
        if (errLecture) {
          setError(`Impossible de lire les places de ce cours : ${errLecture.message}`)
          setSubmitting(false)
          return
        }
        const prises = (dejaLa || []).filter(r => String(r.id) !== String(rdv.id)).map(r => r.place_no)
        const libre = premierePlaceLibre({ capacite }, prises)
        if (libre === null) {
          setError(`Ce cours est complet à cette heure-là (${capacite} personnes). Choisis un autre créneau.`)
          setSubmitting(false)
          return
        }
        placeNo = libre
      }

      // ⚠️ LE LIEU SE REGRAVE AU NOUVEAU JOUR. Un food truck ou une prof de
      // yoga itinérante n'est pas au même endroit le lundi et le jeudi : garder
      // l'ancien lieu enverrait la cliente à la mauvaise adresse, et c'est
      // exactement le défaut que le module LIEUX a corrigé le 13/08.
      const lieu = await champsLieuPour(supabase, commercant, { jour: date, heure })

      const ancienneDate = rdv.date_rdv
      const ancienneHeure = rdv.heure_debut
      const maj = champsDuDeplacement({ date, heure, dureeMinutes, placeNo, capacite, champsLieu: lieu })

      const { error: errMaj } = await supabase
        .from('rdv_reservations')
        .update(maj)
        .eq('id', rdv.id)

      if (errMaj) {
        if (errMaj.code === '23505') {
          setError(estCours
            ? 'Une place vient d\'être prise pendant ta saisie. Réessaie, la suivante sera calculée.'
            : 'Ce créneau vient d\'être pris par un autre RDV. Recharge ton agenda.')
        } else {
          setError(`Erreur : ${errMaj.message || 'inconnue'}`)
        }
        setSubmitting(false)
        return
      }

      // ⚠️ LE CLIENT DOIT L'APPRENDRE, sinon il vient à l'ancienne heure. Envoi
      // non bloquant : le déplacement est fait, l'email ne doit pas pouvoir
      // l'annuler. Le fichier calendrier joint porte un numéro de séquence
      // supérieur, ce qui DÉPLACE l'événement déjà présent chez le client au
      // lieu d'en créer un second.
      if (prevenir && rdv.client_email) {
        postPro('/api/emails/rdv-confirme', {
            rdv_id: rdv.id,
            deplace: true,
            ancienne_date: ancienneDate,
            ancienne_heure: ancienneHeure,
          }).catch(e => console.warn('[ModalDeplacerRdv] email de déplacement KO', e))
      }

      if (onDeplace) onDeplace({ ...rdv, ...maj })
      onClose()
    } catch (e) {
      console.error('[ModalDeplacerRdv] exception', e)
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

  if (!mounted || typeof document === 'undefined' || !rdv) return null

  return createPortal(
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,8,64,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 9999, padding: '1rem', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 460, background: '#fff', borderRadius: 18, overflow: 'hidden', marginTop: '2rem', marginBottom: '2rem', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 20px 60px rgba(22,6,54,0.4)' }}>

        <div style={{ background: `linear-gradient(135deg, #160636 0%, ${T.deep} 100%)`, color: '#fff', padding: '1rem 1.125rem', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.6rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.5px', margin: 0, marginBottom: 4, opacity: 0.85 }}>
                Déplacer le RDV de
              </p>
              <p style={{ fontSize: '1.05rem', fontWeight: 900, color: '#fff', margin: 0, letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {nomClient}<br/>
                <span style={{ color: T.light, fontSize: '0.85rem', fontWeight: 700 }}>
                  actuellement {formatJour(rdv.date_rdv)} à {String(rdv.heure_debut || '').slice(0, 5)}
                </span>
              </p>
            </div>
            <button onClick={onClose} aria-label="Fermer"
              style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', cursor: 'pointer', borderRadius: 10, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        <div style={{ padding: '1.125rem 1.125rem 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <label htmlFor="dep-date" style={labelSt}>Nouvelle date</label>
              <input id="dep-date" type="date" value={date} min={aujourdhuiIso()}
                onChange={(e) => setDate(e.target.value)} style={inputSt}/>
            </div>
            <div>
              <label htmlFor="dep-heure" style={labelSt}>Nouvelle heure</label>
              <input id="dep-heure" type="time" value={heure} step={900}
                onChange={(e) => setHeure(e.target.value)} style={inputSt}/>
            </div>
          </div>

          {/* Les heures encore libres ce jour-là. Le commerçant ne devine pas
              ses propres trous : il les voit et il tape dessus.
              ⚠️ Elles s'enroulent, elles ne défilent pas : une piste plus large
              que l'écran devrait annoncer qu'elle continue, et il n'y a aucune
              raison d'imposer ça ici. */}
          {heuresLibres.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span style={labelSt}>Créneaux libres {jour ? `le ${jour}` : ''}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {heuresLibres.map(h => {
                  const actif = h === heure
                  return (
                    <button key={h} onClick={() => setHeure(h)}
                      style={{
                        padding: '5px 11px', borderRadius: 100, cursor: 'pointer',
                        border: `1.5px solid ${actif ? T.main : T.pale}`,
                        background: actif ? T.main : '#fff',
                        color: actif ? '#fff' : T.deep,
                        fontWeight: 800, fontSize: '0.78rem', fontFamily: '"DM Sans", sans-serif',
                      }}>
                      {h}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* LE VERDICT, AVANT DE CONFIRMER */}
          {heure && dureeMinutes > 0 && (
            <div style={{
              borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: 12,
              background: verdict.ok ? (utile ? '#ECFDF5' : '#F9FAFB') : '#FEF2F2',
              border: `1.5px solid ${verdict.ok ? (utile ? '#A7F3D0' : '#E5E7EB') : '#FCA5A5'}`,
            }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.45, margin: 0,
                color: verdict.ok ? (utile ? '#065F46' : T.muted) : '#DC2626' }}>
                {!verdict.ok ? verdict.message
                  : !utile ? 'C\'est déjà la date et l\'heure de ce rendez-vous.'
                  : `Libre : ${formatJour(date)} de ${heure} à ${heureFin}${estCours ? ` · cours de ${capacite} places` : ''}`}
              </p>
            </div>
          )}

          {/* Prévenir le client */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 14, cursor: rdv.client_email ? 'pointer' : 'default' }}>
            <input type="checkbox" checked={prevenir && !!rdv.client_email} disabled={!rdv.client_email}
              onChange={(e) => setPrevenir(e.target.checked)}
              style={{ width: 17, height: 17, accentColor: T.main, marginTop: 1, flexShrink: 0 }}/>
            <span style={{ fontSize: '0.78rem', color: rdv.client_email ? T.deep : T.muted, fontWeight: 600, lineHeight: 1.45 }}>
              {rdv.client_email
                ? <>Prévenir {nomClient} par email, avec la mise à jour de son calendrier.</>
                : <>Pas d&apos;email pour ce client : préviens-le toi-même{rdv.client_telephone ? ` au ${rdv.client_telephone}` : ''}.</>}
            </span>
          </label>

          {error && (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: 12 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.4, margin: 0 }}>{error}</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0.75rem 1.125rem 1.125rem', borderTop: `1px solid ${T.pale}`, background: '#FAFAFA' }}>
          <button onClick={onClose} disabled={submitting}
            style={{ flex: 1, padding: '0.75rem', background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 100, color: T.muted, fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif' }}>
            Retour
          </button>
          <button onClick={valider} disabled={!peutValider}
            style={{
              flex: 2, padding: '0.75rem', border: 'none', borderRadius: 100,
              background: !peutValider ? '#D1D5DB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`,
              color: '#fff', fontWeight: 800, cursor: !peutValider ? 'default' : 'pointer',
              fontSize: '0.95rem', fontFamily: '"DM Sans", sans-serif',
              boxShadow: !peutValider ? 'none' : `0 4px 16px ${T.main}55`,
            }}>
            {submitting ? 'Déplacement…' : 'Déplacer le RDV ✓'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
