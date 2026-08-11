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
//
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ CETTE FONCTION PARTAIT EN ANONYME SANS LE DIRE, ET C'EST CE QUI VIDAIT
// L'APPLICATION.
//
// Sur iPhone, quand la PWA passe en arrière-plan, le renouvellement du jeton
// s'arrête. Au retour, deux mécanismes le renouvellent en même temps et le
// jeton de rafraîchissement se fait refuser une fois consommé
// (« Invalid Refresh Token: Already Used »). Supabase considère l'erreur comme
// définitive et EFFACE la session du stockage.
//
// Ici, l'échec devenait `token = null`, et la requête partait quand même, sans
// en-tête d'autorisation. Le serveur répondait en visiteur anonyme : 401 pour
// les commandes et les rendez-vous, liste vide pour les favoris,
// « connecte-toi » pour la fidélité. Côté écran, six `catch` posaient `[]`.
// Le Yopper voyait son nom, son email, son téléphone, et zéro partout.
//
// Deux changements :
//   1. avant d'abandonner, on tente UN renouvellement explicite. C'est le seul
//      moment où l'on peut rattraper une session simplement endormie ;
//   2. sans jeton, on n'appelle PAS le serveur. On rend une réponse 401
//      reconnaissable, pour que l'appelant distingue « je ne suis plus
//      authentifié » de « je n'ai rien à afficher ». Ces deux situations se
//      ressemblaient à l'écran, et c'est exactement ce qu'il ne faut pas.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase'
import { ERREUR_SESSION, estSessionPerdue } from '@/lib/session-perdue'

// Ré-exportées ici pour que les écrans n'aient qu'un seul import à faire.
export { ERREUR_SESSION, estSessionPerdue }

// Rendue par `fetchYopper` quand aucun jeton n'est obtenable. C'est une vraie
// `Response` : les appelants qui font `.json()` continuent de fonctionner, et
// ceux qui regardent `res.ok` voient bien un échec.
function reponseSessionPerdue() {
  return new Response(
    JSON.stringify({ ok: false, error: ERREUR_SESSION }),
    { status: 401, headers: { 'Content-Type': 'application/json' } },
  )
}

export async function fetchYopper(url, options = {}) {
  let token = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    token = session?.access_token || null
  } catch { token = null }

  // La session dort peut-être seulement. Un renouvellement explicite est la
  // dernière chance de la réveiller sans déranger le Yopper.
  if (!token) {
    try {
      const { data } = await supabase.auth.refreshSession()
      token = data?.session?.access_token || null
    } catch { token = null }
  }

  if (!token) return reponseSessionPerdue()

  const headers = { ...(options.headers || {}) }
  headers.Authorization = `Bearer ${token}`
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  return fetch(url, { ...options, headers })
}
