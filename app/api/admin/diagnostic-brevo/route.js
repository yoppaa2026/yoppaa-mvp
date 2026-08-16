// GET /api/admin/diagnostic-brevo
//
// Vérifie EN PRODUCTION que la connexion Brevo fonctionne, et distingue
// clairement l'email (contacts, déjà en service) du SMS (fidélité, nouveau) :
//   • la clé API répond-elle ?
//   • combien de crédits SMS reste-t-il sur le compte Brevo ?
//   • quel expéditeur sera utilisé (BREVO_SMS_SENDER, défaut « Yoppaa ») ?
//
// Option ?sms=+32470123456 : envoie un VRAI SMS de test (consomme 1 crédit
// Brevo, hors compteur Yoppaa) pour valider l'expéditeur de bout en bout.
//
// Réservé à l'admin Yoppaa (même garde que les autres routes /api/admin).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { envoyerSms } from '@/lib/brevo'
import { normaliserTelephone } from '@/lib/fidelite'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'
const BREVO_API_URL = 'https://api.brevo.com/v3'

export async function GET(request) {
  try {
    const accessToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
    if (!accessToken) return NextResponse.json({ ok: false, error: 'non authentifié' }, { status: 401 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ ok: false, error: 'session expirée, reconnecte-toi' }, { status: 401 })
    }
    if (user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ ok: false, error: 'accès refusé' }, { status: 403 })
    }

    const apiKey = process.env.BREVO_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        cle_presente: false,
        message: 'BREVO_API_KEY absente de cet environnement (à ajouter dans Vercel).',
      })
    }

    // 1) La clé répond-elle ? /account renvoie aussi les soldes (plan).
    const res = await fetch(`${BREVO_API_URL}/account`, {
      headers: { 'api-key': apiKey, accept: 'application/json' },
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return NextResponse.json({
        ok: false,
        cle_presente: true,
        connexion: false,
        statut_http: res.status,
        message: res.status === 401
          ? 'La clé Brevo est refusée (401) : vérifie BREVO_API_KEY dans Vercel.'
          : `Brevo a répondu ${res.status}.`,
        detail: detail.slice(0, 300),
      })
    }
    const compte = await res.json()

    // Le solde SMS vit dans plan[] avec type 'sms'
    const plans = Array.isArray(compte?.plan) ? compte.plan : []
    const planSms = plans.find(p => (p.type || '').toLowerCase() === 'sms')
    const planEmail = plans.find(p => (p.type || '').toLowerCase() !== 'sms')

    const sender = (process.env.BREVO_SMS_SENDER || 'Yoppaa').slice(0, 11)

    // 2) Envoi de test optionnel : c'est le seul moyen de valider l'expéditeur
    //    (Brevo n'expose pas d'API de vérification des senders alphanumériques).
    let testSms = null
    const cible = normaliserTelephone(new URL(request.url).searchParams.get('sms'))
    if (cible) {
      try {
        const envoi = await envoyerSms({
          to: cible,
          contenu: `Yoppaa : test technique de ton expediteur SMS. Si tu lis ceci, tout est pret 🟣`,
        })
        testSms = { envoye: true, messageId: envoi.messageId, vers: cible, expediteur: sender }
      } catch (e) {
        testSms = { envoye: false, vers: cible, expediteur: sender, erreur: String(e?.message || e).slice(0, 400) }
      }
    }

    return NextResponse.json({
      ok: true,
      cle_presente: true,
      connexion: true,
      compte: { email: compte?.email || null, societe: compte?.companyName || null },
      email_marketing: planEmail ? { type: planEmail.type, credits: planEmail.credits ?? null } : null,
      sms: {
        credits_brevo: planSms?.credits ?? 0,
        expediteur_utilise: sender,
        note: 'Le sender part dans chaque appel API : rien à déclarer si Brevo ne propose pas l\'écran Expéditeurs.',
      },
      test_sms: testSms,
    })
  } catch (e) {
    console.error('[admin/diagnostic-brevo]', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
