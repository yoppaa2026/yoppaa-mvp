// LA LECTURE DU PILOTAGE (19/10), côté serveur, avec la clé de service.
//
// Lit les lignes dont `calculerPilotage` (lib/pilotage.js) a besoin, et rien
// d'autre. ⚠️ AUCUNE DONNÉE PERSONNELLE N'EST SÉLECTIONNÉE : ni email, ni
// téléphone, ni nom de Yopper, ni texte libre. Des identifiants de commerce,
// des statuts, des montants et des dates. Le banc le vérifie colonne par
// colonne.
//
// ⚠️ UNE SOURCE QUI NE SE LIT PAS NE FAIT PAS TOMBER LES AUTRES. Elle est
// notée dans `erreurs`, et son bloc s'affiche « indisponible ». C'est aussi ce
// qui permet de pousser le code AVANT que le journal technique existe : la
// santé technique dira qu'elle attend sa migration, le reste fonctionne.
//
// ⚠️ TOUTES LES LIGNES, PAS LES MILLE PREMIÈRES (`toutesLesLignes`) : Supabase
// coupe à 1 000 sans le dire, et un compteur coupé a l'air juste.

import { toutesLesLignes } from './toutes-les-lignes'
import { calculerPilotage } from './pilotage'

// Les colonnes lues, table par table. Exportées pour le banc.
export const COLONNES_PILOTAGE = {
  commercants: 'id, nom, plan, essai_plan, categorie, statut, statut_publication, billing_exempt, created_at, subscription_status, stripe_subscription_id',
  upgrade_requests: 'id, commercant_id, type, created_at',
  favoris: 'commercant_id, created_at',
  fiche_vues: 'commercant_id, jour, vues',
  commandes: 'id, commercant_id, statut, origine, total, fidelite_remise, stripe_refund_amount, created_at',
  rdv_reservations: 'id, commercant_id, statut, source, prix_estime, fidelite_remise, stripe_refund_amount, acompte_montant, created_at',
  pre_inscriptions: 'id, type_utilisateur, created_at',
  suggestions_commercants: 'created_at',
  signalements: 'created_at',
  avis: 'commercant_id, created_at',
  bons_cadeaux: 'commercant_id, statut, created_at',
  fidelite_cartes: 'commercant_id, created_at',
  stripe_webhook_events: 'event_type, status, processed_at',
  journal_technique: 'genre, nom, cree_le',
}

// Les favoris : la date de pose n'est pas dans le dépôt (table créée avant
// les migrations). Sans elle, on garde le décompte par commerce, qui est le
// seul usage qu'en fait le pilotage : rien de ce qui s'affiche n'est perdu.
// ⚠️ L'ORDRE (commerce, client) est total : un client ne met qu'un favori
// par commerce.
async function lireFavoris(admin, tout) {
  const avecDate = await toutesLesLignes(() => admin.from('favoris').select(COLONNES_PILOTAGE.favoris).order('commercant_id').order('client_id'))
    .catch(() => ({ data: null, error: true }))
  if (!avecDate.error) return avecDate.data || []
  return tout('favoris', () => admin.from('favoris').select('commercant_id').order('commercant_id').order('client_id'))
}

// Le journal se lit sur 35 jours : assez pour juger la purge mensuelle.
export const JOURS_JOURNAL_LUS = 35

