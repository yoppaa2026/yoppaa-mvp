// Wrapper OneSignal pour Yoppaa (push web + iOS + Android natif Capacitor Phase 2).
//
// Décision Alex 15/06/2026 (Q2 tranchée) : OneSignal retenu comme provider push.
// Gratuit sous 10 000 subscribers, dashboard pro, DPA/RGPD disponibles,
// hébergement EU possible.
//
// Ce fichier est le SEUL point d'entrée pour envoyer un push depuis Yoppaa.
// Toute route API qui déclenche un push (publication deal, publication actu,
// alerte, GMY 7h30, RDV rappel, etc.) l'importe.
//
// Configuration Vercel :
//   - NEXT_PUBLIC_ONESIGNAL_APP_ID (client + serveur) → App ID du dashboard OneSignal
//   - ONESIGNAL_REST_API_KEY (serveur uniquement)     → clé REST pour envoyer
//
// Modèle de destination : on cible par "tags" (segments dynamiques). Chaque
// Yopper qui autorise les push reçoit un player_id OneSignal. Ce player_id est
// tagué côté client avec :
//   - favori:<commercant_id>          → 1 tag par commerçant favori
//   - code_postal:<XXXX>              → zone du Yopper
//   - lang:fr                         → langue
//   - device_type:web|ios|android     → source
// Le serveur cible ensuite avec des filtres OneSignal du type
//   [ { field: 'tag', key: 'favori:XYZ', relation: '=', value: '1' } ]
// Aucun stockage de player_id côté Yoppaa : OneSignal gère.

const ONESIGNAL_API = 'https://api.onesignal.com'

function getConfig() {
  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
  const apiKey = process.env.ONESIGNAL_REST_API_KEY
  return { appId, apiKey }
}

// Schéma d'autorisation selon le format de clé OneSignal :
//   - clés nouveau format (os_v2_...) : "Key <clé>"
//   - clés legacy                     : "Basic <clé>"
// Vaut pour TOUS les endpoints REST (notifications + user model).
function authHeader(apiKey) {
  return apiKey?.startsWith('os_v2_') ? `Key ${apiKey}` : `Basic ${apiKey}`
}

/**
 * Envoie une notification push OneSignal avec ciblage par filtres (tags).
 *
 * @param {Object}   params
 * @param {string}   params.headings          Titre court (ex: "Nouveau deal")
 * @param {string}   params.contents          Corps (ex: "Baguette à 0,90€ chez X")
 * @param {string}   [params.url]             URL cible au clic (ex: /commander/[slug])
 * @param {Array}    params.filters           Filtres OneSignal, ex:
 *                                            [{ field: 'tag', key: 'favori:UUID', relation: '=', value: '1' }]
 * @param {string}   [params.smallIcon]       URL icône (défaut logo Yoppaa)
 * @param {string}   [params.largeIcon]       URL grande icône (badge commerçant)
 * @param {Object}   [params.data]            Payload custom (ex: { kind: 'deal', deal_id: 'UUID' })
 * @param {boolean}  [params.high_priority=true] Priorité (true pour alertes)
 * @returns {Promise<{ok:boolean, id?:string, recipients?:number, error?:string}>}
 */
