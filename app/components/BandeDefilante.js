'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { bordsDefilement, pasDefilement } from '@/lib/responsive'

// Une bande qui défile à l'horizontale, avec des FLÈCHES sur ordinateur.
//
// ⚠️ LE PROBLÈME, ET IL NE SE VOIT QUE SUR PC. Le tableau de bord est né sur
// téléphone : ses barres d'onglets, ses jours, ses filtres et ses raccourcis
// défilent au doigt, et masquent leur barre de défilement pour rester propres.
// À la souris, il ne reste RIEN : ni barre, ni flèche, ni le moindre indice
// qu'il y a huit onglets de plus à droite. Le commerçant ne les trouvait pas.
//
// ⚠️ LE BUREAU S'AJOUTE, IL NE RÉÉCRIT PAS LE MOBILE. Les flèches n'existent
// qu'au-delà de 1024 px ET sur un vrai pointeur : le geste du doigt reste la
// seule façon de faire sur téléphone, exactement comme avant. Toute la règle
// vit dans `app/globals.css`, section « les flèches de défilement ».
//
// La piste garde SA classe et SES styles : ce composant l'enveloppe, il ne la
// remplace pas. On peut donc l'appliquer à une barre existante sans toucher à
// son apparence.
//
// ⚠️ Volontairement PAS de `data-scroll-x` sur la piste : cet attribut déclenche
// `flex-wrap: wrap` au-delà de 1024 px, ce qui ferait passer une barre d'onglets
// sur trois lignes. Ici on veut l'inverse : une seule ligne, et des flèches.
export default function BandeDefilante({ children, className, style, libelle = 'contenu', pas }) {
  const piste = useRef(null)
  const [bords, setBords] = useState({ gauche: false, droite: false })

  // Y a-t-il encore quelque chose à gauche, à droite ? La décision vit dans
  // `lib/responsive.js`, en fonction pure : c'est elle qui allume ou éteint une
  // flèche, et une flèche éteinte au mauvais moment cache du contenu. Ici on ne
  // fait que lui donner les mesures du navigateur.
  const mesurer = useCallback(() => {
    const el = piste.current
    if (!el) return
    const { gauche, droite } = bordsDefilement(el)
    setBords(prec => (prec.gauche === gauche && prec.droite === droite) ? prec : { gauche, droite })
  }, [])

  useEffect(() => {
    const el = piste.current
    if (!el) return
    mesurer()
    el.addEventListener('scroll', mesurer, { passive: true })
    window.addEventListener('resize', mesurer)
    // Le contenu bouge tout seul : un badge qui apparaît, un onglet de plus
    // selon le palier. Sans observateur, les flèches resteraient sur l'état
    // du premier rendu.
    const observateur = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(mesurer) : null
    if (observateur) {
      observateur.observe(el)
      for (const enfant of el.children) observateur.observe(enfant)
    }
    return () => {
      el.removeEventListener('scroll', mesurer)
      window.removeEventListener('resize', mesurer)
      observateur?.disconnect()
    }
  }, [mesurer, children])

  function glisser(sens) {
    const el = piste.current
    if (!el) return
    el.scrollBy({ left: sens * pasDefilement(el.clientWidth, pas), behavior: 'smooth' })
  }

  return (
    <div className="bande-defilante">
      <div ref={piste} className={className} style={style}>{children}</div>
      <button type="button" className="bande-fleche bande-fleche-gauche"
        aria-label={`Faire défiler ${libelle} vers la gauche`}
        aria-hidden={!bords.gauche} tabIndex={bords.gauche ? 0 : -1}
        data-active={bords.gauche ? 'oui' : 'non'}
        onClick={() => glisser(-1)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6"/>
        </svg>
      </button>
      <button type="button" className="bande-fleche bande-fleche-droite"
        aria-label={`Faire défiler ${libelle} vers la droite`}
        aria-hidden={!bords.droite} tabIndex={bords.droite ? 0 : -1}
        data-active={bords.droite ? 'oui' : 'non'}
        onClick={() => glisser(1)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 6l6 6-6 6"/>
        </svg>
      </button>
    </div>
  )
}
