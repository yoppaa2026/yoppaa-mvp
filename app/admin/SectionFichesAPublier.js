'use client'
// Section admin : LES FICHES VALIDÉES QUI NE SONT PAS ENCORE EN LIGNE.
//
// 🔴 POURQUOI ELLE EXISTE (Alex, 28/09) : « les commerçants ne complètent pas
// leurs fiches, je ne peux pas laisser les fiches non complétées être
// publiées ». Valider ouvre désormais l'espace sans publier ; ce bloc est
// l'endroit où Alex voit qui avance, relance ceux qui n'avancent pas, et
// publie ceux qui sont prêts.
//
// ⚠️ LA LISTE VIENT DU SERVEUR, calculée par la même règle que le tableau de
// bord du commerçant et que la route « Publier » (lib/fiche-complete.js) :
// Alex, le commerçant et le serveur voient donc la MÊME fiche.
//
// ⚠️ LE BOUTON « PUBLIER » N'APPARAÎT QUE SUR UNE FICHE COMPLÈTE, et le
// serveur la recalcule encore au clic : entre l'affichage et le clic, un
// article a pu être retiré.

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { demarrerModeAdmin } from './ouvrirTableauDeBord'
import { Globe, Send, RefreshCw, Phone, Mail, Check, Circle, Eye } from 'lucide-react'
import { attenteDepuis } from '@/lib/statut-commercant'

const T = {
  main: '#6B35C4', pale: '#EDE0FF', ink: '#1A0840', deep: '#2D0F6B',
  muted: '#6B7280', hairline: '#EEE9F5', vert: '#059669', vertPale: '#ECFDF5',
  orange: '#C2410C', orangePale: '#FFF7ED',
}

