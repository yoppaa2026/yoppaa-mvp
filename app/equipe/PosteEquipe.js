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
// La fenêtre de saisie DU PATRON, avec l'accès serveur (étape 3b) : les heures
// libres se calculent par le même code pour les deux écrans.
import ModalNouveauRdv from '@/app/dashboard/ModalNouveauRdv'
// Et SA fenêtre de déplacement (30/09), même réglage `serveur`.
import ModalDeplacerRdv from '@/app/dashboard/ModalDeplacerRdv'
import { statutRdv } from '@/lib/rdv-statut'
import { etatPaiementRdv, etatPaiementCommande } from '@/lib/rdv-paiement'
import { referenceRdv, referenceCommande } from '@/lib/numero-commande'
import { intituleReservation } from '@/lib/reservation-metier'
import { estReservationDeTable, couvertsDe } from '@/lib/cours-collectifs'
import { libelleOptions } from '@/lib/options-ligne'
import { libelleRetrait } from '@/lib/libelle-retrait'
import { libelleStatutCommande } from '@/lib/statuts-commande'
import { euros } from '@/lib/montants'
import { libelleJourPoste } from '@/lib/equipe-poste'
// ── Étape 3 : les gestes, avec les MÊMES questions et les MÊMES routes que le
// tableau de bord du patron (29/09).
import { postPro, prevenirClient } from '@/lib/fetch-pro'
import PosteConfirmation, { confirmer } from '@/app/dashboard/PosteConfirmation'
import { questionRdv, statutDepuisChoix, noShowPossible, questionEncaissement } from '@/lib/confirmation-rdv'
import { resteAEncaisser, resteAEncaisserCommande } from '@/lib/rdv-paiement'
import { retourArriereAutorise } from '@/lib/tableau-de-bord'
import { STATUT_SUIVANT, LIBELLE_GESTE_SUIVANT, transitionPermise } from '@/lib/statuts-commande'
import { peutMarquerNonRetire } from '@/lib/rappels-retrait'
import ReglageEtiquettes, { useEtiquettesAppareil, BoutonEtiquettes } from '@/app/dashboard/ReglageEtiquettes'
import { imprimerSiActive } from '@/lib/impression-etiquette'
import { etiquetteConcernee } from '@/lib/etiquette-commande'
import { gesteLivraisonPermis } from '@/lib/livraison-geste'
import { couleurStatutCommande } from '@/lib/couleurs-statut-commande'
import { lirePoste, ecrirePoste } from '@/lib/poste-adresse'
import { estLivraison, filtresCommandes, filtreValide, commandesDeLaVue, ongletsDuPoste } from '@/lib/poste-vues'
import PosteComptoir from './PosteComptoir'

// Les filtres du tableau de bord, les mêmes (lib/poste-vues.js).
const FILTRES_RETRAIT = filtresCommandes('retrait')
const FILTRES_LIVRAISON = filtresCommandes('livraison')

