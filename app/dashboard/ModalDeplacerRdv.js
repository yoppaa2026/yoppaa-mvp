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
import { capacitePrestation, premierePlaceLibre, rangLibre, estParCouverts, couvertsDe } from '@/lib/cours-collectifs'
import {
  creneauAcceptable, creneauxDuJour, deplacementUtile, champsDuDeplacement,
  heureDeFin, heureDeMinutes, minutesDeLHeure, jourCle, formatJour,
} from '@/lib/deplacement-rdv'
import { enModeInventaire, etatSalle, tableAPoser, phraseSalle, lireSalleDuJour } from '@/lib/inventaire-salle'

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
  // 🔴 UNE TABLE N'EST PAS UN COURS, ICI NON PLUS (10/09). `capacite > 1`
  // classait chaque table en cours : déplacer une réservation de restaurant
  // annonçait « cours de 24 places » et cherchait sa place dans son seul
  // format, où l'index la rejetait dès qu'une table voisine partait à la même
  // heure. Sans prestation (supprimée depuis), on ne peut pas savoir : on garde
  // la lecture d'avant.
  const estTable = presta ? estParCouverts(presta) : false
  const estCours = !estTable && capacite > 1

  // 🔴 LA SALLE SE COMPTE AUSSI QUAND ON DÉPLACE (10/09 au soir). Décaler une
  // table de quatre à une heure où elles sont toutes prises passait sans un
  // mot : elle se comptait sur des tables pleines, et celle où elle s'assiéra
  // vraiment restait « libre » pour la fiche en ligne. Même règle que la saisie
  // au téléphone, mêmes fonctions que le serveur, lecture fraîche en base.
  //
  // ⚠️ SEULEMENT QUAND LA SALLE SE COMPTE EN TABLES : sans inventaire, rien ne
  // permet de dire « libre », et le déplacement reste celui d'avant.
  const salleEnTables = estTable && enModeInventaire(prestations)
  const couvertsRdv = couvertsDe(rdv)
  const [salle, setSalle] = useState({ etat: 'repos', reservations: [], date: null })
  const [relire, setRelire] = useState(0)
  useEffect(() => {
    if (!salleEnTables || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return
    let annule = false
    setSalle({ etat: 'lecture', reservations: [], date })
    lireSalleDuJour(supabase, { commercantId: commercant.id, dateStr: date }).then(({ reservations, error }) => {
      if (annule) return
      setSalle(error
        ? { etat: 'erreur', reservations: [], date, message: error.message }
        : { etat: 'ok', reservations, date })
    }).catch(e => {
      // ⚠️ UNE LECTURE QUI LÈVE NE LAISSE PAS « JE REGARDE TA SALLE » À VIE.
      if (!annule) setSalle({ etat: 'erreur', reservations: [], date, message: e?.message || String(e) })
    })
    return () => { annule = true }
  }, [salleEnTables, commercant.id, date, relire])
  const salleConnue = salleEnTables && salle.etat === 'ok' && salle.date === date

  // La table que la salle donne à cette réservation, à cette heure-là.
  // ⚠️ `basculer` : personne n'a choisi de table en déplaçant, seulement une
  // heure. Si la sienne est prise et qu'une autre convient, elle y passe.
  // ⚠️ `exclureId` : à son ancienne heure, elle ne se gêne pas elle-même.
  const tablePour = (h, reservations) => {
    const d = minutesDeLHeure(h)
    if (d === null || !(dureeMinutes > 0)) return null
    const etat = etatSalle({
      formats: prestations, couverts: couvertsRdv, reservations,
      debutMin: d, finMin: d + dureeMinutes, exclureId: rdv?.id,
    })
    return { ...tableAPoser(etat, { prefere: rdv?.prestation_id, basculer: true }), etat }
  }

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
    // 🔴 ET DEUX TABLES NE SE GÊNENT PAS : sans le catalogue, décaler une table
    // de 19h à 19h30 était refusé dès qu'une autre était assise à 19h.
    prestations,
  }

  // LE VERDICT S'AFFICHE AVANT DE CONFIRMER, il ne sanctionne pas après coup.
  // Même principe que l'aperçu des abonnements : l'écran est le garde-fou.
  const verdict = useMemo(() => creneauAcceptable({ ...contexte, heureDebut: heure }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [date, heure, dureeMinutes, capacite, horaireJour, creneauxJour, rdvsExistants, prestations])

  // LES HEURES QUI RESTENT LIBRES CE JOUR-LÀ, proposées d'un tap.
  // Zéro friction : le commerçant ne devine pas ses propres trous, il les voit.
  //
  // 🔴 « LIBRES » DOIT ÊTRE VRAI POUR UNE TABLE AUSSI (10/09 au soir). Ces
  // pastilles ne regardaient que les horaires : elles proposaient d'un tap une
  // heure où toutes les tables étaient prises. Une heure ne s'affiche donc
  // qu'une fois la salle lue, et seulement si une table y est libre sur tout
  // le repas. Un message qui affirme sans avoir vérifié est pire qu'absent.
  const heuresLibres = useMemo(() => {
    if (!dureeMinutes || creneauxJour.length === 0) return []
    if (salleEnTables && !salleConnue) return []
    const trouvees = []
    for (const c of creneauxJour) {
      const debut = minutesDeLHeure(c?.heure_debut)
      const fin = minutesDeLHeure(c?.heure_fin)
      if (debut === null || fin === null) continue
      for (let m = debut; m + dureeMinutes <= fin; m += 15) {
        const h = heureDeMinutes(m)
        if (!h || trouvees.includes(h)) continue
        if (!creneauAcceptable({ ...contexte, heureDebut: h }).ok) continue
        if (salleEnTables) {
          const t = tablePour(h, salle.reservations)
          if (!t?.format || t.forcer) continue
        }
        trouvees.push(h)
      }
    }
    return trouvees.sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, dureeMinutes, capacite, horaireJour, creneauxJour, rdvsExistants, prestations, salleEnTables, salleConnue, salle])

  const utile = deplacementUtile(rdv, { date, heure })
  const heureFin = heureDeFin(heure, dureeMinutes)

  // Ce que la salle répond à cette heure-là, et ce qu'elle empêche de dire.
  // ⚠️ TANT QU'ELLE N'EST PAS LUE, ON NE DIT PAS « LIBRE » : c'est précisément
  // ce qu'on ne sait pas encore.
  const choixTable = salleConnue ? tablePour(heure, salle.reservations) : null
  const messageSalle = choixTable
    ? phraseSalle({ formats: prestations, etat: choixTable.etat, choix: choixTable, couverts: couvertsRdv, debut: heure, fin: heureFin, deplacement: true, actuel: presta })
    : null
  const salleAttend = salleEnTables && verdict.ok && utile && !salleConnue
  // ✅ DÉCISION D'ALEX, 10/09 : prévenir, puis laisser faire.
  const salleAlerte = salleEnTables && verdict.ok && utile && !!choixTable && (choixTable.forcer || choixTable.raison === 'trop_grand')
  const peutValider = !!(date && heure && verdict.ok && utile && dureeMinutes > 0 && !submitting && !salleAttend)
  const nomClient = [rdv?.client_prenom, rdv?.client_nom].filter(Boolean).join(' ') || 'ce client'

  async function valider() {
    if (!peutValider) return
    setSubmitting(true)
    setError(null)
    try {
      // ─── LA SALLE, RELUE AU MOMENT D'ÉCRIRE ─────────────────────────────────
      //
      // ⚠️ CE QUE L'ÉCRAN A MONTRÉ N'EST PAS UNE PREUVE : une table a pu être
      // réservée en ligne depuis. Si la réponse de la salle change, on n'écrit
      // RIEN, on montre la salle telle qu'elle est.
      let tableFinale = presta
      if (salleEnTables) {
        const frais = await lireSalleDuJour(supabase, { commercantId: commercant.id, dateStr: date })
        if (frais.error) {
          setError(`Impossible de lire ta salle : ${frais.error.message}`)
          setSubmitting(false)
          return
        }
        const choixFrais = tablePour(heure, frais.reservations)
        const pareil = !!choixFrais && !!choixTable
          && String(choixFrais.format?.id ?? '') === String(choixTable.format?.id ?? '')
          && choixFrais.forcer === choixTable.forcer
          && choixFrais.raison === choixTable.raison
        if (!pareil) {
          setSalle({ etat: 'ok', reservations: frais.reservations, date })
          setError('Ta salle a changé pendant la saisie. Relis ce qui est proposé, puis confirme.')
          setSubmitting(false)
          return
        }
        // Aucune table n'accueille plus ce groupe : elle garde la sienne.
        tableFinale = choixFrais.format || presta
      }

      // ⚠️ LA PLACE SE LIT EN BASE, jamais dans l'état de l'écran, qui peut
      // avoir quelques minutes de retard. Et on s'EXCLUT de la lecture : sur un
      // déplacement à l'intérieur du même cours, on compterait sinon sa propre
      // place comme prise par quelqu'un d'autre.
      let placeNo = 1
      if (estTable) {
        // 🔴 LE RANG D'UNE TABLE SE CHERCHE PARMI TOUTES LES RÉSERVATIONS DE
        // L'HEURE (10/09), tous formats confondus, en s'excluant soi-même. Même
        // règle que le serveur et que la saisie : `rangLibre`.
        const { data: memeHeure, error: errRangs } = await supabase
          .from('rdv_reservations')
          .select('id, place_no')
          .eq('commercant_id', commercant.id)
          .eq('date_rdv', date)
          .eq('heure_debut', heure)
          .in('statut', ['confirme', 'honore'])
          .is('deleted_at', null)
        if (errRangs) {
          setError(`Impossible de lire les tables déjà posées à cette heure : ${errRangs.message}`)
          setSubmitting(false)
          return
        }
        placeNo = rangLibre((memeHeure || []).filter(r => String(r.id) !== String(rdv.id)).map(r => r.place_no))
      } else if (estCours) {
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
      // 🔴 LA TABLE SUIT LA SALLE (10/09 au soir) : si la sienne est prise à la
      // nouvelle heure, elle passe sur celle qui est libre, avec sa capacité.
      // ⚠️ LE PRIX ET LA TVA NE BOUGENT PAS : ils sont figés à la réservation, et
      // un déplacement ne renégocie rien avec le client.
      const tableChange = salleEnTables && tableFinale && String(tableFinale.id) !== String(rdv.prestation_id)
      const maj = champsDuDeplacement({
        date, heure, dureeMinutes, placeNo,
        capacite: tableChange ? capacitePrestation(tableFinale) : capacite,
        champsLieu: lieu,
        prestationId: tableChange ? tableFinale.id : null,
      })

      const { error: errMaj } = await supabase
        .from('rdv_reservations')
        .update(maj)
        .eq('id', rdv.id)

      if (errMaj) {
        if (errMaj.code === '23505') {
          setError(estTable
            ? 'Une autre table vient d\'être posée à la même heure pendant ta saisie. Réessaie, le rang suivant sera calculé.'
            : estCours
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

          {/* LE VERDICT, AVANT DE CONFIRMER.
              ⚠️ PAS DE « LIBRE » POUR UNE TABLE tant que la salle n'est pas lue,
              ni quand elle n'a plus rien : c'est l'encadré de la salle, juste
              en dessous, qui parle alors. */}
          {heure && dureeMinutes > 0 && !salleAttend && !salleAlerte && (
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

          {/* ─── LA SALLE, QUAND C'EST UNE TABLE ───────────────────────────── */}
          {salleEnTables && verdict.ok && utile && heure && dureeMinutes > 0 && (
            salle.etat === 'erreur' ? (
              <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: 12 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.45, margin: 0 }}>
                  Impossible de lire ta salle{salle.message ? ` : ${salle.message}` : ''}.
                </p>
                <button type="button" onClick={() => setRelire(n => n + 1)}
                  style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, color: T.main, fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: '"DM Sans", sans-serif' }}>
                  Réessayer
                </button>
              </div>
            ) : salleAttend ? (
              <p style={{ fontSize: '0.78rem', color: T.muted, margin: '0 0 12px' }}>Je regarde ta salle…</p>
            ) : messageSalle ? (
              <div style={{
                borderRadius: 10, padding: '0.625rem 0.875rem', marginBottom: 12,
                background: messageSalle.ton === 'ok' ? `${T.main}0D` : '#FFFBEB',
                border: `1.5px solid ${messageSalle.ton === 'ok' ? `${T.main}33` : '#FCD34D'}`,
              }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 800, lineHeight: 1.45, margin: 0, color: messageSalle.ton === 'ok' ? T.deep : '#92400E' }}>
                  {messageSalle.titre}
                </p>
                {messageSalle.detail && (
                  <p style={{ fontSize: '0.75rem', color: T.deep, margin: '4px 0 0', lineHeight: 1.5 }}>{messageSalle.detail}</p>
                )}
              </div>
            ) : null
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
            {submitting ? 'Déplacement…' : salleAlerte ? 'Déplacer quand même ✓' : 'Déplacer le RDV ✓'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
