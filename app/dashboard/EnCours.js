// « ENREGISTREMENT… » AVEC LES POINTS QUI TRAVAILLENT (lot 2, 03/10).
//
// 🔴 DIX-NEUF BOUTONS DU TABLEAU DE BORD CHANGEAIENT DE MOT ET C'ÉTAIT TOUT.
// Sur une connexion lente, « Enregistrement… » reste figé plusieurs secondes,
// et un texte immobile se lit comme un écran planté : la commerçante reclique.
// Les cinq points du logo disent que ça travaille (règle d'Alex du 18/09,
// `DotsAttente`). Ils prennent la couleur du texte du bouton, quel qu'il soit.
//
// ⚠️ L'ANIMATION EXPLIQUE, ELLE NE PROTÈGE PAS : chaque bouton garde son
// `disabled`, qui seul empêche le double envoi.
import DotsAttente from '@/app/components/DotsAttente'

export default function EnCours({ texte = 'Enregistrement…' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      <DotsAttente couleur="currentColor" taille={5} label={texte} />
      <span>{texte}</span>
    </span>
  )
}
