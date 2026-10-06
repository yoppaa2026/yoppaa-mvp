'use client'
// L'ENCART « TA FICHE N'EST PAS ENCORE VISIBLE » (28/09).
//
// 🔴 POURQUOI (Alex) : « les commerçants ne complètent pas leurs fiches ». Ils
// arrivaient dans un tableau de bord qui ne leur disait RIEN de ce qu'il
// fallait remplir, et leur fiche était déjà en ligne, à moitié vide.
// Désormais la fiche reste invisible tant qu'elle n'est pas complète, et cet
// encart dit exactement ce qui manque, avec un lien vers l'écran où ça se fait.
//
// ⚠️ LA RÈGLE EST CELLE DU SERVEUR (lib/fiche-complete.js) : ce que l'encart
// coche, la route « Demander la mise en ligne » le recoche, et la route
// « Publier » d'Alex aussi. Trois lecteurs, une seule règle.
//
// ⚠️ UNE LECTURE EN ÉCHEC NE SE LIT PAS « IL TE MANQUE TOUT ». Si le comptage
// échoue, on le dit, au lieu d'afficher un catalogue vide à quelqu'un qui en a
// rempli un.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ficheAPublier, ficheComplete } from '@/lib/fiche-complete'
import { attenteDepuis } from '@/lib/statut-commercant'
import { ecrireSousOnglet } from '@/lib/onglet-url'

const T = {
  main: '#6B35C4', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280',
  hairline: '#EEE9F5', vert: '#059669', vertPale: '#ECFDF5', orange: '#C2410C',
}

// Toutes les trente secondes, le temps d'ajouter un article : l'encart suit
// le commerçant sans qu'il ait à recharger la page.
const RELECTURE_MS = 30000
const CLE_REPLIE = 'yoppaa_fiche_a_publier_replie'

async function compter(requete) {
  const { count, error } = await requete
  if (error) throw new Error(error.message)
  return count || 0
}

function IconeCoche({ fait }) {
  return fait ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.vert} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={T.orange} strokeWidth="2.2" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/>
    </svg>
  )
}

