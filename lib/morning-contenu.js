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
  adresseDeZone,
} from '@/lib/morning-eligibilite'
import { jourBruxelles } from '@/lib/timezone'
import { dealActifCeJour } from '@/lib/deals'
import { estRecurrente, COLONNES_RECURRENCE } from '@/lib/recurrence-promo'

// ─── LES DEALS DE L'ÉDITION, PROMOS RÉCURRENTES COMPRISES (03/11) ───────────
//
// 🔴 CE QUI A MOTIVÉ CETTE RÈGLE. Le Good Morning ne retenait un deal que le
// jour de sa `date_deal`, c'est-à-dire son PREMIER jour, puis le marquait
// « envoyé » pour toujours. Une promo « chaque mercredi » n'était annoncée
// qu'une fois ; pire, partie un mardi, elle était annoncée ce mardi-là, jour
// où elle ne valait rien.
//
// ✅ Décision d'Alex (03/11) : une promo récurrente revient dans l'édition
// CHAQUE jour où elle vaut, et compte dans la notification de 7 h 30 à chaque
// fois. C'est `dealActifCeJour` qui décide (la même règle que la fiche et le
// panier), jamais `date_deal`.
//
// Une promo à dates garde sa règle d'avant : son premier jour, une fois.
//
// ⚠️ LES COLONNES À DEMANDER pour juger. Une colonne absente d'un select ne
// lève aucune erreur : la promo serait jugée « sans récurrence » et sortirait
// de l'édition en silence.
export const COLONNES_DEAL_MORNING = `actif, date_deal, date_debut, date_fin, statut_morning, ${COLONNES_RECURRENCE}`

// Le filtre SQL qui ramène les candidats : les deals du jour, ET toutes les
// promos récurrentes (le jour se juge ensuite, ici, avec leur règle).
export function filtreDealsMorning(aujourdhui) {
  return `date_deal.eq.${aujourdhui},recurrence.not.is.null`
}

// Le cron de 7 h 30 l'annonce-t-il ce matin ? Une promo à dates : son premier
// jour, si elle n'a pas encore été annoncée. Une récurrente : chaque jour où
// elle revient.
export function dealAAnnoncer(deal, aujourdhui) {
  if (!deal || deal.actif === false) return false
  if (estRecurrente(deal)) return dealActifCeJour(deal, aujourdhui)
  return deal.date_deal === aujourdhui && deal.statut_morning === 'pending'
}

// Fait-il partie de l'édition affichée ce jour-là ? Seulement ce que le cron
// a retenu (`statut_morning = 'envoye'`), et pour une récurrente, seulement
// les jours où elle vaut.
export function dealDeLEdition(deal, aujourdhui) {
  if (!deal || deal.actif === false || deal.statut_morning !== 'envoye') return false
  return estRecurrente(deal) ? dealActifCeJour(deal, aujourdhui) : deal.date_deal === aujourdhui
}

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

// ─── LE COMMERCE D'UN DEAL OU D'UNE ACTU, LU DANS LA VUE PUBLIQUE ───────────
//
// 🔴 LE GOOD MORNING ÉTAIT VIDE POUR TOUS LES YOPPERS (relevé du 03/10, règles
// de la base lues par Alex). La page et la pastille demandaient le commerce
// par `commercant:commercants (…)`, c'est-à-dire dans la TABLE. Or un Yopper
// ne peut y lire que son propre commerce, ou tout s'il est admin. Pour tous
// les autres, le commerce revenait `null`, la règle d'éligibilité l'écartait,
// et l'édition restait vide. Pendant ce temps, le cron de 7 h 30 annonçait
// « N deals ce matin » à toute la commune.
// ⚠️ ET ÇA NE SE VOYAIT PAS DEPUIS LE COMPTE D'ALEX, administrateur.
//
// ✅ La vue `commercants_public` est la porte prévue pour le public : elle
// ne rend que les fiches publiées, ce que la règle d'éligibilité exige déjà.
// ⚠️ `essai_plan` ET `created_at` SONT DEMANDÉS : la règle lit le forfait
// effectif, et sans eux un commerce en essai serait jugé sur son forfait seul.
// La pastille ne les demandait pas.
// 🔴 PLUS D'`adresse` (28/10) : c'est le SIÈGE SOCIAL, il quitte la vue. La
// commune vient du lieu déclaré, posé par `attacherAdresseLieu`.
export const COLONNES_COMMERCE_MORNING =
  'id, nom, type, plan, essai_plan, created_at, statut_publication, logo_url, slug, telephone'

