'use client'
// « FERMETURES ET HORAIRES EXCEPTIONNELS » : LA LISTE UNIQUE (16/10).
//
// ✅ ALEX, 16/10 (tableau, suite au rendez-vous d'Aux Délices des 7 Abbayes) :
//   • UNE seule liste pour tout le commerce : commandes, livraison, boutique,
//     rendez-vous et tables (avant : une liste dans « Créneaux », une autre
//     dans l'agenda, qui ne se parlaient pas) ;
//   • « Fermé du … au … » OU « Horaires adaptés du … au … », une ou deux plages ;
//   • rangée SOUS les horaires d'ouverture, et ouverte d'un geste par le bouton
//     en haut du tableau de bord ;
//   • les commandes et rendez-vous déjà pris sont MONTRÉS, et le commerçant
//     choisit de les annuler (client prévenu et remboursé) ou de les garder.
//
// La règle vit dans lib/horaires-du-jour.js (ce que la ligne fait aux horaires)
// et lib/fermetures-touches.js (ce qu'elle rattrape). Cet écran ne décide rien.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { postPro, prevenirClient } from '@/lib/fetch-pro'
import DotsAttente from '@/app/components/DotsAttente'
import { COLONNES_EXCEPTIONS, phraseException } from '@/lib/horaires-du-jour'
import { commandesTouchees, rdvsTouches, erreurException, ligneException, bilanAnnulationFermeture } from '@/lib/fermetures-touches'
import { referenceCommande } from '@/lib/numero-commande'
import { jourBruxelles } from '@/lib/timezone'

const T = {
  ink: '#1A0840', deep: '#2D0F6B', main: '#6B21D4', muted: '#6B7280',
  pale: '#EDE0FF', filet: '#E5E7EB', fond: '#F8F6FF',
  alerte: '#B45309', alerteFond: '#FFFBEB', alerteFilet: '#FDE68A', rouge: '#DC2626',
}
const champ = { padding: '8px 10px', borderRadius: 9, border: `1.5px solid ${T.filet}`, fontSize: 13, color: T.ink, background: '#fff', fontFamily: 'inherit' }
const etiquette = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px' }
const bouton = (plein) => ({
  padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontWeight: 800, fontSize: 13, fontFamily: 'inherit',
  border: plein ? 'none' : `1.5px solid ${T.filet}`, background: plein ? T.ink : '#fff', color: plein ? '#fff' : T.ink,
  display: 'inline-flex', alignItems: 'center', gap: 6,
})

const STATUTS_A_SERVIR = ['en_attente', 'en_preparation', 'pret']

function formulaireVide(jour) {
  return { id: null, adaptes: false, date_debut: jour, date_fin: jour, plage1_debut: '09:00', plage1_fin: '13:00', avecPlage2: false, plage2_debut: '14:00', plage2_fin: '18:00', motif: '' }
}

/**
 * @param commercantId
 * @param toast            (message, type?) => void
 * @param formulaireOuvert ouvrir directement l'ajout (le bouton du haut)
 * @param onChange         appelé après chaque écriture (pour recharger l'agenda)
 * @param onFermer         le bouton du haut referme sa fenêtre
 */
