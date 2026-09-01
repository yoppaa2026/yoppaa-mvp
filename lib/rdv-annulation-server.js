// CE QUI REVIENT AU YOPPER QUAND SON RENDEZ-VOUS N'A PAS LIEU, ÉCRIT UNE FOIS.
//
// 🔴 POURQUOI CE MODULE EXISTE, ET C'EST UNE HISTOIRE EN TROIS JOURS.
//
// Le 29/08, le bon cadeau n'était pas recrédité à l'annulation : corrigé dans
// `/api/rdv/cancel`. Le 30/08, la récompense revenait sans que personne ne le
// dise : corrigé dans les deux routes, en RECOPIANT la fonction. Le 30/08 au
// soir, Alex reçoit un email d'annulation par le commerçant où le bon de 40 €
// est annoncé et les 10 € de récompense, non.
//
// ⚠️ TROIS DÉFAUTS, UN SEUL MOTIF : le même geste vivait à deux endroits, et
// chaque correction n'en touchait qu'un. Une règle recopiée est une règle qui
// divergera, c'est seulement une question de jours.
//
// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ ON ANNONCE L'ÉTAT, PAS NOTRE GESTE.
//
// La version recopiée ne comptait un retour que si c'était ELLE qui l'avait
// fait : `utilisee_at` non nul pour la récompense, `deja_recredite` faux pour
// le bon. Ces deux drapeaux répondent à « est-ce moi qui viens d'agir ». La
// question du Yopper est « est-ce que je récupère mon argent », et elle a la
// même réponse que ce soit cette route, le webhook `charge.refunded` qui fait
// les mêmes gestes en secours, ou personne.
//
// J'avais pris une garde d'IDEMPOTENCE pour une garde d'ANNONCE.
//
// ⚠️ ET LE REJEU RESTE COUVERT, PAR LA BONNE GARDE : les deux routes sortent
// sur `already_canceled` dès que le statut est déjà annulé. Quand on arrive
// ici, l'annulation est réelle et unique.
// ═══════════════════════════════════════════════════════════════════════════

import { recrediterBons } from './bons-cadeaux-server'
import { rendreRecompense } from './fidelite-recompense-server'

const arr = (n) => Math.round(Number(n || 0) * 100) / 100

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 PLUSIEURS BONS SUR UN MÊME RENDEZ-VOUS (01/09)
//
// Ce module recréditait UN bon, avec le montant TOTAL. Le jour où un rendez-vous
// en porte trois, cela aurait remis les 180 € entiers sur le premier et RIEN sur
// les deux autres : de l'argent créé d'un côté, détruit de l'autre, et sur un
// instrument au porteur que le Yopper détient encore.
//
// ⚠️ `bons_utilises` FAIT FOI, et c'est la colonne qui porte le détail. Le repli
// sur la paire `bon_cadeau_id` / `bon_cadeau_montant` sert les lignes écrites
// AVANT que les routes de rendez-vous ne remplissent la liste : elles existent
// en base, elles portent de l'argent réel, et les oublier serait exactement le
// défaut du 29/08, « bon jamais recrédité ».
// ═══════════════════════════════════════════════════════════════════════════
export function lignesBonsDe(objet) {
  const liste = Array.isArray(objet?.bons_utilises) ? objet.bons_utilises : []
  if (liste.length > 0) return liste
  if (objet?.bon_cadeau_id && Number(objet?.bon_cadeau_montant) > 0) {
    return [{ id: objet.bon_cadeau_id, montant: Number(objet.bon_cadeau_montant) }]
  }
  return []
}

/**
 * Rend les bons et la récompense posés sur un rendez-vous annulé.
 *
 * @param db                 client Supabase (service_role)
 * @param bonsUtilises       les lignes à recréditer, via `lignesBonsDe`
 * @param recompenseId       la ligne de récompense à libérer
 * @param recompenseMontant  ce qu'elle valait, pour l'ANNONCE seulement
 * @param refs               { rdv_id } ou { commande_id }, jamais les deux
 * @param ou                 nom de l'appelant, pour les journaux
 *
 * Rend { bon, recompense } : les montants à ANNONCER, pas les gestes faits.
 */
export async function rendreAvantagesRdv(db, {
  bonsUtilises = [],
  recompenseId = null,
  recompenseMontant = 0,
  refs = {},
  ou = 'rdv/annulation',
} = {}) {
  const rendu = { bon: 0, recompense: 0 }

  const lignes = (Array.isArray(bonsUtilises) ? bonsUtilises : [])
    .filter(l => l?.id && Number(l.montant) > 0)
  if (lignes.length > 0) {
    const rec = await recrediterBons(db, lignes, refs)
    // ⚠️ ON LIT LE RÉSULTAT : un `await` qu'on n'écoute pas est un espoir, et
    // ici l'espoir vaut de l'argent que le Yopper a déjà payé.
    if (!rec?.ok) console.error(`[${ou}] re-crédit des bons KO`, rec?.echecs, refs)
    // `deja_recredite` veut dire « quelqu'un d'autre l'a fait avant moi », pas
    // « rien n'est revenu ». L'argent EST sur le bon : on l'annonce.
    //
    // ⚠️ ET ON ANNONCE LA SOMME DES CINQ, pas le premier. Un email qui dit
    // « 50 € te reviennent » quand 145 € reviennent est un email qui déclenche
    // un appel au commerçant.
    else rendu.bon = arr(lignes.reduce((s, l) => s + Number(l.montant), 0))
  }

  if (recompenseId) {
    const { data: recFid } = await db
      .from('fidelite_recompenses')
      .select('id, carte_id, utilisee_at')
      .eq('id', recompenseId)
      .maybeSingle()
    if (recFid) {
      // `rendreRecompense` ne rend que ce qui est effectivement pris : un
      // second appel est sans effet, et ne gonfle pas le compteur de la carte.
      if (recFid.utilisee_at) await rendreRecompense(db, recFid)
      // ⚠️ DÉJÀ LIBRE : vrai pour le client, anormal pour nous. Une récompense
      // figée sur ce rendez-vous et jamais consommée est une remise offerte
      // sans contrepartie, et c'est exactement le genre de chose qu'un silence
      // garde invisible pendant des semaines.
      else console.warn(`[${ou}] récompense déjà libre à l’annulation`, { recompenseId, ...refs })
      rendu.recompense = arr(recompenseMontant)
    }
  }

  return rendu
}
