// L'ARTICLE PARTAGÉ, POUR CE QUE WHATSAPP ET FACEBOOK EN LISENT (16/10 soir).
//
// ✅ ALEX, 16/10 soir (tableau) : « Aperçu de l'article partagé ». Un lien
// d'article partagé montrait l'aperçu GÉNÉRIQUE du commerce : le sandwich
// qu'on voulait montrer n'apparaissait nulle part dans la conversation. La
// fiche est un composant client (pas de métadonnées par article) : le partage
// passe donc par `/commander/<slug>/article/<id>`, qui porte l'aperçu de
// l'article et ouvre aussitôt la fiche sur lui.
//
// ⚠️ SEULEMENT CE QUE LA FICHE MONTRE DÉJÀ : un commerce PUBLIÉ (vue
// `commercants_public`), un article ACTIF de CE commerce, sa photo seulement si
// le commerçant montre les photos de son catalogue. Lu avec la clé publique.

import { cache } from 'react'
import { createClient } from '@supabase/supabase-js'
import { getCommercantPublic } from '@/lib/fiche-seo-server'

const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } }
  )
}

export const getArticlePartage = cache(async (slug, articleId) => {
  if (!RE_UUID.test(String(articleId || ''))) return null
  const commerce = await getCommercantPublic(slug)
  if (!commerce) return null
  try {
    const db = client()
    const [{ data: article }, { data: reglage }] = await Promise.all([
      db.from('articles').select('id, nom, prix, description, photo_url')
        .eq('id', articleId).eq('commercant_id', commerce.id).eq('actif', true).maybeSingle(),
      db.from('commercants_public').select('photos_catalogue_actif').eq('id', commerce.id).maybeSingle(),
    ])
    if (!article) return null
    const photos = reglage?.photos_catalogue_actif !== false
    return { commerce, article: { ...article, photo_url: photos ? article.photo_url || null : null } }
  } catch {
    return null
  }
})
