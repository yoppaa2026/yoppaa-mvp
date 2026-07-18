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

// Lit l'état courant de l'abonnement push (diagnostic + affichage du bouton).
// Accède à window.OneSignal directement (chargé par le <Script> ci-dessous).
export function lireEtatPush() {
  if (typeof window === 'undefined' || !window.OneSignal) return { pret: false }
  const OS = window.OneSignal
  const NotifAPI = typeof Notification !== 'undefined' ? Notification : null
  try {
    return {
      pret: true,
      supporte: OS.Notifications?.isPushSupported ? OS.Notifications.isPushSupported() : true,
      // Vérité terrain = permission NATIVE du navigateur ('granted'|'denied'|'default').
      // OneSignal.Notifications.permission (booléen) peut être en retard sur le natif.
      permission: NotifAPI ? NotifAPI.permission : (OS.Notifications?.permission === true ? 'granted' : 'default'),
      optedIn: OS.User?.PushSubscription?.optedIn ?? null,
      id: OS.User?.PushSubscription?.id || null,
    }
  } catch {
    return { pret: false }
  }
}

// Version async enrichie : ajoute l'état du SERVICE WORKER (indispensable pour
// diagnostiquer pourquoi l'abonnement ne se crée pas sur PWA installée). Retourne
// `sw` = 'os@/<scope>' si le worker OneSignal est actif, 'autre(n)', 'aucun' ou 'err'.
export async function diagnostiquerPush() {
  const base = lireEtatPush()
  let sw = 'n/a'
  try {
    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations()
      const os = regs.find(r => `${r.active?.scriptURL || r.installing?.scriptURL || ''}`.includes('OneSignal'))
      if (os) sw = `os@${new URL(os.scope).pathname}${os.active ? '' : ':inact'}`
      else sw = regs.length ? `autre(${regs.length})` : 'aucun'
    }
  } catch { sw = 'err' }
  let onesignalId = null
  try { onesignalId = window.OneSignal?.User?.onesignalId || null } catch { /* ignore */ }
  return { ...base, sw, onesignalId }
}

// Active/répare l'abonnement push. À appeler DANS un handler de clic (le geste
// utilisateur est requis par le navigateur pour requestPermission, surtout iOS).
// On accède à window.OneSignal directement pour ne pas casser la chaîne de geste
// (la file OneSignalDeferred différée perdrait l'activation utilisateur sur Safari).
export async function activerNotifications() {
  if (typeof window === 'undefined' || !window.OneSignal) return { ok: false, raison: 'sdk_absent' }
  const OS = window.OneSignal
  try {
    const supporte = OS.Notifications?.isPushSupported ? OS.Notifications.isPushSupported() : true
    if (!supporte) return { ok: false, raison: 'non_supporte' }

    const NotifAPI = typeof Notification !== 'undefined' ? Notification : null
    if (NotifAPI?.permission === 'denied') return { ok: false, raison: 'refuse_os' }

    // IMPORTANT (iOS PWA) : on appelle le prompt NATIF directement dans le geste de clic.
    // OneSignal.Notifications.requestPermission ajoute de l'async avant l'appel natif ->
    // iOS perd le geste -> aucune fenêtre + promesse jamais résolue (bouton figé, 18/07).
    // requestPermission existe en 2 formes (promesse OU callback) : on gère les deux, avec
    // un filet de temps pour ne JAMAIS bloquer si rien ne résout.
    let perm = NotifAPI?.permission || 'default'
    if (NotifAPI?.requestPermission && perm !== 'granted') {
      perm = await new Promise((resolve) => {
        let fini = false
        const finir = (v) => { if (!fini) { fini = true; resolve(v || NotifAPI.permission) } }
        try {
          const ret = NotifAPI.requestPermission(finir) // forme callback
          if (ret && typeof ret.then === 'function') ret.then(finir).catch(() => finir()) // forme promesse
        } catch { finir() }
        setTimeout(() => finir(), 8000) // filet : ne jamais rester bloqué
      })
    }
    perm = perm || NotifAPI?.permission || 'default'
    if (perm === 'denied') return { ok: false, raison: 'refuse_os' }
    if (perm !== 'granted') return { ok: false, raison: 'incomplet' }

    // Permission accordée. Avant de s'abonner, on s'assure que le SERVICE WORKER OneSignal
    // est prêt : sur PWA installée (iOS/Android) l'abonnement échoue si le SW ne contrôle
    // pas encore la page. Puis opt-in (borné, peut ne jamais résoudre) et on POLL l'id
    // d'abonnement quelques secondes (l'enregistrement auprès d'Apple/FCM prend un instant).
    // Le service worker OneSignal n'est parfois pas enregistré dans la PWA installée
    // (diagnostic "sw: aucun") -> aucun abonnement possible. On le (ré)enregistre
    // EXPLICITEMENT et on CAPTURE l'erreur exacte pour la remonter à l'écran.
    let swErr = null
    try {
      if (navigator.serviceWorker) {
        const existing = await navigator.serviceWorker.getRegistration('/')
        const dejaOS = existing && `${existing.active?.scriptURL || existing.installing?.scriptURL || existing.waiting?.scriptURL || ''}`.includes('OneSignal')
        if (!dejaOS) {
          await navigator.serviceWorker.register('/OneSignalSDKWorker.js', { scope: '/' })
        }
        await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(r, 6000))])
      } else {
        swErr = 'serviceWorker indisponible'
      }
    } catch (e) {
      swErr = e?.message || String(e)
    }
    try {
      const p = OS.User?.PushSubscription?.optIn?.()
      if (p && typeof p.then === 'function') await Promise.race([p, new Promise(r => setTimeout(r, 4000))])
    } catch { /* déjà opted-in */ }
    let id = null
    for (let i = 0; i < 8; i++) {
      id = OS.User?.PushSubscription?.id || null
      if (id) break
      await new Promise(r => setTimeout(r, 700))
    }
    return { ok: true, id, swErr, raison: id ? undefined : 'abonnement_en_cours' }
  } catch (e) {
    return { ok: false, raison: 'erreur', error: e?.message || String(e) }
  }
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
