// GET /api/admin/fiches-a-publier
//
// LES COMMERÇANTS VALIDÉS DONT LA FICHE N'EST PAS EN LIGNE (28/09).
//
// Pour chacun : ce qui est fait, ce qui manque, s'il a demandé sa mise en
// ligne, et quand il a été relancé. C'est l'écran d'où Alex relance ou publie.
//
// ⚠️ LES COMPTES VIENNENT DE LA BASE, FICHE PAR FICHE (lib/fiche-complete-
// server.js) : une liste de lignes d'articles tronquée à mille ferait paraître
// vide le dernier commerce de la liste.

import { NextResponse } from 'next/server'
import { utilisateurAppelant, adminVerifie, clientAdmin } from '@/lib/api-auth'
import { comptesDeLaFiche } from '@/lib/fiche-complete-server'
import { ficheComplete, COLONNES_FICHE_COMPLETE, PUBLICATIONS_EN_ATTENTE } from '@/lib/fiche-complete'
import { STATUTS_ACCES_AUTORISE } from '@/lib/statut-commercant'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    if (!(await adminVerifie(request, user))) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })

    const admin = clientAdmin()
    const { data, error } = await admin
      .from('commercants')
      .select(`${COLONNES_FICHE_COMPLETE}, telephone, slug`)
      .in('statut', STATUTS_ACCES_AUTORISE)
      .in('statut_publication', PUBLICATIONS_EN_ATTENTE)
      .order('nom')
    if (error) return NextResponse.json({ ok: false, error: `lecture impossible : ${error.message}` }, { status: 500 })

    const maintenant = new Date()
    const fiches = await Promise.all((data || []).map(async (c) => {
      const comptes = await comptesDeLaFiche(admin, c.id)
      const bilan = ficheComplete({ commercant: c, ...comptes, maintenant })
      return {
        id: c.id,
        nom: c.nom,
        email: c.email,
        telephone: c.telephone,
        slug: c.slug,
        statut_publication: c.statut_publication,
        publication_demandee_at: c.publication_demandee_at,
        relance_fiche_envoyee_at: c.relance_fiche_envoyee_at,
        relances_fiche_nb: c.relances_fiche_nb || 0,
        complet: bilan.complet,
        faits: bilan.faits,
        total: bilan.total,
        criteres: bilan.criteres.map(k => ({ cle: k.cle, label: k.label, atteint: k.atteint, avancement: k.avancement || null })),
      }
    }))

    return NextResponse.json({ ok: true, fiches })
  } catch (e) {
    console.error('[admin/fiches-a-publier] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
