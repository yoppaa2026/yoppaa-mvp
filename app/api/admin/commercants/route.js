// /api/admin/commercants
//   DELETE -> supprime DEFINITIVEMENT un commerçant de test + tout son contenu.
//
// Les tables enfant (articles, variantes, commandes, RDV, deals, actus, créneaux…)
// sont toutes en ON DELETE CASCADE : supprimer la ligne commercants nettoie tout.
// On supprime aussi le compte auth lié (pour libérer l'email) au best effort.
//
// GARDE-FOU LÉGAL : refuse par défaut si le commerçant a des transactions PAYÉES
// (commandes payées en ligne ou RDV avec acompte payé) — rétention comptable. Un
// admin peut forcer (force:true) pour du pur nettoyage de données de test.
//
// Auth : JWT admin dans le header Authorization (même schéma que les autres routes
// admin), opérations en service_role.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

async function requireAdmin(request) {
  const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!accessToken) return { error: 'non authentifié', status: 401 }

  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  )
  const { data: { user } } = await authClient.auth.getUser()
  if (!user || user.email !== ADMIN_EMAIL) return { error: 'accès refusé', status: 403 }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
  return { admin }
}

export async function DELETE(request) {
  try {
    const { admin, error, status } = await requireAdmin(request)
    if (error) return NextResponse.json({ ok: false, error }, { status })

    const body = await request.json().catch(() => ({}))
    const { commercant_id, force } = body || {}
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })

    const { data: c } = await admin
      .from('commercants')
      .select('id, nom, auth_user_id, logo_url')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!c) return NextResponse.json({ ok: false, error: 'Commerçant introuvable' }, { status: 404 })

    // Garde-fou : transactions payées (rétention légale)
    const { count: nbCmd } = await admin
      .from('commandes')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercant_id)
      .eq('paye_en_ligne', true)
    const { count: nbRdv } = await admin
      .from('rdv_reservations')
      .select('id', { count: 'exact', head: true })
      .eq('commercant_id', commercant_id)
      .eq('acompte_paye', true)
    const nbPaye = (nbCmd || 0) + (nbRdv || 0)

    if (nbPaye > 0 && !force) {
      return NextResponse.json({
        ok: false,
        error: 'transactions_payees',
        nbCmd: nbCmd || 0,
        nbRdv: nbRdv || 0,
        message: `Ce commerçant a ${nbPaye} transaction(s) payée(s). Pour un vrai commerçant, archive-le (statut « suspendu ») plutôt que de le supprimer (rétention comptable).`,
      }, { status: 409 })
    }

    // Suppression de la ligne commercants -> cascade sur tout le contenu lié.
    const { error: delErr } = await admin.from('commercants').delete().eq('id', commercant_id)
    if (delErr) {
      console.error('[admin/commercants DELETE] delete KO', delErr)
      return NextResponse.json({ ok: false, error: `Erreur suppression : ${delErr.message}` }, { status: 500 })
    }

    // Best effort : compte auth lié (libère l'email) + logo dans le storage.
    if (c.auth_user_id) {
      await admin.auth.admin.deleteUser(c.auth_user_id).catch((e) => console.warn('[admin/commercants DELETE] auth user', e?.message))
    }
    if (c.logo_url && c.logo_url.includes('/logos/')) {
      const fileName = c.logo_url.split('/logos/')[1]?.split('?')[0]
      if (fileName) await admin.storage.from('logos').remove([fileName]).catch(() => {})
    }

    return NextResponse.json({ ok: true, deleted: c.nom, forced: !!force })
  } catch (e) {
    console.error('[admin/commercants DELETE]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
