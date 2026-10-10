'use client'

// LA FENÊTRE « ENCODER UNE COMMANDE » (Alex, 10/10, version express).
//
// Le téléphone sonne : trois gestes. Le créneau, les articles touchés dans une
// grille comme une caisse, le nom. Téléphone et e-mail facultatifs ; « payé »
// ou « à payer au retrait ». La commande remplit les mêmes créneaux et le même
// stock que les commandes en ligne.
//
// ⚠️ L'ÉCRAN AIDE, LE SERVEUR DÉCIDE (`/api/equipe/commande/creer`). Le
// remplissage affiché ici vient de `remplissageCreneaux`, le total de
// `construireLignesCommande` : les mêmes fonctions que la route. Le serveur
// refait tout, et renvoie ses avertissements (créneau plein, stock court…) ;
// l'écran les montre, et le commerçant confirme d'un second geste.

import { useEffect, useMemo, useState } from 'react'
import { postPro } from '@/lib/fetch-pro'
import DotsAttente from '@/app/components/DotsAttente'
import ChampAdresseLivraison from '@/app/components/ChampAdresseLivraison'
import { remplissageCreneaux } from '@/lib/creneaux'
import { categoriesOrdonnees } from '@/lib/categories-catalogue'
import { construireLignesCommande } from '@/lib/lignes-commande'
import { REGIME_EMPORTER } from '@/lib/tva'
import { euros } from '@/lib/montants'
import { jourBruxelles, brusselsInstant } from '@/lib/timezone'
import { jourPlus } from '@/lib/statut-commerce'
import { PAIEMENTS_ENCODEE, LIBELLES_PAIEMENT_ENCODEE, creneauTermine } from '@/lib/commande-encodee'

