'use client'
// ─── LES TRACES DE CE QUI RESTE À HONORER (17/10) ──────────────────────────
//
// Compte, pour les SEULES fonctions qu'un commerçant n'a plus, ce qui existe
// encore chez lui : des bons pas épuisés, un compte Stripe, des cartes de
// séances, des ventes, des cartes de fidélité, des commandes en cours. La règle
// de ce qu'on rouvre vit dans `lib/honorer.js` ; ici, on ne fait que compter.
//
// ⚠️ DES COMPTES, PAS DES LIGNES (`head: true`) : on veut savoir s'il y a
// quelque chose, pas le charger. Et rien n'est demandé pour une fonction
// qu'il a déjà : un commerçant en Vendre ne paie aucune requête de plus.
//
// ⚠️ UNE LECTURE RATÉE NE ROUVRE RIEN ET NE FERME RIEN DE PLUS QU'AVANT : la
// trace vaut alors 0, et l'onglet garde son comportement d'aujourd'hui.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { TRACES_PAR_FONCTION } from '@/lib/honorer'
import { FILTRE_STATUTS_TERMINES } from '@/lib/statuts-commande'

const compter = async (requete) => {
  try {
    const { count, error } = await requete
    return error ? 0 : (count || 0)
  } catch { return 0 }
}

const COMPTEURS = {
  bonsActifs: (id) => compter(supabase.from('bons_cadeaux')
    .select('id', { count: 'exact', head: true })
    .eq('commercant_id', id).eq('statut', 'actif').gt('solde', 0)),
  abonnementsActifs: (id) => compter(supabase.from('abonnements')
    .select('id', { count: 'exact', head: true })
    .eq('commercant_id', id).eq('statut', 'actif').is('deleted_at', null)),
  cartesFidelite: (id) => compter(supabase.from('fidelite_cartes')
    .select('id', { count: 'exact', head: true })
    .eq('commercant_id', id)),
  commandesEnCours: (id) => compter(supabase.from('commandes')
    .select('id', { count: 'exact', head: true })
    .eq('commercant_id', id).not('statut', 'in', FILTRE_STATUTS_TERMINES)),
  // Des ventes à déclarer : une commande, un bon vendu, ou un rendez-vous où
  // de l'argent a bougé. L'export lui-même tranche ligne par ligne au serveur.
  ventes: async (id) => {
    const [c, b, r] = await Promise.all([
      compter(supabase.from('commandes').select('id', { count: 'exact', head: true }).eq('commercant_id', id)),
      compter(supabase.from('bons_cadeaux').select('id', { count: 'exact', head: true }).eq('commercant_id', id)),
      compter(supabase.from('rdv_reservations').select('id', { count: 'exact', head: true })
        .eq('commercant_id', id).or('acompte_paye.eq.true,encaisse_montant.not.is.null')),
    ])
    return c + b + r
  },
}

// `manquantes` : les fonctions qu'il n'a plus (ni incluses, ni en essai).
export function useTracesAHonorer(commercantId, commercant, manquantes = []) {
  const [traces, setTraces] = useState({})
  const cle = [...manquantes].sort().join(',')
  useEffect(() => {
    if (!commercantId || !cle) { setTraces({}); return }
    let annule = false
    const voulues = cle.split(',').map(f => TRACES_PAR_FONCTION[f]).filter(Boolean)
    Promise.all(voulues.map(async (t) => {
      // Le compte Stripe se lit sur la fiche déjà chargée : pas de requête.
      if (t === 'compteStripe') return [t, !!commercant?.stripe_account_id]
      return [t, await COMPTEURS[t](commercantId)]
    })).then(paires => { if (!annule) setTraces(Object.fromEntries(paires)) })
    return () => { annule = true }
  }, [commercantId, cle, commercant?.stripe_account_id])
  return traces
}
