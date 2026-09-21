'use client'
// ─── L'APP NATIVE N'OUVRE PAS SUR LA VITRINE ────────────────────────────────
//
// 🔴 CE QUE PERSONNE N'AVAIT JAMAIS VU (21/09). Deux fichiers décident du
// premier écran de Yoppaa, et ils ne disent pas la même chose :
//
//   public/manifest.json      start_url : /commander   ← la PWA
//   capacitor.config.ts:45    server.url : la RACINE   ← l'app des stores
//
// La PWA ouvre donc l'application, et l'app native ouvre la LANDING, celle qui
// s'adresse aux commerçants et qui affiche 19,90 € et 49,90 € par mois.
//
// ⚠️ ET NOUS NE POUVIONS PAS LE SAVOIR : TestFlight affichait « Aucun testeur
// n'a été ajouté pour ce build ». Alex testait la PWA, installée depuis Safari,
// en croyant tester l'app déposée. Personne, des deux côtés, n'avait ouvert
// l'app native une seule fois.
//
// 🔴 CE QUE ÇA COÛTAIT PENDANT LA REVUE APPLE. Notre note de revue dit « on the
// home screen, tap the location field at the top right ». Ce champ n'existe pas
// sur la landing : le relecteur cherche un écran qu'il ne voit pas, et conclut
// que l'app ne fonctionne pas. C'est le rejet 2.1 « App Completeness » dont on
// venait tout juste de sortir. Et nous avions écrit à Apple « no digital
// content or subscription is sold in the app », phrase qu'un tarif mensuel sur
// le premier écran contredit à ses yeux (guideline 3.1.1).
//
// ⚠️ AUCUN NOUVEAU BUILD, ET C'EST TOUT L'INTÉRÊT. L'app ne contient rien : elle
// charge le site distant. Corriger le routage ici arrive chez le relecteur au
// prochain déploiement, sans resoumission et sans perdre la place dans la file.
//
// ⚠️ ON NE TOUCHE NI AU WEB NI À LA PWA. `estAppNative()` est vrai UNIQUEMENT
// dans une application installée depuis un store. Un navigateur et la PWA
// continuent de voir la landing, qui reste la porte d'entrée des commerçants et
// tout le référencement de Yoppaa.

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { estAppNative } from '@/lib/push-natif'

export default function RedirectionAppNative() {
  const router = useRouter()

  useEffect(() => {
    // ⚠️ DANS L'EFFET, JAMAIS PENDANT LE RENDU. Lire `window` au rendu casse le
    // rendu serveur et rouvre la zone morte du 03/09, qui rendait un écran
    // blanc que ni le lint ni le build ne voient.
    if (!estAppNative(window)) return

    // ⚠️ `replace` ET NON `push` : avec `push`, le geste « revenir en arrière »
    // ramènerait le relecteur sur la landing, c'est-à-dire exactement l'écran
    // qu'on vient de lui éviter, et cette fois sans moyen d'en sortir.
    router.replace('/commander')
  }, [router])

  return null
}