const T = {
  bg: '#F8F6FF', ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', mid: '#9660E0',
  pale: '#EDE0FF', muted: '#5B6170', hairline: '#E4DCF2', ok: '#047857', alerte: '#B45309', erreur: '#B91C1C',
}
const champ = {
  width: '100%', padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${T.hairline}`,
  fontSize: 15, color: T.ink, fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box',
}
const titre = { fontSize: 13, fontWeight: 800, color: T.deep, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.4px' }
const heure = (h) => String(h || '').slice(0, 5)

export default function ModalNouvelleCommande({ commercantId, jourInitial, onFerme, onCree }) {
  const aujourdhui = jourBruxelles()
  const [mode, setMode] = useState('retrait')
  const [date, setDate] = useState(jourInitial && jourInitial >= aujourdhui ? jourInitial : aujourdhui)
  const [creneauId, setCreneauId] = useState(null)

  // ── Le catalogue, les créneaux et le remplissage du jour ─────────────────
  // ⚠️ PAR LE SERVEUR, pour le patron comme pour l'équipe : un seul chemin,
  // donc un seul remplissage (`/api/equipe/commande/catalogue`). Relu à chaque
  // changement de date, le panier reste.
  const [donnees, setDonnees] = useState(null)
  const [catalogue, setCatalogue] = useState('charge') // charge | ok | erreur
  const [recherche, setRecherche] = useState('')
  const [enOptions, setEnOptions] = useState(null)      // article dont on choisit les options
  const [selections, setSelections] = useState({})

  useEffect(() => {
    let annule = false
    ;(async () => {
      setCatalogue(c => (c === 'ok' ? 'ok' : 'charge'))
      const res = await postPro('/api/equipe/commande/catalogue', { commercant_id: commercantId, date })
      const j = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
      if (annule) return
      if (!res?.ok || !j?.ok) { setCatalogue('erreur'); return }
      setDonnees(j); setCatalogue('ok')
    })()
    return () => { annule = true }
  }, [commercantId, date])

  const commercant = useMemo(() => donnees?.commercant || { id: commercantId }, [donnees, commercantId])
  const articles = useMemo(() => donnees?.articles || [], [donnees])
  const deals = useMemo(() => donnees?.deals || [], [donnees])
  const groupes = useMemo(() => {
    const m = {}
    for (const g of donnees?.groupes || []) (m[g.article_id] ||= []).push(g)
    return m
  }, [donnees])
  const livraisonPossible = (donnees?.creneauxLivraison || []).length > 0

  // ── Le panier : une ligne par article et par jeu d'options ───────────────
  const [panier, setPanier] = useState([])   // [{ cle, id, quantite, options, libelleOptions }]
  function ajouter(article, choix = null) {
    const valeurs = choix ? Object.values(choix).flat() : []
    const cle = `${article.id}|${valeurs.map(v => v.id).sort().join(',')}`
    const options = choix ? Object.entries(choix).map(([, vals]) => ({ valeur_ids: vals.map(v => v.id) })) : undefined
    setPanier(p => {
      const ex = p.find(l => l.cle === cle)
      if (ex) return p.map(l => l.cle === cle ? { ...l, quantite: Math.min(50, l.quantite + 1) } : l)
      return [...p, { cle, id: article.id, nom: article.nom, quantite: 1, options, libelleOptions: valeurs.map(v => v.nom).join(', ') }]
    })
  }
  function toucher(article) {
    if ((groupes[article.id] || []).length > 0) { setEnOptions(article); setSelections({}); return }
    ajouter(article)
  }
  const changerQuantite = (cle, delta) => setPanier(p => p
    .map(l => l.cle === cle ? { ...l, quantite: Math.min(50, l.quantite + delta) } : l)
    .filter(l => l.quantite > 0))

  // Le total, par la règle du serveur (prix, remises du jour, suppléments).
  const optionsValeurs = useMemo(() => Object.values(groupes).flat()
    .flatMap(g => (g.valeurs || []).map(v => ({ ...v, article_options_groupes: { article_id: g.article_id, nom: g.nom } }))), [groupes])
  const calcul = useMemo(() => panier.length === 0 ? null : construireLignesCommande({
    panier: panier.map(l => ({ id: l.id, quantite: l.quantite, options: l.options })),
    articlesData: articles, optionsValeurs, variantesData: [], dealsData: deals,
    commercant, regime: REGIME_EMPORTER, dateCommande: date,
  }), [panier, articles, optionsValeurs, deals, commercant, date])

  // ── Les créneaux du jour, avec leur remplissage réel ──────────────────────
  // ⚠️ UN CRÉNEAU TERMINÉ N'EST PAS MONTRÉ (`creneauTermine`), celui en cours
  // l'est. L'heure est relue chaque minute : une fenêtre ouverte à 11 h 58 ne
  // propose plus le créneau de 11 h 45 à midi passé.
  const [minute, setMinute] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setMinute(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])
  const creneaux = useMemo(() => remplissageCreneaux({
    creneaux: mode === 'livraison' ? donnees?.creneauxLivraison : donnees?.creneauxRetrait,
    commandes: donnees?.commandesDuJour || [], jour: date, modeCapaciteDefaut: donnees?.commercant?.mode_capacite,
    champCreneau: mode === 'livraison' ? 'creneau_livraison_id' : 'creneau_id',
  }).filter(({ creneau }) => !creneauTermine(creneau, { dateStr: date, maintenant: new Date(minute), instant: brusselsInstant })),
  [mode, date, donnees, minute])
  useEffect(() => { setCreneauId(null) }, [mode, date])
  // Le créneau choisi vient de se terminer : il n'est plus choisi.
  useEffect(() => {
    if (creneauId && !creneaux.some(({ creneau }) => creneau.id === creneauId)) setCreneauId(null)
  }, [creneaux, creneauId])

  // ── Le client, la livraison, le paiement ─────────────────────────────────
  const [nom, setNom] = useState('')
  const [telephone, setTelephone] = useState('')
  const [email, setEmail] = useState('')
  const [confirmation, setConfirmation] = useState(true)
  const [note, setNote] = useState('')
  const [adresse, setAdresse] = useState({ code_postal: '', rue_id: null, rue_nom: '', numero: '', situee: null, ville: '' })
  const [complement, setComplement] = useState('')
  const [adresseLibre, setAdresseLibre] = useState('')
  const [noteLivraison, setNoteLivraison] = useState('')
  const [paiement, setPaiement] = useState(null)

  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState(null)
  const [avertissements, setAvertissements] = useState(null)
  // ⚠️ UN AVERTISSEMENT VAUT POUR CE QU'IL A VU : changer le créneau, le
  // panier, l'adresse ou le paiement l'efface, et le serveur rejugera.
  useEffect(() => { setAvertissements(null) }, [mode, date, creneauId, panier, adresse, paiement])

  const articlesFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return q ? articles.filter(a => a.nom.toLowerCase().includes(q)) : articles
  }, [articles, recherche])
  // Les rubriques dans l'ordre de la fiche (`categoriesOrdonnees`), les
  // articles dans l'ordre choisi par le commerçant (triés par le serveur).
  const parRubrique = useMemo(() => {
    const m = new Map()
    for (const a of articlesFiltres) {
      const r = a.categorie || 'Autres'
      if (!m.has(r)) m.set(r, [])
      m.get(r).push(a)
    }
    const ordre = categoriesOrdonnees([...m.keys()].filter(r => r !== 'Autres'), donnees?.commercant?.ordre_categories)
    const rubriques = m.has('Autres') ? [...ordre, 'Autres'] : ordre
    return rubriques.map(r => [r, m.get(r)])
  }, [articlesFiltres, donnees])

  const manque = !creneauId ? (mode === 'livraison' ? 'la tournée' : 'le créneau')
    : panier.length === 0 ? 'les articles'
    : nom.trim().length < 2 ? 'le nom du client'
    : (mode === 'livraison' && !(adresse.situee === true || adresseLibre.trim())) ? 'l’adresse de livraison'
    : !paiement ? 'le paiement'
    : null

  async function encoder(confirmes = []) {
    if (manque || envoi) return
    setEnvoi(true); setErreur(null)
    const res = await postPro('/api/equipe/commande/creer', {
      commercant_id: commercant.id, mode, date_commande: date, creneau_id: creneauId,
      articles: panier.map(l => ({ id: l.id, quantite: l.quantite, options: l.options })),
      client: { nom, telephone, email }, envoyer_confirmation: confirmation && !!email.trim(),
      paiement, note,
      livraison: mode === 'livraison' ? {
        best_rue_id: adresse.situee === true ? adresse.rue_id : null,
        code_postal: adresse.code_postal, numero: adresse.numero, complement,
        adresse: adresseLibre || [adresse.rue_nom, adresse.numero, adresse.code_postal, adresse.ville].filter(Boolean).join(' '),
        note: noteLivraison,
      } : undefined,
      confirmes,
    })
    if (typeof res?.json !== 'function') {
      setErreur(res?.sansSession ? 'Ta session a expiré : reconnecte-toi.' : 'Connexion perdue. Réessaie.')
      setEnvoi(false); return
    }
    const j = await res.json().catch(() => ({}))
    if (res.status === 409 && j?.a_confirmer) {
      setAvertissements(j.avertissements || [])
      setEnvoi(false); return
    }
    if (!res.ok || !j?.ok) {
      setErreur(j?.error || 'La commande n’a pas pu être enregistrée. Réessaie.')
      setEnvoi(false); return
    }
    onCree?.(j)
  }

  const totalLignes = calcul?.ok ? calcul.totalCents / 100 : null

  return (
    <div role="dialog" aria-modal="true" aria-label="Encoder une commande" onClick={() => !envoi && onFerme?.()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.6)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '16px 12px', overflowY: 'auto', fontFamily: '"DM Sans", sans-serif' }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 760, padding: 18, boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, color: T.ink, margin: 0 }}>Encoder une commande</h2>
          <button type="button" onClick={onFerme} disabled={envoi} aria-label="Fermer"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: T.muted }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {/* 1. QUAND */}
        <section style={{ marginBottom: 16 }}>
          {livraisonPossible && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {[['retrait', 'Retrait'], ['livraison', 'Livraison']].map(([m, l]) => (
                <button key={m} type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
                  style={{ flex: 1, padding: '9px 12px', borderRadius: 100, border: `1.5px solid ${mode === m ? T.main : T.hairline}`, background: mode === m ? T.pale : '#fff', color: T.deep, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
            {[[aujourdhui, 'Aujourd’hui'], [jourPlus(aujourdhui, 1), 'Demain']].map(([d, l]) => (
              <button key={d} type="button" onClick={() => setDate(d)} aria-pressed={date === d}
                style={{ padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${date === d ? T.main : T.hairline}`, background: date === d ? T.pale : '#fff', color: T.deep, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
            ))}
            <input type="date" value={date} min={aujourdhui} onChange={e => e.target.value && setDate(e.target.value)}
              aria-label="Autre date" style={{ ...champ, width: 'auto', padding: '7px 10px', fontSize: 14 }}/>
          </div>
          <p style={titre}>{mode === 'livraison' ? 'Tournée' : 'Créneau'}</p>
          {creneaux.length === 0 ? (
            <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>
              {date === aujourdhui && (mode === 'livraison' ? donnees?.creneauxLivraison : donnees?.creneauxRetrait)?.length > 0
                ? `Plus aucun ${mode === 'livraison' ? 'créneau de tournée' : 'créneau'} aujourd’hui : choisis Demain ou une autre date.`
                : `Aucun ${mode === 'livraison' ? 'créneau de tournée' : 'créneau'} ce jour-là.`}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))', gap: 8 }}>
              {creneaux.map(({ creneau, complet: completBrut, utilise, capacite, modeTemps }) => {
                const choisi = creneauId === creneau.id
                // ⚠️ SANS CAPACITÉ RÉGLÉE, RIEN N'EST PLEIN : `calculerCapaciteCreneau`
                // compare alors à une capacité vide, et 0 >= null vaut vrai.
                const complet = !!capacite && completBrut
                return (
                  <button key={creneau.id} type="button" onClick={() => setCreneauId(creneau.id)} aria-pressed={choisi}
                    style={{ padding: '8px 6px', borderRadius: 10, border: `1.5px solid ${choisi ? T.main : complet ? '#FCA5A5' : T.hairline}`, background: choisi ? T.pale : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: T.ink }}>{heure(creneau.heure_debut)}–{heure(creneau.heure_fin)}</span>
                    {capacite ? (
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: complet ? T.erreur : T.muted }}>
                        {complet ? 'Plein' : modeTemps ? `${Math.round(utilise)} / ${capacite} min` : `${utilise} / ${capacite}`}
                      </span>
                    ) : <span style={{ display: 'block', fontSize: 12, color: T.muted }}>sans limite</span>}
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* 2. QUOI */}
        <section style={{ marginBottom: 16 }}>
          <p style={titre}>Articles</p>
          {catalogue === 'charge' && <p style={{ fontSize: 14, color: T.muted }}>Chargement du catalogue…</p>}
          {catalogue === 'erreur' && <p role="alert" style={{ fontSize: 14, color: T.erreur }}>Le catalogue n’a pas pu être lu. Ferme et rouvre la fenêtre.</p>}
          {catalogue === 'ok' && (
            <>
              {articles.length > 12 && (
                <input type="search" value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Chercher un article"
                  style={{ ...champ, marginBottom: 10 }}/>
              )}
              <div style={{ maxHeight: 280, overflowY: 'auto', paddingRight: 2 }}>
                {parRubrique.map(([rubrique, liste]) => (
                  <div key={rubrique} style={{ marginBottom: 10 }}>
                    <p style={{ fontSize: 12, fontWeight: 800, color: T.muted, margin: '0 0 6px' }}>{rubrique}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                      {liste.map(a => {
                        const dansPanier = panier.filter(l => l.id === a.id).reduce((s, l) => s + l.quantite, 0)
                        return (
                          <button key={a.id} type="button" onClick={() => toucher(a)}
                            style={{ position: 'relative', padding: '10px 8px', minHeight: 64, borderRadius: 12, border: `1.5px solid ${dansPanier ? T.main : T.hairline}`, background: dansPanier ? '#FAF7FF' : '#fff', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1.25 }}>{a.nom}</span>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: T.main, marginTop: 4 }}>{euros(Number(a.prix))}</span>
                            {dansPanier > 0 && (
                              <span style={{ position: 'absolute', top: 6, right: 6, minWidth: 22, height: 22, borderRadius: 11, background: T.main, color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{dansPanier}</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {enOptions && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: `1.5px solid ${T.main}`, background: '#FAF7FF' }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: T.ink, margin: '0 0 8px' }}>{enOptions.nom}</p>
              {(groupes[enOptions.id] || []).map(g => (
                <div key={g.id} style={{ marginBottom: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: T.deep, margin: '0 0 4px' }}>{g.nom}{g.obligatoire ? ' (obligatoire)' : ''}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(g.valeurs || []).map(v => {
                      const pris = !!(selections[g.id] || []).find(s => s.id === v.id)
                      return (
                        <button key={v.id} type="button" aria-pressed={pris}
                          onClick={() => setSelections(s => {
                            const cur = s[g.id] || []
                            if (g.type === 'unique') return { ...s, [g.id]: pris ? [] : [v] }
                            return { ...s, [g.id]: pris ? cur.filter(x => x.id !== v.id) : [...cur, v] }
                          })}
                          style={{ padding: '6px 10px', borderRadius: 100, border: `1.5px solid ${pris ? T.main : T.hairline}`, background: pris ? T.pale : '#fff', color: T.ink, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          {v.nom}{Number(v.prix_supplement) > 0 ? ` +${euros(Number(v.prix_supplement))}` : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <button type="button" onClick={() => setEnOptions(null)}
                  style={{ flex: 1, padding: '8px', borderRadius: 100, border: `1.5px solid ${T.hairline}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Annuler</button>
                <button type="button"
                  disabled={(groupes[enOptions.id] || []).some(g => g.obligatoire && !(selections[g.id] || []).length)}
                  onClick={() => {
                    const choix = Object.fromEntries(Object.entries(selections).filter(([, v]) => v.length > 0))
                    ajouter(enOptions, Object.keys(choix).length ? choix : null); setEnOptions(null)
                  }}
                  style={{ flex: 2, padding: '8px', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Ajouter</button>
              </div>
            </div>
          )}

          {panier.length > 0 && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${T.hairline}`, paddingTop: 10 }}>
              {panier.map(l => (
                <div key={l.cle} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{l.nom}</span>
                    {l.libelleOptions && <span style={{ display: 'block', fontSize: 12, color: T.muted }}>{l.libelleOptions}</span>}
                  </div>
                  <button type="button" onClick={() => changerQuantite(l.cle, -1)} aria-label={`Retirer un ${l.nom}`}
                    style={{ width: 32, height: 32, borderRadius: 16, border: `1.5px solid ${T.hairline}`, background: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 800, color: T.deep }}>−</button>
                  <span style={{ minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: 800, color: T.ink }}>{l.quantite}</span>
                  <button type="button" onClick={() => changerQuantite(l.cle, 1)} aria-label={`Ajouter un ${l.nom}`}
                    style={{ width: 32, height: 32, borderRadius: 16, border: `1.5px solid ${T.hairline}`, background: '#fff', cursor: 'pointer', fontSize: 18, fontWeight: 800, color: T.deep }}>+</button>
                </div>
              ))}
              <p style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 900, color: T.ink, margin: '8px 0 0' }}>
                <span>Total des articles</span>
                <span>{totalLignes !== null ? euros(totalLignes) : '…'}</span>
              </p>
              {mode === 'livraison' && <p style={{ fontSize: 12, color: T.muted, margin: '2px 0 0' }}>Les frais de livraison s’ajoutent selon ta configuration.</p>}
              {calcul && !calcul.ok && <p role="alert" style={{ fontSize: 13, color: T.erreur, margin: '4px 0 0' }}>{calcul.error}</p>}
            </div>
          )}
        </section>

        {/* 3. QUI */}
        <section style={{ marginBottom: 16 }}>
          <p style={titre}>Client</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom (obligatoire)" aria-label="Nom du client" style={champ} autoComplete="off"/>
            <input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="Téléphone (facultatif)" aria-label="Téléphone" inputMode="tel" style={champ} autoComplete="off"/>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail (facultatif)" aria-label="E-mail" inputMode="email" style={champ} autoComplete="off"/>
          </div>
          {email.trim() && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 14, color: T.ink, cursor: 'pointer' }}>
              <input type="checkbox" checked={confirmation} onChange={e => setConfirmation(e.target.checked)} style={{ width: 18, height: 18, accentColor: T.main }}/>
              Lui envoyer la confirmation de sa commande par e-mail
            </label>
          )}
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note pour la cuisine (facultatif) : sans oignons, bien cuit…" aria-label="Note"
            style={{ ...champ, marginTop: 8 }}/>

          {mode === 'livraison' && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <ChampAdresseLivraison valeur={adresse} onChange={p => setAdresse(a => ({ ...a, ...p }))} style={champ} pourCommercant/>
              <input value={complement} onChange={e => setComplement(e.target.value)} placeholder="Boîte, étage (facultatif)" aria-label="Complément d’adresse" style={champ}/>
              {adresse.situee === false && (
                <input value={adresseLibre} onChange={e => setAdresseLibre(e.target.value)} placeholder="Adresse complète, telle que dictée" aria-label="Adresse complète" style={champ}/>
              )}
              <input value={noteLivraison} onChange={e => setNoteLivraison(e.target.value)} placeholder="Note pour le livreur (facultatif)" aria-label="Note pour le livreur" style={champ}/>
            </div>
          )}
        </section>

        {/* 4. L'ARGENT */}
        <section style={{ marginBottom: 14 }}>
          <p style={titre}>Paiement</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PAIEMENTS_ENCODEE.map(p => (
              <button key={p} type="button" onClick={() => setPaiement(p)} aria-pressed={paiement === p}
                style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${paiement === p ? T.main : T.hairline}`, background: paiement === p ? T.pale : '#fff', color: T.deep, fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {LIBELLES_PAIEMENT_ENCODEE[p]}
              </button>
            ))}
          </div>
        </section>

        {avertissements && avertissements.length > 0 && (
          <div role="alert" style={{ background: '#FFFBEB', border: '1.5px solid #FCD34D', borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#78350F', margin: '0 0 6px' }}>À vérifier avant d’encoder</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: '#78350F', lineHeight: 1.5 }}>
              {avertissements.map(a => <li key={a.code}>{a.message}</li>)}
            </ul>
          </div>
        )}
        {erreur && <p role="alert" style={{ background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: 10, padding: '10px 12px', color: '#7F1D1D', fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>{erreur}</p>}

        {manque && <p style={{ fontSize: 13, color: T.alerte, fontWeight: 700, margin: '0 0 8px', textAlign: 'center' }}>Il manque {manque}.</p>}
        <button type="button" disabled={!!manque || envoi}
          onClick={() => encoder(avertissements ? avertissements.map(a => a.code) : [])}
          style={{ width: '100%', padding: '13px 16px', borderRadius: 100, border: 'none', background: (manque || envoi) ? `${T.muted}66` : `linear-gradient(135deg, ${T.deep}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 16, cursor: manque ? 'not-allowed' : envoi ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          {avertissements && avertissements.length > 0 ? 'Encoder quand même' : 'Encoder la commande'}
          {totalLignes !== null && !envoi ? ` · ${euros(totalLignes)}` : ''}
          {envoi && <DotsAttente couleur="#fff" taille={5} label="Enregistrement"/>}
        </button>
      </div>
    </div>
  )
}
