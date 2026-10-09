// POST /api/commercant/accepter-cgu
// Body : { commercant_id, version }
//
// L'ACCEPTATION DES CGU COMMERÇANT, ÉCRITE PAR LE SERVEUR (06/10, décision
// d'Alex : « case CGU avec preuve »).
//
// ⚠️ LE TITULAIRE DU COMPTE, ET LUI SEUL. Contrairement à `gardeCommercant`,
// l'administrateur ne passe PAS : accepter des conditions au nom d'un
// commerçant ne prouverait rien, c'est même l'inverse d'une preuve.
//
// ⚠️ LA VERSION ENVOYÉE DOIT ÊTRE CELLE EN VIGUEUR. Un onglet resté ouvert sur
// une ancienne version ne fait pas accepter la nouvelle sans l'avoir montrée.
//
// L'heure est celle du SERVEUR, et chaque acceptation est gardée dans
// `cgu_acceptations` (une nouvelle version n'efface pas l'ancienne).

import { NextResponse } from 'next/server'
import { utilisateurAppelant, clientAdmin } from '@/lib/api-auth'
import { CGU_COMMERCANT_VERSION } from '@/lib/cgu'
import { origineRequete } from '@/lib/declaration'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const user = await utilisateurAppelant(request)
    if (!user) return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })

    const { commercant_id, version } = await request.json().catch(() => ({}))
    if (!commercant_id) return NextResponse.json({ ok: false, error: 'commercant_id requis' }, { status: 400 })
    if (version !== CGU_COMMERCANT_VERSION) {
      return NextResponse.json({ ok: false, error: 'Les conditions ont été mises à jour : recharge la page pour lire la version en vigueur.' }, { status: 409 })
    }

    const admin = clientAdmin()
    // ⚠️ TOUTES LES FICHES DU COMPTE : elles appartiennent à la même personne,
    // qui accepte une fois pour toutes, et chacune garde sa ligne au journal.
    const { data: fiches, error: errLecture } = await admin
      .from('commercants').select('id').eq('auth_user_id', user.id)
    if (errLecture) return NextResponse.json({ ok: false, error: 'lecture impossible, réessaie' }, { status: 500 })
    // ⚠️ LA FICHE ANNONCÉE DOIT ÊTRE À LUI. Pas d'exception pour l'admin.
    const ids = (fiches || []).map(f => f.id)
    if (!ids.includes(commercant_id)) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    const maintenant = new Date().toISOString()
    // ⚠️ L'ADRESSE IP ET LE NAVIGATEUR (09/10) : sans eux, l'acceptation dit
    // QUAND et QUEL COMPTE, pas D'OÙ. C'est ce qui départage un « ce n'était
    // pas moi ».
    const { ip, navigateur } = origineRequete(request.headers)
    // Le journal d'abord : une acceptation sans trace ne vaut rien, une trace
    // sans mise à jour de la fiche se rattrape à la connexion suivante.
    const { error: errJournal } = await admin.from('cgu_acceptations').insert(
      ids.map(id => ({ commercant_id: id, auth_user_id: user.id, version: CGU_COMMERCANT_VERSION, acceptee_at: maintenant, ip, navigateur })),
    )
    if (errJournal) return NextResponse.json({ ok: false, error: 'enregistrement impossible, réessaie' }, { status: 500 })

    const { error: errMaj } = await admin.from('commercants')
      .update({ cgu_version: CGU_COMMERCANT_VERSION, cgu_acceptees_at: maintenant })
      .in('id', ids)
    if (errMaj) return NextResponse.json({ ok: false, error: 'enregistrement impossible, réessaie' }, { status: 500 })

    return NextResponse.json({ ok: true, version: CGU_COMMERCANT_VERSION, acceptees_at: maintenant })
  } catch (e) {
    console.error('[commercant/accepter-cgu] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'erreur serveur' }, { status: 500 })
  }
}
