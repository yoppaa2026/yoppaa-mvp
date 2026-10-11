// POST /api/impression/station
// Body : { commercant_id, action: 'etat' | 'declarer' | 'retirer', appareil_id?, nom? }
//
// LA TABLETTE DU COMPTOIR (« Yoppaa Comptoir », 11/10). Décision d'Alex : la
// tablette appartient au commerce PAR LA CONNEXION. Le commerçant (ou un
// membre de l'équipe qui gère les commandes) connecté sur la tablette coche
// « cette tablette est l'imprimante du comptoir » : c'est `declarer`.
//
//   - etat     : la station (en ligne ? cet appareil ?) et les dernières
//                étiquettes, pour le tableau de bord ;
//   - declarer : CET appareil devient la station (il remplace la précédente :
//                une seule par commerce, la file n'a qu'un lecteur) ;
//   - retirer  : plus de station. Les étiquettes en attente restent, mais
//                plus rien n'est déposé.
//
// ⚠️ SERVEUR SEULEMENT : `stations_impression` et `etiquettes_impression`
// n'ont aucun droit pour les navigateurs (MIGRATION_FILE_ETIQUETTES).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe } from '@/lib/equipe-server'
import { stationEnLigne, phraseEchec } from '@/lib/file-etiquettes'

export const dynamic = 'force-dynamic'

const appareilValide = (a) => typeof a === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(a)

export async function POST(request) {
  try {
    const { commercant_id, action = 'etat', appareil_id = null, nom = null } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })

    if (action === 'declarer') {
      if (!appareilValide(appareil_id)) return NextResponse.json({ ok: false, error: 'Appareil inconnu.' }, { status: 400 })
      const { error } = await admin.from('stations_impression').upsert({
        commercant_id,
        appareil_id,
        nom: String(nom || 'Tablette du comptoir').trim().slice(0, 60) || 'Tablette du comptoir',
        declaree_par: garde.user.id,
        declaree_le: new Date().toISOString(),
        dernier_contact: new Date().toISOString(),
      }, { onConflict: 'commercant_id' })
      if (error) return NextResponse.json({ ok: false, error: `Station non enregistrée : ${error.message}` }, { status: 500 })
    } else if (action === 'retirer') {
      const { error } = await admin.from('stations_impression').delete().eq('commercant_id', commercant_id)
      if (error) return NextResponse.json({ ok: false, error: `Station non retirée : ${error.message}` }, { status: 500 })
    } else if (action !== 'etat') {
      return NextResponse.json({ ok: false, error: 'Action inconnue.' }, { status: 400 })
    }

    const [{ data: station, error: errS }, { data: dernieres, error: errE }] = await Promise.all([
      admin.from('stations_impression').select('appareil_id, nom, declaree_le, dernier_contact').eq('commercant_id', commercant_id).maybeSingle(),
      admin.from('etiquettes_impression').select('id, commande_id, origine, sacs, statut, raison, cree_le, termine_le')
        .eq('commercant_id', commercant_id).order('cree_le', { ascending: false }).limit(10),
    ])
    // ⚠️ « JE N'AI PAS PU LIRE » N'EST PAS « AUCUNE STATION ».
    if (errS || errE) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })

    return NextResponse.json({
      ok: true,
      station: station ? {
        nom: station.nom,
        declareeLe: station.declaree_le,
        dernierContact: station.dernier_contact,
        enLigne: stationEnLigne(station.dernier_contact),
        cetAppareil: appareilValide(appareil_id) && station.appareil_id === appareil_id,
      } : null,
      dernieres: (dernieres || []).map(e => ({ ...e, phrase: e.statut === 'echec' ? phraseEchec(e.raison) : null })),
    })
  } catch (e) {
    console.error('[impression/station] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur, réessaie.' }, { status: 500 })
  }
}
