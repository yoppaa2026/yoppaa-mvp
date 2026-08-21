// Garde d'autorisation partagée par les routes API qui agissent AU NOM d'un
// commerçant.
//
// ⚠️ POURQUOI CE FICHIER EXISTE. L'audit du 21/08 a trouvé DIX routes qui
// prenaient un identifiant dans le corps de la requête, chargeaient la ligne
// avec la CLÉ DE SERVICE — laquelle ignore la RLS — et agissaient, sans jamais
// vérifier qui appelait. Aucune n'était protégée par autre chose que le fait
// que personne n'y avait encore pensé.
//
// Chacune avait sa petite différence, et c'est précisément ce qui les avait
// fait oublier une par une. Elles partagent désormais la MÊME garde : le jour
// où l'on ajoute une onzième route, il n'y a qu'une ligne à copier, et le banc
// vérifie qu'elle y est.
//
// Voir feedback_appliquer_partout et feedback_securite_dabord.

import { createClient } from '@supabase/supabase-js'

const ADMIN_EMAIL = 'verstappenalexandre@gmail.com'

export function clientAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

// Rend l'utilisateur Supabase de l'appelant, ou null.
//
// ⚠️ LE JETON EST VÉRIFIÉ CÔTÉ SERVEUR, jamais décodé à la main : on le passe à
// Supabase, qui contrôle la signature. Un JWT lu sans vérifier sa signature ne
// prouve rien du tout, n'importe qui peut en fabriquer un.
export async function utilisateurAppelant(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
  const { data } = await client.auth.getUser()
  return data?.user || null
}

// LA garde. Rend { ok: true, user } ou { ok: false, status, error }.
//
// L'appelant doit être connecté ET la fiche visée doit lui appartenir.
// L'administrateur Yoppaa passe : il ouvre des dossiers qui ne sont pas les
// siens, c'est son métier.
export async function gardeCommercant(request, admin, commercantId) {
  const user = await utilisateurAppelant(request)
  if (!user) return { ok: false, status: 401, error: 'non authentifié' }
  if (user.email === ADMIN_EMAIL) return { ok: true, user }
  if (!commercantId) return { ok: false, status: 400, error: 'commerçant inconnu' }

  const { data } = await admin
    .from('commercants')
    .select('auth_user_id')
    .eq('id', commercantId)
    .maybeSingle()

  // ⚠️ FICHE INTROUVABLE = REFUS, pas passage. Une garde qui laisse filer ce
  // qu'elle n'a pas su vérifier ne garde rien.
  if (!data) return { ok: false, status: 404, error: 'commerçant introuvable' }
  if (data.auth_user_id !== user.id) return { ok: false, status: 403, error: 'accès refusé' }
  return { ok: true, user }
}

// La même garde, quand on ne connaît que l'identifiant d'une commande ou d'un
// rendez-vous : on remonte à son commerçant, puis on applique la règle.
//
// ⚠️ UNE REQUÊTE DE PLUS, ET C'EST DÉLIBÉRÉ. On aurait pu lire `commercant_id`
// dans le `select` que chaque route fait déjà — mais il aurait fallu ajouter la
// colonne dans HUIT selects différents, et la colonne absente d'un select est
// LE défaut le plus fréquent de ce projet : aucune erreur, un repli silencieux,
// et ici la garde se serait ouverte au lieu de se fermer. Un aller-retour vaut
// mieux qu'une garde qui dépend de huit modifications réussies.
export async function gardeSurLigne(request, admin, table, id) {
  if (!id) return { ok: false, status: 400, error: 'identifiant requis' }
  const { data } = await admin.from(table).select('commercant_id').eq('id', id).maybeSingle()
  if (!data) return { ok: false, status: 404, error: 'introuvable' }
  return gardeCommercant(request, admin, data.commercant_id)
}

// Sucre : rend directement la réponse d'erreur, ou null si tout va bien.
export function refus(verdict, NextResponse) {
  if (verdict.ok) return null
  return NextResponse.json({ ok: false, error: verdict.error }, { status: verdict.status })
}
