// lib/kit-resolve.js — Résolution d'un slug de kit (?ref) vers le nom du commerce.
//
// Un lien du Kit lancement pointe /?ref=<slug>. Le slug référence soit un
// commerçant déjà onboardé (commercants.slug), soit un préinscrit en phase
// teasing (pre_inscriptions.slug_kit). On lit en service_role (les communes/
// certaines lignes sont masquées à anon par la RLS) et on renvoie juste le nom,
// pour afficher un bandeau « <Nom> t'invite à rejoindre Yoppaa » sur la landing.
//
// Retourne null si slug vide/mal formé ou introuvable (bandeau simplement absent).

import { createClient } from '@supabase/supabase-js'

export async function resolveReferentNom(slugBrut) {
  const slug = String(slugBrut || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 120)
  if (!slug) return null

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // 1) Commerçant onboardé
  const { data: com } = await supabase.from('commercants').select('nom').eq('slug', slug).maybeSingle()
  if (com?.nom) return com.nom

  // 2) Commerçant préinscrit (phase teasing)
  const { data: pi } = await supabase.from('pre_inscriptions').select('commercant_nom').eq('slug_kit', slug).maybeSingle()
  return pi?.commercant_nom || null
}
