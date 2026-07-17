// Page publique "Kit de partage" d'un commerçant préinscrit (Ch3).
// Accessible via /kit/<slug_kit>. Le slug est la clé (pas de login en phase teasing).
// Server Component : résout le slug -> commerce + impact, génère le QR côté serveur,
// délègue l'interactif (copie/partage) à KitClient.

import QRCode from 'qrcode'
import { createClient } from '@supabase/supabase-js'
import KitClient from './KitClient'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Ton kit de partage · Yoppaa',
  robots: { index: false, follow: false },  // page perso, jamais indexée
}

const BASE = 'https://www.yoppaa.app'

async function getKit(slug) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  let nom = null
  let commune = null

  // 1) Commerçant onboardé (commercants.slug) — cas au lancement + tests (ex. kebabistro).
  const { data: com } = await supabase.from('commercants').select('nom').eq('slug', slug).maybeSingle()
  if (com) {
    nom = com.nom
  } else {
    // 2) Commerçant préinscrit (pre_inscriptions.slug_kit) — phase teasing.
    const { data: pi } = await supabase
      .from('pre_inscriptions')
      .select('commercant_nom, commune_id')
      .eq('slug_kit', slug)
      .maybeSingle()
    if (!pi) return null
    nom = pi.commercant_nom || 'ton commerce'
    if (pi.commune_id) {
      const { data: c } = await supabase.from('communes').select('nom').eq('id', pi.commune_id).maybeSingle()
      commune = c?.nom || null
    }
  }

  // Impact : nombre de préinscriptions attribuées à ce slug (ref_commercant).
  const { count } = await supabase
    .from('pre_inscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('ref_commercant', slug)

  return { nom, commune, impact: count || 0 }
}

export default async function KitPage({ params }) {
  const { slug } = await params
  const kit = await getKit(slug)
  const lien = `${BASE}/?ref=${encodeURIComponent(slug)}`

  let qr = null
  try {
    qr = await QRCode.toDataURL(lien, { margin: 1, width: 520, color: { dark: '#1A0840', light: '#FFFFFF' } })
  } catch { qr = null }

  return <KitClient slug={slug} kit={kit} lien={lien} qr={qr} />
}
