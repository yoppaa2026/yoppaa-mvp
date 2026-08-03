// POST /api/yopper/commandes
//
// Accès serveur (service_role) à la table `commandes` pour le Yopper, afin de
// fermer la fuite RLS #4c : avant, le navigateur lisait `commandes` en clé anon
// avec `Select commande` USING(true) → n'importe qui pouvait dumper email/nom/
// téléphone/adresse/total de TOUTES les commandes. Désormais « mes commandes »,
// la confirmation de réception et le re-fetch post-paiement passent ici.
// (Les agrégats sans PII — dispo créneaux, capacité, n° position — passent par
//  la vue `commandes_stats`, pas par cette route.)
//
// Sécurité :
//   • list / confirmer-reception : autorisés UNIQUEMENT via le cookie Yopper
//     (yoppaa_yopper, HTTP-only) → l'email vient du cookie, jamais du body, donc
//     pas d'énumération. La réception vérifie que la commande appartient bien à
//     l'email du cookie avant l'UPDATE.
//   • get-one : par id de commande (UUID). Renvoie seulement les champs d'affichage
//     de la confirmation. L'UUID est fourni par le retour Stripe du Yopper lui-même
//     (= capacité) ; résidu accepté (qui connaît l'UUID exact voit ces champs).
//
// Body : { action, ...params }
//   - 'list'                : {} (cookie) → { commandes: [...] } (enrichi numéro)
//   - 'confirmer-reception' : { commande_id } (cookie) → { ok }
//   - 'get-one'             : { commande_id } → { commande }

import { NextResponse } from 'next/server'
import { identiteProuvee } from '@/lib/yopper-auth'
import { createClient } from '@supabase/supabase-js'
import { crediterFidelite } from '@/lib/fidelite-server'
import { canDo } from '@/lib/plans'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Identité Yopper PROUVÉE (décision Alex du 03/08).
//
// Le cookie ne suffit plus ici. Il était posé en saisissant simplement son
// email dans le tunnel : saisir celui d'un tiers donnait donc accès à SON
// historique de commandes, avec ses adresses de livraison et son téléphone.
// L'historique exige désormais le jeton d'authentification Supabase, délivré
// après vérification de l'adresse email. Le lien contenu dans l'email de
// confirmation de commande, que seul le vrai destinataire reçoit, permet de
// l'obtenir en un clic, sans imposer d'inscription avant de commander.
async function yopperAuthentifie(request) {
  return identiteProuvee(request)
}

// Clé de date d'une commande (date_commande YYYY-MM-DD sinon created_at).
function dateKeyOf(c) {
  const ref = c.date_commande || c.created_at
  if (typeof ref === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ref)) return ref
  return new Date(ref).toISOString().slice(0, 10)
}

// Enrichit chaque commande avec numeroAffiche : numero_commande de la DB en
// priorité, sinon position du jour pour ce commerçant (tri créneau puis
// created_at) — même logique que le dashboard / PickupScreen (parité affichage).
async function enrichirNumeros(supabase, commandes) {
  const cles = [...new Set(commandes.map(c => `${c.commercant_id}|${dateKeyOf(c)}`))]
  const positionsMap = {}
  await Promise.all(cles.map(async cle => {
    const sep = cle.lastIndexOf('|')
    const cid = cle.slice(0, sep)
    const dateStr = cle.slice(sep + 1)
    const { data: duJour } = await supabase
      .from('commandes')
      .select('id, created_at, creneau:creneaux(heure_debut)')
      .eq('commercant_id', cid)
      .eq('date_commande', dateStr)
      .order('created_at', { ascending: true })
    const tri = (duJour || []).sort((a, b) =>
      (a.creneau?.heure_debut || '').localeCompare(b.creneau?.heure_debut || '') ||
      new Date(a.created_at) - new Date(b.created_at)
    )
    tri.forEach((c, idx) => { positionsMap[c.id] = idx + 1 })
  }))
  return commandes.map(c => ({
    ...c,
    numeroAffiche: c.numero_commande || positionsMap[c.id] || null,
  }))
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'body JSON requis' }, { status: 400 }) }
  const action = body?.action

  const supabase = admin()

  try {
    // ─── get-one : re-fetch post-paiement par UUID (champs d'affichage) ─────
    if (action === 'get-one') {
      const id = body.commande_id
      if (!id) return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })
      const { data } = await supabase
        .from('commandes')
        .select('id, numero_commande, total, date_commande, statut, client_nom')
        .eq('id', id)
        .maybeSingle()
      return NextResponse.json({ ok: true, commande: data || null })
    }

    // ─── opérations "own" : autorisées par le cookie uniquement ────────────
    const yopper = await yopperAuthentifie(request)
    if (!yopper) return NextResponse.json({ ok: false, error: 'session_yopper_manquante' }, { status: 401 })

    if (action === 'list') {
      const { data } = await supabase
        .from('commandes')
        .select('*, commercant:commercants(nom, type, categorie), creneau:creneaux(heure_debut, heure_fin), creneau_livraison:livraison_creneaux(heure_debut, heure_fin)')
        .eq('client_email', yopper.email)
        .order('created_at', { ascending: false })
      if (!data || data.length === 0) return NextResponse.json({ ok: true, commandes: [] })
      const enriched = await enrichirNumeros(supabase, data)
      return NextResponse.json({ ok: true, commandes: enriched })
    }

    if (action === 'confirmer-reception') {
      const id = body.commande_id
      if (!id) return NextResponse.json({ ok: false, error: 'commande_id requis' }, { status: 400 })
      // Vérifie l'appartenance : la commande doit être à l'email du cookie.
      const { data: cmd } = await supabase
        .from('commandes').select('id, mode_retrait, client_email').eq('id', id).maybeSingle()
      if (!cmd || cmd.client_email?.toLowerCase() !== yopper.email) {
        return NextResponse.json({ ok: false, error: 'commande_introuvable' }, { status: 404 })
      }
      // Livraison : le Yopper confirme la RÉCEPTION → statut_livraison='livree'
      // en plus de statut='recupere' (aligné sur le flux commerçant).
      const patch = cmd.mode_retrait === 'livraison'
        ? { statut: 'recupere', statut_livraison: 'livree' }
        : { statut: 'recupere' }
      const { error } = await supabase.from('commandes').update(patch).eq('id', id)
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

      // Crédit fidélité automatique (Vendre) : le SWIPE CLIENT est le chemin
      // normal du retrait vers 'recupere' (le dashboard ne couvre que
      // expédition/livraison/bouton commerçant). Best-effort, idempotent.
      try {
        const { data: full } = await supabase
          .from('commandes').select('id, commercant_id, client_telephone, total').eq('id', id).maybeSingle()
        if (full) {
          const { data: commercant } = await supabase
            .from('commercants').select('*').eq('id', full.commercant_id).maybeSingle()
          if (commercant?.fidelite_actif && canDo(commercant.plan, 'fidelite_auto')) {
            const credit = commercant.fidelite_mecanique === 'cagnotte'
              ? { montant: Number(full.total || 0) }
              : { passages: 1 }
            await crediterFidelite(supabase, commercant, full.client_telephone, credit, {
              source: 'commande', commande_id: full.id,
            })
          }
        }
      } catch (e) {
        console.error('[yopper/commandes] credit fidelite KO (non-bloquant)', e?.message)
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[yopper/commandes] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