async function appeler(chemin, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(chemin, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token || ''}`,
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.ok) throw new Error(json.error || `erreur ${res.status}`)
  return json
}

// Les demandes de mise en ligne d'abord : ce sont elles qui attendent Alex.
// Puis les fiches les plus avancées, qui sont les plus proches d'être publiées.
function trier(fiches) {
  return [...fiches].sort((a, b) => {
    const da = a.publication_demandee_at ? 1 : 0
    const db = b.publication_demandee_at ? 1 : 0
    if (da !== db) return db - da
    if (a.complet !== b.complet) return a.complet ? -1 : 1
    return (b.faits / (b.total || 1)) - (a.faits / (a.total || 1))
  })
}

export default function SectionFichesAPublier({ toast }) {
  const router = useRouter()
  const [fiches, setFiches] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [enCours, setEnCours] = useState(null)
  // Quelle ligne attend une confirmation, et de quoi : { id, geste }.
  const [aConfirmer, setAConfirmer] = useState(null)

  const charger = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const json = await appeler('/api/admin/fiches-a-publier')
      setFiches(trier(json.fiches || []))
    } catch (e) {
      // 🔴 ON LIT L'ERREUR. Une liste vide et une lecture en échec se
      // ressemblent à l'écran, et la seconde se lirait « tout est en ligne ».
      setErr(e.message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { charger() }, [charger])

  async function relancer(f) {
    setEnCours(f.id); setAConfirmer(null)
    try {
      const json = await appeler('/api/admin/relancer-fiche', { method: 'POST', body: JSON.stringify({ commercant_id: f.id }) })
      toast?.(json.avertissement || `Relance envoyée à ${f.nom}`, json.avertissement ? 'error' : 'success')
      await charger()
    } catch (e) {
      toast?.(`Relance non envoyée : ${e.message}`, 'error')
    }
    setEnCours(null)
  }

  async function publier(f) {
    setEnCours(f.id); setAConfirmer(null)
    try {
      const json = await appeler('/api/admin/publier', { method: 'POST', body: JSON.stringify({ commercant_id: f.id }) })
      toast?.(`${f.nom} est en ligne · email : ${json.email || 'déjà publiée'}`, 'success')
      await charger()
    } catch (e) {
      toast?.(`Pas publiée : ${e.message}`, 'error')
    }
    setEnCours(null)
  }

  async function voir(f) {
    try {
      await demarrerModeAdmin(f.id, 'Relecture avant mise en ligne')
      router.push('/dashboard')
    } catch (e) {
      toast?.(`Erreur impersonation : ${e.message}`, 'error')
    }
  }

  const nbDemandes =fiches.filter(f => f.publication_demandee_at).length

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${T.hairline}`, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
        <Globe size={18} strokeWidth={2.2} color={T.main}/>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: T.ink, letterSpacing: '-0.3px' }}>
          Fiches à mettre en ligne
        </h2>
        <span style={{ background: T.pale, color: T.main, fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>
          {fiches.length}
        </span>
        {nbDemandes > 0 && (
          <span style={{ background: T.vertPale, color: T.vert, fontSize: 12, fontWeight: 800, padding: '3px 10px', borderRadius: 999 }}>
            {nbDemandes} {nbDemandes > 1 ? 'demandes' : 'demande'} de mise en ligne
          </span>
        )}
        <button onClick={charger} disabled={loading} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px solid ${T.hairline}`, borderRadius: 10, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: T.muted, cursor: loading ? 'wait' : 'pointer' }}>
          <RefreshCw size={13} strokeWidth={2.2}/> {loading ? 'Lecture…' : 'Actualiser'}
        </button>
      </div>

      <p style={{ fontSize: 13, color: T.muted, margin: '0 0 14px', lineHeight: 1.6 }}>
        Ces commerçants sont validés : leur tableau de bord est ouvert, mais leur fiche
        n&apos;est <strong style={{ color: T.deep }}>visible par personne</strong>. Elle part en ligne
        quand tu cliques sur « Publier », et ce bouton n&apos;apparaît que sur une fiche complète.
      </p>

      {err && (
        <p style={{ fontSize: 13, color: '#B91C1C', margin: '0 0 12px', fontWeight: 700 }}>
          Lecture impossible : {err}. Rien ne dit que la liste est vide, seulement qu&apos;on n&apos;a pas pu regarder.
        </p>
      )}

      {!err && !loading && fiches.length === 0 && (
        <p style={{ fontSize: 13, color: T.muted, margin: 0 }}>
          Aucune fiche en attente : tous les commerçants validés sont en ligne.
        </p>
      )}

      {fiches.map((f) => {
        const occupe = enCours === f.id
        const confirme = aConfirmer?.id === f.id ? aConfirmer.geste : null
        const demande = f.publication_demandee_at ? attenteDepuis(f.publication_demandee_at) : null
        const relance = f.relance_fiche_envoyee_at ? attenteDepuis(f.relance_fiche_envoyee_at) : null
        return (
          <div key={f.id} style={{ borderTop: `1px solid ${T.hairline}`, padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: T.ink }}>{f.nom || 'Sans nom'}</p>
              <span style={{ fontSize: 12, fontWeight: 800, color: f.complet ? T.vert : T.orange }}>
                {f.complet ? 'Complète' : `${f.faits} sur ${f.total}`}
              </span>
              {demande && (
                <span style={{ background: T.vertPale, color: T.vert, fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999 }}>
                  Demande sa mise en ligne · {demande.texte}
                </span>
              )}
              {f.statut_publication === 'suspendu' && (
                <span style={{ background: '#F3F4F6', color: T.muted, fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999 }}>
                  Retirée par toi
                </span>
              )}
            </div>

            {/* Chaque critère, fait ou pas : Alex voit d'un coup d'œil ce qu'il
                demandera au téléphone. */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {f.criteres.map(k => (
                <span key={k.cle} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 9px', borderRadius: 8, background: k.atteint ? T.vertPale : T.orangePale, color: k.atteint ? T.vert : T.orange }}>
                  {k.atteint ? <Check size={12} strokeWidth={3}/> : <Circle size={10} strokeWidth={3}/>}
                  {k.label}{!k.atteint && k.avancement ? ` (${k.avancement})` : ''}
                </span>
              ))}
            </div>

            <p style={{ margin: 0, fontSize: 12.5, color: T.muted }}>
              {relance
                ? <>Relancé {relance.texte}{f.relances_fiche_nb > 1 ? ` · ${f.relances_fiche_nb} relances en tout` : ''}</>
                : 'Jamais relancé'}
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {f.telephone && (
                <a href={`tel:${f.telephone}`} style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.pale, color: T.main, textDecoration: 'none', fontSize: 12.5, fontWeight: 800, padding: '7px 12px', borderRadius: 10 }}>
                  <Phone size={13} strokeWidth={2.4}/> {f.telephone}
                </a>
              )}
              {f.email && (
                <a href={`mailto:${f.email}`} style={{ display: 'flex', alignItems: 'center', gap: 6, border: `1.5px solid ${T.hairline}`, color: T.deep, textDecoration: 'none', fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 10 }}>
                  <Mail size={13} strokeWidth={2.4}/> {f.email}
                </a>
              )}
              {/* 🔴 PAS DE LIEN VERS LA FICHE PUBLIQUE (Alex, 29/09) : elle
                  n'existe pas avant la publication, on atterrissait sur la
                  liste des commerces. Le tableau de bord, lui, montre comment
                  la fiche a été remplie, photos comprises. */}
              <button onClick={() => voir(f)} disabled={occupe} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1.5px solid ${T.hairline}`, color: T.deep, fontSize: 12.5, fontWeight: 700, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }}>
                <Eye size={13} strokeWidth={2.2}/> Voir Dashboard →
              </button>

              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* ⚠️ UNE CONFIRMATION QUI DIT À QUI ET QUOI. Un email parti ne
                    se rattrape pas, et le commerçant le lit comme venant d'Alex. */}
                {confirme === 'relancer' ? (
                  <>
                    <span style={{ fontSize: 12.5, color: T.deep, fontWeight: 700 }}>Envoyer la relance à {f.email} ?</span>
                    <button onClick={() => relancer(f)} style={boutonPlein(T.main)}>Envoyer</button>
                    <button onClick={() => setAConfirmer(null)} style={boutonVide}>Ne rien faire</button>
                  </>
                ) : confirme === 'publier' ? (
                  <>
                    <span style={{ fontSize: 12.5, color: T.deep, fontWeight: 700 }}>Mettre {f.nom} en ligne ? Son email et son kit partent aussitôt.</span>
                    <button onClick={() => publier(f)} style={boutonPlein(T.vert)}>Publier</button>
                    <button onClick={() => setAConfirmer(null)} style={boutonVide}>Ne rien faire</button>
                  </>
                ) : (
                  <>
                    {!f.complet && f.email && (
                      <button onClick={() => setAConfirmer({ id: f.id, geste: 'relancer' })} disabled={occupe} style={boutonPlein(T.main, occupe)}>
                        <Send size={13} strokeWidth={2.4}/> {occupe ? 'Envoi…' : 'Relancer par email'}
                      </button>
                    )}
                    {f.complet && (
                      <button onClick={() => setAConfirmer({ id: f.id, geste: 'publier' })} disabled={occupe} style={boutonPlein(T.vert, occupe)}>
                        <Globe size={13} strokeWidth={2.4}/> {occupe ? 'Publication…' : 'Publier'}
                      </button>
                    )}
                  </>
                )}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function boutonPlein(fond, occupe = false) {
  return { display: 'flex', alignItems: 'center', gap: 6, background: fond, color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 12.5, fontWeight: 800, cursor: occupe ? 'wait' : 'pointer', opacity: occupe ? 0.7 : 1, fontFamily: '"DM Sans", sans-serif' }
}

const boutonVide = { background: 'none', border: `1.5px solid ${T.hairline}`, color: T.muted, borderRadius: 10, padding: '7px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: '"DM Sans", sans-serif' }
