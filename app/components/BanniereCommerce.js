'use client'
// La bannière d'en-tête d'une fiche commerçant.
//
// DÉCISION D'ALEX (05/08) : c'est TOUJOURS ce visuel, pour tout le monde.
// Avant, le haut de fiche affichait la photo envoyée par le commerçant quand
// il en avait une, et un aplat mauve sinon : deux fiches côte à côte n'avaient
// donc rien en commun, et la moitié d'entre elles ne disaient même pas chez qui
// on était. Le nom en haut devient le repère fixe de toutes les fiches.
//
// Les photos ne sont pas perdues pour autant : elles descendent toutes dans le
// carrousel « Mon commerce en images », où elles sont regardées pour ce
// qu'elles sont plutôt que rognées en bandeau.

import { echelleNomBanniere } from '@/lib/responsive'

const T = {
  bgPanel: '#160636',
  deep:    '#2D0F6B',
  main:    '#6B35C4',
  mid:     '#9660E0',
  light:   '#C4A0F4',
}

// Uniformité ne veut pas dire que toutes les fiches doivent être le même
// rectangle. La position des halos est dérivée du NOM : deux commerces voisins
// n'ont pas exactement la même lumière, mais tous ont la même charte, et la
// bannière d'un commerce ne change jamais d'un jour à l'autre.
function empreinte(nom) {
  let h = 0
  for (let i = 0; i < String(nom || '').length; i++) {
    h = (h * 31 + nom.charCodeAt(i)) % 100000
  }
  return h
}

// ⚠️ Le nom se place dans le TIERS HAUT, jamais au centre. La carte blanche
// d'identité flotte par-dessus le bas du bandeau : centré, le nom disparaissait
// derrière elle et la bannière n'était plus qu'un aplat violet vide (constaté
// par Alex le 05/08, capture à l'appui).
//
// ⚠️ ET SURTOUT : LE RETRAIT DU HAUT EST EN PIXELS, PAS EN POURCENTAGE.
// Il valait `18%`, ce qui semblait raisonnable. Sauf qu'un padding en
// pourcentage se calcule sur la LARGEUR du bloc, jamais sur sa hauteur : tant
// que la colonne faisait 390 px, 18 % valaient 70 px et le nom tombait bien
// dans le tiers haut. Le soir où la colonne est passée à 1200 px sur PC
// (chantier bureau, phase 2), ces mêmes 18 % sont devenus 216 px, sur un
// bandeau de 280 px de haut : le nom est allé se cacher derrière la carte
// blanche. Alex, 09/08, capture à l'appui — le même défaut qu'en mai, revenu
// par une porte différente.
//
// En pixels, la position ne dépend plus que de la hauteur du bandeau, qui est
// la seule chose qui compte ici. Le PC agrandit ensuite le nom et descend un
// peu le retrait, via `.banniere-commerce` dans globals.css.
//
// ⚠️ 54 → 68 LE 16/08 : « il est trop haut » (Alex). Le nom est maintenant
// CENTRÉ, mais centré dans la BANDE VISIBLE, pas dans le bandeau entier, et
// c'est toute la nuance :
//
//   hauteur du bandeau            220 px
//   − recouvrement de la carte     36 px   (elle remonte de -36 px sur le hero)
//   = bande réellement visible    184 px
//   contenu : nom ~29 px + 10 d'écart + 11 de signature ≈ 50 px
//   retrait = (184 − 50) / 2 ≈ 67 px
//
// ⚠️ CENTRER DANS LE BANDEAU ENTIER RAMÈNERAIT LE DÉFAUT DE MAI ET DU 09/08 :
// le nom passerait à 85 px et irait se cacher derrière la carte blanche. Deux
// signalements d'Alex, capture à l'appui, sont partis de là. La bande visible
// est la seule mesure qui ait un sens tant que la carte chevauche le bandeau.
const RETRAIT_HAUT = 68

// ⚠️ `compact` EXISTE PARCE QU'UNE MINIATURE N'EST PAS UNE PETITE VERSION DU
// GRAND ÉCRAN. L'aperçu du signup tient dans 150 px de haut ; au-delà de
// 1024 px, `globals.css` imposait au nom 2,6 rem et 84 px de retrait, mesures
// taillées pour le hero de 360 px d'une vraie fiche. Aucun nom, même court, ne
// pouvait tenir. Un aperçu se déclare comme tel, il ne se corrige pas au cas
// par cas.
export default function BanniereCommerce({ nom, hauteur = '100%', taillePolice = '1.5rem', compact = false }) {
  const h = empreinte(nom)
  const x1 = 60 + (h % 30)          // 60 → 89 %
  const y1 = 10 + (Math.floor(h / 30) % 25)
  const x2 = 10 + (Math.floor(h / 700) % 25)
  const y2 = 65 + (Math.floor(h / 11000) % 25)

  return (
    <div className={`banniere-commerce${compact ? ' banniere-compacte' : ''}`}
      // ⚠️ L'ÉCHELLE VOYAGE EN VARIABLE CSS, et c'est ce qui la rend efficace
      // partout. Une taille calculée en JavaScript serait écrasée par les
      // règles `!important` du socle bureau ; en variable, elle multiplie la
      // taille QUELLE QU'ELLE SOIT, sur téléphone comme sur ordinateur.
      style={{ '--banniere-echelle': echelleNomBanniere(nom), position: 'absolute', inset: 0, height: hauteur, background: `linear-gradient(135deg, ${T.bgPanel} 0%, ${T.deep} 40%, ${T.main} 100%)`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: `${RETRAIT_HAUT}px 24px 0`, overflow: 'hidden' }}>
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(circle at ${x1}% ${y1}%, ${T.mid}55 0%, transparent 60%), radial-gradient(circle at ${x2}% ${y2}%, ${T.light}22 0%, transparent 50%)` }}/>

      <p className="banniere-nom" style={{ position: 'relative', margin: 0, fontWeight: 900, fontSize: `calc(${taillePolice} * var(--banniere-echelle, 1))`, color: '#fff', letterSpacing: '-0.5px', textAlign: 'center', lineHeight: 1.2, textShadow: '0 2px 12px rgba(0,0,0,0.35)' }}>
        {nom}
      </p>

      {/* Dots V2-B : la signature Yoppaa, aux proportions canoniques. C'est
          elle qui fait qu'on reconnaît une fiche Yoppaa avant même de lire. */}
      <div aria-hidden="true" style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-start', gap: 4, height: 11, marginTop: 10 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', opacity: 0.9 }}/>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.light, marginTop: 2.8 }}/>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.light, marginTop: 2.8 }}/>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: T.mid, marginTop: 2.8 }}/>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.mid }}/>
      </div>
    </div>
  )
}
