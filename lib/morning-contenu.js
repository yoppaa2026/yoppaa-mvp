// Y a-t-il quelque chose à lire dans le Good Morning d'aujourd'hui ?
//
// Sert au badge « Nouveau » du bandeau : il ne doit s'allumer que si l'édition
// du jour contient réellement un deal, une actu de commerçant ou une info d'un
// service public de la commune. Sinon le Yopper ouvre une page vide, et la
// prochaine fois il n'ouvrira plus.
//
// Requête volontairement maigre : on ne charge que ce qui sert à décider, pas
// de quoi afficher. Le résultat est mis en cache pour la journée par
// l'appelant, cette question n'a pas besoin d'être reposée à chaque écran.

import {
  codesPostauxDe,
  commercantEligibleDeal,
  commercantEligibleActu,
} from '@/lib/morning-eligibilite'
import { jourBruxelles } from '@/lib/timezone'

// Est-ce le PREMIER matin de cette actu dans l'édition ?
//
// 🔴 CE QUI A MOTIVÉ CETTE RÈGLE (Alex, 12/09). Une actu reste dans l'édition
// pendant toute sa fenêtre, et c'est voulu depuis le 23/07 : une nouvelle carte
// ou une fermeture annoncée restent utiles plusieurs jours, et une édition vide
// certains matins, c'est le Yopper qui n'ouvre plus.
//
// Mais deux choses en découlaient, et elles étaient fausses :
//   • la pastille violette se rallumait CHAQUE matin pour du déjà-vu ;
//   • la carte affichait « aujourd'hui » sur une actu vieille de quatre jours.
//
// Une page qui répète produit le même effet qu'une page vide, en moins honnête :
// au troisième matin, le Yopper n'ouvre plus. On ne touche donc pas à
// l'affichage, on cesse de faire passer du vieux pour du neuf.
//
// ⚠️ EN JOUR BELGE, jamais en temps universel : `push_envoye_at` est un instant,
// et entre minuit et deux heures du matin la date UTC est encore celle de la
// veille. La comparaison se fait sur la journée que le Yopper a sous les yeux.
//
// Le cron de 7h30 pose `push_envoye_at` UNE SEULE FOIS, au premier passage :
// c'est donc bien la date d'entrée de l'actu dans l'édition, pas sa dernière vue.
export function actuNouvelleCeMatin(pushEnvoyeAt, aujourdhui = jourBruxelles()) {
  if (!pushEnvoyeAt) return false
  return jourBruxelles(pushEnvoyeAt) === aujourdhui
}

// Les mêmes filtres SQL que la page Morning : édition du jour uniquement, donc
// déjà retenue par le cron de 7h30. Un deal publié après coup vit sur la fiche,
// pas dans le Morning : le badge ne doit pas s'allumer pour lui.
//
// ⚠️ CETTE FONCTION RÉPOND « Y A-T-IL DU NEUF », PAS « Y A-T-IL QUELQUE CHOSE ».
// C'est toute la correction du 12/09 : le badge ne réclame plus l'attention pour
// du contenu déjà lu. Un deal, lui, est neuf par construction (`date_deal` du
// jour) ; une actu ne l'est qu'à son premier matin.
export async function morningADuContenu(supabase, commune) {
  const codesPostaux = codesPostauxDe(commune)
  if (codesPostaux.size === 0) return false

  // ⚠️ EN HEURE BELGE : sinon le badge « Nouveau » cherche l'édition de la
  // VEILLE pendant les deux premières heures de la nuit.
  const today = jourBruxelles()

  const [{ data: deals }, { data: actus }] = await Promise.all([
    supabase.from('yoppaa_deals')
      .select('id, commercant:commercants ( plan, statut_publication, adresse )')
      .eq('actif', true).eq('inclus_morning', true)
      .eq('date_deal', today).eq('statut_morning', 'envoye'),

    // ⚠️ `push_envoye_at` EST DEMANDÉ, et pas seulement filtré : sans la colonne
    // dans le select, `actuNouvelleCeMatin` recevrait `undefined` et rendrait
    // false pour tout le monde. Le badge ne s'allumerait alors plus JAMAIS pour
    // une actu. C'est le défaut le plus fréquent de ce projet, et il ne fait
    // aucun bruit : la colonne absente d'un select.
    supabase.from('actualites')
      .select('id, push_envoye_at, commercant:commercants ( plan, statut_publication, adresse )')
      .not('commercant_id', 'is', null)
      .eq('actif', true).eq('inclus_gmy', true)
      .not('push_envoye_at', 'is', null)
      .lte('date_debut', today).gte('date_fin', today),
  ])

  if ((deals || []).some(d => commercantEligibleDeal(d.commercant, codesPostaux))) return true
  if ((actus || []).some(a => actuNouvelleCeMatin(a.push_envoye_at, today)
                              && commercantEligibleActu(a.commercant, codesPostaux))) return true
  return false
}
