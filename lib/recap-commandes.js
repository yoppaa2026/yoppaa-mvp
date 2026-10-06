// Le récapitulatif du matin, côté commandes : ce que le commerçant lit à 8 h.
//
// 🔴 TROIS DÉFAUTS RELEVÉS PAR L'AUDIT DU 06/10, tranchés par Alex au tableau :
//   1. une livraison de 11 h et un retrait de 11 h se lisaient pareil : rien ne
//      disait qu'il fallait PARTIR pour l'une et ATTENDRE pour l'autre ;
//   2. la liste suivait l'ordre d'enregistrement (`id`), pas l'heure ;
//   3. le cron partait à 8 h en été et à 7 h en hiver.
//
// ⚠️ LA LOCALITÉ, JAMAIS LA RUE (décision d'Alex). L'adresse complète reste
// dans le tableau de bord et la tournée ; une boîte mail n'a pas à garder
// l'adresse d'un client. On n'extrait que ce qui suit le code postal.

import { partiesBruxelles } from './timezone.js'
import { localiteDeAdresse } from './adresse-localite.js'
import { referenceCommande } from './numero-commande.js'

export const HEURE_DU_RECAP = 8

/** Le cron passe à 6 h et 7 h UTC : seul le passage de 8 h à Bruxelles envoie. */
export function estHeureDuRecap(instant = new Date()) {
  return partiesBruxelles(instant)?.heure === HEURE_DU_RECAP
}

/**
 * Les lignes du récap, à partir des commandes lues en base. Ce qui part dans
 * l'email, et RIEN d'autre : l'adresse est lue ici pour en tirer la localité,
 * puis laissée derrière.
 */
export function lignesRecapCommandes(cmds = []) {
  return (cmds || []).map(cmd => {
    const [prenom, ...reste] = String(cmd.client_nom || '').split(' ')
    const mode = cmd.mode_retrait === 'livraison' || cmd.mode_retrait === 'expedition'
      ? cmd.mode_retrait
      : 'retrait'
    return {
      mode,
      localite: mode === 'livraison' ? localiteDeAdresse(cmd.adresse_livraison) : null,
      heure_debut:     cmd.creneau?.heure_debut || cmd.creneau_livraison?.heure_debut || null,
      numero_commande: referenceCommande(cmd),
      yopper_prenom:   prenom || cmd.client_nom,
      yopper_nom:      reste.join(' '),
      nb_articles:     (cmd.commande_articles || []).reduce((s, a) => s + (a.quantite || 0), 0),
      total:           cmd.total,
    }
  })
}

// L'ordre des blocs : ce qui part de la boutique d'abord (la tournée se
// prépare), puis ce qu'on attend au comptoir, puis les colis.
export const BLOCS_RECAP = [
  { mode: 'livraison',  titre: 'À livrer' },
  { mode: 'retrait',    titre: 'À retirer' },
  { mode: 'expedition', titre: 'À expédier' },
]

/**
 * Les commandes réparties par bloc, chacun trié par heure (sans heure en
 * dernier, puis par référence). Un bloc vide n'est pas rendu.
 */
export function blocsRecapCommandes(lignes = []) {
  const parHeure = (a, b) => {
    const ha = a.heure_debut || '99:99'
    const hb = b.heure_debut || '99:99'
    if (ha !== hb) return ha < hb ? -1 : 1
    return String(a.numero_commande || '').localeCompare(String(b.numero_commande || ''))
  }
  return BLOCS_RECAP
    .map(b => ({ ...b, commandes: (lignes || []).filter(l => (l.mode || 'retrait') === b.mode).sort(parHeure) }))
    .filter(b => b.commandes.length > 0)
}
