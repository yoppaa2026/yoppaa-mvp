// POST /api/commande/expedier
// Body : { commande_id, transporteur, suivi }
//
// « Marquer expédiée » : le colis est parti, la commande se termine
// (`recupere`, comme une livraison livrée) et garde son transporteur et son
// numéro de suivi.
//
// 🔴 LE TABLEAU DE BORD L'ÉCRIVAIT DEPUIS LE NAVIGATEUR (audit livraison I3,
// 05/10), sans lire le statut : une commande annulée et remboursée pouvait
// passer « expédiée », avec la fidélité et l'email « ton colis est parti »
// derrière. Ici : une expédition PRÊTE seulement, écrite sur l'état lu.
//
// ⚠️ LE NUMÉRO DE SUIVI FINIT DANS UNE ADRESSE DE LIEN (lib/transporteurs.js)
// et dans un email : lettres, chiffres, espaces et tirets seulement.

import { NextResponse } from 'next/server'
import { clientAdmin, refus } from '@/lib/api-auth'
import { gardeLigneEquipe, journaliserGeste } from '@/lib/equipe-server'
import { TRANSPORTEURS } from '@/lib/transporteurs'

export const dynamic = 'force-dynamic'

const CLES_TRANSPORTEUR = TRANSPORTEURS.map(t => t.cle)
const RE_SUIVI = /^[A-Za-z0-9 -]{1,60}$/

export async function POST(request) {
  try {
    const { commande_id, transporteur = null, suivi = null } = await request.json().catch(() => ({}))
    if (!commande_id) return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })

    const cle = transporteur ? String(transporteur) : null
    if (cle && !CLES_TRANSPORTEUR.includes(cle)) {
      return NextResponse.json({ ok: false, error: 'Transporteur inconnu.' }, { status: 400 })
    }
    const numero = suivi ? String(suivi).trim() : ''
    if (numero && !RE_SUIVI.test(numero)) {
      return NextResponse.json({ ok: false, error: 'Le numéro de suivi ne peut contenir que des lettres, des chiffres, des espaces et des tirets (60 au plus).' }, { status: 400 })
    }

    const admin = clientAdmin()
    const verdict = await gardeLigneEquipe(request, admin, 'commandes', commande_id, 'commandes')
    const nonAutorise = refus(verdict, NextResponse)
    if (nonAutorise) return nonAutorise

    const { data: c, error: errLu } = await admin.from('commandes')
      .select('id, statut, mode_retrait').eq('id', commande_id).maybeSingle()
    if (errLu) throw new Error(`lecture de la commande : ${errLu.message}`)
    if (!c) return NextResponse.json({ ok: false, error: 'Commande introuvable.' }, { status: 404 })
    if (c.mode_retrait !== 'expedition' || c.statut !== 'pret') {
      return NextResponse.json({ ok: false, error: 'Seul un colis prêt peut être marqué expédié.' }, { status: 409 })
    }

    const champs = {
      statut: 'recupere',
      expedition_suivi: numero || null,
      expedition_transporteur: cle,
    }
    const { data: ecrit, error } = await admin.from('commandes')
      .update(champs)
      .eq('id', commande_id).eq('statut', 'pret').eq('mode_retrait', 'expedition')
      .select('id').maybeSingle()
    if (error) return NextResponse.json({ ok: false, error: `commande non mise à jour : ${error.message}` }, { status: 500 })
    if (!ecrit) return NextResponse.json({ ok: false, code: 'deja_fait', error: 'Cette commande vient d’être modifiée par quelqu’un d’autre.' }, { status: 409 })

    await journaliserGeste(admin, verdict, {
      action: 'commande_expediee', cible_type: 'commande', cible_id: commande_id,
      details: { transporteur: cle },
    })
    return NextResponse.json({ ok: true, champs })
  } catch (e) {
    console.error('[commande/expedier] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
