'use client'
// LA TABLETTE DU COMPTOIR, DANS L'APP « YOPPAA COMPTOIR » (12/10).
//
// Ce fichier ne fait rien hors de l'app : sans l'extension Brother compilée
// dans le binaire (`brotherNatif`), il ne rend rien et ne lance rien. Dans
// l'app, il apporte :
//   - le réglage « Cette tablette est l'imprimante du comptoir » : chercher
//     la Brother sur le Wi-Fi, la retenir, déclarer la tablette ;
//   - la BOUCLE : toutes les 3 secondes, prendre la file, dessiner chaque
//     étiquette (lib/etiquette-image.js), l'imprimer, rendre le résultat.
//
// ⚠️ UNE IMPRESSION À LA FOIS, et on attend la réponse de la Brother avant la
// suivante : l'extension rend son résultat par des ÉVÉNEMENTS (onPrint,
// onPrintError, onPrintFailedCommunication), pas par la promesse.

import { useCallback, useEffect, useRef, useState } from 'react'
import { postPro } from '@/lib/fetch-pro'
import DotsAttente from '@/app/components/DotsAttente'
import { etiquetteEnBase64, policeMarqueDeLaPage } from '@/lib/etiquette-image'
import { INTERVALLE_FILE_MS } from '@/lib/file-etiquettes'
import {
  brotherNatif, imprimanteValide, optionsImpression, raisonDepuisErreur, identifiantAppareil,
  DELAI_IMPRESSION_MS, CLE_IMPRIMANTE,
} from '@/lib/station-comptoir'

const T = { ink: '#1A0840', deep: '#2D0F6B', main: '#6B35C4', pale: '#EDE0FF', muted: '#6B7280', vert: '#047857', erreur: '#B91C1C' }

const lire = (cle) => { try { return window.localStorage.getItem(cle) } catch { return null } }
const ecrire = (cle, v) => { try { v == null ? window.localStorage.removeItem(cle) : window.localStorage.setItem(cle, v) } catch { /* réglage d'appareil : la séance continue sans */ } }

