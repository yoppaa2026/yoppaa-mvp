// POST /api/fiche/vue
//
// Compte une ouverture de fiche commerçant. C'est le premier chiffre qu'un
// commerçant cherche dans ses statistiques, et le seul qui manquait.
//
// Body attendu : { commercant_id: UUID }
//
// CE QU'ON N'ENREGISTRE PAS, ET C'EST LE POINT IMPORTANT. Ni IP, ni identifiant
// de visiteur, ni Yopper, ni horodatage fin. La fonction en base incrémente une
// case (commerce, jour) et rien d'autre : il est impossible, même avec un accès
// complet à la table, de savoir qui a regardé quoi.
//
// Le dédoublonnage se fait côté navigateur, une vue par session et par
// commerce, comme pour les statistiques des deals. Un rechargement de page ne
// gonfle donc pas le compteur.
//
// La route ne renvoie jamais d'erreur exploitable : un compteur qui échoue ne
// doit ni ralentir ni casser l'affichage de la fiche.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req) {
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const id = body?.commercant_id
  // Le format est vérifié ici : sans ça, la fonction en base lèverait une
  // exception à chaque appel malformé et remplirait les logs pour rien.
  if (!id || typeof id !== 'string' || !UUID.test(id)) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { error } = await admin().rpc('incrementer_vue_fiche', { p_commercant_id: id })
  if (error) {
    console.warn('[fiche/vue] comptage impossible', error.message)
    return NextResponse.json({ ok: false }, { status: 200 })
  }
  return NextResponse.json({ ok: true })
}
