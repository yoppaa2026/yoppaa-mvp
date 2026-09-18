// LES POINTS QUI DISENT « ÇA TRAVAILLE » (18/09, demandé par Alex).
//
// 🔴 CE QU'IL A VU, ET C'EST LE VRAI SUJET : un bouton qui ne réagit pas fait
// croire que le geste n'est pas parti. Le Yopper reclique. Sur un tunnel de
// commande, recliquer peut coûter deux envois ; partout ailleurs, ça coûte au
// moins la confiance.
//
// ⚠️ CETTE ANIMATION N'EST PAS UNE PROTECTION, C'EST UNE EXPLICATION. Ce qui
// empêche vraiment le double clic, c'est `disabled` sur le bouton. Les points
// disent pourquoi il ne répond pas. Les deux vont ensemble, et l'un ne
// remplace jamais l'autre.
//
// ⚠️ CINQ POINTS, PAS UN CERCLE QUI TOURNE. Le cercle est l'attente de tout le
// monde ; les cinq points sont ceux du logo, avec leurs tailles alternées.
// Idée d'Alex : rester dans l'esprit Yoppaa plutôt que poser un objet de plus.
//
// ⚠️ ET PAS D'EMOJI, PAS D'IMAGE : des éléments et du CSS. Un emoji change de
// dessin d'un téléphone à l'autre, une image met du réseau là où on annonce
// justement qu'on attend le réseau.

// Les tailles du logo, dans l'ordre : petit, plus petit, petit, plus petit…
// Le rapport vient du dessin, il n'est pas choisi ici.
const RAPPORTS = [1, 0.7, 1, 0.7, 1]

export default function DotsAttente({ couleur = '#fff', taille = 5, label = 'Chargement en cours' }) {
  return (
    // ⚠️ `role="status"` ET UN LIBELLÉ : une animation muette ne dit rien à qui
    // n'a pas l'écran sous les yeux. Le lecteur d'écran annonce l'attente.
    <span
      role="status"
      aria-label={label}
      style={{ display: 'inline-flex', alignItems: 'center', gap: Math.max(2, Math.round(taille * 0.6)) }}
    >
      <style>{`
        /* ⚠️ LE DÉPLACEMENT EST EN POURCENTAGE, pas en pixels : il suit donc la
           taille du point, et une seule définition sert toutes les tailles.
           Avec des pixels, deux tailles dans la même page se seraient écrasées,
           la dernière montée gagnant pour tout le monde. */
        @keyframes yoppaaDotAttente {
          0%, 70%, 100% { transform: translateY(0); opacity: 0.5; }
          35%           { transform: translateY(-60%); opacity: 1; }
        }
        /* ⚠️ QUI DEMANDE MOINS D'ANIMATION EN REÇOIT MOINS, mais garde
           l'information : les points restent visibles, ils cessent de bouger. */
        @media (prefers-reduced-motion: reduce) {
          .yoppaa-dot-attente { animation: none !important; opacity: 0.85 !important; }
        }
      `}</style>
      {RAPPORTS.map((r, i) => (
        <span
          key={i}
          className="yoppaa-dot-attente"
          style={{
            width: Math.max(2, Math.round(taille * r)),
            height: Math.max(2, Math.round(taille * r)),
            borderRadius: '50%',
            background: couleur,
            display: 'inline-block',
            // Le décalage fait la vague. Cinq points, cinq départs.
            animation: `yoppaaDotAttente 1.1s ease-in-out ${i * 0.11}s infinite`,
          }}
        />
      ))}
    </span>
  )
}