export default function BandeauFicheAPublier({ commercant, onAllerA, cleRafraichir = '' }) {
  const concerne = ficheAPublier(commercant)
  const [comptes, setComptes] = useState(null)
  const [erreur, setErreur] = useState(null)
  const [demandeeLe, setDemandeeLe] = useState(commercant?.publication_demandee_at || null)
  const [envoi, setEnvoi] = useState(false)
  const [refus, setRefus] = useState(null)
  const [replie, setReplie] = useState(() => {
    try { return sessionStorage.getItem(CLE_REPLIE) === '1' } catch { return false }
  })

  useEffect(() => { setDemandeeLe(commercant?.publication_demandee_at || null) }, [commercant?.publication_demandee_at])

  const lire = useCallback(async () => {
    if (!commercant?.id) return
    try {
      const [articles, prestations, photos, lieux] = await Promise.all([
        compter(supabase.from('articles').select('id', { count: 'exact', head: true })
          .eq('commercant_id', commercant.id).eq('actif', true)),
        compter(supabase.from('rdv_prestations').select('id', { count: 'exact', head: true })
          .eq('commercant_id', commercant.id).eq('actif', true).is('deleted_at', null)),
        compter(supabase.from('commercant_photos').select('id', { count: 'exact', head: true })
          .eq('commercant_id', commercant.id).not('url', 'is', null)),
        compter(supabase.from('commercant_lieux').select('id', { count: 'exact', head: true })
          .eq('commercant_id', commercant.id).eq('actif', true).not('latitude', 'is', null).not('longitude', 'is', null)),
      ])
      setComptes({ nbCatalogue: articles + prestations, nbPhotos: photos, nbLieuxSitues: lieux })
      setErreur(null)
    } catch (e) {
      setErreur(e.message)
    }
  }, [commercant?.id])

  useEffect(() => {
    if (!concerne) return
    lire()
    const t = setInterval(() => { if (document.visibilityState === 'visible') lire() }, RELECTURE_MS)
    return () => clearInterval(t)
  }, [concerne, lire, cleRafraichir])

  if (!concerne) return null

  function basculer() {
    const suivant = !replie
    setReplie(suivant)
    try { sessionStorage.setItem(CLE_REPLIE, suivant ? '1' : '0') } catch { /* navigation privée */ }
  }

  async function demander() {
    setEnvoi(true); setRefus(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/fiche/demander-publication', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ commercant_id: commercant.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) throw new Error(json.error || `erreur ${res.status}`)
      setDemandeeLe(json.demandee_le || new Date().toISOString())
    } catch (e) {
      setRefus(e.message)
      lire()
    }
    setEnvoi(false)
  }

  const cadre = { margin: '0 0 16px', background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 14, padding: '14px 16px', boxShadow: '0 1px 6px rgba(22,6,54,0.05)' }

  if (erreur) {
    return (
      <div style={cadre}>
        <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: T.ink }}>Ta fiche n&apos;est pas encore visible par les clients</p>
        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#B91C1C', fontWeight: 600 }}>
          On n&apos;a pas pu vérifier ce qu&apos;il lui manque ({erreur}). Recharge la page dans un instant.
        </p>
      </div>
    )
  }
  if (!comptes) return null

  const bilan = ficheComplete({ commercant, ...comptes })
  const demande = demandeeLe && bilan.complet ? attenteDepuis(demandeeLe) : null

  return (
    <div style={cadre}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 900, color: T.ink, letterSpacing: '-0.2px' }}>
            {demande ? 'Ta demande de mise en ligne est envoyée' : 'Ta fiche n’est pas encore visible par les clients'}
          </p>
          <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: T.muted, fontWeight: 600, lineHeight: 1.45 }}>
            {demande
              ? `Envoyée ${demande.texte}. On regarde ta fiche et on la publie : tu reçois un email dès qu’elle est en ligne.`
              : bilan.complet
                ? 'Tout est prêt. Demande sa mise en ligne : on la regarde et on la publie.'
                : `${bilan.faits} sur ${bilan.total} fait. Complète ce qui manque, puis demande sa mise en ligne.`}
          </p>
        </div>
        <button onClick={basculer}
          style={{ background: 'none', border: `1.5px solid ${T.hairline}`, borderRadius: 10, padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700, color: T.muted, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
          {replie ? 'Voir le détail' : 'Masquer le détail'}
        </button>
      </div>

      {!replie && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {bilan.criteres.map(k => (
            <div key={k.cle} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', borderRadius: 10, background: k.atteint ? T.vertPale : '#FFFBF5', flexWrap: 'wrap' }}>
              <IconeCoche fait={k.atteint}/>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 800, color: T.ink }}>
                  {k.label}
                  {k.avancement && !k.atteint && <span style={{ color: T.orange, fontWeight: 700 }}> · {k.avancement}</span>}
                </p>
                {/* ⚠️ LA MENTION DU CATALOGUE RESTE, MÊME COCHÉE (Alex) : trois,
                    c'est le seuil pour demander la mise en ligne, pas un
                    catalogue. */}
                {(!k.atteint || k.cle === 'catalogue') && (
                  <p style={{ margin: '2px 0 0', fontSize: '0.74rem', color: T.muted, fontWeight: 600, lineHeight: 1.45 }}>{k.aide}</p>
                )}
              </div>
              {!k.atteint && onAllerA && (
                <button onClick={() => {
                  // Le sous-onglet s'écrit dans l'adresse AVANT d'ouvrir le
                  // Profil : c'est là qu'il le lit en arrivant. Sans lui, « Où
                  // me trouver » s'ouvrirait sur « Ma fiche ».
                  if (k.sousOnglet) ecrireSousOnglet(k.sousOnglet)
                  onAllerA(k.onglet)
                }}
                  style={{ background: T.pale, color: T.main, border: 'none', borderRadius: 9, padding: '6px 11px', fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
                  Compléter
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {refus && (
        <p style={{ margin: '10px 0 0', fontSize: '0.78rem', color: '#B91C1C', fontWeight: 700 }}>
          Demande non envoyée : {refus}.
        </p>
      )}

      {!demande && (
        <button onClick={demander} disabled={!bilan.complet || envoi}
          style={{ marginTop: 12, width: '100%', padding: '11px 16px', borderRadius: 12, border: 'none', background: bilan.complet ? `linear-gradient(135deg, ${T.main}, #9660E0)` : '#E5E7EB', color: bilan.complet ? '#fff' : T.muted, fontWeight: 800, fontSize: '0.86rem', cursor: bilan.complet && !envoi ? 'pointer' : 'not-allowed', fontFamily: '"DM Sans", sans-serif' }}>
          {envoi ? 'Envoi de ta demande…' : bilan.complet ? 'Demander la mise en ligne' : 'Demander la mise en ligne (complète d’abord ta fiche)'}
        </button>
      )}
    </div>
  )
}
