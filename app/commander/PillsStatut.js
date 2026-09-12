// Pastilles de capacités YOPPAA, réutilisées sur la carte du listing et sur la
// fiche commerçant.
//
// Refonte du 03/08 : elles ne disent plus que ce que le client PEUT FAIRE ici.
// Plus de pastille grise, plus de gabarit fixe à cinq, plus de capitales.
// La liste vient de getPillsStatut (lib/plans.js), qui décide seul de son
// contenu ; ce composant ne fait que l'habiller.
//
// Un commerce sans capacité transactionnelle n'affiche donc RIEN, et c'est
// voulu : mieux vaut une carte sobre qu'une rangée de fonctions barrées.
//
// ─── 12/09 : DES MOTS SUR LA FICHE, DES ICÔNES DANS LA LISTE ────────────────
//
// Sur la carte du listing, la rangée pouvait prendre DEUX lignes chez un
// restaurant qui cumule deal, commande, livraison, table et fidélité. C'est ce
// qui faisait qu'une carte variait de 145 à 190 pixels selon le commerce, et
// qu'on n'en voyait que deux et demie par écran.
//
// En `xs`, chaque capacité devient donc un jeton rond de 22 pixels. La rangée
// tient sur une ligne quel que soit le commerce, et SURTOUT AUCUNE CAPACITÉ
// N'EST CACHÉE : le compteur « +2 » envisagé au départ aurait replié derrière
// un chiffre des fonctions que des commerçants PAIENT.
//
// ⚠️ LE CLIENT APPREND LES ICÔNES SUR LA FICHE, où elles restent écrites en
// toutes lettres (`size="lg"`). C'est ce qui rend l'icône seule acceptable
// dans la liste : elle n'a plus à enseigner, seulement à rappeler. Deux
// d'entre elles viennent d'ailleurs telles quelles de l'application, le sac de
// la commande et la camionnette de la livraison.
//
// ⚠️ ET CHAQUE CLÉ DOIT AVOIR SON DESSIN. Une clé ajoutée à `getPillsStatut`
// sans icône ici donnerait un jeton VIDE, c'est-à-dire une capacité payée et
// invisible, le défaut du 19/08 sous une autre forme. `npm run verif:plans`
// compare les deux listes et rougit si l'une dépasse.

import { getPillsStatut } from '@/lib/plans'

const T = {
  main:  '#6B35C4',
  deep:  '#2D0F6B',
  pale:  '#EDE0FF',
  light: '#C4A0F4',
}

// Les dessins, une clé de `getPillsStatut` par entrée.
//
// ⚠️ LA FIDÉLITÉ EST RONDE, ET CE N'EST PAS UN CAPRICE. Le rendez-vous est un
// calendrier, les bons cadeaux un paquet : deux rectangles. Une carte à tampons
// en aurait fait un troisième, et à treize pixels trois rectangles se
// ressemblent. La rosette dit d'ailleurs LA RÉCOMPENSE, que le client vient
// chercher, là où une carte à tampons ne dit que le support (Alex, 12/09).
const DESSINS = {
  deal: (
    <>
      <path d="M20.6 13.4 13 21a2 2 0 0 1-2.8 0l-7-7a2 2 0 0 1-.6-1.4V4a1 1 0 0 1 1-1h8.6a2 2 0 0 1 1.4.6l7 7a2 2 0 0 1 0 2.8Z"/>
      <circle cx="7.6" cy="7.6" r="1.4" fill="currentColor" stroke="none"/>
    </>
  ),
  actu: (
    <>
      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/>
      <path d="M15.5 8.5a5 5 0 0 1 0 7"/>
      <path d="M18.5 5.5a9 9 0 0 1 0 13"/>
    </>
  ),
  commande: (
    <>
      <path d="M3 9 4 5h16l1 4v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0Z"/>
      <path d="M5 11v10h14V11"/>
    </>
  ),
  livraison: (
    <>
      <circle cx="5.5" cy="17.5" r="3"/>
      <circle cx="18.5" cy="17.5" r="3"/>
      <path d="M15 6h2l2.5 6M6 17.5h7l-2-8H8.5"/>
    </>
  ),
  table: (
    <>
      <path d="M5 3v7a2.5 2.5 0 0 0 5 0V3M7.5 10v11"/>
      <path d="M17.5 3c-1.4 0-2.5 2.2-2.5 5s1.1 4 2.5 4v9"/>
    </>
  ),
  rdv: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2"/>
      <path d="M8 3v4M16 3v4M3 10h18"/>
      <circle cx="12" cy="15.5" r="1.6" fill="currentColor" stroke="none"/>
    </>
  ),
  fidelite: (
    <>
      <circle cx="12" cy="8.6" r="5.6"/>
      <path d="M8.1 13.3 6.4 21l5.6-3.1 5.6 3.1-1.7-7.7"/>
    </>
  ),
  bons: (
    <>
      <rect x="3" y="9" width="18" height="12" rx="1.5"/>
      <path d="M3 13.5h18M12 9v12"/>
      <path d="M12 9C10 9 7.5 8.6 7.5 6.7A1.9 1.9 0 0 1 11 5.4c.9.8 1 3.6 1 3.6ZM12 9c2 0 4.5-.4 4.5-2.3A1.9 1.9 0 0 0 13 5.4c-.9.8-1 3.6-1 3.6Z"/>
    </>
  ),
}