export async function lirePilotage(admin, maintenant = new Date()) {
  const erreurs = []
  const d = { erreurs }

  // Une lecture complète, ou null et la source notée en erreur.
  const tout = async (source, construire) => {
    try {
      const { data, error } = await toutesLesLignes(construire)
      if (error) { erreurs.push(source); return [] }
      return data || []
    } catch {
      erreurs.push(source)
      return []
    }
  }
  // Une lecture simple (petite table ou filtre serré).
  const simple = async (source, requete) => {
    try {
      const { data, error } = await requete
      if (error) { erreurs.push(source); return [] }
      return data || []
    } catch {
      erreurs.push(source)
      return []
    }
  }

  const il7 = new Date(maintenant.getTime() - 7 * 86400000).toISOString()
  const ilJournal = new Date(maintenant.getTime() - JOURS_JOURNAL_LUS * 86400000).toISOString()
  const C = COLONNES_PILOTAGE

  const [
    commercants, signaux, favoris, vues, commandes, rdvs, preinscrits,
    suggestions, signalements, avis, bons, cartes, webhooks, journal,
  ] = await Promise.all([
    tout('commercants', () => admin.from('commercants').select(C.commercants).order('id')),
    tout('signaux', () => admin.from('upgrade_requests').select(C.upgrade_requests).order('id')),
    lireFavoris(admin, tout),
    tout('vues', () => admin.from('fiche_vues').select(C.fiche_vues).order('commercant_id').order('jour')),
    tout('commandes', () => admin.from('commandes').select(C.commandes).order('id')),
    tout('rdvs', () => admin.from('rdv_reservations').select(C.rdv_reservations).order('id')),
    tout('preinscriptions', () => admin.from('pre_inscriptions').select(C.pre_inscriptions).order('id')),
    simple('suggestions', admin.from('suggestions_commercants').select(C.suggestions_commercants).limit(5000)),
    simple('signalements', admin.from('signalements').select(C.signalements).gte('created_at', il7)),
    tout('avis', () => admin.from('avis').select(C.avis).order('id')),
    tout('bons', () => admin.from('bons_cadeaux').select(C.bons_cadeaux).order('id')),
    tout('cartes', () => admin.from('fidelite_cartes').select(C.fidelite_cartes).order('id')),
    simple('webhooks', admin.from('stripe_webhook_events').select(C.stripe_webhook_events)
      .eq('status', 'error').gte('processed_at', il7).limit(500)),
    simple('journal', admin.from('journal_technique').select(C.journal_technique)
      .gte('cree_le', ilJournal).order('cree_le', { ascending: false }).limit(5000)),
  ])

  Object.assign(d, {
    commercants, signaux, favoris, vues, commandes, rdvs, preinscrits,
    suggestions, signalements, avis, bons, cartes,
    webhooksEnErreur: webhooks,
    journal,
  })

  // Le début du journal : sans lui, un journal tout neuf accuserait à tort
  // chaque tâche qui n'a pas encore eu l'occasion de passer.
  if (!erreurs.includes('journal')) {
    const premier = await simple('journal', admin.from('journal_technique')
      .select('cree_le').order('cree_le', { ascending: true }).limit(1))
    d.journalDepuis = premier[0]?.cree_le || null
  }

  // Les comptes Yopper par jour (fonction de MIGRATION_PILOTAGE_19_10.sql).
  // ⚠️ REPLI si la fonction manque : le TOTAL se lit encore dans `clients`,
  // seule la courbe manque. On le pose comme une seule journée lointaine, pour
  // que le total soit juste sans inventer de nouveaux comptes cette semaine.
  try {
    const { data, error } = await admin.rpc('pilotage_comptes_yopper_par_jour')
    if (error) throw error
    d.comptesParJour = (data || []).map(l => ({ jour: String(l.jour).slice(0, 10), comptes: Number(l.comptes || 0) }))
  } catch {
    erreurs.push('comptes')
    const { count } = await admin.from('clients').select('id', { count: 'exact', head: true })
      .not('auth_user_id', 'is', null)
    d.comptesParJour = Number.isFinite(count) ? [{ jour: '2000-01-01', comptes: count }] : []
  }

  try {
    const { count, error } = await admin.from('clients').select('id', { count: 'exact', head: true })
      .is('auth_user_id', null)
    d.clientsSansCompte = error ? null : count
  } catch {
    d.clientsSansCompte = null
  }

  return d
}

export async function construirePilotage(admin, maintenant = new Date()) {
  return calculerPilotage(await lirePilotage(admin, maintenant), maintenant)
}
