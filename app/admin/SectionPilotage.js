'use client'
// LE PILOTAGE (Alex, 19/10) : « un vrai tableau de bord pour me permettre de
// piloter le dev de Yoppaa et d'orienter mon business ».
//
// Quatre blocs, dans l'ordre où on agit : ce qui attend un geste (alertes),
// la veille en chiffres, les commerçants et le revenu, chaque commerce, puis la
// santé technique. Le même calcul que l'email de 7h00 (`lib/pilotage.js`).
//
// ⚠️ PLACÉ SOUS LES TROIS BLOCS D'ACTION (validations, inscriptions en cours,
// fiches à publier) : la règle du 30/08 tient, on range par ce qu'on vient
// faire. L'email de 7h00 pointe ici par l'ancre #pilotage.
//
// ⚠️ LES FICHES DE DÉMONSTRATION SONT HORS DES CHIFFRES, partout. Le tableau
// des commerces peut les montrer, marquées, pour vérifier un test.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Gauge } from 'lucide-react'
import Repli from './Repli'
import { PLAN_LABEL } from '@/lib/plans'
import { libelleEnvie } from '@/lib/signaux'
import { nombre, ecart, depuis } from '@/lib/pilotage-format'

const T = {
  bg: '#F8F6FF', main: '#6B35C4', mid: '#9660E0', light: '#C4A0F4', pale: '#EDE0FF',
  ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280', hairline: '#EEE9F5', green: '#10B981',
}
const ALERTE = {
  rouge: { fond: '#FEE2E2', texte: '#7F1D1D', bord: '#FCA5A5' },
  orange: { fond: '#FEF3C7', texte: '#78350F', bord: '#FCD34D' },
  vert: { fond: '#D1FAE5', texte: '#065F46', bord: '#6EE7B7' },
}
const ETAT_CRON = {
  ok: { label: 'OK', fond: '#D1FAE5', texte: '#065F46' },
  attente: { label: 'En attente', fond: '#F3F4F6', texte: '#4B5563' },
  retard: { label: 'En retard', fond: '#FEE2E2', texte: '#7F1D1D' },
}
const POLICE = '"DM Sans", sans-serif'
const carte = { background: '#fff', borderRadius: 14, border: `1px solid ${T.hairline}`, padding: 16 }
const titreBloc = { fontSize: 12, fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: T.main, margin: '0 0 10px' }

// Trente barres, une par jour : la forme compte plus que l'échelle.
function Courbe({ points }) {
  const max = Math.max(1, ...points.map(p => p.valeur))
  const l = 120 / Math.max(1, points.length)
  return (
    <svg viewBox="0 0 120 30" preserveAspectRatio="none" style={{ width: '100%', height: 30, display: 'block' }} aria-hidden="true">
      {points.map((p, i) => {
        const h = p.valeur > 0 ? Math.max(1.5, (p.valeur / max) * 28) : 0.8
        return <rect key={p.jour} x={i * l + 0.4} y={30 - h} width={Math.max(0.6, l - 0.8)} height={h}
          rx="0.6" fill={i === points.length - 1 ? T.main : p.valeur > 0 ? T.light : T.hairline}/>
      })}
    </svg>
  )
}

function Tuile({ t }) {
  return (
    <div style={{ ...carte, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 12.5, color: T.muted, fontWeight: 700 }}>{t.libelle}</p>
      {t.indisponible ? (
        <p style={{ margin: 0, fontSize: 13, color: T.muted, fontStyle: 'italic' }}>Indisponible</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 26, fontWeight: 900, color: T.ink, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>{nombre(t.hier, t)}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.muted }}>hier · {ecart(t.hier, t.memeJourSemainePassee, t)}</span>
          </div>
          <Courbe points={t.courbe}/>
          <p style={{ margin: 0, fontSize: 11.5, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
            7 j : <strong style={{ color: T.ink }}>{nombre(t.septJours, t)}</strong> · 7 j avant : {nombre(t.septJoursAvant, t)}
          </p>
        </>
      )}
    </div>
  )
}

