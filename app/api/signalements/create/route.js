// POST /api/signalements/create
// ════════════════════════════════════════════════════════════════════
// Endpoint pour créer un signalement citoyen depuis Yoppaa.
//
// Workflow :
//   1. Reception multipart/form-data (photo + champs texte)
//   2. Validation des champs obligatoires
//   3. Upload de la photo dans Supabase Storage (bucket signalements-photos)
//   4. Insert d'une row dans signalements (avec l'URL publique de la photo)
//   5. Envoi mail Resend vers la commune (ou Alex pour la démo)
//
// Pour la démo Mettet 15/06 : tous les mails partent vers
// verstappenalexandre@gmail.com (variable EMAIL_SIGNALEMENTS_DEMO).
// Plus tard : lookup par service_id ou par type de problème.
// ════════════════════════════════════════════════════════════════════

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { emailSignalementCommune } from '@/lib/resend-signalement'

const TYPES_AUTORISES = ['nid_poule', 'depot_sauvage', 'egout', 'autre']
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_PHOTO_SIZE = 10 * 1024 * 1024  // 10 Mo

// Email destinataire de démo (en attendant le routage par service/type post-partenariat)
const EMAIL_DEMO = process.env.EMAIL_SIGNALEMENTS_DEMO || 'verstappenalexandre@gmail.com'

export async function POST(request) {
  try {
    // 1) Parse multipart/form-data
    const formData = await request.formData()
    const service_id    = formData.get('service_id')?.toString()
    const type          = formData.get('type')?.toString()
    const yopper_email  = formData.get('yopper_email')?.toString()?.trim().toLowerCase()
    const yopper_prenom = formData.get('yopper_prenom')?.toString()?.trim() || null
    const yopper_id     = formData.get('yopper_id')?.toString() || null
    const latitude      = formData.get('latitude')?.toString()
    const longitude     = formData.get('longitude')?.toString()
    const adresse       = formData.get('adresse')?.toString()?.trim() || null
    const description   = formData.get('description')?.toString()?.trim() || null
    const photo         = formData.get('photo')  // File ou null

    // 2) Validations
    if (!service_id) {
      return NextResponse.json({ ok: false, error: 'service_id requis' }, { status: 400 })
    }
    if (!TYPES_AUTORISES.includes(type)) {
      return NextResponse.json({ ok: false, error: 'type invalide' }, { status: 400 })
    }
    if (!yopper_email || !RE_EMAIL.test(yopper_email)) {
      return NextResponse.json({ ok: false, error: 'Email invalide' }, { status: 400 })
    }
    if (!photo || typeof photo === 'string') {
      return NextResponse.json({ ok: false, error: 'Photo requise' }, { status: 400 })
    }
    if (photo.size > MAX_PHOTO_SIZE) {
      return NextResponse.json({ ok: false, error: 'Photo trop volumineuse (max 10 Mo)' }, { status: 400 })
    }
    if (!photo.type?.startsWith('image/')) {
      return NextResponse.json({ ok: false, error: 'Fichier doit être une image' }, { status: 400 })
    }

    // Coordonnées GPS optionnelles mais cohérentes si fournies
    const lat = latitude ? parseFloat(latitude) : null
    const lng = longitude ? parseFloat(longitude) : null
    if (lat !== null && (isNaN(lat) || lat < -90 || lat > 90)) {
      return NextResponse.json({ ok: false, error: 'latitude invalide' }, { status: 400 })
    }
    if (lng !== null && (isNaN(lng) || lng < -180 || lng > 180)) {
      return NextResponse.json({ ok: false, error: 'longitude invalide' }, { status: 400 })
    }

    // 3) Client Supabase admin (service_role pour bypass RLS et upload Storage)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )

    // 4) Récupère le nom du service pour le mail
    const { data: service } = await supabase
      .from('services_publics')
      .select('id, nom, slug')
      .eq('id', service_id)
      .maybeSingle()

    if (!service) {
      return NextResponse.json({ ok: false, error: 'Service introuvable' }, { status: 404 })
    }

    // 5) Upload de la photo dans Storage
    const ext = photo.name?.split('.').pop()?.toLowerCase() || 'jpg'
    const timestamp = Date.now()
    const photoPath = `${service.slug}/${timestamp}-${Math.random().toString(36).slice(2, 9)}.${ext}`

    const photoBuffer = Buffer.from(await photo.arrayBuffer())

    const { error: uploadError } = await supabase
      .storage
      .from('signalements-photos')
      .upload(photoPath, photoBuffer, {
        contentType: photo.type,
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) {
      console.error('[signalements] upload Storage echec', uploadError)
      return NextResponse.json({ ok: false, error: 'Echec upload photo: ' + uploadError.message }, { status: 500 })
    }

    // URL publique de la photo
    const { data: pub } = supabase
      .storage
      .from('signalements-photos')
      .getPublicUrl(photoPath)
    const photo_url = pub?.publicUrl || null

    // 6) Insert du signalement
    const { data: signalement, error: insertError } = await supabase
      .from('signalements')
      .insert({
        service_id,
        yopper_id,
        yopper_email,
        yopper_prenom,
        type,
        latitude: lat,
        longitude: lng,
        adresse,
        photo_url,
        description,
      })
      .select()
      .single()

    if (insertError) {
      console.error('[signalements] insert echec', insertError)
      // Cleanup : on supprime la photo orpheline
      await supabase.storage.from('signalements-photos').remove([photoPath]).catch(() => {})
      return NextResponse.json({ ok: false, error: 'Echec création signalement: ' + insertError.message }, { status: 500 })
    }

    // 7) Envoi du mail Resend vers la commune (Alex pour la démo)
    let email_id = null
    let email_error = null
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { subject, html } = emailSignalementCommune({
        type,
        adresse,
        latitude: lat,
        longitude: lng,
        photo_url,
        description,
        yopper_prenom,
        yopper_email,
        created_at: signalement.created_at,
        service_nom: service.nom,
      })

      const { data: emailData, error: emailErr } = await resend.emails.send({
        from: process.env.RESEND_FROM || 'Yoppaa <onboarding@resend.dev>',
        to: EMAIL_DEMO,
        replyTo: yopper_email,  // la commune peut répondre directement au yopper
        subject,
        html,
      })

      if (emailErr) {
        console.error('[signalements] envoi mail echec', emailErr)
        email_error = emailErr?.message || String(emailErr)
      } else {
        email_id = emailData?.id
        // Marquer le signalement comme "mail envoyé"
        await supabase
          .from('signalements')
          .update({ email_envoye_at: new Date().toISOString() })
          .eq('id', signalement.id)
      }
    } catch (e) {
      console.error('[signalements] exception envoi mail', e)
      email_error = e?.message || String(e)
    }

    // 8) Réponse au client
    return NextResponse.json({
      ok: true,
      signalement_id: signalement.id,
      photo_url,
      email: {
        sent: !!email_id,
        id: email_id,
        error: email_error,
      },
    })

  } catch (e) {
    console.error('[signalements] exception globale', e)
    return NextResponse.json({ ok: false, error: e?.message || 'Erreur interne' }, { status: 500 })
  }
}
