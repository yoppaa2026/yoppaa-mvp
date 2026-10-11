// POST /api/impression/resultat
// Body : { commercant_id, appareil_id, id, ok, raison? }
//
// LA STATION REND UNE ÉTIQUETTE (« Yoppaa Comptoir », 11/10) : « imprimée »,
// ou « échec » avec sa raison (plus de papier, couvercle ouvert, injoignable,
// mauvais rouleau). Le tableau de bord le montre au commerçant.
//
// 🔴 SEULE LA STATION QUI L'A PRISE LA REND, et seulement si elle est encore
// « en cours » : une étiquette reprise par la file (90 s) puis rendue en retard
// par une app réveillée ne réécrit pas le résultat d'une autre impression.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe } from '@/lib/equipe-server'
import { raisonValide } from '@/lib/file-etiquettes'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id, appareil_id, id, ok, raison = null } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!id || !appareil_id) return NextResponse.json({ ok: false, error: 'Étiquette inconnue.' }, { status: 400 })

    const { data: ecrite, error } = await admin.from('etiquettes_impression')
      .update(ok === true
        ? { statut: 'imprimee', raison: null, termine_le: new Date().toISOString() }
        : { statut: 'echec', raison: raisonValide(raison), termine_le: new Date().toISOString() })
      .eq('id', id).eq('commercant_id', commercant_id).eq('appareil_id', appareil_id).eq('statut', 'en_cours')
      .select('id').maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: 'Résultat non enregistré, réessaie.' }, { status: 500 })
    // Déjà rendue, ou reprise par la file : rien à écrire, et ce n'est pas une erreur.
    return NextResponse.json({ ok: true, inscrit: !!ecrite })
  } catch (e) {
    console.error('[impression/resultat] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur, réessaie.' }, { status: 500 })
  }
}
