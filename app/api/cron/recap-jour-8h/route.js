// GET /api/cron/recap-jour-8h
//
// Cron Vercel quotidien a 8h00 : envoie le recap matinal aux commercants
// avec notif_mode='recap_jour'. Selon categorie :
//   • vitrine FULL avec rdv_actif → emailRecapRdvJour (RDV du jour)
//   • alimentaire FULL            → emailRecapCommandesJour (commandes du jour)
//
// Securite : verifie le header Authorization: Bearer <CRON_SECRET>.
// Configuration vercel.json : { "path": "...", "schedule": "0 8 * * *" }

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerAuCommercant, emailRecapRdvJour, emailRecapCommandesJour } from '@/lib/resend'

export async function GET(request) {
  const authHeader = request.headers.get('authorization') || ''
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // Date d'aujourd'hui
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const dateJour = `${yyyy}-${mm}-${dd}`

    // Fetch les commercants en notif_mode='recap_jour'
    const { data: commercants } = await supabase
      .from('commercants')
      .select('id, nom, email, categorie, plan, rdv_actif')
      .eq('notif_mode', 'recap_jour')
      .not('email', 'is', null)

    let sent = 0
    let failed = 0
    const details = []

    for (const c of (commercants || [])) {
      const estVitrine = c.categorie === 'vitrine'
      const estAlim    = c.categorie === 'alimentaire' && c.plan === 'full'

      if (estVitrine && !c.rdv_actif) {
        continue  // pas concerne
      }
      if (!estVitrine && !estAlim) {
        continue  // ni RDV vitrine, ni C&C alim FULL
      }

      try {
        let html = null
        let subject = null
        let total = 0

        if (estVitrine) {
          // RDV du jour confirmes pour ce commercant
          const { data: rdvs } = await supabase
            .from('rdv_reservations')
            .select(`
              id, heure_debut, heure_fin, duree_minutes, numero_rdv,
              client_prenom, client_nom, client_telephone,
              prestation:rdv_prestations(nom)
            `)
            .eq('commercant_id', c.id)
            .eq('date_rdv', dateJour)
            .eq('statut', 'confirme')
            .is('deleted_at', null)
            .order('heure_debut', { ascending: true })

          const rdvsFlat = (rdvs || []).map(r => ({
            heure_debut:    r.heure_debut,
            heure_fin:      r.heure_fin,
            duree_minutes:  r.duree_minutes,
            numero_rdv:     r.numero_rdv,
            yopper_prenom:  r.client_prenom,
            yopper_nom:     r.client_nom,
            yopper_telephone: r.client_telephone,
            prestation_nom: r.prestation?.nom,
          }))

          total = rdvsFlat.length
          html = emailRecapRdvJour({
            nom_commercant: c.nom,
            date_jour:      dateJour,
            rdvs:           rdvsFlat,
          })
          subject = total === 0
            ? `Aucun RDV aujourd'hui`
            : `${total} RDV${total > 1 ? 's' : ''} aujourd'hui — Yoppaa`
        } else {
          // Commandes du jour pour ce commercant
          const { data: cmds } = await supabase
            .from('commandes')
            .select(`
              id, numero_commande, total, client_prenom, client_nom,
              creneau:creneaux(heure_debut),
              commande_articles(quantite)
            `)
            .eq('commercant_id', c.id)
            .eq('date_commande', dateJour)
            .in('statut', ['en_attente', 'en_preparation', 'pret'])
            .order('id', { ascending: true })

          const cmdsFlat = (cmds || []).map(cmd => ({
            heure_debut:     cmd.creneau?.heure_debut,
            numero_commande: cmd.numero_commande,
            yopper_prenom:   cmd.client_prenom,
            yopper_nom:      cmd.client_nom,
            nb_articles:     (cmd.commande_articles || []).reduce((s, a) => s + (a.quantite || 0), 0),
            total:           cmd.total,
          }))

          total = cmdsFlat.length
          html = emailRecapCommandesJour({
            nom_commercant: c.nom,
            date_jour:      dateJour,
            commandes:      cmdsFlat,
          })
          subject = total === 0
            ? `Aucune commande aujourd'hui`
            : `${total} commande${total > 1 ? 's' : ''} aujourd'hui — Yoppaa`
        }

        await envoyerAuCommercant({ to: c.email, subject, html })
        sent++
        details.push({ commercant: c.nom, type: estVitrine ? 'rdv' : 'commande', total })
      } catch (e) {
        console.error('[cron/recap-jour-8h] envoi KO', { commercant: c.nom, error: e?.message })
        failed++
      }
    }

    console.info('[cron/recap-jour-8h]', { dateJour, sent, failed, details })
    return NextResponse.json({ ok: true, date_jour: dateJour, sent, failed, details })

  } catch (e) {
    console.error('[cron/recap-jour-8h] exception', e)
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 })
  }
}