// 🔴 LE RÉSULTAT DOIT ARRIVER : perdu, l'étiquette reviendrait dans la file
// après 90 s et SORTIRAIT UNE DEUXIÈME FOIS. Trois essais, une seconde d'écart.
async function rendreResultat(corps) {
  for (let essai = 0; essai < 3; essai++) {
    const res = await postPro('/api/impression/resultat', corps)
    const j = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
    if (j?.ok) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  console.error('[comptoir] résultat non rendu', corps.id)
  return false
}

/** L'extension Brother et l'imprimante retenue, pour CET appareil. `null` hors de l'app. */
export function useBrother() {
  const [brother, setBrother] = useState(null)
  const [imprimante, setImprimante] = useState(null)
  const attente = useRef(null) // { resoudre, rejeter, minuterie }
  useEffect(() => {
    const b = brotherNatif(window)
    if (!b) return
    setBrother(b)
    try { const i = JSON.parse(lire(CLE_IMPRIMANTE) || 'null'); if (imprimanteValide(i)) setImprimante(i) } catch { /* rien de retenu */ }
    const poignees = []
    const finir = (ok, raison = null) => {
      const a = attente.current
      if (!a) return
      clearTimeout(a.minuterie)
      attente.current = null
      ok ? a.resoudre() : a.rejeter(raison)
    }
    ;(async () => {
      poignees.push(await b.addListener('onPrint', () => finir(true)))
      poignees.push(await b.addListener('onPrintError', (info) => finir(false, raisonDepuisErreur(info))))
      poignees.push(await b.addListener('onPrintFailedCommunication', (info) => finir(false, raisonDepuisErreur(info, { communication: true }))))
    })()
    return () => { poignees.forEach(p => p?.remove?.()) }
  }, [])

  // Imprime UNE image ; résolue quand la Brother dit « imprimée », rejetée
  // avec la raison sinon (ou « injoignable » après 30 s sans réponse).
  const imprimer = useCallback((encodedImage) => new Promise((resoudre, rejeter) => {
    if (!brother || !imprimanteValide(imprimante)) { rejeter('injoignable'); return }
    if (attente.current) { rejeter('autre'); return }
    const minuterie = setTimeout(() => { attente.current = null; rejeter('injoignable') }, DELAI_IMPRESSION_MS)
    attente.current = { resoudre, rejeter, minuterie }
    Promise.resolve(brother.printImage(optionsImpression(imprimante, encodedImage))).catch(() => {
      if (attente.current) { clearTimeout(minuterie); attente.current = null; rejeter('autre') }
    })
  }), [brother, imprimante])

  const retenir = (i) => { if (imprimanteValide(i)) { ecrire(CLE_IMPRIMANTE, JSON.stringify(i)); setImprimante(i) } }
  return { brother, imprimante, imprimer, retenir }
}

/**
 * LA BOUCLE DE LA STATION : seulement si CETTE tablette est la station
 * déclarée et qu'une imprimante est retenue. Ne rend rien.
 */
export function BoucleStation({ commercantId, comptoir, brother: b }) {
  const enCours = useRef(false)
  const actif = !!b?.brother && imprimanteValide(b?.imprimante) && !!comptoir?.etat?.station?.cetAppareil
  useEffect(() => {
    if (!actif || !commercantId) return
    const appareil_id = identifiantAppareil()
    let arrete = false
    async function tour() {
      if (enCours.current || arrete) return
      enCours.current = true
      try {
        const res = await postPro('/api/impression/file', { commercant_id: commercantId, appareil_id })
        const j = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
        if (!j?.ok) { if (j?.pas_la_station) comptoir.relire?.(); return }
        for (const e of j.etiquettes || []) {
          if (arrete) return
          let raison = null
          try {
            for (const contenu of e.contenus || []) {
              await b.imprimer(etiquetteEnBase64(contenu, { policeMarque: policeMarqueDeLaPage() }))
            }
          } catch (r) { raison = typeof r === 'string' ? r : 'autre' }
          await rendreResultat({ commercant_id: commercantId, appareil_id, id: e.id, ok: !raison, raison })
        }
        if ((j.etiquettes || []).length > 0) comptoir.relire?.()
      } finally {
        enCours.current = false
      }
    }
    tour()
    const t = setInterval(tour, INTERVALLE_FILE_MS)
    return () => { arrete = true; clearInterval(t) }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- relancée seulement quand la station change d'état
  }, [actif, commercantId])
  return null
}

/**
 * LE RÉGLAGE DE LA TABLETTE, dans « Étiquettes de commande » : seulement dans
 * l'app. Chercher la Brother, la retenir, déclarer cette tablette.
 */
export function ReglageTablette({ commercantId, comptoir, brother: b }) {
  const [trouvees, setTrouvees] = useState([])
  const [etape, setEtape] = useState(null) // 'recherche' | 'declaration'
  const [message, setMessage] = useState(null)
  useEffect(() => {
    if (!b?.brother) return
    let poignee = null
    ;(async () => {
      poignee = await b.brother.addListener('onPrinterAvailable', (p) => {
        if (!p?.channelInfo) return
        setTrouvees(prev => prev.some(x => x.channelInfo === p.channelInfo) ? prev : [...prev, p])
      })
    })()
    return () => { poignee?.remove?.() }
  }, [b?.brother])
  if (!b?.brother) return null
  const station = comptoir?.etat?.station

  async function chercher() {
    if (etape) return
    setEtape('recherche'); setMessage(null); setTrouvees([])
    try { await b.brother.search({ port: 'wifi', searchDuration: 10 }) } catch { setMessage('La recherche n’a pas pu démarrer. Vérifie le Wi-Fi de la tablette.') }
    setTimeout(() => setEtape(e => (e === 'recherche' ? null : e)), 10500)
  }
  async function declarer() {
    if (etape || !imprimanteValide(b.imprimante)) return
    setEtape('declaration'); setMessage(null)
    const res = await postPro('/api/impression/station', { commercant_id: commercantId, action: 'declarer', appareil_id: identifiantAppareil(), nom: 'Tablette du comptoir' })
    const j = typeof res?.json === 'function' ? await res.json().catch(() => null) : null
    setEtape(null)
    if (!j?.ok) { setMessage(j?.error || 'La tablette n’a pas pu être déclarée. Réessaie.'); return }
    comptoir.relire?.()
    setMessage('Cette tablette imprime désormais toutes les étiquettes du commerce.')
  }
  const bouton = (actif) => ({ padding: '8px 14px', borderRadius: 100, border: actif ? 'none' : `1px solid ${T.pale}`, background: actif ? T.main : '#fff', color: actif ? '#fff' : T.ink, fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 })

  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: '#F8F5FF', border: `1px solid ${T.pale}` }}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: T.ink }}>Cette tablette</p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5, color: T.deep }}>
        {b.imprimante ? `Imprimante : ${b.imprimante.modelName || 'Brother'} (${b.imprimante.channelInfo}).` : 'Aucune imprimante choisie : cherche la Brother sur le Wi-Fi.'}
        {station?.cetAppareil ? ' C’est l’imprimante du comptoir.' : ''}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={chercher} disabled={!!etape} style={bouton(false)}>
          {etape === 'recherche' ? <DotsAttente/> : null} Chercher la Brother
        </button>
        {imprimanteValide(b.imprimante) && !station?.cetAppareil && (
          <button type="button" onClick={declarer} disabled={!!etape} style={bouton(true)}>
            {etape === 'declaration' ? <DotsAttente/> : null} Cette tablette est l&rsquo;imprimante du comptoir
          </button>
        )}
      </div>
      {trouvees.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 6 }}>
          {trouvees.map(p => (
            <li key={p.channelInfo}>
              <button type="button" onClick={() => { b.retenir({ port: 'wifi', channelInfo: p.channelInfo, modelName: p.modelName || 'QL-820NWB' }); setMessage(`${p.modelName || 'Brother'} retenue.`) }}
                style={{ ...bouton(b.imprimante?.channelInfo === p.channelInfo), width: '100%', justifyContent: 'space-between' }}>
                <span>{p.modelName || 'Brother'}</span><span style={{ fontWeight: 600 }}>{p.channelInfo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {etape === null && trouvees.length === 0 && message === null && !b.imprimante && (
        <p style={{ margin: '8px 0 0', fontSize: 12.5, color: T.muted }}>La Brother doit être allumée et sur le même Wi-Fi que la tablette.</p>
      )}
      {message && <p role="status" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: T.deep }}>{message}</p>}
    </div>
  )
}
