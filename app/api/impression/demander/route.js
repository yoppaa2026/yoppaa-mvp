// POST /api/impression/demander
// Body : { commercant_id, origine: 'reimpression' | 'essai', commande_id?, sacs? }
//
// UNE ÉTIQUETTE DEMANDÉE À LA MAIN (« Yoppaa Comptoir », 11/10) : réimprimer
// celle d'une commande (avec un nombre de sacs), ou l'étiquette d'essai pour
// régler la machine. Le dépôt automatique, au démarrage de la prépa, vit dans
// `/api/equipe/commande/statut`.
//
// ⚠️ SANS STATION, ON LE DIT : personne ne viderait la file, l'étiquette
// attendrait sans que le commerçant le sache.

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe } from '@/lib/equipe-server'
import { etiquetteConcernee } from '@/lib/etiquette-commande'
import { sacsBornes } from '@/lib/file-etiquettes'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id, origine, commande_id = null, sacs = 1 } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })
    if (!['reimpression', 'essai'].includes(origine)) return NextResponse.json({ ok: false, error: 'Demande inconnue.' }, { status: 400 })

    const { data: station, error: errS } = await admin.from('stations_impression')
      .select('commercant_id').eq('commercant_id', commercant_id).maybeSingle()
    if (errS) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
    if (!station) return NextResponse.json({ ok: false, error: 'Aucune tablette n’est l’imprimante du comptoir.', sans_station: true }, { status: 409 })

    if (origine === 'reimpression') {
      // 🔴 LA COMMANDE DE CE COMMERCE, relue : un identifiant envoyé par le
      // navigateur ne suffit pas à imprimer la commande d'un autre.
      const { data: c, error } = await admin.from('commandes').select('id, commercant_id, mode_retrait')
        .eq('id', commande_id).eq('commercant_id', commercant_id).maybeSingle()
      if (error) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
      if (!c) return NextResponse.json({ ok: false, error: 'Commande introuvable.' }, { status: 404 })
      if (!etiquetteConcernee(c)) return NextResponse.json({ ok: false, error: 'Cette commande n’a pas d’étiquette (expédition).' }, { status: 400 })
    }

    const { data: ligne, error: errI } = await admin.from('etiquettes_impression').insert({
      commercant_id,
      commande_id: origine === 'essai' ? null : commande_id,
      origine,
      sacs: sacsBornes(sacs),
    }).select('id').single()
    if (errI) return NextResponse.json({ ok: false, error: `Étiquette non déposée : ${errI.message}` }, { status: 500 })
    return NextResponse.json({ ok: true, id: ligne.id })
  } catch (e) {
    console.error('[impression/demander] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur, réessaie.' }, { status: 500 })
  }
}
