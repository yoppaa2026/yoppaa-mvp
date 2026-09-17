'use client'
// L'ORDRE DES CATÉGORIES DU CATALOGUE, RANGÉ PAR LE COMMERÇANT.
//
// 🔴 POURQUOI (Alex, 17/09). L'ordre affiché au client était celui d'apparition
// des articles : un restaurateur ne pouvait pas mettre ses plats avant ses
// boissons, et rien à l'écran ne lui disait pourquoi.
//
// ⚠️ DES FLÈCHES, PAS UN GLISSER-DÉPOSER. Le glisser-déposer se fait sur un
// téléphone en luttant contre le défilement de la page, et il ne dit rien à
// qui navigue au clavier. Deux boutons qui nomment le geste marchent partout,
// du premier coup, et se testent.
//
// ⚠️ ON N'ENREGISTRE PAS À CHAQUE CLIC. Le commerçant déplace plusieurs lignes
// d'affilée ; une écriture par flèche ferait dix requêtes pour un seul geste
// mental, et laisserait la liste à moitié rangée si l'une d'elles échouait.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { listeAOrdonner, ordrePourEnregistrer } from '@/lib/categories-catalogue'

const T = { main: '#6B35C4', mid: '#9660E0', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B', muted: '#6B7280' }

export default function OrdreCategories({ commercantId, commercant, categories = [], toast }) {
  // La liste affichée part de la règle partagée : l'écran de réglage et la
  // fiche publique montrent le même ordre, sinon le commerçant range une liste
  // et ses clients en voient une autre.
  const [liste, setListe] = useState(() => listeAOrdonner(categories, commercant?.ordre_categories))
  const [envoi, setEnvoi] = useState(false)
  const [modifie, setModifie] = useState(false)

  // ⚠️ LE CATALOGUE BOUGE SOUS L'ÉCRAN. Une catégorie créée ou vidée pendant
  // qu'il range doit apparaître ou disparaître ici, sinon il enregistre une
  // liste qui décrit un catalogue qui n'existe plus.
  //
  // ⚠️ MAIS PAS PENDANT QU'IL RANGE : tant qu'il a des changements non
  // enregistrés, on ne lui reprend pas sa liste sous les doigts.
  useEffect(() => {
    if (modifie) return
    setListe(listeAOrdonner(categories, commercant?.ordre_categories))
  }, [categories.join('|'), (commercant?.ordre_categories || []).join('|'), modifie]) // eslint-disable-line react-hooks/exhaustive-deps

  if (categories.length < 2) return null

  function deplacer(index, pas) {
    const cible = index + pas
    if (cible < 0 || cible >= liste.length) return
    const copie = [...liste]
    const tmp = copie[index]
    copie[index] = copie[cible]
    copie[cible] = tmp
    setListe(copie)
    setModifie(true)
  }

  async function enregistrer() {
    if (envoi) return
    setEnvoi(true)
    // On ne garde que des noms qui existent vraiment : une liste qui traîne des
    // catégories supprimées grossit à chaque saison et ne dit plus rien.
    const aEcrire = ordrePourEnregistrer(liste, categories)
    const { error } = await supabase
      .from('commercants')
      .update({ ordre_categories: aEcrire })
      .eq('id', commercantId)
    setEnvoi(false)
    // ⚠️ ON LIT L'ERREUR, ET ON LA DIT. Un `update` non lu est un espoir, pas
    // une action : le commerçant croirait son classement enregistré et
    // retrouverait l'ancien au rechargement, sans comprendre.
    if (error) { toast?.({ type: 'error', msg: `Le classement n'a pas pu être enregistré : ${error.message}` }); return }
    setModifie(false)
    toast?.({ type: 'success', msg: 'Ordre des catégories enregistré. Tes clients le voient tout de suite.' })
  }

  function reinitialiser() {
    setListe([...categories])
    setModifie(true)
  }

  const btnFleche = (actif) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 32, height: 32, borderRadius: 9,
    border: `1.5px solid ${actif ? T.pale : '#F1F0F9'}`,
    background: '#fff', cursor: actif ? 'pointer' : 'not-allowed',
    opacity: actif ? 1 : 0.35, flexShrink: 0, padding: 0,
  })

  return (
    <div style={{ background: '#fff', border: `1.5px solid ${T.pale}`, borderRadius: 16, padding: '1rem', marginBottom: 18 }}>
      <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: 800, color: T.main, textTransform: 'uppercase', letterSpacing: '1px' }}>
        Ordre de mes catégories
      </p>
      <p style={{ margin: '6px 0 12px', fontSize: '0.78rem', color: T.deep, fontWeight: 600, lineHeight: 1.5 }}>
        C&rsquo;est l&rsquo;ordre que tes clients voient sur ta fiche, dans la barre du haut
        comme dans la carte. Monte ce que tu veux mettre en avant.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {liste.map((cat, i) => (
          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FBFAFF', border: `1px solid ${T.pale}`, borderRadius: 10, padding: '7px 9px' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: 900, color: T.muted, width: 20, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: '0.85rem', fontWeight: 700, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
            <button type="button" onClick={() => deplacer(i, -1)} disabled={i === 0}
              style={btnFleche(i > 0)} aria-label={`Monter ${cat}`} title="Monter">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
            <button type="button" onClick={() => deplacer(i, 1)} disabled={i === liste.length - 1}
              style={btnFleche(i < liste.length - 1)} aria-label={`Descendre ${cat}`} title="Descendre">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.main} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M19 12l-7 7-7-7"/>
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* ⚠️ LE BOUTON NE S'ALLUME QUE S'IL Y A QUELQUE CHOSE À ENREGISTRER, et
          il dit le GESTE. Un bouton toujours actif laisse croire qu'on a oublié
          de cliquer. */}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={enregistrer} disabled={!modifie || envoi}
          style={{
            padding: '0.6rem 1.1rem', borderRadius: 100, border: 'none', cursor: modifie && !envoi ? 'pointer' : 'not-allowed',
            fontWeight: 800, fontSize: '0.82rem', fontFamily: '"DM Sans", sans-serif',
            background: modifie && !envoi ? `linear-gradient(135deg, ${T.main}, ${T.mid})` : '#E9E7F2',
            color: modifie && !envoi ? '#fff' : T.muted,
          }}>
          {envoi ? 'Enregistrement…' : 'Enregistrer cet ordre'}
        </button>
        {commercant?.ordre_categories?.length > 0 && (
          <button type="button" onClick={reinitialiser}
            style={{ padding: '0.6rem 0.9rem', borderRadius: 100, border: `1.5px solid ${T.pale}`, background: '#fff', color: T.deep, fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
            Revenir à l&rsquo;ordre par défaut
          </button>
        )}
      </div>
    </div>
  )
}
