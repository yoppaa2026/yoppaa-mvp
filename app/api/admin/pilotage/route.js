// GET /api/admin/pilotage
//
// Le tableau de pilotage d'Alex (19/10) : croissance et demande, commerçants et
// revenu, activité, santé technique. Le même calcul que l'email de 7h00
// (`construirePilotage`), pour que la page et l'email ne disent jamais deux
// chiffres différents.
//
// Auth : admin Yoppaa AVEC double authentification (`adminVerifie`).
// ⚠️ La réponse ne porte que des agrégats et des noms de COMMERCES : aucune
// donnée de Yopper n'est lue (lib/pilotage-server.js).

import { NextResponse } from 'next/server'
import { utilisateurAppelant, adminVerifie, clientAdmin } from '@/lib/api-auth'
import { construirePilotage } from '@/lib/pilotage-server'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    if (!(await adminVerifie(request, user))) return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })

    const pilotage = await construirePilotage(clientAdmin(), new Date())
    return NextResponse.json({ ok: true, pilotage })
  } catch (e) {
    console.error('[admin/pilotage]', e)
    return NextResponse.json({ ok: false, error: 'lecture du pilotage impossible' }, { status: 500 })
  }
}
