// POST /api/impression/file
// Body : { commercant_id, appareil_id }
//
// CE QUE LA STATION DU COMPTOIR VIENT CHERCHER, toutes les 3 secondes
// (« Yoppaa Comptoir », 11/10) :
//   1. elle dit qu'elle est en ligne (`dernier_contact`) ;
//   2. une étiquette PRISE il y a plus de 90 s et jamais rendue (l'app fermée
//      en pleine impression) redevient « en attente » ;
//   3. elle PREND au plus 5 étiquettes (en_attente → en_cours), et reçoit leur
//      contenu, calculé MAINTENANT depuis la commande relue.
//
// 🔴 JAMAIS DEUX FOIS LA MÊME : la prise est une écriture conditionnelle
// (`statut = 'en_attente'`). Deux passages simultanés ne prennent jamais la
// même ligne : la seconde écriture ne trouve plus rien.
// 🔴 SEULE LA STATION DÉCLARÉE VIDE LA FILE : un autre appareil du même
// commerce reçoit un refus qui le dit (une seule imprimante par commerce).

import { NextResponse } from 'next/server'
import { clientAdmin } from '@/lib/api-auth'
import { gardeEquipe } from '@/lib/equipe-server'
import { PAR_PASSAGE, REPRISE_EN_COURS_MS, SELECT_COMMANDE_ETIQUETTE, contenusAImprimer } from '@/lib/file-etiquettes'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const { commercant_id, appareil_id } = await request.json().catch(() => ({}))
    const admin = clientAdmin()
    const garde = await gardeEquipe(request, admin, commercant_id, 'commandes')
    if (!garde.ok) return NextResponse.json({ ok: false, error: garde.error }, { status: garde.status })

    const { data: station, error: errS } = await admin.from('stations_impression')
      .select('appareil_id').eq('commercant_id', commercant_id).maybeSingle()
    if (errS) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })
    if (!station || station.appareil_id !== appareil_id) {
      return NextResponse.json({ ok: false, error: 'Cette tablette n’est plus l’imprimante du comptoir.', pas_la_station: true }, { status: 409 })
    }

    const maintenant = new Date()
    const { error: errC } = await admin.from('stations_impression')
      .update({ dernier_contact: maintenant.toISOString() }).eq('commercant_id', commercant_id).eq('appareil_id', appareil_id)
    if (errC) return NextResponse.json({ ok: false, error: 'Lecture impossible, réessaie.' }, { status: 500 })

    // 2. Les étiquettes prises et jamais rendues reviennent dans la file.
    const limite = new Date(maintenant.getTime() - REPRISE_EN_COURS_MS).toISOString()
    const { error: errR } = await admin.from('etiquettes_impression')
      .update({ statut: 'en_attente', pris_le: null, appareil_id: null })
      .eq('commercant_id', commercant_id).eq('statut', 'en_cours').lt('pris_le', limite)
    if (errR) return NextResponse.json({ ok: false, error: 'File illisible, réessaie.' }, { status: 500 })

    // 3. Les plus anciennes d'abord, au plus PAR_PASSAGE.
    const { data: candidates, error: errL } = await admin.from('etiquettes_impression')
      .select('id').eq('commercant_id', commercant_id).eq('statut', 'en_attente')
      .order('cree_le', { ascending: true }).limit(PAR_PASSAGE)
    if (errL) return NextResponse.json({ ok: false, error: 'File illisible, réessaie.' }, { status: 500 })
    if (!candidates?.length) return NextResponse.json({ ok: true, etiquettes: [] })

    const { data: prises, error: errP } = await admin.from('etiquettes_impression')
      .update({ statut: 'en_cours', pris_le: maintenant.toISOString(), appareil_id })
      .in('id', candidates.map(c => c.id)).eq('commercant_id', commercant_id).eq('statut', 'en_attente')
      .select('id, commande_id, origine, sacs, cree_le')
    if (errP) return NextResponse.json({ ok: false, error: 'File illisible, réessaie.' }, { status: 500 })
    if (!prises?.length) return NextResponse.json({ ok: true, etiquettes: [] })

    const ids = [...new Set(prises.map(p => p.commande_id).filter(Boolean))]
    let commandes = []
    if (ids.length > 0) {
      const { data, error } = await admin.from('commandes').select(SELECT_COMMANDE_ETIQUETTE)
        .in('id', ids).eq('commercant_id', commercant_id)
      // ⚠️ Les lignes prises reviendront dans 90 s : rien n'est perdu.
      if (error) return NextResponse.json({ ok: false, error: 'Commandes illisibles, réessaie.' }, { status: 500 })
      commandes = data || []
    }
    const parId = Object.fromEntries(commandes.map(c => [c.id, c]))

    const etiquettes = []
    const disparues = []
    for (const p of prises.sort((a, b) => String(a.cree_le).localeCompare(String(b.cree_le)))) {
      const contenus = contenusAImprimer(p, {
        commande: parId[p.commande_id] || null,
        categorie: garde.commercant?.categorie,
        commerce: garde.commercant?.nom,
      })
      if (!contenus) { disparues.push(p.id); continue }
      etiquettes.push({ id: p.id, origine: p.origine, contenus })
    }
    // Une commande disparue ne s'imprimera jamais : échec, dit tout de suite.
    // ⚠️ LU, PAS ESPÉRÉ : sinon la ligne revient dans 90 s et repart en échec.
    if (disparues.length > 0) {
      const { error: errD } = await admin.from('etiquettes_impression')
        .update({ statut: 'echec', raison: 'commande_introuvable', termine_le: maintenant.toISOString() })
        .in('id', disparues).eq('statut', 'en_cours')
      if (errD) console.error('[impression/file] échec non inscrit', { ids: disparues, erreur: errD.message })
    }
    return NextResponse.json({ ok: true, etiquettes })
  } catch (e) {
    console.error('[impression/file] erreur', e?.message || e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur, réessaie.' }, { status: 500 })
  }
}
