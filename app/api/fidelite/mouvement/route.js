// POST /api/fidelite/mouvement
//
// LE SEUL CHEMIN D'ÉCRITURE D'UNE CARTE DE FIDÉLITÉ DEPUIS LE COMPTOIR.
//
// ⚠️ POURQUOI CETTE ROUTE EXISTE (audit du 24/08). Le tableau de bord calculait
// la carte DANS LE NAVIGATEUR — `appliquerCredit` y tournait — puis écrivait
// passages, cagnotte et récompenses EN VALEUR BRUTE avec la session du
// commerçant. Le journal partait dans un SECOND appel, sans transaction : si
// celui-là échouait, la carte avait bougé sans laisser la moindre trace.
//
// ⚠️ ET RLS NE POUVAIT RIEN Y FAIRE : une policy protège la LIGNE, pas la
// VALEUR. Elle sait dire « cette carte est bien la tienne » ; elle ne sait pas
// dire « ce nombre de passages est celui que tu viens de compter ». Le seul
// endroit où cette garantie existe, c'est ici.
//
// ⚠️ ET LE SMS. `smsRecompenseDebloquee` n'était appelé que par les chemins
// AUTOMATIQUES (commande récupérée, RDV honoré). Le crédit du comptoir ne
// l'appelait pas : pour une boulangerie ou un snack, c'est-à-dire là où la
// fidélité vit vraiment, le message le plus rentable du programme ne partait
// jamais. Il part d'ici, maintenant.
//
// Actions :
//   { action: 'crediter',           commercant_id, carte_id, montant?, cle }
//   { action: 'utiliser_recompense',commercant_id, carte_id, cle }
//   { action: 'supprimer',          commercant_id, carte_id }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { appliquerCredit } from '@/lib/fidelite'
import { smsRecompenseDebloquee } from '@/lib/fidelite-sms'
import { creerRecompensesDebloquees } from '@/lib/fidelite-recompense-server'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ⚠️ La clé d'idempotence vient du navigateur : elle n'est JAMAIS de confiance
// pour désigner quoi que ce soit, elle sert uniquement d'ancre de doublon. On
// la borne pour qu'elle ne devienne pas un champ de stockage libre.
const RE_CLE = /^[A-Za-z0-9_-]{8,64}$/

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function POST(request) {
  try {
    const jeton = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!jeton) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${jeton}` } } }
    )
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'session invalide' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { action, commercant_id, carte_id, cle } = body || {}
    if (!RE_UUID.test(String(commercant_id || '')) || !RE_UUID.test(String(carte_id || ''))) {
      return NextResponse.json({ ok: false, error: 'identifiants invalides' }, { status: 400 })
    }

    const db = admin()

    // ── Le commerce lui appartient-il ? ────────────────────────────────────
    // Même règle que /api/fidelite/comptoir : c'est le seul rempart, la clé de
    // service ignore RLS.
    const { data: com } = await db
      .from('commercants')
      .select('id, nom, auth_user_id, fidelite_actif, fidelite_mecanique, fidelite_seuil_passages, fidelite_taux_cagnotte, fidelite_seuil_cagnotte, fidelite_recompense_type, fidelite_recompense_valeur, fidelite_recompense_libelle, fidelite_sms_actif')
      .eq('id', commercant_id)
      .maybeSingle()
    if (!com) return NextResponse.json({ ok: false, error: 'commerçant introuvable' }, { status: 404 })
    if (com.auth_user_id !== user.id && user.email !== 'verstappenalexandre@gmail.com') {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    // ── La carte appartient-elle à CE commerce ? ───────────────────────────
    // ⚠️ SANS CE `.eq('commercant_id')`, un commerçant authentifié pourrait
    // créditer ou vider la carte d'un client chez un CONCURRENT en changeant
    // un identifiant dans la requête. Posséder son commerce ne donne aucun
    // droit sur les cartes des autres.
    const { data: carte } = await db
      .from('fidelite_cartes')
      .select('*')
      .eq('id', carte_id)
      .eq('commercant_id', commercant_id)
      .maybeSingle()
    if (!carte) return NextResponse.json({ ok: false, error: 'carte introuvable' }, { status: 404 })

    // ═══ SUPPRESSION ═══════════════════════════════════════════════════════
    if (action === 'supprimer') {
      const { error } = await db.from('fidelite_cartes').delete().eq('id', carte.id)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true, supprimee: true })
    }

    // Les deux actions qui suivent écrivent : elles exigent une clé d'anti-doublon.
    if (!RE_CLE.test(String(cle || ''))) {
      return NextResponse.json({ ok: false, error: 'clé de requête invalide' }, { status: 400 })
    }

    // ═══ UTILISER UNE RÉCOMPENSE ═══════════════════════════════════════════
    if (action === 'utiliser_recompense') {
      const dispo = Number(carte.recompenses_disponibles || 0)
      if (dispo < 1) {
        return NextResponse.json({ ok: false, error: 'aucune récompense disponible' }, { status: 409 })
      }

      // ⚠️ LE MOUVEMENT D'ABORD, LA CARTE ENSUITE, et c'est délibéré. Si la
      // carte bougeait la première et que le journal échouait, on aurait une
      // récompense consommée que rien n'explique. Dans cet ordre, le pire cas
      // est un mouvement sans effet : visible, réparable, et jamais silencieux.
      const { error: errMvt } = await db.from('fidelite_mouvements').insert({
        carte_id: carte.id, type: 'recompense_utilisee', source: 'comptoir', cle_idempotence: cle,
      })
      if (errMvt) {
        // 23505 : la même requête est rejouée (double clic, réseau). On rend
        // l'état courant sans rien consommer de plus.
        if (errMvt.code === '23505') {
          const { data: relue } = await db.from('fidelite_cartes').select('*').eq('id', carte.id).maybeSingle()
          return NextResponse.json({ ok: true, carte: relue, deja: true })
        }
        throw new Error(errMvt.message)
      }

      const { data: maj, error: errUp } = await db.from('fidelite_cartes')
        .update({ recompenses_disponibles: dispo - 1, updated_at: new Date().toISOString() })
        .eq('id', carte.id).select().single()
      if (errUp) throw new Error(errUp.message)
      return NextResponse.json({ ok: true, carte: maj })
    }

    // ═══ CRÉDITER ══════════════════════════════════════════════════════════
    if (action === 'crediter') {
      const estCagnotte = com.fidelite_mecanique === 'cagnotte'

      // ⚠️ LE MONTANT EST LA SEULE DONNÉE QUI VIENT DU COMMERÇANT, et c'est
      // le montant de l'achat qu'il vient d'encaisser. Tout le reste — le
      // taux, le seuil, le nombre de récompenses débloquées — se calcule ICI,
      // à partir de SA configuration relue en base.
      let credit
      if (estCagnotte) {
        const montant = Number(body?.montant)
        if (!Number.isFinite(montant) || montant <= 0 || montant > 100000) {
          return NextResponse.json({ ok: false, error: 'Indique le montant de l’achat' }, { status: 400 })
        }
        credit = { montant: Math.round(montant * 100) / 100 }
      } else {
        credit = { passages: 1 }
      }

      const { patch, debloquees } = appliquerCredit(com, carte, credit)

      const mouvements = [{
        carte_id: carte.id,
        type: estCagnotte ? 'cagnotte' : 'passage',
        valeur: estCagnotte ? credit.montant : 1,
        source: 'comptoir',
        cle_idempotence: cle,
      }]
      for (let i = 0; i < debloquees; i++) {
        // ⚠️ Ces mouvements-là ne portent PAS la clé : elle est unique, et ils
        // sont plusieurs. Le crédit qui les provoque la porte, c'est lui qui
        // garantit qu'on ne rejoue pas l'ensemble.
        mouvements.push({ carte_id: carte.id, type: 'recompense_debloquee', valeur: null, source: 'comptoir' })
      }

      const { error: errMvt } = await db.from('fidelite_mouvements').insert(mouvements)
      if (errMvt) {
        if (errMvt.code === '23505') {
          const { data: relue } = await db.from('fidelite_cartes').select('*').eq('id', carte.id).maybeSingle()
          return NextResponse.json({ ok: true, carte: relue, deja: true, debloquees: 0 })
        }
        throw new Error(errMvt.message)
      }

      const { data: maj, error: errUp } = await db.from('fidelite_cartes')
        .update(patch).eq('id', carte.id).select().single()
      if (errUp) throw new Error(errUp.message)

      // 🔴 ET LA RÉCOMPENSE ELLE-MÊME, qui n'existait qu'en COMPTEUR. Le
      // second chemin de crédit avait le même trou que le chemin automatique :
      // `recompenses_disponibles` montait, la fiche annonçait la récompense au
      // client, le SMS partait, et le tunnel de paiement ne trouvait aucune
      // ligne dans `fidelite_recompenses`. Débloquée au comptoir, elle était
      // donc impossible à dépenser en ligne.
      let sms = null
      if (debloquees > 0) {
        await creerRecompensesDebloquees(db, { carte: maj, commercant: com, nombre: debloquees })
        // ⚠️ LE SMS QUI NE PARTAIT JAMAIS DU COMPTOIR. Best-effort : un SMS qui
        // ne part pas ne doit jamais faire échouer un crédit déjà écrit.
        // ⚠️ Envoyé APRÈS la création : il annonce quelque chose qui doit
        // exister quand le client clique sur le lien.
        try { sms = await smsRecompenseDebloquee(db, com, maj) } catch { /* non bloquant */ }
      }

      return NextResponse.json({ ok: true, carte: maj, debloquees, sms })
    }

    return NextResponse.json({ ok: false, error: 'action inconnue' }, { status: 400 })
  } catch (e) {
    console.error('[fidelite/mouvement] KO', e?.message)
    return NextResponse.json({ ok: false, error: 'Erreur, réessaie.' }, { status: 500 })
  }
}