export async function envoyerPush({
  headings,
  contents,
  url,
  filters,
  include_aliases,
  smallIcon,
  largeIcon,
  data,
  high_priority = true,
}) {
  const { appId, apiKey } = getConfig()

  if (!appId || !apiKey) {
    console.warn('[onesignal] variables env non configurées, push ignoré', {
      headings,
      hasAppId: !!appId,
      hasApiKey: !!apiKey,
    })
    return { ok: false, error: 'OneSignal env non configuré (placeholder attendu tant que le compte n\'est pas ouvert)' }
  }

  // On cible SOIT par filtres (tags/segments), SOIT par alias (external_id d'un
  // Yopper précis). Sans l'un des deux, on refuse : ne jamais broadcaster à tous.
  const hasFilters = filters && filters.length > 0
  const hasAliases = include_aliases && Object.keys(include_aliases).length > 0
  if (!hasFilters && !hasAliases) {
    return { ok: false, error: 'filters ou include_aliases requis pour éviter d\'envoyer à tous les Yoppers' }
  }

  const payload = {
    app_id: appId,
    headings: { fr: headings, en: headings },
    contents: { fr: contents, en: contents },
    priority: high_priority ? 10 : 5,  // 10 = high, 5 = normal (spec OneSignal)
  }
  if (hasFilters) payload.filters = filters
  if (hasAliases) { payload.include_aliases = include_aliases; payload.target_channel = 'push' }

  if (url) payload.url = url
  if (smallIcon) payload.small_icon = smallIcon
  if (largeIcon) payload.large_icon = largeIcon
  if (data) payload.data = data

  try {
    const res = await fetch(`${ONESIGNAL_API}/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader(apiKey),
      },
      body: JSON.stringify(payload),
    })

    const body = await res.json().catch(() => ({}))

    if (!res.ok || body?.errors) {
      console.error('[onesignal] erreur envoi', { status: res.status, body })
      return { ok: false, error: body?.errors?.[0] || `HTTP ${res.status}` }
    }

    return { ok: true, id: body.id, recipients: body.recipients }
  } catch (e) {
    console.error('[onesignal] exception envoi', e)
    return { ok: false, error: e?.message || String(e) }
  }
}

/**
 * Helper : push aux Yoppers qui ont favori un commerçant précis.
 * Utilisé par : publication deal (Communiquer/Vendre), publication actu, alerte.
 *
 * @param {string} commercantId  UUID du commerçant
 * @param {Object} content        { headings, contents, url, data, high_priority }
 * @returns {Promise<{ok:boolean, ...}>}
 */
export async function envoyerPushAuxFavoris(commercantId, content) {
  return envoyerPush({
    ...content,
    filters: [
      { field: 'tag', key: `favori:${commercantId}`, relation: '=', value: '1' },
    ],
  })
}

/**
 * Helper : push aux Yoppers d'une zone code postal donnée. Utilisé par GMY 7h30
 * qui filtre les deals du jour selon la zone du Yopper.
 *
 * @param {string} codePostal    ex: '5640'
 * @param {Object} content        { headings, contents, url, data, high_priority }
 */
export async function envoyerPushParCodePostal(codePostal, content) {
  return envoyerPush({
    ...content,
    filters: [
      { field: 'tag', key: 'code_postal', relation: '=', value: codePostal },
    ],
  })
}

/**
 * Helper : push à un Yopper précis (par son external_user_id, égal à yoppers.id).
 * Utilisé par : rappel RDV J-1, commande prête, RDV honoré, etc.
 *
 * @param {string} yopperId       UUID du Yopper (external_user_id OneSignal)
 * @param {Object} content
 */
export async function envoyerPushAuYopper(yopperId, content) {
  return envoyerPush({
    ...content,
    filters: [
      { field: 'tag', key: 'yopper_id', relation: '=', value: yopperId },
    ],
  })
}

/**
 * Helper : push à un Yopper précis ciblé par son external_id (= clients.id, posé
 * côté client via OneSignal.login()). Plus fiable que le filtre par tag yopper_id
 * (qui n'est pas systématiquement posé). Utilisé par les transitions de statut
 * livraison (en route / livrée), et à terme commande prête, rappel RDV, etc.
 *
 * @param {string} clientId   clients.id du Yopper (= external_id OneSignal)
 * @param {Object} content    { headings, contents, url, data, high_priority }
 */
export async function envoyerPushParExternalId(clientId, content) {
  if (!clientId) return { ok: false, error: 'clientId requis' }
  return envoyerPush({
    ...content,
    include_aliases: { external_id: [String(clientId)] },
  })
}

/**
 * Pose (ou retire) des tags sur le user OneSignal d'un Yopper, identifié par son
 * external_id (= clients.id, posé côté client via OneSignal.login()).
 *
 * Pourquoi côté serveur : la pose de tags côté navigateur (OneSignal.User.addTags)
 * entrait en course avec login() sur un user fraîchement créé/réconcilié et
 * renvoyait un 409 Conflict "set-property" que le SDK abandonnait sans retry
 * (constaté 03/07). Résultat : les tags favori:* ne se posaient jamais, donc le
 * ciblage push par favori était cassé. En passant par l'API REST serveur, il n'y
 * a plus de course : l'écriture est atomique et déterministe.
 *
 * Pour RETIRER un tag, passer une valeur chaîne vide : { "favori:UUID": "" }.
 *
 * @param {string} externalId  clients.id du Yopper (= external_id OneSignal)
 * @param {Object} tags        ex: { "favori:UUID": "1", "code_postal": "5640" }
 * @returns {Promise<{ok:boolean, error?:string, status?:number}>}
 */
export async function setYopperTags(externalId, tags) {
  const { appId, apiKey } = getConfig()

  if (!appId || !apiKey) {
    console.warn('[onesignal] env non configuré, setYopperTags ignoré', {
      hasAppId: !!appId,
      hasApiKey: !!apiKey,
    })
    return { ok: false, error: 'OneSignal env non configuré' }
  }
  if (!externalId || !tags || Object.keys(tags).length === 0) {
    return { ok: false, error: 'externalId et tags requis' }
  }

  try {
    const res = await fetch(
      `${ONESIGNAL_API}/apps/${appId}/users/by/external_id/${encodeURIComponent(externalId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader(apiKey),
        },
        body: JSON.stringify({ properties: { tags } }),
      }
    )

    const body = await res.json().catch(() => ({}))

    if (!res.ok) {
      console.error('[onesignal] setYopperTags erreur', { status: res.status, externalId, body })
      return { ok: false, error: body?.errors?.[0] || `HTTP ${res.status}`, status: res.status }
    }

    return { ok: true }
  } catch (e) {
    console.error('[onesignal] setYopperTags exception', e)
    return { ok: false, error: e?.message || String(e) }
  }
}
