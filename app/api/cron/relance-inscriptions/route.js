// GET /api/cron/relance-inscriptions
//
// RELANCER UNE FOIS, ET UNE SEULE, CELUI QUI S'EST ARRÊTÉ EN ROUTE.
//
// 🔴 POURQUOI CETTE TÂCHE EXISTE (16/09, demandé par Alex). L'inscription pose
// `statut_publication = 'brouillon'` dès la première étape et ne le quitte
// qu'au DERNIER clic, celui qui appelle `/api/notify-yoppaa`. Tout ce qui
// s'arrête avant tombe donc dans un angle mort total : Alex n'est prévenu de
// rien, le commerçant non plus, et sa fiche à moitié remplie dort au milieu des
// vrais commerçants.
//
// « La Table du Stock » a rempli son adresse, son téléphone et la description
// de sa salle de réception le 13/09 à 20 h 57, puis s'est arrêtée. Personne
// n'en a rien su pendant trois jours.
//
// ⚠️ LA RÈGLE EST AILLEURS, PURE ET TESTÉE : `lib/relance-inscription.js`.
// Cette route ne décide de rien, elle lit, elle applique, elle écrit.
//
// ⚠️ UNE SEULE RELANCE PAR FICHE. `relance_inscription_envoyee_at` est écrite
// AVANT l'envoi (voir plus bas) : sans elle, la tâche réexpédierait le même
// email tous les jours, et sept relances font fuir là où une seule rend service.
//
// Sécurité : header Authorization: Bearer <CRON_SECRET>. Sans secret, la route
// REFUSE ; elle ne s'ouvre pas.
//
// ⚠️ HORAIRE : 08h00 UTC, soit 10h00 à Bruxelles. Un rappel d'inscription ne se
// lit pas à trois heures du matin.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { gardeCron, refusCron } from '@/lib/cron-auth'
import { envoyerAuCommercant, emailRelanceInscription } from '@/lib/resend'
import { PUBLICATION_BROUILLON } from '@/lib/statut-commercant'
import { trierPourRelance, COLONNES_RELANCE, LIMITE_RELANCE_JOURS } from '@/lib/relance-inscription'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

export async function GET(request) {
  const refus = refusCron(gardeCron(request, 'relance-inscriptions'), NextResponse)
  if (refus) return refus

  const db = admin()
  const maintenant = new Date()

  // ⚠️ LES COLONNES VIENNENT DE LA RÈGLE, jamais recopiées ici : sans
  // `relance_inscription_envoyee_at`, le tri croirait que personne n'a jamais
  // été relancé et repartirait pour un tour, tous les jours.
  //
  // ⚠️ ET ON BORNE DÈS LA REQUÊTE : un dossier de plus d'un mois ne se réveille
  // pas. La règle le refuse aussi, mais on ne charge pas ce qu'on ne traitera
  // jamais.
  const depuis = new Date(maintenant.getTime() - LIMITE_RELANCE_JOURS * 86400000).toISOString()
  const { data: lignes, error } = await db
    .from('commercants')
    .select(COLONNES_RELANCE)
    .eq('statut_publication', PUBLICATION_BROUILLON)
    .is('relance_inscription_envoyee_at', null)
    .gte('created_at', depuis)

  // 🔴 UNE LECTURE EN ÉCHEC N'EST PAS « PERSONNE À RELANCER ». Les deux rendent
  // zéro envoi, et la première doit se voir dans le journal.
  if (error) {
    console.error('[relance-inscriptions] lecture impossible :', error.message)
    return NextResponse.json({ ok: false, error: 'lecture impossible' }, { status: 500 })
  }

  const { retenus, ecartes } = trierPourRelance(lignes || [], maintenant)

  let envoyes = 0
  const echecs = []
  for (const c of retenus) {
    // 🔴 ON MARQUE AVANT D'ENVOYER. Si l'on marquait après, un incident entre
    // l'envoi et l'écriture laisserait la fiche non marquée : le lendemain elle
    // repartirait pour un second email. Dans le doute, mieux vaut une relance
    // perdue qu'une relance en double, parce que la seconde se voit et agace.
    const { error: errMarque } = await db
      .from('commercants')
      .update({ relance_inscription_envoyee_at: maintenant.toISOString() })
      .eq('id', c.id)
      .is('relance_inscription_envoyee_at', null)
    // ⚠️ ON LIT LE RÉSULTAT DE L'ÉCRITURE : un `await` qu'on n'écoute pas est un
    // espoir, et ici l'espoir vaut un doublon.
    if (errMarque) {
      echecs.push({ id: c.id, etape: 'marquage', message: errMarque.message })
      continue
    }

    const envoi = await envoyerAuCommercant({
      to: c.email,
      subject: `Ton inscription Yoppaa t’attend, ${c.nom}`,
      html: emailRelanceInscription({ nom: c.nom }),
    })
    if (envoi?.ok) { envoyes++; continue }
    // ⚠️ L'ENVOI A ÉCHOUÉ APRÈS LE MARQUAGE : on rend la fiche relançable, sinon
    // elle serait comptée comme relancée sans que personne n'ait rien reçu.
    echecs.push({ id: c.id, etape: 'envoi', message: envoi?.error || 'inconnu' })
    await db.from('commercants')
      .update({ relance_inscription_envoyee_at: null })
      .eq('id', c.id)
  }

  // ⚠️ LE JOURNAL DIT AUSSI CE QU'ON N'A PAS FAIT. « 0 envoi » sans les raisons
  // est indébogable, et c'est ainsi qu'une tâche reste muette pendant des mois.
  console.log('[relance-inscriptions]', JSON.stringify({
    candidats: (lignes || []).length, envoyes, ecartes, echecs: echecs.length,
  }))

  return NextResponse.json({ ok: true, envoyes, ecartes, echecs })
}
