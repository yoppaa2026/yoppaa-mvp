'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { fetchYopper, fetchAvecPreuveSiConnecte } from '@/lib/fetch-yopper'
import { poserIdentiteLocale } from '@/lib/identite-locale'
import { calculerRemiseRecompense, libelleRemiseRecompense, libelleOffreRecompense, libelleRecompenseUtilisee, libelleAutresRecompenses, libellePerteRecompense } from '@/lib/fidelite-recompense'
import { modesPaiementOuverts, modePaiementEffectif } from '@/lib/modes-paiement'
import { canDo, isVitrine, planEffectif } from '@/lib/plans'
import { normaliserCodeBon, libelleResteBon, libelleBon, repartirBons, BONS_MAX_PAR_COMMANDE } from '@/lib/bons-cadeaux'
import { calculerCapaciteCreneau, creneauCommandable } from '@/lib/creneaux'
import { dealActifCeJour, estOffreSeparee, offresSepareesPourArticle, remiseSurArticle, prixEffectif, prixEffectifVariante } from '@/lib/deals'
import { deposerPanierPourRdv, reprendrePanierPourBoutique } from '@/lib/panier-partage'
import { messagePanierRepris } from '@/lib/panier-repris-message'
import { compterVueFiche } from '@/lib/vue-fiche'
import { joursRetraitBoutique } from '@/lib/ouverture'
import { poserSiChange, ecranRegarde } from '@/lib/rafraichissement'
import { categorieAtteinte, barreDetachee } from '@/lib/responsive'
// ⚠️ `estFoodTruck` n'est plus importé ici depuis le 12/08 : le MÉTIER ne dit
// pas si un commerce bouge. C'est `estItinerant`, qui lit les lieux déclarés,
// qui décide, et une professeure de yoga en profite comme un food truck.
import { jourLocalISO, jourBruxelles } from '@/lib/timezone'
import { contexteRetrait, textesConfirmation } from '@/lib/ecran-retrait'
import { lieuxDuJour, estItinerant, lieuAAfficher } from '@/lib/lieux-activite'
import { champsAdressePourAPI, NOTE_MAX } from '@/lib/adresse-livraison'
import ChampAdresse from '@/app/components/ChampAdresse'
import IconeRetrait from '@/app/components/IconeRetrait'
import BanniereCommerce from '@/app/components/BanniereCommerce'
import GalerieCommerce from '@/app/components/GalerieCommerce'

// Rend en gras ce que les textes encadrent de `**`. La formulation vit dans
// lib/ecran-retrait.js, où elle est testable ; seule la mise en forme reste ici.
function enGras(texte) {
  return String(texte).split(/(\*\*[^*]+\*\*)/g).map((bout, i) =>
    bout.startsWith('**') && bout.endsWith('**')
      ? <strong key={i}>{bout.slice(2, -2)}</strong>
      : <span key={i}>{bout}</span>
  )
}
// LA NOTE AU LIVREUR, SOUS L'ADRESSE.
//
// ⚠️ ELLE N'EXISTE QUE PARCE QUE L'ADRESSE EST DÉSORMAIS NORMALISÉE. Choisir
// dans une liste de suggestions donne enfin des coordonnées, mais efface tout
// ce que le Yopper ajoutait de sa main : « sonner chez le voisin », « portail
// bleu au fond de l'allée ». Sans cet endroit, on aurait gagné la tournée et
// perdu ce qui permet de trouver la porte.
//
// ⚠️ ET ELLE CHANGE DE TON QUAND L'ADRESSE N'EST PAS LOCALISÉE. Ce n'est pas
// décoratif : à ce moment-là, la note devient la SEULE chose qui aidera le
// livreur, et le Yopper doit le savoir avant de valider, pas après.
function NoteLivraison({ valeur, onChange, localisee, aSaisiUneRue, expedition = false }) {
  // ⚠️ LA MÊME LIMITE QUE CELLE QUI TRONQUE À L'ENVOI. Deux nombres écrits
  // séparément finiraient par diverger, et le Yopper verrait « 200/200 » sur un
  // texte silencieusement coupé plus tôt.
  const MAX = NOTE_MAX
  const alerte = aSaisiUneRue && !localisee
  return (
    <div style={{ marginTop: 10 }}>
      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: T.deep, marginBottom: 4 }}>
        {expedition ? 'Un mot pour la livraison du colis' : 'Un mot pour le livreur'} <span style={{ fontWeight: 600, color: T.muted }}>(facultatif)</span>
      </label>
      <textarea
        value={valeur}
        onChange={e => onChange(e.target.value.slice(0, MAX))}
        rows={2}
        placeholder={expedition ? 'Boîte à l’arrière, laisser chez le voisin…' : 'Portail bleu, sonner deux fois, 3e étage sans ascenseur…'}
        style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: 12, border: `1.5px solid ${alerte ? '#FDBA74' : T.pale}`, fontSize: '0.85rem', fontFamily: '"DM Sans", sans-serif', resize: 'vertical', boxSizing: 'border-box' }}
      />
      {alerte ? (
        <p style={{ fontSize: '0.72rem', color: '#9A3412', fontWeight: 700, margin: '4px 0 0', lineHeight: 1.45 }}>
          Cette adresse n&rsquo;a pas été reconnue automatiquement. Ta commande passe quand même,
          mais choisis-la dans la liste si elle y apparaît, ou décris ici comment te trouver.
        </p>
      ) : (
        <p style={{ fontSize: '0.7rem', color: T.muted, fontWeight: 600, margin: '4px 0 0' }}>
          {valeur.length}/{MAX} · ce mot s&rsquo;affiche en évidence sur la commande du commerçant.
        </p>
      )}
    </div>
  )
}

import { redirectTop } from '@/lib/redirect-top'
import { useResetAuRetourDePaiement, cleReprisePanier } from '@/lib/retour-paiement'
import { promptPushOneSignal } from '@/app/components/OneSignalInit'
import PillsStatut from '../PillsStatut'
import CarteFideliteFiche from '../CarteFideliteFiche'
import BonCadeauFiche from '../BonCadeauFiche'
import BonConfirmation from '../BonConfirmation'
// ⚠️ Les 31 montants de ce tunnel s'écrivaient au POINT. Le panier, les
// suppléments, les deals, les frais de livraison, le reste à payer : tout.
import { euros } from '@/lib/montants'
import { doitMontrerFlottant, SEUIL_CACHER, SEUIL_MONTRER } from '@/lib/bouton-flottant'
import BonCadeauModal from '../BonCadeauModal'
import PillStatutOuverture from '@/app/components/PillStatutOuverture'
// ⚠️ `CTAUpgrade` A DISPARU DE CETTE FICHE (26/08). Il rendait UN bandeau par
// envie, et cette page en posait quatre à des hauteurs différentes. Les envies
// tiennent maintenant dans un seul bloc en bas : `SignauxYopper`.
import SignauxYopper from '../SignauxYopper'
import { enviesProposables } from '@/lib/signaux'
import ModalSignalement from '../ModalSignalement'
import HorairesSection from '../HorairesSection'
import BandeAutourDeToi from '@/app/components/BandeAutourDeToi'
// ⚠️ DEMANDE D'ALEX : les avis se consultent, ils ne s'imposent pas. Une note
// globale, et le Yopper choisit s'il veut lire. La règle vit en fonction pure.
import { resumeAvis, libelleBascule } from '@/lib/avis-affichage'
// Icônes Lucide React (charte Yoppaa, pas d'emoji décoratif)
import { Star, Flame, Calendar, Store, Check, Phone, Heart, Share2 } from 'lucide-react'

const T = {
  bg:      '#F8F6FF',
  bgCard:  '#FFFFFF',
  bgPanel: '#160636',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
  pale:    '#EDE0FF',
  ink:     '#1A0840',
  deep:    '#2D0F6B',
  muted:   '#6B7280',
}

// La date d'un jour affiché, au format que la base attend.
//
// ⚠️ SURTOUT PAS `toISOString()`. La Belgique est en avance sur UTC : minuit
// heure belge, c'est 22h ou 23h la VEILLE en temps universel. `toISOString()`
// rendrait donc systématiquement le jour précédent pendant toute la soirée, et
// la charge d'un créneau irait se ranger sous la mauvaise date.
//
// Cette formule est celle qui construit déjà `date_commande` à l'envoi : les
// deux DOIVENT rester identiques, sinon la charge affichée ne retrouverait
// jamais les commandes enregistrées.
// `jourLocalISO` vivait ici, en double avec le tableau de bord. Elle est
// désormais dans `lib/timezone.js`, avec la raison d'être qui l'accompagne :
// `toISOString()` rend la date de la VEILLE entre minuit et deux heures du
// matin en Belgique. Une seule formule, testée au banc.

// « 2026-08-12 » → « demain » ou « mercredi 12 août ». Ancrage à midi en temps
// universel : aucune bascule d'heure d'été à cette heure-là, le jour rendu est
// donc toujours celui de la date écrite.
function dateLisibleFr(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return ''
  const d = new Date(`${dateStr}T12:00:00Z`)
  if (isNaN(d.getTime())) return ''
  const demainD = new Date(); demainD.setDate(demainD.getDate() + 1)
  const demain = `${demainD.getFullYear()}-${String(demainD.getMonth() + 1).padStart(2, '0')}-${String(demainD.getDate()).padStart(2, '0')}`
  if (dateStr === demain) return 'demain'
  const jours = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi']
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  return `${jours[d.getUTCDay()]} ${d.getUTCDate()} ${mois[d.getUTCMonth()]}`
}

const JOURS = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']
const JOURS_LONGS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

function jourIdx(date) {
  const idx = date.getDay()
  return idx === 0 ? 6 : idx - 1
}
function heureEnMinutes(heure) {
  const [h, m] = heure.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}
function maintenant() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
function Etoiles({ note, taille = 14 }) {
  const n = note ? Math.round(note) : 0
  return <span style={{ display: 'inline-flex', gap: 1 }}>{[1,2,3,4,5].map(i => <Star key={i} size={taille} strokeWidth={1.6} color={i<=n ? '#F59E0B' : '#D1D5DB'} fill={i<=n ? '#F59E0B' : 'none'}/>)}</span>
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function Skeleton({ w = '100%', h = 16, r = 8, mb = 0 }) {
  return (
    <div style={{ width: w, height: h, borderRadius: r, background: 'linear-gradient(90deg, #EDE0FF 25%, #F8F6FF 50%, #EDE0FF 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', marginBottom: mb }}/>
  )
}
function SkeletonHeader() {
  return (
    <div>
      <div style={{ height: 220, background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.03) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite' }}/>
      </div>
      <div style={{ background: '#fff', padding: '1rem' }}>
        <Skeleton h={28} w="60%" r={8} mb={8}/>
        <Skeleton h={16} w="40%" r={6} mb={12}/>
        <Skeleton h={14} w="80%" r={6} mb={6}/>
        <Skeleton h={14} w="60%" r={6}/>
      </div>
    </div>
  )
}
function SkeletonArticle() {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${T.pale}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <Skeleton h={18} w="55%" r={6} mb={8}/>
          <Skeleton h={13} w="80%" r={5} mb={8}/>
          <Skeleton h={20} w="25%" r={6}/>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: T.pale, marginLeft: 12 }}/>
      </div>
    </div>
  )
}