const T = { fond: '#F8F6FF', ink: '#1A0840', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', panel: '#160636', rouge: '#B91C1C', vert: '#047857', filet: '#E7DEF6' }
const carte = { background: '#fff', borderRadius: 14, border: `1px solid ${T.filet}`, padding: 14, boxSizing: 'border-box' }
const puce = (actif) => ({ padding: '8px 14px', borderRadius: 100, border: `1px solid ${actif ? T.panel : T.filet}`, background: actif ? T.panel : '#fff', color: actif ? '#fff' : T.ink, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit' })

// Un rechargement toutes les 10 secondes, et au retour sur l'écran : une
// réservation prise en ligne doit apparaître sans que personne n'y pense.
// ⚠️ 30 SECONDES, C'ÉTAIT TROP (Alex, 01/10 : « le poste se met à jour
// uniquement lors d'un refresh manuel »). À côté du tableau de bord, qui suit
// toutes les 5 secondes, le Poste paraissait figé. L'heure de la dernière mise
// à jour s'affiche, et un bouton permet de ne pas attendre.
const RAFRAICHIR_MS = 10000

// Lit la réponse d'une route de l'équipe, et dit toujours quelque chose.
async function lireReponse(res) {
  if (!res || res.sansSession) return { ok: false, error: 'Ta session a expiré, reconnecte-toi.' }
  if (res.erreurReseau) return { ok: false, error: 'Pas de connexion, réessaie.' }
  const j = await res.json().catch(() => null)
  return j || { ok: false, error: `Réponse illisible (${res.status}).` }
}

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
            <button type="button" disabled={enCours} onClick={() => gestes.deplacer(rdv)} style={{ ...puce(false), padding: '12px 14px' }}>Déplacer</button>
            <button type="button" disabled={enCours} onClick={() => gestes.annuler(rdv)} style={{ ...puce(false), padding: '12px 14px', color: T.rouge, borderColor: '#FCA5A5' }}>Annuler la réservation</button>
          </div>
        )}
        <button type="button" onClick={onFermer} style={{ ...puce(!enAttente || !gestes), width: '100%', marginTop: enAttente && gestes ? 8 : 16, padding: '12px 14px' }}>Fermer</button>
      </div>
    </div>
  )
}

// ─── Les commandes ───────────────────────────────────────────────────────────
// Les filtres de chaque onglet vivent dans `lib/poste-vues.js`.

// ─── Les gestes de livraison, UNE fois pour les deux vues ────────────────────
// La carte complète (cuisine, onglet Livraisons) et la carte réduite du
// livreur montrent les mêmes boutons, selon la même règle partagée.
function BoutonsLivraison({ l, gestes, enCours = null }) {
  if (l.statut !== 'pret') {
    // ⚠️ « EN PRÉPARATION » ÉTAIT ÉCRIT ICI POUR TOUT, nouvelles comprises
    // (Alex, 01/10, capture) : la pastille dit déjà le statut, on dit
    // seulement pourquoi il n'y a pas de bouton.
    return <p style={{ margin: '10px 0 0', fontSize: 12.5, color: T.muted, fontWeight: 700 }}>Pas encore prête à partir.</p>
  }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
      {gesteLivraisonPermis(l, 'en_livraison') && (
        <button type="button" disabled={!!enCours} onClick={() => gestes.partir(l)} style={{ ...puce(false), flex: 1, padding: '11px 14px' }}>
          {enCours === `${l.id}:partir` ? <DotsAttente label="Enregistrement"/> : 'Partir en livraison'}
        </button>
      )}
      {gesteLivraisonPermis(l, 'livree') && (
        <button type="button" disabled={!!enCours} onClick={() => gestes.livree(l)} style={{ ...puce(true), flex: 1, padding: '11px 14px', background: T.vert, borderColor: T.vert }}>
          {enCours === `${l.id}:livree` ? <DotsAttente label="Enregistrement"/> : 'Livrée'}
        </button>
      )}
      {gesteLivraisonPermis(l, 'absent') && (
        <button type="button" disabled={!!enCours} onClick={() => gestes.absent(l)} style={{ ...puce(false), flexBasis: '100%', padding: '10px 14px' }}>
          {enCours === `${l.id}:absent` ? <DotsAttente label="Enregistrement"/> : 'Client absent'}
        </button>
      )}
    </div>
  )
}

// La commande complète, vue par le livreur : ce que ses gestes lisent.
function pourLeLivreur(c) {
  const reste = resteAEncaisserCommande(c)
  return { ...c, a_encaisser: reste > 0 ? reste : null, reference: referenceCommande(c) }
}

// ─── Les filtres, en pastilles, comme au tableau de bord ─────────────────────
// La pastille choisie prend la couleur de son statut, et le compteur ne
// s'écrit que s'il y a quelque chose : les mêmes règles que le patron.
function PastillesFiltres({ filtres, liste, filtre, onChoisir }) {
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
      {filtres.map(f => {
        const n = liste.filter(f.garde).length
        const choisi = filtre === f.cle
        const teinte = f.couleur || T.panel
        return (
          <button key={f.cle} type="button" onClick={() => onChoisir(f.cle)}
            style={{ ...puce(choisi), ...(choisi ? { background: teinte, borderColor: teinte } : {}) }}>
            {f.label}{n > 0 ? ` · ${n}` : ''}
          </button>
        )
      })}
    </div>
  )
}

