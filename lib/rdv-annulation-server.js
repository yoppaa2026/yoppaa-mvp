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

import { recrediterBon } from './bons-cadeaux-server'
import { rendreRecompense } from './fidelite-recompense-server'

const arr = (n) => Math.round(Number(n || 0) * 100) / 100

/**
 * Rend le bon et la récompense posés sur un rendez-vous annulé.
 *
 * @param db                 client Supabase (service_role)
 * @param bonId, bonMontant  la part du bon à recréditer
 * @param recompenseId       la ligne de récompense à libérer
 * @param recompenseMontant  ce qu'elle valait, pour l'ANNONCE seulement
 * @param refs               { rdv_id } ou { commande_id }, jamais les deux
 * @param ou                 nom de l'appelant, pour les journaux
 *
 * Rend { bon, recompense } : les montants à ANNONCER, pas les gestes faits.
 */
export async function rendreAvantagesRdv(db, {
  bonId = null,
  bonMontant = 0,
  recompenseId = null,
  recompenseMontant = 0,
  refs = {},
  ou = 'rdv/annulation',
} = {}) {
  const rendu = { bon: 0, recompense: 0 }

  if (bonId && Number(bonMontant) > 0) {
    const rec = await recrediterBon(db, bonId, Number(bonMontant), refs)
    // ⚠️ ON LIT LE RÉSULTAT : un `await` qu'on n'écoute pas est un espoir, et
    // ici l'espoir vaut de l'argent que le Yopper a déjà payé.
    if (!rec?.ok) console.error(`[${ou}] re-crédit bon cadeau KO`, rec?.error, refs)
    // `deja_recredite` veut dire « quelqu'un d'autre l'a fait avant moi », pas
    // « rien n'est revenu ». L'argent EST sur le bon : on l'annonce.
    else rendu.bon = arr(bonMontant)
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
