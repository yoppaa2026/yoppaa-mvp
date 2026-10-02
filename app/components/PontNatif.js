'use client'
// ─── LE TOUCHER D'UNE NOTIFICATION, SUR TOUTES LES PAGES DE L'APP (02/10) ──
//
// 🔴 POURQUOI ICI, DANS LE GABARIT RACINE, ET PAS DANS `OneSignalInit`. Celui-ci
// ne vit que sur l'accueil `/commander` et l'onboarding. Or l'app recharge la
// page entière plus souvent qu'on ne croit : au retour de Stripe, à l'ouverture
// d'un lien d'email, sur les CGU. Après un chargement complet, l'écouteur posé
// par l'accueil a disparu avec la page, et le toucher suivant n'était plus
// entendu par personne. Posé ici, il renaît avec chaque page.
//
// ⚠️ HORS DE L'APP, CE COMPOSANT NE FAIT RIEN. Le navigateur et la PWA gardent
// le SDK web de `OneSignalInit`, qui ouvre lui-même `web_url`.
//
// ⚠️ UNE NAVIGATION COMPLÈTE, PAS `router.push`. Le toucher peut arriver sur
// n'importe quelle page, y compris pendant un rendu en cours : repartir d'une
// page neuve est le seul état dont on soit sûr.

import { useEffect } from 'react'
import { initialiserPushNatif, brancherClicNatif } from '@/lib/push-natif'

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID

export default function PontNatif() {
  useEffect(() => {
    // ⚠️ DANS L'EFFET, JAMAIS PENDANT LE RENDU : lire `window` au rendu rouvre
    // la zone morte du 03/09.
    //
    // ⚠️ L'INITIALISATION D'ABORD, DANS LE MÊME GESTE. Sur Android, le SDK
    // refuse l'écoute tant qu'il n'est pas initialisé. La refaire est sans
    // effet : iOS répond « déjà initialisé », Android l'ignore.
    const init = initialiserPushNatif(window, APP_ID, null)
    if (!init.ok) return
    const res = brancherClicNatif(window, (chemin) => window.location.assign(chemin))
    // ⚠️ ON LIT LE RÉSULTAT : un toucher que personne n'écoute ne se voit
    // nulle part, sauf ici.
    if (!res.ok) console.error('[push natif] écoute du toucher KO :', res.raison)
  }, [])

  return null
}
