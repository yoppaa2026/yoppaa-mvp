// POST /api/yopper/sync-tags
//
// Pose des tags OneSignal sur le user Yopper (identifié par external_id =
// clients.id) via l'API REST serveur. Remplace la pose de tags côté navigateur
// (OneSignal.User.addTags) qui provoquait un 409 Conflict "set-property" en
// entrant en course avec login() sur un user fraîchement créé (constaté 03/07,
// tags favori:* jamais synchronisés, ciblage push par favori cassé).
//
// Auth : cookie HTTP-only yoppaa_yopper. Le Yopper ne tague que son propre user
// (l'external_id est dérivé du cookie, jamais du body).
//
// Body : { tags: { "favori:UUID": "1" | "", "code_postal": "5640", ... } }
//   - valeur "1" pour poser un tag, "" (chaîne vide) pour le retirer.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setYopperTags } from '@/lib/onesignal'
import { identiteProuvee } from '@/lib/yopper-auth'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// external_id OneSignal = clients.id, tiré d'une session Supabase vérifiée.
// ⚠️ L'IDENTITÉ DÉCLARÉE NE SUFFISAIT PAS, ET LE COMMENTAIRE QUI LE JUSTIFIAIT
// ÉTAIT FAUX. Il disait : « on ne fait que poser des étiquettes de préférence,
// il n'y a rien à lire ». C'est vrai pour la lecture, et hors sujet pour
// l'écriture : ce sont les préférences DE QUELQU'UN D'AUTRE qu'on écrivait.
//
// `POST /api/yopper/session` fabrique et signe un cookie d'identité à partir du
// seul corps de la requête, sans jamais vérifier que l'appelant possède cette
// adresse. La signature prouve que le serveur a émis le cookie, PAS que celui
// qui le présente est la bonne personne — `lib/yopper-session.js` le dit
// noir sur blanc. C'est précisément pourquoi `identiteProuvee` existe.
//
// L'attaque tenait en deux requêtes, sans aucun compte : on réclamait un cookie
// au nom d'une adresse email, puis on réécrivait le code postal de la personne
// (donc sa zone de ciblage Good Morning Yoppers) et on la désabonnait en
// silence des commerces qu'elle suit, une chaîne vide retirant une étiquette.
//
// ⚠️ ET LE REPLI PAR EMAIL EST PARTI AVEC. Il transformait une adresse connue,
// donc devinable, en identifiant de compte. Le `client_id` vient maintenant
// d'une session Supabase vérifiée, et de nulle part ailleurs.
async function getYopperClientId(request) {
  const identity = await identiteProuvee(request)
  return identity?.client_id || null
}

export async function POST(req) {
  const clientId = await getYopperClientId(req)
  if (!clientId) {
    return NextResponse.json({ ok: false, error: 'session_yopper_manquante' }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 })
  }

  const tags = body?.tags
  if (!tags || typeof tags !== 'object' || Object.keys(tags).length === 0) {
    return NextResponse.json({ ok: false, error: 'tags requis' }, { status: 400 })
  }

  // Persiste le code postal du Yopper sur sa fiche (ciblage zone GMY DB-driven,
  // robuste au 409 OneSignal). Best-effort, non bloquant. Un code postal belge
  // = 4 chiffres ; on ignore les valeurs vides (retrait de tag) ou aberrantes.
  const cp = typeof tags.code_postal === 'string' ? tags.code_postal.trim() : ''
  if (/^\d{4}$/.test(cp)) {
    getSupabaseAdmin()
      .from('clients').update({ code_postal: cp }).eq('id', clientId)
      .then(({ error }) => { if (error) console.warn('[sync-tags] update code_postal KO', error.message) })
  }

  const result = await setYopperTags(clientId, tags)
  if (!result.ok) {
    // 404 = user OneSignal pas encore créé (login() pas encore propagé). SEUL cas
    // où l'on renvoie un statut retryable : le client réessaie avec backoff.
    if (result.status === 404) {
      return NextResponse.json(result, { status: 404 })
    }
    // Autres échecs (auth, rate limit, timeout OneSignal...) : NON retryables et
    // NON bloquants (la pose de tags est best-effort). On renvoie 200 pour ne pas
    // polluer la console d'un 502 rouge ni déclencher la tempête de retries. La
    // cause exacte reste tracée côté serveur (console.error dans setYopperTags,
    // visible dans les logs Vercel).
    return NextResponse.json({ ok: false, handled: true, error: result.error }, { status: 200 })
  }

  return NextResponse.json({ ok: true })
}