// Pose `adresse_lieu` (l'adresse qui situe le commerce dans une commune, voir
// `adresseDeZone`) sur chaque commerce. Partagée par la page, la pastille et
// le cron de 7h30 : la même règle partout.
// ⚠️ UN ÉCHEC SE DIT, et le commerce reste sans commune : il sort de l'édition
// plutôt que d'y entrer dans la mauvaise.
export async function attacherAdresseLieu(supabase, commerces) {
  const liste = (commerces || []).filter(Boolean)
  const ids = [...new Set(liste.map(c => c.id).filter(Boolean))]
  if (ids.length === 0) return commerces || []
  const { data, error } = await supabase
    .from('commercant_lieux')
    .select('commercant_id, type, adresse, principal, actif')
    .in('commercant_id', ids)
    .eq('actif', true)
  if (error) console.error('[morning] lecture des lieux impossible', error.message)
  const parCommerce = {}
  for (const l of (data || [])) (parCommerce[l.commercant_id] ||= []).push(l)
  return (commerces || []).map(c => (c ? { ...c, adresse_lieu: adresseDeZone(parCommerce[c.id] || []) } : c))
}

export async function rattacherCommerces(supabase, lignes) {
  const liste = lignes || []
  const ids = [...new Set(liste.map((l) => l?.commercant_id).filter(Boolean))]
  if (ids.length === 0) return liste.map((l) => ({ ...l, commercant: null }))

  const { data, error } = await supabase
    .from('commercants_public')
    .select(COLONNES_COMMERCE_MORNING)
    .in('id', ids)
  // ⚠️ UN ÉCHEC SE DIT. Sans commerce, rien n'est éligible et l'édition est
  // vide : c'est le bon affichage, mais il ne doit pas être muet au journal.
  if (error) console.error('[morning] lecture des commerces impossible', error.message)

  const commerces = await attacherAdresseLieu(supabase, data || [])
  const parId = new Map(commerces.map((c) => [c.id, c]))
  return liste.map((l) => ({ ...l, commercant: parId.get(l.commercant_id) || null }))
}

// Les mêmes filtres SQL que la page Morning : édition du jour uniquement, donc
// déjà retenue par le cron de 7h30. Un deal publié après coup vit sur la fiche,
// pas dans le Morning : le badge ne doit pas s'allumer pour lui.
//
// ⚠️ CETTE FONCTION RÉPOND « Y A-T-IL DU NEUF », PAS « Y A-T-IL QUELQUE CHOSE ».
// C'est toute la correction du 12/09 : le badge ne réclame plus l'attention pour
// du contenu déjà lu. Un deal, lui, est neuf par construction (`date_deal` du
// jour) ; une actu ne l'est qu'à son premier matin.
// ✅ (03/11) Une promo récurrente l'allume chaque jour où elle revient :
// Alex veut qu'elle compte à chaque fois, comme dans la notification.
export async function morningADuContenu(supabase, commune) {
  const codesPostaux = codesPostauxDe(commune)
  if (codesPostaux.size === 0) return false

  // ⚠️ EN HEURE BELGE : sinon le badge « Nouveau » cherche l'édition de la
  // VEILLE pendant les deux premières heures de la nuit.
  const today = jourBruxelles()

  const [{ data: dealsBruts }, { data: actusBruts }] = await Promise.all([
    supabase.from('yoppaa_deals')
      .select(`id, commercant_id, ${COLONNES_DEAL_MORNING}`)
      .eq('actif', true).eq('inclus_morning', true)
      .eq('statut_morning', 'envoye')
      .or(filtreDealsMorning(today)),

    // ⚠️ `push_envoye_at` EST DEMANDÉ, et pas seulement filtré : sans la colonne
    // dans le select, `actuNouvelleCeMatin` recevrait `undefined` et rendrait
    // false pour tout le monde. Le badge ne s'allumerait alors plus JAMAIS pour
    // une actu. C'est le défaut le plus fréquent de ce projet, et il ne fait
    // aucun bruit : la colonne absente d'un select.
    supabase.from('actualites')
      .select('id, push_envoye_at, commercant_id')
      .not('commercant_id', 'is', null)
      .eq('actif', true).eq('inclus_gmy', true)
      .not('push_envoye_at', 'is', null)
      .lte('date_debut', today).gte('date_fin', today),
  ])
  const [deals, actus] = await Promise.all([
    rattacherCommerces(supabase, (dealsBruts || []).filter(d => dealDeLEdition(d, today))),
    rattacherCommerces(supabase, actusBruts),
  ])

  if ((deals || []).some(d => commercantEligibleDeal(d.commercant, codesPostaux))) return true
  if ((actus || []).some(a => actuNouvelleCeMatin(a.push_envoye_at, today)
                              && commercantEligibleActu(a.commercant, codesPostaux))) return true
  return false
}