export default function FermeturesExceptionnelles({ commercantId, toast = () => {}, formulaireOuvert = false, onChange, onFermer }) {
  const aujourdhui = jourBruxelles()
  const [liste, setListe] = useState([])
  const [chargement, setChargement] = useState(true)
  const [form, setForm] = useState(formulaireOuvert ? formulaireVide(aujourdhui) : null)
  const [ecriture, setEcriture] = useState(false)
  const [aSupprimer, setASupprimer] = useState(null)
  // Ce que la ligne en cours de saisie rattrape, puis, une fois écrite, ce
  // qu'on en fait.
  const [touchees, setTouchees] = useState({ commandes: [], rdvs: [] })
  const [apres, setApres] = useState(null)
  const [annulation, setAnnulation] = useState(false)
  const [bilan, setBilan] = useState(null)

  const charger = useCallback(async () => {
    if (!commercantId) return
    setChargement(true)
    const { data, error } = await supabase.from('fermetures_exceptionnelles').select(COLONNES_EXCEPTIONS)
      .eq('commercant_id', commercantId).gte('date_fin', aujourdhui).order('date_debut', { ascending: true })
    if (error) toast('Impossible de lire tes fermetures. Recharge la page.', 'error')
    setListe(data || [])
    setChargement(false)
  // ⚠️ SANS `toast` : une fonction recréée à chaque rendu du parent relancerait
  // la lecture en boucle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercantId, aujourdhui])
  useEffect(() => { charger() }, [charger])

  const erreur = form ? erreurException(form) : null
  const candidate = useMemo(() => (form && !erreur ? { ...ligneException({ commercantId, ...form }), id: form.id } : null), [form, erreur, commercantId])
  // ⚠️ L'APERÇU NE SE RELIT QUE QUAND LES DATES OU LES HEURES CHANGENT : le
  // motif n'y change rien, et quatre lectures par lettre tapée, c'est trop.
  const cleApercu = candidate
    ? [candidate.date_debut, candidate.date_fin, candidate.plage1_debut, candidate.plage1_fin, candidate.plage2_debut, candidate.plage2_fin].join('|')
    : ''

  // ⚠️ L'APERÇU SE CALCULE PENDANT LA SAISIE, par la règle du serveur : le
  // commerçant voit ce que sa fermeture rattrape AVANT d'enregistrer.
  useEffect(() => {
    if (!candidate) { setTouchees({ commandes: [], rdvs: [] }); return }
    let vivant = true
    ;(async () => {
      const [cmd, cren, liv, rdv] = await Promise.all([
        supabase.from('commandes')
          .select('id, numero_commande, numero_prefixe, date_commande, statut, client_nom, creneau_id, creneau_livraison_id, mode_retrait')
          .eq('commercant_id', commercantId).in('statut', STATUTS_A_SERVIR)
          .gte('date_commande', candidate.date_debut).lte('date_commande', candidate.date_fin),
        supabase.from('creneaux').select('id, heure_debut, heure_fin').eq('commercant_id', commercantId),
        supabase.from('livraison_creneaux').select('id, heure_debut, heure_fin').eq('commercant_id', commercantId),
        supabase.from('rdv_reservations')
          .select('id, date_rdv, heure_debut, heure_fin, client_prenom, client_nom, praticien_id, statut, deleted_at, prestation:rdv_prestations(nom, par_couverts)')
          .eq('commercant_id', commercantId).eq('statut', 'confirme').is('deleted_at', null)
          .gte('date_rdv', candidate.date_debut).lte('date_rdv', candidate.date_fin)
          .order('date_rdv', { ascending: true }).order('heure_debut', { ascending: true }),
      ])
      if (!vivant) return
      const parId = new Map([...(cren.data || []), ...(liv.data || [])].map(c => [String(c.id), c]))
      const commandes = (cmd.data || []).map(c => ({ ...c, creneau: parId.get(String(c.creneau_id || c.creneau_livraison_id)) || null }))
      setTouchees({ commandes: commandesTouchees(commandes, candidate), rdvs: rdvsTouches(rdv.data || [], candidate) })
    })()
    return () => { vivant = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- relu sur `cleApercu` seulement (dates et heures), voir plus haut
  }, [cleApercu, commercantId])

  async function enregistrer() {
    if (!form || erreur || ecriture) return
    setEcriture(true)
    const ligne = ligneException({ commercantId, ...form })
    const { data: ecrite, error } = form.id
      ? await supabase.from('fermetures_exceptionnelles').update(ligne).eq('id', form.id).select('id').maybeSingle()
      : await supabase.from('fermetures_exceptionnelles').insert(ligne).select('id').maybeSingle()
    setEcriture(false)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    // 🔴 LES FILES D'ATTENTE D'UN JOUR FERMÉ SE VIDENT (comme depuis l'agenda,
    // 04/10). AU MIEUX : la fermeture est posée, une panne ici ne la défait pas.
    if (ecrite?.id && !form.adaptes) {
      postPro('/api/rdv/fermeture-file', { exception_id: ecrite.id })
        .catch(e => console.warn('[fermetures] listes d’attente non vidées', e))
    }
    toast(form.adaptes ? 'Horaires adaptés enregistrés' : 'Fermeture enregistrée')
    onChange?.()
    const restent = touchees
    setForm(null)
    charger()
    if (restent.commandes.length + restent.rdvs.length > 0) setApres(restent)
    else onFermer?.()
  }

  async function supprimer(e) {
    if (aSupprimer !== e.id) { setASupprimer(e.id); return }
    setASupprimer(null)
    const { error } = await supabase.from('fermetures_exceptionnelles').delete().eq('id', e.id)
    if (error) { toast(`Erreur : ${error.message}`, 'error'); return }
    toast('Supprimé : tes horaires habituels s’appliquent de nouveau ce jour-là.')
    onChange?.()
    charger()
  }

  // ⚠️ LE MÊME CHEMIN QUE L'ANNULATION D'UNE SEULE COMMANDE OU D'UN SEUL
  // RENDEZ-VOUS : la route rembourse, rend et recrédite, puis le client est
  // prévenu. EN SÉRIE, pour qu'un échec reste attribuable.
  async function annulerTout() {
    if (!apres || annulation) return
    setAnnulation(true)
    const c = { faits: 0, echecs: 0, rembourse: 0, rates: 0 }
    for (const cmd of apres.commandes) {
      const res = await postPro('/api/commande/annuler-commercant', { commande_id: cmd.id, motif: 'Fermeture exceptionnelle' })
      const j = await (res?.json ? res.json().catch(() => ({})) : Promise.resolve({}))
      if (!j?.ok) { c.echecs++; continue }
      c.faits++
      c.rembourse += Number(j.rembourse) || 0
    }
    const r = { faits: 0, echecs: 0, rembourse: 0, rates: 0 }
    for (const rdv of apres.rdvs) {
      const res = await postPro('/api/rdv/annuler-commercant', { rdv_id: rdv.id, raison: 'commercant', prevenir_file: false })
      const j = await (res?.json ? res.json().catch(() => ({})) : Promise.resolve({}))
      if (!j?.ok) { r.echecs++; continue }
      r.faits++
      if (j.already_canceled) continue
      if (j.refund_error) r.rates++
      else r.rembourse += Number(j.refund_montant) || 0
      await prevenirClient('/api/emails/rdv-annule', {
        rdv_id: rdv.id,
        raison_annulation: 'commercant',
        refund_montant: j.refund_montant,
        refund_en_cours: !!j.refund_id && !j.refund_error,
        bon_rendu: j.bon_rendu,
        nb_bons: j.nb_bons,
        recompense_rendue: j.recompense_rendue,
        produits_montant: j.produits_montant,
      }, 'l’email d’annulation du rendez-vous')
    }
    setAnnulation(false)
    setBilan(bilanAnnulationFermeture({ commandes: c, rdvs: r }))
    onChange?.()
  }

  function terminer() { setApres(null); setBilan(null); onFermer?.() }

  const nbTouchees = touchees.commandes.length + touchees.rdvs.length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ─── APRÈS L'ENREGISTREMENT : que fait-on de ce qui est déjà pris ? ── */}
      {apres && (
        <div style={{ background: T.alerteFond, border: `1.5px solid ${T.alerteFilet}`, borderRadius: 14, padding: '14px 16px' }} role="alert">
          {bilan ? (
            <>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: T.ink, lineHeight: 1.5 }}>{bilan}</p>
              <button type="button" style={{ ...bouton(true), marginTop: 12 }} onClick={terminer}>J’ai compris</button>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: T.ink }}>
                {resumeTouchees(apres)} tombent pendant ce que tu viens d’enregistrer.
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: T.deep, lineHeight: 1.5 }}>
                Tu peux les annuler : chaque client est prévenu par email, et ce qu’il a payé en ligne est remboursé. Ou les garder, si tu les honores quand même.
              </p>
              <ListeTouchees touchees={apres} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" style={{ ...bouton(true), background: T.rouge }} onClick={annulerTout} disabled={annulation}>
                  {annulation ? <><DotsAttente taille={6} couleur="#fff" label="Annulation en cours" /> Annulation en cours…</> : 'Annuler et prévenir les clients'}
                </button>
                <button type="button" style={bouton(false)} onClick={terminer} disabled={annulation}>Les garder</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ─── LE FORMULAIRE ──────────────────────────────────────────────── */}
      {form && (
        <div style={{ background: '#fff', border: `1.5px solid ${T.ink}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div role="radiogroup" aria-label="Type" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[{ v: false, l: 'Fermé' }, { v: true, l: 'Horaires adaptés' }].map(o => (
              <button key={o.l} type="button" role="radio" aria-checked={form.adaptes === o.v}
                onClick={() => setForm(f => ({ ...f, adaptes: o.v }))}
                style={{ ...bouton(form.adaptes === o.v), background: form.adaptes === o.v ? T.main : '#fff', color: form.adaptes === o.v ? '#fff' : T.ink }}>
                {o.l}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ ...etiquette, flex: '1 1 150px' }}>Du
              <input type="date" value={form.date_debut} min={aujourdhui} style={champ}
                onChange={e => setForm(f => ({ ...f, date_debut: e.target.value, date_fin: f.date_fin < e.target.value ? e.target.value : f.date_fin }))} />
            </label>
            <label style={{ ...etiquette, flex: '1 1 150px' }}>Au (inclus)
              <input type="date" value={form.date_fin} min={form.date_debut || aujourdhui} style={champ}
                onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))} />
            </label>
          </div>
          {form.adaptes && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={etiquette}>Ouvert ces jours-là</span>
              <Plage debut={form.plage1_debut} fin={form.plage1_fin}
                onDebut={v => setForm(f => ({ ...f, plage1_debut: v }))} onFin={v => setForm(f => ({ ...f, plage1_fin: v }))} />
              {form.avecPlage2 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Plage debut={form.plage2_debut} fin={form.plage2_fin}
                    onDebut={v => setForm(f => ({ ...f, plage2_debut: v }))} onFin={v => setForm(f => ({ ...f, plage2_fin: v }))} />
                  <button type="button" style={{ ...bouton(false), padding: '6px 10px', fontSize: 12 }} onClick={() => setForm(f => ({ ...f, avecPlage2: false }))}>Retirer</button>
                </div>
              ) : (
                <button type="button" style={{ ...bouton(false), alignSelf: 'flex-start', padding: '6px 10px', fontSize: 12 }}
                  onClick={() => setForm(f => ({ ...f, avecPlage2: true }))}>+ Deuxième plage (midi et soir)</button>
              )}
              <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
                Ces jours-là, seuls les créneaux, tournées, rendez-vous et tables qui tiennent dans ces heures restent proposés.
              </p>
            </div>
          )}
          <label style={etiquette}>Motif (facultatif, pour toi)
            <input type="text" value={form.motif} maxLength={120} placeholder="Ex. : congés, jour férié, inventaire"
              style={champ} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} />
          </label>
          {candidate && (
            <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.deep, background: T.fond, borderRadius: 9, padding: '8px 10px' }}>
              Les clients liront : « {phraseException(candidate)} »
            </p>
          )}
          {erreur && <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: T.rouge }}>{erreur}</p>}
          {nbTouchees > 0 && (
            <div style={{ background: T.alerteFond, border: `1px solid ${T.alerteFilet}`, borderRadius: 10, padding: '10px 12px' }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: T.alerte }}>
                {resumeTouchees(touchees)} déjà pris ces jours-là ne tiennent plus.
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: T.alerte }}>Après l’enregistrement, tu choisiras de les annuler ou de les garder.</p>
              <ListeTouchees touchees={touchees} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={bouton(true)} onClick={enregistrer} disabled={Boolean(erreur) || ecriture}>
              {ecriture ? <><DotsAttente taille={6} couleur="#fff" label="Enregistrement en cours" /> Enregistrement…</> : form.id ? 'Enregistrer les changements' : form.adaptes ? 'Enregistrer ces horaires' : 'Enregistrer la fermeture'}
            </button>
            <button type="button" style={bouton(false)} onClick={() => { setForm(null); onFermer?.() }} disabled={ecriture}>Annuler</button>
          </div>
        </div>
      )}

      {/* ─── LA LISTE ───────────────────────────────────────────────────── */}
      {!form && !apres && (
        <button type="button" style={{ ...bouton(true), alignSelf: 'flex-start' }} onClick={() => setForm(formulaireVide(aujourdhui))}>
          + Fermer ou changer les horaires
        </button>
      )}
      {chargement ? (
        <DotsAttente taille={6} label="Chargement des fermetures" />
      ) : liste.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>Aucune fermeture ni horaire adapté à venir : tes horaires habituels s’appliquent.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {liste.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${T.filet}`, background: '#fff' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.ink }}>{phraseException(e)}</p>
                {e.motif && <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted }}>{e.motif}</p>}
              </div>
              <button type="button" style={{ ...bouton(false), padding: '6px 10px', fontSize: 12 }}
                onClick={() => setForm({
                  id: e.id, adaptes: Boolean(e.plage1_debut), date_debut: String(e.date_debut).slice(0, 10), date_fin: String(e.date_fin).slice(0, 10),
                  plage1_debut: String(e.plage1_debut || '09:00').slice(0, 5), plage1_fin: String(e.plage1_fin || '13:00').slice(0, 5),
                  avecPlage2: Boolean(e.plage2_debut), plage2_debut: String(e.plage2_debut || '14:00').slice(0, 5), plage2_fin: String(e.plage2_fin || '18:00').slice(0, 5),
                  motif: e.motif || '',
                })}>Modifier</button>
              <button type="button" style={{ ...bouton(false), padding: '6px 10px', fontSize: 12, color: T.rouge, borderColor: aSupprimer === e.id ? T.rouge : T.filet }}
                onClick={() => supprimer(e)}>
                {aSupprimer === e.id ? 'Confirmer la suppression' : 'Supprimer'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── LA FENÊTRE DU BOUTON « FERMER OU CHANGER LES HORAIRES » ──────────────
//
// ✅ Alex, 16/10 : « un bouton de raccourci dans le haut du tableau de bord,
// accessible rapidement ». Le jour où le boulanger est malade, il ferme en
// deux gestes : le formulaire s'ouvre directement, la liste est dessous.
export function ModaleFermetures({ commercantId, toast, onClose, onChange }) {
  // ⚠️ LE TABLEAU DE BORD N'A PAS DE « TOAST » HORS DES PARAMÈTRES : sans
  // appelant qui en fournit un, la fenêtre dit elle-même ce qui s'est passé.
  const [message, setMessage] = useState(null)
  const dire = toast || ((msg, type) => setMessage({ msg, type }))
  useEffect(() => {
    const echap = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', echap)
    return () => window.removeEventListener('keydown', echap)
  }, [onClose])
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-label="Fermetures et horaires exceptionnels"
        style={{ background: '#fff', borderRadius: 18, padding: 20, maxWidth: 520, width: '100%', maxHeight: '90svh', overflowY: 'auto', boxShadow: '0 30px 80px rgba(0,0,0,0.45)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: T.ink }}>Fermer ou changer les horaires</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
              Pour tout ton commerce : commandes, livraison, rendez-vous et tables.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer la fenêtre"
            style={{ border: 'none', background: 'none', fontSize: 22, lineHeight: 1, color: T.muted, cursor: 'pointer' }}>×</button>
        </div>
        {message && (
          <p role="status" style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 700, borderRadius: 9, padding: '8px 10px',
            color: message.type === 'error' ? T.rouge : T.deep, background: message.type === 'error' ? '#FEF2F2' : T.fond }}>
            {message.msg}
          </p>
        )}
        <FermeturesExceptionnelles commercantId={commercantId} toast={dire} formulaireOuvert onChange={onChange} onFermer={onClose} />
      </div>
    </div>
  )
}

// ─── LE RAPPEL DANS LES ONGLETS CRÉNEAUX ET AGENDA ────────────────────────
//
// ✅ Alex, 16/10 : la liste vit SOUS les horaires d'ouverture ; les onglets
// Créneaux et Agenda en montrent un rappel, avec un accès direct.
export function RappelExceptions({ commercantId, toast, exceptions = null, onChange }) {
  const aujourdhui = jourBruxelles()
  const [lues, setLues] = useState(exceptions)
  const [ouverte, setOuverte] = useState(false)
  const relire = useCallback(async () => {
    if (!commercantId) return
    const { data } = await supabase.from('fermetures_exceptionnelles').select(COLONNES_EXCEPTIONS)
      .eq('commercant_id', commercantId).gte('date_fin', aujourdhui).order('date_debut', { ascending: true })
    setLues(data || [])
  }, [commercantId, aujourdhui])
  useEffect(() => { if (exceptions === null) relire() }, [exceptions, relire])
  const aVenir = (exceptions ?? lues ?? []).filter(e => String(e.date_fin).slice(0, 10) >= aujourdhui)
  return (
    <div style={{ background: T.fond, border: `1.5px solid ${T.pale}`, borderRadius: 14, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 900, color: T.ink }}>Fermetures et horaires exceptionnels</p>
      {aVenir.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>Rien de prévu : tes horaires habituels s’appliquent.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: T.deep, lineHeight: 1.6 }}>
          {aVenir.slice(0, 5).map(e => <li key={e.id || `${e.date_debut}-${e.date_fin}`}>{phraseException(e)}</li>)}
        </ul>
      )}
      <p style={{ margin: 0, fontSize: 11.5, color: T.muted, lineHeight: 1.5 }}>
        Une seule liste pour tout ton commerce. Elle se trouve aussi dans Profil général, sous tes horaires d’ouverture.
      </p>
      <button type="button" style={{ ...bouton(false), alignSelf: 'flex-start', padding: '7px 12px', fontSize: 12.5 }} onClick={() => setOuverte(true)}>
        Fermer ou changer les horaires
      </button>
      {ouverte && (
        <ModaleFermetures commercantId={commercantId} toast={toast} onClose={() => { setOuverte(false); relire() }}
          onChange={() => { relire(); onChange?.() }} />
      )}
    </div>
  )
}

