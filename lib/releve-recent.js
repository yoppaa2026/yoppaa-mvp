// LE RELEVÉ DU TABLEAU DE BORD NE RELIT PLUS QUE LE RÉCENT (Alex, 09/11).
//
// 🔴 POURQUOI. Supabase a prévenu le 08/11 que la base de PRODUCTION épuisait
// son budget de lecture disque (« Disk IO Budget »). Le tableau de bord en
// était la première cause : toutes les 5 secondes, sans regarder si quelqu'un
// avait les yeux sur l'écran, il relisait TOUT l'historique des commandes du
// commerce (avec leurs articles) et TOUT son agenda, depuis le premier jour. Une
// tablette de comptoir allumée de 8 h à 19 h, c'est environ 8 000 relectures
// complètes par jour, et chacune grossit à chaque commande. Un second relevé
// relisait encore tout, plages et prestations comprises, toutes les 60 s.
//
// Décision d'Alex (tableau, 09/11) :
//   - toutes les 5 s : seulement ce qui peut bouger, c'est-à-dire les
//     commandes récentes ou encore en cours, et l'agenda à partir d'avant-hier ;
//     le son et l'alerte d'une nouvelle commande restent immédiats ;
//   - l'historique complet est relu au retour sur l'écran, et toutes les 5 min.
//
// ⚠️ MODULE PUR : il décide de la fenêtre et fusionne, il ne lit pas la base.

import { jourBruxelles } from './timezone.js'
import { ajouterJoursISO } from './promos-visibles.js'

export const RELEVE_RECENT_MS = 5000
export const RELECTURE_COMPLETE_MS = 5 * 60 * 1000

// Les statuts d'une commande que le commerçant a encore entre les mains
// (reference_statuts_commande_rdv : les huit valeurs EXACTES du CHECK). Une
// commande ancienne dans l'un d'eux reste relue toutes les 5 s, quelle que soit
// sa date.
export const STATUTS_EN_COURS = ['en_attente', 'en_preparation', 'pret']

/**
 * Le premier jour relu toutes les 5 s : AVANT-HIER, heure belge.
 * ⚠️ Pas hier : `created_at` est un instant, comparé à minuit en temps
 * universel. Avec « hier », une commande passée hier entre minuit et une heure
 * du matin (heure belge) sortirait de la fenêtre. Un jour de marge ne coûte
 * presque rien et ferme le cas.
 */
export function debutReleveRecent(maintenant = new Date()) {
  const aujourdhui = jourBruxelles(maintenant)
  return aujourdhui ? ajouterJoursISO(aujourdhui, -2) : null
}

/**
 * Le filtre PostgREST (`.or(...)`) des commandes relues toutes les 5 s :
 * créées récemment, OU à retirer à partir de la fenêtre (une précommande
 * passée il y a dix jours pour demain), OU encore en cours.
 */
export function filtreCommandesRecentes(depuis) {
  return `created_at.gte.${depuis},date_commande.gte.${depuis},statut.in.(${STATUTS_EN_COURS.join(',')})`
}

/**
 * Pose les lignes relues sur la liste affichée : une ligne relue REMPLACE
 * celle de même identifiant, une ligne inconnue S'AJOUTE, une ligne que
 * `retirer` désigne (un rendez-vous supprimé) S'EN VA. Les autres restent
 * telles quelles jusqu'à la prochaine relecture complète.
 * Rend une liste NEUVE : les deux listes reçues ne sont jamais modifiées.
 */
export function fusionnerParId(affichees, relues, { retirer = () => false } = {}) {
  const parId = new Map()
  for (const l of affichees || []) if (l?.id != null) parId.set(l.id, l)
  for (const l of relues || []) {
    if (l?.id == null) continue
    if (retirer(l)) parId.delete(l.id)
    else parId.set(l.id, l)
  }
  return [...parId.values()]
}

/** Un rendez-vous supprimé en douceur sort de l'agenda. */
export function rdvSupprime(r) {
  return !!r?.deleted_at
}

/** L'ordre de l'agenda : date, heure, puis identifiant (ordre total, comme la lecture). */
export function trierRdvs(rdvs) {
  const t = (x) => String(x ?? '')
  return [...(rdvs || [])].sort((a, b) =>
    t(a.date_rdv).localeCompare(t(b.date_rdv))
    || t(a.heure_debut).localeCompare(t(b.heure_debut))
    || (t(a.id) < t(b.id) ? -1 : t(a.id) > t(b.id) ? 1 : 0))
}
