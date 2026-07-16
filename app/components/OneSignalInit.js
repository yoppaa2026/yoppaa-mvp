'use client'
// Chargement + init du Web SDK OneSignal v16 pour Yoppaa côté Yopper.
// Décision Alex 15/06/2026 (Q2 tranchée) + compte ouvert 01/07.
//
// Périmètre :
//   • Chargé UNIQUEMENT dans le layout /commander/* (Yoppers)
//   • Pas dans /dashboard (commerçants), /admin, /signup ni /landing
//
// Identité + tags :
//   • login(clients.id)  : external_id OneSignal = clients.id, pour push individuel
//   • tags (favori:*, code_postal) : posés CÔTÉ SERVEUR via /api/yopper/sync-tags.
//
// Pourquoi les tags côté serveur : la pose de tags côté navigateur
// (OneSignal.User.addTags) entrait en course avec login() sur un user fraîchement
// créé et renvoyait un 409 Conflict "set-property" abandonné sans retry (constaté
// 03/07). Les tags favori:* ne se posaient jamais → ciblage push cassé. On passe
// donc par l'API REST serveur (déterministe, pas de course). Voir setYopperTags
// dans lib/onesignal.js et la route /api/yopper/sync-tags.
//
// Compat safe : si NEXT_PUBLIC_ONESIGNAL_APP_ID est absent, le composant est un
// no-op (rendu null). Aucun crash en local ni sur preview.

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

// Pose des tags OneSignal côté serveur (via l'API REST), en s'authentifiant par
// le cookie Yopper. Best-effort : les échecs sont silencieux (le ciblage push
// n'est pas critique au point de bloquer l'UI).
//
// Retry sur 404/5xx : au tout premier chargement, la synchro initiale part juste
// après login(), mais le user OneSignal n'est pas encore créé côté serveur -> le
// PATCH par external_id renvoie 404. On réessaie avec backoff le temps que la
// création suive (constaté 04/07 : code_postal + favoris initiaux non posés,
// seul le toggle favori ultérieur passait). Les 4xx définitifs (400/401) ne sont
// pas retentés.
export function syncYopperTags(tags, attempt = 0) {
  if (typeof window === 'undefined') return
  if (!tags || Object.keys(tags).length === 0) return
  fetch('/api/yopper/sync-tags', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags }),
  })
    .then(res => {
      const transient = res.status === 404 || res.status >= 500
      if (transient && attempt < 4) {
        setTimeout(() => syncYopperTags(tags, attempt + 1), 1500 * (attempt + 1))
      }
    })
    .catch(() => {
      if (attempt < 4) {
        setTimeout(() => syncYopperTags(tags, attempt + 1), 1500 * (attempt + 1))
      }
    })
}

// À appeler quand un favori est ajouté : si l'utilisateur n'a pas encore accepté
// les push, on force l'affichage du prompt OneSignal (Slidedown). Le clic sur le
// cœur favori est une user activation valide pour requestPermission.
//
// NB : la pose du tag favori:* elle-même se fait côté serveur (syncYopperTags),
// pas ici, pour éviter le 409 Conflict.
export function taggerFavoriOneSignal(commercantId, ajoute) {
  if (!commercantId || !ajoute) return
  pushOneSignal(async (OneSignal) => {
    try {
      const optedIn = OneSignal.User?.PushSubscription?.optedIn
      const permission = OneSignal.Notifications?.permission
      if (!optedIn && permission !== true) {
        if (OneSignal.Slidedown?.promptPush) {
          OneSignal.Slidedown.promptPush({ force: true })
        } else if (OneSignal.Notifications?.requestPermission) {
          await OneSignal.Notifications.requestPermission()
        }
      }
    } catch (e) {
      console.warn('[OneSignal] prompt push échoué', e?.message)
    }
  })
}

// À appeler après une commande/RDV confirmé : invite le Yopper à activer les push
// pour suivre le statut de sa commande. Sans ça, un Yopper qui commande sans jamais
// ajouter de favori n'était JAMAIS sollicité pour les push -> aucune notif de statut
// (bug remonté 16/07). Le Slidedown OneSignal s'affiche sans user gesture ; le clic
// « Autoriser » dessus sert de gesture pour le prompt natif du navigateur.
// No-op si déjà abonné ou permission déjà accordée/refusée définitivement.
export function promptPushOneSignal() {
  pushOneSignal(async (OneSignal) => {
    try {
      const optedIn = OneSignal.User?.PushSubscription?.optedIn
      const permission = OneSignal.Notifications?.permission
      // permission === false = refus explicite du navigateur : on ne re-sollicite pas.
      if (optedIn || permission === true || permission === false) return
      if (OneSignal.Slidedown?.promptPush) {
        OneSignal.Slidedown.promptPush({ force: true })
      } else if (OneSignal.Notifications?.requestPermission) {
        await OneSignal.Notifications.requestPermission()
      }
    } catch (e) {
      console.warn('[OneSignal] prompt push post-commande échoué', e?.message)
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

        // Login (external_user_id) : identifie le Yopper de manière stable pour
        // les push individuels (RDV rappel, commande prête) ET pour que le
        // serveur puisse poser les tags par external_id.
        if (yopperId) {
          await OneSignal.login(String(yopperId))

          // login résolu => le user OneSignal existe côté serveur. On pose les
          // tags initiaux (code postal + favoris) via l'API REST serveur. Dédup
          // par signature : on ne re-synchronise pas si rien n'a changé.
          const tags = {}
          if (codePostal) tags.code_postal = String(codePostal)
          favoris.forEach(f => { tags[`favori:${f}`] = '1' })
          const signature = JSON.stringify(tags)
          if (Object.keys(tags).length > 0 && OneSignal.__yoppaaTagsSig !== signature) {
            OneSignal.__yoppaaTagsSig = signature
            syncYopperTags(tags)
          }
        }
      } catch (e) {
        console.warn('[OneSignal] init/login/tags échoué', e?.message)
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
