// Identité Yopper PROUVÉE, côté serveur.
//
// LE CHANGEMENT DE MODÈLE (décision Alex, 03/08). Jusqu'ici un Yopper était
// identifié par un cookie qu'il posait lui-même en saisissant son email dans
// le tunnel : l'identité était DÉCLARÉE. Signer ce cookie a empêché qu'on le
// fabrique, mais pas qu'on se déclare quelqu'un d'autre au moment où on le
// pose. Concrètement, saisir l'email d'un tiers suffisait à obtenir un cookie
// à son nom, et donc à lire son historique de commandes.
//
// Désormais l'identité est PROUVÉE : elle vient du jeton d'authentification
// Supabase, signé par Supabase, obtenu après vérification de l'adresse email
// (lien magique ou mot de passe). Personne ne peut le forger.
//
// Le repli sur le cookie signé reste temporairement accepté, le temps que le
// tunnel impose la connexion : le retirer avant casserait les commandes en
// cours. Il est marqué `prouve: false`, et les usages sensibles doivent
// exiger `prouve: true`.

import { createClient } from '@supabase/supabase-js'
import { lireIdentiteYopper } from './yopper-session'

// Lit le jeton porté par l'en-tête Authorization et le fait valider par
// Supabase. Renvoie l'utilisateur authentifié, ou null.
async function utilisateurDuJeton(request) {
  const token = (request?.headers?.get?.('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  try {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
    const { data: { user } } = await client.auth.getUser()
    return user || null
  } catch {
    return null
  }
}

// Identité du Yopper courant.
//   { client_id, email, prouve: true }  → authentifié par Supabase
//   { ..., prouve: false }              → cookie signé, identité déclarée
//   null                                → visiteur anonyme
export async function identiteYopper(request) {
  const user = await utilisateurDuJeton(request)
  if (user?.email) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    // On retrouve la fiche client par le compte d'authentification, et à
    // défaut par l'email : un Yopper peut avoir commandé en invité avant de
    // créer son compte, ses deux traces doivent se rejoindre.
    const { data: parAuth } = await admin
      .from('clients').select('id, email, prenom, nom, telephone')
      .eq('auth_user_id', user.id).maybeSingle()
    const fiche = parAuth || (await admin
      .from('clients').select('id, email, prenom, nom, telephone')
      .eq('email', user.email.toLowerCase()).maybeSingle()).data

    return {
      client_id: fiche?.id || null,
      email: user.email.toLowerCase(),
      prenom: fiche?.prenom || null,
      nom: fiche?.nom || null,
      telephone: fiche?.telephone || null,
      prouve: true,
    }
  }

  const cookie = await lireIdentiteYopper()
  return cookie ? { ...cookie, prouve: false } : null
}

// Raccourci pour les usages qui n'acceptent plus une identité déclarée.
export async function identiteProuvee(request) {
  const id = await identiteYopper(request)
  return id?.prouve ? id : null
}
