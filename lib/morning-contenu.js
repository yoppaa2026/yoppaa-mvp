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

// Les mêmes filtres SQL que la page Morning : édition du jour uniquement, donc
// déjà retenue par le cron de 7h30. Un deal publié après coup vit sur la fiche,
// pas dans le Morning : le badge ne doit pas s'allumer pour lui.
export async function morningADuContenu(supabase, commune) {
  const codesPostaux = codesPostauxDe(commune)
  if (codesPostaux.size === 0) return false

  const today = new Date().toISOString().slice(0, 10)

  const [{ data: deals }, { data: actus }] = await Promise.all([
    supabase.from('yoppaa_deals')
      .select('id, commercant:commercants ( plan, statut_publication, adresse )')
      .eq('actif', true).eq('inclus_morning', true)
      .eq('date_deal', today).eq('statut_morning', 'envoye'),

    supabase.from('actualites')
      .select('id, commercant:commercants ( plan, statut_publication, adresse )')
      .not('commercant_id', 'is', null)
      .eq('actif', true).eq('inclus_gmy', true)
      .not('push_envoye_at', 'is', null)
      .lte('date_debut', today).gte('date_fin', today),
  ])

  if ((deals || []).some(d => commercantEligibleDeal(d.commercant, codesPostaux))) return true
  if ((actus || []).some(a => commercantEligibleActu(a.commercant, codesPostaux))) return true
  return false
}
