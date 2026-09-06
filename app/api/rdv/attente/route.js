// Liste d'attente des rendez-vous, côté Yopper.
//
// GET  → { ok, attentes: [...] }        ce que j'attends, expiré exclu
// POST { action: 'inscrire', prestation_id, date_rdv?, heure_debut?, duree? }
// POST { action: 'retirer',  id }
//
// ⚠️ L'IDENTITÉ VIENT DU COOKIE SIGNÉ, JAMAIS DU CORPS. Sans cela il suffirait
// d'envoyer l'identifiant d'un autre pour le sortir de sa file, ou pour tenir
// un rang à sa place. Et `rdv_attente` n'a AUCUNE policy pour rattraper le
// coup : la table est fermée à `anon` et à `authenticated`, cette route est la
// seule porte.
//
// 🔴 YOPPERS CONNECTÉS SEULEMENT (décision d'Alex, 06/09) : il faut une
// identité pour tenir un rang, et un push pour joindre quelqu'un en minutes.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { identiteProuvee } from '@/lib/yopper-auth'
import { globalLimiter, checkLimit, clientIp } from '@/lib/ratelimit'
import { inscrire, retirer, mesAttentes } from '@/lib/attente-rdv-server'
import { libelleAttente } from '@/lib/attente-rdv'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Ce que le refus dit au Yopper. ⚠️ Une file pleine et une file fermée ne sont
// pas la même nouvelle : dans un cas il peut réessayer demain, dans l'autre le
// commerçant ne propose pas d'attente du tout.
const MESSAGES = {
  fermee: 'Ce commerçant ne propose pas de liste d’attente sur cette prestation.',
  complete: 'La liste d’attente est complète pour l’instant. Retente un peu plus tard.',
  deja_inscrit: 'Tu es déjà dans la liste d’attente.',
  demande_invalide: 'Cette demande n’est pas valable.',
  prestation_introuvable: 'Cette prestation n’existe plus.',
  prestation_inactive: 'Cette prestation n’est plus proposée.',
  identite_requise: 'Connecte-toi pour rejoindre la liste d’attente.',
  introuvable: 'Cette attente n’existe plus.',
}
const message = (code) => MESSAGES[code] || 'Impossible pour le moment, réessaie dans un instant.'

export async function GET(request) {
  const identite = await identiteProuvee(request)
  // ⚠️ ON DIT SI L'ON EST CONNECTÉ. Sans ça, l'écran ne saurait proposer
  // « préviens-moi » qu'en le laissant échouer sur un 401 : un bouton qui
  // refuse après le clic est pire que pas de bouton du tout.
  if (!identite?.client_id) return NextResponse.json({ ok: true, connecte: false, attentes: [] })

  const lignes = await mesAttentes(admin(), [identite.client_id])
  return NextResponse.json({
    ok: true,
    connecte: true,
    attentes: lignes.map(l => ({
      id: l.id,
      portee: l.portee,
      // ⚠️ LA CIBLE VOYAGE AVEC LA LIGNE. Sans elle, l'écran ne peut pas savoir
      // si le Yopper attend DÉJÀ cette séance-là, et il reproposerait un bouton
      // qui ne peut que se faire refuser par la base.
      prestation_id: l.prestation_id,
      date_rdv: l.date_rdv,
      heure_debut: l.heure_debut,
      date_debut: l.date_debut,
      date_fin: l.date_fin,
      prestation_nom: l.prestation?.nom || '',
      commercant_nom: l.commercant?.nom || '',
      commercant_slug: l.commercant?.slug || '',
      libelle: libelleAttente(l),
      statut: l.statut,
    })),
  })
}

export async function POST(request) {
  try {
    const limite = await checkLimit(globalLimiter, clientIp(request))
    if (!limite.success) {
      return NextResponse.json({ ok: false, error: 'Trop de requêtes, réessaie dans un instant.' }, { status: 429 })
    }

    const identite = await identiteProuvee(request)
    if (!identite?.client_id) {
      return NextResponse.json({ ok: false, error: message('identite_requise') }, { status: 401 })
    }

    const corps = await request.json().catch(() => ({}))
    const action = corps?.action

    if (action === 'retirer') {
      const res = await retirer(admin(), { id: corps?.id, clientIds: [identite.client_id] })
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: message(res.error) }, { status: res.error === 'introuvable' ? 404 : 400 })
      }
      return NextResponse.json({ ok: true })
    }

    if (action !== 'inscrire') {
      return NextResponse.json({ ok: false, error: 'Action inconnue.' }, { status: 400 })
    }

    // ⚠️ NI LA PORTÉE NI LE COMMERCE NE SONT LUS ICI. La portée se déduit de la
    // capacité de la prestation, relue en base, et le commerce vient de la
    // prestation : une requête forgée ne peut donc ni ranger une attente chez
    // le voisin, ni fabriquer une ligne que le déclencheur ne trouvera jamais.
    const res = await inscrire(admin(), {
      prestationId: corps?.prestation_id,
      clientId: identite.client_id,
      dateRdv: corps?.date_rdv,
      heureDebut: corps?.heure_debut,
      duree: corps?.duree,
    })
    if (!res.ok) {
      const statut = res.error === 'deja_inscrit' || res.error === 'complete' ? 409 : 400
      return NextResponse.json({ ok: false, error: message(res.error), raison: res.error }, { status: statut })
    }

    return NextResponse.json({
      ok: true,
      id: res.ligne?.id,
      rang: res.rang,
      plafond: res.plafond,
      libelle: libelleAttente(res.ligne),
    })
  } catch (e) {
    console.error('[rdv/attente]', e)
    return NextResponse.json({ ok: false, error: 'Erreur serveur.' }, { status: 500 })
  }
}
