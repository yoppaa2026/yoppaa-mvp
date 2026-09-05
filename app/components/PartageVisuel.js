'use client'
// LE BOUTON DE PARTAGE, ET SON APERÇU.
//
// ⚠️ UN SEUL COMPOSANT POUR LES QUATRE ENDROITS : le générateur, les invendus,
// les deals et les actualités. En écrire quatre aurait garanti qu'ils divergent
// au premier ajustement, comme le libellé du bon cadeau avant le 31/08.
//
// ⚠️ L'APERÇU N'EST PAS UN LUXE, C'EST LA CONDITION D'USAGE. Un commerçant ne
// partage pas une image qu'il n'a pas vue. Demande d'Alex du 05/09 : « il
// faudra penser à afficher un exemple dans le générateur pour donner envie ».
//
// 🔴 IL N'Y A PAS DE PUBLICATION AUTOMATIQUE, ET IL NE PEUT PAS Y EN AVOIR.
// Facebook a supprimé le texte pré-rempli en 2017 et l'interdit dans sa
// politique ; Instagram n'a aucun partage depuis le web. Le bouton dit donc
// « Partager », jamais « Publier sur Facebook » : un bouton qui promet plus
// qu'il ne fait se paie une fois, à la première déception.

import { useEffect, useState } from 'react'
import { FORMATS, FORMAT_CARRE, FORMAT_PAYSAGE, contenuVisuel } from '@/lib/visuel-partage'

const T = { main: '#6B35C4', mid: '#9660E0', pale: '#EDE0FF', ink: '#1A0840', muted: '#6B7280', hairline: '#EEE9F5' }

export default function PartageVisuel({ annonce, texte = '', slug = '', toast = null }) {
  const [format, setFormat] = useState(FORMAT_CARRE)
  const [apercu, setApercu] = useState(null)
  const [occupe, setOccupe] = useState(false)

  // ⚠️ LA CARTE SE REDESSINE QUAND L'ANNONCE CHANGE, pas une fois pour toutes :
  // dans le générateur, le commerçant bascule d'une proposition à l'autre et
  // doit voir la sienne, pas la précédente.
  //
  // ⚠️ ET LE MODULE DE TRACÉ EST CHARGÉ À LA DEMANDE. Il ne sert qu'ici, et il
  // ne peut tourner que dans un navigateur : l'importer en haut de fichier
  // l'aurait embarqué dans le premier chargement de tous les écrans.
  const cle = JSON.stringify(annonce || null) + format
  useEffect(() => {
    let vivant = true
    if (!contenuVisuel(annonce || {})) { setApercu(null); return }
    import('@/lib/visuel-partage-canvas')
      .then(m => m.visuelEnApercu(annonce, format))
      .then(url => { if (vivant) setApercu(url) })
      .catch(() => { if (vivant) setApercu(null) })
    return () => { vivant = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redessin piloté par le contenu, pas par l'identité de l'objet
  }, [cle])

  async function partager() {
    setOccupe(true)
    try {
      const m = await import('@/lib/visuel-partage-canvas')
      const issue = await m.partagerVisuel({ annonce, format, texte, slug })
      if (issue === 'telecharge') toast?.('Image téléchargée. Le texte est dans ton presse-papiers.', 'success')
      else if (issue === 'impossible') toast?.('Il manque le titre ou le nom du commerce pour composer le visuel.', 'error')
      // ⚠️ ON NE DIT RIEN SUR UN PARTAGE RÉUSSI NI SUR UN REFUS. La feuille du
      // système a déjà parlé, et un message de plus après une annulation se lit
      // comme un reproche.
      //
      // ⚠️ ET LE TEXTE PART AU PRESSE-PAPIERS QUAND ON TÉLÉCHARGE : sur
      // ordinateur, la feuille de partage n'existe pas, l'image seule laisserait
      // le commerçant réécrire son post.
      if (issue === 'telecharge' && texte) {
        try { await navigator.clipboard.writeText(texte) } catch { /* presse-papiers indisponible */ }
      }
    } catch (e) {
      toast?.('La composition du visuel a échoué, réessaie.', 'error')
    }
    setOccupe(false)
  }

  if (!contenuVisuel(annonce || {})) return null

  const onglet = (cle_, libelle) => (
    <button type="button" onClick={() => setFormat(cle_)}
      style={{
        padding: '6px 12px', borderRadius: 100, fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
        fontFamily: '"DM Sans", sans-serif',
        border: `1.5px solid ${format === cle_ ? T.main : T.hairline}`,
        background: format === cle_ ? T.main : '#fff', color: format === cle_ ? '#fff' : T.muted,
      }}>
      {libelle}
    </button>
  )

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.hairline}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 11.5, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          Le visuel
        </span>
        {onglet(FORMAT_CARRE, 'Carré')}
        {onglet(FORMAT_PAYSAGE, 'Paysage')}
        <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
          {FORMATS[format].usage}
        </span>
      </div>

      {/* ⚠️ L'APERÇU GARDE SA PLACE PENDANT LE DESSIN. Sans hauteur réservée, la
          carte sautait à l'écran chaque fois qu'on changeait de format. */}
      <div style={{
        borderRadius: 12, overflow: 'hidden', background: T.pale,
        aspectRatio: format === FORMAT_CARRE ? '1 / 1' : '1200 / 630',
        maxWidth: format === FORMAT_CARRE ? 260 : 380,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* ⚠️ `decoding` ET `loading`, comme toutes les images de l'application.
            Une garde posée pour le gel de l'iPhone l'a exigé, et elle a raison :
            un visuel fait 1080 de côté, son décodage sur le fil principal fige
            l'écran, touchers compris, puis repart tout seul. C'est le symptôme
            qu'on a mis trois jours à nommer en août. */}
        {apercu
          ? <img src={apercu} alt="Aperçu du visuel à partager" decoding="async" loading="lazy"
              style={{ width: '100%', display: 'block' }}/>
          : <span style={{ fontSize: 12, color: T.main, fontWeight: 700 }}>On compose…</span>}
      </div>

      <button onClick={partager} disabled={occupe || !apercu}
        style={{
          marginTop: 10, padding: '9px 16px', borderRadius: 100, border: 'none',
          background: (occupe || !apercu) ? T.mid : T.main, color: '#fff', fontWeight: 800,
          fontSize: 12.5, cursor: (occupe || !apercu) ? 'default' : 'pointer',
          fontFamily: '"DM Sans", sans-serif', display: 'inline-flex', alignItems: 'center', gap: 7,
        }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>
        </svg>
        {occupe ? 'On prépare…' : 'Partager le visuel'}
      </button>

      {/* ⚠️ ON DIT CE QUE LE BOUTON FAIT VRAIMENT. Le commerçant choisit son
          réseau dans la feuille de son téléphone : lui laisser croire que Yoppaa
          publie à sa place se paierait à la première tentative. */}
      <p style={{ fontSize: 11, color: T.muted, margin: '8px 0 0', lineHeight: 1.5, maxWidth: 380 }}>
        Sur téléphone, tu choisis ton réseau dans la fenêtre qui s&apos;ouvre. Sur ordinateur,
        l&apos;image se télécharge et le texte part dans ton presse-papiers.
      </p>
    </div>
  )
}
