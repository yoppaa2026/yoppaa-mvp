// Garde d'autorisation partagée par les tâches planifiées (`app/api/cron/*`).
//
// ⚠️ POURQUOI CE FICHIER EXISTE. L'audit du 12/09 a trouvé les DIX crons dans le
// même état : chacun lisait `CRON_SECRET`, et chacun LAISSAIT PASSER quand la
// variable était absente. Deux écritures pour un seul défaut :
//
//     if (!secret) return true                     // quatre routes
//     if (secret && entete !== `Bearer ${secret}`) // six routes
//
// Les deux disent la même chose : « si je ne sais pas vérifier, j'autorise ».
// C'est exactement ce que `lib/api-auth.js` refuse depuis le 21/08, avec les
// mots « une garde qui laisse filer ce qu'elle n'a pas su vérifier ne garde
// rien ». Les crons avaient été oubliés par cette leçon.
//
// ⚠️ ET ILS SONT LE SEUL ENDROIT OÙ CELA NE SE VOIT PAS. `proxy.js` exclut
// `/api/cron/` du compteur de requêtes, à juste titre puisque Vercel les
// appelle lui-même : une adresse ouverte y est donc une adresse ouverte SANS
// AUCUNE borne. Or ces routes ne lisent pas, elles AGISSENT : `morning-yoppers`
// écrit à tous les Yoppers, `expire-reservations` annule des réservations,
// `stripe-frais` touche à l'argent. L'adresse se devine en une tentative.
//
// LE CHOIX : refuser, toujours. Sans secret configuré, la tâche ne tourne pas
// et le journal dit quoi faire. Une tâche qui ne part pas se voit et se répare ;
// une tâche que n'importe qui déclenche ne se voit pas.
//
// Voir feedback_securite_dabord et feedback_appliquer_partout.

import crypto from 'node:crypto'

// Comparaison à temps constant : une comparaison naïve fuit, par sa durée, le
// nombre de caractères corrects. Même raison et même geste que la signature du
// cookie Yopper dans lib/yopper-session.js.
function egales(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8')
  const bb = Buffer.from(String(b || ''), 'utf8')
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

// Rend { ok: true } ou { ok: false, status, error }.
//
// Vercel envoie de lui-même `Authorization: Bearer <CRON_SECRET>` aux tâches
// déclarées dans vercel.json dès que la variable existe sur le projet. Aucune
// configuration supplémentaire n'est donc nécessaire côté planificateur.
export function gardeCron(request, nom = 'cron') {
  const secret = process.env.CRON_SECRET

  // ⚠️ SECRET ABSENT = REFUS, et un code distinct : 503 dit « mal configuré »
  // là où 401 dirait « mauvais appelant ». Le jour où une tâche s'arrête, le
  // journal doit nommer la cause, sinon on cherche du côté du code.
  if (!secret) {
    console.error(
      `[${nom}] CRON_SECRET absente : tache refusee. ` +
      'Ajoute la variable sur Vercel (et dans .env.local pour un essai a la main).'
    )
    return { ok: false, status: 503, error: 'tâche non configurée' }
  }

  const fourni = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!fourni || !egales(fourni, secret)) {
    return { ok: false, status: 401, error: 'unauthorized' }
  }
  return { ok: true }
}

// Sucre : rend directement la réponse de refus, ou null si l'appel est légitime.
// Même forme que `refus()` dans lib/api-auth.js, pour que les deux gardes
// s'écrivent de la même façon.
export function refusCron(verdict, NextResponse) {
  if (verdict.ok) return null
  return NextResponse.json({ ok: false, error: verdict.error }, { status: verdict.status })
}
