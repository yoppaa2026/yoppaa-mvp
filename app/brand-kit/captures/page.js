'use client'
// ════════════════════════════════════════════════════════════════════
// LES VISUELS DES STORES — yoppaa.app/brand-kit/captures
//
// Alex photographie sur son téléphone ; cette page pose chaque capture sur un
// fond aux dimensions EXACTES que le store exige, avec un titre.
//
// ⚠️ POURQUOI UNE MISE EN PAGE, ET PAS UN SIMPLE REDIMENSIONNEMENT.
// Ce n'est pas qu'une question de goût : c'est ce qui rend les deux formats
// possibles sans jamais déformer.
//
//   🔴 L'ÉTIREMENT SILENCIEUX. `scripts/preparer-captures-stores.mjs` étirait
//      tant que l'écart de ratio restait sous 3 %. Les captures d'Alex font
//      1080 × 2400 (0,45) ; le format d'Apple, 1290 × 2796 (0,4613). L'écart
//      vaut 2,5 %. Juste SOUS le seuil : il aurait étiré les prix et les
//      visages de 2,5 %, sans un mot.
//
//   🔴 LE FORMAT ANDROID ÉTAIT HORS RÈGLES. Google demande un ratio entre 16:9
//      et 9:16, soit 0,5625 AU MINIMUM. Le script produisait du 1080 × 2340,
//      soit 0,4615. Le bon format est 1080 × 1920, et une capture 9:20 n'y
//      entre pas sans mise en page.
//
// Ici, la capture est posée À SA TAILLE sur un fond au format du store. Le
// ratio du fond est celui qu'on veut, quelle que soit la source.
//
// ⚠️ APPLE NE REGARDE PAS D'OÙ VIENT UNE IMAGE, il regarde ses dimensions. Les
// captures Android servent donc aux deux stores : c'est la même application web
// dans Capacitor des deux côtés, et on coupe la barre d'état, qui est la seule
// chose qui trahissait le système.
//
// 🔴 POURQUOI DU CANVAS ET PAS DU SVG, comme le reste du brand-kit.
// Une capture pèse 1 à 2 Mo ; en base64 dans un SVG, puis encodée en data URL
// pour `new Image()`, on dépasse ce que les navigateurs acceptent, et l'échec
// est SILENCIEUX. En canvas, ce qui s'affiche EST ce qui se télécharge.
//
// 🔴 ET LA POLICE PEUT MANQUER SANS RIEN DIRE. Mesuré : trois rendus d'un même
// titre, avec et sans la police, sortaient au pixel identique. Tant qu'elle
// n'est pas chargée, cette page REFUSE de télécharger quoi que ce soit.

import { useState, useEffect, useRef, useCallback } from 'react'
import { T, FORMATS, VISUELS, RECADRAGE_DEFAUT, dessiner } from '@/lib/captures-stores'

