'use client'
// Appel d'une route API AU NOM DU COMMERÇANT, avec son jeton.
//
// ⚠️ POURQUOI. Jusqu'au 21/08, le tableau de bord appelait ces routes sans la
// moindre preuve d'identité, et les routes ne la demandaient pas. N'importe qui
// pouvait donc les appeler à la place du commerçant : faire partir un email à
// ses clients, ou pousser une notification à tous ses abonnés.
//
// Le pendant Yopper existe déjà (`lib/fetch-yopper.js`). Celui-ci est son
// équivalent côté professionnel, et il existe pour la même raison : une règle
// qui vit à un seul endroit ne peut pas être oubliée à onze endroits.
//
// ⚠️ ON N'AVALE PAS L'ABSENCE DE SESSION EN SILENCE. Sans jeton, la requête
// partirait en anonyme et la route répondrait 401 : l'appelant croirait que
// l'email est parti. On préfère le dire.

import { supabase } from './supabase'

export async function postPro(url, corps) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    console.error('[postPro] aucune session, requête non envoyée', url)
    return { ok: false, status: 401, sansSession: true }
  }
  try {
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(corps),
    })
  } catch (e) {
    console.error('[postPro] échec réseau', url, e?.message)
    return { ok: false, status: 0, erreurReseau: true }
  }
}
