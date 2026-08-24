'use client'
// Le bouton qui reste bloqué sur « Redirection… » au retour de Stripe.
//
// 🔴 LE DÉFAUT, RAPPORTÉ PAR ALEX LE 24/08 : il part payer, annule chez
// Stripe, revient sur la fiche… et le bouton affiche « Redirection… » POUR
// TOUJOURS. Le panier est intact, les articles se modifient, mais il ne peut
// plus payer. C'est un cul-de-sac, sur l'écran le plus cher du parcours.
//
// LA CAUSE N'EST PAS DANS NOTRE CODE, ELLE EST DANS LE NAVIGATEUR. Avant de
// partir chez Stripe on passe l'état à « en cours », et on ne le remet jamais
// à false : c'est normal, la page est censée disparaître. Mais au retour, le
// navigateur ne la RECHARGE pas toujours : il la restaure telle quelle depuis
// son cache de navigation (le « bfcache »), state React compris. L'état
// revient donc figé sur « en cours », et rien dans React ne s'en aperçoit,
// puisque aucun composant n'a été remonté.
//
// ⚠️ ET C'ÉTAIT UN DÉFAUT DE FAMILLE : SEPT endroits redirigent vers Stripe,
// aucun ne s'en protégeait. Les deux tunnels de commande et de rendez-vous,
// les bons cadeaux, les packs SMS, l'abonnement, et la boutique du tableau de
// bord. Un remède recopié sept fois aurait divergé au premier ajustement, donc
// il vit ici.
//
// ⚠️ ON RÉINITIALISE À CHAQUE `pageshow`, SANS TESTER `event.persisted`.
// Le drapeau ne vaut `true` que pour le bfcache, et plusieurs navigateurs
// restaurent une page sans le poser. Un `pageshow` de chargement normal
// arrive alors que l'état est déjà au repos : réinitialiser n'y coûte rien.
// Mieux vaut un geste inutile qu'un bouton mort.
//
// ⚠️ ET SURTOUT PAS `visibilitychange` : il se déclenche dès qu'on change
// d'onglet. On effacerait l'état « en cours » PENDANT qu'une requête est
// vraiment en vol, et le client cliquerait deux fois sur payer.

import { useEffect, useRef } from 'react'

export function useResetAuRetourDePaiement(reset) {
  // La fonction passée est souvent recréée à chaque rendu. Passer par une ref
  // évite de désabonner et réabonner l'écouteur à chaque fois, ce qui ouvrait
  // une fenêtre pendant laquelle l'événement pouvait tomber dans le vide.
  const ref = useRef(reset)
  ref.current = reset

  useEffect(() => {
    const auRetour = () => { ref.current?.() }
    window.addEventListener('pageshow', auRetour)
    return () => window.removeEventListener('pageshow', auRetour)
  }, [])
}
