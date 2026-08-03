'use client'
// Appel d'une route Yopper en transportant la PREUVE d'identité.
//
// Depuis la décision du 03/08, une identité déclarée (le cookie posé en
// saisissant son email au moment d'une commande) ne donne plus accès à rien de
// personnel. Les routes sensibles exigent le jeton d'authentification Supabase,
// obtenu après vérification de l'adresse email. Ce jeton doit donc voyager avec
// chaque appel.
//
// La session est lue à chaque appel plutôt que mise en cache : Supabase
// renouvelle le jeton en arrière-plan, un jeton mémorisé serait périmé.

import { supabase } from '@/lib/supabase'

export async function fetchYopper(url, options = {}) {
  let token = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token || null
  } catch { token = null }

  const headers = { ...(options.headers || {}) }
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  return fetch(url, { ...options, headers })
}
