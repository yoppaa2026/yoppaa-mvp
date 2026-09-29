// POST /api/equipe/mes-equipes
//
// LES ÉQUIPES DONT JE FAIS PARTIE, MAINTENANT (29/09) : le Poste équipe s'ouvre
// sur cette liste.
//
// ⚠️ LA MÊME RÈGLE QUE CHAQUE GESTE (`peutAgir`) : un accès terminé, un
// commerce sorti de Vendre ou non validé n'apparaissent pas. L'écran ne
// montre donc jamais une porte que le serveur refuserait d'ouvrir.

import { NextResponse } from 'next/server'
import { clientAdmin, utilisateurAppelant } from '@/lib/api-auth'
import { COLONNES_MEMBRE, COLONNES_COMMERCE_EQUIPE } from '@/lib/equipe-server'
import { membreEnActivite, commerceAUneEquipe, CLES_DROITS, colonneDroit } from '@/lib/equipe'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const admin = clientAdmin()
    const { data: membres, error } = await admin.from('equipe_membres').select(COLONNES_MEMBRE)
      .eq('auth_user_id', user.id).eq('statut', 'actif')
    if (error) throw new Error(`lecture des équipes : ${error.message}`)

    const ids = [...new Set((membres || []).map(m => m.commercant_id))]
    let commerces = []
    if (ids.length) {
      const { data, error: errC } = await admin.from('commercants').select(COLONNES_COMMERCE_EQUIPE).in('id', ids)
      if (errC) throw new Error(`lecture des commerces : ${errC.message}`)
      commerces = data || []
    }

    const maintenant = new Date()
    const equipes = (membres || [])
      .map(m => ({ m, c: commerces.find(c => c.id === m.commercant_id) }))
      .filter(({ m, c }) => membreEnActivite(m, maintenant) && commerceAUneEquipe(c, maintenant))
      .map(({ m, c }) => {
        const droits = {}
        for (const cle of CLES_DROITS) droits[cle] = m[colonneDroit(cle)] === true
        // ⚠️ Jamais l'email du commerce ni son compte : le nom, l'adresse
        // publique et les cases, c'est tout ce que l'écran affiche.
        return { commercant_id: c.id, nom: c.nom, slug: c.slug, type: c.type, categorie: c.categorie, prenom: m.prenom, droits, expire_le: m.expire_le || null }
      })
    return NextResponse.json({ ok: true, equipes })
  } catch (e) {
    console.error('[equipe/mes-equipes] erreur', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
