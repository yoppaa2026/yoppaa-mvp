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
  // ⚠️ ON REND AUSSI L'UTILISATEUR. La suppression a besoin de savoir QUI
  // appelle, pas seulement qu'il a le droit d'appeler : c'est ce qui lui permet
  // de refuser d'effacer le compte de celui qui tient les clés.
  return { admin, user }
}

// GET -> les PHOTOS des commerçants en attente de validation.
//
// ⚠️ POURQUOI UNE ROUTE, ET PAS UNE REQUÊTE DEPUIS LA PAGE ADMIN. Depuis le
// 21/08, `commercant_photos` ne se lit qu'à deux conditions : le commerce est
// PUBLIÉ, ou c'est le mien. Un commerçant en attente ne remplit ni l'une ni
// l'autre, y compris pour l'administrateur : une requête directe rendrait une
// liste VIDE, sans erreur — exactement le genre de silence qu'on ne diagnostique
// plus. On passe donc par la clé de service, derrière la garde admin.
//
// ⚠️ LA LISTE DES COMMERÇANTS EST CALCULÉE ICI, jamais reçue de l'appelant :
// on ne lit que ce qui est réellement `en_attente`, sans faire confiance à des
// identifiants venus du navigateur.
export async function GET(request) {
  try {
    const { admin, error, status } = await requireAdmin(request)
    if (error) return NextResponse.json({ ok: false, error }, { status })

    const { data: cs } = await admin
      .from('commercants')
      .select('id')
      .eq('statut_publication', 'en_attente')
    const ids = (cs || []).map(c => c.id)
    if (ids.length === 0) return NextResponse.json({ ok: true, photos: {} })

    const { data: ps, error: psErr } = await admin
      .from('commercant_photos')
      .select('id, commercant_id, url, type, ordre')
      .in('commercant_id', ids)
      .order('ordre')
    if (psErr) return NextResponse.json({ ok: false, error: psErr.message }, { status: 500 })

    const photos = {}
    for (const p of ps || []) {
      if (!p.url) continue
      ;(photos[p.commercant_id] = photos[p.commercant_id] || []).push(p)
    }
    return NextResponse.json({ ok: true, photos })
  } catch (e) {
    console.error('[admin/commercants GET]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    const { admin, user, error, status } = await requireAdmin(request)
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

    // ═══════════════════════════════════════════════════════════════════════
    // 🔴 ON NE SUPPRIME JAMAIS LE COMPTE QUI TIENT LES CLÉS.
    //
    // Trouvé le 30/08 au soir, en répondant à une question d'Alex sur le ménage
    // dans ses comptes de test. Cette route supprime l'utilisateur Auth rattaché
    // au commerçant, et le commerce « Kebabistro » était rattaché au SIEN.
    //
    // Un seul clic sur son propre écran d'administration aurait :
    //   • effacé son compte,
    //   • LIBÉRÉ son adresse dans Supabase Auth,
    //   • et donc offert Yoppaa à la première personne qui s'y serait inscrite.
    //
    // ⚠️ PARCE QU'ÊTRE ADMIN N'EST PAS « ÊTRE CE COMPTE », C'EST « DÉTENIR CETTE
    // ADRESSE » : `is_yoppaa_admin()` teste `auth.email()`, et le code teste la
    // même chaîne à vingt-cinq endroits. L'accès ne meurt pas avec le compte,
    // il se met à flotter.
    //
    // ⚠️ ET LE GARDE-FOU DES TRANSACTIONS PAYÉES N'AURAIT RIEN VU : un commerce
    // de test n'a pas de paiement, il passe donc sans qu'on lui demande rien.
    //
    // ⚠️ DEUX CHEMINS INDÉPENDANTS, comme pour un diagnostic : l'identifiant du
    // demandeur, et l'adresse du compte visé. Le premier suffit aujourd'hui ; le
    // second tiendra encore le jour où l'admin sera une liste et non une
    // constante.
    // ═══════════════════════════════════════════════════════════════════════
    if (c.auth_user_id && user?.id && c.auth_user_id === user.id) {
      return NextResponse.json({
        ok: false,
        error: 'compte_admin',
        message: `« ${c.nom} » est rattaché à TON compte. Le supprimer effacerait ton accès administrateur et libérerait ton adresse : n'importe qui pourrait ensuite s'inscrire avec et prendre ta place. Détache d'abord ce commerce de ton compte.`,
      }, { status: 409 })
    }
    if (c.auth_user_id) {
      const { data: vise } = await admin.auth.admin.getUserById(c.auth_user_id)
      if (vise?.user?.email && vise.user.email === ADMIN_EMAIL) {
        return NextResponse.json({
          ok: false,
          error: 'compte_admin',
          message: `« ${c.nom} » est rattaché au compte administrateur. Le supprimer libérerait l'adresse qui donne tous les droits sur Yoppaa.`,
        }, { status: 409 })
      }
    }

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

    // ─── LE COMPTE LIÉ, ET ON LIT CE QUI SE PASSE ──────────────────────────
    //
    // 🔴 CE `await` ÉTAIT UN ESPOIR, PAS UNE ACTION (30/08 au soir). Son échec
    // partait dans un `console.warn` que personne ne lit, et l'écran répondait
    // « supprimé » dans tous les cas.
    //
    // ⚠️ CE N'EST PAS UN DÉTAIL DE JOURNAL : effacer un commerçant, c'est
    // répondre à une demande d'effacement. Si le compte survit, la personne
    // reste inscrite, peut encore se connecter, et Yoppaa croit l'avoir
    // supprimée. On le DIT au lieu de l'espérer.
    //
    // ⚠️ ET C'EST PRÉCISÉMENT CE SILENCE QUI A SAUVÉ L'ACCÈS D'ALEX : le
    // commerce « Dermaé » était rattaché à son compte, l'effacement a échoué, et
    // rien ne l'a signalé. La chance a fait le travail d'une garde.
    let compteSupprime = null
    if (c.auth_user_id) {
      const { error: errAuth } = await admin.auth.admin.deleteUser(c.auth_user_id)
        .catch((e) => ({ error: e }))
      if (errAuth) {
        console.error('[admin/commercants DELETE] compte auth NON supprimé', errAuth?.message, { cid })
        compteSupprime = false
      } else {
        compteSupprime = true
      }
    }
    if (c.logo_url && c.logo_url.includes('/logos/')) {
      const fileName = c.logo_url.split('/logos/')[1]?.split('?')[0]
      if (fileName) await admin.storage.from('logos').remove([fileName]).catch(() => {})
    }

    return NextResponse.json({
      ok: true,
      deleted: c.nom,
      forced: !!force,
      // `null` = il n'y avait aucun compte à supprimer, et ce n'est pas `false`.
      compte_supprime: compteSupprime,
      ...(compteSupprime === false ? {
        avertissement: `Le commerce est supprimé, mais son compte de connexion existe toujours : ${c.nom} peut encore se connecter. À supprimer à la main dans Supabase Auth.`,
      } : {}),
    })
  } catch (e) {
    console.error('[admin/commercants DELETE]', e?.message)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
