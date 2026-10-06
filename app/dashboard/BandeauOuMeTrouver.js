'use client'
// L'ENCART « TES CLIENTS NE TE TROUVENT PAS » (06/10).
//
// 🔴 POURQUOI (Alex, 06/10) : « où me trouver est obligatoire ». C'est de là
// que se mesure la distance des cards, et l'étoile de livraison part du lieu
// permanent. L'adresse d'inscription ne localise JAMAIS le commerce.
//
// Une fiche qui n'est pas encore publiée a déjà son encart : le critère
// « lieu » de lib/fiche-complete.js la retient tant qu'il manque. Celui-ci
// parle aux fiches DÉJÀ EN LIGNE, publiées avant la règle ou dont le dernier
// lieu a été retiré. On ne les dépublie pas : on le leur dit, ici.
//
// Deux cas, lus sur la même lecture :
//   • aucun lieu actif situé : la fiche n'a ni adresse ni distance ;
//   • une étoile de livraison sans lieu PERMANENT situé : le serveur refuse
//     toute livraison (`zone_indisponible`), le commerçant doit le savoir.
//
// ⚠️ UNE LECTURE EN ÉCHEC N'AFFICHE RIEN. Dire « il te manque ton adresse » à
// quelqu'un qui l'a mise, sur une coupure de réseau, serait pire que se taire.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { fichePubliee } from '@/lib/statut-commercant'
import { etatOuMeTrouver } from '@/lib/ou-me-trouver'
import { ecrireSousOnglet } from '@/lib/onglet-url'

export default function BandeauOuMeTrouver({ commercant, onAllerA, cleRafraichir = '' }) {
  const publiee = fichePubliee(commercant)
  const livraisonActive = commercant?.livraison_actif === true
  const concerne = publiee || livraisonActive
  const [etat, setEtat] = useState(null)

  const lire = useCallback(async () => {
    if (!commercant?.id) return
    const [{ data: lieux, error: errLieux }, cfg] = await Promise.all([
      supabase.from('commercant_lieux').select('type, principal, actif, latitude, longitude, adresse')
        .eq('commercant_id', commercant.id).eq('actif', true),
      livraisonActive
        ? supabase.from('livraison_config').select('zone_rayons_m').eq('commercant_id', commercant.id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (errLieux || cfg.error) { setEtat(null); return }
    setEtat(etatOuMeTrouver({ publiee, livraisonActive, lieux: lieux || [], zoneRayons: cfg.data?.zone_rayons_m ?? null }))
  }, [commercant?.id, publiee, livraisonActive])

  useEffect(() => {
    if (!concerne) return
    lire()
  }, [concerne, lire, cleRafraichir])

  if (!concerne || !etat || (!etat.aucunLieu && !etat.etoileSansDepart)) return null

  function allerOuMeTrouver() {
    // Le sous-onglet s'écrit AVANT d'ouvrir le Profil : il le lit en arrivant.
    ecrireSousOnglet('lieux')
    onAllerA?.('profil')
  }

  const rouge = etat.etoileSansDepart
  return (
    <div style={{ margin: '0 0 16px', background: rouge ? '#FEF2F2' : '#FFFBEB', border: `1.5px solid ${rouge ? '#FCA5A5' : '#FCD34D'}`, borderRadius: 14, padding: '13px 15px', display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={rouge ? '#B91C1C' : '#B45309'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>
      </svg>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '0.86rem', fontWeight: 900, color: rouge ? '#B91C1C' : '#92400E' }}>
          {rouge ? 'Tes livraisons sont suspendues' : 'Tes clients ne savent pas où te trouver'}
        </p>
        <p style={{ margin: '3px 0 0', fontSize: '0.78rem', fontWeight: 600, color: rouge ? '#7F1D1D' : '#92400E', lineHeight: 1.45 }}>
          {rouge
            ? 'Ton point de départ des livraisons n’est plus défini : il faut l’adresse de ton commerce dans « Où me trouver ». En attendant, tes clients ne peuvent commander qu’en retrait.'
            : 'Ta fiche n’affiche aucune adresse et aucune distance. Ajoute l’adresse de ton commerce, ou tes emplacements si tu bouges, dans « Où me trouver ». L’adresse de ton inscription ne sert qu’à valider ton dossier.'}
        </p>
      </div>
      {onAllerA && (
        <button type="button" onClick={allerOuMeTrouver}
          style={{ background: rouge ? '#B91C1C' : '#B45309', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', flexShrink: 0 }}>
          Compléter « Où me trouver »
        </button>
      )}
    </div>
  )
}
