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
import { montantFidelisable } from '@/lib/fidelite'
import { canDo } from '@/lib/plans'
import { referenceCommande } from '@/lib/numero-commande'

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

// `dateKeyOf` vivait ici pour reconstituer une position du jour. Elle n'a plus
// d'objet : le numéro vient de la base, sous verrou, et ne se supplée plus.
// (Elle portait au passage un `toISOString()`, qui rend la date de la VEILLE
// entre minuit et deux heures du matin en Belgique.)

// La référence telle que le client la lit : « C12 », « L5 », « 12 ».
//
// ⚠️ IL Y AVAIT UN REPLI ICI, ET IL MENTAIT. Quand le numéro manquait, cette
// fonction recalculait « la position du jour » pour ce commerçant. Or la base
// numérote par SEMAINE : le commerçant pouvait lire « 12 » là où son client
// lisait « 3 ». Deux chiffres différents pour désigner la même commande, sur le
// seul point où ils doivent absolument se comprendre.
//
// Le compteur en base attribue désormais un numéro à COUP SÛR, sous verrou
// (MIGRATION_NUMERO_COMMANDE) : il n'y a plus rien à suppléer. Une commande sans
// numéro n'affiche donc RIEN, plutôt qu'un chiffre inventé.
function enrichirNumeros(commandes) {
  return commandes.map(c => ({
    ...c,
    numeroAffiche: referenceCommande(c),
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
      // ⚠️ CE `select` PRIVAIT L'ÉCRAN DE CONFIRMATION DE TOUT CE QU'IL LUI
      // FALLAIT, et deux défauts en découlaient directement :
      //
      //  • `numero_prefixe` absent → l'écran affichait « #4 » là où l'email et
      //    le tableau de bord annonçaient « CC4 ». La fonction d'enrichissement
      //    existait pourtant juste au-dessus, mais n'était appelée que par
      //    l'action `list` ;
      //  • `mode_retrait` et `creneau_id` absents → au retour de Stripe, l'état
      //    local ayant été reconstruit, l'écran ne retrouvait plus le créneau et
      //    se croyait en BOUTIQUE. Il annonçait « tu passes quand ça t'arrange,
      //    pendant les heures d'ouverture » à un client attendu à 17h00 précises.
      //
      // Le contexte d'affichage doit se dériver de la commande RELUE, jamais
      // d'un état d'écran qui ne survit pas à un aller-retour de paiement.
      const { data } = await supabase
        .from('commandes')
        .select('id, numero_commande, numero_prefixe, numero_semaine, total, date_commande, statut, client_nom, mode_retrait, creneau_id, creneau:creneaux(heure_debut, heure_fin)')
        .eq('id', id)
        .maybeSingle()
      const commande = data ? enrichirNumeros([data])[0] : null
      return NextResponse.json({ ok: true, commande })
    }

    // ─── opérations "own" : autorisées par le cookie uniquement ────────────
    const yopper = await yopperAuthentifie(request)
    if (!yopper) return NextResponse.json({ ok: false, error: 'session_yopper_manquante' }, { status: 401 })

    if (action === 'list') {
      const { data } = await supabase
        .from('commandes')
        // Les LIGNES sont chargées avec la commande : l'écran de retrait en
        // boutique affiche ce qu'il y a à sortir, le vendeur devant retrouver le
        // bon paquet. Sans elles, la liste resterait vide sans que rien ne le
        // signale, exactement comme une branche morte.
        //
        // ⚠️ ET IL EN MANQUAIT DEUX, DONT CELLE QUI DIT QUOI SORTIR.
        //  • `options` porte la VERSION choisie (taille, coloris) : elle n'a pas
        //    de colonne à elle, elle ne vit que là. Sans elle, l'écran annonçait
        //    « 1 × Robe fleurie » et le vendeur devait deviner la taille.
        //  • `article_nom` est le nom FIGÉ à la vente. Sans lui, un lot « 3+1 »
        //    s'affichait sous le nom de l'article de base, et un article retiré
        //    du catalogue ne s'affichait plus du tout.
        .select('*, commercant:commercants(nom, type, categorie), creneau:creneaux(heure_debut, heure_fin), creneau_livraison:livraison_creneaux(heure_debut, heure_fin), commande_articles(quantite, article_nom, options, article:articles(nom))')
        .eq('client_email', yopper.email)
        .order('created_at', { ascending: false })
      if (!data || data.length === 0) return NextResponse.json({ ok: true, commandes: [] })
      const enriched = enrichirNumeros(data)
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
          .from('commandes').select('id, commercant_id, client_telephone, client_email, total, bon_cadeau_montant').eq('id', id).maybeSingle()
        if (full) {
          const { data: commercant } = await supabase
            .from('commercants').select('*').eq('id', full.commercant_id).maybeSingle()
          if (commercant?.fidelite_actif && canDo(commercant.plan, 'fidelite_auto')) {
            // Hors part payée par bon cadeau : elle a déjà rempli la carte de
            // celui qui a acheté le bon (lib/fidelite).
            const credit = commercant.fidelite_mecanique === 'cagnotte'
              ? { montant: montantFidelisable(full) }
              : { passages: 1 }
            await crediterFidelite(supabase, commercant, full.client_telephone, credit, {
              source: 'commande', commande_id: full.id, client_email: full.client_email || null,
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