// Le filtre de l'onglet, repris de l'adresse et écrit dedans.
function useFiltre(filtres) {
  const [filtre, setFiltreEtat] = useState(() => {
    const voulu = typeof window === 'undefined' ? null : lirePoste(window.location.search).filtre
    return filtreValide(filtres, voulu)
  })
  const setFiltre = (cle) => { setFiltreEtat(cle); ecrirePoste({ filtre: cle }) }
  return [filtre, setFiltre]
}

function CarteCommande({ c, commerce, gestes = null, gestesLivraison = null, enCours = null, etiquettes = false, retourPossible = false }) {
  const vers = STATUT_SUIVANT[c.statut]
  const occupe = enCours === c.id
  const avancer = gestes && vers && transitionPermise(c, vers)
  const nonRetire = gestes && peutMarquerNonRetire(c, new Date())
  const creneau = c.creneau || c.creneau_livraison || null
  const paiement = etatPaiementCommande(c, { categorie: commerce.categorie })
  const retrait = libelleRetrait({ ...c, commercant: commerce }, creneau, { court: true })
  // Les couleurs du tableau de bord (Alex, 01/10), depuis la palette partagée.
  const couleur = couleurStatutCommande(c)
  return (
    <div style={{ ...carte, borderTop: `4px solid ${couleur.border}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: T.ink }}>{referenceCommande(c) || 'Commande'} · {c.client_nom || 'Client'}</p>
          {retrait && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: T.muted }}>{retrait}</p>}
        </div>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: couleur.badge, padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{libelleStatutCommande(c)}</span>
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
            <button type="button" disabled={occupe} onClick={() => gestes.avancer(c)} style={{ ...puce(true), flex: 1, padding: '11px 14px' }}>
              {occupe ? <DotsAttente label="Enregistrement"/> : LIBELLE_GESTE_SUIVANT[c.statut]}
            </button>
          )}
          {nonRetire && (
            <button type="button" disabled={occupe} onClick={() => gestes.nonRetire(c)} style={{ ...puce(false), padding: '11px 14px' }}>Non retirée</button>
          )}
        </div>
      )}
      {/* ⚠️ APRÈS LA REMISE (01/10), comme au tableau de bord : noter un
          encaissement oublié ; défaire une remise cliquée par erreur, et
          seulement dans le filtre « Récupérées » (au comptoir, un bouton
          « Annuler » à côté du travail courant deviendrait un clic raté). */}
      {gestes && c.statut === 'recupere' && !c.encaisse_mode && resteAEncaisserCommande(c) > 0 && (
        <button type="button" disabled={occupe} onClick={() => gestes.encaisser(c)}
          style={{ ...puce(false), width: '100%', marginTop: 10, padding: '10px 14px', color: '#9A3412', borderColor: '#EA580C55' }}>
          {occupe ? <DotsAttente label="Enregistrement"/> : 'Noter l’encaissement'}
        </button>
      )}
      {gestes && retourPossible && retourArriereAutorise(c) && (
        <button type="button" disabled={occupe} onClick={() => gestes.retourArriere(c)}
          style={{ ...puce(false), width: '100%', marginTop: 8, padding: '10px 14px', color: T.muted }}>
          ↩ {retourArriereAutorise(c).libelle}
        </button>
      )}
      {/* Une livraison prête : les gestes du livreur, sur la même carte, si la
          personne a la case « Livraisons ». */}
      {gestesLivraison && estLivraison(c) && c.statut === 'pret' && (
        <BoutonsLivraison l={pourLeLivreur(c)} gestes={gestesLivraison} enCours={enCours}/>
      )}
      {/* Le rattrapage et les sacs en plus, sur l'appareil qui imprime seulement. */}
      {etiquettes && ['en_preparation', 'pret'].includes(c.statut) && etiquetteConcernee(c) && (
        <BoutonEtiquettes commande={c} categorie={commerce.categorie} commerce={commerce.nom}/>
      )}
    </div>
  )
}

// La liste complète d'un onglet (Retraits OU Livraisons), groupée par jour.
// `filtres` vient de `lib/poste-vues.js` ; `gestesLivraison` n'est donné que
// dans l'onglet Livraisons, et seulement à qui a la case.
function Commandes({ commandes, commerce, aujourdhui, filtres, gestes = null, gestesLivraison = null, enCours = null }) {
  const [filtre, setFiltre] = useFiltre(filtres)
  const [etiquettesIci, reglerEtiquettes] = useEtiquettesAppareil()
  const garde = filtres.find(f => f.cle === filtre)?.garde || (() => true)
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
      <PastillesFiltres filtres={filtres} liste={commandes} filtre={filtre} onChoisir={setFiltre}/>
      {gestes && <ReglageEtiquettes actif={etiquettesIci} onChanger={reglerEtiquettes} commerce={commerce.nom}/>}
      {parJour.length === 0 && <p style={{ margin: '16px 0', color: T.muted, fontSize: 14 }}>Rien ici pour le moment.</p>}
      {parJour.map(([jour, liste]) => (
        <div key={jour} style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1px' }}>{libelleJourPoste(jour, aujourdhui)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {liste.map(c => <CarteCommande key={c.id} c={c} commerce={commerce} gestes={gestes} gestesLivraison={gestesLivraison} enCours={enCours} etiquettes={etiquettesIci && !!gestes} retourPossible={filtre === 'recupere'}/>)}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Les livraisons du jour ──────────────────────────────────────────────────
// La vue RÉDUITE du livreur sans la case « Commandes » : les livraisons du
// jour, sans prix, avec les mêmes filtres que la cuisine.
function Livraisons({ livraisons, gestes = null, enCours = null }) {
  const [filtre, setFiltre] = useFiltre(FILTRES_LIVRAISON)
  const garde = FILTRES_LIVRAISON.find(f => f.cle === filtre)?.garde || (() => true)
  const visibles = livraisons.filter(garde)
  return (
    <div>
      <p style={{ margin: '0 0 10px', fontSize: 13.5, color: T.muted }}>Les livraisons d&rsquo;aujourd&rsquo;hui, dans l&rsquo;ordre de la tournée.</p>
      <PastillesFiltres filtres={FILTRES_LIVRAISON} liste={livraisons} filtre={filtre} onChoisir={setFiltre}/>
      {visibles.length === 0 && <p style={{ margin: '16px 0', color: T.muted, fontSize: 14 }}>Rien ici pour le moment.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visibles.map((l, i) => (
          <div key={l.id} style={{ ...carte, borderTop: `4px solid ${couleurStatutCommande(l).border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 15.5, fontWeight: 800, color: T.ink }}>{i + 1}. {l.client_nom || 'Client'}</p>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {l.creneau && <span style={{ fontSize: 12.5, color: T.muted, whiteSpace: 'nowrap' }}>{String(l.creneau.heure_debut).slice(0, 5)} – {String(l.creneau.heure_fin).slice(0, 5)}</span>}
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: couleurStatutCommande(l).badge, padding: '4px 10px', borderRadius: 100, whiteSpace: 'nowrap' }}>{libelleStatutCommande(l)}</span>
              </span>
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
            {/* Les gestes du livreur (étape 4), le même composant que la carte complète. */}
            {gestes && <BoutonsLivraison l={l} gestes={gestes} enCours={enCours}/>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Le poste ────────────────────────────────────────────────────────────────
export default function PosteEquipe({ equipe, onChanger }) {
  const [etat, setEtat] = useState({ charge: false })
  // L'onglet reprend celui de l'adresse : un rafraîchissement ne ramène plus
  // au premier (lib/poste-adresse.js). Ce composant ne naît que dans le
  // navigateur, après le choix du commerce : `window` existe ici.
  const [onglet, setOnglet] = useState(() => (typeof window === 'undefined' ? null : lirePoste(window.location.search).onglet))
  // ⚠️ Changer d'onglet repart de « À traiter » : chaque onglet a ses filtres.
  const choisirOnglet = (cle) => { setOnglet(cle); ecrirePoste({ onglet: cle, filtre: null }) }
  const [rdvOuvert, setRdvOuvert] = useState(null)
  // Ce qui travaille (l'identifiant de la ligne), et ce qu'on dit après.
  const [enCours, setEnCours] = useState(null)
  const [avis, setAvis] = useState(null)   // { texte, ton: 'ok' | 'erreur' }
  // La fenêtre de saisie ouverte : { date: Date, heure: 'HH:MM' | '' }.
  const [saisie, setSaisie] = useState(null)
  // ⚠️ STABLE pour la vie du poste : la fenêtre s'en sert dans ses effets.
  const serveurSaisie = useMemo(() => ({
    lireSalle: async (date) => {
      const j = await lireReponse(await postPro('/api/equipe/rdv/salle', { commercant_id: equipe.commercant_id, date }))
      return j.ok
        ? { reservations: j.reservations || [], plafond: j.plafond ?? null, error: null }
        : { reservations: [], plafond: null, error: { message: j.error || 'salle illisible' } }
    },
    creer: async (corps) => lireReponse(await postPro('/api/equipe/rdv/creer', { commercant_id: equipe.commercant_id, ...corps })),
    // ⚠️ PAS DE `commercant_id` ICI : le serveur le déduit de la réservation.
    deplacer: async (corps) => lireReponse(await postPro('/api/equipe/rdv/deplacer', corps)),
  }), [equipe.commercant_id])
  // La réservation ouverte dans la fenêtre de déplacement.
  const [aDeplacer, setADeplacer] = useState(null)

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
      setEtat({ charge: true, ...j, majA: new Date() })
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
  const lire = lireReponse
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
      // La question du patron, « plutôt le déplacer » compris (30/09) : comme
      // chez lui, ce choix ouvre la fenêtre de déplacement au lieu d'annuler.
      const q = questionRdv('annule_commercant', rdv, categorie)
      const choix = await confirmer(q)
      if (choix === 'deplacer') { setRdvOuvert(null); setADeplacer(rdv); return }
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
    // La fenêtre du patron fait le reste : verdict, salle, serveur, rappel, email.
    deplacer: (rdv) => { setAvis(null); setRdvOuvert(null); setADeplacer(rdv) },
  }
  // Ce que la fenêtre de déplacement rend, dit comme un geste du Poste.
  // ⚠️ UN CLIENT SANS ADRESSE SE DIT, avec son téléphone : sinon il vient à
  // l'ancienne heure et personne ne l'a appelé.
  function apresDeplacement(rdv, { clientAEmail, emailParti } = {}) {
    const quand = `${libelleJourPoste(rdv.date_rdv)} à ${String(rdv.heure_debut || '').slice(0, 5)}`
    if (emailParti) dire(`Réservation déplacée au ${quand}. Le client reçoit un email.`)
    else if (!clientAEmail) dire(`Réservation déplacée au ${quand}. Pas d’email pour ce client : préviens-le${rdv.client_telephone ? ` au ${rdv.client_telephone}` : ''}.`, 'erreur')
    else dire(`Réservation déplacée au ${quand}. Le client n’a pas été prévenu.`, 'erreur')
    charger()
  }
  // ─── LIVRER (étape 4, 01/10) ─────────────────────────────────────────────
  // La même route que le patron (`/api/livraison/livrer`), la même question
  // d'argent que le comptoir. ⚠️ L'IDENTIFIANT DU GESTE PORTE LE BOUTON
  // (`id:partir`, `id:livree`) : sur une carte à deux boutons, seul celui qui
  // travaille montre qu'il travaille.
  const gestesLivraison = {
    partir: (l) => geste(`${l.id}:partir`, async () => {
      const j = await lire(await postPro('/api/livraison/livrer', { commande_id: l.id, statut_livraison: 'en_livraison' }))
      if (!j.ok) { dire(j.error || 'La livraison n’a pas pu partir.', 'erreur'); return }
      dire('En route')
      await prevenir('/api/livraison/statut', { commande_id: l.id, statut_livraison: 'en_livraison' }, 'le message « ta commande arrive »')
    }),
    livree: (l) => geste(`${l.id}:livree`, async () => {
      let encaissement = null
      if (Number(l.a_encaisser) > 0) {
        const choix = await confirmer(questionEncaissement({ montant: l.a_encaisser, nom: l.client_nom }))
        if (!choix || choix === 'rien') return
        encaissement = choix
      } else {
        // ⚠️ RIEN À ENCAISSER, MAIS ON DEMANDE QUAND MÊME : « Livrée » prévient
        // le client et ferme la commande. Un pouce qui glisse dans la voiture
        // ne doit pas annoncer une livraison qui n'a pas eu lieu.
        const choix = await confirmer({
          titre: 'Commande livrée ?',
          message: 'Le client est prévenu que sa commande est arrivée.',
          details: [l.reference, l.client_nom].filter(Boolean).join(' · ') || null,
          actions: [
            { valeur: 'oui', ton: 'principal', label: 'Oui, c’est livré' },
            { valeur: 'rien', ton: 'neutre', label: 'Pas encore' },
          ],
        })
        if (choix !== 'oui') return
      }
      const j = await lire(await postPro('/api/livraison/livrer', { commande_id: l.id, statut_livraison: 'livree', encaissement }))
      if (!j.ok) { dire(j.error || 'La livraison n’a pas pu être enregistrée.', 'erreur'); return }
      dire('Commande livrée')
      await prevenir('/api/fidelite/crediter', { commande_id: l.id }, 'le crédit de fidélité du client')
      await prevenir('/api/livraison/statut', { commande_id: l.id, statut_livraison: 'livree' }, 'la notification au client')
    }),
    // Personne à la porte (Alex, 01/10) : la commande revient « prête », et le
    // SERVEUR prévient le client. L'écran dit seulement si c'est parti.
    absent: (l) => geste(`${l.id}:absent`, async () => {
      const choix = await confirmer({
        titre: 'Personne à la porte ?',
        message: 'La commande revient au magasin, et le client est prévenu d’appeler pour une nouvelle livraison ou pour venir la chercher.',
        details: [l.reference, l.client_nom].filter(Boolean).join(' · ') || null,
        actions: [
          { valeur: 'oui', ton: 'principal', label: 'Oui, client absent' },
          { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
        ],
      })
      if (choix !== 'oui') return
      const j = await lire(await postPro('/api/livraison/livrer', { commande_id: l.id, statut_livraison: 'absent' }))
      if (!j.ok) { dire(j.error || 'L’absence n’a pas pu être notée.', 'erreur'); return }
      if (j.client_prevenu) dire('Noté : le client est prévenu de vous appeler.')
      else dire(`Noté, mais le client n’a pas pu être prévenu${l.client_telephone ? ` : appelle-le au ${l.client_telephone}` : ''}.`, 'erreur')
    }),
  }
  // ─── APRÈS LA REMISE (01/10) ─────────────────────────────────────────────
  // Les mêmes routes que le patron : `/api/commande/encaisser` et
  // `/api/commande/retour-arriere`, qui relisent la commande et la règle.
  const gestesApresRemise = {
    encaisser: (c) => geste(c.id, async () => {
      const choix = await confirmer(questionEncaissement({ montant: resteAEncaisserCommande(c), nom: c.client_nom }))
      if (!choix || choix === 'rien') return
      const j = await lire(await postPro('/api/commande/encaisser', { commande_id: c.id, encaissement: choix }))
      if (!j.ok) { dire(j.error || 'L’encaissement n’a pas pu être noté.', 'erreur'); return }
      dire('Encaissement noté')
    }),
    retourArriere: (c) => geste(c.id, async () => {
      const regle = retourArriereAutorise(c)
      if (!regle) return
      const choix = await confirmer({
        titre: `${regle.libelle} ?`,
        message: regle.aide,
        details: [referenceCommande(c), c.client_nom].filter(Boolean).join(' · ') || null,
        actions: [
          { valeur: 'oui', ton: 'danger', label: `Oui, ${regle.libelle.charAt(0).toLowerCase()}${regle.libelle.slice(1)}` },
          { valeur: 'rien', ton: 'neutre', label: 'Ne rien faire' },
        ],
      })
      if (choix !== 'oui') return
      const j = await lire(await postPro('/api/commande/retour-arriere', { commande_id: c.id }))
      if (!j.ok) { dire(j.error || 'Le retour arrière n’a pas pu être enregistré.', 'erreur'); return }
      dire('C’est défait : la commande est de nouveau prête.')
    }),
  }
  const gestesCommande = {
    ...gestesApresRemise,
    avancer: (c) => geste(c.id, async () => {
      const vers = STATUT_SUIVANT[c.statut]
      // ⚠️ L'ÉTIQUETTE PART ICI, AVANT LE PREMIER `await` : `geste` appelle ce
      // travail sans attendre, donc on est encore dans le toucher, ce que
      // Safari exige pour ouvrir la fenêtre d'impression. Elle ne bloque rien.
      // Au démarrage de la prépa (Alex, 01/10) : c'est aussi le bon de préparation.
      if (vers === 'en_preparation') imprimerSiActive(c, { categorie, commerce: etat.commerce?.nom })
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

  // Agenda, Retraits, Livraisons : la règle est dans lib/poste-vues.js.
  const onglets = ongletsDuPoste(etat)
  const actif = onglet && onglets.some(o => o.cle === onglet) ? onglet : onglets[0]?.cle

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: T.ink, letterSpacing: '-0.4px' }}>{equipe.nom}</h1>
        {onChanger && <button type="button" onClick={onChanger} style={{ background: 'none', border: 'none', color: T.main, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Changer de commerce</button>}
      </div>
      {/* ⚠️ L'ÉCRAN DIT DE QUAND IL DATE : sans ça, personne ne sait s'il voit
          la dernière commande ou celle d'il y a une minute. */}
      {etat.majA && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '-8px 0 12px', fontSize: 12, color: T.muted }}>
          <span>À jour à {etat.majA.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
          <button type="button" onClick={charger} style={{ background: 'none', border: 'none', padding: 0, color: T.main, fontWeight: 700, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}>Actualiser</button>
        </div>
      )}

      {!etat.charge && <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><DotsAttente couleur={T.main} label="Chargement du poste"/></div>}
      {etat.erreur && <p style={{ color: T.rouge, fontWeight: 700 }}>{etat.erreur}</p>}
      {etat.horsLigne && <p style={{ color: T.rouge, fontWeight: 700, fontSize: 13 }}>Pas de connexion : ce qui s&rsquo;affiche n&rsquo;est peut-être plus à jour.</p>}
      {avis && (
        <p role="status" style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 12, fontSize: 13.5, fontWeight: 700, background: avis.ton === 'erreur' ? '#FEE2E2' : '#DCFCE7', color: avis.ton === 'erreur' ? T.rouge : T.vert }}>{avis.texte}</p>
      )}
      <PosteConfirmation/>

      {etat.charge && !etat.erreur && onglets.length === 0 && (
        <p style={{ color: T.muted }}>Tes cases ne donnent encore rien à afficher ici. Vois avec ton responsable.</p>
      )}

      {onglets.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {onglets.map(o => <button key={o.cle} type="button" onClick={() => choisirOnglet(o.cle)} style={puce(actif === o.cle)}>{o.label}</button>)}
        </div>
      )}

      {actif === 'agenda' && etat.agenda && etat.droits?.agenda && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
          <button type="button" onClick={() => setSaisie({ date: new Date(), heure: '' })} style={{ ...puce(true), padding: '10px 16px' }}>
            + Nouvelle réservation
          </button>
        </div>
      )}
      {actif === 'agenda' && etat.agenda && (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${T.filet}`, overflow: 'hidden' }}>
          <AgendaRdv rdvs={etat.agenda.rdvs} creneaux={etat.agenda.creneaux} praticiens={etat.agenda.praticiens}
            horairesDetail={etat.commerce?.horaires_detail} commercant={etat.commerce} onSelectRdv={setRdvOuvert}
            onNouveauRdv={etat.droits?.agenda ? (date, heure) => setSaisie({ date, heure }) : undefined}/>
        </div>
      )}
      {saisie && etat.agenda && etat.droits?.agenda && (
        <ModalNouveauRdv
          commercant={etat.commerce}
          prestations={etat.agenda.prestations || []}
          creneaux={etat.agenda.creneaux}
          rdvsExistants={etat.agenda.rdvs}
          dateInit={saisie.date}
          heureInit={saisie.heure}
          serveur={serveurSaisie}
          onClose={() => setSaisie(null)}
          onCreated={() => { dire('Réservation posée'); charger() }}
        />
      )}
      {aDeplacer && etat.agenda && etat.droits?.agenda && (
        <ModalDeplacerRdv
          commercant={etat.commerce}
          rdv={aDeplacer}
          prestations={etat.agenda.prestations || []}
          creneaux={etat.agenda.creneaux}
          rdvsExistants={etat.agenda.rdvs}
          serveur={serveurSaisie}
          onClose={() => setADeplacer(null)}
          onDeplace={apresDeplacement}
        />
      )}
      {actif === 'commandes' && etat.commandes && (
        <Commandes key="retraits" commandes={commandesDeLaVue(etat.commandes, 'retrait')} filtres={FILTRES_RETRAIT}
          commerce={etat.commerce} aujourdhui={etat.aujourdhui} gestes={etat.droits?.commandes ? gestesCommande : null} enCours={enCours}/>
      )}
      {/* ⚠️ LA CUISINE (case « Commandes ») voit les livraisons COMPLÈTES, tous
          les jours ouverts, pour les préparer ; les boutons du livreur s'y
          ajoutent si elle a aussi la case « Livraisons ». Le LIVREUR SEUL garde
          sa vue réduite du jour, sans prix. */}
      {actif === 'livraisons' && (etat.commandes
        ? (
          <Commandes key="livraisons" commandes={commandesDeLaVue(etat.commandes, 'livraison')} filtres={FILTRES_LIVRAISON}
            commerce={etat.commerce} aujourdhui={etat.aujourdhui} gestes={etat.droits?.commandes ? gestesCommande : null}
            gestesLivraison={etat.droits?.livraisons ? gestesLivraison : null} enCours={enCours}/>
        )
        : etat.livraisons && <Livraisons livraisons={etat.livraisons} gestes={etat.droits?.livraisons ? gestesLivraison : null} enCours={enCours}/>)}
      {/* Le comptoir (étape 5) : seulement avec la case, le serveur ne l'envoie qu'à elle. */}
      {actif === 'comptoir' && etat.comptoir && etat.droits?.comptoir && (
        <PosteComptoir commercantId={equipe.commercant_id} comptoir={etat.comptoir}/>
      )}

      {rdvOuvert && <DetailRdv rdv={rdvOuvert} commerce={etat.commerce} droits={etat.droits || {}} gestes={etat.droits?.agenda ? gestesRdv : null} enCours={enCours === rdvOuvert.id} onFermer={() => setRdvOuvert(null)}/>}
    </div>
  )
}
