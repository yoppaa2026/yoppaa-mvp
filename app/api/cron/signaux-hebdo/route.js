// GET /api/cron/signaux-hebdo
//
// Une fois par semaine : on dit aux commerçants ce que les habitants ont voulu
// faire chez eux et n'ont pas pu.
//
// ⚠️ CE CRON VISE D'ABORD LE PALIER GRATUIT, et c'est une correction explicite
// d'Alex. Le réflexe serait d'en faire une fonctionnalité payante : ce serait
// l'exact contraire du but. Un commerçant gratuit n'a rien à gérer, donc il
// n'ouvre jamais son tableau de bord, donc il ne verra jamais ses signaux si on
// ne lui écrit pas. Or c'est LUI qu'on veut convaincre. Ceux qui paient ont
// déjà les fonctionnalités demandées.
//
// On n'exclut personne pour autant : une envie ne naît que d'un manque réel
// (le bouton qui la produit n'apparaît que si la fiche ne sait pas encore le
// faire). Un commerçant qui a tout activé n'en reçoit tout simplement pas.
//
// Sécurité : header Authorization: Bearer <CRON_SECRET>.
// vercel.json : { "path": "/api/cron/signaux-hebdo", "schedule": "30 7 * * 2" }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant } from '@/lib/resend'
import { emailSignauxHebdo } from '@/lib/signaux-email'
import { enviesAAlerter, peutEnvoyerEmail } from '@/lib/signaux'
import { resolvePlan } from '@/lib/plans'

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const secret = process.env.CRON_SECRET
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    const { data: commercants, error: errC } = await supabase
      .from('commercants')
      .select('id, nom, email, plan, signaux_seuil_alerte, signaux_email_actif, signaux_email_pause_jusqu, signaux_email_le')
      .not('email', 'is', null)
    if (errC) throw errC

    const { data: stats, error: errS } = await supabase
      .from('signaux_envies_stats')
      .select('commercant_id, type, total, trente_jours, soir_30j, weekend_30j')
    if (errS) throw errS

    const parCommercant = new Map()
    for (const ligne of (stats || [])) {
      const liste = parCommercant.get(ligne.commercant_id) || []
      liste.push(ligne)
      parCommercant.set(ligne.commercant_id, liste)
    }

    const maintenant = new Date()

    // Le palier gratuit passe en premier : si un jour on doit plafonner les
    // envois, ce sont les autres qui sautent, pas lui.
    // Un commerçant sans plan enregistré est de fait au gratuit : il passe donc
    // devant lui aussi, sinon les nouveaux arrivants seraient les derniers
    // servis alors que ce sont eux qu'on cherche à convaincre.
    const estGratuit = p => { const r = resolvePlan(p); return !r || r === 'exister' }
    const files = (commercants || []).sort((a, b) => (estGratuit(a.plan) ? 0 : 1) - (estGratuit(b.plan) ? 0 : 1))

    let envoyes = 0, ignores = 0, echecs = 0
    const details = []

    for (const c of files) {
      const lignes = parCommercant.get(c.id) || []
      if (lignes.length === 0) { ignores++; continue }

      // On ne parle que si le nombre parle, et jamais deux semaines de suite
      // sur le même sujet : un email faible abîme les suivants.
      const { alerter, types } = enviesAAlerter(lignes, c, maintenant)
      if (!alerter) { ignores++; continue }
      if (!peutEnvoyerEmail(c, maintenant)) { ignores++; continue }

      const mail = emailSignauxHebdo({ nom: c.nom, types })
      if (!mail) { ignores++; continue }

      const res = await envoyerAuCommercant({ to: c.email, subject: mail.subject, html: mail.html })
      if (!res?.ok) {
        echecs++
        details.push({ commercant: c.nom, erreur: res?.error || 'envoi refusé' })
        continue
      }

      // Horodatage APRÈS l'envoi réussi : un échec Resend ne doit pas faire
      // sauter la semaine du commerçant.
      await supabase.from('commercants')
        .update({ signaux_email_le: maintenant.toISOString() })
        .eq('id', c.id)

      envoyes++
      details.push({
        commercant: c.nom,
        plan: resolvePlan(c.plan),
        types: types.map(t => `${t.type}:${t.trente_jours}`),
      })
    }

    return NextResponse.json({ ok: true, envoyes, ignores, echecs, details })
  } catch (e) {
    console.error('[cron/signaux-hebdo]', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