function Chiffre({ valeur, libelle }) {
  return (
    <div style={{ minWidth: 120 }}>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 900, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{valeur}</p>
      <p style={{ margin: '2px 0 0', fontSize: 12, color: T.muted, fontWeight: 600 }}>{libelle}</p>
    </div>
  )
}

const repartition = (m) => Object.entries(m || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${PLAN_LABEL[k] || k} ${n}`).join(' · ')

const COLONNES = [
  { cle: 'nom', libelle: 'Commerce', texte: true },
  { cle: 'formule', libelle: 'Formule', texte: true },
  { cle: 'statutFiche', libelle: 'Fiche', texte: true },
  { cle: 'signaux30', libelle: 'Signaux 30 j' },
  { cle: 'favoris', libelle: 'Favoris' },
  { cle: 'vues30', libelle: 'Vues 30 j' },
  { cle: 'commandesApp', libelle: 'Cmd app' },
  { cle: 'commandesEncodees', libelle: 'Cmd encodées' },
  { cle: 'rdvApp', libelle: 'RDV app' },
  { cle: 'rdvEncodes', libelle: 'RDV encodés' },
  { cle: 'volume30', libelle: 'Volume 30 j', argent: true },
  { cle: 'derniereActivite', libelle: 'Dernière activité', texte: true },
]

export default function SectionPilotage() {
  const [p, setP] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [demo, setDemo] = useState(false)
  const [tri, setTri] = useState({ cle: 'signaux30', sens: -1 })

  const charger = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErr('Session expirée'); setLoading(false); return }
      const res = await fetch('/api/admin/pilotage', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const j = await res.json()
      if (!res.ok || !j.ok) throw new Error(j.error || 'Erreur')
      setP(j.pilotage)
    } catch (e) {
      setErr(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  // ⚠️ L'ANCRE DE L'EMAIL ARRIVE AVANT LA SECTION : l'admin vérifie d'abord la
  // double authentification, et le navigateur a renoncé à défiler quand le
  // bloc apparaît. On y descend une fois, à la première lecture.
  const arrive = useRef(false)
  useEffect(() => {
    if (!p || arrive.current) return
    arrive.current = true
    if (typeof window !== 'undefined' && window.location.hash === '#pilotage') {
      document.getElementById('pilotage')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [p])

  const lignes = useMemo(() => {
    const liste = (p?.commerces?.lignes || []).filter(l => demo || !l.demo)
    const col = COLONNES.find(c => c.cle === tri.cle)
    return liste.slice().sort((a, b) => {
      const va = a[tri.cle], vb = b[tri.cle]
      if (col?.texte) return String(va || '').localeCompare(String(vb || ''), 'fr') * tri.sens
      return ((Number(va) || 0) - (Number(vb) || 0)) * tri.sens
    })
  }, [p, demo, tri])

  const maintenant = p ? new Date(p.genereLe) : new Date()
  const rouges = p ? p.alertes.filter(a => a.niveau === 'rouge').length : 0
  const resume = p
    ? <span style={{ color: T.muted, fontWeight: 700, fontSize: 14 }}> · {nombre(p.croissance.comptesYopper)} Yoppers · {p.commerces.publies} fiches en ligne · {nombre(p.revenu.revenuAttenduHtva, { argent: true })} HTVA attendus{rouges ? ` · ${rouges} à régler` : ''}</span>
    : null

  const actions = (
    <button onClick={charger} style={{ background: 'none', border: `1px solid ${T.hairline}`, padding: '6px 12px', borderRadius: 100, color: T.muted, fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: POLICE, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <RefreshCw size={13} strokeWidth={2}/> Rafraîchir
    </button>
  )

  return (
    <div id="pilotage" style={{ scrollMarginTop: 16 }}>
      <Repli
        titre={<><Gauge size={20} strokeWidth={2} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6, color: T.main }}/>Pilotage</>}
        resume={resume}
        actions={actions}
        alerte={rouges ? `${rouges} point${rouges > 1 ? 's' : ''} à régler` : null}
        ouvertParDefaut
      >
        {loading && !p && <p style={{ color: T.muted, fontSize: 13 }}>Chargement du pilotage…</p>}
        {err && <p style={{ color: '#B91C1C', fontSize: 13, fontWeight: 700 }}>Pilotage illisible : {err}</p>}
        {p && (
          <div style={{ display: 'grid', gap: 18 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>
              Calculé {depuis(p.genereLe, new Date())}. Hors fiches de démonstration ({p.commerces.demo}), sauf dans le tableau des commerces si tu les affiches.
            </p>

            {/* Ce qui attend un geste. */}
            <div>
              <p style={titreBloc}>Ce qui t’attend</p>
              {p.alertes.length === 0
                ? <p style={{ margin: 0, fontSize: 13.5, color: T.muted }}>Rien à signaler : tout a tourné, rien n’attend.</p>
                : <div style={{ display: 'grid', gap: 8 }}>
                    {p.alertes.map((a, i) => {
                      const c = ALERTE[a.niveau] || ALERTE.orange
                      return <p key={i} style={{ margin: 0, padding: '10px 12px', borderRadius: 10, background: c.fond, border: `1px solid ${c.bord}`, color: c.texte, fontSize: 13.5, fontWeight: 700, lineHeight: 1.5 }}>{a.texte}</p>
                    })}
                  </div>}
            </div>

            {/* La veille. */}
            <div>
              <p style={titreBloc}>Hier, et les 30 derniers jours</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                {p.tuiles.map(t => <Tuile key={t.cle} t={t}/>)}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: T.muted }}>
                L’écart compare hier au même jour de la semaine passée. La barre foncée est hier.
              </p>
            </div>

            {/* Croissance et demande. */}
            <div style={carte}>
              <p style={titreBloc}>Croissance et demande</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px' }}>
                <Chiffre valeur={p.croissance.comptesIndisponibles ? `${nombre(p.croissance.comptesYopper)}*` : nombre(p.croissance.comptesYopper)} libelle="comptes Yopper"/>
                <Chiffre valeur={p.croissance.clientsSansCompte == null ? '—' : nombre(p.croissance.clientsSansCompte)} libelle="clients sans compte"/>
                <Chiffre valeur={nombre(p.croissance.preinscritsYopper)} libelle="préinscrits Yopper"/>
                <Chiffre valeur={nombre(p.croissance.favoris)} libelle="favoris posés"/>
                <Chiffre valeur={nombre(p.croissance.vues30)} libelle="vues des fiches, 30 j"/>
                <Chiffre valeur={nombre(p.demande.signauxTotal)} libelle="signaux d’envie"/>
                <Chiffre valeur={p.demande.suggestions == null ? '—' : nombre(p.demande.suggestions)} libelle="commerces suggérés"/>
                <Chiffre valeur={nombre(p.demande.avis)} libelle="avis déposés"/>
                <Chiffre valeur={nombre(p.demande.bonsVendus)} libelle="bons cadeaux actifs"/>
                <Chiffre valeur={nombre(p.demande.cartesFidelite)} libelle="cartes de fidélité"/>
              </div>
              {p.croissance.comptesIndisponibles && (
                <p style={{ margin: '10px 0 0', fontSize: 12, color: T.muted }}>* Total lu sans sa courbe : la fonction des comptes par jour n’est pas encore installée.</p>
              )}
              {p.demande.parType.length > 0 && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: T.ink, lineHeight: 1.6 }}>
                  <strong>Ce que les habitants demandent :</strong>{' '}
                  {p.demande.parType.map(t => `${libelleEnvie(t.type).court} ${t.total} (30 j : ${t.trenteJours})`).join(' · ')}
                </p>
              )}
            </div>

            {/* Commerçants et revenu. */}
            <div style={carte}>
              <p style={titreBloc}>Commerçants et revenu</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px' }}>
                <Chiffre valeur={nombre(p.revenu.revenuAttenduHtva, { argent: true })} libelle="HTVA par mois attendus après l’essai"/>
                <Chiffre valeur={`${p.revenu.avecAbonnement} / ${p.revenu.payants}`} libelle="formules payantes avec abonnement Stripe"/>
                <Chiffre valeur={`${p.commerces.publies} / ${p.commerces.total}`} libelle="fiches en ligne"/>
                <Chiffre valeur={nombre(p.commerces.nouveaux7)} libelle="inscrits ces 7 jours"/>
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
                Par formule : {repartition(p.commerces.parFormule) || '—'}<br/>
                Par fiche : {repartition(p.commerces.parStatutFiche) || '—'}
                {p.revenu.premierPrelevement && <><br/>Premier prélèvement prévu : {new Date(p.revenu.premierPrelevement).toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Brussels' })}</>}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 14 }}>
                <ListeNommee titre="À démarcher (signaux, pas en Vendre)" vide="Personne pour l’instant."
                  items={p.revenu.aDemarcher.map(l => `${l.nom} · ${PLAN_LABEL[l.formule] || l.formule} · ${l.signaux30} ${l.signaux30 > 1 ? 'signaux' : 'signal'} (${l.types.map(t => libelleEnvie(t).court).join(', ')})`)}/>
                <ListeNommee titre="Pas encore en ligne" vide="Toutes les fiches sont en ligne."
                  items={p.commerces.pasEnLigne.map(l => `${l.nom} · ${l.statutFiche || '?'} · inscrit il y a ${l.jours ?? '?'} j`)}/>
                <ListeNommee titre="Formule payante sans abonnement Stripe" vide="Aucune."
                  items={p.revenu.sansAbonnement.map(l => `${l.nom} · ${PLAN_LABEL[l.formule] || l.formule}`)}
                  note="Personne ne les prélèvera : formule ouverte à la main, ou dossier pas encore validé."/>
                <ListeNommee titre="Essaient une formule supérieure" vide="Aucun essai en cours."
                  items={p.revenu.enEssai.map(l => `${l.nom} · ${PLAN_LABEL[l.formule] || l.formule} → ${PLAN_LABEL[l.essai] || l.essai}`)}/>
              </div>
            </div>

            {/* Activité, cumul. */}
            <div style={carte}>
              <p style={titreBloc}>Activité depuis le début</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px' }}>
                <Chiffre valeur={nombre(p.activite.commandesApp)} libelle="commandes dans l’app"/>
                <Chiffre valeur={nombre(p.activite.commandesEncodees)} libelle="commandes encodées"/>
                <Chiffre valeur={nombre(p.activite.rdvApp)} libelle="RDV et tables dans l’app"/>
                <Chiffre valeur={nombre(p.activite.rdvEncodes)} libelle="RDV et tables encodés"/>
                <Chiffre valeur={nombre(p.activite.volume30, { argent: true })} libelle="volume d’affaires, 30 j"/>
                <Chiffre valeur={nombre(p.activite.volumeTotal, { argent: true })} libelle="volume d’affaires, total"/>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 12, color: T.muted }}>
                Écartés car de démonstration : {nombre(p.activite.demoCommandes)} commandes et {nombre(p.activite.demoRdv)} RDV.
                Le volume compte les commandes et RDV aboutis, payés en ligne ou sur place, après remises et remboursements.
              </p>
            </div>

            {/* Chaque commerce. */}
            <div style={carte}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <p style={{ ...titreBloc, margin: 0 }}>Les commerces</p>
                <label style={{ fontSize: 12.5, color: T.muted, fontWeight: 700, display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)}/> Montrer les fiches de démo
                </label>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      {COLONNES.map(c => (
                        <th key={c.cle} style={{ textAlign: c.texte ? 'left' : 'right', padding: '6px 8px', borderBottom: `1.5px solid ${T.hairline}`, whiteSpace: 'nowrap' }}>
                          <button onClick={() => setTri(t => ({ cle: c.cle, sens: t.cle === c.cle ? -t.sens : (c.texte ? 1 : -1) }))}
                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: POLICE, fontSize: 12, fontWeight: 800, color: tri.cle === c.cle ? T.main : T.muted }}>
                            {c.libelle}{tri.cle === c.cle ? (tri.sens > 0 ? ' ↑' : ' ↓') : ''}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map(l => (
                      <tr key={l.id} style={{ background: l.demo ? T.bg : 'transparent' }}>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${T.hairline}`, fontWeight: 700, color: T.ink, whiteSpace: 'nowrap' }}>
                          {l.nom}{l.demo && <span style={{ color: T.muted, fontWeight: 600 }}> · démo</span>}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${T.hairline}`, whiteSpace: 'nowrap' }}>
                          {PLAN_LABEL[l.formule] || l.formule}{l.essai ? ` (essai ${PLAN_LABEL[l.essai] || l.essai})` : ''}
                        </td>
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${T.hairline}`, whiteSpace: 'nowrap' }}>{l.statutFiche || '?'}</td>
                        {COLONNES.slice(3, 11).map(c => (
                          <td key={c.cle} style={{ padding: '6px 8px', borderBottom: `1px solid ${T.hairline}`, textAlign: 'right', color: Number(l[c.cle]) > 0 ? T.ink : T.light, fontWeight: Number(l[c.cle]) > 0 ? 800 : 500 }}>
                            {nombre(l[c.cle], c)}
                          </td>
                        ))}
                        <td style={{ padding: '6px 8px', borderBottom: `1px solid ${T.hairline}`, whiteSpace: 'nowrap', color: T.muted }}>
                          {l.derniereActivite ? depuis(l.derniereActivite, maintenant) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Santé technique. */}
            <div style={carte}>
              <p style={titreBloc}>Santé technique</p>
              {p.sante.journalIndisponible ? (
                <p style={{ margin: '0 0 12px', fontSize: 13, color: T.muted }}>
                  Le journal technique n’est pas encore installé (migration du pilotage) : passages des tâches et plantages d’écran indisponibles.
                </p>
              ) : (
                <div style={{ overflowX: 'auto', marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <tbody>
                      {p.sante.crons.map(c => {
                        const e = ETAT_CRON[c.etat] || ETAT_CRON.attente
                        return (
                          <tr key={c.chemin}>
                            <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.hairline}`, fontWeight: 700, color: T.ink }}>{c.chemin.replace('/api/cron/', '')}</td>
                            <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.hairline}`, color: T.muted }}>chaque {c.rythme}</td>
                            <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.hairline}`, color: T.muted }}>{depuis(c.dernierPassage, maintenant)}</td>
                            <td style={{ padding: '5px 8px', borderBottom: `1px solid ${T.hairline}`, textAlign: 'right' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: e.fond, color: e.texte }}>{e.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 24px' }}>
                <Chiffre valeur={p.sante.journalIndisponible ? '—' : nombre(p.sante.erreursEcranHier)} libelle="plantages d’écran hier"/>
                <Chiffre valeur={p.sante.journalIndisponible ? '—' : nombre(p.sante.erreursEcran7)} libelle="plantages d’écran, 7 j"/>
                <Chiffre valeur={p.sante.webhooksIndisponibles ? '—' : nombre(p.sante.webhooksEnErreur7)} libelle="événements Stripe en erreur, 7 j"/>
              </div>
              {p.sante.pagesEnErreur.length > 0 && (
                <p style={{ margin: '10px 0 0', fontSize: 12.5, color: T.ink }}>
                  <strong>Pages qui plantent :</strong> {p.sante.pagesEnErreur.map(x => `${x.page} (${x.n})`).join(' · ')}
                </p>
              )}
              {p.sante.derniersWebhooksEnErreur.length > 0 && (
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: T.ink }}>
                  <strong>Derniers événements Stripe en erreur :</strong> {p.sante.derniersWebhooksEnErreur.map(w => `${w.type} (${depuis(w.quand, maintenant)})`).join(' · ')}
                </p>
              )}
            </div>
          </div>
        )}
      </Repli>
    </div>
  )
}

function ListeNommee({ titre, items, vide, note = null }) {
  return (
    <div>
      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 800, color: T.deep }}>{titre} <span style={{ color: T.muted }}>· {items.length}</span></p>
      {items.length === 0
        ? <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>{vide}</p>
        : <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: T.ink, lineHeight: 1.6 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      {note && items.length > 0 && <p style={{ margin: '4px 0 0', fontSize: 11.5, color: T.muted }}>{note}</p>}
    </div>
  )
}