// ─── Swipe retrait : version morte supprimée le 31/07 (la version vivante,
// côté Yopper, vit dans app/commander/page.js) ────────────────────────────────
function CarteAvis({ a }) {
  const [ouvert, setOuvert] = useState(false)
  const verifie = !!a.commande_id
  return (
    <div onClick={() => setOuvert(o => !o)}
      style={{ background: T.bgCard, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.5rem', border: `1.5px solid ${T.pale}`, cursor: 'pointer', transition: 'all 0.15s' }}
      onMouseOver={e => e.currentTarget.style.borderColor = T.main}
      onMouseOut={e => e.currentTarget.style.borderColor = T.pale}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Etoiles note={a.note} taille={14}/>
          {verifie && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '2.5px 8px', borderRadius: 100, letterSpacing: '0.5px', textTransform: 'uppercase', border: '1px solid #BBF7D0' }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
              Vérifié
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', color: T.deep, fontWeight: 600 }}>{a.client?.nom || 'Client'}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s', transform: ouvert ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </div>
      </div>
      {a.commentaire && !ouvert && (
        <p style={{ fontSize: '0.8rem', color: T.muted, marginTop: 6, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical' }}>{a.commentaire}</p>
      )}
      {ouvert && (
        <div style={{ marginTop: 8 }}>
          {a.commentaire && <p style={{ fontSize: '0.875rem', color: T.ink, fontWeight: 500, lineHeight: 1.5, marginBottom: a.reponse_commercant ? 10 : 0 }}>{a.commentaire}</p>}
          {a.reponse_commercant && (
            <div style={{ background: T.pale, borderRadius: 10, padding: '0.5rem 0.75rem' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 700, color: T.main, marginBottom: 2 }}>Réponse du commerçant :</p>
              <p style={{ fontSize: '0.82rem', color: T.deep, fontWeight: 500 }}>{a.reponse_commercant}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function OptionsSelector({ article, groupes, onAjouter }) {
  const [selections, setSelections] = useState({})
  const [erreurs, setErreurs] = useState({})
  function toggleValeur(groupe, valeur) {
    setSelections(prev => {
      const current = prev[groupe.id] || []
      if (groupe.type === 'unique') return { ...prev, [groupe.id]: [valeur] }
      const exists = current.find(v => v.id === valeur.id)
      return { ...prev, [groupe.id]: exists ? current.filter(v => v.id !== valeur.id) : [...current, valeur] }
    })
    setErreurs(p => ({ ...p, [groupe.id]: false }))
  }
  function valider() {
    const errs = {}; let ok = true
    groupes.forEach(g => {
      if (g.obligatoire && (!selections[g.id] || selections[g.id].length === 0)) { errs[g.id] = true; ok = false }
    })
    setErreurs(errs)
    if (!ok) return
    onAjouter(article, Object.keys(selections).length > 0 ? selections : null)
  }
  const supplement = Object.values(selections).flat().reduce((acc, v) => acc + (v.prix_supplement||0), 0)
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', marginTop: 8, border: `1.5px solid ${T.pale}` }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: 12, fontSize: '0.9rem' }}>Personnalise ton {article.nom}</p>
      {groupes.map(g => {
        const isUnique = g.type === 'unique'
        return (
          <div key={g.id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
              <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.85rem' }}>{g.nom}</p>
              <span style={{ fontSize: '0.6rem', fontWeight: 800, background: isUnique ? T.deep : T.pale, color: isUnique ? '#fff' : T.deep, padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {isUnique ? 'Choisis-en un' : 'Cumulables'}
              </span>
              {g.obligatoire && <span style={{ fontSize: '0.6rem', fontWeight: 800, background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Obligatoire</span>}
            </div>
            {erreurs[g.id] && <p style={{ fontSize: '0.72rem', color: '#DC2626', marginBottom: 4, fontWeight: 700 }}>Choix obligatoire</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(g.valeurs||[]).map(v => {
                const selected = !!(selections[g.id]||[]).find(s => s.id === v.id)
                return (
                  <button key={v.id} onClick={() => toggleValeur(g, v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.75rem', borderRadius: 10, border: `1.5px solid ${selected ? T.main : T.pale}`, background: selected ? `${T.main}0c` : '#fff', cursor: 'pointer', transition: 'all 0.15s', fontFamily: '"DM Sans", sans-serif', textAlign: 'left', width: '100%' }}>
                    {/* Indicateur visuel : rond plein si unique (radio), carré coché si multi (checkbox) */}
                    <span style={{ width: 18, height: 18, borderRadius: isUnique ? '50%' : 5, border: `2px solid ${selected ? T.main : '#D1D5DB'}`, background: selected ? T.main : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                      {selected && (isUnique
                        ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }}/>
                        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12l5 5L20 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )}
                    </span>
                    <span style={{ flex: 1, fontWeight: selected ? 700 : 600, color: T.ink, fontSize: '0.85rem' }}>{v.nom}</span>
                    {v.prix_supplement > 0 && (
                      <span style={{ fontWeight: 800, color: T.main, fontSize: '0.78rem' }}>+{euros(Number(v.prix_supplement))}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
      <button onClick={valider}
        style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.main}44`, marginTop: 4 }}>
        Ajouter à ma commande{supplement > 0 ? ` (+${euros(supplement)})` : ''}
      </button>
    </div>
  )
}

// ─── VariantesSelector (Module 2 boutique) : choix taille/couleur/pointure ───
// L'article détail/vitrine gère des variantes (axes axe1/axe2 + combinaisons
// article_variantes). Le Yopper choisit une valeur par axe → la combinaison
// donne le prix (override ou prix article) et le stock. Ajout au panier avec
// la variante attachée (le serveur revalide prix + stock via variante_id).
function VariantesSelector({ article, variantes, onAjouter }) {
  const [choix1, setChoix1] = useState(null)
  const [choix2, setChoix2] = useState(null)
  const deuxAxes = !!article.axe2_nom
  const vals1 = [...new Set(variantes.map(v => v.axe1_valeur).filter(Boolean))]
  const vals2 = deuxAxes ? [...new Set(variantes.map(v => v.axe2_valeur).filter(Boolean))] : []
  const varianteChoisie = choix1
    ? variantes.find(v => v.axe1_valeur === choix1 && (!deuxAxes || v.axe2_valeur === choix2)) || null
    : null
  // Une valeur est proposable si au moins une combinaison en stock existe
  const dispo1 = (v1) => variantes.some(v => v.axe1_valeur === v1 && v.stock > 0)
  const dispo2 = (v2) => variantes.some(v => v.axe1_valeur === choix1 && v.axe2_valeur === v2 && v.stock > 0)
  const prixAffiche = varianteChoisie
    ? (varianteChoisie.prix != null ? Number(varianteChoisie.prix) : Number(article.prix))
    : null
  const epuise = !!varianteChoisie && (varianteChoisie.stock || 0) <= 0
  const pret = !!varianteChoisie && !epuise

  const chipSt = (sel, off) => ({
    padding: '7px 13px', borderRadius: 100, cursor: off ? 'default' : 'pointer',
    border: `1.5px solid ${sel ? T.main : T.pale}`, background: sel ? T.main : '#fff',
    color: sel ? '#fff' : off ? '#C7C2D6' : T.ink, fontSize: '0.82rem', fontWeight: 700,
    fontFamily: '"DM Sans", sans-serif', textDecoration: off ? 'line-through' : 'none', transition: 'all 0.15s',
  })

  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '1rem', marginTop: 8, border: `1.5px solid ${T.pale}` }}>
      <p style={{ fontWeight: 800, color: T.deep, marginBottom: 12, fontSize: '0.9rem' }}>Choisis ta version</p>
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.85rem', marginBottom: 6 }}>{article.axe1_nom || 'Version'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {vals1.map(v1 => {
            const off = !dispo1(v1)
            return (
              <button key={v1} onClick={() => { setChoix1(v1); setChoix2(null) }} style={chipSt(choix1 === v1, off)}>
                {v1}
              </button>
            )
          })}
        </div>
      </div>
      {deuxAxes && choix1 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontWeight: 800, color: T.ink, fontSize: '0.85rem', marginBottom: 6 }}>{article.axe2_nom}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {vals2.map(v2 => {
              const off = !dispo2(v2)
              return (
                <button key={v2} onClick={() => setChoix2(v2)} style={chipSt(choix2 === v2, off)}>
                  {v2}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {varianteChoisie && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          {prixAffiche != null && Number(prixAffiche) > 0 && (
            <span style={{ fontSize: '1.05rem', fontWeight: 900, color: T.main, letterSpacing: '-0.3px' }}>{euros(Number(prixAffiche))}</span>
          )}
          {epuise ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#DC2626', background: '#FEE2E2', padding: '3px 10px', borderRadius: 100 }}>Épuisé</span>
          ) : (varianteChoisie.stock || 0) <= 3 ? (
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#B45309', background: '#FFFBEB', padding: '3px 10px', borderRadius: 100 }}>Plus que {varianteChoisie.stock}</span>
          ) : (
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#10B981', background: '#F0FDF4', padding: '3px 10px', borderRadius: 100 }}>En stock</span>
          )}
        </div>
      )}
      <button onClick={() => pret && onAjouter(article, varianteChoisie)} disabled={!pret}
        style={{ width: '100%', padding: '0.75rem', border: 'none', borderRadius: 100, background: pret ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#E5E7EB', color: pret ? '#fff' : '#9CA3AF', fontWeight: 800, cursor: pret ? 'pointer' : 'default', fontSize: '0.875rem', fontFamily: '"DM Sans", sans-serif', boxShadow: pret ? `0 4px 14px ${T.main}44` : 'none', marginTop: 4 }}>
        {pret ? 'Ajouter à ma commande' : deuxAxes && choix1 && !choix2 ? `Choisis ${article.axe2_nom}` : `Choisis ${article.axe1_nom || 'ta version'}`}
      </button>
    </div>
  )
}

// ─── RecapPanier - FIX STOCK : prop getStockMax, bouton + bloqué ──────────────
function RecapPanier({ panier, onRetirer, onAjouter, total, onValider, getStockMax, labelValider = 'Choisir mon heure de retrait', noteSousTotal = null }) {
  const items = Object.entries(panier)
  if (items.length === 0) return null
  function labelOptions(options) {
    if (!options) return null
    return Object.values(options).flat().map(v => v.nom).join(', ')
  }
  return (
    <div style={{ background: '#fff', borderRadius: 20, border: `2px solid ${T.main}22`, overflow: 'hidden', marginTop: 20, boxShadow: `0 8px 32px ${T.main}18` }}>
      {/* Bande 3px canonique YOPPAA */}
      <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
      <div style={{ background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, padding: '0.875rem 1.25rem' }}>
        <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#fff', fontSize: '0.875rem', margin: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3h2l2.4 11.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L22 7H6"/>
            <circle cx="9" cy="20" r="1.5"/>
            <circle cx="18" cy="20" r="1.5"/>
          </svg>
          Mon panier
        </p>
      </div>
      <div style={{ padding: '0.5rem 1.25rem' }}>
        {items.map(([key, item]) => {
          const opts = item.variante?.label || labelOptions(item.options)
          const prixUnitaire = item.prix + (item.options ? Object.values(item.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0)
          // FIX STOCK : vérifier la limite par article dans le panier
          // (item à variante : le stock de LA variante fait foi)
          const stockMax = item.variante ? (item.variante.stock ?? Infinity) : (getStockMax ? getStockMax(item.id) : Infinity)
          // Une ligne deal consomme unites_par_deal unités de stock par +
          const unitesLigne = item.deal_id ? (item.unites_par_deal || 1) : 1
          const stockAtteintPanier = stockMax !== Infinity && (item.quantite + 1) * unitesLigne > stockMax
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.625rem 0', borderBottom: `1px solid ${T.pale}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button onClick={() => onRetirer(key)}
                  style={{ width: 30, height: 30, borderRadius: 9, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 900, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 22 }}>
                  <span style={{ fontWeight: 900, fontSize: '0.95rem', color: T.ink, textAlign: 'center' }}>{item.quantite}</span>
                  {stockAtteintPanier && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.48rem', fontWeight: 800, color: T.main, letterSpacing: '0.3px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                      MAX
                      <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                    </span>
                  )}
                </div>
                <button
                  onClick={() => !stockAtteintPanier && onAjouter(key, item)}
                  disabled={stockAtteintPanier}
                  style={{ width: 30, height: 30, borderRadius: 9, border: 'none', background: stockAtteintPanier ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteintPanier ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteintPanier ? 'default' : 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>+</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 700, color: T.ink, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nom}</p>
                {opts && <p style={{ fontSize: '0.7rem', color: T.muted, marginTop: 1 }}>{opts}</p>}
                {stockAtteintPanier && (
                  <p style={{ fontSize: '0.68rem', color: T.main, fontWeight: 700, marginTop: 2 }}>Stock disponible atteint</p>
                )}
              </div>
              <p style={{ fontWeight: 800, color: T.main, fontSize: '0.9rem', flexShrink: 0 }}>{euros((prixUnitaire * item.quantite))}</p>
            </div>
          )
        })}
      </div>
      <div style={{ padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: noteSousTotal ? 4 : 12 }}>
          <span style={{ fontWeight: 700, color: T.muted, fontSize: '0.875rem' }}>Total commande</span>
          <span style={{ fontWeight: 900, color: T.ink, fontSize: '1.25rem', letterSpacing: '-0.5px' }}>{euros(total)}</span>
        </div>
        {noteSousTotal && (
          <p style={{ fontSize: '0.72rem', color: T.main, fontWeight: 700, margin: '0 0 12px' }}>{noteSousTotal}</p>
        )}
        <button onClick={onValider}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }}>
          {labelValider}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14"/>
            <path d="M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ─── ArticleRow ───────────────────────────────────────────────────────────────
// `jourRetrait` ('YYYY-MM-DD' ou null) : le jour SOUHAITÉ en boutique. Quand il
// est fourni, il prime sur `joursDispos[jourSelectionne]`, qui est le sélecteur
// de l'alimentaire et ne concerne pas une boutique.
function ArticleRow({ article, optionsParArticle, ajouterAuPanier, retirerDuPanier, qteTotaleArticle, stocksJour, jourSelectionne, joursDispos, jourRetrait = null, commandesParArticleJour, modeVitrine = false, masquerPrix = false, photoUrl = null, variantes = [], onOpenDetail = null, remise = null }) {
  const groupes = optionsParArticle[article.id] || []
  // Variantes (Module 2 boutique) : priment sur les options si les deux existent
  const hasVariantes = !!article.gere_variantes && variantes.length > 0
  const hasOptions = !hasVariantes && groupes.length > 0
  const [showOptions, setShowOptions] = useState(false)
  const qteTotale = qteTotaleArticle(article.id)
  const keySimple = String(article.id)

  const stocksArticle = stocksJour[article.id] || {}
  const hasStockJour = Object.keys(stocksArticle).length > 0

  const jourDateSelectionne = jourRetrait
    ? new Date(`${jourRetrait}T12:00:00Z`)
    : (joursDispos[jourSelectionne]?.date || new Date())
  const jourNomSelectionne = JOURS[jourIdx(jourDateSelectionne)]

  // Logique unifiée avec getStockMax :
  // - entrée article_stock_jour pour ce jour → source de vérité
  // - sinon → fallback sur article.stock_jour global
  // - stock géré ssi (entrée existe pour ce jour) OU (stock_jour global > 0)
  const entryDay = stocksArticle[jourNomSelectionne]
  let stockBrutSelectionne, actifCeJour
  if (entryDay) {
    actifCeJour = entryDay.actif !== false
    stockBrutSelectionne = entryDay.actif === false ? 0 : (entryDay.stock || 0)
  } else {
    actifCeJour = true
    stockBrutSelectionne = article.stock_jour || 0
  }
  const stockGere = !!entryDay || (article.stock_jour || 0) > 0
  const dejaCommande = (commandesParArticleJour && commandesParArticleJour[article.id]) || 0
  const stockAujourdhui = Math.max(0, stockBrutSelectionne - dejaCommande)
  const epuiseAujourdhui = stockGere && stockAujourdhui === 0

  function prochainJourDispo() {
    for (let i = 1; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i)
      const nom = JOURS[jourIdx(d)]
      const s = stocksArticle[nom]
      if (!hasStockJour || (s && s.actif !== false && s.stock > 0)) {
        return { nom: JOURS_LONGS[jourIdx(d)], idx: i }
      }
    }
    return null
  }

  const prochain = epuiseAujourdhui ? prochainJourDispo() : null
  const epuiseComplet = epuiseAujourdhui && !prochain
  const inactifCeJour = !actifCeJour
  // Stock limit : bloquer le + quand panier atteint le stock dispo
  const stockAtteint = stockGere && stockAujourdhui > 0 && qteTotale >= stockAujourdhui

  return (
    <div className="art-card" style={{ background: '#fff', borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${(epuiseComplet || inactifCeJour) ? '#E5E7EB' : qteTotale > 0 ? T.main+'44' : T.pale}`, boxShadow: qteTotale > 0 ? `0 2px 12px ${T.main}18` : '0 1px 4px rgba(107,53,196,0.04)', opacity: (epuiseComplet || inactifCeJour) ? 0.6 : 1, transition: 'all 0.2s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        {/* Photo d'article (Module 1/2 boutique) : pas de bloc image si absente
            (décision placeholders : les listes restent texte-only sans photo) */}
        {photoUrl && (
          <div onClick={onOpenDetail || undefined} style={{ width: 64, height: 64, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: T.pale, border: `1px solid ${T.pale}`, cursor: onOpenDetail ? 'pointer' : 'default' }}>
            <img decoding="async" src={photoUrl} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
          </div>
        )}
        <div onClick={onOpenDetail || undefined} style={{ flex: 1, cursor: onOpenDetail ? 'pointer' : 'default' }}>
          <p style={{ fontWeight: 700, color: T.ink, marginBottom: 2, fontSize: '0.95rem', letterSpacing: '-0.2px' }}>{article.nom}</p>
          {article.description && <p style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 5, lineHeight: 1.4 }}>{article.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {masquerPrix ? (
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, background: '#F3F4F6', padding: '4px 10px', borderRadius: 100, border: '1px dashed #D1D5DB' }}>
                Prix non affichés
              </span>
            ) : article.est_vitrine ? (
              // Article en mode vitrine : "à partir de X €" ou "Prix sur demande"
              Number(article.prix) > 0 ? (
                <p style={{ fontSize: '0.95rem', color: T.main, fontWeight: 800, letterSpacing: '-0.2px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: T.muted, marginRight: 4 }}>dès</span>
                  {euros(Number(article.prix))}
                </p>
              ) : (
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, background: '#F9FAFB', padding: '4px 10px', borderRadius: 100 }}>
                  Prix sur demande
                </span>
              )
            ) : remise ? (
              // Article remisé : le prix promo REMPLACE le prix normal, l'ancien
              // reste barré à côté. Un seul article, un seul prix affiché.
              <>
                <p style={{ fontSize: '1rem', color: '#DC2626', fontWeight: 900, letterSpacing: '-0.3px' }}>{euros(remise.prix)}</p>
                <span style={{ fontSize: '0.8rem', color: T.muted, fontWeight: 700, textDecoration: 'line-through' }}>{euros(remise.prixBarre)}</span>
                <span style={{ fontSize: '0.62rem', fontWeight: 900, color: '#fff', background: '#DC2626', padding: '2px 7px', borderRadius: 100, letterSpacing: '0.2px' }}>
                  {remise.deal.remise_pct ? `-${remise.deal.remise_pct}%` : 'PROMO'}
                </span>
              </>
            ) : (
              <p style={{ fontSize: '1rem', color: T.main, fontWeight: 900, letterSpacing: '-0.3px' }}>{euros(Number(article.prix))}</p>
            )}
            {hasOptions && (
              <button onClick={e => { e.stopPropagation(); setShowOptions(v => !v) }}
                aria-label="Composer cet article"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 800, color: T.main, background: T.pale, padding: '3px 9px 3px 7px', borderRadius: 100, border: `1px solid ${T.main}22`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', letterSpacing: '-0.1px', transition: 'all 0.15s' }}
                onMouseOver={e => { e.currentTarget.style.background = `${T.main}1f`; e.currentTarget.style.borderColor = `${T.main}55` }}
                onMouseOut={e => { e.currentTarget.style.background = T.pale; e.currentTarget.style.borderColor = `${T.main}22` }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l1.9 5.8H20l-5 3.6L17 18l-5-3.6L7 18l2-5.6-5-3.6h6.1L12 3z"/>
                </svg>
                Compose +{groupes.length}
              </button>
            )}
            {hasVariantes && (
              <button onClick={e => { e.stopPropagation(); setShowOptions(v => !v) }}
                aria-label="Choisir une version"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', fontWeight: 800, color: T.main, background: T.pale, padding: '3px 9px', borderRadius: 100, border: `1px solid ${T.main}22`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', letterSpacing: '-0.1px' }}>
                {article.axe1_nom || 'Version'}{article.axe2_nom ? ` · ${article.axe2_nom}` : ''}
              </button>
            )}
            {/* Badge DEAL retiré de la card unité (24/07) : l'offre vit sur sa
                propre DealOfferCard juste en dessous, plus de confusion. */}
          </div>

          {/* Article à VARIANTES : le stock vit PAR variante (taille/couleur),
              la card n'affiche que dispo/épuisé, le détail vit dans la fiche */}
          {hasVariantes ? (() => {
            const dispoVar = (variantes || []).some(v => v.actif !== false && (v.stock ?? 0) > 0)
            return dispoVar ? (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F0FDF4', color: '#10B981', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10B981', flexShrink: 0 }}/>
                En stock
              </span>
            ) : (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }}/>
                Épuisé
              </span>
            )
          })() : null}

          {/* Indicateur stock 3 niveaux - clair et pro (articles SANS variantes) */}
          {!hasVariantes && stockGere && (() => {
            // Pastilles status : dot taille 9 statique pour harmonisation YOPPAA (status indicator, pas live event)
            if (inactifCeJour) {
              return prochain ? (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F9FAFB', color: T.muted, padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9CA3AF', flexShrink: 0 }}/>
                  Disponible {prochain.nom}
                </span>
              ) : (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F9FAFB', color: T.muted, padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#9CA3AF', flexShrink: 0 }}/>
                  Indisponible
                </span>
              )
            }
            if (stockAujourdhui === 0) {
              return (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }}/>
                  Épuisé
                </span>
              )
            }
            if (stockAujourdhui <= 5) {
              return (
                <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#FFF7ED', color: '#EA580C', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#EA580C', flexShrink: 0 }}/>
                  Plus que {stockAujourdhui}
                </span>
              )
            }
            return (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#F0FDF4', color: '#10B981', padding: '3px 9px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#10B981', flexShrink: 0 }}/>
                Disponible
              </span>
            )
          })()}
        </div>

        {!modeVitrine && !article.est_vitrine && !epuiseComplet && !inactifCeJour && !epuiseAujourdhui && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, flexShrink: 0 }}>
            {(hasOptions || hasVariantes) ? (
              // hasOptions : "+ " ouvre les options (au lieu d'ajouter direct). Compteur visible si qte > 0.
              // Visuel uniforme avec les articles simples : meme bouton "+ " gradient, plus de gros gear violet.
              <>
                {qteTotale > 0 && (
                  <div style={{ background: T.main, color: '#fff', fontWeight: 900, fontSize: '0.78rem', borderRadius: 100, minWidth: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', boxShadow: `0 2px 8px ${T.main}33` }}>
                    {qteTotale}
                  </div>
                )}
                <button onClick={() => setShowOptions(v => !v)} disabled={stockAtteint}
                  aria-label="Composer cet article"
                  style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: stockAtteint ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteint ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteint ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: stockAtteint ? 'none' : `0 4px 14px ${T.main}55`, transition: 'all 0.15s' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14"/>
                    <path d="M5 12h14"/>
                  </svg>
                </button>
              </>
            ) : (
              qteTotale > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => retirerDuPanier(keySimple)}
                    aria-label="Retirer"
                    style={{ width: 34, height: 34, borderRadius: 10, border: `2px solid ${T.pale}`, background: '#fff', color: T.main, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, minWidth: 22, textAlign: 'center' }}>{qteTotale}</span>
                    {stockAtteint && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, fontSize: '0.5rem', fontWeight: 800, color: T.main, letterSpacing: '0.3px', whiteSpace: 'nowrap', lineHeight: 1 }}>
                        MAX
                        <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                      </span>
                    )}
                  </div>
                  <button onClick={() => !stockAtteint && ajouterAuPanier(article)} disabled={stockAtteint}
                    aria-label="Ajouter"
                    style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: stockAtteint ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteint ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteint ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: stockAtteint ? 'none' : `0 4px 14px ${T.main}55`, transition: 'all 0.15s' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => !stockAtteint && ajouterAuPanier(article)}
                  disabled={stockAtteint}
                  aria-label="Ajouter"
                  style={{ width: 36, height: 36, borderRadius: 10, border: 'none', background: stockAtteint ? '#E5E7EB' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: stockAtteint ? '#9CA3AF' : '#fff', fontWeight: 900, cursor: stockAtteint ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: stockAtteint ? 'none' : `0 4px 14px ${T.main}55` }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                </button>
              )
            )}
          </div>
        )}
      </div>
      {showOptions && hasOptions && (
        <OptionsSelector article={article} groupes={groupes} onAjouter={(a, opts) => { ajouterAuPanier(a, opts); setShowOptions(false) }}/>
      )}
      {showOptions && hasVariantes && (
        <VariantesSelector article={article} variantes={variantes}
          onAjouter={(a, variante) => { ajouterAuPanier(a, null, variante); setShowOptions(false) }}/>
      )}
    </div>
  )
}

// ─── Carte OFFRE SÉPARÉE : un lot ou un duo est un autre objet que l'unité
// (« 3 croissants + 1 offert » n'est pas un croissant), il a donc sa propre
// carte et son propre prix, et l'unité reste commandable à côté.
//
// Les remises, elles, ne passent JAMAIS par ici : elles modifient le prix de
// l'article sur sa propre carte. Voir lib/deals.js.
function DealOfferCard({ deal, qte = 0, onAjouter, onRetirer }) {
  const prixAffiche = deal.prix_deal != null ? Number(deal.prix_deal) : null
  const prixBarre = deal.prix_original != null ? Number(deal.prix_original) : null
  return (
    <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: '0.625rem', border: `1.5px solid ${T.main}55`, boxShadow: `0 4px 16px ${T.main}26` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', fontWeight: 800, color: '#FB923C', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#FB923C"><path d="M12 2c1 3 3 4 3 7 0 1.5-1 3-3 3s-3-1.5-3-3c0-2 2-3 3-7zm-5 9c-1 0-3 2-3 6 0 4 3 5 8 5s8-1 8-5c0-4-2-6-3-6 0 3-2 5-5 5s-5-2-5-5z"/></svg>
            Deal du jour
          </span>
          <p style={{ fontWeight: 800, color: '#fff', fontSize: '0.9rem', letterSpacing: '-0.2px', lineHeight: 1.3, margin: '0 0 3px' }}>{deal.titre}</p>
          {deal.description && <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.45, margin: '0 0 6px' }}>{deal.description}</p>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {prixAffiche != null && (
              <span style={{ fontSize: '1.05rem', fontWeight: 900, color: T.light, letterSpacing: '-0.3px' }}>{euros(prixAffiche)}</span>
            )}
            {prixBarre != null && (
              <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', fontWeight: 700, textDecoration: 'line-through' }}>{euros(prixBarre)}</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 4 }}>
          {qte > 0 && (
            <>
              <button onClick={onRetirer} aria-label="Retirer le deal"
                style={{ width: 30, height: 30, borderRadius: 9, border: '1.5px solid rgba(255,255,255,0.3)', background: 'transparent', color: '#fff', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M5 12h14"/></svg>
              </button>
              <span style={{ fontWeight: 900, fontSize: '0.95rem', color: '#fff', minWidth: 18, textAlign: 'center' }}>{qte}</span>
            </>
          )}
          <button onClick={onAjouter} aria-label="Ajouter le deal"
            style={{ width: 34, height: 34, borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 14px ${T.main}66` }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Identifiant anonyme d'appareil pour les cœurs (un cœur par appareil et
// par article, aucun compte requis). Généré une fois, persisté en localStorage.
function getDeviceId() {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = localStorage.getItem('yoppaa_device_id')
    if (!id) {
      id = (crypto?.randomUUID ? crypto.randomUUID() : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
      localStorage.setItem('yoppaa_device_id', id)
    }
    return id
  } catch (e) {
    return 'no-storage'
  }
}

// ─── Fiche article « façon post » (refonte 30/07, demande Alex) : header
// commerçant, mosaïque photos façon réseau social (tap = plein écran),
// description riche (les emojis et sauts de ligne du commerçant respectés),
// cœur + partage, puis achat (VariantesSelector si variantes). Tous catalogues.
function ArticleDetailModal({ article, variantes, photosActives, commercant, social, onToggleLike, onPartager, partageEtat, onClose, onAjouter, onAjouterVariante, remise = null }) {
  const [galerie, setGalerie] = useState([])
  const [photoIdx, setPhotoIdx] = useState(null)   // index de la photo ouverte en plein écran
  const touchXRef = useRef(null)                   // swipe gauche/droite dans le viewer
  useEffect(() => {
    if (!photosActives) return
    let ok = true
    supabase.from('article_photos').select('id, url, ordre').eq('article_id', article.id).order('ordre')
      .then(({ data }) => { if (ok) setGalerie((data || []).filter(p => p.url)) })
    return () => { ok = false }
  }, [article.id, photosActives])

  const photos = photosActives
    ? [...(article.photo_url ? [{ id: 'couv', url: article.photo_url }] : []), ...galerie.filter(p => p.url !== article.photo_url)]
    : []
  const hasVar = !!article.gere_variantes && (variantes || []).length > 0
  const imgBase = { width: '100%', height: '100%', objectFit: 'cover', display: 'block', cursor: 'pointer', background: T.pale }

  // Mosaïque façon post : 1 photo = grande 4:5 ; 2 = deux colonnes ;
  // 3+ = grande à gauche (2/3) + colonne de 2 vignettes, badge +N si plus.
  // La hauteur est verrouillée par l'aspectRatio du CONTENEUR (pas des images) :
  // les anciennes photos au ratio libre ne cassent plus l'alignement, object-fit
  // cover absorbe la différence. Simple fonction de rendu (pas un composant).
  function renderMosaique() {
    if (photos.length === 0) return null
    if (photos.length === 1) {
      return <img decoding="async" loading="lazy" src={photos[0].url} alt={article.nom} onClick={() => setPhotoIdx(0)}
        style={{ ...imgBase, aspectRatio: '4/5', height: 'auto' }}/>
    }
    if (photos.length === 2) {
      // 2 colonnes 4:5 → conteneur 8:5
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, aspectRatio: '8/5' }}>
          {photos.map(p => (
            <img decoding="async" loading="lazy" key={p.id} src={p.url} alt={article.nom} onClick={() => setPhotoIdx(photos.indexOf(p))} style={imgBase}/>
          ))}
        </div>
      )
    }
    // Grande 2/3 en 4:5 → conteneur 6:5, colonne droite alignée sur sa hauteur
    const reste = photos.length - 3
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 2, aspectRatio: '6/5' }}>
        <img decoding="async" loading="lazy" src={photos[0].url} alt={article.nom} onClick={() => setPhotoIdx(0)}
          style={{ ...imgBase, minHeight: 0 }}/>
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 2, minHeight: 0 }}>
          <img decoding="async" loading="lazy" src={photos[1].url} alt={article.nom} onClick={() => setPhotoIdx(1)} style={{ ...imgBase, minHeight: 0 }}/>
          <div style={{ position: 'relative', minHeight: 0 }}>
            <img decoding="async" loading="lazy" src={photos[2].url} alt={article.nom} onClick={() => setPhotoIdx(2)} style={{ ...imgBase, height: '100%' }}/>
            {reste > 0 && (
              <button onClick={() => setPhotoIdx(2)}
                style={{ position: 'absolute', inset: 0, border: 'none', background: 'rgba(22,6,54,0.55)', color: '#fff', fontWeight: 900, fontSize: '1.1rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                +{reste}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const pillSocial = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.deep, fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }

  return (
    <div role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(22,6,54,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520, maxHeight: '90dvh', overflowY: 'auto', animation: 'fadeUp 0.25s ease' }}>

        {/* Header façon post : avatar + nom du commerçant + fermer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.8rem 1rem' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {commercant?.logo_url
              ? <img decoding="async" loading="lazy" src={commercant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
              : <span style={{ color: '#fff', fontWeight: 900, fontSize: '1rem' }}>{(commercant?.nom || 'Y').charAt(0).toUpperCase()}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontWeight: 900, fontSize: '0.92rem', color: T.ink, letterSpacing: '-0.2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{commercant?.nom}</p>
            {commercant?.type && <p style={{ margin: 0, fontSize: '0.7rem', color: T.main, fontWeight: 700 }}>{commercant.type}</p>}
          </div>
          <button onClick={onClose} aria-label="Fermer"
            style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: T.pale, color: T.deep, cursor: 'pointer', fontSize: 14, fontWeight: 800, flexShrink: 0, lineHeight: '30px', padding: 0 }}>✕</button>
        </div>

        {renderMosaique()}
        {/* Séparation signature : la bande tricolore Yoppaa sous les photos */}
        {photos.length > 0 && (
          <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
        )}

        <div style={{ padding: '1rem 1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
            <h3 style={{ fontWeight: 900, fontSize: '1.15rem', color: T.ink, letterSpacing: '-0.4px', margin: 0, lineHeight: 1.25 }}>{article.nom}</h3>
            {!hasVar && Number(article.prix) > 0 && (
              <p style={{ fontSize: '1.15rem', fontWeight: 900, color: remise ? '#DC2626' : T.main, letterSpacing: '-0.4px', margin: 0, flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                {article.est_vitrine ? <span style={{ fontSize: '0.72rem', fontWeight: 700, color: T.muted, marginRight: 5 }}>dès</span> : null}
                {remise ? euros(remise.prix) : euros(Number(article.prix))}
                {remise && (
                  <span style={{ fontSize: '0.85rem', color: T.muted, fontWeight: 700, textDecoration: 'line-through' }}>{euros(remise.prixBarre)}</span>
                )}
              </p>
            )}
          </div>
          {article.description && (
            <p style={{ fontSize: '0.9rem', color: T.deep, lineHeight: 1.6, margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>{article.description}</p>
          )}

          {/* Rangée sociale : cœur (compteur) + partage, filet sous la rangée */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 14px', paddingBottom: 14, borderBottom: `1px solid ${T.pale}` }}>
            <button onClick={onToggleLike} aria-label="J'aime cet article"
              style={{ ...pillSocial, ...(social?.liked ? { borderColor: T.main, background: T.pale, color: T.main } : {}) }}>
              <Heart size={15} strokeWidth={2.4} fill={social?.liked ? T.main : 'none'} color={social?.liked ? T.main : T.deep}/>
              {social?.count > 0 ? social.count : 'J’aime'}
            </button>
            <button onClick={onPartager} aria-label="Partager cet article" style={pillSocial}>
              <Share2 size={15} strokeWidth={2.4}/>
              {partageEtat === 'copie' ? 'Lien copié !' : 'Partager'}
            </button>
          </div>

          {/* Achat gaté par le plan (onAjouter/onAjouterVariante null si lecture
              seule) ET par article (est_vitrine = prix indicatif, non commandable) */}
          {hasVar && onAjouterVariante && !article.est_vitrine ? (
            <VariantesSelector article={article} variantes={variantes}
              onAjouter={(a, v) => { onAjouterVariante(a, v); onClose() }}/>
          ) : (!hasVar && onAjouter && !article.est_vitrine) ? (
            <button onClick={() => { onAjouter(article); onClose() }}
              style={{ width: '100%', padding: '0.8rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: '0.9rem', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 14px ${T.main}44` }}>
              Ajouter à ma commande
            </button>
          ) : null}
        </div>
      </div>

      {/* Viewer photo plein écran (tap sur la mosaïque) : navigation par
          flèches ET par swipe gauche/droite entre toutes les photos */}
      {photoIdx !== null && photos[photoIdx] && (() => {
        const precedente = () => setPhotoIdx(i => (i - 1 + photos.length) % photos.length)
        const suivante   = () => setPhotoIdx(i => (i + 1) % photos.length)
        const btnNav = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 42, height: 42, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }
        return (
          <div onClick={e => { e.stopPropagation(); setPhotoIdx(null) }}
            onTouchStart={e => { touchXRef.current = e.touches[0]?.clientX ?? null }}
            onTouchEnd={e => {
              const debut = touchXRef.current
              touchXRef.current = null
              if (debut == null || photos.length < 2) return
              const delta = (e.changedTouches[0]?.clientX ?? debut) - debut
              if (delta > 45) precedente()
              else if (delta < -45) suivante()
            }}
            style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(10,3,24,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
            <img decoding="async" loading="lazy" src={photos[photoIdx].url} alt={article.nom} style={{ maxWidth: '100%', maxHeight: '92dvh', objectFit: 'contain', borderRadius: 10 }}/>
            <button onClick={e => { e.stopPropagation(); setPhotoIdx(null) }} aria-label="Fermer la photo"
              style={{ position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.16)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 800, zIndex: 2 }}>✕</button>
            {photos.length > 1 && (
              <>
                <button onClick={e => { e.stopPropagation(); precedente() }} aria-label="Photo précédente" style={{ ...btnNav, left: 10 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
                </button>
                <button onClick={e => { e.stopPropagation(); suivante() }} aria-label="Photo suivante" style={{ ...btnNav, right: 10 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                </button>
                <span style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', fontSize: 12.5, fontWeight: 800, color: '#fff', background: 'rgba(255,255,255,0.14)', padding: '4px 12px', borderRadius: 100 }}>
                  {photoIdx + 1}/{photos.length}
                </span>
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}

// ─── Composant principal ──────────────────────────────────────────────────────
// ─── LA BARRE DE CATÉGORIES, ET POURQUOI ELLE VIT SEULE ─────────────────────
//
// ⚠️ ELLE ÉTAIT LA CAUSE D'UN GEL D'ÉCRAN, ET C'EST CONTRE-INTUITIF. Son onglet
// actif se recalcule à chaque défilement, et cet état vivait dans le composant
// de PAGE. Chaque fois qu'on franchissait un titre de catégorie en défilant,
// c'est donc la fiche ENTIÈRE qui se redessinait, toutes ses cartes d'articles
// comprises, au beau milieu du geste.
//
// D'où les deux mots d'Alex qui semblaient sans rapport (18/08) : « surtout
// quand je vais plus vite », parce qu'on franchit alors plusieurs titres dans
// un seul geste ; et « c'est une fiche plus ancienne », parce qu'elle porte
// bien plus d'articles, donc bien plus de cartes à redessiner à chaque fois.
//
// ⚠️ SORTIR L'ÉTAT PLUTÔT QUE MÉMOÏSER LES CARTES. On aurait pu envelopper
// `ArticleRow` dans un `memo`, mais il aurait fallu stabiliser huit props dont
// des fonctions et des objets recalculés à chaque rendu : beaucoup de surface,
// et une seule oubliée aurait rendu le remède muet. Ici, la page ne se
// redessine tout simplement PLUS pendant qu'on défile.
//
// Elle reçoit les repères du parent : le conteneur qui défile, l'en-tête dont
// la hauteur sert d'origine, et le carnet d'ancres des catégories.
function BarreCategories({ categories, scrollRef, headerRef, catRefs, onChoisir }) {
  const [active, setActive] = useState(null)
  const [ombre, setOmbre] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const auDefilement = () => {
      if (!headerRef.current) return
      const scrollTop = el.scrollTop
      const hauteurEntete = headerRef.current.offsetHeight
      const ancres = Object.entries(catRefs.current)
        .map(([cat, noeud]) => ({ cat, offsetTop: noeud ? noeud.offsetTop : null }))
      setOmbre(barreDetachee({ scrollTop, hauteurEntete }))
      setActive(categorieAtteinte({ scrollTop, hauteurEntete, ancres }))
    }
    auDefilement()
    el.addEventListener('scroll', auDefilement, { passive: true })
    return () => el.removeEventListener('scroll', auDefilement)
  }, [scrollRef, headerRef, catRefs])

  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, boxShadow: ombre ? '0 2px 12px rgba(0,0,0,0.08)' : 'none' }}>
      <div className="cat-bar">
        {categories.map(cat => (
          <button key={cat} className={`cat-pill ${active === cat ? 'active' : ''}`} onClick={() => onChoisir(cat)}>
            {cat === '__autres__' ? 'Autres' : cat}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function CommanderSlug() {
  const { slug } = useParams()
  const router = useRouter()

  const [etape, setEtape] = useState(2)
  const [showSignalement, setShowSignalement] = useState(false)
  const [signalementSent, setSignalementSent] = useState(false)
  const [commercant, setCommercant] = useState(null)
  const [articles, setArticles] = useState([])
  const [creneaux, setCreneaux] = useState([])
  // Charge des créneaux, indexée par JOUR puis par créneau. Elle ne vit pas
  // dans les créneaux eux-mêmes : un créneau est une grille hebdomadaire,
  // « mardi 11h15 » revient chaque semaine avec une charge différente.
  // Seule celle du RETRAIT vit en état : le calendrier de retrait est
  // reconstruit quand les créneaux ou les fermetures changent. Celui de la
  // livraison n'est construit qu'une fois, à l'hydratation, sa charge lui est
  // donc passée directement.
  const [chargeCreneaux, setChargeCreneaux] = useState({})
  // Créneaux fermés à la volée par le commerçant, par jour. Voyagent à part des
  // créneaux : ceux-ci sont une grille hebdomadaire, un blocage vaut pour UN jour.
  const [blocagesCreneaux, setBlocagesCreneaux] = useState([])
  const [avisCommerce, setAvisCommerce] = useState([])
  const [notesInfo, setNotesInfo] = useState({ moyenne: 0, count: 0 })
  // Les avis restent REPLIÉS par défaut : seize avis dépliés poussaient le
  // panier et les créneaux hors de l'écran, et un commerce qui a bien travaillé
  // se retrouvait puni par son propre succès.
  const [avisDeplies, setAvisDeplies] = useState(false)
  const [panier, setPanier] = useState({})
  const [creneauChoisi, setCreneauChoisi] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingCommande, setLoadingCommande] = useState(false)
  const [erreurCommande, setErreurCommande] = useState(null)
  // 🔴 LE BOUTON RESTAIT SUR « REDIRECTION… » POUR TOUJOURS quand on annulait
  // chez Stripe et qu'on revenait : le navigateur restaure la page depuis son
  // cache de navigation, state React compris, et rien ne remonte. Le panier
  // était intact, les articles se modifiaient, mais plus moyen de payer.
  useResetAuRetourDePaiement(() => setLoadingCommande(false))
  const [ajustementStock, setAjustementStock] = useState(null)
  // Mode de paiement choisi (en_ligne | sur_place). null = défaut selon ce que
  // le commerçant propose : en ligne si Stripe actif, sinon sur place si accepté.
  const [modePaiement, setModePaiement] = useState(null)
  // Bon cadeau (module 3) : config du commerçant + code appliqué au panier.
  // La remise effective est recalculée à chaque rendu (le panier peut bouger),
  // le serveur revalide tout (solde, plafond, minimum Stripe 0,50 €).
  const [bonsCfg, setBonsCfg] = useState(null)
  // ─── LE NOM DU BON, UNE FOIS POUR TOUT L'ÉCRAN ───────────────────────────
  // Frère exact du tunnel de rendez-vous : même règle, même endroit, pour que
  // les deux écrans ne se remettent pas à diverger. C'est le motif qui revient
  // le plus souvent ici, une phrase écrite en deux exemplaires.
  const nomBon = libelleBon(commercant?.categorie)
  const nomBons = libelleBon(commercant?.categorie, { pluriel: true })
  const [bonInput, setBonInput] = useState('')
  // 🔴 UN TABLEAU DEPUIS LE 01/09. Alex : 180 € et trois bons de 50, 75 et
  // 20 € — l'écran n'en acceptait qu'UN et faisait disparaître les autres.
  // La répartition entre eux est décidée par `repartirBons`, la même fonction
  // pure que le serveur applique, pour que l'écran ne puisse pas annoncer un
  // montant que la commande ne retiendra pas.
  const [bonsAppliques, setBonsAppliques] = useState([])   // [{ id, code, solde }]
  // Récompense de fidélité du Yopper CONNECTÉ chez CE commerçant, et son choix
  // de l'utiliser ou non sur cette commande.
  const [recompenseFid, setRecompenseFid] = useState(null)      // { id, type, valeur, libelle }
  // Combien il en a en tout chez ce commerce. Une seule se dépense par
  // commande : ce nombre ne sert qu'à DIRE que les autres l'attendent.
  const [recompensesTotal, setRecompensesTotal] = useState(0)
  const [recompenseActive, setRecompenseActive] = useState(false)
  const [bonErreur, setBonErreur] = useState(null)
  const [bonLoading, setBonLoading] = useState(false)
  const [bonModalOuvert, setBonModalOuvert] = useState(false)
  const [bonRetour, setBonRetour] = useState(null)  // 'ok' | 'annule' après retour Stripe achat de bon
  // Le détail du bon qu'on vient d'acheter, lu par session Stripe. Null tant
  // que la lecture n'a pas répondu : la confirmation s'affiche quand même,
  // avec ce qu'on sait de sûr.
  const [bonConfirme, setBonConfirme] = useState(null)
  const [loadingCancel, setLoadingCancel] = useState(false)
  const [cancelResult, setCancelResult] = useState(null)
  const [client, setClient] = useState({ prenom: '', nom: '', email: '', telephone: '' })
  const [rgpdCommande, setRgpdCommande] = useState(false)
  // Marketing pre-coche par defaut : maximise le taux d'opt-in (l'utilisateur peut decocher s'il refuse)
  const [rgpdMarketing, setRgpdMarketing] = useState(true)
  const [clientId, setClientId] = useState(null)
  const [joursDispos, setJoursDispos] = useState([])
  const [jourSelectionne, setJourSelectionne] = useState(0)
  // ─── Livraison (mode retrait | livraison) ───
  const [modeCommande, setModeCommande] = useState('retrait')
  // ─── Boutique détail (Module 2 étape 5) : retrait boutique | expédition ───
  const [modeBoutique, setModeBoutique] = useState('retrait')
  // Le jour de retrait SOUHAITÉ par le client, en boutique de détail. Indice
  // dans la liste rendue par `joursRetraitBoutique`. Zéro = le premier proposé.
  const [jourBoutiqueChoisi, setJourBoutiqueChoisi] = useState(0)
  const [livraisonConfig, setLivraisonConfig] = useState(null)
  const [joursDisposLivraison, setJoursDisposLivraison] = useState([])
  // M5 food truck : emplacements actifs (ponctuels + tournée hebdo)
  const [foodtruckEmps, setFoodtruckEmps] = useState([])
  const [creneauLivraisonChoisi, setCreneauLivraisonChoisi] = useState(null)
  // ⚠️ `lat`/`lng` NE SONT REMPLIS QUE PAR UN CHOIX DANS LES SUGGESTIONS, et
  // toute retouche à la main les REMET À NULL. Une adresse éditée après coup ne
  // correspond plus à ses coordonnées : garder les anciennes enverrait le
  // livreur à l'adresse d'avant, sans que rien ne le dise. Mieux vaut aucune
  // coordonnée qu'une fausse.
  //
  // ⚠️ `note` EST UN MESSAGE AU LIVREUR, PAS UN BOUT D'ADRESSE. Le complément
  // (« Boîte 3 ») voyage avec l'adresse ; la note (« portail bleu, sonner deux
  // fois ») ne doit JAMAIS partir au géocodeur. C'est précisément ce mélange
  // qui empêchait Nominatim de trouver quoi que ce soit.
  const [adresseLivraison, setAdresseLivraison] = useState({ rue: '', code_postal: '', ville: '', complement: '', note: '', lat: null, lng: null })

  // Toute saisie manuelle d'un champ d'adresse invalide les coordonnées.
  function majAdresse(champs) {
    setAdresseLivraison(p => ({ ...p, ...champs, lat: null, lng: null }))
  }

  // Choix d'une suggestion : c'est le seul chemin qui rapporte des coordonnées.
  function choisirAdresse(a) {
    setAdresseLivraison(p => ({
      ...p,
      rue: a.rue || a.adresse || p.rue,
      code_postal: a.code_postal || p.code_postal,
      ville: a.ville || p.ville,
      lat: Number.isFinite(a.latitude) ? a.latitude : null,
      lng: Number.isFinite(a.longitude) ? a.longitude : null,
    }))
  }
  // Persistance localStorage : préférence de mode + adresse mémorisées entre commandes.
  const modePrefRef = useRef(null)      // 'retrait' | 'livraison' | null (préférence sauvegardée)
  const modeAppliqueRef = useRef(false) // pour n'appliquer la préférence livraison qu'une fois
  // Confirmation de changement de jour quand le panier n'est pas vide
  const [confirmationJour, setConfirmationJour] = useState(null) // { nouveauIdx }
  const [optionsParArticle, setOptionsParArticle] = useState({})
  const [variantesParArticle, setVariantesParArticle] = useState({})
  const [stocksJour, setStocksJour] = useState({})
  // FIX STOCK SYNC : quantités déjà commandées par d'autres clients pour le jour sélectionné
  const [commandesParArticleJour, setCommandesParArticleJour] = useState({})
  const [photoCouverture, setPhotoCouverture] = useState(null)
  const [galerie, setGalerie] = useState([])
  // Toutes les photos de la fiche, dans l'ordre d'affichage. Depuis le 05/08 le
  // haut de fiche est une bannière au nom du commerce : l'ancienne photo de
  // couverture serait purement et simplement perdue si elle ne rouvrait pas la
  // série ici. Deux sources, comme partout (table des photos, puis colonne de
  // repli), sans quoi un commerçant qui n'a que l'une des deux se retrouve
  // avec une fiche sans aucune image.
  const photosFiche = [
    photoCouverture?.url
      ? { id: 'couverture', url: photoCouverture.url, legende: photoCouverture.legende || null }
      : (commercant?.photo_couverture_url
          ? { id: 'couverture-repli', url: commercant.photo_couverture_url, legende: null }
          : null),
    ...(galerie || []),
  ].filter(Boolean)
  const [actualites, setActualites] = useState([])
  // Où en est ce Yopper avec son compte ? L'écran de confirmation a trois
  // choses différentes à dire, et il n'en distinguait que deux.
  //
  //   • connecté AVEC mot de passe   → rien, il sait revenir ;
  //   • connecté SANS mot de passe   → « crée-en un », il se reconnectera vite ;
  //   • INVITÉ, aucune session       → 🔴 CE CAS N'ÉTAIT NULLE PART.
  //
  // Le premier a été traité : proposer de créer un mot de passe à quelqu'un qui
  // en a déjà un lui fait douter que son compte existe. Mais l'invité, lui,
  // tombait dans le même seau que le connecté sans mot de passe, alors que
  // c'est à lui qu'il faut le plus expliquer : il ne sait pas que sa commande
  // est déjà rattachée à son adresse, ni comment y revenir.
  //
  // ⚠️ Les deux drapeaux partent à VRAI : tant que la lecture n'a pas répondu,
  // on ne montre rien plutôt qu'un encadré qui apparaît puis disparaît.
  const [estConnecte, setEstConnecte] = useState(true)
  const [aMotDePasse, setAMotDePasse] = useState(true)
  useEffect(() => {
    // ⚠️ Rappel volontairement NON `async` : la bibliothèque tient son verrou
    // pendant l'appel, et l'attendre bloquait l'ouverture de l'application.
    const check = (user) => {
      setEstConnecte(!!user)
      setAMotDePasse(!!user?.user_metadata?.has_password)
    }
    supabase.auth.getUser().then(({ data }) => check(data?.user)).catch(() => {})
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => check(session?.user))
    return () => { try { sub?.subscription?.unsubscribe() } catch (e) {} }
  }, [])

  const [dealActif, setDealActif] = useState(null)
  // Tous les deals dont la fenêtre couvre aujourd'hui. Une seule liste, lue via
  // lib/deals.js : les lots et duos deviennent des cartes séparées, les remises
  // modifient le prix de l'article, y compris quand elles visent sa catégorie.
  const [dealsActifs, setDealsActifs] = useState([])
  // Modale detail deal (titre + description + dates + prix)
  const [dealDetailOuvert, setDealDetailOuvert] = useState(null)
  // Fiche détail d'un article (boutique) : photos galerie + description complète
  const [articleDetail, setArticleDetail] = useState(null)
  // B.6 fidélité : MA carte chez ce commerçant (null si pas connecté / pas de carte)
  const [maCarteFid, setMaCarteFid] = useState(null)
  // Nombre de cartes de CE Yopper chez CE commerçant. Deux numéros de GSM,
  // deux cartes : le dire plutôt que de laisser compter des passages qui ne
  // s'additionnent pas.
  const [cartesCeCommerce, setCartesCeCommerce] = useState(0)
  // Distingue « pas de carte » de « pas connecté » : sans ça, un Yopper qui a
  // des passages voit le teaser du programme et croit que rien n'est compté.
  const [fidConnecte, setFidConnecte] = useState(true)
  // ⚠️ MES BONS CADEAUX CHEZ CE COMMERÇANT (28/08). Ils n'existaient que dans
  // l'email du jour de l'achat : on pouvait ouvrir dix fois cette fiche sans
  // qu'aucun écran ne rappelle qu'on avait de l'argent à y dépenser.
  const [mesBonsIci, setMesBonsIci] = useState([])
  // Fiche « façon post » (30/07) : cœurs + partage. Les cœurs sont anonymes
  // par appareil (device_id localStorage), tout passe par /api/articles/like.
  const [articleSocial, setArticleSocial] = useState(null)  // { count, liked } de l'article ouvert
  const [partageEtat, setPartageEtat] = useState(null)      // 'copie' pendant 2s après copie du lien
  // Modale detail actu enrichie (photo + contenu long + date)
  const [actuDetailOuverte, setActuDetailOuverte] = useState(null)
  // Deduplication tracking stats deals : chaque event compte 1x par session client.
  const dealsVuesRef = useRef(new Set())
  const dealsCtaCliquesRef = useRef(new Set())

  // Fire-and-forget vers /api/deals/track (V1 : pas de retry ni de gestion erreur
  // cote UX, le tracking est best-effort et non bloquant pour le Yopper).
  async function trackDeal(dealId, event) {
    if (!dealId) return
    const seen = event === 'view' ? dealsVuesRef.current : dealsCtaCliquesRef.current
    if (seen.has(dealId)) return
    seen.add(dealId)
    try {
      await fetch('/api/deals/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: dealId, event }),
      })
    } catch (e) {
      console.warn('[trackDeal] envoi echoue', e?.message)
      seen.delete(dealId)  // retry autorise la prochaine fois
    }
  }

  useEffect(() => {
    if (dealDetailOuvert?.id) trackDeal(dealDetailOuvert.id, 'view')
  }, [dealDetailOuvert?.id])

  // Ma carte de fidélité chez ce commerçant (si son programme est actif).
  // fetchYopper, pas fetch : la route exige une identité PROUVÉE depuis le
  // 03/08, et un fetch nu n'emporte pas le jeton. C'est ce qui manquait.
  useEffect(() => {
    const id = commercant?.id
    if (!id || !commercant?.fidelite_actif) { setMaCarteFid(null); setFidConnecte(true); return }
    let vivant = true
    fetchYopper('/api/fidelite/mes-cartes', {
      method: 'POST',
      body: JSON.stringify({ action: 'une', commercant_id: id }),
    })
      .then(r => r.json())
      .then(j => {
        if (!vivant || !j?.ok) return
        setMaCarteFid(j.carte || null)
        setCartesCeCommerce(j.cartes_ce_commerce || 0)
        setFidConnecte(j.connecte !== false)
      })
      .catch(() => {})
    return () => { vivant = false }
  }, [commercant?.id, commercant?.fidelite_actif])

  // Mes bons cadeaux chez CE commerçant.
  //
  // ⚠️ `fetchYopper`, pas `fetch` : la route exige une identité PROUVÉE, et un
  // fetch nu n'emporte pas le jeton. C'est exactement l'oubli qui avait rendu
  // la carte de fidélité muette pendant deux jours.
  //
  // ⚠️ ET AUCUN GARDE SUR `bons_cadeaux_actif` : le commerçant peut avoir
  // FERMÉ la vente de nouveaux bons après en avoir vendu. Ceux-là restent
  // dépensables, et leur porteur doit continuer à les voir. On interroge donc
  // toujours, la réponse vide ne coûte rien.
  useEffect(() => {
    const id = commercant?.id
    if (!id) { setMesBonsIci([]); return }
    let vivant = true
    fetchYopper('/api/yopper/mes-bons', {
      method: 'POST',
      body: JSON.stringify({ action: 'une', commercant_id: id }),
    })
      .then(r => r.json())
      .then(j => { if (vivant && j?.ok) setMesBonsIci(j.bons || []) })
      .catch(() => {})
    return () => { vivant = false }
  }, [commercant?.id])

  // Cœurs : charge le compteur + mon état à l'ouverture d'une fiche article
  useEffect(() => {
    const id = articleDetail?.id
    setArticleSocial(null)
    setPartageEtat(null)
    if (!id) return
    let vivant = true
    fetch(`/api/articles/like?article_id=${id}&device_id=${getDeviceId()}`)
      .then(r => r.json())
      .then(j => { if (vivant && j?.ok) setArticleSocial({ count: j.count, liked: j.liked }) })
      .catch(() => {})
    return () => { vivant = false }
  }, [articleDetail?.id])

  async function toggleLikeArticle() {
    const id = articleDetail?.id
    if (!id) return
    // Optimiste : on inverse tout de suite, le serveur confirme (ou on revert)
    const avant = articleSocial
    setArticleSocial(s => s ? { count: Math.max(0, s.count + (s.liked ? -1 : 1)), liked: !s.liked } : { count: 1, liked: true })
    try {
      const res = await fetch('/api/articles/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: id, device_id: getDeviceId() }),
      })
      const j = await res.json()
      if (j?.ok) setArticleSocial({ count: j.count, liked: j.liked })
      else setArticleSocial(avant)
    } catch (e) {
      setArticleSocial(avant)
    }
  }

  async function partagerArticle() {
    const a = articleDetail
    if (!a || typeof window === 'undefined') return
    const url = `${window.location.origin}/commander/${commercant?.slug || slug}?article=${a.id}`
    const texte = `${a.nom} chez ${commercant?.nom || 'un commerçant Yoppaa'} 🟣`
    if (navigator.share) {
      try { await navigator.share({ title: a.nom, text: texte, url }) } catch (e) { /* partage annulé */ }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setPartageEtat('copie')
      setTimeout(() => setPartageEtat(null), 2000)
    } catch (e) { /* clipboard indisponible */ }
  }
  const [fermetures, setFermetures] = useState([])
  const [derniereCommande, setDerniereCommande] = useState(null)
  const [isDesktop, setIsDesktop] = useState(false)

  // ─── Monde BOUTIQUE (retrait libre / expédition, sans créneau) : catégorie
  // détail ET, depuis le 31/07, les services (vitrine) qui vendent leurs
  // produits au salon. Même machine, mêmes colonnes boutique_* en base.
  //
  // ⚠️ CE BLOC EST REMONTÉ ICI, ET CE N'EST PAS COSMÉTIQUE. Il vivait six cents
  // lignes plus bas, alors que le chargement des stocks en a besoin. Le laisser
  // en place aurait obligé à citer `estDetail` dans une liste de dépendances
  // évaluée AVANT sa déclaration : zone morte temporelle, et page blanche au
  // rendu. Le défaut est invisible au lint comme au build (vécu le 09/08).
  const estDetail = commercant?.categorie === 'detail' || commercant?.categorie === 'vitrine'
  // Ce qu'on ose dire des avis : la moyenne seulement si elle repose sur assez
  // d'avis, le nombre TOUJOURS (une note sans son nombre ne veut rien dire).
  const resumeNotes = resumeAvis(notesInfo)
  const boutiqueModes = estDetail
    ? (commercant?.boutique_mode_vente === 'les_deux' ? ['retrait', 'expedition'] : [commercant?.boutique_mode_vente || 'retrait'])
    : []

  // ⚠️ LE JOUR DE RETRAIT SOUHAITÉ, MAINTENANT CHOISI PAR LE CLIENT.
  //
  // Il n'y avait ici qu'une VALEUR UNIQUE, calculée dans son coin, pendant que
  // l'écran affichait le sélecteur de jours de l'ALIMENTAIRE — construit sur les
  // créneaux, qu'une boutique n'a pas. Résultat constaté par Alex le 11/08 :
  // le sélecteur ne proposait que « Demain 12 août » alors que la boutique était
  // ouverte ce mardi-là jusqu'à 18h30, et la commande partait quand même datée
  // du 11. Deux vérités contradictoires dans le même écran, et un sélecteur qui
  // ne pilotait rien.
  //
  // Décision d'Alex : le client indique un jour SOUHAITÉ, le commerçant
  // confirme. Le jour même n'est proposé que s'il reste au commerçant le temps
  // de préparer, délai qu'il règle lui-même.
  const maintenantMinutes = (() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })()
  const joursBoutique = estDetail
    ? joursRetraitBoutique({
        horairesDetail: commercant?.horaires_detail,
        fermetures,
        depuis: jourLocalISO(new Date()),
        maintenant: maintenantMinutes,
        delaiHeures: commercant?.boutique_delai_heures,
        horizon: 7,
      })
    : []
  // Le jour retenu : celui que le client a choisi, à défaut le premier proposé.
  const jourRetraitBoutique = estDetail
    ? (joursBoutique[jourBoutiqueChoisi]?.jour || joursBoutique[0]?.jour || null)
    : null
  const retraitAujourdhui = jourRetraitBoutique === jourLocalISO(new Date())

  // (l'onglet actif et l'ombre de la barre vivent dans `BarreCategories`)

  // Favoris + partage : 2 boutons en overlay sur le hero photo (pattern TGTG)
  const [estFavori, setEstFavori] = useState(false)
  const [favoriLoading, setFavoriLoading] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const catRefs = useRef({})
  const headerRef = useRef(null)
  const scrollRef = useRef(null)
  const recapPanierRef = useRef(null)   // cible du bouton panier flottant (scroll vers le récap)

  // ⚠️ LE BOUTON FLOTTANT S'EFFACE QUAND SA CIBLE EST À L'ÉCRAN (Alex, 28/08).
  // La règle et ses deux seuils vivent dans `lib/bouton-flottant.js` : ici, on
  // ne fait qu'observer. Voir ce fichier pour le pourquoi de l'hystérésis.
  // ⚠️ NOMMÉ DANS LE SENS DE CE QU'IL COMMANDE, jamais l'inverse : un
  // `panierEnVue` qu'il faut renier deux fois à la lecture finit par être lu à
  // l'envers. Il vaut `true` au départ : tant qu'on n'a rien observé, on montre.
  const [montrerFlottant, setMontrerFlottant] = useState(true)

  // Lecture de l'état favori au mount (et quand clientId / commercant changent)
  useEffect(() => {
    if (!clientId || !commercant?.id) return
    let annule = false
    ;(async () => {
      // Route serveur : la table favoris n'est plus lisible depuis le
      // navigateur, elle l'était par tout le monde.
      try {
        const r = await fetchYopper('/api/yopper/favoris')
        const j = await r.json()
        if (!annule) setEstFavori((j?.favoris || []).includes(commercant.id))
      } catch { if (!annule) setEstFavori(false) }
    })()
    return () => { annule = true }
  }, [clientId, commercant?.id])

  // Toggle favori (création/suppression dans la table favoris)
  async function toggleFavori() {
    if (!commercant?.id || favoriLoading) return
    if (!client.email || !clientId) {
      // Pas connecté → redirige vers auth avec retour sur cette fiche
      router.push(`/commander/auth?redirect=/commander/${slug}`)
      return
    }
    setFavoriLoading(true)
    try {
      const majFavori = (action) => fetchYopper('/api/yopper/favoris', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commercant_id: commercant.id, action }),
      })
      if (estFavori) {
        await majFavori('retirer')
        setEstFavori(false)
        setToastMessage('Retiré de tes favoris')
      } else {
        await majFavori('ajouter')
        setEstFavori(true)
        setToastMessage(`${commercant.nom} ajouté à tes favoris 🟣`)
      }
      setTimeout(() => setToastMessage(null), 2500)
    } finally {
      setFavoriLoading(false)
    }
  }

  // Partage natif (Web Share API) avec fallback copy URL
  async function partagerFiche() {
    const url = typeof window !== 'undefined' ? window.location.href : `https://www.yoppaa.app/commander/${slug}`
    const text = commercant ? `Découvre ${commercant.nom} sur Yoppaa 🟣` : 'Découvre ce commerce sur Yoppaa'
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: commercant?.nom || 'Yoppaa', text, url })
      } catch (e) {
        // L'utilisateur a annulé : on ne fait rien (AbortError est normal)
        if (e.name !== 'AbortError') console.warn('[share] échec', e)
      }
      return
    }
    // Fallback : copier l'URL dans le presse-papier
    try {
      await navigator.clipboard.writeText(url)
      setToastMessage('Lien copié dans le presse-papier 🟣')
    } catch (e) {
      setToastMessage('Impossible de partager - copie l\'URL manuellement')
    }
    setTimeout(() => setToastMessage(null), 2500)
  }

  useEffect(() => {
    // Vrai "desktop" = mouse-only (hover + pointer fine). Exclut iPad/Android tablette qui peuvent
    // installer la PWA pour le retrait. Un iPad detecte 1024px de large mais doit etre traite comme tablette.
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const check = () => setIsDesktop(mq.matches)
    check()
    if (mq.addEventListener) {
      mq.addEventListener('change', check)
      return () => mq.removeEventListener('change', check)
    }
    mq.addListener(check)
    return () => mq.removeListener(check)
  }, [])

  // Retour Stripe Checkout : success_url=?paiement=ok&commande_id=X&session_id=Y
  //                         cancel_url=?paiement=annule&commande_id=X
  // On nettoie l'URL via replaceState pour éviter de rejouer au refresh.
  useEffect(() => {
    if (typeof window === 'undefined' || !slug) return
    const params = new URLSearchParams(window.location.search)
    const paiement = params.get('paiement')
    const commandeId = params.get('commande_id')
    if (!paiement || !commandeId) return

    window.history.replaceState({}, '', window.location.pathname)

    if (paiement === 'annule') {
      // 🔴 « Tu peux relancer ta commande » ÉTAIT UNE PHRASE VIDE : le panier
      // avait disparu, puisque Stripe ramène par une VRAIE navigation vers
      // cancel_url et que la page est rechargée à neuf. On remet ce qu'on
      // avait mis de côté juste avant de partir, récompense comprise.
      let repris = false
      try {
        const brut = sessionStorage.getItem(cleReprisePanier(slug))
        if (brut) {
          const snap = JSON.parse(brut)
          if (snap?.panier && Object.keys(snap.panier).length > 0) {
            setPanier(snap.panier)
            repris = true
          }
          if (snap?.creneauChoisi) setCreneauChoisi(snap.creneauChoisi)
          if (snap?.modePaiement) setModePaiement(snap.modePaiement)
          if (Array.isArray(snap?.bonsAppliques)) setBonsAppliques(snap.bonsAppliques)
          // ⚠️ La récompense se recoche toute seule, sinon le Yopper qui
          // revient ne penserait pas à la reprendre et paierait le prix plein.
          if (snap?.recompenseActive) setRecompenseActive(true)
        }
      } catch { /* snapshot illisible : on repart d'un panier vide, sans crasher */ }
      sessionStorage.removeItem(cleReprisePanier(slug))

      setErreurCommande(repris
        ? 'Paiement annulé. Ta commande est intacte, tu peux la relancer quand tu veux 🟣'
        : 'Paiement annulé. Tu peux refaire ta commande quand tu veux 🟣')
      allerEtape(3)
      return
    }

    if (paiement === 'ok') {
      // Statut peut encore être 'paiement_en_attente' si webhook pas encore arrivé :
      // on affiche quand même l'écran de confirmation (Stripe a confirmé le paiement).
      ;(async () => {
        // 🔴 CET ÉCRAN N'EXISTAIT PAS POUR UN INVITÉ, ET C'EST L'ACHETEUR LE
        // PLUS FRAGILE QUI NE VOYAIT RIEN.
        //
        // `fetchYopper` REFUSE de partir sans session Supabase : il fabrique un
        // 401 sans même appeler le serveur (voir lib/fetch-yopper.js). Celui qui
        // commande sans compte n'a pas de session, la relecture rendait donc
        // `null`, et tout ce qui suit vivait dans un `if (data)`. Il revenait de
        // Stripe sur la fiche du commerce, panier vidé par le rechargement,
        // SANS numéro, sans « c'est bon », sans bouton d'annulation. Il venait
        // de payer et pas un écran ne le lui disait.
        //
        // ⚠️ LA ROUTE, ELLE, N'A JAMAIS RIEN DEMANDÉ. `get-one` est placée
        // AVANT la garde d'identité : sa protection est l'UUID que Stripe vient
        // de rendre au Yopper lui-même. C'est l'APPELANT qui fermait une porte
        // que le serveur laisse ouverte, et ce changement n'expose donc rien de
        // nouveau. `fetchAvecPreuveSiConnecte` porte le jeton quand il existe,
        // et part quand même sinon : exactement ce que fait déjà la commande.
        //
        // Confirmation post-paiement : total + client_nom = PII → API serveur.
        const data = await fetchAvecPreuveSiConnecte('/api/yopper/commandes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get-one', commande_id: commandeId }),
        }).then(r => r.json()).then(j => j?.commande).catch(() => null)
        // ⚠️ ET LE COMMENTAIRE JUSTE AU-DESSUS PROMETTAIT DÉJÀ « on affiche
        // quand même », alors que le code faisait le contraire. Une relecture
        // qui échoue, pour n'importe quelle raison, effaçait la preuve d'un
        // paiement que Stripe a bel et bien accepté. On confirme TOUJOURS : ce
        // que la relecture rapporte ne fait qu'enrichir l'écran.
        //
        // ⚠️ `numeroSequentiel: data.numero_commande` FIGEAIT LE NUMÉRO NU.
        // L'écran annonçait « #4 » quand l'email disait « CC4 ». La référence
        // est désormais formée par la route, avec le préfixe qu'elle rapatrie.
        setDerniereCommande(data
          ? { ...data, numeroSequentiel: data.numeroAffiche || data.numero_commande }
          // Sans relecture, l'identifiant suffit à garder « Annuler ma
          // commande » vivant. Le numéro, lui, ne s'invente pas : la pastille
          // est déjà conditionnelle et reste simplement absente.
          : { id: commandeId })
        allerEtape(4)
        // Moment de plus forte intention : le Yopper vient de commander, on l'invite
        // à activer les push pour suivre le statut (prêt à retirer, en livraison...).
        // Sans ça, un Yopper qui ne met jamais de favori n'était jamais sollicité.
        promptPushOneSignal()
        try { localStorage.removeItem(`yoppaa_commerce_${slug}`) } catch(e) {}
        // ⚠️ ET LE PANIER MIS DE CÔTÉ, sans quoi il ressusciterait au
        // prochain passage : le Yopper verrait réapparaître une commande
        // qu'il a déjà payée.
        try { sessionStorage.removeItem(cleReprisePanier(slug)) } catch(e) {}
      })()
    }
  }, [slug])

  useEffect(() => {
    if (!slug) return
    const email = localStorage.getItem('yoppaa_email')
    const prenom = localStorage.getItem('yoppaa_prenom')
    const nom = localStorage.getItem('yoppaa_nom')
    const telephone = localStorage.getItem('yoppaa_telephone')
    const id = localStorage.getItem('yoppaa_client_id')
    if (email && id) {
      // Pre-remplir TOUS les champs (telephone inclus depuis la migration SQL clients)
      setClient(p => ({ ...p, email, prenom: prenom || '', nom: nom || '', telephone: telephone || '' }))
      setClientId(id)
      // Si telephone manquant en local (compte cree avant migration), tenter de le recharger depuis la DB
      if (!telephone) {
        supabase.from('clients').select('prenom, nom, telephone').eq('id', id).single().then(({ data }) => {
          if (data) {
            if (data.prenom) { localStorage.setItem('yoppaa_prenom', data.prenom); setClient(p => ({ ...p, prenom: data.prenom })) }
            if (data.nom) { localStorage.setItem('yoppaa_nom', data.nom); setClient(p => ({ ...p, nom: data.nom })) }
            if (data.telephone) { localStorage.setItem('yoppaa_telephone', data.telephone); setClient(p => ({ ...p, telephone: data.telephone })) }
          }
        })
      }
    }

    const cacheKey = `yoppaa_commerce_${slug}`
    const cached = localStorage.getItem(cacheKey)
    // TTL cache reduit a 30s : les alertes/actus/deals peuvent etre publies
    // en temps reel, un cache 5 min bloquait la fraicheur. Compromis :
    // navigation immediate depuis /commander (cache < 30s) mais refresh regulier
    // sur les fiches revisitees.
    if (cached) {
      try {
        const { data, ts } = JSON.parse(cached)
        if (Date.now() - ts < 30 * 1000) {
          hydrate(data)
          return
        }
      } catch(e) {}
    }
    chargerCommercant(slug)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [slug])

  function hydrate(data) {
    // Vitrine (services) : la fiche principale reste la fiche RDV. Cette page
    // sert de BOUTIQUE (vente de produits au salon, décision Alex 31/07) : on ne
    // redirige vers la fiche RDV que si le commerçant n'a aucun produit actif.
    if (data.commercant?.categorie === 'vitrine' && data.commercant?.slug
        && (data.articles || []).length === 0) {
      router.replace(`/commander/rdv/${data.commercant.slug}`)
      return
    }
    setCommercant(data.commercant)
    setArticles(data.articles)
    setCreneaux(data.creneaux)
    setAvisCommerce(data.avis)
    setNotesInfo(data.notesInfo)
    setOptionsParArticle(data.options)
    setVariantesParArticle(data.variantes || {})
    setStocksJour(data.stocksJour)
    setPhotoCouverture(data.photoCouverture)
    setGalerie(data.galerie || [])
    setActualites(data.actualites || [])
    setDealActif(data.dealActif)
    setDealsActifs(data.dealsActifs || [])
    setFermetures(data.fermetures)
    // Un cache écrit avant le 10/08 ne porte pas la charge : on retombe sur un
    // objet vide, les créneaux s'affichent libres, et le prochain chargement
    // rétablit les compteurs. Le serveur, lui, refuse de toute façon un
    // créneau complet.
    setChargeCreneaux(data.chargeCreneaux || {})
    // ⚠️ LE MAILLON QUI MANQUAIT, ET IL RENDAIT TOUT LE RESTE INERTE. Les
    // blocages étaient lus en base, rangés dans le cache, et l'état ne les
    // recevait JAMAIS : `blocagesCreneaux` restait le tableau vide du premier
    // rendu, le calendrier ne fermait donc rien du tout. Aucune erreur, aucun
    // avertissement — le défaut le plus fréquent de ce projet, dans sa version
    // React (reference_colonne_absente_du_select).
    setBlocagesCreneaux(data.blocagesCreneaux || [])
    // ⚠️ ET ON LES PASSE ICI EN CLAIR, sans compter sur l'état. `setState` ne
    // change rien avant le rendu suivant : la valeur par défaut du paramètre
    // lirait l'ancienne, c'est-à-dire vide.
    buildJoursDispos(data.commercant, data.creneaux, data.fermetures, data.chargeCreneaux || {}, data.blocagesCreneaux || [])
    setLivraisonConfig(data.livraisonConfig || null)
    setJoursDisposLivraison(construireJoursDispos(data.commercant, data.livraisonCreneaux || [], data.fermetures, data.chargeLivraison || {}))
    setFoodtruckEmps(data.foodtruckEmps || [])
    setLoading(false)
    // Deep link partage : ?article=<id> ouvre directement la fiche de l'article
    // (liens « regarde cet article » partagés depuis la fiche façon post)
    if (typeof window !== 'undefined') {
      const artId = new URLSearchParams(window.location.search).get('article')
      if (artId) {
        const cible = (data.articles || []).find(a => String(a.id) === artId)
        if (cible) setArticleDetail(cible)
      }
    }
  }

  async function chargerCommercant(slug) {
    setLoading(true)

    const [{ data: c }] = await Promise.all([
      supabase.from('commercants_public').select('*').eq('slug', slug).maybeSingle(),  // vue publique — RLS commercants
    ])
    if (!c) { router.push('/commander'); return }
    // Bloque l'accès aux fiches non publiées (brouillon, en_attente, refusée).
    // L'admin a une route d'aperçu dédiée - à coder plus tard.
    if (c.statut_publication !== 'publie') {
      setLoading(false)
      setCommercant({ ...c, _nonPublie: true })
      return
    }

    const [
      { data: arts },
      { data: cren },
      { data: avis },
      { data: avisNotes },
      { data: commandesActives },
      { data: photosData },
      { data: dealsData },
      { data: fermeturesData },
      { data: actualitesData },
      { data: livConfig },
      { data: livCren },
      { data: livCmd },
      { data: ftEmps },
      { data: blocagesCren },
    ] = await Promise.all([
      supabase.from('articles').select('*').eq('commercant_id', c.id).eq('actif', true).order('categorie').order('nom'),
      supabase.from('creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      // Vue publique : la note, le commentaire et la réponse du commerçant,
      // sans l'identifiant du client ni celui de sa commande.
      supabase.from('avis_public').select('*').eq('commercant_id', c.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('avis_public').select('note').eq('commercant_id', c.id),
      // Charge de préparation agrégée par créneau ET PAR JOUR : les lignes de
      // commande ne sont plus lisibles publiquement, une fonction serveur fait
      // la somme. Le jour est indispensable — un créneau « mardi 11h15 »
      // revient chaque semaine, et sans la date on ne sait pas de quel mardi
      // on parle.
      supabase.rpc('charge_creneaux_par_jour', { p_commercant_id: c.id }),
      supabase.from('commercant_photos').select('*').eq('commercant_id', c.id).order('ordre'),
      supabase.from('yoppaa_deals').select('*').eq('commercant_id', c.id).eq('actif', true),
      supabase.from('fermetures_exceptionnelles').select('*').eq('commercant_id', c.id).gte('date_fin', new Date().toISOString()),
      supabase.from('actualites').select('*').eq('commercant_id', c.id).eq('actif', true).order('created_at', { ascending: false }),
      supabase.from('livraison_config').select('*').eq('commercant_id', c.id).maybeSingle(),
      supabase.from('livraison_creneaux').select('*').eq('commercant_id', c.id).eq('actif', true).order('heure_debut'),
      // `date_commande` est indispensable ici aussi : sans elle, une tournée de
      // jeudi déjà pleine pesait sur le créneau de mardi, et inversement.
      supabase.from('commandes_stats').select('creneau_livraison_id, date_commande').eq('commercant_id', c.id).eq('mode_retrait', 'livraison').not('statut', 'in', '(recupere,non_retire,annulee_client_refund,annulee_paiement_ko)'),
      // M5 food truck : emplacements (ponctuels + tournée hebdo) pour remplacer
      // l'adresse affichée par l'emplacement du jour
      supabase.from('commercant_lieux').select('*').eq('commercant_id', c.id).eq('actif', true),
      // ⚠️ LES CRÉNEAUX QUE LE COMMERÇANT A FERMÉS À LA VOLÉE, par jour. On ne
      // lit QUE d'aujourd'hui vers l'avant : un blocage passé ne concerne plus
      // personne, et le calendrier ne propose jamais la veille.
      supabase.from('creneaux_blocages').select('creneau_id, date_blocage')
        .eq('commercant_id', c.id).gte('date_blocage', jourBruxelles()),
    ])

    const notesInfo = avisNotes?.length > 0
      ? { moyenne: avisNotes.reduce((a, x) => a + x.note, 0) / avisNotes.length, count: avisNotes.length }
      : { moyenne: 0, count: 0 }

    // La fonction serveur renvoie les totaux par créneau ET PAR JOUR : nombre
    // de commandes et temps de préparation cumulé. Aucune ligne de commande ne
    // transite plus par le navigateur.
    //
    // ⚠️ LA DATE CHANGE TOUT. Avant, la charge était un total toutes dates
    // confondues, et l'affichage se trompait dans LES DEUX SENS : pour
    // aujourd'hui il appliquait ce total, donc une commande passée pour jeudi
    // remplissait le créneau de ce matin ; pour les jours suivants il forçait
    // le compteur à ZÉRO, donc un créneau déjà complet jeudi s'affichait libre
    // et le client ne l'apprenait qu'au paiement.
    const chargeParJour = {}
    ;(commandesActives || []).forEach(r => {
      const jour = String(r.jour || '').slice(0, 10)
      if (!jour || !r.creneau_id) return
      if (!chargeParJour[jour]) chargeParJour[jour] = {}
      chargeParJour[jour][r.creneau_id] = {
        count: Number(r.nb_commandes) || 0,
        temps: Number(r.temps_total) || 0,
      }
    })

    // Créneaux de LIVRAISON : même principe, en comptant les commandes de la
    // vue publique. Mode 'commandes' → temps_cumul non utilisé (0).
    const chargeLivraisonParJour = {}
    ;(livCmd || []).forEach(cmd => {
      const jour = String(cmd.date_commande || '').slice(0, 10)
      if (!jour || !cmd.creneau_livraison_id) return
      if (!chargeLivraisonParJour[jour]) chargeLivraisonParJour[jour] = {}
      const actuel = chargeLivraisonParJour[jour][cmd.creneau_livraison_id]?.count || 0
      chargeLivraisonParJour[jour][cmd.creneau_livraison_id] = { count: actuel + 1, temps: 0 }
    })

    // Les créneaux « nus » : la charge leur est appliquée jour par jour au
    // moment de construire le calendrier, plus ici.
    const creneauxAvecCount = (cren || []).map(cr => ({ ...cr, count: 0, temps_cumul: 0 }))
    const livraisonCreneauxAvecCount = (livCren || []).map(cr => ({ ...cr, count: 0, temps_cumul: 0 }))

    const artIds = (arts||[]).map(a => a.id)
    let opts = {}
    if (artIds.length > 0) {
      const { data: groupesData } = await supabase
        .from('article_options_groupes')
        .select('*, valeurs:article_options_valeurs(*)')
        .in('article_id', artIds)
        .order('created_at')
      ;(groupesData||[]).forEach(g => {
        if (!opts[g.article_id]) opts[g.article_id] = []
        opts[g.article_id].push(g)
      })
    }

    let stocksJourMap = {}
    if (artIds.length > 0) {
      const { data: stocksData } = await supabase
        .from('article_stock_jour')
        .select('*')
        .eq('commercant_id', c.id)
        .in('article_id', artIds)
      ;(stocksData||[]).forEach(s => {
        if (!stocksJourMap[s.article_id]) stocksJourMap[s.article_id] = {}
        stocksJourMap[s.article_id][s.jour_semaine] = { stock: s.stock, actif: s.actif }
      })
    }

    // Variantes (Module 2 boutique) : combinaisons actives par article
    let variantesMap = {}
    if (artIds.length > 0) {
      const { data: variantesData } = await supabase
        .from('article_variantes')
        .select('*')
        .in('article_id', artIds)
        .eq('actif', true)
        .order('ordre')
      ;(variantesData||[]).forEach(v => {
        if (!variantesMap[v.article_id]) variantesMap[v.article_id] = []
        variantesMap[v.article_id].push(v)
      })
    }

    const couverture = (photosData||[]).find(p => p.type === 'couverture') || null
    const galerieAutres = (photosData||[]).filter(p => p.type !== 'couverture' && p.url)
    // Deals dont la fenêtre couvre aujourd'hui (date ponctuelle ou intervalle).
    // La règle vit dans lib/deals.js, partagée avec le calcul serveur.
    // ⚠️ LE JOUR SE LIT EN HEURE BELGE, PAS EN UTC. `toISOString()` renvoie le
    // jour PRÉCÉDENT entre minuit et 2h du matin chez nous : une friterie ou une
    // pizzeria, ouvertes à ces heures-là, affichaient le deal de la veille et
    // masquaient celui du jour. Corrigé sur l'accueil le 10/08, la fiche avait
    // été oubliée. Attrapé par le test qui interdit ces clés de jour en UTC.
    const aujourdhuiDate = jourLocalISO(new Date())
    const dealsActifs = (dealsData || []).filter(d => dealActifCeJour(d, aujourdhuiDate))
    // Deal « vedette » affiché en bandeau : le premier deal générique, sinon le
    // premier deal tout court pour ne pas laisser le bandeau vide.
    const deal = dealsActifs.find(d => !d.article_id && !d.categorie_cible) || dealsActifs[0] || null

    // Filtrer les actus actives aujourd'hui (sur la fenêtre date_debut/date_fin)
    // Même piège, même correctif : les actus se filtrent sur le jour BELGE.
    const aujourdhui = jourLocalISO(new Date())
    const actusActives = (actualitesData || []).filter(a => {
      const dStart = a.date_debut ? a.date_debut.slice(0,10) : null
      const dEnd   = a.date_fin   ? a.date_fin.slice(0,10)   : null
      if (!dStart && !dEnd) return true
      if (dStart && !dEnd) return dStart <= aujourdhui
      if (!dStart && dEnd) return aujourdhui <= dEnd
      return dStart <= aujourdhui && aujourdhui <= dEnd
    })

    const cacheData = {
      commercant: c,
      articles: arts || [],
      creneaux: creneauxAvecCount,
      // ⚠️ LES BLOCAGES VOYAGENT AVEC LA CHARGE, ET POUR LA MÊME RAISON : un
      // créneau est une grille HEBDOMADAIRE, un blocage vaut pour UN JOUR. Les
      // coller sur la ligne de créneau fermerait tous les vendredis.
      blocagesCreneaux: blocagesCren || [],
      // La charge voyage à part des créneaux : un créneau est une grille
      // hebdomadaire, sa charge dépend du jour affiché.
      chargeCreneaux: chargeParJour,
      chargeLivraison: chargeLivraisonParJour,
      avis: avis || [],
      notesInfo,
      options: opts,
      variantes: variantesMap,
      stocksJour: stocksJourMap,
      photoCouverture: couverture,
      galerie: galerieAutres,
      dealActif: deal,
      dealsActifs,
      fermetures: fermeturesData || [],
      actualites: actusActives,
      livraisonConfig: livConfig || null,
      livraisonCreneaux: livraisonCreneauxAvecCount,
      foodtruckEmps: ftEmps || [],
    }

    try {
      localStorage.setItem(`yoppaa_commerce_${slug}`, JSON.stringify({ data: cacheData, ts: Date.now() }))
    } catch(e) {}

    hydrate(cacheData)
  }

  // ⚠️ L'HORIZON ET LE DÉLAI SONT DEUX QUESTIONS DIFFÉRENTES, et une seule
  // heure fixe répondait aux deux, mal. L'horizon dit JUSQU'OÙ on peut
  // réserver, le délai de chaque créneau dit JUSQU'À QUAND.
  //
  // Avant, le lendemain ne s'ouvrait qu'à `heure_ouverture_resa`, 21h par
  // défaut. Une boulangerie dont le dernier créneau tombe à 11h passait donc
  // DIX HEURES à afficher « Résa dès 21:00 » : le client qui pensait à son pain
  // en rentrant du travail se voyait demander de revenir plus tard, alors que
  // la commande pouvait parfaitement être prise. C'était la seule phrase de
  // l'application qui invitait le Yopper à partir.
  //
  // Et le verrou débordait : il ajoutait le jour `horizon`, donc un jour de
  // PLUS que ce que le commerçant avait choisi. Réglé sur trois jours, il en
  // acceptait quatre à partir de 21h, sans jamais l'avoir demandé.
  //
  // Le défaut passe de 1 à 2 jours : « aujourd'hui seulement » n'a de sens que
  // choisi exprès, jamais par défaut, sans quoi un commerce devient
  // injoignable dès son dernier créneau passé.
  const HORIZON_DEFAUT = 2
  // ⚠️ `blocages` PAR DÉFAUT VIDE, ET C'EST VOULU : les tournées de livraison
  // appellent cette même fonction et ne connaissent pas les blocages, qui ne
  // valent que pour les créneaux de retrait. Une valeur par défaut vide les
  // laisse passer sans rien filtrer.
  function construireJoursDispos(c, creneauxAvecCount, fermeturesData, chargeParJour = {}, blocagesCren = []) {
    const horizonBrut = Number(c.horizon_commande)
    const horizon = Number.isFinite(horizonBrut) && horizonBrut >= 1 ? horizonBrut : HORIZON_DEFAUT
    const now = maintenant()
    const joursDispos = []
    const today = new Date(); today.setHours(0,0,0,0)

    function estEnFermeture(date) {
      return (fermeturesData||[]).some(f => {
        const debut = new Date(f.date_debut); debut.setHours(0,0,0,0)
        const fin = new Date(f.date_fin); fin.setHours(23,59,59,999)
        return date >= debut && date <= fin
      })
    }

    // ⚠️ LA CHARGE SE LIT AU JOUR AFFICHÉ, plus « tout ou rien ».
    // Avant, `avecCount` valait true pour aujourd'hui et false pour les jours
    // suivants : le total toutes dates confondues remplissait donc les créneaux
    // du matin avec des commandes de jeudi, pendant que jeudi s'affichait
    // désespérément vide. Deux erreurs opposées, dans le même écran.
    function creneauxPourDate(date) {
      const nomJour = JOURS[jourIdx(date)]
      const jourISO = jourLocalISO(date)
      const duJour = chargeParJour[jourISO] || {}
      // ⚠️ UN CRÉNEAU FERMÉ S'AFFICHE COMPLET, IL NE DISPARAÎT PAS.
      // Arbitrage d'Alex, 23/08, après essai : un créneau retiré de la grille
      // est indiscernable d'un créneau qui n'a jamais existé, et le client
      // conclut que le commerce n'ouvre pas à cette heure-là. Barré et marqué
      // « Complet », il dit la vérité utile : le créneau existe, il n'y a plus
      // de place. C'est d'ailleurs le mot que le commerçant a employé en le
      // demandant — « mettre en complet ».
      //
      // ⚠️ ET LE YOPPER N'A PAS À SAVOIR QUE LE COMMERÇANT A FERMÉ LUI-MÊME.
      // « Fermé par toi » est un mot du tableau de bord, pour celui qui a
      // cliqué. Côté client, un créneau fermé se comporte comme un créneau
      // plein : même case grise, même barré, même impossibilité de le choisir.
      //
      // ⚠️ CE MARQUAGE N'EST PAS UNE PROTECTION. Il est calculé AU CHARGEMENT
      // de la fiche : un onglet ouvert depuis dix minutes ne verra pas le
      // blocage qui vient d'être posé. C'est `create-commande` qui refuse
      // réellement, côté serveur. Une garde d'écran n'est jamais une réponse.
      const fermesCeJour = new Set(
        (blocagesCren || [])
          .filter(b => String(b.date_blocage || '').slice(0, 10) === jourISO)
          .map(b => b.creneau_id)
      )
      return creneauxAvecCount
        .filter(cr => cr.jour_semaine === nomJour || cr.jour_semaine === null)
        .map(cr => ({
          ...cr,
          // Lu par `calculerCapaciteCreneau`, qui met la capacité restante à
          // zéro sans toucher aux commandes déjà prises.
          bloque: fermesCeJour.has(cr.id),
          count: duJour[cr.id]?.count || 0,
          temps_cumul: duJour[cr.id]?.temps || 0,
        }))
    }

    if (!estEnFermeture(today)) {
      const crensAujourdhui = creneauxPourDate(today).filter(cr => heureEnMinutes(cr.heure_debut) > now)
      if (crensAujourdhui.length > 0) {
        joursDispos.push({ date: new Date(today), label: "Aujourd'hui", creneaux: creneauxPourDate(today) })
      }
    }

    // L'horizon compte AUJOURD'HUI COMPRIS : réglé sur 2, il donne aujourd'hui
    // et demain, ce que dit exactement le libellé du tableau de bord.
    for (let i = 1; i < horizon; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i)
      if (estEnFermeture(d)) continue
      const label = i === 1 ? 'Demain' : d.toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })
      joursDispos.push({ date: d, label, creneaux: creneauxPourDate(d) })
    }

    if (joursDispos.length === 0) {
      joursDispos.push({ date: new Date(today), label: "Aujourd'hui", creneaux: creneauxPourDate(today) })
    }

    return joursDispos
  }

  // Wrapper : construit + pose l'état des jours de RETRAIT.
  function buildJoursDispos(c, creneauxAvecCount, fermeturesData, charge = chargeCreneaux, blocagesCren = blocagesCreneaux) {
    setJoursDispos(construireJoursDispos(c, creneauxAvecCount, fermeturesData, charge, blocagesCren))
    setJourSelectionne(0)
  }

  // Les créneaux réellement PROPOSABLES pour le jour affiché.
  //
  // ⚠️ LE DÉLAI DU COMMERÇANT N'ÉTAIT PAS LU ICI. L'écran masquait seulement
  // les créneaux du jour déjà commencés ; le délai (« commande jusqu'à 2h
  // avant ») n'existait que côté serveur, et seulement pour la livraison. Le
  // client voyait donc un créneau proposé, le choisissait, et se faisait
  // refuser au paiement. On applique désormais `creneauCommandable`, la MÊME
  // fonction que le serveur, pour que les deux disent la même chose.
  //
  // Et sur TOUS les jours, plus seulement aujourd'hui : un créneau de demain
  // 8h avec douze heures de délai n'est plus commandable ce soir.
  function creneauxProposables(index = jourSelectionne) {
    const jour = joursDispos[index]
    const liste = jour?.creneaux || creneaux
    if (!jour?.date) return liste
    const dateStr = jourLocalISO(jour.date)
    const instantDebut = (d, h) => {
      const [hh, mm] = String(h || '').slice(0, 5).split(':').map(Number)
      const x = new Date(`${d}T00:00:00`)
      if (isNaN(x.getTime()) || !Number.isFinite(hh)) return null
      x.setHours(hh, mm || 0, 0, 0)
      return x
    }
    return liste.filter(cr => creneauCommandable(cr, { dateStr, instantDebut }).ok)
  }

  useEffect(() => {
    if (commercant && creneaux.length > 0) {
      buildJoursDispos(commercant, creneaux, fermetures, chargeCreneaux, blocagesCreneaux)
    }
  // ⚠️ `blocagesCreneaux` EST DANS LES DÉPENDANCES, et il doit y rester : sans
  // lui, le calendrier gardait son calcul d'avant et ignorait les créneaux
  // fermés arrivés entre-temps. Troisième maillon de la même chaîne.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps volontairement réduites (fetch-on-mount piloté par l'id), décision lint 31/07
  }, [commercant, creneaux, fermetures, chargeCreneaux, blocagesCreneaux])

  // ─── FIX STOCK SYNC : charger les commandes du jour sélectionné ─────────────
  // Récupère les quantités déjà commandées par article pour le jour sélectionné
  // (exclut les commandes "non_retire") afin que le stock disponible affiché côté
  // client soit cohérent avec ce que voit le commerçant sur son dashboard.
  // ⚠️ LA MÉMOIRE DES RELEVÉS DE FOND. Sans elle, un relevé qui rend exactement
  // les mêmes données repose quand même quatre états avec des objets neufs, et
  // la fiche entière se redessine. C'est ce qui fabriquait les blocages d'écran
  // d'une à deux secondes signalés par Alex le 18/08. Voir lib/rafraichissement.
  const memoireCommandes = useRef(null)
  const memoireArticles = useRef(null)
  const memoireStocks = useRef(null)
  const memoireOptions = useRef(null)

  const chargerCommandesJour = useCallback(async () => {
    if (!commercant) return
    // ⚠️ EN BOUTIQUE, LE STOCK SE LISAIT AU MAUVAIS JOUR. Le sélecteur affiché
    // était celui de l'alimentaire, décalé d'un jour par rapport à la date
    // réellement commandée : on interrogeait le 12 pour une commande du 11.
    const dateStr = estDetail
      ? (jourRetraitBoutique || jourLocalISO(new Date()))
      : jourLocalISO(new Date(joursDispos[jourSelectionne]?.date || new Date()))

    // Une seule fonction serveur remplace l'ancienne approche en deux temps,
    // qui lisait les commandes puis leurs lignes. Elle renvoie directement les
    // quantités déjà commandées par article, sans exposer aucune commande.
    const { data: lignes, error } = await supabase.rpc('stock_commande_par_article', {
      p_commercant_id: commercant.id,
      p_date: dateStr,
    })
    if (error) { console.warn('[stock jour] rpc KO', error.message); return }
    const map = {}
    ;(lignes || []).forEach(r => {
      map[r.article_id] = Number(r.quantite) || 0
    })
    poserSiChange(memoireCommandes, map, setCommandesParArticleJour)
  }, [commercant, joursDispos, jourSelectionne, estDetail, jourRetraitBoutique])

  // Recharge à chaque changement de jour ou de commerçant
  useEffect(() => {
    chargerCommandesJour()
  }, [chargerCommandesJour])

  // Rafraîchit articles + stocks de fond - garantit que le client voit toujours
  // les vrais stocks configurés par le commerçant, même si le cache localStorage
  // est encore "frais" ou si Supabase Realtime n'est pas activé sur ces tables.
  const rafraichirArticlesEtStocks = useCallback(async () => {
    if (!commercant) return
    const { data: arts } = await supabase
      .from('articles')
      .select('*')
      .eq('commercant_id', commercant.id)
      .eq('actif', true)
      .order('categorie').order('nom')
    if (arts) poserSiChange(memoireArticles, arts, setArticles)
    const artIds = (arts || []).map(a => a.id)
    if (artIds.length > 0) {
      const [{ data: stocksData }, { data: groupesData }] = await Promise.all([
        supabase
          .from('article_stock_jour')
          .select('*')
          .eq('commercant_id', commercant.id)
          .in('article_id', artIds),
        supabase
          .from('article_options_groupes')
          .select('*, valeurs:article_options_valeurs(*)')
          .in('article_id', artIds)
          .order('created_at'),
      ])
      const stocksMap = {}
      ;(stocksData || []).forEach(s => {
        if (!stocksMap[s.article_id]) stocksMap[s.article_id] = {}
        stocksMap[s.article_id][s.jour_semaine] = { stock: s.stock, actif: s.actif }
      })
      poserSiChange(memoireStocks, stocksMap, setStocksJour)
      const optsMap = {}
      ;(groupesData || []).forEach(g => {
        if (!optsMap[g.article_id]) optsMap[g.article_id] = []
        optsMap[g.article_id].push(g)
      })
      poserSiChange(memoireOptions, optsMap, setOptionsParArticle)
    }
  }, [commercant])

  useEffect(() => {
    if (commercant) rafraichirArticlesEtStocks()
  }, [commercant, rafraichirArticlesEtStocks])

  // ─── LE RELEVÉ DE FOND, ET LE TEMPS RÉEL QUI FAIT LE VRAI TRAVAIL ─────────
  //
  // ⚠️ CE RELEVÉ TOURNAIT TOUTES LES CINQ SECONDES, SANS JAMAIS REGARDER SI
  // QUELQU'UN AVAIT LES YEUX SUR L'ÉCRAN, et il reposait quatre états avec des
  // objets neufs à chaque passage : quatre requêtes, dont une jointure, puis un
  // rendu complet du plus gros composant de l'application. Douze fois par
  // minute, indéfiniment. C'est ce qui gelait le défilement pendant une à deux
  // secondes, « surtout quand je vais plus vite » (Alex, 18/08), et pourquoi
  // « la fiche ouverte depuis un certain temps » n'y changeait rien.
  //
  // ⚠️ MÊME DÉFAUT QUE LE 11/08 SUR L'ACCUEIL CLIENT, où un relevé de cinq
  // secondes non conditionné à la visibilité effaçait la session. J'avais
  // corrigé là-bas sans chercher les frères. Ils étaient deux.
  //
  // ⚠️ CE N'EST PAS LE RELEVÉ QUI TIENT LA FICHE À JOUR, c'est l'abonnement
  // temps réel juste en dessous : il écoute les commandes, les articles, les
  // stocks du jour et les options. Le relevé n'est qu'une ceinture pour le cas
  // où le temps réel serait coupé sur ces tables, et une ceinture n'a pas
  // besoin de se resserrer toutes les cinq secondes.
  const articlesRef = useRef(articles)
  useEffect(() => { articlesRef.current = articles }, [articles])
  useEffect(() => {
    if (!commercant) return
    const intervalId = setInterval(() => {
      if (!ecranRegarde()) return
      chargerCommandesJour()
      rafraichirArticlesEtStocks()
    }, 30000)
    const channel = supabase
      .channel(`stock-sync-${commercant.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commandes', filter: `commercant_id=eq.${commercant.id}` }, () => chargerCommandesJour())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commande_articles' }, () => chargerCommandesJour())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'articles', filter: `commercant_id=eq.${commercant.id}` }, payload => {
        setArticles(prev => prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_stock_jour', filter: `commercant_id=eq.${commercant.id}` }, async () => {
        const artIds = articlesRef.current.map(a => a.id)
        if (artIds.length === 0) return
        const { data: stocksData } = await supabase
          .from('article_stock_jour')
          .select('*')
          .eq('commercant_id', commercant.id)
          .in('article_id', artIds)
        const map = {}
        ;(stocksData || []).forEach(s => {
          if (!map[s.article_id]) map[s.article_id] = {}
          map[s.article_id][s.jour_semaine] = { stock: s.stock, actif: s.actif }
        })
        poserSiChange(memoireStocks, map, setStocksJour)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_options_groupes' }, () => rafraichirArticlesEtStocks())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'article_options_valeurs' }, () => rafraichirArticlesEtStocks())
      .subscribe()
    return () => {
      clearInterval(intervalId)
      supabase.removeChannel(channel)
    }
  }, [commercant, chargerCommandesJour, rafraichirArticlesEtStocks])

  // ⚠️ L'ÉCOUTE DU DÉFILEMENT A DÉMÉNAGÉ dans `BarreCategories`, avec l'état
  // qu'elle pilote. Tant qu'elle vivait ici, franchir un titre de catégorie
  // redessinait toute la fiche au milieu du geste. Voir le commentaire du
  // composant, en tête de fichier.
  //
  // ⚠️ CE GESTE-CI RESTE, parce qu'il ne vient pas du défilement : un clic sur
  // une offre saute vers sa catégorie. Il ne touche aucun état, seulement des
  // repères ; la barre reconnaîtra l'endroit toute seule en voyant défiler.
  function scrollToCategorie(cat) {
    const el = catRefs.current[cat]
    const scroll = scrollRef.current
    const header = headerRef.current
    if (!el || !scroll || !header) return
    scroll.scrollTo({ top: el.offsetTop - header.offsetHeight - 56, behavior: 'smooth' })
  }

  function ajouterAuPanier(article, options = null, variante = null) {
    if (variante) {
      // Item à variante : le stock de LA variante fait foi (modèle détail)
      const key = `${article.id}_v${variante.id}`
      const dejaPanier = panier[key]?.quantite || 0
      if ((variante.stock ?? 0) <= dejaPanier) return
      const prixVar = variante.prix != null
        ? prixEffectifVariante(variante.prix, article, dealsActifs)
        : prixEffectif(article, dealsActifs)
      const label = [variante.axe1_valeur, variante.axe2_valeur].filter(Boolean).join(' · ')
      setPanier(prev => ({ ...prev, [key]: { ...article, prix: prixVar, options: null, variante: { id: variante.id, label, stock: variante.stock }, quantite: (prev[key]?.quantite || 0) + 1 } }))
      return
    }
    // FIX STOCK : vérifier la limite avant d'ajouter
    const stockMax = getStockMax(article.id)
    const qteTotale = qteTotaleArticle(article.id)
    if (stockMax !== Infinity && qteTotale >= stockMax) return
    const key = options ? `${article.id}_${JSON.stringify(options)}` : String(article.id)
    // Le prix de la ligne est le prix remisé quand une remise du jour vise cet
    // article ou sa catégorie. Un lot ou un duo, lui, reste une offre séparée
    // ajoutée par sa propre carte (ajouterDealAuPanier) : l'unité ne disparaît
    // jamais. Le serveur recalcule tout, cet affichage n'engage rien.
    const remise = remiseSurArticle(article, dealsActifs)
    setPanier(prev => ({ ...prev, [key]: {
      ...article,
      prix: remise ? remise.prix : Number(article.prix),
      prix_avant_deal: remise ? remise.prixBarre : null,
      options,
      quantite: (prev[key]?.quantite || 0) + 1,
    } }))
  }

  // Ajoute une OFFRE SÉPARÉE (lot, duo) comme ligne de panier à part entière :
  // l'unité reste commandable à côté. Le serveur revalide le prix via deal_id.
  function ajouterDealAuPanier(deal, article) {
    const key = `deal_${deal.id}`
    // Plafond stock : un lot consomme unites_par_deal unités de l'article
    // (lot 3+1 = 4). Même garde silencieuse que les ajouts unitaires.
    const stockMax = getStockMax(article.id)
    const unites = deal.unites_par_deal || 1
    if (stockMax !== Infinity && qteTotaleArticle(article.id) + unites > stockMax) return
    const prixDeal = Number(deal.prix_deal)
    const prixAvant = deal.prix_original != null ? Number(deal.prix_original) : null
    setPanier(prev => ({ ...prev, [key]: {
      id: article.id,
      nom: deal.titre,
      prix: prixDeal,
      prix_avant_deal: prixAvant,
      deal_id: deal.id,
      unites_par_deal: unites,
      options: null,
      quantite: (prev[key]?.quantite || 0) + 1,
    } }))
  }

  // ─── Une bonne affaire doit se VENDRE, pas seulement s'annoncer ────────────
  // La bannière et la modale annonçaient l'offre sans donner le moindre moyen
  // de l'acheter : le Yopper devait retrouver l'article à la main dans le
  // catalogue. Selon ce que le deal vise, le bouton met l'offre au panier ou
  // emmène directement là où elle s'applique.
  function articleDuDeal(deal) {
    if (!deal?.article_id) return null
    return articles.find(a => a.id === deal.article_id) || null
  }

  function acheterDeal(deal) {
    const article = articleDuDeal(deal)
    trackDeal(deal.id, 'cta_click')
    setDealDetailOuvert(null)
    if (article) {
      // Lot ou duo : c'est l'offre elle-même qui entre au panier. Remise : c'est
      // l'article, à son prix remisé, calculé par ajouterAuPanier.
      if (estOffreSeparee(deal)) ajouterDealAuPanier(deal, article)
      else ajouterAuPanier(article)
      return
    }
    // Remise sur toute une catégorie : rien à ajouter, on y emmène le Yopper.
    if (deal.categorie_cible) scrollToCategorie(deal.categorie_cible)
  }

  // Le bouton n'a de sens que si le deal mène quelque part et que la fiche
  // accepte les commandes.
  function dealAchetable(deal) {
    if (!deal || !peutCommander) return false
    if (deal.article_id) return !!articleDuDeal(deal)
    return !!deal.categorie_cible
  }

  // FIX STOCK : incrementerPanier vérifie aussi le stock
  function incrementerPanier(key, item) {
    if (item.variante) {
      if ((item.variante.stock ?? 0) <= (panier[key]?.quantite || 0)) return
      setPanier(prev => ({ ...prev, [key]: { ...item, quantite: (prev[key]?.quantite || 0) + 1 } }))
      return
    }
    const stockMax = getStockMax(item.id)
    // Une ligne deal ajoute unites_par_deal unités d'un coup, une ligne
    // classique en ajoute une seule
    const ajout = item.deal_id ? (item.unites_par_deal || 1) : 1
    if (stockMax !== Infinity && qteTotaleArticle(item.id) + ajout > stockMax) return
    setPanier(prev => ({ ...prev, [key]: { ...item, quantite: (prev[key]?.quantite || 0) + 1 } }))
  }

  function retirerDuPanier(key) {
    setPanier(prev => {
      const next = { ...prev }
      if (next[key]?.quantite > 1) next[key] = { ...next[key], quantite: next[key].quantite - 1 }
      else delete next[key]
      return next
    })
  }

  // Vue de fiche : le premier chiffre que le commerçant cherche. Comptée une
  // fois par session et par commerce, sans rien enregistrer sur le visiteur.
  // La clé est partagée avec la fiche rendez-vous : une visite reste une visite,
  // même si le client passe d'une page à l'autre.
  useEffect(() => {
    if (commercant?.id) compterVueFiche(commercant.id)
  }, [commercant?.id])

  // ─── PANIER RAPPORTÉ DE LA FICHE RENDEZ-VOUS (09/08) ─────────────────────
  //
  // Le trajet inverse existait déjà : la boutique déposait son panier avant
  // d'envoyer le client vers le tunnel de rendez-vous. Dans l'autre sens, rien.
  // Un client qui ajoutait un shampoing sur la fiche du salon puis ouvrait le
  // produit arrivait ici les mains vides et devait tout recommencer.
  //
  // On reconstruit les lignes AVEC LES PRIX D'ICI : le dépôt ne transporte que
  // des identifiants et des quantités, jamais un prix. Et on plafonne au stock
  // du jour, sinon le panier repris annoncerait des articles indisponibles.
  const [panierRepris, setPanierRepris] = useState(null)
  const panierReprisRef = useRef(false)
  useEffect(() => {
    if (panierReprisRef.current) return
    if (!slug || articles.length === 0) return
    if (!canDo(planEffectif(commercant), 'commande')) return
    const depot = reprendrePanierPourBoutique(slug)
    panierReprisRef.current = true
    if (!depot) return
    const ajouts = {}
    for (const l of depot.articles) {
      const article = articles.find(a => String(a.id) === String(l.id))
      if (!article || article.est_vitrine || !(Number(article.prix) > 0)) continue
      const stockMax = getStockMax(article.id)
      const qte = stockMax === Infinity ? l.quantite : Math.min(l.quantite, stockMax)
      if (qte <= 0) continue
      const remise = remiseSurArticle(article, dealsActifs)
      ajouts[String(article.id)] = {
        ...article,
        prix: remise ? remise.prix : Number(article.prix),
        prix_avant_deal: remise ? remise.prixBarre : null,
        options: null,
        quantite: qte,
      }
    }
    const repris = Object.keys(ajouts).length
    if (repris > 0) setPanier(prev => ({ ...prev, ...ajouts }))
    if (repris > 0 || depot.ignores.length > 0) {
      setPanierRepris({ repris, ignores: depot.ignores })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- ne doit tourner qu'une fois, au premier catalogue chargé
  }, [slug, articles.length, commercant?.plan])

  function qteTotaleArticle(articleId) {
    return Object.entries(panier).reduce((acc, [key, item]) => {
      if (key === String(articleId) || key.startsWith(`${articleId}_`)) return acc + item.quantite
      // Lignes deal (clé deal_<id>) rattachées à cet article : chaque deal
      // consomme unites_par_deal unités de stock (ex. lot 3+1 = 4 unités)
      if (key.startsWith('deal_') && String(item.id) === String(articleId)) return acc + item.quantite * (item.unites_par_deal || 1)
      return acc
    }, 0)
  }

  // Stock disponible d'un article pour le jour sélectionné. Priorité :
  // 1) entrée article_stock_jour pour ce jour-de-semaine (override fiable)
  // 2) sinon, fallback sur articles.stock_jour global
  // 3) si rien de défini (les deux à 0/null) → Infinity = stock non géré.
  // Toujours soustrait les commandes déjà passées (sync temps réel).
  function getStockMax(articleId) {
    const article = articles.find(a => a.id === articleId)
    if (!article) return Infinity
    const stocksArticle = stocksJour[articleId] || {}
    // ⚠️ EN BOUTIQUE, C'EST LE JOUR SOUHAITÉ QUI COMPTE, pas le jour affiché par
    // le sélecteur de l'alimentaire, décalé d'une journée.
    const jourDateSelectionne = estDetail && jourRetraitBoutique
      ? new Date(`${jourRetraitBoutique}T12:00:00Z`)
      : (joursDispos[jourSelectionne]?.date || new Date())
    const jourNomSelectionne = JOURS[jourIdx(jourDateSelectionne)]
    const entryDay = stocksArticle[jourNomSelectionne]
    const dejaCommande = commandesParArticleJour[articleId] || 0

    if (entryDay) {
      if (entryDay.actif === false) return 0
      const stockBrut = entryDay.stock || 0
      if (stockBrut <= 0) return 0
      return Math.max(0, stockBrut - dejaCommande)
    }
    if (!article.stock_jour || article.stock_jour <= 0) return Infinity
    return Math.max(0, article.stock_jour - dejaCommande)
  }

  function totalPanier() {
    return Object.values(panier).reduce((acc, i) => {
      const supplement = i.options ? Object.values(i.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0
      return acc + (i.prix + supplement) * i.quantite
    }, 0)
  }

  // Frais de livraison côté client (confort d'affichage ; le serveur recalcule et
  // reste la source de vérité). Fixe, offert si le panier atteint gratuit_des.
  function fraisLivraison() {
    // Boutique détail en expédition : frais de port (offerts dès le seuil).
    // Estimation client ; le serveur recalcule et reste la source de vérité.
    if (commercant?.categorie === 'detail') {
      if (modeBoutiqueEff !== 'expedition') return 0
      const seuil = Number(commercant?.boutique_gratuit_des)
      if (seuil > 0 && totalPanier() >= seuil) return 0
      return Number(commercant?.boutique_frais_port || 0)
    }
    if (modeCommande !== 'livraison' || !livraisonConfig) return 0
    const g = livraisonConfig.gratuit_des
    if (g != null && totalPanier() >= Number(g)) return 0
    return Number(livraisonConfig.frais_fixe || 0)
  }
  function totalAvecFrais() { return totalPanier() + fraisLivraison() }
  // Retour Stripe après achat d'un bon : ?bon=ok|annule (+ session_id) →
  // écran de confirmation + URL nettoyée.
  //
  // ⚠️ ON LIT LA SESSION AVANT DE NETTOYER L'URL. Le nettoyage est ce qui
  // évite de rejouer la confirmation à chaque rafraîchissement ; le faire trop
  // tôt jetterait la seule clé qui permet de savoir quel bon vient d'être
  // acheté.
  useEffect(() => {
    let vivant = true
    try {
      const params = new URLSearchParams(window.location.search)
      const p = params.get('bon')
      if (p !== 'ok' && p !== 'annule') return
      const sessionId = params.get('session_id')
      setBonRetour(p)

      const url = new URL(window.location.href)
      url.searchParams.delete('bon')
      url.searchParams.delete('session_id')
      window.history.replaceState({}, '', url.toString())

      if (p === 'ok' && sessionId) {
        fetch('/api/bons-cadeaux/confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
          .then(r => r.json())
          .then(j => { if (vivant && j?.ok && j.bon) setBonConfirme(j.bon) })
          // ⚠️ UNE LECTURE RATÉE NE DOIT PAS EFFACER LA CONFIRMATION : le
          // paiement a réussi, on retombe sur le message générique plutôt que
          // sur un écran vide.
          .catch(() => {})
      }
    } catch { /* ignore */ }
    return () => { vivant = false }
  }, [])
  // Bon cadeau : config du commerçant (bouton Offrir + champ code du tunnel)
  useEffect(() => {
    if (!commercant?.id) return
    fetch(`/api/bons-cadeaux/config?commercant_id=${commercant.id}`)
      .then(r => r.json())
      .then(j => { if (j?.ok) setBonsCfg(j) })
      .catch(() => {})

  }, [commercant?.id])

  // Récompense de fidélité disponible chez ce commerçant.
  //
  // ⚠️ SILENCIEUX EN CAS D'ÉCHEC, ET C'EST VOULU ICI. Ce n'est pas l'écran vide
  // du 11/08 : il ne s'agit pas d'une donnée que le Yopper vient consulter,
  // mais d'une offre en plus. Un invité, une session endormie ou une panne
  // réseau donnent le même résultat visible — pas de bloc récompense — et la
  // commande reste possible dans tous les cas.
  useEffect(() => {
    if (!commercant?.id) return
    let vivant = true
    fetchAvecPreuveSiConnecte(`/api/fidelite/ma-recompense?commercant_id=${commercant.id}`)
      .then(r => r.json())
      .then(j => {
        if (!vivant || !j?.ok || !j.recompense) return
        setRecompenseFid(j.recompense)
        setRecompensesTotal(Number(j.total) || 1)
      })
      .catch(() => {})
    return () => { vivant = false }
  }, [commercant?.id])
  // ─── RÉCOMPENSE DE FIDÉLITÉ ────────────────────────────────────────────
  //
  // ⚠️ ELLE N'EST PAS COCHÉE D'AVANCE, ET C'EST UN CHOIX. Une récompense de
  // 5 € posée d'office sur un panier à 4 € en brûlerait 1 € que le Yopper ne
  // récupérera jamais. On la propose bien en évidence, il décide.
  //
  // ⚠️ ET CE CALCUL N'EST QU'UN AFFICHAGE. Le prix qui fait foi est celui de
  // `create-commande`, qui recharge la récompense depuis la base et revérifie
  // qu'elle appartient à un numéro PROUVÉ de ce Yopper connecté.
  function remiseRecompenseEffective() {
    return (recompenseFid && recompenseActive) ? calculerRemiseRecompense(recompenseFid, totalAvecFrais()) : 0
  }
  // Ce qui reste à couvrir une fois la récompense passée : la base du bon.
  function baseApresRecompense() {
    return Math.max(0, Math.round((totalAvecFrais() - remiseRecompenseEffective()) * 100) / 100)
  }
  // Bon cadeau appliqué : remise plafonnée (solde, total, minimum Stripe 0,50 €)
  //
  // ⚠️ LA BASE EST CELLE D'APRÈS LA RÉCOMPENSE, jamais le total brut. La
  // récompense est une remise du commerçant, le bon est de l'argent déjà payé
  // par quelqu'un : dans l'autre ordre, le porteur du bon perdrait du solde
  // sur une part qui était offerte de toute façon.
  // ⚠️ LE MÊME MODULE QUE LE SERVEUR, et surtout PAS `calculerRemiseBon`
  // appelée en boucle : elle laisserait 0,50 € sur CHAQUE bon au lieu de
  // l'appliquer une seule fois au total.
  function repartitionBons() { return repartirBons(bonsAppliques, baseApresRecompense()) }
  function remiseBonEffective() { return repartitionBons().total }
  function totalDuApresBon() { return Math.max(0, Math.round((baseApresRecompense() - remiseBonEffective()) * 100) / 100) }

  // ⚠️ `codeDirect` SERT LE YOPPER CONNECTÉ, qui n'a pas à retaper de mémoire
  // un code qu'il possède déjà. Le champ de saisie reste, pour qui a reçu un
  // code sans avoir de compte.
  //
  // ⚠️ ET ON N'ACCEPTE QU'UNE CHAÎNE : ce même bouton s'écrit ailleurs
  // `onClick={appliquerBon}`, et React passe alors l'ÉVÉNEMENT en premier
  // argument. Sans ce test, un clic sur « Appliquer » normaliserait un objet
  // React et échouerait sur un format de code.
  async function appliquerBon(codeDirect = null) {
    const source = typeof codeDirect === 'string' ? codeDirect : bonInput
    const code = normaliserCodeBon(source)
    if (!code) { setBonErreur('Format attendu : BC-XXXX-XXXX'); return }
    setBonLoading(true); setBonErreur(null)
    try {
      const r = await fetch('/api/bons-cadeaux/verifier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commercant_id: commercant.id, code }),
      })
      const j = await r.json()
      // ⚠️ UN CODE REFUSÉ NE VIDE PLUS LA LISTE. Avant, un mauvais code effaçait
      // le bon déjà appliqué : le Yopper perdait sa remise pour une faute de
      // frappe. On dit l'erreur, on ne défait rien.
      if (!r.ok || !j.ok) { setBonErreur(j.error || 'Vérification impossible.') }
      else {
        setBonsAppliques(liste => {
          // 🔴 UN MÊME CODE DEUX FOIS COMPTERAIT SON SOLDE DEUX FOIS. Le serveur
          // le refuse aussi, mais autant le dire ici plutôt que de laisser
          // partir une commande qui sera rejetée.
          if (liste.some(b => b.code === j.code)) {
            setBonErreur(`Ce ${libelleBon(commercant?.categorie)} est déjà appliqué.`)
            return liste
          }
          if (liste.length >= BONS_MAX_PAR_COMMANDE) {
            setBonErreur(`Cinq ${libelleBon(commercant?.categorie, { pluriel: true })} au maximum par commande.`)
            return liste
          }
          return [...liste, { id: j.code, code: j.code, solde: j.solde }]
        })
        setBonInput('')
      }
    } catch {
      setBonErreur('Vérification impossible, réessaie.')
    }
    setBonLoading(false)
  }

  // ─── LE CODE ARRIVÉ PAR LE LIEN DU BON ────────────────────────────────────
  //
  // 🔴 LE TESTEUR D'ALEX A FAIT DES ALLERS-RETOURS POUR RIEN (01/09). Il est
  // arrivé depuis `/cadeau/<jeton>`, a cliqué sur « Découvrir », puis a dû
  // revenir lire son code et le retaper à la main. L'information était sous ses
  // yeux une seconde plus tôt.
  //
  // ⚠️ ON ATTEND QUE LE COMMERCE SOIT CHARGÉ : `appliquerBon` a besoin de
  // `commercant.id` pour vérifier le code. Lancer trop tôt enverrait `undefined`
  // au serveur, qui répondrait « code invalide » sur un code parfaitement bon.
  //
  // ⚠️ ET ON NE LE FAIT QU'UNE FOIS : `commercant` se rafraîchit, l'effet se
  // rejouerait et redemanderait la vérification à chaque tour.
  const bonDuLienFait = useRef(false)
  useEffect(() => {
    if (bonDuLienFait.current || !commercant?.id) return
    if (typeof window === 'undefined') return
    let code = null
    try {
      const params = new URLSearchParams(window.location.search)
      code = params.get('bon_code')
      if (!code) return
      // 🔴 ON NETTOIE L'ADRESSE TOUT DE SUITE. Un code de bon est un secret au
      // porteur : il n'a rien à faire dans une barre d'adresse qui se partage,
      // se photographie ou se retrouve dans un historique. Même geste que pour
      // la session Stripe du retour de paiement.
      const url = new URL(window.location.href)
      url.searchParams.delete('bon_code')
      window.history.replaceState({}, '', url.toString())
    } catch { return }
    bonDuLienFait.current = true
    // `appliquerBon` normalise, vérifie côté serveur et affiche son propre
    // message si le bon ne convient pas : on ne double pas sa garde ici.
    appliquerBon(code)
    // ⚠️ `appliquerBon` est recréée à chaque rendu : la mettre en dépendance
    // relancerait l'effet en boucle. Le garde-fou est `bonDuLienFait`, qui rend
    // l'opération unique quoi qu'il arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commercant?.id])

  // Change d'étape ET remonte en haut du conteneur scrollable. Centralisé pour une
  // UX fluide : sans ça, on arrive en bas de la nouvelle étape (scroll conservé).
  function allerEtape(n) {
    setEtape(n)
    setTimeout(() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }), 50)
  }


  // Scrolle jusqu'au récap panier (bouton flottant). On centre le récap dans le
  // conteneur scrollable plutôt que scrollIntoView (qui viserait la fenêtre entière).
  function scrollVersPanier() {
    const el = recapPanierRef.current
    const scroll = scrollRef.current
    if (!el || !scroll) return
    scroll.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' })
  }

  // Nombre total d'articles au panier (somme des quantités) pour le badge flottant.
  function nbArticlesPanier() {
    return Object.values(panier).reduce((n, i) => n + (i.quantite || 0), 0)
  }

  function commanderPourJour(idxJour) {
    // Vient du bouton "Commander [jour] →" sur un article épuisé aujourd'hui.
    // Change le jour (avec confirmation si panier non vide) sans passer
    // immédiatement à l'étape 3 - l'utilisateur doit pouvoir compléter son panier
    // avec d'autres articles du jour ciblé avant de choisir son créneau.
    changerJour(idxJour)
  }

  function changerJour(idx) {
    if (idx === jourSelectionne) return
    const panierNonVide = Object.keys(panier).length > 0
    if (panierNonVide) {
      setConfirmationJour({ nouveauIdx: idx })
    } else {
      setJourSelectionne(idx)
      setCreneauChoisi(null)
    }
  }

  function confirmerChangementJour() {
    if (!confirmationJour) return
    setPanier({})
    setJourSelectionne(confirmationJour.nouveauIdx)
    setCreneauChoisi(null)
    setErreurCommande(null)
    setAjustementStock(null)
    setConfirmationJour(null)
  }

  async function getOuCreerClient(email, prenom, nom) {
    const telephone = client.telephone || ''
    // IMPORTANT : on UPDATE clients.nom avec `nom` SEUL (pas `${prenom} ${nom}`).
    // Sinon a chaque commande/RDV, clients.nom devient 'Alexandre Verstappen' alors que
    // dans le Profil le user a saisi nom='Verstappen' uniquement. Au reload, fetch DB
    // ecrase la modif propre. Bug rapporte par Alex 2026-06-01.
    // Get-or-create côté serveur (RLS clients verrouillé : plus d'accès anon direct).
    const res = await fetch('/api/yopper/client', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get-or-create', email, prenom, nom, telephone }),
    })
    const id = (await res.json().catch(() => ({})))?.client?.id
    if (!id) return null
    setClientId(id)
    // ⚠️ EN ENTIER, Y COMPRIS EN EFFAÇANT. Le `if (telephone)` d'avant laissait
    // en place le numéro du compte précédent quand celui-ci n'en donnait pas.
    // Voir lib/identite-locale.js : c'est ce mélange qu'Alex a vu le 03/09.
    poserIdentiteLocale({ client_id: id, email, prenom, nom, telephone })
    return id
  }

  async function passerCommande() {
    // Boutique détail : pas de créneau, la validation vient de creneauOk
    // (retrait libre, ou formulaire d'expédition complet + CP en zone).
    if (!creneauOk || !client.prenom || !client.nom || !client.email || !client.telephone || !rgpdCommande || !commercant) return
    setLoadingCommande(true)
    setErreurCommande(null)
    try {
      // Persistance client (localStorage + clients DB) - utile pour favoris/historique
      await getOuCreerClient(client.email, client.prenom, client.nom)

      // ⚠️ EN BOUTIQUE, LA DATE ÉTAIT FORCÉE À AUJOURD'HUI, sans jamais regarder
      // les horaires : un dimanche, on annonçait au client un retrait un
      // dimanche, et il se déplaçait devant une porte fermée. L'alimentaire est
      // protégé par ses créneaux, la boutique n'en a pas.
      // Un colis, lui, part quand le commerçant l'emballe : sa date reste celle
      // de la commande.
      const jourDate = estDetail
        ? (modeBoutiqueEff === 'expedition' ? new Date() : new Date(`${jourRetraitBoutique || jourLocalISO(new Date())}T12:00:00Z`))
        : ((modeCommande === 'livraison' ? creneauLivraisonChoisi?._date : joursDispos[jourSelectionne]?.date) || new Date())
      const d = new Date(jourDate)
      const dateStr = estDetail && modeBoutiqueEff !== 'expedition'
        ? (jourRetraitBoutique || jourLocalISO(new Date()))
        : jourLocalISO(d)

      // Payload articles avec options structurées (groupe_id + valeur_ids)
      // La route recalcule tout server-side (anti-tampering)
      const articlesPayload = Object.values(panier).map(i => ({
        id: i.id,
        quantite: i.quantite,
        variante_id: i.variante?.id || undefined,
        deal_id: i.deal_id || undefined,
        options: i.options
          ? Object.entries(i.options).map(([groupe_id, valeurs]) => ({
              groupe_id,
              valeur_ids: valeurs.map(v => v.id),
            }))
          : [],
      }))

      // Mode de paiement effectif : choix explicite du Yopper, sinon défaut
      // selon ce que le commerçant propose (en ligne prioritaire).
      //
      // ⚠️ LA RÈGLE VIT DANS `lib/modes-paiement.js`, ET L'ÉCRAN LIT LA MÊME.
      // Elle était recopiée ici et calculée autrement au rendu : l'écran
      // proposait « Payer en ligne » chez un commerçant qui encaisse au
      // comptoir, et la commande partait en `sur_place` sans Stripe.
      const { stripeOK, cashOK } = modesPaiementOuverts({
        commercant, estDetail, modeBoutique: modeBoutiqueEff,
      })
      // Dû entièrement couvert : pas de choix de paiement à faire, le serveur
      // confirme sans Stripe (chemin `couvertSansPaiement` de create-commande).
      //
      // ⚠️ LA RÉCOMPENSE COMPTE ICI AUSSI. Tant que la condition ne regardait
      // que le bon cadeau, une récompense couvrant tout le panier laissait
      // l'écran réclamer un mode de paiement pour 0 €.
      const couvertParBon = totalDuApresBon() === 0 && (bonsAppliques.length > 0 || remiseRecompenseEffective() > 0)
      const modeEffectif = modePaiementEffectif({
        choix: modePaiement, stripeOK, cashOK, couvert: couvertParBon,
      })
      if (!modeEffectif) {
        setErreurCommande('La commande en ligne n\'est pas encore disponible chez ce commerçant.')
        setLoadingCommande(false)
        return
      }

      // ⚠️ `fetchAvecPreuveSiConnecte` ET NON `fetch` : sans l'en-tête
      // d'autorisation, le serveur ne voit qu'un invité et REFUSE la
      // récompense de fidélité. Et non `fetchYopper` non plus, qui refuserait
      // l'appel faute de session : un invité doit pouvoir commander.
      const res = await fetchAvecPreuveSiConnecte('/api/stripe/checkout/create-commande', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paiement_mode: modeEffectif,
          commercant_id: commercant.id,
          date_commande: dateStr,
          articles: articlesPayload,
          client_email: client.email,
          client_prenom: client.prenom,
          client_nom: client.nom,
          client_telephone: client.telephone,
          rgpd_marketing: rgpdMarketing,
          ...(bonsAppliques.length > 0 ? { bons_cadeaux_codes: bonsAppliques.map(b => b.code) } : {}),
          ...(recompenseFid && recompenseActive ? { fidelite_recompense_id: recompenseFid.id } : {}),
          ...(estDetail
            ? {
                mode_retrait: modeBoutiqueEff === 'expedition' ? 'expedition' : 'retrait_boutique',
                ...(modeBoutiqueEff === 'expedition' ? champsAdressePourAPI(adresseLivraison) : {}),
              }
            : modeCommande === 'livraison'
            ? {
                mode_retrait: 'livraison',
                creneau_livraison_id: creneauLivraisonChoisi?.id,
                ...champsAdressePourAPI(adresseLivraison),
              }
            : { creneau_id: creneauChoisi }),
        }),
      })
      const data = await res.json()

      if (!res.ok || !data.ok) {
        // Stock épuisé entre-temps (409) : populate la modal d'ajustement existante
        if (res.status === 409 && data.article_id) {
          const item = panier[data.article_id]
          setAjustementStock({
            articleId: data.article_id,
            nom: item?.nom || 'cet article',
            stockDisponible: data.stock_disponible || 0,
          })
        }
        setErreurCommande(data?.error || 'Erreur lors de la création de la commande.')
        setLoadingCommande(false)
        return
      }

      // Paiement sur place : la commande est déjà confirmée côté serveur, pas de
      // Stripe. On rejoint le flux de confirmation standard (?paiement=ok) qui
      // affiche l'écran Yoppé + nettoie le panier localStorage.
      if (data.cash || data.bon_total) {
        window.location.href = `/commander/${commercant.slug}?paiement=ok&commande_id=${data.commande_id}`
        return
      }

      // 🔴 CE COMMENTAIRE MENTAIT DEPUIS LE DÉBUT. Il promettait un panier
      // « hydraté depuis localStorage » qui n'existait nulle part : le panier
      // ne vivait qu'en mémoire, et `yoppaa_commerce_<slug>` est le cache du
      // COMMERCE, pas de la commande. Deux retours possibles, deux sorts :
      //   • bouton retour du navigateur → page restaurée depuis son cache,
      //     panier intact, mais bouton figé (corrigé le 24/08) ;
      //   • bouton « Retour » de Stripe → vraie navigation vers cancel_url,
      //     page rechargée, PANIER PERDU. C'est celui-là qu'Alex a vu.
      //
      // On sauve donc l'état AVANT de partir, comme le fait déjà le tunnel du
      // rendez-vous. `sessionStorage` et pas `localStorage` : il survit à
      // l'aller-retour chez Stripe et meurt avec l'onglet, donc aucun panier
      // fantôme ne ressuscite trois semaines plus tard avec des articles
      // supprimés et des prix périmés.
      //
      // ⚠️ La récompense fidélité en fait partie : sans elle, le Yopper qui
      // revient doit repenser à la recocher, et paierait le prix plein.
      try {
        sessionStorage.setItem(cleReprisePanier(slug), JSON.stringify({
          panier, creneauChoisi, modePaiement,
          recompenseActive,
          bonsAppliques,
        }))
      } catch { /* quota plein ou navigation privée : on part quand même */ }

      //
      // redirectTop : quand l'application tourne dans une iframe (les slides de
      // démonstration), window.location.href redirigerait l'iframe vers Stripe
      // Checkout, que Stripe refuse (X-Frame-Options) → écran blanc. Le helper
      // utilise <a target="_top"> qui navigue la fenêtre parent. Hors iframe,
      // affectation directe. Le cadre téléphone du PC, lui, est retiré.
      redirectTop(data.url)
    } catch (e) {
      // Garde-fou anti-freeze : sans ce catch, toute exception (network, RLS)
      // laissait le bouton bloqué sur "En cours..." sans signal.
      console.error('[passerCommande] erreur', e)
      setErreurCommande(`Erreur : ${e?.message || 'inconnue'}. Réessaie ou contacte-nous.`)
      setLoadingCommande(false)
    }
  }

  // Annulation de la commande depuis l'étape 4. Le user a le delai_annulation_heures
  // configuré par le commerçant (default 2h) pour annuler. Refund Stripe automatique.
  async function annulerCommande() {
    if (!derniereCommande?.id || !client.email) return
    if (!window.confirm('Confirmer l\'annulation de ta commande ? Le remboursement sera lancé automatiquement (5 à 10 jours).')) return
    setLoadingCancel(true)
    try {
      const res = await fetch('/api/commande/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commande_id: derniereCommande.id, client_email: client.email }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        alert(`Annulation impossible : ${data?.error || 'erreur inconnue'}`)
        return
      }
      setCancelResult(data)
      setToastMessage(data?.message || 'Commande annulée 🟣')
      setTimeout(() => setToastMessage(null), 5000)
    } catch (e) {
      console.error('[annulerCommande] erreur', e)
      alert(`Erreur : ${e?.message || 'inconnue'}. Réessaie ou contacte-nous.`)
    } finally {
      setLoadingCancel(false)
    }
  }

  // Livraison : dispo si le commerce l'active + zone configurée. Slots aplatis
  // (tournées à venir tous jours confondus). Vérif CP dans la zone.
  const livraisonDispo = !!(commercant?.livraison_actif && livraisonConfig && livraisonConfig.codes_postaux?.length > 0)

  // ─── Persistance localStorage (mode + adresse de livraison) ────────────────
  // 1) Au montage : pré-remplit l'adresse et charge la préférence de mode.
  useEffect(() => {
    try {
      const a = localStorage.getItem('yoppaa.livraison.adresse')
      if (a) { const p = JSON.parse(a); if (p && typeof p === 'object') setAdresseLivraison(prev => ({ ...prev, ...p })) }
      const m = localStorage.getItem('yoppaa.commande.mode')
      if (m === 'retrait' || m === 'livraison') modePrefRef.current = m
    } catch { /* localStorage indispo (mode privé) : on ignore */ }
  }, [])
  // 2) Applique la préférence "livraison" une seule fois, dès qu'elle est possible
  //    (sans jamais forcer si le commerce ne livre pas, ni contrer un choix ultérieur).
  useEffect(() => {
    if (modeAppliqueRef.current) return
    if (livraisonDispo && modePrefRef.current === 'livraison') {
      setModeCommande('livraison')
      modeAppliqueRef.current = true
    }
  }, [livraisonDispo])
  // 3) Sauvegarde l'adresse dès qu'elle a du contenu (jamais d'écrasement à vide).
  useEffect(() => {
    try {
      const { rue, code_postal, ville, complement } = adresseLivraison
      if (rue || code_postal || ville || complement) {
        localStorage.setItem('yoppaa.livraison.adresse', JSON.stringify({ rue, code_postal, ville, complement }))
      }
    } catch { /* ignore */ }
  }, [adresseLivraison])

  const slotsLivraison = joursDisposLivraison.flatMap(j => (j.creneaux || []).map(cr => ({ ...cr, _date: j.date, _jourLabel: j.label })))
  const cpDansZone = !!livraisonConfig?.codes_postaux?.includes((adresseLivraison.code_postal || '').trim())
  const livraisonFormOk = !!(adresseLivraison.rue.trim() && adresseLivraison.code_postal.trim() && adresseLivraison.ville.trim() && cpDansZone && creneauLivraisonChoisi)
  const modeBoutiqueEff = estDetail ? (boutiqueModes.includes(modeBoutique) ? modeBoutique : boutiqueModes[0]) : null

  const cpExpe = (adresseLivraison.code_postal || '').trim()
  const zoneExpe = Array.isArray(commercant?.boutique_expedition_cp) ? commercant.boutique_expedition_cp : []
  const cpExpeOk = zoneExpe.length === 0 || zoneExpe.includes(cpExpe)
  const expeFormOk = !!(adresseLivraison.rue.trim() && cpExpe && adresseLivraison.ville.trim() && cpExpeOk)
  const creneauOk = estDetail
    // ⚠️ `true` EN DUR, c'était le défaut : un retrait était accepté quel que
    // soit le jour. Sans jour ouvert dans les deux semaines, le commerce est en
    // congés et on ne prend pas la commande plutôt que de promettre une date.
    ? (modeBoutiqueEff === 'expedition' ? expeFormOk : !!jourRetraitBoutique)
    : (modeCommande === 'livraison' ? livraisonFormOk : !!creneauChoisi)
  // Mode de la commande qui vient d'être passée (pour l'écran de confirmation étape 4).
  // On lit derniereCommande en priorité (source de vérité) avec repli sur l'état courant.
  const estLivraisonConfirmee = (derniereCommande?.mode_retrait || modeCommande) === 'livraison'
  // Même taxonomie que l'écran de retrait : la confirmation doit dire ce qui va
  // VRAIMENT se passer. Elle annonçait « à ton créneau » aux commandes de
  // boutique, qui n'en ont pas, et envoyait chercher en magasin un colis parti
  // par la poste. Voir lib/ecran-retrait.js.
  //
  // ⚠️ LE CRÉNEAU ÉTAIT LU DANS L'ÉTAT LOCAL, QUI NE SURVIT PAS À STRIPE.
  // Au retour du paiement, la page est remontée : `creneauChoisi` est vide.
  // Le contexte tombait donc sur BOUTIQUE, et une commande de Click & Collect
  // s'entendait dire « tu passes quand ça t'arrange, pendant les heures
  // d'ouverture » alors que son email annonçait un retrait à 17h00 précises.
  // Constaté par Alex le 11/08 sur une commande Kebabistro.
  //
  // La commande RELUE fait foi, et elle porte désormais son créneau.
  const contexteConfirmation = contexteRetrait({
    mode_retrait: derniereCommande?.mode_retrait || modeCommande,
    creneau: derniereCommande?.creneau || (derniereCommande?.creneau_id ? { id: derniereCommande.creneau_id } : null) || creneauChoisi || null,
    commercant: { categorie: commercant?.categorie },
  })
  const confirmation = textesConfirmation(contexteConfirmation, { commercantNom: commercant?.nom })
  const formValide = creneauOk && client.prenom.trim() && client.nom.trim() && client.email.trim() && client.telephone.trim() && rgpdCommande
  const inputSt = { width: '100%', padding: '0.875rem 1rem', border: `1.5px solid ${T.pale}`, borderRadius: 12, marginBottom: 10, fontSize: '1rem', fontFamily: '"DM Sans", sans-serif', boxSizing: 'border-box', outline: 'none', color: T.ink, background: '#fff', display: 'block' }
  const btnPrimary = { width: '100%', padding: '1rem', border: 'none', borderRadius: 100, fontWeight: 800, cursor: 'pointer', fontSize: '1rem', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', boxShadow: `0 6px 24px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }

  const categories = [...new Set(articles.map(a => a.categorie).filter(Boolean))]
  const sansCat = articles.filter(a => !a.categorie)
  const toutesLesCats = [...categories, ...(sansCat.length > 0 ? ['__autres__'] : [])]

  // M5 food truck : l'emplacement du JOUR remplace l'adresse du dépôt sur la
  // fiche. Un ponctuel (date précise) prime sur la tournée hebdo. Fallback :
  // « Prochain emplacement annoncé bientôt » si rien n'est déclaré.
  //
  // ⚠️ LA DÉTECTION VIENT DE `lib/types-commerce.js`, ET C'EST LE FOND DU
  // PROBLÈME. Elle s'écrivait ici `.includes('food truck')`, avec l'espace
  // exigé, alors que le guide photos acceptait « foodtruck » et « food-truck ».
  // Le type n'est pas toujours une valeur de la liste : le commerçant peut le
  // saisir librement. Celui qui tapait « Foodtruck » recevait bien les conseils
  // photo de son métier, mais sa fiche affichait l'adresse de son DÉPÔT au lieu
  // du marché où il se trouvait. Le client se déplaçait au mauvais endroit.
  //
  // ⚠️ CETTE DÉTECTION NE PILOTE PLUS L'AFFICHAGE DES LIEUX, et c'est le progrès
  // du 12/08 : le métier ne dit pas si un commerce bouge. Une professeure de
  // yoga qui donne cours dans deux salles n'est pas un food truck, et a le même
  // besoin. C'est `estItinerant`, qui lit les LIEUX déclarés, qui décide.

  // ⚠️ LA RÉSOLUTION DU LIEU N'EST PLUS RÉSERVÉE AU FOOD TRUCK, et elle ne vit
  // plus ici. Elle est passée dans `lib/lieux-activite.js` le 12/08, parce que
  // trois écrans posent la même question et qu'une divergence entre deux d'entre
  // eux enverrait un client au mauvais endroit sans que rien ne le signale.
  //
  // Ce qu'elle apporte de neuf : une professeure de yoga qui donne cours dans
  // deux salles, et un commerçant inscrit à la BCE à son DOMICILE dont la fiche
  // envoyait ses clients chez lui.
  //
  // ⚠️ `jourLocalISO` et PAS `toISOString()` : minuit heure belge, c'est 22h la
  // veille en temps universel. Entre minuit et deux heures du matin, la fiche
  // cherchait le lieu d'HIER.
  const lieuxAujourdhui = lieuxDuJour({
    commercant,
    lieux: foodtruckEmps,
    jour: jourLocalISO(new Date()),
  })
  // Le premier de la liste est la réponse la plus précise à « où es-tu
  // aujourd'hui » : le ponctuel, sinon la tournée du jour, sinon un lieu fixe.
  const emplacementDuJour = lieuxAujourdhui[0] || null
  // Le commerce bouge-t-il ? La question se lit sur ses lieux, jamais sur son
  // métier : un food truck et une professeure de yoga n'ont pas le même métier
  // mais le même besoin.
  const commerceItinerant = estItinerant(foodtruckEmps)
  // ⚠️ L'ADRESSE AFFICHÉE NE RETOMBE PLUS SUR LE SIÈGE. C'est le même défaut que
  // sur la fiche des services, trouvé par Alex le 15/08 : hors des jours de
  // tournée, `emplacementDuJour` est nul et cet écran affichait
  // `commercant.adresse`, c'est-à-dire l'adresse d'INSCRIPTION. Le module LIEUX
  // l'avait retirée de la lib le matin même ; elle restait en dur dans les deux
  // écrans. La règle vit désormais dans la lib, une seule fois pour les deux.
  const lieuAffiche = lieuAAfficher({ lieux: foodtruckEmps, jour: jourLocalISO(new Date()) })
  const adresseAffichee = lieuAffiche?.adresse || ''

  // Le planning de la semaine, pour un commerce qui bouge : le client doit
  // savoir quand le trouver, pas seulement où il est aujourd'hui.
  const semaineItinerante = commerceItinerant
    ? ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'].map(j => ({
        jour: j,
        lieu: foodtruckEmps.find(e => e.actif !== false && e.type === 'hebdo' && e.jour_semaine === j) || null,
      })).filter(x => x.lieu)
    : []

  function ouvrirMaps() {
    if (!adresseAffichee) return
    const q = encodeURIComponent(adresseAffichee)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    window.open(isIOS ? `maps://maps.apple.com/?q=${q}` : `https://maps.google.com/?q=${q}`, '_blank')
  }
  function appeler() {
    if (!commercant?.telephone) return
    window.open(`tel:${commercant.telephone}`)
  }

  // Plans YOPPAA : single source of truth via lib/plans.js
  // peutCommander = plan Vendre uniquement (active panier + tunnel), toutes
  // catégories : C&C alimentaire, boutique détail ET produits vitrine (31/07).
  // Les plans Exister/Communiquer gardent le catalogue en lecture seule.
  //
  // 🔴 `planEffectif` ET NON `commercant.plan` (26/08). Un commerçant qui
  // active l'essai de Vendre voyait son tableau de bord s'ouvrir et SA FICHE
  // PUBLIQUE CONTINUER DE REFUSER LES COMMANDES : ses clients ne voyaient
  // aucune différence, donc il n'avait rien à goûter. L'essai ne servait à
  // rien là où il devait convaincre.
  //
  // ⚠️ `canDo(planEffectif(...))` ET SURTOUT PAS `peut()`. `peut()` applique la
  // CATÉGORIE, et la matrice réserve `commande` à l'alimentaire alors que
  // cette fiche sert AUSSI le détail et la vitrine : y passer couperait la
  // boutique de tous les commerces de détail en Vendre. La portée ne change
  // pas d'un pouce, seul le forfait lu devient celui qui est en vigueur.
  //
  // ⚠️ Cette lecture a besoin de `essai_plan` ET `created_at` : les deux
  // viennent de la vue `commercants_public` (voir MIGRATION_VUE_PUBLIQUE_ESSAI).
  const vitrine = isVitrine(commercant)
  const forfaitVivant = planEffectif(commercant)
  const peutCommander = canDo(forfaitVivant, 'commande')
  // Module RDV natif : si vitrine FULL avec rdv_actif=true, on propose le bouton "Prendre RDV"
  const peutPrendreRdv = vitrine && canDo(forfaitVivant, 'rdv') && commercant?.rdv_actif === true

  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 CET EFFET EST ICI, ET SA PLACE EST LE CORRECTIF (29/08).
  //
  // Il vivait 428 lignes plus haut, et son tableau de dependances lisait
  // `peutCommander`, declare juste au-dessus. Or UN TABLEAU DE DEPENDANCES
  // EST EVALUE PENDANT LE RENDU : la lecture tombait dans la zone morte
  // temporelle du `const`, levait "Cannot access before initialization", et
  // AUCUNE FICHE COMMERCANT NE S'OUVRAIT. Page blanche, reload, retry.
  //
  // ⚠️ NI LE LINT NI LE BUILD NE LE VOIENT. `no-undef` est satisfait, le nom
  // existe bien dans la portee ; ce n'est ni un import manquant ni une faute
  // de frappe, c'est un ORDRE. Troisieme fois dans ce projet. Garde posee :
  // `npm run verif:zone-morte`.
  //
  // ⚠️ NE PAS LE REMONTER. Il doit rester SOUS `peutCommander`, et au-dessus
  // du `return` : deplace au-dessus, la page redevient blanche.
  // ═══════════════════════════════════════════════════════════════════════
  // ⚠️ ON OBSERVE, ON N'ÉCOUTE PAS LE DÉFILEMENT. `IntersectionObserver` ne
  // s'accroche pas au scroll : c'est la leçon de la zone morte au doigt, où
  // trois jours ont été perdus sur un défilement iOS gêné par du code greffé
  // dessus. Le `root` est le conteneur qui défile, pas la fenêtre.
  useEffect(() => {
    const cible = recapPanierRef.current
    const conteneur = scrollRef.current
    if (!cible || !conteneur || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      ([entree]) => {
        // On lit l'état PRÉCÉDENT pour l'hystérésis, d'où la forme fonctionnelle.
        setMontrerFlottant(avant => doitMontrerFlottant(entree.intersectionRatio, avant))
      },
      // ⚠️ PLUSIEURS SEUILS, sinon le navigateur ne rappelle qu'à un seul point
      // et la bande morte entre les deux valeurs ne serait jamais franchie.
      { root: conteneur, threshold: [0, SEUIL_MONTRER, SEUIL_CACHER, 0.6, 1] },
    )
    obs.observe(cible)
    return () => obs.disconnect()
    // ⚠️ `panier` EST DANS LES DÉPENDANCES : le récap n'existe dans le DOM
    // qu'une fois le premier article ajouté. Sans lui, l'observateur se poserait
    // sur un `null` au premier rendu et ne se reposerait jamais.
  }, [etape, peutCommander, panier])

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; width: 100%; overflow: hidden; }
        body { background: ${T.bg}; font-family: "DM Sans", sans-serif; font-size: 16px; -webkit-text-size-adjust: 100%; }
        /* ⚠️ Le fond de la RACINE aussi : sinon un dépassement laisse voir le
           blanc de globals.css. Voir app/commander/page.js.
           ⚠️ AUCUN ACCENT GRAVE ICI : ce bloc vit dans un gabarit JavaScript,
           et un accent grave y FERME la chaîne. */
        html { background: ${T.bg}; }
        /* Cette page-ci portait DÉJÀ la bonne règle, une hauteur FIXE et non
           minimale : c'est elle qui a servi de modèle aux deux autres le
           04/09. La hauteur minimale nulle sur la zone qui défile complète la
           paire. */
        .page-wrap { display: flex; flex-direction: column; height: 100dvh; max-width: 760px; margin: 0 auto; background: ${T.bg}; overflow: hidden; width: 100%; position: relative; }
        .scroll-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media (min-width: 480px) { .grid3 { grid-template-columns: 1fr 1fr 1fr; } }
        input, textarea, button, select { font-family: "DM Sans", sans-serif; }
        .cat-bar { display: flex; gap: 0; overflow-x: auto; scrollbar-width: none; background: #fff; border-bottom: 1px solid ${T.pale}; }
        .cat-bar::-webkit-scrollbar { display: none; }
        .cat-pill { flex-shrink: 0; padding: 0.75rem 1rem; border: none; background: transparent; font-family: "DM Sans", sans-serif; font-weight: 700; font-size: 0.82rem; cursor: pointer; color: ${T.muted}; border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap; }
        .cat-pill.active { color: ${T.main}; border-bottom-color: ${T.main}; }
        .art-card { transition: box-shadow 0.15s, transform 0.15s; }
        .art-card:hover { box-shadow: 0 6px 24px rgba(107,53,196,0.12) !important; transform: translateY(-1px); }
        /* Hero plus généreux : 240px mobile, 300px tablette+ */
        .fiche-hero { height: 240px; }
        @media (min-width: 600px) { .fiche-hero { height: 300px; } }
        @media (min-width: 900px) { .fiche-hero { height: 340px; } }
        @media (min-width: 800px) {
          .articles-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.625rem; align-items: start; }
          .articles-grid > .art-card { margin-bottom: 0 !important; }
        }
        .action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 0.4rem 0.75rem; border-radius: 100px; border: 1px solid ${T.pale}; background: #fff; color: ${T.ink}; font-weight: 700; font-size: 0.74rem; cursor: pointer; transition: all 0.15s; line-height: 1.1; }
        .action-btn:hover { border-color: ${T.main}; color: ${T.main}; background: ${T.pale}; }
        @keyframes pulse { from { opacity:0.4; transform:scale(0.8); } to { opacity:1; transform:scale(1.2); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes panierPop { from { opacity:0; transform:translateX(-50%) translateY(14px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
        @keyframes shimmer { from { background-position: -200% center; } to { background-position: 200% center; } }
        @keyframes swipePulse { from { transform:scale(0.7) translateY(0); opacity:0.5; } to { transform:scale(1.4) translateY(-4px); opacity:1; } }
        @keyframes swipeArrow { 0%,100% { opacity:0.4; transform:translateX(0); } 50% { opacity:1; transform:translateX(4px); } }
        @keyframes dealGlow {
          0%, 100% { box-shadow: 0 4px 16px rgba(22,6,54,0.2),  0 0 0 0  rgba(196,160,244,0); }
          50%      { box-shadow: 0 6px 28px rgba(22,6,54,0.35), 0 0 0 10px rgba(196,160,244,0.45); }
        }
      `}</style>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Modale détail deal enrichie : photo hero + description longue + badge
          Bonne affaire + CTA transactionnel (Vendre uniquement).
          Fallback header violet si pas de photo (compat deals anciens). */}
      {/* Modal détail article boutique (photos + description + achat) */}
      {articleDetail && (
        <ArticleDetailModal article={articleDetail}
          variantes={variantesParArticle[articleDetail.id] || []}
          photosActives={commercant?.photos_catalogue_actif !== false}
          commercant={commercant}
          social={articleSocial}
          onToggleLike={toggleLikeArticle}
          onPartager={partagerArticle}
          partageEtat={partageEtat}
          onClose={() => setArticleDetail(null)}
          remise={remiseSurArticle(articleDetail, dealsActifs)}
          onAjouter={peutCommander ? (a) => ajouterAuPanier(a) : null}
          onAjouterVariante={peutCommander ? (a, v) => ajouterAuPanier(a, null, v) : null}/>
      )}

      {/* Modale d'achat d'un bon cadeau */}
      {bonModalOuvert && (
        <BonCadeauModal commercant={commercant} validiteMois={bonsCfg?.validite_mois || 12} onClose={() => setBonModalOuvert(false)}/>
      )}

      {dealDetailOuvert && (
        <div onClick={() => setDealDetailOuvert(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeUp 0.2s ease' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: '90svh', display: 'flex', flexDirection: 'column' }}>

            {/* Photo hero enrichie si dispo, sinon en-tête violet fallback */}
            {dealDetailOuvert.photo_url ? (
              <div style={{ position: 'relative', width: '100%', paddingTop: '62%', background: T.pale, flexShrink: 0 }}>
                <img decoding="async" loading="lazy" src={dealDetailOuvert.photo_url} alt={dealDetailOuvert.titre}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
                {/* Overlay gradient bas pour la lisibilité des badges */}
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(22,6,54,0.35) 0%, transparent 30%, transparent 65%, rgba(22,6,54,0.55) 100%)' }}/>
                {/* Badge Deal + Bonne affaire en haut à gauche */}
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(22,6,54,0.65)', padding: '4px 10px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content' }}>
                    <Flame size={11} strokeWidth={2.2}/> Deal
                  </span>
                  {dealDetailOuvert.est_bonne_affaire && (
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#7C2D12', textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(252,211,77,0.95)', padding: '4px 10px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4, width: 'fit-content', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                      <Star size={11} strokeWidth={2.5}/> Bonne affaire
                    </span>
                  )}
                </div>
                {/* Bouton fermer en haut à droite */}
                <button onClick={() => setDealDetailOuvert(null)} aria-label="Fermer"
                  style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(22,6,54,0.65)', border: 'none', borderRadius: '50%', width: 34, height: 34, color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                {/* Titre + prix en overlay bas */}
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 20px', color: '#fff' }}>
                  <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                    {dealDetailOuvert.titre}
                  </h2>
                  {dealDetailOuvert.prix_deal && (
                    <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                      <span style={{ fontWeight: 900, fontSize: '1.6rem', color: '#fff', letterSpacing: '-0.5px', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{euros(Number(dealDetailOuvert.prix_deal))}</span>
                      {dealDetailOuvert.prix_original && (
                        <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.75)', textDecoration: 'line-through', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>{euros(Number(dealDetailOuvert.prix_original))}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, padding: '20px 22px 24px', color: '#fff', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 100, border: '1px solid rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Flame size={11} strokeWidth={2}/> Deal</span>
                    {dealDetailOuvert.est_bonne_affaire && (
                      <span style={{ fontSize: '0.62rem', fontWeight: 800, color: '#7C2D12', textTransform: 'uppercase', letterSpacing: '1.2px', background: '#FCD34D', padding: '4px 10px', borderRadius: 100, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Star size={11} strokeWidth={2.2}/> Bonne affaire</span>
                    )}
                  </div>
                  <button onClick={() => setDealDetailOuvert(null)} aria-label="Fermer"
                    style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0 }}>
                  {dealDetailOuvert.titre}
                </h2>
                {dealDetailOuvert.prix_deal && (
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 12, background: 'rgba(255,255,255,0.1)', padding: '8px 14px', borderRadius: 12 }}>
                    <span style={{ fontWeight: 900, fontSize: '1.6rem', color: T.light, letterSpacing: '-0.5px' }}>{euros(Number(dealDetailOuvert.prix_deal))}</span>
                    {dealDetailOuvert.prix_original && (
                      <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.5)', textDecoration: 'line-through' }}>{euros(Number(dealDetailOuvert.prix_original))}</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Corps blanc scrollable */}
            <div style={{ padding: '18px 22px 22px', overflowY: 'auto', flex: 1 }}>
              {dealDetailOuvert.description && (
                <p style={{ fontSize: '0.9rem', color: T.ink, lineHeight: 1.55, margin: '0 0 14px', fontWeight: 600 }}>
                  {dealDetailOuvert.description}
                </p>
              )}
              {dealDetailOuvert.description_longue && (
                <div style={{ fontSize: '0.88rem', color: T.deep, lineHeight: 1.65, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>
                  {dealDetailOuvert.description_longue}
                </div>
              )}
              {dealDetailOuvert.date_deal && (
                <p style={{ fontSize: '0.78rem', color: T.muted, fontWeight: 600, margin: '0 0 6px' }}>
                  <Calendar size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Valable le {new Date(dealDetailOuvert.date_deal + 'T12:00:00').toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              )}
              {dealDetailOuvert.article_id && (
                <p style={{ fontSize: '0.78rem', color: T.main, fontWeight: 700, margin: '0 0 6px' }}>
                  <Check size={13} strokeWidth={2.4} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/> Appliqué automatiquement à l&rsquo;article concerné dans le menu
                </p>
              )}

              {/* Acheter l'offre, sans avoir à la retrouver dans le catalogue */}
              {dealAchetable(dealDetailOuvert) && (
                <button onClick={() => acheterDeal(dealDetailOuvert)}
                  style={{ width: '100%', marginTop: 14, padding: '0.95rem', border: 'none', borderRadius: 100, background: 'linear-gradient(135deg, #DC2626, #F97316)', color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 6px 20px rgba(220,38,38,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Flame size={16} strokeWidth={2.4}/>
                  {dealDetailOuvert.article_id ? 'J’en profite, au panier' : 'Voir les articles en promo'}
                </button>
              )}

              {/* Bouton "Appeler pour réserver" (héritage Communiquer/Vendre) */}
              {dealDetailOuvert.cta_appeler_reserver && commercant.telephone ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                  <a href={`tel:${commercant.telephone}`}
                    onClick={() => trackDeal(dealDetailOuvert.id, 'cta_click')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0.95rem', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 6px 20px ${T.main}55`, textDecoration: 'none' }}>
                    <Phone size={16} strokeWidth={2.4}/>
                    Appeler pour réserver
                  </a>
                  <button onClick={() => setDealDetailOuvert(null)}
                    style={{ width: '100%', padding: '0.7rem', border: `1.5px solid ${T.pale}`, borderRadius: 100, background: '#fff', color: T.muted, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                    Fermer
                  </button>
                </div>
              ) : dealAchetable(dealDetailOuvert) ? (
                // Le bouton d'achat porte déjà l'action : celui-ci s'efface.
                <button onClick={() => setDealDetailOuvert(null)}
                  style={{ width: '100%', marginTop: 8, padding: '0.7rem', border: `1.5px solid ${T.pale}`, borderRadius: 100, background: '#fff', color: T.muted, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                  Fermer
                </button>
              ) : (
                <button onClick={() => setDealDetailOuvert(null)}
                  style={{ width: '100%', marginTop: 14, padding: '0.875rem', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}55` }}>
                  Compris
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale actu enrichie : photo hero + contenu long. Ouverte au clic
          sur un bandeau actu ayant photo_url ou contenu_long. Symétrique à
          la modale deal. */}
      {actuDetailOuverte && (() => {
        const isAlerte = actuDetailOuverte.type === 'alerte'
        const headerBg = isAlerte
          ? 'linear-gradient(135deg, #7F1D1D, #B91C1C)'
          : `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`
        return (
          <div onClick={() => setActuDetailOuverte(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.7)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeUp 0.2s ease' }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 22, maxWidth: 440, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.35)', overflow: 'hidden', maxHeight: '90svh', display: 'flex', flexDirection: 'column' }}>

              {actuDetailOuverte.photo_url ? (
                <div style={{ position: 'relative', width: '100%', paddingTop: '58%', background: T.pale, flexShrink: 0 }}>
                  <img decoding="async" loading="lazy" src={actuDetailOuverte.photo_url} alt={actuDetailOuverte.titre}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(22,6,54,0.35) 0%, transparent 30%, transparent 60%, rgba(22,6,54,0.7) 100%)' }}/>
                  <div style={{ position: 'absolute', top: 12, left: 12 }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '1.2px', background: isAlerte ? 'rgba(220,38,38,0.9)' : 'rgba(22,6,54,0.65)', padding: '4px 10px', borderRadius: 100 }}>
                      {isAlerte ? 'Alerte' : 'Actualité'}
                    </span>
                  </div>
                  <button onClick={() => setActuDetailOuverte(null)} aria-label="Fermer"
                    style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(22,6,54,0.65)', border: 'none', borderRadius: '50%', width: 34, height: 34, color: '#fff', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '16px 20px', color: '#fff' }}>
                    <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0, textShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                      {actuDetailOuverte.titre}
                    </h2>
                  </div>
                </div>
              ) : (
                <div style={{ background: headerBg, padding: '20px 22px 24px', color: '#fff', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: '0.62rem', fontWeight: 800, color: isAlerte ? '#FCA5A5' : T.light, textTransform: 'uppercase', letterSpacing: '1.2px', background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: 100, border: `1px solid ${isAlerte ? 'rgba(252,165,165,0.4)' : 'rgba(255,255,255,0.2)'}` }}>
                      {isAlerte ? 'Alerte' : 'Actualité'}
                    </span>
                    <button onClick={() => setActuDetailOuverte(null)} aria-label="Fermer"
                      style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 30, height: 30, color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  </div>
                  <h2 style={{ fontWeight: 900, fontSize: '1.35rem', color: '#fff', letterSpacing: '-0.4px', lineHeight: 1.2, margin: 0 }}>
                    {actuDetailOuverte.titre}
                  </h2>
                </div>
              )}

              <div style={{ padding: '18px 22px 22px', overflowY: 'auto', flex: 1 }}>
                {actuDetailOuverte.contenu && (
                  <p style={{ fontSize: '0.9rem', color: T.ink, lineHeight: 1.55, margin: '0 0 14px', fontWeight: 600 }}>
                    {actuDetailOuverte.contenu}
                  </p>
                )}
                {actuDetailOuverte.contenu_long && (
                  <div style={{ fontSize: '0.88rem', color: T.deep, lineHeight: 1.65, margin: '0 0 16px', whiteSpace: 'pre-wrap' }}>
                    {actuDetailOuverte.contenu_long}
                  </div>
                )}
                {(actuDetailOuverte.date_debut || actuDetailOuverte.date_fin) && (
                  <p style={{ fontSize: '0.78rem', color: T.muted, fontWeight: 600, margin: '0 0 6px' }}>
                    <Calendar size={13} strokeWidth={1.8} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: 4 }}/>
                    {actuDetailOuverte.date_fin
                      ? `Jusqu'au ${new Date(actuDetailOuverte.date_fin + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}`
                      : `Depuis le ${new Date(actuDetailOuverte.date_debut + 'T12:00:00').toLocaleDateString('fr-BE', { day: 'numeric', month: 'long' })}`
                    }
                  </p>
                )}
                {/* ─── L'ARTICLE DÉSIGNÉ PAR L'ACTUALITÉ ────────────────────
                    ⚠️ CE BOUTON EST TOUTE LA RAISON D'ÊTRE DU FIL. Sans lui,
                    le commerçant annonce « nos nouvelles pralines sont
                    arrivées » et le Yopper qui a envie d'en acheter doit
                    refermer l'actualité, rouvrir le catalogue et retrouver
                    l'article à la main. Presque personne ne le fait.

                    ⚠️ ET ON NE L'AFFICHE QUE SI L'ARTICLE EST RÉELLEMENT LÀ.
                    Le commerçant a pu le désactiver depuis, ou le retirer de la
                    vente : un bouton qui ne mène à rien est pire que pas de
                    bouton. On cherche donc dans le catalogue CHARGÉ, jamais sur
                    la seule foi de l'identifiant. */}
                {(() => {
                  const cible = actuDetailOuverte.article_id
                    ? (articles || []).find(a => a.id === actuDetailOuverte.article_id)
                    : null
                  if (!cible) return null
                  return (
                    <button onClick={() => { setActuDetailOuverte(null); setArticleDetail(cible) }}
                      style={{ width: '100%', marginTop: 14, padding: '0.8rem 1rem', borderRadius: 14, border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 800, fontSize: '0.88rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}>
                      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Voir&nbsp;: {cible.nom}
                      </span>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M9 6l6 6-6 6"/>
                      </svg>
                    </button>
                  )
                })()}

                <button onClick={() => setActuDetailOuverte(null)}
                  style={{ width: '100%', marginTop: 10, padding: '0.875rem', border: 'none', borderRadius: 100, background: isAlerte ? 'linear-gradient(135deg, #DC2626, #B91C1C)' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.55)' : `0 4px 16px ${T.main}55` }}>
                  Compris
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Modale : confirmation de changement de jour avec panier non vide */}
      {confirmationJour && joursDispos[confirmationJour.nouveauIdx] && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(22,6,54,0.65)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', animation: 'fadeUp 0.2s ease' }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: '1.5rem 1.25rem', maxWidth: 380, width: '100%', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize: '2rem', textAlign: 'center', marginBottom: 12 }}>🗓️</div>
            <p style={{ fontWeight: 900, fontSize: '1.1rem', color: T.ink, textAlign: 'center', marginBottom: 8, letterSpacing: '-0.3px' }}>Changer de jour ?</p>
            <p style={{ fontSize: '0.875rem', color: T.muted, textAlign: 'center', lineHeight: 1.5, marginBottom: 18 }}>
              Tu vas passer à <strong style={{ color: T.deep }}>{joursDispos[confirmationJour.nouveauIdx].label}</strong>. Le stock dépend du jour : ton panier actuel sera vidé.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmationJour(null)}
                style={{ flex: 1, padding: '0.875rem', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.muted, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                Annuler
              </button>
              <button onClick={confirmerChangementJour}
                style={{ flex: 1, padding: '0.875rem', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: `0 4px 16px ${T.main}55` }}>
                Vider et changer
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="page-wrap">

        {/* ── TOPBAR ── */}
        <div style={{ background: T.bgPanel, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, borderBottom: `1px solid ${T.main}33`, position: 'relative' }}>
          {/* Bande 3px canonique YOPPAA (Ink → Main → Light) */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
          <button onClick={() => {
              // Regle globale Alex : bouton Retour selon l'etape courante.
              // Etape 2 (menu+panier) : sortir vers /commander (etape 1 non utilisee pour C&C)
              // Etape 3 (creneau+coords) : revenir a etape 2 (garde le panier)
              // Etape 4 (confirmation post-paiement) : sortir vers /commander (RDV termine)
              // SERVICES (01/08) : le catalogue d'un salon est une ANNEXE de sa
              // fiche RDV. Sortir vers l'accueil donnait l'impression que « la
              // page s'affiche différemment » : on revient sur sa fiche.
              if (etape === 3) { allerEtape(2); setCreneauChoisi(null); setErreurCommande(null); setAjustementStock(null) }
              else if (vitrine && commercant?.slug) { router.push(`/commander/rdv/${commercant.slug}`) }
              else { router.push('/commander') }
            }}
            aria-label="Retour"
            style={{ background: `rgba(255,255,255,0.1)`, border: `1px solid rgba(255,255,255,0.15)`, color: '#fff', cursor: 'pointer', borderRadius: 10, padding: '0.45rem 0.7rem 0.45rem 0.6rem', fontWeight: 700, fontSize: '0.82rem', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
            Retour
          </button>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            {commercant && (
              <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#fff', letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', opacity: 0.9 }}>
                {commercant.nom}
              </span>
            )}
          </div>

          {etape < 4 && peutCommander && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {/* Libellés par monde : « Menu » n'a de sens qu'en alimentaire.
                  Détail et services parlent de Catalogue, et leur 2e étape est
                  le retrait/l'expédition, pas un créneau (décision Alex 01/08). */}
              {[
                { n: 1, label: estDetail ? 'Catalogue' : 'Menu' },
                { n: 2, label: estDetail ? (modeBoutiqueEff === 'expedition' ? 'Expédition' : 'Retrait') : 'Créneau' },
              ].map((s, i) => {
                const target = s.n + 1          // étape 1 -> etape 2, étape 2 -> etape 3
                const done = etape > target
                const active = etape === target
                // Cliquable pour revenir à une étape déjà atteinte (cohérent avec la
                // règle « le Retour ramène à l'étape précédente »). On ne saute jamais
                // vers l'avant : l'avancement reste piloté par le CTA principal.
                const clickable = target < etape
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div
                      onClick={clickable ? () => allerEtape(target) : undefined}
                      role={clickable ? 'button' : undefined}
                      aria-label={clickable ? `Revenir à l'étape ${s.label}` : undefined}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, background: active ? T.main : done ? '#10B98122' : 'rgba(255,255,255,0.08)', border: `1.5px solid ${active ? T.light : done ? '#10B981' : 'rgba(255,255,255,0.15)'}`, borderRadius: 100, padding: '3px 10px', transition: 'all 0.3s', boxShadow: active ? `0 4px 12px ${T.main}44` : 'none', cursor: clickable ? 'pointer' : 'default' }}>
                      <span style={{ width: 16, height: 16, borderRadius: '50%', background: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 900, color: active ? T.main : '#fff', flexShrink: 0 }}>
                        {done ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg> : s.n}
                      </span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: active ? '#fff' : done ? '#10B981' : 'rgba(255,255,255,0.5)' }}>{s.label}</span>
                    </div>
                    {i === 0 && <div style={{ width: 12, height: 1.5, background: etape >= 3 ? '#10B981' : 'rgba(255,255,255,0.15)' }}/>}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── PANIER FLOTTANT ──────────────────────────────────────────────
            Le récap panier est en bas de la page menu, peu découvrable sur mobile
            (retour utilisateur 16/07). Ce bouton flottant montre le nombre d'articles
            + le total et scrolle jusqu'au récap pour confirmer. Visible seulement à
            l'étape Menu quand le panier n'est pas vide. */}
        {/* ⚠️ …ET IL DISPARAÎT DÈS QUE LE RÉCAP EST À L'ÉCRAN (Alex, 28/08) :
            un raccourci vers ce qu'on regarde déjà n'est plus un raccourci,
            il cache le bas de l'écran et il fait hésiter entre deux boutons
            violets. Le pourquoi complet est dans `lib/bouton-flottant.js`. */}
        {etape === 2 && peutCommander && nbArticlesPanier() > 0 && montrerFlottant && (
          <button onClick={scrollVersPanier}
            aria-label="Voir ma commande"
            style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 18, zIndex: 60, width: 'calc(100% - 32px)', maxWidth: 420, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', border: 'none', borderRadius: 100, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontFamily: '"DM Sans", sans-serif', cursor: 'pointer', boxShadow: `0 10px 30px ${T.main}66`, animation: 'panierPop 0.25s ease-out' }}>
            <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
              <span style={{ position: 'absolute', top: -8, right: -10, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 100, background: '#fff', color: T.main, fontSize: '0.68rem', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{nbArticlesPanier()}</span>
            </span>
            <span style={{ fontWeight: 800, fontSize: '0.95rem', flex: 1, textAlign: 'left' }}>Voir ma commande</span>
            <span style={{ fontWeight: 900, fontSize: '1rem', whiteSpace: 'nowrap' }}>{euros(totalPanier())}</span>
          </button>
        )}

        {/* ── SCROLL BODY ── */}
        <div className="scroll-body" ref={scrollRef}>

          {loading && (
            <>
              <SkeletonHeader/>
              <div style={{ padding: '1rem' }}>
                {[1,2,3,4].map(i => <SkeletonArticle key={i}/>)}
              </div>
            </>
          )}

          {/* ÉTAPE 2 - Articles */}
          {/* Fiche non publiée (brouillon, en_attente_validation, refusée) → bloc d'info */}
          {!loading && commercant?._nonPublie && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
              <div style={{ maxWidth: 420, textAlign: 'center', background: '#fff', borderRadius: 18, padding: '32px 28px', border: `1px solid ${T.pale}`, boxShadow: '0 4px 20px rgba(22,6,54,0.08)' }}>
                <div style={{ fontSize: '3rem', marginBottom: 12 }}>🛠️</div>
                <h2 style={{ fontWeight: 900, fontSize: '1.3rem', color: T.ink, letterSpacing: '-0.5px', margin: '0 0 8px' }}>
                  Bientôt en ligne
                </h2>
                <p style={{ fontSize: '0.95rem', color: T.muted, lineHeight: 1.55, margin: '0 0 18px' }}>
                  <strong style={{ color: T.bgPanel }}>{commercant.nom}</strong> finalise son inscription Yoppaa. Cette page sera disponible dès validation par notre équipe.
                </p>
                <button onClick={() => router.push('/commander')}
                  style={{ padding: '10px 22px', borderRadius: 100, border: 'none', background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                  Voir les autres commerces →
                </button>
              </div>
            </div>
          )}

          {!loading && !commercant?._nonPublie && etape === 2 && commercant && (
            <>
              <div ref={headerRef}>

                <div className="fiche-hero" style={{ position: 'relative', overflow: 'hidden' }}>
                  {/* Bande 3px canonique YOPPAA en haut du hero (Ink → Main → Light) */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 3 }}/>
                  {/* Toujours la bannière au nom du commerce, jamais sa photo :
                      décision d'Alex du 05/08. Ses photos vivent plus bas, dans
                      « Mon commerce en images ». */}
                  <BanniereCommerce nom={commercant.nom} />
                  {/* Voile dégradé bas pour finition visuelle */}
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 100, background: 'linear-gradient(to top, rgba(22,6,54,0.5), transparent)' }}/>

                  {/* Boutons overlay haut-droit : Partager + Favoris (pattern TGTG)
                      Partage = viralité organique (crucial scalabilité).
                      Favoris = engagement / retention du yopper. */}
                  <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 5, display: 'flex', gap: 8 }}>
                    <button onClick={partagerFiche} aria-label="Partager la fiche"
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.95)',
                        border: 'none', cursor: 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
                        fontFamily: 'inherit',
                      }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/>
                        <polyline points="16 6 12 2 8 6"/>
                        <line x1="12" y1="2" x2="12" y2="15"/>
                      </svg>
                    </button>
                    <button onClick={toggleFavori} disabled={favoriLoading}
                      aria-label={estFavori ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: 'rgba(255,255,255,0.95)',
                        border: 'none', cursor: favoriLoading ? 'wait' : 'pointer', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.22)',
                        fontFamily: 'inherit',
                        transition: 'transform 0.15s',
                      }}>
                      <svg width="19" height="19" viewBox="0 0 24 24"
                        fill={estFavori ? '#DC2626' : 'none'}
                        stroke={estFavori ? '#DC2626' : T.deep}
                        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Card flottante : logo + type + nom + statut + actions
                    Chevauche le hero photo (marginTop -36) - donc placée JUSTE
                    après le hero pour ne pas recouvrir les bandeaux actus/deal */}
                <div style={{ background: '#fff', margin: '-36px 12px 0', borderRadius: 22, padding: '1.125rem 1.25rem 1rem', boxShadow: `0 12px 36px rgba(22,6,54,0.18), 0 2px 8px ${T.main}22`, border: `1px solid ${T.pale}`, position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, background: commercant.logo_url ? '#fff' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, border: '3px solid #fff', boxShadow: `0 6px 20px rgba(22,6,54,0.22)`, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: -28 }}>
                      {commercant.logo_url
                        ? <img decoding="async" loading="lazy" src={commercant.logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        : <Store size={32} strokeWidth={1.6} color={T.muted}/>
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {commercant.type && (
                        <span style={{ fontSize: '0.6rem', fontWeight: 800, color: T.main, background: T.pale, padding: '3px 9px', borderRadius: 100, display: 'inline-block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {commercant.type}
                        </span>
                      )}
                      <h1 style={{ fontWeight: 900, fontSize: '1.4rem', color: T.ink, letterSpacing: '-0.5px', lineHeight: 1.1, margin: 0 }}>
                        {commercant.nom}
                      </h1>
                    </div>
                  </div>

                  {/* Pills statut : visualisation des features dispo selon plan */}
                  <div style={{ marginTop: 12 }}>
                    <PillsStatut commercant={commercant} dealActif={!!dealActif} actuActive={actualites.length > 0} size="lg"/>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    {/* ⚠️ Sous 3 avis, PAS de moyenne : « 5,0 » sur un seul avis
                        se lit comme une réputation alors que c'est du bruit, et
                        cinq étoiles vides à côté de « Pas encore d'avis » se
                        lisaient comme un ZÉRO sur une fiche toute neuve. */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {resumeNotes.montreMoyenne && (
                        <>
                          <Etoiles note={notesInfo.moyenne} taille={13}/>
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: T.ink }}>
                            {resumeNotes.moyenne}
                          </span>
                        </>
                      )}
                      <span style={{ fontSize: '0.72rem', color: T.muted }}>
                        {resumeNotes.montreMoyenne ? `· ${resumeNotes.libelleNombre}` : resumeNotes.libelleNombre}
                      </span>
                    </div>
                    {/* Statut d'ouverture en TEMPS RÉEL (même logique que les cards
                        d'accueil) : Ouvert/Ferme à X, Ouvre/Ferme bientôt, pauses */}
                    {commercant.horaires_detail && (
                      <PillStatutOuverture horaires={commercant.horaires_detail}/>
                    )}
                  </div>

                  {commercant.description && (
                    <p style={{ fontSize: '0.85rem', color: T.deep, lineHeight: 1.55, margin: '12px 0 0' }}>{commercant.description}</p>
                  )}

                  {/* Infos pratiques du commerçant (annulation, paiement, consignes) */}
                  {commercant.infos_pratiques && (
                    <div style={{ marginTop: 12, background: T.pale, borderRadius: 12, padding: '10px 12px' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Infos pratiques</p>
                      <p style={{ margin: 0, fontSize: '0.78rem', color: T.deep, lineHeight: 1.55, whiteSpace: 'pre-line' }}>{commercant.infos_pratiques}</p>
                    </div>
                  )}

                  {/* Le BOUTON « Offrir un bon cadeau » a migré tout en bas, après
                      le catalogue (Alex, 05/08) : c'est une action de sortie, et
                      proposée ici elle faisait payer pour quelqu'un d'autre avant
                      même qu'on sache ce que vend ce commerce. Le message de
                      retour de paiement, lui, RESTE ici : celui qui revient de sa
                      banque doit le voir sans avoir à faire défiler la page. */}

                  {/* ⚠️ LE BANDEAU DU LIEU DU JOUR N'EST PLUS RÉSERVÉ AU FOOD
                      TRUCK. Il était conditionné au métier, alors qu'une
                      professeure de yoga qui donne cours dans deux salles a
                      exactement le même besoin : dire où elle est aujourd'hui.
                      La condition se lit désormais sur les LIEUX déclarés. */}
                  {commerceItinerant && (
                    emplacementDuJour ? (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, background: T.pale, border: `1.5px solid ${T.main}33`, borderRadius: 12, padding: '9px 12px' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 900, color: T.deep }}>
                            Aujourd&rsquo;hui : {emplacementDuJour.libelle}
                            {emplacementDuJour.heure_debut && emplacementDuJour.heure_fin
                              ? ` · ${emplacementDuJour.heure_debut.slice(0, 5)}–${emplacementDuJour.heure_fin.slice(0, 5)}`
                              : ''}
                          </p>
                          <p style={{ margin: '2px 0 0', fontSize: '0.72rem', fontWeight: 600, color: T.deep, opacity: 0.85 }}>{emplacementDuJour.adresse}</p>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: T.pale, border: `1.5px dashed ${T.main}44`, borderRadius: 12, padding: '9px 12px' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <p style={{ margin: 0, fontSize: '0.76rem', fontWeight: 800, color: T.deep }}>Prochain emplacement annoncé bientôt 🟣</p>
                      </div>
                    )
                  )}

                  {/* La semaine, pour qui bouge. Savoir où il est aujourd'hui ne
                      suffit pas : le client qui consulte un mardi soir veut
                      savoir s'il pourra venir jeudi, et où. */}
                  {semaineItinerante.length > 1 && (
                    <div style={{ marginTop: 8, background: '#fff', border: `1px solid ${T.pale}`, borderRadius: 12, padding: '9px 12px' }}>
                      <p style={{ margin: '0 0 6px', fontSize: '0.66rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Où me trouver cette semaine
                      </p>
                      {/* ⚠️ L'ADRESSE SOUS LE NOM DE LA SALLE (Alex, 16/08).
                          « Salle Respire 1 » dit à une habituée où aller, et
                          absolument rien à quelqu'un qui vient pour la première
                          fois. Le nom reste en tête, il est plus parlant, mais
                          il ne peut pas tenir lieu d'adresse. */}
                      {semaineItinerante.map(({ jour, lieu }) => (
                        <div key={jour} style={{ margin: '0 0 5px' }}>
                          <p style={{ margin: 0, fontSize: '0.74rem', color: T.deep, lineHeight: 1.45 }}>
                            <strong style={{ textTransform: 'capitalize' }}>{jour}</strong> · {lieu.libelle}
                            {lieu.heure_debut && lieu.heure_fin
                              ? ` · ${lieu.heure_debut.slice(0, 5)}–${lieu.heure_fin.slice(0, 5)}`
                              : ''}
                          </p>
                          {lieu.libelle && lieu.adresse && (
                            <p style={{ margin: '1px 0 0', fontSize: '0.7rem', color: T.muted, lineHeight: 1.4 }}>
                              {lieu.adresse}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center', flexWrap: 'nowrap' }}>
                    {/* Un commerce itinérant sans lieu du jour : on masque
                        l'adresse du siège, il n'y est pas. Le bandeau informe. */}
                    {adresseAffichee && !(commerceItinerant && !emplacementDuJour) && (
                      <button className="action-btn" onClick={ouvrirMaps}
                        style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start' }}
                        aria-label={`Ouvrir ${adresseAffichee} dans Maps`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{commerceItinerant ? 'Itinéraire' : adresseAffichee}</span>
                      </button>
                    )}
                    {commercant.telephone && (
                      <button className="action-btn" onClick={appeler} aria-label="Appeler"
                        style={{ flexShrink: 0, background: '#F0FDF4', borderColor: '#10B98133', color: '#10B981' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                        </svg>
                        <span>Appeler</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* ─── Carte de fidélité ────────────────────────────────────
                    Juste sous les informations et les coordonnées du commerce
                    (Alex, 05/08) : elle parle de MA relation avec lui et donne
                    une raison d'acheter AVANT que je voie le catalogue. Plus
                    bas, elle arriverait trop tard. Même position exacte sur la
                    fiche de rendez-vous. */}
                <div style={{ padding: '0 12px' }}>
                  <CarteFideliteFiche commercant={commercant} carte={maCarteFid} connecte={fidConnecte} nbCartes={cartesCeCommerce}/>

                  {/* ⚠️ JUSTE SOUS LA CARTE DE FIDÉLITÉ, et pour la même
                      raison : les deux parlent de MA relation avec ce commerce
                      et donnent une raison d'acheter AVANT le catalogue. Un
                      bon cadeau qu'on découvre après avoir choisi ses articles
                      arrive trop tard pour donner envie. */}
                  <BonCadeauFiche bons={mesBonsIci} categorie={commercant?.categorie}/>

                  {/* 🔴 LE SIGNAL FIDÉLITÉ ÉTAIT ICI, ET IL N'Y EST PLUS.
                      Alex, 26/08 : « on parle fidélité alors que le commerçant
                      est en Communiquer et qu'il a déjà la fidélité comptoir.
                      Les signaux Yopper doivent tous être dans le bas de la
                      page du commerçant. »
                      Un panneau sombre pleine largeur, sous les coordonnées,
                      avant même le catalogue : l'habitant venu voir les
                      horaires se faisait interpeller pour réclamer quelque
                      chose. Les cinq envies vivent maintenant dans UN seul
                      bloc, en bas de fiche : voir `SignauxYopper`. */}

                  {/* Retour d'achat d'un bon cadeau (Stripe success/cancel).
                      Reste EN HAUT alors que le bouton est descendu : celui qui
                      revient de sa banque doit voir l'accusé de réception sans
                      avoir à faire défiler toute la fiche. */}
                  <BonConfirmation etat={bonRetour} bon={bonConfirme} categorie={commercant?.categorie} onContinuer={() => setBonRetour(null)}/>
                </div>

                {/* Toutes les photos, couverture comprise : elle ne sert plus
                    de bandeau, elle ouvre la série. */}
                <GalerieCommerce photos={photosFiche} nomCommerce={commercant.nom} />

                <div style={{ height: 12, background: T.bg }}/>

                {/* Bandeau alertes/actualités (alertes en rouge, prioritaires).
                    Cliquable si l'actu a un contenu enrichi (photo ou contenu_long),
                    sinon rendu simple. */}
                {canDo(planEffectif(commercant), 'actus_illimitees') && actualites.length > 0 && (
                  <div style={{ margin: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {actualites.map(a => {
                      const isAlerte = a.type === 'alerte'
                      const enrichie = !!(a.photo_url || a.contenu_long)
                      const bg = isAlerte ? 'linear-gradient(135deg, #7F1D1D, #B91C1C)' : `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`
                      const contenuInner = (
                        <>
                          <span style={{ fontSize: 10, fontWeight: 800, color: isAlerte ? '#FCA5A5' : T.light, textTransform: 'uppercase', letterSpacing: '0.7px', flexShrink: 0, background: 'rgba(255,255,255,0.1)', padding: '3px 9px', borderRadius: 100, border: `1px solid ${isAlerte ? 'rgba(252,165,165,0.4)' : 'rgba(196,160,244,0.4)'}` }}>
                            {isAlerte ? 'Alerte' : 'Actualité'}
                          </span>
                          <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <p style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fff', margin: 0, lineHeight: 1.3 }}>{a.titre}</p>
                            {a.contenu && <p style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)', margin: '2px 0 0', lineHeight: 1.4 }}>{a.contenu}</p>}
                          </div>
                          {enrichie && (
                            <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', flexShrink: 0, marginLeft: 4 }}>›</span>
                          )}
                        </>
                      )
                      const baseStyle = { background: bg, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, boxShadow: isAlerte ? '0 4px 16px rgba(220,38,38,0.25)' : '0 4px 16px rgba(22,6,54,0.15)', width: '100%' }
                      return enrichie ? (
                        <button key={a.id} onClick={() => setActuDetailOuverte(a)}
                          style={{ ...baseStyle, border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                          {contenuInner}
                        </button>
                      ) : (
                        <div key={a.id} style={baseStyle}>
                          {contenuInner}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Bandeau deal du jour - cliquable pour ouvrir le détail */}
                {canDo(planEffectif(commercant), 'deals') && dealActif && (
                  <div style={{ margin: '0 12px 12px' }}>
                    <button onClick={() => setDealDetailOuvert(dealActif)}
                      style={{ width: '100%', background: `linear-gradient(135deg, ${T.ink}, ${T.deep})`, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderRadius: 14, animation: 'dealGlow 1.8s ease-in-out infinite', border: 'none', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left' }}>
                      <Flame size={20} strokeWidth={2} color={T.light} style={{ flexShrink: 0 }}/>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.65rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '0.7px' }}>Deal du jour</p>
                        <p style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', marginTop: 2, lineHeight: 1.3 }}>{dealActif.titre}</p>
                      </div>
                      {/* Une remise % n'a pas de prix propre : c'est le taux qui
                          accroche l'œil, sinon le bandeau reste muet. */}
                      {dealActif.remise_pct ? (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '1.05rem', fontWeight: 900, color: T.light, letterSpacing: '-0.3px' }}>-{dealActif.remise_pct}%</p>
                        </div>
                      ) : dealActif.prix_deal ? (
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {dealActif.prix_original && <p style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.55)', textDecoration: 'line-through' }}>{euros(Number(dealActif.prix_original))}</p>}
                          <p style={{ fontSize: '1.05rem', fontWeight: 900, color: T.light, letterSpacing: '-0.3px' }}>{euros(Number(dealActif.prix_deal))}</p>
                        </div>
                      ) : null}
                      <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0, marginLeft: 4 }}>›</span>
                    </button>
                  </div>
                )}

                {/* Bouton Prendre RDV - module natif Yoppaa pour vitrine FULL avec rdv_actif */}
                {peutPrendreRdv && (() => {
                  // Le panier PART AVEC le client vers le tunnel de rendez-vous.
                  // Avant, ce bouton était un simple lien : le client mettait
                  // son shampoing, cliquait pour réserver sa coupe, et son
                  // panier disparaissait. Les deux tunnels ne se rejoignaient
                  // jamais, alors que c'est le geste le plus naturel qui soit.
                  const nbPanier = Object.values(panier).reduce((s, i) => s + i.quantite, 0)
                  return (
                  <div style={{ margin: '0 12px 12px' }}>
                    <a href={`/commander/rdv/${commercant.slug}`}
                      onClick={() => deposerPanierPourRdv(commercant.slug, panier)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '14px 18px', borderRadius: 14, background: `linear-gradient(135deg, ${T.bgPanel}, ${T.main})`, color: '#fff', fontWeight: 800, fontSize: '0.95rem', textDecoration: 'none', boxShadow: `0 6px 22px ${T.main}55`, fontFamily: '"DM Sans", sans-serif' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <rect x="3" y="5" width="18" height="16" rx="2"/>
                          <path d="M3 9h18M8 3v4M16 3v4"/>
                        </svg>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {nbPanier > 0 ? 'Prendre RDV et garder mon panier' : 'Prendre rendez-vous'}
                        </span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                      </svg>
                    </a>
                    {nbPanier > 0 && (
                      <p style={{ margin: '6px 2px 0', fontSize: '0.72rem', color: T.muted, lineHeight: 1.45 }}>
                        Tes {nbPanier} article{nbPanier > 1 ? 's' : ''} te suivent : tu paieras tout en une fois et tu repartiras avec le jour de ton rendez-vous.
                      </p>
                    )}
                  </div>
                  )
                })()}

                {/* ⚠️ PAS DE GRILLE D'HORAIRES POUR QUI BOUGE (décision d'Alex,
                    16/08). Le bloc « Où me trouver cette semaine » porte déjà le
                    jour, l'endroit et l'heure : la grille répétait la même
                    information, et la contredisait dès que la déduction depuis
                    les emplacements avait pris du retard. */}
                {commercant.horaires_detail && !commerceItinerant && <HorairesSection horaires={commercant.horaires_detail}/>}

                {/* Mention discrete + signal Yopper si le plan/feature n'est pas active */}
                {!peutCommander && !vitrine && (
                  <div style={{ background: T.pale, borderTop: `1px solid ${T.main}22`, borderBottom: `1px solid ${T.main}22`, padding: '10px 16px', fontSize: 12, color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
                    Envie de commander à l&rsquo;avance&nbsp;? Demandez à <strong style={{ color: T.bgPanel, fontWeight: 800 }}>{commercant.nom}</strong> d&rsquo;activer Yoppaa Click &amp; Collect.
                  </div>
                )}
                {vitrine && !peutPrendreRdv && !peutCommander && (
                  <div style={{ background: T.pale, borderTop: `1px solid ${T.main}22`, borderBottom: `1px solid ${T.main}22`, padding: '10px 16px', fontSize: 12, color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
                    Passe directement à la boutique ou appelle <strong style={{ color: T.bgPanel, fontWeight: 800 }}>{commercant.nom}</strong> pour plus d&rsquo;infos. Tu peux aussi signaler que tu aimerais prendre RDV en ligne.
                  </div>
                )}
              </div>

              {/* Panier rapporté de la fiche rendez-vous : le dire, sinon le
                  client ne sait pas si ses articles l'ont suivi. Symétrique du
                  message affiché dans l'autre sens sur la fiche rendez-vous. */}
              {panierRepris && (() => {
                // Les phrases vivent dans `lib/panier-repris-message.js` : elles
                // s'écrivaient ici avec un pluriel appliqué au seul mot
                // « article », ce qui donnait « Tes 1 article t'ont suivi ».
                const msg = messagePanierRepris({ repris: panierRepris.repris, ignores: panierRepris.ignores, vers: 'boutique' })
                return (
                <div style={{ margin: '10px 16px 0', background: panierRepris.ignores.length > 0 ? '#FFFBEB' : '#ECFDF5', border: `1px solid ${panierRepris.ignores.length > 0 ? '#FDE68A' : '#A7F3D0'}`, borderRadius: 10, padding: '8px 11px' }}>
                  {msg.garde && (
                    <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 700, color: '#065F46', lineHeight: 1.45 }}>
                      {msg.garde}
                    </p>
                  )}
                  {msg.perdus && (
                    <p style={{ margin: msg.garde ? '4px 0 0' : 0, fontSize: '0.72rem', color: '#78350F', lineHeight: 1.45 }}>
                      {msg.perdus}
                    </p>
                  )}
                </div>
                )
              })()}

              {/* ⚠️ CE SÉLECTEUR EST CELUI DE L'ALIMENTAIRE, et il n'était pas
                  masqué en boutique — seul oubli parmi les blocs voisins, qui
                  testent tous `!estDetail`. Construit sur les CRÉNEAUX, qu'une
                  boutique n'a pas, il n'y proposait que « Demain » et ne
                  pilotait rien : la commande partait datée d'aujourd'hui. Il
                  faussait quand même l'affichage des STOCKS, lus au jour
                  affiché plutôt qu'au jour commandé. */}
              {!estDetail && peutCommander && joursDispos.length > 0 && (
                <div style={{ background: '#fff', borderBottom: `1px solid ${T.pale}`, padding: '0.625rem 1rem 0.5rem' }}>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="16" rx="2"/>
                      <path d="M3 9h18M8 3v4M16 3v4"/>
                    </svg>
                    Je récupère le
                  </p>
                  <div data-scroll-x style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                    {joursDispos.map((jour, idx) => {
                      const actif = jourSelectionne === idx
                      const dateStr = jour.date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
                      return (
                        <button key={idx} onClick={() => changerJour(idx)}
                          style={{ flexShrink: 0, padding: '0.4rem 0.875rem', borderRadius: 12, border: `1.5px solid ${actif ? T.main : T.pale}`, background: actif ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: actif ? '#fff' : T.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'center', lineHeight: 1.3, boxShadow: actif ? `0 4px 14px ${T.main}33` : 'none', transition: 'all 0.15s' }}>
                          <div style={{ fontWeight: 800 }}>{jour.label}</div>
                          <div style={{ fontSize: '0.65rem', opacity: actif ? 0.85 : 0.6, marginTop: 1 }}>{dateStr}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ─── Jour de retrait SOUHAITÉ, en boutique de détail ───────
                  Bâti sur les HORAIRES, pas sur des créneaux qui n'existent
                  pas. Le jour même n'apparaît que s'il reste au commerçant le
                  temps de préparer, délai qu'il règle lui-même.
                  ⚠️ Le mot « souhaité » n'est pas une précaution de langage :
                  la commande n'est prête qu'une fois le commerçant l'ayant
                  confirmée, et le client ne doit jamais se déplacer avant. */}
              {estDetail && peutCommander && modeBoutiqueEff === 'retrait' && joursBoutique.length > 0 && (
                <div style={{ background: '#fff', borderBottom: `1px solid ${T.pale}`, padding: '0.625rem 1rem 0.5rem' }}>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="5" width="18" height="16" rx="2"/>
                      <path d="M3 9h18M8 3v4M16 3v4"/>
                    </svg>
                    Je souhaite récupérer le
                  </p>
                  <div data-scroll-x style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
                    {joursBoutique.map((jour, idx) => {
                      const actif = jourBoutiqueChoisi === idx
                      const dateStr = new Date(`${jour.jour}T12:00:00Z`).toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })
                      return (
                        <button key={jour.jour} onClick={() => setJourBoutiqueChoisi(idx)}
                          style={{ flexShrink: 0, padding: '0.4rem 0.875rem', borderRadius: 12, border: `1.5px solid ${actif ? T.main : T.pale}`, background: actif ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: actif ? '#fff' : T.muted, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'center', lineHeight: 1.3, boxShadow: actif ? `0 4px 14px ${T.main}33` : 'none', transition: 'all 0.15s', textTransform: 'capitalize' }}>
                          <div style={{ fontWeight: 800 }}>{jour.label}</div>
                          <div style={{ fontSize: '0.65rem', opacity: actif ? 0.85 : 0.6, marginTop: 1 }}>{dateStr}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {toutesLesCats.length > 1 && (
                <BarreCategories categories={toutesLesCats} scrollRef={scrollRef}
                  headerRef={headerRef} catRefs={catRefs} onChoisir={scrollToCategorie}/>
              )}

              <div style={{ padding: '0.875rem 1rem 0' }}>
                {categories.map((cat, catIdx) => {
                  const artsDecat = articles.filter(a => a.categorie === cat)
                  if (!artsDecat.length) return null
                  // Sous-catégorie « Parent · Enfant » : eyebrow parent affiché
                  // une seule fois par groupe (les cats triées gardent les
                  // enfants d'un même parent adjacents)
                  const sepIdx = cat.indexOf(' · ')
                  const catParent = sepIdx > -1 ? cat.slice(0, sepIdx) : null
                  const catSub = sepIdx > -1 ? cat.slice(sepIdx + 3) : cat
                  const prevParent = catIdx > 0 && categories[catIdx - 1].includes(' · ') ? categories[catIdx - 1].split(' · ')[0] : (catIdx > 0 ? categories[catIdx - 1] : null)
                  const nouveauParent = catParent && catParent !== prevParent
                  return (
                    <div key={cat} ref={el => catRefs.current[cat] = el} style={{ marginBottom: 4 }}>
                      {nouveauParent && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 16 }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1.5px' }}>{catParent}</span>
                          <div style={{ flex: 1, height: 1, background: T.pale }}/>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
                        <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink, letterSpacing: '-0.3px' }}>{catSub}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: T.muted }}>{artsDecat.length} article{artsDecat.length > 1 ? 's' : ''}</span>
                      </div>
                      <div className="articles-grid">
                        {artsDecat.map(a => (
                          <div key={a.id}>
                            <ArticleRow article={a} panier={panier} optionsParArticle={optionsParArticle}
                              ajouterAuPanier={ajouterAuPanier} retirerDuPanier={retirerDuPanier} qteTotaleArticle={qteTotaleArticle}
                              stocksJour={stocksJour} jourSelectionne={jourSelectionne} joursDispos={joursDispos} jourRetrait={estDetail ? jourRetraitBoutique : null}
                              onCommanderDemain={commanderPourJour}
                              getStockMax={getStockMax} commandesParArticleJour={commandesParArticleJour} modeVitrine={!peutCommander} masquerPrix={!canDo(planEffectif(commercant), 'prix_affiches')}
                              photoUrl={commercant?.photos_catalogue_actif === false ? null : (a.photo_url || null)}
                              variantes={variantesParArticle[a.id] || []}
                              remise={remiseSurArticle(a, dealsActifs)}
                              onOpenDetail={() => setArticleDetail(a)}/>
                            {/* Lots et duos seulement : une remise vit sur la carte de l'article */}
                            {peutCommander && offresSepareesPourArticle(a, dealsActifs).filter(dl => dl.prix_deal != null).map(dl => (
                              <DealOfferCard key={dl.id} deal={dl}
                                qte={panier[`deal_${dl.id}`]?.quantite || 0}
                                onAjouter={() => ajouterDealAuPanier(dl, a)}
                                onRetirer={() => retirerDuPanier(`deal_${dl.id}`)}/>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}

                {sansCat.length > 0 && (
                  <div ref={el => catRefs.current['__autres__'] = el} style={{ marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 10 }}>
                      <span style={{ fontWeight: 900, fontSize: '1rem', color: T.ink }}>Autres</span>
                    </div>
                    <div className="articles-grid">
                      {sansCat.map(a => (
                        <div key={a.id}>
                          <ArticleRow article={a} panier={panier} optionsParArticle={optionsParArticle}
                            ajouterAuPanier={ajouterAuPanier} retirerDuPanier={retirerDuPanier} qteTotaleArticle={qteTotaleArticle}
                            stocksJour={stocksJour} jourSelectionne={jourSelectionne} joursDispos={joursDispos} jourRetrait={estDetail ? jourRetraitBoutique : null}
                            onCommanderDemain={commanderPourJour}
                            getStockMax={getStockMax} commandesParArticleJour={commandesParArticleJour} modeVitrine={!peutCommander} masquerPrix={!canDo(planEffectif(commercant), 'prix_affiches')}
                            photoUrl={commercant?.photos_catalogue_actif === false ? null : (a.photo_url || null)}
                            variantes={variantesParArticle[a.id] || []}
                            remise={remiseSurArticle(a, dealsActifs)}
                            onOpenDetail={() => setArticleDetail(a)}/>
                          {peutCommander && offresSepareesPourArticle(a, dealsActifs).filter(dl => dl.prix_deal != null).map(dl => (
                            <DealOfferCard key={dl.id} deal={dl}
                              qte={panier[`deal_${dl.id}`]?.quantite || 0}
                              onAjouter={() => ajouterDealAuPanier(dl, a)}
                              onRetirer={() => retirerDuPanier(`deal_${dl.id}`)}/>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {avisCommerce.length > 0 && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: `1px solid ${T.pale}` }}>
                    {/* ⚠️ REPLIÉ PAR DÉFAUT (demande d'Alex) : la note globale
                        tient sur une ligne, et le Yopper décide s'il veut lire.
                        Le bouton dit le GESTE (« Lire les 12 avis », « Masquer »),
                        jamais l'état. */}
                    <button onClick={() => setAvisDeplies(d => !d)}
                      aria-expanded={avisDeplies}
                      style={{
                        width: '100%', background: 'none', border: 'none', padding: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        gap: 10, cursor: 'pointer', textAlign: 'left',
                      }}>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: T.deep, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.deep} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26"/>
                        </svg>
                        Avis clients
                        {resumeNotes.montreMoyenne && (
                          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: T.main }}>{resumeNotes.moyenne}</span>
                        )}
                      </span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.78rem', fontWeight: 700, color: T.main, flexShrink: 0 }}>
                        {libelleBascule(resumeNotes, avisDeplies)}
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
                          style={{ transition: 'transform 0.2s', transform: avisDeplies ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                          <path d="M6 9l6 6 6-6"/>
                        </svg>
                      </span>
                    </button>
                    {avisDeplies && (
                      <div style={{ marginTop: '0.75rem' }}>
                        {avisCommerce.map(a => <CarteAvis key={a.id} a={a}/>)}
                        {/* Un élément écarté se montre AVEC SA RAISON : la fiche
                            ne charge que les 10 derniers avis, il faut le dire
                            plutôt que de laisser croire qu'il n'y a que ça. */}
                        {notesInfo.count > avisCommerce.length && (
                          <p style={{ fontSize: '0.72rem', color: T.muted, margin: '4px 2px 0' }}>
                            Les {avisCommerce.length} avis les plus récents, sur {notesInfo.count} au total.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* RecapPanier : uniquement si la formule ouvre la commande */}
                {peutCommander && (
                  <div ref={recapPanierRef}>
                    <RecapPanier
                      panier={panier}
                      onRetirer={retirerDuPanier}
                      onAjouter={incrementerPanier}
                      total={totalPanier()}
                      onValider={() => allerEtape(3)}
                      getStockMax={getStockMax}
                      labelValider={estDetail
                        ? (boutiqueModes.length > 1
                            ? 'Continuer : retrait ou expédition'
                            : boutiqueModes[0] === 'expedition' ? 'Continuer vers l’expédition' : 'Continuer vers le retrait')
                        : 'Choisir mon heure de retrait'}
                      noteSousTotal={(() => {
                        // Upsell port offert (boutique expédition) : montant restant
                        if (!estDetail || !boutiqueModes.includes('expedition')) return null
                        const seuil = Number(commercant?.boutique_gratuit_des || 0)
                        if (!seuil) return null
                        const restant = seuil - totalPanier()
                        if (restant <= 0) return 'Frais de port offerts sur l’expédition 🟣'
                        return `Plus que ${euros(restant)} pour l’expédition offerte`
                      })()}
                    />
                  </div>
                )}

                {/* 🔴 LES TROIS AUTRES BANDEAUX ÉTAIENT ICI. Chacun avec sa
                    condition écrite dans le JSX, aucune avec la même forme, et
                    rien pour empêcher qu'ils s'affichent tous les trois à la
                    suite en répétant trois fois le même titre. La règle vit
                    maintenant dans `enviesProposables`, et le bloc unique est
                    plus bas. */}

                {/* ─── Offrir un bon cadeau ─────────────────────────────────
                    APRÈS le catalogue (Alex, 05/08). On offre un bon quand on a
                    compris ce que fait ce commerce, pas avant. Même place sur la
                    fiche de rendez-vous : les deux fiches se répondent. */}
                {bonsCfg?.actif && (
                  <div style={{ padding: '0 12px', marginTop: 20 }}>
                    <button onClick={() => setBonModalOuvert(true)}
                      style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderRadius: 14, border: `1.5px solid ${T.main}33`, background: `linear-gradient(135deg, ${T.pale}, #fff)`, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/>
                        </svg>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontWeight: 800, fontSize: '0.88rem', color: T.ink }}>Offrir un {nomBon}</span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: T.muted, fontWeight: 600, marginTop: 1 }}>Montant libre, envoyé par email, valable {bonsCfg.validite_mois} mois</span>
                        </span>
                      </span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M9 6l6 6-6 6"/></svg>
                    </button>
                  </div>
                )}

                {/* ─── CE QUI MANQUE, DIT EN UN CLIC ────────────────────────
                    🔴 « Les signaux Yopper doivent tous être dans le bas de la
                    page du commerçant, phrase simple, claire et efficace »
                    (Alex, 26/08).
                    ⚠️ ICI ET NULLE PART AILLEURS, et après le catalogue : on
                    ne demande à quelqu'un ce qui lui manque qu'une fois qu'il
                    a vu ce qu'il y a. Avant la bande « autour de toi », qui
                    est le bouton de sortie de la fiche. */}
                <SignauxYopper
                  types={enviesProposables(commercant, { peutCommander })}
                  commercant={commercant}
                />

                {/* ─── « Tous les commerces autour de toi » ──────────────────
                    Beaucoup de Yoppers arrivent ici SANS passer par l'accueil :
                    un QR sur une vitrine, un lien reçu par message. Ils voient
                    un commerce et repartent, sans jamais apprendre que Yoppaa
                    porte toute la commune. La bande dit le concept là où il a
                    de la valeur, à la fin de la fiche, une fois la commande
                    faite ou le catalogue lu, jamais avant le panier. */}
                <BandeAutourDeToi onVoir={() => router.push('/commander')}/>

                {/* Lien discret de signalement en bas de fiche */}
                <div style={{ marginTop: 28, padding: '0 0 12px', textAlign: 'center' }}>
                  {signalementSent ? (
                    <p style={{ fontSize: 12, color: '#10B981', fontWeight: 700, margin: 0 }}>
                      ✓ Merci, signalement enregistré
                    </p>
                  ) : (
                    <button onClick={() => setShowSignalement(true)}
                      style={{ background: 'none', border: 'none', color: T.muted, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', textDecoration: 'underline', textDecorationColor: T.pale, textUnderlineOffset: 3 }}>
                      Signaler un problème sur cette fiche
                    </button>
                  )}
                </div>

                <div style={{ height: 24 }}/>
              </div>
            </>
          )}

          {/* ÉTAPE 3 - Créneau + coordonnées : pattern hero canonique */}
          {!loading && etape === 3 && commercant && (
            <div>
              <div style={{ background: `linear-gradient(160deg, ${T.bgPanel} 0%, ${T.deep} 50%, ${T.main} 100%)`, padding: '0.875rem 1rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
                {/* Bande 3px canonique YOPPAA */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)`, zIndex: 2 }}/>
                <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.mid}44 0%, transparent 55%), radial-gradient(circle at 10% 90%, ${T.light}14 0%, transparent 50%)`, pointerEvents: 'none' }}/>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[
                      { c: '#fff',  o: 0.5, delay: '0s',   size: 5 },
                      { c: T.light, o: 1,   delay: '0.3s', size: 6 },
                      { c: T.mid,   o: 1,   delay: '0.6s', size: 5 },
                    ].map((d, i) => (
                      <div key={i} style={{ width: d.size, height: d.size, borderRadius: '50%', background: d.c, opacity: d.o, boxShadow: `0 0 8px ${d.c}aa`, animation: `dot-pulse 2s ease-in-out ${d.delay} infinite` }}/>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.light, textTransform: 'uppercase', letterSpacing: '2px', margin: 0, opacity: 0.85 }}>Étape 2 · {commercant.nom}</p>
                </div>
                {/* ⚠️ « CHOISIS TON CRÉNEAU » S'AFFICHAIT SUR UNE BOUTIQUE, qui
                    n'en a aucun. Le titre suit maintenant ce que le client a
                    réellement à faire : un créneau en alimentaire, une adresse
                    pour un colis, rien de plus qu'un retrait en boutique. */}
                <h2 style={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.6px', margin: 0, lineHeight: 1.1, position: 'relative' }}>
                  {estDetail ? (
                    modeBoutiqueEff === 'expedition' ? (
                      <>
                        <span style={{ color: '#fff' }}>Où t&rsquo;envoyer ton </span>
                        <span style={{ color: T.light }}>colis</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: '#fff' }}>Ton </span>
                        <span style={{ color: T.light }}>retrait</span>
                      </>
                    )
                  ) : (
                    <>
                      <span style={{ color: '#fff' }}>Choisis ton </span>
                      <span style={{ color: T.light }}>créneau</span>
                    </>
                  )}
                </h2>
              </div>

              <div style={{ padding: '0 1rem 1rem', marginTop: -1 }}>
                <div style={{ background: '#fff', borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1.25rem', border: `1.5px solid ${T.pale}`, boxShadow: `0 4px 20px ${T.main}14`, marginTop: '-1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3h2l2.4 11.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L22 7H6"/>
                        <circle cx="9" cy="20" r="1.5"/>
                        <circle cx="18" cy="20" r="1.5"/>
                      </svg>
                      Ta commande
                    </span>
                    <div style={{ flex: 1, height: 1, background: T.pale }}/>
                  </div>
                  {Object.values(panier).map((item, i) => {
                    const supplement = item.options ? Object.values(item.options).flat().reduce((s, v) => s + (v.prix_supplement||0), 0) : 0
                    return (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}>
                        <span style={{ color: T.ink, fontWeight: 600 }}>{item.quantite}× {item.nom}</span>
                        <span style={{ color: T.main, fontWeight: 800 }}>{euros(((item.prix + supplement) * item.quantite))}</span>
                      </div>
                    )
                  })}
                  {(modeCommande === 'livraison' || (estDetail && modeBoutiqueEff === 'expedition')) && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginTop: 6, color: T.deep }}>
                        <span style={{ fontWeight: 600 }}>{estDetail ? 'Frais de port' : 'Frais de livraison'}</span>
                        <span style={{ fontWeight: 800 }}>{fraisLivraison() === 0 ? 'Offerts' : `+${euros(fraisLivraison())}`}</span>
                      </div>
                      {livraisonConfig?.gratuit_des != null && (
                        fraisLivraison() > 0
                          ? <p style={{ fontSize: '0.72rem', color: T.main, fontWeight: 700, margin: '4px 0 0' }}>Plus que {euros((Number(livraisonConfig.gratuit_des) - totalPanier()))} pour la livraison offerte</p>
                          : <p style={{ fontSize: '0.72rem', color: '#059669', fontWeight: 700, margin: '4px 0 0' }}>Livraison offerte à partir de {euros(Number(livraisonConfig.gratuit_des))}</p>
                      )}
                    </>
                  )}
                  <div style={{ borderTop: `1px solid ${T.pale}`, marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: T.muted, fontSize: '0.82rem' }}>Total</span>
                    <span style={{ fontWeight: 900, color: T.ink, fontSize: '1.1rem' }}>{euros(totalAvecFrais())}</span>
                  </div>
                  {/* ⚠️ LA RÉCOMPENSE EST UNE LIGNE À PART, JAMAIS FONDUE DANS
                      LE BON CADEAU. Ce sont deux natures d'avantage : l'une
                      est offerte par le commerçant, l'autre a été payée par
                      quelqu'un. Les additionner sur une seule ligne
                      empêcherait le Yopper de savoir ce qu'il vient de
                      dépenser de sa carte. */}
                  {remiseRecompenseEffective() > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <span style={{ fontWeight: 700, color: T.main, fontSize: '0.82rem' }}>Récompense fidélité</span>
                      <span style={{ fontWeight: 800, color: T.main, fontSize: '0.9rem' }}>−{euros(remiseRecompenseEffective())}</span>
                    </div>
                  )}
                  {bonsAppliques.length > 0 && remiseBonEffective() > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      {/* ⚠️ ON NOMME LES CODES, PAS « 3 bons » : le Yopper doit
                          pouvoir rapprocher la ligne de ce qu'il a en main. */}
                      <span style={{ fontWeight: 700, color: '#10B981', fontSize: '0.82rem' }}>{bonsAppliques.length > 1 ? libelleBon(commercant?.categorie, { pluriel: true, majuscule: true }) : libelleBon(commercant?.categorie, { majuscule: true })} ({bonsAppliques.map(b => b.code).join(', ')})</span>
                      <span style={{ fontWeight: 800, color: '#10B981', fontSize: '0.9rem' }}>−{euros(remiseBonEffective())}</span>
                    </div>
                  )}
                  {(remiseRecompenseEffective() > 0 || (bonsAppliques.length > 0 && remiseBonEffective() > 0)) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                      <span style={{ fontWeight: 800, color: T.ink, fontSize: '0.82rem' }}>Reste à payer</span>
                      <span style={{ fontWeight: 900, color: T.main, fontSize: '1.1rem' }}>{euros(totalDuApresBon())}</span>
                    </div>
                  )}
                </div>

                {/* ─── Boutique détail : retrait libre / expédition, pas de créneau ─── */}
                {estDetail && (
                  <>
                    {boutiqueModes.length > 1 && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
                        {[{ v: 'retrait', label: vitrine ? 'Retrait sur place' : 'Retrait en boutique' }, { v: 'expedition', label: 'Expédition' }].map(m => (
                          <button key={m.v} onClick={() => { setModeBoutique(m.v); setErreurCommande(null) }}
                            style={{ flex: 1, padding: '0.7rem', borderRadius: 12, border: `2px solid ${modeBoutiqueEff === m.v ? T.main : T.pale}`, background: modeBoutiqueEff === m.v ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: modeBoutiqueEff === m.v ? '#fff' : T.ink, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {modeBoutiqueEff === 'retrait' ? (
                      <div style={{ background: jourRetraitBoutique ? T.pale : '#FEF2F2', border: `1.5px solid ${jourRetraitBoutique ? `${T.main}33` : '#DC262633'}`, borderRadius: 14, padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
                        {/* ⚠️ ON DIT LA DATE AVANT DE PAYER. L'écran annonçait un
                            retrait « aux heures d'ouverture » sans jamais regarder
                            LESQUELLES : un dimanche, le client commandait en
                            croyant passer le jour même. */}
                        {!jourRetraitBoutique ? (
                          <p style={{ fontSize: '0.82rem', color: '#991B1B', fontWeight: 700, lineHeight: 1.5, margin: 0 }}>
                            {commercant?.nom} est fermé pour le moment et ne reprend pas les retraits dans les deux prochaines semaines. Reviens un peu plus tard 🟣
                          </p>
                        ) : (
                        // ⚠️ « À RÉCUPÉRER DÈS AUJOURD'HUI » ÉTAIT UNE PROMESSE
                        // QUE PERSONNE NE TENAIT. La commande n'est prête que
                        // lorsque le commerçant l'a préparée et l'a marquée
                        // comme telle : le client pouvait se présenter dans la
                        // demi-heure et repartir les mains vides.
                        // Décision d'Alex : le jour est SOUHAITÉ, le commerçant
                        // confirme, et on le dit franchement.
                        <>
                        <p style={{ fontSize: '0.82rem', color: T.deep, fontWeight: 600, lineHeight: 1.5, margin: 0 }}>
                          <strong style={{ color: T.main }}>
                            {retraitAujourdhui
                              ? 'Retrait souhaité aujourd’hui'
                              : `Retrait souhaité ${dateLisibleFr(jourRetraitBoutique)}`}
                          </strong>{' '}
                          {vitrine ? 'sur place' : 'en boutique'}, aux heures d&rsquo;ouverture.
                          {commercant?.boutique_retrait_paiement === 'magasin' ? ' Tu paies au comptoir, au retrait.' : ''}
                        </p>
                        <p style={{ fontSize: '0.78rem', color: T.muted, fontWeight: 600, lineHeight: 1.45, margin: '6px 0 0' }}>
                          {commercant?.nom} prépare ta commande et te prévient dès qu&rsquo;elle t&rsquo;attend. <strong style={{ color: T.deep }}>Ne te déplace pas avant.</strong>
                        </p>
                        </>
                        )}
                      </div>
                    ) : (
                      <div style={{ background: '#fff', borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1.25rem', border: `1.5px solid ${T.pale}` }}>
                        <p style={{ fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Adresse d&rsquo;expédition</p>
                        {/* ⚠️ LA MÊME SAISIE QU'EN LIVRAISON, ET C'EST VOULU. Un
                            colis ne se géolocalise pas, mais une adresse choisie
                            dans une liste est une adresse qui EXISTE : c'est ce
                            qui évite le paquet renvoyé pour numéro introuvable.
                            Deux saisies d'adresse différentes dans le même
                            tunnel finiraient par diverger. */}
                        <ChampAdresse
                          valeur={adresseLivraison.rue}
                          position={{ latitude: adresseLivraison.lat, longitude: adresseLivraison.lng }}
                          onTexte={v => majAdresse({ rue: v })}
                          onChoisir={choisirAdresse}
                          placeholder="Rue et numéro"
                          style={inputSt}
                          couleurs={{ hairline: T.pale, deep: T.ink, muted: T.muted }}
                        />
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input value={adresseLivraison.code_postal} onChange={e => majAdresse({ code_postal: e.target.value.replace(/\D/g, '').slice(0,4) })} inputMode="numeric" placeholder="Code postal" style={{ ...inputSt, flex: '0 0 40%' }} />
                          <input value={adresseLivraison.ville} onChange={e => majAdresse({ ville: e.target.value })} placeholder="Ville" style={{ ...inputSt, flex: 1 }} />
                        </div>
                        <input value={adresseLivraison.complement} onChange={e => majAdresse({ complement: e.target.value })} placeholder="Boîte, étage... (optionnel)" style={inputSt} />
                        {cpExpe && !cpExpeOk && (
                          <p style={{ fontSize: '0.78rem', color: '#DC2626', fontWeight: 700, margin: '2px 0 0' }}>Ce code postal n&rsquo;est pas desservi par l&rsquo;expédition.</p>
                        )}
                        <NoteLivraison
                          valeur={adresseLivraison.note}
                          onChange={v => setAdresseLivraison(p => ({ ...p, note: v }))}
                          localisee={Number.isFinite(adresseLivraison.lat)}
                          aSaisiUneRue={!!adresseLivraison.rue.trim()}
                          expedition
                        />
                        <p style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 600, margin: '8px 0 0' }}>
                          Envoi préparé par le commerçant, numéro de suivi communiqué dès l&rsquo;expédition.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* Sélecteur retrait / livraison (si le commerce propose la livraison) */}
                {!estDetail && livraisonDispo && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
                    {[{ v: 'retrait', label: 'Retrait' }, { v: 'livraison', label: 'Livraison' }].map(m => (
                      <button key={m.v} onClick={() => { setModeCommande(m.v); modeAppliqueRef.current = true; try { localStorage.setItem('yoppaa.commande.mode', m.v) } catch { /* ignore */ } setErreurCommande(null) }}
                        style={{ flex: 1, padding: '0.7rem', borderRadius: 12, border: `2px solid ${modeCommande === m.v ? T.main : T.pale}`, background: modeCommande === m.v ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: modeCommande === m.v ? '#fff' : T.ink, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Adresse de livraison */}
                {!estDetail && modeCommande === 'livraison' && (
                  <div style={{ background: '#fff', borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1.25rem', border: `1.5px solid ${T.pale}` }}>
                    <p style={{ fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>Adresse de livraison</p>
                    {/* ⚠️ CHOISIR DANS LA LISTE EST LE SEUL CHEMIN QUI DONNE DES
                        COORDONNÉES, et c'est ce qui permet au commerçant de
                        calculer sa tournée. Taper à la main reste possible :
                        une vente ne se refuse pas parce qu'un moteur de
                        géocodage ne connaît pas une rue neuve. */}
                    <ChampAdresse
                      valeur={adresseLivraison.rue}
                      position={{ latitude: adresseLivraison.lat, longitude: adresseLivraison.lng }}
                      onTexte={v => majAdresse({ rue: v })}
                      onChoisir={choisirAdresse}
                      placeholder="Rue et numéro"
                      style={inputSt}
                      couleurs={{ hairline: T.pale, deep: T.ink, muted: T.muted }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={adresseLivraison.code_postal} onChange={e => majAdresse({ code_postal: e.target.value.replace(/\D/g, '').slice(0,4) })} inputMode="numeric" placeholder="Code postal" style={{ ...inputSt, flex: '0 0 40%' }} />
                      <input value={adresseLivraison.ville} onChange={e => majAdresse({ ville: e.target.value })} placeholder="Ville" style={{ ...inputSt, flex: 1 }} />
                    </div>
                    <input value={adresseLivraison.complement} onChange={e => majAdresse({ complement: e.target.value })} placeholder="Étage, digicode... (optionnel)" style={inputSt} />
                    {adresseLivraison.code_postal.trim() && !cpDansZone && (
                      <p style={{ fontSize: '0.78rem', color: '#DC2626', fontWeight: 700, margin: '2px 0 0' }}>Ce code postal n&rsquo;est pas dans la zone de livraison.</p>
                    )}
                    <NoteLivraison
                      valeur={adresseLivraison.note}
                      onChange={v => setAdresseLivraison(p => ({ ...p, note: v }))}
                      localisee={Number.isFinite(adresseLivraison.lat)}
                      aSaisiUneRue={!!adresseLivraison.rue.trim()}
                    />
                  </div>
                )}

                {!estDetail && modeCommande === 'retrait' && (<>
                {/* Jour verrouille - choisi a l'etape 2 (menu) */}
                {joursDispos[jourSelectionne] && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: '1rem', background: T.pale, border: `1.5px solid ${T.main}33`, borderRadius: 14, padding: '0.625rem 0.875rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: `1.5px solid ${T.main}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="5" width="18" height="16" rx="2"/>
                          <path d="M3 9h18M8 3v4M16 3v4"/>
                        </svg>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: '0.62rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Retrait</p>
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: T.deep, letterSpacing: '-0.3px', margin: 0 }}>
                          {joursDispos[jourSelectionne].label} <span style={{ color: T.muted, fontWeight: 600, fontSize: '0.82rem' }}>· {joursDispos[jourSelectionne].date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' })}</span>
                        </p>
                      </div>
                    </div>
                    <button onClick={() => { allerEtape(2); setCreneauChoisi(null); setErreurCommande(null); setAjustementStock(null) }}
                      style={{ background: '#fff', border: `1.5px solid ${T.main}`, color: T.main, fontWeight: 700, fontSize: '0.72rem', padding: '0.4rem 0.875rem', borderRadius: 100, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                      Changer
                    </button>
                  </div>
                )}

                {/* Section header creneaux */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 6v6l4 2"/>
                    </svg>
                    Horaires de retrait
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>

                <div className="grid3" style={{ marginBottom: '1.5rem' }}>
                  {[...new Map(
                    creneauxProposables()
                      .map(c => [`${c.heure_debut}-${c.heure_fin}`, c])
                  ).values()].map(c => {
                    // Capacité créneau factorisée dans lib/creneaux.js (partagée C&C + livraison)
                    const creneauxTries = joursDispos[jourSelectionne]?.creneaux || creneaux
                    const idxCourant = creneauxTries.findIndex(x => x.id === c.id)
                    const { complet, bientot, presque } = calculerCapaciteCreneau(c, {
                      modeCapaciteDefaut: commercant?.mode_capacite,
                      creneauPrecedent: idxCourant > 0 ? creneauxTries[idxCourant - 1] : null,
                    })
                    const choisi = creneauChoisi === c.id
                    return (
                      <div key={c.id} onClick={() => { if (!complet) { setCreneauChoisi(c.id); setErreurCommande(null); setAjustementStock(null) } }}
                        style={{
                          position: 'relative',
                          padding: '0.75rem 0.5rem',
                          borderRadius: 14,
                          border: `2px solid ${complet ? '#E5E7EB' : choisi ? T.main : T.pale}`,
                          background: complet ? '#F9FAFB' : choisi ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff',
                          cursor: complet ? 'default' : 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s',
                          boxShadow: choisi ? `0 8px 22px ${T.main}55` : 'none',
                          overflow: 'hidden',
                        }}
                        onMouseOver={e => { if (!complet && !choisi) { e.currentTarget.style.borderColor = T.main + '88'; e.currentTarget.style.transform = 'translateY(-1px)' } }}
                        onMouseOut={e => { if (!complet && !choisi) { e.currentTarget.style.borderColor = T.pale; e.currentTarget.style.transform = 'translateY(0)' } }}>
                        {/* Check overlay coin haut droit quand choisi */}
                        {choisi && (
                          <span style={{ position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                          </span>
                        )}
                        <p style={{ fontWeight: 800, fontSize: '0.95rem', color: complet ? '#D1D5DB' : choisi ? '#fff' : T.ink, textDecoration: complet ? 'line-through' : 'none', letterSpacing: '-0.3px', margin: 0, lineHeight: 1.1 }}>
                          {c.heure_debut.slice(0,5)} – {c.heure_fin.slice(0,5)}
                        </p>
                        {/* Mention etat : SVG + texte, harmonise */}
                        {complet && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 800, color: '#DC2626', marginTop: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="10"/>
                              <path d="M15 9l-6 6M9 9l6 6"/>
                            </svg>
                            Complet
                          </span>
                        )}
                        {bientot && !complet && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 800, color: choisi ? '#fff' : '#EA580C', marginTop: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill={choisi ? '#FB923C' : '#FB923C'} stroke={choisi ? '#FB923C' : '#FB923C'} strokeWidth="0.5"><path d="M12 2c1 3 3 4 3 7 0 1.5-1 3-3 3s-3-1.5-3-3c0-2 2-3 3-7zm-5 9c-1 0-3 2-3 6 0 4 3 5 8 5s8-1 8-5c0-4-2-6-3-6 0 3-2 5-5 5s-5-2-5-5z"/></svg>
                            Dernière place
                          </span>
                        )}
                        {presque && !complet && !bientot && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.62rem', fontWeight: 800, color: choisi ? '#fff' : '#D97706', marginTop: 5 }}>
                            <svg width="9" height="9" viewBox="0 0 24 24" fill={choisi ? '#FBBF24' : '#FBBF24'} stroke={choisi ? '#FBBF24' : '#FBBF24'} strokeWidth="0.5"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
                            Presque complet
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {/* Le message d'absence se mesure sur la liste RÉELLEMENT
                      proposée : la grille pouvait n'afficher aucune case tout
                      en restant muette, parce que le test portait sur les
                      créneaux du jour avant filtrage. */}
                  {creneauxProposables().length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '1.5rem', color: T.muted, fontSize: '0.875rem', fontWeight: 600 }}>
                      Aucun créneau disponible ce jour.
                    </div>
                  )}
                </div>
                </>)}

                {/* Créneaux de livraison (tournées) — liste à plat des tournées à venir */}
                {modeCommande === 'livraison' && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Créneaux de livraison</span>
                      <div style={{ flex: 1, height: 1, background: T.pale }}/>
                    </div>
                    {slotsLivraison.length === 0
                      ? <p style={{ textAlign: 'center', padding: '1.5rem', color: T.muted, fontSize: '0.875rem', fontWeight: 600 }}>Aucune tournée disponible pour le moment.</p>
                      : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {slotsLivraison.map(slot => {
                            const { complet } = calculerCapaciteCreneau(slot, { modeCapaciteDefaut: commercant?.mode_capacite })
                            const choisi = creneauLivraisonChoisi?.id === slot.id && creneauLivraisonChoisi?._date?.getTime?.() === slot._date?.getTime?.()
                            return (
                              <button key={`${slot.id}-${slot._date?.getTime?.()}`} disabled={complet}
                                onClick={() => { setCreneauLivraisonChoisi(slot); setErreurCommande(null) }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0.75rem 1rem', borderRadius: 12, border: `2px solid ${complet ? '#E5E7EB' : choisi ? T.main : T.pale}`, background: complet ? '#F9FAFB' : choisi ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#fff', color: complet ? '#9CA3AF' : choisi ? '#fff' : T.ink, cursor: complet ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', textAlign: 'left', width: '100%' }}>
                                <span style={{ fontWeight: 800, fontSize: '0.9rem', textTransform: 'capitalize' }}>{slot._jourLabel}</span>
                                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{(slot.heure_debut||'').slice(0,5)}–{(slot.heure_fin||'').slice(0,5)}{complet ? ' · complet' : ''}</span>
                              </button>
                            )
                          })}
                        </div>
                    }
                  </div>
                )}

                {/* Encart invite : rassure (pas besoin de compte) + raccourci Yopper existant.
                    Wording cohérent avec /commander/rdv/[slug] étape 3. */}
                {!(client.email && clientId) && (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: T.pale, borderRadius: 14, padding: '0.875rem 1rem', marginBottom: 14, border: `1px solid ${T.main}22` }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <p style={{ fontSize: '0.78rem', color: T.deep, lineHeight: 1.5, flex: 1, margin: 0 }}>
                      <strong style={{ color: T.ink }}>Pas besoin de compte</strong> pour commander - remplis juste tes coordonnées ci-dessous.<br/>
                      Déjà Yopper ?{' '}
                      <a href={`/commander/auth?redirect=/commander/${slug}`} style={{ color: T.main, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        Connecte-toi pour pré-remplir →
                      </a>
                    </p>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Tes coordonnées
                  </span>
                  <div style={{ flex: 1, height: 1, background: T.pale }}/>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <input placeholder="Prénom *" type="text" value={client.prenom} onChange={e => setClient(p => ({ ...p, prenom: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }}/>
                  <input placeholder="Nom *" type="text" value={client.nom} onChange={e => setClient(p => ({ ...p, nom: e.target.value }))} style={{ ...inputSt, marginBottom: 0 }}/>
                </div>
                <input placeholder="Email *" type="email" value={client.email} onChange={e => setClient(p => ({ ...p, email: e.target.value }))} style={inputSt}/>
                <input placeholder="Téléphone *" type="tel" value={client.telephone} onChange={e => setClient(p => ({ ...p, telephone: e.target.value }))} style={inputSt}/>

                <div style={{ background: '#fff', borderRadius: 14, border: `1.5px solid ${T.pale}`, overflow: 'hidden', marginBottom: 16 }}>
                  <div style={{ padding: '0.625rem 1rem', background: T.pale }}>
                    <p style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.68rem', fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                      Confidentialité
                    </p>
                  </div>
                  {[
                    { key: 'rgpdCommande', val: rgpdCommande, set: setRgpdCommande, label: 'Traitement de ma commande', badge: 'Obligatoire', badgeColor: '#DC2626', badgeBg: '#FEE2E2', desc: `J'accepte que mes coordonnées soient transmises à ${commercant.nom} pour le traitement de ma commande.` },
                    { key: 'rgpdMarketing', val: rgpdMarketing, set: setRgpdMarketing, label: 'Offres et actualités', badge: 'Optionnel', badgeColor: T.main, badgeBg: T.pale, desc: `J'accepte que ${commercant.nom} utilise mes coordonnées pour m'envoyer des offres.` },
                  ].map((item, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '0.875rem 1rem', cursor: 'pointer', borderBottom: i === 0 ? `1px solid ${T.pale}` : 'none', background: item.val ? '#F0FDF4' : '#fff' }}>
                      <div onClick={() => item.set(v => !v)}
                        style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${item.val ? '#10B981' : '#D1D5DB'}`, background: item.val ? '#10B981' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, transition: 'all 0.15s' }}>
                        {item.val && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                        )}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                          {item.label} <span style={{ fontSize: '0.62rem', fontWeight: 700, background: item.badgeBg, color: item.badgeColor, padding: '1px 6px', borderRadius: 100, marginLeft: 4 }}>{item.badge}</span>
                        </p>
                        <p style={{ fontSize: '0.75rem', color: T.muted, lineHeight: 1.5 }}>{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Message erreur stock - uniquement si stock change entre-temps */}
                {erreurCommande && (
                  <div style={{ background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: 12, padding: '0.875rem 1rem', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                        <path d="M12 9v4M12 17h.01"/>
                      </svg>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: '0.82rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.5 }}>{erreurCommande}</p>
                      </div>
                      <button onClick={() => { setErreurCommande(null); setAjustementStock(null) }}
                        aria-label="Fermer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', flexShrink: 0, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                    {ajustementStock && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                        {ajustementStock.stockDisponible > 0 && (
                          <button onClick={() => {
                            setPanier(prev => {
                              const next = { ...prev }
                              let restant = ajustementStock.stockDisponible
                              Object.keys(next).forEach(key => {
                                if (key === String(ajustementStock.articleId) || key.startsWith(`${ajustementStock.articleId}_`)) {
                                  if (restant > 0) {
                                    const qte = Math.min(next[key].quantite, restant)
                                    next[key] = { ...next[key], quantite: qte }
                                    restant -= qte
                                  } else {
                                    delete next[key]
                                  }
                                }
                              })
                              return next
                            })
                            setErreurCommande(null)
                            setAjustementStock(null)
                          }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.5rem 1rem', borderRadius: 100, border: 'none', background: T.main, color: '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
                            Réduire à {ajustementStock.stockDisponible}
                          </button>
                        )}
                        <button onClick={() => { allerEtape(2); setErreurCommande(null); setAjustementStock(null) }}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.5rem 1rem', borderRadius: 100, border: `1.5px solid ${T.main}`, background: '#fff', color: T.main, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                          Modifier mon panier
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  // Modes de paiement proposés. Deux mondes :
                  //  • alimentaire : en ligne (Stripe) et/ou sur place (accepte_paiement_cash)
                  //  • boutique détail : expédition = TOUJOURS en ligne ; retrait =
                  //    selon boutique_retrait_paiement (en_ligne obligatoire OU comptoir)
                  // 🔴 CE CALCUL ÉTAIT LE JUMEAU DE CELUI DE `passerCommande`,
                  // en plus permissif : il oubliait que le retrait en boutique
                  // ferme le paiement en ligne quand le commerçant encaisse au
                  // comptoir. L'écran offrait donc une carte bancaire, et la
                  // commande partait en `sur_place` sans Stripe. Une seule
                  // règle, lue des deux côtés ET par le serveur.
                  const estExpe = estDetail && modeBoutiqueEff === 'expedition'
                  const { stripeOK, cashOK } = modesPaiementOuverts({
                    commercant, estDetail, modeBoutique: modeBoutiqueEff,
                  })
                  const surPlaceOu = modeCommande === 'livraison' ? 'au livreur' : estDetail ? 'au comptoir, au retrait' : 'au retrait'
                  // Avantages couvrant tout : plus rien à payer, pas de choix
                  // de mode. ⚠️ La récompense de fidélité peut y suffire seule.
                  const couvert = totalDuApresBon() === 0 && (bonsAppliques.length > 0 || remiseRecompenseEffective() > 0)
                  const modeEffectif = modePaiementEffectif({
                    choix: modePaiement, stripeOK, cashOK, couvert,
                  })
                  const surPlace = !couvert && modeEffectif === 'sur_place'
                  return (
                    <>
                      {/* ─── Récompense de fidélité ────────────────────────
                          ⚠️ N'APPARAÎT QUE POUR UN YOPPER CONNECTÉ qui a
                          réellement une récompense chez CE commerçant : la
                          route ne rend rien dans tous les autres cas. Un
                          invité ne voit donc pas un bloc qu'il ne peut pas
                          utiliser.
                          ⚠️ ET LE BOUTON DIT LE GESTE, pas l'état : « Utiliser
                          ma récompense », puis « Retirer ». */}
                      {recompenseFid && (
                        <div style={{ background: recompenseActive ? '#F5F3FF' : '#fff', border: `1.5px solid ${recompenseActive ? T.main : T.pale}`, borderRadius: 14, padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            {/* ⚠️ « Ta récompense fidélité t’attend » NE DONNAIT
                                PAS ENVIE et ne disait pas ce qui allait se
                                passer. Le Yopper lit maintenant le MONTANT qui
                                lui revient, et une fois qu'il a cliqué on le
                                félicite au lieu de lui accuser réception. */}
                            <p style={{ fontSize: '0.82rem', fontWeight: 800, color: recompenseActive ? '#059669' : T.ink, margin: 0 }}>
                              {recompenseActive
                                ? libelleRecompenseUtilisee(recompenseFid, totalAvecFrais())
                                : libelleOffreRecompense(recompenseFid, totalAvecFrais())}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: T.muted, fontWeight: 600, margin: '2px 0 0' }}>
                              {recompenseActive
                                ? `${recompenseFid.libelle ? `${recompenseFid.libelle}. ` : ''}Le montant est déduit de ta commande.`
                                : 'Utilise-les maintenant : ils se déduiront de ta commande. Sinon ils t’attendront, ils ne s’effacent pas.'}
                            </p>
                            {/* 🔴 CE QUI SE PERD QUAND LA RÉCOMPENSE VAUT PLUS
                                QUE LE PANIER. Alex, 28/08 : une récompense de
                                10 € sur un panier à 8 € déduisait 8 €, brûlait
                                la récompense ENTIÈRE, et les 2 € disparaissaient
                                sans un mot, juste sous un « 10€ offerts sur ton
                                prochain achat » qui disait le contraire.
                                ⚠️ ON NE BLOQUE PAS ET ON NE REPORTE PAS : on le
                                DIT, et il choisit. La récompense n'est pas
                                active d'office, la sortie est à un clic. */}
                            {libellePerteRecompense(recompenseFid, totalAvecFrais()) && (
                              <p style={{ fontSize: '0.72rem', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '7px 9px', fontWeight: 700, margin: '6px 0 0', lineHeight: 1.45 }}>
                                {libellePerteRecompense(recompenseFid, totalAvecFrais())}
                              </p>
                            )}
                            {/* ⚠️ 🔴 DEUX RÉCOMPENSES EN BASE, UNE SEULE À L'ÉCRAN,
                                et rien ne disait que l'autre existait : Alex l'a
                                vu le 25/08. On n'en dépense qu'une par commande
                                (la remise est bornée au panier, cumuler en
                                brûlerait une pour rien), mais un choix qui ne se
                                dit pas se lit comme une perte. La phrase reste
                                affichée APRÈS le clic : c'est même là qu'elle
                                rassure le plus. */}
                            {libelleAutresRecompenses(recompensesTotal) && (
                              <p style={{ fontSize: '0.72rem', color: T.main, fontWeight: 700, margin: '4px 0 0' }}>
                                {libelleAutresRecompenses(recompensesTotal)}
                              </p>
                            )}
                          </div>
                          <button type="button" onClick={() => setRecompenseActive(v => !v)}
                            style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 12, border: recompenseActive ? `1.5px solid ${T.main}` : 'none', background: recompenseActive ? '#fff' : `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: recompenseActive ? T.main : '#fff', fontWeight: 800, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                            {recompenseActive ? 'Retirer' : 'Utiliser'}
                          </button>
                        </div>
                      )}

                      {/* 🔴 LE YOPPER DEVAIT RETAPER SON PROPRE CODE. Il
                          possédait le bon, l'application le savait, et elle lui
                          demandait quand même d'aller le rechercher dans un
                          email pour le recopier à la main. La récompense
                          fidélité, elle, se pose d'un geste depuis le 24/08.
                          ⚠️ AUCUNE GARDE SUR `bonsCfg?.actif` : un commerçant
                          peut avoir FERMÉ la vente de nouveaux bons après en
                          avoir vendu. Ceux-là restent dépensables, et
                          `/api/bons-cadeaux/verifier` les accepte toujours. */}
                      {/* 🔴 LA LISTE NE DISPARAÎT PLUS QUAND UN BON EST RETENU
                          (Alex, 01/09). Elle s'effaçait entièrement : avec 180 €
                          à payer et trois bons de 50, 75 et 20 €, en choisir un
                          faisait disparaître les deux autres, et on pouvait en
                          conclure qu'ils étaient perdus. */}
                      {mesBonsIci.length > 0 && (
                        <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 14, padding: '10px 12px', marginBottom: 10 }}>
                          <p style={{ fontSize: '0.68rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>
                            {mesBonsIci.length > 1 ? `Tes ${nomBons} ici` : `Ton ${nomBon} ici`}
                          </p>
                          {mesBonsIci.map(b => {
                            const retenu = bonsAppliques.some(a => a.code === b.code)
                            // ⚠️ CE QUE CE BON PRÉCIS FINANCE, une fois la
                            // répartition faite : sur 180 € avec trois bons, le
                            // dernier ne sert peut-être qu'à moitié.
                            const pris = repartitionBons().lignes.find(l => l.code === b.code)?.montant || 0
                            return (
                              <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
                                <div style={{ minWidth: 0 }}>
                                  <p style={{ fontSize: '0.82rem', fontWeight: 800, color: '#065F46', margin: 0 }}>
                                    {retenu && pris > 0 ? `−${euros(pris)} déduits` : `${euros(b.solde)} disponibles`}
                                  </p>
                                  <p style={{ fontSize: '0.7rem', color: '#047857', fontWeight: 600, margin: '2px 0 0', fontFamily: 'monospace', letterSpacing: '0.5px' }}>{b.code}</p>
                                </div>
                                {/* ⚠️ LE BOUTON DIT LE GESTE, pas l'état. */}
                                <button type="button"
                                  onClick={() => {
                                    setBonErreur(null)
                                    if (retenu) setBonsAppliques(l => l.filter(a => a.code !== b.code))
                                    else appliquerBon(b.code)
                                  }}
                                  disabled={bonLoading}
                                  style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 100, border: retenu ? '1.5px solid #059669' : 'none', background: retenu ? '#fff' : 'linear-gradient(135deg, #059669, #10B981)', color: retenu ? '#059669' : '#fff', fontWeight: 800, fontSize: '0.8rem', cursor: bonLoading ? 'default' : 'pointer', fontFamily: '"DM Sans", sans-serif', opacity: bonLoading ? 0.6 : 1 }}>
                                  {bonLoading ? '…' : retenu ? 'Retirer' : 'Utiliser'}
                                </button>
                              </div>
                            )
                          })}
                          {bonErreur && <p style={{ fontSize: '0.74rem', color: '#DC2626', fontWeight: 700, margin: '6px 0 0' }}>{bonErreur}</p>}
                        </div>
                      )}

                      {/* Bon cadeau : champ code (si le commerçant a activé le module) */}
                      {/* ⚠️ LE CHAMP RESTE OFFERT TANT QU'IL Y A DE LA PLACE :
                          c'est lui qui permet d'AJOUTER un bon reçu ailleurs
                          par-dessus ceux du compte. Il ne se ferme qu'à la
                          cinquième, la borne que le serveur applique aussi. */}
                      {bonsCfg?.actif && bonsAppliques.length < BONS_MAX_PAR_COMMANDE && (
                        <div style={{ background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 14, padding: '10px 12px', marginBottom: 10 }}>
                          <p style={{ fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 8px' }}>J&rsquo;ai un {nomBon}</p>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <input value={bonInput} onChange={e => { setBonInput(e.target.value); setBonErreur(null) }}
                              placeholder="BC-XXXX-XXXX" autoCapitalize="characters" spellCheck={false}
                              style={{ ...inputSt, marginBottom: 0, flex: 1, fontFamily: 'monospace', letterSpacing: '1px' }}/>
                            <button type="button" onClick={appliquerBon} disabled={bonLoading || !bonInput.trim()}
                              style={{ flexShrink: 0, padding: '0 16px', borderRadius: 12, border: 'none', background: bonInput.trim() ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#E5E7EB', color: bonInput.trim() ? '#fff' : '#9CA3AF', fontWeight: 800, fontSize: '0.82rem', cursor: bonInput.trim() ? 'pointer' : 'default', fontFamily: '"DM Sans", sans-serif' }}>
                              {bonLoading ? '…' : 'Appliquer'}
                            </button>
                          </div>
                          {bonErreur && <p style={{ fontSize: '0.74rem', color: '#DC2626', fontWeight: 700, margin: '6px 0 0' }}>{bonErreur}</p>}
                        </div>
                      )}
                      {bonsAppliques.length > 0 && (
                        <div style={{ background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 14, padding: '10px 12px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: '0.82rem', fontWeight: 800, color: '#065F46', margin: 0 }}>
                              {bonsAppliques.length > 1
                                ? `${bonsAppliques.length} ${libelleBon(commercant?.categorie, { pluriel: true })} appliqués`
                                : `${libelleBon(commercant?.categorie, { majuscule: true })} appliqué`} : −{euros(remiseBonEffective())}
                            </p>
                            {/* ⚠️ LA PHRASE DU RESTE VIT DANS LE MODULE (30/08),
                                avec celle du tunnel rendez-vous. Elle s'arrêtait
                                à « il restera 18,10 € sur ton bon » : un solde
                                dont on ignore l'usage est un solde qu'on oublie,
                                et un bon oublié est de l'argent encaissé sans
                                jamais revoir le client. */}
                            <p style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600, margin: '2px 0 0' }}>
                              {couvert
                                ? 'Ta commande est entièrement couverte 🟣'
                                : `Reste à payer : ${euros(totalDuApresBon())}`}
                              {/* ⚠️ LE RELIQUAT EST CELUI DE TOUS LES BONS RETENUS,
                                  pas d'un seul : avec trois bons dont un entamé,
                                  ne parler que du premier serait faux. */}
                              {' '}{libelleResteBon(
                                bonsAppliques.reduce((s, b) => s + Number(b.solde || 0), 0) - remiseBonEffective(),
                                commercant?.nom)}
                            </p>
                          </div>
                          <button type="button" onClick={() => { setBonsAppliques([]); setBonErreur(null) }}
                            style={{ flexShrink: 0, border: 'none', background: 'transparent', color: '#047857', fontWeight: 800, fontSize: '0.74rem', cursor: 'pointer', textDecoration: 'underline', fontFamily: '"DM Sans", sans-serif' }}>
                            Retirer
                          </button>
                        </div>
                      )}
                      {!couvert && estExpe && stripeOK && (
                        <p style={{ fontSize: '0.78rem', color: '#1A0840', background: '#F8F6FF', border: '1px solid #EDE0FF', borderRadius: 12, padding: '10px 14px', marginBottom: 10, fontWeight: 600, lineHeight: 1.5 }}>
                          Paiement <strong>en ligne</strong> (carte ou Bancontact) : ton colis part une fois la commande payée.
                        </p>
                      )}
                      {!couvert && stripeOK && cashOK && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          {[
                            { val: 'en_ligne', label: 'Payer en ligne', sous: 'Carte ou Bancontact' },
                            { val: 'sur_place', label: 'Payer sur place', sous: `${surPlaceOu.charAt(0).toUpperCase()}${surPlaceOu.slice(1)}, espèces ou carte` },
                          ].map(opt => {
                            const sel = modeEffectif === opt.val
                            return (
                              <button key={opt.val} type="button" onClick={() => setModePaiement(opt.val)}
                                style={{ flex: 1, padding: '10px 12px', borderRadius: 14, border: `2px solid ${sel ? T.main : '#EEE9F5'}`, background: sel ? '#F8F6FF' : '#fff', cursor: 'pointer', textAlign: 'left', fontFamily: '"DM Sans", sans-serif', transition: 'all 0.15s' }}>
                                <span style={{ display: 'block', fontWeight: 800, fontSize: '0.85rem', color: sel ? T.main : '#1A0840' }}>{opt.label}</span>
                                <span style={{ display: 'block', fontSize: '0.7rem', color: '#6B7280', fontWeight: 600, marginTop: 2 }}>{opt.sous}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {!couvert && !stripeOK && cashOK && (
                        <p style={{ fontSize: '0.78rem', color: '#1A0840', background: '#F8F6FF', border: '1px solid #EDE0FF', borderRadius: 12, padding: '10px 14px', marginBottom: 10, fontWeight: 600, lineHeight: 1.5 }}>
                          Tu paies <strong>sur place</strong> ({surPlaceOu}), en espèces ou par carte. Ta commande est confirmée immédiatement.
                        </p>
                      )}
                      {!couvert && !stripeOK && !cashOK && (
                        <p style={{ fontSize: '0.78rem', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 12, padding: '10px 14px', marginBottom: 10, fontWeight: 700, lineHeight: 1.5 }}>
                          La commande en ligne n&rsquo;est pas encore disponible chez ce commerçant.
                        </p>
                      )}
                      <button onClick={passerCommande} disabled={loadingCommande || !formValide || !modeEffectif}
                        style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: (!formValide || !modeEffectif) ? 0.45 : 1, cursor: (!formValide || !modeEffectif) ? 'default' : 'pointer' }}>
                        {loadingCommande ? ((surPlace || couvert) ? 'Confirmation…' : 'Redirection…') : (
                          <>
                            {(surPlace || couvert) ? 'Confirmer' : 'Payer & confirmer'} - {euros(totalDuApresBon())}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                          </>
                        )}
                      </button>
                    </>
                  )
                })()}
                {!rgpdCommande && (
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', color: '#DC2626', textAlign: 'center', marginTop: 6, fontWeight: 600, justifyContent: 'center', width: '100%' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                      <path d="M12 9v4M12 17h.01"/>
                    </svg>
                    Accepte le traitement de ta commande pour continuer
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ÉTAPE 4 - Confirmation */}
          {!loading && etape === 4 && commercant && (
            <div style={{ padding: '1.5rem 1rem', animation: 'fadeUp 0.4s ease' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                {/* Même grammaire visuelle que l'écran de retrait : l'icône du
                    moment flotte dans sa pastille, le numéro arrive avec un
                    rebond et un halo. Les deux écrans racontent la même
                    histoire à deux moments, ils doivent se ressembler. */}
                <style>{`
                  @keyframes cf-flotte { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
                  @keyframes cf-numero { 0%{opacity:0;transform:scale(0.7)} 60%{opacity:1;transform:scale(1.06)} 100%{opacity:1;transform:scale(1)} }
                  @keyframes cf-halo { 0%,100%{transform:scale(1);opacity:0.28} 50%{transform:scale(1.14);opacity:0.5} }
                  @keyframes cf-check { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.12);opacity:1} 100%{transform:scale(1);opacity:1} }
                `}</style>
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 76, height: 76, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, marginBottom: '0.875rem', boxShadow: `0 8px 28px ${T.main}55, 0 0 0 6px ${T.main}18`, animation: 'cf-flotte 3.2s ease-in-out infinite' }}>
                  <IconeRetrait contexte={contexteConfirmation} taille={36}/>
                  {/* Le check vert reste, en pastille : c'est le signal « c'est
                      bon », il ne doit pas disparaître au profit du décor. */}
                  <span style={{ position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #10B981, #6EE7B7)', border: '2.5px solid #fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', animation: 'cf-check 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.2s both' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L20 7"/>
                    </svg>
                  </span>
                </div>
                {/* Wordmark tricolore canonique fond clair : Yo Ink, pp Main, aa Mid */}
                <p style={{ fontFamily: 'var(--font-jakarta), "Plus Jakarta Sans", system-ui, sans-serif', fontWeight: 800, fontSize: '1rem', marginBottom: 4, letterSpacing: '-0.05em', lineHeight: 1 }}>
                  <span style={{ color: T.ink }}>yo</span>
                  <span style={{ color: T.main }}>pp</span>
                  <span style={{ color: T.mid }}>aa</span>
                </p>
                {/* Le numéro, déjà mis en scène ici : c'est celui que le Yopper
                    montrera au comptoir, autant qu'il le retienne dès
                    maintenant. Même rebond et même halo que sur l'écran de
                    retrait, pour qu'il le reconnaisse. */}
                {derniereCommande?.numeroSequentiel && (
                  <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
                    <span aria-hidden="true" style={{ position: 'absolute', inset: '-30% -18%', borderRadius: '50%', background: `radial-gradient(circle, ${T.mid} 0%, transparent 68%)`, animation: 'cf-halo 2.8s ease-in-out infinite', pointerEvents: 'none' }}/>
                    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, borderRadius: 100, padding: '7px 24px', boxShadow: `0 4px 16px ${T.main}44`, animation: 'cf-numero 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s both' }}>
                      <span style={{ fontWeight: 900, fontSize: '1.5rem', color: '#fff', letterSpacing: '-0.5px' }}>#{derniereCommande.numeroSequentiel}</span>
                    </span>
                  </div>
                )}
                <h2 style={{ fontWeight: 900, fontSize: '1.7rem', color: T.ink, marginBottom: '0.5rem', letterSpacing: '-0.75px' }}>{confirmation.titre}</h2>
                <p style={{ color: T.deep, fontWeight: 700, marginBottom: '0.25rem' }}>Chez {commercant.nom}</p>
                <p style={{ color: T.muted, fontSize: '0.875rem' }}>{confirmation.sousTitre}</p>
              </div>

              <div style={{ background: `linear-gradient(135deg, ${T.pale}, #fff)`, borderRadius: 20, overflow: 'hidden', marginBottom: '1rem', border: `1.5px solid ${T.main}22` }}>
                <div style={{ height: 3, background: `linear-gradient(90deg, ${T.ink} 0%, ${T.main} 60%, ${T.light} 100%)` }}/>
                <div style={{ padding: '1.25rem' }}>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: T.ink, marginBottom: 12, fontSize: '1rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 8v4l3 3"/>
                    </svg>
                    Et après ?
                  </p>
                  {/* 3 etapes concretes - plus parlant pour un newcomer que "confirme depuis l'onglet Commandes" */}
                  <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {confirmation.etapes.map((texte, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.85rem', color: T.deep, lineHeight: 1.5 }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', fontWeight: 900, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, boxShadow: `0 2px 6px ${T.main}33` }}>{i + 1}</span>
                        <span style={{ paddingTop: 2 }}>{enGras(texte)}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>

              {/* Nudge optionnel : créer un mot de passe pour se reconnecter vite.
                  Non bloquant, le magic link reste toujours dispo (voir definir-mdp).
                  Masqué si le compte en a DÉJÀ un : proposer de créer ce qui
                  existe déjà fait douter que le compte ait été créé.
                  ⚠️ Et réservé à qui A une session : l'invité reçoit l'encadré
                  complet plus bas, qui lui explique d'abord où est sa commande. */}
              {estConnecte && !aMotDePasse && (
              <Link href={`/commander/auth/definir-mdp${client.email ? `?email=${encodeURIComponent(client.email)}` : ''}`} style={{ display: 'block', textDecoration: 'none', background: '#fff', borderRadius: 16, padding: '1rem 1.1rem', marginBottom: '1rem', border: `1.5px solid ${T.main}22` }}>
                <p style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: T.ink, fontSize: '0.92rem', margin: '0 0 4px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  Crée un mot de passe
                </p>
                <p style={{ fontSize: '0.8rem', color: T.muted, margin: 0, lineHeight: 1.4 }}>
                  Pour te reconnecter en un clic et retrouver tes commandes. Optionnel, le lien magique reste toujours disponible.
                </p>
              </Link>
              )}

              {isDesktop && (
                <div style={{ background: `linear-gradient(135deg, ${T.bgPanel}, ${T.deep})`, borderRadius: 20, padding: '1.25rem', marginBottom: '1rem', border: `1px solid ${T.main}44`, textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
                    {[{c:'rgba(255,255,255,0.4)',s:5},{c:T.light,s:7},{c:T.mid,s:5}].map((d,i)=>(
                      <div key={i} style={{width:d.s,height:d.s,borderRadius:'50%',background:d.c}}/>
                    ))}
                  </div>
                  <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#fff', fontSize: '0.95rem', marginBottom: 6 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="6" y="2" width="12" height="20" rx="2.5"/>
                      <path d="M11 18h2"/>
                    </svg>
                    {estLivraisonConfirmee ? 'Pour suivre ta livraison' : 'Pour ton retrait sans attendre'}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, marginBottom: 12 }}>
                    {estLivraisonConfirmee
                      ? <>Tu as commandé depuis ton PC. Installe l&apos;app sur ton téléphone pour être prévenu quand ta commande part en livraison et arrive.<br/></>
                      : <>Tu as commandé depuis ton PC. Pour utiliser l&apos;écran de retrait prioritaire Yoppaa chez le commerçant, télécharge l&apos;app sur ton téléphone.<br/></>}
                    <strong style={{ color: T.light }}>Tes identifiants restent les mêmes.</strong>
                  </p>
                  <a href="https://yoppaa.app/download"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: `linear-gradient(135deg, ${T.main}, ${T.mid})`, color: '#fff', borderRadius: 100, padding: '10px 24px', fontSize: '0.875rem', fontWeight: 800, textDecoration: 'none', boxShadow: `0 4px 16px ${T.main}55` }}>
                    Télécharger Yoppaa
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                    </svg>
                  </a>
                  <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>ICI ON EST YOPPERS 🟣</p>
                </div>
              )}

              {/* L'ENCADRÉ DE L'INVITÉ, celui qui vient de payer sans compte.
                  C'est le moment où il a le plus besoin qu'on lui parle, et le
                  seul où on est sûr de l'avoir sous les yeux.

                  🔴 IL Y AVAIT DÉJÀ UN ENCADRÉ ICI, ET IL NE S'AFFICHAIT JAMAIS.
                  Sa condition était `!(client.email && clientId)`, or on
                  n'atteint cet écran qu'après avoir donné son email, et
                  `getOuCreerClient` pose `clientId` juste avant de partir payer.
                  Les deux étaient donc TOUJOURS remplis, et l'invitation à
                  créer un compte était morte depuis le premier jour. La vraie
                  question n'est pas « a-t-il laissé une adresse », c'est
                  « a-t-il un moyen de revenir » : c'est `estConnecte`.

                  ⚠️ ET IL ENVOYAIT AU MAUVAIS ENDROIT : `/commander/auth`, la
                  création de compte, à quelqu'un dont la fiche client existe
                  déjà. On l'envoie définir son mot de passe, ce qui rattache sa
                  commande au lieu d'en ouvrir une deuxième à côté.

                  Ce que le texte promet est vérifié : l'email de confirmation
                  porte bien ce lien (`offrir_mdp` dans lib/resend.js, alimenté
                  par lib/commande-notifs.js), et « mes commandes » retrouve les
                  commandes d'invité par l'ADRESSE, normalisée des deux côtés
                  (lib/email-normalise.js). La commande d'aujourd'hui sera donc
                  bien là. */}
              {!estConnecte && (
                <div style={{ background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 100%)`, borderRadius: 16, padding: '1rem 1.125rem', marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at 90% 20%, ${T.main}55 0%, transparent 55%)`, pointerEvents: 'none' }}/>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fff', margin: 0, marginBottom: 4, letterSpacing: '-0.3px' }}>
                        Ta commande est déjà à ton nom 🟣
                      </p>
                      {/* Trois choses, dans cet ordre : elle est en sécurité,
                          voici la clé, voici ce que la clé ouvre. Dire seulement
                          « crée un compte » laisserait croire qu'il n'a rien
                          tant qu'il ne l'a pas fait. */}
                      <p style={{ fontSize: '0.78rem', color: T.light, lineHeight: 1.45, margin: 0, marginBottom: 10, opacity: 0.95 }}>
                        Elle est enregistrée{client.email ? <> sous <strong style={{ color: '#fff' }}>{client.email}</strong></> : null}. Ton email de confirmation contient un lien pour choisir ton mot de passe, et tu peux le faire tout de suite ici. Ensuite, tu retrouves cette commande et les suivantes dans ton compte Yopper.
                      </p>
                      <button onClick={() => router.push(`/commander/auth/definir-mdp${client.email ? `?email=${encodeURIComponent(client.email)}` : ''}`)}
                        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0.625rem 1.125rem', background: '#fff', color: T.main, border: 'none', borderRadius: 100, fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
                        Choisir mon mot de passe
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button onClick={() => router.push('/commander')} style={{ ...btnPrimary, marginBottom: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                Retour à l&apos;accueil
              </button>
              {!cancelResult && (
                <button onClick={() => { setPanier({}); setCreneauChoisi(null); setRgpdCommande(false); setRgpdMarketing(true); setErreurCommande(null); setAjustementStock(null); allerEtape(2) }}
                  style={{ width: '100%', padding: '0.875rem', background: 'transparent', color: T.main, border: `1.5px solid ${T.main}`, borderRadius: 100, fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem', marginBottom: 10 }}>
                  Continuer chez {commercant.nom}
                </button>
              )}
              {/* Lien d'annulation discret : visible avant le cutoff configuré par le commerçant
                  (la route refuse si le délai est passé). Masque une fois annulée. */}
              {!cancelResult && (
                <button onClick={annulerCommande} disabled={loadingCancel}
                  style={{ width: '100%', padding: '0.75rem', background: 'transparent', color: T.muted, border: 'none', fontWeight: 600, cursor: loadingCancel ? 'default' : 'pointer', fontSize: '0.82rem', textDecoration: 'underline', opacity: loadingCancel ? 0.5 : 1 }}>
                  {loadingCancel ? 'Annulation en cours…' : 'Annuler ma commande'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modale signalement (déclenchée depuis le lien en bas de fiche) */}
      {showSignalement && commercant && (
        <ModalSignalement
          target={{ kind: 'commerce', id: commercant.id, nom: commercant.nom }}
          yopperId={typeof window !== 'undefined' ? localStorage.getItem('yoppaa_client_id') : null}
          onClose={() => setShowSignalement(false)}
          onSent={() => setSignalementSent(true)}
        />
      )}

      {/* Toast de confirmation (favoris ajouté/retiré, lien copié) */}
      {toastMessage && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: T.ink, color: '#fff', padding: '12px 22px', borderRadius: 100,
          fontSize: 13, fontWeight: 700, zIndex: 1000,
          boxShadow: '0 10px 30px rgba(26,8,64,0.45)',
          animation: 'toastIn 0.25s ease',
          maxWidth: '90vw',
        }}>
          {toastMessage}
          <style>{`@keyframes toastIn { from { opacity: 0; transform: translate(-50%, 10px) } to { opacity: 1; transform: translate(-50%, 0) } }`}</style>
        </div>
      )}
    </>
  )
}