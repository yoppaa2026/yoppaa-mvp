// /api/admin/commercants
//   DELETE -> supprime DEFINITIVEMENT un commerçant de test + tout son contenu.
//
// Les FK historiques (articles, commandes, RDV…) ne sont PAS en ON DELETE CASCADE,
// donc on supprime tous les enfants explicitement dans l'ordre avant le commerçant.
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
  if (!user) return { error: 'session expirée, reconnecte-toi', status: 401 }
  if (user.email !== ADMIN_EMAIL) return { error: 'accès refusé', status: 403 }

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

    // Les FK historiques (articles, commandes, RDV…) ne sont PAS en ON DELETE CASCADE :
    // on supprime les enfants explicitement, dans l'ordre, avant le commerçant.
    const cid = commercant_id

    const collect = async (table, col, whereCol, whereVals) => {
      let q = admin.from(table).select(col)
      q = whereCol === 'commercant_id' ? q.eq('commercant_id', cid) : q.in(whereCol, whereVals || [])
      const { data } = await q
      return [...new Set((data || []).map(r => r[col]).filter(Boolean))]
    }
    const artIds   = await collect('articles', 'id', 'commercant_id')
    const cmdIds   = await collect('commandes', 'id', 'commercant_id')
    const grpIds   = artIds.length ? await collect('article_options_groupes', 'id', 'article_id', artIds) : []
    const prestIds = await collect('rdv_prestations', 'id', 'commercant_id')
    const pratIds  = await collect('rdv_praticiens', 'id', 'commercant_id')

    // Erreur ignorable = table/colonne absente (schéma variable selon l'environnement).
    const ignorable = (m) => !m || /does not exist|could not find|schema cache|relation .* does not exist/i.test(m)
    const delEq = async (table) => {
      const { error } = await admin.from(table).delete().eq('commercant_id', cid)
      if (error && !ignorable(error.message)) console.warn(`[admin/commercants DELETE] ${table}:`, error.message)
    }
    const delIn = async (table, col, vals) => {
      if (!vals || !vals.length) return
      const { error } = await admin.from(table).delete().in(col, vals)
      if (error && !ignorable(error.message)) console.warn(`[admin/commercants DELETE] ${table}.${col}:`, error.message)
    }

    // 1) Sous-enfants (référencés via article / commande / prestation / praticien)
    await delIn('article_options_valeurs', 'groupe_id', grpIds)
    await delIn('article_options_groupes', 'article_id', artIds)
    await delIn('article_photos', 'article_id', artIds)
    await delIn('article_variantes', 'article_id', artIds)
    await delIn('commande_articles', 'commande_id', cmdIds)
    await delIn('rdv_prestation_praticiens', 'prestation_id', prestIds)
    await delIn('rdv_prestation_praticiens', 'praticien_id', pratIds)

    // 2) Enfants directs (commercant_id). Ordre : sous-tables AVANT articles/commandes/rdv_*.
    const enfantsDirects = [
      'article_stock_jour', 'commande_stock_reservation',
      'rdv_reservations', 'rdv_creneaux', 'rdv_fermetures', 'rdv_fidelite_progression',
      'rdv_prestations', 'rdv_praticiens',
      'commandes',
      'creneaux', 'fermetures_exceptionnelles',
      'livraison_creneaux', 'livraison_config',
      'yoppaa_deals', 'actualites', 'avis', 'favoris',
      'commercant_photos', 'ia_generations', 'signalements',
      'admin_impersonations', 'admin_validations', 'kyb_documents',
      'onboarding_commercants', 'suggestions_commercants', 'upgrade_requests',
      'success_packs', 'billing_relances_log',
      'articles',
    ]
    for (const t of enfantsDirects) await delEq(t)

    // 3) Le commerçant lui-même
    const { error: delErr } = await admin.from('commercants').delete().eq('id', cid)
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