// Exportée pour que le banc compare cette liste à celle de `getPillsStatut`.
export const CLES_AVEC_DESSIN = Object.keys(DESSINS)

function Dessin({ cle, taille = 13 }) {
  const d = DESSINS[cle]
  if (!d) return null
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      {d}
    </svg>
  )
}

export default function PillsStatut({ commercant, dealActif = false, actuActive = false, bonneAffaire = false, size = 'sm' }) {
  const pills = getPillsStatut(commercant, { dealActif, actuActive })
  if (pills.length === 0) return null

  const xs = size === 'xs'
  const fontSize = size === 'lg' ? '0.74rem' : '0.66rem'
  const padding  = size === 'lg' ? '5px 12px' : '4px 10px'
  const gap      = xs ? 5 : 5

  // ⚠️ ELLES SE COUPAIENT EN SILENCE (Alex, 19/08). En `xs`, seule taille
  // utilisée sur la carte du listing, la rangée était en `nowrap` avec
  // `overflow: hidden` : tout ce qui dépassait la largeur de la carte
  // disparaissait sans le moindre signe. Or `Fidélité` et `Bons cadeaux` sont
  // empilées EN DERNIER par `getPillsStatut` : ce sont précisément elles qui
  // tombaient. Des commerçants paient pour ces deux fonctions, et personne ne
  // voyait qu'ils les avaient.
  //
  // On revient à la ligne plutôt que de faire défiler. Une information ne se
  // mérite pas au doigt, et une carte dans une liste verticale est justement
  // l'endroit où un geste horizontal fabrique une zone morte : voir
  // `reference_zone_morte_touch_action`, trois jours perdus. Quelques pixels de
  // hauteur coûtent moins cher qu'une capacité invisible.
  //
  // ⚠️ ET `overflow: hidden` ROGNAIT LE POINT QUI PULSE, posé en négatif hors
  // de la pastille : le signal « ça se passe maintenant » était amputé sur la
  // carte, là où il sert le plus.
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, overflow: 'visible', minWidth: 0 }}>
      {pills.map(p => {
        // Le point qui pulse sur ce qui se passe maintenant. Il est supprimé
        // sur le deal quand le bandeau doré « Bonne affaire » prend déjà le
        // relais visuel, pour éviter le double signal (décision 01/07).
        const pointVivant = p.live && !(p.key === 'deal' && bonneAffaire)
        const point = pointVivant && (
          <span style={{
            position: 'absolute', top: xs ? -2 : -4, right: xs ? -2 : -4,
            width: xs ? 7 : 9, height: xs ? 7 : 9, borderRadius: '50%',
            background: T.main, border: '1.5px solid #fff',
            boxShadow: `0 0 0 1.5px ${T.main}33, 0 0 8px ${T.main}99`,
            animation: 'yoppa-live-pulse 1s ease-in-out infinite',
          }}/>
        )

        // Dans la liste : un jeton rond, le libellé dans l'infobulle et pour
        // les lecteurs d'écran. `role="img"` sinon le nom n'est jamais annoncé.
        if (xs) {
          return (
            <span key={p.key} role="img" aria-label={p.label} title={p.label}
              style={{
                position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 22, height: 22, borderRadius: '50%',
                background: T.pale, color: T.deep, border: `1px solid ${T.light}80`,
                flexShrink: 0,
              }}>
              <Dessin cle={p.key}/>
              {point}
            </span>
          )
        }

        return (
          <span key={p.key}
            style={{
              position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize, fontWeight: 700, padding, borderRadius: 100,
              background: T.pale, color: T.deep, border: `1px solid ${T.light}66`,
              letterSpacing: '0.1px', lineHeight: 1, whiteSpace: 'nowrap', flexShrink: 0,
            }}>
            <Dessin cle={p.key} taille={size === 'lg' ? 14 : 13}/>
            {p.label}
            {point}
          </span>
        )
      })}
      <style>{`
        @keyframes yoppa-live-pulse {
          0%, 100% { transform: scale(1);   opacity: 1; }
          50%      { transform: scale(1.45); opacity: 0.7; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes yoppa-live-pulse { 0%, 100% { transform: none; opacity: 1; } }
        }
      `}</style>
    </div>
  )
}