function Plage({ debut, fin, onDebut, onFin }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="time" value={debut} onChange={e => onDebut(e.target.value)} style={champ} aria-label="Ouverture" />
      <span style={{ color: T.muted, fontWeight: 700 }}>–</span>
      <input type="time" value={fin} onChange={e => onFin(e.target.value)} style={champ} aria-label="Fermeture" />
    </div>
  )
}

function resumeTouchees({ commandes = [], rdvs = [] }) {
  const morceaux = []
  if (commandes.length) morceaux.push(commandes.length === 1 ? '1 commande' : `${commandes.length} commandes`)
  if (rdvs.length) morceaux.push(rdvs.length === 1 ? '1 rendez-vous' : `${rdvs.length} rendez-vous`)
  return morceaux.join(' et ')
}

function ListeTouchees({ touchees }) {
  const lignes = [
    ...touchees.commandes.map(c => ({ cle: `c-${c.id}`, texte: `${String(c.date_commande).slice(8, 10)}/${String(c.date_commande).slice(5, 7)}${c.creneau?.heure_debut ? ` ${String(c.creneau.heure_debut).slice(0, 5)}` : ''} · Commande ${referenceCommande(c) || ''} · ${c.client_nom || 'Client'}` })),
    ...touchees.rdvs.map(r => ({ cle: `r-${r.id}`, texte: `${String(r.date_rdv).slice(8, 10)}/${String(r.date_rdv).slice(5, 7)} ${String(r.heure_debut).slice(0, 5)} · ${r.prestation?.nom || 'Rendez-vous'} · ${[r.client_prenom, r.client_nom].filter(Boolean).join(' ') || 'Client'}` })),
  ]
  return (
    <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: T.deep, lineHeight: 1.6, maxHeight: 180, overflowY: 'auto' }}>
      {lignes.map(l => <li key={l.cle}>{l.texte}</li>)}
    </ul>
  )
}