// ────────── LA PAGE ──────────
export default function CapturesStores() {
  // 🔴 LES TROIS ÉTATS DE LA POLICE, comme dans le brand-kit. `fallback` n'est
  // PAS un repli : c'est un arrêt. Un visuel dans une police système passerait
  // inaperçu jusqu'à ce qu'il soit en ligne sur les deux stores.
  const [police, setPolice] = useState('chargement')
  const [format, setFormat] = useState(FORMATS[0])
  const [images, setImages] = useState({})
  const [recadrage, setRecadrage] = useState(RECADRAGE_DEFAUT)
  const canvasRefs = useRef({})

  useEffect(() => {
    let vivant = true
    const charger = (graisse, poids) =>
      new FontFace(
        'Plus Jakarta Sans',
        'url(https://cdn.jsdelivr.net/npm/@fontsource/plus-jakarta-sans@5.0.20/files/plus-jakarta-sans-latin-' + graisse + '-normal.woff2)',
        { weight: poids },
      ).load()

    // ⚠️ Une police ne « tainte » pas un canvas : seules les images d'une autre
    // origine le font. On peut donc la charger depuis le CDN sans casser
    // l'export PNG, contrairement aux captures, qui restent locales.
    Promise.all([charger(800, '800'), charger(600, '600')])
      .then((faces) => {
        if (!vivant) return
        for (const f of faces) document.fonts.add(f)
        return document.fonts.ready
      })
      .then(() => { if (vivant) setPolice('prete') })
      .catch((e) => {
        console.error('🔴 Police non chargée :', e)
        if (vivant) setPolice('absente')
      })
    return () => { vivant = false }
  }, [])

  const redessiner = useCallback(() => {
    if (police !== 'prete') return
    for (const v of VISUELS) {
      const cv = canvasRefs.current[v.n]
      if (!cv) continue
      cv.width = format.l
      cv.height = format.h
      dessiner(cv.getContext('2d'), format, v, images[v.n] || null, recadrage)
    }
  }, [police, format, images, recadrage])

  useEffect(() => { redessiner() }, [redessiner])

  function recevoir(n, fichier) {
    if (!fichier) return
    const lecteur = new FileReader()
    lecteur.onload = () => {
      const img = new Image()
      img.onload = () => setImages((prec) => ({ ...prec, [n]: img }))
      img.src = lecteur.result
    }
    lecteur.readAsDataURL(fichier)
  }

  function telecharger(n) {
    const cv = canvasRefs.current[n]
    if (!cv || police !== 'prete') return
    cv.toBlob((b) => {
      if (!b) { alert('Le navigateur n a pas pu produire le PNG. Reessaie.'); return }
      const url = URL.createObjectURL(b)
      const a = document.createElement('a')
      a.href = url
      a.download = 'yoppaa-' + format.id + '-' + String(n).padStart(2, '0') + '.png'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 200)
    }, 'image/png', 1)
  }

  function toutTelecharger() {
    const prets = VISUELS.filter((v) => images[v.n])
    prets.forEach((v, i) => setTimeout(() => telecharger(v.n), i * 400))
  }

  const nbPrets = VISUELS.filter((v) => images[v.n]).length

  return (
    <main style={{ minHeight: '100vh', background: T.bg, padding: '32px 20px 80px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        <h1 style={{ fontSize: 30, fontWeight: 800, color: T.ink, margin: '0 0 6px' }}>
          Les visuels des stores
        </h1>
        <p style={{ color: '#6B7280', margin: '0 0 24px', lineHeight: 1.55 }}>
          Dépose tes captures, choisis le format, télécharge. Tes images ne quittent
          jamais ce navigateur. Les mêmes captures servent aux deux stores.
        </p>

        {police === 'chargement' && (
          <Bandeau fond={T.pale} bord={T.light} texte={T.ink}>
            Chargement de la police de la marque...
          </Bandeau>
        )}
        {police === 'absente' && (
          <Bandeau fond="#FEE2E2" bord="#DC2626" texte="#7F1D1D">
            <strong>La police de la marque n a pas pu être chargée.</strong> Le téléchargement
            est bloqué volontairement : sans elle, les titres sortiraient dans une police
            système, et rien ne le dirait avant que les visuels soient en ligne. Vérifie ta
            connexion et recharge la page.
          </Bandeau>
        )}

        {/* ── Le format ── */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '22px 0 10px' }}>
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFormat(f)}
              style={{
                padding: '11px 18px', borderRadius: 999, cursor: 'pointer',
                border: '2px solid ' + (format.id === f.id ? T.main : '#E5E7EB'),
                background: format.id === f.id ? T.main : '#FFFFFF',
                color: format.id === f.id ? '#FFFFFF' : T.ink,
                fontWeight: 700, fontSize: 14,
              }}
            >
              {f.nom} · {f.l} × {f.h}
            </button>
          ))}
        </div>
        <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 22px' }}>{format.note}</p>

        {/* ── Le recadrage ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 14, padding: 18, marginBottom: 26 }}>
          <div style={{ fontWeight: 700, color: T.ink, marginBottom: 4 }}>Ce qu on coupe de ta capture</div>
          <p style={{ color: '#6B7280', fontSize: 13, margin: '0 0 14px', lineHeight: 1.5 }}>
            En haut, la barre d état : ton heure, ta batterie et ton Bluetooth n apprennent
            rien à personne, et c est la seule chose qui disait de quel téléphone vient la
            capture. En bas, la barre de gestes.
          </p>
          {[['haut', 'En haut'], ['bas', 'En bas']].map(([cle, libelle]) => (
            <label key={cle} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ width: 70, fontSize: 14, color: T.ink }}>{libelle}</span>
              <input
                type="range" min="0" max="12" step="0.1" value={recadrage[cle]}
                onChange={(e) => setRecadrage((p) => ({ ...p, [cle]: Number(e.target.value) }))}
                style={{ flex: 1, accentColor: T.main }}
              />
              <span style={{ width: 54, fontSize: 14, color: '#6B7280', textAlign: 'right' }}>
                {recadrage[cle].toFixed(1)} %
              </span>
            </label>
          ))}
        </div>

        {/* ── Tout télécharger ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22, flexWrap: 'wrap' }}>
          <button
            onClick={toutTelecharger}
            disabled={police !== 'prete' || nbPrets === 0}
            style={{
              padding: '13px 24px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: 15,
              cursor: police === 'prete' && nbPrets ? 'pointer' : 'not-allowed',
              background: police === 'prete' && nbPrets ? T.main : '#D1D5DB',
              color: '#FFFFFF',
            }}
          >
            Télécharger les {nbPrets || ''} visuels en {format.nom}
          </button>
          <span style={{ color: '#6B7280', fontSize: 14 }}>
            {nbPrets} capture{nbPrets > 1 ? 's' : ''} sur {VISUELS.length} déposée{nbPrets > 1 ? 's' : ''}
          </span>
        </div>

        {/* ── Les huit ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(255px, 1fr))', gap: 22 }}>
          {VISUELS.map((v) => (
            <div key={v.n} style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.main, letterSpacing: 0.4 }}>
                  VISUEL {v.n}
                </div>
                <div style={{ fontWeight: 700, color: T.ink, fontSize: 15, margin: '3px 0 2px' }}>{v.titre}</div>
                <div style={{ fontSize: 12.5, color: '#6B7280', lineHeight: 1.45 }}>{v.attendu}</div>
              </div>

              <div style={{ background: T.ink, padding: 10 }}>
                <canvas
                  ref={(el) => { canvasRefs.current[v.n] = el }}
                  style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 6 }}
                />
              </div>

              <div style={{ padding: 12, display: 'flex', gap: 8 }}>
                <label
                  style={{
                    flex: 1, textAlign: 'center', padding: '9px 10px', borderRadius: 10, cursor: 'pointer',
                    border: '1.5px solid ' + T.light, color: T.main, fontWeight: 700, fontSize: 13,
                  }}
                >
                  {images[v.n] ? 'Changer' : 'Déposer'}
                  <input
                    type="file" accept="image/png,image/jpeg" style={{ display: 'none' }}
                    onChange={(e) => recevoir(v.n, e.target.files && e.target.files[0])}
                  />
                </label>
                <button
                  onClick={() => telecharger(v.n)}
                  disabled={!images[v.n] || police !== 'prete'}
                  style={{
                    flex: 1, padding: '9px 10px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 13,
                    cursor: images[v.n] && police === 'prete' ? 'pointer' : 'not-allowed',
                    background: images[v.n] && police === 'prete' ? T.main : '#E5E7EB',
                    color: images[v.n] && police === 'prete' ? '#FFFFFF' : '#9CA3AF',
                  }}
                >
                  Télécharger
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ⚠️ LE RAPPEL QUI COMPTE PLUS QUE LE FORMAT. Une capture montrant une
            enseigne qui se dit « test », « témoin » ou « provisoire » dit au
            relecteur qu'il regarde un brouillon. Deux existent aujourd'hui. */}
        <div style={{ marginTop: 34, background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 14, padding: 18 }}>
          <div style={{ fontWeight: 700, color: '#78350F', marginBottom: 6 }}>
            Avant de déposer chez Apple et Google
          </div>
          <p style={{ color: '#78350F', fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
            Relis chaque visuel et vérifie qu aucune enseigne ne s y dit « test », « témoin »
            ou « provisoire ». Deux descriptions le font encore : <strong>Ciseaux
            Provisoires</strong> dans la Coupe femme du Salon Nathalie, et <strong>La Boutique
            Témoin</strong> chez Le Dressing de Sophie. C est la première chose que le
            relecteur lit.
          </p>
        </div>

      </div>
    </main>
  )
}

function Bandeau({ fond, bord, texte, children }) {
  return (
    <div style={{ background: fond, border: '1px solid ' + bord, color: texte, borderRadius: 12, padding: '13px 16px', fontSize: 14, lineHeight: 1.55 }}>
      {children}
    </div>
  )
}
