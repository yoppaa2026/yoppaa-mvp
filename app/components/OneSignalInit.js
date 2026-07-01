'use client'
// Chargement + init du Web SDK OneSignal v16 pour Yoppaa côté Yopper.
// Décision Alex 15/06/2026 (Q2 tranchée) + compte ouvert 01/07.
//
// Périmètre :
//   • Chargé UNIQUEMENT dans le layout /commander/* (Yoppers)
//   • Pas dans /dashboard (commerçants), /admin, /signup ni /landing
//
// Tags synchronisés :
//   • yopper_id      : external_user_id OneSignal = clients.id
//   • code_postal    : zone du Yopper (ex '5640') → GMY par zone
//   • favori:<UUID>  : 1 tag par commerçant favori → push deal/actu aux favoris
//
// Compat safe : si les env vars NEXT_PUBLIC_ONESIGNAL_APP_ID sont absentes,
// le composant est un no-op (rendu null). Aucun crash en local ni sur preview.

import Script from 'next/script'
import { useEffect } from 'react'

const APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID

// Helper : file d'attente OneSignal v16. Le SDK expose window.OneSignalDeferred
// qui est un tableau consommé après chargement. On peut push des callbacks avant
// que le script soit chargé, elles fireront dans l'ordre.
function pushOneSignal(cb) {
  if (typeof window === 'undefined') return
  window.OneSignalDeferred = window.OneSignalDeferred || []
  window.OneSignalDeferred.push(cb)
}

// Export public : à appeler depuis les composants Yopper quand un favori est
// ajouté/retiré pour maintenir les tags OneSignal en cohérence.
export function taggerFavoriOneSignal(commercantId, ajoute) {
  if (!commercantId) return
  pushOneSignal(async (OneSignal) => {
    try {
      if (ajoute) {
        await OneSignal.User.addTag(`favori:${commercantId}`, '1')
      } else {
        await OneSignal.User.removeTag(`favori:${commercantId}`)
      }
    } catch (e) {
      console.warn('[OneSignal] tag favori échoué', { commercantId, ajoute, e: e?.message })
    }
  })
}

export default function OneSignalInit({ yopperId, codePostal, favoris = [] }) {
  useEffect(() => {
    if (!APP_ID) return
    pushOneSignal(async (OneSignal) => {
      try {
        if (!OneSignal.__yoppaaInitDone) {
          await OneSignal.init({
            appId: APP_ID,
            allowLocalhostAsSecureOrigin: true,
            serviceWorkerPath: '/OneSignalSDKWorker.js',
            serviceWorkerParam: { scope: '/' },
            notifyButton: { enable: false },
          })
          OneSignal.__yoppaaInitDone = true
        }

        // Login (external_user_id) : identifie le Yopper de manière stable
        // pour envoyer des push individuels (ex: RDV rappel, commande prête).
        if (yopperId) {
          await OneSignal.login(String(yopperId))
        }

        // Sync tags initiaux (code postal + tous les favoris connus).
        // OneSignal accepte un batch via addTags plutôt que des addTag en série.
        const tags = {}
        if (codePostal) tags.code_postal = String(codePostal)
        favoris.forEach(f => { tags[`favori:${f}`] = '1' })
        if (Object.keys(tags).length > 0) {
          await OneSignal.User.addTags(tags)
        }
      } catch (e) {
        console.warn('[OneSignal] init/tag échoué', e?.message)
      }
    })
  }, [yopperId, codePostal, favoris?.join(',')])

  if (!APP_ID) return null

  return (
    <Script
      id="onesignal-sdk"
      src="https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js"
      strategy="afterInteractive"
    />
  )
}
